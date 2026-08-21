import SwiftUI

// MARK: - DashboardScreen
//
// The dashboard laid out as the HUD prototype:
//
//   ┌ gauge row: projects · verified this week · awaiting you · min/release · agent window ┐
//   ├ TIMELINE (centrepiece)                              ┬ RETICLE           ┤
//   │                                                     │ AWAITING YOU      │
//   ├ six phase rings ────────────────────────────────────┴───────────────────┤
//   ├ release rail (App Store Connect projection, Phase 6 step B) ────────────┤
//
// It is a pure function of a `DashboardSnapshot` (plus per-operation errors) so it previews and
// snapshots without a store.

public struct DashboardScreen: View {
    public var snapshot: DashboardSnapshot
    public var errors: [String: String]
    public var timelineNote: String?
    public var selectedSlug: String?
    public var onSelectProject: ((String) -> Void)?
    /// "Seed new project" — the from-scratch entry point into the Planner (`project.seed` then
    /// `plan.propose`). `nil` when the shell has no daemon-backed planner to hand off to yet.
    public var onNewProject: (() -> Void)?
    /// The release rail (`release.projection`). `nil` omits the panel entirely (offline previews and
    /// the phase-1 fixture dashboard); a state with no projection renders the honest empty rail.
    public var release: ReleaseRailState?
    public var onObserveRelease: (() -> Void)?
    /// The Analytics panel (`usage.summary`, Wave 9d). `nil` omits the panel entirely, same convention
    /// as `release` above; a non-nil state with `summary == nil` renders the panel's own honest empty
    /// body instead (feature-detected — see `AnalyticsState`'s header comment).
    public var analytics: AnalyticsState?
    public var onSelectAnalyticsRange: ((AnalyticsRange) -> Void)?
    /// The Signals panel (`signal.list`/`insight.list`, Wave 9d). Same nil-omits convention as `release`/`analytics`.
    public var signals: SignalsState?
    public var onExpandSignal: ((SignalID) -> Void)?
    public var onPauseSignal: ((SignalID) -> Void)?
    public var onResumeSignal: ((SignalID) -> Void)?
    public var onRunSignalNow: ((SignalID) -> Void)?
    public var onRescheduleSignal: ((SignalID, Int?) -> Void)?
    /// Fires once when the screen appears — `StudioRootView` uses it to load `usage.summary`/
    /// `signal.list` on every Dashboard-tab appearance, mirroring `PhasesScreen`/`SettingsScreen`'s
    /// own `onAppear` closure (the 15s `StudioStore.refresh()` loop keeps them fresh after that).
    public var onAppear: () async -> Void

