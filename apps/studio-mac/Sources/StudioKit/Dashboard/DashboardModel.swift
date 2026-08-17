import Foundation

// MARK: - Dashboard derivations
//
// Pure functions from what the daemon said (plus the bundled timeline fixture) to what the dashboard
// draws. Nothing here talks to the wire; `StudioStore` fetches and hands the results in as
// `DashboardInputs`. Every output carries a `Provenance`, and a value the machine cannot source is
// `nil` — the instruments render that as "—".

/// Everything the dashboard is derived from. `nil` collections mean "not loaded" (offline or in
/// flight), which is different from "loaded and empty".
public struct DashboardInputs: Sendable {
    public var doctor: DoctorResult?
    public var portfolio: PortfolioReadModel?
    public var attempts: [AttemptListItem]?
    public var evidence: [EvidenceManifestDescriptor]?
    public var timeline: TimelineFixture?
    /// `studio.snapshot`, when the daemon supports it (`StudioStore` feature-detects this — see
    /// `DaemonClientError.isUnsupportedOperation`). When present, `DashboardDerivation` sources
    /// gauges/awaiting/timeline/gates from it instead of `portfolio` + `attempts` + `evidence`; when
    /// `nil`, every derivation is byte-identical to phase 1.
    public var studioSnapshot: StudioSnapshot?
    public var now: Date

    public init(doctor: DoctorResult? = nil, portfolio: PortfolioReadModel? = nil, attempts: [AttemptListItem]? = nil,
                evidence: [EvidenceManifestDescriptor]? = nil, timeline: TimelineFixture? = nil,
                studioSnapshot: StudioSnapshot? = nil, now: Date = Date()) {
        self.doctor = doctor
        self.portfolio = portfolio
        self.attempts = attempts
        self.evidence = evidence
        self.timeline = timeline
        self.studioSnapshot = studioSnapshot
        self.now = now
    }

    public var today: DayStamp { DayStamp(now) }
}

// MARK: Gauges

public struct GaugeReading: Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    /// Centre readout. `nil` renders "—".
    public var readout: String?
    /// Arc fraction 0…1. `nil` draws no arc.
    public var fraction: Double?
    /// Small caption inside the ring.
    public var caption: String?
    public var role: HUDRole
    public var provenance: Provenance

    public init(id: String, label: String, readout: String?, fraction: Double?, caption: String?,
                role: HUDRole = .machine, provenance: Provenance) {
        self.id = id
        self.label = label
        self.readout = readout
        self.fraction = fraction
        self.caption = caption
        self.role = role
        self.provenance = provenance
    }
}

/// The reticle's one number: how far the portfolio is toward release.
public struct ReticleReading: Hashable, Sendable {
    public var fraction: Double?
    public var caption: String?
    public var provenance: Provenance

    public init(fraction: Double?, caption: String?, provenance: Provenance) {
        self.fraction = fraction
        self.caption = caption
        self.provenance = provenance
    }

    public var readout: String {
        guard let fraction else { return "—" }
        return "\(Int((min(max(fraction, 0), 1) * 100).rounded()))%"
    }
}

/// One line in "Awaiting you".
public struct AwaitingItem: Hashable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var detail: String?
    /// The project slug when known (opens the project detail).
    public var slug: String?
    public var attemptId: AttemptID?
    public var provenance: Provenance

    public init(id: String, title: String, detail: String?, slug: String?, attemptId: AttemptID?, provenance: Provenance) {
        self.id = id
        self.title = title
        self.detail = detail
        self.slug = slug
        self.attemptId = attemptId
        self.provenance = provenance
    }
}

/// What `studio.snapshot` knows about one project — a narrower read than `PortfolioProject` (no
/// attempt/active counts, no health). Populated only when the dashboard's data source is
/// `studio.snapshot`.
public struct StudioProjectInfo: Hashable, Sendable {
    public var projectId: ProjectID
    public var slug: StableKey
    public var lifecycleStage: ProjectLifecycleStage?
    public var gates: StudioProjectGates
    public var latestAttemptSummary: StudioAttemptSummary?
    public var awaitingHuman: [StudioAwaitingHumanItem]

