import { fileURLToPath } from "node:url";

import { RoomPersonaSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { createGeminiParticipant } from "../src/index.js";
import type { ParticipantContext } from "../src/index.js";
import { neverAbortedSignal } from "./helpers.js";

const FAKE_GEMINI = fileURLToPath(new URL("./fixtures/fake-gemini.mjs", import.meta.url));

function context(overrides: Partial<ParticipantContext> = {}): ParticipantContext {
  return {
    persona: RoomPersonaSchema.parse("gemini-critic"),
    roomCharter: "Design review room.",
    rollingSummary: "",
    personaCharter: "Gemini Critic, pressure-tests every plan.",
    transcript: [{ author: "priyansh", body: "What's the riskiest assumption here?" }],
    networkEnabled: false,
    maxOutputTokens: 1_000,
    signal: neverAbortedSignal(),
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

function participant(
  mode: string,
  timeoutMs = 5_000,
  overrides: Partial<Parameters<typeof createGeminiParticipant>[0]> = {},
) {
  return createGeminiParticipant({
    executable: FAKE_GEMINI,
    // The fixture reads its behavior back out of --model (see fake-gemini.mjs); "echo-args" (used
    // by the flags test) exercises the real default shape.
    model: mode,
    timeoutMs,
    sourceEnvironment: process.env,
    ...overrides,
  });
}

describe("createGeminiParticipant", () => {
  it("invokes the CLI headless: prompt/json/plan/skip-trust/no-mcp-servers, model forwarded", async () => {
    const result = await participant("echo-args").contribute(context());
    expect(result.kind).toBe("message");
    const args: string[] = JSON.parse((result as { text: string }).text);
    expect(args).toEqual(expect.arrayContaining(["--model", "echo-args"]));
    expect(args).toContain("--prompt");
    expect(args).toEqual(expect.arrayContaining(["--output-format", "json"]));
    expect(args).toEqual(expect.arrayContaining(["--approval-mode", "plan"]));
    expect(args).toContain("--skip-trust");
    expect(args).toContain("--allowed-mcp-server-names");
    // The instruction is carried as the --prompt argv value, never on stdin.
    const promptIndex = args.indexOf("--prompt");
    expect(args[promptIndex + 1]).toContain("Design review room.");
  });

  it("closes stdin rather than writing the instruction to it", async () => {
    const result = await participant("echo-stdin-length").contribute(context());
    expect(result).toMatchObject({ kind: "message", text: JSON.stringify({ stdinLength: 0 }) });
  });

  it("parses a successful message contribution", async () => {
    const result = await participant("success").contribute(context());
    expect(result).toMatchObject({ kind: "message", text: "Fake Gemini says hi." });
  });

  it("falls back to the len/4 tokensUsed estimate and reported null when the envelope carries no stats", async () => {
    const result = await participant("success").contribute(context());
    const expectedTokensUsed = Math.ceil("Fake Gemini says hi.".length / 4);
    expect(result).toEqual({
      kind: "message",
      text: "Fake Gemini says hi.",
      usage: { tokensUsed: expectedTokensUsed, reported: null, costUsdMicros: null },
    });
  });

  it("reports honest usage (summed from stats.models[*].tokens) and a null cost -- gemini never self-reports a dollar cost", async () => {
    const result = await participant("success-with-usage").contribute(context());
    expect(result).toEqual({
      kind: "message",
      text: "Fake Gemini says hi, with usage.",
      usage: {
        // The real candidates (output) token figure wins over the len/4 estimate.
        tokensUsed: 45,
        reported: { inputTokens: 120, outputTokens: 45, cachedInputTokens: 10 },
        costUsdMicros: null,
      },
    });
  });

  it("parses a pass contribution", async () => {
    const result = await participant("pass").contribute(context());
    expect(result).toEqual({
      kind: "pass",
      usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
    });
  });

  it("maps a free-text '429 rate limit' error (on stderr, matching the real CLI) to error(limit)", async () => {
    const result = await participant("error-limit").contribute(context());
    expect(result).toMatchObject({ kind: "error", code: "limit" });
  });

  it("maps free-text 'overloaded ... try again shortly' to error(capacity)", async () => {
    const result = await participant("error-capacity-text").contribute(context());
    expect(result).toMatchObject({ kind: "error", code: "capacity" });
  });

  it("maps an unrecognized error to error(internal), fail closed", async () => {
    const result = await participant("error-unrecognized").contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("maps a crashed process with no parseable envelope on either stream to error(internal)", async () => {
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
    expect(() =>
      createGeminiParticipant({ executable: "gemini", model: "gemini-2.5-flash" }),
    ).toThrow(TypeError);
  });

  describe("environment scrubbing", () => {
    it("never forwards GEMINI_API_KEY or GOOGLE_API_KEY to the child, even when present in sourceEnvironment", async () => {
      const result = await participant("echo-env", 5_000, {
        sourceEnvironment: {
          ...process.env,
          GEMINI_API_KEY: "leaked-gemini-key-should-never-appear",
          GOOGLE_API_KEY: "leaked-google-key-should-never-appear",
        },
      }).contribute(context());
      expect(result.kind).toBe("message");
      const env = JSON.parse((result as { text: string }).text) as Record<string, string>;
      expect(env.GEMINI_API_KEY).toBeUndefined();
      expect(env.GOOGLE_API_KEY).toBeUndefined();
      const serialized = JSON.stringify(env);
      expect(serialized).not.toContain("leaked-gemini-key-should-never-appear");
      expect(serialized).not.toContain("leaked-google-key-should-never-appear");
    });

    it("rejects an environmentAllowlist entry outside the adapter-owned safe list", () => {
      expect(() =>
        createGeminiParticipant({
          executable: FAKE_GEMINI,
          model: "gemini-2.5-flash",
          environmentAllowlist: ["GEMINI_API_KEY"],
        }),
      ).toThrow(TypeError);
    });

    it("rejects any environment name matching the sensitive-name pattern even if hypothetically allowlisted", () => {
      // GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES never actually contains a sensitive-looking name, but
      // the guard itself is exercised directly the same way it protects Claude: TMPDIR is safe,
      // "TMPDIR_TOKEN" is not in the safe set at all, so the safe-allowlist check fires first here
      // -- the two guards are independent defense-in-depth layers, both proven by construction
      // since GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES contains no sensitive-pattern name.
      for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "AUTH_TOKEN", "SESSION_SECRET"]) {
        expect(() =>
          createGeminiParticipant({
            executable: FAKE_GEMINI,
            model: "gemini-2.5-flash",
            environmentAllowlist: [name],
          }),
        ).toThrow(TypeError);
      }
    });

    it("only ever forwards names from GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES, mirroring Claude's list exactly", async () => {
      const { GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES, CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES } =
        await import("../src/index.js");
      expect([...GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES].sort()).toEqual(
        [...CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES].sort(),
      );
    });
  });
});
