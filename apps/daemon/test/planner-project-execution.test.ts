import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCommandClient,
  type CommandClient,
} from "../../../packages/command-client/src/index.js";
import {
  TaskSpecV1Schema,
  type ProjectPlanV1,
  type RepositoryId,
  type Sha256Digest,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  startFactoryDaemonService,
  type FactoryDaemonService,
} from "../src/factory-daemon-service.js";
import { loadStandardRuleStatementsV1 } from "../src/phase-command-runtime.js";
import {
  createPlannerFixtureAgent,
  iosXcodegenVerificationPlansV1,
  parsePlannerExecutionConfigV1,
  readXcodegenProjectName,
  renderPlannerAgentPolicyV1,
  type PlannerExecutionConfigV1,
} from "../src/planner-project-execution.js";
import { decodeReviewedPolicyPayload } from "../src/verified-local-executor.js";

const AUTHORIZATION = "planner-execution-test-token-000000000001";

const CONFIG_INPUT = {
  schemaVersion: 1,
  mode: "planner-fixture-v1",
  reviewer: { reviewerId: "planner.generic-review", reviewerVersion: "v1" },
  verification: {
    profile: "ios-xcodegen-v1",
    xcodegenExecutable: "/opt/homebrew/bin/xcodegen",
    xcodebuildExecutable: "/usr/bin/xcodebuild",
    simulatorDestination: "platform=iOS Simulator,name=iPhone 17 Pro,OS=latest",
    toolVersions: [{ name: "xcodebuild", version: "26.6" }],
  },
} as const;

const roots: string[] = [];
const services: FactoryDaemonService[] = [];
const clients: CommandClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function eventually(predicate: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("condition not met in time");
}

/** Cheap stand-ins for the Xcode toolchain: prove the checkout is the seeded scaffold. */
function shellVerificationPlans(moduleName: string) {
  const shared = {
    environment: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" },
    protectedFiles: {},
    timeoutMs: 30_000,
    terminationGraceMs: 1_000,
    maxStdoutBytes: 1024 * 1024,
    maxStderrBytes: 1024 * 1024,
    toolVersions: [{ name: "sh", version: "system" }],
  } as const;
  return [
    {
      ...shared,
      checkId: "build.scaffold-present",
      executable: "/bin/sh",
      args: ["-c", `test -f project.yml && grep -q "^name: ${moduleName}$" project.yml`],
    },
    {
      ...shared,
      checkId: "test.sources-and-tests-present",
      executable: "/bin/sh",
      args: ["-c", "test -d Sources && test -d Tests"],
    },
  ];
}

async function startPlannerDaemon(
  runtime: string,
  overrides: Partial<Parameters<typeof startFactoryDaemonService>[0]> = {},
): Promise<{ service: FactoryDaemonService; client: CommandClient; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const service = await startFactoryDaemonService({
    runtimeDirectory: runtime,
    authorization: AUTHORIZATION,
    daemonVersion: "0.1.0-planner-execution-test",
    pollIntervalMs: 5,
    leaseDurationMs: 5_000,
    plannerExecution: {
      config: parsePlannerExecutionConfigV1(CONFIG_INPUT),
      verificationPlansFor: shellVerificationPlans,
      onDiagnostic: (message) => diagnostics.push(message),
    },
    ...overrides,
  });
  services.push(service);
  const client = createCommandClient({
    socketPath: service.socketPath,
    authorization: AUTHORIZATION,
    origin: "cli",
  });
  clients.push(client);
  return { service, client, diagnostics };
}

/** `project.seed` with the Xcode toolchain hidden from PATH so it scaffolds + registers without building. */
async function seedWithoutToolchain(client: CommandClient, targetDirectory: string, name: string) {
  const previousPath = process.env.PATH;
  process.env.PATH = "/usr/bin:/bin";
  try {
    return await client.seedProject(targetDirectory, name);
  } finally {
    process.env.PATH = previousPath;
  }
}

