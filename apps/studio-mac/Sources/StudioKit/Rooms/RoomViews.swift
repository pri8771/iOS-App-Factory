import SwiftUI

// MARK: - Room views
//
// `RoomMessageRow` renders one `RoomMessage` (message-transcript.md: human = gold, agent = cyan +
// persona/provider, system = muted italic, `agent-error` = a typed chip that is NEVER silence,
// `agent-passed` = a muted "— persona passed —" line); `@persona` mentions inside a chat bubble are
// highlighted from the message's own (server-truth) `mentions` field. `RoomTranscriptView` is the
// scroll + composer, shared by the full chat screen and the corner popup — as of Wave 9b it is THE
// chat surface (both "conversations" and "rooms" are rooms, Architecture decision 1), rendering
// `ChatModel.threadItems` (the transcript plus any local intent-card/system-note overlay — Architecture
// decision 14) rather than raw `RoomMessage`s, and owns the `@mention` popover (Architecture decision
// 14) plus the ambient toggle / rename / archive affordances (plan item 5) by calling straight into
// `RoomsModel` — no extra closures threaded through the screen. `RoomRosterPanel` is the right-side
// instrument: roster with live state, the budget meter, the mode line, and (multi rooms only) an "add
// participant" list sourced from `room.participants.list`. `NewRoomSheet` creates a room.

private func roomTimeString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    formatter.timeZone = .current
    return formatter.string(from: date)
}

private struct RoomAvatar: View {
    var role: HUDRole
    var initial: String

