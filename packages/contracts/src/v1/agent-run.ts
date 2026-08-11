import { z } from "zod";

import {
  AbsolutePathSchema,
  AttemptIdSchema,
  BlockerV1Schema,
  EnvironmentNameSchema,
  EventIdSchema,
  FailureV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  RelativePathSchema,
  RunIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StepIdSchema,
} from "./primitives.js";

export const AgentRunLimitsV1Schema = z.strictObject({
  timeoutMs: z.number().int().min(1_000).max(86_400_000),
  terminationGraceMs: z.number().int().min(100).max(60_000),
  maxTurns: z.number().int().min(1).max(1_000),
  maxEventCount: z.number().int().min(1).max(1_000_000),
  maxStdoutBytes: z.number().int().min(0).max(100_000_000),
  maxStderrBytes: z.number().int().min(0).max(100_000_000),
});
export type AgentRunLimitsV1 = z.infer<typeof AgentRunLimitsV1Schema>;

export const AgentRunSpecV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  runId: RunIdSchema,
  attemptId: AttemptIdSchema,
  stepId: StepIdSchema,
  fence: NonNegativeSafeIntegerSchema,
  adapterId: NamespacedCodeSchema,
  taskSpecDigest: Sha256DigestSchema,
  workingDirectory: AbsolutePathSchema,
  instruction: z.string().min(1).max(100_000),
  authorizedWritePaths: z.array(RelativePathSchema).min(1).max(100),
  environmentAllowlist: z.array(EnvironmentNameSchema).max(64),
  limits: AgentRunLimitsV1Schema,
});
export type AgentRunSpecV1 = z.infer<typeof AgentRunSpecV1Schema>;

export const AgentRunStatusV1Schema = z.enum([
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "timed-out",
]);
export type AgentRunStatusV1 = z.infer<typeof AgentRunStatusV1Schema>;

const AgentEventEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  eventId: EventIdSchema,
  runId: RunIdSchema,
  attemptId: AttemptIdSchema,
  stepId: StepIdSchema,
  fence: NonNegativeSafeIntegerSchema,
  sequence: PositiveSafeIntegerSchema,
  occurredAt: IsoInstantSchema,
};

export const AgentStartedEventV1Schema = z.strictObject({
  ...AgentEventEnvelopeV1Shape,
  type: z.literal("agent.started"),
  data: z.strictObject({ adapterId: NamespacedCodeSchema }),
});

export const AgentProgressEventV1Schema = z.strictObject({
  ...AgentEventEnvelopeV1Shape,
  type: z.literal("agent.progress"),
  data: z.strictObject({
    phase: NamespacedCodeSchema,
    level: z.enum(["debug", "info", "warning"]),
    message: z.string().min(1).max(8_000),
  }),
});

export const AgentBlockedEventV1Schema = z.strictObject({
  ...AgentEventEnvelopeV1Shape,
  type: z.literal("agent.blocked"),
  data: z.strictObject({ blocker: BlockerV1Schema }),
});

export const AgentFinishedEventV1Schema = z.strictObject({
  ...AgentEventEnvelopeV1Shape,
  type: z.literal("agent.finished"),
  data: z.strictObject({ status: AgentRunStatusV1Schema }),
});

export const AgentEventV1Schema = z.discriminatedUnion("type", [
  AgentStartedEventV1Schema,
  AgentProgressEventV1Schema,
  AgentBlockedEventV1Schema,
  AgentFinishedEventV1Schema,
]);
export type AgentEventV1 = z.infer<typeof AgentEventV1Schema>;

export const CapturedOutputV1Schema = z.strictObject({
  digest: Sha256DigestSchema,
  byteLength: NonNegativeSafeIntegerSchema,
  truncated: z.boolean(),
});
export type CapturedOutputV1 = z.infer<typeof CapturedOutputV1Schema>;

const ProcessExitV1Schema = z.strictObject({
  exitCode: z.number().int().min(0).max(255).nullable(),
  signal: z
    .string()
    .regex(/^SIG[A-Z0-9]+$/)
    .nullable(),
});

const SuccessfulProcessExitV1Schema = z.strictObject({
  exitCode: z.literal(0),
  signal: z.null(),
});

export const AgentUsageV1Schema = z.strictObject({
  inputTokens: NonNegativeSafeIntegerSchema.nullable(),
  outputTokens: NonNegativeSafeIntegerSchema.nullable(),
  cachedInputTokens: NonNegativeSafeIntegerSchema.nullable(),
});
export type AgentUsageV1 = z.infer<typeof AgentUsageV1Schema>;

const AgentRunResultEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  runId: RunIdSchema,
  attemptId: AttemptIdSchema,
  stepId: StepIdSchema,
  fence: NonNegativeSafeIntegerSchema,
  startedAt: IsoInstantSchema,
  finishedAt: IsoInstantSchema,
  finalEventSequence: NonNegativeSafeIntegerSchema,
  stdout: CapturedOutputV1Schema,
  stderr: CapturedOutputV1Schema,
  usage: AgentUsageV1Schema.nullable(),
};

export const AgentRunSucceededResultV1Schema = z.strictObject({
  ...AgentRunResultEnvelopeV1Shape,
  status: z.literal("succeeded"),
  process: SuccessfulProcessExitV1Schema,
  failure: z.null(),
  blocker: z.null(),
});

export const AgentRunFailedResultV1Schema = z.strictObject({
  ...AgentRunResultEnvelopeV1Shape,
  status: z.literal("failed"),
  process: ProcessExitV1Schema,
  failure: FailureV1Schema,
  blocker: z.null(),
});

export const AgentRunBlockedResultV1Schema = z.strictObject({
  ...AgentRunResultEnvelopeV1Shape,
  status: z.literal("blocked"),
  process: ProcessExitV1Schema,
  failure: z.null(),
  blocker: BlockerV1Schema,
});

export const AgentRunCancelledResultV1Schema = z.strictObject({
  ...AgentRunResultEnvelopeV1Shape,
  status: z.literal("cancelled"),
  process: ProcessExitV1Schema,
  failure: FailureV1Schema,
  blocker: z.null(),
});

export const AgentRunTimedOutResultV1Schema = z.strictObject({
  ...AgentRunResultEnvelopeV1Shape,
  status: z.literal("timed-out"),
  process: ProcessExitV1Schema,
  failure: FailureV1Schema,
  blocker: z.null(),
});

export const AgentRunResultV1Schema = z.discriminatedUnion("status", [
  AgentRunSucceededResultV1Schema,
  AgentRunFailedResultV1Schema,
  AgentRunBlockedResultV1Schema,
  AgentRunCancelledResultV1Schema,
  AgentRunTimedOutResultV1Schema,
]);
export type AgentRunResultV1 = z.infer<typeof AgentRunResultV1Schema>;
