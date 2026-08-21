import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IsoInstantSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
  type PhaseDefinitionV1,
  type PhasePresetV1,
} from "@app-factory/contracts";
import {
  PhaseDefinitionUpsertError,
  PhasePresetUpsertError,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { PolicyCorpusError, loadPolicySource } from "@app-factory/policy-corpus";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Studio Phase 4: `preset.list`/`preset.upsert`/`phase.upsert`. Pure CRUD over the durable,
 * revisioned phase-definition/preset repositories (`@app-factory/kernel`'s
 * `PhaseDefinitionRepository`/`PhasePresetRepository`) — nothing here executes a phase (that is
 * the separate planner task).
 *
 * This is the one place in the daemon that resolves `rules.standard[]` ruleIds against the
 * compiled policy source (`docs/policy/ios-app-factory-policy-source.v1.json`): the kernel cannot
 * do it itself (`kernel-imports-contracts-only`, see `phase-repositories.ts`'s module doc
 * comment), so this module reads the file through `@app-factory/policy-corpus` and passes the
 * resolved rule ID set down as the kernel's explicit port.
 */

const DEFAULT_POLICY_SOURCE_RELATIVE_PATH_V1 =
  "../../../docs/policy/ios-app-factory-policy-source.v1.json";

function defaultPolicySourcePathV1(): string {
  // Resolves relative to this module's own location (`apps/daemon/src/` or `apps/daemon/dist/`,
  // both two directories below the repository root), so it works identically whether the daemon
  // runs from source or from its compiled `dist/`.
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDirectory, DEFAULT_POLICY_SOURCE_RELATIVE_PATH_V1);
}

/**
 * Every `ruleId` the compiled policy source currently declares. Fails closed: any problem loading
 * or parsing the source (missing file, invalid JSON, schema violation) yields an empty set, so
 * every `rules.standard[]` reference is rejected as unknown rather than silently accepted.
 */
export function loadKnownStandardRuleIdsV1(policySourcePath?: string): ReadonlySet<string> {
  const path = policySourcePath ?? defaultPolicySourcePathV1();
  try {
    const source = loadPolicySource(path);
    return new Set(source.rules.map((rule) => rule.ruleId));
  } catch (error) {
    if (error instanceof PolicyCorpusError || error instanceof Error) return new Set();
    throw error;
  }
}

/**
 * `ruleId -> statement`, for Phase Runner to render `rules.standard[]` as ENFORCED constraints in a
 * participant's instruction (`phase-run-executor.ts`). Fails closed the same way
 * `loadKnownStandardRuleIdsV1` does: any problem loading the source yields an empty map, so a run
 * falls back to rendering the bare ruleId rather than fabricating rule text.
 */
export function loadStandardRuleStatementsV1(
  policySourcePath?: string,
): ReadonlyMap<string, string> {
  const path = policySourcePath ?? defaultPolicySourcePathV1();
  try {
    const source = loadPolicySource(path);
    return new Map(source.rules.map((rule) => [rule.ruleId, rule.statement]));
  } catch (error) {
    if (error instanceof PolicyCorpusError || error instanceof Error) return new Map();
    throw error;
  }
}

export function buildPresetListResultV1(repositories: FactoryRepositories): CommandResultV1 {
  return { operation: "preset.list", presets: [...repositories.phasePresets.listAll()] };
}

function mapPhaseUpsertError(error: unknown): never {
  if (error instanceof PhaseDefinitionUpsertError) {
    throw new CommandHandlerError(
      error.code === "phase.identity-conflict" ? "command.identity-conflict" : error.code,
      error.message,
      false,
    );
  }
  throw error;
}

function mapPresetUpsertError(error: unknown): never {
  if (error instanceof PhasePresetUpsertError) {
    throw new CommandHandlerError(
      error.code === "preset.identity-conflict" ? "command.identity-conflict" : error.code,
      error.message,
      false,
    );
  }
  throw error;
}

function nextInstant(observedAt: IsoInstant, after: IsoInstant): IsoInstant {
  const milliseconds = Math.max(Date.parse(observedAt), Date.parse(after) + 1);
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

export function upsertPhaseDefinitionV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "phase.upsert" }>,
  observedAt: IsoInstant,
  knownStandardRuleIds: ReadonlySet<string>,
): CommandResultV1 {
  const existing = repositories.phaseDefinitions.findById(request.payload.phase.phaseId);
  const recordedAt = existing === null ? observedAt : nextInstant(observedAt, existing.updatedAt);
  try {
    const upserted = repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "phase.upsert",
        upsert: request.payload,
      },
      recordedAt,
      knownStandardRuleIds: [...knownStandardRuleIds],
    });
    return { operation: "phase.upsert", phase: upserted.phase, created: upserted.created };
  } catch (error) {
    mapPhaseUpsertError(error);
  }
}

