// Regenerates Tests/StudioKitTests/Fixtures/room-*.response.json (the five room.* transcript ops
// plus room.participants.list, enabled and disabled) through the real
// `@app-factory/contracts` build — same "record through the real contracts" discipline as
// record-fixtures.mjs (see apps/studio-mac/docs/architecture/0001, decision 5), kept as its own
// script rather than appended to record-fixtures.mjs because that script's pre-existing
// attempt-list.response.json generator does not build against this worktree's current contracts
// (AttemptListItemV1Schema gained a required `phase` field on a branch this one hasn't reconciled
// with — unrelated to rooms, and out of scope here). Re-record with:
//   pnpm --filter @app-factory/contracts build && node apps/studio-mac/scripts/record-room-fixtures.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  CommandResponseV1Schema,
  canonicalRoomParticipantsCatalogDigestInputV1,
} from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) =>
  CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });

// One room ("Studio launch review") carries every message/event shape Studio's rooms UI renders: a
// human message, two different agent personas replying, a plain system line (factory-event), a PASS
// (agent-passed), a typed error with a bench (agent-error), and the chain-cap livelock line. A second
// room in room-list.response.json exercises "round in progress" (a non-null activeGrantId) and an
// unattended moderator, neither of which room-events.response.json's room needs.

const roomId = "50000001-0000-4000-8000-000000000001";
const roomParticipants = [
  {
    persona: "codex",
    provider: "codex",
    displayName: "Codex",
    position: 0,
    benchedUntil: null,
    benchReason: null,
  },
  {
    persona: "claude",
    provider: "claude",
    displayName: "Claude",
    position: 1,
    benchedUntil: null,
    benchReason: null,
  },
  {
    persona: "ollama",
    provider: "ollama",
    displayName: "Ollama",
    position: 2,
    benchedUntil: "2026-08-16T19:05:00.000Z",
    benchReason: "limit",
  },
];
const roomBudget = {
  dayKey: "2026-08-16",
  dailyCeilingTokens: 200_000,
  unattendedDailyCeilingTokens: 0,
  maxTokensPerReply: 4_000,
  spentTokens: 3_200,
  reservedTokens: 800,
  unattendedSpentTokens: 0,
};
const freshRoom = {
  schemaVersion: 1,
  roomId,
  title: "Studio launch review",
  projectId: null,
  createdAt: "2026-08-16T18:00:00.000Z",
  updatedAt: "2026-08-16T18:00:00.000Z",
  unattendedEnabled: false,
  headSequence: 0,
  headMessageId: null,
  lastHumanAt: null,
  humanTypingUntil: null,
  roundCounter: 0,
  activeGrantId: null,
  pendingTrigger: null,
  agentCooldownEvents: 4,
  participants: roomParticipants.map((p) => ({ ...p, benchedUntil: null, benchReason: null })),
  budget: { ...roomBudget, spentTokens: 0, reservedTokens: 0 },
};

