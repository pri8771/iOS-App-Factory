import Foundation

// MARK: - The Planner (project-plan.ts, `plan.propose`/`plan.edit`/`plan.approve`/`plan.execute`/
// `plan.approve-gate`/`plan.tick`)
//
// "Start a new project" / "turn this into a project" produces a `ProjectPlan` — an ORDERED, EDITABLE
// LIST of items (never a graph/DAG view; `dependsOn` only ever points at strictly earlier items in
// `items[]`, so the list stays skimmable top to bottom), most of them ordinary `task` items and a
// deliberately sparse sprinkling of `gate` items where a human must sign off. `plan.propose` builds
// this list deterministically from a `PhasePreset`'s phases; `plan.edit`/`plan.approve` are pure CAS
// mutations; `plan.execute` starts the first ready item and `plan.tick` advances the chain as each
// task attempt reaches a terminal state (a human-owned gate item pauses the chain for
// `plan.approve-gate`).

/// The Studio phase key the deterministic proposal builder always uses for the build phase's task
/// items — the daemon's own `PROJECT_PLAN_BUILD_PHASE_V1`.
public let projectPlanBuildPhase = "build"

public struct ProjectPlanBrief: Hashable, Sendable, Codable {
    public var title: String
    public var oneLiner: String
    /// Free-text operator constraints, e.g. "local-only", "xcodegen", "tests-per-task".
    public var constraints: [String]

    public init(title: String, oneLiner: String, constraints: [String]) {
        self.title = title
        self.oneLiner = oneLiner
        self.constraints = constraints
    }
}

/// Provenance: the room/message a plan was proposed from, when proposed via the assistant.
public struct ProjectPlanSourceRef: Hashable, Sendable, Codable {
    public var roomId: RoomID
    public var messageId: RoomMessageID?

    public init(roomId: RoomID, messageId: RoomMessageID?) {
        self.roomId = roomId
        self.messageId = messageId
    }

    private enum CodingKeys: String, CodingKey { case roomId, messageId }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(roomId, forKey: .roomId)
        try c.encode(messageId, forKey: .messageId)
    }
}

/// Everything a `task` item needs to become a real `TaskSpec` at submit time, minus the fields only
/// known at submission (`taskId`, `projectId`, `base`, `policyDigest`, `createdAt`).
public struct ProjectPlanTaskSpecDraft: Hashable, Sendable, Codable {
    public struct Scope: Hashable, Sendable, Codable {
        public var paths: [RelativePath]
        public init(paths: [RelativePath]) { self.paths = paths }
    }

    public var objective: String
    public var acceptanceCriteria: [AcceptanceCriterion]
    public var scope: Scope
    public var phase: StableKey

    public init(objective: String, acceptanceCriteria: [AcceptanceCriterion], scope: Scope, phase: StableKey) {
        self.objective = objective
        self.acceptanceCriteria = acceptanceCriteria
        self.scope = scope
        self.phase = phase
    }
}

/// `owner` is always `"human"` on the wire (`z.literal`), kept as a real stored field for a
/// byte-identical round trip.
public struct ProjectPlanGate: Hashable, Sendable, Codable {
    public var reason: String
    public init(reason: String) { self.reason = reason }

    private enum CodingKeys: String, CodingKey { case owner, reason }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let owner = try c.decode(String.self, forKey: .owner)
        guard owner == "human" else {
            throw DecodingError.dataCorruptedError(forKey: .owner, in: c, debugDescription: "Expected gate owner \"human\", got \(owner)")
        }
        reason = try c.decode(String.self, forKey: .reason)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("human", forKey: .owner)
        try c.encode(reason, forKey: .reason)
    }
}

public enum ProjectPlanItemKind: String, Hashable, Sendable, Codable, CaseIterable {
    case task, gate
}

public enum ProjectPlanItemStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case proposed, approved, deferred, running, done, failed
}

/// A gate item never runs an attempt: only `proposed` (awaiting `plan.approve-gate`), `approved`
/// (cleared), or `deferred` are meaningful.
public enum ProjectPlanGateItemStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case proposed, approved, deferred
}

