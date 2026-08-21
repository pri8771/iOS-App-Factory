import Foundation

// MARK: - Studio snapshot (studio-snapshot.ts, `studio.snapshot`)
//
// Mirrors `packages/contracts/src/v1/studio-snapshot.ts`. The daemon composes this from
// attempts/events/the local portfolio projection and — since the `studio/milestones-and-phase`
// merge — the durable milestone repository; portfolio `rooms` is a concept a separate,
// still-unmerged worktree (`studio/rooms-core`) owns, so the daemon reports it with an explicit
// `unavailableReason` rather than a fabricated value. `studioNotYetWiredReason` is that reason,
// verbatim, so every "not wired yet" surface here is grep-able. Project `gates` are real typed
// values (`TypedGateName`/`GateOwner` below) backed by no persisted observation yet in this
// daemon; `studioNoGateRecordsReason` explains that specific, different kind of absence.
//
// `projects[].timeline.milestones` is `[ProjectMilestone]` (Milestone.swift) — the exact same
// durable, revisioned type `project.milestones.list`/`.upsert` read and write. Earlier revisions
// of this file defined a second, incompatible `StudioMilestone` placeholder shape (`targetDate` an
// `IsoInstant`, `status` planned/at-risk/met/missed — a vocabulary `ProjectMilestone`'s own status
// rejects outright). See `apps/studio-mac/docs/architecture/
// 0003-studio-phase2-service-integration.md` decision 4 for that history; the seam is closed now,
// so the dashboard timeline and the project-detail milestones panel read and decode one model.

public let studioNotYetWiredReason = "not yet wired (studio/rooms-core pending)"

/// Reported on `gates.unavailableReason` for a project with no persisted typed-gate observation
/// yet — an honest fact about that project, not a missing daemon capability.
public let studioNoGateRecordsReason = "no gate records for project"

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

/// `TypedGateNameV1` (`lifecycle.ts`) — the seven typed lifecycle gates.
public enum TypedGateName: String, Hashable, Sendable, Codable, CaseIterable {
    case build, tests, visual, device, legal, store, market
}

/// `GateOwnerV1` (`lifecycle.ts`).
public enum GateOwner: String, Hashable, Sendable, Codable, CaseIterable {
    case human, machine
}

/// `typed`/`owner` are the real typed-lifecycle-gate vocabulary, not placeholder strings: a project
/// whose gate state is a real, persisted `TypedGateV1` observation reports it here verbatim. A
/// project with no persisted gate observation yet reports `state: .unavailable` with `typed`/`owner`
/// both `nil` and `unavailableReason` set to `studioNoGateRecordsReason`.
public struct StudioProjectGates: Hashable, Sendable, Codable {
    public var typed: TypedGateName?
    public var owner: GateOwner?
    public var state: StudioGateState
    public var unavailableReason: String?

    public init(typed: TypedGateName?, owner: GateOwner?, state: StudioGateState, unavailableReason: String?) {
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
    public var ownerIsHuman: Bool { owner == .human }
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
    case phaseRun = "phase-run"
}

/// `"blocked-attempt"` is populated for real from live attempt state; `"gate-approval"` exists for
/// forward compatibility with `studio/policy-engine-scoping`'s owner-approval gates and is never
/// emitted yet; `"phase-run"` is populated for real from Phase Runner — `phaseRunId`
/// (`StudioAwaitingHumanItemV1.phaseRunId`, since 6d6a0fd) is present exactly for this kind.
public struct StudioAwaitingHumanItem: Hashable, Sendable, Codable, Identifiable {
    public var kind: StudioAwaitingHumanKind
    public var attemptId: AttemptID?
    public var phaseRunId: PhaseRunID?
    public var summary: String
    public var since: IsoInstant

    public var id: String { "\(kind.rawValue).\(attemptId?.rawValue ?? phaseRunId?.rawValue ?? since.rawValue)" }

    public init(kind: StudioAwaitingHumanKind, attemptId: AttemptID?, phaseRunId: PhaseRunID? = nil,
                summary: String, since: IsoInstant) {
        self.kind = kind
        self.attemptId = attemptId
        self.phaseRunId = phaseRunId
        self.summary = summary
        self.since = since
    }

    private enum CodingKeys: String, CodingKey { case kind, attemptId, phaseRunId, summary, since }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(attemptId, forKey: .attemptId)
        try c.encode(phaseRunId, forKey: .phaseRunId)
        try c.encode(summary, forKey: .summary)
        try c.encode(since, forKey: .since)
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

/// `actuals` is real, derived from this project's own attempt/event history. `milestones` is the
/// project's real, revisioned milestone plan (`[ProjectMilestone]`) — the exact type
/// `project.milestones.list`/`.upsert` read and write. An empty array is a legitimate real state (a
/// project with no authored milestones yet); `milestonesUnavailableReason` may be non-`nil` only
/// while `milestones` is empty, and must be `nil` once any milestone is present.
public struct StudioProjectTimeline: Hashable, Sendable, Codable {
    public var milestones: [ProjectMilestone]
    public var milestonesUnavailableReason: String?
    public var actuals: [StudioTimelineActual]

