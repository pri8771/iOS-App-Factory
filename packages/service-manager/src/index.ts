import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { basename, isAbsolute, join, normalize } from "node:path";

import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

export const FACTORY_DAEMON_LAUNCH_AGENT_LABEL = "com.priyanshchordia.app-factory.daemon" as const;
const MAX_EXISTING_PLIST_BYTES = 128 * 1024;
const trustedProgramAttestations = new WeakSet<object>();

export class ServiceManagerContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ServiceManagerContractError";
  }
}

export type LaunchAgentConfigurationV1 = Readonly<{
  schemaVersion: 1;
  userId: number;
  launchAgentsDirectory: string;
  nodeExecutable: string;
  daemonEntrypoint: string;
  runtimeDirectory: string;
  authorizationFile: string;
  logDirectory: string;
  daemonVersion: string;
  pollIntervalMs?: number;
}>;

export type LaunchctlInvocation = Readonly<{
  executable: "/bin/launchctl";
  arguments: readonly string[];
}>;

export type LaunchAgentPlanV1 = Readonly<{
  schemaVersion: 1;
  label: typeof FACTORY_DAEMON_LAUNCH_AGENT_LABEL;
  userId: number;
  nodeExecutable: string;
  daemonEntrypoint: string;
  plistPath: string;
  plistBytes: Uint8Array;
  plistDigest: Sha256Digest;
  plistMode: 0o600;
  privateDirectories: readonly string[];
  domainTarget: string;
  serviceTarget: string;
  inspect: LaunchctlInvocation;
  activate: readonly LaunchctlInvocation[];
  deactivate: LaunchctlInvocation;
}>;

export type LaunchAgentReceiptV1 = Readonly<{
  schemaVersion: 1;
  label: typeof FACTORY_DAEMON_LAUNCH_AGENT_LABEL;
  plistPath: string;
  installedDigest: Sha256Digest;
}>;

export type ExistingLaunchAgentFile =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "symlink" }>
  | Readonly<{ kind: "other" }>
  | Readonly<{ kind: "regular"; bytes: Uint8Array; mode: number; userId: number }>;

export type LaunchctlCommandResult = Readonly<{
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
  timedOut: boolean;
  outputLimitExceeded: boolean;
}>;

export type LaunchctlCommandPort = Readonly<{
  run(invocation: LaunchctlInvocation, signal: AbortSignal): Promise<LaunchctlCommandResult>;
}>;

export type LaunchAgentRuntimeStatusV1 = Readonly<{
  schemaVersion: 1;
  status: "loaded" | "not-loaded" | "unknown";
  serviceTarget: string;
  observationDigest: Sha256Digest;
}>;

export type LaunchAgentInstallDecisionV1 = Readonly<{
  schemaVersion: 1;
  operation: "create" | "noop" | "blocked-foreign";
  planDigest: Sha256Digest;
  expectedExistingDigest: Sha256Digest | null;
  reason: string;
}>;

export type LaunchAgentProgramAttestationV1 = Readonly<{
  schemaVersion: 1;
  userId: number;
  nodeExecutable: string;
  nodeExecutableDigest: Sha256Digest;
  daemonEntrypoint: string;
  daemonEntrypointDigest: Sha256Digest;
  attestationDigest: Sha256Digest;
}>;

function fail(message: string): never {
  throw new ServiceManagerContractError(message);
}

function absolute(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    !isAbsolute(value)
  ) {
    fail(`${label} must be a safe absolute path`);
  }
  const normalized = normalize(value);
  if (normalized === "/") fail(`${label} must not be the filesystem root`);
  return normalized;
}

function positiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${label} must be a positive integer no greater than ${String(maximum)}`);
  }
  return value;
}

function portableVersion(value: string): string {
  if (value.length < 1 || value.length > 100 || !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(value)) {
    fail("daemonVersion must be a portable version identifier");
  }
  return value;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stringNode(value: string, indent: string): string {
  return `${indent}<string>${xml(value)}</string>`;
}

function digest(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`,
  );
}

function launchctl(...arguments_: string[]): LaunchctlInvocation {
  return { executable: "/bin/launchctl", arguments: arguments_ };
}

