import SwiftUI

// MARK: - DashboardScreen
//
// The dashboard laid out as the HUD prototype:
//
//   ┌ gauge row: projects · verified this week · awaiting you · min/release · agent window ┐
//   ├ TIMELINE (centrepiece)                              ┬ RETICLE           ┤
//   │                                                     │ AWAITING YOU      │
//   ├ six phase rings ────────────────────────────────────┴───────────────────┤
//
// It is a pure function of a `DashboardSnapshot` (plus per-operation errors) so it previews and
// snapshots without a store.

public struct DashboardScreen: View {
    public var snapshot: DashboardSnapshot
    public var errors: [String: String]
    public var timelineNote: String?
    public var selectedSlug: String?
    public var onSelectProject: ((String) -> Void)?

    public init(snapshot: DashboardSnapshot, errors: [String: String] = [:], timelineNote: String? = nil,
                selectedSlug: String? = nil, onSelectProject: ((String) -> Void)? = nil) {
        self.snapshot = snapshot
        self.errors = errors
        self.timelineNote = timelineNote
        self.selectedSlug = selectedSlug
        self.onSelectProject = onSelectProject
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                gaugeRow
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    timeline
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    VStack(spacing: HUDTheme.space.m) {
                        reticle
                        awaiting
                    }
                    .frame(width: 300)
                }
                rings
                if !errors.isEmpty { errorStrip }
            }
            .padding(HUDTheme.space.l)
        }
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
