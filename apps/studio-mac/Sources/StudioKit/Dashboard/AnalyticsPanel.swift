import SwiftUI

// MARK: - AnalyticsPanel
//
// The dashboard's real token-usage instrument (Wave 9d, Architecture decision 16): stat tiles, a
// per-provider bar chart, and the 7D/30D range picker, fed by `usage.summary` through
// `UsageDerivation`'s pure math. A pure value input (`AnalyticsState`) + closures, mirroring
// `DashboardScreen`/`RoomRosterPanel` — previews and snapshots without a store.
//
// Feature-detected like every other daemon-optional instrument in this app: `state.summary == nil`
// (an older daemon this build predates, or the read genuinely failed) renders one honest empty body —
// never a zeroed-out tile row that could be mistaken for "usage really is zero."

/// Everything `AnalyticsPanel` draws from. `summary == nil` means "not loaded yet," "this daemon has
/// no usage ledger" (silent — `error == nil`), or a real read failure (`error != nil`) — see
/// `UsageModel`'s header comment for which is which.
public struct AnalyticsState: Sendable {
    public var range: AnalyticsRange
    public var summary: UsageSummary?
    public var isLoading: Bool
    public var error: String?
    /// `room.list`'s count of currently-loaded (non-archived) rooms — the "active rooms" tile. `nil`
    /// only when rooms have never been loaded at all (distinct from a genuinely empty roster).
    public var activeRoomsCount: Int?

    public init(range: AnalyticsRange, summary: UsageSummary? = nil, isLoading: Bool = false, error: String? = nil,
                activeRoomsCount: Int? = nil) {
        self.range = range
        self.summary = summary
        self.isLoading = isLoading
        self.error = error
        self.activeRoomsCount = activeRoomsCount
    }
}

struct AnalyticsStatTile: Identifiable {
    var id: String
    var label: String
    var value: String?
    var caption: String?
    var role: HUDRole
    var provenance: Provenance
}

public struct AnalyticsPanel: View {
    public var state: AnalyticsState
    public var onSelectRange: (AnalyticsRange) -> Void

    public init(state: AnalyticsState, onSelectRange: @escaping (AnalyticsRange) -> Void = { _ in }) {
        self.state = state
        self.onSelectRange = onSelectRange
    }

