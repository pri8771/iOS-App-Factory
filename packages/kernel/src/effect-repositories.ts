import { createHash } from "node:crypto";

import {
  ApprovalIdSchema,
  ApprovalV1Schema,
  EffectIdSchema,
  EffectListPageV1Schema,
  EffectListQueryV1Schema,
  EffectStateCountsV1Schema,
  EventIdSchema,
  ExternalEffectV1Schema,
  ExternalObservationV1Schema,
  ExternalResourceV1Schema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  StepIdSchema,
  TaskSpecV1Schema,
  isReleaseScopedApprovalSubjectV1,
  type ApprovalV1,
  type EffectListPageV1,
  type EffectListQueryV1,
  type EffectStateCountsV1,
  type ExternalEffectStateV1,
  type ExternalEffectV1,
  type ExternalObservationV1,
  type ExternalProviderV1,
  type ExternalResourceV1,
  type GitObjectId,
  type IsoInstant,
  type NamespacedCode,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

import { canonicalJson, computeTaskSpecDigest } from "./canonical-json.js";
import { assertActiveAttemptLease } from "./durability-repositories.js";

export const MAX_EFFECT_OUTBOX_LEASE_MS = 5 * 60 * 1_000;
export const MAX_EFFECT_RECONCILE_BACKOFF_MS = 24 * 60 * 60 * 1_000;
export const MAX_UNRESOLVED_RECONCILIATIONS = 8;

/**
 * Nominal error emitted only by the trusted repository when a fenced effect
 * claim or its dispatch authorization is no longer usable. Consumers must use
 * `instanceof`; provider-controlled text is never a claim-loss signal.
 */
export class EffectClaimLostError extends Error {
  public constructor(message: string) {
    super(`Factory external-effect invariant failed: ${message}`);
    this.name = "EffectClaimLostError";
  }
}

const EFFECT_STATES = new Set<ExternalEffectStateV1>([
  "planned",
  "sent",
  "observed",
  "confirmed",
  "unknown",
  "manual-intervention",
  "rejected",
]);

export const LEGAL_EXTERNAL_EFFECT_TRANSITIONS = {
  planned: ["sent"],
  sent: ["observed", "unknown", "rejected"],
  observed: ["confirmed", "manual-intervention"],
  confirmed: [],
  unknown: ["unknown", "observed", "manual-intervention"],
  "manual-intervention": [],
  rejected: [],
} as const satisfies Readonly<Record<ExternalEffectStateV1, readonly ExternalEffectStateV1[]>>;

type RequiredBinding = keyof EffectBinding;

/**
 * Which `ApprovalV1.subject` shape an action's approval must carry (Release Rail architecture
 * decision 7). `"attempt"` is the existing, unchanged shape every action used before Wave 2:
 * `assertSubjectMatchesAttempt` requires a non-null `attemptId`/`taskId`/`projectId` that resolves
 * to a real attempt. `"release"` is the new shape, used only by `apple.upload-build`: `projectId` +
 * `releaseId`, with `taskId`/`attemptId` both null (`isReleaseScopedApprovalSubjectV1`,
 * `@app-factory/contracts`) -- a release-rail action has no backing task or attempt to bind to.
 * `registerApproval` branches on this per-action; see its call site for the exact rule.
 */
type ExternalActionSubjectScope = "attempt" | "release";

const EXTERNAL_ACTION_POLICIES = {
  "github.issue-create": {
    provider: "github",
    resourceTypes: ["github.issue"],
    requiredBindings: ["planDigest"],
    subjectScope: "attempt",
  },
  "github.open-pr": {
    provider: "github",
    resourceTypes: ["github.pull-request"],
    requiredBindings: ["planDigest", "diffDigest", "commit"],
    subjectScope: "attempt",
  },
  "github.merge": {
    provider: "github",
    resourceTypes: ["github.pull-request"],
    requiredBindings: ["planDigest", "diffDigest", "commit"],
    subjectScope: "attempt",
  },
  "github.merge-pr": {
    provider: "github",
    resourceTypes: ["github.pull-request"],
    requiredBindings: ["planDigest", "diffDigest", "commit"],
    subjectScope: "attempt",
  },
  "github.close-pr": {
    provider: "github",
    resourceTypes: ["github.pull-request"],
    requiredBindings: ["planDigest", "diffDigest"],
    subjectScope: "attempt",
  },
  "jira.transition-issue": {
    provider: "jira",
    resourceTypes: ["jira.issue"],
    requiredBindings: ["planDigest", "diffDigest"],
    subjectScope: "attempt",
  },
  // Project-provisioning actions emitted by
  // `@app-factory/work-tracking-integrations`'s `createProjectProvisionPlan`
  // (see packages/work-tracking-integrations/src/plan.ts). These are not
  // tied to a code change, so they bind only `planDigest` - the digest of
  // the approved `ProjectProvisionPlanV1` each operation was drawn from -
  // and leave diffDigest/commit/buildIdentityDigest null.
  "jira.project.ensure": {
    provider: "jira",
    resourceTypes: ["jira.project"],
    requiredBindings: ["planDigest"],
    subjectScope: "attempt",
  },
  "jira.epic.ensure": {
    provider: "jira",
    resourceTypes: ["jira.issue"],
    requiredBindings: ["planDigest"],
    subjectScope: "attempt",
  },
  "jira.issue.ensure": {
    provider: "jira",
    resourceTypes: ["jira.issue"],
    requiredBindings: ["planDigest"],
    subjectScope: "attempt",
  },
  "github.repository.ensure": {
    provider: "github",
    resourceTypes: ["github.repository"],
    requiredBindings: ["planDigest"],
    subjectScope: "attempt",
  },
  // The one release-scoped action (Release Rail architecture decision 7). Already registered here
  // since Wave 1; Wave 2 adds only `subjectScope: "release"` -- the required bindings and resource
  // type are unchanged.
  "apple.upload-build": {
    provider: "apple",
    resourceTypes: ["apple.build"],
    requiredBindings: ["planDigest", "commit", "buildIdentityDigest"],
    subjectScope: "release",
  },
} as const satisfies Readonly<
  Record<
    string,
    Readonly<{
      provider: ExternalProviderV1;
      resourceTypes: readonly string[];
      requiredBindings: readonly RequiredBinding[];
      subjectScope: ExternalActionSubjectScope;
    }>
  >
>;

type ApprovalRow = Readonly<{
  approval_id: string;
  action: string;
  resource_type: string;
  resource_key: string;
  subject_project_id: string | null;
  subject_task_id: string | null;
  subject_attempt_id: string | null;
  subject_release_id: string | null;
  payload_digest: string;
  plan_digest: string | null;
  diff_digest: string | null;
  commit_id: string | null;
  build_identity_digest: string | null;
  policy_digest: string;
  actor_id: string;
  issuer_id: string;
  authenticated_at: string;
  issuance_envelope_digest: string;
  issuance_attestation_digest: string;
  issuance_json: string;
  mode: string;
  standing_scope_json: string | null;
  issued_at: string;
  expires_at: string;
  status: string;
  revoked_at: string | null;
  consumed_at: string | null;
  consumed_by_effect_id: string | null;
  payload_json: string;
}>;

type EffectRow = Readonly<{
  effect_id: string;
  attempt_id: string | null;
  action: string;
  operation_marker: string;
  provider: string;
  resource_type: string;
  resource_key: string;
  subject_project_id: string | null;
  subject_task_id: string | null;
  subject_attempt_id: string | null;
  subject_release_id: string | null;
  payload_digest: string;
  policy_digest: string;
  plan_digest: string | null;
  diff_digest: string | null;
  commit_id: string | null;
  build_identity_digest: string | null;
  standing_scope: string | null;
  intent_digest: string;
  available_at: string;
  approval_id: string;
  state: string;
  revision: number;
  send_count: number;
  provider_correlation_key: string | null;
  created_at: string;
  updated_at: string;
  last_observed_at: string | null;
  next_reconcile_at: string | null;
  detail_digest: string | null;
  payload_json: string;
}>;

type OutboxRow = Readonly<{
  effect_id: string;
  available_at: string;
  locked_by: string | null;
  locked_until: string | null;
  fence: number;
  revision: number;
}>;

type ResourceRow = Readonly<{
  effect_id: string;
  observation_sequence: number;
  provider: string;
  resource_type: string;
  resource_key: string;
  provider_resource_id: string;
  provider_url: string | null;
  provider_version: string | null;
  observed_digest: string;
  observed_at: string;
  observation_invocation_id: string;
  payload_json: string;
}>;

type ObservationRow = Readonly<{
  invocation_id: string;
  effect_id: string;
  observation_sequence: number;
  source: string;
  adapter_id: string;
  adapter_version: string;
  evidence_digest: string;
  attestation_digest: string;
  envelope_digest: string;
  resource_observed_digest: string;
  observed_at: string;
  owner_id: string;
  fence: number;
  payload_json: string;
}>;

type OriginCheckpointRow = Readonly<{
  checkpoint_id: string;
  effect_id: string;
  approval_id: string;
  standing_scope: string | null;
  attempt_id: string;
  step_id: string;
  attempt_revision: number;
  step_revision: number;
  checkpoint_revision: number;
  owner_id: string;
  fence: number;
  occurred_at: string;
  intent_digest: string;
}>;

type AttemptTaskRow = Readonly<{
  attempt_id: string;
  task_id: string;
  task_spec_digest: string;
  attempt_revision: number;
  fence: number;
  state: string;
  desired_state: string;
  current_step_id: string | null;
  project_id: string;
  task_payload_json: string;
}>;

type OriginStepRow = Readonly<{
  step_id: string;
  attempt_id: string;
  state: string;
  revision: number;
  last_fence: number;
  effect_checkpoint_revision: number;
}>;

export type EffectBinding = Readonly<{
  planDigest: Sha256Digest | null;
  diffDigest: Sha256Digest | null;
  commit: GitObjectId | null;
  buildIdentityDigest: Sha256Digest | null;
}>;

export type PersistedApproval = Readonly<{
  approval: ApprovalV1;
  payloadDigest: Sha256Digest;
  issuance: ApprovalIssuanceAttestation;
}>;

export type PersistedEffect = Readonly<{
  effect: ExternalEffectV1;
  binding: EffectBinding;
  standingScope: NamespacedCode | null;
  intentDigest: Sha256Digest;
  availableAt: IsoInstant;
}>;

export type EffectOutboxClaim = Readonly<{
  effect: ExternalEffectV1;
  availableAt: IsoInstant;
  lockedBy: string;
  lockedUntil: IsoInstant;
  fence: number;
  revision: number;
}>;

export type ApprovalIssuanceAttestation = Readonly<{
  issuerId: string;
  authenticatedAt: IsoInstant;
  envelopeDigest: Sha256Digest;
  attestationDigest: Sha256Digest;
}>;

export type ApprovalIssuanceEnvelope = Readonly<{
  approval: ApprovalV1;
  payloadDigest: Sha256Digest;
  issuerId: string;
  authenticatedAt: IsoInstant;
  envelopeDigest: Sha256Digest;
  attestationDigest: Sha256Digest;
}>;

export type ApprovalIssuanceVerifier = (issuance: ApprovalIssuanceEnvelope) => boolean;

export type ObservationAttestationEnvelope = Readonly<{
  observation: ExternalObservationV1;
  effect: ExternalEffectV1;
  resource: ExternalResourceV1;
  ownerId: string;
  fence: number;
  envelopeDigest: Sha256Digest;
}>;

export type ObservationAttestationVerifier = (envelope: ObservationAttestationEnvelope) => boolean;

export type EffectRepositoryOptions = Readonly<{
  /**
   * Sole trusted boundary for active approval creation. The verifier belongs to
   * the authenticated approval service, never to an agent or provider adapter.
   */
  verifyApprovalIssuance?: ApprovalIssuanceVerifier;
  /** Trusted observation broker; provider adapters cannot self-approve evidence. */
  verifyObservationAttestation?: ObservationAttestationVerifier;
}>;

export type RegisterApprovalInput = Readonly<{
  issuance: Readonly<{
    approval: unknown;
    payloadDigest: unknown;
    issuerId: unknown;
    authenticatedAt: unknown;
    attestationDigest: unknown;
  }>;
}>;

export type RegisterApprovalResult = PersistedApproval & Readonly<{ duplicate: boolean }>;

export type PlanExternalEffectInput = Readonly<{
  effect: unknown;
  binding: Readonly<{
    planDigest: unknown;
    diffDigest: unknown;
    commit: unknown;
    buildIdentityDigest: unknown;
  }>;
  authorizedAt: unknown;
  availableAt: unknown;
  standingScope: unknown;
  origin: Readonly<{
    checkpointId: unknown;
    leaseKey: unknown;
    ownerId: unknown;
    fence: unknown;
    stepId: unknown;
    expectedAttemptRevision: unknown;
    expectedStepRevision: unknown;
    expectedCheckpointRevision: unknown;
  }>;
}>;

export type PlanExternalEffectResult = PersistedEffect & Readonly<{ duplicate: boolean }>;

export type ClaimEffectInput = Readonly<{
  ownerId: unknown;
  observedAt: unknown;
  lockedUntil: unknown;
}>;

export type ClaimedEffectMutationInput = Readonly<{
  effectId: unknown;
  ownerId: unknown;
  fence: unknown;
  expectedOutboxRevision: unknown;
  expectedEffectRevision: unknown;
  observedAt: unknown;
}>;

export type EffectDispatchToken = Readonly<{
  effectId: string;
  ownerId: string;
  fence: number;
  outboxRevision: number;
  effectRevision: number;
}>;

export type BeginSendResult = PersistedEffect &
  Readonly<{
    dispatchToken: EffectDispatchToken;
  }>;

export type RecordSendOutcomeInput = ClaimedEffectMutationInput &
  Readonly<{
    outcome:
      | Readonly<{
          kind: "observed";
          providerCorrelationKey: unknown;
          resource: unknown;
          observation: unknown;
          detailDigest: unknown;
        }>
      | Readonly<{
          kind: "timeout" | "ambiguous";
          providerCorrelationKey: unknown;
          nextReconcileAt: unknown;
          detailDigest: unknown;
        }>
      | Readonly<{
          kind: "rejected";
          code: unknown;
          retryable: unknown;
          evidenceDigest: unknown;
        }>;
  }>;

export type RecordReconciliationObservedInput = ClaimedEffectMutationInput &
  Readonly<{
    providerCorrelationKey: unknown;
    resource: unknown;
    observation: unknown;
    detailDigest: unknown;
  }>;

export type RecordReconciliationUnknownInput = ClaimedEffectMutationInput &
  Readonly<{
    providerCorrelationKey: unknown;
    nextReconcileAt: unknown;
    detailDigest: unknown;
  }>;

export type RecordReconciliationUnresolvedInput = ClaimedEffectMutationInput &
  Readonly<{
    outcome: "not-found" | "ambiguous";
    providerCorrelationKey: unknown;
    nextReconcileAt: unknown;
    detailDigest: unknown;
  }>;

/**
 * A failed follow-up cannot erase a previously attested observation. This
 * operation records the reconciliation attempt and releases its claim while
 * deliberately preserving the `observed` state for a later confirmation.
 */
export type DeferObservedReconciliationInput = ClaimedEffectMutationInput &
  Readonly<{
    outcome: "not-found" | "ambiguous";
    providerCorrelationKey: unknown;
    nextReconcileAt: unknown;
    detailDigest: unknown;
  }>;

export type ConfirmObservedInput = ClaimedEffectMutationInput &
  Readonly<{
    providerCorrelationKey: unknown;
    resource: unknown;
    observation: unknown;
    confirmationEvidenceDigest: unknown;
  }>;

export type EffectRepository = Readonly<{
  registerApproval(input: RegisterApprovalInput): RegisterApprovalResult;
  getApproval(approvalId: unknown): PersistedApproval | null;
  revokeApproval(approvalId: unknown, revokedAt: unknown): PersistedApproval;
  expireApproval(approvalId: unknown, observedAt: unknown): PersistedApproval;
  planExternalEffect(input: PlanExternalEffectInput): PlanExternalEffectResult;
  getEffect(effectId: unknown): PersistedEffect | null;
  getExternalResource(effectId: unknown): ExternalResourceV1 | null;
  claimNextSend(input: ClaimEffectInput): EffectOutboxClaim | null;
  claimNextReconciliation(input: ClaimEffectInput): EffectOutboxClaim | null;
  beginSend(input: ClaimedEffectMutationInput): BeginSendResult;
  assertDispatchActive(token: EffectDispatchToken, observedAt: unknown): PersistedEffect;
  assertReconciliationActive(token: EffectDispatchToken, observedAt: unknown): PersistedEffect;
  recordSendOutcome(input: RecordSendOutcomeInput): PersistedEffect;
  recordReconciliationObserved(input: RecordReconciliationObservedInput): PersistedEffect;
  recordReconciliationUnknown(input: RecordReconciliationUnknownInput): PersistedEffect;
  recordReconciliationUnresolved(input: RecordReconciliationUnresolvedInput): PersistedEffect;
  deferObservedReconciliation(input: DeferObservedReconciliationInput): PersistedEffect;
  confirmObserved(input: ConfirmObservedInput): PersistedEffect;
  requireManualIntervention(
    input: ClaimedEffectMutationInput & Readonly<{ detailDigest: unknown }>,
  ): PersistedEffect;
  listEffectsForReconciliation(asOf: unknown, limit?: unknown): readonly PersistedEffect[];
  /** Bounded, keyset-paginated operator read model ordered by (updatedAt, effectId) descending. */
  listEffects(input: unknown): EffectListPageV1;
  /** Total effects per durable state, fully zero-filled across every `ExternalEffectStateV1`. */
  countEffectsByState(): EffectStateCountsV1;
  /**
   * Outbox rows that are both actionable (send-eligible or reconcile-due as
   * of `asOf`) and not currently claimed. This intentionally does not
   * replicate `claim()`'s full approval/attempt eligibility join: it is an
   * operator-facing superset ("things still cycling through the outbox"),
   * not a promise that the next claim will succeed.
   */
  countPendingOutbox(asOf: unknown): number;
}>;

type ParsedPlanningOrigin = Readonly<{
  checkpointId: string;
  leaseKey: unknown;
  ownerId: string;
  fence: number;
  stepId: string;
  expectedAttemptRevision: number;
  expectedStepRevision: number;
  expectedCheckpointRevision: number;
}>;

function fail(message: string): never {
  throw new Error(`Factory external-effect invariant failed: ${message}`);
}

function claimLost(message: string): never {
  throw new EffectClaimLostError(message);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    fail(`${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
  }
}

function assertJsonSame(label: string, actual: unknown, expected: unknown): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail(`${label} does not match`);
  }
}

function parseJson<T>(
  table: string,
  identifier: string,
  payload: string,
  parser: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch (error) {
    throw new Error(`${table} ${identifier} contains invalid JSON`, { cause: error });
  }
  try {
    return parser(value);
  } catch (error) {
    throw new Error(`${table} ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

function parseNullableDigest(value: unknown): Sha256Digest | null {
  return value === null ? null : Sha256DigestSchema.parse(value);
}

function parseNullableCommit(value: unknown): GitObjectId | null {
  return value === null ? null : GitObjectIdSchema.parse(value);
}

function parseNullableString(value: unknown, label: string, maximum = 1_000): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new TypeError(`${label} must be null or a 1-${maximum} character string`);
  }
  return value;
}

function parseOwnerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new TypeError("ownerId must be 1-200 portable identifier characters");
  }
  return value;
}

