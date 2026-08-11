import { z } from "zod";

import {
  AttemptIdSchema,
  BlockerV1Schema,
  FailureV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StepIdSchema,
  TaskIdSchema,
} from "./primitives.js";

export const AttemptStateV1Schema = z.enum([
  "queued",
  "running",
  "paused",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AttemptStateV1 = z.infer<typeof AttemptStateV1Schema>;

export const AttemptDesiredStateV1Schema = z.enum(["running", "paused", "cancelled"]);
export type AttemptDesiredStateV1 = z.infer<typeof AttemptDesiredStateV1Schema>;

export const AttemptOutcomeV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("succeeded") }),
  z.strictObject({
    kind: z.literal("failed"),
    failure: FailureV1Schema,
  }),
  z.strictObject({
    kind: z.literal("cancelled"),
    reason: z.string().min(1).max(1_000),
  }),
]);
export type AttemptOutcomeV1 = z.infer<typeof AttemptOutcomeV1Schema>;

export const ExecutionAttemptV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  attemptId: AttemptIdSchema,
  taskId: TaskIdSchema,
  taskSpecDigest: Sha256DigestSchema,
  attemptNumber: PositiveSafeIntegerSchema,
  state: AttemptStateV1Schema,
  desiredState: AttemptDesiredStateV1Schema,
  revision: NonNegativeSafeIntegerSchema,
  fence: NonNegativeSafeIntegerSchema,
  currentStepId: StepIdSchema.nullable(),
  blocker: BlockerV1Schema.nullable(),
  outcome: AttemptOutcomeV1Schema.nullable(),
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
  terminalAt: IsoInstantSchema.nullable(),
});
export type ExecutionAttemptV1 = z.infer<typeof ExecutionAttemptV1Schema>;

// `ExecutionAttempt` is the canonical descriptive name. The shorter alias is
// kept for command and client APIs where `Attempt` is already unambiguous.
export const AttemptV1Schema = ExecutionAttemptV1Schema;
export type AttemptV1 = ExecutionAttemptV1;

export const StepStateV1Schema = z.enum([
  "pending",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
export type StepStateV1 = z.infer<typeof StepStateV1Schema>;

export const StepV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  stepId: StepIdSchema,
  attemptId: AttemptIdSchema,
  ordinal: NonNegativeSafeIntegerSchema,
  operation: NamespacedCodeSchema,
  state: StepStateV1Schema,
  revision: NonNegativeSafeIntegerSchema,
  lastFence: NonNegativeSafeIntegerSchema,
  runCount: NonNegativeSafeIntegerSchema,
  inputDigest: Sha256DigestSchema,
  outputDigest: Sha256DigestSchema.nullable(),
  blocker: BlockerV1Schema.nullable(),
  failure: FailureV1Schema.nullable(),
  startedAt: IsoInstantSchema.nullable(),
  finishedAt: IsoInstantSchema.nullable(),
});
export type StepV1 = z.infer<typeof StepV1Schema>;
