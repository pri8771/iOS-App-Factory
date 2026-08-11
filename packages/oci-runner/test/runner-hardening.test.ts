import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OciRunner,
  labelsForOciRun,
  parseOciRunIntent,
  prepareOciRun,
  type OciContainerInspection,
  type OciEnginePort,
  type OciImageIdentityV1,
  type OciLogCapture,
  type OciRunIntentV1,
} from "../src/index.js";

const CONTAINER_ID = "b".repeat(64);
const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(directory);
  return directory;
}

function fixtureIntent(): OciRunIntentV1 {
  const worktree = temporaryDirectory("factory-oci-hardening-worktree-");
  mkdirSync(join(worktree, "Sources"));
  writeFileSync(join(worktree, "Sources", "App.swift"), "struct App {}\n");
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey: "codex-33333333-f1",
    attemptId: "33333333-3333-4333-8333-333333333333",
    runId: "44444444-4444-4444-8444-444444444444",
    fence: 1,
    createdAt: "2026-08-11T16:00:00.000Z",
    taskSpecDigest: `sha256:${"3".repeat(64)}`,
    policyDigest: `sha256:${"4".repeat(64)}`,
    baseCommit: "5".repeat(40),
    baseTree: "6".repeat(40),
    containerName: "app-factory-codex-33333333-f1",
    image: {
      reference: `factory/codex@sha256:${"2".repeat(64)}`,
      imageId: IMAGE_ID,
    },
    worktreeHostPath: worktree,
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: "/usr/local/bin/codex",
    agentArguments: ["exec", "--json", "--skip-git-repo-check", "-"],
    environment: [
      { name: "LANG", value: "C" },
      { name: "PATH", value: "/usr/local/bin:/usr/bin:/bin" },
      { name: "TZ", value: "UTC" },
    ],
    limits: {
      cpuCount: 2,
      memoryBytes: 1_073_741_824,
      pidLimit: 128,
      outputBytesPerStream: 1_048_576,
      wallTimeMs: 60_000,
      stopGraceMs: 5_000,
      privateTmpfsBytes: 67_108_864,
    },
  });
}

