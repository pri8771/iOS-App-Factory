import SwiftUI

// MARK: - TimelineView
//
// The dashboard's centrepiece: one Gantt row per project over a fixed window (Jul 15 → Oct 15 in the
// phase-1 fixture), month columns, a glowing today-line, and bars in exactly the prototype's kinds:
//
//   done      solid cyan            the machine did it (evidenced)
//   live      glowing cyan + cap    the machine is doing it now
//   plan      dashed cyan           the machine intends to
//   review    hatched neutral       waiting on an external party (App Review) — neither voice
//   unknown   dashed alert          "won't guess": no honest estimate exists
//   gate ◆    gold while waiting    the human decides; hollow ok once cleared
//
// Rows are `ProjectTimeline`s. Today they come from the bundled fixture (with live attempt marks
// overlaid); the row's provenance badge says which. Drawing is `Canvas` so 6 rows × N bars stay one
// draw call each; every row also carries a full VoiceOver description because Canvas is opaque.

public struct TimelineView: View {
    public var rows: [ProjectTimeline]
    public var window: TimelineWindow
    public var today: DayStamp
    public var selectedSlug: String?
    public var onSelect: ((String) -> Void)?
    public var showsLegend: Bool

    public static let labelWidth: CGFloat = 156
    public static let rowHeight: CGFloat = 44
    public static let headerHeight: CGFloat = 26
    public static let barHeight: CGFloat = 14

    public init(rows: [ProjectTimeline], window: TimelineWindow, today: DayStamp, selectedSlug: String? = nil,
                onSelect: ((String) -> Void)? = nil, showsLegend: Bool = true) {
        self.rows = rows
        self.window = window
        self.today = today
        self.selectedSlug = selectedSlug
        self.onSelect = onSelect
        self.showsLegend = showsLegend
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                HUDLabel("project")
                    .frame(width: Self.labelWidth, alignment: .leading)
                    .padding(.leading, HUDTheme.space.xs)
                TimelineHeaderCanvas(window: window, today: today)
                    .frame(height: Self.headerHeight)
            }
            .frame(height: Self.headerHeight)
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            if rows.isEmpty {
                Text("no rows — no fixture and no daemon projects")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    .frame(maxWidth: .infinity, minHeight: Self.rowHeight * 2)
            }
            ForEach(rows) { row in
                TimelineRowView(row: row, window: window, today: today, selected: row.slug == selectedSlug, onSelect: onSelect)
                    .frame(height: Self.rowHeight)
                Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            }
            if showsLegend {
                TimelineLegend(rows: rows)
                    .padding(.top, HUDTheme.space.xs)
            }
        }
    }
}

// MARK: - Geometry shared by header and rows

struct TimelineScale {
    var window: TimelineWindow
    var width: CGFloat

    func x(_ day: DayStamp) -> CGFloat { CGFloat(window.fraction(of: day)) * width }
    /// Right edge of an inclusive day.
    func xEnd(_ day: DayStamp) -> CGFloat { x(day.adding(days: 1)) }
    var dayWidth: CGFloat { width / CGFloat(window.dayCount) }
}

// MARK: - Header

