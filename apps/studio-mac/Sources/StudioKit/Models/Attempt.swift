import Foundation

// MARK: - Execution attempts (execution.ts, attempt-read-model.ts)

public enum AttemptState: String, Hashable, Sendable, Codable, CaseIterable {
    case queued, running, paused, blocked, succeeded, failed, cancelled

    public var isTerminal: Bool {
        switch self {
        case .succeeded, .failed, .cancelled: return true
        default: return false
        }
    }
}

public enum AttemptDesiredState: String, Hashable, Sendable, Codable, CaseIterable {
    case running, paused, cancelled
}

/// `AttemptOutcomeV1` — a `kind`-discriminated union.
public enum AttemptOutcome: Hashable, Sendable, Codable {
    case succeeded
    case failed(Failure)
    case cancelled(reason: String)

    private enum CodingKeys: String, CodingKey { case kind, failure, reason }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "succeeded": self = .succeeded
        case "failed": self = .failed(try c.decode(Failure.self, forKey: .failure))
        case "cancelled": self = .cancelled(reason: try c.decode(String.self, forKey: .reason))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c,
                                                   debugDescription: "Unknown attempt outcome kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .succeeded:
            try c.encode("succeeded", forKey: .kind)
        case .failed(let failure):
            try c.encode("failed", forKey: .kind)
            try c.encode(failure, forKey: .failure)
        case .cancelled(let reason):
            try c.encode("cancelled", forKey: .kind)
            try c.encode(reason, forKey: .reason)
        }
    }
}

/// `ExecutionAttemptV1` — the canonical attempt record.
public struct ExecutionAttempt: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var attemptId: AttemptID
    public var taskId: TaskID
    public var taskSpecDigest: Sha256Digest
    public var attemptNumber: Int
    public var state: AttemptState
    public var desiredState: AttemptDesiredState
    public var revision: Int
    public var fence: Int
    public var currentStepId: StepID?
    public var blocker: Blocker?
    public var outcome: AttemptOutcome?
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant
    public var terminalAt: IsoInstant?

    public var id: AttemptID { attemptId }

    public init(attemptId: AttemptID, taskId: TaskID, taskSpecDigest: Sha256Digest, attemptNumber: Int,
                state: AttemptState, desiredState: AttemptDesiredState, revision: Int, fence: Int,
                currentStepId: StepID?, blocker: Blocker?, outcome: AttemptOutcome?, createdAt: IsoInstant,
                updatedAt: IsoInstant, terminalAt: IsoInstant?) {
        self.attemptId = attemptId
        self.taskId = taskId
        self.taskSpecDigest = taskSpecDigest
        self.attemptNumber = attemptNumber
        self.state = state
        self.desiredState = desiredState
        self.revision = revision
        self.fence = fence
        self.currentStepId = currentStepId
        self.blocker = blocker
        self.outcome = outcome
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.terminalAt = terminalAt
    }
}

// MARK: attempt.list

public enum AttemptListScope: String, Hashable, Sendable, Codable, CaseIterable {
    case active, all
}

public struct AttemptListCursor: Hashable, Sendable, Codable {
    public var updatedAt: IsoInstant
    public var attemptId: AttemptID

    public init(updatedAt: IsoInstant, attemptId: AttemptID) {
        self.updatedAt = updatedAt
        self.attemptId = attemptId
    }
}

/// `AttemptListQueryV1`. Nullable fields are always emitted (zod `.nullable()` is not optional).
public struct AttemptListQuery: Hashable, Sendable, Codable {
    public static let maxItems = 100

    public var scope: AttemptListScope
    public var projectId: ProjectID?
    public var after: AttemptListCursor?
    public var limit: Int

    public init(scope: AttemptListScope = .active, projectId: ProjectID? = nil,
                after: AttemptListCursor? = nil, limit: Int = 50) {
        self.scope = scope
        self.projectId = projectId
        self.after = after
        self.limit = limit
    }

    private enum CodingKeys: String, CodingKey { case scope, projectId, after, limit }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(scope, forKey: .scope)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(after, forKey: .after)
        try c.encode(limit, forKey: .limit)
    }
}

