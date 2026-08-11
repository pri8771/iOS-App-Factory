import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import {
  EnrollmentIssueV1Schema,
  EnrollmentPlanV1Schema,
  EnrollmentScanV1Schema,
  GitAdminSnapshotV1Schema,
  ProjectInventoryV1Schema,
  RelativeProjectPathSchema,
  Sha256DigestSchema,
  type EnrollmentIssueCodeV1,
  type EnrollmentIssueV1,
  type EnrollmentPlanV1,
  type EnrollmentScanV1,
  type GitAdminEntryV1,
  type GitAdminSnapshotV1,
  type ProjectInventoryV1,
  type RelativeProjectPath,
  type Sha256Digest,
} from "./model.js";

const DEFAULT_MAX_SCAN_ENTRIES = 100_000;
const DEFAULT_MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_SINGLE_FILE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_RULE_FILE_BYTES = 256 * 1024;
const DEFAULT_MAX_GIT_ADMIN_BYTES = 32 * 1024 * 1024;
const HARD_MAX_GIT_ADMIN_BYTES = 64 * 1024 * 1024;
const MAX_ADMIN_FILE_BYTES = 256 * 1024 * 1024;
const MAX_ADMIN_DIRECTORY_ENTRIES = 1_000;
const MAX_ARTIFACT_PARSE_BYTES = 2 * 1024 * 1024;
const MAX_SYMBOLIC_LINK_DEPTH = 40;
const READ_BUFFER_BYTES = 64 * 1024;
const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".build",
  ".swiftpm",
  "DerivedData",
  "node_modules",
]);

type FileEntry = Readonly<{
  kind: "file";
  path: RelativeProjectPath;
  fullPath: string;
  mode: string;
  sizeBytes: number;
  digest: Sha256Digest;
}>;

type DirectoryEntry = Readonly<{
  kind: "directory";
  path: RelativeProjectPath;
  fullPath: string;
  mode: string;
  excluded: boolean;
}>;

type SymbolicLinkResolution = "inside" | "escape" | "broken" | "cycle";

type SymbolicLinkEntry = Readonly<{
  kind: "symbolic-link";
  path: RelativeProjectPath;
  fullPath: string;
  mode: string;
  target: string;
  resolution: SymbolicLinkResolution;
  traversesExcludedDirectory: boolean;
}>;

type ScanEntry = FileEntry | DirectoryEntry | SymbolicLinkEntry;

type SurfaceScan = Readonly<{
  entries: readonly ScanEntry[];
  digest: Sha256Digest;
  fileBytes: number;
  visitedEntryCount: number;
  excludedPaths: readonly RelativeProjectPath[];
}>;

type GitLayout = Readonly<{
  gitDirectory: string;
  commonDirectory: string;
  indexPath: string;
  objectFormat: "sha1" | "sha256";
  kind: "standard" | "linked-worktree";
}>;

type AdminFile = Readonly<{
  label: string;
  path: string | null;
  entry: GitAdminEntryV1;
  bytes: Buffer | null;
}>;

type AdminCapture = Readonly<{
  snapshot: GitAdminSnapshotV1;
  files: readonly AdminFile[];
}>;

type SnapshotAndEntries = Readonly<{
  snapshot: EnrollmentScanV1["before"];
  entries: readonly ScanEntry[];
}>;

type GitInvocationOptions = Readonly<{
  additionalEnvironment?: Readonly<Record<string, string>>;
  allowedStatuses?: readonly number[];
  maxOutputBytes?: number;
}>;

export type ExistingProjectScanOptions = Readonly<{
  repositoryRoot: string;
  maxScanEntries?: number;
  maxScannedFileBytes?: number;
  maxSingleFileBytes?: number;
  maxRuleFileBytes?: number;
  maxGitAdminBytes?: number;
  /** Test/observability seam. Any mutation it causes is detected before a result is returned. */
  quiescenceCheckpoint?: () => void;
}>;

export class EnrollmentScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentScanError";
  }
}

export class EnrollmentPreservationError extends EnrollmentScanError {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentPreservationError";
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => compareText(left, right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function projectDigest(value: unknown): Sha256Digest {
  return digestBytes(Buffer.from(canonicalJson(value), "utf8"));
}

function digestBytes(bytes: Buffer): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

function assertPositiveLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new EnrollmentScanError(`${label} must be a positive safe integer`);
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function toRelativePath(root: string, fullPath: string): RelativeProjectPath {
  return RelativeProjectPathSchema.parse(relative(root, fullPath).split(sep).join(posix.sep));
}

function modeString(stats: BigIntStats): string {
  return Number(stats.mode & 0o777n)
    .toString(8)
    .padStart(3, "0");
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function inspectDirectoryNoFollow(path: string): BigIntStats {
  const pathStats = lstatSync(path, { bigint: true });
  if (!pathStats.isDirectory() || pathStats.isSymbolicLink() || realpathSync(path) !== path) {
    throw new EnrollmentScanError("directory must be real and may not traverse symbolic links");
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new EnrollmentScanError(
      `directory could not be opened safely: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
    );
  }
  try {
    const descriptorStats = fstatSync(descriptor, { bigint: true });
    if (!descriptorStats.isDirectory() || !sameIdentity(pathStats, descriptorStats)) {
      throw new EnrollmentScanError("directory changed before descriptor verification");
    }
    return descriptorStats;
  } finally {
    closeSync(descriptor);
  }
}

function assertRepositoryRoot(repositoryRoot: string): string {
  if (!isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new EnrollmentScanError("repositoryRoot must be a normalized absolute path");
  }
  let stats: BigIntStats;
  try {
    stats = inspectDirectoryNoFollow(repositoryRoot);
  } catch (error) {
    throw new EnrollmentScanError(
      `repositoryRoot cannot be inspected: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
    );
  }
  if (typeof process.getuid === "function" && stats.uid !== BigInt(process.getuid())) {
    throw new EnrollmentScanError("repositoryRoot must be owned by the current user");
  }
  return repositoryRoot;
}

function gitEnvironment(
  additionalEnvironment: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  return {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    ...additionalEnvironment,
  };
}

function invokeGit(
  repositoryRoot: string,
  arguments_: readonly string[],
  options: GitInvocationOptions = {},
): Readonly<{ status: number; stdout: Buffer; stderr: Buffer }> {
  const result = spawnSync(
    "git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.preloadIndex=false",
      "-c",
      "core.untrackedCache=false",
      "-c",
      "core.excludesFile=/dev/null",
      "-c",
      "core.hooksPath=/dev/null",
      "-C",
      repositoryRoot,
      ...arguments_,
    ],
    {
      encoding: null,
      env: gitEnvironment(options.additionalEnvironment),
      maxBuffer: Math.min(options.maxOutputBytes ?? GIT_OUTPUT_LIMIT, GIT_OUTPUT_LIMIT),
      shell: false,
      timeout: 30_000,
    },
  );
  if (result.error !== undefined) {
    if (
      options.maxOutputBytes !== undefined &&
      (result.error as NodeJS.ErrnoException).code === "ENOBUFS"
    ) {
      throw new EnrollmentScanError("aggregate Git administrative byte budget was exceeded");
    }
    throw new EnrollmentScanError(`read-only Git inspection failed: ${result.error.message}`);
  }
  const status = result.status ?? -1;
  if (!(options.allowedStatuses ?? [0]).includes(status)) {
    const stderr = result.stderr.toString("utf8").trim().slice(0, 2_000);
    throw new EnrollmentScanError(
      `read-only Git inspection failed with status ${String(status)}${stderr === "" ? "" : `: ${stderr}`}`,
    );
  }
  return { status, stdout: result.stdout, stderr: result.stderr };
}

function gitText(repositoryRoot: string, arguments_: readonly string[]): string {
  return invokeGit(repositoryRoot, arguments_).stdout.toString("utf8").trim();
}

function resolveGitLayout(repositoryRoot: string): GitLayout {
  const topLevel = realpathSync(gitText(repositoryRoot, ["rev-parse", "--show-toplevel"]));
  if (topLevel !== repositoryRoot) {
    throw new EnrollmentScanError("repositoryRoot must equal the Git top-level directory");
  }
  const gitDirectory = realpathSync(
    gitText(repositoryRoot, ["rev-parse", "--path-format=absolute", "--absolute-git-dir"]),
  );
  const commonDirectory = realpathSync(
    gitText(repositoryRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  );
  const rawIndexPath = gitText(repositoryRoot, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "index",
  ]);
  const indexPath = isAbsolute(rawIndexPath)
    ? resolve(rawIndexPath)
    : resolve(repositoryRoot, rawIndexPath);
  if (!isWithinRoot(gitDirectory, indexPath) && !isWithinRoot(commonDirectory, indexPath)) {
    throw new EnrollmentScanError("Git index resolves outside the repository administrative roots");
  }
  for (const [label, directory] of [
    ["Git directory", gitDirectory],
    ["Git common directory", commonDirectory],
  ] as const) {
    try {
      inspectDirectoryNoFollow(directory);
    } catch {
      throw new EnrollmentScanError(`${label} must be a real directory without symbolic traversal`);
    }
  }
  const objectFormat = gitText(repositoryRoot, ["rev-parse", "--show-object-format"]);
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new EnrollmentScanError(`unsupported Git object format: ${objectFormat}`);
  }
  assertNoExternalGitFilters(repositoryRoot);
  return {
    gitDirectory,
    commonDirectory,
    indexPath,
    objectFormat,
    kind: gitDirectory === commonDirectory ? "standard" : "linked-worktree",
  };
}

function assertNoExternalGitFilters(repositoryRoot: string): void {
  const result = invokeGit(
    repositoryRoot,
    ["config", "--local", "--includes", "--null", "--name-only", "--get-regexp", "^filter\\."],
    { allowedStatuses: [0, 1] },
  );
  if (result.status === 0 && result.stdout.length > 0) {
    throw new EnrollmentScanError(
      "external Git filter configuration is unsupported by the read-only enrollment scanner",
    );
  }
}

function assertAdminPath(root: string, path: string): void {
  if (!isWithinRoot(root, path)) {
    throw new EnrollmentScanError("Git administrative path escaped its resolved root");
  }
  const relativePath = relative(root, path);
  if (relativePath === "") return;
  let current = root;
  const identities: Array<Readonly<{ path: string; stats: BigIntStats }>> = [];
  for (const segment of relativePath.split(sep)) {
    current = join(current, segment);
    let stats: BigIntStats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new EnrollmentScanError("Git administrative ancestor changed during inspection");
    }
    if (stats.isSymbolicLink()) {
      throw new EnrollmentScanError("Git administrative paths may not traverse symbolic links");
    }
    if (current !== path && !stats.isDirectory()) {
      throw new EnrollmentScanError("Git administrative ancestor is not a directory");
    }
    if (stats.isDirectory() && realpathSync(current) !== current) {
      throw new EnrollmentScanError("Git administrative ancestor changed during inspection");
    }
    if (stats.isDirectory() && !sameIdentity(stats, inspectDirectoryNoFollow(current))) {
      throw new EnrollmentScanError("Git administrative ancestor changed during inspection");
    }
    identities.push({ path: current, stats });
  }
  for (const identity of identities) {
    const after = lstatSync(identity.path, { bigint: true });
    if (!sameIdentity(identity.stats, after)) {
      throw new EnrollmentScanError("Git administrative ancestor changed during inspection");
    }
  }
}

function safeAdminRoot(layout: GitLayout, path: string): string {
  if (isWithinRoot(layout.gitDirectory, path)) return layout.gitDirectory;
  if (isWithinRoot(layout.commonDirectory, path)) return layout.commonDirectory;
  throw new EnrollmentScanError("Git administrative file escaped its resolved roots");
}

