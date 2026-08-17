import Foundation

// MARK: - Phase Runner (phase-run.ts, `phase.run`/`phase.status`/`phase.list`/`phase.approve`/
// `phase.reject`) — the one place a `PhaseDefinition` actually executes.
//
// `PhaseRun` mirrors `ExecutionAttempt`'s state-machine shape deliberately: a run is a state
// machine, not a revisioned document — its `revision` is an optimistic-concurrency token for the
// state machine's own writes, not a document-CAS revision like `PhaseDefinition.revision`. A run is
// bound immutably to the exact bytes of the phase it executes (`phaseSnapshot`/`phaseSnapshotDigest`
// embed the whole definition as read at creation time); a later edit to the live phase never changes
// a past run.

public enum PhaseRunState: String, Hashable, Sendable, Codable, CaseIterable {
    case queued, running
    case awaitingHuman = "awaiting-human"
    case succeeded, failed, cancelled
}

/// Mirrors `AttemptOutcome`'s role: the terminal-state payload.
public enum PhaseRunOutcome: Hashable, Sendable {
    case succeeded
    case failed(code: PhaseRunFailureCode, summary: String)
    case cancelled(reason: String)
}

public enum PhaseRunFailureCode: String, Hashable, Sendable, Codable, CaseIterable {
    case participantError = "participant-error"
    case graderChangesRequired = "grader-changes-required"
    case outputSchemaInvalid = "output-schema-invalid"
    case outputCommitRejected = "output-commit-rejected"
    case rejected
}

extension PhaseRunOutcome: Codable {
    private enum CodingKeys: String, CodingKey { case kind, code, summary, reason }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "succeeded": self = .succeeded
        case "failed":
            self = .failed(code: try c.decode(PhaseRunFailureCode.self, forKey: .code),
                           summary: try c.decode(String.self, forKey: .summary))
        case "cancelled": self = .cancelled(reason: try c.decode(String.self, forKey: .reason))
        case let kind:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown phase run outcome kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .succeeded: try c.encode("succeeded", forKey: .kind)
        case let .failed(code, summary):
            try c.encode("failed", forKey: .kind)
            try c.encode(code, forKey: .code)
            try c.encode(summary, forKey: .summary)
        case let .cancelled(reason):
            try c.encode("cancelled", forKey: .kind)
            try c.encode(reason, forKey: .reason)
        }
    }
}

/// Direct commit-binding proof for one committed output: the broker commit/tree in the project's
/// enrolled mirror and the `factory/phase/<phaseId>/<runId>` branch it published on. Deliberately
/// not `EvidenceV1`/`EvidenceSubjectV1` — that envelope's subject shape is TaskSpec/attempt-shaped
/// and has no honest values for a phase run (no TaskSpec, no policy decision, no scheduler fence).
public struct PhaseRunOutputEvidence: Hashable, Sendable, Codable {
    public var commit: GitObjectID
    public var tree: GitObjectID
    public var branch: GitBranchName

    public init(commit: GitObjectID, tree: GitObjectID, branch: GitBranchName) {
        self.commit = commit
        self.tree = tree
        self.branch = branch
    }
}

/// One committed output. `path` reuses `PhaseOutput`'s own `docs/`-rooted path shape verbatim.
public struct PhaseRunOutput: Hashable, Sendable, Codable, Identifiable {
    public var path: PhaseOutputPath
    public var digest: Sha256Digest
    public var evidence: PhaseRunOutputEvidence

    public var id: String { path.rawValue }

    public init(path: PhaseOutputPath, digest: Sha256Digest, evidence: PhaseRunOutputEvidence) {
        self.path = path
        self.digest = digest
        self.evidence = evidence
    }
}

/// A phase grader judges prose outputs against `rules.acceptanceChecks`, not source-code diffs, so
/// findings are plain bounded text — no `findingId`/`ruleId`/`category`/`severity`/`locations` like
/// `ReviewReport`'s full code-review shape. `verdict` is only `pass|changesRequired`: a phase grader
/// either accepts the produced outputs or does not.
public struct PhaseRunGraderVerdict: Hashable, Sendable, Codable {
    public enum Verdict: String, Hashable, Sendable, Codable, CaseIterable {
        case pass
        case changesRequired = "changes-required"
    }

    public var verdict: Verdict
    public var findings: [String]

    public init(verdict: Verdict, findings: [String]) {
        self.verdict = verdict
        self.findings = findings
    }
}

public struct PhaseRunTokenUsage: Hashable, Sendable, Codable {
    public var totalTokens: Int
    public init(totalTokens: Int) { self.totalTokens = totalTokens }
}

