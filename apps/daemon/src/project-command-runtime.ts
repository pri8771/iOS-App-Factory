import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AbsolutePathSchema,
  GitBranchNameSchema,
  GitObjectIdSchema,
  NamespacedCodeSchema,
  RelativePathSchema,
  Sha256DigestSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type EnrollmentBlockerV1,
  type EnrollmentPlanActionV1,
  type EnrollmentSkippedActionV1,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import { canonicalJson } from "@app-factory/kernel";
import {
  EnrollmentApplyConvergenceError,
  EnrollmentApplyError,
  EnrollmentApplyFingerprintDriftError,
  EnrollmentPreservationError,
  EnrollmentScanError,
  EnrollmentScanV1Schema,
  applyEnrollmentPlan,
  scanExistingProject,
  type EnrollmentScanV1,
} from "@app-factory/project-sdk";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `project.*` command handlers.
 *
 * `@app-factory/project-sdk` owns scanning and applying enrollment plans; this module is the
 * daemon-side bridge that persists its results as evidence and translates its typed errors into
 * distinct daemon error codes, mirroring how `evidence-command-runtime.ts` bridges the evidence
 * store. `project.scan` persists the full `EnrollmentScanV1` (canonical JSON, so its evidence-store
 * digest is deterministic) as ONE content-addressed blob; that blob's digest — not project-sdk's
 * own narrower internal plan-only digest — is the `planDigest` the wire protocol hands back and
 * later accepts, because it is the only identifier that also carries `repositoryRoot`, which
 * `project.enroll-plan` and `project.apply` both need and which the CLI does not ask the operator
 * to repeat.
 */

export type ProjectScanCommandRequestV1 = Extract<CommandRequestV1, { operation: "project.scan" }>;
export type ProjectEnrollPlanCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "project.enroll-plan" }
>;
export type ProjectApplyCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "project.apply" }
>;
export type ProjectCommandRequestV1 =
  ProjectScanCommandRequestV1 | ProjectEnrollPlanCommandRequestV1 | ProjectApplyCommandRequestV1;

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

export async function assertRepositoryPathIsUsable(repositoryRoot: string): Promise<void> {
  if (resolve(repositoryRoot) !== repositoryRoot) {
    throw new CommandHandlerError(
      "project.invalid-repository-path",
      "The repository path must be an absolute, normalized path (no trailing slash or '.'/'..' segments).",
      false,
    );
  }
  let stats;
  try {
    stats = await lstat(repositoryRoot);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new CommandHandlerError(
        "project.repository-not-found",
        `No directory exists at ${repositoryRoot}.`,
        false,
      );
    }
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new CommandHandlerError(
      "project.repository-not-found",
      `${repositoryRoot} is not a real directory.`,
      false,
    );
  }
}

function blockersOf(scan: EnrollmentScanV1): EnrollmentBlockerV1[] {
  const blockerIssueIds = new Set(scan.plan.blockerIssueIds);
  return scan.issues
    .filter((issue) => blockerIssueIds.has(issue.issueId))
    .map((issue) => ({
      issueId: issue.issueId,
      code: NamespacedCodeSchema.parse(issue.code),
      summary: issue.summary,
    }));
}

function toWirePlanAction(
  action: EnrollmentScanV1["plan"]["actions"][number],
): EnrollmentPlanActionV1 {
  return {
    actionId: action.actionId,
    phase: action.phase,
    kind: action.kind,
    targetPath: action.targetPath === null ? null : RelativePathSchema.parse(action.targetPath),
    reason: action.reason,
    resolvesIssueIds: action.resolvesIssueIds,
  };
}

function readPersistedScan(evidenceStore: EvidenceStore, planDigest: string): EnrollmentScanV1 {
  let bytes: Buffer;
  try {
    bytes = evidenceStore.readBlob(planDigest);
  } catch {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `No persisted enrollment plan exists for digest ${planDigest}.`,
      false,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `The persisted evidence for digest ${planDigest} is not valid JSON.`,
      false,
    );
  }
  const result = EnrollmentScanV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `The persisted evidence for digest ${planDigest} is not a valid enrollment scan.`,
      false,
    );
  }
  return result.data;
}

