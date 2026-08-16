import { z } from "zod";

import {
  GitObjectIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  type GitObjectId,
  type IsoInstant,
} from "./primitives.js";

// ADR 0005 (docs/architecture/0005-lifecycle-reconciliation.md): one project
// lifecycle vocabulary. The six stages and the seven typed gates below are the
// mission-control `gates.md` taxonomy adopted as this repository's contract;
// the rules corpus's 14-stage list and the legacy project-manifest enum are
// mapping tables onto these six, and the 8-stage `ReleaseManifestV1` machine
// (ADR 0003) is the release sub-lifecycle that runs beneath
// `launch-prep -> live`.

export const ProjectLifecycleStageV1Schema = z.enum([
  "idea",
  "building",
  "qa",
  "launch-prep",
  "live",
  "frozen",
]);
export type ProjectLifecycleStageV1 = z.infer<typeof ProjectLifecycleStageV1Schema>;

/**
 * The linear progression a project advances along, one stage at a time.
 * `frozen` is deliberately absent: it is a human hold state reachable from
 * any other stage, not a successor of `live`.
 */
export const PROJECT_LIFECYCLE_PROGRESSION_V1 = [
  "idea",
  "building",
  "qa",
  "launch-prep",
  "live",
] as const satisfies readonly ProjectLifecycleStageV1[];
export type ProjectLifecycleProgressionStageV1 = (typeof PROJECT_LIFECYCLE_PROGRESSION_V1)[number];

export const GateOwnerV1Schema = z.enum(["human", "machine"]);
export type GateOwnerV1 = z.infer<typeof GateOwnerV1Schema>;

export const TypedGateNameV1Schema = z.enum([
  "build",
  "tests",
  "visual",
  "device",
  "legal",
  "store",
  "market",
]);
export type TypedGateNameV1 = z.infer<typeof TypedGateNameV1Schema>;

// Gate state spellings are the `gates.md` / mission-control `registry.json`
// wire spellings (snake_case), kept verbatim so registry records import
// without translation. Stage names are already kebab-case there.
export const BuildGateStateV1Schema = z.enum(["unknown", "failed", "verified"]);
export const TestsGateStateV1Schema = z.enum(["not_run", "invalid_run", "failed", "passed"]);
export const VisualGateStateV1Schema = z.enum([
  "not_run",
  "failed",
  "passed",
  "human_review_required",
]);
export const DeviceGateStateV1Schema = z.enum([
  "not_run",
  "simulator_only",
  "physical_pass",
  "human_required",
]);
export const LegalGateStateV1Schema = z.enum(["not_run", "blocked", "cleared"]);
export const StoreGateStateV1Schema = z.enum(["not_run", "in_progress", "ready"]);
export const MarketGateStateV1Schema = z.enum(["hypothesis", "evidence"]);

export const TYPED_GATE_STATES_V1 = {
  build: BuildGateStateV1Schema.options,
  tests: TestsGateStateV1Schema.options,
  visual: VisualGateStateV1Schema.options,
  device: DeviceGateStateV1Schema.options,
  legal: LegalGateStateV1Schema.options,
  store: StoreGateStateV1Schema.options,
  market: MarketGateStateV1Schema.options,
} as const satisfies Readonly<Record<TypedGateNameV1, readonly string[]>>;

export type TypedGateStateV1<G extends TypedGateNameV1 = TypedGateNameV1> =
  (typeof TYPED_GATE_STATES_V1)[G][number];

/**
 * The states that count as "holding" for stage-advance purposes. Any other
 * state of the same gate - including the initial `unknown` / `not_run` /
 * `hypothesis` - never collapses into a pass. A satisfying state must carry
 * an evidence digest; see the `TypedGateV1Schema` refinement.
 */
export const SATISFYING_GATE_STATES_V1 = {
  build: ["verified"],
  tests: ["passed"],
  visual: ["passed"],
  device: ["simulator_only", "physical_pass"],
  legal: ["cleared"],
  store: ["ready"],
  market: ["evidence"],
} as const satisfies { readonly [G in TypedGateNameV1]: readonly TypedGateStateV1<G>[] };

