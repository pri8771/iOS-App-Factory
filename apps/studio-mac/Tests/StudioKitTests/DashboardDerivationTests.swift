import Foundation
@testable import StudioKit
import XCTest

/// The dashboard is a pure function of the read models. These pin what each instrument shows for the
/// recorded fixtures — and, above all, that nothing renders a number the machine cannot source.
final class DashboardDerivationTests: XCTestCase {

    private func decodePortfolio() throws -> PortfolioReadModel {
        let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("portfolio-snapshot.response.json"))
        guard case .success(_, .portfolioSnapshot(let snapshot)) = response else { throw NSError(domain: "fixture", code: 1) }
        return snapshot
    }

    private func decodeAttempts() throws -> [AttemptListItem] {
        let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("attempt-list.response.json"))
        guard case .success(_, .attemptList(let page)) = response else { throw NSError(domain: "fixture", code: 1) }
        return page.attempts
    }

    private func decodeEvidence() throws -> [EvidenceManifestDescriptor] {
        let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("evidence-list.response.json"))
        guard case .success(_, .evidenceList(let page)) = response else { throw NSError(domain: "fixture", code: 1) }
        return page.manifests
    }

    private let doctor = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                      startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
    private let now = IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!

    // MARK: Fixture

    func testBundledTimelineFixtureLoadsSixProjectsInWindow() throws {
        let fixture = try TimelineFixture.loadBundled()
        XCTAssertEqual(fixture.projects.map(\.slug), ["mala", "hindsight", "svara", "anjali", "aurafit", "roam"])
        XCTAssertEqual(fixture.window.start.rawValue, "2026-07-15")
        XCTAssertEqual(fixture.window.end.rawValue, "2026-10-15")
        XCTAssertEqual(fixture.window.monthTicks.map(\.rawValue), ["2026-07-15", "2026-08-01", "2026-09-01", "2026-10-01", "2026-10-15"])
        for project in fixture.projects {
            XCTAssertEqual(project.lifecycle.map(\.phase), LifecyclePhase.allCases, project.slug)
            XCTAssertEqual(project.provenance, .fixture("timeline-fixture.json"))
            for bar in project.bars {
                XCTAssertTrue(fixture.window.contains(bar.start), "\(project.slug) \(bar.label) starts outside the window")
                if let end = bar.end { XCTAssertGreaterThanOrEqual(end, bar.start) }
                if bar.kind == .gate { XCTAssertNotNil(bar.gateState) }
            }
        }
        // The vision: two device smokes + Anjali's listing gate wait on the human.
        XCTAssertEqual(fixture.projects.flatMap(\.waitingGates).map(\.label),
                       ["device smoke", "device smoke", "listing + sign-off"])
        // Every bar kind of the prototype vocabulary appears at least once.
        let kinds = Set(fixture.projects.flatMap(\.bars).map(\.kind))
        XCTAssertEqual(kinds, Set(TimelineBarKind.allCases))
    }

    func testFixtureRejectsBarsThatEndBeforeTheyStart() {
        let json = """
        {"schemaVersion":1,"recordedAt":"2026-08-16","note":"","window":{"start":"2026-07-15","end":"2026-10-15"},
         "projects":[{"slug":"x","name":"X","lifecycle":[],"bars":[{"kind":"done","label":"b","start":"2026-08-10","end":"2026-08-01"}]}]}
        """
        XCTAssertThrowsError(try TimelineFixture.decode(Data(json.utf8)))
    }

    func testDayStampArithmetic() throws {
        let day = try DayStamp("2026-08-16")
        XCTAssertEqual(day.adding(days: 1).rawValue, "2026-08-17")
        XCTAssertEqual(day.days(to: try DayStamp("2026-10-15")), 60)
        XCTAssertEqual(day.monthStart.rawValue, "2026-08-01")
        XCTAssertEqual(day.monthLabel, "AUG")
        XCTAssertEqual(day.shortLabel, "Aug 16")
        XCTAssertThrowsError(try DayStamp("2026-8-16"))
        XCTAssertThrowsError(try DayStamp("2026-02-30"))
        let window = TimelineWindow(start: try DayStamp("2026-07-15"), end: try DayStamp("2026-10-15"))
        XCTAssertEqual(window.dayCount, 92)
        XCTAssertEqual(window.fraction(of: try DayStamp("2026-07-15")), 0)
        XCTAssertEqual(window.fraction(of: try DayStamp("2026-10-15")), 1)
    }

    // MARK: Gauges

    func testGaugesFromRecordedFixtures() throws {
        let inputs = DashboardInputs(doctor: doctor, portfolio: try decodePortfolio(), attempts: try decodeAttempts(),
                                     evidence: try decodeEvidence(), timeline: try TimelineFixture.loadBundled(), now: now)
        let gauges = DashboardDerivation.gauges(inputs)
        XCTAssertEqual(gauges.map(\.id), DashboardDerivation.gaugeOrder)

        let projects = gauges[0]
        XCTAssertEqual(projects.readout, "3")
        XCTAssertEqual(projects.caption, "1 active")
        XCTAssertEqual(projects.fraction!, 1.0 / 3.0, accuracy: 1e-9)
        XCTAssertEqual(projects.provenance, .live("portfolio.snapshot"))
        XCTAssertEqual(projects.role, .machine)

        // Three succeeded demo attempts, terminal 11:05–13:05Z on 08-16, but only one has an evidence manifest.
        let verified = gauges[1]
        XCTAssertEqual(verified.readout, "1")
        XCTAssertEqual(verified.caption, "of 3 runs")
        XCTAssertEqual(verified.provenance, .derived("attempt.list ∩ evidence.list · 7d"))

        let awaiting = gauges[2]
        XCTAssertEqual(awaiting.readout, "1", "portfolio.totals.blockers")
        XCTAssertEqual(awaiting.caption, "+3 fixture ◆")
        XCTAssertEqual(awaiting.role, .human, "the only gold gauge")
        XCTAssertEqual(awaiting.provenance, .live("portfolio.snapshot"))

        for gauge in gauges[3...] {
            XCTAssertNil(gauge.readout, "\(gauge.id) must be an honest —")
            XCTAssertNil(gauge.fraction)
            XCTAssertEqual(gauge.provenance, .notYetSourced)
            XCTAssertNil(gauge.caption, "the badge says not-yet-sourced; the ring stays clean")
        }
    }

    func testVerifiedThisWeekCountsAllSucceededWhenEvidenceNotLoaded() throws {
        let inputs = DashboardInputs(doctor: doctor, attempts: try decodeAttempts(), evidence: nil, now: now)
        let verified = DashboardDerivation.gauges(inputs)[1]
        XCTAssertEqual(verified.readout, "3")
        XCTAssertEqual(verified.fraction, 1)
        XCTAssertEqual(verified.provenance, .derived("attempt.list · 7d"))
    }

    func testVerifiedThisWeekIsZeroOutsideTheWindow() throws {
        let later = now.addingTimeInterval(8 * 24 * 3600)
        let inputs = DashboardInputs(doctor: doctor, attempts: try decodeAttempts(), now: later)
        let verified = DashboardDerivation.gauges(inputs)[1]
        XCTAssertEqual(verified.readout, "0")
        XCTAssertEqual(verified.caption, "of 0 runs")
        XCTAssertNil(verified.fraction)
    }

    func testOfflineGaugesShowNoNumbers() throws {
        let gauges = DashboardDerivation.gauges(DashboardInputs(timeline: try TimelineFixture.loadBundled(), now: now))
        for gauge in gauges {
            XCTAssertNil(gauge.readout, gauge.id)
            XCTAssertNil(gauge.fraction, gauge.id)
        }
        XCTAssertEqual(gauges[0].caption, "offline")
        XCTAssertEqual(gauges[2].caption, "+3 fixture ◆")
    }

    // MARK: Reticle

    func testReticleIsLiveWhenTheDaemonReportsStages() throws {
        let inputs = DashboardInputs(doctor: doctor, portfolio: try decodePortfolio(), timeline: try TimelineFixture.loadBundled(), now: now)
        let reading = DashboardDerivation.reticle(inputs)
        // anjali building (0.4) + svara released (1.0); hindsight has no stage.
        XCTAssertEqual(reading.fraction!, 0.7, accuracy: 1e-9)
        XCTAssertEqual(reading.readout, "70%")
        XCTAssertEqual(reading.caption, "2 of 3 projects staged")
        XCTAssertEqual(reading.provenance, .live("portfolio.snapshot"))
    }

    func testReticleFallsBackToFixtureWithFixtureProvenance() throws {
        let reading = DashboardDerivation.reticle(DashboardInputs(timeline: try TimelineFixture.loadBundled(), now: now))
        // done counts: mala 5, hindsight 4, svara 3, anjali 2, aurafit 2, roam 2 → 18/36
        XCTAssertEqual(reading.fraction!, 0.5, accuracy: 1e-9)
        XCTAssertEqual(reading.readout, "50%")
        XCTAssertEqual(reading.provenance, .fixture("timeline-fixture.json"))
    }

    func testReticleIsHonestDashWithNothing() {
        let reading = DashboardDerivation.reticle(DashboardInputs(now: now))
        XCTAssertNil(reading.fraction)
        XCTAssertEqual(reading.readout, "—")
        XCTAssertEqual(reading.provenance, .notYetSourced)
    }

    // MARK: Projects, rows, awaiting

    func testProjectsMergeFixtureRowsWithLiveBySlugAndAppendExtras() throws {
        let inputs = DashboardInputs(doctor: doctor, portfolio: try decodePortfolio(), attempts: try decodeAttempts(),
                                     timeline: try TimelineFixture.loadBundled(), now: now)
        let projects = DashboardDerivation.projects(inputs)
        XCTAssertEqual(projects.map(\.slug), ["mala", "hindsight", "svara", "anjali", "aurafit", "roam"],
                       "all three daemon slugs exist in the fixture, so no extra rows")
        let anjali = try XCTUnwrap(projects.first { $0.slug == "anjali" })
        XCTAssertNotNil(anjali.live)
        XCTAssertEqual(anjali.attempts.count, 3, "the three demo attempts belong to anjali's projectId")
        XCTAssertEqual(anjali.runs.value, 7, "the daemon's attemptCount, not the page count")
        XCTAssertEqual(anjali.provenance, .fixture("timeline-fixture.json + live"))
        // Live attempt marks are overlaid as done bars.
        let liveBars = anjali.timeline.bars.filter { $0.provenance == .live("attempt.list") }
        XCTAssertEqual(liveBars.count, 3)
        XCTAssertEqual(Set(liveBars.map(\.kind)), [.done])
        XCTAssertEqual(liveBars.map(\.start.rawValue), ["2026-08-16", "2026-08-16", "2026-08-16"])
        let mala = try XCTUnwrap(projects.first { $0.slug == "mala" })
        XCTAssertNil(mala.live)
        XCTAssertNil(mala.runs.value)
        XCTAssertEqual(mala.runs.provenance, .notYetSourced)
    }

    func testLiveOnlyProjectGetsAnHonestRow() throws {
        var portfolio = try decodePortfolio()
        portfolio.projects[0].slug = StableKey(unchecked: "demo-only")
        portfolio.projects[0].displayName = "Demo only"
        let inputs = DashboardInputs(doctor: doctor, portfolio: portfolio, attempts: try decodeAttempts(),
                                     timeline: try TimelineFixture.loadBundled(), now: now)
        let projects = DashboardDerivation.projects(inputs)
        XCTAssertEqual(projects.count, 7)
        let extra = try XCTUnwrap(projects.last)
        XCTAssertEqual(extra.slug, "demo-only")
        XCTAssertEqual(extra.timeline.provenance, .live("portfolio.snapshot"))
        // building → idea done, building active, qa/launch-prep/live planned, device smoke won't guess.
        XCTAssertEqual(extra.lifecycle.map(\.state), [.done, .active, .planned, .planned, .unknown, .planned])
        let unknown = try XCTUnwrap(extra.timeline.bars.first { $0.kind == .unknown })
        XCTAssertEqual(unknown.label, "no milestones")
        XCTAssertEqual(unknown.start.rawValue, "2026-08-16")
        XCTAssertEqual(unknown.end?.rawValue, "2026-10-15")
        XCTAssertEqual(extra.timeline.bars.filter { $0.kind == .done }.count, 3, "its attempts still show")
    }

    func testLifecycleFromDaemonStageNeverClaimsTheHumanGate() {
        for stage in ProjectLifecycleStage.allCases {
            let steps = DashboardDerivation.lifecycle(for: stage)
            XCTAssertEqual(steps.first { $0.phase == .deviceSmoke }?.state, .unknown, stage.rawValue)
        }
        XCTAssertEqual(DashboardDerivation.lifecycle(for: .released).map(\.state), [.done, .done, .done, .done, .unknown, .done])
        XCTAssertEqual(DashboardDerivation.lifecycle(for: nil).map(\.state), Array(repeating: .unknown, count: 6))
    }

    func testAwaitingListsLiveBlockedAttemptsBeforeFixtureGates() throws {
        var attempts = try decodeAttempts()
        attempts[0].attempt.state = .blocked
        attempts[0].attempt.blocker = Blocker(kind: .approval, code: NamespacedCode(unchecked: "approval.needed"),
                                              summary: "Approve the plan", requiredAction: "say yes")
        let inputs = DashboardInputs(doctor: doctor, portfolio: try decodePortfolio(), attempts: attempts,
                                     timeline: try TimelineFixture.loadBundled(), now: now)
        let snapshot = DashboardDerivation.snapshot(inputs)
        XCTAssertEqual(snapshot.awaiting.count, 4)
        XCTAssertEqual(snapshot.awaiting[0].title, "Demo attempt 3")
        XCTAssertEqual(snapshot.awaiting[0].detail, "Approve the plan — say yes")
        XCTAssertEqual(snapshot.awaiting[0].slug, "anjali")
        XCTAssertEqual(snapshot.awaiting[0].provenance, .live("attempt.list"))
        XCTAssertEqual(snapshot.awaiting[1].title, "Hindsight · device smoke")
        XCTAssertEqual(snapshot.awaiting[1].provenance, .fixture("timeline-fixture.json"))
        // The blocked attempt is drawn as a ◆ on anjali's row.
        let anjali = try XCTUnwrap(snapshot.project(slug: "anjali"))
        XCTAssertEqual(anjali.timeline.bars.filter { $0.kind == .gate && $0.gateState == .waiting }.count, 2)
    }

    // MARK: Run detail

    func testRunChecksFromRecordedEvents() throws {
        let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("attempt-events.response.json"))
        guard case .success(_, .attemptEvents(let page)) = response else { return XCTFail("fixture") }
        let checks = RunDetail.checks(events: page.events, verify: nil)
        XCTAssertEqual(checks.map(\.label), ["step 20000001", "commit"])
        XCTAssertEqual(checks[0].state, .failed)
        XCTAssertEqual(checks[0].detail, "verify.tests-failed")
        XCTAssertEqual(checks[1].state, .succeeded)
        XCTAssertEqual(checks[1].detail, "aaaaaaaaaaaa")
        XCTAssertEqual(checks.map(\.provenance), [.live("attempt.events"), .live("attempt.events")])
    }

    // MARK: studio.snapshot-sourced dashboard (Studio Phase 2)

    /// A hand-built snapshot exercising every unavailableReason field, a matched fixture row (proving
    /// the FIXTURE → LIVE badge flip via a real milestone), a live-only row with a human-owned gate,
    /// and an awaitingHuman item — everything `DashboardDerivation`'s studio-mode branch has to render.
    private func studioSnapshot(gateState: StudioGateState = .pending, gateOwner: String? = "human") -> StudioSnapshot {
        let hindsight = StudioProject(
            projectId: ProjectID(unchecked: "9c8b7a6f-5e4d-4c3b-8a19-0f1e2d3c4b5a"), name: "Hindsight",
            lifecycleStage: nil,
            gates: StudioProjectGates(typed: nil, owner: nil, state: .unavailable, unavailableReason: studioNotYetWiredReason),
            latestAttemptSummary: nil,
            awaitingHuman: [StudioAwaitingHumanItem(kind: .blockedAttempt,
                                                    attemptId: AttemptID(unchecked: "00000004-0000-4000-8000-000000000004"),
                                                    summary: "needs an operator answer",
                                                    since: IsoInstant(unchecked: "2026-08-16T14:00:00.000Z"))],
            timeline: StudioProjectTimeline(
                milestones: [StudioMilestone(milestoneId: StudioMilestoneID(unchecked: "hindsight-beta"), name: "Beta review",
                                             targetDate: IsoInstant(unchecked: "2026-08-20T00:00:00.000Z"), status: .planned)],
                milestonesUnavailableReason: nil, actuals: []))
        let zenith = StudioProject(
            projectId: ProjectID(unchecked: "1a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5e"), name: "Zenith",
            lifecycleStage: .building,
            gates: StudioProjectGates(typed: "legal", owner: gateOwner, state: gateState, unavailableReason: nil),
            latestAttemptSummary: nil, awaitingHuman: [],
            timeline: StudioProjectTimeline(milestones: [], milestonesUnavailableReason: studioNotYetWiredReason, actuals: []))
        return StudioSnapshot(
            generatedAt: IsoInstant(unchecked: "2026-08-16T22:00:00.000Z"), projects: [hindsight, zenith], rooms: [],
            roomsUnavailableReason: studioNotYetWiredReason,
            portfolio: StudioPortfolioAggregates(
                verifiedThisWeek: StudioCountMetric(value: 5, unavailableReason: nil),
                awaitingYouCount: StudioCountMetric(value: nil, unavailableReason: "no source yet"),
                passRate: StudioRatioMetric(value: 0.5, unavailableReason: nil),
                medianRunSeconds: StudioDurationSecondsMetric(value: nil, unavailableReason: "no runs sampled"),
                agentWindowShare: StudioRatioMetric(value: 0.25, unavailableReason: nil)),
            sourceSnapshotDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "0", count: 64)))
    }

    func testStudioGaugesRenderUnavailableReasonAsNotYetSourcedNeverANumber() throws {
        let inputs = DashboardInputs(doctor: doctor, timeline: try TimelineFixture.loadBundled(), studioSnapshot: studioSnapshot(), now: now)
        let gauges = DashboardDerivation.gauges(inputs)
        XCTAssertEqual(gauges.map(\.id), DashboardDerivation.studioGaugeOrder)

        XCTAssertEqual(gauges[0].readout, "2", "studio.snapshot's own project count")
        XCTAssertEqual(gauges[0].provenance, .live("studio.snapshot"))
        XCTAssertEqual(gauges[1].readout, "5", "verifiedThisWeek.value")
        // awaitingYouCount has no value in this fixture — an honest not-yet-sourced, never a fake 0.
        XCTAssertNil(gauges[2].readout)
        XCTAssertNil(gauges[2].fraction)
        XCTAssertEqual(gauges[2].provenance, .notYetSourced)
        XCTAssertEqual(gauges[2].role, .human, "the gold gauge stays gold even while unsourced")
        XCTAssertEqual(gauges[3].readout, "50%")
        XCTAssertEqual(gauges[3].fraction, 0.5)
        XCTAssertNil(gauges[4].readout, "medianRunSeconds has no value")
        XCTAssertEqual(gauges[4].provenance, .notYetSourced)
        XCTAssertEqual(gauges[5].readout, "25%")
    }

    func testStudioAwaitingComesFromAwaitingHumanBadgedLive() throws {
        let inputs = DashboardInputs(timeline: try TimelineFixture.loadBundled(), studioSnapshot: studioSnapshot(), now: now)
        let snapshot = DashboardDerivation.snapshot(inputs)
        let studioItems = snapshot.awaiting.filter { $0.provenance == .live("studio.snapshot") }
        XCTAssertEqual(studioItems.count, 1)
        XCTAssertTrue(studioItems[0].title.contains("Hindsight"))
        XCTAssertEqual(studioItems[0].attemptId?.rawValue, "00000004-0000-4000-8000-000000000004")
    }

    func testStudioTimelineOverlaysRealMilestonesAndFlipsFixtureToLive() throws {
        let inputs = DashboardInputs(timeline: try TimelineFixture.loadBundled(), studioSnapshot: studioSnapshot(), now: now)
        let projects = DashboardDerivation.projects(inputs)
        let hindsight = try XCTUnwrap(projects.first { $0.slug == "hindsight" })
        guard case .fixture(let note) = hindsight.provenance else { return XCTFail("expected a fixture+live provenance, got \(hindsight.provenance)") }
        XCTAssertTrue(note.hasSuffix("+ live"), "the badge flips FIXTURE → FIXTURE + LIVE")
        let milestoneBar = try XCTUnwrap(hindsight.timeline.bars.first { $0.provenance == .live("studio.snapshot") && $0.kind != .gate })
        XCTAssertEqual(milestoneBar.label, "Beta review")
        XCTAssertEqual(milestoneBar.start.rawValue, "2026-08-20")
        XCTAssertEqual(milestoneBar.kind, .plan, "status .planned maps to a planned bar")
    }

    func testStudioLiveOnlyRowGetsAGoldGateWhenHumanOwnedAndNoMilestonesNote() throws {
        let inputs = DashboardInputs(timeline: try TimelineFixture.loadBundled(), studioSnapshot: studioSnapshot(), now: now)
        let projects = DashboardDerivation.projects(inputs)
        let zenith = try XCTUnwrap(projects.first { $0.slug == "zenith" })
        XCTAssertEqual(zenith.timeline.provenance, .live("studio.snapshot"))
        // The fixture's milestonesUnavailableReason is more precise than a generic "no milestones" —
        // studioProjects prefers it when the daemon gave one.
        XCTAssertEqual(zenith.timeline.note, studioNotYetWiredReason)
        let gate = try XCTUnwrap(zenith.timeline.bars.first { $0.kind == .gate })
        XCTAssertEqual(gate.gateState, .waiting, "state .pending + human owner is still waiting on you")
        XCTAssertEqual(gate.label, "legal")
    }

    func testStudioGateDrawsNothingWhenMachineOwnedOrUnavailable() throws {
        let machineOwned = DashboardInputs(timeline: try TimelineFixture.loadBundled(),
                                           studioSnapshot: studioSnapshot(gateOwner: "machine"), now: now)
        let machineProjects = DashboardDerivation.projects(machineOwned)
        let machineZenith = try XCTUnwrap(machineProjects.first { $0.slug == "zenith" })
        XCTAssertNil(machineZenith.timeline.bars.first { $0.kind == .gate }, "diamonds are this app's human-gate language only")

        let unavailable = DashboardInputs(timeline: try TimelineFixture.loadBundled(),
                                          studioSnapshot: studioSnapshot(gateState: .unavailable, gateOwner: nil), now: now)
        let unavailableProjects = DashboardDerivation.projects(unavailable)
        let unavailableZenith = try XCTUnwrap(unavailableProjects.first { $0.slug == "zenith" })
        XCTAssertNil(unavailableZenith.timeline.bars.first { $0.kind == .gate })
    }

    func testSlugifyMatchesSimpleNamesButNotMultiWordOnes() {
        XCTAssertEqual(DashboardDerivation.slugify("Hindsight"), "hindsight")
        XCTAssertEqual(DashboardDerivation.slugify("Anjali — Journal"), "anjali-journal")
        XCTAssertNotEqual(DashboardDerivation.slugify("Anjali — Journal"), "anjali", "no slug field on StudioProjectV1 — see DashboardModel.swift")
    }

    func testRunChecksIncludeVerifiedEvidence() throws {
        let verify = EvidenceVerifyResult(
            integrityVerified: true,
            manifest: EvidenceManifestDescriptor(attemptId: AttemptID(unchecked: "00000001-0000-4000-8000-000000000001"),
                                                 createdAt: IsoInstant(unchecked: "2026-08-16T11:05:00.000Z"),
                                                 manifestDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "cd", count: 32)),
                                                 subject: EvidenceSubject(taskSpecDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "ab", count: 32)),
                                                                          policyDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "ef", count: 32)),
                                                                          baseCommit: GitObjectID(unchecked: String(repeating: "a", count: 40)),
                                                                          candidateTree: nil, fence: 2),
                                                 entryCount: 1, requiredKinds: [.verification]),
            evidence: [EvidenceItemVerification(evidenceId: EvidenceID(unchecked: "50000001-0000-4000-8000-000000000001"),
                                                digest: Sha256Digest(unchecked: "sha256:" + String(repeating: "11", count: 32)),
                                                kind: .verification, createdAt: IsoInstant(unchecked: "2026-08-16T11:04:00.000Z"),
                                                producer: NamespacedCode(unchecked: "trusted.verifier"), artifactCount: 2)],
            artifactCount: 2)
        let checks = RunDetail.checks(events: [], verify: verify)
        XCTAssertEqual(checks.count, 1)
        XCTAssertEqual(checks[0].label, "evidence · verification")
        XCTAssertEqual(checks[0].state, .succeeded)
        XCTAssertEqual(checks[0].detail, "trusted.verifier · 2 artifacts")
        XCTAssertEqual(checks[0].provenance, .live("evidence.verify"))
    }
}
