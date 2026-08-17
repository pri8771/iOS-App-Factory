import Foundation

// MARK: - ScriptedAssistant
//
// A STUB, and it says so. Phase 1 has no assistant behind the chat: this answers a handful of
// question shapes from live daemon data (attempt counts and states, blocked work, projects, daemon
// status) and answers "not yet connected" to everything else. It never invents a date, a number, or
// an intent. Replaced by the studio service's assistant in phase 2/3.

public struct AssistantContext: Sendable {
    public var link: String
    public var doctor: DoctorResult?
    public var portfolio: PortfolioReadModel?
    public var attempts: [AttemptListItem]?
    public var timeline: TimelineFixture?
    public var now: Date

    public init(link: String, doctor: DoctorResult? = nil, portfolio: PortfolioReadModel? = nil,
                attempts: [AttemptListItem]? = nil, timeline: TimelineFixture? = nil, now: Date = Date()) {
        self.link = link
        self.doctor = doctor
        self.portfolio = portfolio
        self.attempts = attempts
        self.timeline = timeline
        self.now = now
    }
}

public struct AssistantReply: Hashable, Sendable {
    public var text: String
    public var provenance: Provenance

    public init(_ text: String, _ provenance: Provenance) {
        self.text = text
        self.provenance = provenance
    }
}

public enum ScriptedAssistant {
    public static let name = "scripted stub"
    public static let notConnected = "Not yet connected. In phase 1 I only answer from live daemon data — attempt counts and states, blocked work, projects, and daemon status. Ask one of those; the real assistant arrives with the studio service."

    public static func answer(_ question: String, context: AssistantContext) -> AssistantReply {
        let q = question.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return AssistantReply(notConnected, .staticValue(name)) }