/**
 * Gate states only a human may record. A `machine` owner is rejected by the
 * schema itself and, independently, by `applyProjectLifecycleGate`, so an
 * agent can never mark a project legally cleared, physically device-tested,
 * or store-ready - those are the owner-only decisions `gates.md` reserves.
 */
export const HUMAN_ONLY_GATE_STATES_V1 = {
  build: [],
  tests: [],
  visual: [],
  device: ["physical_pass"],
  legal: ["cleared"],
  store: ["ready"],
  market: [],
} as const satisfies { readonly [G in TypedGateNameV1]: readonly TypedGateStateV1<G>[] };

export function isSatisfyingGateState(gate: TypedGateNameV1, state: string): boolean {
  const states: readonly string[] = SATISFYING_GATE_STATES_V1[gate];
  return states.includes(state);
}

export function isHumanOnlyGateState(gate: TypedGateNameV1, state: string): boolean {
  const states: readonly string[] = HUMAN_ONLY_GATE_STATES_V1[gate];
  return states.includes(state);
}

function typedGateArm<G extends TypedGateNameV1, S extends z.ZodEnum>(gate: G, state: S) {
  return z.strictObject({
    gate: z.literal(gate),
    state,
    owner: GateOwnerV1Schema,
    sha: GitObjectIdSchema,
    evidenceDigest: Sha256DigestSchema.nullable(),
    at: IsoInstantSchema,
  });
}

/**
 * One gate observation: gate `gate` is in `state` at commit `sha`, recorded
 * by `owner` at instant `at`, bound to `evidenceDigest` when there is
 * evidence. Discriminated on `gate` so each gate only admits its own states,
 * in the portable JSON Schema as well as at runtime.
 */
export const TypedGateV1Schema = z
  .discriminatedUnion("gate", [
    typedGateArm("build", BuildGateStateV1Schema),
    typedGateArm("tests", TestsGateStateV1Schema),
    typedGateArm("visual", VisualGateStateV1Schema),
    typedGateArm("device", DeviceGateStateV1Schema),
    typedGateArm("legal", LegalGateStateV1Schema),
    typedGateArm("store", StoreGateStateV1Schema),
    typedGateArm("market", MarketGateStateV1Schema),
  ])
  .superRefine((gate, context) => {
    if (gate.owner === "machine" && isHumanOnlyGateState(gate.gate, gate.state)) {
      context.addIssue({
        code: "custom",
        path: ["owner"],
        message: `${gate.gate}=${gate.state} is human-only and cannot be recorded by a machine`,
      });
    }
    if (isSatisfyingGateState(gate.gate, gate.state) && gate.evidenceDigest === null) {
      context.addIssue({
        code: "custom",
        path: ["evidenceDigest"],
        message: `${gate.gate}=${gate.state} requires an evidence digest`,
      });
    }
  });
export type TypedGateV1 = z.infer<typeof TypedGateV1Schema>;

export type TypedGateRequirementV1 = Readonly<{
  gate: TypedGateNameV1;
  states: readonly string[];
}>;

/**
 * The `gates.md` stage-advance rules, keyed by the stage being entered. Each
 * rule lists the gates that must be in one of the listed states. Rules are
 * cumulative: to enter (or thaw to) a stage every rule up to and including
 * that stage must hold, and to *advance* they must all hold at one common
 * commit SHA - evidence at a stale SHA is not evidence.
 */
export const PROJECT_LIFECYCLE_ADVANCE_RULES_V1 = {
  idea: [],
  building: [],
  qa: [
    { gate: "build", states: ["verified"] },
    { gate: "tests", states: ["passed"] },
  ],
  "launch-prep": [
    { gate: "visual", states: ["passed"] },
    { gate: "device", states: ["simulator_only", "physical_pass"] },
  ],
  live: [
    { gate: "device", states: ["physical_pass"] },
    { gate: "legal", states: ["cleared"] },
    { gate: "store", states: ["ready"] },
  ],
} as const satisfies Readonly<
  Record<ProjectLifecycleProgressionStageV1, readonly TypedGateRequirementV1[]>
>;

function progressionRank(stage: ProjectLifecycleProgressionStageV1): number {
  return PROJECT_LIFECYCLE_PROGRESSION_V1.indexOf(stage);
}

