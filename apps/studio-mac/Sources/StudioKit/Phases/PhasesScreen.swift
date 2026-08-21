import SwiftUI

// MARK: - PhasesScreen
//
// The Stages tab (Architecture decision 15). Top strip: a preset picker menu (`preset.list`) plus a
// "New preset" button, then the horizontal `PhaseChainView` for the selected preset's ordered stages
// — "+" buttons between nodes insert a new stage at that position. Below: the detail editor
// (`PhaseEditorView`, extended in Wave 9c with prompt/topicScope/turnPolicy/tokenBudget and the
// catalog-fed provider picker) for whichever stage is selected — including a not-yet-saved new-stage
// placeholder, which the model resolves the same way an already-durable phase is. Right: recent runs
// (`phase.list`) with grader verdict, output paths, and (Wave 9c) a mono token-usage readout —
// `PhaseRun.tokenUsage.totalTokens` was decoded since Wave 7 but never rendered until now.

public struct PhasesScreen: View {
    public var presets: [PhasePreset]
    public var isLoadingPresets: Bool
    public var presetsError: String?
    public var selectedPresetId: PhasePresetId?
    public var selectedPhaseId: PhaseId?
    /// Resolved by `PhasesModel.selectedPhase` — the durable phase named by `selectedPhaseId`, OR the
    /// in-flight new-stage placeholder when that id names one instead. The screen stays a pure-value
    /// view (never re-derives this itself) because only the model knows about the placeholder.
    public var selectedPhase: PhaseDefinition?
    /// Non-nil exactly when `selectedPhase` is the not-yet-saved placeholder — the position Save
    /// should insert it at.
    public var selectedPhaseInsertIndex: Int?
    public var knownProjects: [(id: ProjectID, name: String)]
    /// Instance keys from `room.participants.list roomProviderKey` / `provider.list` — feeds the
    /// editor's cast provider pickers (Architecture decision 8).
    public var providerCatalogKeys: [String]
    public var activeRuns: [PhaseId: PhaseRun]
    public var isSaving: Bool
    public var saveError: String?
    public var runLaunchError: String?
    public var decisionError: String?
    public var recentRuns: [PhaseRun]
    public var isLoadingRuns: Bool
    public var runsError: String?
    public var isCreatingPreset: Bool
    public var createPresetError: String?

    public var onAppear: () async -> Void
    public var onSelectPreset: (PhasePresetId) -> Void
    public var onSelectPhase: (PhaseId) -> Void
    public var onInsertPhase: (Int) -> Void
    public var onSave: (PhaseDefinitionDraft, Int?) async -> Void
    public var onRun: (PhaseDefinition, ProjectID) async -> Void
    public var onApprove: (PhaseRun, String?) async -> Void
    public var onReject: (PhaseRun, String) async -> Void
    public var onMoveLeft: (PhaseId) async -> Void
    public var onMoveRight: (PhaseId) async -> Void
    public var onCreatePreset: (String, [ProjectKind]?) async -> Bool

    @State private var showingCreatePreset = false

    public init(presets: [PhasePreset], isLoadingPresets: Bool, presetsError: String?, selectedPresetId: PhasePresetId?,
               selectedPhaseId: PhaseId?, selectedPhase: PhaseDefinition?, selectedPhaseInsertIndex: Int?,
               knownProjects: [(id: ProjectID, name: String)], providerCatalogKeys: [String],
               activeRuns: [PhaseId: PhaseRun], isSaving: Bool, saveError: String?, runLaunchError: String?,
               decisionError: String?, recentRuns: [PhaseRun], isLoadingRuns: Bool, runsError: String?,
               isCreatingPreset: Bool, createPresetError: String?,
               onAppear: @escaping () async -> Void, onSelectPreset: @escaping (PhasePresetId) -> Void,
               onSelectPhase: @escaping (PhaseId) -> Void, onInsertPhase: @escaping (Int) -> Void,
               onSave: @escaping (PhaseDefinitionDraft, Int?) async -> Void,
               onRun: @escaping (PhaseDefinition, ProjectID) async -> Void,
               onApprove: @escaping (PhaseRun, String?) async -> Void, onReject: @escaping (PhaseRun, String) async -> Void,
               onMoveLeft: @escaping (PhaseId) async -> Void, onMoveRight: @escaping (PhaseId) async -> Void,
               onCreatePreset: @escaping (String, [ProjectKind]?) async -> Bool) {
        self.presets = presets
        self.isLoadingPresets = isLoadingPresets
        self.presetsError = presetsError
        self.selectedPresetId = selectedPresetId
        self.selectedPhaseId = selectedPhaseId
        self.selectedPhase = selectedPhase
        self.selectedPhaseInsertIndex = selectedPhaseInsertIndex
        self.knownProjects = knownProjects
        self.providerCatalogKeys = providerCatalogKeys
        self.activeRuns = activeRuns
        self.isSaving = isSaving
        self.saveError = saveError
        self.runLaunchError = runLaunchError
        self.decisionError = decisionError
        self.recentRuns = recentRuns
        self.isLoadingRuns = isLoadingRuns
        self.runsError = runsError
        self.isCreatingPreset = isCreatingPreset
        self.createPresetError = createPresetError
        self.onAppear = onAppear
        self.onSelectPreset = onSelectPreset
        self.onSelectPhase = onSelectPhase
        self.onInsertPhase = onInsertPhase
        self.onSave = onSave
        self.onRun = onRun
        self.onApprove = onApprove
        self.onReject = onReject
        self.onMoveLeft = onMoveLeft
        self.onMoveRight = onMoveRight
        self.onCreatePreset = onCreatePreset
    }

