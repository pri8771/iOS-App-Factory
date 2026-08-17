import SwiftUI

// MARK: - Room views
//
// `RoomMessageRow` renders one `RoomMessage` (message-transcript.md: human = gold, agent = cyan +
// persona/provider, system = muted italic, `agent-error` = a typed chip that is NEVER silence,
// `agent-passed` = a muted "— persona passed —" line). `RoomTranscriptView` is the scroll + composer,
// shared by the full chat screen and the corner popup — same shape as `ConversationView`, over
// `RoomsModel` instead of `ChatModel`. `RoomRosterPanel` is the right-side instrument: roster with
// live state, the budget meter, the mode line. `NewRoomSheet` creates a room.

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
                    bubble(chat.body, role: .human)
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
                    bubble(chat.body, role: .machine)
                    timestamp(chat.occurredAt)
                }
                Spacer(minLength: 40)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(displayName(persona)): \(chat.body)")
        }
    }

    private func bubble(_ text: String, role: HUDRole) -> some View {
        Text(text)
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

// MARK: - Transcript + composer

public struct RoomTranscriptView: View {
    @Bindable public var rooms: RoomsModel
    public var roomId: RoomID
    public var compact: Bool

    @FocusState private var focused: Bool

    public init(rooms: RoomsModel, roomId: RoomID, compact: Bool = false) {
        self.rooms = rooms
        self.roomId = roomId
        self.compact = compact
    }

    private var transcript: RoomTranscript { rooms.transcripts[roomId] ?? RoomTranscript() }
    private var room: Room? { rooms.room(roomId) }

    public var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: HUDTheme.space.s) {
                        ForEach(transcript.messages) { message in
                            RoomMessageRow(message, room: room).id(message.id)
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
                .onChange(of: transcript.messages.count) { _, _ in
                    if let last = transcript.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
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

    private var header: some View {
        HStack(spacing: HUDTheme.space.xs) {
            if let room {
                Text(room.title).font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink).lineLimit(1)
                // Typing/round indicator only after a real grant — never speculative.
                if room.roundInProgress {
                    BreathingDot(color: HUDTheme.arc)
                    Text("round in progress").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.arc)
                }
                if let moderator = transcript.moderator, !moderator.enabled {
                    StatusPill(.paused, label: "no agents granted")
                }
            }
            Spacer()
            ProvenanceBadge(.live("room.events"), compact: true)
        }
        .padding(.horizontal, compact ? HUDTheme.space.s : HUDTheme.space.m)
        .padding(.vertical, HUDTheme.space.xs)
        .background(HUDTheme.hull)
    }

    private var composer: some View {
        HStack(spacing: HUDTheme.space.xs) {
            TextField("Message the room…", text: draftBinding, axis: .vertical)
                .textFieldStyle(.plain)
                .font(HUDTypography.body)
                .foregroundStyle(HUDTheme.ink)
                .lineLimit(1...4)
                .focused($focused)
                .onSubmit { send() }
                .accessibilityLabel("Message")
            HUDButton("Send", systemImage: "arrow.up", variant: .arc, compact: true, action: send)
                .disabled((rooms.drafts[roomId] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(compact ? HUDTheme.space.s : HUDTheme.space.m)
        .background(HUDTheme.hull)
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
        Task { await rooms.send(roomId) }
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

    public init(room: Room?, messages: [RoomMessage], now: Date = Date()) {
        self.room = room
        self.messages = messages
        self.now = now
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            rosterPanel
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
/// There is also no `room.*` operation that lists the daemon's configured personas/providers
/// (`room-participants-config.ts` is daemon-local configuration, never on the wire), so the
/// participant roster cannot be sourced live. The three-row default below is a clearly-labelled local
/// suggestion the human must confirm or edit — never presented as read from the daemon.
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

        public static var suggestedDefaults: [ParticipantDraft] {
            [ParticipantDraft(persona: "codex", provider: "codex", displayName: "Codex"),
             ParticipantDraft(persona: "claude", provider: "claude", displayName: "Claude"),
             ParticipantDraft(persona: "ollama", provider: "ollama", displayName: "Ollama")]
        }
    }

    public var knownProjects: [(id: ProjectID, name: String)]
    public var onCreate: (String, ProjectID?, Bool, [RoomParticipantSpec]) async -> Result<Room, AssistantBackendError>
    public var onDone: (Room?) -> Void

    @State private var title = ""
    @State private var selectedProjectId: ProjectID?
    @State private var unattendedEnabled = false
    @State private var participants = ParticipantDraft.suggestedDefaults
    @State private var isSubmitting = false
    @State private var errorText: String?

    public init(knownProjects: [(id: ProjectID, name: String)] = [],
                onCreate: @escaping (String, ProjectID?, Bool, [RoomParticipantSpec]) async -> Result<Room, AssistantBackendError>,
                onDone: @escaping (Room?) -> Void) {
        self.knownProjects = knownProjects
        self.onCreate = onCreate
        self.onDone = onDone
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
    }

    private var participantsEditor: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xxs) {
                HUDLabel("participants")
                ProvenanceBadge(.notYetSourced, compact: true)
            }
            Text("The daemon has no operation yet to list configured personas — these are a local suggestion; edit persona/provider to match your room-participants-config.json.")
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
