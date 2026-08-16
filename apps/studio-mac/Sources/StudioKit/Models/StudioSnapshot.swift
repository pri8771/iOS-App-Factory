import Foundation

// MARK: - Studio snapshot (studio-snapshot.ts, `studio.snapshot`)
//
// Mirrors `packages/contracts/src/v1/studio-snapshot.ts` on `studio/service-skeleton` (tip cdfe558).
// The daemon composes this today from attempts/events/the local portfolio projection; `milestones`,
// project `gates`, and portfolio `rooms` are concepts three separate, still-unmerged worktrees own, so
// the daemon in that branch always reports them with an explicit `unavailableReason` rather than a
// fabricated value. `STUDIO_NOT_YET_WIRED_REASON` is that reason, verbatim, so every "not wired yet"
// surface here is grep-able.
//
// `StudioMilestone` below is this file's own placeholder milestone shape — `targetDate` is an
// `IsoInstant`, `status` is planned/at-risk/met/missed. It is NOT the same type as `ProjectMilestone`
// (Milestone.swift, the real, revisioned concept `project.milestones.list` / `.upsert` read and write):
// that one's `targetDate` is a `CalendarDate` and `status` is planned/active/done/abandoned. The two
// worktrees drifted independently; `computeAssistantAnswerV1` on the daemon even says as much — this
// type "is exercised only by round-trip/type tests until [milestones-and-phase] merges and this type is
// reconciled with the real one." Studio's dashboard timeline reads `StudioProject.timeline.milestones`
// (this file); the project-detail milestones panel and editor read/write the real `ProjectMilestone`.

public let studioNotYetWiredReason = "not yet wired (studio/milestones-and-phase pending)"

// MARK: Metrics — "exactly one of value or unavailableReason"

/// A portfolio aggregate that is either a real computed value or an honestly-explained absence —
/// never both, never neither. Mirrors `StudioCountMetricV1` / `StudioRatioMetricV1` /
/// `StudioDurationSecondsMetricV1`, which share this exact shape and differ only in `value`'s type.
public struct StudioMetric<Value: Hashable & Sendable & Codable>: Hashable, Sendable, Codable {
    public var value: Value?
    public var unavailableReason: String?

    public init(value: Value?, unavailableReason: String?) {
        self.value = value
        self.unavailableReason = unavailableReason
    }

    private enum CodingKeys: String, CodingKey { case value, unavailableReason }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(value, forKey: .value)
        try c.encode(unavailableReason, forKey: .unavailableReason)
    }

    /// `Sourced` for display: live when a value is present, not-yet-sourced when it is not.
    public func sourced(op: String = "studio.snapshot") -> Sourced<Value> {
        if let value { return Sourced(value, .live(op)) }
        return .notYetSourced
    }
}

public typealias StudioCountMetric = StudioMetric<Int>
public typealias StudioRatioMetric = StudioMetric<Double>
public typealias StudioDurationSecondsMetric = StudioMetric<Double>

/// Portfolio-wide aggregates for the dashboard header. Every field is independently nullable.
public struct StudioPortfolioAggregates: Hashable, Sendable, Codable {
    public var verifiedThisWeek: StudioCountMetric
    public var awaitingYouCount: StudioCountMetric
    public var passRate: StudioRatioMetric
    public var medianRunSeconds: StudioDurationSecondsMetric
    public var agentWindowShare: StudioRatioMetric

    public init(verifiedThisWeek: StudioCountMetric, awaitingYouCount: StudioCountMetric, passRate: StudioRatioMetric,
                medianRunSeconds: StudioDurationSecondsMetric, agentWindowShare: StudioRatioMetric) {
        self.verifiedThisWeek = verifiedThisWeek
        self.awaitingYouCount = awaitingYouCount
        self.passRate = passRate
        self.medianRunSeconds = medianRunSeconds
        self.agentWindowShare = agentWindowShare
    }
}

// MARK: Gates

public enum StudioGateState: String, Hashable, Sendable, Codable, CaseIterable {
    case pending, satisfied, waived, blocked, unavailable
}

