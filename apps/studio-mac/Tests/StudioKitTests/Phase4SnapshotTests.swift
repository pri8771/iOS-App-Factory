import AppKit
import SnapshotTesting
@testable import StudioKit
import SwiftUI
import XCTest

/// Reference images for the Studio Phase 4 UI (PHASES tab, phase editor, run status strip, the
/// planner punch list, the seed sheet) in both appearances — mirrors `DashboardSnapshotTests`' own
/// discipline, built from the same recorded fixtures `Phase4ModelDecodingTests` already pins.
@MainActor
final class Phase4SnapshotTests: XCTestCase {

    private func decode(_ fixture: String) -> CommandResponse {
        try! JSONDecoder().decode(CommandResponse.self, from: try! Fixtures.data(fixture))
    }

    private var presets: [PhasePreset] {
        guard case .success(_, .presetList(let presets)) = decode("preset-list.response.json") else { fatalError() }
        return presets
    }

    private var recentRuns: [PhaseRun] {
        guard case .success(_, .phaseList(let page)) = decode("phase-list.response.json") else { fatalError() }
        return page.runs
    }

    private var awaitingRun: PhaseRun {
        guard case .success(_, .phaseStatus(let run)) = decode("phase-status.response.json") else { fatalError() }
        return run
    }

    private var punchListPlan: ProjectPlan {
        guard case .success(_, .planStatus(let plan)) = decode("plan-status.response.json") else { fatalError() }
        return plan
    }

    private let knownProjects: [(id: ProjectID, name: String)] = [
        (ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"), "Anjali — Journal"),
    ]

    // MARK: PHASES tab — preset selected

    func testPhasesScreenPresetSelected() {
        let preset = presets[0]
        let screen = PhasesScreen(
            presets: presets, isLoadingPresets: false, presetsError: nil, selectedPresetId: preset.presetId,
            selectedPhaseId: preset.phases[1].phaseId /* architecture: debate + grader */, knownProjects: knownProjects,
            activeRuns: [preset.phases[2].phaseId: awaitingRun], isSaving: false, saveError: nil, runLaunchError: nil,
            decisionError: nil, recentRuns: recentRuns, isLoadingRuns: false, runsError: nil,
            onAppear: {}, onSelectPreset: { _ in }, onSelectPhase: { _ in }, onSave: { _ in }, onRun: { _, _ in },
            onApprove: { _, _ in }, onReject: { _, _ in })
        assertHUD(screen, size: CGSize(width: 1180, height: 640), named: "phases-screen")
    }

    // MARK: Phase editor — a debate phase with a grader, standard + yours rules, gates

    func testPhaseEditor() {
        let phase = presets[0].phases[1] // architecture: debate, grader, two standard rules
        let editor = PhaseEditorView(phase: phase, presetId: presets[0].presetId, knownProjects: knownProjects,
                                     activeRun: nil, isSaving: false, saveError: nil, runLaunchError: nil,
                                     decisionError: nil, onSave: { _ in }, onRun: { _ in }, onApprove: { _ in },
                                     onReject: { _ in })
            .background(HUDTheme.void)
        assertHUD(editor, size: CGSize(width: 760, height: 900), named: "phase-editor")
    }

    // MARK: Run status strip — awaiting-human

    func testPhaseEditorRunStripAwaitingHuman() {
        struct Host: View {
            var run: PhaseRun
            @State var reason = ""
            var body: some View {
                PhaseRunStatusStrip(run: run, decisionError: nil, rejectReason: $reason, onApprove: { _ in }, onReject: { _ in })
                    .padding(HUDTheme.space.l)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .background(HUDTheme.void)
            }
        }
        assertHUD(Host(run: awaitingRun), size: CGSize(width: 760, height: 220), named: "phase-editor-run-awaiting-human")
    }

    // MARK: Planner punch list — a deferred item and a gate

    func testPlannerPunchListWithDeferredItemAndGate() {
        let screen = PlannerScreen(plan: punchListPlan, isSavingEdit: false, isApproving: false, isExecuting: false,
                                   error: nil, onBack: {}, onReorder: { _ in }, onDefer: { _ in }, onApprove: {},
                                   onExecute: {}, onApproveGate: { _ in })
        assertHUD(screen, size: CGSize(width: 900, height: 700), named: "planner-punch-list")
    }

    // MARK: Seed new project sheet

    func testSeedProjectSheet() {
        let sheet = SeedProjectSheet(presets: presets, isSeeding: false, seedError: nil,
                                     onSeed: { _, _ in nil }, onProposePlan: { _, _ in nil }, onDone: { _ in })
        let framed = ZStack { HUDTheme.void; sheet }.frame(maxWidth: .infinity, maxHeight: .infinity)
        assertHUD(framed, size: CGSize(width: 460, height: 560), named: "seed-project-sheet")
    }
}
