import SwiftUI

// MARK: - HUDGallery
//
// Every design-system piece on one plate, in both appearances. Used by the previews and by the
// snapshot tests, so the reference images are the same picture a designer sees in Xcode.

public struct HUDGallery: View {
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HStack(alignment: .top, spacing: HUDTheme.space.m) {
                gauges
                rings
                gates
            }
            pills
            buttons
            typography
        }
        .padding(HUDTheme.space.l)
        .background(HUDTheme.void)
    }

    private var gauges: some View {
        HStack(alignment: .top, spacing: HUDTheme.space.m) {
            RadialGauge(value: 0.62, label: "portfolio", caption: "5 / 8")
                .frame(width: 96)
            RadialGauge(value: nil, label: "coverage")
                .frame(width: 96)
            RadialGauge(value: 0.35, label: "release plan", planned: true)
                .frame(width: 96)
        }
        .hudPanel("gauges")
    }

    private var rings: some View {
        HStack(spacing: HUDTheme.space.m) {
            PhaseRing(phases: [
                .init("explore", .done), .init("plan", .done), .init("build", .active),
                .init("qa", .planned), .init("testflight", .gate), .init("release", .planned),
            ], center: "3/6")
            .frame(width: 84, height: 84)
            PhaseRing(phases: [
                .init("explore", .done), .init("plan", .done), .init("build", .done),
                .init("qa", .unknown), .init("testflight", .unknown), .init("release", .unknown),
            ], center: "?")
            .frame(width: 84, height: 84)
        }
        .hudPanel("phase rings")
    }

    private var gates: some View {
        HStack(spacing: HUDTheme.space.m) {
            DiamondGate(state: .waiting, size: 14, label: "Approve TestFlight build")
            DiamondGate(state: .cleared, size: 14, label: "Plan approved")
            DiamondGate(state: .declined, size: 14, label: "Release declined")
        }
        .hudPanel("gates", role: .human)
    }

    private var pills: some View {
        let kinds = HUDStatusKind.allCases
        return VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xs) {
                ForEach(kinds.prefix(7), id: \.self) { StatusPill($0) }
            }
            HStack(spacing: HUDTheme.space.xs) {
                ForEach(kinds.dropFirst(7), id: \.self) { StatusPill($0) }
                StatusPill(.running, label: "running 02:14")
            }
        }
        .hudPanel("status")
    }

    private var buttons: some View {
        HStack(spacing: HUDTheme.space.xs) {
            HUDButton("Approve", systemImage: "diamond.fill", variant: .gold) {}
            HUDButton("Run", systemImage: "play.fill", variant: .arc) {}
            HUDButton("Inspect", variant: .solid) {}
            HUDButton("Dismiss", variant: .ghost) {}
            HUDButton("Disabled", variant: .gold) {}.disabled(true)
        }
        .hudPanel("controls")
    }

    private var typography: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            Text("Studio").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
            Text("The machine speaks in cyan. Gold waits on you.").hudBody()
            HStack(spacing: HUDTheme.space.l) {
                HUDReadout("daemon", value: "0.1.0")
                HUDReadout("attempts", value: "3")
                HUDReadout("coverage", value: nil)
                HUDReadout("gate", value: "1 waiting", role: .human)
            }
        }
        .hudPanel("type")
    }
}

#Preview("HUD gallery — dark") {
    HUDGallery().preferredColorScheme(.dark)
}

#Preview("HUD gallery — light") {
    HUDGallery().preferredColorScheme(.light)
}
