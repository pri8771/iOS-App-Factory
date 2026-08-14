import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnrollmentApplyConvergenceError,
  EnrollmentApplyError,
  EnrollmentApplyFingerprintDriftError,
  applyEnrollmentPlan,
  scanExistingProject,
} from "../src/index.js";

function git(root: string, ...arguments_: readonly string[]): Buffer {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8"));
  return result.stdout;
}

function write(root: string, path: string, content: string | Buffer): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-apply-")));
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Apply Test");
  git(root, "config", "user.email", "apply-test@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

const AUTHORITY = ["# Canonical authority", "factory-rule: authority.version=1", ""].join("\n");

function originalBranchName(root: string): string {
  return git(root, "rev-parse", "--abbrev-ref", "HEAD").toString("utf8").trim();
}

describe("plan-apply executor", () => {
  it("applies manifest declarations, commits on a new branch, and converges on rescan", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    const scan = scanExistingProject({ repositoryRoot });
    const declareProject = scan.plan.actions.find((action) => action.kind === "declare-project");
    const declareExperience = scan.plan.actions.find(
      (action) => action.kind === "declare-experience",
    );
    expect(declareProject).toBeDefined();
    expect(declareExperience).toBeDefined();

    const branch = originalBranchName(repositoryRoot);
    const beforeSha = git(repositoryRoot, "rev-parse", "HEAD").toString("utf8").trim();

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    expect(result.branchName).not.toBeNull();
    expect(result.branchName).not.toBe(branch);
    expect(result.commitSha).not.toBeNull();
    expect(result.appliedActions.map((action) => action.kind).sort()).toEqual(
      ["declare-experience", "declare-project"].sort(),
    );
    expect(result.skippedActions.length).toBeGreaterThan(0);
    expect(
      result.skippedActions.every(
        (skipped) => !["declare-project", "declare-experience"].includes(skipped.kind),
      ),
    ).toBe(true);

    // The original branch must be completely untouched: same SHA, still checked out nowhere
    // near our new branch, and never force-pushed anywhere (this test never pushes at all).
    expect(git(repositoryRoot, "rev-parse", branch).toString("utf8").trim()).toBe(beforeSha);
    const currentBranch = git(repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD")
      .toString("utf8")
      .trim();
    expect(currentBranch).toBe(result.branchName);

    const resolvedCodes = result.resolvedIssueIds.map(
      (issueId) => scan.issues.find((issue) => issue.issueId === issueId)?.code,
    );
    expect(resolvedCodes).toEqual(
      expect.arrayContaining(["factory.no-project-manifest", "factory.no-experience-manifest"]),
    );

    const rescanCodes = result.rescan.issues.map((issue) => issue.code);
    expect(rescanCodes).not.toContain("factory.no-project-manifest");
    expect(rescanCodes).not.toContain("factory.no-experience-manifest");

    // Convergence is real, not just an issueId coincidence: re-scanning independently confirms it.
    const independentRescan = scanExistingProject({ repositoryRoot });
    expect(independentRescan.issues.map((issue) => issue.code)).not.toContain(
      "factory.no-project-manifest",
    );
  });

  it("establishes canonical rule authority and binds a nonconforming adapter to its fresh digest", () => {
    const repositoryRoot = createRepository({
      "CLAUDE.md": ["# Claude adapter", "Some prose, no declarations yet.", ""].join("\n"),
    });
    const scan = scanExistingProject({ repositoryRoot });
    expect(scan.plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["establish-rule-authority", "repair-rule-adapter"]),
    );

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    expect(result.appliedActions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["establish-rule-authority", "repair-rule-adapter"]),
    );
    const rescanCodes = result.rescan.issues.map((issue) => issue.code);
    expect(rescanCodes).not.toContain("rules.no-canonical-authority");
    expect(rescanCodes).not.toContain("rules.adapter-nonconforming");

    const claudeFile = result.rescan.inventory.ruleFiles.find((file) => file.path === "CLAUDE.md");
    expect(claudeFile?.authority.status).toBe("conforming");
    const agentsFile = result.rescan.inventory.ruleFiles.find((file) => file.path === "AGENTS.md");
    expect(agentsFile?.authority.status).toBe("canonical");
    // The adapter must bind to the digest of the AGENTS.md this same apply just wrote, not the
    // (nonexistent) pre-apply digest.
    expect(claudeFile?.authority.canonicalDigest).toBe(agentsFile?.digest);
  });

  it("aborts before any write when the plan's sourceFingerprint has drifted", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    const stalePlan = scanExistingProject({ repositoryRoot }).plan;

    // Mutate the repository after the plan was captured.
    write(repositoryRoot, "Extra.txt", "unexpected drift\n");
    git(repositoryRoot, "add", "-A");
    git(repositoryRoot, "commit", "--quiet", "-m", "drift");

    const branchesBefore = git(repositoryRoot, "branch", "--list").toString("utf8");
    const headBefore = git(repositoryRoot, "rev-parse", "HEAD").toString("utf8").trim();

    expect(() => applyEnrollmentPlan({ plan: stalePlan, repositoryRoot })).toThrow(
      EnrollmentApplyFingerprintDriftError,
    );

    const branchesAfter = git(repositoryRoot, "branch", "--list").toString("utf8");
    expect(branchesAfter).toBe(branchesBefore);
    expect(git(repositoryRoot, "rev-parse", "HEAD").toString("utf8").trim()).toBe(headBefore);
  });

  it("skips and honestly reports actions it cannot safely automate", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    symlinkSync("does-not-exist-target", join(repositoryRoot, "Broken.swift"));
    git(repositoryRoot, "add", "-f", "Broken.swift");
    git(repositoryRoot, "commit", "--quiet", "-m", "add broken symlink");

    const scan = scanExistingProject({ repositoryRoot });
    const safetyAction = scan.plan.actions.find((action) => action.kind === "resolve-path-safety");
    expect(safetyAction).toBeDefined();
    expect(scan.plan.blocked).toBe(true);

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    expect(result.appliedActions.map((action) => action.kind)).toContain("declare-project");
    const skipped = result.skippedActions.find((item) => item.kind === "resolve-path-safety");
    expect(skipped).toBeDefined();
    expect(skipped?.reason).toMatch(/manual enrollment work/u);

    // Honest reporting: the safety issue is still open in the rescan, not silently dropped.
    expect(result.rescan.issues.map((issue) => issue.code)).toContain(
      "safety.symlink-chain-unsafe",
    );
    expect(result.rescan.plan.blocked).toBe(true);
  });

  it("returns a no-op result without creating a branch when nothing is automatable", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    symlinkSync("does-not-exist-target", join(repositoryRoot, "Broken.swift"));
    git(repositoryRoot, "add", "-f", "Broken.swift");
    git(repositoryRoot, "commit", "--quiet", "-m", "add broken symlink");
    write(repositoryRoot, ".app-factory/project.json", '{"schemaVersion":1,"projectId":"x"}\n');
    write(
      repositoryRoot,
      ".app-factory/experience-manifest.json",
      '{"schemaVersion":1,"routes":[],"journeys":[]}\n',
    );
    git(repositoryRoot, "add", "-A");
    git(repositoryRoot, "commit", "--quiet", "-m", "add manifests");

    const branchesBefore = git(repositoryRoot, "branch", "--list").toString("utf8");
    const scan = scanExistingProject({ repositoryRoot });
    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    expect(result.branchName).toBeNull();
    expect(result.commitSha).toBeNull();
    expect(result.appliedActions).toEqual([]);
    expect(result.skippedActions.length).toBeGreaterThan(0);
    expect(git(repositoryRoot, "branch", "--list").toString("utf8")).toBe(branchesBefore);
  });

  it("rejects applying against a dirty working tree", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    const scan = scanExistingProject({ repositoryRoot });
    write(repositoryRoot, "Untracked.txt", "dirty\n");

    expect(() => applyEnrollmentPlan({ plan: scan.plan, repositoryRoot })).toThrow(
      EnrollmentApplyError,
    );
  });

  it("never crashes the process without throwing an EnrollmentApplyError subclass on failure", () => {
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
    const scan = scanExistingProject({ repositoryRoot });
    write(repositoryRoot, "Untracked.txt", "dirty\n");
    try {
      applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnrollmentApplyError);
      expect(error).not.toBeInstanceOf(EnrollmentApplyConvergenceError);
    }
  });
});
