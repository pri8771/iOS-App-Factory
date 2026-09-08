import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DaemonConfigurationError,
  formatSchedulerErrorLogLine,
  loadDaemonProcessConfiguration,
  readPrivateAuthorizationFile,
  runDaemonProcess,
  type DaemonSignalPort,
} from "../src/daemon-entrypoint.js";
import type { FactoryDaemonService } from "../src/factory-daemon-service.js";

const roots: string[] = [];
const TOKEN = "daemon-private-authorization-token-000001";
const SWIFT_GREETER_TEMPLATE = fileURLToPath(
  new URL("../../../fixtures/swift-greeter", import.meta.url),
);

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

async function root(): Promise<string> {
  const path = await mkdtemp(join("/private/tmp", "factory-daemon-entrypoint-"));
  roots.push(path);
  return path;
}

const VALID_ATTESTATION = {
  schemaVersion: 1,
  decision:
    "Owner-approved ADR 0002 gate closure for the pinned Codex CLI with the accepted gaps below and standing compensating controls.",
  acceptedGaps: [
    "Codex CLI fine-grained per-path deny rules are not OS-enforced.",
    "The Factory-owned Seatbelt sandbox layer is deferred.",
  ],
  date: "2026-08-14",
  owner: "Priyansh Chordia",
} as const;

async function createCodexProfileSetup(directory: string): Promise<
  Readonly<{
    environment: Readonly<{
      APP_FACTORY_RUNTIME_DIR: string;
      APP_FACTORY_AUTH_FILE: string;
      APP_FACTORY_DAEMON_VERSION: string;
      APP_FACTORY_LOCAL_EXECUTION_CONFIG: string;
    }>;
    attestationFile: string;
  }>
