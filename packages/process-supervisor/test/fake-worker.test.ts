import { describe, expect, it, vi } from "vitest";

import {
  FakeWorkerFailpointError,
  createThrowingFakeWorkerFailpoint,
  runThreeStepFakeWorker,
  type ThreeStepFakeWorkerEvent,
} from "../src/index.js";

describe("three-step fake worker", () => {
  it("emits and checkpoints the same deterministic sequence every time", async () => {
    const recorded: ThreeStepFakeWorkerEvent[] = [];
    const checkpoints: number[] = [];
    const events = await runThreeStepFakeWorker({
      record: (event) => recorded.push(event),
      commitStep: ({ completedStepCount, completionEvent }) => {
        checkpoints.push(completedStepCount);
        recorded.push(completionEvent);
      },
    });

    expect(checkpoints).toEqual([1, 2, 3]);
    expect(recorded).toEqual(events);
    expect(
      events.map(({ sequence, type, step }) => `${sequence}:${type}:${step ?? "none"}`),
    ).toEqual([
      "1:step.started:prepare",
      "2:step.completed:prepare",
      "3:step.started:execute",
      "4:step.completed:execute",
      "5:step.started:verify",
      "6:step.completed:verify",
      "7:worker.completed:none",
    ]);
  });

  it("resumes after a durable checkpoint without replaying completed steps", async () => {
    const checkpoints: number[] = [];
    const events = await runThreeStepFakeWorker(
      {
        record: vi.fn(),
        commitStep: ({ completedStepCount }) => checkpoints.push(completedStepCount),
      },
      { completedStepCount: 2 },
    );
    expect(checkpoints).toEqual([3]);
    expect(events.map((event) => event.step)).toEqual(["verify", "verify", null]);
    expect(events.map((event) => event.sequence)).toEqual([5, 6, 7]);
  });

  it("stops at an injected failpoint with a typed, replayable location", async () => {
    const checkpoints: number[] = [];
    const recorded: ThreeStepFakeWorkerEvent[] = [];
    await expect(
      runThreeStepFakeWorker({
        record: (event) => recorded.push(event),
        commitStep: ({ completedStepCount, completionEvent }) => {
          checkpoints.push(completedStepCount);
          recorded.push(completionEvent);
        },
        fail: createThrowingFakeWorkerFailpoint("before:execute"),
      }),
    ).rejects.toEqual(new FakeWorkerFailpointError("before:execute"));
    expect(checkpoints).toEqual([1]);
    expect(recorded.map((event) => event.type)).toEqual(["step.started", "step.completed"]);
  });

  it("atomically commits completion and resumes with stable global event IDs and sequences", async () => {
    const durableEvents: ThreeStepFakeWorkerEvent[] = [];
    let checkpoint: 0 | 1 | 2 | 3 = 0;
    await expect(
      runThreeStepFakeWorker({
        record: (event) => durableEvents.push(event),
        commitStep: (commit) => {
          checkpoint = commit.completedStepCount;
          durableEvents.push(commit.completionEvent);
        },
        fail: createThrowingFakeWorkerFailpoint("after:prepare"),
      }),
    ).rejects.toBeInstanceOf(FakeWorkerFailpointError);
    expect(checkpoint).toBe(1);

    await runThreeStepFakeWorker(
      {
        record: (event) => durableEvents.push(event),
        commitStep: (commit) => {
          checkpoint = commit.completedStepCount;
          durableEvents.push(commit.completionEvent);
        },
      },
      { completedStepCount: checkpoint },
    );
    expect(checkpoint).toBe(3);
    expect(durableEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(durableEvents.map((event) => event.eventId)).size).toBe(7);
  });
});
