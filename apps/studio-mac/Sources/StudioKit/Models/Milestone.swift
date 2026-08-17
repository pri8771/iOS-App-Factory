import Foundation

// MARK: - Project milestones (milestone.ts, `project.milestones.list` / `project.milestone.upsert`)
//
// Mirrors `packages/contracts/src/v1/milestone.ts` — the one milestone concept. `studio.snapshot`'s
// `projects[].timeline.milestones` (StudioSnapshot.swift) and `project.milestones.list`/`.upsert`
// both read and write exactly this type; there is no second, placeholder milestone shape any more
// (see `apps/studio-mac/docs/architecture/0003-studio-phase2-service-integration.md` decision 4
// for the history of the seam this closed).

public enum ProjectMilestoneKind: String, Hashable, Sendable, Codable, CaseIterable {
    case stage, gate, release
}

public enum ProjectMilestoneOwner: String, Hashable, Sendable, Codable, CaseIterable {
    case human, machine
}

public enum ProjectMilestoneStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case planned, active, done, abandoned
}

/// The operator-authored content of a milestone. `targetDate: nil` is a first-class, valid "no
/// honest estimate" — Studio renders it as "won't guess" and never substitutes a default or
/// inferred date. `evidenceDigest` binds a status claim (typically `.done`) to a durable artifact.
public struct ProjectMilestoneDraft: Hashable, Sendable, Codable {
    public var milestoneId: MilestoneID
    public var projectId: ProjectID
    public var phase: StableKey
    public var kind: ProjectMilestoneKind
    public var label: String
    public var targetDate: CalendarDate?
    public var dependsOn: [MilestoneID]
    public var owner: ProjectMilestoneOwner
    public var status: ProjectMilestoneStatus
    public var evidenceDigest: Sha256Digest?

    public init(milestoneId: MilestoneID, projectId: ProjectID, phase: StableKey, kind: ProjectMilestoneKind, label: String,
                targetDate: CalendarDate?, dependsOn: [MilestoneID], owner: ProjectMilestoneOwner,
                status: ProjectMilestoneStatus, evidenceDigest: Sha256Digest?) {
        self.milestoneId = milestoneId
        self.projectId = projectId
        self.phase = phase
        self.kind = kind
        self.label = label
        self.targetDate = targetDate
        self.dependsOn = dependsOn
        self.owner = owner
        self.status = status
        self.evidenceDigest = evidenceDigest
    }

    private enum CodingKeys: String, CodingKey {
        case milestoneId, projectId, phase, kind, label, targetDate, dependsOn, owner, status, evidenceDigest
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(milestoneId, forKey: .milestoneId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(phase, forKey: .phase)
        try c.encode(kind, forKey: .kind)
        try c.encode(label, forKey: .label)
        try c.encode(targetDate, forKey: .targetDate)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(owner, forKey: .owner)
        try c.encode(status, forKey: .status)
        try c.encode(evidenceDigest, forKey: .evidenceDigest)
    }
}

/// The durable, revisioned milestone record. `revision` starts at 0 and advances by exactly one per
/// accepted upsert.
public struct ProjectMilestone: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var milestoneId: MilestoneID
    public var projectId: ProjectID
    public var phase: StableKey
    public var kind: ProjectMilestoneKind
    public var label: String
    public var targetDate: CalendarDate?
    public var dependsOn: [MilestoneID]
    public var owner: ProjectMilestoneOwner
    public var status: ProjectMilestoneStatus
    public var evidenceDigest: Sha256Digest?
    public var revision: Int
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant

    public var id: MilestoneID { milestoneId }

    public var draft: ProjectMilestoneDraft {
        ProjectMilestoneDraft(milestoneId: milestoneId, projectId: projectId, phase: phase, kind: kind, label: label,
                              targetDate: targetDate, dependsOn: dependsOn, owner: owner, status: status,
                              evidenceDigest: evidenceDigest)
    }

