import Foundation
@testable import StudioKit
import XCTest

/// The stub answers only from live data and never invents. These pin the shapes it handles and the
/// honest fallbacks for everything else.
final class ScriptedAssistantTests: XCTestCase {

    private func context(connected: Bool = true) throws -> AssistantContext {
        let portfolio: PortfolioReadModel? = try {
            let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("portfolio-snapshot.response.json"))
            guard case .success(_, .portfolioSnapshot(let s)) = response else { throw NSError(domain: "fixture", code: 1) }
            return s
        }()
        let attempts: [AttemptListItem] = try {
            let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("attempt-list.response.json"))
            guard case .success(_, .attemptList(let page)) = response else { throw NSError(domain: "fixture", code: 1) }
            return page.attempts
        }()
        let doctor = DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                  startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])
        let now = IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!
        if connected {
            return AssistantContext(link: "connected", doctor: doctor, portfolio: portfolio, attempts: attempts,
                                    timeline: try TimelineFixture.loadBundled(), now: now)
        }
        return AssistantContext(link: "offline · [client] transport.connection-failed", timeline: try TimelineFixture.loadBundled(), now: now)
    }

    func testAttemptCountsComeFromAttemptList() throws {
        let reply = ScriptedAssistant.answer("How many attempts are there?", context: try context())
        XCTAssertTrue(reply.text.hasPrefix("3 attempts on record: 3 succeeded."), reply.text)
        XCTAssertTrue(reply.text.contains("Latest: “Demo attempt 3” (succeeded"), reply.text)
        XCTAssertEqual(reply.provenance, .live("attempt.list"))
    }

    func testDaemonStatusComesFromDoctor() throws {
        let reply = ScriptedAssistant.answer("is the daemon online?", context: try context())
        XCTAssertEqual(reply.text, "Daemon 0.1.0-ui-demo is ready (protocol v1, started 2026-08-16T16:00:00.000Z).")
        XCTAssertEqual(reply.provenance, .live("doctor"))
    }

    func testBlockedListsDaemonThenFixtureGates() throws {
        let reply = ScriptedAssistant.answer("what's blocked?", context: try context())
        XCTAssertTrue(reply.text.hasPrefix("Nothing is blocked in the daemon."), reply.text)
        XCTAssertTrue(reply.text.contains("From the timeline fixture (not the daemon): 3 gates waiting on you"), reply.text)
        XCTAssertTrue(reply.text.contains("Hindsight · device smoke (Aug 17)"), reply.text)
    }

    func testProjectByNameMergesLiveAndFixture() throws {
        let reply = ScriptedAssistant.answer("how's anjali", context: try context())
        XCTAssertTrue(reply.text.hasPrefix("Anjali — Journal: stage building, 7 attempts, 2 active, 1 blocker, health blocked."), reply.text)
        XCTAssertTrue(reply.text.contains("Timeline fixture (not the daemon): Anjali has 2 of 6 lifecycle steps done"), reply.text)
        XCTAssertEqual(reply.provenance, .live("portfolio.snapshot"))
    }

    func testProjectUnknownToDaemonSaysSo() throws {
        let reply = ScriptedAssistant.answer("How is Roam doing?", context: try context())
        XCTAssertTrue(reply.text.hasPrefix("The daemon has no record of Roam."), reply.text)
        XCTAssertTrue(reply.text.contains("candidate frozen"), reply.text)
        XCTAssertEqual(reply.provenance, .fixture("timeline-fixture.json"))
    }

    func testShipDatesAreNeverGuessed() throws {
        let reply = ScriptedAssistant.answer("when does Roam ship?", context: try context())
        XCTAssertTrue(reply.text.hasPrefix("No date I can back up."), reply.text)
        XCTAssertFalse(reply.text.contains("2026-1"), "no invented date")
        XCTAssertEqual(reply.provenance, .staticValue("no planned-date source"))

        let hindsight = ScriptedAssistant.answer("when will hindsight release", context: try context())
        XCTAssertTrue(hindsight.text.contains("pencils “release 1.0” at Aug 18 — a fixture, not a commitment"), hindsight.text)
    }

    func testUnknownQuestionsAreNotYetConnected() throws {
        let reply = ScriptedAssistant.answer("write me a haiku about SwiftUI", context: try context())
        XCTAssertEqual(reply.text, ScriptedAssistant.notConnected)
        XCTAssertEqual(reply.provenance, .staticValue("scripted stub"))
    }

    func testOfflineAnswersAreHonest() throws {
        let c = try context(connected: false)
        XCTAssertEqual(ScriptedAssistant.answer("daemon?", context: c).text,
                       "The daemon is not connected: offline · [client] transport.connection-failed.")
        XCTAssertTrue(ScriptedAssistant.answer("how many attempts", context: c).text.hasPrefix("I have no attempt list yet"))
        XCTAssertTrue(ScriptedAssistant.answer("projects", context: c).text.hasPrefix("I have no portfolio snapshot yet"))
    }

    @MainActor
    func testChatModelAppendsUserAndAssistantMessages() throws {
        let chat = ChatModel()
        XCTAssertEqual(chat.conversations.map(\.id), ["portfolio", "hindsight", "roam"])
        XCTAssertEqual(chat.selected?.messages.count, 1, "the greeting")
        chat.draft = "  how many attempts?  "
        let reply = chat.send(chat.draft, context: try context())
        XCTAssertNotNil(reply)
        XCTAssertEqual(chat.selected?.messages.count, 3)
        XCTAssertEqual(chat.selected?.messages[1].role, .user)
        XCTAssertEqual(chat.selected?.messages[1].text, "how many attempts?")
        XCTAssertEqual(chat.selected?.messages[2].role, .assistant)
        XCTAssertEqual(chat.selected?.messages[2].provenance, .live("attempt.list"))
        XCTAssertEqual(chat.draft, "")
        XCTAssertNil(chat.send("   ", context: try context()), "blank sends nothing")
        chat.select("roam")
        chat.send("when does roam ship", context: try context())
        XCTAssertEqual(chat.conversations[2].messages.count, 2)
        chat.newConversation(title: "Scratch")
        XCTAssertEqual(chat.conversations.count, 4)
        XCTAssertEqual(chat.selected?.title, "Scratch")
    }
}
