import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TaskSpecV1Schema } from "@app-factory/contracts";

import { createCommandClient } from "../../../packages/command-client/src/index.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  LocalExecutionProfileConfigurationError,
  loadLocalExecutionProfile,
} from "../src/local-execution-profile.js";
import { startFactoryDaemonService } from "../src/factory-daemon-service.js";

const TEMPLATE = fileURLToPath(new URL("../../../fixtures/swift-greeter", import.meta.url));
const roots: string[] = [];

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("/usr/bin/git", args, {
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

async function createFixture(): Promise<
  Readonly<{
    root: string;
    runtime: string;
    fixtureConfigurationFile: string;
  }>
> {
  const root = await mkdtemp("/private/tmp/app-factory-codex-profile-");
  roots.push(root);
  const source = join(root, "swift-greeter");
  const runtime = join(root, "runtime");
  const policyFile = join(root, "reviewed-policy.txt");
  const fixtureConfigurationFile = join(root, "fixture-profile.json");
  await cp(TEMPLATE, source, { recursive: true });
  git(source, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  git(source, ["add", "--all"]);
  git(source, [
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "--no-verify",
    "--message=Create deterministic Swift Greeter baseline",
  ]);
  await writeFile(policyFile, "Reviewed Swift Greeter fixture policy v1\n", { mode: 0o600 });
  await writeFile(
    fixtureConfigurationFile,
    JSON.stringify({
      schemaVersion: 1,
      mode: "swift-greeter-fixture-v1",
      repositoryId: "62000000-0000-4000-8000-000000000002",
      sourceRepositoryPath: await realpath(source),
      policyFile,
    }),
    { mode: 0o600 },
  );
  return { root, runtime, fixtureConfigurationFile };
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("local execution profiles", () => {
  it("retains the deterministic fixture as the exact safe profile", async () => {
    const fixture = await createFixture();
    const loaded = await loadLocalExecutionProfile(
      fixture.fixtureConfigurationFile,
      fixture.runtime,
    );

    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0]?.agent).toMatchObject({
      adapterId: "fixture.swift-greeter-agent",
      adapterVersion: "1.0.0",
    });
  });

  it("builds the explicit Codex conformance profile without invoking a model", async () => {
    const fixture = await createFixture();
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const codexHome = join(fixture.root, "codex-home");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome,
      }),
      { mode: 0o600 },
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
    expect(loaded.projects[0]).toMatchObject({
      mirrorMode: "prepared-immutable",
      environmentAllowlist: [
        "LANG",
        "LC_ALL",
        "PATH",
        "SWIFT_DETERMINISTIC_HASHING",
        "TMPDIR",
        "TZ",
      ],
      agentInvocationEnvironmentNames: [
        "CODEX_HOME",
        "LANG",
        "LC_ALL",
        "NO_COLOR",
        "PATH",
        "RUST_LOG",
        "SWIFT_DETERMINISTIC_HASHING",
        "TERM",
        "TMPDIR",
        "TZ",
      ],
      requireAgentProtocolEvidence: true,
      agentInvocationIdentity: {
        executable,
        executableDigest: sha256(executableBytes),
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
    });

    const service = await startFactoryDaemonService({
      runtimeDirectory: fixture.runtime,
      authorization: "codex-profile-daemon-test-authorization-0001",
      daemonVersion: "0.5.0-codex-profile-test",
      localExecution: loaded,
    });
    try {
      expect(service.getLastSchedulerError()).toBeNull();
    } finally {
      await service.close();
    }
  });

  // The three tests below cover the maxTurns config-wiring fix: a hardcoded
  // `maxTurns: 1` used to make the T4 multi-turn agent runner unreachable
  // through this profile. `agentLimits` on `loaded.projects[0]` is exactly
  // what `#buildAgentRunSpec` (apps/daemon/src/verified-local-executor.ts)
  // copies verbatim into `AgentRunSpecV1.limits` for every attempt run
  // through this project, so asserting on it here is asserting on what
  // reaches the AgentRunSpec.

  it("threads a config-supplied maxTurns into the project agentLimits used for the AgentRunSpec", async () => {
    const fixture = await createFixture();
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const codexHome = join(fixture.root, "codex-home");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome,
        agentLimits: { maxTurns: 6 },
      }),
      { mode: 0o600 },
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
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const codexHome = join(fixture.root, "codex-home");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome,
        // No agentLimits key at all: an existing, unmodified config.
      }),
      { mode: 0o600 },
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

    expect(loaded.projects[0]?.agentLimits?.maxTurns).toBe(1);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["above the schema's 1000 bound", 1_001],
  ])("fails closed when agentLimits.maxTurns is out of range (%s)", async (_label, maxTurns) => {
    const fixture = await createFixture();
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const codexHome = join(fixture.root, "codex-home");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome,
        agentLimits: { maxTurns },
      }),
      { mode: 0o600 },
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

  it(
    "runs a no-network fake Codex executable through the real supervisor and V2 evidence path",
    { timeout: 180_000 },
    async () => {
      const fixture = await createFixture();
      const executable = join(fixture.root, "fake-codex-e2e");
      const codexHome = join(fixture.root, "codex-home-e2e");
      const profilePath = join(fixture.root, "codex-profile-e2e.json");
      const paidCallMarker = join(fixture.root, "paid-call-marker");
      const expectedSource = [
        "public struct GreetingFormatter: Sendable {",
        "    public init() {}",
        "",
        "    public func greeting(for name: String) -> String {",
        '        "Hello, \\(name)!"',
        "    }",
        "",
        "    public func farewell(for name: String) -> String {",
        '        "Goodbye, \\(name)!"',
        "    }",
        "}",
        "",
      ].join("\n");
      const transcript = [
        { type: "thread.started", thread_id: "fake-supervised-thread" },
        { type: "turn.started" },
        {
          type: "item.completed",
          item: {
            id: "fake-supervised-message",
            type: "agent_message",
            text: JSON.stringify({
              schemaVersion: 1,
              reportedDisposition: "finished",
              summary: "The fake supervised conformance edit is complete.",
              changedPaths: ["Sources/Greeter/GreetingFormatter.swift"],
              blocker: null,
            }),
          },
        },
        {
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 4, cached_input_tokens: 3 },
        },
      ].map((event) => JSON.stringify(event));
      const script = [
        "#!/bin/sh",
        "set -eu",
        `printf '%s' ${shellQuote(expectedSource)} > Sources/Greeter/GreetingFormatter.swift`,
        `printf '%s\\n' ${transcript.map(shellQuote).join(" ")}`,
        "",
      ].join("\n");
      const executableBytes = Buffer.from(script, "utf8");
      await writeFile(executable, executableBytes, { mode: 0o700 });
      await mkdir(codexHome, { mode: 0o700 });
      await writeFile(
        profilePath,
        JSON.stringify({
          schemaVersion: 1,
          mode: "swift-greeter-codex-v1",
          fixtureConfigurationFile: fixture.fixtureConfigurationFile,
          executable,
          executableDigest: sha256(executableBytes),
          expectedCliVersion: "0.147.0-alpha.1.2",
          model: "gpt-test-pinned",
          codexHome,
        }),
        { mode: 0o600 },
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
      const project = loaded.projects[0];
      if (project === undefined) throw new Error("Codex conformance project was not loaded");
      const task = TaskSpecV1Schema.parse({
        schemaVersion: 1,
        taskId: "62000000-0000-4000-8000-000000000099",
        projectId: "62000000-0000-4000-8000-000000000001",
        createdAt: "2026-08-11T00:00:00.000Z",
        title: "Add a farewell to GreetingFormatter",
        objective:
          "Add a public farewell(for:) method that returns `Goodbye, <name>!` without changing greeting behavior.",
        acceptanceCriteria: [
          {
            id: "returns-farewell",
            statement: 'farewell(for: "Factory") returns "Goodbye, Factory!".',
            verification: "automated",
          },
          {
            id: "preserves-greeting",
            statement: "Existing greeting tests continue to pass.",
            verification: "automated",
          },
        ],
        base: { repositoryId: project.repositoryId, commit: project.allowedBaseCommit },
        requestedScope: { paths: ["Sources/Greeter/GreetingFormatter.swift"] },
        policyDigest: sha256(project.policyBytes),
      });
      const authorization = "codex-supervisor-e2e-authorization-0001";
      const service = await startFactoryDaemonService({
        runtimeDirectory: fixture.runtime,
        authorization,
        daemonVersion: "0.5.0-codex-supervisor-e2e",
        pollIntervalMs: 5,
        localExecution: loaded,
      });
      const client = createCommandClient({
        socketPath: service.socketPath,
        authorization,
        origin: "cli",
      });
      try {
        const intake = await client.run(task);
        let terminalStatus: Awaited<ReturnType<typeof client.status>> | undefined;
        const terminalDeadline = Date.now() + 120_000;
        do {
          terminalStatus = await client.status(intake.attemptId);
          const status = terminalStatus;
          if (["blocked", "cancelled", "failed", "succeeded"].includes(status.attempt.state)) {
            break;
          }
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
        } while (Date.now() < terminalDeadline);
        if (terminalStatus?.attempt.state !== "succeeded") {
          const runnerRoot = join(fixture.runtime, "local-execution", "codex-runs");
          const runKeys = (await readdir(runnerRoot)).filter((name) => name.startsWith("codex-"));
          const captures = await Promise.all(
            runKeys.slice(-3).map(async (runKey) => {
              const stdoutPath = join(runnerRoot, runKey, "stdout.bin");
              const stderrPath = join(runnerRoot, runKey, "stderr.bin");
              return {
                runKey,
                files: await readdir(join(runnerRoot, runKey)),
                stdout: existsSync(stdoutPath) ? await readFile(stdoutPath, "utf8") : "<missing>",
                stderr: existsSync(stderrPath) ? await readFile(stderrPath, "utf8") : "<missing>",
              };
            }),
          );
          throw new Error(
            `Fake Codex conformance attempt did not succeed: ${JSON.stringify(terminalStatus)}; captures=${JSON.stringify(captures)}`,
          );
        }
        const verified = await client.verifyEvidence(intake.attemptId);
        expect(verified.evidence.map((item) => item.kind)).toContain("agent-run");
        expect(existsSync(paidCallMarker)).toBe(false);
      } finally {
        client.close();
        await service.close();
      }
    },
  );

  it("rejects non-exact Codex profile fields before preflight", async () => {
    const fixture = await createFixture();
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable: "/bin/false",
        executableDigest: `sha256:${"0".repeat(64)}`,
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome: fixture.root,
        unexpected: true,
      }),
      { mode: 0o600 },
    );

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toBeInstanceOf(LocalExecutionProfileConfigurationError);
  });

  it("refuses the Codex mode without an owner containment attestation and never preflights", async () => {
    const fixture = await createFixture();
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const codexHome = join(fixture.root, "codex-home");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.6.6",
        model: "gpt-test-pinned",
        codexHome,
      }),
      { mode: 0o600 },
    );

    let preflightCalls = 0;
    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        codexAgentDependencies: {
          preflight: async (options) => {
            preflightCalls += 1;
            return {
              ready: true,
              executable: options.executable,
              version: "0.147.0-alpha.6.6",
              authConfigured: true,
            } as const;
          },
        },
      }),
    ).rejects.toThrow("refuses to load without an owner containment attestation");
    expect(preflightCalls).toBe(0);
  });

  it("rejects Codex authentication storage nested inside trusted Factory runtime", async () => {
    const fixture = await createFixture();
    const executable = join(fixture.root, "fake-codex");
    const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
    const profilePath = join(fixture.root, "codex-profile.json");
    await writeFile(executable, executableBytes, { mode: 0o700 });
    await writeFile(
      profilePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-codex-v1",
        fixtureConfigurationFile: fixture.fixtureConfigurationFile,
        executable,
        executableDigest: sha256(executableBytes),
        expectedCliVersion: "0.147.0-alpha.1.2",
        model: "gpt-test-pinned",
        codexHome: join(fixture.runtime, "local-execution", "codex-tmp"),
      }),
      { mode: 0o600 },
    );

    await expect(
      loadLocalExecutionProfile(profilePath, fixture.runtime, {
        containmentAttestationPath: await writeAttestation(fixture.root),
      }),
    ).rejects.toThrow(/Codex home and Factory runtime must be separate/);
  });
});
