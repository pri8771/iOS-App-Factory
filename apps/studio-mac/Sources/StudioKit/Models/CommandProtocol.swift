import Foundation

// MARK: - Command protocol v1 (command-protocol.ts)
//
// One JSONL frame per Unix-socket connection:
//
//   → {"protocolVersion":1,"requestId":…,"authorization":…,"request":{schemaVersion,commandId,issuedAt,origin,operation,payload}}\n
//   ← {"protocolVersion":1,"requestId":…,"ok":true,"result":{"operation":…,…}}\n
//   ← {"protocolVersion":1,"requestId":…|null,"ok":false,"error":{code,message,retryable}}\n
//
// `requestId` is the exact delivery identity; `commandId` + `issuedAt` are the durable command
// identity a retry preserves so the daemon can replay the same outcome.

public let commandProtocolVersion = 1

/// The 67 wire operations, verbatim. `studio.snapshot` and `studio.assistant.*` come from
/// `studio/service-skeleton` (tip cdfe558); `project.milestones.list` and `project.milestone.upsert`
/// come from `studio/milestones-and-phase` (tip 3cff9a7) — none of those six has merged to `main` as of
/// this writing, so `DaemonClient.isUnsupportedOperation` feature-detects them. The `room.*`
/// operations (`@app-factory/studio-rooms` — the transcript ops, the read-only
/// `room.participants.list` catalog, and Wave 8's `room.update`), `provider.*`, `settings.*`,
/// `usage.summary`, and `signal.*`/`insight.list` (Wave 8's provider registry, settings, token
/// ledger, and signals surfaces — see the Studio chat-first shell plan's "Architecture decisions")
/// are different: they are unconditionally registered on any daemon built from this contract (a
/// durable transcript even with the moderator disabled — see Room.swift's doc comment), so no
/// unsupported-operation fallback applies to any of them.
public enum CommandOperation: String, Hashable, Sendable, Codable, CaseIterable {
    case doctor
    case taskSubmit = "task.submit"
    case taskRun = "task.run"
    case attemptStatus = "attempt.status"
    case attemptEvents = "attempt.events"
    case attemptList = "attempt.list"
    case attemptPause = "attempt.pause"
    case attemptResume = "attempt.resume"
    case attemptCancel = "attempt.cancel"
    case taskRetry = "task.retry"
    case attemptUnblock = "attempt.unblock"
    case daemonReconcile = "daemon.reconcile"
    case evidenceList = "evidence.list"
    case evidenceInspect = "evidence.inspect"
    case evidenceVerify = "evidence.verify"
    case portfolioSnapshot = "portfolio.snapshot"
    case projectScan = "project.scan"
    case projectEnrollPlan = "project.enroll-plan"
    case projectApply = "project.apply"
    case effectsStatus = "effects.status"
    case effectsList = "effects.list"
    case studioSnapshot = "studio.snapshot"
    case studioAssistantQuery = "studio.assistant.query"
    case studioAssistantIntentPropose = "studio.assistant.intent.propose"
    case studioAssistantIntentExecute = "studio.assistant.intent.execute"
    case projectMilestonesList = "project.milestones.list"
    case projectMilestoneUpsert = "project.milestone.upsert"
    case roomCreate = "room.create"
    case roomList = "room.list"
    case roomPost = "room.post"
    case roomEvents = "room.events"
    case roomTyping = "room.typing"
    case roomParticipantsList = "room.participants.list"
    case roomUpdate = "room.update"
    case projectSeed = "project.seed"
    // Studio Phase 4 (`preset.*`/`phase.*`) — CRUD over durable, revisioned phase definitions and
    // the presets that bundle them. See `phase.ts`; no phase ever executes through these ops.
    case presetList = "preset.list"
    case presetUpsert = "preset.upsert"
    case phaseUpsert = "phase.upsert"
    // The Planner (`plan.*`) — see `project-plan.ts`.
    case planPropose = "plan.propose"
    case planEdit = "plan.edit"
    case planApprove = "plan.approve"
    case planExecute = "plan.execute"
    case planApproveGate = "plan.approve-gate"
    case planStatus = "plan.status"
    case planTick = "plan.tick"
    // Phase Runner (`phase.run`/`phase.status`/`phase.list`/`phase.approve`/`phase.reject`) — see
    // `phase-run.ts`; the one place a phase actually executes.
    case phaseRun = "phase.run"
    case phaseStatus = "phase.status"
    case phaseList = "phase.list"
    case phaseApprove = "phase.approve"
    case phaseReject = "phase.reject"
    // Studio Phase 6 step B — the release rail (`release-observation.ts`): `release.projection` is the
    // read-only view over the daemon's persisted App Store Connect observations; `release.observe`
    // takes a fresh, strictly GET-only one through the daemon's credential broker.
    case releaseObserve = "release.observe"
    case releaseProjection = "release.projection"
    // Provider registry (`provider.*`, provider.ts) — Wave 8, Architecture decisions 2-3.
    case providerList = "provider.list"
    case providerUpsert = "provider.upsert"
    case providerRemove = "provider.remove"
    case providerCredentialSet = "provider.credential.set"
    case providerHealth = "provider.health"
    // Studio settings (`settings.*`, settings.ts) — Wave 8, Architecture decision 4.
    case settingsGet = "settings.get"
    case settingsSet = "settings.set"
    // The honest token ledger's read side (`usage.summary`, token-usage.ts) — Wave 8, decision 6.
    case usageSummary = "usage.summary"
    // Signals (`signal.*`/`insight.list`, signal.ts) — Wave 8.
    case signalCreate = "signal.create"
    case signalList = "signal.list"
    case signalPause = "signal.pause"
    case signalResume = "signal.resume"
    case signalRunNow = "signal.run-now"
    case signalReschedule = "signal.reschedule"
    case insightList = "insight.list"
}

