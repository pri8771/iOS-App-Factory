import SwiftUI

// MARK: - StudioRootView
//
// The window: title bar with tabs, the selected screen, and the corner chat floating bottom-right
// on every screen. Reads everything from `StudioStore` in the environment.

public struct StudioRootView: View {
    @Environment(StudioStore.self) private var store
    @State private var tab: StudioTab = .dashboard
    @State private var selectedSlug: String?
    /// The corner chat starts as the FAB so the dashboard's right column is visible on launch; one
    /// click opens the panel.
    @State private var chatMinimized = true

    /// Phase 1: the budget gauge is a static placeholder and says so.
    public static let staticBudget = Sourced(0.38, .staticValue("phase 1 placeholder"))

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            StudioTitleBar(tab: $tab, link: store.link, budget: Self.staticBudget, lastRefreshAt: store.lastRefreshAt) {
                Task { await store.connect() }
            }
            ZStack(alignment: .bottomTrailing) {
                screen
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if tab != .chat {
                    CornerChatView(chat: store.chat, context: { store.assistantContext }, minimized: $chatMinimized) {
                        tab = .chat
                    }
                    .padding(HUDTheme.space.l)
                }
            }
        }
        .background(HUDTheme.void)
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .dashboard:
            if let slug = selectedSlug, let project = store.dashboard.project(slug: slug) {
                ProjectDetailView(project: project, runs: store.runs, isConnected: store.isConnected,
                                  loadRun: { id in await store.loadRun(id) },
                                  onBack: { selectedSlug = nil })
                    .id(slug)
                    .transition(.opacity)
            } else {
                DashboardScreen(snapshot: store.dashboard, errors: store.errors, timelineNote: timelineNote,
                                selectedSlug: nil, onSelectProject: { selectedSlug = $0 })
                    .transition(.opacity)
            }
        case .chat:
            ChatScreen(chat: store.chat, context: { store.assistantContext })
        case .phases:
            PhasesScreen()
        }
    }

    private var timelineNote: String? {
        if let error = store.timelineLoadError { return "timeline fixture failed to load: \(error)" }
        guard let timeline = store.timeline else { return nil }
        return "FIXTURE · \(TimelineFixture.provenanceNote) recorded \(timeline.recordedAt.rawValue) — planned spans are illustrative until the daemon has a milestones schema. Live attempt marks are overlaid where the daemon knows the project."
    }
}

// MARK: - PhasesScreen (honest placeholder)

public struct PhasesScreen: View {
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            Text("Phases").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
            VStack(alignment: .leading, spacing: HUDTheme.space.s) {
                HStack(spacing: HUDTheme.space.xs) {
                    HUDLabel("planned")
                    ProvenanceBadge(.notYetSourced, compact: true)
                }
                Text("The phase editor and presets arrive with the studio service (phase 2) and the planner (phase 4). Nothing here is connected yet, so nothing is drawn as if it were.")
                    .font(HUDTypography.body).foregroundStyle(HUDTheme.soft)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Phase { id, name, purpose, mode: solo | panel | debate | chat, cast, rules { standard[] enforced · yours[] prompted }, inputs[], outputs[], gates: [schema_valid, independent_grade, human?], budget }")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(HUDTheme.space.m)
            .frame(maxWidth: 640, alignment: .leading)
            .overlay(
                Rectangle().stroke(HUDTheme.arc.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            )
            Spacer()
        }
        .padding(HUDTheme.space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

#Preview("Phases placeholder") {
    PhasesScreen().frame(width: 900, height: 500).background(HUDTheme.void).preferredColorScheme(.dark)
}
