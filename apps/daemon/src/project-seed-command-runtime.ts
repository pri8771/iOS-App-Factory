import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  GitBranchNameSchema,
  GitObjectIdSchema,
  Sha256DigestSchema,
  type CommandRequestV1,
  type CommandResultV1,
} from "@app-factory/contracts";
import { canonicalJson } from "@app-factory/kernel";
import {
  EnrollmentApplyConvergenceError,
  EnrollmentApplyError,
  EnrollmentApplyFingerprintDriftError,
  EnrollmentPreservationError,
  EnrollmentScanError,
  applyEnrollmentPlan,
  scanExistingProject,
} from "@app-factory/project-sdk";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `project.seed`: the from-scratch entry point for a brand-new iOS project. Creates a minimal,
 * real repository (Git init, an XcodeGen `project.yml` for an app target plus a unit test target,
 * a GitHub Actions workflow, one passing XCTest, README, `docs/STATUS.md`, both using the
 * four-class status vocabulary `docs/progress/IMPLEMENTATION_STATUS.md` already uses in this
 * repository), commits it on the default branch, then runs the SAME enrollment scan-and-apply
 * `project.scan`/`project.apply` already perform (`@app-factory/project-sdk`) so the result is a
 * converged enrolled project -- not just a pile of scaffold files -- ready for `plan.execute`'s
 * `build-seed-repo` item to build on top of.
 */

export type ProjectSeedCommandRequestV1 = Extract<CommandRequestV1, { operation: "project.seed" }>;

const GIT_ENV = {
  GIT_AUTHOR_NAME: "App Factory",
  GIT_AUTHOR_EMAIL: "factory@app-factory.invalid",
  GIT_COMMITTER_NAME: "App Factory",
  GIT_COMMITTER_EMAIL: "factory@app-factory.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
  PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin",
};

function runOrThrow(
  executable: string,
  args: readonly string[],
  cwd: string,
  code: string,
  timeoutMs = 120_000,
): string {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    shell: false,
    timeout: timeoutMs,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new CommandHandlerError(
      code,
      `${executable} ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`,
      false,
    );
  }
  return result.stdout.trim();
}

function slugFromName(name: string): string {
  const slug = name.replace(/[^A-Za-z0-9]+/gu, "").replace(/^[0-9]+/u, "");
  return slug.length === 0 ? "App" : `${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

function projectYaml(moduleName: string): string {
  return `name: ${moduleName}
options:
  bundleIdPrefix: com.app-factory
  deploymentTarget:
    iOS: "16.0"
targets:
  ${moduleName}:
    type: application
    platform: iOS
    sources:
      - Sources/${moduleName}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.app-factory.${moduleName.toLowerCase()}
        GENERATE_INFOPLIST_FILE: true
  ${moduleName}Tests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - Tests/${moduleName}Tests
    dependencies:
      - target: ${moduleName}
schemes:
  ${moduleName}:
    build:
      targets:
        ${moduleName}: all
        ${moduleName}Tests: [test]
    test:
      targets:
        - ${moduleName}Tests
`;
}

function ciWorkflowYaml(moduleName: string): string {
  return `name: CI
on:
  push:
  pull_request:
jobs:
  build-and-test:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: Install XcodeGen
        run: brew install xcodegen
      - name: Generate project
        run: xcodegen generate
      - name: Build and test
        run: |
          xcodebuild test \\
            -scheme ${moduleName} \\
            -destination 'platform=iOS Simulator,name=iPhone 15' \\
            CODE_SIGNING_ALLOWED=NO
`;
}

function appSwift(moduleName: string): string {
  return `import SwiftUI

@main
struct ${moduleName}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        Text("Hello, ${moduleName}!")
            .padding()
    }
}
`;
}

function testSwift(moduleName: string): string {
  return `import XCTest
@testable import ${moduleName}

