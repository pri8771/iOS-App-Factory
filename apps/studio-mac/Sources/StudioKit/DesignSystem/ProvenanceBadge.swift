import SwiftUI

// MARK: - ProvenanceBadge
//
// The small mono tag printed next to every instrument value saying where the value came from.
// Live/derived speak in the machine's dim cyan (a claim the machine backs); fixture is neutral ink in
// a dashed capsule (mirrors reality, not read from the daemon); static and not-yet-sourced are muted.
// Never gold: provenance is never a thing waiting on the human.

public struct ProvenanceBadge: View {
    public var provenance: Provenance
    public var compact: Bool

    public init(_ provenance: Provenance, compact: Bool = false) {
        self.provenance = provenance
        self.compact = compact
    }

    private var color: Color {
        switch provenance {
        case .live, .derived: return HUDTheme.arcDim
        case .fixture: return HUDTheme.soft
        case .staticValue, .notYetSourced: return HUDTheme.mute
        }
    }

    private var dashed: Bool {
        if case .fixture = provenance { return true }
        return false
    }

    public var body: some View {
        Text(provenance.badge)
            .font(.system(size: compact ? 8 : 9, weight: .medium, design: .monospaced))
            .textCase(.uppercase)
            .tracking(1.0)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(color)
            .padding(.horizontal, compact ? 4 : 5)
            .padding(.vertical, compact ? 1 : 2)
            .overlay(
                Capsule().stroke(color.opacity(0.55),
                                 style: StrokeStyle(lineWidth: 1, dash: dashed ? [2, 2] : []))
            )
            .help(provenance.detail)
            .accessibilityLabel("source: \(provenance.detail)")
    }
}

#Preview("Provenance badges") {
    HStack(spacing: 8) {
        ProvenanceBadge(.live("portfolio.snapshot"))
        ProvenanceBadge(.derived("attempt.list · 7d"))
        ProvenanceBadge(.fixture("timeline-fixture.json"))
        ProvenanceBadge(.staticValue("phase 1"))
        ProvenanceBadge(.notYetSourced)
    }
    .padding()
    .background(HUDTheme.void)
}
