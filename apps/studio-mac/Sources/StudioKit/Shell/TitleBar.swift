import SwiftUI

// MARK: - Title bar
//
// The window's own top strip (the system title bar is hidden): traffic-light inset, the wordmark,
// the daemon beacon driven by doctor, and the budget mini gauge — which in phase 1 is a STATIC 38%
// and is labelled as such. As of Wave 8 (Architecture decision 13) the four screens are no longer
// tabs living here — they moved to the left `NavRail` — so this bar keeps only the chrome that is
// not "which screen": the wordmark, the beacon, and the gauge.

/// The four screens (Architecture decision 13): chat is the default landing tab, not dashboard —
/// declaration order is `NavRail`'s display order. `.phases` was renamed to `.stages` here (UI-only:
/// nothing on the wire serializes a `StudioTab`, so this is a pure rename, not a schema change) and
/// `.settings` is new (Wave 9a fills in its real content; Wave 8 ships an honest placeholder,
/// `SettingsScreen`).
public enum StudioTab: String, CaseIterable, Hashable, Sendable, Identifiable {
    case chat, stages, dashboard, settings
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .chat: return "Chat"
        case .stages: return "Stages"
        case .dashboard: return "Dashboard"
        case .settings: return "Settings"
        }
    }
    /// The SF Symbol `NavRail` renders for this screen.
    public var symbolName: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .stages: return "flowchart"
        case .dashboard: return "chart.bar.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

public struct StudioTitleBar: View {
    public var link: StudioStore.Link
    public var budget: Sourced<Double>
    public var lastRefreshAt: Date?
    public var onReconnect: (() -> Void)?

    public static let height: CGFloat = 44

    public init(link: StudioStore.Link, budget: Sourced<Double>, lastRefreshAt: Date? = nil,
                onReconnect: (() -> Void)? = nil) {
        self.link = link
        self.budget = budget
        self.lastRefreshAt = lastRefreshAt
        self.onReconnect = onReconnect
    }

    public var body: some View {
        HStack(spacing: HUDTheme.space.m) {
            // Traffic-light inset.
            Color.clear.frame(width: 64, height: 1)
            HStack(spacing: HUDTheme.space.xs) {
                Text("Studio").font(HUDTypography.displayHeading).foregroundStyle(HUDTheme.ink)
                HUDLabel("app factory")
            }
            Spacer()
            beacon
            budgetGauge
        }
        .padding(.trailing, HUDTheme.space.m)
        .frame(height: Self.height)
        .frame(maxWidth: .infinity)
        .background(HUDTheme.hull)
        .overlay(alignment: .bottom) { Rectangle().fill(HUDTheme.hairline).frame(height: 1) }
    }

    private var beaconPill: StatusPill {
        switch link {
        case .unconfigured: return StatusPill(.unknown, label: "no daemon configured")
        case .connecting: return StatusPill(.running, label: "daemon connecting")
        case .connected(let d):
            return d.readiness == .ready ? StatusPill(.connected, label: "daemon ready")
                                         : StatusPill(.failed, label: "daemon degraded", symbol: "exclamationmark.triangle.fill")
        case .offline: return StatusPill(.disconnected, label: "daemon offline")
        }
    }

    private var beacon: some View {
        Button {
            onReconnect?()
        } label: {
            beaconPill
        }
        .buttonStyle(.plain)
        .help(link.description)
        .accessibilityLabel(link.description)
        .accessibilityHint(onReconnect == nil ? Text(verbatim: "") : Text("Reconnects to the daemon"))
    }

    private var budgetGauge: some View {
        HStack(spacing: HUDTheme.space.xs) {
            MiniArc(fraction: budget.value, role: .machine)
                .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 0) {
                Text(budget.value.map { "\(Int(($0 * 100).rounded()))%" } ?? "—")
                    .font(HUDTypography.monoReadout)
                    .foregroundStyle(budget.value == nil ? HUDTheme.mute : HUDTheme.ink)
                HStack(spacing: 3) {
                    HUDLabel("budget")
                    ProvenanceBadge(budget.provenance, compact: true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Budget: \(budget.value.map { "\(Int(($0 * 100).rounded())) percent" } ?? "unknown"), \(budget.provenance.detail)")
    }
}

/// A tiny arc for chrome readouts (no centre text; the caller prints the value beside it).
public struct MiniArc: View {
    public var fraction: Double?
    public var role: HUDRole
    public var lineWidth: CGFloat

    public init(fraction: Double?, role: HUDRole = .machine, lineWidth: CGFloat = 3) {
        self.fraction = fraction
        self.role = role
        self.lineWidth = lineWidth
    }

    public var body: some View {
        ZStack {
            Circle().stroke(role.track, lineWidth: lineWidth)
            if let fraction {
                Circle()
                    .trim(from: 0, to: min(max(fraction, 0), 1))
                    .stroke(role.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: role.glow, radius: lineWidth)
            }
        }
        .accessibilityHidden(true)
    }
}

#Preview("Title bar") {
    VStack(spacing: 0) {
        StudioTitleBar(link: .connected(DoctorResult(readiness: .ready, daemonVersion: "0.1.0-ui-demo", protocolVersion: 1,
                                                      startedAt: IsoInstant(unchecked: "2026-08-16T16:00:00.000Z"), issues: [])),
                       budget: Sourced(0.38, .staticValue("phase 1 placeholder")))
        StudioTitleBar(link: .offline("[client] transport.connection-failed"), budget: Sourced(0.38, .staticValue("phase 1 placeholder")))
        Spacer()
    }
    .frame(width: 1000, height: 140)
    .background(HUDTheme.void)
    .preferredColorScheme(.dark)
}
