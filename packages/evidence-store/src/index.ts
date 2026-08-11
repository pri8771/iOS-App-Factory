import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  AttemptIdSchema,
  EvidenceManifestV1Schema,
  EvidenceV1Schema,
  Sha256DigestSchema,
  type ArtifactRefV1,
  type AttemptId,
  type EvidenceManifestV1,
  type EvidenceV1,
  type Sha256Digest,
} from "@app-factory/contracts";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/;

export class EvidenceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceStoreError";
  }
}

export type EvidenceVerification = Readonly<{
  manifest: EvidenceManifestV1;
  manifestDigest: Sha256Digest;
  evidence: readonly EvidenceV1[];
  artifactCount: number;
}>;

export type EvidenceManifestRecord = Readonly<{
  manifest: EvidenceManifestV1;
  digest: Sha256Digest;
}>;

export type EvidenceManifestPage = Readonly<{
  records: readonly EvidenceManifestRecord[];
  nextAfterAttemptId: AttemptId | null;
  hasMore: boolean;
}>;

export type ListEvidenceManifestsOptions = Readonly<{
  afterAttemptId?: AttemptId | null;
  limit?: number;
}>;

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function assertAbsolute(path: string, label: string): void {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new EvidenceStoreError(`${label} must be a normalized absolute path`);
  }
}

function assertOwned(stats: Stats, label: string): void {
  const uid = currentUserId();
  if (uid !== undefined && stats.uid !== uid) {
    throw new EvidenceStoreError(`${label} is not owned by the current user`);
  }
}

function assertPrivateDirectory(path: string): void {
  const linkStats = lstatSync(path);
  if (linkStats.isSymbolicLink() || !linkStats.isDirectory()) {
    throw new EvidenceStoreError(`Evidence directory is not a real directory: ${path}`);
  }
  assertOwned(linkStats, path);
  if ((linkStats.mode & 0o077) !== 0) {
    throw new EvidenceStoreError(`Evidence directory is not private: ${path}`);
  }
}

function assertPrivateFile(path: string): void {
  const linkStats = lstatSync(path);
  if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
    throw new EvidenceStoreError(`Evidence path is not a real file: ${path}`);
  }
  assertOwned(linkStats, path);
  if ((linkStats.mode & 0o077) !== 0) {
    throw new EvidenceStoreError(`Evidence file is not private: ${path}`);
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { mode: PRIVATE_DIRECTORY_MODE });
  }
  assertPrivateDirectory(path);
}

function synchronizeDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function sha256(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

function canonicalJsonBytes(value: unknown): Buffer {
  // Evidence contracts contain only JSON values. Sorting object keys makes the
  // digest independent of construction order while retaining array order.
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return Buffer.from(`${JSON.stringify(normalize(value))}\n`, "utf8");
}

function safeChild(root: string, ...segments: readonly string[]): string {
  const path = join(root, ...segments);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!path.startsWith(prefix)) {
    throw new EvidenceStoreError("Evidence path escaped its store root");
  }
  return path;
}

function digestHex(digest: Sha256Digest): string {
  const match = DIGEST_PATTERN.exec(digest);
  if (match?.[1] === undefined) {
    throw new EvidenceStoreError(`Invalid evidence digest: ${digest}`);
  }
  return match[1];
}

