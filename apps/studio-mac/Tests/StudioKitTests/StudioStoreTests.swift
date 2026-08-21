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
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
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
        // `fixtureServer()` does not answer studio.snapshot (falls to "protocol.unsupported-operation"
        // in its default case), so `refresh()` probes it first and falls back to the phase-1 sequence —
        // exactly what a daemon that has never heard of a given operation looks like.
        // `release.projection` (Phase 6 step B) is probed last and, unanswered by this fixture server,
        // falls back silently the same way studio.snapshot does — no error, no rail. `room.list`
        // (Wave 8) is piggybacked onto this same `refresh()` so chat's room sidebar stays fresh even
        // outside the dedicated rooms UI; unanswered here, it falls back to `roomsError` the same
        // honest way, never blocking the rest of the refresh.
        XCTAssertEqual(operations, ["doctor", "studio.snapshot", "portfolio.snapshot", "attempt.list", "evidence.list", "release.projection", "room.list"])
        XCTAssertNil(store.releaseProjection)
        XCTAssertNil(store.errors["release.projection"])
        XCTAssertEqual(server.frames[3]["request"]?["payload"], ["scope": "all", "projectId": nil, "after": nil, "limit": 100])
    }

    /// A daemon that *does* answer `studio.snapshot` sources the dashboard from it and skips the
    /// phase-1 reads entirely (`evidence.list` is still fetched — project detail's run checks need it
    /// either way).
    func testStudioSnapshotSourcesTheDashboardWhenSupported() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            let file: String
            switch operation {
            case "doctor": file = "doctor.response.json"
            case "studio.snapshot": file = "studio-snapshot.response.json"
            case "evidence.list": file = "evidence-list.response.json"
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
            return .reply(try! WireResponse.fixture(file, requestId: requestId))
        }
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()

        XCTAssertNotNil(store.studioSnapshot)
        XCTAssertNil(store.portfolio)
        XCTAssertNil(store.attempts)
        XCTAssertNil(store.errors["studio.snapshot"])
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["doctor", "studio.snapshot", "evidence.list", "release.projection", "room.list"],
                       "portfolio.snapshot/attempt.list are skipped once studio.snapshot answers; room.list (Wave 8) always runs")

        let dashboard = store.dashboard
        XCTAssertEqual(dashboard.gauges.map(\.id), DashboardDerivation.studioGaugeOrder)
        XCTAssertEqual(dashboard.gauges[0].readout, "2", "studio.snapshot's own project count")
        XCTAssertEqual(dashboard.gauges[1].readout, "2", "verifiedThisWeek.value")
        XCTAssertEqual(dashboard.gauges[2].readout, "1", "awaitingYouCount.value")
        XCTAssertEqual(dashboard.gauges[2].role, .human)
        XCTAssertNil(dashboard.gauges[5].readout, "agentWindowShare is unavailableReason in the fixture")
        XCTAssertEqual(dashboard.gauges[5].provenance, .notYetSourced)
        XCTAssertEqual(dashboard.awaiting.count, 5, "2 studio.snapshot awaitingHuman items + 3 fixture ◆ gates")
        XCTAssertEqual(dashboard.awaiting[0].provenance, .live("studio.snapshot"))
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

    /// `project.milestones.list` is cached per project (mirroring `loadRun`), and
    /// `upsertMilestone` refreshes that cache so the panel and the Gantt row go live without a
    /// manual reload — the "timelines can become live from inside the app" requirement.
    func testMilestonesAreCachedAndUpsertRefreshesTheCache() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "doctor": return .reply(try! WireResponse.fixture("doctor.response.json", requestId: requestId))
            case "project.milestones.list":
                return .reply(try! WireResponse.fixture("project-milestones-list.response.json", requestId: requestId))
            case "project.milestone.upsert":
                return .reply(try! WireResponse.fixture("project-milestone-upsert.response.json", requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()

        let projectId = ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f")
        let loaded = await store.loadMilestones(projectId)
        let timeline = try XCTUnwrap(loaded)
        XCTAssertEqual(timeline.milestones.count, 2)
        XCTAssertEqual(store.milestoneTimelines[projectId]?.milestones.count, 2)

        // Cached: a second call does not hit the wire.
        let framesBeforeSecondLoad = server.frames.count
        _ = await store.loadMilestones(projectId)
        XCTAssertEqual(server.frames.count, framesBeforeSecondLoad)

        let draft = timeline.milestones[0].draft
        let result = await store.upsertMilestone(draft, expectedRevision: timeline.milestones[0].revision)
        guard case .success(let upserted) = result else { return XCTFail("expected the upsert to succeed") }
        XCTAssertFalse(upserted.created)
        // The cache was force-refreshed by the upsert (a second project.milestones.list frame).
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations.filter { $0 == "project.milestone.upsert" }.count, 1)
        XCTAssertEqual(operations.filter { $0 == "project.milestones.list" }.count, 2)
    }

    /// Studio Phase 6 step B: `refresh()` reads `release.projection`; `observeRelease()` dispatches
    /// `release.observe` and re-reads the projection, so the rail flips from "not yet sourced" to live
    /// off the daemon's own answer. A daemon that refuses to observe leaves the refusal in `errors`.
    func testReleaseRailIsSourcedFromTheProjectionAndObserveRereadsIt() async throws {
        final class Flag: @unchecked Sendable {
            private let lock = NSLock()
            private var value = false
            var isSet: Bool { lock.withLock { value } }
            func set() { lock.withLock { value = true } }
        }
        let observed = Flag()
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "doctor": return .reply(try! WireResponse.fixture("doctor.response.json", requestId: requestId))
            case "studio.snapshot": return .reply(try! WireResponse.fixture("studio-snapshot.response.json", requestId: requestId))
            case "evidence.list": return .reply(try! WireResponse.fixture("evidence-list.response.json", requestId: requestId))
            case "release.projection":
                let file = observed.isSet ? "release-projection.response.json" : "release-projection-empty.response.json"
                return .reply(try! WireResponse.fixture(file, requestId: requestId))
            case "release.observe":
                observed.set()
                return .reply(try! WireResponse.fixture("release-observe.response.json", requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()

        XCTAssertNotNil(store.releaseProjection)
        XCTAssertNil(store.releaseProjection?.latest)
        XCTAssertEqual(store.releaseRail.provenance, .notYetSourced)
        XCTAssertFalse(store.releaseRail.canObserve, "the empty fixture reports the observer unconfigured")

        await store.observeRelease()
        XCTAssertNil(store.errors["release.observe"])
        XCTAssertEqual(store.releaseProjection?.latest?.appObservations.count, 5)
        XCTAssertEqual(store.releaseRail.provenance, .live("release.projection"))
        XCTAssertFalse(store.isObservingRelease)
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations.suffix(2), ["release.observe", "release.projection"])
        XCTAssertEqual(server.frames[operations.count - 2]["request"]?["payload"]?["buildsLimit"], 5)
    }

    func testReleaseObserveRefusalIsSurfacedNotSwallowed() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "doctor": return .reply(try! WireResponse.fixture("doctor.response.json", requestId: requestId))
            case "studio.snapshot": return .reply(try! WireResponse.fixture("studio-snapshot.response.json", requestId: requestId))
            case "evidence.list": return .reply(try! WireResponse.fixture("evidence-list.response.json", requestId: requestId))
            case "release.projection": return .reply(try! WireResponse.fixture("release-projection-empty.response.json", requestId: requestId))
            case "release.observe":
                return .reply(WireResponse.failure(requestId: requestId, code: "release.observer-not-configured",
                                                   message: "release observer not configured", retryable: false))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let store = try makeStore(server)
        await store.connect()
        await store.observeRelease()
        XCTAssertEqual(store.errors["release.observe"], "[daemon] release.observer-not-configured: release observer not configured")
        XCTAssertEqual(store.releaseRail.error, "[daemon] release.observer-not-configured: release observer not configured")
        XCTAssertNil(store.releaseProjection?.latest)
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
