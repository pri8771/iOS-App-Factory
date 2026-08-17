import Foundation
import Observation

// MARK: - PhasesModel
//
// The observable state behind the PHASES tab: the preset list (`preset.list`), the selected phase's
// editable draft, saving (`phase.upsert` then `preset.upsert` — a preset embeds full `PhaseDefinition`
// values, so updating one phase's content and then pointing the preset at that new content are two
// separate CAS writes), launching a run (`phase.run`) and polling it (`phase.status`) while it is
// live, and the recent-runs list (`phase.list`). Mirrors `RoomsModel`'s discipline: nothing is
// invented — `nil`/empty until actually read, per-call errors kept rather than swallowed.

@Observable
@MainActor
public final class PhasesModel {

    public private(set) var presets: [PhasePreset] = []
    public private(set) var isLoadingPresets = false
    public private(set) var presetsError: String?

    public var selectedPresetId: PhasePresetId?
    public var selectedPhaseId: PhaseId?

    public private(set) var isSaving = false
    public private(set) var saveError: String?

    /// The most recently launched/polled run, keyed by phase so switching the editor's selection
    /// doesn't lose a different phase's in-flight run.
    public private(set) var activeRuns: [PhaseId: PhaseRun] = [:]
    public private(set) var runLaunchError: String?
    public private(set) var decisionError: String?

    public private(set) var recentRuns: [PhaseRun] = []
    public private(set) var isLoadingRuns = false
    public private(set) var runsError: String?

    public var now: @Sendable () -> Date

    private let client: DaemonClient?
    private var runPollTasks: [PhaseId: Task<Void, Never>] = [:]

    public init(client: DaemonClient?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.now = now
    }

    public var isConnected: Bool { client != nil }

    public var selectedPreset: PhasePreset? {
        guard let selectedPresetId else { return nil }
        return presets.first { $0.presetId == selectedPresetId }
    }

    public var selectedPhase: PhaseDefinition? {
        guard let selectedPhaseId else { return nil }
        return selectedPreset?.phases.first { $0.phaseId == selectedPhaseId }
    }

    // MARK: preset.list

    public func loadPresets() async {
        guard let client else { return }
        isLoadingPresets = true
        defer { isLoadingPresets = false }
        do {
            presets = try await client.listPresets()
            presetsError = nil
            if selectedPresetId == nil { selectedPresetId = presets.first?.presetId }
            if selectedPhaseId == nil { selectedPhaseId = selectedPreset?.phases.first?.phaseId }
        } catch {
            presetsError = Self.describe(error)
        }
    }

    public func loadPresetsIfNeeded() async {
        guard presets.isEmpty, !isLoadingPresets else { return }
        await loadPresets()
    }

    public func selectPreset(_ id: PhasePresetId) {
        selectedPresetId = id
        selectedPhaseId = presets.first { $0.presetId == id }?.phases.first?.phaseId
    }

    // MARK: Save — phase.upsert then preset.upsert

    /// Persists an edited phase: `phase.upsert` first (compare-and-set on the phase's own revision),
    /// then `preset.upsert` with the preset's `phases[]` pointing at the freshly-upserted content (a
    /// preset embeds full `PhaseDefinition` values, not references) so the ordered preset and the
    /// durable phase never drift apart.
    @discardableResult
    public func savePhase(_ draft: PhaseDefinitionDraft) async -> Bool {
        guard let client, let preset = selectedPreset else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            let existingRevision = preset.phases.first { $0.phaseId == draft.phaseId }?.revision
            let phaseResult = try await client.upsertPhase(draft, expectedRevision: existingRevision)
            var updatedPhases = preset.phases
            if let index = updatedPhases.firstIndex(where: { $0.phaseId == draft.phaseId }) {
                updatedPhases[index] = phaseResult.phase
            } else {
                updatedPhases.append(phaseResult.phase)
            }
            let presetDraft = PhasePresetDraft(presetId: preset.presetId, name: preset.name, phases: updatedPhases,
                                               appliesTo: preset.appliesTo)
            let presetResult = try await client.upsertPreset(presetDraft, expectedRevision: preset.revision)
            if let index = presets.firstIndex(where: { $0.presetId == preset.presetId }) {
                presets[index] = presetResult.preset
            }
            saveError = nil
            return true
        } catch {
            saveError = Self.describe(error)
            return false
        }
    }

    // MARK: phase.run / phase.status / phase.approve / phase.reject

    @discardableResult
    public func runPhase(_ phase: PhaseDefinition, presetId: PhasePresetId?, projectId: ProjectID) async -> PhaseRun? {
        guard let client else { return nil }
        do {
            let run = try await client.runPhase(presetId: presetId, phaseId: phase.phaseId, projectId: projectId)
            activeRuns[phase.phaseId] = run
            runLaunchError = nil
            startPolling(run)
            return run
        } catch {
            runLaunchError = Self.describe(error)
            return nil
        }
    }

    private func startPolling(_ run: PhaseRun, interval: Duration = .seconds(2)) {
        let phaseId = run.phaseId
        runPollTasks[phaseId]?.cancel()
        runPollTasks[phaseId] = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self else { return }
                await self.pollRun(phaseId)
            }
        }
    }

    private func pollRun(_ phaseId: PhaseId) async {
        guard let client, let run = activeRuns[phaseId] else { return }
        do {
            let updated = try await client.phaseRunStatus(run.phaseRunId)
            activeRuns[phaseId] = updated
            if Self.isTerminal(updated.state) { stopPolling(phaseId) }
        } catch {
            runLaunchError = Self.describe(error)
        }
    }

    private static func isTerminal(_ state: PhaseRunState) -> Bool {
        switch state {
        case .succeeded, .failed, .cancelled: return true
        case .queued, .running, .awaitingHuman: return false
        }
    }

    public func stopPolling(_ phaseId: PhaseId) {
        runPollTasks[phaseId]?.cancel()
        runPollTasks[phaseId] = nil
    }

    public func stopAllPolling() {
        for task in runPollTasks.values { task.cancel() }
        runPollTasks.removeAll()
    }

    @discardableResult
    public func approveRun(_ run: PhaseRun, reason: String?) async -> Bool {
        guard let client else { return false }
        do {
            let updated = try await client.approvePhaseRun(run.phaseRunId, reason: reason)
            activeRuns[run.phaseId] = updated
            decisionError = nil
            if Self.isTerminal(updated.state) { stopPolling(run.phaseId) }
            return true
        } catch {
            decisionError = Self.describe(error)
            return false
        }
    }

    @discardableResult
    public func rejectRun(_ run: PhaseRun, reason: String) async -> Bool {
        guard let client else { return false }
        do {
            let updated = try await client.rejectPhaseRun(run.phaseRunId, reason: reason)
            activeRuns[run.phaseId] = updated
            decisionError = nil
            if Self.isTerminal(updated.state) { stopPolling(run.phaseId) }
            return true
        } catch {
            decisionError = Self.describe(error)
            return false
        }
    }

    // MARK: phase.list — recent runs

    public func loadRecentRuns(projectId: ProjectID? = nil) async {
        guard let client else { return }
        isLoadingRuns = true
        defer { isLoadingRuns = false }
        do {
            let page = try await client.listPhaseRuns(PhaseRunListQuery(projectId: projectId, limit: 20))
            recentRuns = page.runs
            runsError = nil
        } catch {
            runsError = Self.describe(error)
        }
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
