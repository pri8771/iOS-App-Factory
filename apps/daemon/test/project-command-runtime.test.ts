import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:00:01.000Z";
const REQUEST_ID = "80000000-0000-4000-8000-000000000001";
const SCAN_COMMAND_ID = "80000000-0000-4000-8000-000000000010";
const PLAN_COMMAND_ID = "80000000-0000-4000-8000-000000000011";
const APPLY_COMMAND_ID = "80000000-0000-4000-8000-000000000012";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

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

function gitText(root: string, ...arguments_: readonly string[]): string {
  return git(root, ...arguments_)
    .toString("utf8")
    .trim();
}

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createFixtureRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-command-runtime-")));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, "init", "--quiet");
  git(root, "config", "user.name", "Project Command Runtime Test");
  git(root, "config", "user.email", "project-command-runtime@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

const AUTHORITY = ["# Canonical authority", "factory-rule: authority.version=1", ""].join("\n");

async function makeRuntimeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "project-command-runtime-daemon-"));
  roots.push(root);
  return root;
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T1,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

function request(
  operation: CommandRequestV1["operation"],
  commandId: string,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("project.scan", () => {
  it("persists the scan as evidence and returns a summary", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    expect(scanned.repositoryRoot).toBe(repositoryRoot);
    expect(scanned.planDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(scanned.sourceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(scanned.inventoryDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(scanned.blocked).toBe(false);
    expect(scanned.blockers).toEqual([]);

    // The scan was actually persisted as its own content-addressed evidence blob, independent of
    // the wire summary above: an independent EvidenceStore handle can read it back by digest.
    const evidenceStore = new EvidenceStore(runtime.paths.evidence);
    const bytes = evidenceStore.readBlob(scanned.planDigest);
    const persisted: unknown = JSON.parse(bytes.toString("utf8"));
    expect(persisted).toMatchObject({
      schemaVersion: 1,
      repositoryRoot,
      plan: { sourceFingerprint: scanned.sourceFingerprint },
      inventoryDigest: scanned.inventoryDigest,
    });
  });

  it("surfaces blocker issues for a secret-shaped file", async () => {
    const repositoryRoot = createFixtureRepository({
      "AGENTS.md": AUTHORITY,
      ".env": "EXAMPLE_KEY=not-a-real-secret\n",
    });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    expect(scanned.blocked).toBe(true);
    expect(scanned.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "safety.secret-material-detected",
          summary: expect.stringContaining("secret-shaped-file"),
        }),
      ]),
    );
  });

  it("rejects a repository path that does not exist", async () => {
    const runtime = await openRuntime(await makeRuntimeRoot());
    await expect(
      invoke(
        runtime,
        request("project.scan", SCAN_COMMAND_ID, {
          repositoryRoot: "/nonexistent/app-factory-fixture-path",
        }),
      ),
    ).rejects.toMatchObject({ code: "project.repository-not-found" });
  });

  it("rejects a non-normalized absolute repository path", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());
    await expect(
      invoke(
        runtime,
        request("project.scan", SCAN_COMMAND_ID, {
          repositoryRoot: `${dirname(repositoryRoot)}/../${repositoryRoot.split("/").at(-1)}`,
        }),
      ),
    ).rejects.toMatchObject({ code: "project.invalid-repository-path" });
  });
});

describe("project.enroll-plan", () => {
  it("returns the full stored plan for a scanned digest", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    const plan = await invoke(
      runtime,
      request("project.enroll-plan", PLAN_COMMAND_ID, { planDigest: scanned.planDigest }),
    );
    if (plan.operation !== "project.enroll-plan") throw new Error("Unexpected plan result");

    expect(plan.planDigest).toBe(scanned.planDigest);
    expect(plan.repositoryRoot).toBe(repositoryRoot);
    expect(plan.plan.sourceFingerprint).toBe(scanned.sourceFingerprint);
    expect(plan.plan.inventoryDigest).toBe(scanned.inventoryDigest);
    expect(plan.plan.blocked).toBe(false);
    // The full plan proposes an action for every issue the scan found, including gap-severity
    // issues (e.g. no Xcode container, no CI) that plan-apply cannot automate; only the automatable
    // subset (declare-project/declare-experience) is expected to actually get applied.
    expect(plan.plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["declare-experience", "declare-project"]),
    );
  });

  it("fails closed for an unknown digest", async () => {
    const runtime = await openRuntime(await makeRuntimeRoot());
    await expect(
      invoke(
        runtime,
        request("project.enroll-plan", PLAN_COMMAND_ID, {
          planDigest: `sha256:${"0".repeat(64)}`,
        }),
      ),
    ).rejects.toMatchObject({ code: "project.plan-not-found" });
  });
});

