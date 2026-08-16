import {
  chmodSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSupervisedRunIntent,
  inspectSupervisedRun,
  launchPreparedSupervisedRun,
  openPreparedSupervisedRun,
  parseSupervisedRunIntent,
  prepareSupervisedRun,
  readSupervisorStateFile,
  reconcileSupervisedRun,
  readBoundSupervisedRunCancellation,
  requestSupervisedRunTermination,
  runSupervisedTargetGate,
  SupervisedRunCancellationArtifactError,
  waitForSupervisedRunRegistration,
  writeSupervisorStateFile,
  type PlatformProcessProbe,
  type PreparedSupervisedRun,
  type SupervisorIdentityV2,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000041";
const COMPILED_ENTRYPOINT = join(
  process.cwd(),
  "packages/process-supervisor/dist/supervised-entrypoint.js",
);
const temporaryDirectories: string[] = [];

function makeRoot(): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "app-factory-supervised-")));
  chmodSync(root, 0o700);
  temporaryDirectories.push(root);
  return root;
}

function prepare(
  overrides: Partial<Parameters<typeof prepareSupervisedRun>[1]> = {},
): PreparedSupervisedRun {
  const root = makeRoot();
  return prepareSupervisedRun(root, {
    runKey: "run-one",
    attemptId: ATTEMPT_ID,
    fence: 3,
    createdAt: "2026-08-11T12:00:00.000Z",
    executable: process.execPath,
    argv: ["-e", "process.stdout.write('ok')"],
    cwd: root,
    environment: { FACTORY_EXACT: "yes" },
    limits: {
      timeoutMs: 5_000,
      graceMs: 100,
      forceWaitMs: 500,
      pollMs: 10,
      maxOutputBytesPerStream: 16_384,
    },
    ...overrides,
  });
}

