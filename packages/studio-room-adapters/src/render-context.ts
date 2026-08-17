import type { ParticipantContext } from "./participant-adapter.js";

/**
 * Renders a `ParticipantContext` into the plain-text instruction every
 * provider adapter sends as its prompt/stdin. One rendering shared by all
 * three adapters keeps their behavior comparable in the live smoke test:
 * the same charter, summary, and transcript window reach every provider in
 * the same shape, only the transport differs.
 */
export function renderParticipantInstruction(context: ParticipantContext): string {
  const transcript =
    context.transcript.length === 0
      ? "(no messages yet)"
      : context.transcript.map((message) => `${message.author}: ${message.body}`).join("\n");
  return [
    "This is App Factory's Studio Rooms feature: a group chat where a human",
    "and a small set of AI participants (each a separate model/CLI session,",
    "like a groupchat bot) discuss a topic the human set up on purpose. You",
    `are one participant, named "${context.persona}", in this specific human-configured room.`,
    `Your role in this room: ${context.personaCharter}`,
    "",
    "Room charter (what this room is for):",
    context.roomCharter,
    "",
    "Summary of the conversation so far (may be empty early in the room's life):",
    context.rollingSummary.length > 0 ? context.rollingSummary : "(none yet)",
    "",
    "Most recent messages in the room, oldest first:",
    transcript,
    "",
    "This session is stateless and scoped to this one turn only: no file,",
    "tool, or repository access, and no memory of any earlier turn -- decide",
    "purely from the context above, the same way you would read a chat",
    "thread before replying to it.",
    context.networkEnabled
      ? "Web access is available for this research room."
      : "No network or web access is available for this room.",
    "",
    "Your job this turn is simply to decide whether to speak in the room and,",
    "if so, what to say -- an ordinary chat contribution, not a task to",
    "execute. The room's software (not the human) reads your answer as",
    "data and posts it to the transcript verbatim if you choose to speak, so",
    "reply with exactly one JSON object matching the enforced output schema:",
    '  - "kind": "message" to speak, or "pass" to stay silent this round.',
    '  - "text": the chat message you want to post, when kind is "message"',
    '    (required, non-empty); must be null when kind is "pass".',
    "Output only that JSON object: no prose, no markdown fences, no",
    "commentary outside it -- the same way a chat client's send box holds",
    "only the message you're about to send, nothing about the send box itself.",
    `Keep "text" under roughly ${String(context.maxOutputTokens)} tokens.`,
  ].join("\n");
}
