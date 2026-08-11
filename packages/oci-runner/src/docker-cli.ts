import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import {
  OCI_PRIVATE_TMPFS_PATH,
  OCI_WORKSPACE_PATH,
  labelsForOciRun,
  parseOciRunIntent,
  type OciImageIdentityV1,
  type OciRunIntentV1,
} from "./model.js";

const CONTAINER_ID = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAX_DOCKER_CONTROL_OUTPUT = 2 * 1024 * 1024;
const CONTAINER_USER = "10001:10001";
const MAX_WORKTREE_ENTRIES = 200_000;
const UNIX_SOCKET_PREFIX = "unix://";
const SAFE_CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const INSPECT_FORMAT = "{{json .}}";

type PinnedFilesystemIdentity = Readonly<{
  path: string;
  device: string;
  inode: string;
  ctimeNanoseconds: string;
  size: string;
  owner: string;
  mode: string;
  digest: string | null;
}>;

export type OciContainerInspection = Readonly<{
  containerId: string;
  name: string;
  imageId: string;
  labels: Readonly<Record<string, string>>;
  user: string;
  command: readonly string[];
  entrypoint: readonly string[] | null;
  workingDirectory: string;
  environment: readonly string[];
  status: "created" | "running" | "terminal";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  oomKilled: boolean;
  running: boolean;
  readOnlyRootFilesystem: boolean;
  networkMode: string;
  capDrop: readonly string[];
  securityOptions: readonly string[];
  memoryBytes: number;
  memorySwapBytes: number;
  pidLimit: number;
  cpuNanoCount: number;
  stopTimeoutSeconds: number;
  privileged: boolean;
  tmpfs: Readonly<Record<string, string>>;
  logDriver: string;
  logOptions: Readonly<Record<string, string>>;
  mounts: readonly Readonly<{
    type: string;
    source: string;
    destination: string;
    readWrite: boolean;
  }>[];
}>;

export type OciLogCapture = Readonly<{
  stdout: Buffer;
  stderr: Buffer;
  stdoutObservedBytes: number;
  stderrObservedBytes: number;
}>;

export type OciRemovalEvidence = Readonly<{
  schemaVersion: 1;
  containerId: string;
  absent: true;
  observedAt: string;
}>;

export type OciEnginePort = Readonly<{
  verifyImage(image: OciImageIdentityV1): Promise<void>;
  findByLabels(labels: Readonly<Record<string, string>>): Promise<OciContainerInspection | null>;
  create(intent: OciRunIntentV1): Promise<string>;
  inspect(containerId: string): Promise<OciContainerInspection | null>;
  start(containerId: string): Promise<void>;
  logs(containerId: string, maximumBytesPerStream: number): Promise<OciLogCapture>;
  stop(containerId: string, graceMs: number): Promise<void>;
  kill(containerId: string): Promise<void>;
  remove(containerId: string): Promise<void>;
}>;

export type DockerCommandResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  stdoutObservedBytes: number;
  stderrObservedBytes: number;
  timedOut: boolean;
}>;

export type DockerCliConfiguration = Readonly<{
  executable: string;
  executableDigest: string;
  host: string;
  expectedClientVersion: string;
  expectedServerVersion: string;
  expectedServerOs: "linux";
  expectedServerArchitecture: "arm64" | "amd64";
}>;

export type DockerCliDependencies = Readonly<{
  invoke?: (
    executable: string,
    args: readonly string[],
    maximumOutputBytes: number,
    timeoutMs: number,
  ) => Promise<DockerCommandResult>;
  digestExecutable?: (path: string) => string;
}>;

function boundedLine(value: unknown, label: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new TypeError(`${label} must be one bounded line`);
  }
  return value;
}

function currentUserId(): bigint {
  if (typeof process.getuid !== "function") {
    throw new TypeError("Docker containment requires a Unix user identity");
  }
  return BigInt(process.getuid());
}

function filesystemIdentity(path: string, digest: string | null): PinnedFilesystemIdentity {
  const stats = lstatSync(path, { bigint: true });
  return {
    path,
    device: String(stats.dev),
    inode: String(stats.ino),
    ctimeNanoseconds: String(stats.ctimeNs),
    size: String(stats.size),
    owner: String(stats.uid),
    mode: String(stats.mode),
    digest,
  };
}

function identityFieldsMatch(
  left: PinnedFilesystemIdentity,
  right: PinnedFilesystemIdentity,
): boolean {
  return (
    left.path === right.path &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.ctimeNanoseconds === right.ctimeNanoseconds &&
    left.size === right.size &&
    left.owner === right.owner &&
    left.mode === right.mode &&
    left.digest === right.digest
  );
}

