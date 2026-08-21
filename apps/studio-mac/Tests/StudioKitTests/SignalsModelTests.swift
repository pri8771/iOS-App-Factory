import Foundation
@testable import StudioKit
import XCTest

/// `SignalsModel`'s `signal.*`/`insight.list` reads and mutations through the fake daemon: load,
/// pause/resume round trips, `runNow`'s three honest outcomes (found/nothing-new/scout-failed), the
/// `daemon.handler-timeout-ambiguous` retry-then-re-read path that NEVER surfaces as a failure, and
/// reschedule.
@MainActor
final class SignalsModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")
    private let signalId = SignalID(unchecked: "90000001-0000-4000-8000-000000000001")

    /// Dispatches every operation to its same-named fixture, mirroring `ProviderClientTests`'s
    /// `fixtureDispatchingServer`. `overrides` lets one test hand-answer a specific operation instead
    /// (e.g. `signal.run-now` returning an ambiguous-timeout failure).
    private func fixtureServer(overrides: [String: @Sendable (_ frame: JSONValue, _ requestId: String) -> FakeDaemonServer.Behaviour] = [:]) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            if let override = overrides[operation] { return override(frame, requestId) }
            let fixtureName = operation.replacingOccurrences(of: ".", with: "-") + ".response.json"
            return .reply(try! WireResponse.fixture(fixtureName, requestId: requestId))
        }
    }

    private func makeModel(_ server: FakeDaemonServer) throws -> SignalsModel {
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
        return SignalsModel(client: client)
    }

    // MARK: load

    func testLoadReadsTheScheduledAndManualSignals() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        XCTAssertNil(model.signals, "nil until actually read")
        await model.load()
        let signals = try XCTUnwrap(model.signals)
        XCTAssertEqual(signals.count, 2)
        XCTAssertNil(model.error)
    }

    func testUnsupportedOperationClearsSignalsWithNoError() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.failure(requestId: frame["requestId"]?.stringValue ?? "", code: "protocol.unsupported-operation",
                                        message: "signal.list", retryable: false))
        }
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        XCTAssertNil(model.signals)
        XCTAssertNil(model.error)
    }

    func testGenuineLoadFailureKeepsTheDaemonsCodeAndClearsSignals() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.failure(requestId: frame["requestId"]?.stringValue ?? "", code: "test.unavailable",
                                        message: "signal.list is down", retryable: true))
        }
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        XCTAssertNil(model.signals)
        XCTAssertTrue(model.error?.contains("test.unavailable") == true, model.error ?? "nil")
    }

    // MARK: insight.list / expand

    func testToggleExpandLoadsInsightsOnceThenCollapses() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        await model.toggleExpand(signalId)
        XCTAssertEqual(model.expandedSignalId, signalId)
        XCTAssertEqual(model.insightsBySignal[signalId]?.count, 2)
        await model.toggleExpand(signalId)
        XCTAssertNil(model.expandedSignalId, "collapses on a second toggle")
    }

    // MARK: pause / resume / reschedule

    func testPauseAndResumeRoundTrip() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        let pauseResult = await model.pause(signalId)
        guard case .success(let paused) = pauseResult else { return XCTFail("expected success") }
        XCTAssertEqual(paused.status, .paused)
        XCTAssertEqual(model.signals?.first(where: { $0.signalId == signalId })?.status, .paused, "the roster reflects the mutation")
        XCTAssertTrue(model.busyIds.isEmpty, "busy flag clears once the mutation settles")
        XCTAssertNil(model.rowErrors[signalId])

        let resumeResult = await model.resume(signalId)
        guard case .success(let resumed) = resumeResult else { return XCTFail("expected success") }
        XCTAssertEqual(resumed.status, .active)
    }

    func testMutationFailureIsKeptPerSignalNotSwallowed() async throws {
        let server = try fixtureServer(overrides: [
            "signal.pause": { _, requestId in .reply(WireResponse.failure(requestId: requestId, code: "test.refused", message: "nope", retryable: false)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let result = await model.pause(signalId)
        guard case .failure(let error) = result else { return XCTFail("expected failure") }
        XCTAssertTrue(error.message.contains("test.refused"))
        XCTAssertTrue(model.rowErrors[signalId]?.contains("test.refused") == true)
        XCTAssertTrue(model.busyIds.isEmpty)
    }

    func testRescheduleSendsTheChosenInterval() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        let result = await model.reschedule(signalId, checkIntervalMinutes: 120)
        guard case .success(let signal) = result else { return XCTFail("expected success") }
        XCTAssertEqual(signal.checkIntervalMinutes, 120)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["checkIntervalMinutes"], 120)
    }

    // MARK: runNow — honest outcomes

    func testRunNowFoundUpdatesTheSignalAndInvalidatesCachedInsights() async throws {
        let server = try fixtureServer(overrides: [
            "signal.run-now": { _, requestId in .reply(try! WireResponse.fixture("signal-run-now-found.response.json", requestId: requestId)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        await model.toggleExpand(signalId) // already expanded once, insights cached
        XCTAssertNotNil(model.insightsBySignal[signalId])
        let outcome = await model.runNow(signalId)
        guard case .found(let insight) = outcome else { return XCTFail("expected .found, got \(outcome)") }
        XCTAssertFalse(insight.citations.isEmpty)
        XCTAssertEqual(model.lastRunOutcome[signalId], outcome)
        XCTAssertEqual(model.signals?.first(where: { $0.signalId == signalId })?.checkCount, 6, "the daemon's own updated signal is applied")
        XCTAssertNil(model.insightsBySignal[signalId], "stale cache is dropped so a re-expand re-reads it")
        XCTAssertTrue(model.busyIds.isEmpty)
    }

    func testRunNowNothingNewIsHonestNotAFailure() async throws {
        let server = try fixtureServer(overrides: [
            "signal.run-now": { _, requestId in .reply(try! WireResponse.fixture("signal-run-now-nothing-new.response.json", requestId: requestId)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let outcome = await model.runNow(signalId)
        XCTAssertEqual(outcome, .nothingNew)
    }

    func testRunNowScoutFailedCarriesTheTypedCodeHonestly() async throws {
        let server = try fixtureServer(overrides: [
            "signal.run-now": { _, requestId in .reply(try! WireResponse.fixture("signal-run-now-scout-failed.response.json", requestId: requestId)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let outcome = await model.runNow(signalId)
        guard case .scoutFailed(let code, let message) = outcome else { return XCTFail("expected .scoutFailed, got \(outcome)") }
        XCTAssertEqual(code, .scoutError)
        XCTAssertFalse(message.isEmpty)
    }

    /// A `daemon.handler-timeout-ambiguous` on the first attempt, resolved by the daemon replaying the
    /// journaled result on a same-commandId retry — the documented recovery path (`signal.run-now` is
    /// in `DURABLE_COMMAND_RESULT_OPERATIONS`). Never rendered as a failure.
    func testRunNowRetriesAnAmbiguousTimeoutWithTheSameCommandIdThenSucceeds() async throws {
        final class State: @unchecked Sendable {
            var attempts = 0
            var firstCommandId: String?
        }
        let state = State()
        let server = try fixtureServer(overrides: [
            "signal.run-now": { frame, requestId in
                state.attempts += 1
                if state.attempts == 1 {
                    state.firstCommandId = frame["request"]?["commandId"]?.stringValue
                    return .reply(WireResponse.failure(requestId: requestId, code: "daemon.handler-timeout-ambiguous",
                                                        message: "Command completion is unknown after timeout; retry with the same command ID.",
                                                        retryable: true))
                }
                XCTAssertEqual(frame["request"]?["commandId"]?.stringValue, state.firstCommandId, "the retry must reuse the durable commandId")
                return .reply(try! WireResponse.fixture("signal-run-now-found.response.json", requestId: requestId))
            },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let outcome = await model.runNow(signalId)
        guard case .found = outcome else { return XCTFail("expected the retried .found outcome, got \(outcome)") }
        XCTAssertEqual(state.attempts, 2)
        XCTAssertNil(model.rowErrors[signalId])
    }

    /// Every retry still comes back ambiguous: `runNow` gives up retrying, but STILL never calls it a
    /// failure — it re-reads `signal.list` (so `checkCount` reflects whatever actually happened) and
    /// reports the honest "don't know" outcome.
    func testRunNowStillAmbiguousAfterEveryRetryReReadsAndReportsUnknownNeverFailure() async throws {
        let server = try fixtureServer(overrides: [
            "signal.run-now": { frame, requestId in
                .reply(WireResponse.failure(requestId: requestId, code: "daemon.handler-timeout-ambiguous",
                                            message: "Command completion is unknown after timeout; retry with the same command ID.",
                                            retryable: true))
            },
            "signal.list": { _, requestId in .reply(try! WireResponse.fixture("signal-list.response.json", requestId: requestId)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let outcome = await model.runNow(signalId)
        XCTAssertEqual(outcome, .unknownReRead)
        XCTAssertEqual(model.lastRunOutcome[signalId], .unknownReRead)
        XCTAssertNil(model.rowErrors[signalId], "an unknown outcome is not an error")
        XCTAssertNotNil(model.signals, "the give-up path re-read signal.list rather than leaving stale state")
        // signal.run-now was tried once plus SignalsModel.maxRunNowRetries retries.
        let runNowAttempts = server.frames.filter { $0["request"]?["operation"]?.stringValue == "signal.run-now" }.count
        XCTAssertEqual(runNowAttempts, SignalsModel.maxRunNowRetries + 1)
    }

    func testRunNowNonRetryableFailureIsAnHonestFailure() async throws {
        let server = try fixtureServer(overrides: [
            "signal.run-now": { _, requestId in .reply(WireResponse.failure(requestId: requestId, code: "test.refused", message: "nope", retryable: false)) },
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let outcome = await model.runNow(signalId)
        guard case .failed(let message) = outcome else { return XCTFail("expected .failed, got \(outcome)") }
        XCTAssertTrue(message.contains("test.refused"))
    }

    func testRunNowIsANoOpFailureWithoutADaemon() async {
        let model = SignalsModel(client: nil)
        let outcome = await model.runNow(signalId)
        XCTAssertEqual(outcome, .failed("no daemon configured"))
    }
}
