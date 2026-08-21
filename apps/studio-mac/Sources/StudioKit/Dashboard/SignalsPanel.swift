import SwiftUI

// MARK: - SignalsPanel
//
// The dashboard's standing-watch instrument (Wave 9d): one row per `Signal` (`signal.list`), with
// pause/resume/run-now/reschedule actions and an expand-to-insights drawer (`insight.list`, loaded on
// first expand by `SignalsModel`). Placed in the dashboard's right column under "awaiting you" — a
// signal that has just found something IS a thing worth a human's attention, but it is not itself a
// human-gate (no diamond, no gold role at the row level; only its own pause/resume/run-now controls
// use HUD button roles). A pure value input (`SignalsState`) + closures, mirroring `AnalyticsPanel`.
//
// Feature-detected the same way: `state.signals == nil` renders one honest empty body.

public struct SignalsState: Sendable {
    public var signals: [Signal]?
    public var isLoading: Bool
    public var error: String?
    public var expandedSignalId: SignalID?
    public var insightsBySignal: [SignalID: [SignalInsight]]
    public var insightErrors: [SignalID: String]
    public var busyIds: Set<SignalID>
    public var rowErrors: [SignalID: String]
    public var lastRunOutcome: [SignalID: SignalRunNowOutcomeDisplay]

    public init(signals: [Signal]? = nil, isLoading: Bool = false, error: String? = nil, expandedSignalId: SignalID? = nil,
                insightsBySignal: [SignalID: [SignalInsight]] = [:], insightErrors: [SignalID: String] = [:],
                busyIds: Set<SignalID> = [], rowErrors: [SignalID: String] = [:],
                lastRunOutcome: [SignalID: SignalRunNowOutcomeDisplay] = [:]) {
        self.signals = signals
        self.isLoading = isLoading
        self.error = error
        self.expandedSignalId = expandedSignalId
        self.insightsBySignal = insightsBySignal
        self.insightErrors = insightErrors
        self.busyIds = busyIds
        self.rowErrors = rowErrors
        self.lastRunOutcome = lastRunOutcome
    }
}

/// The interval choices the reschedule menu offers, alongside "manual" (`nil`).
public let signalRescheduleChoicesMinutes = [5, 15, 30, 60, 240, 1_440]

public struct SignalsPanel: View {
    public var state: SignalsState
    public var onExpand: (SignalID) -> Void
    public var onPause: (SignalID) -> Void
    public var onResume: (SignalID) -> Void
    public var onRunNow: (SignalID) -> Void
    public var onReschedule: (SignalID, Int?) -> Void