/**
 * Every requirement a project must satisfy to stand at `stage`: the union of
 * the advance rules for each progression stage up to and including it, with a
 * later rule on the same gate replacing an earlier, weaker one (`device`
 * tightens from `simulator_only` at `launch-prep` to `physical_pass` at
 * `live`).
 */
export function cumulativeGateRequirementsV1(
  stage: ProjectLifecycleProgressionStageV1,
): readonly TypedGateRequirementV1[] {
  const byGate = new Map<TypedGateNameV1, TypedGateRequirementV1>();
  for (const candidate of PROJECT_LIFECYCLE_PROGRESSION_V1) {
    if (progressionRank(candidate) > progressionRank(stage)) break;
    for (const rule of PROJECT_LIFECYCLE_ADVANCE_RULES_V1[candidate]) {
      byGate.set(rule.gate, rule);
    }
  }
  return [...byGate.values()];
}

function gateByName(gates: readonly TypedGateV1[], name: TypedGateNameV1): TypedGateV1 | undefined {
  return gates.find((gate) => gate.gate === name);
}

function requirementHolds(
  gates: readonly TypedGateV1[],
  requirement: TypedGateRequirementV1,
): boolean {
  const gate = gateByName(gates, requirement.gate);
  return gate !== undefined && requirement.states.includes(gate.state);
}

/**
 * The highest progression stage whose cumulative requirements all hold on
 * the latest observation of each gate, regardless of SHA. `building` is the
 * floor: neither `idea` nor `building` has gate requirements, and a
 * regression never sends a started project back to `idea`.
 */
export function highestHeldProjectStageV1(
  gates: readonly TypedGateV1[],
): ProjectLifecycleProgressionStageV1 {
  let held: ProjectLifecycleProgressionStageV1 = "building";
  for (const stage of PROJECT_LIFECYCLE_PROGRESSION_V1) {
    if (progressionRank(stage) <= progressionRank("building")) continue;
    if (!cumulativeGateRequirementsV1(stage).every((rule) => requirementHolds(gates, rule))) {
      break;
    }
    held = stage;
  }
  return held;
}

/**
 * The single commit SHA at which every cumulative requirement for `stage`
 * holds, or `null` when any requirement is unmet or the satisfying gates are
 * spread across different SHAs. `idea` and `building` have no requirements
 * and therefore no proving SHA.
 */
export function provingShaForProjectStageV1(
  gates: readonly TypedGateV1[],
  stage: ProjectLifecycleProgressionStageV1,
): GitObjectId | null {
  const requirements = cumulativeGateRequirementsV1(stage);
  if (requirements.length === 0) return null;
  let sha: GitObjectId | null = null;
  for (const requirement of requirements) {
    const gate = gateByName(gates, requirement.gate);
    if (gate === undefined || !requirement.states.includes(gate.state)) return null;
    if (sha === null) {
      sha = gate.sha;
    } else if (sha !== gate.sha) {
      return null;
    }
  }
  return sha;
}

function stageIsProven(
  gates: readonly TypedGateV1[],
  stage: ProjectLifecycleProgressionStageV1,
): boolean {
  return (
    cumulativeGateRequirementsV1(stage).length === 0 ||
    provingShaForProjectStageV1(gates, stage) !== null
  );
}

export const ProjectLifecycleStateV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    projectId: ProjectIdSchema,
    stage: ProjectLifecycleStageV1Schema,
    gates: z.array(TypedGateV1Schema).max(TypedGateNameV1Schema.options.length),
    updatedAt: IsoInstantSchema,
  })
  .superRefine((state, context) => {
    if (new Set(state.gates.map((gate) => gate.gate)).size !== state.gates.length) {
      context.addIssue({ code: "custom", path: ["gates"], message: "gates must be unique" });
    }
    if (state.stage === "frozen") return;
    const held = highestHeldProjectStageV1(state.gates);
    if (progressionRank(state.stage) > progressionRank(held)) {
      context.addIssue({
        code: "custom",
        path: ["stage"],
        message: `stage ${state.stage} is not held by the recorded gates (highest held: ${held})`,
      });
    }
  });
export type ProjectLifecycleStateV1 = z.infer<typeof ProjectLifecycleStateV1Schema>;

