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

/// The 21 wire operations, verbatim.
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
        }
    }
}

extension CommandResult: Decodable {
    private enum CodingKeys: String, CodingKey {
        case operation
        case attempt, events, nextAfterSequence, page, snapshot, status, manifest, manifestDigest
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
