import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative, sep } from "node:path";

import {
  AttemptIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  StableKeySchema,
  type AttemptId,
  type Sha256Digest,
} from "@app-factory/contracts";
import { z } from "zod";

const UdidSchema = z
  .string()
  .regex(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
const RuntimeIdSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9]+(?:-[0-9]+)*$/);
const SchemeSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[\0\r\n]/.test(value));
const TestIdentifierSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){0,2}$/);
const MAX_ONLY_TESTING_IDENTIFIERS = 500;
const CLEANUP_TIMEOUT_MS = 15_000;

export class SimulatorRunnerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SimulatorRunnerError";
  }
}

export type SimulatorDeviceV1 = Readonly<{
  schemaVersion: 1;
  runtimeId: string;
  udid: string;
  name: string;
  state: "Booted" | "Shutdown" | "Creating" | "Booting" | "Shutting Down" | "unknown";
  available: boolean;
}>;

export type SimulatorInventoryV1 = Readonly<{
  schemaVersion: 1;
  devices: readonly SimulatorDeviceV1[];
  inventoryDigest: Sha256Digest;
}>;

export type SimulatorCommandV1 = Readonly<{
  executable: string;
  arguments: readonly string[];
}>;

export type SimulatorRunPlanV1 = Readonly<{
  schemaVersion: 1;
  attemptId: AttemptId;
  candidateCommit: string;
  checkoutRoot: string;
  containerKind: "project" | "workspace";
  containerPath: string;
  scheme: string;
  testPlan: string | null;
  onlyTesting: readonly string[];
  simulator: SimulatorDeviceV1;
  simulatorLeaseKey: string;
  derivedDataLeaseKey: string;
  runtimeRoot: string;
  derivedDataPath: string;
  resultBundlePath: string;
  visible: boolean;
  commands: Readonly<{
    boot: SimulatorCommandV1 | null;
    bootStatus: SimulatorCommandV1;
    show: SimulatorCommandV1 | null;
    test: SimulatorCommandV1;
    shutdownIfOwned: SimulatorCommandV1 | null;
  }>;
  planDigest: Sha256Digest;
}>;

export type PlanSimulatorRunInput = Readonly<{
  schemaVersion: 1;
  attemptId: unknown;
  candidateCommit: unknown;
  inventory: SimulatorInventoryV1;
  simulatorUdid: unknown;
  runtimeId: unknown;
  checkoutRoot: string;
  runtimeRoot: string;
  container: Readonly<{ kind: "project" | "workspace"; path: string }>;
  scheme: unknown;
  testPlan?: string;
  onlyTesting?: readonly unknown[];
  visible: boolean;
}>;

export type SimulatorCommandResult = Readonly<{
  exitCode: number;
  stdoutDigest: Sha256Digest;
  stderrDigest: Sha256Digest;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  startedAt: string;
  finishedAt: string;
}>;

export type SimulatorCommandPort = Readonly<{
  run(command: SimulatorCommandV1, signal: AbortSignal): Promise<SimulatorCommandResult>;
}>;

export type SimulatorWorkspaceAttestationV1 = Readonly<{
  schemaVersion: 1;
  checkoutRoot: string;
  containerPath: string;
  runtimeRoot: string;
  derivedDataPath: string;
  resultBundlePath: string;
  candidateCommit: string;
  clean: true;
  attestationDigest: Sha256Digest;
}>;

export type SimulatorWorkspacePort = Readonly<{
  attest(
    request: Readonly<{
      checkoutRoot: string;
      containerKind: "project" | "workspace";
      containerPath: string;
      runtimeRoot: string;
      derivedDataPath: string;
      resultBundlePath: string;
      candidateCommit: string;
    }>,
    signal: AbortSignal,
  ): Promise<SimulatorWorkspaceAttestationV1>;
}>;

