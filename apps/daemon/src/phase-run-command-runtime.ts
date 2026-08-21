import { randomUUID } from "node:crypto";

import {
  IsoInstantSchema,
  PhaseRunIdSchema,
  RoomIdSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
  type PhaseDefinitionV1,
  type PhaseRunId,
  type PhaseRunOutcomeV1,
  type PhaseRunOutputV1,
  type PhaseRunV1,
} from "@app-factory/contracts";
import type { FactoryRepositories } from "@app-factory/kernel";
import type { RoomProviderCatalogPort } from "@app-factory/studio-rooms";

import type { DaemonRuntimeIdFactory } from "./daemon-runtime-ids.js";
import type { PhaseOutputMirrorPort } from "./phase-output-mirror.js";
import {
  executePhaseRunV1,
  type PhaseRunContributionUsageV1,
  type PhaseRunExecutionPorts,
} from "./phase-run-executor.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Phase Runner command handlers: `phase.run` (resolve the phase, create the durable `PhaseRunV1`,
 * execute it end to end, persist every state transition) and the surrounding read/decision ops
 * (`phase.status`/`phase.list`/`phase.approve`/`phase.reject`).
 *
 * `phase.run` is a synchronous command handler, not a fire-and-forget scheduler hand-off like
 * `task.submit`/`task.run`: it awaits the whole mode execution (bounded by the phase's own
 * `budget.timeoutSeconds` via `ports.signal`) and returns the run's terminal (or awaiting-human)
 * state directly. This mirrors `project.scan`'s own precedent of doing real, potentially slow work
 * synchronously inside a durable, idempotent-by-commandId command handler. A crash mid-execution
 * leaves the run observably stuck at `running` with no automatic resume — the same accepted
 * limitation `daemon.reconcile`'s wake-only v1 already carries for the attempt scheduler, and out of
 * scope for this iteration; an operator can only currently see it via `phase.status`.
 */

export type RunPhaseCommandRequestV1 = Extract<CommandRequestV1, { operation: "phase.run" }>;
export type PhaseStatusCommandRequestV1 = Extract<CommandRequestV1, { operation: "phase.status" }>;
export type PhaseListCommandRequestV1 = Extract<CommandRequestV1, { operation: "phase.list" }>;
export type PhaseApproveCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "phase.approve" }
>;
export type PhaseRejectCommandRequestV1 = Extract<CommandRequestV1, { operation: "phase.reject" }>;

export type PhaseRunCommandDependencies = Readonly<{
  outputMirror: PhaseOutputMirrorPort;
  /** `mintRoomId` is supplied per call (`runPhaseV1` derives it from the command's own ID). */
  executionPorts: Omit<PhaseRunExecutionPorts, "signal" | "mintRoomId">;
  /** Bounds a run's whole execution to its own declared `budget.timeoutSeconds`. */
  createTimeoutSignal: (timeoutSeconds: number) => AbortSignal;
  /** The honest token ledger's family/model resolver (Wave 7): the SAME participants config
   *  `executionPorts.participants` was built from, so every `token_usage` row this module inserts
   *  attributes to a real, configured provider instance -- never a second, independently configured
   *  catalog. See `room-participants-config.ts`'s `loadPhaseProviderCatalogPortV1`. */
  providerCatalog: RoomProviderCatalogPort;
}>;

/**
 * One append-only `token_usage` row (`source: "phase"`) per contribution the executor actually
 * dispatched (Wave 7, Architecture decision 6/8): honest nulls whenever a contribution's provider
 * reported nothing usable, never a fabricated zero. Called exactly once per real (non-replayed)
 * execution, from the single point every downstream branch of `runPhaseV1` passes through --
 * covers the output-commit-failure path, the gated awaiting-human path, and the final
 * succeeded/failed path alike, so no contribution is ever double- or un-recorded.
 */
function recordPhaseTokenUsage(
  repositories: FactoryRepositories,
  providerCatalog: RoomProviderCatalogPort,
  phaseRunId: PhaseRunId,
  occurredAt: IsoInstant,
  contributions: readonly PhaseRunContributionUsageV1[],
): void {
  for (const contribution of contributions) {
    const info = providerCatalog.resolve(contribution.provider);
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: randomUUID(),
      occurredAt,
      providerFamily: info.family,
      providerKey: contribution.provider,
      model: info.model,
      source: "phase",
      roomId: null,
      phaseRunId,
      signalId: null,
      inputTokens: contribution.usage.reported?.inputTokens ?? null,
      outputTokens: contribution.usage.reported?.outputTokens ?? null,
      cachedInputTokens: contribution.usage.reported?.cachedInputTokens ?? null,
      costUsdMicros: contribution.usage.costUsdMicros ?? null,
    });
  }
}