// MARK: Draft items (the `add-item` edit payload)
//
// Neither draft struct below declares or encodes its own `kind` key: the wrapping
// `ProjectPlanItemDraft` enum writes `kind` into the SAME encoder/decoder its case's payload struct
// reads and writes its own fields from (mirroring `RoomMessage` over `RoomChatMessage`/
// `RoomSystemMessage` in Room.swift) — both containers merge into one flat JSON object, so a
// synthesized `init(from:)` here can stay exact even though the wire object also carries `kind`.

public struct ProjectPlanTaskItemDraft: Hashable, Sendable, Codable {
    public var itemId: ProjectPlanItemId
    public var phase: StableKey
    public var title: String
    public var detail: String?
    public var dependsOn: [ProjectPlanItemId]
    public var taskSpecDraft: ProjectPlanTaskSpecDraft

    public init(itemId: ProjectPlanItemId, phase: StableKey, title: String, detail: String?,
                dependsOn: [ProjectPlanItemId], taskSpecDraft: ProjectPlanTaskSpecDraft) {
        self.itemId = itemId
        self.phase = phase
        self.title = title
        self.detail = detail
        self.dependsOn = dependsOn
        self.taskSpecDraft = taskSpecDraft
    }

    private enum CodingKeys: String, CodingKey { case itemId, phase, title, detail, dependsOn, taskSpecDraft }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(itemId, forKey: .itemId)
        try c.encode(phase, forKey: .phase)
        try c.encode(title, forKey: .title)
        try c.encode(detail, forKey: .detail)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(taskSpecDraft, forKey: .taskSpecDraft)
    }
}

public struct ProjectPlanGateItemDraft: Hashable, Sendable, Codable {
    public var itemId: ProjectPlanItemId
    public var phase: StableKey
    public var title: String
    public var detail: String?
    public var dependsOn: [ProjectPlanItemId]
    public var gate: ProjectPlanGate

    public init(itemId: ProjectPlanItemId, phase: StableKey, title: String, detail: String?,
                dependsOn: [ProjectPlanItemId], gate: ProjectPlanGate) {
        self.itemId = itemId
        self.phase = phase
        self.title = title
        self.detail = detail
        self.dependsOn = dependsOn
        self.gate = gate
    }

    private enum CodingKeys: String, CodingKey { case itemId, phase, title, detail, dependsOn, gate }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(itemId, forKey: .itemId)
        try c.encode(phase, forKey: .phase)
        try c.encode(title, forKey: .title)
        try c.encode(detail, forKey: .detail)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(gate, forKey: .gate)
    }
}

/// `ProjectPlanItemDraftV1` — a real discriminated union on `kind`, used only inside an `add-item` edit.
public enum ProjectPlanItemDraft: Hashable, Sendable {
    case task(ProjectPlanTaskItemDraft)
    case gate(ProjectPlanGateItemDraft)
}

extension ProjectPlanItemDraft: Codable {
    private enum CodingKeys: String, CodingKey { case kind }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(ProjectPlanItemKind.self, forKey: .kind) {
        case .task: self = .task(try ProjectPlanTaskItemDraft(from: decoder))
        case .gate: self = .gate(try ProjectPlanGateItemDraft(from: decoder))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .task(let item):
            try c.encode(ProjectPlanItemKind.task, forKey: .kind)
            try item.encode(to: encoder)
        case .gate(let item):
            try c.encode(ProjectPlanItemKind.gate, forKey: .kind)
            try item.encode(to: encoder)
        }
    }
}

// MARK: Durable items (`items[]` on a real `ProjectPlan`)

public struct ProjectPlanTaskItem: Hashable, Sendable, Codable, Identifiable {
    public var itemId: ProjectPlanItemId
    public var phase: StableKey
    public var title: String
    public var detail: String?
    public var dependsOn: [ProjectPlanItemId]
    public var taskSpecDraft: ProjectPlanTaskSpecDraft
    public var status: ProjectPlanItemStatus
    public var taskId: TaskID?
    public var attemptId: AttemptID?

    public var id: ProjectPlanItemId { itemId }

    public init(itemId: ProjectPlanItemId, phase: StableKey, title: String, detail: String?,
                dependsOn: [ProjectPlanItemId], taskSpecDraft: ProjectPlanTaskSpecDraft, status: ProjectPlanItemStatus,
                taskId: TaskID?, attemptId: AttemptID?) {
        self.itemId = itemId
        self.phase = phase
        self.title = title
        self.detail = detail
        self.dependsOn = dependsOn
        self.taskSpecDraft = taskSpecDraft
        self.status = status
        self.taskId = taskId
        self.attemptId = attemptId
    }

