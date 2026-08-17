import Foundation

// MARK: - Studio assistant (studio-assistant.ts + the studio.assistant.* wrappers in command-protocol.ts)
//
// Mirrors `packages/contracts/src/v1/studio-assistant.ts` on `studio/service-skeleton` (tip cdfe558).
// The daemon-side responder is a deterministic, rules-based baseline — no LLM — documented on
// `computeAssistantAnswerV1` / `proposeAssistantIntentV1` in `apps/daemon/src/studio-command-runtime.ts`.
// It answers only from a `StudioSnapshotV1` it already holds and cites exactly what it read; when it
// cannot honestly answer it returns `cannotAnswer` instead of a guess.

public struct AssistantQuery: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var question: String
    /// `nil` asks over the whole portfolio.
    public var projectId: ProjectID?

    public init(question: String, projectId: ProjectID?) {
        self.question = question
        self.projectId = projectId
    }

    private enum CodingKeys: String, CodingKey { case schemaVersion, question, projectId }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(question, forKey: .question)
        try c.encode(projectId, forKey: .projectId)
    }
}

public enum AssistantCitationKind: String, Hashable, Sendable, Codable, CaseIterable {
    case attempt, milestone, gate, doc
}

/// `id`'s shape depends on `kind` (an attempt UUID, a milestone id, a gate name, a digest) — plain
/// `String` on the wire, not a branded type.
public struct AssistantCitation: Hashable, Sendable, Codable, Identifiable {
    public var kind: AssistantCitationKind
    public var id: String

    public init(kind: AssistantCitationKind, id: String) {
        self.kind = kind
        self.id = id
    }
}

public enum AssistantCannotAnswerReason: String, Hashable, Sendable, Codable, CaseIterable {
    case noMilestoneTargetDate = "no-milestone-target-date"
    case noMatchingProject = "no-matching-project"
    case noMatchingData = "no-matching-data"
}

/// `AssistantAnswerV1` — `kind`-discriminated. `"answered"` always carries at least one citation:
/// the responder is structurally unable to state a fact it cannot point at.
public enum AssistantAnswer: Hashable, Sendable {
    case answered(text: String, citations: [AssistantCitation])
    case cannotAnswer(reason: AssistantCannotAnswerReason, detail: String)
}

extension AssistantAnswer: Codable {
    private enum CodingKeys: String, CodingKey { case kind, schemaVersion, text, citations, cannotAnswer }
    private enum ReasonKeys: String, CodingKey { case reason, detail }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "answered":
            self = .answered(text: try c.decode(String.self, forKey: .text),
                             citations: try c.decode([AssistantCitation].self, forKey: .citations))
        case "cannot-answer":
            let inner = try c.nestedContainer(keyedBy: ReasonKeys.self, forKey: .cannotAnswer)
            self = .cannotAnswer(reason: try inner.decode(AssistantCannotAnswerReason.self, forKey: .reason),
                                 detail: try inner.decode(String.self, forKey: .detail))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown assistant answer kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(SchemaVersion1(), forKey: .schemaVersion)
        switch self {
        case let .answered(text, citations):
            try c.encode("answered", forKey: .kind)
            try c.encode(text, forKey: .text)
            try c.encode(citations, forKey: .citations)
        case let .cannotAnswer(reason, detail):
            try c.encode("cannot-answer", forKey: .kind)
            var inner = c.nestedContainer(keyedBy: ReasonKeys.self, forKey: .cannotAnswer)
            try inner.encode(reason, forKey: .reason)
            try inner.encode(detail, forKey: .detail)
        }
    }
}

// MARK: Intents

public enum AssistantIntentKind: String, Hashable, Sendable, Codable, CaseIterable {
    case queueTask = "queue-task"
    case runPhase = "run-phase"
    case scanProject = "scan-project"
    case enrollProject = "enroll-project"
    case approveAttempt = "approve-attempt"
    case proposePlan = "propose-plan"
    case executePlan = "execute-plan"
}

