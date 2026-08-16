import { describe, expect, it } from "vitest";

import {
  HUMAN_ONLY_GATE_STATES_V1,
  LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1,
  LegacyProjectLifecycleStageV1Schema,
  PROJECT_LIFECYCLE_ADVANCE_RULES_V1,
  PROJECT_LIFECYCLE_PROGRESSION_V1,
  ProjectLifecycleError,
  ProjectLifecycleStageV1Schema,
  ProjectLifecycleStateV1Schema,
  ProjectManifestV1Schema,
  SATISFYING_GATE_STATES_V1,
  TYPED_GATE_STATES_V1,
  TypedGateNameV1Schema,
  TypedGateV1Schema,
  advanceProjectLifecycleStage,
  applyProjectLifecycleGate,
  cumulativeGateRequirementsV1,
  evaluateProjectLifecycleV1,
  highestHeldProjectStageV1,
  isHumanOnlyGateState,
  isSatisfyingGateState,
  projectLifecycleStageFromLegacyV1,
  provingShaForProjectStageV1,
  type GateOwnerV1,
  type ProjectLifecycleStageV1,
  type ProjectLifecycleStateV1,
  type TypedGateNameV1,
  type TypedGateV1,
} from "../src/index.js";

const PROJECT_ID = "73000000-0000-4000-8000-000000000101";
const SHA_1 = "1".repeat(40);
const SHA_2 = "2".repeat(40);
const DIGEST = `sha256:${"d".repeat(64)}`;
const T0 = "2026-08-16T10:00:00.000Z";
const T1 = "2026-08-16T10:01:00.000Z";
const T2 = "2026-08-16T10:02:00.000Z";
const T3 = "2026-08-16T10:03:00.000Z";

type GateInput = Readonly<{
  gate: TypedGateNameV1;
  state: string;
  owner?: GateOwnerV1;
  sha?: string;
  evidenceDigest?: string | null;
  at?: string;
}>;

function gate(input: GateInput): TypedGateV1 {
  const humanOnly = isHumanOnlyGateState(input.gate, input.state);
  const satisfying = isSatisfyingGateState(input.gate, input.state);
  return TypedGateV1Schema.parse({
    gate: input.gate,
    state: input.state,
    owner: input.owner ?? (humanOnly ? "human" : "machine"),
    sha: input.sha ?? SHA_1,
    evidenceDigest:
      input.evidenceDigest === undefined ? (satisfying ? DIGEST : null) : input.evidenceDigest,
    at: input.at ?? T0,
  });
}

function state(
  stage: ProjectLifecycleStageV1,
  gates: readonly TypedGateV1[] = [],
  updatedAt = T0,
): ProjectLifecycleStateV1 {
  return ProjectLifecycleStateV1Schema.parse({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    stage,
    gates,
    updatedAt,
  });
}

// The full gate set that proves `live` at one SHA.
function liveGates(sha = SHA_1, at = T0): TypedGateV1[] {
  return [
    gate({ gate: "build", state: "verified", sha, at }),
    gate({ gate: "tests", state: "passed", sha, at }),
    gate({ gate: "visual", state: "passed", sha, at }),
    gate({ gate: "device", state: "physical_pass", sha, at }),
    gate({ gate: "legal", state: "cleared", sha, at }),
    gate({ gate: "store", state: "ready", sha, at }),
  ];
}

function expectLifecycleError(
  action: () => unknown,
  code: ProjectLifecycleError["code"],
  messagePattern?: RegExp,
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ProjectLifecycleError);
  if (thrown instanceof ProjectLifecycleError) {
    expect(thrown.code).toBe(code);
    if (messagePattern !== undefined) expect(thrown.message).toMatch(messagePattern);
  }
}

const HUMAN_ONLY_CASES: ReadonlyArray<readonly [TypedGateNameV1, string]> = [
  ["device", "physical_pass"],
  ["legal", "cleared"],
  ["store", "ready"],
];

