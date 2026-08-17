import {
  AttemptIdSchema,
  EventIdSchema,
  ProjectIdSchema,
  RoomIdSchema,
  type EventId,
  type RoomId,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  RoomFactoryEventBridge,
  RoomRepository,
  renderFactoryEventBody,
  type FactoryAttemptTransition,
  type FactoryEventSourcePort,
  type FactoryLedgerMark,
  type FactoryLedgerScan,
} from "../src/index.js";
import {
  FakeClock,
  PROJECT_ID,
  ROOM_ID,
  ROOM_ID_2,
  cleanupTestDatabases,
  openTestDatabase,
  plusMs,
  roomSpec,
  sequentialIds,
  T0,
} from "./helpers.js";

const OTHER_PROJECT_ID = "30000000-0000-4000-8000-000000000011";
const ROOM_ID_3 = RoomIdSchema.parse("30000000-0000-4000-8000-000000000003");
const ATTEMPT_A = AttemptIdSchema.parse("60000000-0000-4000-8000-00000000000a");
const ATTEMPT_B = AttemptIdSchema.parse("60000000-0000-4000-8000-00000000000b");

afterEach(() => {
  cleanupTestDatabases();
});

type LedgerRow = Readonly<{ transition: FactoryAttemptTransition | null; mark: FactoryLedgerMark }>;

/** An in-memory kernel ledger: every row has a position; some rows are attempt transitions. */
class FakeLedger implements FactoryEventSourcePort {
  readonly #rows: LedgerRow[] = [];
  public scans = 0;