    public init(milestones: [ProjectMilestone], milestonesUnavailableReason: String?, actuals: [StudioTimelineActual]) {
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

/// `owner-doctrine` badge data: which enrolled/observed repository this project's docs-derived
/// fields were read from, and, per the corpus's own authority order
/// (`governance/DOCUMENTATION_POLICY.md`: code -> feature contracts -> decision records ->
/// completion reports -> the central standard) as applied here, whether `lifecycleStage` ultimately
/// came from this repository's own kernel/gate evidence (`factoryEvidence`) or from its repo docs
/// (`repoDocs`) — `factoryEvidence` wins whenever both exist. `nil` on the whole field means no
/// repo-docs source is configured for this project at all, not "repo docs were checked and had
/// nothing." Mirrors `StudioProjectDocsProvenanceV1` (`studio-snapshot.ts`).
public enum StudioProjectDocsSourceKind: String, Hashable, Sendable, Codable, CaseIterable {
    case enrolled, observed
}

/// `StudioFieldSourceV1` (`studio-snapshot.ts`).
public enum StudioFieldSource: String, Hashable, Sendable, Codable, CaseIterable {
    case repoDocs = "repo-docs"
    case factoryEvidence = "factory-evidence"
    case milestone
}

public struct StudioProjectDocsProvenance: Hashable, Sendable, Codable {
    public var sourceKind: StudioProjectDocsSourceKind
    public var repositoryRoot: AbsolutePath
    public var docsSnapshotDigest: Sha256Digest
    public var lifecycleStageSource: StudioFieldSource?
    public var awaitingHumanFromDocsCount: Int

    public init(sourceKind: StudioProjectDocsSourceKind, repositoryRoot: AbsolutePath, docsSnapshotDigest: Sha256Digest,
                lifecycleStageSource: StudioFieldSource?, awaitingHumanFromDocsCount: Int) {
        self.sourceKind = sourceKind
        self.repositoryRoot = repositoryRoot
        self.docsSnapshotDigest = docsSnapshotDigest
        self.lifecycleStageSource = lifecycleStageSource
        self.awaitingHumanFromDocsCount = awaitingHumanFromDocsCount
    }
}

/// `StudioProjectV1`. `lifecycleStage` is the canonical six-stage `ProjectLifecycleStage`
/// (`ProjectLifecycleStageV1`, `lifecycle.ts`, ADR 0005) — real as of the `studio/repo-docs-truth`
/// merge (previously always `nil`; see `ProjectLifecycleStage`'s own doc comment for how it shares
/// its Swift type, and legacy-value decoding fallback, with `PortfolioProject.lifecycleStage`).
public struct StudioProject: Hashable, Sendable, Codable, Identifiable {
    public var projectId: ProjectID
    /// A stable, `StableKey`-shaped identifier: from the enrolled project/manifest when known,
    /// otherwise a deterministic fallback derived only from `projectId` — never from `name`. Lets
    /// the dashboard merge a studio.snapshot row with the fixture/portfolio slug it already keys
    /// on via this field directly, replacing a best-effort slugify-of-name heuristic that could
    /// (and did) diverge from the curated slug.
    public var slug: StableKey
    public var name: String
    public var lifecycleStage: ProjectLifecycleStage?
    public var gates: StudioProjectGates
    public var latestAttemptSummary: StudioAttemptSummary?
    public var awaitingHuman: [StudioAwaitingHumanItem]
    public var timeline: StudioProjectTimeline
    /// Present exactly when a repo-docs source is configured for this project
    /// (`APP_FACTORY_PROJECT_DOCS_SOURCES`); `nil` for a project with none configured, which looks
    /// exactly as it did before the daemon's repo-docs wiring existed.
    public var docsProvenance: StudioProjectDocsProvenance?

    public var id: ProjectID { projectId }

    public init(projectId: ProjectID, slug: StableKey, name: String, lifecycleStage: ProjectLifecycleStage?,
                gates: StudioProjectGates, latestAttemptSummary: StudioAttemptSummary?,
                awaitingHuman: [StudioAwaitingHumanItem], timeline: StudioProjectTimeline,
                docsProvenance: StudioProjectDocsProvenance? = nil) {
        self.projectId = projectId
        self.slug = slug
        self.name = name
        self.lifecycleStage = lifecycleStage
        self.gates = gates
        self.latestAttemptSummary = latestAttemptSummary
        self.awaitingHuman = awaitingHuman
        self.timeline = timeline
        self.docsProvenance = docsProvenance
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
