import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServiceCliArguments, runServiceCli, ServiceCliUsageError } from "../src/cli.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

async function serviceConfiguration(): Promise<
  Readonly<{
    configFile: string;
    launchAgentsDirectory: string;
  }>
> {
  const root = await mkdtemp(join("/private/tmp", "factory-service-cli-"));
  roots.push(root);
  const launchAgentsDirectory = join(root, "LaunchAgents");
  const nodeExecutable = join(root, "node");
  const daemonEntrypoint = join(root, "daemon.js");
  const configFile = join(root, "service.json");
  await mkdir(launchAgentsDirectory);
  await writeFile(nodeExecutable, "#!/bin/sh\n", { mode: 0o700 });
  await writeFile(daemonEntrypoint, "export {};\n", { mode: 0o600 });
  await writeFile(
    configFile,
    JSON.stringify({
      schemaVersion: 1,
      userId: typeof process.getuid === "function" ? process.getuid() : 501,
      launchAgentsDirectory,
      nodeExecutable,
      daemonEntrypoint,
      runtimeDirectory: join(root, "runtime"),
      authorizationFile: join(root, "auth", "token"),
      logDirectory: join(root, "logs"),
      daemonVersion: "0.3.0",
    }),
  );
  return { configFile, launchAgentsDirectory };
}

describe("factory-service argument boundary", () => {
  it("accepts only read-only plan and status operations", () => {
    expect(parseServiceCliArguments(["plan", "--config", "service.json"])).toEqual({
      outputMode: "human",
      command: { kind: "service.plan", configFile: "service.json" },
    });
    expect(parseServiceCliArguments(["--json", "status", "--config", "service.json"])).toEqual({
      outputMode: "json",
      command: { kind: "service.status", configFile: "service.json" },
    });
    for (const operation of ["install", "uninstall", "logs"]) {
      expect(() => parseServiceCliArguments([operation, "--config", "service.json"])).toThrow(
        "human installation gate",
      );
    }
    expect(() =>
      parseServiceCliArguments(["plan", "--config", "service.json", "--receipt", "forged.json"]),
    ).toThrow(ServiceCliUsageError);
  });

  it("plans through the dedicated executable without credentials or host mutation", async () => {
    const fixture = await serviceConfiguration();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exitCode = await runServiceCli(["plan", "--config", fixture.configFile, "--json"], {
      stdout,
      stderr,
    });

    expect({ exitCode, errors: stderr.mock.calls }).toEqual({ exitCode: 0, errors: [] });
    const output = JSON.parse(String(stdout.mock.calls[0]?.[0])) as {
      result: {
        installDecision: string;
        plistPath: string;
        programAttestationDigest: string;
      };
    };
    expect(output.result).toMatchObject({
      installDecision: "create",
      plistPath: join(
        fixture.launchAgentsDirectory,
        "com.priyanshchordia.app-factory.daemon.plist",
      ),
    });
    expect(output.result.programAttestationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(output)).not.toContain("APP_FACTORY_AUTH_TOKEN");
  });

  it("reports status through an injected bounded observer and redacts failures", async () => {
    const fixture = await serviceConfiguration();
    const stdout = vi.fn();
    const stderr = vi.fn();
    await expect(
      runServiceCli(
        ["status", "--config", fixture.configFile, "--json"],
        { stdout, stderr },
        {
          queryStatus: vi.fn(async (plan) => ({
            schemaVersion: 1,
            status: "loaded",
            serviceTarget: plan.serviceTarget,
            observationDigest: `sha256:${"a".repeat(64)}` as const,
          })),
        },
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      result: { runtimeStatus: "loaded" },
    });

    stdout.mockClear();
    const canary = "provider-output-must-not-escape";
    await expect(
      runServiceCli(
        ["status", "--config", fixture.configFile, "--json"],
        { stdout, stderr },
        { queryStatus: vi.fn(async () => Promise.reject(new Error(canary))) },
      ),
    ).resolves.toBe(1);
    expect(stderr.mock.calls.flat().join("")).not.toContain(canary);
  });
});