describe("TypedGateV1", () => {
  it("accepts every gates.md state for its own gate", () => {
    for (const name of TypedGateNameV1Schema.options) {
      for (const value of TYPED_GATE_STATES_V1[name]) {
        expect(() => gate({ gate: name, state: value }), `${name}=${value}`).not.toThrow();
      }
    }
  });

  it("rejects a state that belongs to a different gate", () => {
    expect(
      TypedGateV1Schema.safeParse({
        gate: "build",
        state: "passed",
        owner: "machine",
        sha: SHA_1,
        evidenceDigest: DIGEST,
        at: T0,
      }).success,
    ).toBe(false);
    expect(
      TypedGateV1Schema.safeParse({
        gate: "market",
        state: "verified",
        owner: "machine",
        sha: SHA_1,
        evidenceDigest: DIGEST,
        at: T0,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys and a missing evidence field", () => {
    const valid = gate({ gate: "build", state: "verified" });
    expect(TypedGateV1Schema.safeParse({ ...valid, note: "x" }).success).toBe(false);
    const withoutEvidence: Record<string, unknown> = { ...valid };
    delete withoutEvidence.evidenceDigest;
    expect(TypedGateV1Schema.safeParse(withoutEvidence).success).toBe(false);
  });

  it.each(HUMAN_ONLY_CASES)(
    "makes %s=%s unrepresentable with a machine owner and accepts a human owner",
    (name, value) => {
      const record = {
        gate: name,
        state: value,
        owner: "machine",
        sha: SHA_1,
        evidenceDigest: DIGEST,
        at: T0,
      };
      const rejected = TypedGateV1Schema.safeParse(record);
      expect(rejected.success).toBe(false);
      if (!rejected.success) {
        expect(rejected.error.issues.map((issue) => issue.path.join("."))).toContain("owner");
      }
      expect(TypedGateV1Schema.safeParse({ ...record, owner: "human" }).success).toBe(true);
    },
  );

  it("declares exactly the gates.md human-only states", () => {
    const declared = Object.entries(HUMAN_ONLY_GATE_STATES_V1).flatMap(([name, states]) =>
      states.map((value) => [name, value] as const),
    );
    expect(declared).toEqual(HUMAN_ONLY_CASES);
    expect(isHumanOnlyGateState("legal", "cleared")).toBe(true);
    expect(isHumanOnlyGateState("legal", "blocked")).toBe(false);
    expect(isHumanOnlyGateState("device", "simulator_only")).toBe(false);
    expect(isHumanOnlyGateState("market", "evidence")).toBe(false);
  });

  it("requires an evidence digest for every satisfying state and none otherwise", () => {
    for (const name of TypedGateNameV1Schema.options) {
      for (const value of TYPED_GATE_STATES_V1[name]) {
        const parsed = TypedGateV1Schema.safeParse({
          gate: name,
          state: value,
          owner: "human",
          sha: SHA_1,
          evidenceDigest: null,
          at: T0,
        });
        expect(parsed.success, `${name}=${value} without evidence`).toBe(
          !isSatisfyingGateState(name, value),
        );
      }
    }
    const satisfying = Object.entries(SATISFYING_GATE_STATES_V1).flatMap(([name, states]) =>
      states.map((value) => `${name}=${value}`),
    );
    expect(satisfying).toEqual([
      "build=verified",
      "tests=passed",
      "visual=passed",
      "device=simulator_only",
      "device=physical_pass",
      "legal=cleared",
      "store=ready",
      "market=evidence",
    ]);
  });
});

describe("ProjectLifecycleStateV1", () => {
  it("has six stages with a five-stage progression and frozen off the axis", () => {
    expect(ProjectLifecycleStageV1Schema.options).toEqual([
      "idea",
      "building",
      "qa",
      "launch-prep",
      "live",
      "frozen",
    ]);
    expect(PROJECT_LIFECYCLE_PROGRESSION_V1).toEqual([
      "idea",
      "building",
      "qa",
      "launch-prep",
      "live",
    ]);
  });

  it("accepts idea, building, and frozen without gates but not a gate-bearing stage", () => {
    expect(() => state("idea")).not.toThrow();
    expect(() => state("building")).not.toThrow();
    expect(() => state("frozen")).not.toThrow();
    for (const stage of ["qa", "launch-prep", "live"] as const) {
      const parsed = ProjectLifecycleStateV1Schema.safeParse({
        schemaVersion: 1,
        projectId: PROJECT_ID,
        stage,
        gates: [],
        updatedAt: T0,
      });
      expect(parsed.success, stage).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((issue) => issue.path.join(".") === "stage")).toBe(true);
      }
    }
  });

  it("accepts every progression stage when its cumulative gates hold", () => {
    const gates = liveGates();
    for (const stage of PROJECT_LIFECYCLE_PROGRESSION_V1) {
      expect(() => state(stage, gates), stage).not.toThrow();
    }
  });

  it("rejects duplicate gates and more than seven of them", () => {
    const duplicate = [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "build", state: "failed", at: T1 }),
    ];
    expect(
      ProjectLifecycleStateV1Schema.safeParse({
        schemaVersion: 1,
        projectId: PROJECT_ID,
        stage: "building",
        gates: duplicate,
        updatedAt: T0,
      }).success,
    ).toBe(false);
    const eight = [...liveGates(), gate({ gate: "market", state: "hypothesis" }), duplicate[1]];
    expect(
      ProjectLifecycleStateV1Schema.safeParse({
        schemaVersion: 1,
        projectId: PROJECT_ID,
        stage: "building",
        gates: eight,
        updatedAt: T0,
      }).success,
    ).toBe(false);
  });
});

