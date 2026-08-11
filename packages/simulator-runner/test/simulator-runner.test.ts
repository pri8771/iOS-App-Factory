import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  executeSimulatorRun,
  createGitSimulatorWorkspacePort,
  createSimulatorWorkspaceAttestation,
  parseSimulatorInventory,
  planSimulatorRun,
  SimulatorRunnerError,
  type SimulatorCommandPort,
  type SimulatorWorkspacePort,
} from "../src/index.js";

const UDID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-0";
const ATTEMPT = randomUUID();

function inventory(state = "Shutdown") {
  return parseSimulatorInventory({
    devices: {
      [RUNTIME]: [{ udid: UDID, name: "iPhone 17", state, isAvailable: true }],
      "com.apple.CoreSimulator.SimRuntime.tvOS-26-0": [
        { udid: "not-ios", name: "TV", state: "Shutdown", isAvailable: true },
      ],
    },
  });
}

function plan(state = "Shutdown", visible = true) {
  return planSimulatorRun({
    schemaVersion: 1,
    attemptId: ATTEMPT,
    candidateCommit: "a".repeat(40),
    inventory: inventory(state),
    simulatorUdid: UDID,
    runtimeId: RUNTIME,
    checkoutRoot: "/private/tmp/factory-checkout",
    runtimeRoot: "/private/tmp/factory-runtime",
    container: { kind: "project", path: "/private/tmp/factory-checkout/App.xcodeproj" },
    scheme: "App",
    testPlan: "release-ui",
    onlyTesting: ["AppUITests/CriticalJourney"],
    visible,
  });
}

function result(exitCode = 0) {
  return {
    exitCode,
    stdoutDigest: `sha256:${"a".repeat(64)}` as const,
    stderrDigest: `sha256:${"b".repeat(64)}` as const,
    timedOut: false,
    outputLimitExceeded: false,
    startedAt: "2026-08-10T12:00:00.000Z",
    finishedAt: "2026-08-10T12:00:01.000Z",
  };
}

function workspace(): SimulatorWorkspacePort & { attest: ReturnType<typeof vi.fn> } {
  return {
    attest: vi.fn(async (request) =>
      createSimulatorWorkspaceAttestation({
        checkoutRoot: request.checkoutRoot,
        containerPath: request.containerPath,
        runtimeRoot: request.runtimeRoot,
        derivedDataPath: request.derivedDataPath,
        resultBundlePath: request.resultBundlePath,
        candidateCommit: request.candidateCommit,
        clean: true,
      }),
    ),
  };
}

describe("simulator inventory and planning", () => {
  it("binds an exact available UDID and generates isolated visible-test argv", () => {
    const value = plan();
    expect(value.commands.boot?.arguments).toEqual(["simctl", "boot", UDID]);
    expect(value.commands.show?.arguments).toEqual([
      "-a",
      "Simulator",
      "--args",
      "-CurrentDeviceUDID",
      UDID,
    ]);
    expect(value.commands.test.arguments).toEqual(
      expect.arrayContaining([
        "-destination",
        `platform=iOS Simulator,id=${UDID}`,
        "-derivedDataPath",
        value.derivedDataPath,
        "-resultBundlePath",
        value.resultBundlePath,
      ]),
    );
    expect(value.simulatorLeaseKey).toBe(`simulator:${UDID}`);
    expect(plan().planDigest).toBe(value.planDigest);
  });

  it("does not claim ownership of a simulator that was already booted", () => {
    const value = plan("Booted", false);
    expect(value.commands.boot).toBeNull();
    expect(value.commands.shutdownIfOwned).toBeNull();
    expect(value.commands.show).toBeNull();
  });

  it("rejects transitional, unavailable, ambiguous, and escaping targets", () => {
    expect(() => plan("Booting")).toThrow("transitional state");
    expect(() =>
      planSimulatorRun({
        schemaVersion: 1,
        attemptId: ATTEMPT,
        candidateCommit: "a".repeat(40),
        inventory: inventory(),
        simulatorUdid: UDID,
        runtimeId: RUNTIME,
        checkoutRoot: "/private/tmp/factory-checkout",
        runtimeRoot: "/private/tmp/factory-runtime",
        container: { kind: "project", path: "/private/tmp/other/App.xcodeproj" },
        scheme: "App",
        visible: false,
      }),
    ).toThrow("escapes");
    expect(() =>
      parseSimulatorInventory({
        devices: {
          [RUNTIME]: [
            { udid: UDID, name: "A", state: "Shutdown", isAvailable: true },
            { udid: UDID, name: "B", state: "Shutdown", isAvailable: true },
          ],
        },
      }),
    ).toThrow("duplicate UDID");
  });
});

