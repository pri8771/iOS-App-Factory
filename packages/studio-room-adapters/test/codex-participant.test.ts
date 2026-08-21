import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { preflightCodex } from "@app-factory/agent-runner";
import { RoomPersonaSchema } from "@app-factory/contracts";
import type {
  CreateSupervisedRunIntentInput,
  LaunchSupervisedRunResult,
  LocalSupervisedControllerRegistration,
  PreparedSupervisedRun,
  ReconcileSupervisedRunResult,
  RequestSupervisedRunTerminationResult,
  SupervisedRunReceiptV1,
  SupervisorIdentityV2,
  WaitForSupervisedRunRegistrationResult,
} from "@app-factory/process-supervisor";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildCodexParticipantInvocation,
  classifyCodexParticipantStdout,
  createCodexParticipant,
  type CodexSupervisorPort,
} from "../src/index.js";
import type { ParticipantContext } from "../src/index.js";
import { neverAbortedSignal } from "./helpers.js";

function sha(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function identity(attemptId: string): SupervisorIdentityV2 {
  return {
    schemaVersion: 2,
    attemptId,
    fence: 0,
    pid: 4242,
    processStartIdentity: "fake",
    bootIdentity: "fake",
    processGroupId: 4242,
    launchedAt: new Date().toISOString(),
    primaryChild: null,
  };
}

type ScriptedRun = Readonly<{
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  terminationOrigin?: SupervisedRunReceiptV1["terminationOrigin"];
  outcome?: SupervisedRunReceiptV1["outcome"];
  /** When set, `launch` returns "launch-requested" and the receipt only appears via `reconcile`. */
  viaReconcile?: boolean;
}>;

/** A fully in-memory-plus-real-files `CodexSupervisorPort` double. */
function fakeSupervisor(runnerRoot: string, script: ScriptedRun) {
  const launched: string[] = [];
  const reportedControllerPids: number[] = [];
  let reconcileCalls = 0;

  function receiptFor(
    paths: PreparedSupervisedRun["paths"],
    intent: CreateSupervisedRunIntentInput,
  ): SupervisedRunReceiptV1 {
    const stdoutBytes = Buffer.from(script.stdout ?? "", "utf8");
    const stderrBytes = Buffer.from(script.stderr ?? "", "utf8");
    mkdirSync(join(paths.stdoutPath, ".."), { recursive: true });
    writeFileSync(paths.stdoutPath, stdoutBytes);
    writeFileSync(paths.stderrPath, stderrBytes);
    return {
      schemaVersion: 1,
      runKey: intent.runKey,
      attemptId: intent.attemptId,
      fence: 0,
      intentDigest: "sha256:" + "0".repeat(64),
      invocationDigest: "sha256:" + "0".repeat(64),
      controllerStartedAt: new Date().toISOString(),
      targetRegisteredAt: new Date().toISOString(),
      permittedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      identity: identity(intent.attemptId),
      process: { exitCode: script.exitCode ?? 0, signal: script.signal ?? null },
      terminationOrigin: script.terminationOrigin ?? "natural",
      outcome: script.outcome ?? "succeeded",
      stdout: {
        capturedByteLength: stdoutBytes.byteLength,
        observedByteLength: stdoutBytes.byteLength,
        sha256: sha(stdoutBytes),
        truncated: false,
      },
      stderr: {
        capturedByteLength: stderrBytes.byteLength,
        observedByteLength: stderrBytes.byteLength,
        sha256: sha(stderrBytes),
        truncated: false,
      },
    };
  }

  const preparedByRunKey = new Map<
    string,
    { prepared: PreparedSupervisedRun; intent: CreateSupervisedRunIntentInput }
  >();

  const port: CodexSupervisorPort = {
    prepare(rootDirectory, input) {
      const runDirectory = join(rootDirectory, input.runKey);
      mkdirSync(runDirectory, { recursive: true });
      const paths: PreparedSupervisedRun["paths"] = {
        runDirectory,
        intentPath: join(runDirectory, "intent.json"),
        launchClaimPath: join(runDirectory, "launch.claim.json"),
        statePath: join(runDirectory, "target.state.json"),
        controllerStatePath: join(runDirectory, "controller.state.json"),
        permissionPath: join(runDirectory, "execution-permitted.json"),
        gateReleasePath: join(runDirectory, "gate-released.json"),
        stdoutPath: join(runDirectory, "stdout.bin"),
        stderrPath: join(runDirectory, "stderr.bin"),
        cancellationPath: join(runDirectory, "cancellation.json"),
        receiptPath: join(runDirectory, "receipt.json"),
      };
      const prepared: PreparedSupervisedRun = {
        intent: {
          schemaVersion: 1,
          runKey: input.runKey,
          attemptId: input.attemptId,
          fence: input.fence,
          createdAt: input.createdAt,
          invocationDigest: "sha256:" + "0".repeat(64),
          executable: input.executable,
          argv: input.argv ?? [],
          cwd: input.cwd,
          environment: Object.entries(input.environment ?? {}).map(([name, value]) => ({
            name,
            value,
          })),
          stdin: { byteLength: 0, sha256: sha(Buffer.alloc(0)), base64: "" },
          limits: {
            timeoutMs: input.limits?.timeoutMs ?? 1_000,
            graceMs: input.limits?.graceMs ?? 1_000,
            forceWaitMs: input.limits?.forceWaitMs ?? 1_000,
            pollMs: input.limits?.pollMs ?? 10,
            maxOutputBytesPerStream: input.limits?.maxOutputBytesPerStream ?? 1_000_000,
          },
        },
        intentDigest: "sha256:" + "0".repeat(64),
        paths,
        preparation: "created",
      };
      preparedByRunKey.set(input.runKey, { prepared, intent: input });
      return prepared;
    },
    launch(prepared): LaunchSupervisedRunResult {
      launched.push(prepared.intent.runKey);
      const entry = preparedByRunKey.get(prepared.intent.runKey);
      if (entry === undefined) throw new Error("unknown runKey");
      if (script.viaReconcile === true) {
        return {
          outcome: "launch-requested",
          controllerPid: 9999,
          registration: {
            controllerPid: 9999,
            hasExited: () => false,
          } satisfies LocalSupervisedControllerRegistration,
        };
      }
      return { outcome: "already-terminal", receipt: receiptFor(prepared.paths, entry.intent) };
    },
    async waitForRegistration(prepared): Promise<WaitForSupervisedRunRegistrationResult> {
      const entry = preparedByRunKey.get(prepared.intent.runKey);
      if (entry === undefined) throw new Error("unknown runKey");
      return { outcome: "registered", identity: identity(entry.intent.attemptId) };
    },
    reconcile(prepared): ReconcileSupervisedRunResult {
      reconcileCalls += 1;
      const entry = preparedByRunKey.get(prepared.intent.runKey);
      if (entry === undefined) throw new Error("unknown runKey");
      if (reconcileCalls < 2) return { outcome: "prepared" };
      return {
        outcome: "terminal",
        receipt: receiptFor(prepared.paths, entry.intent),
        stateRemoved: true,
      };
    },
    async terminate(): Promise<RequestSupervisedRunTerminationResult> {
      return { outcome: "not-running", reason: "fake" };
    },
  };

  return { port, launched, reportedControllerPids };
}

const roots: string[] = [];
function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "codex-participant-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  // Best-effort: temp dirs are under the OS tmp root and cleaned by the OS in CI;
  // no explicit rmSync here to keep this test resilient to timing of async cleanup.
  roots.length = 0;
});

