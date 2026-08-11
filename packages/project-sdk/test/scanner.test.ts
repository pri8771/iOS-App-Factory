import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnrollmentPreservationError,
  EnrollmentScanError,
  EnrollmentScanV1Schema,
  RelativeProjectPathSchema,
  projectDigest,
  scanExistingProject,
} from "../src/index.js";

const AUTHORITY = [
  "# Canonical authority",
  "factory-rule: authority.version=1",
  "factory-rule: release.branch=main",
  "",
].join("\n");
const AUTHORITY_DIGEST = `sha256:${createHash("sha256").update(AUTHORITY).digest("hex")}`;

function conformingAdapter(additionalRule = ""): string {
  return [
    "# Tool adapter",
    "factory-rule: authority.import=AGENTS.md",
    `factory-rule: authority.digest=${AUTHORITY_DIGEST}`,
    additionalRule,
    "",
  ].join("\n");
}

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

function initializeRepository(repositoryRoot: string): void {
  git(repositoryRoot, "init", "--quiet");
  git(repositoryRoot, "config", "user.name", "Project SDK Test");
  git(repositoryRoot, "config", "user.email", "project-sdk@example.invalid");
}

function commitAll(repositoryRoot: string, message = "fixture"): void {
  git(repositoryRoot, "add", "-A");
  git(repositoryRoot, "commit", "--quiet", "-m", message);
}

function createCompleteProject(
  overrides: Readonly<Record<string, string>> = {},
): Readonly<{ repositoryRoot: string; sandboxRoot: string }> {
  const sandboxRoot = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-")));
  const repositoryRoot = join(sandboxRoot, "ExampleApp");
  mkdirSync(repositoryRoot);
  const files: Record<string, string> = {
    "AGENTS.md": AUTHORITY,
    "CLAUDE.md": conformingAdapter("factory-rule: release.branch=main"),
    ".cursor/rules/factory.mdc": conformingAdapter("factory-rule: testflight.branch=testflight"),
    "ExampleApp.xcodeproj/project.pbxproj": [
      "// !$*UTF8*$!",
      "{",
      "  objects = {};",
      "  rootObject = ABCDEF;",
      "}",
      "",
    ].join("\n"),
    "ExampleApp.xcodeproj/xcshareddata/xcschemes/ExampleApp.xcscheme":
      '<?xml version="1.0"?><Scheme version="1.7"></Scheme>',
    "ExampleApp.xcworkspace/contents.xcworkspacedata":
      '<?xml version="1.0"?><Workspace version="1.0"></Workspace>',
    "ExampleApp.xcworkspace/xcshareddata/xcschemes/ExampleWorkspace.xcscheme":
      '<?xml version="1.0"?><Scheme version="1.7"></Scheme>',
    "Sources/App.swift": "public struct AppFeature {}\n",
    "ExampleAppTests/AppTests.swift": "import XCTest\nfinal class AppTests: XCTestCase {}\n",
    "ExampleAppUITests/AppUITests.swift": "import XCTest\nfinal class AppUITests: XCTestCase {}\n",
    "Package.swift": "// swift-tools-version: 6.0\n",
    ".github/workflows/verify.yml": "name: verify\non: [push]\njobs: {}\n",
    ".app-factory/project.json": '{"schemaVersion":1,"projectId":"example-app","platform":"ios"}\n',
    ".app-factory/experience-manifest.json": '{"schemaVersion":1,"routes":[],"journeys":[]}\n',
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) write(repositoryRoot, path, content);
  initializeRepository(repositoryRoot);
  commitAll(repositoryRoot);
  return { repositoryRoot: realpathSync(repositoryRoot), sandboxRoot };
}

function createMinimalRepository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-minimal-")));
  write(root, "AGENTS.md", AUTHORITY);
  initializeRepository(root);
  commitAll(root);
  return root;
}

function porcelain(root: string): Buffer {
  return git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
}

