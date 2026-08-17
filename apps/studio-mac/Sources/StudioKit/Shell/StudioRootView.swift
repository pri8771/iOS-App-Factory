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
    @State private var showingNewRoom = false

    /// Phase 1: the budget gauge is a static placeholder and says so.
    public static let staticBudget = Sourced(0.38, .staticValue("phase 1 placeholder"))

    public init() {}

    /// Rooms are visible exactly when the corner panel is open or the full chat tab is showing —
    /// this is the single "poll while visible, stop when hidden" decision; `RoomsModel` itself does
    /// not know which screen is on top.
    private var roomsVisible: Bool { tab == .chat || !chatMinimized }

    public var body: some View {
        VStack(spacing: 0) {
            StudioTitleBar(tab: $tab, link: store.link, budget: Self.staticBudget, lastRefreshAt: store.lastRefreshAt) {
                Task { await store.connect() }
            }
            ZStack(alignment: .bottomTrailing) {
                screen
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if tab != .chat {
                    CornerChatView(chat: store.chat, context: { store.assistantContext }, backend: assistantBackend,
                                   rooms: roomsModel, onNewRoom: { showingNewRoom = true },
                                   minimized: $chatMinimized) {
                        tab = .chat
                    }
                    .padding(HUDTheme.space.l)
                }
            }
        }
        .background(HUDTheme.void)
        .sheet(isPresented: $showingNewRoom) {
            NewRoomSheet(knownProjects: store.knownProjects, onCreate: { title, projectId, unattended, participants in
                await store.rooms.createRoom(title: title, projectId: projectId, unattendedEnabled: unattended,
                                             participants: participants)
            }, onDone: { room in
                showingNewRoom = false
                if room != nil { tab = .chat }
            })
        }
        .task { updateRoomsVisibility() }
        .onChange(of: tab) { _, _ in updateRoomsVisibility() }
        .onChange(of: chatMinimized) { _, _ in updateRoomsVisibility() }
    }

    /// `nil` until the store has a client at all, mirroring `assistantBackend` below — rooms need a
    /// daemon exactly like the assistant backend does.
    private var roomsModel: RoomsModel? { store.socketPath != nil ? store.rooms : nil }

    private func updateRoomsVisibility() {
        if roomsVisible { store.rooms.resumePollingSelected() } else { store.rooms.stopPolling() }
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .dashboard:
            if let slug = selectedSlug, let project = store.dashboard.project(slug: slug) {
                ProjectDetailView(project: project, runs: store.runs, isConnected: store.isConnected,
                                  loadRun: { id in await store.loadRun(id) },
                                  onBack: { selectedSlug = nil },
                                  milestoneTimeline: project.projectId.flatMap { store.milestoneTimelines[$0] },
                                  milestoneError: project.projectId.flatMap { store.milestoneErrors[$0] },
                                  onLoadMilestones: project.projectId.map { id in { await store.loadMilestones(id) } },
                                  onUpsertMilestone: { draft, revision in await store.upsertMilestone(draft, expectedRevision: revision) })
                    .id(slug)
                    .transition(.opacity)
            } else {
                DashboardScreen(snapshot: store.dashboard, errors: store.errors, timelineNote: timelineNote,
                                selectedSlug: nil, onSelectProject: { selectedSlug = $0 })
                    .transition(.opacity)
            }
        case .chat:
            ChatScreen(chat: store.chat, context: { store.assistantContext }, backend: assistantBackend,
                      rooms: roomsModel, onNewRoom: { showingNewRoom = true })
        case .phases:
            PhasesScreen()
        }
    }

    /// `nil` until the store has a client at all — the phase-1 stub then stays the only assistant.
    private var assistantBackend: (() -> AssistantBackend?)? {
        guard store.socketPath != nil else { return nil }
        return { store.assistantBackend }
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
