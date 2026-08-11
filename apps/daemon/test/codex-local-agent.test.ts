import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  CODEX_AGENT_ADAPTER_ID,
  VERIFIED_CODEX_CLI_VERSIONS,
  serializeCodexReportedResultJsonSchemaV1,
  type CodexPreflightResult,
  type PreflightCodexOptions,
} from "@app-factory/agent-runner";
import {
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  type AgentRunSpecV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import { canonicalJsonBytes, sha256Digest } from "@app-factory/execution-engine";
import {
  parseSupervisedRunReceipt,
  type LaunchSupervisedRunResult,
  type PreparedSupervisedRun,
  type ReconcileSupervisedRunResult,
  type RequestSupervisedRunTerminationResult,
  type SupervisedRunReceiptV1,
} from "@app-factory/process-supervisor";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CodexLocalAgentConfigurationError,
  createCodexLocalAgent,
  type CodexLocalAgentConfigurationV1,
  type CodexLocalAgentDependencies,
} from "../src/codex-local-agent.js";
import type { LocalAgentRunContext } from "../src/verified-local-executor.js";

const CREATED_AT = "2026-08-11T12:00:00.000Z";
const REGISTERED_AT = "2026-08-11T12:00:00.100Z";
const PERMITTED_AT = "2026-08-11T12:00:00.200Z";
const FINISHED_AT = "2026-08-11T12:00:00.500Z";
const TASK_DIGEST = `sha256:${"a".repeat(64)}` as const;
const roots: string[] = [];

type Fixture = Readonly<{
  root: string;
  executable: string;
  executableDigest: Sha256Digest;
  worktree: string;
  codexHome: string;
  runnerRoot: string;
  outputSchemaPath: string;
  configuration: CodexLocalAgentConfigurationV1;
}>;

type ReceiptScenario = Readonly<{
  stdout: Buffer;
  stderr?: Buffer;
  process?: SupervisedRunReceiptV1["process"];
  terminationOrigin?: SupervisedRunReceiptV1["terminationOrigin"];
  outcome?: SupervisedRunReceiptV1["outcome"];
  stdoutObservedByteLength?: number;
  stderrObservedByteLength?: number;
  receiptBytes?: (receipt: SupervisedRunReceiptV1) => Buffer;
}>;

function digestFile(path: string): Sha256Digest {
  return sha256Digest(readFileSync(path));
}

function makeFixture(): Fixture {
  const root = realpathSync(mkdtempSync("/private/tmp/af-codex-local-"));
  chmodSync(root, 0o700);
  roots.push(root);

  const executable = join(root, "fake-codex");
  writeFileSync(executable, "fake Codex executable: tests must never launch this file\n", {
    mode: 0o700,
  });
  chmodSync(executable, 0o700);

  const worktree = join(root, "worktree");
  const codexHome = join(root, "codex-home");
  const runnerRoot = join(root, "runner");
  mkdirSync(join(worktree, "Sources", "App"), { recursive: true, mode: 0o700 });
  mkdirSync(codexHome, { mode: 0o700 });
  mkdirSync(runnerRoot, { mode: 0o700 });
  chmodSync(worktree, 0o700);
  chmodSync(codexHome, 0o700);
  chmodSync(runnerRoot, 0o700);

  const outputSchemaPath = join(runnerRoot, "codex-result.schema.json");
  writeFileSync(outputSchemaPath, serializeCodexReportedResultJsonSchemaV1(), { mode: 0o600 });
  chmodSync(outputSchemaPath, 0o600);

  const executableDigest = digestFile(executable);
  return {
    root,
    executable,
    executableDigest,
    worktree,
    codexHome,
    runnerRoot,
    outputSchemaPath,
    configuration: {
      schemaVersion: 1,
      executable,
      executableDigest,
      expectedCliVersion: VERIFIED_CODEX_CLI_VERSIONS[0],
      model: "gpt-5.6-codex",
      codexHome,
      runnerRoot,
      outputSchemaPath,
      environmentAllowlist: ["PATH", "TMPDIR"],
      environment: {
        PATH: "/usr/bin:/bin",
        TMPDIR: "/private/tmp",
      },
      registrationTimeoutMs: 50,
      pollMs: 1,
    },
  };
}