async function waitUntil<T>(observe: () => T | null, timeoutMs = 8_000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  do {
    const result = observe();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (performance.now() < deadline);
  throw new Error("Condition was not observed before the polling deadline");
}

async function launchAndWait(prepared: PreparedSupervisedRun) {
  const launch = launchPreparedSupervisedRun(prepared, {
    controllerEntrypointPath: COMPILED_ENTRYPOINT,
  });
  expect(launch.outcome).toBe("launch-requested");
  if (launch.outcome !== "launch-requested") throw new Error("Expected a launch request");
  const registration = await waitForSupervisedRunRegistration(prepared, launch.registration, {
    timeoutMs: 5_000,
    pollMs: 10,
  });
  expect(["registered", "terminal"]).toContain(registration.outcome);
  return launch;
}

async function waitForTerminal(prepared: PreparedSupervisedRun) {
  try {
    return await waitUntil(() => {
      const inspection = inspectSupervisedRun(prepared);
      const mutationLockPath = join(
        prepared.paths.runDirectory,
        ".target.state.json.mutation-lock",
      );
      const controllerMutationLockPath = join(
        prepared.paths.runDirectory,
        ".controller.state.json.mutation-lock",
      );
      return inspection.state === "terminal" &&
        inspection.stateCleanup === "complete" &&
        !existsSync(mutationLockPath) &&
        !existsSync(controllerMutationLockPath)
        ? inspection
        : null;
    });
  } catch (error) {
    const finalInspection = inspectSupervisedRun(prepared);
    throw new Error(
      `Terminal state was not observed; final state=${finalInspection.state}${
        finalInspection.state === "blocked" ? ` reason=${finalInspection.reason}` : ""
      }`,
      { cause: error },
    );
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("supervised run contracts", () => {
  it("rejects unknown fields, digest tampering, credential environments, and credential argv", () => {
    const root = makeRoot();
    const valid = createSupervisedRunIntent({
      runKey: "contract-one",
      attemptId: ATTEMPT_ID,
      fence: 1,
      createdAt: "2026-08-11T12:00:00.000Z",
      executable: process.execPath,
      argv: ["--version"],
      cwd: root,
      environment: { CODEX_HOME: join(root, "codex-home") },
    });
    expect(parseSupervisedRunIntent(valid)).toEqual(valid);
    expect(() => parseSupervisedRunIntent({ ...valid, extra: true })).toThrow(/unknown or missing/);
    expect(() => parseSupervisedRunIntent({ ...valid, cwd: "/tmp/changed" })).toThrow(
      /invocationDigest/,
    );
    expect(() =>
      createSupervisedRunIntent({
        runKey: valid.runKey,
        attemptId: valid.attemptId,
        fence: valid.fence,
        createdAt: valid.createdAt,
        executable: valid.executable,
        argv: valid.argv,
        cwd: valid.cwd,
        environment: { API_TOKEN: "must-not-persist" },
      }),
    ).toThrow(/credential-like/);
    expect(() =>
      createSupervisedRunIntent({
        runKey: valid.runKey,
        attemptId: valid.attemptId,
        fence: valid.fence,
        createdAt: valid.createdAt,
        executable: valid.executable,
        argv: ["--api-key=must-not-persist"],
        cwd: valid.cwd,
      }),
    ).toThrow(/credentials must not be placed in argv/);
    for (const credentialFlag of [
      "--token",
      "--AUTH",
      "--credential",
      "--password",
      "--secret",
      "--api-key",
      "--API_KEY",
      "--private-key",
      "--PRIVATE_KEY",
    ]) {
      expect(() =>
        createSupervisedRunIntent({
          runKey: valid.runKey,
          attemptId: valid.attemptId,
          fence: valid.fence,
          createdAt: valid.createdAt,
          executable: valid.executable,
          argv: [credentialFlag, "must-not-persist"],
          cwd: valid.cwd,
        }),
      ).toThrow(/credentials must not be placed in argv/);
    }
  });

  it("prepares an immutable private intent idempotently and rejects conflicts", () => {
    const root = makeRoot();
    const input = {
      runKey: "immutable-one",
      attemptId: ATTEMPT_ID,
      fence: 1,
      createdAt: "2026-08-11T12:00:00.000Z",
      executable: process.execPath,
      argv: ["--version"],
      cwd: root,
    } as const;
    const first = prepareSupervisedRun(root, input);
    const second = prepareSupervisedRun(root, input);
    expect(first.preparation).toBe("created");
    expect(second.preparation).toBe("already-prepared");
    expect(first.intentDigest).toBe(second.intentDigest);
    expect(openPreparedSupervisedRun(root, "immutable-one")).toEqual(second);
    expect(openPreparedSupervisedRun(root, "missing-one")).toBeNull();
    expect(() => openPreparedSupervisedRun(root, "../escape")).toThrow(/path-safe/);
    expect(() => prepareSupervisedRun(root, { ...input, argv: ["--help"] })).toThrow(/different/);
  });

  it("does not exec on control EOF and passes argv[0] plus only the exact intent environment", () => {
    const prepared = prepare();
    const fakeController = {
      pid: 4_321,
      exitCode: null,
      signalCode: null,
      unref: vi.fn(),
    };
    expect(
      launchPreparedSupervisedRun(prepared, {
        controllerEntrypointPath: COMPILED_ENTRYPOINT,
        spawnController: () => fakeController,
      }).outcome,
    ).toBe("launch-requested");

    const eofPath = join(prepared.paths.runDirectory, "control-eof");
    writeFileSync(eofPath, "", { mode: 0o600 });
    const eofDescriptor = openSync(eofPath, "r");
    const notCalled = vi.fn((): never => {
      throw new Error("must not execute");
    });
    expect(
      runSupervisedTargetGate(prepared.paths.intentPath, {
        controlFileDescriptor: eofDescriptor,
        execve: notCalled,
      }),
    ).toBe("permission-eof");
    expect(notCalled).not.toHaveBeenCalled();

    const unauthorizedPath = join(prepared.paths.runDirectory, "control-unauthorized");
    writeFileSync(unauthorizedPath, "EXEC\n", { mode: 0o600 });
    const unauthorizedDescriptor = openSync(unauthorizedPath, "r");
    expect(() =>
      runSupervisedTargetGate(prepared.paths.intentPath, {
        controlFileDescriptor: unauthorizedDescriptor,
        execve: notCalled,
      }),
    ).toThrow(/durable supervisor identity/);
    expect(notCalled).not.toHaveBeenCalled();

    const permitPath = join(prepared.paths.runDirectory, "control-permit");
    writeFileSync(permitPath, "EXEC\n", { mode: 0o600 });
    const permitDescriptor = openSync(permitPath, "r");
    const sentinel = new Error("execve-called");
    const execve = vi.fn((): never => {
      throw sentinel;
    });
    const authorize = vi.fn();
    const changeDirectory = vi.fn();
    expect(() =>
      runSupervisedTargetGate(prepared.paths.intentPath, {
        controlFileDescriptor: permitDescriptor,
        execve,
        authorize,
        changeDirectory,
      }),
    ).toThrow(sentinel);
    expect(authorize).toHaveBeenCalledOnce();
    expect(changeDirectory).toHaveBeenCalledWith(prepared.intent.cwd);
    expect(execve).toHaveBeenCalledWith(
      process.execPath,
      [process.execPath, "-e", "process.stdout.write('ok')"],
      { FACTORY_EXACT: "yes" },
    );
    expect(execve.mock.calls[0]?.[2]).not.toHaveProperty("HOME");
  });

  it("keeps a just-launched local controller pending until a bounded registration deadline", async () => {
    const prepared = prepare();
    let now = 0;
    const launch = launchPreparedSupervisedRun(prepared, {
      controllerEntrypointPath: COMPILED_ENTRYPOINT,
      spawnController: () => ({
        pid: 4_322,
        exitCode: null,
        signalCode: null,
        unref: vi.fn(),
      }),
    });
    if (launch.outcome !== "launch-requested") throw new Error("Expected launch request");
    await expect(
      waitForSupervisedRunRegistration(prepared, launch.registration, {
        timeoutMs: 20,
        pollMs: 5,
        clock: {
          now: () => now,
          sleep: async (milliseconds) => {
            now += milliseconds;
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "blocked",
      reason: "controller-registration-deadline-expired; restart reconciliation must not relaunch",
    });
    expect(launchPreparedSupervisedRun(prepared).outcome).toBe("blocked");
  });

  it("fails closed when a claimed state has a reused process identity", () => {
    const prepared = prepare();
    launchPreparedSupervisedRun(prepared, {
      controllerEntrypointPath: COMPILED_ENTRYPOINT,
      spawnController: () => ({
        pid: 4_323,
        exitCode: 1,
        signalCode: null,
        unref: vi.fn(),
      }),
    });
    const identity: SupervisorIdentityV2 = {
      schemaVersion: 2,
      attemptId: ATTEMPT_ID,
      fence: 3,
      pid: 4_400,
      processStartIdentity: "original-start",
      bootIdentity: "boot-one",
      processGroupId: 4_400,
      primaryChild: null,
      launchedAt: "2026-08-11T12:00:01.000Z",
    };
    writeSupervisorStateFile(prepared.paths.statePath, identity, null);
    const probe: PlatformProcessProbe = {
      currentBootIdentity: () => "boot-one",
      inspectProcess: () => ({
        kind: "live",
        pid: 4_400,
        processGroupId: 4_400,
        processStartIdentity: "reused-start",
      }),
      inspectProcessGroup: () => ({ kind: "missing" }),
      signalProcessGroup: () => "sent",
    };
    expect(inspectSupervisedRun(prepared, probe)).toMatchObject({
      state: "blocked",
      reason: "target-identity-mismatch:process-start",
    });
  });

  it("surfaces a malformed durable cancellation as a typed blocker without signaling", async () => {
    const prepared = prepare({ runKey: "malformed-cancellation-one" });
    launchPreparedSupervisedRun(prepared, {
      controllerEntrypointPath: COMPILED_ENTRYPOINT,
      spawnController: () => ({
        pid: 4_324,
        exitCode: null,
        signalCode: null,
        unref: vi.fn(),
      }),
    });
    const identity: SupervisorIdentityV2 = {
      schemaVersion: 2,
      attemptId: ATTEMPT_ID,
      fence: 3,
      pid: 4_401,
      processStartIdentity: "target-start",
      bootIdentity: "boot-one",
      processGroupId: 4_401,
      primaryChild: null,
      launchedAt: "2026-08-11T12:00:01.000Z",
    };
    writeSupervisorStateFile(prepared.paths.statePath, identity, null);
    const malformedBytes = '{"schemaVersion":';
    writeFileSync(prepared.paths.cancellationPath, malformedBytes, { mode: 0o600 });
    const signalProcessGroup = vi.fn(() => "sent" as const);
    const probe: PlatformProcessProbe = {
      currentBootIdentity: () => "boot-one",
      inspectProcess: () => ({
        kind: "live",
        pid: identity.pid,
        processGroupId: identity.processGroupId,
        processStartIdentity: identity.processStartIdentity,
      }),
      inspectProcessGroup: () => ({
        kind: "live",
        processGroupId: identity.processGroupId,
        members: [
          {
            kind: "live",
            pid: identity.pid,
            processGroupId: identity.processGroupId,
            processStartIdentity: identity.processStartIdentity,
          },
        ],
      }),
      signalProcessGroup,
    };

    expect(() => readBoundSupervisedRunCancellation(prepared, identity)).toThrow(
      SupervisedRunCancellationArtifactError,
    );
    expect(inspectSupervisedRun(prepared, probe)).toMatchObject({
      state: "blocked",
      reason: "cancellation-artifact-invalid:malformed",
    });
    expect(reconcileSupervisedRun(prepared, probe)).toEqual({
      outcome: "blocked",
      reason: "cancellation-artifact-invalid:malformed",
    });
    await expect(requestSupervisedRunTermination(prepared, probe)).resolves.toEqual({
      outcome: "blocked",
      reason: "cancellation-artifact-invalid:malformed",
    });
    expect(signalProcessGroup).not.toHaveBeenCalled();
    expect(readFileSync(prepared.paths.cancellationPath, "utf8")).toBe(malformedBytes);
  });
});

describe.runIf(existsSync(COMPILED_ENTRYPOINT))(
  "compiled supervised controller integration",
  () => {
    it("captures complete trailing output, stdin, argv, and an exact non-ambient environment", async () => {
      const root = makeRoot();
      const permissionPath = join(root, "success-one", "execution-permitted.json");
      const script = [
        "const fs=require('node:fs');",
        "const body=fs.readFileSync(0,'utf8');",
        "process.stdout.write(JSON.stringify({arg:process.argv[1],exact:process.env.FACTORY_EXACT,ambient:Object.hasOwn(process.env,'HOME'),permissionBeforeExec:fs.existsSync(process.env.FACTORY_PERMISSION),body})+'\\nTAIL');",
        "process.stderr.write('ERR-TAIL');",
      ].join("");
      const prepared = prepareSupervisedRun(root, {
        runKey: "success-one",
        attemptId: ATTEMPT_ID,
        fence: 4,
        createdAt: "2026-08-11T12:00:00.000Z",
        executable: process.execPath,
        argv: ["-e", script, "expected-argument"],
        cwd: root,
        environment: { FACTORY_EXACT: "only-value", FACTORY_PERMISSION: permissionPath },
        stdin: Buffer.from("expected-stdin"),
        limits: { timeoutMs: 5_000, pollMs: 10 },
      });
      await launchAndWait(prepared);
      const terminal = await waitForTerminal(prepared);
      expect(terminal.receipt.outcome).toBe("succeeded");
      const stdout = readFileSync(prepared.paths.stdoutPath, "utf8");
      const [json, tail] = stdout.split("\n");
      expect(JSON.parse(json ?? "") as unknown).toEqual({
        arg: "expected-argument",
        exact: "only-value",
        ambient: false,
        permissionBeforeExec: true,
        body: "expected-stdin",
      });
      expect(tail).toBe("TAIL");
      expect(readFileSync(prepared.paths.stderrPath, "utf8")).toContain("ERR-TAIL");
      expect(terminal.receipt.stdout.capturedByteLength).toBe(Buffer.byteLength(stdout));

      const spawnController = vi.fn();
      expect(
        launchPreparedSupervisedRun(prepared, {
          controllerEntrypointPath: COMPILED_ENTRYPOINT,
          spawnController,
        }),
      ).toMatchObject({ outcome: "already-terminal" });
      expect(spawnController).not.toHaveBeenCalled();
    });

    it("bounds an uncooperative target with timeout and forced process-group termination", async () => {
      // Timing budget (measured on Node 24.18 / Apple M5 Pro, 2026-08-16):
      // the controller's timeout starts when execution permission is sent,
      // and from there the gate must exec the target and the target must
      // reach user code before it can install its SIGTERM handler. That
      // gate->target-ready path measures ~82-92 ms unloaded and ~103-120 ms
      // (p90 117 ms) under CPU load, so a 100 ms timeout regularly fires
      // before the target is uncooperative at all: plain SIGTERM then kills
      // it and the receipt honestly reports SIGTERM. 1000 ms (~8x loaded p90)
      // lets the target become uncooperative first, which is the premise
      // this test exists to check.
      const prepared = prepare({
        runKey: "timeout-one",
        argv: [
          "-e",
          "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)",
        ],
        limits: {
          timeoutMs: 1_000,
          graceMs: 50,
          forceWaitMs: 500,
          pollMs: 10,
          maxOutputBytesPerStream: 1_024,
        },
      });
      await launchAndWait(prepared);
      const terminal = await waitForTerminal(prepared);
      // The target proved it had installed its SIGTERM handler before the
      // timeout fired; a missing marker means the budget above was exceeded.
      expect(readFileSync(prepared.paths.stdoutPath, "utf8")).toBe("ready");
      expect(terminal.receipt.outcome).toBe("timed-out");
      expect(terminal.receipt.terminationOrigin).toBe("timeout");
      expect(terminal.receipt.process.signal).toBe("SIGKILL");
    });

    it("bounds output, records truncation, and classifies overflow", async () => {
      const prepared = prepare({
        runKey: "overflow-one",
        argv: ["-e", "process.stdout.write('x'.repeat(8192));setInterval(()=>{},1000)"],
        limits: {
          timeoutMs: 5_000,
          graceMs: 50,
          forceWaitMs: 500,
          pollMs: 10,
          maxOutputBytesPerStream: 64,
        },
      });
      await launchAndWait(prepared);
      const terminal = await waitForTerminal(prepared);
      expect(terminal.receipt.outcome).toBe("output-overflow");
      expect(terminal.receipt.terminationOrigin).toBe("output-overflow");
      expect(terminal.receipt.stdout).toMatchObject({
        capturedByteLength: 64,
        truncated: true,
      });
      expect(terminal.receipt.stdout.observedByteLength).toBeGreaterThan(64);
      expect(readFileSync(prepared.paths.stdoutPath).byteLength).toBe(64);
    });

    it("cancels a registered target identity-safely and emits a cancellation receipt", async () => {
      const prepared = prepare({
        runKey: "cancel-one",
        argv: ["-e", "process.stdout.write('ready');setInterval(()=>{},1000)"],
        limits: {
          timeoutMs: 5_000,
          graceMs: 100,
          forceWaitMs: 500,
          pollMs: 10,
          maxOutputBytesPerStream: 1_024,
        },
      });
      await launchAndWait(prepared);
      const request = await requestSupervisedRunTermination(prepared);
      expect(request.outcome).toBe("termination-requested");
      const terminal = await waitForTerminal(prepared);
      expect(terminal.receipt.outcome).toBe("cancelled");
      expect(terminal.receipt.terminationOrigin).toBe("cancellation");
    }, 15_000);

    it("retains a proven target after its controller is killed and never fabricates a receipt", async () => {
      const root = makeRoot();
      const marker = join(root, "target-started");
      const prepared = prepareSupervisedRun(root, {
        runKey: "controller-kill-one",
        attemptId: ATTEMPT_ID,
        fence: 8,
        createdAt: "2026-08-11T12:00:00.000Z",
        executable: process.execPath,
        argv: [
          "-e",
          "require('node:fs').writeFileSync(process.env.FACTORY_MARKER,'started');setInterval(()=>{},1000)",
        ],
        cwd: root,
        environment: { FACTORY_MARKER: marker },
        limits: { timeoutMs: 20_000, graceMs: 100, forceWaitMs: 500, pollMs: 10 },
      });
      const launch = await launchAndWait(prepared);
      await waitUntil(() => (existsSync(marker) ? true : null));
      process.kill(launch.controllerPid, "SIGKILL");
      await waitUntil(() => {
        try {
          process.kill(launch.controllerPid, 0);
          return null;
        } catch {
          return true;
        }
      });
      expect(inspectSupervisedRun(prepared)).toMatchObject({
        state: "blocked",
        reason: "controller-exited-with-live-target",
      });
      const termination = await requestSupervisedRunTermination(prepared);
      expect(termination.outcome).toBe("termination-requested");
      await waitUntil(() => {
        const state = readSupervisorStateFile(prepared.paths.statePath);
        if (state === null) return true;
        const observation = inspectSupervisedRun(prepared);
        return observation.state === "blocked" ? true : null;
      });
      expect(existsSync(prepared.paths.receiptPath)).toBe(false);
    });

    it("fsyncs the terminal receipt before state removal and exposes a stale-lock blocker", async () => {
      const prepared = prepare({
        runKey: "receipt-order-one",
        argv: ["-e", "setTimeout(()=>{},500)"],
        limits: {
          timeoutMs: 5_000,
          graceMs: 100,
          forceWaitMs: 500,
          pollMs: 10,
          maxOutputBytesPerStream: 1_024,
        },
      });
      await launchAndWait(prepared);
      writeFileSync(
        join(prepared.paths.runDirectory, ".target.state.json.mutation-lock"),
        "interrupted-writer\n",
        { mode: 0o600 },
      );
      await waitUntil(() => (existsSync(prepared.paths.receiptPath) ? true : null));
      expect(inspectSupervisedRun(prepared)).toMatchObject({
        state: "terminal",
        stateCleanup: "pending",
      });
      const reconciliation = await waitUntil(() => {
        const result = reconcileSupervisedRun(prepared);
        return result.outcome === "blocked" &&
          result.reason.includes("operator must verify the mutation lock")
          ? result
          : null;
      });
      expect(reconciliation).toMatchObject({
        outcome: "blocked",
        reason: expect.stringContaining("operator must verify the mutation lock"),
      });
    });
  },
);