    var body: some View {
        ZStack {
            Circle().fill(role.fill)
            Circle().stroke(role.stroke, lineWidth: 1)
            Text(initial)
                .font(HUDTypography.monoLabel)
                .foregroundStyle(role.color)
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}

public struct RoomMessageRow: View {
    public var message: RoomMessage
    /// The room record, for participant → displayName/provider lookup. `nil` falls back to the raw
    /// persona key — an honest degrade, not a crash, for a message that outlives its room's cache.
    public var room: Room?

    public init(_ message: RoomMessage, room: Room?) {
        self.message = message
        self.room = room
    }

    private func participant(_ persona: RoomPersona) -> RoomParticipant? {
        room?.participants.first { $0.persona == persona }
    }

    private func displayName(_ persona: RoomPersona) -> String {
        participant(persona)?.displayName ?? persona.rawValue
    }

    public var body: some View {
        switch message {
        case .message(let chat): chatRow(chat)
        case .system(let system): systemRow(system)
        }
    }

    @ViewBuilder
    private func chatRow(_ chat: RoomChatMessage) -> some View {
        switch chat.author {
        case .human(let handle):
            HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                Spacer(minLength: 40)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(handle.rawValue).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.gold)
                    bubble(chat.body, mentions: chat.mentions, role: .human)
                    timestamp(chat.occurredAt)
                }
                RoomAvatar(role: .human, initial: String(handle.rawValue.prefix(1)).uppercased())
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(handle.rawValue): \(chat.body)")
        case .agent(let persona):
            HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                RoomAvatar(role: .machine, initial: String(displayName(persona).prefix(1)).uppercased())
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: HUDTheme.space.xxs) {
                        Text(displayName(persona)).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                            .foregroundStyle(HUDTheme.arc)
                        if let provider = participant(persona)?.provider {
                            Text("·").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.faint)
                            Text(provider.rawValue).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
                        }
                    }
                    bubble(chat.body, mentions: chat.mentions, role: .machine)
                    timestamp(chat.occurredAt)
                }
                Spacer(minLength: 40)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(displayName(persona)): \(chat.body)")
        }
    }

    private func bubble(_ text: String, mentions: [RoomPersona], role: HUDRole) -> some View {
        Text(Self.highlighted(text, mentions: mentions))
            .font(HUDTypography.body)
            .foregroundStyle(HUDTheme.ink)
            .textSelection(.enabled)
            .padding(.horizontal, HUDTheme.space.s)
            .padding(.vertical, HUDTheme.space.xs)
            .background(
                RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                    .fill(role == .human ? HUDTheme.gold.opacity(0.10) : HUDTheme.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                    .stroke(role == .human ? HUDTheme.gold.opacity(0.35) : HUDTheme.hairline, lineWidth: 1)
            )
    }

    /// Highlights every `@persona` occurrence named in `mentions` — server truth
    /// (`RoomChatMessageV1.mentions`), never a client-side re-derivation of who got mentioned.
    static func highlighted(_ text: String, mentions: [RoomPersona]) -> AttributedString {
        var attributed = AttributedString(text)
        guard !mentions.isEmpty else { return attributed }
        for persona in mentions {
            let needle = "@\(persona.rawValue)"
            var searchStart = attributed.startIndex
            while searchStart < attributed.endIndex, let range = attributed[searchStart...].range(of: needle) {
                attributed[range].foregroundColor = HUDTheme.arc
                attributed[range].font = HUDTypography.bodyStrong
                searchStart = range.upperBound
            }
        }
        return attributed
    }

    private func timestamp(_ at: IsoInstant) -> some View {
        Text(at.date.map(roomTimeString) ?? at.rawValue)
            .font(HUDTypography.caption)
            .foregroundStyle(HUDTheme.mute)
    }

    @ViewBuilder
    private func systemRow(_ system: RoomSystemMessage) -> some View {
        switch system.code {
        case .agentPassed:
            Text("— \(system.persona.map(displayName) ?? "agent") passed —")
                .font(HUDTypography.caption).italic()
                .foregroundStyle(HUDTheme.mute)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityLabel("\(system.persona.map(displayName) ?? "agent") passed this round")
        case .agentError:
            errorChip(system)
        default:
            VStack(spacing: 2) {
                if let persona = system.persona {
                    Text(displayName(persona)).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
                }
                Text(system.body)
                    .font(HUDTypography.caption).italic()
                    .foregroundStyle(HUDTheme.mute)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .accessibilityElement(children: .combine)
        }
    }

    /// The one place a typed agent failure renders — a small chip, never silence:
    /// "Claude · benched until 14:05 (rate limit)".
    private func errorChip(_ system: RoomSystemMessage) -> some View {
        let name = system.persona.map(displayName) ?? "agent"
        let errorLabel = system.errorCode?.label ?? "error"
        let text: String
        if let benchedUntil = system.benchedUntil?.date {
            text = "\(name) · benched until \(roomTimeString(benchedUntil)) (\(errorLabel))"
        } else {
            text = "\(name) · \(errorLabel)"
        }
        return HStack {
            Spacer()
            HStack(spacing: HUDTheme.space.xxs) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(HUDTheme.alert)
                    .accessibilityHidden(true)
                Text(text).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.alert)
            }
            .padding(.horizontal, HUDTheme.space.xs)
            .padding(.vertical, 3)
            .background(Capsule().fill(HUDRole.alert.fill))
            .overlay(Capsule().stroke(HUDRole.alert.stroke, lineWidth: 1))
            Spacer()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

// MARK: - Intent-card / system-note overlay row

/// One row of `ChatModel.threadItems`: a real `RoomMessage` renders through `RoomMessageRow`
/// unchanged; the two client-local overlay kinds get their own honest rendering — a gold confirmation
/// card (captioned "not in transcript", since it never becomes a durable `RoomMessage`) or a muted
/// system-style line for a proposal that came back empty-handed instead of the deleted scripted stub.
public struct ChatThreadItemRow: View {
    public var item: ChatThreadItem
    public var room: Room?
    public var onConfirm: (() -> Void)?
    public var onCancel: (() -> Void)?

    public init(_ item: ChatThreadItem, room: Room?, onConfirm: (() -> Void)? = nil, onCancel: (() -> Void)? = nil) {
        self.item = item
        self.room = room
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

    public var body: some View {
        switch item {
        case .room(let message):
            RoomMessageRow(message, room: room)
        case .intentCard(_, _, let card):
            HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: HUDTheme.space.xxs) {
                        HUDLabel("assistant")
                        Text("·").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.faint)
                        Text("studio assistant").font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                            .foregroundStyle(HUDTheme.mute)
                    }
                    IntentConfirmationCard(card: card, onConfirm: onConfirm, onCancel: onCancel)
                    HStack(spacing: HUDTheme.space.xxs) {
                        ProvenanceBadge(.live("studio.assistant.intent.propose"), compact: true)
                        Text("not in transcript — local to this session").font(HUDTypography.caption).foregroundStyle(HUDTheme.faint)
                    }
                }
                Spacer(minLength: 40)
            }
        case .systemNote(_, _, let text):
            Text("assistant unavailable: \(text)")
                .font(HUDTypography.caption).italic()
                .foregroundStyle(HUDTheme.mute)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityLabel("assistant unavailable: \(text)")
        }
    }
}

