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

    func testCornerChatAndFab() {
        let chat = ChatModel()
        chat.send("how many attempts?", context: AssistantContext(link: "offline · [client] transport.connection-failed"))
        assertHUD(HStack(alignment: .bottom, spacing: 24) {
            CornerChatView(chat: chat, context: { AssistantContext(link: "offline") }, minimized: .constant(false), onExpand: {})
            CornerChatView(chat: chat, context: { AssistantContext(link: "offline") }, minimized: .constant(true))
        }.padding(24).background(HUDTheme.void), size: CGSize(width: 520, height: 520), named: "corner-chat")
    }

    func testChatScreenAndPhases() {
        let chat = ChatModel()
        chat.send("what's blocked?", context: AssistantContext(link: "offline", timeline: fixture, now: today.date))
        assertHUD(ChatScreen(chat: chat, context: { AssistantContext(link: "offline") }),
                  size: CGSize(width: 900, height: 420), named: "chat-screen")
        assertHUD(PhasesScreen().background(HUDTheme.void), size: CGSize(width: 800, height: 300), named: "phases")
    }

    func testTitleBar() {
        let ready = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                 startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
        assertHUD(VStack(spacing: 8) {
            StudioTitleBar(tab: .constant(.dashboard), link: .connected(ready), budget: StudioRootView.staticBudget)
            StudioTitleBar(tab: .constant(.chat), link: .offline("[client] transport.connection-failed"), budget: StudioRootView.staticBudget)
        }.background(HUDTheme.void), size: CGSize(width: 1000, height: 100), named: "title-bar")
    }
}
