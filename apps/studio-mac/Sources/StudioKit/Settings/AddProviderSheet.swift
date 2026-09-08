import SwiftUI

// MARK: - AddProviderSheet + SetProviderCredentialSheet
//
// Creates a new provider instance (Architecture decisions 2-3). Only `ollama`/`openrouter` may be
// created over the wire — `provider.upsert` refuses a brand-new `codex`/`claude` key with
// `provider.family-requires-local-configuration` (executable/codexHome are machine-local paths only
// an operator editing the config file by hand can supply), so the picker below never offers them; see
// `SettingsScreen`'s header comment for the read-only row treatment those two families get instead.
//
// `ProviderUpsertSpecV1`'s wire shape is exactly `{key, family, model, displayName, maxOutputTokens}`
// — no `baseUrl` field exists for Ollama (confirmed against
// `apps/daemon/src/room-participants-config.ts`'s `upsertProviderInstanceV1`, which only ever writes
// `model`/`displayName`/`maxOutputTokens` into the ollama/openrouter config slot). This sheet
// therefore asks only for what the wire actually accepts; a new Ollama instance gets the daemon's
// own default `http://127.0.0.1:11434` until an operator edits the participants config file by hand
// (see docs/operations/studio-dev-runbook.md) — the sheet says so rather than showing a field that
// would silently do nothing.
//
// OpenRouter's second step (and the standalone `SetProviderCredentialSheet`, for adding or rotating
// an existing instance's key from its row) both embed `CredentialEntryFields`: a `SecureField` whose
// value lives in local `@State` only, sent ONCE via the caller's `onSubmit`, cleared in `defer`
// regardless of outcome — never logged, never `@AppStorage`'d, never echoed back by the wire.

public struct AddProviderSheet: View {
    public enum Family: String, CaseIterable, Identifiable, Hashable {
        case openrouter, ollama
        public var id: String { rawValue }
        public var label: String { self == .openrouter ? "OpenRouter" : "Ollama (local)" }
        public var keyPrefix: String { self == .openrouter ? "openrouter-" : "ollama-" }
        public var modelPlaceholder: String { self == .openrouter ? "anthropic/claude-opus-4.1" : "qwen2.5-coder:14b" }
        public var providerFamily: ProviderFamily { self == .openrouter ? .openrouter : .ollama }
    }

    public var onUpsert: (ProviderUpsertSpec) async -> Result<ProviderInstance, AssistantBackendError>
    public var onSetCredential: (RoomProvider, String) async -> Result<CredentialReference, AssistantBackendError>
    public var onDone: (ProviderInstance?) -> Void

    public init(onUpsert: @escaping (ProviderUpsertSpec) async -> Result<ProviderInstance, AssistantBackendError>,
                onSetCredential: @escaping (RoomProvider, String) async -> Result<CredentialReference, AssistantBackendError>,
                onDone: @escaping (ProviderInstance?) -> Void) {
        self.onUpsert = onUpsert
        self.onSetCredential = onSetCredential
        self.onDone = onDone
    }

    @State private var family: Family = .openrouter
    @State private var idSuffix = ""
    @State private var model = ""
    @State private var displayName = ""
    @State private var displayNameEdited = false
    /// Defaults to `newProviderDefaultMaxOutputTokens` (not blank): a brand-new instance created
    /// through this sheet must not silently inherit the adapters' 150-token room default, which is
    /// far too tight for an interactive chat reply.
    @State private var maxOutputTokensText = String(newProviderDefaultMaxOutputTokens)
    @State private var isSubmitting = false
    @State private var errorText: String?
    @State private var created: ProviderInstance?

