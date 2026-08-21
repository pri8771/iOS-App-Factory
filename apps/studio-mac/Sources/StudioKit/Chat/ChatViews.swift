import SwiftUI

// MARK: - Chat views
//
// As of Wave 9b (Architecture decisions 1 and 14), "chat" IS rooms: a conversation is a direct room,
// a room is a room, and both render through `RoomTranscriptView` (Rooms/RoomViews.swift) — this file
// now holds only the shell around that: `IntentConfirmationCard` (still real — `studio.assistant.*`
// intents overlay on top of a room's transcript, see `ChatThreadItem`), `RoomSwitcher` (the header
// menu: Conversations + Rooms sections, fed by `ConversationsModel`), and the two top-level
// containers, `CornerChatView` (floating panel) and `ChatScreen` (full screen, with the
// Conversations/Rooms sidebar). There is no more client-local `Conversation`/`ChatMessage` storage or
// `ScriptedAssistant` fallback (both deleted) — a screen with nothing selected shows an honest empty
// state, never a fabricated scripted reply.

/// A daemon-proposed intent, gold because confirming it is the human's decision. Renders the
/// utterance it was proposed from, the summary, and Confirm/Cancel — or the settled outcome once the
/// human has decided, including the resulting attempt id when there is one.
public struct IntentConfirmationCard: View {
    public var card: IntentCard
    public var onConfirm: (() -> Void)?
    public var onCancel: (() -> Void)?

    public init(card: IntentCard, onConfirm: (() -> Void)? = nil, onCancel: (() -> Void)? = nil) {
        self.card = card
        self.onConfirm = onConfirm
        self.onCancel = onCancel
    }

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

// MARK: - Room switcher

/// The header's room switcher: Conversations (direct rooms) + Rooms (multi rooms) sections, fed by
/// `ConversationsModel` — the same façade the sidebar's two sections use, so this menu and the
/// sidebar never disagree about what a "conversation" is.
public struct RoomSwitcher: View {
    @Bindable public var rooms: RoomsModel
    public var conversations: ConversationsModel
    public var onNewConversation: (() -> Void)?
    public var onNewRoom: (() -> Void)?

    public init(rooms: RoomsModel, conversations: ConversationsModel, onNewConversation: (() -> Void)? = nil,
                onNewRoom: (() -> Void)? = nil) {
        self.rooms = rooms
        self.conversations = conversations
        self.onNewConversation = onNewConversation
        self.onNewRoom = onNewRoom
    }

    private var selectedTitle: String {
        guard let id = rooms.selectedRoomId, let room = rooms.room(id) else { return "Chat" }
        return room.title
    }