  public eventId(n: number): EventId {
    return EventIdSchema.parse(`70000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  }

  /** Appends a non-transition kernel row (step event, evidence, ...) and returns its position. */
  public noise(occurredAt = T0): number {
    const position = this.#rows.length + 1;
    this.#rows.push({
      transition: null,
      mark: { ledgerPosition: position, eventId: this.eventId(position), occurredAt },
    });
    return position;
  }

  public transition(
    input: Partial<FactoryAttemptTransition> & Pick<FactoryAttemptTransition, "to">,
  ): FactoryAttemptTransition {
    const position = this.#rows.length + 1;
    const transition: FactoryAttemptTransition = {
      ledgerPosition: position,
      eventId: this.eventId(position),
      occurredAt: input.occurredAt ?? T0,
      attemptId: input.attemptId ?? ATTEMPT_A,
      projectId: ProjectIdSchema.parse(input.projectId ?? PROJECT_ID),
      taskTitle: input.taskTitle ?? "Add a farewell to GreetingFormatter",
      from: input.from ?? "running",
      to: input.to,
      outcome: input.outcome ?? null,
      blocker: input.blocker ?? null,
      brokerCommit: input.brokerCommit ?? null,
    };
    this.#rows.push({
      transition,
      mark: {
        ledgerPosition: position,
        eventId: transition.eventId,
        occurredAt: transition.occurredAt,
      },
    });
    return transition;
  }

  /** Simulates a table rebuild that renumbers every position by `offset`. */
  public renumber(offset: number): void {
    for (let index = 0; index < this.#rows.length; index += 1) {
      const row = this.#rows[index];
      if (row === undefined) continue;
      const position = row.mark.ledgerPosition + offset;
      this.#rows[index] = {
        transition:
          row.transition === null ? null : { ...row.transition, ledgerPosition: position },
        mark: { ...row.mark, ledgerPosition: position },
      };
    }
  }

  public head(): FactoryLedgerMark | null {
    return this.#rows.at(-1)?.mark ?? null;
  }

  public positionOf(eventId: EventId): number | null {
    return this.#rows.find((row) => row.mark.eventId === eventId)?.mark.ledgerPosition ?? null;
  }

  public scan(afterPosition: number, limit: number): FactoryLedgerScan {
    this.scans += 1;
    const rows = this.#rows
      .filter((row) => row.mark.ledgerPosition > afterPosition)
      .slice(0, limit);
    return {
      scannedThrough: rows.at(-1)?.mark ?? null,
      transitions: rows.flatMap((row) => (row.transition === null ? [] : [row.transition])),
    };
  }
}

function harness(
  options: { ledger?: FakeLedger; database?: ReturnType<typeof openTestDatabase> } = {},
) {
  const database = options.database ?? openTestDatabase();
  const repository = new RoomRepository(database);
  const ledger = options.ledger ?? new FakeLedger();
  const clock = new FakeClock();
  const woken: RoomId[] = [];
  const errors: unknown[] = [];
  const bridge = new RoomFactoryEventBridge({
    repository,
    source: ledger,
    wake: { wake: (roomId) => woken.push(roomId) },
    clock,
    ids: sequentialIds(),
    onError: (error) => errors.push(error),
  });
  return { database, repository, ledger, clock, woken, errors, bridge };
}

function systemLines(repository: RoomRepository, roomId: RoomId): readonly string[] {
  return repository
    .listMessages(roomId, 0, 100)
    .map((message) => (message.kind === "system" ? `${message.code}: ${message.body}` : "chat"));
}

describe("renderFactoryEventBody", () => {
  const base: FactoryAttemptTransition = {
    ledgerPosition: 1,
    eventId: EventIdSchema.parse("70000000-0000-4000-8000-000000000001"),
    occurredAt: T0,
    attemptId: ATTEMPT_A,
    projectId: ProjectIdSchema.parse(PROJECT_ID),
    taskTitle: 'Add a "farewell"   to GreetingFormatter',
    from: "running",
    to: "succeeded",
    outcome: { kind: "succeeded" },
    blocker: null,
    brokerCommit: "d0cbc6183f3657090ab5840035fc9e79bcd2927e",
  };

  it("states only durable facts, never a date", () => {
    expect(renderFactoryEventBody(base)).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → succeeded (broker commit d0cbc618)",
    );
    expect(renderFactoryEventBody({ ...base, brokerCommit: null })).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → succeeded",
    );
    expect(
      renderFactoryEventBody({
        ...base,
        to: "failed",
        outcome: {
          kind: "failed",
          failure: {
            code: "verifier.tests-failed",
            summary: "swift test failed",
            retryable: false,
            detailArtifactDigest: null,
          },
        },
        brokerCommit: null,
      }),
    ).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → failed (verifier.tests-failed)",
    );
    expect(
      renderFactoryEventBody({
        ...base,
        to: "blocked",
        outcome: null,
        blocker: {
          kind: "approval",
          code: "approval.required",
          summary: "needs sign-off",
          requiredAction: null,
        },
        brokerCommit: null,
      }),
    ).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → blocked (approval.required)",
    );
    expect(
      renderFactoryEventBody({
        ...base,
        from: "blocked",
        to: "running",
        outcome: null,
        brokerCommit: null,
      }),
    ).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → running again (unblocked from blocked)",
    );
    expect(
      renderFactoryEventBody({ ...base, to: "cancelled", outcome: null, brokerCommit: null }),
    ).toBe(
      "Factory: attempt 60000000 for task \"Add a 'farewell' to GreetingFormatter\" → cancelled",
    );
  });

  it("bounds a long title so the system line stays legible", () => {
    const body = renderFactoryEventBody({ ...base, taskTitle: "x".repeat(200) });
    expect(body.length).toBeLessThan(200);
    expect(body).toContain("…");
  });
});

describe("RoomFactoryEventBridge", () => {
  it("anchors at the ledger head on first start so history is never replayed", () => {
    const h = harness();
    h.ledger.transition({ to: "succeeded" });
    h.ledger.transition({ to: "failed" });
    h.repository.createRoom(roomSpec(), T0);
    h.bridge.start();
    expect(h.bridge.cursor).toMatchObject({
      ledgerPosition: 2,
      eventId: h.ledger.eventId(2),
      lastDeliveredEventId: null,
      deliveredCount: 0,
    });
    const report = h.bridge.drain();
    expect(report).toMatchObject({ transitions: 0, delivered: 0, wokenRoomIds: [] });
    expect(systemLines(h.repository, ROOM_ID)).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it("anchors at position 0 on an empty ledger and then bridges everything that follows", () => {
    const h = harness();
    h.bridge.start();
    expect(h.bridge.cursor).toMatchObject({ ledgerPosition: 0, eventId: null });
    h.repository.createRoom(roomSpec(), T0);
    h.ledger.transition({
      to: "succeeded",
      brokerCommit: "abcdef0123456789abcdef0123456789abcdef01",
    });
    const report = h.bridge.drain();
    expect(report).toMatchObject({ transitions: 1, delivered: 1, wokenRoomIds: [ROOM_ID] });
    expect(systemLines(h.repository, ROOM_ID)).toEqual([
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → succeeded (broker commit abcdef01)',
    ]);
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toMatchObject({
      kind: "factory-event",
      sourceSequence: 1,
    });
  });

  it("routes by projectId only: bound rooms get the line, other projects and portfolio-wide rooms do not", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID }), T0);
    h.repository.createRoom(
      roomSpec({ roomId: ROOM_ID_2, projectId: OTHER_PROJECT_ID as never }),
      T0,
    );
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID_3, projectId: null }), T0);
    h.ledger.transition({ to: "succeeded" });
    h.ledger.transition({
      to: "failed",
      projectId: OTHER_PROJECT_ID as never,
      attemptId: ATTEMPT_B,
    });
    const report = h.bridge.drain();
    expect(report).toMatchObject({ transitions: 2, delivered: 2 });
    expect(h.woken).toEqual([ROOM_ID, ROOM_ID_2]);
    expect(systemLines(h.repository, ROOM_ID)).toEqual([
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → succeeded',
    ]);
    expect(systemLines(h.repository, ROOM_ID_2)).toEqual([
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → failed (unknown)',
    ]);
    expect(systemLines(h.repository, ROOM_ID_3)).toEqual([]);
    expect(h.bridge.cursor).toMatchObject({
      ledgerPosition: 2,
      lastDeliveredEventId: h.ledger.eventId(2),
      deliveredCount: 2,
    });
  });

  it("delivers to every room bound to the project and skips non-bridgeable transitions", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID }), T0);
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID_2 }), T0);
    h.ledger.transition({ from: "queued", to: "running" });
    h.ledger.transition({ from: "running", to: "paused" });
    h.ledger.transition({ from: "paused", to: "running" });
    h.ledger.transition({ from: "running", to: "blocked" });
    h.ledger.transition({ from: "blocked", to: "running" });
    const report = h.bridge.drain();
    expect(report).toMatchObject({ transitions: 5, delivered: 4 });
    expect(systemLines(h.repository, ROOM_ID)).toEqual([
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → blocked (unknown)',
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → running again (unblocked from blocked)',
    ]);
    expect(systemLines(h.repository, ROOM_ID_2)).toEqual(systemLines(h.repository, ROOM_ID));
    // Non-matching rows still advance the cursor: nothing is rescanned.
    expect(h.bridge.cursor).toMatchObject({ ledgerPosition: 5, deliveredCount: 4 });
    expect(h.bridge.drain()).toMatchObject({ transitions: 0, delivered: 0 });
  });

  it("advances past unrelated kernel rows in one pass and honours the batch limit", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec(), T0);
    for (let index = 0; index < 5; index += 1) h.ledger.noise();
    h.ledger.transition({ to: "succeeded" });
    for (let index = 0; index < 3; index += 1) h.ledger.noise();
    const bounded = new RoomFactoryEventBridge({
      repository: h.repository,
      source: h.ledger,
      wake: { wake: () => undefined },
      clock: h.clock,
      ids: sequentialIds("41000000"),
      batchLimit: 4,
    });
    bounded.start();
    expect(bounded.drain()).toMatchObject({ transitions: 0, delivered: 0 });
    expect(bounded.cursor).toMatchObject({ ledgerPosition: 4, deliveredCount: 0 });
    expect(bounded.drain()).toMatchObject({ transitions: 1, delivered: 1 });
    expect(bounded.cursor).toMatchObject({ ledgerPosition: 8, deliveredCount: 1 });
    expect(bounded.drain()).toMatchObject({ transitions: 0, delivered: 0 });
    expect(bounded.cursor).toMatchObject({ ledgerPosition: 9, deliveredCount: 1 });
    expect(systemLines(h.repository, ROOM_ID)).toHaveLength(1);
  });

  it("never bridges the same kernel event twice across a restart", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec(), T0);
    h.ledger.transition({ to: "blocked" });
    expect(h.bridge.drain()).toMatchObject({ delivered: 1 });
    // A second daemon over the same database and the same ledger: the cursor is durable.
    const restarted = new RoomFactoryEventBridge({
      repository: new RoomRepository(h.database),
      source: h.ledger,
      wake: { wake: (roomId) => h.woken.push(roomId) },
      clock: h.clock,
      ids: sequentialIds("42000000"),
    });
    restarted.start();
    expect(restarted.drain()).toMatchObject({ transitions: 0, delivered: 0 });
    // ...and it picks up exactly what the previous daemon never reached.
    h.ledger.transition({ to: "succeeded" });
    expect(restarted.drain()).toMatchObject({ transitions: 1, delivered: 1 });
    expect(systemLines(h.repository, ROOM_ID)).toEqual([
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → blocked (unknown)',
      'factory-event: Factory: attempt 60000000 for task "Add a farewell to GreetingFormatter" → succeeded',
    ]);
    expect(h.woken).toEqual([ROOM_ID, ROOM_ID]);
    expect(restarted.cursor).toMatchObject({ ledgerPosition: 2, deliveredCount: 2 });
  });

  it("re-anchors by event id when the ledger was renumbered", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec(), T0);
    h.ledger.transition({ to: "succeeded" });
    h.ledger.noise();
    expect(h.bridge.drain()).toMatchObject({ delivered: 1 });
    expect(h.bridge.cursor).toMatchObject({ ledgerPosition: 2 });
    h.ledger.renumber(100);
    const restarted = new RoomFactoryEventBridge({
      repository: new RoomRepository(h.database),
      source: h.ledger,
      wake: { wake: () => undefined },
      clock: h.clock,
      ids: sequentialIds("43000000"),
    });
    restarted.start();
    expect(restarted.cursor).toMatchObject({ ledgerPosition: 102, eventId: h.ledger.eventId(2) });
    // Nothing is replayed after the re-anchor.
    expect(restarted.drain()).toMatchObject({ transitions: 0, delivered: 0 });
    expect(systemLines(h.repository, ROOM_ID)).toHaveLength(1);
  });

  it("does nothing before start, and drains nothing when the source has nothing new", () => {
    const h = harness();
    h.repository.createRoom(roomSpec(), T0);
    h.ledger.transition({ to: "succeeded" });
    expect(h.bridge.drain()).toMatchObject({ transitions: 0, delivered: 0, cursor: null });
    expect(h.ledger.scans).toBe(0);
    expect(systemLines(h.repository, ROOM_ID)).toEqual([]);
  });

  it("stamps the room line no earlier than the transcript head", () => {
    const h = harness();
    h.bridge.start();
    const later = plusMs(T0, 60_000);
    h.repository.createRoom(roomSpec(), T0);
    h.repository.appendSystemLine({
      roomId: ROOM_ID,
      messageId: sequentialIds("44000000").messageId(),
      code: "all-passed",
      body: "All agents passed.",
      now: later,
    });
    // The bridge clock is behind the head: the line lands at the head instant, not before it.
    h.ledger.transition({ to: "succeeded" });
    expect(h.bridge.drain()).toMatchObject({ delivered: 1 });
    const line = h.repository.findMessage(ROOM_ID, 2);
    expect(line?.occurredAt).toBe(later);
  });

  it("records a failing scan without advancing the cursor and retries on the next drain", () => {
    const h = harness();
    h.bridge.start();
    h.repository.createRoom(roomSpec(), T0);
    h.ledger.transition({ to: "succeeded" });
    let failOnce = true;
    const flaky: FactoryEventSourcePort = {
      head: () => h.ledger.head(),
      positionOf: (eventId) => h.ledger.positionOf(eventId),
      scan: (after, limit) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("ledger unavailable");
        }
        return h.ledger.scan(after, limit);
      },
    };
    const errors: unknown[] = [];
    const bridge = new RoomFactoryEventBridge({
      repository: h.repository,
      source: flaky,
      wake: { wake: () => undefined },
      clock: h.clock,
      ids: sequentialIds("45000000"),
      onError: (error) => errors.push(error),
    });
    bridge.start();
    expect(bridge.drain()).toMatchObject({ transitions: 0, delivered: 0 });
    expect(errors).toHaveLength(1);
    expect(bridge.lastError).toBeInstanceOf(Error);
    expect(bridge.cursor).toMatchObject({ ledgerPosition: 0 });
    expect(bridge.drain()).toMatchObject({ transitions: 1, delivered: 1 });
    expect(bridge.lastError).toBeNull();
  });
});
