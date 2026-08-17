import Foundation

// MARK: - Studio rooms (room.ts, `room.*` — @app-factory/studio-rooms)
//
// Mirrors `packages/contracts/src/v1/room.ts`: a moderated, single-writer transcript shared by one
// human and a small cast of agent personas. The moderator itself is deterministic daemon code; these
// are the durable shapes that cross the five `room.*` commands (`create`/`list`/`post`/`events`/
// `typing`) — unconditionally registered on any daemon build with this contract (unlike the
// still-unmerged `studio.snapshot`/`studio.assistant.*`, there is no unsupported-operation fallback
// path for these). `RoomModeratorStatus.enabled` (from `room.events`) says whether an agent will ever
// be granted the floor in this room; when it is `false` the transcript still works as a plain durable
// chat.
//
// NOT the same concept as `StudioRoom` (StudioSnapshot.swift) — that is `studio.snapshot`'s own
// unrelated, always-empty placeholder (`roomId`/`name`/`kind` only). Two "room" shapes exist in the
// wire today for the same reason two "milestone" shapes do (see Milestone.swift's doc comment):
// independently-evolving worktrees that have not yet been reconciled.

// MARK: Wire limits (room.ts) — mirrored so callers don't have to guess a page size.

public let maxRoomParticipants = 16
public let maxRoomListItems = 200
public let maxRoomEventsLimit = 1_000
public let maxRoomTypingTtlMs = 30_000
/// Hard livelock cap: consecutive agent messages allowed before a human must speak.
public let roomMaxConsecutiveAgentMessages = 3

/// `RoomAgentErrorCodeV1` — a failure is never a silent transcript hold: it is posted as a legible
/// system line, benches the persona (or the whole provider for `.limit`), and releases the room lock.
public enum RoomAgentErrorCode: String, Hashable, Sendable, Codable, CaseIterable {
    case limit, timeout, capacity
    case `internal`

    /// Human-readable label for the typed-error chip, e.g. "Claude · benched until 14:05 (rate limit)".
    public var label: String {
        switch self {
        case .limit: return "rate limit"
        case .timeout: return "timeout"
        case .capacity: return "capacity"
        case .internal: return "internal error"
        }
    }
}

public enum RoomAttendance: String, Hashable, Sendable, Codable, CaseIterable {
    case attended, dormant
}

public enum RoomTriggerKind: String, Hashable, Sendable, Codable, CaseIterable {
    case humanMessage = "human-message"
    case agentMessage = "agent-message"
    case factoryEvent = "factory-event"
    case wake
}

/// `RoomTriggerV1` — a durable request for the moderator to run a poll round.
public struct RoomTrigger: Hashable, Sendable, Codable {
    public var kind: RoomTriggerKind
    public var requestedAt: IsoInstant
    public var sourceSequence: Int

    public init(kind: RoomTriggerKind, requestedAt: IsoInstant, sourceSequence: Int) {
        self.kind = kind
        self.requestedAt = requestedAt
        self.sourceSequence = sourceSequence
    }
}

/// `RoomParticipantV1` — one seat in the room's roster, with live bench state.
public struct RoomParticipant: Hashable, Sendable, Codable, Identifiable {
    public var persona: RoomPersona
    public var provider: RoomProvider
    public var displayName: String
    public var position: Int
    public var benchedUntil: IsoInstant?
    public var benchReason: RoomAgentErrorCode?

    public var id: RoomPersona { persona }

    public init(persona: RoomPersona, provider: RoomProvider, displayName: String, position: Int,
                benchedUntil: IsoInstant?, benchReason: RoomAgentErrorCode?) {
        self.persona = persona
        self.provider = provider
        self.displayName = displayName
        self.position = position
        self.benchedUntil = benchedUntil
        self.benchReason = benchReason
    }

    /// True when `benchedUntil` is a real timestamp in the future of `now`. A malformed/unparseable
    /// instant is treated as benched (fails closed, never silently "idle").
    public func isBenched(at now: Date) -> Bool {
        guard let benchedUntil else { return false }
        guard let until = benchedUntil.date else { return true }
        return until > now
    }
}

/// `RoomParticipantSpecV1` — the roster the human names on `room.create`.
public struct RoomParticipantSpec: Hashable, Sendable, Codable {
    public var persona: RoomPersona
    public var provider: RoomProvider
    public var displayName: String

