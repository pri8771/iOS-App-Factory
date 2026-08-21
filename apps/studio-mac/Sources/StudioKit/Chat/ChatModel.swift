import Foundation
import Observation

// MARK: - ChatThreadItem
//
// What one row of a chat thread renders (Architecture decision 14). A thread is a room's transcript
// (`RoomMessage`, server truth, durable) plus purely client-local overlay items anchored to the
// sequence of the message that triggered them — never written back to the daemon, never counted as
// part of the transcript itself (see `IntentCard`'s "not in transcript" caption in ChatViews.swift).
//
//   * `.room` — a real `RoomMessage` (human/agent chat line or a moderator system line).
//   * `.intentCard` — `IntentRecognizer` matched the human's posted text and `studio.assistant.intent
//     .propose` returned a real intent to confirm.
//   * `.systemNote` — the intent side of the pipeline (not the room post, which already went through
//     either way) came back honestly empty-handed: no backend, an unsupported daemon, or a propose
//     failure. Replaces the deleted `ScriptedAssistant` fallback, which used to fabricate a scripted
//     reply for exactly this case.
public enum ChatThreadItem: Hashable, Sendable, Identifiable {
    case room(RoomMessage)
    case intentCard(id: UUID, anchorSequence: Int, card: IntentCard)
    case systemNote(id: UUID, anchorSequence: Int, text: String)

    public var id: String {
        switch self {
        case .room(let message): return "room-\(message.id.rawValue)"
        case .intentCard(let id, _, _): return "card-\(id.uuidString)"
        case .systemNote(let id, _, _): return "note-\(id.uuidString)"
        }
    }

    /// Sort key: primary on the anchor sequence (a room message's own `sequence`, or the sequence an
    /// overlay item was anchored to); a room message at sequence N sorts before an overlay item
    /// anchored at that same N, so the card/note that resulted from posting a message always renders
    /// directly after it, never before.
    var sortKey: (Int, Int) {
        switch self {
        case .room(let message): return (message.sequence, 0)
        case .intentCard(_, let anchor, _): return (anchor, 1)
        case .systemNote(_, let anchor, _): return (anchor, 1)
        }
    }
}

/// A daemon-proposed intent, embedded in the thread as a confirmation card — gold, because executing
/// it is the human's decision, never the machine's.
public struct IntentCard: Hashable, Sendable {
    public enum Status: Hashable, Sendable {
        case pending
        case executing
        case executed(summary: String)
        case failed(String)
        case cancelled
    }

    public var intent: AssistantIntent
    public var status: Status

    public init(intent: AssistantIntent, status: Status = .pending) {
        self.intent = intent
        self.status = status
    }
}

// MARK: - ChatModel
//
// As of Wave 9b, "conversations" are direct rooms (Architecture decision 1) and `RoomsModel` already
// owns every room's transcript, posting, and polling — there is no more client-local `Conversation`/
// `ChatMessage` storage here (the 3 hardcoded seed conversations and the `ScriptedAssistant` runtime
// fallback are both deleted, per Architecture decision 14). What is left is exactly the intent overlay
// described on `ChatThreadItem` above, keyed per room so more than one room's overlay can be live at
// once (e.g. a background room and the one currently on screen).
@Observable
@MainActor
public final class ChatModel {

    private var cardsByRoom: [RoomID: [ChatThreadItem]] = [:]

    public init() {}

    /// `messages` (a room's transcript, as loaded by `RoomsModel`) merged with this room's local
    /// overlay items, in render order (see `ChatThreadItem.sortKey`).
    public func threadItems(roomId: RoomID, messages: [RoomMessage]) -> [ChatThreadItem] {
        var items: [ChatThreadItem] = messages.map { .room($0) }
        items.append(contentsOf: cardsByRoom[roomId] ?? [])
        return items.sorted { $0.sortKey < $1.sortKey }
    }

