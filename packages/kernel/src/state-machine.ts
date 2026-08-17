import {
  AttemptStateV1Schema,
  ExecutionAttemptV1Schema,
  PhaseRunStateV1Schema,
  PhaseRunV1Schema,
  StepStateV1Schema,
  StepV1Schema,
  type AttemptStateV1,
  type ExecutionAttemptV1,
  type PhaseRunStateV1,
  type PhaseRunV1,
  type StepStateV1,
  type StepV1,
} from "@app-factory/contracts";

export const LEGAL_ATTEMPT_STATE_TRANSITIONS = {
  queued: ["running", "paused", "cancelled"],
  running: ["paused", "blocked", "succeeded", "failed", "cancelled"],
  paused: ["running", "cancelled"],
  blocked: ["running", "paused", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
} as const satisfies Readonly<Record<AttemptStateV1, readonly AttemptStateV1[]>>;

/**
 * Attempt states with no legal outgoing transition (see
 * `LEGAL_ATTEMPT_STATE_TRANSITIONS` above, and the `attempts` table's
 * terminal-coherence CHECK constraint in migration 0001). Once an attempt
 * reaches one of these states it will never execute or mutate its durable
 * state again, which is what makes it safe for retention/garbage-collection
 * tooling to reclaim its per-attempt working state.
 */
export const TERMINAL_ATTEMPT_STATES = [
  "succeeded",
  "failed",
  "cancelled",
] as const satisfies readonly AttemptStateV1[];

export function isTerminalAttemptState(stateInput: unknown): boolean {
  const state = AttemptStateV1Schema.parse(stateInput);
  return (TERMINAL_ATTEMPT_STATES as readonly AttemptStateV1[]).includes(state);
}

export const LEGAL_STEP_STATE_TRANSITIONS = {
  pending: ["running", "skipped"],
  running: ["blocked", "succeeded", "failed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
  skipped: [],
} as const satisfies Readonly<Record<StepStateV1, readonly StepStateV1[]>>;

function failStateInvariant(message: string): never {
  throw new Error(`Factory state invariant failed: ${message}`);
}

export function isLegalAttemptStateTransition(fromInput: unknown, toInput: unknown): boolean {
  const from = AttemptStateV1Schema.parse(fromInput);
  const to = AttemptStateV1Schema.parse(toInput);
  return (LEGAL_ATTEMPT_STATE_TRANSITIONS[from] as readonly AttemptStateV1[]).includes(to);
}

export function assertLegalAttemptStateTransition(fromInput: unknown, toInput: unknown): void {
  const from = AttemptStateV1Schema.parse(fromInput);
  const to = AttemptStateV1Schema.parse(toInput);
  if (!(LEGAL_ATTEMPT_STATE_TRANSITIONS[from] as readonly AttemptStateV1[]).includes(to)) {
    failStateInvariant(`illegal attempt transition ${from} -> ${to}`);
  }
}

export function isLegalStepStateTransition(fromInput: unknown, toInput: unknown): boolean {
  const from = StepStateV1Schema.parse(fromInput);
  const to = StepStateV1Schema.parse(toInput);
  return (LEGAL_STEP_STATE_TRANSITIONS[from] as readonly StepStateV1[]).includes(to);
}

export function assertLegalStepStateTransition(fromInput: unknown, toInput: unknown): void {
  const from = StepStateV1Schema.parse(fromInput);
  const to = StepStateV1Schema.parse(toInput);
  if (!(LEGAL_STEP_STATE_TRANSITIONS[from] as readonly StepStateV1[]).includes(to)) {
    failStateInvariant(`illegal step transition ${from} -> ${to}`);
  }
}

export function assertAttemptSnapshotCoherence(attemptInput: unknown): ExecutionAttemptV1 {
  const attempt = ExecutionAttemptV1Schema.parse(attemptInput);
  const terminal = isTerminalAttemptState(attempt.state);

  if ((attempt.state === "blocked") !== (attempt.blocker !== null)) {
    failStateInvariant("attempt blocker must be present exactly when state is blocked");
  }

  if (terminal) {
    if (attempt.outcome === null || attempt.outcome.kind !== attempt.state) {
      failStateInvariant(`terminal attempt state ${attempt.state} must match outcome.kind`);
    }
    if (attempt.terminalAt === null || attempt.terminalAt !== attempt.updatedAt) {
      failStateInvariant("terminal attempt must set terminalAt to updatedAt");
    }
    if (attempt.currentStepId !== null) {
      failStateInvariant("terminal attempt cannot retain a current step");
    }
  } else if (attempt.outcome !== null || attempt.terminalAt !== null) {
    failStateInvariant("nonterminal attempt cannot have outcome or terminalAt");
  }

  if (attempt.state === "cancelled" && attempt.desiredState !== "cancelled") {
    failStateInvariant("cancelled attempt must have cancelled desired state");
  }

  return attempt;
}

// Phase Runner: mirrors LEGAL_ATTEMPT_STATE_TRANSITIONS exactly, minus `paused`/`blocked` (a phase
// run has no pause concept and no operator-answered blocker) and plus `awaiting-human` (the state a
// run whose phase declares `gates` reaches once its outputs are committed, until `phase.approve`/
// `phase.reject` decide it).
export const LEGAL_PHASE_RUN_STATE_TRANSITIONS = {
  queued: ["running", "cancelled"],
  running: ["awaiting-human", "succeeded", "failed", "cancelled"],
  "awaiting-human": ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
} as const satisfies Readonly<Record<PhaseRunStateV1, readonly PhaseRunStateV1[]>>;

export const TERMINAL_PHASE_RUN_STATES = [
  "succeeded",
  "failed",
  "cancelled",
] as const satisfies readonly PhaseRunStateV1[];

export function isTerminalPhaseRunState(stateInput: unknown): boolean {
  const state = PhaseRunStateV1Schema.parse(stateInput);
  return (TERMINAL_PHASE_RUN_STATES as readonly PhaseRunStateV1[]).includes(state);
}

export function isLegalPhaseRunStateTransition(fromInput: unknown, toInput: unknown): boolean {
  const from = PhaseRunStateV1Schema.parse(fromInput);
  const to = PhaseRunStateV1Schema.parse(toInput);
  return (LEGAL_PHASE_RUN_STATE_TRANSITIONS[from] as readonly PhaseRunStateV1[]).includes(to);
}

export function assertLegalPhaseRunStateTransition(fromInput: unknown, toInput: unknown): void {
  const from = PhaseRunStateV1Schema.parse(fromInput);
  const to = PhaseRunStateV1Schema.parse(toInput);
  if (!(LEGAL_PHASE_RUN_STATE_TRANSITIONS[from] as readonly PhaseRunStateV1[]).includes(to)) {
    failStateInvariant(`illegal phase run transition ${from} -> ${to}`);
  }
}

/**
 * Mirrors `assertAttemptSnapshotCoherence` exactly, for `PhaseRunV1`: a terminal state
 * (`succeeded`/`failed`/`cancelled`) requires `outcome` present with a matching `kind` and
 * `finishedAt === updatedAt`; every other state requires both absent. `startedAt` is present
 * exactly once the run has left `queued`. `roomId` is set only for a `chat`-mode run's persistent
 * room.
 */
export function assertPhaseRunSnapshotCoherence(runInput: unknown): PhaseRunV1 {
  const run = PhaseRunV1Schema.parse(runInput);
  const terminal = isTerminalPhaseRunState(run.state);

  if (terminal) {
    if (run.outcome === null || run.outcome.kind !== run.state) {
      failStateInvariant(`terminal phase run state ${run.state} must match outcome.kind`);
    }
    if (run.finishedAt === null || run.finishedAt !== run.updatedAt) {
      failStateInvariant("terminal phase run must set finishedAt to updatedAt");
    }
  } else if (run.outcome !== null || run.finishedAt !== null) {
    failStateInvariant("nonterminal phase run cannot have outcome or finishedAt");
  }

  if ((run.state === "queued") !== (run.startedAt === null)) {
    failStateInvariant("phase run startedAt must be present exactly once past queued");
  }

  if (run.roomId !== null && run.phaseSnapshot.mode !== "chat") {
    failStateInvariant("phase run roomId may only be set for a chat-mode run");
  }

  return run;
}

export function assertStepSnapshotCoherence(stepInput: unknown): StepV1 {
  const step = StepV1Schema.parse(stepInput);

  switch (step.state) {
    case "pending":
      if (
        step.runCount !== 0 ||
        step.outputDigest !== null ||
        step.blocker !== null ||
        step.failure !== null ||
        step.startedAt !== null ||
        step.finishedAt !== null
      ) {
        failStateInvariant("pending step must be an untouched checkpoint");
      }
      break;
    case "running":
      if (
        step.runCount < 1 ||
        step.outputDigest !== null ||
        step.blocker !== null ||
        step.failure !== null ||
        step.startedAt === null ||
        step.finishedAt !== null
      ) {
        failStateInvariant("running step checkpoint is incoherent");
      }
      break;
    case "blocked":
      if (
        step.runCount < 1 ||
        step.outputDigest !== null ||
        step.blocker === null ||
        step.failure !== null ||
        step.startedAt === null ||
        step.finishedAt !== null
      ) {
        failStateInvariant("blocked step checkpoint is incoherent");
      }
      break;
    case "succeeded":
      if (
        step.runCount < 1 ||
        step.outputDigest === null ||
        step.blocker !== null ||
        step.failure !== null ||
        step.startedAt === null ||
        step.finishedAt === null
      ) {
        failStateInvariant("succeeded step checkpoint is incoherent");
      }
      break;
    case "failed":
      if (
        step.runCount < 1 ||
        step.outputDigest !== null ||
        step.blocker !== null ||
        step.failure === null ||
        step.startedAt === null ||
        step.finishedAt === null
      ) {
        failStateInvariant("failed step checkpoint is incoherent");
      }
      break;
    case "cancelled":
      if (
        step.runCount < 1 ||
        step.outputDigest !== null ||
        step.blocker !== null ||
        step.failure !== null ||
        step.startedAt === null ||
        step.finishedAt === null
      ) {
        failStateInvariant("cancelled step checkpoint is incoherent");
      }
      break;
    case "skipped":
      if (
        step.runCount !== 0 ||
        step.outputDigest !== null ||
        step.blocker !== null ||
        step.failure !== null ||
        step.startedAt !== null ||
        step.finishedAt !== null
      ) {
        failStateInvariant("skipped step must preserve an unexecuted checkpoint");
      }
      break;
  }

  if (step.startedAt !== null && step.finishedAt !== null && step.finishedAt < step.startedAt) {
    failStateInvariant("step finishedAt cannot precede startedAt");
  }

  return step;
}
