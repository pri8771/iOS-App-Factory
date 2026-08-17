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
        // portfolio.snapshot still speaks the legacy 8-value `ProjectManifestV1.lifecycleStage`
        // vocabulary (`LegacyProjectLifecycleStageV1Schema`); the fixture's `"released"` folds onto
        // the canonical stage per LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1 (ADR 0005) at decode time.
        XCTAssertEqual(snapshot.projects[2].lifecycleStage, .live)
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

    func testAllFortyEightOperationsAreNamed() {
        XCTAssertEqual(CommandOperation.allCases.count, 48)
        XCTAssertEqual(Set(CommandOperation.allCases.map(\.rawValue)), [
            "doctor", "task.submit", "task.run", "attempt.status", "attempt.events", "attempt.list",
            "attempt.pause", "attempt.resume", "attempt.cancel", "task.retry", "attempt.unblock",
            "daemon.reconcile", "evidence.list", "evidence.inspect", "evidence.verify", "portfolio.snapshot",
            "project.scan", "project.enroll-plan", "project.apply", "effects.status", "effects.list",
            "studio.snapshot", "studio.assistant.query", "studio.assistant.intent.propose",
            "studio.assistant.intent.execute", "project.milestones.list", "project.milestone.upsert",
            "room.create", "room.list", "room.post", "room.events", "room.typing",
            "project.seed", "preset.list", "preset.upsert", "phase.upsert",
            "plan.propose", "plan.edit", "plan.approve", "plan.execute", "plan.approve-gate", "plan.status",
            "plan.tick", "phase.run", "phase.status", "phase.list", "phase.approve", "phase.reject",
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
        // `docsProvenance` (studio/repo-docs-truth): Anjali has an enrolled repo-docs source backing
        // its lifecycleStage; Hindsight has none configured, which is `null` on the wire, not `{}`.
        let provenance = try XCTUnwrap(anjali.docsProvenance)
        XCTAssertEqual(provenance.sourceKind, .enrolled)
        XCTAssertEqual(provenance.repositoryRoot.rawValue, "/Users/example/code/anjali")
        XCTAssertEqual(provenance.lifecycleStageSource, .repoDocs)
        XCTAssertEqual(provenance.awaitingHumanFromDocsCount, 0)
        let hindsight = snapshot.projects[1]
        XCTAssertEqual(hindsight.slug.rawValue, "hindsight")
        XCTAssertNil(hindsight.lifecycleStage)
        XCTAssertNil(hindsight.docsProvenance)
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

    // MARK: ProjectLifecycleStage — canonical six (ADR 0005) shared by studio.snapshot + portfolio.snapshot
    //
    // `lifecycle-stages.json` is recorded by scripts/record-lifecycle-stage-fixture.mjs straight from
    // `ProjectLifecycleStageV1Schema`, `LegacyProjectLifecycleStageV1Schema`, and
    // `LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1` in the built contracts, so these tests pin the Swift enum
    // to lifecycle.ts/project.ts themselves. Regression guard: `ProjectLifecycleStage` once stayed on
    // the legacy 8-value project-manifest enum after `StudioProjectV1.lifecycleStage` moved to the
    // canonical six, and the recorded studio-snapshot fixture only ever carried `building`/`null` — the
    // values that decode identically under both vocabularies — so a real `idea`/`launch-prep`/`live`/
    // `frozen` from the daemon would have thrown at decode without any test noticing.

    private struct LifecycleStageVocabulary: Decodable {
        var canonical: [String]
        var legacy: [String]
        var legacyMap: [String: String]
    }

    private func lifecycleStageVocabulary() throws -> LifecycleStageVocabulary {
        try JSONDecoder().decode(LifecycleStageVocabulary.self, from: Fixtures.data("lifecycle-stages.json"))
    }

    private struct LifecycleStageField: Codable { var lifecycleStage: ProjectLifecycleStage }

    /// Decodes one raw wire string as a `ProjectLifecycleStage`, exactly as it arrives on the wire:
    /// a JSON string (not a Swift case name) inside a keyed `lifecycleStage` field.
    private func decodeStage(_ raw: String) throws -> ProjectLifecycleStage {
        let data = try JSONEncoder().encode(["lifecycleStage": raw])
        return try JSONDecoder().decode(LifecycleStageField.self, from: data).lifecycleStage
    }

    func testProjectLifecycleStageVocabularyMatchesTheRecordedContract() throws {
        let vocabulary = try lifecycleStageVocabulary()
        XCTAssertEqual(ProjectLifecycleStage.allCases.map(\.rawValue), vocabulary.canonical,
                       "Swift cases must be exactly ProjectLifecycleStageV1Schema's options, in progression order")
        XCTAssertEqual(vocabulary.canonical, ["idea", "building", "qa", "launch-prep", "live", "frozen"])
        XCTAssertEqual(Set(vocabulary.legacy), Set(vocabulary.legacyMap.keys),
                       "every legacy portfolio value must have a fold, and nothing else may be in the map")
        for target in vocabulary.legacyMap.values {
            XCTAssertNotNil(ProjectLifecycleStage(rawValue: target), "fold target \(target) is not a canonical stage")
        }
    }

    func testProjectLifecycleStageDecodesEveryCanonicalWireValue() throws {
        for raw in try lifecycleStageVocabulary().canonical {
            XCTAssertEqual(try decodeStage(raw).rawValue, raw)
        }
        // The four that never existed in the legacy enum — the exact values the old Swift type threw on.
        XCTAssertEqual(try decodeStage("idea"), .idea)
        XCTAssertEqual(try decodeStage("launch-prep"), .launchPrep)
        XCTAssertEqual(try decodeStage("live"), .live)
        XCTAssertEqual(try decodeStage("frozen"), .frozen)
    }

    func testProjectLifecycleStageFoldsEveryLegacyPortfolioValueOntoItsCanonicalStage() throws {
        let vocabulary = try lifecycleStageVocabulary()
        for (legacy, canonical) in vocabulary.legacyMap {
            XCTAssertEqual(try decodeStage(legacy).rawValue, canonical, "legacy \(legacy) must fold onto \(canonical)")
        }
        // The two folds ADR 0005 calls out by name.
        XCTAssertEqual(try decodeStage("planned"), .idea, "planned is still idea: nothing built, no gate can hold")
        XCTAssertEqual(try decodeStage("internal-testflight"), .launchPrep, "the release sub-lifecycle runs there")
    }

    func testProjectLifecycleStageRejectsValuesOutsideBothVocabularies() throws {
        for raw in ["", "shipped", "Building", "LIVE", "launchPrep", "launch_prep", "internalTestflight", "live "] {
            XCTAssertThrowsError(try decodeStage(raw), "\(raw.debugDescription) is neither canonical nor legacy") { error in
                XCTAssertTrue(error is DecodingError, "\(raw.debugDescription): \(error)")
            }
        }
    }

    func testProjectLifecycleStageAlwaysEncodesTheCanonicalWireValue() throws {
        let encoder = JSONEncoder()
        for stage in ProjectLifecycleStage.allCases {
            let text = String(decoding: try encoder.encode([stage]), as: UTF8.self)
            XCTAssertEqual(text, "[\"\(stage.rawValue)\"]")
            XCTAssertEqual(try JSONDecoder().decode([ProjectLifecycleStage].self, from: Data(text.utf8)), [stage])
        }
        // A folded legacy value re-encodes as its canonical stage — it never round-trips back to the
        // legacy string it was folded from.
        let folded = try decodeStage("internal-testflight")
        XCTAssertEqual(String(decoding: try encoder.encode([folded]), as: UTF8.self), #"["launch-prep"]"#)
        XCTAssertEqual(String(decoding: try encoder.encode([ProjectLifecycleStage.launchPrep]), as: UTF8.self),
                       #"["launch-prep"]"#, "the wire value is the hyphenated one, never the Swift case name")
    }

    /// End to end through `CommandResponse`: a real studio.snapshot carrying each canonical stage
    /// decodes. Substitutes Anjali's recorded `"building"` in place; the digest is intentionally not
    /// re-verified here (that is `DaemonClient`'s job, covered by the digest tests above) — this
    /// test is only about the model layer accepting the vocabulary.
    func testStudioSnapshotDecodesWithEveryCanonicalLifecycleStage() throws {
        let fixture = try Fixtures.string("studio-snapshot.response.json")
        let needle = #""lifecycleStage": "building""#
        XCTAssertEqual(fixture.components(separatedBy: needle).count - 1, 1, "expected exactly one non-null stage in the fixture")
        for raw in try lifecycleStageVocabulary().canonical {
            let json = fixture.replacingOccurrences(of: needle, with: #""lifecycleStage": "\#(raw)""#)
            guard case .success(_, .studioSnapshot(let snapshot)) = try JSONDecoder().decode(CommandResponse.self, from: Data(json.utf8)) else {
                return XCTFail("expected studio.snapshot for stage \(raw)")
            }
            XCTAssertEqual(snapshot.projects[0].lifecycleStage?.rawValue, raw)
            XCTAssertNil(snapshot.projects[1].lifecycleStage, "the untouched null stays nil")
        }
    }

    /// The same, for portfolio.snapshot: every legacy value `PortfolioProjectReadModelV1.lifecycleStage`
    /// can still send decodes, folded onto its canonical stage. Substitutes svara's recorded `"released"`.
    func testPortfolioSnapshotDecodesWithEveryLegacyLifecycleStage() throws {
        let fixture = try Fixtures.string("portfolio-snapshot.response.json")
        let needle = #""lifecycleStage": "released""#
        XCTAssertEqual(fixture.components(separatedBy: needle).count - 1, 1, "expected exactly one legacy stage in the fixture")
        for (legacy, canonical) in try lifecycleStageVocabulary().legacyMap {
            let json = fixture.replacingOccurrences(of: needle, with: #""lifecycleStage": "\#(legacy)""#)
            guard case .success(_, .portfolioSnapshot(let snapshot)) = try JSONDecoder().decode(CommandResponse.self, from: Data(json.utf8)) else {
                return XCTFail("expected portfolio.snapshot for legacy stage \(legacy)")
            }
            XCTAssertEqual(snapshot.projects[2].lifecycleStage?.rawValue, canonical, "legacy \(legacy)")
        }
    }

    // MARK: Studio rooms — room.* (@app-factory/studio-rooms)
    //
    // Every fixture below was produced by `scripts/record-room-fixtures.mjs` validating real data
    // through this worktree's own `@app-factory/contracts` build (room.ts merged to
    // integration/studio-wave1 — unconditionally supported, unlike the Phase 2 fixtures above).

    func testRoomCreateModel() throws {
        guard case .success(_, .roomCreate(let result)) = try decode("room-create.response.json") else {
            return XCTFail("expected room.create")
        }
        XCTAssertFalse(result.duplicate)
        XCTAssertEqual(result.room.title, "Studio launch review")
        XCTAssertNil(result.room.projectId)
        XCTAssertEqual(result.room.participants.map(\.persona.rawValue), ["codex", "claude", "ollama"])
        XCTAssertNil(result.room.activeGrantId)
        XCTAssertFalse(result.room.roundInProgress)
        XCTAssertEqual(result.room.budget.dayKey.rawValue, "2026-08-16")
        XCTAssertEqual(result.room.budget.fraction, 0)
    }

    func testRoomListModelCarriesARoundInProgress() throws {
        guard case .success(_, .roomList(let result)) = try decode("room-list.response.json") else {
            return XCTFail("expected room.list")
        }
        XCTAssertEqual(result.rooms.count, 2)
        XCTAssertEqual(result.rooms[0].title, "Studio launch review")
        let triage = result.rooms[1]
        XCTAssertEqual(triage.title, "Portfolio triage")
        XCTAssertNotNil(triage.activeGrantId)
        XCTAssertTrue(triage.roundInProgress, "activeGrantId != nil is the only honest 'a round is running' signal")
        XCTAssertTrue(triage.unattendedEnabled)
    }

    func testRoomPostModelAppendsAHumanMessage() throws {
        guard case .success(_, .roomPost(let result)) = try decode("room-post.response.json") else {
            return XCTFail("expected room.post")
        }
        guard case .human(let handle) = result.message.author else { return XCTFail("expected a human author") }
        XCTAssertEqual(handle.rawValue, "priyansh")
        XCTAssertEqual(result.message.body, "Let's plan the launch checklist.")
        XCTAssertTrue(result.message.mentions.isEmpty)
        XCTAssertEqual(result.room.headSequence, 1)
    }

    /// One fixture, every message/event shape the transcript view renders: a human message, a plain
    /// system line, an agent message, a PASS, a typed error with a bench, a mentioning agent message,
    /// and the chain-cap livelock line.
    func testRoomEventsModelCarriesEveryMessageShape() throws {
        guard case .success(_, .roomEvents(let result)) = try decode("room-events.response.json") else {
            return XCTFail("expected room.events")
        }
        XCTAssertEqual(result.messages.count, 7)
        XCTAssertEqual(result.nextAfterSequence, 7)
        XCTAssertTrue(result.moderator.enabled)
        XCTAssertEqual(result.moderator.attendance, .attended)

        guard case .message(let human) = result.messages[0], case .human(let handle) = human.author else {
            return XCTFail("expected a human message first")
        }
        XCTAssertEqual(handle.rawValue, "priyansh")
        XCTAssertNil(human.roundNumber)

        guard case .system(let factoryEvent) = result.messages[1] else { return XCTFail("expected a system line") }
        XCTAssertEqual(factoryEvent.code, .factoryEvent)
        XCTAssertNil(factoryEvent.persona)
        XCTAssertFalse(factoryEvent.body.isEmpty)

        guard case .message(let codexMessage) = result.messages[2], case .agent(let codexPersona) = codexMessage.author else {
            return XCTFail("expected an agent message")
        }
        XCTAssertEqual(codexPersona.rawValue, "codex")
        XCTAssertEqual(codexMessage.roundNumber, 1)

        guard case .system(let passed) = result.messages[3] else { return XCTFail("expected an agent-passed line") }
        XCTAssertEqual(passed.code, .agentPassed)
        XCTAssertEqual(passed.persona?.rawValue, "claude")

        guard case .system(let error) = result.messages[4] else { return XCTFail("expected a typed error") }
        XCTAssertEqual(error.code, .agentError)
        XCTAssertEqual(error.errorCode, .limit)
        XCTAssertEqual(error.errorCode?.label, "rate limit")
        XCTAssertEqual(error.persona?.rawValue, "ollama")
        XCTAssertNotNil(error.benchedUntil)
        XCTAssertNotNil(error.retryAt)

        guard case .message(let claudeMessage) = result.messages[5] else { return XCTFail("expected an agent message") }
        XCTAssertEqual(claudeMessage.mentions.map(\.rawValue), ["codex"])

        guard case .system(let chainCap) = result.messages[6] else { return XCTFail("expected the chain-cap line") }
        XCTAssertEqual(chainCap.code, .chainCap)
        XCTAssertNil(chainCap.persona)

        let ollamaParticipant = try XCTUnwrap(result.room.participants.first { $0.persona.rawValue == "ollama" })
        XCTAssertEqual(ollamaParticipant.benchReason, .limit)
        XCTAssertTrue(ollamaParticipant.isBenched(at: IsoInstant(unchecked: "2026-08-16T18:30:00.000Z").date!))
        XCTAssertFalse(ollamaParticipant.isBenched(at: IsoInstant(unchecked: "2026-08-16T20:00:00.000Z").date!))
        XCTAssertEqual(result.room.budget.spentTokens, 3_200)
        XCTAssertEqual(result.room.budget.fraction ?? -1, 0.02, accuracy: 0.0001)
    }

    func testRoomTypingModel() throws {
        guard case .success(_, .roomTyping(let result)) = try decode("room-typing.response.json") else {
            return XCTFail("expected room.typing")
        }
        XCTAssertEqual(result.roomId.rawValue, "50000001-0000-4000-8000-000000000001")
        XCTAssertEqual(result.typingUntil.rawValue, "2026-08-16T18:12:03.000Z")
    }

    func testRoomCreateSpecEncodesNullProjectIdExplicitly() throws {
        let spec = RoomCreateSpec(
            roomId: RoomID(unchecked: "50000003-0000-4000-8000-000000000003"), title: "Test room", projectId: nil,
            unattendedEnabled: false, agentCooldownEvents: 4,
            participants: [RoomParticipantSpec(persona: try RoomPersona("codex"), provider: try RoomProvider("codex"),
                                               displayName: "Codex")],
            budget: RoomBudgetPolicy(dailyCeilingTokens: 1_000, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 100))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(spec), as: UTF8.self)
        XCTAssertTrue(text.contains("\"projectId\":null"), text)
    }

    func testRoomWirePrimitivesRejectMalformedValues() {
        XCTAssertThrowsError(try RoomPersona("Codex"), "uppercase is not a lowercase persona key")
        XCTAssertNoThrow(try RoomPersona("codex"))
        XCTAssertThrowsError(try RoomProvider(""), "empty is not a provider key")
        XCTAssertThrowsError(try RoomHumanHandle(""))
        XCTAssertNoThrow(try RoomHumanHandle("priyansh.chordia"))
        XCTAssertThrowsError(try RoomDayKey("2026-8-16"), "day key must be zero-padded")
        XCTAssertNoThrow(try RoomDayKey("2026-08-16"))
    }
}