export const ProjectLifecycleBlockerReasonV1Schema = z.enum([
  "missing",
  "not-satisfied",
  "stale-sha",
]);
export type ProjectLifecycleBlockerReasonV1 = z.infer<typeof ProjectLifecycleBlockerReasonV1Schema>;

export type ProjectLifecycleBlockerV1 = Readonly<{
  gate: TypedGateNameV1;
  requiredStates: readonly string[];
  observedState: string | null;
  observedSha: GitObjectId | null;
  reason: ProjectLifecycleBlockerReasonV1;
  /** True when every acceptable state for this gate is human-only. */
  humanOnly: boolean;
}>;

export type ProjectLifecycleEvaluationV1 = Readonly<{
  stage: ProjectLifecycleStageV1;
  highestHeldStage: ProjectLifecycleProgressionStageV1;
  next: Readonly<{
    stage: ProjectLifecycleProgressionStageV1;
    ready: boolean;
    provingSha: GitObjectId | null;
    blockers: readonly ProjectLifecycleBlockerV1[];
  }> | null;
}>;

function blockersForStage(
  gates: readonly TypedGateV1[],
  stage: ProjectLifecycleProgressionStageV1,
): readonly ProjectLifecycleBlockerV1[] {
  const requirements = cumulativeGateRequirementsV1(stage);
  const blockers: ProjectLifecycleBlockerV1[] = [];
  const satisfied: TypedGateV1[] = [];
  for (const requirement of requirements) {
    const gate = gateByName(gates, requirement.gate);
    const humanOnly = requirement.states.every((state) =>
      isHumanOnlyGateState(requirement.gate, state),
    );
    if (gate === undefined) {
      blockers.push({
        gate: requirement.gate,
        requiredStates: requirement.states,
        observedState: null,
        observedSha: null,
        reason: "missing",
        humanOnly,
      });
    } else if (!requirement.states.includes(gate.state)) {
      blockers.push({
        gate: requirement.gate,
        requiredStates: requirement.states,
        observedState: gate.state,
        observedSha: gate.sha,
        reason: "not-satisfied",
        humanOnly,
      });
    } else {
      satisfied.push(gate);
    }
  }
  if (blockers.length === 0 && new Set(satisfied.map((gate) => gate.sha)).size > 1) {
    // Every gate holds, but not at one commit: report each gate whose SHA is
    // not the most recently observed gate's SHA as stale so the caller knows
    // exactly which evidence must be re-established. Ties on `at` resolve in
    // requirement order, deterministically.
    const newest = satisfied.reduce((latest, gate) => (gate.at > latest.at ? gate : latest));
    for (const gate of satisfied) {
      if (gate.sha === newest.sha) continue;
      const requirement = requirements.find((rule) => rule.gate === gate.gate);
      if (requirement === undefined) continue;
      blockers.push({
        gate: gate.gate,
        requiredStates: requirement.states,
        observedState: gate.state,
        observedSha: gate.sha,
        reason: "stale-sha",
        humanOnly: requirement.states.every((state) => isHumanOnlyGateState(gate.gate, state)),
      });
    }
  }
  return blockers;
}

/**
 * Pure read view over a lifecycle state: what the project holds today, what
 * the next stage is, whether the gates prove it at one SHA, and otherwise
 * exactly which gates block it (with `humanOnly` marking the ones only the
 * owner can clear - the human hand-off list).
 */
export function evaluateProjectLifecycleV1(stateInput: unknown): ProjectLifecycleEvaluationV1 {
  const state = ProjectLifecycleStateV1Schema.parse(stateInput);
  const highestHeldStage = highestHeldProjectStageV1(state.gates);
  if (state.stage === "frozen") {
    return { stage: state.stage, highestHeldStage, next: null };
  }
  const nextStage = PROJECT_LIFECYCLE_PROGRESSION_V1[progressionRank(state.stage) + 1];
  if (nextStage === undefined) {
    return { stage: state.stage, highestHeldStage, next: null };
  }
  const provingSha = provingShaForProjectStageV1(state.gates, nextStage);
  const blockers = blockersForStage(state.gates, nextStage);
  return {
    stage: state.stage,
    highestHeldStage,
    next: {
      stage: nextStage,
      ready: stageIsProven(state.gates, nextStage) && blockers.length === 0,
      provingSha,
      blockers,
    },
  };
}

