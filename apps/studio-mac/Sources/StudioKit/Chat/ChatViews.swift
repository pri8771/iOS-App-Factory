import SwiftUI

// MARK: - Chat views
//
// `CornerChatView` is the floating panel bottom-right of every screen: a header with the conversation
// switcher, the transcript, an input box; it minimises to a round cyan FAB. `ChatScreen` is the same
// conversation full-screen for long work. Both talk to `ChatModel`, whose replies come from the
// `ScriptedAssistant` stub — every assistant message is tagged so, with its provenance.

public struct MessageBubble: View {
    public var message: ChatMessage
    public var onConfirm: (() -> Void)?
    public var onCancel: (() -> Void)?

    public init(_ message: ChatMessage, onConfirm: (() -> Void)? = nil, onCancel: (() -> Void)? = nil) {
        self.message = message
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

    private var isUser: Bool { message.role == .user }

    private var sourceLabel: String? {
        if message.isStub { return ScriptedAssistant.name }
        if case .live(let op)? = message.provenance, op.hasPrefix("studio.assistant") { return "studio assistant" }
        return nil
    }

    public var body: some View {
        HStack(alignment: .bottom) {
            if isUser { Spacer(minLength: 40) }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 3) {
                if !isUser, let sourceLabel {
                    HStack(spacing: HUDTheme.space.xxs) {
                        HUDLabel("assistant")
                        Text("·").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.faint)
                        Text(sourceLabel).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                            .foregroundStyle(HUDTheme.mute)
                    }
                }
                if let card = message.intentCard {
                    IntentConfirmationCard(card: card, onConfirm: onConfirm, onCancel: onCancel)
                } else {
                    Text(message.text)
                        .font(HUDTypography.body)
                        .foregroundStyle(HUDTheme.ink)
                        .textSelection(.enabled)
                        .multilineTextAlignment(isUser ? .trailing : .leading)
                        .padding(.horizontal, HUDTheme.space.s)
                        .padding(.vertical, HUDTheme.space.xs)
                        .background(
                            RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                                .fill(isUser ? HUDTheme.arc.opacity(0.10) : HUDTheme.raised)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                                .stroke(isUser ? HUDTheme.arc.opacity(0.35) : HUDTheme.hairline, lineWidth: 1)
                        )
                    if !message.citations.isEmpty {
                        CitationChips(citations: message.citations)
                    }
                }
                if let provenance = message.provenance {
                    ProvenanceBadge(provenance, compact: true)
                }
            }
            if !isUser { Spacer(minLength: 40) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(isUser ? "You" : "Assistant\(message.isStub ? " (scripted stub)" : "")"): \(message.text)")
    }
}

/// Small mono chips — `kind + id` — under an "answered" reply, so a fact can always be traced to
/// exactly what the daemon read.
public struct CitationChips: View {
    public var citations: [AssistantCitation]

    public var body: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            ForEach(Array(citations.enumerated()), id: \.offset) { _, citation in
                Text("\(citation.kind.rawValue) · \(citation.id.prefix(8))")
                    .font(.system(size: 8, weight: .medium, design: .monospaced))
                    .foregroundStyle(HUDTheme.soft)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .overlay(Capsule().stroke(HUDTheme.hairline, lineWidth: 1))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("citations: " + citations.map { "\($0.kind.rawValue) \($0.id)" }.joined(separator: ", "))
    }
}

/// A daemon-proposed intent, gold because confirming it is the human's decision. Renders the
/// utterance it was proposed from, the summary, and Confirm/Cancel — or the settled outcome once the
/// human has decided, including the resulting attempt id when there is one.
public struct IntentConfirmationCard: View {
    public var card: IntentCard
    public var onConfirm: (() -> Void)?
    public var onCancel: (() -> Void)?

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xxs) {
                DiamondGate(state: .waiting, size: 9, label: card.intent.summary).frame(width: 18, height: 18)
                HUDLabel("confirm", role: .human)
            }
            Text(card.intent.summary).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
            Text("“\(card.intent.utterance)”").font(HUDTypography.caption).foregroundStyle(HUDTheme.soft).lineLimit(2)
            statusView
        }
        .padding(HUDTheme.space.s)
        .background(RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous).fill(HUDTheme.raised))
        .overlay(RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous).stroke(HUDTheme.gold.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusView: some View {
        switch card.status {
        case .pending:
            HStack(spacing: HUDTheme.space.xs) {
                HUDButton("Confirm", systemImage: "checkmark", variant: .gold, compact: true) { onConfirm?() }
                HUDButton("Cancel", variant: .ghost, compact: true) { onCancel?() }
            }
        case .executing:
            HStack(spacing: HUDTheme.space.xxs) {
                ProgressView().controlSize(.small)
                Text("executing…").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
        case .executed(let summary):
            StatusPill(.succeeded, label: summary)
        case .failed(let message):
            Text(message).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.alert).fixedSize(horizontal: false, vertical: true)
        case .cancelled:
            StatusPill(.cancelled, label: "cancelled")
        }
    }
}