/// `AssistantIntentPayloadV1` — `kind`-discriminated; each arm's fields are exactly the payload of
/// the one daemon command `studio.assistant.intent.execute` dispatches to on confirm (named per arm).
public enum AssistantIntentPayload: Hashable, Sendable {
    /// -> task.submit
    case queueTask(taskSpec: TaskSpec)
    /// -> task.run
    case runPhase(taskSpec: TaskSpec)
    /// -> project.scan
    case scanProject(repositoryRoot: AbsolutePath)
    /// -> project.apply
    case enrollProject(planDigest: Sha256Digest, branchName: GitBranchName?)
    /// -> attempt.unblock
    case approveAttempt(attemptId: AttemptID, answer: String)
    /// -> plan.propose
    case proposePlan(brief: ProjectPlanBrief, presetId: PhasePresetId, projectId: ProjectID?, repositoryId: RepositoryID?)
    /// -> plan.execute
    case executePlan(planId: ProjectPlanID, expectedRevision: Int)

    public var kind: AssistantIntentKind {
        switch self {
        case .queueTask: return .queueTask
        case .runPhase: return .runPhase
        case .scanProject: return .scanProject
        case .enrollProject: return .enrollProject
        case .approveAttempt: return .approveAttempt
        case .proposePlan: return .proposePlan
        case .executePlan: return .executePlan
        }
    }

    /// The identifier(s) the daemon requires to appear literally in a proposing utterance
    /// (`identifiersOf` in `studio-command-runtime.ts`).
    public var identifiers: [String] {
        switch self {
        case .queueTask(let taskSpec), .runPhase(let taskSpec): return [taskSpec.taskId.rawValue]
        case .scanProject(let repositoryRoot): return [repositoryRoot.rawValue]
        case .enrollProject(let planDigest, _): return [planDigest.rawValue]
        case .approveAttempt(let attemptId, _): return [attemptId.rawValue]
        case .proposePlan(let brief, _, _, _): return [brief.title]
        case .executePlan(let planId, _): return [planId.rawValue]
        }
    }

    /// The fixed phrase prefix an utterance proposing this kind must start with
    /// (`INTENT_PHRASE_PREFIX_V1` in `studio-command-runtime.ts`).
    public static func phrasePrefix(for kind: AssistantIntentKind) -> String {
        switch kind {
        case .queueTask: return "queue "
        case .runPhase: return "run "
        case .scanProject: return "scan "
        case .enrollProject: return "enroll "
        case .approveAttempt: return "approve "
        case .proposePlan: return "propose "
        case .executePlan: return "execute "
        }
    }
}

extension AssistantIntentPayload: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, taskSpec, repositoryRoot, planDigest, branchName, attemptId, answer, brief, presetId, projectId,
             repositoryId, planId, expectedRevision
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(AssistantIntentKind.self, forKey: .kind)
        switch kind {
        case .queueTask: self = .queueTask(taskSpec: try c.decode(TaskSpec.self, forKey: .taskSpec))
        case .runPhase: self = .runPhase(taskSpec: try c.decode(TaskSpec.self, forKey: .taskSpec))
        case .scanProject: self = .scanProject(repositoryRoot: try c.decode(AbsolutePath.self, forKey: .repositoryRoot))
        case .enrollProject:
            self = .enrollProject(planDigest: try c.decode(Sha256Digest.self, forKey: .planDigest),
                                  branchName: try c.decodeIfPresent(GitBranchName.self, forKey: .branchName))
        case .approveAttempt:
            self = .approveAttempt(attemptId: try c.decode(AttemptID.self, forKey: .attemptId),
                                   answer: try c.decode(String.self, forKey: .answer))
        case .proposePlan:
            self = .proposePlan(brief: try c.decode(ProjectPlanBrief.self, forKey: .brief),
                                presetId: try c.decode(PhasePresetId.self, forKey: .presetId),
                                projectId: try c.decodeIfPresent(ProjectID.self, forKey: .projectId),
                                repositoryId: try c.decodeIfPresent(RepositoryID.self, forKey: .repositoryId))
        case .executePlan:
            self = .executePlan(planId: try c.decode(ProjectPlanID.self, forKey: .planId),
                                expectedRevision: try c.decode(Int.self, forKey: .expectedRevision))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        switch self {
        case .queueTask(let taskSpec), .runPhase(let taskSpec):
            try c.encode(taskSpec, forKey: .taskSpec)
        case .scanProject(let repositoryRoot):
            try c.encode(repositoryRoot, forKey: .repositoryRoot)
        case let .enrollProject(planDigest, branchName):
            try c.encode(planDigest, forKey: .planDigest)
            try c.encode(branchName, forKey: .branchName)
        case let .approveAttempt(attemptId, answer):
            try c.encode(attemptId, forKey: .attemptId)
            try c.encode(answer, forKey: .answer)
        case let .proposePlan(brief, presetId, projectId, repositoryId):
            try c.encode(brief, forKey: .brief)
            try c.encode(presetId, forKey: .presetId)
            try c.encode(projectId, forKey: .projectId)
            try c.encode(repositoryId, forKey: .repositoryId)
        case let .executePlan(planId, expectedRevision):
            try c.encode(planId, forKey: .planId)
            try c.encode(expectedRevision, forKey: .expectedRevision)
        }
    }
}

