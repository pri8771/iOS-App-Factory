import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  type AgentRunSpecV1,
} from "@app-factory/contracts";

import {
  CODEX_AGENT_ADAPTER_ID,
  CODEX_AGENT_ADAPTER_VERSION,
  materializeCodexRunV1,
  type CodexAdapterIdentityV1,
} from "../src/codex-result.js";
import {
  VERIFIED_CODEX_CLI_VERSIONS,
  type CodexProcessCapture,
  type CodexReportedResultV1,
} from "../src/codex.js";

const SHA256 = `sha256:${"a".repeat(64)}`;
const STARTED_AT = "2026-08-11T12:00:00.000Z";
const FINISHED_AT = "2026-08-11T12:00:01.000Z";

function makeSpec(overrides: Partial<AgentRunSpecV1> = {}): AgentRunSpecV1 {
  return AgentRunSpecV1Schema.parse({
    schemaVersion: 1,
    runId: "00000000-0000-4000-8000-000000000001",
    attemptId: "00000000-0000-4000-8000-000000000002",
    stepId: "00000000-0000-4000-8000-000000000003",
    fence: 7,
    adapterId: CODEX_AGENT_ADAPTER_ID,
    taskSpecDigest: SHA256,
    workingDirectory: "/private/tmp/app-factory-attempt",
    instruction: "Make the bounded source change.",
    authorizedWritePaths: ["Sources/App"],
    environmentAllowlist: ["PATH", "TMPDIR"],
    limits: {
      timeoutMs: 10_000,
      terminationGraceMs: 1_000,
      maxTurns: 1,
      maxEventCount: 50,
      maxStdoutBytes: 100_000,
      maxStderrBytes: 10_000,
    },
    ...overrides,
  });
}

function identity(overrides: Partial<CodexAdapterIdentityV1> = {}): CodexAdapterIdentityV1 {
  return {
    adapterId: CODEX_AGENT_ADAPTER_ID,
    adapterVersion: CODEX_AGENT_ADAPTER_VERSION,
    codexCliVersion: VERIFIED_CODEX_CLI_VERSIONS[0],
    ...overrides,
  };
}

function reportedResult(overrides: Partial<CodexReportedResultV1> = {}): CodexReportedResultV1 {
  return {
    schemaVersion: 1,
    reportedDisposition: "finished",
    summary: "The requested edit is complete.",
    changedPaths: ["Sources/App/Feature.swift"],
    blocker: null,
    ...overrides,
  };
}

function completedJsonl(
  reported: CodexReportedResultV1 = reportedResult(),
  usage: unknown = {
    input_tokens: 120,
    output_tokens: 34,
    cached_input_tokens: 56,
  },
  additionalEvents: readonly unknown[] = [],
): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "turn.started" }),
    ...additionalEvents.map((event) => JSON.stringify(event)),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "item-1",
        type: "agent_message",
        text: JSON.stringify(reported),
      },
    }),
    JSON.stringify({ type: "turn.completed", usage }),
    "",
  ].join("\n");
}

function failedJsonl(message: string): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "turn.failed", error: { message } }),
    "",
  ].join("\n");
}