export type SimulatorRunResultV1 = Readonly<{
  schemaVersion: 1;
  planDigest: Sha256Digest;
  candidateCommit: string;
  passed: boolean;
  blocked: boolean;
  bootOwned: boolean;
  commands: readonly Readonly<{
    phase: "boot" | "boot-status" | "show" | "test" | "shutdown";
    result: SimulatorCommandResult;
  }>[];
  workspaceAttestations: readonly Readonly<{
    phase: "before-run" | "before-test" | "after-test";
    attestationDigest: Sha256Digest;
  }>[];
  resultBundlePath: string;
}>;

function canonical(value: unknown): string {
  const normalizeValue = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalizeValue);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalizeValue(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalizeValue(value));
}

function digest(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`,
  );
}

function absolute(value: string, label: string): string {
  if (!isAbsolute(value) || value.includes("\0") || value.includes("\r") || value.includes("\n")) {
    throw new SimulatorRunnerError(`${label} must be a safe absolute path`);
  }
  const normalized = normalize(value);
  if (normalized === "/") throw new SimulatorRunnerError(`${label} must not be filesystem root`);
  return normalized;
}

function inside(root: string, path: string, label: string): string {
  const child = relative(root, path);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new SimulatorRunnerError(`${label} escapes its owned root`);
  }
  return path;
}

async function assertExistingPathComponentsAreNotSymlinks(
  root: string,
  path: string,
): Promise<void> {
  const components = relative(root, path)
    .split(sep)
    .filter((component) => component.length > 0);
  let current = root;
  for (const component of components) {
    current = join(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new SimulatorRunnerError("simulator runtime path must not traverse symlinks");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function parseState(value: unknown): SimulatorDeviceV1["state"] {
  return value === "Booted" ||
    value === "Shutdown" ||
    value === "Creating" ||
    value === "Booting" ||
    value === "Shutting Down"
    ? value
    : "unknown";
}

export function parseSimulatorInventory(value: unknown): SimulatorInventoryV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SimulatorRunnerError("simctl inventory must be an object");
  }
  const rawDevices = (value as Readonly<Record<string, unknown>>).devices;
  if (rawDevices === null || typeof rawDevices !== "object" || Array.isArray(rawDevices)) {
    throw new SimulatorRunnerError("simctl inventory is missing devices");
  }
  const devices: SimulatorDeviceV1[] = [];
  const entries = Object.entries(rawDevices as Readonly<Record<string, unknown>>);
  if (entries.length > 100) throw new SimulatorRunnerError("simctl runtime inventory is too large");
  for (const [runtimeValue, values] of entries) {
    const runtimeId = RuntimeIdSchema.safeParse(runtimeValue);
    if (!runtimeId.success || !Array.isArray(values)) continue;
    if (values.length > 2_000)
      throw new SimulatorRunnerError("simctl device inventory is too large");
    for (const value of values) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Readonly<Record<string, unknown>>;
      const udid = UdidSchema.safeParse(record.udid);
      if (!udid.success || typeof record.name !== "string" || record.name.length > 200) continue;
      devices.push({
        schemaVersion: 1,
        runtimeId: runtimeId.data,
        udid: udid.data,
        name: record.name,
        state: parseState(record.state),
        available: record.isAvailable === true,
      });
    }
  }
  devices.sort(
    (left, right) =>
      left.runtimeId.localeCompare(right.runtimeId) || left.udid.localeCompare(right.udid),
  );
  if (new Set(devices.map((device) => device.udid)).size !== devices.length) {
    throw new SimulatorRunnerError("simctl inventory contains a duplicate UDID");
  }
  const envelope = { schemaVersion: 1 as const, devices };
  return { ...envelope, inventoryDigest: digest(envelope) };
}

function safePathFragment(value: string): string {
  return value.toLowerCase().replaceAll("-", "");
}

export function planSimulatorRun(input: PlanSimulatorRunInput): SimulatorRunPlanV1 {
  if (input.schemaVersion !== 1)
    throw new SimulatorRunnerError("unsupported simulator plan version");
  if (input.container.kind !== "project" && input.container.kind !== "workspace") {
    throw new SimulatorRunnerError("container kind must be project or workspace");
  }
  if (typeof input.visible !== "boolean") {
    throw new SimulatorRunnerError("visible must be a boolean");
  }
  const attemptId = AttemptIdSchema.parse(input.attemptId);
  const candidateCommit = GitObjectIdSchema.parse(input.candidateCommit);
  const udid = UdidSchema.parse(input.simulatorUdid);
  const runtimeId = RuntimeIdSchema.parse(input.runtimeId);
  const simulator = input.inventory.devices.find(
    (item) => item.udid === udid && item.runtimeId === runtimeId,
  );
  if (simulator === undefined || !simulator.available) {
    throw new SimulatorRunnerError("the exact requested simulator is unavailable");
  }
  if (simulator.state !== "Booted" && simulator.state !== "Shutdown") {
    throw new SimulatorRunnerError(
      `the requested simulator is in transitional state ${simulator.state}`,
    );
  }
  const checkoutRoot = absolute(input.checkoutRoot, "checkoutRoot");
  const runtimeRoot = absolute(input.runtimeRoot, "runtimeRoot");
  const containerPath = inside(
    checkoutRoot,
    absolute(input.container.path, "container path"),
    "container path",
  );
  const expectedSuffix = input.container.kind === "project" ? ".xcodeproj" : ".xcworkspace";
  if (!basename(containerPath).endsWith(expectedSuffix)) {
    throw new SimulatorRunnerError(`container path must end in ${expectedSuffix}`);
  }
  const scheme = SchemeSchema.parse(input.scheme);
  const testPlan = input.testPlan === undefined ? null : StableKeySchema.parse(input.testPlan);
  if ((input.onlyTesting?.length ?? 0) > MAX_ONLY_TESTING_IDENTIFIERS) {
    throw new SimulatorRunnerError("onlyTesting contains too many identifiers");
  }
  const onlyTesting = (input.onlyTesting ?? []).map((item) => TestIdentifierSchema.parse(item));
  if (new Set(onlyTesting).size !== onlyTesting.length) {
    throw new SimulatorRunnerError("onlyTesting identifiers must be unique");
  }
  const attemptRoot = join(runtimeRoot, "attempts", safePathFragment(attemptId));
  const derivedDataPath = inside(runtimeRoot, join(attemptRoot, "DerivedData"), "DerivedData path");
  const resultBundlePath = inside(
    runtimeRoot,
    join(attemptRoot, "results", "ui-tests.xcresult"),
    "result bundle path",
  );
  const simctl = (...arguments_: string[]): SimulatorCommandV1 => ({
    executable: "/usr/bin/xcrun",
    arguments: ["simctl", ...arguments_],
  });
  const testArguments = [
    input.container.kind === "project" ? "-project" : "-workspace",
    containerPath,
    "-scheme",
    scheme,
    "-destination",
    `platform=iOS Simulator,id=${udid}`,
    "-derivedDataPath",
    derivedDataPath,
    "-resultBundlePath",
    resultBundlePath,
    ...(testPlan === null ? [] : ["-testPlan", testPlan]),
    ...onlyTesting.flatMap((identifier) => ["-only-testing", identifier]),
    "test",
  ];
  const bootOwned = simulator.state === "Shutdown";
  const core = {
    schemaVersion: 1 as const,
    attemptId,
    candidateCommit,
    checkoutRoot,
    containerKind: input.container.kind,
    containerPath,
    scheme,
    testPlan,
    onlyTesting,
    simulator,
    simulatorLeaseKey: `simulator:${udid}`,
    derivedDataLeaseKey: `derived-data:${attemptId}`,
    runtimeRoot,
    derivedDataPath,
    resultBundlePath,
    visible: input.visible,
    commands: {
      boot: bootOwned ? simctl("boot", udid) : null,
      bootStatus: simctl("bootstatus", udid, "-b"),
      show: input.visible
        ? {
            executable: "/usr/bin/open",
            arguments: ["-a", "Simulator", "--args", "-CurrentDeviceUDID", udid],
          }
        : null,
      test: { executable: "/usr/bin/xcodebuild", arguments: testArguments },
      shutdownIfOwned: bootOwned ? simctl("shutdown", udid) : null,
    },
  };
  return { ...core, planDigest: digest(core) };
}

function commandPassed(result: SimulatorCommandResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.outputLimitExceeded;
}

function validatedPlan(plan: SimulatorRunPlanV1): SimulatorRunPlanV1 {
  let expected: SimulatorRunPlanV1;
  try {
    const inventoryEnvelope = { schemaVersion: 1 as const, devices: [plan.simulator] };
    expected = planSimulatorRun({
      schemaVersion: 1,
      attemptId: plan.attemptId,
      candidateCommit: plan.candidateCommit,
      inventory: { ...inventoryEnvelope, inventoryDigest: digest(inventoryEnvelope) },
      simulatorUdid: plan.simulator.udid,
      runtimeId: plan.simulator.runtimeId,
      checkoutRoot: plan.checkoutRoot,
      runtimeRoot: plan.runtimeRoot,
      container: { kind: plan.containerKind, path: plan.containerPath },
      scheme: plan.scheme,
      ...(plan.testPlan === null ? {} : { testPlan: plan.testPlan }),
      onlyTesting: plan.onlyTesting,
      visible: plan.visible,
    });
  } catch {
    throw new SimulatorRunnerError("simulator run plan is invalid");
  }
  if (canonical(expected) !== canonical(plan)) {
    throw new SimulatorRunnerError("simulator run plan was altered after planning");
  }
  return expected;
}

export function createSimulatorWorkspaceAttestation(
  value: Readonly<{
    checkoutRoot: string;
    containerPath: string;
    runtimeRoot: string;
    derivedDataPath: string;
    resultBundlePath: string;
    candidateCommit: string;
    clean: true;
  }>,
): SimulatorWorkspaceAttestationV1 {
  const core = {
    schemaVersion: 1 as const,
    checkoutRoot: absolute(value.checkoutRoot, "attested checkoutRoot"),
    containerPath: absolute(value.containerPath, "attested containerPath"),
    runtimeRoot: absolute(value.runtimeRoot, "attested runtimeRoot"),
    derivedDataPath: absolute(value.derivedDataPath, "attested derivedDataPath"),
    resultBundlePath: absolute(value.resultBundlePath, "attested resultBundlePath"),
    candidateCommit: GitObjectIdSchema.parse(value.candidateCommit),
    clean: value.clean,
  };
  if (core.clean !== true) throw new SimulatorRunnerError("simulator checkout must be clean");
  inside(core.checkoutRoot, core.containerPath, "attested containerPath");
  inside(core.runtimeRoot, core.derivedDataPath, "attested derivedDataPath");
  inside(core.runtimeRoot, core.resultBundlePath, "attested resultBundlePath");
  return { ...core, attestationDigest: digest(core) };
}

function validateWorkspaceAttestation(
  value: SimulatorWorkspaceAttestationV1,
  plan: SimulatorRunPlanV1,
): SimulatorWorkspaceAttestationV1 {
  const expected = createSimulatorWorkspaceAttestation({
    checkoutRoot: plan.checkoutRoot,
    containerPath: plan.containerPath,
    runtimeRoot: plan.runtimeRoot,
    derivedDataPath: plan.derivedDataPath,
    resultBundlePath: plan.resultBundlePath,
    candidateCommit: plan.candidateCommit,
    clean: true,
  });
  if (canonical(value) !== canonical(expected)) {
    throw new SimulatorRunnerError("workspace attestation does not match the planned candidate");
  }
  return expected;
}

function gitOutput(arguments_: readonly string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      "/usr/bin/git",
      arguments_,
      {
        encoding: "utf8",
        env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
        maxBuffer: 64 * 1024,
        timeout: 5_000,
        killSignal: "SIGKILL",
        signal,
      },
      (error, stdout) => {
        if (error !== null) {
          rejectPromise(new SimulatorRunnerError("simulator checkout could not be attested"));
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}

export function createGitSimulatorWorkspacePort(): SimulatorWorkspacePort {
  return {
    attest: async (request, signal) => {
      if (signal.aborted) throw new SimulatorRunnerError("workspace attestation was cancelled");
      const checkoutRoot = absolute(request.checkoutRoot, "checkoutRoot");
      const containerPath = inside(
        checkoutRoot,
        absolute(request.containerPath, "containerPath"),
        "containerPath",
      );
      const [checkoutRealPath, containerRealPath, containerStat] = await Promise.all([
        realpath(checkoutRoot),
        realpath(containerPath),
        lstat(containerPath),
      ]).catch(() => {
        throw new SimulatorRunnerError("simulator checkout paths could not be attested");
      });
      if (
        checkoutRealPath !== checkoutRoot ||
        containerRealPath !== containerPath ||
        containerStat.isSymbolicLink() ||
        (!containerStat.isDirectory() && !containerStat.isFile())
      ) {
        throw new SimulatorRunnerError("simulator checkout paths must not traverse symlinks");
      }
      const runtimeRoot = absolute(request.runtimeRoot, "runtimeRoot");
      const runtimeStat = await lstat(runtimeRoot).catch(() => {
        throw new SimulatorRunnerError("simulator runtime root could not be attested");
      });
      const runtimeRealPath = await realpath(runtimeRoot).catch(() => {
        throw new SimulatorRunnerError("simulator runtime root could not be attested");
      });
      const currentUserId = typeof process.getuid === "function" ? process.getuid() : null;
      if (
        runtimeRealPath !== runtimeRoot ||
        runtimeStat.isSymbolicLink() ||
        !runtimeStat.isDirectory() ||
        (currentUserId !== null && runtimeStat.uid !== currentUserId) ||
        (runtimeStat.mode & 0o077) !== 0
      ) {
        throw new SimulatorRunnerError("simulator runtime root must be a private owned directory");
      }
      const derivedDataPath = inside(
        runtimeRoot,
        absolute(request.derivedDataPath, "derivedDataPath"),
        "derivedDataPath",
      );
      const resultBundlePath = inside(
        runtimeRoot,
        absolute(request.resultBundlePath, "resultBundlePath"),
        "resultBundlePath",
      );
      await Promise.all([
        assertExistingPathComponentsAreNotSymlinks(runtimeRoot, derivedDataPath),
        assertExistingPathComponentsAreNotSymlinks(runtimeRoot, resultBundlePath),
      ]);
      const expectedSuffix = request.containerKind === "project" ? ".xcodeproj" : ".xcworkspace";
      if (!basename(containerPath).endsWith(expectedSuffix)) {
        throw new SimulatorRunnerError("simulator container kind does not match its path");
      }
      const [repositoryRoot, observedCommit, status] = await Promise.all([
        gitOutput(["-C", checkoutRoot, "rev-parse", "--show-toplevel"], signal),
        gitOutput(["-C", checkoutRoot, "rev-parse", "--verify", "HEAD^{commit}"], signal),
        gitOutput(
          ["-C", checkoutRoot, "status", "--porcelain=v1", "--untracked-files=all"],
          signal,
        ),
      ]);
      if (normalize(repositoryRoot.trim()) !== checkoutRoot) {
        throw new SimulatorRunnerError("checkoutRoot must be the Git worktree root");
      }
      const candidateCommit = GitObjectIdSchema.parse(request.candidateCommit);
      if (observedCommit.trim() !== candidateCommit) {
        throw new SimulatorRunnerError("checkout HEAD does not match candidateCommit");
      }
      if (status.length !== 0) {
        throw new SimulatorRunnerError("simulator checkout must be clean");
      }
      return createSimulatorWorkspaceAttestation({
        checkoutRoot,
        containerPath,
        runtimeRoot,
        derivedDataPath,
        resultBundlePath,
        candidateCommit,
        clean: true,
      });
    },
  };
}

export async function executeSimulatorRun(
  planValue: SimulatorRunPlanV1,
  commandPort: SimulatorCommandPort,
  workspacePort: SimulatorWorkspacePort,
  signal: AbortSignal,
  assertActive: () => Promise<void>,
): Promise<SimulatorRunResultV1> {
  const plan = validatedPlan(planValue);
  const results: Array<{
    phase: "boot" | "boot-status" | "show" | "test" | "shutdown";
    result: SimulatorCommandResult;
  }> = [];
  const workspaceAttestations: Array<{
    phase: "before-run" | "before-test" | "after-test";
    attestationDigest: Sha256Digest;
  }> = [];
  let passed = false;
  let blocked = false;
  let bootAttempted = false;
  const run = async (
    phase: "boot" | "boot-status" | "show" | "test" | "shutdown",
    command: SimulatorCommandV1,
  ): Promise<boolean> => {
    if (signal.aborted) throw new SimulatorRunnerError("simulator run was cancelled");
    await assertActive();
    const result = await commandPort.run(command, signal);
    await assertActive();
    results.push({ phase, result });
    return commandPassed(result);
  };

  const attest = async (phase: "before-run" | "before-test" | "after-test"): Promise<void> => {
    if (signal.aborted) throw new SimulatorRunnerError("simulator run was cancelled");
    await assertActive();
    const attestation = validateWorkspaceAttestation(
      await workspacePort.attest(
        {
          checkoutRoot: plan.checkoutRoot,
          containerKind: plan.containerKind,
          containerPath: plan.containerPath,
          runtimeRoot: plan.runtimeRoot,
          derivedDataPath: plan.derivedDataPath,
          resultBundlePath: plan.resultBundlePath,
          candidateCommit: plan.candidateCommit,
        },
        signal,
      ),
      plan,
    );
    await assertActive();
    workspaceAttestations.push({ phase, attestationDigest: attestation.attestationDigest });
  };

  try {
    await attest("before-run");
    if (plan.commands.boot !== null) {
      bootAttempted = true;
    }
    if (plan.commands.boot !== null && !(await run("boot", plan.commands.boot))) {
      blocked = true;
    } else if (!(await run("boot-status", plan.commands.bootStatus))) {
      blocked = true;
    } else if (plan.commands.show !== null && !(await run("show", plan.commands.show))) {
      blocked = true;
    } else {
      await attest("before-test");
      passed = await run("test", plan.commands.test);
      await attest("after-test");
    }
  } finally {
    if (plan.commands.shutdownIfOwned !== null && bootAttempted) {
      const cleanupController = new AbortController();
      let cleanupTimer: NodeJS.Timeout | undefined;
      const cleanupTimeout = new Promise<never>((_resolve, reject) => {
        cleanupTimer = setTimeout(() => {
          cleanupController.abort();
          reject(new SimulatorRunnerError("owned simulator cleanup timed out"));
        }, CLEANUP_TIMEOUT_MS);
      });
      try {
        await assertActive();
        const cleanupResult = await Promise.race([
          commandPort.run(plan.commands.shutdownIfOwned, cleanupController.signal),
          cleanupTimeout,
        ]);
        await assertActive();
        results.push({ phase: "shutdown", result: cleanupResult });
        if (!commandPassed(cleanupResult)) {
          blocked = true;
          passed = false;
        }
      } catch {
        blocked = true;
        passed = false;
      } finally {
        if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
      }
    }
  }
  return {
    schemaVersion: 1,
    planDigest: plan.planDigest,
    candidateCommit: plan.candidateCommit,
    passed,
    blocked,
    bootOwned: bootAttempted,
    commands: results,
    workspaceAttestations,
    resultBundlePath: plan.resultBundlePath,
  };
}

export const WorkflowObservationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  workflowId: StableKeySchema,
  stepId: StableKeySchema,
  candidateCommit: GitObjectIdSchema,
  simulatorUdid: UdidSchema,
  observedAt: IsoInstantSchema,
  screenshotDigest: Sha256DigestSchema,
  comment: z.string().min(1).max(4_000),
});
export type WorkflowObservationV1 = z.infer<typeof WorkflowObservationV1Schema>;

export function recordWorkflowObservation(value: unknown): WorkflowObservationV1 {
  return WorkflowObservationV1Schema.parse(value);
}
