import SwiftUI

// MARK: - Lifecycle → ring / track mapping

extension LifecycleStepState {
    /// The ring's segment vocabulary. A cleared gate is done; a waiting gate is the ◆.
    public var ringState: PhaseRing.Phase.State {
        switch self {
        case .done, .gateCleared: return .done
        case .active: return .active
        case .planned: return .planned
        case .unknown: return .unknown
        case .gateWaiting: return .gate
        }
    }

    public var word: String {
        switch self {
        case .done: return "done"
        case .active: return "in progress"
        case .planned: return "planned"
        case .unknown: return "won't guess"
        case .gateWaiting: return "waiting on you"
        case .gateCleared: return "cleared"
        }
    }
}

extension Array where Element == LifecycleStep {
    public var ringPhases: [PhaseRing.Phase] {
        map { PhaseRing.Phase($0.phase.label, $0.state.ringState) }
    }
}

// MARK: - PhaseRingsRow
//
// One ring per project along the bottom of the dashboard. Segments read the project's lifecycle
// track; the centre is "done / total"; the caption is the daemon's attempt count when it has one and
// "—" when it does not. Click → project detail.

public struct PhaseRingsRow: View {
    public var projects: [DashboardProject]
    public var selectedSlug: String?
    public var onSelect: ((String) -> Void)?
    public var ringSize: CGFloat

