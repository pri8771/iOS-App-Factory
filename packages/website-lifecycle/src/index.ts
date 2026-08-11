import { createHash } from "node:crypto";

import {
  IsoInstantSchema,
  ProjectIdSchema,
  RelativePathSchema,
  ReleaseIdSchema,
  RunIdSchema,
  Sha256DigestSchema,
  StableKeySchema,
  type LifecycleEventV1,
  type ProjectId,
  type Sha256Digest,
} from "@app-factory/contracts";
import type { FactoryModule, JsonValue } from "@app-factory/module-sdk";
import { z } from "zod";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export class WebsiteLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebsiteLifecycleError";
  }
}

export const WebsiteProjectV1Schema = z.strictObject({
  projectId: ProjectIdSchema,
  slug: StableKeySchema,
  displayName: z.string().trim().min(1).max(120),
});
export type WebsiteProjectV1 = z.infer<typeof WebsiteProjectV1Schema>;

export const WebsiteLifecycleConfigV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    repository: z.string().regex(REPOSITORY_PATTERN),
    baseBranch: z.string().regex(BRANCH_PATTERN),
    statusFile: RelativePathSchema,
    projects: z.array(WebsiteProjectV1Schema).min(1).max(1_000),
  })
  .superRefine((config, context) => {
    const projectIds = config.projects.map((project) => project.projectId);
    const slugs = config.projects.map((project) => project.slug);
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "project IDs must be unique",
      });
    }
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "project slugs must be unique",
      });
    }
  });
export type WebsiteLifecycleConfigV1 = z.infer<typeof WebsiteLifecycleConfigV1Schema>;

export const WebsitePreviewPlanInputV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: ProjectIdSchema,
  releaseId: ReleaseIdSchema,
  lifecycleEventId: RunIdSchema,
  lifecyclePayloadDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  releaseEvidenceDigest: Sha256DigestSchema,
  emittedAt: IsoInstantSchema,
});
export type WebsitePreviewPlanInputV1 = z.infer<typeof WebsitePreviewPlanInputV1Schema>;

export const WebsiteStructuredDataEvidenceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: ProjectIdSchema,
  lifecycleEventId: RunIdSchema,
  candidateCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
  status: z.literal("private-beta"),
  structuredDataDigest: Sha256DigestSchema,
  previewEvidenceDigest: Sha256DigestSchema,
  containsInternalTestFlightLink: z.literal(false),
  checkedAt: IsoInstantSchema,
});
export type WebsiteStructuredDataEvidenceV1 = z.infer<typeof WebsiteStructuredDataEvidenceV1Schema>;

const CONFIG_SCHEMA_DESCRIPTION = {
  schemaVersion: 1,
  name: "website-lifecycle-config-v1",
  fields: ["repository", "baseBranch", "statusFile", "projects"],
} as const;

function configSchemaDigest(): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(JSON.stringify(CONFIG_SCHEMA_DESCRIPTION)).digest("hex")}`,
  );
}

function configFromJson(value: JsonValue): WebsiteLifecycleConfigV1 {
  return WebsiteLifecycleConfigV1Schema.parse(value);
}

function projectFor(config: WebsiteLifecycleConfigV1, projectId: ProjectId): WebsiteProjectV1 {
  const project = config.projects.find((candidate) => candidate.projectId === projectId);
  if (project === undefined) {
    throw new WebsiteLifecycleError(`website configuration does not include project ${projectId}`);
  }
  return project;
}

function effectPayload(config: WebsiteLifecycleConfigV1, input: WebsitePreviewPlanInputV1) {
  const project = projectFor(config, input.projectId);
  return {
    schemaVersion: 1,
    repository: config.repository,
    baseBranch: config.baseBranch,
    branch: `factory/status/${project.slug}/${input.lifecycleEventId}`,
    statusFile: config.statusFile,
    project: {
      projectId: project.projectId,
      slug: project.slug,
      displayName: project.displayName,
      lifecycleStage: "private-beta",
      publicTestFlightLink: null,
    },
    provenance: {
      releaseId: input.releaseId,
      lifecycleEventId: input.lifecycleEventId,
      lifecyclePayloadDigest: input.lifecyclePayloadDigest,
      releaseEvidenceDigest: input.releaseEvidenceDigest,
      policyDigest: input.policyDigest,
      emittedAt: input.emittedAt,
    },
    requestedOutcome: "pull-request-preview-only",
    mergeAuthorized: false,
    deploymentAuthorized: false,
  } as const;
}

function inputFromEvent(event: LifecycleEventV1): WebsitePreviewPlanInputV1 {
  if (event.type !== "release.testflight-available") {
    throw new WebsiteLifecycleError(`unsupported lifecycle event ${event.type}`);
  }
  if (event.releaseId === null) {
    throw new WebsiteLifecycleError("TestFlight availability requires a release ID");
  }
  return WebsitePreviewPlanInputV1Schema.parse({
    schemaVersion: 1,
    projectId: event.projectId,
    releaseId: event.releaseId,
    lifecycleEventId: event.eventId,
    lifecyclePayloadDigest: event.payloadDigest,
    policyDigest: event.policyDigest,
    releaseEvidenceDigest: event.evidenceDigest,
    emittedAt: event.emittedAt,
  });
}

function plannedEffect(config: WebsiteLifecycleConfigV1, input: WebsitePreviewPlanInputV1) {
  const payload = effectPayload(config, input);
  return {
    provider: "website" as const,
    action: "website.pull-request-create" as const,
    resourceType: "website.repository" as const,
    resourceKey: config.repository,
    payload,
    requiresApproval: true as const,
  };
}

export function createWebsiteLifecycleModule(): FactoryModule {
  return {
    manifest: {
      schemaVersion: 1,
      moduleId: "website.lifecycle",
      moduleVersion: "1.0.0",
      trusted: true,
      entrypoint: "dist/index.js",
      minimumKernelVersion: "0.1.0",
      configSchemaDigest: configSchemaDigest(),
      commands: ["website.preview-plan"],
      consumesEvents: ["release.testflight-available"],
      externalEffects: [{ provider: "website", action: "website.pull-request-create" }],
      qualityGates: ["website.structured-data"],
      dashboardPanels: ["website-preview"],
    },
    parseConfig(value) {
      return WebsiteLifecycleConfigV1Schema.parse(value) as JsonValue;
    },
    commands: {
      "website.preview-plan": async (value, context) => {
        const config = configFromJson(context.config);
        const input = WebsitePreviewPlanInputV1Schema.parse(value);
        const effect = plannedEffect(config, input);
        return {
          summary: `A review-only private-beta website PR was planned for ${projectFor(config, input.projectId).displayName}.`,
          output: effect.payload,
          effects: [effect],
        };
      },
    },
    eventConsumers: {
      "release.testflight-available": async (event, context) => {
        const config = configFromJson(context.config);
        const input = inputFromEvent(event);
        return {
          summary: `A review-only private-beta website PR was planned for ${projectFor(config, input.projectId).displayName}.`,
          effects: [plannedEffect(config, input)],
        };
      },
    },
    qualityGates: {
      "website.structured-data": async (value) => {
        const evidence = WebsiteStructuredDataEvidenceV1Schema.parse(value);
        return {
          status: "passed" as const,
          summary: `Website structured data and preview are valid for ${evidence.projectId}.`,
          evidenceDigests: [evidence.structuredDataDigest, evidence.previewEvidenceDigest],
        };
      },
    },
  };
}
