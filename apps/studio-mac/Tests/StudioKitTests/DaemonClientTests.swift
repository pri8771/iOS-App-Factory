import Foundation
@testable import StudioKit
import XCTest

/// Drives `DaemonClient` against `FakeDaemonServer` to prove the frame format, auth, identity, and
/// every ambiguous-outcome path carries a retry identity — mirroring packages/command-client's tests.
final class DaemonClientTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func makeClient(_ server: FakeDaemonServer, timeout: Duration = .seconds(5)) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token,
                                              origin: .dashboard, timeout: timeout))
    }

    private func requestId(of frame: JSONValue) -> String { frame["requestId"]?.stringValue ?? "" }

    // MARK: Happy paths

    func testDoctorRoundTripSendsAValidFrame() async throws {
        let expectedToken = token.value
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.success(requestId: frame["requestId"]?.stringValue ?? "", result: [
                "operation": "doctor", "readiness": "ready", "daemonVersion": "0.1.0-ui-demo",
                "protocolVersion": 1, "startedAt": "2026-08-16T16:00:00.000Z", "issues": [],
            ]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let identity = client.createIdentity()
        let doctor = try await client.doctor(identity: identity)
        XCTAssertEqual(doctor.readiness, .ready)
        XCTAssertEqual(doctor.daemonVersion, "0.1.0-ui-demo")

        let frame = try XCTUnwrap(server.frames.first)
        XCTAssertEqual(frame["protocolVersion"], 1)
        XCTAssertEqual(frame["requestId"]?.stringValue, identity.requestId.rawValue)
        XCTAssertEqual(frame["authorization"]?.stringValue, expectedToken)
        let request = try XCTUnwrap(frame["request"])
        XCTAssertEqual(request["schemaVersion"], 1)
        XCTAssertEqual(request["commandId"]?.stringValue, identity.commandId.rawValue)
        XCTAssertEqual(request["issuedAt"]?.stringValue, identity.issuedAt.rawValue)
        XCTAssertEqual(request["origin"]?.stringValue, "dashboard")
        XCTAssertEqual(request["operation"]?.stringValue, "doctor")
        XCTAssertEqual(request["payload"], .object([:]))
        XCTAssertEqual(Set(request.objectValue!.keys),
                       ["schemaVersion", "commandId", "issuedAt", "origin", "operation", "payload"],
                       "strictObject: no extra keys")
        XCTAssertEqual(Set(frame.objectValue!.keys), ["protocolVersion", "requestId", "authorization", "request"])
    }

    func testAttemptListReturnsThreeAttemptsFromRecordedFixture() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("attempt-list.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let page = try await client.listAttempts(AttemptListQuery(scope: .all, limit: 10))
        XCTAssertEqual(page.attempts.count, 3)
        XCTAssertEqual(page.attempts.map(\.attempt.state), [.succeeded, .succeeded, .succeeded])
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload, ["scope": "all", "projectId": nil, "after": nil, "limit": 10])
    }

    func testPortfolioSnapshotVerifiesDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("portfolio-snapshot.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let snapshot = try await client.portfolioSnapshot()
        XCTAssertEqual(snapshot.projects.count, 3)
        XCTAssertEqual(snapshot.totals.blockers, 1)
    }

    func testPortfolioSnapshotRejectsTamperedDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let response = try! JSONValue.parse(Fixtures.data("portfolio-snapshot.response.json"))
            var snapshot = response["result"]!["snapshot"]!.objectValue!
            var totals = snapshot["totals"]!.objectValue!
            totals["blockers"] = 0
            snapshot["totals"] = .object(totals)
            return .reply(WireResponse.success(requestId: frame["requestId"]!.stringValue!,
                                               result: ["operation": "portfolio.snapshot", "snapshot": .object(snapshot)]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        await assertThrows(try await client.portfolioSnapshot(), code: "protocol.portfolio-digest-mismatch", retryable: false)
    }

    // MARK: Studio rooms — room.* round trips

    func testCreateRoomRoundTrip() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("room-create.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let spec = RoomCreateSpec(
            roomId: RoomID(unchecked: "50000001-0000-4000-8000-000000000001"), title: "Studio launch review",
            projectId: nil, unattendedEnabled: false, agentCooldownEvents: 4,
            participants: [RoomParticipantSpec(persona: try RoomPersona("codex"), provider: try RoomProvider("codex"), displayName: "Codex")],
            budget: RoomBudgetPolicy(dailyCeilingTokens: 200_000, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 4_000))
        let result = try await client.createRoom(spec)
        XCTAssertFalse(result.duplicate)
        XCTAssertEqual(result.room.title, "Studio launch review")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["projectId"], .null, "nullable fields are always emitted, never omitted")
        XCTAssertEqual(payload["roomId"]?.stringValue, "50000001-0000-4000-8000-000000000001")
    }

    func testListRoomsReturnsMostRecentlyUpdatedFirst() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("room-list.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let rooms = try await client.listRooms(limit: 10)
        XCTAssertEqual(rooms.count, 2)
        XCTAssertEqual(rooms[1].title, "Portfolio triage")
        XCTAssertTrue(rooms[1].roundInProgress)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload, ["limit": 10])
    }

    /// The core rooms flow: `room.post` appends a human message, then `room.events` reads the whole
    /// transcript back — including a plain system line (never silence) and a typed agent error with a
    /// bench, both of which the transcript view must render, never swallow.
    func testRoomPostThenEventsRoundTripIncludesASystemLineAndATypedError() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.post":
                return .reply(try! WireResponse.fixture("room-post.response.json", requestId: requestId))
            case "room.events":
                return .reply(try! WireResponse.fixture("room-events.response.json", requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let roomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")
        let handle = try RoomHumanHandle("priyansh")

        let posted = try await client.postToRoom(roomId: roomId, handle: handle, body: "Let's plan the launch checklist.")
        XCTAssertEqual(posted.message.body, "Let's plan the launch checklist.")
        XCTAssertEqual(posted.room.headSequence, 1)

        let events = try await client.roomEvents(roomId: roomId, afterSequence: 0, limit: 200)
        XCTAssertEqual(events.messages.count, 7)
        guard case .system(let factoryEvent) = events.messages[1] else { return XCTFail("expected a plain system line") }
        XCTAssertEqual(factoryEvent.code, .factoryEvent)
        XCTAssertFalse(factoryEvent.body.isEmpty)
        guard case .system(let typedError) = events.messages[4] else { return XCTFail("expected a typed agent error") }
        XCTAssertEqual(typedError.code, .agentError)
        XCTAssertEqual(typedError.errorCode, .limit)
        XCTAssertNotNil(typedError.benchedUntil)

        let postPayload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(postPayload["roomId"]?.stringValue, roomId.rawValue)
        XCTAssertEqual(postPayload["handle"]?.stringValue, "priyansh")
        let eventsPayload = try XCTUnwrap(server.frames.last?["request"]?["payload"])
        XCTAssertEqual(eventsPayload["afterSequence"], 0)
        XCTAssertEqual(eventsPayload["limit"], 200)
    }

    func testSignalRoomTypingRoundTrip() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("room-typing.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let roomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")
        let result = try await client.signalRoomTyping(roomId: roomId, handle: try RoomHumanHandle("priyansh"), ttlMs: 6_000)
        XCTAssertEqual(result.typingUntil.rawValue, "2026-08-16T18:12:03.000Z")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["ttlMs"], 6_000)
    }

    func testRoomParticipantsRoundTripSendsAnEmptyPayloadAndVerifiesTheDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("room-participants-list.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let catalog = try await client.roomParticipants()
        XCTAssertTrue(catalog.enabled)
        XCTAssertEqual(catalog.providers.map(\.provider), [.codex, .claude, .ollama])
        XCTAssertEqual(catalog.roster.count, 2)
        let request = try XCTUnwrap(server.frames.first?["request"])
        XCTAssertEqual(request["operation"]?.stringValue, "room.participants.list")
        XCTAssertEqual(request["payload"], [:])
    }

    func testRoomParticipantsDisabledIsAnAnswerNotAnError() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture("room-participants-list-disabled.response.json", requestId: frame["requestId"]!.stringValue!))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let catalog = try await client.roomParticipants()
        XCTAssertFalse(catalog.enabled)
        XCTAssertNotNil(catalog.unavailableReason)
        XCTAssertTrue(catalog.providers.isEmpty)
    }

    func testRoomParticipantsRejectsTamperedDigest() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let response = try! JSONValue.parse(Fixtures.data("room-participants-list.response.json"))
            var catalog = response["result"]!["catalog"]!.objectValue!
            var providers = catalog["providers"]!.arrayValue!
            var codex = providers[0].objectValue!
            codex["model"] = "gpt-5-codex-mini"
            providers[0] = .object(codex)
            catalog["providers"] = .array(providers)
            return .reply(WireResponse.success(requestId: frame["requestId"]!.stringValue!,
                                               result: ["operation": "room.participants.list", "catalog": .object(catalog)]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        await assertThrows(try await client.roomParticipants(), code: "protocol.room-participants-digest-mismatch", retryable: false)
    }

    // MARK: Remote failures

    func testNonRetryableRemoteFailureCarriesNoRetryIdentity() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.failure(requestId: frame["requestId"]?.stringValue, code: "protocol.unauthorized",
                                        message: "Authorization failed.", retryable: false))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let error = await assertThrows(try await client.doctor(), code: "protocol.unauthorized", retryable: false)
        XCTAssertTrue(error?.isRemote == true)
        XCTAssertNil(error?.retryIdentity)
    }

    func testRetryableRemoteFailurePreservesDurableIdentity() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.failure(requestId: frame["requestId"]?.stringValue,
                                        code: "daemon.handler-timeout-ambiguous",
                                        message: "Command completion is unknown after timeout; retry with the same command ID.",
                                        retryable: true))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let identity = client.createIdentity()
        let error = await assertThrows(try await client.doctor(identity: identity),
                                       code: "daemon.handler-timeout-ambiguous", retryable: true)
        XCTAssertEqual(error?.retryIdentity, identity.retryable)
        if case .remote(let requestId) = error?.origin {
            XCTAssertEqual(requestId, identity.requestId)
        } else {
            XCTFail("expected remote origin")
        }

        // A retry keeps commandId + issuedAt and mints a new requestId.
        let retry = client.createRetryIdentity(try XCTUnwrap(error?.retryIdentity))
        XCTAssertEqual(retry.commandId, identity.commandId)
        XCTAssertEqual(retry.issuedAt, identity.issuedAt)
        XCTAssertNotEqual(retry.requestId, identity.requestId)
        _ = await assertThrows(try await client.doctor(identity: retry), code: "daemon.handler-timeout-ambiguous", retryable: true)
        let frames = server.frames
        XCTAssertEqual(frames.count, 2)
        XCTAssertEqual(frames[0]["request"]?["commandId"], frames[1]["request"]?["commandId"])
        XCTAssertEqual(frames[0]["request"]?["issuedAt"], frames[1]["request"]?["issuedAt"])
        XCTAssertNotEqual(frames[0]["requestId"], frames[1]["requestId"])
    }

    // MARK: Protocol violations — every one is ambiguous, so every one is retryable with identity

    func testResponseIdMismatchIsRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in
            .reply(WireResponse.success(requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", result: [
                "operation": "doctor", "readiness": "ready", "daemonVersion": "x", "protocolVersion": 1,
                "startedAt": "2026-08-16T16:00:00.000Z", "issues": [],
            ]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let identity = client.createIdentity()
        let error = await assertThrows(try await client.doctor(identity: identity), code: "protocol.response-id-mismatch", retryable: true)
        XCTAssertEqual(error?.retryIdentity, identity.retryable)
    }

    func testResponseOperationMismatchIsRetryable() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.success(requestId: frame["requestId"]!.stringValue!, result: [
                "operation": "attempt.pause", "attemptId": "00000001-0000-4000-8000-000000000001",
                "desiredState": "paused", "accepted": true,
            ]))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        _ = await assertThrows(try await client.doctor(), code: "protocol.response-operation-mismatch", retryable: true)
    }

    func testMalformedJSONIsRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in .reply(Data("{not json\n".utf8)) }
        defer { server.stop() }
        let client = try makeClient(server)
        _ = await assertThrows(try await client.doctor(), code: "protocol.malformed-response", retryable: true)
    }

    func testInvalidProtocolResponseIsRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in .reply(Data("{\"protocolVersion\":1,\"ok\":true}\n".utf8)) }
        defer { server.stop() }
        let client = try makeClient(server)
        _ = await assertThrows(try await client.doctor(), code: "protocol.invalid-response", retryable: true)
    }

    func testMultipleFramesAreRejected() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let one = WireResponse.success(requestId: frame["requestId"]!.stringValue!, result: [
                "operation": "doctor", "readiness": "ready", "daemonVersion": "x", "protocolVersion": 1,
                "startedAt": "2026-08-16T16:00:00.000Z", "issues": [],
            ])
            return .reply(one + one)
        }
        defer { server.stop() }
        let client = try makeClient(server)
        _ = await assertThrows(try await client.doctor(), code: "protocol.multiple-responses", retryable: true)
    }

    func testTrailingWhitespaceAfterTheFrameIsTolerated() async throws {
        let server = try FakeDaemonServer { frame, _ in
            .reply(WireResponse.success(requestId: frame["requestId"]!.stringValue!, result: [
                "operation": "doctor", "readiness": "degraded", "daemonVersion": "x", "protocolVersion": 1,
                "startedAt": "2026-08-16T16:00:00.000Z", "issues": ["sqlite: read-only"],
            ]) + Data("\r\n \t\n".utf8))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let doctor = try await client.doctor()
        XCTAssertEqual(doctor.readiness, .degraded)
        XCTAssertEqual(doctor.issues, ["sqlite: read-only"])
    }

    func testRemoteClosedWithoutFrameIsRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in .closeSilently }
        defer { server.stop() }
        let client = try makeClient(server)
        _ = await assertThrows(try await client.doctor(), code: "transport.remote-closed", retryable: true)
    }

    func testTimeoutIsRetryableWithIdentity() async throws {
        let server = try FakeDaemonServer { _, _ in .hang }
        defer { server.stop() }
        let client = try makeClient(server, timeout: .milliseconds(300))
        let identity = client.createIdentity()
        let error = await assertThrows(try await client.doctor(identity: identity), code: "transport.timeout", retryable: true)
        XCTAssertEqual(error?.retryIdentity, identity.retryable)
    }

    func testMissingSocketIsRetryableConnectionFailure() async throws {
        let client = try DaemonClient(configuration: .init(
            socketPath: NSTemporaryDirectory() + "afs-missing-" + UUID().uuidString.lowercased().prefix(6) + ".sock",
            authorization: token, timeout: .seconds(2)))
        let error = await assertThrows(try await client.doctor(), code: "transport.connection-failed", retryable: true)
        XCTAssertNotNil(error?.retryIdentity)
    }

    func testCancellationBeforeDispatchIsNotRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in .hang }
        defer { server.stop() }
        let client = try makeClient(server, timeout: .seconds(5))
        let task = Task { try await client.doctor() }
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("expected cancellation")
        } catch let error as DaemonClientError {
            XCTAssertTrue(["client.cancelled", "client.cancelled-after-dispatch"].contains(error.code), error.code)
            XCTAssertEqual(error.retryable, error.code == "client.cancelled-after-dispatch")
        }
    }

    func testCloseCancelsInFlightAsAmbiguous() async throws {
        let server = try FakeDaemonServer { _, _ in .hang }
        defer { server.stop() }
        let client = try makeClient(server, timeout: .seconds(5))
        let task = Task { try await client.doctor() }
        try await Task.sleep(for: .milliseconds(200))
        await client.close()
        do {
            _ = try await task.value
            XCTFail("expected closed")
        } catch let error as DaemonClientError {
            XCTAssertEqual(error.code, "client.closed-after-dispatch")
            XCTAssertTrue(error.retryable)
            XCTAssertNotNil(error.retryIdentity)
        }
        _ = await assertThrows(try await client.doctor(), code: "client.closed", retryable: false)
    }

    // MARK: Configuration

    func testSocketPathMustBeAbsoluteAndShort() {
        XCTAssertThrowsError(try DaemonClient(configuration: .init(socketPath: "relative.sock", authorization: token)))
        XCTAssertThrowsError(try DaemonClient(configuration: .init(
            socketPath: "/" + String(repeating: "x", count: 100), authorization: token)))
        XCTAssertNoThrow(try DaemonClient(configuration: .init(socketPath: "/tmp/ok.sock", authorization: token)))
    }

    func testRequestTooLargeIsNotRetryable() async throws {
        let server = try FakeDaemonServer { _, _ in .hang }
        defer { server.stop() }
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token,
                                                           maxRequestBytes: 64))
        _ = await assertThrows(try await client.doctor(), code: "client.request-too-large", retryable: false)
    }

    // MARK: Helpers

    @discardableResult
    private func assertThrows<T>(_ expression: @autoclosure () async throws -> T, code: String, retryable: Bool,
                                 file: StaticString = #filePath, line: UInt = #line) async -> DaemonClientError? {
        do {
            _ = try await expression()
            XCTFail("expected \(code)", file: file, line: line)
            return nil
        } catch let error as DaemonClientError {
            XCTAssertEqual(error.code, code, file: file, line: line)
            XCTAssertEqual(error.retryable, retryable, file: file, line: line)
            if retryable {
                XCTAssertNotNil(error.retryIdentity, "retryable errors carry the durable identity", file: file, line: line)
            } else {
                XCTAssertNil(error.retryIdentity, file: file, line: line)
            }
            return error
        } catch {
            XCTFail("unexpected \(error)", file: file, line: line)
            return nil
        }
    }
}