struct TimelineHeaderCanvas: View {
    var window: TimelineWindow
    var today: DayStamp

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let scale = TimelineScale(window: window, width: size.width)
            let ticks = window.monthTicks
            for (index, tick) in ticks.enumerated() {
                let x = scale.x(tick).rounded() + 0.5
                var line = Path()
                line.move(to: CGPoint(x: x, y: size.height - 8))
                line.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(line, with: .color(HUDTheme.faint), lineWidth: 1)
                let isEdge = index == 0 || index == ticks.count - 1
                let label = isEdge ? tick.shortLabel.uppercased() : tick.monthLabel
                let text = context.resolve(Text(label).font(.system(size: 9, weight: .medium, design: .monospaced))
                    .tracking(1.2).foregroundStyle(HUDTheme.mute))
                let anchor: UnitPoint = index == ticks.count - 1 ? .bottomTrailing : .bottomLeading
                let dx: CGFloat = index == ticks.count - 1 ? -3 : 3
                context.draw(text, at: CGPoint(x: x + dx, y: size.height - 9), anchor: anchor)
            }
            // Today
            if window.contains(today) {
                let x = (scale.x(today) + scale.dayWidth / 2).rounded() + 0.5
                var line = Path()
                line.move(to: CGPoint(x: x, y: size.height - 6))
                line.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(line, with: .color(HUDTheme.arc), lineWidth: 1)
                let text = context.resolve(Text("TODAY").font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .tracking(1.6).foregroundStyle(HUDTheme.arcHi))
                let width = text.measure(in: CGSize(width: 200, height: 20)).width
                let anchorX = min(max(x, width / 2 + 2), size.width - width / 2 - 2)
                context.draw(text, at: CGPoint(x: anchorX, y: size.height - 8), anchor: .bottom)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Row

struct TimelineRowView: View {
    var row: ProjectTimeline
    var window: TimelineWindow
    var today: DayStamp
    var selected: Bool
    var onSelect: ((String) -> Void)?

    @State private var hovering = false

    var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: TimelineView.labelWidth, alignment: .leading)
                .padding(.leading, HUDTheme.space.xs)
            TimelineBarsCanvas(row: row, window: window, today: today)
        }
        .background(selected ? HUDTheme.raised : (hovering ? HUDTheme.raised.opacity(0.5) : Color.clear))
        .overlay(alignment: .leading) {
            if selected { Rectangle().fill(HUDTheme.arc).frame(width: 2) }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture { onSelect?(row.slug) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(onSelect == nil ? [] : .isButton)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var label: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.name)
                .font(HUDTypography.displaySubheading)
                .foregroundStyle(HUDTheme.ink)
                .lineLimit(1)
            HStack(spacing: HUDTheme.space.xxs) {
                Text(row.slug)
                    .font(HUDTypography.monoLabel)
                    .foregroundStyle(HUDTheme.mute)
                    .lineLimit(1)
                ProvenanceBadge(row.provenance, compact: true)
            }
        }
    }

    private var accessibilityText: String {
        var parts = [row.name]
        for bar in row.bars {
            switch bar.kind {
            case .gate:
                let state = bar.gateState.map { $0.rawValue } ?? "gate"
                parts.append("\(bar.label) gate \(state) \(bar.start.shortLabel)")
            default:
                let end = bar.end.map(\.shortLabel) ?? "today"
                parts.append("\(bar.label) \(bar.kind.word) \(bar.start.shortLabel) to \(end)")
            }
        }
        if let note = row.note { parts.append(note) }
        parts.append("source \(row.provenance.detail)")
        return parts.joined(separator: "; ")
    }
}

// MARK: - Bars canvas