function captureExecutableIdentity(
  value: string,
  expectedDigest: string,
  digestExecutable: (path: string) => string,
): PinnedFilesystemIdentity {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new TypeError("Docker executable must be one normalized absolute path");
  }
  // Homebrew's stable /opt/homebrew/bin/docker entry is a symlink. Resolve it once,
  // pin the Cellar file, and invoke that immutable path for the lifetime of this port.
  const canonical = realpathSync(value);
  if (!isAbsolute(canonical) || resolve(canonical) !== canonical) {
    throw new TypeError("Docker executable must resolve to one canonical absolute path");
  }
  const before = lstatSync(canonical, { bigint: true });
  const owner = before.uid;
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    (before.mode & 0o222n) !== 0n ||
    (before.mode & 0o111n) === 0n ||
    (owner !== 0n && owner !== currentUserId())
  ) {
    throw new TypeError(
      "Docker executable must be a singly-linked, trusted-owner, non-writable real file",
    );
  }
  const observedDigest = digestExecutable(canonical);
  if (!DIGEST.test(expectedDigest) || observedDigest !== expectedDigest) {
    throw new TypeError("Docker executable digest does not match the pinned configuration");
  }
  const identity = filesystemIdentity(canonical, observedDigest);
  if (
    String(before.dev) !== identity.device ||
    String(before.ino) !== identity.inode ||
    String(before.ctimeNs) !== identity.ctimeNanoseconds ||
    String(before.size) !== identity.size
  ) {
    throw new TypeError("Docker executable changed while its identity was being pinned");
  }
  return identity;
}

function assertExecutableIdentity(
  expected: PinnedFilesystemIdentity,
  digestExecutable: (path: string) => string,
): void {
  const stats = lstatSync(expected.path, { bigint: true });
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.nlink !== 1n ||
    (stats.mode & 0o222n) !== 0n ||
    (stats.mode & 0o111n) === 0n ||
    (stats.uid !== 0n && stats.uid !== currentUserId())
  ) {
    throw new Error("Docker executable no longer has its trusted immutable identity");
  }
  const observed = filesystemIdentity(expected.path, digestExecutable(expected.path));
  if (!identityFieldsMatch(observed, expected)) {
    throw new Error("Docker executable identity drifted after it was pinned");
  }
}

function canonicalSocketPath(host: string): string {
  if (
    !host.startsWith(`${UNIX_SOCKET_PREFIX}/`) ||
    host.includes("\0") ||
    host.includes("\r") ||
    host.includes("\n") ||
    host.includes("?") ||
    host.includes("#") ||
    host.includes("%")
  ) {
    throw new TypeError("Docker host must be one explicit unescaped Unix socket URL");
  }
  const path = host.slice(UNIX_SOCKET_PREFIX.length);
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new TypeError("Docker socket must be one normalized absolute path");
  }
  return path;
}

function captureSocketIdentity(host: string, required: boolean): PinnedFilesystemIdentity | null {
  const path = canonicalSocketPath(host);
  if (!existsSync(path)) {
    // A custom command invoker is a trusted test seam and may model the socket.
    // The real Docker CLI path never permits an absent socket.
    if (!required) return null;
    throw new TypeError("Docker Unix socket does not exist");
  }
  if (realpathSync(path) !== path) {
    throw new TypeError("Docker Unix socket must be a canonical real path");
  }
  const stats = lstatSync(path, { bigint: true });
  if (
    !stats.isSocket() ||
    stats.isSymbolicLink() ||
    stats.uid !== currentUserId() ||
    (stats.mode & 0o077n) !== 0n ||
    (stats.mode & 0o600n) !== 0o600n
  ) {
    throw new TypeError(
      "Docker Unix socket must be current-user-owned with no group or world access",
    );
  }
  return filesystemIdentity(path, null);
}

function assertSocketIdentity(expected: PinnedFilesystemIdentity | null): void {
  if (expected === null) return;
  const stats = lstatSync(expected.path, { bigint: true });
  if (
    !stats.isSocket() ||
    stats.isSymbolicLink() ||
    stats.uid !== currentUserId() ||
    (stats.mode & 0o077n) !== 0n ||
    (stats.mode & 0o600n) !== 0o600n ||
    realpathSync(expected.path) !== expected.path
  ) {
    throw new Error("Docker Unix socket no longer has its trusted private identity");
  }
  if (!identityFieldsMatch(filesystemIdentity(expected.path, null), expected)) {
    throw new Error("Docker Unix socket identity drifted after it was pinned");
  }
}

function assertNoSymlinkAncestors(path: string): void {
  const root = parse(path).root;
  let cursor = root;
  for (const component of relative(root, path).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new TypeError(`OCI worktree path traverses a symbolic link: ${cursor}`);
    }
  }
}

function assertSafeWorktree(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new TypeError("OCI worktree must be a normalized absolute path");
  }
  if (/[,"\\]/u.test(path)) {
    throw new TypeError("OCI worktree path contains unsafe Docker mount grammar");
  }
  assertNoSymlinkAncestors(path);
  const rootStats = lstatSync(path);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || realpathSync(path) !== path) {
    throw new TypeError("OCI worktree must be one real directory");
  }
  const pending = [path];
  let entries = 0;
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const name of readdirSync(directory)) {
      entries += 1;
      if (entries > MAX_WORKTREE_ENTRIES) {
        throw new TypeError("OCI worktree exceeds its bounded entry inventory");
      }
      const child = join(directory, name);
      const stats = lstatSync(child);
      if (stats.isSymbolicLink())
        throw new TypeError(`OCI worktree contains a symbolic link: ${child}`);
      if (stats.isDirectory()) pending.push(child);
      else if (!stats.isFile())
        throw new TypeError(`OCI worktree contains a special file: ${child}`);
      else if (stats.nlink !== 1)
        throw new TypeError(`OCI worktree contains a hard-linked file: ${child}`);
    }
  }
  return path;
}