    public init(persona: RoomPersona, provider: RoomProvider, displayName: String) {
        self.persona = persona
        self.provider = provider
        self.displayName = displayName
    }
}

/// `RoomBudgetPolicyV1` — the ceilings the human sets on `room.create`.
public struct RoomBudgetPolicy: Hashable, Sendable, Codable {
    public var dailyCeilingTokens: Int
    public var unattendedDailyCeilingTokens: Int
    public var maxTokensPerReply: Int

    public init(dailyCeilingTokens: Int, unattendedDailyCeilingTokens: Int, maxTokensPerReply: Int) {
        self.dailyCeilingTokens = dailyCeilingTokens
        self.unattendedDailyCeilingTokens = unattendedDailyCeilingTokens
        self.maxTokensPerReply = maxTokensPerReply
    }
}

/// `RoomBudgetV1` — budgets are reservations, not counters (see the TS doc comment on
/// `RoomBudgetV1Schema`): the gate is always `spent + reserved + maxTokensPerReply <= ceiling`.
public struct RoomBudget: Hashable, Sendable, Codable {
    public var dayKey: RoomDayKey
    public var dailyCeilingTokens: Int
    public var unattendedDailyCeilingTokens: Int
    public var maxTokensPerReply: Int
    public var spentTokens: Int
    public var reservedTokens: Int
    public var unattendedSpentTokens: Int

    public init(dayKey: RoomDayKey, dailyCeilingTokens: Int, unattendedDailyCeilingTokens: Int, maxTokensPerReply: Int,
                spentTokens: Int, reservedTokens: Int, unattendedSpentTokens: Int) {
        self.dayKey = dayKey
        self.dailyCeilingTokens = dailyCeilingTokens
        self.unattendedDailyCeilingTokens = unattendedDailyCeilingTokens
        self.maxTokensPerReply = maxTokensPerReply
        self.spentTokens = spentTokens
        self.reservedTokens = reservedTokens
        self.unattendedSpentTokens = unattendedSpentTokens
    }

    /// `(spent + reserved) / ceiling`, clamped to `[0, 1]` — the meter's live fraction. `nil` only if
    /// the ceiling is somehow non-positive (schema forbids it, but a meter must never divide by zero).
    public var fraction: Double? {
        guard dailyCeilingTokens > 0 else { return nil }
        let used = Double(spentTokens + reservedTokens)
        return min(max(used / Double(dailyCeilingTokens), 0), 1)
    }
}

/// `RoomV1` — the room record itself, including the moderator's live state (the head sequence, the
/// active grant lock, the pending trigger). `activeGrantId != nil` is the only honest "a round is in
/// progress" signal: the room does not say which participant currently holds it (that lives on
/// `RoomGrantV1`, which no `room.*` command returns), so Studio renders that at room level only —
/// never attributed to a specific persona.
public struct Room: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var roomId: RoomID
    public var title: String
    public var projectId: ProjectID?
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant
    public var unattendedEnabled: Bool
    public var headSequence: Int
    public var headMessageId: RoomMessageID?
    public var lastHumanAt: IsoInstant?
    public var humanTypingUntil: IsoInstant?
    public var roundCounter: Int
    public var activeGrantId: RoomGrantID?
    public var pendingTrigger: RoomTrigger?
    public var agentCooldownEvents: Int
    public var participants: [RoomParticipant]
    public var budget: RoomBudget

    public var id: RoomID { roomId }

    public init(roomId: RoomID, title: String, projectId: ProjectID?, createdAt: IsoInstant, updatedAt: IsoInstant,
                unattendedEnabled: Bool, headSequence: Int, headMessageId: RoomMessageID?, lastHumanAt: IsoInstant?,
                humanTypingUntil: IsoInstant?, roundCounter: Int, activeGrantId: RoomGrantID?,
                pendingTrigger: RoomTrigger?, agentCooldownEvents: Int, participants: [RoomParticipant],
                budget: RoomBudget) {
        self.roomId = roomId
        self.title = title
        self.projectId = projectId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.unattendedEnabled = unattendedEnabled
        self.headSequence = headSequence
        self.headMessageId = headMessageId
        self.lastHumanAt = lastHumanAt
        self.humanTypingUntil = humanTypingUntil
        self.roundCounter = roundCounter
        self.activeGrantId = activeGrantId
        self.pendingTrigger = pendingTrigger
        self.agentCooldownEvents = agentCooldownEvents
        self.participants = participants
        self.budget = budget
    }

    /// A round is in flight right now (room-level only — see the type doc comment).
    public var roundInProgress: Bool { activeGrantId != nil }
}

