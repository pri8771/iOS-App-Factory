import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { RunIdSchema, type Sha256Digest } from "@app-factory/contracts";
import { VERIFICATION_SCRATCH_TOKEN } from "@app-factory/execution-engine";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexLocalAgent } from "../src/codex-local-agent.js";
import {
  EnrolledProjectExecutionConfigurationError,
  loadEnrolledProjectExecutionConfiguration,
} from "../src/enrolled-project-execution.js";
import {
  DEFAULT_CODEX_READ_ONLY_PATHS_V1,
  LocalExecutionProfileConfigurationError,
  loadLocalExecutionProfile,
} from "../src/local-execution-profile.js";

const GIT = "/usr/bin/git";
const SWIFT = "/usr/bin/swift";
const GREP = "/usr/bin/grep";
const REPOSITORY_ID = "62000000-0000-4000-8000-000000000010";
const roots: string[] = [];

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_AUTHOR_EMAIL: "fixture@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Fixture",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_EMAIL: "fixture@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Fixture",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    },
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function sha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;
}

async function writeProtectedPathPolicyExtension(
  root: string,
  allowances: readonly string[],
  name = "protected-path-policy-extension.json",
  extra: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<{ file: string; digest: Sha256Digest }>> {
  const file = join(root, name);
  const bytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      additionalTrustBoundaryPathPrefixes: [],
      additionalTrustBoundarySegments: [],
      additionalPolicyMarkers: [],
      allowances,
      ...extra,
    }),
    "utf8",
  );
  await writeFile(file, bytes, { mode: 0o600 });
  return { file, digest: sha256(bytes) };
}

/** A trivial, non-Swift-Greeter-specific repository: the enrolled-project profile
 * is a generic mechanism and must not depend on any one project's file layout. */
async function createSourceRepository(): Promise<
  Readonly<{ root: string; baseCommit: string; baseTree: string }>
> {
  const root = await mkdtemp("/private/tmp/app-factory-enrolled-project-");
  roots.push(root);
  await writeFile(join(root, "NOTES.txt"), "enrolled project marker\n", { mode: 0o644 });
  git(root, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  git(root, ["add", "--all"]);
  git(root, [
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "--no-verify",
    "--message=Create trivial enrolled project baseline",
  ]);
  const baseCommit = git(root, ["rev-parse", "HEAD"]);
  const baseTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  return { root: await realpath(root), baseCommit, baseTree };
}

function projectConfiguration(input: {
  sourceRepositoryPath: string;
  baseCommit: string;
  baseTree: string;
  policyFile: string;
}): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    mode: "enrolled-project-v1",
    repositoryId: REPOSITORY_ID,
    sourceRepositoryPath: input.sourceRepositoryPath,
    allowedBaseCommit: input.baseCommit,
    allowedBaseTree: input.baseTree,
    policyFile: input.policyFile,
    taskSemantics: {
      title: "Update the enrolled project",
      objective: "Prove the config-driven enrolled-project mechanism without a real code change.",
      acceptanceCriteria: [
        {
          id: "trivial-check",
          statement: "The trivial verification plans pass.",
          verification: "automated",
        },
      ],
    },
    candidatePolicyLimits: {
      maxChangedFileBytes: 1_048_576,
      maxDiffBytes: 2_097_152,
    },
    verificationPlans: [
      {
        checkId: "probe.swift-version",
        executable: SWIFT,
        args: ["--version"],
        environment: { PATH: "/usr/bin:/bin" },
        protectedFiles: {},
        timeoutMs: 30_000,
        terminationGraceMs: 1_000,
        maxStdoutBytes: 65_536,
        maxStderrBytes: 65_536,
        toolVersions: [{ name: "swift", version: "probe" }],
      },
      {
        checkId: "probe.grep-marker",
        executable: GREP,
        args: ["-c", "marker", `${VERIFICATION_SCRATCH_TOKEN}/output.txt`],
        environment: { PATH: "/usr/bin:/bin" },
        protectedFiles: {},
        timeoutMs: 30_000,
        terminationGraceMs: 1_000,
        maxStdoutBytes: 65_536,
        maxStderrBytes: 65_536,
        toolVersions: [{ name: "grep", version: "probe" }],
      },
    ],
    reviewer: {
      reviewerId: "review.enrolled-project-generic",
      reviewerVersion: "1.0.0",
    },
  };
}

