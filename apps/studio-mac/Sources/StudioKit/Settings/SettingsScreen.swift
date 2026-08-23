import SwiftUI

// MARK: - SettingsScreen (Wave 9a — replaces the Wave-8 placeholder)
//
// The real Settings → Providers screen: a roster of configured provider instances
// (`provider.list`), each row's live health (`provider.health`), and the cross-client default
// provider (`settings.get`/`.set`). Pure values + closures (never `SettingsModel` itself), mirroring
// `DashboardScreen`/`RoomRosterPanel` — previews and snapshots without a store.
//
// `codex`/`claude` render read-only: the daemon refuses to create either over the wire (a
// machine-local executable/codexHome path only an operator can supply by hand — see
// `provider-command-runtime.ts`'s `provider.family-requires-local-configuration`), so their rows get
// no remove/credential affordance, only the roster + health + "make default" (a cross-client
// preference, unrelated to the config file). `openrouter`/`ollama` instances are created through
// `AddProviderSheet` and may be removed; only `openrouter` ever takes a credential (`ollama` and the
// CLI-subprocess families never do — see `RoomParticipantAdapter`'s four kinds).

public struct SettingsScreen: View {
    public var providers: [ProviderInstance]
    public var health: [RoomProvider: ProviderHealthReport]
    public var defaultProviderKey: RoomProvider?
    public var isLoadingProviders: Bool
    public var isLoadingHealth: Bool
    public var providersError: String?
    public var healthError: String?
    public var defaultError: String?
    public var busyKeys: Set<RoomProvider>
    public var rowErrors: [RoomProvider: String]

    public var onAppear: () async -> Void
    public var onRefreshHealth: () -> Void
    public var onMakeDefault: (RoomProvider) -> Void
    public var onRemove: (RoomProvider) -> Void
    public var onAddProvider: () -> Void
    public var onSetCredential: (RoomProvider) -> Void

    public init(providers: [ProviderInstance] = [], health: [RoomProvider: ProviderHealthReport] = [:],
                defaultProviderKey: RoomProvider? = nil, isLoadingProviders: Bool = false, isLoadingHealth: Bool = false,
                providersError: String? = nil, healthError: String? = nil, defaultError: String? = nil,
                busyKeys: Set<RoomProvider> = [], rowErrors: [RoomProvider: String] = [:],
                onAppear: @escaping () async -> Void = {}, onRefreshHealth: @escaping () -> Void = {},
                onMakeDefault: @escaping (RoomProvider) -> Void = { _ in }, onRemove: @escaping (RoomProvider) -> Void = { _ in },
                onAddProvider: @escaping () -> Void = {}, onSetCredential: @escaping (RoomProvider) -> Void = { _ in }) {
        self.providers = providers
        self.health = health
        self.defaultProviderKey = defaultProviderKey
        self.isLoadingProviders = isLoadingProviders
        self.isLoadingHealth = isLoadingHealth
        self.providersError = providersError
        self.healthError = healthError
        self.defaultError = defaultError
        self.busyKeys = busyKeys
        self.rowErrors = rowErrors
        self.onAppear = onAppear
        self.onRefreshHealth = onRefreshHealth
        self.onMakeDefault = onMakeDefault
        self.onRemove = onRemove
        self.onAddProvider = onAddProvider
        self.onSetCredential = onSetCredential
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.l) {
                header
                rosterPanel
                if let providersError { errorLine("provider.list", providersError) }
                if let healthError { errorLine("provider.health", healthError) }
                if let defaultError { errorLine("settings.get", defaultError) }
            }
            .padding(HUDTheme.space.l)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(HUDTheme.void)
        .task { await onAppear() }
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Settings").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
            Spacer()
            HUDButton("Refresh health", systemImage: "arrow.clockwise", variant: .ghost, compact: true, action: onRefreshHealth)
            HUDButton("Add provider", systemImage: "plus", variant: .arc, compact: true, action: onAddProvider)
        }
    }

    @ViewBuilder
    private var rosterPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            HStack(spacing: HUDTheme.space.xxs) {
                HUDLabel("providers")
                ProvenanceBadge(.live("provider.list"))
                if isLoadingProviders || isLoadingHealth { ProgressView().controlSize(.mini) }
            }
            if providers.isEmpty {
                emptyState
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(providers.enumerated()), id: \.element.id) { index, instance in
                        ProviderRow(
                            instance: instance, health: health[instance.key],
                            isDefault: instance.key == defaultProviderKey, isBusy: busyKeys.contains(instance.key),
                            error: rowErrors[instance.key],
                            onMakeDefault: { onMakeDefault(instance.key) },
                            onRemove: Self.mayRemove(instance.family) ? { onRemove(instance.key) } : nil,
                            onSetCredential: instance.family == .openrouter ? { onSetCredential(instance.key) } : nil)
                        if index < providers.count - 1 {
                            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
                        }
                    }
                }
            }
        }
        .hudPanel()
    }

    /// `codex`/`claude` are a read-only config surface (see the header comment) — every other family
    /// was created through `provider.upsert` and may be removed the same way.
    private static func mayRemove(_ family: ProviderFamily) -> Bool {
        family != .codex && family != .claude
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if isLoadingProviders {
                Text("Reading the provider registry (provider.list)…")
                    .font(HUDTypography.body).foregroundStyle(HUDTheme.mute)
            } else if providersError == nil {
                Text("No providers configured. Add an OpenRouter or local Ollama instance to get started.")
                    .font(HUDTypography.body).foregroundStyle(HUDTheme.mute)
            } else {
                Text("won't guess — provider.list failed").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
        }
    }

    private func errorLine(_ op: String, _ message: String) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.xs) {
            Text(op).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.alert)
            Text(message).font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .hudPanel(role: .alert, padding: HUDTheme.space.s)
    }
}

