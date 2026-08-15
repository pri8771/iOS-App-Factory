import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  IsoInstantSchema,
  Sha256DigestSchema,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME,
  backupFactoryDatabase,
  inspectFactoryDatabase,
  openMigratedFactoryDatabase,
} from "@app-factory/kernel";
import type Database from "better-sqlite3";
import { z } from "zod";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_DATABASE_BYTES = 128 * 1024 * 1024 * 1024;
const COPY_BUFFER_BYTES = 1024 * 1024;
const DATABASE_FILE = FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME;
const MANIFEST_FILE = "recovery-manifest.json";
const RECOVERY_STATE_DIRECTORY = "recovery-state";
const STATE_REVISION_PATTERN = /^(\d{16})\.json$/;

/**
 * OS-generated metadata entries (from Finder, Spotlight, or volume
 * bookkeeping) that a fail-closed directory scan must tolerate rather than
 * reject. This denylist is intentionally narrow and exact: a single Finder
 * visit must not permanently brick recovery-state replay. Any entry that
 * does not match must still fail closed — do not broaden this to "ignore
 * anything unrecognized".
 */
const IGNORABLE_OS_METADATA_ENTRIES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
]);

function isIgnorableOsMetadataEntry(name: string): boolean {
  return IGNORABLE_OS_METADATA_ENTRIES.has(name) || name.startsWith("._");
}

export class RecoveryManagerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RecoveryManagerError";
  }
}

const EvidenceIndexEntryV1Schema = z.strictObject({
  digest: Sha256DigestSchema,
  logicalName: z.string().min(1).max(500),
});
export type EvidenceIndexEntryV1 = z.infer<typeof EvidenceIndexEntryV1Schema>;

export const RecoveryManifestV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    backupId: z.uuid(),
    createdAt: IsoInstantSchema,
    databaseFile: z.literal(DATABASE_FILE),
    databaseDigest: Sha256DigestSchema,
    databaseByteLength: z.number().int().positive().max(MAX_DATABASE_BYTES),
    databasePageCount: z.number().int().positive().safe(),
    sqliteVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    evidence: z.array(EvidenceIndexEntryV1Schema).max(100_000),
  })
  .superRefine((manifest, context) => {
    const digests = manifest.evidence.map((entry) => entry.digest);
    if (new Set(digests).size !== digests.length) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "evidence digests must be unique",
      });
    }
  });
export type RecoveryManifestV1 = z.infer<typeof RecoveryManifestV1Schema>;

export const RecoveryStateV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    revision: z.number().int().positive().safe(),
    status: z.enum(["quarantined", "reconciled", "released"]),
    sourceManifestDigest: Sha256DigestSchema,
    restoredDatabaseDigest: Sha256DigestSchema.nullable(),
    restoredAt: IsoInstantSchema,
    reconciledAt: IsoInstantSchema.nullable(),
    reconciliationEvidenceDigest: Sha256DigestSchema.nullable(),
    releasedAt: IsoInstantSchema.nullable(),
  })
  .superRefine((state, context) => {
    if (state.status === "reconciled" || state.status === "released") {
      if (
        state.restoredDatabaseDigest === null ||
        state.reconciledAt === null ||
        state.reconciliationEvidenceDigest === null
      ) {
        context.addIssue({ code: "custom", message: "reconciled recovery state is incomplete" });
      }
      if (state.status === "reconciled" && state.releasedAt !== null) {
        context.addIssue({
          code: "custom",
          message: "reconciled recovery state cannot be released",
        });
      }
      if (state.status === "released" && state.releasedAt === null) {
        context.addIssue({ code: "custom", message: "released recovery state is incomplete" });
      }
    } else if (
      state.reconciledAt !== null ||
      state.reconciliationEvidenceDigest !== null ||
      state.releasedAt !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "quarantined recovery state cannot claim reconciliation",
      });
    }
  });
export type RecoveryStateV1 = z.infer<typeof RecoveryStateV1Schema>;

export type RecoveryBundleV1 = Readonly<{
  directory: string;
  manifest: RecoveryManifestV1;
  manifestDigest: Sha256Digest;
}>;