async function createFixture(): Promise<
  Readonly<{
    root: string;
    runtime: string;
    source: string;
    baseCommit: string;
    baseTree: string;
    projectConfigurationFile: string;
    writeProjectConfiguration: (overrides?: Readonly<Record<string, unknown>>) => Promise<string>;
  }>
> {
  const root = await mkdtemp("/private/tmp/app-factory-enrolled-codex-");
  roots.push(root);
  const { root: source, baseCommit, baseTree } = await createSourceRepository();
  const runtime = join(root, "runtime");
  const policyFile = join(root, "reviewed-policy.txt");
  await writeFile(policyFile, "Reviewed enrolled project policy v1\n", { mode: 0o600 });
  const projectConfigurationFile = join(root, "enrolled-project.json");
  const writeProjectConfiguration = async (
    overrides: Readonly<Record<string, unknown>> = {},
  ): Promise<string> => {
    await writeFile(
      projectConfigurationFile,
      JSON.stringify({
        ...projectConfiguration({ sourceRepositoryPath: source, baseCommit, baseTree, policyFile }),
        ...overrides,
      }),
      { mode: 0o600 },
    );
    return projectConfigurationFile;
  };
  await writeProjectConfiguration();
  return {
    root,
    runtime,
    source,
    baseCommit,
    baseTree,
    projectConfigurationFile,
    writeProjectConfiguration,
  };
}

async function writeAttestation(root: string): Promise<string> {
  const path = join(root, "containment-attestation.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      decision:
        "Owner-approved ADR 0002 gate closure for the pinned Codex CLI with the accepted gaps below and standing compensating controls.",
      acceptedGaps: [
        "Codex CLI fine-grained per-path deny rules are not OS-enforced.",
        "The Factory-owned Seatbelt sandbox layer is deferred.",
      ],
      date: "2026-08-14",
      owner: "Priyansh Chordia",
    }),
    { mode: 0o600 },
  );
  return path;
}

