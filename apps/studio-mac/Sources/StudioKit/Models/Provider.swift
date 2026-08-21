import Foundation

// MARK: - Provider registry (provider.ts, `provider.*` — Wave 8)
//
// Mirrors `packages/contracts/src/v1/provider.ts`. The roster of AI providers/instances the daemon
// can dispatch a room, phase, or signal contribution to. The registry's source of truth stays the
// participants config JSON file the daemon already reads once at start
// (`APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG`) — these are only the wire shapes that cross the command
// boundary to read and mutate that roster (`provider.list`/`.upsert`/`.remove`/`.credential.set`/
// `.health`), never a second source of truth. See "Architecture decisions" items 2 and 3 in the
// Studio chat-first shell plan.
//
// `key` is the same room-provider key a room's cast, an `@mention`, or a Signal's `scoutProvider`
// already reference (`RoomProvider`; e.g. `codex`, `openrouter-fast`) — one instance, one key,
// everywhere in the wire protocol.
//
// Unconditionally supported (this contract's daemon build always registers `provider.*`) — no
// unsupported-operation fallback, same as `room.*`.

public let maxProviderInstances = 32
public let maxProviderCredentialSecretLength = 4_000
public let maxProviderHealthDetailLength = 1_000

/// `ProviderFamilyV1` — deliberately its own type, not a reuse of `RoomCatalogProvider`
/// (Room.swift): the TS source keeps `ProviderFamilyV1Schema` and `RoomCatalogProviderV1Schema` as
/// two independently-defined schemas with (today) the same five values but different semantic roles
/// — one names the provider registry's own family, the other names what the room-participants
/// catalog configured an adapter for.
public enum ProviderFamily: String, Hashable, Sendable, Codable, CaseIterable {
    case codex, claude, gemini, ollama, openrouter
}

/// `kind: "macos-keychain"` literal on `CredentialReferenceV1` — decoded/encoded strictly, mirroring
/// `SchemaVersion1`'s "decode fails loudly on anything else" discipline.
public struct CredentialKindMacOSKeychain: Hashable, Sendable, Codable {
    public init() {}

    public init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        guard value == "macos-keychain" else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Expected kind \"macos-keychain\", got \(value.debugDescription)"))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode("macos-keychain")
    }
}

/// `CredentialReferenceV1` — mirrors `@app-factory/adapter-sdk`'s type field-for-field (the
/// TS source hand-keeps this same mirror, since `packages/contracts` cannot depend on any other
/// workspace package). Safe to persist in the provider config file; the credential value itself
/// never is. Decode-only: the client never sends a `CredentialReference` back to the daemon (the
/// bare secret crosses the wire exactly once, through `provider.credential.set`'s own `secret`
/// field — see `ProviderCredentialSetPayload`).
public struct CredentialReference: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var kind: CredentialKindMacOSKeychain = .init()
    public var service: String
    public var account: String

    public init(service: String, account: String) {
        self.service = service
        self.account = account
    }
}

/// `ProviderInstanceV1` — one configured instance in the registry. Decode-only (never sent back as
/// a payload; `provider.upsert` sends a `ProviderUpsertSpec` instead, which never carries a
/// credential).
public struct ProviderInstance: Hashable, Sendable, Codable, Identifiable {
    public var key: RoomProvider
    public var family: ProviderFamily
    /// The effective model the instance speaks (the daemon resolves a family default when unset).
    public var model: String
    public var displayName: String
    public var credentialReference: CredentialReference?

    public var id: RoomProvider { key }

    public init(key: RoomProvider, family: ProviderFamily, model: String, displayName: String,
                credentialReference: CredentialReference?) {
        self.key = key
        self.family = family
        self.model = model
        self.displayName = displayName
        self.credentialReference = credentialReference
    }
}

/// What a client proposes to `provider.upsert`. Never carries a credential (Architecture decision
/// 2) — upsert only ever names or reconfigures an instance; the daemon preserves whatever
/// `credentialReference` (if any) that instance already had.
public struct ProviderUpsertSpec: Hashable, Sendable, Codable {
    public var key: RoomProvider
    public var family: ProviderFamily
    public var model: String
    public var displayName: String

    public init(key: RoomProvider, family: ProviderFamily, model: String, displayName: String) {
        self.key = key
        self.family = family
        self.model = model
        self.displayName = displayName
    }
}

