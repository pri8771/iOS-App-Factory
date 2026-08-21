import AppKit
import SnapshotTesting
@testable import StudioKit
import SwiftUI
import XCTest

/// Reference images for the Settings → Providers screen (Wave 9a) in both appearances: a mixed-health
/// roster (connected, unreachable, attestation-blocked-gold, not-configured, plus the DEFAULT badge),
/// the add-provider sheet, and the honest empty registry — mirroring `RoomsSnapshotTests`'s shape.
@MainActor
final class SettingsSnapshotTests: XCTestCase {

    private var mixedHealth: [RoomProvider: ProviderHealthReport] {
        [
            RoomProvider(unchecked: "codex"): ProviderHealthReport(status: .ok, detail: nil, latencyMs: 340, version: "0.42.0"),
            RoomProvider(unchecked: "claude"): ProviderHealthReport(status: .unreachable, detail: "connection refused", latencyMs: nil, version: nil),
            RoomProvider(unchecked: "ollama"): ProviderHealthReport(status: .notConfigured, detail: nil, latencyMs: nil, version: nil),
            RoomProvider(unchecked: "openrouter-fast"): ProviderHealthReport(status: .blocked, detail: "containment-attestation-missing", latencyMs: nil, version: nil),
            RoomProvider(unchecked: "openrouter-deep"): ProviderHealthReport(status: .unauthenticated, detail: "HTTP 401", latencyMs: 88, version: nil),
        ]
    }

    private var mixedProviders: [ProviderInstance] {
        [
            ProviderInstance(key: RoomProvider(unchecked: "codex"), family: .codex, model: "gpt-5-codex", displayName: "Codex", credentialReference: nil),
            ProviderInstance(key: RoomProvider(unchecked: "claude"), family: .claude, model: "claude-sonnet-4-5", displayName: "Claude", credentialReference: nil),
            ProviderInstance(key: RoomProvider(unchecked: "ollama"), family: .ollama, model: "qwen2.5-coder:14b", displayName: "Ollama", credentialReference: nil),
            ProviderInstance(key: RoomProvider(unchecked: "openrouter-fast"), family: .openrouter, model: "google/gemini-2.5-flash", displayName: "OpenRouter — fast",
                             credentialReference: CredentialReference(service: "app-factory-provider", account: "openrouter-fast")),
            ProviderInstance(key: RoomProvider(unchecked: "openrouter-deep"), family: .openrouter, model: "anthropic/claude-opus-4.1", displayName: "OpenRouter — deep", credentialReference: nil),
        ]
    }

    /// Every health state the roster is meant to distinguish, plus the gold DEFAULT badge on
    /// `codex` — asserted in both appearances (`assertHUD` does both automatically).
    func testSettingsScreenMixedHealthRoster() {
        assertHUD(
            SettingsScreen(providers: mixedProviders, health: mixedHealth, defaultProviderKey: RoomProvider(unchecked: "codex")),
            size: CGSize(width: 940, height: 820), named: "settings-screen-mixed-roster")
    }

    /// A roster with no health read yet — every row honestly "not probed", never a fabricated status.
    func testSettingsScreenUnprobedRoster() {
        assertHUD(
            SettingsScreen(providers: mixedProviders, health: [:], defaultProviderKey: nil),
            size: CGSize(width: 940, height: 820), named: "settings-screen-unprobed-roster")
    }

    /// The honest empty state: zero providers configured, no error, no loading spinner.
    func testSettingsScreenEmptyRegistry() {
        assertHUD(SettingsScreen(), size: CGSize(width: 900, height: 420), named: "settings-screen-empty-registry")
    }

    /// A `provider.list` read failure — kept and shown, never swallowed into a blank roster.
    func testSettingsScreenProvidersError() {
        assertHUD(
            SettingsScreen(providersError: "[daemon] test.unavailable: provider.list is down (retryable)"),
            size: CGSize(width: 900, height: 460), named: "settings-screen-providers-error")
    }

    // MARK: Add-instance flows

    func testAddProviderSheetOpenRouterDetailsStep() {
        assertHUD(
            AddProviderSheet(onUpsert: { _ in .failure(AssistantBackendError("preview only")) },
                             onSetCredential: { _, _ in .failure(AssistantBackendError("preview only")) },
                             onDone: { _ in }),
            size: CGSize(width: 520, height: 420), named: "add-provider-sheet-openrouter-details")
    }

    /// The credential step reached after a successful OpenRouter upsert.
    func testAddProviderSheetCredentialStep() {
        assertHUD(
            SetProviderCredentialSheet(providerKey: RoomProvider(unchecked: "openrouter-batch"), displayName: "OpenRouter — batch",
                                       onSubmit: { _ in .failure(AssistantBackendError("preview only")) }, onDone: { _ in }),
            size: CGSize(width: 480, height: 260), named: "set-provider-credential-sheet")
    }

    // MARK: ProviderRow — default badge and the attestation blocker's runbook hint in isolation

    func testProviderRowDefaultAndAttestationBlocked() {
        let defaultInstance = mixedProviders[0]
        let blockedInstance = mixedProviders[3]
        assertHUD(
            VStack(alignment: .leading, spacing: 12) {
                ProviderRow(instance: defaultInstance, health: mixedHealth[defaultInstance.key], isDefault: true, isBusy: false,
                           error: nil, onMakeDefault: {}, onRemove: nil, onSetCredential: nil)
                Rectangle().fill(HUDTheme.hairline).frame(height: 1)
                ProviderRow(instance: blockedInstance, health: mixedHealth[blockedInstance.key], isDefault: false, isBusy: false,
                           error: nil, onMakeDefault: {}, onRemove: {}, onSetCredential: {})
            }
            .padding(16).frame(width: 520, alignment: .leading).background(HUDTheme.void),
            size: CGSize(width: 560, height: 320), named: "provider-row-default-and-attestation-blocked")
    }
}