function requirePhaseRun(repositories: FactoryRepositories, phaseRunId: unknown): PhaseRunV1 {
  const run = repositories.phaseRuns.findById(PhaseRunIdSchema.parse(phaseRunId));
  if (run === null) {
    throw new CommandHandlerError(
      "phase-run.not-found",
      `No phase run exists for ID ${String(phaseRunId)}.`,
      false,
    );
  }
  return run;
}

/**
 * Resolves the exact `PhaseDefinitionV1` a run should execute: from the named preset's own embedded
 * (already-pinned) phase list when `presetId` is given, otherwise from the standalone, independently
 * revisioned phase-definition library. A preset's embedded phase is a snapshot taken at the preset's
 * own `preset.upsert` time, which may already differ from the live `phase_definitions` head — that
 * divergence is intentional (the preset is itself immutable evidence of what it bundled).
 */
function resolvePhaseForRun(
  repositories: FactoryRepositories,
  presetId: string | null,
  phaseId: string,
): PhaseDefinitionV1 {
  if (presetId === null) {
    const phase = repositories.phaseDefinitions.findById(phaseId);
    if (phase === null) {
      throw new CommandHandlerError(
        "phase.not-found",
        `No phase definition exists: ${phaseId}.`,
        false,
      );
    }
    return phase;
  }
  const preset = repositories.phasePresets.findById(presetId);
  if (preset === null) {
    throw new CommandHandlerError(
      "preset.not-found",
      `No phase preset exists: ${presetId}.`,
      false,
    );
  }
  const phase = preset.phases.find((candidate) => candidate.phaseId === phaseId);
  if (phase === undefined) {
    throw new CommandHandlerError(
      "phase.not-found",
      `Preset ${presetId} does not include a phase named ${phaseId}.`,
      false,
    );
  }
  return phase;
}

function failureOutcome(
  code: Extract<PhaseRunOutcomeV1, { kind: "failed" }>["code"],
  summary: string,
): Extract<PhaseRunOutcomeV1, { kind: "failed" }> {
  return { kind: "failed", code, summary: summary.slice(0, 2_000) };
}

/**
 * The next transition's timestamp: `observedAt` itself, unless that would not strictly advance past
 * `after` (the row's current `updatedAt`) — a `phase.run` call routinely reaches its own next
 * transition within the same millisecond `observedAt` was sampled at, and the kernel's own
 * revision-CAS requires every write's `updatedAt` to strictly increase. Mirrors
 * `phase-command-runtime.ts`'s `nextInstant` exactly.
 */
