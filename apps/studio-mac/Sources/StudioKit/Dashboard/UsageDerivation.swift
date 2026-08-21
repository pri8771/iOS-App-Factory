import Foundation

// MARK: - Usage derivations
//
// Pure functions from what `usage.summary` said (a flat list of `(providerKey, model, dayKey)`
// buckets — see Usage.swift's header comment) to what the dashboard's Analytics panel draws. Nothing
// here talks to the wire; `UsageModel` fetches and `AnalyticsPanel` hands the rows in. Mirrors
// `DashboardDerivation`'s discipline: every sum is null-honest — a field no row reported stays `nil`,
// never a fabricated 0, and `unreportedCount` (rows the ledger recorded with no usable usage at all)
// is tracked separately from the token sums so it can never be folded into a token count that reads
// as "0 tokens used" when the truth is "the provider told us nothing."

/// The dashboard's two usage windows (Architecture decision 16 / Wave 8's `studio.analyticsRange`
/// `@AppStorage`). Raw values are the exact strings that key persists — `"7d"`/`"30d"` — so the
/// `@AppStorage` default (`"7d"`, declared in `StudioRootView` since Wave 8) round-trips without a
/// migration.
public enum AnalyticsRange: String, Hashable, Sendable, CaseIterable, Identifiable {
    case sevenDays = "7d"
    case thirtyDays = "30d"

    public var id: String { rawValue }

    /// `usage.summary`'s `sinceDays` payload field for this window.
    public var sinceDays: Int {
        switch self {
        case .sevenDays: return 7
        case .thirtyDays: return 30
        }
    }

    public var label: String {
        switch self {
        case .sevenDays: return "7D"
        case .thirtyDays: return "30D"
        }
    }
}

/// The dashboard's headline usage numbers — every field summed only over the rows that actually
/// reported it.
public struct UsageTotals: Hashable, Sendable {
    /// Sum of `inputTokens` across rows that reported it; `nil` when not one row did.
    public var inputTokens: Int?
    /// Sum of `outputTokens` across rows that reported it; `nil` when not one row did.
    public var outputTokens: Int?
    /// `inputTokens + outputTokens`, treating a missing side as a 0 contribution — but only when at
    /// least one side is known; `nil` when NEITHER side is known for any row (nothing to sum at all,
    /// not "0 tokens"). Labelled "known total" wherever it renders, precisely because it is a sum of
    /// whatever is known, not a claim that the true total is fully accounted for.
    public var knownTotalTokens: Int?
    /// Sum of `costUsdMicros` across rows that self-reported cost (only Claude, today); `nil` when no
    /// row did — rendered "—", never a guessed price.
    public var costUsdMicros: Int?
    /// Rows with no usable usage at all (every token/cost field null). Never rendered as part of a
    /// token count — its own honest "N unreported" readout.
    public var unreportedCount: Int

    public init(inputTokens: Int?, outputTokens: Int?, knownTotalTokens: Int?, costUsdMicros: Int?, unreportedCount: Int) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.knownTotalTokens = knownTotalTokens
        self.costUsdMicros = costUsdMicros
        self.unreportedCount = unreportedCount
    }

    public static let empty = UsageTotals(inputTokens: nil, outputTokens: nil, knownTotalTokens: nil,
                                          costUsdMicros: nil, unreportedCount: 0)

    /// `costUsdMicros` as dollars, formatted to two places (e.g. "$0.18"); `nil` when no provider in
    /// the window self-reported cost.
    public var costDisplay: String? {
        guard let costUsdMicros else { return nil }
        return String(format: "$%.2f", Double(costUsdMicros) / 1_000_000)
    }
}

/// One provider's aggregated usage across every model/day bucket it appears in.
public struct ProviderUsage: Hashable, Sendable, Identifiable {
    public var providerKey: RoomProvider
    public var inputTokens: Int?
    public var outputTokens: Int?
    public var knownTotalTokens: Int?
    public var costUsdMicros: Int?
    public var unreportedCount: Int

    public var id: String { providerKey.rawValue }

    public init(providerKey: RoomProvider, inputTokens: Int?, outputTokens: Int?, knownTotalTokens: Int?,
                costUsdMicros: Int?, unreportedCount: Int) {
        self.providerKey = providerKey
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.knownTotalTokens = knownTotalTokens
        self.costUsdMicros = costUsdMicros
        self.unreportedCount = unreportedCount
    }
}

