import AppKit
import SnapshotTesting
@testable import StudioKit
import SwiftUI
import XCTest

/// Reference images for the rooms UI in both appearances: an empty room, a live transcript carrying
/// every message/event shape (human, two agent personas, a plain system line, a PASS, a typed error
/// with a bench, and the chain-cap livelock line), and the benched-agent chip in isolation. The full
/// scenarios render through `ChatScreen` itself (not just `RoomTranscriptView`) so the sidebar's Rooms
/// section and the roster/budget panel are pinned too, not only the transcript.
@MainActor
final class RoomsSnapshotTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")
    private let roomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")

    /// Pinned inside the fixture's Ollama bench window (benchedUntil 19:05) so the roster panel's
    /// "benched until …" derivation is deterministic regardless of when the test actually runs.
    private let pinnedNow = IsoInstant(unchecked: "2026-08-16T18:30:00.000Z").date!

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    /// A `RoomsModel` whose `transcripts[roomId]` and `rooms` are populated from `fixture`, and whose
    /// `selectedRoomId` is `roomId` — real state reached through the model's own public API
    /// (`loadTranscript`/`select`), not a test backdoor, exactly like `StudioStoreTests` seeds
    /// `StudioStore` through `connect()`/`loadRun`.
    private func selectedRoomsModel(fixture: String, listFixture: String = "room-list.response.json") async throws -> RoomsModel {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.events": return .reply(try! WireResponse.fixture(fixture, requestId: requestId))
            case "room.list": return .reply(try! WireResponse.fixture(listFixture, requestId: requestId))
            default: return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        let client = try makeClient(server)
        let now = pinnedNow
        let rooms = RoomsModel(client: client, now: { now })
        await rooms.loadRooms()
        await rooms.loadTranscript(roomId)
        rooms.select(roomId)
        addTeardownBlock { @MainActor in
            rooms.stopPolling()
            server.stop()
        }
        return rooms
    }

    /// A genuinely fresh room's `room.events` result: `room-create.response.json`'s freshly-created
    /// room (zero spend, nobody benched, `headSequence: 0`) wrapped as a `room.events` result with no
    /// messages — the actual shape a brand-new room reports on its first read, not a busy room with
    /// its transcript stripped out. `nonisolated` so `FakeDaemonServer`'s `@Sendable` responder can
    /// call it without capturing a main-actor `self`.
    private nonisolated static func emptyRoomEventsResult() throws -> JSONValue {
        let created = try JSONValue.parse(Fixtures.data("room-create.response.json")).objectValue!
        let room = created["result"]!.objectValue!["room"]!
        return .object([
            "operation": "room.events",
            "room": room,
            "moderator": .object(["enabled": true, "attendance": "attended"]),
            "messages": .array([]),
            "nextAfterSequence": 0,
        ])
    }

    func testChatScreenEmptyRoom() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.events":
                return .reply(WireResponse.success(requestId: requestId, result: try! Self.emptyRoomEventsResult()))
            case "room.list":
                return .reply(try! WireResponse.fixture("room-list.response.json", requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        let client = try makeClient(server)
        let now = pinnedNow
        let rooms = RoomsModel(client: client, now: { now })
        await rooms.loadRooms()
        await rooms.loadTranscript(roomId)
        rooms.select(roomId)
        addTeardownBlock { @MainActor in
            rooms.stopPolling()
            server.stop()
        }

        assertHUD(ChatScreen(chat: ChatModel(), context: { AssistantContext(link: "offline") }, rooms: rooms),
                 size: CGSize(width: 1000, height: 520), named: "chat-screen-room-empty")
    }

    func testChatScreenLiveTranscriptAllMessageKinds() async throws {
        let rooms = try await selectedRoomsModel(fixture: "room-events.response.json")
        assertHUD(ChatScreen(chat: ChatModel(), context: { AssistantContext(link: "offline") }, rooms: rooms),
                 size: CGSize(width: 1100, height: 760), named: "chat-screen-room-live")
    }

    /// The corner popup showing the same room, compact.
    func testCornerChatRoomTranscript() async throws {
        let rooms = try await selectedRoomsModel(fixture: "room-events.response.json")
        assertHUD(CornerChatView(chat: ChatModel(), context: { AssistantContext(link: "offline") }, rooms: rooms,
                                 minimized: .constant(false)),
                 size: CGSize(width: 420, height: 520), named: "corner-chat-room")
    }

    /// The typed-error chip in isolation — "Claude/Ollama · benched until HH:mm (rate limit)", never
    /// silence, and the muted "— persona passed —" PASS line beside it.
    func testRoomMessageRowBenchedChipAndPassLine() throws {
        let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("room-events.response.json"))
        guard case .success(_, .roomEvents(let result)) = r else { throw XCTSkip("fixture decode failed") }
        assertHUD(
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(result.messages.enumerated()), id: \.offset) { _, message in
                    RoomMessageRow(message, room: result.room)
                }
            }
            .padding(16).frame(width: 520, alignment: .leading).background(HUDTheme.void),
            size: CGSize(width: 560, height: 420), named: "room-message-row-benched-and-passed")
    }

    func testRoomRosterPanel() throws {
        let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("room-events.response.json"))
        guard case .success(_, .roomEvents(let result)) = r else { throw XCTSkip("fixture decode failed") }
        let now = IsoInstant(unchecked: "2026-08-16T18:30:00.000Z").date!
        assertHUD(
            RoomRosterPanel(room: result.room, messages: result.messages, now: now)
                .padding(16).frame(width: 280, alignment: .leading).background(HUDTheme.void),
            size: CGSize(width: 312, height: 480), named: "room-roster-panel")
    }
}
