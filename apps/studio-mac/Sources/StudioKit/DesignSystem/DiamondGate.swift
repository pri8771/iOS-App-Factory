import SwiftUI

// MARK: - DiamondGate
//
// The ◆ marker for a human gate — a decision, approval, or answer the machine is waiting on. It is
// the one place gold appears as a marker. `waiting` glows; `cleared` is a hollow diamond in ok;
// `blocked` (the human said no) is a hollow diamond in alert.

public struct DiamondShape: Shape {
    public init() {}
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        p.closeSubpath()
        return p
    }
}

public struct DiamondGate: View {
    public enum GateState: Sendable, Hashable {
        /// Waiting on the human. Gold, glowing.
        case waiting
        /// The human decided; the machine proceeded.
        case cleared
        /// The human declined.
        case declined
    }

    public var state: GateState
    public var size: CGFloat
    /// What the human is being asked (spoken by VoiceOver; not rendered).
    public var label: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    public init(state: GateState = .waiting, size: CGFloat = 12, label: String? = nil) {
        self.state = state
        self.size = size
        self.label = label
    }

    private var role: HUDRole {
        switch state {
        case .waiting: return .human
        case .cleared: return .ok
        case .declined: return .alert
        }
    }

    public var body: some View {
        ZStack {
            if state == .waiting {
                DiamondShape()
                    .fill(role.glow)
                    .frame(width: size * 2.2, height: size * 2.2)
                    .blur(radius: size * 0.35)
                    .opacity(pulse ? 0.55 : 1)
                DiamondShape()
                    .fill(role.color)
                    .frame(width: size, height: size)
            } else {
                DiamondShape()
                    .stroke(role.color, lineWidth: 1.5)
                    .frame(width: size, height: size)
            }
        }
        .frame(width: size * 2.2, height: size * 2.2)
        .animation(reduceMotion || state != .waiting ? nil
                   : .easeInOut(duration: HUDTheme.breathing / 2).repeatForever(autoreverses: true),
                   value: pulse)
        .onAppear { if !reduceMotion, state == .waiting { pulse = true } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        let prefix: String
        switch state {
        case .waiting: prefix = "Waiting on you"
        case .cleared: prefix = "Gate cleared"
        case .declined: prefix = "Gate declined"
        }
        return label.map { "\(prefix): \($0)" } ?? prefix
    }
}