async function writeCodexProfile(
  fixtureRoot: string,
  projectConfigurationFile: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<{ profilePath: string; executable: string; executableDigest: Sha256Digest }>> {
  const executable = join(fixtureRoot, "fake-codex");
  const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
  const executableDigest = sha256(executableBytes);
  const codexHome = join(fixtureRoot, "codex-home");
  const profilePath = join(fixtureRoot, "enrolled-codex-profile.json");
  await writeFile(executable, executableBytes, { mode: 0o700 });
  await mkdir(codexHome, { mode: 0o700 });
  await writeFile(
    profilePath,
    JSON.stringify({
      schemaVersion: 1,
      mode: "enrolled-codex-v1",
      projectConfigurationFile,
      executable,
      executableDigest,
      expectedCliVersion: "0.147.0-alpha.1.2",
      model: "gpt-test-pinned",
      codexHome,
      ...overrides,
    }),
    { mode: 0o600 },
  );
  return { profilePath, executable, executableDigest };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("enrolled-codex-v1 local execution profile", () => {
  it("loads with a valid config-driven project and an owner containment attestation", async () => {
    const fixture = await createFixture();
    const { profilePath, executable, executableDigest } = await writeCodexProfile(
      fixture.root,
      fixture.projectConfigurationFile,
    );

    let preflightCalls = 0;
    const loaded = await loadLocalExecutionProfile(profilePath, fixture.runtime, {
      containmentAttestationPath: await writeAttestation(fixture.root),
      codexAgentDependencies: {
        preflight: async (options) => {
          preflightCalls += 1;
          return {
            ready: true,
            executable: options.executable,
            version: "0.147.0-alpha.1.2",
            authConfigured: true,
          } as const;
        },
      },
    });

    expect(preflightCalls).toBe(1);
    expect(loaded.heartbeatIntervalMs).toBe(1_000);
    expect(loaded.projects).toHaveLength(1);
    const project = loaded.projects[0];
    expect(project).toMatchObject({
      repositoryId: REPOSITORY_ID,
      sourceRepositoryPath: fixture.source,
      mirrorMode: "prepared-immutable",
      allowedBaseCommit: fixture.baseCommit,
      allowedBaseTree: fixture.baseTree,
      candidatePolicyLimits: { maxChangedFileBytes: 1_048_576, maxDiffBytes: 2_097_152 },
      environmentAllowlist: [
        "LANG",
        "LC_ALL",
        "PATH",
        "SWIFT_DETERMINISTIC_HASHING",
        "TMPDIR",
        "TZ",
      ],
      requireAgentProtocolEvidence: true,
      agentInvocationIdentity: {
        executable,
        executableDigest,
        cliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
      },
      agentLimits: {
        timeoutMs: 600_000,
        terminationGraceMs: 5_000,
        maxTurns: 1,
        maxEventCount: 50_000,
        maxStdoutBytes: 16_777_216,
        maxStderrBytes: 16_777_216,
      },
      agent: {
        adapterId: "openai.codex",
        adapterVersion: "1.0.0",
      },
      verificationPlans: [
        expect.objectContaining({ checkId: "probe.swift-version", executable: SWIFT }),
        expect.objectContaining({ checkId: "probe.grep-marker", executable: GREP }),
      ],
    });
    expect(project?.verificationPlans).toHaveLength(2);

    // The reviewer descriptor from config produces a working, capability-bound
    // independent-review adapter without any hardcoded project content.
    const reviewerRunId = RunIdSchema.parse("62000000-0000-4000-8000-000000000abc");
    const reviewer = project?.reviewerForRun(reviewerRunId);
    expect(reviewer).toMatchObject({
      reviewerId: "review.enrolled-project-generic",
      reviewerVersion: "1.0.0",
      reviewerRunId,
      capabilities: {
        readCandidate: true,
        writeCandidate: false,
        mutatePolicy: false,
        approveRelease: false,
      },
    });
  });

  // Regression coverage for making readOnlyPaths a per-call input of
  // buildCodexAgentForProject (apps/daemon/src/local-execution-profile.ts) instead of a hardcoded
  // constant: the enrolled profile is one of the two existing callers that must keep getting the
  // exact same default it always has -- Package.swift and Tests read-only -- byte-identical, with no
  // override. (Planner execution's own override is covered in planner-project-execution.test.ts.)
  it("keeps the enrolled profile's default Codex sandbox read-only paths (Package.swift, Tests) unless the caller overrides them", async () => {
    const fixture = await createFixture();
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    let capturedReadOnlyPaths: readonly string[] | undefined;
    const loaded = await loadLocalExecutionProfile(profilePath, fixture.runtime, {
      containmentAttestationPath: await writeAttestation(fixture.root),
      createCodexAgent: async (configuration) => {
        capturedReadOnlyPaths = configuration.readOnlyPaths;
        return { adapterId: "fake.codex", adapterVersion: "0.0.0" } as unknown as CodexLocalAgent;
      },
    });

    expect(capturedReadOnlyPaths).toEqual(DEFAULT_CODEX_READ_ONLY_PATHS_V1);
    expect(loaded.projects).toHaveLength(1);
  });

  // The three tests below cover the maxTurns config-wiring fix: a hardcoded
  // `maxTurns: 1` used to make the T4 multi-turn agent runner unreachable
  // through this profile too. `agentLimits` on the loaded project is exactly
  // what `#buildAgentRunSpec` (apps/daemon/src/verified-local-executor.ts)
  // copies verbatim into `AgentRunSpecV1.limits` for every attempt run
  // through this project, so asserting on it here is asserting on what
  // reaches the AgentRunSpec.

  it("threads a config-supplied maxTurns into the project agentLimits used for the AgentRunSpec", async () => {
    const fixture = await createFixture();
    const { profilePath } = await writeCodexProfile(
      fixture.root,
      fixture.projectConfigurationFile,
      {
        agentLimits: { maxTurns: 6 },
      },
    );

    const loaded = await loadLocalExecutionProfile(profilePath, fixture.runtime, {
      containmentAttestationPath: await writeAttestation(fixture.root),
      codexAgentDependencies: {
        preflight: async (options) => ({
          ready: true,
          executable: options.executable,
          version: "0.147.0-alpha.1.2",
          authConfigured: true,
        }),
      },
    });

    // The configured field changes; every sibling limit keeps its previous
    // hardcoded value, proving per-field defaulting rather than an all-or-
    // nothing override.
    expect(loaded.projects[0]?.agentLimits).toEqual({
      timeoutMs: 600_000,
      terminationGraceMs: 5_000,
      maxTurns: 6,
      maxEventCount: 50_000,
      maxStdoutBytes: 16_777_216,
      maxStderrBytes: 16_777_216,
    });
  });

  it("defaults maxTurns to 1 when agentLimits is absent from the profile config", async () => {
    const fixture = await createFixture();
    // writeCodexProfile with no overrides writes no agentLimits key at all,
    // matching an existing, unmodified enrolled-codex-v1 profile.
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    const loaded = await loadLocalExecutionProfile(profilePath, fixture.runtime, {
      containmentAttestationPath: await writeAttestation(fixture.root),
      codexAgentDependencies: {
        preflight: async (options) => ({
          ready: true,
          executable: options.executable,
          version: "0.147.0-alpha.1.2",
          authConfigured: true,
        }),
      },
    });

    expect(loaded.projects[0]?.agentLimits?.maxTurns).toBe(1);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["above the schema's 1000 bound", 1_001],
  ])("fails closed when agentLimits.maxTurns is out of range (%s)", async (_label, maxTurns) => {
    const fixture = await createFixture();
    const { profilePath } = await writeCodexProfile(
      fixture.root,
      fixture.projectConfigurationFile,
      {
        agentLimits: { maxTurns },
      },
    );

    let preflightCalls = 0;
    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
        codexAgentDependencies: {
          preflight: async (options) => {
            preflightCalls += 1;
            return {
              ready: true,
              executable: options.executable,
              version: "0.147.0-alpha.1.2",
              authConfigured: true,
            } as const;
          },
        },
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
    expect(preflightCalls).toBe(0);
  });

  it("refuses the enrolled-codex-v1 mode without an owner containment attestation and never preflights", async () => {
    const fixture = await createFixture();
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    let preflightCalls = 0;
    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        codexAgentDependencies: {
          preflight: async (options) => {
            preflightCalls += 1;
            return {
              ready: true,
              executable: options.executable,
              version: "0.147.0-alpha.1.2",
              authConfigured: true,
            } as const;
          },
        },
      }),
    ).rejects.toThrow("refuses to load without an owner containment attestation");
    expect(preflightCalls).toBe(0);
  });

  it("fails closed when the Codex executable digest does not match the pinned executable", async () => {
    const fixture = await createFixture();
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);
    const corrupted = JSON.parse(await readFile(profilePath, "utf8")) as Record<string, unknown>;
    corrupted.executableDigest = `sha256:${"0".repeat(64)}`;
    await writeFile(profilePath, JSON.stringify(corrupted), { mode: 0o600 });

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
  });

  it("fails closed when the pinned base commit no longer exists in the source repository", async () => {
    const fixture = await createFixture();
    await fixture.writeProjectConfiguration({ allowedBaseCommit: "f".repeat(40) });
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
  });

  it("fails closed when the pinned base tree does not match the pinned base commit", async () => {
    const fixture = await createFixture();
    // A syntactically valid but wrong tree: the empty-tree object ID.
    await fixture.writeProjectConfiguration({
      allowedBaseTree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    });
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
  });

  it("fails closed when a verification plan uses an environment name outside the reviewed allowlist", async () => {
    const fixture = await createFixture();
    const raw = JSON.parse(await readFile(fixture.projectConfigurationFile, "utf8")) as Record<
      string,
      unknown
    >;
    const plans = raw.verificationPlans as Array<Record<string, unknown>>;
    (plans[0] as Record<string, unknown>).environment = { CODEX_API_KEY: "unsafe" };
    await writeFile(fixture.projectConfigurationFile, JSON.stringify(raw), { mode: 0o600 });
    const { profilePath } = await writeCodexProfile(fixture.root, fixture.projectConfigurationFile);

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
  });
});