function readStableFile(
  path: string,
  maximumBytes: number,
  limitLabel = "safe read limit",
): Readonly<{ bytes: Buffer; stats: BigIntStats }> {
  const preliminary = lstatSync(path, { bigint: true });
  if (!preliminary.isFile() || preliminary.isSymbolicLink()) {
    throw new EnrollmentScanError("scanner only reads real regular files");
  }
  if (preliminary.size > BigInt(maximumBytes)) {
    throw new EnrollmentScanError(`file exceeds ${limitLabel} of ${String(maximumBytes)} bytes`);
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new EnrollmentScanError(
      `file could not be opened safely: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
    );
  }
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(preliminary, before)) {
      throw new EnrollmentScanError("file changed before it could be read safely");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, after) || BigInt(bytes.length) !== after.size) {
      throw new EnrollmentScanError("file changed while it was being read");
    }
    return { bytes, stats: after };
  } finally {
    closeSync(descriptor);
  }
}

function missingAdminEntry(label: string): GitAdminEntryV1 {
  return {
    label,
    present: false,
    digest: null,
    sizeBytes: 0,
    mode: null,
    modifiedNanoseconds: null,
    device: null,
    inode: null,
  };
}

function captureAdminFile(
  layout: GitLayout,
  label: string,
  path: string,
  maximumBytes: number,
): AdminFile {
  const root = safeAdminRoot(layout, path);
  assertAdminPath(root, path);
  try {
    const file = readStableFile(
      path,
      Math.min(MAX_ADMIN_FILE_BYTES, maximumBytes),
      "aggregate Git administrative byte budget",
    );
    assertAdminPath(root, path);
    const finalStats = lstatSync(path, { bigint: true });
    if (!sameIdentity(file.stats, finalStats)) {
      throw new EnrollmentScanError("Git administrative file changed during inspection");
    }
    return {
      label,
      path,
      bytes: file.bytes,
      entry: {
        label,
        present: true,
        digest: digestBytes(file.bytes),
        sizeBytes: file.bytes.length,
        mode: modeString(file.stats),
        modifiedNanoseconds: file.stats.mtimeNs.toString(),
        device: file.stats.dev.toString(),
        inode: file.stats.ino.toString(),
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { label, path, bytes: null, entry: missingAdminEntry(label) };
    }
    throw error;
  }
}

function boundedDirectoryNames(path: string, maximumEntries: number): readonly string[] {
  const directory = opendirSync(path);
  const names: string[] = [];
  try {
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (names.length >= maximumEntries) {
        throw new EnrollmentScanError(
          `directory exceeds safe entry limit of ${String(maximumEntries)}`,
        );
      }
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names.sort(compareText);
}

function captureGitAdmin(
  repositoryRoot: string,
  layout: GitLayout,
  maximumBytes: number,
): AdminCapture {
  let remainingBytes = maximumBytes;
  const capture = (label: string, path: string): AdminFile => {
    const file = captureAdminFile(layout, label, path, remainingBytes);
    if (file.bytes !== null) remainingBytes -= file.bytes.length;
    return file;
  };
  const head = capture("head", join(layout.gitDirectory, "HEAD"));
  const files: AdminFile[] = [
    head,
    capture("index", layout.indexPath),
    capture("config", join(layout.commonDirectory, "config")),
    capture("worktree-config", join(layout.gitDirectory, "config.worktree")),
    capture("packed-refs", join(layout.commonDirectory, "packed-refs")),
    capture("info-exclude", join(layout.commonDirectory, "info", "exclude")),
    capture("info-attributes", join(layout.commonDirectory, "info", "attributes")),
    capture("sparse-checkout", join(layout.gitDirectory, "info", "sparse-checkout")),
  ];
  const headText = head.bytes?.toString("utf8").trim() ?? "";
  if (headText.startsWith("ref: ")) {
    const ref = headText.slice("ref: ".length);
    if (!/^refs\/[A-Za-z0-9._/-]+$/u.test(ref) || ref.split("/").includes("..")) {
      throw new EnrollmentScanError("Git HEAD contains an unsafe symbolic reference");
    }
    files.push(capture("head-ref", join(layout.commonDirectory, ...ref.split("/"))));
  } else {
    files.push({
      label: "head-ref",
      path: null,
      bytes: null,
      entry: missingAdminEntry("head-ref"),
    });
  }

  for (const name of boundedDirectoryNames(layout.gitDirectory, MAX_ADMIN_DIRECTORY_ENTRIES)) {
    if (/^sharedindex\.[0-9a-f]+$/u.test(name)) {
      files.push(
        capture(
          `shared-index:${name.slice("sharedindex.".length)}`,
          join(layout.gitDirectory, name),
        ),
      );
    }
  }
  const reftableDirectory = join(layout.commonDirectory, "reftable");
  try {
    inspectDirectoryNoFollow(reftableDirectory);
    for (const name of boundedDirectoryNames(reftableDirectory, MAX_ADMIN_DIRECTORY_ENTRIES)) {
      if (!/^[A-Za-z0-9._-]+$/u.test(name)) {
        throw new EnrollmentScanError("Git reftable contains an unsafe filename");
      }
      files.push(capture(`reftable:${name}`, join(reftableDirectory, name)));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (remainingBytes <= 0) {
    throw new EnrollmentScanError("aggregate Git administrative byte budget was exhausted");
  }
  const effectiveConfig = invokeGit(
    repositoryRoot,
    ["config", "--local", "--includes", "--null", "--list"],
    { maxOutputBytes: remainingBytes },
  ).stdout;
  if (effectiveConfig.length > remainingBytes) {
    throw new EnrollmentScanError("aggregate Git administrative byte budget was exceeded");
  }
  files.push({
    label: "effective-local-config",
    path: null,
    bytes: effectiveConfig,
    entry: {
      label: "effective-local-config",
      present: true,
      digest: digestBytes(effectiveConfig),
      sizeBytes: effectiveConfig.length,
      mode: null,
      modifiedNanoseconds: null,
      device: null,
      inode: null,
    },
  });

  files.sort((left, right) => compareText(left.label, right.label));
  const entries = files.map((file) => file.entry);
  return {
    files,
    snapshot: GitAdminSnapshotV1Schema.parse({
      kind: layout.kind,
      objectFormat: layout.objectFormat,
      digest: projectDigest({ kind: layout.kind, objectFormat: layout.objectFormat, entries }),
      entries,
    }),
  };
}

function withPrivateIndex<T>(
  repositoryRoot: string,
  admin: AdminCapture,
  callback: (environment: Readonly<Record<string, string>>) => T,
): T {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "app-factory-enrollment-"));
  chmodSync(temporaryRoot, 0o700);
  try {
    const index = admin.files.find((file) => file.label === "index");
    if (index === undefined) throw new EnrollmentScanError("Git index was not captured");
    const temporaryIndex = join(temporaryRoot, "index");
    if (index.bytes !== null)
      writeFileSync(temporaryIndex, index.bytes, { mode: 0o600, flag: "wx" });
    for (const shared of admin.files.filter((file) => file.label.startsWith("shared-index:"))) {
      if (shared.bytes === null) continue;
      const suffix = shared.label.slice("shared-index:".length);
      writeFileSync(join(temporaryRoot, `sharedindex.${suffix}`), shared.bytes, {
        mode: 0o600,
        flag: "wx",
      });
    }
    const environment = {
      GIT_INDEX_FILE: temporaryIndex,
      HOME: temporaryRoot,
      XDG_CONFIG_HOME: temporaryRoot,
    };
    if (index.bytes === null) {
      invokeGit(repositoryRoot, ["read-tree", "HEAD"], { additionalEnvironment: environment });
    }
    return callback(environment);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertStableDirectory(path: string, before: BigIntStats): void {
  const after = inspectDirectoryNoFollow(path);
  if (!sameIdentity(before, after)) {
    throw new EnrollmentScanError("directory or ancestor changed during scan");
  }
}

function resolveSymbolicLink(
  root: string,
  linkPath: string,
  initialTarget: string,
): Readonly<{ resolution: SymbolicLinkResolution; traversesExcludedDirectory: boolean }> {
  let candidate = isAbsolute(initialTarget)
    ? resolve(initialTarget)
    : resolve(dirname(linkPath), initialTarget);
  let traversesExcludedDirectory = relative(root, linkPath)
    .split(sep)
    .some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment));
  const seenLinks = new Set<string>([linkPath]);

  for (let depth = 0; depth < MAX_SYMBOLIC_LINK_DEPTH; depth += 1) {
    if (!isWithinRoot(root, candidate)) return { resolution: "escape", traversesExcludedDirectory };
    const segments = relative(root, candidate)
      .split(sep)
      .filter((segment) => segment !== "");
    let current = root;
    const checked: Array<Readonly<{ path: string; stats: BigIntStats }>> = [];
    let followed = false;
    for (const [index, segment] of segments.entries()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(segment)) traversesExcludedDirectory = true;
      current = join(current, segment);
      let stats: BigIntStats;
      try {
        stats = lstatSync(current, { bigint: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { resolution: "broken", traversesExcludedDirectory };
        }
        throw new EnrollmentScanError("symbolic-link chain changed during inspection");
      }
      checked.push({ path: current, stats });
      if (stats.isSymbolicLink()) {
        if (seenLinks.has(current)) return { resolution: "cycle", traversesExcludedDirectory };
        seenLinks.add(current);
        const target = readlinkSync(current);
        const remainder = segments.slice(index + 1);
        candidate = resolve(dirname(current), target, ...remainder);
        followed = true;
        break;
      }
      if (index < segments.length - 1 && !stats.isDirectory()) {
        return { resolution: "broken", traversesExcludedDirectory };
      }
      if (stats.isDirectory() && realpathSync(current) !== current) {
        throw new EnrollmentScanError("symbolic-link ancestor changed during inspection");
      }
      if (stats.isDirectory() && !sameIdentity(stats, inspectDirectoryNoFollow(current))) {
        throw new EnrollmentScanError("symbolic-link ancestor changed during inspection");
      }
    }
    for (const item of checked) {
      const after = lstatSync(item.path, { bigint: true });
      if (!sameIdentity(item.stats, after)) {
        throw new EnrollmentScanError("symbolic-link chain changed during inspection");
      }
    }
    if (!followed) return { resolution: "inside", traversesExcludedDirectory };
  }
  return { resolution: "cycle", traversesExcludedDirectory };
}

function digestSourceFile(
  path: string,
  expected: BigIntStats,
  maximumSingleFileBytes: number,
  remainingBytes: number,
): Readonly<{ digest: Sha256Digest; sizeBytes: number }> {
  if (expected.size > BigInt(maximumSingleFileBytes)) {
    throw new EnrollmentScanError(
      `file exceeds per-file scan limit of ${String(maximumSingleFileBytes)} bytes`,
    );
  }
  if (expected.size > BigInt(remainingBytes)) {
    throw new EnrollmentScanError("scan surface exceeds its total file-byte limit");
  }
  if (expected.size > 0n && expected.blocks * 512n < expected.size) {
    throw new EnrollmentScanError("sparse files are unsupported by the enrollment scanner");
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new EnrollmentScanError(
      `file could not be opened safely: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}`,
    );
  }
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(expected, before) || !before.isFile()) {
      throw new EnrollmentScanError("file changed before content hashing");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
    let bytesReadTotal = 0;
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      bytesReadTotal += bytesRead;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, after) || BigInt(bytesReadTotal) !== after.size) {
      throw new EnrollmentScanError("file changed during content hashing");
    }
    return {
      digest: Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`),
      sizeBytes: bytesReadTotal,
    };
  } finally {
    closeSync(descriptor);
  }
}

