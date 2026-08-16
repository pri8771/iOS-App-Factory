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
    public var now: Date

    public init(doctor: DoctorResult? = nil, portfolio: PortfolioReadModel? = nil, attempts: [AttemptListItem]? = nil,
                evidence: [EvidenceManifestDescriptor]? = nil, timeline: TimelineFixture? = nil, now: Date = Date()) {
        self.doctor = doctor
        self.portfolio = portfolio
        self.attempts = attempts
        self.evidence = evidence
        self.timeline = timeline
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

/// A project as the dashboard sees it: the fixture row (if any) merged with what the daemon knows.
public struct DashboardProject: Hashable, Sendable, Identifiable {
    public var slug: String
    public var name: String
    /// The row drawn on the timeline — fixture bars overlaid with live attempt marks, or a live-only row.
    public var timeline: ProjectTimeline
    /// The daemon's project record, when the daemon knows this slug.
    public var live: PortfolioProject?
    /// Live attempts for this project (empty when the daemon does not know it).
    public var attempts: [AttemptListItem]

    public var id: String { slug }
    public var lifecycle: [LifecycleStep] { timeline.lifecycle }

    /// Attempt count for the ring caption: the daemon's number when it has one.
    public var runs: Sourced<Int> {
        if let live { return Sourced(live.attemptCount, .live("portfolio.snapshot")) }
        return Sourced(nil, .notYetSourced)
    }

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

    public static func gauges(_ input: DashboardInputs) -> [GaugeReading] {
        [projectsGauge(input), verifiedThisWeek(input), awaitingYouGauge(input), minutesPerRelease(input), agentWindow(input)]
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

    /// Progress of a daemon lifecycle stage toward `released` (0…1). Paused/archived make no claim.
    static func stageProgress(_ stage: ProjectLifecycleStage) -> Double? {
        switch stage {
        case .exploring: return 0
        case .planned: return 0.2
        case .building: return 0.4
        case .qa: return 0.6
        case .internalTestflight: return 0.8
        case .released: return 1
        case .paused, .archived: return nil
        }
    }

    /// Live when the daemon reports lifecycle stages; else the fixture's lifecycle tracks; else "—".
    public static func reticle(_ input: DashboardInputs) -> ReticleReading {
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

    /// Daemon stage → the six-step track. Steps before the stage are done, the stage is active, later
    /// steps planned; the device-smoke gate is unknown because the daemon has no record of it.
    public static func lifecycle(for stage: ProjectLifecycleStage?) -> [LifecycleStep] {
        let order: [LifecyclePhase] = LifecyclePhase.allCases
        let activeIndex: Int?
        switch stage {
        case .none, .paused?, .archived?: activeIndex = nil
        case .exploring?, .planned?: activeIndex = 0
        case .building?: activeIndex = 1
        case .qa?: activeIndex = 2
        case .internalTestflight?: activeIndex = 3
        case .released?: activeIndex = 5
        }
        return order.enumerated().map { index, phase in
            if phase.isHumanGate { return LifecycleStep(phase, .unknown) }
            guard let activeIndex else { return LifecycleStep(phase, .unknown) }
            if index < activeIndex { return LifecycleStep(phase, .done) }
            if index == activeIndex { return LifecycleStep(phase, stage == .released ? .done : .active) }
            return LifecycleStep(phase, .planned)
        }
    }
}