    public init(projectId: ProjectID, slug: StableKey, lifecycleStage: ProjectLifecycleStage?, gates: StudioProjectGates,
                latestAttemptSummary: StudioAttemptSummary?, awaitingHuman: [StudioAwaitingHumanItem]) {
        self.projectId = projectId
        self.slug = slug
        self.lifecycleStage = lifecycleStage
        self.gates = gates
        self.latestAttemptSummary = latestAttemptSummary
        self.awaitingHuman = awaitingHuman
    }
}

/// A project as the dashboard sees it: the fixture row (if any) merged with what the daemon knows.
public struct DashboardProject: Hashable, Sendable, Identifiable {
    public var slug: String
    public var name: String
    /// The row drawn on the timeline — fixture bars overlaid with live attempt marks, or a live-only row.
    public var timeline: ProjectTimeline
    /// The daemon's `portfolio.snapshot` project record, when that is the dashboard's data source.
    public var live: PortfolioProject?
    /// Live attempts for this project (empty when the daemon does not know it, or in studio mode).
    public var attempts: [AttemptListItem]
    /// The daemon's `studio.snapshot` project record, when that is the dashboard's data source.
    public var studio: StudioProjectInfo?

    public var id: String { slug }
    public var lifecycle: [LifecycleStep] { timeline.lifecycle }

    /// True once either data source has heard of this project.
    public var isKnownToDaemon: Bool { live != nil || studio != nil }

    /// Attempt count for the ring caption: the daemon's number when it has one. `studio.snapshot`
    /// carries only the latest attempt, not a count, so this stays an honest "—" in studio mode.
    public var runs: Sourced<Int> {
        if let live { return Sourced(live.attemptCount, .live("portfolio.snapshot")) }
        return Sourced(nil, .notYetSourced)
    }

    /// The lifecycle stage from whichever source is live.
    public var effectiveLifecycleStage: ProjectLifecycleStage? { live?.lifecycleStage ?? studio?.lifecycleStage }

    /// The daemon's project id, from whichever source is live — the key `project.milestones.list` /
    /// `.upsert` and `attempt.events` take.
    public var projectId: ProjectID? { live?.projectId ?? studio?.projectId }

    /// Fixture-only, live-only, or both (the row's provenance already says which).
    public var provenance: Provenance { timeline.provenance }
}

/// The whole derived dashboard.
public struct DashboardSnapshot: Hashable, Sendable {
    public var today: DayStamp
    public var window: TimelineWindow
    public var gauges: [GaugeReading]
    public var reticle: ReticleReading
    public var awaiting: [AwaitingItem]
    public var projects: [DashboardProject]

    public var rows: [ProjectTimeline] { projects.map(\.timeline) }
    public func project(slug: String) -> DashboardProject? { projects.first { $0.slug == slug } }
}

// MARK: - Derivation

public enum DashboardDerivation {

    /// The default window when no fixture is loaded: 45 days back, 45 days forward.
    public static func fallbackWindow(today: DayStamp) -> TimelineWindow {
        TimelineWindow(start: today.adding(days: -45), end: today.adding(days: 45))
    }

    public static func snapshot(_ input: DashboardInputs) -> DashboardSnapshot {
        let projects = projects(input)
        return DashboardSnapshot(
            today: input.today,
            window: input.timeline?.window ?? fallbackWindow(today: input.today),
            gauges: gauges(input),
            reticle: reticle(input),
            awaiting: awaiting(input, projects: projects),
            projects: projects)
    }

    // MARK: Gauges

    public static let gaugeOrder = ["projects", "verified-week", "awaiting-you", "min-per-release", "agent-window"]
    /// Gauge order when the dashboard's source is `studio.snapshot`: one gauge per
    /// `StudioPortfolioAggregates` field (each independently live or not-yet-sourced per its own
    /// `unavailableReason`), plus a live `projects` count `studio.snapshot` always knows.
    public static let studioGaugeOrder = ["projects", "verified-week", "awaiting-you", "pass-rate", "median-run", "agent-window"]

    public static func gauges(_ input: DashboardInputs) -> [GaugeReading] {
        if let snapshot = input.studioSnapshot { return studioGauges(snapshot) }
        return [projectsGauge(input), verifiedThisWeek(input), awaitingYouGauge(input), minutesPerRelease(input), agentWindow(input)]
    }

