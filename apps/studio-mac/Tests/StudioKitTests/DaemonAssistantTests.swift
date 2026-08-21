import Foundation
@testable import StudioKit
import XCTest

/// The intent phrase recognizer (unchanged by Wave 9b), and `ChatModel`'s Wave 9b shape: posting to a
/// room (via `RoomsModel`, never duplicated) with a recognized-intent overlay on top — a confirmation
/// card on a successful `studio.assistant.intent.propose`, an honest "assistant unavailable" system
/// note on a `nil` backend or a failed proposal (replacing the deleted `ScriptedAssistant` fallback) —
/// plus the full propose -> confirm -> execute round trip against `FakeDaemonServer` and
/// `ChatThreadItem`'s interleaving rule.
final class DaemonAssistantTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")
    private let roomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")

    // MARK: IntentRecognizer

    func testRecognizesScanEnrollAndApprovePhrasings() throws {
        guard case .scanProject(let path) = try XCTUnwrap(IntentRecognizer.recognize("scan /Users/example/code/hindsight")) else {
            return XCTFail("expected scan-project")
        }
        XCTAssertEqual(path.rawValue, "/Users/example/code/hindsight")

        let digest = "sha256:" + String(repeating: "12", count: 32)
        guard case .enrollProject(let planDigest, let branch) = try XCTUnwrap(IntentRecognizer.recognize("enroll \(digest) on studio/phase2")) else {
            return XCTFail("expected enroll-project")
        }
        XCTAssertEqual(planDigest.rawValue, digest)
        XCTAssertEqual(branch?.rawValue, "studio/phase2")

        let attemptId = "00000004-0000-4000-8000-000000000004"
        guard case .approveAttempt(let id, let answer) = try XCTUnwrap(IntentRecognizer.recognize("approve \(attemptId) go ahead")) else {
            return XCTFail("expected approve-attempt")
        }
        XCTAssertEqual(id.rawValue, attemptId)
        XCTAssertEqual(answer, "go ahead")
    }

    func testDoesNotRecognizeQuestionsOrMalformedIdentifiers() {
        XCTAssertNil(IntentRecognizer.recognize("how many attempts are there?"))
        XCTAssertNil(IntentRecognizer.recognize("scan relative/path"), "not an absolute path")
        XCTAssertNil(IntentRecognizer.recognize("approve not-a-uuid go ahead"))
        XCTAssertNil(IntentRecognizer.recognize("queue task foo"), "queue-task needs a full TaskSpec, not recognized from text")
    }

    // MARK: Fixtures / fakes

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    /// Mirrors `StudioStore.assistantBackend` closure-for-closure, over a plain `DaemonClient`, so
    /// these tests prove the same wiring the app uses without needing a full `StudioStore`. `query`
    /// is wired for completeness (the type still carries it — Architecture decision 14 keeps
    /// `AssistantBackend` whole) even though `ChatModel` never calls it.
    private func backend(for client: DaemonClient) -> AssistantBackend {
        AssistantBackend(
            query: { question, projectId in
                do { return .answer(try await client.assistantQuery(AssistantQuery(question: question, projectId: projectId))) }
                catch let error as DaemonClientError where error.isUnsupportedOperation { return .unsupported }
                catch { return .failed(String(describing: error)) }
            },
            proposeIntent: { utterance, payload in
                do { return .success(try await client.proposeIntent(utterance: utterance, payload: payload)) }
                catch { return .failure(AssistantBackendError(String(describing: error))) }
            },
            executeIntent: { intent in
                do { return .success(try await client.executeIntent(intent).outcome) }
                catch { return .failure(AssistantBackendError(String(describing: error))) }
            })
    }

    /// `room.post` always answers with `room-post.response.json` (sequence 1); `studio.assistant.*`
    /// dispatches to the named fixture; anything else fails with `protocol.unsupported-operation`.
    private func server(proposeFixture: String? = "assistant-intent-propose.response.json",
                        executeFixture: String? = "assistant-intent-execute.response.json") throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.post":
                return .reply(try! WireResponse.fixture("room-post.response.json", requestId: requestId))
            case "studio.assistant.intent.propose":
                guard let proposeFixture else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.propose-unavailable", message: "propose is down", retryable: false))
                }
                return .reply(try! WireResponse.fixture(proposeFixture, requestId: requestId))
            case "studio.assistant.intent.execute":
                guard let executeFixture else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.execute-unavailable", message: "execute is down", retryable: false))
                }
                return .reply(try! WireResponse.fixture(executeFixture, requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
        }
    }

    @MainActor
    private func makeRooms(_ server: FakeDaemonServer, draft: String) throws -> RoomsModel {
        let client = try makeClient(server)
        let rooms = RoomsModel(client: client)
        rooms.drafts[roomId] = draft
        return rooms
    }

    // MARK: ChatModel.send — the overlay rules

    @MainActor
    func testSendPostsAnOrdinaryMessageWithNoOverlay() async throws {
        let server = try server()
        defer { server.stop() }
        let rooms = try makeRooms(server, draft: "Let's plan the launch checklist.")
        let chat = ChatModel()
        let posted = await chat.send(roomId, rooms: rooms, backend: backend(for: try makeClient(server)))
        XCTAssertEqual(posted?.body, "Let's plan the launch checklist.")
        let items = chat.threadItems(roomId: roomId, messages: [.message(try XCTUnwrap(posted))])
        XCTAssertEqual(items.count, 1, "no intent card/note for an unrecognized phrasing")
        XCTAssertEqual(rooms.drafts[roomId], "", "the draft is cleared by the post")
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["room.post"], "never proposes an intent for text IntentRecognizer doesn't recognize")
    }

    @MainActor
    func testSendOfARecognizedPhraseAlsoProposesAndOverlaysAPendingCard() async throws {
        let server = try server()
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let sent = await chat.send(roomId, rooms: rooms, backend: backend(for: try makeClient(server)))
        let posted = try XCTUnwrap(sent)

        let items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        XCTAssertEqual(items.count, 2)
        guard case .room = items[0] else { return XCTFail("posted message sorts first") }
        guard case .intentCard(_, let anchor, let card) = items[1] else { return XCTFail("expected an overlaid intent card") }
        XCTAssertEqual(anchor, posted.sequence)
        XCTAssertEqual(card.status, .pending)
        guard case .approveAttempt(let attemptId, _) = card.intent.payload else { return XCTFail("expected approve-attempt") }
        XCTAssertEqual(attemptId.rawValue, "00000004-0000-4000-8000-000000000004")

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["room.post", "studio.assistant.intent.propose"], "the room post happens regardless of the intent side")
    }

    @MainActor
    func testSendWithNoBackendStillPostsAndOverlaysAnHonestNote() async throws {
        let server = try server()
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let sent = await chat.send(roomId, rooms: rooms, backend: nil)
        let posted = try XCTUnwrap(sent)

        let items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        XCTAssertEqual(items.count, 2)
        guard case .systemNote(_, let anchor, let text) = items[1] else { return XCTFail("expected a system note, not a scripted reply") }
        XCTAssertEqual(anchor, posted.sequence)
        XCTAssertEqual(text, "no daemon connection")
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["room.post"], "no propose call with no backend")
    }

    @MainActor
    func testSendWhenProposeFailsOverlaysAnHonestNoteInsteadOfAScriptedStub() async throws {
        let server = try server(proposeFixture: nil)
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let sent = await chat.send(roomId, rooms: rooms, backend: backend(for: try makeClient(server)))
        let posted = try XCTUnwrap(sent)

        let items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        guard case .systemNote(_, _, let text) = items[1] else { return XCTFail("expected a system note") }
        XCTAssertTrue(text.contains("test.propose-unavailable"), text)
    }

    @MainActor
    func testSendOfAnEmptyDraftPostsNothing() async throws {
        let server = try server()
        defer { server.stop() }
        let rooms = try makeRooms(server, draft: "   ")
        let chat = ChatModel()
        let posted = await chat.send(roomId, rooms: rooms, backend: nil)
        XCTAssertNil(posted)
        XCTAssertTrue(server.frames.isEmpty)
    }

    // MARK: Confirm / cancel round trip

    @MainActor
    func testConfirmIntentExecutesAndRecordsTheResultingAttemptId() async throws {
        let server = try server()
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let backend = self.backend(for: try makeClient(server))
        let sent = await chat.send(roomId, rooms: rooms, backend: backend)
        let posted = try XCTUnwrap(sent)

        var items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        guard case .intentCard(let cardId, _, _) = items[1] else { return XCTFail("expected a pending card") }

        let outcome = await chat.confirmIntent(roomId, cardId: cardId, backend: backend)
        XCTAssertEqual(outcome?.attemptId?.rawValue, "00000004-0000-4000-8000-000000000004")

        items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        guard case .intentCard(_, _, let card) = items[1] else { return XCTFail("expected the same card") }
        guard case .executed(let summary) = card.status else { return XCTFail("expected an executed outcome, got \(card.status)") }
        XCTAssertTrue(summary.contains("00000004-0000-4000-8000-000000000004"), summary)

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["room.post", "studio.assistant.intent.propose", "studio.assistant.intent.execute"])
    }

    @MainActor
    func testCancelIntentNeverCallsExecute() async throws {
        let server = try server()
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let backend = self.backend(for: try makeClient(server))
        let sent = await chat.send(roomId, rooms: rooms, backend: backend)
        let posted = try XCTUnwrap(sent)

        let items = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        guard case .intentCard(let cardId, _, _) = items[1] else { return XCTFail("expected a pending card") }
        chat.cancelIntent(roomId, cardId: cardId)

        let after = chat.threadItems(roomId: roomId, messages: [.message(posted)])
        guard case .intentCard(_, _, let card) = after[1] else { return XCTFail("expected the same card") }
        XCTAssertEqual(card.status, .cancelled)
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["room.post", "studio.assistant.intent.propose"], "cancelling never dispatches execute")
    }

    // MARK: ChatThreadItem interleaving

    /// A card anchored to an earlier message sorts between that message and a later one — never
    /// after a message that hadn't happened yet when the card was created.
    @MainActor
    func testThreadItemsSortACardImmediatelyAfterItsAnchorMessage() async throws {
        let server = try server()
        defer { server.stop() }
        let utterance = "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload."
        let rooms = try makeRooms(server, draft: utterance)
        let chat = ChatModel()
        let sent = await chat.send(roomId, rooms: rooms, backend: backend(for: try makeClient(server)))
        let firstMessage = try XCTUnwrap(sent)
        XCTAssertEqual(firstMessage.sequence, 1)

        let laterMessage = RoomChatMessage(
            roomId: roomId, messageId: RoomMessageID(unchecked: "51000001-0000-4000-8000-000000000099"), sequence: 2,
            occurredAt: IsoInstant(unchecked: "2026-08-16T18:02:00.000Z"), roundNumber: nil, grantId: nil,
            author: .agent(persona: try RoomPersona("codex")), body: "On it.", mentions: [])

        let items = chat.threadItems(roomId: roomId, messages: [.message(firstMessage), .message(laterMessage)])
        XCTAssertEqual(items.count, 3)
        guard case .room(let m0) = items[0] else { return XCTFail() }
        XCTAssertEqual(m0.sequence, 1)
        guard case .intentCard = items[1] else { return XCTFail("the card anchored at sequence 1 sorts right after it") }
        guard case .room(let m2) = items[2] else { return XCTFail() }
        XCTAssertEqual(m2.sequence, 2)
    }
}
