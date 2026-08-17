import {
  PersonaIdSchema,
  type RoomMessageV1 as OllamaRoomMessageV1,
  type ScorerPersonaV1,
  type ScorerPort as OllamaScorerPort,
} from "@app-factory/ollama-scorer";
import type { RoomScorerRequest, RoomUrgency, ScorerPort } from "@app-factory/studio-rooms";

import type { RoomCharterProvider } from "./roster.js";

const LAST_MESSAGES_MAX = 30;
const MESSAGE_TEXT_MAX_CHARS = 8_000;

function messageAuthorId(message: RoomScorerRequest["transcript"][number]): string {
  if (message.kind === "system") return "system";
  return message.author.kind === "human" ? message.author.handle : message.author.persona;
}

function toOllamaMessages(
  transcript: RoomScorerRequest["transcript"],
): readonly OllamaRoomMessageV1[] {
  return transcript.slice(-LAST_MESSAGES_MAX).map((message) => ({
    seq: message.sequence,
    authorId: messageAuthorId(message),
    text: message.body.slice(0, MESSAGE_TEXT_MAX_CHARS),
  }));
}

export type OllamaRoomScorerOptions = Readonly<{
  scorer: OllamaScorerPort;
  charters: RoomCharterProvider;
}>;

/**
 * Bridges the Tier-1 `ScorerPort` `studio-rooms`' moderator calls into
 * `@app-factory/ollama-scorer`'s local-model scorer, sharing the exact same
 * `RoomCharterProvider` (and therefore rolling summary) that `contributor.ts`
 * feeds every Tier-2 contribution. When the underlying model call does not
 * resolve to `"scored"` (timeout, transport error, malformed JSON, ...) the
 * returned record is empty; `RoomModerator` already treats a record that
 * does not cover every candidate persona as a scorer failure and posts its
 * own `scorer-unavailable` system line -- this bridge does not need to
 * duplicate that fail-closed behavior itself.
 */
export function createOllamaRoomScorer(options: OllamaRoomScorerOptions): ScorerPort {
  return {
    async score(request: RoomScorerRequest): Promise<Readonly<Record<string, RoomUrgency>>> {
      options.charters.observe(request.room.roomId, request.transcript);
      const firstParticipant = request.room.participants[0];
      if (firstParticipant === undefined) return {};
      const snapshot = options.charters.charterFor(request.room, firstParticipant);

      const personas: ScorerPersonaV1[] = request.candidates.map((candidate) => {
        const participant = request.room.participants.find(
          (entry) => entry.persona === candidate.persona,
        );
        const oneLineCharter =
          participant === undefined
            ? candidate.persona
            : options.charters.charterFor(request.room, participant).personaCharter;
        return { id: PersonaIdSchema.parse(candidate.persona), oneLineCharter };
      });

      const result = await options.scorer.score({
        schemaVersion: 1,
        roundId: `${request.room.roomId}:${String(request.roundNumber)}`,
        roomCharter: snapshot.roomCharter,
        rollingSummary: snapshot.rollingSummary,
        lastMessages: [...toOllamaMessages(request.transcript)],
        personas,
      });

      const record: Record<string, RoomUrgency> = {};
      for (const bid of result.bids) {
        record[bid.personaId] = bid.urgency;
      }
      return record;
    },
  };
}
