import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attestLaunchAgentProgramFiles,
  buildLaunchAgentPlan,
  createLaunchAgentReceipt,
  createLaunchctlCommandPort,
  decideLaunchAgentInstallation,
  inspectLaunchAgentFile,
  parseLaunchAgentReceipt,
  queryLaunchAgentStatus,
  ServiceManagerContractError,
  type LaunchAgentConfigurationV1,
  type LaunchctlCommandPortOptions,
} from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

function existing(bytes: Uint8Array) {
  return {
    kind: "regular" as const,
    bytes,
    mode: 0o600,
    userId: typeof process.getuid === "function" ? process.getuid() : 501,
  };
}

function configuration(
  overrides: Partial<LaunchAgentConfigurationV1> = {},
): LaunchAgentConfigurationV1 {
  return {
    schemaVersion: 1,
    userId: 501,
    launchAgentsDirectory: "/Users/example/Library/LaunchAgents",
    nodeExecutable: "/opt/app-factory/node/bin/node",
    daemonEntrypoint: "/Users/example/code/app-factory/apps/daemon/dist/main.js",
    runtimeDirectory: "/Users/example/Library/Application Support/AppFactory/runtime",
    authorizationFile: "/Users/example/Library/Application Support/AppFactory/auth/token",
    logDirectory: "/Users/example/Library/Logs/AppFactory",
    daemonVersion: "0.3.0",
    ...overrides,
  };
}

async function configurationWithPrograms(
  overrides: Partial<LaunchAgentConfigurationV1> = {},
): Promise<LaunchAgentConfigurationV1> {
  const root = await mkdtemp(join("/private/tmp", "factory-service-programs-"));
  roots.push(root);
  const launchAgentsDirectory = join(root, "LaunchAgents");
  const nodeExecutable = join(root, "node");
  const daemonEntrypoint = join(root, "daemon.js");
  await mkdir(launchAgentsDirectory);
  await writeFile(nodeExecutable, "#!/bin/sh\n", { mode: 0o700 });
  await writeFile(daemonEntrypoint, "export {};\n", { mode: 0o600 });
  return configuration({
    userId: typeof process.getuid === "function" ? process.getuid() : 501,
    launchAgentsDirectory,
    nodeExecutable,
    daemonEntrypoint,
    runtimeDirectory: join(root, "runtime"),
    authorizationFile: join(root, "auth", "token"),
    logDirectory: join(root, "logs"),
    ...overrides,
  });
}