function makeSpec(fixture: Fixture, overrides: Partial<AgentRunSpecV1> = {}): AgentRunSpecV1 {
  return AgentRunSpecV1Schema.parse({
    schemaVersion: 1,
    runId: "10000000-0000-4000-8000-000000000001",
    attemptId: "10000000-0000-4000-8000-000000000002",
    stepId: "10000000-0000-4000-8000-000000000003",
    fence: 7,
    adapterId: CODEX_AGENT_ADAPTER_ID,
    taskSpecDigest: TASK_DIGEST,
    workingDirectory: fixture.worktree,
    instruction: "Make the one bounded source change and report its result.",
    authorizedWritePaths: ["Sources/App"],
    environmentAllowlist: ["PATH", "TMPDIR"],
    limits: {
      timeoutMs: 1_000,
      terminationGraceMs: 100,
      maxTurns: 1,
      maxEventCount: 50,
      maxStdoutBytes: 100_000,
      maxStderrBytes: 100_000,
    },
    ...overrides,
  });
}

function makeContext(
  spec: AgentRunSpecV1,
  options: Readonly<{
    signal?: AbortSignal;
    assertActive?: () => Promise<void>;
  }> = {},
): LocalAgentRunContext {
  return {
    spec,
    signal: options.signal ?? new AbortController().signal,
    assertActive: options.assertActive ?? (async () => undefined),
    heartbeat: async () => undefined,
  };
}

function completedTranscript(): Buffer {
  return Buffer.from(
    [
      JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "fake-message",
          type: "agent_message",
          text: JSON.stringify({
            schemaVersion: 1,
            reportedDisposition: "finished",
            summary: "The bounded fake change is complete.",
            changedPaths: ["Sources/App/Feature.swift"],
            blocker: null,
          }),
        },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 10, output_tokens: 4, cached_input_tokens: 3 },
      }),
      "",
    ].join("\n"),
    "utf8",
  );
}

function failedTranscript(message: string): Buffer {
  return Buffer.from(
    [
      JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "turn.failed", error: { message } }),
      "",
    ].join("\n"),
    "utf8",
  );
}

function deriveOutcome(
  origin: SupervisedRunReceiptV1["terminationOrigin"],
  processResult: SupervisedRunReceiptV1["process"],
): SupervisedRunReceiptV1["outcome"] {
  if (origin === "timeout") return "timed-out";
  if (origin === "output-overflow") return "output-overflow";
  if (origin === "cancellation") return "cancelled";
  return processResult.exitCode === 0 ? "succeeded" : "failed";
}

function outputRecord(bytes: Buffer, observedByteLength: number) {
  return {
    capturedByteLength: bytes.byteLength,
    observedByteLength,
    sha256: sha256Digest(bytes),
    truncated: observedByteLength > bytes.byteLength,
  } as const;
}