// MARK: - Transcript + composer

/// The chat surface (Wave 9b): both a "conversation" (a direct room) and a "room" render through this
/// one view. Owns the `@mention` popover, the ambient toggle, and rename/archive — all one-line calls
/// straight into `RoomsModel`, no closures threaded down from the screen.
public struct RoomTranscriptView: View {
    @Bindable public var rooms: RoomsModel
    public var chat: ChatModel
    public var roomId: RoomID
    /// `nil` keeps intent proposal off (no `studio.assistant.*` calls) — the room post itself still
    /// goes through either way; see `ChatModel.send`.
    public var backend: (() -> AssistantBackend?)?
    public var compact: Bool

    @FocusState private var focused: Bool
    @State private var isEditingTitle = false
    @State private var titleDraft = ""

    public init(rooms: RoomsModel, chat: ChatModel, roomId: RoomID, backend: (() -> AssistantBackend?)? = nil, compact: Bool = false) {
        self.rooms = rooms
        self.chat = chat
        self.roomId = roomId
        self.backend = backend
        self.compact = compact
    }

    private var transcript: RoomTranscript { rooms.transcripts[roomId] ?? RoomTranscript() }
    private var room: Room? { rooms.room(roomId) }
    private var threadItems: [ChatThreadItem] { chat.threadItems(roomId: roomId, messages: transcript.messages) }

