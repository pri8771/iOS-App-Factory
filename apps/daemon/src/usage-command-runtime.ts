import type { CommandRequestV1, CommandResultV1, IsoInstant } from "@app-factory/contracts";
import type { TokenUsageRepository } from "@app-factory/kernel";

/**
 * `usage.summary` (Architecture decision 6): the honest token ledger's read side. A thin pass-
 * through to `TokenUsageRepository.summarize` -- see that method's own doc comment for the
 * null-honest per-`(providerKey, model, dayKey)` SUMs and `unreportedCount` it projects.
 * `asOf` is the command's own `observedAt`, never the wall clock read again here, so a summary is
 * reproducible for a given command exactly like every other daemon read model.
 */
export function buildUsageSummaryResultV1(
  tokenUsage: TokenUsageRepository,
  request: Extract<CommandRequestV1, { operation: "usage.summary" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  return {
    operation: "usage.summary",
    summary: tokenUsage.summarize({ sinceDays: request.payload.sinceDays, asOf: observedAt }),
  };
}