    public init(milestoneId: MilestoneID, projectId: ProjectID, phase: StableKey, kind: ProjectMilestoneKind, label: String,
                targetDate: CalendarDate?, dependsOn: [MilestoneID], owner: ProjectMilestoneOwner,
                status: ProjectMilestoneStatus, evidenceDigest: Sha256Digest?, revision: Int, createdAt: IsoInstant,
                updatedAt: IsoInstant) {
        self.milestoneId = milestoneId
        self.projectId = projectId
        self.phase = phase
        self.kind = kind
        self.label = label
        self.targetDate = targetDate
        self.dependsOn = dependsOn
        self.owner = owner
        self.status = status
        self.evidenceDigest = evidenceDigest
        self.revision = revision
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, milestoneId, projectId, phase, kind, label, targetDate, dependsOn, owner, status,
             evidenceDigest, revision, createdAt, updatedAt
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(milestoneId, forKey: .milestoneId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(phase, forKey: .phase)
        try c.encode(kind, forKey: .kind)
        try c.encode(label, forKey: .label)
        try c.encode(targetDate, forKey: .targetDate)
        try c.encode(dependsOn, forKey: .dependsOn)
        try c.encode(owner, forKey: .owner)
        try c.encode(status, forKey: .status)
        try c.encode(evidenceDigest, forKey: .evidenceDigest)
        try c.encode(revision, forKey: .revision)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

/// Create-or-update intent — the `project.milestone.upsert` payload. `expectedRevision: nil` creates
/// the milestone (fails if it already exists); a number is compare-and-set (fails unless the stored
/// head revision matches), so two operators can never silently overwrite each other's edits.
public struct ProjectMilestoneUpsert: Hashable, Sendable, Codable {
    public var milestone: ProjectMilestoneDraft
    public var expectedRevision: Int?

    public init(milestone: ProjectMilestoneDraft, expectedRevision: Int?) {
        self.milestone = milestone
        self.expectedRevision = expectedRevision
    }

    private enum CodingKeys: String, CodingKey { case milestone, expectedRevision }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(milestone, forKey: .milestone)
        try c.encode(expectedRevision, forKey: .expectedRevision)
    }
}

// MARK: Actuals — observed execution facts, never a projection

/// Derived only from durable kernel attempts; every instant here is something that actually happened.
public struct ProjectPhaseActuals: Hashable, Sendable, Codable {
    public var phase: StableKey?
    public var attemptCount: Int
    public var activeAttemptCount: Int
    public var blockerCount: Int
    public var succeededAttemptCount: Int
    public var firstAttemptAt: IsoInstant
    public var lastActivityAt: IsoInstant
    public var lastSucceededAt: IsoInstant?

    public init(phase: StableKey?, attemptCount: Int, activeAttemptCount: Int, blockerCount: Int, succeededAttemptCount: Int,
                firstAttemptAt: IsoInstant, lastActivityAt: IsoInstant, lastSucceededAt: IsoInstant?) {
        self.phase = phase
        self.attemptCount = attemptCount
        self.activeAttemptCount = activeAttemptCount
        self.blockerCount = blockerCount
        self.succeededAttemptCount = succeededAttemptCount
        self.firstAttemptAt = firstAttemptAt
        self.lastActivityAt = lastActivityAt
        self.lastSucceededAt = lastSucceededAt
    }
}

/// A lifecycle event projected into the timeline: an observed, evidence-bound fact.
public struct ProjectLifecycleActual: Hashable, Sendable, Codable, Identifiable {
    public var eventId: EventID
    public var type: NamespacedCode
    public var releaseId: ReleaseID?
    public var evidenceDigest: Sha256Digest
    public var emittedAt: IsoInstant

    public var id: EventID { eventId }

    public init(eventId: EventID, type: NamespacedCode, releaseId: ReleaseID?, evidenceDigest: Sha256Digest, emittedAt: IsoInstant) {
        self.eventId = eventId
        self.type = type
        self.releaseId = releaseId
        self.evidenceDigest = evidenceDigest
        self.emittedAt = emittedAt
    }
}

public struct ProjectTimelineSourceAvailability: Hashable, Sendable, Codable {
    /// Always `.available` on the wire (`z.literal("available")`).
    public var localExecution: PortfolioSourceAvailability
    public var lifecycleEvents: PortfolioSourceAvailability

    public init(localExecution: PortfolioSourceAvailability = .available, lifecycleEvents: PortfolioSourceAvailability) {
        self.localExecution = localExecution
        self.lifecycleEvents = lifecycleEvents
    }
}

/// The complete milestone plan for one project alongside what has actually happened. Plans
/// (`milestones`) and `actuals` are kept structurally separate: a missing target date stays missing
/// rather than being filled from actuals.
public struct ProjectMilestoneTimeline: Hashable, Sendable, Codable {
    public struct Actuals: Hashable, Sendable, Codable {
        public var phases: [ProjectPhaseActuals]
        public var lifecycle: [ProjectLifecycleActual]
        public init(phases: [ProjectPhaseActuals], lifecycle: [ProjectLifecycleActual]) {
            self.phases = phases
            self.lifecycle = lifecycle
        }
    }

    public var schemaVersion: SchemaVersion1 = .init()
    public var projectId: ProjectID
    public var generatedAt: IsoInstant
    public var milestones: [ProjectMilestone]
    public var actuals: Actuals
    public var sources: ProjectTimelineSourceAvailability

    public init(projectId: ProjectID, generatedAt: IsoInstant, milestones: [ProjectMilestone], actuals: Actuals,
                sources: ProjectTimelineSourceAvailability) {
        self.projectId = projectId
        self.generatedAt = generatedAt
        self.milestones = milestones
        self.actuals = actuals
        self.sources = sources
    }
}

// MARK: Command results

public struct ProjectMilestonesListResult: Hashable, Sendable, Codable {
    public var timeline: ProjectMilestoneTimeline
    public init(timeline: ProjectMilestoneTimeline) { self.timeline = timeline }
}

public struct ProjectMilestoneUpsertResult: Hashable, Sendable, Codable {
    public var milestone: ProjectMilestone
    public var created: Bool
    public init(milestone: ProjectMilestone, created: Bool) {
        self.milestone = milestone
        self.created = created
    }
}
