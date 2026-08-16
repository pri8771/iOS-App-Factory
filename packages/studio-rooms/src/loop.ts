import { IsoInstantSchema, type RoomId, type RoomMessageId } from "@app-factory/contracts";

import type { RoomModerator, RoomRoundOutcome, RoomSweepReport } from "./moderator.js";
import type { RoomClockPort, RoomWaitPort } from "./ports.js";
import type { RoomRepository } from "./repository.js";

const MAX_DEFER_WAIT_MS = 60_000;

export type RoomModeratorLoopOptions = Readonly<{
  moderator: RoomModerator;
  repository: RoomRepository;
  clock?: RoomClockPort;
  wait?: RoomWaitPort;
  onError?: (error: unknown) => void;
  onRound?: (roomId: RoomId, outcome: RoomRoundOutcome) => void;
}>;

/** Wake seam the daemon's command boundary uses after `room.post`/`room.typing`. */
export type RoomWakePort = Readonly<{ wake(roomId: RoomId): void }>;

const defaultWait: RoomWaitPort = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

function abortError(): Error {
  const error = new Error("The room loop wait was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Per-room driver: each room's pending trigger is drained by one serial
 * chain of rounds; different rooms progress concurrently. `start` runs the
 * orphan sweep and resumes every room with a durable pending trigger, so a
 * restart picks up exactly where the previous daemon stopped. Every `wake`
 * re-runs the sweep first (cheap: one indexed query) so a stale lock left by
 * a crashed run never blocks the human's next message.
 */
export class RoomModeratorLoop implements RoomWakePort {
  readonly #moderator: RoomModerator;
  readonly #repository: RoomRepository;
  readonly #clock: RoomClockPort;
  readonly #wait: RoomWaitPort;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #onRound: ((roomId: RoomId, outcome: RoomRoundOutcome) => void) | undefined;
  readonly #drivers = new Map<RoomId, Promise<void>>();
  readonly #deferWaits = new Map<RoomId, AbortController>();
  readonly #wakeRequested = new Set<RoomId>();
  #started = false;
  #stopping = false;
  #lastError: unknown | null = null;
  #lastSweep: RoomSweepReport | null = null;

  public constructor(options: RoomModeratorLoopOptions) {
    this.#moderator = options.moderator;
    this.#repository = options.repository;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#wait = options.wait ?? defaultWait;
    this.#onError = options.onError;
    this.#onRound = options.onRound;
  }

  public get lastError(): unknown | null {
    return this.#lastError;
  }

  public get lastSweep(): RoomSweepReport | null {
    return this.#lastSweep;
  }

  public get activeRoomIds(): readonly RoomId[] {
    return [...this.#drivers.keys()];
  }

  public start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#sweep();
    for (const roomId of this.#repository.listRoomIdsWithPendingTriggers()) {
      this.#drive(roomId);
    }
  }

  public wake(roomId: RoomId): void {
    if (this.#stopping) return;
    this.#sweep();
    if (!this.#started) return;
    this.#drive(roomId);
  }

  /** Records a factory event in a room and wakes it (used by daemon composition, not the wire). */
  public notifyFactoryEvent(roomId: RoomId, body: string, messageId: RoomMessageId): void {
    this.#repository.appendFactoryEvent({
      roomId,
      messageId,
      body,
      now: IsoInstantSchema.parse(this.#clock.now().toISOString()),
    });
    this.wake(roomId);
  }

  public async stop(): Promise<void> {
    this.#stopping = true;
    for (const controller of this.#deferWaits.values()) controller.abort();
    await Promise.allSettled([...this.#drivers.values()]);
  }

  #sweep(): void {
    try {
      this.#lastSweep = this.#moderator.sweep();
    } catch (error) {
      this.#recordError(error);
    }
  }

  #drive(roomId: RoomId): void {
    const existing = this.#drivers.get(roomId);
    if (existing !== undefined) {
      this.#wakeRequested.add(roomId);
      this.#deferWaits.get(roomId)?.abort();
      return;
    }
    const run = this.#run(roomId).finally(() => {
      this.#drivers.delete(roomId);
      if (this.#wakeRequested.delete(roomId) && !this.#stopping) {
        this.#drive(roomId);
      }
    });
    this.#drivers.set(roomId, run);
  }

  async #run(roomId: RoomId): Promise<void> {
    while (!this.#stopping) {
      this.#wakeRequested.delete(roomId);
      let trigger;
      try {
        trigger = this.#repository.takePendingTrigger(roomId);
      } catch (error) {
        this.#recordError(error);
        return;
      }
      if (trigger === null) return;
      let outcome: RoomRoundOutcome;
      try {
        outcome = await this.#moderator.runRound(roomId, trigger);
        this.#lastError = null;
      } catch (error) {
        this.#recordError(error);
        return;
      }
      this.#onRound?.(roomId, outcome);
      if (outcome.kind !== "deferred") continue;
      if (outcome.retryAt === null) return;
      const delay = Math.min(
        MAX_DEFER_WAIT_MS,
        Math.max(0, Date.parse(outcome.retryAt) - this.#clock.now().getTime()),
      );
      const controller = new AbortController();
      this.#deferWaits.set(roomId, controller);
      try {
        await this.#wait(delay, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) this.#recordError(error);
      } finally {
        if (this.#deferWaits.get(roomId) === controller) this.#deferWaits.delete(roomId);
      }
    }
  }

  #recordError(error: unknown): void {
    this.#lastError = error;
    try {
      this.#onError?.(error);
    } catch (observerError) {
      this.#lastError = new AggregateError(
        [error, observerError],
        "The room moderator loop and its error observer both failed",
      );
    }
  }
}
