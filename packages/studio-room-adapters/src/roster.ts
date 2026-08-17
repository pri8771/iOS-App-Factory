import type {
  IsoInstant,
  RoomId,
  RoomMessageV1,
  RoomParticipantV1,
  RoomV1,
} from "@app-factory/contracts";
import {
  createRollingSummarizer,
  ROOM_CHARTER_MAX_CHARS,
  type OllamaTransportPort,
  type RollingSummarizer,
  type RollingSummarizerConfigInputV1,
} from "@app-factory/ollama-scorer";
import { z } from "zod";

/**
 * "Research" rooms may enable web access for their Codex participants;
 * "project" rooms never do. This is a daemon-owned classification, not part
 * of the `RoomV1` contract: rooms created before a roster is configured (or
 * whose roomId is simply absent from it) default to `"project"`, the safe
 * (no network) choice.
 */
export const RoomKindSchema = z.enum(["research", "project"]);
export type RoomKind = z.infer<typeof RoomKindSchema>;

export const RoomRosterParticipantConfigV1Schema = z.strictObject({
  persona: z.string().min(1).max(64),
  /** One-line description of this persona's role, fed to every provider as its "personaCharter". */
  oneLineCharter: z.string().trim().min(1).max(200),
});
export type RoomRosterParticipantConfigV1 = z.infer<typeof RoomRosterParticipantConfigV1Schema>;

export const RoomRosterEntryV1Schema = z.strictObject({
  roomId: z.string().min(1),
  kind: RoomKindSchema,
  /** Overrides the auto-derived charter (from the room's own title) when present. */
  charter: z.string().trim().min(1).max(ROOM_CHARTER_MAX_CHARS).optional(),
  participants: z.array(RoomRosterParticipantConfigV1Schema).max(64).default([]),
});
export type RoomRosterEntryV1 = z.infer<typeof RoomRosterEntryV1Schema>;

/** Which providers/personas are expected per room, plus room-kind network policy. Daemon-owned config. */
export const RoomRosterConfigV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  rooms: z.array(RoomRosterEntryV1Schema).max(1_000),
});
export type RoomRosterConfigV1 = z.infer<typeof RoomRosterConfigV1Schema>;

export function parseRoomRosterConfigV1(input: unknown): RoomRosterConfigV1 {
  return RoomRosterConfigV1Schema.parse(input);
}

export type RoomCharterSnapshot = Readonly<{
  roomCharter: string;
  rollingSummary: string;
  personaCharter: string;
  networkEnabled: boolean;
}>;

/**
 * Supplies the room charter, per-persona charter, rolling summary, and
 * network policy that `contributor.ts` (Tier 2) and `scorer-bridge.ts`
 * (Tier 1) both render into their respective provider requests. Sharing one
 * provider keeps the scorer's admission judgment and each contributor's
 * generation looking at the exact same summarized history.
 */
export type RoomCharterProvider = Readonly<{
  /** Feeds any not-yet-observed messages (by sequence) into the room's rolling summarizer. */
  observe(roomId: RoomId, transcript: readonly RoomMessageV1[]): void;
  charterFor(room: RoomV1, participant: RoomParticipantV1): RoomCharterSnapshot;
}>;

function defaultCharter(room: RoomV1): string {
  const roster = room.participants.map((participant) => participant.displayName).join(", ");
  return `Room "${room.title}". Participants: ${roster}. Be concise and stay on topic.`;
}

function defaultPersonaCharter(participant: RoomParticipantV1): string {
  return `${participant.displayName}, contributing via the ${participant.provider} provider.`;
}

function messageAuthorId(message: RoomMessageV1): string {
  if (message.kind === "system") return "system";
  return message.author.kind === "human" ? message.author.handle : message.author.persona;
}

const SUMMARIZER_MESSAGE_TEXT_MAX_CHARS = 8_000;

export type RosterCharterProviderOptions = Readonly<{
  roster?: RoomRosterConfigV1;
  transport: OllamaTransportPort;
  summarizerConfig?: RollingSummarizerConfigInputV1;
  now?: () => IsoInstant;
}>;

/**
 * Real `RoomCharterProvider`: an explicit roster entry supplies `kind` and,
 * optionally, an override charter/persona charters; every room -- roster
 * entry or not -- gets a working default derived straight from `RoomV1`
 * (title, participants) so contribution never hard-fails just because an
 * operator has not hand-authored a roster entry yet. Each room's rolling
 * summary is regenerated locally via the same Ollama model the scorer uses
 * (`@app-factory/ollama-scorer`'s `createRollingSummarizer`), one instance
 * per room, created lazily on first observation.
 */
export function createRosterCharterProvider(
  options: RosterCharterProviderOptions,
): RoomCharterProvider {
  const byRoomId = new Map<string, RoomRosterEntryV1>();
  for (const entry of options.roster?.rooms ?? []) {
    if (byRoomId.has(entry.roomId)) {
      throw new TypeError(`Duplicate room roster entry for roomId: ${entry.roomId}`);
    }
    byRoomId.set(entry.roomId, entry);
  }
  const personaCharterByRoomAndPersona = new Map<string, string>();
  for (const entry of byRoomId.values()) {
    for (const participant of entry.participants) {
      personaCharterByRoomAndPersona.set(
        `${entry.roomId}\0${participant.persona}`,
        participant.oneLineCharter,
      );
    }
  }

  const summarizers = new Map<string, RollingSummarizer>();
  const lastObservedSequence = new Map<string, number>();

  const summarizerFor = (roomId: RoomId, charterText: string): RollingSummarizer => {
    const existing = summarizers.get(roomId);
    if (existing !== undefined) return existing;
    const created = createRollingSummarizer({
      transport: options.transport,
      roomCharter: charterText,
      ...(options.summarizerConfig === undefined ? {} : { config: options.summarizerConfig }),
    });
    summarizers.set(roomId, created);
    return created;
  };

  return {
    observe(roomId: RoomId, transcript: readonly RoomMessageV1[]): void {
      const entry = byRoomId.get(roomId);
      const charterText = entry?.charter ?? `Room ${roomId}.`;
      const summarizer = summarizerFor(roomId, charterText);
      const lastSeq = lastObservedSequence.get(roomId) ?? 0;
      let highest = lastSeq;
      for (const message of transcript) {
        if (message.sequence <= lastSeq) continue;
        const text =
          message.kind === "message" || message.kind === "system"
            ? message.body.slice(0, SUMMARIZER_MESSAGE_TEXT_MAX_CHARS)
            : "";
        summarizer.observe({ seq: message.sequence, authorId: messageAuthorId(message), text });
        highest = Math.max(highest, message.sequence);
      }
      if (highest > lastSeq) lastObservedSequence.set(roomId, highest);
    },
    charterFor(room: RoomV1, participant: RoomParticipantV1): RoomCharterSnapshot {
      const entry = byRoomId.get(room.roomId);
      const roomCharter = entry?.charter ?? defaultCharter(room);
      const summarizer = summarizers.get(room.roomId);
      const personaCharter =
        personaCharterByRoomAndPersona.get(`${room.roomId}\0${participant.persona}`) ??
        defaultPersonaCharter(participant);
      return {
        roomCharter,
        rollingSummary: summarizer?.current().text ?? "",
        personaCharter,
        networkEnabled: entry?.kind === "research",
      };
    },
  };
}