function context(overrides: Partial<ParticipantContext> = {}): ParticipantContext {
  return {
    persona: RoomPersonaSchema.parse("codex-planner"),
    roomCharter: "Design review room.",
    rollingSummary: "",
    personaCharter: "Codex Planner, breaks work into steps.",
    transcript: [{ author: "priyansh", body: "What's the riskiest assumption here?" }],
    networkEnabled: false,
    maxOutputTokens: 1_000,
    signal: neverAbortedSignal(),
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

function agentMessageStdout(
  payload: unknown,
  // `null` (never the default parameter's `undefined`) opts out of a `usage` field altogether, so
  // callers can exercise the "turn.completed reported nothing" case explicitly.
  usage: Readonly<Record<string, unknown>> | null = { input_tokens: 1, output_tokens: 1 },
): string {
  const turnCompleted: Record<string, unknown> = { type: "turn.completed" };
  if (usage !== null) turnCompleted.usage = usage;
  return [
    JSON.stringify({ type: "thread.started", thread_id: randomUUID() }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: JSON.stringify(payload) },
    }),
    JSON.stringify(turnCompleted),
  ].join("\n");
}

describe("classifyCodexParticipantStdout", () => {
  it("extracts a message contribution from the final agent_message, with honest usage from turn.completed", () => {
    const result = classifyCodexParticipantStdout(
      agentMessageStdout({ schemaVersion: 1, kind: "message", text: "Ship it." }),
    );
    expect(result).toEqual({
      kind: "completed",
      contribution: {
        kind: "message",
        text: "Ship it.",
        usage: {
          tokensUsed: 1,
          reported: { inputTokens: 1, outputTokens: 1, cachedInputTokens: null },
          costUsdMicros: null,
        },
      },
    });
  });

  it("extracts a pass contribution, with honest usage from turn.completed", () => {
    const result = classifyCodexParticipantStdout(
      agentMessageStdout({ schemaVersion: 1, kind: "pass", text: null }),
    );
    expect(result).toEqual({
      kind: "completed",
      contribution: {
        kind: "pass",
        usage: {
          tokensUsed: 1,
          reported: { inputTokens: 1, outputTokens: 1, cachedInputTokens: null },
          costUsdMicros: null,
        },
      },
    });
  });

  it("falls back to tokensUsed 0 and reported null when turn.completed carries no usage field at all", () => {
    const result = classifyCodexParticipantStdout(
      agentMessageStdout({ schemaVersion: 1, kind: "message", text: "No usage here." }, null),
    );
    expect(result).toEqual({
      kind: "completed",
      contribution: {
        kind: "message",
        text: "No usage here.",
        usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
      },
    });
  });

  it("classifies a turn.failed with rate-limit text as error(limit)", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: randomUUID() }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.failed",
        error: { message: "rate limit exceeded, try again in 10 minutes" },
      }),
    ].join("\n");
    const result = classifyCodexParticipantStdout(lines);
    expect(result).toEqual({
      kind: "completed",
      contribution: { kind: "error", code: "limit", retryAfterMs: 600_000 },
    });
  });

  it("classifies a turn.failed authentication error as blocked-auth", () => {
    const lines = [
      JSON.stringify({ type: "thread.started", thread_id: randomUUID() }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.failed",
        error: { message: "401 Unauthorized: not logged in" },
      }),
    ].join("\n");
    const result = classifyCodexParticipantStdout(lines);
    expect(result).toEqual({ kind: "blocked-auth", reason: expect.any(String) });
  });

  it("fails closed on malformed JSONL", () => {
    expect(classifyCodexParticipantStdout("not json\nnot json either").kind).toBe("protocol-error");
  });

  it("fails closed when the final agent_message does not match the room contribution schema", () => {
    const result = classifyCodexParticipantStdout(agentMessageStdout({ wrong: "shape" }));
    expect(result.kind).toBe("protocol-error");
  });

  it("fails closed with no events at all", () => {
    expect(classifyCodexParticipantStdout("").kind).toBe("protocol-error");
  });
});

