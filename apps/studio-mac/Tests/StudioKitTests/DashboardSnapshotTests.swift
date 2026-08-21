import AppKit
import SnapshotTesting
@testable import StudioKit
import SwiftUI
import XCTest

/// Reference images for the dashboard instruments — timeline, reticle, gauge row, rings, the whole
/// dashboard, project detail, and the corner chat — in both appearances. `today` is pinned to
/// 2026-08-16 so the today-line and the "this week" window are stable.
@MainActor
final class DashboardSnapshotTests: XCTestCase {

    private let today = try! DayStamp("2026-08-16")
    private var fixture: TimelineFixture { try! TimelineFixture.loadBundled() }

    private func liveInputs() throws -> DashboardInputs {
        let portfolio: PortfolioReadModel = try {
            let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("portfolio-snapshot.response.json"))
            guard case .success(_, .portfolioSnapshot(let s)) = r else { throw NSError(domain: "fixture", code: 1) }
            return s
        }()
        let attempts: [AttemptListItem] = try {
            let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("attempt-list.response.json"))
            guard case .success(_, .attemptList(let p)) = r else { throw NSError(domain: "fixture", code: 1) }
            return p.attempts
        }()
        let evidence: [EvidenceManifestDescriptor] = try {
            let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("evidence-list.response.json"))
            guard case .success(_, .evidenceList(let p)) = r else { throw NSError(domain: "fixture", code: 1) }
            return p.manifests
        }()
        let doctor = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                  startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
        return DashboardInputs(doctor: doctor, portfolio: portfolio, attempts: attempts, evidence: evidence,
                               timeline: fixture, now: IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!)
    }

    func testTimeline() {
        assertHUD(TimelineView(rows: fixture.projects, window: fixture.window, today: today, selectedSlug: "hindsight")
                    .padding(12).hudPanel("timeline", padding: 8).padding(16).background(HUDTheme.void),
                  size: CGSize(width: 960, height: 400), named: "timeline")
    }

    func testTimelineWithLiveOverlay() throws {
        let snapshot = DashboardDerivation.snapshot(try liveInputs())
        assertHUD(TimelineView(rows: snapshot.rows, window: snapshot.window, today: today)
                    .padding(12).hudPanel("timeline", padding: 8).padding(16).background(HUDTheme.void),
                  size: CGSize(width: 960, height: 400), named: "timeline-live")
    }

    func testReticle() {
        assertHUD(HStack(spacing: 24) {
            PortfolioReticle(reading: ReticleReading(fraction: 0.75, caption: "6 projects · fixture",
                                                     provenance: .fixture("timeline-fixture.json")))
                .frame(width: 200)
            PortfolioReticle(reading: ReticleReading(fraction: 0.7, caption: "2 of 3 projects staged",
                                                     provenance: .live("portfolio.snapshot")))
                .frame(width: 200)
            PortfolioReticle(reading: ReticleReading(fraction: nil, caption: "offline", provenance: .notYetSourced))
                .frame(width: 200)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 720, height: 290), named: "reticle")
    }

    func testGaugeRow() throws {
        let gauges = DashboardDerivation.gauges(try liveInputs())
        assertHUD(GaugeRowView(gauges: gauges).padding(12).hudPanel(padding: 8).padding(16).background(HUDTheme.void),
                  size: CGSize(width: 760, height: 200), named: "gauge-row")
    }

    func testGaugeRowOffline() {
        let gauges = DashboardDerivation.gauges(DashboardInputs(timeline: fixture, now: today.date))
        assertHUD(GaugeRowView(gauges: gauges).padding(12).hudPanel(padding: 8).padding(16).background(HUDTheme.void),
                  size: CGSize(width: 760, height: 200), named: "gauge-row-offline")
    }

    func testPhaseRingsRow() throws {
        let snapshot = DashboardDerivation.snapshot(try liveInputs())
        assertHUD(PhaseRingsRow(projects: snapshot.projects, selectedSlug: "svara")
                    .padding(12).hudPanel("projects", padding: 8).padding(16).background(HUDTheme.void),
                  size: CGSize(width: 900, height: 200), named: "phase-rings")
    }

    func testDashboardScreen() throws {
        let snapshot = DashboardDerivation.snapshot(try liveInputs())
        assertHUD(DashboardScreen(snapshot: snapshot, timelineNote: "FIXTURE · timeline-fixture.json — planned spans are illustrative until the daemon has a milestones schema.")
                    .background(HUDTheme.void),
                  size: CGSize(width: 1240, height: 940), named: "dashboard")
    }

    func testProjectDetail() throws {
        let snapshot = DashboardDerivation.snapshot(try liveInputs())
        let anjali = try XCTUnwrap(snapshot.project(slug: "anjali"))
        let events: [AttemptEvent] = try {
            let r = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("attempt-events.response.json"))
            guard case .success(_, .attemptEvents(let p)) = r else { throw NSError(domain: "fixture", code: 1) }
            return p.events
        }()
        // The fixture events belong to attempt …0001; show them for the newest attempt so the checks list renders.
        let newest = try XCTUnwrap(anjali.attempts.max { $0.attempt.updatedAt.rawValue < $1.attempt.updatedAt.rawValue })
        let runs = [newest.attempt.attemptId: RunDetail(attemptId: newest.attempt.attemptId, events: events, verify: nil,
                                                        evidenceNote: "[daemon] evidence.manifest-missing: no manifest for this attempt")]
        assertHUD(ProjectDetailView(project: anjali, runs: runs, isConnected: true, onBack: {}).background(HUDTheme.void),
                  size: CGSize(width: 1100, height: 620), named: "project-detail")
    }

    /// Project detail sourced from `studio.snapshot`: a live-only row (its slug doesn't match a
    /// fixture row — the shared `studio-snapshot.response.json` fixture's own projects now merge
    /// with the bundled timeline fixture via their real `slug`, so this test builds its own
    /// project with the display name and every rendered value unchanged from before that fix (only
    /// `slug` moved from a slugify-of-name guess to an explicit, still-non-matching value) so the
    /// committed reference image stays valid), a human-owned gold gate, and a loaded
    /// `project.milestones.list` panel.
    func testProjectDetailStudioLive() throws {
        let anjali = StudioProject(
            projectId: ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"),
            slug: StableKey(unchecked: "anjali-journal"), name: "Anjali — Journal", lifecycleStage: .building,
            gates: StudioProjectGates(typed: .legal, owner: .human, state: .blocked, unavailableReason: nil),
            latestAttemptSummary: StudioAttemptSummary(
                attemptId: AttemptID(unchecked: "00000001-0000-4000-8000-000000000001"),
                taskId: TaskID(unchecked: "10000001-0000-4000-8000-000000000001"), state: .succeeded,
                updatedAt: IsoInstant(unchecked: "2026-08-16T11:05:00.000Z"), blocker: nil),
            awaitingHuman: [StudioAwaitingHumanItem(
                kind: .blockedAttempt, attemptId: AttemptID(unchecked: "00000004-0000-4000-8000-000000000004"),
                summary: "Waiting for approval to upload build 4 to TestFlight.",
                since: IsoInstant(unchecked: "2026-08-16T14:05:00.000Z"))],
            timeline: StudioProjectTimeline(
                milestones: [
                    ProjectMilestone(milestoneId: MilestoneID(unchecked: "70000001-0000-4000-8000-000000000001"),
                                     projectId: ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"),
                                     phase: StableKey(unchecked: "beta"), kind: .gate, label: "Beta review",
                                     targetDate: CalendarDate(unchecked: "2026-08-20"), dependsOn: [], owner: .human,
                                     status: .planned, evidenceDigest: nil, revision: 0,
                                     createdAt: IsoInstant(unchecked: "2026-08-10T09:00:00.000Z"),
                                     updatedAt: IsoInstant(unchecked: "2026-08-10T09:00:00.000Z")),
                    ProjectMilestone(milestoneId: MilestoneID(unchecked: "70000002-0000-4000-8000-000000000002"),
                                     projectId: ProjectID(unchecked: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f"),
                                     phase: StableKey(unchecked: "launch"), kind: .release, label: "Store listing + sign-off",
                                     targetDate: CalendarDate(unchecked: "2026-09-05"),
                                     dependsOn: [MilestoneID(unchecked: "70000001-0000-4000-8000-000000000001")],
                                     owner: .human, status: .planned, evidenceDigest: nil, revision: 1,
                                     createdAt: IsoInstant(unchecked: "2026-08-10T09:05:00.000Z"),
                                     updatedAt: IsoInstant(unchecked: "2026-08-15T10:00:00.000Z")),
                ],
                milestonesUnavailableReason: nil,
                actuals: [
                    StudioTimelineActual(attemptId: AttemptID(unchecked: "00000001-0000-4000-8000-000000000001"),
                                         label: "attempt started", occurredAt: IsoInstant(unchecked: "2026-08-16T11:00:00.000Z")),
                    StudioTimelineActual(attemptId: AttemptID(unchecked: "00000001-0000-4000-8000-000000000001"),
                                         label: "attempt succeeded", occurredAt: IsoInstant(unchecked: "2026-08-16T11:05:00.000Z")),
                ]))
        let studioSnapshot = StudioSnapshot(
            generatedAt: IsoInstant(unchecked: "2026-08-16T22:00:00.000Z"), projects: [anjali], rooms: [],
            roomsUnavailableReason: studioNoRoomsReason,
            portfolio: StudioPortfolioAggregates(
                verifiedThisWeek: StudioCountMetric(value: 2, unavailableReason: nil),
                awaitingYouCount: StudioCountMetric(value: 1, unavailableReason: nil),
                passRate: StudioRatioMetric(value: 0.8, unavailableReason: nil),
                medianRunSeconds: StudioDurationSecondsMetric(value: 185.5, unavailableReason: nil),
                agentWindowShare: StudioRatioMetric(value: nil, unavailableReason: "not yet computed")),
            sourceSnapshotDigest: Sha256Digest(unchecked: "sha256:" + String(repeating: "0", count: 64)))
        let doctor = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                  startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
        let inputs = DashboardInputs(doctor: doctor, timeline: fixture, studioSnapshot: studioSnapshot,
                                     now: IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!)
        let dashboardSnapshot = DashboardDerivation.snapshot(inputs)
        let project = try XCTUnwrap(dashboardSnapshot.project(slug: "anjali-journal"))
        let milestonesResponse = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("project-milestones-list.response.json"))
        guard case .success(_, .projectMilestonesList(let timeline)) = milestonesResponse else { throw NSError(domain: "fixture", code: 1) }
        assertHUD(ProjectDetailView(project: project, isConnected: true, onBack: {}, milestoneTimeline: timeline)
                    .background(HUDTheme.void),
                  size: CGSize(width: 1100, height: 760), named: "project-detail-studio")
    }

    /// The gold confirmation card in every settled state: pending (Confirm/Cancel), executing, and
    /// executed — the last showing the resulting attempt id per `IntentCard.Status`.
    func testIntentConfirmationCard() {
        let intent = AssistantIntent(
            intentId: AssistantIntentID(unchecked: "60000001-0000-4000-8000-000000000001"),
            utterance: "approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload.",
            payload: .approveAttempt(attemptId: AttemptID(unchecked: "00000004-0000-4000-8000-000000000004"),
                                     answer: "Approved — go ahead and upload."),
            summary: "Approve attempt 00000004-0000-4000-8000-000000000004 and resume it with the given answer.",
            requiresConfirmation: true, proposedAt: IsoInstant(unchecked: "2026-08-16T22:01:00.000Z"))
        assertHUD(
            VStack(alignment: .leading, spacing: 16) {
                IntentConfirmationCard(card: IntentCard(intent: intent, status: .pending), onConfirm: {}, onCancel: {})
                IntentConfirmationCard(card: IntentCard(intent: intent, status: .executing), onConfirm: {}, onCancel: {})
                IntentConfirmationCard(card: IntentCard(intent: intent, status: .executed(summary: "attempt 00000004-0000-4000-8000-000000000004")),
                                       onConfirm: {}, onCancel: {})
            }
            .padding(16).frame(width: 420, alignment: .leading).background(HUDTheme.void),
            size: CGSize(width: 460, height: 440), named: "intent-confirmation-card")
    }

    func testCornerChatAndFab() async {
        let chat = ChatModel()
        await chat.send("how many attempts?", context: AssistantContext(link: "offline · [client] transport.connection-failed"))
        assertHUD(HStack(alignment: .bottom, spacing: 24) {
            CornerChatView(chat: chat, context: { AssistantContext(link: "offline") }, minimized: .constant(false), onExpand: {})
            CornerChatView(chat: chat, context: { AssistantContext(link: "offline") }, minimized: .constant(true))
        }.padding(24).background(HUDTheme.void), size: CGSize(width: 520, height: 520), named: "corner-chat")
    }

    func testChatScreen() async {
        let chat = ChatModel()
        await chat.send("what's blocked?", context: AssistantContext(link: "offline", timeline: fixture, now: today.date))
        assertHUD(ChatScreen(chat: chat, context: { AssistantContext(link: "offline") }),
                  size: CGSize(width: 900, height: 420), named: "chat-screen")
    }

    func testTitleBar() {
        let ready = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                 startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
        assertHUD(VStack(spacing: 8) {
            StudioTitleBar(link: .connected(ready), budget: StudioRootView.staticBudget)
            StudioTitleBar(link: .offline("[client] transport.connection-failed"), budget: StudioRootView.staticBudget)
        }.background(HUDTheme.void), size: CGSize(width: 1000, height: 100), named: "title-bar")
    }

    /// The `NavRail` (Architecture decision 13): one column per `StudioTab`, each with that tab
    /// selected, so the arc-accent selection bar + icon tint are exercised for all four.
    func testNavRail() {
        assertHUD(HStack(spacing: 24) {
            ForEach(StudioTab.allCases) { selected in
                NavRail(tab: .constant(selected))
            }
        }.background(HUDTheme.void), size: CGSize(width: 260, height: 360), named: "nav-rail")
    }
}