    public var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: HUDTheme.space.s) {
                        ForEach(threadItems) { item in
                            ChatThreadItemRow(item, room: room, onConfirm: { confirm(item) }, onCancel: { cancel(item) })
                                .id(item.id)
                        }
                        if transcript.messages.isEmpty {
                            Text(emptyStateText)
                                .font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, HUDTheme.space.l)
                        }
                    }
                    .padding(compact ? HUDTheme.space.s : HUDTheme.space.m)
                }
                .onChange(of: threadItems.count) { _, _ in
                    if let last = threadItems.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            composer
        }
    }

    private var emptyStateText: String {
        if let error = rooms.roomErrors[roomId] { return "Couldn't load this room: \(error)" }
        return "No messages yet. Say hello."
    }

    // MARK: Header — title (+ rename), round indicator, ambient toggle (multi rooms only), archive

    private var header: some View {
        HStack(spacing: HUDTheme.space.xs) {
            if let room {
                titleView(room)
                // Typing/round indicator only after a real grant — never speculative.
                if room.roundInProgress {
                    BreathingDot(color: HUDTheme.arc)
                    Text("round in progress").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.arc)
                }
                if let moderator = transcript.moderator, !moderator.enabled {
                    StatusPill(.paused, label: "no agents granted")
                }
                Spacer()
                if room.flavor == .room {
                    ambientToggle(room)
                }
                overflowMenu
            } else {
                Spacer()
            }
            ProvenanceBadge(.live("room.events"), compact: true)
        }
        .padding(.horizontal, compact ? HUDTheme.space.s : HUDTheme.space.m)
        .padding(.vertical, HUDTheme.space.xs)
        .background(HUDTheme.hull)
    }

    @ViewBuilder
    private func titleView(_ room: Room) -> some View {
        if isEditingTitle {
            TextField("Title", text: $titleDraft)
                .textFieldStyle(.plain)
                .font(HUDTypography.displaySubheading)
                .foregroundStyle(HUDTheme.ink)
                .frame(maxWidth: 220)
                .onSubmit { commitRename(room) }
            HUDButton("Save", compact: true, action: { commitRename(room) })
            HUDButton("Cancel", variant: .ghost, compact: true) { isEditingTitle = false }
        } else {
            Text(room.title).font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink).lineLimit(1)
            Button {
                titleDraft = room.title
                isEditingTitle = true
            } label: {
                Image(systemName: "pencil").font(.system(size: 10))
            }
            .buttonStyle(.plain)
            .foregroundStyle(HUDTheme.mute)
            .help("Rename")
            .accessibilityLabel("Rename room")
        }
    }

    private func commitRename(_ room: Room) {
        let trimmed = titleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        isEditingTitle = false
        guard !trimmed.isEmpty, trimmed != room.title else { return }
        Task { await rooms.updateRoom(roomId, patch: RoomUpdatePatch(title: trimmed)) }
    }

    /// Gold — an ambient room lets an agent speak up unprompted, a human decision (Architecture
    /// decision 14 / plan item 5). Forced off server-side for a direct room, so this control is only
    /// ever shown for a multi room in the first place (see `header`).
    private func ambientToggle(_ room: Room) -> some View {
        HStack(spacing: HUDTheme.space.xxs) {
            Text("ambient").font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0).foregroundStyle(HUDTheme.mute)
            Toggle("Ambient", isOn: unattendedBinding(room)).labelsHidden().toggleStyle(.switch).tint(HUDTheme.gold)
        }
        .accessibilityLabel("Ambient — agents may reply while you're away")
        .accessibilityValue(room.unattendedEnabled ? "on" : "off")
    }

    private func unattendedBinding(_ room: Room) -> Binding<Bool> {
        Binding(get: { room.unattendedEnabled },
               set: { newValue in Task { await rooms.setUnattended(roomId, enabled: newValue) } })
    }

    private var overflowMenu: some View {
        Menu {
            Button("Archive", role: .destructive) {
                Task { await rooms.updateRoom(roomId, patch: RoomUpdatePatch(archived: true)) }
            }
        } label: {
            Image(systemName: "ellipsis.circle").font(.system(size: 13))
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(HUDTheme.mute)
        .accessibilityLabel("Room actions")
    }

    // MARK: Composer — draft, `@mention` popover, passive mention chips

    private var composer: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showMentionPopover { mentionPopover }
            if !passiveMentions.isEmpty { mentionChips }
            HStack(spacing: HUDTheme.space.xs) {
                TextField("Message the room…", text: draftBinding, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(HUDTypography.body)
                    .foregroundStyle(HUDTheme.ink)
                    .lineLimit(1...4)
                    .focused($focused)
                    .onSubmit { send() }
                    .onKeyPress(.tab) {
                        guard showMentionPopover, let first = mentionMatches.first else { return .ignored }
                        completeMention(first)
                        return .handled
                    }
                    .accessibilityLabel("Message")
                HUDButton("Send", systemImage: "arrow.up", variant: .arc, compact: true, action: send)
                    .disabled((rooms.drafts[roomId] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
            }
            .padding(compact ? HUDTheme.space.s : HUDTheme.space.m)
        }
        .background(HUDTheme.hull)
    }

    private var activeMentionToken: MentionScanner.ActiveToken? {
        MentionScanner.activeToken(in: rooms.drafts[roomId] ?? "")
    }

    private var mentionMatches: [RoomParticipant] {
        guard let token = activeMentionToken, let room else { return [] }
        return MentionScanner.matches(token.query, participants: room.participants)
    }

    private var showMentionPopover: Bool { activeMentionToken != nil && !mentionMatches.isEmpty }

    /// A floating list above the composer — deliberately a plain overlay view, not SwiftUI's
    /// `.popover()` presentation, so the text field never loses keyboard focus while it's showing
    /// (the plan's own fallback for exactly that risk, taken here as the primary implementation).
    private var mentionPopover: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(mentionMatches) { participant in
                Button { completeMention(participant) } label: {
                    HStack(spacing: HUDTheme.space.xxs) {
                        Text("@\(participant.persona.rawValue)").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.arc)
                        Text(participant.displayName).font(HUDTypography.body).foregroundStyle(HUDTheme.ink)
                        Spacer()
                        Text(participant.isBenched(at: rooms.now()) ? "benched" : "idle")
                            .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    }
                    .padding(.horizontal, HUDTheme.space.s)
                    .padding(.vertical, HUDTheme.space.xxs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, HUDTheme.space.xxs)
        .background(HUDTheme.raised)
        .overlay(Rectangle().stroke(HUDTheme.hairline, lineWidth: 1))
        .padding(.horizontal, compact ? HUDTheme.space.s : HUDTheme.space.m)
        .padding(.top, HUDTheme.space.xxs)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Mention a participant")
    }

    private func completeMention(_ participant: RoomParticipant) {
        rooms.drafts[roomId] = MentionScanner.completing(rooms.drafts[roomId] ?? "", with: participant.persona.rawValue)
    }

    private var passiveMentions: [RoomPersona] {
        MentionScanner.mentions(in: rooms.drafts[roomId] ?? "", participants: room?.participants ?? [])
    }

    /// "Will mention" chips under the field — a preview of what `room.post` will compute into
    /// `RoomChatMessageV1.mentions` once this draft is actually sent, not a claim about what already
    /// happened.
    private var mentionChips: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            ForEach(passiveMentions, id: \.self) { persona in
                Text("@\(persona.rawValue)")
                    .font(HUDTypography.monoLabel)
                    .foregroundStyle(HUDTheme.arc)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(HUDTheme.arc.opacity(0.12)))
            }
        }
        .padding(.horizontal, compact ? HUDTheme.space.s : HUDTheme.space.m)
        .padding(.top, HUDTheme.space.xxs)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Will mention: " + passiveMentions.map { $0.rawValue }.joined(separator: ", "))
    }

    /// Every keystroke also fires the (internally debounced) typing signal.
    private var draftBinding: Binding<String> {
        Binding(
            get: { rooms.drafts[roomId] ?? "" },
            set: { newValue in
                rooms.drafts[roomId] = newValue
                rooms.signalTyping(roomId)
            })
    }

    private func send() {
        Task { await chat.send(roomId, rooms: rooms, backend: backend?()) }
    }

    private func confirm(_ item: ChatThreadItem) {
        guard case .intentCard(let id, _, _) = item, let backend = backend?() else { return }
        Task { _ = await chat.confirmIntent(roomId, cardId: id, backend: backend) }
    }

    private func cancel(_ item: ChatThreadItem) {
        guard case .intentCard(let id, _, _) = item else { return }
        chat.cancelIntent(roomId, cardId: id)
    }
}