    private enum CodingKeys: String, CodingKey {
        case itemId, phase, title, detail, dependsOn, taskSpecDraft, status, taskId, attemptId
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(itemId, forKey: .itemId)
        try c.encode(phase, forKey: .phase)
        try c.encode(title, forKey: .title)
        try c.encode(detail, forKey: .detail)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(taskSpecDraft, forKey: .taskSpecDraft)
        try c.encode(status, forKey: .status)
        try c.encode(taskId, forKey: .taskId)
        try c.encode(attemptId, forKey: .attemptId)
    }
}

public struct ProjectPlanGateItem: Hashable, Sendable, Codable, Identifiable {
    public var itemId: ProjectPlanItemId
    public var phase: StableKey
    public var title: String
    public var detail: String?
    public var dependsOn: [ProjectPlanItemId]
    public var gate: ProjectPlanGate
    public var status: ProjectPlanGateItemStatus

    public var id: ProjectPlanItemId { itemId }

    public init(itemId: ProjectPlanItemId, phase: StableKey, title: String, detail: String?,
                dependsOn: [ProjectPlanItemId], gate: ProjectPlanGate, status: ProjectPlanGateItemStatus) {
        self.itemId = itemId
        self.phase = phase
        self.title = title
        self.detail = detail
        self.dependsOn = dependsOn
        self.gate = gate
        self.status = status
    }

    private enum CodingKeys: String, CodingKey { case itemId, phase, title, detail, dependsOn, gate, status }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(itemId, forKey: .itemId)
        try c.encode(phase, forKey: .phase)
        try c.encode(title, forKey: .title)
        try c.encode(detail, forKey: .detail)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(gate, forKey: .gate)
        try c.encode(status, forKey: .status)
    }
}

/// `ProjectPlanItemV1` — a `kind`-discriminated union over the two durable item shapes.
public enum ProjectPlanItem: Hashable, Sendable, Identifiable {
    case task(ProjectPlanTaskItem)
    case gate(ProjectPlanGateItem)

    public var id: ProjectPlanItemId {
        switch self {
        case .task(let item): return item.itemId
        case .gate(let item): return item.itemId
        }
    }

    public var phase: StableKey {
        switch self {
        case .task(let item): return item.phase
        case .gate(let item): return item.phase
        }
    }

    public var title: String {
        switch self {
        case .task(let item): return item.title
        case .gate(let item): return item.title
        }
    }

    public var detail: String? {
        switch self {
        case .task(let item): return item.detail
        case .gate(let item): return item.detail
        }
    }

    public var dependsOn: [ProjectPlanItemId] {
        switch self {
        case .task(let item): return item.dependsOn
        case .gate(let item): return item.dependsOn
        }
    }

    public var kind: ProjectPlanItemKind {
        switch self {
        case .task: return .task
        case .gate: return .gate
        }
    }

    /// A status vocabulary shared for display even though the two kinds' wire enums differ
    /// (a gate item never carries `running`/`done`/`failed`).
    public var status: ProjectPlanItemStatus {
        switch self {
        case .task(let item): return item.status
        case .gate(let item):
            switch item.status {
            case .proposed: return .proposed
            case .approved: return .approved
            case .deferred: return .deferred
            }
        }
    }
}

extension ProjectPlanItem: Codable {
    private enum CodingKeys: String, CodingKey { case kind }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(ProjectPlanItemKind.self, forKey: .kind) {
        case .task: self = .task(try ProjectPlanTaskItem(from: decoder))
        case .gate: self = .gate(try ProjectPlanGateItem(from: decoder))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .task(let item):
            try c.encode(ProjectPlanItemKind.task, forKey: .kind)
            try item.encode(to: encoder)
        case .gate(let item):
            try c.encode(ProjectPlanItemKind.gate, forKey: .kind)
            try item.encode(to: encoder)
        }
    }
}

public enum ProjectPlanState: String, Hashable, Sendable, Codable, CaseIterable {
    case draft, approved, executing, complete
}