function executableDigest(path: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function canonicalRepositoryDigest(reference: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator < 1 || !DIGEST.test(reference.slice(separator + 1))) {
    throw new TypeError("Docker image reference must contain one pinned SHA-256 digest");
  }
  const namedReference = reference.slice(0, separator);
  const digest = reference.slice(separator + 1);
  const lastSlash = namedReference.lastIndexOf("/");
  const tagSeparator = namedReference.lastIndexOf(":");
  const repository =
    tagSeparator > lastSlash ? namedReference.slice(0, tagSeparator) : namedReference;
  return `${repository}@${digest}`;
}

function assertDockerCommandResultShape(
  result: DockerCommandResult,
  maximumOutputBytes: number,
): void {
  if (
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    typeof result.timedOut !== "boolean" ||
    (result.exitCode !== null &&
      (!Number.isSafeInteger(result.exitCode) || result.exitCode < 0 || result.exitCode > 255)) ||
    (result.signal !== null && !/^SIG[A-Z0-9]+$/u.test(result.signal)) ||
    !Number.isSafeInteger(result.stdoutObservedBytes) ||
    !Number.isSafeInteger(result.stderrObservedBytes) ||
    result.stdoutObservedBytes < result.stdout.byteLength ||
    result.stderrObservedBytes < result.stderr.byteLength ||
    result.stdout.byteLength > maximumOutputBytes ||
    result.stderr.byteLength > maximumOutputBytes
  ) {
    throw new Error("Docker command returned invalid bounded process metadata");
  }
}

async function invokeDocker(
  executable: string,
  args: readonly string[],
  maximumOutputBytes: number,
  timeoutMs: number,
): Promise<DockerCommandResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutObservedBytes = 0;
    let stderrObservedBytes = 0;
    let timedOut = false;
    const accept = (target: Buffer[], chunk: Buffer, observed: number): void => {
      const captured = target.reduce((total, item) => total + item.byteLength, 0);
      if (observed > maximumOutputBytes) child.kill("SIGKILL");
      if (captured >= maximumOutputBytes) return;
      target.push(chunk.subarray(0, maximumOutputBytes - captured));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutObservedBytes += chunk.byteLength;
      accept(stdout, chunk, stdoutObservedBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrObservedBytes += chunk.byteLength;
      accept(stderr, chunk, stderrObservedBytes);
    });
    child.once("error", rejectPromise);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        stdoutObservedBytes,
        stderrObservedBytes,
        timedOut,
      });
    });
  });
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function stringMap(value: unknown, label: string): Readonly<Record<string, string>> {
  const input = object(value, label);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item !== "string") throw new Error(`${label}.${key} must be a string`);
    result[key] = item;
  }
  return result;
}

function stringArray(value: unknown, label: string): readonly string[] {
  return array(value, label).map((item, index) =>
    boundedLine(item, `${label}[${String(index)}]`, 16_384),
  );
}

