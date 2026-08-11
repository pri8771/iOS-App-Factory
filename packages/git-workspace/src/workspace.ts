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
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const DEFAULT_MAX_CHANGED_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DIFF_BYTES = 5 * 1024 * 1024;
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const MARKER_FILE = "app-factory-owner.json";
const MIRROR_MARKER_FILE = "app-factory-mirror.json";

type WorkspaceKind = "attempt" | "verification";

type MirrorMarker = Readonly<{
  schemaVersion: 1;
  repositoryId: string;
  sourceRepositoryPath: string;
  mirrorPath: string;
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

export type CandidatePolicy = Readonly<{
  authorizedScopes: readonly string[];
  maxChangedFileBytes?: number;
  maxDiffBytes?: number;
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

export type GitWorkspaceManagerOptions = Readonly<{
  gitExecutable?: string;
  verificationCheckpoint?: (worktreePath: string) => void;
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

function readPrivateJson(path: string): unknown {
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

export function classifyProtectedPath(path: string): string | null {
  assertSafeGitPath(path);
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  const basename = segments.at(-1) as string;
  const extension = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")) : "";

  if (
    segments.some((segment) =>
      [
        "test",
        "tests",
        "__tests__",
        "uitests",
        "unittests",
        "integrationtests",
        "snapshots",
        "__snapshots__",
      ].includes(segment),
    ) ||
    /(?:^|\.)test\.[^.]+$/u.test(basename) ||
    /(?:^|\.)spec\.[^.]+$/u.test(basename) ||
    /tests?\.swift$/u.test(basename)
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
      [".codex", ".cursor", ".claude", "policy", "policies", "rules", "guardrails"].includes(
        segment,
      ),
    ) ||
    lower.includes("ios_app_factory_rules")
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

  if (
    segments.includes("fastlane") ||
    segments.includes("release") ||
    segments.includes("signing") ||
    basename === "exportoptions.plist" ||
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

  constructor(options: GitWorkspaceManagerOptions = {}) {
    this.#gitExecutable = options.gitExecutable ?? "/usr/bin/git";
    this.#verificationCheckpoint = options.verificationCheckpoint;
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

    if (!existsSync(mirrorPath)) {
      this.#git(runtimeRoot, ["clone", "--mirror", "--no-local", "--", source, mirrorPath]);
      assertRealDirectory(mirrorPath, "Factory mirror");
      writePrivateJson(safeChild(mirrorPath, MIRROR_MARKER_FILE), marker, true);
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

  createAttemptWorkspace(
    mirror: FactoryMirror,
    attemptId: string,
    baseSha: string,
  ): FactoryWorkspaceRecord {
    return this.#createWorkspace(mirror, "attempt", attemptId, baseSha, baseSha, null);
  }

  verifyCandidate(record: FactoryWorkspaceRecord, policy: CandidatePolicy): CandidateVerification {
    const verifiedRecord = this.#validateWorkspaceRecord(record, "attempt");
    const scopes = normalizeAuthorizedScopes(policy.authorizedScopes);
    const maxChangedFileBytes = parsePositiveLimit(
      policy.maxChangedFileBytes,
      DEFAULT_MAX_CHANGED_FILE_BYTES,
      "Maximum changed-file size",
    );
    const maxDiffBytes = parsePositiveLimit(
      policy.maxDiffBytes,
      DEFAULT_MAX_DIFF_BYTES,
      "Maximum diff size",
    );

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
    const treeBytes = this.#gitBare(verifiedRecord.runtimeRoot, verifiedRecord.mirrorPath, [
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

    const rawDiff = this.#gitBare(verifiedRecord.runtimeRoot, verifiedRecord.mirrorPath, [
      "diff",
      "--raw",
      "--no-abbrev",
      "--no-renames",
      "-z",
      verifiedRecord.baseSha,
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
          this.#validateSymlinkBlob(verifiedRecord, candidateTreeId, finalEntry.path);
        } else if (finalEntry.type !== "blob") {
          throw new GitWorkspaceError(`Unsupported changed tree entry: ${finalEntry.path}`);
        }
        sizeBytes = this.#objectSize(verifiedRecord, finalEntry.objectId);
        if (sizeBytes > maxChangedFileBytes) {
          throw new GitWorkspaceError(
            `Changed file exceeds ${maxChangedFileBytes} bytes: ${changed.path} (${sizeBytes} bytes)`,
          );
        }
        totalChangedFileBytes += sizeBytes;
      }
      changedPaths.push({ ...changed, sizeBytes });
    }

    this.#assertNoBinaryDiffs(verifiedRecord, verifiedRecord.baseSha, candidateTreeId, rawChanged);
    const patch = this.#gitBare(verifiedRecord.runtimeRoot, verifiedRecord.mirrorPath, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--full-index",
      "--binary",
      "--no-renames",
      verifiedRecord.baseSha,
      candidateTreeId,
      "--",
    ]).stdout;
    if (patch.length > maxDiffBytes) {
      throw new GitWorkspaceError(
        `Candidate diff exceeds ${maxDiffBytes} bytes (${patch.length} bytes)`,
      );
    }

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

    const digestInput = canonicalJson({
      baseSha: verifiedRecord.baseSha,
      candidateTreeId,
      changedPaths,
    });
    return {
      attemptId: verifiedRecord.attemptId,
      baseSha: verifiedRecord.baseSha,
      attemptHeadSha,
      candidateTreeId,
      changedPaths,
      diffBytes: patch.length,
      totalChangedFileBytes,
      diffDigest: sha256(Buffer.concat([digestInput, patch])),
      treeDigest: sha256(canonicalJson([...treeByPath.values()])),
    };
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
    const directoryName =
      kind === "attempt" ? attemptId : `${attemptId}-${(candidateTreeId as string).slice(0, 16)}`;
    const worktreePath = safeChild(repositoryRoot, directoryName);
    if (existsSync(worktreePath)) {
      throw new GitWorkspaceError(`Deterministic worktree path already exists: ${worktreePath}`);
    }

    this.#gitBare(mirror.runtimeRoot, mirror.mirrorPath, [
      "worktree",
      "add",
      "--detach",
      worktreePath,
      initialHeadSha,
    ]);
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
      ownershipNonce: randomUUID(),
      readOnly: kind === "verification",
    };
    writePrivateJson(safeChild(gitDirectoryPath, MARKER_FILE), record, true);
    if (kind === "verification") {
      removeOwnerWriteRecursively(worktreePath);
    }
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
        : `${record.attemptId}-${(record.candidateTreeId as string).slice(0, 16)}`;
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

  #objectSize(record: FactoryWorkspaceRecord, objectId: string): number {
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
      if (!opened.isFile() || opened.dev !== initial.dev || opened.ino !== initial.ino) {
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
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs ||
      final.ctimeMs !== initial.ctimeMs ||
      afterRead.size !== opened.size ||
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
    record: FactoryWorkspaceRecord,
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
