import SwiftUI

// MARK: - ProjectDetailView
//
// One project: the lifecycle track, what the daemon says about it, the latest run's checks (from
// attempt.events + evidence.verify), and the open work. Every panel names its source; a project the
// daemon does not know shows its live readouts as "—".

public struct ProjectDetailView: View {
    public var project: DashboardProject
    public var runs: [AttemptID: RunDetail]
    public var isConnected: Bool
    public var loadRun: ((AttemptID) async -> Void)?
    public var onBack: (() -> Void)?
    /// `project.milestones.list`'s result for this project, when loaded (the real milestone concept —
    /// see Milestone.swift). `nil` means "not loaded yet", distinct from a loaded-and-empty timeline.
    public var milestoneTimeline: ProjectMilestoneTimeline?
    public var milestoneError: String?
    public var onLoadMilestones: (() async -> Void)?
    public var onUpsertMilestone: ((ProjectMilestoneDraft, Int?) async -> Result<ProjectMilestoneUpsertResult, AssistantBackendError>)?

    @State private var selectedAttempt: AttemptID?
    @State private var editingMilestone: ProjectMilestone?
    @State private var showingMilestoneEditor = false

    public init(project: DashboardProject, runs: [AttemptID: RunDetail] = [:], isConnected: Bool = false,
                loadRun: ((AttemptID) async -> Void)? = nil, onBack: (() -> Void)? = nil,
                milestoneTimeline: ProjectMilestoneTimeline? = nil, milestoneError: String? = nil,
                onLoadMilestones: (() async -> Void)? = nil,
                onUpsertMilestone: ((ProjectMilestoneDraft, Int?) async -> Result<ProjectMilestoneUpsertResult, AssistantBackendError>)? = nil) {
        self.project = project
        self.runs = runs
        self.isConnected = isConnected
        self.loadRun = loadRun
        self.onBack = onBack
        self.milestoneTimeline = milestoneTimeline
        self.milestoneError = milestoneError
        self.onLoadMilestones = onLoadMilestones
        self.onUpsertMilestone = onUpsertMilestone
    }

    private var attemptsNewestFirst: [AttemptListItem] {
        project.attempts.sorted { $0.attempt.updatedAt.rawValue > $1.attempt.updatedAt.rawValue }
    }

    /// The attempt the "latest run" panel shows: a selected/most-recent item from `project.attempts`
    /// (phase-1 portfolio path), or — when that list is empty but `studio.snapshot` named one —
    /// the latest attempt it knows about. Either way, checks are read the same way: `attempt.events`.
    private var currentAttempt: AttemptID? {
        if let selectedAttempt { return selectedAttempt }
        if let item = attemptsNewestFirst.first { return item.attempt.attemptId }
        return project.studio?.latestAttemptSummary?.attemptId
    }

