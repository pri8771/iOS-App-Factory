import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AttemptId,
  CommandRequestV1,
  ExecutionAttemptV1,
  ReleaseExportOptionsConfigV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import type { VerifiedExecutionEvidence } from "@app-factory/execution-engine";
import {
  GitWorkspaceManager,
  type BrokerCommitRecord,
  type FactoryMirror,
  type ImmutableMirrorBinding,
} from "@app-factory/git-workspace";
import {
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { CommandHandlerError } from "../src/unix-command-server.js";
import {
  executeReleaseStartCommand,
  type ReleaseRunRuntimeDependencies,
} from "../src/release-run-runtime.js";
import {
  completeReleaseArchive,
  createReleaseArchiverPort,
  digestArchiveDirectoryTreeV1,
  loadReleaseArchiveConfigFile,
  parseReleaseArchiveConfigV1,
  prepareReleaseArchive,
  recordReleaseArchiveFailure,
  type ReleaseArchiveConfigV1,
  type ReleaseArchiveOutcomeV1,
  type ReleaseArchiveRuntimeDependencies,
} from "../src/release-archive-runtime.js";
import type { RunExportMirrorPort } from "../src/run-export-command-runtime.js";

/**
 * Release Rail Wave 4 (`release.archive`). Two halves:
 *
 * - `describe("createReleaseArchiverPort")`: the REAL `process-supervisor`-backed archiver against a
 *   small fake `xcodegen`/`xcodebuild` shell script standing in for Xcode -- proves the actual
 *   intent -> claim -> gate -> receipt plumbing, build-setting injection (`CURRENT_PROJECT_VERSION`/
 *   `MARKETING_VERSION`), digest computation, the source tree's `git status` cleanliness, and the
 *   captured-stderr-tail failure path, without needing a real Xcode install in CI.
 * - `describe("prepareReleaseArchive"/"completeReleaseArchive"/"recordReleaseArchiveFailure")`:
 *   mirrors `release-run-runtime.test.ts`'s isolated-function style (same `sealChainFixture`/
 *   `verifyAndAdvance` harness, extended with a `project.yml` so `readXcodegenProjectName` resolves
 *   a module name) with a FAKE `ReleaseArchiverPort` result -- proves the CAS/stage/destination/
 *   bundle-id checks, promotion re-verification, build-number allocation, and that success populates
 *   `promotion` + `archive` together while a failure holds `stage` and durably notes the detail.
 */

const GIT = "/usr/bin/git";
const T0 = "2026-08-21T12:00:00.000Z";
const T1 = "2026-08-21T12:05:00.000Z";
const T2 = "2026-08-21T12:10:00.000Z";
const PROJECT_ID = "ee000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "ee000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "ee000000-0000-4000-8000-000000000003" as AttemptId;
const TASK_ID = "ee000000-0000-4000-8000-000000000004";

const roots: string[] = [];
const dbRoots: string[] = [];

// ---------------------------------------------------------------------------
// createReleaseArchiverPort: real process-supervisor plumbing, fake Xcode
// ---------------------------------------------------------------------------

const FAKE_TOOL_SCRIPT = `#!/bin/sh
set -e
if [ "$1" = "generate" ]; then
  echo "generate invoked with cwd=$PWD" > "$PWD/.xcodegen-invoked"
  exit 0
fi
if [ "$1" = "archive" ]; then
  archivePath=""
  buildVersion=""
  marketingVersion=""
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "-archivePath" ]; then archivePath="$arg"; fi
    case "$arg" in
      CURRENT_PROJECT_VERSION=*) buildVersion="\${arg#CURRENT_PROJECT_VERSION=}" ;;
      MARKETING_VERSION=*) marketingVersion="\${arg#MARKETING_VERSION=}" ;;
    esac
    prev="$arg"
  done
  if [ -f "$PWD/FAIL_ARCHIVE" ]; then
    echo "fake xcodebuild archive: forced failure for the test" >&2
    exit 7
  fi
  mkdir -p "$archivePath/Products"
  printf 'buildVersion=%s\\nmarketingVersion=%s\\n' "$buildVersion" "$marketingVersion" > "$archivePath/Info.plist"
  exit 0
fi
if [ "$1" = "-exportArchive" ]; then
  exportPath=""
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "-exportPath" ]; then exportPath="$arg"; fi
    prev="$arg"
  done
  mkdir -p "$exportPath"
  printf 'fake ipa contents' > "$exportPath/TestApp.ipa"
  exit 0
fi
echo "unknown fake-xcodebuild invocation: $*" >&2
exit 1
`;

function writeFakeTool(root: string): string {
  const path = join(root, "fake-xcodetool");
  writeFileSync(path, FAKE_TOOL_SCRIPT, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2026-08-21T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-21T12:00:00Z",
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

function fakeReleaseArchiveConfig(root: string): ReleaseArchiveConfigV1 {
  const tool = writeFakeTool(root);
  return {
    schemaVersion: 1,
    xcodegenExecutable: tool,
    xcodebuildExecutable: tool,
    path: "/usr/bin:/bin",
    user: "factory-test",
    scratchRoot: join(root, "scratch"),
    teamId: "ABCD123456",
    method: "app-store-connect",
    destination: "export",
    signingStyle: "automatic",
    xcodegenTimeoutMs: 30_000,
    archiveTimeoutMs: 30_000,
    exportTimeoutMs: 30_000,
  };
}

const EXPORT_OPTIONS: ReleaseExportOptionsConfigV1 = {
  schemaVersion: 1,
  teamId: "ABCD123456",
  method: "app-store-connect",
  destination: "export",
  signingStyle: "automatic",
  bundleIdOverride: "com.example.testapp",
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const root of dbRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeArchiverRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-release-archiver-")));
  roots.push(root);
  return root;
}

describe("parseReleaseArchiveConfigV1", () => {
  it("accepts a well-formed config", () => {
    const root = makeArchiverRoot();
    const config = fakeReleaseArchiveConfig(root);
    expect(parseReleaseArchiveConfigV1(config)).toEqual(config);
  });

  it("rejects an unknown key", () => {
    const root = makeArchiverRoot();
    expect(() =>
      parseReleaseArchiveConfigV1({ ...fakeReleaseArchiveConfig(root), extra: "nope" }),
    ).toThrow(/unknown key/);
  });

  it('rejects destination other than "export"', () => {
    const root = makeArchiverRoot();
    expect(() =>
      parseReleaseArchiveConfigV1({ ...fakeReleaseArchiveConfig(root), destination: "upload" }),
    ).toThrow(/destination must be "export"/);
  });

  it("rejects a malformed teamId", () => {
    const root = makeArchiverRoot();
    expect(() =>
      parseReleaseArchiveConfigV1({ ...fakeReleaseArchiveConfig(root), teamId: "short" }),
    ).toThrow(/teamId/);
  });

  it("round-trips through a real private config file", () => {
    const root = makeArchiverRoot();
    const config = fakeReleaseArchiveConfig(root);
    const path = join(root, "release-config.json");
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
    expect(loadReleaseArchiveConfigFile(path)).toEqual(config);
  });
});

describe("digestArchiveDirectoryTreeV1", () => {
  it("is deterministic and sensitive to content", () => {
    const root = makeArchiverRoot();
    const archiveDir = join(root, "fixture.xcarchive");
    spawnSync("mkdir", ["-p", join(archiveDir, "Products")]);
    writeFileSync(join(archiveDir, "Info.plist"), "a");
    writeFileSync(join(archiveDir, "Products", "app"), "b");
    const first = digestArchiveDirectoryTreeV1(archiveDir);
    const second = digestArchiveDirectoryTreeV1(archiveDir);
    expect(first).toBe(second);
    writeFileSync(join(archiveDir, "Info.plist"), "changed");
    expect(digestArchiveDirectoryTreeV1(archiveDir)).not.toBe(first);
  });
});

describe("createReleaseArchiverPort", () => {
  function fakeSourceRepository(root: string): string {
    const source = join(root, "source");
    spawnSync("mkdir", ["-p", join(source, "src")]);
    git(source, ["init", "--initial-branch=main"]);
    writeFileSync(join(source, "project.yml"), "name: TestApp\nsources: [src]\n");
    // `.xcodegen-invoked` is a test-only diagnostic the FAKE xcodegen script leaves behind (a real
    // one would leave a gitignored `.xcodeproj` directory instead); gitignoring it too keeps the
    // "clean tree" assertion below meaningful without conflating a test fixture's own bookkeeping
    // with the actual tracked-file-immutability property being proven.
    writeFileSync(join(source, ".gitignore"), "*.xcodeproj\n.xcodegen-invoked\n");
    writeFileSync(join(source, "src", "app.txt"), "v1\n");
    git(source, ["add", "--all"]);
    git(source, ["commit", "-m", "initial"]);
    return source;
  }

  it("runs xcodegen -> archive -> export, injects build settings, and computes digests", async () => {
    const root = makeArchiverRoot();
    const config = fakeReleaseArchiveConfig(root);
    const source = fakeSourceRepository(root);
    const port = createReleaseArchiverPort({ config });
    expect(port.configured).toBe(true);

    const outcome = await port.archive(
      {
        releaseRunId: "ee000000-0000-4000-8000-000000000010",
        fence: 1,
        sourceRepositoryPath: source,
        moduleName: "TestApp",
        buildNumber: "7",
        marketingVersion: "2.3",
        exportOptions: EXPORT_OPTIONS,
      },
      AbortSignal.timeout(60_000),
    );

    expect(outcome.archiveDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(outcome.exportedArtifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(outcome.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(outcome.exportedArtifactPath.endsWith(".ipa")).toBe(true);

    // Build settings were correctly injected as command-line arguments, never into Info.plist or
    // project.yml on the source tree -- the FAKE tool recorded exactly what it received.
    const plist = readFileSync(join(outcome.archivePath, "Info.plist"), "utf8");
    expect(plist).toContain("buildVersion=7");
    expect(plist).toContain("marketingVersion=2.3");

    // The source repository's tree is provably unmodified: no tracked file changed, nothing was
    // staged, and the only untracked byproduct (the fake xcodegen's marker file -- a real one would
    // leave a `.xcodeproj` directory) is covered by `.gitignore`, exactly the way the plan's own
    // live-check requirement ("git status clean afterwards") expects.
    const status = git(source, ["status", "--porcelain=v1", "--untracked-files=all"]);
    expect(status.split("\n").filter(Boolean)).toEqual([]);
    expect(existsSync(join(source, ".xcodegen-invoked"))).toBe(true);
  });

  it("captures a bounded stderr tail when a step fails, and never produces a result", async () => {
    const root = makeArchiverRoot();
    const config = fakeReleaseArchiveConfig(root);
    const source = fakeSourceRepository(root);
    // The fake tool checks for this sentinel to force `archive` to fail with stderr output.
    writeFileSync(join(source, "FAIL_ARCHIVE"), "");
    const port = createReleaseArchiverPort({ config });

    await expect(
      port.archive(
        {
          releaseRunId: "ee000000-0000-4000-8000-000000000011",
          fence: 1,
          sourceRepositoryPath: source,
          moduleName: "TestApp",
          buildNumber: "1",
          marketingVersion: "1.0",
          exportOptions: EXPORT_OPTIONS,
        },
        AbortSignal.timeout(60_000),
      ),
    ).rejects.toThrow(/forced failure for the test/);
  });

  it("refuses exportOptions that do not match the reviewed config allowlist", async () => {
    const root = makeArchiverRoot();
    const config = fakeReleaseArchiveConfig(root);
    const source = fakeSourceRepository(root);
    const port = createReleaseArchiverPort({ config });

    await expect(
      port.archive(
        {
          releaseRunId: "ee000000-0000-4000-8000-000000000012",
          fence: 1,
          sourceRepositoryPath: source,
          moduleName: "TestApp",
          buildNumber: "1",
          marketingVersion: "1.0",
          exportOptions: { ...EXPORT_OPTIONS, teamId: "ZZZZ999999" },
        },
        AbortSignal.timeout(60_000),
      ),
    ).rejects.toThrow(/does not match this daemon's reviewed/);
  });
});

// ---------------------------------------------------------------------------
// prepareReleaseArchive / completeReleaseArchive / recordReleaseArchiveFailure
// ---------------------------------------------------------------------------

type ChainFixture = Readonly<{
  gitWorkspace: GitWorkspaceManager;
  mirror: FactoryMirror;
  rootBinding: ImmutableMirrorBinding;
  source: string;
}>;

function commitAll(repository: string, message: string): string {
  git(repository, ["add", "--all"]);
  git(repository, ["commit", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]);
}

function sealChainFixture(): ChainFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-release-archive-")));
  roots.push(root);
  const source = join(root, "source");
  const runtimeRoot = join(root, "runtime");
  spawnSync("mkdir", ["-p", source]);
  git(source, ["init", "--initial-branch=main"]);
  spawnSync("mkdir", ["-p", join(source, "src")]);
  writeFileSync(join(source, "src", "app.txt"), "v0\n");
  writeFileSync(join(source, "project.yml"), "name: TestApp\nsources: [src]\n");
  writeFileSync(join(source, ".gitignore"), "*.xcodeproj\n");
  const baseSha = commitAll(source, "initial");
  const baseTree = git(source, ["rev-parse", `${baseSha}^{tree}`]);

  const gitWorkspace = new GitWorkspaceManager({ gitExecutable: GIT });
  const mirror = gitWorkspace.prepareImmutableMirror(
    {
      sourceRepositoryPath: source,
      sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
      runtimeRoot,
      repositoryId: REPOSITORY_ID,
      baseCommit: baseSha,
      baseTree,
    },
    () => undefined,
  );
  const rootBinding = gitWorkspace.readSealedRootBinding(mirror);
  return { gitWorkspace, mirror, rootBinding, source };
}

function verifyAndAdvance(
  fixture: ChainFixture,
  fileBody: string,
  attemptId: AttemptId = ATTEMPT_ID,
): BrokerCommitRecord {
  const tip = fixture.gitWorkspace.readImmutableMirrorBindingTip(fixture.mirror);
  const workspace = fixture.gitWorkspace.createAttemptWorkspace(
    fixture.mirror,
    attemptId,
    tip.baseCommit,
  );
  writeFileSync(join(workspace.worktreePath, "src", "app.txt"), fileBody);
  const candidate = fixture.gitWorkspace.verifyCandidate(workspace, { authorizedScopes: ["src"] });
  const broker = fixture.gitWorkspace.createOrReconcileBrokerCommit(
    fixture.mirror,
    {
      attemptId,
      baseSha: candidate.baseSha,
      candidateTreeId: candidate.candidateTreeId,
      diffDigest: candidate.diffDigest,
    },
    () => undefined,
  );
  fixture.gitWorkspace.advanceImmutableMirrorBase(fixture.mirror, tip, broker);
  return broker;
}

function fakeMirrorsPort(fixture: ChainFixture): RunExportMirrorPort {
  return {
    open(repositoryId) {
      if (repositoryId !== REPOSITORY_ID) {
        throw new Error(`No Factory mirror exists for repository ${repositoryId}`);
      }
      return { gitWorkspace: fixture.gitWorkspace, mirror: fixture.mirror };
    },
  };
}

function fakeAttempt(): ExecutionAttemptV1 {
  return {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    taskId: TASK_ID as ExecutionAttemptV1["taskId"],
    taskSpecDigest: `sha256:${"b".repeat(64)}` as ExecutionAttemptV1["taskSpecDigest"],
    attemptNumber: 1,
    state: "succeeded",
    desiredState: "running",
    revision: 3,
    fence: 1,
    currentStepId: null,
    blocker: null,
    outcome: { kind: "succeeded" },
    createdAt: T0,
    updatedAt: T1,
    terminalAt: T1,
  } as ExecutionAttemptV1;
}

function fakeVerifiedExecutionEvidence(broker: BrokerCommitRecord): VerifiedExecutionEvidence {
  const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as `sha256:${string}`;
  return {
    indexDigest: digest("c"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    index: {} as any,
    review: {
      schemaVersion: 1,
      reviewerId: "release.test-reviewer",
      reviewerVersion: "0.0.0-test",
      reviewInputDigest: digest("9"),
      verdict: "pass",
      findings: [],
    },
    brokerCommit: broker,
    testCount: 1,
    trustedTests: [
      {
        recordDigest: digest("8"),
        stdoutDigest: digest("7"),
        stderrDigest: digest("6"),
        claims: {
          checkId: "release.verification",
          argv: ["/usr/bin/true"],
          checkoutTree: broker.candidateTreeId,
          startedAt: T0,
          finishedAt: T1,
          toolVersions: [],
          passed: true,
          exitCode: 0,
        },
      },
    ],
  };
}

function seedEvidenceManifest(evidenceStore: EvidenceStore): void {
  const subject = {
    taskSpecDigest: `sha256:${"b".repeat(64)}`,
    policyDigest: `sha256:${"f".repeat(64)}`,
    baseCommit: "0".repeat(40),
    candidateTree: "1".repeat(40),
    fence: 1,
  };
  const { digest } = evidenceStore.putEvidence({
    schemaVersion: 1,
    evidenceId: "ee000000-0000-4000-8000-000000000700",
    attemptId: ATTEMPT_ID,
    createdAt: T0,
    producer: "release.test-producer",
    subject,
    artifacts: [],
    kind: "commit",
    claims: { commit: "1".repeat(40), tree: "1".repeat(40), attemptMarker: ATTEMPT_ID },
  });
  evidenceStore.commitManifest({
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    createdAt: T0,
    subject,
    entries: [{ evidenceId: "ee000000-0000-4000-8000-000000000700", digest }],
    requiredKinds: ["commit"],
  });
}

function makeEvidenceStore(): EvidenceStore {
  const root = mkdtempSync(join(tmpdir(), "app-factory-release-archive-evidence-"));
  roots.push(root);
  return new EvidenceStore(root);
}

function makeRepositories(): FactoryRepositories {
  const root = mkdtempSync(join(tmpdir(), "app-factory-release-archive-db-"));
  dbRoots.push(root);
  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite3"));
  return createFactoryRepositories(database);
}

let commandCounter = 0;
function commandId(): string {
  commandCounter += 1;
  return `ff000000-0000-4000-8000-${commandCounter.toString().padStart(12, "0")}`;
}

function startRequest(
  sourceCommit: string,
): Extract<CommandRequestV1, { operation: "release.start" }> {
  return {
    schemaVersion: 1,
    commandId: commandId(),
    issuedAt: T0,
    origin: "cli",
    operation: "release.start",
    payload: { projectId: PROJECT_ID, repositoryId: REPOSITORY_ID, sourceCommit, branch: "main" },
  } as Extract<CommandRequestV1, { operation: "release.start" }>;
}

function archiveRequest(
  releaseRunId: string,
  expectedRevision: number,
  overrides: Partial<{
    exportOptions: ReleaseExportOptionsConfigV1;
    marketingVersion: string;
  }> = {},
): Extract<CommandRequestV1, { operation: "release.archive" }> {
  return {
    schemaVersion: 1,
    commandId: commandId(),
    issuedAt: T1,
    origin: "cli",
    operation: "release.archive",
    payload: {
      releaseRunId,
      expectedRevision,
      exportOptions: overrides.exportOptions ?? EXPORT_OPTIONS,
      marketingVersion: overrides.marketingVersion ?? "1.0",
    },
  } as Extract<CommandRequestV1, { operation: "release.archive" }>;
}

let idCounter = 0;
function fakeIdFactory(): (purpose: string, commandId: string) => string {
  return () => {
    idCounter += 1;
    return `dd000000-0000-4000-8000-${idCounter.toString().padStart(12, "0")}`;
  };
}

async function certifiedRun(): Promise<{
  fixture: ChainFixture;
  broker: BrokerCommitRecord;
  repositories: FactoryRepositories;
  deps: ReleaseArchiveRuntimeDependencies;
  releaseRunId: string;
}> {
  const fixture = sealChainFixture();
  const broker = verifyAndAdvance(fixture, "v1\n");
  const evidenceStore = makeEvidenceStore();
  seedEvidenceManifest(evidenceStore);
  const repositories = makeRepositories();
  const startDeps: ReleaseRunRuntimeDependencies = {
    repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
    mirrors: fakeMirrorsPort(fixture),
    evidenceStore,
    resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker),
    idFactory: fakeIdFactory(),
  };
  const started = executeReleaseStartCommand(startDeps, startRequest(broker.commitSha), T0);
  if (started.operation !== "release.start") throw new Error("wrong operation");
  const deps: ReleaseArchiveRuntimeDependencies = {
    repositories: {
      releaseRuns: repositories.releaseRuns,
      attempts: { findById: fakeAttempt },
      releaseBuildNumbers: repositories.releaseBuildNumbers,
    },
    mirrors: fakeMirrorsPort(fixture),
    resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker),
  };
  return { fixture, broker, repositories, deps, releaseRunId: started.run.releaseRunId };
}

const FAKE_OUTCOME: ReleaseArchiveOutcomeV1 = {
  archivePath: "/fake/TestApp.xcarchive",
  archiveDigest: `sha256:${"1".repeat(64)}` as ReleaseArchiveOutcomeV1["archiveDigest"],
  exportedArtifactPath: "/fake/export/TestApp.ipa",
  exportedArtifactDigest:
    `sha256:${"2".repeat(64)}` as ReleaseArchiveOutcomeV1["exportedArtifactDigest"],
  receiptDigest: `sha256:${"3".repeat(64)}` as ReleaseArchiveOutcomeV1["receiptDigest"],
  stepNotes: ["release.archive: fake outcome for a unit test."],
};

describe("prepareReleaseArchive", () => {
  it("re-verifies the promotion (fast-forwarding it for the first time), resolves the module name, and allocates build number 1", async () => {
    const { fixture, broker, repositories, deps, releaseRunId } = await certifiedRun();

    // `release.promote` was never called on this run -- `prepareReleaseArchive` performs the
    // fast-forward itself (idempotently: a run that WAS already promoted separately re-verifies the
    // same way, per the module doc comment).
    expect(git(fixture.source, ["rev-parse", "HEAD"])).not.toBe(broker.commitSha);

    const preparation = prepareReleaseArchive(deps, archiveRequest(releaseRunId, 1), T1);
    expect(preparation.moduleName).toBe("TestApp");
    expect(preparation.buildNumber).toBe("1");
    expect(preparation.promotion.promotedCommit).toBe(broker.commitSha);
    expect(preparation.promotion.branch).toBe("main");
    expect(git(fixture.source, ["rev-parse", "HEAD"])).toBe(broker.commitSha);
    expect(
      repositories.releaseBuildNumbers.list("com.example.testapp").map((a) => a.buildNumber),
    ).toEqual(["1"]);
  });

  it("refuses a release run that is not certified", async () => {
    const { deps, releaseRunId } = await certifiedRun();
    const preparation = prepareReleaseArchive(deps, archiveRequest(releaseRunId, 1), T1);
    completeReleaseArchive(deps, preparation, FAKE_OUTCOME, T1);

    try {
      prepareReleaseArchive(deps, archiveRequest(releaseRunId, 2), T2);
      throw new Error("expected a not-certified refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release-run.not-certified");
    }
  });

  it("refuses a stale expectedRevision", async () => {
    const { deps, releaseRunId } = await certifiedRun();
    try {
      prepareReleaseArchive(deps, archiveRequest(releaseRunId, 99), T1);
      throw new Error("expected a CAS conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release-run.revision-conflict");
    }
  });

  it('refuses a destination other than "export"', async () => {
    const { deps, releaseRunId } = await certifiedRun();
    try {
      prepareReleaseArchive(
        deps,
        archiveRequest(releaseRunId, 1, {
          exportOptions: { ...EXPORT_OPTIONS, destination: "upload" },
        }),
        T1,
      );
      throw new Error("expected a destination refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release.archive-destination-not-supported");
    }
  });

  it("refuses a null bundleIdOverride", async () => {
    const { deps, releaseRunId } = await certifiedRun();
    try {
      prepareReleaseArchive(
        deps,
        archiveRequest(releaseRunId, 1, {
          exportOptions: { ...EXPORT_OPTIONS, bundleIdOverride: null },
        }),
        T1,
      );
      throw new Error("expected a bundle-id refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release.archive-bundle-id-required");
    }
  });
});

describe("completeReleaseArchive", () => {
  it("advances certified -> archived, populating promotion and archive together", async () => {
    const { broker, repositories, deps, releaseRunId } = await certifiedRun();
    const preparation = prepareReleaseArchive(deps, archiveRequest(releaseRunId, 1), T1);

    const run = completeReleaseArchive(deps, preparation, FAKE_OUTCOME, T1);
    expect(run.stage).toBe("archived");
    expect(run.revision).toBe(2);
    expect(run.promotion).toEqual({ promotedCommit: broker.commitSha, branch: "main", at: T1 });
    expect(run.archive).toEqual({
      buildNumber: "1",
      marketingVersion: "1.0",
      archiveDigest: FAKE_OUTCOME.archiveDigest,
      exportedArtifactDigest: FAKE_OUTCOME.exportedArtifactDigest,
      receiptDigest: FAKE_OUTCOME.receiptDigest,
      at: T1,
    });
    expect(run.notes.at(-1)).toContain("fake outcome for a unit test");
    expect(repositories.releaseRuns.get(releaseRunId)).toEqual(run);
  });
});

describe("recordReleaseArchiveFailure", () => {
  it("holds stage at certified and durably notes the failure detail", async () => {
    const { repositories, deps, releaseRunId } = await certifiedRun();
    const preparation = prepareReleaseArchive(deps, archiveRequest(releaseRunId, 1), T1);

    const run = recordReleaseArchiveFailure(
      deps,
      preparation,
      "xcodebuild-archive failed (exit 65). stderr tail:\nNo signing certificate found.",
      T1,
    );
    expect(run.stage).toBe("certified");
    expect(run.revision).toBe(2);
    expect(run.promotion).toBeNull();
    expect(run.archive).toBeNull();
    expect(run.notes.at(-1)).toContain("FAILED");
    expect(run.notes.at(-1)).toContain("No signing certificate found.");
    expect(repositories.releaseRuns.get(releaseRunId)).toEqual(run);

    // The run is still certified and resumable: a fresh archive attempt at the new revision works,
    // and it allocates the NEXT build number rather than reusing the burned one.
    const retried = prepareReleaseArchive(deps, archiveRequest(releaseRunId, 2), T2);
    expect(retried.buildNumber).toBe("2");
  });
});
