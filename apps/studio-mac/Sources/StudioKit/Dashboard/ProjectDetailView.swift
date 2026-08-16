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

    @State private var selectedAttempt: AttemptID?

    public init(project: DashboardProject, runs: [AttemptID: RunDetail] = [:], isConnected: Bool = false,
                loadRun: ((AttemptID) async -> Void)? = nil, onBack: (() -> Void)? = nil) {
        self.project = project
        self.runs = runs
        self.isConnected = isConnected
        self.loadRun = loadRun
        self.onBack = onBack
    }

    private var attemptsNewestFirst: [AttemptListItem] {
        project.attempts.sorted { $0.attempt.updatedAt.rawValue > $1.attempt.updatedAt.rawValue }
    }

    private var currentAttempt: AttemptListItem? {
        if let selectedAttempt, let item = project.attempts.first(where: { $0.attempt.attemptId == selectedAttempt }) { return item }
        return attemptsNewestFirst.first
    }

    private var openAttempts: [AttemptListItem] {
        attemptsNewestFirst.filter { !$0.attempt.state.isTerminal }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                header
                LifecycleTrack(steps: project.lifecycle)
                    .padding(.vertical, HUDTheme.space.xs)
                    .hudPanel("lifecycle")
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    latestRun
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    openWork
                        .frame(width: 320, alignment: .topLeading)
                }
            }
            .padding(HUDTheme.space.l)
        }
        .task(id: currentAttempt?.attempt.attemptId) {
            guard let id = currentAttempt?.attempt.attemptId, runs[id] == nil else { return }
            await loadRun?(id)
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
                HUDReadout("daemon stage", value: project.live?.lifecycleStage?.rawValue ?? (project.live == nil ? nil : "no stage"))
                HUDReadout("attempts", value: project.live.map { "\($0.attemptCount)" })
                HUDReadout("active", value: project.live.map { "\($0.activeAttemptCount)" })
                HUDReadout("blockers", value: project.live.map { "\($0.blockerCount)" },
                           role: (project.live?.blockerCount ?? 0) > 0 ? .human : nil)
                HUDReadout("last activity", value: project.live?.lastActivityAt?.rawValue)
                HUDReadout("open prs", value: project.live?.openPullRequestCount.map { "\($0)" })
                HUDReadout("jira todo", value: project.live?.jiraTodoCount.map { "\($0)" })
                Spacer()
            }
            if let note = project.timeline.note {
                HStack(spacing: HUDTheme.space.xxs) {
                    Text(note).font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
                    ProvenanceBadge(project.timeline.provenance, compact: true)
                }
            }
            if project.live == nil {
                Text(isConnected ? "The daemon has no record of this project; live readouts are “—”."
                                 : "Daemon offline; live readouts are “—”.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
        }
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

    @ViewBuilder
    private var latestRun: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            if project.attempts.isEmpty {
                Text(isConnected ? "no attempts for this project in the daemon" : "daemon offline — no run data")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            } else {
                attemptPicker
                if let item = currentAttempt {
                    attemptSummary(item)
                    checksList(for: item.attempt.attemptId)
                }
            }
        }
        .hudPanel("latest run")
    }

    private var attemptPicker: some View {
        HStack(spacing: HUDTheme.space.s) {
            HUDLabel("attempt")
            Picker("Attempt", selection: Binding(
                get: { currentAttempt?.attempt.attemptId.rawValue ?? "" },
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