/// `CommandOriginV1Schema` — there is no "studio" origin on the wire yet; Studio speaks as
/// `dashboard` (command.ts line 12).
public enum CommandOrigin: String, Hashable, Sendable, Codable, CaseIterable {
    case cli, mcp, dashboard, system
}

// MARK: Identity

/// Delivery + durable identity for one command.
public struct CommandIdentity: Hashable, Sendable {
    public var requestId: RequestID
    public var commandId: CommandID
    public var issuedAt: IsoInstant

    public init(requestId: RequestID, commandId: CommandID, issuedAt: IsoInstant) {
        self.requestId = requestId
        self.commandId = commandId
        self.issuedAt = issuedAt
    }

    /// A brand-new identity.
    public static func fresh(now: Date = Date()) -> CommandIdentity {
        CommandIdentity(requestId: .generate(), commandId: .generate(), issuedAt: .now(now))
    }

    /// New delivery identity, same durable identity — what a retry after an ambiguous outcome sends.
    public func retrying() -> CommandIdentity {
        CommandIdentity(requestId: .generate(), commandId: commandId, issuedAt: issuedAt)
    }

    public var retryable: RetryableCommandIdentity { .init(commandId: commandId, issuedAt: issuedAt) }
}

/// The durable half of a command identity, handed back on ambiguous outcomes.
public struct RetryableCommandIdentity: Hashable, Sendable {
    public var commandId: CommandID
    public var issuedAt: IsoInstant

    public init(commandId: CommandID, issuedAt: IsoInstant) {
        self.commandId = commandId
        self.issuedAt = issuedAt
    }

    /// Mint a fresh delivery identity that preserves this durable identity.
    public func nextDelivery() -> CommandIdentity {
        CommandIdentity(requestId: .generate(), commandId: commandId, issuedAt: issuedAt)
    }
}

// MARK: Request frame

/// `CommandRequestFrameV1`. Generic over the payload so each operation's payload type is checked.
public struct CommandRequestFrame<Payload: Encodable & Sendable>: Encodable, Sendable {
    public var protocolVersion: Int = commandProtocolVersion
    public var requestId: RequestID
    public var authorization: String
    public var request: CommandRequest<Payload>

    public init(requestId: RequestID, authorization: String, request: CommandRequest<Payload>) {
        self.requestId = requestId
        self.authorization = authorization
        self.request = request
    }
}

public struct CommandRequest<Payload: Encodable & Sendable>: Encodable, Sendable {
    public var schemaVersion: Int = 1
    public var commandId: CommandID
    public var issuedAt: IsoInstant
    public var origin: CommandOrigin
    public var operation: CommandOperation
    public var payload: Payload

    public init(commandId: CommandID, issuedAt: IsoInstant, origin: CommandOrigin, operation: CommandOperation,
                payload: Payload) {
        self.commandId = commandId
        self.issuedAt = issuedAt
        self.origin = origin
        self.operation = operation
        self.payload = payload
    }
}

