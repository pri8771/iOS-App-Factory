import { describe, expect, it } from "vitest";

import {
  AssistantAnswerV1Schema,
  AssistantIntentV1Schema,
  AssistantQueryV1Schema,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const ATTEMPT_A = "77000000-0000-4000-8000-000000000001";
const PROJECT_A = "77000000-0000-4000-8000-000000000002";
const TASK_A = "77000000-0000-4000-8000-000000000003";
const REPO_A = "77000000-0000-4000-8000-000000000004";
const INTENT_A = "77000000-0000-4000-8000-000000000005";
const DIGEST_A = `sha256:${"a".repeat(64)}`;

describe("AssistantQueryV1", () => {
  it("allows scoping to a project or leaving it unscoped", () => {
    expect(() =>
      AssistantQueryV1Schema.parse({ schemaVersion: 1, question: "status?", projectId: null }),
    ).not.toThrow();
    expect(() =>
      AssistantQueryV1Schema.parse({ schemaVersion: 1, question: "status?", projectId: PROJECT_A }),
    ).not.toThrow();
  });
});

describe("AssistantAnswerV1", () => {
  it("requires at least one citation for an answered response", () => {
    expect(() =>
      AssistantAnswerV1Schema.parse({
        kind: "answered",
        schemaVersion: 1,
        text: "Project Alpha is running.",
        citations: [],
      }),
    ).toThrow();
    expect(() =>
      AssistantAnswerV1Schema.parse({
        kind: "answered",
        schemaVersion: 1,
        text: "Project Alpha is running.",
        citations: [{ kind: "attempt", id: ATTEMPT_A }],
      }),
    ).not.toThrow();
  });

  it("carries an explicit reason for an honest refusal, most notably a missing date", () => {
    const parsed = AssistantAnswerV1Schema.parse({
      kind: "cannot-answer",
      schemaVersion: 1,
      cannotAnswer: {
        reason: "no-milestone-target-date",
        detail: "No milestone with a real target date exists yet.",
      },
    });
    expect(parsed).toMatchObject({ kind: "cannot-answer" });
  });

  it("rejects an answered response with citations of an unknown kind", () => {
    expect(() =>
      AssistantAnswerV1Schema.parse({
        kind: "answered",
        schemaVersion: 1,
        text: "x",
        citations: [{ kind: "task", id: TASK_A }],
      }),
    ).toThrow();
  });
});

describe("AssistantIntentV1", () => {
  const proposedAt = NOW;

  function baseIntent(payload: unknown, utterance: string) {
    return {
      schemaVersion: 1,
      intentId: INTENT_A,
      utterance,
      payload,
      summary: "A proposed intent.",
      requiresConfirmation: true,
      proposedAt,
    };
  }

  it("round-trips every intent kind's payload with fields matching its dispatched command", () => {
    const taskSpec = {
      schemaVersion: 1,
      taskId: TASK_A,
      projectId: PROJECT_A,
      createdAt: NOW,
      title: "Ship the thing",
      objective: "Ship it.",
      acceptanceCriteria: [{ id: "done", statement: "It ships.", verification: "operator" }],
      base: { repositoryId: REPO_A, commit: "a".repeat(40) },
      requestedScope: { paths: ["Sources/App.swift"] },
      policyDigest: DIGEST_A,
    };

    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent({ kind: "queue-task", taskSpec }, `queue task ${TASK_A} for later`),
      ),
    ).not.toThrow();

    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent({ kind: "run-phase", taskSpec }, `run task ${TASK_A} now`),
      ),
    ).not.toThrow();

    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent(
          { kind: "scan-project", repositoryRoot: "/repo/app" },
          "scan /repo/app for enrollment readiness",
        ),
      ),
    ).not.toThrow();

    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent(
          { kind: "enroll-project", planDigest: DIGEST_A, branchName: null },
          `enroll plan ${DIGEST_A}`,
        ),
      ),
    ).not.toThrow();

    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent(
          { kind: "approve-attempt", attemptId: ATTEMPT_A, answer: "Use staging." },
          `approve attempt ${ATTEMPT_A}`,
        ),
      ),
    ).not.toThrow();
  });

  it("rejects a payload kind with fields from a different kind", () => {
    expect(() =>
      AssistantIntentV1Schema.parse(
        baseIntent(
          { kind: "approve-attempt", repositoryRoot: "/repo/app" },
          `approve attempt ${ATTEMPT_A}`,
        ),
      ),
    ).toThrow();
  });
});
