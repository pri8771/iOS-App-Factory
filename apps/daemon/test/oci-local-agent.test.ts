import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  NamespacedCodeSchema,
  type AgentRunSpecV1,
} from "@app-factory/contracts";
import {
  labelsForOciRun,
  type OciContainerInspection,
  type OciEnginePort,
  type OciImageIdentityV1,
  type OciLogCapture,
  type OciRunIntentV1,
} from "@app-factory/oci-runner";
import { afterEach, describe, expect, it } from "vitest";

import {
  OCI_LOCAL_AGENT_ADAPTER_ID,
  OciLocalAgent,
  deriveOciLocalAgentRunKey,
  type OciLocalAgentConfigurationV1,
  type OciLocalAgentProtocolMaterializer,
} from "../src/oci-local-agent.js";
import type { LocalAgentRunContext } from "../src/verified-local-executor.js";

const CONTAINER_ID = "a".repeat(64);
const ENGINE_DIGEST = `sha256:${"7".repeat(64)}`;
const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const IMAGE_REFERENCE = `factory/deterministic-agent@sha256:${"2".repeat(64)}`;
const TASK_DIGEST = `sha256:${"3".repeat(64)}`;
const POLICY_DIGEST = `sha256:${"4".repeat(64)}`;
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

function spec(worktree: string): AgentRunSpecV1 {
  return AgentRunSpecV1Schema.parse({
    schemaVersion: 1,
    runId: "10000000-0000-4000-8000-000000000001",
    attemptId: "10000000-0000-4000-8000-000000000002",
    stepId: "10000000-0000-4000-8000-000000000003",
    fence: 7,
    adapterId: OCI_LOCAL_AGENT_ADAPTER_ID,
    taskSpecDigest: TASK_DIGEST,
    workingDirectory: worktree,
    instruction: "Run the deterministic isolated fixture.",
    authorizedWritePaths: ["Sources"],
    environmentAllowlist: [],
    limits: {
      timeoutMs: 60_000,
      terminationGraceMs: 100,
      maxTurns: 1,
      maxEventCount: 10,
      maxStdoutBytes: 1_024,
      maxStderrBytes: 1_024,
    },
  });
}

function context(
  runSpec: AgentRunSpecV1,
  signal = new AbortController().signal,
  authority: Partial<
    Pick<LocalAgentRunContext, "assertActive" | "assertCleanupActive" | "heartbeat">
  > = {},
): LocalAgentRunContext {
  return {
    spec: runSpec,
    policyDigest: POLICY_DIGEST,
    baseCommit: "5".repeat(40),
    baseTree: "6".repeat(40),
    signal,
    assertActive: authority.assertActive ?? (async () => undefined),
    assertCleanupActive: authority.assertCleanupActive ?? (async () => undefined),
    heartbeat: authority.heartbeat ?? (async () => undefined),
  };
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
    workingDirectory: "/workspace",
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
  };
}

class FakeEngine implements OciEnginePort {
  public readonly engineIdentityDigest = ENGINE_DIGEST;
  public observedEngineIdentityDigest = ENGINE_DIGEST;
  public inspection: OciContainerInspection | null = null;
  public intent: OciRunIntentV1 | null = null;
  public createCount = 0;
  public startCount = 0;
  public removeCount = 0;
  public stopCount = 0;
  public autoFinish = true;
  public failStart = false;
  public runningInspectionCount = 0;

  public async observeEngineIdentityDigest(): Promise<string> {
    return this.observedEngineIdentityDigest;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    if (image.reference !== IMAGE_REFERENCE || image.imageId !== IMAGE_ID) {
      throw new Error("unexpected image");
    }
  }

  public async findByLabels(): Promise<OciContainerInspection | null> {
    return this.inspection;
  }

  public async create(intent: OciRunIntentV1): Promise<string> {
    this.intent = intent;
    this.createCount += 1;
    this.inspection = inspectionFor(intent, "created");
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (containerId !== CONTAINER_ID) throw new Error("unexpected container");
    if (this.inspection?.status === "running") {
      if (this.autoFinish && this.runningInspectionCount > 0 && this.intent !== null) {
        this.inspection = inspectionFor(this.intent, "terminal");
      }
      this.runningInspectionCount += 1;
    }
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.startCount += 1;
    if (this.failStart) throw new Error("ambiguous start");
    if (this.intent === null) throw new Error("missing intent");
    this.inspection = inspectionFor(this.intent, "running");
  }