/// `{}` — the payload of doctor / portfolio.snapshot / effects.status.
public struct EmptyPayload: Encodable, Sendable, Hashable {
    public init() {}
    public func encode(to encoder: any Encoder) throws {
        _ = encoder.container(keyedBy: NoKeys.self)
    }
    private enum NoKeys: CodingKey {}
}

/// `release.observe` — newest-first builds read per app (1...200; Apple's page maximum).
public struct ReleaseObservePayload: Encodable, Sendable, Hashable {
    public var buildsLimit: Int
    public init(buildsLimit: Int = 5) { self.buildsLimit = buildsLimit }
}

public struct AttemptPayload: Encodable, Sendable, Hashable {
    public var attemptId: AttemptID
    public init(attemptId: AttemptID) { self.attemptId = attemptId }
}

public struct AttemptReasonPayload: Encodable, Sendable, Hashable {
    public var attemptId: AttemptID
    public var reason: String?
    public init(attemptId: AttemptID, reason: String?) {
        self.attemptId = attemptId
        self.reason = reason
    }
    private enum CodingKeys: String, CodingKey { case attemptId, reason }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(attemptId, forKey: .attemptId)
        try c.encode(reason, forKey: .reason)
    }
}

public struct AttemptEventsPayload: Encodable, Sendable, Hashable {
    public var attemptId: AttemptID
    public var afterSequence: Int
    public var limit: Int
    public init(attemptId: AttemptID, afterSequence: Int = 0, limit: Int = 100) {
        self.attemptId = attemptId
        self.afterSequence = afterSequence
        self.limit = limit
    }
}

public struct TaskSpecPayload: Encodable, Sendable, Hashable {
    public var taskSpec: TaskSpec
    public init(taskSpec: TaskSpec) { self.taskSpec = taskSpec }
}

public struct TaskRetryPayload: Encodable, Sendable, Hashable {
    public var taskId: TaskID
    public var attemptId: AttemptID
    public init(taskId: TaskID, attemptId: AttemptID) {
        self.taskId = taskId
        self.attemptId = attemptId
    }
}

public struct AttemptUnblockPayload: Encodable, Sendable, Hashable {
    public var attemptId: AttemptID
    public var answer: String
    public init(attemptId: AttemptID, answer: String) {
        self.attemptId = attemptId
        self.answer = answer
    }
}

public struct ReconcilePayload: Encodable, Sendable, Hashable {
    public var attemptId: AttemptID?
    public init(attemptId: AttemptID?) { self.attemptId = attemptId }
    private enum CodingKeys: String, CodingKey { case attemptId }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(attemptId, forKey: .attemptId)
    }
}

public struct EvidenceListPayload: Encodable, Sendable, Hashable {
    public var afterAttemptId: AttemptID?
    public var limit: Int
    public init(afterAttemptId: AttemptID? = nil, limit: Int = 50) {
        self.afterAttemptId = afterAttemptId
        self.limit = limit
    }
    private enum CodingKeys: String, CodingKey { case afterAttemptId, limit }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(afterAttemptId, forKey: .afterAttemptId)
        try c.encode(limit, forKey: .limit)
    }
}

public struct ProjectScanPayload: Encodable, Sendable, Hashable {
    public var repositoryRoot: AbsolutePath
    public init(repositoryRoot: AbsolutePath) { self.repositoryRoot = repositoryRoot }
}

public struct PlanDigestPayload: Encodable, Sendable, Hashable {
    public var planDigest: Sha256Digest
    public init(planDigest: Sha256Digest) { self.planDigest = planDigest }
}

public struct ProjectApplyPayload: Encodable, Sendable, Hashable {
    public var planDigest: Sha256Digest
    public var branchName: GitBranchName?
    public init(planDigest: Sha256Digest, branchName: GitBranchName?) {
        self.planDigest = planDigest
        self.branchName = branchName
    }
    private enum CodingKeys: String, CodingKey { case planDigest, branchName }
    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(planDigest, forKey: .planDigest)
        try c.encode(branchName, forKey: .branchName)
    }
}

// MARK: Studio Phase 2 payloads

public struct StudioAssistantQueryPayload: Encodable, Sendable, Hashable {
    public var query: AssistantQuery
    public init(query: AssistantQuery) { self.query = query }
}

