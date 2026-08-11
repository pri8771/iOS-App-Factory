import { describe, expect, it } from "vitest";

import {
  AttemptListPageV1Schema,
  AttemptListQueryV1Schema,
  MAX_ATTEMPT_LIST_ITEMS_V1,
} from "../src/index.js";

const NOW = "2026-08-11T12:00:00.000Z";
const PROJECT_ID = "81000000-0000-4000-8000-000000000001";
const TASK_ID = "81000000-0000-4000-8000-000000000002";
const DIGEST = `sha256:${"a".repeat(64)}`;

function attemptId(index: number): string {
  return `81000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function item(index: number, updatedAt = NOW) {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    title: `Attempt ${String(index)}`,
    attempt: {
      schemaVersion: 1,
      attemptId: attemptId(index),
      taskId: TASK_ID,
      taskSpecDigest: DIGEST,
      attemptNumber: index,
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: "2026-08-11T11:00:00.000Z",
      updatedAt,
      terminalAt: null,
    },
  };
}

describe("attempt list read model V1", () => {
  it("accepts one strict bounded query with a complete keyset cursor", () => {
    expect(
      AttemptListQueryV1Schema.parse({
        scope: "active",
        projectId: PROJECT_ID,
        after: { updatedAt: NOW, attemptId: attemptId(2) },
        limit: MAX_ATTEMPT_LIST_ITEMS_V1,
      }),
    ).toMatchObject({ scope: "active", limit: 100 });

    expect(() =>
      AttemptListQueryV1Schema.parse({
        scope: "all",
        projectId: null,
        after: { updatedAt: NOW },
        limit: 20,
      }),
    ).toThrow();
    expect(() =>
      AttemptListQueryV1Schema.parse({
        scope: "all",
        projectId: null,
        after: null,
        limit: 101,
      }),
    ).toThrow();
    expect(() =>
      AttemptListQueryV1Schema.parse({
        scope: "all",
        projectId: null,
        after: null,
        limit: 20,
        credential: "must-not-pass",
      }),
    ).toThrow();
  });

  it("binds a continuation cursor to the final descending row", () => {
    const attempts = [item(3), item(2)];
    expect(
      AttemptListPageV1Schema.parse({
        attempts,
        nextAfter: { updatedAt: NOW, attemptId: attemptId(2) },
        hasMore: true,
      }),
    ).toMatchObject({ attempts, hasMore: true });

    expect(() =>
      AttemptListPageV1Schema.parse({ attempts, nextAfter: null, hasMore: true }),
    ).toThrow("nextAfter must be present");
    expect(() =>
      AttemptListPageV1Schema.parse({
        attempts,
        nextAfter: { updatedAt: NOW, attemptId: attemptId(3) },
        hasMore: true,
      }),
    ).toThrow("final returned attempt");
  });

  it("rejects duplicate, misordered, and oversized pages", () => {
    expect(() =>
      AttemptListPageV1Schema.parse({
        attempts: [item(2), item(2)],
        nextAfter: null,
        hasMore: false,
      }),
    ).toThrow("attempt IDs must be unique");
    expect(() =>
      AttemptListPageV1Schema.parse({
        attempts: [item(1), item(2)],
        nextAfter: null,
        hasMore: false,
      }),
    ).toThrow("descending");
    expect(() =>
      AttemptListPageV1Schema.parse({
        attempts: Array.from({ length: 101 }, (_, index) => item(101 - index)),
        nextAfter: null,
        hasMore: false,
      }),
    ).toThrow();
  });
});
