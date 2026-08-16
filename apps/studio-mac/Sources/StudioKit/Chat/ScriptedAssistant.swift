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

public struct ChatMessage: Hashable, Sendable, Identifiable {
    public var id: UUID
    public var role: ChatRole
    public var text: String
    public var at: Date
    public var provenance: Provenance?

    public init(id: UUID = UUID(), role: ChatRole, text: String, at: Date = Date(), provenance: Provenance? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.at = at
        self.provenance = provenance
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

    /// Appends the user's message and the stub's reply. Returns the reply.
    @discardableResult
    public func send(_ text: String, context: AssistantContext) -> AssistantReply? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = conversations.firstIndex(where: { $0.id == selectedId }) else { return nil }
        conversations[index].messages.append(ChatMessage(role: .user, text: trimmed, at: context.now))
        let reply = ScriptedAssistant.answer(trimmed, context: context)
        conversations[index].messages.append(ChatMessage(role: .assistant, text: reply.text, at: context.now, provenance: reply.provenance))
        draft = ""
        return reply
    }
}