public struct StudioAssistantIntentProposePayload: Encodable, Sendable, Hashable {
    public var utterance: String
    public var intent: AssistantIntentPayload
    public init(utterance: String, intent: AssistantIntentPayload) {
        self.utterance = utterance
        self.intent = intent
    }
}

public struct StudioAssistantIntentExecutePayload: Encodable, Sendable, Hashable {
    public var intent: AssistantIntent
    public init(intent: AssistantIntent) { self.intent = intent }
}

public struct ProjectMilestonesListPayload: Encodable, Sendable, Hashable {
    public var projectId: ProjectID
    public init(projectId: ProjectID) { self.projectId = projectId }
}

/// `project.milestone.upsert`'s payload IS `ProjectMilestoneUpsertV1Schema` directly (not nested
/// under a `payload.upsert` field) — `ProjectMilestoneUpsert` already has the hand-written
/// `encode(to:)` its nullable `expectedRevision` needs.
public typealias ProjectMilestoneUpsertPayload = ProjectMilestoneUpsert

// MARK: room.* payloads
//
// `room.create`'s payload IS `RoomCreateSpecV1` directly (not nested), mirroring
// `project.milestone.upsert` above — `RoomCreateSpec` already has the hand-written `encode(to:)` its
// nullable `projectId` needs.
public typealias RoomCreatePayload = RoomCreateSpec

public struct RoomListPayload: Encodable, Sendable, Hashable {
    public var limit: Int
    /// `false` (the default) hides archived rooms, so an existing caller's behavior is unchanged
    /// unless it opts in.
    public var includeArchived: Bool
    public init(limit: Int = 50, includeArchived: Bool = false) {
        self.limit = limit
        self.includeArchived = includeArchived
    }
}

public struct RoomPostPayload: Encodable, Sendable, Hashable {
    public var roomId: RoomID
    public var handle: RoomHumanHandle
    public var body: String
    public init(roomId: RoomID, handle: RoomHumanHandle, body: String) {
        self.roomId = roomId
        self.handle = handle
        self.body = body
    }
}

public struct RoomEventsPayload: Encodable, Sendable, Hashable {
    public var roomId: RoomID
    public var afterSequence: Int
    public var limit: Int
    public init(roomId: RoomID, afterSequence: Int = 0, limit: Int = 200) {
        self.roomId = roomId
        self.afterSequence = afterSequence
        self.limit = limit
    }
}

public struct RoomTypingPayload: Encodable, Sendable, Hashable {
    public var roomId: RoomID
    public var handle: RoomHumanHandle
    public var ttlMs: Int
    public init(roomId: RoomID, handle: RoomHumanHandle, ttlMs: Int) {
        self.roomId = roomId
        self.handle = handle
        self.ttlMs = ttlMs
    }
}

/// `room.update`'s payload IS `RoomUpdateSpec` directly, mirroring `room.create` above —
/// `RoomUpdateSpec` needs no hand-written `encode(to:)` of its own (see its doc comment: every field
/// is wire-`optional()`, not `nullable()`).
public typealias RoomUpdatePayload = RoomUpdateSpec

// MARK: project.seed payload

/// `project.seed`'s payload IS `ProjectSeedPayload` directly — no nullable fields, so the default
/// synthesized `Encodable` conformance (ProjectSeed.swift) is already exact.
public typealias ProjectSeedRequestPayload = ProjectSeedPayload

// MARK: Studio Phase 4 (`preset.*`/`phase.*`) payloads — phase.ts

/// `preset.upsert`'s payload IS `PhasePresetUpsert` directly, mirroring `project.milestone.upsert`.
public typealias PresetUpsertPayload = PhasePresetUpsert
/// `phase.upsert`'s payload IS `PhaseDefinitionUpsert` directly.
public typealias PhaseUpsertPayload = PhaseDefinitionUpsert

// MARK: The Planner (`plan.*`) payloads — project-plan.ts

public typealias PlanProposePayload = ProjectPlanPropose
public typealias PlanEditPayload = ProjectPlanEditBatch
public typealias PlanApprovePayload = ProjectPlanApprove
public typealias PlanExecutePayload = ProjectPlanExecute
public typealias PlanApproveGatePayload = ProjectPlanApproveGate
public typealias PlanTickPayload = ProjectPlanTick

public struct PlanStatusPayload: Encodable, Sendable, Hashable {
    public var planId: ProjectPlanID
    public init(planId: ProjectPlanID) { self.planId = planId }
}

