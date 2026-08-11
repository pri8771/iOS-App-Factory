import type { z } from "zod";

import { AgentEventV1Schema, AgentRunResultV1Schema, AgentRunSpecV1Schema } from "./agent-run.js";
import { ApprovalV1Schema } from "./approval.js";
import { CommandV1Schema } from "./command.js";
import { CommandRequestFrameV1Schema, CommandResponseV1Schema } from "./command-protocol.js";
import {
  EvidenceManifestV1Schema,
  EvidenceV1Schema,
  FindingV1Schema,
  ReviewReportV1Schema,
} from "./evidence.js";
import { EventV1Schema } from "./event.js";
import { ExecutionAttemptV1Schema, StepV1Schema } from "./execution.js";
import {
  ExternalEffectV1Schema,
  ExternalObservationV1Schema,
  ExternalResourceV1Schema,
} from "./external-effect.js";
import { LessonV1Schema, LifecycleEventV1Schema } from "./learning.js";
import { ModuleManifestV1Schema } from "./module.js";
import { PolicyLockV1Schema, ProjectManifestV1Schema } from "./project.js";
import { QualityReportV1Schema, ReleaseManifestV1Schema } from "./release.js";
import { TaskSpecV1Schema } from "./task-spec.js";

export type ContractSchemaCatalogEntryV1 = Readonly<{
  name: string;
  fileName: string;
  id: string;
  schema: z.ZodType;
}>;

export const contractSchemaCatalogV1 = [
  {
    name: "approval",
    fileName: "approval.v1.schema.json",
    id: "urn:app-factory:contracts:v1:approval",
    schema: ApprovalV1Schema,
  },
  {
    name: "external-effect",
    fileName: "external-effect.v1.schema.json",
    id: "urn:app-factory:contracts:v1:external-effect",
    schema: ExternalEffectV1Schema,
  },
  {
    name: "external-observation",
    fileName: "external-observation.v1.schema.json",
    id: "urn:app-factory:contracts:v1:external-observation",
    schema: ExternalObservationV1Schema,
  },
  {
    name: "external-resource",
    fileName: "external-resource.v1.schema.json",
    id: "urn:app-factory:contracts:v1:external-resource",
    schema: ExternalResourceV1Schema,
  },
  {
    name: "project-manifest",
    fileName: "project-manifest.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-manifest",
    schema: ProjectManifestV1Schema,
  },
  {
    name: "policy-lock",
    fileName: "policy-lock.v1.schema.json",
    id: "urn:app-factory:contracts:v1:policy-lock",
    schema: PolicyLockV1Schema,
  },
  {
    name: "module-manifest",
    fileName: "module-manifest.v1.schema.json",
    id: "urn:app-factory:contracts:v1:module-manifest",
    schema: ModuleManifestV1Schema,
  },
  {
    name: "quality-report",
    fileName: "quality-report.v1.schema.json",
    id: "urn:app-factory:contracts:v1:quality-report",
    schema: QualityReportV1Schema,
  },
  {
    name: "release-manifest",
    fileName: "release-manifest.v1.schema.json",
    id: "urn:app-factory:contracts:v1:release-manifest",
    schema: ReleaseManifestV1Schema,
  },
  {
    name: "lifecycle-event",
    fileName: "lifecycle-event.v1.schema.json",
    id: "urn:app-factory:contracts:v1:lifecycle-event",
    schema: LifecycleEventV1Schema,
  },
  {
    name: "lesson",
    fileName: "lesson.v1.schema.json",
    id: "urn:app-factory:contracts:v1:lesson",
    schema: LessonV1Schema,
  },
  {
    name: "task-spec",
    fileName: "task-spec.v1.schema.json",
    id: "urn:app-factory:contracts:v1:task-spec",
    schema: TaskSpecV1Schema,
  },
  {
    name: "command",
    fileName: "command.v1.schema.json",
    id: "urn:app-factory:contracts:v1:command",
    schema: CommandV1Schema,
  },
  {
    name: "command-request-frame",
    fileName: "command-request-frame.v1.schema.json",
    id: "urn:app-factory:contracts:v1:command-request-frame",
    schema: CommandRequestFrameV1Schema,
  },
  {
    name: "command-response",
    fileName: "command-response.v1.schema.json",
    id: "urn:app-factory:contracts:v1:command-response",
    schema: CommandResponseV1Schema,
  },
  {
    name: "execution-attempt",
    fileName: "execution-attempt.v1.schema.json",
    id: "urn:app-factory:contracts:v1:execution-attempt",
    schema: ExecutionAttemptV1Schema,
  },
  {
    name: "step",
    fileName: "step.v1.schema.json",
    id: "urn:app-factory:contracts:v1:step",
    schema: StepV1Schema,
  },
  {
    name: "event",
    fileName: "event.v1.schema.json",
    id: "urn:app-factory:contracts:v1:event",
    schema: EventV1Schema,
  },
  {
    name: "agent-run-spec",
    fileName: "agent-run-spec.v1.schema.json",
    id: "urn:app-factory:contracts:v1:agent-run-spec",
    schema: AgentRunSpecV1Schema,
  },
  {
    name: "agent-event",
    fileName: "agent-event.v1.schema.json",
    id: "urn:app-factory:contracts:v1:agent-event",
    schema: AgentEventV1Schema,
  },
  {
    name: "agent-run-result",
    fileName: "agent-run-result.v1.schema.json",
    id: "urn:app-factory:contracts:v1:agent-run-result",
    schema: AgentRunResultV1Schema,
  },
  {
    name: "finding",
    fileName: "finding.v1.schema.json",
    id: "urn:app-factory:contracts:v1:finding",
    schema: FindingV1Schema,
  },
  {
    name: "review-report",
    fileName: "review-report.v1.schema.json",
    id: "urn:app-factory:contracts:v1:review-report",
    schema: ReviewReportV1Schema,
  },
  {
    name: "evidence",
    fileName: "evidence.v1.schema.json",
    id: "urn:app-factory:contracts:v1:evidence",
    schema: EvidenceV1Schema,
  },
  {
    name: "evidence-manifest",
    fileName: "evidence-manifest.v1.schema.json",
    id: "urn:app-factory:contracts:v1:evidence-manifest",
    schema: EvidenceManifestV1Schema,
  },
] as const satisfies readonly ContractSchemaCatalogEntryV1[];

export type ContractSchemaNameV1 = (typeof contractSchemaCatalogV1)[number]["name"];