  public async logs(): Promise<OciLogCapture> {
    return {
      stdout: Buffer.from("fixture-ok\n"),
      stderr: Buffer.alloc(0),
      stdoutObservedBytes: 11,
      stderrObservedBytes: 0,
    };
  }

  public async stop(): Promise<void> {
    this.stopCount += 1;
    if (this.intent === null) throw new Error("missing intent");
    this.inspection = inspectionFor(this.intent, "terminal");
  }

  public async kill(): Promise<void> {
    if (this.intent !== null) this.inspection = inspectionFor(this.intent, "terminal");
  }

  public async remove(): Promise<void> {
    this.removeCount += 1;
    this.inspection = null;
  }
}

const materializer: OciLocalAgentProtocolMaterializer = ({ spec: runSpec, receipt }) => {
  const status =
    receipt.outcome === "succeeded"
      ? "succeeded"
      : receipt.outcome === "cancelled"
        ? "cancelled"
        : receipt.outcome === "timed-out"
          ? "timed-out"
          : "failed";
  const failure =
    status === "succeeded"
      ? null
      : {
          code: NamespacedCodeSchema.parse("agent.fixture-failed"),
          summary: "The isolated fixture did not succeed.",
          retryable: false,
          detailArtifactDigest: null,
        };
  const result = AgentRunResultV1Schema.parse({
    schemaVersion: 1,
    runId: runSpec.runId,
    attemptId: runSpec.attemptId,
    stepId: runSpec.stepId,
    fence: runSpec.fence,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    finalEventSequence: 2,
    stdout: {
      digest: receipt.stdout.digest,
      byteLength: receipt.stdout.capturedByteLength,
      truncated: receipt.stdout.truncated,
    },
    stderr: {
      digest: receipt.stderr.digest,
      byteLength: receipt.stderr.capturedByteLength,
      truncated: receipt.stderr.truncated,
    },
    usage: null,
    status,
    process: { exitCode: receipt.exitCode, signal: null },
    failure,
    blocker: null,
  });
  const events = [
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      eventId: "20000000-0000-4000-8000-000000000001",
      runId: runSpec.runId,
      attemptId: runSpec.attemptId,
      stepId: runSpec.stepId,
      fence: runSpec.fence,
      sequence: 1,
      occurredAt: receipt.startedAt,
      type: "agent.started",
      data: { adapterId: runSpec.adapterId },
    }),
    AgentEventV1Schema.parse({
      schemaVersion: 1,
      eventId: "20000000-0000-4000-8000-000000000002",
      runId: runSpec.runId,
      attemptId: runSpec.attemptId,
      stepId: runSpec.stepId,
      fence: runSpec.fence,
      sequence: 2,
      occurredAt: receipt.finishedAt,
      type: "agent.finished",
      data: { status },
    }),
  ];
  return { result, events, summary: "The deterministic OCI fixture completed.", changedPaths: [] };
};

function configuration(
  runnerRoot: string,
  protocolMaterializer: OciLocalAgentProtocolMaterializer = materializer,
): OciLocalAgentConfigurationV1 {
  return {
    schemaVersion: 1,
    runnerRoot,
    engineIdentityDigest: ENGINE_DIGEST,
    image: { reference: IMAGE_REFERENCE, imageId: IMAGE_ID },
    agentExecutable: "/usr/local/bin/deterministic-agent",
    agentArguments: ["run", "--protocol", "v1"],
    environment: [
      { name: "LANG", value: "C" },
      { name: "PATH", value: "/usr/local/bin:/usr/bin:/bin" },
      { name: "TZ", value: "UTC" },
    ],
    resources: {
      cpuCount: 2,
      memoryBytes: 512 * 1024 * 1024,
      pidLimit: 64,
      privateTmpfsBytes: 16 * 1024 * 1024,
    },
    protocolMaterializer,
    pollMs: 1,
  };
}

