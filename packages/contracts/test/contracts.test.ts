import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AttemptIdSchema,
  CommandV1Schema,
  EvidenceV1Schema,
  EventV1Schema,
  RelativePathSchema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type TaskId,
} from "../src/index.js";
import { loadContractFixtures } from "./fixture-loader.js";

const IDs = {
  task: "00000000-0000-4000-8000-000000000003",
  command: "00000000-0000-4000-8000-000000000004",
  attempt: "00000000-0000-4000-8000-000000000005",
  step: "00000000-0000-4000-8000-000000000006",
  run: "00000000-0000-4000-8000-000000000007",
  event: "00000000-0000-4000-8000-000000000008",
  evidence: "00000000-0000-4000-8000-000000000009",
} as const;
const NOW = "2026-08-10T12:00:00.000Z";
const TASK_DIGEST = `sha256:${"b".repeat(64)}`;
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const OUTPUT_DIGEST = `sha256:${"d".repeat(64)}`;
const EMPTY_DIGEST = `sha256:${"e".repeat(64)}`;
const BASE_COMMIT = "a".repeat(40);
const CANDIDATE_TREE = "b".repeat(40);

const eventEnvelope = {
  schemaVersion: 1,
  eventId: IDs.event,
  attemptId: IDs.attempt,
  sequence: 2,
  occurredAt: NOW,
  commandId: IDs.command,
  causationEventId: null,
  fence: 1,
};

const agentEventEnvelope = {
  schemaVersion: 1,
  eventId: IDs.event,
  runId: IDs.run,
  attemptId: IDs.attempt,
  stepId: IDs.step,
  fence: 1,
  sequence: 2,
  occurredAt: NOW,
};

const capturedOutput = {
  digest: OUTPUT_DIGEST,
  byteLength: 10,
  truncated: false,
};

const agentResultEnvelope = {
  schemaVersion: 1,
  runId: IDs.run,
  attemptId: IDs.attempt,
  stepId: IDs.step,
  fence: 1,
  startedAt: NOW,
  finishedAt: "2026-08-10T12:01:00.000Z",
  finalEventSequence: 3,
  stdout: capturedOutput,
  stderr: { ...capturedOutput, digest: EMPTY_DIGEST, byteLength: 0 },
  usage: null,
};

const failure = {
  code: "agent.process-failed",
  summary: "The agent process failed.",
  retryable: true,
  detailArtifactDigest: null,
};

const blocker = {
  kind: "authentication",
  code: "agent.authentication-required",
  summary: "The provider requires login.",
  requiredAction: "Authenticate the provider and resume the attempt.",
};

const evidenceEnvelope = {
  schemaVersion: 1,
  evidenceId: IDs.evidence,
  attemptId: IDs.attempt,
  createdAt: NOW,
  producer: "factory.verifier",
  subject: {
    taskSpecDigest: TASK_DIGEST,
    policyDigest: POLICY_DIGEST,
    baseCommit: BASE_COMMIT,
    candidateTree: CANDIDATE_TREE,
    fence: 1,
  },
  artifacts: [],
};

describe("contract primitives", () => {
  it("keeps branded IDs distinct at compile time", () => {
    expectTypeOf<TaskId>().not.toEqualTypeOf<AttemptId>();
    expect(TaskIdSchema.safeParse(IDs.attempt).success).toBe(true);
    expect(AttemptIdSchema.safeParse(IDs.attempt).success).toBe(true);
  });

  it.each([
    "../secret",
    "Sources/../secret",
    "/absolute/path",
    "Sources//Greeting.swift",
    "Sources/Greeting.swift/",
    "Sources\\Greeting.swift",
  ])("rejects unsafe relative path %s", (path) => {
    expect(RelativePathSchema.safeParse(path).success).toBe(false);
  });

  it("rejects unknown keys at nested trust boundaries", async () => {
    const [fixture] = await loadContractFixtures("valid/contracts.json");
    expect(fixture).toBeDefined();
    if (fixture === undefined || typeof fixture.value !== "object") return;

    const task = structuredClone(fixture.value) as Record<string, unknown>;
    const base = task.base as Record<string, unknown>;
    base.untrustedOverride = "main";
    expect(TaskSpecV1Schema.safeParse(task).success).toBe(false);
  });
});