public enum ProviderHealthStatus: String, Hashable, Sendable, Codable, CaseIterable {
    case ok, unreachable, unauthenticated
    case notConfigured = "not-configured"
    case blocked
}

/// Honest nulls (Architecture decision 3): a probe that could not measure latency, could not
/// identify a version, or has nothing more to say than its status reports `nil` for that field,
/// never a fabricated value. `detail` carries the probe's own words for anything other than plain
/// `.ok` — a blocked-on-attestation reason, an auth failure, a timeout.
public struct ProviderHealthReport: Hashable, Sendable, Codable {
    public var status: ProviderHealthStatus
    public var detail: String?
    public var latencyMs: Int?
    public var version: String?

    public init(status: ProviderHealthStatus, detail: String?, latencyMs: Int?, version: String?) {
        self.status = status
        self.detail = detail
        self.latencyMs = latencyMs
        self.version = version
    }
}

public struct ProviderHealthEntry: Hashable, Sendable, Codable, Identifiable {
    public var key: RoomProvider
    public var report: ProviderHealthReport

    public var id: RoomProvider { key }

    public init(key: RoomProvider, report: ProviderHealthReport) {
        self.key = key
        self.report = report
    }
}

// MARK: Command payloads

/// `provider.upsert`. `expectedDigest: nil` accepts whatever the config file currently holds — the
/// same "no expectation yet" convention `PhaseDefinitionUpsert.expectedRevision` already uses.
/// `expectedDigest` is `nullable`, not `optional`, on the wire, so it is always emitted explicitly.
public struct ProviderUpsertPayload: Encodable, Sendable, Hashable {
    public var instance: ProviderUpsertSpec
    public var expectedDigest: Sha256Digest?

    public init(instance: ProviderUpsertSpec, expectedDigest: Sha256Digest?) {
        self.instance = instance
        self.expectedDigest = expectedDigest
    }

    private enum CodingKeys: String, CodingKey { case instance, expectedDigest }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(instance, forKey: .instance)
        try c.encode(expectedDigest, forKey: .expectedDigest)
    }
}

public struct ProviderRemovePayload: Encodable, Sendable, Hashable {
    public var key: RoomProvider
    public var expectedDigest: Sha256Digest?

    public init(key: RoomProvider, expectedDigest: Sha256Digest?) {
        self.key = key
        self.expectedDigest = expectedDigest
    }

    private enum CodingKeys: String, CodingKey { case key, expectedDigest }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(key, forKey: .key)
        try c.encode(expectedDigest, forKey: .expectedDigest)
    }
}

/// Carries the bare credential value ONCE, over the owner-only 0600 socket (Architecture decision
/// 2). Never journaled, never logged; the daemon writes straight to the Keychain and returns only a
/// `CredentialReference`.
public struct ProviderCredentialSetPayload: Encodable, Sendable, Hashable {
    public var key: RoomProvider
    public var secret: String

    public init(key: RoomProvider, secret: String) {
        self.key = key
        self.secret = secret
    }
}

/// `key: nil` probes every configured instance.
public struct ProviderHealthPayload: Encodable, Sendable, Hashable {
    public var key: RoomProvider?

    public init(key: RoomProvider?) {
        self.key = key
    }

    private enum CodingKeys: String, CodingKey { case key }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(key, forKey: .key)
    }
}

// MARK: Command results

public struct ProviderUpsertResult: Hashable, Sendable, Codable {
    public var instance: ProviderInstance
    public var created: Bool
    /// The provider config file's digest after this write — the next CAS `expectedDigest`.
    public var digest: Sha256Digest
}

public struct ProviderRemoveResult: Hashable, Sendable, Codable {
    public var removed: Bool
    public var digest: Sha256Digest
}

/// Never echoes the secret; only the reference the daemon just wrote to the Keychain.
public struct ProviderCredentialSetResult: Hashable, Sendable, Codable {
    public var key: RoomProvider
    public var credentialReference: CredentialReference
}

// MARK: Wire-shaped decode wrappers (mirror `RoomListResult`'s pattern: decode the whole result
// object through a small `Codable` struct that only declares the field(s) it needs, ignoring
// `operation` and any sibling keys — avoids touching `CommandResult`'s shared `CodingKeys`).

public struct ProviderListResult: Hashable, Sendable, Codable { public var providers: [ProviderInstance] }
public struct ProviderHealthResult: Hashable, Sendable, Codable { public var reports: [ProviderHealthEntry] }