export type RestoreResultV1 = Readonly<{
  runtimeDirectory: string;
  databasePath: string;
  sourceManifestDigest: Sha256Digest;
  restoredDatabaseDigest: Sha256Digest;
  verifiedEvidenceCount: number;
  recoveryStateRevision: number;
  integrity: "ok";
  reconciliationRequired: true;
}>;

export type RecoveryVerificationOptions = Readonly<{
  /** Test/observability seam; mutations are detected before success. */
  quiescenceCheckpoint?: () => void;
  /** Test/observability seam; growth after pinning must still be bounded. */
  manifestReadCheckpoint?: () => void;
}>;

export type RestoreRecoveryOptions = RecoveryVerificationOptions &
  Readonly<{
    afterRuntimeStagingCreated?: () => void;
    beforeDatabaseCopy?: () => void;
  }>;

type PinnedFile = Readonly<{ descriptor: number; stats: Stats }>;

function fail(message: string): never {
  throw new RecoveryManagerError(message);
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(normalize(value))}\n`;
}

function digestBytes(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

function assertNormalizedAbsolute(path: string, label: string): void {
  if (!isAbsolute(path) || resolve(path) !== path) {
    fail(`${label} must be a normalized absolute path`);
  }
}

function assertOwned(stats: Stats, label: string): void {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid !== undefined && stats.uid !== uid) fail(`${label} is not owned by the current user`);
}

function assertPrivateDirectory(path: string, label: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) fail(`${label} must be a real directory`);
  assertOwned(stats, label);
  if ((stats.mode & 0o077) !== 0) fail(`${label} must use private permissions`);
}

function assertRegularIdentity(stats: Stats, label: string): void {
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) {
    fail(`${label} must be a single-link regular file`);
  }
  assertOwned(stats, label);
  if ((stats.mode & 0o077) !== 0) fail(`${label} must use private permissions`);
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function openPinnedPrivateFile(path: string, label: string, maximumBytes: number): PinnedFile {
  const pathStats = lstatSync(path);
  assertRegularIdentity(pathStats, label);
  if (pathStats.size > maximumBytes) fail(`${label} exceeds the allowed size`);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const descriptorStats = fstatSync(descriptor);
    assertRegularIdentity(descriptorStats, label);
    if (!sameIdentity(pathStats, descriptorStats)) fail(`${label} changed before it was opened`);
    return { descriptor, stats: descriptorStats };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assertPinnedUnchanged(file: PinnedFile, label: string): void {
  const after = fstatSync(file.descriptor);
  if (!sameIdentity(file.stats, after)) fail(`${label} changed while it was read`);
}

function digestPinnedFile(file: PinnedFile, expectedBytes: number, label: string): Sha256Digest {
  if (file.stats.size !== expectedBytes) fail(`${label} size does not match its manifest`);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let total = 0;
  try {
    for (;;) {
      const remainingWithSentinel = expectedBytes - total + 1;
      if (remainingWithSentinel <= 0) fail(`${label} grew beyond its manifest size`);
      const read = readSync(
        file.descriptor,
        buffer,
        0,
        Math.min(buffer.byteLength, remainingWithSentinel),
        null,
      );
      if (read === 0) break;
      total += read;
      if (total > expectedBytes) fail(`${label} grew beyond its manifest size`);
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    buffer.fill(0);
  }
  if (total !== expectedBytes) fail(`${label} ended before its manifest size`);
  assertPinnedUnchanged(file, label);
  return Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`);
}

function inspectPrivateFile(path: string, expectedBytes: number, label: string): Sha256Digest {
  const file = openPinnedPrivateFile(path, label, expectedBytes);
  try {
    return digestPinnedFile(file, expectedBytes, label);
  } finally {
    closeSync(file.descriptor);
  }
}

function synchronizeDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusive(path: string, bytes: Buffer): void {
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function readBoundedPrivateFile(path: string, maximumBytes: number, afterPin?: () => void): Buffer {
  const file = openPinnedPrivateFile(path, path, maximumBytes);
  const expectedBytes = Number(file.stats.size);
  const bytes = Buffer.allocUnsafe(expectedBytes + 1);
  let total = 0;
  try {
    afterPin?.();
    for (;;) {
      const read = readSync(file.descriptor, bytes, total, bytes.byteLength - total, null);
      if (read === 0) break;
      total += read;
      if (total > expectedBytes) fail(`${path} grew beyond the bounded read`);
    }
    if (total !== expectedBytes) fail(`${path} read length changed unexpectedly`);
    assertPinnedUnchanged(file, path);
    return Buffer.from(bytes.subarray(0, expectedBytes));
  } finally {
    bytes.fill(0);
    closeSync(file.descriptor);
  }
}

function parseCanonicalInstant(value: unknown): IsoInstant {
  return IsoInstantSchema.parse(value);
}

function normalizedEvidence(values: readonly unknown[]): EvidenceIndexEntryV1[] {
  const entries = values.map((value) => EvidenceIndexEntryV1Schema.parse(value));
  entries.sort((left, right) =>
    left.digest === right.digest
      ? left.logicalName.localeCompare(right.logicalName)
      : left.digest.localeCompare(right.digest),
  );
  if (new Set(entries.map((entry) => entry.digest)).size !== entries.length) {
    fail("evidence index contains duplicate digests");
  }
  return entries;
}

function recoveryStateDirectory(runtimeDirectory: string): string {
  return join(runtimeDirectory, RECOVERY_STATE_DIRECTORY);
}

function stateFilename(revision: number): string {
  return `${String(revision).padStart(16, "0")}.json`;
}

function writeRecoveryState(runtimeDirectory: string, stateValue: RecoveryStateV1): void {
  const state = RecoveryStateV1Schema.parse(stateValue);
  const directory = recoveryStateDirectory(runtimeDirectory);
  if (!existsSync(directory)) mkdirSync(directory, { mode: PRIVATE_DIRECTORY_MODE });
  assertPrivateDirectory(directory, "recovery state directory");
  const finalPath = join(directory, stateFilename(state.revision));
  const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
  writeExclusive(temporaryPath, Buffer.from(canonicalJson(state), "utf8"));
  try {
    linkSync(temporaryPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      fail("recovery state compare-and-set lost a concurrent race");
    }
    throw error;
  } finally {
    unlinkSync(temporaryPath);
  }
  synchronizeDirectory(directory);
}

export function readRecoveryState(runtimeDirectory: string): RecoveryStateV1 | null {
  assertNormalizedAbsolute(runtimeDirectory, "runtime directory");
  const directory = recoveryStateDirectory(runtimeDirectory);
  if (!existsSync(directory)) return null;
  assertPrivateDirectory(directory, "recovery state directory");
  const revisions = readdirSync(directory)
    .filter((name) => !isIgnorableOsMetadataEntry(name))
    .map((name) => {
      const match = STATE_REVISION_PATTERN.exec(name);
      if (match?.[1] === undefined) fail(`unexpected recovery state entry: ${name}`);
      return { name, revision: Number(match[1]) };
    })
    .sort((left, right) => left.revision - right.revision);
  if (revisions.length === 0) fail("recovery state directory is empty");
  for (const [index, entry] of revisions.entries()) {
    if (entry.revision !== index + 1) fail("recovery state revision history is not contiguous");
  }
  const latest = revisions.at(-1);
  if (latest === undefined) fail("recovery state revision is unavailable");
  const bytes = readBoundedPrivateFile(join(directory, latest.name), MAX_MANIFEST_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("recovery state is not valid JSON");
  }
  const state = RecoveryStateV1Schema.parse(parsed);
  if (state.revision !== latest.revision || canonicalJson(state) !== bytes.toString("utf8")) {
    fail("recovery state revision is not canonical or has the wrong identity");
  }
  return state;
}

export async function createRecoveryBundle(
  input: Readonly<{
    database: Database.Database;
    destinationDirectory: string;
    createdAt: unknown;
    evidence: readonly unknown[];
  }>,
): Promise<RecoveryBundleV1> {
  assertNormalizedAbsolute(input.destinationDirectory, "recovery destination");
  const createdAt = parseCanonicalInstant(input.createdAt);
  const evidence = normalizedEvidence(input.evidence);
  if (existsSync(input.destinationDirectory)) fail("recovery destination already exists");
  mkdirSync(input.destinationDirectory, { mode: PRIVATE_DIRECTORY_MODE });
  assertPrivateDirectory(input.destinationDirectory, "recovery destination");

  const databasePath = join(input.destinationDirectory, DATABASE_FILE);
  writeExclusive(databasePath, Buffer.alloc(0));
  const backup = await backupFactoryDatabase(input.database, databasePath);
  chmodSync(databasePath, PRIVATE_FILE_MODE);
  const databaseStats = lstatSync(databasePath);
  assertRegularIdentity(databaseStats, "database backup");
  if (databaseStats.size < 1 || databaseStats.size > MAX_DATABASE_BYTES) {
    fail("database backup has an unsafe size");
  }
  const manifest = RecoveryManifestV1Schema.parse({
    schemaVersion: 1,
    backupId: randomUUID(),
    createdAt,
    databaseFile: DATABASE_FILE,
    databaseDigest: inspectPrivateFile(databasePath, databaseStats.size, "database backup"),
    databaseByteLength: databaseStats.size,
    databasePageCount: backup.pageCount,
    sqliteVersion: backup.sqliteVersion,
    evidence,
  });
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  writeExclusive(join(input.destinationDirectory, MANIFEST_FILE), manifestBytes);
  synchronizeDirectory(input.destinationDirectory);
  return {
    directory: input.destinationDirectory,
    manifest,
    manifestDigest: digestBytes(manifestBytes),
  };
}

export async function verifyRecoveryBundle(
  directory: string,
  expectedManifestDigestValue: unknown,
  verifyEvidence: (entry: EvidenceIndexEntryV1) => boolean | Promise<boolean>,
  options: RecoveryVerificationOptions = {},
): Promise<RecoveryBundleV1> {
  assertNormalizedAbsolute(directory, "recovery bundle");
  const expectedManifestDigest = Sha256DigestSchema.parse(expectedManifestDigestValue);
  assertPrivateDirectory(directory, "recovery bundle");
  const manifestBytes = readBoundedPrivateFile(
    join(directory, MANIFEST_FILE),
    MAX_MANIFEST_BYTES,
    options.manifestReadCheckpoint,
  );
  const manifestDigest = digestBytes(manifestBytes);
  if (manifestDigest !== expectedManifestDigest) {
    fail("recovery manifest does not match its external trust anchor");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail("recovery manifest is not valid JSON");
  }
  const manifest = RecoveryManifestV1Schema.parse(decoded);
  if (canonicalJson(manifest) !== manifestBytes.toString("utf8")) {
    fail("recovery manifest is not canonical");
  }
  options.quiescenceCheckpoint?.();
  const databasePath = join(directory, manifest.databaseFile);
  if (
    inspectPrivateFile(databasePath, manifest.databaseByteLength, "database backup") !==
    manifest.databaseDigest
  ) {
    fail("database backup digest mismatch");
  }
  for (const entry of manifest.evidence) {
    if (!(await verifyEvidence(entry))) {
      fail(`required evidence is unavailable or invalid: ${entry.digest}`);
    }
  }
  return { directory, manifest, manifestDigest };
}

function copyPinnedDatabase(
  sourcePath: string,
  destinationPath: string,
  expectedBytes: number,
  expectedDigest: Sha256Digest,
): void {
  const source = openPinnedPrivateFile(sourcePath, "database backup", expectedBytes);
  if (source.stats.size !== expectedBytes) fail("database backup size does not match its manifest");
  const destination = openSync(
    destinationPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  );
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let copied = 0;
  try {
    for (;;) {
      const remainingWithSentinel = expectedBytes - copied + 1;
      if (remainingWithSentinel <= 0) fail("database backup grew during restore");
      const read = readSync(
        source.descriptor,
        buffer,
        0,
        Math.min(buffer.byteLength, remainingWithSentinel),
        null,
      );
      if (read === 0) break;
      copied += read;
      if (copied > expectedBytes) fail("database backup grew during restore");
      hash.update(buffer.subarray(0, read));
      let offset = 0;
      while (offset < read) {
        const written = writeSync(destination, buffer, offset, read - offset);
        if (written < 1) fail("database restore made no write progress");
        offset += written;
      }
    }
    if (copied !== expectedBytes) fail("database backup ended during restore");
    assertPinnedUnchanged(source, "database backup");
    if (
      Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`) !== expectedDigest ||
      fstatSync(destination).size !== expectedBytes
    ) {
      fail("restored database bytes do not match the recovery manifest");
    }
    fsyncSync(destination);
  } finally {
    buffer.fill(0);
    closeSync(source.descriptor);
    closeSync(destination);
  }
}

function removeOwnedTemporary(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function restoreRecoveryBundle(
  input: Readonly<{
    bundleDirectory: string;
    expectedManifestDigest: unknown;
    runtimeDirectory: string;
    verifyEvidence: (entry: EvidenceIndexEntryV1) => boolean | Promise<boolean>;
    restoredAt: unknown;
  }>,
  options: RestoreRecoveryOptions = {},
): Promise<RestoreResultV1> {
  const bundle = await verifyRecoveryBundle(
    input.bundleDirectory,
    input.expectedManifestDigest,
    input.verifyEvidence,
    options,
  );
  const restoredAt = parseCanonicalInstant(input.restoredAt);
  assertNormalizedAbsolute(input.runtimeDirectory, "runtime destination");
  if (existsSync(input.runtimeDirectory)) fail("runtime destination must not already exist");
  const runtimeParent = dirname(input.runtimeDirectory);
  assertPrivateDirectory(runtimeParent, "runtime destination parent");
  const runtimeStaging = join(
    runtimeParent,
    `.${basename(input.runtimeDirectory)}.restore-${randomUUID()}`,
  );
  mkdirSync(runtimeStaging, { mode: PRIVATE_DIRECTORY_MODE });
  assertPrivateDirectory(runtimeStaging, "runtime restore staging directory");
  options.afterRuntimeStagingCreated?.();
  writeRecoveryState(runtimeStaging, {
    schemaVersion: 1,
    revision: 1,
    status: "quarantined",
    sourceManifestDigest: bundle.manifestDigest,
    restoredDatabaseDigest: null,
    restoredAt,
    reconciledAt: null,
    reconciliationEvidenceDigest: null,
    releasedAt: null,
  });

  options.beforeDatabaseCopy?.();
  const source = join(bundle.directory, bundle.manifest.databaseFile);
  const staging = join(runtimeStaging, `.restore-${randomUUID()}.sqlite3`);
  const validated = join(runtimeStaging, `.validated-${randomUUID()}.sqlite3`);
  const destination = join(runtimeStaging, DATABASE_FILE);
  copyPinnedDatabase(
    source,
    staging,
    bundle.manifest.databaseByteLength,
    bundle.manifest.databaseDigest,
  );

  const database = openMigratedFactoryDatabase(staging, { fileMustExist: true });
  try {
    inspectFactoryDatabase(database);
    writeExclusive(validated, Buffer.alloc(0));
    await backupFactoryDatabase(database, validated);
    chmodSync(validated, PRIVATE_FILE_MODE);
  } finally {
    database.close();
  }
  const validatedStats = lstatSync(validated);
  assertRegularIdentity(validatedStats, "validated restored database");
  if (validatedStats.size < 1 || validatedStats.size > MAX_DATABASE_BYTES) {
    fail("validated restored database has an unsafe size");
  }
  const restoredDatabaseDigest = inspectPrivateFile(
    validated,
    validatedStats.size,
    "validated restored database",
  );
  renameSync(validated, destination);
  synchronizeDirectory(runtimeStaging);
  writeRecoveryState(runtimeStaging, {
    schemaVersion: 1,
    revision: 2,
    status: "quarantined",
    sourceManifestDigest: bundle.manifestDigest,
    restoredDatabaseDigest,
    restoredAt,
    reconciledAt: null,
    reconciliationEvidenceDigest: null,
    releasedAt: null,
  });
  removeOwnedTemporary(staging);
  removeOwnedTemporary(`${staging}-wal`);
  removeOwnedTemporary(`${staging}-shm`);
  synchronizeDirectory(runtimeStaging);
  renameSync(runtimeStaging, input.runtimeDirectory);
  synchronizeDirectory(runtimeParent);

  return {
    runtimeDirectory: input.runtimeDirectory,
    databasePath: join(input.runtimeDirectory, DATABASE_FILE),
    sourceManifestDigest: bundle.manifestDigest,
    restoredDatabaseDigest,
    verifiedEvidenceCount: bundle.manifest.evidence.length,
    recoveryStateRevision: 2,
    integrity: "ok",
    reconciliationRequired: true,
  };
}

export function completeRecoveryReconciliation(
  input: Readonly<{
    runtimeDirectory: string;
    expectedManifestDigest: unknown;
    expectedDatabaseDigest: unknown;
    reconciliationEvidenceDigest: unknown;
    reconciledAt: unknown;
    verifyReconciliationEvidence: (evidenceDigest: Sha256Digest, state: RecoveryStateV1) => boolean;
  }>,
): RecoveryStateV1 {
  const state = readRecoveryState(input.runtimeDirectory);
  if (state === null || state.status !== "quarantined" || state.restoredDatabaseDigest === null) {
    fail("runtime does not have a completed quarantined restore to reconcile");
  }
  const expectedManifestDigest = Sha256DigestSchema.parse(input.expectedManifestDigest);
  const expectedDatabaseDigest = Sha256DigestSchema.parse(input.expectedDatabaseDigest);
  if (
    state.sourceManifestDigest !== expectedManifestDigest ||
    state.restoredDatabaseDigest !== expectedDatabaseDigest
  ) {
    fail("recovery reconciliation is not bound to the restored runtime");
  }
  const databasePath = join(input.runtimeDirectory, DATABASE_FILE);
  const databaseStats = lstatSync(databasePath);
  assertRegularIdentity(databaseStats, "restored database");
  if (
    inspectPrivateFile(databasePath, databaseStats.size, "restored database") !==
    expectedDatabaseDigest
  ) {
    fail("restored database changed before reconciliation completed");
  }
  const reconciliationEvidenceDigest = Sha256DigestSchema.parse(input.reconciliationEvidenceDigest);
  if (!input.verifyReconciliationEvidence(reconciliationEvidenceDigest, state)) {
    fail("recovery reconciliation evidence could not be verified");
  }
  const reconciledAt = parseCanonicalInstant(input.reconciledAt);
  if (reconciledAt < state.restoredAt) fail("reconciliation cannot precede restore");
  const reconciled = RecoveryStateV1Schema.parse({
    ...state,
    revision: state.revision + 1,
    status: "reconciled",
    reconciledAt,
    reconciliationEvidenceDigest,
    releasedAt: null,
  });
  writeRecoveryState(input.runtimeDirectory, reconciled);
  return reconciled;
}

export function assertRuntimeRecoveryReady(runtimeDirectory: string): void {
  const state = readRecoveryState(runtimeDirectory);
  if (state === null) return;
  if (state.status === "released") return;
  if (state.status !== "reconciled" || state.restoredDatabaseDigest === null) {
    fail("restored runtime is quarantined pending external-state reconciliation");
  }
  const databasePath = join(runtimeDirectory, DATABASE_FILE);
  const stats = lstatSync(databasePath);
  assertRegularIdentity(stats, "restored database");
  if (
    inspectPrivateFile(databasePath, stats.size, "restored database") !==
    state.restoredDatabaseDigest
  ) {
    fail("reconciled runtime database digest changed");
  }
}

/**
 * Consumes a reconciled restore exactly once before the daemon opens the
 * database for normal writes. Later restarts accept the immutable released
 * revision because expected runtime mutations have made the backup digest
 * intentionally stale.
 */
export function releaseRuntimeRecoveryQuarantine(
  input: Readonly<{
    runtimeDirectory: string;
    releasedAt: unknown;
  }>,
): RecoveryStateV1 | null {
  const state = readRecoveryState(input.runtimeDirectory);
  if (state === null) return null;
  if (state.status === "released") return state;
  assertRuntimeRecoveryReady(input.runtimeDirectory);
  if (state.status !== "reconciled" || state.reconciledAt === null) {
    fail("runtime recovery has not been reconciled");
  }
  const releasedAt = parseCanonicalInstant(input.releasedAt);
  if (releasedAt < state.reconciledAt) fail("recovery release cannot precede reconciliation");
  const released = RecoveryStateV1Schema.parse({
    ...state,
    revision: state.revision + 1,
    status: "released",
    releasedAt,
  });
  writeRecoveryState(input.runtimeDirectory, released);
  return released;
}