describe("buildCodexParticipantInvocation", () => {
  it("denies network for project rooms and enables it for research rooms", () => {
    const scratch = mkdtempSync(join(tmpdir(), "codex-invocation-test-"));
    const invocation = buildCodexParticipantInvocation({
      executable: "/usr/bin/true",
      model: "gpt-test",
      codexHome: "/tmp",
      outputSchemaPath: "/tmp/schema.json",
      workingDirectory: scratch,
      instruction: "hi",
      networkEnabled: false,
      environmentAllowlist: ["PATH"],
    });
    expect(invocation.args.join(" ")).toContain("network={enabled=false}");
    expect(invocation.stdin).toBe("hi");

    const research = buildCodexParticipantInvocation({
      executable: "/usr/bin/true",
      model: "gpt-test",
      codexHome: "/tmp",
      outputSchemaPath: "/tmp/schema.json",
      workingDirectory: scratch,
      instruction: "hi",
      networkEnabled: true,
      environmentAllowlist: ["PATH"],
    });
    expect(research.args.join(" ")).toContain("network={enabled=true}");
  });

  it("never authorizes any write path (no authorizedWritePaths concept exists)", () => {
    const scratch = mkdtempSync(join(tmpdir(), "codex-invocation-test-"));
    const invocation = buildCodexParticipantInvocation({
      executable: "/usr/bin/true",
      model: "gpt-test",
      codexHome: "/tmp",
      outputSchemaPath: "/tmp/schema.json",
      workingDirectory: scratch,
      instruction: "hi",
      networkEnabled: false,
      environmentAllowlist: [],
    });
    const profileArg = invocation.args.find((arg) => arg.startsWith("permissions."));
    expect(profileArg).toBeDefined();
    expect(profileArg).toContain('":workspace_roots"={"."="read"}');
    expect(profileArg).not.toContain("write");
  });
});

