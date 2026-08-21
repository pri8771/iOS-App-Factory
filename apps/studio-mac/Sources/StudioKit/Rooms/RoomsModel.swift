import Foundation
import Observation

// MARK: - RoomsModel
//
// The observable state behind the rooms UI: the room list (`room.list`), the selected room's live
// transcript (`room.events`, cursor-polled), posting (`room.post`), the debounced typing signal
// (`room.typing`), and the daemon's configured participants catalog (`room.participants.list`, read
// whenever the new-room sheet appears so its roster defaults are sourced, not guessed). Mirrors
// `StudioStore`'s discipline — `nil`/empty until actually read, per-room errors kept rather than
// swallowed. As of Wave 9b (Architecture decisions 1/14), a "conversation" is just a `flavor ==
// .direct` room — `ConversationsModel` is a thin façade filtering this same model's `rooms`, not a
// second wire family; `ChatModel` (Chat/ChatModel.swift) now only overlays local intent-confirmation
// cards on top of the transcripts this model already owns.
//
// Polling: `select(_:)` starts a ~1.5s poll loop for the chosen room and stops any previous one;
// `select(nil)` (or `stopPolling()`) stops it outright. Callers are responsible for calling
// `select(nil)`/`stopPolling()` when the room UI leaves the screen — "poll while visible, stop when
// hidden" is a view-lifecycle decision this model does not make for itself.

@Observable
@MainActor
public final class RoomsModel {

    public private(set) var rooms: [Room] = []
    public private(set) var isLoadingRooms = false
    public private(set) var roomsError: String?
    public private(set) var isCreatingRoom = false
    public private(set) var createRoomError: String?

    /// `room.participants.list` — `nil` until read; the daemon's honest `enabled: false` catalog when
    /// the rooms subsystem is off (see `NewRoomSheet`).
    public private(set) var participantsCatalog: RoomParticipantsCatalog?
    public private(set) var isLoadingParticipantsCatalog = false
    public private(set) var participantsCatalogError: String?

    public private(set) var selectedRoomId: RoomID?
    public private(set) var transcripts: [RoomID: RoomTranscript] = [:]
    public private(set) var roomErrors: [RoomID: String] = [:]
    public var drafts: [RoomID: String] = [:]

    /// The human's transcript identity (`RoomHumanHandleV1`). Defaults to the local account name.
    public let handle: RoomHumanHandle
    public var now: @Sendable () -> Date

    private let client: DaemonClient?
    private var pollTask: Task<Void, Never>?
    private var typingTask: Task<Void, Never>?
    /// Wave 9b (Architecture decision 14, plan item 5): while a `room.update` is in flight or has
    /// just landed, the ~1.5s poll must not clobber the update's own result with a concurrently-
    /// fetched `room.events` snapshot that predates it — `poll(_:)` ignores any room snapshot older
    /// than this floor, and clears the floor once a snapshot catches up to (or passes) it.
    private var roomUpdateFloor: [RoomID: IsoInstant] = [:]

    public init(client: DaemonClient?, handle: RoomHumanHandle = RoomsModel.defaultHandle(),
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.handle = handle
        self.now = now
    }

    public var isConnected: Bool { client != nil }

    /// The freshest known record for a room: the live transcript's copy (updated by every poll/post)
    /// when loaded, else the entry from the last `room.list`.
    public func room(_ id: RoomID) -> Room? {
        transcripts[id]?.room ?? rooms.first { $0.roomId == id }
    }

    // MARK: Room list

    public func loadRooms() async {
        guard let client else { return }
        isLoadingRooms = true
        defer { isLoadingRooms = false }
        do {
            rooms = try await client.listRooms(limit: 100)
            roomsError = nil
        } catch {
            roomsError = Self.describe(error)
        }
    }

    /// `loadRooms()` only if the list has never been loaded (and isn't mid-load) — the guard a view's
    /// `.task { }` should use on every appearance, mirroring `ProjectDetailView`'s
    /// `.task(id:) { guard …, runs[id] == nil else { return } }` idiom: reload once, not on every
    /// redraw.
    public func loadRoomsIfNeeded() async {
        guard rooms.isEmpty, !isLoadingRooms else { return }
        await loadRooms()
    }

