import Foundation
@testable import StudioKit
import SwiftUI
import XCTest

/// Studio Phase 6 step B — the release rail: `release.projection` / `release.observe` decoding
/// against fixtures recorded through the real contracts (`scripts/record-release-fixtures.mjs`, with
/// genuine digests), the client's digest re-verification, the rail's derived provenance, and the
/// dashboard panel's reference images.
@MainActor
final class ReleaseRailTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func decode(_ fixture: String) throws -> CommandResponse {
        try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data(fixture))
    }

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    private func populatedProjection() throws -> ReleaseProjection {
        guard case .success(_, .releaseProjection(let projection)) = try decode("release-projection.response.json") else {
            XCTFail("expected release.projection"); throw XCTSkip("fixture did not decode")
        }
        return projection
    }

    // MARK: Decoding

    func testReleaseProjectionDecodesLatestObservationVerbatim() throws {
        let projection = try populatedProjection()
        XCTAssertTrue(projection.observer.configured)
        XCTAssertNil(projection.observer.unavailableReason)
        XCTAssertEqual(projection.observer.source?.keyId, "HGUBSYYP6G")
        XCTAssertEqual(projection.observer.source?.keychainService, "app-factory-asc-key")
        XCTAssertEqual(projection.observationCount, 3)
        XCTAssertEqual(projection.generatedAt.rawValue, "2026-08-18T02:30:00.000Z")

        let latest = try XCTUnwrap(projection.latest)
        XCTAssertEqual(latest.observedAt.rawValue, "2026-08-18T02:26:19.000Z")
        XCTAssertEqual(latest.requestCount, 11)
        XCTAssertEqual(latest.statuses.filter { $0 == 403 }.count, 1)
        XCTAssertTrue(latest.apps.isObserved)
        // Canonical wire order: by app name.
        XCTAssertEqual(latest.appObservations.map(\.app.name), ["Anjali", "Hindsight", "Mala", "Roam", "Svara"])

        let anjali = latest.appObservations[0]
        XCTAssertEqual(anjali.app.bundleId, "com.priyanshchordia.anjali")
        XCTAssertEqual(anjali.projection?.projectedStage, .internalTestflightAvailable)
        XCTAssertEqual(anjali.projection?.projectionBasis, .buildInInternalTesting)
        XCTAssertEqual(anjali.projection?.latestBuild?.versionLabel, "1.0 (4)")
        XCTAssertEqual(anjali.projection?.latestBuild?.uploadedDate?.rawValue, "2026-08-13T18:02:11.000Z")
        XCTAssertEqual(anjali.projection?.uploadedAt?.rawValue, "2026-08-13T18:02:11.000Z")
        XCTAssertEqual(anjali.projection?.latestAppStoreVersion?.stateLabel, "WAITING_FOR_REVIEW")
        XCTAssertNil(anjali.projection?.internalTestFlightAvailableAt, "Apple does not report this; the slot stays nil")

        let mala = latest.appObservations[2]
        XCTAssertEqual(mala.projection?.projectedStage, .processing)
        XCTAssertEqual(mala.projection?.projectionBasis, .buildProcessing)
        XCTAssertEqual(mala.projection?.latestBuild?.processingState, .processing)

        // Roam: builds observed (none), versions denied by role -> no projection, honest per-read outcome.
        let roam = latest.appObservations[3]
        XCTAssertTrue(roam.builds.isObserved)
        XCTAssertEqual(roam.appStoreVersions.kind, .denied)
        XCTAssertEqual(roam.appStoreVersions.status, 403)
        XCTAssertEqual(roam.appStoreVersions.problemLabel, "denied · asc.forbidden")
        XCTAssertNil(roam.projection)

        // Svara: both reads observed, no build -> projection with no stage, basis names why.
        let svara = latest.appObservations[4]
        XCTAssertNotNil(svara.projection)
        XCTAssertNil(svara.projection?.projectedStage)
        XCTAssertEqual(svara.projection?.projectionBasis, .noBuildObserved)
    }

    func testReleaseProjectionEmptyIsAnHonestAnswer() throws {
        guard case .success(_, .releaseProjection(let projection)) = try decode("release-projection-empty.response.json") else {
            return XCTFail("expected release.projection")
        }
        XCTAssertFalse(projection.observer.configured)
        XCTAssertNil(projection.observer.source)
        XCTAssertTrue(projection.observer.unavailableReason?.hasPrefix("release observer not configured") ?? false)
        XCTAssertNil(projection.latest)
        XCTAssertEqual(projection.observationCount, 0)
    }

    func testReleaseObserveDecodesTheObservation() throws {
        guard case .success(_, .releaseObserve(let observation)) = try decode("release-observe.response.json") else {
            return XCTFail("expected release.observe")
        }
        XCTAssertEqual(observation.observationId, "7a000000-0000-4000-8000-000000000001")
        XCTAssertEqual(observation.appObservations.count, 5)
        XCTAssertEqual(observation.source.origin, "https://api.appstoreconnect.apple.com")
    }

    func testReleaseStageOrderMatchesTheContract() {
        XCTAssertEqual(ReleaseStage.allCases.map(\.rawValue), [
            "candidate", "certified", "archived", "upload-approved", "uploaded", "processing",
            "internal-testflight-available", "device-smoke-passed",
        ])
        XCTAssertEqual(ReleaseStage.internalTestflightAvailable.rank, 6)
        XCTAssertLessThan(ReleaseStage.processing.rank, ReleaseStage.internalTestflightAvailable.rank)
    }

    // MARK: Digest

    func testReleaseProjectionDigestVerifiesAgainstRecordedFixtures() throws {
        for fixture in ["release-projection.response.json", "release-projection-empty.response.json"] {
            let tree = try JSONValue.parse(Fixtures.data(fixture))
            let projection = try XCTUnwrap(tree["result"]?["projection"])
            XCTAssertNoThrow(try ReleaseProjectionDigest.verify(projection), fixture)
            // The digest binds content, not the read instant.
            var later = projection.objectValue!
            later["generatedAt"] = "2026-08-19T00:00:00.000Z"
            XCTAssertNoThrow(try ReleaseProjectionDigest.verify(.object(later)), fixture)
            // ...and any content change breaks it.
            var tampered = projection.objectValue!
            tampered["observationCount"] = 99
            XCTAssertThrowsError(try ReleaseProjectionDigest.verify(.object(tampered)), fixture)
        }
    }

    // MARK: Client

    func testReleaseProjectionRoundTripSendsAnEmptyPayloadAndVerifiesTheDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("release-projection.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let projection = try await client.releaseProjection()
        XCTAssertEqual(projection.latest?.appObservations.count, 5)
        let request = try XCTUnwrap(server.frames.first?["request"])
        XCTAssertEqual(request["operation"]?.stringValue, "release.projection")
        XCTAssertEqual(request["payload"], [:])
    }

    func testReleaseProjectionRejectsTamperedDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let response = try! JSONValue.parse(Fixtures.data("release-projection.response.json"))
            var projection = response["result"]!["projection"]!.objectValue!
            projection["observationCount"] = 4
            return .reply(WireResponse.success(requestId: frame["requestId"]!.stringValue!,
                                               result: ["operation": "release.projection", "projection": .object(projection)]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        do {
            _ = try await client.releaseProjection()
            XCTFail("expected a digest mismatch")
        } catch let error as DaemonClientError {
            XCTAssertEqual(error.code, "protocol.release-projection-digest-mismatch")
            XCTAssertFalse(error.retryable)
        }
    }

    func testObserveReleaseSendsTheStrictPayload() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("release-observe.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let observation = try await client.observeRelease(buildsLimit: 3)
        XCTAssertEqual(observation.appObservations.count, 5)
        let request = try XCTUnwrap(server.frames.first?["request"])
        XCTAssertEqual(request["operation"]?.stringValue, "release.observe")
        XCTAssertEqual(request["payload"]?["buildsLimit"], 3)
    }

    func testObserveReleaseRefusalSurfacesTheDaemonsCode() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.failure(requestId: frame["requestId"]!.stringValue!,
                                        code: "release.observer-not-configured",
                                        message: "release observer not configured", retryable: false))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        do {
            _ = try await client.observeRelease()
            XCTFail("expected a refusal")
        } catch let error as DaemonClientError {
            XCTAssertEqual(error.code, "release.observer-not-configured")
            XCTAssertFalse(error.retryable)
        }
    }

    // MARK: Rail state

    func testReleaseRailStateProvenanceIsLiveOnlyWhenAnObservationExists() throws {
        XCTAssertEqual(ReleaseRailState(projection: nil).provenance, .notYetSourced)
        guard case .success(_, .releaseProjection(let empty)) = try decode("release-projection-empty.response.json") else {
            return XCTFail("expected release.projection")
        }
        XCTAssertEqual(ReleaseRailState(projection: empty).provenance, .notYetSourced)
        XCTAssertFalse(ReleaseRailState(projection: empty).canObserve)
        let populated = try populatedProjection()
        XCTAssertEqual(ReleaseRailState(projection: populated).provenance, .live("release.projection"))
        XCTAssertTrue(ReleaseRailState(projection: populated).canObserve)
    }

    // MARK: Snapshots

    func testReleaseRailPopulated() throws {
        let state = ReleaseRailState(projection: try populatedProjection())
        assertHUD(ReleaseRailView(state: state, onObserve: {})
                    .hudPanel("release rail · app store connect", padding: HUDTheme.space.s)
                    .padding(HUDTheme.space.m)
                    .background(HUDTheme.void),
                  size: CGSize(width: 960, height: 420), named: "release-rail-populated")
    }

    func testReleaseRailEmptyUnconfigured() throws {
        guard case .success(_, .releaseProjection(let empty)) = try decode("release-projection-empty.response.json") else {
            return XCTFail("expected release.projection")
        }
        let state = ReleaseRailState(projection: empty)
        assertHUD(ReleaseRailView(state: state, onObserve: {})
                    .hudPanel("release rail · app store connect", padding: HUDTheme.space.s)
                    .padding(HUDTheme.space.m)
                    .background(HUDTheme.void),
                  size: CGSize(width: 960, height: 140), named: "release-rail-empty-unconfigured")
    }

    // MARK: Protected release operator truth (OR-39 / OR-42)

    func testProtectedReleaseCancelDoesNotClaimRemoteUndone() {
        XCTAssertEqual(
            ProtectedReleaseEffectTruth.canceledLocally.label,
            "canceled locally (remote not undone)"
        )
        XCTAssertFalse(ProtectedReleaseEffectTruth.canceledLocally.mayAuthorizeNewEffect)
    }

    func testProtectedReleaseStaleRevisionCannotAuthorizeUpload() throws {
        let generatedAt = try IsoInstant(validating: "2026-09-08T18:00:00.000Z")
        let snapshot = ProtectedReleaseOperatorSnapshot(
            releaseRunId: "9c000000-0000-4000-8000-000000000004",
            stage: .uploadApproved,
            revision: 4,
            effectTruth: .uncertain,
            identityDigest: "sha256:" + String(repeating: "a", count: 64),
            effectId: "9c000000-0000-4000-8000-000000000006",
            transportProtocol: "app-factory.fake-apple-upload.v1",
            realTransportEnabled: false,
            evidenceBasisAt: generatedAt,
            safeActions: ["refresh status", "reconcile from observation"],
            generatedAt: generatedAt
        )
        XCTAssertFalse(snapshot.authorizesProtectedUpload(expectedRevision: 3))
        XCTAssertFalse(snapshot.authorizesProtectedUpload(expectedRevision: 4))
    }
}
