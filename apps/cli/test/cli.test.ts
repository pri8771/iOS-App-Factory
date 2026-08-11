import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  parseCliArguments,
  renderCliError,
  renderCommandResult,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const NOW = "2026-08-10T12:00:00.000Z";

describe("CLI argument parser", () => {
  it.each([
    [["doctor"], { outputMode: "human", command: { kind: "doctor" } }],
    [
      ["--json", "submit", "--task", "task.json"],
      { outputMode: "json", command: { kind: "task.submit", taskFile: "task.json" } },
    ],
    [
      ["run", "--task", "task.json", "--json"],
      { outputMode: "json", command: { kind: "task.run", taskFile: "task.json" } },
    ],
    [
      ["status", ATTEMPT_ID],
      { outputMode: "human", command: { kind: "attempt.status", attemptId: ATTEMPT_ID } },
    ],
    [
      ["events", ATTEMPT_ID, "--after", "7", "--limit", "25"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.events",
          attemptId: ATTEMPT_ID,
          afterSequence: 7,
          limit: 25,
        },
      },
    ],
    [
      ["pause", ATTEMPT_ID, "--reason", "Review requested"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.pause",
          attemptId: ATTEMPT_ID,
          reason: "Review requested",
        },
      },
    ],
    [
      ["resume", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "attempt.resume", attemptId: ATTEMPT_ID, reason: null },
      },
    ],
    [
      ["cancel", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "attempt.cancel", attemptId: ATTEMPT_ID, reason: null },
      },
    ],
    [
      ["reconcile"],
      { outputMode: "human", command: { kind: "daemon.reconcile", attemptId: null } },
    ],
    [
      ["reconcile", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "daemon.reconcile", attemptId: ATTEMPT_ID },
      },
    ],
  ])("parses %j", (arguments_, expected) => {
    expect(parseCliArguments(arguments_)).toEqual(expected);
  });

  it.each([
    [[]],
    [["unknown"]],
    [["doctor", "extra"]],
    [["submit"]],
    [["status", "not-an-id"]],
    [["events", ATTEMPT_ID, "--limit", "0"]],
    [["events", ATTEMPT_ID, "--limit", "1001"]],
    [["pause", ATTEMPT_ID, "--reason"]],
    [["doctor", "--json", "--json"]],
    [["service"]],
    [["service", "install", "--config", "service.json"]],
    [["service", "plan", "--config", "service.json"]],
  ])("rejects invalid arguments %j", (arguments_) => {
    expect(() => parseCliArguments(arguments_)).toThrow(CliUsageError);
  });
});

describe("CLI output renderer", () => {
  it("renders concise deterministic human output", () => {
    expect(
      renderCommandResult(
        {
          operation: "doctor",
          readiness: "ready",
          daemonVersion: "0.1.0",
          protocolVersion: 1,
          startedAt: NOW,
          issues: [],
        },
        "human",
      ),
    ).toBe("daemon ready (v0.1.0, protocol 1)\n");

    expect(
      renderCommandResult(
        {
          operation: "attempt.events",
          events: [],
          nextAfterSequence: 0,
        },
        "human",
      ),
    ).toBe("no events\n");
  });

  it("renders machine-stable JSON success and failure envelopes", () => {
    const success = renderCommandResult(
      {
        operation: "daemon.reconcile",
        accepted: true,
        reconciledAttemptIds: [],
      },
      "json",
    );
    expect(JSON.parse(success)).toEqual({
      ok: true,
      result: { operation: "daemon.reconcile", accepted: true, reconciledAttemptIds: [] },
    });

    const failure = renderCliError(new CliUsageError("Bad input."), "json");
    expect(JSON.parse(failure)).toEqual({
      ok: false,
      error: { code: "cli.usage", message: "Bad input.", retryable: false },
    });
  });
});