// MARK: - Roster + budget + mode panel

enum RoomParticipantLiveState: Hashable {
    case benchedUntil(Date, RoomAgentErrorCode?)
    case passedLastRound
    case idle
}

func roomParticipantLiveState(_ participant: RoomParticipant, messages: [RoomMessage], now: Date) -> RoomParticipantLiveState {
    if participant.isBenched(at: now), let until = participant.benchedUntil?.date {
        return .benchedUntil(until, participant.benchReason)
    }
    // Derived from the loaded transcript: the most recent event naming this persona. Only the
    // human-visible messages already fetched are considered — an honest "idle" (not "passed") when
    // nothing about this persona has been loaded yet.
    let lastForPersona = messages.last { message in
        switch message {
        case .message(let m):
            if case .agent(let p) = m.author { return p == participant.persona }
            return false
        case .system(let s):
            return s.persona == participant.persona
        }
    }
    if case .system(let system) = lastForPersona, system.code == .agentPassed {
        return .passedLastRound
    }
    return .idle
}

public struct RoomRosterPanel: View {
    public var room: Room?
    public var messages: [RoomMessage]
    public var now: Date
    /// `room.participants.list`, for the "add participant" list below — `nil` shows nothing (never a
    /// guessed roster). Multi rooms only; a direct room never offers this (plan item 4 — atomic swap,
    /// not additive `@mention`-into-thread, for a direct room, and not built this wave).
    public var catalog: RoomParticipantsCatalog?
    /// `nil` disables the "add participant" affordance entirely (e.g. a caller with no daemon).
    public var onAddParticipant: ((RoomCatalogProviderEntry) -> Void)?

