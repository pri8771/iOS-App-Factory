import type { RoomClockPort } from "./ports.js";
import type { QuotaDecision, QuotaGovernorPort, QuotaReserveRequest } from "./ports.js";

export type PriorityQuotaGovernorOptions = Readonly<{
  /** Sliding window length. */
  windowMs: number;
  /** Tokens the whole window may admit (factory + rooms). */
  capacityTokens: number;
  /**
   * Fraction of `capacityTokens` rooms may consume; the remainder is held
   * back for the factory. Factory reservations ignore this share and may use
   * the whole window.
   */
  roomsShareFraction: number;
  clock: RoomClockPort;
}>;

type Charge = Readonly<{ at: number; tokens: number }>;

function validateInteger(label: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${label} must be a safe integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return value;
}

/**
 * Deterministic in-memory sliding-window governor. Reservations are charged
 * at reserve time (so concurrent callers see each other) and adjusted at
 * settle time; a settled reservation keeps only its actual consumption in
 * the window. Rooms are refused whenever admitting them would push total
 * usage above `capacity * roomsShare`; factory is refused only above the
 * full capacity. `retryAt` is the instant the oldest charge that blocks the
 * caller falls out of the window (or the end of the window when the request
 * cannot ever fit).
 */
export class PriorityQuotaGovernor implements QuotaGovernorPort {
  readonly #windowMs: number;
  readonly #capacity: number;
  readonly #roomsCeiling: number;
  readonly #clock: RoomClockPort;
  #charges: Charge[] = [];

  public constructor(options: PriorityQuotaGovernorOptions) {
    this.#windowMs = validateInteger("windowMs", options.windowMs, 1, 24 * 60 * 60_000);
    this.#capacity = validateInteger(
      "capacityTokens",
      options.capacityTokens,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (
      typeof options.roomsShareFraction !== "number" ||
      !Number.isFinite(options.roomsShareFraction) ||
      options.roomsShareFraction <= 0 ||
      options.roomsShareFraction > 1
    ) {
      throw new TypeError("roomsShareFraction must be a number in (0, 1]");
    }
    this.#roomsCeiling = Math.floor(this.#capacity * options.roomsShareFraction);
    this.#clock = options.clock;
  }

  /** Tokens currently charged inside the window. */
  public usage(now: Date = this.#clock.now()): number {
    this.#evict(now.getTime());
    return this.#charges.reduce((sum, charge) => sum + charge.tokens, 0);
  }

  public reserve(request: QuotaReserveRequest): QuotaDecision {
    const tokens = validateInteger("tokens", request.tokens, 1, Number.MAX_SAFE_INTEGER);
    const nowMs = request.now.getTime();
    this.#evict(nowMs);
    const ceiling = request.priority === "factory" ? this.#capacity : this.#roomsCeiling;
    const used = this.usage(request.now);
    if (used + tokens > ceiling) {
      return { granted: false, retryAt: this.#retryAt(nowMs, tokens, ceiling, used) };
    }
    const charge: Charge = { at: nowMs, tokens };
    this.#charges.push(charge);
    let open = true;
    const replace = (actual: number): void => {
      if (!open) return;
      open = false;
      const index = this.#charges.indexOf(charge);
      if (index === -1) return;
      if (actual <= 0) {
        this.#charges.splice(index, 1);
      } else {
        this.#charges[index] = { at: charge.at, tokens: Math.min(actual, charge.tokens) };
      }
    };
    return {
      granted: true,
      reservation: {
        settle: (actualTokens) => {
          replace(validateInteger("actualTokens", actualTokens, 0, Number.MAX_SAFE_INTEGER));
        },
        release: () => {
          replace(0);
        },
      },
    };
  }

  #evict(nowMs: number): void {
    const cutoff = nowMs - this.#windowMs;
    this.#charges = this.#charges.filter((charge) => charge.at > cutoff);
  }

  #retryAt(nowMs: number, tokens: number, ceiling: number, used: number): Date {
    if (tokens > ceiling) return new Date(nowMs + this.#windowMs);
    let freed = 0;
    for (const charge of [...this.#charges].sort((left, right) => left.at - right.at)) {
      freed += charge.tokens;
      if (used - freed + tokens <= ceiling) {
        return new Date(charge.at + this.#windowMs);
      }
    }
    return new Date(nowMs + this.#windowMs);
  }
}

/** Governor that admits everything; the default when no shared window is configured. */
export const unlimitedQuotaGovernor: QuotaGovernorPort = {
  reserve: () => ({
    granted: true,
    reservation: { settle: () => undefined, release: () => undefined },
  }),
};
