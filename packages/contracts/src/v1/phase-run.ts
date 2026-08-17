import { z } from "zod";

import { PhaseDefinitionV1Schema, PhaseIdSchema, PhasePresetIdSchema } from "./phase.js";
import {
  GitBranchNameSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PhaseRunIdSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";
import { RoomIdSchema } from "./room.js";

/**
 * Phase Runner: `PhaseRunV1` is the durable, attempt-shaped record of one execution of a
 * `PhaseDefinitionV1` (`phase.run`/`phase.status`/`phase.list`/`phase.approve`/`phase.reject`).
 * It mirrors `ExecutionAttemptV1` (`execution.ts`) deliberately: a run is a state machine, not a
 * revisioned document, so — unlike `PhaseDefinitionV1`/`PhasePresetV1` — it has no `revision`-CAS
 * upsert; a run's `revision` field exists only for optimistic-concurrency writes as it advances
 * through its own state machine (`phase-run-state-machine.ts` in `@app-factory/kernel`).
 *
 * A run is bound immutably to the *exact bytes* of the phase definition it executes: `phaseSnapshot`
 * embeds the whole `PhaseDefinitionV1` value as read at creation time, and `phaseSnapshotDigest` is
 * the SHA-256 of its canonical JSON (`computePhaseDefinitionDigest`, `@app-factory/kernel`'s
 * `canonical-json.ts`). A later edit to the live phase definition (a new `phase.upsert` revision)
 * never changes a past run's snapshot or digest.
 *
 * `outputs[].evidence` deliberately does **not** reuse `EvidenceV1`/`EvidenceSubjectV1`
 * (`evidence.ts`): that envelope's subject shape (`taskSpecDigest`, `policyDigest`, `baseCommit`,
 * `candidateTree`, `fence`) is intrinsically TaskSpec/attempt-shaped and has no honest values for a
 * phase run (a phase run binds no TaskSpec, no policy decision, no scheduler fence). Forcing a phase
 * output through that envelope would mean inventing fake values for fields that do not apply, which
 * this repository's own discipline forbids (`rule.data.no-fake-fallback`). Instead, each output
 * carries its own direct commit-binding record (`PhaseRunOutputEvidenceV1`) — the same
 * `{commit, tree}` binding `CommitEvidenceV1.claims` (`evidence.ts`) carries for attempts, plus the
 * `factory/phase/<phaseId>/<runId>` branch it landed on — proof the content is a real, addressable
 * commit in the project's enrolled mirror, without borrowing a subject shape that does not fit.
 */

export const PhaseRunStateV1Schema = z.enum([
  "queued",
  "running",
  "awaiting-human",
  "succeeded",
  "failed",
  "cancelled",
]);
export type PhaseRunStateV1 = z.infer<typeof PhaseRunStateV1Schema>;

/** Mirrors `AttemptOutcomeV1` (`execution.ts`) exactly: the terminal-state payload. */
export const PhaseRunOutcomeV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("succeeded") }),
  z.strictObject({
    kind: z.literal("failed"),
    code: z.enum([
      "participant-error",
      "grader-changes-required",
      "output-schema-invalid",
      "output-commit-rejected",
      "rejected",
    ]),
    summary: z.string().min(1).max(2_000),
  }),
  z.strictObject({ kind: z.literal("cancelled"), reason: z.string().min(1).max(1_000) }),
]);
export type PhaseRunOutcomeV1 = z.infer<typeof PhaseRunOutcomeV1Schema>;

/**
 * Direct commit-binding proof for one committed output: the broker commit and its tree in the
 * project's enrolled Factory mirror, and the `factory/phase/<phaseId>/<runId>` branch it was
 * published on. See the module doc comment for why this does not reuse `EvidenceV1`.
 */
export const PhaseRunOutputEvidenceV1Schema = z.strictObject({
  commit: GitObjectIdSchema,
  tree: GitObjectIdSchema,
  branch: GitBranchNameSchema,
});
export type PhaseRunOutputEvidenceV1 = z.infer<typeof PhaseRunOutputEvidenceV1Schema>;

/**
 * The exact repo-relative path one committed output actually landed at in the project's mirror.
 * Deliberately its OWN schema rather than reusing `PhaseOutputV1`'s `path` verbatim (Seam (c) of the
 * project-registry task): a `PhaseDefinitionV1`'s declared `outputs[].path` is a project-agnostic
 * preset template that always names the canonical lowercase `docs/` convention, but the project a
 * run actually executes against may be registered under the capitalized `Docs/` convention instead
 * (`ProjectRegistryDocsDirV1Schema`) -- and on a case-insensitive storage volume, a write to the
 * declared `docs/...` path can genuinely land at `Docs/...` in the committed tree (APFS folds the
 * two, Git does not). This path must name where the file REALLY is, so evidence built from it (a
 * `git show <tree>:<path>` read-back) actually resolves -- reporting the declared, possibly-wrong-
 * case path here would silently produce evidence nothing can read back.
 */
export const PhaseRunOutputPathV1Schema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) => (value.startsWith("docs/") || value.startsWith("Docs/")) && !value.includes(".."),
    "output path must be repo-relative under the project's registered docs directory (docs/ or Docs/)",
  );

/** One committed output. */
export const PhaseRunOutputV1Schema = z.strictObject({
  path: PhaseRunOutputPathV1Schema,
  digest: Sha256DigestSchema,
  evidence: PhaseRunOutputEvidenceV1Schema,
});
export type PhaseRunOutputV1 = z.infer<typeof PhaseRunOutputV1Schema>;

