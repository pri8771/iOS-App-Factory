import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PhaseIdSchema, PhaseRunIdSchema, ProjectIdSchema } from "@app-factory/contracts";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import {
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type ProjectRegistryRepository,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPhaseInputsReaderPort,
  createPhaseOutputMirrorPort,
  PhaseOutputMirrorError,
} from "../src/phase-output-mirror.js";

const GIT = "/usr/bin/git";
const PROJECT_ID = ProjectIdSchema.parse("93000000-0000-4000-8000-000000000001");
const PHASE_ID = PhaseIdSchema.parse("research");
const PHASE_RUN_ID = PhaseRunIdSchema.parse("93000000-0000-4000-8000-000000000002");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A fresh Project Registry over a temp SQLite DB, with `projectId` already registered under
 * `docsDir` -- `createPhaseOutputMirrorPort`/`createPhaseInputsReaderPort` (Seam (c) of the
 * project-registry task) resolve a project's docs directory and mirror binding from the registry,
 * not a hardcoded `"docs"`. */
function registryWithProject(
  projectId: string,
  docsDir: "docs" | "Docs" = "docs",
): ProjectRegistryRepository {
  const root = mkdtempSync(join(tmpdir(), "app-factory-phase-output-mirror-registry-"));
  roots.push(root);
  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
  const repositories = createFactoryRepositories(database);
  repositories.projectRegistry.upsert({
    command: {
      schemaVersion: 1,
      commandId: "94000000-0000-4000-8000-000000000001",
      issuedAt: "2026-08-16T09:00:00.000Z",
      origin: "system",
      kind: "project.register",
      register: {
        project: {
          projectId,
          slug: "test-project",
          displayName: "Test Project",
          sourceRepositoryPath: "/tmp/test-project-source",
          repositoryId: projectId,
          standardVersion: null,
          policyLockDigest: null,
          docsLayout: { docsDir },
        },
        expectedRevision: null,
      },
    },
    recordedAt: "2026-08-16T09:00:00.000Z",
  });
  return repositories.projectRegistry;
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-16T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-16T12:00:00Z",
      GIT_COMMITTER_EMAIL: "factory-tests@example.invalid",
      GIT_COMMITTER_NAME: "Factory Tests",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    },
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-phase-output-mirror-")));
  roots.push(root);
  const sourceRoot = join(root, "source");
  mkdirSync(sourceRoot, { recursive: true });
  git(sourceRoot, ["init", "--initial-branch=main"]);
  mkdirSync(join(sourceRoot, "docs"), { recursive: true });
  writeFileSync(join(sourceRoot, "docs", "README.md"), "# Project docs\n");
  git(sourceRoot, ["add", "--all"]);
  git(sourceRoot, ["commit", "-m", "initial"]);

  const gitRuntimeRoot = join(root, "git-runtime");
  new GitWorkspaceManager({ gitExecutable: GIT }).ensureMirror({
    sourceRepositoryPath: sourceRoot,
    runtimeRoot: gitRuntimeRoot,
    repositoryId: PROJECT_ID,
  });
  return { root, gitRuntimeRoot };
}

/** Like {@link fixture}, but with a caller-chosen set of files committed at HEAD -- used by the
 * `Docs/` vs `docs/` (Seam (c)) tests below, which need control over exactly what already exists in
 * the tree before a phase run declares its outputs. */
function fixtureWithFiles(files: Readonly<Record<string, string>>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-phase-output-mirror-")));
  roots.push(root);
  const sourceRoot = join(root, "source");
  mkdirSync(sourceRoot, { recursive: true });
  git(sourceRoot, ["init", "--initial-branch=main"]);
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(sourceRoot, ...path.split("/"));
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }
  git(sourceRoot, ["add", "--all"]);
  git(sourceRoot, ["commit", "-m", "initial"]);

  const gitRuntimeRoot = join(root, "git-runtime");
  new GitWorkspaceManager({ gitExecutable: GIT }).ensureMirror({
    sourceRepositoryPath: sourceRoot,
    runtimeRoot: gitRuntimeRoot,
    repositoryId: PROJECT_ID,
  });
  return { root, gitRuntimeRoot };
}

