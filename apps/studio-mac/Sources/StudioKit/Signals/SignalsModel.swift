import Foundation
import Observation

// MARK: - SignalsModel
//
// The observable state behind the dashboard's Signals panel: the standing-watch roster
// (`signal.list`), each signal's recorded findings (`insight.list`, loaded on expand), and the
// pause/resume/run-now/reschedule mutations. Owned by `StudioStore`, mirroring
// `SettingsModel`/`RoomsModel` — a distinct wire family gets its own model.
//
// `signal.list`/`insight.list` are unconditionally supported (Signal.swift's header comment), but
// `load()` still feature-detects defensively exactly like `UsageModel.load()` — see that type's
// header comment for the `isUnsupportedOperation`-vs-`error` split this mirrors.
//
// `runNow` is the one mutation that needs special handling: `signal.run-now` is a real Scout network
// round trip (up to ~120s) wrapped by the daemon's fixed 30s handler timeout, so it routinely returns
// `daemon.handler-timeout-ambiguous` — a RETRYABLE error carrying a `RetryableCommandIdentity` — well
// before the Scout call has actually finished or failed. `signal.run-now` sits in the daemon's
// `DURABLE_COMMAND_RESULT_OPERATIONS` set specifically so that a retry with the SAME `commandId`
// safely replays the journaled result instead of re-running the Scout — see
// `DaemonClient.createRetryIdentity`/`RetryableCommandIdentity`. So an ambiguous outcome here is never
// surfaced as a failure: `runNow` retries a bounded number of times on the durable identity, and if
// the outcome is still unknown after that, it re-reads `signal.list` (so `checkCount`/`lastCheckedAt`
// reflect whatever the daemon actually did) and reports `.unknownReRead` — honest uncertainty, not a
// fabricated failure.

/// What one `runNow(_:)` call settled on, for the panel to render honestly.
public enum SignalRunNowOutcomeDisplay: Hashable, Sendable {
    case found(SignalInsight)
    case nothingNew
    case scoutFailed(code: SignalScoutFailureCode, message: String)
    /// `daemon.handler-timeout-ambiguous` persisted through every retry — the daemon's own record of
    /// what happened (if anything) is unknown to this client. `SignalsModel` already re-read
    /// `signal.list` before returning this, so `checkCount`/`lastCheckedAt` are current even though
    /// the outcome itself is not known. Never rendered as "failed."
    case unknownReRead
    /// A real client/transport failure unrelated to the ambiguous-outcome retry path (e.g. no daemon
    /// configured, a non-retryable remote refusal).
    case failed(String)
}

@Observable
@MainActor
public final class SignalsModel {

    /// `nil` means "not loaded yet," "this daemon has no signals ledger" (silent — `error == nil`), or
    /// a real read failure (`error != nil`); a loaded-but-empty roster is `[]`, distinct from all
    /// three — mirrors `UsageModel.summary`'s optionality, and is what lets `SignalsPanel` render an
    /// honest "no signals defined" instead of the not-yet-sourced empty state.
    public private(set) var signals: [Signal]?
    public private(set) var isLoading = false
    public private(set) var error: String?

    /// The one signal whose insights are expanded in the panel, if any.
    public private(set) var expandedSignalId: SignalID?
    public private(set) var insightsBySignal: [SignalID: [SignalInsight]] = [:]
    public private(set) var insightErrors: [SignalID: String] = [:]

    /// Signal ids with a pause/resume/run-now/reschedule mutation in flight — the panel disables and
    /// annotates exactly the row being mutated, mirroring `SettingsModel.busyKeys`.
    public private(set) var busyIds: Set<SignalID> = []
    public private(set) var rowErrors: [SignalID: String] = [:]
    /// The last `runNow` outcome per signal, kept until the next `runNow`/`load()` on that id so the
    /// panel can show what just happened rather than only the refreshed counts.
    public private(set) var lastRunOutcome: [SignalID: SignalRunNowOutcomeDisplay] = [:]

    /// Bounded retries on a `daemon.handler-timeout-ambiguous` outcome before falling back to
    /// re-reading `signal.list` — see the type's header comment.
    static let maxRunNowRetries = 2

    private let client: DaemonClient?

    public init(client: DaemonClient?) {
        self.client = client
    }

    public var isConnected: Bool { client != nil }

    // MARK: Load