function parseIssuerId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 320) {
    throw new TypeError("issuerId must be a 1-320 character authenticated identity");
  }
  return value;
}

function digestCanonical(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`,
  );
}

export function computeObservationAttestationEnvelopeDigest(
  input: Omit<ObservationAttestationEnvelope, "envelopeDigest">,
): Sha256Digest {
  const observationClaims = {
    schemaVersion: input.observation.schemaVersion,
    invocationId: input.observation.invocationId,
    source: input.observation.source,
    adapterId: input.observation.adapterId,
    adapterVersion: input.observation.adapterVersion,
    evidenceDigest: input.observation.evidenceDigest,
    observedAt: input.observation.observedAt,
  };
  return digestCanonical({
    schemaVersion: 1,
    observation: observationClaims,
    effect: input.effect,
    resource: input.resource,
    ownerId: input.ownerId,
    fence: input.fence,
  });
}

function parseApprovalIssuance(input: RegisterApprovalInput): ApprovalIssuanceEnvelope {
  if (input.issuance === null || typeof input.issuance !== "object") {
    fail("authenticated approval issuance envelope is required");
  }
  const approval = assertApprovalSemantics(input.issuance.approval);
  const payloadDigest = Sha256DigestSchema.parse(input.issuance.payloadDigest);
  const issuerId = parseIssuerId(input.issuance.issuerId);
  const authenticatedAt = IsoInstantSchema.parse(input.issuance.authenticatedAt);
  const attestationDigest = Sha256DigestSchema.parse(input.issuance.attestationDigest);
  if (authenticatedAt !== approval.issuedAt) {
    fail("authenticated issuance time must equal approval issuedAt");
  }
  const envelopeDigest = digestCanonical({
    schemaVersion: 1,
    approval,
    payloadDigest,
    issuerId,
    authenticatedAt,
  });
  return {
    approval,
    payloadDigest,
    issuerId,
    authenticatedAt,
    envelopeDigest,
    attestationDigest,
  };
}

function assertSafeResourceKey(resourceKey: string): void {
  if (resourceKey.trim() !== resourceKey || resourceKey.length === 0) {
    fail("resource key must be non-blank and normalized");
  }
  if (/[*{}<>]/.test(resourceKey) || /(^|[/#:])(all|any|wildcard)($|[/#:])/i.test(resourceKey)) {
    fail("wildcard-like resource keys are forbidden");
  }
}

function requireActionPolicy(action: string) {
  const policy = EXTERNAL_ACTION_POLICIES[action as keyof typeof EXTERNAL_ACTION_POLICIES];
  if (policy === undefined) {
    fail(`external mutation action is not registered: ${action}`);
  }
  return policy;
}

function assertActionSpecificBindings(action: string, binding: EffectBinding): void {
  const policy = requireActionPolicy(action);
  const missing = policy.requiredBindings.filter((name) => binding[name] === null);
  if (missing.length > 0) {
    fail(`${action} approval requires exact bindings: ${missing.join(", ")}`);
  }
}

function externalEffectIntentValue(
  effect: ExternalEffectV1,
  binding: EffectBinding,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    attemptId: effect.attemptId,
    action: effect.action,
    target: effect.target,
    subject: effect.subject,
    payloadDigest: effect.payloadDigest,
    policyDigest: effect.policyDigest,
    binding,
  };
}

export function computeExternalEffectIntentDigest(
  effect: ExternalEffectV1,
  binding: EffectBinding,
): Sha256Digest {
  return digestCanonical(externalEffectIntentValue(effect, binding));
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 100;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000) {
    throw new TypeError("limit must be a safe integer from 1 through 1000");
  }
  return value as number;
}

function assertIncreasingTime(earlier: string, later: string, label: string): void {
  if (later <= earlier) fail(`${label} must be later than ${earlier}`);
}

function assertBoundedOutboxLease(observedAt: IsoInstant, lockedUntil: IsoInstant): void {
  assertIncreasingTime(observedAt, lockedUntil, "outbox lockedUntil");
  const durationMs = Date.parse(lockedUntil) - Date.parse(observedAt);
  if (durationMs > MAX_EFFECT_OUTBOX_LEASE_MS) {
    fail(`outbox lease exceeds ${MAX_EFFECT_OUTBOX_LEASE_MS}ms maximum`);
  }
}

function assertBoundedReconcileAt(observedAt: IsoInstant, nextReconcileAt: IsoInstant): void {
  assertIncreasingTime(observedAt, nextReconcileAt, "nextReconcileAt");
  const durationMs = Date.parse(nextReconcileAt) - Date.parse(observedAt);
  if (durationMs > MAX_EFFECT_RECONCILE_BACKOFF_MS) {
    fail(`reconciliation backoff exceeds ${MAX_EFFECT_RECONCILE_BACKOFF_MS}ms maximum`);
  }
}

function assertSubjectSemantics(subject: ApprovalV1["subject"]): void {
  const { projectId, taskId, attemptId, releaseId } = subject;
  if (projectId === null && taskId === null && attemptId === null && releaseId === null) {
    fail("approval subject must identify at least one resource");
  }
  if (attemptId !== null && (taskId === null || projectId === null)) {
    fail("an attempt-scoped subject must also identify its task and project");
  }
  if (taskId !== null && projectId === null) {
    fail("a task-scoped subject must also identify its project");
  }
}

export function assertApprovalSemantics(value: unknown): ApprovalV1 {
  const approval = ApprovalV1Schema.parse(value);
  assertSubjectSemantics(approval.subject);
  assertIncreasingTime(approval.issuedAt, approval.expiresAt, "approval expiresAt");

  if (approval.mode === "single-use") {
    if (approval.standingScope !== null) fail("single-use approval cannot have standing scope");
  } else {
    if (approval.standingScope === null || approval.standingScope.length === 0) {
      fail("standing approval must have a non-empty standing scope");
    }
    if (new Set(approval.standingScope).size !== approval.standingScope.length) {
      fail("standing approval scope must not contain duplicates");
    }
  }
  assertSafeResourceKey(approval.resourceKey);
  assertActionSpecificBindings(approval.action, approval.binding);
  const actionPolicy = requireActionPolicy(approval.action);
  if (!(actionPolicy.resourceTypes as readonly string[]).includes(approval.resourceType)) {
    fail(
      `approval resource type is not registered for ${approval.action}: ${approval.resourceType}`,
    );
  }

  switch (approval.status) {
    case "active":
    case "expired":
      if (
        approval.revokedAt !== null ||
        approval.consumedAt !== null ||
        approval.consumedByEffectId !== null
      ) {
        fail(`${approval.status} approval cannot contain revocation or consumption data`);
      }
      break;
    case "revoked":
      if (
        approval.revokedAt === null ||
        approval.consumedAt !== null ||
        approval.consumedByEffectId !== null
      ) {
        fail("revoked approval must contain only revokedAt terminal data");
      }
      if (approval.revokedAt < approval.issuedAt) fail("approval cannot be revoked before issue");
      if (approval.revokedAt >= approval.expiresAt) fail("approval cannot be revoked after expiry");
      break;
    case "consumed":
      if (
        approval.mode !== "single-use" ||
        approval.revokedAt !== null ||
        approval.consumedAt === null ||
        approval.consumedByEffectId === null
      ) {
        fail("only a single-use approval can be consumed with complete consumption data");
      }
      if (approval.consumedAt < approval.issuedAt || approval.consumedAt >= approval.expiresAt) {
        fail("approval consumption must occur during its validity interval");
      }
      break;
  }
  return approval;
}

export function isLegalExternalEffectTransition(
  from: ExternalEffectStateV1,
  to: ExternalEffectStateV1,
): boolean {
  return (LEGAL_EXTERNAL_EFFECT_TRANSITIONS[from] as readonly ExternalEffectStateV1[]).includes(to);
}

export function assertLegalExternalEffectTransition(
  from: ExternalEffectStateV1,
  to: ExternalEffectStateV1,
): void {
  if (
    !EFFECT_STATES.has(from) ||
    !EFFECT_STATES.has(to) ||
    !isLegalExternalEffectTransition(from, to)
  ) {
    fail(`illegal effect transition ${from} -> ${to}`);
  }
}

function decodeApproval(row: ApprovalRow): PersistedApproval {
  const approval = assertApprovalSemantics(
    parseJson("approvals", row.approval_id, row.payload_json, (value) =>
      ApprovalV1Schema.parse(value),
    ),
  );
  assertSame("approval id projection", row.approval_id, approval.approvalId);
  assertSame("approval action projection", row.action, approval.action);
  assertSame("approval resource type projection", row.resource_type, approval.resourceType);
  assertSame("approval resource key projection", row.resource_key, approval.resourceKey);
  assertSame(
    "approval subject project projection",
    row.subject_project_id,
    approval.subject.projectId,
  );
  assertSame("approval subject task projection", row.subject_task_id, approval.subject.taskId);
  assertSame(
    "approval subject attempt projection",
    row.subject_attempt_id,
    approval.subject.attemptId,
  );
  assertSame(
    "approval subject release projection",
    row.subject_release_id,
    approval.subject.releaseId,
  );
  assertSame("approval plan digest projection", row.plan_digest, approval.binding.planDigest);
  assertSame("approval diff digest projection", row.diff_digest, approval.binding.diffDigest);
  assertSame("approval commit projection", row.commit_id, approval.binding.commit);
  assertSame(
    "approval build identity projection",
    row.build_identity_digest,
    approval.binding.buildIdentityDigest,
  );
  assertSame("approval policy projection", row.policy_digest, approval.binding.policyDigest);
  assertSame("approval actor projection", row.actor_id, approval.actorId);
  assertSame("approval mode projection", row.mode, approval.mode);
  assertJsonSame(
    "approval standing scope projection",
    row.standing_scope_json === null ? null : JSON.parse(row.standing_scope_json),
    approval.standingScope,
  );
  assertSame("approval issuedAt projection", row.issued_at, approval.issuedAt);
  assertSame("approval expiresAt projection", row.expires_at, approval.expiresAt);
  assertSame("approval status projection", row.status, approval.status);
  assertSame("approval revokedAt projection", row.revoked_at, approval.revokedAt);
  assertSame("approval consumedAt projection", row.consumed_at, approval.consumedAt);
  assertSame(
    "approval consumed effect projection",
    row.consumed_by_effect_id,
    approval.consumedByEffectId,
  );
  const issued = parseApprovalIssuance({
    issuance: parseJson("approval issuance", row.approval_id, row.issuance_json, (value) => {
      if (value === null || typeof value !== "object") {
        fail("stored approval issuance must be an object");
      }
      return value as RegisterApprovalInput["issuance"];
    }),
  });
  assertSame("approval issuer projection", row.issuer_id, issued.issuerId);
  assertSame("approval authenticatedAt projection", row.authenticated_at, issued.authenticatedAt);
  assertSame(
    "approval issuance envelope projection",
    row.issuance_envelope_digest,
    issued.envelopeDigest,
  );
  assertSame(
    "approval issuance attestation projection",
    row.issuance_attestation_digest,
    issued.attestationDigest,
  );
  assertSame("issued approval id", issued.approval.approvalId, approval.approvalId);
  assertSame("issued approval action", issued.approval.action, approval.action);
  assertSame("issued approval resource type", issued.approval.resourceType, approval.resourceType);
  assertSame("issued approval resource key", issued.approval.resourceKey, approval.resourceKey);
  assertJsonSame("issued approval subject", issued.approval.subject, approval.subject);
  assertJsonSame("issued approval binding", issued.approval.binding, approval.binding);
  assertSame("issued approval actor", issued.approval.actorId, approval.actorId);
  assertSame("issued approval mode", issued.approval.mode, approval.mode);
  assertJsonSame(
    "issued approval standing scope",
    issued.approval.standingScope,
    approval.standingScope,
  );
  assertSame("issued approval issuedAt", issued.approval.issuedAt, approval.issuedAt);
  assertSame("issued approval expiresAt", issued.approval.expiresAt, approval.expiresAt);
  return {
    approval,
    payloadDigest: Sha256DigestSchema.parse(row.payload_digest),
    issuance: {
      issuerId: issued.issuerId,
      authenticatedAt: issued.authenticatedAt,
      envelopeDigest: issued.envelopeDigest,
      attestationDigest: issued.attestationDigest,
    },
  };
}

function decodeEffect(row: EffectRow): PersistedEffect {
  const effect = parseJson("external_effects", row.effect_id, row.payload_json, (value) =>
    ExternalEffectV1Schema.parse(value),
  );
  assertSubjectSemantics(effect.subject);
  assertSame("effect id projection", row.effect_id, effect.effectId);
  assertSame("effect attempt projection", row.attempt_id, effect.attemptId);
  assertSame("effect action projection", row.action, effect.action);
  assertSame("effect operation marker projection", row.operation_marker, effect.operationMarker);
  assertSame("effect provider projection", row.provider, effect.target.provider);
  assertSame("effect resource type projection", row.resource_type, effect.target.resourceType);
  assertSame("effect resource key projection", row.resource_key, effect.target.resourceKey);
  assertSame("effect subject project projection", row.subject_project_id, effect.subject.projectId);
  assertSame("effect subject task projection", row.subject_task_id, effect.subject.taskId);
  assertSame("effect subject attempt projection", row.subject_attempt_id, effect.subject.attemptId);
  assertSame("effect subject release projection", row.subject_release_id, effect.subject.releaseId);
  assertSame("effect payload digest projection", row.payload_digest, effect.payloadDigest);
  assertSame("effect policy digest projection", row.policy_digest, effect.policyDigest);
  assertSame("effect approval projection", row.approval_id, effect.approvalId);
  assertSame("effect state projection", row.state, effect.state);
  assertSame("effect revision projection", row.revision, effect.revision);
  assertSame("effect send count projection", row.send_count, effect.sendCount);
  assertSame(
    "effect correlation projection",
    row.provider_correlation_key,
    effect.providerCorrelationKey,
  );
  assertSame("effect createdAt projection", row.created_at, effect.createdAt);
  assertSame("effect updatedAt projection", row.updated_at, effect.updatedAt);
  assertSame("effect lastObservedAt projection", row.last_observed_at, effect.lastObservedAt);
  assertSame("effect nextReconcileAt projection", row.next_reconcile_at, effect.nextReconcileAt);
  assertSame("effect detail digest projection", row.detail_digest, effect.detailDigest);
  const binding: EffectBinding = {
    planDigest: parseNullableDigest(row.plan_digest),
    diffDigest: parseNullableDigest(row.diff_digest),
    commit: parseNullableCommit(row.commit_id),
    buildIdentityDigest: parseNullableDigest(row.build_identity_digest),
  };
  const standingScope =
    row.standing_scope === null ? null : NamespacedCodeSchema.parse(row.standing_scope);
  const intentDigest = Sha256DigestSchema.parse(row.intent_digest);
  assertSame(
    "effect semantic intent digest",
    intentDigest,
    computeExternalEffectIntentDigest(effect, binding),
  );
  return {
    effect,
    binding,
    standingScope,
    intentDigest,
    availableAt: IsoInstantSchema.parse(row.available_at),
  };
}

function decodeResource(row: ResourceRow): ExternalResourceV1 {
  const resource = parseJson("external_resources", row.effect_id, row.payload_json, (value) =>
    ExternalResourceV1Schema.parse(value),
  );
  assertSame("resource effect projection", row.effect_id, resource.effectId);
  assertSame("resource provider projection", row.provider, resource.target.provider);
  assertSame("resource type projection", row.resource_type, resource.target.resourceType);
  assertSame("resource key projection", row.resource_key, resource.target.resourceKey);
  assertSame(
    "provider resource id projection",
    row.provider_resource_id,
    resource.providerResourceId,
  );
  assertSame("provider URL projection", row.provider_url, resource.providerUrl);
  assertSame("provider version projection", row.provider_version, resource.providerVersion);
  assertSame("observed digest projection", row.observed_digest, resource.observedDigest);
  assertSame("resource observedAt projection", row.observed_at, resource.observedAt);
  return resource;
}

function decodeObservation(row: ObservationRow): ObservationAttestationEnvelope {
  const envelope = parseJson(
    "effect_observations",
    row.invocation_id,
    row.payload_json,
    (value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail("stored observation envelope must be an object");
      }
      const record = value as Readonly<Record<string, unknown>>;
      const parsed = {
        observation: ExternalObservationV1Schema.parse(record.observation),
        effect: ExternalEffectV1Schema.parse(record.effect),
        resource: ExternalResourceV1Schema.parse(record.resource),
        ownerId: parseOwnerId(record.ownerId),
        fence: parseNonNegativeInteger(record.fence, "observation fence"),
        envelopeDigest: Sha256DigestSchema.parse(record.envelopeDigest),
      };
      assertSame(
        "observation canonical envelope digest",
        parsed.envelopeDigest,
        computeObservationAttestationEnvelopeDigest(parsed),
      );
      return parsed;
    },
  );
  const { observation } = envelope;
  assertSame("observation invocation projection", row.invocation_id, observation.invocationId);
  assertSame("observation effect projection", row.effect_id, envelope.effect.effectId);
  assertSame("observation source projection", row.source, observation.source);
  assertSame("observation adapter projection", row.adapter_id, observation.adapterId);
  assertSame(
    "observation adapter version projection",
    row.adapter_version,
    observation.adapterVersion,
  );
  assertSame("observation evidence projection", row.evidence_digest, observation.evidenceDigest);
  assertSame(
    "observation attestation projection",
    row.attestation_digest,
    observation.attestationDigest,
  );
  assertSame("observation envelope projection", row.envelope_digest, envelope.envelopeDigest);
  assertSame(
    "observation resource digest projection",
    row.resource_observed_digest,
    envelope.resource.observedDigest,
  );
  assertSame("observation time projection", row.observed_at, observation.observedAt);
  assertSame("observation owner projection", row.owner_id, envelope.ownerId);
  assertSame("observation fence projection", row.fence, envelope.fence);
  return envelope;
}

function readApproval(database: Database.Database, approvalId: string): PersistedApproval | null {
  const row = database.prepare("SELECT * FROM approvals WHERE approval_id = ?").get(approvalId) as
    ApprovalRow | undefined;
  return row === undefined ? null : decodeApproval(row);
}

function readEffect(database: Database.Database, effectId: string): PersistedEffect | null {
  const row = database
    .prepare("SELECT * FROM external_effects WHERE effect_id = ?")
    .get(effectId) as EffectRow | undefined;
  return row === undefined ? null : decodeEffect(row);
}

function readEffectByMarker(database: Database.Database, marker: string): PersistedEffect | null {
  const row = database
    .prepare("SELECT * FROM external_effects WHERE operation_marker = ?")
    .get(marker) as EffectRow | undefined;
  return row === undefined ? null : decodeEffect(row);
}

function readEffectByIntent(
  database: Database.Database,
  intentDigest: string,
): PersistedEffect | null {
  const row = database
    .prepare("SELECT * FROM external_effects WHERE intent_digest = ?")
    .get(intentDigest) as EffectRow | undefined;
  return row === undefined ? null : decodeEffect(row);
}

function readOriginCheckpoint(
  database: Database.Database,
  checkpointId: string,
): OriginCheckpointRow | null {
  const row = database
    .prepare("SELECT * FROM effect_origin_checkpoints WHERE checkpoint_id = ?")
    .get(checkpointId) as OriginCheckpointRow | undefined;
  return row ?? null;
}

function assertOriginCheckpointReplay(
  row: OriginCheckpointRow,
  input: Readonly<{
    persisted: PersistedEffect;
    approvalId: string;
    standingScope: NamespacedCode | null;
    origin: ParsedPlanningOrigin;
    occurredAt: IsoInstant;
    intentDigest: Sha256Digest;
  }>,
): void {
  assertSame("replayed checkpoint effect", row.effect_id, input.persisted.effect.effectId);
  assertSame("replayed checkpoint approval", row.approval_id, input.approvalId);
  assertSame("replayed checkpoint standing scope", row.standing_scope, input.standingScope);
  assertSame("replayed checkpoint attempt", row.attempt_id, input.persisted.effect.attemptId);
  assertSame("replayed checkpoint step", row.step_id, input.origin.stepId);
  assertSame(
    "replayed checkpoint attempt revision",
    row.attempt_revision,
    input.origin.expectedAttemptRevision,
  );
  assertSame(
    "replayed checkpoint step revision",
    row.step_revision,
    input.origin.expectedStepRevision,
  );
  assertSame(
    "replayed checkpoint revision",
    row.checkpoint_revision,
    input.origin.expectedCheckpointRevision + 1,
  );
  assertSame("replayed checkpoint owner", row.owner_id, input.origin.ownerId);
  assertSame("replayed checkpoint fence", row.fence, input.origin.fence);
  assertSame("replayed checkpoint time", row.occurred_at, input.occurredAt);
  assertSame("replayed checkpoint intent", row.intent_digest, input.intentDigest);
}

function readOutbox(database: Database.Database, effectId: string): OutboxRow {
  const row = database.prepare("SELECT * FROM effect_outbox WHERE effect_id = ?").get(effectId) as
    OutboxRow | undefined;
  if (row === undefined) fail(`outbox does not exist for effect ${effectId}`);
  return row;
}

function readAttemptTaskContext(
  database: Database.Database,
  attemptId: string,
): AttemptTaskRow & Readonly<{ taskSpec: TaskSpecV1 }> {
  const row = database
    .prepare(
      `SELECT
         a.attempt_id, a.task_id, a.task_spec_digest,
         a.revision AS attempt_revision, a.fence, a.state, a.desired_state,
         a.current_step_id, t.project_id, t.payload_json AS task_payload_json
       FROM attempts a
       JOIN task_snapshots t ON t.task_id = a.task_id
       WHERE a.attempt_id = ?`,
    )
    .get(attemptId) as AttemptTaskRow | undefined;
  if (row === undefined) fail(`attempt or TaskSpec does not exist: ${attemptId}`);
  const taskSpec = parseJson("task_snapshots", row.task_id, row.task_payload_json, (value) =>
    TaskSpecV1Schema.parse(value),
  );
  assertSame("TaskSpec task id projection", row.task_id, taskSpec.taskId);
  assertSame("TaskSpec project projection", row.project_id, taskSpec.projectId);
  assertSame("attempt TaskSpec digest", row.task_spec_digest, computeTaskSpecDigest(taskSpec));
  return { ...row, taskSpec };
}

function assertSubjectMatchesAttempt(
  database: Database.Database,
  attemptId: string,
  subject: ApprovalV1["subject"],
): AttemptTaskRow & Readonly<{ taskSpec: TaskSpecV1 }> {
  if (subject.attemptId === null || subject.taskId === null || subject.projectId === null) {
    fail("external-effect approval subject must identify attempt, task, and project");
  }
  assertSame("effect subject attempt", subject.attemptId, attemptId);
  const context = readAttemptTaskContext(database, attemptId);
  assertSame("effect subject task", subject.taskId, context.task_id);
  assertSame("effect subject project", subject.projectId, context.project_id);
  return context;
}

function assertPolicyMatchesTaskSpec(
  context: AttemptTaskRow & Readonly<{ taskSpec: TaskSpecV1 }>,
  policyDigest: Sha256Digest,
): void {
  assertSame("active TaskSpec policy digest", policyDigest, context.taskSpec.policyDigest);
}

function assertAttemptAllowsNewSend(context: AttemptTaskRow): void {
  if (context.state !== "running" || context.desired_state !== "running") {
    fail(
      `attempt ${context.attempt_id} cannot dispatch while state=${context.state} desiredState=${context.desired_state}`,
    );
  }
}

function assertEffectAllowsNewSend(
  database: Database.Database,
  effect: ExternalEffectV1,
): void {
  if (effect.attemptId === null) {
    if (!isReleaseScopedApprovalSubjectV1(effect.subject)) {
      fail("release-scoped effect subject must identify project and release only");
    }
    return;
  }
  const attempt = assertSubjectMatchesAttempt(database, effect.attemptId, effect.subject);
  assertAttemptAllowsNewSend(attempt);
}

function parsePlanningOrigin(input: PlanExternalEffectInput["origin"]): ParsedPlanningOrigin {
  return {
    checkpointId: EventIdSchema.parse(input.checkpointId),
    leaseKey: input.leaseKey,
    ownerId: parseOwnerId(input.ownerId),
    fence: parseNonNegativeInteger(input.fence, "origin fence"),
    stepId: StepIdSchema.parse(input.stepId),
    expectedAttemptRevision: parseNonNegativeInteger(
      input.expectedAttemptRevision,
      "expectedAttemptRevision",
    ),
    expectedStepRevision: parseNonNegativeInteger(
      input.expectedStepRevision,
      "expectedStepRevision",
    ),
    expectedCheckpointRevision: parseNonNegativeInteger(
      input.expectedCheckpointRevision,
      "expectedCheckpointRevision",
    ),
  };
}

function assertPlanningOrigin(
  database: Database.Database,
  effect: ExternalEffectV1,
  origin: ParsedPlanningOrigin,
  observedAt: IsoInstant,
): void {
  if (effect.attemptId === null) {
    fail("attempt-scoped planning origin cannot be used for a release-scoped effect");
  }
  const attempt = assertSubjectMatchesAttempt(database, effect.attemptId, effect.subject);
  assertPolicyMatchesTaskSpec(attempt, effect.policyDigest);
  assertAttemptAllowsNewSend(attempt);
  assertSame("planning attempt revision", attempt.attempt_revision, origin.expectedAttemptRevision);
  assertSame("planning attempt fence", attempt.fence, origin.fence);
  assertSame("planning current step", attempt.current_step_id, origin.stepId);
  assertActiveAttemptLease(database, {
    leaseKey: origin.leaseKey,
    attemptId: effect.attemptId,
    ownerId: origin.ownerId,
    fence: origin.fence,
    observedAt,
  });
  const step = database.prepare("SELECT * FROM steps WHERE step_id = ?").get(origin.stepId) as
    OriginStepRow | undefined;
  if (step === undefined) fail(`originating step does not exist: ${origin.stepId}`);
  assertSame("originating step attempt", step.attempt_id, effect.attemptId);
  assertSame("originating step state", step.state, "running");
  assertSame("originating step revision", step.revision, origin.expectedStepRevision);
  assertSame("originating step fence", step.last_fence, origin.fence);
  assertSame(
    "originating checkpoint revision",
    step.effect_checkpoint_revision,
    origin.expectedCheckpointRevision,
  );
}

function advancePlanningCheckpoint(
  database: Database.Database,
  effect: ExternalEffectV1,
  approvalId: string,
  standingScope: NamespacedCode | null,
  origin: ParsedPlanningOrigin,
  occurredAt: IsoInstant,
  intentDigest: Sha256Digest,
): void {
  const result = database
    .prepare(
      `UPDATE steps
       SET effect_checkpoint_revision = effect_checkpoint_revision + 1
       WHERE step_id = ? AND attempt_id = ? AND state = 'running'
         AND revision = ? AND last_fence = ? AND effect_checkpoint_revision = ?
         AND EXISTS (
           SELECT 1 FROM attempts a
           WHERE a.attempt_id = steps.attempt_id
             AND a.revision = ? AND a.fence = ?
             AND a.state = 'running' AND a.desired_state = 'running'
             AND a.current_step_id = steps.step_id
         )`,
    )
    .run(
      origin.stepId,
      effect.attemptId,
      origin.expectedStepRevision,
      origin.fence,
      origin.expectedCheckpointRevision,
      origin.expectedAttemptRevision,
      origin.fence,
    );
  if (result.changes !== 1) fail(`origin workflow checkpoint conflict: ${origin.stepId}`);
  database
    .prepare(
      `INSERT INTO effect_origin_checkpoints(
         checkpoint_id, event_type, effect_id, approval_id, standing_scope,
         attempt_id, step_id, attempt_revision,
         step_revision, checkpoint_revision, owner_id, fence, occurred_at, intent_digest
       ) VALUES (?, 'external-effect.planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      origin.checkpointId,
      effect.effectId,
      approvalId,
      standingScope,
      effect.attemptId,
      origin.stepId,
      origin.expectedAttemptRevision,
      origin.expectedStepRevision,
      origin.expectedCheckpointRevision + 1,
      origin.ownerId,
      origin.fence,
      occurredAt,
      intentDigest,
    );
}

