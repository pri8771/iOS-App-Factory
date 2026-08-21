import Foundation

// MARK: - MentionScanner
//
// Pure, side-effect-free text scanning for the composer's `@mention` support (Architecture decision
// 14 / plan item 3). Two independent jobs:
//
//   * `activeToken(in:)` — is the human mid-way through typing an `@word` right now, at the very end
//     of the draft? Drives the participant popover's visibility.
//   * `mentions(in:participants:)` — every `@persona` substring in the draft that names one of the
//     room's *current* participants — the composer-side preview used for the passive "will mention"
//     chips before the message is even posted. The wire's own `RoomChatMessageV1.mentions` (server
//     output, computed once the message is durable) stays the only source of truth once a message is
//     actually in the transcript; this is a client-side echo of the same rule, not a second one.
//
// No `NSTextView`/attributed-text chip composer (plan cut) — the popover/chips this feeds are plain
// SwiftUI overlays, not inline text attachments.
public enum MentionScanner {

    /// The `@word` token the human is actively typing at the very end of the draft.
    public struct ActiveToken: Hashable, Sendable {
        /// The token's range in the draft, `@` through the end — replace this range to complete it.
        public var range: Range<String.Index>
        /// Everything after the `@`, unlowercased (matching is caller's job — see `matches(_:in:)`).
        public var query: String

        public init(range: Range<String.Index>, query: String) {
            self.range = range
            self.query = query
        }
    }

    /// `nil` unless the draft ends in an `@` (optionally followed by more `@`-token characters) that
    /// is not yet closed by whitespace — i.e. the human is typing it right now — and that `@` starts
    /// a token (draft start, or preceded by whitespace) rather than sitting mid-word (an email-shaped
    /// `foo@bar` is never a mention).
    public static func activeToken(in draft: String) -> ActiveToken? {
        guard let atIndex = draft.lastIndex(of: "@") else { return nil }
        let after = draft[draft.index(after: atIndex)...]
        guard !after.contains(where: { $0.isWhitespace }) else { return nil }
        if atIndex != draft.startIndex {
            let before = draft.index(before: atIndex)
            guard draft[before].isWhitespace else { return nil }
        }
        return ActiveToken(range: atIndex..<draft.endIndex, query: String(after))
    }

    /// Replaces the active token (if any) with `@persona ` (a trailing space, so typing continues
    /// past the completed mention). Returns `draft` unchanged when there is no active token.
    public static func completing(_ draft: String, with persona: String) -> String {
        guard let token = activeToken(in: draft) else { return draft }
        return draft.replacingCharacters(in: token.range, with: "@\(persona) ")
    }

    /// Ranked participant matches for the popover: every participant whose persona or display name
    /// starts with `query` (case-insensitive), roster order; an empty query returns the whole roster
    /// (the "just typed `@`" state), also roster order.
    public static func matches(_ query: String, participants: [RoomParticipant]) -> [RoomParticipant] {
        let ordered = participants.sorted { $0.position < $1.position }
        guard !query.isEmpty else { return ordered }
        let needle = query.lowercased()
        return ordered.filter {
            $0.persona.rawValue.lowercased().hasPrefix(needle) || $0.displayName.lowercased().hasPrefix(needle)
        }
    }

    /// Every `@persona` substring in `draft` that names one of `participants`, in first-appearance
    /// order, deduplicated. A candidate token is bounded like `activeToken`'s `@` (draft start or
    /// preceded by whitespace) and made only of `RoomPersonaRule` characters, so `@Claude` (wrong
    /// case) or `user@example.com` never match — mirrors the wire's own persona pattern rather than
    /// guessing a looser one.
    public static func mentions(in draft: String, participants: [RoomParticipant]) -> [RoomPersona] {
        guard !participants.isEmpty else { return [] }
        let personas = Set(participants.map(\.persona))
        var found: [RoomPersona] = []
        var seen = Set<RoomPersona>()
        var index = draft.startIndex
        while let atIndex = draft[index...].firstIndex(of: "@") {
            let boundaryOK = atIndex == draft.startIndex || draft[draft.index(before: atIndex)].isWhitespace
            var cursor = draft.index(after: atIndex)
            while cursor < draft.endIndex, isPersonaCharacter(draft[cursor]) {
                cursor = draft.index(after: cursor)
            }
            if boundaryOK, cursor > draft.index(after: atIndex) {
                let word = String(draft[draft.index(after: atIndex)..<cursor])
                if let persona = try? RoomPersona(word), personas.contains(persona), !seen.contains(persona) {
                    seen.insert(persona)
                    found.append(persona)
                }
            }
            index = cursor > atIndex ? cursor : draft.index(after: atIndex)
        }
        return found
    }

    /// `RoomPersonaRule`'s own alphabet (`[a-z0-9-]`) minus the required leading letter, which the
    /// boundary check above already anchors at `atIndex + 1`.
    private static func isPersonaCharacter(_ c: Character) -> Bool {
        (c.isASCII && c.isLowercase) || c.isNumber || c == "-"
    }
}
