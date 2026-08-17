import Foundation
@testable import StudioKit
import XCTest

/// Every response fixture here was emitted by the real zod schemas (see scripts/record-fixtures.mjs),
/// so these tests pin the Swift models to the wire contract field by field.
final class ModelDecodingTests: XCTestCase {

    private func decode(_ fixture: String) throws -> CommandResponse {
        try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data(fixture))
    }

    func testDoctor() throws {
        guard case .success(let requestId, .doctor(let doctor)) = try decode("doctor.response.json") else {
            return XCTFail("expected doctor")
        }
        XCTAssertEqual(requestId.rawValue, "3f2504e0-4f89-41d3-9a0c-0305e82c3301")
        XCTAssertEqual(doctor.readiness, .ready)
        XCTAssertEqual(doctor.daemonVersion, "0.1.0-ui-demo")
        XCTAssertEqual(doctor.protocolVersion, 1)
        XCTAssertEqual(doctor.startedAt.rawValue, "2026-08-16T16:00:00.000Z")
        XCTAssertNotNil(doctor.startedAt.date)
        XCTAssertEqual(doctor.issues, [])
    }

    func testAttemptListHasThreeSucceededAttempts() throws {
        guard case .success(_, .attemptList(let page)) = try decode("attempt-list.response.json") else {
            return XCTFail("expected attempt.list")
        }
        XCTAssertEqual(page.attempts.count, 3)
        XCTAssertFalse(page.hasMore)
        XCTAssertNil(page.nextAfter)
        for item in page.attempts {
            XCTAssertEqual(item.attempt.state, .succeeded)
            XCTAssertEqual(item.attempt.outcome, .succeeded)
            XCTAssertTrue(item.attempt.state.isTerminal)
            XCTAssertNotNil(item.attempt.terminalAt)
        }
        XCTAssertEqual(page.attempts.map(\.title), ["Demo attempt 3", "Demo attempt 2", "Demo attempt 1"])
        XCTAssertEqual(page.attempts.first?.attempt.attemptId.rawValue, "00000003-0000-4000-8000-000000000003")
    }

    func testAttemptStatusBlockedWithBlocker() throws {
        guard case .success(_, .attemptStatus(let attempt)) = try decode("attempt-status.response.json") else {
            return XCTFail("expected attempt.status")
        }
        XCTAssertEqual(attempt.state, .blocked)
        XCTAssertEqual(attempt.blocker?.kind, .approval)
        XCTAssertEqual(attempt.blocker?.code.rawValue, "gate.testflight-upload")
        XCTAssertEqual(attempt.blocker?.requiredAction, "Approve or decline in Studio.")
        XCTAssertEqual(attempt.currentStepId?.rawValue, "20000004-0000-4000-8000-000000000004")
        XCTAssertNil(attempt.outcome)
        XCTAssertNil(attempt.terminalAt)
    }

    func testAttemptEventsUnion() throws {
        guard case .success(_, .attemptEvents(let page)) = try decode("attempt-events.response.json") else {
            return XCTFail("expected attempt.events")
        }
        XCTAssertEqual(page.nextAfterSequence, 4)
        XCTAssertEqual(page.events.map(\.type),
                       ["attempt.created", "attempt.state-changed", "step.state-changed", "commit.recorded"])
        guard case .attemptCreated(let taskId, _) = page.events[0].payload else { return XCTFail("created") }
        XCTAssertEqual(taskId.rawValue, "10000001-0000-4000-8000-000000000001")
        XCTAssertEqual(page.events[0].commandId?.rawValue, "40000001-0000-4000-8000-000000000001")
        guard case .attemptStateChanged(let from, let to, let blocker, let outcome) = page.events[1].payload else {
            return XCTFail("state-changed")
        }
        XCTAssertEqual(from, .queued)
        XCTAssertEqual(to, .running)
        XCTAssertNil(blocker)
        XCTAssertNil(outcome)
        guard case .stepStateChanged(_, _, let stepTo, let outputDigest, let failureCode) = page.events[2].payload else {
            return XCTFail("step")
        }
        XCTAssertEqual(stepTo, .failed)
        XCTAssertNil(outputDigest)
        XCTAssertEqual(failureCode?.rawValue, "verify.tests-failed")
        guard case .commitRecorded(let commit, _, let marker) = page.events[3].payload else { return XCTFail("commit") }
        XCTAssertEqual(commit.rawValue, String(repeating: "a", count: 40))
        XCTAssertEqual(marker, "app-factory:v1:attempt:1")
    }

    func testAttemptEventRoundTripsThroughEncoder() throws {
        guard case .success(_, .attemptEvents(let page)) = try decode("attempt-events.response.json") else {
            return XCTFail("expected attempt.events")
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        for event in page.events {
            let data = try encoder.encode(event)
            let back = try JSONDecoder().decode(AttemptEvent.self, from: data)
            XCTAssertEqual(back, event)
            // Nullable envelope fields are emitted as explicit null, never omitted.
            let text = String(decoding: data, as: UTF8.self)
            XCTAssertTrue(text.contains("\"commandId\":"), text)
            XCTAssertTrue(text.contains("\"causationEventId\":"), text)
        }
    }

    func testEvidenceList() throws {
        guard case .success(_, .evidenceList(let page)) = try decode("evidence-list.response.json") else {
            return XCTFail("expected evidence.list")
        }
        XCTAssertEqual(page.manifests.count, 1)
        XCTAssertFalse(page.hasMore)
        XCTAssertNil(page.nextAfterAttemptId)
        let manifest = page.manifests[0]
        XCTAssertEqual(manifest.entryCount, 4)
        XCTAssertEqual(manifest.requiredKinds, [.agentRun, .verification, .eventLog])
        XCTAssertNil(manifest.subject.candidateTree)
        XCTAssertEqual(manifest.subject.fence, 2)
    }

    func testProjectScan() throws {
        guard case .success(_, .projectScan(let scan)) = try decode("project-scan.response.json") else {
            return XCTFail("expected project.scan")
        }
        XCTAssertEqual(scan.repositoryRoot.rawValue, "/Users/example/code/hindsight")
        XCTAssertTrue(scan.blocked)
        XCTAssertEqual(scan.blockers.count, 1)
        XCTAssertEqual(scan.blockers[0].code.rawValue, "enroll.secret-material")
        XCTAssertTrue(scan.blockers[0].issueId.hasPrefix("esi-"))
    }

    func testPortfolioSnapshotModel() throws {
        guard case .success(_, .portfolioSnapshot(let snapshot)) = try decode("portfolio-snapshot.response.json") else {
            return XCTFail("expected portfolio.snapshot")
        }
        XCTAssertEqual(snapshot.projects.count, 3)
        XCTAssertEqual(snapshot.projects.map(\.slug.rawValue), ["anjali", "hindsight", "svara"])
        let anjali = snapshot.projects[0]
        XCTAssertEqual(anjali.lifecycleStage, .building)
        XCTAssertEqual(anjali.health, .blocked)
        XCTAssertEqual(anjali.healthReasons, [.deliveryBlocker, .unresolvedP1, .analyticsStale])
        XCTAssertEqual(anjali.unresolvedP1, 2)
        let hindsight = snapshot.projects[1]
        XCTAssertNil(hindsight.lifecycleStage)
        XCTAssertNil(hindsight.openPullRequestCount, "unavailable sources decode as nil, not 0")
        XCTAssertEqual(hindsight.sources.jira, .unavailable)
        XCTAssertEqual(hindsight.analyticsFreshness, .unavailable)
        XCTAssertEqual(snapshot.totals.attempts, 10)
        XCTAssertNil(snapshot.totals.openPullRequests)
        XCTAssertEqual(snapshot.sourceSnapshotDigest.rawValue,
                       try Fixtures.string("portfolio-snapshot.digest.txt").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func testFailureResponse() throws {
        guard case .failure(let requestId, let error) = try decode("failure.response.json") else {
            return XCTFail("expected failure")
        }
        XCTAssertEqual(requestId?.rawValue, "3f2504e0-4f89-41d3-9a0c-0305e82c3301")
        XCTAssertEqual(error.code, "daemon.handler-timeout-ambiguous")
        XCTAssertTrue(error.retryable)
    }

    func testFailureResponseWithNullRequestId() throws {
        let json = #"{"protocolVersion":1,"requestId":null,"ok":false,"error":{"code":"protocol.malformed-request","message":"The command request is not valid JSON.","retryable":false}}"#
        guard case .failure(let requestId, let error) = try JSONDecoder().decode(CommandResponse.self, from: Data(json.utf8)) else {
            return XCTFail("expected failure")
        }
        XCTAssertNil(requestId)
        XCTAssertEqual(error.code, "protocol.malformed-request")
    }

    func testUnsupportedProtocolVersionIsRejected() {
        let json = #"{"protocolVersion":2,"requestId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","ok":true,"result":{"operation":"doctor"}}"#
        XCTAssertThrowsError(try JSONDecoder().decode(CommandResponse.self, from: Data(json.utf8)))
    }

    func testBrandedIdsRejectMalformedValues() {
        XCTAssertThrowsError(try AttemptID("not-a-uuid"))
        XCTAssertThrowsError(try AttemptID("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), "uppercase is not canonical")
        XCTAssertNoThrow(try AttemptID("3f2504e0-4f89-41d3-9a0c-0305e82c3301"))
        XCTAssertThrowsError(try AttemptID("3f2504e0-4f89-41d3-9a0c-0305e82c3301\n"), "ICU `$` must not accept a trailing newline")
        XCTAssertThrowsError(try NamespacedCode("daemon.handler-failed\n"))
        XCTAssertThrowsError(try Sha256Digest("sha256:abc"))
        XCTAssertNoThrow(try Sha256Digest("sha256:" + String(repeating: "0", count: 64)))
        XCTAssertThrowsError(try IsoInstant("2026-08-16T16:00:00Z"), "millisecond precision is required")
        XCTAssertThrowsError(try IsoInstant("2026-08-16T16:00:00.000+00:00"), "offsets are not allowed")
        XCTAssertNoThrow(try IsoInstant("2026-08-16T16:00:00.000Z"))
        XCTAssertThrowsError(try NamespacedCode("nodots"))
        XCTAssertNoThrow(try NamespacedCode("daemon.handler-failed"))
        XCTAssertThrowsError(try AbsolutePath("relative/path"))
        XCTAssertNoThrow(try AbsolutePath("/tmp/x"))
        XCTAssertThrowsError(try GitBranchName("feature/.lock/x.lock"))
        XCTAssertNoThrow(try GitBranchName("studio/phase1"))
    }

    func testIsoInstantNowHasMillisecondPrecisionAndZ() {
        let now = IsoInstant.now(Date(timeIntervalSince1970: 1_755_381_600.123))
        XCTAssertEqual(now.rawValue, "2025-08-16T22:00:00.123Z")
        XCTAssertTrue(IsoInstantRule.isValid(now.rawValue))
    }

    // MARK: Request payload encoding — nullable means "present as null"

    func testAttemptListQueryEncodesNullsExplicitly() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(AttemptListQuery(scope: .all, limit: 25))
        XCTAssertEqual(String(decoding: data, as: UTF8.self),
                       #"{"after":null,"limit":25,"projectId":null,"scope":"all"}"#)
    }

    func testRequestFrameShape() throws {
        let identity = CommandIdentity(requestId: RequestID(unchecked: "3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
                                       commandId: CommandID(unchecked: "3f2504e0-4f89-41d3-9a0c-0305e82c3302"),
                                       issuedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"))
        let frame = CommandRequestFrame(
            requestId: identity.requestId,
            authorization: String(repeating: "t", count: 32),
            request: CommandRequest(commandId: identity.commandId, issuedAt: identity.issuedAt, origin: .dashboard,
                                    operation: .evidenceList, payload: EvidenceListPayload(afterAttemptId: nil, limit: 10)))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let text = String(decoding: try encoder.encode(frame), as: UTF8.self)
        XCTAssertEqual(text, #"{"authorization":"tttttttttttttttttttttttttttttttt","protocolVersion":1,"request":{"commandId":"3f2504e0-4f89-41d3-9a0c-0305e82c3302","issuedAt":"2026-08-16T16:00:00.000Z","operation":"evidence.list","origin":"dashboard","payload":{"afterAttemptId":null,"limit":10},"schemaVersion":1},"requestId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301"}"#)
    }

    func testEmptyPayloadEncodesAsEmptyObject() throws {
        XCTAssertEqual(String(decoding: try JSONEncoder().encode(EmptyPayload()), as: UTF8.self), "{}")
    }

    func testAllTwentySevenOperationsAreNamed() {
        XCTAssertEqual(CommandOperation.allCases.count, 27)
        XCTAssertEqual(Set(CommandOperation.allCases.map(\.rawValue)), [
            "doctor", "task.submit", "task.run", "attempt.status", "attempt.events", "attempt.list",
            "attempt.pause", "attempt.resume", "attempt.cancel", "task.retry", "attempt.unblock",
            "daemon.reconcile", "evidence.list", "evidence.inspect", "evidence.verify", "portfolio.snapshot",
            "project.scan", "project.enroll-plan", "project.apply", "effects.status", "effects.list",
            "studio.snapshot", "studio.assistant.query", "studio.assistant.intent.propose",
            "studio.assistant.intent.execute", "project.milestones.list", "project.milestone.upsert",
        ])
    }

    // MARK: Studio Phase 2 — studio.snapshot, studio.assistant.*, project.milestones.*
    //
    // Every fixture below was produced by validating real data through the actual zod schemas on the
    // unmerged branches that own them (`studio/service-skeleton` tip cdfe558 for studio.snapshot /
    // studio.assistant.*, `studio/milestones-and-phase` tip 3cff9a7 for project.milestones.*) — the
    // same "record through the real contracts" discipline as the phase-1 fixtures, just against a
    // branch's build instead of `main`'s (see docs/architecture/0001, decision 5).

    func testStudioSnapshotModel() throws {
        guard case .success(_, .studioSnapshot(let snapshot)) = try decode("studio-snapshot.response.json") else {
            return XCTFail("expected studio.snapshot")
        }
        XCTAssertEqual(snapshot.projects.count, 2)
        let anjali = snapshot.projects[0]
        XCTAssertEqual(anjali.slug.rawValue, "anjali")
        XCTAssertEqual(anjali.name, "Anjali — Journal")
        XCTAssertEqual(anjali.lifecycleStage, .building)
        XCTAssertEqual(anjali.gates.state, .blocked)
        XCTAssertEqual(anjali.gates.typed, .legal)
        XCTAssertTrue(anjali.gates.ownerIsHuman)
        XCTAssertNil(anjali.gates.unavailableReason)
        XCTAssertEqual(anjali.awaitingHuman.count, 1)
        XCTAssertEqual(anjali.awaitingHuman[0].kind, .blockedAttempt)
        // The real, revisioned milestone model (ProjectMilestone) — the exact type
        // project.milestones.list/.upsert read and write, not a second placeholder shape.
        XCTAssertEqual(anjali.timeline.milestones.count, 2)
        XCTAssertEqual(anjali.timeline.milestones.map(\.label), ["Beta review", "Store listing + sign-off"])
        XCTAssertEqual(anjali.timeline.milestones[0].status, .planned)
        XCTAssertEqual(anjali.timeline.milestones[0].targetDate?.rawValue, "2026-08-20")
        XCTAssertNil(anjali.timeline.milestonesUnavailableReason)
        let hindsight = snapshot.projects[1]
        XCTAssertEqual(hindsight.slug.rawValue, "hindsight")
        XCTAssertNil(hindsight.lifecycleStage)
        XCTAssertEqual(hindsight.gates.state, .unavailable)
        XCTAssertEqual(hindsight.gates.unavailableReason, studioNoGateRecordsReason)
        XCTAssertNil(hindsight.gates.typed)
        // A real, non-error empty state: Hindsight has no authored milestones yet.
        XCTAssertTrue(hindsight.timeline.milestones.isEmpty)
        XCTAssertNil(hindsight.timeline.milestonesUnavailableReason)
        XCTAssertTrue(snapshot.rooms.isEmpty)
        XCTAssertEqual(snapshot.roomsUnavailableReason, studioNotYetWiredReason)
        // Every field of StudioPortfolioAggregates is independently nullable — mixed here on purpose.
        XCTAssertEqual(snapshot.portfolio.verifiedThisWeek.value, 2)
        XCTAssertEqual(snapshot.portfolio.passRate.value, 0.8)
        XCTAssertEqual(snapshot.portfolio.medianRunSeconds.value, 185.5)
        XCTAssertNil(snapshot.portfolio.agentWindowShare.value)
        XCTAssertNotNil(snapshot.portfolio.agentWindowShare.unavailableReason)
        XCTAssertEqual(snapshot.sourceSnapshotDigest.rawValue,
                       try Fixtures.string("studio-snapshot.digest.txt").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func testStudioSnapshotDigestMatchesCanonicalFixture() throws {
        let tree = try JSONValue.parse(Fixtures.data("studio-snapshot.response.json"))
        let snapshot = try XCTUnwrap(tree["result"]?["snapshot"])
        let canonical = try StudioSnapshotDigest.canonicalText(snapshot)
        XCTAssertEqual(canonical, try Fixtures.string("studio-snapshot.canonical.txt"))
        XCTAssertNoThrow(try StudioSnapshotDigest.verify(snapshot))
    }

    func testAssistantAnswerAnsweredCarriesCitations() throws {
        guard case .success(_, .studioAssistantQuery(.answered(let text, let citations))) = try decode("assistant-query-answered.response.json") else {
            return XCTFail("expected an answered studio.assistant.query")
        }
        XCTAssertFalse(text.isEmpty)
        XCTAssertEqual(citations.map(\.kind), [.attempt, .gate])
    }

    func testAssistantAnswerCannotAnswerNamesAReason() throws {
        guard case .success(_, .studioAssistantQuery(.cannotAnswer(let reason, let detail))) = try decode("assistant-query-cannot-answer.response.json") else {
            return XCTFail("expected a cannot-answer studio.assistant.query")
        }
        XCTAssertEqual(reason, .noMilestoneTargetDate)
        XCTAssertFalse(detail.isEmpty)
    }

    func testAssistantIntentProposeIsApproveAttempt() throws {
        guard case .success(_, .studioAssistantIntentPropose(let intent)) = try decode("assistant-intent-propose.response.json") else {
            return XCTFail("expected studio.assistant.intent.propose")
        }
        XCTAssertTrue(intent.requiresConfirmation)
        guard case .approveAttempt(let attemptId, let answer) = intent.payload else { return XCTFail("expected approve-attempt") }
        XCTAssertTrue(intent.utterance.contains(attemptId.rawValue), "the utterance must literally mention its identifier")
        XCTAssertFalse(answer.isEmpty)
    }

    func testAssistantIntentExecuteOutcomeCarriesTheResultingAttemptId() throws {
        guard case .success(_, .studioAssistantIntentExecute(let result)) = try decode("assistant-intent-execute.response.json") else {
            return XCTFail("expected studio.assistant.intent.execute")
        }
        guard case .attemptUnblock(let unblock) = result.outcome else { return XCTFail("expected an attempt.unblock outcome") }
        XCTAssertEqual(result.outcome.attemptId, unblock.attemptId)
        XCTAssertTrue(unblock.accepted)
    }

    func testProjectMilestonesListOrdersDatedMilestonesFirst() throws {
        guard case .success(_, .projectMilestonesList(let timeline)) = try decode("project-milestones-list.response.json") else {
            return XCTFail("expected project.milestones.list")
        }
        XCTAssertEqual(timeline.milestones.count, 2)
        XCTAssertEqual(timeline.milestones.map(\.label), ["Beta review", "Store listing + sign-off"])
        XCTAssertEqual(timeline.milestones[0].targetDate?.rawValue, "2026-08-20")
        XCTAssertEqual(timeline.milestones[0].dependsOn, [])
        XCTAssertEqual(timeline.milestones[1].dependsOn, [timeline.milestones[0].milestoneId])
        XCTAssertEqual(timeline.actuals.phases.count, 1)
        XCTAssertEqual(timeline.actuals.phases[0].succeededAttemptCount, 2)
        XCTAssertEqual(timeline.sources.localExecution, .available)
        XCTAssertEqual(timeline.sources.lifecycleEvents, .unavailable)
    }

    func testProjectMilestoneUpsertResult() throws {
        guard case .success(_, .projectMilestoneUpsert(let result)) = try decode("project-milestone-upsert.response.json") else {
            return XCTFail("expected project.milestone.upsert")
        }
        XCTAssertFalse(result.created, "the fixture is a compare-and-set update, not a create")
        XCTAssertEqual(result.milestone.revision, 1)
        XCTAssertEqual(result.milestone.status, .active)
        XCTAssertEqual(result.milestone.targetDate?.rawValue, "2026-08-22")
    }

    func testProjectMilestoneUpsertPayloadEncodesNullsExplicitly() throws {
        let draft = ProjectMilestoneDraft(milestoneId: MilestoneID(unchecked: "70000001-0000-4000-8000-000000000001"),
                                          projectId: ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"),
                                          phase: StableKey(unchecked: "beta"), kind: .gate, label: "Beta review",
                                          targetDate: nil, dependsOn: [], owner: .human, status: .planned, evidenceDigest: nil)
        let payload = ProjectMilestoneUpsert(milestone: draft, expectedRevision: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        XCTAssertTrue(text.contains("\"targetDate\":null"), text)
        XCTAssertTrue(text.contains("\"evidenceDigest\":null"), text)
        XCTAssertTrue(text.contains("\"expectedRevision\":null"), text)
    }

    func testCalendarDateRejectsNonDateStrings() {
        XCTAssertNoThrow(try CalendarDate("2026-08-20"))
        XCTAssertThrowsError(try CalendarDate("2026-08-20T00:00:00.000Z"), "an instant is not a calendar date")
        XCTAssertThrowsError(try CalendarDate("2026-08-20\n"), "ICU `$` must not accept a trailing newline")
    }
}
