import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  EnrollmentApplyResultV1Schema,
  EnrollmentPlanV1Schema,
  RelativeProjectPathSchema,
  type AppliedEnrollmentActionV1,
  type EnrollmentApplyResultV1,
  type EnrollmentPlanV1,
  type RelativeProjectPath,
  type SkippedEnrollmentActionV1,
} from "./model.js";
import { projectDigest, scanExistingProject } from "./scanner.js";

/**
 * Plan-apply executor.
 *
 * The scanner (`scanner.ts`) stays strictly read-only: it never invokes Git in a way that
 * mutates state and never writes to the source repository. This module is the sole place in
 * `@app-factory/project-sdk` that mutates a target repository, and it does so narrowly:
 *
 *   1. Re-validates the plan's `sourceFingerprint` against a *fresh* scan and aborts on drift.
 *   2. Applies only the small, mechanical subset of enrollment actions that can be generated
 *      deterministically from the scanner's own inventory (project/experience manifests,
 *      canonical rule declarations, adapter digest bindings). Everything else — Xcode/Swift
 *      scaffolding, symlink safety, secret material, legacy-layout migration, rule conflicts —
 *      is left for a human and reported as skipped.
 *   3. Applies on a brand-new branch. It never force-pushes, never pushes at all, and never
 *      moves, deletes, or commits onto any branch other than the one it creates.
 *   4. Re-runs `scanExistingProject` after committing to prove convergence: every issue an
 *      applied action targeted must be gone from the rescan, or the apply itself fails closed.
 */

export type ApplyEnrollmentPlanOptions = Readonly<{
  plan: EnrollmentPlanV1;
  repositoryRoot: string;
  /** Defaults to a deterministic name derived from the plan's sourceFingerprint. */
  branchName?: string;
}>;

export class EnrollmentApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentApplyError";
  }
}

/** The target repository no longer matches the source state the plan was built against. */
export class EnrollmentApplyFingerprintDriftError extends EnrollmentApplyError {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentApplyFingerprintDriftError";
  }
}

/** An applied action's targeted issue was still present after the post-apply rescan. */
export class EnrollmentApplyConvergenceError extends EnrollmentApplyError {
  constructor(message: string) {
    super(message);
    this.name = "EnrollmentApplyConvergenceError";
  }
}

type PlanAction = EnrollmentPlanV1["actions"][number];
type ActionKind = PlanAction["kind"];

/**
 * The only action kinds this executor knows how to generate deterministically and safely.
 * Everything else (Xcode/Swift scaffolding, symlink safety, secret material, legacy-layout
 * migration, rule conflicts) requires human judgment and is always skipped and reported.
 */
const AUTOMATABLE_ACTION_KINDS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  "declare-project",
  "repair-project-manifest",
  "declare-experience",
  "repair-experience-manifest",
  "establish-rule-authority",
  "repair-rule-adapter",
]);

const PROJECT_MANIFEST_PATH = RelativeProjectPathSchema.parse(".app-factory/project.json");
const EXPERIENCE_MANIFEST_PATH = RelativeProjectPathSchema.parse(
  ".app-factory/experience-manifest.json",
);
const CANONICAL_AUTHORITY_PATH = RelativeProjectPathSchema.parse("AGENTS.md");
const CANONICAL_AUTHORITY_BLOCK = [
  "# App Factory canonical authority",
  "",
  "factory-rule: authority.version=1",
  "",
].join("\n");

function applyGitEnvironment(): NodeJS.ProcessEnv {
  return {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
  };
}

function runGitRaw(
  repositoryRoot: string,
  arguments_: readonly string[],
  allowedStatuses: readonly number[],
): Readonly<{ status: number; stdout: Buffer; stderr: Buffer }> {
  // Hooks are never invoked: the target repository is arbitrary and possibly untrusted, and the
  // scanner's own safety model never invokes scripts, hooks, or third-party tooling either.
  const result = spawnSync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-C", repositoryRoot, ...arguments_],
    {
      encoding: null,
      env: applyGitEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
      timeout: 30_000,
    },
  );
  if (result.error !== undefined) {
    throw new EnrollmentApplyError(`git invocation failed: ${result.error.message}`);
  }
  const status = result.status ?? -1;
  if (!allowedStatuses.includes(status)) {
    const stderr = result.stderr.toString("utf8").trim().slice(0, 2_000);
    throw new EnrollmentApplyError(
      `git ${arguments_[0] ?? ""} failed with status ${String(status)}${stderr === "" ? "" : `: ${stderr}`}`,
    );
  }
  return { status, stdout: result.stdout, stderr: result.stderr };
}

