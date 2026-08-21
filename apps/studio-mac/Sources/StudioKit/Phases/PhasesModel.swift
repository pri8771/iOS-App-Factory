import Foundation
import Observation

// MARK: - PhasesModel
//
// The observable state behind the Stages tab: the preset list (`preset.list`), the selected phase's
// editable draft, saving (`phase.upsert` then `preset.upsert` — a preset embeds full `PhaseDefinition`
// values, so updating one phase's content and then pointing the preset at that new content are two
// separate CAS writes), launching a run (`phase.run`) and polling it (`phase.status`) while it is
// live, and the recent-runs list (`phase.list`). Mirrors `RoomsModel`'s discipline: nothing is
// invented — `nil`/empty until actually read, per-call errors kept rather than swallowed.
//
// Wave 9c adds three flows on top of the Wave 4 save/run/decide surface, all still CAS pairs of
// `phase.upsert`/`preset.upsert` — nothing here is a new wire operation:
//  - insert-a-new-stage: the "+" between two chain nodes mints a `PhaseId`, opens the editor on an
//    in-memory placeholder `PhaseDefinition` (`newPhaseDraft`) that is not yet part of any preset, and
//    only actually reaches the daemon when the operator hits Save — `savePhase(_:insertAt:)` then
//    inserts the freshly-upserted phase at that position in the preset's `phases[]`.
//  - reorder: `reorderPhase(_:to:)` permutes the preset's own already-durable `phases[]` and CAS-writes
//    it back — no phase content changes, so it never calls `phase.upsert`.
//  - create-preset: mints a `PhasePresetId` from the operator's name and seeds ONE starter stage (the
//    wire schema requires `phases.min(1)` — an empty preset cannot exist even for a moment).

@Observable
@MainActor
public final class PhasesModel {

    public private(set) var presets: [PhasePreset] = []
    public private(set) var isLoadingPresets = false
    public private(set) var presetsError: String?

    public var selectedPresetId: PhasePresetId?
    public var selectedPhaseId: PhaseId?

    /// A brand-new stage created by the chain view's "+" insert button: an in-memory placeholder the
    /// editor renders exactly like any other phase, but which is not yet part of `selectedPreset.phases`
    /// — `savePhase` inserts it at `newPhaseInsertIndex` only once the operator actually saves it.
    public private(set) var newPhaseDraft: PhaseDefinition?
    public private(set) var newPhaseInsertIndex: Int?

    public private(set) var isSaving = false
    public private(set) var saveError: String?

