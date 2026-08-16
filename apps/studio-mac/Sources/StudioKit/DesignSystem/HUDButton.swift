import SwiftUI

// MARK: - HUDButton
//
// Four variants, one shape (square-cornered, 4pt radius, mono uppercase label):
//
//   gold   the human decides — filled gold, dark ink. The only filled-gold control in the app.
//   arc    ask the machine to do something — cyan outline + cyan label.
//   solid  a neutral primary — plate-filled with hairline.
//   ghost  tertiary — label only, hairline on hover.
//
// Keyboard focus draws a 1pt ring in the variant's colour; pressed dims to 80%; disabled to 40%.

public enum HUDButtonVariant: Sendable, Hashable, CaseIterable {
    case gold, arc, solid, ghost
}

public struct HUDButtonStyle: ButtonStyle {
    public var variant: HUDButtonVariant
    public var compact: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme

    public init(variant: HUDButtonVariant, compact: Bool = false) {
        self.variant = variant
        self.compact = compact
    }

    public func makeBody(configuration: Configuration) -> some View {
        HUDButtonBody(configuration: configuration, variant: variant, compact: compact, isEnabled: isEnabled)
    }
}

private struct HUDButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let variant: HUDButtonVariant
    let compact: Bool
    let isEnabled: Bool
    @State private var hovering = false

    private var foreground: Color {
        switch variant {
        case .gold: return HUDTheme.onGold
        case .arc: return HUDTheme.arc
        case .solid: return HUDTheme.ink
        case .ghost: return HUDTheme.soft
        }
    }

    private var background: Color {
        switch variant {
        case .gold: return HUDTheme.gold
        case .arc: return hovering ? HUDTheme.arc.opacity(0.10) : Color.clear
        case .solid: return hovering ? HUDTheme.raised : HUDTheme.plate
        case .ghost: return hovering ? HUDTheme.raised : Color.clear
        }
    }

    private var border: Color {
        switch variant {
        case .gold: return HUDTheme.gold
        case .arc: return HUDTheme.arc.opacity(0.7)
        case .solid: return HUDTheme.hairline
        case .ghost: return hovering ? HUDTheme.hairline : Color.clear
        }
    }

    var body: some View {
        configuration.label
            .font(HUDTypography.monoLabel)
            .textCase(.uppercase)
            .tracking(1.2)
            .lineLimit(1)
            .foregroundStyle(foreground)
            .padding(.horizontal, compact ? HUDTheme.space.xs : HUDTheme.space.s)
            .padding(.vertical, compact ? 4 : 7)
            .background(RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous).fill(background))
            .overlay(RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous).stroke(border, lineWidth: 1))
            .shadow(color: variant == .gold && isEnabled ? HUDTheme.goldGlow : .clear, radius: 6)
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .contentShape(RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous))
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.12), value: hovering)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

/// Convenience: `HUDButton("Approve", variant: .gold) { … }`. Prefer this over raw `Button` so the
/// mono label + variant pairing is never improvised.
public struct HUDButton: View {
    public var title: String
    public var systemImage: String?
    public var variant: HUDButtonVariant
    public var compact: Bool
    public var action: () -> Void

    public init(_ title: String, systemImage: String? = nil, variant: HUDButtonVariant = .solid,
                compact: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.variant = variant
        self.compact = compact
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: HUDTheme.space.xxs) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 10, weight: .semibold))
                        .accessibilityHidden(true)
                }
                Text(title)
            }
        }
        .buttonStyle(HUDButtonStyle(variant: variant, compact: compact))
        .accessibilityLabel(title)
        .accessibilityHint(variant == .gold ? Text("Your decision") : Text(verbatim: ""))
    }
}

extension ButtonStyle where Self == HUDButtonStyle {
    public static func hud(_ variant: HUDButtonVariant, compact: Bool = false) -> HUDButtonStyle {
        HUDButtonStyle(variant: variant, compact: compact)
    }
}