function scanSurface(
  root: string,
  maximumEntries: number,
  maximumFileBytes: number,
  maximumSingleFileBytes: number,
): SurfaceScan {
  const entries: ScanEntry[] = [];
  const excludedPaths: RelativeProjectPath[] = [];
  let fileBytes = 0;
  let visitedEntryCount = 0;

  const visit = (directoryPath: string, excluded: boolean): void => {
    const directoryBefore = inspectDirectoryNoFollow(directoryPath);
    const remainingEntries = maximumEntries - visitedEntryCount;
    const names = boundedDirectoryNames(directoryPath, remainingEntries);
    for (const name of names) {
      visitedEntryCount += 1;
      const fullPath = join(directoryPath, name);
      const path = toRelativePath(root, fullPath);
      const stats = lstatSync(fullPath, { bigint: true });
      const mode = modeString(stats);
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(fullPath);
        const resolution = resolveSymbolicLink(root, fullPath, target);
        entries.push({
          kind: "symbolic-link",
          path,
          fullPath,
          mode,
          target,
          ...resolution,
          traversesExcludedDirectory: excluded || resolution.traversesExcludedDirectory,
        });
        continue;
      }
      if (stats.isDirectory()) {
        const childExcluded = excluded || EXCLUDED_DIRECTORY_NAMES.has(name);
        if (!excluded && childExcluded) excludedPaths.push(path);
        entries.push({ kind: "directory", path, fullPath, mode, excluded: childExcluded });
        if (name !== ".git") visit(fullPath, childExcluded);
        continue;
      }
      if (!stats.isFile()) {
        throw new EnrollmentScanError(`unsupported filesystem entry at ${path}`);
      }
      if (excluded) continue;
      const file = digestSourceFile(
        fullPath,
        stats,
        maximumSingleFileBytes,
        maximumFileBytes - fileBytes,
      );
      fileBytes += file.sizeBytes;
      entries.push({ kind: "file", path, fullPath, mode, ...file });
    }
    assertStableDirectory(directoryPath, directoryBefore);
  };

  visit(root, false);
  const canonicalEntries = entries.map((entry) => {
    if (entry.kind === "file") {
      return [entry.kind, entry.path, entry.mode, entry.sizeBytes, entry.digest] as const;
    }
    if (entry.kind === "symbolic-link") {
      return [
        entry.kind,
        entry.path,
        entry.mode,
        entry.target,
        entry.resolution,
        entry.traversesExcludedDirectory,
      ] as const;
    }
    return [entry.kind, entry.path, entry.mode, entry.excluded] as const;
  });
  return {
    entries,
    digest: projectDigest(canonicalEntries),
    fileBytes,
    visitedEntryCount,
    excludedPaths: excludedPaths.sort(compareText),
  };
}

function captureSnapshot(
  repositoryRoot: string,
  layout: GitLayout,
  maximumEntries: number,
  maximumFileBytes: number,
  maximumSingleFileBytes: number,
  maximumGitAdminBytes: number,
): SnapshotAndEntries {
  const adminBefore = captureGitAdmin(repositoryRoot, layout, maximumGitAdminBytes);
  return withPrivateIndex(repositoryRoot, adminBefore, (privateEnvironment) => {
    const headBefore = gitText(repositoryRoot, ["rev-parse", "--verify", "HEAD"]);
    const surface = scanSurface(
      repositoryRoot,
      maximumEntries,
      maximumFileBytes,
      maximumSingleFileBytes,
    );
    const statusArguments = [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=all",
    ] as const;
    const statusBefore = invokeGit(repositoryRoot, statusArguments, {
      additionalEnvironment: privateEnvironment,
    }).stdout;
    const statusAfter = invokeGit(repositoryRoot, statusArguments, {
      additionalEnvironment: privateEnvironment,
    }).stdout;
    const headAfter = gitText(repositoryRoot, ["rev-parse", "--verify", "HEAD"]);
    const adminAfter = captureGitAdmin(repositoryRoot, layout, maximumGitAdminBytes);
    if (headBefore !== headAfter) {
      throw new EnrollmentPreservationError("Git HEAD changed during a preservation snapshot");
    }
    if (!statusBefore.equals(statusAfter)) {
      throw new EnrollmentPreservationError("Git status changed during a preservation snapshot");
    }
    if (adminBefore.snapshot.digest !== adminAfter.snapshot.digest) {
      throw new EnrollmentPreservationError(
        "Git administrative state changed during a preservation snapshot",
      );
    }
    return {
      snapshot: {
        schemaVersion: 1,
        headSha: headAfter,
        dirty: statusAfter.length > 0,
        statusDigest: digestBytes(statusAfter),
        statusByteCount: statusAfter.length,
        scanSurfaceDigest: surface.digest,
        scannedEntryCount: surface.visitedEntryCount,
        scannedFileBytes: surface.fileBytes,
        excludedPaths: [...surface.excludedPaths],
        gitAdmin: adminAfter.snapshot,
      },
      entries: surface.entries,
    };
  });
}

function fileEntries(entries: readonly ScanEntry[]): readonly FileEntry[] {
  return entries.filter((entry): entry is FileEntry => entry.kind === "file");
}

function directoryEntries(entries: readonly ScanEntry[]): readonly DirectoryEntry[] {
  return entries.filter(
    (entry): entry is DirectoryEntry => entry.kind === "directory" && !entry.excluded,
  );
}

function secureRead(entry: FileEntry, maximumBytes = MAX_ARTIFACT_PARSE_BYTES): Buffer {
  if (entry.sizeBytes > maximumBytes) {
    throw new EnrollmentScanError(`artifact exceeds safe parse limit: ${entry.path}`);
  }
  const file = readStableFile(entry.fullPath, maximumBytes);
  if (file.bytes.length !== entry.sizeBytes || digestBytes(file.bytes) !== entry.digest) {
    throw new EnrollmentScanError(`scan surface changed while reading ${entry.path}`);
  }
  return file.bytes;
}

function secureUtf8(entry: FileEntry, maximumBytes = MAX_ARTIFACT_PARSE_BYTES): string {
  return secureRead(entry, maximumBytes).toString("utf8");
}

function classifyRule(path: string): ProjectInventoryV1["ruleFiles"][number]["kind"] | null {
  const name = basename(path);
  if (name === "AGENTS.md" || name === "AGENTS.override.md") return "agents";
  if (name === "AGENTS.factory.md") return "factory";
  if (name === "CLAUDE.md" || name === "CLAUDE.local.md") return "claude";
  if (name === "GEMINI.md") return "gemini";
  if (name === ".cursorrules") return "cursor";
  if (path === ".github/copilot-instructions.md") return "copilot";
  if (/(?:^|\/)\.cursor\/rules\/.+\.(?:md|mdc)$/u.test(path)) return "cursor";
  if (/(?:^|\/)\.claude\/rules\/.+\.md$/u.test(path)) return "claude";
  if (/(?:^|\/)\.codex\/.+\.md$/u.test(path)) return "codex";
  return null;
}

function ruleScope(path: string): "." | RelativeProjectPath {
  if (path === ".github/copilot-instructions.md") return ".";
  const segments = path.split("/");
  const specialIndex = segments.findIndex((segment) =>
    [".claude", ".codex", ".cursor", ".factory"].includes(segment),
  );
  const directory =
    specialIndex >= 0 ? segments.slice(0, specialIndex).join("/") : posix.dirname(path);
  return directory === "." || directory === "" ? "." : RelativeProjectPathSchema.parse(directory);
}

function parseRuleDeclarations(
  content: string,
): ProjectInventoryV1["ruleFiles"][number]["declarations"] {
  const declarations: ProjectInventoryV1["ruleFiles"][number]["declarations"][number][] = [];
  const pattern =
    /^\s*(?:[-*]\s*)?(?:factory-rule\s*:?\s+|factory\.rule\.)([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)\s*=\s*(\S(?:.*\S)?)\s*$/iu;
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const match = pattern.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (key !== undefined && value !== undefined) {
      declarations.push({ key: key.toLowerCase(), value, line: index + 1 });
    }
  }
  return declarations.sort(
    (left, right) =>
      compareText(left.key, right.key) ||
      compareText(left.value, right.value) ||
      left.line - right.line,
  );
}

function scopeDepth(scope: string): number {
  return scope === "." ? 0 : scope.split("/").length;
}

function scopeContains(parent: string, child: string): boolean {
  return parent === "." || child === parent || child.startsWith(`${parent}/`);
}

function addRuleAuthority(
  rawFiles: readonly Omit<ProjectInventoryV1["ruleFiles"][number], "authority">[],
): ProjectInventoryV1["ruleFiles"] {
  const canonicalFiles = rawFiles.filter(
    (file) => file.kind === "agents" && basename(file.path) === "AGENTS.md",
  );
  return rawFiles.map((file) => {
    if (file.kind === "agents" && basename(file.path) === "AGENTS.md") {
      return {
        ...file,
        authority: {
          status: file.declarations.length > 0 ? "canonical" : "nonconforming",
          canonicalPath: file.path,
          canonicalDigest: file.digest,
        },
      };
    }
    const applicable = canonicalFiles
      .filter((canonical) => scopeContains(canonical.scopePath, file.scopePath))
      .sort(
        (left, right) =>
          scopeDepth(right.scopePath) - scopeDepth(left.scopePath) ||
          compareText(left.path, right.path),
      )[0];
    if (applicable === undefined) {
      return {
        ...file,
        authority: { status: "missing-authority", canonicalPath: null, canonicalDigest: null },
      };
    }
    const imports = file.declarations.filter((item) => item.key === "authority.import");
    const digests = file.declarations.filter((item) => item.key === "authority.digest");
    const conforming =
      file.declarations.length > 0 &&
      imports.some((item) => item.value === applicable.path) &&
      digests.some((item) => item.value === applicable.digest);
    return {
      ...file,
      authority: {
        status: conforming ? "conforming" : "nonconforming",
        canonicalPath: applicable.path,
        canonicalDigest: applicable.digest,
      },
    };
  });
}

function calculateEffectiveRules(
  ruleFiles: ProjectInventoryV1["ruleFiles"],
): ProjectInventoryV1["effectiveRules"] {
  const scopes = [...new Set([".", ...ruleFiles.map((file) => file.scopePath)])].sort(
    (left, right) => scopeDepth(left) - scopeDepth(right) || compareText(left, right),
  );
  const results: ProjectInventoryV1["effectiveRules"][number][] = [];
  for (const scope of scopes) {
    const applicable = ruleFiles.filter((file) => scopeContains(file.scopePath, scope));
    const keys = [
      ...new Set(applicable.flatMap((file) => file.declarations.map((item) => item.key))),
    ].sort(compareText);
    for (const key of keys) {
      const candidates = applicable.flatMap((file) =>
        file.declarations
          .filter((item) => item.key === key)
          .map((declaration) => ({ file, declaration })),
      );
      const maximumDepth = Math.max(...candidates.map((item) => scopeDepth(item.file.scopePath)));
      const effective = candidates.filter(
        (item) => scopeDepth(item.file.scopePath) === maximumDepth,
      );
      const values = [...new Set(effective.map((item) => item.declaration.value))].sort(
        compareText,
      );
      results.push({
        scopePath: scope,
        key,
        value: values.length === 1 ? (values[0] ?? null) : null,
        sourcePaths: [...new Set(effective.map((item) => item.file.path))].sort(compareText),
        conflict: values.length !== 1,
      });
    }
  }
  return results.sort(
    (left, right) =>
      scopeDepth(left.scopePath) - scopeDepth(right.scopePath) ||
      compareText(left.scopePath, right.scopePath) ||
      compareText(left.key, right.key),
  );
}

function isTestSource(path: string): boolean {
  const segments = path.split("/");
  const stem = basename(path, ".swift");
  return (
    segments.slice(0, -1).some((segment) => /(?:Tests?|tests?)$/u.test(segment)) ||
    /(?:Tests?|tests?)$/u.test(stem)
  );
}

function isUiTestSource(path: string): boolean {
  const segments = path.split("/");
  const stem = basename(path, ".swift");
  return (
    segments.slice(0, -1).some((segment) => /(?:UITests?|uitests?|ui_tests?)$/u.test(segment)) ||
    /(?:UITests?|uitests?|ui_tests?)$/u.test(stem)
  );
}

