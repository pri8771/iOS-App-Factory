import { z } from "zod";

import {
  EventIdSchema,
  FindingIdSchema,
  IsoInstantSchema,
  LessonIdSchema,
  NamespacedCodeSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

export const LifecycleEventV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  eventId: EventIdSchema,
  type: NamespacedCodeSchema,
  projectId: ProjectIdSchema,
  releaseId: ReleaseIdSchema.nullable(),
  operationKey: z
    .string()
    .min(16)
    .max(500)
    .regex(/^app-factory:v1:[a-z0-9][a-z0-9:._-]+$/),
  payloadDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  evidenceDigest: Sha256DigestSchema,
  causationEventId: EventIdSchema.nullable(),
  emittedAt: IsoInstantSchema,
});
export type LifecycleEventV1 = z.infer<typeof LifecycleEventV1Schema>;

export const LessonV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    lessonId: LessonIdSchema,
    title: z.string().min(1).max(300),
    sourceProjectId: ProjectIdSchema,
    sourceFindingIds: z.array(FindingIdSchema).min(1).max(1_000),
    rootCause: z.string().min(1).max(10_000),
    escapeMechanism: z.string().min(1).max(10_000),
    scope: z.enum(["project", "template", "all-projects", "module"]),
    regressionFixtureDigest: Sha256DigestSchema,
    proposedPolicyDigest: Sha256DigestSchema,
    reviewEvidenceDigest: Sha256DigestSchema.nullable(),
    status: z.enum(["proposed", "approved", "adopted", "rejected"]),
    adoptedProjectIds: z.array(ProjectIdSchema).max(10_000),
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((lesson, context) => {
    if (new Set(lesson.sourceFindingIds).size !== lesson.sourceFindingIds.length) {
      context.addIssue({ code: "custom", message: "source finding IDs must be unique" });
    }
    if (new Set(lesson.adoptedProjectIds).size !== lesson.adoptedProjectIds.length) {
      context.addIssue({ code: "custom", message: "adopted project IDs must be unique" });
    }
    if (
      (lesson.status === "approved" || lesson.status === "adopted") &&
      lesson.reviewEvidenceDigest === null
    ) {
      context.addIssue({ code: "custom", message: "approved lessons require review evidence" });
    }
    if (lesson.status !== "adopted" && lesson.adoptedProjectIds.length > 0) {
      context.addIssue({
        code: "custom",
        message: "only adopted lessons may list adopted projects",
      });
    }
    if (lesson.updatedAt < lesson.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
  });
export type LessonV1 = z.infer<typeof LessonV1Schema>;