/// The durable, attempt-shaped record of one execution of a `PhaseDefinition`.
public struct PhaseRun: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var phaseRunId: PhaseRunID
    /// The preset this run was launched through, when one was named; `nil` for a standalone phase.
    public var presetId: PhasePresetId?
    public var phaseId: PhaseId
    public var projectId: ProjectID
    public var phaseSnapshotDigest: Sha256Digest
    public var phaseSnapshot: PhaseDefinition
    public var state: PhaseRunState
    /// Optimistic-concurrency token for this run's own state-machine writes — not a document
    /// revision like `PhaseDefinition.revision`.
    public var revision: Int
    /// The persistent room a `chat`-mode run is bound to; always `nil` for every other mode.
    public var roomId: RoomID?
    public var outputs: [PhaseRunOutput]
    public var graderVerdict: PhaseRunGraderVerdict?
    public var tokenUsage: PhaseRunTokenUsage
    public var outcome: PhaseRunOutcome?
    public var createdAt: IsoInstant
    public var startedAt: IsoInstant?
    public var finishedAt: IsoInstant?
    public var updatedAt: IsoInstant

    public var id: PhaseRunID { phaseRunId }

    /// True when a human decision (`phase.approve`/`phase.reject`) is what this run is waiting on.
    public var isAwaitingHuman: Bool { state == .awaitingHuman }

    public init(phaseRunId: PhaseRunID, presetId: PhasePresetId?, phaseId: PhaseId, projectId: ProjectID,
                phaseSnapshotDigest: Sha256Digest, phaseSnapshot: PhaseDefinition, state: PhaseRunState, revision: Int,
                roomId: RoomID?, outputs: [PhaseRunOutput], graderVerdict: PhaseRunGraderVerdict?,
                tokenUsage: PhaseRunTokenUsage, outcome: PhaseRunOutcome?, createdAt: IsoInstant, startedAt: IsoInstant?,
                finishedAt: IsoInstant?, updatedAt: IsoInstant) {
        self.phaseRunId = phaseRunId
        self.presetId = presetId
        self.phaseId = phaseId
        self.projectId = projectId
        self.phaseSnapshotDigest = phaseSnapshotDigest
        self.phaseSnapshot = phaseSnapshot
        self.state = state
        self.revision = revision
        self.roomId = roomId
        self.outputs = outputs
        self.graderVerdict = graderVerdict
        self.tokenUsage = tokenUsage
        self.outcome = outcome
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.finishedAt = finishedAt
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, phaseRunId, presetId, phaseId, projectId, phaseSnapshotDigest, phaseSnapshot, state,
             revision, roomId, outputs, graderVerdict, tokenUsage, outcome, createdAt, startedAt, finishedAt, updatedAt
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(phaseRunId, forKey: .phaseRunId)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(phaseId, forKey: .phaseId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(phaseSnapshotDigest, forKey: .phaseSnapshotDigest)
        try c.encode(phaseSnapshot, forKey: .phaseSnapshot)
        try c.encode(state, forKey: .state)
        try c.encode(revision, forKey: .revision)
        try c.encode(roomId, forKey: .roomId)
        try c.encode(outputs, forKey: .outputs)
        try c.encode(graderVerdict, forKey: .graderVerdict)
        try c.encode(tokenUsage, forKey: .tokenUsage)
        try c.encode(outcome, forKey: .outcome)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(startedAt, forKey: .startedAt)
        try c.encode(finishedAt, forKey: .finishedAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

/// The wire input for `phase.run`: which phase to run, for which project, from which preset (if any).
public struct PhaseRunCreate: Hashable, Sendable, Codable {
    public var presetId: PhasePresetId?
    public var phaseId: PhaseId
    public var projectId: ProjectID
    /// Overrides the phase definition's own declared `inputs[]` for this run only, when non-nil.
    public var inputsOverride: [PhaseInputKind]?

    public init(presetId: PhasePresetId?, phaseId: PhaseId, projectId: ProjectID, inputsOverride: [PhaseInputKind]?) {
        self.presetId = presetId
        self.phaseId = phaseId
        self.projectId = projectId
        self.inputsOverride = inputsOverride
    }

    private enum CodingKeys: String, CodingKey { case presetId, phaseId, projectId, inputsOverride }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(phaseId, forKey: .phaseId)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(inputsOverride, forKey: .inputsOverride)
    }
}

public struct PhaseRunListCursor: Hashable, Sendable, Codable {
    public var updatedAt: IsoInstant
    public var phaseRunId: PhaseRunID
    public init(updatedAt: IsoInstant, phaseRunId: PhaseRunID) {
        self.updatedAt = updatedAt
        self.phaseRunId = phaseRunId
    }
}

public struct PhaseRunListQuery: Hashable, Sendable, Codable {
    public var projectId: ProjectID?
    public var state: PhaseRunState?
    public var after: PhaseRunListCursor?
    public var limit: Int

    public init(projectId: ProjectID? = nil, state: PhaseRunState? = nil, after: PhaseRunListCursor? = nil, limit: Int = 100) {
        self.projectId = projectId
        self.state = state
        self.after = after
        self.limit = limit
    }

    private enum CodingKeys: String, CodingKey { case projectId, state, after, limit }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(state, forKey: .state)
        try c.encode(after, forKey: .after)
        try c.encode(limit, forKey: .limit)
    }
}

public struct PhaseRunListPage: Hashable, Sendable, Codable {
    public var runs: [PhaseRun]
    public var nextAfter: PhaseRunListCursor?
    public var hasMore: Bool

    public init(runs: [PhaseRun], nextAfter: PhaseRunListCursor?, hasMore: Bool) {
        self.runs = runs
        self.nextAfter = nextAfter
        self.hasMore = hasMore
    }
}

/// `phase.approve`/`phase.reject` payload: which run, and why (reject only; approve reason is optional).
public struct PhaseRunDecision: Hashable, Sendable, Codable {
    public var phaseRunId: PhaseRunID
    public var reason: String?

    public init(phaseRunId: PhaseRunID, reason: String?) {
        self.phaseRunId = phaseRunId
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case phaseRunId, reason }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(phaseRunId, forKey: .phaseRunId)
        try c.encode(reason, forKey: .reason)
    }
}

// MARK: Command results

public struct PhaseRunResult: Hashable, Sendable, Codable {
    public var run: PhaseRun
    public init(run: PhaseRun) { self.run = run }
}