/// `AttemptListItemV1` — the canonical attempt stays nested; the row is navigation only.
public struct AttemptListItem: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var projectId: ProjectID
    public var title: String
    public var attempt: ExecutionAttempt

    public var id: AttemptID { attempt.attemptId }

    public init(projectId: ProjectID, title: String, attempt: ExecutionAttempt) {
        self.projectId = projectId
        self.title = title
        self.attempt = attempt
    }
}

public struct AttemptListPage: Hashable, Sendable, Codable {
    public var attempts: [AttemptListItem]
    public var nextAfter: AttemptListCursor?
    public var hasMore: Bool

    public init(attempts: [AttemptListItem], nextAfter: AttemptListCursor?, hasMore: Bool) {
        self.attempts = attempts
        self.nextAfter = nextAfter
        self.hasMore = hasMore
    }
}

// MARK: attempt.events

public enum StepState: String, Hashable, Sendable, Codable, CaseIterable {
    case pending, running, blocked, succeeded, failed, cancelled, skipped
}

/// `EventV1` — a `type`-discriminated union over a shared envelope.
public struct AttemptEvent: Hashable, Sendable, Codable, Identifiable {
    public enum Payload: Hashable, Sendable {
        case attemptCreated(taskId: TaskID, taskSpecDigest: Sha256Digest)
        case attemptStateChanged(from: AttemptState, to: AttemptState, blocker: Blocker?, outcome: AttemptOutcome?)
        case attemptDesiredStateChanged(from: AttemptDesiredState, to: AttemptDesiredState, reason: String?)
        case attemptFenceClaimed(previousFence: Int, newFence: Int, ownerId: String)
        case attemptUnblockAnswered(stepId: StepID, answer: String)
        case stepCreated(stepId: StepID, ordinal: Int, operation: NamespacedCode, inputDigest: Sha256Digest)
        case stepStateChanged(stepId: StepID, from: StepState, to: StepState, outputDigest: Sha256Digest?,
                              failureCode: NamespacedCode?)
        case evidenceRecorded(evidenceId: EvidenceID, evidenceDigest: Sha256Digest)
        case commitRecorded(commit: GitObjectID, tree: GitObjectID, attemptMarker: String)

        /// The wire `type` string.
        public var type: String {
            switch self {
            case .attemptCreated: return "attempt.created"
            case .attemptStateChanged: return "attempt.state-changed"
            case .attemptDesiredStateChanged: return "attempt.desired-state-changed"
            case .attemptFenceClaimed: return "attempt.fence-claimed"
            case .attemptUnblockAnswered: return "attempt.unblock-answered"
            case .stepCreated: return "step.created"
            case .stepStateChanged: return "step.state-changed"
            case .evidenceRecorded: return "evidence.recorded"
            case .commitRecorded: return "commit.recorded"
            }
        }
    }

    public var schemaVersion: SchemaVersion1 = .init()
    public var eventId: EventID
    public var attemptId: AttemptID
    public var sequence: Int
    public var occurredAt: IsoInstant
    public var commandId: CommandID?
    public var causationEventId: EventID?
    public var fence: Int
    public var payload: Payload

    public var id: EventID { eventId }
    public var type: String { payload.type }

    public init(eventId: EventID, attemptId: AttemptID, sequence: Int, occurredAt: IsoInstant,
                commandId: CommandID?, causationEventId: EventID?, fence: Int, payload: Payload) {
        self.eventId = eventId
        self.attemptId = attemptId
        self.sequence = sequence
        self.occurredAt = occurredAt
        self.commandId = commandId
        self.causationEventId = causationEventId
        self.fence = fence
        self.payload = payload
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, eventId, attemptId, sequence, occurredAt, commandId, causationEventId, fence
        case type, data
    }

