import SwiftUI

// MARK: - PhasesScreen
//
// Left: presets (`preset.list`) — the seeded `ios-app-standard-0.4.0` shows its ordered phases with a
// mode/cast summary ("1 model", "2 models · panel", "◆ gate · you"). Center: the editor for the
// selected phase. Right: recent runs (`phase.list`) with grader verdict + output paths.

public struct PhasesScreen: View {
    public var presets: [PhasePreset]
    public var isLoadingPresets: Bool
    public var presetsError: String?
    public var selectedPresetId: PhasePresetId?
    public var selectedPhaseId: PhaseId?
    public var knownProjects: [(id: ProjectID, name: String)]
    public var activeRuns: [PhaseId: PhaseRun]
    public var isSaving: Bool
    public var saveError: String?
    public var runLaunchError: String?
    public var decisionError: String?
    public var recentRuns: [PhaseRun]
    public var isLoadingRuns: Bool
    public var runsError: String?

    public var onAppear: () async -> Void
    public var onSelectPreset: (PhasePresetId) -> Void
    public var onSelectPhase: (PhaseId) -> Void
    public var onSave: (PhaseDefinitionDraft) async -> Void
    public var onRun: (PhaseDefinition, ProjectID) async -> Void
    public var onApprove: (PhaseRun, String?) async -> Void
    public var onReject: (PhaseRun, String) async -> Void

    public init(presets: [PhasePreset], isLoadingPresets: Bool, presetsError: String?, selectedPresetId: PhasePresetId?,
               selectedPhaseId: PhaseId?, knownProjects: [(id: ProjectID, name: String)],
               activeRuns: [PhaseId: PhaseRun], isSaving: Bool, saveError: String?, runLaunchError: String?,
               decisionError: String?, recentRuns: [PhaseRun], isLoadingRuns: Bool, runsError: String?,
               onAppear: @escaping () async -> Void, onSelectPreset: @escaping (PhasePresetId) -> Void,
               onSelectPhase: @escaping (PhaseId) -> Void, onSave: @escaping (PhaseDefinitionDraft) async -> Void,
               onRun: @escaping (PhaseDefinition, ProjectID) async -> Void,
               onApprove: @escaping (PhaseRun, String?) async -> Void, onReject: @escaping (PhaseRun, String) async -> Void) {
        self.presets = presets
        self.isLoadingPresets = isLoadingPresets
        self.presetsError = presetsError
        self.selectedPresetId = selectedPresetId
        self.selectedPhaseId = selectedPhaseId
        self.knownProjects = knownProjects
        self.activeRuns = activeRuns
        self.isSaving = isSaving
        self.saveError = saveError
        self.runLaunchError = runLaunchError
        self.decisionError = decisionError
        self.recentRuns = recentRuns
        self.isLoadingRuns = isLoadingRuns
        self.runsError = runsError
        self.onAppear = onAppear
        self.onSelectPreset = onSelectPreset
        self.onSelectPhase = onSelectPhase
        self.onSave = onSave
        self.onRun = onRun
        self.onApprove = onApprove
        self.onReject = onReject
    }

    private var selectedPreset: PhasePreset? { presets.first { $0.presetId == selectedPresetId } }
    private var selectedPhase: PhaseDefinition? { selectedPreset?.phases.first { $0.phaseId == selectedPhaseId } }

    public var body: some View {
        HStack(spacing: 0) {
            presetsColumn
                .frame(width: 260)
                .background(HUDTheme.hull)
            Rectangle().fill(HUDTheme.hairline).frame(width: 1)
            centerColumn
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Rectangle().fill(HUDTheme.hairline).frame(width: 1)
            runsColumn
                .frame(width: 300)
                .background(HUDTheme.hull)
        }
        .background(HUDTheme.void)
        .task { await onAppear() }
    }

    // MARK: Left — presets

    private var presetsColumn: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.s) {
                HStack {
                    HUDLabel("presets")
                    ProvenanceBadge(.live("preset.list"), compact: true)
                }
                if isLoadingPresets, presets.isEmpty { ProgressView().controlSize(.small) }
                if let presetsError { Text(presetsError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert) }
                ForEach(presets) { preset in
                    presetRow(preset)
                }
                if presets.isEmpty, !isLoadingPresets {
                    Text("No presets yet.").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                }
            }
            .padding(HUDTheme.space.m)
        }
    }

    private func presetRow(_ preset: PhasePreset) -> some View {
        let isSelected = preset.presetId == selectedPresetId
        return VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            Button { onSelectPreset(preset.presetId) } label: {
                HStack {
                    Text(preset.name).font(HUDTypography.displaySubheading)
                        .foregroundStyle(isSelected ? HUDTheme.arc : HUDTheme.ink)
                    Spacer()
                }
            }.buttonStyle(.plain)
            if isSelected {
                ForEach(preset.phases) { phase in
                    phaseRow(phase)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func phaseRow(_ phase: PhaseDefinition) -> some View {
        let isSelected = phase.phaseId == selectedPhaseId
        return Button { onSelectPhase(phase.phaseId) } label: {
            HStack(spacing: HUDTheme.space.xs) {
                if !phase.gates.isEmpty {
                    DiamondGate(state: .waiting, size: 8)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(phase.name).font(HUDTypography.body).foregroundStyle(isSelected ? HUDTheme.arc : HUDTheme.ink)
                    Text(phase.castSummary).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                }
                Spacer()
                if let run = activeRuns[phase.phaseId] { runBadge(run) }
            }
            .padding(.leading, HUDTheme.space.m)
            .padding(.vertical, 3)
            .background(isSelected ? HUDTheme.raised : Color.clear)
        }.buttonStyle(.plain)
    }

    private func runBadge(_ run: PhaseRun) -> some View {
        Circle().fill(run.isAwaitingHuman ? HUDTheme.gold : HUDTheme.arc).frame(width: 6, height: 6)
    }

    // MARK: Center — editor

    @ViewBuilder
    private var centerColumn: some View {
        if let phase = selectedPhase, let presetId = selectedPresetId {
            PhaseEditorView(phase: phase, presetId: presetId, knownProjects: knownProjects,
                            activeRun: activeRuns[phase.phaseId], isSaving: isSaving, saveError: saveError,
                            runLaunchError: runLaunchError, decisionError: decisionError,
                            onSave: onSave, onRun: { projectId in await onRun(phase, projectId) },
                            onApprove: { reason in if let run = activeRuns[phase.phaseId] { await onApprove(run, reason) } },
                            onReject: { reason in if let run = activeRuns[phase.phaseId] { await onReject(run, reason) } })
        } else {
            VStack(spacing: HUDTheme.space.s) {
                Spacer()
                Text("Select a phase").font(HUDTypography.body).foregroundStyle(HUDTheme.mute)
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
            ForEach(run.outputs) { output in
                Text(output.path.rawValue).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft).lineLimit(1)
            }
        }
        .padding(HUDTheme.space.s)
        .hudPanel(role: run.isAwaitingHuman ? .human : .neutral)
    }

}
