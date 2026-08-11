import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { isAbsolute } from "node:path";

import {
  parseSupervisorIdentity,
  parseSupervisorIdentityV2,
  SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
  type SupervisorIdentity,
  type SupervisorIdentityV2,
} from "./model.js";
import {
  createSystemPlatformProbe,
  type PlatformProcessProbe,
  type ProcessGroupObservation,
  type ProcessObservation,
} from "./platform.js";

export type IdentityValidation =
  | Readonly<{ kind: "match"; observation: Extract<ProcessObservation, { kind: "live" }> }>
  | Readonly<{
      kind: "orphaned-group";
      observation: Extract<ProcessGroupObservation, { kind: "live" }>;
      witness: Extract<ProcessObservation, { kind: "live" }>;
    }>
  | Readonly<{ kind: "not-running" }>
  | Readonly<{
      kind: "mismatch";
      reason: "boot-identity" | "primary-child" | "process-group" | "process-start";
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
  identity: SupervisorIdentityV2;
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
    | "orphaned-group"
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
  identity: SupervisorIdentity,
  probe: PlatformProcessProbe,
): IdentityValidation {
  const validated = parseSupervisorIdentity(identity);
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
    const group = probe.inspectProcessGroup(validated.processGroupId);
    if (group.kind === "missing") return { kind: "not-running" };
    if (group.kind === "unprovable") {
      return { kind: "unprovable", reason: `leader-missing:${group.reason}` };
    }
    const witness = validated.schemaVersion === 2 ? validated.primaryChild : null;
    if (witness === null) {
      return {
        kind: "unprovable",
        reason: "leader-missing:live-group-without-primary-child-witness",
      };
    }
    const observedWitness = group.members.find((member) => member.pid === witness.pid);
    if (
      observedWitness === undefined ||
      observedWitness.processGroupId !== witness.processGroupId ||
      observedWitness.processStartIdentity !== witness.processStartIdentity
    ) {
      return { kind: "mismatch", reason: "primary-child" };
    }
    return { kind: "orphaned-group", observation: group, witness: observedWitness };
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
  identity: SupervisorIdentity,
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
  if (validation.kind === "orphaned-group") {
    return {
      action: "terminate",
      reason: "orphaned-group",
      maySignal: true,
      mayRemoveState: false,
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
    const identity = parseSupervisorIdentityV2({
      schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
      attemptId: spec.attemptId,
      fence: spec.fence,
      pid: child.pid,
      processStartIdentity: observation.processStartIdentity,
      bootIdentity,
      processGroupId: observation.processGroupId,
      primaryChild: null,
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

async function waitForGroupExitOrDeadline(
  processGroupId: number,
  probe: PlatformProcessProbe,
  deadline: number,
  pollMs: number,
  clock: SupervisorClock,
): Promise<ProcessGroupObservation> {
  let observation = probe.inspectProcessGroup(processGroupId);
  while (observation.kind === "live" && clock.now() < deadline) {
    await clock.sleep(Math.min(pollMs, Math.max(0, deadline - clock.now())));
    observation = probe.inspectProcessGroup(processGroupId);
  }
  return observation;
}

function blockedTermination(
  validation: Exclude<IdentityValidation, { kind: "match" | "orphaned-group" | "not-running" }>,
): Extract<TerminationResult, { outcome: "blocked" }> {
  return {
    outcome: "blocked",
    forced: false,
    reason:
      validation.kind === "mismatch"
        ? `identity-mismatch:${validation.reason}`
        : `identity-unprovable:${validation.reason}`,
  };
}

export async function terminateProcessGroup(
  identity: SupervisorIdentity,
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
  if (initial.kind !== "match" && initial.kind !== "orphaned-group") {
    return blockedTermination(initial);
  }

  if (probe.signalProcessGroup(identity.processGroupId, "SIGTERM") === "missing") {
    return { outcome: "already-exited", forced: false };
  }
  const afterGraceGroup = await waitForGroupExitOrDeadline(
    identity.processGroupId,
    probe,
    clock.now() + graceMs,
    pollMs,
    clock,
  );
  if (afterGraceGroup.kind === "missing") {
    return { outcome: "terminated", forced: false };
  }
  if (afterGraceGroup.kind === "unprovable") {
    return {
      outcome: "blocked",
      forced: false,
      reason: `group-became-unprovable:${afterGraceGroup.reason}`,
    };
  }

  const forceAuthorization = validateSupervisorIdentity(identity, probe);
  if (forceAuthorization.kind === "not-running") {
    return { outcome: "terminated", forced: false };
  }
  if (forceAuthorization.kind !== "match" && forceAuthorization.kind !== "orphaned-group") {
    const blocked = blockedTermination(forceAuthorization);
    return { ...blocked, reason: `force-not-authorized:${blocked.reason}` };
  }

  if (probe.signalProcessGroup(identity.processGroupId, "SIGKILL") === "missing") {
    return { outcome: "terminated", forced: true };
  }
  const afterForceGroup = await waitForGroupExitOrDeadline(
    identity.processGroupId,
    probe,
    clock.now() + forceWaitMs,
    pollMs,
    clock,
  );
  if (afterForceGroup.kind === "missing") {
    return { outcome: "terminated", forced: true };
  }
  if (afterForceGroup.kind === "unprovable") {
    return {
      outcome: "blocked",
      forced: false,
      reason: `group-became-unprovable:${afterForceGroup.reason}`,
    };
  }
  return { outcome: "timed-out", forced: true };
}