/// `RoomChatAuthorV1Schema` — a `kind`-discriminated union.
public enum RoomChatAuthor: Hashable, Sendable, Codable {
    case human(handle: RoomHumanHandle)
    case agent(persona: RoomPersona)

    private enum CodingKeys: String, CodingKey { case kind, handle, persona }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "human": self = .human(handle: try c.decode(RoomHumanHandle.self, forKey: .handle))
        case "agent": self = .agent(persona: try c.decode(RoomPersona.self, forKey: .persona))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown room author kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .human(let handle):
            try c.encode("human", forKey: .kind)
            try c.encode(handle, forKey: .handle)
        case .agent(let persona):
            try c.encode("agent", forKey: .kind)
            try c.encode(persona, forKey: .persona)
        }
    }

    public var isHuman: Bool {
        if case .human = self { return true }
        return false
    }
}

/// `RoomSystemCodeV1` — every reason the room stayed silent, refused a grant, or failed an agent is
/// one of these, never an invented client-side guess.
public enum RoomSystemCode: String, Hashable, Sendable, Codable, CaseIterable {
    case allPassed = "all-passed"
    case agentPassed = "agent-passed"
    case agentError = "agent-error"
    case factoryEvent = "factory-event"
    case roomDormant = "room-dormant"
    case throttled
    case budgetExhausted = "budget-exhausted"
    case chainCap = "chain-cap"
    case grantOrphaned = "grant-orphaned"
    case contributionDropped = "contribution-dropped"
    case contributionRevised = "contribution-revised"
    case scorerUnavailable = "scorer-unavailable"
}

/// `RoomChatMessageV1Schema` (`kind: "message"`) — a human or agent line in the transcript.
public struct RoomChatMessage: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var roomId: RoomID
    public var messageId: RoomMessageID
    public var sequence: Int
    public var occurredAt: IsoInstant
    public var roundNumber: Int?
    public var grantId: RoomGrantID?
    public var author: RoomChatAuthor
    public var body: String
    /// Personas addressed with `@persona` — a mention is a forced invite.
    public var mentions: [RoomPersona]

    public var id: RoomMessageID { messageId }

    public init(roomId: RoomID, messageId: RoomMessageID, sequence: Int, occurredAt: IsoInstant, roundNumber: Int?,
                grantId: RoomGrantID?, author: RoomChatAuthor, body: String, mentions: [RoomPersona]) {
        self.roomId = roomId
        self.messageId = messageId
        self.sequence = sequence
        self.occurredAt = occurredAt
        self.roundNumber = roundNumber
        self.grantId = grantId
        self.author = author
        self.body = body
        self.mentions = mentions
    }
}

/// `RoomSystemMessageV1Schema` (`kind: "system"`) — a legible moderator outcome, never a silent hold.
public struct RoomSystemMessage: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var roomId: RoomID
    public var messageId: RoomMessageID
    public var sequence: Int
    public var occurredAt: IsoInstant
    public var roundNumber: Int?
    public var grantId: RoomGrantID?
    public var code: RoomSystemCode
    public var body: String
    public var persona: RoomPersona?
    public var errorCode: RoomAgentErrorCode?
    public var benchedUntil: IsoInstant?
    public var retryAt: IsoInstant?

    public var id: RoomMessageID { messageId }

    public init(roomId: RoomID, messageId: RoomMessageID, sequence: Int, occurredAt: IsoInstant, roundNumber: Int?,
                grantId: RoomGrantID?, code: RoomSystemCode, body: String, persona: RoomPersona?,
                errorCode: RoomAgentErrorCode?, benchedUntil: IsoInstant?, retryAt: IsoInstant?) {
        self.roomId = roomId
        self.messageId = messageId
        self.sequence = sequence
        self.occurredAt = occurredAt
        self.roundNumber = roundNumber
        self.grantId = grantId
        self.code = code
        self.body = body
        self.persona = persona
        self.errorCode = errorCode
        self.benchedUntil = benchedUntil
        self.retryAt = retryAt
    }
}

