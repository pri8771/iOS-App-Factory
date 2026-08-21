import Foundation
@testable import StudioKit
import XCTest

/// `PhasesModel`'s Wave 9c flows (Architecture decisions 8/15) — all still CAS pairs of
/// `phase.upsert`/`preset.upsert`, proven here against a fake daemon that echoes back whatever
/// content it was asked to persist (plus the envelope fields — schemaVersion/revision/timestamps —
/// the real daemon assigns on accept): insert-a-new-stage places the freshly-upserted phase at the
/// requested index in the preset's ordered `phases[]`; reorder permutes that array under a CAS
/// `expectedRevision` without ever touching `phase.upsert`; create-preset seeds one starter stage
/// (the wire schema requires `phases.min(1)` — an empty preset can never exist even momentarily).
@MainActor
final class PhasesModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")
    private let instant = "2026-08-21T12:00:00.000Z"

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    /// Serves `preset.list` from the recorded fixture (the seeded "ios-app-standard-0.4.0" preset:
    /// contract/architecture/ready/build) and echoes `phase.upsert`/`preset.upsert` back as accepted
    /// — bumping revision to `expectedRevision + 1` (or `0` on create) and stamping timestamps. A
    /// minimal stand-in for the daemon's own upsert semantics, sufficient to prove `PhasesModel`'s
    /// plumbing without a real kernel.
    private func echoingServer() throws -> FakeDaemonServer {
        let instant = self.instant
        return try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            let payload = frame["request"]?["payload"] ?? .null
            func nextRevision() -> Double {
                if case .number(let n)? = payload["expectedRevision"] { return n + 1 }
                return 0
            }
            switch operation {
            case "preset.list":
                return .reply(try! WireResponse.fixture("preset-list.response.json", requestId: requestId))
            case "phase.upsert":
                guard var phase = payload["phase"]?.objectValue else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.bad-request", message: "no phase", retryable: false))
                }
                let revision = nextRevision()
                phase["schemaVersion"] = .number(1)
                phase["revision"] = .number(revision)
                phase["createdAt"] = .string(instant)
                phase["updatedAt"] = .string(instant)
                let result: JSONValue = .object([
                    "operation": .string("phase.upsert"), "phase": .object(phase), "created": .bool(revision == 0),
                ])
                return .reply(WireResponse.success(requestId: requestId, result: result))
            case "preset.upsert":
                guard var preset = payload["preset"]?.objectValue else {
                    return .reply(WireResponse.failure(requestId: requestId, code: "test.bad-request", message: "no preset", retryable: false))
                }
                let revision = nextRevision()
                preset["schemaVersion"] = .number(1)
                preset["revision"] = .number(revision)
                preset["createdAt"] = .string(instant)
                preset["updatedAt"] = .string(instant)
                let result: JSONValue = .object([
                    "operation": .string("preset.upsert"), "preset": .object(preset), "created": .bool(revision == 0),
                ])
                return .reply(WireResponse.success(requestId: requestId, result: result))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
    }

    // MARK: "+" insert — savePhase(_:insertAt:)

    func testStartNewPhaseThenSaveInsertsThePhaseAtTheRequestedIndex() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)
        await model.loadPresets()
        XCTAssertEqual(model.selectedPreset?.phases.map(\.phaseId.rawValue), ["contract", "architecture", "ready", "build"])

        model.startNewPhase(insertAt: 2)
        let newPhaseId = try XCTUnwrap(model.selectedPhaseId)
        XCTAssertEqual(newPhaseId.rawValue, "stage-1", "minted the same base-plus-collision-suffix way RoomsModel.mintPersona does")
        XCTAssertEqual(model.selectedPhaseInsertIndex, 2)
        let placeholder = try XCTUnwrap(model.selectedPhase)
        XCTAssertEqual(placeholder.phaseId, newPhaseId)
        XCTAssertEqual(placeholder.name, "", "blank until the operator fills it in — isValid keeps Save disabled until then")

        var draft = placeholder.draft
        draft.name = "New Stage"
        draft.purpose = "Does something new."

        let saved = await model.savePhase(draft, insertAt: model.selectedPhaseInsertIndex)
        XCTAssertTrue(saved)
        XCTAssertNil(model.saveError)
        XCTAssertNil(model.newPhaseDraft, "cleared once the placeholder is actually saved")
        XCTAssertNil(model.newPhaseInsertIndex)

        let order = model.selectedPreset?.phases.map(\.phaseId.rawValue)
        XCTAssertEqual(order, ["contract", "architecture", "stage-1", "ready", "build"])
        XCTAssertEqual(model.selectedPreset?.phases[2].name, "New Stage")

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["preset.list", "phase.upsert", "preset.upsert"])
        let phaseUpsertPayload = try XCTUnwrap(server.frames[1]["request"]?["payload"])
        XCTAssertEqual(phaseUpsertPayload["expectedRevision"], .null, "brand-new phase — never a stale CAS token")
        let presetUpsertPayload = try XCTUnwrap(server.frames[2]["request"]?["payload"])
        let phaseIdsInRequest = presetUpsertPayload["preset"]?["phases"]?.arrayValue?.compactMap { $0["phaseId"]?.stringValue }
        XCTAssertEqual(phaseIdsInRequest, ["contract", "architecture", "stage-1", "ready", "build"],
                       "the freshly-upserted phase carried at exactly the requested position")
    }

    func testSelectingAnExistingPhaseAbandonsAnInFlightNewPhasePlaceholder() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)
        await model.loadPresets()
        model.startNewPhase(insertAt: 1)
        XCTAssertNotNil(model.newPhaseDraft)

        model.selectPhase(try PhaseId("build"))
        XCTAssertNil(model.newPhaseDraft, "only one in-flight '+' insert at a time")
        XCTAssertNil(model.newPhaseInsertIndex)
        XCTAssertEqual(model.selectedPhase?.phaseId.rawValue, "build")
    }

    // MARK: Reorder — preset.upsert only, never phase.upsert

    func testMovePhaseLeftPermutesThePresetAndCarriesExpectedRevision() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)
        await model.loadPresets()
        let originalRevision = try XCTUnwrap(model.selectedPreset?.revision)
        let buildId = try PhaseId("build")

        let moved = await model.movePhaseLeft(buildId)
        XCTAssertTrue(moved)
        XCTAssertEqual(model.selectedPreset?.phases.map(\.phaseId.rawValue), ["contract", "architecture", "build", "ready"])

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["preset.list", "preset.upsert"], "reorder never calls phase.upsert — only the phase's position changes")
        let payload = try XCTUnwrap(server.frames[1]["request"]?["payload"])
        XCTAssertEqual(payload["expectedRevision"], .number(Double(originalRevision)))
        let phaseIdsInRequest = payload["preset"]?["phases"]?.arrayValue?.compactMap { $0["phaseId"]?.stringValue }
        XCTAssertEqual(phaseIdsInRequest, ["contract", "architecture", "build", "ready"])
    }

    func testMovePhaseRightAtTheEndOfTheChainIsANoOp() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)
        await model.loadPresets()
        let buildId = try PhaseId("build") // already last

        let moved = await model.movePhaseRight(buildId)
        XCTAssertTrue(moved, "a boundary no-op still reports success")
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["preset.list"], "never calls preset.upsert when there is nowhere to move")
    }

    // MARK: Create preset — preset.upsert(expectedRevision: nil)

    func testCreatePresetSeedsOneStarterStageAndSelectsIt() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)

        let created = await model.createPreset(name: "My New Preset!", appliesTo: [.ios])
        XCTAssertTrue(created)
        XCTAssertNil(model.createPresetError)
        let preset = try XCTUnwrap(model.presets.first { $0.name == "My New Preset!" })
        XCTAssertEqual(preset.presetId.rawValue, "my-new-preset", "slugified from the name, like RoomsModel.mintPersona's own collision handling")
        XCTAssertEqual(preset.phases.count, 1, "the wire schema requires phases.min(1) — never an empty preset, even momentarily")
        XCTAssertEqual(preset.phases[0].name, "Stage 1")
        XCTAssertEqual(preset.appliesTo, [.ios])
        XCTAssertEqual(model.selectedPresetId, preset.presetId)
        XCTAssertEqual(model.selectedPhaseId, preset.phases[0].phaseId)

        // phase.upsert first (same discipline as an ordinary edit's savePhase) so the starter stage
        // has a real durable row from the moment the preset exists, then preset.upsert embeds it —
        // both creates, so both carry an explicit-null expectedRevision.
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["phase.upsert", "preset.upsert"])
        let phasePayload = try XCTUnwrap(server.frames[0]["request"]?["payload"])
        XCTAssertEqual(phasePayload["expectedRevision"], .null)
        let presetPayload = try XCTUnwrap(server.frames[1]["request"]?["payload"])
        XCTAssertEqual(presetPayload["expectedRevision"], .null)
        XCTAssertEqual(presetPayload["preset"]?["phases"]?.arrayValue?.count, 1)
    }

    func testCreatePresetRefusesAnEmptyNameWithoutTouchingTheWire() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)

        let created = await model.createPreset(name: "   ", appliesTo: nil)
        XCTAssertFalse(created)
        XCTAssertNotNil(model.createPresetError)
        XCTAssertTrue(server.frames.isEmpty)
    }

    /// Two presets created under the same name must not collide on `presetId` — the second mint
    /// disambiguates with a "-2" suffix, mirroring `RoomsModel.mintPersona`'s own collision handling.
    func testCreatePresetDisambiguatesACollidingSlug() async throws {
        let server = try echoingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let model = PhasesModel(client: client)

        let firstCreated = await model.createPreset(name: "Widget Flow", appliesTo: nil)
        XCTAssertTrue(firstCreated)
        let secondCreated = await model.createPreset(name: "Widget Flow", appliesTo: nil)
        XCTAssertTrue(secondCreated)

        let ids = model.presets.map(\.presetId.rawValue).sorted()
        XCTAssertEqual(ids, ["widget-flow", "widget-flow-2"])
    }
}