    private var selectedPreset: PhasePreset? { presets.first { $0.presetId == selectedPresetId } }

    /// The durable index of `selectedPhaseId` within the selected preset's ordered `phases[]` — `nil`
    /// for the not-yet-saved placeholder (which isn't in that array yet) or when nothing is selected.
    private var selectedPhaseIndex: Int? {
        guard let selectedPhaseId else { return nil }
        return selectedPreset?.phases.firstIndex { $0.phaseId == selectedPhaseId }
    }

    public var body: some View {
        VStack(spacing: 0) {
            topStrip
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            HStack(spacing: 0) {
                centerColumn
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Rectangle().fill(HUDTheme.hairline).frame(width: 1)
                runsColumn
                    .frame(width: 300)
                    .background(HUDTheme.hull)
            }
        }
        .background(HUDTheme.void)
        .task { await onAppear() }
        .sheet(isPresented: $showingCreatePreset) {
            CreatePresetSheet(isCreating: isCreatingPreset, error: createPresetError,
                              onCreate: { name, appliesTo in await onCreatePreset(name, appliesTo) },
                              onDone: { showingCreatePreset = false })
        }
    }

    // MARK: Top strip — preset picker + stage chain

    private var topStrip: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.s) {
                HUDLabel("preset")
                presetPicker
                ProvenanceBadge(.live("preset.list"), compact: true)
                if isLoadingPresets, presets.isEmpty { ProgressView().controlSize(.small) }
                Spacer()
                HUDButton("New preset", systemImage: "plus", variant: .ghost, compact: true) {
                    showingCreatePreset = true
                }
            }
            .padding(.horizontal, HUDTheme.space.m)
            .padding(.top, HUDTheme.space.s)
            if let presetsError { Text(presetsError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).padding(.horizontal, HUDTheme.space.m) }
            PhaseChainView(phases: selectedPreset?.phases ?? [], selectedPhaseId: selectedPhaseId, activeRuns: activeRuns,
                           onSelect: onSelectPhase, onInsert: onInsertPhase)
        }
        .background(HUDTheme.hull)
    }

    private var presetPicker: some View {
        Menu {
            ForEach(presets) { preset in
                Button(preset.name) { onSelectPreset(preset.presetId) }
            }
            if presets.isEmpty { Text("No presets yet.") }
        } label: {
            HStack(spacing: 4) {
                Text(selectedPreset?.name ?? "Choose a preset").font(HUDTypography.displaySubheading)
                    .foregroundStyle(HUDTheme.ink)
                Image(systemName: "chevron.down").font(.system(size: 9)).foregroundStyle(HUDTheme.mute)
            }
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
    }

    // MARK: Center — editor

    @ViewBuilder
    private var centerColumn: some View {
        if let phase = selectedPhase, let presetId = selectedPresetId {
            PhaseEditorView(phase: phase, presetId: presetId, knownProjects: knownProjects,
                            providerCatalogKeys: providerCatalogKeys, activeRun: activeRuns[phase.phaseId],
                            isSaving: isSaving, saveError: saveError, runLaunchError: runLaunchError,
                            decisionError: decisionError,
                            canMoveLeft: (selectedPhaseIndex ?? 0) > 0,
                            canMoveRight: selectedPhaseIndex.map { $0 < (selectedPreset?.phases.count ?? 1) - 1 } ?? false,
                            onSave: { draft in await onSave(draft, selectedPhaseInsertIndex) },
                            onRun: { projectId in await onRun(phase, projectId) },
                            onApprove: { reason in if let run = activeRuns[phase.phaseId] { await onApprove(run, reason) } },
                            onReject: { reason in if let run = activeRuns[phase.phaseId] { await onReject(run, reason) } },
                            onMoveLeft: { await onMoveLeft(phase.phaseId) },
                            onMoveRight: { await onMoveRight(phase.phaseId) })
        } else {
            VStack(spacing: HUDTheme.space.s) {
                Spacer()
                Text(presets.isEmpty ? "Create a preset to get started" : "Select a stage").font(HUDTypography.body).foregroundStyle(HUDTheme.mute)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: Right — recent runs

    private var runsColumn: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.s) {
                HStack {
                    HUDLabel("recent runs")
                    ProvenanceBadge(.live("phase.list"), compact: true)
                }
                if isLoadingRuns, recentRuns.isEmpty { ProgressView().controlSize(.small) }
                if let runsError { Text(runsError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert) }
                if recentRuns.isEmpty, !isLoadingRuns {
                    Text("No runs yet.").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                }
                ForEach(recentRuns) { run in
                    runCard(run)
                }
            }
            .padding(HUDTheme.space.m)
        }
    }

    private func runCard(_ run: PhaseRun) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HStack {
                Text(run.phaseId.rawValue).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                Spacer()
                phaseRunStatusPill(for: run.state)
            }
            if let verdict = run.graderVerdict {
                HStack(spacing: 3) {
                    HUDLabel("grader")
                    Text(verdict.verdict.rawValue).font(HUDTypography.caption)
                        .foregroundStyle(verdict.verdict == .pass ? HUDTheme.ok : HUDTheme.alert)
                }
            }
            HStack(spacing: 3) {
                HUDLabel("tokens")
                Text("\(run.tokenUsage.totalTokens)").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.soft)
            }
            ForEach(run.outputs) { output in
                Text(output.path.rawValue).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft).lineLimit(1)
            }
        }
        .padding(HUDTheme.space.s)
        .hudPanel(role: run.isAwaitingHuman ? .human : .neutral)
    }

}