// MARK: Phase Runner (`phase.run`/`phase.status`/`phase.list`/`phase.approve`/`phase.reject`)
// payloads — phase-run.ts

/// `phase.run`'s payload IS `PhaseRunCreate` directly.
public typealias PhaseRunRequestPayload = PhaseRunCreate
/// `phase.list`'s payload IS `PhaseRunListQuery` directly.
public typealias PhaseListPayload = PhaseRunListQuery
/// `phase.approve`/`phase.reject` share the same payload shape.
public typealias PhaseDecisionPayload = PhaseRunDecision

public struct PhaseStatusPayload: Encodable, Sendable, Hashable {
    public var phaseRunId: PhaseRunID
    public init(phaseRunId: PhaseRunID) { self.phaseRunId = phaseRunId }
}

// MARK: Results

public enum DaemonReadiness: String, Hashable, Sendable, Codable, CaseIterable {
    case ready, degraded
}

/// `DoctorCommandResultV1`.
public struct DoctorResult: Hashable, Sendable, Codable {
    public var readiness: DaemonReadiness
    public var daemonVersion: String
    public var protocolVersion: Int
    public var startedAt: IsoInstant
    public var issues: [String]

    public init(readiness: DaemonReadiness, daemonVersion: String, protocolVersion: Int, startedAt: IsoInstant,
                issues: [String]) {
        self.readiness = readiness
        self.daemonVersion = daemonVersion
        self.protocolVersion = protocolVersion
        self.startedAt = startedAt
        self.issues = issues
    }
}

/// task.submit / task.run / task.retry.
public struct AcceptedAttemptResult: Hashable, Sendable, Codable {
    public var taskId: TaskID
    public var attemptId: AttemptID
    public var state: AttemptState
    /// task.retry only.
    public var priorAttemptId: AttemptID?
}

/// attempt.pause / attempt.resume / attempt.cancel.
public struct DesiredStateResult: Hashable, Sendable, Codable {
    public var attemptId: AttemptID
    public var desiredState: AttemptDesiredState
    public var accepted: Bool
}

public struct UnblockResult: Hashable, Sendable, Codable {
    public var attemptId: AttemptID
    public var state: AttemptState
    public var accepted: Bool
}

public struct ReconcileResult: Hashable, Sendable, Codable {
    public var accepted: Bool
    public var reconciledAttemptIds: [AttemptID]
}

/// `studio.assistant.intent.execute`'s result: `{operation, intentId, outcome}`.
public struct StudioAssistantIntentExecuteResult: Hashable, Sendable, Codable {
    public var intentId: AssistantIntentID
    public var outcome: AssistantIntentExecutionOutcome
}

/// `CommandResultV1` — an `operation`-discriminated union.
public enum CommandResult: Sendable {
    case doctor(DoctorResult)
    case taskSubmit(AcceptedAttemptResult)
    case taskRun(AcceptedAttemptResult)
    case attemptStatus(ExecutionAttempt)
    case attemptEvents(AttemptEventsPage)
    case attemptList(AttemptListPage)
    case attemptPause(DesiredStateResult)
    case attemptResume(DesiredStateResult)
    case attemptCancel(DesiredStateResult)
    case taskRetry(AcceptedAttemptResult)
    case attemptUnblock(UnblockResult)
    case daemonReconcile(ReconcileResult)
    case evidenceList(EvidenceListPage)
    case evidenceInspect(EvidenceInspectResult)
    case evidenceVerify(EvidenceVerifyResult)
    case portfolioSnapshot(PortfolioReadModel)
    case projectScan(ProjectScanResult)
    case projectEnrollPlan(ProjectEnrollPlanResult)
    case projectApply(ProjectApplyResult)
    case effectsStatus(EffectStatus)
    case effectsList(EffectListPage)
    case studioSnapshot(StudioSnapshot)
    case studioAssistantQuery(AssistantAnswer)
    case studioAssistantIntentPropose(AssistantIntent)
    case studioAssistantIntentExecute(StudioAssistantIntentExecuteResult)
    case projectMilestonesList(ProjectMilestoneTimeline)
    case projectMilestoneUpsert(ProjectMilestoneUpsertResult)
    case roomCreate(RoomCreateResult)
    case roomList(RoomListResult)
    case roomPost(RoomPostResult)
    case roomEvents(RoomEventsResult)
    case roomTyping(RoomTypingResult)
    case roomParticipantsList(RoomParticipantsCatalog)
    case roomUpdate(Room)
    case projectSeed(ProjectSeedResult)
    case presetList([PhasePreset])
    case presetUpsert(PresetUpsertResult)
    case phaseUpsert(PhaseUpsertResult)
    case planPropose(ProjectPlan)
    case planEdit(ProjectPlan)
    case planApprove(ProjectPlan)
    case planExecute(ProjectPlan)
    case planApproveGate(ProjectPlan)
    case planStatus(ProjectPlan)
    case planTick(ProjectPlanTickResult)
    case phaseRun(PhaseRun)
    case phaseStatus(PhaseRun)
    case phaseList(PhaseRunListPage)
    case phaseApprove(PhaseRun)
    case phaseReject(PhaseRun)
    case releaseObserve(AscReleaseObservation)
    case releaseProjection(ReleaseProjection)
    case providerList([ProviderInstance])
    case providerUpsert(ProviderUpsertResult)
    case providerRemove(ProviderRemoveResult)
    case providerCredentialSet(ProviderCredentialSetResult)
    case providerHealth([ProviderHealthEntry])
    case settingsGet(StudioSettingEntry)
    case settingsSet(StudioSettingEntry)
    case usageSummary(UsageSummary)
    case signalCreate(Signal)
    case signalList([Signal])
    case signalPause(Signal)
    case signalResume(Signal)
    case signalRunNow(SignalRunNowResult)
    case signalReschedule(Signal)
    case insightList([SignalInsight])

