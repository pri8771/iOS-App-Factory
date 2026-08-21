#!/usr/bin/env node
// A stand-in for the `claude` CLI's `-p --output-format json` behavior, driven
// entirely by FAKE_CLAUDE_MODE so ClaudeParticipant tests never spawn a real
// CLI. Reads (and discards) stdin, like the real CLI does for `-p` with no
// positional prompt argument.

// The mode is smuggled through `--model <mode>` (rather than an env var)
// because ClaudeParticipant only forwards a fixed, adapter-owned environment
// allowlist to the real CLI's env -- exactly what these tests exercise -- so
// there is no env var available to steer this fixture.
const modelFlagIndex = process.argv.indexOf("--model");
const mode = modelFlagIndex === -1 ? "success" : (process.argv[modelFlagIndex + 1] ?? "success");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  await readStdin();

  if (mode === "hang") {
    // A bare `await new Promise(() => undefined)` does not keep Node's event
    // loop alive by itself (no pending handles) -- the process would exit
    // immediately instead of hanging. The interval below is a real handle,
    // so the process genuinely hangs until the parent test kills it.
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

  if (mode === "error-limit") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "error",
        is_error: true,
        api_error_status: 429,
        result: "rate limit exceeded",
      }),
    );
    process.exit(1);
  }

  if (mode === "error-capacity-text") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "error",
        is_error: true,
        api_error_status: null,
        result: "the model is currently overloaded, please try again shortly",
      }),
    );
    process.exit(1);
  }

  if (mode === "error-unrecognized") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        api_error_status: null,
        errors: ["Reached maximum budget ($0.0001)"],
        result: null,
      }),
    );
    process.exit(1);
  }

  if (mode === "malformed-schema") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: JSON.stringify({ notTheRightShape: true }),
      }),
    );
    process.exit(0);
  }

  if (mode === "success-with-usage") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        api_error_status: null,
        result: JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: "Fake Claude says hi, with usage.",
        }),
        usage: { input_tokens: 120, output_tokens: 45, cache_read_input_tokens: 10 },
        total_cost_usd: 0.0034,
      }),
    );
    process.exit(0);
  }

  if (mode === "echo-args") {
    process.stdout.write(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        api_error_status: null,
        result: JSON.stringify({
          schemaVersion: 1,
          kind: "message",
          text: JSON.stringify(process.argv.slice(2)),
        }),
      }),
    );
    process.exit(0);
  }

  // "success" (default): echo a well-formed pass or message based on stdin content check omitted for simplicity.
  process.stdout.write(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      api_error_status: null,
      result: JSON.stringify({ schemaVersion: 1, kind: "message", text: "Fake Claude says hi." }),
    }),
  );
  process.exit(0);
}

main();
