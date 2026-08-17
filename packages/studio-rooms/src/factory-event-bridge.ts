import { randomUUID } from "node:crypto";

import {
  IsoInstantSchema,
  RoomMessageIdSchema,
  type AttemptId,
  type AttemptOutcomeV1,
  type AttemptStateV1,
  type BlockerV1,
  type EventId,
  type IsoInstant,
  type ProjectId,
  type RoomFactoryBridgeCursorV1,
  type RoomId,
  type RoomMessageId,
} from "@app-factory/contracts";

import type { RoomWakePort } from "./loop.js";
import type { RoomClockPort, RoomIdFactoryPort } from "./ports.js";
import type { FactoryEventDelivery, RoomRepository } from "./repository.js";

export const DEFAULT_FACTORY_EVENT_BRIDGE_BATCH_LIMIT = 200;
const MAX_FACTORY_EVENT_BRIDGE_BATCH_LIMIT = 10_000;
const MAX_TITLE_IN_BODY = 120;

/**
 * One kernel attempt transition the bridge may turn into a room line. Every
 * field is read from durable kernel state by the source port; the bridge
 * never invents any of it (in particular `occurredAt` is the kernel event's
 * own instant, and `brokerCommit` is only ever a commit sha the source found
 * in committed evidence).
 */
export type FactoryAttemptTransition = Readonly<{
  /** Position of this event in the kernel ledger; strictly increasing across a scan. */
  ledgerPosition: number;
  eventId: EventId;
  occurredAt: IsoInstant;
  attemptId: AttemptId;
  projectId: ProjectId;
  taskTitle: string;
  from: AttemptStateV1;
  to: AttemptStateV1;
  outcome: AttemptOutcomeV1 | null;
  blocker: BlockerV1 | null;
  /** Full broker commit sha for a succeeded attempt when the source could read it from evidence; else null. */
  brokerCommit: string | null;
}>;

/** A ledger position plus the kernel event found there (the scan's tail marker). */
export type FactoryLedgerMark = Readonly<{
  ledgerPosition: number;
  eventId: EventId;
  occurredAt: IsoInstant;
}>;

export type FactoryLedgerScan = Readonly<{
  /**
   * The last ledger row examined by this scan, whether or not it was a
   * transition; null when nothing exists after `afterPosition`. The bridge
   * advances its cursor to this mark so unrelated kernel events (step
   * transitions, evidence, ...) are never rescanned.
   */
  scannedThrough: FactoryLedgerMark | null;
  /** Attempt transitions worth bridging, in ledger order. */
  transitions: readonly FactoryAttemptTransition[];
}>;

/**
 * The daemon composes this over the kernel's own `events` table (see
 * `apps/daemon/src/room-factory-event-source.ts`); tests use a fake. It is
 * a pure read of durable state: the bridge is the only writer of its cursor.
 */
export type FactoryEventSourcePort = Readonly<{
  /** The ledger's current head, used once to anchor a fresh cursor so history is never replayed. */
  head(): FactoryLedgerMark | null;
  /** Re-resolves a kernel event's current ledger position by id (null when it no longer exists). */
  positionOf(eventId: EventId): number | null;
  /** Rows strictly after `afterPosition`, in ledger order, at most `limit` ledger rows examined. */
  scan(afterPosition: number, limit: number): FactoryLedgerScan;
}>;

export type RoomFactoryEventBridgeOptions = Readonly<{
  repository: RoomRepository;
  source: FactoryEventSourcePort;
  /** The moderator loop (or a fake): every delivered room is woken so its factory-event trigger runs. */
  wake: RoomWakePort;
  clock?: RoomClockPort;
  ids?: Pick<RoomIdFactoryPort, "messageId">;
  batchLimit?: number;
  onError?: (error: unknown) => void;
}>;

export type RoomFactoryEventBridgeDrainReport = Readonly<{
  /** Kernel transitions examined (matched or not). */
  transitions: number;
  /** `factory-event` lines appended, summed over rooms. */
  delivered: number;
  /** Rooms woken (one wake per delivered line). */
  wokenRoomIds: readonly RoomId[];
  cursor: RoomFactoryBridgeCursorV1 | null;
}>;