describe("lease-checked execution", () => {
  it("checks the fence around each phase and cleans up only its own simulator", async () => {
    const calls: string[][] = [];
    const port: SimulatorCommandPort = {
      run: vi.fn(async (command) => {
        calls.push([...command.arguments]);
        return result();
      }),
    };
    const assertActive = vi.fn(async () => undefined);
    const workspacePort = workspace();
    const value = await executeSimulatorRun(
      plan(),
      port,
      workspacePort,
      new AbortController().signal,
      assertActive,
    );
    expect(value).toMatchObject({ passed: true, blocked: false, bootOwned: true });
    expect(value.commands.map((item) => item.phase)).toEqual([
      "boot",
      "boot-status",
      "show",
      "test",
      "shutdown",
    ]);
    expect(calls.at(-1)).toEqual(["simctl", "shutdown", UDID]);
    expect(assertActive).toHaveBeenCalledTimes(16);
    expect(value.workspaceAttestations.map((item) => item.phase)).toEqual([
      "before-run",
      "before-test",
      "after-test",
    ]);
  });

  it("blocks on boot failure and still attempts owned cleanup", async () => {
    let invocation = 0;
    const port: SimulatorCommandPort = {
      run: vi.fn(async () => result(invocation++ === 0 ? 1 : 0)),
    };
    const value = await executeSimulatorRun(
      plan(),
      port,
      workspace(),
      new AbortController().signal,
      async () => undefined,
    );
    expect(value).toMatchObject({ passed: false, blocked: true });
    expect(value.commands.map((item) => item.phase)).toEqual(["boot", "shutdown"]);
  });

  it("fails before any command when its resource fence is stale", async () => {
    const port: SimulatorCommandPort = { run: vi.fn(async () => result()) };
    await expect(
      executeSimulatorRun(plan(), port, workspace(), new AbortController().signal, async () => {
        throw new SimulatorRunnerError("stale simulator fence");
      }),
    ).rejects.toThrow("stale simulator fence");
    expect(port.run).not.toHaveBeenCalled();
  });

  it("rejects a forged command plan before attestation or command dispatch", async () => {
    const original = plan();
    const forged = {
      ...original,
      commands: {
        ...original.commands,
        test: { executable: "/bin/sh", arguments: ["-c", "exfiltrate"] },
      },
    } as typeof original;
    const commandPort: SimulatorCommandPort = { run: vi.fn(async () => result()) };
    const workspacePort = workspace();
    await expect(
      executeSimulatorRun(
        forged,
        commandPort,
        workspacePort,
        new AbortController().signal,
        async () => undefined,
      ),
    ).rejects.toThrow("altered after planning");
    expect(workspacePort.attest).not.toHaveBeenCalled();
    expect(commandPort.run).not.toHaveBeenCalled();
  });

  it("rejects an attestation for any checkout other than the exact planned commit", async () => {
    const commandPort: SimulatorCommandPort = { run: vi.fn(async () => result()) };
    const workspacePort: SimulatorWorkspacePort = {
      attest: vi.fn(async (request) =>
        createSimulatorWorkspaceAttestation({
          checkoutRoot: request.checkoutRoot,
          containerPath: request.containerPath,
          runtimeRoot: request.runtimeRoot,
          derivedDataPath: request.derivedDataPath,
          resultBundlePath: request.resultBundlePath,
          candidateCommit: "b".repeat(40),
          clean: true,
        }),
      ),
    };
    await expect(
      executeSimulatorRun(
        plan(),
        commandPort,
        workspacePort,
        new AbortController().signal,
        async () => undefined,
      ),
    ).rejects.toThrow("does not match the planned candidate");
    expect(commandPort.run).not.toHaveBeenCalled();
  });

  it("marks a failed owned shutdown as blocked", async () => {
    let invocation = 0;
    const commandPort: SimulatorCommandPort = {
      run: vi.fn(async () => result(invocation++ === 4 ? 1 : 0)),
    };
    const value = await executeSimulatorRun(
      plan(),
      commandPort,
      workspace(),
      new AbortController().signal,
      async () => undefined,
    );
    expect(value).toMatchObject({ passed: false, blocked: true });
    expect(value.commands.at(-1)).toMatchObject({ phase: "shutdown", result: { exitCode: 1 } });
  });

  it("uses an independent cleanup signal after run cancellation", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const commands: string[][] = [];
    const commandPort: SimulatorCommandPort = {
      run: vi.fn(async (command, signal) => {
        signals.push(signal);
        commands.push([...command.arguments]);
        if (commands.length === 1) controller.abort();
        return result();
      }),
    };
    await expect(
      executeSimulatorRun(
        plan(),
        commandPort,
        workspace(),
        controller.signal,
        async () => undefined,
      ),
    ).rejects.toThrow("cancelled");
    expect(commands.at(-1)).toEqual(["simctl", "shutdown", UDID]);
    expect(signals.at(-1)).not.toBe(controller.signal);
    expect(signals.at(-1)?.aborted).toBe(false);
  });

  it("rejects a symlinked Xcode container before invoking Git", async () => {
    const root = await mkdtemp(join("/private/tmp", "factory-simulator-attestation-"));
    try {
      const checkoutRoot = join(root, "checkout");
      const actualContainer = join(root, "Actual.xcodeproj");
      const linkedContainer = join(checkoutRoot, "App.xcodeproj");
      const runtimeRoot = join(root, "runtime");
      await mkdir(checkoutRoot);
      await mkdir(actualContainer);
      await mkdir(runtimeRoot, { mode: 0o700 });
      await symlink(actualContainer, linkedContainer);
      await expect(
        createGitSimulatorWorkspacePort().attest(
          {
            checkoutRoot,
            containerKind: "project",
            containerPath: linkedContainer,
            runtimeRoot,
            derivedDataPath: join(runtimeRoot, "DerivedData"),
            resultBundlePath: join(runtimeRoot, "results", "ui-tests.xcresult"),
            candidateCommit: "a".repeat(40),
          },
          new AbortController().signal,
        ),
      ).rejects.toThrow("must not traverse symlinks");
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