/// `AssistantIntentV1` — a daemon-proposed, not-yet-executed action. `requiresConfirmation` is
/// always `true` in this daemon version (every payload mutates durable state), kept as a real `Bool`
/// rather than a literal for forward compatibility.
public struct AssistantIntent: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var intentId: AssistantIntentID
    public var utterance: String
    public var payload: AssistantIntentPayload
    public var summary: String
    public var requiresConfirmation: Bool
    public var proposedAt: IsoInstant

    public var id: AssistantIntentID { intentId }

    public init(intentId: AssistantIntentID, utterance: String, payload: AssistantIntentPayload, summary: String,
                requiresConfirmation: Bool, proposedAt: IsoInstant) {
        self.intentId = intentId
        self.utterance = utterance
        self.payload = payload
        self.summary = summary
        self.requiresConfirmation = requiresConfirmation
        self.proposedAt = proposedAt
    }
}

/// `AssistantIntentExecutionOutcomeV1` — tags which existing daemon operation
/// `studio.assistant.intent.execute` actually dispatched to, and embeds that operation's own result
/// verbatim. Only the three kinds with an `attemptId` in their result carry one here; scan/enroll/
/// plan.propose/plan.execute do not.
public enum AssistantIntentExecutionOutcome: Hashable, Sendable {
    case taskSubmit(AcceptedAttemptResult)
    case taskRun(AcceptedAttemptResult)
    case projectScan(ProjectScanResult)
    case projectApply(ProjectApplyResult)
    case attemptUnblock(UnblockResult)
    case planPropose(ProjectPlanResult)
    case planExecute(ProjectPlanResult)

    /// The resulting attempt id, when this outcome produced one.
    public var attemptId: AttemptID? {
        switch self {
        case .taskSubmit(let r), .taskRun(let r): return r.attemptId
        case .attemptUnblock(let r): return r.attemptId
        case .projectScan, .projectApply, .planPropose, .planExecute: return nil
        }
    }

    /// The resulting plan, when this outcome is `plan.propose`/`plan.execute` — what the corner
    /// chat's confirmation card uses to open the planner on confirm.
    public var plan: ProjectPlan? {
        switch self {
        case .planPropose(let r), .planExecute(let r): return r.plan
        default: return nil
        }
    }
}

extension AssistantIntentExecutionOutcome: Codable {
    private enum CodingKeys: String, CodingKey { case kind, result }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "task.submit": self = .taskSubmit(try c.decode(AcceptedAttemptResult.self, forKey: .result))
        case "task.run": self = .taskRun(try c.decode(AcceptedAttemptResult.self, forKey: .result))
        case "project.scan": self = .projectScan(try c.decode(ProjectScanResult.self, forKey: .result))
        case "project.apply": self = .projectApply(try c.decode(ProjectApplyResult.self, forKey: .result))
        case "attempt.unblock": self = .attemptUnblock(try c.decode(UnblockResult.self, forKey: .result))
        case "plan.propose": self = .planPropose(try c.decode(ProjectPlanResult.self, forKey: .result))
        case "plan.execute": self = .planExecute(try c.decode(ProjectPlanResult.self, forKey: .result))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown intent execution outcome kind \(kind)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .taskSubmit(let r): try c.encode("task.submit", forKey: .kind); try c.encode(r, forKey: .result)
        case .taskRun(let r): try c.encode("task.run", forKey: .kind); try c.encode(r, forKey: .result)
        case .projectScan(let r): try c.encode("project.scan", forKey: .kind); try c.encode(r, forKey: .result)
        case .projectApply(let r): try c.encode("project.apply", forKey: .kind); try c.encode(r, forKey: .result)
        case .attemptUnblock(let r): try c.encode("attempt.unblock", forKey: .kind); try c.encode(r, forKey: .result)
        case .planPropose(let r): try c.encode("plan.propose", forKey: .kind); try c.encode(r, forKey: .result)
        case .planExecute(let r): try c.encode("plan.execute", forKey: .kind); try c.encode(r, forKey: .result)
        }
    }
}