struct TimelineBarsCanvas: View {
    var row: ProjectTimeline
    var window: TimelineWindow
    var today: DayStamp

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let scale = TimelineScale(window: window, width: size.width)
            drawGrid(context: context, scale: scale, size: size)
            drawTodayGlow(context: context, scale: scale, size: size)
            drawTodayLine(context: context, scale: scale, size: size, opacity: 1)
            // Bars sit on the today-line so same-day live marks stay visible; a faint re-stroke keeps
            // the line legible across long bars.
            let bars = row.bars.filter { $0.kind != .gate }
            for bar in bars { draw(bar, context: context, scale: scale, size: size) }
            drawTodayLine(context: context, scale: scale, size: size, opacity: 0.35)
            for gate in row.bars where gate.kind == .gate { drawGate(gate, context: context, scale: scale, size: size) }
        }
        .accessibilityHidden(true)
    }

    private func drawGrid(context: GraphicsContext, scale: TimelineScale, size: CGSize) {
        for tick in window.monthTicks.dropFirst().dropLast() {
            let x = scale.x(tick).rounded() + 0.5
            var line = Path()
            line.move(to: CGPoint(x: x, y: 0))
            line.addLine(to: CGPoint(x: x, y: size.height))
            context.stroke(line, with: .color(HUDTheme.hairline), lineWidth: 1)
        }
    }

    private func todayLineX(_ scale: TimelineScale) -> CGFloat? {
        guard window.contains(today) else { return nil }
        return (scale.x(today) + scale.dayWidth / 2).rounded() + 0.5
    }

    private func drawTodayGlow(context: GraphicsContext, scale: TimelineScale, size: CGSize) {
        guard let x = todayLineX(scale) else { return }
        var glow = Path()
        glow.move(to: CGPoint(x: x, y: 0))
        glow.addLine(to: CGPoint(x: x, y: size.height))
        context.stroke(glow, with: .color(HUDTheme.glow), lineWidth: 5)
    }

    private func drawTodayLine(context: GraphicsContext, scale: TimelineScale, size: CGSize, opacity: Double) {
        guard let x = todayLineX(scale) else { return }
        var line = Path()
        line.move(to: CGPoint(x: x, y: 0))
        line.addLine(to: CGPoint(x: x, y: size.height))
        context.stroke(line, with: .color(HUDTheme.arc.opacity(opacity)), lineWidth: 1)
    }

    private func rect(for bar: TimelineBar, scale: TimelineScale, size: CGSize) -> CGRect? {
        let end = bar.resolvedEnd(today: today)
        var x0 = scale.x(bar.start)
        var x1 = scale.xEnd(end)
        if x1 < 0 || x0 > scale.width { return nil }
        x0 = max(0, x0)
        x1 = min(scale.width, x1)
        if x1 - x0 < 3 { x1 = min(scale.width, x0 + 3) }
        let y = (size.height - TimelineView.barHeight) / 2
        return CGRect(x: x0.rounded(), y: y.rounded(), width: max(3, (x1 - x0).rounded()), height: TimelineView.barHeight)
    }

    private func draw(_ bar: TimelineBar, context: GraphicsContext, scale: TimelineScale, size: CGSize) {
        guard let rect = rect(for: bar, scale: scale, size: size) else { return }
        let path = Path(roundedRect: rect, cornerRadius: 2)
        let inset = Path(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), cornerRadius: 2)
        var labelColor: Color = HUDTheme.ink
        switch bar.kind {
        case .done:
            context.fill(path, with: .color(HUDTheme.arc.opacity(0.42)))
            context.stroke(inset, with: .color(HUDTheme.arc.opacity(0.55)), lineWidth: 1)
            labelColor = HUDTheme.ink
        case .live:
            var glow = context
            glow.addFilter(.blur(radius: 4))
            glow.fill(path, with: .color(HUDTheme.glow))
            context.fill(path, with: .color(HUDTheme.arc.opacity(0.9)))
            // Bright cap at the leading (right) edge.
            let cap = CGRect(x: rect.maxX - 3, y: rect.minY, width: 3, height: rect.height)
            context.fill(Path(roundedRect: cap, cornerRadius: 1), with: .color(HUDTheme.arcHi))
            labelColor = HUDTheme.hull
        case .plan:
            context.fill(path, with: .color(HUDTheme.arc.opacity(0.06)))
            context.stroke(inset, with: .color(HUDTheme.arc.opacity(0.85)),
                           style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            labelColor = HUDTheme.arc
        case .review:
            context.fill(path, with: .color(HUDTheme.soft.opacity(0.10)))
            var hatch = context
            hatch.clip(to: path)
            var lines = Path()
            var x = rect.minX - rect.height
            while x < rect.maxX {
                lines.move(to: CGPoint(x: x, y: rect.maxY))
                lines.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
                x += 6
            }
            hatch.stroke(lines, with: .color(HUDTheme.soft.opacity(0.45)), lineWidth: 1)
            context.stroke(inset, with: .color(HUDTheme.soft.opacity(0.5)), lineWidth: 1)
            labelColor = HUDTheme.soft
        case .unknown:
            context.fill(path, with: .color(HUDTheme.alert.opacity(0.05)))
            context.stroke(inset, with: .color(HUDTheme.alert.opacity(0.85)),
                           style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            labelColor = HUDTheme.alert
        case .gate:
            return
        }
        // Label inside the bar when it fits.
        let text = context.resolve(Text(bar.label.uppercased()).font(.system(size: 8.5, weight: .medium, design: .monospaced))
            .tracking(0.8).foregroundStyle(labelColor))
        let measured = text.measure(in: CGSize(width: 400, height: 20))
        if measured.width + 10 <= rect.width {
            context.draw(text, at: CGPoint(x: rect.minX + 6, y: rect.midY), anchor: .leading)
        }
    }

    private func drawGate(_ gate: TimelineBar, context: GraphicsContext, scale: TimelineScale, size: CGSize) {
        let x = scale.x(gate.start) + scale.dayWidth / 2
        guard x >= -6, x <= scale.width + 6 else { return }
        let center = CGPoint(x: x.rounded(), y: (size.height / 2).rounded())
        let s: CGFloat = 5.5
        var diamond = Path()
        diamond.move(to: CGPoint(x: center.x, y: center.y - s))
        diamond.addLine(to: CGPoint(x: center.x + s, y: center.y))
        diamond.addLine(to: CGPoint(x: center.x, y: center.y + s))
        diamond.addLine(to: CGPoint(x: center.x - s, y: center.y))
        diamond.closeSubpath()
        switch gate.gateState ?? .waiting {
        case .waiting:
            var glow = context
            glow.addFilter(.blur(radius: 5))
            var halo = Path()
            let g = s * 2.2
            halo.move(to: CGPoint(x: center.x, y: center.y - g))
            halo.addLine(to: CGPoint(x: center.x + g, y: center.y))
            halo.addLine(to: CGPoint(x: center.x, y: center.y + g))
            halo.addLine(to: CGPoint(x: center.x - g, y: center.y))
            halo.closeSubpath()
            glow.fill(halo, with: .color(HUDTheme.goldGlow))
            context.fill(diamond, with: .color(HUDTheme.gold))
        case .cleared:
            context.fill(diamond, with: .color(HUDTheme.plate))
            context.stroke(diamond, with: .color(HUDTheme.ok), lineWidth: 1.5)
        case .declined:
            context.fill(diamond, with: .color(HUDTheme.plate))
            context.stroke(diamond, with: .color(HUDTheme.alert), lineWidth: 1.5)
        }
    }
}