export async function executeProjectScanCommand(
  evidenceStore: EvidenceStore,
  request: ProjectScanCommandRequestV1,
): Promise<CommandResultV1> {
  const repositoryRoot = request.payload.repositoryRoot;
  await assertRepositoryPathIsUsable(repositoryRoot);

  let scan: EnrollmentScanV1;
  try {
    scan = scanExistingProject({ repositoryRoot });
  } catch (error) {
    if (error instanceof EnrollmentPreservationError) {
      throw new CommandHandlerError("project.scan-preservation-violated", error.message, false);
    }
    if (error instanceof EnrollmentScanError) {
      throw new CommandHandlerError("project.scan-failed", error.message, false);
    }
    throw error;
  }

  const planDigest = evidenceStore.putBlob(Buffer.from(canonicalJson(scan), "utf8"));

  return {
    operation: "project.scan",
    repositoryRoot,
    planDigest,
    sourceFingerprint: Sha256DigestSchema.parse(scan.plan.sourceFingerprint),
    inventoryDigest: Sha256DigestSchema.parse(scan.inventoryDigest),
    blocked: scan.plan.blocked,
    blockers: blockersOf(scan),
  };
}

export function executeProjectEnrollPlanCommand(
  evidenceStore: EvidenceStore,
  request: ProjectEnrollPlanCommandRequestV1,
): CommandResultV1 {
  const scan = readPersistedScan(evidenceStore, request.payload.planDigest);
  return {
    operation: "project.enroll-plan",
    planDigest: request.payload.planDigest,
    repositoryRoot: AbsolutePathSchema.parse(scan.repositoryRoot),
    plan: {
      schemaVersion: scan.plan.schemaVersion,
      mode: scan.plan.mode,
      requiresSourceRevalidation: scan.plan.requiresSourceRevalidation,
      sourceFingerprint: Sha256DigestSchema.parse(scan.plan.sourceFingerprint),
      inventoryDigest: Sha256DigestSchema.parse(scan.plan.inventoryDigest),
      blocked: scan.plan.blocked,
      blockerIssueIds: scan.plan.blockerIssueIds,
      actions: scan.plan.actions.map(toWirePlanAction),
    },
  };
}

export function executeProjectApplyCommand(
  evidenceStore: EvidenceStore,
  request: ProjectApplyCommandRequestV1,
): CommandResultV1 {
  const scan = readPersistedScan(evidenceStore, request.payload.planDigest);
  const branchNameOption = request.payload.branchName;

  let result;
  try {
    result = applyEnrollmentPlan({
      plan: scan.plan,
      repositoryRoot: scan.repositoryRoot,
      ...(branchNameOption === null ? {} : { branchName: branchNameOption }),
    });
  } catch (error) {
    if (error instanceof EnrollmentApplyFingerprintDriftError) {
      throw new CommandHandlerError("project.apply-fingerprint-drift", error.message, false);
    }
    if (error instanceof EnrollmentApplyConvergenceError) {
      throw new CommandHandlerError("project.apply-convergence-failed", error.message, false);
    }
    if (error instanceof EnrollmentApplyError) {
      throw new CommandHandlerError("project.apply-failed", error.message, false);
    }
    throw error;
  }

  // Persist the full apply result (including its post-apply rescan) as its own evidence blob so
  // the exact convergence proof outlives the wire summary handed back below.
  evidenceStore.putBlob(Buffer.from(canonicalJson(result), "utf8"));

  const skippedActions: EnrollmentSkippedActionV1[] = result.skippedActions.map((action) => ({
    actionId: action.actionId,
    kind: action.kind,
    targetPath: action.targetPath === null ? null : RelativePathSchema.parse(action.targetPath),
    reason: action.reason,
  }));

  return {
    operation: "project.apply",
    repositoryRoot: AbsolutePathSchema.parse(result.repositoryRoot),
    baseHeadSha: GitObjectIdSchema.parse(result.baseHeadSha),
    branchName: result.branchName === null ? null : GitBranchNameSchema.parse(result.branchName),
    commitSha: result.commitSha === null ? null : GitObjectIdSchema.parse(result.commitSha),
    appliedActionKinds: [...new Set(result.appliedActions.map((action) => action.kind))].sort(),
    resolvedIssueIds: result.resolvedIssueIds,
    skippedActions,
    convergence: {
      blocked: result.rescan.plan.blocked,
      blockerIssueIds: result.rescan.plan.blockerIssueIds,
      openIssueCount: result.rescan.issues.length,
      sourceFingerprint: Sha256DigestSchema.parse(result.rescan.plan.sourceFingerprint),
    },
  };
}