    public func load() async {
        guard let client else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            signals = try await client.listSignals()
            error = nil
        } catch let e as DaemonClientError where e.isUnsupportedOperation {
            signals = nil
            error = nil
        } catch let loadError {
            signals = nil
            error = Self.describe(loadError)
        }
    }

    /// `insight.list` for one signal. Cached; `force` refetches (used after a `runNow` that found
    /// something new).
    @discardableResult
    public func loadInsights(_ signalId: SignalID, force: Bool = false) async -> [SignalInsight]? {
        if !force, let cached = insightsBySignal[signalId] { return cached }
        guard let client else { return nil }
        do {
            let insights = try await client.listInsights(signalId: signalId)
            insightsBySignal[signalId] = insights
            insightErrors[signalId] = nil
            return insights
        } catch {
            insightErrors[signalId] = Self.describe(error)
            return nil
        }
    }

    /// Toggles a signal's expansion, loading its insights the first time it opens.
    public func toggleExpand(_ signalId: SignalID) async {
        if expandedSignalId == signalId {
            expandedSignalId = nil
            return
        }
        expandedSignalId = signalId
        await loadInsights(signalId)
    }

    // MARK: Mutations

    @discardableResult
    public func pause(_ signalId: SignalID) async -> Result<Signal, AssistantBackendError> {
        await mutate(signalId) { try await $0.pauseSignal(signalId) }
    }

    @discardableResult
    public func resume(_ signalId: SignalID) async -> Result<Signal, AssistantBackendError> {
        await mutate(signalId) { try await $0.resumeSignal(signalId) }
    }

    @discardableResult
    public func reschedule(_ signalId: SignalID, checkIntervalMinutes: Int?) async -> Result<Signal, AssistantBackendError> {
        await mutate(signalId) { try await $0.rescheduleSignal(signalId, checkIntervalMinutes: checkIntervalMinutes) }
    }

    private func mutate(_ signalId: SignalID, _ call: (DaemonClient) async throws -> Signal) async -> Result<Signal, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        busyIds.insert(signalId)
        defer { busyIds.remove(signalId) }
        do {
            let updated = try await call(client)
            replace(updated)
            rowErrors[signalId] = nil
            return .success(updated)
        } catch {
            let message = Self.describe(error)
            rowErrors[signalId] = message
            return .failure(AssistantBackendError(message))
        }
    }

    /// Runs the signal's Scout once, right now — see the type's header comment for the
    /// handler-timeout-ambiguous retry-then-re-read handling that makes this never report "failed"
    /// for an outcome the daemon itself has not ruled out.
    @discardableResult
    public func runNow(_ signalId: SignalID) async -> SignalRunNowOutcomeDisplay {
        guard let client else {
            let outcome = SignalRunNowOutcomeDisplay.failed("no daemon configured")
            lastRunOutcome[signalId] = outcome
            return outcome
        }
        busyIds.insert(signalId)
        defer { busyIds.remove(signalId) }

        var identity = client.createIdentity()
        var attempt = 0
        while true {
            do {
                let result = try await client.runSignalNow(signalId, identity: identity)
                replace(result.signal)
                rowErrors[signalId] = nil
                let outcome = Self.display(result)
                if case .found = result.outcome { insightsBySignal[signalId] = nil } // stale until re-expanded
                lastRunOutcome[signalId] = outcome
                return outcome
            } catch let daemonError as DaemonClientError {
                guard daemonError.retryable, let retry = daemonError.retryIdentity else {
                    let message = Self.describe(daemonError)
                    rowErrors[signalId] = message
                    let outcome = SignalRunNowOutcomeDisplay.failed(message)
                    lastRunOutcome[signalId] = outcome
                    return outcome
                }
                guard attempt < Self.maxRunNowRetries else {
                    // Still ambiguous after every retry: never call this a failure. Re-read the
                    // signal list so checkCount/lastCheckedAt reflect whatever actually happened,
                    // then report the honest "don't know" outcome.
                    await load()
                    rowErrors[signalId] = nil
                    let outcome = SignalRunNowOutcomeDisplay.unknownReRead
                    lastRunOutcome[signalId] = outcome
                    return outcome
                }
                attempt += 1
                identity = client.createRetryIdentity(retry)
            } catch {
                let message = Self.describe(error)
                rowErrors[signalId] = message
                let outcome = SignalRunNowOutcomeDisplay.failed(message)
                lastRunOutcome[signalId] = outcome
                return outcome
            }
        }
    }

    private static func display(_ result: SignalRunNowResult) -> SignalRunNowOutcomeDisplay {
        switch result.outcome {
        case .found:
            guard let insight = result.insight else { return .nothingNew } // schema guarantees this pairs; fail soft, not loud
            return .found(insight)
        case .nothingNew: return .nothingNew
        case .scoutFailed(let code, let message): return .scoutFailed(code: code, message: message)
        }
    }

    private func replace(_ signal: Signal) {
        guard var current = signals else {
            signals = [signal]
            return
        }
        if let index = current.firstIndex(where: { $0.signalId == signal.signalId }) {
            current[index] = signal
        } else {
            current.append(signal)
        }
        signals = current
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
