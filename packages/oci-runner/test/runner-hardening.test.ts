import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalJsonLine,
  OciRunner,
  labelsForOciRun,
  parseOciRunIntent,
  prepareOciRun,
  readOciEvidenceClosure,
  sha256Digest,
  type OciContainerInspection,
  type OciEnginePort,
  type OciImageIdentityV1,
  type OciLogCapture,
  type OciRunIntentV1,
} from "../src/index.js";

const CONTAINER_ID = "b".repeat(64);
const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const ENGINE_ID = `sha256:${"7".repeat(64)}`;
const OTHER_ENGINE_ID = `sha256:${"8".repeat(64)}`;
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
  public readonly engineIdentityDigest: string;
  public observedEngineIdentityDigest: string;
  public observedEngineIdentityDigests: string[] = [];
  public identityObservationError: Error | null = null;
  public identityObservationCount = 0;
  public inspection: OciContainerInspection | null = null;
  public failVerification = false;
  public createError: Error | null = null;
  public startErrorAfterMutation: Error | null = null;
  public inspectError: Error | null = null;
  public inspectFailureStatus: OciContainerInspection["status"] | "absent" | null = null;
  public startInspectionOverrides: Partial<OciContainerInspection> = {};
  public killErrorBeforeMutation: Error | null = null;
  public killErrorAfterMutation: Error | null = null;
  public removeErrorBeforeMutation: Error | null = null;
  public removeErrorAfterMutation: Error | null = null;
  public labelMatch: OciContainerInspection | null = null;
  public lastFindLabels: Readonly<Record<string, string>> | null = null;
  public onVerification: (() => void) | null = null;
  public verificationGate: Promise<void> | null = null;
  public verifyCount = 0;
  public createCount = 0;
  public startCount = 0;
  public stopCount = 0;
  public killCount = 0;
  public removeCount = 0;
  public findCount = 0;
  public inspectCount = 0;
  public stopLeavesRunning = false;
  public logsResult: OciLogCapture = {
    stdout: Buffer.from("ok\n"),
    stderr: Buffer.from("warn\n"),
    stdoutObservedBytes: 3,
    stderrObservedBytes: 5,
  };
  readonly #intent: OciRunIntentV1;

  public constructor(intent: OciRunIntentV1, engineIdentityDigest = ENGINE_ID) {
    this.#intent = intent;
    this.engineIdentityDigest = engineIdentityDigest;
    this.observedEngineIdentityDigest = engineIdentityDigest;
  }

  public async observeEngineIdentityDigest(): Promise<string> {
    this.identityObservationCount += 1;
    if (this.identityObservationError !== null) throw this.identityObservationError;
    return this.observedEngineIdentityDigests.shift() ?? this.observedEngineIdentityDigest;
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

  public async findByLabels(
    labels: Readonly<Record<string, string>>,
  ): Promise<OciContainerInspection | null> {
    this.findCount += 1;
    this.lastFindLabels = { ...labels };
    return this.labelMatch ?? this.inspection;
  }

  public async create(): Promise<string> {
    this.createCount += 1;
    if (this.createError !== null) throw this.createError;
    this.inspection = inspectionFor(this.#intent, "created");
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    this.inspectCount += 1;
    if (containerId !== CONTAINER_ID) throw new Error("wrong container");
    const status = this.inspection?.status ?? "absent";
    if (this.inspectError !== null && this.inspectFailureStatus === status) {
      const error = this.inspectError;
      this.inspectError = null;
      this.inspectFailureStatus = null;
      throw error;
    }
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.startCount += 1;
    this.inspection = inspectionFor(this.#intent, "running", this.startInspectionOverrides);
    if (this.startErrorAfterMutation !== null) throw this.startErrorAfterMutation;
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
    if (this.killErrorBeforeMutation !== null) throw this.killErrorBeforeMutation;
    if (this.inspection?.status !== "running") throw new Error("container is not running");
    this.inspection = inspectionFor(this.#intent, "terminal", {
      exitCode: 137,
      finishedAt: "2026-08-11T16:01:04.000Z",
    });
    if (this.killErrorAfterMutation !== null) throw this.killErrorAfterMutation;
  }

  public async remove(): Promise<void> {
    this.removeCount += 1;
    if (this.removeErrorBeforeMutation !== null) throw this.removeErrorBeforeMutation;
    if (this.inspection === null || this.inspection.status === "running") {
      throw new Error("container cannot be removed in its current state");
    }
    this.inspection = null;
    if (this.removeErrorAfterMutation !== null) throw this.removeErrorAfterMutation;
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

function engineObservations(engine: HardeningEngine): Readonly<Record<string, number>> {
  return {
    create: engine.createCount,
    start: engine.startCount,
    stop: engine.stopCount,
    kill: engine.killCount,
    remove: engine.removeCount,
    inspect: engine.inspectCount,
    find: engine.findCount,
  };
}

function runDirectorySnapshot(path: string): Readonly<Record<string, Buffer>> {
  return Object.fromEntries(
    readdirSync(path)
      .sort()
      .map((name) => [name, readFileSync(join(path, name))]),
  );
}

function expectCanonicalEvidenceClosure(
  closure: Awaited<ReturnType<typeof readOciEvidenceClosure>> & object,
): void {
  expect(closure.envelopeBytes).toEqual(canonicalJsonLine(closure.envelope));
  expect(closure.envelopeDigest).toBe(sha256Digest(closure.envelopeBytes));
  expect(closure.envelope.artifacts).toEqual(
    closure.artifacts.map(({ logicalName, mediaType, digest, byteLength }) => ({
      logicalName,
      mediaType,
      digest,
      byteLength,
    })),
  );
  for (const artifact of closure.artifacts) {
    expect(artifact.byteLength).toBe(artifact.bytes.byteLength);
    expect(artifact.digest).toBe(sha256Digest(artifact.bytes));
    if (artifact.mediaType === "application/json") {
      expect(canonicalJsonLine(JSON.parse(artifact.bytes.toString("utf8")) as unknown)).toEqual(
        artifact.bytes,
      );
    }
  }
}

function writeSyntheticQuarantine(
  prepared: ReturnType<typeof prepare>,
  quarantinedAt = "2026-08-11T16:00:12.000Z",
): void {
  const launchPath = join(prepared.paths.runDirectory, "launch-attempt.json");
  const engineBindingPath = join(prepared.paths.runDirectory, "engine-binding.json");
  const quarantinePath = join(prepared.paths.runDirectory, "quarantine.json");
  const quarantine = {
    schemaVersion: 1,
    runKey: prepared.intent.runKey,
    attemptId: prepared.intent.attemptId,
    runId: prepared.intent.runId,
    fence: prepared.intent.fence,
    intentDigest: prepared.intentDigest,
    containerId: CONTAINER_ID,
    engineBindingDigest: sha256Digest(readFileSync(engineBindingPath)),
    launchAttemptDigest: sha256Digest(readFileSync(launchPath)),
    reason: "inspect-ambiguous",
    quarantinedAt,
  };
  writeFileSync(quarantinePath, canonicalJsonLine(quarantine), { flag: "wx", mode: 0o600 });
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
        if (boundary === "after-post-start-attestation") {
          throw new Error("injected acknowledged start recovery boundary");
        }
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/acknowledged start recovery/u);
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

  it("quarantines an actual ambiguous start and reaps it without relaunch or receipt", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "quarantined",
      quarantine: {
        containerId: CONTAINER_ID,
        reason: "start-ambiguous",
      },
    });
    expect(engine.startCount).toBe(1);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine.json"))).toBe(true);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);

    const mutationCounts = {
      create: engine.createCount,
      start: engine.startCount,
      kill: engine.killCount,
      remove: engine.removeCount,
    };
    await expect(runner.reconcile(prepared)).resolves.toMatchObject({ phase: "quarantined" });
    await expect(runner.cancel(prepared)).resolves.toMatchObject({ phase: "quarantined" });
    expect(engine.createCount).toBe(mutationCounts.create);
    expect(engine.startCount).toBe(mutationCounts.start);
    expect(engine.killCount).toBe(mutationCounts.kill);
    expect(engine.removeCount).toBe(mutationCounts.remove);

    const reaper = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });
    const reaped = await reaper.reapQuarantined(prepared);
    expect(reaped).toMatchObject({
      phase: "quarantine-removed",
      removal: {
        containerId: CONTAINER_ID,
        containerAbsent: true,
        labelsAbsent: true,
      },
    });
    expect(engine.inspection).toBeNull();
    expect(engine.startCount).toBe(1);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);
    await expect(reaper.reconcile(prepared)).resolves.toEqual(reaped);
    await expect(reaper.reapQuarantined(prepared)).resolves.toEqual(reaped);
  });

  it("rejects a different Docker engine before reaping and proves exact labels on the bound engine", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const originalEngine = new HardeningEngine(intent);
    originalEngine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(originalEngine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);

    const differentEngine = new HardeningEngine(intent, OTHER_ENGINE_ID);
    await expect(
      new OciRunner(differentEngine, {
        now: () => new Date("2026-08-11T16:00:11.000Z"),
      }).reapQuarantined(prepared),
    ).rejects.toThrow(/engine identity differs/u);
    expect(engineObservations(differentEngine)).toEqual({
      create: 0,
      start: 0,
      stop: 0,
      kill: 0,
      remove: 0,
      inspect: 0,
      find: 0,
    });
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);

    await expect(
      new OciRunner(originalEngine, {
        now: () => new Date("2026-08-11T16:00:12.000Z"),
      }).reapQuarantined(prepared),
    ).resolves.toMatchObject({ phase: "quarantine-removed" });
    expect(originalEngine.lastFindLabels).toEqual(labelsForOciRun(intent));
  });

  it("rejects daemon identity drift before quarantine mutation", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.observedEngineIdentityDigest = OTHER_ENGINE_ID;
    const stableCounts = engineObservations(engine);

    await expect(
      new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:11.000Z"),
      }).reapQuarantined(prepared),
    ).rejects.toThrow(/engine identity changed/u);
    expect(engineObservations(engine)).toEqual(stableCounts);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);
  });

  it("rechecks daemon identity after absence before publishing quarantine closure", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.observedEngineIdentityDigests.push(ENGINE_ID, ENGINE_ID, ENGINE_ID, OTHER_ENGINE_ID);
    const reaper = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });

    await expect(reaper.reapQuarantined(prepared)).rejects.toMatchObject({
      code: "OCI_QUARANTINE_REAP_PENDING",
      retryable: true,
    });
    expect(engine.inspection).toBeNull();
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);

    await expect(reaper.reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
    });
    expect(engine.startCount).toBe(1);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);
  });

  it("checks daemon identity immediately before create without publishing a false dispatch", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.observedEngineIdentityDigests.push(ENGINE_ID, OTHER_ENGINE_ID);

    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await expect(runner.reconcile(prepared)).rejects.toThrow(/engine identity changed/u);
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);
    expect(existsSync(join(prepared.paths.runDirectory, "create-attempt.json"))).toBe(false);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine.json"))).toBe(false);

    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "running",
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("checks daemon identity immediately before start and quarantines without starting on drift", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.observedEngineIdentityDigests.push(ENGINE_ID, ENGINE_ID, OTHER_ENGINE_ID);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });

    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "quarantined",
      quarantine: { reason: "start-ambiguous" },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(0);
    expect(engine.inspection?.status).toBe("created");
    await expect(runner.reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
    });
    expect(engine.startCount).toBe(0);
  });

  it.each([
    {
      stage: "kill",
      observations: [ENGINE_ID, OTHER_ENGINE_ID],
      expectedKills: 0,
    },
    {
      stage: "remove",
      observations: [ENGINE_ID, ENGINE_ID, OTHER_ENGINE_ID],
      expectedKills: 1,
    },
  ])("checks daemon identity immediately before quarantine $stage", async (testCase) => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.observedEngineIdentityDigests.push(...testCase.observations);

    await expect(new OciRunner(engine).reapQuarantined(prepared)).rejects.toMatchObject({
      code: "OCI_QUARANTINE_REAP_PENDING",
      retryable: true,
    });
    expect(engine.killCount).toBe(testCase.expectedKills);
    expect(engine.removeCount).toBe(0);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);

    await expect(new OciRunner(engine).reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
    });
    expect(engine.startCount).toBe(1);
  });

  it.each([
    {
      stage: "stop",
      observations: [ENGINE_ID, OTHER_ENGINE_ID],
      stopLeavesRunning: false,
      expectedStops: 0,
    },
    {
      stage: "kill",
      observations: [ENGINE_ID, ENGINE_ID, OTHER_ENGINE_ID],
      stopLeavesRunning: true,
      expectedStops: 1,
    },
  ])("checks daemon identity immediately before normal $stage", async (testCase) => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.stopLeavesRunning = testCase.stopLeavesRunning;
    engine.observedEngineIdentityDigests.push(...testCase.observations);

    await expect(runner.cancel(prepared)).rejects.toThrow(/engine identity changed/u);
    expect(engine.stopCount).toBe(testCase.expectedStops);
    expect(engine.killCount).toBe(0);
    expect(engine.removeCount).toBe(0);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);

    engine.stopLeavesRunning = false;
    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "removed",
      receipt: { outcome: "cancelled", terminationOrigin: "cancellation" },
    });
  });

  it("checks daemon identity immediately before normal terminal removal", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    engine.observedEngineIdentityDigests.push(ENGINE_ID, OTHER_ENGINE_ID);

    await expect(runner.reconcile(prepared)).rejects.toThrow(/engine identity changed/u);
    expect(engine.removeCount).toBe(0);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);

    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "removed",
      receipt: { outcome: "succeeded" },
    });
    expect(engine.removeCount).toBe(1);
  });

  it.each([
    { boundary: "after-start-dispatched" as const, expectedStarts: 0 },
    { boundary: "after-start" as const, expectedStarts: 1 },
  ])(
    "never reissues an unacknowledged start after $boundary",
    async ({ boundary, expectedStarts }) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      const crashing = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
        afterBoundary: (observed) => {
          if (observed === boundary) throw new Error(`injected ${boundary}`);
        },
      });

      await expect(crashing.reconcile(prepared)).rejects.toThrow(`injected ${boundary}`);
      expect(engine.startCount).toBe(expectedStarts);
      const recovered = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:11.000Z"),
      });
      await expect(recovered.reconcile(prepared)).resolves.toMatchObject({
        phase: "quarantined",
        quarantine: { reason: "start-ambiguous", containerId: CONTAINER_ID },
      });
      expect(engine.startCount).toBe(expectedStarts);
      await expect(recovered.reapQuarantined(prepared)).resolves.toMatchObject({
        phase: "quarantine-removed",
      });
      expect(engine.startCount).toBe(expectedStarts);
      expect(existsSync(prepared.paths.receiptPath)).toBe(false);
    },
  );

  it("clamps quarantine time when the clock regresses across an ambiguous start", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start with a regressed clock");
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T15:59:59.000Z"),
    });

    await expect(runner.reconcile(prepared)).resolves.toMatchObject({
      phase: "quarantined",
      quarantine: {
        reason: "start-ambiguous",
        quarantinedAt: intent.createdAt,
      },
    });
    expect(engine.startCount).toBe(1);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine.json"))).toBe(true);
  });

  it("can quarantine and reap a terminal post-start acknowledgement after later inspection ambiguity", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startInspectionOverrides = {
      status: "terminal",
      running: false,
      finishedAt: "2026-08-11T16:00:03.000Z",
      exitCode: 0,
    };
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-post-start-attestation") {
          throw new Error("injected terminal acknowledgement crash");
        }
      },
    });

    await expect(crashing.reconcile(prepared)).rejects.toThrow(/terminal acknowledgement crash/u);
    engine.inspectError = new Error("terminal inspection transport failure");
    engine.inspectFailureStatus = "terminal";
    const recovered = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });
    await expect(recovered.reconcile(prepared)).resolves.toMatchObject({
      phase: "quarantined",
      quarantine: { reason: "inspect-ambiguous" },
    });
    await expect(recovered.reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
    });
    expect(engine.startCount).toBe(1);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);
  });

  it("quarantines actual post-launch inspect and isolation-attestation failures", async () => {
    for (const failure of ["inspect", "attestation"] as const) {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      if (failure === "inspect") {
        engine.inspectError = new Error("ambiguous inspect response");
        engine.inspectFailureStatus = "running";
      } else {
        engine.startInspectionOverrides = { networkMode: "bridge" };
      }
      const runner = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      });

      await expect(runner.reconcile(prepared)).resolves.toMatchObject({
        phase: "quarantined",
        quarantine: {
          reason: failure === "inspect" ? "inspect-ambiguous" : "attestation-failed",
        },
      });
      expect(engine.startCount).toBe(1);
      await expect(
        new OciRunner(engine, {
          now: () => new Date("2026-08-11T16:00:11.000Z"),
        }).reapQuarantined(prepared),
      ).resolves.toMatchObject({ phase: "quarantine-removed" });
      expect(engine.inspection).toBeNull();
      expect(existsSync(prepared.paths.receiptPath)).toBe(false);
    }
  });

  it("accepts lost reaper mutation responses only after exact absence proofs", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    const initial = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await initial.reconcile(prepared);
    engine.killErrorAfterMutation = new Error("lost kill response");
    engine.removeErrorAfterMutation = new Error("lost remove response");

    const reaper = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });
    await expect(reaper.reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
      removal: { containerAbsent: true, labelsAbsent: true },
    });
    expect(engine.killCount).toBe(1);
    expect(engine.removeCount).toBe(1);
  });

  it("keeps reaping retryable until exact-ID and exact-label absence are both observable", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.inspectError = new Error("daemon inspect unavailable");
    engine.inspectFailureStatus = "absent";

    const reaper = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    });
    await expect(reaper.reapQuarantined(prepared)).rejects.toMatchObject({
      code: "OCI_QUARANTINE_REAP_PENDING",
      retryable: true,
    });
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);

    engine.labelMatch = inspectionFor(intent, "terminal", { exitCode: 137 });
    await expect(reaper.reapQuarantined(prepared)).rejects.toMatchObject({
      code: "OCI_QUARANTINE_REAP_PENDING",
    });
    engine.labelMatch = null;
    await expect(reaper.reapQuarantined(prepared)).resolves.toMatchObject({
      phase: "quarantine-removed",
    });
  });

  it("keeps quarantine open when failed kill and remove leave the exact container alive", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.killErrorBeforeMutation = new Error("kill rejected before effect");
    engine.removeErrorBeforeMutation = new Error("remove rejected before effect");

    await expect(
      new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:11.000Z"),
      }).reapQuarantined(prepared),
    ).rejects.toMatchObject({
      code: "OCI_QUARANTINE_REAP_PENDING",
      retryable: true,
    });
    expect(engine.inspection?.status).toBe("running");
    expect(engine.killCount).toBe(1);
    expect(engine.removeCount).toBe(1);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);
  });

  it.each([
    { boundary: "after-quarantine" as const, transitionBoundary: true },
    { boundary: "after-quarantine-reap-request" as const, transitionBoundary: false },
    { boundary: "after-quarantine-kill" as const, transitionBoundary: false },
    { boundary: "after-quarantine-remove" as const, transitionBoundary: false },
    { boundary: "after-quarantine-absence" as const, transitionBoundary: false },
  ])(
    "recovers $boundary without relaunching or publishing a normal receipt",
    async ({ boundary, transitionBoundary }) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      engine.startErrorAfterMutation = new Error("ambiguous start transport failure");

      if (transitionBoundary) {
        const crashingTransition = new OciRunner(engine, {
          now: () => new Date("2026-08-11T16:00:10.000Z"),
          afterBoundary: (observed) => {
            if (observed === boundary) throw new Error(`injected ${boundary}`);
          },
        });
        await expect(crashingTransition.reconcile(prepared)).rejects.toThrow(
          `injected ${boundary}`,
        );
        await expect(new OciRunner(engine).reconcile(prepared)).resolves.toMatchObject({
          phase: "quarantined",
        });
      } else {
        await new OciRunner(engine, {
          now: () => new Date("2026-08-11T16:00:10.000Z"),
        }).reconcile(prepared);
        const crashingReaper = new OciRunner(engine, {
          now: () => new Date("2026-08-11T16:00:11.000Z"),
          afterBoundary: (observed) => {
            if (observed === boundary) throw new Error(`injected ${boundary}`);
          },
        });
        await expect(crashingReaper.reapQuarantined(prepared)).rejects.toThrow(
          `injected ${boundary}`,
        );
      }

      const recovered = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:12.000Z"),
      });
      const result = await recovered.reapQuarantined(prepared);
      expect(result).toMatchObject({
        phase: "quarantine-removed",
        removal: { containerAbsent: true, labelsAbsent: true },
      });
      expect(engine.startCount).toBe(1);
      expect(existsSync(prepared.paths.receiptPath)).toBe(false);

      const stableCounts = engineObservations(engine);
      await expect(recovered.reconcile(prepared)).resolves.toEqual(result);
      await expect(recovered.cancel(prepared)).resolves.toEqual(result);
      await expect(recovered.reapQuarantined(prepared)).resolves.toEqual(result);
      expect(engineObservations(engine)).toEqual(stableCounts);
    },
  );

  it.each(["identity", "digest", "timestamp", "unknown"] as const)(
    "rejects tampered quarantine %s evidence before engine observation",
    async (target) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
      const runner = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      });
      await runner.reconcile(prepared);
      const quarantinePath = join(prepared.paths.runDirectory, "quarantine.json");
      rewriteJson(quarantinePath, (value) => {
        if (target === "identity") {
          value.runId = "55555555-5555-4555-8555-555555555555";
        } else if (target === "digest") {
          value.engineBindingDigest = `sha256:${"9".repeat(64)}`;
        } else if (target === "timestamp") {
          value.quarantinedAt = "2026-08-11T15:59:59.000Z";
        } else {
          value.unexpected = true;
        }
      });
      const stableCounts = engineObservations(engine);

      await expect(runner.reconcile(prepared)).rejects.toThrow();
      await expect(runner.reapQuarantined(prepared)).rejects.toThrow();
      expect(engineObservations(engine)).toEqual(stableCounts);
    },
  );

  it.each(["container", "digest", "timestamp", "unknown"] as const)(
    "rejects tampered quarantine reap-request %s evidence before engine observation",
    async (target) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
      await new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      }).reconcile(prepared);
      const crashing = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:11.000Z"),
        afterBoundary: (boundary) => {
          if (boundary === "after-quarantine-reap-request") {
            throw new Error("injected reap request crash");
          }
        },
      });
      await expect(crashing.reapQuarantined(prepared)).rejects.toThrow(/reap request crash/u);
      const requestPath = join(prepared.paths.runDirectory, "quarantine-reap-request.json");
      rewriteJson(requestPath, (value) => {
        if (target === "container") {
          value.containerId = "c".repeat(64);
        } else if (target === "digest") {
          value.quarantineDigest = `sha256:${"9".repeat(64)}`;
        } else if (target === "timestamp") {
          value.requestedAt = "2026-08-11T15:59:59.000Z";
        } else {
          value.unexpected = true;
        }
      });
      const stableCounts = engineObservations(engine);

      await expect(new OciRunner(engine).reconcile(prepared)).rejects.toThrow();
      await expect(new OciRunner(engine).reapQuarantined(prepared)).rejects.toThrow();
      expect(engineObservations(engine)).toEqual(stableCounts);
    },
  );

  it.each(["absence", "digest", "timestamp", "unknown"] as const)(
    "rejects tampered quarantine removal %s evidence before engine observation",
    async (target) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
      const runner = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      });
      await runner.reconcile(prepared);
      await runner.reapQuarantined(prepared);
      const removalPath = join(prepared.paths.runDirectory, "quarantine-removed.json");
      rewriteJson(removalPath, (value) => {
        if (target === "absence") {
          value.containerAbsent = false;
        } else if (target === "digest") {
          value.reapRequestDigest = `sha256:${"9".repeat(64)}`;
        } else if (target === "timestamp") {
          value.observedAt = "2026-08-11T15:59:59.000Z";
        } else {
          value.unexpected = true;
        }
      });
      const stableCounts = engineObservations(engine);

      await expect(runner.reconcile(prepared)).rejects.toThrow();
      await expect(runner.reapQuarantined(prepared)).rejects.toThrow();
      expect(engineObservations(engine)).toEqual(stableCounts);
    },
  );

  it("rejects quarantine that conflicts with terminal output and receipt evidence", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    await runner.reconcile(prepared);
    writeSyntheticQuarantine(prepared);
    const stableCounts = engineObservations(engine);

    await expect(runner.reconcile(prepared)).rejects.toThrow(/conflict/u);
    await expect(runner.reapQuarantined(prepared)).rejects.toThrow(/conflict/u);
    expect(engineObservations(engine)).toEqual(stableCounts);
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
    await expect(recovered.reconcile(prepared)).resolves.toMatchObject({
      phase: "quarantined",
      quarantine: { reason: "container-disappeared", containerId: CONTAINER_ID },
    });
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

describe("read-only OCI evidence closure", () => {
  it("exports one canonical removed closure with the complete ordered lifecycle chain", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    await runner.reconcile(prepared);
    const beforeFiles = runDirectorySnapshot(prepared.paths.runDirectory);
    const beforeEngine = engineObservations(engine);

    const closure = await readOciEvidenceClosure(prepared);
    if (closure === null) throw new Error("Expected a removed OCI evidence closure");
    expectCanonicalEvidenceClosure(closure);
    expect(closure.envelope).toMatchObject({
      schemaVersion: 1,
      phase: "removed",
      runKey: intent.runKey,
      attemptId: intent.attemptId,
      runId: intent.runId,
      fence: intent.fence,
      taskSpecDigest: intent.taskSpecDigest,
      policyDigest: intent.policyDigest,
      baseCommit: intent.baseCommit,
      baseTree: intent.baseTree,
      intentDigest: prepared.intentDigest,
      engineIdentityDigest: ENGINE_ID,
      imageReference: intent.image.reference,
      imageId: intent.image.imageId,
      containerId: CONTAINER_ID,
    });
    expect(closure.artifacts.map(({ logicalName }) => logicalName)).toEqual([
      "intent.json",
      "engine-binding.json",
      "create-attempt.json",
      "created.inspect.json",
      "launch-attempt.json",
      "start-dispatched.json",
      "post-start.inspect.json",
      "post-start-attested.json",
      "running.inspect.json",
      "terminal.inspect.json",
      "stdout.bin",
      "stderr.bin",
      "terminal.json",
      "removed.json",
      "receipt.json",
    ]);

    const replay = await readOciEvidenceClosure(prepared);
    expect(replay).toEqual(closure);
    expect(engineObservations(engine)).toEqual(beforeEngine);
    expect(runDirectorySnapshot(prepared.paths.runDirectory)).toEqual(beforeFiles);
  });

  it("exports disjoint quarantined and quarantine-removed closures without normal output", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await expect(runner.reconcile(prepared)).resolves.toMatchObject({ phase: "quarantined" });
    const quarantinedFiles = runDirectorySnapshot(prepared.paths.runDirectory);
    const quarantinedEngine = engineObservations(engine);

    const quarantined = await readOciEvidenceClosure(prepared);
    if (quarantined === null) throw new Error("Expected a quarantined OCI evidence closure");
    expectCanonicalEvidenceClosure(quarantined);
    expect(quarantined.envelope.phase).toBe("quarantined");
    expect(quarantined.artifacts.map(({ logicalName }) => logicalName)).toEqual([
      "intent.json",
      "engine-binding.json",
      "create-attempt.json",
      "created.inspect.json",
      "launch-attempt.json",
      "start-dispatched.json",
      "quarantine.json",
    ]);
    expect(
      quarantined.artifacts.some(({ logicalName }) =>
        ["stdout.bin", "stderr.bin", "terminal.json", "removed.json", "receipt.json"].includes(
          logicalName,
        ),
      ),
    ).toBe(false);
    expect(engineObservations(engine)).toEqual(quarantinedEngine);
    expect(runDirectorySnapshot(prepared.paths.runDirectory)).toEqual(quarantinedFiles);

    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
    }).reapQuarantined(prepared);
    const reapedFiles = runDirectorySnapshot(prepared.paths.runDirectory);
    const reapedEngine = engineObservations(engine);
    const reaped = await readOciEvidenceClosure(prepared);
    if (reaped === null) throw new Error("Expected a quarantine-removed OCI evidence closure");
    expectCanonicalEvidenceClosure(reaped);
    expect(reaped.envelope.phase).toBe("quarantine-removed");
    expect(reaped.artifacts.map(({ logicalName }) => logicalName)).toEqual([
      "intent.json",
      "engine-binding.json",
      "create-attempt.json",
      "created.inspect.json",
      "launch-attempt.json",
      "start-dispatched.json",
      "quarantine.json",
      "quarantine-reap-request.json",
      "quarantine-removed.json",
    ]);
    expect(existsSync(prepared.paths.receiptPath)).toBe(false);
    expect(engineObservations(engine)).toEqual(reapedEngine);
    expect(runDirectorySnapshot(prepared.paths.runDirectory)).toEqual(reapedFiles);
  });

  it("rejects running evidence without a durable running start attestation", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startErrorAfterMutation = new Error("ambiguous start transport failure");
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    if (engine.inspection === null) throw new Error("Expected the ambiguous start to have run");
    writeFileSync(prepared.paths.runningInspectionPath, canonicalJsonLine(engine.inspection), {
      flag: "wx",
      mode: 0o600,
    });
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow(/running.*attestation/iu);
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });

  it("rejects a running snapshot after a terminal post-start acknowledgement", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    engine.startInspectionOverrides = {
      status: "terminal",
      running: false,
      finishedAt: "2026-08-11T16:00:03.000Z",
      exitCode: 0,
    };
    await expect(
      new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      }).reconcile(prepared),
    ).resolves.toMatchObject({ phase: "removed" });
    writeFileSync(
      prepared.paths.runningInspectionPath,
      canonicalJsonLine(inspectionFor(intent, "running")),
      { flag: "wx", mode: 0o600 },
    );
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow(/running.*attestation/iu);
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });

  it("returns no closure for a valid running lifecycle without mutating it", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    const beforeFiles = runDirectorySnapshot(prepared.paths.runDirectory);
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).resolves.toBeNull();
    expect(engineObservations(engine)).toEqual(beforeEngine);
    expect(runDirectorySnapshot(prepared.paths.runDirectory)).toEqual(beforeFiles);
  });

  it("fails closed on an operation lock without observing or mutating the engine", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    await new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    }).reconcile(prepared);
    engine.finish();
    await new OciRunner(engine).reconcile(prepared);
    const lockPath = join(prepared.paths.runDirectory, "operation.lock");
    writeFileSync(lockPath, "owned elsewhere\n", { flag: "wx", mode: 0o600 });
    const beforeEngine = engineObservations(engine);
    const lockBytes = readFileSync(lockPath);

    await expect(readOciEvidenceClosure(prepared)).rejects.toMatchObject({
      name: "OciRunnerBusyError",
      code: "OCI_RUN_BUSY",
      retryable: true,
    });
    expect(engineObservations(engine)).toEqual(beforeEngine);
    expect(readFileSync(lockPath)).toEqual(lockBytes);
  });

  it.each(["create-attempt.json", "start-dispatched.json", "post-start-attested.json"])(
    "rejects removed evidence missing required lifecycle artifact %s",
    async (artifactName) => {
      const intent = fixtureIntent();
      const prepared = prepare(intent);
      const engine = new HardeningEngine(intent);
      const runner = new OciRunner(engine, {
        now: () => new Date("2026-08-11T16:00:10.000Z"),
      });
      await runner.reconcile(prepared);
      engine.finish();
      await runner.reconcile(prepared);
      rmSync(join(prepared.paths.runDirectory, artifactName));
      const beforeEngine = engineObservations(engine);

      await expect(readOciEvidenceClosure(prepared)).rejects.toThrow();
      expect(engineObservations(engine)).toEqual(beforeEngine);
    },
  );

  it("rejects a running termination closure missing its running inspection", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    await expect(runner.cancel(prepared)).resolves.toMatchObject({ phase: "removed" });
    rmSync(prepared.paths.runningInspectionPath);
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow(/termination.*execution/iu);
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });

  it("rejects a forged PreparedOciRun path before reading closure artifacts", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const forged = {
      ...prepared,
      paths: {
        ...prepared.paths,
        receiptPath: join(prepared.paths.runDirectory, "forged-receipt.json"),
      },
    };
    const beforeFiles = runDirectorySnapshot(prepared.paths.runDirectory);

    await expect(readOciEvidenceClosure(forged)).rejects.toThrow(/identity/u);
    expect(runDirectorySnapshot(prepared.paths.runDirectory)).toEqual(beforeFiles);
  });

  it("rejects a partial final lifecycle instead of treating it as merely in progress", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    await runner.reconcile(prepared);
    rmSync(prepared.paths.receiptPath);
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow(/partial|final|receipt/iu);
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });

  it.each([
    {
      name: "engine binding unknown field",
      mutate: (prepared: ReturnType<typeof prepare>) =>
        rewriteJson(join(prepared.paths.runDirectory, "engine-binding.json"), (value) => {
          value.unexpected = true;
        }),
    },
    {
      name: "captured stdout bytes",
      mutate: (prepared: ReturnType<typeof prepare>) =>
        writeFileSync(prepared.paths.stdoutPath, "tampered\n"),
    },
    {
      name: "running inspection execution time",
      mutate: (prepared: ReturnType<typeof prepare>) =>
        rewriteJson(prepared.paths.runningInspectionPath, (value) => {
          value.startedAt = "2026-08-11T16:00:02.500Z";
        }),
    },
  ])("rejects tampered closure evidence without engine mutation: $name", async (testCase) => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    await runner.reconcile(prepared);
    testCase.mutate(prepared);
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow();
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });

  it("rejects a quarantine closure that conflicts with normal terminal evidence", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new HardeningEngine(intent);
    const runner = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
    });
    await runner.reconcile(prepared);
    engine.finish();
    await runner.reconcile(prepared);
    writeSyntheticQuarantine(prepared);
    const beforeEngine = engineObservations(engine);

    await expect(readOciEvidenceClosure(prepared)).rejects.toThrow(/conflict/u);
    expect(engineObservations(engine)).toEqual(beforeEngine);
  });
});
