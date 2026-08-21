import Foundation
@testable import StudioKit
import XCTest

/// `UsageModel`'s `usage.summary` read through the fake daemon: the range it actually requests, and
/// the unsupported-operation-vs-genuine-error split `AnalyticsPanel` depends on to tell "this daemon
/// predates the usage ledger" (silent) from "the read really failed" (shown with its code).
@MainActor
final class UsageModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func server(failWith code: String? = nil) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            guard operation == "usage.summary" else {
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
            if let code {
                return .reply(WireResponse.failure(requestId: requestId, code: code, message: "\(operation) is down", retryable: true))
            }
            return .reply(try! WireResponse.fixture("usage-summary.response.json", requestId: requestId))
        }
    }

    private func makeModel(_ server: FakeDaemonServer, range: AnalyticsRange = .sevenDays) throws -> UsageModel {
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
        return UsageModel(client: client, range: range)
    }

    func testLoadReadsUsageSummaryForTheCurrentRange() async throws {
        let server = try server()
        defer { server.stop() }
        let model = try makeModel(server, range: .thirtyDays)
        XCTAssertNil(model.summary, "nil until actually read")
        await model.load()
        let summary = try XCTUnwrap(model.summary)
        XCTAssertEqual(summary.rows.count, 3)
        XCTAssertNil(model.error)
        XCTAssertFalse(model.isLoading)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["sinceDays"], 30, "range .thirtyDays -> sinceDays 30 on the wire")
    }

    func testSetRangeChangesWhatTheNextLoadRequests() async throws {
        let server = try server()
        defer { server.stop() }
        let model = try makeModel(server, range: .sevenDays)
        model.setRange(.thirtyDays)
        XCTAssertEqual(model.range, .thirtyDays)
        await model.load()
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["sinceDays"], 30)
    }

    func testUnsupportedOperationClearsSummaryWithNoError() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation",
                                               message: "usage.summary", retryable: false))
        }
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        XCTAssertNil(model.summary)
        XCTAssertNil(model.error, "an old daemon that has never heard of usage.summary is not an error")
    }

    func testGenuineFailureClearsSummaryAndKeepsTheDaemonsCode() async throws {
        let server = try server(failWith: "test.unavailable")
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        XCTAssertNil(model.summary)
        XCTAssertTrue(model.error?.contains("test.unavailable") == true, model.error ?? "nil")
    }

    func testLoadIsANoOpWithoutADaemon() async {
        let model = UsageModel(client: nil)
        await model.load()
        XCTAssertNil(model.summary)
        XCTAssertNil(model.error)
        XCTAssertFalse(model.isConnected)
    }
}
