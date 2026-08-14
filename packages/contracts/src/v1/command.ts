import { z } from "zod";

import {
  AttemptIdSchema,
  CommandIdSchema,
  IsoInstantSchema,
  SchemaVersionV1Schema,
  TaskIdSchema,
} from "./primitives.js";
import { TaskSpecV1Schema } from "./task-spec.js";

export const CommandOriginV1Schema = z.enum(["cli", "mcp", "dashboard", "system"]);
export type CommandOriginV1 = z.infer<typeof CommandOriginV1Schema>;

const CommandEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
};

export const SubmitTaskCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("task.submit"),
  initialDesiredState: z.enum(["running", "paused"]),
  taskSpec: TaskSpecV1Schema,
});

export const SetAttemptDesiredStateCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("attempt.set-desired-state"),
  attemptId: AttemptIdSchema,
  desiredState: z.enum(["running", "paused", "cancelled"]),
  reason: z.string().min(1).max(1_000).nullable(),
});

export const ReconcileDaemonCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("daemon.reconcile"),
  attemptId: AttemptIdSchema.nullable(),
});

export const RetryTaskCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("task.retry"),
  taskId: TaskIdSchema,
  priorAttemptId: AttemptIdSchema,
  initialDesiredState: z.enum(["running", "paused"]),
});

export const UnblockAttemptCommandV1Schema = z.strictObject({
  ...CommandEnvelopeV1Shape,
  kind: z.literal("attempt.unblock"),
  attemptId: AttemptIdSchema,
  answer: z.string().min(1).max(2_000),
});

export const CommandV1Schema = z.discriminatedUnion("kind", [
  SubmitTaskCommandV1Schema,
  SetAttemptDesiredStateCommandV1Schema,
  ReconcileDaemonCommandV1Schema,
  RetryTaskCommandV1Schema,
  UnblockAttemptCommandV1Schema,
]);
export type CommandV1 = z.infer<typeof CommandV1Schema>;