/// The durable, revisioned project plan.
public struct ProjectPlan: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var planId: ProjectPlanID
    public var projectId: ProjectID?
    /// The repository `plan.execute`/`plan.tick` submit this plan's task items against. `nil` until
    /// set — a plan can be proposed and edited before its target repository exists.
    public var repositoryId: RepositoryID?
    public var brief: ProjectPlanBrief
    public var presetId: PhasePresetId
    public var items: [ProjectPlanItem]
    public var state: ProjectPlanState
    public var revision: Int
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant
    public var digest: Sha256Digest

    public var id: ProjectPlanID { planId }

    public init(planId: ProjectPlanID, projectId: ProjectID?, repositoryId: RepositoryID?, brief: ProjectPlanBrief,
                presetId: PhasePresetId, items: [ProjectPlanItem], state: ProjectPlanState, revision: Int,
                createdAt: IsoInstant, updatedAt: IsoInstant, digest: Sha256Digest) {
        self.planId = planId
        self.projectId = projectId
        self.repositoryId = repositoryId
        self.brief = brief
        self.presetId = presetId
        self.items = items
        self.state = state
        self.revision = revision
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.digest = digest
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, planId, projectId, repositoryId, brief, presetId, items, state, revision, createdAt,
             updatedAt, digest
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(planId, forKey: .planId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(repositoryId, forKey: .repositoryId)
        try c.encode(brief, forKey: .brief)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(items, forKey: .items)
        try c.encode(state, forKey: .state)
        try c.encode(revision, forKey: .revision)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(digest, forKey: .digest)
    }

    /// Index of the first item at `projectPlanBuildPhase`, or `items.endIndex` if none — mirrors the
    /// daemon's own `buildStartIndexV1`, used client-side only to render "before build starts".
    public var buildStartIndex: Int {
        items.firstIndex { $0.phase.rawValue == projectPlanBuildPhase } ?? items.endIndex
    }
}

// MARK: Commands

public struct ProjectPlanPropose: Hashable, Sendable, Codable {
    public var brief: ProjectPlanBrief
    public var presetId: PhasePresetId
    public var projectId: ProjectID?
    public var repositoryId: RepositoryID?
    public var source: ProjectPlanSourceRef?

    public init(brief: ProjectPlanBrief, presetId: PhasePresetId, projectId: ProjectID?, repositoryId: RepositoryID?,
                source: ProjectPlanSourceRef?) {
        self.brief = brief
        self.presetId = presetId
        self.projectId = projectId
        self.repositoryId = repositoryId
        self.source = source
    }

    private enum CodingKeys: String, CodingKey { case brief, presetId, projectId, repositoryId, source }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(brief, forKey: .brief)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(repositoryId, forKey: .repositoryId)
        try c.encode(source, forKey: .source)
    }
}

/// `ProjectPlanEditV1` — a `kind`-discriminated union of the eight single-edit shapes `plan.edit` batches.
public enum ProjectPlanEdit: Hashable, Sendable {
    /// The complete new item order, by ID; must be a permutation of the plan's current item IDs.
    case reorder(order: [ProjectPlanItemId])
    case defer_(itemId: ProjectPlanItemId)
    case retitle(itemId: ProjectPlanItemId, title: String)
    case editTaskSpecDraft(itemId: ProjectPlanItemId, taskSpecDraft: ProjectPlanTaskSpecDraft)
    /// `afterItemId: nil` inserts at the end of the list.
    case addItem(afterItemId: ProjectPlanItemId?, item: ProjectPlanItemDraft)
    case removeItem(itemId: ProjectPlanItemId)
    case setRepository(repositoryId: RepositoryID)
    /// A full replacement of the plan's brief (title/oneLiner/constraints) -- see
    /// `ProjectPlanBrief`. Closes decision 4 of ADR 0004: the Planner's brief is no longer read-only.
    case editBrief(brief: ProjectPlanBrief)
}

