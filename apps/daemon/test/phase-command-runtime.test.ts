import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

/**
 * Studio Phase 4 (`preset.list`/`preset.upsert`/`phase.upsert`), driven end-to-end through the
 * real `openDaemonCommandRuntime` handler exactly like `milestone-commands.test.ts` drives
 * `project.milestone.upsert` — not isolated calls into `phase-command-runtime.ts`.
 */

const T0 = "2026-08-16T12:00:00.000Z";
const T1 = "2026-08-16T12:00:01.000Z";
const T2 = "2026-08-16T12:00:02.000Z";
const REQUEST_ID = "85000000-0000-4000-8000-000000000010";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function commandId(index: number): string {
  return `85000000-0000-4000-8000-${(200 + index).toString().padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  id: string,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: id,
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

function phaseDraft(phaseId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phaseId,
    name: "Contract",
    purpose: "Define the user outcome, MVP boundary, and Definition of Done.",
    mode: "solo",
    cast: {
      participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: {
      standard: ["rule.new.scope-before-breadth"],
      yours: [],
      requiredOutput: [],
      acceptanceChecks: [],
    },
    outputs: [{ path: "docs/product/contract.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    ...overrides,
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-phase-commands-"));
  roots.push(root);
  return root;
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T2,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("preset.list", () => {
  it("reports the seeded default iOS preset on a fresh daemon, with every phase rule resolving against the real policy source", async () => {
    const runtime = await openRuntime(await makeRoot());
    const result = await invoke(runtime, request("preset.list", commandId(1), {}));
    if (result.operation !== "preset.list") throw new Error("Unexpected preset.list result");
    expect(result.presets.map((preset) => preset.presetId)).toEqual(["ios-app-standard-0.4.0"]);
    const preset = result.presets[0];
    expect(preset?.appliesTo).toEqual(["ios"]);
    expect(preset?.phases.map((phase) => phase.phaseId)).toEqual([
      "contract",
      "research",
      "brief",
      "design",
      "architecture",
      "plan",
      "ready",
      "build",
      "review",
      "release",
    ]);
    // The two gate checkpoints are pure human decisions: chat mode, an empty cast, and a
    // non-empty typed-gates list marking them as checkpoints rather than working phases.
    const ready = preset?.phases.find((phase) => phase.phaseId === "ready");
    expect(ready).toMatchObject({
      mode: "chat",
      cast: { participants: [] },
      gates: ["build", "tests"],
    });
    const release = preset?.phases.find((phase) => phase.phaseId === "release");
    expect(release).toMatchObject({
      mode: "chat",
      cast: { participants: [] },
      gates: ["device", "legal", "store"],
    });
  });

  it("seeds idempotently: reopening the daemon does not create a second revision", async () => {
    const root = await makeRoot();
    const first = await openRuntime(root);
    const before = await invoke(first, request("preset.list", commandId(1), {}));
    if (before.operation !== "preset.list") throw new Error("Unexpected result");
    first.close();
    runtimes.splice(runtimes.indexOf(first), 1);

    const second = await openRuntime(root);
    const after = await invoke(second, request("preset.list", commandId(2), {}));
    if (after.operation !== "preset.list") throw new Error("Unexpected result");
    expect(after.presets).toEqual(before.presets);
    expect(after.presets[0]?.revision).toBe(0);
  });
});

describe("phase.upsert", () => {
  it("creates, compare-and-set updates, and stamps daemon-owned monotonic times", async () => {
    const runtime = await openRuntime(await makeRoot());

    const created = await invoke(
      runtime,
      request("phase.upsert", commandId(1), {
        phase: phaseDraft("standup"),
        expectedRevision: null,
      }),
    );
    if (created.operation !== "phase.upsert") throw new Error("Unexpected upsert result");
    expect(created).toMatchObject({
      phase: { ...phaseDraft("standup"), revision: 0, createdAt: T2, updatedAt: T2 },
      created: true,
    });

    const updated = await invoke(
      runtime,
      request(
        "phase.upsert",
        commandId(2),
        { phase: phaseDraft("standup", { name: "Standup v2" }), expectedRevision: 0 },
        T1,
      ),
    );
    if (updated.operation !== "phase.upsert") throw new Error("Unexpected upsert result");
    expect(updated.created).toBe(false);
    expect(updated.phase).toMatchObject({ revision: 1, name: "Standup v2", createdAt: T2 });
  });

  it("fails closed on a standard rule ID the real compiled policy source does not declare", async () => {
    const runtime = await openRuntime(await makeRoot());
    const badPhase = phaseDraft("bad", {
      rules: {
        standard: ["rule.does-not-exist"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
    });
    await expect(
      invoke(
        runtime,
        request("phase.upsert", commandId(1), { phase: badPhase, expectedRevision: null }),
      ),
    ).rejects.toMatchObject({ code: "phase.unknown-rule-id" });
  });

  it("resolves rules.standard against a caller-configured policy source path", async () => {
    const root = await makeRoot();
    const policySourcePath = join(root, "policy-source.json");
    await writeFile(
      policySourcePath,
      JSON.stringify({
        schemaVersion: 1,
        policyId: "test.policy",
        policyVersion: 1,
        title: "Test Policy",
        authority: "AGENTS.md",
        principles: ["Keep it simple."],
        rules: [
          {
            ruleId: "rule.test.allowed",
            statement: "A rule this test's phases may reference.",
            enforcement: "review",
            requiredCheck: "review.test-check",
          },
        ],
        protectedSurfaces: [
          {
            path: "docs/policy",
            classification: "policy",
            changeApprovalAction: "approval.change",
          },
        ],
      }),
      "utf8",
    );
    const runtime = await openRuntime(root, { policySourcePath });

    // The seed preset's own standard rules are not declared by this scoped-down catalog, so
    // seeding is a best-effort no-op rather than a fatal startup error.
    const list = await invoke(runtime, request("preset.list", commandId(99), {}));
    if (list.operation !== "preset.list") throw new Error("Unexpected list result");
    expect(list.presets).toEqual([]);

    const allowed = phaseDraft("allowed", {
      rules: {
        standard: ["rule.test.allowed"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
    });
    await expect(
      invoke(
        runtime,
        request("phase.upsert", commandId(1), { phase: allowed, expectedRevision: null }),
      ),
    ).resolves.toMatchObject({ operation: "phase.upsert", created: true });

    // A ruleId only the real repository policy source declares (used by the seed preset) is
    // unknown to this smaller, caller-configured catalog.
    const seedOnly = phaseDraft("seed-only", {
      rules: {
        standard: ["rule.new.scope-before-breadth"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
    });
    await expect(
      invoke(
        runtime,
        request("phase.upsert", commandId(2), { phase: seedOnly, expectedRevision: null }),
      ),
    ).rejects.toMatchObject({ code: "phase.unknown-rule-id" });
  });

  it("is idempotent by command ID and refuses a reused command ID already bound to a different durable command", async () => {
    const runtime = await openRuntime(await makeRoot());
    const create = request("phase.upsert", commandId(1), {
      phase: phaseDraft("standup"),
      expectedRevision: null,
    });
    const first = await invoke(runtime, create);
    const replay = await invoke(runtime, create);
    expect(replay).toEqual(first);

    // The same command ID the milestone ledger already owns cannot be replayed as a phase upsert.
    await invoke(
      runtime,
      request(
        "project.milestone.upsert",
        commandId(2),
        {
          milestone: {
            milestoneId: "85000000-0000-4000-8000-000000000301",
            projectId: "85000000-0000-4000-8000-000000000001",
            phase: "build",
            kind: "stage",
            label: "Core loop builds green",
            targetDate: null,
            dependsOn: [],
            owner: "machine",
            status: "planned",
            evidenceDigest: null,
          },
          expectedRevision: null,
        },
        T0,
      ),
    );
    await expect(
      invoke(
        runtime,
        request(
          "phase.upsert",
          commandId(2),
          { phase: phaseDraft("other"), expectedRevision: null },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "command.identity-conflict" });
  });
});

describe("preset.upsert", () => {
  it("creates a new preset embedding a full phase snapshot, then reports it through preset.list", async () => {
    const runtime = await openRuntime(await makeRoot());
    const phase = {
      schemaVersion: 1,
      ...phaseDraft("standup"),
      revision: 0,
      createdAt: T0,
      updatedAt: T0,
    };
    const created = await invoke(
      runtime,
      request("preset.upsert", commandId(1), {
        preset: {
          presetId: "solo-standup",
          name: "Solo Standup",
          phases: [phase],
          appliesTo: null,
        },
        expectedRevision: null,
      }),
    );
    if (created.operation !== "preset.upsert") throw new Error("Unexpected upsert result");
    expect(created.created).toBe(true);
    expect(created.preset.phases).toEqual([phase]);

    const list = await invoke(runtime, request("preset.list", commandId(2), {}));
    if (list.operation !== "preset.list") throw new Error("Unexpected list result");
    expect(list.presets.map((preset) => preset.presetId).sort()).toEqual([
      "ios-app-standard-0.4.0",
      "solo-standup",
    ]);
  });

  it("fails closed when an embedded phase references an unknown standard rule ID", async () => {
    const runtime = await openRuntime(await makeRoot());
    const badPhase = {
      schemaVersion: 1,
      ...phaseDraft("bad", {
        rules: {
          standard: ["rule.does-not-exist"],
          yours: [],
          requiredOutput: [],
          acceptanceChecks: [],
        },
      }),
      revision: 0,
      createdAt: T0,
      updatedAt: T0,
    };
    await expect(
      invoke(
        runtime,
        request("preset.upsert", commandId(1), {
          preset: { presetId: "bad-preset", name: "Bad", phases: [badPhase], appliesTo: null },
          expectedRevision: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "preset.unknown-rule-id" });
  });
});
