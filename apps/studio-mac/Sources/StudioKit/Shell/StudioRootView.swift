import SwiftUI

// MARK: - StudioRootView
//
// The window (Architecture decision 13): a left `NavRail` (chat/stages/dashboard/settings) beside a
// column of {title bar, selected screen}, with the corner chat floating bottom-right on every
// non-chat screen. Reads everything from `StudioStore` in the environment. Chat is the default
// landing tab — the pivot this wave makes: Studio used to open on the dashboard.

public struct StudioRootView: View {
    @Environment(StudioStore.self) private var store
    /// The shell's own persistence — exactly three keys (Architecture decision 13), nothing
    /// wire-derived. Falls back to `.chat` for any stored value that doesn't match a current
    /// `StudioTab` case (including the pre-Wave-8 `"phases"`/`"dashboard"` scheme).
    @AppStorage("studio.selectedTab") private var tab: StudioTab = .chat
    /// The conversation/room restore-on-relaunch flow (Wave 9b): written on every selection change,
    /// read back once the first `room.list` lands (`restoreLastSelectedRoomIfNeeded`) — only when the
    /// stored id still names a room the daemon actually returned, never a blind `select()`.
    @AppStorage("studio.lastSelectedRoomId") private var lastSelectedRoomId: String?
    @State private var didRestoreLastSelectedRoom = false
    /// Reserved for Wave 9d's `AnalyticsPanel` 7D/30D range picker; same status as
    /// `lastSelectedRoomId` above.
    @AppStorage("studio.analyticsRange") private var analyticsRange: String = "7d"
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
    @State private var showingAddProvider = false
    @State private var credentialSheetProvider: ProviderInstance?

    /// Phase 1: the budget gauge is a static placeholder and says so.
    public static let staticBudget = Sourced(0.38, .staticValue("phase 1 placeholder"))

    public init() {}

    /// Rooms are visible exactly when the corner panel is open or the full chat tab is showing —
    /// this is the single "poll while visible, stop when hidden" decision; `RoomsModel` itself does
    /// not know which screen is on top. Chat is the default tab as of this wave, so rooms poll from
    /// the very first frame unless the human has since switched away.
    private var roomsVisible: Bool { tab == .chat || !chatMinimized }

