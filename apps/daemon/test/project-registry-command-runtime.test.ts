import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import {
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { scanExistingProject } from "@app-factory/project-sdk";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";
import { registerConvergedSeedV1 } from "../src/project-registry-command-runtime.js";

/**
 * End-to-end tests for Seam (a) of the project-registry task: `project.register`/`project.list`/
 * `project.show`, dispatched through the real `openDaemonCommandRuntime` handler exactly like
 * `project-command-runtime.test.ts` exercises `project.scan`/`project.enroll-plan`/`project.apply`.
 */

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";
const T2 = "2026-08-16T09:00:02.000Z";
const REQUEST_ID = "81000000-0000-4000-8000-000000000001";

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

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createFixtureRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-registry-command-runtime-")));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Project Registry Command Runtime Test");
  git(root, "config", "user.email", "project-registry-command-runtime@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

async function makeRuntimeRoot(): Promise<string> {
  // Real-path resolved: `project.register` seals a real git-workspace Factory mirror under this
  // root, and git-workspace refuses a runtime root reached through a symlink (macOS's tmpdir is
  // itself `/var` -> `/private/var`), exactly like `phase-output-mirror.test.ts`'s own fixtures.
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "project-registry-command-runtime-daemon-")),
  );
  roots.push(root);
  return root;
}

async function openRuntime(root: string): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T1,
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

describe("project.register", () => {
  it("registers a clean repository from a bare path, sealing a real Factory mirror", async () => {
    const repositoryRoot = createFixtureRepository({ "README.md": "# Clean project\n" });
    const runtimeRoot = await makeRuntimeRoot();
    const runtime = await openRuntime(runtimeRoot);

    const registered = await invoke(
      runtime,
      request("project.register", "81000000-0000-4000-8000-000000000010", {
        source: { kind: "path", repositoryRoot },
        displayName: null,
        slug: null,
      }),
    );
    if (registered.operation !== "project.register") throw new Error("Unexpected result");

    expect(registered.created).toBe(true);
    expect(registered.project.sourceRepositoryPath).toBe(repositoryRoot);
    expect(registered.project.repositoryId).toBe(registered.project.projectId);
    expect(registered.project.docsLayout).toEqual({ docsDir: "docs" });
    expect(registered.project.revision).toBe(0);
    expect(registered.secretFindings).toEqual([]);

    // The mirror this call sealed is a real, independently openable Factory mirror.
    const gitWorkspace = new GitWorkspaceManager();
    const mirror = gitWorkspace.openExistingMirror({
      runtimeRoot: join(runtimeRoot, "local-execution", "git"),
      repositoryId: registered.project.repositoryId,
    });
    expect(mirror.mirrorPath).toContain(registered.project.repositoryId);
  });

  it("refuses to register a repository with an unresolved rules.* blocker", async () => {
    const repositoryRoot = createFixtureRepository({
      // An orphan CLAUDE.md with no authority.import/authority.digest binding to a canonical
      // AGENTS.md triggers rules.adapter-nonconforming at BLOCKER severity.
      "CLAUDE.md": "Some ad hoc instructions with no authority binding.\n",
    });
    const runtime = await openRuntime(await makeRuntimeRoot());

    await expect(
      invoke(
        runtime,
        request("project.register", "81000000-0000-4000-8000-000000000011", {
          source: { kind: "path", repositoryRoot },
          displayName: null,
          slug: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "project.register-blocked" });
  });

  it("surfaces secret findings on the result without blocking registration", async () => {
    const repositoryRoot = createFixtureRepository({
      "README.md": "# Project with a secret-shaped file\n",
      ".env": "EXAMPLE_KEY=not-a-real-secret\n",
    });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const registered = await invoke(
      runtime,
      request("project.register", "81000000-0000-4000-8000-000000000012", {
        source: { kind: "path", repositoryRoot },
        displayName: null,
        slug: null,
      }),
    );
    if (registered.operation !== "project.register") throw new Error("Unexpected result");

    expect(registered.created).toBe(true);
    expect(registered.secretFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "safety.secret-material-detected" }),
      ]),
    );
  });

  it("registers from a previously persisted project.scan result", async () => {
    const repositoryRoot = createFixtureRepository({ "README.md": "# Scanned project\n" });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const scanned = await invoke(
      runtime,
      request("project.scan", "81000000-0000-4000-8000-000000000020", { repositoryRoot }),
    );
    if (scanned.operation !== "project.scan") throw new Error("Unexpected scan result");
    expect(scanned.blocked).toBe(false);

    const registered = await invoke(
      runtime,
      request(
        "project.register",
        "81000000-0000-4000-8000-000000000021",
        {
          source: { kind: "scan", planDigest: scanned.planDigest },
          displayName: "Scanned Project",
          slug: null,
        },
        T1,
      ),
    );
    if (registered.operation !== "project.register") throw new Error("Unexpected result");
    expect(registered.created).toBe(true);
    expect(registered.project.displayName).toBe("Scanned Project");
    expect(registered.project.sourceRepositoryPath).toBe(repositoryRoot);
  });

  it("is idempotent: re-registering the same path reuses the identity and does not duplicate", async () => {
    const repositoryRoot = createFixtureRepository({ "README.md": "# Idempotent project\n" });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const first = await invoke(
      runtime,
      request("project.register", "81000000-0000-4000-8000-000000000030", {
        source: { kind: "path", repositoryRoot },
        displayName: null,
        slug: null,
      }),
    );
    if (first.operation !== "project.register") throw new Error("Unexpected result");

    const second = await invoke(
      runtime,
      request(
        "project.register",
        "81000000-0000-4000-8000-000000000031",
        {
          source: { kind: "path", repositoryRoot },
          displayName: null,
          slug: null,
        },
        T1,
      ),
    );
    if (second.operation !== "project.register") throw new Error("Unexpected result");

    expect(second.created).toBe(false);
    expect(second.project.projectId).toBe(first.project.projectId);
    expect(second.project.revision).toBe(0);

    const listed = await invoke(
      runtime,
      request("project.list", "81000000-0000-4000-8000-000000000032", {}, T2),
    );
    if (listed.operation !== "project.list") throw new Error("Unexpected result");
    expect(listed.projects).toHaveLength(1);
  });
});