// MARK: - CreatePresetSheet

/// The "New preset" toolbar sheet: name + optional `appliesTo` scoping, `preset.upsert(expectedRevision:
/// nil)` on submit (`PhasesModel.createPreset` also seeds the required starter stage — the wire schema
/// requires `phases.min(1)`, so a brand-new preset never exists with zero stages even momentarily).
public struct CreatePresetSheet: View {
    public var isCreating: Bool
    public var error: String?
    public var onCreate: (String, [ProjectKind]?) async -> Bool
    public var onDone: () -> Void

    @State private var name = ""
    @State private var scoped = false
    @State private var appliesTo: Set<ProjectKind> = []

    public init(isCreating: Bool, error: String?, onCreate: @escaping (String, [ProjectKind]?) async -> Bool, onDone: @escaping () -> Void) {
        self.isCreating = isCreating
        self.error = error
        self.onCreate = onCreate
        self.onDone = onDone
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isValid: Bool { !trimmedName.isEmpty }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("new preset")
            TextField("Preset name", text: $name).textFieldStyle(.roundedBorder)
            Toggle("Scope to specific project kinds", isOn: $scoped).toggleStyle(.checkbox)
            if scoped {
                HStack(spacing: HUDTheme.space.xs) {
                    ForEach(ProjectKind.allCases, id: \.self) { kind in
                        Toggle(kind.rawValue, isOn: Binding(
                            get: { appliesTo.contains(kind) },
                            set: { if $0 { appliesTo.insert(kind) } else { appliesTo.remove(kind) } }))
                            .toggleStyle(.checkbox)
                    }
                }
            }
            if let error { Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert) }
            HStack {
                HUDButton("Cancel", variant: .ghost) { onDone() }
                Spacer()
                if isCreating { ProgressView().controlSize(.small) }
                HUDButton(isCreating ? "Creating…" : "Create", variant: .gold) {
                    Task {
                        let succeeded = await onCreate(trimmedName, scoped && !appliesTo.isEmpty ? Array(appliesTo) : nil)
                        if succeeded { onDone() }
                    }
                }.disabled(!isValid || isCreating)
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 380)
        .background(HUDTheme.plate)
    }
}
