import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
const REGENERATED_AUTHORITY = [
  "# Canonical authority (regenerated)",
  "factory-rule: authority.version=1",
  "factory-rule: review.required=true",
  "",
].join("\n");
const COPILOT_ADAPTER_PATH = ".github/copilot-instructions.md";
const ADAPTER_PROSE = "Project-specific guidance that must survive the rebind.";

function originalBranchName(root: string): string {
  return git(root, "rev-parse", "--abbrev-ref", "HEAD").toString("utf8").trim();
}

function commitAll(root: string, message: string): void {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", message);
}

function readRepositoryFile(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function ruleFileDigest(root: string, path: string): string {
  const digest = scanExistingProject({ repositoryRoot: root }).inventory.ruleFiles.find(
    (file) => file.path === path,
  )?.digest;
  if (digest === undefined) throw new Error(`rule file ${path} not inventoried`);
  return digest;
}

/** Raw lines that name the given binding key, independent of the scanner's own parser. */
function rawBindingLines(content: string, key: "authority.import" | "authority.digest"): string[] {
  return content.split(/\r?\n/u).filter((line) => line.includes(key));
}

/**
 * Root AGENTS.md plus an adapter that was correctly bound to it, after which AGENTS.md is
 * regenerated so the adapter's `authority.digest` goes stale — the shape observed on Hindsight
 * `factory/pilot-1.1` once a compiled policy bundle replaced AGENTS.md and the Copilot adapter
 * (which the compiler does not own) kept naming the pre-bundle digest.
 */
function createRepositoryWithStaleBoundAdapter(
  adapterPath: string,
  bindingLines: (digest: string) => readonly string[],
): Readonly<{ repositoryRoot: string; staleDigest: string; freshDigest: string }> {
  const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY });
  const staleDigest = ruleFileDigest(repositoryRoot, "AGENTS.md");
  write(
    repositoryRoot,
    adapterPath,
    ["# Adapter", "", ...bindingLines(staleDigest), "", ADAPTER_PROSE, ""].join("\n"),
  );
  commitAll(repositoryRoot, "bind adapter");
  write(repositoryRoot, "AGENTS.md", REGENERATED_AUTHORITY);
  commitAll(repositoryRoot, "regenerate authority");
  const freshDigest = ruleFileDigest(repositoryRoot, "AGENTS.md");
  if (freshDigest === staleDigest) throw new Error("fixture did not change the authority digest");
  return { repositoryRoot, staleDigest, freshDigest };
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

  it("rebinds a stale-bound adapter in place with exactly one authority.import/digest pair", () => {
    const { repositoryRoot, staleDigest, freshDigest } = createRepositoryWithStaleBoundAdapter(
      COPILOT_ADAPTER_PATH,
      (digest) => [
        "factory-rule: authority.import=AGENTS.md",
        `factory-rule: authority.digest=${digest}`,
      ],
    );
    const scan = scanExistingProject({ repositoryRoot });
    expect(
      scan.inventory.ruleFiles.find((file) => file.path === COPILOT_ADAPTER_PATH)?.authority.status,
    ).toBe("nonconforming");
    const repairAction = scan.plan.actions.find((action) => action.kind === "repair-rule-adapter");
    expect(repairAction?.targetPath).toBe(COPILOT_ADAPTER_PATH);

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    expect(result.appliedActions.map((action) => action.kind)).toContain("repair-rule-adapter");
    const content = readRepositoryFile(repositoryRoot, COPILOT_ADAPTER_PATH);
    // Exactly one pair, naming the fresh digest, and no trace of the stale one.
    expect(rawBindingLines(content, "authority.import")).toEqual([
      "factory-rule: authority.import=AGENTS.md",
    ]);
    expect(rawBindingLines(content, "authority.digest")).toEqual([
      `factory-rule: authority.digest=${freshDigest}`,
    ]);
    expect(content).not.toContain(staleDigest);
    // Rebound in place (where the stale pair was), not appended after the prose; the prose and
    // heading survive untouched.
    expect(content).toBe(
      [
        "# Adapter",
        "",
        "factory-rule: authority.import=AGENTS.md",
        `factory-rule: authority.digest=${freshDigest}`,
        "",
        ADAPTER_PROSE,
        "",
      ].join("\n"),
    );

    const adapter = result.rescan.inventory.ruleFiles.find(
      (file) => file.path === COPILOT_ADAPTER_PATH,
    );
    expect(adapter?.authority.status).toBe("conforming");
    expect(adapter?.authority.canonicalDigest).toBe(freshDigest);
    expect(adapter?.declarations.filter((item) => item.key === "authority.digest")).toHaveLength(1);
    expect(adapter?.declarations.filter((item) => item.key === "authority.import")).toHaveLength(1);
  });

  it("does not introduce rules.conflicting-declaration when rebinding a stale adapter", () => {
    const { repositoryRoot, freshDigest } = createRepositoryWithStaleBoundAdapter(
      COPILOT_ADAPTER_PATH,
      (digest) => [
        "factory-rule: authority.import=AGENTS.md",
        `factory-rule: authority.digest=${digest}`,
      ],
    );
    const scan = scanExistingProject({ repositoryRoot });
    expect(scan.issues.map((issue) => issue.code)).toContain("rules.adapter-nonconforming");
    expect(scan.issues.map((issue) => issue.code)).not.toContain("rules.conflicting-declaration");

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    const rescanCodes = result.rescan.issues.map((issue) => issue.code);
    expect(rescanCodes).not.toContain("rules.adapter-nonconforming");
    expect(rescanCodes).not.toContain("rules.conflicting-declaration");
    expect(result.rescan.plan.blocked).toBe(false);
    const effectiveDigest = result.rescan.inventory.effectiveRules.find(
      (rule) => rule.scopePath === "." && rule.key === "authority.digest",
    );
    expect(effectiveDigest?.conflict).toBe(false);
    expect(effectiveDigest?.value).toBe(freshDigest);

    // Convergence is real, not an artifact of the apply's own rescan.
    const independentRescan = scanExistingProject({ repositoryRoot });
    expect(independentRescan.issues.map((issue) => issue.code)).not.toContain(
      "rules.conflicting-declaration",
    );
  });

  it("replaces every stale binding spelling and bullet form the scanner accepts, not just the canonical one", () => {
    const { repositoryRoot, staleDigest, freshDigest } = createRepositoryWithStaleBoundAdapter(
      "CLAUDE.md",
      (digest) => [
        "- factory.rule.authority.import=AGENTS.md",
        `* Factory-Rule authority.digest=${digest}`,
        `factory-rule: authority.digest=${digest}`,
      ],
    );
    const scan = scanExistingProject({ repositoryRoot });

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    const content = readRepositoryFile(repositoryRoot, "CLAUDE.md");
    expect(content).not.toContain(staleDigest);
    expect(rawBindingLines(content, "authority.digest")).toEqual([
      `factory-rule: authority.digest=${freshDigest}`,
    ]);
    expect(rawBindingLines(content, "authority.import")).toEqual([
      "factory-rule: authority.import=AGENTS.md",
    ]);
    expect(content).toContain(ADAPTER_PROSE);
    const rescanCodes = result.rescan.issues.map((issue) => issue.code);
    expect(rescanCodes).not.toContain("rules.adapter-nonconforming");
    expect(rescanCodes).not.toContain("rules.conflicting-declaration");
  });

  it("still appends a fresh binding to an adapter that has no prior binding", () => {
    const original = ["# Claude adapter", "", ADAPTER_PROSE, ""].join("\n");
    const repositoryRoot = createRepository({ "AGENTS.md": AUTHORITY, "CLAUDE.md": original });
    const freshDigest = ruleFileDigest(repositoryRoot, "AGENTS.md");
    const scan = scanExistingProject({ repositoryRoot });
    expect(scan.plan.actions.map((action) => action.kind)).toContain("repair-rule-adapter");
    expect(scan.plan.actions.map((action) => action.kind)).not.toContain(
      "establish-rule-authority",
    );

    const result = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });

    const content = readRepositoryFile(repositoryRoot, "CLAUDE.md");
    expect(content).toBe(
      `${original}\nfactory-rule: authority.import=AGENTS.md\nfactory-rule: authority.digest=${freshDigest}\n`,
    );
    expect(rawBindingLines(content, "authority.digest")).toHaveLength(1);
    expect(rawBindingLines(content, "authority.import")).toHaveLength(1);
    const adapter = result.rescan.inventory.ruleFiles.find((file) => file.path === "CLAUDE.md");
    expect(adapter?.authority.status).toBe("conforming");
    const rescanCodes = result.rescan.issues.map((issue) => issue.code);
    expect(rescanCodes).not.toContain("rules.adapter-nonconforming");
    expect(rescanCodes).not.toContain("rules.conflicting-declaration");
  });

  it("fails closed and rolls back when the rescan carries a rules.* blocker the baseline did not", () => {
    // A root AGENTS.md with no machine-checkable declarations is `rules.canonical-unverifiable`,
    // yet an adapter digest-bound to it counts as conforming. Establishing authority rewrites
    // AGENTS.md, so that adapter's binding goes stale on rescan — a *new*
    // `rules.adapter-nonconforming` blocker no plan action targeted. The executor must not hand
    // back a "converged" result with that blocker inside it.
    const repositoryRoot = createRepository({ "AGENTS.md": "# Bare authority, no declarations\n" });
    const bareDigest = ruleFileDigest(repositoryRoot, "AGENTS.md");
    write(
      repositoryRoot,
      "CLAUDE.md",
      [
        "# Claude adapter",
        "factory-rule: authority.import=AGENTS.md",
        `factory-rule: authority.digest=${bareDigest}`,
        "",
      ].join("\n"),
    );
    commitAll(repositoryRoot, "bind adapter to bare authority");

    const scan = scanExistingProject({ repositoryRoot });
    const baselineCodes = scan.issues.map((issue) => issue.code);
    expect(baselineCodes).toContain("rules.canonical-unverifiable");
    expect(baselineCodes).not.toContain("rules.adapter-nonconforming");
    expect(scan.plan.actions.map((action) => action.kind)).toContain("establish-rule-authority");

    const branch = originalBranchName(repositoryRoot);
    const branchesBefore = git(repositoryRoot, "branch", "--list").toString("utf8");
    const headBefore = git(repositoryRoot, "rev-parse", "HEAD").toString("utf8").trim();

    try {
      applyEnrollmentPlan({ plan: scan.plan, repositoryRoot });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnrollmentApplyConvergenceError);
      expect((error as Error).message).toMatch(/rules\.adapter-nonconforming/u);
      expect((error as Error).message).toMatch(/baseline scan did not have/u);
    }

    // Rolled back: no new branch survives, HEAD and the original branch are untouched, and the
    // working tree is clean. (The plan itself is now stale by design — the rollback's checkout
    // rewrites .git/index, which the sourceFingerprint binds to — so it is not re-applied here.)
    expect(git(repositoryRoot, "branch", "--list").toString("utf8")).toBe(branchesBefore);
    expect(originalBranchName(repositoryRoot)).toBe(branch);
    expect(git(repositoryRoot, "rev-parse", "HEAD").toString("utf8").trim()).toBe(headBefore);
    expect(git(repositoryRoot, "status", "--porcelain").toString("utf8")).toBe("");
    expect(readRepositoryFile(repositoryRoot, "AGENTS.md")).toBe(
      "# Bare authority, no declarations\n",
    );
  });
});