    private enum DataKeys: String, CodingKey {
        case taskId, taskSpecDigest, from, to, blocker, outcome, reason, previousFence, newFence, ownerId
        case stepId, answer, ordinal, operation, inputDigest, outputDigest, failureCode, evidenceId
        case evidenceDigest, commit, tree, attemptMarker
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(SchemaVersion1.self, forKey: .schemaVersion)
        eventId = try c.decode(EventID.self, forKey: .eventId)
        attemptId = try c.decode(AttemptID.self, forKey: .attemptId)
        sequence = try c.decode(Int.self, forKey: .sequence)
        occurredAt = try c.decode(IsoInstant.self, forKey: .occurredAt)
        commandId = try c.decodeIfPresent(CommandID.self, forKey: .commandId)
        causationEventId = try c.decodeIfPresent(EventID.self, forKey: .causationEventId)
        fence = try c.decode(Int.self, forKey: .fence)
        let type = try c.decode(String.self, forKey: .type)
        let d = try c.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        switch type {
        case "attempt.created":
            payload = .attemptCreated(taskId: try d.decode(TaskID.self, forKey: .taskId),
                                      taskSpecDigest: try d.decode(Sha256Digest.self, forKey: .taskSpecDigest))
        case "attempt.state-changed":
            payload = .attemptStateChanged(from: try d.decode(AttemptState.self, forKey: .from),
                                           to: try d.decode(AttemptState.self, forKey: .to),
                                           blocker: try d.decodeIfPresent(Blocker.self, forKey: .blocker),
                                           outcome: try d.decodeIfPresent(AttemptOutcome.self, forKey: .outcome))
        case "attempt.desired-state-changed":
            payload = .attemptDesiredStateChanged(from: try d.decode(AttemptDesiredState.self, forKey: .from),
                                                  to: try d.decode(AttemptDesiredState.self, forKey: .to),
                                                  reason: try d.decodeIfPresent(String.self, forKey: .reason))
        case "attempt.fence-claimed":
            payload = .attemptFenceClaimed(previousFence: try d.decode(Int.self, forKey: .previousFence),
                                           newFence: try d.decode(Int.self, forKey: .newFence),
                                           ownerId: try d.decode(String.self, forKey: .ownerId))
        case "attempt.unblock-answered":
            payload = .attemptUnblockAnswered(stepId: try d.decode(StepID.self, forKey: .stepId),
                                              answer: try d.decode(String.self, forKey: .answer))
        case "step.created":
            payload = .stepCreated(stepId: try d.decode(StepID.self, forKey: .stepId),
                                   ordinal: try d.decode(Int.self, forKey: .ordinal),
                                   operation: try d.decode(NamespacedCode.self, forKey: .operation),
                                   inputDigest: try d.decode(Sha256Digest.self, forKey: .inputDigest))
        case "step.state-changed":
            payload = .stepStateChanged(stepId: try d.decode(StepID.self, forKey: .stepId),
                                        from: try d.decode(StepState.self, forKey: .from),
                                        to: try d.decode(StepState.self, forKey: .to),
                                        outputDigest: try d.decodeIfPresent(Sha256Digest.self, forKey: .outputDigest),
                                        failureCode: try d.decodeIfPresent(NamespacedCode.self, forKey: .failureCode))
        case "evidence.recorded":
            payload = .evidenceRecorded(evidenceId: try d.decode(EvidenceID.self, forKey: .evidenceId),
                                        evidenceDigest: try d.decode(Sha256Digest.self, forKey: .evidenceDigest))
        case "commit.recorded":
            payload = .commitRecorded(commit: try d.decode(GitObjectID.self, forKey: .commit),
                                      tree: try d.decode(GitObjectID.self, forKey: .tree),
                                      attemptMarker: try d.decode(String.self, forKey: .attemptMarker))
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "Unknown event type \(type)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(eventId, forKey: .eventId)
        try c.encode(attemptId, forKey: .attemptId)
        try c.encode(sequence, forKey: .sequence)
        try c.encode(occurredAt, forKey: .occurredAt)
        try c.encode(commandId, forKey: .commandId)
        try c.encode(causationEventId, forKey: .causationEventId)
        try c.encode(fence, forKey: .fence)
        try c.encode(payload.type, forKey: .type)
        var d = c.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        switch payload {
        case let .attemptCreated(taskId, taskSpecDigest):
            try d.encode(taskId, forKey: .taskId)
            try d.encode(taskSpecDigest, forKey: .taskSpecDigest)
        case let .attemptStateChanged(from, to, blocker, outcome):
            try d.encode(from, forKey: .from)
            try d.encode(to, forKey: .to)
            try d.encode(blocker, forKey: .blocker)
            try d.encode(outcome, forKey: .outcome)
        case let .attemptDesiredStateChanged(from, to, reason):
            try d.encode(from, forKey: .from)
            try d.encode(to, forKey: .to)
            try d.encode(reason, forKey: .reason)
        case let .attemptFenceClaimed(previousFence, newFence, ownerId):
            try d.encode(previousFence, forKey: .previousFence)
            try d.encode(newFence, forKey: .newFence)
            try d.encode(ownerId, forKey: .ownerId)
        case let .attemptUnblockAnswered(stepId, answer):
            try d.encode(stepId, forKey: .stepId)
            try d.encode(answer, forKey: .answer)
        case let .stepCreated(stepId, ordinal, operation, inputDigest):
            try d.encode(stepId, forKey: .stepId)
            try d.encode(ordinal, forKey: .ordinal)
            try d.encode(operation, forKey: .operation)
            try d.encode(inputDigest, forKey: .inputDigest)
        case let .stepStateChanged(stepId, from, to, outputDigest, failureCode):
            try d.encode(stepId, forKey: .stepId)
            try d.encode(from, forKey: .from)
            try d.encode(to, forKey: .to)
            try d.encode(outputDigest, forKey: .outputDigest)
            try d.encode(failureCode, forKey: .failureCode)
        case let .evidenceRecorded(evidenceId, evidenceDigest):
            try d.encode(evidenceId, forKey: .evidenceId)
            try d.encode(evidenceDigest, forKey: .evidenceDigest)
        case let .commitRecorded(commit, tree, attemptMarker):
            try d.encode(commit, forKey: .commit)
            try d.encode(tree, forKey: .tree)
            try d.encode(attemptMarker, forKey: .attemptMarker)
        }
    }
}

public struct AttemptEventsPage: Hashable, Sendable, Codable {
    public var events: [AttemptEvent]
    public var nextAfterSequence: Int

