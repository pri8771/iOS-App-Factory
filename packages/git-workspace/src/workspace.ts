import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const DEFAULT_MAX_CHANGED_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DIFF_BYTES = 5 * 1024 * 1024;
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const MARKER_FILE = "app-factory-owner.json";
const MIRROR_MARKER_FILE = "app-factory-mirror.json";
const IMMUTABLE_MIRROR_BINDING_FILE = "app-factory-immutable-binding.json";
const PUBLICATION_ROOT = "publication-intents";

type WorkspaceKind = "attempt" | "verification";

type MirrorMarker = Readonly<{
  schemaVersion: 1;
  repositoryId: string;
  sourceRepositoryPath: string;
  mirrorPath: string;
}>;

type MirrorPublicationIntent = MirrorMarker & Readonly<{ kind: "mirror-publication" }>;

export type ImmutableMirrorBinding = Readonly<{
  schemaVersion: 1;
  kind: "prepared-immutable-mirror";
  repositoryId: string;
  sourceRepositoryPath: string;
  sourceIdentityDigest: string;
  mirrorPath: string;
  baseCommit: string;
  baseTree: string;
}>;

type WorkspacePublicationIntent = Readonly<{
  schemaVersion: 1;
  kind: "workspace-publication";
  workspaceKind: WorkspaceKind;
  repositoryId: string;
  attemptId: string;
  runtimeRoot: string;
  mirrorPath: string;
  worktreePath: string;
  baseSha: string;
  initialHeadSha: string;
  candidateTreeId: string | null;
  ownershipNonce: string;
  readOnly: boolean;
}>;

export type FactoryMirror = MirrorMarker &
  Readonly<{
    runtimeRoot: string;
  }>;

export type FactoryWorkspaceRecord = Readonly<{
  schemaVersion: 1;
  kind: WorkspaceKind;
  repositoryId: string;
  attemptId: string;
  runtimeRoot: string;
  mirrorPath: string;
  worktreePath: string;
  gitDirectoryPath: string;
  baseSha: string;
  initialHeadSha: string;
  candidateTreeId: string | null;
  ownershipNonce: string;
  readOnly: boolean;
}>;

export type EnsureMirrorInput = Readonly<{
  sourceRepositoryPath: string;
  runtimeRoot: string;
  repositoryId: string;
}>;

export type PrepareImmutableMirrorInput = EnsureMirrorInput &
  Readonly<{
    sourceIdentityDigest: string;
    baseCommit: string;
    baseTree: string;
  }>;

export type CandidatePolicy = Readonly<{
  authorizedScopes: readonly string[];
  maxChangedFileBytes?: number;
  maxDiffBytes?: number;
}>;

export type NormalizedCandidatePolicy = Readonly<{
  authorizedScopes: readonly string[];
  maxChangedFileBytes: number;
  maxDiffBytes: number;
}>;

export type ChangedPath = Readonly<{
  status: "A" | "C" | "D" | "M" | "R" | "T" | "U" | "X" | "B";
  path: string;
  oldMode: string;
  newMode: string;
  oldObjectId: string;
  newObjectId: string;
  sizeBytes: number | null;
}>;

export type CandidateVerification = Readonly<{
  attemptId: string;
  baseSha: string;
  attemptHeadSha: string;
  candidateTreeId: string;
  changedPaths: readonly ChangedPath[];
  diffBytes: number;
  totalChangedFileBytes: number;
  diffDigest: `sha256:${string}`;
  treeDigest: `sha256:${string}`;
}>;

export type BrokerCommitRecord = Readonly<{
  schemaVersion: 1;
  attemptId: string;
  attemptMarker: string;
  refName: string;
  baseSha: string;
  candidateTreeId: string;
  diffDigest: `sha256:${string}`;
  commitSha: string;
  commitDigest: `sha256:${string}`;
}>;

export type BrokerCommitExpectation = Readonly<{
  attemptId: string;
  baseSha: string;
  candidateTreeId: string;
  diffDigest: `sha256:${string}`;
}>;

export type BrokerCommitMutationGuard = () => void;

export type GitWorkspaceManagerOptions = Readonly<{
  gitExecutable?: string;
  verificationCheckpoint?: (worktreePath: string) => void;
  publicationCheckpoint?: (
    phase:
      | "mirror-after-intent"
      | "mirror-after-git"
      | "mirror-after-marker"
      | "workspace-after-intent"
      | "workspace-after-git"
      | "workspace-after-marker",
    targetPath: string,
  ) => void;
}>;

type GitInvocationOptions = Readonly<{
  env?: Readonly<Record<string, string>>;
  input?: Buffer;
}>;

type GitResult = Readonly<{
  status: number;
  stdout: Buffer;
  stderr: Buffer;
}>;

type RawChangedPath = Omit<ChangedPath, "sizeBytes">;

type TreeEntry = Readonly<{
  mode: string;
  type: string;
  objectId: string;
  path: string;
}>;

type WorkingChange = Readonly<{
  status: "A" | "D" | "M" | "T";
  path: string;
}>;

type WorkingEntrySnapshot = Readonly<{
  path: string;
  mode: "100644" | "100755" | "120000";
  bytes: Buffer;
  digest: `sha256:${string}`;
  sizeBytes: number;
}>;

export class GitWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitWorkspaceError";
  }
}

export function isExplicitGitSha(value: string): boolean {
  return SHA_PATTERN.test(value);
}

function assertExplicitSha(value: string, label: string): void {
  if (!isExplicitGitSha(value)) {
    throw new GitWorkspaceError(
      `${label} must be an explicit lowercase 40- or 64-character Git SHA`,
    );
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER_PATTERN.test(value) || value === "." || value === "..") {
    throw new GitWorkspaceError(`${label} contains unsafe characters`);
  }
}

function assertNormalizedAbsolute(path: string, label: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || path.endsWith(sep)) {
    throw new GitWorkspaceError(`${label} must be a normalized absolute path`);
  }
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function assertOwned(stats: Stats, label: string): void {
  const uid = currentUserId();
  if (uid !== undefined && stats.uid !== uid) {
    throw new GitWorkspaceError(`${label} is not owned by the current user`);
  }
}

function assertRealDirectory(path: string, label: string): void {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new GitWorkspaceError(`${label} must be a real directory`);
  }
  assertOwned(stats, label);
  if (realpathSync(path) !== path) {
    throw new GitWorkspaceError(`${label} must not traverse a symbolic link`);
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { mode: PRIVATE_DIRECTORY_MODE });
  }
  assertRealDirectory(path, path);
  const stats = statSync(path);
  if ((stats.mode & 0o077) !== 0) {
    throw new GitWorkspaceError(`Factory runtime directory is not private: ${path}`);
  }
}

function safeChild(root: string, ...segments: readonly string[]): string {
  const child = join(root, ...segments);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!child.startsWith(prefix)) {
    throw new GitWorkspaceError("Factory-owned path escaped its runtime root");
  }
  return child;
}

function synchronizeDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writePrivateJson(path: string, value: unknown, exclusive: boolean): void {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
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
    if (exclusive) {
      try {
        linkSync(temporaryPath, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new GitWorkspaceError(`Ownership marker already exists: ${path}`);
        }
        throw error;
      }
      unlinkSync(temporaryPath);
    } else {
      renameSync(temporaryPath, path);
    }
    chmodSync(path, PRIVATE_FILE_MODE);
    synchronizeDirectory(dirname(path));
  } finally {
    if (existsSync(temporaryPath)) {
      // The temporary file is a known, unique regular file beside the marker.
      try {
        const temporaryStats = lstatSync(temporaryPath);
        if (temporaryStats.isFile() && !temporaryStats.isSymbolicLink()) {
          unlinkSync(temporaryPath);
        }
      } catch {
        // Preserve the original publication error.
      }
    }
  }
}

const PRIVATE_JSON_TEMPORARY_SUFFIX =
  /^[1-9][0-9]*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function reconcilePrivateJsonPublicationLinks(path: string): void {
  const original = lstatSync(path);
  if (!original.isFile() || original.isSymbolicLink() || (original.mode & 0o077) !== 0) {
    throw new GitWorkspaceError(`Ownership marker is not one private file: ${path}`);
  }
  assertOwned(original, path);
  if (original.nlink === 1) return;
  const parent = dirname(path);
  const prefix = `${basename(path)}.tmp-`;
  let removed = false;
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (
      !entry.name.startsWith(prefix) ||
      !PRIVATE_JSON_TEMPORARY_SUFFIX.test(entry.name.slice(prefix.length)) ||
      !entry.isFile() ||
      entry.isSymbolicLink()
    ) {
      continue;
    }
    const temporaryPath = safeChild(parent, entry.name);
    const temporary = lstatSync(temporaryPath);
    assertOwned(temporary, temporaryPath);
    if (
      temporary.dev === original.dev &&
      temporary.ino === original.ino &&
      temporary.isFile() &&
      !temporary.isSymbolicLink() &&
      (temporary.mode & 0o077) === 0
    ) {
      unlinkSync(temporaryPath);
      removed = true;
    }
  }
  if (removed) synchronizeDirectory(parent);
  const recovered = lstatSync(path);
  if (
    recovered.dev !== original.dev ||
    recovered.ino !== original.ino ||
    recovered.nlink !== 1 ||
    !recovered.isFile() ||
    recovered.isSymbolicLink()
  ) {
    throw new GitWorkspaceError(`Ownership marker has an unknown hard link: ${path}`);
  }
}

