import { fileURLToPath } from "node:url";

import { RoomPersonaSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { createClaudeParticipant } from "../src/index.js";
import type { ParticipantContext } from "../src/index.js";
import { neverAbortedSignal } from "./helpers.js";

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));

function context(overrides: Partial<ParticipantContext> = {}): ParticipantContext {
  return {
    persona: RoomPersonaSchema.parse("claude-critic"),
    roomCharter: "Design review room.",
    rollingSummary: "",
    personaCharter: "Claude Critic, pressure-tests every plan.",
    transcript: [{ author: "priyansh", body: "What's the riskiest assumption here?" }],
    networkEnabled: false,
    maxOutputTokens: 1_000,
    signal: neverAbortedSignal(),
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

function participant(mode: string, timeoutMs = 5_000) {
  return createClaudeParticipant({
    executable: FAKE_CLAUDE,
    // The fixture reads its behavior back out of --model (see fake-claude.mjs);
    // "sonnet" (used by the echo-args test) exercises the real default shape.
    model: mode,
    timeoutMs,
    sourceEnvironment: process.env,
  });
}

describe("createClaudeParticipant", () => {
  it("invokes the CLI headless, print/json/plan/no-session-persistence/no-tools/no-mcp/no-settings", async () => {
    const result = await participant("echo-args").contribute(context());
    expect(result.kind).toBe("message");
    const args: string[] = JSON.parse((result as { text: string }).text);
    expect(args).toContain("-p");
    expect(args).toEqual(expect.arrayContaining(["--output-format", "json"]));
    expect(args).toEqual(expect.arrayContaining(["--permission-mode", "plan"]));
    expect(args).toContain("--no-session-persistence");
    expect(args).toEqual(expect.arrayContaining(["--tools", ""]));
    expect(args).toContain("--strict-mcp-config");
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", ""]));
    expect(args).toEqual(expect.arrayContaining(["--model", "echo-args"]));
  });

  it("parses a successful message contribution", async () => {
    const result = await participant("success").contribute(context());
    expect(result).toMatchObject({ kind: "message", text: "Fake Claude says hi." });
  });

  it("maps api_error_status 429 to error(limit)", async () => {
    const result = await participant("error-limit").contribute(context());
    expect(result).toEqual({ kind: "error", code: "limit", retryAfterMs: null });
  });

  it("maps free-text 'overloaded ... try again shortly' to error(capacity) with a parsed reset", async () => {
    const result = await participant("error-capacity-text").contribute(context());
    expect(result).toMatchObject({ kind: "error", code: "capacity" });
  });

  it("maps an unrecognized error subtype to error(internal), fail closed", async () => {
    const result = await participant("error-unrecognized").contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("maps a crashed process with no parseable envelope to error(internal)", async () => {
    const result = await participant("crash").contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("fails closed on output that does not match the room contribution schema", async () => {
    const result = await participant("malformed-schema").contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("maps a hard timeout to error(timeout) and kills the process", async () => {
    const result = await participant("hang", 1_000).contribute(context());
    expect(result).toEqual({ kind: "error", code: "timeout", retryAfterMs: null });
  });

  it("honors an external abort signal", async () => {
    const controller = new AbortController();
    const promise = participant("hang", 60_000).contribute(context({ signal: controller.signal }));
    controller.abort();
    const result = await promise;
    expect(result).toEqual({ kind: "error", code: "timeout", retryAfterMs: null });
  });

  it("reports the worker pid before the process exits", async () => {
    const pids: number[] = [];
    const result = await participant("success").contribute(
      context({ reportWorkerPid: (pid) => pids.push(pid) }),
    );
    expect(result.kind).toBe("message");
    expect(pids).toHaveLength(1);
    expect(pids[0]).toBeGreaterThan(0);
  });

  it("rejects a relative executable path", () => {
    expect(() => createClaudeParticipant({ executable: "claude", model: "sonnet" })).toThrow(
      TypeError,
    );
  });
});