    // MARK: Participants catalog

    /// Reads the daemon's configured participants (`room.participants.list`). Cheap and read-only, so
    /// callers refresh it on every new-room sheet appearance rather than caching a stale roster.
    public func loadParticipantsCatalog() async {
        guard let client else { return }
        isLoadingParticipantsCatalog = true
        defer { isLoadingParticipantsCatalog = false }
        do {
            participantsCatalog = try await client.roomParticipants()
            participantsCatalogError = nil
        } catch {
            participantsCatalogError = Self.describe(error)
        }
    }

    public static let defaultAgentCooldownEvents = 4
    /// A conservative starting budget policy — the human can raise it later; nothing in `room.create`
    /// requires Studio to guess a "right" number, but the form needs *some* valid default to prefill.
    public static let defaultBudgetPolicy = RoomBudgetPolicy(
        dailyCeilingTokens: 200_000, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 4_000)

    @discardableResult
    public func createRoom(title: String, projectId: ProjectID?, unattendedEnabled: Bool,
                           agentCooldownEvents: Int = RoomsModel.defaultAgentCooldownEvents,
                           participants: [RoomParticipantSpec], flavor: RoomFlavor = .room,
                           budget: RoomBudgetPolicy = RoomsModel.defaultBudgetPolicy) async -> Result<Room, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        isCreatingRoom = true
        defer { isCreatingRoom = false }
        let spec = RoomCreateSpec(roomId: RoomID.generate(), title: title, projectId: projectId, flavor: flavor,
                                  unattendedEnabled: unattendedEnabled, agentCooldownEvents: agentCooldownEvents,
                                  participants: participants, budget: budget)
        do {
            let result = try await client.createRoom(spec)
            createRoomError = nil
            await loadRooms()
            select(result.room.roomId)
            return .success(result.room)
        } catch {
            let message = Self.describe(error)
            createRoomError = message
            return .failure(AssistantBackendError(message))
        }
    }

    // MARK: Selection + polling

    /// Selects a room (or `nil` to deselect) and (re)starts its poll loop; any previous room's loop
    /// stops. Loads the full transcript from sequence 0 on first selection so the roster's
    /// derived-from-transcript state (see `RoomRosterPanel`) has the whole history to reason over.
    public func select(_ id: RoomID?) {
        guard selectedRoomId != id else { return }
        selectedRoomId = id
        pollTask?.cancel()
        pollTask = nil
        guard let id else { return }
        Task { await self.loadTranscript(id) }
        startPolling(id)
    }

    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /// Resumes polling the currently-selected room without reloading it — e.g. the chat tab or the
    /// corner panel became visible again after being hidden.
    public func resumePollingSelected() {
        guard let id = selectedRoomId, pollTask == nil else { return }
        startPolling(id)
    }

    private func startPolling(_ id: RoomID, interval: Duration = .milliseconds(1500)) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.poll(id)
                try? await Task.sleep(for: interval)
            }
        }
    }

    /// The full transcript from sequence 0, cached like `StudioStore.loadRun`/`loadMilestones`. `force`
    /// refetches even when a cached transcript already exists (a plain `select(_:)` does not force —
    /// the poll loop it starts keeps the cache fresh from there).
    @discardableResult
    public func loadTranscript(_ id: RoomID, force: Bool = false) async -> RoomTranscript? {
        if !force, let cached = transcripts[id] { return cached }
        guard let client else { return nil }
        do {
            let result = try await client.roomEvents(roomId: id, afterSequence: 0, limit: maxRoomEventsLimit)
            let transcript = RoomTranscript(room: result.room, moderator: result.moderator,
                                            messages: Self.dedupSorted(result.messages),
                                            nextAfterSequence: result.nextAfterSequence)
            transcripts[id] = transcript
            roomErrors[id] = nil
            return transcript
        } catch {
            roomErrors[id] = Self.describe(error)
            return nil
        }
    }

    private func poll(_ id: RoomID) async {
        guard let client else { return }
        let after = transcripts[id]?.nextAfterSequence ?? 0
        do {
            let result = try await client.roomEvents(roomId: id, afterSequence: after, limit: 200)
            var transcript = transcripts[id] ?? RoomTranscript()
            if let floor = roomUpdateFloor[id], result.room.updatedAt < floor {
                // Stale relative to an in-flight/just-applied `room.update` — keep the newer room
                // snapshot already applied optimistically or by that update's own result; messages/
                // moderator below are monotonic and still safe to merge.
            } else {
                transcript.room = result.room
                roomUpdateFloor[id] = nil
            }
            transcript.moderator = result.moderator
            if !result.messages.isEmpty {
                transcript.messages = Self.dedupSorted(transcript.messages + result.messages)
            }
            transcript.nextAfterSequence = max(transcript.nextAfterSequence, result.nextAfterSequence)
            transcripts[id] = transcript
            roomErrors[id] = nil
        } catch {
            roomErrors[id] = Self.describe(error)
        }
    }

    private static func dedupSorted(_ messages: [RoomMessage]) -> [RoomMessage] {
        var seen = Set<RoomMessageID>()
        var result: [RoomMessage] = []
        for message in messages.sorted(by: { $0.sequence < $1.sequence }) where !seen.contains(message.id) {
            seen.insert(message.id)
            result.append(message)
        }
        return result
    }

    // MARK: Posting + typing

    /// Posts the room's current draft. Returns the posted message on success (so a caller — see
    /// `ChatModel.send` — can anchor a local overlay item to its `sequence`), `nil` on an empty draft
    /// or a failed post (the draft is preserved either way, per the doc comment on `roomErrors`).
    @discardableResult
    public func send(_ id: RoomID) async -> RoomChatMessage? {
        guard let client else { return nil }
        let text = (drafts[id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        drafts[id] = ""
        do {
            let result = try await client.postToRoom(roomId: id, handle: handle, body: text)
            var transcript = transcripts[id] ?? RoomTranscript()
            transcript.room = result.room
            transcript.messages = Self.dedupSorted(transcript.messages + [.message(result.message)])
            transcript.nextAfterSequence = max(transcript.nextAfterSequence, result.message.sequence)
            transcripts[id] = transcript
            roomErrors[id] = nil
            return result.message
        } catch {
            roomErrors[id] = Self.describe(error)
            drafts[id] = text // don't lose what the human typed
            return nil
        }
    }

    // MARK: room.update (Architecture decision 7 / plan item 5)

    /// A durable CAS patch over an existing room — title rename, archive, participant add/remove,
    /// budget policy. No optimistic UX (unlike `setUnattended` below): rename/archive are infrequent,
    /// human-initiated edits where waiting for the daemon's own echo is the simpler, safer default.
    /// Still sets `roomUpdateFloor` so the ~1.5s poll can't race a concurrently-fetched stale snapshot
    /// ahead of this update's own result.
    @discardableResult
    public func updateRoom(_ id: RoomID, patch: RoomUpdatePatch) async -> Result<Room, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        guard let current = room(id) else { return .failure(AssistantBackendError("room not loaded yet")) }
        do {
            let updated = try await client.updateRoom(roomId: id, expectedUpdatedAt: current.updatedAt, patch: patch)
            roomUpdateFloor[id] = updated.updatedAt
            replaceRoom(id, with: updated)
            roomErrors[id] = nil
            return .success(updated)
        } catch {
            let message = Self.describe(error)
            roomErrors[id] = message
            return .failure(AssistantBackendError(message))
        }
    }

    /// The ambient toggle (multi rooms only — the daemon forces `unattendedEnabled` false server-side
    /// for a direct room regardless of what a client sends): flips the room's local state immediately
    /// so the switch tracks the tap, then reconciles with the daemon's own result — reverting and
    /// surfacing an honest error on failure, exactly like every other optimistic write in this app
    /// never pretends success it hasn't confirmed.
    @discardableResult
    public func setUnattended(_ id: RoomID, enabled: Bool) async -> Result<Room, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        guard let previous = room(id) else { return .failure(AssistantBackendError("room not loaded yet")) }
        replaceRoom(id, with: Self.mutating(previous) { $0.unattendedEnabled = enabled })
        do {
            let updated = try await client.updateRoom(roomId: id, expectedUpdatedAt: previous.updatedAt,
                                                       patch: RoomUpdatePatch(unattendedEnabled: enabled))
            roomUpdateFloor[id] = updated.updatedAt
            replaceRoom(id, with: updated)
            roomErrors[id] = nil
            return .success(updated)
        } catch {
            replaceRoom(id, with: previous)
            let message = Self.describe(error)
            roomErrors[id] = message
            return .failure(AssistantBackendError(message))
        }
    }

    private static func mutating(_ room: Room, _ mutate: (inout Room) -> Void) -> Room {
        var next = room
        mutate(&next)
        return next
    }

    /// Writes `next` into both the cached transcript's room snapshot and the flat `rooms` list, so
    /// every reader (`room(_:)`, the sidebar, the roster panel) sees the same value immediately —
    /// mirrors how `send`/`poll`/`loadTranscript` already keep those two copies in sync.
    private func replaceRoom(_ id: RoomID, with next: Room) {
        if var transcript = transcripts[id] {
            transcript.room = next
            transcripts[id] = transcript
        } else {
            transcripts[id] = RoomTranscript(room: next)
        }
        if let index = rooms.firstIndex(where: { $0.roomId == id }) { rooms[index] = next }
    }

    /// A unique persona for a client-minted `@mention`-into-thread participant add (plan item 4): the
    /// catalog entry's own room-provider key (its `roomProviderKey`, or the bare provider name for a
    /// legacy entry recorded before that field existed — same fallback `RoomParticipantsCatalog`
    /// itself uses) — "family name, then family-2" when that key already names a seat in the room.
    /// `nil` only if the entry's key somehow fails `RoomPersona`'s own pattern (never true for a
    /// daemon-sourced key in practice).
    public static func mintPersona(for entry: RoomCatalogProviderEntry, existingPersonas: Set<String>) -> RoomPersona? {
        let base = entry.roomProviderKey?.rawValue ?? entry.provider.rawValue
        var candidate = base
        var suffix = 2
        while existingPersonas.contains(candidate) {
            candidate = "\(base)-\(suffix)"
            suffix += 1
        }
        return try? RoomPersona(candidate)
    }

    private static let typingSignalTtlMs = 6_000

    /// Debounced 400ms: a burst of keystrokes sends at most one `room.typing` call.
    public func signalTyping(_ id: RoomID) {
        typingTask?.cancel()
        guard let client else { return }
        let handle = self.handle
        typingTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            _ = try? await client.signalRoomTyping(roomId: id, handle: handle, ttlMs: RoomsModel.typingSignalTtlMs)
        }
    }

    // MARK: Defaults

    /// The local account name, sanitized to `RoomHumanHandleV1`'s pattern
    /// (`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`). Falls back to "operator" if sanitizing empties it out.
    public static func defaultHandle(environment: [String: String] = ProcessInfo.processInfo.environment) -> RoomHumanHandle {
        let raw = environment["USER"] ?? NSUserName()
        let allowed = CharacterSet(charactersIn: "._-").union(.alphanumerics)
        var sanitized = String(String.UnicodeScalarView(raw.unicodeScalars.filter { allowed.contains($0) }))
        while let first = sanitized.unicodeScalars.first, !CharacterSet.alphanumerics.contains(first) {
            sanitized.removeFirst()
        }
        sanitized = String(sanitized.prefix(64))
        if let handle = try? RoomHumanHandle(sanitized) { return handle }
        return RoomHumanHandle(unchecked: "operator")
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}

/// One room's locally-accumulated view of `room.events`: the latest room/moderator snapshot plus the
/// deduplicated, sequence-ordered message list, and the cursor for the next poll.
public struct RoomTranscript: Sendable {
    public var room: Room?
    public var moderator: RoomModeratorStatus?
    public var messages: [RoomMessage] = []
    public var nextAfterSequence: Int = 0

    public init(room: Room? = nil, moderator: RoomModeratorStatus? = nil, messages: [RoomMessage] = [],
                nextAfterSequence: Int = 0) {
        self.room = room
        self.moderator = moderator
        self.messages = messages
        self.nextAfterSequence = nextAfterSequence
    }
}