    public init(state: SignalsState, onExpand: @escaping (SignalID) -> Void = { _ in }, onPause: @escaping (SignalID) -> Void = { _ in },
                onResume: @escaping (SignalID) -> Void = { _ in }, onRunNow: @escaping (SignalID) -> Void = { _ in },
                onReschedule: @escaping (SignalID, Int?) -> Void = { _, _ in }) {
        self.state = state
        self.onExpand = onExpand
        self.onPause = onPause
        self.onResume = onResume
        self.onRunNow = onRunNow
        self.onReschedule = onReschedule
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack {
                ProvenanceBadge(state.signals != nil ? .live("signal.list") : .notYetSourced)
                Spacer()
            }
            if let signals = state.signals {
                if signals.isEmpty {
                    Text("no signals defined").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                } else {
                    ForEach(signals) { signal in
                        signalRow(signal)
                    }
                }
            } else {
                emptyState
            }
        }
        .hudPanel("signals", padding: HUDTheme.space.s)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("not yet sourced").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            if let error = state.error {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).lineLimit(2)
            }
        }
    }

    // MARK: One signal row

    @ViewBuilder
    private func signalRow(_ signal: Signal) -> some View {
        let busy = state.busyIds.contains(signal.signalId)
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            Button {
                onExpand(signal.signalId)
            } label: {
                HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: HUDTheme.space.xxs) {
                            Text(signal.name).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                            statusPill(signal.status)
                        }
                        Text(signal.scoutProvider.rawValue)
                            .font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.soft).lineLimit(1)
                        HStack(spacing: HUDTheme.space.s) {
                            HUDReadout("checks", value: "\(signal.checkCount)")
                            HUDReadout("insights", value: "\(signal.insightCount)")
                        }
                        Text("\(signal.checkIntervalMinutes.map { "every \($0)m" } ?? "manual") · " +
                             (signal.lastCheckedAt.map { "last checked \(Self.timeLabel($0))" } ?? "never checked"))
                            .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: state.expandedSignalId == signal.signalId ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(HUDTheme.mute)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            actionsRow(signal, busy: busy)

            if let message = state.rowErrors[signal.signalId] {
                Text(message).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
            if let outcome = state.lastRunOutcome[signal.signalId] {
                outcomeLine(outcome)
            }
            if state.expandedSignalId == signal.signalId {
                insightsDrawer(signal.signalId)
            }
        }
        .padding(.vertical, HUDTheme.space.xxs)
        .overlay(alignment: .bottom) { Rectangle().fill(HUDTheme.hairline).frame(height: 1) }
    }

    private func statusPill(_ status: SignalStatus) -> some View {
        switch status {
        case .active: return StatusPill(.running, label: "active")
        case .paused: return StatusPill(.paused)
        }
    }

    private func actionsRow(_ signal: Signal, busy: Bool) -> some View {
        HStack(spacing: HUDTheme.space.xs) {
            if signal.status == .active {
                HUDButton("Pause", variant: .ghost, compact: true) { onPause(signal.signalId) }
            } else {
                HUDButton("Resume", variant: .ghost, compact: true) { onResume(signal.signalId) }
            }
            HUDButton("Run now", variant: .arc, compact: true) { onRunNow(signal.signalId) }
                .accessibilityHint(Text("Asks the machine to check this signal right now"))
            rescheduleMenu(signal)
            if busy { BreathingDot(color: HUDTheme.arc) }
        }
        .disabled(busy)
    }

    private func rescheduleMenu(_ signal: Signal) -> some View {
        Menu {
            Button("Manual") { onReschedule(signal.signalId, nil) }
            ForEach(signalRescheduleChoicesMinutes, id: \.self) { minutes in
                Button("Every \(minutes)m") { onReschedule(signal.signalId, minutes) }
            }
        } label: {
            HStack(spacing: 2) {
                Text("reschedule").font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold))
            }
            .foregroundStyle(HUDTheme.mute)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("Reschedule \(signal.name)")
    }

    @ViewBuilder
    private func outcomeLine(_ outcome: SignalRunNowOutcomeDisplay) -> some View {
        switch outcome {
        case .found(let insight):
            Text("found: \(insight.headline)").font(HUDTypography.caption).foregroundStyle(HUDTheme.arc).lineLimit(2)
        case .nothingNew:
            Text("nothing new").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
        case .scoutFailed(let code, let message):
            Text("\(code.rawValue): \(message)").font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).lineLimit(2)
        case .unknownReRead:
            Text("outcome unknown — re-read latest state").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
        case .failed(let message):
            Text(message).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).lineLimit(2)
        }
    }

    // MARK: Insights drawer

    @ViewBuilder
    private func insightsDrawer(_ signalId: SignalID) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            if let insights = state.insightsBySignal[signalId] {
                if insights.isEmpty {
                    Text("no insights recorded yet").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                } else {
                    ForEach(insights) { insight in
                        insightRow(insight)
                    }
                }
            } else if let error = state.insightErrors[signalId] {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            } else {
                Text("loading…").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
        }
        .padding(.leading, HUDTheme.space.s)
        .padding(.top, HUDTheme.space.xxs)
    }

    private func insightRow(_ insight: SignalInsight) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                Text(insight.headline).font(HUDTypography.body).foregroundStyle(HUDTheme.ink).lineLimit(3)
                Spacer(minLength: 0)
            }
            HStack(spacing: HUDTheme.space.xs) {
                confidencePill(insight.confidence)
                citationsChip(insight.citations.count)
                Text(Self.timeLabel(insight.discoveredAt)).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
        }
        .padding(.vertical, 2)
    }

    private func confidencePill(_ confidence: SignalConfidence) -> some View {
        let role: HUDRole
        switch confidence {
        case .strong: role = .ok
        case .moderate: role = .machine
        case .weak: role = .neutral
        }
        return Text(confidence.rawValue)
            .font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
            .foregroundStyle(role.color)
            .padding(.horizontal, 5).padding(.vertical, 1)
            .background(Capsule().fill(role.fill))
            .overlay(Capsule().stroke(role.stroke, lineWidth: 1))
    }

    private func citationsChip(_ count: Int) -> some View {
        HStack(spacing: 2) {
            Image(systemName: "link").font(.system(size: 8, weight: .semibold))
            Text("\(count)")
        }
        .font(HUDTypography.monoLabel)
        .foregroundStyle(HUDTheme.soft)
        .accessibilityLabel("\(count) citation\(count == 1 ? "" : "s")")
    }

    private static func timeLabel(_ instant: IsoInstant) -> String {
        guard let date = instant.date else { return instant.rawValue }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, HH:mm"
        formatter.timeZone = .current
        return formatter.string(from: date)
    }
}

