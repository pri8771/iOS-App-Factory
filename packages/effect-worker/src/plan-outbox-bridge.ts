import { createHash } from "node:crypto";

import { sha256Bytes } from "@app-factory/adapter-sdk";
import {
  IsoInstantSchema,
  Sha256DigestSchema,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import type { EffectRepository, PersistedApproval, PersistedEffect } from "@app-factory/kernel";
import {
  canonicalJson,
  type ProjectProvisionPlanV1,
  type ProvisionOperationV1,
  type Sha256Digest as PlanDigest,
} from "@app-factory/work-tracking-integrations";

import type { ArtifactLookupPort, ArtifactRegistrationPort } from "./ports/index.js";

/**
 * The bridge from a declarative `ProjectProvisionPlanV1`
 * (`@app-factory/work-tracking-integrations`) to the kernel's durable
 * effect outbox (`EffectRepository.planExternalEffect`). Nothing else in
 * the repository turns a provision plan into kernel effects; this module is
 * that connection.
 *
 * A plan's operations form a DAG (`dependsOnOperationIds`). This bridge:
 *   1. Orders operations topologically (the plan's own `operations` array is
 *      sorted for determinism, not for dependency order - see
 *      `createProjectProvisionPlan` in work-tracking-integrations/src/plan.ts).
 *   2. Persists each operation's payload as a kernel artifact, by digest,
 *      through the same `ArtifactRepository` + `EvidenceStore` pair the
 *      production `EffectPayloadPort` reads from (./ports/index.ts).
 *   3. Calls `planExternalEffect` once per ready operation, advancing the
 *      origin step's checkpoint revision by exactly one per call, exactly as
 *      `EffectRepository` requires.
 *
 * Fail-closed rules:
 *   - An operation is only planned once every operation it depends on has
 *     reached the kernel's terminal `confirmed` effect state. An operation
 *     with an unconfirmed dependency is reported as "blocked" for this call
 *     rather than treated as an error: this is the normal, expected state of
 *     most of a large plan on every call before the outbox has drained.
 *   - A ready operation that has never been planned before, with no approval
 *     mapped to it, an approval that does not exist, is not active, is
 *     expired, or does not authorize this exact operation throws immediately
 *     and aborts the call. An operation this bridge already planned in an
 *     earlier call replays through the kernel using the approval it was
 *     originally planned with, without re-validating that approval - it may
 *     since have been legitimately consumed (single-use) or dropped from the
 *     caller's approval map, and the kernel's own exact-checkpoint-replay
 *     path does not re-check it either.
 *   - A ready operation whose declared `payloadDigest` does not match the
 *     canonical digest of its own `payload` throws immediately.
 *   - Effect IDs and checkpoint IDs are derived deterministically from each
 *     operation's `operationId` (itself a stable digest of the operation's
 *     logical identity - see plan.ts's `makeOperation`). Replaying the same
 *     plan against the same step - including a crash-and-restart, or a
 *     retry after fixing a missing approval - reproduces byte-identical IDs,
 *     so already-planned operations replay through the kernel's own
 *     idempotent-by-marker dedup instead of erroring or double-planning.
 */

export class PlanOutboxBridgeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PlanOutboxBridgeError";
  }
}

function fail(message: string): never {
  throw new PlanOutboxBridgeError(message);
}

/* --------------------------------------------------------------------- *
 * Deterministic ID derivation.
 * --------------------------------------------------------------------- */