    private var trimmedId: String { idSuffix.trimmingCharacters(in: .whitespaces) }
    private var key: RoomProvider? { try? RoomProvider(family.keyPrefix + trimmedId) }
    private var suggestedDisplayName: String { trimmedId.isEmpty ? family.label : "\(family.label) — \(trimmedId)" }
    private var trimmedMaxOutputTokens: String { maxOutputTokensText.trimmingCharacters(in: .whitespaces) }
    /// `nil` submission value = "no preference" (family default); blank is a deliberate, valid
    /// choice, not a validation failure — see `maxOutputTokensIsValid`.
    private var maxOutputTokensValue: Int? { trimmedMaxOutputTokens.isEmpty ? nil : Int(trimmedMaxOutputTokens) }
    private var maxOutputTokensIsValid: Bool {
        guard !trimmedMaxOutputTokens.isEmpty else { return true }
        guard let value = Int(trimmedMaxOutputTokens) else { return false }
        return value >= minProviderMaxOutputTokens && value <= maxProviderMaxOutputTokens
    }
    private var canSubmit: Bool {
        key != nil && !model.trimmingCharacters(in: .whitespaces).isEmpty
            && !displayName.trimmingCharacters(in: .whitespaces).isEmpty && maxOutputTokensIsValid
    }