/**
 * Deliberately lighter than `ReviewReportV1`/`FindingV1Schema`'s full code-review shape (no
 * `findingId`/`ruleId`/`category`/`severity`/`locations` — a phase grader judges prose outputs
 * against `rules.acceptanceChecks`, not source-code diffs, so findings are plain bounded text.
 * `verdict` is only `pass|changes-required` (never `blocked`): a phase grader either accepts the
 * produced outputs or does not — there is no "grader itself could not run" state distinct from a
 * `participant-error` run failure.
 */
export const PhaseRunGraderVerdictV1Schema = z.strictObject({
  verdict: z.enum(["pass", "changes-required"]),
  findings: z.array(z.string().min(1).max(2_000)).max(50),
});
export type PhaseRunGraderVerdictV1 = z.infer<typeof PhaseRunGraderVerdictV1Schema>;

export const PhaseRunTokenUsageV1Schema = z.strictObject({
  totalTokens: NonNegativeSafeIntegerSchema,
});
export type PhaseRunTokenUsageV1 = z.infer<typeof PhaseRunTokenUsageV1Schema>;

export const PhaseRunV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  phaseRunId: PhaseRunIdSchema,
  /** The preset this run was launched through, when one was named; `null` for a standalone phase. */
  presetId: PhasePresetIdSchema.nullable(),
  phaseId: PhaseIdSchema,
  projectId: ProjectIdSchema,
  phaseSnapshotDigest: Sha256DigestSchema,
  phaseSnapshot: PhaseDefinitionV1Schema,
  state: PhaseRunStateV1Schema,
  /** Optimistic-concurrency token for this run's own state-machine writes (not a document revision). */
  revision: NonNegativeSafeIntegerSchema,
  /** The persistent room a `chat`-mode run is bound to; always `null` for every other mode. */
  roomId: RoomIdSchema.nullable(),
  outputs: z.array(PhaseRunOutputV1Schema).max(10),
  graderVerdict: PhaseRunGraderVerdictV1Schema.nullable(),
  tokenUsage: PhaseRunTokenUsageV1Schema,
  outcome: PhaseRunOutcomeV1Schema.nullable(),
  createdAt: IsoInstantSchema,
  startedAt: IsoInstantSchema.nullable(),
  finishedAt: IsoInstantSchema.nullable(),
  updatedAt: IsoInstantSchema,
});
export type PhaseRunV1 = z.infer<typeof PhaseRunV1Schema>;

/** The wire input for `phase.run`: which phase to run, for which project, from which preset (if any). */
export const PhaseRunCreateV1Schema = z.strictObject({
  presetId: PhasePresetIdSchema.nullable(),
  phaseId: PhaseIdSchema,
  projectId: ProjectIdSchema,
  /** Overrides the phase definition's own declared `inputs[]` for this run only, when non-null. */
  inputsOverride: PhaseDefinitionV1Schema.shape.inputs.nullable(),
});
export type PhaseRunCreateV1 = z.infer<typeof PhaseRunCreateV1Schema>;

export const MAX_PHASE_RUN_LIST_ITEMS_V1 = 100 as const;

export const PhaseRunListCursorV1Schema = z.strictObject({
  updatedAt: IsoInstantSchema,
  phaseRunId: PhaseRunIdSchema,
});
export type PhaseRunListCursorV1 = z.infer<typeof PhaseRunListCursorV1Schema>;

export const PhaseRunListQueryV1Schema = z.strictObject({
  projectId: ProjectIdSchema.nullable(),
  state: PhaseRunStateV1Schema.nullable(),
  after: PhaseRunListCursorV1Schema.nullable(),
  limit: z.number().int().min(1).max(MAX_PHASE_RUN_LIST_ITEMS_V1),
});
export type PhaseRunListQueryV1 = z.infer<typeof PhaseRunListQueryV1Schema>;

export const PhaseRunListPageV1Schema = z
  .strictObject({
    runs: z.array(PhaseRunV1Schema).max(MAX_PHASE_RUN_LIST_ITEMS_V1),
    nextAfter: PhaseRunListCursorV1Schema.nullable(),
    hasMore: z.boolean(),
  })
  .superRefine((page, context) => {
    if (page.hasMore !== (page.nextAfter !== null)) {
      context.addIssue({
        code: "custom",
        path: ["nextAfter"],
        message: "nextAfter must be present exactly when hasMore is true",
      });
    }
    const identities = page.runs.map((run) => run.phaseRunId);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({ code: "custom", path: ["runs"], message: "run IDs must be unique" });
    }
    if (page.nextAfter !== null) {
      const last = page.runs.at(-1);
      if (
        last === undefined ||
        last.updatedAt !== page.nextAfter.updatedAt ||
        last.phaseRunId !== page.nextAfter.phaseRunId
      ) {
        context.addIssue({
          code: "custom",
          path: ["nextAfter"],
          message: "nextAfter must identify the final returned run",
        });
      }
    }
  });
export type PhaseRunListPageV1 = z.infer<typeof PhaseRunListPageV1Schema>;

/** `phase.approve`/`phase.reject` payload: which run, and why (reject only; approve reason is optional). */
export const PhaseRunDecisionV1Schema = z.strictObject({
  phaseRunId: PhaseRunIdSchema,
  reason: z.string().min(1).max(1_000).nullable(),
});
export type PhaseRunDecisionV1 = z.infer<typeof PhaseRunDecisionV1Schema>;
