import { z } from "zod";

import { CommandOriginV1Schema } from "./command.js";
import {
  AbsolutePathSchema,
  CommandIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";

/**
 * The Project Registry: the daemon's durable `ProjectId -> {sourceRepositoryPath, mirror binding}`
 * mapping (Seam (a) of the project-registry task). Before this existed, the daemon knew at most ONE
 * enrolled project (`apps/daemon/src/enrolled-project-execution.ts`'s single config file), and two
 * consumers documented the gap explicitly rather than faking it: `phase-output-mirror.ts` used a
 * project's own ID as its mirror's repository ID directly "there is no durable ProjectId ->
 * RepositoryId registry in this daemon yet"; `project-plan-mirror-port.ts` shipped a real
 * git-workspace-backed port that nothing composed because resolving a project's mirror required a
 * registry that did not exist.
 *
 * Mirrors `ProjectMilestoneV1`/`ProjectMilestoneUpsertCommandV1` (`milestone.ts`)'s compare-and-set-
 * upsert-plus-append-only-revision-history pattern exactly (kernel migration 0012 mirrors migration
 * 0007): `project.register` computes a full next-state `ProjectRegistryDraftV1` at the daemon layer
 * (`apps/daemon/src/project-registry-command-runtime.ts`) and hands it to
 * `ProjectRegistryRepository.upsert`, which assigns `revision`/`enrolledAt`/`updatedAt` from the
 * current head and journals the driving command as one immutable revision row. Idempotent by
 * `command.commandId`, like every other CAS-upsert repository in this kernel.
 *
 * `repositoryId` is the project's "mirror binding ref": the identity `packages/git-workspace`'s
 * `GitWorkspaceManager` keys a prepared immutable mirror by (`prepareImmutableMirror`,
 * `openExistingMirror`). A newly registered project mints `repositoryId` equal to its own
 * `projectId` (formalizing, rather than merely assuming, the 1:1 convention
 * `phase-output-mirror.ts` already documented), so every existing caller that treated a project's ID
 * as its mirror's repository ID keeps working unchanged; a future project whose mirror identity must
 * genuinely diverge from its project ID can still register with a different `repositoryId`.
 */

/** The project-docs layout resolver (`@app-factory/project-docs`'s `resolveDocsDirectoryName`)
 * returns `"docs" | "Docs" | "absent"`; the registry only ever stores one of the two real directory
 * names -- an `"absent"` resolution at registration time defaults to the 0.2.0-canonical lowercase
 * `"docs"`, since phase outputs must land somewhere and the mirror commit creates the directory on
 * first write. */
export const ProjectRegistryDocsDirV1Schema = z.enum(["docs", "Docs"]);
export type ProjectRegistryDocsDirV1 = z.infer<typeof ProjectRegistryDocsDirV1Schema>;

export const ProjectRegistryDocsLayoutV1Schema = z.strictObject({
  docsDir: ProjectRegistryDocsDirV1Schema,
});
export type ProjectRegistryDocsLayoutV1 = z.infer<typeof ProjectRegistryDocsLayoutV1Schema>;

const ProjectRegistryDraftV1Shape = {
  projectId: ProjectIdSchema,
  slug: StableKeySchema,
  displayName: z.string().min(1).max(200),
  sourceRepositoryPath: AbsolutePathSchema,
  /** The project's mirror binding ref -- see the module doc comment. */
  repositoryId: RepositoryIdSchema,
  standardVersion: z.string().min(1).max(100).nullable(),
  policyLockDigest: Sha256DigestSchema.nullable(),
  docsLayout: ProjectRegistryDocsLayoutV1Schema,
};

export const ProjectRegistryDraftV1Schema = z.strictObject(ProjectRegistryDraftV1Shape);
export type ProjectRegistryDraftV1 = z.infer<typeof ProjectRegistryDraftV1Schema>;

/**
 * The durable, revisioned registry record. `enrolledAt` is set once, at first registration, and
 * never changes on a later re-registration (it plays the role `createdAt` plays on every other
 * revisioned entity in this kernel, named for this aggregate's own domain vocabulary). `revision`
 * starts at 0 on creation and advances by exactly one per accepted upsert.
 */
export const ProjectRegistryV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    ...ProjectRegistryDraftV1Shape,
    enrolledAt: IsoInstantSchema,
    revision: NonNegativeSafeIntegerSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((project, context) => {
    if (project.updatedAt < project.enrolledAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes enrolledAt",
      });
    }
    if (project.revision === 0 && project.updatedAt !== project.enrolledAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "revision 0 must carry its enrollment timestamp",
      });
    }
  });
export type ProjectRegistryV1 = z.infer<typeof ProjectRegistryV1Schema>;

/**
 * Create-or-update intent. `expectedRevision: null` creates the registry record and fails if one
 * already exists for this `projectId`; a number is a compare-and-set update that fails unless the
 * stored head revision matches.
 */
export const ProjectRegistryUpsertV1Schema = z.strictObject({
  project: ProjectRegistryDraftV1Schema,
  expectedRevision: NonNegativeSafeIntegerSchema.nullable(),
});
export type ProjectRegistryUpsertV1 = z.infer<typeof ProjectRegistryUpsertV1Schema>;

/**
 * The durable command envelope the kernel journals for every accepted `project.register` upsert in
 * its own append-only revision history. Deliberately not a member of the attempt-scoped `CommandV1`
 * union: the project registry is a separate aggregate with its own ledger, keyed by the same
 * client-issued `commandId` so a replayed command is idempotent.
 */
export const ProjectRegisterCommandV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
  kind: z.literal("project.register"),
  register: ProjectRegistryUpsertV1Schema,
});
export type ProjectRegisterCommandV1 = z.infer<typeof ProjectRegisterCommandV1Schema>;