describe("discriminated contract variants", () => {
  it.each([
    {
      kind: "attempt.set-desired-state",
      attemptId: IDs.attempt,
      desiredState: "paused",
      reason: "Operator requested review.",
    },
    {
      kind: "daemon.reconcile",
      attemptId: null,
    },
    {
      kind: "task.retry",
      taskId: IDs.task,
      priorAttemptId: IDs.attempt,
      initialDesiredState: "running",
    },
    {
      kind: "attempt.unblock",
      attemptId: IDs.attempt,
      answer: "Use the staging environment.",
    },
  ])("accepts command $kind", (variant) => {
    expect(
      CommandV1Schema.safeParse({
        schemaVersion: 1,
        commandId: IDs.command,
        issuedAt: NOW,
        origin: "cli",
        ...variant,
      }).success,
    ).toBe(true);
  });

  it.each([
    {
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
    {
      type: "attempt.desired-state-changed",
      data: { from: "running", to: "paused", reason: null },
    },
    {
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: "supervisor:123" },
    },
    {
      type: "attempt.unblock-answered",
      data: { stepId: IDs.step, answer: "Use the staging environment." },
    },
    {
      type: "step.created",
      data: {
        stepId: IDs.step,
        ordinal: 0,
        operation: "agent.edit",
        inputDigest: TASK_DIGEST,
      },
    },
    {
      type: "step.state-changed",
      data: {
        stepId: IDs.step,
        from: "pending",
        to: "running",
        outputDigest: null,
        failureCode: null,
      },
    },
    {
      type: "evidence.recorded",
      data: { evidenceId: IDs.evidence, evidenceDigest: OUTPUT_DIGEST },
    },
    {
      type: "commit.recorded",
      data: {
        commit: BASE_COMMIT,
        tree: CANDIDATE_TREE,
        attemptMarker: `App-Factory-Attempt: ${IDs.attempt}`,
      },
    },
  ])("accepts event $type", (variant) => {
    expect(EventV1Schema.safeParse({ ...eventEnvelope, ...variant }).success).toBe(true);
  });

  it.each([
    {
      type: "agent.progress",
      data: {
        phase: "agent.editing",
        level: "info",
        message: "Editing the requested source file.",
      },
    },
    { type: "agent.blocked", data: { blocker } },
    { type: "agent.finished", data: { status: "succeeded" } },
  ])("accepts agent event $type", (variant) => {
    expect(AgentEventV1Schema.safeParse({ ...agentEventEnvelope, ...variant }).success).toBe(true);
  });

  it.each([
    {
      status: "failed",
      process: { exitCode: 1, signal: null },
      failure,
      blocker: null,
    },
    {
      status: "blocked",
      process: { exitCode: null, signal: null },
      failure: null,
      blocker,
    },
    {
      status: "cancelled",
      process: { exitCode: null, signal: "SIGTERM" },
      failure: { ...failure, code: "agent.cancelled", retryable: false },
      blocker: null,
    },
    {
      status: "timed-out",
      process: { exitCode: null, signal: "SIGKILL" },
      failure: { ...failure, code: "agent.timed-out" },
      blocker: null,
    },
  ])("accepts agent result $status", (variant) => {
    expect(AgentRunResultV1Schema.safeParse({ ...agentResultEnvelope, ...variant }).success).toBe(
      true,
    );
  });

  it.each([
    {
      kind: "agent-run",
      claims: {
        runSpecDigest: TASK_DIGEST,
        result: {
          ...agentResultEnvelope,
          status: "succeeded",
          process: { exitCode: 0, signal: null },
          failure: null,
          blocker: null,
        },
      },
    },
    {
      kind: "review",
      claims: {
        report: {
          schemaVersion: 1,
          reviewerId: "factory.read-only-reviewer",
          reviewerVersion: "1.0.0",
          reviewInputDigest: OUTPUT_DIGEST,
          verdict: "pass",
          findings: [],
        },
      },
    },
    {
      kind: "commit",
      claims: {
        commit: BASE_COMMIT,
        tree: CANDIDATE_TREE,
        attemptMarker: `App-Factory-Attempt: ${IDs.attempt}`,
      },
    },
    {
      kind: "event-log",
      claims: {
        firstSequence: 1,
        lastSequence: 8,
        eventCount: 8,
        eventLogDigest: OUTPUT_DIGEST,
      },
    },
  ])("accepts evidence $kind", (variant) => {
    expect(EvidenceV1Schema.safeParse({ ...evidenceEnvelope, ...variant }).success).toBe(true);
  });
});