function mutableEffect(
  effect: ExternalEffectV1,
  patch: Partial<ExternalEffectV1>,
): ExternalEffectV1 {
  return ExternalEffectV1Schema.parse({ ...effect, ...patch });
}

function replacePersistedEffect(
  persisted: PersistedEffect,
  effect: ExternalEffectV1,
): PersistedEffect {
  return { ...persisted, effect };
}

function updateEffect(
  database: Database.Database,
  effect: ExternalEffectV1,
  expectedRevision: number,
): void {
  const result = database
    .prepare(
      `UPDATE external_effects SET
         state = ?, revision = ?, send_count = ?, provider_correlation_key = ?, updated_at = ?,
         last_observed_at = ?, next_reconcile_at = ?, detail_digest = ?, payload_json = ?
       WHERE effect_id = ? AND revision = ?`,
    )
    .run(
      effect.state,
      effect.revision,
      effect.sendCount,
      effect.providerCorrelationKey,
      effect.updatedAt,
      effect.lastObservedAt,
      effect.nextReconcileAt,
      effect.detailDigest,
      JSON.stringify(effect),
      effect.effectId,
      expectedRevision,
    );
  if (result.changes !== 1) fail(`effect revision conflict: ${effect.effectId}`);
}

function updateEffectWithoutStateTransition(
  database: Database.Database,
  effect: ExternalEffectV1,
  expectedRevision: number,
): void {
  const result = database
    .prepare(
      `UPDATE external_effects SET
         revision = ?, provider_correlation_key = ?, updated_at = ?,
         last_observed_at = ?, next_reconcile_at = ?, detail_digest = ?, payload_json = ?
       WHERE effect_id = ? AND revision = ? AND state = ? AND send_count = ?`,
    )
    .run(
      effect.revision,
      effect.providerCorrelationKey,
      effect.updatedAt,
      effect.lastObservedAt,
      effect.nextReconcileAt,
      effect.detailDigest,
      JSON.stringify(effect),
      effect.effectId,
      expectedRevision,
      effect.state,
      effect.sendCount,
    );
  if (result.changes !== 1) fail(`effect metadata revision conflict: ${effect.effectId}`);
}

