import { z } from "zod";

import {
  AttemptIdSchema,
  BlockerV1Schema,
  CommandIdSchema,
  EventIdSchema,
  EvidenceIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StepIdSchema,
  TaskIdSchema,
} from "./primitives.js";
import {
  AttemptDesiredStateV1Schema,
  AttemptOutcomeV1Schema,
  AttemptStateV1Schema,
  StepStateV1Schema,
} from "./execution.js";

const EventEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  eventId: EventIdSchema,
  attemptId: AttemptIdSchema,
  sequence: PositiveSafeIntegerSchema,
  occurredAt: IsoInstantSchema,
  commandId: CommandIdSchema.nullable(),
  causationEventId: EventIdSchema.nullable(),
  fence: NonNegativeSafeIntegerSchema,
};

export const AttemptCreatedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("attempt.created"),
  data: z.strictObject({
    taskId: TaskIdSchema,
    taskSpecDigest: Sha256DigestSchema,
  }),
});

export const AttemptStateChangedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("attempt.state-changed"),
  data: z.strictObject({
    from: AttemptStateV1Schema,
    to: AttemptStateV1Schema,
    blocker: BlockerV1Schema.nullable(),
    outcome: AttemptOutcomeV1Schema.nullable(),
  }),
});

export const AttemptDesiredStateChangedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("attempt.desired-state-changed"),
  data: z.strictObject({
    from: AttemptDesiredStateV1Schema,
    to: AttemptDesiredStateV1Schema,
    reason: z.string().min(1).max(1_000).nullable(),
  }),
});

export const AttemptFenceClaimedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("attempt.fence-claimed"),
  data: z.strictObject({
    previousFence: NonNegativeSafeIntegerSchema,
    newFence: NonNegativeSafeIntegerSchema,
    ownerId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
  }),
});

export const AttemptUnblockAnsweredEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("attempt.unblock-answered"),
  data: z.strictObject({
    stepId: StepIdSchema,
    answer: z.string().min(1).max(2_000),
  }),
});

export const StepCreatedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("step.created"),
  data: z.strictObject({
    stepId: StepIdSchema,
    ordinal: NonNegativeSafeIntegerSchema,
    operation: NamespacedCodeSchema,
    inputDigest: Sha256DigestSchema,
  }),
});

export const StepStateChangedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("step.state-changed"),
  data: z.strictObject({
    stepId: StepIdSchema,
    from: StepStateV1Schema,
    to: StepStateV1Schema,
    outputDigest: Sha256DigestSchema.nullable(),
    failureCode: NamespacedCodeSchema.nullable(),
  }),
});

export const EvidenceRecordedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("evidence.recorded"),
  data: z.strictObject({
    evidenceId: EvidenceIdSchema,
    evidenceDigest: Sha256DigestSchema,
  }),
});

export const CommitRecordedEventV1Schema = z.strictObject({
  ...EventEnvelopeV1Shape,
  type: z.literal("commit.recorded"),
  data: z.strictObject({
    commit: GitObjectIdSchema,
    tree: GitObjectIdSchema,
    attemptMarker: z.string().min(1).max(200),
  }),
});

export const EventV1Schema = z.discriminatedUnion("type", [
  AttemptCreatedEventV1Schema,
  AttemptStateChangedEventV1Schema,
  AttemptDesiredStateChangedEventV1Schema,
  AttemptFenceClaimedEventV1Schema,
  AttemptUnblockAnsweredEventV1Schema,
  StepCreatedEventV1Schema,
  StepStateChangedEventV1Schema,
  EvidenceRecordedEventV1Schema,
  CommitRecordedEventV1Schema,
]);
export type EventV1 = z.infer<typeof EventV1Schema>;
