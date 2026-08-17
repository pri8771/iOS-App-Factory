import {
  CommandIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  ProjectRegisterCommandV1Schema,
  ProjectRegistryV1Schema,
  RepositoryIdSchema,
  StableKeySchema,
  type ProjectId,
  type ProjectRegisterCommandV1,
  type ProjectRegistryV1,
  type RepositoryId,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * The Project Registry's durable persistence (`packages/contracts/src/v1/project-registry.ts`'s
 * module doc comment). Mirrors `ProjectMilestoneRepository`'s compare-and-set-upsert-plus-append-
 * only-revision-history pattern exactly (migration 0012 mirrors migration 0007).
 */

export type UpsertProjectRegistryInput = Readonly<{
  /** A `ProjectRegisterCommandV1`; parsed at this boundary. */
  command: unknown;
  /** The trusted daemon-observed instant that becomes `updatedAt` (and `enrolledAt` on create). */
  recordedAt: unknown;
}>;

export type UpsertedProjectRegistry = Readonly<{
  project: ProjectRegistryV1;
  created: boolean;
  duplicate: boolean;
}>;

/** One append-only history row: the project as it stood after `command` wrote it. */
export type ProjectRegistryRevisionRecord = Readonly<{
  project: ProjectRegistryV1;
  command: ProjectRegisterCommandV1;
}>;

/**
 * Thrown for a rejected upsert whose cause is the caller's, not a persistence invariant: a stale
 * expected revision, a slug or mirror binding already claimed by a different project, and so on.
 * The daemon maps `code` onto its command protocol error codes.
 */
export class ProjectRegistryUpsertError extends Error {
  public constructor(
    public readonly code:
      | "project.not-found"
      | "project.already-exists"
      | "project.revision-conflict"
      | "project.identity-conflict"
      | "project.slug-taken"
      | "project.repository-id-taken",
    message: string,
  ) {
    super(message);
    this.name = "ProjectRegistryUpsertError";
  }
}

type ProjectRow = Readonly<{
  project_id: string;
  slug: string;
  repository_id: string;
  revision: number;
  enrolled_at: string;
  updated_at: string;
  payload_json: string;
}>;

type ProjectRevisionRow = Readonly<{
  project_id: string;
  revision: number;
  command_id: string;
  origin: string;
  issued_at: string;
  expected_revision: number | null;
  recorded_at: string;
  command_json: string;
  payload_json: string;
}>;