    public private(set) var isCreatingPreset = false
    public private(set) var createPresetError: String?

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
        if let newPhaseDraft, newPhaseDraft.phaseId == selectedPhaseId { return newPhaseDraft }
        return selectedPreset?.phases.first { $0.phaseId == selectedPhaseId }
    }

    /// The index a Save of the currently-selected phase should insert at, if it is still the pending
    /// new-phase placeholder — `nil` for an ordinary edit of an already-durable phase.
    public var selectedPhaseInsertIndex: Int? {
        guard let selectedPhaseId, let newPhaseDraft, newPhaseDraft.phaseId == selectedPhaseId else { return nil }
        return newPhaseInsertIndex
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
        newPhaseDraft = nil
        newPhaseInsertIndex = nil
        selectedPhaseId = presets.first { $0.presetId == id }?.phases.first?.phaseId
    }

    public func selectPhase(_ id: PhaseId) {
        // Selecting a durable phase abandons any not-yet-saved new-phase placeholder — there is only
        // ever one in-flight "+" insert at a time.
        if newPhaseDraft?.phaseId != id {
            newPhaseDraft = nil
            newPhaseInsertIndex = nil
        }
        selectedPhaseId = id
    }

    // MARK: "+" insert — a not-yet-saved placeholder stage

    /// Mints a fresh `PhaseId`, builds a minimal placeholder `PhaseDefinition` (blank name/purpose,
    /// `solo` mode with an empty cast — the editor's own `isValid` keeps Save disabled until the
    /// operator fills in a name, purpose, and exactly one participant, or switches mode), selects it,
    /// and remembers `index` so `savePhase` inserts it there once actually saved. A no-op without a
    /// selected preset.
    public func startNewPhase(insertAt index: Int) {
        guard let preset = selectedPreset else { return }
        guard let phaseId = Self.mintPhaseId(existing: Set(preset.phases.map(\.phaseId.rawValue))) else { return }
        let instant = IsoInstant.now(now())
        let placeholder = PhaseDefinition(
            phaseId: phaseId, name: "", purpose: "", mode: .solo,
            cast: PhaseCast(participants: [], coordinator: nil, grader: nil), inputs: [],
            rules: PhaseRules(standard: [], yours: [], requiredOutput: [], acceptanceChecks: []),
            outputs: [], gates: [], budget: PhaseBudget(estimateMinutes: nil, timeoutSeconds: 1_800),
            revision: 0, createdAt: instant, updatedAt: instant)
        newPhaseDraft = placeholder
        newPhaseInsertIndex = min(max(index, 0), preset.phases.count)
        selectedPhaseId = phaseId
        saveError = nil
    }

    public func cancelNewPhase() {
        guard let newPhaseDraft else { return }
        self.newPhaseDraft = nil
        newPhaseInsertIndex = nil
        if selectedPhaseId == newPhaseDraft.phaseId {
            selectedPhaseId = selectedPreset?.phases.first?.phaseId
        }
    }

    // MARK: Save — phase.upsert then preset.upsert

    /// Persists an edited phase: `phase.upsert` first (compare-and-set on the phase's own revision),
    /// then `preset.upsert` with the preset's `phases[]` pointing at the freshly-upserted content (a
    /// preset embeds full `PhaseDefinition` values, not references) so the ordered preset and the
    /// durable phase never drift apart. `insertAt` places a brand-new phase (one the preset doesn't
    /// already carry) at that position; an edit of an already-durable phase always updates in place
    /// regardless of what `insertAt` says.
    @discardableResult
    public func savePhase(_ draft: PhaseDefinitionDraft, insertAt: Int? = nil) async -> Bool {
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
                let insertionIndex = min(max(insertAt ?? updatedPhases.count, 0), updatedPhases.count)
                updatedPhases.insert(phaseResult.phase, at: insertionIndex)
            }
            let presetDraft = PhasePresetDraft(presetId: preset.presetId, name: preset.name, phases: updatedPhases,
                                               appliesTo: preset.appliesTo)
            let presetResult = try await client.upsertPreset(presetDraft, expectedRevision: preset.revision)
            if let index = presets.firstIndex(where: { $0.presetId == preset.presetId }) {
                presets[index] = presetResult.preset
            }
            if newPhaseDraft?.phaseId == draft.phaseId {
                newPhaseDraft = nil
                newPhaseInsertIndex = nil
            }
            saveError = nil
            return true
        } catch {
            saveError = Self.describe(error)
            return false
        }
    }

    // MARK: Reorder — preset.upsert only (no phase content changes)

    /// Moves an already-durable phase to `newIndex` within the selected preset's ordered `phases[]`
    /// and CAS-writes the permuted array back via `preset.upsert`. Never touches `phase.upsert` — the
    /// phase's own content is untouched, only its position. Clamped to the preset's bounds; a no-op
    /// (but reported successful) if `newIndex` resolves to the phase's current position.
    @discardableResult
    public func reorderPhase(_ phaseId: PhaseId, to newIndex: Int) async -> Bool {
        guard let client, let preset = selectedPreset else { return false }
        guard let currentIndex = preset.phases.firstIndex(where: { $0.phaseId == phaseId }) else { return false }
        let clamped = min(max(newIndex, 0), preset.phases.count - 1)
        guard clamped != currentIndex else { return true }
        isSaving = true
        defer { isSaving = false }
        var reordered = preset.phases
        let moved = reordered.remove(at: currentIndex)
        reordered.insert(moved, at: clamped)
        do {
            let presetDraft = PhasePresetDraft(presetId: preset.presetId, name: preset.name, phases: reordered,
                                               appliesTo: preset.appliesTo)
            let result = try await client.upsertPreset(presetDraft, expectedRevision: preset.revision)
            if let index = presets.firstIndex(where: { $0.presetId == preset.presetId }) {
                presets[index] = result.preset
            }
            saveError = nil
            return true
        } catch {
            saveError = Self.describe(error)
            return false
        }
    }

    /// Move-left/move-right (v1 reorder — drag is deferred, Architecture decision 15): a no-op at
    /// either end of the chain.
    @discardableResult
    public func movePhaseLeft(_ phaseId: PhaseId) async -> Bool {
        guard let preset = selectedPreset, let index = preset.phases.firstIndex(where: { $0.phaseId == phaseId }) else { return false }
        guard index > 0 else { return true }
        return await reorderPhase(phaseId, to: index - 1)
    }

    @discardableResult
    public func movePhaseRight(_ phaseId: PhaseId) async -> Bool {
        guard let preset = selectedPreset, let index = preset.phases.firstIndex(where: { $0.phaseId == phaseId }) else { return false }
        guard index < preset.phases.count - 1 else { return true }
        return await reorderPhase(phaseId, to: index + 1)
    }

    // MARK: Create preset — preset.upsert(expectedRevision: nil)

    /// Mints a `PhasePresetId` from `name` and creates a brand-new preset seeded with ONE starter
    /// stage — the wire schema requires `phases.min(1)`, so an empty preset can never exist even
    /// transiently. The starter stage is deliberately generic ("Stage 1", chat mode, empty cast) and
    /// left for the operator to actually configure via the editor. Selects the new preset and its
    /// starter stage on success.
    @discardableResult
    public func createPreset(name: String, appliesTo: [ProjectKind]?) async -> Bool {
        guard let client else { return false }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            createPresetError = "name cannot be empty"
            return false
        }
        guard let presetId = Self.mintPresetId(from: trimmedName, existing: Set(presets.map(\.presetId.rawValue))) else {
            createPresetError = "couldn't derive a valid preset id from that name"
            return false
        }
        isCreatingPreset = true
        defer { isCreatingPreset = false }
        guard let starterPhaseId = Self.mintPhaseId(existing: []) else { return false }
        let starterDraft = PhaseDefinitionDraft(
            phaseId: starterPhaseId, name: "Stage 1", purpose: "Describe what this stage produces.",
            mode: .chat, cast: PhaseCast(participants: [], coordinator: nil, grader: nil), inputs: [],
            rules: PhaseRules(standard: [], yours: [], requiredOutput: [], acceptanceChecks: []),
            outputs: [], gates: [], budget: PhaseBudget(estimateMinutes: nil, timeoutSeconds: 1_800))
        do {
            // `phase.upsert` first — same discipline as `savePhase` — so the starter stage has a real
            // durable `phase_definitions` row from the moment the preset exists, not just an embedded
            // snapshot a later edit's CAS-update would find nothing to match against.
            let phaseResult = try await client.upsertPhase(starterDraft, expectedRevision: nil)
            let presetDraft = PhasePresetDraft(presetId: presetId, name: trimmedName, phases: [phaseResult.phase], appliesTo: appliesTo)
            let result = try await client.upsertPreset(presetDraft, expectedRevision: nil)
            presets.append(result.preset)
            selectedPresetId = result.preset.presetId
            newPhaseDraft = nil
            newPhaseInsertIndex = nil
            selectedPhaseId = result.preset.phases.first?.phaseId
            createPresetError = nil
            return true
        } catch {
            createPresetError = Self.describe(error)
            return false
        }
    }

    // MARK: ID minting

    /// "stage-1", "stage-2", … — the same base-plus-collision-suffix pattern `RoomsModel.mintPersona`
    /// uses, chosen over deriving from the (at mint time, still blank) phase name.
    static func mintPhaseId(existing: Set<String>) -> PhaseId? {
        var suffix = 1
        var candidate = "stage-\(suffix)"
        while existing.contains(candidate) {
            suffix += 1
            candidate = "stage-\(suffix)"
        }
        return try? PhaseId(candidate)
    }

    /// Slugifies `name` into `PhasePresetIdRule`'s pattern (lowercase, `[a-z0-9-]`, starting with a
    /// letter), then disambiguates against `existing` with a "-2", "-3", … suffix — mirroring
    /// `RoomsModel.mintPersona`'s collision handling.
    static func mintPresetId(from name: String, existing: Set<String>) -> PhasePresetId? {
        let lowered = name.lowercased()
        var pieces: [String] = []
        var current = ""
        for scalar in lowered.unicodeScalars {
            if ("a"..."z").contains(Character(scalar)) || ("0"..."9").contains(Character(scalar)) {
                current.unicodeScalars.append(scalar)
            } else if !current.isEmpty {
                pieces.append(current)
                current = ""
            }
        }
        if !current.isEmpty { pieces.append(current) }
        var base = pieces.joined(separator: "-")
        if base.isEmpty { base = "preset" }
        if let first = base.first, !first.isLowercase || !first.isASCII { base = "preset-\(base)" }
        // The un-dotted `PhasePresetIdRule` segment caps at 64 chars total (not the type's 96-char
        // overall max, which only applies once dot-versioned segments are in play) — leave room for a
        // "-<suffix>" disambiguator.
        base = String(base.prefix(60))
        var candidate = base
        var suffix = 2
        while existing.contains(candidate) {
            candidate = String("\(base)-\(suffix)".prefix(64))
            suffix += 1
        }
        return try? PhasePresetId(candidate)
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
