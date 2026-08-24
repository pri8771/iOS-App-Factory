import { describe, expect, expectTypeOf, it } from "vitest";

import {
  COMMAND_OPERATIONS_V1,
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
const ROOM_ID = "30000000-0000-4000-8000-000000000001";
const SIGNAL_ID = "8a000000-0000-4000-8000-000000000001";
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

const PHASE_DRAFT = {
  phaseId: "contract",
  name: "Contract",
  purpose: "Define the user outcome, MVP boundary, and Definition of Done.",
  mode: "solo",
  cast: {
    participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
    coordinator: null,
    grader: null,
  },
  inputs: ["docs"],
  rules: {
    standard: ["rule.new.scope-before-breadth"],
    yours: [],
    requiredOutput: [],
    acceptanceChecks: [],
  },
  outputs: [{ path: "docs/product/contract.md", schema: null }],
  gates: [],
  budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
};

const PHASE_DEFINITION = {
  schemaVersion: 1,
  ...PHASE_DRAFT,
  revision: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

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
    ["project.milestones.list", { projectId: "00000000-0000-4000-8000-000000000103" }],
    [
      "project.milestone.upsert",
      {
        milestone: {
          milestoneId: "00000000-0000-4000-8000-000000000104",
          projectId: "00000000-0000-4000-8000-000000000103",
          phase: "build",
          kind: "stage",
          label: "Core loop builds green",
          targetDate: null,
          dependsOn: [],
          owner: "machine",
          status: "planned",
          evidenceDigest: null,
        },
        expectedRevision: null,
      },
    ],
    [
      "room.create",
      {
        roomId: ROOM_ID,
        title: "Design review",
        projectId: null,
        unattendedEnabled: true,
        agentCooldownEvents: 2,
        participants: [{ persona: "architect", provider: "ollama", displayName: "Architect" }],
        budget: {
          dailyCeilingTokens: 10_000,
          unattendedDailyCeilingTokens: 1_000,
          maxTokensPerReply: 500,
        },
      },
    ],
    ["room.list", { limit: 50 }],
    ["room.list", { limit: 50, includeArchived: true }],
    ["room.post", { roomId: ROOM_ID, handle: "priyansh", body: "@architect thoughts?" }],
    ["room.events", { roomId: ROOM_ID, afterSequence: 0, limit: 200 }],
    ["room.typing", { roomId: ROOM_ID, handle: "priyansh", ttlMs: 5_000 }],
    [
      "room.update",
      { roomId: ROOM_ID, expectedUpdatedAt: NOW, patch: { unattendedEnabled: true } },
    ],
    ["room.update", { roomId: ROOM_ID, expectedUpdatedAt: NOW, patch: { archived: true } }],
    ["room.participants.list", {}],
    [
      "release.start",
      {
        projectId: "00000000-0000-4000-8000-000000000103",
        repositoryId: "00000000-0000-4000-8000-000000000105",
        sourceCommit: "a".repeat(40),
        branch: "main",
      },
    ],
    [
      "release.promote",
      { releaseRunId: "00000000-0000-4000-8000-000000000106", expectedRevision: 1 },
    ],
    [
      "release.archive",
      {
        releaseRunId: "00000000-0000-4000-8000-000000000106",
        expectedRevision: 2,
        exportOptions: {
          schemaVersion: 1,
          teamId: "796XH483R4",
          method: "app-store-connect",
          destination: "upload",
          signingStyle: "automatic",
          bundleIdOverride: null,
        },
      },
    ],
    [
      "release.upload",
      {
        releaseRunId: "00000000-0000-4000-8000-000000000106",
        expectedRevision: 3,
        approvalId: "00000000-0000-4000-8000-000000000107",
      },
    ],
    [
      "release.submit",
      {
        releaseRunId: "00000000-0000-4000-8000-000000000106",
        expectedRevision: 4,
        approvalId: "00000000-0000-4000-8000-000000000107",
      },
    ],
    ["release.status", { releaseRunId: "00000000-0000-4000-8000-000000000106" }],
    ["release.observe", { buildsLimit: 5 }],
    ["release.projection", {}],
    ["preset.list", {}],
    ["phase.upsert", { phase: PHASE_DRAFT, expectedRevision: null }],
    [
      "preset.upsert",
      {
        preset: {
          presetId: "ios-app-standard-0.4.0",
          name: "iOS App Standard 0.4.0",
          phases: [PHASE_DEFINITION],
          appliesTo: ["ios"],
        },
        expectedRevision: null,
      },
    ],
    ["provider.list", {}],
    [
      "provider.upsert",
      {
        instance: {
          key: "openrouter-fast",
          family: "openrouter",
          model: "anthropic/claude-3.7-sonnet",
          displayName: "Fast (OpenRouter)",
        },
        expectedDigest: null,
      },
    ],
    ["provider.remove", { key: "openrouter-fast", expectedDigest: null }],
    ["provider.credential.set", { key: "openrouter-fast", secret: "sk-test-secret" }],
    ["provider.health", { key: null }],
    ["provider.health", { key: "codex" }],
    ["settings.get", { key: "default-provider" }],
    ["settings.set", { key: "default-provider", value: "openrouter-fast" }],
    ["usage.summary", { sinceDays: 30 }],
    ["signal.reschedule", { signalId: SIGNAL_ID, checkIntervalMinutes: 60 }],
    ["signal.reschedule", { signalId: SIGNAL_ID, checkIntervalMinutes: null }],
  ])("accepts the strict %s request", (operation, payload) => {
    expect(CommandRequestV1Schema.safeParse(request(operation, payload)).success).toBe(true);
  });

  it("derives COMMAND_OPERATIONS_V1 from the discriminated union with no drift", () => {
    expect(new Set(COMMAND_OPERATIONS_V1).size).toBe(COMMAND_OPERATIONS_V1.length);
    expect(COMMAND_OPERATIONS_V1).toContain("preset.list");
    expect(COMMAND_OPERATIONS_V1).toContain("preset.upsert");
    expect(COMMAND_OPERATIONS_V1).toContain("phase.upsert");
    expect(COMMAND_OPERATIONS_V1).toContain("room.participants.list");
    expect(COMMAND_OPERATIONS_V1).toContain("release.start");
    expect(COMMAND_OPERATIONS_V1).toContain("release.promote");
    expect(COMMAND_OPERATIONS_V1).toContain("release.archive");
    expect(COMMAND_OPERATIONS_V1).toContain("release.upload");
    expect(COMMAND_OPERATIONS_V1).toContain("release.submit");
    expect(COMMAND_OPERATIONS_V1).toContain("release.status");
    expect(COMMAND_OPERATIONS_V1).toContain("release.observe");
    expect(COMMAND_OPERATIONS_V1).toContain("release.projection");
    expect(COMMAND_OPERATIONS_V1).toContain("room.update");
    expect(COMMAND_OPERATIONS_V1).toContain("provider.list");
    expect(COMMAND_OPERATIONS_V1).toContain("provider.upsert");
    expect(COMMAND_OPERATIONS_V1).toContain("provider.remove");
    expect(COMMAND_OPERATIONS_V1).toContain("provider.credential.set");
    expect(COMMAND_OPERATIONS_V1).toContain("provider.health");
    expect(COMMAND_OPERATIONS_V1).toContain("settings.get");
    expect(COMMAND_OPERATIONS_V1).toContain("settings.set");
    expect(COMMAND_OPERATIONS_V1).toContain("usage.summary");
    expect(COMMAND_OPERATIONS_V1).toContain("signal.reschedule");
    // A syntactically unrecognized operation is absent from the catalog by construction.
    expect(COMMAND_OPERATIONS_V1).not.toContain("nonexistent.operation");
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

  it.each([
    [
      "room.create",
      {
        roomId: ROOM_ID,
        title: "",
        projectId: null,
        unattendedEnabled: false,
        agentCooldownEvents: 1,
        participants: [],
        budget: { dailyCeilingTokens: 1, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 1 },
      },
    ],
    [
      "room.create",
      {
        roomId: ROOM_ID,
        title: "dup personas",
        projectId: null,
        unattendedEnabled: false,
        agentCooldownEvents: 1,
        participants: [
          { persona: "a", provider: "ollama", displayName: "A" },
          { persona: "a", provider: "ollama", displayName: "B" },
        ],
        budget: { dailyCeilingTokens: 10, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 1 },
      },
    ],
    ["room.post", { roomId: ROOM_ID, handle: "bad handle", body: "x" }],
    ["room.post", { roomId: ROOM_ID, handle: "ok", body: "" }],
    ["room.events", { roomId: ROOM_ID, afterSequence: -1, limit: 10 }],
    ["room.typing", { roomId: ROOM_ID, handle: "ok", ttlMs: 60_000 }],
    ["room.list", {}],
    ["room.update", { roomId: ROOM_ID, expectedUpdatedAt: NOW, patch: {} }],
    ["room.update", { roomId: ROOM_ID, patch: { title: "x" } }],
    ["room.participants.list", { limit: 10 }],
    ["release.observe", {}],
    ["release.observe", { buildsLimit: 0 }],
    ["release.observe", { buildsLimit: 201 }],
    ["release.projection", { limit: 10 }],
    [
      "provider.upsert",
      {
        instance: { key: "openrouter-fast", family: "openrouter", model: "m" },
        expectedDigest: null,
      },
    ],
    ["provider.credential.set", { key: "openrouter-fast", secret: "" }],
    ["provider.credential.set", { key: "openrouter-fast", secret: "x".repeat(4_001) }],
    ["settings.set", { key: "not-a-real-setting", value: "codex" }],
    ["usage.summary", { sinceDays: 0 }],
    ["usage.summary", { sinceDays: 91 }],
    ["signal.reschedule", { signalId: SIGNAL_ID, checkIntervalMinutes: 4 }],
    ["signal.reschedule", { signalId: SIGNAL_ID, checkIntervalMinutes: 10_081 }],
  ])("rejects the malformed %s request", (operation, payload) => {
    expect(CommandRequestV1Schema.safeParse(request(operation, payload)).success).toBe(false);
  });

  it("never lets a provider.credential.set result carry the secret -- only the credential reference", () => {
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "provider.credential.set",
          key: "openrouter-fast",
          credentialReference: {
            schemaVersion: 1,
            kind: "macos-keychain",
            service: "app-factory.provider.openrouter-fast",
            account: "openrouter-fast",
          },
        },
      }).success,
    ).toBe(true);
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "provider.credential.set",
          key: "openrouter-fast",
          credentialReference: {
            schemaVersion: 1,
            kind: "macos-keychain",
            service: "app-factory.provider.openrouter-fast",
            account: "openrouter-fast",
          },
          secret: "sk-leak",
        },
      }).success,
    ).toBe(false);
  });

  it("answers settings.get honestly with a null value and null updatedAt for a never-set key", () => {
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "settings.get",
          entry: { key: "default-provider", value: null, updatedAt: null },
        },
      }).success,
    ).toBe(true);
  });

  it("bounds usage.summary rows through the success envelope with null-honest sums and unreportedCount", () => {
    expect(
      CommandResponseV1Schema.safeParse({
        protocolVersion: 1,
        requestId: REQUEST_ID,
        ok: true,
        result: {
          operation: "usage.summary",
          summary: {
            sinceDays: 7,
            rows: [
              {
                providerKey: "openrouter-fast",
                model: "anthropic/claude-3.7-sonnet",
                dayKey: "2026-08-20",
                inputTokens: null,
                outputTokens: null,
                cachedInputTokens: null,
                costUsdMicros: null,
                unreportedCount: 4,
              },
            ],
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
    expectTypeOf<
      CommandResultForOperationV1<"room.events">["moderator"]["attendance"]
    >().toEqualTypeOf<"attended" | "dormant">();
    expectTypeOf<
      CommandResultForOperationV1<"room.create">["duplicate"]
    >().toEqualTypeOf<boolean>();
  });
});
