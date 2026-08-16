import SwiftUI

// MARK: - PortfolioReticle
//
// The portfolio's one instrument: concentric rings, crosshair ticks, and a glowing arc from 12
// o'clock clockwise showing how far the portfolio is toward release. The centre prints the real
// percentage or an honest "—"; the label under it says "to release" and the badge says where the
// number came from. The rings and ticks are the instrument's frame — there are no numerals on them.

public struct PortfolioReticle: View {
    public var reading: ReticleReading
    public var label: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(reading: ReticleReading, label: String = "to release") {
        self.reading = reading
        self.label = label
    }

    private var fraction: Double? { reading.fraction.map { min(max($0, 0), 1) } }

    public var body: some View {
        VStack(spacing: HUDTheme.space.xs) {
            ZStack {
                ReticleCanvas(fraction: fraction)
                VStack(spacing: 2) {
                    Text(reading.readout)
                        .font(.system(size: 30, weight: .semibold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(fraction == nil ? HUDTheme.mute : HUDTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    HUDLabel(label)
                }
                .dynamicTypeSize(.large) // the ring is load-bearing; VoiceOver carries the value
            }
            .aspectRatio(1, contentMode: .fit)
            .animation(reduceMotion ? nil : HUDTheme.spring, value: fraction)
            HStack(spacing: HUDTheme.space.xs) {
                if let caption = reading.caption {
                    Text(caption).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.soft).lineLimit(1)
                }
                ProvenanceBadge(reading.provenance, compact: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = ["portfolio \(label): \(fraction == nil ? "unknown" : reading.readout)"]
        if let caption = reading.caption { parts.append(caption) }
        parts.append("source \(reading.provenance.detail)")
        return parts.joined(separator: ", ")
    }
}

struct ReticleCanvas: View {
    var fraction: Double?

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let side = min(size.width, size.height)
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let R = side / 2
            let arcWidth: CGFloat = max(5, side * 0.035)
            let arcRadius = R - arcWidth / 2 - side * 0.06

            // Concentric rings — the frame.
            for f in [0.28, 0.5, 0.72] {
                let r = arcRadius * f
                let ring = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
                context.stroke(ring, with: .color(HUDTheme.faint.opacity(0.7)), lineWidth: 0.75)
            }
            // The track behind the arc.
            let track = Path(ellipseIn: CGRect(x: c.x - arcRadius, y: c.y - arcRadius, width: 2 * arcRadius, height: 2 * arcRadius))
            context.stroke(track, with: .color(HUDTheme.arcDim.opacity(0.55)), lineWidth: arcWidth)
            // Outer hairline ring.
            let outerR = R - 1
            let outer = Path(ellipseIn: CGRect(x: c.x - outerR, y: c.y - outerR, width: 2 * outerR, height: 2 * outerR))
            context.stroke(outer, with: .color(HUDTheme.arcDim.opacity(0.5)), lineWidth: 0.75)

            // Crosshair ticks: 4 cardinal (long, outside the arc) + 8 minor.
            for i in 0..<12 {
                let angle = Double(i) / 12 * 2 * .pi - .pi / 2
                let cardinal = i % 3 == 0
                let inner = arcRadius + arcWidth / 2 + (cardinal ? 2 : 3)
                let outerTick = cardinal ? outerR : (outerR - side * 0.02)
                var tick = Path()
                tick.move(to: CGPoint(x: c.x + inner * cos(angle), y: c.y + inner * sin(angle)))
                tick.addLine(to: CGPoint(x: c.x + outerTick * cos(angle), y: c.y + outerTick * sin(angle)))
                context.stroke(tick, with: .color(cardinal ? HUDTheme.arcDim : HUDTheme.faint), lineWidth: cardinal ? 1.25 : 0.75)
            }
            // Inner crosshair hairs (gap in the middle so the readout stays clean).
            let hairIn = arcRadius * 0.62
            let hairOut = arcRadius * 0.74
            for i in 0..<4 {
                let angle = Double(i) / 4 * 2 * .pi
                var hair = Path()
                hair.move(to: CGPoint(x: c.x + hairIn * cos(angle), y: c.y + hairIn * sin(angle)))
                hair.addLine(to: CGPoint(x: c.x + hairOut * cos(angle), y: c.y + hairOut * sin(angle)))
                context.stroke(hair, with: .color(HUDTheme.faint), lineWidth: 0.75)
            }

            // The progress arc.
            guard let fraction, fraction > 0 else { return }
            let start = Angle.degrees(-90)
            let end = Angle.degrees(-90 + 360 * fraction)
            var arc = Path()
            arc.addArc(center: c, radius: arcRadius, startAngle: start, endAngle: end, clockwise: false)
            var glow = context
            glow.addFilter(.blur(radius: arcWidth * 1.2))
            glow.stroke(arc, with: .color(HUDTheme.glow), style: StrokeStyle(lineWidth: arcWidth * 1.6, lineCap: .round))
            context.stroke(arc, with: .color(HUDTheme.arc), style: StrokeStyle(lineWidth: arcWidth, lineCap: .round))
            // Bright cap at the leading edge.
            let capStart = Angle.degrees(max(-90, end.degrees - 4))
            var cap = Path()
            cap.addArc(center: c, radius: arcRadius, startAngle: capStart, endAngle: end, clockwise: false)
            context.stroke(cap, with: .color(HUDTheme.arcHi), style: StrokeStyle(lineWidth: arcWidth, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

#Preview("Reticle") {
    HStack(spacing: 24) {
        PortfolioReticle(reading: ReticleReading(fraction: 0.75, caption: "6 projects · fixture", provenance: .fixture("timeline-fixture.json")))
            .frame(width: 220)
        PortfolioReticle(reading: ReticleReading(fraction: nil, caption: "offline", provenance: .notYetSourced))
            .frame(width: 220)
    }
    .padding()
    .background(HUDTheme.void)
    .preferredColorScheme(.dark)
}
