import Foundation

// MARK: - Run detail: the latest run's checks
//
// The project detail lists what one attempt actually did, read from `attempt.events` and
// `evidence.verify`. A "check" is one row: a step (from step.created / step.state-changed), a recorded
// commit, a verified evidence item, or the attempt's own terminal transition. Nothing is inferred
// beyond what the events say; a step whose final state was never reported shows as "pending".

public enum RunCheckState: Hashable, Sendable {
    case pending, running, blocked, succeeded, failed, cancelled, skipped

    public var pill: HUDStatusKind {
        switch self {
        case .pending: return .queued
        case .running: return .running
        case .blocked: return .blocked
        case .succeeded: return .succeeded
        case .failed: return .failed
        case .cancelled: return .cancelled
        case .skipped: return .unknown
        }
    }

    init(_ step: StepState) {
        switch step {
        case .pending: self = .pending
        case .running: self = .running
        case .blocked: self = .blocked
        case .succeeded: self = .succeeded
        case .failed: self = .failed
        case .cancelled: self = .cancelled
        case .skipped: self = .skipped
        }
    }
}

public struct RunCheck: Hashable, Sendable, Identifiable {
    public var id: String
    /// Mono label: the step operation code, "commit", "evidence · verification", "attempt".
    public var label: String
    public var state: RunCheckState
    public var at: IsoInstant?
    /// Failure code, digest prefix, artifact count — whatever the event carried.
    public var detail: String?
    public var provenance: Provenance

    public init(id: String, label: String, state: RunCheckState, at: IsoInstant?, detail: String?, provenance: Provenance) {
        self.id = id
        self.label = label
        self.state = state
        self.at = at
        self.detail = detail
        self.provenance = provenance
    }
}

public struct RunDetail: Hashable, Sendable {
    public var attemptId: AttemptID
    public var events: [AttemptEvent]
    public var verify: EvidenceVerifyResult?
    /// Why evidence could not be verified (no manifest yet, transport…). Shown honestly, not hidden.
    public var evidenceNote: String?

    public init(attemptId: AttemptID, events: [AttemptEvent], verify: EvidenceVerifyResult?, evidenceNote: String? = nil) {
        self.attemptId = attemptId
        self.events = events
        self.verify = verify
        self.evidenceNote = evidenceNote
    }

    public var checks: [RunCheck] { Self.checks(events: events, verify: verify) }

    public static func checks(events: [AttemptEvent], verify: EvidenceVerifyResult?) -> [RunCheck] {
        struct StepInfo { var ordinal: Int; var operation: String?; var state: RunCheckState; var at: IsoInstant?; var detail: String? }
        var steps: [StepID: StepInfo] = [:]
        var order: [StepID] = []
        var others: [RunCheck] = []
        let live = Provenance.live("attempt.events")

        for event in events.sorted(by: { $0.sequence < $1.sequence }) {
            switch event.payload {
            case let .stepCreated(stepId, ordinal, operation, _):
                if steps[stepId] == nil { order.append(stepId) }
                steps[stepId] = StepInfo(ordinal: ordinal, operation: operation.rawValue, state: .pending, at: event.occurredAt, detail: nil)
            case let .stepStateChanged(stepId, _, to, outputDigest, failureCode):
                if steps[stepId] == nil {
                    order.append(stepId)
                    steps[stepId] = StepInfo(ordinal: Int.max, operation: nil, state: .pending, at: nil, detail: nil)
                }
                steps[stepId]?.state = RunCheckState(to)
                steps[stepId]?.at = event.occurredAt
                steps[stepId]?.detail = failureCode?.rawValue ?? outputDigest.map { String($0.rawValue.dropFirst(7).prefix(12)) }
            case let .commitRecorded(commit, _, _):
                others.append(RunCheck(id: "commit.\(event.eventId.rawValue)", label: "commit", state: .succeeded,
                                       at: event.occurredAt, detail: String(commit.rawValue.prefix(12)), provenance: live))
            case let .attemptStateChanged(_, to, blocker, outcome):
                let state: RunCheckState
                var detail: String?
                switch to {
                case .succeeded: state = .succeeded
                case .failed:
                    state = .failed
                    if case .failed(let failure)? = outcome { detail = failure.code.rawValue }
                case .cancelled:
                    state = .cancelled
                    if case .cancelled(let reason)? = outcome { detail = reason }
                case .blocked:
                    state = .blocked
                    detail = blocker?.summary
                case .running: state = .running
                case .queued, .paused: state = .pending
                }
                if to.isTerminal || to == .blocked {
                    others.append(RunCheck(id: "attempt.\(event.eventId.rawValue)", label: "attempt · \(to.rawValue)",
                                           state: state, at: event.occurredAt, detail: detail, provenance: live))
                }
            case .attemptCreated, .attemptDesiredStateChanged, .attemptFenceClaimed, .attemptUnblockAnswered, .evidenceRecorded:
                continue
            }
        }

        let stepChecks = order
            .compactMap { id -> (StepID, StepInfo)? in steps[id].map { (id, $0) } }
            .sorted { $0.1.ordinal < $1.1.ordinal }
            .map { id, info in
                RunCheck(id: "step.\(id.rawValue)", label: info.operation ?? "step \(id.rawValue.prefix(8))",
                         state: info.state, at: info.at, detail: info.detail, provenance: live)
            }

        var evidenceChecks: [RunCheck] = []
        if let verify {
            for item in verify.evidence {
                evidenceChecks.append(RunCheck(id: "evidence.\(item.evidenceId.rawValue)",
                                               label: "evidence · \(item.kind.rawValue)",
                                               state: verify.integrityVerified ? .succeeded : .failed,
                                               at: item.createdAt,
                                               detail: "\(item.producer.rawValue) · \(item.artifactCount) artifact\(item.artifactCount == 1 ? "" : "s")",
                                               provenance: .live("evidence.verify")))
            }
        }
        return stepChecks + others + evidenceChecks
    }
}