/// Transcript + composer, shared by the corner panel and the full screen.
public struct ConversationView: View {
    @Bindable public var chat: ChatModel
    public var context: () -> AssistantContext
    /// `nil` keeps the phase-1 scripted-stub-only behaviour; StudioRootView supplies
    /// `store.assistantBackend` so real messages try the daemon assistant first.
    public var backend: (() -> AssistantBackend?)?
    public var compact: Bool

    @FocusState private var focused: Bool

    public init(chat: ChatModel, context: @escaping () -> AssistantContext, backend: (() -> AssistantBackend?)? = nil,
                compact: Bool = false) {
        self.chat = chat
        self.context = context
        self.backend = backend
        self.compact = compact
    }

    public var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: HUDTheme.space.s) {
                        ForEach(chat.selected?.messages ?? []) { message in
                            MessageBubble(message, onConfirm: { confirm(message.id) }, onCancel: { chat.cancelIntent(message.id) })
                                .id(message.id)
                        }
                        if chat.selected?.messages.isEmpty ?? true {
                            Text("Ask about attempts, what's blocked, a project by name, or the daemon.")
                                .font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, HUDTheme.space.l)
                        }
                    }
                    .padding(compact ? HUDTheme.space.s : HUDTheme.space.m)
                }
                .onChange(of: chat.selected?.messages.count) { _, _ in
                    if let last = chat.selected?.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            composer
        }
    }

    private var composer: some View {
        HStack(spacing: HUDTheme.space.xs) {
            TextField("Ask the factory…", text: $chat.draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(HUDTypography.body)
                .foregroundStyle(HUDTheme.ink)
                .lineLimit(1...4)
                .focused($focused)
                .onSubmit { send() }
                .accessibilityLabel("Message")
            HUDButton("Send", systemImage: "arrow.up", variant: .arc, compact: true, action: send)
                .disabled(chat.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(compact ? HUDTheme.space.s : HUDTheme.space.m)
        .background(HUDTheme.hull)
    }

    private func send() {
        let text = chat.draft
        Task { await chat.send(text, context: context(), backend: backend?()) }
    }

    private func confirm(_ messageId: UUID) {
        guard let backend = backend?() else { return }
        Task { await chat.confirmIntent(messageId, backend: backend) }
    }
}

/// The header's conversation switcher: a menu of assistant conversations plus — when `rooms` is
/// supplied — a Rooms section and "New room…". Selecting a room calls `rooms.select(_:)`, which owns
/// starting/stopping that room's poll loop; selecting a conversation deselects any room
/// (`rooms?.select(nil)`) so the two "what's showing" states never disagree with each other.
public struct ConversationSwitcher: View {
    @Bindable public var chat: ChatModel
    public var rooms: RoomsModel?
    public var onNewRoom: (() -> Void)?

    public init(chat: ChatModel, rooms: RoomsModel? = nil, onNewRoom: (() -> Void)? = nil) {
        self.chat = chat
        self.rooms = rooms
        self.onNewRoom = onNewRoom
    }

    private var selectedRoom: Room? {
        guard let rooms, let id = rooms.selectedRoomId else { return nil }
        return rooms.room(id)
    }

    private var selectedTitle: String { selectedRoom?.title ?? chat.selected?.title ?? "Chat" }

    public var body: some View {
        Menu {
            Section("Assistant") {
                ForEach(chat.conversations) { conversation in
                    Button {
                        rooms?.select(nil)
                        chat.select(conversation.id)
                    } label: {
                        if selectedRoom == nil, conversation.id == chat.selectedId {
                            Label(conversation.title, systemImage: "checkmark")
                        } else {
                            Text(conversation.title)
                        }
                    }
                }
                Button("New conversation") {
                    rooms?.select(nil)
                    chat.newConversation(title: "Untitled \(chat.conversations.count + 1)")
                }
            }
            if let rooms {
                Section("Rooms") {
                    if rooms.rooms.isEmpty {
                        Text(rooms.isConnected ? "No rooms yet" : "Rooms need a daemon connection")
                    }
                    ForEach(rooms.rooms) { room in
                        Button {
                            rooms.select(room.roomId)
                        } label: {
                            if rooms.selectedRoomId == room.roomId {
                                Label(room.title, systemImage: "checkmark")
                            } else {
                                Text(room.title)
                            }
                        }
                    }
                    if let onNewRoom {
                        Button("New room…", action: onNewRoom)
                    }
                }
            }
        } label: {
            Text(selectedTitle)
                .font(HUDTypography.displaySubheading)
                .foregroundStyle(HUDTheme.ink)
                .lineLimit(1)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("Conversation: \(selectedTitle). Switch conversation or room")
    }
}

// MARK: - Corner chat

public struct CornerChatView: View {
    public var chat: ChatModel
    public var context: () -> AssistantContext
    public var backend: (() -> AssistantBackend?)?
    /// `nil` keeps the phase-1/2 assistant-only behaviour; StudioRootView supplies `store.rooms` so
    /// the switcher gains a Rooms section and the panel can show a room's transcript.
    public var rooms: RoomsModel?
    public var onNewRoom: (() -> Void)?
    @Binding public var minimized: Bool
    public var onExpand: (() -> Void)?

    public static let panelSize = CGSize(width: 372, height: 460)

    public init(chat: ChatModel, context: @escaping () -> AssistantContext, backend: (() -> AssistantBackend?)? = nil,
                rooms: RoomsModel? = nil, onNewRoom: (() -> Void)? = nil,
                minimized: Binding<Bool>, onExpand: (() -> Void)? = nil) {
        self.chat = chat
        self.context = context
        self.backend = backend
        self.rooms = rooms
        self.onNewRoom = onNewRoom
        self._minimized = minimized
        self.onExpand = onExpand
    }

    public var body: some View {
        Group {
            if minimized {
                fab
            } else {
                panel
            }
        }
        .animation(HUDTheme.spring, value: minimized)
    }

    private var fab: some View {
        Button {
            minimized = false
        } label: {
            ZStack {
                Circle().fill(HUDTheme.glow).frame(width: 60, height: 60).blur(radius: 8)
                Circle().fill(HUDTheme.arc).frame(width: 44, height: 44)
                Image(systemName: "bubble.left.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(HUDTheme.hull)
                    .accessibilityHidden(true)
            }
            .frame(width: 60, height: 60)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open chat")
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: HUDTheme.space.xs) {
                BreathingDot(color: HUDTheme.arc)
                ConversationSwitcher(chat: chat, rooms: rooms, onNewRoom: onNewRoom)
                Spacer()
                if let onExpand {
                    Button(action: onExpand) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(HUDTheme.mute)
                    .help("Open full chat")
                    .accessibilityLabel("Open full chat")
                }
                Button {
                    minimized = true
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(HUDTheme.mute)
                .help("Minimize")
                .accessibilityLabel("Minimize chat")
            }
            .padding(.horizontal, HUDTheme.space.s)
            .padding(.vertical, HUDTheme.space.xs)
            .background(HUDTheme.hull)
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            panelContent
        }
        .frame(width: Self.panelSize.width, height: Self.panelSize.height)
        .background(HUDTheme.plate)
        .overlay(Rectangle().stroke(HUDTheme.hairline, lineWidth: 1))
        .overlay(HUDBrackets().stroke(HUDTheme.arcDim, style: StrokeStyle(lineWidth: 1, lineCap: .square)))
        .shadow(color: Color.black.opacity(0.45), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Chat panel")
        .task { await rooms?.loadRoomsIfNeeded() }
    }

    @ViewBuilder
    private var panelContent: some View {
        if let rooms, let roomId = rooms.selectedRoomId {
            RoomTranscriptView(rooms: rooms, roomId: roomId, compact: true)
        } else {
            ConversationView(chat: chat, context: context, backend: backend, compact: true)
        }
    }
}

// MARK: - Full-screen chat

public struct ChatScreen: View {
    public var chat: ChatModel
    public var context: () -> AssistantContext
    public var backend: (() -> AssistantBackend?)?
    /// `nil` keeps the phase-1/2 assistant-only screen; StudioRootView supplies `store.rooms` so the
    /// sidebar gains a live Rooms section and selecting one shows its transcript + roster panel.
    public var rooms: RoomsModel?
    public var onNewRoom: (() -> Void)?

    public init(chat: ChatModel, context: @escaping () -> AssistantContext, backend: (() -> AssistantBackend?)? = nil,
                rooms: RoomsModel? = nil, onNewRoom: (() -> Void)? = nil) {
        self.chat = chat
        self.context = context
        self.backend = backend
        self.rooms = rooms
        self.onNewRoom = onNewRoom
    }

    private var selectedRoomId: RoomID? { rooms?.selectedRoomId }

    public var body: some View {
        HStack(spacing: 0) {
            sidebar
            Rectangle().fill(HUDTheme.hairline).frame(width: 1)
            VStack(spacing: 0) {
                topBar
                Rectangle().fill(HUDTheme.hairline).frame(height: 1)
                content
            }
        }
        .background(HUDTheme.void)
        .task { await rooms?.loadRoomsIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        if let rooms, let roomId = selectedRoomId {
            HStack(spacing: 0) {
                RoomTranscriptView(rooms: rooms, roomId: roomId)
                Rectangle().fill(HUDTheme.hairline).frame(width: 1)
                ScrollView {
                    RoomRosterPanel(room: rooms.room(roomId), messages: rooms.transcripts[roomId]?.messages ?? [],
                                   now: rooms.now())
                        .padding(HUDTheme.space.s)
                }
                .frame(width: 280)
                .background(HUDTheme.hull)
            }
        } else {
            ConversationView(chat: chat, context: context, backend: backend)
        }
    }

    private var topBar: some View {
        HStack(spacing: HUDTheme.space.s) {
            ConversationSwitcher(chat: chat, rooms: rooms, onNewRoom: onNewRoom)
            Spacer()
            if selectedRoomId == nil {
                HUDLabel("assistant")
                Text(backend == nil ? ScriptedAssistant.name : "studio assistant")
                    .font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                    .foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(backend == nil ? .staticValue("phase 1") : .live("studio.assistant.query"), compact: true)
            }
        }
        .padding(.horizontal, HUDTheme.space.m)
        .padding(.vertical, HUDTheme.space.s)
        .background(HUDTheme.hull)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HUDLabel("conversations").padding(.horizontal, HUDTheme.space.s).padding(.top, HUDTheme.space.s)
            ForEach(chat.conversations) { conversation in
                conversationRow(conversation)
            }
            HUDButton("New", systemImage: "plus", variant: .ghost, compact: true) {
                rooms?.select(nil)
                chat.newConversation(title: "Untitled \(chat.conversations.count + 1)")
            }
            .padding(.horizontal, HUDTheme.space.xs)
            Rectangle().fill(HUDTheme.hairline).frame(height: 1).padding(.vertical, HUDTheme.space.xs)
            roomsSection
            Spacer()
        }
        .frame(width: 220)
        .background(HUDTheme.hull)
    }

    private func conversationRow(_ conversation: Conversation) -> some View {
        let isSelected = selectedRoomId == nil && conversation.id == chat.selectedId
        return Button {
            rooms?.select(nil)
            chat.select(conversation.id)
        } label: {
            HStack {
                Text(conversation.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                Spacer()
                Text("\(conversation.messages.count)").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
            }
            .padding(.horizontal, HUDTheme.space.s)
            .padding(.vertical, HUDTheme.space.xs)
            .background(isSelected ? HUDTheme.raised : Color.clear)
            .overlay(alignment: .leading) {
                if isSelected { Rectangle().fill(HUDTheme.arc).frame(width: 2) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private var roomsSection: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            HUDLabel("rooms")
            if let rooms {
                ProvenanceBadge(.live("room.list"), compact: true)
                if rooms.isLoadingRooms { ProgressView().controlSize(.small) }
            } else {
                ProvenanceBadge(.notYetSourced, compact: true)
            }
            Spacer()
        }
        .padding(.horizontal, HUDTheme.space.s)
        if let rooms {
            if rooms.rooms.isEmpty, !rooms.isLoadingRooms {
                Text(rooms.isConnected ? "No rooms yet." : "Rooms need a daemon connection.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    .padding(.horizontal, HUDTheme.space.s)
            }
            ForEach(rooms.rooms) { room in
                roomRow(room, rooms: rooms)
            }
            if let error = rooms.roomsError {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .padding(.horizontal, HUDTheme.space.s)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let onNewRoom {
                HUDButton("New room", systemImage: "plus", variant: .ghost, compact: true, action: onNewRoom)
                    .padding(.horizontal, HUDTheme.space.xs)
            }
        } else {
            Text("Rooms need a daemon connection.")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, HUDTheme.space.s)
        }
    }

    private func roomRow(_ room: Room, rooms: RoomsModel) -> some View {
        let isSelected = rooms.selectedRoomId == room.roomId
        return Button {
            rooms.select(room.roomId)
        } label: {
            HStack(spacing: HUDTheme.space.xxs) {
                if room.roundInProgress { BreathingDot(color: HUDTheme.arc) }
                Text(room.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, HUDTheme.space.s)
            .padding(.vertical, HUDTheme.space.xs)
            .background(isSelected ? HUDTheme.raised : Color.clear)
            .overlay(alignment: .leading) {
                if isSelected { Rectangle().fill(HUDTheme.arc).frame(width: 2) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview("Corner chat") {
    struct Host: View {
        @State var minimized = false
        let chat = ChatModel()
        var body: some View {
            ZStack(alignment: .bottomTrailing) {
                HUDTheme.void
                CornerChatView(chat: chat, context: { AssistantContext(link: "offline") }, minimized: $minimized, onExpand: {})
                    .padding(24)
            }
            .frame(width: 700, height: 600)
        }
    }
    return Host().preferredColorScheme(.dark)
}