function inspectionFor(
  intent: OciRunIntentV1,
  status: "created" | "running" | "terminal",
  overrides: Partial<OciContainerInspection> = {},
): OciContainerInspection {
  const running = status === "running";
  return {
    containerId: CONTAINER_ID,
    name: intent.containerName,
    imageId: intent.image.imageId,
    labels: labelsForOciRun(intent),
    user: "10001:10001",
    command: [intent.agentExecutable, ...intent.agentArguments],
    entrypoint: null,
    workingDirectory: "/workspace",
    environment: intent.environment.map(({ name, value }) => `${name}=${value}`),
    status,
    createdAt: "2026-08-11T16:00:01.000Z",
    startedAt: status === "created" ? null : "2026-08-11T16:00:02.000Z",
    finishedAt: status === "terminal" ? "2026-08-11T16:00:03.000Z" : null,
    exitCode: status === "terminal" ? 0 : null,
    oomKilled: false,
    running,
    readOnlyRootFilesystem: true,
    networkMode: "none",
    capDrop: ["ALL"],
    securityOptions: ["no-new-privileges=true"],
    memoryBytes: intent.limits.memoryBytes,
    memorySwapBytes: intent.limits.memoryBytes,
    pidLimit: intent.limits.pidLimit,
    cpuNanoCount: intent.limits.cpuCount * 1_000_000_000,
    stopTimeoutSeconds: Math.ceil(intent.limits.stopGraceMs / 1_000),
    privileged: false,
    tmpfs: {
      "/run/app-factory": `rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    },
    logDriver: "local",
    logOptions: {
      "max-size": `${String(intent.limits.outputBytesPerStream)}b`,
      "max-file": "1",
      compress: "false",
    },
    mounts: [
      {
        type: "bind",
        source: intent.worktreeHostPath,
        destination: "/workspace",
        readWrite: true,
      },
    ],
    ...overrides,
  };
}

class HardeningEngine implements OciEnginePort {
  public inspection: OciContainerInspection | null = null;
  public failVerification = false;
  public createError: Error | null = null;
  public onVerification: (() => void) | null = null;
  public verificationGate: Promise<void> | null = null;
  public verifyCount = 0;
  public createCount = 0;
  public startCount = 0;
  public stopCount = 0;
  public killCount = 0;
  public removeCount = 0;
  public stopLeavesRunning = false;
  public logsResult: OciLogCapture = {
    stdout: Buffer.from("ok\n"),
    stderr: Buffer.from("warn\n"),
    stdoutObservedBytes: 3,
    stderrObservedBytes: 5,
  };
  readonly #intent: OciRunIntentV1;

  public constructor(intent: OciRunIntentV1) {
    this.#intent = intent;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    this.verifyCount += 1;
    this.onVerification?.();
    if (this.verificationGate !== null) await this.verificationGate;
    if (this.failVerification) throw new Error("pinned image unavailable");
    if (image.reference !== this.#intent.image.reference || image.imageId !== IMAGE_ID) {
      throw new Error("wrong image");
    }
  }

  public async findByLabels(): Promise<OciContainerInspection | null> {
    return this.inspection;
  }

  public async create(): Promise<string> {
    this.createCount += 1;
    if (this.createError !== null) throw this.createError;
    this.inspection = inspectionFor(this.#intent, "created");
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (containerId !== CONTAINER_ID) throw new Error("wrong container");
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.startCount += 1;
    this.inspection = inspectionFor(this.#intent, "running");
  }

  public async logs(): Promise<OciLogCapture> {
    return this.logsResult;
  }

  public async stop(): Promise<void> {
    this.stopCount += 1;
    if (!this.stopLeavesRunning) {
      this.inspection = inspectionFor(this.#intent, "terminal", {
        exitCode: 143,
        finishedAt: "2026-08-11T16:01:03.000Z",
      });
    }
  }

  public async kill(): Promise<void> {
    this.killCount += 1;
    this.inspection = inspectionFor(this.#intent, "terminal", {
      exitCode: 137,
      finishedAt: "2026-08-11T16:01:04.000Z",
    });
  }

  public async remove(): Promise<void> {
    this.removeCount += 1;
    this.inspection = null;
  }

  public finish(exitCode = 0): void {
    this.inspection = inspectionFor(this.#intent, "terminal", { exitCode });
  }
}

function prepare(intent: OciRunIntentV1) {
  return prepareOciRun(temporaryDirectory("factory-oci-hardening-runtime-"), intent);
}

function rewriteJson(path: string, mutate: (value: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

describe("runner P1 durable state hardening", () => {
  it("serializes reconcile and cancellation before create so cancellation cannot orphan a launch", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    let verificationEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      verificationEntered = resolve;
    });
    let releaseVerification!: () => void;
    engine.verificationGate = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    engine.onVerification = verificationEntered;
    const reconciling = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    const cancelling = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:02:11.000Z"),
    });

    const inFlight = reconciling.reconcile(prepared);
    await entered;
    await expect(cancelling.cancel(prepared)).rejects.toMatchObject({
      name: "OciRunnerBusyError",
      code: "OCI_RUN_BUSY",
      retryable: true,
    });
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);

    releaseVerification();
    await expect(inFlight).resolves.toEqual({ phase: "running", containerId: CONTAINER_ID });
    await expect(cancelling.cancel(prepared)).resolves.toMatchObject({
      phase: "removed",
      receipt: { outcome: "cancelled", terminationOrigin: "cancellation" },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.stopCount).toBe(1);
    expect(engine.removeCount).toBe(1);
    expect(engine.inspection).toBeNull();
  });

  it("fails closed and preserves a pre-existing operation lock for operator recovery", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const lockPath = join(prepared.paths.runDirectory, "operation.lock");
    writeFileSync(lockPath, "stale lock fixture\n", { flag: "wx", mode: 0o600 });
    const originalLock = readFileSync(lockPath);
    const runner = new OciRunner(engine);

    await expect(runner.reconcile(prepared)).rejects.toMatchObject({
      name: "OciRunnerBusyError",
      code: "OCI_RUN_BUSY",
      retryable: true,
    });
    await expect(runner.cancel(prepared)).rejects.toMatchObject({
      name: "OciRunnerBusyError",
      code: "OCI_RUN_BUSY",
      retryable: true,
    });
    expect(readFileSync(lockPath)).toEqual(originalLock);
    expect(engine.verifyCount).toBe(0);
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(0);
  });

  it("does not finalize cancellation or recreate while a dispatched create is not yet visible", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.createError = new Error("ambiguous create transport failure");
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    await expect(runner.reconcile(prepared)).rejects.toThrow(/ambiguous create transport/u);
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.inspection).toBeNull();
    const createAttemptPath = join(prepared.paths.runDirectory, "create-attempt.json");
    const originalCreateAttempt = readFileSync(createAttemptPath);
    await expect(runner.cancel(prepared)).rejects.toMatchObject({
      name: "OciRunnerCreatePendingError",
      code: "OCI_CREATE_PENDING",
      retryable: true,
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(0);
    expect(readFileSync(createAttemptPath)).toEqual(originalCreateAttempt);
    expect(() =>
      readFileSync(join(prepared.paths.runDirectory, "termination-request.json")),
    ).toThrow();
    expect(() =>
      readFileSync(join(prepared.paths.runDirectory, "pre-start-cancellation.json")),
    ).toThrow();

    engine.createError = null;
    engine.inspection = inspectionFor(intent, "created");
    await expect(runner.cancel(prepared)).resolves.toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "created", containerId: CONTAINER_ID },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(1);
    expect(engine.inspection).toBeNull();
    expect(readFileSync(createAttemptPath)).toEqual(originalCreateAttempt);
  });

  it("cancels planned work durably without creating or starting it", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    const first = await runner.cancel(prepared);
    expect(first).toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "planned", containerId: null },
    });
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(0);
    expect(await runner.reconcile(prepared)).toEqual(first);
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
  });

  it("cancels never-created work even when the pinned image is unavailable", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.failVerification = true;
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    await expect(runner.cancel(prepared)).resolves.toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "planned", containerId: null },
    });
    expect(engine.verifyCount).toBe(0);
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
  });

  it("cancels and removes a created container without ever starting it", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.inspection = inspectionFor(intent, "created");
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    const first = await runner.cancel(prepared);
    expect(first).toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "created", containerId: CONTAINER_ID },
    });
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(1);
    expect(await runner.cancel(prepared)).toEqual(first);
    expect(engine.removeCount).toBe(1);
    expect(engine.startCount).toBe(0);
  });

  it("recovers created pre-start cancellation after a lost successful remove response", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const createCrashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-create") throw new Error("injected create response boundary");
      },
    });

    await expect(createCrashing.reconcile(prepared)).rejects.toThrow(/create response boundary/u);
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.inspection?.status).toBe("created");

    const cancellationCrashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-remove") throw new Error("injected lost remove response");
      },
    });
    await expect(cancellationCrashing.cancel(prepared)).rejects.toThrow(/lost remove response/u);
    expect(engine.removeCount).toBe(1);
    expect(engine.inspection).toBeNull();

    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:12.000Z"),
    });
    await expect(recovered.cancel(prepared)).resolves.toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "created", containerId: CONTAINER_ID },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.removeCount).toBe(1);
    await expect(recovered.reconcile(prepared)).resolves.toMatchObject({
      phase: "cancelled-before-start",
      cancellation: { state: "created", containerId: CONTAINER_ID },
    });
  });

  it("recovers a crash after the launch marker and starts the same container once", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-launch-attempt") throw new Error("injected launch crash");
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected launch/u);
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });
    await expect(recovered.reconcile(prepared)).resolves.toEqual({
      phase: "running",
      containerId: CONTAINER_ID,
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("classifies an exit-zero terminal recovery beyond its immutable deadline as timed out", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-start") throw new Error("injected start response loss");
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected start response/u);
    engine.inspection = inspectionFor(intent, "terminal", {
      exitCode: 0,
      finishedAt: "2026-08-11T16:01:02.001Z",
    });
    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:01:03.000Z"),
    });
    await expect(recovered.reconcile(prepared)).resolves.toMatchObject({
      phase: "removed",
      receipt: { outcome: "timed-out", terminationOrigin: "wall-time", exitCode: 0 },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.stopCount).toBe(0);
    expect(engine.killCount).toBe(0);
    expect(engine.removeCount).toBe(1);
  });

  it("fails closed when a container disappears after its durable launch attempt", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-launch-attempt") throw new Error("injected launch crash");
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected launch/u);
    engine.inspection = null;
    const recovered = new OciRunner(engine);
    await expect(recovered.reconcile(prepared)).rejects.toThrow(/recreation is forbidden/u);
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
  });

  it.each([
    {
      name: "cancellation after request publication",
      origin: "cancellation" as const,
      boundary: "after-termination-request" as const,
      stopLeavesRunning: false,
      expectedOutcome: "cancelled",
      expectedStopAtCrash: 0,
      expectedKillAtCrash: 0,
    },
    {
      name: "wall timeout after stop response",
      origin: "wall-time" as const,
      boundary: "after-stop" as const,
      stopLeavesRunning: false,
      expectedOutcome: "timed-out",
      expectedStopAtCrash: 1,
      expectedKillAtCrash: 0,
    },
    {
      name: "cancellation after kill response",
      origin: "cancellation" as const,
      boundary: "after-kill" as const,
      stopLeavesRunning: true,
      expectedOutcome: "cancelled",
      expectedStopAtCrash: 1,
      expectedKillAtCrash: 1,
    },
  ])("recovers durable termination origin: $name", async (testCase) => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const initial = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await initial.reconcile(prepared);
    engine.stopLeavesRunning = testCase.stopLeavesRunning;
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:02:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === testCase.boundary) throw new Error(`injected ${testCase.boundary}`);
      },
    });

    const operation =
      testCase.origin === "cancellation" ? crashing.cancel(prepared) : crashing.reconcile(prepared);
    await expect(operation).rejects.toThrow(/injected/u);
    expect(engine.stopCount).toBe(testCase.expectedStopAtCrash);
    expect(engine.killCount).toBe(testCase.expectedKillAtCrash);
    engine.stopLeavesRunning = false;
    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:03:20.000Z"),
    });
    const result = await recovered.reconcile(prepared);
    expect(result).toMatchObject({
      phase: "removed",
      receipt: {
        outcome: testCase.expectedOutcome,
        terminationOrigin: testCase.origin,
      },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it.each(["receipt", "terminal", "removal", "removal-order", "stdout", "stderr"] as const)(
    "rejects tampered recovered %s evidence before engine mutation",
    async (target) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      const runner = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      });
      await runner.reconcile(prepared);
      engine.finish();
      await runner.reconcile(prepared);
      const mutationCounts = {
        create: engine.createCount,
        start: engine.startCount,
        stop: engine.stopCount,
        kill: engine.killCount,
        remove: engine.removeCount,
      };

      if (target === "receipt") {
        rewriteJson(prepared.paths.receiptPath, (value) => {
          value.intentDigest = `sha256:${"9".repeat(64)}`;
        });
      } else if (target === "terminal") {
        rewriteJson(prepared.paths.terminalInspectionPath, (value) => {
          value.exitCode = 1;
        });
      } else if (target === "removal") {
        rewriteJson(prepared.paths.removalPath, (value) => {
          value.observedAt = "2026-08-11T16:00:11.000Z";
        });
      } else if (target === "removal-order") {
        const value = JSON.parse(readFileSync(prepared.paths.removalPath, "utf8")) as Record<
          string,
          unknown
        >;
        writeFileSync(
          prepared.paths.removalPath,
          `${JSON.stringify(Object.fromEntries(Object.entries(value).reverse()))}\n`,
        );
      } else if (target === "stdout") {
        writeFileSync(prepared.paths.stdoutPath, "no\n");
      } else {
        writeFileSync(prepared.paths.stderrPath, "changed\n");
      }

      await expect(runner.reconcile(prepared)).rejects.toThrow();
      expect(engine.createCount).toBe(mutationCounts.create);
      expect(engine.startCount).toBe(mutationCounts.start);
      expect(engine.stopCount).toBe(mutationCounts.stop);
      expect(engine.killCount).toBe(mutationCounts.kill);
      expect(engine.removeCount).toBe(mutationCounts.remove);
    },
  );

  it("reuses removal evidence after a crash before receipt publication", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const initial = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await initial.reconcile(prepared);
    engine.finish();
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-removal-evidence") throw new Error("injected evidence crash");
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected evidence/u);
    const originalRemoval = readFileSync(prepared.paths.removalPath);
    expect(engine.removeCount).toBe(1);
    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T18:00:00.000Z"),
    });
    const result = await recovered.reconcile(prepared);
    expect(result).toMatchObject({
      phase: "removed",
      receipt: { removedAt: "2026-08-11T16:00:11.000Z" },
    });
    expect(readFileSync(prepared.paths.removalPath)).toEqual(originalRemoval);
    expect(engine.removeCount).toBe(1);
  });
});