export const ProjectLifecycleErrorCodeV1Schema = z.enum([
  "owner-mismatch",
  "human-only-gate-state",
  "human-only-transition",
  "stale-observation",
  "illegal-transition",
  "gates-not-satisfied",
]);
export type ProjectLifecycleErrorCodeV1 = z.infer<typeof ProjectLifecycleErrorCodeV1Schema>;

export class ProjectLifecycleError extends Error {
  public readonly code: ProjectLifecycleErrorCodeV1;

  public constructor(code: ProjectLifecycleErrorCodeV1, message: string) {
    super(message);
    this.name = "ProjectLifecycleError";
    this.code = code;
  }
}

export const ProjectLifecycleTransitionCauseV1Schema = z.enum([
  "advance",
  "gate-regression",
  "freeze",
  "thaw",
]);
export type ProjectLifecycleTransitionCauseV1 = z.infer<
  typeof ProjectLifecycleTransitionCauseV1Schema
>;

export type ProjectLifecycleTransitionV1 = Readonly<{
  from: ProjectLifecycleStageV1;
  to: ProjectLifecycleStageV1;
  cause: ProjectLifecycleTransitionCauseV1;
}>;

export type ProjectLifecycleResultV1 = Readonly<{
  state: ProjectLifecycleStateV1;
  transition: ProjectLifecycleTransitionV1 | null;
}>;

const GateHeaderSchema = z.looseObject({
  gate: TypedGateNameV1Schema,
  state: z.string(),
});

function laterInstant(left: IsoInstant, right: IsoInstant): IsoInstant {
  return right > left ? right : left;
}

/**
 * Records one gate observation and demotes the stage if the observation is
 * a regression. Fails closed on:
 * - a `machine` actor recording any human-only gate state (checked before
 *   the full parse so the reason is a `ProjectLifecycleError`, and again by
 *   the schema itself);
 * - a record whose `owner` claim differs from the authenticated `actor`;
 * - an observation older than the one already recorded for the same gate.
 * After the new observation is folded in, the stage becomes the lower of the
 * current stage and the highest stage the gates still hold. `frozen` and
 * `idea` are never changed by a gate observation - gates cannot thaw or
 * start a project - and a gate observation never promotes: advancing is an
 * explicit `advanceProjectLifecycleStage` decision.
 */
export function applyProjectLifecycleGate(
  stateInput: unknown,
  gateInput: unknown,
  actorInput: unknown,
): ProjectLifecycleResultV1 {
  const actor = GateOwnerV1Schema.parse(actorInput);
  const header = GateHeaderSchema.parse(gateInput);
  if (actor === "machine" && isHumanOnlyGateState(header.gate, header.state)) {
    throw new ProjectLifecycleError(
      "human-only-gate-state",
      `${header.gate}=${header.state} is human-only and cannot be recorded by a machine`,
    );
  }
  const state = ProjectLifecycleStateV1Schema.parse(stateInput);
  const gate = TypedGateV1Schema.parse(gateInput);
  if (gate.owner !== actor) {
    throw new ProjectLifecycleError(
      "owner-mismatch",
      `gate ${gate.gate} claims owner ${gate.owner} but was recorded by ${actor}`,
    );
  }
  const existing = gateByName(state.gates, gate.gate);
  if (existing !== undefined && gate.at < existing.at) {
    throw new ProjectLifecycleError(
      "stale-observation",
      `gate ${gate.gate} observation at ${gate.at} is older than the recorded ${existing.at}`,
    );
  }
  const gates = [...state.gates.filter((entry) => entry.gate !== gate.gate), gate];
  const held = highestHeldProjectStageV1(gates);
  const stage: ProjectLifecycleStageV1 =
    state.stage === "frozen" || state.stage === "idea"
      ? state.stage
      : progressionRank(state.stage) > progressionRank(held)
        ? held
        : state.stage;
  const next = ProjectLifecycleStateV1Schema.parse({
    ...state,
    stage,
    gates,
    updatedAt: laterInstant(state.updatedAt, gate.at),
  });
  return {
    state: next,
    transition:
      stage === state.stage ? null : { from: state.stage, to: stage, cause: "gate-regression" },
  };
}