    static func studioGauges(_ snapshot: StudioSnapshot) -> [GaugeReading] {
        let total = snapshot.projects.count
        let active = snapshot.projects.filter { !( $0.latestAttemptSummary?.state.isTerminal ?? true) }.count
        let projects = GaugeReading(id: "projects", label: "projects", readout: "\(total)",
                                    fraction: total > 0 ? Double(active) / Double(total) : nil,
                                    caption: "\(active) active", provenance: .live("studio.snapshot"))
        let portfolio = snapshot.portfolio
        return [
            projects,
            countGauge(id: "verified-week", label: "verified · 7d", metric: portfolio.verifiedThisWeek),
            countGauge(id: "awaiting-you", label: "awaiting you", metric: portfolio.awaitingYouCount, role: .human),
            ratioGauge(id: "pass-rate", label: "pass rate", metric: portfolio.passRate),
            durationGauge(id: "median-run", label: "median run", metric: portfolio.medianRunSeconds),
            ratioGauge(id: "agent-window", label: "agent window", metric: portfolio.agentWindowShare),
        ]
    }

    static func countGauge(id: String, label: String, metric: StudioCountMetric, role: HUDRole = .machine) -> GaugeReading {
        guard let value = metric.value else {
            return GaugeReading(id: id, label: label, readout: nil, fraction: nil, caption: nil, role: role, provenance: .notYetSourced)
        }
        return GaugeReading(id: id, label: label, readout: "\(value)", fraction: nil, caption: nil, role: role,
                            provenance: .live("studio.snapshot"))
    }

    static func ratioGauge(id: String, label: String, metric: StudioRatioMetric, role: HUDRole = .machine) -> GaugeReading {
        guard let value = metric.value else {
            return GaugeReading(id: id, label: label, readout: nil, fraction: nil, caption: nil, role: role, provenance: .notYetSourced)
        }
        let clamped = min(max(value, 0), 1)
        return GaugeReading(id: id, label: label, readout: "\(Int((clamped * 100).rounded()))%", fraction: clamped,
                            caption: nil, role: role, provenance: .live("studio.snapshot"))
    }

    static func durationGauge(id: String, label: String, metric: StudioDurationSecondsMetric, role: HUDRole = .machine) -> GaugeReading {
        guard let value = metric.value else {
            return GaugeReading(id: id, label: label, readout: nil, fraction: nil, caption: nil, role: role, provenance: .notYetSourced)
        }
        let seconds = Int(value.rounded())
        let readout = seconds >= 60 ? "\(seconds / 60)m\(seconds % 60)s" : "\(seconds)s"
        return GaugeReading(id: id, label: label, readout: readout, fraction: nil, caption: nil, role: role,
                            provenance: .live("studio.snapshot"))
    }

    static func projectsGauge(_ input: DashboardInputs) -> GaugeReading {
        guard let portfolio = input.portfolio else {
            return GaugeReading(id: "projects", label: "projects", readout: nil, fraction: nil,
                                caption: input.doctor == nil ? "offline" : "loading",
                                provenance: .live("portfolio.snapshot"))
        }
        let total = portfolio.totals.projects
        let active = portfolio.projects.filter { $0.activeAttemptCount > 0 }.count
        return GaugeReading(id: "projects", label: "projects", readout: "\(total)",
                            fraction: total > 0 ? Double(active) / Double(total) : nil,
                            caption: "\(active) active", provenance: .live("portfolio.snapshot"))
    }