    public var operation: CommandOperation {
        switch self {
        case .doctor: return .doctor
        case .taskSubmit: return .taskSubmit
        case .taskRun: return .taskRun
        case .attemptStatus: return .attemptStatus
        case .attemptEvents: return .attemptEvents
        case .attemptList: return .attemptList
        case .attemptPause: return .attemptPause
        case .attemptResume: return .attemptResume
        case .attemptCancel: return .attemptCancel
        case .taskRetry: return .taskRetry
        case .attemptUnblock: return .attemptUnblock
        case .daemonReconcile: return .daemonReconcile
        case .evidenceList: return .evidenceList
        case .evidenceInspect: return .evidenceInspect
        case .evidenceVerify: return .evidenceVerify
        case .portfolioSnapshot: return .portfolioSnapshot
        case .projectScan: return .projectScan
        case .projectEnrollPlan: return .projectEnrollPlan
        case .projectApply: return .projectApply
        case .effectsStatus: return .effectsStatus
        case .effectsList: return .effectsList
        case .studioSnapshot: return .studioSnapshot
        case .studioAssistantQuery: return .studioAssistantQuery
        case .studioAssistantIntentPropose: return .studioAssistantIntentPropose
        case .studioAssistantIntentExecute: return .studioAssistantIntentExecute
        case .projectMilestonesList: return .projectMilestonesList
        case .projectMilestoneUpsert: return .projectMilestoneUpsert
        case .roomCreate: return .roomCreate
        case .roomList: return .roomList
        case .roomPost: return .roomPost
        case .roomEvents: return .roomEvents
        case .roomTyping: return .roomTyping
        case .roomParticipantsList: return .roomParticipantsList
        case .roomUpdate: return .roomUpdate
        case .projectSeed: return .projectSeed
        case .presetList: return .presetList
        case .presetUpsert: return .presetUpsert
        case .phaseUpsert: return .phaseUpsert
        case .planPropose: return .planPropose
        case .planEdit: return .planEdit
        case .planApprove: return .planApprove
        case .planExecute: return .planExecute
        case .planApproveGate: return .planApproveGate
        case .planStatus: return .planStatus
        case .planTick: return .planTick
        case .phaseRun: return .phaseRun
        case .phaseStatus: return .phaseStatus
        case .phaseList: return .phaseList
        case .phaseApprove: return .phaseApprove
        case .phaseReject: return .phaseReject
        case .releaseObserve: return .releaseObserve
        case .releaseProjection: return .releaseProjection
        case .providerList: return .providerList
        case .providerUpsert: return .providerUpsert
        case .providerRemove: return .providerRemove
        case .providerCredentialSet: return .providerCredentialSet
        case .providerHealth: return .providerHealth
        case .settingsGet: return .settingsGet
        case .settingsSet: return .settingsSet
        case .usageSummary: return .usageSummary
        case .signalCreate: return .signalCreate
        case .signalList: return .signalList
        case .signalPause: return .signalPause
        case .signalResume: return .signalResume
        case .signalRunNow: return .signalRunNow
        case .signalReschedule: return .signalReschedule
        case .insightList: return .insightList
        }
    }
}