    private var openAttempts: [AttemptListItem] {
        attemptsNewestFirst.filter { !$0.attempt.state.isTerminal }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                header
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    LifecycleTrack(steps: project.lifecycle)
                        .padding(.vertical, HUDTheme.space.xs)
                        .hudPanel("lifecycle")
                        .frame(maxWidth: .infinity)
                    gatesPanel
                        .frame(width: 260)
                }
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    latestRun
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                        milestonesPanel
                        openWork
                    }
                    .frame(width: 320, alignment: .topLeading)
                }
            }
            .padding(HUDTheme.space.l)
        }
        .task(id: currentAttempt) {
            guard let id = currentAttempt, runs[id] == nil else { return }
            await loadRun?(id)
        }
        .task(id: project.projectId) {
            guard onLoadMilestones != nil else { return }
            await onLoadMilestones?()
        }
        .sheet(isPresented: $showingMilestoneEditor) {
            if let projectId = project.projectId, let onUpsertMilestone {
                MilestoneEditorView(projectId: projectId, existing: editingMilestone,
                                    onSave: onUpsertMilestone,
                                    onDone: { _ in showingMilestoneEditor = false; editingMilestone = nil })
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            HStack(alignment: .firstTextBaseline, spacing: HUDTheme.space.s) {
                if let onBack {
                    HUDButton("Dashboard", systemImage: "chevron.left", variant: .ghost, compact: true, action: onBack)
                }
                Text(project.name).font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
                Text(project.slug).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(project.provenance)
                Spacer()
                if let live = project.live { healthPill(live) }
            }
            HStack(alignment: .top, spacing: HUDTheme.space.l) {
                HUDReadout("daemon stage", value: project.effectiveLifecycleStage?.rawValue ?? (project.isKnownToDaemon ? "no stage" : nil))
                if let live = project.live {
                    HUDReadout("attempts", value: "\(live.attemptCount)")
                    HUDReadout("active", value: "\(live.activeAttemptCount)")
                    HUDReadout("blockers", value: "\(live.blockerCount)", role: live.blockerCount > 0 ? .human : nil)
                    HUDReadout("last activity", value: live.lastActivityAt?.rawValue)
                    HUDReadout("open prs", value: live.openPullRequestCount.map { "\($0)" })
                    HUDReadout("jira todo", value: live.jiraTodoCount.map { "\($0)" })
                } else if let studio = project.studio {
                    // studio.snapshot carries no attempt/active counts — an honest "—", not a portfolio number.
                    HUDReadout("attempts", value: nil)
                    HUDReadout("awaiting you", value: "\(studio.awaitingHuman.count)",
                               role: studio.awaitingHuman.isEmpty ? nil : .human)
                    HUDReadout("latest attempt", value: studio.latestAttemptSummary.map { "\($0.state.rawValue)" })
                    HUDReadout("updated", value: studio.latestAttemptSummary?.updatedAt.rawValue)
                }
                Spacer()
            }
            if let note = project.timeline.note {
                HStack(spacing: HUDTheme.space.xxs) {
                    Text(note).font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
                    ProvenanceBadge(project.timeline.provenance, compact: true)
                }
            }
            if !project.isKnownToDaemon {
                Text(isConnected ? "The daemon has no record of this project; live readouts are “—”."
                                 : "Daemon offline; live readouts are “—”.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
        }
    }

    // MARK: Gates

    @ViewBuilder
    private var gatesPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if let gates = project.studio?.gates {
                if gates.state == .unavailable {
                    HStack(spacing: HUDTheme.space.xs) {
                        DiamondShape().stroke(HUDTheme.alert, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                            .frame(width: 12, height: 12).frame(width: 20, height: 20)
                        Text("won't guess").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                    if let reason = gates.unavailableReason {
                        Text(reason).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute).fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                        if gates.ownerIsHuman {
                            DiamondGate(state: (gates.state == .satisfied || gates.state == .waived) ? .cleared : .waiting,
                                       size: 11, label: gates.typed?.rawValue).frame(width: 22, height: 22)
                        } else {
                            StatusPill(gates.state == .satisfied || gates.state == .waived ? .succeeded : .queued,
                                      label: gates.state.rawValue)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(gates.typed?.rawValue ?? "gate").font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                            Text("\(gates.state.rawValue) · owner \(gates.owner?.rawValue ?? "—")").font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                        }
                    }
                }
                ProvenanceBadge(.live("studio.snapshot"), compact: true)
            } else {
                Text("gates arrive with the studio service").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                ProvenanceBadge(.notYetSourced, compact: true)
            }
        }
        .hudPanel("gates", role: (project.studio?.gates.state == .pending || project.studio?.gates.state == .blocked) && (project.studio?.gates.ownerIsHuman ?? false) ? .human : .machine)
    }

    // MARK: Milestones

    @ViewBuilder
    private var milestonesPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack {
                if let timeline = milestoneTimeline {
                    ProvenanceBadge(.live("project.milestones.list"), compact: true)
                    Text("\(timeline.milestones.count)").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.soft)
                } else if let milestoneError {
                    Text(milestoneError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                } else if onLoadMilestones != nil {
                    ProgressView().controlSize(.small)
                } else {
                    ProvenanceBadge(.notYetSourced, compact: true)
                }
                Spacer()
                if project.projectId != nil, onUpsertMilestone != nil {
                    HUDButton("Add", systemImage: "plus", variant: .ghost, compact: true) {
                        editingMilestone = nil
                        showingMilestoneEditor = true
                    }
                }
            }
            if let timeline = milestoneTimeline {
                if timeline.milestones.isEmpty {
                    Text("won't guess — no milestones recorded for this project yet").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                }
                ForEach(timeline.milestones) { milestone in
                    Button {
                        editingMilestone = milestone
                        showingMilestoneEditor = true
                    } label: {
                        HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(milestone.label).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                                Text("\(milestone.phase.rawValue) · \(milestone.kind.rawValue) · \(milestone.status.rawValue)")
                                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                                Text(milestone.targetDate?.rawValue ?? "won't guess")
                                    .font(HUDTypography.caption)
                                    .foregroundStyle(milestone.targetDate == nil ? HUDTheme.alert : HUDTheme.mute)
                            }
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .hudPanel("milestones")
    }

    private func healthPill(_ live: PortfolioProject) -> some View {
        let kind: HUDStatusKind
        switch live.health {
        case .healthy: kind = .succeeded
        case .attention: kind = .paused
        case .blocked: kind = .blocked
        case .unknown: kind = .unknown
        }
        return StatusPill(kind, label: "health \(live.health.rawValue)")
    }

    // MARK: Latest run

    private var currentAttemptItem: AttemptListItem? {
        guard let id = currentAttempt else { return nil }
        return project.attempts.first { $0.attempt.attemptId == id }
    }

    @ViewBuilder
    private var latestRun: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            if !project.attempts.isEmpty {
                attemptPicker
                if let item = currentAttemptItem { attemptSummary(item) }
                if let id = currentAttempt { checksList(for: id) }
            } else if let summary = project.studio?.latestAttemptSummary {
                studioAttemptSummary(summary)
                checksList(for: summary.attemptId)
            } else {
                Text(isConnected ? "no attempts for this project in the daemon" : "daemon offline — no run data")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
        }
        .hudPanel("latest run")
    }

    private var attemptPicker: some View {
        HStack(spacing: HUDTheme.space.s) {
            HUDLabel("attempt")
            Picker("Attempt", selection: Binding(
                get: { currentAttempt?.rawValue ?? "" },
                set: { raw in selectedAttempt = try? AttemptID(raw) }
            )) {
                ForEach(attemptsNewestFirst) { item in
                    Text("\(item.title) · \(item.attempt.state.rawValue) · \(item.attempt.updatedAt.rawValue)")
                        .tag(item.attempt.attemptId.rawValue)
                }
            }
            .labelsHidden()
            .frame(maxWidth: 480)
            Spacer()
        }
    }

    /// The latest-run summary when the source is `studio.snapshot` (one attempt, not a full record).
    private func studioAttemptSummary(_ summary: StudioAttemptSummary) -> some View {
        HStack(spacing: HUDTheme.space.m) {
            StatusPill(summary.state.pillKind)
            HUDReadout("attempt id", value: String(summary.attemptId.rawValue.prefix(8)))
            HUDReadout("updated", value: summary.updatedAt.rawValue)
            if let blocker = summary.blocker {
                HUDReadout("blocker", value: blocker.summary, role: .human)
            }
            Spacer()
        }
    }

    private func attemptSummary(_ item: AttemptListItem) -> some View {
        HStack(spacing: HUDTheme.space.m) {
            StatusPill(item.attempt.state.pillKind)
            HUDReadout("attempt id", value: String(item.attempt.attemptId.rawValue.prefix(8)))
            HUDReadout("no.", value: "\(item.attempt.attemptNumber)")
            HUDReadout("created", value: item.attempt.createdAt.rawValue)
            HUDReadout("terminal", value: item.attempt.terminalAt?.rawValue)
            if let blocker = item.attempt.blocker {
                HUDReadout("blocker", value: blocker.summary, role: .human)
            }
            Spacer()
        }
    }

    @ViewBuilder
    private func checksList(for attemptId: AttemptID) -> some View {
        if let detail = runs[attemptId] {
            let checks = detail.checks
            VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
                HStack {
                    HUDLabel("checks")
                    Text("\(checks.count)").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.soft)
                    Spacer()
                    ProvenanceBadge(.live("attempt.events"), compact: true)
                    if detail.verify != nil { ProvenanceBadge(.live("evidence.verify"), compact: true) }
                }
                if checks.isEmpty {
                    Text("no checks recorded for this attempt").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                }
                ForEach(checks) { check in
                    HStack(spacing: HUDTheme.space.s) {
                        StatusPill(check.state.pill)
                            .frame(width: 130, alignment: .leading)
                        Text(check.label).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.ink).lineLimit(1)
                        Spacer()
                        if let d = check.detail {
                            Text(d).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.soft).lineLimit(1)
                        }
                        Text(check.at?.rawValue ?? "—").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute).lineLimit(1)
                    }
                    .padding(.vertical, 2)
                    .accessibilityElement(children: .combine)
                }
                if let note = detail.evidenceNote {
                    Text("evidence: \(note)").font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let verify = detail.verify {
                    Text("evidence manifest \(String(verify.manifest.manifestDigest.rawValue.dropFirst(7).prefix(12))) · \(verify.artifactCount) artifacts · integrity \(verify.integrityVerified ? "verified" : "FAILED")")
                        .font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                }
            }
        } else {
            HStack(spacing: HUDTheme.space.xs) {
                if isConnected { ProgressView().controlSize(.small) }
                Text(isConnected ? "loading attempt.events…" : "daemon offline — checks unavailable")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
        }
    }

    // MARK: Open work

    private var openWork: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if openAttempts.isEmpty, project.timeline.waitingGates.isEmpty, upcomingPlans.isEmpty {
                Text("no open work on record").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
            ForEach(openAttempts) { item in
                HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                    StatusPill(item.attempt.state.pillKind)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(2)
                        if let blocker = item.attempt.blocker {
                            Text(blocker.summary).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft).lineLimit(2)
                        }
                        ProvenanceBadge(.live("attempt.list"), compact: true)
                    }
                }
            }
            ForEach(project.timeline.waitingGates) { gate in
                HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                    DiamondGate(state: .waiting, size: 9, label: gate.label).frame(width: 20, height: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(gate.label).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                        Text("◆ \(gate.start.shortLabel) · waiting on you").font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                        ProvenanceBadge(gate.provenance, compact: true)
                    }
                }
            }
            ForEach(upcomingPlans) { bar in
                HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                    LegendSwatch(kind: bar.kind).frame(width: 18, height: 10).padding(.top, 4)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(bar.label).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                        Text("\(bar.kind.word) · \(bar.start.shortLabel)\(bar.end.map { " – \($0.shortLabel)" } ?? "")")
                            .font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                        ProvenanceBadge(bar.provenance, compact: true)
                    }
                }
            }
        }
        .hudPanel("open work", role: (openAttempts.contains { $0.attempt.state == .blocked } || !project.timeline.waitingGates.isEmpty) ? .human : .machine)
    }

    private var upcomingPlans: [TimelineBar] {
        project.timeline.bars.filter { $0.kind == .plan || $0.kind == .unknown }
    }
}

extension AttemptState {
    public var pillKind: HUDStatusKind {
        switch self {
        case .queued: return .queued
        case .running: return .running
        case .paused: return .paused
        case .blocked: return .blocked
        case .succeeded: return .succeeded
        case .failed: return .failed
        case .cancelled: return .cancelled
        }
    }
}

#Preview("Project detail — fixture only") {
    let fixture = try! TimelineFixture.loadBundled()
    let project = DashboardProject(slug: "hindsight", name: "Hindsight", timeline: fixture.projects[1], live: nil, attempts: [])
    return ProjectDetailView(project: project, isConnected: false, onBack: {})
        .frame(width: 1000, height: 640)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