describe("stage-advance rules", () => {
  it("encodes the gates.md rules per transition and tightens device cumulatively", () => {
    expect(PROJECT_LIFECYCLE_ADVANCE_RULES_V1.qa).toEqual([
      { gate: "build", states: ["verified"] },
      { gate: "tests", states: ["passed"] },
    ]);
    expect(PROJECT_LIFECYCLE_ADVANCE_RULES_V1["launch-prep"]).toEqual([
      { gate: "visual", states: ["passed"] },
      { gate: "device", states: ["simulator_only", "physical_pass"] },
    ]);
    expect(PROJECT_LIFECYCLE_ADVANCE_RULES_V1.live).toEqual([
      { gate: "device", states: ["physical_pass"] },
      { gate: "legal", states: ["cleared"] },
      { gate: "store", states: ["ready"] },
    ]);
    expect(cumulativeGateRequirementsV1("live")).toEqual([
      { gate: "build", states: ["verified"] },
      { gate: "tests", states: ["passed"] },
      { gate: "visual", states: ["passed"] },
      { gate: "device", states: ["physical_pass"] },
      { gate: "legal", states: ["cleared"] },
      { gate: "store", states: ["ready"] },
    ]);
    expect(cumulativeGateRequirementsV1("building")).toEqual([]);
    expect(cumulativeGateRequirementsV1("idea")).toEqual([]);
  });

  it("advances idea -> building with no gates, for either actor", () => {
    const machine = advanceProjectLifecycleStage(state("idea"), "building", "machine", T1);
    expect(machine.state.stage).toBe("building");
    expect(machine.state.updatedAt).toBe(T1);
    expect(machine.transition).toEqual({ from: "idea", to: "building", cause: "advance" });
    expect(advanceProjectLifecycleStage(state("idea"), "building", "human", T1).state.stage).toBe(
      "building",
    );
  });

  it("advances building -> qa only when build=verified and tests=passed", () => {
    const buildOnly = state("building", [gate({ gate: "build", state: "verified" })]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(buildOnly, "qa", "machine", T1),
      "gates-not-satisfied",
      /tests=absent \(missing; needs passed\)/,
    );
    const testsFailed = state("building", [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "failed" }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(testsFailed, "qa", "machine", T1),
      "gates-not-satisfied",
      /tests=failed \(not-satisfied; needs passed\)/,
    );
    const ready = state("building", [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "passed" }),
    ]);
    const advanced = advanceProjectLifecycleStage(ready, "qa", "machine", T1);
    expect(advanced.state.stage).toBe("qa");
    expect(advanced.transition).toEqual({ from: "building", to: "qa", cause: "advance" });
  });

  it("treats evidence at a different SHA as no evidence when advancing", () => {
    const split = state("building", [
      gate({ gate: "build", state: "verified", sha: SHA_1 }),
      gate({ gate: "tests", state: "passed", sha: SHA_2, at: T1 }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(split, "qa", "machine", T2),
      "gates-not-satisfied",
      /build=verified \(stale-sha; needs verified\)/,
    );
    expect(provingShaForProjectStageV1(split.gates, "qa")).toBeNull();
    const evaluation = evaluateProjectLifecycleV1(split);
    expect(evaluation.next?.ready).toBe(false);
    expect(evaluation.next?.blockers).toEqual([
      {
        gate: "build",
        requiredStates: ["verified"],
        observedState: "verified",
        observedSha: SHA_1,
        reason: "stale-sha",
        humanOnly: false,
      },
    ]);
  });

  it("advances qa -> launch-prep only with visual=passed and device>=simulator_only at one SHA", () => {
    const base = [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "passed" }),
    ];
    const humanRequired = state("qa", [
      ...base,
      gate({ gate: "visual", state: "passed" }),
      gate({ gate: "device", state: "human_required" }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(humanRequired, "launch-prep", "machine", T1),
      "gates-not-satisfied",
      /device=human_required/,
    );
    const visualPending = state("qa", [
      ...base,
      gate({ gate: "visual", state: "human_review_required" }),
      gate({ gate: "device", state: "simulator_only" }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(visualPending, "launch-prep", "machine", T1),
      "gates-not-satisfied",
      /visual=human_review_required/,
    );
    const simulator = state("qa", [
      ...base,
      gate({ gate: "visual", state: "passed" }),
      gate({ gate: "device", state: "simulator_only" }),
    ]);
    expect(advanceProjectLifecycleStage(simulator, "launch-prep", "machine", T1).state.stage).toBe(
      "launch-prep",
    );
    // Cumulative: the earlier gates must be at the same SHA as the new ones.
    const staleBuild = state("qa", [
      gate({ gate: "build", state: "verified", sha: SHA_1 }),
      gate({ gate: "tests", state: "passed", sha: SHA_2, at: T1 }),
      gate({ gate: "visual", state: "passed", sha: SHA_2, at: T1 }),
      gate({ gate: "device", state: "simulator_only", sha: SHA_2, at: T1 }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(staleBuild, "launch-prep", "machine", T1),
      "gates-not-satisfied",
      /build=verified \(stale-sha/,
    );
  });

  it("advances launch-prep -> live only with device=physical_pass, legal=cleared, store=ready", () => {
    const withoutHumanGates = state("launch-prep", [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "passed" }),
      gate({ gate: "visual", state: "passed" }),
      gate({ gate: "device", state: "simulator_only" }),
      gate({ gate: "legal", state: "cleared" }),
      gate({ gate: "store", state: "in_progress" }),
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(withoutHumanGates, "live", "human", T1),
      "gates-not-satisfied",
      /device=simulator_only \(not-satisfied; needs physical_pass\).*store=in_progress \(not-satisfied; needs ready\)/,
    );
    const evaluation = evaluateProjectLifecycleV1(withoutHumanGates);
    expect(evaluation.next?.stage).toBe("live");
    expect(evaluation.next?.blockers.map((blocker) => [blocker.gate, blocker.humanOnly])).toEqual([
      ["device", true],
      ["store", true],
    ]);
    const ready = state("launch-prep", liveGates());
    const advanced = advanceProjectLifecycleStage(ready, "live", "machine", T1);
    expect(advanced.state.stage).toBe("live");
    expect(evaluateProjectLifecycleV1(advanced.state).next).toBeNull();
  });

  it("rejects skipping, standing still, and moving backwards by decree", () => {
    const ready = state("building", liveGates());
    expectLifecycleError(
      () => advanceProjectLifecycleStage(ready, "launch-prep", "human", T1),
      "illegal-transition",
      /exactly one stage/,
    );
    expectLifecycleError(
      () => advanceProjectLifecycleStage(ready, "building", "human", T1),
      "illegal-transition",
    );
    const live = state("live", liveGates());
    expectLifecycleError(
      () => advanceProjectLifecycleStage(live, "qa", "human", T1),
      "illegal-transition",
    );
    expectLifecycleError(
      () => advanceProjectLifecycleStage(live, "live", "human", T1),
      "illegal-transition",
    );
  });

  it("freezes from any stage, human only, and never twice", () => {
    for (const stage of PROJECT_LIFECYCLE_PROGRESSION_V1) {
      const gates = stage === "idea" || stage === "building" ? [] : liveGates();
      const frozen = advanceProjectLifecycleStage(state(stage, gates), "frozen", "human", T1);
      expect(frozen.state.stage, stage).toBe("frozen");
      expect(frozen.transition).toEqual({ from: stage, to: "frozen", cause: "freeze" });
      expectLifecycleError(
        () => advanceProjectLifecycleStage(state(stage, gates), "frozen", "machine", T1),
        "human-only-transition",
      );
    }
    expectLifecycleError(
      () => advanceProjectLifecycleStage(state("frozen"), "frozen", "human", T1),
      "illegal-transition",
    );
  });

  it("thaws to idea or to any stage the gates prove, human only", () => {
    const frozenEmpty = state("frozen");
    expect(advanceProjectLifecycleStage(frozenEmpty, "idea", "human", T1).state.stage).toBe("idea");
    expect(advanceProjectLifecycleStage(frozenEmpty, "building", "human", T1).transition).toEqual({
      from: "frozen",
      to: "building",
      cause: "thaw",
    });
    expectLifecycleError(
      () => advanceProjectLifecycleStage(frozenEmpty, "qa", "human", T1),
      "gates-not-satisfied",
    );
    expectLifecycleError(
      () => advanceProjectLifecycleStage(frozenEmpty, "idea", "machine", T1),
      "human-only-transition",
    );
    const frozenProven = state("frozen", liveGates());
    expect(advanceProjectLifecycleStage(frozenProven, "live", "human", T1).state.stage).toBe(
      "live",
    );
    expect(advanceProjectLifecycleStage(frozenProven, "qa", "human", T1).state.stage).toBe("qa");
  });

  it("never rewinds updatedAt", () => {
    const later = state("idea", [], T2);
    expect(advanceProjectLifecycleStage(later, "building", "human", T1).state.updatedAt).toBe(T2);
  });
});

describe("applyProjectLifecycleGate", () => {
  it.each(HUMAN_ONLY_CASES)(
    "refuses to let a machine record %s=%s under any owner claim",
    (name, value) => {
      const current = state("building");
      for (const owner of ["machine", "human"] as const) {
        expectLifecycleError(
          () =>
            applyProjectLifecycleGate(
              current,
              { gate: name, state: value, owner, sha: SHA_1, evidenceDigest: DIGEST, at: T1 },
              "machine",
            ),
          "human-only-gate-state",
          /human-only/,
        );
      }
      const human = applyProjectLifecycleGate(
        current,
        { gate: name, state: value, owner: "human", sha: SHA_1, evidenceDigest: DIGEST, at: T1 },
        "human",
      );
      expect(human.state.gates).toEqual([
        { gate: name, state: value, owner: "human", sha: SHA_1, evidenceDigest: DIGEST, at: T1 },
      ]);
    },
  );

  it("rejects an owner claim that differs from the actor", () => {
    const current = state("building");
    expectLifecycleError(
      () =>
        applyProjectLifecycleGate(
          current,
          gate({ gate: "build", state: "verified", owner: "human", at: T1 }),
          "machine",
        ),
      "owner-mismatch",
    );
    expectLifecycleError(
      () =>
        applyProjectLifecycleGate(
          current,
          gate({ gate: "build", state: "verified", owner: "machine", at: T1 }),
          "human",
        ),
      "owner-mismatch",
    );
    expect(() =>
      applyProjectLifecycleGate(
        current,
        gate({ gate: "build", state: "verified", owner: "human", at: T1 }),
        "human",
      ),
    ).not.toThrow();
  });

  it("rejects an observation older than the one already recorded for that gate", () => {
    const current = state("building", [gate({ gate: "build", state: "verified", at: T2 })], T2);
    expectLifecycleError(
      () =>
        applyProjectLifecycleGate(
          current,
          gate({ gate: "build", state: "failed", sha: SHA_2, at: T1 }),
          "machine",
        ),
      "stale-observation",
    );
    // A different gate may carry an earlier timestamp; updatedAt never rewinds.
    const other = applyProjectLifecycleGate(
      current,
      gate({ gate: "tests", state: "passed", at: T1 }),
      "machine",
    );
    expect(other.state.updatedAt).toBe(T2);
    expect(other.state.gates.map((entry) => entry.gate)).toEqual(["build", "tests"]);
  });

  it("replaces the previous observation of the same gate", () => {
    const current = state("building", [gate({ gate: "build", state: "unknown" })]);
    const next = applyProjectLifecycleGate(
      current,
      gate({ gate: "build", state: "verified", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(next.state.gates).toHaveLength(1);
    expect(next.state.gates[0]?.state).toBe("verified");
    expect(next.state.gates[0]?.sha).toBe(SHA_2);
    expect(next.state.updatedAt).toBe(T1);
    expect(next.transition).toBeNull();
  });

  it("auto-demotes on a regression at a newer SHA and reports the transition", () => {
    const qa = state("qa", [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "passed" }),
    ]);
    const regressed = applyProjectLifecycleGate(
      qa,
      gate({ gate: "tests", state: "failed", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(regressed.state.stage).toBe("building");
    expect(regressed.transition).toEqual({ from: "qa", to: "building", cause: "gate-regression" });
    expect(highestHeldProjectStageV1(regressed.state.gates)).toBe("building");
  });

  it("cascades a regression down to the highest stage the gates still hold", () => {
    const live = state("live", liveGates());
    const deviceLost = applyProjectLifecycleGate(
      live,
      gate({ gate: "device", state: "simulator_only", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(deviceLost.state.stage).toBe("launch-prep");
    expect(deviceLost.transition).toEqual({
      from: "live",
      to: "launch-prep",
      cause: "gate-regression",
    });
    const testsLost = applyProjectLifecycleGate(
      live,
      gate({ gate: "tests", state: "invalid_run", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(testsLost.state.stage).toBe("building");
    expect(testsLost.transition).toEqual({
      from: "live",
      to: "building",
      cause: "gate-regression",
    });
    const legalBlocked = applyProjectLifecycleGate(
      live,
      gate({ gate: "legal", state: "blocked", owner: "human", sha: SHA_2, at: T1 }),
      "human",
    );
    expect(legalBlocked.state.stage).toBe("launch-prep");
  });

  it("does not demote for a satisfying observation at a newer SHA, but blocks advancing", () => {
    const qa = state("qa", [
      gate({ gate: "build", state: "verified" }),
      gate({ gate: "tests", state: "passed" }),
      gate({ gate: "visual", state: "passed" }),
      gate({ gate: "device", state: "simulator_only" }),
    ]);
    const rebuilt = applyProjectLifecycleGate(
      qa,
      gate({ gate: "build", state: "verified", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(rebuilt.state.stage).toBe("qa");
    expect(rebuilt.transition).toBeNull();
    const evaluation = evaluateProjectLifecycleV1(rebuilt.state);
    expect(evaluation.next?.stage).toBe("launch-prep");
    expect(evaluation.next?.ready).toBe(false);
    expect(evaluation.next?.blockers.map((blocker) => [blocker.gate, blocker.reason])).toEqual([
      ["tests", "stale-sha"],
      ["visual", "stale-sha"],
      ["device", "stale-sha"],
    ]);
    expectLifecycleError(
      () => advanceProjectLifecycleStage(rebuilt.state, "launch-prep", "machine", T2),
      "gates-not-satisfied",
    );
    // Once every gate is re-established at the new SHA the advance is legal again.
    let current = rebuilt.state;
    for (const entry of [
      gate({ gate: "tests", state: "passed", sha: SHA_2, at: T2 }),
      gate({ gate: "visual", state: "passed", sha: SHA_2, at: T2 }),
      gate({ gate: "device", state: "simulator_only", sha: SHA_2, at: T2 }),
    ]) {
      current = applyProjectLifecycleGate(current, entry, "machine").state;
    }
    expect(evaluateProjectLifecycleV1(current).next).toEqual({
      stage: "launch-prep",
      ready: true,
      provingSha: SHA_2,
      blockers: [],
    });
    expect(advanceProjectLifecycleStage(current, "launch-prep", "machine", T3).state.stage).toBe(
      "launch-prep",
    );
  });

  it("never promotes: a gate observation leaves the stage where it is", () => {
    const building = state("building", [gate({ gate: "build", state: "verified" })]);
    const next = applyProjectLifecycleGate(
      building,
      gate({ gate: "tests", state: "passed", at: T1 }),
      "machine",
    );
    expect(next.state.stage).toBe("building");
    expect(next.transition).toBeNull();
    expect(evaluateProjectLifecycleV1(next.state).next).toEqual({
      stage: "qa",
      ready: true,
      provingSha: SHA_1,
      blockers: [],
    });
  });

  it("leaves idea and frozen untouched by gate observations", () => {
    const idea = applyProjectLifecycleGate(
      state("idea"),
      gate({ gate: "build", state: "failed", at: T1 }),
      "machine",
    );
    expect(idea.state.stage).toBe("idea");
    expect(idea.transition).toBeNull();
    const frozen = applyProjectLifecycleGate(
      state("frozen", liveGates()),
      gate({ gate: "tests", state: "failed", sha: SHA_2, at: T1 }),
      "machine",
    );
    expect(frozen.state.stage).toBe("frozen");
    expect(frozen.transition).toBeNull();
    expect(evaluateProjectLifecycleV1(frozen.state)).toEqual({
      stage: "frozen",
      highestHeldStage: "building",
      next: null,
    });
  });

  it("marks the human hand-off list: only human-only blockers are humanOnly", () => {
    const evaluation = evaluateProjectLifecycleV1(
      state("launch-prep", [
        gate({ gate: "build", state: "verified" }),
        gate({ gate: "tests", state: "passed" }),
        gate({ gate: "visual", state: "passed" }),
        gate({ gate: "device", state: "simulator_only" }),
      ]),
    );
    expect(evaluation.highestHeldStage).toBe("launch-prep");
    expect(evaluation.next).toEqual({
      stage: "live",
      ready: false,
      provingSha: null,
      blockers: [
        {
          gate: "device",
          requiredStates: ["physical_pass"],
          observedState: "simulator_only",
          observedSha: SHA_1,
          reason: "not-satisfied",
          humanOnly: true,
        },
        {
          gate: "legal",
          requiredStates: ["cleared"],
          observedState: null,
          observedSha: null,
          reason: "missing",
          humanOnly: true,
        },
        {
          gate: "store",
          requiredStates: ["ready"],
          observedState: null,
          observedSha: null,
          reason: "missing",
          humanOnly: true,
        },
      ],
    });
    const early = evaluateProjectLifecycleV1(state("building"));
    expect(early.next?.blockers.every((blocker) => !blocker.humanOnly)).toBe(true);
    expect(early.next?.blockers.map((blocker) => blocker.gate)).toEqual(["build", "tests"]);
  });

  it("rejects malformed inputs before touching the state", () => {
    expect(() =>
      applyProjectLifecycleGate(state("building"), { gate: "nope" }, "machine"),
    ).toThrow();
    expect(() =>
      applyProjectLifecycleGate(
        state("building"),
        gate({ gate: "build", state: "verified" }),
        "robot",
      ),
    ).toThrow();
    expect(() => advanceProjectLifecycleStage(state("idea"), "shipped", "human", T1)).toThrow();
    expect(() => advanceProjectLifecycleStage(state("idea"), "building", "human", "now")).toThrow();
  });
});

describe("legacy project-manifest lifecycle vocabulary", () => {
  it("still parses on ProjectManifestV1 and folds onto the canonical six stages", () => {
    const manifestField = ProjectManifestV1Schema.def.shape.lifecycleStage;
    for (const legacy of LegacyProjectLifecycleStageV1Schema.options) {
      expect(manifestField.safeParse(legacy).success, legacy).toBe(true);
      const canonical = projectLifecycleStageFromLegacyV1(legacy);
      expect(ProjectLifecycleStageV1Schema.options, legacy).toContain(canonical);
    }
    expect(Object.keys(LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1).sort()).toEqual(
      [...LegacyProjectLifecycleStageV1Schema.options].sort(),
    );
    expect(LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1).toEqual({
      exploring: "idea",
      planned: "idea",
      building: "building",
      qa: "qa",
      "internal-testflight": "launch-prep",
      released: "live",
      paused: "frozen",
      archived: "frozen",
    });
  });

  it("is annotated as deprecated in the portable schema", () => {
    const meta = LegacyProjectLifecycleStageV1Schema.meta();
    expect(meta?.deprecated).toBe(true);
    expect(meta?.description).toMatch(/ADR 0005/);
  });
});