export function upsertPhasePresetV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "preset.upsert" }>,
  observedAt: IsoInstant,
  knownStandardRuleIds: ReadonlySet<string>,
): CommandResultV1 {
  const existing = repositories.phasePresets.findById(request.payload.preset.presetId);
  const recordedAt = existing === null ? observedAt : nextInstant(observedAt, existing.updatedAt);
  try {
    const upserted = repositories.phasePresets.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "preset.upsert",
        upsert: request.payload,
      },
      recordedAt,
      knownStandardRuleIds: [...knownStandardRuleIds],
    });
    return { operation: "preset.upsert", preset: upserted.preset, created: upserted.created };
  } catch (error) {
    mapPresetUpsertError(error);
  }
}

// ---------------------------------------------------------------------------
// Seed data: the default iOS preset, per docs/roadmap/STUDIO_PHASES.md Phase 4 and
// docs/architecture/0004-studio-mac-app.md decision 5 — the deep-dive's collapsed default
// (contract, research, brief, design, architecture, plan, ◆ready, build, review, ◆release).
//
// Built as plain object literals, not typed as the branded contract types directly: each
// repository's own `*UpsertCommandV1Schema.parse` validates and brands the structure in one pass
// when `materializeSeedIosAppStandardPhaseDefinitionsV1`/`seedIosAppStandardPresetV1` upserts it,
// exactly like every other command payload in this daemon crosses from "shaped like the wire" to
// "the branded contract type" at a schema boundary rather than through scattered casts.
//
// Every one of the preset's 10 phases is durably materialized in `phase_definitions` (with its own
// `phase_definition_revisions` history) BEFORE the preset embeds it: a preset only ever stores an
// already-durable `PhaseDefinitionV1` snapshot (see `phase.ts`'s module doc comment and
// `PhasePresetDraftV1Shape.phases`'s `PhaseDefinitionV1Schema` array), so seeding the preset
// without also seeding its phases left the first `phase.upsert` against a seeded phase unable to
// find the row its `expectedRevision` referenced (`phase.not-found`) — the durable library and the
// preset's own copy must both exist, not just the copy embedded in the preset.
// ---------------------------------------------------------------------------

/** Fixed, well-known: the seed upsert is idempotent by command ID across every daemon start. */
export const SEED_PHASE_PRESET_COMMAND_ID_V1 = "00000000-0000-4000-8000-000000000001";
export const SEED_INSTANT_V1 = "2026-01-01T00:00:00.000Z";

/**
 * Deterministically derives one seeded phase's own `phase.upsert` command ID from the preset
 * seed's fixed command ID plus the `phaseId`, formatted as the UUID `CommandIdSchema` requires
 * (same sha256-then-format technique `command-runtime.ts`'s `deterministicUuidFromParts` uses).
 * Same input always yields the same command ID, so materializing a seeded phase definition is
 * idempotent across every daemon start exactly like the preset's own fixed command ID already is:
 * `PhaseDefinitionRepository.upsert` recognizes a replayed command ID bound to identical content
 * and short-circuits rather than writing a second revision.
 */
