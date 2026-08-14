import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  type OciRunnerEffectGuards,
} from "../src/index.js";

const CONTAINER_ID = "c".repeat(64);
const ENGINE_ID = `sha256:${"7".repeat(64)}`;
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
  const worktree = temporaryDirectory("factory-oci-guard-worktree-");
  mkdirSync(join(worktree, "Sources"));
  writeFileSync(join(worktree, "Sources", "App.swift"), "struct App {}\n");
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey: "guard-55555555-f3",
    attemptId: "55555555-5555-4555-8555-555555555555",
    runId: "66666666-6666-4666-8666-666666666666",
    fence: 3,
    createdAt: "2026-08-11T18:00:00.000Z",
    taskSpecDigest: `sha256:${"3".repeat(64)}`,
    policyDigest: `sha256:${"4".repeat(64)}`,
    baseCommit: "5".repeat(40),
    baseTree: "6".repeat(40),
    containerName: "app-factory-guard-55555555-f3",
    image: {
      reference: `factory/codex@sha256:${"2".repeat(64)}`,
      imageId: `sha256:${"1".repeat(64)}`,
    },
    worktreeHostPath: worktree,
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: "/usr/local/bin/codex",
    agentArguments: ["exec", "--json", "-"],
    environment: [{ name: "TZ", value: "UTC" }],
    limits: {
      cpuCount: 2,
      memoryBytes: 1_073_741_824,
      pidLimit: 128,
      outputBytesPerStream: 1_024,
      wallTimeMs: 60_000,
      stopGraceMs: 1_000,
      privateTmpfsBytes: 67_108_864,
    },
  });
}