    public init(room: Room?, messages: [RoomMessage], now: Date = Date(),
                catalog: RoomParticipantsCatalog? = nil, onAddParticipant: ((RoomCatalogProviderEntry) -> Void)? = nil) {
        self.room = room
        self.messages = messages
        self.now = now
        self.catalog = catalog
        self.onAddParticipant = onAddParticipant
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            rosterPanel
            addParticipantPanel
            budgetPanel
            modePanel
        }
    }

    @ViewBuilder
    private var rosterPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            if let room {
                ForEach(room.participants.sorted { $0.position < $1.position }) { participant in
                    participantRow(participant)
                }
                ProvenanceBadge(.live("room.events"), compact: true)
            } else {
                Text("won't guess — no room selected").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(.notYetSourced, compact: true)
            }
        }
        .hudPanel("roster")
    }

    private func participantRow(_ participant: RoomParticipant) -> some View {
        let state = roomParticipantLiveState(participant, messages: messages, now: now)
        return HStack(alignment: .top, spacing: HUDTheme.space.xs) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: HUDTheme.space.xxs) {
                    Text(participant.displayName).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                    Text(participant.provider.rawValue).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                }
                stateLabel(state)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    /// Catalog providers the daemon has configured that aren't already a seat in this room — the
    /// "@mention a provider into the thread" affordance (plan item 4). Empty (so the panel renders
    /// nothing) for a direct room, an unread/disabled catalog, or a room with every configured
    /// provider already seated.
    private var availableToAdd: [RoomCatalogProviderEntry] {
        guard let room, room.flavor == .room, let catalog, catalog.enabled else { return [] }
        let existing = Set(room.participants.map(\.provider))
        return catalog.providers.filter { entry in
            guard let key = entry.roomProviderKey ?? (try? RoomProvider(entry.provider.rawValue)) else { return false }
            return !existing.contains(key)
        }
    }

    @ViewBuilder
    private var addParticipantPanel: some View {
        if let onAddParticipant, !availableToAdd.isEmpty {
            VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
                ForEach(availableToAdd) { entry in
                    HUDButton(addParticipantLabel(entry), systemImage: "plus", variant: .ghost, compact: true) {
                        onAddParticipant(entry)
                    }
                }
                ProvenanceBadge(.live("room.participants.list"), compact: true)
            }
            .hudPanel("add participant")
        }
    }

    /// The catalog's provider name, plus the instance key when it names something more specific than
    /// the bare family (e.g. two named OpenRouter instances — "OpenRouter — fast" vs "OpenRouter —
    /// deep") — never two identical-looking rows for genuinely different instances.
    private func addParticipantLabel(_ entry: RoomCatalogProviderEntry) -> String {
        let key = entry.roomProviderKey?.rawValue ?? entry.provider.rawValue
        guard key != entry.provider.rawValue else { return entry.provider.displayName }
        return "\(entry.provider.displayName) — \(key)"
    }

    @ViewBuilder
    private func stateLabel(_ state: RoomParticipantLiveState) -> some View {
        switch state {
        case .benchedUntil(let until, let reason):
            Text("benched until \(roomTimeString(until))\(reason.map { " (\($0.label))" } ?? "")")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.gold)
        case .passedLastRound:
            Text("passed last round").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
        case .idle:
            Text("idle").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
        }
    }

    @ViewBuilder
    private var budgetPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if let room {
                let budget = room.budget
                HStack(spacing: HUDTheme.space.m) {
                    HUDReadout("spent", value: "\(budget.spentTokens)")
                    HUDReadout("reserved", value: "\(budget.reservedTokens)")
                    HUDReadout("ceiling", value: "\(budget.dailyCeilingTokens)")
                }
                if let fraction = budget.fraction {
                    ProgressView(value: fraction).tint(HUDTheme.arc)
                        .accessibilityLabel("Budget used: \(Int((fraction * 100).rounded())) percent")
                }
                Text("day \(budget.dayKey.rawValue)").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(.live("room.events"), compact: true)
            } else {
                Text("not yet sourced").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(.notYetSourced, compact: true)
            }
        }
        .hudPanel("budget")
    }

    private var modePanel: some View {
        Text("Speaks on value, not turn order.")
            .font(HUDTypography.caption).italic().foregroundStyle(HUDTheme.soft)
            .fixedSize(horizontal: false, vertical: true)
            .hudPanel("mode")
    }
}

// MARK: - New room sheet

/// Creates a room. `RoomCreateSpecV1` has no "kind" concept (research/project/lounge) on the wire —
/// only `title`, an optional `projectId`, `unattendedEnabled`, `agentCooldownEvents`, `participants`,
/// and a budget policy — so this form asks for exactly those, not an invented taxonomy.
///
/// The participant rows are sourced from `room.participants.list` (`RoomParticipantsCatalog`): when
/// the daemon's rooms subsystem is enabled, the sheet seeds one seat per provider the daemon actually
/// has an adapter for and badges the editor LIVE; when it is disabled, the daemon says so (its own
/// `unavailableReason`) and the sheet keeps a clearly-labelled NOT YET SOURCED local suggestion the
/// human must confirm or edit — never a local guess presented as read from the daemon. Rows the human
/// has already edited are never overwritten by a later catalog read.
public struct NewRoomSheet: View {
    public struct ParticipantDraft: Identifiable, Hashable {
        public let id = UUID()
        public var persona: String
        public var provider: String
        public var displayName: String

        public init(persona: String, provider: String, displayName: String) {
            self.persona = persona
            self.provider = provider
            self.displayName = displayName
        }

