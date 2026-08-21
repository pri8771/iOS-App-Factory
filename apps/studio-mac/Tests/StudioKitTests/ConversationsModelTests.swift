import Foundation
@testable import StudioKit
import XCTest

/// `ConversationsModel` — the thin façade over `RoomsModel` (Architecture decisions 1/14): flavor
/// filtering, and the new-conversation flow (`settings.get` -> `room.create` direct -> `RoomsModel`
/// selects it), including the honest no-default-provider refusal.
@MainActor
final class ConversationsModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    // MARK: New-conversation flow

    func testNewConversationReadsTheDefaultProviderThenCreatesADirectRoomAndSelectsIt() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "settings.get": return .reply(try! WireResponse.fixture("settings-get-set.response.json", requestId: requestId))
            case "room.participants.list": return .reply(try! WireResponse.fixture("room-participants-list.response.json", requestId: requestId))
            case "room.create":
                return .reply(try! WireResponse.fixture("room-create-direct.response.json", requestId: requestId))
            case "room.list": return .reply(try! WireResponse.fixture("room-list.response.json", requestId: requestId))
            default: return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let rooms = RoomsModel(client: client)
        let conversations = ConversationsModel(client: client, rooms: rooms)

        let result = await conversations.newConversation()
        guard case .success(let room) = result else { return XCTFail("expected success, got \(result)") }
        XCTAssertTrue(room.isDirect)
        XCTAssertFalse(conversations.needsDefaultProvider)
        XCTAssertNil(conversations.newConversationError)
        XCTAssertEqual(rooms.selectedRoomId, room.roomId, "RoomsModel.createRoom already selects on success — the façade doesn't need to duplicate that")

        // settings-get-set.response.json's stored default is "codex" — the catalog's own displayName
        // for that key ("Codex") sources the participant, never a guess.
        let createFrame = try XCTUnwrap(server.frames.first { $0["request"]?["operation"]?.stringValue == "room.create" })
        let payload = try XCTUnwrap(createFrame["request"]?["payload"])
        XCTAssertEqual(payload["flavor"]?.stringValue, "direct")
        let participants = try XCTUnwrap(payload["participants"]?.arrayValue)
        XCTAssertEqual(participants.count, 1)
        XCTAssertEqual(participants[0]["persona"]?.stringValue, "codex")
        XCTAssertEqual(participants[0]["provider"]?.stringValue, "codex")
        XCTAssertEqual(participants[0]["displayName"]?.stringValue, "Codex")

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["settings.get", "room.participants.list", "room.create", "room.list"])
    }

    func testNewConversationRefusesHonestlyWhenNoDefaultProviderIsSet() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "settings.get": return .reply(try! WireResponse.fixture("settings-get-unset.response.json", requestId: requestId))
            default: return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let rooms = RoomsModel(client: client)
        let conversations = ConversationsModel(client: client, rooms: rooms)

        let result = await conversations.newConversation()
        guard case .failure = result else { return XCTFail("expected an honest refusal") }
        XCTAssertTrue(conversations.needsDefaultProvider)
        let message = try XCTUnwrap(conversations.newConversationError)
        XCTAssertTrue(message.localizedCaseInsensitiveContains("Settings"), message)
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["settings.get"], "never guesses a provider — room.create is never called")
    }

    func testNewConversationWithNoDaemonFailsWithoutTouchingTheWire() async {
        let rooms = RoomsModel(client: nil)
        let conversations = ConversationsModel(client: nil, rooms: rooms)
        let result = await conversations.newConversation()
        guard case .failure = result else { return XCTFail("expected failure") }
        XCTAssertFalse(conversations.needsDefaultProvider, "this is 'no daemon at all', not 'no default provider set'")
    }

    // MARK: Flavor filtering

    private nonisolated static func mixedRoomListResult(archivedRoomId: String? = nil) throws -> JSONValue {
        let direct = try JSONValue.parse(Fixtures.data("room-create-direct.response.json"))
        let existing = try JSONValue.parse(Fixtures.data("room-list.response.json"))
        guard let directRoom = direct["result"]?["room"], var rooms = existing["result"]?["rooms"]?.arrayValue else {
            throw NSError(domain: "ConversationsModelTests", code: 1)
        }
        if let archivedRoomId, var archived = rooms.first?.objectValue {
            archived["roomId"] = .string(archivedRoomId)
            archived["archivedAt"] = "2026-08-16T20:00:00.000Z"
            rooms.append(.object(archived))
        }
        return .object(["operation": "room.list", "rooms": .array([directRoom] + rooms)])
    }

    func testConversationsAndMultiRoomsFilterByFlavor() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            guard operation == "room.list" else {
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
            return .reply(WireResponse.success(requestId: requestId, result: try! Self.mixedRoomListResult()))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let rooms = RoomsModel(client: client)
        let conversations = ConversationsModel(client: client, rooms: rooms)
        await rooms.loadRooms()

        XCTAssertEqual(conversations.conversations.map(\.roomId.rawValue), ["50000004-0000-4000-8000-000000000004"])
        XCTAssertTrue(conversations.conversations.allSatisfy(\.isDirect))
        XCTAssertEqual(Set(conversations.multiRooms.map(\.roomId.rawValue)),
                       ["50000001-0000-4000-8000-000000000001", "50000002-0000-4000-8000-000000000002"])
        XCTAssertTrue(conversations.multiRooms.allSatisfy { $0.flavor == .room })
    }

    /// A defensive filter, not a reliance on the server's own `includeArchived: false` default: even
    /// if an archived room slipped into `rooms.rooms`, `multiRooms` never lists it.
    func testMultiRoomsExcludesAnArchivedRoomEvenIfPresentInTheRawList() async throws {
        let archivedId = "50000009-0000-4000-8000-000000000009"
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            guard operation == "room.list" else {
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
            return .reply(WireResponse.success(requestId: requestId, result: try! Self.mixedRoomListResult(archivedRoomId: archivedId)))
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let rooms = RoomsModel(client: client)
        let conversations = ConversationsModel(client: client, rooms: rooms)
        await rooms.loadRooms()

        XCTAssertTrue(rooms.rooms.contains { $0.roomId.rawValue == archivedId }, "sanity: the raw list does carry the archived room")
        XCTAssertFalse(conversations.multiRooms.contains { $0.roomId.rawValue == archivedId })
    }

    func testConversationsAndMultiRoomsAreEmptyWithNoDaemon() {
        let rooms = RoomsModel(client: nil)
        let conversations = ConversationsModel(client: nil, rooms: rooms)
        XCTAssertTrue(conversations.conversations.isEmpty)
        XCTAssertTrue(conversations.multiRooms.isEmpty)
        XCTAssertFalse(conversations.isConnected)
    }
}
