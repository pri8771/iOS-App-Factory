import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { isAbsolute } from "node:path";

import {
  parseSupervisorIdentityV1,
  SUPERVISOR_IDENTITY_SCHEMA_VERSION,
  type SupervisorIdentityV1,
} from "./model.js";
import {
  createSystemPlatformProbe,
  type PlatformProcessProbe,
  type ProcessObservation,
} from "./platform.js";

export type IdentityValidation =
  | Readonly<{ kind: "match"; observation: Extract<ProcessObservation, { kind: "live" }> }>
  | Readonly<{ kind: "not-running" }>
  | Readonly<{
      kind: "mismatch";
      reason: "boot-identity" | "process-group" | "process-start";
    }>
  | Readonly<{ kind: "unprovable"; reason: string }>;

export type LaunchProcessGroupSpec = Readonly<{
  attemptId: string;
  fence: number;
  executable: string;
  args?: readonly string[];
  cwd: string;
  environment?: Readonly<NodeJS.ProcessEnv>;
  stdio?: StdioOptions;
  identityTimeoutMs?: number;
  identityPollMs?: number;
}>;

export type LaunchedProcessGroup = Readonly<{
  child: ChildProcess;
  identity: SupervisorIdentityV1;
}>;

export type SupervisorClock = Readonly<{
  now(): number;
  wallClock(): Date;
  sleep(milliseconds: number): Promise<void>;
}>;

export type TerminationOptions = Readonly<{
  graceMs?: number;
  forceWaitMs?: number;
  pollMs?: number;
}>;

export type TerminationResult =
  | Readonly<{ outcome: "terminated"; forced: boolean }>
  | Readonly<{ outcome: "already-exited"; forced: false }>
  | Readonly<{ outcome: "blocked"; forced: false; reason: string }>
  | Readonly<{ outcome: "timed-out"; forced: true }>;

export type StartupExpectation = Readonly<{
  attemptId: string | null;
  fence: number | null;
  shouldRun: boolean;
}>;

export type StartupReconciliation = Readonly<{
  action: "adopt" | "terminate" | "block";
  reason:
    | "active-identity-matches"
    | "attempt-is-no-longer-active"
    | "future-fence"
    | "identity-mismatch"
    | "identity-unprovable"
    | "process-missing"
    | "stale-fence";
  maySignal: boolean;
  mayRemoveState: boolean;
}>;