function dockerInstant(value: unknown, label: string): string | null {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (value === "0001-01-01T00:00:00Z") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} is invalid`);
  return parsed.toISOString();
}

function assertEmptyOrNull(value: unknown, label: string): void {
  if (value === null) return;
  if (!Array.isArray(value) || value.length !== 0) {
    throw new Error(`${label} must be empty`);
  }
}

function assertEmptyObject(value: unknown, label: string): void {
  if (Object.keys(object(value, label)).length !== 0) {
    throw new Error(`${label} must be empty`);
  }
}

function assertExactString(value: unknown, expected: string, label: string): void {
  if (value !== expected) throw new Error(`${label} differs from the locked safe value`);
}

function assertLockedDockerSecurityMetadata(
  input: Record<string, unknown>,
  host: Record<string, unknown>,
  securityOptions: readonly string[],
): void {
  if (host.ReadonlyRootfs !== true || host.Privileged !== false || host.NetworkMode !== "none") {
    throw new Error("Docker root filesystem, privilege, or network isolation is unsafe");
  }
  const capDrop = stringArray(host.CapDrop, "CapDrop");
  if (capDrop.length !== 1 || capDrop[0] !== "ALL") {
    throw new Error("CapDrop must be exactly ALL");
  }
  assertEmptyOrNull(host.CapAdd, "CapAdd");
  assertEmptyOrNull(host.Devices, "Devices");
  assertEmptyOrNull(host.DeviceRequests, "DeviceRequests");
  assertEmptyOrNull(host.DeviceCgroupRules, "DeviceCgroupRules");
  assertExactString(host.PidMode, "", "PidMode");
  assertExactString(host.IpcMode, "private", "IpcMode");
  assertExactString(host.UTSMode, "", "UTSMode");
  assertExactString(host.UsernsMode, "", "UsernsMode");
  assertExactString(host.CgroupnsMode, "private", "CgroupnsMode");
  if (host.AutoRemove !== false) throw new Error("AutoRemove must be disabled");
  const restart = object(host.RestartPolicy, "RestartPolicy");
  if (
    restart.Name !== "no" ||
    restart.MaximumRetryCount !== 0 ||
    Object.keys(restart).length !== 2
  ) {
    throw new Error("RestartPolicy must be exactly no-restart");
  }
  if (
    securityOptions.length !== 1 ||
    securityOptions[0] !== "no-new-privileges=true" ||
    securityOptions.some((option) => {
      const normalized = option.toLowerCase();
      return normalized === "seccomp=unconfined" || normalized === "apparmor=unconfined";
    })
  ) {
    throw new Error("SecurityOpt must be exactly no-new-privileges=true");
  }
  if (host.PublishAllPorts !== false) throw new Error("PublishAllPorts must be disabled");
  assertEmptyObject(host.PortBindings, "PortBindings");
  const tmpfs = stringMap(host.Tmpfs, "Tmpfs");
  if (Object.keys(tmpfs).length !== 1) {
    throw new Error("Docker must have exactly one private tmpfs");
  }
  const tmpfsOptions = tmpfs[OCI_PRIVATE_TMPFS_PATH]?.split(",") ?? [];
  const requiredTmpfsOptions = [
    "rw",
    "nosuid",
    "nodev",
    "noexec",
    "mode=0700",
    "uid=10001",
    "gid=10001",
  ];
  if (
    requiredTmpfsOptions.some((option) => !tmpfsOptions.includes(option)) ||
    tmpfsOptions.filter((option) => /^size=[1-9][0-9]*$/u.test(option)).length !== 1 ||
    tmpfsOptions.length !== requiredTmpfsOptions.length + 1
  ) {
    throw new Error("Docker private tmpfs options are not exactly locked");
  }

  const networkSettings = object(input.NetworkSettings, "Docker NetworkSettings");
  const sandboxId = networkSettings.SandboxID;
  const sandboxKey = networkSettings.SandboxKey;
  const absentSandbox = sandboxId === "" && sandboxKey === "";
  const privateSandbox =
    typeof sandboxId === "string" &&
    /^[0-9a-f]{64}$/u.test(sandboxId) &&
    typeof sandboxKey === "string" &&
    /^\/var\/run\/docker\/netns\/[A-Za-z0-9_.-]{1,128}$/u.test(sandboxKey);
  if (!absentSandbox && !privateSandbox) {
    throw new Error("Docker network sandbox identity is not an inert private namespace");
  }
  assertEmptyObject(networkSettings.Ports, "Docker NetworkSettings.Ports");
  const networks = object(networkSettings.Networks, "Docker NetworkSettings.Networks");
  if (Object.keys(networks).length !== 1 || !("none" in networks)) {
    throw new Error("Docker container must have only the inert none network record");
  }
  const none = object(networks.none, "Docker none network record");
  for (const key of ["IPAMConfig", "Links", "Aliases", "DriverOpts", "DNSNames"]) {
    if (none[key] !== null) {
      throw new Error(`Docker none network record has non-null ${key}`);
    }
  }
  for (const key of ["Gateway", "IPAddress", "MacAddress", "IPv6Gateway", "GlobalIPv6Address"]) {
    if (none[key] !== "") {
      throw new Error(`Docker none network record has an active ${key}`);
    }
  }
  for (const key of ["NetworkID", "EndpointID"] as const) {
    const identifier = none[key];
    if (
      identifier !== "" &&
      (typeof identifier !== "string" || !/^[0-9a-f]{64}$/u.test(identifier))
    ) {
      throw new Error(`Docker none network record has an invalid ${key}`);
    }
  }
  if (none.IPPrefixLen !== 0 || none.GlobalIPv6PrefixLen !== 0) {
    throw new Error("Docker none network record has active address prefixes");
  }
  if (none.GwPriority !== 0) {
    throw new Error("Docker none network record has an active gateway priority");
  }
}

function parseDockerInspectionValue(
  value: unknown,
  requireLockedSecurityMetadata: boolean,
): OciContainerInspection {
  const inputArray = array(value, "Docker inspect result");
  if (inputArray.length !== 1) throw new Error("Docker inspect must return exactly one container");
  const input = object(inputArray[0], "Docker inspect entry");
  const id = boundedLine(input.Id, "container ID", 64);
  if (!CONTAINER_ID.test(id)) throw new Error("Docker returned an invalid container ID");
  const imageId = boundedLine(input.Image, "image ID", 71);
  if (!DIGEST.test(imageId)) throw new Error("Docker returned an invalid image ID");
  const config = object(input.Config, "Docker Config");
  const host = object(input.HostConfig, "Docker HostConfig");
  const state = object(input.State, "Docker State");
  const running = state.Running;
  const oomKilled = state.OOMKilled;
  const exitCode = state.ExitCode;
  if (
    typeof running !== "boolean" ||
    typeof oomKilled !== "boolean" ||
    !Number.isInteger(exitCode)
  ) {
    throw new Error("Docker returned invalid container state");
  }
  const rawStatus = boundedLine(state.Status, "container status", 32);
  if (
    requireLockedSecurityMetadata &&
    (state.Error !== "" ||
      state.Paused !== false ||
      state.Restarting !== false ||
      state.Dead !== false)
  ) {
    throw new Error("Docker container has an unsafe or failed runtime state");
  }
  const status = running ? "running" : rawStatus === "created" ? "created" : "terminal";
  const mounts = array(input.Mounts, "Docker Mounts").map((item, index) => {
    const mount = object(item, `Docker Mounts[${String(index)}]`);
    if (typeof mount.RW !== "boolean") throw new Error("Docker mount RW flag is invalid");
    if (
      requireLockedSecurityMetadata &&
      mount.Type === "bind" &&
      mount.Propagation !== "rprivate"
    ) {
      throw new Error("Docker bind propagation must be exactly rprivate");
    }
    return {
      type: boundedLine(mount.Type, "mount type", 32),
      source: boundedLine(mount.Source, "mount source", 8_192),
      destination: boundedLine(mount.Destination, "mount destination", 8_192),
      readWrite: mount.RW,
    };
  });
  const capDrop = array(host.CapDrop ?? [], "CapDrop").map((item) =>
    boundedLine(item, "CapDrop entry", 64),
  );
  const securityOptions = array(host.SecurityOpt ?? [], "SecurityOpt").map((item) =>
    boundedLine(item, "SecurityOpt entry", 256),
  );
  if (requireLockedSecurityMetadata) {
    assertLockedDockerSecurityMetadata(input, host, securityOptions);
  }
  const memory = host.Memory;
  const memorySwap = host.MemorySwap;
  const pids = host.PidsLimit;
  const nanoCpus = host.NanoCpus;
  const stopTimeout =
    requireLockedSecurityMetadata || config.StopTimeout !== undefined
      ? config.StopTimeout
      : host.StopTimeout;
  if (
    !Number.isSafeInteger(memory) ||
    !Number.isSafeInteger(memorySwap) ||
    !Number.isSafeInteger(pids) ||
    !Number.isSafeInteger(nanoCpus) ||
    !Number.isSafeInteger(stopTimeout) ||
    typeof host.Privileged !== "boolean"
  ) {
    throw new Error("Docker returned invalid resource limits");
  }
  const rawEntrypoint = config.Entrypoint;
  const entrypoint = rawEntrypoint === null ? null : stringArray(rawEntrypoint, "Entrypoint");
  const logConfig = object(host.LogConfig, "LogConfig");
  const inspection: OciContainerInspection = {
    containerId: id,
    name: boundedLine(input.Name, "container name", 129).replace(/^\//u, ""),
    imageId,
    labels: stringMap(config.Labels ?? {}, "Docker labels"),
    user: boundedLine(config.User, "container user", 128),
    command: stringArray(config.Cmd, "container command"),
    entrypoint,
    workingDirectory: boundedLine(config.WorkingDir, "container working directory", 8_192),
    environment: stringArray(config.Env, "container environment"),
    status,
    createdAt: dockerInstant(input.Created, "Created") as string,
    startedAt: dockerInstant(state.StartedAt, "StartedAt"),
    finishedAt: dockerInstant(state.FinishedAt, "FinishedAt"),
    exitCode: status === "terminal" ? (exitCode as number) : null,
    oomKilled,
    running,
    readOnlyRootFilesystem: host.ReadonlyRootfs === true,
    networkMode: boundedLine(host.NetworkMode, "NetworkMode", 128),
    capDrop,
    securityOptions,
    memoryBytes: memory as number,
    memorySwapBytes: memorySwap as number,
    pidLimit: pids as number,
    cpuNanoCount: nanoCpus as number,
    stopTimeoutSeconds: stopTimeout as number,
    privileged: host.Privileged,
    tmpfs: stringMap(host.Tmpfs ?? {}, "Tmpfs"),
    logDriver: boundedLine(logConfig.Type, "log driver", 128),
    logOptions: stringMap(logConfig.Config ?? {}, "log options"),
    mounts,
  };
  return inspection;
}

/**
 * Parses the stable inspection fields used by persisted OCI evidence. Runtime
 * Docker calls additionally use the strict locked-metadata parser below. The
 * compatibility parser remains intentionally narrow for previously persisted
 * V1 inspection fixtures that predate the additive raw Docker security fields.
 */
export function parseDockerInspection(value: unknown): OciContainerInspection {
  return parseDockerInspectionValue(value, false);
}

export function buildDockerCreateArguments(intentInput: OciRunIntentV1): readonly string[] {
  const intent = parseOciRunIntent(intentInput);
  assertSafeWorktree(intent.worktreeHostPath);
  if (!SAFE_CONTAINER_NAME.test(intent.containerName)) {
    throw new TypeError("OCI container name is not Docker-safe");
  }
  const labels = labelsForOciRun(intent);
  const args: string[] = [
    "create",
    "--pull",
    "never",
    "--name",
    intent.containerName,
    "--read-only",
    "--network",
    "none",
    "--cgroupns",
    "private",
    "--ipc",
    "private",
    "--restart",
    "no",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges=true",
    "--user",
    CONTAINER_USER,
    "--entrypoint",
    "",
    "--cpus",
    String(intent.limits.cpuCount),
    "--memory",
    String(intent.limits.memoryBytes),
    "--memory-swap",
    String(intent.limits.memoryBytes),
    "--pids-limit",
    String(intent.limits.pidLimit),
    "--stop-timeout",
    String(Math.ceil(intent.limits.stopGraceMs / 1_000)),
    "--log-driver",
    "local",
    "--log-opt",
    `max-size=${String(intent.limits.outputBytesPerStream)}b`,
    "--log-opt",
    "max-file=1",
    "--log-opt",
    "compress=false",
    "--mount",
    `type=bind,src=${intent.worktreeHostPath},dst=${OCI_WORKSPACE_PATH},bind-propagation=rprivate`,
    "--tmpfs",
    `${OCI_PRIVATE_TMPFS_PATH}:rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    "--workdir",
    OCI_WORKSPACE_PATH,
  ];
  for (const [name, value] of Object.entries(labels).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    args.push("--label", `${name}=${value}`);
  }
  for (const entry of intent.environment) args.push("--env", `${entry.name}=${entry.value}`);
  args.push(intent.image.reference, intent.agentExecutable, ...intent.agentArguments);
  return args;
}

