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
        let conversations = ConversationsModel(client: client, rooms: rooms)
        await rooms.loadRooms()
        await rooms.loadTranscript(roomId)
        rooms.select(roomId)
        addTeardownBlock { @MainActor in
            rooms.stopPolling()
            server.stop()
        }

        assertHUD(ChatScreen(chat: ChatModel(), rooms: rooms, conversations: conversations),
                 size: CGSize(width: 1000, height: 520), named: "chat-screen-room-empty")
    }

    func testChatScreenLiveTranscriptAllMessageKinds() async throws {
        let (rooms, conversations) = try await selectedRoomsAndConversations(fixture: "room-events.response.json")
        assertHUD(ChatScreen(chat: ChatModel(), rooms: rooms, conversations: conversations),
                 size: CGSize(width: 1100, height: 760), named: "chat-screen-room-live")
    }

    /// The corner popup showing the same room, compact.
    func testCornerChatRoomTranscript() async throws {
        let (rooms, conversations) = try await selectedRoomsAndConversations(fixture: "room-events.response.json")
        assertHUD(CornerChatView(chat: ChatModel(), rooms: rooms, conversations: conversations, minimized: .constant(false)),
                 size: CGSize(width: 420, height: 520), named: "corner-chat-room")
    }

    private func selectedRoomsAndConversations(fixture: String, listFixture: String = "room-list.response.json") async throws -> (RoomsModel, ConversationsModel) {
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
        let conversations = ConversationsModel(client: client, rooms: rooms)
        await rooms.loadRooms()
        await rooms.loadTranscript(roomId)
        rooms.select(roomId)
        addTeardownBlock { @MainActor in
            rooms.stopPolling()
            server.stop()
        }
        return (rooms, conversations)
    }

    /// Wave 9b: both sidebar sections populated — a fresh direct room ("Conversations") alongside the
    /// two existing multi rooms from `room-list.response.json` ("Rooms") — synthesized by splicing
    /// `room-create-direct.response.json`'s room into a `room.list`-shaped result (mirrors
    /// `emptyRoomEventsResult()`'s own splice pattern below).
    func testChatScreenConversationsAndRoomsSidebar() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.list":
                return .reply(WireResponse.success(requestId: requestId, result: try! Self.mixedRoomListResult()))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        let client = try makeClient(server)
        let now = pinnedNow
        let rooms = RoomsModel(client: client, now: { now })
        let conversations = ConversationsModel(client: client, rooms: rooms)
        await rooms.loadRooms()
        addTeardownBlock { @MainActor in
            rooms.stopPolling()
            server.stop()
        }
        assertHUD(ChatScreen(chat: ChatModel(), rooms: rooms, conversations: conversations),
                 size: CGSize(width: 1000, height: 520), named: "chat-screen-conversations-and-rooms-sidebar")
    }

    private nonisolated static func mixedRoomListResult() throws -> JSONValue {
        let direct = try JSONValue.parse(Fixtures.data("room-create-direct.response.json"))
        let existing = try JSONValue.parse(Fixtures.data("room-list.response.json"))
        guard let directRoom = direct["result"]?["room"], let existingRooms = existing["result"]?["rooms"]?.arrayValue else {
            throw NSError(domain: "RoomsSnapshotTests", code: 1)
        }
        return .object(["operation": "room.list", "rooms": .array([directRoom] + existingRooms)])
    }

    /// The ambient toggle (plan item 5) in both states, for the multi room `room-events.response.json`
    /// carries (`unattendedEnabled: false`) — the "on" variant flips it locally via `setUnattended`'s
    /// own optimistic path against a server that also honours the flip, so this is real model state,
    /// not a hand-built fixture.
    func testAmbientToggleOffAndOn() async throws {
        let (rooms, chat) = try await selectedRoomsModelWithUpdateSupport(fixture: "room-events.response.json")
        let off = RoomTranscriptView(rooms: rooms, chat: chat, roomId: roomId)
        _ = await rooms.setUnattended(roomId, enabled: true)
        let on = RoomTranscriptView(rooms: rooms, chat: chat, roomId: roomId)
        assertHUD(VStack(spacing: 0) { off; Rectangle().fill(HUDTheme.hairline).frame(height: 1); on }
                    .frame(width: 640).background(HUDTheme.void),
                 size: CGSize(width: 640, height: 120), named: "ambient-toggle-off-and-on")
    }

    /// The `@mention` popover (plan item 3), open over a multi room's roster after typing `@c` —
    /// matches "codex" and "claude" from `room-events.response.json`'s three-participant cast.
    func testComposerWithMentionPopoverOpen() async throws {
        let (rooms, chat) = try await selectedRoomsModelWithUpdateSupport(fixture: "room-events.response.json")
        rooms.drafts[roomId] = "@c"
        assertHUD(RoomTranscriptView(rooms: rooms, chat: chat, roomId: roomId)
                    .frame(width: 420, height: 320).background(HUDTheme.void),
                 size: CGSize(width: 420, height: 320), named: "composer-mention-popover-open")
    }

    /// A `room.update`-capable variant of `selectedRoomsModel`: `room.update` also answers (flipping
    /// `unattendedEnabled` per the request payload) so `setUnattended`'s round trip has something real
    /// to talk to, instead of only working through `room-update.response.json`'s one fixed patch.
    private func selectedRoomsModelWithUpdateSupport(fixture: String) async throws -> (RoomsModel, ChatModel) {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.events": return .reply(try! WireResponse.fixture(fixture, requestId: requestId))
            case "room.list": return .reply(try! WireResponse.fixture("room-list.response.json", requestId: requestId))
            case "room.update":
                guard let base = try? JSONValue.parse(Fixtures.data(fixture)), let room = base["result"]?["room"] else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.bad-fixture", message: "room-events fixture", retryable: false))
                }
                var patched = room.objectValue ?? [:]
                if let enabled = frame["request"]?["payload"]?["patch"]?["unattendedEnabled"] {
                    patched["unattendedEnabled"] = enabled
                }
                return .reply(WireResponse.success(requestId: requestId, result: .object(["operation": "room.update", "room": .object(patched)])))
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
        return (rooms, ChatModel())
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

    /// The "add participant" list (plan item 4): `room-participants-list.response.json`'s two
    /// OpenRouter instances aren't yet seated in `room-events.response.json`'s three-participant room,
    /// so both offer to be added.
    func testRoomRosterPanelWithAddParticipant() throws {
        let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("room-events.response.json"))
        guard case .success(_, .roomEvents(let result)) = r else { throw XCTSkip("fixture decode failed") }
        let catalogResponse = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("room-participants-list.response.json"))
        guard case .success(_, .roomParticipantsList(let catalog)) = catalogResponse else { throw XCTSkip("fixture decode failed") }
        let now = IsoInstant(unchecked: "2026-08-16T18:30:00.000Z").date!
        assertHUD(
            RoomRosterPanel(room: result.room, messages: result.messages, now: now, catalog: catalog, onAddParticipant: { _ in })
                .padding(16).frame(width: 280, alignment: .leading).background(HUDTheme.void),
            size: CGSize(width: 312, height: 560), named: "room-roster-panel-add-participant")
    }

    /// `RoomMessageRow.highlighted` — the one place `@mention` highlighting reads server-truth
    /// `RoomChatMessageV1.mentions` rather than re-deriving it from the text.
    func testHighlightedMentionsColorsOnlyServerReportedPersonas() throws {
        let plain = RoomMessageRow.highlighted("hello @claude and @codex", mentions: [])
        XCTAssertEqual(String(plain.characters), "hello @claude and @codex")
        XCTAssertNil(plain.runs.first?.foregroundColor, "no mentions reported means no highlighting, even if the text looks like one")

        let highlighted = RoomMessageRow.highlighted("hello @claude and @codex", mentions: [try RoomPersona("claude")])
        XCTAssertEqual(String(highlighted.characters), "hello @claude and @codex")
        let coloredRuns = highlighted.runs.filter { $0.foregroundColor != nil }
        XCTAssertEqual(coloredRuns.count, 1, "only the reported @claude run is colored, not @codex")
    }
}