        /// The local suggestion used only while the catalog is unread, unreadable, or reports the
        /// rooms subsystem disabled — always badged NOT YET SOURCED, never LIVE.
        public static var suggestedDefaults: [ParticipantDraft] {
            [ParticipantDraft(persona: "codex", provider: "codex", displayName: "Codex"),
             ParticipantDraft(persona: "claude", provider: "claude", displayName: "Claude"),
             ParticipantDraft(persona: "ollama", provider: "ollama", displayName: "Ollama")]
        }

        /// What the sheet seeds for a given catalog state: the catalog's own defaults (one seat per
        /// configured provider) when the daemon has the subsystem enabled, else the local suggestion.
        public static func seeds(for catalog: RoomParticipantsCatalog?) -> [ParticipantDraft] {
            guard let catalog, catalog.enabled else { return suggestedDefaults }
            return catalog.defaultParticipantSpecs.map {
                ParticipantDraft(persona: $0.persona.rawValue, provider: $0.provider.rawValue, displayName: $0.displayName)
            }
        }

        /// Content equality, ignoring the row identity — "has the human changed anything?".
        static func sameContent(_ lhs: [ParticipantDraft], _ rhs: [ParticipantDraft]) -> Bool {
            lhs.count == rhs.count && zip(lhs, rhs).allSatisfy {
                $0.persona == $1.persona && $0.provider == $1.provider && $0.displayName == $1.displayName
            }
        }
    }

    public var knownProjects: [(id: ProjectID, name: String)]
    /// `room.participants.list` as last read (`RoomsModel.participantsCatalog`); `nil` until read.
    public var catalog: RoomParticipantsCatalog?
    public var isLoadingCatalog: Bool
    public var catalogError: String?
    /// Called once when the sheet appears — the "refresh on appear" that keeps the roster current.
    public var onLoadCatalog: () async -> Void
    public var onCreate: (String, ProjectID?, Bool, [RoomParticipantSpec]) async -> Result<Room, AssistantBackendError>
    public var onDone: (Room?) -> Void

    @State private var title = ""
    @State private var selectedProjectId: ProjectID?
    @State private var unattendedEnabled = false
    @State private var participants: [ParticipantDraft]
    /// The rows the sheet last seeded itself; only while `participants` still equals these (the human
    /// has not touched them) does a fresh catalog read replace them.
    @State private var seededParticipants: [ParticipantDraft]
    @State private var isSubmitting = false
    @State private var errorText: String?

    public init(knownProjects: [(id: ProjectID, name: String)] = [],
                catalog: RoomParticipantsCatalog? = nil, isLoadingCatalog: Bool = false, catalogError: String? = nil,
                onLoadCatalog: @escaping () async -> Void = {},
                onCreate: @escaping (String, ProjectID?, Bool, [RoomParticipantSpec]) async -> Result<Room, AssistantBackendError>,
                onDone: @escaping (Room?) -> Void) {
        self.knownProjects = knownProjects
        self.catalog = catalog
        self.isLoadingCatalog = isLoadingCatalog
        self.catalogError = catalogError
        self.onLoadCatalog = onLoadCatalog
        self.onCreate = onCreate
        self.onDone = onDone
        let seeds = ParticipantDraft.seeds(for: catalog)
        _participants = State(initialValue: seeds)
        _seededParticipants = State(initialValue: seeds)
    }

    /// LIVE only when the daemon actually answered with the subsystem enabled; everything else —
    /// unread, unreadable, or honestly disabled — stays NOT YET SOURCED.
    var participantsProvenance: Provenance {
        if let catalog, catalog.enabled { return .live("room.participants.list") }
        return .notYetSourced
    }

    /// The caption under the participants label: what the rows are and where they came from.
    var participantsNote: String {
        if let catalog {
            guard catalog.enabled else {
                return "Rooms subsystem disabled — \(catalog.unavailableReason ?? "no reason given"). These rows are a local suggestion, not read from the daemon; edit them to match your room-participants-config.json."
            }
            if catalog.providers.isEmpty {
                return "The daemon reports no configured providers (room.participants.list); add participants by hand — a provider without an adapter fails closed."
            }
            let providers = catalog.providers.map { entry in
                "\(entry.provider.rawValue) · \(entry.model)" + (entry.cliVersion.map { " (cli \($0))" } ?? "")
            }.joined(separator: " · ")
            return "One seat per provider the daemon has configured — \(providers). Personas and display names are yours to edit."
        }
        if isLoadingCatalog { return "Reading configured participants (room.participants.list)…" }
        if let catalogError {
            return "Could not read configured participants (room.participants.list): \(catalogError). These rows are a local suggestion, not read from the daemon."
        }
        return "Configured participants not read yet — these rows are a local suggestion, not read from the daemon."
    }