function taskItems(plan: ProjectPlanV1) {
  return plan.items.filter((item) => item.kind === "task");
}

describe("planner execution", () => {
  it("parses the config strictly and renders one deterministic reviewed policy", () => {
    const config: PlannerExecutionConfigV1 = parsePlannerExecutionConfigV1(CONFIG_INPUT);
    expect(config.mode).toBe("planner-fixture-v1");
    expect(config.codex).toBeUndefined();
    expect(config.verification.path).toBe("/usr/bin:/bin:/opt/homebrew/bin");
    expect(config.verification.buildTimeoutMs).toBe(600_000);
    expect(() =>
      parsePlannerExecutionConfigV1({ ...CONFIG_INPUT, mode: "planner-codex-v1" }),
    ).toThrow(/non-exact shape/);
    expect(() => parsePlannerExecutionConfigV1({ ...CONFIG_INPUT, extra: 1 })).toThrow(
      /non-exact shape/,
    );
    expect(() =>
      parsePlannerExecutionConfigV1({
        ...CONFIG_INPUT,
        reviewer: { reviewerId: "not namespaced", reviewerVersion: "v1" },
      }),
    ).toThrow(/namespaced code/);
    expect(() =>
      parsePlannerExecutionConfigV1({
        ...CONFIG_INPUT,
        verification: { ...CONFIG_INPUT.verification, profile: "spm-v1" },
      }),
    ).toThrow(/ios-xcodegen-v1/);

    const rules = new Map([
      ["rule.b", "Second."],
      ["rule.a", "First."],
    ]);
    const once = renderPlannerAgentPolicyV1(rules);
    const twice = renderPlannerAgentPolicyV1(new Map([...rules.entries()].reverse()));
    expect(once.equals(twice)).toBe(true);
    const text = once.toString("utf8");
    expect(text).toContain("Do not verify your own work");
    expect(text.indexOf("[rule.a]")).toBeLessThan(text.indexOf("[rule.b]"));
    expect(decodeReviewedPolicyPayload(once).digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("builds ios-xcodegen-v1 verification plans on the project's own scheme, GET-free and scratch-bound", () => {
    const config = parsePlannerExecutionConfigV1(CONFIG_INPUT);
    const plans = iosXcodegenVerificationPlansV1("SampleApp", config.verification);
    expect(plans.map((plan) => plan.checkId)).toEqual(["build.xcodegen-app", "test.xcodegen-unit"]);
    for (const plan of plans) {
      expect(plan.executable).toBe("/bin/sh");
      expect(plan.args[1]).toContain('"/opt/homebrew/bin/xcodegen" generate');
      expect(plan.args[1]).toContain('-scheme "SampleApp"');
      expect(plan.args[1]).toContain("{verificationScratch}/derived-data");
      expect(plan.environment.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin");
    }
    expect(plans[1]?.args[1]).toContain(
      '-destination "platform=iOS Simulator,name=iPhone 17 Pro,OS=latest"',
    );
    expect(() => iosXcodegenVerificationPlansV1("bad name", config.verification)).toThrow(
      /unsupported XcodeGen project name/,
    );
  });

  it(
    "runs a seeded project's approved plan through the verified executor: seed -> propose -> approve -> execute -> tick -> next item, advancing the mirror base between items, and refuses tasks outside the plan",
    { timeout: 120_000 },
    async () => {
      // /private/tmp, not tmpdir(): the unix command socket path must stay under 100 bytes.
      const root = await mkdtemp("/private/tmp/af-planner-");
      roots.push(root);
      const runtime = join(root, "runtime");
      mkdirSync(runtime, { recursive: true, mode: 0o700 });
      const { service, client, diagnostics } = await startPlannerDaemon(runtime);

      // 1. Seed a brand-new project (no Hindsight, no real app): scaffold + register.
      const seeded = await seedWithoutToolchain(
        client,
        join(root, "src", "rehearsal-app"),
        "Rehearsal App",
      );
      expect(seeded.registered).toBe(true);
      const repositoryId = seeded.repositoryId as RepositoryId;
      const projectId = seeded.projectId;
      if (repositoryId === null || projectId === null) throw new Error("seed did not register");
      expect(
        readXcodegenProjectName(
          join(service.executionPaths.gitRuntimeRoot, "mirrors", `${repositoryId}.git`),
          seeded.enrollment.commitSha ?? seeded.scaffoldCommitSha,
        ),
      ).toBe("RehearsalApp");

      // 2. Propose from the default preset, approve (the human anchor), execute.
      const presets = await client.listPresets();
      const preset = presets.presets.find((entry) => entry.presetId === "ios-app-standard-0.4.0");
      if (preset === undefined) throw new Error("default preset not seeded");
      const proposed = await client.proposePlan({
        brief: { title: "Rehearsal", oneLiner: "Prove the planner chain.", constraints: [] },
        presetId: preset.presetId,
        projectId,
        repositoryId,
        source: null,
      });
      let plan = proposed.plan;
      expect(taskItems(plan).length).toBeGreaterThanOrEqual(2);
      plan = (await client.approvePlan({ planId: plan.planId, expectedRevision: plan.revision }))
        .plan;
      expect(plan.state).toBe("approved");
      plan = (await client.executePlan({ planId: plan.planId, expectedRevision: plan.revision }))
        .plan;
      expect(plan.state).toBe("executing");
      const first = taskItems(plan)[0];
      if (first === undefined || first.kind !== "task" || first.attemptId === null) {
        throw new Error("plan.execute did not submit the first task item");
      }

      // 3. The executor resolves the seeded project from the registry and runs it end to end.
      await eventually(async () => {
        const status = await client.status(first.attemptId as never);
        return (
          status.attempt.state === "succeeded" ||
          status.attempt.state === "failed" ||
          status.attempt.state === "blocked"
        );
      }, 60_000);
      const firstStatus = await client.status(first.attemptId as never);
      expect(
        firstStatus.attempt.state,
        JSON.stringify(firstStatus.attempt.outcome ?? firstStatus.attempt.blocker),
      ).toBe("succeeded");
      expect(diagnostics).toEqual([]);

      // 4. tick: settle item 1, ADVANCE the mirror base to its broker commit, submit item 2.
      const ticked = await client.tickPlan(plan.planId);
      plan = ticked.plan;
      const [done, second] = taskItems(plan);
      if (done === undefined || second === undefined || second.kind !== "task")
        throw new Error("unexpected plan shape");
      expect(done.status).toBe("done");
      expect(second.attemptId).not.toBeNull();
      const advanceLink = join(
        service.executionPaths.gitRuntimeRoot,
        "mirrors",
        `${repositoryId}.git`,
        "app-factory-immutable-binding-advances",
        "0000000001.json",
      );
      expect(existsSync(advanceLink)).toBe(true);
      const link = JSON.parse(readFileSync(advanceLink, "utf8")) as {
        baseCommit: string;
        brokerAttemptId: string;
      };
      expect(link.brokerAttemptId).toBe(first.attemptId);

      // 5. Item 2 runs on the ADVANCED base (enrollmentBase opens the sealed mirror; the tip is the
      //    allowed base) -- the exact case a static config-pinned project could never pass.
      await eventually(async () => {
        const status = await client.status(second.attemptId as never);
        return (
          status.attempt.state === "succeeded" ||
          status.attempt.state === "failed" ||
          status.attempt.state === "blocked"
        );
      }, 60_000);
      const secondStatus = await client.status(second.attemptId as never);
      expect(
        secondStatus.attempt.state,
        JSON.stringify(secondStatus.attempt.outcome ?? secondStatus.attempt.blocker),
      ).toBe("succeeded");
      // The second broker commit's parent is exactly the advanced base -- read from the mirror's
      // own objects, not from anything the test wrote.
      const secondParent = spawnSync(
        "/usr/bin/git",
        [
          "--git-dir",
          join(service.executionPaths.gitRuntimeRoot, "mirrors", `${repositoryId}.git`),
          "rev-parse",
          "--verify",
          `refs/app-factory/attempts/${second.attemptId}^`,
        ],
        { encoding: "utf8" },
      ).stdout.trim();
      expect(secondParent).toBe(link.baseCommit);

      // 6. A hand-submitted task against the same repository, even with the exact planner policy
      //    digest, is refused: it is not an item of an approved plan.
      const policyDigest: Sha256Digest = decodeReviewedPolicyPayload(
        renderPlannerAgentPolicyV1(loadStandardRuleStatementsV1()),
      ).digest;
      const rogue = TaskSpecV1Schema.parse({
        schemaVersion: 1,
        taskId: "62000000-0000-4000-8000-000000000777",
        projectId,
        createdAt: "2026-08-18T18:00:00.000Z",
        title: "Not in any plan",
        objective: "Change something the owner never approved.",
        acceptanceCriteria: [{ id: "ac-1", statement: "n/a", verification: "review" }],
        base: { repositoryId, commit: link.baseCommit },
        requestedScope: { paths: ["Sources"] },
        policyDigest,
      });
      const rogueIntake = await client.run(rogue);
      await eventually(
        async () => (await client.status(rogueIntake.attemptId)).attempt.state === "blocked",
      );
      expect((await client.status(rogueIntake.attemptId)).attempt.blocker).toMatchObject({
        code: "plan.task-not-in-approved-plan",
      });
    },
  );

  it("the fixture agent writes exactly one artifact under the first authorized directory and never elsewhere", async () => {
    const root = await mkdtemp(join(tmpdir(), "app-factory-planner-fixture-agent-"));
    roots.push(root);
    mkdirSync(join(root, "Sources", "Demo"), { recursive: true });
    mkdirSync(join(root, "Tests", "DemoTests"), { recursive: true });
    const agent = createPlannerFixtureAgent();
    const context = {
      spec: {
        schemaVersion: 1,
        attemptId: "62000000-0000-4000-8000-000000000001",
        runId: "62000000-0000-4000-8000-000000000002",
        fence: 1,
        taskSpecDigest: `sha256:${"a".repeat(64)}`,
        workingDirectory: root,
        instruction: "Domain model + tests\nImplement it.",
        authorizedWritePaths: ["Sources", "Tests"],
        turnBudget: 1,
      },
      policyDigest: `sha256:${"b".repeat(64)}`,
      baseCommit: "c".repeat(40),
      baseTree: "d".repeat(40),
      signal: new AbortController().signal,
      assertActive: async () => undefined,
      assertCleanupActive: async () => undefined,
      heartbeat: async () => undefined,
    } as unknown as Parameters<typeof agent.run>[0];
    const outcome = await agent.run(context);
    expect(outcome.kind).toBe("succeeded");
    if (outcome.kind !== "succeeded") return;
    expect(outcome.changedPaths).toHaveLength(1);
    expect(outcome.changedPaths[0]).toMatch(
      /^Sources\/Demo\/PlannerRehearsal_[0-9a-f]{12}\.swift$/,
    );
    expect(existsSync(join(root, outcome.changedPaths[0] ?? ""))).toBe(true);
    expect(existsSync(join(root, "Tests", "DemoTests"))).toBe(true);
    // A task whose scope names no existing directory needs input rather than inventing one.
    const noScope = await agent.run({
      ...context,
      spec: { ...context.spec, authorizedWritePaths: ["Missing"] },
    } as unknown as Parameters<typeof agent.run>[0]);
    expect(noScope).toMatchObject({
      kind: "needs-input",
      blocker: { code: "planner.fixture-no-writable-scope" },
    });
  });
});
