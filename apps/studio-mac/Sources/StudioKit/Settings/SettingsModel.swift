import Foundation
import Observation

// MARK: - SettingsModel
//
// The observable state behind Settings → Providers (Wave 9a; Architecture decisions 2-4): the
// provider registry (`provider.list`), its health (`provider.health`), and the cross-client default
// provider preference (`settings.get`/`.set`). Owned by `StudioStore`, mirroring `RoomsModel`/
// `PhasesModel` — a distinct wire family gets its own model, not a mode of an existing one.
//
// Loading is view-driven, not a standing poll: `load()` reads all three on every Settings-tab
// appearance, the same "cheap and read-only, so refresh on every appearance" discipline
// `RoomsModel.loadParticipantsCatalog()` already uses for the new-room sheet's roster. Mutations
// (`upsertProvider`/`removeProvider`/`setCredential`/`makeDefault`) keep a per-instance-key busy flag
// and a per-instance-key error string — the roster disables and annotates exactly the row being
// mutated, never the whole screen (`RoomsModel`'s per-room `roomErrors` is the same idea one level
// up). Errors are the daemon's own honest `code: message` (`DaemonClientError.description`, already
// "truncated to code+message" by construction) — this model never assembles its own error text from
// a payload, so a credential can never leak into an error string: `setCredential`'s only wire
// response is `ProviderCredentialSetResult`, which has no field a secret could ride in (see
// `ProviderClientTests.testProviderCredentialSetNeverEchoesTheSecretOnlyTheReference`), and this
// model never retains the `secret` parameter past the single `await` that sends it.

@Observable
@MainActor
public final class SettingsModel {

    // MARK: Provider registry

    public private(set) var providers: [ProviderInstance] = []
    public private(set) var isLoadingProviders = false
    public private(set) var providersError: String?

    // MARK: Health (`provider.health`, key: nil — every configured instance)

    public private(set) var health: [RoomProvider: ProviderHealthReport] = [:]
    public private(set) var isLoadingHealth = false
    public private(set) var healthError: String?

    // MARK: Default provider (`settings.get`/`.set default-provider`)

    public private(set) var defaultProviderKey: RoomProvider?
    public private(set) var isLoadingDefault = false
    public private(set) var defaultError: String?

    // MARK: Per-row mutation state

    /// Instance keys with a remove / credential-set / make-default mutation in flight. `upsertProvider`
    /// (a brand-new instance) is tracked by the add-instance sheet's own local `@State` instead — there
    /// is no existing row to disable until the instance exists.
    public private(set) var busyKeys: Set<RoomProvider> = []
    /// The last remove/credential-set/make-default error for that instance key, honest code+message.
    public private(set) var rowErrors: [RoomProvider: String] = [:]

    private let client: DaemonClient?

    public init(client: DaemonClient?) {
        self.client = client
    }

    public var isConnected: Bool { client != nil }

    // MARK: Load

    /// `provider.list` + `provider.health` + `settings.get` — called on every Settings-tab appearance
    /// (no standing poll; see the header comment). Per-op errors are kept independently so a failing
    /// health probe never hides an otherwise-successful provider list.
    public func load() async {
        await loadProviders()
        await loadHealth()
        await loadDefault()
    }

    public func loadProviders() async {
        guard let client else { return }
        isLoadingProviders = true
        defer { isLoadingProviders = false }
        do {
            providers = try await client.listProviders()
            providersError = nil
        } catch {
            providersError = Self.describe(error)
        }
    }

    public func loadHealth() async {
        guard let client else { return }
        isLoadingHealth = true
        defer { isLoadingHealth = false }
        do {
            let reports = try await client.providerHealth()
            var next: [RoomProvider: ProviderHealthReport] = [:]
            for entry in reports { next[entry.key] = entry.report }
            health = next
            healthError = nil
        } catch {
            healthError = Self.describe(error)
        }
    }

    public func loadDefault() async {
        guard let client else { return }
        isLoadingDefault = true
        defer { isLoadingDefault = false }
        do {
            let entry = try await client.getSetting(.defaultProvider)
            defaultProviderKey = entry.value
            defaultError = nil
        } catch {
            defaultError = Self.describe(error)
        }
    }

    /// A single instance's health, re-probed after `setCredential` succeeds so its badge reflects the
    /// new credential immediately rather than waiting for the next full `loadHealth()`. Merges into
    /// the existing map (a partial result) rather than replacing it.
    private func refreshHealth(for key: RoomProvider) async {
        guard let client else { return }
        if let report = try? await client.providerHealth(key: key).first?.report {
            health[key] = report
        }
    }

    // MARK: Mutations

    /// Creates or reconfigures an instance. `expectedDigest: nil` accepts whatever the config file
    /// currently holds (Architecture decision 3) — Settings has no concurrent-editor conflict UI to
    /// resolve a CAS mismatch yet, so it always takes the latest. Never carries a credential.
    @discardableResult
    public func upsertProvider(_ spec: ProviderUpsertSpec) async -> Result<ProviderInstance, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        do {
            let result = try await client.upsertProvider(spec, expectedDigest: nil)
            await loadProviders()
            return .success(result.instance)
        } catch {
            return .failure(AssistantBackendError(Self.describe(error)))
        }
    }

    @discardableResult
    public func removeProvider(_ key: RoomProvider) async -> Result<Void, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        busyKeys.insert(key)
        defer { busyKeys.remove(key) }
        do {
            _ = try await client.removeProvider(key: key, expectedDigest: nil)
            rowErrors[key] = nil
            health[key] = nil
            await loadProviders()
            return .success(())
        } catch {
            let message = Self.describe(error)
            rowErrors[key] = message
            return .failure(AssistantBackendError(message))
        }
    }

    /// Sends `secret` ONCE, straight through to `provider.credential.set` — never retained here past
    /// the single `await`, never logged. On success, re-probes just this instance's health so the row
    /// shows the outcome without a manual refresh.
    @discardableResult
    public func setCredential(_ key: RoomProvider, secret: String) async -> Result<CredentialReference, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        busyKeys.insert(key)
        defer { busyKeys.remove(key) }
        do {
            let result = try await client.setProviderCredential(key: key, secret: secret)
            rowErrors[key] = nil
            await loadProviders()
            await refreshHealth(for: key)
            return .success(result.credentialReference)
        } catch {
            let message = Self.describe(error)
            rowErrors[key] = message
            return .failure(AssistantBackendError(message))
        }
    }

    /// `settings.set default-provider`. A daemon that rejects the value (not a live catalog instance
    /// key) surfaces its refusal honestly in `rowErrors[key]`, same as any other mutation.
    @discardableResult
    public func makeDefault(_ key: RoomProvider) async -> Result<Void, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        busyKeys.insert(key)
        defer { busyKeys.remove(key) }
        do {
            let entry = try await client.setSetting(.defaultProvider, value: key)
            defaultProviderKey = entry.value
            defaultError = nil
            rowErrors[key] = nil
            return .success(())
        } catch {
            let message = Self.describe(error)
            rowErrors[key] = message
            return .failure(AssistantBackendError(message))
        }
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
