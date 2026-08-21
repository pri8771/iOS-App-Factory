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

    private let providerCatalogKeys = ["claude", "codex", "cursor", "openrouter-fast"]

    func testPhasesScreenPresetSelected() {
        let preset = presets[0]
        let screen = PhasesScreen(
            presets: presets, isLoadingPresets: false, presetsError: nil, selectedPresetId: preset.presetId,
            selectedPhaseId: preset.phases[1].phaseId /* architecture: debate + grader */,
            selectedPhase: preset.phases[1], selectedPhaseInsertIndex: nil, knownProjects: knownProjects,
            providerCatalogKeys: providerCatalogKeys,
            activeRuns: [preset.phases[2].phaseId: awaitingRun], isSaving: false, saveError: nil, runLaunchError: nil,
            decisionError: nil, recentRuns: recentRuns, isLoadingRuns: false, runsError: nil,
            isCreatingPreset: false, createPresetError: nil,
            onAppear: {}, onSelectPreset: { _ in }, onSelectPhase: { _ in }, onInsertPhase: { _ in },
            onSave: { _, _ in }, onRun: { _, _ in }, onApprove: { _, _ in }, onReject: { _, _ in },
            onMoveLeft: { _ in }, onMoveRight: { _ in }, onCreatePreset: { _, _ in true })
        assertHUD(screen, size: CGSize(width: 1180, height: 640), named: "phases-screen")
    }

    // MARK: Stage chain — selected/gated/run-badge variants

    func testPhaseChainView() {
        let preset = presets[0]
        let chain = PhaseChainView(phases: preset.phases, selectedPhaseId: preset.phases[1].phaseId,
                                   activeRuns: [preset.phases[2].phaseId: awaitingRun, preset.phases[3].phaseId: recentRuns[1]],
                                   onSelect: { _ in }, onInsert: { _ in })
            .frame(height: 100)
            .background(HUDTheme.void)
        assertHUD(chain, size: CGSize(width: 900, height: 100), named: "phase-chain-view")
    }

    func testPhaseChainViewEmpty() {
        let chain = PhaseChainView(phases: [], selectedPhaseId: nil, activeRuns: [:], onSelect: { _ in }, onInsert: { _ in })
            .frame(height: 100)
            .background(HUDTheme.void)
        assertHUD(chain, size: CGSize(width: 500, height: 100), named: "phase-chain-view-empty")
    }

    // MARK: Phase editor — a debate phase with a grader, standard + yours rules, gates, and the new
    // Wave 9c fields (prompt/topicScope/turnPolicy/tokenBudget) populated

    func testPhaseEditor() {
        let phase = presets[0].phases[1] // architecture: debate, grader, two standard rules, non-null prompt/topicScope/turnPolicy/tokenBudget
        let editor = PhaseEditorView(phase: phase, presetId: presets[0].presetId, knownProjects: knownProjects,
                                     providerCatalogKeys: providerCatalogKeys, activeRun: nil, isSaving: false,
                                     saveError: nil, runLaunchError: nil, decisionError: nil,
                                     canMoveLeft: true, canMoveRight: true,
                                     onSave: { _ in }, onRun: { _ in }, onApprove: { _ in }, onReject: { _ in },
                                     onMoveLeft: {}, onMoveRight: {})
            .background(HUDTheme.void)
        assertHUD(editor, size: CGSize(width: 760, height: 1_040), named: "phase-editor")
    }

    /// The catalog-empty fallback: a free-text provider field badged NOT YET SOURCED, and the daemon's
    /// default-turnPolicy/no-tokenBudget honest placeholders ("default (6)"/"unbounded").
    func testPhaseEditorNoCatalog() {
        let phase = presets[0].phases[0] // contract: solo, one participant, every Wave 9c field null
        let editor = PhaseEditorView(phase: phase, presetId: presets[0].presetId, knownProjects: knownProjects,
                                     providerCatalogKeys: [], activeRun: nil, isSaving: false, saveError: nil,
                                     runLaunchError: nil, decisionError: nil, onSave: { _ in }, onRun: { _ in },
                                     onApprove: { _ in }, onReject: { _ in })
            .background(HUDTheme.void)
        assertHUD(editor, size: CGSize(width: 760, height: 1_040), named: "phase-editor-no-catalog")
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
                                     onSeed: { _, _ in nil }, onProposePlan: { _, _, _, _ in nil }, onDone: { _ in })
        let framed = ZStack { HUDTheme.void; sheet }.frame(maxWidth: .infinity, maxHeight: .infinity)
        assertHUD(framed, size: CGSize(width: 460, height: 560), named: "seed-project-sheet")
    }
}