const fixtures = {
  "room-create.response.json": ok({ operation: "room.create", room: freshRoom, duplicate: false }),
  "room-list.response.json": ok({
    operation: "room.list",
    rooms: [
      {
        ...freshRoom,
        updatedAt: "2026-08-16T18:31:00.000Z",
        headSequence: 7,
        roundCounter: 2,
        budget: roomBudget,
      },
      {
        schemaVersion: 1,
        roomId: "50000002-0000-4000-8000-000000000002",
        title: "Portfolio triage",
        projectId: null,
        createdAt: "2026-08-16T17:00:00.000Z",
        updatedAt: "2026-08-16T18:32:00.000Z",
        unattendedEnabled: true,
        headSequence: 12,
        headMessageId: "51000002-0000-4000-8000-000000000012",
        lastHumanAt: "2026-08-16T17:05:00.000Z",
        humanTypingUntil: null,
        roundCounter: 5,
        // A round in flight — the honest "room-level only" signal RoomTranscriptView reads.
        activeGrantId: "60000009-0000-4000-8000-000000000009",
        pendingTrigger: null,
        agentCooldownEvents: 4,
        participants: [{ ...roomParticipants[0], benchedUntil: null, benchReason: null }],
        budget: { ...roomBudget, dayKey: "2026-08-16", spentTokens: 41_000, reservedTokens: 4_000 },
      },
    ],
  }),
  "room-post.response.json": ok({
    operation: "room.post",
    message: {
      schemaVersion: 1,
      roomId,
      messageId: "51000001-0000-4000-8000-000000000001",
      sequence: 1,
      occurredAt: "2026-08-16T18:01:00.000Z",
      roundNumber: null,
      grantId: null,
      kind: "message",
      author: { kind: "human", handle: "priyansh" },
      body: "Let's plan the launch checklist.",
      mentions: [],
    },
    room: {
      ...freshRoom,
      headSequence: 1,
      headMessageId: "51000001-0000-4000-8000-000000000001",
      lastHumanAt: "2026-08-16T18:01:00.000Z",
    },
  }),
  "room-events.response.json": ok({
    operation: "room.events",
    room: {
      ...freshRoom,
      updatedAt: "2026-08-16T18:31:00.000Z",
      headSequence: 7,
      headMessageId: "51000001-0000-4000-8000-000000000007",
      lastHumanAt: "2026-08-16T18:01:00.000Z",
      roundCounter: 2,
      // The real (not freshly-reset) roster: Ollama is actually benched here, consistent with the
      // agent-error system line below.
      participants: roomParticipants,
      budget: roomBudget,
    },
    moderator: { enabled: true, attendance: "attended" },
    messages: [
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000001",
        sequence: 1,
        occurredAt: "2026-08-16T18:01:00.000Z",
        roundNumber: null,
        grantId: null,
        kind: "message",
        author: { kind: "human", handle: "priyansh" },
        body: "Let's plan the launch checklist.",
        mentions: [],
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000002",
        sequence: 2,
        occurredAt: "2026-08-16T18:02:00.000Z",
        roundNumber: null,
        grantId: null,
        kind: "system",
        code: "factory-event",
        body: "attempt 00000004 completed: TestFlight build 12 uploaded.",
        persona: null,
        errorCode: null,
        benchedUntil: null,
        retryAt: null,
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000003",
        sequence: 3,
        occurredAt: "2026-08-16T18:05:00.000Z",
        roundNumber: 1,
        grantId: "60000001-0000-4000-8000-000000000001",
        kind: "message",
        author: { kind: "agent", persona: "codex" },
        body: "I'll draft the checklist from the release doc.",
        mentions: [],
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000004",
        sequence: 4,
        occurredAt: "2026-08-16T18:06:00.000Z",
        roundNumber: 1,
        grantId: "60000002-0000-4000-8000-000000000002",
        kind: "system",
        code: "agent-passed",
        body: "Claude passed — no new value to add this round.",
        persona: "claude",
        errorCode: null,
        benchedUntil: null,
        retryAt: null,
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000005",
        sequence: 5,
        occurredAt: "2026-08-16T18:07:00.000Z",
        roundNumber: 1,
        grantId: "60000003-0000-4000-8000-000000000003",
        kind: "system",
        code: "agent-error",
        body: "Ollama is rate-limited; benched until 19:05.",
        persona: "ollama",
        errorCode: "limit",
        benchedUntil: "2026-08-16T19:05:00.000Z",
        retryAt: "2026-08-16T19:05:00.000Z",
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000006",
        sequence: 6,
        occurredAt: "2026-08-16T18:10:00.000Z",
        roundNumber: 2,
        grantId: "60000004-0000-4000-8000-000000000004",
        kind: "message",
        author: { kind: "agent", persona: "claude" },
        body: "Here's a draft checklist: 1) verify build 2) confirm store listing 3) notify support.",
        mentions: ["codex"],
      },
      {
        schemaVersion: 1,
        roomId,
        messageId: "51000001-0000-4000-8000-000000000007",
        sequence: 7,
        occurredAt: "2026-08-16T18:11:00.000Z",
        roundNumber: 2,
        grantId: null,
        kind: "system",
        code: "chain-cap",
        body: "Three consecutive agent replies without a human message; waiting for you to speak.",
        persona: null,
        errorCode: null,
        benchedUntil: null,
        retryAt: null,
      },
    ],
    nextAfterSequence: 7,
  }),
  "room-typing.response.json": ok({
    operation: "room.typing",
    roomId,
    typingUntil: "2026-08-16T18:12:03.000Z",
  }),
  // `room.participants.list` — the daemon's configured participants, wire-safe (providers by
  // key/model/pinned CLI version, plus the operator's roster; never executables/paths/base URLs).
  // `sourceDigest` is computed through the real contracts helper so the Swift client's own
  // re-verification (`RoomParticipantsCatalogDigest.verify`) is exercised against a genuine digest.
  "room-participants-list.response.json": ok({
    operation: "room.participants.list",
    catalog: participantsCatalog({
      enabled: true,
      unavailableReason: null,
      providers: [
        { provider: "codex", model: "gpt-5-codex", cliVersion: "0.42.0" },
        { provider: "claude", model: "claude-sonnet-4-5", cliVersion: null },
        { provider: "ollama", model: "qwen2.5-coder:14b", cliVersion: null },
      ],
      roster: [
        {
          roomId,
          kind: "research",
          charter: "Studio launch review: ship-readiness, not feature ideas.",
          participants: [
            { persona: "codex", oneLineCharter: "Drafts checklists from the release docs." },
            { persona: "claude", oneLineCharter: "Reviews the draft for gaps and ordering." },
          ],
        },
        {
          roomId: "50000002-0000-4000-8000-000000000002",
          kind: "project",
          charter: null,
          participants: [],
        },
      ],
    }),
  }),
  // The honest answer with the rooms subsystem disabled: no error, no providers, a precise reason.
  "room-participants-list-disabled.response.json": ok({
    operation: "room.participants.list",
    catalog: participantsCatalog({
      enabled: false,
      unavailableReason:
        "rooms subsystem disabled: no room moderator is composed (APP_FACTORY_ROOMS_ENABLED unset), so no participants or roster are configured",
      providers: [],
      roster: [],
    }),
  }),
};

function participantsCatalog(input) {
  const digestInput = { schemaVersion: 1, ...input };
  const canonical = canonicalRoomParticipantsCatalogDigestInputV1(digestInput);
  return {
    ...digestInput,
    sourcedAt: "2026-08-16T18:12:00.000Z",
    sourceDigest: `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
  };
}

const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
for (const [name, value] of Object.entries(fixtures)) {
  writeFileSync(dir + name, JSON.stringify(value, null, 2) + "\n");
}
console.log("wrote", Object.keys(fixtures).length, "room fixtures");