export function parseLaunchAgentConfiguration(value: unknown): LaunchAgentConfigurationV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("LaunchAgent configuration must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const required = [
    "schemaVersion",
    "userId",
    "launchAgentsDirectory",
    "nodeExecutable",
    "daemonEntrypoint",
    "runtimeDirectory",
    "authorizationFile",
    "logDirectory",
    "daemonVersion",
  ];
  const allowed = new Set([...required, "pollIntervalMs"]);
  const keys = Object.keys(record);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
    fail("LaunchAgent configuration contains unexpected or missing fields");
  }
  if (record.schemaVersion !== 1) fail("Unsupported LaunchAgent configuration version");
  const stringValue = (key: string): string => {
    const item = record[key];
    if (typeof item !== "string") fail(`${key} must be a string`);
    return item;
  };
  const numberValue = (key: string): number => {
    const item = record[key];
    if (typeof item !== "number") fail(`${key} must be a number`);
    return item;
  };
  const pollIntervalMs =
    record.pollIntervalMs === undefined
      ? undefined
      : positiveInteger(numberValue("pollIntervalMs"), "pollIntervalMs", 60_000);
  return {
    schemaVersion: 1,
    userId: positiveInteger(numberValue("userId"), "userId", 2_147_483_647),
    launchAgentsDirectory: stringValue("launchAgentsDirectory"),
    nodeExecutable: stringValue("nodeExecutable"),
    daemonEntrypoint: stringValue("daemonEntrypoint"),
    runtimeDirectory: stringValue("runtimeDirectory"),
    authorizationFile: stringValue("authorizationFile"),
    logDirectory: stringValue("logDirectory"),
    daemonVersion: stringValue("daemonVersion"),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
  };
}

export function buildLaunchAgentPlan(configurationValue: unknown): LaunchAgentPlanV1 {
  const configuration = parseLaunchAgentConfiguration(configurationValue);
  const userId = positiveInteger(configuration.userId, "userId", 2_147_483_647);
  const currentUserId = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUserId !== null && userId !== currentUserId) {
    fail("userId must match the current process user");
  }
  const launchAgentsDirectory = absolute(
    configuration.launchAgentsDirectory,
    "launchAgentsDirectory",
  );
  if (basename(launchAgentsDirectory) !== "LaunchAgents") {
    fail("launchAgentsDirectory must end in LaunchAgents");
  }
  const nodeExecutable = absolute(configuration.nodeExecutable, "nodeExecutable");
  const daemonEntrypoint = absolute(configuration.daemonEntrypoint, "daemonEntrypoint");
  const runtimeDirectory = absolute(configuration.runtimeDirectory, "runtimeDirectory");
  const authorizationFile = absolute(configuration.authorizationFile, "authorizationFile");
  const logDirectory = absolute(configuration.logDirectory, "logDirectory");
  const version = portableVersion(configuration.daemonVersion);
  const pollIntervalMs = positiveInteger(
    configuration.pollIntervalMs ?? 100,
    "pollIntervalMs",
    60_000,
  );

  const label = FACTORY_DAEMON_LAUNCH_AGENT_LABEL;
  const plistPath = join(launchAgentsDirectory, `${label}.plist`);
  const environment = [
    ["APP_FACTORY_AUTH_FILE", authorizationFile],
    ["APP_FACTORY_DAEMON_VERSION", version],
    ["APP_FACTORY_POLL_INTERVAL_MS", String(pollIntervalMs)],
    ["APP_FACTORY_RUNTIME_DIR", runtimeDirectory],
  ] as const;
  const environmentXml = environment
    .map(([key, value]) => `      <key>${key}</key>\n${stringNode(value, "      ")}`)
    .join("\n");
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
${stringNode(label, "    ")}
    <key>ProgramArguments</key>
    <array>
${stringNode(nodeExecutable, "      ")}
${stringNode(daemonEntrypoint, "      ")}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${environmentXml}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ExitTimeOut</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
${stringNode(join(logDirectory, "daemon.stdout.log"), "    ")}
    <key>StandardErrorPath</key>
${stringNode(join(logDirectory, "daemon.stderr.log"), "    ")}
  </dict>
