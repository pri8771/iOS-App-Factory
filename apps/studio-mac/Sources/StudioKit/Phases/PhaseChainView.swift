import SwiftUI

// MARK: - PhaseChainView
//
// The horizontal stage-chain strip atop the Stages screen (Architecture decision 15): one node per
// phase in the selected preset's ordered `phases[]` — "STAGE N" mono label, name, `castSummary`, a ◆
// `DiamondGate` mark when the phase carries any typed gates, and a small dot when a run is active for
// that phase (gold while awaiting-human, arc-cyan otherwise — mirrors `PhasesScreen.runBadge`). The
// selected node is arc-accented. "+" insert buttons sit between every node (and at both ends), so a
// new stage can be dropped at any position; `onInsert(index)` is the only way a stage gets created —
// nothing here writes to the daemon itself (that's `PhasesModel.startNewPhase`/`savePhase`).

public struct PhaseChainView: View {
    public var phases: [PhaseDefinition]
    public var selectedPhaseId: PhaseId?
    public var activeRuns: [PhaseId: PhaseRun]
    public var onSelect: (PhaseId) -> Void
    public var onInsert: (Int) -> Void

    public init(phases: [PhaseDefinition], selectedPhaseId: PhaseId?, activeRuns: [PhaseId: PhaseRun],
               onSelect: @escaping (PhaseId) -> Void, onInsert: @escaping (Int) -> Void) {
        self.phases = phases
        self.selectedPhaseId = selectedPhaseId
        self.activeRuns = activeRuns
        self.onSelect = onSelect
        self.onInsert = onInsert
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                insertButton(at: 0)
                ForEach(Array(phases.enumerated()), id: \.element.id) { index, phase in
                    node(phase, index: index)
                    insertButton(at: index + 1)
                }
                if phases.isEmpty {
                    Text("No stages yet.").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                        .padding(.leading, HUDTheme.space.xs)
                }
            }
            .padding(.vertical, HUDTheme.space.s)
            .padding(.horizontal, HUDTheme.space.m)
        }
    }

    private func node(_ phase: PhaseDefinition, index: Int) -> some View {
        let isSelected = phase.phaseId == selectedPhaseId
        return Button { onSelect(phase.phaseId) } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text("STAGE \(index + 1)").font(HUDTypography.monoLabel).tracking(1.0)
                        .foregroundStyle(isSelected ? HUDTheme.arc : HUDTheme.mute)
                    if !phase.gates.isEmpty { DiamondGate(state: .waiting, size: 8) }
                    Spacer(minLength: 0)
                    if let run = activeRuns[phase.phaseId] { runDot(run) }
                }
                Text(phase.name.isEmpty ? "untitled" : phase.name)
                    .font(HUDTypography.bodyStrong)
                    .foregroundStyle(isSelected ? HUDTheme.arc : HUDTheme.ink)
                    .lineLimit(1)
                Text(phase.castSummary).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute).lineLimit(1)
            }
            .padding(HUDTheme.space.s)
            .frame(width: 168, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 6).fill(isSelected ? HUDTheme.raised : HUDTheme.hull))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(isSelected ? HUDTheme.arc : HUDTheme.hairline,
                                                              lineWidth: isSelected ? 1.5 : 1))
        }.buttonStyle(.plain)
    }

    private func runDot(_ run: PhaseRun) -> some View {
        Circle().fill(run.isAwaitingHuman ? HUDTheme.gold : HUDTheme.arc).frame(width: 6, height: 6)
    }

    private func insertButton(at index: Int) -> some View {
        Button { onInsert(index) } label: {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 15))
                .foregroundStyle(HUDTheme.mute)
        }
        .buttonStyle(.plain)
        .frame(width: 22)
        .help("Insert a new stage here")
    }
}

#Preview("Phase chain") {
    PhaseChainView(
        phases: [],
        selectedPhaseId: nil,
        activeRuns: [:],
        onSelect: { _ in },
        onInsert: { _ in })
        .background(HUDTheme.void)
}