    /// Succeeded attempts that reached terminal in the last 7 days. When evidence.list is loaded, only
    /// attempts with an evidence manifest count as verified — a succeeded state without evidence is not
    /// a verification the machine can show.
    static func verifiedThisWeek(_ input: DashboardInputs) -> GaugeReading {
        guard let attempts = input.attempts else {
            return GaugeReading(id: "verified-week", label: "verified · 7d", readout: nil, fraction: nil,
                                caption: input.doctor == nil ? "offline" : "loading",
                                provenance: .derived("attempt.list · 7d"))
        }
        let since = input.now.addingTimeInterval(-7 * 24 * 3600)
        let terminal = attempts.filter { item in
            guard let at = item.attempt.terminalAt?.date else { return false }
            return at >= since && at <= input.now
        }
        let evidenced: Set<AttemptID>? = input.evidence.map { Set($0.map(\.attemptId)) }
        let verified = terminal.filter { item in
            guard item.attempt.state == .succeeded else { return false }
            if let evidenced { return evidenced.contains(item.attempt.attemptId) }
            return true
        }
        let note = evidenced == nil ? "attempt.list · 7d" : "attempt.list ∩ evidence.list · 7d"
        return GaugeReading(id: "verified-week", label: "verified · 7d", readout: "\(verified.count)",
                            fraction: terminal.isEmpty ? nil : Double(verified.count) / Double(terminal.count),
                            caption: "of \(terminal.count) runs", provenance: .derived(note))
    }

    /// The only gold gauge: how many things wait on the human. The number is the daemon's blocker
    /// count; fixture gates are named in the caption, never folded into the number.
    static func awaitingYouGauge(_ input: DashboardInputs) -> GaugeReading {
        let fixtureGates = input.timeline?.projects.flatMap(\.waitingGates).count ?? 0
        let caption = fixtureGates > 0 ? "+\(fixtureGates) fixture ◆" : nil
        if let portfolio = input.portfolio {
            let blockers = portfolio.totals.blockers
            let blockedProjects = portfolio.projects.filter { $0.blockerCount > 0 }.count
            let total = portfolio.totals.projects
            return GaugeReading(id: "awaiting-you", label: "awaiting you", readout: "\(blockers)",
                                fraction: total > 0 ? Double(blockedProjects) / Double(total) : nil,
                                caption: caption, role: .human, provenance: .live("portfolio.snapshot"))
        }
        if let attempts = input.attempts {
            let blocked = attempts.filter { $0.attempt.state == .blocked }.count
            return GaugeReading(id: "awaiting-you", label: "awaiting you", readout: "\(blocked)",
                                fraction: nil, caption: caption, role: .human, provenance: .derived("attempt.list · blocked"))
        }
        return GaugeReading(id: "awaiting-you", label: "awaiting you", readout: nil, fraction: nil,
                            caption: caption ?? (input.doctor == nil ? "offline" : "loading"),
                            role: .human, provenance: .live("portfolio.snapshot"))
    }

    /// Minutes per trusted release needs the release rail (phase 6). Honest "—".
    static func minutesPerRelease(_ input: DashboardInputs) -> GaugeReading {
        GaugeReading(id: "min-per-release", label: "min / release", readout: nil, fraction: nil,
                     caption: nil, provenance: .notYetSourced)
    }

    /// Provider usage window needs provider telemetry the daemon does not expose yet. Honest "—".
    static func agentWindow(_ input: DashboardInputs) -> GaugeReading {
        GaugeReading(id: "agent-window", label: "agent window", readout: nil, fraction: nil,
                     caption: nil, provenance: .notYetSourced)
    }

    // MARK: Reticle

    /// Progress of a daemon lifecycle stage toward `live` (0…1). `frozen` makes no claim.
    static func stageProgress(_ stage: ProjectLifecycleStage) -> Double? {
        switch stage {
        case .idea: return 0
        case .building: return 0.4
        case .qa: return 0.6
        case .launchPrep: return 0.8
        case .live: return 1
        case .frozen: return nil
        }
    }