    public init(projects: [DashboardProject], selectedSlug: String? = nil, onSelect: ((String) -> Void)? = nil,
                ringSize: CGFloat = 76) {
        self.projects = projects
        self.selectedSlug = selectedSlug
        self.onSelect = onSelect
        self.ringSize = ringSize
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if projects.isEmpty {
                Text("no projects").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
            ForEach(projects) { project in
                ProjectRingCell(project: project, selected: project.slug == selectedSlug, size: ringSize) {
                    onSelect?(project.slug)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct ProjectRingCell: View {
    var project: DashboardProject
    var selected: Bool
    var size: CGFloat
    var action: () -> Void
    @State private var hovering = false

    private var runsText: String {
        guard let runs = project.runs.value else { return "—" }
        return "\(runs) run\(runs == 1 ? "" : "s")"
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: HUDTheme.space.xs) {
                PhaseRing(phases: project.lifecycle.ringPhases,
                          center: "\(project.timeline.doneCount)/\(project.lifecycle.count)")
                    .frame(width: size, height: size)
                Text(project.name)
                    .font(HUDTypography.displaySubheading)
                    .foregroundStyle(HUDTheme.ink)
                    .lineLimit(1)
                HStack(spacing: HUDTheme.space.xxs) {
                    Text(runsText)
                        .font(HUDTypography.monoValue)
                        .foregroundStyle(project.runs.value == nil ? HUDTheme.mute : HUDTheme.soft)
                        .lineLimit(1)
                    ProvenanceBadge(project.runs.value == nil ? project.provenance : project.runs.provenance, compact: true)
                }
            }
            .padding(HUDTheme.space.xs)
            .background(selected ? HUDTheme.raised : (hovering ? HUDTheme.raised.opacity(0.5) : Color.clear))
            .overlay {
                if selected {
                    HUDBrackets(cornerLength: 8).stroke(HUDTheme.arc, lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint("Opens the project")
    }

    private var accessibilityText: String {
        let steps = project.lifecycle.map { "\($0.phase.label) \($0.state.word)" }.joined(separator: ", ")
        return "\(project.name): \(project.timeline.doneCount) of \(project.lifecycle.count) done; \(steps); \(runsText)"
    }
}

// MARK: - LifecycleTrack
//
// The project detail's horizontal track: idea → building → qa → launch prep → ◆ device smoke → live.
// The human gate is drawn as a ◆ (gold while waiting, hollow ok once cleared, dashed alert when
// unknown); machine phases are dots joined by rails whose style follows the step state.

public struct LifecycleTrack: View {
    public var steps: [LifecycleStep]

    public init(steps: [LifecycleStep]) {
        self.steps = steps
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                VStack(spacing: HUDTheme.space.xxs) {
                    HStack(spacing: 0) {
                        rail(before: index)
                        marker(step)
                        rail(after: index)
                    }
                    Text(step.phase.label)
                        .font(HUDTypography.monoLabel)
                        .textCase(.uppercase)
                        .tracking(1.0)
                        .foregroundStyle(labelColor(step))
                        .lineLimit(1)
                        .fixedSize()
                    Text(step.state.word)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(HUDTheme.mute)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(step.phase.label): \(step.state.word)")
            }
        }
    }

    private func labelColor(_ step: LifecycleStep) -> Color {
        switch step.state {
        case .gateWaiting: return HUDTheme.gold
        case .active: return HUDTheme.arcHi
        case .done, .gateCleared: return HUDTheme.arc
        case .planned: return HUDTheme.soft
        case .unknown: return HUDTheme.mute
        }
    }

    @ViewBuilder
    private func rail(before index: Int) -> some View {
        if index == 0 {
            Color.clear.frame(height: 1).frame(maxWidth: .infinity)
        } else {
            railLine(for: steps[index])
        }
    }

    @ViewBuilder
    private func rail(after index: Int) -> some View {
        if index == steps.count - 1 {
            Color.clear.frame(height: 1).frame(maxWidth: .infinity)
        } else {
            railLine(for: steps[index + 1])
        }
    }

    /// The rail leading into a step takes that step's state.
    private func railLine(for step: LifecycleStep) -> some View {
        let color: Color
        var dash: [CGFloat] = []
        switch step.state {
        case .done, .gateCleared: color = HUDTheme.arc.opacity(0.8)
        case .active: color = HUDTheme.arc
        case .planned: color = HUDTheme.arc.opacity(0.7); dash = [3, 3]
        case .unknown: color = HUDTheme.alert.opacity(0.8); dash = [3, 3]
        case .gateWaiting: color = HUDTheme.arcDim
        }
        return Rectangle()
            .fill(Color.clear)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
            .overlay {
                Path { p in
                    p.move(to: CGPoint(x: 0, y: 0.5))
                    p.addLine(to: CGPoint(x: 10_000, y: 0.5))
                }
                .stroke(color, style: StrokeStyle(lineWidth: 1, dash: dash))
                .clipped()
            }
    }

    @ViewBuilder
    private func marker(_ step: LifecycleStep) -> some View {
        if step.phase.isHumanGate {
            switch step.state {
            case .gateWaiting: DiamondGate(state: .waiting, size: 12, label: step.phase.label)
            case .gateCleared, .done: DiamondGate(state: .cleared, size: 12, label: step.phase.label)
            case .unknown:
                DiamondShape().stroke(HUDTheme.alert, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                    .frame(width: 12, height: 12).frame(width: 26, height: 26)
            case .active, .planned:
                DiamondShape().stroke(HUDTheme.arc.opacity(0.7), style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                    .frame(width: 12, height: 12).frame(width: 26, height: 26)
            }
        } else {
            ZStack {
                switch step.state {
                case .done, .gateCleared:
                    Circle().fill(HUDTheme.arc.opacity(0.85)).frame(width: 10, height: 10)
                case .active:
                    Circle().fill(HUDTheme.glow).frame(width: 18, height: 18).blur(radius: 3)
                    Circle().fill(HUDTheme.arc).frame(width: 10, height: 10)
                    Circle().stroke(HUDTheme.arcHi, lineWidth: 1).frame(width: 10, height: 10)
                case .planned:
                    Circle().stroke(HUDTheme.arc.opacity(0.7), style: StrokeStyle(lineWidth: 1.5, dash: [2, 2])).frame(width: 10, height: 10)
                case .unknown:
                    Circle().stroke(HUDTheme.alert.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, dash: [2, 2])).frame(width: 10, height: 10)
                case .gateWaiting:
                    DiamondGate(state: .waiting, size: 12, label: step.phase.label)
                }
            }
            .frame(width: 26, height: 26)
        }
    }
}

#Preview("Rings + track") {
    let fixture = try! TimelineFixture.loadBundled()
    let projects = fixture.projects.map { DashboardProject(slug: $0.slug, name: $0.name, timeline: $0, live: nil, attempts: []) }
    return VStack(spacing: 24) {
        PhaseRingsRow(projects: projects, selectedSlug: "svara")
        LifecycleTrack(steps: fixture.projects[1].lifecycle)
    }
    .padding()
    .frame(width: 900)
    .background(HUDTheme.void)
    .preferredColorScheme(.dark)
}