final class ${moduleName}Tests: XCTestCase {
    func testContentViewBodyExists() throws {
        let view = ContentView()
        XCTAssertNotNil(view.body)
    }
}
`;
}

function readmeMarkdown(displayName: string): string {
  return `# ${displayName}

Seeded by App Factory's \`project.seed\`. XcodeGen owns the Xcode project (\`project.yml\`); run
\`xcodegen generate\` after checkout.

## Build

\`\`\`sh
xcodegen generate
xcodebuild build -scheme ${slugFromName(displayName)} -destination 'generic/platform=iOS Simulator'
\`\`\`
`;
}

function statusMarkdown(displayName: string): string {
  return `# ${displayName} status

Status labels use the four-class vocabulary: **Implemented**, **Dormant / not wired**,
**Blocked -- protected approval**, **Blocked -- external/user gate**.

## Current state

- Seed scaffold: **Implemented** (XcodeGen project, CI workflow, one passing test).
- Everything else: not started.
`;
}

function writeScaffold(targetDirectory: string, moduleName: string, displayName: string): void {
  mkdirSync(join(targetDirectory, "Sources", moduleName), { recursive: true });
  mkdirSync(join(targetDirectory, "Tests", `${moduleName}Tests`), { recursive: true });
  mkdirSync(join(targetDirectory, ".github", "workflows"), { recursive: true });
  mkdirSync(join(targetDirectory, "docs"), { recursive: true });
  writeFileSync(join(targetDirectory, "project.yml"), projectYaml(moduleName), "utf8");
  writeFileSync(
    join(targetDirectory, ".github", "workflows", "ci.yml"),
    ciWorkflowYaml(moduleName),
    "utf8",
  );
  writeFileSync(
    join(targetDirectory, "Sources", moduleName, `${moduleName}App.swift`),
    appSwift(moduleName),
    "utf8",
  );
  writeFileSync(
    join(targetDirectory, "Tests", `${moduleName}Tests`, `${moduleName}Tests.swift`),
    testSwift(moduleName),
    "utf8",
  );
  writeFileSync(join(targetDirectory, "README.md"), readmeMarkdown(displayName), "utf8");
  writeFileSync(join(targetDirectory, "docs", "STATUS.md"), statusMarkdown(displayName), "utf8");
  writeFileSync(
    join(targetDirectory, ".gitignore"),
    "*.xcodeproj/\nDerivedData/\n.build/\n",
    "utf8",
  );
}

function assertTargetDirectoryUsable(targetDirectory: string): void {
  if (existsSync(targetDirectory)) {
    const entries = readdirSync(targetDirectory);
    if (entries.length > 0) {
      throw new CommandHandlerError(
        "project.seed-target-not-empty",
        `${targetDirectory} already exists and is not empty.`,
        false,
      );
    }
  } else {
    mkdirSync(targetDirectory, { recursive: true });
  }
}

function xcodegenAvailable(): boolean {
  const probe = spawnSync("which", ["xcodegen"], { encoding: "utf8" });
  return probe.status === 0;
}

