import { describe, expect, it } from "vitest";

import {
  ProjectPlanEditV1Schema,
  ProjectPlanV1Schema,
  canonicalProjectPlanDigestInputV1,
  projectPlanGateDensityIssuesV1,
} from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const PLAN_ID = "76000000-0000-4000-8000-000000000301";

function taskItem(
  itemId: string,
  phase: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    itemId,
    kind: "task",
    phase,
    title: `Do ${itemId}`,
    detail: null,
    taskSpecDraft: {
      objective: `Objective for ${itemId}`,
      acceptanceCriteria: [{ id: "ac-1", statement: "It works.", verification: "automated" }],
      scope: { paths: ["src"] },
      phase,
    },
    dependsOn: [],
    status: "proposed",
    taskId: null,
    attemptId: null,
    ...overrides,
  };
}

function gateItem(
  itemId: string,
  phase: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    itemId,
    kind: "gate",
    phase,
    title: `Gate ${itemId}`,
    detail: null,
    gate: { owner: "human", reason: "Confirm before proceeding." },
    dependsOn: [],
    status: "proposed",
    ...overrides,
  };
}

function plan(
  items: readonly Record<string, unknown>[],
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    schemaVersion: 1,
    planId: PLAN_ID,
    projectId: null,
    repositoryId: null,
    brief: { title: "Sample app", oneLiner: "A sample app.", constraints: ["local-only"] },
    presetId: "ios-app-standard-0.4.0",
    items,
    state: "draft",
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
    digest: `sha256:${"a".repeat(64)}`,
    ...overrides,
  };
}

describe("ProjectPlanV1", () => {
  it("accepts a well-formed plan and round-trips through JSON", () => {
    const parsed = ProjectPlanV1Schema.parse(
      plan([
        taskItem("contract", "contract"),
        gateItem("ready", "ready"),
        taskItem("build-seed-repo", "build"),
        taskItem("build-domain-model", "build"),
        taskItem("review", "review"),
        gateItem("release", "release"),
      ]),
    );
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejects a plan with a gate on every item (over-gated)", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([
          gateItem("gate-1", "contract"),
          gateItem("gate-2", "research"),
          gateItem("gate-3", "build"),
        ]),
      ),
    ).toThrow(/at most one gate item/iu);
  });

  it("rejects more than one gate before the build phase's tasks start", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([
          taskItem("contract", "contract"),
          gateItem("ready-1", "ready"),
          gateItem("ready-2", "ready-again"),
          taskItem("build-seed-repo", "build"),
        ]),
      ),
    ).toThrow(/at most one gate item/iu);
  });

  it("accepts a gate before build and another gate after build starts (the scaffold gate plus a later gate)", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([
          taskItem("contract", "contract"),
          gateItem("ready", "ready"),
          taskItem("build-seed-repo", "build"),
          gateItem("release", "release"),
        ]),
      ),
    ).not.toThrow();
  });

  it("projectPlanGateDensityIssuesV1 reports no issues for a sparse, valid gate placement", () => {
    expect(
      projectPlanGateDensityIssuesV1([
        { kind: "task", phase: "contract" },
        { kind: "gate", phase: "ready" },
        { kind: "task", phase: "build" },
        { kind: "gate", phase: "release" },
      ]),
    ).toEqual([]);
  });

  it("rejects a task item that carries a gate payload", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([taskItem("t1", "contract", { gate: { owner: "human", reason: "x" } })]),
      ),
    ).toThrow();
  });

  it("rejects a gate item that carries a taskSpecDraft", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([
          gateItem("g1", "ready", {
            taskSpecDraft: {
              objective: "x",
              acceptanceCriteria: [{ id: "ac-1", statement: "y", verification: "automated" }],
              scope: { paths: ["src"] },
              phase: "ready",
            },
          }),
        ]),
      ),
    ).toThrow();
  });

  it("rejects duplicate item IDs", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(plan([taskItem("dup", "contract"), taskItem("dup", "research")])),
    ).toThrow(/item IDs must be unique/iu);
  });

  it("rejects dependsOn referencing an item that is not strictly earlier", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([taskItem("a", "contract", { dependsOn: ["b"] }), taskItem("b", "research")]),
      ),
    ).toThrow(/dependsOn must reference an item earlier/iu);
  });

  it("rejects a running task item without taskId/attemptId", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(plan([taskItem("a", "build", { status: "running" })])),
    ).toThrow();
  });

  it("accepts a running task item with taskId/attemptId set", () => {
    expect(() =>
      ProjectPlanV1Schema.parse(
        plan([
          taskItem("a", "build", {
            status: "running",
            taskId: "10000000-0000-4000-8000-000000000001",
            attemptId: "20000000-0000-4000-8000-000000000001",
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it("ProjectPlanEditV1Schema accepts an edit-brief edit carrying a full replacement brief", () => {
    const parsed = ProjectPlanEditV1Schema.parse({
      kind: "edit-brief",
      brief: { title: "New Title", oneLiner: "New one-liner.", constraints: ["local-only"] },
    });
    expect(parsed).toEqual({
      kind: "edit-brief",
      brief: { title: "New Title", oneLiner: "New one-liner.", constraints: ["local-only"] },
    });
  });

  it("ProjectPlanEditV1Schema rejects an edit-brief edit missing brief fields", () => {
    expect(() =>
      ProjectPlanEditV1Schema.parse({ kind: "edit-brief", brief: { title: "Only a title" } }),
    ).toThrow();
  });

  it("canonicalProjectPlanDigestInputV1 excludes the digest field and is stable across key order", () => {
    const base = plan([taskItem("contract", "contract")]);
    const reordered = { digest: base.digest, ...base };
    expect(canonicalProjectPlanDigestInputV1(base as never)).toBe(
      canonicalProjectPlanDigestInputV1(reordered as never),
    );
    expect(canonicalProjectPlanDigestInputV1(base as never)).not.toContain("digest");
  });
});
