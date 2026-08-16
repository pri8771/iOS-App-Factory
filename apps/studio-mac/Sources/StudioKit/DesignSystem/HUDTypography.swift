import SwiftUI

// MARK: - HUD type ramp
//
// Three voices:
//   * mono   — SF Mono, uppercase, letter-spaced. Instrument labels, ids, digests, timestamps.
//   * display — Avenir Next. Headings and hero numerals.
//   * body   — SF Pro. Prose.
//
// Every text token scales with the user's text-size setting: display and body via
// `Font.custom(_:size:relativeTo:)` (the Dynamic Type ramp pattern harvested from the orchestrator
// GUI — the exact base size renders at the system default and grows/shrinks with the given text
// style), mono via the system monospaced design on a text style. Instruments whose geometry is
// load-bearing (gauge numerals inside a fixed ring) pin their subtree with `.dynamicTypeSize(.large)`
// and compensate with full VoiceOver labels.

public enum HUDTypography {

    private static func system(_ size: CGFloat, relativeTo style: Font.TextStyle) -> Font {
        Font.custom(".AppleSystemUIFont", size: size, relativeTo: style)
    }

    private static func mono(_ style: Font.TextStyle) -> Font {
        // SF Mono via the system monospaced design, scaled by text style (macOS: caption2 = 10,
        // subheadline = 11, body = 13). A named ".AppleSystemUIFontMonospaced" custom font cannot take
        // a weight, so mono tokens ride the text-style ramp rather than an exact base size.
        Font.system(style, design: .monospaced)
    }

    private static func avenir(_ size: CGFloat, relativeTo style: Font.TextStyle) -> Font {
        Font.custom("Avenir Next", size: size, relativeTo: style)
    }

    // MARK: Mono (instrument labels)

    /// 10 medium mono — the standard HUD label. Pair with `.hudLabel()` for uppercase + tracking.
    public static let monoLabel = mono(.caption2).weight(.medium)
    /// 11 regular mono — ids, digests, timestamps, tabular data.
    public static let monoValue = mono(.subheadline)
    /// 13 medium mono — gauge readouts and inline machine values.
    public static let monoReadout = mono(.body).weight(.medium)
    /// 22 semibold mono — hero readouts inside gauges (fixed by design; see RadialGauge).
    public static let monoHero = Font.system(size: 22, weight: .semibold, design: .monospaced)

    /// Letter spacing (points) for uppercase mono labels.
    public static let labelTracking: CGFloat = 1.4

    // MARK: Display (Avenir Next)

    /// 26 demibold — window / screen titles.
    public static let displayTitle = avenir(26, relativeTo: .largeTitle).weight(.semibold)
    /// 18 demibold — panel headings, project names.
    public static let displayHeading = avenir(18, relativeTo: .title3).weight(.semibold)
    /// 15 medium — card titles.
    public static let displaySubheading = avenir(15, relativeTo: .headline).weight(.medium)

    // MARK: Body (SF Pro)

    /// 13 regular — the workhorse.
    public static let body = system(13, relativeTo: .body)
    /// 13 medium — emphasised body.
    public static let bodyStrong = system(13, relativeTo: .body).weight(.medium)
    /// 12 regular — secondary prose.
    public static let callout = system(12, relativeTo: .callout)
    /// 11 regular — captions and footnotes. The floor: nothing renders below 10.
    public static let caption = system(11, relativeTo: .caption)
}

// MARK: - Modifiers

/// Uppercase, letter-spaced SF Mono label — the HUD's instrument voice.
public struct HUDLabelStyle: ViewModifier {
    public var role: HUDRole?
    public var font: Font

    public init(role: HUDRole? = nil, font: Font = HUDTypography.monoLabel) {
        self.role = role
        self.font = font
    }

    public func body(content: Content) -> some View {
        content
            .font(font)
            .textCase(.uppercase)
            .tracking(HUDTypography.labelTracking)
            .foregroundStyle(role?.color ?? HUDTheme.mute)
            .lineLimit(1)
    }
}

extension View {
    /// Uppercase, letter-spaced mono label. `role == nil` renders in the muted label ink.
    public func hudLabel(_ role: HUDRole? = nil, font: Font = HUDTypography.monoLabel) -> some View {
        modifier(HUDLabelStyle(role: role, font: font))
    }

    /// Display heading in Avenir Next, primary ink.
    public func hudHeading() -> some View {
        font(HUDTypography.displayHeading).foregroundStyle(HUDTheme.ink)
    }

    /// Body text in SF Pro, primary ink.
    public func hudBody() -> some View {
        font(HUDTypography.body).foregroundStyle(HUDTheme.ink)
    }
}

/// A ready-made mono label. `HUDLabel("portfolio")` renders "PORTFOLIO".
public struct HUDLabel: View {
    private let text: String
    private let role: HUDRole?

    public init(_ text: String, role: HUDRole? = nil) {
        self.text = text
        self.role = role
    }

    public var body: some View {
        Text(text).hudLabel(role)
    }
}

/// A key/value readout: mono label above a mono value. Values that the machine does not have render
/// an honest em-dash — never a fake number.
public struct HUDReadout: View {
    private let label: String
    private let value: String?
    private let role: HUDRole?

    public init(_ label: String, value: String?, role: HUDRole? = nil) {
        self.label = label
        self.value = value
        self.role = role
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HUDLabel(label)
            Text(value ?? "—")
                .font(HUDTypography.monoReadout)
                .monospacedDigit()
                .foregroundStyle(value == nil ? HUDTheme.mute : (role?.color ?? HUDTheme.ink))
                .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value ?? "unknown")")
    }
}
