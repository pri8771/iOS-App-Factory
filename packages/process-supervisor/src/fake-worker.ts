export const THREE_STEP_FAKE_WORKER_STEPS = ["prepare", "execute", "verify"] as const;
export type ThreeStepFakeWorkerStep = (typeof THREE_STEP_FAKE_WORKER_STEPS)[number];
export type ThreeStepFakeWorkerFailpoint =
  `before:${ThreeStepFakeWorkerStep}` | `after:${ThreeStepFakeWorkerStep}`;

export type ThreeStepFakeWorkerEvent = Readonly<{
  eventId:
    | `fake-worker:${ThreeStepFakeWorkerStep}:started`
    | `fake-worker:${ThreeStepFakeWorkerStep}:completed`
    | "fake-worker:completed";
  sequence: number;
  type: "step.started" | "step.completed" | "worker.completed";
  step: ThreeStepFakeWorkerStep | null;
}>;

export type ThreeStepFakeWorkerCommit = Readonly<{
  completedStepCount: 1 | 2 | 3;
  completionEvent: ThreeStepFakeWorkerEvent;
}>;

export type ThreeStepFakeWorkerPorts = Readonly<{
  record(event: ThreeStepFakeWorkerEvent): void | Promise<void>;
  commitStep(commit: ThreeStepFakeWorkerCommit): void | Promise<void>;
  fail?(failpoint: ThreeStepFakeWorkerFailpoint): void | Promise<void>;
}>;

export type ThreeStepFakeWorkerOptions = Readonly<{
  completedStepCount?: 0 | 1 | 2 | 3;
}>;

function stepEvent(
  index: number,
  step: ThreeStepFakeWorkerStep,
  phase: "started" | "completed",
): ThreeStepFakeWorkerEvent {
  return {
    eventId: `fake-worker:${step}:${phase}`,
    sequence: index * 2 + (phase === "started" ? 1 : 2),
    type: phase === "started" ? "step.started" : "step.completed",
    step,
  };
}

export async function runThreeStepFakeWorker(
  ports: ThreeStepFakeWorkerPorts,
  options: ThreeStepFakeWorkerOptions = {},
): Promise<readonly ThreeStepFakeWorkerEvent[]> {
  const completedStepCount = options.completedStepCount ?? 0;
  if (![0, 1, 2, 3].includes(completedStepCount)) {
    throw new RangeError("completedStepCount must be 0, 1, 2, or 3");
  }

  const events: ThreeStepFakeWorkerEvent[] = [];
  for (let index = completedStepCount; index < THREE_STEP_FAKE_WORKER_STEPS.length; index += 1) {
    const step = (THREE_STEP_FAKE_WORKER_STEPS as readonly ThreeStepFakeWorkerStep[])[index];
    if (step === undefined) {
      throw new Error("Three-step fake worker invariant failed");
    }
    await ports.fail?.(`before:${step}`);
    const started = stepEvent(index, step, "started");
    events.push(started);
    await ports.record(started);

    const completed = stepEvent(index, step, "completed");
    await ports.commitStep({
      completedStepCount: (index + 1) as 1 | 2 | 3,
      completionEvent: completed,
    });
    events.push(completed);
    await ports.fail?.(`after:${step}`);
  }

  const workerCompleted: ThreeStepFakeWorkerEvent = {
    eventId: "fake-worker:completed",
    sequence: 7,
    type: "worker.completed",
    step: null,
  };
  events.push(workerCompleted);
  await ports.record(workerCompleted);
  return events;
}

export class FakeWorkerFailpointError extends Error {
  public readonly failpoint: ThreeStepFakeWorkerFailpoint;

  public constructor(failpoint: ThreeStepFakeWorkerFailpoint) {
    super(`Three-step fake worker stopped at ${failpoint}`);
    this.name = "FakeWorkerFailpointError";
    this.failpoint = failpoint;
  }
}

export function createThrowingFakeWorkerFailpoint(
  target: ThreeStepFakeWorkerFailpoint,
): NonNullable<ThreeStepFakeWorkerPorts["fail"]> {
  return (failpoint) => {
    if (failpoint === target) {
      throw new FakeWorkerFailpointError(failpoint);
    }
  };
}
