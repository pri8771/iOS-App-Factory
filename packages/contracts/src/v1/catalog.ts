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
import { ProjectLifecycleStateV1Schema, TypedGateV1Schema } from "./lifecycle.js";
import { ProjectMilestoneV1Schema, ProjectTimelineV1Schema } from "./milestone.js";
import { MirrorProjectionDiffV1Schema, MirrorProjectionV1Schema } from "./mirror-projection.js";
import { ModuleManifestV1Schema } from "./module.js";
import { PhaseDefinitionV1Schema, PhasePresetV1Schema } from "./phase.js";
import { PhaseRunV1Schema } from "./phase-run.js";
import { PolicyLockV1Schema, ProjectManifestV1Schema } from "./project.js";
import { ProjectDocsSnapshotV1Schema } from "./project-docs-snapshot.js";
import { ProjectPlanV1Schema } from "./project-plan.js";
import { QualityReportV1Schema, ReleaseManifestV1Schema } from "./release.js";
import { RoomGrantV1Schema, RoomMessageV1Schema, RoomV1Schema } from "./room.js";
import {
  AssistantAnswerV1Schema,
  AssistantIntentV1Schema,
  AssistantQueryV1Schema,
} from "./studio-assistant.js";
import { StudioSnapshotV1Schema } from "./studio-snapshot.js";
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
    name: "typed-gate",
    fileName: "typed-gate.v1.schema.json",
    id: "urn:app-factory:contracts:v1:typed-gate",
    schema: TypedGateV1Schema,
  },
  {
    name: "project-lifecycle-state",
    fileName: "project-lifecycle-state.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-lifecycle-state",
    schema: ProjectLifecycleStateV1Schema,
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
    name: "project-milestone",
    fileName: "project-milestone.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-milestone",
    schema: ProjectMilestoneV1Schema,
  },
  {
    name: "project-timeline",
    fileName: "project-timeline.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-timeline",
    schema: ProjectTimelineV1Schema,
  },
  {
    name: "room",
    fileName: "room.v1.schema.json",
    id: "urn:app-factory:contracts:v1:room",
    schema: RoomV1Schema,
  },
  {
    name: "room-message",
    fileName: "room-message.v1.schema.json",
    id: "urn:app-factory:contracts:v1:room-message",
    schema: RoomMessageV1Schema,
  },
  {
    name: "room-grant",
    fileName: "room-grant.v1.schema.json",
    id: "urn:app-factory:contracts:v1:room-grant",
    schema: RoomGrantV1Schema,
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
  {
    name: "studio-snapshot",
    fileName: "studio-snapshot.v1.schema.json",
    id: "urn:app-factory:contracts:v1:studio-snapshot",
    schema: StudioSnapshotV1Schema,
  },
  {
    name: "assistant-query",
    fileName: "assistant-query.v1.schema.json",
    id: "urn:app-factory:contracts:v1:assistant-query",
    schema: AssistantQueryV1Schema,
  },
  {
    name: "assistant-answer",
    fileName: "assistant-answer.v1.schema.json",
    id: "urn:app-factory:contracts:v1:assistant-answer",
    schema: AssistantAnswerV1Schema,
  },
  {
    name: "assistant-intent",
    fileName: "assistant-intent.v1.schema.json",
    id: "urn:app-factory:contracts:v1:assistant-intent",
    schema: AssistantIntentV1Schema,
  },
  {
    name: "phase-definition",
    fileName: "phase-definition.v1.schema.json",
    id: "urn:app-factory:contracts:v1:phase-definition",
    schema: PhaseDefinitionV1Schema,
  },
  {
    name: "phase-preset",
    fileName: "phase-preset.v1.schema.json",
    id: "urn:app-factory:contracts:v1:phase-preset",
    schema: PhasePresetV1Schema,
  },
  {
    name: "project-docs-snapshot",
    fileName: "project-docs-snapshot.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-docs-snapshot",
    schema: ProjectDocsSnapshotV1Schema,
  },
  {
    name: "mirror-projection",
    fileName: "mirror-projection.v1.schema.json",
    id: "urn:app-factory:contracts:v1:mirror-projection",
    schema: MirrorProjectionV1Schema,
  },
  {
    name: "mirror-projection-diff",
    fileName: "mirror-projection-diff.v1.schema.json",
    id: "urn:app-factory:contracts:v1:mirror-projection-diff",
    schema: MirrorProjectionDiffV1Schema,
  },
  {
    name: "project-plan",
    fileName: "project-plan.v1.schema.json",
    id: "urn:app-factory:contracts:v1:project-plan",
    schema: ProjectPlanV1Schema,
  },
  {
    name: "phase-run",
    fileName: "phase-run.v1.schema.json",
    id: "urn:app-factory:contracts:v1:phase-run",
    schema: PhaseRunV1Schema,
  },
] as const satisfies readonly ContractSchemaCatalogEntryV1[];

export type ContractSchemaNameV1 = (typeof contractSchemaCatalogV1)[number]["name"];
