import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectPlanUpsertError,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";
const T2 = "2026-08-16T09:00:02.000Z";

const roots: string[] = [];

function uuid(value: number): string {
  return `85000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-project-plans-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function taskItem(itemId: string, phase: string) {
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
  };
}

function planDraft(planId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    planId,
    projectId: null,
    repositoryId: null,
    brief: { title: "Sample app", oneLiner: "A sample app.", constraints: [] },
    presetId: "ios-app-standard-0.4.0",
    items: [taskItem("contract", "contract")],
    state: "draft",
    ...overrides,
  };
}

function proposeCommand(commandId: string, draft: ReturnType<typeof planDraft>, issuedAt = T0) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "system",
    kind: "plan.propose",
    propose: {
      brief: draft.brief,
      presetId: draft.presetId,
      projectId: draft.projectId,
      repositoryId: draft.repositoryId,
      source: null,
    },
  };
}

function approveCommand(
  commandId: string,
  planId: string,
  expectedRevision: number,
  issuedAt = T1,
) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "system",
    kind: "plan.approve",
    approve: { planId, expectedRevision },
  };
}

describe("ProjectPlanRepository", () => {
  it("creates a plan at revision 0 and journals the driving command", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(1);
    const draft = planDraft(planId);
    const command = proposeCommand(uuid(101), draft);

    const created = repositories.projectPlans.upsert({
      command,
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    expect(created.created).toBe(true);
    expect(created.duplicate).toBe(false);
    expect(created.plan.planId).toBe(planId);
    expect(created.plan.revision).toBe(0);
    expect(created.plan.createdAt).toBe(T0);
    expect(created.plan.updatedAt).toBe(T0);
    expect(created.plan.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const found = repositories.projectPlans.findById(planId);
    expect(found).toEqual(created.plan);
    db.close();
  });

  it("compare-and-set updates advance the revision and preserve createdAt", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(2);
    const draft = planDraft(planId);
    const created = repositories.projectPlans.upsert({
      command: proposeCommand(uuid(201), draft),
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    const approvedDraft = { ...draft, state: "approved" };
    const approved = repositories.projectPlans.upsert({
      command: approveCommand(uuid(202), planId, 0, T1),
      draft: approvedDraft,
      expectedRevision: 0,
      recordedAt: T1,
    });

    expect(approved.plan.revision).toBe(1);
    expect(approved.plan.state).toBe("approved");
    expect(approved.plan.createdAt).toBe(T0);
    expect(approved.plan.updatedAt).toBe(T1);
    expect(approved.plan.digest).not.toBe(created.plan.digest);
    db.close();
  });

  it("rejects a revision-conflicting update with plan.revision-conflict", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(3);
    const draft = planDraft(planId);
    repositories.projectPlans.upsert({
      command: proposeCommand(uuid(301), draft),
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    expect(() =>
      repositories.projectPlans.upsert({
        command: approveCommand(uuid(302), planId, 5, T1),
        draft: { ...draft, state: "approved" },
        expectedRevision: 5,
        recordedAt: T1,
      }),
    ).toThrow(ProjectPlanUpsertError);
    db.close();
  });

  it("rejects creating a plan that already exists with plan.already-exists", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(4);
    const draft = planDraft(planId);
    repositories.projectPlans.upsert({
      command: proposeCommand(uuid(401), draft),
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    expect(() =>
      repositories.projectPlans.upsert({
        command: proposeCommand(uuid(402), draft, T1),
        draft,
        expectedRevision: null,
        recordedAt: T1,
      }),
    ).toThrow(/already exists/iu);
    db.close();
  });

  it("replays an identical command idempotently instead of writing a second revision", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(5);
    const draft = planDraft(planId);
    const command = proposeCommand(uuid(501), draft);

    const first = repositories.projectPlans.upsert({
      command,
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });
    const replay = repositories.projectPlans.upsert({
      command,
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    expect(replay.duplicate).toBe(true);
    expect(replay.plan).toEqual(first.plan);
    db.close();
  });

  it("rejects replaying a commandId bound to different content with plan.identity-conflict", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const planId = uuid(6);
    const draft = planDraft(planId);
    const commandId = uuid(601);
    repositories.projectPlans.upsert({
      command: proposeCommand(commandId, draft),
      draft,
      expectedRevision: null,
      recordedAt: T0,
    });

    let caught: unknown;
    try {
      repositories.projectPlans.upsert({
        command: proposeCommand(commandId, draft, T2),
        draft: { ...draft, brief: { ...draft.brief, title: "Different title" } },
        expectedRevision: null,
        recordedAt: T0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProjectPlanUpsertError);
    expect((caught as InstanceType<typeof ProjectPlanUpsertError>).code).toBe(
      "plan.identity-conflict",
    );
    db.close();
  });

  it("lists every plan for a project, most recently updated first", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = "90000000-0000-4000-8000-000000000001";
    const planA = planDraft(uuid(7), { projectId });
    const planB = planDraft(uuid(8), { projectId });
    repositories.projectPlans.upsert({
      command: proposeCommand(uuid(701), planA),
      draft: planA,
      expectedRevision: null,
      recordedAt: T0,
    });
    repositories.projectPlans.upsert({
      command: proposeCommand(uuid(801), planB),
      draft: planB,
      expectedRevision: null,
      recordedAt: T1,
    });

    const listed = repositories.projectPlans.listByProject(projectId);
    expect(listed.map((plan) => plan.planId)).toEqual([planB.planId, planA.planId]);
    db.close();
  });
});
