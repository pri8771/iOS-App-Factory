import { z } from "zod";

const LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RELATIVE_PATH_PATTERN =
  /^(?!\/)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)(?!.*\\)(?!.*\0).+$/;
const ABSOLUTE_PATH_PATTERN = /^\/(?!.*\/\/)(?!.*\\)(?!.*\0).+$/;
const NAMESPACED_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/;
const STABLE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ENVIRONMENT_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;

const LowercaseUuidSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID");

export const SchemaVersionV1Schema = z.literal(1);

export const ProjectIdSchema = LowercaseUuidSchema.brand<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const RepositoryIdSchema = LowercaseUuidSchema.brand<"RepositoryId">();
export type RepositoryId = z.infer<typeof RepositoryIdSchema>;

export const TaskIdSchema = LowercaseUuidSchema.brand<"TaskId">();
export type TaskId = z.infer<typeof TaskIdSchema>;

export const CommandIdSchema = LowercaseUuidSchema.brand<"CommandId">();
export type CommandId = z.infer<typeof CommandIdSchema>;

export const RequestIdSchema = LowercaseUuidSchema.brand<"RequestId">();
export type RequestId = z.infer<typeof RequestIdSchema>;

export const AttemptIdSchema = LowercaseUuidSchema.brand<"AttemptId">();
export type AttemptId = z.infer<typeof AttemptIdSchema>;

export const StepIdSchema = LowercaseUuidSchema.brand<"StepId">();
export type StepId = z.infer<typeof StepIdSchema>;

export const RunIdSchema = LowercaseUuidSchema.brand<"RunId">();
export type RunId = z.infer<typeof RunIdSchema>;

export const EventIdSchema = LowercaseUuidSchema.brand<"EventId">();
export type EventId = z.infer<typeof EventIdSchema>;

export const EvidenceIdSchema = LowercaseUuidSchema.brand<"EvidenceId">();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

export const FindingIdSchema = LowercaseUuidSchema.brand<"FindingId">();
export type FindingId = z.infer<typeof FindingIdSchema>;

export const ApprovalIdSchema = LowercaseUuidSchema.brand<"ApprovalId">();
export type ApprovalId = z.infer<typeof ApprovalIdSchema>;

export const EffectIdSchema = LowercaseUuidSchema.brand<"EffectId">();
export type EffectId = z.infer<typeof EffectIdSchema>;

export const ReleaseIdSchema = LowercaseUuidSchema.brand<"ReleaseId">();
export type ReleaseId = z.infer<typeof ReleaseIdSchema>;

export const IsoInstantSchema = z.iso
  .datetime({ offset: false, precision: 3 })
  .brand<"IsoInstant">();
export type IsoInstant = z.infer<typeof IsoInstantSchema>;

export const Sha256DigestSchema = z
  .string()
  .regex(SHA256_PATTERN, "Expected a lowercase sha256 digest")
  .brand<"Sha256Digest">();
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;

export const GitObjectIdSchema = z
  .string()
  .regex(GIT_OBJECT_ID_PATTERN, "Expected a 40- or 64-character Git object ID")
  .brand<"GitObjectId">();
export type GitObjectId = z.infer<typeof GitObjectIdSchema>;

export const RelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(RELATIVE_PATH_PATTERN, "Expected a normalized relative POSIX path")
  .brand<"RelativePath">();
export type RelativePath = z.infer<typeof RelativePathSchema>;

export const AbsolutePathSchema = z
  .string()
  .min(2)
  .max(4_096)
  .regex(ABSOLUTE_PATH_PATTERN, "Expected an absolute POSIX path")
  .brand<"AbsolutePath">();
export type AbsolutePath = z.infer<typeof AbsolutePathSchema>;

export const NamespacedCodeSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(NAMESPACED_CODE_PATTERN, "Expected a lowercase namespaced code")
  .brand<"NamespacedCode">();
export type NamespacedCode = z.infer<typeof NamespacedCodeSchema>;

export const StableKeySchema = z
  .string()
  .regex(STABLE_KEY_PATTERN, "Expected a stable lowercase key")
  .brand<"StableKey">();
export type StableKey = z.infer<typeof StableKeySchema>;

export const EnvironmentNameSchema = z
  .string()
  .regex(ENVIRONMENT_NAME_PATTERN, "Expected an environment variable name")
  .brand<"EnvironmentName">();
export type EnvironmentName = z.infer<typeof EnvironmentNameSchema>;

export const NonNegativeSafeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const PositiveSafeIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const FailureV1Schema = z.strictObject({
  code: NamespacedCodeSchema,
  summary: z.string().min(1).max(1_000),
  retryable: z.boolean(),
  detailArtifactDigest: Sha256DigestSchema.nullable(),
});
export type FailureV1 = z.infer<typeof FailureV1Schema>;

export const BlockerKindV1Schema = z.enum([
  "authentication",
  "clarification",
  "approval",
  "environment",
  "policy",
]);
export type BlockerKindV1 = z.infer<typeof BlockerKindV1Schema>;

export const BlockerV1Schema = z.strictObject({
  kind: BlockerKindV1Schema,
  code: NamespacedCodeSchema,
  summary: z.string().min(1).max(1_000),
  requiredAction: z.string().min(1).max(2_000).nullable(),
});
export type BlockerV1 = z.infer<typeof BlockerV1Schema>;