/**
 * States that produce a room line. Terminal outcomes and blocks matter to a
 * room bound to the project; the intermediate `queued -> running` does not
 * (a room would only learn "something started"), and `blocked -> running`
 * (an operator's unblock) is included because it is the human-relevant
 * counterpart of `blocked`.
 */
function isBridgeable(from: AttemptStateV1, to: AttemptStateV1): boolean {
  switch (to) {
    case "succeeded":
    case "failed":
    case "blocked":
    case "cancelled":
      return true;
    case "running":
      return from === "blocked";
    case "queued":
    case "paused":
      return false;
  }
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function quoteTitle(title: string): string {
  const trimmed = title.replaceAll(/\s+/g, " ").trim();
  const bounded =
    trimmed.length > MAX_TITLE_IN_BODY ? `${trimmed.slice(0, MAX_TITLE_IN_BODY - 1)}…` : trimmed;
  return `"${bounded.replaceAll('"', "'")}"`;
}

/**
 * The factual, durable-state-only body of a factory-event line. No date is
 * ever written into the text: the line's own `occurredAt` (and the kernel
 * event's `occurredAt` the source reports) are the record of when.
 */
export function renderFactoryEventBody(transition: FactoryAttemptTransition): string {
  const head = `Factory: attempt ${shortId(transition.attemptId)} for task ${quoteTitle(transition.taskTitle)}`;
  switch (transition.to) {
    case "succeeded":
      return transition.brokerCommit === null
        ? `${head} → succeeded`
        : `${head} → succeeded (broker commit ${shortId(transition.brokerCommit)})`;
    case "failed": {
      const code =
        transition.outcome?.kind === "failed" ? transition.outcome.failure.code : "unknown";
      return `${head} → failed (${code})`;
    }
    case "blocked":
      return `${head} → blocked (${transition.blocker?.code ?? "unknown"})`;
    case "cancelled":
      return `${head} → cancelled`;
    case "running":
      return `${head} → running again (unblocked from ${transition.from})`;
    case "queued":
    case "paused":
      return `${head} → ${transition.to}`;
  }
}

/**
 * The daemon-composed bridge from kernel attempt transitions to room
 * `factory-event` lines -- the missing producer of the unattended path's
 * only admissible trigger. Each `drain` reads the kernel ledger strictly
 * after the durable cursor, appends one system line per bridgeable
 * transition to every room whose `projectId` equals the attempt's task
 * projectId (portfolio-wide rooms with a null projectId are deliberately
 * NOT delivered to; see the package README), advances the cursor in the same
 * transaction, and wakes each delivered room. Restart-safe by construction:
 * the cursor lives in the rooms database (migration 0013), so a transition
 * bridged before a crash is never bridged again, and one the previous
 * daemon never reached is picked up by the next.
 */
export class RoomFactoryEventBridge {
  readonly #repository: RoomRepository;
  readonly #source: FactoryEventSourcePort;
  readonly #wake: RoomWakePort;
  readonly #clock: RoomClockPort;
  readonly #ids: Pick<RoomIdFactoryPort, "messageId">;
  readonly #batchLimit: number;
  readonly #onError: ((error: unknown) => void) | undefined;
  #started = false;
  #draining = false;
  #lastError: unknown | null = null;

  public constructor(options: RoomFactoryEventBridgeOptions) {
    this.#repository = options.repository;
    this.#source = options.source;
    this.#wake = options.wake;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#ids = options.ids ?? {
      messageId: (): RoomMessageId => RoomMessageIdSchema.parse(randomUUID()),
    };
    const batchLimit = options.batchLimit ?? DEFAULT_FACTORY_EVENT_BRIDGE_BATCH_LIMIT;
    if (
      !Number.isSafeInteger(batchLimit) ||
      batchLimit < 1 ||
      batchLimit > MAX_FACTORY_EVENT_BRIDGE_BATCH_LIMIT
    ) {
      throw new TypeError(
        `batchLimit must be a positive integer of at most ${String(MAX_FACTORY_EVENT_BRIDGE_BATCH_LIMIT)}`,
      );
    }
    this.#batchLimit = batchLimit;
    this.#onError = options.onError;
  }

  public get lastError(): unknown | null {
    return this.#lastError;
  }

  public get cursor(): RoomFactoryBridgeCursorV1 | null {
    return this.#repository.findFactoryEventCursor();
  }

  /**
   * Anchors the cursor at the ledger head on first use (never replays
   * history), or re-anchors an existing cursor by event id when the kernel
   * ledger was rebuilt and its positions changed. Idempotent; safe to call
   * on every daemon start.
   */
  public start(): void {
    if (this.#started) return;
    this.#started = true;
    try {
      const now = this.#now();
      const existing = this.#repository.findFactoryEventCursor();
      if (existing === null) {
        const head = this.#source.head();
        this.#repository.anchorFactoryEventCursor({
          ledgerPosition: head?.ledgerPosition ?? 0,
          eventId: head?.eventId ?? null,
          eventOccurredAt: head?.occurredAt ?? null,
          now,
        });
        return;
      }
      if (existing.eventId !== null) {
        const position = this.#source.positionOf(existing.eventId);
        if (position !== null && position !== existing.ledgerPosition) {
          this.#repository.reanchorFactoryEventCursor(position, now);
        }
      }
    } catch (error) {
      this.#recordError(error);
    }
  }

  /**
   * One pass over everything the kernel appended since the cursor. Never
   * throws: a failure is recorded (and reported to `onError`) and the cursor
   * is left where the last fully bridged event put it, so the next drain
   * retries from exactly there. Re-entrancy is refused (the daemon calls
   * this from its scheduler loop; the loop is serial, but a wake-time
   * caller must not interleave).
   */
  public drain(): RoomFactoryEventBridgeDrainReport {
    const woken: RoomId[] = [];
    let transitions = 0;
    let delivered = 0;
    if (!this.#started || this.#draining) {
      return { transitions, delivered, wokenRoomIds: woken, cursor: this.cursor };
    }
    this.#draining = true;
    try {
      const cursor = this.#repository.findFactoryEventCursor();
      if (cursor === null) throw new Error("The factory-event bridge cursor is not anchored");
      const scan = this.#source.scan(cursor.ledgerPosition, this.#batchLimit);
      let last = cursor.ledgerPosition;
      for (const transition of scan.transitions) {
        transitions += 1;
        if (transition.ledgerPosition <= last) {
          throw new Error(
            `Factory event source returned ledger position ${String(transition.ledgerPosition)} out of order (after ${String(last)})`,
          );
        }
        const deliveries: FactoryEventDelivery[] = [];
        if (isBridgeable(transition.from, transition.to)) {
          const body = renderFactoryEventBody(transition);
          for (const roomId of this.#repository.listRoomIdsForProject(transition.projectId)) {
            deliveries.push({ roomId, messageId: this.#ids.messageId(), body });
          }
        }
        // A line reporting a kernel event never predates that event: the
        // scheduler's monotone clock can sit a few ms ahead of the daemon's
        // wall clock, so the transcript instant is floored at the event's own
        // `occurredAt` (and the repository floors it again at the room head).
        const now = this.#now();
        const lines = this.#repository.bridgeFactoryEvent({
          ledgerPosition: transition.ledgerPosition,
          eventId: transition.eventId,
          eventOccurredAt: transition.occurredAt,
          deliveries,
          now: transition.occurredAt > now ? transition.occurredAt : now,
        });
        last = transition.ledgerPosition;
        for (const line of lines) {
          delivered += 1;
          woken.push(line.roomId);
          this.#wake.wake(line.roomId);
        }
      }
      if (scan.scannedThrough !== null && scan.scannedThrough.ledgerPosition > last) {
        this.#repository.bridgeFactoryEvent({
          ledgerPosition: scan.scannedThrough.ledgerPosition,
          eventId: scan.scannedThrough.eventId,
          eventOccurredAt: scan.scannedThrough.occurredAt,
          deliveries: [],
          now: this.#now(),
        });
      }
      this.#lastError = null;
    } catch (error) {
      this.#recordError(error);
    } finally {
      this.#draining = false;
    }
    return { transitions, delivered, wokenRoomIds: woken, cursor: this.cursor };
  }

  #now(): IsoInstant {
    return IsoInstantSchema.parse(this.#clock.now().toISOString());
  }

  #recordError(error: unknown): void {
    this.#lastError = error;
    try {
      this.#onError?.(error);
    } catch (observerError) {
      this.#lastError = new AggregateError(
        [error, observerError],
        "The room factory-event bridge and its error observer both failed",
      );
    }
  }
}