function inspectionFor(
  intent: OciRunIntentV1,
  status: "created" | "running" | "terminal",
): OciContainerInspection {
  return {
    containerId: CONTAINER_ID,
    name: intent.containerName,
    imageId: intent.image.imageId,
    labels: labelsForOciRun(intent),
    user: "10001:10001",
    command: [intent.agentExecutable, ...intent.agentArguments],
    entrypoint: null,
    workingDirectory: intent.worktreeContainerPath,
    environment: intent.environment.map(({ name, value }) => `${name}=${value}`),
    status,
    createdAt: "2026-08-11T18:00:01.000Z",
    startedAt: status === "created" ? null : "2026-08-11T18:00:02.000Z",
    finishedAt: status === "terminal" ? "2026-08-11T18:00:03.000Z" : null,
    exitCode: status === "terminal" ? 0 : null,
    oomKilled: false,
    running: status === "running",
    readOnlyRootFilesystem: true,
    networkMode: "none",
    capDrop: ["ALL"],
    securityOptions: ["no-new-privileges=true"],
    memoryBytes: intent.limits.memoryBytes,
    memorySwapBytes: intent.limits.memoryBytes,
    pidLimit: intent.limits.pidLimit,
    cpuNanoCount: intent.limits.cpuCount * 1_000_000_000,
    stopTimeoutSeconds: 1,
    privileged: false,
    tmpfs: {
      "/run/app-factory": `rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    },
    logDriver: "local",
    logOptions: { "max-size": "1024b", "max-file": "1", compress: "false" },
    mounts: [
      {
        type: "bind",
        source: intent.worktreeHostPath,
        destination: intent.worktreeContainerPath,
        readWrite: true,
      },
    ],
  };
}

class GuardEngine implements OciEnginePort {
  public readonly engineIdentityDigest = ENGINE_ID;
  public readonly trace: string[] = [];
  public inspection: OciContainerInspection | null = null;
  public createCount = 0;
  public startCount = 0;
  public stopCount = 0;
  public killCount = 0;
  public removeCount = 0;
  public stopLeavesRunning = false;
  public startFailsAfterMutation = false;
  public onVerify: (() => void) | null = null;
  public onCreate: (() => void) | null = null;
  public onInspect: (() => void) | null = null;

  public constructor(private readonly intent: OciRunIntentV1) {}

  public async observeEngineIdentityDigest(): Promise<string> {
    this.trace.push("observe-engine");
    return this.engineIdentityDigest;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    this.trace.push("verify-image");
    if (
      image.reference !== this.intent.image.reference ||
      image.imageId !== this.intent.image.imageId
    ) {
      throw new Error("wrong image");
    }
    this.onVerify?.();
  }

  public async findByLabels(): Promise<OciContainerInspection | null> {
    this.trace.push("find");
    return this.inspection;
  }

  public async create(): Promise<string> {
    this.trace.push("create");
    this.createCount += 1;
    this.inspection = inspectionFor(this.intent, "created");
    this.onCreate?.();
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    this.trace.push("inspect");
    if (containerId !== CONTAINER_ID) throw new Error("wrong container");
    this.onInspect?.();
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.trace.push("start");
    this.startCount += 1;
    this.inspection = inspectionFor(this.intent, "running");
    if (this.startFailsAfterMutation) throw new Error("ambiguous start response");
  }

  public async logs(): Promise<OciLogCapture> {
    this.trace.push("logs");
    return {
      stdout: Buffer.from("ok\n"),
      stderr: Buffer.alloc(0),
      stdoutObservedBytes: 3,
      stderrObservedBytes: 0,
    };
  }

  public async stop(): Promise<void> {
    this.trace.push("stop");
    this.stopCount += 1;
    if (!this.stopLeavesRunning) this.inspection = inspectionFor(this.intent, "terminal");
  }

  public async kill(): Promise<void> {
    this.trace.push("kill");
    this.killCount += 1;
    this.inspection = inspectionFor(this.intent, "terminal");
  }

  public async remove(): Promise<void> {
    this.trace.push("remove");
    this.removeCount += 1;
    this.inspection = null;
  }
}

type MutableAuthority = { execution: boolean; cleanup: boolean; cleanupChecks: number };

function guarded(authority: MutableAuthority, trace: string[]): OciRunnerEffectGuards {
  return {
    assertExecutionActive: async () => {
      trace.push("guard:execution");
      if (!authority.execution) throw new Error("execution authority lost");
    },
    assertCleanupActive: async () => {
      authority.cleanupChecks += 1;
      trace.push("guard:cleanup");
      if (!authority.cleanup) throw new Error("cleanup authority lost");
    },
  };
}

function preparedFixture(): Readonly<{
  intent: OciRunIntentV1;
  engine: GuardEngine;
  runner: OciRunner;
  prepared: ReturnType<typeof prepareOciRun>;
}> {
  const intent = fixtureIntent();
  const engine = new GuardEngine(intent);
  const prepared = prepareOciRun(temporaryDirectory("factory-oci-guard-runtime-"), intent);
  const runner = new OciRunner(engine, {
    now: () => new Date("2026-08-11T18:00:10.000Z"),
  });
  return { intent, engine, prepared, runner };
}

function assertImmediatelyGuarded(
  trace: readonly string[],
  mutation: "create" | "start" | "stop" | "kill" | "remove",
  guard: "guard:execution" | "guard:cleanup",
): void {
  const indexes = trace.flatMap((entry, index) => (entry === mutation ? [index] : []));
  expect(indexes.length, `${mutation} must occur`).toBeGreaterThan(0);
  for (const index of indexes) expect(trace[index - 1], `${mutation} guard`).toBe(guard);
}

describe("OCI effect-level authority guards", () => {
  it.each([
    { boundary: "verify", expectedCreate: 0 },
    { boundary: "create", expectedCreate: 1 },
    { boundary: "inspect", expectedCreate: 1 },
  ] as const)(
    "loses authority during $boundary and dispatches no subsequent create or start",
    async ({ boundary, expectedCreate }) => {
      const { engine, runner, prepared } = preparedFixture();
      const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
      if (boundary === "verify") engine.onVerify = () => (authority.execution = false);
      if (boundary === "create") engine.onCreate = () => (authority.execution = false);
      if (boundary === "inspect") engine.onInspect = () => (authority.execution = false);

      await expect(runner.reconcile(prepared, guarded(authority, engine.trace))).rejects.toThrow(
        /execution authority lost/u,
      );

      expect(engine.createCount).toBe(expectedCreate);
      expect(engine.startCount).toBe(0);
      expect(existsSync(join(prepared.paths.runDirectory, "start-dispatched.json"))).toBe(false);
      expect(existsSync(join(prepared.paths.runDirectory, "quarantine.json"))).toBe(false);
      expect(existsSync(join(prepared.paths.runDirectory, "create-attempt.json"))).toBe(
        expectedCreate === 1,
      );
    },
  );

  it("lets the current lease cancel and remove a running container", async () => {
    const { engine, runner, prepared } = preparedFixture();
    const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
    const guards = guarded(authority, engine.trace);
    await expect(runner.reconcile(prepared, guards)).resolves.toMatchObject({ phase: "running" });

    await expect(runner.cancel(prepared, guards)).resolves.toMatchObject({
      phase: "removed",
      receipt: { outcome: "cancelled", terminationOrigin: "cancellation" },
    });
    expect(engine.stopCount).toBe(1);
    expect(engine.removeCount).toBe(1);
    expect(authority.cleanupChecks).toBe(3);
  });

  it("cannot persist cancellation or remove after cleanup lease authority is lost", async () => {
    const { engine, runner, prepared } = preparedFixture();
    const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
    const guards = guarded(authority, engine.trace);
    await runner.reconcile(prepared, guards);
    authority.cleanup = false;

    await expect(runner.cancel(prepared, guards)).rejects.toThrow(/cleanup authority lost/u);
    expect(engine.stopCount).toBe(0);
    expect(engine.killCount).toBe(0);
    expect(engine.removeCount).toBe(0);
    expect(existsSync(join(prepared.paths.runDirectory, "termination-request.json"))).toBe(false);
  });

  it("persists an authorized cancellation request but performs no stop after later lease loss", async () => {
    const { engine, runner, prepared } = preparedFixture();
    const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
    const guards: OciRunnerEffectGuards = {
      assertExecutionActive: async () => {
        engine.trace.push("guard:execution");
      },
      assertCleanupActive: async () => {
        authority.cleanupChecks += 1;
        engine.trace.push("guard:cleanup");
        if (authority.cleanupChecks > 1) throw new Error("cleanup authority lost");
      },
    };
    await runner.reconcile(prepared, guards);

    await expect(runner.cancel(prepared, guards)).rejects.toThrow(/cleanup authority lost/u);
    expect(existsSync(join(prepared.paths.runDirectory, "termination-request.json"))).toBe(true);
    expect(engine.stopCount).toBe(0);
    expect(engine.killCount).toBe(0);
    expect(engine.removeCount).toBe(0);
  });

  it("guards every create/start/stop/kill/remove engine mutation with the correct authority", async () => {
    const { engine, runner, prepared } = preparedFixture();
    engine.stopLeavesRunning = true;
    const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
    const guards = guarded(authority, engine.trace);

    await runner.reconcile(prepared, guards);
    await expect(runner.cancel(prepared, guards)).resolves.toMatchObject({ phase: "removed" });

    assertImmediatelyGuarded(engine.trace, "create", "guard:execution");
    assertImmediatelyGuarded(engine.trace, "start", "guard:execution");
    assertImmediatelyGuarded(engine.trace, "stop", "guard:cleanup");
    assertImmediatelyGuarded(engine.trace, "kill", "guard:cleanup");
    assertImmediatelyGuarded(engine.trace, "remove", "guard:cleanup");
  });

  it("rechecks cleanup authority before each quarantine reaper mutation", async () => {
    const { engine, runner, prepared } = preparedFixture();
    const authority: MutableAuthority = { execution: true, cleanup: true, cleanupChecks: 0 };
    const executionGuards = guarded(authority, engine.trace);
    engine.startFailsAfterMutation = true;
    await expect(runner.reconcile(prepared, executionGuards)).resolves.toMatchObject({
      phase: "quarantined",
    });
    authority.cleanupChecks = 0;
    const reaperGuards: OciRunnerEffectGuards = {
      assertExecutionActive: executionGuards.assertExecutionActive,
      assertCleanupActive: async () => {
        authority.cleanupChecks += 1;
        engine.trace.push("guard:cleanup");
        if (authority.cleanupChecks === 3) throw new Error("cleanup authority lost");
      },
    };

    await expect(runner.reapQuarantined(prepared, reaperGuards)).rejects.toThrow(
      /cleanup authority lost/u,
    );
    expect(engine.killCount).toBe(1);
    expect(engine.removeCount).toBe(0);
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-reap-request.json"))).toBe(
      true,
    );
    expect(existsSync(join(prepared.paths.runDirectory, "quarantine-removed.json"))).toBe(false);
  });
});