/// One day's aggregated usage across every provider/model bucket on that day.
public struct DayUsage: Hashable, Sendable, Identifiable {
    public var dayKey: RoomDayKey
    public var inputTokens: Int?
    public var outputTokens: Int?
    public var knownTotalTokens: Int?
    public var unreportedCount: Int

    public var id: String { dayKey.rawValue }

    public init(dayKey: RoomDayKey, inputTokens: Int?, outputTokens: Int?, knownTotalTokens: Int?, unreportedCount: Int) {
        self.dayKey = dayKey
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.knownTotalTokens = knownTotalTokens
        self.unreportedCount = unreportedCount
    }
}

public enum UsageDerivation {

    /// Sums `pick` over every row that reported a non-nil value; `nil` when none did (the null-honest
    /// primitive every other function here is built from).
    static func sumKnown(_ rows: [UsageSummaryRow], _ pick: (UsageSummaryRow) -> Int?) -> Int? {
        let known = rows.compactMap(pick)
        return known.isEmpty ? nil : known.reduce(0, +)
    }

    static func knownTotal(input: Int?, output: Int?) -> Int? {
        guard input != nil || output != nil else { return nil }
        return (input ?? 0) + (output ?? 0)
    }

    /// The headline totals across every row in the window.
    public static func totals(_ rows: [UsageSummaryRow]) -> UsageTotals {
        let input = sumKnown(rows, \.inputTokens)
        let output = sumKnown(rows, \.outputTokens)
        return UsageTotals(inputTokens: input, outputTokens: output, knownTotalTokens: knownTotal(input: input, output: output),
                           costUsdMicros: sumKnown(rows, \.costUsdMicros), unreportedCount: rows.reduce(0) { $0 + $1.unreportedCount })
    }

    /// One row per provider (folding every model/day bucket into it), sorted by known total tokens
    /// descending — the biggest bar first — ties broken by provider key so the order is stable.
    public static func byProvider(_ rows: [UsageSummaryRow]) -> [ProviderUsage] {
        var order: [RoomProvider] = []
        var byKey: [RoomProvider: [UsageSummaryRow]] = [:]
        for row in rows {
            if byKey[row.providerKey] == nil { order.append(row.providerKey) }
            byKey[row.providerKey, default: []].append(row)
        }
        return order.map { key in
            let bucket = byKey[key] ?? []
            let input = sumKnown(bucket, \.inputTokens)
            let output = sumKnown(bucket, \.outputTokens)
            return ProviderUsage(providerKey: key, inputTokens: input, outputTokens: output,
                                 knownTotalTokens: knownTotal(input: input, output: output),
                                 costUsdMicros: sumKnown(bucket, \.costUsdMicros),
                                 unreportedCount: bucket.reduce(0) { $0 + $1.unreportedCount })
        }
        .sorted { a, b in
            let ta = a.knownTotalTokens ?? -1
            let tb = b.knownTotalTokens ?? -1
            if ta != tb { return ta > tb }
            return a.providerKey.rawValue < b.providerKey.rawValue
        }
    }

    /// One row per calendar day (folding every provider/model bucket into it), ascending by day —
    /// oldest first, the order a sparkline/series reads left to right.
    public static func byDay(_ rows: [UsageSummaryRow]) -> [DayUsage] {
        var order: [RoomDayKey] = []
        var byDay: [RoomDayKey: [UsageSummaryRow]] = [:]
        for row in rows {
            if byDay[row.dayKey] == nil { order.append(row.dayKey) }
            byDay[row.dayKey, default: []].append(row)
        }
        return order.sorted { $0.rawValue < $1.rawValue }.map { day in
            let bucket = byDay[day] ?? []
            let input = sumKnown(bucket, \.inputTokens)
            let output = sumKnown(bucket, \.outputTokens)
            return DayUsage(dayKey: day, inputTokens: input, outputTokens: output,
                            knownTotalTokens: knownTotal(input: input, output: output),
                            unreportedCount: bucket.reduce(0) { $0 + $1.unreportedCount })
        }
    }
}
