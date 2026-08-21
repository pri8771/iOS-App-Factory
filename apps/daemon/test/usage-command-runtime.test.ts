import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { createFactoryRepositories, type FactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-16T12:00:00.000Z";
const ROOM_ID = "60000000-0000-4000-8000-000000000001";
const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-usage-runtime-"));
  roots.push(root);
  return root;
}

function commandId(suffix: number): string {
  return `60000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
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

async function openRuntimeWithRepositories(
  root: string,
): Promise<{ runtime: DaemonCommandRuntime; repositories: FactoryRepositories }> {
  let repositories: FactoryRepositories | undefined;
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-usage-test",
    startedAt: T0,
    now: () => T0,
    initializeDatabase: (database) => {
      repositories = createFactoryRepositories(database);
    },
  });
  runtimes.push(runtime);
  if (repositories === undefined) throw new Error("repositories not composed");
  return { runtime, repositories };
}

const roomSpec = {
  roomId: ROOM_ID,
  title: "Kickoff",
  projectId: null,
  unattendedEnabled: false,
  agentCooldownEvents: 2,
  participants: [{ persona: "architect", provider: "ollama", displayName: "Architect" }],
  budget: {
    dailyCeilingTokens: 5_000,
    unattendedDailyCeilingTokens: 1_000,
    maxTokensPerReply: 500,
  },
};

describe("usage.summary", () => {
  it("answers an empty summary with no ledger rows", async () => {
    const { runtime } = await openRuntimeWithRepositories(await makeRoot());
    const result = await invoke(runtime, request("usage.summary", 1, { sinceDays: 7 }));
    expect(result).toEqual({ operation: "usage.summary", summary: { sinceDays: 7, rows: [] } });
  });

  it("aggregates real ledger rows with null-honest sums and an unreportedCount, scoped to sinceDays and asOf the command's observedAt", async () => {
    const { runtime, repositories } = await openRuntimeWithRepositories(await makeRoot());
    await invoke(runtime, request("room.create", 1, roomSpec));

    // Two reported-usage rows for the same (providerKey, model, day) bucket -- one that reported
    // cachedInputTokens, one that did not (SUM must skip the NULL, never treat it as 0) -- plus one
    // row with NO usable usage at all, which must count toward unreportedCount, not a fabricated 0.
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: "70000000-0000-4000-8000-000000000001",
      occurredAt: T0,
      providerFamily: "ollama",
      providerKey: "ollama",
      model: "qwen2.5:3b",
      source: "room",
      roomId: ROOM_ID,
      phaseRunId: null,
      signalId: null,
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 10,
      costUsdMicros: null,
    });
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: "70000000-0000-4000-8000-000000000002",
      occurredAt: T0,
      providerFamily: "ollama",
      providerKey: "ollama",
      model: "qwen2.5:3b",
      source: "room",
      roomId: ROOM_ID,
      phaseRunId: null,
      signalId: null,
      inputTokens: 200,
      outputTokens: 75,
      cachedInputTokens: null,
      costUsdMicros: null,
    });
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: "70000000-0000-4000-8000-000000000003",
      occurredAt: T0,
      providerFamily: "ollama",
      providerKey: "ollama",
      model: "qwen2.5:3b",
      source: "room",
      roomId: ROOM_ID,
      phaseRunId: null,
      signalId: null,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      costUsdMicros: null,
    });
    // A row 40 days back, outside a 7-day lookback window.
    const oldInstant = "2026-07-07T12:00:00.000Z";
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: "70000000-0000-4000-8000-000000000004",
      occurredAt: oldInstant,
      providerFamily: "ollama",
      providerKey: "ollama",
      model: "qwen2.5:3b",
      source: "room",
      roomId: ROOM_ID,
      phaseRunId: null,
      signalId: null,
      inputTokens: 999,
      outputTokens: 999,
      cachedInputTokens: null,
      costUsdMicros: null,
    });

    const result = await invoke(runtime, request("usage.summary", 2, { sinceDays: 7 }));
    if (result.operation !== "usage.summary") throw new Error("unexpected result");
    expect(result.summary.sinceDays).toBe(7);
    expect(result.summary.rows).toEqual([
      {
        providerKey: "ollama",
        model: "qwen2.5:3b",
        dayKey: "2026-08-16",
        inputTokens: 300,
        outputTokens: 125,
        cachedInputTokens: 10,
        costUsdMicros: null,
        unreportedCount: 1,
      },
    ]);

    // A 90-day lookback also picks up the old row, in its own day bucket.
    const wide = await invoke(runtime, request("usage.summary", 3, { sinceDays: 90 }));
    if (wide.operation !== "usage.summary") throw new Error("unexpected result");
    expect(wide.summary.rows).toHaveLength(2);
    expect(wide.summary.rows.map((row) => row.dayKey).sort()).toEqual(["2026-07-07", "2026-08-16"]);
  });
});
