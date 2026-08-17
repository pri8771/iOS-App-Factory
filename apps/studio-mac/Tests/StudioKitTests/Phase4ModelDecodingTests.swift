import Foundation
@testable import StudioKit
import XCTest

/// Studio Phase 4 (`preset.*`/`phase.*`/`plan.*`/`project.seed`) model decoding. Every fixture here
/// was produced by `scripts/record-phase4-fixtures.mjs`, validated through this worktree's own
/// built `@app-factory/contracts` (`phase.ts`/`phase-run.ts`/`project-plan.ts`, merged on
/// `integration/studio-wave1`) — the same "record through the real contracts" discipline as
/// `ModelDecodingTests`.
final class Phase4ModelDecodingTests: XCTestCase {

    private func decode(_ fixture: String) throws -> CommandResponse {
        try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data(fixture))
    }

    // MARK: preset.list / phase.upsert

    func testPresetListCarriesTheSeededPresetWithFourDistinctPhaseModes() throws {
        guard case .success(_, .presetList(let presets)) = try decode("preset-list.response.json") else {
            return XCTFail("expected preset.list")
        }
        XCTAssertEqual(presets.count, 1)
        let preset = presets[0]
        XCTAssertEqual(preset.presetId.rawValue, "ios-app-standard-0.4.0")
        XCTAssertEqual(preset.phases.map(\.phaseId.rawValue), ["contract", "architecture", "ready", "build"])
        XCTAssertEqual(preset.appliesTo, [.ios])

        let contract = preset.phases[0]
        XCTAssertEqual(contract.mode, .solo)
        XCTAssertEqual(contract.castSummary, "1 model")
        XCTAssertEqual(contract.rules.standard, ["rule.new.scope-before-breadth"])
        XCTAssertEqual(contract.rules.yours, ["Keep the MVP boundary to a single core loop."])

        let architecture = preset.phases[1]
        XCTAssertEqual(architecture.mode, .debate)
        XCTAssertEqual(architecture.cast.participants.count, 2)
        XCTAssertNotNil(architecture.cast.grader)
        XCTAssertFalse(architecture.cast.graderCollidesWithParticipant)
        XCTAssertEqual(architecture.castSummary, "2 models · debate")

        let ready = preset.phases[2]
        XCTAssertEqual(ready.mode, .chat)
        XCTAssertTrue(ready.cast.participants.isEmpty)
        XCTAssertEqual(ready.gates, [.build, .tests])
        XCTAssertEqual(ready.castSummary, "◆ gate · you")
        XCTAssertNil(ready.budget.estimateMinutes)

        let build = preset.phases[3]
        XCTAssertEqual(build.outputs.first?.path.rawValue, "docs/progress/build-notes.md")
    }

    func testPhaseUpsertResult() throws {
        guard case .success(_, .phaseUpsert(let result)) = try decode("phase-upsert.response.json") else {
            return XCTFail("expected phase.upsert")
        }
        XCTAssertFalse(result.created)
        XCTAssertEqual(result.phase.phaseId.rawValue, "build")
    }

    func testPhasePresetUpsertPayloadEncodesNullsExplicitly() throws {
        let phase = PhaseDefinitionDraft(
            phaseId: try PhaseId("solo-phase"), name: "Solo", purpose: "purpose",
            mode: .solo, cast: PhaseCast(participants: [], coordinator: nil, grader: nil), inputs: [],
            rules: PhaseRules(standard: [], yours: [], requiredOutput: [], acceptanceChecks: []), outputs: [],
            gates: [], budget: PhaseBudget(estimateMinutes: nil, timeoutSeconds: 60))
        let payload = PhaseDefinitionUpsert(phase: phase, expectedRevision: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        XCTAssertTrue(text.contains(#""expectedRevision":null"#), text)
        XCTAssertTrue(text.contains(#""estimateMinutes":null"#), text)
        XCTAssertTrue(text.contains(#""coordinator":null"#), text)
        XCTAssertTrue(text.contains(#""grader":null"#), text)
    }

    // MARK: Phase Runner

    func testPhaseRunResultIsQueued() throws {
        guard case .success(_, .phaseRun(let run)) = try decode("phase-run.response.json") else {
            return XCTFail("expected phase.run")
        }
        XCTAssertEqual(run.state, .queued)
        XCTAssertEqual(run.phaseId.rawValue, "build")
        XCTAssertFalse(run.isAwaitingHuman)
        XCTAssertNil(run.outcome)
    }

    func testPhaseStatusIsAwaitingHuman() throws {
        guard case .success(_, .phaseStatus(let run)) = try decode("phase-status.response.json") else {
            return XCTFail("expected phase.status")
        }
        XCTAssertTrue(run.isAwaitingHuman)
        XCTAssertEqual(run.phaseId.rawValue, "ready")
        XCTAssertEqual(run.phaseSnapshot.gates, [.build, .tests])
        XCTAssertNil(run.outcome)
    }

    func testPhaseListPageOrdersRunsAndCarriesAGraderVerdict() throws {
        guard case .success(_, .phaseList(let page)) = try decode("phase-list.response.json") else {
            return XCTFail("expected phase.list")
        }
        XCTAssertEqual(page.runs.count, 2)
        XCTAssertFalse(page.hasMore)
        XCTAssertNil(page.nextAfter)
        let succeeded = page.runs[1]
        XCTAssertEqual(succeeded.state, .succeeded)
        XCTAssertEqual(succeeded.graderVerdict?.verdict, .pass)
        XCTAssertEqual(succeeded.outputs.first?.path.rawValue, "docs/architecture/decision.md")
        XCTAssertEqual(succeeded.outcome, .succeeded)
    }

    func testPhaseApproveMovesToRunning() throws {
        guard case .success(_, .phaseApprove(let run)) = try decode("phase-approve.response.json") else {
            return XCTFail("expected phase.approve")
        }
        XCTAssertEqual(run.state, .running)
    }

    func testPhaseRejectCarriesARejectedOutcome() throws {
        guard case .success(_, .phaseReject(let run)) = try decode("phase-reject.response.json") else {
            return XCTFail("expected phase.reject")
        }
        XCTAssertEqual(run.state, .failed)
        guard case .failed(let code, let summary) = run.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertEqual(code, .rejected)
        XCTAssertFalse(summary.isEmpty)
    }

    func testPhaseRunDecisionPayloadEncodesNullReasonExplicitly() throws {
        let payload = PhaseRunDecision(phaseRunId: PhaseRunID(unchecked: "00000101-0000-4000-8000-000000000101"), reason: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        XCTAssertEqual(String(decoding: try encoder.encode(payload), as: UTF8.self),
                       #"{"phaseRunId":"00000101-0000-4000-8000-000000000101","reason":null}"#)
    }

    // MARK: The Planner

    func testPlanProposeBuildsAFourItemDraftPlanWithOneGate() throws {
        guard case .success(_, .planPropose(let plan)) = try decode("plan-propose.response.json") else {
            return XCTFail("expected plan.propose")
        }
        XCTAssertEqual(plan.state, .draft)
        XCTAssertEqual(plan.items.count, 4)
        XCTAssertEqual(plan.items.map(\.kind), [.task, .task, .gate, .task])
        XCTAssertEqual(plan.items.filter { $0.kind == .gate }.count, 1)
        XCTAssertEqual(plan.brief.title, "Workout Tracker")
        XCTAssertEqual(plan.presetId.rawValue, "ios-app-standard-0.4.0")
        guard case .gate(let gateItem) = plan.items[2] else { return XCTFail("expected a gate item") }
        XCTAssertEqual(gateItem.gate.reason, "Confirm plan and design before implementation begins.")
        XCTAssertEqual(gateItem.status, .proposed)
    }

    func testPlanStatusPunchListHasADeferredItemAndAGate() throws {
        guard case .success(_, .planStatus(let plan)) = try decode("plan-status.response.json") else {
            return XCTFail("expected plan.status")
        }
        XCTAssertEqual(plan.state, .executing)
        XCTAssertEqual(plan.items.map(\.status), [.done, .running, .proposed, .proposed, .deferred])
        XCTAssertEqual(plan.items[2].kind, .gate)
        guard case .task(let doneItem) = plan.items[0] else { return XCTFail("expected a task item") }
        XCTAssertNotNil(doneItem.taskId)
        XCTAssertNotNil(doneItem.attemptId)
        guard case .task(let deferredItem) = plan.items[4] else { return XCTFail("expected a task item") }
        XCTAssertNil(deferredItem.taskId)
        XCTAssertEqual(deferredItem.detail, "Deferred until after the beta.")
        XCTAssertEqual(plan.buildStartIndex, 3)
    }

    func testPlanEditDefersAnItem() throws {
        guard case .success(_, .planEdit(let plan)) = try decode("plan-edit.response.json") else {
            return XCTFail("expected plan.edit")
        }
        XCTAssertEqual(plan.items.last?.status, .deferred)
        XCTAssertEqual(plan.revision, 1)
    }

    func testPlanApproveSetsApprovedState() throws {
        guard case .success(_, .planApprove(let plan)) = try decode("plan-approve.response.json") else {
            return XCTFail("expected plan.approve")
        }
        XCTAssertEqual(plan.state, .approved)
    }

    func testPlanExecuteStartsTheFirstItem() throws {
        guard case .success(_, .planExecute(let plan)) = try decode("plan-execute.response.json") else {
            return XCTFail("expected plan.execute")
        }
        XCTAssertEqual(plan.state, .executing)
        XCTAssertEqual(plan.items.first?.status, .running)
    }

    func testPlanApproveGateClearsTheGateItem() throws {
        guard case .success(_, .planApproveGate(let plan)) = try decode("plan-approve-gate.response.json") else {
            return XCTFail("expected plan.approve-gate")
        }
        guard case .gate(let gateItem) = plan.items[2] else { return XCTFail("expected a gate item") }
        XCTAssertEqual(gateItem.status, .approved)
    }

    func testPlanTickAdvancesTheChain() throws {
        guard case .success(_, .planTick(let result)) = try decode("plan-tick.response.json") else {
            return XCTFail("expected plan.tick")
        }
        XCTAssertTrue(result.advanced)
        XCTAssertEqual(result.plan.items[3].status, .running)
    }

    func testProjectPlanEditReorderRoundTrips() throws {
        let edit = ProjectPlanEdit.reorder(order: [try ProjectPlanItemId("a"), try ProjectPlanItemId("b")])
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(edit), as: UTF8.self)
        XCTAssertEqual(text, #"{"kind":"reorder","order":["a","b"]}"#)
        let decoded = try JSONDecoder().decode(ProjectPlanEdit.self, from: Data(text.utf8))
        XCTAssertEqual(decoded, edit)
    }

    func testProjectPlanEditAddItemRoundTripsWithNullAfterItemId() throws {
        let draft = ProjectPlanTaskItemDraft(
            itemId: try ProjectPlanItemId("extra"), phase: try StableKey("build"), title: "Extra", detail: nil,
            dependsOn: [],
            taskSpecDraft: ProjectPlanTaskSpecDraft(objective: "obj",
                                                     acceptanceCriteria: [AcceptanceCriterion(id: try StableKey("a"), statement: "s", verification: .review)],
                                                     scope: .init(paths: [try RelativePath("Sources")]), phase: try StableKey("build")))
        let edit = ProjectPlanEdit.addItem(afterItemId: nil, item: .task(draft))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(edit), as: UTF8.self)
        XCTAssertTrue(text.contains(#""afterItemId":null"#), text)
        XCTAssertTrue(text.contains(#""kind":"add-item""#), text)
        let decoded = try JSONDecoder().decode(ProjectPlanEdit.self, from: Data(text.utf8))
        XCTAssertEqual(decoded, edit)
    }

    // MARK: project.seed

    func testProjectSeedResult() throws {
        guard case .success(_, .projectSeed(let result)) = try decode("project-seed.response.json") else {
            return XCTFail("expected project.seed")
        }
        XCTAssertEqual(result.repositoryRoot.rawValue, "/Users/example/code/workout-tracker")
        XCTAssertTrue(result.xcodegen.available)
        XCTAssertTrue(result.xcodegen.built)
        XCTAssertEqual(result.enrollment.appliedActionKinds.count, 4)
        XCTAssertFalse(result.enrollment.convergence.blocked)
    }

    func testProjectSeedPayloadEncodes() throws {
        let payload = ProjectSeedPayload(targetDirectory: try AbsolutePath("/Users/example/code/new-app"), name: "New App")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        XCTAssertEqual(String(decoding: try encoder.encode(payload), as: UTF8.self),
                       #"{"name":"New App","targetDirectory":"/Users/example/code/new-app"}"#)
    }

    // MARK: Assistant intents: propose-plan / execute-plan

    func testAssistantIntentProposeIsProposePlan() throws {
        guard case .success(_, .studioAssistantIntentPropose(let intent)) = try decode("assistant-intent-propose-plan.response.json") else {
            return XCTFail("expected studio.assistant.intent.propose")
        }
        guard case .proposePlan(let brief, let presetId, let projectId, let repositoryId) = intent.payload else {
            return XCTFail("expected a propose-plan payload")
        }
        XCTAssertEqual(brief.title, "Workout Tracker")
        XCTAssertEqual(presetId.rawValue, "ios-app-standard-0.4.0")
        XCTAssertNil(projectId)
        XCTAssertNil(repositoryId)
        XCTAssertEqual(intent.utterance, "propose Workout Tracker")
        XCTAssertEqual(AssistantIntentPayload.phrasePrefix(for: .proposePlan), "propose ")
        XCTAssertEqual(intent.payload.identifiers, ["Workout Tracker"])
    }

    func testAssistantIntentExecuteOutcomeCarriesTheProposedPlan() throws {
        guard case .success(_, .studioAssistantIntentExecute(let result)) = try decode("assistant-intent-execute-plan.response.json") else {
            return XCTFail("expected studio.assistant.intent.execute")
        }
        guard case .planPropose(let planResult) = result.outcome else {
            return XCTFail("expected a plan.propose outcome")
        }
        XCTAssertEqual(planResult.plan.brief.title, "Workout Tracker")
        XCTAssertEqual(result.outcome.attemptId, nil)
        XCTAssertEqual(result.outcome.plan?.brief.title, "Workout Tracker")
    }

    func testAssistantIntentPayloadExecutePlanEncodesAndDecodes() throws {
        let payload = AssistantIntentPayload.executePlan(planId: ProjectPlanID(unchecked: "00000201-0000-4000-8000-000000000201"), expectedRevision: 2)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        XCTAssertEqual(text, #"{"expectedRevision":2,"kind":"execute-plan","planId":"00000201-0000-4000-8000-000000000201"}"#)
        let decoded = try JSONDecoder().decode(AssistantIntentPayload.self, from: Data(text.utf8))
        XCTAssertEqual(decoded, payload)
        XCTAssertEqual(AssistantIntentPayload.phrasePrefix(for: .executePlan), "execute ")
    }

    // MARK: Phase / preset wire primitives

    func testPhaseWirePrimitivesRejectMalformedValues() {
        XCTAssertThrowsError(try PhaseId("Contract"), "uppercase is not a valid phase id")
        XCTAssertNoThrow(try PhaseId("contract"))
        XCTAssertThrowsError(try PhasePresetId(""), "empty is not a valid preset id")
        XCTAssertNoThrow(try PhasePresetId("ios-app-standard-0.4.0"))
        XCTAssertThrowsError(try ProjectPlanItemId(""), "empty is not a valid item id")
        XCTAssertNoThrow(try ProjectPlanItemId("contract"))
    }
}