function insertTransition(
  database: Database.Database,
  effectId: string,
  from: ExternalEffectStateV1 | null,
  to: ExternalEffectStateV1,
  occurredAt: string,
  ownerId: string | null,
  fence: number,
  detailDigest: string | null,
): void {
  if (from !== null) assertLegalExternalEffectTransition(from, to);
  const row = database
    .prepare("SELECT MAX(sequence) AS sequence FROM effect_transitions WHERE effect_id = ?")
    .get(effectId) as Readonly<{ sequence: number | null }>;
  database
    .prepare(
      `INSERT INTO effect_transitions(
         effect_id, sequence, from_state, to_state, occurred_at, owner_id, fence, detail_digest
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(effectId, (row.sequence ?? 0) + 1, from, to, occurredAt, ownerId, fence, detailDigest);
}

function releaseClaim(
  database: Database.Database,
  effectId: string,
  ownerId: string,
  fence: number,
  expectedRevision: number,
): void {
  const result = database
    .prepare(
      `UPDATE effect_outbox
       SET locked_by = NULL, locked_until = NULL, revision = revision + 1
       WHERE effect_id = ? AND locked_by = ? AND fence = ? AND revision = ?`,
    )
    .run(effectId, ownerId, fence, expectedRevision);
  if (result.changes !== 1) claimLost(`outbox claim changed while completing effect ${effectId}`);
}

function assertActiveClaim(
  database: Database.Database,
  input: ClaimedEffectMutationInput,
): {
  effectId: string;
  ownerId: string;
  fence: number;
  expectedOutboxRevision: number;
  expectedEffectRevision: number;
  observedAt: IsoInstant;
  outbox: OutboxRow;
  persisted: PersistedEffect;
} {
  const effectId = EffectIdSchema.parse(input.effectId);
  const ownerId = parseOwnerId(input.ownerId);
  const fence = parseNonNegativeInteger(input.fence, "fence");
  const expectedOutboxRevision = parseNonNegativeInteger(
    input.expectedOutboxRevision,
    "expectedOutboxRevision",
  );
  const expectedEffectRevision = parseNonNegativeInteger(
    input.expectedEffectRevision,
    "expectedEffectRevision",
  );
  const observedAt = IsoInstantSchema.parse(input.observedAt);
  const outbox = readOutbox(database, effectId);
  if (outbox.locked_by !== ownerId) {
    claimLost(
      `outbox owner must be ${JSON.stringify(ownerId)}; received ${JSON.stringify(outbox.locked_by)}`,
    );
  }
  if (outbox.fence !== fence) {
    claimLost(
      `outbox fence must be ${JSON.stringify(fence)}; received ${JSON.stringify(outbox.fence)}`,
    );
  }
  if (outbox.revision !== expectedOutboxRevision) {
    claimLost(
      `outbox revision must be ${JSON.stringify(expectedOutboxRevision)}; received ${JSON.stringify(outbox.revision)}`,
    );
  }
  if (outbox.locked_until === null || outbox.locked_until <= observedAt) {
    claimLost(`outbox claim is expired for effect ${effectId}`);
  }
  const persisted = readEffect(database, effectId);
  if (persisted === null) fail(`effect does not exist: ${effectId}`);
  if (persisted.effect.revision !== expectedEffectRevision) {
    claimLost(
      `effect revision must be ${JSON.stringify(expectedEffectRevision)}; received ${JSON.stringify(persisted.effect.revision)}`,
    );
  }
  return {
    effectId,
    ownerId,
    fence,
    expectedOutboxRevision,
    expectedEffectRevision,
    observedAt,
    outbox,
    persisted,
  };
}

function assertEffectIdentityMatches(
  existing: PersistedEffect,
  requested: ExternalEffectV1,
  binding: EffectBinding,
  standingScope: NamespacedCode | null,
  availableAt: IsoInstant,
  intentDigest: Sha256Digest,
): void {
  const left = {
    schemaVersion: existing.effect.schemaVersion,
    effectId: existing.effect.effectId,
    attemptId: existing.effect.attemptId,
    action: existing.effect.action,
    operationMarker: existing.effect.operationMarker,
    target: existing.effect.target,
    subject: existing.effect.subject,
    payloadDigest: existing.effect.payloadDigest,
    policyDigest: existing.effect.policyDigest,
    approvalId: existing.effect.approvalId,
    createdAt: existing.effect.createdAt,
    binding: existing.binding,
    standingScope: existing.standingScope,
    availableAt: existing.availableAt,
    intentDigest: existing.intentDigest,
  };
  const right = {
    schemaVersion: requested.schemaVersion,
    effectId: requested.effectId,
    attemptId: requested.attemptId,
    action: requested.action,
    operationMarker: requested.operationMarker,
    target: requested.target,
    subject: requested.subject,
    payloadDigest: requested.payloadDigest,
    policyDigest: requested.policyDigest,
    approvalId: requested.approvalId,
    createdAt: requested.createdAt,
    binding,
    standingScope,
    availableAt,
    intentDigest,
  };
  assertJsonSame("duplicate effect immutable identity", left, right);
}

function assertSemanticReplayMatches(
  existing: PersistedEffect,
  requested: ExternalEffectV1,
  binding: EffectBinding,
  intentDigest: Sha256Digest,
): void {
  assertSame("semantic intent digest", existing.intentDigest, intentDigest);
  assertJsonSame(
    "semantic effect replay",
    externalEffectIntentValue(existing.effect, existing.binding),
    externalEffectIntentValue(requested, binding),
  );
}

function assertApprovalIntentMatches(
  persisted: PersistedApproval,
  effect: ExternalEffectV1,
  binding: EffectBinding,
  standingScope: NamespacedCode | null,
): void {
  const { approval, payloadDigest } = persisted;
  assertSame("approval action", approval.action, effect.action);
  assertSame("approval resource type", approval.resourceType, effect.target.resourceType);
  assertSame("approval resource key", approval.resourceKey, effect.target.resourceKey);
  assertJsonSame("approval subject", approval.subject, effect.subject);
  assertSame("approval payload digest", payloadDigest, effect.payloadDigest);
  assertSame("approval policy digest", approval.binding.policyDigest, effect.policyDigest);
  assertSame("approval plan digest", approval.binding.planDigest, binding.planDigest);
  assertSame("approval diff digest", approval.binding.diffDigest, binding.diffDigest);
  assertSame("approval commit", approval.binding.commit, binding.commit);
  assertSame(
    "approval build identity digest",
    approval.binding.buildIdentityDigest,
    binding.buildIdentityDigest,
  );

  if (approval.mode === "single-use") {
    if (standingScope !== null) fail("single-use approval cannot authorize a standing scope");
  } else {
    if (standingScope === null || !approval.standingScope?.includes(standingScope)) {
      fail(`standing approval does not include requested scope: ${String(standingScope)}`);
    }
  }
}

function assertApprovalMatchesPlanning(
  persisted: PersistedApproval,
  effect: ExternalEffectV1,
  binding: EffectBinding,
  authorizedAt: IsoInstant,
  standingScope: NamespacedCode | null,
): void {
  if (persisted.approval.status !== "active") {
    fail(`approval is not active: ${persisted.approval.approvalId}`);
  }
  if (authorizedAt < persisted.approval.issuedAt || authorizedAt >= persisted.approval.expiresAt) {
    fail(`approval is outside its validity interval: ${persisted.approval.approvalId}`);
  }
  assertApprovalIntentMatches(persisted, effect, binding, standingScope);
}

function assertApprovalMatchesDispatch(
  persisted: PersistedApproval,
  planned: PersistedEffect,
  observedAt: IsoInstant,
): void {
  const { approval } = persisted;
  if (observedAt < approval.issuedAt || observedAt >= approval.expiresAt) {
    claimLost(`approval expired before dispatch: ${approval.approvalId}`);
  }
  if (approval.mode === "single-use") {
    if (approval.status !== "consumed" || approval.consumedByEffectId !== planned.effect.effectId) {
      claimLost(`single-use approval is not consumed by this effect: ${approval.approvalId}`);
    }
  } else if (approval.status !== "active") {
    claimLost(`standing approval is not active at dispatch: ${approval.approvalId}`);
  }
  assertApprovalIntentMatches(persisted, planned.effect, planned.binding, planned.standingScope);
}

function consumeSingleUseApproval(
  database: Database.Database,
  persisted: PersistedApproval,
  effectId: string,
  consumedAt: IsoInstant,
): void {
  if (persisted.approval.mode !== "single-use") return;
  const consumed = assertApprovalSemantics({
    ...persisted.approval,
    status: "consumed",
    consumedAt,
    consumedByEffectId: effectId,
  });
  const result = database
    .prepare(
      `UPDATE approvals
       SET status = 'consumed', consumed_at = ?, consumed_by_effect_id = ?, payload_json = ?
       WHERE approval_id = ? AND status = 'active'`,
    )
    .run(consumedAt, effectId, JSON.stringify(consumed), persisted.approval.approvalId);
  if (result.changes !== 1) {
    fail(`approval consumption conflict: ${persisted.approval.approvalId}`);
  }
}

function readLatestResource(
  database: Database.Database,
  effectId: string,
): ExternalResourceV1 | null {
  const row = database
    .prepare(
      `SELECT * FROM external_resources
       WHERE effect_id = ? ORDER BY observation_sequence DESC LIMIT 1`,
    )
    .get(effectId) as ResourceRow | undefined;
  return row === undefined ? null : decodeResource(row);
}

function readLatestObservation(
  database: Database.Database,
  effectId: string,
): Readonly<{ observation: ExternalObservationV1; resourceObservedDigest: Sha256Digest }> | null {
  const row = database
    .prepare(
      `SELECT * FROM effect_observations
       WHERE effect_id = ? ORDER BY observation_sequence DESC LIMIT 1`,
    )
    .get(effectId) as ObservationRow | undefined;
  return row === undefined
    ? null
    : {
        observation: decodeObservation(row).observation,
        resourceObservedDigest: Sha256DigestSchema.parse(row.resource_observed_digest),
      };
}

function insertAttestedObservation(
  database: Database.Database,
  options: EffectRepositoryOptions,
  input: Readonly<{
    effect: ExternalEffectV1;
    resource: ExternalResourceV1;
    observationValue: unknown;
    expectedSource: ExternalObservationV1["source"];
    ownerId: string;
    fence: number;
    observedAt: IsoInstant;
  }>,
): ExternalObservationV1 {
  const observation = ExternalObservationV1Schema.parse(input.observationValue);
  assertSame("observation source", observation.source, input.expectedSource);
  assertSame("observation time", observation.observedAt, input.observedAt);
  if (!observation.adapterId.startsWith(`${input.effect.target.provider}.`)) {
    fail("observation adapter does not match effect provider");
  }
  const artifact = database
    .prepare("SELECT digest FROM artifacts WHERE digest = ?")
    .get(observation.evidenceDigest) as Readonly<{ digest: string }> | undefined;
  if (artifact === undefined) {
    fail(`observation evidence artifact does not exist: ${observation.evidenceDigest}`);
  }
  const envelopeDigest = computeObservationAttestationEnvelopeDigest({
    observation,
    effect: input.effect,
    resource: input.resource,
    ownerId: input.ownerId,
    fence: input.fence,
  });
  if (options.verifyObservationAttestation === undefined) {
    fail("trusted observation attestation verifier is not configured");
  }
  const envelope: ObservationAttestationEnvelope = {
    observation,
    effect: input.effect,
    resource: input.resource,
    ownerId: input.ownerId,
    fence: input.fence,
    envelopeDigest,
  };
  if (!options.verifyObservationAttestation(envelope)) {
    fail("provider observation attestation was rejected");
  }

  const sequenceRow = database
    .prepare(
      "SELECT MAX(observation_sequence) AS sequence FROM effect_observations WHERE effect_id = ?",
    )
    .get(input.resource.effectId) as Readonly<{ sequence: number | null }>;
  const sequence = (sequenceRow.sequence ?? 0) + 1;
  database
    .prepare(
      `INSERT INTO effect_observations(
         invocation_id, effect_id, observation_sequence, source, adapter_id, adapter_version,
         evidence_digest, attestation_digest, envelope_digest, resource_observed_digest,
         observed_at, owner_id, fence, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      observation.invocationId,
      input.resource.effectId,
      sequence,
      observation.source,
      observation.adapterId,
      observation.adapterVersion,
      observation.evidenceDigest,
      observation.attestationDigest,
      envelopeDigest,
      input.resource.observedDigest,
      observation.observedAt,
      input.ownerId,
      input.fence,
      JSON.stringify(envelope),
    );
  database
    .prepare(
      `INSERT INTO external_resources(
         effect_id, observation_sequence, schema_version, provider, resource_type, resource_key,
         provider_resource_id, provider_url, provider_version, observed_digest,
         observed_at, observation_invocation_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.resource.effectId,
      sequence,
      input.resource.schemaVersion,
      input.resource.target.provider,
      input.resource.target.resourceType,
      input.resource.target.resourceKey,
      input.resource.providerResourceId,
      input.resource.providerUrl,
      input.resource.providerVersion,
      input.resource.observedDigest,
      input.resource.observedAt,
      observation.invocationId,
      JSON.stringify(input.resource),
    );
  return observation;
}

function parseObservedResource(
  value: unknown,
  effect: ExternalEffectV1,
  observedAt: IsoInstant,
): ExternalResourceV1 {
  const resource = ExternalResourceV1Schema.parse(value);
  assertSame("observed resource effect", resource.effectId, effect.effectId);
  assertJsonSame("observed resource target", resource.target, effect.target);
  assertSame("observed resource time", resource.observedAt, observedAt);
  return resource;
}

function claim(
  database: Database.Database,
  input: ClaimEffectInput,
  purpose: "send" | "reconcile",
): EffectOutboxClaim | null {
  const ownerId = parseOwnerId(input.ownerId);
  const observedAt = IsoInstantSchema.parse(input.observedAt);
  const lockedUntil = IsoInstantSchema.parse(input.lockedUntil);
  assertBoundedOutboxLease(observedAt, lockedUntil);

  const transaction = database.transaction(() => {
    const eligibility =
      purpose === "send"
        ? `e.state = 'planned'
           AND o.available_at <= @observedAt
           AND a.issued_at <= @observedAt
           AND a.expires_at > @observedAt
           AND (
             (a.mode = 'single-use' AND a.status = 'consumed' AND a.consumed_by_effect_id = e.effect_id)
             OR (a.mode = 'standing' AND a.status = 'active')
           )`
        : `(
             e.state = 'sent'
             OR (e.state IN ('unknown', 'observed') AND e.next_reconcile_at <= @observedAt)
           )`;
    // Terminal or paused attempts may never start a new mutation. Read-only
    // reconciliation deliberately remains eligible after termination because
    // an already-sent provider request still has to be classified truthfully.
    // Release-scoped Apple upload effects have no attempt row; they claim via
    // release subject columns alone (migration 0021).
    const row = database
      .prepare(
        `SELECT o.effect_id AS effectId, o.revision AS revision
         FROM effect_outbox o
         JOIN external_effects e ON e.effect_id = o.effect_id
         JOIN approvals a ON a.approval_id = e.approval_id
         LEFT JOIN attempts attempt ON attempt.attempt_id = e.attempt_id
         WHERE ${eligibility}
           AND (
             (
               e.attempt_id IS NOT NULL
               AND attempt.attempt_id IS NOT NULL
               AND (
                 @purpose = 'reconcile'
                 OR (attempt.state = 'running' AND attempt.desired_state = 'running')
               )
             )
             OR (
               e.attempt_id IS NULL
               AND e.subject_release_id IS NOT NULL
               AND e.subject_task_id IS NULL
               AND e.subject_attempt_id IS NULL
             )
           )
           AND (o.locked_by IS NULL OR o.locked_until <= @observedAt)
         ORDER BY
           CASE WHEN e.state IN ('unknown', 'observed') THEN e.next_reconcile_at ELSE e.updated_at END,
           o.effect_id
         LIMIT 1`,
      )
      .get({ observedAt, purpose }) as Readonly<{ effectId: string; revision: number }> | undefined;
    if (row === undefined) return null;

    const result = database
      .prepare(
        `UPDATE effect_outbox
         SET locked_by = ?, locked_until = ?, fence = fence + 1, revision = revision + 1
         WHERE effect_id = ? AND revision = ?
           AND (locked_by IS NULL OR locked_until <= ?)`,
      )
      .run(ownerId, lockedUntil, row.effectId, row.revision, observedAt);
    if (result.changes !== 1) fail(`outbox claim conflict: ${row.effectId}`);

    const outbox = readOutbox(database, row.effectId);
    const persisted = readEffect(database, row.effectId);
    if (persisted === null) fail(`effect disappeared while claiming: ${row.effectId}`);
    return {
      effect: persisted.effect,
      availableAt: IsoInstantSchema.parse(outbox.available_at),
      lockedBy: ownerId,
      lockedUntil,
      fence: outbox.fence,
      revision: outbox.revision,
    };
  });
  return transaction.immediate();
}

export function createEffectRepository(
  database: Database.Database,
  options: EffectRepositoryOptions = {},
): EffectRepository {
  return {
    registerApproval(input) {
      const issuance = parseApprovalIssuance(input);
      const { approval, payloadDigest } = issuance;
      if (approval.status !== "active") fail("new approvals must be active");
      if (options.verifyApprovalIssuance === undefined) {
        fail("trusted approval issuance verifier is not configured");
      }
      if (!options.verifyApprovalIssuance(issuance)) {
        fail("approval issuance attestation was rejected");
      }

      const transaction = database.transaction((): RegisterApprovalResult => {
        const existing = readApproval(database, approval.approvalId);
        if (existing !== null) {
          const row = database
            .prepare("SELECT issuance_json FROM approvals WHERE approval_id = ?")
            .get(approval.approvalId) as Readonly<{ issuance_json: string }>;
          assertJsonSame(
            "approval issuance replay",
            parseJson(
              "approval issuance",
              approval.approvalId,
              row.issuance_json,
              (value) => value,
            ),
            issuance,
          );
          return { ...existing, duplicate: true };
        }
        // Release Rail architecture decision 7: which subject shape is required is a property of
        // the *action*, not a free choice at registration time. Every action registered before
        // Wave 2 is `subjectScope: "attempt"` and takes this branch completely unchanged --
        // `assertSubjectMatchesAttempt`/`assertPolicyMatchesTaskSpec`, in the same order, with the
        // same failure modes. Only `apple.upload-build` (`subjectScope: "release"`) takes the new
        // branch, which has no attempt/TaskSpec to check a policy digest against -- there is no
        // attempt at all for a release-scoped approval -- so it checks only that the subject has
        // the release-scoped shape `isReleaseScopedApprovalSubjectV1` (contracts) defines: project
        // + release, no task, no attempt. A release-scoped subject submitted for an attempt-scoped
        // action is still refused by the unchanged branch below (it requires a non-null attemptId);
        // an attempt-scoped subject submitted for a release-scoped action is refused here.
        if (requireActionPolicy(approval.action).subjectScope === "release") {
          if (!isReleaseScopedApprovalSubjectV1(approval.subject)) {
            fail(
              `${approval.action} approval subject must be release-scoped (project + release, no task or attempt)`,
            );
          }
        } else {
          const attempt = assertSubjectMatchesAttempt(
            database,
            approval.subject.attemptId ?? "",
            approval.subject,
          );
          assertPolicyMatchesTaskSpec(attempt, approval.binding.policyDigest);
        }
        database
          .prepare(
            `INSERT INTO approvals(
               approval_id, schema_version, action, resource_type, resource_key,
               subject_project_id, subject_task_id, subject_attempt_id, subject_release_id,
               payload_digest, plan_digest, diff_digest, commit_id, build_identity_digest,
               policy_digest, actor_id, issuer_id, authenticated_at, issuance_envelope_digest,
               issuance_attestation_digest, issuance_json, mode, standing_scope_json, issued_at, expires_at,
               status, revoked_at, consumed_at, consumed_by_effect_id, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            approval.approvalId,
            approval.schemaVersion,
            approval.action,
            approval.resourceType,
            approval.resourceKey,
            approval.subject.projectId,
            approval.subject.taskId,
            approval.subject.attemptId,
            approval.subject.releaseId,
            payloadDigest,
            approval.binding.planDigest,
            approval.binding.diffDigest,
            approval.binding.commit,
            approval.binding.buildIdentityDigest,
            approval.binding.policyDigest,
            approval.actorId,
            issuance.issuerId,
            issuance.authenticatedAt,
            issuance.envelopeDigest,
            issuance.attestationDigest,
            JSON.stringify(issuance),
            approval.mode,
            approval.standingScope === null ? null : JSON.stringify(approval.standingScope),
            approval.issuedAt,
            approval.expiresAt,
            approval.status,
            approval.revokedAt,
            approval.consumedAt,
            approval.consumedByEffectId,
            JSON.stringify(approval),
          );
        return {
          approval,
          payloadDigest,
          issuance: {
            issuerId: issuance.issuerId,
            authenticatedAt: issuance.authenticatedAt,
            envelopeDigest: issuance.envelopeDigest,
            attestationDigest: issuance.attestationDigest,
          },
          duplicate: false,
        };
      });
      return transaction.immediate();
    },

    getApproval(approvalId) {
      return readApproval(database, ApprovalIdSchema.parse(approvalId));
    },

    revokeApproval(approvalIdValue, revokedAtValue) {
      const approvalId = ApprovalIdSchema.parse(approvalIdValue);
      const revokedAt = IsoInstantSchema.parse(revokedAtValue);
      const transaction = database.transaction(() => {
        const persisted = readApproval(database, approvalId);
        if (persisted === null) fail(`approval does not exist: ${approvalId}`);
        if (persisted.approval.status === "revoked") return persisted;
        if (persisted.approval.status !== "active") {
          fail(`only an active approval can be revoked: ${approvalId}`);
        }
        if (revokedAt < persisted.approval.issuedAt)
          fail("approval cannot be revoked before issue");
        if (revokedAt >= persisted.approval.expiresAt)
          fail("approval cannot be revoked after expiry");
        const approval = assertApprovalSemantics({
          ...persisted.approval,
          status: "revoked",
          revokedAt,
        });
        database
          .prepare(
            `UPDATE approvals SET status = 'revoked', revoked_at = ?, payload_json = ?
             WHERE approval_id = ? AND status = 'active'`,
          )
          .run(revokedAt, JSON.stringify(approval), approvalId);
        return { approval, payloadDigest: persisted.payloadDigest, issuance: persisted.issuance };
      });
      return transaction.immediate();
    },

    expireApproval(approvalIdValue, observedAtValue) {
      const approvalId = ApprovalIdSchema.parse(approvalIdValue);
      const observedAt = IsoInstantSchema.parse(observedAtValue);
      const transaction = database.transaction(() => {
        const persisted = readApproval(database, approvalId);
        if (persisted === null) fail(`approval does not exist: ${approvalId}`);
        if (persisted.approval.status === "expired") return persisted;
        if (persisted.approval.status !== "active") {
          fail(`only an active approval can expire: ${approvalId}`);
        }
        if (observedAt < persisted.approval.expiresAt) fail("approval has not expired");
        const approval = assertApprovalSemantics({ ...persisted.approval, status: "expired" });
        database
          .prepare(
            `UPDATE approvals SET status = 'expired', payload_json = ?
             WHERE approval_id = ? AND status = 'active'`,
          )
          .run(JSON.stringify(approval), approvalId);
        return { approval, payloadDigest: persisted.payloadDigest, issuance: persisted.issuance };
      });
      return transaction.immediate();
    },

    planExternalEffect(input) {
      const effect = ExternalEffectV1Schema.parse(input.effect);
      assertSubjectSemantics(effect.subject);
      if (
        requireActionPolicy(effect.action).provider !== effect.target.provider ||
        !effect.target.resourceType.startsWith(`${effect.target.provider}.`) ||
        !effect.operationMarker.startsWith(`app-factory:v1:${effect.target.provider}:`)
      ) {
        fail("effect provider must be bound by its action, resource type, and operation marker");
      }
      if (
        effect.approvalId === null ||
        effect.state !== "planned" ||
        effect.revision !== 0 ||
        effect.sendCount !== 0 ||
        effect.providerCorrelationKey !== null ||
        effect.lastObservedAt !== null ||
        effect.nextReconcileAt !== null ||
        effect.detailDigest !== null ||
        effect.createdAt !== effect.updatedAt
      ) {
        fail("new external effect must be an approval-bound pristine planned snapshot");
      }
      const approvalId = effect.approvalId;
      const binding: EffectBinding = {
        planDigest: parseNullableDigest(input.binding.planDigest),
        diffDigest: parseNullableDigest(input.binding.diffDigest),
        commit: parseNullableCommit(input.binding.commit),
        buildIdentityDigest: parseNullableDigest(input.binding.buildIdentityDigest),
      };
      const authorizedAt = IsoInstantSchema.parse(input.authorizedAt);
      const availableAt = IsoInstantSchema.parse(input.availableAt);
      const standingScope =
        input.standingScope === null ? null : NamespacedCodeSchema.parse(input.standingScope);
      const origin = parsePlanningOrigin(input.origin);
      assertSame("effect creation time", effect.createdAt, authorizedAt);
      if (availableAt < authorizedAt) fail("outbox availability cannot precede authorization");
      assertSafeResourceKey(effect.target.resourceKey);
      assertActionSpecificBindings(effect.action, binding);
      if (effect.subject.attemptId !== effect.attemptId) {
        fail("effect top-level attemptId must equal approval subject attemptId");
      }
      const intentDigest = computeExternalEffectIntentDigest(effect, binding);

      const transaction = database.transaction((): PlanExternalEffectResult => {
        const byId = readEffect(database, effect.effectId);
        const byMarker = readEffectByMarker(database, effect.operationMarker);
        const byIntent = readEffectByIntent(database, intentDigest);
        let duplicate: PersistedEffect | null = null;
        if (byId !== null || byMarker !== null) {
          if (
            byId === null ||
            byMarker === null ||
            byId.effect.effectId !== byMarker.effect.effectId
          ) {
            fail("effect id or operation marker collides with a different immutable effect");
          }
          assertEffectIdentityMatches(
            byId,
            effect,
            binding,
            standingScope,
            availableAt,
            intentDigest,
          );
          duplicate = byId;
        } else if (byIntent !== null) {
          assertSemanticReplayMatches(byIntent, effect, binding, intentDigest);
          duplicate = byIntent;
        }

        if (duplicate !== null) {
          const replayedCheckpoint = readOriginCheckpoint(database, origin.checkpointId);
          if (replayedCheckpoint !== null) {
            assertOriginCheckpointReplay(replayedCheckpoint, {
              persisted: duplicate,
              approvalId,
              standingScope,
              origin,
              occurredAt: authorizedAt,
              intentDigest,
            });
            return { ...duplicate, duplicate: true };
          }

          // A semantic no-op is still a workflow mutation: prove the current
          // owner, control state and approval, then checkpoint it atomically.
          assertPlanningOrigin(database, effect, origin, authorizedAt);
          const approval = readApproval(database, approvalId);
          if (approval === null) fail(`approval does not exist: ${approvalId}`);
          assertApprovalMatchesPlanning(approval, effect, binding, authorizedAt, standingScope);
          advancePlanningCheckpoint(
            database,
            duplicate.effect,
            approvalId,
            standingScope,
            origin,
            authorizedAt,
            intentDigest,
          );
          consumeSingleUseApproval(database, approval, duplicate.effect.effectId, authorizedAt);
          return { ...duplicate, duplicate: true };
        }

        assertPlanningOrigin(database, effect, origin, authorizedAt);
        const approval = readApproval(database, approvalId);
        if (approval === null) fail(`approval does not exist: ${approvalId}`);
        assertApprovalMatchesPlanning(approval, effect, binding, authorizedAt, standingScope);

        database
          .prepare(
            `INSERT INTO external_effects(
               effect_id, schema_version, attempt_id, action, operation_marker, provider,
               resource_type, resource_key, subject_project_id, subject_task_id,
               subject_attempt_id, subject_release_id, payload_digest, policy_digest,
               plan_digest, diff_digest, commit_id, build_identity_digest, standing_scope,
               intent_digest, available_at, approval_id,
               state, revision, send_count, provider_correlation_key, created_at, updated_at,
               last_observed_at, next_reconcile_at, detail_digest, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            effect.effectId,
            effect.schemaVersion,
            effect.attemptId,
            effect.action,
            effect.operationMarker,
            effect.target.provider,
            effect.target.resourceType,
            effect.target.resourceKey,
            effect.subject.projectId,
            effect.subject.taskId,
            effect.subject.attemptId,
            effect.subject.releaseId,
            effect.payloadDigest,
            effect.policyDigest,
            binding.planDigest,
            binding.diffDigest,
            binding.commit,
            binding.buildIdentityDigest,
            standingScope,
            intentDigest,
            availableAt,
            effect.approvalId,
            effect.state,
            effect.revision,
            effect.sendCount,
            effect.providerCorrelationKey,
            effect.createdAt,
            effect.updatedAt,
            effect.lastObservedAt,
            effect.nextReconcileAt,
            effect.detailDigest,
            JSON.stringify(effect),
          );
        database
          .prepare(
            `INSERT INTO effect_outbox(
               effect_id, schema_version, available_at, locked_by, locked_until, fence, revision
             ) VALUES (?, 1, ?, NULL, NULL, 0, 0)`,
          )
          .run(effect.effectId, availableAt);
        insertTransition(database, effect.effectId, null, "planned", authorizedAt, null, 0, null);
        advancePlanningCheckpoint(
          database,
          effect,
          approvalId,
          standingScope,
          origin,
          authorizedAt,
          intentDigest,
        );
        consumeSingleUseApproval(database, approval, effect.effectId, authorizedAt);
        return {
          effect,
          binding,
          standingScope,
          intentDigest,
          availableAt,
          duplicate: false,
        };
      });
      return transaction.immediate();
    },

    getEffect(effectId) {
      return readEffect(database, EffectIdSchema.parse(effectId));
    },

    getExternalResource(effectIdValue) {
      const effectId = EffectIdSchema.parse(effectIdValue);
      return readLatestResource(database, effectId);
    },

    claimNextSend(input) {
      return claim(database, input, "send");
    },

    claimNextReconciliation(input) {
      return claim(database, input, "reconcile");
    },

    beginSend(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        assertEffectAllowsNewSend(database, current);
        if (current.approvalId === null) fail(`effect has no approval: ${current.effectId}`);
        const approval = readApproval(database, current.approvalId);
        if (approval === null) fail(`approval does not exist: ${current.approvalId}`);
        assertApprovalMatchesDispatch(approval, context.persisted, context.observedAt);
        assertLegalExternalEffectTransition(current.state, "sent");
        const next = mutableEffect(current, {
          state: "sent",
          revision: current.revision + 1,
          sendCount: current.sendCount + 1,
          updatedAt: context.observedAt,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        database
          .prepare(
            `INSERT INTO effect_send_attempts(
               effect_id, send_number, owner_id, fence, started_at,
               finished_at, outcome, provider_correlation_key, detail_digest
             ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
          )
          .run(next.effectId, next.sendCount, context.ownerId, context.fence, context.observedAt);
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          null,
        );
        return {
          ...replacePersistedEffect(context.persisted, next),
          dispatchToken: {
            effectId: next.effectId,
            ownerId: context.ownerId,
            fence: context.fence,
            outboxRevision: context.expectedOutboxRevision,
            effectRevision: next.revision,
          },
        };
      });
      return transaction.immediate();
    },

    assertDispatchActive(token, observedAtValue) {
      const observedAt = IsoInstantSchema.parse(observedAtValue);
      const context = assertActiveClaim(database, {
        effectId: token.effectId,
        ownerId: token.ownerId,
        fence: token.fence,
        expectedOutboxRevision: token.outboxRevision,
        expectedEffectRevision: token.effectRevision,
        observedAt,
      });
      if (context.persisted.effect.state !== "sent") {
        fail(`dispatch token requires sent state: ${context.persisted.effect.state}`);
      }
      assertEffectAllowsNewSend(database, context.persisted.effect);
      if (context.persisted.effect.approvalId === null) {
        fail(`effect has no approval: ${context.persisted.effect.effectId}`);
      }
      const approval = readApproval(database, context.persisted.effect.approvalId);
      if (approval === null) {
        fail(`approval does not exist: ${context.persisted.effect.approvalId}`);
      }
      assertApprovalMatchesDispatch(approval, context.persisted, observedAt);
      return context.persisted;
    },

    assertReconciliationActive(token, observedAtValue) {
      const observedAt = IsoInstantSchema.parse(observedAtValue);
      const context = assertActiveClaim(database, {
        effectId: token.effectId,
        ownerId: token.ownerId,
        fence: token.fence,
        expectedOutboxRevision: token.outboxRevision,
        expectedEffectRevision: token.effectRevision,
        observedAt,
      });
      if (
        context.persisted.effect.state !== "sent" &&
        context.persisted.effect.state !== "unknown" &&
        context.persisted.effect.state !== "observed"
      ) {
        fail(
          `reconciliation token requires sent, unknown, or observed state: ${context.persisted.effect.state}`,
        );
      }
      return context.persisted;
    },

    recordSendOutcome(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "sent") fail(`send outcome requires sent state: ${current.state}`);
        const sendAttempt = database
          .prepare(
            `SELECT owner_id AS ownerId, fence, finished_at AS finishedAt
             FROM effect_send_attempts WHERE effect_id = ? AND send_number = ?`,
          )
          .get(current.effectId, current.sendCount) as
          Readonly<{ ownerId: string; fence: number; finishedAt: string | null }> | undefined;
        if (sendAttempt === undefined || sendAttempt.finishedAt !== null) {
          fail(`active send attempt is missing or finished: ${current.effectId}`);
        }
        assertSame("send attempt owner", sendAttempt.ownerId, context.ownerId);
        assertSame("send attempt fence", sendAttempt.fence, context.fence);

        let next: ExternalEffectV1;
        let outcomeName: "observed" | "timeout" | "ambiguous" | "rejected";
        if (input.outcome.kind === "observed") {
          const correlation = parseNullableString(
            input.outcome.providerCorrelationKey,
            "providerCorrelationKey",
          );
          if (correlation === null) fail("observed send requires a provider correlation key");
          const detailDigest = parseNullableDigest(input.outcome.detailDigest);
          const resource = parseObservedResource(
            input.outcome.resource,
            current,
            context.observedAt,
          );
          insertAttestedObservation(database, options, {
            effect: current,
            resource,
            observationValue: input.outcome.observation,
            expectedSource: "provider-send",
            ownerId: context.ownerId,
            fence: context.fence,
            observedAt: context.observedAt,
          });
          next = mutableEffect(current, {
            state: "observed",
            revision: current.revision + 1,
            providerCorrelationKey: correlation,
            updatedAt: context.observedAt,
            lastObservedAt: context.observedAt,
            nextReconcileAt: context.observedAt,
            detailDigest,
          });
          outcomeName = "observed";
        } else if (input.outcome.kind === "timeout" || input.outcome.kind === "ambiguous") {
          const nextReconcileAt = IsoInstantSchema.parse(input.outcome.nextReconcileAt);
          assertBoundedReconcileAt(context.observedAt, nextReconcileAt);
          const detailDigest = Sha256DigestSchema.parse(input.outcome.detailDigest);
          next = mutableEffect(current, {
            state: "unknown",
            revision: current.revision + 1,
            providerCorrelationKey: parseNullableString(
              input.outcome.providerCorrelationKey,
              "providerCorrelationKey",
            ),
            updatedAt: context.observedAt,
            nextReconcileAt,
            detailDigest,
          });
          outcomeName = input.outcome.kind;
        } else if (input.outcome.kind === "rejected") {
          const code = NamespacedCodeSchema.parse(input.outcome.code);
          if (typeof input.outcome.retryable !== "boolean") {
            fail("rejected send outcome must declare retryability");
          }
          const evidenceDigest = Sha256DigestSchema.parse(input.outcome.evidenceDigest);
          const artifact = database
            .prepare("SELECT digest FROM artifacts WHERE digest = ?")
            .get(evidenceDigest) as Readonly<{ digest: string }> | undefined;
          if (artifact === undefined) {
            fail(`rejection evidence artifact does not exist: ${evidenceDigest}`);
          }
          next = mutableEffect(current, {
            state: "rejected",
            revision: current.revision + 1,
            updatedAt: context.observedAt,
            nextReconcileAt: null,
            detailDigest: evidenceDigest,
          });
          database
            .prepare(
              `INSERT INTO effect_rejections(
                 effect_id, code, retryable, evidence_digest, rejected_at, owner_id, fence
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              current.effectId,
              code,
              input.outcome.retryable ? 1 : 0,
              evidenceDigest,
              context.observedAt,
              context.ownerId,
              context.fence,
            );
          outcomeName = "rejected";
        } else {
          fail(`unsupported send outcome: ${String(input.outcome.kind)}`);
        }
        updateEffect(database, next, context.expectedEffectRevision);
        const sendResult = database
          .prepare(
            `UPDATE effect_send_attempts
             SET finished_at = ?, outcome = ?, provider_correlation_key = ?, detail_digest = ?
             WHERE effect_id = ? AND send_number = ? AND owner_id = ? AND fence = ?
               AND finished_at IS NULL`,
          )
          .run(
            context.observedAt,
            outcomeName,
            next.providerCorrelationKey,
            next.detailDigest,
            next.effectId,
            next.sendCount,
            context.ownerId,
            context.fence,
          );
        if (sendResult.changes !== 1) fail(`send attempt completion conflict: ${next.effectId}`);
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          next.detailDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    recordReconciliationObserved(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "sent" && current.state !== "unknown") {
          fail(`observed reconciliation requires sent or unknown state: ${current.state}`);
        }
        const correlation = parseNullableString(
          input.providerCorrelationKey,
          "providerCorrelationKey",
        );
        if (correlation === null) fail("observed reconciliation requires a correlation key");
        const detailDigest = parseNullableDigest(input.detailDigest);
        const resource = parseObservedResource(input.resource, current, context.observedAt);
        insertAttestedObservation(database, options, {
          effect: current,
          resource,
          observationValue: input.observation,
          expectedSource: "provider-reconciliation",
          ownerId: context.ownerId,
          fence: context.fence,
          observedAt: context.observedAt,
        });
        const next = mutableEffect(current, {
          state: "observed",
          revision: current.revision + 1,
          providerCorrelationKey: correlation,
          updatedAt: context.observedAt,
          lastObservedAt: context.observedAt,
          nextReconcileAt: context.observedAt,
          detailDigest,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        if (current.state === "sent") {
          const sendResult = database
            .prepare(
              `UPDATE effect_send_attempts
               SET finished_at = ?, outcome = 'observed', provider_correlation_key = ?, detail_digest = ?
               WHERE effect_id = ? AND send_number = ? AND finished_at IS NULL`,
            )
            .run(
              context.observedAt,
              correlation,
              detailDigest,
              current.effectId,
              current.sendCount,
            );
          if (sendResult.changes !== 1) {
            fail(`unfinished send attempt is missing: ${current.effectId}`);
          }
        }
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          detailDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    recordReconciliationUnknown(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "sent")
          fail(`only a sent effect can become unknown: ${current.state}`);
        const nextReconcileAt = IsoInstantSchema.parse(input.nextReconcileAt);
        assertBoundedReconcileAt(context.observedAt, nextReconcileAt);
        const detailDigest = Sha256DigestSchema.parse(input.detailDigest);
        const next = mutableEffect(current, {
          state: "unknown",
          revision: current.revision + 1,
          providerCorrelationKey: parseNullableString(
            input.providerCorrelationKey,
            "providerCorrelationKey",
          ),
          updatedAt: context.observedAt,
          nextReconcileAt,
          detailDigest,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        const sendResult = database
          .prepare(
            `UPDATE effect_send_attempts
             SET finished_at = ?, outcome = 'ambiguous', provider_correlation_key = ?, detail_digest = ?
             WHERE effect_id = ? AND send_number = ? AND finished_at IS NULL`,
          )
          .run(
            context.observedAt,
            next.providerCorrelationKey,
            detailDigest,
            current.effectId,
            current.sendCount,
          );
        if (sendResult.changes !== 1) {
          fail(`unfinished send attempt is missing: ${current.effectId}`);
        }
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          detailDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    recordReconciliationUnresolved(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "unknown") {
          fail(`unresolved reconciliation requires unknown state: ${current.state}`);
        }
        if (input.outcome !== "not-found" && input.outcome !== "ambiguous") {
          fail(`unsupported unresolved reconciliation outcome: ${String(input.outcome)}`);
        }
        const nextReconcileAt = IsoInstantSchema.parse(input.nextReconcileAt);
        assertBoundedReconcileAt(context.observedAt, nextReconcileAt);
        const detailDigest = Sha256DigestSchema.parse(input.detailDigest);
        const providedCorrelation = parseNullableString(
          input.providerCorrelationKey,
          "providerCorrelationKey",
        );
        const row = database
          .prepare(
            "SELECT MAX(sequence) AS sequence FROM effect_reconciliation_attempts WHERE effect_id = ?",
          )
          .get(current.effectId) as Readonly<{ sequence: number | null }>;
        const reconciliationSequence = (row.sequence ?? 0) + 1;
        const requiresManualIntervention = reconciliationSequence >= MAX_UNRESOLVED_RECONCILIATIONS;
        const next = mutableEffect(current, {
          state: requiresManualIntervention ? "manual-intervention" : "unknown",
          revision: current.revision + 1,
          providerCorrelationKey: providedCorrelation ?? current.providerCorrelationKey,
          updatedAt: context.observedAt,
          nextReconcileAt: requiresManualIntervention ? null : nextReconcileAt,
          detailDigest,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        database
          .prepare(
            `INSERT INTO effect_reconciliation_attempts(
               effect_id, sequence, outcome, owner_id, fence, observed_at,
               next_reconcile_at, provider_correlation_key, detail_digest
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            next.effectId,
            reconciliationSequence,
            input.outcome,
            context.ownerId,
            context.fence,
            context.observedAt,
            nextReconcileAt,
            next.providerCorrelationKey,
            detailDigest,
          );
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          detailDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    deferObservedReconciliation(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "observed") {
          fail(`only an observed effect can defer confirmation: ${current.state}`);
        }
        assertIncreasingTime(current.updatedAt, context.observedAt, "deferred reconciliation time");
        if (input.outcome !== "not-found" && input.outcome !== "ambiguous") {
          fail(`unsupported deferred reconciliation outcome: ${String(input.outcome)}`);
        }
        const nextReconcileAt = IsoInstantSchema.parse(input.nextReconcileAt);
        assertBoundedReconcileAt(context.observedAt, nextReconcileAt);
        const detailDigest = Sha256DigestSchema.parse(input.detailDigest);
        const providedCorrelation = parseNullableString(
          input.providerCorrelationKey,
          "providerCorrelationKey",
        );
        if (
          providedCorrelation !== null &&
          providedCorrelation !== current.providerCorrelationKey
        ) {
          fail("deferred confirmation correlation must match the observed effect");
        }
        const row = database
          .prepare(
            "SELECT MAX(sequence) AS sequence FROM effect_reconciliation_attempts WHERE effect_id = ?",
          )
          .get(current.effectId) as Readonly<{ sequence: number | null }>;
        const reconciliationSequence = (row.sequence ?? 0) + 1;
        const requiresManualIntervention = reconciliationSequence >= MAX_UNRESOLVED_RECONCILIATIONS;
        const next = mutableEffect(current, {
          state: requiresManualIntervention ? "manual-intervention" : "observed",
          revision: current.revision + 1,
          updatedAt: context.observedAt,
          nextReconcileAt: requiresManualIntervention ? null : nextReconcileAt,
          detailDigest,
        });
        if (requiresManualIntervention) {
          updateEffect(database, next, context.expectedEffectRevision);
        } else {
          updateEffectWithoutStateTransition(database, next, context.expectedEffectRevision);
        }
        database
          .prepare(
            `INSERT INTO effect_reconciliation_attempts(
               effect_id, sequence, outcome, owner_id, fence, observed_at,
               next_reconcile_at, provider_correlation_key, detail_digest
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            next.effectId,
            reconciliationSequence,
            input.outcome,
            context.ownerId,
            context.fence,
            context.observedAt,
            nextReconcileAt,
            next.providerCorrelationKey,
            detailDigest,
          );
        if (requiresManualIntervention) {
          insertTransition(
            database,
            next.effectId,
            current.state,
            next.state,
            context.observedAt,
            context.ownerId,
            context.fence,
            detailDigest,
          );
        }
        // Before the policy threshold this is intentionally not a state
        // transition: ambiguity cannot negate an attested resource. At the
        // threshold, observed -> manual-intervention preserves that resource
        // evidence while ending an otherwise infinite reconciliation loop.
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    confirmObserved(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "observed") fail(`only an observed effect can be confirmed`);
        if (current.lastObservedAt === null || context.observedAt <= current.lastObservedAt) {
          fail("confirmation requires a fresh provider observation time");
        }
        const correlation = parseNullableString(
          input.providerCorrelationKey,
          "providerCorrelationKey",
        );
        if (correlation === null || correlation !== current.providerCorrelationKey) {
          fail("confirmation correlation must match the observed effect");
        }
        const previousResource = readLatestResource(database, current.effectId);
        if (previousResource === null) {
          fail(`cannot confirm without prior observed resource: ${current.effectId}`);
        }
        const previousObservation = readLatestObservation(database, current.effectId);
        if (previousObservation === null) {
          fail(`cannot confirm without a prior attested observation: ${current.effectId}`);
        }
        assertSame(
          "prior observation resource digest",
          previousObservation.resourceObservedDigest,
          previousResource.observedDigest,
        );
        const confirmationResource = parseObservedResource(
          input.resource,
          current,
          context.observedAt,
        );
        assertSame(
          "confirmation provider resource identity",
          confirmationResource.providerResourceId,
          previousResource.providerResourceId,
        );
        const confirmationEvidenceDigest = Sha256DigestSchema.parse(
          input.confirmationEvidenceDigest,
        );
        const proposedObservation = ExternalObservationV1Schema.parse(input.observation);
        if (proposedObservation.invocationId === previousObservation.observation.invocationId) {
          fail("confirmation requires a distinct provider invocation");
        }
        const confirmationObservation = insertAttestedObservation(database, options, {
          effect: current,
          resource: confirmationResource,
          observationValue: proposedObservation,
          expectedSource: "provider-reconciliation",
          ownerId: context.ownerId,
          fence: context.fence,
          observedAt: context.observedAt,
        });
        assertSame(
          "confirmation evidence digest",
          confirmationEvidenceDigest,
          confirmationObservation.evidenceDigest,
        );
        const next = mutableEffect(current, {
          state: "confirmed",
          revision: current.revision + 1,
          providerCorrelationKey: correlation,
          updatedAt: context.observedAt,
          lastObservedAt: context.observedAt,
          nextReconcileAt: null,
          detailDigest: confirmationEvidenceDigest,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          confirmationEvidenceDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    requireManualIntervention(input) {
      const transaction = database.transaction(() => {
        const context = assertActiveClaim(database, input);
        const current = context.persisted.effect;
        if (current.state !== "unknown" && current.state !== "observed") {
          fail("only an unknown or observed effect can require intervention");
        }
        const detailDigest = Sha256DigestSchema.parse(input.detailDigest);
        const next = mutableEffect(current, {
          state: "manual-intervention",
          revision: current.revision + 1,
          updatedAt: context.observedAt,
          nextReconcileAt: null,
          detailDigest,
        });
        updateEffect(database, next, context.expectedEffectRevision);
        insertTransition(
          database,
          next.effectId,
          current.state,
          next.state,
          context.observedAt,
          context.ownerId,
          context.fence,
          detailDigest,
        );
        releaseClaim(
          database,
          next.effectId,
          context.ownerId,
          context.fence,
          context.expectedOutboxRevision,
        );
        return replacePersistedEffect(context.persisted, next);
      });
      return transaction.immediate();
    },

    listEffectsForReconciliation(asOfValue, limitValue) {
      const asOf = IsoInstantSchema.parse(asOfValue);
      const limit = parseLimit(limitValue);
      const rows = database
        .prepare(
          `SELECT e.*
           FROM external_effects e
           JOIN effect_outbox o ON o.effect_id = e.effect_id
           WHERE (
             e.state = 'sent'
             OR (e.state IN ('unknown', 'observed') AND e.next_reconcile_at <= ?)
           )
             AND (o.locked_by IS NULL OR o.locked_until <= ?)
           ORDER BY
             CASE WHEN e.state IN ('unknown', 'observed') THEN e.next_reconcile_at ELSE e.updated_at END,
             e.effect_id
           LIMIT ?`,
        )
        .all(asOf, asOf, limit) as readonly EffectRow[];
      return rows.map(decodeEffect);
    },

    listEffects(inputValue) {
      const input: EffectListQueryV1 = EffectListQueryV1Schema.parse(inputValue);
      const conditions: string[] = [];
      const parameters: Array<number | string> = [];

      if (input.state !== null) {
        conditions.push("e.state = ?");
        parameters.push(input.state);
      }
      if (input.provider !== null) {
        conditions.push("e.provider = ?");
        parameters.push(input.provider);
      }
      if (input.after !== null) {
        conditions.push("(e.updated_at < ? OR (e.updated_at = ? AND e.effect_id < ?))");
        parameters.push(input.after.updatedAt, input.after.updatedAt, input.after.effectId);
      }

      const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
      const rows = database
        .prepare(
          `SELECT e.*
           FROM external_effects e
           ${where}
           ORDER BY e.updated_at DESC, e.effect_id DESC
           LIMIT ?`,
        )
        .all(...parameters, input.limit + 1) as readonly EffectRow[];
      const decoded = rows.map((row) => decodeEffect(row).effect);
      const hasMore = decoded.length > input.limit;
      const effects = decoded.slice(0, input.limit);
      const cursorSource = hasMore ? effects.at(-1) : undefined;
      return EffectListPageV1Schema.parse({
        effects: effects.map((effect) => ({ schemaVersion: 1, effect })),
        nextAfter:
          cursorSource === undefined
            ? null
            : { updatedAt: cursorSource.updatedAt, effectId: cursorSource.effectId },
        hasMore,
      });
    },

    countEffectsByState() {
      const rows = database
        .prepare("SELECT state, COUNT(*) AS count FROM external_effects GROUP BY state")
        .all() as readonly Readonly<{ state: string; count: number }>[];
      const counts: Record<string, number> = {
        planned: 0,
        sent: 0,
        observed: 0,
        confirmed: 0,
        unknown: 0,
        "manual-intervention": 0,
        rejected: 0,
      };
      for (const row of rows) {
        if (!(row.state in counts)) fail(`unrecognized effect state in storage: ${row.state}`);
        counts[row.state] = row.count;
      }
      return EffectStateCountsV1Schema.parse(counts);
    },

    countPendingOutbox(asOfValue) {
      const asOf = IsoInstantSchema.parse(asOfValue);
      const row = database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM effect_outbox o
           JOIN external_effects e ON e.effect_id = o.effect_id
           WHERE (
             e.state = 'planned'
             OR e.state = 'sent'
             OR (e.state IN ('unknown', 'observed') AND e.next_reconcile_at <= ?)
           )
             AND (o.locked_by IS NULL OR o.locked_until <= ?)`,
        )
        .get(asOf, asOf) as Readonly<{ count: number }>;
      return parseNonNegativeInteger(row.count, "pending outbox count");
    },
  };
}

export const createEffectRepositories = createEffectRepository;