// MARK: - ProviderRow

/// One configured instance: identity + model, live health, the DEFAULT badge or a "Make default"
/// button, and (family-permitting) "Set/Rotate key" and "Remove". `onRemove`/`onSetCredential` are
/// `nil` to hide the affordance entirely — never shown-then-disabled, which would invite a click that
/// can never succeed.
struct ProviderRow: View {
    var instance: ProviderInstance
    var health: ProviderHealthReport?
    var isDefault: Bool
    var isBusy: Bool
    var error: String?
    var onMakeDefault: () -> Void
    var onRemove: (() -> Void)?
    var onSetCredential: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HStack(alignment: .top, spacing: HUDTheme.space.s) {
                identity
                Spacer(minLength: HUDTheme.space.m)
                VStack(alignment: .trailing, spacing: HUDTheme.space.xxs) {
                    healthPill
                    if isBusy { ProgressView().controlSize(.mini) }
                }
            }
            if let blockedHint {
                Text(blockedHint).font(HUDTypography.caption).foregroundStyle(HUDTheme.gold)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let error {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            }
            actions
        }
        .padding(.vertical, HUDTheme.space.xs)
        .accessibilityElement(children: .combine)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: HUDTheme.space.xxs) {
                Text(instance.displayName).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                Text(instance.family.rawValue).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                if isDefault { StatusPill(.blocked, label: "default", symbol: "star.fill") }
            }
            Text(instance.key.rawValue).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            Text(modelLine).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
            if instance.family == .openrouter {
                Text(instance.credentialReference == nil ? "no key set" : "key set")
                    .font(HUDTypography.caption)
                    .foregroundStyle(instance.credentialReference == nil ? HUDTheme.gold : HUDTheme.mute)
            }
        }
    }

    /// Appends the configured output cap when this instance has one — codex/claude/gemini and an
    /// ollama/openrouter instance with no explicit override stay a bare model line (honest: there is
    /// nothing configured to report, not a fabricated "150" the wire never actually carries).
    private var modelLine: String {
        guard let maxOutputTokens = instance.maxOutputTokens else { return "model: \(instance.model)" }
        return "model: \(instance.model) · max \(maxOutputTokens) tok"
    }

    private var actions: some View {
        HStack(spacing: HUDTheme.space.xs) {
            if !isDefault {
                HUDButton("Make default", variant: .ghost, compact: true, action: onMakeDefault).disabled(isBusy)
            }
            if let onSetCredential {
                HUDButton(instance.credentialReference == nil ? "Set key" : "Rotate key", variant: .ghost, compact: true,
                         action: onSetCredential).disabled(isBusy)
            }
            if let onRemove {
                HUDButton("Remove", variant: .ghost, compact: true, action: onRemove).disabled(isBusy)
            }
        }
    }

    /// Architecture decision 3's status vocabulary, mapped onto the existing `StatusPill` kinds
    /// rather than inventing new ones: `ok` reuses the daemon-beacon's own `.connected` (cyan — the
    /// machine reporting it reached the provider), `blocked` is gold "waiting on you" (a genuinely
    /// human decision — see `blockedHint`), `unreachable`/`unauthenticated` are the alert `.failed`
    /// kind with the honest word substituted in, `not-configured` is the neutral `.unknown` kind.
    private var healthPill: StatusPill {
        guard let health else { return StatusPill(.unknown, label: "not probed") }
        switch health.status {
        case .ok: return StatusPill(.connected, label: "connected")
        case .blocked: return StatusPill(.blocked, label: "waiting on you")
        case .unauthenticated: return StatusPill(.failed, label: "unauthenticated")
        case .unreachable: return StatusPill(.failed, label: "unreachable")
        case .notConfigured: return StatusPill(.unknown, label: "not configured")
        }
    }

    /// Wave 0's attestation hint (Architecture decision 3): `provider.health` reports `blocked` with
    /// `detail: "containment-attestation-missing"` when no dev containment attestation is loaded —
    /// this is the one health status that is genuinely a human decision, not a probe failure, so it
    /// gets the runbook pointer rather than a bare error string. Any other `blocked` reason (the
    /// daemon may add one later) still renders honestly, just without the runbook-specific hint.
    private var blockedHint: String? {
        guard let health, health.status == .blocked else { return nil }
        if health.detail == "containment-attestation-missing" {
            return "Blocked — containment attestation missing. Run scripts/dev-attest (see docs/operations/studio-dev-runbook.md) to enable this provider in dev."
        }
        return health.detail.map { "Blocked — \($0)" } ?? "Blocked."
    }
}