function readPrivateFile(path: string): Buffer {
  assertPrivateFile(path);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeImmutable(path: string, bytes: Buffer, temporaryRoot: string): void {
  ensurePrivateDirectory(dirname(path));
  ensurePrivateDirectory(temporaryRoot);
  if (existsSync(path)) {
    if (!readPrivateFile(path).equals(bytes)) {
      throw new EvidenceStoreError(`Immutable evidence collision at ${path}`);
    }
    return;
  }

  const temporaryPath = safeChild(
    temporaryRoot,
    `immutable-${String(process.pid)}-${randomUUID()}`,
  );
  const descriptor = openSync(
    temporaryPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  try {
    // A hard-link publish is atomic and refuses to replace an existing path.
    linkSync(temporaryPath, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    if (!readPrivateFile(path).equals(bytes)) {
      throw new EvidenceStoreError(`Immutable evidence collision at ${path}`);
    }
  } finally {
    unlinkSync(temporaryPath);
  }
  synchronizeDirectory(dirname(path));
}

export class EvidenceStore {
  readonly #root: string;
  readonly #blobsRoot: string;
  readonly #manifestsRoot: string;
  readonly #temporaryRoot: string;

  constructor(rootPath: string) {
    assertAbsolute(rootPath, "Evidence root");
    ensurePrivateDirectory(rootPath);
    this.#root = realpathSync(rootPath);
    this.#blobsRoot = safeChild(this.#root, "blobs", "sha256");
    this.#manifestsRoot = safeChild(this.#root, "manifests");
    this.#temporaryRoot = safeChild(this.#root, "publication-temporary");
    ensurePrivateDirectory(safeChild(this.#root, "blobs"));
    ensurePrivateDirectory(this.#blobsRoot);
    ensurePrivateDirectory(this.#manifestsRoot);
    ensurePrivateDirectory(this.#temporaryRoot);
  }

  putBlob(bytes: Uint8Array): ArtifactRefV1["digest"] {
    const digest = sha256(bytes);
    const hex = digestHex(digest);
    const shard = safeChild(this.#blobsRoot, hex.slice(0, 2));
    ensurePrivateDirectory(shard);
    writeImmutable(safeChild(shard, hex.slice(2)), Buffer.from(bytes), this.#temporaryRoot);
    return digest;
  }

  putEvidence(value: unknown): Readonly<{ evidence: EvidenceV1; digest: Sha256Digest }> {
    const evidence = EvidenceV1Schema.parse(value);
    const bytes = canonicalJsonBytes(evidence);
    return { evidence, digest: this.putBlob(bytes) };
  }

  readBlob(digestInput: unknown): Buffer {
    const digest = Sha256DigestSchema.parse(digestInput);
    const hex = digestHex(digest);
    const path = safeChild(this.#blobsRoot, hex.slice(0, 2), hex.slice(2));
    const bytes = readPrivateFile(path);
    if (sha256(bytes) !== digest) {
      throw new EvidenceStoreError(`Evidence blob digest mismatch: ${digest}`);
    }
    return bytes;
  }

  commitManifest(value: unknown): EvidenceManifestV1 {
    const manifest = EvidenceManifestV1Schema.parse(value);
    this.verifyManifestValue(manifest);
    const path = this.manifestPath(manifest.attemptId);
    writeImmutable(path, canonicalJsonBytes(manifest), this.#temporaryRoot);
    return manifest;
  }

  readManifest(attemptId: AttemptId): EvidenceManifestV1 {
    return this.readManifestRecord(attemptId).manifest;
  }

  readManifestRecord(attemptId: AttemptId): EvidenceManifestRecord {
    const bytes = readPrivateFile(this.manifestPath(attemptId));
    const manifest = EvidenceManifestV1Schema.parse(JSON.parse(bytes.toString("utf8")));
    if (manifest.attemptId !== attemptId) {
      throw new EvidenceStoreError(
        "Evidence manifest identity does not match its immutable filename",
      );
    }
    if (!canonicalJsonBytes(manifest).equals(bytes)) {
      throw new EvidenceStoreError("Evidence manifest is not canonically encoded");
    }
    return {
      manifest,
      digest: sha256(bytes),
    };
  }

  findManifestRecord(attemptId: AttemptId): EvidenceManifestRecord | null {
    try {
      return this.readManifestRecord(attemptId);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return null;
      throw error;
    }
  }

  /**
   * Lists immutable manifest records without reading their referenced blobs.
   * Ordering is the canonical attempt UUID, which gives callers a stable,
   * restart-safe pagination cursor without introducing another mutable index.
   */
  listManifests(options: ListEvidenceManifestsOptions = {}): EvidenceManifestPage {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new EvidenceStoreError("Evidence manifest page limit must be between 1 and 1000");
    }
    const afterAttemptId =
      options.afterAttemptId === undefined || options.afterAttemptId === null
        ? null
        : AttemptIdSchema.parse(options.afterAttemptId);
    const attemptIds = readdirSync(this.#manifestsRoot, { withFileTypes: true })
      .map((entry) => {
        if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
          throw new EvidenceStoreError(
            `Evidence manifest directory contains an unexpected entry: ${entry.name}`,
          );
        }
        return AttemptIdSchema.parse(entry.name.slice(0, -".json".length));
      })
      .sort();
    const eligible = attemptIds.filter(
      (attemptId) => afterAttemptId === null || attemptId > afterAttemptId,
    );
    const selected = eligible.slice(0, limit);
    return {
      records: selected.map((attemptId) => this.readManifestRecord(attemptId)),
      nextAfterAttemptId: selected.at(-1) ?? afterAttemptId,
      hasMore: eligible.length > selected.length,
    };
  }

  verify(attemptId: AttemptId): EvidenceVerification {
    return this.verifyManifestValue(this.readManifest(attemptId));
  }

  private manifestPath(attemptId: AttemptId): string {
    return safeChild(this.#manifestsRoot, `${attemptId}.json`);
  }

  private verifyManifestValue(manifest: EvidenceManifestV1): EvidenceVerification {
    const evidence: EvidenceV1[] = [];
    const evidenceIds = new Set<string>();
    const entryDigests = new Set<string>();
    let artifactCount = 0;

    for (const entry of manifest.entries) {
      if (evidenceIds.has(entry.evidenceId) || entryDigests.has(entry.digest)) {
        throw new EvidenceStoreError("Evidence manifest contains duplicate entries");
      }
      evidenceIds.add(entry.evidenceId);
      entryDigests.add(entry.digest);
      const parsed = EvidenceV1Schema.parse(
        JSON.parse(this.readBlob(entry.digest).toString("utf8")),
      );
      if (parsed.evidenceId !== entry.evidenceId || parsed.attemptId !== manifest.attemptId) {
        throw new EvidenceStoreError("Evidence manifest entry identity mismatch");
      }
      if (
        canonicalJsonBytes(parsed.subject).toString() !==
        canonicalJsonBytes(manifest.subject).toString()
      ) {
        throw new EvidenceStoreError("Evidence subject does not match its manifest");
      }
      for (const artifact of parsed.artifacts) {
        const bytes = this.readBlob(artifact.digest);
        if (bytes.byteLength !== artifact.byteLength) {
          throw new EvidenceStoreError(`Artifact byte length mismatch: ${artifact.digest}`);
        }
        artifactCount += 1;
      }
      evidence.push(parsed);
    }

    const kinds = new Set(evidence.map((item) => item.kind));
    for (const requiredKind of manifest.requiredKinds) {
      if (!kinds.has(requiredKind)) {
        throw new EvidenceStoreError(`Required evidence kind is missing: ${requiredKind}`);
      }
    }
    return {
      manifest,
      manifestDigest: sha256(canonicalJsonBytes(manifest)),
      evidence,
      artifactCount,
    };
  }
}
