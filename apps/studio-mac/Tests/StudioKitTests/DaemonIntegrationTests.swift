import Foundation
@testable import StudioKit
import XCTest

/// Talks to a real daemon when one is present; skips cleanly otherwise.
///
/// Defaults target the ui-demo runtime (`/tmp/af-ui/runtime/daemon.sock`, token at
/// `/tmp/af-ui/etc/auth.token`, 3 succeeded demo attempts). Override with:
///   STUDIO_TEST_DAEMON_SOCKET, STUDIO_TEST_DAEMON_AUTH_FILE, STUDIO_TEST_EXPECTED_ATTEMPTS
final class DaemonIntegrationTests: XCTestCase {
    private struct Target {
        var socketPath: String
        var authFile: URL
        var expectedAttempts: Int
    }

    private func target() throws -> (Target, DaemonClient) {
        let env = ProcessInfo.processInfo.environment
        let socketPath = env["STUDIO_TEST_DAEMON_SOCKET"] ?? "/tmp/af-ui/runtime/daemon.sock"
        let authFile = URL(fileURLWithPath: env["STUDIO_TEST_DAEMON_AUTH_FILE"] ?? "/tmp/af-ui/etc/auth.token")
        let expected = Int(env["STUDIO_TEST_EXPECTED_ATTEMPTS"] ?? "") ?? 3
        guard DaemonLocator.socketExists(at: socketPath) else {
            throw XCTSkip("no daemon socket at \(socketPath)")
        }
        guard FileManager.default.fileExists(atPath: authFile.path) else {
            throw XCTSkip("no auth token file at \(authFile.path)")
        }
        let token = try AuthorizationToken.resolve(environment: [:], fileURL: authFile)
        let client = try DaemonClient(configuration: .init(socketPath: socketPath, authorization: token,
                                                           timeout: .seconds(10)))
        return (Target(socketPath: socketPath, authFile: authFile, expectedAttempts: expected), client)
    }

    func testDoctorAgainstLiveDaemon() async throws {
        let (_, client) = try target()
        let doctor = try await client.doctor()
        XCTAssertEqual(doctor.protocolVersion, commandProtocolVersion)
        XCTAssertFalse(doctor.daemonVersion.isEmpty)
        XCTAssertTrue([.ready, .degraded].contains(doctor.readiness))
        XCTAssertNotNil(doctor.startedAt.date)
    }

    func testAttemptListAgainstLiveDaemon() async throws {
        let (target, client) = try target()
        let page = try await client.listAttempts(AttemptListQuery(scope: .all, limit: 100))
        XCTAssertEqual(page.attempts.count, target.expectedAttempts,
                       "expected \(target.expectedAttempts) attempts on \(target.socketPath)")
        // Rows are ordered by updatedAt desc, attemptId desc, and ids are unique — the page invariants.
        let ids = page.attempts.map(\.attempt.attemptId)
        XCTAssertEqual(Set(ids).count, ids.count)
        for pair in zip(page.attempts, page.attempts.dropFirst()) {
            let a = pair.0.attempt, b = pair.1.attempt
            XCTAssertTrue(a.updatedAt > b.updatedAt || (a.updatedAt == b.updatedAt && a.attemptId > b.attemptId))
        }
        XCTAssertEqual(page.hasMore, page.nextAfter != nil)
    }

    func testPortfolioSnapshotDigestVerifiesAgainstLiveDaemon() async throws {
        let (_, client) = try target()
        let snapshot = try await client.portfolioSnapshot()
        XCTAssertEqual(snapshot.totals.projects, snapshot.projects.count)
        XCTAssertTrue(snapshot.sourceSnapshotDigest.rawValue.hasPrefix("sha256:"))
    }

    func testEvidenceListAgainstLiveDaemon() async throws {
        let (_, client) = try target()
        let page = try await client.listEvidence(limit: 100)
        XCTAssertEqual(page.hasMore, page.nextAfterAttemptId != nil)
    }
}