describe("phase output mirror — commitOutputs", () => {
  it("commits a docs/-scoped output as a broker commit on factory/phase/<phaseId>/<runId>", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });

    const outputs = port.commitOutputs({
      projectId: PROJECT_ID,
      phaseId: PHASE_ID,
      phaseRunId: PHASE_RUN_ID,
      files: [{ path: "docs/product/research.md", content: "content\n" }],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.path).toBe("docs/product/research.md");
    expect(outputs[0]?.evidence.branch).toBe(`factory/phase/${PHASE_ID}/${PHASE_RUN_ID}`);
    expect(outputs[0]?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const branches = git(mirrorPath, ["branch", "--list", "factory/phase/*"]);
    expect(branches).toContain(`factory/phase/${PHASE_ID}/${PHASE_RUN_ID}`);
    const output = outputs[0];
    if (output === undefined) throw new Error("expected one committed output");
    const content = git(mirrorPath, ["show", `${output.evidence.branch}:docs/product/research.md`]);
    expect(content).toBe("content");
  });

  it("rejects a write outside the authorized docs/ scope and commits nothing", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });

    expect(() =>
      port.commitOutputs({
        projectId: PROJECT_ID,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [{ path: "src/escape.ts", content: "export const x = 1;\n" }],
      }),
    ).toThrow(PhaseOutputMirrorError);

    // Nothing was published: no factory/phase/* branch exists in the mirror.
    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const branches = git(mirrorPath, ["branch", "--list", "factory/phase/*"]);
    expect(branches).toBe("");
  });

  it("rejects an output written outside docs/ even when a sibling output is in scope", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });

    expect(() =>
      port.commitOutputs({
        projectId: PROJECT_ID,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [
          { path: "docs/product/research.md", content: "ok\n" },
          { path: "docs/../secrets.env", content: "SECRET=1\n" },
        ],
      }),
    ).toThrow();

    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const branches = git(mirrorPath, ["branch", "--list", "factory/phase/*"]);
    expect(branches).toBe("");
  });

  it("fails closed for a project with no enrolled mirror", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });
    const unenrolledProject = ProjectIdSchema.parse("93000000-0000-4000-8000-0000000000ff");

    expect(() =>
      port.commitOutputs({
        projectId: unenrolledProject,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [{ path: "docs/product/research.md", content: "content\n" }],
      }),
    ).toThrow(PhaseOutputMirrorError);
  });
});

describe("phase inputs reader — readDocsTree / readFile", () => {
  it("reads every file under docs/ at HEAD from the mirror", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseInputsReaderPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });

    const documents = port.readDocsTree(PROJECT_ID);
    expect(documents).toEqual([{ path: "docs/README.md", content: "# Project docs\n" }]);
  });

  it("reads one repo-relative file's raw content", () => {
    const { gitRuntimeRoot } = fixture();
    const port = createPhaseInputsReaderPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });

    expect(port.readFile(PROJECT_ID, "docs/README.md")).toBe("# Project docs\n");
    expect(port.readFile(PROJECT_ID, "docs/does-not-exist.md")).toBeNull();
  });

  it("reports an honestly empty tree for a project with no docs/ directory", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-phase-inputs-empty-")));
    roots.push(root);
    const sourceRoot = join(root, "source");
    mkdirSync(sourceRoot, { recursive: true });
    git(sourceRoot, ["init", "--initial-branch=main"]);
    writeFileSync(join(sourceRoot, "README.md"), "top level only\n");
    git(sourceRoot, ["add", "--all"]);
    git(sourceRoot, ["commit", "-m", "initial"]);
    const gitRuntimeRoot = join(root, "git-runtime");
    new GitWorkspaceManager({ gitExecutable: GIT }).ensureMirror({
      sourceRepositoryPath: sourceRoot,
      runtimeRoot: gitRuntimeRoot,
      repositoryId: PROJECT_ID,
    });

    const port = createPhaseInputsReaderPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });
    expect(port.readDocsTree(PROJECT_ID)).toEqual([]);
  });

  it("skips binary assets under docs/ rather than feeding corrupted bytes into a prompt", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-phase-inputs-binary-")));
    roots.push(root);
    const sourceRoot = join(root, "source");
    mkdirSync(join(sourceRoot, "docs"), { recursive: true });
    git(sourceRoot, ["init", "--initial-branch=main"]);
    writeFileSync(join(sourceRoot, "docs", "research.md"), "# Notes\n");
    // A minimal but genuine PNG file signature, not just an arbitrary byte soup, so this exercises
    // real binary content the way a design-asset commit would.
    writeFileSync(
      join(sourceRoot, "docs", "mockup.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]),
    );
    git(sourceRoot, ["add", "--all"]);
    git(sourceRoot, ["commit", "-m", "initial"]);
    const gitRuntimeRoot = join(root, "git-runtime");
    new GitWorkspaceManager({ gitExecutable: GIT }).ensureMirror({
      sourceRepositoryPath: sourceRoot,
      runtimeRoot: gitRuntimeRoot,
      repositoryId: PROJECT_ID,
    });

    const port = createPhaseInputsReaderPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID),
    });
    const documents = port.readDocsTree(PROJECT_ID);
    expect(documents).toEqual([{ path: "docs/research.md", content: "# Notes\n" }]);
    expect(documents.some((document) => document.path.endsWith(".png"))).toBe(false);
  });
});