const DEFAULT_CLOCK: SupervisorClock = {
  now: () => performance.now(),
  wallClock: () => new Date(),
  sleep: async (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

function assertDuration(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000) {
    throw new RangeError(`${label} must be an integer from 0 through 60000 milliseconds`);
  }
}

export function validateSupervisorIdentity(
  identity: SupervisorIdentityV1,
  probe: PlatformProcessProbe,
): IdentityValidation {
  const validated = parseSupervisorIdentityV1(identity);
  let currentBootIdentity: string;
  try {
    currentBootIdentity = probe.currentBootIdentity();
  } catch (error) {
    return {
      kind: "unprovable",
      reason: `boot-identity-unavailable:${(error as Error).message}`,
    };
  }
  if (currentBootIdentity !== validated.bootIdentity) {
    return { kind: "mismatch", reason: "boot-identity" };
  }

  const observation = probe.inspectProcess(validated.pid);
  if (observation.kind === "missing") {
    return { kind: "not-running" };
  }
  if (observation.kind === "unprovable") {
    return observation;
  }
  if (observation.processStartIdentity !== validated.processStartIdentity) {
    return { kind: "mismatch", reason: "process-start" };
  }
  if (observation.processGroupId !== validated.processGroupId) {
    return { kind: "mismatch", reason: "process-group" };
  }
  return { kind: "match", observation };
}

export function classifyStartupReconciliation(
  identity: SupervisorIdentityV1,
  expectation: StartupExpectation,
  validation: IdentityValidation,
): StartupReconciliation {
  if (validation.kind === "unprovable") {
    return {
      action: "block",
      reason: "identity-unprovable",
      maySignal: false,
      mayRemoveState: false,
    };
  }
  if (validation.kind === "mismatch") {
    return {
      action: "block",
      reason: "identity-mismatch",
      maySignal: false,
      mayRemoveState: false,
    };
  }
  if (validation.kind === "not-running") {
    return {
      action: "terminate",
      reason: "process-missing",
      maySignal: false,
      mayRemoveState: true,
    };
  }
  if (
    !expectation.shouldRun ||
    expectation.attemptId === null ||
    expectation.fence === null ||
    expectation.attemptId !== identity.attemptId
  ) {
    return {
      action: "terminate",
      reason: "attempt-is-no-longer-active",
      maySignal: true,
      mayRemoveState: false,
    };
  }
  if (identity.fence < expectation.fence) {
    return {
      action: "terminate",
      reason: "stale-fence",
      maySignal: true,
      mayRemoveState: false,
    };
  }
  if (identity.fence > expectation.fence) {
    return {
      action: "block",
      reason: "future-fence",
      maySignal: false,
      mayRemoveState: false,
    };
  }
  return {
    action: "adopt",
    reason: "active-identity-matches",
    maySignal: false,
    mayRemoveState: false,
  };
}

async function waitForIdentity(
  pid: number,
  probe: PlatformProcessProbe,
  timeoutMs: number,
  pollMs: number,
  clock: SupervisorClock,
): Promise<Extract<ProcessObservation, { kind: "live" }>> {
  const deadline = clock.now() + timeoutMs;
  do {
    const observation = probe.inspectProcess(pid);
    if (observation.kind === "live") {
      return observation;
    }
    if (observation.kind === "unprovable") {
      throw new Error(`Could not prove launched process identity: ${observation.reason}`);
    }
    await clock.sleep(Math.min(pollMs, Math.max(0, deadline - clock.now())));
  } while (clock.now() < deadline);
  throw new Error(`Could not observe launched process ${pid} before the identity timeout`);
}

export async function launchProcessGroup(
  spec: LaunchProcessGroupSpec,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
  clock: SupervisorClock = DEFAULT_CLOCK,
): Promise<LaunchedProcessGroup> {
  const identityTimeoutMs = spec.identityTimeoutMs ?? 2_000;
  const identityPollMs = spec.identityPollMs ?? 10;
  assertDuration(identityTimeoutMs, "identityTimeoutMs");
  assertDuration(identityPollMs, "identityPollMs");
  if (identityPollMs === 0) {
    throw new RangeError("identityPollMs must be greater than zero");
  }
  if (!isAbsolute(spec.executable)) {
    throw new TypeError(`Worker executable must be absolute: ${spec.executable}`);
  }
  if (!isAbsolute(spec.cwd)) {
    throw new TypeError(`Worker working directory must be absolute: ${spec.cwd}`);
  }

  const bootIdentity = probe.currentBootIdentity();
  const child = spawn(spec.executable, [...(spec.args ?? [])], {
    cwd: spec.cwd,
    detached: true,
    env: spec.environment === undefined ? {} : { ...spec.environment },
    stdio: spec.stdio ?? "ignore",
  });
  if (child.pid === undefined || child.pid < 2) {
    throw new Error("The operating system did not assign a valid child PID");
  }

  let provenProcessGroupId: number | undefined;
  try {
    const observation = await waitForIdentity(
      child.pid,
      probe,
      identityTimeoutMs,
      identityPollMs,
      clock,
    );
    if (observation.processGroupId !== child.pid) {
      throw new Error(
        `Detached child did not become its process-group leader (${observation.processGroupId} != ${child.pid})`,
      );
    }
    provenProcessGroupId = observation.processGroupId;
    const identity = parseSupervisorIdentityV1({
      schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION,
      attemptId: spec.attemptId,
      fence: spec.fence,
      pid: child.pid,
      processStartIdentity: observation.processStartIdentity,
      bootIdentity,
      processGroupId: observation.processGroupId,
      launchedAt: clock.wallClock().toISOString(),
    });
    return { child, identity };
  } catch (error) {
    if (provenProcessGroupId !== undefined) {
      probe.signalProcessGroup(provenProcessGroupId, "SIGKILL");
    } else if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    throw error;
  }
}

async function waitForExitOrDeadline(
  identity: SupervisorIdentityV1,
  probe: PlatformProcessProbe,
  deadline: number,
  pollMs: number,
  clock: SupervisorClock,
): Promise<IdentityValidation> {
  let validation = validateSupervisorIdentity(identity, probe);
  while (validation.kind === "match" && clock.now() < deadline) {
    await clock.sleep(Math.min(pollMs, Math.max(0, deadline - clock.now())));
    validation = validateSupervisorIdentity(identity, probe);
  }
  return validation;
}

export async function terminateProcessGroup(
  identity: SupervisorIdentityV1,
  probe: PlatformProcessProbe = createSystemPlatformProbe(),
  options: TerminationOptions = {},
  clock: SupervisorClock = DEFAULT_CLOCK,
): Promise<TerminationResult> {
  const graceMs = options.graceMs ?? 5_000;
  const forceWaitMs = options.forceWaitMs ?? 2_000;
  const pollMs = options.pollMs ?? 25;
  assertDuration(graceMs, "graceMs");
  assertDuration(forceWaitMs, "forceWaitMs");
  assertDuration(pollMs, "pollMs");
  if (pollMs === 0) {
    throw new RangeError("pollMs must be greater than zero");
  }

  const initial = validateSupervisorIdentity(identity, probe);
  if (initial.kind === "not-running") {
    return { outcome: "already-exited", forced: false };
  }
  if (initial.kind !== "match") {
    return {
      outcome: "blocked",
      forced: false,
      reason:
        initial.kind === "mismatch"
          ? `identity-mismatch:${initial.reason}`
          : `identity-unprovable:${initial.reason}`,
    };
  }

  if (probe.signalProcessGroup(identity.processGroupId, "SIGTERM") === "missing") {
    return { outcome: "already-exited", forced: false };
  }
  const afterGrace = await waitForExitOrDeadline(
    identity,
    probe,
    clock.now() + graceMs,
    pollMs,
    clock,
  );
  if (afterGrace.kind === "not-running") {
    return { outcome: "terminated", forced: false };
  }
  if (afterGrace.kind !== "match") {
    return {
      outcome: "blocked",
      forced: false,
      reason:
        afterGrace.kind === "mismatch"
          ? `identity-changed-during-grace:${afterGrace.reason}`
          : `identity-became-unprovable:${afterGrace.reason}`,
    };
  }

  if (probe.signalProcessGroup(identity.processGroupId, "SIGKILL") === "missing") {
    return { outcome: "terminated", forced: true };
  }
  const afterForce = await waitForExitOrDeadline(
    identity,
    probe,
    clock.now() + forceWaitMs,
    pollMs,
    clock,
  );
  if (afterForce.kind === "not-running") {
    return { outcome: "terminated", forced: true };
  }
  if (afterForce.kind !== "match") {
    return {
      outcome: "blocked",
      forced: false,
      reason:
        afterForce.kind === "mismatch"
          ? `identity-changed-during-force:${afterForce.reason}`
          : `identity-became-unprovable:${afterForce.reason}`,
    };
  }
  return { outcome: "timed-out", forced: true };
}
