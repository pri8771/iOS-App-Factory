import Foundation

// MARK: - DaemonClient
//
// The Swift twin of packages/command-client/src/index.ts. An actor so in-flight sessions and the
// closed flag are serialised; the wire work itself happens on Network.framework's queue.
//
// Semantics preserved from the Node client:
//   * one JSONL frame per Unix-socket connection, read to EOF
//   * requestId per delivery; commandId + issuedAt are the durable identity a retry keeps
//   * every retryable failure carries `retryIdentity` so the caller can re-send the same command
//   * response requestId and operation are checked against what was dispatched
//   * portfolio.snapshot re-verifies `sourceSnapshotDigest` client-side

public actor DaemonClient {

    public struct Configuration: Sendable {
        public static let defaultTimeout: Duration = .seconds(30)
        public static let defaultMaxRequestBytes = 1024 * 1024
        public static let defaultMaxResponseBytes = 4 * 1024 * 1024
        public static let maxUnixSocketPathBytes = 100

        public var socketPath: String
        public var authorization: AuthorizationToken
        public var origin: CommandOrigin
        public var timeout: Duration
        public var maxRequestBytes: Int
        public var maxResponseBytes: Int

        public init(socketPath: String, authorization: AuthorizationToken, origin: CommandOrigin = .dashboard,
                    timeout: Duration = Configuration.defaultTimeout,
                    maxRequestBytes: Int = Configuration.defaultMaxRequestBytes,
                    maxResponseBytes: Int = Configuration.defaultMaxResponseBytes) {
            self.socketPath = socketPath
            self.authorization = authorization
            self.origin = origin
            self.timeout = timeout
            self.maxRequestBytes = maxRequestBytes
            self.maxResponseBytes = maxResponseBytes
        }
    }

    public let configuration: Configuration
    private let queue = DispatchQueue(label: "studio.daemon-client", qos: .userInitiated)
    private var sessions: [ObjectIdentifier: ExchangeSession] = [:]
    private var isClosed = false

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }()

    public init(configuration: Configuration) throws {
        let path = configuration.socketPath
        guard path.hasPrefix("/"), path.utf8.count <= Configuration.maxUnixSocketPathBytes else {
            throw DaemonClientError.invalidSocketPath
        }
        self.configuration = configuration
    }

    public var closed: Bool { isClosed }

    /// Cancels in-flight exchanges. Dispatched ones surface `client.closed-after-dispatch` (retryable).
    public func close() {
        guard !isClosed else { return }
        isClosed = true
        for session in sessions.values { session.cancelByClose() }
        sessions.removeAll()
    }

    // MARK: Identity

    public nonisolated func createIdentity() -> CommandIdentity { .fresh() }

    public nonisolated func createRetryIdentity(_ original: RetryableCommandIdentity) -> CommandIdentity {
        original.nextDelivery()
    }

    // MARK: Operations

    public func doctor(identity: CommandIdentity? = nil) async throws -> DoctorResult {
        guard case .doctor(let result) = try await request(.doctor, EmptyPayload(), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func submit(_ taskSpec: TaskSpec, identity: CommandIdentity? = nil) async throws -> AcceptedAttemptResult {
        guard case .taskSubmit(let result) = try await request(.taskSubmit, TaskSpecPayload(taskSpec: taskSpec), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func run(_ taskSpec: TaskSpec, identity: CommandIdentity? = nil) async throws -> AcceptedAttemptResult {
        guard case .taskRun(let result) = try await request(.taskRun, TaskSpecPayload(taskSpec: taskSpec), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func status(attemptId: AttemptID, identity: CommandIdentity? = nil) async throws -> ExecutionAttempt {
        guard case .attemptStatus(let result) = try await request(.attemptStatus, AttemptPayload(attemptId: attemptId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func events(attemptId: AttemptID, afterSequence: Int = 0, limit: Int = 100,
                       identity: CommandIdentity? = nil) async throws -> AttemptEventsPage {
        let payload = AttemptEventsPayload(attemptId: attemptId, afterSequence: afterSequence, limit: limit)
        guard case .attemptEvents(let result) = try await request(.attemptEvents, payload, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func listAttempts(_ query: AttemptListQuery = AttemptListQuery(),
                             identity: CommandIdentity? = nil) async throws -> AttemptListPage {
        guard case .attemptList(let result) = try await request(.attemptList, query, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func pause(attemptId: AttemptID, reason: String? = nil, identity: CommandIdentity? = nil) async throws -> DesiredStateResult {
        guard case .attemptPause(let result) = try await request(.attemptPause, AttemptReasonPayload(attemptId: attemptId, reason: reason), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func resume(attemptId: AttemptID, reason: String? = nil, identity: CommandIdentity? = nil) async throws -> DesiredStateResult {
        guard case .attemptResume(let result) = try await request(.attemptResume, AttemptReasonPayload(attemptId: attemptId, reason: reason), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func cancel(attemptId: AttemptID, reason: String? = nil, identity: CommandIdentity? = nil) async throws -> DesiredStateResult {
        guard case .attemptCancel(let result) = try await request(.attemptCancel, AttemptReasonPayload(attemptId: attemptId, reason: reason), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    /// Retries a failed or cancelled terminal attempt as attempt N+1 of the same task.
    public func retry(taskId: TaskID, attemptId: AttemptID, identity: CommandIdentity? = nil) async throws -> AcceptedAttemptResult {
        guard case .taskRetry(let result) = try await request(.taskRetry, TaskRetryPayload(taskId: taskId, attemptId: attemptId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    /// Answers a blocker and resumes a blocked attempt's blocked step.
    public func unblock(attemptId: AttemptID, answer: String, identity: CommandIdentity? = nil) async throws -> UnblockResult {
        guard case .attemptUnblock(let result) = try await request(.attemptUnblock, AttemptUnblockPayload(attemptId: attemptId, answer: answer), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func reconcile(attemptId: AttemptID? = nil, identity: CommandIdentity? = nil) async throws -> ReconcileResult {
        guard case .daemonReconcile(let result) = try await request(.daemonReconcile, ReconcilePayload(attemptId: attemptId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func listEvidence(afterAttemptId: AttemptID? = nil, limit: Int = 50,
                             identity: CommandIdentity? = nil) async throws -> EvidenceListPage {
        let payload = EvidenceListPayload(afterAttemptId: afterAttemptId, limit: limit)
        guard case .evidenceList(let result) = try await request(.evidenceList, payload, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func inspectEvidence(attemptId: AttemptID, identity: CommandIdentity? = nil) async throws -> EvidenceInspectResult {
        guard case .evidenceInspect(let result) = try await request(.evidenceInspect, AttemptPayload(attemptId: attemptId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func verifyEvidence(attemptId: AttemptID, identity: CommandIdentity? = nil) async throws -> EvidenceVerifyResult {
        guard case .evidenceVerify(let result) = try await request(.evidenceVerify, AttemptPayload(attemptId: attemptId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    /// Fetches the portfolio and re-verifies `sourceSnapshotDigest` against the raw wire contents.
    public func portfolioSnapshot(identity: CommandIdentity? = nil) async throws -> PortfolioReadModel {
        let exchange = try await request(.portfolioSnapshot, EmptyPayload(), identity)
        guard case .portfolioSnapshot(let snapshot) = exchange.result else {
            throw DaemonClientError.responseOperationMismatch
        }
        guard let tree = try? JSONValue.parse(exchange.responseLine),
              let rawSnapshot = tree["result"]?["snapshot"]
        else { throw DaemonClientError.invalidResponse }
        do {
            try PortfolioDigest.verify(rawSnapshot)
        } catch {
            throw DaemonClientError.portfolioDigestMismatch
        }
        return snapshot
    }

    /// Scans an existing repository and persists an enrollment plan the operator can review or apply.
    public func scanProject(repositoryRoot: AbsolutePath, identity: CommandIdentity? = nil) async throws -> ProjectScanResult {
        guard case .projectScan(let result) = try await request(.projectScan, ProjectScanPayload(repositoryRoot: repositoryRoot), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func enrollmentPlan(planDigest: Sha256Digest, identity: CommandIdentity? = nil) async throws -> ProjectEnrollPlanResult {
        guard case .projectEnrollPlan(let result) = try await request(.projectEnrollPlan, PlanDigestPayload(planDigest: planDigest), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    /// Applies a previously scanned enrollment plan on a new branch. Durable and idempotent by command ID.
    public func applyEnrollmentPlan(planDigest: Sha256Digest, branchName: GitBranchName? = nil,
                                    identity: CommandIdentity? = nil) async throws -> ProjectApplyResult {
        let payload = ProjectApplyPayload(planDigest: planDigest, branchName: branchName)
        guard case .projectApply(let result) = try await request(.projectApply, payload, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func effectsStatus(identity: CommandIdentity? = nil) async throws -> EffectStatus {
        guard case .effectsStatus(let result) = try await request(.effectsStatus, EmptyPayload(), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    public func listEffects(_ query: EffectListQuery = EffectListQuery(),
                            identity: CommandIdentity? = nil) async throws -> EffectListPage {
        guard case .effectsList(let result) = try await request(.effectsList, query, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    // MARK: Studio Phase 2 (studio/service-skeleton, studio/milestones-and-phase — unmerged;
    // see `DaemonClientError.isUnsupportedOperation` for the feature-detection contract)

    /// Fetches the studio read model and re-verifies `sourceSnapshotDigest` against the raw wire
    /// contents, mirroring `portfolioSnapshot()`.
    public func studioSnapshot(identity: CommandIdentity? = nil) async throws -> StudioSnapshot {
        let exchange = try await request(.studioSnapshot, EmptyPayload(), identity)
        guard case .studioSnapshot(let snapshot) = exchange.result else {
            throw DaemonClientError.responseOperationMismatch
        }
        guard let tree = try? JSONValue.parse(exchange.responseLine),
              let rawSnapshot = tree["result"]?["snapshot"]
        else { throw DaemonClientError.invalidResponse }
        do {
            try StudioSnapshotDigest.verify(rawSnapshot)
        } catch {
            throw DaemonClientError.studioSnapshotDigestMismatch
        }
        return snapshot
    }

    /// Asks the deterministic, rules-based corner-chat responder a question grounded in the current
    /// studio snapshot.
    public func assistantQuery(_ query: AssistantQuery, identity: CommandIdentity? = nil) async throws -> AssistantAnswer {
        guard case .studioAssistantQuery(let answer) = try await request(.studioAssistantQuery, StudioAssistantQueryPayload(query: query), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return answer
    }

    /// Proposes an intent from a chat utterance; the daemon re-validates `utterance` against `payload`
    /// deterministically and does not execute anything yet.
    public func proposeIntent(utterance: String, payload: AssistantIntentPayload,
                              identity: CommandIdentity? = nil) async throws -> AssistantIntent {
        let request = StudioAssistantIntentProposePayload(utterance: utterance, intent: payload)
        guard case .studioAssistantIntentPropose(let intent) = try await self.request(.studioAssistantIntentPropose, request, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return intent
    }

    /// Confirms a previously proposed intent. The daemon re-validates it from scratch and dispatches
    /// to the one existing command each intent kind names (see `AssistantIntentExecutionOutcome`).
    public func executeIntent(_ intent: AssistantIntent, identity: CommandIdentity? = nil) async throws -> StudioAssistantIntentExecuteResult {
        let payload = StudioAssistantIntentExecutePayload(intent: intent)
        guard case .studioAssistantIntentExecute(let result) = try await request(.studioAssistantIntentExecute, payload, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    /// The full milestone plan for one project alongside what has actually happened.
    public func milestonesList(projectId: ProjectID, identity: CommandIdentity? = nil) async throws -> ProjectMilestoneTimeline {
        guard case .projectMilestonesList(let timeline) = try await request(.projectMilestonesList, ProjectMilestonesListPayload(projectId: projectId), identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return timeline
    }

    /// Creates (`expectedRevision: nil`) or compare-and-set updates a milestone.
    public func upsertMilestone(_ milestone: ProjectMilestoneDraft, expectedRevision: Int?,
                                identity: CommandIdentity? = nil) async throws -> ProjectMilestoneUpsertResult {
        let payload = ProjectMilestoneUpsertPayload(milestone: milestone, expectedRevision: expectedRevision)
        guard case .projectMilestoneUpsert(let result) = try await request(.projectMilestoneUpsert, payload, identity).result else {
            throw DaemonClientError.responseOperationMismatch
        }
        return result
    }

    // MARK: Core

    struct Exchange: Sendable {
        var result: CommandResult
        var responseLine: Data
    }

    /// Frames, dispatches, and validates one command. All retryable failures carry the durable identity.
    func request<Payload: Encodable & Sendable>(_ operation: CommandOperation, _ payload: Payload,
                                                _ suppliedIdentity: CommandIdentity?) async throws -> Exchange {
        if isClosed { throw DaemonClientError.closed }
        if Task.isCancelled { throw DaemonClientError.cancelled }

        let identity = suppliedIdentity ?? CommandIdentity.fresh()
        let durable = identity.retryable
        let frame = CommandRequestFrame(
            requestId: identity.requestId,
            authorization: configuration.authorization.value,
            request: CommandRequest(commandId: identity.commandId, issuedAt: identity.issuedAt,
                                    origin: configuration.origin, operation: operation, payload: payload))
        var encoded = try Self.encoder.encode(frame)
        encoded.append(0x0A)
        guard encoded.count <= configuration.maxRequestBytes else { throw DaemonClientError.requestTooLarge }

        let session = ExchangeSession(socketPath: configuration.socketPath, queue: queue, frame: encoded,
                                      maxResponseBytes: configuration.maxResponseBytes)
        let key = ObjectIdentifier(session)
        sessions[key] = session
        defer { sessions.removeValue(forKey: key) }
        let raw: Data
        do {
            raw = try await session.run(timeout: configuration.timeout)
        } catch let error as DaemonClientError {
            throw error.attaching(durable)
        }

        let parsed: CommandResponse
        switch Self.decodeResponse(raw) {
        case .success(let value): parsed = value
        case .failure(let error): throw error.attaching(durable)
        }

        switch parsed {
        case .failure(let requestId, let error):
            throw DaemonClientError(origin: .remote(requestId: requestId), code: error.code, message: error.message,
                                    retryable: error.retryable, retryIdentity: error.retryable ? durable : nil)
        case .success(let requestId, let result):
            guard requestId == identity.requestId else {
                throw DaemonClientError.responseIdMismatch.attaching(durable)
            }
            guard result.operation == operation else {
                throw DaemonClientError.responseOperationMismatch.attaching(durable)
            }
            return Exchange(result: result, responseLine: firstLine(of: raw))
        }
    }

    private func firstLine(of raw: Data) -> Data {
        if let newline = raw.firstIndex(of: 0x0A) { return raw[raw.startIndex..<newline] }
        return raw
    }

    /// Splits the frame, rejects trailing frames, decodes and validates the response envelope.
    static func decodeResponse(_ raw: Data) -> Result<CommandResponse, DaemonClientError> {
        guard let newline = raw.firstIndex(of: 0x0A) else { return .failure(.remoteClosed) }
        let line = raw[raw.startIndex..<newline]
        let trailing = raw[raw.index(after: newline)...]
        if trailing.contains(where: { $0 != 0x0D && $0 != 0x0A && $0 != 0x20 && $0 != 0x09 }) {
            return .failure(.multipleResponses)
        }
        guard String(data: line, encoding: .utf8) != nil,
              (try? JSONSerialization.jsonObject(with: line, options: [.fragmentsAllowed])) != nil
        else { return .failure(.malformedResponse) }
        do {
            return .success(try JSONDecoder().decode(CommandResponse.self, from: line))
        } catch {
            return .failure(.invalidResponse)
        }
    }
}

// MARK: - Locating the daemon

public enum DaemonLocator {
    public static let socketEnvironmentVariable = "APP_FACTORY_SOCKET"
    public static let runtimeDirectoryEnvironmentVariable = "APP_FACTORY_RUNTIME_DIR"
    public static let socketFileName = "daemon.sock"

    /// `APP_FACTORY_SOCKET`, else `<APP_FACTORY_RUNTIME_DIR>/daemon.sock`, else nil.
    public static func socketPath(environment: [String: String] = ProcessInfo.processInfo.environment) -> String? {
        if let explicit = environment[socketEnvironmentVariable], !explicit.isEmpty { return explicit }
        if let runtime = environment[runtimeDirectoryEnvironmentVariable], !runtime.isEmpty {
            return (runtime as NSString).appendingPathComponent(socketFileName)
        }
        return nil
    }

    /// True when something is listening at `path` (a socket node exists).
    public static func socketExists(at path: String) -> Bool {
        var info = stat()
        guard stat(path, &info) == 0 else { return false }
        return (info.st_mode & S_IFMT) == S_IFSOCK
    }
}
