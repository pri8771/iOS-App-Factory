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
    /// The Planner is reachable from any tab (a "New project" affordance on the Dashboard, or
    /// confirming a `propose-plan`/`execute-plan` intent card in Chat) — not itself a tab, so it
    /// overlays whichever tab is active, mirroring how `ProjectDetailView` overlays the Dashboard.
    @State private var showingPlanner = false
    @State private var showingSeedSheet = false

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
                if showingPlanner, let plan = store.planner.plan {
                    PlannerScreen(
                        plan: plan, isSavingEdit: store.planner.isSavingEdit, isApproving: store.planner.isApproving,
                        isExecuting: store.planner.isExecuting, error: store.planner.error,
                        onBack: { showingPlanner = false; store.planner.close() },
                        onReorder: { order in await store.planner.reorder(order) },
                        onDefer: { itemId in await store.planner.defer_(itemId) },
                        onApprove: { await store.planner.approve() },
                        onExecute: { await store.planner.execute() },
                        onApproveGate: { itemId in await store.planner.approveGate(itemId) })
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .transition(.opacity)
                } else {
                    screen
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    if tab != .chat {
                        CornerChatView(chat: store.chat, context: { store.assistantContext }, backend: assistantBackend,
                                       rooms: roomsModel, onNewRoom: { showingNewRoom = true },
                                       minimized: $chatMinimized, onExpand: { tab = .chat },
                                       onPlanReady: { plan in store.planner.adopt(plan); showingPlanner = true })
                        .padding(HUDTheme.space.l)
                    }
                }
            }
        }
        .background(HUDTheme.void)
        .sheet(isPresented: $showingNewRoom) {
            NewRoomSheet(knownProjects: store.knownProjects,
                         catalog: store.rooms.participantsCatalog,
                         isLoadingCatalog: store.rooms.isLoadingParticipantsCatalog,
                         catalogError: store.rooms.participantsCatalogError,
                         onLoadCatalog: { await store.rooms.loadParticipantsCatalog() },
                         onCreate: { title, projectId, unattended, participants in
                await store.rooms.createRoom(title: title, projectId: projectId, unattendedEnabled: unattended,
                                             participants: participants)
            }, onDone: { room in
                showingNewRoom = false
                if room != nil { tab = .chat }
            })
        }
        .sheet(isPresented: $showingSeedSheet) {
            SeedProjectSheet(
                presets: store.phases.presets, isSeeding: store.planner.isSeeding, seedError: store.planner.seedError,
                onSeed: { directory, name in await store.planner.seedProject(targetDirectory: directory, name: name) },
                onProposePlan: { brief, presetId, projectId, repositoryId in
                    await store.planner.propose(brief: brief, presetId: presetId, projectId: projectId, repositoryId: repositoryId)
                },
                onDone: { plan in
                    showingSeedSheet = false
                    if plan != nil { showingPlanner = true }
                })
        }
        .task {
            updateRoomsVisibility()
            await store.phases.loadPresetsIfNeeded()
        }
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
                                selectedSlug: nil, onSelectProject: { selectedSlug = $0 },
                                onNewProject: store.socketPath != nil ? { showingSeedSheet = true } : nil,
                                release: store.socketPath != nil ? store.releaseRail : nil,
                                onObserveRelease: store.socketPath != nil ? { Task { await store.observeRelease() } } : nil)
                    .transition(.opacity)
            }
        case .chat:
            ChatScreen(chat: store.chat, context: { store.assistantContext }, backend: assistantBackend,
                      rooms: roomsModel, onNewRoom: { showingNewRoom = true },
                      onPlanReady: { plan in store.planner.adopt(plan); showingPlanner = true })
        case .phases:
            PhasesScreen(
                presets: store.phases.presets, isLoadingPresets: store.phases.isLoadingPresets,
                presetsError: store.phases.presetsError, selectedPresetId: store.phases.selectedPresetId,
                selectedPhaseId: store.phases.selectedPhaseId, knownProjects: store.knownProjects,
                activeRuns: store.phases.activeRuns, isSaving: store.phases.isSaving, saveError: store.phases.saveError,
                runLaunchError: store.phases.runLaunchError, decisionError: store.phases.decisionError,
                recentRuns: store.phases.recentRuns, isLoadingRuns: store.phases.isLoadingRuns,
                runsError: store.phases.runsError,
                onAppear: {
                    await store.phases.loadPresetsIfNeeded()
                    await store.phases.loadRecentRuns()
                },
                onSelectPreset: { store.phases.selectPreset($0) },
                onSelectPhase: { store.phases.selectedPhaseId = $0 },
                onSave: { draft in await store.phases.savePhase(draft) },
                onRun: { phase, projectId in
                    await store.phases.runPhase(phase, presetId: store.phases.selectedPresetId, projectId: projectId)
                },
                onApprove: { run, reason in await store.phases.approveRun(run, reason: reason) },
                onReject: { run, reason in await store.phases.rejectRun(run, reason: reason) })
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

