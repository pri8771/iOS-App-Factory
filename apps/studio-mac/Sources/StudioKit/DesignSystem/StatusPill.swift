import SwiftUI

// MARK: - StatusPill
//
// The one state vocabulary at every altitude: always symbol + word, never colour alone. Mono
// uppercase word, tinted capsule (fill 12% / stroke 28% / content 100%). Blocked is gold because a
// blocked attempt is waiting on the human; running is cyan because the machine is speaking.

public enum HUDStatusKind: Sendable, Hashable, CaseIterable {
    case queued, running, paused, blocked, succeeded, failed, cancelled
    case connected, disconnected, unknown

    public var role: HUDRole {
        switch self {
        case .running, .connected: return .machine
        case .blocked: return .human
        case .succeeded: return .ok
        case .failed, .disconnected: return .alert
        case .queued, .paused, .cancelled, .unknown: return .neutral
        }
    }

    public var symbol: String {
        switch self {
        case .queued: return "clock"
        case .running: return "play.fill"
        case .paused: return "pause.fill"
        case .blocked: return "diamond.fill"
        case .succeeded: return "checkmark"
        case .failed: return "xmark.octagon.fill"
        case .cancelled: return "slash.circle"
        case .connected: return "bolt.horizontal.fill"
        case .disconnected: return "bolt.horizontal"
        case .unknown: return "questionmark"
        }
    }

    public var word: String {
        switch self {
        case .queued: return "queued"
        case .running: return "running"
        case .paused: return "paused"
        case .blocked: return "waiting on you"
        case .succeeded: return "succeeded"
        case .failed: return "failed"
        case .cancelled: return "cancelled"
        case .connected: return "connected"
        case .disconnected: return "offline"
        case .unknown: return "unknown"
        }
    }

    /// Live kinds breathe (Reduce Motion → static).
    public var isLive: Bool { self == .running }
}

public struct StatusPill: View {
    public var kind: HUDStatusKind
    /// Overrides the kind's word (e.g. "running 02:14"). Rendered uppercase mono.
    public var label: String?
    /// Optional custom symbol.
    public var symbol: String?

    public init(_ kind: HUDStatusKind, label: String? = nil, symbol: String? = nil) {
        self.kind = kind
        self.label = label
        self.symbol = symbol
    }

    private var text: String { label ?? kind.word }

    public var body: some View {
        HStack(spacing: HUDTheme.space.xxs) {
            if kind.isLive {
                BreathingDot(color: kind.role.color)
            } else {
                Image(systemName: symbol ?? kind.symbol)
                    .font(.system(size: 9, weight: .semibold))
                    .accessibilityHidden(true)
            }
            Text(text)
                .font(HUDTypography.monoLabel)
                .textCase(.uppercase)
                .tracking(1.0)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize() // the word is load-bearing; a pill never truncates
        }
        .foregroundStyle(kind.role.color)
        .padding(.horizontal, HUDTheme.space.xs)
        .padding(.vertical, 3)
        .background(Capsule().fill(kind.role.fill))
        .overlay(Capsule().stroke(kind.role.stroke, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// Breathing status dot. Honours Reduce Motion.
public struct BreathingDot: View {
    public var color: Color
    public var size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dim = false

    public init(color: Color, size: CGFloat = 6) {
        self.color = color
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .shadow(color: color.opacity(0.6), radius: dim ? 1 : 3)
            .opacity(dim ? 0.4 : 1)
            .animation(reduceMotion ? nil
                       : .easeInOut(duration: HUDTheme.breathing / 2).repeatForever(autoreverses: true),
                       value: dim)
            .onAppear { if !reduceMotion { dim = true } }
            .accessibilityHidden(true)
    }
}
