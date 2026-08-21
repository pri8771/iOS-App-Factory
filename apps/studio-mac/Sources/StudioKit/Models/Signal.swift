import Foundation

// MARK: - Signals (signal.ts, `signal.*`/`insight.list` — Wave 8)
//
// Mirrors `packages/contracts/src/v1/signal.ts`. A Signal is a standing, named watch: "keep looking
// for developments related to X," run periodically (or on demand, via `signal.run-now`) by a Scout —
// an existing room-participant adapter (Codex, Claude, Ollama, or an OpenRouter instance) reused
// exactly as it is, asked a different question. A Scout's finding is never trusted as-is: it must
// carry at least one citation or the daemon refuses to record it as an Insight. An Insight, once
// recorded, is retained and never rewritten (append-only, migration 0015) — a dated fact about what
// the Scout reported and when.
//
// This is the FIRST slice of a larger, not-yet-built lifecycle (Signal -> Insight -> Opportunity ->
// Product Bet -> owner gate -> Plan -> Build -> Release -> Outcome -> back to Signal): a working,
// evidence-bound way to define what to watch and durably capture what a Scout finds.
//
// Unconditionally supported — no unsupported-operation fallback, same as `room.*`/`provider.*`.

public let minSignalCheckIntervalMinutes = 5
public let maxSignalCheckIntervalMinutes = 10_080
public let maxSignalNameLength = 200
public let maxSignalWatchDescriptionLength = 2_000
public let maxSignalCitations = 10

public enum SignalStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case active, paused
}

/// `SignalV1` — a standing watch. `checkIntervalMinutes` is `nil` for manual-only
/// (`signal.run-now`, the only mode until Architecture decision 11's scheduler); otherwise how often
/// the scheduler loop is willing to run this signal's Scout.
public struct Signal: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var signalId: SignalID
    public var name: String
    /// Free text describing what to watch for. Fed verbatim into the Scout's room charter.
    public var watchDescription: String
    /// Which configured room-participant adapter acts as this signal's Scout — the same
    /// `RoomProvider` key a room's cast would reference (e.g. "codex", "openrouter-fast").
    public var scoutProvider: RoomProvider
    public var status: SignalStatus
    public var createdAt: IsoInstant
    /// `nil` until the first check (manual or scheduled) runs.
    public var lastCheckedAt: IsoInstant?
    public var checkCount: Int
    public var insightCount: Int
    public var checkIntervalMinutes: Int?

    public var id: SignalID { signalId }

    public init(signalId: SignalID, name: String, watchDescription: String, scoutProvider: RoomProvider,
                status: SignalStatus, createdAt: IsoInstant, lastCheckedAt: IsoInstant?, checkCount: Int,
                insightCount: Int, checkIntervalMinutes: Int?) {
        self.signalId = signalId
        self.name = name
        self.watchDescription = watchDescription
        self.scoutProvider = scoutProvider
        self.status = status
        self.createdAt = createdAt
        self.lastCheckedAt = lastCheckedAt
        self.checkCount = checkCount
        self.insightCount = insightCount
        self.checkIntervalMinutes = checkIntervalMinutes
    }
}

public struct SignalCitation: Hashable, Sendable, Codable {
    public var url: String
    public var title: String

    public init(url: String, title: String) {
        self.url = url
        self.title = title
    }
}

public enum SignalConfidence: String, Hashable, Sendable, Codable, CaseIterable {
    case weak, moderate, strong
}

/// `SignalInsightV1` — a durably recorded, never-rewritten finding. `insightDigest` is the SHA-256
/// of the canonical JSON of every field above it, exactly like `RoomParticipantsCatalog.sourceDigest`
/// — but `DaemonClient` does not re-verify it client-side (`signal.run-now`/`insight.list` are not in
/// its digest-reverification list; see `DaemonClient`'s doc comment for the ops that are).
/// Decode-only: an Insight is never constructed or sent by the client.
public struct SignalInsight: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var insightId: SignalInsightID
    public var signalId: SignalID
    public var discoveredAt: IsoInstant
    /// One line: the finding itself.
    public var headline: String
    /// Why this is worth surfacing — the reasoning a human would want before acting on it.
    public var rationale: String
    public var confidence: SignalConfidence
    public var citations: [SignalCitation]
    public var insightDigest: Sha256Digest

    public var id: SignalInsightID { insightId }

    public init(insightId: SignalInsightID, signalId: SignalID, discoveredAt: IsoInstant, headline: String,
                rationale: String, confidence: SignalConfidence, citations: [SignalCitation], insightDigest: Sha256Digest) {
        self.insightId = insightId
        self.signalId = signalId
        self.discoveredAt = discoveredAt
        self.headline = headline
        self.rationale = rationale
        self.confidence = confidence
        self.citations = citations
        self.insightDigest = insightDigest
    }
}

