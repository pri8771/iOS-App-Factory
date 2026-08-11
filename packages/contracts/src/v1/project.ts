import { z } from "zod";

import { ExternalProviderV1Schema } from "./external-effect.js";
import {
  EnvironmentNameSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";

export const ProjectKindV1Schema = z.enum(["ios", "web", "service", "library"]);
export type ProjectKindV1 = z.infer<typeof ProjectKindV1Schema>;

export const ProjectLifecycleStageV1Schema = z.enum([
  "exploring",
  "planned",
  "building",
  "qa",
  "internal-testflight",
  "released",
  "paused",
  "archived",
]);
export type ProjectLifecycleStageV1 = z.infer<typeof ProjectLifecycleStageV1Schema>;

const WorkingDirectoryV1Schema = z.union([z.literal("."), RelativePathSchema]);

export const ProjectCommandV1Schema = z.strictObject({
  commandId: StableKeySchema,
  purpose: z.enum([
    "bootstrap",
    "build",
    "test",
    "ui-test",
    "lint",
    "quality",
    "archive",
    "export",
  ]),
  workingDirectory: WorkingDirectoryV1Schema,
  executable: z
    .string()
    .min(1)
    .max(4_096)
    .refine((value) => !value.includes("\0")),
  args: z
    .array(
      z
        .string()
        .max(16_384)
        .refine((value) => !value.includes("\0")),
    )
    .max(256),
  environmentNames: z.array(EnvironmentNameSchema).max(128),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(24 * 60 * 60 * 1_000),
});
export type ProjectCommandV1 = z.infer<typeof ProjectCommandV1Schema>;

export const ProjectManifestV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    projectId: ProjectIdSchema,
    slug: StableKeySchema,
    displayName: z.string().min(1).max(200),
    kind: ProjectKindV1Schema,
    lifecycleStage: ProjectLifecycleStageV1Schema,
    repository: z.strictObject({
      repositoryId: RepositoryIdSchema,
      defaultBranch: z
        .string()
        .min(1)
        .max(255)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
      remoteUrl: z.url().max(4_096).nullable(),
      branchPolicy: z.literal("short-lived-issue-branches"),
    }),
    rules: z.strictObject({
      authorityPath: RelativePathSchema,
      authorityDigest: Sha256DigestSchema,
      policyLockPath: RelativePathSchema,
      policyDigest: Sha256DigestSchema,
      clientEntrypoints: z
        .array(
          z.strictObject({
            client: z.enum(["codex", "claude", "cursor", "antigravity"]),
            path: RelativePathSchema,
            digest: Sha256DigestSchema,
          }),
        )
        .max(20),
    }),
    protectedPaths: z.array(RelativePathSchema).min(1).max(1_000),
    capabilities: z.array(NamespacedCodeSchema).max(500),
    commands: z.array(ProjectCommandV1Schema).max(100),
    integrations: z
      .array(
        z.strictObject({
          provider: ExternalProviderV1Schema,
          resourceType: NamespacedCodeSchema,
          resourceKey: z.string().min(1).max(1_000),
          credentialReference: z.string().min(1).max(500).nullable(),
        }),
      )
      .max(100),
    qualityProfiles: z.array(NamespacedCodeSchema).min(1).max(50),
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((manifest, context) => {
    const unique = (values: readonly string[], label: string): void => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${label} must be unique` });
      }
    };
    unique(manifest.protectedPaths, "protectedPaths");
    unique(manifest.capabilities, "capabilities");
    unique(
      manifest.commands.map((command) => command.commandId),
      "command IDs",
    );
    unique(manifest.qualityProfiles, "qualityProfiles");
    unique(
      manifest.rules.clientEntrypoints.map((entry) => entry.client),
      "rule clients",
    );
    if (manifest.updatedAt < manifest.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
  });
export type ProjectManifestV1 = z.infer<typeof ProjectManifestV1Schema>;

export const PolicyLockV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    policyId: NamespacedCodeSchema,
    policyVersion: PositiveSafeIntegerSchema,
    policyDigest: Sha256DigestSchema,
    authorityFiles: z
      .array(z.strictObject({ path: RelativePathSchema, digest: Sha256DigestSchema }))
      .min(1)
      .max(100),
    protectedSurfaces: z
      .array(
        z.strictObject({
          path: RelativePathSchema,
          classification: z.enum([
            "policy",
            "ci",
            "test-harness",
            "baseline",
            "quality-threshold",
            "signing",
            "release",
          ]),
          changeApprovalAction: NamespacedCodeSchema,
        }),
      )
      .min(1)
      .max(1_000),
    requiredChecks: z.array(NamespacedCodeSchema).min(1).max(200),
    generatedAt: IsoInstantSchema,
  })
  .superRefine((lock, context) => {
    const uniqueCollections: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["authorityFiles", lock.authorityFiles.map((entry) => entry.path)],
      ["protectedSurfaces", lock.protectedSurfaces.map((entry) => entry.path)],
      ["requiredChecks", lock.requiredChecks],
    ];
    for (const [label, values] of uniqueCollections) {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${label} must be unique` });
      }
    }
  });
export type PolicyLockV1 = z.infer<typeof PolicyLockV1Schema>;