function isSwiftConfiguration(path: string): boolean {
  return [
    "Dependencies.swift",
    "Package.swift",
    "Project.swift",
    "Tuist.swift",
    "Workspace.swift",
  ].includes(basename(path));
}

function swiftCodeSurface(content: string): string {
  let result = "";
  let index = 0;
  let blockCommentDepth = 0;
  let mode: "code" | "line-comment" | "block-comment" | "string" | "multiline-string" = "code";
  while (index < content.length) {
    const current = content[index] ?? "";
    const next = content[index + 1] ?? "";
    const triple = content.slice(index, index + 3) === '"""';
    if (mode === "line-comment") {
      if (current === "\n") {
        mode = "code";
        result += "\n";
      } else result += " ";
      index += 1;
      continue;
    }
    if (mode === "block-comment") {
      if (current === "/" && next === "*") {
        blockCommentDepth += 1;
        result += "  ";
        index += 2;
      } else if (current === "*" && next === "/") {
        blockCommentDepth -= 1;
        result += "  ";
        index += 2;
        if (blockCommentDepth === 0) mode = "code";
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (mode === "string" || mode === "multiline-string") {
      if (mode === "multiline-string" && triple) {
        result += "   ";
        index += 3;
        mode = "code";
      } else if (mode === "string" && current === "\\") {
        result += "  ";
        index += Math.min(2, content.length - index);
      } else if (mode === "string" && current === '"') {
        result += " ";
        index += 1;
        mode = "code";
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;
      mode = "line-comment";
    } else if (current === "/" && next === "*") {
      result += "  ";
      index += 2;
      blockCommentDepth = 1;
      mode = "block-comment";
    } else if (triple) {
      result += "   ";
      index += 3;
      mode = "multiline-string";
    } else if (current === '"') {
      result += " ";
      index += 1;
      mode = "string";
    } else {
      result += current;
      index += 1;
    }
  }
  return result;
}

function meaningfulSwiftSource(entry: FileEntry): boolean {
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) return false;
  const code = swiftCodeSurface(secureUtf8(entry));
  return /(?:@main\b|\b(?:actor|class|enum|extension|func|let|protocol|struct|var)\b)/u.test(code);
}

function meaningfulSwiftTest(entry: FileEntry): boolean {
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) return false;
  const code = swiftCodeSurface(secureUtf8(entry));
  const xctest = /\bXCTestCase\b/u.test(code) && /\bfunc\s+test[A-Za-z0-9_]*\s*\(/u.test(code);
  const swiftTesting = /\bimport\s+Testing\b/u.test(code) && /@Test\b/u.test(code);
  return xctest || swiftTesting;
}

function meaningfulSwiftUiTest(entry: FileEntry): boolean {
  if (!meaningfulSwiftTest(entry)) return false;
  const code = swiftCodeSurface(secureUtf8(entry));
  return /\b(?:XCUIApplication|XCUIElement|XCUIDevice)\b/u.test(code);
}

function isTopLevelXcodeContainer(path: string, suffix: ".xcodeproj" | ".xcworkspace"): boolean {
  if (!path.endsWith(suffix)) return false;
  return !posix
    .dirname(path)
    .split("/")
    .some((segment) => segment.endsWith(".xcodeproj") || segment.endsWith(".xcworkspace"));
}

function safeXmlHasRoot(content: string, expectedRoot: string): boolean {
  if (content.trim() === "" || /<!DOCTYPE|<!ENTITY/iu.test(content)) return false;
  const withoutPreamble = content
    .replace(/^\s*<\?xml[^?]*\?>/u, "")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .trim();
  const tagPattern = /<([^<>]+)>/gu;
  const stack: string[] = [];
  let firstRoot: string | null = null;
  let rootCount = 0;
  let cursor = 0;
  for (const match of withoutPreamble.matchAll(tagPattern)) {
    const index = match.index;
    const body = match[1]?.trim();
    if (index === undefined || body === undefined) return false;
    const between = withoutPreamble.slice(cursor, index);
    if (between.includes("<") || (stack.length === 0 && between.trim() !== "")) return false;
    cursor = index + match[0].length;
    if (body.startsWith("?") || body.startsWith("!")) return false;
    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name) || stack.pop() !== name) return false;
      continue;
    }
    const selfClosing = body.endsWith("/");
    const normalized = selfClosing ? body.slice(0, -1).trim() : body;
    const name = normalized.split(/\s+/u)[0];
    if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) return false;
    if (stack.length === 0) rootCount += 1;
    firstRoot ??= name;
    if (!selfClosing) stack.push(name);
  }
  return (
    cursor === withoutPreamble.length &&
    stack.length === 0 &&
    rootCount === 1 &&
    firstRoot === expectedRoot &&
    withoutPreamble !== ""
  );
}

function validation(status: "verified" | "invalid" | "not-validated", code: string | null) {
  return { status, code } as const;
}

type ProjectDefinitionAnalysis = Readonly<{
  validation: ReturnType<typeof validation>;
  applicationTargetIds: readonly string[];
  unitTestTargetIds: readonly string[];
  uiTestTargetIds: readonly string[];
}>;

type SchemeAnalysis = Readonly<{
  validation: ReturnType<typeof validation>;
  applicationTargetIds: readonly string[];
  unitTestTargetIds: readonly string[];
  uiTestTargetIds: readonly string[];
}>;

type TargetKind = "application" | "unit-test" | "ui-test";

type TargetCatalogEntry = Readonly<{
  kind: TargetKind;
  containerPath: RelativeProjectPath;
}>;