// MARK: signal.run-now outcome

public enum SignalScoutFailureCode: String, Hashable, Sendable, Codable, CaseIterable {
    case scoutNotConfigured = "scout-not-configured"
    case scoutError = "scout-error"
    case scoutMalformedFinding = "scout-malformed-finding"
}

/// The daemon's own classification of what a Scout run produced. Decode-only.
public enum SignalRunOutcome: Hashable, Sendable {
    case found
    case nothingNew
    case scoutFailed(code: SignalScoutFailureCode, message: String)
}

extension SignalRunOutcome: Codable {
    private enum CodingKeys: String, CodingKey { case kind, code, message }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "found": self = .found
        case "nothing-new": self = .nothingNew
        case "scout-failed":
            self = .scoutFailed(code: try c.decode(SignalScoutFailureCode.self, forKey: .code),
                                message: try c.decode(String.self, forKey: .message))
        case let kind:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown signal run outcome kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .found: try c.encode("found", forKey: .kind)
        case .nothingNew: try c.encode("nothing-new", forKey: .kind)
        case let .scoutFailed(code, message):
            try c.encode("scout-failed", forKey: .kind)
            try c.encode(code, forKey: .code)
            try c.encode(message, forKey: .message)
        }
    }
}

// MARK: Command payloads

/// `signal.create`. `checkIntervalMinutes: nil` (the default) leaves the signal manual-only.
public struct SignalCreatePayload: Encodable, Sendable, Hashable {
    public var name: String
    public var watchDescription: String
    public var scoutProvider: RoomProvider
    public var checkIntervalMinutes: Int?

    public init(name: String, watchDescription: String, scoutProvider: RoomProvider, checkIntervalMinutes: Int? = nil) {
        self.name = name
        self.watchDescription = watchDescription
        self.scoutProvider = scoutProvider
        self.checkIntervalMinutes = checkIntervalMinutes
    }

    private enum CodingKeys: String, CodingKey { case name, watchDescription, scoutProvider, checkIntervalMinutes }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        try c.encode(watchDescription, forKey: .watchDescription)
        try c.encode(scoutProvider, forKey: .scoutProvider)
        try c.encode(checkIntervalMinutes, forKey: .checkIntervalMinutes)
    }
}

/// Shared payload for `signal.pause`/`signal.resume`/`signal.run-now`/`insight.list`
/// (`SignalPayloadV1Schema` on the wire — `{signalId}`).
public struct SignalIdPayload: Encodable, Sendable, Hashable {
    public var signalId: SignalID
    public init(signalId: SignalID) { self.signalId = signalId }
}

/// Sets or clears (`nil`) a signal's scheduled check interval (Architecture decision 11);
/// `signal.create`'s own `checkIntervalMinutes` covers the create-time case. `nullable`, not
/// `optional`, on the wire, so always emitted explicitly.
public struct SignalReschedulePayload: Encodable, Sendable, Hashable {
    public var signalId: SignalID
    public var checkIntervalMinutes: Int?

    public init(signalId: SignalID, checkIntervalMinutes: Int?) {
        self.signalId = signalId
        self.checkIntervalMinutes = checkIntervalMinutes
    }

    private enum CodingKeys: String, CodingKey { case signalId, checkIntervalMinutes }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(signalId, forKey: .signalId)
        try c.encode(checkIntervalMinutes, forKey: .checkIntervalMinutes)
    }
}

// MARK: Command results

/// Shared result shape for `signal.create`/`.pause`/`.resume`/`.reschedule` (`{operation, signal}`).
public struct SignalResult: Hashable, Sendable, Codable { public var signal: Signal }

public struct SignalListResult: Hashable, Sendable, Codable { public var signals: [Signal] }

/// `signal.run-now`'s result: `{operation, signal, insight, outcome}`. `insight` is non-nil exactly
/// when `outcome` is `.found`.
public struct SignalRunNowResult: Hashable, Sendable, Codable {
    public var signal: Signal
    public var insight: SignalInsight?
    public var outcome: SignalRunOutcome
}

public struct InsightListResult: Hashable, Sendable, Codable { public var insights: [SignalInsight] }