    public var body: some View {
        HStack(spacing: 0) {
            NavRail(tab: $tab)
            VStack(spacing: 0) {
                StudioTitleBar(link: store.link, budget: Self.staticBudget, lastRefreshAt: store.lastRefreshAt) {
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
                            CornerChatView(chat: store.chat, rooms: roomsModel, conversations: conversationsModel,
                                           backend: assistantBackend, onNewRoom: { showingNewRoom = true },
                                           minimized: $chatMinimized, onExpand: { tab = .chat },
                                           onPlanReady: { plan in store.planner.adopt(plan); showingPlanner = true })
                            .padding(HUDTheme.space.l)
                        }
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
        .sheet(isPresented: $showingAddProvider) {
            AddProviderSheet(
                onUpsert: { spec in await store.settings.upsertProvider(spec) },
                onSetCredential: { key, secret in await store.settings.setCredential(key, secret: secret) },
                onDone: { _ in showingAddProvider = false })
        }
        .sheet(item: $credentialSheetProvider) { instance in
            SetProviderCredentialSheet(
                providerKey: instance.key, displayName: instance.displayName,
                onSubmit: { secret in await store.settings.setCredential(instance.key, secret: secret) },
                onDone: { _ in credentialSheetProvider = nil })
        }
        .task {
            updateRoomsVisibility()
            await store.phases.loadPresetsIfNeeded()
        }
        .onChange(of: tab) { _, _ in updateRoomsVisibility() }
        .onChange(of: chatMinimized) { _, _ in updateRoomsVisibility() }
        .onChange(of: store.rooms.rooms) { _, rooms in restoreLastSelectedRoomIfNeeded(rooms) }
        .onChange(of: store.rooms.selectedRoomId) { _, newValue in lastSelectedRoomId = newValue?.rawValue }
    }

    /// `nil` until the store has a client at all, mirroring `assistantBackend` below — rooms need a
    /// daemon exactly like the assistant backend does.
    private var roomsModel: RoomsModel? { store.socketPath != nil ? store.rooms : nil }
    private var conversationsModel: ConversationsModel? { store.socketPath != nil ? store.conversations : nil }

    private func updateRoomsVisibility() {
        if roomsVisible { store.rooms.resumePollingSelected() } else { store.rooms.stopPolling() }
    }

    /// Restores `studio.lastSelectedRoomId` exactly once, and only once `room.list` has actually
    /// returned something naming it — never a blind `select()` on a possibly-stale/archived/deleted
    /// id. A no-op once it has run, or if nothing was ever stored, or the stored id no longer names a
    /// room the daemon returned.
    private func restoreLastSelectedRoomIfNeeded(_ rooms: [Room]) {
        guard !didRestoreLastSelectedRoom, !rooms.isEmpty else { return }
        didRestoreLastSelectedRoom = true
        guard let raw = lastSelectedRoomId, let id = try? RoomID(raw), rooms.contains(where: { $0.roomId == id }) else { return }
        store.rooms.select(id)
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
            ChatScreen(chat: store.chat, rooms: roomsModel, conversations: conversationsModel, backend: assistantBackend,
                      onNewRoom: { showingNewRoom = true }, onOpenSettings: { tab = .settings },
                      onPlanReady: { plan in store.planner.adopt(plan); showingPlanner = true })
        case .settings:
            SettingsScreen(
                providers: store.settings.providers, health: store.settings.health,
                defaultProviderKey: store.settings.defaultProviderKey,
                isLoadingProviders: store.settings.isLoadingProviders, isLoadingHealth: store.settings.isLoadingHealth,
                providersError: store.settings.providersError, healthError: store.settings.healthError,
                defaultError: store.settings.defaultError,
                busyKeys: store.settings.busyKeys, rowErrors: store.settings.rowErrors,
                onAppear: { await store.settings.load() },
                onRefreshHealth: { Task { await store.settings.loadHealth() } },
                onMakeDefault: { key in Task { await store.settings.makeDefault(key) } },
                onRemove: { key in Task { await store.settings.removeProvider(key) } },
                onAddProvider: { showingAddProvider = true },
                onSetCredential: { key in
                    if let instance = store.settings.providers.first(where: { $0.key == key }) {
                        credentialSheetProvider = instance
                    }
                })
        case .stages:
            PhasesScreen(
                presets: store.phases.presets, isLoadingPresets: store.phases.isLoadingPresets,
                presetsError: store.phases.presetsError, selectedPresetId: store.phases.selectedPresetId,
                selectedPhaseId: store.phases.selectedPhaseId, selectedPhase: store.phases.selectedPhase,
                selectedPhaseInsertIndex: store.phases.selectedPhaseInsertIndex, knownProjects: store.knownProjects,
                providerCatalogKeys: store.providerCatalogKeys,
                activeRuns: store.phases.activeRuns, isSaving: store.phases.isSaving, saveError: store.phases.saveError,
                runLaunchError: store.phases.runLaunchError, decisionError: store.phases.decisionError,
                recentRuns: store.phases.recentRuns, isLoadingRuns: store.phases.isLoadingRuns,
                runsError: store.phases.runsError,
                isCreatingPreset: store.phases.isCreatingPreset, createPresetError: store.phases.createPresetError,
                onAppear: {
                    await store.phases.loadPresetsIfNeeded()
                    await store.phases.loadRecentRuns()
                    if store.rooms.participantsCatalog == nil { await store.rooms.loadParticipantsCatalog() }
                    if store.settings.providers.isEmpty { await store.settings.loadProviders() }
                },
                onSelectPreset: { store.phases.selectPreset($0) },
                onSelectPhase: { store.phases.selectPhase($0) },
                onInsertPhase: { index in store.phases.startNewPhase(insertAt: index) },
                onSave: { draft, insertIndex in await store.phases.savePhase(draft, insertAt: insertIndex) },
                onRun: { phase, projectId in
                    await store.phases.runPhase(phase, presetId: store.phases.selectedPresetId, projectId: projectId)
                },
                onApprove: { run, reason in await store.phases.approveRun(run, reason: reason) },
                onReject: { run, reason in await store.phases.rejectRun(run, reason: reason) },
                onMoveLeft: { phaseId in await store.phases.movePhaseLeft(phaseId) },
                onMoveRight: { phaseId in await store.phases.movePhaseRight(phaseId) },
                onCreatePreset: { name, appliesTo in await store.phases.createPreset(name: name, appliesTo: appliesTo) })
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