    public var body: some View {
        Menu {
            Section("Conversations") {
                if conversations.conversations.isEmpty {
                    Text(conversations.isConnected ? "No conversations yet" : "Conversations need a daemon connection")
                }
                ForEach(conversations.conversations) { room in
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
                if let onNewConversation {
                    Button("New conversation", action: onNewConversation)
                }
            }
            Section("Rooms") {
                if conversations.multiRooms.isEmpty {
                    Text(conversations.isConnected ? "No rooms yet" : "Rooms need a daemon connection")
                }
                ForEach(conversations.multiRooms) { room in
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
    /// `nil` keeps everything honestly offline (no client at all) — the empty state then offers no
    /// "New conversation" button, since there is nothing to create it against.
    public var rooms: RoomsModel?
    public var conversations: ConversationsModel?
    public var backend: (() -> AssistantBackend?)?
    public var onNewRoom: (() -> Void)?
    @Binding public var minimized: Bool
    public var onExpand: (() -> Void)?
    /// Called when confirming an intent produces a `ProjectPlan` — StudioRootView opens the planner.
    /// Reserved: `RoomTranscriptView`'s intent overlay does not yet forward this (its confirm action
    /// only needs `backend`); kept on the public init so a future wiring pass can thread it through
    /// without another signature change.
    public var onPlanReady: ((ProjectPlan) -> Void)?

    public static let panelSize = CGSize(width: 372, height: 460)

    public init(chat: ChatModel, rooms: RoomsModel? = nil, conversations: ConversationsModel? = nil,
                backend: (() -> AssistantBackend?)? = nil, onNewRoom: (() -> Void)? = nil,
                minimized: Binding<Bool>, onExpand: (() -> Void)? = nil, onPlanReady: ((ProjectPlan) -> Void)? = nil) {
        self.chat = chat
        self.rooms = rooms
        self.conversations = conversations
        self.backend = backend
        self.onNewRoom = onNewRoom
        self._minimized = minimized
        self.onExpand = onExpand
        self.onPlanReady = onPlanReady
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
                if let rooms, let conversations {
                    RoomSwitcher(rooms: rooms, conversations: conversations, onNewConversation: startNewConversation, onNewRoom: onNewRoom)
                } else {
                    Text("Chat").font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink)
                }
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
            RoomTranscriptView(rooms: rooms, chat: chat, roomId: roomId, backend: backend, compact: true)
        } else {
            emptyState
        }
    }

    private var emptyState: some View {
        VStack(spacing: HUDTheme.space.s) {
            Text("No conversation selected.").font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
            if conversations != nil {
                HUDButton("New conversation", systemImage: "plus", variant: .arc, compact: true, action: startNewConversation)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func startNewConversation() {
        guard let conversations else { return }
        Task { await conversations.newConversation() }
    }
}

// MARK: - Full-screen chat

public struct ChatScreen: View {
    public var chat: ChatModel
    public var rooms: RoomsModel?
    public var conversations: ConversationsModel?
    public var backend: (() -> AssistantBackend?)?
    public var onNewRoom: (() -> Void)?
    /// Offered on the "no default provider" empty state (Architecture decision 14's new-conversation
    /// refusal) — `nil` hides the shortcut, StudioRootView supplies one that switches to the Settings
    /// tab.
    public var onOpenSettings: (() -> Void)?
    /// Called when confirming an intent produces a `ProjectPlan` — StudioRootView opens the planner.
    /// See `CornerChatView`'s identical doc comment; not yet forwarded by `RoomTranscriptView`.
    public var onPlanReady: ((ProjectPlan) -> Void)?

    public init(chat: ChatModel, rooms: RoomsModel? = nil, conversations: ConversationsModel? = nil,
                backend: (() -> AssistantBackend?)? = nil, onNewRoom: (() -> Void)? = nil,
                onOpenSettings: (() -> Void)? = nil, onPlanReady: ((ProjectPlan) -> Void)? = nil) {
        self.chat = chat
        self.rooms = rooms
        self.conversations = conversations
        self.backend = backend
        self.onNewRoom = onNewRoom
        self.onOpenSettings = onOpenSettings
        self.onPlanReady = onPlanReady
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
        .task {
            await rooms?.loadRoomsIfNeeded()
            await rooms?.loadParticipantsCatalog()
        }
    }

    @ViewBuilder
    private var content: some View {
        if let rooms, let roomId = selectedRoomId {
            HStack(spacing: 0) {
                RoomTranscriptView(rooms: rooms, chat: chat, roomId: roomId, backend: backend)
                Rectangle().fill(HUDTheme.hairline).frame(width: 1)
                ScrollView {
                    RoomRosterPanel(room: rooms.room(roomId), messages: rooms.transcripts[roomId]?.messages ?? [],
                                   now: rooms.now(), catalog: rooms.participantsCatalog,
                                   onAddParticipant: { entry in addParticipant(entry, to: roomId, rooms: rooms) })
                        .padding(HUDTheme.space.s)
                }
                .frame(width: 280)
                .background(HUDTheme.hull)
            }
        } else {
            emptyState
        }
    }

    private var emptyState: some View {
        VStack(spacing: HUDTheme.space.s) {
            Text(emptyStateText)
                .font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let conversations {
                if conversations.needsDefaultProvider, let onOpenSettings {
                    HUDButton("Open Settings", variant: .arc, action: onOpenSettings)
                } else {
                    HUDButton("New conversation", systemImage: "plus", variant: .arc, action: startNewConversation)
                        .disabled(conversations.isCreatingConversation)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(HUDTheme.space.l)
    }

    private var emptyStateText: String {
        if let conversations, let error = conversations.newConversationError { return error }
        return "Start a new conversation to talk to a provider, or open a room from the sidebar."
    }

    private var topBar: some View {
        HStack(spacing: HUDTheme.space.s) {
            if let rooms, let conversations {
                RoomSwitcher(rooms: rooms, conversations: conversations, onNewConversation: startNewConversation, onNewRoom: onNewRoom)
            } else {
                Text("Chat").font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink)
            }
            Spacer()
        }
        .padding(.horizontal, HUDTheme.space.m)
        .padding(.vertical, HUDTheme.space.s)
        .background(HUDTheme.hull)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            conversationsSection
            Rectangle().fill(HUDTheme.hairline).frame(height: 1).padding(.vertical, HUDTheme.space.xs)
            roomsSection
            Spacer()
        }
        .frame(width: 220)
        .background(HUDTheme.hull)
    }

    @ViewBuilder
    private var conversationsSection: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            HUDLabel("conversations")
            ProvenanceBadge(conversations != nil ? .live("room.list") : .notYetSourced, compact: true)
            if rooms?.isLoadingRooms == true { ProgressView().controlSize(.small) }
            Spacer()
        }
        .padding(.horizontal, HUDTheme.space.s)
        .padding(.top, HUDTheme.space.s)
        if let conversations, let rooms {
            if conversations.conversations.isEmpty, !rooms.isLoadingRooms {
                Text(conversations.isConnected ? "No conversations yet." : "Conversations need a daemon connection.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    .padding(.horizontal, HUDTheme.space.s)
            }
            ForEach(conversations.conversations) { room in roomRow(room, rooms: rooms) }
            if let error = conversations.newConversationError {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .padding(.horizontal, HUDTheme.space.s)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HUDButton("New", systemImage: "plus", variant: .ghost, compact: true, action: startNewConversation)
                .padding(.horizontal, HUDTheme.space.xs)
                .disabled(conversations.isCreatingConversation)
        } else {
            Text("Conversations need a daemon connection.")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, HUDTheme.space.s)
        }
    }

    @ViewBuilder
    private var roomsSection: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            HUDLabel("rooms")
            ProvenanceBadge(conversations != nil ? .live("room.list") : .notYetSourced, compact: true)
            Spacer()
        }
        .padding(.horizontal, HUDTheme.space.s)
        if let conversations, let rooms {
            if conversations.multiRooms.isEmpty, !rooms.isLoadingRooms {
                Text(conversations.isConnected ? "No rooms yet." : "Rooms need a daemon connection.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    .padding(.horizontal, HUDTheme.space.s)
            }
            ForEach(conversations.multiRooms) { room in roomRow(room, rooms: rooms) }
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

    /// Shared by both sidebar sections — a direct room and a multi room render identically here (the
    /// flavor only changes which section they're in), each archivable via a context menu straight
    /// into `RoomsModel.updateRoom`.
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
        .contextMenu {
            Button("Archive", role: .destructive) {
                Task { await rooms.updateRoom(room.roomId, patch: RoomUpdatePatch(archived: true)) }
            }
        }
    }

    private func startNewConversation() {
        guard let conversations else { return }
        Task { await conversations.newConversation() }
    }

    /// Mints a unique persona for the chosen catalog provider and adds it via `room.update`, then
    /// primes the composer's draft with `@persona ` so the human's very next action can mention the
    /// participant they just added (plan item 4).
    private func addParticipant(_ entry: RoomCatalogProviderEntry, to roomId: RoomID, rooms: RoomsModel) {
        Task {
            guard let key = entry.roomProviderKey ?? (try? RoomProvider(entry.provider.rawValue)) else { return }
            let existingPersonas = Set((rooms.room(roomId)?.participants ?? []).map(\.persona.rawValue))
            guard let persona = RoomsModel.mintPersona(for: entry, existingPersonas: existingPersonas) else { return }
            let spec = RoomParticipantSpec(persona: persona, provider: key, displayName: entry.provider.displayName)
            let result = await rooms.updateRoom(roomId, patch: RoomUpdatePatch(addParticipants: [spec]))
            if case .success = result {
                let current = rooms.drafts[roomId] ?? ""
                rooms.drafts[roomId] = current.isEmpty ? "@\(persona.rawValue) " : current + "@\(persona.rawValue) "
            }
        }
    }
}

#Preview("Corner chat") {
    struct Host: View {
        @State var minimized = false
        let chat = ChatModel()
        var body: some View {
            ZStack(alignment: .bottomTrailing) {
                HUDTheme.void
                CornerChatView(chat: chat, minimized: $minimized, onExpand: {})
                    .padding(24)
            }
            .frame(width: 700, height: 600)
        }
    }
    return Host().preferredColorScheme(.dark)
}