> {
  const authFile = join(directory, "authorization");
  const policyFile = join(directory, "reviewed-policy");
  const fixtureConfig = join(directory, "fixture-profile.json");
  const codexConfig = join(directory, "codex-profile.json");
  const attestationFile = join(directory, "containment-attestation.json");
  const executable = join(directory, "fake-codex");
  const codexHome = join(directory, "codex-home");
  const sourceRepositoryPath = join(directory, "swift-greeter");
  await cp(SWIFT_GREETER_TEMPLATE, sourceRepositoryPath, { recursive: true });
  git(sourceRepositoryPath, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  git(sourceRepositoryPath, ["add", "--all"]);
  git(sourceRepositoryPath, [
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
  await writeFile(authFile, TOKEN, { mode: 0o600 });
  await writeFile(policyFile, "Reviewed Swift Greeter fixture policy v1\n", { mode: 0o600 });
  await writeFile(
    fixtureConfig,
    JSON.stringify({
      schemaVersion: 1,
      mode: "swift-greeter-fixture-v1",
      repositoryId: "62000000-0000-4000-8000-000000000002",
      sourceRepositoryPath: await realpath(sourceRepositoryPath),
      policyFile,
    }),
    { mode: 0o600 },
  );
  const executableBytes = Buffer.from("#!/bin/sh\nexit 1\n", "utf8");
  await writeFile(executable, executableBytes, { mode: 0o700 });
  await mkdir(codexHome, { mode: 0o700 });
  await writeFile(
    codexConfig,
    JSON.stringify({
      schemaVersion: 1,
      mode: "swift-greeter-codex-v1",
      fixtureConfigurationFile: fixtureConfig,
      executable,
      executableDigest: `sha256:${createHash("sha256").update(executableBytes).digest("hex")}`,
      expectedCliVersion: "0.147.0-alpha.6.6",
      model: "gpt-test-pinned",
      codexHome,
    }),
    { mode: 0o600 },
  );
  await writeFile(attestationFile, JSON.stringify(VALID_ATTESTATION), { mode: 0o600 });
  return {
    environment: {
      APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
      APP_FACTORY_AUTH_FILE: authFile,
      APP_FACTORY_DAEMON_VERSION: "0.6.0-codex-gate",
      APP_FACTORY_LOCAL_EXECUTION_CONFIG: codexConfig,
    },
    attestationFile,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("daemon process configuration", () => {
  it("loads a bounded user-private token without placing it in environment configuration", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, `${TOKEN}\n`, { mode: 0o600 });

    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0-test",
        APP_FACTORY_POLL_INTERVAL_MS: "25",
      }),
    ).resolves.toEqual({
      runtimeDirectory: join(directory, "runtime"),
      authorization: TOKEN,
      daemonVersion: "0.3.0-test",
      pollIntervalMs: 25,
    });
  });

  it("signal scheduler: absent by default, and clamps its poll cadence to a 30s floor when enabled (Wave 7)", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });

    // Default (APP_FACTORY_SIGNAL_SCHEDULER_ENABLED unset): the resolved configuration carries no
    // `signalScheduler` key at all -- `factory-daemon-service.ts` never builds the subsystem.
    const disabled = await loadDaemonProcessConfiguration({
      APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
      APP_FACTORY_AUTH_FILE: authFile,
      APP_FACTORY_DAEMON_VERSION: "0.3.0-test",
      APP_FACTORY_POLL_INTERVAL_MS: "20",
    });
    expect(disabled).not.toHaveProperty("signalScheduler");

    // Enabled, with the daemon's own global poll cadence (20ms, test-fast) far below the
    // scheduler's own 30s floor: the resolved config clamps to the floor, never the raw value --
    // an unattended real-model loop stays on a deliberately slow, opt-in cadence.
    const enabled = await loadDaemonProcessConfiguration({
      APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
      APP_FACTORY_AUTH_FILE: authFile,
      APP_FACTORY_DAEMON_VERSION: "0.3.0-test",
      APP_FACTORY_POLL_INTERVAL_MS: "20",
      APP_FACTORY_SIGNAL_SCHEDULER_ENABLED: "1",
    });
    expect(enabled.signalScheduler).toEqual({ enabled: true, pollIntervalMs: 30_000 });
    expect(enabled.pollIntervalMs).toBe(20);
  });

  it("rejects a group-readable credential and a symlink", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    const link = join(directory, "authorization-link");
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    await chmod(authFile, 0o640);
    await expect(readPrivateAuthorizationFile(authFile)).rejects.toThrow(
      "must not be accessible by group or others",
    );

    await chmod(authFile, 0o600);
    await symlink(authFile, link);
    await expect(readPrivateAuthorizationFile(link)).rejects.toThrow("cannot be opened safely");
  });

  it("fails closed on missing, relative, malformed, and oversized settings", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });

    await expect(loadDaemonProcessConfiguration({})).rejects.toBeInstanceOf(
      DaemonConfigurationError,
    );
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: "relative",
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0",
      }),
    ).rejects.toThrow("must be an absolute path");
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: directory,
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "version with spaces",
      }),
    ).rejects.toThrow("portable version identifier");
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: directory,
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.3.0",
        APP_FACTORY_POLL_INTERVAL_MS: "60001",
      }),
    ).rejects.toThrow("must not exceed 60000");
  });

  it("loads the packaged deterministic Swift Greeter profile only from a private file", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    const policyFile = join(directory, "reviewed-policy");
    const executionConfig = join(directory, "local-execution.json");
    const sourceRepositoryPath = join(directory, "swift-greeter");
    await cp(SWIFT_GREETER_TEMPLATE, sourceRepositoryPath, { recursive: true });
    git(sourceRepositoryPath, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
    git(sourceRepositoryPath, ["add", "--all"]);
    git(sourceRepositoryPath, [
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
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    await writeFile(policyFile, "Reviewed Swift Greeter fixture policy v1\n", { mode: 0o600 });
    await writeFile(
      executionConfig,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-fixture-v1",
        repositoryId: "62000000-0000-4000-8000-000000000002",
        sourceRepositoryPath: await realpath(sourceRepositoryPath),
        policyFile,
      }),
      { mode: 0o600 },
    );

    const loaded = await loadDaemonProcessConfiguration({
      APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
      APP_FACTORY_AUTH_FILE: authFile,
      APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
      APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
    });
    expect(loaded.localExecution?.projects).toHaveLength(1);
    expect(loaded.localExecution?.projects[0]).toMatchObject({
      repositoryId: "62000000-0000-4000-8000-000000000002",
      mirrorMode: "prepared-immutable",
      sourceIdentityDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      allowedBaseCommit: git(sourceRepositoryPath, ["rev-parse", "HEAD"]),
      allowedBaseTree: "e69344ba899cb78fb5ad51ab56f9b4750d0b13b9",
      taskSemanticProfileDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      agent: {
        adapterId: "fixture.swift-greeter-agent",
        adapterVersion: "1.0.0",
      },
    });

    const helperMarker = join(directory, "fsmonitor-ran");
    const helper = join(directory, "hostile-fsmonitor");
    await writeFile(helper, `#!/bin/sh\nprintf ran > ${JSON.stringify(helperMarker)}\n`, {
      mode: 0o700,
    });
    git(sourceRepositoryPath, ["config", "core.fsmonitor", helper]);
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
        APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
      }),
    ).rejects.toThrow("unreviewed setting");
    expect(spawnSync("/usr/bin/test", ["-e", helperMarker]).status).not.toBe(0);
    git(sourceRepositoryPath, ["config", "--unset", "core.fsmonitor"]);

    const ignoredBuild = join(sourceRepositoryPath, ".build");
    await mkdir(ignoredBuild);
    await writeFile(join(ignoredBuild, "unreviewed"), "hidden\n");
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
        APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
      }),
    ).rejects.toThrow("unreviewed tracked, ignored, or untracked paths");
    await rm(ignoredBuild, { recursive: true });

    await chmod(executionConfig, 0o640);
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
        APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
      }),
    ).rejects.toThrow("current-user-owned mode-0600 file");

    await chmod(executionConfig, 0o600);
    await writeFile(
      executionConfig,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-fixture-v1",
        repositoryId: "62000000-0000-4000-8000-000000000002",
        sourceRepositoryPath: await realpath(sourceRepositoryPath),
        policyFile,
        swiftExecutable: "/private/tmp/untrusted-swift",
      }),
      { mode: 0o600 },
    );
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
        APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
      }),
    ).rejects.toThrow("unsupported or non-exact shape");

    await writeFile(join(sourceRepositoryPath, "Package.swift"), "// unreviewed package\n");
    git(sourceRepositoryPath, ["add", "--all"]);
    git(sourceRepositoryPath, [
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "--no-gpg-sign",
      "--no-verify",
      "--message=Unreviewed fixture",
    ]);
    await writeFile(
      executionConfig,
      JSON.stringify({
        schemaVersion: 1,
        mode: "swift-greeter-fixture-v1",
        repositoryId: "62000000-0000-4000-8000-000000000002",
        sourceRepositoryPath: await realpath(sourceRepositoryPath),
        policyFile,
      }),
      { mode: 0o600 },
    );
    await expect(
      loadDaemonProcessConfiguration({
        APP_FACTORY_RUNTIME_DIR: join(directory, "runtime"),
        APP_FACTORY_AUTH_FILE: authFile,
        APP_FACTORY_DAEMON_VERSION: "0.4.0-fixture",
        APP_FACTORY_LOCAL_EXECUTION_CONFIG: executionConfig,
      }),
    ).rejects.toThrow("not the exact reviewed Swift Greeter tree");
  });

  it("refuses the real-identity Codex profile without an owner containment attestation", async () => {
    const directory = await root();
    const setup = await createCodexProfileSetup(directory);
    let preflightCalls = 0;
    await expect(
      loadDaemonProcessConfiguration(setup.environment, {
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

  it("loads the Codex profile once a valid owner containment attestation is configured", async () => {
    const directory = await root();
    const setup = await createCodexProfileSetup(directory);
    const loaded = await loadDaemonProcessConfiguration(
      {
        ...setup.environment,
        APP_FACTORY_CONTAINMENT_ATTESTATION: setup.attestationFile,
      },
      {
        codexAgentDependencies: {
          preflight: async (options) =>
            ({
              ready: true,
              executable: options.executable,
              version: "0.147.0-alpha.6.6",
              authConfigured: true,
            }) as const,
        },
      },
    );
    expect(loaded.localExecution?.projects).toHaveLength(1);
    expect(loaded.localExecution?.projects[0]?.agent).toMatchObject({
      adapterId: "openai.codex",
      adapterVersion: "1.0.0",
    });
  });

  it("fails closed on malformed owner containment attestations", async () => {
    const directory = await root();
    const setup = await createCodexProfileSetup(directory);
    const environment = {
      ...setup.environment,
      APP_FACTORY_CONTAINMENT_ATTESTATION: setup.attestationFile,
    };

    await writeFile(setup.attestationFile, JSON.stringify({ ...VALID_ATTESTATION, extra: true }), {
      mode: 0o600,
    });
    await expect(loadDaemonProcessConfiguration(environment)).rejects.toThrow(
      "must contain exactly schemaVersion, decision, acceptedGaps, date, and owner",
    );

    await writeFile(
      setup.attestationFile,
      JSON.stringify({ ...VALID_ATTESTATION, acceptedGaps: [] }),
      { mode: 0o600 },
    );
    await expect(loadDaemonProcessConfiguration(environment)).rejects.toThrow(
      "acceptedGaps must be a non-empty bounded list",
    );

    await writeFile(setup.attestationFile, JSON.stringify({ ...VALID_ATTESTATION, owner: " " }), {
      mode: 0o600,
    });
    await expect(loadDaemonProcessConfiguration(environment)).rejects.toThrow(
      "owner must be non-empty bounded text",
    );

    await writeFile(
      setup.attestationFile,
      JSON.stringify({ ...VALID_ATTESTATION, date: "2026-8-14" }),
      { mode: 0o600 },
    );
    await expect(loadDaemonProcessConfiguration(environment)).rejects.toThrow(
      "date must be an exact YYYY-MM-DD calendar date",
    );

    await writeFile(setup.attestationFile, JSON.stringify(VALID_ATTESTATION), { mode: 0o600 });
    await chmod(setup.attestationFile, 0o640);
    await expect(loadDaemonProcessConfiguration(environment)).rejects.toThrow(
      "current-user-owned mode-0600 file",
    );
  });

  it("zeroes the raw authorization read buffer after decoding", async () => {
    const directory = await root();
    const authFile = join(directory, "authorization");
    await writeFile(authFile, TOKEN, { mode: 0o600 });
    const originalAlloc = Buffer.alloc;
    let captured: Buffer | undefined;
    const allocation = vi.spyOn(Buffer, "alloc").mockImplementation(((size: number) => {
      const value = originalAlloc(size);
      if (size === 515) captured = value;
      return value;
    }) as typeof Buffer.alloc);
    try {
      await expect(readPrivateAuthorizationFile(authFile)).resolves.toBe(TOKEN);
    } finally {
      allocation.mockRestore();
    }
    expect([...(captured ?? [])]).toEqual(Array(515).fill(0));
  });
});

function signalPort(emitter: EventEmitter): DaemonSignalPort {
  return {
    once: (signal, listener) => emitter.once(signal, listener),
    removeListener: (signal, listener) => emitter.removeListener(signal, listener),
  };
}

describe("scheduler error log line", () => {
  const NOW = () => "2026-08-13T12:00:00.000Z";

  it("renders one structured JSON line with ts, code, attemptId, and message", () => {
    const attemptId = "00000000-0000-4000-8000-000000000005";
    const line = formatSchedulerErrorLogLine(
      new Error(`The scheduler attempt no longer exists: ${attemptId}`, {
        cause: Object.assign(new Error("nested"), { name: "SchedulerFenceError" }),
      }),
      NOW,
    );
    expect(line.includes("\n")).toBe(false);
    expect(JSON.parse(line)).toEqual({
      ts: "2026-08-13T12:00:00.000Z",
      code: "Error",
      attemptId,
      message: `The scheduler attempt no longer exists: ${attemptId}`,
    });
  });

  it("falls back to a safe code and recovers the attemptId from a wrapped cause", () => {
    const attemptId = "00000000-0000-4000-8000-000000000006";
    const cause = new Error(`Attempt does not exist: ${attemptId}`);
    const wrapped = new Error("The scheduler lease is absent, expired, or stale", { cause });
    wrapped.name = "SchedulerFenceError";
    const line = formatSchedulerErrorLogLine(wrapped, NOW);
    expect(JSON.parse(line)).toEqual({
      ts: "2026-08-13T12:00:00.000Z",
      code: "SchedulerFenceError",
      attemptId,
      message: "The scheduler lease is absent, expired, or stale",
    });
  });

  it("never reproduces an untrusted error name and bounds an oversized message", () => {
    const injected = Object.assign(new Error(`x${"y".repeat(600)}`), { name: "Injected\nLog" });
    const line = formatSchedulerErrorLogLine(injected, NOW);
    expect(line).not.toContain("Injected");
    const parsed = JSON.parse(line) as Readonly<{ code: string; message: string }>;
    expect(parsed.code).toBe("UnknownError");
    expect(parsed.message.length).toBeLessThanOrEqual(503);
    expect(parsed.message.endsWith("...")).toBe(true);
  });

  it("handles a non-Error throw without leaking its shape", () => {
    const line = formatSchedulerErrorLogLine({ password: "hunter2" }, NOW);
    expect(line).not.toContain("hunter2");
    expect(JSON.parse(line)).toEqual({
      ts: "2026-08-13T12:00:00.000Z",
      code: "UnknownError",
      attemptId: null,
      message: "A non-Error value was thrown by the scheduler loop.",
    });
  });
});

describe("daemon process lifecycle", () => {
  it("catches a signal during startup and logs scheduler failures as one structured line without attacker text", async () => {
    const emitter = new EventEmitter();
    const close = vi.fn(async () => undefined);
    let resolveStart: ((service: FactoryDaemonService) => void) | undefined;
    const starting = new Promise<FactoryDaemonService>((resolve) => {
      resolveStart = resolve;
    });
    const stderr = vi.fn();
    const attemptId = "00000000-0000-4000-8000-000000000007";
    const running = runDaemonProcess(
      {},
      { stderr },
      {
        signals: signalPort(emitter),
        now: () => "2026-08-13T12:00:00.000Z",
        start: async (_environment, onSchedulerError) => {
          onSchedulerError(
            Object.assign(new Error(`attempt ${attemptId} lost its lease`), {
              name: "Injected\nLog",
            }),
          );
          return await starting;
        },
        shutdownTimeoutMs: 50,
      },
    );
    emitter.emit("SIGTERM");
    resolveStart?.({ close } as unknown as FactoryDaemonService);

    await expect(running).resolves.toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledTimes(1);
    const [line] = stderr.mock.calls[0] as [string];
    expect(line.endsWith("\n")).toBe(true);
    expect(line.indexOf("\n")).toBe(line.length - 1);
    expect(JSON.parse(line.trimEnd())).toEqual({
      ts: "2026-08-13T12:00:00.000Z",
      code: "UnknownError",
      attemptId,
      message: `attempt ${attemptId} lost its lease`,
    });
    expect(stderr.mock.calls.flat().join("")).not.toContain("Injected");
  });

  it("bounds a daemon shutdown that never settles", async () => {
    const emitter = new EventEmitter();
    const stderr = vi.fn();
    const close = vi.fn(async () => await new Promise<void>(() => undefined));
    const running = runDaemonProcess(
      {},
      { stderr },
      {
        signals: signalPort(emitter),
        start: async () => ({ close }) as unknown as FactoryDaemonService,
        shutdownTimeoutMs: 5,
      },
    );
    emitter.emit("SIGINT");

    await expect(running).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith("factory-daemon: shutdown did not complete cleanly.\n");
  });
});
