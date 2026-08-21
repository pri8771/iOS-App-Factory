#!/usr/bin/env node
// A stand-in for the `gemini` CLI's `--prompt --output-format json` behavior, driven entirely by
// FAKE_GEMINI_MODE so GeminiParticipant tests never spawn a real CLI. Stdin is never read (the
// real adapter closes it -- `stdio: ["ignore", ...]` -- and passes the instruction via `--prompt`
// instead), matching `createGeminiParticipant`'s actual invocation.

// The mode is smuggled through `--model <mode>` (rather than an env var) because GeminiParticipant
// only forwards a fixed, adapter-owned environment allowlist to the real CLI's env -- exactly what
// these tests exercise -- so there is no env var available to steer this fixture, the same
// convention `fake-claude.mjs` uses.
const modelFlagIndex = process.argv.indexOf("--model");
const mode = modelFlagIndex === -1 ? "success" : (process.argv[modelFlagIndex + 1] ?? "success");

function successEnvelope(response, stats) {
  return JSON.stringify({
    session_id: "fake-session-id",
    response,
    ...(stats === undefined ? {} : { stats }),
  });
}

function errorEnvelope(type, message, code) {
  return JSON.stringify({
    session_id: "fake-session-id",
    error: { type, message, ...(code === undefined ? {} : { code }) },
  });
}

async function main() {
  if (mode === "hang") {
    // A bare `await new Promise(() => undefined)` does not keep Node's event loop alive by itself
    // (no pending handles) -- the process would exit immediately instead of hanging. The interval
    // below is a real handle, so the process genuinely hangs until the parent test kills it.
    await new Promise(() => {
      setInterval(() => undefined, 60_000);
    });
    return;
  }

  if (mode === "crash") {
    process.stderr.write("segfault or something\n");
    process.exit(2);
  }

  if (mode === "not-json") {
    process.stdout.write("this is not json\n");
    process.exit(1);
  }

  // Verified live against the real CLI: a fatal top-level error (e.g. a missing API key) is
  // written to STDERR even under `--output-format json`, never stdout -- these modes mirror that.
  if (mode === "error-limit") {
    process.stderr.write(errorEnvelope("Error", "429 rate limit exceeded, try again in 30s", 41));
    process.exit(1);
  }

  if (mode === "error-capacity-text") {
    process.stderr.write(
      errorEnvelope("Error", "the model is currently overloaded, please try again shortly", 41),
    );
    process.exit(1);
  }

  if (mode === "error-unrecognized") {
    process.stderr.write(errorEnvelope("FatalInputError", "something unexpected happened", 42));
    process.exit(1);
  }

  if (mode === "malformed-schema") {
    process.stdout.write(successEnvelope(JSON.stringify({ notTheRightShape: true })));
    process.exit(0);
  }

  if (mode === "pass") {
    process.stdout.write(
      successEnvelope(JSON.stringify({ schemaVersion: 1, kind: "pass", text: null })),
    );
    process.exit(0);
  }

  if (mode === "success-with-usage") {
    process.stdout.write(
      successEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: "Fake Gemini says hi, with usage.",
        }),
        {
          models: {
            "gemini-2.5-flash": {
              api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 500 },
              tokens: { prompt: 120, candidates: 45, total: 165, cached: 10, thoughts: 0, tool: 0 },
              roles: {},
            },
          },
          tools: {
            totalCalls: 0,
            totalSuccess: 0,
            totalFail: 0,
            totalDurationMs: 0,
            totalDecisions: {},
            byName: {},
          },
          files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
        },
      ),
    );
    process.exit(0);
  }

  if (mode === "echo-args") {
    process.stdout.write(
      successEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: JSON.stringify(process.argv.slice(2)),
        }),
      ),
    );
    process.exit(0);
  }

  if (mode === "echo-env") {
    process.stdout.write(
      successEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: JSON.stringify(process.env),
        }),
      ),
    );
    process.exit(0);
  }

  if (mode === "echo-stdin-length") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const stdinLength = Buffer.concat(chunks).length;
    process.stdout.write(
      successEnvelope(
        JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: JSON.stringify({ stdinLength }),
        }),
      ),
    );
    process.exit(0);
  }

  // "success" (default): a well-formed message contribution with no usage stats at all.
  process.stdout.write(
    successEnvelope(
      JSON.stringify({ schemaVersion: 1, kind: "message", text: "Fake Gemini says hi." }),
    ),
  );
  process.exit(0);
}

main();