export function executeProjectSeedCommand(
  evidenceStore: { putBlob(bytes: Buffer): string },
  request: ProjectSeedCommandRequestV1,
): CommandResultV1 {
  const targetDirectory = request.payload.targetDirectory;
  const displayName = request.payload.name;
  const moduleName = slugFromName(displayName);

  assertTargetDirectoryUsable(targetDirectory);
  writeScaffold(targetDirectory, moduleName, displayName);

  runOrThrow("git", ["init", "--initial-branch=main"], targetDirectory, "project.seed-git-failed");
  runOrThrow("git", ["add", "--all"], targetDirectory, "project.seed-git-failed");
  runOrThrow(
    "git",
    ["commit", "-m", "Seed repository scaffold (project.seed)"],
    targetDirectory,
    "project.seed-git-failed",
  );
  const scaffoldCommitSha = GitObjectIdSchema.parse(
    runOrThrow("git", ["rev-parse", "HEAD"], targetDirectory, "project.seed-git-failed"),
  );

  const available = xcodegenAvailable();
  let generated = false;
  let built = false;
  let detail: string;
  if (!available) {
    detail = "xcodegen is not installed (`which xcodegen` failed); generate/build were skipped.";
  } else {
    // Unlike the Git calls above (which use a controlled, deterministic environment), XcodeGen and
    // xcodebuild are real toolchain invocations that need a normal user environment (HOME, USER, a
    // full PATH, ...) to resolve the current user, caches, and the installed Xcode toolchain --
    // inherit the daemon process's own environment for these two calls.
    const toolchainEnv = process.env;
    const generateResult = spawnSync("xcodegen", ["generate"], {
      cwd: targetDirectory,
      encoding: "utf8",
      env: toolchainEnv,
      timeout: 120_000,
    });
    generated = generateResult.status === 0;
    if (!generated) {
      detail = `xcodegen generate failed: ${generateResult.stderr || "unknown error"}`;
    } else {
      const buildResult = spawnSync(
        "xcodebuild",
        [
          "build",
          "-scheme",
          moduleName,
          "-destination",
          "generic/platform=iOS Simulator",
          "CODE_SIGNING_ALLOWED=NO",
          "ONLY_ACTIVE_ARCH=YES",
        ],
        { cwd: targetDirectory, encoding: "utf8", env: toolchainEnv, timeout: 300_000 },
      );
      built = buildResult.status === 0;
      detail = built
        ? "xcodegen generate and xcodebuild build both succeeded."
        : `xcodegen generate succeeded; xcodebuild build failed: ${(buildResult.stderr || buildResult.stdout || "unknown error").slice(0, 500)}`;
    }
  }

  let scan;
  try {
    scan = scanExistingProject({ repositoryRoot: targetDirectory });
  } catch (error) {
    if (error instanceof EnrollmentPreservationError) {
      throw new CommandHandlerError(
        "project.seed-scan-preservation-violated",
        error.message,
        false,
      );
    }
    if (error instanceof EnrollmentScanError) {
      throw new CommandHandlerError("project.seed-scan-failed", error.message, false);
    }
    throw error;
  }
  const planDigest = Sha256DigestSchema.parse(
    evidenceStore.putBlob(Buffer.from(canonicalJson(scan), "utf8")),
  );

  let applied;
  try {
    applied = applyEnrollmentPlan({ plan: scan.plan, repositoryRoot: scan.repositoryRoot });
  } catch (error) {
    if (error instanceof EnrollmentApplyFingerprintDriftError) {
      throw new CommandHandlerError("project.seed-apply-fingerprint-drift", error.message, false);
    }
    if (error instanceof EnrollmentApplyConvergenceError) {
      throw new CommandHandlerError("project.seed-apply-convergence-failed", error.message, false);
    }
    if (error instanceof EnrollmentApplyError) {
      throw new CommandHandlerError("project.seed-apply-failed", error.message, false);
    }
    throw error;
  }
  evidenceStore.putBlob(Buffer.from(canonicalJson(applied), "utf8"));

  return {
    operation: "project.seed",
    repositoryRoot: targetDirectory,
    scaffoldCommitSha,
    planDigest,
    enrollment: {
      branchName:
        applied.branchName === null ? null : GitBranchNameSchema.parse(applied.branchName),
      commitSha: applied.commitSha === null ? null : GitObjectIdSchema.parse(applied.commitSha),
      appliedActionKinds: [...new Set(applied.appliedActions.map((action) => action.kind))].sort(),
      convergence: {
        blocked: applied.rescan.plan.blocked,
        blockerIssueIds: applied.rescan.plan.blockerIssueIds,
        openIssueCount: applied.rescan.issues.length,
        sourceFingerprint: Sha256DigestSchema.parse(applied.rescan.plan.sourceFingerprint),
      },
    },
    xcodegen: { available, generated, built, detail },
  };
}