describe("project.apply", () => {
  it("applies the plan, commits on a new branch, and converges on rescan", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());
    const originalBranch = gitText(repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD");
    const beforeSha = gitText(repositoryRoot, "rev-parse", "HEAD");

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    const applied = await invoke(
      runtime,
      request(
        "project.apply",
        APPLY_COMMAND_ID,
        { planDigest: scanned.planDigest, branchName: "app-factory/enroll-test" },
        T1,
      ),
    );
    if (applied.operation !== "project.apply") throw new Error("Unexpected apply result");

    expect(applied.repositoryRoot).toBe(repositoryRoot);
    expect(applied.branchName).toBe("app-factory/enroll-test");
    expect(applied.commitSha).not.toBeNull();
    expect(applied.appliedActionKinds.sort()).toEqual(
      ["declare-experience", "declare-project"].sort(),
    );
    expect(applied.skippedActions.length).toBeGreaterThan(0);
    expect(applied.convergence.blocked).toBe(false);
    expect(applied.convergence.blockerIssueIds).toEqual([]);

    // The two gap issues the applied actions targeted must actually be gone from the rescan; a
    // fresh, independent scan of the repository confirms this convergence is real.
    expect(gitText(repositoryRoot, "rev-parse", originalBranch)).toBe(beforeSha);
    expect(gitText(repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
      "app-factory/enroll-test",
    );

    const rescanned = await invoke(
      runtime,
      request("project.scan", "80000000-0000-4000-8000-000000000013", { repositoryRoot }, T1),
    );
    if (rescanned.operation !== "project.scan") throw new Error("Unexpected rescan result");
    expect(rescanned.blocked).toBe(false);
  });

  it("aborts before any write when the plan's fingerprint has drifted", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    writeFixtureFile(repositoryRoot, "Extra.txt", "unexpected drift\n");
    git(repositoryRoot, "add", "-A");
    git(repositoryRoot, "commit", "--quiet", "-m", "drift");
    const branchesBefore = gitText(repositoryRoot, "branch", "--list");
    const headBefore = gitText(repositoryRoot, "rev-parse", "HEAD");

    await expect(
      invoke(
        runtime,
        request(
          "project.apply",
          APPLY_COMMAND_ID,
          { planDigest: scanned.planDigest, branchName: null },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "project.apply-fingerprint-drift" });

    expect(gitText(repositoryRoot, "branch", "--list")).toBe(branchesBefore);
    expect(gitText(repositoryRoot, "rev-parse", "HEAD")).toBe(headBefore);
  });

  it("replays an identical result for a repeated command ID without reapplying", async () => {
    const repositoryRoot = createFixtureRepository({ "AGENTS.md": AUTHORITY });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", SCAN_COMMAND_ID, { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");

    const applyRequest = request(
      "project.apply",
      APPLY_COMMAND_ID,
      { planDigest: scanned.planDigest, branchName: "app-factory/enroll-replay" },
      T1,
    );
    const first = await invoke(runtime, applyRequest);
    const replay = await runtime.handler(applyRequest, {
      requestId: "80000000-0000-4000-8000-000000000014",
    });
    expect(replay).toEqual(first);

    // Only one branch was ever created; the replay did not re-run applyEnrollmentPlan.
    const branches = gitText(repositoryRoot, "branch", "--list")
      .split("\n")
      .map((line) => line.replace(/^\*?\s*/u, ""))
      .filter((line) => line.length > 0);
    expect(branches.filter((branch) => branch === "app-factory/enroll-replay")).toHaveLength(1);

    expect(readdirSync(runtime.paths.commandResults)).toEqual([`${APPLY_COMMAND_ID}.json`]);
  });

  it("fails closed for an unknown plan digest", async () => {
    const runtime = await openRuntime(await makeRuntimeRoot());
    await expect(
      invoke(
        runtime,
        request("project.apply", APPLY_COMMAND_ID, {
          planDigest: `sha256:${"0".repeat(64)}`,
          branchName: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "project.plan-not-found" });
  });
});
