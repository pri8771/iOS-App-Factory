import Foundation

// MARK: - The honest token ledger, read side (token-usage.ts, `usage.summary` — Wave 8)
//
// Mirrors `packages/contracts/src/v1/token-usage.ts`: one append-only row per contribution the
// daemon actually dispatched (migration `0017-token-usage`), distinct from `RoomBudget`'s
// reservation accounting — a budget debit happens whether or not a provider ever reports real
// usage, but this ledger only ever records what a provider actually reported, leaving a field `nil`
// (and the row counted toward `unreportedCount`) rather than inventing a number. No per-token
// pricing is ever invented: `costUsdMicros` is populated only where a provider self-reports cost
// (Claude's `total_cost_usd` today), `nil` everywhere else. See "Architecture decisions" item 6.
//
// Unconditionally supported — no unsupported-operation fallback, same as `room.*`/`provider.*`.

public let minUsageSummarySinceDays = 1
public let maxUsageSummarySinceDays = 90

/// One `(providerKey, model, dayKey)` bucket of `usage.summary`. Decode-only: the client never
/// constructs or sends one of these back.
public struct UsageSummaryRow: Hashable, Sendable, Codable, Identifiable {
    public var providerKey: RoomProvider
    public var model: String
    public var dayKey: RoomDayKey
    public var inputTokens: Int?
    public var outputTokens: Int?
    public var cachedInputTokens: Int?
    public var costUsdMicros: Int?
    /// Rows the ledger recorded for this bucket with no usable usage at all — every token/cost
    /// field null. Rendered as "N unreported," never folded into a fabricated 0.
    public var unreportedCount: Int

    public var id: String { "\(providerKey.rawValue).\(model).\(dayKey.rawValue)" }

    public init(providerKey: RoomProvider, model: String, dayKey: RoomDayKey, inputTokens: Int?, outputTokens: Int?,
                cachedInputTokens: Int?, costUsdMicros: Int?, unreportedCount: Int) {
        self.providerKey = providerKey
        self.model = model
        self.dayKey = dayKey
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cachedInputTokens = cachedInputTokens
        self.costUsdMicros = costUsdMicros
        self.unreportedCount = unreportedCount
    }
}

public struct UsageSummary: Hashable, Sendable, Codable {
    public var sinceDays: Int
    public var rows: [UsageSummaryRow]

    public init(sinceDays: Int, rows: [UsageSummaryRow]) {
        self.sinceDays = sinceDays
        self.rows = rows
    }
}

// MARK: Command payload

public struct UsageSummaryPayload: Encodable, Sendable, Hashable {
    public var sinceDays: Int
    public init(sinceDays: Int = 7) { self.sinceDays = sinceDays }
}

// MARK: Command result

public struct UsageSummaryResult: Hashable, Sendable, Codable { public var summary: UsageSummary }