/// `RoomMessageV1Schema` — a `kind`-discriminated union over the two message shapes above.
public enum RoomMessage: Hashable, Sendable, Codable, Identifiable {
    case message(RoomChatMessage)
    case system(RoomSystemMessage)

    private enum CodingKeys: String, CodingKey { case kind }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "message": self = .message(try RoomChatMessage(from: decoder))
        case "system": self = .system(try RoomSystemMessage(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown room message kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .message(let message):
            try c.encode("message", forKey: .kind)
            try message.encode(to: encoder)
        case .system(let system):
            try c.encode("system", forKey: .kind)
            try system.encode(to: encoder)
        }
    }

    public var id: RoomMessageID {
        switch self {
        case .message(let m): return m.messageId
        case .system(let s): return s.messageId
        }
    }

    public var sequence: Int {
        switch self {
        case .message(let m): return m.sequence
        case .system(let s): return s.sequence
        }
    }

    public var occurredAt: IsoInstant {
        switch self {
        case .message(let m): return m.occurredAt
        case .system(let s): return s.occurredAt
        }
    }
}

/// `RoomModeratorStatusV1` — from `room.events`, alongside the room record itself.
public struct RoomModeratorStatus: Hashable, Sendable, Codable {
    public var enabled: Bool
    public var attendance: RoomAttendance

    public init(enabled: Bool, attendance: RoomAttendance) {
        self.enabled = enabled
        self.attendance = attendance
    }
}

/// `RoomCreateSpecV1` — the `room.create` payload. `roomId` is minted client-side (`RoomID.generate()`)
/// exactly like `MilestoneID` is for a new milestone.
public struct RoomCreateSpec: Hashable, Sendable, Codable {
    public var roomId: RoomID
    public var title: String
    public var projectId: ProjectID?
    public var unattendedEnabled: Bool
    public var agentCooldownEvents: Int
    public var participants: [RoomParticipantSpec]
    public var budget: RoomBudgetPolicy

    public init(roomId: RoomID, title: String, projectId: ProjectID?, unattendedEnabled: Bool, agentCooldownEvents: Int,
                participants: [RoomParticipantSpec], budget: RoomBudgetPolicy) {
        self.roomId = roomId
        self.title = title
        self.projectId = projectId
        self.unattendedEnabled = unattendedEnabled
        self.agentCooldownEvents = agentCooldownEvents
        self.participants = participants
        self.budget = budget
    }

    private enum CodingKeys: String, CodingKey {
        case roomId, title, projectId, unattendedEnabled, agentCooldownEvents, participants, budget
    }

    /// `projectId` is `nullable`, not optional, on the wire — zod `strictObject` requires the key
    /// present as `null` (see ADR 0001, decision 4).
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(roomId, forKey: .roomId)
        try c.encode(title, forKey: .title)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(unattendedEnabled, forKey: .unattendedEnabled)
        try c.encode(agentCooldownEvents, forKey: .agentCooldownEvents)
        try c.encode(participants, forKey: .participants)
        try c.encode(budget, forKey: .budget)
    }
}

// MARK: Command results

public struct RoomCreateResult: Hashable, Sendable, Codable {
    public var room: Room
    /// True when the same `roomId` was already created with an identical spec.
    public var duplicate: Bool
}

public struct RoomListResult: Hashable, Sendable, Codable {
    public var rooms: [Room]
}

public struct RoomPostResult: Hashable, Sendable, Codable {
    public var message: RoomChatMessage
    public var room: Room
}

public struct RoomEventsResult: Hashable, Sendable, Codable {
    public var room: Room
    public var moderator: RoomModeratorStatus
    public var messages: [RoomMessage]
    public var nextAfterSequence: Int
}

public struct RoomTypingResult: Hashable, Sendable, Codable {
    public var roomId: RoomID
    public var typingUntil: IsoInstant
}

// MARK: - room.participants.list (RoomParticipantsCatalogV1)
//
// The wire-safe catalog of the daemon's configured room participants: which providers exist and
// which model each speaks, plus the operator's roster (`@app-factory/studio-room-adapters`
// `RoomRosterConfigV1`, mirrored field for field). `room-participants-config.ts` itself — executables,
// paths, digests, the Codex home, runner/scratch roots, the Ollama base URL — never crosses the wire;
// this is exactly what `NewRoomSheet` needs to source its participant defaults from instead of a
// local suggestion. Answers honestly when the rooms subsystem is disabled: `enabled: false` plus an
// `unavailableReason`, never an error. `sourceDigest` is re-verified client-side by `DaemonClient`
// (see `RoomParticipantsCatalogDigest`), mirroring `studio.snapshot`'s `sourceSnapshotDigest`.