    private var rows: [UsageSummaryRow] { state.summary?.rows ?? [] }
    private var totals: UsageTotals { UsageDerivation.totals(rows) }
    private var providers: [ProviderUsage] { UsageDerivation.byProvider(rows) }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            header
            if let summary = state.summary {
                tiles
                if !providers.isEmpty {
                    providerBars
                } else {
                    Text("no usage recorded in this window").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                }
                Text("since \(summary.sinceDays)d ago").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            } else {
                emptyState
            }
        }
        .hudPanel("usage", padding: HUDTheme.space.s)
    }

    private var header: some View {
        HStack {
            ProvenanceBadge(state.summary != nil ? .live("usage.summary") : .notYetSourced)
            Spacer()
            rangePicker
        }
    }

    private var rangePicker: some View {
        HStack(spacing: 2) {
            ForEach(AnalyticsRange.allCases) { candidate in
                Button(candidate.label) { onSelectRange(candidate) }
                    .buttonStyle(.hud(candidate == state.range ? .arc : .ghost, compact: true))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Analytics window")
    }

    // MARK: Stat tiles

    private var statTiles: [AnalyticsStatTile] {
        var tiles: [AnalyticsStatTile] = [
            AnalyticsStatTile(id: "tokens", label: "tokens known", value: totals.knownTotalTokens.map(Self.formatCount),
                              caption: nil, role: .machine, provenance: .live("usage.summary")),
        ]
        if totals.unreportedCount > 0 {
            tiles.append(AnalyticsStatTile(id: "unreported", label: "unreported calls", value: "\(totals.unreportedCount)",
                                           caption: "provider reported no usage", role: .alert, provenance: .live("usage.summary")))
        }
        tiles.append(AnalyticsStatTile(id: "rooms", label: "active rooms", value: state.activeRoomsCount.map(String.init),
                                       caption: nil, role: .machine,
                                       provenance: state.activeRoomsCount == nil ? .notYetSourced : .live("room.list")))
        tiles.append(AnalyticsStatTile(id: "cost", label: "est. cost", value: totals.costDisplay,
                                       caption: totals.costDisplay == nil ? "no provider reported cost" : nil,
                                       role: .machine, provenance: totals.costDisplay == nil ? .notYetSourced : .live("usage.summary")))
        return tiles
    }

    private var tiles: some View {
        HStack(alignment: .top, spacing: HUDTheme.space.l) {
            ForEach(statTiles) { tile in
                VStack(alignment: .leading, spacing: 2) {
                    HUDLabel(tile.label)
                    Text(tile.value ?? "—")
                        .font(HUDTypography.monoReadout)
                        .monospacedDigit()
                        .foregroundStyle(tile.value == nil ? HUDTheme.mute : tile.role.color)
                    if let caption = tile.caption {
                        Text(caption).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Per-provider bars

    private var providerBars: some View {
        let maxKnown = providers.compactMap(\.knownTotalTokens).max() ?? 0
        return VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            ForEach(providers) { provider in
                providerRow(provider, maxKnown: maxKnown)
            }
        }
    }

    private func providerRow(_ provider: ProviderUsage, maxKnown: Int) -> some View {
        HStack(spacing: HUDTheme.space.xs) {
            Text(provider.providerKey.rawValue)
                .font(HUDTypography.monoLabel)
                .foregroundStyle(HUDTheme.soft)
                .lineLimit(1)
                .frame(width: 104, alignment: .leading)
            BarFill(fraction: maxKnown > 0 ? Double(provider.knownTotalTokens ?? 0) / Double(maxKnown) : 0)
                .frame(height: 6)
            Text(provider.knownTotalTokens.map(Self.formatCount) ?? "—")
                .font(HUDTypography.monoValue)
                .monospacedDigit()
                .foregroundStyle(provider.knownTotalTokens == nil ? HUDTheme.mute : HUDTheme.ink)
                .frame(width: 64, alignment: .trailing)
            if provider.unreportedCount > 0 {
                Text("+\(provider.unreportedCount) unreported")
                    .font(HUDTypography.caption)
                    .foregroundStyle(HUDTheme.mute)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("not yet sourced").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            if let error = state.error {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).lineLimit(2)
            }
        }
    }

    static func formatCount(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fK", Double(value) / 1_000) }
        return "\(value)"
    }
}

/// A horizontal fill bar for the per-provider usage rows: role-coloured fill over a role track, no
/// centre text — the caller prints the value beside it (mirrors `MiniArc` in `TitleBar.swift`).
struct BarFill: View {
    var fraction: Double
    var role: HUDRole = .machine

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(role.track)
                Capsule().fill(role.color)
                    .frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Preview data

extension AnalyticsState {
    public static var previewPopulated: AnalyticsState {
        AnalyticsState(range: .sevenDays, summary: UsageSummary(sinceDays: 7, rows: [
            UsageSummaryRow(providerKey: RoomProvider(unchecked: "claude"), model: "claude-sonnet-4-5",
                            dayKey: RoomDayKey(unchecked: "2026-08-16"), inputTokens: 12_400, outputTokens: 3_100,
                            cachedInputTokens: 2_000, costUsdMicros: 184_500, unreportedCount: 0),
            UsageSummaryRow(providerKey: RoomProvider(unchecked: "openrouter-fast"), model: "google/gemini-2.5-flash",
                            dayKey: RoomDayKey(unchecked: "2026-08-16"), inputTokens: nil, outputTokens: 5_600,
                            cachedInputTokens: nil, costUsdMicros: nil, unreportedCount: 0),
            UsageSummaryRow(providerKey: RoomProvider(unchecked: "codex"), model: "gpt-5-codex",
                            dayKey: RoomDayKey(unchecked: "2026-08-16"), inputTokens: nil, outputTokens: nil,
                            cachedInputTokens: nil, costUsdMicros: nil, unreportedCount: 4),
        ]), activeRoomsCount: 3)
    }

    public static var previewUnreportedHeavy: AnalyticsState {
        AnalyticsState(range: .thirtyDays, summary: UsageSummary(sinceDays: 30, rows: [
            UsageSummaryRow(providerKey: RoomProvider(unchecked: "codex"), model: "gpt-5-codex",
                            dayKey: RoomDayKey(unchecked: "2026-08-01"), inputTokens: nil, outputTokens: nil,
                            cachedInputTokens: nil, costUsdMicros: nil, unreportedCount: 18),
        ]), activeRoomsCount: 0)
    }

    public static var previewNotYetSourced: AnalyticsState {
        AnalyticsState(range: .sevenDays, summary: nil, error: "[daemon] protocol.unsupported-operation: usage.summary")
    }
}

#Preview("Analytics — populated") {
    AnalyticsPanel(state: .previewPopulated)
        .padding().frame(width: 640).background(HUDTheme.void)
}

#Preview("Analytics — not yet sourced") {
    AnalyticsPanel(state: .previewNotYetSourced)
        .padding().frame(width: 640).background(HUDTheme.void)
}
