import type {
  ContributorPort,
  RoomContributionRequest,
  RoomContributionResult,
} from "@app-factory/studio-rooms";

import type { ParticipantAdapter, ParticipantContextMessage } from "./participant-adapter.js";
import type { RoomCharterProvider } from "./roster.js";

export type RoomAdapterContributorOptions = Readonly<{
  /** One adapter per `RoomProvider` a room roster may reference. */
  adapters: readonly ParticipantAdapter[];
  /** Supplies the room charter, persona charter, and network policy per room. */
  charters: RoomCharterProvider;
}>;

function excerptTranscript(
  transcript: RoomContributionRequest["transcript"],
  maxMessages: number,
): readonly ParticipantContextMessage[] {
  const window = transcript.slice(-maxMessages);
  return window.map((message) =>
    message.kind === "message"
      ? {
          author: message.author.kind === "human" ? message.author.handle : message.author.persona,
          body: message.body,
        }
      : { author: "system", body: message.body },
  );
}

/**
 * The single `ContributorPort` the daemon wires into `RoomModerator`: routes
 * each grant to the `ParticipantAdapter` matching `participant.provider`,
 * builds the bounded context recipe (charter + rolling summary + last ≤30
 * messages + persona charter) from `RoomContributionRequest`, and maps the
 * adapter's result back onto `RoomContributionResult`. An adapter throwing
 * (a programming error, not a provider failure -- adapters map provider
 * failures to a typed `{ kind: "error" }` result themselves) is caught here
 * and reported as `internal`, so one broken adapter can never crash the
 * moderator loop.
 */
export function createRoomAdapterContributor(
  options: RoomAdapterContributorOptions,
): ContributorPort {
  const byProvider = new Map<string, ParticipantAdapter>();
  for (const adapter of options.adapters) {
    if (byProvider.has(adapter.provider)) {
      throw new TypeError(
        `Duplicate ParticipantAdapter registered for provider: ${adapter.provider}`,
      );
    }
    byProvider.set(adapter.provider, adapter);
  }

  return {
    async contribute(request: RoomContributionRequest): Promise<RoomContributionResult> {
      const adapter = byProvider.get(request.participant.provider);
      if (adapter === undefined) {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
      options.charters.observe(request.room.roomId, request.transcript);
      const charter = options.charters.charterFor(request.room, request.participant);
      const maxMessages = 30;
      try {
        const result = await adapter.contribute({
          persona: request.participant.persona,
          roomCharter: charter.roomCharter,
          rollingSummary: charter.rollingSummary,
          personaCharter: charter.personaCharter,
          transcript: excerptTranscript(request.transcript, maxMessages),
          networkEnabled: charter.networkEnabled,
          maxOutputTokens: request.maxTokens,
          signal: request.signal,
          reportWorkerPid: request.reportWorkerPid,
        });
        switch (result.kind) {
          case "message":
            return {
              kind: "message",
              body: result.text,
              tokensUsed: result.usage.tokensUsed,
              usage: result.usage.reported,
              costUsdMicros: result.usage.costUsdMicros,
            };
          case "pass":
            return {
              kind: "pass",
              tokensUsed: result.usage.tokensUsed,
              usage: result.usage.reported,
              costUsdMicros: result.usage.costUsdMicros,
            };
          case "error":
            return { kind: "error", code: result.code, retryAfterMs: result.retryAfterMs };
        }
      } catch {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
    },
  };
}