    /// Replaces the rows with the catalog's seeds unless the human already edited them.
    private func reseed(from catalog: RoomParticipantsCatalog?) {
        let seeds = ParticipantDraft.seeds(for: catalog)
        guard ParticipantDraft.sameContent(participants, seededParticipants) else { return }
        participants = seeds
        seededParticipants = seeds
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("new room")
            TextField("Title", text: $title)
                .textFieldStyle(.plain)
                .font(HUDTypography.body)
                .padding(HUDTheme.space.xs)
                .background(HUDTheme.raised)
                .overlay(Rectangle().stroke(HUDTheme.hairline, lineWidth: 1))
            if !knownProjects.isEmpty {
                Picker("Project", selection: $selectedProjectId) {
                    Text("Portfolio-wide").tag(ProjectID?.none)
                    ForEach(knownProjects, id: \.id) { project in
                        Text(project.name).tag(Optional(project.id))
                    }
                }
                .labelsHidden()
            }
            Toggle("Unattended — agents may reply while I'm away", isOn: $unattendedEnabled)
                .font(HUDTypography.body)
            participantsEditor
            if let errorText {
                Text(errorText).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                HUDButton("Cancel", variant: .ghost) { onDone(nil) }
                Spacer()
                if isSubmitting { ProgressView().controlSize(.small) }
                HUDButton("Create", variant: .arc, action: submit)
                    .disabled(isSubmitting || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 460)
        .background(HUDTheme.plate)
        .task { await onLoadCatalog() }
        .onChange(of: catalog) { _, next in reseed(from: next) }
    }

    private var participantsEditor: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xxs) {
                HUDLabel("participants")
                ProvenanceBadge(participantsProvenance, compact: true)
                if isLoadingCatalog { ProgressView().controlSize(.mini) }
            }
            Text(participantsNote)
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
            ForEach($participants) { $draft in
                HStack(spacing: HUDTheme.space.xxs) {
                    TextField("persona", text: $draft.persona).textFieldStyle(.roundedBorder).frame(width: 100)
                    TextField("provider", text: $draft.provider).textFieldStyle(.roundedBorder).frame(width: 100)
                    TextField("display name", text: $draft.displayName).textFieldStyle(.roundedBorder)
                    Button {
                        participants.removeAll { $0.id == draft.id }
                    } label: {
                        Image(systemName: "minus.circle").foregroundStyle(HUDTheme.mute)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove participant")
                }
                .font(HUDTypography.body)
            }
            HUDButton("Add participant", systemImage: "plus", variant: .ghost, compact: true) {
                participants.append(ParticipantDraft(persona: "", provider: "", displayName: ""))
            }
        }
    }

    /// `nil` when a row fails wire validation (persona/provider pattern, a non-empty display name) or
    /// personas collide — `RoomCreateSpecV1Schema` rejects duplicate personas.
    private func buildSpecs() -> [RoomParticipantSpec]? {
        var specs: [RoomParticipantSpec] = []
        for draft in participants {
            let name = draft.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty,
                  let persona = try? RoomPersona(draft.persona.trimmingCharacters(in: .whitespacesAndNewlines)),
                  let provider = try? RoomProvider(draft.provider.trimmingCharacters(in: .whitespacesAndNewlines))
            else { return nil }
            specs.append(RoomParticipantSpec(persona: persona, provider: provider, displayName: name))
        }
        guard !specs.isEmpty, Set(specs.map(\.persona)).count == specs.count else { return nil }
        return specs
    }

    private func submit() {
        errorText = nil
        guard let specs = buildSpecs() else {
            errorText = "Every participant needs a unique lowercase persona and provider (letters, digits, hyphens) and a display name."
            return
        }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        isSubmitting = true
        Task {
            let result = await onCreate(trimmedTitle, selectedProjectId, unattendedEnabled, specs)
            isSubmitting = false
            switch result {
            case .success(let room): onDone(room)
            case .failure(let error): errorText = error.description
            }
        }
    }
}