function capture(overrides: Partial<CodexProcessCapture> = {}): CodexProcessCapture {
  return {
    exitCode: 0,
    signal: null,
    terminationOrigin: "none",
    stdout: completedJsonl(),
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

function materialize(
  options: Readonly<{
    spec?: AgentRunSpecV1;
    identity?: CodexAdapterIdentityV1;
    capture?: CodexProcessCapture;
    startedAt?: string;
    finishedAt?: string;
  }> = {},
) {
  return materializeCodexRunV1({
    spec: options.spec ?? makeSpec(),
    identity: options.identity ?? identity(),
    capture: options.capture ?? capture(),
    startedAt: options.startedAt ?? STARTED_AT,
    finishedAt: options.finishedAt ?? FINISHED_AT,
  });
}

describe("Codex run result materialization", () => {
  it("maps a valid finished self-report to process success while preserving downstream trust", () => {
    const artifacts = materialize();

    expect(artifacts.result).toMatchObject({
      status: "succeeded",
      process: { exitCode: 0, signal: null },
      failure: null,
      blocker: null,
      usage: { inputTokens: 120, outputTokens: 34, cachedInputTokens: 56 },
      finalEventSequence: artifacts.events.length,
    });
    expect(AgentRunResultV1Schema.safeParse(artifacts.result).success).toBe(true);
    expect(artifacts.events.map((event) => event.type)).toEqual([
      "agent.started",
      "agent.progress",
      "agent.progress",
      "agent.finished",
    ]);
    expect(artifacts.events.at(-1)).toMatchObject({
      type: "agent.finished",
      data: { status: "succeeded" },
    });
    expect(artifacts.events.every((event) => AgentEventV1Schema.safeParse(event).success)).toBe(
      true,
    );
  });

  it("maps each structured process classification to its strict result status", () => {
    const reportedFailure = materialize({
      capture: capture({
        stdout: completedJsonl(
          reportedResult({
            reportedDisposition: "failed",
            summary: "The source was internally inconsistent.",
            changedPaths: [],
          }),
        ),
      }),
    });
    expect(reportedFailure.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.reported-failure", retryable: false },
    });

    const structuredBlocker = materialize({
      capture: capture({
        stdout: completedJsonl(
          reportedResult({
            reportedDisposition: "blocked",
            summary: "A product decision is needed.",
            changedPaths: [],
            blocker: {
              kind: "clarification",
              code: "product.decision-needed",
              summary: "Choose the intended behavior.",
              requiredAction: "Choose option A or B.",
            },
          }),
        ),
      }),
    });
    expect(structuredBlocker.result).toMatchObject({
      status: "blocked",
      blocker: { kind: "clarification", code: "product.decision-needed" },
    });
    expect(structuredBlocker.events.map((event) => event.type)).toContain("agent.blocked");

    const authentication = materialize({
      capture: capture({
        exitCode: 1,
        stdout: failedJsonl("401 Unauthorized: missing bearer authentication"),
      }),
    });
    expect(authentication.result).toMatchObject({
      status: "blocked",
      blocker: { kind: "authentication", code: "agent.authentication-required" },
    });

    const processFailure = materialize({
      capture: capture({ exitCode: 1, stdout: failedJsonl("runner transport failed") }),
    });
    expect(processFailure.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.process-failed", retryable: true },
    });

    const cancelled = materialize({
      capture: capture({ exitCode: null, signal: "SIGTERM", terminationOrigin: "cancelled" }),
    });
    expect(cancelled.result).toMatchObject({
      status: "cancelled",
      failure: { code: "agent.cancelled", retryable: false },
    });

    const timedOut = materialize({
      capture: capture({ exitCode: null, signal: "SIGKILL", terminationOrigin: "timed-out" }),
    });
    expect(timedOut.result).toMatchObject({
      status: "timed-out",
      failure: { code: "agent.timed-out", retryable: true },
    });

    const protocolError = materialize({ capture: capture({ stdout: "not-json\n" }) });
    expect(protocolError.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.protocol-error", retryable: false },
    });
  });

  it("hashes the exact UTF-8 output bytes and does not invent truncation provenance", () => {
    const stderr = "diagnostic: café ☕";
    const stdout = completedJsonl();
    const { result } = materialize({ capture: capture({ stdout, stderr }) });

    expect(result.stdout).toEqual({
      digest: `sha256:${createHash("sha256").update(stdout, "utf8").digest("hex")}`,
      byteLength: Buffer.byteLength(stdout, "utf8"),
      truncated: false,
    });
    expect(result.stderr).toEqual({
      digest: `sha256:${createHash("sha256").update(stderr, "utf8").digest("hex")}`,
      byteLength: Buffer.byteLength(stderr, "utf8"),
      truncated: false,
    });
  });

  it("preserves output truncation provenance and fails closed on overflow", () => {
    const stdout = completedJsonl();
    const overflow = materialize({
      capture: capture({
        exitCode: null,
        signal: "SIGTERM",
        terminationOrigin: "output-overflow",
        stdout,
        stdoutTruncated: true,
      }),
    });

    expect(overflow.result).toMatchObject({
      status: "failed",
      stdout: {
        byteLength: Buffer.byteLength(stdout, "utf8"),
        truncated: true,
      },
      stderr: { truncated: false },
      failure: { code: "agent.output-limit-exceeded", retryable: false },
    });
    expect(() =>
      materialize({
        capture: capture({
          terminationOrigin: "output-overflow",
          stdoutTruncated: false,
          stderrTruncated: false,
        }),
      }),
    ).toThrow(/requires truncated output provenance/u);
  });

  it("fails closed and non-retryably for stdout, stderr, event, and turn limit violations", () => {
    const normalStdout = completedJsonl();
    const stdoutLimited = materialize({
      spec: makeSpec({
        limits: { ...makeSpec().limits, maxStdoutBytes: Buffer.byteLength(normalStdout) - 1 },
      }),
      capture: capture({ stdout: normalStdout }),
    });
    expect(stdoutLimited.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.protocol-error", retryable: false },
    });

    const stderrLimited = materialize({
      spec: makeSpec({ limits: { ...makeSpec().limits, maxStderrBytes: 3 } }),
      capture: capture({ stderr: "four" }),
    });
    expect(stderrLimited.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.stderr-limit-exceeded", retryable: false },
    });

    const eventLimited = materialize({
      spec: makeSpec({ limits: { ...makeSpec().limits, maxEventCount: 3 } }),
    });
    expect(eventLimited.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.protocol-error", retryable: false },
      finalEventSequence: 3,
    });
    expect(eventLimited.events).toHaveLength(3);

    const twoTurns = completedJsonl(reportedResult(), {}, [{ type: "turn.started" }]);
    const turnLimited = materialize({ capture: capture({ stdout: twoTurns }) });
    expect(turnLimited.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.turn-limit-exceeded", retryable: false },
    });
  });

  it("parses only valid recognized usage values from a completed terminal turn", () => {
    expect(
      materialize({
        capture: capture({
          stdout: completedJsonl(reportedResult(), {
            input_tokens: 1,
            output_tokens: 2,
            cached_input_tokens: 0,
            future_field: 99,
          }),
        }),
      }).result.usage,
    ).toEqual({ inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 });

    expect(
      materialize({
        capture: capture({
          stdout: completedJsonl(reportedResult(), {
            input_tokens: -1,
            output_tokens: 2,
            cached_input_tokens: 0,
          }),
        }),
      }).result.usage,
    ).toBeNull();
    expect(
      materialize({ capture: capture({ stdout: completedJsonl(reportedResult(), {}) }) }).result
        .usage,
    ).toBeNull();
  });

  it("accepts exact and descendant paths but rejects prefix siblings", () => {
    const exact = materialize({
      capture: capture({
        stdout: completedJsonl(reportedResult({ changedPaths: ["Sources/App"] })),
      }),
    });
    expect(exact.result.status).toBe("succeeded");

    const descendant = materialize({
      capture: capture({
        stdout: completedJsonl(
          reportedResult({ changedPaths: ["Sources/App/Nested/Feature.swift"] }),
        ),
      }),
    });
    expect(descendant.result.status).toBe("succeeded");

    const sibling = materialize({
      capture: capture({
        stdout: completedJsonl(reportedResult({ changedPaths: ["Sources/Application.swift"] })),
      }),
    });
    expect(sibling.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.write-scope-violation", retryable: false },
    });
  });

  it("fails closed for adapter, implementation-version, and CLI-version identity mismatches", () => {
    for (const mismatchedIdentity of [
      identity({ adapterId: "anthropic.claude" }),
      identity({ adapterVersion: "2.0.0" }),
      identity({ codexCliVersion: "999.0.0" }),
    ]) {
      const { result } = materialize({ identity: mismatchedIdentity });
      expect(result).toMatchObject({
        status: "failed",
        failure: { code: "agent.identity-mismatch", retryable: false },
      });
    }
  });

  it("rejects invalid timestamp ordering and fails closed when a normal exit misses its deadline", () => {
    expect(() => materialize({ startedAt: FINISHED_AT, finishedAt: STARTED_AT })).toThrow(
      /must not precede/,
    );
    expect(() => materialize({ startedAt: "2026-08-11T12:00:00Z" })).toThrow();

    const late = materialize({ finishedAt: "2026-08-11T12:00:11.000Z" });
    expect(late.result).toMatchObject({
      status: "failed",
      failure: { code: "agent.deadline-invariant-violated", retryable: false },
    });
  });

  it("emits stable bounded IDs derived from bindings, identity, output, and event content", () => {
    const first = materialize();
    const replay = materialize();
    expect(replay).toEqual(first);
    expect(new Set(first.events.map((event) => event.eventId)).size).toBe(first.events.length);

    const changedOutput = materialize({ capture: capture({ stderr: "different" }) });
    expect(changedOutput.events.map((event) => event.eventId)).not.toEqual(
      first.events.map((event) => event.eventId),
    );

    const changedBinding = materialize({
      spec: makeSpec({ runId: "00000000-0000-4000-8000-000000000009" }),
    });
    expect(changedBinding.events.map((event) => event.eventId)).not.toEqual(
      first.events.map((event) => event.eventId),
    );
    expect(
      changedBinding.events.every((event) => event.runId === changedBinding.result.runId),
    ).toBe(true);

    const invalidIdentity = materialize({ identity: identity({ adapterVersion: "2.0.0" }) });
    const differentInvalidIdentity = materialize({
      identity: identity({ adapterVersion: "3.0.0" }),
    });
    expect(differentInvalidIdentity.events.map((event) => event.eventId)).not.toEqual(
      invalidIdentity.events.map((event) => event.eventId),
    );

    const oneEvent = materialize({
      spec: makeSpec({ limits: { ...makeSpec().limits, maxEventCount: 1 } }),
    });
    expect(oneEvent.events).toHaveLength(1);
    expect(oneEvent.events[0]).toMatchObject({
      sequence: 1,
      type: "agent.finished",
      data: { status: "failed" },
    });
    expect(oneEvent.result.finalEventSequence).toBe(1);

    const twoEvents = materialize({
      spec: makeSpec({ limits: { ...makeSpec().limits, maxEventCount: 2 } }),
    });
    expect(twoEvents.events.map((event) => event.type)).toEqual([
      "agent.started",
      "agent.finished",
    ]);
    expect(twoEvents.events.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("materializes the Codex CLI 0.147.0-alpha.6.6 live-captured stream with its expanded usage payload", () => {
    // Verbatim stream captured live from `codex exec` 0.147.0-alpha.6.6 (paths
    // and thread ids normalized). The terminal usage object carries the new
    // `cache_write_input_tokens` and `reasoning_output_tokens` fields, which
    // must be ignored without discarding the recognized token counts.
    const recorded = [
      '{"type":"thread.started","thread_id":"01a00112-1c71-75b2-afd4-aee8459e07c7"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Creating the requested file."}}',
      '{"type":"item.started","item":{"id":"item_1","type":"file_change","changes":[{"path":"/private/tmp/app-factory-attempt/Sources/App/Feature.swift","kind":"add"}],"status":"in_progress"}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"/private/tmp/app-factory-attempt/Sources/App/Feature.swift","kind":"add"}],"status":"completed"}}',
      '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\\"schemaVersion\\":1,\\"reportedDisposition\\":\\"finished\\",\\"summary\\":\\"Created the requested file.\\",\\"changedPaths\\":[\\"Sources/App/Feature.swift\\"],\\"blocker\\":null}"}}',
      '{"type":"turn.completed","usage":{"input_tokens":18613,"cached_input_tokens":18176,"cache_write_input_tokens":0,"output_tokens":153,"reasoning_output_tokens":34}}',
      "",
    ].join("\n");

    const artifacts = materialize({
      identity: identity({ codexCliVersion: "0.147.0-alpha.6.6" }),
      capture: capture({ stdout: recorded }),
    });
    expect(artifacts.result).toMatchObject({
      status: "succeeded",
      usage: { inputTokens: 18613, outputTokens: 153, cachedInputTokens: 18176 },
    });
  });

  it("rejects malformed process captures before emitting schema-invalid evidence", () => {
    expect(() => materialize({ capture: capture({ exitCode: 256 }) })).toThrow(/exit code/);
    expect(() => materialize({ capture: capture({ signal: "TERM" as NodeJS.Signals }) })).toThrow(
      /signal/,
    );
  });
});