function runGit(repositoryRoot: string, arguments_: readonly string[]): Buffer {
  return runGitRaw(repositoryRoot, arguments_, [0]).stdout;
}

function runGitText(repositoryRoot: string, arguments_: readonly string[]): string {
  return runGit(repositoryRoot, arguments_).toString("utf8").trim();
}

function branchExists(repositoryRoot: string, branchName: string): boolean {
  return (
    runGitRaw(
      repositoryRoot,
      ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      [0, 1],
    ).status === 0
  );
}

function currentBranchName(repositoryRoot: string): string | null {
  const result = runGitRaw(repositoryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]);
  const name = result.stdout.toString("utf8").trim();
  return result.status === 0 && name !== "" ? name : null;
}

function defaultBranchName(sourceFingerprint: string): string {
  const short = sourceFingerprint.replace(/^sha256:/u, "").slice(0, 12);
  return `app-factory/enroll-${short}`;
}

function repositoryFilePath(repositoryRoot: string, relativePath: RelativeProjectPath): string {
  return join(repositoryRoot, ...relativePath.split("/"));
}

function readRepositoryFileIfExists(
  repositoryRoot: string,
  relativePath: RelativeProjectPath,
): string | null {
  try {
    return readFileSync(repositoryFilePath(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function writeRepositoryFile(
  repositoryRoot: string,
  relativePath: RelativeProjectPath,
  content: string,
): void {
  const fullPath = repositoryFilePath(repositoryRoot, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

/** Deep, key-sorted JSON pretty-printer so generated manifests are deterministic and readable. */
function sortedJsonStringify(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function parseJsonObjectOrEmpty(content: string | null): Readonly<Record<string, unknown>> {
  if (content === null) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : {};
  } catch {
    return {};
  }
}

function slugFromRepositoryRoot(repositoryRoot: string): string {
  const slug = basename(repositoryRoot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug === "" ? "app" : slug;
}

function buildProjectManifestContent(repositoryRoot: string, existing: string | null): string {
  const base = parseJsonObjectOrEmpty(existing);
  const projectId =
    typeof base.projectId === "string" && base.projectId !== ""
      ? base.projectId
      : slugFromRepositoryRoot(repositoryRoot);
  return sortedJsonStringify({ ...base, schemaVersion: 1, projectId });
}

function buildExperienceManifestContent(existing: string | null): string {
  const base = parseJsonObjectOrEmpty(existing);
  const routes = Array.isArray(base.routes) ? base.routes : [];
  const journeys = Array.isArray(base.journeys) ? base.journeys : [];
  return sortedJsonStringify({ ...base, schemaVersion: 1, routes, journeys });
}

function appendBlock(existing: string | null, block: string): string {
  if (existing === null || existing.trim() === "") return block;
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}`;
}

function buildAdapterBindingBlock(canonicalPath: string, canonicalDigest: string): string {
  return [
    `factory-rule: authority.import=${canonicalPath}`,
    `factory-rule: authority.digest=${canonicalDigest}`,
    "",
  ].join("\n");
}

function buildCommitMessage(
  plan: EnrollmentPlanV1,
  appliedActions: readonly AppliedEnrollmentActionV1[],
): string {
  const kinds = [...new Set(appliedActions.map((action) => action.kind))].sort();
  return [
    `app-factory: apply enrollment plan (${String(appliedActions.length)} action${appliedActions.length === 1 ? "" : "s"})`,
    "",
    ...kinds.map((kind) => `- ${kind}`),
    "",
    `Source-Fingerprint: ${plan.sourceFingerprint}`,
  ].join("\n");
}

function skipReasonFor(kind: ActionKind): string {
  return `action kind '${kind}' requires manual enrollment work outside the automated plan-apply executor`;
}

/**
 * Applies the subset of an `EnrollmentPlanV1`'s actions that can be generated deterministically
 * and safely, on a new branch in the target repository, then re-scans to prove convergence.
 *
 * Aborts before any write if a fresh scan's `sourceFingerprint` no longer matches the plan
 * (stale plan / repository drift), or if the target repository has uncommitted changes.
 */
export function applyEnrollmentPlan(options: ApplyEnrollmentPlanOptions): EnrollmentApplyResultV1 {
  const plan = EnrollmentPlanV1Schema.parse(options.plan);
  const repositoryRoot = options.repositoryRoot;

  const baseline = scanExistingProject({ repositoryRoot });
  if (baseline.plan.sourceFingerprint !== plan.sourceFingerprint) {
    throw new EnrollmentApplyFingerprintDriftError(
      "the enrollment plan's sourceFingerprint no longer matches a fresh scan of the target " +
        "repository; the plan is stale and must not be applied",
    );
  }
  // Defense in depth: the plan is a pure deterministic function of the validated source state,
  // so a fresh scan should reproduce it exactly even though the literal fingerprint matched.
  if (projectDigest(baseline.plan) !== projectDigest(plan)) {
    throw new EnrollmentApplyFingerprintDriftError(
      "the enrollment plan does not match the plan a fresh scan of the target repository " +
        "produces even though its sourceFingerprint matched; refusing to apply",
    );
  }
  if (baseline.before.dirty) {
    throw new EnrollmentApplyError(
      "the target repository has uncommitted changes; plan-apply requires a clean working tree",
    );
  }

  const issuesById = new Map(baseline.issues.map((issue) => [issue.issueId, issue]));
  const applicable: PlanAction[] = [];
  const skipped: SkippedEnrollmentActionV1[] = [];
  for (const action of plan.actions) {
    if (AUTOMATABLE_ACTION_KINDS.has(action.kind)) {
      applicable.push(action);
    } else {
      skipped.push({
        actionId: action.actionId,
        kind: action.kind,
        targetPath: action.targetPath,
        reason: skipReasonFor(action.kind),
      });
    }
  }

  if (applicable.length === 0) {
    return EnrollmentApplyResultV1Schema.parse({
      schemaVersion: 1,
      repositoryRoot,
      baseHeadSha: baseline.after.headSha,
      branchName: null,
      commitSha: null,
      appliedActions: [],
      skippedActions: skipped,
      resolvedIssueIds: [],
      rescan: baseline,
    });
  }

  const originalRef = currentBranchName(repositoryRoot);
  const baseHeadSha = baseline.after.headSha;
  const branchName = options.branchName ?? defaultBranchName(plan.sourceFingerprint);
  if (branchExists(repositoryRoot, branchName)) {
    throw new EnrollmentApplyError(
      `refusing to reuse or overwrite existing branch '${branchName}'`,
    );
  }

  let branchCreated = false;
  try {
    runGit(repositoryRoot, ["checkout", "-b", branchName]);
    branchCreated = true;

    const appliedActions: AppliedEnrollmentActionV1[] = [];
    const writtenPaths = new Set<RelativeProjectPath>();

    for (const action of applicable) {
      if (action.kind !== "declare-project" && action.kind !== "repair-project-manifest") continue;
      const targetPath = action.targetPath ?? PROJECT_MANIFEST_PATH;
      const existing = readRepositoryFileIfExists(repositoryRoot, targetPath);
      writeRepositoryFile(
        repositoryRoot,
        targetPath,
        buildProjectManifestContent(repositoryRoot, existing),
      );
      writtenPaths.add(targetPath);
      appliedActions.push({
        actionId: action.actionId,
        kind: action.kind,
        targetPath,
        writtenPaths: [targetPath],
      });
    }

    for (const action of applicable) {
      if (action.kind !== "declare-experience" && action.kind !== "repair-experience-manifest") {
        continue;
      }
      const targetPath = action.targetPath ?? EXPERIENCE_MANIFEST_PATH;
      const existing = readRepositoryFileIfExists(repositoryRoot, targetPath);
      writeRepositoryFile(repositoryRoot, targetPath, buildExperienceManifestContent(existing));
      writtenPaths.add(targetPath);
      appliedActions.push({
        actionId: action.actionId,
        kind: action.kind,
        targetPath,
        writtenPaths: [targetPath],
      });
    }

    let establishedAuthority = false;
    const establishAction = applicable.find((action) => action.kind === "establish-rule-authority");
    if (establishAction !== undefined) {
      const targetPath = establishAction.targetPath ?? CANONICAL_AUTHORITY_PATH;
      const existing = readRepositoryFileIfExists(repositoryRoot, targetPath);
      writeRepositoryFile(
        repositoryRoot,
        targetPath,
        appendBlock(existing, CANONICAL_AUTHORITY_BLOCK),
      );
      writtenPaths.add(targetPath);
      establishedAuthority = true;
      appliedActions.push({
        actionId: establishAction.actionId,
        kind: establishAction.kind,
        targetPath,
        writtenPaths: [targetPath],
      });
    }

    const adapterActions = applicable.filter((action) => action.kind === "repair-rule-adapter");
    if (adapterActions.length > 0) {
      // Establishing root authority above can change AGENTS.md's digest, which every adapter
      // binding must reference. Re-scan the (uncommitted) working tree so the scanner's own
      // scope-aware authority resolution — not a reimplementation of it here — supplies the
      // correct canonical path/digest for every affected adapter.
      const authorityRuleFiles = establishedAuthority
        ? scanExistingProject({ repositoryRoot }).inventory.ruleFiles
        : baseline.inventory.ruleFiles;
      const ruleFileByPath = new Map(authorityRuleFiles.map((file) => [file.path, file]));

      for (const action of adapterActions) {
        const issue = issuesById.get(action.resolvesIssueIds[0] ?? "");
        const affectedPaths: readonly RelativeProjectPath[] =
          issue?.paths ?? (action.targetPath !== null ? [action.targetPath] : []);
        const fixedPaths: RelativeProjectPath[] = [];
        for (const affectedPath of affectedPaths) {
          const ruleFile = ruleFileByPath.get(affectedPath);
          const canonicalPath = ruleFile?.authority.canonicalPath ?? null;
          const canonicalDigest = ruleFile?.authority.canonicalDigest ?? null;
          if (canonicalPath === null || canonicalDigest === null) continue;
          const existing = readRepositoryFileIfExists(repositoryRoot, affectedPath);
          writeRepositoryFile(
            repositoryRoot,
            affectedPath,
            appendBlock(existing, buildAdapterBindingBlock(canonicalPath, canonicalDigest)),
          );
          writtenPaths.add(affectedPath);
          fixedPaths.push(affectedPath);
        }
        if (fixedPaths.length > 0 && fixedPaths.length === affectedPaths.length) {
          appliedActions.push({
            actionId: action.actionId,
            kind: action.kind,
            targetPath: action.targetPath,
            writtenPaths: fixedPaths,
          });
        } else {
          skipped.push({
            actionId: action.actionId,
            kind: action.kind,
            targetPath: action.targetPath,
            reason:
              fixedPaths.length === 0
                ? "no canonical rule authority could be resolved for the affected adapter file(s)"
                : "only some affected adapter files could be bound to a canonical rule authority",
          });
        }
      }
    }

    if (writtenPaths.size === 0) {
      throw new EnrollmentApplyError("no file changes were produced by the applicable actions");
    }

    const relativePaths = [...writtenPaths].sort();
    runGit(repositoryRoot, ["add", "--", ...relativePaths]);
    const stagedPaths = runGitText(repositoryRoot, ["diff", "--cached", "--name-only", "-z"])
      .split("\0")
      .filter((value) => value !== "");
    const expected = new Set(relativePaths);
    const staged = new Set(stagedPaths);
    if (staged.size !== expected.size || relativePaths.some((path) => !staged.has(path))) {
      throw new EnrollmentApplyError(
        "staged changes do not exactly match the intended plan-apply writes",
      );
    }

    runGit(repositoryRoot, [
      "-c",
      "user.name=app-factory-enrollment-apply",
      "-c",
      "user.email=enrollment-apply@app-factory.invalid",
      "commit",
      "--no-verify",
      "-m",
      buildCommitMessage(plan, appliedActions),
    ]);
    const commitSha = runGitText(repositoryRoot, ["rev-parse", "HEAD"]);

    const rescan = scanExistingProject({ repositoryRoot });
    const resolvedIssueIds = appliedActions.flatMap((applied) => {
      const original = plan.actions.find((candidate) => candidate.actionId === applied.actionId);
      return original?.resolvesIssueIds ?? [];
    });
    const rescanIssueIds = new Set(rescan.issues.map((issue) => issue.issueId));
    const stillOpen = resolvedIssueIds.filter((issueId) => rescanIssueIds.has(issueId));
    if (stillOpen.length > 0) {
      throw new EnrollmentApplyConvergenceError(
        `applied actions did not resolve their targeted issues on rescan: ${stillOpen.join(", ")}`,
      );
    }

    return EnrollmentApplyResultV1Schema.parse({
      schemaVersion: 1,
      repositoryRoot,
      baseHeadSha,
      branchName,
      commitSha,
      appliedActions,
      skippedActions: skipped,
      resolvedIssueIds,
      rescan,
    });
  } catch (error) {
    if (branchCreated) {
      try {
        runGitRaw(repositoryRoot, ["checkout", originalRef ?? baseHeadSha], [0]);
        runGitRaw(repositoryRoot, ["branch", "-D", branchName], [0]);
      } catch {
        // Best-effort rollback only; the original failure is what must surface.
      }
    }
    throw error;
  }
}
