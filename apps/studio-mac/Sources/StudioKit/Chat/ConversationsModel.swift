import Foundation
import Observation

// MARK: - ConversationsModel
//
// A THIN façade over `RoomsModel` (Architecture decisions 1 and 14): a "conversation" is exactly a
// `flavor == .direct` room, a "room" (in the sidebar's other section) is a `flavor == .room` one.
// `room.create`/`.list`/`.post`/`.events` machinery all already lives in `RoomsModel` — this type adds
// no wire calls of its own for any of that, only the flavor filter and the one genuinely new flow: a
// brand-new conversation, which needs `settings.get default-provider` (a different wire family,
// `SettingsModel`'s) before it can build a `room.create` spec.
//
// Loading is `RoomsModel`'s own — `conversations`/`multiRooms` simply re-present whatever `rooms.rooms`
// last held (view-driven `loadRoomsIfNeeded()`/the 15s refresh loop already keep it fresh); this façade
// adds no polling or caching of its own.

@Observable
@MainActor
public final class ConversationsModel {

    private let client: DaemonClient?
    private let rooms: RoomsModel

    public private(set) var isCreatingConversation = false
    public private(set) var newConversationError: String?
    /// Set (alongside `newConversationError`) exactly when the last `newConversation()` call refused
    /// because no default provider is set — the sidebar's "New conversation" affordance uses this to
    /// offer a direct link to Settings instead of a bare error string, rather than the caller having
    /// to string-match `newConversationError`.
    public private(set) var needsDefaultProvider = false

    public init(client: DaemonClient?, rooms: RoomsModel) {
        self.client = client
        self.rooms = rooms
    }

    public var isConnected: Bool { client != nil }

    /// Direct rooms — one AI participant, the moderator's fast path (Architecture decision 1).
    /// Archived rooms are already excluded by `RoomsModel.loadRooms()`'s `includeArchived: false`.
    public var conversations: [Room] { rooms.rooms.filter { $0.flavor == .direct } }

    /// Multi-participant rooms. `archivedAt == nil` is redundant with `rooms.rooms`'s own
    /// `includeArchived: false` load, kept here anyway so this façade never depends on that default
    /// silently staying true.
    public var multiRooms: [Room] { rooms.rooms.filter { $0.flavor == .room && $0.archivedAt == nil } }

    /// Starts a new conversation: reads the cross-client default-provider preference
    /// (`settings.get`), then creates a direct room with that one provider as its sole participant —
    /// display name sourced from `room.participants.list`'s catalog, never guessed — and selects it
    /// (`RoomsModel.createRoom` already does the select-on-success). Refuses honestly, with
    /// `needsDefaultProvider` set, when no default is configured yet: never falls back to guessing a
    /// provider.
    @discardableResult
    public func newConversation() async -> Result<Room, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        isCreatingConversation = true
        newConversationError = nil
        needsDefaultProvider = false
        defer { isCreatingConversation = false }
        do {
            let defaultEntry = try await client.getSetting(.defaultProvider)
            guard let key = defaultEntry.value else {
                needsDefaultProvider = true
                let message = "No default provider is set — set one in Settings before starting a conversation."
                newConversationError = message
                return .failure(AssistantBackendError(message))
            }
            guard let persona = try? RoomPersona(key.rawValue) else {
                let message = "Default provider key \"\(key.rawValue)\" isn't a valid persona — reconfigure it in Settings."
                newConversationError = message
                return .failure(AssistantBackendError(message))
            }
            if rooms.participantsCatalog == nil { await rooms.loadParticipantsCatalog() }
            let displayName = Self.displayName(for: key, catalog: rooms.participantsCatalog)
            let participant = RoomParticipantSpec(persona: persona, provider: key, displayName: displayName)
            let result = await rooms.createRoom(title: "New conversation", projectId: nil, unattendedEnabled: false,
                                                participants: [participant], flavor: .direct,
                                                budget: RoomsModel.defaultBudgetPolicy)
            if case .failure(let error) = result { newConversationError = error.description }
            return result
        } catch {
            let message = Self.describe(error)
            newConversationError = message
            return .failure(AssistantBackendError(message))
        }
    }

    /// The catalog's own display name for `key` (its `RoomCatalogProviderEntry.provider.displayName`
    /// — e.g. "openrouter-fast" -> "OpenRouter"), falling back to the bare key when the catalog has no
    /// matching entry (unread, unreadable, or a key the catalog doesn't currently list) — an honest
    /// degrade, not an invented name.
    private static func displayName(for key: RoomProvider, catalog: RoomParticipantsCatalog?) -> String {
        guard let catalog else { return key.rawValue }
        let entry = catalog.providers.first { ($0.roomProviderKey?.rawValue ?? $0.provider.rawValue) == key.rawValue }
        return entry?.provider.displayName ?? key.rawValue
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