function nextInstant(observedAt: IsoInstant, after: IsoInstant): IsoInstant {
  const milliseconds = Math.max(Date.parse(observedAt), Date.parse(after) + 1);
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

export async function runPhaseV1(
  repositories: FactoryRepositories,
  request: RunPhaseCommandRequestV1,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
  dependencies: PhaseRunCommandDependencies,
): Promise<CommandResultV1> {
  const { presetId, phaseId, projectId, inputsOverride } = request.payload;
  const phase = resolvePhaseForRun(repositories, presetId, phaseId);
  const phaseRunId = PhaseRunIdSchema.parse(idFactory("phase-run", request.commandId));

  const created = repositories.phaseRuns.create({
    commandId: request.commandId,
    origin: request.origin,
    issuedAt: request.issuedAt,
    phaseRunId,
    presetId,
    phaseId,
    projectId,
    phaseSnapshot: phase,
    recordedAt: observedAt,
  });

  if (created.duplicate) {
    // A genuine replay of an already-created run: return its current state as observed, without
    // re-invoking any participant. See the module doc comment for why this never re-executes.
    return { operation: "phase.run", run: created.run };
  }

  const startedAt = nextInstant(observedAt, created.run.updatedAt);
  const running = repositories.phaseRuns.transitionState({
    expectedRevision: created.run.revision,
    run: { ...created.run, state: "running", revision: 1, startedAt, updatedAt: startedAt },
  });

  const signal = dependencies.createTimeoutSignal(phase.budget.timeoutSeconds);
  const outcome = await executePhaseRunV1(
    {
      phase,
      phaseId: phase.phaseId,
      phaseRunId,
      projectId,
      inputsOverride,
      now: startedAt,
    },
    {
      ...dependencies.executionPorts,
      signal,
      mintRoomId: () => RoomIdSchema.parse(idFactory("phase-run-room", request.commandId)),
    },
  );

  if (outcome.kind === "awaiting-human") {
    const awaitingAt = nextInstant(observedAt, running.updatedAt);
    const awaiting = repositories.phaseRuns.transitionState({
      expectedRevision: running.revision,
      run: {
        ...running,
        state: "awaiting-human",
        revision: running.revision + 1,
        roomId: outcome.roomId,
        updatedAt: awaitingAt,
      },
    });
    return { operation: "phase.run", run: awaiting };
  }

  const finishedAt = nextInstant(observedAt, running.updatedAt);
  // Every branch below (output-commit failure, a gated awaiting-human stop, or the final
  // succeeded/failed transition) passes through this point exactly once per real execution, so
  // this is the single place the honest token ledger's `token_usage` rows are inserted.
  recordPhaseTokenUsage(
    repositories,
    dependencies.providerCatalog,
    phaseRunId,
    finishedAt,
    outcome.contributions,
  );
  let outputs: readonly PhaseRunOutputV1[] = [];
  if (outcome.files.length > 0) {
    try {
      outputs = dependencies.outputMirror.commitOutputs({
        projectId,
        phaseId: phase.phaseId,
        phaseRunId,
        files: outcome.files,
      });
    } catch (error) {
      const summary = error instanceof Error ? error.message : "Could not commit phase outputs.";
      const failed = repositories.phaseRuns.transitionState({
        expectedRevision: running.revision,
        run: {
          ...running,
          state: "failed",
          revision: running.revision + 1,
          outcome: failureOutcome("output-commit-rejected", summary),
          tokenUsage: outcome.tokenUsage,
          finishedAt,
          updatedAt: finishedAt,
        },
      });
      return { operation: "phase.run", run: failed };
    }
  }

  // A phase whose `gates` are non-empty is a checkpoint: even a successful, ungraded-or-passed
  // run stops at `awaiting-human` once its outputs are committed, and only `phase.approve`/
  // `phase.reject` (owner authority) decide it from there. A run the executor itself already
  // failed (a participant error, an invalid output, or a grader's changes-required) skips this —
  // it is not waiting on anyone's approval, it already has its answer.
  if (outcome.kind === "succeeded" && phase.gates.length > 0) {
    const awaitingAt = nextInstant(observedAt, running.updatedAt);
    const awaiting = repositories.phaseRuns.transitionState({
      expectedRevision: running.revision,
      run: {
        ...running,
        state: "awaiting-human",
        revision: running.revision + 1,
        outputs,
        graderVerdict: outcome.graderVerdict,
        tokenUsage: outcome.tokenUsage,
        updatedAt: awaitingAt,
      },
    });
    return { operation: "phase.run", run: awaiting };
  }

  const nextOutcome: PhaseRunOutcomeV1 =
    outcome.kind === "succeeded" ? { kind: "succeeded" } : outcome.outcome;
  const final = repositories.phaseRuns.transitionState({
    expectedRevision: running.revision,
    run: {
      ...running,
      state: outcome.kind === "succeeded" ? "succeeded" : "failed",
      revision: running.revision + 1,
      outputs,
      graderVerdict: outcome.graderVerdict,
      tokenUsage: outcome.tokenUsage,
      outcome: nextOutcome,
      finishedAt,
      updatedAt: finishedAt,
    },
  });
  return { operation: "phase.run", run: final };
}

export function buildPhaseStatusResultV1(
  repositories: FactoryRepositories,
  request: PhaseStatusCommandRequestV1,
): CommandResultV1 {
  return {
    operation: "phase.status",
    run: requirePhaseRun(repositories, request.payload.phaseRunId),
  };
}

export function buildPhaseListResultV1(
  repositories: FactoryRepositories,
  request: PhaseListCommandRequestV1,
): CommandResultV1 {
  return { operation: "phase.list", page: repositories.phaseRuns.list(request.payload) };
}

function requireAwaitingHuman(run: PhaseRunV1): void {
  if (run.state !== "awaiting-human") {
    throw new CommandHandlerError(
      "phase-run.not-awaiting-human",
      `Phase run ${run.phaseRunId} is ${run.state}, not awaiting-human.`,
      false,
    );
  }
}

export function approvePhaseRunV1(
  repositories: FactoryRepositories,
  request: PhaseApproveCommandRequestV1,
  observedAt: IsoInstant,
): CommandResultV1 {
  const run = requirePhaseRun(repositories, request.payload.phaseRunId);
  requireAwaitingHuman(run);
  const finishedAt = nextInstant(observedAt, run.updatedAt);
  const decided = repositories.phaseRuns.transitionState({
    expectedRevision: run.revision,
    run: {
      ...run,
      state: "succeeded",
      revision: run.revision + 1,
      outcome: { kind: "succeeded" },
      finishedAt,
      updatedAt: finishedAt,
    },
  });
  return { operation: "phase.approve", run: decided };
}

export function rejectPhaseRunV1(
  repositories: FactoryRepositories,
  request: PhaseRejectCommandRequestV1,
  observedAt: IsoInstant,
): CommandResultV1 {
  const run = requirePhaseRun(repositories, request.payload.phaseRunId);
  requireAwaitingHuman(run);
  const finishedAt = nextInstant(observedAt, run.updatedAt);
  const decided = repositories.phaseRuns.transitionState({
    expectedRevision: run.revision,
    run: {
      ...run,
      state: "failed",
      revision: run.revision + 1,
      outcome: failureOutcome(
        "rejected",
        request.payload.reason ?? "Rejected by the project owner.",
      ),
      finishedAt,
      updatedAt: finishedAt,
    },
  });
  return { operation: "phase.reject", run: decided };
}