function readPrivateJson(path: string): unknown {
  reconcilePrivateJsonPublicationLinks(path);
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new GitWorkspaceError(`Ownership marker is not a real file: ${path}`);
  }
  assertOwned(stats, path);
  if ((stats.mode & 0o077) !== 0) {
    throw new GitWorkspaceError(`Ownership marker is not private: ${path}`);
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return JSON.parse(readFileSync(descriptor, "utf8")) as unknown;
  } catch (error) {
    throw new GitWorkspaceError(
      `Ownership marker is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    closeSync(descriptor);
  }
}

function removePrivateJson(path: string): void {
  reconcilePrivateJsonPublicationLinks(path);
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1) {
    throw new GitWorkspaceError(`Publication intent is not one real file: ${path}`);
  }
  assertOwned(stats, path);
  if ((stats.mode & 0o077) !== 0) {
    throw new GitWorkspaceError(`Publication intent is not private: ${path}`);
  }
  unlinkSync(path);
  synchronizeDirectory(dirname(path));
}

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new GitWorkspaceError(`${label} has unexpected or missing fields`);
  }
}

function canonicalJson(value: unknown): Buffer {
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

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function decodeGitPath(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(bytes)) {
    throw new GitWorkspaceError("Git path is not valid UTF-8");
  }
  assertSafeGitPath(value);
  return value;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 1 && code <= 31) || code === 127) return true;
  }
  return false;
}

function assertSafeGitPath(value: string): void {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    containsControlCharacter(value) ||
    posix.isAbsolute(value) ||
    posix.normalize(value) !== value ||
    value.normalize("NFC") !== value
  ) {
    throw new GitWorkspaceError(`Unsafe Git path: ${JSON.stringify(value)}`);
  }
  const components = value.split("/");
  if (components.some((component) => component === "" || component === "." || component === "..")) {
    throw new GitWorkspaceError(`Git path contains traversal: ${JSON.stringify(value)}`);
  }
}

function splitNull(bytes: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      parts.push(bytes.subarray(start, index));
      start = index + 1;
    }
  }
  if (start !== bytes.length) {
    throw new GitWorkspaceError("Git returned a non-NUL-terminated record stream");
  }
  return parts;
}

function parseRawChanges(output: Buffer): RawChangedPath[] {
  if (output.length === 0) {
    return [];
  }
  const records = splitNull(output);
  const changed: RawChangedPath[] = [];
  for (let index = 0; index < records.length; index += 2) {
    const headerBytes = records[index];
    const pathBytes = records[index + 1];
    if (headerBytes === undefined || pathBytes === undefined) {
      throw new GitWorkspaceError("Git returned an incomplete raw diff record");
    }
    const header = headerBytes.toString("ascii");
    const match = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([ACDMRTUXB])$/u.exec(header);
    if (match === null) {
      throw new GitWorkspaceError(`Git returned an unsupported raw diff record: ${header}`);
    }
    const status = match[5] as RawChangedPath["status"];
    changed.push({
      status,
      path: decodeGitPath(pathBytes),
      oldMode: match[1] as string,
      newMode: match[2] as string,
      oldObjectId: match[3] as string,
      newObjectId: match[4] as string,
    });
  }
  return changed.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
}

function parseTree(output: Buffer): TreeEntry[] {
  if (output.length === 0) {
    return [];
  }
  return splitNull(output).map((record) => {
    const tab = record.indexOf(0x09);
    if (tab < 0) {
      throw new GitWorkspaceError("Git returned an invalid tree record");
    }
    const header = record.subarray(0, tab).toString("ascii");
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]+)$/u.exec(header);
    if (match === null) {
      throw new GitWorkspaceError(`Git returned an unsupported tree record: ${header}`);
    }
    return {
      mode: match[1] as string,
      type: match[2] as string,
      objectId: match[3] as string,
      path: decodeGitPath(record.subarray(tab + 1)),
    };
  });
}

function validateTree(entries: readonly TreeEntry[]): Map<string, TreeEntry> {
  const byPath = new Map<string, TreeEntry>();
  const folded = new Map<string, string>();
  for (const entry of entries) {
    if (entry.mode === "160000" || entry.type === "commit") {
      throw new GitWorkspaceError(`Submodules are not allowed: ${entry.path}`);
    }
    const key = entry.path.normalize("NFKC").toLowerCase();
    const existing = folded.get(key);
    if (existing !== undefined && existing !== entry.path) {
      throw new GitWorkspaceError(
        `Case-colliding Git paths are not allowed: ${existing}, ${entry.path}`,
      );
    }
    folded.set(key, entry.path);
    byPath.set(entry.path, entry);
  }
  return byPath;
}

function parsePositiveLimit(value: number | undefined, fallback: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new GitWorkspaceError(`${label} must be a positive safe integer`);
  }
  return result;
}

function isWithinScope(path: string, scope: string): boolean {
  return scope === "." || path === scope || path.startsWith(`${scope}/`);
}

export function normalizeAuthorizedScopes(scopes: readonly string[]): readonly string[] {
  if (scopes.length === 0) {
    throw new GitWorkspaceError("At least one authorized scope is required");
  }
  const normalized = scopes.map((scope) => {
    const value = scope.endsWith("/") ? scope.slice(0, -1) : scope;
    if (value === ".") {
      return value;
    }
    assertSafeGitPath(value);
    return value;
  });
  return [...new Set(normalized)].sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
}

export function normalizeCandidatePolicy(policy: CandidatePolicy): NormalizedCandidatePolicy {
  return {
    authorizedScopes: normalizeAuthorizedScopes(policy.authorizedScopes),
    maxChangedFileBytes: parsePositiveLimit(
      policy.maxChangedFileBytes,
      DEFAULT_MAX_CHANGED_FILE_BYTES,
      "Maximum changed-file size",
    ),
    maxDiffBytes: parsePositiveLimit(
      policy.maxDiffBytes,
      DEFAULT_MAX_DIFF_BYTES,
      "Maximum diff size",
    ),
  };
}

/**
 * Explicit allowlist of protected-path classes that a project's reviewed
 * policy extension may relax. This is the only mechanism by which
 * classifyProtectedPath ever treats an otherwise-protected path as
 * unprotected; every other extension field may only add protection.
 */
const RELAXABLE_PROTECTED_PATH_CLASSES = ["xcode-project-membership"] as const;
export type RelaxableProtectedPathClass = (typeof RELAXABLE_PROTECTED_PATH_CLASSES)[number];
const RELAXABLE_PROTECTED_PATH_CLASS_SET: ReadonlySet<string> = new Set(
  RELAXABLE_PROTECTED_PATH_CLASSES,
);

const MAX_POLICY_EXTENSION_BYTES = 16 * 1024;
const MAX_POLICY_EXTENSION_LIST_LENGTH = 200;
const MAX_POLICY_EXTENSION_TOKEN_LENGTH = 200;

/**
 * A reviewed, project-specific extension to classifyProtectedPath's built-in,
 * repo-agnostic defaults. This is the externalized home for a project's own
 * repo-specific protected-path knowledge (its own trust-boundary package
 * names, its own policy-file naming conventions) that previously had to be
 * hardcoded inline. Every field may only ADD protection, except
 * `allowances`, which may only grant a scoped relaxation from the fixed
 * RELAXABLE_PROTECTED_PATH_CLASSES allowlist above -- there is no field that
 * can narrow or remove a built-in default protection.
 *
 * This struct is meant to travel the same way as other reviewed, digest-bound
 * policy payloads already used in this system (see decodeReviewedPolicyPayload
 * in apps/daemon/src/verified-local-executor.ts): decodeProtectedPathPolicyExtension
 * below canonicalizes and hashes the exact reviewed bytes so a caller can
 * bind this extension to an expected digest recorded in the project's own
 * reviewed policy lock, then pass the validated, trusted struct into
 * classifyProtectedPath.
 */
export type ProtectedPathPolicyExtensionV1 = Readonly<{
  schemaVersion: 1;
  /** Matched against the first two lowercased path segments, e.g. "apps/daemon". */
  additionalTrustBoundaryPathPrefixes: readonly string[];
  /** Matched against any single lowercased path segment, e.g. "git-workspace". */
  additionalTrustBoundarySegments: readonly string[];
  /** Matched as a substring of the full lowercased path. */
  additionalPolicyMarkers: readonly string[];
  /** Scoped relaxations; every entry must be in RELAXABLE_PROTECTED_PATH_CLASSES. */
  allowances: readonly RelaxableProtectedPathClass[];
}>;

function parseBoundedLowercaseTokenList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_POLICY_EXTENSION_LIST_LENGTH) {
    throw new GitWorkspaceError(`Protected-path policy extension ${label} must be a bounded array`);
  }
  const tokens = value.map((entry) => {
    if (
      typeof entry !== "string" ||
      entry.length < 1 ||
      entry.length > MAX_POLICY_EXTENSION_TOKEN_LENGTH ||
      entry !== entry.toLowerCase() ||
      entry.includes("\0") ||
      containsControlCharacter(entry)
    ) {
      throw new GitWorkspaceError(
        `Protected-path policy extension ${label} must contain bounded, lowercase, control-character-free strings`,
      );
    }
    return entry;
  });
  if (new Set(tokens).size !== tokens.length) {
    throw new GitWorkspaceError(`Protected-path policy extension ${label} must be unique`);
  }
  return tokens;
}

function parseProtectedPathPolicyAllowances(
  value: unknown,
): readonly RelaxableProtectedPathClass[] {
  if (!Array.isArray(value) || value.length > RELAXABLE_PROTECTED_PATH_CLASSES.length) {
    throw new GitWorkspaceError(
      "Protected-path policy extension allowances must be a bounded array",
    );
  }
  const allowances = value.map((entry) => {
    if (typeof entry !== "string" || !RELAXABLE_PROTECTED_PATH_CLASS_SET.has(entry)) {
      // Fail closed: an unrecognized relaxation key is rejected outright,
      // never silently ignored or treated as a no-op grant.
      throw new GitWorkspaceError(
        `Protected-path policy extension allowances contains an unrecognized class: ${JSON.stringify(entry)}`,
      );
    }
    return entry as RelaxableProtectedPathClass;
  });
  if (new Set(allowances).size !== allowances.length) {
    throw new GitWorkspaceError("Protected-path policy extension allowances must be unique");
  }
  return allowances;
}

/** Strictly validates an already-parsed reviewed policy extension object. */
export function parseProtectedPathPolicyExtension(value: unknown): ProtectedPathPolicyExtensionV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GitWorkspaceError("Protected-path policy extension must be an object");
  }
  const record = value as Record<string, unknown>;
  exactObjectKeys(
    record,
    [
      "schemaVersion",
      "additionalTrustBoundaryPathPrefixes",
      "additionalTrustBoundarySegments",
      "additionalPolicyMarkers",
      "allowances",
    ],
    "Protected-path policy extension",
  );
  if (record.schemaVersion !== 1) {
    throw new GitWorkspaceError("Protected-path policy extension must declare schemaVersion 1");
  }
  return {
    schemaVersion: 1,
    additionalTrustBoundaryPathPrefixes: parseBoundedLowercaseTokenList(
      record.additionalTrustBoundaryPathPrefixes,
      "additionalTrustBoundaryPathPrefixes",
    ),
    additionalTrustBoundarySegments: parseBoundedLowercaseTokenList(
      record.additionalTrustBoundarySegments,
      "additionalTrustBoundarySegments",
    ),
    additionalPolicyMarkers: parseBoundedLowercaseTokenList(
      record.additionalPolicyMarkers,
      "additionalPolicyMarkers",
    ),
    allowances: parseProtectedPathPolicyAllowances(record.allowances),
  };
}

/**
 * Decodes and validates a reviewed protected-path policy extension from its
 * exact canonical UTF-8 JSON bytes, mirroring decodeReviewedPolicyPayload's
 * byte-exactness checks. The returned digest lets a caller bind this
 * extension to an expected digest recorded in the project's own reviewed
 * policy, the same pattern already used for TaskSpec policy payloads.
 */
export function decodeProtectedPathPolicyExtension(payloadBytesInput: Uint8Array): Readonly<{
  extension: ProtectedPathPolicyExtensionV1;
  digest: `sha256:${string}`;
}> {
  const bytes = Buffer.from(payloadBytesInput);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_POLICY_EXTENSION_BYTES) {
    throw new GitWorkspaceError(
      `Protected-path policy extension must contain 1-${MAX_POLICY_EXTENSION_BYTES} bytes`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GitWorkspaceError("Protected-path policy extension must be valid UTF-8");
  }
  if (text.includes("\0") || !Buffer.from(text, "utf8").equals(bytes)) {
    throw new GitWorkspaceError(
      "Protected-path policy extension must be canonical UTF-8 without NUL bytes",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new GitWorkspaceError("Protected-path policy extension must contain valid JSON");
  }
  return { extension: parseProtectedPathPolicyExtension(parsed), digest: sha256(bytes) };
}

export function classifyProtectedPath(
  path: string,
  policyExtension?: ProtectedPathPolicyExtensionV1,
): string | null {
  assertSafeGitPath(path);
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  const basename = segments.at(-1) as string;
  const extension = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")) : "";

  if (
    segments.some(
      (segment) =>
        [
          "test",
          "tests",
          "__tests__",
          "uitests",
          "unittests",
          "integrationtests",
          "snapshots",
          "__snapshots__",
          "testsupport",
          "uitestsupport",
          "testing",
          "e2e",
          "spec",
          "specs",
          "fixtures",
          "__fixtures__",
          "test-fixtures",
          "test_fixtures",
          "testfixtures",
          "testkit",
          "test-kit",
          "testutils",
          "test-utils",
          "testhelpers",
          "test-helpers",
          "mocks",
          "__mocks__",
        ].includes(segment) ||
        // Xcode conventionally prefixes test-target directories with the app
        // name (for example HindsightTests and HindsightUITests). Protect the
        // whole target, including helpers whose filenames do not contain Test.
        segment.endsWith("tests") ||
        segment.endsWith("testsupport"),
    ) ||
    /(?:^|\.)test\.[^.]+$/u.test(basename) ||
    /(?:^|\.)spec\.[^.]+$/u.test(basename) ||
    /tests?\.swift$/u.test(basename) ||
    basename === "conftest.py" ||
    (segments.includes("scripts") &&
      /(?:^|[-_.])(?:check|coverage|lint|quality|snapshot|test|tests|verify|verification)(?:[-_.]|$)/u.test(
        basename,
      )) ||
    /^(?:vitest|jest|playwright|cypress|karma|wdio)\.config(?:\.[^.]+)+$/u.test(basename) ||
    ["pytest.ini", "tox.ini", ".coveragerc"].includes(basename) ||
    extension === ".xctestplan"
  ) {
    return "tests and test baselines are protected";
  }

  if (
    lower.startsWith(".github/") ||
    lower.startsWith(".circleci/") ||
    lower.startsWith(".buildkite/") ||
    lower.startsWith(".gitlab/") ||
    lower.startsWith(".ci/") ||
    lower.startsWith("ci/") ||
    lower === ".gitlab-ci.yml" ||
    lower === "jenkinsfile" ||
    lower === "bitrise.yml" ||
    lower === "azure-pipelines.yml" ||
    lower.startsWith("scripts/ci/")
  ) {
    return "CI configuration is protected";
  }

  if (
    ["agents.md", "claude.md", ".cursorrules", "codex.md", "policy.md", "rules.md"].includes(
      basename,
    ) ||
    segments.some((segment) =>
      [
        ".codex",
        ".cursor",
        ".claude",
        ".factory",
        "policy",
        "policies",
        "rules",
        "guardrails",
      ].includes(segment),
    ) ||
    (policyExtension?.additionalPolicyMarkers.some((marker) => lower.includes(marker)) ?? false)
  ) {
    return "policy and agent rules are protected";
  }

  if (
    segments.some((segment) =>
      ["baselines", "visual-baselines", "quality-gates", "quality-thresholds"].includes(segment),
    ) ||
    /(?:baseline|threshold)s?\.(?:json|ya?ml|toml)$/u.test(basename) ||
    [".codecov.yml", "codecov.yml", "sonar-project.properties"].includes(lower)
  ) {
    return "quality thresholds and baselines are protected";
  }

  // Trust-boundary code is repo-specific by nature (it names a project's own
  // packages and directories); there is no generic default. A project's
  // reviewed policy extension supplies its own trust-boundary segments and
  // path prefixes here (this repository's own list, for example, lives in
  // its enrolled project's reviewed policy, not in this classifier).
  if (
    policyExtension !== undefined &&
    (policyExtension.additionalTrustBoundaryPathPrefixes.includes(segments.slice(0, 2).join("/")) ||
      segments.some((segment) => policyExtension.additionalTrustBoundarySegments.includes(segment)))
  ) {
    return "Factory trust-boundary code is protected";
  }

  // Xcode project-membership files (project.pbxproj, and XcodeGen's
  // project.yml) are the one relaxable class: a project's reviewed policy
  // may opt in to editing them (needed for ordinary iOS work, e.g. adding a
  // file to a target). The default -- no policy extension, or an extension
  // that does not grant this allowance -- keeps them protected exactly like
  // every other build/dependency/verification file below.
  const isXcodeProjectMembershipFile = extension === ".pbxproj" || basename === "project.yml";
  const xcodeProjectMembershipAllowed =
    isXcodeProjectMembershipFile &&
    (policyExtension?.allowances.includes("xcode-project-membership") ?? false);
  if (
    !xcodeProjectMembershipAllowed &&
    ([
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.json",
      ".swiftlint.yml",
      ".swiftlint.yaml",
      ".swiftformat",
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "package.swift",
      "package.resolved",
      "podfile",
      "podfile.lock",
      "cartfile",
      "cartfile.resolved",
      "gemfile",
      "gemfile.lock",
      "package-lock.json",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      ".npmrc",
      "pyproject.toml",
      "poetry.lock",
      "pipfile",
      "pipfile.lock",
      "uv.lock",
      "cargo.toml",
      "cargo.lock",
      "gradle.properties",
      "settings.gradle",
      "settings.gradle.kts",
      "makefile",
      "justfile",
      "project.yaml",
      "xcodegen.yml",
      "xcodegen.yaml",
      ".pre-commit-config.yaml",
    ].includes(basename) ||
      /^tsconfig(?:\.[^.]+)*\.json$/u.test(basename) ||
      /^(?:babel|metro|next|nuxt|rollup|vite|webpack)\.config(?:\.[^.]+)+$/u.test(basename) ||
      /^requirements(?:[-_.][^.]+)?\.txt$/u.test(basename) ||
      /^build\.gradle(?:\.kts)?$/u.test(basename) ||
      /^taskfile(?:\.[^.]+)+$/u.test(basename) ||
      isXcodeProjectMembershipFile ||
      segments.some(
        (segment) =>
          segment === "tuist" || segment.endsWith(".xcodeproj") || segment.endsWith(".xcworkspace"),
      ))
  ) {
    return "build, dependency, and verification configuration is protected";
  }

  if (
    segments.includes("fastlane") ||
    segments.includes("release") ||
    segments.includes("signing") ||
    basename === "exportoptions.plist" ||
    basename === "info.plist" ||
    basename === "privacyinfo.xcprivacy" ||
    extension === ".xcscheme" ||
    extension === ".entitlements" ||
    extension === ".xcconfig" ||
    (segments.includes("scripts") &&
      /(?:^|[-_.])(release|sign|notari[sz]e|deploy|testflight|appstore)(?:[-_.]|$)/u.test(basename))
  ) {
    return "signing and release automation is protected";
  }

  if (
    basename === ".env" ||
    basename === ".envrc" ||
    basename.startsWith(".env.") ||
    /(?:^|[-_.])(?:credentials?|secrets?)(?:[-_.]|$)/u.test(basename) ||
    [
      ".cer",
      ".crt",
      ".der",
      ".key",
      ".mobileprovision",
      ".p12",
      ".pem",
      ".pfx",
      ".provisionprofile",
    ].includes(extension)
  ) {
    return "environment and credential material is protected";
  }

  if (basename === ".gitmodules") {
    return "submodule configuration is protected";
  }
  if (basename === ".gitattributes") {
    return "Git diff classification is protected";
  }
  return null;
}

function parseMirrorMarker(value: unknown): MirrorMarker {
  if (value === null || typeof value !== "object") {
    throw new GitWorkspaceError("Mirror ownership marker must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.repositoryId !== "string" ||
    typeof candidate.sourceRepositoryPath !== "string" ||
    typeof candidate.mirrorPath !== "string"
  ) {
    throw new GitWorkspaceError("Mirror ownership marker has an invalid shape");
  }
  assertIdentifier(candidate.repositoryId, "Repository ID");
  assertNormalizedAbsolute(candidate.sourceRepositoryPath, "Source repository path");
  assertNormalizedAbsolute(candidate.mirrorPath, "Mirror path");
  return {
    schemaVersion: 1,
    repositoryId: candidate.repositoryId,
    sourceRepositoryPath: candidate.sourceRepositoryPath,
    mirrorPath: candidate.mirrorPath,
  };
}

function parseImmutableMirrorBinding(value: unknown): ImmutableMirrorBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GitWorkspaceError("Immutable mirror binding must be an object");
  }
  const candidate = value as Record<string, unknown>;
  exactObjectKeys(
    candidate,
    [
      "schemaVersion",
      "kind",
      "repositoryId",
      "sourceRepositoryPath",
      "sourceIdentityDigest",
      "mirrorPath",
      "baseCommit",
      "baseTree",
    ],
    "Immutable mirror binding",
  );
  if (
    candidate.schemaVersion !== 1 ||
    candidate.kind !== "prepared-immutable-mirror" ||
    typeof candidate.repositoryId !== "string" ||
    typeof candidate.sourceRepositoryPath !== "string" ||
    typeof candidate.sourceIdentityDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(candidate.sourceIdentityDigest) ||
    typeof candidate.mirrorPath !== "string" ||
    typeof candidate.baseCommit !== "string" ||
    typeof candidate.baseTree !== "string"
  ) {
    throw new GitWorkspaceError("Immutable mirror binding has an invalid shape");
  }
  assertIdentifier(candidate.repositoryId, "Repository ID");
  assertNormalizedAbsolute(candidate.sourceRepositoryPath, "Source repository path");
  assertNormalizedAbsolute(candidate.mirrorPath, "Mirror path");
  assertExplicitSha(candidate.baseCommit, "Immutable mirror base commit");
  assertExplicitSha(candidate.baseTree, "Immutable mirror base tree");
  if (candidate.baseCommit.length !== candidate.baseTree.length) {
    throw new GitWorkspaceError("Immutable mirror commit and tree use different object formats");
  }
  return {
    schemaVersion: 1,
    kind: "prepared-immutable-mirror",
    repositoryId: candidate.repositoryId,
    sourceRepositoryPath: candidate.sourceRepositoryPath,
    sourceIdentityDigest: candidate.sourceIdentityDigest,
    mirrorPath: candidate.mirrorPath,
    baseCommit: candidate.baseCommit,
    baseTree: candidate.baseTree,
  };
}

function parseMirrorPublicationIntent(value: unknown): MirrorPublicationIntent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GitWorkspaceError("Mirror publication intent must be an object");
  }
  const candidate = value as Record<string, unknown>;
  exactObjectKeys(
    candidate,
    ["schemaVersion", "kind", "repositoryId", "sourceRepositoryPath", "mirrorPath"],
    "Mirror publication intent",
  );
  if (candidate.kind !== "mirror-publication") {
    throw new GitWorkspaceError("Mirror publication intent has the wrong kind");
  }
  return { ...parseMirrorMarker(candidate), kind: "mirror-publication" };
}

function parseWorkspaceRecord(value: unknown): FactoryWorkspaceRecord {
  if (value === null || typeof value !== "object") {
    throw new GitWorkspaceError("Workspace ownership marker must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    (candidate.kind !== "attempt" && candidate.kind !== "verification") ||
    typeof candidate.repositoryId !== "string" ||
    typeof candidate.attemptId !== "string" ||
    typeof candidate.runtimeRoot !== "string" ||
    typeof candidate.mirrorPath !== "string" ||
    typeof candidate.worktreePath !== "string" ||
    typeof candidate.gitDirectoryPath !== "string" ||
    typeof candidate.baseSha !== "string" ||
    typeof candidate.initialHeadSha !== "string" ||
    (candidate.candidateTreeId !== null && typeof candidate.candidateTreeId !== "string") ||
    typeof candidate.ownershipNonce !== "string" ||
    typeof candidate.readOnly !== "boolean"
  ) {
    throw new GitWorkspaceError("Workspace ownership marker has an invalid shape");
  }
  assertIdentifier(candidate.repositoryId, "Repository ID");
  assertIdentifier(candidate.attemptId, "Attempt ID");
  assertNormalizedAbsolute(candidate.runtimeRoot, "Runtime root");
  assertNormalizedAbsolute(candidate.mirrorPath, "Mirror path");
  assertNormalizedAbsolute(candidate.worktreePath, "Worktree path");
  assertNormalizedAbsolute(candidate.gitDirectoryPath, "Git directory path");
  assertExplicitSha(candidate.baseSha, "Base SHA");
  assertExplicitSha(candidate.initialHeadSha, "Initial HEAD SHA");
  if (candidate.candidateTreeId !== null) {
    assertExplicitSha(candidate.candidateTreeId, "Candidate tree ID");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      candidate.ownershipNonce,
    )
  ) {
    throw new GitWorkspaceError("Workspace ownership nonce is invalid");
  }
  if ((candidate.kind === "verification") !== candidate.readOnly) {
    throw new GitWorkspaceError("Workspace read-only flag does not match its kind");
  }
  if ((candidate.kind === "verification") !== (candidate.candidateTreeId !== null)) {
    throw new GitWorkspaceError("Workspace candidate tree does not match its kind");
  }
  return {
    schemaVersion: 1,
    kind: candidate.kind,
    repositoryId: candidate.repositoryId,
    attemptId: candidate.attemptId,
    runtimeRoot: candidate.runtimeRoot,
    mirrorPath: candidate.mirrorPath,
    worktreePath: candidate.worktreePath,
    gitDirectoryPath: candidate.gitDirectoryPath,
    baseSha: candidate.baseSha,
    initialHeadSha: candidate.initialHeadSha,
    candidateTreeId: candidate.candidateTreeId,
    ownershipNonce: candidate.ownershipNonce,
    readOnly: candidate.readOnly,
  };
}

function parseWorkspacePublicationIntent(value: unknown): WorkspacePublicationIntent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GitWorkspaceError("Workspace publication intent must be an object");
  }
  const candidate = value as Record<string, unknown>;
  exactObjectKeys(
    candidate,
    [
      "schemaVersion",
      "kind",
      "workspaceKind",
      "repositoryId",
      "attemptId",
      "runtimeRoot",
      "mirrorPath",
      "worktreePath",
      "baseSha",
      "initialHeadSha",
      "candidateTreeId",
      "ownershipNonce",
      "readOnly",
    ],
    "Workspace publication intent",
  );
  if (candidate.kind !== "workspace-publication") {
    throw new GitWorkspaceError("Workspace publication intent has the wrong kind");
  }
  if (typeof candidate.mirrorPath !== "string") {
    throw new GitWorkspaceError("Workspace publication intent has an invalid mirror path");
  }
  const record = parseWorkspaceRecord({
    ...candidate,
    kind: candidate.workspaceKind,
    gitDirectoryPath: join(candidate.mirrorPath, "placeholder"),
  });
  return {
    schemaVersion: 1,
    kind: "workspace-publication",
    workspaceKind: record.kind,
    repositoryId: record.repositoryId,
    attemptId: record.attemptId,
    runtimeRoot: record.runtimeRoot,
    mirrorPath: record.mirrorPath,
    worktreePath: record.worktreePath,
    baseSha: record.baseSha,
    initialHeadSha: record.initialHeadSha,
    candidateTreeId: record.candidateTreeId,
    ownershipNonce: record.ownershipNonce,
    readOnly: record.readOnly,
  };
}

function sameRecord(left: FactoryWorkspaceRecord, right: FactoryWorkspaceRecord): boolean {
  return canonicalJson(left).equals(canonicalJson(right));
}

function assertPathWithin(root: string, path: string, label: string): void {
  const relation = relative(root, path);
  if (
    relation === "" ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new GitWorkspaceError(`${label} is not contained by its Factory-owned root`);
  }
}

function removeOwnerWriteRecursively(path: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    return;
  }
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      removeOwnerWriteRecursively(join(path, entry));
    }
    chmodSync(path, (stats.mode & 0o555) | 0o500);
    return;
  }
  chmodSync(path, (stats.mode & 0o555) | 0o400);
}

function restoreOwnerWriteRecursively(path: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    return;
  }
  if (stats.isDirectory()) {
    chmodSync(path, (stats.mode & 0o777) | 0o700);
    for (const entry of readdirSync(path)) {
      restoreOwnerWriteRecursively(join(path, entry));
    }
    return;
  }
  chmodSync(path, (stats.mode & 0o777) | 0o600);
}

export class GitWorkspaceManager {
  readonly #gitExecutable: string;
  readonly #verificationCheckpoint: ((worktreePath: string) => void) | undefined;
  readonly #publicationCheckpoint: GitWorkspaceManagerOptions["publicationCheckpoint"];

  constructor(options: GitWorkspaceManagerOptions = {}) {
    this.#gitExecutable = options.gitExecutable ?? "/usr/bin/git";
    this.#verificationCheckpoint = options.verificationCheckpoint;
    this.#publicationCheckpoint = options.publicationCheckpoint;
    assertNormalizedAbsolute(this.#gitExecutable, "Git executable");
    const stats = statSync(this.#gitExecutable);
    if (!stats.isFile()) {
      throw new GitWorkspaceError("Git executable must be a regular file");
    }
  }

  ensureMirror(input: EnsureMirrorInput): FactoryMirror {
    const runtimeRoot = this.#ensureRuntimeRoot(input.runtimeRoot);
    const source = this.#validateSource(runtimeRoot, input.sourceRepositoryPath);
    assertIdentifier(input.repositoryId, "Repository ID");

    const mirrorsRoot = safeChild(runtimeRoot, "mirrors");
    ensurePrivateDirectory(mirrorsRoot);
    const mirrorPath = safeChild(mirrorsRoot, `${input.repositoryId}.git`);
    const marker: MirrorMarker = {
      schemaVersion: 1,
      repositoryId: input.repositoryId,
      sourceRepositoryPath: source,
      mirrorPath,
    };

    const mirrorIntentRoot = this.#publicationDirectory(runtimeRoot, "mirrors");
    const mirrorIntentPath = safeChild(mirrorIntentRoot, `${input.repositoryId}.json`);
    this.#reconcileMirrorPublication(marker, mirrorsRoot, mirrorIntentPath);

    if (!existsSync(mirrorPath)) {
      const intent: MirrorPublicationIntent = { ...marker, kind: "mirror-publication" };
      writePrivateJson(mirrorIntentPath, intent, true);
      this.#publicationCheckpoint?.("mirror-after-intent", mirrorPath);
      this.#git(runtimeRoot, ["clone", "--mirror", "--no-local", "--", source, mirrorPath]);
      this.#publicationCheckpoint?.("mirror-after-git", mirrorPath);
      assertRealDirectory(mirrorPath, "Factory mirror");
      writePrivateJson(safeChild(mirrorPath, MIRROR_MARKER_FILE), marker, true);
      this.#publicationCheckpoint?.("mirror-after-marker", mirrorPath);
      removePrivateJson(mirrorIntentPath);
    } else {
      assertRealDirectory(mirrorPath, "Factory mirror");
      const existing = parseMirrorMarker(
        readPrivateJson(safeChild(mirrorPath, MIRROR_MARKER_FILE)),
      );
      if (!canonicalJson(existing).equals(canonicalJson(marker))) {
        throw new GitWorkspaceError(
          "Existing mirror ownership marker does not match the requested source",
        );
      }
      if (existsSync(safeChild(mirrorPath, IMMUTABLE_MIRROR_BINDING_FILE))) {
        throw new GitWorkspaceError(
          "Prepared immutable mirror cannot be refreshed through ensureMirror",
        );
      }
      this.#gitBare(runtimeRoot, mirrorPath, ["remote", "set-url", "origin", source]);
      this.#gitBare(runtimeRoot, mirrorPath, [
        "fetch",
        "--prune",
        "--force",
        "--no-tags",
        "origin",
        "+refs/heads/*:refs/heads/*",
        "+refs/tags/*:refs/tags/*",
      ]);
    }

    this.#assertBareRepository(runtimeRoot, mirrorPath);
    return { ...marker, runtimeRoot };
  }

  /**
   * Publishes an immutable enrollment boundary after the reviewed commit/tree
   * have been copied into Factory-owned storage. A later attempt must open this
   * binding and must never contact or refresh from the mutable source checkout.
   */
  prepareImmutableMirror(
    input: PrepareImmutableMirrorInput,
    assertSourceStillIdentical: () => void,
  ): FactoryMirror {
    if (typeof assertSourceStillIdentical !== "function") {
      throw new TypeError("Immutable mirror preparation requires a source revalidation callback");
    }
    const runtimeRoot = this.#ensureRuntimeRoot(input.runtimeRoot);
    assertNormalizedAbsolute(input.sourceRepositoryPath, "Source repository path");
    assertIdentifier(input.repositoryId, "Repository ID");
    if (!/^sha256:[0-9a-f]{64}$/u.test(input.sourceIdentityDigest)) {
      throw new GitWorkspaceError("Source identity digest must be a SHA-256 digest");
    }
    assertExplicitSha(input.baseCommit, "Immutable mirror base commit");
    assertExplicitSha(input.baseTree, "Immutable mirror base tree");
    if (input.baseCommit.length !== input.baseTree.length) {
      throw new GitWorkspaceError("Immutable mirror commit and tree use different object formats");
    }
    const mirrorPath = safeChild(runtimeRoot, "mirrors", `${input.repositoryId}.git`);
    const binding: ImmutableMirrorBinding = {
      schemaVersion: 1,
      kind: "prepared-immutable-mirror",
      repositoryId: input.repositoryId,
      sourceRepositoryPath: input.sourceRepositoryPath,
      sourceIdentityDigest: input.sourceIdentityDigest,
      mirrorPath,
      baseCommit: input.baseCommit,
      baseTree: input.baseTree,
    };
    const bindingPath = safeChild(mirrorPath, IMMUTABLE_MIRROR_BINDING_FILE);
    if (existsSync(bindingPath)) {
      assertSourceStillIdentical();
      return this.openPreparedImmutableMirror(input);
    }

    const mirror = this.ensureMirror(input);
    this.assertMirrorCommitTree(mirror, input.baseCommit, input.baseTree);
    // This is the final source access in the enrollment path. Once it returns,
    // only the already-populated Factory mirror is used and then sealed.
    assertSourceStillIdentical();
    try {
      writePrivateJson(bindingPath, binding, true);
    } catch (error) {
      if (!existsSync(bindingPath)) throw error;
    }
    return this.openPreparedImmutableMirror(input);
  }

  /** Opens a previously prepared mirror without reading or refreshing its source. */
  openPreparedImmutableMirror(input: PrepareImmutableMirrorInput): FactoryMirror {
    const runtimeRoot = this.#ensureRuntimeRoot(input.runtimeRoot);
    assertNormalizedAbsolute(input.sourceRepositoryPath, "Source repository path");
    assertIdentifier(input.repositoryId, "Repository ID");
    if (!/^sha256:[0-9a-f]{64}$/u.test(input.sourceIdentityDigest)) {
      throw new GitWorkspaceError("Source identity digest must be a SHA-256 digest");
    }
    assertExplicitSha(input.baseCommit, "Immutable mirror base commit");
    assertExplicitSha(input.baseTree, "Immutable mirror base tree");
    if (input.baseCommit.length !== input.baseTree.length) {
      throw new GitWorkspaceError("Immutable mirror commit and tree use different object formats");
    }
    const mirrorPath = safeChild(runtimeRoot, "mirrors", `${input.repositoryId}.git`);
    const pendingIntentPath = safeChild(
      runtimeRoot,
      PUBLICATION_ROOT,
      "mirrors",
      `${input.repositoryId}.json`,
    );
    if (existsSync(pendingIntentPath)) {
      throw new GitWorkspaceError("Prepared immutable mirror has a pending publication intent");
    }
    const expectedBinding: ImmutableMirrorBinding = {
      schemaVersion: 1,
      kind: "prepared-immutable-mirror",
      repositoryId: input.repositoryId,
      sourceRepositoryPath: input.sourceRepositoryPath,
      sourceIdentityDigest: input.sourceIdentityDigest,
      mirrorPath,
      baseCommit: input.baseCommit,
      baseTree: input.baseTree,
    };
    const actualBinding = parseImmutableMirrorBinding(
      readPrivateJson(safeChild(mirrorPath, IMMUTABLE_MIRROR_BINDING_FILE)),
    );
    if (!canonicalJson(actualBinding).equals(canonicalJson(expectedBinding))) {
      throw new GitWorkspaceError("Prepared immutable mirror binding does not match enrollment");
    }
    const mirror = this.#validateMirror({
      schemaVersion: 1,
      repositoryId: input.repositoryId,
      sourceRepositoryPath: input.sourceRepositoryPath,
      mirrorPath,
      runtimeRoot,
    });
    this.assertMirrorCommitTree(mirror, input.baseCommit, input.baseTree);
    return mirror;
  }

  #publicationDirectory(runtimeRoot: string, category: "mirrors" | "workspaces"): string {
    const publicationRoot = safeChild(runtimeRoot, PUBLICATION_ROOT);
    ensurePrivateDirectory(publicationRoot);
    const categoryRoot = safeChild(publicationRoot, category);
    ensurePrivateDirectory(categoryRoot);
    return categoryRoot;
  }

  #reconcileMirrorPublication(marker: MirrorMarker, mirrorsRoot: string, intentPath: string): void {
    if (!existsSync(intentPath)) return;
    const intent = parseMirrorPublicationIntent(readPrivateJson(intentPath));
    if (!canonicalJson(intent).equals(canonicalJson({ ...marker, kind: "mirror-publication" }))) {
      throw new GitWorkspaceError("Pending mirror publication does not match this enrollment");
    }
    assertPathWithin(mirrorsRoot, marker.mirrorPath, "Pending mirror path");
    if (existsSync(marker.mirrorPath)) {
      assertRealDirectory(marker.mirrorPath, "Pending Factory mirror");
      const finalMarkerPath = safeChild(marker.mirrorPath, MIRROR_MARKER_FILE);
      if (existsSync(finalMarkerPath)) {
        const finalMarker = parseMirrorMarker(readPrivateJson(finalMarkerPath));
        if (!canonicalJson(finalMarker).equals(canonicalJson(marker))) {
          throw new GitWorkspaceError("Published mirror marker conflicts with its intent");
        }
        removePrivateJson(intentPath);
        return;
      }
      rmSync(marker.mirrorPath, { recursive: true, force: false });
      synchronizeDirectory(mirrorsRoot);
    }
    removePrivateJson(intentPath);
  }

  /** Proves an enrolled commit resolves to the exact reviewed tree in this mirror. */
  assertMirrorCommitTree(
    mirrorInput: FactoryMirror,
    commitSha: string,
    expectedTreeSha: string,
  ): void {
    const mirror = this.#validateMirror(mirrorInput);
    assertExplicitSha(commitSha, "Enrolled base commit");
    assertExplicitSha(expectedTreeSha, "Enrolled base tree");
    if (commitSha.length !== expectedTreeSha.length) {
      throw new GitWorkspaceError("Enrolled commit and tree use different object formats");
    }
    const commit = this.#resolveCommit(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      commitSha,
      "Enrolled base commit",
    );
    if (commit !== commitSha) {
      throw new GitWorkspaceError("Enrolled base commit did not resolve to its exact object");
    }
    const tree = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "rev-parse",
      "--verify",
      `${commitSha}^{tree}`,
    ])
      .stdout.toString("utf8")
      .trim();
    assertExplicitSha(tree, "Enrolled base tree");
    if (tree !== expectedTreeSha) {
      throw new GitWorkspaceError("Enrolled base commit does not contain the reviewed tree");
    }
  }

  createAttemptWorkspace(
    mirror: FactoryMirror,
    attemptId: string,
    baseSha: string,
  ): FactoryWorkspaceRecord {
    return this.#createWorkspace(mirror, "attempt", attemptId, baseSha, baseSha, null);
  }

  /**
   * Creates the deterministic attempt worktree or proves that the existing
   * worktree is the same Factory-owned checkout. This is the restart path for
   * an executor that may have stopped after checkout creation or while an
   * uncommitted candidate was being produced.
   */
  createOrReconcileAttemptWorkspace(
    mirrorInput: FactoryMirror,
    attemptId: string,
    baseSha: string,
  ): FactoryWorkspaceRecord {
    const mirror = this.#validateMirror(mirrorInput);
    assertIdentifier(attemptId, "Attempt ID");
    assertExplicitSha(baseSha, "Base SHA");
    const repositoryRoot = safeChild(mirror.runtimeRoot, "worktrees", mirror.repositoryId);
    const worktreePath = safeChild(repositoryRoot, attemptId);
    const intentPath = this.#workspacePublicationIntentPath(mirror, "attempt", attemptId, null);
    if (!existsSync(worktreePath) || existsSync(intentPath)) {
      return this.#createWorkspace(mirror, "attempt", attemptId, baseSha, baseSha, null);
    }

    assertRealDirectory(worktreePath, "Factory attempt worktree");
    const gitDirectoryPath = this.#absoluteGitDirectory(mirror.runtimeRoot, worktreePath);
    const record = parseWorkspaceRecord(readPrivateJson(safeChild(gitDirectoryPath, MARKER_FILE)));
    if (
      record.kind !== "attempt" ||
      record.readOnly ||
      record.repositoryId !== mirror.repositoryId ||
      record.attemptId !== attemptId ||
      record.runtimeRoot !== mirror.runtimeRoot ||
      record.mirrorPath !== mirror.mirrorPath ||
      record.worktreePath !== worktreePath ||
      record.gitDirectoryPath !== gitDirectoryPath ||
      record.baseSha !== baseSha ||
      record.initialHeadSha !== baseSha ||
      record.candidateTreeId !== null
    ) {
      throw new GitWorkspaceError(
        "Existing attempt worktree is not bound to the requested repository, attempt, and base",
      );
    }
    return this.#validateWorkspaceRecord(record, "attempt");
  }

  verifyCandidate(record: FactoryWorkspaceRecord, policy: CandidatePolicy): CandidateVerification {
    const verifiedRecord = this.#validateWorkspaceRecord(record, "attempt");
    const normalizedPolicy = normalizeCandidatePolicy(policy);
    const scopes = normalizedPolicy.authorizedScopes;
    const maxChangedFileBytes = normalizedPolicy.maxChangedFileBytes;
    const maxDiffBytes = normalizedPolicy.maxDiffBytes;

    const attemptHeadSha = this.#resolveCommit(
      verifiedRecord.runtimeRoot,
      verifiedRecord.worktreePath,
      "HEAD",
      "Attempt HEAD",
    );
    const resolvedBase = this.#resolveCommit(
      verifiedRecord.runtimeRoot,
      verifiedRecord.worktreePath,
      verifiedRecord.baseSha,
      "Recorded base",
    );
    if (resolvedBase !== verifiedRecord.baseSha) {
      throw new GitWorkspaceError("Recorded base no longer resolves to its exact commit");
    }
    if (attemptHeadSha !== verifiedRecord.baseSha) {
      throw new GitWorkspaceError(
        "Coding-agent commits are not accepted; attempt HEAD must remain pinned to the recorded base",
      );
    }

    const initialChanges = this.#listWorkingChanges(verifiedRecord);
    const snapshots = new Map<string, WorkingEntrySnapshot>();
    for (const change of initialChanges) {
      const protectedReason = classifyProtectedPath(change.path);
      if (protectedReason !== null) {
        throw new GitWorkspaceError(`${protectedReason}: ${change.path}`);
      }
      if (!scopes.some((scope) => isWithinScope(change.path, scope))) {
        throw new GitWorkspaceError(`Changed path is outside authorized scopes: ${change.path}`);
      }
      if (change.status === "D") {
        if (
          this.#lstatOrNull(safeChild(verifiedRecord.worktreePath, ...change.path.split("/"))) !==
          null
        ) {
          throw new GitWorkspaceError(
            `Candidate changed while deletion was being inventoried: ${change.path}`,
          );
        }
        continue;
      }
      const snapshot = this.#snapshotWorkingEntry(verifiedRecord, change.path, maxChangedFileBytes);
      snapshots.set(change.path, snapshot);
    }

    const candidateTreeId = this.#synthesizeCandidateTree(
      verifiedRecord,
      initialChanges,
      snapshots,
    );
    const analyzed = this.#analyzeCandidateTree(
      verifiedRecord,
      verifiedRecord.attemptId,
      verifiedRecord.baseSha,
      candidateTreeId,
      scopes,
      maxChangedFileBytes,
      maxDiffBytes,
    );

    this.#verificationCheckpoint?.(verifiedRecord.worktreePath);
    const finalHead = this.#resolveCommit(
      verifiedRecord.runtimeRoot,
      verifiedRecord.worktreePath,
      "HEAD",
      "Attempt HEAD",
    );
    const finalChanges = this.#listWorkingChanges(verifiedRecord);
    if (
      finalHead !== verifiedRecord.baseSha ||
      !canonicalJson(finalChanges).equals(canonicalJson(initialChanges))
    ) {
      throw new GitWorkspaceError("Candidate paths or status changed while it was being verified");
    }
    for (const change of finalChanges) {
      if (change.status === "D") {
        if (
          this.#lstatOrNull(safeChild(verifiedRecord.worktreePath, ...change.path.split("/"))) !==
          null
        ) {
          throw new GitWorkspaceError(
            `Candidate deletion changed during verification: ${change.path}`,
          );
        }
        continue;
      }
      const expected = snapshots.get(change.path);
      if (expected === undefined) {
        throw new GitWorkspaceError(
          `Candidate content appeared during verification: ${change.path}`,
        );
      }
      const observed = this.#snapshotWorkingEntry(verifiedRecord, change.path, maxChangedFileBytes);
      if (
        observed.mode !== expected.mode ||
        observed.sizeBytes !== expected.sizeBytes ||
        observed.digest !== expected.digest
      ) {
        throw new GitWorkspaceError(
          `Candidate content changed during verification: ${change.path}`,
        );
      }
    }

    return {
      ...analyzed,
      attemptHeadSha,
    };
  }

  verifyCandidateObject(
    mirrorInput: FactoryMirror,
    verification: CandidateVerification,
    policy: CandidatePolicy,
  ): CandidateVerification {
    const mirror = this.#validateMirror(mirrorInput);
    assertIdentifier(verification.attemptId, "Attempt ID");
    assertExplicitSha(verification.baseSha, "Base SHA");
    assertExplicitSha(verification.attemptHeadSha, "Attempt HEAD SHA");
    assertExplicitSha(verification.candidateTreeId, "Candidate tree ID");
    if (verification.attemptHeadSha !== verification.baseSha) {
      throw new GitWorkspaceError("Candidate record was not produced from a pinned attempt HEAD");
    }
    const normalizedPolicy = normalizeCandidatePolicy(policy);
    const analyzed = this.#analyzeCandidateTree(
      mirror,
      verification.attemptId,
      verification.baseSha,
      verification.candidateTreeId,
      normalizedPolicy.authorizedScopes,
      normalizedPolicy.maxChangedFileBytes,
      normalizedPolicy.maxDiffBytes,
    );
    const recomputed: CandidateVerification = {
      ...analyzed,
      attemptHeadSha: verification.baseSha,
    };
    if (!canonicalJson(recomputed).equals(canonicalJson(verification))) {
      throw new GitWorkspaceError("Candidate evidence does not match the stored Git objects");
    }
    return recomputed;
  }

  readVerifiedCandidatePatch(
    mirrorInput: FactoryMirror,
    verification: CandidateVerification,
    policy: CandidatePolicy,
  ): Buffer {
    const mirror = this.#validateMirror(mirrorInput);
    this.verifyCandidateObject(mirror, verification, policy);
    return this.#candidatePatch(mirror, verification.baseSha, verification.candidateTreeId);
  }

  createOrReconcileBrokerCommit(
    mirrorInput: FactoryMirror,
    expectation: BrokerCommitExpectation,
    assertActive: BrokerCommitMutationGuard,
  ): BrokerCommitRecord {
    const mirror = this.#validateMirror(mirrorInput);
    this.#validateBrokerExpectation(expectation);
    const existing = this.#readBrokerCommitOrNull(mirror, expectation);
    if (existing !== null) {
      return existing;
    }

    assertActive();
    const message = this.#brokerCommitMessage(expectation);
    const commitSha = this.#gitBare(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      ["commit-tree", expectation.candidateTreeId, "-p", expectation.baseSha],
      [0],
      { env: this.#brokerIdentity(), input: message },
    )
      .stdout.toString("ascii")
      .trim();
    assertExplicitSha(commitSha, "Broker commit SHA");

    assertActive();
    const refName = this.#brokerRefName(expectation.attemptId);
    const publication = this.#gitBare(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      ["update-ref", refName, commitSha, ""],
      [0, 128],
    );
    if (publication.status !== 0) {
      const raced = this.#readBrokerCommitOrNull(mirror, expectation);
      if (raced === null) {
        throw new GitWorkspaceError("Broker commit marker could not be published atomically");
      }
      return raced;
    }
    return this.inspectBrokerCommit(mirror, expectation);
  }

  inspectBrokerCommit(
    mirrorInput: FactoryMirror,
    expectation: BrokerCommitExpectation,
  ): BrokerCommitRecord {
    const mirror = this.#validateMirror(mirrorInput);
    this.#validateBrokerExpectation(expectation);
    const record = this.#readBrokerCommitOrNull(mirror, expectation);
    if (record === null) {
      throw new GitWorkspaceError(
        `No broker commit exists for attempt marker ${expectation.attemptId}`,
      );
    }
    return record;
  }

  createTrustedVerificationCheckout(
    mirror: FactoryMirror,
    attemptRecord: FactoryWorkspaceRecord,
    verification: CandidateVerification,
  ): FactoryWorkspaceRecord {
    const attempt = this.#validateWorkspaceRecord(attemptRecord, "attempt");
    this.#validateMirror(mirror);
    if (
      attempt.repositoryId !== mirror.repositoryId ||
      attempt.mirrorPath !== mirror.mirrorPath ||
      verification.attemptId !== attempt.attemptId ||
      verification.baseSha !== attempt.baseSha
    ) {
      throw new GitWorkspaceError("Verification checkout inputs do not describe the same attempt");
    }
    const currentHead = this.#resolveCommit(
      attempt.runtimeRoot,
      attempt.worktreePath,
      "HEAD",
      "Attempt HEAD",
    );
    if (currentHead !== attempt.baseSha || verification.attemptHeadSha !== attempt.baseSha) {
      throw new GitWorkspaceError("Attempt HEAD changed after candidate verification");
    }
    const verificationCommitSha = this.#createVerificationCommit(mirror, verification);
    return this.#createWorkspace(
      mirror,
      "verification",
      attempt.attemptId,
      attempt.baseSha,
      verificationCommitSha,
      verification.candidateTreeId,
    );
  }

  cleanupWorkspace(record: FactoryWorkspaceRecord): void {
    const verified = this.#validateWorkspaceRecord(record, record.kind);
    if (verified.readOnly) {
      restoreOwnerWriteRecursively(verified.worktreePath);
    }
    this.#gitBare(verified.runtimeRoot, verified.mirrorPath, [
      "worktree",
      "remove",
      "--force",
      verified.worktreePath,
    ]);
    if (existsSync(verified.worktreePath)) {
      throw new GitWorkspaceError(
        `Git did not remove the owned worktree: ${verified.worktreePath}`,
      );
    }
    this.#gitBare(verified.runtimeRoot, verified.mirrorPath, ["worktree", "prune", "--expire=now"]);
  }

  #analyzeCandidateTree(
    repository: Pick<FactoryMirror, "runtimeRoot" | "mirrorPath">,
    attemptId: string,
    baseSha: string,
    candidateTreeId: string,
    scopes: readonly string[],
    maxChangedFileBytes: number,
    maxDiffBytes: number,
  ): Omit<CandidateVerification, "attemptHeadSha"> {
    const resolvedBase = this.#resolveCommit(
      repository.runtimeRoot,
      repository.mirrorPath,
      baseSha,
      "Candidate base",
    );
    if (resolvedBase !== baseSha) {
      throw new GitWorkspaceError("Candidate base no longer resolves to its exact commit");
    }
    const treeType = this.#gitBare(repository.runtimeRoot, repository.mirrorPath, [
      "cat-file",
      "-t",
      candidateTreeId,
    ])
      .stdout.toString("ascii")
      .trim();
    if (treeType !== "tree") {
      throw new GitWorkspaceError("Candidate tree ID does not identify a Git tree");
    }
    const treeBytes = this.#gitBare(repository.runtimeRoot, repository.mirrorPath, [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      candidateTreeId,
    ]).stdout;
    const treeByPath = validateTree(parseTree(treeBytes));
    if (treeByPath.has(".gitmodules")) {
      throw new GitWorkspaceError("Repositories containing .gitmodules are not allowed");
    }

    const rawDiff = this.#gitBare(repository.runtimeRoot, repository.mirrorPath, [
      "diff",
      "--raw",
      "--no-abbrev",
      "--no-renames",
      "-z",
      baseSha,
      candidateTreeId,
      "--",
    ]).stdout;
    const rawChanged = parseRawChanges(rawDiff);
    const changedPaths: ChangedPath[] = [];
    let totalChangedFileBytes = 0;
    for (const changed of rawChanged) {
      const protectedReason = classifyProtectedPath(changed.path);
      if (protectedReason !== null) {
        throw new GitWorkspaceError(`${protectedReason}: ${changed.path}`);
      }
      if (!scopes.some((scope) => isWithinScope(changed.path, scope))) {
        throw new GitWorkspaceError(`Changed path is outside authorized scopes: ${changed.path}`);
      }
      const finalEntry = treeByPath.get(changed.path);
      let sizeBytes: number | null = null;
      if (finalEntry !== undefined) {
        if (finalEntry.mode === "120000") {
          this.#validateSymlinkBlob(repository, candidateTreeId, finalEntry.path);
        } else if (finalEntry.type !== "blob") {
          throw new GitWorkspaceError(`Unsupported changed tree entry: ${finalEntry.path}`);
        }
        sizeBytes = this.#objectSize(repository, finalEntry.objectId);
        if (sizeBytes > maxChangedFileBytes) {
          throw new GitWorkspaceError(
            `Changed file exceeds ${maxChangedFileBytes} bytes: ${changed.path} (${sizeBytes} bytes)`,
          );
        }
        totalChangedFileBytes += sizeBytes;
      }
      changedPaths.push({ ...changed, sizeBytes });
    }

    this.#assertNoBinaryDiffs(repository, baseSha, candidateTreeId, rawChanged);
    const patch = this.#candidatePatch(repository, baseSha, candidateTreeId);
    if (patch.length > maxDiffBytes) {
      throw new GitWorkspaceError(
        `Candidate diff exceeds ${maxDiffBytes} bytes (${patch.length} bytes)`,
      );
    }
    const digestInput = canonicalJson({ baseSha, candidateTreeId, changedPaths });
    return {
      attemptId,
      baseSha,
      candidateTreeId,
      changedPaths,
      diffBytes: patch.length,
      totalChangedFileBytes,
      diffDigest: sha256(Buffer.concat([digestInput, patch])),
      treeDigest: sha256(canonicalJson([...treeByPath.values()])),
    };
  }

  #candidatePatch(
    repository: Pick<FactoryMirror, "runtimeRoot" | "mirrorPath">,
    baseSha: string,
    candidateTreeId: string,
  ): Buffer {
    return this.#gitBare(repository.runtimeRoot, repository.mirrorPath, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--full-index",
      "--binary",
      "--no-renames",
      baseSha,
      candidateTreeId,
      "--",
    ]).stdout;
  }

  #validateBrokerExpectation(expectation: BrokerCommitExpectation): void {
    assertIdentifier(expectation.attemptId, "Attempt ID");
    assertExplicitSha(expectation.baseSha, "Broker base SHA");
    assertExplicitSha(expectation.candidateTreeId, "Broker candidate tree ID");
    if (!/^sha256:[0-9a-f]{64}$/u.test(expectation.diffDigest)) {
      throw new GitWorkspaceError("Broker candidate diff digest is invalid");
    }
  }

  #brokerRefName(attemptId: string): string {
    assertIdentifier(attemptId, "Attempt ID");
    return `refs/app-factory/attempts/${attemptId}`;
  }

  #brokerIdentity(): Readonly<Record<string, string>> {
    return {
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_AUTHOR_EMAIL: "broker@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Broker",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_EMAIL: "broker@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Broker",
    };
  }

  #brokerCommitMessage(expectation: BrokerCommitExpectation): Buffer {
    return Buffer.from(
      [
        "App Factory verified change",
        "",
        `Base: ${expectation.baseSha}`,
        `Candidate-Tree: ${expectation.candidateTreeId}`,
        `Candidate-Digest: ${expectation.diffDigest}`,
        `App-Factory-Attempt: ${expectation.attemptId}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  #readBrokerCommitOrNull(
    mirror: FactoryMirror,
    expectation: BrokerCommitExpectation,
  ): BrokerCommitRecord | null {
    const refName = this.#brokerRefName(expectation.attemptId);
    const lookup = this.#gitBare(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      ["rev-parse", "--verify", "--quiet", `${refName}^{commit}`],
      [0, 1],
    );
    if (lookup.status === 1) return null;
    const commitSha = lookup.stdout.toString("ascii").trim();
    assertExplicitSha(commitSha, "Broker commit SHA");

    const ancestry = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "rev-list",
      "--parents",
      "-n",
      "1",
      commitSha,
    ])
      .stdout.toString("ascii")
      .trim()
      .split(" ");
    if (ancestry.length !== 2 || ancestry[0] !== commitSha || ancestry[1] !== expectation.baseSha) {
      throw new GitWorkspaceError(
        `Broker attempt marker conflicts with the expected base: ${expectation.attemptId}`,
      );
    }
    const tree = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "rev-parse",
      "--verify",
      `${commitSha}^{tree}`,
    ])
      .stdout.toString("ascii")
      .trim();
    if (tree !== expectation.candidateTreeId) {
      throw new GitWorkspaceError(
        `Broker attempt marker conflicts with the expected tree: ${expectation.attemptId}`,
      );
    }

    const rawCommit = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "cat-file",
      "commit",
      commitSha,
    ]).stdout;
    const separator = rawCommit.indexOf(Buffer.from("\n\n"));
    if (separator < 0) {
      throw new GitWorkspaceError("Broker commit object has no message separator");
    }
    const headers = rawCommit.subarray(0, separator).toString("utf8");
    const expectedHeaders = [
      `tree ${expectation.candidateTreeId}`,
      `parent ${expectation.baseSha}`,
      "author App Factory Broker <broker@app-factory.invalid> 946684800 +0000",
      "committer App Factory Broker <broker@app-factory.invalid> 946684800 +0000",
    ];
    if (headers !== expectedHeaders.join("\n")) {
      throw new GitWorkspaceError("Broker attempt marker points to a commit with foreign identity");
    }
    const message = rawCommit.subarray(separator + 2);
    if (!message.equals(this.#brokerCommitMessage(expectation))) {
      throw new GitWorkspaceError(
        `Broker attempt marker conflicts with the expected commit message: ${expectation.attemptId}`,
      );
    }
    return {
      schemaVersion: 1,
      attemptId: expectation.attemptId,
      attemptMarker: expectation.attemptId,
      refName,
      baseSha: expectation.baseSha,
      candidateTreeId: expectation.candidateTreeId,
      diffDigest: expectation.diffDigest,
      commitSha,
      commitDigest: sha256(rawCommit),
    };
  }

  #workspacePublicationIntentPath(
    mirror: FactoryMirror,
    kind: WorkspaceKind,
    attemptId: string,
    candidateTreeId: string | null,
  ): string {
    const workspaceIntentRoot = this.#publicationDirectory(mirror.runtimeRoot, "workspaces");
    const repositoryIntentRoot = safeChild(workspaceIntentRoot, mirror.repositoryId);
    ensurePrivateDirectory(repositoryIntentRoot);
    const suffix =
      kind === "attempt" ? "attempt" : `verification-${(candidateTreeId as string).slice(0, 16)}`;
    return safeChild(repositoryIntentRoot, `${suffix}-${attemptId}.json`);
  }

  #reconcileWorkspacePublication(
    mirror: FactoryMirror,
    intentPath: string,
    expected: Readonly<{
      kind: WorkspaceKind;
      attemptId: string;
      baseSha: string;
      initialHeadSha: string;
      candidateTreeId: string | null;
    }>,
  ): FactoryWorkspaceRecord | null {
    if (!existsSync(intentPath)) return null;
    const intent = parseWorkspacePublicationIntent(readPrivateJson(intentPath));
    if (
      intent.workspaceKind !== expected.kind ||
      intent.repositoryId !== mirror.repositoryId ||
      intent.attemptId !== expected.attemptId ||
      intent.runtimeRoot !== mirror.runtimeRoot ||
      intent.mirrorPath !== mirror.mirrorPath ||
      intent.baseSha !== expected.baseSha ||
      intent.initialHeadSha !== expected.initialHeadSha ||
      intent.candidateTreeId !== expected.candidateTreeId ||
      intent.readOnly !== (expected.kind === "verification")
    ) {
      throw new GitWorkspaceError("Pending workspace publication has conflicting bindings");
    }
    const expectedRoot = safeChild(
      mirror.runtimeRoot,
      expected.kind === "attempt" ? "worktrees" : "verification",
      mirror.repositoryId,
    );
    const expectedName =
      expected.kind === "attempt"
        ? expected.attemptId
        : `${expected.attemptId}-${(expected.candidateTreeId as string).slice(0, 16)}-${intent.ownershipNonce}`;
    if (intent.worktreePath !== safeChild(expectedRoot, expectedName)) {
      throw new GitWorkspaceError("Pending workspace publication targets an unexpected path");
    }

    if (existsSync(intent.worktreePath)) {
      assertRealDirectory(intent.worktreePath, "Pending Factory worktree");
      let gitDirectoryPath: string | null = null;
      try {
        gitDirectoryPath = this.#absoluteGitDirectory(mirror.runtimeRoot, intent.worktreePath);
      } catch {
        // An interrupted `git worktree add` may not yet have a usable backlink.
      }
      if (gitDirectoryPath !== null) {
        const markerPath = safeChild(gitDirectoryPath, MARKER_FILE);
        if (existsSync(markerPath)) {
          const record = parseWorkspaceRecord(readPrivateJson(markerPath));
          const expectedRecord: FactoryWorkspaceRecord = {
            schemaVersion: 1,
            kind: intent.workspaceKind,
            repositoryId: intent.repositoryId,
            attemptId: intent.attemptId,
            runtimeRoot: intent.runtimeRoot,
            mirrorPath: intent.mirrorPath,
            worktreePath: intent.worktreePath,
            gitDirectoryPath,
            baseSha: intent.baseSha,
            initialHeadSha: intent.initialHeadSha,
            candidateTreeId: intent.candidateTreeId,
            ownershipNonce: intent.ownershipNonce,
            readOnly: intent.readOnly,
          };
          if (!sameRecord(record, expectedRecord)) {
            throw new GitWorkspaceError("Published workspace marker conflicts with its intent");
          }
          const verified = this.#validateWorkspaceRecord(record, expected.kind);
          removePrivateJson(intentPath);
          return verified;
        }
      }
      if (intent.readOnly) restoreOwnerWriteRecursively(intent.worktreePath);
      try {
        this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
          "worktree",
          "remove",
          "--force",
          intent.worktreePath,
        ]);
      } catch {
        if (existsSync(intent.worktreePath)) {
          assertRealDirectory(intent.worktreePath, "Interrupted Factory worktree");
          rmSync(intent.worktreePath, { recursive: true, force: false });
          synchronizeDirectory(expectedRoot);
        }
      }
    }
    this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, ["worktree", "prune", "--expire=now"]);
    removePrivateJson(intentPath);
    return null;
  }

  #createWorkspace(
    mirrorInput: FactoryMirror,
    kind: WorkspaceKind,
    attemptId: string,
    baseSha: string,
    initialHeadSha: string,
    candidateTreeId: string | null,
  ): FactoryWorkspaceRecord {
    const mirror = this.#validateMirror(mirrorInput);
    assertIdentifier(attemptId, "Attempt ID");
    assertExplicitSha(baseSha, "Base SHA");
    assertExplicitSha(initialHeadSha, "Initial HEAD SHA");
    if ((kind === "verification") !== (candidateTreeId !== null)) {
      throw new GitWorkspaceError("Candidate tree is required only for verification workspaces");
    }
    if (candidateTreeId !== null) {
      assertExplicitSha(candidateTreeId, "Candidate tree ID");
    }
    const resolvedBase = this.#resolveCommit(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      baseSha,
      "Base SHA",
    );
    const resolvedHead = this.#resolveCommit(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      initialHeadSha,
      "Initial HEAD SHA",
    );
    if (resolvedBase !== baseSha || resolvedHead !== initialHeadSha) {
      throw new GitWorkspaceError("Workspace commits must resolve exactly to their supplied SHAs");
    }
    this.#validateTreeBeforeCheckout(mirror, initialHeadSha);

    const categoryRoot = safeChild(
      mirror.runtimeRoot,
      kind === "attempt" ? "worktrees" : "verification",
    );
    ensurePrivateDirectory(categoryRoot);
    const repositoryRoot = safeChild(categoryRoot, mirror.repositoryId);
    ensurePrivateDirectory(repositoryRoot);
    const intentPath = this.#workspacePublicationIntentPath(
      mirror,
      kind,
      attemptId,
      candidateTreeId,
    );
    const recovered = this.#reconcileWorkspacePublication(mirror, intentPath, {
      kind,
      attemptId,
      baseSha,
      initialHeadSha,
      candidateTreeId,
    });
    if (recovered !== null) return recovered;
    const ownershipNonce = randomUUID();
    const directoryName =
      kind === "attempt"
        ? attemptId
        : `${attemptId}-${(candidateTreeId as string).slice(0, 16)}-${ownershipNonce}`;
    const worktreePath = safeChild(repositoryRoot, directoryName);
    if (existsSync(worktreePath)) {
      throw new GitWorkspaceError(`Deterministic worktree path already exists: ${worktreePath}`);
    }

    const intent: WorkspacePublicationIntent = {
      schemaVersion: 1,
      kind: "workspace-publication",
      workspaceKind: kind,
      repositoryId: mirror.repositoryId,
      attemptId,
      runtimeRoot: mirror.runtimeRoot,
      mirrorPath: mirror.mirrorPath,
      worktreePath,
      baseSha,
      initialHeadSha,
      candidateTreeId,
      ownershipNonce,
      readOnly: kind === "verification",
    };
    writePrivateJson(intentPath, intent, true);
    this.#publicationCheckpoint?.("workspace-after-intent", worktreePath);

    this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "worktree",
      "add",
      "--detach",
      worktreePath,
      initialHeadSha,
    ]);
    this.#publicationCheckpoint?.("workspace-after-git", worktreePath);
    assertRealDirectory(worktreePath, "Factory worktree");
    const gitDirectoryPath = this.#absoluteGitDirectory(mirror.runtimeRoot, worktreePath);
    assertPathWithin(mirror.mirrorPath, gitDirectoryPath, "Worktree Git directory");
    const record: FactoryWorkspaceRecord = {
      schemaVersion: 1,
      kind,
      repositoryId: mirror.repositoryId,
      attemptId,
      runtimeRoot: mirror.runtimeRoot,
      mirrorPath: mirror.mirrorPath,
      worktreePath,
      gitDirectoryPath,
      baseSha,
      initialHeadSha,
      candidateTreeId,
      ownershipNonce,
      readOnly: kind === "verification",
    };
    if (kind === "verification") {
      removeOwnerWriteRecursively(worktreePath);
    }
    writePrivateJson(safeChild(gitDirectoryPath, MARKER_FILE), record, true);
    this.#publicationCheckpoint?.("workspace-after-marker", worktreePath);
    removePrivateJson(intentPath);
    return record;
  }

  #validateWorkspaceRecord(
    recordInput: FactoryWorkspaceRecord,
    expectedKind: WorkspaceKind,
  ): FactoryWorkspaceRecord {
    const record = parseWorkspaceRecord(recordInput);
    if (record.kind !== expectedKind) {
      throw new GitWorkspaceError(`Expected a ${expectedKind} workspace record`);
    }
    const runtimeRoot = this.#ensureRuntimeRoot(record.runtimeRoot);
    if (runtimeRoot !== record.runtimeRoot) {
      throw new GitWorkspaceError("Workspace runtime root changed identity");
    }
    assertRealDirectory(record.mirrorPath, "Factory mirror");
    assertRealDirectory(record.worktreePath, "Factory worktree");
    const expectedRoot = safeChild(
      record.runtimeRoot,
      record.kind === "attempt" ? "worktrees" : "verification",
      record.repositoryId,
    );
    assertPathWithin(expectedRoot, record.worktreePath, "Worktree path");
    const expectedName =
      record.kind === "attempt"
        ? record.attemptId
        : `${record.attemptId}-${(record.candidateTreeId as string).slice(0, 16)}-${record.ownershipNonce}`;
    if (record.worktreePath !== safeChild(expectedRoot, expectedName)) {
      throw new GitWorkspaceError("Worktree path is not the deterministic Factory path");
    }
    const actualGitDirectory = this.#absoluteGitDirectory(runtimeRoot, record.worktreePath);
    if (actualGitDirectory !== record.gitDirectoryPath) {
      throw new GitWorkspaceError("Worktree Git directory does not match its ownership record");
    }
    assertPathWithin(record.mirrorPath, actualGitDirectory, "Worktree Git directory");
    const common = this.#git(runtimeRoot, [
      "-C",
      record.worktreePath,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ])
      .stdout.toString("utf8")
      .trim();
    if (common !== record.mirrorPath) {
      throw new GitWorkspaceError("Worktree is not attached to its recorded Factory mirror");
    }
    const marker = parseWorkspaceRecord(
      readPrivateJson(safeChild(actualGitDirectory, MARKER_FILE)),
    );
    if (!sameRecord(marker, record)) {
      throw new GitWorkspaceError("Workspace ownership marker does not match the supplied record");
    }
    if (record.kind === "attempt" && record.initialHeadSha !== record.baseSha) {
      throw new GitWorkspaceError("Attempt workspace was not created at its recorded base SHA");
    }
    if (record.kind === "verification") {
      const recordedTree = this.#gitBare(runtimeRoot, record.mirrorPath, [
        "rev-parse",
        "--verify",
        `${record.initialHeadSha}^{tree}`,
      ])
        .stdout.toString("ascii")
        .trim();
      if (recordedTree !== record.candidateTreeId) {
        throw new GitWorkspaceError(
          "Verification workspace commit no longer matches its candidate tree",
        );
      }
    }
    return record;
  }

  #validateMirror(mirrorInput: FactoryMirror): FactoryMirror {
    const runtimeRoot = this.#ensureRuntimeRoot(mirrorInput.runtimeRoot);
    const marker = parseMirrorMarker(mirrorInput);
    const expectedMirrorPath = safeChild(runtimeRoot, "mirrors", `${marker.repositoryId}.git`);
    if (marker.mirrorPath !== expectedMirrorPath) {
      throw new GitWorkspaceError("Mirror path is not the deterministic Factory path");
    }
    assertRealDirectory(marker.mirrorPath, "Factory mirror");
    const diskMarker = parseMirrorMarker(
      readPrivateJson(safeChild(marker.mirrorPath, MIRROR_MARKER_FILE)),
    );
    if (!canonicalJson(marker).equals(canonicalJson(diskMarker))) {
      throw new GitWorkspaceError("Mirror ownership marker does not match the supplied mirror");
    }
    this.#assertBareRepository(runtimeRoot, marker.mirrorPath);
    return { ...marker, runtimeRoot };
  }

  #validateSource(runtimeRoot: string, sourcePath: string): string {
    assertNormalizedAbsolute(sourcePath, "Source repository path");
    assertRealDirectory(sourcePath, "Source repository");
    const topLevel = this.#git(runtimeRoot, ["-C", sourcePath, "rev-parse", "--show-toplevel"])
      .stdout.toString("utf8")
      .trim();
    if (topLevel !== sourcePath) {
      throw new GitWorkspaceError("Source repository path must name the repository root exactly");
    }
    return sourcePath;
  }

  #ensureRuntimeRoot(runtimeRoot: string): string {
    assertNormalizedAbsolute(runtimeRoot, "Runtime root");
    ensurePrivateDirectory(runtimeRoot);
    return realpathSync(runtimeRoot);
  }

  #assertBareRepository(runtimeRoot: string, mirrorPath: string): void {
    const result = this.#gitBare(runtimeRoot, mirrorPath, ["rev-parse", "--is-bare-repository"]);
    if (result.stdout.toString("utf8").trim() !== "true") {
      throw new GitWorkspaceError("Factory mirror is not a bare Git repository");
    }
  }

  #resolveCommit(
    runtimeRoot: string,
    repositoryPath: string,
    revision: string,
    label: string,
  ): string {
    const result = this.#git(runtimeRoot, [
      "-C",
      repositoryPath,
      "rev-parse",
      "--verify",
      `${revision}^{commit}`,
    ])
      .stdout.toString("utf8")
      .trim();
    assertExplicitSha(result, label);
    return result;
  }

  #absoluteGitDirectory(runtimeRoot: string, worktreePath: string): string {
    const value = this.#git(runtimeRoot, ["-C", worktreePath, "rev-parse", "--absolute-git-dir"])
      .stdout.toString("utf8")
      .trim();
    assertNormalizedAbsolute(value, "Worktree Git directory");
    assertRealDirectory(value, "Worktree Git directory");
    return value;
  }

  #objectSize(
    record: Pick<FactoryWorkspaceRecord, "runtimeRoot" | "mirrorPath">,
    objectId: string,
  ): number {
    const raw = this.#gitBare(record.runtimeRoot, record.mirrorPath, ["cat-file", "-s", objectId])
      .stdout.toString("ascii")
      .trim();
    const size = Number(raw);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new GitWorkspaceError(`Git returned an invalid object size: ${raw}`);
    }
    return size;
  }

  #listWorkingChanges(record: FactoryWorkspaceRecord): readonly WorkingChange[] {
    const unmerged = this.#git(record.runtimeRoot, [
      "-C",
      record.worktreePath,
      "ls-files",
      "--unmerged",
      "-z",
    ]).stdout;
    if (unmerged.length !== 0) {
      throw new GitWorkspaceError("Unmerged index entries are not allowed in a candidate");
    }

    const tracked = parseRawChanges(
      this.#git(record.runtimeRoot, [
        "-C",
        record.worktreePath,
        "diff",
        "--raw",
        "--no-abbrev",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--ignore-submodules=none",
        "-z",
        record.baseSha,
        "--",
      ]).stdout,
    );
    const byPath = new Map<string, WorkingChange>();
    for (const entry of tracked) {
      if (!["A", "D", "M", "T"].includes(entry.status)) {
        throw new GitWorkspaceError(
          `Unsupported dirty-worktree status ${entry.status}: ${entry.path}`,
        );
      }
      byPath.set(entry.path, {
        status: entry.status as WorkingChange["status"],
        path: entry.path,
      });
    }

    const untracked = this.#git(record.runtimeRoot, [
      "-C",
      record.worktreePath,
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
    ]).stdout;
    for (const pathBytes of splitNull(untracked)) {
      if (pathBytes.length === 0) {
        continue;
      }
      const path = decodeGitPath(pathBytes);
      if (byPath.has(path)) {
        throw new GitWorkspaceError(`Git reported a candidate path more than once: ${path}`);
      }
      byPath.set(path, { status: "A", path });
    }
    return [...byPath.values()].sort((left, right) =>
      Buffer.from(left.path).compare(Buffer.from(right.path)),
    );
  }

  #lstatOrNull(path: string): Stats | null {
    try {
      return lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  #snapshotWorkingEntry(
    record: FactoryWorkspaceRecord,
    path: string,
    maxChangedFileBytes: number,
  ): WorkingEntrySnapshot {
    assertSafeGitPath(path);
    this.#assertFilesystemPathHasNoSymlinkAncestor(record.worktreePath, path);
    const absolutePath = safeChild(record.worktreePath, ...path.split("/"));
    const initial = this.#lstatOrNull(absolutePath);
    if (initial === null) {
      throw new GitWorkspaceError(`Candidate path disappeared during verification: ${path}`);
    }
    if (initial.nlink !== 1) {
      throw new GitWorkspaceError(`Candidate path has multiple hard links: ${path}`);
    }
    if (initial.isSymbolicLink()) {
      const bytes = readlinkSync(absolutePath, { encoding: "buffer" });
      this.#validateSymlinkTargetBytes(path, bytes);
      if (bytes.length > maxChangedFileBytes) {
        throw new GitWorkspaceError(
          `Changed file exceeds ${maxChangedFileBytes} bytes: ${path} (${bytes.length} bytes)`,
        );
      }
      const final = lstatSync(absolutePath);
      if (
        !final.isSymbolicLink() ||
        final.dev !== initial.dev ||
        final.ino !== initial.ino ||
        final.mtimeMs !== initial.mtimeMs ||
        final.ctimeMs !== initial.ctimeMs
      ) {
        throw new GitWorkspaceError(`Candidate symbolic link changed while being read: ${path}`);
      }
      return {
        path,
        mode: "120000",
        bytes,
        digest: sha256(bytes),
        sizeBytes: bytes.length,
      };
    }
    if (!initial.isFile()) {
      throw new GitWorkspaceError(`Candidate path is not a regular file: ${path}`);
    }
    if (initial.size > maxChangedFileBytes) {
      throw new GitWorkspaceError(
        `Changed file exceeds ${maxChangedFileBytes} bytes: ${path} (${initial.size} bytes)`,
      );
    }

    const descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let opened: Stats;
    let bytes: Buffer;
    let afterRead: Stats;
    try {
      opened = fstatSync(descriptor);
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== initial.dev ||
        opened.ino !== initial.ino
      ) {
        throw new GitWorkspaceError(`Candidate path changed before it could be read: ${path}`);
      }
      bytes = readFileSync(descriptor);
      afterRead = fstatSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const final = lstatSync(absolutePath);
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.nlink !== 1 ||
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs ||
      final.ctimeMs !== initial.ctimeMs ||
      afterRead.size !== opened.size ||
      afterRead.nlink !== 1 ||
      afterRead.mtimeMs !== opened.mtimeMs ||
      afterRead.ctimeMs !== opened.ctimeMs ||
      bytes.length !== initial.size
    ) {
      throw new GitWorkspaceError(`Candidate file changed while being read: ${path}`);
    }
    const text = bytes.toString("utf8");
    if (bytes.includes(0) || !Buffer.from(text, "utf8").equals(bytes)) {
      throw new GitWorkspaceError(`Binary diffs are not allowed: ${path}`);
    }
    return {
      path,
      mode: (initial.mode & 0o111) === 0 ? "100644" : "100755",
      bytes,
      digest: sha256(bytes),
      sizeBytes: bytes.length,
    };
  }

  #synthesizeCandidateTree(
    record: FactoryWorkspaceRecord,
    changes: readonly WorkingChange[],
    snapshots: ReadonlyMap<string, WorkingEntrySnapshot>,
  ): string {
    const indexesRoot = safeChild(record.runtimeRoot, "indexes");
    ensurePrivateDirectory(indexesRoot);
    const indexPath = safeChild(indexesRoot, `${randomUUID()}.index`);
    const indexEnvironment = { GIT_INDEX_FILE: indexPath };
    try {
      this.#gitBare(record.runtimeRoot, record.mirrorPath, ["read-tree", record.baseSha], [0], {
        env: indexEnvironment,
      });
      for (const change of changes) {
        if (change.status === "D") {
          this.#gitBare(
            record.runtimeRoot,
            record.mirrorPath,
            ["update-index", "--force-remove", "--", change.path],
            [0],
            { env: indexEnvironment },
          );
          continue;
        }
        const snapshot = snapshots.get(change.path);
        if (snapshot === undefined) {
          throw new GitWorkspaceError(`Candidate snapshot is missing: ${change.path}`);
        }
        const objectId = this.#gitBare(
          record.runtimeRoot,
          record.mirrorPath,
          ["hash-object", "-w", "--no-filters", "--stdin"],
          [0],
          { input: snapshot.bytes },
        )
          .stdout.toString("ascii")
          .trim();
        assertExplicitSha(objectId, "Candidate blob ID");
        this.#gitBare(
          record.runtimeRoot,
          record.mirrorPath,
          ["update-index", "--add", "--cacheinfo", `${snapshot.mode},${objectId},${change.path}`],
          [0],
          { env: indexEnvironment },
        );
      }
      const treeId = this.#gitBare(record.runtimeRoot, record.mirrorPath, ["write-tree"], [0], {
        env: indexEnvironment,
      })
        .stdout.toString("ascii")
        .trim();
      assertExplicitSha(treeId, "Candidate tree ID");
      const type = this.#gitBare(record.runtimeRoot, record.mirrorPath, ["cat-file", "-t", treeId])
        .stdout.toString("ascii")
        .trim();
      if (type !== "tree") {
        throw new GitWorkspaceError("Synthesized candidate object is not a Git tree");
      }
      return treeId;
    } finally {
      this.#unlinkKnownRegular(indexPath);
      this.#unlinkKnownRegular(`${indexPath}.lock`);
    }
  }

  #unlinkKnownRegular(path: string): void {
    const stats = this.#lstatOrNull(path);
    if (stats === null) {
      return;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new GitWorkspaceError(`Refusing to remove a non-regular temporary index: ${path}`);
    }
    unlinkSync(path);
  }

  #createVerificationCommit(mirror: FactoryMirror, verification: CandidateVerification): string {
    assertExplicitSha(verification.candidateTreeId, "Candidate tree ID");
    if (!/^sha256:[0-9a-f]{64}$/u.test(verification.diffDigest)) {
      throw new GitWorkspaceError("Candidate diff digest is invalid");
    }
    const type = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "cat-file",
      "-t",
      verification.candidateTreeId,
    ])
      .stdout.toString("ascii")
      .trim();
    if (type !== "tree") {
      throw new GitWorkspaceError("Candidate tree ID does not identify a Git tree");
    }
    const message = Buffer.from(
      [
        "App Factory trusted verification",
        "",
        `Base: ${verification.baseSha}`,
        `Candidate-Tree: ${verification.candidateTreeId}`,
        `Candidate-Digest: ${verification.diffDigest}`,
        "",
      ].join("\n"),
      "utf8",
    );
    const fixedIdentity = {
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_AUTHOR_EMAIL: "verifier@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Verifier",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_EMAIL: "verifier@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Verifier",
    };
    const commitSha = this.#gitBare(
      mirror.runtimeRoot,
      mirror.mirrorPath,
      ["commit-tree", verification.candidateTreeId, "-p", verification.baseSha],
      [0],
      { env: fixedIdentity, input: message },
    )
      .stdout.toString("ascii")
      .trim();
    assertExplicitSha(commitSha, "Verification commit SHA");
    const resolvedTree = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "rev-parse",
      "--verify",
      `${commitSha}^{tree}`,
    ])
      .stdout.toString("ascii")
      .trim();
    if (resolvedTree !== verification.candidateTreeId) {
      throw new GitWorkspaceError("Verification commit does not contain the candidate tree");
    }
    return commitSha;
  }

  #validateTreeBeforeCheckout(mirror: FactoryMirror, headSha: string): void {
    const treeBytes = this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      headSha,
    ]).stdout;
    const entries = parseTree(treeBytes);
    const byPath = validateTree(entries);
    if (byPath.has(".gitmodules")) {
      throw new GitWorkspaceError("Repositories containing .gitmodules are not allowed");
    }
    const recordView = { runtimeRoot: mirror.runtimeRoot, mirrorPath: mirror.mirrorPath };
    for (const entry of entries) {
      if (entry.mode === "120000") {
        this.#validateSymlinkBlob(recordView, headSha, entry.path);
      }
    }
  }

  #validateSymlinkBlob(
    record: Pick<FactoryWorkspaceRecord, "runtimeRoot" | "mirrorPath">,
    headSha: string,
    path: string,
  ): void {
    const targetBytes = this.#gitBare(record.runtimeRoot, record.mirrorPath, [
      "show",
      `${headSha}:${path}`,
    ]).stdout;
    this.#validateSymlinkTargetBytes(path, targetBytes);
  }

  #validateSymlinkTargetBytes(path: string, targetBytes: Buffer): void {
    const target = targetBytes.toString("utf8");
    if (
      target.length === 0 ||
      !Buffer.from(target, "utf8").equals(targetBytes) ||
      target.includes("\\") ||
      target.includes("\0") ||
      containsControlCharacter(target) ||
      posix.isAbsolute(target)
    ) {
      throw new GitWorkspaceError(`Changed symbolic link has an unsafe target: ${path}`);
    }
    const resolved = posix.normalize(posix.join(posix.dirname(path), target));
    if (resolved === ".." || resolved.startsWith("../") || posix.isAbsolute(resolved)) {
      throw new GitWorkspaceError(`Changed symbolic link escapes the repository: ${path}`);
    }
    const caseFoldedResolved = resolved.toLowerCase();
    if (caseFoldedResolved === ".git" || caseFoldedResolved.startsWith(".git/")) {
      throw new GitWorkspaceError(`Changed symbolic link targets Git administration data: ${path}`);
    }
  }

  #assertFilesystemPathHasNoSymlinkAncestor(worktreeRoot: string, path: string): void {
    const parts = path.split("/");
    let cursor = worktreeRoot;
    for (const part of parts) {
      cursor = safeChild(cursor, part);
      if (!existsSync(cursor)) {
        return;
      }
      const stats = lstatSync(cursor);
      if (stats.isSymbolicLink()) {
        if (cursor !== safeChild(worktreeRoot, ...parts)) {
          throw new GitWorkspaceError(`Changed path traverses a symbolic link: ${path}`);
        }
        return;
      }
    }
  }

  #assertNoBinaryDiffs(
    record: Pick<FactoryWorkspaceRecord, "runtimeRoot" | "mirrorPath">,
    baseSha: string,
    headSha: string,
    changed: readonly RawChangedPath[],
  ): void {
    const output = this.#gitBare(record.runtimeRoot, record.mirrorPath, [
      "diff",
      "--numstat",
      "--no-renames",
      "-z",
      baseSha,
      headSha,
      "--",
    ]).stdout;
    for (const row of splitNull(output)) {
      if (row.length === 0) {
        continue;
      }
      const firstTab = row.indexOf(0x09);
      const secondTab = firstTab < 0 ? -1 : row.indexOf(0x09, firstTab + 1);
      if (firstTab < 0 || secondTab < 0) {
        throw new GitWorkspaceError("Git returned an invalid numstat record");
      }
      const added = row.subarray(0, firstTab).toString("ascii");
      const deleted = row.subarray(firstTab + 1, secondTab).toString("ascii");
      const path = decodeGitPath(row.subarray(secondTab + 1));
      if (added === "-" || deleted === "-") {
        throw new GitWorkspaceError(`Binary diffs are not allowed: ${path}`);
      }
    }
    const checkedObjects = new Set<string>();
    for (const item of changed) {
      for (const objectId of [item.oldObjectId, item.newObjectId]) {
        if (/^0+$/u.test(objectId) || checkedObjects.has(objectId)) {
          continue;
        }
        checkedObjects.add(objectId);
        const type = this.#gitBare(record.runtimeRoot, record.mirrorPath, [
          "cat-file",
          "-t",
          objectId,
        ])
          .stdout.toString("ascii")
          .trim();
        if (type !== "blob") {
          continue;
        }
        const bytes = this.#gitBare(record.runtimeRoot, record.mirrorPath, [
          "cat-file",
          "blob",
          objectId,
        ]).stdout;
        const text = bytes.toString("utf8");
        if (bytes.includes(0) || !Buffer.from(text, "utf8").equals(bytes)) {
          throw new GitWorkspaceError(`Binary diffs are not allowed: ${item.path}`);
        }
      }
    }
  }

  #gitBare(
    runtimeRoot: string,
    gitDirectory: string,
    args: readonly string[],
    allowedStatuses: readonly number[] = [0],
    options: GitInvocationOptions = {},
  ): GitResult {
    return this.#git(runtimeRoot, ["--git-dir", gitDirectory, ...args], allowedStatuses, options);
  }

  #git(
    runtimeRoot: string,
    args: readonly string[],
    allowedStatuses: readonly number[] = [0],
    options: GitInvocationOptions = {},
  ): GitResult {
    const homePath = safeChild(runtimeRoot, "git-home");
    ensurePrivateDirectory(homePath);
    const result = spawnSync(
      this.#gitExecutable,
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args],
      {
        cwd: runtimeRoot,
        env: {
          GIT_ASKPASS: "/bin/false",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_SYSTEM: "/dev/null",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_TERMINAL_PROMPT: "0",
          HOME: homePath,
          LC_ALL: "C",
          PATH: "/usr/bin:/bin",
          ...options.env,
        },
        encoding: "buffer",
        input: options.input,
        maxBuffer: GIT_OUTPUT_LIMIT,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60_000,
      },
    );
    if (result.error !== undefined) {
      throw new GitWorkspaceError(`Git could not be executed: ${result.error.message}`);
    }
    const status = result.status ?? -1;
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    if (!allowedStatuses.includes(status)) {
      const detail = stderr.toString("utf8").trim().slice(0, 2_000);
      throw new GitWorkspaceError(
        `Git command failed (${status}): ${args[0] ?? "unknown"}${detail.length > 0 ? `: ${detail}` : ""}`,
      );
    }
    return { status, stdout, stderr };
  }
}
