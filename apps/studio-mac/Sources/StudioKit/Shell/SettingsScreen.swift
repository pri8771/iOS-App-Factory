import SwiftUI

// MARK: - SettingsScreen (honest placeholder — Wave 9a builds the real one)
//
// The fourth `NavRail` tab. Wave 8's Step A already wired the wire layer this screen will read from
// (`provider.*`/`settings.*` — Provider.swift/StudioSettings.swift/DaemonClient.swift) but Wave 8's
// job is the shell pivot, not the provider roster UI itself — that is
// `SettingsModel`/`ProviderRow`/`AddProviderSheet` (Wave 9a). Until then this tab is honestly
// NOT YET SOURCED, never a fabricated roster.

public struct SettingsScreen: View {
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.l) {
            Text("Settings").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)

            VStack(alignment: .leading, spacing: HUDTheme.space.s) {
                HStack(spacing: HUDTheme.space.xs) {
                    HUDLabel("providers")
                    ProvenanceBadge(.notYetSourced)
                }
                Text("The provider roster — API keys, local Ollama/OpenRouter instances, and the default "
                     + "provider — is not wired into this screen yet.")
                    .font(HUDTypography.body)
                    .foregroundStyle(HUDTheme.soft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .hudPanel(role: .neutral)

            Spacer()
        }
        .padding(HUDTheme.space.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(HUDTheme.void)
        .accessibilityElement(children: .contain)
    }
}

#Preview("Settings (placeholder)") {
    SettingsScreen()
        .frame(width: 900, height: 620)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
