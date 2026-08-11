import {
  AttemptStateV1Schema,
  ExecutionAttemptV1Schema,
  StepStateV1Schema,
  StepV1Schema,
  type AttemptStateV1,
  type ExecutionAttemptV1,
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
  const terminal =
    attempt.state === "succeeded" || attempt.state === "failed" || attempt.state === "cancelled";

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