    /// Live when the daemon reports lifecycle stages; else the fixture's lifecycle tracks; else "—".
    public static func reticle(_ input: DashboardInputs) -> ReticleReading {
        if let snapshot = input.studioSnapshot {
            let staged = snapshot.projects.compactMap { $0.lifecycleStage.flatMap(stageProgress) }
            if !staged.isEmpty {
                return ReticleReading(fraction: staged.reduce(0, +) / Double(staged.count),
                                      caption: "\(staged.count) of \(snapshot.projects.count) projects staged",
                                      provenance: .live("studio.snapshot"))
            }
        }
        if let portfolio = input.portfolio {
            let staged = portfolio.projects.compactMap { $0.lifecycleStage.flatMap(stageProgress) }
            if !staged.isEmpty {
                return ReticleReading(fraction: staged.reduce(0, +) / Double(staged.count),
                                      caption: "\(staged.count) of \(portfolio.projects.count) projects staged",
                                      provenance: .live("portfolio.snapshot"))
            }
        }
        if let timeline = input.timeline, !timeline.projects.isEmpty {
            let fractions = timeline.projects.map { Double($0.doneCount) / Double(max(1, $0.lifecycle.count)) }
            return ReticleReading(fraction: fractions.reduce(0, +) / Double(fractions.count),
                                  caption: "\(timeline.projects.count) projects · fixture",
                                  provenance: .fixture(TimelineFixture.provenanceNote))
        }
        return ReticleReading(fraction: nil, caption: input.portfolio == nil ? "offline" : "no lifecycle data",
                              provenance: .notYetSourced)
    }

    // MARK: Awaiting you

    public static func awaiting(_ input: DashboardInputs, projects: [DashboardProject]) -> [AwaitingItem] {
        var items: [AwaitingItem] = []
        if let snapshot = input.studioSnapshot {
            for project in snapshot.projects {
                let slug = project.slug.rawValue
                for awaiting in project.awaitingHuman {
                    items.append(AwaitingItem(id: "studio.\(awaiting.id)", title: "\(project.name) · \(awaiting.summary)",
                                              detail: "since \(awaiting.since.rawValue)", slug: slug,
                                              attemptId: awaiting.attemptId, provenance: .live("studio.snapshot")))
                }
            }
        } else {
            let slugByProject: [ProjectID: String] = Dictionary(
                uniqueKeysWithValues: (input.portfolio?.projects ?? []).map { ($0.projectId, $0.slug.rawValue) })
            for item in input.attempts ?? [] where item.attempt.state == .blocked {
                let blocker = item.attempt.blocker
                let detail = [blocker?.summary, blocker?.requiredAction].compactMap { $0 }.joined(separator: " — ")
                items.append(AwaitingItem(id: "live.\(item.attempt.attemptId.rawValue)", title: item.title,
                                          detail: detail.isEmpty ? blocker?.kind.rawValue : detail,
                                          slug: slugByProject[item.projectId], attemptId: item.attempt.attemptId,
                                          provenance: .live("attempt.list")))
            }
        }
        for row in input.timeline?.projects ?? [] {
            for gate in row.waitingGates {
                items.append(AwaitingItem(id: "fixture.\(gate.id)", title: "\(row.name) · \(gate.label)",
                                          detail: "◆ \(gate.start.shortLabel)", slug: row.slug, attemptId: nil,
                                          provenance: gate.provenance))
            }
        }
        return items
    }

    // MARK: Projects + timeline rows

    /// Fixture projects first (in fixture order), then daemon projects the fixture does not know.
    public static func projects(_ input: DashboardInputs) -> [DashboardProject] {
        if let snapshot = input.studioSnapshot {
            return studioProjects(snapshot, timeline: input.timeline, today: input.today)
        }
        let today = input.today
        let liveBySlug: [String: PortfolioProject] = Dictionary(
            (input.portfolio?.projects ?? []).map { ($0.slug.rawValue, $0) }, uniquingKeysWith: { a, _ in a })
        var attemptsByProject: [ProjectID: [AttemptListItem]] = [:]
        for item in input.attempts ?? [] { attemptsByProject[item.projectId, default: []].append(item) }

        var result: [DashboardProject] = []
        var seen = Set<String>()
        for row in input.timeline?.projects ?? [] {
            let live = liveBySlug[row.slug]
            let attempts = live.map { attemptsByProject[$0.projectId] ?? [] } ?? []
            var timeline = row
            if live != nil, case .fixture(let name) = row.provenance {
                timeline.provenance = .fixture("\(name) + live")
            }
            timeline.bars += attemptBars(attempts, slug: row.slug, today: today)
            result.append(DashboardProject(slug: row.slug, name: row.name, timeline: timeline, live: live, attempts: attempts))
            seen.insert(row.slug)
        }
        let extras = (input.portfolio?.projects ?? [])
            .filter { !seen.contains($0.slug.rawValue) }
            .sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        for project in extras {
            let attempts = attemptsByProject[project.projectId] ?? []
            let timeline = liveOnlyRow(project, attempts: attempts, today: today,
                                       window: input.timeline?.window ?? fallbackWindow(today: today))
            result.append(DashboardProject(slug: project.slug.rawValue, name: project.displayName,
                                           timeline: timeline, live: project, attempts: attempts))
        }
        return result
    }

