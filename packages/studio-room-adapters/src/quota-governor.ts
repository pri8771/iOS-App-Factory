import type {
  QuotaDecision,
  QuotaGovernorPort,
  QuotaReserveRequest,
} from "@app-factory/studio-rooms";

/** Answers "does the factory currently have work in flight" for the governor below. */
export type FactoryActivityPort = Readonly<{ hasRunningAttempt(): boolean }>;

export type FactoryAwareQuotaGovernorOptions = Readonly<{
  activity: FactoryActivityPort;
  /** How long a throttled room request is told to wait before retrying. */
  throttleMs?: number;
}>;

const noopReservation = { settle: () => undefined, release: () => undefined };

/**
 * Real, deliberately simple priority governor: factory reservations always
 * succeed (the factory's own scheduler is the actual gate on factory
 * concurrency; this governor never second-guesses it). Room reservations
 * succeed only when {@link FactoryActivityPort.hasRunningAttempt} reports no
 * running attempt -- any attempt currently in flight throttles every room in
 * the same poll round, matching the room engine's own "rooms yield to
 * factory work" system line. This is intentionally not a token-bucket or
 * sliding-window model (see `PriorityQuotaGovernor` in
 * `@app-factory/studio-rooms` for that shape); it is a binary priority class
 * driven by one live signal.
 */
export function createFactoryAwareQuotaGovernor(
  options: FactoryAwareQuotaGovernorOptions,
): QuotaGovernorPort {
  const throttleMs = options.throttleMs ?? 30_000;
  if (!Number.isSafeInteger(throttleMs) || throttleMs < 1_000 || throttleMs > 60 * 60_000) {
    throw new TypeError("throttleMs must be a safe integer between 1000 and 3600000");
  }
  return {
    reserve(request: QuotaReserveRequest): QuotaDecision {
      if (request.priority === "factory") {
        return { granted: true, reservation: noopReservation };
      }
      if (options.activity.hasRunningAttempt()) {
        return { granted: false, retryAt: new Date(request.now.getTime() + throttleMs) };
      }
      return { granted: true, reservation: noopReservation };
    },
  };
}
