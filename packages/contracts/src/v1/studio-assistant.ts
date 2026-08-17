import { z } from "zod";

import { PhasePresetIdSchema } from "./phase.js";
import {
  AbsolutePathSchema,
  AssistantIntentIdSchema,
  AttemptIdSchema,
  GitBranchNameSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  ProjectPlanIdSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";
import { ProjectPlanBriefV1Schema } from "./project-plan.js";
import { TaskSpecV1Schema } from "./task-spec.js";

/**
 * Studio Phase 2 assistant contracts: the corner-chat request/response shapes
 * (`studio.assistant.query`) and the propose/execute intent shapes
 * (`studio.assistant.intent.propose` / `studio.assistant.intent.execute`) named in
 * `docs/roadmap/STUDIO_PHASES.md` Phase 3. The daemon-side responder these types feed is a
 * deterministic, rules-based baseline — no LLM in the loop yet — documented on the handler itself
 * in `apps/daemon/src/studio-command-runtime.ts`. It answers only from data already present in a
 * `StudioSnapshotV1` and cites exactly what it read; when it cannot honestly answer (most notably
 * "when does X ship" while no milestone with a real `targetDate` exists) it returns the explicit
 * `cannotAnswer` shape below instead of a guess.
 */

export const AssistantQueryV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  question: z.string().min(1).max(2_000),
  /** Optional scoping to one project; `null` asks over the whole portfolio. */
  projectId: ProjectIdSchema.nullable(),
});
export type AssistantQueryV1 = z.infer<typeof AssistantQueryV1Schema>;

export const AssistantCitationKindV1Schema = z.enum(["attempt", "milestone", "gate", "doc"]);
export type AssistantCitationKindV1 = z.infer<typeof AssistantCitationKindV1Schema>;

export const AssistantCitationV1Schema = z.strictObject({
  kind: AssistantCitationKindV1Schema,
  id: z.string().min(1).max(500),
});
export type AssistantCitationV1 = z.infer<typeof AssistantCitationV1Schema>;

export const AssistantCannotAnswerReasonV1Schema = z.enum([
  "no-milestone-target-date",
  "no-matching-project",
  "no-matching-data",
]);
export type AssistantCannotAnswerReasonV1 = z.infer<typeof AssistantCannotAnswerReasonV1Schema>;

/**
 * `"answered"` always carries at least one citation: the responder is structurally unable to state
 * a fact it cannot point at. `"cannot-answer"` is the explicit, honest refusal shape — most notably
 * for "when does X ship" questions while no milestone with a real `targetDate` exists anywhere in
 * the snapshot, which is every question of that shape until `studio/milestones-and-phase` merges.
 */
export const AssistantAnswerV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("answered"),
    schemaVersion: SchemaVersionV1Schema,
    text: z.string().min(1).max(4_000),
    citations: z.array(AssistantCitationV1Schema).min(1).max(50),
  }),
  z.strictObject({
    kind: z.literal("cannot-answer"),
    schemaVersion: SchemaVersionV1Schema,
    cannotAnswer: z.strictObject({
      reason: AssistantCannotAnswerReasonV1Schema,
      detail: z.string().min(1).max(1_000),
    }),
  }),
]);
export type AssistantAnswerV1 = z.infer<typeof AssistantAnswerV1Schema>;

export const AssistantIntentKindV1Schema = z.enum([
  "queue-task",
  "run-phase",
  "scan-project",
  "enroll-project",
  "approve-attempt",
  "propose-plan",
  "execute-plan",
]);
export type AssistantIntentKindV1 = z.infer<typeof AssistantIntentKindV1Schema>;

/**
 * Each variant's fields are deliberately identical to the payload of the one existing daemon
 * command it dispatches to on execute (see the `operation` named in each comment), so
 * `studio.assistant.intent.execute` can forward a variant's fields verbatim with no field-mapping
 * logic to get wrong. "Parses a small set of phrasings" (per `STUDIO_PHASES.md` Phase 3) means the
 * daemon checks the `utterance` deterministically against a fixed phrase-prefix table for `kind`
 * and requires every identifier this payload names (a task ID, a path, a digest, an attempt ID) to
 * literally appear in `utterance` — not that it infers structured fields from free text. There is
 * no LLM in this loop.
 */
export const AssistantIntentPayloadV1Schema = z.discriminatedUnion("kind", [
  // -> task.submit
  z.strictObject({ kind: z.literal("queue-task"), taskSpec: TaskSpecV1Schema }),
  // -> task.run
  z.strictObject({ kind: z.literal("run-phase"), taskSpec: TaskSpecV1Schema }),
  // -> project.scan
  z.strictObject({ kind: z.literal("scan-project"), repositoryRoot: AbsolutePathSchema }),
  // -> project.apply
  z.strictObject({
    kind: z.literal("enroll-project"),
    planDigest: Sha256DigestSchema,
    branchName: GitBranchNameSchema.nullable(),
  }),
  // -> attempt.unblock
  z.strictObject({
    kind: z.literal("approve-attempt"),
    attemptId: AttemptIdSchema,
    answer: z.string().min(1).max(2_000),
  }),
  // -> plan.propose. "build me X" / "start a new project" / "turn this into a project" in chat.
  z.strictObject({
    kind: z.literal("propose-plan"),
    brief: ProjectPlanBriefV1Schema,
    presetId: PhasePresetIdSchema,
    projectId: ProjectIdSchema.nullable(),
    repositoryId: RepositoryIdSchema.nullable(),
  }),
  // -> plan.execute. "go" after a proposed plan has been reviewed/approved.
  z.strictObject({
    kind: z.literal("execute-plan"),
    planId: ProjectPlanIdSchema,
    expectedRevision: NonNegativeSafeIntegerSchema,
  }),
]);
export type AssistantIntentPayloadV1 = z.infer<typeof AssistantIntentPayloadV1Schema>;

/**
 * A daemon-proposed, not-yet-executed action. `requiresConfirmation` is always `true` for every
 * kind in this daemon version — every payload mutates durable state, so v1 has no auto-execute
 * path — but the field stays a real boolean (not a literal) because a future read-only intent kind
 * could legitimately set it `false`.
 */
export const AssistantIntentV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  intentId: AssistantIntentIdSchema,
  utterance: z.string().min(1).max(2_000),
  payload: AssistantIntentPayloadV1Schema,
  summary: z.string().min(1).max(500),
  requiresConfirmation: z.boolean(),
  proposedAt: IsoInstantSchema,
});
export type AssistantIntentV1 = z.infer<typeof AssistantIntentV1Schema>;