extension CommandResult: Decodable {
    private enum CodingKeys: String, CodingKey {
        case operation
        case attempt, events, nextAfterSequence, page, snapshot, status, manifest, manifestDigest
        case answer, intent, timeline
        case presets, run, plan, catalog
        case observation, projection
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let operation = try c.decode(CommandOperation.self, forKey: .operation)
        let single = try decoder.singleValueContainer()
        switch operation {
        case .doctor: self = .doctor(try single.decode(DoctorResult.self))
        case .taskSubmit: self = .taskSubmit(try single.decode(AcceptedAttemptResult.self))
        case .taskRun: self = .taskRun(try single.decode(AcceptedAttemptResult.self))
        case .attemptStatus: self = .attemptStatus(try c.decode(ExecutionAttempt.self, forKey: .attempt))
        case .attemptEvents:
            self = .attemptEvents(AttemptEventsPage(events: try c.decode([AttemptEvent].self, forKey: .events),
                                                    nextAfterSequence: try c.decode(Int.self, forKey: .nextAfterSequence)))
        case .attemptList: self = .attemptList(try c.decode(AttemptListPage.self, forKey: .page))
        case .attemptPause: self = .attemptPause(try single.decode(DesiredStateResult.self))
        case .attemptResume: self = .attemptResume(try single.decode(DesiredStateResult.self))
        case .attemptCancel: self = .attemptCancel(try single.decode(DesiredStateResult.self))
        case .taskRetry: self = .taskRetry(try single.decode(AcceptedAttemptResult.self))
        case .attemptUnblock: self = .attemptUnblock(try single.decode(UnblockResult.self))
        case .daemonReconcile: self = .daemonReconcile(try single.decode(ReconcileResult.self))
        case .evidenceList: self = .evidenceList(try single.decode(EvidenceListPage.self))
        case .evidenceInspect: self = .evidenceInspect(try single.decode(EvidenceInspectResult.self))
        case .evidenceVerify: self = .evidenceVerify(try single.decode(EvidenceVerifyResult.self))
        case .portfolioSnapshot: self = .portfolioSnapshot(try c.decode(PortfolioReadModel.self, forKey: .snapshot))
        case .projectScan: self = .projectScan(try single.decode(ProjectScanResult.self))
        case .projectEnrollPlan: self = .projectEnrollPlan(try single.decode(ProjectEnrollPlanResult.self))
        case .projectApply: self = .projectApply(try single.decode(ProjectApplyResult.self))
        case .effectsStatus: self = .effectsStatus(try c.decode(EffectStatus.self, forKey: .status))
        case .effectsList: self = .effectsList(try c.decode(EffectListPage.self, forKey: .page))
        case .studioSnapshot: self = .studioSnapshot(try c.decode(StudioSnapshot.self, forKey: .snapshot))
        case .studioAssistantQuery: self = .studioAssistantQuery(try c.decode(AssistantAnswer.self, forKey: .answer))
        case .studioAssistantIntentPropose: self = .studioAssistantIntentPropose(try c.decode(AssistantIntent.self, forKey: .intent))
        case .studioAssistantIntentExecute: self = .studioAssistantIntentExecute(try single.decode(StudioAssistantIntentExecuteResult.self))
        case .projectMilestonesList: self = .projectMilestonesList(try c.decode(ProjectMilestoneTimeline.self, forKey: .timeline))
        case .projectMilestoneUpsert: self = .projectMilestoneUpsert(try single.decode(ProjectMilestoneUpsertResult.self))
        case .roomCreate: self = .roomCreate(try single.decode(RoomCreateResult.self))
        case .roomList: self = .roomList(try single.decode(RoomListResult.self))
        case .roomPost: self = .roomPost(try single.decode(RoomPostResult.self))
        case .roomEvents: self = .roomEvents(try single.decode(RoomEventsResult.self))
        case .roomTyping: self = .roomTyping(try single.decode(RoomTypingResult.self))
        case .roomParticipantsList: self = .roomParticipantsList(try c.decode(RoomParticipantsCatalog.self, forKey: .catalog))
        case .roomUpdate: self = .roomUpdate(try single.decode(RoomUpdateResult.self).room)
        case .projectSeed: self = .projectSeed(try single.decode(ProjectSeedResult.self))
        case .presetList: self = .presetList(try c.decode([PhasePreset].self, forKey: .presets))
        case .presetUpsert: self = .presetUpsert(try single.decode(PresetUpsertResult.self))
        case .phaseUpsert: self = .phaseUpsert(try single.decode(PhaseUpsertResult.self))
        case .planPropose: self = .planPropose(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planEdit: self = .planEdit(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planApprove: self = .planApprove(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planExecute: self = .planExecute(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planApproveGate: self = .planApproveGate(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planStatus: self = .planStatus(try c.decode(ProjectPlan.self, forKey: .plan))
        case .planTick: self = .planTick(try single.decode(ProjectPlanTickResult.self))
        case .phaseRun: self = .phaseRun(try c.decode(PhaseRun.self, forKey: .run))
        case .phaseStatus: self = .phaseStatus(try c.decode(PhaseRun.self, forKey: .run))
        case .phaseList: self = .phaseList(try c.decode(PhaseRunListPage.self, forKey: .page))
        case .phaseApprove: self = .phaseApprove(try c.decode(PhaseRun.self, forKey: .run))
        case .phaseReject: self = .phaseReject(try c.decode(PhaseRun.self, forKey: .run))
        case .releaseObserve: self = .releaseObserve(try c.decode(AscReleaseObservation.self, forKey: .observation))
        case .releaseProjection: self = .releaseProjection(try c.decode(ReleaseProjection.self, forKey: .projection))
        case .providerList: self = .providerList(try single.decode(ProviderListResult.self).providers)
        case .providerUpsert: self = .providerUpsert(try single.decode(ProviderUpsertResult.self))
        case .providerRemove: self = .providerRemove(try single.decode(ProviderRemoveResult.self))
        case .providerCredentialSet: self = .providerCredentialSet(try single.decode(ProviderCredentialSetResult.self))
        case .providerHealth: self = .providerHealth(try single.decode(ProviderHealthResult.self).reports)
        case .settingsGet: self = .settingsGet(try single.decode(SettingsResult.self).entry)
        case .settingsSet: self = .settingsSet(try single.decode(SettingsResult.self).entry)
        case .usageSummary: self = .usageSummary(try single.decode(UsageSummaryResult.self).summary)
        case .signalCreate: self = .signalCreate(try single.decode(SignalResult.self).signal)
        case .signalList: self = .signalList(try single.decode(SignalListResult.self).signals)
        case .signalPause: self = .signalPause(try single.decode(SignalResult.self).signal)
        case .signalResume: self = .signalResume(try single.decode(SignalResult.self).signal)
        case .signalRunNow: self = .signalRunNow(try single.decode(SignalRunNowResult.self))
        case .signalReschedule: self = .signalReschedule(try single.decode(SignalResult.self).signal)
        case .insightList: self = .insightList(try single.decode(InsightListResult.self).insights)
        }
    }
}

// MARK: Response

/// `CommandProtocolErrorV1`.
public struct CommandProtocolError: Hashable, Sendable, Codable {
    public var code: String
    public var message: String
    public var retryable: Bool

    public init(code: String, message: String, retryable: Bool) {
        self.code = code
        self.message = message
        self.retryable = retryable
    }
}

/// `CommandResponseV1` — `ok`-discriminated.
public enum CommandResponse: Sendable {
    case success(requestId: RequestID, result: CommandResult)
    case failure(requestId: RequestID?, error: CommandProtocolError)

    public var requestId: RequestID? {
        switch self {
        case .success(let requestId, _): return requestId
        case .failure(let requestId, _): return requestId
        }
    }
}

extension CommandResponse: Decodable {
    private enum CodingKeys: String, CodingKey { case protocolVersion, requestId, ok, result, error }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .protocolVersion)
        guard version == commandProtocolVersion else {
            throw DecodingError.dataCorruptedError(forKey: .protocolVersion, in: c,
                                                   debugDescription: "Unsupported protocol version \(version)")
        }
        let ok = try c.decode(Bool.self, forKey: .ok)
        if ok {
            self = .success(requestId: try c.decode(RequestID.self, forKey: .requestId),
                            result: try c.decode(CommandResult.self, forKey: .result))
        } else {
            self = .failure(requestId: try c.decodeIfPresent(RequestID.self, forKey: .requestId),
                            error: try c.decode(CommandProtocolError.self, forKey: .error))
        }
    }
}