// MARK: - Legend

struct TimelineLegend: View {
    var rows: [ProjectTimeline]

    private var provenances: [Provenance] {
        var seen: [Provenance] = []
        for row in rows where !seen.contains(row.provenance) { seen.append(row.provenance) }
        return seen
    }

    var body: some View {
        HStack(spacing: HUDTheme.space.m) {
            ForEach(TimelineBarKind.allCases, id: \.self) { kind in
                HStack(spacing: HUDTheme.space.xxs) {
                    LegendSwatch(kind: kind).frame(width: 18, height: 10)
                    Text(kind.word)
                        .font(HUDTypography.monoLabel)
                        .textCase(.uppercase)
                        .tracking(1.0)
                        .foregroundStyle(HUDTheme.mute)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("legend: \(kind.word)")
            }
            Spacer(minLength: 0)
            ForEach(provenances, id: \.self) { ProvenanceBadge($0, compact: true) }
        }
        .padding(.leading, HUDTheme.space.xs)
    }
}

struct LegendSwatch: View {
    var kind: TimelineBarKind

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5)
            let path = Path(roundedRect: rect, cornerRadius: 2)
            switch kind {
            case .done:
                context.fill(path, with: .color(HUDTheme.arc.opacity(0.42)))
                context.stroke(path, with: .color(HUDTheme.arc.opacity(0.55)), lineWidth: 1)
            case .live:
                context.fill(path, with: .color(HUDTheme.arc.opacity(0.9)))
                context.fill(Path(CGRect(x: rect.maxX - 2.5, y: rect.minY, width: 2.5, height: rect.height)), with: .color(HUDTheme.arcHi))
            case .plan:
                context.stroke(path, with: .color(HUDTheme.arc.opacity(0.85)), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            case .review:
                context.fill(path, with: .color(HUDTheme.soft.opacity(0.10)))
                var lines = Path()
                var x = rect.minX - rect.height
                while x < rect.maxX { lines.move(to: CGPoint(x: x, y: rect.maxY)); lines.addLine(to: CGPoint(x: x + rect.height, y: rect.minY)); x += 5 }
                var hatch = context
                hatch.clip(to: path)
                hatch.stroke(lines, with: .color(HUDTheme.soft.opacity(0.45)), lineWidth: 1)
                context.stroke(path, with: .color(HUDTheme.soft.opacity(0.5)), lineWidth: 1)
            case .unknown:
                context.stroke(path, with: .color(HUDTheme.alert.opacity(0.85)), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            case .gate:
                let c = CGPoint(x: rect.midX, y: rect.midY)
                let s = rect.height / 2
                var d = Path()
                d.move(to: CGPoint(x: c.x, y: c.y - s)); d.addLine(to: CGPoint(x: c.x + s, y: c.y))
                d.addLine(to: CGPoint(x: c.x, y: c.y + s)); d.addLine(to: CGPoint(x: c.x - s, y: c.y)); d.closeSubpath()
                context.fill(d, with: .color(HUDTheme.gold))
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Previews

#Preview("Timeline — fixture, dark") {
    let fixture = try! TimelineFixture.loadBundled()
    return TimelineView(rows: fixture.projects, window: fixture.window, today: try! DayStamp("2026-08-16"), selectedSlug: "hindsight")
        .padding()
        .hudPanel("timeline")
        .padding()
        .frame(width: 980)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
