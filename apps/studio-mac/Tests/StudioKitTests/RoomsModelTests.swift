import Foundation
@testable import StudioKit
import XCTest

/// `RoomsModel`'s participants-catalog read (`room.participants.list`) through the fake daemon, and
/// the `NewRoomSheet` seeding/provenance rules that consume it: LIVE seats only when the daemon
/// actually answered with the rooms subsystem enabled; an honest NOT YET SOURCED local suggestion
/// (carrying the daemon's own reason) otherwise — never a local guess badged as sourced.
@MainActor
final class RoomsModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func catalogServer(fixture: String?, failWith code: String? = nil) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            guard operation == "room.participants.list" else {
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
            if let code {
                return .reply(WireResponse.failure(requestId: requestId, code: code, message: "\(operation) is down", retryable: true))
            }
            return .reply(try! WireResponse.fixture(fixture!, requestId: requestId))
        }
    }

    private func makeModel(_ server: FakeDaemonServer) throws -> RoomsModel {
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
        return RoomsModel(client: client)
    }

    // MARK: RoomsModel.loadParticipantsCatalog

    func testLoadParticipantsCatalogReadsAnEnabledCatalog() async throws {
        let server = try catalogServer(fixture: "room-participants-list.response.json")
        defer { server.stop() }
        let model = try makeModel(server)
        XCTAssertNil(model.participantsCatalog, "nil until actually read")
        await model.loadParticipantsCatalog()
        let catalog = try XCTUnwrap(model.participantsCatalog)
        XCTAssertTrue(catalog.enabled)
        XCTAssertEqual(catalog.providers.count, 5)
        XCTAssertNil(model.participantsCatalogError)
        XCTAssertFalse(model.isLoadingParticipantsCatalog)
        XCTAssertEqual(server.frames.map { $0["request"]?["operation"]?.stringValue }, ["room.participants.list"])
    }

    func testLoadParticipantsCatalogKeepsTheDaemonsDisabledReason() async throws {
        let server = try catalogServer(fixture: "room-participants-list-disabled.response.json")
        defer { server.stop() }
        let model = try makeModel(server)
        await model.loadParticipantsCatalog()
        let catalog = try XCTUnwrap(model.participantsCatalog)
        XCTAssertFalse(catalog.enabled)
        XCTAssertTrue(catalog.unavailableReason?.contains("APP_FACTORY_ROOMS_ENABLED") == true)
        XCTAssertNil(model.participantsCatalogError, "disabled is an answer, not an error")
    }

    func testLoadParticipantsCatalogRecordsAFailureAndKeepsNoCatalog() async throws {
        let server = try catalogServer(fixture: nil, failWith: "test.unavailable")
        defer { server.stop() }
        let model = try makeModel(server)
        await model.loadParticipantsCatalog()
        XCTAssertNil(model.participantsCatalog)
        XCTAssertTrue(model.participantsCatalogError?.contains("test.unavailable") == true, model.participantsCatalogError ?? "nil")
    }

    func testLoadParticipantsCatalogIsANoOpWithoutADaemon() async {
        let model = RoomsModel(client: nil)
        await model.loadParticipantsCatalog()
        XCTAssertNil(model.participantsCatalog)
        XCTAssertNil(model.participantsCatalogError)
    }

    // MARK: NewRoomSheet seeding + provenance

    private func decodeCatalog(_ fixture: String) throws -> RoomParticipantsCatalog {
        guard case .success(_, .roomParticipantsList(let catalog)) = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data(fixture)) else {
            throw NSError(domain: "RoomsModelTests", code: 1)
        }
        return catalog
    }

    private func sheet(catalog: RoomParticipantsCatalog?, isLoading: Bool = false, error: String? = nil) -> NewRoomSheet {
        NewRoomSheet(catalog: catalog, isLoadingCatalog: isLoading, catalogError: error,
                     onCreate: { _, _, _, _ in .failure(AssistantBackendError("unused")) }, onDone: { _ in })
    }

    func testEnabledCatalogSeedsOneSeatPerConfiguredProviderAndIsLive() throws {
        let catalog = try decodeCatalog("room-participants-list.response.json")
        let seeds = NewRoomSheet.ParticipantDraft.seeds(for: catalog)
        XCTAssertEqual(seeds.map(\.provider), ["codex", "claude", "ollama", "openrouter-fast", "openrouter-deep"])
        XCTAssertEqual(seeds.map(\.persona), ["codex", "claude", "ollama", "openrouter-fast", "openrouter-deep"])
        XCTAssertEqual(seeds.map(\.displayName), ["Codex", "Claude", "Ollama", "OpenRouter", "OpenRouter"])
        let view = sheet(catalog: catalog)
        XCTAssertEqual(view.participantsProvenance, .live("room.participants.list"))
        XCTAssertTrue(view.participantsNote.contains("codex · gpt-5-codex (cli 0.42.0)"), view.participantsNote)
        XCTAssertTrue(view.participantsNote.contains("ollama · qwen2.5-coder:14b"), view.participantsNote)
        XCTAssertFalse(view.participantsNote.contains("local suggestion"), view.participantsNote)
    }

    func testDisabledCatalogKeepsTheLocalSuggestionAsNotYetSourcedWithTheDaemonsReason() throws {
        let catalog = try decodeCatalog("room-participants-list-disabled.response.json")
        let seeds = NewRoomSheet.ParticipantDraft.seeds(for: catalog)
        XCTAssertTrue(NewRoomSheet.ParticipantDraft.sameContent(seeds, NewRoomSheet.ParticipantDraft.suggestedDefaults))
        let view = sheet(catalog: catalog)
        XCTAssertEqual(view.participantsProvenance, .notYetSourced)
        XCTAssertTrue(view.participantsNote.contains("APP_FACTORY_ROOMS_ENABLED"), view.participantsNote)
        XCTAssertTrue(view.participantsNote.contains("local suggestion"), view.participantsNote)
    }

    func testUnreadOrFailedCatalogIsNeverLive() {
        XCTAssertEqual(sheet(catalog: nil).participantsProvenance, .notYetSourced)
        XCTAssertTrue(sheet(catalog: nil).participantsNote.contains("not read yet"))
        XCTAssertTrue(sheet(catalog: nil, isLoading: true).participantsNote.contains("Reading configured participants"))
        let failed = sheet(catalog: nil, error: "test.unavailable: room.participants.list is down")
        XCTAssertEqual(failed.participantsProvenance, .notYetSourced)
        XCTAssertTrue(failed.participantsNote.contains("test.unavailable"), failed.participantsNote)
        XCTAssertTrue(NewRoomSheet.ParticipantDraft.sameContent(
            NewRoomSheet.ParticipantDraft.seeds(for: nil), NewRoomSheet.ParticipantDraft.suggestedDefaults))
    }

    func testEnabledCatalogWithNoProvidersSeedsNothingRatherThanGuessing() throws {
        var catalog = try decodeCatalog("room-participants-list.response.json")
        catalog.providers = []
        XCTAssertTrue(NewRoomSheet.ParticipantDraft.seeds(for: catalog).isEmpty)
        let view = sheet(catalog: catalog)
        XCTAssertEqual(view.participantsProvenance, .live("room.participants.list"))
        XCTAssertTrue(view.participantsNote.contains("no configured providers"), view.participantsNote)
    }

    // MARK: createRoom(flavor:) — Wave 9b / Architecture decision 1

    func testCreateRoomDefaultsToRoomFlavorAndPassesDirectThrough() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            guard operation == "room.create" else {
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
            return .reply(try! WireResponse.fixture("room-create-direct.response.json", requestId: requestId))
        }
        defer { server.stop() }
        let model = try makeModel(server)
        let spec = [RoomParticipantSpec(persona: try RoomPersona("codex"), provider: try RoomProvider("codex"), displayName: "Codex")]
        _ = await model.createRoom(title: "Quick question", projectId: nil, unattendedEnabled: false, participants: spec, flavor: .direct)
        let lastFlavor = server.frames.first?["request"]?["payload"]?["flavor"]?.stringValue
        XCTAssertEqual(lastFlavor, "direct")
    }

    // MARK: room.update / setUnattended — Wave 9b / Architecture decision 14, plan item 5

    private func mixedOpsServer(unattendedEcho: Bool = true) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.events": return .reply(try! WireResponse.fixture("room-events.response.json", requestId: requestId))
            case "room.list": return .reply(try! WireResponse.fixture("room-list.response.json", requestId: requestId))
            case "room.update":
                guard let base = try? JSONValue.parse(Fixtures.data("room-events.response.json")), let room = base["result"]?["room"] else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.bad-fixture", message: "room-events fixture", retryable: false))
                }
                var patched = room.objectValue ?? [:]
                if let enabled = frame["request"]?["payload"]?["patch"]?["unattendedEnabled"] {
                    patched["unattendedEnabled"] = unattendedEcho ? enabled : .bool(false)
                }
                if let title = frame["request"]?["payload"]?["patch"]?["title"] {
                    patched["title"] = title
                }
                patched["updatedAt"] = "2026-08-16T19:00:00.000Z"
                return .reply(WireResponse.success(requestId: requestId, result: .object(["operation": "room.update", "room": .object(patched)])))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
    }

    private let roomEventsRoomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")

    @MainActor
    private func selectedModel(_ server: FakeDaemonServer) async throws -> RoomsModel {
        let model = try makeModel(server)
        await model.loadTranscript(roomEventsRoomId)
        model.select(roomEventsRoomId)
        return model
    }

    func testSetUnattendedFlipsOptimisticallyThenConfirmsFromTheServer() async throws {
        let server = try mixedOpsServer()
        defer { server.stop() }
        let model = try await selectedModel(server)
        XCTAssertEqual(model.room(roomEventsRoomId)?.unattendedEnabled, false, "room-events.response.json starts unattended-off")

        let result = await model.setUnattended(roomEventsRoomId, enabled: true)
        guard case .success(let room) = result else { return XCTFail("expected success") }
        XCTAssertTrue(room.unattendedEnabled)
        XCTAssertTrue(model.room(roomEventsRoomId)?.unattendedEnabled ?? false)
        XCTAssertNil(model.roomErrors[roomEventsRoomId])
    }

    func testSetUnattendedRevertsOnFailure() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "room.events": return .reply(try! WireResponse.fixture("room-events.response.json", requestId: requestId))
            case "room.list": return .reply(try! WireResponse.fixture("room-list.response.json", requestId: requestId))
            case "room.update":
                return .reply(WireResponse.failure(requestId: requestId, code: "room.stale-update", message: "expectedUpdatedAt mismatch", retryable: false))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let model = try await selectedModel(server)
        XCTAssertEqual(model.room(roomEventsRoomId)?.unattendedEnabled, false)

        let result = await model.setUnattended(roomEventsRoomId, enabled: true)
        guard case .failure(let error) = result else { return XCTFail("expected failure") }
        XCTAssertTrue(error.description.contains("room.stale-update"), error.description)
        XCTAssertEqual(model.room(roomEventsRoomId)?.unattendedEnabled, false, "reverted to the pre-flip value")
        XCTAssertEqual(model.roomErrors[roomEventsRoomId], error.description)
    }

    /// The ~1.5s poll must not clobber `setUnattended`'s own result with a concurrently-fetched
    /// snapshot that predates it: `room.events` here always answers the original stale fixture
    /// (`unattendedEnabled: false`, an older `updatedAt`) — exactly what a poll in flight at the
    /// moment of the update would fetch — so letting the real poll loop run at least once after the
    /// flip and asserting it still reads `true` proves the `roomUpdateFloor` guard, not a mock of it.
    func testSetUnattendedSurvivesAConcurrentStalePoll() async throws {
        let server = try mixedOpsServer()
        defer { server.stop() }
        let model = try makeModel(server)
        await model.loadTranscript(roomEventsRoomId)
        model.select(roomEventsRoomId) // starts the ~1.5s poll loop against the still-stale fixture
        defer { model.stopPolling() }

        _ = await model.setUnattended(roomEventsRoomId, enabled: true)
        XCTAssertTrue(model.room(roomEventsRoomId)?.unattendedEnabled ?? false)

        try await Task.sleep(for: .milliseconds(1700)) // let at least one poll cycle land
        XCTAssertTrue(model.room(roomEventsRoomId)?.unattendedEnabled ?? false,
                      "a poll snapshot older than the update's own result must be ignored, not silently revert the toggle")
    }

    func testUpdateRoomRenamesAndAppliesTheServersResult() async throws {
        let server = try mixedOpsServer()
        defer { server.stop() }
        let model = try await selectedModel(server)
        let result = await model.updateRoom(roomEventsRoomId, patch: RoomUpdatePatch(title: "Renamed room"))
        guard case .success(let room) = result else { return XCTFail("expected success") }
        XCTAssertEqual(room.title, "Renamed room")
        XCTAssertEqual(model.room(roomEventsRoomId)?.title, "Renamed room")
    }

    func testUpdateRoomFailsHonestlyWithNoRoomLoaded() async throws {
        let server = try mixedOpsServer()
        defer { server.stop() }
        let model = try makeModel(server)
        let result = await model.updateRoom(roomEventsRoomId, patch: RoomUpdatePatch(title: "x"))
        guard case .failure = result else { return XCTFail("expected failure — room not loaded yet") }
    }

    // MARK: mintPersona — plan item 4

    func testMintPersonaUsesTheCatalogsRoomProviderKey() throws {
        let entry = RoomCatalogProviderEntry(provider: .openrouter, roomProviderKey: try RoomProvider("openrouter-fast"),
                                             model: "gpt", cliVersion: nil)
        XCTAssertEqual(RoomsModel.mintPersona(for: entry, existingPersonas: [])?.rawValue, "openrouter-fast")
    }

    func testMintPersonaAppendsANumericSuffixOnCollision() throws {
        let entry = RoomCatalogProviderEntry(provider: .claude, roomProviderKey: nil, model: "claude-x", cliVersion: nil)
        let minted = RoomsModel.mintPersona(for: entry, existingPersonas: ["claude"])
        XCTAssertEqual(minted?.rawValue, "claude-2")
        let mintedAgain = RoomsModel.mintPersona(for: entry, existingPersonas: ["claude", "claude-2"])
        XCTAssertEqual(mintedAgain?.rawValue, "claude-3")
    }

    func testMintPersonaFallsBackToTheBareProviderForALegacyCatalogEntry() throws {
        let entry = RoomCatalogProviderEntry(provider: .ollama, roomProviderKey: nil, model: "qwen2.5:3b", cliVersion: nil)
        XCTAssertEqual(RoomsModel.mintPersona(for: entry, existingPersonas: [])?.rawValue, "ollama")
    }

    func testSameContentIgnoresRowIdentityButNotEdits() {
        let a = NewRoomSheet.ParticipantDraft.suggestedDefaults
        let b = NewRoomSheet.ParticipantDraft.suggestedDefaults
        XCTAssertNotEqual(a, b, "each row mints its own identity")
        XCTAssertTrue(NewRoomSheet.ParticipantDraft.sameContent(a, b))
        var edited = b
        edited[0].displayName = "Codex (planner)"
        XCTAssertFalse(NewRoomSheet.ParticipantDraft.sameContent(a, edited))
        XCTAssertFalse(NewRoomSheet.ParticipantDraft.sameContent(a, Array(b.dropLast())))
    }
}