function writeTerminalArtifacts(
  prepared: PreparedSupervisedRun,
  scenario: ReceiptScenario,
): SupervisedRunReceiptV1 {
  const stderr = scenario.stderr ?? Buffer.alloc(0);
  const processResult = scenario.process ?? { exitCode: 0, signal: null };
  const terminationOrigin = scenario.terminationOrigin ?? "natural";
  writeFileSync(prepared.paths.stdoutPath, scenario.stdout, { mode: 0o600 });
  writeFileSync(prepared.paths.stderrPath, stderr, { mode: 0o600 });
  chmodSync(prepared.paths.stdoutPath, 0o600);
  chmodSync(prepared.paths.stderrPath, 0o600);

  const receipt = parseSupervisedRunReceipt({
    schemaVersion: 1,
    runKey: prepared.intent.runKey,
    attemptId: prepared.intent.attemptId,
    fence: prepared.intent.fence,
    intentDigest: prepared.intentDigest,
    invocationDigest: prepared.intent.invocationDigest,
    controllerStartedAt: CREATED_AT,
    targetRegisteredAt: REGISTERED_AT,
    permittedAt: PERMITTED_AT,
    finishedAt: FINISHED_AT,
    identity: {
      schemaVersion: 2,
      attemptId: prepared.intent.attemptId,
      fence: prepared.intent.fence,
      pid: 4_321,
      processStartIdentity: "fake-supervisor-start",
      bootIdentity: "fake-boot",
      processGroupId: 4_321,
      launchedAt: CREATED_AT,
      primaryChild: null,
    },
    process: processResult,
    terminationOrigin,
    outcome: scenario.outcome ?? deriveOutcome(terminationOrigin, processResult),
    stdout: outputRecord(
      scenario.stdout,
      scenario.stdoutObservedByteLength ?? scenario.stdout.byteLength,
    ),
    stderr: outputRecord(stderr, scenario.stderrObservedByteLength ?? stderr.byteLength),
  });
  const bytes =
    scenario.receiptBytes?.(receipt) ?? Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
  writeFileSync(prepared.paths.receiptPath, bytes, { mode: 0o600 });
  chmodSync(prepared.paths.receiptPath, 0o600);
  return receipt;
}

function fakeIdentity(prepared: PreparedSupervisedRun) {
  return {
    schemaVersion: 2,
    attemptId: prepared.intent.attemptId,
    fence: prepared.intent.fence,
    pid: 4_321,
    processStartIdentity: "fake-supervisor-start",
    bootIdentity: "fake-boot",
    processGroupId: 4_321,
    launchedAt: CREATED_AT,
    primaryChild: null,
  } as const;
}

function terminalLaunch(scenario: ReceiptScenario) {
  return vi.fn((prepared: PreparedSupervisedRun): LaunchSupervisedRunResult => ({
    outcome: "already-terminal",
    receipt: writeTerminalArtifacts(prepared, scenario),
  }));
}

