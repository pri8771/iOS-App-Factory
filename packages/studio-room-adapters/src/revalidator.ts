import type { RevalidatePort, RoomRevalidationDecision } from "@app-factory/studio-rooms";

/**
 * `RevalidatePort` is consulted only when a human posted between a grant
 * being issued and the agent's reply being committed -- a race, not the
 * common case. This implementation is deliberately model-free: it always
 * drops the buffered reply rather than risk posting a completion that never
 * saw the human's newer message, or spending a second real-model call just
 * to decide that. The moderator's own chaining (`#queueChain`) already lets
 * the same persona speak again on the very next round with full, current
 * context, so nothing the agent had to say is lost -- only delayed by one
 * round.
 */
export function createAlwaysDropRevalidator(): RevalidatePort {
  return {
    revalidate(): Promise<RoomRevalidationDecision> {
      return Promise.resolve({ decision: "drop" });
    },
  };
}