</plist>
`;
  const plistBytes = Uint8Array.from(Buffer.from(source, "utf8"));
  const domainTarget = `gui/${String(userId)}`;
  const serviceTarget = `${domainTarget}/${label}`;
  return {
    schemaVersion: 1,
    label,
    userId,
    nodeExecutable,
    daemonEntrypoint,
    plistPath,
    plistBytes,
    plistDigest: digest(plistBytes),
    plistMode: 0o600,
    privateDirectories: [runtimeDirectory, logDirectory],
    domainTarget,
    serviceTarget,
    inspect: launchctl("print", serviceTarget),
    activate: [
      launchctl("bootstrap", domainTarget, plistPath),
      launchctl("kickstart", "-k", serviceTarget),
    ],
    deactivate: launchctl("bootout", domainTarget, plistPath),
  };
}

export function createLaunchAgentReceipt(plan: LaunchAgentPlanV1): LaunchAgentReceiptV1 {
  return {
    schemaVersion: 1,
    label: plan.label,
    plistPath: plan.plistPath,
    installedDigest: plan.plistDigest,
  };
}

export function decideLaunchAgentInstallation(
  plan: LaunchAgentPlanV1,
  existing: ExistingLaunchAgentFile,
  _receipt: LaunchAgentReceiptV1 | null,
  programAttestation: LaunchAgentProgramAttestationV1,
): LaunchAgentInstallDecisionV1 {
  if (
    !trustedProgramAttestations.has(programAttestation) ||
    programAttestation.userId !== plan.userId ||
    programAttestation.nodeExecutable !== plan.nodeExecutable ||
    programAttestation.daemonEntrypoint !== plan.daemonEntrypoint
  ) {
    fail("LaunchAgent program files require a trusted in-process attestation");
  }
  if (existing.kind === "absent") {
    return {
      schemaVersion: 1,
      operation: "create",
      planDigest: plan.plistDigest,
      expectedExistingDigest: null,
      reason: "No LaunchAgent exists at the planned path.",
    };
  }
  if (existing.kind !== "regular") {
    return {
      schemaVersion: 1,
      operation: "blocked-foreign",
      planDigest: plan.plistDigest,
      expectedExistingDigest: null,
      reason: "The planned path is occupied by a symlink or non-regular file.",
    };
  }
  if (existing.bytes.byteLength > MAX_EXISTING_PLIST_BYTES) {
    return {
      schemaVersion: 1,
      operation: "blocked-foreign",
      planDigest: plan.plistDigest,
      expectedExistingDigest: null,
      reason: "The existing LaunchAgent exceeds the inspection limit.",
    };
  }
  if (existing.userId !== plan.userId || (existing.mode & 0o077) !== 0) {
    return {
      schemaVersion: 1,
      operation: "blocked-foreign",
      planDigest: plan.plistDigest,
      expectedExistingDigest: null,
      reason: "The existing LaunchAgent has unsafe ownership or permissions.",
    };
  }
  const existingDigest = digest(existing.bytes);
  if (existingDigest === plan.plistDigest) {
    return {
      schemaVersion: 1,
      operation: "noop",
      planDigest: plan.plistDigest,
      expectedExistingDigest: existingDigest,
      reason: "The installed LaunchAgent already matches the plan exactly.",
    };
  }
  return {
    schemaVersion: 1,
    operation: "blocked-foreign",
    planDigest: plan.plistDigest,
    expectedExistingDigest: existingDigest,
    reason: "The existing LaunchAgent is not proven by an authenticated installation ledger.",
  };
}

async function attestProgramFile(
  pathValue: string,
  role: "nodeExecutable" | "daemonEntrypoint",
  userId: number,
): Promise<Sha256Digest> {
  const path = absolute(pathValue, role);
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    fail(`${role} cannot be inspected`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${role} must be a regular non-symlink file`);
  if (stat.uid !== 0 && stat.uid !== userId) fail(`${role} has an unexpected owner`);
  if ((stat.mode & 0o022) !== 0) fail(`${role} must not be writable by group or others`);
  if (role === "nodeExecutable" && (stat.mode & 0o111) === 0) {
    fail("nodeExecutable must be executable");
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    fail(`${role} cannot be opened safely`);
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) {
      fail(`${role} changed during attestation`);
    }
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    ) {
      fail(`${role} changed during attestation`);
    }
    return Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`);
  } finally {
    await handle.close();
  }
}

export async function attestLaunchAgentProgramFiles(
  plan: LaunchAgentPlanV1,
): Promise<LaunchAgentProgramAttestationV1> {
  const [nodeExecutableDigest, daemonEntrypointDigest] = await Promise.all([
    attestProgramFile(plan.nodeExecutable, "nodeExecutable", plan.userId),
    attestProgramFile(plan.daemonEntrypoint, "daemonEntrypoint", plan.userId),
  ]);
  const core = {
    schemaVersion: 1 as const,
    userId: plan.userId,
    nodeExecutable: plan.nodeExecutable,
    nodeExecutableDigest,
    daemonEntrypoint: plan.daemonEntrypoint,
    daemonEntrypointDigest,
  };
  const attestation = Object.freeze({
    ...core,
    attestationDigest: digest(Uint8Array.from(Buffer.from(JSON.stringify(core), "utf8"))),
  });
  trustedProgramAttestations.add(attestation);
  return attestation;
}

export async function inspectLaunchAgentFile(pathValue: string): Promise<ExistingLaunchAgentFile> {
  const path = absolute(pathValue, "plistPath");
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
    throw new ServiceManagerContractError("The LaunchAgent path could not be inspected.");
  }
  if (stat.isSymbolicLink()) return { kind: "symlink" };
  if (!stat.isFile()) return { kind: "other" };
  if (stat.size > MAX_EXISTING_PLIST_BYTES) {
    return {
      kind: "regular",
      bytes: new Uint8Array(MAX_EXISTING_PLIST_BYTES + 1),
      mode: stat.mode & 0o777,
      userId: stat.uid,
    };
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new ServiceManagerContractError("The LaunchAgent file cannot be opened safely.");
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) {
      throw new ServiceManagerContractError("The LaunchAgent changed during inspection.");
    }
    const bytes = Buffer.alloc(before.size + 1);
    const result = await handle.read(bytes, 0, bytes.byteLength, 0);
    const after = await handle.stat();
    if (
      result.bytesRead !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    ) {
      throw new ServiceManagerContractError("The LaunchAgent changed during inspection.");
    }
    return {
      kind: "regular",
      bytes: Uint8Array.from(bytes.subarray(0, result.bytesRead)),
      mode: before.mode & 0o777,
      userId: before.uid,
    };
  } finally {
    await handle.close();
  }
}

export function parseLaunchAgentReceipt(value: unknown): LaunchAgentReceiptV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("LaunchAgent receipt must be an object");
  }
  const record = value as Readonly<Record<string, unknown>>;
  const expected = ["schemaVersion", "label", "plistPath", "installedDigest"].sort();
  const keys = Object.keys(record).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("LaunchAgent receipt contains unexpected or missing fields");
  }
  if (record.schemaVersion !== 1 || record.label !== FACTORY_DAEMON_LAUNCH_AGENT_LABEL) {
    fail("LaunchAgent receipt uses an unsupported contract");
  }
  return {
    schemaVersion: 1,
    label: FACTORY_DAEMON_LAUNCH_AGENT_LABEL,
    plistPath: absolute(String(record.plistPath), "receipt plistPath"),
    installedDigest: Sha256DigestSchema.parse(record.installedDigest),
  };
}

export async function queryLaunchAgentStatus(
  plan: LaunchAgentPlanV1,
  commandPort: LaunchctlCommandPort = createLaunchctlCommandPort(),
  signal: AbortSignal = new AbortController().signal,
): Promise<LaunchAgentRuntimeStatusV1> {
  if (signal.aborted) throw new ServiceManagerContractError("LaunchAgent status was cancelled.");
  const result = await commandPort.run(plan.inspect, signal);
  try {
    if (signal.aborted) throw new ServiceManagerContractError("LaunchAgent status was cancelled.");
    const status =
      result.timedOut || result.outputLimitExceeded
        ? "unknown"
        : result.exitCode === 0
          ? "loaded"
          : result.exitCode === 113
            ? "not-loaded"
            : "unknown";
    const hash = createHash("sha256");
    hash.update(String(result.exitCode));
    hash.update(Buffer.from([0]));
    hash.update(result.stdout);
    hash.update(Buffer.from([0]));
    hash.update(result.stderr);
    hash.update(Buffer.from([0]));
    hash.update(String(result.timedOut));
    hash.update(Buffer.from([0]));
    hash.update(String(result.outputLimitExceeded));
    const observationDigest = Sha256DigestSchema.parse(`sha256:${hash.digest("hex")}`);
    return { schemaVersion: 1, status, serviceTarget: plan.serviceTarget, observationDigest };
  } finally {
    result.stdout.fill(0);
    result.stderr.fill(0);
  }
}

export type LaunchctlCommandPortOptions = Readonly<{
  timeoutMs?: number;
  terminateGraceMs?: number;
  spawnProcess?: typeof spawn;
}>;

export function createLaunchctlCommandPort(
  options: LaunchctlCommandPortOptions = {},
): LaunchctlCommandPort {
  const timeoutMs = positiveInteger(options.timeoutMs ?? 5_000, "timeoutMs", 60_000);
  const terminateGraceMs = positiveInteger(
    options.terminateGraceMs ?? 1_000,
    "terminateGraceMs",
    10_000,
  );
  const spawnProcess = options.spawnProcess ?? spawn;
  return {
    run: async (invocation, signal) =>
      await new Promise<LaunchctlCommandResult>((resolvePromise, rejectPromise) => {
        if (signal.aborted) {
          rejectPromise(new ServiceManagerContractError("LaunchAgent status was cancelled."));
          return;
        }
        const child = spawnProcess(invocation.executable, invocation.arguments, {
          env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let outputLimitExceeded = false;
        let timedOut = false;
        let settled = false;
        let stopping = false;
        const maximum = 1024 * 1024;
        let forceTimer: NodeJS.Timeout | undefined;
        let hardStopTimer: NodeJS.Timeout | undefined;
        const eraseChunks = (): void => {
          for (const chunk of stdout) chunk.fill(0);
          for (const chunk of stderr) chunk.fill(0);
          stdout.length = 0;
          stderr.length = 0;
        };
        const consumeChunks = (chunks: Buffer[]): Uint8Array => {
          const output = Buffer.alloc(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
          let offset = 0;
          for (const chunk of chunks) {
            chunk.copy(output, offset);
            offset += chunk.byteLength;
            chunk.fill(0);
          }
          chunks.length = 0;
          return output;
        };
        const cleanup = (): void => {
          clearTimeout(timer);
          if (forceTimer !== undefined) clearTimeout(forceTimer);
          if (hardStopTimer !== undefined) clearTimeout(hardStopTimer);
          signal.removeEventListener("abort", onAbort);
          child.stdout.removeAllListeners("data");
          child.stderr.removeAllListeners("data");
        };
        const finish = (code: number | null): void => {
          if (settled) return;
          settled = true;
          cleanup();
          if (signal.aborted) {
            eraseChunks();
            rejectPromise(new ServiceManagerContractError("LaunchAgent status was cancelled."));
            return;
          }
          resolvePromise({
            exitCode: code ?? 255,
            stdout: consumeChunks(stdout),
            stderr: consumeChunks(stderr),
            timedOut,
            outputLimitExceeded,
          });
        };
        const stop = (): void => {
          if (stopping) return;
          stopping = true;
          try {
            child.kill("SIGTERM");
          } catch {
            // Hard settlement below still bounds the caller.
          }
          forceTimer ??= setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              // Hard settlement below still bounds the caller.
            }
          }, terminateGraceMs);
          hardStopTimer ??= setTimeout(() => finish(255), terminateGraceMs * 2);
        };
        const onAbort = () => stop();
        signal.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => {
          timedOut = true;
          stop();
        }, timeoutMs);
        timer.unref();
        if (signal.aborted) stop();
        const collect = (target: Buffer[], chunk: Buffer, current: number): number => {
          const next = current + chunk.byteLength;
          if (next <= maximum) target.push(Buffer.from(chunk));
          else {
            outputLimitExceeded = true;
            stop();
          }
          chunk.fill(0);
          return next;
        };
        child.stdout.on("data", (chunk: Buffer) => {
          stdoutBytes = collect(stdout, chunk, stdoutBytes);
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderrBytes = collect(stderr, chunk, stderrBytes);
        });
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          eraseChunks();
          rejectPromise(error);
        });
        child.once("close", (code) => {
          finish(code);
        });
      }),
  };
}
