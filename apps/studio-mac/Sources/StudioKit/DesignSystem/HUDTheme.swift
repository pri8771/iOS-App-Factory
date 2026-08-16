import AppKit
import SwiftUI

// MARK: - HUD design tokens
//
// Every owned color in Studio is declared here as a light/dark NSColor pair resolved dynamically per
// appearance (the pattern harvested from the orchestrator GUI's ThemeTokens). The app is dark-first:
// the dark values are the approved HUD prototype hex values verbatim; the light values are contrast
// checked (>= 4.5:1 for text roles on `hull`) so nothing becomes unreadable in Aqua.
//
// The palette encodes one semantic rule, and components enforce it through `HUDRole`:
//
//   * cyan (`arc`) is the machine's voice — anything the machine claims about itself.
//   * gold is ONLY things waiting on the human — a decision, an approval, an answer.
//
// Nothing the machine claims about itself renders gold; nothing the human decides renders cyan.
// Views therefore take a `HUDRole` (or a state that maps to one), never a raw `Color`.

public enum HUDTheme {

    // MARK: Ground (surfaces)

    /// The deepest ground — window canvas.
    public static let void = dynamic(light: 0xF2F6F9, dark: 0x04070C)
    /// The hull — sidebars, chrome, panels sitting on the void.
    public static let hull = dynamic(light: 0xFFFFFF, dark: 0x070C13)
    /// The plate — cards and instruments sitting on the hull.
    public static let plate = dynamic(light: 0xE9EFF4, dark: 0x0A1119)

    // MARK: The machine's voice (cyan)

    /// Arc — live machine progress, connection, running work.
    public static let arc = dynamic(light: 0x0A7684, dark: 0x3FD8E8)
    /// Arc highlight — the hottest point of a live arc, focus rings on machine controls.
    public static let arcHi = dynamic(light: 0x06525C, dark: 0x9FF3FF)
    /// Arc dim — planned / inactive tracks, bracket corners at rest.
    public static let arcDim = dynamic(light: 0x8ECBD3, dark: 0x1E6874)
    /// Glow — the soft halo behind a live arc.
    public static let glow = dynamic(light: 0x0A7684, dark: 0x3FD8E8, lightAlpha: 0.25, darkAlpha: 0.35)

    // MARK: The human's colour (gold) — ONLY things waiting on the human

    public static let gold = dynamic(light: 0x9E6300, dark: 0xF0A93B)
    public static let goldGlow = dynamic(light: 0x9E6300, dark: 0xF0A93B, lightAlpha: 0.22, darkAlpha: 0.35)
    /// Ink on a filled-gold control (dark on the bright gold, white on the deep light-mode gold).
    public static let onGold = dynamic(light: 0xFFFFFF, dark: 0x1A1205)

    // MARK: Outcomes

    public static let ok = dynamic(light: 0x1B7A3E, dark: 0x5BD98A)
    public static let alert = dynamic(light: 0xC93F22, dark: 0xFF6B4A)

    // MARK: Ink

    /// Primary text.
    public static let ink = dynamic(light: 0x0B1720, dark: 0xE6F3F8)
    /// Secondary text.
    public static let soft = dynamic(light: 0x3B4F5E, dark: 0xA3B8C7)
    /// Tertiary text, mono labels at rest.
    public static let mute = dynamic(light: 0x5D7080, dark: 0x6C8394)
    /// Hairlines, disabled ink, decorative ticks. Not for text.
    public static let faint = dynamic(light: 0x9AABB8, dark: 0x3E5264)

    // MARK: Hairlines & fills

    /// 1px panel borders.
    public static let hairline = dynamic(light: 0x0B1720, dark: 0xE6F3F8, lightAlpha: 0.10, darkAlpha: 0.08)
    /// Subtle raised fill (hover, wells).
    public static let raised = dynamic(light: 0x0B1720, dark: 0xE6F3F8, lightAlpha: 0.04, darkAlpha: 0.04)

    // MARK: Spacing (4pt grid), radii, motion

    public enum space {
        public static let xxs: CGFloat = 4
        public static let xs: CGFloat = 8
        public static let s: CGFloat = 12
        public static let m: CGFloat = 16
        public static let l: CGFloat = 24
        public static let xl: CGFloat = 32
    }

    public enum radius {
        /// HUD surfaces are square-cornered by nature; the bracket is the corner. Controls get 4pt.
        public static let control: CGFloat = 4
        public static let pill: CGFloat = 999
    }

    /// One spring for state changes.
    public static let spring = Animation.spring(response: 0.35, dampingFraction: 0.85)
    /// Live-arc breathing period (seconds). Honour Reduce Motion.
    public static let breathing: Double = 1.8

    // MARK: Plumbing

    /// A light/dark hex pair as one dynamic Color (resolves per appearance, including inside
    /// vibrancy and increased-contrast).
    public static func dynamic(light: UInt32, dark: UInt32,
                               lightAlpha: CGFloat = 1, darkAlpha: CGFloat = 1) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(hudHex: isDark ? dark : light, alpha: isDark ? darkAlpha : lightAlpha)
        })
    }
}

extension NSColor {
    /// 0xRRGGBB → NSColor (sRGB). Internal to the token file — nothing outside HUDTheme constructs
    /// colours from raw components.
    convenience init(hudHex hex: UInt32, alpha: CGFloat = 1) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: alpha)
    }
}

// MARK: - HUDRole
//
// The semantic vocabulary every instrument speaks. A role resolves to a colour; a view never picks
// a colour directly, so the machine/human rule is enforced at the type level.

public enum HUDRole: Sendable, Hashable, CaseIterable {
    /// The machine speaking about itself: progress, connection, running work. Cyan.
    case machine
    /// Waiting on the human: gates, approvals, questions. Gold.
    case human
    /// A settled good outcome.
    case ok
    /// A settled bad outcome, or something the machine refuses to guess.
    case alert
    /// Idle, queued, cancelled — no claim being made.
    case neutral

    /// Content at 100%.
    public var color: Color {
        switch self {
        case .machine: return HUDTheme.arc
        case .human: return HUDTheme.gold
        case .ok: return HUDTheme.ok
        case .alert: return HUDTheme.alert
        case .neutral: return HUDTheme.mute
        }
    }

    /// The hot end of the role's colour (used for the leading edge of live arcs).
    public var highlight: Color {
        switch self {
        case .machine: return HUDTheme.arcHi
        default: return color
        }
    }

    /// The soft halo behind live shapes.
    public var glow: Color {
        switch self {
        case .machine: return HUDTheme.glow
        case .human: return HUDTheme.goldGlow
        default: return color.opacity(0.3)
        }
    }

    /// Fill at 12% (dark) / 8% (light) — the one tint formula for pills and chips.
    public var fill: Color { color.opacity(0.12) }
    /// Stroke at 25%.
    public var stroke: Color { color.opacity(0.28) }
    /// Track (inactive) shade behind an arc.
    public var track: Color {
        switch self {
        case .machine: return HUDTheme.arcDim.opacity(0.55)
        default: return HUDTheme.faint.opacity(0.6)
        }
    }

    /// Spoken name for accessibility.
    public var accessibilityName: String {
        switch self {
        case .machine: return "machine"
        case .human: return "waiting on you"
        case .ok: return "ok"
        case .alert: return "alert"
        case .neutral: return "idle"
        }
    }
}