    /// Live attempts drawn as marks: succeeded → done, in flight → live, blocked → ◆ waiting. Failed
    /// and cancelled attempts have no bar kind in the prototype vocabulary and are not drawn.
    static func attemptBars(_ attempts: [AttemptListItem], slug: String, today: DayStamp) -> [TimelineBar] {
        attempts.compactMap { item -> TimelineBar? in
            let attempt = item.attempt
            guard let created = attempt.createdAt.date else { return nil }
            let start = DayStamp(created)
            let id = "live.\(slug).\(attempt.attemptId.rawValue)"
            let provenance = Provenance.live("attempt.list")
            switch attempt.state {
            case .succeeded:
                let end = attempt.terminalAt?.date.map(DayStamp.init) ?? start
                return TimelineBar(id: id, kind: .done, label: item.title, start: start, end: max(start, end), provenance: provenance)
            case .running, .queued, .paused:
                return TimelineBar(id: id, kind: .live, label: item.title, start: start, end: nil, provenance: provenance)
            case .blocked:
                let at = attempt.updatedAt.date.map(DayStamp.init) ?? start
                return TimelineBar(id: id, kind: .gate, label: item.title, start: at, end: nil, gateState: .waiting, provenance: provenance)
            case .failed, .cancelled:
                return nil
            }
        }
    }

    /// A row for a project only the daemon knows: lifecycle from its stage (device smoke is always
    /// "won't guess" — the daemon records no human gate), attempt marks, and a dashed-alert "no
    /// milestones" span from today to the window edge.
    static func liveOnlyRow(_ project: PortfolioProject, attempts: [AttemptListItem], today: DayStamp,
                            window: TimelineWindow) -> ProjectTimeline {
        let slug = project.slug.rawValue
        var bars = attemptBars(attempts, slug: slug, today: today)
        if today < window.end {
            bars.append(TimelineBar(id: "live.\(slug).no-milestones", kind: .unknown, label: "no milestones",
                                    start: today, end: window.end, provenance: .derived("no milestones schema yet")))
        }
        return ProjectTimeline(slug: slug, name: project.displayName, lifecycle: lifecycle(for: project.lifecycleStage),
                               bars: bars, provenance: .live("portfolio.snapshot"),
                               note: project.lifecycleStage.map { "daemon stage: \($0.rawValue)" } ?? "daemon has no lifecycle stage")
    }

    // MARK: studio.snapshot projects + timeline rows