function pbxStructuralSource(content: string): string | null {
  // Preserve offsets while removing syntax whose contents cannot delimit PBX dictionaries.
  const structural = content.split("");
  let state: "source" | "string" | "line-comment" | "block-comment" = "source";

  for (let index = 0; index < structural.length; index += 1) {
    const current = content[index];
    const next = content[index + 1];
    if (state === "source") {
      if (current === '"') {
        state = "string";
      } else if (current === "'") {
        // OpenStep plists accept single-quoted keys and values, but the supported PBX grammar
        // deliberately does not. Reject them rather than interpreting their contents as syntax.
        return null;
      } else if (current === "/" && next === "/") {
        structural[index] = " ";
        structural[index + 1] = " ";
        index += 1;
        state = "line-comment";
      } else if (current === "/" && next === "*") {
        structural[index] = " ";
        structural[index + 1] = " ";
        index += 1;
        state = "block-comment";
      }
      continue;
    }

    if (state === "string") {
      if (current === "\\") {
        structural[index] = " ";
        if (next === undefined) return null;
        structural[index + 1] = next === "\n" || next === "\r" ? next : " ";
        index += 1;
      } else if (current === '"') {
        state = "source";
      } else {
        structural[index] = current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }

    if (state === "line-comment") {
      if (current === "\n" || current === "\r") {
        state = "source";
      } else {
        structural[index] = " ";
      }
      continue;
    }

    structural[index] = current === "\n" || current === "\r" ? current : " ";
    if (current === "*" && next === "/") {
      structural[index + 1] = " ";
      index += 1;
      state = "source";
    }
  }

  return state === "source" || state === "line-comment" ? structural.join("") : null;
}

function matchingPbxBrace(structural: string, openingIndex: number): number | null {
  if (structural[openingIndex] !== "{") return null;
  let depth = 1;
  for (let index = openingIndex + 1; index < structural.length; index += 1) {
    if (structural[index] === "{") depth += 1;
    if (structural[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return null;
}

type PbxDictionary = Readonly<{
  source: string;
  structural: string;
  openingIndex: number;
  closingIndex: number;
}>;

function skipPbxWhitespace(structural: string, index: number): number {
  let cursor = index;
  while (/\s/u.test(structural[cursor] ?? "")) cursor += 1;
  return cursor;
}

function parsePbxDocument(content: string): PbxDictionary | null {
  const structural = pbxStructuralSource(content);
  if (structural === null) return null;
  const openingIndex = skipPbxWhitespace(structural, 0);
  if (structural[openingIndex] !== "{") return null;
  const closingIndex = matchingPbxBrace(structural, openingIndex);
  if (
    closingIndex === null ||
    skipPbxWhitespace(structural, closingIndex + 1) !== structural.length
  ) {
    return null;
  }
  const document = { source: content, structural, openingIndex, closingIndex };
  return hasQuotedDirectAssignmentKey(document) ? null : document;
}

function hasQuotedDirectAssignmentKey(dictionary: PbxDictionary): boolean {
  let braceDepth = 1;
  let parenthesisDepth = 0;
  for (let index = dictionary.openingIndex + 1; index < dictionary.closingIndex; index += 1) {
    const current = dictionary.structural[index];
    if (current === "{") {
      braceDepth += 1;
      continue;
    }
    if (current === "}") {
      braceDepth -= 1;
      continue;
    }
    if (braceDepth !== 1) continue;
    if (current === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (current === ")") {
      parenthesisDepth -= 1;
      continue;
    }
    if (parenthesisDepth !== 0 || current !== '"') continue;

    let previous = index - 1;
    while (/\s/u.test(dictionary.structural[previous] ?? "")) previous -= 1;
    if (dictionary.structural[previous] !== "{" && dictionary.structural[previous] !== ";") {
      continue;
    }

    let closingQuote = index + 1;
    while (closingQuote < dictionary.closingIndex && dictionary.structural[closingQuote] !== '"') {
      closingQuote += 1;
    }
    if (closingQuote >= dictionary.closingIndex) return true;
    const afterKey = skipPbxWhitespace(dictionary.structural, closingQuote + 1);
    if (dictionary.structural[afterKey] === "=") return true;
    index = closingQuote;
  }
  return false;
}

function directPbxAssignmentValueStart(dictionary: PbxDictionary, key: string): number | null {
  const starts: number[] = [];
  let braceDepth = 1;
  let parenthesisDepth = 0;
  for (let index = dictionary.openingIndex + 1; index < dictionary.closingIndex; index += 1) {
    const current = dictionary.structural[index];
    if (current === "{") {
      braceDepth += 1;
      continue;
    }
    if (current === "}") {
      braceDepth -= 1;
      continue;
    }
    if (braceDepth !== 1) continue;
    if (current === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (current === ")") {
      parenthesisDepth -= 1;
      if (parenthesisDepth < 0) return null;
      continue;
    }
    if (parenthesisDepth !== 0 || !dictionary.structural.startsWith(key, index)) continue;

    let previous = index - 1;
    while (/\s/u.test(dictionary.structural[previous] ?? "")) previous -= 1;
    if (dictionary.structural[previous] !== "{" && dictionary.structural[previous] !== ";") {
      continue;
    }
    let cursor = index + key.length;
    const afterKey = dictionary.structural[cursor];
    if (afterKey !== "=" && !/\s/u.test(afterKey ?? "")) continue;
    cursor = skipPbxWhitespace(dictionary.structural, cursor);
    if (dictionary.structural[cursor] !== "=") continue;
    starts.push(skipPbxWhitespace(dictionary.structural, cursor + 1));
  }
  if (parenthesisDepth !== 0 || starts.length !== 1) return null;
  return starts[0] ?? null;
}

function directPbxBareValue(dictionary: PbxDictionary, key: string): string | null {
  const valueStart = directPbxAssignmentValueStart(dictionary, key);
  if (valueStart === null) return null;
  const valuePattern = /([0-9A-Za-z_.-]+)\s*;/uy;
  valuePattern.lastIndex = valueStart;
  return valuePattern.exec(dictionary.structural)?.[1] ?? null;
}

function directPbxScalarValue(dictionary: PbxDictionary, key: string): string | null {
  const valueStart = directPbxAssignmentValueStart(dictionary, key);
  if (valueStart === null) return null;
  if (dictionary.structural[valueStart] !== '"') {
    return directPbxBareValue(dictionary, key);
  }
  let closingQuote = valueStart + 1;
  while (closingQuote < dictionary.closingIndex && dictionary.structural[closingQuote] !== '"') {
    closingQuote += 1;
  }
  if (closingQuote >= dictionary.closingIndex) return null;
  const terminator = skipPbxWhitespace(dictionary.structural, closingQuote + 1);
  if (dictionary.structural[terminator] !== ";") return null;
  return dictionary.source.slice(valueStart + 1, closingQuote);
}

function directPbxListBody(dictionary: PbxDictionary, key: string): string | null {
  const valueStart = directPbxAssignmentValueStart(dictionary, key);
  if (valueStart === null || dictionary.structural[valueStart] !== "(") return null;
  let depth = 1;
  for (let index = valueStart + 1; index < dictionary.closingIndex; index += 1) {
    if (dictionary.structural[index] === "(") depth += 1;
    if (dictionary.structural[index] === ")") depth -= 1;
    if (depth !== 0) continue;
    const terminator = skipPbxWhitespace(dictionary.structural, index + 1);
    if (dictionary.structural[terminator] !== ";") return null;
    return dictionary.structural.slice(valueStart + 1, index);
  }
  return null;
}

function pbxObjectRecords(document: PbxDictionary): ReadonlyMap<string, PbxDictionary> {
  const empty = (): ReadonlyMap<string, PbxDictionary> => new Map();
  const objectsOpening = directPbxAssignmentValueStart(document, "objects");
  if (objectsOpening === null || document.structural[objectsOpening] !== "{") return empty();
  const objectsClosing = matchingPbxBrace(document.structural, objectsOpening);
  if (objectsClosing === null || objectsClosing >= document.closingIndex) return empty();
  const dictionaryTerminator = skipPbxWhitespace(document.structural, objectsClosing + 1);
  if (document.structural[dictionaryTerminator] !== ";") return empty();
  const objectsDictionary = {
    source: document.source,
    structural: document.structural,
    openingIndex: objectsOpening,
    closingIndex: objectsClosing,
  };
  if (hasQuotedDirectAssignmentKey(objectsDictionary)) return empty();

  const records = new Map<string, PbxDictionary>();
  // Xcode accepts legacy opaque keys in this dictionary. Traverse them structurally, but only
  // catalog the canonical 24-hex identifiers supported by the scanner's link validation.
  const directEntryPattern = /([0-9A-Za-z_-]+)\s*=\s*\{/uy;
  const seenKeys = new Set<string>();
  let cursor = objectsOpening + 1;
  while (cursor < objectsClosing) {
    cursor = skipPbxWhitespace(document.structural, cursor);
    if (cursor === objectsClosing) break;

    directEntryPattern.lastIndex = cursor;
    const match = directEntryPattern.exec(document.structural);
    const entryKey = match?.[1];
    const openingOffset = match?.[0].lastIndexOf("{") ?? -1;
    if (entryKey === undefined || openingOffset < 0 || seenKeys.has(entryKey)) return empty();
    seenKeys.add(entryKey);
    const recordOpening = cursor + openingOffset;
    const recordClosing = matchingPbxBrace(document.structural, recordOpening);
    if (recordClosing === null || recordClosing >= objectsClosing) return empty();

    let recordTerminator = recordClosing + 1;
    recordTerminator = skipPbxWhitespace(document.structural, recordTerminator);
    if (document.structural[recordTerminator] !== ";") return empty();
    const record = {
      source: document.source.slice(cursor, recordTerminator + 1),
      structural: document.structural.slice(cursor, recordTerminator + 1),
      openingIndex: recordOpening - cursor,
      closingIndex: recordClosing - cursor,
    };
    if (hasQuotedDirectAssignmentKey(record)) return empty();
    if (/^[0-9A-Fa-f]{24}$/u.test(entryKey)) {
      const identifier = entryKey.toUpperCase();
      if (records.has(identifier)) return empty();
      records.set(identifier, record);
    }
    cursor = recordTerminator + 1;
  }
  return records;
}

function pbxProductType(record: PbxDictionary): string | null {
  return directPbxScalarValue(record, "productType");
}

function analyzeProjectDefinition(entry: FileEntry | undefined): ProjectDefinitionAnalysis {
  const empty = (result: ReturnType<typeof validation>): ProjectDefinitionAnalysis => ({
    validation: result,
    applicationTargetIds: [],
    unitTestTargetIds: [],
    uiTestTargetIds: [],
  });
  if (entry === undefined) return empty(validation("invalid", "xcode.definition-missing"));
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) {
    return empty(validation("invalid", "xcode.definition-unparseable"));
  }
  const content = secureUtf8(entry);
  const document = parsePbxDocument(content);
  if (document === null) {
    return empty(validation("invalid", "xcode.definition-unparseable"));
  }
  const rootObjectValue = directPbxBareValue(document, "rootObject");
  const rootObjectId =
    rootObjectValue !== null && /^[0-9A-Fa-f]{24}$/u.test(rootObjectValue)
      ? rootObjectValue.toUpperCase()
      : null;
  if (rootObjectId === null) {
    return empty(validation("invalid", "xcode.root-object-missing"));
  }
  const records = pbxObjectRecords(document);
  const projectRecord = records.get(rootObjectId);
  if (projectRecord === undefined || directPbxBareValue(projectRecord, "isa") !== "PBXProject") {
    return empty(validation("invalid", "xcode.root-object-unlinked"));
  }
  const declaredTargets = directPbxListBody(projectRecord, "targets");
  const declaredTargetIds = new Set(
    [...(declaredTargets ?? "").matchAll(/\b([0-9A-Fa-f]{24})\b/gu)]
      .map((match) => match[1]?.toUpperCase())
      .filter((identifier): identifier is string => identifier !== undefined),
  );
  const targets: Array<Readonly<{ identifier: string; kind: TargetKind }>> = [];
  for (const [identifier, record] of records) {
    if (
      !declaredTargetIds.has(identifier) ||
      directPbxBareValue(record, "isa") !== "PBXNativeTarget"
    ) {
      continue;
    }
    const productType = pbxProductType(record);
    const kind =
      productType === "com.apple.product-type.application"
        ? "application"
        : productType === "com.apple.product-type.bundle.unit-test"
          ? "unit-test"
          : productType === "com.apple.product-type.bundle.ui-testing"
            ? "ui-test"
            : null;
    if (kind !== null && directPbxListBody(record, "buildPhases") !== null) {
      targets.push({ identifier, kind });
    }
  }
  const ids = (kind: TargetKind): string[] =>
    targets
      .filter((target) => target.kind === kind)
      .map((target) => target.identifier)
      .sort(compareText);
  const applicationTargetIds = ids("application");
  if (applicationTargetIds.length === 0) {
    return empty(validation("invalid", "xcode.application-target-unlinked"));
  }
  return {
    validation: validation("verified", null),
    applicationTargetIds,
    unitTestTargetIds: ids("unit-test"),
    uiTestTargetIds: ids("ui-test"),
  };
}

function validateWorkspaceDefinition(entry: FileEntry | undefined) {
  if (entry === undefined) return validation("invalid", "xcode.definition-missing");
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) {
    return validation("invalid", "xcode.definition-unparseable");
  }
  return safeXmlHasRoot(secureUtf8(entry), "Workspace")
    ? validation("verified", null)
    : validation("invalid", "xcode.workspace-xml-invalid");
}

function xmlAttributes(source: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...source.matchAll(/\b([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/gu)].flatMap((match) =>
      match[1] === undefined || match[2] === undefined ? [] : [[match[1], match[2]]],
    ),
  );
}

function analyzeScheme(
  entry: FileEntry,
  targets: ReadonlyMap<string, TargetCatalogEntry>,
): SchemeAnalysis {
  const invalid = (code: string): SchemeAnalysis => ({
    validation: validation("invalid", code),
    applicationTargetIds: [],
    unitTestTargetIds: [],
    uiTestTargetIds: [],
  });
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) {
    return invalid("xcode.scheme-unparseable");
  }
  const content = secureUtf8(entry);
  if (!safeXmlHasRoot(content, "Scheme")) return invalid("xcode.scheme-xml-invalid");
  const withoutComments = content.replace(/<!--[\s\S]*?-->/gu, "");
  const references = (
    source: string,
  ): Array<Readonly<{ identifier: string; target: TargetCatalogEntry }>> => {
    const found: Array<Readonly<{ identifier: string; target: TargetCatalogEntry }>> = [];
    for (const match of source.matchAll(/<BuildableReference\b([^>]*)>/gu)) {
      const attributes = xmlAttributes(match[1] ?? "");
      const identifier = attributes.BlueprintIdentifier?.toUpperCase();
      const container = attributes.ReferencedContainer;
      if (
        identifier === undefined ||
        container === undefined ||
        !container.startsWith("container:")
      ) {
        continue;
      }
      const target = targets.get(identifier);
      if (target !== undefined && container.slice("container:".length) === target.containerPath) {
        found.push({ identifier, target });
      }
    }
    return found;
  };
  const runnableApplicationIds = new Set<string>();
  for (const match of withoutComments.matchAll(
    /<BuildActionEntry\b([^>]*)>([\s\S]*?)<\/BuildActionEntry>/gu,
  )) {
    const attributes = xmlAttributes(match[1] ?? "");
    if (attributes.buildForRunning !== "YES" && attributes.buildForArchiving !== "YES") continue;
    for (const reference of references(match[2] ?? "")) {
      if (reference.target.kind === "application") runnableApplicationIds.add(reference.identifier);
    }
  }
  if (runnableApplicationIds.size === 0) {
    return invalid("xcode.scheme-application-build-action-missing");
  }
  const testAction = /<TestAction\b[^>]*>([\s\S]*?)<\/TestAction>/u.exec(withoutComments)?.[1];
  if (testAction === undefined) return invalid("xcode.scheme-test-action-missing");
  const unitTestTargetIds = new Set<string>();
  const uiTestTargetIds = new Set<string>();
  for (const reference of references(testAction)) {
    if (reference.target.kind === "unit-test") unitTestTargetIds.add(reference.identifier);
    if (reference.target.kind === "ui-test") uiTestTargetIds.add(reference.identifier);
  }
  if (unitTestTargetIds.size === 0 && uiTestTargetIds.size === 0) {
    return invalid("xcode.scheme-test-target-missing");
  }
  return {
    validation: validation("verified", null),
    applicationTargetIds: [...runnableApplicationIds].sort(compareText),
    unitTestTargetIds: [...unitTestTargetIds].sort(compareText),
    uiTestTargetIds: [...uiTestTargetIds].sort(compareText),
  };
}

function parseJsonObject(entry: FileEntry): Readonly<Record<string, unknown>> | null {
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(secureUtf8(entry));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : null;
  } catch {
    return null;
  }
}

function classifyManifest(path: string): ProjectInventoryV1["manifests"][number]["kind"] | null {
  if (path === ".app-factory/project.json") return "project-manifest";
  if (path === ".app-factory/experience-manifest.json") return "experience-manifest";
  if (basename(path) === "Package.swift") return "swift-package";
  if (["Podfile", "Cartfile", "Package.resolved", "Gemfile"].includes(basename(path))) {
    return "dependency-manifest";
  }
  if (["project.yml", "project.yaml"].includes(basename(path))) return "xcodegen";
  if (["Tuist.swift", "Project.swift"].includes(basename(path))) return "tuist";
  if (path.endsWith(".plist")) return "plist";
  if (path.endsWith(".entitlements")) return "entitlements";
  return null;
}

function validateManifest(entry: FileEntry, kind: ProjectInventoryV1["manifests"][number]["kind"]) {
  if (kind === "project-manifest") {
    const parsed = parseJsonObject(entry);
    return parsed?.schemaVersion === 1 &&
      typeof parsed.projectId === "string" &&
      parsed.projectId !== ""
      ? validation("verified", null)
      : validation("invalid", "factory.project-manifest-structure-invalid");
  }
  if (kind === "experience-manifest") {
    const parsed = parseJsonObject(entry);
    return parsed?.schemaVersion === 1 &&
      Array.isArray(parsed.routes) &&
      Array.isArray(parsed.journeys)
      ? validation("verified", null)
      : validation("invalid", "factory.experience-manifest-structure-invalid");
  }
  if (kind === "plist" || kind === "entitlements") {
    if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) {
      return validation("invalid", "artifact.plist-unparseable");
    }
    return safeXmlHasRoot(secureUtf8(entry), "plist")
      ? validation("verified", null)
      : validation("invalid", "artifact.plist-xml-invalid");
  }
  return entry.sizeBytes > 0
    ? validation("verified", null)
    : validation("invalid", "artifact.empty");
}

function isCiPath(path: string): boolean {
  return (
    /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path) ||
    path === "fastlane/Fastfile" ||
    path === "bitrise.yml" ||
    path === ".circleci/config.yml" ||
    path === "azure-pipelines.yml" ||
    path === "Jenkinsfile" ||
    path === ".gitlab-ci.yml"
  );
}

type SignificantYamlLine = Readonly<{ indent: number; text: string }>;

function significantYamlLines(content: string): readonly SignificantYamlLine[] {
  const result: SignificantYamlLine[] = [];
  let blockScalarParentIndent: number | null = null;
  for (const rawLine of content.split(/\r?\n/u)) {
    const indent = /^\s*/u.exec(rawLine)?.[0].replace(/\t/gu, "        ").length ?? 0;
    const text = rawLine.trim();
    if (blockScalarParentIndent !== null) {
      if (text === "" || indent > blockScalarParentIndent) continue;
      blockScalarParentIndent = null;
    }
    if (text === "" || text.startsWith("#")) continue;
    result.push({ indent, text });
    if (/:[ \t]*[>|][+-]?[ \t]*(?:#.*)?$/u.test(text)) blockScalarParentIndent = indent;
  }
  return result;
}

function githubWorkflowHasExecutableStep(content: string): boolean {
  const lines = significantYamlLines(content);
  const jobsIndex = lines.findIndex((line) => line.indent === 0 && line.text === "jobs:");
  if (jobsIndex < 0) return false;
  const jobLines: SignificantYamlLine[] = [];
  for (const line of lines.slice(jobsIndex + 1)) {
    if (line.indent === 0) break;
    jobLines.push(line);
  }
  const jobIndent = Math.min(
    ...jobLines
      .filter((line) => /^[A-Za-z0-9_-]+:\s*(?:#.*)?$/u.test(line.text))
      .map((line) => line.indent),
  );
  if (!Number.isFinite(jobIndent)) return false;
  const jobStarts = jobLines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) => line.indent === jobIndent && /^[A-Za-z0-9_-]+:\s*(?:#.*)?$/u.test(line.text),
    );
  for (const [position, job] of jobStarts.entries()) {
    const end = jobStarts[position + 1]?.index ?? jobLines.length;
    const body = jobLines.slice(job.index + 1, end);
    if (body.some((line) => line.indent > jobIndent && /^uses:\s*\S+/u.test(line.text))) {
      return true;
    }
    const steps = body.find((line) => line.indent > jobIndent && line.text === "steps:");
    if (steps === undefined) continue;
    if (
      body.some(
        (line) => line.indent > steps.indent && /^-\s+(?:run|uses):\s*(?:\S|[>|])/u.test(line.text),
      )
    ) {
      return true;
    }
  }
  return false;
}

function yamlPipelineHasExecutableStep(content: string): boolean {
  const lines = significantYamlLines(content);
  return lines.some((line) => /^-\s+(?:run|script|uses):\s*(?:\S|[>|])/u.test(line.text));
}

function validateCiWorkflow(entry: FileEntry) {
  if (entry.sizeBytes === 0 || entry.sizeBytes > MAX_ARTIFACT_PARSE_BYTES) {
    return validation("invalid", "automation.ci-unparseable");
  }
  const content = secureUtf8(entry);
  const verified = entry.path.startsWith(".github/workflows/")
    ? githubWorkflowHasExecutableStep(content)
    : entry.path === "fastlane/Fastfile"
      ? /\blane\s+:[A-Za-z_][A-Za-z0-9_]*\s+do\b/u.test(content) &&
        /\b(?:build_app|run_tests|scan|sh)\s*\(?/u.test(content)
      : entry.path === "Jenkinsfile"
        ? /\bpipeline\s*\{/u.test(content) && /\bstage\s*\(/u.test(content)
        : yamlPipelineHasExecutableStep(content);
  return verified
    ? validation("verified", null)
    : validation("invalid", "automation.ci-no-executable-step");
}

function classifyLegacyFactory(
  path: string,
): ProjectInventoryV1["legacyFactoryArtifacts"][number]["kind"] | null {
  if (path === ".factory/project-context.json") return "project-context";
  if (
    path.startsWith(".factory/standard-lock/") ||
    [".factory/standard-lock.json", ".factory/standards-lock.json"].includes(path)
  ) {
    return "standard-lock";
  }
  if (path === ".factory/AGENTS.factory.md" || path === "AGENTS.factory.md") {
    return "rule-authority";
  }
  if (path === "quality/quality-manifest.json") return "quality-manifest";
  if (path.startsWith("quality/evidence/")) return "quality-evidence";
  if (path.startsWith("quality/contracts/") || /^quality\/[^/]*contract[^/]*$/iu.test(path)) {
    return "quality-contract";
  }
  if (!path.startsWith(".factory/")) return null;
  const lower = path.toLowerCase();
  if (lower.includes("evidence")) return "quality-evidence";
  if (lower.includes("contract")) return "quality-contract";
  if (lower.includes("manifest")) return "quality-manifest";
  return null;
}

function validateLegacyArtifact(
  entry: FileEntry,
  kind: ProjectInventoryV1["legacyFactoryArtifacts"][number]["kind"],
) {
  if (entry.path.endsWith(".json")) {
    return parseJsonObject(entry) === null
      ? validation("invalid", "compatibility.legacy-json-invalid")
      : validation("verified", null);
  }
  if (kind === "rule-authority") {
    return entry.sizeBytes > 0
      ? validation("verified", null)
      : validation("invalid", "compatibility.legacy-rule-empty");
  }
  return entry.sizeBytes > 0
    ? validation("not-validated", null)
    : validation("invalid", "compatibility.legacy-artifact-empty");
}

type LegacyAuthorityDiscovery = Readonly<{
  graph: ProjectInventoryV1["legacyAuthority"];
  contextValidation: ReturnType<typeof validation> | null;
}>;

function discoverLegacyAuthority(
  fileByPath: ReadonlyMap<RelativeProjectPath, FileEntry>,
): LegacyAuthorityDiscovery {
  const context = fileByPath.get(RelativeProjectPathSchema.parse(".factory/project-context.json"));
  if (context === undefined) return { graph: null, contextValidation: null };
  const parsed = parseJsonObject(context);
  const entryPointObject = parsed?.agentEntryPoints;
  const canonicalValue =
    entryPointObject !== null &&
    typeof entryPointObject === "object" &&
    !Array.isArray(entryPointObject)
      ? (entryPointObject as Readonly<Record<string, unknown>>).canonicalLocalRules
      : undefined;
  const canonicalResult = RelativeProjectPathSchema.safeParse(canonicalValue);
  if (!canonicalResult.success) {
    return {
      graph: null,
      contextValidation: validation("invalid", "compatibility.legacy-authority-graph-invalid"),
    };
  }
  const entryPointRoles = [
    ["generic", "generic"],
    ["claudeCode", "claude"],
    ["gemini", "gemini"],
    ["cursor", "cursor"],
    ["githubCopilot", "github-copilot"],
  ] as const;
  let invalidReference = false;
  const entryPoints: NonNullable<ProjectInventoryV1["legacyAuthority"]>["entryPoints"] = [];
  const rawEntryPoints = entryPointObject as Readonly<Record<string, unknown>>;
  for (const [legacyKey, role] of entryPointRoles) {
    const value = rawEntryPoints[legacyKey];
    if (value === undefined) continue;
    const pathResult = RelativeProjectPathSchema.safeParse(value);
    if (!pathResult.success) {
      invalidReference = true;
      continue;
    }
    const referenced = fileByPath.get(pathResult.data);
    if (referenced === undefined) invalidReference = true;
    entryPoints.push({
      role,
      path: pathResult.data,
      digest: referenced?.digest ?? null,
      present: referenced !== undefined,
    });
  }
  const requiredReading: NonNullable<ProjectInventoryV1["legacyAuthority"]>["requiredReading"] = [];
  if (parsed?.requiredReading !== undefined && !Array.isArray(parsed.requiredReading)) {
    invalidReference = true;
  }
  for (const value of Array.isArray(parsed?.requiredReading) ? parsed.requiredReading : []) {
    const pathResult = RelativeProjectPathSchema.safeParse(value);
    if (!pathResult.success) {
      invalidReference = true;
      continue;
    }
    const referenced = fileByPath.get(pathResult.data);
    if (referenced === undefined) invalidReference = true;
    requiredReading.push({
      path: pathResult.data,
      digest: referenced?.digest ?? null,
      present: referenced !== undefined,
    });
  }
  const canonical = fileByPath.get(canonicalResult.data);
  const generic = entryPoints.find((entryPoint) => entryPoint.role === "generic");
  const structurallyValid =
    canonical !== undefined &&
    canonical.sizeBytes > 0 &&
    classifyLegacyFactory(canonical.path) === "rule-authority" &&
    generic?.present === true &&
    !invalidReference;
  const graph = {
    projectContextPath: context.path,
    projectContextDigest: context.digest,
    canonicalPath: canonicalResult.data,
    canonicalDigest: canonical?.digest ?? null,
    entryPoints: entryPoints.sort(
      (left, right) => compareText(left.role, right.role) || compareText(left.path, right.path),
    ),
    requiredReading: requiredReading.sort((left, right) => compareText(left.path, right.path)),
    validation: structurallyValid
      ? validation("verified", null)
      : validation("invalid", "compatibility.legacy-authority-reference-missing"),
  } satisfies NonNullable<ProjectInventoryV1["legacyAuthority"]>;
  return { graph, contextValidation: graph.validation };
}

function discoverInventory(
  entries: readonly ScanEntry[],
  maximumRuleFileBytes: number,
): Readonly<{ inventory: ProjectInventoryV1; oversizedRulePaths: readonly RelativeProjectPath[] }> {
  const files = fileEntries(entries);
  const directories = directoryEntries(entries);
  const fileByPath = new Map(files.map((entry) => [entry.path, entry]));
  const xcodeContainers: ProjectInventoryV1["xcodeContainers"][number][] = [];
  const targetCatalog = new Map<string, TargetCatalogEntry>();
  for (const entry of directories) {
    if (isTopLevelXcodeContainer(entry.path, ".xcodeproj")) {
      const definition = fileByPath.get(`${entry.path}/project.pbxproj`);
      const analysis = analyzeProjectDefinition(definition);
      xcodeContainers.push({
        kind: "project",
        path: entry.path,
        hasProjectDefinition: definition !== undefined,
        applicationTargetIds: [...analysis.applicationTargetIds],
        unitTestTargetIds: [...analysis.unitTestTargetIds],
        uiTestTargetIds: [...analysis.uiTestTargetIds],
        validation: analysis.validation,
      });
      for (const identifier of analysis.applicationTargetIds) {
        targetCatalog.set(identifier, { kind: "application", containerPath: entry.path });
      }
      for (const identifier of analysis.unitTestTargetIds) {
        targetCatalog.set(identifier, { kind: "unit-test", containerPath: entry.path });
      }
      for (const identifier of analysis.uiTestTargetIds) {
        targetCatalog.set(identifier, { kind: "ui-test", containerPath: entry.path });
      }
    } else if (isTopLevelXcodeContainer(entry.path, ".xcworkspace")) {
      const definition = fileByPath.get(`${entry.path}/contents.xcworkspacedata`);
      xcodeContainers.push({
        kind: "workspace",
        path: entry.path,
        hasProjectDefinition: definition !== undefined,
        applicationTargetIds: [],
        unitTestTargetIds: [],
        uiTestTargetIds: [],
        validation: validateWorkspaceDefinition(definition),
      });
    }
  }
  const knownContainers = new Set(xcodeContainers.map((container) => container.path));
  const xcodeSchemes: ProjectInventoryV1["xcodeSchemes"][number][] = [];
  for (const entry of files) {
    const match =
      /^(.+\.(xcodeproj|xcworkspace))\/xcshareddata\/xcschemes\/([^/]+)\.xcscheme$/u.exec(
        entry.path,
      );
    const containerPath = match?.[1];
    const containerType = match?.[2];
    const schemeName = match?.[3];
    if (
      containerPath === undefined ||
      containerType === undefined ||
      schemeName === undefined ||
      !knownContainers.has(containerPath as RelativeProjectPath)
    ) {
      continue;
    }
    const analysis = analyzeScheme(entry, targetCatalog);
    xcodeSchemes.push({
      name: schemeName,
      path: entry.path,
      containerPath: RelativeProjectPathSchema.parse(containerPath),
      containerKind: containerType === "xcodeproj" ? "project" : "workspace",
      shared: true,
      digest: entry.digest,
      applicationTargetIds: [...analysis.applicationTargetIds],
      unitTestTargetIds: [...analysis.unitTestTargetIds],
      uiTestTargetIds: [...analysis.uiTestTargetIds],
      validation: analysis.validation,
    });
  }

  const swiftFiles = files.filter((entry) => entry.path.endsWith(".swift"));
  const sourceFiles = swiftFiles.filter(
    (entry) => !isTestSource(entry.path) && !isSwiftConfiguration(entry.path),
  );
  const testFiles = swiftFiles.filter(
    (entry) => isTestSource(entry.path) && !isUiTestSource(entry.path),
  );
  const uiTestFiles = swiftFiles.filter((entry) => isUiTestSource(entry.path));
  const paths = (values: readonly FileEntry[]): RelativeProjectPath[] =>
    values.map((entry) => entry.path).sort(compareText);

  const rawRuleFiles: Omit<ProjectInventoryV1["ruleFiles"][number], "authority">[] = [];
  const oversizedRulePaths: RelativeProjectPath[] = [];
  for (const entry of files) {
    const kind = classifyRule(entry.path);
    if (kind === null) continue;
    if (entry.sizeBytes > maximumRuleFileBytes) oversizedRulePaths.push(entry.path);
    rawRuleFiles.push({
      kind,
      path: entry.path,
      scopePath: ruleScope(entry.path),
      digest: entry.digest,
      byteCount: entry.sizeBytes,
      declarations:
        entry.sizeBytes > maximumRuleFileBytes
          ? []
          : parseRuleDeclarations(secureUtf8(entry, maximumRuleFileBytes)),
    });
  }
  rawRuleFiles.sort((left, right) => compareText(left.path, right.path));
  const ruleFiles = addRuleAuthority(rawRuleFiles);

  const manifests: ProjectInventoryV1["manifests"][number][] = [];
  const tests: ProjectInventoryV1["tests"][number][] = [];
  const ci: ProjectInventoryV1["ci"][number][] = [];
  const legacyFactoryArtifacts: ProjectInventoryV1["legacyFactoryArtifacts"][number][] = [];
  const legacyAuthority = discoverLegacyAuthority(fileByPath);
  for (const entry of files) {
    const manifestKind = classifyManifest(entry.path);
    if (manifestKind !== null) {
      manifests.push({
        kind: manifestKind,
        path: entry.path,
        digest: entry.digest,
        validation: validateManifest(entry, manifestKind),
      });
    }
    if (entry.path.endsWith(".xctestplan")) {
      const parsed = parseJsonObject(entry);
      tests.push({
        kind: "test-plan",
        path: entry.path,
        digest: entry.digest,
        validation:
          parsed !== null && Array.isArray(parsed.configurations)
            ? validation("verified", null)
            : validation("invalid", "quality.test-plan-structure-invalid"),
      });
    }
    if (isCiPath(entry.path)) {
      ci.push({
        kind: "ci-workflow",
        path: entry.path,
        digest: entry.digest,
        validation: validateCiWorkflow(entry),
      });
    }
    const legacyKind = classifyLegacyFactory(entry.path);
    if (legacyKind !== null) {
      legacyFactoryArtifacts.push({
        kind: legacyKind,
        path: entry.path,
        digest: entry.digest,
        validation:
          legacyKind === "project-context" && legacyAuthority.contextValidation !== null
            ? legacyAuthority.contextValidation
            : validateLegacyArtifact(entry, legacyKind),
      });
    }
  }
  for (const entry of directories) {
    const legacyKind =
      entry.path === ".factory/standard-lock"
        ? ("standard-lock" as const)
        : entry.path === "quality/evidence"
          ? ("quality-evidence" as const)
          : null;
    if (legacyKind !== null) {
      legacyFactoryArtifacts.push({
        kind: legacyKind,
        path: entry.path,
        digest: projectDigest(["directory", entry.path, entry.mode]),
        validation: validation("not-validated", null),
      });
    }
  }

  const byPath = <T extends Readonly<{ path: string }>>(left: T, right: T): number =>
    compareText(left.path, right.path);
  return {
    inventory: ProjectInventoryV1Schema.parse({
      schemaVersion: 1,
      xcodeContainers: xcodeContainers.sort(byPath),
      xcodeSchemes: xcodeSchemes.sort(byPath),
      swift: {
        sourcePaths: paths(sourceFiles),
        verifiedSourcePaths: paths(sourceFiles.filter(meaningfulSwiftSource)),
        testSourcePaths: paths(testFiles),
        verifiedTestSourcePaths: paths(testFiles.filter(meaningfulSwiftTest)),
        uiTestSourcePaths: paths(uiTestFiles),
        verifiedUiTestSourcePaths: paths(uiTestFiles.filter(meaningfulSwiftUiTest)),
        packageManifestPaths: paths(
          files.filter((entry) => basename(entry.path) === "Package.swift"),
        ),
      },
      ruleFiles,
      effectiveRules: calculateEffectiveRules(ruleFiles),
      manifests: manifests.sort(byPath),
      tests: tests.sort(byPath),
      ci: ci.sort(byPath),
      legacyFactoryArtifacts: legacyFactoryArtifacts.sort(byPath),
      legacyAuthority: legacyAuthority.graph,
      symbolicLinkPaths: entries
        .filter((entry): entry is SymbolicLinkEntry => entry.kind === "symbolic-link")
        .map((entry) => entry.path)
        .sort(compareText),
    }),
    oversizedRulePaths: oversizedRulePaths.sort(compareText),
  };
}

function makeIssue(
  code: EnrollmentIssueCodeV1,
  severity: EnrollmentIssueV1["severity"],
  paths: readonly RelativeProjectPath[],
  summary: string,
): EnrollmentIssueV1 {
  const core = { code, severity, paths: [...paths].sort(compareText), summary };
  const fingerprint = projectDigest(core);
  return EnrollmentIssueV1Schema.parse({
    issueId: `esi-${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    ...core,
  });
}

function evaluateIssues(
  entries: readonly ScanEntry[],
  inventory: ProjectInventoryV1,
  oversizedRulePaths: readonly RelativeProjectPath[],
): readonly EnrollmentIssueV1[] {
  const issues: EnrollmentIssueV1[] = [];
  for (const entry of entries) {
    if (entry.kind !== "symbolic-link") continue;
    if (entry.resolution === "escape") {
      issues.push(
        makeIssue(
          "safety.symlink-path-escape",
          "blocker",
          [entry.path],
          "A symbolic-link chain resolves outside the repository.",
        ),
      );
    } else if (entry.resolution === "broken" || entry.resolution === "cycle") {
      issues.push(
        makeIssue(
          "safety.symlink-chain-unsafe",
          "blocker",
          [entry.path],
          "A symbolic-link chain is broken, cyclic, or cannot be proven safe.",
        ),
      );
    } else {
      issues.push(
        makeIssue(
          "safety.symlink-excluded",
          "warning",
          [entry.path],
          "A symbolic link was inventoried but intentionally not followed.",
        ),
      );
    }
    if (entry.traversesExcludedDirectory) {
      issues.push(
        makeIssue(
          "safety.symlink-through-exclusion",
          "blocker",
          [entry.path],
          "A symbolic-link chain crosses a directory excluded from content hashing.",
        ),
      );
    }
  }
  for (const path of oversizedRulePaths) {
    issues.push(
      makeIssue(
        "rules.oversized-file",
        "warning",
        [path],
        "A rule file exceeds the safe parsing limit and cannot be verified.",
      ),
    );
  }
  const canonical = inventory.ruleFiles.find(
    (file) => file.kind === "agents" && file.path === "AGENTS.md",
  );
  if (canonical === undefined) {
    issues.push(
      makeIssue(
        "rules.no-canonical-authority",
        "gap",
        [],
        "The repository has no root AGENTS.md canonical instruction authority.",
      ),
    );
  } else if (canonical.authority.status !== "canonical") {
    issues.push(
      makeIssue(
        "rules.canonical-unverifiable",
        "blocker",
        [canonical.path],
        "The canonical rule file has no machine-checkable declarations.",
      ),
    );
  }
  const nonconformingAdapters = inventory.ruleFiles
    .filter(
      (file) =>
        !(file.kind === "agents" && basename(file.path) === "AGENTS.md") &&
        file.authority.status !== "conforming",
    )
    .map((file) => file.path)
    .sort(compareText);
  if (nonconformingAdapters.length > 0) {
    issues.push(
      makeIssue(
        "rules.adapter-nonconforming",
        "blocker",
        nonconformingAdapters,
        "Tool-specific rule files must import and digest-bind their nearest canonical AGENTS.md.",
      ),
    );
  }
  for (const effective of inventory.effectiveRules.filter((rule) => rule.conflict)) {
    issues.push(
      makeIssue(
        "rules.conflicting-declaration",
        "blocker",
        effective.sourcePaths,
        `Machine-checkable rule ${effective.key} conflicts at scope ${effective.scopePath}.`,
      ),
    );
  }

  const verifiedContainers = inventory.xcodeContainers.filter(
    (item) => item.validation.status === "verified",
  );
  const verifiedContainerPaths = new Set(verifiedContainers.map((item) => item.path));
  const verifiedSchemes = inventory.xcodeSchemes.filter(
    (item) =>
      item.validation.status === "verified" && verifiedContainerPaths.has(item.containerPath),
  );
  const legacy = inventory.legacyFactoryArtifacts;
  const hasLegacy = legacy.some((artifact) =>
    ["project-context", "standard-lock", "rule-authority"].includes(artifact.kind),
  );
  if (hasLegacy) {
    issues.push(
      makeIssue(
        "compatibility.legacy-factory-layout",
        "blocker",
        legacy.map((artifact) => artifact.path),
        "A legacy .factory contract is present and must be adopted or migrated atomically before enrollment.",
      ),
    );
  }
  const gap = (condition: boolean, code: EnrollmentIssueCodeV1, summary: string): void => {
    if (condition) issues.push(makeIssue(code, "gap", [], summary));
  };
  gap(
    verifiedContainers.length === 0,
    "ios.no-xcode-container",
    "No structurally valid Xcode project or workspace was discovered.",
  );
  gap(
    verifiedSchemes.length === 0,
    "ios.no-shared-scheme",
    "No structurally valid shared Xcode scheme was discovered.",
  );
  gap(
    inventory.swift.verifiedSourcePaths.length === 0,
    "swift.no-source",
    "No non-empty Swift application source was discovered.",
  );
  gap(
    inventory.swift.verifiedTestSourcePaths.length === 0,
    "quality.no-tests",
    "No non-empty Swift test source was discovered.",
  );
  gap(
    inventory.swift.verifiedUiTestSourcePaths.length === 0,
    "quality.no-ui-tests",
    "No non-empty Swift UI test source was discovered.",
  );
  gap(
    !inventory.ci.some((item) => item.validation.status === "verified"),
    "automation.no-ci",
    "No non-empty supported CI workflow was discovered.",
  );

  if (!hasLegacy) {
    const projectManifest = inventory.manifests.find((item) => item.kind === "project-manifest");
    if (projectManifest === undefined) {
      issues.push(
        makeIssue(
          "factory.no-project-manifest",
          "gap",
          [],
          "No app-factory project manifest was discovered.",
        ),
      );
    } else if (projectManifest.validation.status !== "verified") {
      issues.push(
        makeIssue(
          "factory.invalid-project-manifest",
          "blocker",
          [projectManifest.path],
          "The app-factory project manifest is malformed or structurally incomplete.",
        ),
      );
    }
    const experienceManifest = inventory.manifests.find(
      (item) => item.kind === "experience-manifest",
    );
    if (experienceManifest === undefined) {
      issues.push(
        makeIssue(
          "factory.no-experience-manifest",
          "gap",
          [],
          "No app-factory experience manifest was discovered.",
        ),
      );
    } else if (experienceManifest.validation.status !== "verified") {
      issues.push(
        makeIssue(
          "factory.invalid-experience-manifest",
          "blocker",
          [experienceManifest.path],
          "The app-factory experience manifest is malformed or structurally incomplete.",
        ),
      );
    }
  }

  return issues.sort(
    (left, right) =>
      compareText(left.code, right.code) ||
      compareText(left.paths.join("\0"), right.paths.join("\0")) ||
      compareText(left.issueId, right.issueId),
  );
}

type ActionDefinition = Readonly<{
  phase: EnrollmentPlanV1["actions"][number]["phase"];
  kind: EnrollmentPlanV1["actions"][number]["kind"];
  targetPath: RelativeProjectPath | null;
}>;

function actionForIssue(issue: EnrollmentIssueV1): ActionDefinition {
  switch (issue.code) {
    case "safety.symlink-excluded":
    case "safety.symlink-path-escape":
    case "safety.symlink-chain-unsafe":
    case "safety.symlink-through-exclusion":
      return { phase: "safety", kind: "resolve-path-safety", targetPath: issue.paths[0] ?? null };
    case "compatibility.legacy-factory-layout":
      return {
        phase: "compatibility",
        kind: "adopt-or-migrate-legacy-layout",
        targetPath: null,
      };
    case "rules.no-canonical-authority":
    case "rules.canonical-unverifiable":
      return {
        phase: "authority",
        kind: "establish-rule-authority",
        targetPath: RelativeProjectPathSchema.parse("AGENTS.md"),
      };
    case "rules.adapter-nonconforming":
      return {
        phase: "authority",
        kind: "repair-rule-adapter",
        targetPath: issue.paths[0] ?? null,
      };
    case "rules.conflicting-declaration":
    case "rules.oversized-file":
      return {
        phase: "authority",
        kind: "resolve-rule-conflict",
        targetPath: issue.paths[0] ?? null,
      };
    case "factory.no-project-manifest":
      return {
        phase: "project",
        kind: "declare-project",
        targetPath: RelativeProjectPathSchema.parse(".app-factory/project.json"),
      };
    case "factory.invalid-project-manifest":
      return {
        phase: "project",
        kind: "repair-project-manifest",
        targetPath: RelativeProjectPathSchema.parse(".app-factory/project.json"),
      };
    case "factory.no-experience-manifest":
      return {
        phase: "project",
        kind: "declare-experience",
        targetPath: RelativeProjectPathSchema.parse(".app-factory/experience-manifest.json"),
      };
    case "factory.invalid-experience-manifest":
      return {
        phase: "project",
        kind: "repair-experience-manifest",
        targetPath: RelativeProjectPathSchema.parse(".app-factory/experience-manifest.json"),
      };
    case "ios.no-xcode-container":
      return { phase: "project", kind: "create-xcode-container", targetPath: null };
    case "ios.no-shared-scheme":
      return { phase: "project", kind: "share-xcode-scheme", targetPath: null };
    case "swift.no-source":
      return { phase: "project", kind: "add-swift-source", targetPath: null };
    case "quality.no-tests":
      return { phase: "quality", kind: "add-test-target", targetPath: null };
    case "quality.no-ui-tests":
      return { phase: "quality", kind: "add-ui-test-target", targetPath: null };
    case "automation.no-ci":
      return {
        phase: "automation",
        kind: "add-ci-verification",
        targetPath: RelativeProjectPathSchema.parse(".github/workflows/verify.yml"),
      };
  }
  throw new EnrollmentScanError(`unsupported enrollment issue code: ${String(issue.code)}`);
}

function buildPlan(
  sourceFingerprint: Sha256Digest,
  inventoryDigest: Sha256Digest,
  issues: readonly EnrollmentIssueV1[],
): EnrollmentPlanV1 {
  const phaseOrder = new Map([
    ["safety", 0],
    ["compatibility", 1],
    ["authority", 2],
    ["project", 3],
    ["quality", 4],
    ["automation", 5],
  ] as const);
  const actions = issues.map((issue) => {
    const definition = actionForIssue(issue);
    const core = { ...definition, reason: issue.summary, resolvesIssueIds: [issue.issueId] };
    const fingerprint = projectDigest(core);
    return {
      actionId: `epa-${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
      ...core,
    };
  });
  actions.sort(
    (left, right) =>
      (phaseOrder.get(left.phase) ?? 99) - (phaseOrder.get(right.phase) ?? 99) ||
      compareText(left.kind, right.kind) ||
      compareText(left.targetPath ?? "", right.targetPath ?? "") ||
      compareText(left.actionId, right.actionId),
  );
  const blockerIssueIds = issues
    .filter((issue) => issue.severity === "blocker")
    .map((issue) => issue.issueId)
    .sort(compareText);
  return EnrollmentPlanV1Schema.parse({
    schemaVersion: 1,
    mode: "proposal-only",
    requiresSourceRevalidation: true,
    sourceFingerprint,
    inventoryDigest,
    blocked: blockerIssueIds.length > 0,
    blockerIssueIds,
    actions,
  });
}

function assertPreserved(
  before: EnrollmentScanV1["before"],
  after: EnrollmentScanV1["after"],
): void {
  const changed: string[] = [];
  if (before.headSha !== after.headSha) changed.push("Git HEAD");
  if (
    before.statusDigest !== after.statusDigest ||
    before.statusByteCount !== after.statusByteCount ||
    before.dirty !== after.dirty
  ) {
    changed.push("Git status");
  }
  if (
    before.scanSurfaceDigest !== after.scanSurfaceDigest ||
    before.scannedEntryCount !== after.scannedEntryCount ||
    before.scannedFileBytes !== after.scannedFileBytes ||
    canonicalJson(before.excludedPaths) !== canonicalJson(after.excludedPaths)
  ) {
    changed.push("scan-surface content");
  }
  if (before.gitAdmin.digest !== after.gitAdmin.digest) changed.push("Git administrative state");
  if (changed.length > 0) {
    throw new EnrollmentPreservationError(
      `repository changed during read-only enrollment scan: ${changed.join(", ")}`,
    );
  }
}

function readiness(inventory: ProjectInventoryV1, issues: readonly EnrollmentIssueV1[]) {
  const blockingIssueIds = issues
    .filter((issue) => issue.severity === "blocker")
    .map((issue) => issue.issueId)
    .sort(compareText);
  const gapIssueIds = issues
    .filter((issue) => issue.severity === "gap")
    .map((issue) => issue.issueId)
    .sort(compareText);
  const verifiedContainerPaths = new Set(
    inventory.xcodeContainers
      .filter((item) => item.validation.status === "verified")
      .map((item) => item.path),
  );
  return {
    ready: blockingIssueIds.length === 0 && gapIssueIds.length === 0,
    blockingIssueIds,
    gapIssueIds,
    verifiedXcodeContainerCount: inventory.xcodeContainers.filter(
      (item) => item.validation.status === "verified",
    ).length,
    verifiedSharedSchemeCount: inventory.xcodeSchemes.filter(
      (item) =>
        item.validation.status === "verified" && verifiedContainerPaths.has(item.containerPath),
    ).length,
    verifiedSwiftSourceCount: inventory.swift.verifiedSourcePaths.length,
    verifiedTestSourceCount: inventory.swift.verifiedTestSourcePaths.length,
    verifiedUiTestSourceCount: inventory.swift.verifiedUiTestSourcePaths.length,
  };
}

export function scanExistingProject(options: ExistingProjectScanOptions): EnrollmentScanV1 {
  const maximumEntries = options.maxScanEntries ?? DEFAULT_MAX_SCAN_ENTRIES;
  const maximumFileBytes = options.maxScannedFileBytes ?? DEFAULT_MAX_SCANNED_FILE_BYTES;
  const maximumSingleFileBytes = options.maxSingleFileBytes ?? DEFAULT_MAX_SINGLE_FILE_BYTES;
  const maximumRuleFileBytes = options.maxRuleFileBytes ?? DEFAULT_MAX_RULE_FILE_BYTES;
  const maximumGitAdminBytes = options.maxGitAdminBytes ?? DEFAULT_MAX_GIT_ADMIN_BYTES;
  assertPositiveLimit(maximumEntries, "maxScanEntries");
  assertPositiveLimit(maximumFileBytes, "maxScannedFileBytes");
  assertPositiveLimit(maximumSingleFileBytes, "maxSingleFileBytes");
  assertPositiveLimit(maximumRuleFileBytes, "maxRuleFileBytes");
  assertPositiveLimit(maximumGitAdminBytes, "maxGitAdminBytes");
  if (maximumSingleFileBytes > maximumFileBytes) {
    throw new EnrollmentScanError("maxSingleFileBytes may not exceed maxScannedFileBytes");
  }
  if (maximumGitAdminBytes > HARD_MAX_GIT_ADMIN_BYTES) {
    throw new EnrollmentScanError(
      `maxGitAdminBytes may not exceed the hard safety limit of ${String(HARD_MAX_GIT_ADMIN_BYTES)}`,
    );
  }

  const repositoryRoot = assertRepositoryRoot(options.repositoryRoot);
  const layout = resolveGitLayout(repositoryRoot);
  const before = captureSnapshot(
    repositoryRoot,
    layout,
    maximumEntries,
    maximumFileBytes,
    maximumSingleFileBytes,
    maximumGitAdminBytes,
  );
  const discovery = discoverInventory(before.entries, maximumRuleFileBytes);
  options.quiescenceCheckpoint?.();
  const after = captureSnapshot(
    repositoryRoot,
    layout,
    maximumEntries,
    maximumFileBytes,
    maximumSingleFileBytes,
    maximumGitAdminBytes,
  );
  assertPreserved(before.snapshot, after.snapshot);

  const inventoryDigest = projectDigest(discovery.inventory);
  const issues = evaluateIssues(before.entries, discovery.inventory, discovery.oversizedRulePaths);
  const sourceFingerprint = projectDigest(after.snapshot);
  const plan = buildPlan(sourceFingerprint, inventoryDigest, issues);
  const planDigest = projectDigest(plan);
  return EnrollmentScanV1Schema.parse({
    schemaVersion: 1,
    repositoryRoot,
    before: before.snapshot,
    inventory: discovery.inventory,
    inventoryDigest,
    issues,
    readiness: readiness(discovery.inventory, issues),
    plan,
    planDigest,
    after: after.snapshot,
    preservation: {
      headUnchanged: true,
      statusUnchanged: true,
      scanSurfaceUnchanged: true,
      gitAdminUnchanged: true,
    },
  });
}