function deriveSeedPhaseDefinitionCommandIdV1(phaseId: string): string {
  const digest = createHash("sha256")
    .update(`${SEED_PHASE_PRESET_COMMAND_ID_V1}\0phase.upsert\0${phaseId}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

type SeedPhaseOverrides = Readonly<Record<string, unknown>> &
  Readonly<{ name: string; purpose: string }>;

/**
 * One seeded phase's draft: the `PhaseDefinitionDraftV1` shape `phase.upsert` accepts (no
 * `schemaVersion`/`revision`/`createdAt`/`updatedAt` — `PhaseDefinitionRepository.upsert` stamps
 * those itself from the current head, exactly as it does for an operator-issued `phase.upsert`).
 */
function seedPhaseDraft(
  phaseId: string,
  overrides: SeedPhaseOverrides,
): Readonly<Record<string, unknown>> & Readonly<{ phaseId: string }> {
  return {
    phaseId,
    mode: "panel",
    cast: {
      participants: [
        { provider: "codex", persona: `${phaseId}-lead`, readOnly: true },
        { provider: "claude", persona: `${phaseId}-reviewer`, readOnly: true },
      ],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [],
    gates: [],
    budget: { estimateMinutes: 30, timeoutSeconds: 2_700 },
    ...overrides,
  };
}

/**
 * The default iOS Phase Preset's 10 phase drafts, in run order: 8 working phases plus 2 human gate
 * checkpoints (`ready`, `release`), each mode `chat` with an empty cast — a pure human decision, no
 * agent seats — and a non-empty `gates[]` marking it as a checkpoint rather than a working phase.
 */
export function buildSeedIosAppStandardPhaseDraftsV1(): readonly (Readonly<
  Record<string, unknown>
> &
  Readonly<{ phaseId: string }>)[] {
  return [
    seedPhaseDraft("contract", {
      name: "Contract",
      purpose: "Define the user outcome, MVP boundary, constraints, and Definition of Done.",
      mode: "solo",
      cast: {
        participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
        coordinator: null,
        grader: null,
      },
      inputs: ["docs", "issues"],
      rules: {
        standard: ["rule.new.scope-before-breadth"],
        yours: [],
        requiredOutput: ["State the user outcome, MVP boundary, and Definition of Done."],
        acceptanceChecks: ["Contract names a concrete user outcome and explicit MVP boundary."],
      },
      outputs: [{ path: "docs/product/contract.md", schema: null }],
      budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    }),
    seedPhaseDraft("research", {
      name: "Research",
      purpose:
        "Inventory prior art, constraints, and platform capabilities before proposing a design.",
      inputs: ["docs", "web", "issues"],
      rules: {
        standard: ["rule.existing.inventory-before-restructure"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/product/research.md", schema: null }],
    }),
    seedPhaseDraft("brief", {
      name: "Brief",
      purpose: "Translate the contract and research into a concise product brief.",
      mode: "solo",
      cast: {
        participants: [{ provider: "claude", persona: "brief-writer", readOnly: true }],
        coordinator: null,
        grader: null,
      },
      rules: {
        standard: ["rule.new.scope-before-breadth"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/product/brief.md", schema: null }],
      budget: { estimateMinutes: 15, timeoutSeconds: 1_500 },
    }),
    seedPhaseDraft("design", {
      name: "Design",
      purpose: "Propose the user-facing design across every applicable state and layout.",
      inputs: ["docs", "source-readonly"],
      rules: {
        standard: ["rule.ui.explicit-states", "rule.accessibility.primary-workflow"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/design/design.md", schema: null }],
    }),
    seedPhaseDraft("architecture", {
      name: "Architecture",
      purpose: "Decide the technical approach; a distinct grader breaks ties between proposals.",
      mode: "debate",
      cast: {
        participants: [
          { provider: "codex", persona: "architecture-proposer-a", readOnly: true },
          { provider: "cursor", persona: "architecture-proposer-b", readOnly: true },
        ],
        coordinator: null,
        grader: { provider: "claude", persona: "architecture-grader" },
      },
      inputs: ["docs", "source-readonly", "evidence"],
      rules: {
        standard: ["rule.existing.no-rescaffold-without-decision", "rule.dependencies.justified"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/architecture/decision.md", schema: null }],
      budget: { estimateMinutes: 45, timeoutSeconds: 3_600 },
    }),
    seedPhaseDraft("plan", {
      name: "Plan",
      purpose: "Break the architecture down into an ordered, estimable task plan.",
      inputs: ["docs", "issues"],
      rules: {
        standard: ["rule.new.scope-before-breadth"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/product/plan.md", schema: null }],
    }),
    seedPhaseDraft("ready", {
      name: "Ready",
      purpose: "Human gate: confirm the plan and design are ready before implementation begins.",
      mode: "chat",
      cast: { participants: [], coordinator: null, grader: null },
      inputs: ["docs", "evidence"],
      rules: {
        standard: ["rule.dod.verification", "rule.dod.experience-coverage"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [],
      gates: ["build", "tests"],
      budget: { estimateMinutes: null, timeoutSeconds: 900 },
    }),
    seedPhaseDraft("build", {
      name: "Build",
      purpose: "Implement the planned change and its required non-happy-path coverage.",
      inputs: ["docs", "source-readonly", "issues"],
      rules: {
        standard: [
          "rule.dod.verification",
          "rule.data.no-fake-fallback",
          "rule.ui.no-decorative-controls",
        ],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/progress/build-notes.md", schema: null }],
      budget: { estimateMinutes: 60, timeoutSeconds: 7_200 },
    }),
    seedPhaseDraft("review", {
      name: "Review",
      purpose: "Independently review the build against the contract and standard rules.",
      mode: "debate",
      cast: {
        participants: [
          { provider: "codex", persona: "review-lead", readOnly: true },
          { provider: "cursor", persona: "review-critic", readOnly: true },
        ],
        coordinator: null,
        grader: { provider: "claude", persona: "review-grader" },
      },
      inputs: ["docs", "source-readonly", "evidence"],
      rules: {
        standard: ["rule.dod.non-happy-path-tested", "rule.dod.completion-report"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [{ path: "docs/progress/review.md", schema: null }],
      budget: { estimateMinutes: 40, timeoutSeconds: 3_600 },
    }),
    seedPhaseDraft("release", {
      name: "Release",
      purpose: "Human gate: legal, device, and store readiness before release.",
      mode: "chat",
      cast: { participants: [], coordinator: null, grader: null },
      inputs: ["docs", "evidence"],
      rules: {
        standard: [
          "rule.gate.legal",
          "rule.gate.device",
          "rule.gate.store",
          "rule.release.hygiene",
        ],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
      outputs: [],
      gates: ["device", "legal", "store"],
      budget: { estimateMinutes: null, timeoutSeconds: 900 },
    }),
  ];
}

/**
 * Idempotently ensures each of the default iOS Phase Preset's 10 phase definitions is durably
 * materialized in `phase_definitions` (with matching `phase_definition_revisions` history) — not
 * merely embedded in the preset's own snapshot; see this section's module doc comment for why that
 * distinction is the fix for `phase.not-found` on a seeded phase's first edit.
 *
 * Runs unconditionally, independent of whether the preset itself already exists in this database:
 * each phase's own derived command ID (`deriveSeedPhaseDefinitionCommandIdV1`), not the preset's,
 * is what makes its materialization idempotent, so a database that already carries the preset from
 * before this materialization step existed gets its 10 missing phase rows backfilled here exactly
 * as a fresh database gets them created — the check is per-phase, never gated on preset presence.
 */
export function materializeSeedIosAppStandardPhaseDefinitionsV1(
  repositories: FactoryRepositories,
  knownStandardRuleIds: ReadonlySet<string>,
): readonly PhaseDefinitionV1[] {
  return buildSeedIosAppStandardPhaseDraftsV1().map((phase) => {
    const upserted = repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: deriveSeedPhaseDefinitionCommandIdV1(phase.phaseId),
        issuedAt: SEED_INSTANT_V1,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase, expectedRevision: null },
      },
      recordedAt: SEED_INSTANT_V1,
      knownStandardRuleIds: [...knownStandardRuleIds],
    });
    return upserted.phase;
  });
}

/**
 * Idempotently ensures the default iOS Phase Preset exists. First durably materializes each of its
 * 10 phase definitions (`materializeSeedIosAppStandardPhaseDefinitionsV1`) and then embeds those
 * very durable results — not a separately-built copy — as the preset's own `phases[]` snapshot, so
 * the preset and the `phase_definitions` rows it names are always byte-for-byte identical: the same
 * `revision`, `createdAt`, and `updatedAt` a durable `phase.upsert` on that phase would report.
 *
 * Uses a fixed command ID and a fixed `issuedAt`/`recordedAt` so every daemon start replays
 * byte-identical content and the repository's own idempotency short-circuits after the first
 * application — a real, durable upsert, not a runtime-only default.
 */
export function seedIosAppStandardPresetV1(
  repositories: FactoryRepositories,
  knownStandardRuleIds: ReadonlySet<string>,
): PhasePresetV1 {
  const phases = materializeSeedIosAppStandardPhaseDefinitionsV1(
    repositories,
    knownStandardRuleIds,
  );
  const result = repositories.phasePresets.upsert({
    command: {
      schemaVersion: 1,
      commandId: SEED_PHASE_PRESET_COMMAND_ID_V1,
      issuedAt: SEED_INSTANT_V1,
      origin: "system",
      kind: "preset.upsert",
      upsert: {
        preset: {
          presetId: "ios-app-standard-0.4.0",
          name: "iOS App Standard 0.4.0",
          phases,
          appliesTo: ["ios"],
        },
        expectedRevision: null,
      },
    },
    recordedAt: SEED_INSTANT_V1,
    knownStandardRuleIds: [...knownStandardRuleIds],
  });
  return result.preset;
}
