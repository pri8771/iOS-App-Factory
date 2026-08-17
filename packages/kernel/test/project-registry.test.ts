import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectRegistryUpsertError,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";

const roots: string[] = [];

function uuid(value: number): string {
  return `86000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-project-registry-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectDraft(
  projectId: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    projectId,
    slug: "sample-app",
    displayName: "Sample App",
    sourceRepositoryPath: "/repos/sample-app",
    repositoryId: projectId,
    standardVersion: null,
    policyLockDigest: null,
    docsLayout: { docsDir: "docs" },
    ...overrides,
  };
}

function registerCommand(
  commandId: string,
  project: ReturnType<typeof projectDraft>,
  expectedRevision: number | null,
  issuedAt = T0,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "system",
    kind: "project.register",
    register: { project, expectedRevision },
  };
}

describe("ProjectRegistryRepository", () => {
  it("creates a project at revision 0 and journals the driving command", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = uuid(1);
    const draft = projectDraft(projectId);
    const command = registerCommand(uuid(101), draft, null);

    const created = repositories.projectRegistry.upsert({ command, recordedAt: T0 });
    expect(created.created).toBe(true);
    expect(created.duplicate).toBe(false);
    expect(created.project.projectId).toBe(projectId);
    expect(created.project.repositoryId).toBe(projectId);
    expect(created.project.revision).toBe(0);
    expect(created.project.enrolledAt).toBe(T0);
    expect(created.project.updatedAt).toBe(T0);
    expect(created.project.docsLayout).toEqual({ docsDir: "docs" });

    const found = repositories.projectRegistry.findById(projectId);
    expect(found).toEqual(created.project);
    const bySlug = repositories.projectRegistry.findBySlug("sample-app");
    expect(bySlug).toEqual(created.project);
    const byRepositoryId = repositories.projectRegistry.findByRepositoryId(projectId);
    expect(byRepositoryId).toEqual(created.project);

    db.close();
  });

  it("replays an identical commandId idempotently without writing a new revision", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = uuid(2);
    const draft = projectDraft(projectId);
    const commandId = uuid(102);
    const command = registerCommand(commandId, draft, null);

    const first = repositories.projectRegistry.upsert({ command, recordedAt: T0 });
    const second = repositories.projectRegistry.upsert({ command, recordedAt: T1 });

    expect(second.duplicate).toBe(true);
    expect(second.project).toEqual(first.project);
    db.close();
  });

  it("rejects the same commandId bound to different content as an identity conflict", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = uuid(3);
    const commandId = uuid(103);
    repositories.projectRegistry.upsert({
      command: registerCommand(commandId, projectDraft(projectId), null),
      recordedAt: T0,
    });

    expect(() =>
      repositories.projectRegistry.upsert({
        command: registerCommand(
          commandId,
          projectDraft(projectId, { displayName: "Different Name" }),
          null,
        ),
        recordedAt: T0,
      }),
    ).toThrow(ProjectRegistryUpsertError);
    db.close();
  });

  it("compare-and-set updates mutable fields and advances the revision", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = uuid(4);
    const created = repositories.projectRegistry.upsert({
      command: registerCommand(uuid(104), projectDraft(projectId), null),
      recordedAt: T0,
    });

    const updated = repositories.projectRegistry.upsert({
      command: registerCommand(
        uuid(105),
        projectDraft(projectId, { displayName: "Renamed App", docsLayout: { docsDir: "Docs" } }),
        0,
        T1,
      ),
      recordedAt: T1,
    });

    expect(updated.project.revision).toBe(1);
    expect(updated.project.displayName).toBe("Renamed App");
    expect(updated.project.docsLayout).toEqual({ docsDir: "Docs" });
    expect(updated.project.enrolledAt).toBe(T0);
    expect(updated.project.updatedAt).toBe(T1);
    expect(created.project.revision).toBe(0);
    db.close();
  });

  it("rejects a stale expected revision", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = uuid(5);
    repositories.projectRegistry.upsert({
      command: registerCommand(uuid(106), projectDraft(projectId), null),
      recordedAt: T0,
    });

    expect(() =>
      repositories.projectRegistry.upsert({
        command: registerCommand(uuid(107), projectDraft(projectId, { displayName: "X" }), 5, T1),
        recordedAt: T1,
      }),
    ).toThrow(ProjectRegistryUpsertError);
    db.close();
  });

  it("refuses to register a second project under an already-claimed slug", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.projectRegistry.upsert({
      command: registerCommand(uuid(108), projectDraft(uuid(6)), null),
      recordedAt: T0,
    });

    let thrown: unknown;
    try {
      repositories.projectRegistry.upsert({
        command: registerCommand(uuid(109), projectDraft(uuid(7)), null, T1),
        recordedAt: T1,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProjectRegistryUpsertError);
    expect((thrown as InstanceType<typeof ProjectRegistryUpsertError>).code).toBe(
      "project.slug-taken",
    );
    db.close();
  });

  it("refuses to register a second project under an already-claimed mirror binding", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const sharedRepositoryId = uuid(8);
    repositories.projectRegistry.upsert({
      command: registerCommand(
        uuid(110),
        projectDraft(uuid(9), { repositoryId: sharedRepositoryId, slug: "app-one" }),
        null,
      ),
      recordedAt: T0,
    });

    let thrown: unknown;
    try {
      repositories.projectRegistry.upsert({
        command: registerCommand(
          uuid(111),
          projectDraft(uuid(10), { repositoryId: sharedRepositoryId, slug: "app-two" }),
          null,
          T1,
        ),
        recordedAt: T1,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProjectRegistryUpsertError);
    expect((thrown as InstanceType<typeof ProjectRegistryUpsertError>).code).toBe(
      "project.repository-id-taken",
    );
    db.close();
  });

  it("lists every registered project ordered by slug", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.projectRegistry.upsert({
      command: registerCommand(uuid(112), projectDraft(uuid(11), { slug: "zeta-app" }), null, T0),
      recordedAt: T0,
    });
    repositories.projectRegistry.upsert({
      command: registerCommand(
        uuid(113),
        projectDraft(uuid(12), { slug: "alpha-app", repositoryId: uuid(12) }),
        null,
        T1,
      ),
      recordedAt: T1,
    });

    const all = repositories.projectRegistry.listAll();
    expect(all.map((project) => project.slug)).toEqual(["alpha-app", "zeta-app"]);
    db.close();
  });

  it("persists across a fresh database handle over the same file", () => {
    const root = mkdtempSync(join(tmpdir(), "app-factory-project-registry-persist-"));
    roots.push(root);
    const path = join(root, "factory.sqlite");
    const projectId = uuid(13);
    {
      const db = openMigratedFactoryDatabase(path);
      const repositories = createFactoryRepositories(db);
      repositories.projectRegistry.upsert({
        command: registerCommand(uuid(114), projectDraft(projectId), null),
        recordedAt: T0,
      });
      db.close();
    }
    {
      const db = openMigratedFactoryDatabase(path);
      const repositories = createFactoryRepositories(db);
      const found = repositories.projectRegistry.findById(projectId);
      expect(found?.projectId).toBe(projectId);
      expect(found?.revision).toBe(0);
      db.close();
    }
  });
});