    /// Fixture rows first, overlaid with a matched `studio.snapshot` project's real milestones and
    /// gate (badge flips FIXTURE → FIXTURE + LIVE) by `StudioProject.slug` — the same stable key
    /// `PortfolioProject.slug` merges on, not a slugified display name; then a live-only row for
    /// every `studio.snapshot` project the fixture's slug does not match.
    static func studioProjects(_ snapshot: StudioSnapshot, timeline: TimelineFixture?, today: DayStamp) -> [DashboardProject] {
        let bySlug: [String: StudioProject] = Dictionary(snapshot.projects.map { ($0.slug.rawValue, $0) }, uniquingKeysWith: { a, _ in a })
        var result: [DashboardProject] = []
        var seen = Set<String>()
        for row in timeline?.projects ?? [] {
            guard let project = bySlug[row.slug] else {
                result.append(DashboardProject(slug: row.slug, name: row.name, timeline: row, live: nil, attempts: [], studio: nil))
                continue
            }
            var merged = row
            if case .fixture(let name) = row.provenance { merged.provenance = .fixture("\(name) + live") }
            merged.bars += studioMilestoneBars(project, slug: row.slug)
            if let gate = studioGateBar(project, slug: row.slug, today: today) { merged.bars.append(gate) }
            result.append(DashboardProject(slug: row.slug, name: row.name, timeline: merged, live: nil, attempts: [],
                                           studio: studioInfo(project)))
            seen.insert(row.slug)
        }
        let extras = snapshot.projects
            .filter { !seen.contains($0.slug.rawValue) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        for project in extras {
            let slug = project.slug.rawValue
            let bars = studioMilestoneBars(project, slug: slug) + [studioGateBar(project, slug: slug, today: today)].compactMap { $0 }
            let hasMilestones = !project.timeline.milestones.isEmpty
            let note = project.timeline.milestonesUnavailableReason ?? (hasMilestones ? nil : "no milestones")
            let timeline = ProjectTimeline(slug: slug, name: project.name, lifecycle: lifecycle(for: project.lifecycleStage),
                                           bars: bars, provenance: .live("studio.snapshot"), note: note)
            result.append(DashboardProject(slug: slug, name: project.name, timeline: timeline, live: nil, attempts: [],
                                           studio: studioInfo(project)))
        }
        return result
    }

    static func studioInfo(_ project: StudioProject) -> StudioProjectInfo {
        StudioProjectInfo(projectId: project.projectId, slug: project.slug, lifecycleStage: project.lifecycleStage,
                          gates: project.gates, latestAttemptSummary: project.latestAttemptSummary,
                          awaitingHuman: project.awaitingHuman)
    }

    /// One bar per dated milestone (`targetDate == nil` — "no honest estimate" — draws nothing rather
    /// than a guessed date), status mapped onto the existing bar vocabulary: `.done` → done, `.planned`
    /// / `.active` → planned, `.abandoned` → won't-guess-honest ("didn't land as planned").
    static func studioMilestoneBars(_ project: StudioProject, slug: String) -> [TimelineBar] {
        project.timeline.milestones.enumerated().compactMap { index, milestone -> TimelineBar? in
            guard let day = milestone.targetDate?.dayStamp else { return nil }
            let kind: TimelineBarKind
            switch milestone.status {
            case .done: kind = .done
            case .planned, .active: kind = .plan
            case .abandoned: kind = .unknown
            }
            return TimelineBar(id: "studio.\(slug).\(index)", kind: kind, label: milestone.label, start: day, end: day,
                               provenance: .live("studio.snapshot"))
        }
    }

    /// The project's ◆ gate marker. Diamonds are this design system's human-gate language, so this
    /// draws only when the gate is both real (`state != .unavailable`) and human-owned; a
    /// machine-owned or not-yet-wired gate draws nothing rather than a fabricated claim.
    static func studioGateBar(_ project: StudioProject, slug: String, today: DayStamp) -> TimelineBar? {
        let gates = project.gates
        guard gates.state != .unavailable, gates.ownerIsHuman else { return nil }
        let gateState: TimelineGateState
        switch gates.state {
        case .pending, .blocked: gateState = .waiting
        case .satisfied, .waived: gateState = .cleared
        case .unavailable: return nil
        }
        let label = gates.typed?.rawValue ?? "gate"
        return TimelineBar(id: "studio.\(slug).gate", kind: .gate, label: label, start: today, end: nil,
                           gateState: gateState, provenance: .live("studio.snapshot"))
    }

    /// Daemon stage → the six-step track. Steps before the stage are done, the stage is active, later
    /// steps planned; the device-smoke gate is unknown because the daemon has no record of it.
    public static func lifecycle(for stage: ProjectLifecycleStage?) -> [LifecycleStep] {
        let order: [LifecyclePhase] = LifecyclePhase.allCases
        let activeIndex: Int?
        switch stage {
        case .none, .frozen?: activeIndex = nil
        case .idea?: activeIndex = 0
        case .building?: activeIndex = 1
        case .qa?: activeIndex = 2
        case .launchPrep?: activeIndex = 3
        case .live?: activeIndex = 5
        }
        return order.enumerated().map { index, phase in
            if phase.isHumanGate { return LifecycleStep(phase, .unknown) }
            guard let activeIndex else { return LifecycleStep(phase, .unknown) }
            if index < activeIndex { return LifecycleStep(phase, .done) }
            if index == activeIndex { return LifecycleStep(phase, stage == .live ? .done : .active) }
            return LifecycleStep(phase, .planned)
        }
    }
}
