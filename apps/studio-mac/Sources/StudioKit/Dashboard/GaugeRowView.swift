import SwiftUI

// MARK: - GaugeRowView
//
// The five headline instruments across the top of the dashboard. Each is a `RadialGauge` fed by a
// `GaugeReading`; the provenance badge under the label says where the number came from. A reading
// the machine cannot source renders "—" and no arc — never a placeholder number.

public struct GaugeRowView: View {
    public var gauges: [GaugeReading]
    public var gaugeWidth: CGFloat

    public init(gauges: [GaugeReading], gaugeWidth: CGFloat = 116) {
        self.gauges = gauges
        self.gaugeWidth = gaugeWidth
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(gauges) { gauge in
                VStack(spacing: HUDTheme.space.xxs) {
                    RadialGauge(value: gauge.fraction, readout: gauge.readout ?? "—", label: gauge.label,
                                caption: gauge.caption, role: gauge.role)
                        .frame(width: gaugeWidth)
                    ProvenanceBadge(gauge.provenance, compact: true)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - Previews

extension GaugeReading {
    /// A representative row for previews and snapshots.
    public static var previewRow: [GaugeReading] {
        [
            GaugeReading(id: "projects", label: "projects", readout: "3", fraction: 1.0 / 3.0, caption: "1 active",
                         provenance: .live("portfolio.snapshot")),
            GaugeReading(id: "verified-week", label: "verified · 7d", readout: "3", fraction: 1, caption: "of 3 runs",
                         provenance: .derived("attempt.list ∩ evidence.list · 7d")),
            GaugeReading(id: "awaiting-you", label: "awaiting you", readout: "1", fraction: 1.0 / 3.0,
                         caption: "+3 fixture ◆", role: .human, provenance: .live("portfolio.snapshot")),
            GaugeReading(id: "min-per-release", label: "min / release", readout: nil, fraction: nil,
                         caption: nil, provenance: .notYetSourced),
            GaugeReading(id: "agent-window", label: "agent window", readout: nil, fraction: nil,
                         caption: nil, provenance: .notYetSourced),
        ]
    }
}

#Preview("Gauge row — dark") {
    GaugeRowView(gauges: GaugeReading.previewRow)
        .padding()
        .hudPanel("instruments")
        .padding()
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
