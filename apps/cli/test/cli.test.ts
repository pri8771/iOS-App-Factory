import { describe, expect, it } from "vitest";

import { CommandClientError } from "@app-factory/command-client";

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
    [["portfolio"], { outputMode: "human", command: { kind: "portfolio.snapshot" } }],
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
    [
      ["evidence", "list", "--after", ATTEMPT_ID, "--limit", "25"],
      {
        outputMode: "human",
        command: { kind: "evidence.list", afterAttemptId: ATTEMPT_ID, limit: 25 },
      },
    ],
    [
      ["evidence", "inspect", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "evidence.inspect", attemptId: ATTEMPT_ID },
      },
    ],
    [
      ["evidence", "verify", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "evidence.verify", attemptId: ATTEMPT_ID },
      },
    ],
  ])("parses %j", (arguments_, expected) => {
    expect(parseCliArguments(arguments_)).toEqual({ ...expected, retryIdentity: null });
  });

  it("accepts the complete durable identity needed to retry an ambiguous command", () => {
    expect(
      parseCliArguments([
        "pause",
        ATTEMPT_ID,
        "--command-id",
        "00000000-0000-4000-8000-000000000004",
        "--issued-at",
        NOW,
      ]),
    ).toMatchObject({
      retryIdentity: {
        commandId: "00000000-0000-4000-8000-000000000004",
        issuedAt: NOW,
      },
      command: { kind: "attempt.pause", attemptId: ATTEMPT_ID },
    });
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
    [["evidence"]],
    [["evidence", "list", "--limit", "101"]],
    [["evidence", "inspect", "not-an-id"]],
    [["doctor", "--json", "--json"]],
    [["service"]],
    [["service", "install", "--config", "service.json"]],
    [["service", "plan", "--config", "service.json"]],
    [["doctor", "--command-id", "00000000-0000-4000-8000-000000000004"]],
    [["doctor", "--issued-at", NOW]],
    [["doctor", "--command-id", "not-an-id", "--issued-at", NOW]],
    [
      [
        "doctor",
        "--command-id",
        "00000000-0000-4000-8000-000000000004",
        "--issued-at",
        "not-an-instant",
      ],
    ],
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

    expect(
      renderCommandResult(
        {
          operation: "portfolio.snapshot",
          snapshot: {
            schemaVersion: 1,
            generatedAt: NOW,
            projects: [],
            totals: {
              projects: 0,
              attempts: 0,
              activeAttempts: 0,
              blockers: 0,
              openPullRequests: null,
              jiraTodo: null,
              jiraInProgress: null,
              unresolvedP0: null,
              unresolvedP1: null,
            },
            sourceSnapshotDigest: `sha256:${"a".repeat(64)}`,
          },
        },
        "human",
      ),
    ).toBe(
      "portfolio: 0 projects, 0 attempts, 0 active, 0 blockers; PRs unavailable, Jira todo unavailable, P0 unavailable, P1 unavailable\n",
    );
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

  it("renders a reusable durable identity for an ambiguous delivery failure", () => {
    const retryIdentity = {
      commandId: "00000000-0000-4000-8000-000000000004",
      issuedAt: NOW,
    } as const;
    const error = new CommandClientError(
      "transport.remote-closed",
      "The command response was lost.",
      true,
      retryIdentity,
    );

    expect(JSON.parse(renderCliError(error, "json"))).toEqual({
      ok: false,
      error: {
        code: "transport.remote-closed",
        message: "The command response was lost.",
        retryable: true,
        retryIdentity,
      },
    });
    expect(renderCliError(error, "human")).toContain(
      `--command-id ${retryIdentity.commandId} --issued-at ${retryIdentity.issuedAt}`,
    );
  });
});