#Preview("Settings — mixed roster") {
    let health: [RoomProvider: ProviderHealthReport] = [
        RoomProvider(unchecked: "codex"): ProviderHealthReport(status: .ok, detail: nil, latencyMs: 340, version: "0.42.0"),
        RoomProvider(unchecked: "claude"): ProviderHealthReport(status: .unreachable, detail: "connection refused", latencyMs: nil, version: nil),
        RoomProvider(unchecked: "ollama"): ProviderHealthReport(status: .ok, detail: nil, latencyMs: 12, version: nil),
        RoomProvider(unchecked: "openrouter-fast"): ProviderHealthReport(status: .blocked, detail: "containment-attestation-missing", latencyMs: nil, version: nil),
        RoomProvider(unchecked: "openrouter-deep"): ProviderHealthReport(status: .notConfigured, detail: "no credential set for this instance yet", latencyMs: nil, version: nil),
    ]
    let providers = [
        ProviderInstance(key: RoomProvider(unchecked: "codex"), family: .codex, model: "gpt-5-codex", displayName: "Codex", credentialReference: nil),
        ProviderInstance(key: RoomProvider(unchecked: "claude"), family: .claude, model: "claude-sonnet-4-5", displayName: "Claude", credentialReference: nil),
        ProviderInstance(key: RoomProvider(unchecked: "ollama"), family: .ollama, model: "qwen2.5-coder:14b", displayName: "Ollama", credentialReference: nil,
                         maxOutputTokens: 1000),
        ProviderInstance(key: RoomProvider(unchecked: "openrouter-fast"), family: .openrouter, model: "google/gemini-2.5-flash", displayName: "OpenRouter — fast",
                         credentialReference: CredentialReference(service: "app-factory-provider", account: "openrouter-fast"), maxOutputTokens: 500),
        ProviderInstance(key: RoomProvider(unchecked: "openrouter-deep"), family: .openrouter, model: "anthropic/claude-opus-4.1", displayName: "OpenRouter — deep", credentialReference: nil),
    ]
    return SettingsScreen(providers: providers, health: health, defaultProviderKey: RoomProvider(unchecked: "codex"))
        .frame(width: 900, height: 760)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}

#Preview("Settings — empty registry") {
    SettingsScreen()
        .frame(width: 900, height: 500)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
