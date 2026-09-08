import { createHash } from "node:crypto";

import {
  ApprovalIdSchema,
  EffectIdSchema,
  IsoInstantSchema,
  ReleaseIdentityV1Schema,
  ReleaseRunIdSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
  type ReleaseIdentityV1,
  type ReleaseRunV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  computeReleaseIdentityDigestV1,
  ReleaseRunUpsertError,
  type EffectRepository,
  type FactoryRepositories,
} from "@app-factory/kernel";
import type Database from "better-sqlite3";

import { mapReleaseRunUpsertError } from "./release-run-runtime.js";
import { CommandHandlerError } from "./unix-command-server.js";

export type ProtectedReleaseRuntimeDependencies = Readonly<{
  repositories: FactoryRepositories;
  effects: EffectRepository;
  database: Database.Database;
  /**
   * Resolves the immutable source tree OID for the archived run. Injected so offline tests can
   * supply a fixture tree without requiring a live git workspace.
   */
  resolveSourceTree: (run: ReleaseRunV1) => string;
}>;

function deterministicUuid(seed: string): string {
  const digest = createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function parseBundleIdFromResourceKey(resourceKey: string): string {
  const bundleId = resourceKey.split("/")[0];
  if (bundleId === undefined || bundleId.length < 3) {
    throw new CommandHandlerError(
      "release.upload-invalid-approval",
      `approval resourceKey ${resourceKey} does not begin with a bundle ID`,
      false,
    );
  }
  return bundleId;
}

function buildIdentityFromArchivedRun(input: {
  run: ReleaseRunV1;
  sourceTree: string;
  appBundleId: string;
  policyDigest: Sha256Digest;
}): ReleaseIdentityV1 {
  const { run, sourceTree, appBundleId, policyDigest } = input;
  if (run.archive === null) {
    throw new CommandHandlerError(
      "release.upload-not-archived",
      `release run ${run.releaseRunId} has no archive record`,
      false,
    );
  }
  return ReleaseIdentityV1Schema.parse({
    schemaVersion: 1,
    repositoryId: run.repositoryId,
    sourceCommit: run.sourceCommit,
    sourceTree,
    policyDigest,
    projectId: run.projectId,
    releaseId: run.releaseId,
    releaseRunId: run.releaseRunId,
    appBundleId,
    marketingVersion: run.archive.marketingVersion,
    buildNumber: run.archive.buildNumber,
    archiveDigest: run.archive.archiveDigest,
    exportedArtifactDigest: run.archive.exportedArtifactDigest,
    destination: "app-store-connect-internal",
    transportProtocol: "app-factory.fake-apple-upload.v1",
    transportProtocolVersion: 1,
  });
}

function readUploadIntentEffectId(
  database: Database.Database,
  releaseRunId: string,
): string | null {
  const row = database
    .prepare(
      `SELECT effect_id AS effectId FROM release_upload_intents
       WHERE release_run_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(releaseRunId) as Readonly<{ effectId: string }> | undefined;
  return row?.effectId ?? null;
}

/**
 * OR-28 / OR-29: `release.upload` — plan release-scoped effect + intent + consume approval + CAS to
 * `upload-approved`. Does not invoke a provider transport (receipt remains null).
 */
export function executeReleaseUploadCommand(
  dependencies: ProtectedReleaseRuntimeDependencies,
  request: Extract<CommandRequestV1, { operation: "release.upload" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const releaseRunId = ReleaseRunIdSchema.parse(request.payload.releaseRunId);
  const approvalId = ApprovalIdSchema.parse(request.payload.approvalId);
  const head = dependencies.repositories.releaseRuns.get(releaseRunId);
  if (head === null) {
    throw new CommandHandlerError(
      "release-run.not-found",
      `release run ${releaseRunId} does not exist`,
      false,
    );
  }
  if (head.revision !== request.payload.expectedRevision) {
    throw new CommandHandlerError(
      "release-run.revision-conflict",
      `release run ${releaseRunId} is at revision ${String(head.revision)}, expected ${String(request.payload.expectedRevision)}`,
      false,
    );
  }
  if (head.stage !== "archived") {
    throw new CommandHandlerError(
      "release.upload-stage-invalid",
      `release.upload requires stage archived; run is ${head.stage}`,
      false,
    );
  }

  const prior = dependencies.repositories.releaseRuns.findRevisionByCommandId(request.commandId);
  if (prior !== null) {
    const effectId = readUploadIntentEffectId(dependencies.database, releaseRunId);
    return {
      operation: "release.upload",
      run: prior,
      effectId: effectId === null ? null : EffectIdSchema.parse(effectId),
      receipt: null,
    };
  }

  const approval = dependencies.effects.getApproval(approvalId);
  if (approval === null) {
    throw new CommandHandlerError(
      "release.upload-approval-missing",
      `approval ${approvalId} does not exist`,
      false,
    );
  }
  if (approval.approval.action !== "apple.upload-build") {
    throw new CommandHandlerError(
      "release.upload-approval-action",
      `approval ${approvalId} is not an apple.upload-build approval`,
      false,
    );
  }

  const sourceTree = dependencies.resolveSourceTree(head);
  const appBundleId = parseBundleIdFromResourceKey(approval.approval.resourceKey);
  const identity = buildIdentityFromArchivedRun({
    run: head,
    sourceTree,
    appBundleId,
    policyDigest: approval.approval.binding.policyDigest,
  });
  const identityDigest = computeReleaseIdentityDigestV1(identity);
  if (approval.approval.binding.buildIdentityDigest !== identityDigest) {
    throw new CommandHandlerError(
      "release.upload-identity-mismatch",
      "approval buildIdentityDigest does not match the reconstructed protected release identity",
      false,
    );
  }
  if (approval.approval.binding.commit !== head.sourceCommit) {
    throw new CommandHandlerError(
      "release.upload-commit-mismatch",
      "approval commit does not match the release run sourceCommit",
      false,
    );
  }
  // Session-2 offline convention: approval payloadDigest equals the canonical identity digest.
  if (approval.payloadDigest !== identityDigest) {
    throw new CommandHandlerError(
      "release.upload-payload-mismatch",
      "approval payloadDigest does not match the protected release identity digest",
      false,
    );
  }

  const effectId = EffectIdSchema.parse(
    deterministicUuid(`app-factory.release.upload.effect\0${request.commandId}`),
  );
  const intentId = deterministicUuid(`app-factory.release.upload.intent\0${request.commandId}`);
  const authorizedAt = IsoInstantSchema.parse(observedAt);
  const nextRun: ReleaseRunV1 = {
    ...head,
    stage: "upload-approved",
    revision: head.revision + 1,
    updatedAt: authorizedAt,
    notes: [
      ...head.notes,
      `release.upload: planned effect ${effectId} with fake transport identity ${identityDigest}`,
    ].slice(-50),
  };

  try {
    const planned = dependencies.effects.planProtectedReleaseUpload({
      effect: {
        schemaVersion: 1,
        effectId,
        attemptId: null,
        action: "apple.upload-build",
        operationMarker: `app-factory:v1:apple:upload-build:${effectId}`,
        target: {
          provider: "apple",
          resourceType: "apple.build",
          resourceKey: approval.approval.resourceKey,
        },
        subject: {
          projectId: head.projectId,
          taskId: null,
          attemptId: null,
          releaseId: head.releaseId,
        },
        payloadDigest: identityDigest,
        policyDigest: approval.approval.binding.policyDigest,
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
      },
      binding: {
        planDigest: approval.approval.binding.planDigest,
        diffDigest: null,
        commit: head.sourceCommit,
        buildIdentityDigest: identityDigest,
      },
      authorizedAt,
      availableAt: authorizedAt,
      identityDigest,
      intentId,
      releaseRunUpsert: {
        commandId: request.commandId,
        origin: request.origin,
        issuedAt: request.issuedAt,
        recordedAt: authorizedAt,
        run: nextRun,
      },
    });
    return {
      operation: "release.upload",
      run: planned.run,
      effectId: planned.effect.effectId,
      receipt: null,
    };
  } catch (error) {
    if (error instanceof ReleaseRunUpsertError) mapReleaseRunUpsertError(error);
    if (error instanceof Error && error.message.startsWith("Factory external-effect invariant")) {
      throw new CommandHandlerError("release.upload-rejected", error.message, false);
    }
    throw error;
  }
}

/**
 * OR-30: `release.confirm` — observation-only stage advance from a retained upload effect.
 * Never consumes an approval, never creates a second effect, never invokes send.
 */
export function executeReleaseConfirmCommand(
  dependencies: ProtectedReleaseRuntimeDependencies,
  request: Extract<CommandRequestV1, { operation: "release.confirm" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const releaseRunId = ReleaseRunIdSchema.parse(request.payload.releaseRunId);
  const effectId = EffectIdSchema.parse(request.payload.effectId);
  const head = dependencies.repositories.releaseRuns.get(releaseRunId);
  if (head === null) {
    throw new CommandHandlerError(
      "release-run.not-found",
      `release run ${releaseRunId} does not exist`,
      false,
    );
  }
  if (head.revision !== request.payload.expectedRevision) {
    throw new CommandHandlerError(
      "release-run.revision-conflict",
      `release run ${releaseRunId} is at revision ${String(head.revision)}, expected ${String(request.payload.expectedRevision)}`,
      false,
    );
  }

  const prior = dependencies.repositories.releaseRuns.findRevisionByCommandId(request.commandId);
  if (prior !== null) {
    return {
      operation: "release.confirm",
      run: prior,
      effectId,
      confirmation: mapConfirmationFromRun(
        prior,
        dependencies.effects.getEffect(effectId)?.effect.state ?? null,
      ),
    };
  }

  const persisted = dependencies.effects.getEffect(effectId);
  if (persisted === null) {
    throw new CommandHandlerError(
      "release.confirm-effect-missing",
      `effect ${effectId} does not exist`,
      false,
    );
  }
  const intent = dependencies.database
    .prepare(
      `SELECT release_run_id AS releaseRunId FROM release_upload_intents WHERE effect_id = ?`,
    )
    .get(effectId) as Readonly<{ releaseRunId: string }> | undefined;
  if (intent === undefined || intent.releaseRunId !== releaseRunId) {
    throw new CommandHandlerError(
      "release.confirm-intent-mismatch",
      `effect ${effectId} is not bound to release run ${releaseRunId}`,
      false,
    );
  }

  const effectState = persisted.effect.state;
  const confirmation = mapConfirmationFromEffectState(effectState);
  const authorizedAt = IsoInstantSchema.parse(observedAt);
  let next = head;

  if (confirmation === "uploaded" && head.stage === "upload-approved") {
    const resource = dependencies.effects.getExternalResource(effectId);
    next = {
      ...head,
      stage: "uploaded",
      revision: head.revision + 1,
      updatedAt: authorizedAt,
      upload: {
        submittedAt: persisted.effect.updatedAt,
        ascBuildId: resource?.providerResourceId ?? `pending:${effectId}`,
        confirmedAt: null,
      },
      notes: [...head.notes, `release.confirm: observed uploaded via effect ${effectId}`].slice(-50),
    };
  } else if (confirmation === "processing" && head.stage === "uploaded") {
    next = {
      ...head,
      stage: "processing",
      revision: head.revision + 1,
      updatedAt: authorizedAt,
      notes: [...head.notes, `release.confirm: processing via effect ${effectId}`].slice(-50),
    };
  } else if (
    confirmation === "internal-testflight-available" &&
    head.stage === "processing" &&
    head.upload !== null
  ) {
    next = {
      ...head,
      stage: "internal-testflight-available",
      revision: head.revision + 1,
      updatedAt: authorizedAt,
      upload: {
        ...head.upload,
        confirmedAt: authorizedAt,
      },
      notes: [
        ...head.notes,
        `release.confirm: internal TestFlight available via effect ${effectId}`,
      ].slice(-50),
    };
  } else if (
    confirmation === "held" ||
    confirmation === "uncertain" ||
    confirmation === "rejected" ||
    confirmation === "identity-mismatch"
  ) {
    next = {
      ...head,
      revision: head.revision + 1,
      updatedAt: authorizedAt,
      notes: [
        ...head.notes,
        `release.confirm: held (${confirmation}) for effect ${effectId} state=${effectState}`,
      ].slice(-50),
    };
  } else {
    throw new CommandHandlerError(
      "release.confirm-stage-hold",
      `release.confirm cannot advance from ${head.stage} with effect state ${effectState}`,
      false,
    );
  }

  try {
    const upserted = dependencies.repositories.releaseRuns.upsert({
      commandId: request.commandId,
      origin: request.origin,
      issuedAt: request.issuedAt,
      recordedAt: authorizedAt,
      run: next,
    });
    return {
      operation: "release.confirm",
      run: upserted.run,
      effectId,
      confirmation,
    };
  } catch (error) {
    if (error instanceof ReleaseRunUpsertError) mapReleaseRunUpsertError(error);
    throw error;
  }
}

function mapConfirmationFromEffectState(
  state: string,
): Extract<CommandResultV1, { operation: "release.confirm" }>["confirmation"] {
  switch (state) {
    case "confirmed":
    case "observed":
      return "uploaded";
    case "unknown":
      return "uncertain";
    case "rejected":
      return "rejected";
    case "manual-intervention":
      return "identity-mismatch";
    case "planned":
    case "sent":
      return "held";
    default:
      return "held";
  }
}

function mapConfirmationFromRun(
  run: ReleaseRunV1,
  effectState: string | null,
): Extract<CommandResultV1, { operation: "release.confirm" }>["confirmation"] {
  if (run.stage === "internal-testflight-available") return "internal-testflight-available";
  if (run.stage === "processing") return "processing";
  if (run.stage === "uploaded") return "uploaded";
  if (effectState === "unknown") return "uncertain";
  if (effectState === "rejected") return "rejected";
  return "held";
}