        // Ship dates first: they must never be guessed, whatever else the question mentions.
        if q.contains("when") && (q.contains("ship") || q.contains("release") || q.contains("launch") || q.contains("done")) {
            return shipDate(q, context: context)
        }
        if q.contains("daemon") || q.contains("connected") || q.contains("online") || q.contains("offline") || q == "status" {
            return daemon(context)
        }
        if q.contains("blocked") || q.contains("waiting") || q.contains("awaiting") || q.contains("gate") {
            return blocked(context)
        }
        if q.contains("verified") {
            return verified(context)
        }
        if let project = matchProject(q, context: context) {
            return projectSummary(project, context: context)
        }
        if q.contains("attempt") || q.contains("run") {
            return attempts(context)
        }
        if q.contains("project") || q.contains("portfolio") {
            return projects(context)
        }
        return AssistantReply(notConnected, .staticValue(name))
    }

    // MARK: Answers

    static func daemon(_ c: AssistantContext) -> AssistantReply {
        guard let doctor = c.doctor else {
            return AssistantReply("The daemon is not connected: \(c.link).", .derived("doctor"))
        }
        var text = "Daemon \(doctor.daemonVersion) is \(doctor.readiness.rawValue) (protocol v\(doctor.protocolVersion), started \(doctor.startedAt.rawValue))."
        if !doctor.issues.isEmpty { text += " Issues: " + doctor.issues.joined(separator: "; ") + "." }
        return AssistantReply(text, .live("doctor"))
    }

    static func attempts(_ c: AssistantContext) -> AssistantReply {
        guard let attempts = c.attempts else {
            return AssistantReply("I have no attempt list yet — the daemon is \(c.doctor == nil ? "offline" : "still loading").", .derived("attempt.list"))
        }
        if attempts.isEmpty { return AssistantReply("The daemon has no attempts on record.", .live("attempt.list")) }
        var counts: [AttemptState: Int] = [:]
        for item in attempts { counts[item.attempt.state, default: 0] += 1 }
        let breakdown = AttemptState.allCases.compactMap { state -> String? in
            guard let n = counts[state], n > 0 else { return nil }
            return "\(n) \(state.rawValue)"
        }.joined(separator: ", ")
        let latest = attempts.max { ($0.attempt.updatedAt.rawValue) < ($1.attempt.updatedAt.rawValue) }
        var text = "\(attempts.count) attempt\(attempts.count == 1 ? "" : "s") on record: \(breakdown)."
        if let latest { text += " Latest: “\(latest.title)” (\(latest.attempt.state.rawValue), \(latest.attempt.updatedAt.rawValue))." }
        return AssistantReply(text, .live("attempt.list"))
    }

    static func blocked(_ c: AssistantContext) -> AssistantReply {
        var lines: [String] = []
        if let attempts = c.attempts {
            let blocked = attempts.filter { $0.attempt.state == .blocked }
            if blocked.isEmpty {
                lines.append("Nothing is blocked in the daemon.")
            } else {
                lines.append("\(blocked.count) blocked attempt\(blocked.count == 1 ? "" : "s"):")
                for item in blocked {
                    let why = item.attempt.blocker.map { " — \($0.summary)" } ?? ""
                    lines.append("• \(item.title)\(why)")
                }
            }
        } else {
            lines.append("I have no attempt list yet, so I can't say what's blocked in the daemon.")
        }
        let gates = (c.timeline?.projects ?? []).flatMap { row in row.waitingGates.map { "\(row.name) · \($0.label) (\($0.start.shortLabel))" } }
        if !gates.isEmpty {
            lines.append("From the timeline fixture (not the daemon): \(gates.count) gate\(gates.count == 1 ? "" : "s") waiting on you — " + gates.joined(separator: "; ") + ".")
        }
        return AssistantReply(lines.joined(separator: "\n"), c.attempts == nil ? .fixture(TimelineFixture.provenanceNote) : .live("attempt.list"))
    }

    static func verified(_ c: AssistantContext) -> AssistantReply {
        guard let attempts = c.attempts else {
            return AssistantReply("I have no attempt list yet, so I can't count verified runs.", .derived("attempt.list · 7d"))
        }
        let since = c.now.addingTimeInterval(-7 * 24 * 3600)
        let verified = attempts.filter { item in
            item.attempt.state == .succeeded && (item.attempt.terminalAt?.date.map { $0 >= since } ?? false)
        }
        return AssistantReply("\(verified.count) attempt\(verified.count == 1 ? "" : "s") succeeded in the last 7 days.", .derived("attempt.list · 7d"))
    }

    static func projects(_ c: AssistantContext) -> AssistantReply {
        guard let portfolio = c.portfolio else {
            return AssistantReply("I have no portfolio snapshot yet — the daemon is \(c.doctor == nil ? "offline" : "still loading").", .derived("portfolio.snapshot"))
        }
        let names = portfolio.projects.map { p in
            "\(p.displayName) (\(p.lifecycleStage?.rawValue ?? "no stage"), \(p.attemptCount) attempt\(p.attemptCount == 1 ? "" : "s"), \(p.health.rawValue))"
        }
        return AssistantReply("\(portfolio.totals.projects) project\(portfolio.totals.projects == 1 ? "" : "s") in the daemon: " + names.joined(separator: "; ") + ".",
                              .live("portfolio.snapshot"))
    }

    static func matchProject(_ q: String, context c: AssistantContext) -> (slug: String, name: String)? {
        var candidates: [(String, String)] = []
        for p in c.portfolio?.projects ?? [] { candidates.append((p.slug.rawValue, p.displayName)) }
        for row in c.timeline?.projects ?? [] where !candidates.contains(where: { $0.0 == row.slug }) {
            candidates.append((row.slug, row.name))
        }
        let words = Set(q.split(whereSeparator: { !$0.isLetter && !$0.isNumber && $0 != "-" }).map(String.init))
        return candidates.first { slug, name in
            words.contains(slug) || words.contains(name.lowercased()) || q.contains(name.lowercased())
        }
    }

    static func projectSummary(_ project: (slug: String, name: String), context c: AssistantContext) -> AssistantReply {
        var lines: [String] = []
        var provenance = Provenance.notYetSourced
        if let live = c.portfolio?.projects.first(where: { $0.slug.rawValue == project.slug }) {
            var bits = ["\(live.attemptCount) attempt\(live.attemptCount == 1 ? "" : "s")", "\(live.activeAttemptCount) active",
                        "\(live.blockerCount) blocker\(live.blockerCount == 1 ? "" : "s")", "health \(live.health.rawValue)"]
            if let stage = live.lifecycleStage { bits.insert("stage \(stage.rawValue)", at: 0) }
            lines.append("\(live.displayName): " + bits.joined(separator: ", ") + ".")
            provenance = .live("portfolio.snapshot")
        } else {
            lines.append("The daemon has no record of \(project.name).")
        }
        if let row = c.timeline?.projects.first(where: { $0.slug == project.slug }) {
            let done = row.doneCount
            var text = "Timeline fixture (not the daemon): \(row.name) has \(done) of \(row.lifecycle.count) lifecycle steps done"
            if let note = row.note { text += " — \(note)" }
            if !row.waitingGates.isEmpty { text += ". Waiting on you: " + row.waitingGates.map(\.label).joined(separator: ", ") }
            lines.append(text + ".")
            if !provenance.isLive { provenance = .fixture(TimelineFixture.provenanceNote) }
        }
        return AssistantReply(lines.joined(separator: "\n"), provenance)
    }

    static func shipDate(_ q: String, context c: AssistantContext) -> AssistantReply {
        var text = "No date I can back up. The daemon has no planned-date source yet (no milestones schema), and I won't guess."
        if let project = matchProject(q, context: c), let row = c.timeline?.projects.first(where: { $0.slug == project.slug }) {
            let plans = row.bars.filter { $0.kind == .plan }
            if let note = row.note { text += "\nWhat I do know about \(row.name): \(note)." }
            if let first = plans.first {
                text += " The timeline fixture pencils “\(first.label)” at \(first.start.shortLabel) — a fixture, not a commitment."
            }
        }
        return AssistantReply(text, .staticValue("no planned-date source"))
    }
}

