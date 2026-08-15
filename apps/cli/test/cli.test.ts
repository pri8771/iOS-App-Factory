import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CommandClientError } from "@app-factory/command-client";

import {
  CliUsageError,
  parseCliArguments,
  renderCliError,
  renderCommandResult,
  runCli,
  type CliIo,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const PROJECT_ID = "00000000-0000-4000-8000-000000000006";
const NOW = "2026-08-10T12:00:00.000Z";
const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";
const PLAN_DIGEST = `sha256:${"a".repeat(64)}`;

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
      ["attempts"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.list",
          scope: "active",
          projectId: null,
          after: null,
          limit: 50,
        },
      },
    ],
    [
      [
        "attempts",
        "--all",
        "--project",
        PROJECT_ID,
        "--after-updated-at",
        NOW,
        "--after-attempt",
        ATTEMPT_ID,
        "--limit",
        "25",
      ],
      {
        outputMode: "human",
        command: {
          kind: "attempt.list",
          scope: "all",
          projectId: PROJECT_ID,
          after: { updatedAt: NOW, attemptId: ATTEMPT_ID },
          limit: 25,
        },
      },
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
      ["retry", "00000000-0000-4000-8000-000000000008", ATTEMPT_ID],
      {
        outputMode: "human",
        command: {
          kind: "task.retry",
          taskId: "00000000-0000-4000-8000-000000000008",
          attemptId: ATTEMPT_ID,
        },
      },
    ],
    [
      ["unblock", ATTEMPT_ID, "--answer", "Use staging."],
      {
        outputMode: "human",
        command: { kind: "attempt.unblock", attemptId: ATTEMPT_ID, answer: "Use staging." },
      },
    ],
    [
      ["blocker", ATTEMPT_ID],
      { outputMode: "human", command: { kind: "attempt.blocker", attemptId: ATTEMPT_ID } },
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
    [
      ["project", "scan", "/repo/app"],
      { outputMode: "human", command: { kind: "project.scan", repositoryRoot: "/repo/app" } },
    ],
    [
      ["project", "plan", PLAN_DIGEST],
      { outputMode: "human", command: { kind: "project.enroll-plan", planDigest: PLAN_DIGEST } },
    ],
    [
      ["project", "apply", PLAN_DIGEST],
      {
        outputMode: "human",
        command: { kind: "project.apply", planDigest: PLAN_DIGEST, branchName: null },
      },
    ],
    [
      ["--json", "project", "apply", PLAN_DIGEST, "--branch", "app-factory/enroll-abc123"],
      {
        outputMode: "json",
        command: {
          kind: "project.apply",
          planDigest: PLAN_DIGEST,
          branchName: "app-factory/enroll-abc123",
        },
      },
    ],
    [["effects", "status"], { outputMode: "human", command: { kind: "effects.status" } }],
    [
      ["effects", "list"],
      {
        outputMode: "human",
        command: { kind: "effects.list", state: null, provider: null, after: null, limit: 50 },
      },
    ],
    [
      ["effects", "list", "--state", "planned", "--provider", "github", "--limit", "10"],
      {
        outputMode: "human",
        command: {
          kind: "effects.list",
          state: "planned",
          provider: "github",
          after: null,
          limit: 10,
        },
      },
    ],
    [
      [
        "effects",
        "list",
        "--after-updated-at",
        NOW,
        "--after-effect",
        "00000000-0000-4000-8000-000000000009",
      ],
      {
        outputMode: "human",
        command: {
          kind: "effects.list",
          state: null,
          provider: null,
          after: { updatedAt: NOW, effectId: "00000000-0000-4000-8000-000000000009" },
          limit: 50,
        },
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
    [["attempts", "--project", "not-an-id"]],
    [["attempts", "--after-updated-at", NOW]],
    [["attempts", "--after-attempt", ATTEMPT_ID]],
    [["attempts", "--after-updated-at", "not-an-instant", "--after-attempt", ATTEMPT_ID]],
    [["attempts", "--limit", "101"]],
    [["attempts", "--all", "--all"]],
    [["events", ATTEMPT_ID, "--limit", "0"]],
    [["events", ATTEMPT_ID, "--limit", "1001"]],
    [["pause", ATTEMPT_ID, "--reason"]],
    [["retry", ATTEMPT_ID]],
    [["retry", "not-an-id", ATTEMPT_ID]],
    [["unblock", ATTEMPT_ID]],
    [["unblock", ATTEMPT_ID, "--answer"]],
    [["blocker"]],
    [["blocker", "not-an-id"]],
    [["evidence"]],
    [["evidence", "list", "--limit", "101"]],
    [["evidence", "inspect", "not-an-id"]],
    [["project"]],
    [["project", "unknown"]],
    [["project", "scan"]],
    [["project", "plan"]],
    [["project", "plan", "not-a-digest"]],
    [["project", "apply", "not-a-digest"]],
    [["project", "apply", PLAN_DIGEST, "--branch"]],
    [["project", "apply", PLAN_DIGEST, "--branch", "not a valid branch"]],
    [["effects"]],
    [["effects", "unknown"]],
    [["effects", "status", "extra"]],
    [["effects", "list", "--state", "not-a-state"]],
    [["effects", "list", "--provider", "not-a-provider"]],
    [["effects", "list", "--limit", "101"]],
    [["effects", "list", "--after-updated-at", NOW]],
    [["effects", "list", "--after-effect", "00000000-0000-4000-8000-000000000009"]],
    [["effects", "list", "--after-updated-at", "not-an-instant", "--after-effect", ATTEMPT_ID]],
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
          operation: "attempt.list",
          page: {
            attempts: [
              {
                schemaVersion: 1,
                projectId: PROJECT_ID,
                title: "Fix\nunsafe title",
                attempt: {
                  schemaVersion: 1,
                  attemptId: ATTEMPT_ID,
                  taskId: "00000000-0000-4000-8000-000000000007",
                  taskSpecDigest: `sha256:${"a".repeat(64)}`,
                  attemptNumber: 1,
                  state: "queued",
                  desiredState: "running",
                  revision: 0,
                  fence: 0,
                  currentStepId: null,
                  blocker: null,
                  outcome: null,
                  createdAt: NOW,
                  updatedAt: NOW,
                  terminalAt: null,
                },
              },
            ],
            nextAfter: { updatedAt: NOW, attemptId: ATTEMPT_ID },
            hasMore: true,
          },
        },
        "human",
      ),
    ).toBe(
      `${ATTEMPT_ID}\tqueued\t${PROJECT_ID}\t"Fix\\nunsafe title"\nmore after ${NOW} ${ATTEMPT_ID}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "task.retry",
          taskId: "00000000-0000-4000-8000-000000000007",
          attemptId: "00000000-0000-4000-8000-000000000008",
          state: "queued",
          priorAttemptId: ATTEMPT_ID,
        },
        "human",
      ),
    ).toBe(
      `task.retry: attempt 00000000-0000-4000-8000-000000000008 is queued (retried from ${ATTEMPT_ID})\n`,
    );

    expect(
      renderCommandResult(
        { operation: "attempt.unblock", attemptId: ATTEMPT_ID, state: "running", accepted: true },
        "human",
      ),
    ).toBe(`attempt.unblock: accepted for ${ATTEMPT_ID} (now running)\n`);

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

    expect(
      renderCommandResult(
        {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockers: [],
        },
        "human",
      ),
    ).toBe(
      `project.scan: /repo/app\nplan digest: ${PLAN_DIGEST}\nfingerprint: ${PLAN_DIGEST}\ninventory digest: ${PLAN_DIGEST}\nnot blocked\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: true,
          blockers: [
            {
              issueId: "esi-000000000000000000000001",
              code: "safety.secret-material-detected",
              summary: "A file matches secret-shaped-file detection heuristics.",
            },
          ],
        },
        "human",
      ),
    ).toBe(
      `project.scan: /repo/app\nplan digest: ${PLAN_DIGEST}\nfingerprint: ${PLAN_DIGEST}\ninventory digest: ${PLAN_DIGEST}\nblocked by 1 issue(s):\n  esi-000000000000000000000001\tsafety.secret-material-detected\tA file matches secret-shaped-file detection heuristics.\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.enroll-plan",
          planDigest: PLAN_DIGEST,
          repositoryRoot: "/repo/app",
          plan: {
            schemaVersion: 1,
            mode: "proposal-only",
            requiresSourceRevalidation: true,
            sourceFingerprint: PLAN_DIGEST,
            inventoryDigest: PLAN_DIGEST,
            blocked: false,
            blockerIssueIds: [],
            actions: [],
          },
        },
        "human",
      ),
    ).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mode: "proposal-only",
          requiresSourceRevalidation: true,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockerIssueIds: [],
          actions: [],
        },
        null,
        2,
      )}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.apply",
          repositoryRoot: "/repo/app",
          baseHeadSha: "a".repeat(40),
          branchName: "app-factory/enroll-abc123",
          commitSha: "b".repeat(40),
          appliedActionKinds: ["declare-project", "declare-experience"],
          resolvedIssueIds: ["esi-000000000000000000000002"],
          skippedActions: [],
          convergence: {
            blocked: false,
            blockerIssueIds: [],
            openIssueCount: 3,
            sourceFingerprint: PLAN_DIGEST,
          },
        },
        "human",
      ),
    ).toBe(
      `project.apply: /repo/app\nbranch: app-factory/enroll-abc123\ncommit: ${"b".repeat(40)}\napplied: declare-project, declare-experience\nskipped: 0\nconvergence: clear, 3 open issue(s)\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 2,
              sent: 1,
              observed: 0,
              confirmed: 3,
              unknown: 0,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 3,
            pump: { enabled: true, lastActivityAt: NOW, lastErrorMessage: null },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=2 sent=1 observed=0 confirmed=3 unknown=0 manual-intervention=0 rejected=0\n" +
        `pending outbox: 3\npump: enabled, last activity ${NOW}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 0,
              sent: 0,
              observed: 0,
              confirmed: 0,
              unknown: 0,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 0,
            pump: { enabled: false, lastActivityAt: null, lastErrorMessage: null },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=0 sent=0 observed=0 confirmed=0 unknown=0 manual-intervention=0 rejected=0\npending outbox: 0\npump: disabled\n",
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 0,
              sent: 0,
              observed: 0,
              confirmed: 0,
              unknown: 1,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 1,
            pump: { enabled: true, lastActivityAt: NOW, lastErrorMessage: "adapter unavailable" },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=0 sent=0 observed=0 confirmed=0 unknown=1 manual-intervention=0 rejected=0\n" +
        `pending outbox: 1\npump: enabled, last activity ${NOW}, last error: adapter unavailable\n`,
    );

    expect(
      renderCommandResult(
        { operation: "effects.list", page: { effects: [], nextAfter: null, hasMore: false } },
        "human",
      ),
    ).toBe("no effects\n");

    expect(
      renderCommandResult(
        {
          operation: "effects.list",
          page: {
            effects: [
              {
                schemaVersion: 1,
                effect: {
                  schemaVersion: 1,
                  effectId: ATTEMPT_ID,
                  attemptId: ATTEMPT_ID,
                  action: "github.merge-pr",
                  operationMarker: `app-factory:v1:github:merge:${ATTEMPT_ID}`,
                  target: {
                    provider: "github",
                    resourceType: "github.pull-request",
                    resourceKey: "owner/repository#42",
                  },
                  subject: {
                    projectId: PROJECT_ID,
                    taskId: null,
                    attemptId: null,
                    releaseId: null,
                  },
                  payloadDigest: `sha256:${"a".repeat(64)}`,
                  policyDigest: `sha256:${"a".repeat(64)}`,
                  approvalId: null,
                  state: "planned",
                  revision: 0,
                  sendCount: 0,
                  providerCorrelationKey: null,
                  createdAt: NOW,
                  updatedAt: NOW,
                  lastObservedAt: null,
                  nextReconcileAt: null,
                  detailDigest: null,
                },
              },
            ],
            nextAfter: { updatedAt: NOW, effectId: ATTEMPT_ID },
            hasMore: true,
          },
        },
        "human",
      ),
    ).toBe(
      `${ATTEMPT_ID}\tplanned\tgithub\tapp-factory:v1:github:merge:${ATTEMPT_ID}\nmore after ${NOW} ${ATTEMPT_ID}\n`,
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

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

/**
 * A minimal fake daemon that answers by request operation, for `runCli`
 * end-to-end tests. It also mirrors the real daemon's per-requestId replay
 * ledger (see apps/daemon/src/unix-command-server.ts RequestReplayLedger /
 * logicalRequestFingerprint): reusing a requestId for a different logical
 * request (different commandId/issuedAt/origin/operation/payload) fails the
 * call with `protocol.request-id-conflict`, exactly like production. A
 * client bug that reuses one identity across distinct calls -- such as
 * apps/cli diagnoseBlocker once did across its status/events/verifyEvidence
 * calls -- is caught here instead of only in production.
 */
async function startFakeDaemon(
  respond: (
    operation: string,
    requestId: string,
  ) => Readonly<{ result: unknown } | { error: Readonly<Record<string, unknown>> }>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-cli-"));
  roots.push(root);
  const socketPath = join(root, "daemon.sock");
  const seenRequestFingerprints = new Map<string, string>();
  const server = createServer((socket: Socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = JSON.parse(buffer.slice(0, newline)) as Readonly<{
        requestId: string;
        request: Readonly<{
          commandId: unknown;
          issuedAt: unknown;
          origin: unknown;
          operation: string;
          payload: unknown;
        }>;
      }>;
      const fingerprint = JSON.stringify({
        commandId: frame.request.commandId,
        issuedAt: frame.request.issuedAt,
        origin: frame.request.origin,
        operation: frame.request.operation,
        payload: frame.request.payload,
      });
      const previousFingerprint = seenRequestFingerprints.get(frame.requestId);
      if (previousFingerprint !== undefined && previousFingerprint !== fingerprint) {
        const conflict = {
          protocolVersion: 1,
          requestId: frame.requestId,
          ok: false,
          error: {
            code: "protocol.request-id-conflict",
            message: "The request ID was already used for a different command.",
            retryable: false,
          },
        };
        socket.end(`${JSON.stringify(conflict)}\n`);
        return;
      }
      seenRequestFingerprints.set(frame.requestId, fingerprint);
      const outcome = respond(frame.request.operation, frame.requestId);
      const response =
        "result" in outcome
          ? { protocolVersion: 1, requestId: frame.requestId, ok: true, result: outcome.result }
          : {
              protocolVersion: 1,
              requestId: frame.requestId,
              ok: false,
              error: outcome.error,
            };
      socket.end(`${JSON.stringify(response)}\n`);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return socketPath;
}

function fakeIo(): Readonly<{
  io: CliIo;
  captured: () => Readonly<{ stdout: string; stderr: string }>;
}> {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: (value: string) => {
        stdout += value;
      },
      stderr: (value: string) => {
        stderr += value;
      },
    },
    captured: () => ({ stdout, stderr }),
  };
}

describe("runCli attempt blocker diagnosis", () => {
  const blockedAttempt = {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    taskId: "00000000-0000-4000-8000-000000000007",
    taskSpecDigest: `sha256:${"a".repeat(64)}`,
    attemptNumber: 1,
    state: "blocked",
    desiredState: "running",
    revision: 4,
    fence: 1,
    currentStepId: "00000000-0000-4000-8000-000000000009",
    blocker: {
      kind: "clarification",
      code: "task.needs-input",
      summary: "Which environment should this target?",
      requiredAction: "Answer the question and unblock the attempt.",
    },
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    terminalAt: null,
  } as const;

  it("prints the blocker code, step, and evidence summaries", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: blockedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: {
            operation: "attempt.events",
            events: [
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000010",
                attemptId: ATTEMPT_ID,
                sequence: 4,
                occurredAt: NOW,
                commandId: null,
                causationEventId: null,
                fence: 1,
                type: "step.created",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  ordinal: 0,
                  operation: "factory.execute",
                  inputDigest: `sha256:${"b".repeat(64)}`,
                },
              },
            ],
            nextAfterSequence: 4,
          },
        };
      }
      if (operation === "evidence.verify") {
        return {
          result: {
            operation: "evidence.verify",
            integrityVerified: true,
            manifest: {
              attemptId: ATTEMPT_ID,
              createdAt: NOW,
              manifestDigest: `sha256:${"c".repeat(64)}`,
              subject: {
                taskSpecDigest: `sha256:${"a".repeat(64)}`,
                policyDigest: `sha256:${"d".repeat(64)}`,
                baseCommit: "e".repeat(40),
                candidateTree: null,
                fence: 1,
              },
              entryCount: 1,
              requiredKinds: ["agent-run"],
            },
            evidence: [
              {
                evidenceId: "00000000-0000-4000-8000-000000000011",
                digest: `sha256:${"f".repeat(64)}`,
                kind: "agent-run",
                createdAt: NOW,
                producer: "app-factory.agent",
                artifactCount: 2,
              },
            ],
            artifactCount: 2,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const { stdout, stderr } = captured();
    expect(stderr).toBe("");
    expect(stdout).toContain(`attempt ${ATTEMPT_ID}: blocked`);
    expect(stdout).toContain("code: task.needs-input");
    expect(stdout).toContain("summary: Which environment should this target?");
    expect(stdout).toContain("step: 00000000-0000-4000-8000-000000000009 (factory.execute)");
    expect(stdout).toContain("agent-run");
    expect(stdout).toContain("00000000-0000-4000-8000-000000000011");
  });

  it("reports when the attempt is neither blocked nor failed, without querying events or evidence", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return {
          result: {
            operation: "attempt.status",
            attempt: { ...blockedAttempt, state: "running", blocker: null },
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", "blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(captured().stdout)).toEqual({
      ok: true,
      result: {
        operation: "attempt.blocker",
        diagnosed: false,
        attemptId: ATTEMPT_ID,
        state: "running",
      },
    });
  });

  it("surfaces the failure code and last-known step for a failed attempt without a current step", async () => {
    const failedAttempt = {
      ...blockedAttempt,
      state: "failed",
      currentStepId: null,
      blocker: null,
      outcome: {
        kind: "failed",
        failure: {
          code: "task.execution-failed",
          summary: "The verify step exited non-zero.",
          retryable: true,
          detailArtifactDigest: null,
        },
      },
      terminalAt: NOW,
    } as const;
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: failedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: {
            operation: "attempt.events",
            events: [
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000010",
                attemptId: ATTEMPT_ID,
                sequence: 4,
                occurredAt: NOW,
                commandId: null,
                causationEventId: null,
                fence: 1,
                type: "step.created",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  ordinal: 1,
                  operation: "factory.verify",
                  inputDigest: `sha256:${"b".repeat(64)}`,
                },
              },
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000012",
                attemptId: ATTEMPT_ID,
                sequence: 5,
                occurredAt: NOW,
                commandId: null,
                causationEventId: "00000000-0000-4000-8000-000000000010",
                fence: 1,
                type: "step.state-changed",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  from: "running",
                  to: "failed",
                  outputDigest: null,
                  failureCode: "task.execution-failed",
                },
              },
            ],
            nextAfterSequence: 5,
          },
        };
      }
      if (operation === "evidence.verify") {
        return {
          error: {
            code: "evidence.not-found",
            message: "No evidence manifest exists for this attempt.",
            retryable: false,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const { stdout } = captured();
    expect(stdout).toContain(`attempt ${ATTEMPT_ID}: failed`);
    expect(stdout).toContain("code: task.execution-failed");
    expect(stdout).toContain("step: 00000000-0000-4000-8000-000000000009 (factory.verify)");
    expect(stdout).toContain("evidence: none recorded");
  });

  it("gives the status, events, and evidence calls each a distinct request identity", async () => {
    // Regression test: diagnoseBlocker once reused one CommandIdentity (and
    // therefore one requestId) across all three calls. The real daemon keys
    // its replay/conflict ledger on requestId, so reusing it for different
    // operations fails the second and third call with
    // protocol.request-id-conflict -- the fake daemon above reproduces that
    // exact check. This test both proves the three calls all succeed (which
    // requires three distinct requestIds) and records the requestIds seen to
    // assert directly on their distinctness.
    const requestIdsByOperation = new Map<string, string[]>();
    const socketPath = await startFakeDaemon((operation, requestId) => {
      const seen = requestIdsByOperation.get(operation) ?? [];
      seen.push(requestId);
      requestIdsByOperation.set(operation, seen);
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: blockedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: { operation: "attempt.events", events: [], nextAfterSequence: 0 },
        };
      }
      if (operation === "evidence.verify") {
        return {
          error: {
            code: "evidence.not-found",
            message: "No evidence manifest exists for this attempt.",
            retryable: false,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(captured().stderr).toBe("");
    expect(exitCode).toBe(0);
    const allRequestIds = [
      ...(requestIdsByOperation.get("attempt.status") ?? []),
      ...(requestIdsByOperation.get("attempt.events") ?? []),
      ...(requestIdsByOperation.get("evidence.verify") ?? []),
    ];
    expect(allRequestIds).toHaveLength(3);
    expect(new Set(allRequestIds).size).toBe(3);
  });
});

describe("runCli project enrollment", () => {
  it("scans a repository given an already-absolute path", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.scan") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockers: [],
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "scan", "/repo/app"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("project.scan: /repo/app");
    expect(captured().stdout).toContain("not blocked");
  });

  it("fetches the full stored plan as JSON", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.enroll-plan")
        throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.enroll-plan",
          planDigest: PLAN_DIGEST,
          repositoryRoot: "/repo/app",
          plan: {
            schemaVersion: 1,
            mode: "proposal-only",
            requiresSourceRevalidation: true,
            sourceFingerprint: PLAN_DIGEST,
            inventoryDigest: PLAN_DIGEST,
            blocked: false,
            blockerIssueIds: [],
            actions: [],
          },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "plan", PLAN_DIGEST],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(captured().stdout)).toMatchObject({
      sourceFingerprint: PLAN_DIGEST,
      blocked: false,
    });
  });

  it("applies a plan with an explicit branch name", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.apply") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.apply",
          repositoryRoot: "/repo/app",
          baseHeadSha: "a".repeat(40),
          branchName: "app-factory/enroll-abc123",
          commitSha: "b".repeat(40),
          appliedActionKinds: ["declare-project"],
          resolvedIssueIds: [],
          skippedActions: [],
          convergence: {
            blocked: false,
            blockerIssueIds: [],
            openIssueCount: 0,
            sourceFingerprint: PLAN_DIGEST,
          },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "apply", PLAN_DIGEST, "--branch", "app-factory/enroll-abc123"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("branch: app-factory/enroll-abc123");
    expect(captured().stdout).toContain("convergence: clear, 0 open issue(s)");
  });

  it("surfaces a fingerprint-drift failure as a distinct, non-retryable error code", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.apply") throw new Error(`Unexpected operation: ${operation}`);
      return {
        error: {
          code: "project.apply-fingerprint-drift",
          message: "the enrollment plan's sourceFingerprint no longer matches a fresh scan",
          retryable: false,
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", "project", "apply", PLAN_DIGEST],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(captured().stderr)).toMatchObject({
      ok: false,
      error: { code: "project.apply-fingerprint-drift", retryable: false },
    });
  });
});