function failInvariant(message: string): never {
  throw new Error(`Factory persistence invariant failed: ${message}`);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failInvariant(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function parseStoredJson<T>(
  table: string,
  identifier: string,
  payloadJson: string,
  parse: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new Error(`${table} ${identifier} contains invalid JSON`, { cause: error });
  }
  try {
    return parse(value);
  } catch (error) {
    throw new Error(`${table} ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

function decodeProject(row: ProjectRow): ProjectRegistryV1 {
  const project = parseStoredJson("projects", row.project_id, row.payload_json, (value) =>
    ProjectRegistryV1Schema.parse(value),
  );
  assertSame("projects project_id projection", row.project_id, project.projectId);
  assertSame("projects slug projection", row.slug, project.slug);
  assertSame("projects repository_id projection", row.repository_id, project.repositoryId);
  assertSame("projects revision projection", row.revision, project.revision);
  assertSame("projects enrolled_at projection", row.enrolled_at, project.enrolledAt);
  assertSame("projects updated_at projection", row.updated_at, project.updatedAt);
  return project;
}

function decodeRevision(row: ProjectRevisionRow): ProjectRegistryRevisionRecord {
  const project = parseStoredJson(
    "project_revisions",
    `${row.project_id}@${String(row.revision)}`,
    row.payload_json,
    (value) => ProjectRegistryV1Schema.parse(value),
  );
  const command = parseStoredJson("project_revisions", row.command_id, row.command_json, (value) =>
    ProjectRegisterCommandV1Schema.parse(value),
  );
  assertSame("revision project_id projection", row.project_id, project.projectId);
  assertSame("revision projection", row.revision, project.revision);
  assertSame("revision updated_at projection", row.recorded_at, project.updatedAt);
  assertSame("revision command_id projection", row.command_id, command.commandId);
  assertSame("revision origin projection", row.origin, command.origin);
  assertSame("revision issued_at projection", row.issued_at, command.issuedAt);
  assertSame(
    "revision expected_revision projection",
    row.expected_revision,
    command.register.expectedRevision,
  );
  assertSame("revision command project", command.register.project.projectId, project.projectId);
  return { project, command };
}

const PROJECT_SELECT = `SELECT
  project_id, slug, repository_id, revision, enrolled_at, updated_at, payload_json
FROM projects`;

const PROJECT_REVISION_SELECT = `SELECT
  project_id, revision, command_id, origin, issued_at, expected_revision,
  recorded_at, command_json, payload_json
FROM project_revisions`;

/** Durable, revisioned project registry. See the module doc comment. */
export class ProjectRegistryRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(projectIdInput: unknown): ProjectRegistryV1 | null {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const row = this.database.prepare(`${PROJECT_SELECT} WHERE project_id = ?`).get(projectId) as
      ProjectRow | undefined;
    return row === undefined ? null : decodeProject(row);
  }

  public findBySlug(slugInput: unknown): ProjectRegistryV1 | null {
    const slug = StableKeySchema.parse(slugInput);
    const row = this.database.prepare(`${PROJECT_SELECT} WHERE slug = ?`).get(slug) as
      ProjectRow | undefined;
    return row === undefined ? null : decodeProject(row);
  }

  public findByRepositoryId(repositoryIdInput: unknown): ProjectRegistryV1 | null {
    const repositoryId = RepositoryIdSchema.parse(repositoryIdInput);
    const row = this.database
      .prepare(`${PROJECT_SELECT} WHERE repository_id = ?`)
      .get(repositoryId) as ProjectRow | undefined;
    return row === undefined ? null : decodeProject(row);
  }

  /** Every registered project's head revision, ordered by `slug`. Bounded, unpaginated: registered
   * projects are operator-initiated and few compared to attempts or events. */
  public listAll(): readonly ProjectRegistryV1[] {
    const rows = this.database
      .prepare(`${PROJECT_SELECT} ORDER BY slug`)
      .all() as readonly ProjectRow[];
    return rows.map(decodeProject);
  }

  public findRevisionByCommandId(commandIdInput: unknown): ProjectRegistryRevisionRecord | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare(`${PROJECT_REVISION_SELECT} WHERE command_id = ?`)
      .get(commandId) as ProjectRevisionRow | undefined;
    return row === undefined ? null : decodeRevision(row);
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates a project registry record and
   * journals the command as one immutable revision, atomically. Fails closed
   * (`project.slug-taken`/`project.repository-id-taken`) when another project already claims the
   * candidate's `slug` or `repositoryId`. Replaying the same command ID with identical content
   * returns the revision it already wrote (`duplicate: true`).
   */
  public upsert(input: UpsertProjectRegistryInput): UpsertedProjectRegistry {
    const command = ProjectRegisterCommandV1Schema.parse(input.command);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const draft = command.register.project;
    const expectedRevision = command.register.expectedRevision;

    const persist = this.database.transaction((): UpsertedProjectRegistry => {
      const stored = this.findRevisionByCommandId(command.commandId);
      if (stored !== null) {
        if (JSON.stringify(stored.command) !== JSON.stringify(command)) {
          throw new ProjectRegistryUpsertError(
            "project.identity-conflict",
            `command ${command.commandId} is already bound to a different project registration`,
          );
        }
        return { project: stored.project, created: stored.project.revision === 0, duplicate: true };
      }

      const headRow = this.database
        .prepare(`${PROJECT_SELECT} WHERE project_id = ?`)
        .get(draft.projectId) as ProjectRow | undefined;
      const head = headRow === undefined ? null : decodeProject(headRow);

      if (expectedRevision === null && head !== null) {
        throw new ProjectRegistryUpsertError(
          "project.already-exists",
          `project ${draft.projectId} already exists at revision ${String(head.revision)}`,
        );
      }
      if (expectedRevision !== null && head === null) {
        throw new ProjectRegistryUpsertError(
          "project.not-found",
          `project ${draft.projectId} does not exist`,
        );
      }
      if (head !== null && expectedRevision !== null) {
        if (head.revision !== expectedRevision) {
          throw new ProjectRegistryUpsertError(
            "project.revision-conflict",
            `project ${draft.projectId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}`,
          );
        }
        if (head.slug !== draft.slug) {
          failInvariant(`project ${draft.projectId} slug is immutable`);
        }
        if (head.repositoryId !== draft.repositoryId) {
          failInvariant(`project ${draft.projectId} repositoryId is immutable`);
        }
        if (head.sourceRepositoryPath !== draft.sourceRepositoryPath) {
          failInvariant(`project ${draft.projectId} sourceRepositoryPath is immutable`);
        }
        if (recordedAt <= head.updatedAt) {
          failInvariant(
            `project ${draft.projectId} recordedAt ${recordedAt} must follow ${head.updatedAt}`,
          );
        }
      }
      this.assertSlugAndRepositoryIdAvailable(draft.projectId, draft.slug, draft.repositoryId);

      const project: ProjectRegistryV1 = ProjectRegistryV1Schema.parse({
        schemaVersion: 1,
        ...draft,
        revision: head === null ? 0 : head.revision + 1,
        enrolledAt: head === null ? recordedAt : head.enrolledAt,
        updatedAt: recordedAt,
      });
      const payloadJson = JSON.stringify(project);

      if (head === null) {
        this.database
          .prepare(
            `INSERT INTO projects(
               project_id, schema_version, slug, display_name, source_repository_path,
               repository_id, standard_version, policy_lock_digest, docs_dir,
               enrolled_at, revision, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            project.projectId,
            project.schemaVersion,
            project.slug,
            project.displayName,
            project.sourceRepositoryPath,
            project.repositoryId,
            project.standardVersion,
            project.policyLockDigest,
            project.docsLayout.docsDir,
            project.enrolledAt,
            project.revision,
            project.updatedAt,
            payloadJson,
          );
      } else {
        const result = this.database
          .prepare(
            `UPDATE projects SET
               display_name = ?, standard_version = ?, policy_lock_digest = ?, docs_dir = ?,
               revision = ?, updated_at = ?, payload_json = ?
             WHERE project_id = ? AND revision = ?`,
          )
          .run(
            project.displayName,
            project.standardVersion,
            project.policyLockDigest,
            project.docsLayout.docsDir,
            project.revision,
            project.updatedAt,
            payloadJson,
            project.projectId,
            head.revision,
          );
        if (result.changes !== 1) {
          throw new Error(`Project registry revision conflict: ${project.projectId}`);
        }
      }
      this.database
        .prepare(
          `INSERT INTO project_revisions(
             project_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          project.projectId,
          project.revision,
          command.commandId,
          command.origin,
          command.issuedAt,
          expectedRevision,
          project.updatedAt,
          JSON.stringify(command),
          payloadJson,
        );
      return { project, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }

  private assertSlugAndRepositoryIdAvailable(
    projectId: ProjectId,
    slug: string,
    repositoryId: RepositoryId,
  ): void {
    const bySlug = this.findBySlug(slug);
    if (bySlug !== null && bySlug.projectId !== projectId) {
      throw new ProjectRegistryUpsertError(
        "project.slug-taken",
        `slug ${slug} is already registered to project ${bySlug.projectId}`,
      );
    }
    const byRepositoryId = this.findByRepositoryId(repositoryId);
    if (byRepositoryId !== null && byRepositoryId.projectId !== projectId) {
      throw new ProjectRegistryUpsertError(
        "project.repository-id-taken",
        `mirror binding ${repositoryId} is already registered to project ${byRepositoryId.projectId}`,
      );
    }
  }
}