/**
 * The only way a project stage moves forward, freezes, or thaws:
 * - forward: exactly one progression step, and every cumulative requirement
 *   of the target stage must hold at one common commit SHA (any actor - the
 *   human-only decisions live in the gate states, not in the act of
 *   advancing);
 * - `-> frozen`: from any non-frozen stage, human only;
 * - `frozen -> X`: human only; `X` is `idea` or any progression stage the
 *   gates prove at one SHA.
 * Anything else - standing still, skipping, or moving backwards by decree -
 * is an illegal transition; demotion only ever happens through
 * `applyProjectLifecycleGate`, i.e. through machine truth.
 */
export function advanceProjectLifecycleStage(
  stateInput: unknown,
  toInput: unknown,
  actorInput: unknown,
  atInput: unknown,
): ProjectLifecycleResultV1 {
  const state = ProjectLifecycleStateV1Schema.parse(stateInput);
  const to = ProjectLifecycleStageV1Schema.parse(toInput);
  const actor = GateOwnerV1Schema.parse(actorInput);
  const at = IsoInstantSchema.parse(atInput);
  const from = state.stage;
  let cause: ProjectLifecycleTransitionCauseV1;

  if (to === "frozen") {
    if (from === "frozen") {
      throw new ProjectLifecycleError("illegal-transition", "project is already frozen");
    }
    if (actor !== "human") {
      throw new ProjectLifecycleError("human-only-transition", "only a human may freeze a project");
    }
    cause = "freeze";
  } else if (from === "frozen") {
    if (actor !== "human") {
      throw new ProjectLifecycleError("human-only-transition", "only a human may thaw a project");
    }
    if (!stageIsProven(state.gates, to)) {
      throw new ProjectLifecycleError(
        "gates-not-satisfied",
        `cannot thaw to ${to}: ${describeBlockers(blockersForStage(state.gates, to))}`,
      );
    }
    cause = "thaw";
  } else {
    const fromRank = progressionRank(from);
    const toRank = progressionRank(to);
    if (toRank !== fromRank + 1) {
      throw new ProjectLifecycleError(
        "illegal-transition",
        `project must advance exactly one stage from ${from}, not to ${to}`,
      );
    }
    if (!stageIsProven(state.gates, to)) {
      throw new ProjectLifecycleError(
        "gates-not-satisfied",
        `cannot advance ${from} -> ${to}: ${describeBlockers(blockersForStage(state.gates, to))}`,
      );
    }
    cause = "advance";
  }

  const next = ProjectLifecycleStateV1Schema.parse({
    ...state,
    stage: to,
    updatedAt: laterInstant(state.updatedAt, at),
  });
  return { state: next, transition: { from, to, cause } };
}

function describeBlockers(blockers: readonly ProjectLifecycleBlockerV1[]): string {
  if (blockers.length === 0) return "requirements not proven at one SHA";
  return blockers
    .map(
      (blocker) =>
        `${blocker.gate}=${blocker.observedState ?? "absent"} (${blocker.reason}; needs ${blocker.requiredStates.join("|")})`,
    )
    .join(", ");
}

/**
 * The legacy `ProjectManifestV1.lifecycleStage` vocabulary folded onto the
 * canonical six stages (ADR 0005 mapping matrix). `planned` is still `idea`:
 * nothing is built and no gate can hold. `internal-testflight` is
 * `launch-prep`: the release sub-lifecycle (ADR 0003) runs there.
 */
export const LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1 = {
  exploring: "idea",
  planned: "idea",
  building: "building",
  qa: "qa",
  "internal-testflight": "launch-prep",
  released: "live",
  paused: "frozen",
  archived: "frozen",
} as const satisfies Readonly<Record<string, ProjectLifecycleStageV1>>;
export type LegacyProjectLifecycleStageKeyV1 = keyof typeof LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1;

export function projectLifecycleStageFromLegacyV1(
  legacy: LegacyProjectLifecycleStageKeyV1,
): ProjectLifecycleStageV1 {
  return LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1[legacy];
}