// Produces a stable, RFC4122-shaped (version 4, variant 10xx) lowercase UUID
// string from an arbitrary seed. This is not a security boundary and does
// not need to match the real UUIDv5 algorithm bit-for-bit - it only needs to
// satisfy the kernel's UUID schema and be collision-resistant and stable
// across process restarts, which a SHA-256-derived digest provides.
function deterministicUuid(seed: string): string {
  const hash = createHash("sha256").update(seed, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  const versionByte = bytes[6] ?? 0;
  const variantByte = bytes[8] ?? 0;
  bytes[6] = (versionByte & 0x0f) | 0x40;
  bytes[8] = (variantByte & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

const EFFECT_ID_NAMESPACE = "app-factory:v1:provision-bridge:effect-id";
const CHECKPOINT_ID_NAMESPACE = "app-factory:v1:provision-bridge:checkpoint-id";

/** The deterministic kernel `EffectId` a provision operation always maps to. */
export function provisionEffectId(operationId: string): string {
  return deterministicUuid(`${EFFECT_ID_NAMESPACE}:${operationId}`);
}

/** The deterministic origin-checkpoint `EventId` a provision operation always plans under. */
export function provisionCheckpointId(operationId: string): string {
  return deterministicUuid(`${CHECKPOINT_ID_NAMESPACE}:${operationId}`);
}

/* --------------------------------------------------------------------- *
 * Dependency-order sequencing.
 * --------------------------------------------------------------------- */

function topologicalOrder(
  operations: readonly ProvisionOperationV1[],
): readonly ProvisionOperationV1[] {
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  const remainingDependencyCount = new Map(
    operations.map((operation) => [operation.operationId, operation.dependsOnOperationIds.length]),
  );
  const dependents = new Map<string, string[]>();
  for (const operation of operations) {
    for (const dependencyId of operation.dependsOnOperationIds) {
      const list = dependents.get(dependencyId);
      if (list === undefined) dependents.set(dependencyId, [operation.operationId]);
      else list.push(operation.operationId);
    }
  }

  // A sorted frontier of ready-to-order operation IDs. Re-sorting on every
  // pop keeps the resulting order a pure function of the operation set,
  // independent of Map/array iteration order, so replaying the same plan
  // always assigns the same checkpoint position to the same operation.
  const frontier = operations
    .filter((operation) => operation.dependsOnOperationIds.length === 0)
    .map((operation) => operation.operationId)
    .sort();
  const ordered: ProvisionOperationV1[] = [];

  while (frontier.length > 0) {
    frontier.sort();
    const operationId = frontier.shift();
    if (operationId === undefined) break;
    const operation = byId.get(operationId);
    if (operation === undefined) fail("topological sort lost an operation");
    ordered.push(operation);
    for (const dependentId of dependents.get(operationId) ?? []) {
      const remaining = (remainingDependencyCount.get(dependentId) ?? 0) - 1;
      remainingDependencyCount.set(dependentId, remaining);
      if (remaining === 0) frontier.push(dependentId);
    }
  }

  if (ordered.length !== operations.length) {
    fail("provision plan operations contain a dependency cycle or reference an unknown operation");
  }
  return ordered;
}

/* --------------------------------------------------------------------- *
 * Ports.
 * --------------------------------------------------------------------- */

export type ProvisionBridgeKernelPort = Pick<
  EffectRepository,
  "getApproval" | "planExternalEffect" | "getEffect"
>;

export type ProvisionBridgeArtifactPort = ArtifactLookupPort & ArtifactRegistrationPort;

export type PlanOutboxBridgeOptions = Readonly<{
  kernel: ProvisionBridgeKernelPort;
  artifacts: ProvisionBridgeArtifactPort;
  evidenceStore: EvidenceStore;
}>;

/* --------------------------------------------------------------------- *
 * Per-call input/output.
 * --------------------------------------------------------------------- */

/**
 * The live workflow context this call plans effects under. All fields stay
 * fixed for the duration of one `applyPlan` call: planning an effect never
 * changes the attempt's or the step's own revision, only the step's private
 * effect-checkpoint counter, which this bridge advances by one per operation
 * it plans (see `expectedCheckpointRevision` in
 * packages/kernel/src/effect-repositories.ts).
 */
export type ProvisionPlanningOriginV1 = Readonly<{
  leaseKey: string;
  ownerId: string;
  fence: number;
  stepId: string;
  expectedAttemptRevision: number;
  expectedStepRevision: number;
  /**
   * The origin step's effect-checkpoint revision immediately before this
   * plan's first operation is planned. Defaults to 0, correct for a step
   * that has never planned an effect before. Resuming a partially-applied
   * plan under the same step reuses this same starting value - resumption
   * is achieved by deterministic per-operation IDs (see `provisionEffectId`),
   * not by advancing this number.
   */
  startingCheckpointRevision?: number;
}>;

export type ProvisionEffectSubjectV1 = Readonly<{
  projectId: string;
  taskId: string;
  attemptId: string;
  releaseId: string | null;
}>;

export type ApplyProvisionPlanInput = Readonly<{
  plan: ProjectProvisionPlanV1;
  /** Maps each `ProvisionOperationV1.operationId` to the approval that authorizes it. */
  approvals: ReadonlyMap<string, string>;
  subject: ProvisionEffectSubjectV1;
  /** Must equal the originating attempt's active TaskSpec policy digest. */
  policyDigest: Sha256Digest;
  origin: ProvisionPlanningOriginV1;
  authorizedAt: IsoInstant;
  /** Defaults to `authorizedAt` (immediately eligible for send). */
  availableAt?: IsoInstant;
}>;

export type ProvisionOperationOutcome =
  | Readonly<{
      operationId: string;
      action: string;
      status: "planned";
      duplicate: boolean;
      effect: PersistedEffect;
    }>
  | Readonly<{
      operationId: string;
      action: string;
      status: "blocked";
      blockedOnOperationIds: readonly string[];
    }>;

export type ApplyProvisionPlanResult = Readonly<{
  planId: PlanDigest;
  outcomes: readonly ProvisionOperationOutcome[];
  plannedCount: number;
  blockedCount: number;
  /** The origin step's effect-checkpoint revision after this call. */
  endingCheckpointRevision: number;
}>;

/* --------------------------------------------------------------------- *
 * Validation helpers.
 * --------------------------------------------------------------------- */

function assertNoDuplicateOrDanglingOperations(plan: ProjectProvisionPlanV1): void {
  const ids = plan.operations.map((operation) => operation.operationId);
  if (new Set(ids).size !== ids.length) {
    fail("provision plan contains duplicate operation IDs");
  }
  const known = new Set(ids);
  for (const operation of plan.operations) {
    for (const dependencyId of operation.dependsOnOperationIds) {
      if (!known.has(dependencyId)) {
        fail(
          `provision operation ${operation.operationId} depends on an operation not present in the plan: ${dependencyId}`,
        );
      }
    }
  }
}

function unconfirmedDependencies(
  kernel: ProvisionBridgeKernelPort,
  operation: ProvisionOperationV1,
): readonly string[] {
  const blocked: string[] = [];
  for (const dependencyId of operation.dependsOnOperationIds) {
    const persisted = kernel.getEffect(provisionEffectId(dependencyId));
    if (persisted === null || persisted.effect.state !== "confirmed") {
      blocked.push(dependencyId);
    }
  }
  return blocked;
}

function assertApprovalAuthorizesOperation(
  approval: PersistedApproval,
  operation: ProvisionOperationV1,
  subject: ProvisionEffectSubjectV1,
  authorizedAt: IsoInstant,
  policyDigest: Sha256Digest,
  planDigest: PlanDigest,
): void {
  const { approval: record, payloadDigest } = approval;
  if (record.status !== "active") {
    fail(
      `approval ${record.approvalId} for provision operation ${operation.operationId} is not active (status=${record.status})`,
    );
  }
  if (authorizedAt < record.issuedAt || authorizedAt >= record.expiresAt) {
    fail(
      `approval ${record.approvalId} for provision operation ${operation.operationId} is expired or not yet valid at ${authorizedAt}`,
    );
  }
  const subjectMatches =
    record.subject.projectId === subject.projectId &&
    record.subject.taskId === subject.taskId &&
    record.subject.attemptId === subject.attemptId &&
    record.subject.releaseId === subject.releaseId;
  if (
    record.action !== operation.action ||
    record.resourceType !== operation.correlation.resourceType ||
    record.resourceKey !== operation.resourceKey ||
    !subjectMatches ||
    payloadDigest !== operation.payloadDigest ||
    record.binding.policyDigest !== policyDigest ||
    record.binding.planDigest !== planDigest ||
    record.binding.diffDigest !== null ||
    record.binding.commit !== null ||
    record.binding.buildIdentityDigest !== null
  ) {
    fail(
      `approval ${record.approvalId} does not authorize provision operation ${operation.operationId} exactly`,
    );
  }
}

function standingScopeFor(approval: PersistedApproval, operationId: string): string | null {
  if (approval.approval.mode === "single-use") return null;
  const scopes = approval.approval.standingScope ?? [];
  if (scopes.length !== 1) {
    fail(
      `standing approval ${approval.approval.approvalId} for provision operation ${operationId} must declare exactly one standing scope to be used by the plan-outbox bridge unambiguously`,
    );
  }
  return scopes[0] as string;
}

function provisionArtifactLogicalName(operation: ProvisionOperationV1): string {
  return `provision-operation.${operation.action}.${operation.operationId}.json`;
}

/* --------------------------------------------------------------------- *
 * The bridge.
 * --------------------------------------------------------------------- */

export class PlanOutboxBridge {
  readonly #kernel: ProvisionBridgeKernelPort;
  readonly #artifacts: ProvisionBridgeArtifactPort;
  readonly #evidenceStore: EvidenceStore;

  public constructor(options: PlanOutboxBridgeOptions) {
    this.#kernel = options.kernel;
    this.#artifacts = options.artifacts;
    this.#evidenceStore = options.evidenceStore;
  }

  /**
   * Persists whatever prefix of `input.plan.operations` is currently ready
   * (all dependencies confirmed, approval available) into the kernel's
   * effect outbox, in dependency order. Safe to call repeatedly with the
   * same plan/approvals/origin: already-planned operations replay as
   * no-ops, and operations still blocked on an unconfirmed dependency are
   * reported rather than retried destructively. Throws immediately - without
   * planning any further operations - on a missing/expired/mismatched
   * approval or a payload digest mismatch; operations already durably
   * planned earlier in this same call remain planned.
   */
  public applyPlan(input: ApplyProvisionPlanInput): ApplyProvisionPlanResult {
    const { plan } = input;
    if (input.subject.projectId !== plan.projectId) {
      fail(
        `provisioning subject projectId ${input.subject.projectId} does not match plan projectId ${plan.projectId}`,
      );
    }
    const policyDigest = Sha256DigestSchema.parse(input.policyDigest);
    const authorizedAt = IsoInstantSchema.parse(input.authorizedAt);
    const availableAt = IsoInstantSchema.parse(input.availableAt ?? input.authorizedAt);
    assertNoDuplicateOrDanglingOperations(plan);

    const ordered = topologicalOrder(plan.operations);
    const outcomes: ProvisionOperationOutcome[] = [];
    let checkpointRevision = input.origin.startingCheckpointRevision ?? 0;

    for (const operation of ordered) {
      const blockedOnOperationIds = unconfirmedDependencies(this.#kernel, operation);
      if (blockedOnOperationIds.length > 0) {
        outcomes.push({
          operationId: operation.operationId,
          action: operation.action,
          status: "blocked",
          blockedOnOperationIds,
        });
        continue;
      }

      // An operation this bridge already durably planned in an earlier call
      // (including one interrupted by a crash) is replayed through the
      // kernel's own idempotent-by-marker/checkpoint dedup below using the
      // approval reference and standing scope it was originally planned
      // with, without re-validating that approval. This matters: a
      // single-use approval is legitimately `consumed` immediately after
      // its first successful use, and a standing approval's caller-supplied
      // scope from a prior call is not necessarily still in `input.approvals`.
      // The kernel's own exact-checkpoint-replay path does not re-check the
      // approval either - only a genuinely new plan does.
      const existing = this.#kernel.getEffect(provisionEffectId(operation.operationId));
      let approvalId: string;
      let standingScope: string | null;
      if (existing !== null) {
        if (existing.effect.approvalId === null) {
          fail(
            `provision operation ${operation.operationId} is already planned without an approval reference, which should be unreachable`,
          );
        }
        approvalId = existing.effect.approvalId;
        standingScope = existing.standingScope;
      } else {
        const mappedApprovalId = input.approvals.get(operation.operationId);
        if (mappedApprovalId === undefined) {
          fail(
            `missing approval for provision operation ${operation.operationId} (${operation.action} ${operation.resourceKey})`,
          );
        }
        const approval = this.#kernel.getApproval(mappedApprovalId);
        if (approval === null) {
          fail(
            `approval ${mappedApprovalId} for provision operation ${operation.operationId} does not exist`,
          );
        }
        assertApprovalAuthorizesOperation(
          approval,
          operation,
          input.subject,
          authorizedAt,
          policyDigest,
          plan.planId,
        );
        approvalId = mappedApprovalId;
        standingScope = standingScopeFor(approval, operation.operationId);
      }

      const payloadBytes = Buffer.from(canonicalJson(operation.payload), "utf8");
      const computedDigest = sha256Bytes(payloadBytes);
      if (computedDigest !== operation.payloadDigest) {
        fail(
          `payload digest mismatch for provision operation ${operation.operationId}: plan declares ${operation.payloadDigest}, its own payload canonicalizes to ${computedDigest}`,
        );
      }
      this.#persistPayloadArtifact(operation, payloadBytes, authorizedAt);

      const effect = {
        schemaVersion: 1,
        effectId: provisionEffectId(operation.operationId),
        attemptId: input.subject.attemptId,
        action: operation.action,
        operationMarker: operation.operationMarker,
        target: {
          provider: operation.provider,
          resourceType: operation.correlation.resourceType,
          resourceKey: operation.resourceKey,
        },
        subject: {
          projectId: input.subject.projectId,
          taskId: input.subject.taskId,
          attemptId: input.subject.attemptId,
          releaseId: input.subject.releaseId,
        },
        payloadDigest: operation.payloadDigest,
        policyDigest,
        approvalId,
        state: "planned",
        revision: 0,
        sendCount: 0,
        providerCorrelationKey: null,
        createdAt: authorizedAt,
        updatedAt: authorizedAt,
        lastObservedAt: null,
        nextReconcileAt: null,
        detailDigest: null,
      };

      const result = this.#kernel.planExternalEffect({
        effect,
        binding: {
          planDigest: plan.planId,
          diffDigest: null,
          commit: null,
          buildIdentityDigest: null,
        },
        authorizedAt,
        availableAt,
        standingScope,
        origin: {
          checkpointId: provisionCheckpointId(operation.operationId),
          leaseKey: input.origin.leaseKey,
          ownerId: input.origin.ownerId,
          fence: input.origin.fence,
          stepId: input.origin.stepId,
          expectedAttemptRevision: input.origin.expectedAttemptRevision,
          expectedStepRevision: input.origin.expectedStepRevision,
          expectedCheckpointRevision: checkpointRevision,
        },
      });
      checkpointRevision += 1;

      outcomes.push({
        operationId: operation.operationId,
        action: operation.action,
        status: "planned",
        duplicate: result.duplicate,
        effect: result,
      });
    }

    return {
      planId: plan.planId,
      outcomes,
      plannedCount: outcomes.filter((outcome) => outcome.status === "planned").length,
      blockedCount: outcomes.filter((outcome) => outcome.status === "blocked").length,
      endingCheckpointRevision: checkpointRevision,
    };
  }

  #persistPayloadArtifact(
    operation: ProvisionOperationV1,
    bytes: Uint8Array,
    recordedAt: IsoInstant,
  ): void {
    const digest = operation.payloadDigest;
    if (this.#artifacts.findByDigest(digest) !== null) return;
    this.#evidenceStore.putBlob(bytes);
    this.#artifacts.record({
      artifact: {
        digest,
        byteLength: bytes.byteLength,
        mediaType: "application/json",
        logicalName: provisionArtifactLogicalName(operation),
      },
      storagePath: this.#evidenceStore.blobPath(digest),
      recordedAt,
    });
  }
}