/// `typed`/`owner` mirror the typed-lifecycle-gate and human-only-owner-field concepts
/// `studio/lifecycle-reconciliation` (`TypedGateNameV1`: build/tests/visual/device/legal/store/market)
/// and `studio/policy-engine-scoping` (`GateOwnerV1`: human/machine) will introduce — plain strings on
/// this wire shape, not those branches' enums, because this file predates their merge. Today's daemon
/// always reports `state: .unavailable` with `typed`/`owner` both `nil`.
public struct StudioProjectGates: Hashable, Sendable, Codable {
    public var typed: String?
    public var owner: String?
    public var state: StudioGateState
    public var unavailableReason: String?

    public init(typed: String?, owner: String?, state: StudioGateState, unavailableReason: String?) {
        self.typed = typed
        self.owner = owner
        self.state = state
        self.unavailableReason = unavailableReason
    }

    private enum CodingKeys: String, CodingKey { case typed, owner, state, unavailableReason }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(typed, forKey: .typed)
        try c.encode(owner, forKey: .owner)
        try c.encode(state, forKey: .state)
        try c.encode(unavailableReason, forKey: .unavailableReason)
    }

    /// The one gold rule reaches gates too: a gate only glows gold when a human, not the machine, owns it.
    public var ownerIsHuman: Bool { owner == "human" }
}

public struct StudioAttemptSummary: Hashable, Sendable, Codable {
    public var attemptId: AttemptID
    public var taskId: TaskID
    public var state: AttemptState
    public var updatedAt: IsoInstant
    public var blocker: Blocker?

    public init(attemptId: AttemptID, taskId: TaskID, state: AttemptState, updatedAt: IsoInstant, blocker: Blocker?) {
        self.attemptId = attemptId
        self.taskId = taskId
        self.state = state
        self.updatedAt = updatedAt
        self.blocker = blocker
    }
}

public enum StudioAwaitingHumanKind: String, Hashable, Sendable, Codable, CaseIterable {
    case blockedAttempt = "blocked-attempt"
    case gateApproval = "gate-approval"
}

/// `"blocked-attempt"` is populated for real from live attempt state; `"gate-approval"` exists for
/// forward compatibility with `studio/policy-engine-scoping`'s owner-approval gates and is never
/// emitted yet.
public struct StudioAwaitingHumanItem: Hashable, Sendable, Codable, Identifiable {
    public var kind: StudioAwaitingHumanKind
    public var attemptId: AttemptID?
    public var summary: String
    public var since: IsoInstant

    public var id: String { "\(kind.rawValue).\(attemptId?.rawValue ?? since.rawValue)" }

    public init(kind: StudioAwaitingHumanKind, attemptId: AttemptID?, summary: String, since: IsoInstant) {
        self.kind = kind
        self.attemptId = attemptId
        self.summary = summary
        self.since = since
    }

    private enum CodingKeys: String, CodingKey { case kind, attemptId, summary, since }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(attemptId, forKey: .attemptId)
        try c.encode(summary, forKey: .summary)
        try c.encode(since, forKey: .since)
    }
}

// MARK: Placeholder milestones (studio-snapshot.ts's own shape — see the file doc comment)

public enum StudioMilestoneStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case planned
    case atRisk = "at-risk"
    case met, missed
}

/// `StudioMilestoneV1`. `targetDate: nil` means no honest target date exists yet; nothing may invent one.
public struct StudioMilestone: Hashable, Sendable, Codable, Identifiable {
    public var milestoneId: StudioMilestoneID
    public var name: String
    public var targetDate: IsoInstant?
    public var status: StudioMilestoneStatus

    public var id: StudioMilestoneID { milestoneId }

    public init(milestoneId: StudioMilestoneID, name: String, targetDate: IsoInstant?, status: StudioMilestoneStatus) {
        self.milestoneId = milestoneId
        self.name = name
        self.targetDate = targetDate
        self.status = status
    }
}

public struct StudioTimelineActual: Hashable, Sendable, Codable, Identifiable {
    public var attemptId: AttemptID
    public var label: String
    public var occurredAt: IsoInstant

    public var id: String { "\(attemptId.rawValue).\(label).\(occurredAt.rawValue)" }

    public init(attemptId: AttemptID, label: String, occurredAt: IsoInstant) {
        self.attemptId = attemptId
        self.label = label
        self.occurredAt = occurredAt
    }
}