const readyPreflight: typeof preflightCodex = async () => ({
  ready: true,
  executable: "/usr/bin/true",
  version: "0.148.0-alpha.9",
  authConfigured: true,
});

function buildParticipant(script: ScriptedRun) {
  const runnerRoot = freshRoot();
  const scratchRoot = freshRoot();
  const codexHome = freshRoot();
  const { port, launched } = fakeSupervisor(runnerRoot, script);
  const participant = createCodexParticipant({
    executable: "/usr/bin/true",
    model: "gpt-test",
    codexHome,
    runnerRoot,
    scratchRoot,
    supervisor: port,
    preflight: readyPreflight,
    environmentAllowlist: ["PATH"],
  });
  return { participant, launched };
}

/** `agentMessageStdout`'s default `turn.completed` usage (`{input_tokens:1, output_tokens:1}`)
 *  parsed into the widened `ParticipantUsage` shape. */
const DEFAULT_USAGE = {
  tokensUsed: 1,
  reported: { inputTokens: 1, outputTokens: 1, cachedInputTokens: null },
  costUsdMicros: null,
};

describe("createCodexParticipant (fake supervisor)", () => {
  it("maps a successful message contribution end to end", async () => {
    const { participant, launched } = buildParticipant({
      stdout: agentMessageStdout({ schemaVersion: 1, kind: "message", text: "Codex says hi." }),
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({
      kind: "message",
      text: "Codex says hi.",
      usage: DEFAULT_USAGE,
    });
    expect(launched).toHaveLength(1);
  });

  it("maps a pass contribution", async () => {
    const { participant } = buildParticipant({
      stdout: agentMessageStdout({ schemaVersion: 1, kind: "pass", text: null }),
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "pass", usage: DEFAULT_USAGE });
  });

  it("maps receipt.terminationOrigin 'timeout' to error(timeout) without reading output", async () => {
    const { participant } = buildParticipant({
      terminationOrigin: "timeout",
      outcome: "timed-out",
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "timeout", retryAfterMs: null });
  });

  it("classifies a non-zero exit with rate-limit stderr as error(limit)", async () => {
    const { participant } = buildParticipant({
      exitCode: 1,
      stderr: "Error: rate limit exceeded, try again in 3 minutes",
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "limit", retryAfterMs: 180_000 });
  });

  it("maps a non-zero exit with an authentication stderr to error(internal)", async () => {
    const { participant } = buildParticipant({
      exitCode: 1,
      stderr: "401 Unauthorized: not logged in",
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("resolves via the launch-requested + reconcile-poll path and reports the controller pid", async () => {
    const pids: number[] = [];
    const { participant, launched } = buildParticipant({
      stdout: agentMessageStdout({ schemaVersion: 1, kind: "message", text: "Via reconcile." }),
      viaReconcile: true,
    });
    const result = await participant.contribute(
      context({ reportWorkerPid: (pid) => pids.push(pid) }),
    );
    expect(result).toEqual({ kind: "message", text: "Via reconcile.", usage: DEFAULT_USAGE });
    expect(launched).toHaveLength(1);
    expect(pids).toEqual([9999]);
  });

  it("fails closed with error(internal) when preflight cannot verify the CLI", async () => {
    const runnerRoot = freshRoot();
    const scratchRoot = freshRoot();
    const codexHome = freshRoot();
    const { port } = fakeSupervisor(runnerRoot, {
      stdout: agentMessageStdout({ schemaVersion: 1, kind: "message", text: "unreachable" }),
    });
    const participant = createCodexParticipant({
      executable: "/usr/bin/true",
      model: "gpt-test",
      codexHome,
      runnerRoot,
      scratchRoot,
      supervisor: port,
      preflight: async () => ({
        ready: false,
        reason: "unsupported-version",
        summary: "Codex 0.0.0 has not passed Factory conformance",
        version: "0.0.0",
      }),
      environmentAllowlist: ["PATH"],
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("rejects a codexHome that does not already exist as a private directory", () => {
    const runnerRoot = freshRoot();
    const scratchRoot = freshRoot();
    const { port } = fakeSupervisor(runnerRoot, {});
    expect(() =>
      createCodexParticipant({
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome: join(runnerRoot, "does-not-exist"),
        runnerRoot,
        scratchRoot,
        supervisor: port,
        preflight: readyPreflight,
        environmentAllowlist: ["PATH"],
      }),
    ).toThrow(TypeError);
  });

  it("rejects a group-readable codexHome", () => {
    const runnerRoot = freshRoot();
    const scratchRoot = freshRoot();
    const codexHome = freshRoot();
    chmodSync(codexHome, 0o750);
    const { port } = fakeSupervisor(runnerRoot, {});
    expect(() =>
      createCodexParticipant({
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome,
        runnerRoot,
        scratchRoot,
        supervisor: port,
        preflight: readyPreflight,
        environmentAllowlist: ["PATH"],
      }),
    ).toThrow(TypeError);
  });

  it("rejects construction when executableDigest does not match the real executable", () => {
    const runnerRoot = freshRoot();
    const scratchRoot = freshRoot();
    const codexHome = freshRoot();
    const { port } = fakeSupervisor(runnerRoot, {});
    expect(() =>
      createCodexParticipant({
        executable: "/usr/bin/true",
        model: "gpt-test",
        codexHome,
        runnerRoot,
        scratchRoot,
        supervisor: port,
        preflight: readyPreflight,
        executableDigest: `sha256:${"0".repeat(64)}`,
        environmentAllowlist: ["PATH"],
      }),
    ).toThrow(TypeError);
  });

  it("accepts construction when executableDigest matches the real executable", async () => {
    const { createHash: hash } = await import("node:crypto");
    const { readFileSync: read } = await import("node:fs");
    const runnerRoot = freshRoot();
    const scratchRoot = freshRoot();
    const codexHome = freshRoot();
    const digest = `sha256:${hash("sha256").update(read("/usr/bin/true")).digest("hex")}`;
    const { port } = fakeSupervisor(runnerRoot, {
      stdout: agentMessageStdout({ schemaVersion: 1, kind: "pass", text: null }),
    });
    const participant = createCodexParticipant({
      executable: "/usr/bin/true",
      model: "gpt-test",
      codexHome,
      runnerRoot,
      scratchRoot,
      supervisor: port,
      preflight: readyPreflight,
      executableDigest: digest,
      environmentAllowlist: ["PATH"],
    });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "pass", usage: DEFAULT_USAGE });
  });
});