extension ProjectPlanEdit: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, order, itemId, title, taskSpecDraft, afterItemId, item, repositoryId, brief
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "reorder": self = .reorder(order: try c.decode([ProjectPlanItemId].self, forKey: .order))
        case "defer": self = .defer_(itemId: try c.decode(ProjectPlanItemId.self, forKey: .itemId))
        case "retitle":
            self = .retitle(itemId: try c.decode(ProjectPlanItemId.self, forKey: .itemId),
                            title: try c.decode(String.self, forKey: .title))
        case "edit-task-spec-draft":
            self = .editTaskSpecDraft(itemId: try c.decode(ProjectPlanItemId.self, forKey: .itemId),
                                      taskSpecDraft: try c.decode(ProjectPlanTaskSpecDraft.self, forKey: .taskSpecDraft))
        case "add-item":
            self = .addItem(afterItemId: try c.decodeIfPresent(ProjectPlanItemId.self, forKey: .afterItemId),
                            item: try c.decode(ProjectPlanItemDraft.self, forKey: .item))
        case "remove-item": self = .removeItem(itemId: try c.decode(ProjectPlanItemId.self, forKey: .itemId))
        case "set-repository": self = .setRepository(repositoryId: try c.decode(RepositoryID.self, forKey: .repositoryId))
        case "edit-brief": self = .editBrief(brief: try c.decode(ProjectPlanBrief.self, forKey: .brief))
        case let kind:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown plan edit kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .reorder(let order):
            try c.encode("reorder", forKey: .kind)
            try c.encode(order, forKey: .order)
        case .defer_(let itemId):
            try c.encode("defer", forKey: .kind)
            try c.encode(itemId, forKey: .itemId)
        case let .retitle(itemId, title):
            try c.encode("retitle", forKey: .kind)
            try c.encode(itemId, forKey: .itemId)
            try c.encode(title, forKey: .title)
        case let .editTaskSpecDraft(itemId, taskSpecDraft):
            try c.encode("edit-task-spec-draft", forKey: .kind)
            try c.encode(itemId, forKey: .itemId)
            try c.encode(taskSpecDraft, forKey: .taskSpecDraft)
        case let .addItem(afterItemId, item):
            try c.encode("add-item", forKey: .kind)
            try c.encode(afterItemId, forKey: .afterItemId)
            try c.encode(item, forKey: .item)
        case .removeItem(let itemId):
            try c.encode("remove-item", forKey: .kind)
            try c.encode(itemId, forKey: .itemId)
        case .setRepository(let repositoryId):
            try c.encode("set-repository", forKey: .kind)
            try c.encode(repositoryId, forKey: .repositoryId)
        case .editBrief(let brief):
            try c.encode("edit-brief", forKey: .kind)
            try c.encode(brief, forKey: .brief)
        }
    }
}

public struct ProjectPlanEditBatch: Hashable, Sendable, Codable {
    public var planId: ProjectPlanID
    public var expectedRevision: Int
    public var edits: [ProjectPlanEdit]

    public init(planId: ProjectPlanID, expectedRevision: Int, edits: [ProjectPlanEdit]) {
        self.planId = planId
        self.expectedRevision = expectedRevision
        self.edits = edits
    }
}

public struct ProjectPlanApprove: Hashable, Sendable, Codable {
    public var planId: ProjectPlanID
    public var expectedRevision: Int
    public init(planId: ProjectPlanID, expectedRevision: Int) {
        self.planId = planId
        self.expectedRevision = expectedRevision
    }
}

public struct ProjectPlanExecute: Hashable, Sendable, Codable {
    public var planId: ProjectPlanID
    public var expectedRevision: Int
    public init(planId: ProjectPlanID, expectedRevision: Int) {
        self.planId = planId
        self.expectedRevision = expectedRevision
    }
}

public struct ProjectPlanApproveGate: Hashable, Sendable, Codable {
    public var planId: ProjectPlanID
    public var itemId: ProjectPlanItemId
    public var expectedRevision: Int
    public init(planId: ProjectPlanID, itemId: ProjectPlanItemId, expectedRevision: Int) {
        self.planId = planId
        self.itemId = itemId
        self.expectedRevision = expectedRevision
    }
}

public struct ProjectPlanTick: Hashable, Sendable, Codable {
    public var planId: ProjectPlanID
    public init(planId: ProjectPlanID) { self.planId = planId }
}

// MARK: Command results

public struct ProjectPlanResult: Hashable, Sendable, Codable {
    public var plan: ProjectPlan
    public init(plan: ProjectPlan) { self.plan = plan }
}

/// `advanced` is true when this tick moved the plan forward; false when there was nothing new to do
/// (still running, or paused at a gate awaiting `plan.approve-gate`).
public struct ProjectPlanTickResult: Hashable, Sendable, Codable {
    public var plan: ProjectPlan
    public var advanced: Bool
    public init(plan: ProjectPlan, advanced: Bool) {
        self.plan = plan
        self.advanced = advanced
    }
}
