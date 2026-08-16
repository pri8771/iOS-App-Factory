import SwiftUI

// MARK: - RadialGauge
//
// A circular arc instrument. The track is a full dim ring; the value arc starts at 12 o'clock and
// sweeps clockwise with a soft glow and a bright cap. The centre shows a real readout or an honest
// "—" when the machine has no value; the mono label sits underneath. There are no decorative ticks
// and no invented numerals.

public struct RadialGauge: View {
    /// Fraction in 0...1. `nil` = the machine does not know; the arc is not drawn.
    public var value: Double?
    /// The centre readout. Defaults to a whole percent of `value`, or "—" when unknown.
    public var readout: String?
    /// The mono label under the gauge.
    public var label: String
    /// A secondary caption under the readout, inside the ring (e.g. "3 / 7").
    public var caption: String?
    public var role: HUDRole
    public var lineWidth: CGFloat
    /// Dashed arc = a planned/estimated value rather than a measured one.
    public var planned: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(value: Double?, readout: String? = nil, label: String, caption: String? = nil,
                role: HUDRole = .machine, lineWidth: CGFloat = 6, planned: Bool = false) {
        self.value = value
        self.readout = readout
        self.label = label
        self.caption = caption
        self.role = role
        self.lineWidth = lineWidth
        self.planned = planned
    }

    private var clamped: Double? { value.map { min(max($0, 0), 1) } }

    private var displayReadout: String {
        if let readout { return readout }
        guard let clamped else { return "—" }
        return "\(Int((clamped * 100).rounded()))%"
    }

    public var body: some View {
        VStack(spacing: HUDTheme.space.xs) {
            ZStack {
                Circle()
                    .stroke(role.track, lineWidth: lineWidth)
                if let clamped {
                    let style = StrokeStyle(lineWidth: lineWidth, lineCap: planned ? .butt : .round,
                                            dash: planned ? [lineWidth * 1.2, lineWidth * 0.9] : [])
                    Circle()
                        .trim(from: 0, to: clamped)
                        .stroke(role.color, style: style)
                        .rotationEffect(.degrees(-90))
                        .shadow(color: role.glow, radius: planned ? 0 : lineWidth * 1.2)
                    if !planned, clamped > 0.005 {
                        // The bright cap at the leading edge of the arc.
                        Circle()
                            .trim(from: max(0, clamped - 0.012), to: clamped)
                            .stroke(role.highlight, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                }
                VStack(spacing: 2) {
                    Text(displayReadout)
                        .font(HUDTypography.monoHero)
                        .monospacedDigit()
                        .foregroundStyle(clamped == nil ? HUDTheme.mute : HUDTheme.ink)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    if let caption {
                        Text(caption)
                            .font(HUDTypography.monoValue)
                            .foregroundStyle(HUDTheme.soft)
                            .lineLimit(1)
                    }
                }
                .padding(lineWidth * 2.2)
                .dynamicTypeSize(.large) // geometry is load-bearing inside the ring; VoiceOver carries the value
            }
            .aspectRatio(1, contentMode: .fit)
            .animation(reduceMotion ? nil : HUDTheme.spring, value: clamped)
            HUDLabel(label)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = ["\(label): \(clamped == nil ? "unknown" : displayReadout)"]
        if let caption { parts.append(caption) }
        if planned { parts.append("planned") }
        return parts.joined(separator: ", ")
    }
}
