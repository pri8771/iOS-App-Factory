import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CommandRequestFrameV1Schema,
  CommandRequestV1Schema,
  CommandResponseV1Schema,
  type CommandRequestForOperationV1,
  type CommandResultForOperationV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const COMMAND_ID = "00000000-0000-4000-8000-000000000004";
const REQUEST_ID = "00000000-0000-4000-8000-000000000010";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";

function request(operation: string, payload: unknown): unknown {
  return {
    schemaVersion: 1,
    commandId: COMMAND_ID,
    issuedAt: NOW,
    origin: "cli",
    operation,
    payload,
  };
}

describe("command protocol V1", () => {
  it.each([
    ["doctor", {}],
    ["attempt.status", { attemptId: ATTEMPT_ID }],
    ["attempt.events", { attemptId: ATTEMPT_ID, afterSequence: 0, limit: 100 }],
    ["attempt.list", { scope: "active", projectId: null, after: null, limit: 50 }],
    ["attempt.pause", { attemptId: ATTEMPT_ID, reason: null }],
    ["attempt.resume", { attemptId: ATTEMPT_ID, reason: "Continue." }],
    ["attempt.cancel", { attemptId: ATTEMPT_ID, reason: "Stop." }],
    ["task.retry", { taskId: "00000000-0000-4000-8000-000000000102", attemptId: ATTEMPT_ID }],
    ["attempt.unblock", { attemptId: ATTEMPT_ID, answer: "Use the staging environment." }],
    ["daemon.reconcile", { attemptId: null }],
    ["evidence.list", { afterAttemptId: null, limit: 50 }],
    ["evidence.inspect", { attemptId: ATTEMPT_ID }],
    ["evidence.verify", { attemptId: ATTEMPT_ID }],
    ["run.export", { attemptId: ATTEMPT_ID }],
    ["portfolio.snapshot", {}],
    ["project.scan", { repositoryRoot: "/repo/app" }],
    ["project.enroll-plan", { planDigest: `sha256:${"a".repeat(64)}` }],
    [
      "project.apply",
      { planDigest: `sha256:${"a".repeat(64)}`, branchName: "app-factory/enroll-abc123" },
    ],
    ["project.apply", { planDigest: `sha256:${"a".repeat(64)}`, branchName: null }],
  ])("accepts the strict %s request", (operation, payload) => {
    expect(CommandRequestV1Schema.safeParse(request(operation, payload)).success).toBe(true);
  });

  it("binds an authenticated frame to request and durable command IDs", () => {
    const parsed = CommandRequestFrameV1Schema.parse({
      protocolVersion: 1,
      requestId: REQUEST_ID,
      authorization: AUTHORIZATION,
      request: request("doctor", {}),
    });
    expect(parsed.requestId).toBe(REQUEST_ID);
    expect(parsed.request.commandId).toBe(COMMAND_ID);
  });

  it("rejects unknown fields and unbounded event queries", () => {
    expect(
      CommandRequestV1Schema.safeParse({ ...request("doctor", {}), pretendHealthy: true }).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("attempt.events", {
          attemptId: ATTEMPT_ID,
          afterSequence: 0,
          limit: 1_001,
        }),
      ).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("evidence.list", { afterAttemptId: null, limit: 101 }),
      ).success,
    ).toBe(false);
    expect(
      CommandRequestV1Schema.safeParse(
        request("attempt.list", {
          scope: "all",
          projectId: null,
          after: { updatedAt: NOW },
          limit: 50,
        }),
      ).success,
    ).toBe(false);
  });

  it("supports a nullable correlation ID only for protocol failures", () => {
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: null,
        ok: false,
        error: {
          code: "protocol.malformed-request",
          message: "Malformed request.",
          retryable: false,
        },
      }).success,
    ).toBe(true);
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: null,
        ok: true,
        result: {
          operation: "doctor",
          readiness: "ready",
          daemonVersion: "0.1.0",
          protocolVersion: 1,
          startedAt: NOW,
          issues: [],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded attempt-list page through the success envelope", () => {
    expect(
      CommandResponseV1Schema.parse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "attempt.list",
          page: { attempts: [], nextAfter: null, hasMore: false },
        },
      }),
    ).toMatchObject({ result: { operation: "attempt.list", page: { hasMore: false } } });
  });

  it("accepts a strict, digest-bound run record through the success envelope and rejects drift", () => {
    const digest = (character: string) => `sha256:${character.repeat(64)}`;
    const record = {
      schemaVersion: 1,
      attemptId: ATTEMPT_ID,
      taskId: "00000000-0000-4000-8000-000000000102",
      attemptNumber: 1,
      state: "succeeded",
      implementingRunId: "00000000-0000-4000-8000-000000000103",
      repositoryId: "00000000-0000-4000-8000-000000000104",
      taskSpecDigest: digest("1"),
      policyDigest: digest("2"),
      baseCommit: "a".repeat(40),
      candidateTree: "b".repeat(40),
      fence: 2,
      brokerCommit: {
        commit: "c".repeat(40),
        tree: "b".repeat(40),
        commitDigest: digest("3"),
        attemptMarker: ATTEMPT_ID,
      },
      verification: [
        {
          checkId: "tests.swift",
          argv: ["/usr/bin/swift", "test"],
          checkoutTree: "b".repeat(40),
          startedAt: NOW,
          finishedAt: NOW,
          toolVersions: [],
          passed: true,
          exitCode: 0,
        },
      ],
      review: {
        reviewerId: "fixture.reviewer",
        reviewerVersion: "1.0.0",
        reviewerRunId: "00000000-0000-4000-8000-000000000105",
        verdict: "pass",
        findingCount: 0,
        reviewInputDigest: digest("4"),
      },
      evidence: {
        manifestDigest: digest("5"),
        indexDigest: digest("6"),
        entryCount: 5,
        artifactCount: 20,
      },
      agent: {
        adapterId: "openai.codex",
        adapterVersion: "1.0.0",
        cliVersion: "0.148.0-alpha.9",
        model: "gpt-5.6-codex",
        executableDigest: digest("7"),
        usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: null },
      },
      timings: {
        attemptCreatedAt: NOW,
        attemptTerminalAt: NOW,
        agentStartedAt: NOW,
        agentFinishedAt: NOW,
        evidenceCreatedAt: NOW,
      },
    };
    const envelope = (candidate: unknown) => ({
      protocolVersion: 1,
      requestId: REQUEST_ID,
      ok: true,
      result: { operation: "run.export", record: candidate, recordDigest: digest("d") },
    });
    expect(CommandResponseV1Schema.safeParse(envelope(record)).success).toBe(true);
    // Only a verified, committed run is exportable, so any other state is not representable.
    expect(
      CommandResponseV1Schema.safeParse(envelope({ ...record, state: "failed" })).success,
    ).toBe(false);
    expect(
      CommandResponseV1Schema.safeParse(envelope({ ...record, verification: [] })).success,
    ).toBe(false);
    expect(
      CommandResponseV1Schema.safeParse(envelope({ ...record, unexpected: true })).success,
    ).toBe(false);
    expect(
      CommandResponseV1Schema.safeParse(
        envelope({ ...record, agent: { ...record.agent, adapterId: "NOT_A_CODE" } }),
      ).success,
    ).toBe(false);
  });

  it("rejects a non-absolute project.scan repository path", () => {
    expect(
      CommandRequestV1Schema.safeParse(request("project.scan", { repositoryRoot: "repo/app" }))
        .success,
    ).toBe(false);
  });

  it("rejects a malformed project.apply plan digest", () => {
    expect(
      CommandRequestV1Schema.safeParse(
        request("project.apply", { planDigest: "not-a-digest", branchName: null }),
      ).success,
    ).toBe(false);
  });

  it("accepts a full project.enroll-plan result envelope", () => {
    const digest = `sha256:${"c".repeat(64)}`;
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "project.enroll-plan",
          planDigest: digest,
          repositoryRoot: "/repo/app",
          plan: {
            schemaVersion: 1,
            mode: "proposal-only",
            requiresSourceRevalidation: true,
            sourceFingerprint: digest,
            inventoryDigest: digest,
            blocked: true,
            blockerIssueIds: ["esi-000000000000000000000001"],
            actions: [
              {
                actionId: "epa-000000000000000000000001",
                phase: "safety",
                kind: "resolve-path-safety",
                targetPath: null,
                reason: "A symbolic link escapes the repository root.",
                resolvesIssueIds: ["esi-000000000000000000000001"],
              },
            ],
          },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts a project.apply result envelope with a null branch and commit", () => {
    const digest = `sha256:${"d".repeat(64)}`;
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "project.apply",
          repositoryRoot: "/repo/app",
          baseHeadSha: "a".repeat(40),
          branchName: null,
          commitSha: null,
          appliedActionKinds: [],
          resolvedIssueIds: [],
          skippedActions: [
            {
              actionId: "epa-000000000000000000000002",
              kind: "create-xcode-container",
              targetPath: null,
              reason: "requires manual enrollment work",
            },
          ],
          convergence: {
            blocked: false,
            blockerIssueIds: [],
            openIssueCount: 0,
            sourceFingerprint: digest,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("keeps operation-specific request and result types correlated", () => {
    expectTypeOf<CommandRequestForOperationV1<"attempt.pause">["payload"]>().toEqualTypeOf<{
      attemptId: string & { readonly __brand: "AttemptId" };
      reason: string | null;
    }>();
    expectTypeOf<
      CommandResultForOperationV1<"attempt.pause">["desiredState"]
    >().toEqualTypeOf<"paused">();
    expectTypeOf<CommandRequestForOperationV1<"portfolio.snapshot">["payload"]>().toEqualTypeOf<
      Record<string, never>
    >();
    expectTypeOf<CommandRequestForOperationV1<"attempt.list">["payload"]["scope"]>().toEqualTypeOf<
      "active" | "all"
    >();
    expectTypeOf<
      CommandResultForOperationV1<"attempt.list">["page"]["hasMore"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      CommandResultForOperationV1<"evidence.verify">["integrityVerified"]
    >().toEqualTypeOf<true>();
  });
});
