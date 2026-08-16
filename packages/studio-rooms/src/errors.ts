import type { RoomAgentErrorCodeV1 } from "@app-factory/contracts";

const ROOM_ERROR_CODE_PATTERN = /^room\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Nominal, typed error for every rule the room engine refuses on. Codes are
 * `room.<kebab>` so the daemon can forward them verbatim as command protocol
 * error codes; consumers must use `instanceof`, never message text.
 */
export class RoomError extends Error {
  public readonly code: string;

  public constructor(
    code: string,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RoomError";
    if (!ROOM_ERROR_CODE_PATTERN.test(code)) {
      throw new TypeError(`Invalid room error code: ${code}`);
    }
    this.code = code;
  }
}

/** Compare-and-swap failure: the transcript head is no longer the one a grant was stamped with. */
export class RoomHeadMovedError extends RoomError {
  public constructor(
    public readonly expectedHeadSequence: number,
    public readonly currentHeadSequence: number,
  ) {
    super(
      "room.head-moved",
      `Room transcript head moved from ${String(expectedHeadSequence)} to ${String(currentHeadSequence)}; the buffered contribution was not posted over it.`,
      true,
    );
    this.name = "RoomHeadMovedError";
  }
}

/**
 * The typed failure a `ContributorPort` may throw (or return as
 * `{ kind: "error" }`) so the moderator can classify it without parsing
 * provider text. Anything else thrown is classified `internal`.
 */
export class RoomAgentFailure extends Error {
  public constructor(
    public readonly code: RoomAgentErrorCodeV1,
    message: string,
    public readonly retryAfterMs: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RoomAgentFailure";
    if (retryAfterMs !== null && (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 0)) {
      throw new TypeError("retryAfterMs must be a non-negative safe integer or null");
    }
  }
}
