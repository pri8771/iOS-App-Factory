import Foundation
import Observation

// MARK: - PlannerModel
//
// The observable state behind the Planner: propose (`plan.propose`), edit (`plan.edit` — reorder,
// defer, retitle, edit a task spec draft, add/remove an item, set the target repository — batched as
// one compare-and-set write), approve (`plan.approve`), execute (`plan.execute`), clear a gate
// (`plan.approve-gate`), and poll (`plan.status`) while the plan is `executing`. `project.seed` lives
// here too: "Seed new project" always ends in an attempt to propose a plan against the freshly seeded
// repository. Mirrors `RoomsModel`/`PhasesModel`'s discipline throughout.

@Observable
@MainActor
public final class PlannerModel {

    public private(set) var plan: ProjectPlan?
    public private(set) var isLoading = false
    public private(set) var isProposing = false
    public private(set) var isSavingEdit = false
    public private(set) var isApproving = false
    public private(set) var isExecuting = false
    public private(set) var error: String?

    public private(set) var isSeeding = false
    public private(set) var seedError: String?
    public private(set) var lastSeedResult: ProjectSeedResult?

    public var now: @Sendable () -> Date

    private let client: DaemonClient?
    private var pollTask: Task<Void, Never>?

    public init(client: DaemonClient?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.now = now
    }

    public var isConnected: Bool { client != nil }

    /// Clears the currently-open plan (e.g. the punch list sheet was dismissed) and stops polling it.
    public func close() {
        stopPolling()
        plan = nil
        error = nil
    }

    // MARK: plan.propose

    @discardableResult
    public func propose(brief: ProjectPlanBrief, presetId: PhasePresetId, projectId: ProjectID?,
                        repositoryId: RepositoryID?, source: ProjectPlanSourceRef? = nil) async -> ProjectPlan? {
        guard let client else { return nil }
        isProposing = true
        defer { isProposing = false }
        do {
            let proposed = try await client.proposePlan(brief: brief, presetId: presetId, projectId: projectId,
                                                         repositoryId: repositoryId, source: source)
            plan = proposed
            error = nil
            updatePolling(for: proposed)
            return proposed
        } catch {
            self.error = Self.describe(error)
            return nil
        }
    }

    /// Adopts an already-proposed plan (e.g. one that arrived through the corner chat's confirmed
    /// `propose-plan` intent) as the open plan, without a second `plan.propose` round trip.
    public func adopt(_ plan: ProjectPlan) {
        self.plan = plan
        error = nil
        updatePolling(for: plan)
    }

    // MARK: plan.edit

    @discardableResult
    public func applyEdits(_ edits: [ProjectPlanEdit]) async -> Bool {
        guard let client, let plan else { return false }
        isSavingEdit = true
        defer { isSavingEdit = false }
        do {
            let edited = try await client.editPlan(plan.planId, expectedRevision: plan.revision, edits: edits)
            self.plan = edited
            error = nil
            return true
        } catch {
            self.error = Self.describe(error)
            return false
        }
    }

    public func reorder(_ order: [ProjectPlanItemId]) async { await applyEdits([.reorder(order: order)]) }
    public func defer_(_ itemId: ProjectPlanItemId) async { await applyEdits([.defer_(itemId: itemId)]) }
    public func retitle(_ itemId: ProjectPlanItemId, title: String) async { await applyEdits([.retitle(itemId: itemId, title: title)]) }
    /// Full replacement of the plan's brief — `plan.edit`'s `edit-brief` kind (ADR 0004 decision 4,
    /// closed: the brief is no longer read-only on the wire).
    public func editBrief(_ brief: ProjectPlanBrief) async { await applyEdits([.editBrief(brief: brief)]) }

    // MARK: plan.approve / plan.execute / plan.approve-gate

    @discardableResult
    public func approve() async -> Bool {
        guard let client, let plan else { return false }
        isApproving = true
        defer { isApproving = false }
        do {
            self.plan = try await client.approvePlan(plan.planId, expectedRevision: plan.revision)
            error = nil
            return true
        } catch {
            self.error = Self.describe(error)
            return false
        }
    }

    @discardableResult
    public func execute() async -> Bool {
        guard let client, let plan else { return false }
        isExecuting = true
        defer { isExecuting = false }
        do {
            let executed = try await client.executePlan(plan.planId, expectedRevision: plan.revision)
            self.plan = executed
            error = nil
            updatePolling(for: executed)
            return true
        } catch {
            self.error = Self.describe(error)
            return false
        }
    }

    @discardableResult
    public func approveGate(_ itemId: ProjectPlanItemId) async -> Bool {
        guard let client, let plan else { return false }
        do {
            let updated = try await client.approvePlanGate(plan.planId, itemId: itemId, expectedRevision: plan.revision)
            self.plan = updated
            error = nil
            updatePolling(for: updated)
            return true
        } catch {
            self.error = Self.describe(error)
            return false
        }
    }

    // MARK: plan.status polling — while `executing`

    private func updatePolling(for plan: ProjectPlan) {
        if plan.state == .executing { startPolling(plan.planId) } else { stopPolling() }
    }

    private func startPolling(_ planId: ProjectPlanID, interval: Duration = .seconds(2)) {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self else { return }
                await self.pollOnce(planId)
            }
        }
    }

    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func pollOnce(_ planId: ProjectPlanID) async {
        guard let client else { return }
        do {
            let status = try await client.planStatus(planId)
            plan = status
            error = nil
            if status.state != .executing { stopPolling() }
        } catch {
            self.error = Self.describe(error)
        }
    }

    // MARK: project.seed

    @discardableResult
    public func seedProject(targetDirectory: AbsolutePath, name: String) async -> ProjectSeedResult? {
        guard let client else { return nil }
        isSeeding = true
        defer { isSeeding = false }
        do {
            let result = try await client.seedProject(targetDirectory: targetDirectory, name: name)
            lastSeedResult = result
            seedError = nil
            return result
        } catch {
            seedError = Self.describe(error)
            return nil
        }
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
