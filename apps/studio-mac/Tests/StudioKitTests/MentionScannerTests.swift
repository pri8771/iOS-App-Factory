import Foundation
@testable import StudioKit
import XCTest

final class MentionScannerTests: XCTestCase {

    private func participant(_ persona: String, _ displayName: String, position: Int = 0) throws -> RoomParticipant {
        RoomParticipant(persona: try RoomPersona(persona), provider: try RoomProvider(persona), displayName: displayName,
                        position: position, benchedUntil: nil, benchReason: nil)
    }

    // MARK: activeToken

    func testActiveTokenAtEndOfDraft() {
        let token = MentionScanner.activeToken(in: "hey @cl")
        XCTAssertEqual(token?.query, "cl")
    }

    func testActiveTokenAtStartOfDraft() {
        let token = MentionScanner.activeToken(in: "@")
        XCTAssertEqual(token?.query, "")
    }

    func testNoActiveTokenWithoutAnAtSign() {
        XCTAssertNil(MentionScanner.activeToken(in: "hello there"))
    }

    func testNoActiveTokenOnceClosedByWhitespace() {
        XCTAssertNil(MentionScanner.activeToken(in: "hey @claude how are you"), "the @claude token was already closed by a space")
    }

    func testNoActiveTokenOnceClosedByNewline() {
        XCTAssertNil(MentionScanner.activeToken(in: "hey @claude\n"))
    }

    func testNoActiveTokenMidWordEmailShaped() {
        XCTAssertNil(MentionScanner.activeToken(in: "user@example.com"), "an '@' not preceded by whitespace or the draft start is never a mention")
    }

    func testActiveTokenAfterCompletedMentionStartsFresh() {
        // A second '@' after a completed mention: only the trailing one is active.
        let token = MentionScanner.activeToken(in: "@claude hi @co")
        XCTAssertEqual(token?.query, "co")
    }

    func testActiveTokenRangeCoversFromAtSignToEnd() {
        let draft = "hey @cl"
        let token = try! XCTUnwrap(MentionScanner.activeToken(in: draft))
        XCTAssertEqual(draft[token.range], "@cl")
    }

    // MARK: completing

    func testCompletingReplacesTheActiveTokenWithATrailingSpace() {
        XCTAssertEqual(MentionScanner.completing("hey @cl", with: "claude"), "hey @claude ")
    }

    func testCompletingAtDraftStart() {
        XCTAssertEqual(MentionScanner.completing("@", with: "codex"), "@codex ")
    }

    func testCompletingWithNoActiveTokenReturnsTheDraftUnchanged() {
        XCTAssertEqual(MentionScanner.completing("hello there", with: "claude"), "hello there")
    }

    func testCompletingPreservesTextBeforeTheToken() {
        XCTAssertEqual(MentionScanner.completing("plan the launch, @cl", with: "claude"), "plan the launch, @claude ")
    }

    // MARK: matches

    func testMatchesFiltersByPersonaOrDisplayNamePrefixCaseInsensitively() throws {
        let claude = try participant("claude", "Claude", position: 0)
        let codex = try participant("codex", "Codex", position: 1)
        let ollama = try participant("ollama", "Ollama", position: 2)
        let matches = MentionScanner.matches("cl", participants: [claude, codex, ollama])
        XCTAssertEqual(matches.map(\.persona.rawValue), ["claude"])
    }

    func testMatchesOnDisplayNamePrefix() throws {
        let researcher = try participant("openrouter-fast", "Research assistant")
        let matches = MentionScanner.matches("research", participants: [researcher])
        XCTAssertEqual(matches.map(\.persona.rawValue), ["openrouter-fast"])
    }

    func testEmptyQueryReturnsEveryParticipantInRosterOrder() throws {
        let second = try participant("ollama", "Ollama", position: 2)
        let first = try participant("claude", "Claude", position: 0)
        let matches = MentionScanner.matches("", participants: [second, first])
        XCTAssertEqual(matches.map(\.persona.rawValue), ["claude", "ollama"], "sorted by roster position, not input order")
    }

    func testNoMatchesReturnsEmpty() throws {
        let claude = try participant("claude", "Claude")
        XCTAssertTrue(MentionScanner.matches("zzz", participants: [claude]).isEmpty)
    }

    // MARK: mentions

    func testMentionsFindsEveryKnownPersonaMentioned() throws {
        let claude = try participant("claude", "Claude")
        let codex = try participant("codex", "Codex")
        let found = MentionScanner.mentions(in: "hey @claude and @codex, take a look", participants: [claude, codex])
        XCTAssertEqual(found.map(\.rawValue), ["claude", "codex"], "first-appearance order")
    }

    func testMentionsIgnoresAPersonaNotInTheRoom() throws {
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "hey @gemini", participants: [claude])
        XCTAssertTrue(found.isEmpty, "gemini isn't a participant in this room")
    }

    func testMentionsDeduplicatesRepeatedMentions() throws {
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "@claude ping. @claude ping again.", participants: [claude])
        XCTAssertEqual(found, [try RoomPersona("claude")])
    }

    func testMentionsIgnoresEmailShapedAtSigns() throws {
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "email me at user@claude.example, not a mention", participants: [claude])
        XCTAssertTrue(found.isEmpty)
    }

    func testMentionsIgnoresWrongCase() throws {
        // `RoomPersona` itself only accepts lowercase — an uppercase token can never construct one,
        // so it can never match, mirroring the wire's own persona pattern.
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "hey @Claude", participants: [claude])
        XCTAssertTrue(found.isEmpty)
    }

    func testMentionsAtTheVeryStartOfTheDraft() throws {
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "@claude what do you think?", participants: [claude])
        XCTAssertEqual(found, [try RoomPersona("claude")])
    }

    func testMentionsWithNoParticipantsIsAlwaysEmpty() {
        XCTAssertTrue(MentionScanner.mentions(in: "@claude", participants: []).isEmpty)
    }

    func testMentionsHandlesAnActiveUnclosedTokenToo() throws {
        // `mentions` isn't gated on the token being "closed" — a fully-typed trailing mention still
        // counts once it exactly names a participant.
        let claude = try participant("claude", "Claude")
        let found = MentionScanner.mentions(in: "hey @claude", participants: [claude])
        XCTAssertEqual(found, [try RoomPersona("claude")])
    }
}
