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
        XCTAssertEqual(catalog.providers.count, 3)
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
        XCTAssertEqual(seeds.map(\.provider), ["codex", "claude", "ollama"])
        XCTAssertEqual(seeds.map(\.persona), ["codex", "claude", "ollama"])
        XCTAssertEqual(seeds.map(\.displayName), ["Codex", "Claude", "Ollama"])
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