/// `actuals` is real, derived from this project's own attempt/event history. `milestones` is always
/// empty today; `milestonesUnavailableReason` explains why exactly when `milestones` is empty, so an
/// empty array never reads as "on schedule with zero milestones."
public struct StudioProjectTimeline: Hashable, Sendable, Codable {
    public var milestones: [StudioMilestone]
    public var milestonesUnavailableReason: String?
    public var actuals: [StudioTimelineActual]

    public init(milestones: [StudioMilestone], milestonesUnavailableReason: String?, actuals: [StudioTimelineActual]) {
        self.milestones = milestones
        self.milestonesUnavailableReason = milestonesUnavailableReason
        self.actuals = actuals
    }

    private enum CodingKeys: String, CodingKey { case milestones, milestonesUnavailableReason, actuals }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(milestones, forKey: .milestones)
        try c.encode(milestonesUnavailableReason, forKey: .milestonesUnavailableReason)
        try c.encode(actuals, forKey: .actuals)
    }
}

/// `StudioProjectV1`. `lifecycleStage` is the pre-existing legacy 8-value stage
/// (`ProjectLifecycleStage`, `project.ts`) — studio-snapshot.ts imports that schema, not the new
/// 6-stage `ProjectLifecycleStageV1` `studio/lifecycle-reconciliation` defines, because this file
/// predates that branch's merge too.
public struct StudioProject: Hashable, Sendable, Codable, Identifiable {
    public var projectId: ProjectID
    public var name: String
    public var lifecycleStage: ProjectLifecycleStage?
    public var gates: StudioProjectGates
    public var latestAttemptSummary: StudioAttemptSummary?
    public var awaitingHuman: [StudioAwaitingHumanItem]
    public var timeline: StudioProjectTimeline

    public var id: ProjectID { projectId }

    public init(projectId: ProjectID, name: String, lifecycleStage: ProjectLifecycleStage?, gates: StudioProjectGates,
                latestAttemptSummary: StudioAttemptSummary?, awaitingHuman: [StudioAwaitingHumanItem],
                timeline: StudioProjectTimeline) {
        self.projectId = projectId
        self.name = name
        self.lifecycleStage = lifecycleStage
        self.gates = gates
        self.latestAttemptSummary = latestAttemptSummary
        self.awaitingHuman = awaitingHuman
        self.timeline = timeline
    }
}

// MARK: Rooms (placeholder — rooms/Phase 3)

public struct StudioRoom: Hashable, Sendable, Codable, Identifiable {
    public enum Kind: String, Hashable, Sendable, Codable, CaseIterable { case project, portfolio }

    public var roomId: StudioRoomID
    public var name: String
    public var kind: Kind

    public var id: StudioRoomID { roomId }

    public init(roomId: StudioRoomID, name: String, kind: Kind) {
        self.roomId = roomId
        self.name = name
        self.kind = kind
    }
}

// MARK: Envelope

/// `StudioSnapshotV1`. `sourceSnapshotDigest` is re-verified client-side by `DaemonClient`, mirroring
/// `PortfolioReadModel` (see `StudioSnapshotDigest`).
public struct StudioSnapshot: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var generatedAt: IsoInstant
    public var projects: [StudioProject]
    public var rooms: [StudioRoom]
    public var roomsUnavailableReason: String?
    public var portfolio: StudioPortfolioAggregates
    public var sourceSnapshotDigest: Sha256Digest

    public init(generatedAt: IsoInstant, projects: [StudioProject], rooms: [StudioRoom], roomsUnavailableReason: String?,
                portfolio: StudioPortfolioAggregates, sourceSnapshotDigest: Sha256Digest) {
        self.generatedAt = generatedAt
        self.projects = projects
        self.rooms = rooms
        self.roomsUnavailableReason = roomsUnavailableReason
        self.portfolio = portfolio
        self.sourceSnapshotDigest = sourceSnapshotDigest
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, generatedAt, projects, rooms, roomsUnavailableReason, portfolio, sourceSnapshotDigest
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(generatedAt, forKey: .generatedAt)
        try c.encode(projects, forKey: .projects)
        try c.encode(rooms, forKey: .rooms)
        try c.encode(roomsUnavailableReason, forKey: .roomsUnavailableReason)
        try c.encode(portfolio, forKey: .portfolio)
        try c.encode(sourceSnapshotDigest, forKey: .sourceSnapshotDigest)
    }
}
