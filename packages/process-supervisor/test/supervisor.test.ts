import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import {
  classifyStartupReconciliation,
  createSystemPlatformProbe,
  launchProcessGroup,
  terminateProcessGroup,
  validateSupervisorIdentity,
  withSupervisorPrimaryChild,
  type GroupSignalResult,
  type PlatformProcessProbe,
  type ProcessGroupObservation,
  type ProcessObservation,
  type SupervisorClock,
  type SupervisorIdentity,
  type SupervisorIdentityV1,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000001";

function identity(overrides: Partial<SupervisorIdentityV1> = {}): SupervisorIdentityV1 {
  return {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    fence: 7,
    pid: 1234,
    processStartIdentity: "start-one",
    bootIdentity: "boot-one",
    processGroupId: 1234,
    launchedAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

class FakeProbe implements PlatformProcessProbe {
  public bootIdentity = "boot-one";
  public observation: ProcessObservation = {
    kind: "live",
    pid: 1234,
    processGroupId: 1234,
    processStartIdentity: "start-one",
  };
  public groupObservation: ProcessGroupObservation | null = null;
  public readonly signals: Array<readonly [number, NodeJS.Signals]> = [];
  public onSignal?: (signal: NodeJS.Signals) => GroupSignalResult;

  public currentBootIdentity(): string {
    return this.bootIdentity;
  }

  public inspectProcess(): ProcessObservation {
    return this.observation;
  }

  public inspectProcessGroup(processGroupId: number): ProcessGroupObservation {
    if (this.groupObservation !== null) return this.groupObservation;
    if (this.observation.kind !== "live") return this.observation;
    if (this.observation.processGroupId !== processGroupId) return { kind: "missing" };
    return { kind: "live", processGroupId, members: [this.observation] };
  }

  public signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): GroupSignalResult {
    this.signals.push([processGroupId, signal]);
    return this.onSignal?.(signal) ?? "sent";
  }
}

function fakeClock(): SupervisorClock & { elapsed(): number } {
  let now = 0;
  return {
    now: () => now,
    wallClock: () => new Date("2026-08-10T12:00:00.000Z"),
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    elapsed: () => now,
  };
}

describe("identity-safe supervision", () => {
  it("fails closed across boot identity mismatch without inspecting or signaling the PID", async () => {
    const probe = new FakeProbe();
    probe.bootIdentity = "boot-two";
    const inspect = vi.spyOn(probe, "inspectProcess");

    expect(validateSupervisorIdentity(identity(), probe)).toEqual({
      kind: "mismatch",
      reason: "boot-identity",
    });
    expect(inspect).not.toHaveBeenCalled();
    await expect(terminateProcessGroup(identity(), probe)).resolves.toEqual({
      outcome: "blocked",
      forced: false,
      reason: "identity-mismatch:boot-identity",
    });
    expect(probe.signals).toEqual([]);
  });

  it("never signals a reused PID with a different process-start identity", async () => {
    const probe = new FakeProbe();
    probe.observation = {
      kind: "live",
      pid: 1234,
      processGroupId: 1234,
      processStartIdentity: "start-from-reused-pid",
    };

    expect(validateSupervisorIdentity(identity(), probe)).toEqual({
      kind: "mismatch",
      reason: "process-start",
    });
    expect(await terminateProcessGroup(identity(), probe)).toMatchObject({ outcome: "blocked" });
    expect(probe.signals).toEqual([]);
  });

  it("treats a missing process as safely clearable state", async () => {
    const probe = new FakeProbe();
    probe.observation = { kind: "missing" };
    const validation = validateSupervisorIdentity(identity(), probe);
    expect(await terminateProcessGroup(identity(), probe)).toEqual({
      outcome: "already-exited",
      forced: false,
    });
    expect(
      classifyStartupReconciliation(
        identity(),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toEqual({
      action: "terminate",
      reason: "process-missing",
      maySignal: false,
      mayRemoveState: true,
    });
  });

  it("retains state and never signals a live group whose leader is missing without a witness", async () => {
    const probe = new FakeProbe();
    probe.observation = { kind: "missing" };
    probe.groupObservation = {
      kind: "live",
      processGroupId: 1234,
      members: [
        {
          kind: "live",
          pid: 2345,
          processGroupId: 1234,
          processStartIdentity: "child-start-one",
        },
      ],
    };

    const validation = validateSupervisorIdentity(identity(), probe);
    expect(validation).toEqual({
      kind: "unprovable",
      reason: "leader-missing:live-group-without-primary-child-witness",
    });
    expect(
      classifyStartupReconciliation(
        identity(),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toEqual({
      action: "block",
      reason: "identity-unprovable",
      maySignal: false,
      mayRemoveState: false,
    });
    await expect(terminateProcessGroup(identity(), probe)).resolves.toMatchObject({
      outcome: "blocked",
    });
    expect(probe.signals).toEqual([]);
  });

  it("retains state and never signals when a missing leader's group cannot be observed", async () => {
    const probe = new FakeProbe();
    probe.observation = { kind: "missing" };
    probe.groupObservation = { kind: "unprovable", reason: "ps-output-malformed" };

    const validation = validateSupervisorIdentity(identity(), probe);
    expect(validation).toEqual({
      kind: "unprovable",
      reason: "leader-missing:ps-output-malformed",
    });
    expect(
      classifyStartupReconciliation(
        identity(),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toEqual({
      action: "block",
      reason: "identity-unprovable",
      maySignal: false,
      mayRemoveState: false,
    });
    await expect(terminateProcessGroup(identity(), probe)).resolves.toMatchObject({
      outcome: "blocked",
    });
    expect(probe.signals).toEqual([]);
  });

  it("uses a matching primary-child witness to terminate a leaderless owned group", async () => {
    const probe = new FakeProbe();
    probe.observation = { kind: "missing" };
    probe.groupObservation = {
      kind: "live",
      processGroupId: 1234,
      members: [
        {
          kind: "live",
          pid: 2345,
          processGroupId: 1234,
          processStartIdentity: "child-start-one",
        },
      ],
    };
    probe.onSignal = () => {
      probe.groupObservation = { kind: "missing" };
      return "sent";
    };
    const witnessed = withSupervisorPrimaryChild(identity(), {
      pid: 2345,
      processGroupId: 1234,
      processStartIdentity: "child-start-one",
    });

    expect(validateSupervisorIdentity(witnessed, probe).kind).toBe("orphaned-group");
    await expect(
      terminateProcessGroup(witnessed, probe, { graceMs: 10 }, fakeClock()),
    ).resolves.toEqual({ outcome: "terminated", forced: false });
    expect(probe.signals).toEqual([[1234, "SIGTERM"]]);
  });

  it("fails closed when a reused group does not contain the persisted witness", async () => {
    const probe = new FakeProbe();
    probe.observation = { kind: "missing" };
    probe.groupObservation = {
      kind: "live",
      processGroupId: 1234,
      members: [
        {
          kind: "live",
          pid: 2345,
          processGroupId: 1234,
          processStartIdentity: "reused-child-start",
        },
      ],
    };
    const witnessed = withSupervisorPrimaryChild(identity(), {
      pid: 2345,
      processGroupId: 1234,
      processStartIdentity: "original-child-start",
    });

    expect(validateSupervisorIdentity(witnessed, probe)).toEqual({
      kind: "mismatch",
      reason: "primary-child",
    });
    await expect(terminateProcessGroup(witnessed, probe)).resolves.toMatchObject({
      outcome: "blocked",
    });
    expect(probe.signals).toEqual([]);
  });

  it("classifies matching, stale, and future fences deterministically", () => {
    const probe = new FakeProbe();
    const validation = validateSupervisorIdentity(identity(), probe);
    expect(
      classifyStartupReconciliation(
        identity(),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toMatchObject({ action: "adopt", reason: "active-identity-matches" });
    expect(
      classifyStartupReconciliation(
        identity({ fence: 6 }),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toMatchObject({ action: "terminate", reason: "stale-fence", maySignal: true });
    expect(
      classifyStartupReconciliation(
        identity({ fence: 8 }),
        { attemptId: ATTEMPT_ID, fence: 7, shouldRun: true },
        validation,
      ),
    ).toMatchObject({ action: "block", reason: "future-fence", maySignal: false });
  });

  it("uses graceful termination when the owned group exits on SIGTERM", async () => {
    const probe = new FakeProbe();
    probe.onSignal = (signal) => {
      if (signal === "SIGTERM") {
        probe.observation = { kind: "missing" };
      }
      return "sent";
    };
    expect(await terminateProcessGroup(identity(), probe, { graceMs: 10 }, fakeClock())).toEqual({
      outcome: "terminated",
      forced: false,
    });
    expect(probe.signals).toEqual([[1234, "SIGTERM"]]);
  });

  it("bounds graceful and forced cancellation even when a worker ignores both signals", async () => {
    const probe = new FakeProbe();
    const clock = fakeClock();
    expect(
      await terminateProcessGroup(
        identity(),
        probe,
        { graceMs: 10, forceWaitMs: 5, pollMs: 2 },
        clock,
      ),
    ).toEqual({ outcome: "timed-out", forced: true });
    expect(probe.signals).toEqual([
      [1234, "SIGTERM"],
      [1234, "SIGKILL"],
    ]);
    expect(clock.elapsed()).toBe(15);
  });

  it("does not escalate by bare PGID after the proven leader exits but its group remains", async () => {
    const probe = new FakeProbe();
    probe.onSignal = (signal) => {
      if (signal === "SIGTERM") {
        probe.observation = { kind: "missing" };
        probe.groupObservation = {
          kind: "live",
          processGroupId: 1234,
          members: [
            {
              kind: "live",
              pid: 2345,
              processGroupId: 1234,
              processStartIdentity: "unwitnessed-child",
            },
          ],
        };
      }
      return "sent";
    };

    await expect(
      terminateProcessGroup(
        identity(),
        probe,
        { graceMs: 10, forceWaitMs: 5, pollMs: 2 },
        fakeClock(),
      ),
    ).resolves.toMatchObject({ outcome: "blocked" });
    expect(probe.signals).toEqual([[1234, "SIGTERM"]]);
  });
});

const supportsUnixProcessGroups = process.platform === "darwin" || process.platform === "linux";
const integrationTest = supportsUnixProcessGroups ? it : it.skip;

integrationTest(
  "launches an isolated process group and removes its signal-resistant child and grandchild",
  async () => {
    const parentProgram = `
      const { spawn } = require("node:child_process");
      process.on("SIGTERM", () => {});
      const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
      process.stdout.write(String(child.pid) + "\\n");
      setInterval(() => {}, 1000);
    `;
    const probe = createSystemPlatformProbe();
    const launched = await launchProcessGroup(
      {
        attemptId: ATTEMPT_ID,
        fence: 1,
        executable: process.execPath,
        args: ["-e", parentProgram],
        cwd: process.cwd(),
        stdio: "pipe",
      },
      probe,
    );
    const child = launched.child as ChildProcessWithoutNullStreams;
    let grandchildPid: number | undefined;

    try {
      grandchildPid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("grandchild PID was not emitted")), 2_000);
        child.stdout.once("data", (chunk: Buffer) => {
          clearTimeout(timer);
          resolve(Number(chunk.toString("utf8").trim()));
        });
      });
      expect(validateSupervisorIdentity(launched.identity, probe).kind).toBe("match");
      expect(
        await terminateProcessGroup(launched.identity, probe, {
          graceMs: 50,
          forceWaitMs: 2_000,
          pollMs: 10,
        }),
      ).toEqual({ outcome: "terminated", forced: true });
      expect(probe.inspectProcess(launched.identity.pid)).toEqual({ kind: "missing" });

      const grandchildDeadline = Date.now() + 2_000;
      let grandchild = probe.inspectProcess(grandchildPid);
      while (grandchild.kind !== "missing" && Date.now() < grandchildDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        grandchild = probe.inspectProcess(grandchildPid);
      }
      expect(grandchild).toEqual({ kind: "missing" });
    } finally {
      if (validateSupervisorIdentity(launched.identity, probe).kind === "match") {
        probe.signalProcessGroup(launched.identity.processGroupId, "SIGKILL");
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      if (grandchildPid !== undefined) {
        const observation = probe.inspectProcess(grandchildPid);
        if (
          observation.kind === "live" &&
          observation.processGroupId === launched.identity.processGroupId &&
          validateSupervisorIdentity(launched.identity, probe).kind === "match"
        ) {
          probe.signalProcessGroup(launched.identity.processGroupId, "SIGKILL");
        }
      }
    }
  },
  10_000,
);

integrationTest(
  "uses a persisted child witness to remove a live descendant after the group leader dies",
  async () => {
    const parentProgram = `
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
      process.stdout.write(String(child.pid) + "\\n");
      setInterval(() => {}, 1000);
    `;
    const probe = createSystemPlatformProbe();
    const launched = await launchProcessGroup(
      {
        attemptId: ATTEMPT_ID,
        fence: 2,
        executable: process.execPath,
        args: ["-e", parentProgram],
        cwd: process.cwd(),
        stdio: "pipe",
      },
      probe,
    );
    const child = launched.child as ChildProcessWithoutNullStreams;
    let descendantPid: number | undefined;
    let witnessedIdentity: SupervisorIdentity | undefined;

    try {
      descendantPid = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("descendant PID was not emitted")), 2_000);
        child.stdout.once("data", (chunk: Buffer) => {
          clearTimeout(timer);
          resolve(Number(chunk.toString("utf8").trim()));
        });
      });
      const witness = probe.inspectProcess(descendantPid);
      if (witness.kind !== "live") throw new Error("descendant identity could not be proven");
      witnessedIdentity = withSupervisorPrimaryChild(launched.identity, witness);

      process.kill(launched.identity.pid, "SIGKILL");
      const leaderDeadline = Date.now() + 2_000;
      while (
        probe.inspectProcess(launched.identity.pid).kind !== "missing" &&
        Date.now() < leaderDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(probe.inspectProcess(launched.identity.pid)).toEqual({ kind: "missing" });
      expect(probe.inspectProcessGroup(launched.identity.processGroupId).kind).toBe("live");
      expect(validateSupervisorIdentity(witnessedIdentity, probe).kind).toBe("orphaned-group");

      await expect(
        terminateProcessGroup(witnessedIdentity, probe, {
          graceMs: 50,
          forceWaitMs: 2_000,
          pollMs: 10,
        }),
      ).resolves.toEqual({ outcome: "terminated", forced: true });
      expect(probe.inspectProcessGroup(launched.identity.processGroupId)).toEqual({
        kind: "missing",
      });
      expect(probe.inspectProcess(descendantPid)).toEqual({ kind: "missing" });
    } finally {
      const recoveryIdentity = witnessedIdentity ?? launched.identity;
      const validation = validateSupervisorIdentity(recoveryIdentity, probe);
      if (validation.kind === "match" || validation.kind === "orphaned-group") {
        probe.signalProcessGroup(recoveryIdentity.processGroupId, "SIGKILL");
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
    }
  },
  10_000,
);