async function makeAgent(
  fixture: Fixture,
  supervisor: NonNullable<CodexLocalAgentDependencies["supervisor"]>,
) {
  const preflight = vi.fn(
    async (options: PreflightCodexOptions): Promise<CodexPreflightResult> => ({
      ready: true,
      executable: options.executable,
      version: VERIFIED_CODEX_CLI_VERSIONS[0],
      authConfigured: true,
    }),
  );
  const agent = await createCodexLocalAgent(fixture.configuration, {
    preflight,
    supervisor,
    now: () => new Date(CREATED_AT),
    monotonicNow: () => 0,
    sleep: async () => undefined,
  });
  return { agent, preflight };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("Codex local agent", () => {
  it("preflights exact local configuration and emits canonical, supervisor-bound success evidence", async () => {
    const fixture = makeFixture();
    const launch = terminalLaunch({
      stdout: completedTranscript(),
      stderr: Buffer.from("fake diagnostic\n", "utf8"),
    });
    const { agent, preflight } = await makeAgent(fixture, { launch });
    const outcome = await agent.run(makeContext(makeSpec(fixture)));

    expect(preflight).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledWith({
      executable: fixture.executable,
      cwd: fixture.runnerRoot,
      environment: {
        CODEX_HOME: fixture.codexHome,
        NO_COLOR: "1",
        RUST_LOG: "error",
        TERM: "dumb",
      },
      supportedVersions: [VERIFIED_CODEX_CLI_VERSIONS[0]],
    });
    expect(launch).toHaveBeenCalledTimes(1);
    const prepared = launch.mock.calls[0]?.[0];
    expect(prepared).toBeDefined();
    expect(prepared?.intent.executable).toBe(fixture.executable);
    expect(prepared?.intent.argv).toContain("--strict-config");
    expect(prepared?.intent.argv).toContain("--model");
    expect(prepared?.intent.environment).toEqual([
      { name: "CODEX_HOME", value: fixture.codexHome },
      { name: "NO_COLOR", value: "1" },
      { name: "PATH", value: "/usr/bin:/bin" },
      { name: "RUST_LOG", value: "error" },
      { name: "TERM", value: "dumb" },
      { name: "TMPDIR", value: "/private/tmp" },
    ]);

    if (outcome.kind !== "succeeded" || outcome.protocolEvidence === undefined) {
      throw new Error(`Expected protocol-backed success, received ${outcome.kind}`);
    }
    expect(outcome.changedPaths).toEqual(["Sources/App/Feature.swift"]);
    expect(AgentRunResultV1Schema.safeParse(outcome.protocolEvidence.result).success).toBe(true);
    expect(outcome.protocolEvidence.result).toMatchObject({
      status: "succeeded",
      stdout: {
        digest: sha256Digest(outcome.protocolEvidence.stdout),
        byteLength: outcome.protocolEvidence.stdout.byteLength,
        truncated: false,
      },
      stderr: {
        digest: sha256Digest(outcome.protocolEvidence.stderr),
        byteLength: outcome.protocolEvidence.stderr.byteLength,
        truncated: false,
      },
    });
    const descriptorValue = JSON.parse(
      outcome.protocolEvidence.invocationDescriptor.toString("utf8"),
    ) as unknown;
    expect(outcome.protocolEvidence.invocationDescriptor).toEqual(
      canonicalJsonBytes(descriptorValue),
    );
    expect(outcome.protocolEvidence.invocationDescriptor.at(-1)).not.toBe(0x0a);
    expect(outcome.protocolEvidence.supervisorIntent).toEqual(
      Buffer.from(`${JSON.stringify(prepared?.intent)}\n`, "utf8"),
    );
    expect(outcome.protocolEvidence.supervisorIntent.at(-1)).toBe(0x0a);
    expect(outcome.protocolEvidence.supervisorReceipt.at(-1)).toBe(0x0a);
    expect(existsSync(join(fixture.root, "paid-call-marker"))).toBe(false);
  });

  it.each([
    {
      name: "timeout",
      scenario: {
        stdout: Buffer.alloc(0),
        process: { exitCode: null, signal: "SIGKILL" },
        terminationOrigin: "timeout",
      } satisfies ReceiptScenario,
      status: "timed-out",
      code: "agent.timed-out",
      retryable: true,
    },
    {
      name: "cancellation",
      scenario: {
        stdout: Buffer.alloc(0),
        process: { exitCode: null, signal: "SIGTERM" },
        terminationOrigin: "cancellation",
      } satisfies ReceiptScenario,
      status: "cancelled",
      code: "agent.cancelled",
      retryable: false,
    },
    {
      name: "output overflow",
      scenario: {
        stdout: Buffer.from("truncated\n", "utf8"),
        stdoutObservedByteLength: Buffer.byteLength("truncated\n") + 50,
        process: { exitCode: null, signal: "SIGTERM" },
        terminationOrigin: "output-overflow",
      } satisfies ReceiptScenario,
      status: "failed",
      code: "agent.output-limit-exceeded",
      retryable: false,
    },
  ])("maps $name with exact supervisor truncation provenance", async (testCase) => {
    const fixture = makeFixture();
    const { agent } = await makeAgent(fixture, {
      launch: terminalLaunch(testCase.scenario),
    });
    const outcome = await agent.run(makeContext(makeSpec(fixture)));

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed" || outcome.protocolEvidence === undefined) {
      throw new Error(`Expected protocol-backed failure, received ${outcome.kind}`);
    }
    expect(outcome.failure).toMatchObject({ code: testCase.code, retryable: testCase.retryable });
    expect(outcome.protocolEvidence.result).toMatchObject({
      status: testCase.status,
      failure: { code: testCase.code },
      stdout: {
        byteLength: testCase.scenario.stdout.byteLength,
        truncated: testCase.name === "output overflow",
      },
    });
  });

  it("maps an authentication failure to a structured input blocker", async () => {
    const fixture = makeFixture();
    const { agent } = await makeAgent(fixture, {
      launch: terminalLaunch({
        stdout: failedTranscript("401 Unauthorized: missing bearer authentication"),
        process: { exitCode: 1, signal: null },
      }),
    });
    const outcome = await agent.run(makeContext(makeSpec(fixture)));

    expect(outcome.kind).toBe("needs-input");
    if (outcome.kind !== "needs-input" || outcome.protocolEvidence === undefined) {
      throw new Error(`Expected protocol-backed auth blocker, received ${outcome.kind}`);
    }
    expect(outcome.blocker).toMatchObject({
      kind: "authentication",
      code: "agent.authentication-required",
    });
    expect(outcome.protocolEvidence.result.status).toBe("blocked");
    expect(outcome.protocolEvidence.events.map((event) => event.type)).toContain("agent.blocked");
  });

  it("waits through the receipt-to-controller-exit reconciliation window", async () => {
    const fixture = makeFixture();
    let preparedRun: PreparedSupervisedRun | undefined;
    let reconciliations = 0;
    const { agent } = await makeAgent(fixture, {
      launch: (prepared): LaunchSupervisedRunResult => {
        preparedRun = prepared;
        return { outcome: "already-live", identity: fakeIdentity(prepared) };
      },
      reconcile: (prepared): ReconcileSupervisedRunResult => {
        reconciliations += 1;
        if (reconciliations === 1) {
          return {
            outcome: "blocked",
            reason: "target-exited-without-terminal-receipt",
          };
        }
        if (reconciliations === 2) {
          return {
            outcome: "blocked",
            reason: "terminal-receipt-exists-but-controller-process-group-is-still-live",
          };
        }
        return {
          outcome: "terminal",
          receipt: writeTerminalArtifacts(prepared, { stdout: completedTranscript() }),
          stateRemoved: true,
        };
      },
    });

    const outcome = await agent.run(makeContext(makeSpec(fixture)));
    expect(preparedRun).toBeDefined();
    expect(reconciliations).toBe(3);
    expect(outcome).toMatchObject({ kind: "succeeded" });
  });

  it("fails malformed Codex output as a non-retryable protocol error", async () => {
    const fixture = makeFixture();
    const { agent } = await makeAgent(fixture, {
      launch: terminalLaunch({ stdout: Buffer.from("{not-json}\n", "utf8") }),
    });
    const outcome = await agent.run(makeContext(makeSpec(fixture)));

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") throw new Error("Expected malformed-output failure");
    expect(outcome.failure).toMatchObject({ code: "agent.protocol-error", retryable: false });
  });

  it("checks the active lease immediately before launch and never starts after cancellation", async () => {
    const fixture = makeFixture();
    const launch = terminalLaunch({ stdout: completedTranscript() });
    const { agent } = await makeAgent(fixture, { launch });
    let checks = 0;
    const assertActive = vi.fn(async () => {
      checks += 1;
      if (checks === 3) throw new Error("attempt lease was cancelled");
    });

    await expect(agent.run(makeContext(makeSpec(fixture), { assertActive }))).rejects.toThrow(
      "attempt lease was cancelled",
    );
    expect(assertActive).toHaveBeenCalledTimes(3);
    expect(launch).not.toHaveBeenCalled();
  });

  it("cancels a matching older-fence durable run and never relaunches it", async () => {
    const fixture = makeFixture();
    const ambiguousLaunch = vi.fn((): LaunchSupervisedRunResult => ({
      outcome: "blocked",
      reason: "fake durable launch ambiguity",
    }));
    const terminate = vi.fn(
      async (prepared: PreparedSupervisedRun): Promise<RequestSupervisedRunTerminationResult> => ({
        outcome: "termination-requested",
        cancellation: {
          schemaVersion: 1,
          runKey: prepared.intent.runKey,
          attemptId: prepared.intent.attemptId,
          fence: prepared.intent.fence,
          identityDigest: TASK_DIGEST,
          requestedAt: FINISHED_AT,
        },
        termination: {
          outcome: "blocked",
          forced: false,
          reason: "fake controller owns durable cancellation",
        },
      }),
    );
    const reconcile = vi.fn((prepared: PreparedSupervisedRun): ReconcileSupervisedRunResult => ({
      outcome: "adopted",
      identity: fakeIdentity(prepared),
    }));
    const { agent } = await makeAgent(fixture, {
      launch: ambiguousLaunch,
      reconcile,
      terminate,
    });
    const oldSpec = makeSpec(fixture, { fence: 6 });
    await expect(agent.run(makeContext(oldSpec))).resolves.toMatchObject({
      kind: "needs-input",
      blocker: { code: "agent.supervisor-ambiguous" },
    });

    const newOutcome = await agent.run(makeContext(makeSpec(fixture, { fence: 7 })));
    expect(newOutcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.supervisor-stale-fence" },
    });
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(terminate.mock.calls[0]?.[0].intent.fence).toBe(6);
    expect(ambiguousLaunch).toHaveBeenCalledTimes(1);
  });

  it("does not relaunch after an older-fence terminal receipt outlives unpublished adapter evidence", async () => {
    const fixture = makeFixture();
    const launch = terminalLaunch({ stdout: completedTranscript() });
    const reconcile = vi.fn((prepared: PreparedSupervisedRun): ReconcileSupervisedRunResult => ({
      outcome: "terminal",
      receipt: parseSupervisedRunReceipt(
        JSON.parse(readFileSync(prepared.paths.receiptPath, "utf8")) as unknown,
      ),
      stateRemoved: false,
    }));
    const { agent } = await makeAgent(fixture, { launch, reconcile });

    // Discarding this return simulates a daemon hard-kill after the supervisor
    // fsynced its receipt but before the caller published the V2 result journal.
    await expect(agent.run(makeContext(makeSpec(fixture, { fence: 6 })))).resolves.toMatchObject({
      kind: "succeeded",
      protocolEvidence: { schemaVersion: 1 },
    });

    await expect(agent.run(makeContext(makeSpec(fixture, { fence: 7 })))).resolves.toMatchObject({
      kind: "failed",
      failure: { code: "agent.supervisor-stale-fence", retryable: false },
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0]?.[0].intent.fence).toBe(6);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("does not relaunch when older-fence cancellation discovers a terminal receipt", async () => {
    const fixture = makeFixture();
    const launch = vi.fn((): LaunchSupervisedRunResult => ({
      outcome: "blocked",
      reason: "fake durable launch ambiguity",
    }));
    const reconcile = vi.fn((prepared: PreparedSupervisedRun): ReconcileSupervisedRunResult => ({
      outcome: "adopted",
      identity: fakeIdentity(prepared),
    }));
    const terminate = vi.fn(
      async (prepared: PreparedSupervisedRun): Promise<RequestSupervisedRunTerminationResult> => ({
        outcome: "already-terminal",
        receipt: writeTerminalArtifacts(prepared, { stdout: completedTranscript() }),
      }),
    );
    const { agent } = await makeAgent(fixture, { launch, reconcile, terminate });

    await expect(agent.run(makeContext(makeSpec(fixture, { fence: 6 })))).resolves.toMatchObject({
      kind: "needs-input",
      blocker: { code: "agent.supervisor-ambiguous" },
    });
    await expect(agent.run(makeContext(makeSpec(fixture, { fence: 7 })))).resolves.toMatchObject({
      kind: "failed",
      failure: { code: "agent.supervisor-stale-fence", retryable: false },
    });

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("reconciles terminal and prepared runs at startup but denies readiness for live or ambiguous runs", async () => {
    const fixture = makeFixture();
    const preparedRuns: PreparedSupervisedRun[] = [];
    const launch = vi.fn((prepared: PreparedSupervisedRun): LaunchSupervisedRunResult => {
      preparedRuns.push(prepared);
      return { outcome: "blocked", reason: "fake prepared run retained for startup recovery" };
    });
    const reconcile = vi.fn((): ReconcileSupervisedRunResult => ({
      outcome: "prepared",
    }));
    const terminate = vi.fn(async (): Promise<RequestSupervisedRunTerminationResult> => ({
      outcome: "not-running",
      reason: "startup recovery must not terminate",
    }));
    const { agent } = await makeAgent(fixture, { launch, reconcile, terminate });
    const runIds = [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000003",
    ] as const;
    for (const runId of runIds) {
      await expect(agent.run(makeContext(makeSpec(fixture, { runId })))).resolves.toMatchObject({
        kind: "needs-input",
        blocker: { code: "agent.supervisor-ambiguous" },
      });
    }
    mkdirSync(join(fixture.runnerRoot, "not-an-adapter-run"), { mode: 0o700 });
    expect(preparedRuns).toHaveLength(3);
    const byRunKey = new Map(preparedRuns.map((prepared) => [prepared.intent.runKey, prepared]));
    const terminalKey = `codex-${runIds[0]}-f7`;
    const liveKey = `codex-${runIds[1]}-f7`;
    const preparedKey = `codex-${runIds[2]}-f7`;
    reconcile.mockImplementation((prepared): ReconcileSupervisedRunResult => {
      if (prepared.intent.runKey === terminalKey) {
        return {
          outcome: "terminal",
          receipt: writeTerminalArtifacts(prepared, { stdout: completedTranscript() }),
          stateRemoved: false,
        };
      }
      if (prepared.intent.runKey === liveKey) {
        return { outcome: "adopted", identity: fakeIdentity(prepared) };
      }
      return { outcome: "prepared" };
    });

    const launchCountBeforeRecovery = launch.mock.calls.length;
    await expect(agent.reconcileStartup()).rejects.toThrow(
      /startup recovery found live run.*readiness is denied/,
    );
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(launch).toHaveBeenCalledTimes(launchCountBeforeRecovery);
    expect(terminate).not.toHaveBeenCalled();
    expect(existsSync(byRunKey.get(terminalKey)?.paths.runDirectory ?? "")).toBe(true);
    expect(existsSync(byRunKey.get(liveKey)?.paths.runDirectory ?? "")).toBe(true);
    expect(existsSync(byRunKey.get(preparedKey)?.paths.runDirectory ?? "")).toBe(true);

    reconcile.mockImplementation((prepared): ReconcileSupervisedRunResult =>
      prepared.intent.runKey === liveKey
        ? { outcome: "blocked", reason: "fake process identity is ambiguous" }
        : { outcome: "prepared" },
    );
    await expect(agent.reconcileStartup()).rejects.toThrow(
      /startup recovery is ambiguous.*fake process identity is ambiguous/,
    );
    expect(launch).toHaveBeenCalledTimes(launchCountBeforeRecovery);
    expect(terminate).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical receipt instead of forwarding ambiguous evidence", async () => {
    const fixture = makeFixture();
    const { agent } = await makeAgent(fixture, {
      launch: terminalLaunch({
        stdout: completedTranscript(),
        receiptBytes: (receipt) => Buffer.from(`${JSON.stringify(receipt)}\n `, "utf8"),
      }),
    });
    const outcome = await agent.run(makeContext(makeSpec(fixture)));

    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { code: "agent.evidence-invalid", retryable: false },
    });
  });

  it("rejects unknown configuration fields and nested runner/authentication homes", async () => {
    const fixture = makeFixture();
    const preflight = vi.fn(
      async (options: PreflightCodexOptions): Promise<CodexPreflightResult> => ({
        ready: true,
        executable: options.executable,
        version: VERIFIED_CODEX_CLI_VERSIONS[0],
        authConfigured: true,
      }),
    );
    await expect(
      createCodexLocalAgent(
        { ...fixture.configuration, unknownField: true } as CodexLocalAgentConfigurationV1,
        { preflight },
      ),
    ).rejects.toBeInstanceOf(CodexLocalAgentConfigurationError);
    await expect(
      createCodexLocalAgent(
        {
          ...fixture.configuration,
          runnerRoot: join(fixture.codexHome, "nested-runner"),
        },
        { preflight },
      ),
    ).rejects.toThrow(/non-nested/);
    expect(preflight).not.toHaveBeenCalled();
  });
});
