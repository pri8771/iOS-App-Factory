import SwiftUI

// MARK: - Chat views
//
// `CornerChatView` is the floating panel bottom-right of every screen: a header with the conversation
// switcher, the transcript, an input box; it minimises to a round cyan FAB. `ChatScreen` is the same
// conversation full-screen for long work. Both talk to `ChatModel`, whose replies come from the
// `ScriptedAssistant` stub — every assistant message is tagged so, with its provenance.

public struct MessageBubble: View {
    public var message: ChatMessage

    public init(_ message: ChatMessage) { self.message = message }

    private var isUser: Bool { message.role == .user }

    public var body: some View {
        HStack(alignment: .bottom) {
            if isUser { Spacer(minLength: 40) }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 3) {
                if !isUser {
                    HStack(spacing: HUDTheme.space.xxs) {
                        HUDLabel("assistant")
                        Text("·").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.faint)
                        Text(ScriptedAssistant.name).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                            .foregroundStyle(HUDTheme.mute)
                    }
                }
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
                if let provenance = message.provenance {
                    ProvenanceBadge(provenance, compact: true)
                }
            }
            if !isUser { Spacer(minLength: 40) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(isUser ? "You" : "Assistant (scripted stub)"): \(message.text)")
    }
}

/// Transcript + composer, shared by the corner panel and the full screen.
public struct ConversationView: View {
    @Bindable public var chat: ChatModel
    public var context: () -> AssistantContext
    public var compact: Bool

    @FocusState private var focused: Bool

    public init(chat: ChatModel, context: @escaping () -> AssistantContext, compact: Bool = false) {
        self.chat = chat
        self.context = context
        self.compact = compact
    }

    public var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: HUDTheme.space.s) {
                        ForEach(chat.selected?.messages ?? []) { message in
                            MessageBubble(message).id(message.id)
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
        chat.send(chat.draft, context: context())
    }
}

/// The header's conversation switcher: a menu of conversations plus "New conversation".
public struct ConversationSwitcher: View {
    @Bindable public var chat: ChatModel

    public init(chat: ChatModel) { self.chat = chat }

    public var body: some View {
        Menu {
            ForEach(chat.conversations) { conversation in
                Button {
                    chat.select(conversation.id)
                } label: {
                    if conversation.id == chat.selectedId {
                        Label(conversation.title, systemImage: "checkmark")
                    } else {
                        Text(conversation.title)
                    }
                }
            }
            Divider()
            Button("New conversation") { chat.newConversation(title: "Untitled \(chat.conversations.count + 1)") }
        } label: {
            Text(chat.selected?.title ?? "Chat")
                .font(HUDTypography.displaySubheading)
                .foregroundStyle(HUDTheme.ink)
                .lineLimit(1)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("Conversation: \(chat.selected?.title ?? "Chat"). Switch conversation")
    }
}

// MARK: - Corner chat

public struct CornerChatView: View {
    public var chat: ChatModel
    public var context: () -> AssistantContext
    @Binding public var minimized: Bool
    public var onExpand: (() -> Void)?

    public static let panelSize = CGSize(width: 372, height: 460)

    public init(chat: ChatModel, context: @escaping () -> AssistantContext, minimized: Binding<Bool>,
                onExpand: (() -> Void)? = nil) {
        self.chat = chat
        self.context = context
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
                ConversationSwitcher(chat: chat)
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
            ConversationView(chat: chat, context: context, compact: true)
        }
        .frame(width: Self.panelSize.width, height: Self.panelSize.height)
        .background(HUDTheme.plate)
        .overlay(Rectangle().stroke(HUDTheme.hairline, lineWidth: 1))
        .overlay(HUDBrackets().stroke(HUDTheme.arcDim, style: StrokeStyle(lineWidth: 1, lineCap: .square)))
        .shadow(color: Color.black.opacity(0.45), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Chat panel")
    }
}

// MARK: - Full-screen chat

public struct ChatScreen: View {
    public var chat: ChatModel
    public var context: () -> AssistantContext

    public init(chat: ChatModel, context: @escaping () -> AssistantContext) {
        self.chat = chat
        self.context = context
    }

    public var body: some View {
        HStack(spacing: 0) {
            sidebar
            Rectangle().fill(HUDTheme.hairline).frame(width: 1)
            VStack(spacing: 0) {
                HStack(spacing: HUDTheme.space.s) {
                    ConversationSwitcher(chat: chat)
                    Spacer()
                    HUDLabel("assistant")
                    Text(ScriptedAssistant.name).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                        .foregroundStyle(HUDTheme.mute)
                    ProvenanceBadge(.staticValue("phase 1"), compact: true)
                }
                .padding(.horizontal, HUDTheme.space.m)
                .padding(.vertical, HUDTheme.space.s)
                .background(HUDTheme.hull)
                Rectangle().fill(HUDTheme.hairline).frame(height: 1)
                ConversationView(chat: chat, context: context)
            }
        }
        .background(HUDTheme.void)
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HUDLabel("conversations").padding(.horizontal, HUDTheme.space.s).padding(.top, HUDTheme.space.s)
            ForEach(chat.conversations) { conversation in
                Button { chat.select(conversation.id) } label: {
                    HStack {
                        Text(conversation.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                        Spacer()
                        Text("\(conversation.messages.count)").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
                    }
                    .padding(.horizontal, HUDTheme.space.s)
                    .padding(.vertical, HUDTheme.space.xs)
                    .background(conversation.id == chat.selectedId ? HUDTheme.raised : Color.clear)
                    .overlay(alignment: .leading) {
                        if conversation.id == chat.selectedId { Rectangle().fill(HUDTheme.arc).frame(width: 2) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(conversation.id == chat.selectedId ? .isSelected : [])
            }
            HUDButton("New", systemImage: "plus", variant: .ghost, compact: true) {
                chat.newConversation(title: "Untitled \(chat.conversations.count + 1)")
            }
            .padding(.horizontal, HUDTheme.space.xs)
            Spacer()
            Text("Rooms and persistence arrive with the studio service (phase 2/3).")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
                .padding(HUDTheme.space.s)
        }
        .frame(width: 220)
        .background(HUDTheme.hull)
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
