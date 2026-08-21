import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-16T12:00:00.000Z";
const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-settings-runtime-"));
  roots.push(root);
  return root;
}

function commandId(suffix: number): string {
  return `50000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  suffix: number,
  payload: unknown,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: commandId(suffix),
    issuedAt: T0,
    origin: "cli",
    operation,
    payload,
  });
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: commandId(9_999_999) });
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-settings-test",
    startedAt: T0,
    now: () => T0,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

const CATALOG_WITH_OLLAMA = {
  enabled: true as const,
  dormancyMs: 60_000,
  wake: () => undefined,
  factoryBridge: () => ({ enabled: false as const, cursor: null }),
  participantsCatalog: {
    providers: [
      {
        provider: "ollama" as const,
        roomProviderKey: "ollama",
        model: "qwen2.5:3b",
        cliVersion: null,
      },
    ],
    roster: [],
  },
};

describe("settings.get", () => {
  it("answers null value/updatedAt for a key that has never been set", async () => {
    const runtime = await openRuntime(await makeRoot());
    const result = await invoke(runtime, request("settings.get", 1, { key: "default-provider" }));
    expect(result).toEqual({
      operation: "settings.get",
      entry: { key: "default-provider", value: null, updatedAt: null },
    });
  });
});

describe("settings.set", () => {
  it("refuses a value that does not name a currently configured provider instance", async () => {
    // No moderator composed at all: the live catalog is empty, so EVERY value is honestly refused.
    const runtime = await openRuntime(await makeRoot());
    await expect(
      invoke(runtime, request("settings.set", 1, { key: "default-provider", value: "ollama" })),
    ).rejects.toMatchObject({ code: "settings.unconfigured-provider", retryable: false });
  });

  it("accepts a value naming a live catalog key, persists it, and settings.get reads it back", async () => {
    const runtime = await openRuntime(await makeRoot(), {
      initializeRooms: () => CATALOG_WITH_OLLAMA,
    });
    const set = await invoke(
      runtime,
      request("settings.set", 1, { key: "default-provider", value: "ollama" }),
    );
    expect(set).toEqual({
      operation: "settings.set",
      entry: { key: "default-provider", value: "ollama", updatedAt: T0 },
    });
    if (set.operation !== "settings.set") throw new Error("unexpected result");
    const get = await invoke(runtime, request("settings.get", 2, { key: "default-provider" }));
    expect(get).toEqual({ operation: "settings.get", entry: set.entry });

    // Durable: a retry of the exact same commandId replays the journaled result rather than
    // re-validating (and re-stamping updatedAt) against a possibly-different current catalog.
    const retried = await invoke(
      runtime,
      request("settings.set", 1, { key: "default-provider", value: "ollama" }),
    );
    expect(retried).toEqual(set);
  });

  it("refuses a value that named a provider only under the room.participants.list legacy provider field, not its roomProviderKey", async () => {
    const runtime = await openRuntime(await makeRoot(), {
      initializeRooms: () => ({
        enabled: true,
        dormancyMs: 60_000,
        wake: () => undefined,
        factoryBridge: () => ({ enabled: false as const, cursor: null }),
        participantsCatalog: {
          providers: [
            {
              provider: "openrouter" as const,
              roomProviderKey: "openrouter-fast",
              model: "m",
              cliVersion: null,
            },
          ],
          roster: [],
        },
      }),
    });
    // The bare family name "openrouter" is not a live instance key; only "openrouter-fast" is.
    await expect(
      invoke(runtime, request("settings.set", 1, { key: "default-provider", value: "openrouter" })),
    ).rejects.toMatchObject({ code: "settings.unconfigured-provider" });
    const accepted = await invoke(
      runtime,
      request("settings.set", 2, { key: "default-provider", value: "openrouter-fast" }),
    );
    expect(accepted).toMatchObject({ entry: { value: "openrouter-fast" } });
  });
});