    public init(events: [AttemptEvent], nextAfterSequence: Int) {
        self.events = events
        self.nextAfterSequence = nextAfterSequence
    }
}

// MARK: Task spec (task-spec.ts) — the payload of task.submit / task.run

public enum AcceptanceVerification: String, Hashable, Sendable, Codable, CaseIterable {
    case automated, review
    case `operator`
}

public struct AcceptanceCriterion: Hashable, Sendable, Codable {
    public var id: StableKey
    public var statement: String
    public var verification: AcceptanceVerification

    public init(id: StableKey, statement: String, verification: AcceptanceVerification) {
        self.id = id
        self.statement = statement
        self.verification = verification
    }
}

public struct TaskSpec: Hashable, Sendable, Codable {
    public struct Base: Hashable, Sendable, Codable {
        public var repositoryId: RepositoryID
        public var commit: GitObjectID
        public init(repositoryId: RepositoryID, commit: GitObjectID) {
            self.repositoryId = repositoryId
            self.commit = commit
        }
    }
    public struct RequestedScope: Hashable, Sendable, Codable {
        public var paths: [RelativePath]
        public init(paths: [RelativePath]) { self.paths = paths }
    }

    public var schemaVersion: SchemaVersion1 = .init()
    public var taskId: TaskID
    public var projectId: ProjectID
    public var createdAt: IsoInstant
    public var title: String
    public var objective: String
    public var acceptanceCriteria: [AcceptanceCriterion]
    public var base: Base
    public var requestedScope: RequestedScope
    public var policyDigest: Sha256Digest

    public init(taskId: TaskID, projectId: ProjectID, createdAt: IsoInstant, title: String, objective: String,
                acceptanceCriteria: [AcceptanceCriterion], base: Base, requestedScope: RequestedScope,
                policyDigest: Sha256Digest) {
        self.taskId = taskId
        self.projectId = projectId
        self.createdAt = createdAt
        self.title = title
        self.objective = objective
        self.acceptanceCriteria = acceptanceCriteria
        self.base = base
        self.requestedScope = requestedScope
        self.policyDigest = policyDigest
    }
}