    public init(snapshot: DashboardSnapshot, errors: [String: String] = [:], timelineNote: String? = nil,
                selectedSlug: String? = nil, onSelectProject: ((String) -> Void)? = nil,
                onNewProject: (() -> Void)? = nil, release: ReleaseRailState? = nil,
                onObserveRelease: (() -> Void)? = nil, analytics: AnalyticsState? = nil,
                onSelectAnalyticsRange: ((AnalyticsRange) -> Void)? = nil, signals: SignalsState? = nil,
                onExpandSignal: ((SignalID) -> Void)? = nil, onPauseSignal: ((SignalID) -> Void)? = nil,
                onResumeSignal: ((SignalID) -> Void)? = nil, onRunSignalNow: ((SignalID) -> Void)? = nil,
                onRescheduleSignal: ((SignalID, Int?) -> Void)? = nil, onAppear: @escaping () async -> Void = {}) {
        self.snapshot = snapshot
        self.errors = errors
        self.timelineNote = timelineNote
        self.selectedSlug = selectedSlug
        self.onSelectProject = onSelectProject
        self.onNewProject = onNewProject
        self.release = release
        self.onObserveRelease = onObserveRelease
        self.analytics = analytics
        self.onSelectAnalyticsRange = onSelectAnalyticsRange
        self.signals = signals
        self.onExpandSignal = onExpandSignal
        self.onPauseSignal = onPauseSignal
        self.onResumeSignal = onResumeSignal
        self.onRunSignalNow = onRunSignalNow
        self.onRescheduleSignal = onRescheduleSignal
        self.onAppear = onAppear
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                if let onNewProject {
                    HStack {
                        Spacer()
                        HUDButton("New project", systemImage: "plus", variant: .arc, compact: true, action: onNewProject)
                    }
                }
                gaugeRow
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    timeline
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    VStack(spacing: HUDTheme.space.m) {
                        reticle
                        awaiting
                        if let signals { signalsPanel(signals) }
                    }
                    .frame(width: 300)
                }
                rings
                if let analytics { analyticsPanel(analytics) }
                if let release { releaseRail(release) }
                if !errors.isEmpty { errorStrip }
            }
            .padding(HUDTheme.space.l)
        }
        .task { await onAppear() }
    }

    private var gaugeRow: some View {
        GaugeRowView(gauges: snapshot.gauges)
            .hudPanel(padding: HUDTheme.space.s)
    }

    private var timeline: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            TimelineView(rows: snapshot.rows, window: snapshot.window, today: snapshot.today,
                         selectedSlug: selectedSlug, onSelect: onSelectProject)
            if let timelineNote {
                Text(timelineNote)
                    .font(HUDTypography.caption)
                    .foregroundStyle(HUDTheme.mute)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, HUDTheme.space.xs)
            }
        }
        .hudPanel("timeline", padding: HUDTheme.space.s)
    }

    private var reticle: some View {
        PortfolioReticle(reading: snapshot.reticle)
            .frame(maxWidth: 216)
            .frame(maxWidth: .infinity)
            .hudPanel("portfolio", padding: HUDTheme.space.s)
    }

    private var awaiting: some View {
        AwaitingYouList(items: snapshot.awaiting) { item in
            if let slug = item.slug { onSelectProject?(slug) }
        }
        .hudPanel("awaiting you · \(snapshot.awaiting.count)", role: .human, padding: HUDTheme.space.s)
    }

    private var rings: some View {
        PhaseRingsRow(projects: snapshot.projects, selectedSlug: selectedSlug, onSelect: onSelectProject)
            .hudPanel("projects", padding: HUDTheme.space.s)
    }

    private func releaseRail(_ state: ReleaseRailState) -> some View {
        ReleaseRailView(state: state, onObserve: onObserveRelease)
            .hudPanel("release rail · app store connect", padding: HUDTheme.space.s)
    }

    private func analyticsPanel(_ state: AnalyticsState) -> some View {
        AnalyticsPanel(state: state, onSelectRange: { range in onSelectAnalyticsRange?(range) })
    }

    private func signalsPanel(_ state: SignalsState) -> some View {
        SignalsPanel(state: state, onExpand: { id in onExpandSignal?(id) }, onPause: { id in onPauseSignal?(id) },
                    onResume: { id in onResumeSignal?(id) }, onRunNow: { id in onRunSignalNow?(id) },
                    onReschedule: { id, minutes in onRescheduleSignal?(id, minutes) })
    }

    private var errorStrip: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            ForEach(errors.keys.sorted(), id: \.self) { op in
                HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                    Text(op).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.alert)
                    Text(errors[op] ?? "").font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .hudPanel("read errors", role: .alert, padding: HUDTheme.space.s)
    }
}

// MARK: - Preview data

extension DashboardSnapshot {
    /// The fixture rows with no daemon: what the dashboard shows offline.
    public static func offlinePreview(today: DayStamp = (try? DayStamp("2026-08-16")) ?? DayStamp(Date())) -> DashboardSnapshot {
        let fixture = try? TimelineFixture.loadBundled()
        return DashboardDerivation.snapshot(DashboardInputs(timeline: fixture, now: today.date.addingTimeInterval(12 * 3600)))
    }
}

#Preview("Dashboard — offline, fixture rows") {
    DashboardScreen(snapshot: .offlinePreview(), timelineNote: "FIXTURE — timeline-fixture.json · TODO milestones schema")
        .frame(width: 1240, height: 860)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