function assertInspectionMatches(inspection: OciContainerInspection, intent: OciRunIntentV1): void {
  const expectedLabels = labelsForOciRun(intent);
  const expectedEnvironment = intent.environment.map(({ name, value }) => `${name}=${value}`);
  const expectedCommand = [intent.agentExecutable, ...intent.agentArguments];
  const expectedTmpfsOptions = [
    "rw",
    "nosuid",
    "nodev",
    "noexec",
    `size=${String(intent.limits.privateTmpfsBytes)}`,
    "mode=0700",
    "uid=10001",
    "gid=10001",
  ];
  const tmpfsOptions = inspection.tmpfs[OCI_PRIVATE_TMPFS_PATH]?.split(",") ?? [];
  if (
    inspection.name !== intent.containerName ||
    inspection.imageId !== intent.image.imageId ||
    inspection.user !== CONTAINER_USER ||
    JSON.stringify(inspection.command) !== JSON.stringify(expectedCommand) ||
    (inspection.entrypoint !== null && inspection.entrypoint.length !== 0) ||
    inspection.workingDirectory !== OCI_WORKSPACE_PATH ||
    JSON.stringify([...inspection.environment].sort()) !==
      JSON.stringify([...expectedEnvironment].sort()) ||
    inspection.networkMode !== "none" ||
    !inspection.readOnlyRootFilesystem ||
    JSON.stringify(inspection.capDrop) !== JSON.stringify(["ALL"]) ||
    JSON.stringify(inspection.securityOptions) !== JSON.stringify(["no-new-privileges=true"]) ||
    inspection.memoryBytes !== intent.limits.memoryBytes ||
    inspection.memorySwapBytes !== intent.limits.memoryBytes ||
    inspection.pidLimit !== intent.limits.pidLimit ||
    inspection.cpuNanoCount !== intent.limits.cpuCount * 1_000_000_000 ||
    inspection.stopTimeoutSeconds !== Math.ceil(intent.limits.stopGraceMs / 1_000) ||
    inspection.privileged ||
    inspection.logDriver !== "local" ||
    inspection.logOptions["max-size"] !== `${String(intent.limits.outputBytesPerStream)}b` ||
    inspection.logOptions["max-file"] !== "1" ||
    inspection.logOptions.compress !== "false" ||
    Object.keys(inspection.logOptions).length !== 3 ||
    Object.keys(inspection.labels).length !== Object.keys(expectedLabels).length ||
    Object.keys(expectedLabels).some((key) => inspection.labels[key] !== expectedLabels[key]) ||
    expectedTmpfsOptions.some((option) => !tmpfsOptions.includes(option)) ||
    tmpfsOptions.length !== expectedTmpfsOptions.length
  ) {
    throw new Error("Docker container identity or isolation settings differ from the intent");
  }
  const writableBinds = inspection.mounts.filter(
    (mount) => mount.readWrite && mount.type === "bind",
  );
  const unexpectedMount = inspection.mounts.find(
    (mount) =>
      !(
        (mount.type === "bind" &&
          mount.source === intent.worktreeHostPath &&
          mount.destination === OCI_WORKSPACE_PATH &&
          mount.readWrite) ||
        (mount.type === "tmpfs" && mount.destination === OCI_PRIVATE_TMPFS_PATH && mount.readWrite)
      ),
  );
  if (
    writableBinds.length !== 1 ||
    writableBinds[0]?.source !== intent.worktreeHostPath ||
    writableBinds[0].destination !== OCI_WORKSPACE_PATH ||
    unexpectedMount !== undefined
  ) {
    throw new Error("Docker container does not have exactly one writable worktree bind mount");
  }
}