describe("read-only existing-project enrollment", () => {
  it("verifies a complete clean project and emits a stable no-op plan", () => {
    const { repositoryRoot } = createCompleteProject();
    const first = scanExistingProject({ repositoryRoot });
    const second = scanExistingProject({ repositoryRoot });

    expect(EnrollmentScanV1Schema.parse(first)).toEqual(first);
    expect(first.before).toEqual(first.after);
    expect(first.preservation).toEqual({
      headUnchanged: true,
      statusUnchanged: true,
      scanSurfaceUnchanged: true,
      gitAdminUnchanged: true,
    });
    expect(first.inventory.xcodeContainers.map((item) => item.validation.status)).toEqual([
      "verified",
      "verified",
    ]);
    expect(first.inventory.xcodeSchemes.map((scheme) => scheme.name)).toEqual([
      "ExampleApp",
      "ExampleWorkspace",
    ]);
    expect(first.inventory.swift.verifiedSourcePaths).toEqual(["Sources/App.swift"]);
    expect(first.issues).toEqual([]);
    expect(first.readiness).toMatchObject({ ready: true, verifiedSharedSchemeCount: 2 });
    expect(first.plan).toMatchObject({
      blocked: false,
      mode: "proposal-only",
      requiresSourceRevalidation: true,
      actions: [],
    });
    expect(first.plan.sourceFingerprint).toBe(projectDigest(first.after));
    expect(second.inventoryDigest).toBe(first.inventoryDigest);
    expect(second.planDigest).toBe(first.planDigest);
  });

  it("uses a private index and preserves source index/config/ref bytes and metadata", () => {
    const { repositoryRoot } = createCompleteProject();
    const gitDirectory = git(
      repositoryRoot,
      "rev-parse",
      "--path-format=absolute",
      "--absolute-git-dir",
    )
      .toString("utf8")
      .trim();
    const indexPath = join(gitDirectory, "index");
    const configPath = join(gitDirectory, "config");
    const headPath = join(gitDirectory, "HEAD");
    const before = [indexPath, configPath, headPath].map((path) => ({
      path,
      bytes: readFileSync(path),
      stats: statSync(path, { bigint: true }),
    }));

    const result = scanExistingProject({ repositoryRoot });

    for (const item of before) {
      const after = statSync(item.path, { bigint: true });
      expect(readFileSync(item.path)).toEqual(item.bytes);
      expect(after.ino).toBe(item.stats.ino);
      expect(after.size).toBe(item.stats.size);
      expect(after.mtimeNs).toBe(item.stats.mtimeNs);
      expect(after.ctimeNs).toBe(item.stats.ctimeNs);
    }
    expect(result.before.gitAdmin).toEqual(result.after.gitAdmin);
    expect(result.before.gitAdmin.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["index", "head", "head-ref", "config", "effective-local-config"]),
    );
  });

  it("resolves and preserves linked-worktree administrative state", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const linkedPath = join(sandboxRoot, "LinkedWorktree");
    git(repositoryRoot, "worktree", "add", "--quiet", "-b", "linked-scan", linkedPath);
    const linkedRoot = realpathSync(linkedPath);

    const result = scanExistingProject({ repositoryRoot: linkedRoot });

    expect(result.before.gitAdmin.kind).toBe("linked-worktree");
    expect(result.before.gitAdmin).toEqual(result.after.gitAdmin);
    expect(result.before.gitAdmin.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["index", "head", "head-ref", "config"]),
    );
    expect(result.readiness.ready).toBe(true);
  });

  it("preserves tracked modifications and untracked files byte-for-byte", () => {
    const { repositoryRoot } = createCompleteProject();
    appendFileSync(join(repositoryRoot, "Sources/App.swift"), "public let dirty = true\n", "utf8");
    write(repositoryRoot, "Notes/untracked.txt", "keep this exact content\n");
    const statusBefore = porcelain(repositoryRoot);
    const result = scanExistingProject({ repositoryRoot });

    expect(result.before.dirty).toBe(true);
    expect(result.before.statusDigest).toBe(result.after.statusDigest);
    expect(result.before.scanSurfaceDigest).toBe(result.after.scanSurfaceDigest);
    expect(porcelain(repositoryRoot)).toEqual(statusBefore);
  });

  it("blocks same-scope rule conflicts but permits a scoped canonical override", () => {
    const conflictProject = createCompleteProject({
      "CLAUDE.md": conformingAdapter("factory-rule: release.branch=release"),
    }).repositoryRoot;
    const conflictScan = scanExistingProject({ repositoryRoot: conflictProject });
    const conflict = conflictScan.issues.find(
      (issue) => issue.code === "rules.conflicting-declaration",
    );
    expect(conflict).toMatchObject({
      severity: "blocker",
      paths: ["AGENTS.md", "CLAUDE.md"],
    });

    const { repositoryRoot } = createCompleteProject();
    const nestedAuthority = [
      "# Feature authority",
      "factory-rule: authority.version=1",
      "factory-rule: release.branch=feature",
      "",
    ].join("\n");
    const nestedDigest = `sha256:${createHash("sha256").update(nestedAuthority).digest("hex")}`;
    write(repositoryRoot, "Features/AGENTS.md", nestedAuthority);
    write(
      repositoryRoot,
      "Features/CLAUDE.md",
      [
        "factory-rule: authority.import=Features/AGENTS.md",
        `factory-rule: authority.digest=${nestedDigest}`,
        "",
      ].join("\n"),
    );
    commitAll(repositoryRoot, "add scoped authority");
    const scoped = scanExistingProject({ repositoryRoot });
    expect(scoped.issues.some((issue) => issue.code === "rules.conflicting-declaration")).toBe(
      false,
    );
    expect(
      scoped.inventory.effectiveRules.find(
        (rule) => rule.scopePath === "Features" && rule.key === "release.branch",
      ),
    ).toMatchObject({ value: "feature", conflict: false, sourcePaths: ["Features/AGENTS.md"] });
  });

  it("does not call a zero-declaration adapter conforming", () => {
    const { repositoryRoot } = createCompleteProject({ "CLAUDE.md": "# prose only\n" });
    const result = scanExistingProject({ repositoryRoot });
    expect(
      result.inventory.ruleFiles.find((file) => file.path === "CLAUDE.md")?.authority.status,
    ).toBe("nonconforming");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "rules.adapter-nonconforming", severity: "blocker" }),
    );
  });

  it("resolves chained links and detects links through excluded directories", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const outsidePath = join(sandboxRoot, "outside.swift");
    writeFileSync(outsidePath, "let outside = true\n", "utf8");
    mkdirSync(join(repositoryRoot, "node_modules"));
    symlinkSync(outsidePath, join(repositoryRoot, "node_modules", "bridge"));
    symlinkSync("node_modules/bridge", join(repositoryRoot, "ViaExcluded.swift"));
    git(repositoryRoot, "add", "-f", "node_modules/bridge", "ViaExcluded.swift");
    git(repositoryRoot, "commit", "--quiet", "-m", "add chained links");

    const result = scanExistingProject({ repositoryRoot });
    expect(result.inventory.symbolicLinkPaths).toEqual([
      "ViaExcluded.swift",
      "node_modules/bridge",
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "safety.symlink-path-escape",
          severity: "blocker",
          paths: ["ViaExcluded.swift"],
        }),
        expect.objectContaining({
          code: "safety.symlink-through-exclusion",
          severity: "blocker",
          paths: ["ViaExcluded.swift"],
        }),
      ]),
    );
  });

  it("rejects oversized, sparse, and over-populated scan surfaces before hashing", () => {
    const oversized = createMinimalRepository();
    write(oversized, "large.bin", Buffer.alloc(2_048, 1));
    expect(() =>
      scanExistingProject({
        repositoryRoot: oversized,
        maxSingleFileBytes: 1_024,
        maxScannedFileBytes: 4_096,
      }),
    ).toThrow(/per-file scan limit/u);

    const sparse = createMinimalRepository();
    write(sparse, "sparse.bin", "");
    truncateSync(join(sparse, "sparse.bin"), 64 * 1024);
    expect(() => scanExistingProject({ repositoryRoot: sparse })).toThrow(/sparse files/u);

    const crowded = createMinimalRepository();
    for (let index = 0; index < 6; index += 1) write(crowded, `Many/${String(index)}.txt`, "x");
    expect(() => scanExistingProject({ repositoryRoot: crowded, maxScanEntries: 5 })).toThrow(
      /directory exceeds safe entry limit/u,
    );
  });

  it("detects the legacy factory contract and proposes adoption instead of a parallel layout", () => {
    const { repositoryRoot } = createCompleteProject();
    unlinkSync(join(repositoryRoot, ".app-factory", "project.json"));
    unlinkSync(join(repositoryRoot, ".app-factory", "experience-manifest.json"));
    write(repositoryRoot, ".factory/project-context.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, ".factory/standard-lock.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, ".factory/AGENTS.factory.md", conformingAdapter());
    write(repositoryRoot, "quality/release-contract.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, "quality/quality-manifest.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, "quality/evidence/manifest.json", '{"schemaVersion":1}\n');
    commitAll(repositoryRoot, "install legacy factory contract");

    const result = scanExistingProject({ repositoryRoot });
    expect(result.inventory.legacyFactoryArtifacts.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "project-context",
        "standard-lock",
        "rule-authority",
        "quality-contract",
        "quality-manifest",
        "quality-evidence",
      ]),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "compatibility.legacy-factory-layout",
        severity: "blocker",
      }),
    );
    expect(result.plan.actions).toContainEqual(
      expect.objectContaining({ kind: "adopt-or-migrate-legacy-layout" }),
    );
    expect(result.plan.actions.map((action) => action.kind)).not.toContain("declare-project");
    expect(result.plan.actions.map((action) => action.kind)).not.toContain("declare-experience");
  });

  it("inventories malformed filenames without treating them as verified readiness", () => {
    const { repositoryRoot } = createCompleteProject({
      "ExampleApp.xcodeproj/project.pbxproj": "",
      "ExampleApp.xcodeproj/xcshareddata/xcschemes/ExampleApp.xcscheme":
        '<!DOCTYPE Scheme [<!ENTITY external SYSTEM "file:///etc/passwd">]><Scheme>&external;</Scheme>',
      "ExampleApp.xcworkspace/contents.xcworkspacedata": "",
      "ExampleApp.xcworkspace/xcshareddata/xcschemes/ExampleWorkspace.xcscheme": "",
      "Sources/App.swift": "",
      "ExampleAppTests/AppTests.swift": "",
      "ExampleAppUITests/AppUITests.swift": "",
      ".github/workflows/verify.yml": "",
      ".app-factory/project.json": "{}",
      ".app-factory/experience-manifest.json": "not-json",
    });
    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toHaveLength(2);
    expect(
      result.inventory.xcodeContainers.every((item) => item.validation.status === "invalid"),
    ).toBe(true);
    expect(result.inventory.swift.sourcePaths).toEqual(["Sources/App.swift"]);
    expect(result.inventory.swift.verifiedSourcePaths).toEqual([]);
    expect(result.readiness).toMatchObject({
      ready: false,
      verifiedXcodeContainerCount: 0,
      verifiedSharedSchemeCount: 0,
      verifiedSwiftSourceCount: 0,
      verifiedTestSourceCount: 0,
      verifiedUiTestSourceCount: 0,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ios.no-xcode-container",
        "ios.no-shared-scheme",
        "swift.no-source",
        "quality.no-tests",
        "quality.no-ui-tests",
        "automation.no-ci",
        "factory.invalid-project-manifest",
        "factory.invalid-experience-manifest",
      ]),
    );
  });

  it("fails closed when HEAD changes between discovery and final quiescence", () => {
    const { repositoryRoot } = createCompleteProject();
    expect(() =>
      scanExistingProject({
        repositoryRoot,
        quiescenceCheckpoint: () => {
          git(repositoryRoot, "commit", "--quiet", "--allow-empty", "-m", "concurrent mutation");
        },
      }),
    ).toThrow(EnrollmentPreservationError);
  });

  it("rejects a symlinked repository root and traversal-shaped contract paths", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const linkedRoot = join(sandboxRoot, "linked-repository");
    symlinkSync(repositoryRoot, linkedRoot);
    expect(() => scanExistingProject({ repositoryRoot: linkedRoot })).toThrow(EnrollmentScanError);
    expect(RelativeProjectPathSchema.safeParse("../outside.swift").success).toBe(false);
    expect(RelativeProjectPathSchema.safeParse("nested/../../outside.swift").success).toBe(false);
    expect(RelativeProjectPathSchema.safeParse("/outside.swift").success).toBe(false);
  });
});
