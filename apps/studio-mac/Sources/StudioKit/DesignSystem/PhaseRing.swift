import SwiftUI

// MARK: - PhaseRing
//
// A per-project ring divided into phase segments, read clockwise from 12 o'clock.
//
//   done     solid cyan (the machine did it)
//   active   glowing cyan with a bright cap (the machine is doing it)
//   planned  dashed cyan (the machine intends to)
//   unknown  dashed alert ("won't guess" — the machine refuses to claim)
//   gate     a gold ◆ at the segment start (waiting on the human); the segment itself is a bare track
//
// Nothing here renders gold except the gate marker.

public struct PhaseRing: View {
    public struct Phase: Identifiable, Hashable, Sendable {
        public enum State: Sendable, Hashable, CaseIterable {
            case done, active, planned, unknown, gate
        }
        public var id: String { label }
        public let label: String
        public let state: State
        public init(_ label: String, _ state: State) {
            self.label = label
            self.state = state
        }
    }

    public var phases: [Phase]
    public var lineWidth: CGFloat
    /// Gap between segments as a fraction of the full circle.
    public var gap: Double
    /// Optional centre content (a count, initials, a small readout).
    public var center: String?
    public var role: HUDRole

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(phases: [Phase], lineWidth: CGFloat = 5, gap: Double = 0.02, center: String? = nil,
                role: HUDRole = .machine) {
        self.phases = phases
        self.lineWidth = lineWidth
        self.gap = gap
        self.center = center
        self.role = role
    }

    private var segmentLength: Double {
        guard !phases.isEmpty else { return 0 }
        return max(0, (1 - gap * Double(phases.count)) / Double(phases.count))
    }

    private func range(_ index: Int) -> (start: Double, end: Double) {
        let start = Double(index) * (segmentLength + gap)
        return (start, start + segmentLength)
    }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let radius = side / 2 - lineWidth / 2
            let centerPoint = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                ForEach(Array(phases.enumerated()), id: \.element.id) { index, phase in
                    let r = range(index)
                    segment(phase, from: r.start, to: r.end)
                }
                ForEach(Array(phases.enumerated()), id: \.element.id) { index, phase in
                    if phase.state == .gate {
                        let r = range(index)
                        let angle = Angle.degrees(-90 + 360 * (r.start + segmentLength / 2))
                        DiamondGate(state: .waiting, size: lineWidth * 2, label: phase.label)
                            .position(x: centerPoint.x + radius * cos(angle.radians),
                                      y: centerPoint.y + radius * sin(angle.radians))
                    }
                }
                if let center {
                    Text(center)
                        .font(HUDTypography.monoReadout)
                        .monospacedDigit()
                        .foregroundStyle(HUDTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .padding(lineWidth * 2.5)
                        .dynamicTypeSize(.large)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    @ViewBuilder
    private func segment(_ phase: Phase, from start: Double, to end: Double) -> some View {
        switch phase.state {
        case .done:
            Circle().trim(from: start, to: end)
                .stroke(role.color.opacity(0.85), style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        case .active:
            Circle().trim(from: start, to: end)
                .stroke(role.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
                .shadow(color: role.glow, radius: lineWidth * 1.4)
            Circle().trim(from: max(start, end - 0.01), to: end)
                .stroke(role.highlight, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        case .planned:
            Circle().trim(from: start, to: end)
                .stroke(HUDTheme.arc.opacity(0.7),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt, dash: [lineWidth, lineWidth * 0.8]))
                .rotationEffect(.degrees(-90))
        case .unknown:
            Circle().trim(from: start, to: end)
                .stroke(HUDTheme.alert.opacity(0.8),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt, dash: [lineWidth, lineWidth * 0.8]))
                .rotationEffect(.degrees(-90))
        case .gate:
            Circle().trim(from: start, to: end)
                .stroke(role.track, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
        }
    }

    private var accessibilityText: String {
        let parts = phases.map { phase -> String in
            let state: String
            switch phase.state {
            case .done: state = "done"
            case .active: state = "in progress"
            case .planned: state = "planned"
            case .unknown: state = "unknown"
            case .gate: state = "waiting on you"
            }
            return "\(phase.label) \(state)"
        }
        var text = parts.joined(separator: ", ")
        if let center { text = "\(center). " + text }
        return text
    }
}