    public var body: some View {
        Group {
            if let created {
                CredentialEntryFields(providerKey: created.key, displayName: created.displayName,
                                      onSubmit: { secret in await onSetCredential(created.key, secret) },
                                      onDone: { _ in onDone(created) })
            } else {
                detailsForm
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 460)
        .background(HUDTheme.plate)
    }

    private var detailsForm: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("add provider")
            Picker("Family", selection: $family) {
                ForEach(Family.allCases) { candidate in Text(candidate.label).tag(candidate) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            field("Instance id", text: $idSuffix, placeholder: "fast")
                .onChange(of: idSuffix) { _, _ in if !displayNameEdited { displayName = suggestedDisplayName } }
            Text("Key: \(family.keyPrefix)\(trimmedId.isEmpty ? "…" : trimmedId)")
                .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            field("Model", text: $model, placeholder: family.modelPlaceholder)
            field("Display name", text: $displayName, placeholder: suggestedDisplayName)
                .onChange(of: displayName) { _, _ in displayNameEdited = true }
            VStack(alignment: .leading, spacing: 2) {
                field("Max output tokens", text: $maxOutputTokensText, placeholder: String(newProviderDefaultMaxOutputTokens))
                Text("Interactive chat needs more headroom than a terse room turn, so this defaults to "
                     + "\(newProviderDefaultMaxOutputTokens). Leave empty to use the adapter's own family "
                     + "default (150) instead.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    .fixedSize(horizontal: false, vertical: true)
                if !maxOutputTokensIsValid {
                    Text("Must be empty or a whole number from \(minProviderMaxOutputTokens) to \(maxProviderMaxOutputTokens).")
                        .font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if family == .ollama {
                Text("No base-URL field here — provider.upsert has no wire field for it. A new Ollama "
                     + "instance answers to the daemon's default (127.0.0.1:11434) until you edit the "
                     + "participants config file by hand; see docs/operations/studio-dev-runbook.md.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let errorText {
                Text(errorText).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                HUDButton("Cancel", variant: .ghost) { onDone(nil) }
                Spacer()
                if isSubmitting { ProgressView().controlSize(.small) }
                HUDButton(family == .openrouter ? "Continue" : "Create", variant: .arc, action: submit)
                    .disabled(isSubmitting || !canSubmit)
            }
        }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HUDLabel(label)
            TextField(placeholder, text: text)
                .textFieldStyle(.roundedBorder)
                .font(HUDTypography.body)
        }
    }

    private func submit() {
        guard let key else { return }
        errorText = nil
        isSubmitting = true
        let spec = ProviderUpsertSpec(key: key, family: family.providerFamily,
                                      model: model.trimmingCharacters(in: .whitespaces),
                                      displayName: displayName.trimmingCharacters(in: .whitespaces),
                                      maxOutputTokens: maxOutputTokensValue)
        Task {
            let result = await onUpsert(spec)
            isSubmitting = false
            switch result {
            case .success(let instance):
                // OpenRouter needs a key to function; Ollama has no credential step at all (plan
                // item 1) — hand it straight back once created.
                if family == .openrouter { created = instance } else { onDone(instance) }
            case .failure(let error):
                errorText = error.description
            }
        }
    }
}

// MARK: - Credential entry (shared body)

/// `SecureField`, value in local `@State` only, sent ONCE via `onSubmit`, cleared in `defer`
/// regardless of outcome. Embedded both as `AddProviderSheet`'s OpenRouter step 2 and standalone via
/// `SetProviderCredentialSheet` (adding or rotating an existing instance's key from its row).
struct CredentialEntryFields: View {
    var providerKey: RoomProvider
    var displayName: String
    var onSubmit: (String) async -> Result<CredentialReference, AssistantBackendError>
    /// `true` when a key was actually saved, `false` for Skip/an unsaved dismissal.
    var onDone: (Bool) -> Void

    @State private var secret = ""
    @State private var isSubmitting = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("credential")
            Text("\(displayName) (\(providerKey.rawValue)) — the key is sent once, straight to the daemon "
                 + "over the local socket; it writes the key to the macOS Keychain and returns only a "
                 + "reference, never the value.")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
            SecureField("API key", text: $secret)
                .textFieldStyle(.roundedBorder)
                .font(HUDTypography.body)
                .disabled(isSubmitting)
            if let errorText {
                Text(errorText).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                HUDButton("Skip", variant: .ghost) { onDone(false) }.disabled(isSubmitting)
                Spacer()
                if isSubmitting { ProgressView().controlSize(.small) }
                HUDButton("Save key", variant: .arc, action: submit).disabled(isSubmitting || secret.isEmpty)
            }
        }
    }

    private func submit() {
        errorText = nil
        isSubmitting = true
        let value = secret
        Task {
            defer {
                secret = ""
                isSubmitting = false
            }
            let result = await onSubmit(value)
            switch result {
            case .success: onDone(true)
            case .failure(let error): errorText = error.description
            }
        }
    }
}

/// Standalone credential entry for an EXISTING instance's row — "Set key" (no `credentialReference`
/// yet, e.g. an OpenRouter instance created without one) or "Rotate key" (replacing one already set).
public struct SetProviderCredentialSheet: View {
    public var providerKey: RoomProvider
    public var displayName: String
    public var onSubmit: (String) async -> Result<CredentialReference, AssistantBackendError>
    public var onDone: (Bool) -> Void

    public init(providerKey: RoomProvider, displayName: String,
                onSubmit: @escaping (String) async -> Result<CredentialReference, AssistantBackendError>,
                onDone: @escaping (Bool) -> Void) {
        self.providerKey = providerKey
        self.displayName = displayName
        self.onSubmit = onSubmit
        self.onDone = onDone
    }

    public var body: some View {
        CredentialEntryFields(providerKey: providerKey, displayName: displayName, onSubmit: onSubmit, onDone: onDone)
            .padding(HUDTheme.space.l)
            .frame(width: 420)
            .background(HUDTheme.plate)
    }
}

#Preview("Add provider — OpenRouter details") {
    AddProviderSheet(onUpsert: { _ in .success(ProviderInstance(key: RoomProvider(unchecked: "openrouter-batch"), family: .openrouter,
                                                                 model: "meta-llama/llama-3.3-70b", displayName: "OpenRouter — batch", credentialReference: nil)) },
                     onSetCredential: { _, _ in .success(CredentialReference(service: "app-factory-provider", account: "openrouter-batch")) },
                     onDone: { _ in })
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}

#Preview("Set credential") {
    SetProviderCredentialSheet(providerKey: RoomProvider(unchecked: "openrouter-deep"), displayName: "OpenRouter — deep",
                               onSubmit: { _ in .success(CredentialReference(service: "app-factory-provider", account: "openrouter-deep")) },
                               onDone: { _ in })
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