export class DockerCliEngine implements OciEnginePort {
  readonly #configuration: DockerCliConfiguration;
  readonly #invoke: NonNullable<DockerCliDependencies["invoke"]>;
  readonly #digestExecutable: NonNullable<DockerCliDependencies["digestExecutable"]>;
  readonly #executableIdentity: PinnedFilesystemIdentity;
  readonly #socketIdentity: PinnedFilesystemIdentity | null;

  public static async create(
    input: DockerCliConfiguration,
    dependencies: DockerCliDependencies = {},
  ): Promise<DockerCliEngine> {
    const digest = dependencies.digestExecutable ?? executableDigest;
    const executableIdentity = captureExecutableIdentity(
      input.executable,
      input.executableDigest,
      digest,
    );
    const socketIdentity = captureSocketIdentity(input.host, dependencies.invoke === undefined);
    const engine = new DockerCliEngine(
      { ...input, executable: executableIdentity.path },
      dependencies.invoke ?? invokeDocker,
      digest,
      executableIdentity,
      socketIdentity,
    );
    const result = await engine.#command(
      [
        "version",
        "--format",
        "{{.Client.Version}}|{{.Server.Version}}|{{.Server.Os}}|{{.Server.Arch}}",
      ],
      MAX_DOCKER_CONTROL_OUTPUT,
      5_000,
    );
    const expected = `${input.expectedClientVersion}|${input.expectedServerVersion}|${input.expectedServerOs}|${input.expectedServerArchitecture}`;
    if (result.stdout.toString("utf8").trim() !== expected) {
      throw new Error("Docker client/server identity does not match the pinned configuration");
    }
    return engine;
  }

  private constructor(
    configuration: DockerCliConfiguration,
    invoke: NonNullable<DockerCliDependencies["invoke"]>,
    digestExecutable: NonNullable<DockerCliDependencies["digestExecutable"]>,
    executableIdentity: PinnedFilesystemIdentity,
    socketIdentity: PinnedFilesystemIdentity | null,
  ) {
    this.#configuration = configuration;
    this.#invoke = invoke;
    this.#digestExecutable = digestExecutable;
    this.#executableIdentity = executableIdentity;
    this.#socketIdentity = socketIdentity;
  }

  #assertRuntimeIdentity(): void {
    assertExecutableIdentity(this.#executableIdentity, this.#digestExecutable);
    assertSocketIdentity(this.#socketIdentity);
  }

  async #invokeDockerCommand(
    args: readonly string[],
    maximumOutput: number,
    timeoutMs: number,
  ): Promise<DockerCommandResult> {
    if (
      !Number.isSafeInteger(maximumOutput) ||
      maximumOutput < 1 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      throw new TypeError("Docker command bounds must be positive safe integers");
    }
    this.#assertRuntimeIdentity();
    const result = await this.#invoke(
      this.#configuration.executable,
      ["--host", this.#configuration.host, ...args],
      maximumOutput,
      timeoutMs,
    );
    assertDockerCommandResultShape(result, maximumOutput);
    return result;
  }

  async #command(
    args: readonly string[],
    maximumOutput: number,
    timeoutMs: number,
  ): Promise<DockerCommandResult> {
    const result = await this.#invokeDockerCommand(args, maximumOutput, timeoutMs);
    if (
      result.timedOut ||
      result.exitCode !== 0 ||
      result.signal !== null ||
      result.stdoutObservedBytes > maximumOutput ||
      result.stderrObservedBytes > maximumOutput
    ) {
      throw new Error(`Docker command failed closed: ${args[0] ?? "unknown"}`);
    }
    return result;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    const result = await this.#command(
      ["image", "inspect", image.reference],
      MAX_DOCKER_CONTROL_OUTPUT,
      10_000,
    );
    const values = array(
      parseJson(result.stdout, "Docker image inspection"),
      "Docker image inspection",
    );
    if (values.length !== 1) throw new Error("Docker image inspection must return one image");
    const inspected = object(values[0], "Docker image inspection entry");
    const repoDigests = array(inspected.RepoDigests, "RepoDigests");
    const canonicalReference = canonicalRepositoryDigest(image.reference);
    if (
      inspected.Id !== image.imageId ||
      (!repoDigests.includes(image.reference) && !repoDigests.includes(canonicalReference))
    ) {
      throw new Error("Docker image ID or repository digest does not match the pin");
    }
  }

  public async findByLabels(
    labels: Readonly<Record<string, string>>,
  ): Promise<OciContainerInspection | null> {
    const args = ["ps", "-a", "--no-trunc"];
    for (const [name, value] of Object.entries(labels).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      args.push("--filter", `label=${name}=${value}`);
    }
    args.push("--format", "{{.ID}}");
    const result = await this.#command(args, MAX_DOCKER_CONTROL_OUTPUT, 10_000);
    const ids = result.stdout
      .toString("utf8")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (ids.length === 0) return null;
    if (ids.length !== 1 || !CONTAINER_ID.test(ids[0] as string)) {
      throw new Error("Docker label reconciliation is ambiguous");
    }
    return await this.inspect(ids[0] as string);
  }

  public async create(intent: OciRunIntentV1): Promise<string> {
    await this.verifyImage(intent.image);
    const result = await this.#command(
      buildDockerCreateArguments(intent),
      MAX_DOCKER_CONTROL_OUTPUT,
      30_000,
    );
    const id = result.stdout.toString("utf8").trim();
    if (!CONTAINER_ID.test(id)) throw new Error("Docker create returned an invalid container ID");
    try {
      const inspection = await this.inspect(id);
      if (inspection === null) throw new Error("Docker create returned a missing container");
      assertInspectionMatches(inspection, intent);
    } catch (attestationError) {
      try {
        await this.remove(id);
      } catch (cleanupError) {
        throw new AggregateError(
          [attestationError, cleanupError],
          "Docker create attestation failed and exact pre-start cleanup also failed",
          { cause: cleanupError },
        );
      }
      throw new Error("Docker create attestation failed; exact pre-start container was removed", {
        cause: attestationError,
      });
    }
    return id;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    const result = await this.#invokeDockerCommand(
      ["container", "inspect", "--format", INSPECT_FORMAT, containerId],
      MAX_DOCKER_CONTROL_OUTPUT,
      10_000,
    );
    if (
      result.timedOut ||
      result.signal !== null ||
      result.stdoutObservedBytes > MAX_DOCKER_CONTROL_OUTPUT ||
      result.stderrObservedBytes > MAX_DOCKER_CONTROL_OUTPUT ||
      result.stdoutObservedBytes !== result.stdout.byteLength ||
      result.stderrObservedBytes !== result.stderr.byteLength
    ) {
      throw new Error("Docker inspect failed closed");
    }
    if (result.exitCode !== 0) {
      const exactMissingDiagnostic = Buffer.from(
        `Error response from daemon: No such container: ${containerId}\n`,
        "utf8",
      );
      if (
        result.exitCode === 1 &&
        result.stdout.equals(Buffer.from("\n", "utf8")) &&
        result.stderr.equals(exactMissingDiagnostic)
      ) {
        return null;
      }
      throw new Error("Docker inspect failed closed");
    }
    if (result.stderr.byteLength !== 0) throw new Error("Docker inspect failed closed");
    const inspection = parseDockerInspectionValue(
      [parseJson(result.stdout, "Docker container inspection")],
      true,
    );
    if (inspection.containerId !== containerId) {
      throw new Error("Docker inspect returned a different container than requested");
    }
    return inspection;
  }

  public async start(containerId: string): Promise<void> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    await this.#command(["start", containerId], MAX_DOCKER_CONTROL_OUTPUT, 30_000);
  }

  public async logs(containerId: string, maximumBytesPerStream: number): Promise<OciLogCapture> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    const result = await this.#invokeDockerCommand(
      ["logs", containerId],
      maximumBytesPerStream,
      30_000,
    );
    const boundedOverflow =
      result.stdoutObservedBytes > maximumBytesPerStream ||
      result.stderrObservedBytes > maximumBytesPerStream;
    if (
      result.timedOut ||
      (!boundedOverflow && (result.exitCode !== 0 || result.signal !== null)) ||
      (boundedOverflow &&
        !(
          (result.exitCode === null && result.signal === "SIGKILL") ||
          (result.exitCode === 0 && result.signal === null)
        ))
    ) {
      throw new Error("Docker logs failed closed");
    }
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      stdoutObservedBytes: result.stdoutObservedBytes,
      stderrObservedBytes: result.stderrObservedBytes,
    };
  }

  public async stop(containerId: string, graceMs: number): Promise<void> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    if (!Number.isSafeInteger(graceMs) || graceMs < 1) {
      throw new TypeError("graceMs must be a positive safe integer");
    }
    await this.#command(
      ["stop", "--time", String(Math.ceil(graceMs / 1_000)), containerId],
      MAX_DOCKER_CONTROL_OUTPUT,
      graceMs + 10_000,
    );
  }

  public async kill(containerId: string): Promise<void> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    await this.#command(
      ["kill", "--signal", "KILL", containerId],
      MAX_DOCKER_CONTROL_OUTPUT,
      10_000,
    );
  }

  public async remove(containerId: string): Promise<void> {
    if (!CONTAINER_ID.test(containerId)) throw new TypeError("containerId is invalid");
    await this.#command(["rm", containerId], MAX_DOCKER_CONTROL_OUTPUT, 30_000);
  }
}

export function assertOciInspectionMatchesIntent(
  inspection: OciContainerInspection,
  intent: OciRunIntentV1,
): void {
  assertInspectionMatches(inspection, parseOciRunIntent(intent));
}