describe("Docs/ vs docs/ output scope (Seam (c) of the project-registry task)", () => {
  it("allows a Docs/-scoped output for a project registered with the capitalized docs layout", () => {
    const { gitRuntimeRoot } = fixtureWithFiles({ "README.md": "# Hindsight-style project\n" });
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID, "Docs"),
    });

    const outputs = port.commitOutputs({
      projectId: PROJECT_ID,
      phaseId: PHASE_ID,
      phaseRunId: PHASE_RUN_ID,
      files: [{ path: "Docs/product/research.md", content: "content\n" }],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.path).toBe("Docs/product/research.md");
    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const content = git(mirrorPath, [
      "show",
      `${outputs[0]?.evidence.branch}:Docs/product/research.md`,
    ]);
    expect(content).toBe("content");
  });

  it("rejects a lowercase docs/ output for a project registered with the capitalized Docs layout", () => {
    const { gitRuntimeRoot } = fixtureWithFiles({ "README.md": "# Hindsight-style project\n" });
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID, "Docs"),
    });

    expect(() =>
      port.commitOutputs({
        projectId: PROJECT_ID,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [{ path: "docs/product/research.md", content: "content\n" }],
      }),
    ).toThrow(PhaseOutputMirrorError);
  });

  it("fails closed before writing anything when a declared output case-folds onto an existing different-case tracked path (case-insensitive volume)", () => {
    // The tree already carries a lowercase docs/status.md (e.g. legacy content, or a different
    // phase's earlier commit); the project is registered with the capitalized "Docs" layout and
    // this phase declares Docs/status.md -- Git treats these as two distinct paths, but they
    // case-fold onto exactly the same path on a case-insensitive storage volume.
    const { gitRuntimeRoot } = fixtureWithFiles({ "docs/status.md": "# Old status\n" });
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID, "Docs"),
    });

    expect(() =>
      port.commitOutputs({
        projectId: PROJECT_ID,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [{ path: "Docs/status.md", content: "# New status\n" }],
      }),
    ).toThrow(PhaseOutputMirrorError);

    // Nothing was published: no factory/phase/* branch exists in the mirror.
    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const branches = git(mirrorPath, ["branch", "--list", "factory/phase/*"]);
    expect(branches).toBe("");
  });

  it("reports the REAL committed path when a declared docs/ output resolves onto an existing Docs/ directory (case-insensitive volume)", () => {
    // The phase definition declares the project-agnostic canonical "docs/product/research.md" (per
    // PhaseOutputV1Schema's own lowercase-only convention), but the tree already has "Docs" at the
    // root (Hindsight's own layout) -- on this case-insensitive volume the write physically lands
    // under Docs/, and Git's diff (case-sensitive) reports it there too. The returned
    // PhaseRunOutputV1.path must name where the file REALLY is, so a caller reading it back by that
    // path actually succeeds.
    const { gitRuntimeRoot } = fixtureWithFiles({ "Docs/README.md": "# Existing\n" });
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID, "Docs"),
    });

    const outputs = port.commitOutputs({
      projectId: PROJECT_ID,
      phaseId: PHASE_ID,
      phaseRunId: PHASE_RUN_ID,
      files: [{ path: "docs/product/research.md", content: "content\n" }],
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.path).toBe("Docs/product/research.md");
    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    // The declared (lowercase) path does not resolve in the tree at all -- Git tree lookups are
    // always case-sensitive, regardless of the host filesystem.
    expect(() =>
      git(mirrorPath, ["show", `${outputs[0]?.evidence.branch}:docs/product/research.md`]),
    ).toThrow();
    // Only the REAL, reported path actually reads back.
    const content = git(mirrorPath, [
      "show",
      `${outputs[0]?.evidence.branch}:Docs/product/research.md`,
    ]);
    expect(content).toBe("content");
  });

  it("fails closed when two of a phase's own declared outputs case-fold onto each other", () => {
    const { gitRuntimeRoot } = fixtureWithFiles({ "README.md": "# Fresh project\n" });
    const port = createPhaseOutputMirrorPort({
      gitRuntimeRoot,
      gitExecutable: GIT,
      projectRegistry: registryWithProject(PROJECT_ID, "Docs"),
    });

    expect(() =>
      port.commitOutputs({
        projectId: PROJECT_ID,
        phaseId: PHASE_ID,
        phaseRunId: PHASE_RUN_ID,
        files: [
          { path: "Docs/status.md", content: "one\n" },
          { path: "Docs/Status.md", content: "two\n" },
        ],
      }),
    ).toThrow(PhaseOutputMirrorError);

    const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
    const branches = git(mirrorPath, ["branch", "--list", "factory/phase/*"]);
    expect(branches).toBe("");
  });
});