describe("project.list / project.show", () => {
  it("lists every registered project and shows one by ID", async () => {
    const repositoryRootA = createFixtureRepository({ "README.md": "# Project A\n" });
    const repositoryRootB = createFixtureRepository({ "README.md": "# Project B\n" });
    const runtime = await openRuntime(await makeRuntimeRoot());

    const registeredA = await invoke(
      runtime,
      request("project.register", "81000000-0000-4000-8000-000000000040", {
        source: { kind: "path", repositoryRoot: repositoryRootA },
        displayName: "Project A",
        slug: null,
      }),
    );
    if (registeredA.operation !== "project.register") throw new Error("Unexpected result");
    const registeredB = await invoke(
      runtime,
      request(
        "project.register",
        "81000000-0000-4000-8000-000000000041",
        {
          source: { kind: "path", repositoryRoot: repositoryRootB },
          displayName: "Project B",
          slug: null,
        },
        T1,
      ),
    );
    if (registeredB.operation !== "project.register") throw new Error("Unexpected result");

    const listed = await invoke(
      runtime,
      request("project.list", "81000000-0000-4000-8000-000000000042", {}, T2),
    );
    if (listed.operation !== "project.list") throw new Error("Unexpected result");
    expect(listed.projects.map((project) => project.displayName).sort()).toEqual([
      "Project A",
      "Project B",
    ]);

    const shown = await invoke(
      runtime,
      request(
        "project.show",
        "81000000-0000-4000-8000-000000000043",
        { projectId: registeredA.project.projectId },
        T2,
      ),
    );
    if (shown.operation !== "project.show") throw new Error("Unexpected result");
    expect(shown.project.projectId).toBe(registeredA.project.projectId);
  });

  it("refuses to show an unregistered project", async () => {
    const runtime = await openRuntime(await makeRuntimeRoot());
    await expect(
      invoke(
        runtime,
        request("project.show", "81000000-0000-4000-8000-000000000050", {
          projectId: "81000000-0000-4000-8000-0000000000ff",
        }),
      ),
    ).rejects.toMatchObject({ code: "project.not-found" });
  });
});

describe("registerConvergedSeedV1 (project.seed's registration step)", () => {
  async function makeDependencies(): Promise<{
    dependencies: {
      repositories: FactoryRepositories;
      evidenceStore: EvidenceStore;
      gitWorkspace: GitWorkspaceManager;
      gitRuntimeRoot: string;
    };
    close: () => void;
  }> {
    const root = await makeRuntimeRoot();
    mkdirSync(join(root, "evidence"), { recursive: true, mode: 0o700 });
    const gitRuntimeRoot = join(root, "local-execution", "git");
    mkdirSync(gitRuntimeRoot, { recursive: true, mode: 0o700 });
    const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
    const dependencies = {
      repositories: createFactoryRepositories(database),
      evidenceStore: new EvidenceStore(join(root, "evidence")),
      gitWorkspace: new GitWorkspaceManager(),
      gitRuntimeRoot,
    };
    return { dependencies, close: () => database.close() };
  }

  it("registers a converged, blocker-free scan and returns the real project", async () => {
    const repositoryRoot = createFixtureRepository({ "README.md": "# Seeded, converged\n" });
    const { dependencies, close } = await makeDependencies();
    const scan = scanExistingProject({ repositoryRoot });

    const result = registerConvergedSeedV1(
      dependencies,
      scan,
      { displayName: "Seeded App" },
      T0,
      "system",
    );

    expect(result.registered).toBe(true);
    expect(result.project?.displayName).toBe("Seeded App");
    expect(result.project?.sourceRepositoryPath).toBe(repositoryRoot);
    expect(result.project?.repositoryId).toBe(result.project?.projectId);
    close();
  });

  it("does not throw and reports registered:false when the scan carries a rules.* blocker", async () => {
    const repositoryRoot = createFixtureRepository({
      // Same trigger as "refuses to register a repository with an unresolved rules.* blocker"
      // above: an orphan CLAUDE.md with no authority binding.
      "CLAUDE.md": "Some ad hoc instructions with no authority binding.\n",
    });
    const { dependencies, close } = await makeDependencies();
    const scan = scanExistingProject({ repositoryRoot });

    const result = registerConvergedSeedV1(
      dependencies,
      scan,
      { displayName: "Blocked Seed" },
      T0,
      "system",
    );

    expect(result.registered).toBe(false);
    expect(result.project).toBeNull();
    // Nothing was written to the registry.
    expect(dependencies.repositories.projectRegistry.listAll()).toEqual([]);
    close();
  });
});
