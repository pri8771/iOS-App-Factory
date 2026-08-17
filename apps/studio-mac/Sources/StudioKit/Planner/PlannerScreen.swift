import SwiftUI

// MARK: - PlannerScreen
//
// A punch-list view of a `ProjectPlan`: ordered items, task vs ◆gate visually distinct, drag-to-
// reorder + "defer" (→ `plan.edit`), status per item, the brief at top, Approve (gold, →
// `plan.approve`), Execute (→ `plan.execute`), gate cards with Approve gate (gold, →
// `plan.approve-gate`). Never a graph — `dependsOn` only ever points earlier in the list, so the flat
// order is the whole story. The brief itself has no `plan.edit` kind on the wire (see
// `project-plan.ts`'s `ProjectPlanEditV1` union) — it renders read-only rather than offering an edit
// the daemon cannot honour.

public struct PlannerScreen: View {
    public var plan: ProjectPlan
    public var isSavingEdit: Bool
    public var isApproving: Bool
    public var isExecuting: Bool
    public var error: String?
    public var onBack: () -> Void
    public var onReorder: ([ProjectPlanItemId]) async -> Void
    public var onDefer: (ProjectPlanItemId) async -> Void
    public var onApprove: () async -> Void
    public var onExecute: () async -> Void
    public var onApproveGate: (ProjectPlanItemId) async -> Void

    public init(plan: ProjectPlan, isSavingEdit: Bool, isApproving: Bool, isExecuting: Bool, error: String?,
               onBack: @escaping () -> Void, onReorder: @escaping ([ProjectPlanItemId]) async -> Void,
               onDefer: @escaping (ProjectPlanItemId) async -> Void, onApprove: @escaping () async -> Void,
               onExecute: @escaping () async -> Void, onApproveGate: @escaping (ProjectPlanItemId) async -> Void) {
        self.plan = plan
        self.isSavingEdit = isSavingEdit
        self.isApproving = isApproving
        self.isExecuting = isExecuting
        self.error = error
        self.onBack = onBack
        self.onReorder = onReorder
        self.onDefer = onDefer
        self.onApprove = onApprove
        self.onExecute = onExecute
        self.onApproveGate = onApproveGate
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Rectangle().fill(HUDTheme.hairline).frame(height: 1)
            briefPanel
            if let error {
                Text(error).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .padding(.horizontal, HUDTheme.space.l).padding(.top, HUDTheme.space.xs)
            }
            itemsList
        }
        .background(HUDTheme.void)
    }

    private var header: some View {
        HStack(spacing: HUDTheme.space.m) {
            Button(action: onBack) { Image(systemName: "chevron.left") }
                .buttonStyle(.plain).foregroundStyle(HUDTheme.soft)
            Text("Planner").font(HUDTypography.displayHeading).foregroundStyle(HUDTheme.ink)
            planStatePill
            ProvenanceBadge(.live("plan.status"), compact: true)
            Spacer()
            if isSavingEdit { ProgressView().controlSize(.small) }
            if plan.state == .draft {
                HUDButton(isApproving ? "Approving…" : "Approve", variant: .gold) { Task { await onApprove() } }
                    .disabled(isApproving)
            }
            if plan.state == .approved {
                HUDButton(isExecuting ? "Executing…" : "Execute", variant: .arc) { Task { await onExecute() } }
                    .disabled(isExecuting)
            }
        }
        .padding(HUDTheme.space.m)
    }

    private var planStatePill: StatusPill {
        switch plan.state {
        case .draft: return StatusPill(.queued, label: "draft")
        case .approved: return StatusPill(.paused, label: "approved")
        case .executing: return StatusPill(.running, label: "executing")
        case .complete: return StatusPill(.succeeded, label: "complete")
        }
    }

    private var briefPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HStack(spacing: HUDTheme.space.xxs) {
                Text(plan.brief.title).font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink)
                ProvenanceBadge(.staticValue("no plan.edit kind for the brief yet"), compact: true)
            }
            Text(plan.brief.oneLiner).font(HUDTypography.body).foregroundStyle(HUDTheme.soft)
            if !plan.brief.constraints.isEmpty {
                HStack(spacing: HUDTheme.space.xxs) {
                    ForEach(plan.brief.constraints, id: \.self) { constraint in
                        Text(constraint).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .overlay(Capsule().stroke(HUDTheme.hairline, lineWidth: 1))
                    }
                }
            }
        }
        .padding(HUDTheme.space.m)
    }

    private var itemsList: some View {
        List {
            ForEach(plan.items) { item in
                itemRow(item)
                    .listRowBackground(HUDTheme.void)
                    .listRowSeparatorTint(HUDTheme.hairline)
            }
            .onMove { indices, destination in
                var order = plan.items.map(\.id)
                order.move(fromOffsets: indices, toOffset: destination)
                Task { await onReorder(order) }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    @ViewBuilder
    private func itemRow(_ item: ProjectPlanItem) -> some View {
        switch item {
        case .task(let task): taskRow(task)
        case .gate(let gate): gateRow(gate)
        }
    }

    private func taskRow(_ task: ProjectPlanTaskItem) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.s) {
            Image(systemName: "circle.fill").font(.system(size: 6)).foregroundStyle(HUDTheme.arcDim).padding(.top, 6)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: HUDTheme.space.xs) {
                    Text(task.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                    itemStatusPill(task.status)
                }
                Text(task.phase.rawValue).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                if let detail = task.detail {
                    Text(detail).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                }
                if let attemptId = task.attemptId {
                    Text("attempt \(attemptId.rawValue)").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                }
            }
            Spacer()
            if task.status == .proposed || task.status == .approved {
                HUDButton("Defer", variant: .ghost, compact: true) { Task { await onDefer(task.itemId) } }
            }
        }
        .padding(.vertical, HUDTheme.space.xxs)
    }

    private func gateRow(_ gate: ProjectPlanGateItem) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.s) {
            DiamondGate(state: gateState(gate.status), size: 10, label: gate.title).padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: HUDTheme.space.xs) {
                    Text(gate.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                    gateStatusPill(gate.status)
                }
                Text(gate.gate.reason).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
            }
            Spacer()
            if gate.status == .proposed {
                HUDButton("Approve gate", variant: .gold, compact: true) { Task { await onApproveGate(gate.itemId) } }
            }
        }
        .padding(HUDTheme.space.s)
        .hudPanel(role: .human, padding: HUDTheme.space.xs)
        .padding(.vertical, HUDTheme.space.xxs)
    }

    private func gateState(_ status: ProjectPlanGateItemStatus) -> DiamondGate.GateState {
        switch status {
        case .proposed: return .waiting
        case .approved: return .cleared
        case .deferred: return .declined
        }
    }

    private func gateStatusPill(_ status: ProjectPlanGateItemStatus) -> StatusPill {
        switch status {
        case .proposed: return StatusPill(.blocked, label: "awaiting your gate")
        case .approved: return StatusPill(.succeeded, label: "cleared")
        case .deferred: return StatusPill(.paused, label: "deferred")
        }
    }

    private func itemStatusPill(_ status: ProjectPlanItemStatus) -> StatusPill {
        switch status {
        case .proposed: return StatusPill(.queued, label: "proposed")
        case .approved: return StatusPill(.paused, label: "approved")
        case .deferred: return StatusPill(.paused, label: "deferred")
        case .running: return StatusPill(.running)
        case .done: return StatusPill(.succeeded, label: "done")
        case .failed: return StatusPill(.failed)
        }
    }
}