describe("enrolled-project-v1 protected-path policy extension", () => {
  it("stays absent by default: the fixture profile carries no extension", async () => {
    const fixture = await createFixture();

    const binding = loadEnrolledProjectExecutionConfiguration(
      fixture.projectConfigurationFile,
      fixture.runtime,
    );

    expect(binding.project.protectedPathPolicyExtension).toBeUndefined();
  });

  it("loads a digest-pinned extension and threads it unchanged into the project binding", async () => {
    const fixture = await createFixture();
    const extension = await writeProtectedPathPolicyExtension(fixture.root, [
      "xcode-project-membership",
    ]);
    await fixture.writeProjectConfiguration({ protectedPathPolicyExtension: extension });

    const binding = loadEnrolledProjectExecutionConfiguration(
      fixture.projectConfigurationFile,
      fixture.runtime,
    );

    expect(binding.project.protectedPathPolicyExtension).toEqual({
      schemaVersion: 1,
      additionalTrustBoundaryPathPrefixes: [],
      additionalTrustBoundarySegments: [],
      additionalPolicyMarkers: [],
      allowances: ["xcode-project-membership"],
    });
  });

  it("fails closed when the extension file does not match its pinned digest", async () => {
    const fixture = await createFixture();
    const extension = await writeProtectedPathPolicyExtension(fixture.root, [
      "xcode-project-membership",
    ]);
    await fixture.writeProjectConfiguration({
      protectedPathPolicyExtension: { file: extension.file, digest: `sha256:${"0".repeat(64)}` },
    });

    expect(() =>
      loadEnrolledProjectExecutionConfiguration(fixture.projectConfigurationFile, fixture.runtime),
    ).toThrow(EnrolledProjectExecutionConfigurationError);
  });

  it("fails closed when the extension file contains an unrecognized relaxation key", async () => {
    const fixture = await createFixture();
    const extension = await writeProtectedPathPolicyExtension(fixture.root, ["made-up-relaxation"]);
    await fixture.writeProjectConfiguration({ protectedPathPolicyExtension: extension });

    expect(() =>
      loadEnrolledProjectExecutionConfiguration(fixture.projectConfigurationFile, fixture.runtime),
    ).toThrow();
  });

  it("fails closed when protectedPathPolicyExtension.file is missing", async () => {
    const fixture = await createFixture();
    await fixture.writeProjectConfiguration({
      protectedPathPolicyExtension: { digest: `sha256:${"0".repeat(64)}` },
    });

    expect(() =>
      loadEnrolledProjectExecutionConfiguration(fixture.projectConfigurationFile, fixture.runtime),
    ).toThrow(EnrolledProjectExecutionConfigurationError);
  });

  it("lets a .pbxproj change pass real candidate verification only once the loaded extension grants the allowance", async () => {
    const fixture = await createFixture();
    const extension = await writeProtectedPathPolicyExtension(fixture.root, [
      "xcode-project-membership",
    ]);
    await fixture.writeProjectConfiguration({ protectedPathPolicyExtension: extension });

    const binding = loadEnrolledProjectExecutionConfiguration(
      fixture.projectConfigurationFile,
      fixture.runtime,
    );
    expect(binding.project.protectedPathPolicyExtension?.allowances).toEqual([
      "xcode-project-membership",
    ]);

    // Reconstruct the exact CandidatePolicy the executor builds from this
    // loaded project (see the candidatePolicy assembly in
    // verified-local-executor.ts) and exercise real candidate verification
    // against a fresh attempt over the same source repository. This proves
    // the extension the config loader produced actually controls
    // verifyCandidate's outcome, not merely that it round-trips.
    const manager = new GitWorkspaceManager({ gitExecutable: GIT });
    const mirror = manager.ensureMirror({
      sourceRepositoryPath: fixture.source,
      runtimeRoot: join(fixture.root, "probe-runtime"),
      repositoryId: "probe-repo",
    });
    const withoutAllowance = manager.createAttemptWorkspace(
      mirror,
      "probe-attempt-rejected",
      fixture.baseCommit,
    );
    await mkdir(join(withoutAllowance.worktreePath, "App.xcodeproj"), { recursive: true });
    await writeFile(
      join(withoutAllowance.worktreePath, "App.xcodeproj", "project.pbxproj"),
      "// pbxproj change\n",
    );
    expect(() =>
      manager.verifyCandidate(withoutAllowance, { authorizedScopes: ["App.xcodeproj"] }),
    ).toThrow(/build, dependency, and verification configuration is protected/u);

    const withAllowance = manager.createAttemptWorkspace(
      mirror,
      "probe-attempt-allowed",
      fixture.baseCommit,
    );
    await mkdir(join(withAllowance.worktreePath, "App.xcodeproj"), { recursive: true });
    await writeFile(
      join(withAllowance.worktreePath, "App.xcodeproj", "project.pbxproj"),
      "// pbxproj change\n",
    );
    const candidate = manager.verifyCandidate(withAllowance, {
      authorizedScopes: ["App.xcodeproj"],
      protectedPathPolicyExtension: binding.project.protectedPathPolicyExtension,
    });
    expect(candidate.changedPaths).toEqual([
      expect.objectContaining({ path: "App.xcodeproj/project.pbxproj", status: "A" }),
    ]);
  });

  it("enforces an enrolled project's additional trust-boundary protection through real candidate verification", async () => {
    const fixture = await createFixture();
    const extension = await writeProtectedPathPolicyExtension(
      fixture.root,
      [],
      "trust-boundary-extension.json",
      { additionalTrustBoundarySegments: ["extra-protected"] },
    );
    await fixture.writeProjectConfiguration({ protectedPathPolicyExtension: extension });

    const binding = loadEnrolledProjectExecutionConfiguration(
      fixture.projectConfigurationFile,
      fixture.runtime,
    );

    const manager = new GitWorkspaceManager({ gitExecutable: GIT });
    const mirror = manager.ensureMirror({
      sourceRepositoryPath: fixture.source,
      runtimeRoot: join(fixture.root, "probe-runtime-trust-boundary"),
      repositoryId: "probe-repo-trust-boundary",
    });
    const workspace = manager.createAttemptWorkspace(
      mirror,
      "probe-attempt-trust-boundary",
      fixture.baseCommit,
    );
    await mkdir(join(workspace.worktreePath, "extra-protected"), { recursive: true });
    await writeFile(join(workspace.worktreePath, "extra-protected", "file.txt"), "content\n");

    // Unprotected without the extension...
    expect(() =>
      manager.verifyCandidate(workspace, { authorizedScopes: ["extra-protected"] }),
    ).not.toThrow();
    // ...but the loaded extension's additional trust-boundary segment makes
    // it protected.
    expect(() =>
      manager.verifyCandidate(workspace, {
        authorizedScopes: ["extra-protected"],
        protectedPathPolicyExtension: binding.project.protectedPathPolicyExtension,
      }),
    ).toThrow(/Factory trust-boundary code is protected/u);
  });
});