// MARK: - Chat model

public enum ChatRole: Hashable, Sendable { case user, assistant }

/// A daemon-proposed intent, embedded in an assistant message as a confirmation card — gold, because
/// executing it is the human's decision, never the machine's.
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

public struct ChatMessage: Hashable, Sendable, Identifiable {
    public var id: UUID
    public var role: ChatRole
    public var text: String
    public var at: Date
    public var provenance: Provenance?
    /// Citations for an "answered" daemon reply (`AssistantAnswer.answered`) — rendered as small chips.
    public var citations: [AssistantCitation]
    /// True for a reply from `ScriptedAssistant` — the honest STUB label; false for a real daemon
    /// assistant reply (`studio.assistant.query`).
    public var isStub: Bool
    /// Set when this message is a pending/settled intent confirmation card rather than plain text.
    public var intentCard: IntentCard?

    public init(id: UUID = UUID(), role: ChatRole, text: String, at: Date = Date(), provenance: Provenance? = nil,
                citations: [AssistantCitation] = [], isStub: Bool = false, intentCard: IntentCard? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.at = at
        self.provenance = provenance
        self.citations = citations
        self.isStub = isStub
        self.intentCard = intentCard
    }
}

public struct Conversation: Hashable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var messages: [ChatMessage]

    public init(id: String, title: String, messages: [ChatMessage] = []) {
        self.id = id
        self.title = title
        self.messages = messages
    }
}

/// Local, in-memory conversations. Phase 1 has no persistence and no rooms; the switcher exists so
/// the shell has the right shape.
@Observable
@MainActor
public final class ChatModel {
    public private(set) var conversations: [Conversation]
    public var selectedId: String
    public var draft: String = ""

    public init(conversations: [Conversation]? = nil) {
        let initial = conversations ?? [
            Conversation(id: "portfolio", title: "Portfolio", messages: [
                ChatMessage(role: .assistant,
                            text: "Scripted stub. Ask about attempts, what's blocked, a project by name, or the daemon. Anything else gets an honest “not yet connected”.",
                            provenance: .staticValue(ScriptedAssistant.name)),
            ]),
            Conversation(id: "hindsight", title: "Hindsight"),
            Conversation(id: "roam", title: "Roam"),
        ]
        self.conversations = initial
        self.selectedId = initial.first?.id ?? "portfolio"
    }

    public var selected: Conversation? { conversations.first { $0.id == selectedId } }

    public func select(_ id: String) { selectedId = id }

    public func newConversation(title: String) {
        let id = "conv-\(UUID().uuidString.lowercased().prefix(8))"
        conversations.append(Conversation(id: id, title: title))
        selectedId = id
    }

    /// Appends the user's message and the assistant's reply, then returns the reply.
    ///
    /// With no `backend` (or on a real daemon call falling back — see `AssistantQueryOutcome`) this
    /// is `ScriptedAssistant`, tagged STUB. With a `backend`, an utterance `IntentRecognizer`
    /// recognizes proposes an intent (rendered as a confirmation card via `confirmIntent`/
    /// `cancelIntent`); anything else asks `studio.assistant.query` and renders `AssistantAnswer`
    /// (citations as chips for `answered`, an honest line for `cannot-answer`).
    @discardableResult
    public func send(_ text: String, context: AssistantContext, backend: AssistantBackend? = nil) async -> AssistantReply? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = conversations.firstIndex(where: { $0.id == selectedId }) else { return nil }
        conversations[index].messages.append(ChatMessage(role: .user, text: trimmed, at: context.now))
        draft = ""