// MARK: - Preview data

extension SignalsState {
    public static var previewActiveAndPaused: SignalsState {
        let active = Signal(signalId: SignalID(unchecked: "90000001-0000-4000-8000-000000000001"),
                            name: "OpenRouter pricing changes",
                            watchDescription: "Watch for OpenRouter pricing or rate-limit changes.",
                            scoutProvider: RoomProvider(unchecked: "openrouter-fast"), status: .active,
                            createdAt: IsoInstant(unchecked: "2026-08-15T09:00:00.000Z"),
                            lastCheckedAt: IsoInstant(unchecked: "2026-08-16T18:00:00.000Z"),
                            checkCount: 5, insightCount: 2, checkIntervalMinutes: 60)
        let paused = Signal(signalId: SignalID(unchecked: "90000002-0000-4000-8000-000000000002"),
                            name: "Competitor Shopify app launches",
                            watchDescription: "Watch for new Shopify apps entering our category.",
                            scoutProvider: RoomProvider(unchecked: "codex"), status: .paused,
                            createdAt: IsoInstant(unchecked: "2026-08-10T09:00:00.000Z"),
                            lastCheckedAt: nil, checkCount: 0, insightCount: 0, checkIntervalMinutes: nil)
        return SignalsState(signals: [active, paused])
    }

    public static var previewExpandedWithInsights: SignalsState {
        var state = previewActiveAndPaused
        let signalId = SignalID(unchecked: "90000001-0000-4000-8000-000000000001")
        state.expandedSignalId = signalId
        state.insightsBySignal[signalId] = [
            SignalInsight(insightId: SignalInsightID(unchecked: "91000001-0000-4000-8000-000000000001"), signalId: signalId,
                          discoveredAt: IsoInstant(unchecked: "2026-08-16T18:00:03.000Z"),
                          headline: "OpenRouter added a 20% surcharge on Gemini 2.5 Flash during peak hours.",
                          rationale: "Peak-hour pricing changes our per-reply cost model.", confidence: .strong,
                          citations: [SignalCitation(url: "https://openrouter.ai/docs/pricing", title: "OpenRouter pricing docs")],
                          insightDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "d", count: 64))),
        ]
        return state
    }

    public static var previewNotYetSourced: SignalsState {
        SignalsState(signals: nil, error: "[daemon] protocol.unsupported-operation: signal.list")
    }
}

#Preview("Signals — active + paused") {
    SignalsPanel(state: .previewActiveAndPaused)
        .padding().frame(width: 340).background(HUDTheme.void)
}

#Preview("Signals — expanded") {
    SignalsPanel(state: .previewExpandedWithInsights)
        .padding().frame(width: 340).background(HUDTheme.void)
}