    /// Posts the room's current draft (via `RoomsModel.send`, never duplicated here), then — only if
    /// the text matches a phrasing `IntentRecognizer` recognizes — also proposes that intent and
    /// overlays the result: a confirmation card on success, an honest "assistant unavailable" note on
    /// a `nil` backend or a failed proposal. The room post itself already happened either way; this
    /// only ever adds an overlay item, never blocks or reverts the post.
    @discardableResult
    public func send(_ roomId: RoomID, rooms: RoomsModel, backend: AssistantBackend?) async -> RoomChatMessage? {
        let text = (rooms.drafts[roomId] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        guard let posted = await rooms.send(roomId) else { return nil }
        if let payload = IntentRecognizer.recognize(text) {
            guard let backend else {
                appendNote(roomId, anchor: posted.sequence, text: "no daemon connection")
                return posted
            }
            switch await backend.proposeIntent(text, payload) {
            case .success(let intent):
                appendCard(roomId, anchor: posted.sequence, card: IntentCard(intent: intent))
            case .failure(let error):
                appendNote(roomId, anchor: posted.sequence, text: error.description)
            }
        }
        return posted
    }

    private func appendCard(_ roomId: RoomID, anchor: Int, card: IntentCard) {
        cardsByRoom[roomId, default: []].append(.intentCard(id: UUID(), anchorSequence: anchor, card: card))
    }

    private func appendNote(_ roomId: RoomID, anchor: Int, text: String) {
        cardsByRoom[roomId, default: []].append(.systemNote(id: UUID(), anchorSequence: anchor, text: text))
    }

    private func cardIndex(_ roomId: RoomID, cardId: UUID) -> Int? {
        cardsByRoom[roomId]?.firstIndex {
            if case .intentCard(let id, _, _) = $0 { return id == cardId }
            return false
        }
    }

    /// The human declines the proposed intent — never executed.
    public func cancelIntent(_ roomId: RoomID, cardId: UUID) {
        guard var list = cardsByRoom[roomId], let index = cardIndex(roomId, cardId: cardId),
              case .intentCard(let id, let anchor, var card) = list[index] else { return }
        card.status = .cancelled
        list[index] = .intentCard(id: id, anchorSequence: anchor, card: card)
        cardsByRoom[roomId] = list
    }

    /// The human confirms: calls `studio.assistant.intent.execute` and records the outcome (the
    /// resulting attempt id when the outcome has one) on the same card. Returns the outcome so a
    /// caller can react further — most notably, `propose-plan`/`execute-plan` outcomes carry a
    /// `ProjectPlan` the caller opens the planner on (see `outcome.plan`).
    @discardableResult
    public func confirmIntent(_ roomId: RoomID, cardId: UUID, backend: AssistantBackend) async -> AssistantIntentExecutionOutcome? {
        guard var list = cardsByRoom[roomId], let index = cardIndex(roomId, cardId: cardId),
              case .intentCard(let id, let anchor, var card) = list[index] else { return nil }
        card.status = .executing
        list[index] = .intentCard(id: id, anchorSequence: anchor, card: card)
        cardsByRoom[roomId] = list

        let result = await backend.executeIntent(card.intent)
        guard var list2 = cardsByRoom[roomId], let index2 = cardIndex(roomId, cardId: cardId),
              case .intentCard(_, let anchor2, var card2) = list2[index2] else { return nil }
        switch result {
        case .success(let outcome):
            let summary = outcome.attemptId.map { "attempt \($0.rawValue)" } ?? outcome.plan.map { "plan \($0.brief.title)" } ?? "done"
            card2.status = .executed(summary: summary)
            list2[index2] = .intentCard(id: cardId, anchorSequence: anchor2, card: card2)
            cardsByRoom[roomId] = list2
            return outcome
        case .failure(let error):
            card2.status = .failed(error.description)
            list2[index2] = .intentCard(id: cardId, anchorSequence: anchor2, card: card2)
            cardsByRoom[roomId] = list2
            return nil
        }
    }
}