        guard let backend else {
            let reply = ScriptedAssistant.answer(trimmed, context: context)
            appendStub(reply, at: context.now)
            return reply
        }

        if let payload = IntentRecognizer.recognize(trimmed) {
            switch await backend.proposeIntent(trimmed, payload) {
            case .success(let intent):
                guard let i = conversations.firstIndex(where: { $0.id == selectedId }) else { return nil }
                conversations[i].messages.append(ChatMessage(role: .assistant, text: intent.summary, at: context.now,
                                                              provenance: .live("studio.assistant.intent.propose"),
                                                              intentCard: IntentCard(intent: intent)))
                return AssistantReply(intent.summary, .live("studio.assistant.intent.propose"))
            case .failure:
                let reply = ScriptedAssistant.answer(trimmed, context: context)
                appendStub(reply, at: context.now)
                return reply
            }
        }

        switch await backend.query(trimmed, nil) {
        case .answer(.answered(let text, let citations)):
            guard let i = conversations.firstIndex(where: { $0.id == selectedId }) else { return nil }
            let provenance = Provenance.live("studio.assistant.query")
            conversations[i].messages.append(ChatMessage(role: .assistant, text: text, at: context.now, provenance: provenance,
                                                          citations: citations))
            return AssistantReply(text, provenance)
        case .answer(.cannotAnswer(let reason, let detail)):
            guard let i = conversations.firstIndex(where: { $0.id == selectedId }) else { return nil }
            let text = "Can't answer that: \(detail) (\(reason.rawValue))"
            let provenance = Provenance.live("studio.assistant.query")
            conversations[i].messages.append(ChatMessage(role: .assistant, text: text, at: context.now, provenance: provenance))
            return AssistantReply(text, provenance)
        case .unsupported, .failed:
            let reply = ScriptedAssistant.answer(trimmed, context: context)
            appendStub(reply, at: context.now)
            return reply
        }
    }

    private func appendStub(_ reply: AssistantReply, at: Date) {
        guard let index = conversations.firstIndex(where: { $0.id == selectedId }) else { return }
        conversations[index].messages.append(ChatMessage(role: .assistant, text: reply.text, at: at,
                                                          provenance: reply.provenance, isStub: true))
    }

    private func location(of messageId: UUID) -> (conversation: Int, message: Int)? {
        for (ci, conversation) in conversations.enumerated() {
            if let mi = conversation.messages.firstIndex(where: { $0.id == messageId }) { return (ci, mi) }
        }
        return nil
    }

    /// The human declines the proposed intent — never executed.
    public func cancelIntent(_ messageId: UUID) {
        guard let (ci, mi) = location(of: messageId), var card = conversations[ci].messages[mi].intentCard else { return }
        card.status = .cancelled
        conversations[ci].messages[mi].intentCard = card
    }

    /// The human confirms: calls `studio.assistant.intent.execute` and records the outcome (the
    /// resulting attempt id when the outcome has one) on the same card. Returns the outcome so a
    /// caller can react to it further — most notably, `propose-plan`/`execute-plan` outcomes carry a
    /// `ProjectPlan` the confirmation card's caller opens the planner on (see `outcome.plan`).
    @discardableResult
    public func confirmIntent(_ messageId: UUID, backend: AssistantBackend) async -> AssistantIntentExecutionOutcome? {
        guard let (ci, mi) = location(of: messageId), var card = conversations[ci].messages[mi].intentCard else { return nil }
        card.status = .executing
        conversations[ci].messages[mi].intentCard = card
        let result = await backend.executeIntent(card.intent)
        guard let (ci2, mi2) = location(of: messageId) else { return nil }
        var updated = conversations[ci2].messages[mi2].intentCard ?? card
        switch result {
        case .success(let outcome):
            updated.status = .executed(summary: outcome.attemptId.map { "attempt \($0.rawValue)" } ?? outcome.plan.map { "plan \($0.brief.title)" } ?? "done")
            conversations[ci2].messages[mi2].intentCard = updated
            return outcome
        case .failure(let error):
            updated.status = .failed(error.description)
            conversations[ci2].messages[mi2].intentCard = updated
            return nil
        }
    }
}
