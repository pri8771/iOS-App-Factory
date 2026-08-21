import Foundation

// MARK: - Studio settings (settings.ts, `settings.*` — Wave 8)
//
// Mirrors `packages/contracts/src/v1/settings.ts`: a small, cross-client preference table the kernel
// owns (migration `0016-studio-settings`) — deliberately separate from the machine-local provider
// config JSON (Provider.swift), because "which configured instance is the default" is a preference a
// human sets once and expects to follow them across every client, not a fact about one daemon's
// filesystem. See "Architecture decisions" item 4 in the Studio chat-first shell plan.
//
// Unconditionally supported — no unsupported-operation fallback, same as `room.*`/`provider.*`.

/// `StudioSettingKeyV1` — the only key today is `default-provider`.
public enum StudioSettingKey: String, Hashable, Sendable, Codable, CaseIterable {
    case defaultProvider = "default-provider"
}

/// `value` is `nil` exactly when the key has never been set; `updatedAt` mirrors that (`nil` until
/// the first `settings.set`) — the same "answer honestly, never fabricate" discipline
/// `RoomParticipantsCatalog.unavailableReason` already applies. Decode-only: the client never sends
/// a whole `StudioSettingEntry` back — `settings.set` sends just `key`/`value`
/// (`SettingsSetPayload`).
public struct StudioSettingEntry: Hashable, Sendable, Codable {
    public var key: StudioSettingKey
    public var value: RoomProvider?
    public var updatedAt: IsoInstant?

    public init(key: StudioSettingKey, value: RoomProvider?, updatedAt: IsoInstant?) {
        self.key = key
        self.value = value
        self.updatedAt = updatedAt
    }
}

// MARK: Command payloads

public struct SettingsGetPayload: Encodable, Sendable, Hashable {
    public var key: StudioSettingKey
    public init(key: StudioSettingKey) { self.key = key }
}

public struct SettingsSetPayload: Encodable, Sendable, Hashable {
    public var key: StudioSettingKey
    public var value: RoomProvider
    public init(key: StudioSettingKey, value: RoomProvider) {
        self.key = key
        self.value = value
    }
}

// MARK: Command result — shared shape for `settings.get`/`settings.set` (`{operation, entry}`).

public struct SettingsResult: Hashable, Sendable, Codable { public var entry: StudioSettingEntry }
