import Foundation
@testable import StudioKit
import XCTest

/// Drives `StudioStore` against the fake daemon: connect → doctor, refresh → the three read models,
/// loadRun → events + evidence.verify, and the derived dashboard on top — all from recorded fixtures.
@MainActor
final class StudioStoreTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func fixtureServer(failing: Set<String> = []) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            if failing.contains(operation) {
                return .reply(WireResponse.failure(requestId: requestId, code: "test.unavailable", message: "\(operation) is down", retryable: true))
            }
            let file: String
            switch operation {
            case "doctor": file = "doctor.response.json"
            case "portfolio.snapshot": file = "portfolio-snapshot.response.json"
            case "attempt.list": file = "attempt-list.response.json"
            case "evidence.list": file = "evidence-list.response.json"
            case "attempt.events": file = "attempt-events.response.json"
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
            return .reply(try! WireResponse.fixture(file, requestId: requestId))
        }
    }

    private func makeStore(_ server: FakeDaemonServer) throws -> StudioStore {
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
        let now = IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!
        return StudioStore(client: client, socketPath: server.socketPath, timeline: try TimelineFixture.loadBundled(), now: { now })
    }

    func testConnectLoadsDoctorAndReadModelsAndDerivesTheDashboard() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let store = try makeStore(server)
        XCTAssertEqual(store.link, .unconfigured)
        XCTAssertFalse(store.isConnected)

        await store.connect()

        guard case .connected(let doctor) = store.link else { return XCTFail("expected connected, got \(store.link)") }
        XCTAssertEqual(doctor.daemonVersion, "0.1.0-ui-demo")
        XCTAssertEqual(store.portfolio?.projects.count, 3)
        XCTAssertEqual(store.attempts?.count, 3)
        XCTAssertEqual(store.evidence?.count, 1)
        XCTAssertTrue(store.errors.isEmpty, "\(store.errors)")
        XCTAssertNotNil(store.lastRefreshAt)

        let dashboard = store.dashboard
        XCTAssertEqual(dashboard.gauges[0].readout, "3")
        XCTAssertEqual(dashboard.gauges[1].readout, "1")
        XCTAssertEqual(dashboard.gauges[2].readout, "1")
        XCTAssertEqual(dashboard.reticle.readout, "70%")
        XCTAssertEqual(dashboard.projects.count, 6)
        XCTAssertEqual(dashboard.awaiting.count, 3, "no blocked attempts; three fixture gates")
        XCTAssertEqual(store.assistantContext.link, "connected · daemon 0.1.0-ui-demo ready")

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["doctor", "portfolio.snapshot", "attempt.list", "evidence.list"])
        XCTAssertEqual(server.frames[2]["request"]?["payload"], ["scope": "all", "projectId": nil, "after": nil, "limit": 100])
    }

    func testPerOperationFailuresAreKeptNotSwallowed() async throws {
        let server = try fixtureServer(failing: ["portfolio.snapshot"])
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()
        XCTAssertTrue(store.isConnected)
        XCTAssertNil(store.portfolio)
        XCTAssertEqual(store.attempts?.count, 3)
        XCTAssertEqual(store.errors["portfolio.snapshot"], "[daemon] test.unavailable: portfolio.snapshot is down (retryable)")
        // Gauges stay honest: projects "—" (loading), verified derived from attempts, awaiting derived.
        let gauges = store.dashboard.gauges
        XCTAssertNil(gauges[0].readout)
        XCTAssertEqual(gauges[0].caption, "loading")
        XCTAssertEqual(gauges[1].readout, "1")
        XCTAssertEqual(gauges[2].readout, "0")
        XCTAssertEqual(gauges[2].provenance, .derived("attempt.list · blocked"))
        // The reticle falls back to the fixture, badged as such.
        XCTAssertEqual(store.dashboard.reticle.provenance, .fixture("timeline-fixture.json"))
    }

    func testOfflineDaemonLeavesTheStoreHonestlyOffline() async throws {
        let dir = NSTemporaryDirectory() + "afs-none-" + UUID().uuidString.lowercased().prefix(8) + ".sock"
        let client = try DaemonClient(configuration: .init(socketPath: dir, authorization: token, timeout: .seconds(2)))
        let store = StudioStore(client: client, socketPath: dir, timeline: try TimelineFixture.loadBundled())
        await store.connect()
        guard case .offline(let reason) = store.link else { return XCTFail("expected offline, got \(store.link)") }
        XCTAssertTrue(reason.contains("transport.connection-failed"), reason)
        XCTAssertNil(store.portfolio)
        XCTAssertNil(store.attempts)
        XCTAssertEqual(store.dashboard.rows.count, 6, "fixture rows still draw")
        XCTAssertEqual(store.dashboard.gauges.compactMap(\.readout), [], "no numbers offline")
        XCTAssertEqual(store.dashboard.reticle.provenance, .fixture("timeline-fixture.json"))
    }

    func testUnconfiguredStoreHasNoClient() async throws {
        let store = StudioStore.fromEnvironment([:])
        XCTAssertNil(store.socketPath)
        XCTAssertNotNil(store.timeline)
        await store.connect()
        XCTAssertEqual(store.link, .unconfigured)
    }

    func testLoadRunReadsEventsAndReportsEvidenceVerifyFailureHonestly() async throws {
        let server = try fixtureServer(failing: ["evidence.verify"])
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()
        let id = AttemptID(unchecked: "00000001-0000-4000-8000-000000000001")
        let loaded = await store.loadRun(id)
        let detail = try XCTUnwrap(loaded)
        XCTAssertEqual(detail.events.count, 4)
        XCTAssertNil(detail.verify)
        XCTAssertEqual(detail.evidenceNote, "[daemon] test.unavailable: evidence.verify is down (retryable)")
        XCTAssertEqual(detail.checks.map(\.label), ["step 20000001", "commit"])
        XCTAssertNotNil(store.runs[id])
        // Cached: a second call does not hit the wire.
        let before = server.frames.count
        _ = await store.loadRun(id)
        XCTAssertEqual(server.frames.count, before)
    }
}