describe("macOS LaunchAgent planning", () => {
  it("produces deterministic argv and a plist that contains no credential value", () => {
    const first = buildLaunchAgentPlan(configuration());
    const second = buildLaunchAgentPlan(configuration());
    const plist = Buffer.from(first.plistBytes).toString("utf8");

    expect(first).toEqual(second);
    expect(first.plistPath).toBe(
      "/Users/example/Library/LaunchAgents/com.priyanshchordia.app-factory.daemon.plist",
    );
    expect(plist).toContain("APP_FACTORY_AUTH_FILE");
    expect(plist).not.toContain("APP_FACTORY_AUTH_TOKEN");
    expect(first.activate).toEqual([
      {
        executable: "/bin/launchctl",
        arguments: ["bootstrap", "gui/501", first.plistPath],
      },
      {
        executable: "/bin/launchctl",
        arguments: ["kickstart", "-k", "gui/501/com.priyanshchordia.app-factory.daemon"],
      },
    ]);
  });

  it("escapes XML values and rejects unsafe or overly broad paths", () => {
    const plan = buildLaunchAgentPlan(
      configuration({ logDirectory: "/Users/example/Library/Logs/App & Factory" }),
    );
    expect(Buffer.from(plan.plistBytes).toString("utf8")).toContain("App &amp; Factory");
    expect(() => buildLaunchAgentPlan(configuration({ runtimeDirectory: "/" }))).toThrow(
      ServiceManagerContractError,
    );
    expect(() =>
      buildLaunchAgentPlan(configuration({ launchAgentsDirectory: "/private/tmp" })),
    ).toThrow("must end in LaunchAgents");
    expect(() =>
      buildLaunchAgentPlan(
        configuration({
          userId: (typeof process.getuid === "function" ? process.getuid() : 501) + 1,
        }),
      ),
    ).toThrow("must match the current process user");
  });

  it("never lets a self-asserted receipt authorize replacement", async () => {
    const config = await configurationWithPrograms();
    const oldPlan = buildLaunchAgentPlan({ ...config, daemonVersion: "0.2.0" });
    const newPlan = buildLaunchAgentPlan({ ...config, daemonVersion: "0.3.0" });
    const attestation = await attestLaunchAgentProgramFiles(newPlan);

    expect(
      decideLaunchAgentInstallation(newPlan, { kind: "absent" }, null, attestation).operation,
    ).toBe("create");
    expect(
      decideLaunchAgentInstallation(newPlan, existing(newPlan.plistBytes), null, attestation)
        .operation,
    ).toBe("noop");
    expect(
      decideLaunchAgentInstallation(newPlan, existing(oldPlan.plistBytes), null, attestation)
        .operation,
    ).toBe("blocked-foreign");
    expect(
      decideLaunchAgentInstallation(
        newPlan,
        existing(oldPlan.plistBytes),
        createLaunchAgentReceipt(oldPlan),
        attestation,
      ),
    ).toMatchObject({
      operation: "blocked-foreign",
      expectedExistingDigest: oldPlan.plistDigest,
      planDigest: newPlan.plistDigest,
    });
    expect(
      decideLaunchAgentInstallation(newPlan, { kind: "symlink" }, null, attestation).operation,
    ).toBe("blocked-foreign");
  });

  it("blocks unsafe plist metadata and forged program attestations", async () => {
    const plan = buildLaunchAgentPlan(await configurationWithPrograms());
    const attestation = await attestLaunchAgentProgramFiles(plan);
    expect(
      decideLaunchAgentInstallation(
        plan,
        { ...existing(plan.plistBytes), mode: 0o644 },
        createLaunchAgentReceipt(plan),
        attestation,
      ).operation,
    ).toBe("blocked-foreign");
    expect(
      decideLaunchAgentInstallation(
        plan,
        { ...existing(plan.plistBytes), userId: 502 },
        createLaunchAgentReceipt(plan),
        attestation,
      ).operation,
    ).toBe("blocked-foreign");
    expect(() =>
      decideLaunchAgentInstallation(plan, { kind: "absent" }, null, { ...attestation }),
    ).toThrow("trusted in-process attestation");
  });

  it("attests exact non-symlink program files with safe ownership and modes", async () => {
    const config = await configurationWithPrograms();
    const plan = buildLaunchAgentPlan(config);
    await expect(attestLaunchAgentProgramFiles(plan)).resolves.toMatchObject({
      nodeExecutable: config.nodeExecutable,
      daemonEntrypoint: config.daemonEntrypoint,
    });
    await chmod(config.daemonEntrypoint, 0o622);
    await expect(attestLaunchAgentProgramFiles(plan)).rejects.toThrow(
      "must not be writable by group or others",
    );
  });

  it("strictly parses receipts and maps launchctl observations without retaining output", async () => {
    const plan = buildLaunchAgentPlan(configuration());
    expect(parseLaunchAgentReceipt(createLaunchAgentReceipt(plan))).toEqual(
      createLaunchAgentReceipt(plan),
    );
    expect(() =>
      parseLaunchAgentReceipt({ ...createLaunchAgentReceipt(plan), extra: true }),
    ).toThrow("unexpected or missing fields");
    const stdout = Uint8Array.from(Buffer.from("service state"));
    const stderr = Uint8Array.from(Buffer.from("diagnostic"));
    const port = {
      run: vi.fn(async () => ({
        exitCode: 0,
        stdout,
        stderr,
        timedOut: false,
        outputLimitExceeded: false,
      })),
    };
    await expect(queryLaunchAgentStatus(plan, port)).resolves.toMatchObject({ status: "loaded" });
    expect([...stdout]).toEqual(Array(stdout.byteLength).fill(0));
    expect([...stderr]).toEqual(Array(stderr.byteLength).fill(0));
    expect(port.run).toHaveBeenCalledWith(plan.inspect, expect.any(AbortSignal));
  });

  it("escalates to SIGKILL and settles when launchctl ignores termination", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
    });
    const spawnProcess = vi.fn(() => child) as unknown as NonNullable<
      LaunchctlCommandPortOptions["spawnProcess"]
    >;
    const commandPort = createLaunchctlCommandPort({
      timeoutMs: 5,
      terminateGraceMs: 5,
      spawnProcess,
    });
    const plan = buildLaunchAgentPlan(configuration());

    await expect(
      commandPort.run(plan.inspect, new AbortController().signal),
    ).resolves.toMatchObject({
      exitCode: 255,
      timedOut: true,
    });
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });

  it("inspects regular, absent, and symlinked plist paths without following links", async () => {
    const root = await mkdtemp(join("/private/tmp", "factory-service-manager-"));
    roots.push(root);
    const launchAgentsDirectory = join(root, "LaunchAgents");
    await mkdir(launchAgentsDirectory);
    const plan = buildLaunchAgentPlan(
      configuration({
        userId: typeof process.getuid === "function" ? process.getuid() : 501,
        launchAgentsDirectory,
      }),
    );
    await expect(inspectLaunchAgentFile(plan.plistPath)).resolves.toEqual({ kind: "absent" });
    await writeFile(plan.plistPath, plan.plistBytes, { mode: 0o600 });
    await expect(inspectLaunchAgentFile(plan.plistPath)).resolves.toMatchObject({
      kind: "regular",
      mode: 0o600,
      bytes: plan.plistBytes,
    });
    const link = join(launchAgentsDirectory, "linked.plist");
    await symlink(plan.plistPath, link);
    await expect(inspectLaunchAgentFile(link)).resolves.toEqual({ kind: "symlink" });
    await chmod(plan.plistPath, 0o644);
    await expect(inspectLaunchAgentFile(plan.plistPath)).resolves.toMatchObject({ mode: 0o644 });
  });
});
