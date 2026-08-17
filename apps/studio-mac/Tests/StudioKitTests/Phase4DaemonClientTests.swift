import Foundation
@testable import StudioKit
import XCTest

/// Drives `DaemonClient` against `FakeDaemonServer` for the Studio Phase 4 operations
/// (`preset.*`/`phase.*`/`plan.*`/`project.seed`) — mirroring `DaemonClientTests`. These prove the
/// request shape (nullable fields explicit, CAS `expectedRevision`) and multi-step transitions
/// (`phase.run` → `phase.status`, `plan.propose` → `.edit` → `.approve` → `.execute` → `.status`),
/// not just fixture decoding (`Phase4ModelDecodingTests`).
final class Phase4DaemonClientTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func makeClient(_ server: FakeDaemonServer, timeout: Duration = .seconds(5)) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token,
                                              origin: .dashboard, timeout: timeout))
    }

    /// Dispatches by `request.operation` to a same-named fixture (`preset.list` → "preset-list…"),
    /// mirroring `DaemonClientTests`' room-post/room-events dispatcher.
    private func fixtureDispatchingServer() throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            let fixtureName = operation.replacingOccurrences(of: ".", with: "-") + ".response.json"
            return .reply(try! WireResponse.fixture(fixtureName, requestId: requestId))
        }
    }

    // MARK: preset.list / preset.upsert / phase.upsert

    func testListPresetsReturnsTheSeededPreset() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let presets = try await client.listPresets()
        XCTAssertEqual(presets.count, 1)
        XCTAssertEqual(presets[0].presetId.rawValue, "ios-app-standard-0.4.0")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload, .object([:]))
    }

    func testUpsertPhaseSendsExplicitNullExpectedRevisionOnCreate() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let draft = PhaseDefinitionDraft(
            phaseId: try PhaseId("build"), name: "Build", purpose: "Implement.",
            mode: .panel, cast: PhaseCast(participants: [], coordinator: nil, grader: nil), inputs: [.docs],
            rules: PhaseRules(standard: [], yours: [], requiredOutput: [], acceptanceChecks: []), outputs: [],
            gates: [], budget: PhaseBudget(estimateMinutes: 60, timeoutSeconds: 7_200))
        let result = try await client.upsertPhase(draft, expectedRevision: nil)
        XCTAssertEqual(result.phase.phaseId.rawValue, "build")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["expectedRevision"], .null)
    }

    // MARK: Phase Runner — phase.run → phase.status transition

    /// The presence-and-absence-checking flow the run-status strip depends on: `phase.run` returns a
    /// freshly `queued` run; a later `phase.status` poll for the SAME run id observes it has moved to
    /// `awaiting-human`, at which point Approve/Reject become available.
    func testPhaseRunThenStatusTransitionsFromQueuedToAwaitingHuman() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)

        let launched = try await client.runPhase(presetId: try PhasePresetId("ios-app-standard-0.4.0"),
                                                  phaseId: try PhaseId("build"),
                                                  projectId: ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"))
        XCTAssertEqual(launched.state, .queued)

        let polled = try await client.phaseRunStatus(PhaseRunID(unchecked: "00000101-0000-4000-8000-000000000101"))
        XCTAssertEqual(polled.state, .awaitingHuman)
        XCTAssertTrue(polled.isAwaitingHuman)

        let approved = try await client.approvePhaseRun(polled.phaseRunId, reason: "Looks right")
        XCTAssertEqual(approved.state, .running)
        let approvePayload = try XCTUnwrap(server.frames.last?["request"]?["payload"])
        XCTAssertEqual(approvePayload["reason"]?.stringValue, "Looks right")

        XCTAssertEqual(server.frames.map { $0["request"]?["operation"]?.stringValue },
                       ["phase.run", "phase.status", "phase.approve"])
    }

    func testRejectPhaseRunRequiresAReason() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let rejected = try await client.rejectPhaseRun(PhaseRunID(unchecked: "00000101-0000-4000-8000-000000000101"),
                                                        reason: "Needs a legal pass first.")
        XCTAssertEqual(rejected.state, .failed)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["reason"]?.stringValue, "Needs a legal pass first.")
    }

    func testListPhaseRunsPage() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let page = try await client.listPhaseRuns()
        XCTAssertEqual(page.runs.count, 2)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["projectId"], .null)
        XCTAssertEqual(payload["state"], .null)
        XCTAssertEqual(payload["after"], .null)
    }

    // MARK: The Planner — propose → edit → approve → execute → status

    func testPlanProposeEditApproveExecuteStatusChain() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)

        let brief = ProjectPlanBrief(title: "Workout Tracker", oneLiner: "Log sets and rest timers.", constraints: [])
        let proposed = try await client.proposePlan(brief: brief, presetId: try PhasePresetId("ios-app-standard-0.4.0"),
                                                     projectId: nil, repositoryId: nil)
        XCTAssertEqual(proposed.state, .draft)
        XCTAssertEqual(proposed.items.count, 4)

        let edited = try await client.editPlan(proposed.planId, expectedRevision: proposed.revision,
                                               edits: [.defer_(itemId: proposed.items[3].id)])
        XCTAssertEqual(edited.items.last?.status, .deferred)

        let approved = try await client.approvePlan(edited.planId, expectedRevision: edited.revision)
        XCTAssertEqual(approved.state, .approved)

        let executed = try await client.executePlan(approved.planId, expectedRevision: approved.revision)
        XCTAssertEqual(executed.state, .executing)
        XCTAssertEqual(executed.items.first?.status, .running)

        let status = try await client.planStatus(executed.planId)
        XCTAssertEqual(status.state, .executing)
        XCTAssertEqual(status.items.map(\.status), [.done, .running, .proposed, .proposed, .deferred])

        XCTAssertEqual(server.frames.map { $0["request"]?["operation"]?.stringValue },
                       ["plan.propose", "plan.edit", "plan.approve", "plan.execute", "plan.status"])
        let editPayload = try XCTUnwrap(server.frames[1]["request"]?["payload"])
        XCTAssertEqual(editPayload["edits"]?.arrayValue?.first?["kind"]?.stringValue, "defer")
    }

    func testApprovePlanGateThenTick() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let planId = ProjectPlanID(unchecked: "00000201-0000-4000-8000-000000000201")
        let gated = try await client.approvePlanGate(planId, itemId: try ProjectPlanItemId("ready"), expectedRevision: 4)
        XCTAssertEqual(gated.state, .executing)
        let ticked = try await client.tickPlan(planId)
        XCTAssertTrue(ticked.advanced)
    }

    // MARK: project.seed

    func testSeedProjectRoundTrip() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let result = try await client.seedProject(targetDirectory: try AbsolutePath("/Users/example/code/workout-tracker"),
                                                   name: "Workout Tracker")
        XCTAssertTrue(result.xcodegen.available)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["name"]?.stringValue, "Workout Tracker")
    }
}