function fixture(): Readonly<{
  worktree: string;
  runnerRoot: string;
  runSpec: AgentRunSpecV1;
}> {
  const worktree = temporaryDirectory("factory-oci-agent-worktree-");
  mkdirSync(join(worktree, "Sources"));
  const runnerRoot = join(temporaryDirectory("factory-oci-agent-runtime-parent-"), "oci");
  return { worktree, runnerRoot, runSpec: spec(worktree) };
}

function agent(
  runnerRoot: string,
  engine: FakeEngine,
  sleep: (milliseconds: number) => Promise<void> = async () => undefined,
  protocolMaterializer: OciLocalAgentProtocolMaterializer = materializer,
): OciLocalAgent {
  return new OciLocalAgent(configuration(runnerRoot, protocolMaterializer), {
    engine,
    now: () => new Date("2026-08-11T18:00:00.000Z"),
    sleep,
  });
}

describe("OciLocalAgent", () => {
  it("returns V3 protocol evidence only from a validated removed closure", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    const adapter = agent(data.runnerRoot, engine);

    const outcome = await adapter.run(context(data.runSpec));

    expect(outcome.kind).toBe("succeeded");
    expect(outcome.protocolEvidence).toMatchObject({
      schemaVersion: 3,
      runSpec: data.runSpec,
      result: { status: "succeeded" },
      ociEvidenceClosure: {
        envelope: {
          phase: "removed",
          runKey: deriveOciLocalAgentRunKey(data.runSpec),
        },
      },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.removeCount).toBe(1);
    expect(engine.intent).toMatchObject({
      networkMode: "none",
      readOnlyRootFilesystem: true,
      worktreeContainerPath: "/workspace",
      privateTmpfsPath: "/run/app-factory",
      limits: {
        wallTimeMs: data.runSpec.limits.timeoutMs,
        stopGraceMs: data.runSpec.limits.terminationGraceMs,
        outputBytesPerStream: data.runSpec.limits.maxStdoutBytes,
      },
    });
    expect(adapter.trustedIdentity).toMatchObject({
      evidenceRoot: data.runnerRoot,
      engineIdentityDigest: ENGINE_DIGEST,
      image: { reference: IMAGE_REFERENCE, imageId: IMAGE_ID },
    });
  });

  it("blocks an ambiguous launch quarantine without publishing a normal result", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.failStart = true;

    const outcome = await agent(data.runnerRoot, engine).run(context(data.runSpec));

    expect(outcome).toMatchObject({
      kind: "needs-input",
      blocker: { code: "agent.oci-quarantined" },
    });
    expect(outcome.protocolEvidence).toBeUndefined();
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.removeCount).toBe(0);
  });

  it("rejects materialized output bound to a different daemon-issued spec", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    const mismatchedMaterializer: OciLocalAgentProtocolMaterializer = async (input) => {
      const valid = await materializer(input);
      return { ...valid, result: { ...valid.result, fence: input.spec.fence + 1 } };
    };

    const outcome = await agent(
      data.runnerRoot,
      engine,
      async () => undefined,
      mismatchedMaterializer,
    ).run(context(data.runSpec));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.oci-protocol-error" },
    });
    expect(outcome.protocolEvidence).toBeUndefined();
  });

  it("reopens a running durable run without duplicate create or start", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    const crash = new Error("simulated daemon crash");

    await expect(
      agent(data.runnerRoot, engine, async () => {
        throw crash;
      }).run(context(data.runSpec)),
    ).rejects.toBe(crash);
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);

    engine.autoFinish = true;
    const outcome = await agent(data.runnerRoot, engine).run(context(data.runSpec));

    expect(outcome.kind).toBe("succeeded");
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("adopts an older-fence durable run under the current controller without relaunch", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    await expect(
      agent(data.runnerRoot, engine, async () => {
        throw new Error("simulated fence-seven crash");
      }).run(context(data.runSpec)),
    ).rejects.toThrow("simulated fence-seven crash");
    const nextFenceSpec = AgentRunSpecV1Schema.parse({ ...data.runSpec, fence: 8 });

    engine.autoFinish = true;
    const outcome = await agent(data.runnerRoot, engine).run(context(nextFenceSpec));

    expect(outcome).toMatchObject({
      kind: "succeeded",
      protocolEvidence: {
        schemaVersion: 3,
        runSpec: { fence: 7 },
        result: { fence: 7, status: "succeeded" },
        ociEvidenceClosure: { envelope: { fence: 7, phase: "removed" } },
      },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("rejects adoption of a durable run from a future scheduler fence", async () => {
    const data = fixture();
    const futureSpec = AgentRunSpecV1Schema.parse({ ...data.runSpec, fence: 8 });
    const engine = new FakeEngine();
    engine.autoFinish = false;
    await expect(
      agent(data.runnerRoot, engine, async () => {
        throw new Error("simulated future-fence crash");
      }).run(context(futureSpec)),
    ).rejects.toThrow("simulated future-fence crash");

    const outcome = await agent(data.runnerRoot, engine).run(context(data.runSpec));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.oci-future-fence", retryable: false },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("drives an already-aborted run through durable pre-start cancellation", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    const abort = new AbortController();
    abort.abort();

    const outcome = await agent(data.runnerRoot, engine).run(context(data.runSpec, abort.signal));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.oci-cancelled-before-start" },
    });
    expect(outcome.protocolEvidence).toBeUndefined();
    expect(engine.createCount).toBe(0);
    expect(engine.startCount).toBe(0);

    const beforeRestart = {
      create: engine.createCount,
      start: engine.startCount,
      remove: engine.removeCount,
    };
    const restarted = agent(data.runnerRoot, engine);
    await expect(restarted.inspectStartup()).resolves.toMatchObject([
      {
        runKey: deriveOciLocalAgentRunKey(data.runSpec),
        intent: { runId: data.runSpec.runId, fence: data.runSpec.fence },
        disposition: {
          phase: "cancelled-before-start",
          cancellation: { state: "planned", containerId: null },
          engineIdentityDigest: ENGINE_DIGEST,
        },
      },
    ]);
    await expect(restarted.reconcileStartup()).resolves.toBeUndefined();
    expect({
      create: engine.createCount,
      start: engine.startCount,
      remove: engine.removeCount,
    }).toEqual(beforeRestart);
  });

  it("ignores OS metadata junk in the runner root instead of failing closed startup recovery", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    const abort = new AbortController();
    abort.abort();
    await agent(data.runnerRoot, engine).run(context(data.runSpec, abort.signal));

    // Finder writes .DS_Store and AppleDouble sidecars as files; Spotlight,
    // Trash, and fseventsd bookkeeping are directories. Both shapes must be
    // ignored by name, regardless of entry type.
    writeFileSync(join(data.runnerRoot, ".DS_Store"), "junk\n");
    writeFileSync(join(data.runnerRoot, "._oci-junk"), "junk\n");
    mkdirSync(join(data.runnerRoot, ".Spotlight-V100"));
    mkdirSync(join(data.runnerRoot, ".Trashes"));
    mkdirSync(join(data.runnerRoot, ".fseventsd"));

    const restarted = agent(data.runnerRoot, engine);
    await expect(restarted.inspectStartup()).resolves.toMatchObject([
      {
        runKey: deriveOciLocalAgentRunKey(data.runSpec),
        intent: { runId: data.runSpec.runId, fence: data.runSpec.fence },
        disposition: { phase: "cancelled-before-start" },
      },
    ]);
  });

  it("still fails closed on a genuinely unexpected entry in the runner root", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    const abort = new AbortController();
    abort.abort();
    await agent(data.runnerRoot, engine).run(context(data.runSpec, abort.signal));
    mkdirSync(join(data.runnerRoot, "not-an-oci-run"));

    const restarted = agent(data.runnerRoot, engine);
    await expect(restarted.inspectStartup()).rejects.toThrow(/invalid run entry/);
  });

  it("observes abort during a running container and drives durable cancellation", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    const abort = new AbortController();
    const adapter = agent(data.runnerRoot, engine, async () => {
      abort.abort();
    });

    const outcome = await adapter.run(context(data.runSpec, abort.signal));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.fixture-failed" },
      protocolEvidence: {
        schemaVersion: 3,
        result: { status: "cancelled" },
        ociEvidenceClosure: { envelope: { phase: "removed" } },
      },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.stopCount).toBe(1);
    expect(engine.removeCount).toBe(1);
  });

  it("uses current-lease cleanup authority after execution is aborted", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    const abort = new AbortController();
    let cleanupChecks = 0;
    let executionChecksAfterAbort = 0;
    const adapter = agent(data.runnerRoot, engine, async () => {
      abort.abort();
    });

    const outcome = await adapter.run(
      context(data.runSpec, abort.signal, {
        assertActive: async () => {
          if (abort.signal.aborted) {
            executionChecksAfterAbort += 1;
            throw new Error("execution cancelled");
          }
        },
        assertCleanupActive: async () => {
          cleanupChecks += 1;
        },
      }),
    );

    expect(outcome).toMatchObject({
      kind: "failed",
      protocolEvidence: { result: { status: "cancelled" } },
    });
    expect(executionChecksAfterAbort).toBe(0);
    expect(cleanupChecks).toBe(3);
    expect(engine.stopCount).toBe(1);
    expect(engine.removeCount).toBe(1);
  });

  it("cannot cancel or remove after the adapter loses cleanup lease authority", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    const abort = new AbortController();
    let cleanupChecks = 0;
    const adapter = agent(data.runnerRoot, engine, async () => {
      abort.abort();
    });

    await expect(
      adapter.run(
        context(data.runSpec, abort.signal, {
          assertCleanupActive: async () => {
            cleanupChecks += 1;
            throw new Error("cleanup lease stolen");
          },
        }),
      ),
    ).rejects.toThrow(/cleanup lease stolen/u);
    expect(cleanupChecks).toBe(1);
    expect(engine.stopCount).toBe(0);
    expect(engine.removeCount).toBe(0);
  });

  it("fails closed when the observed engine changes after durable binding", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    await expect(
      agent(data.runnerRoot, engine, async () => {
        throw new Error("pause after start");
      }).run(context(data.runSpec)),
    ).rejects.toThrow("pause after start");
    engine.observedEngineIdentityDigest = `sha256:${"8".repeat(64)}`;

    const outcome = await agent(data.runnerRoot, engine).run(context(data.runSpec));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.oci-lifecycle-error", retryable: false },
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("denies startup readiness for an unfinished run without mutating it", async () => {
    const data = fixture();
    const engine = new FakeEngine();
    engine.autoFinish = false;
    const adapter = agent(data.runnerRoot, engine, async () => {
      throw new Error("pause after start");
    });
    await expect(adapter.run(context(data.runSpec))).rejects.toThrow("pause after start");
    const counts = { create: engine.createCount, start: engine.startCount };

    await expect(adapter.inspectStartup()).resolves.toMatchObject([
      {
        runKey: deriveOciLocalAgentRunKey(data.runSpec),
        disposition: { phase: "incomplete" },
      },
    ]);
    await expect(adapter.reconcileStartup()).rejects.toThrow(/unfinished run/u);
    expect({ create: engine.createCount, start: engine.startCount }).toEqual(counts);
  });

  it("rejects a configured engine binding mismatch before any lifecycle call", () => {
    const data = fixture();
    const engine = new FakeEngine();

    expect(
      () =>
        new OciLocalAgent(
          {
            ...configuration(data.runnerRoot),
            engineIdentityDigest: `sha256:${"9".repeat(64)}`,
          },
          { engine },
        ),
    ).toThrow(/engine identity differs/u);
    expect(engine.createCount).toBe(0);
  });

  it("derives the same durable key independent of scheduler fence", () => {
    const data = fixture();
    const nextFence = AgentRunSpecV1Schema.parse({ ...data.runSpec, fence: 8 });

    expect(deriveOciLocalAgentRunKey(nextFence)).toBe(deriveOciLocalAgentRunKey(data.runSpec));
  });
});