/// `RoomCatalogProviderV1` — the three providers `RoomParticipantsConfigV1` can configure an adapter for.
public enum RoomCatalogProvider: String, Hashable, Sendable, Codable, CaseIterable {
    case codex, claude, ollama

    /// The display name a fresh roster row defaults to for this provider.
    public var displayName: String {
        switch self {
        case .codex: return "Codex"
        case .claude: return "Claude"
        case .ollama: return "Ollama"
        }
    }
}

/// `RoomCatalogProviderEntryV1` — one configured provider: its key, effective model, and (Codex only)
/// the operator-pinned CLI version.
public struct RoomCatalogProviderEntry: Hashable, Sendable, Codable, Identifiable {
    public var provider: RoomCatalogProvider
    public var model: String
    public var cliVersion: String?

    public var id: RoomCatalogProvider { provider }

    public init(provider: RoomCatalogProvider, model: String, cliVersion: String?) {
        self.provider = provider
        self.model = model
        self.cliVersion = cliVersion
    }
}

/// `RoomRosterKindV1` — "research" rooms may enable web access for their Codex participants;
/// "project" rooms never do.
public enum RoomRosterKind: String, Hashable, Sendable, Codable, CaseIterable {
    case research, project
}

/// `RoomRosterParticipantV1` — a persona the operator configured for one roster room, with its
/// one-line charter.
public struct RoomRosterParticipant: Hashable, Sendable, Codable, Identifiable {
    public var persona: String
    public var oneLineCharter: String

    public var id: String { persona }

    public init(persona: String, oneLineCharter: String) {
        self.persona = persona
        self.oneLineCharter = oneLineCharter
    }
}

/// `RoomRosterEntryCatalogV1` — one roster entry, keyed by the room ID string the operator wrote
/// (not required to name an existing room).
public struct RoomRosterEntry: Hashable, Sendable, Codable, Identifiable {
    public var roomId: String
    public var kind: RoomRosterKind
    public var charter: String?
    public var participants: [RoomRosterParticipant]

    public var id: String { roomId }

    public init(roomId: String, kind: RoomRosterKind, charter: String?, participants: [RoomRosterParticipant]) {
        self.roomId = roomId
        self.kind = kind
        self.charter = charter
        self.participants = participants
    }
}

/// `RoomParticipantsCatalogV1`.
public struct RoomParticipantsCatalog: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var enabled: Bool
    /// Present exactly when `enabled` is false: why the daemon has no participants to list.
    public var unavailableReason: String?
    public var providers: [RoomCatalogProviderEntry]
    public var roster: [RoomRosterEntry]
    public var sourcedAt: IsoInstant
    /// SHA-256 of the canonical JSON of every field above except `sourcedAt` and this digest.
    public var sourceDigest: Sha256Digest

    public init(enabled: Bool, unavailableReason: String?, providers: [RoomCatalogProviderEntry],
                roster: [RoomRosterEntry], sourcedAt: IsoInstant, sourceDigest: Sha256Digest) {
        self.enabled = enabled
        self.unavailableReason = unavailableReason
        self.providers = providers
        self.roster = roster
        self.sourcedAt = sourcedAt
        self.sourceDigest = sourceDigest
    }

    /// The honest default roster for a brand-new room: one seat per provider the daemon actually
    /// has an adapter for (persona = provider key, display name = the provider's name). Personas
    /// and display names are the human's to edit; the *providers* are what the wire vouches for.
    /// Empty when the subsystem is disabled or nothing is configured — never a local guess.
    public var defaultParticipantSpecs: [RoomParticipantSpec] {
        guard enabled else { return [] }
        return providers.compactMap { entry in
            guard let persona = try? RoomPersona(entry.provider.rawValue),
                  let provider = try? RoomProvider(entry.provider.rawValue) else { return nil }
            return RoomParticipantSpec(persona: persona, provider: provider, displayName: entry.provider.displayName)
        }
    }
}

public struct RoomParticipantsListResult: Hashable, Sendable, Codable {
    public var catalog: RoomParticipantsCatalog
}
