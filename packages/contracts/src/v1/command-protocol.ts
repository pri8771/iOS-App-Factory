import { z } from "zod";

import { CommandOriginV1Schema } from "./command.js";
import { EventV1Schema } from "./event.js";
import { ExecutionAttemptV1Schema, type AttemptDesiredStateV1 } from "./execution.js";
import {
  AttemptIdSchema,
  CommandIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  RequestIdSchema,
  SchemaVersionV1Schema,
  TaskIdSchema,
} from "./primitives.js";
import { TaskSpecV1Schema } from "./task-spec.js";

export const COMMAND_PROTOCOL_VERSION_V1 = 1 as const;
export const CommandProtocolVersionV1Schema = z.literal(COMMAND_PROTOCOL_VERSION_V1);

export const CommandAuthorizationV1Schema = z
  .string()
  .min(32)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "Expected a printable authorization token");
export type CommandAuthorizationV1 = z.infer<typeof CommandAuthorizationV1Schema>;

const RequestMetadataV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  commandId: CommandIdSchema,
  issuedAt: IsoInstantSchema,
  origin: CommandOriginV1Schema,
};

const EmptyPayloadV1Schema = z.strictObject({});
const AttemptPayloadV1Schema = z.strictObject({ attemptId: AttemptIdSchema });
const AttemptReasonPayloadV1Schema = z.strictObject({
  attemptId: AttemptIdSchema,
  reason: z.string().min(1).max(1_000).nullable(),
});

export const DoctorCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("doctor"),
  payload: EmptyPayloadV1Schema,
});

export const SubmitCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("task.submit"),
  payload: z.strictObject({ taskSpec: TaskSpecV1Schema }),
});

export const RunCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("task.run"),
  payload: z.strictObject({ taskSpec: TaskSpecV1Schema }),
});

export const StatusCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.status"),
  payload: AttemptPayloadV1Schema,
});

export const EventsCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.events"),
  payload: z.strictObject({
    attemptId: AttemptIdSchema,
    afterSequence: NonNegativeSafeIntegerSchema,
    limit: PositiveSafeIntegerSchema.max(1_000),
  }),
});

export const PauseCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.pause"),
  payload: AttemptReasonPayloadV1Schema,
});

export const ResumeCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.resume"),
  payload: AttemptReasonPayloadV1Schema,
});

export const CancelCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("attempt.cancel"),
  payload: AttemptReasonPayloadV1Schema,
});

export const ReconcileCommandRequestV1Schema = z.strictObject({
  ...RequestMetadataV1Shape,
  operation: z.literal("daemon.reconcile"),
  payload: z.strictObject({ attemptId: AttemptIdSchema.nullable() }),
});

export const CommandRequestV1Schema = z.discriminatedUnion("operation", [
  DoctorCommandRequestV1Schema,
  SubmitCommandRequestV1Schema,
  RunCommandRequestV1Schema,
  StatusCommandRequestV1Schema,
  EventsCommandRequestV1Schema,
  PauseCommandRequestV1Schema,
  ResumeCommandRequestV1Schema,
  CancelCommandRequestV1Schema,
  ReconcileCommandRequestV1Schema,
]);
export type CommandRequestV1 = z.infer<typeof CommandRequestV1Schema>;
export type CommandOperationV1 = CommandRequestV1["operation"];
export type CommandRequestForOperationV1<Operation extends CommandOperationV1> = Extract<
  CommandRequestV1,
  { operation: Operation }
>;

export const CommandRequestFrameV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema,
  authorization: CommandAuthorizationV1Schema,
  request: CommandRequestV1Schema,
});
export type CommandRequestFrameV1 = z.infer<typeof CommandRequestFrameV1Schema>;

export const DoctorCommandResultV1Schema = z.strictObject({
  operation: z.literal("doctor"),
  readiness: z.enum(["ready", "degraded"]),
  daemonVersion: z.string().min(1).max(100),
  protocolVersion: CommandProtocolVersionV1Schema,
  startedAt: IsoInstantSchema,
  issues: z.array(z.string().min(1).max(1_000)).max(100),
});

const AcceptedAttemptResultV1Shape = {
  taskId: TaskIdSchema,
  attemptId: AttemptIdSchema,
  state: ExecutionAttemptV1Schema.shape.state,
};

export const SubmitCommandResultV1Schema = z.strictObject({
  operation: z.literal("task.submit"),
  ...AcceptedAttemptResultV1Shape,
});

export const RunCommandResultV1Schema = z.strictObject({
  operation: z.literal("task.run"),
  ...AcceptedAttemptResultV1Shape,
});

export const StatusCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.status"),
  attempt: ExecutionAttemptV1Schema,
});

export const EventsCommandResultV1Schema = z.strictObject({
  operation: z.literal("attempt.events"),
  events: z.array(EventV1Schema).max(1_000),
  nextAfterSequence: NonNegativeSafeIntegerSchema,
});

function desiredStateResultSchema<Operation extends string>(
  operation: Operation,
  desiredState: AttemptDesiredStateV1,
) {
  return z.strictObject({
    operation: z.literal(operation),
    attemptId: AttemptIdSchema,
    desiredState: z.literal(desiredState),
    accepted: z.boolean(),
  });
}

export const PauseCommandResultV1Schema = desiredStateResultSchema("attempt.pause", "paused");
export const ResumeCommandResultV1Schema = desiredStateResultSchema("attempt.resume", "running");
export const CancelCommandResultV1Schema = desiredStateResultSchema("attempt.cancel", "cancelled");

export const ReconcileCommandResultV1Schema = z.strictObject({
  operation: z.literal("daemon.reconcile"),
  accepted: z.boolean(),
  reconciledAttemptIds: z.array(AttemptIdSchema).max(10_000),
});

export const CommandResultV1Schema = z.discriminatedUnion("operation", [
  DoctorCommandResultV1Schema,
  SubmitCommandResultV1Schema,
  RunCommandResultV1Schema,
  StatusCommandResultV1Schema,
  EventsCommandResultV1Schema,
  PauseCommandResultV1Schema,
  ResumeCommandResultV1Schema,
  CancelCommandResultV1Schema,
  ReconcileCommandResultV1Schema,
]);
export type CommandResultV1 = z.infer<typeof CommandResultV1Schema>;
export type CommandResultForOperationV1<Operation extends CommandOperationV1> = Extract<
  CommandResultV1,
  { operation: Operation }
>;

export const CommandProtocolErrorV1Schema = z.strictObject({
  code: NamespacedCodeSchema,
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
});
export type CommandProtocolErrorV1 = z.infer<typeof CommandProtocolErrorV1Schema>;

export const CommandSuccessResponseV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema,
  ok: z.literal(true),
  result: CommandResultV1Schema,
});

export const CommandFailureResponseV1Schema = z.strictObject({
  protocolVersion: CommandProtocolVersionV1Schema,
  requestId: RequestIdSchema.nullable(),
  ok: z.literal(false),
  error: CommandProtocolErrorV1Schema,
});

export const CommandResponseV1Schema = z.discriminatedUnion("ok", [
  CommandSuccessResponseV1Schema,
  CommandFailureResponseV1Schema,
]);
export type CommandResponseV1 = z.infer<typeof CommandResponseV1Schema>;
export type CommandSuccessResponseV1 = z.infer<typeof CommandSuccessResponseV1Schema>;
export type CommandFailureResponseV1 = z.infer<typeof CommandFailureResponseV1Schema>;
