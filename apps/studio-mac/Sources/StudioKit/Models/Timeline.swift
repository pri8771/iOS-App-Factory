import Foundation

// MARK: - Project timeline model
//
// The dashboard's centrepiece is one Gantt row per project. Each row is a `ProjectTimeline`: a
// lifecycle track (idea → building → qa → launch-prep → ◆ device smoke → live) and a list of dated
// bars. Bar kinds are exactly the prototype's vocabulary:
//
//   done     evidenced work that finished (solid cyan)
//   live     work in flight now (glowing cyan)
//   plan     a planned span (dashed cyan)
//   review   waiting on an external party — App Review — neither the machine nor you (hatched)
//   unknown  the machine won't guess: no honest estimate exists (dashed alert)
//   gate     ◆ a human decision at a date (gold while waiting)
//
// TODO(studio-phase-2): today the rows come from a bundled fixture (`timeline-fixture.json`) that
// mirrors the six real apps. The daemon has no planned-date source yet. When the studio service
// lands `milestones[]: {phase, stage|gate, targetDate, dependsOn}` on projects (and `phase` on tasks),
// `TimelineFixture.loadBundled()` is replaced by a `portfolio.milestones` read and the `fixture`
// provenance disappears. Live attempts are already overlaid on the rows (see `TimelineMerge`).

/// A calendar day in UTC, serialised as `YYYY-MM-DD`. Day precision is all a milestone has.
public struct DayStamp: Hashable, Sendable, Codable, Comparable, CustomStringConvertible {
    public let rawValue: String
    public let date: Date

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }()

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    public init(_ rawValue: String) throws {
        guard let date = Self.formatter.date(from: rawValue), Self.formatter.string(from: date) == rawValue else {
            throw WireValidationError.invalid(kind: "day stamp", value: rawValue)
        }
        self.rawValue = rawValue
        self.date = date
    }

    /// The UTC day containing `date`.
    public init(_ date: Date) {
        let start = Self.calendar.startOfDay(for: date)
        self.rawValue = Self.formatter.string(from: start)
        self.date = start
    }

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        do { try self.init(raw) } catch {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                    debugDescription: "Expected YYYY-MM-DD, got \(raw.debugDescription)"))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }

    public static func < (lhs: DayStamp, rhs: DayStamp) -> Bool { lhs.date < rhs.date }
    public var description: String { rawValue }

    /// Whole days from `self` to `other` (negative if `other` is earlier).
    public func days(to other: DayStamp) -> Int {
        Self.calendar.dateComponents([.day], from: date, to: other.date).day ?? 0
    }

    public func adding(days: Int) -> DayStamp {
        DayStamp(Self.calendar.date(byAdding: .day, value: days, to: date) ?? date)
    }

    /// The first day of `self`'s month.
    public var monthStart: DayStamp {
        let comps = Self.calendar.dateComponents([.year, .month], from: date)
        return DayStamp(Self.calendar.date(from: comps) ?? date)
    }

    /// Short upper-case month name ("AUG").
    public var monthLabel: String {
        let f = DateFormatter()
        f.calendar = Self.calendar
        f.timeZone = Self.calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM"
        return f.string(from: date).uppercased()
    }

    /// "Aug 16".
    public var shortLabel: String {
        let f = DateFormatter()
        f.calendar = Self.calendar
        f.timeZone = Self.calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}

// MARK: Bars

public enum TimelineBarKind: String, Hashable, Sendable, Codable, CaseIterable {
    case done, live, plan, review, unknown, gate

    /// Legend word.
    public var word: String {
        switch self {
        case .done: return "done"
        case .live: return "live"
        case .plan: return "planned"
        case .review: return "in review"
        case .unknown: return "won't guess"
        case .gate: return "your gate"
        }
    }
}

public enum TimelineGateState: String, Hashable, Sendable, Codable, CaseIterable {
    case waiting, cleared, declined
}

/// One bar (or ◆ marker) on a project's row.
public struct TimelineBar: Hashable, Sendable, Identifiable {
    public var id: String
    public var kind: TimelineBarKind
    public var label: String
    public var start: DayStamp
    /// `nil` = still running: the bar extends to today. Gates ignore `end`.
    public var end: DayStamp?
    /// Only meaningful for `.gate`.
    public var gateState: TimelineGateState?
    public var provenance: Provenance

    public init(id: String, kind: TimelineBarKind, label: String, start: DayStamp, end: DayStamp?,
                gateState: TimelineGateState? = nil, provenance: Provenance) {
        self.id = id
        self.kind = kind
        self.label = label
        self.start = start
        self.end = end
        self.gateState = gateState
        self.provenance = provenance
    }

    /// The bar's last day, resolving an open end to `today`.
    public func resolvedEnd(today: DayStamp) -> DayStamp {
        if kind == .gate { return start }
        return end ?? max(start, today)
    }
}

// MARK: Lifecycle

/// The one lifecycle Studio draws (idea → building → qa → launch-prep → ◆ device smoke → live).
public enum LifecyclePhase: String, Hashable, Sendable, Codable, CaseIterable {
    case idea, building, qa
    case launchPrep = "launch-prep"
    case deviceSmoke = "device-smoke"
    case live

    public var label: String {
        switch self {
        case .idea: return "idea"
        case .building: return "building"
        case .qa: return "qa"
        case .launchPrep: return "launch prep"
        case .deviceSmoke: return "device smoke"
        case .live: return "live"
        }
    }

    /// Device smoke is the human's gate: it can never be claimed done by the machine.
    public var isHumanGate: Bool { self == .deviceSmoke }
}

public enum LifecycleStepState: String, Hashable, Sendable, Codable, CaseIterable {
    case done, active, planned, unknown
    case gateWaiting = "gate-waiting"
    case gateCleared = "gate-cleared"
}

public struct LifecycleStep: Hashable, Sendable, Codable, Identifiable {
    public var phase: LifecyclePhase
    public var state: LifecycleStepState
    public var id: LifecyclePhase { phase }

    public init(_ phase: LifecyclePhase, _ state: LifecycleStepState) {
        self.phase = phase
        self.state = state
    }
}

// MARK: Rows

public struct ProjectTimeline: Hashable, Sendable, Identifiable {
    /// The project slug (stable key); matches `PortfolioProject.slug` when the daemon knows the project.
    public var slug: String
    public var name: String
    public var lifecycle: [LifecycleStep]
    public var bars: [TimelineBar]
    /// Where the row's plan came from.
    public var provenance: Provenance
    /// A one-line honest note ("frozen candidate, never uploaded").
    public var note: String?

    public var id: String { slug }

    public init(slug: String, name: String, lifecycle: [LifecycleStep], bars: [TimelineBar],
                provenance: Provenance, note: String? = nil) {
        self.slug = slug
        self.name = name
        self.lifecycle = lifecycle
        self.bars = bars
        self.provenance = provenance
        self.note = note
    }

    /// Steps done (gate cleared counts) out of the lifecycle length.
    public var doneCount: Int {
        lifecycle.filter { $0.state == .done || $0.state == .gateCleared }.count
    }

    public var waitingGates: [TimelineBar] {
        bars.filter { $0.kind == .gate && $0.gateState == .waiting }
    }
}

/// The visible date range: `start` inclusive to `end` inclusive.
public struct TimelineWindow: Hashable, Sendable {
    public var start: DayStamp
    public var end: DayStamp

    public init(start: DayStamp, end: DayStamp) {
        self.start = start
        self.end = end
    }

    public var dayCount: Int { max(1, start.days(to: end)) }

    /// 0…1 position of a day in the window (unclamped).
    public func fraction(of day: DayStamp) -> Double {
        Double(start.days(to: day)) / Double(dayCount)
    }

    /// Month boundaries strictly inside the window, plus the window edges: the column ticks.
    public var monthTicks: [DayStamp] {
        var ticks: [DayStamp] = [start]
        var cursor = start.monthStart
        while true {
            // next month start
            let comps = DateComponents(month: 1)
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(secondsFromGMT: 0)!
            guard let next = cal.date(byAdding: comps, to: cursor.date) else { break }
            cursor = DayStamp(next)
            if cursor >= end { break }
            if cursor > start { ticks.append(cursor) }
        }
        ticks.append(end)
        return ticks
    }

    public func contains(_ day: DayStamp) -> Bool { day >= start && day <= end }
}

// MARK: - Bundled fixture

/// The bundled timeline fixture (`Resources/timeline-fixture.json`). Fixture-fed by design in phase 1
/// — see the TODO at the top of this file.
public struct TimelineFixture: Hashable, Sendable {
    public static let resourceName = "timeline-fixture"
    public static let provenanceNote = "timeline-fixture.json"

    public var recordedAt: DayStamp
    public var window: TimelineWindow
    public var projects: [ProjectTimeline]
    public var note: String

    public init(recordedAt: DayStamp, window: TimelineWindow, projects: [ProjectTimeline], note: String) {
        self.recordedAt = recordedAt
        self.window = window
        self.projects = projects
        self.note = note
    }

    // The on-disk shape. Kept private so the model above stays the API.
    private struct File: Decodable {
        struct Window: Decodable { var start: DayStamp; var end: DayStamp }
        struct Bar: Decodable {
            var kind: TimelineBarKind
            var label: String
            var start: DayStamp
            var end: DayStamp?
            var gate: TimelineGateState?
        }
        struct Project: Decodable {
            var slug: String
            var name: String
            var note: String?
            var lifecycle: [LifecycleStep]
            var bars: [Bar]
        }
        var schemaVersion: Int
        var recordedAt: DayStamp
        var note: String
        var window: Window
        var projects: [Project]
    }

    public static func decode(_ data: Data) throws -> TimelineFixture {
        let file = try JSONDecoder().decode(File.self, from: data)
        guard file.schemaVersion == 1 else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Unsupported timeline fixture schema \(file.schemaVersion)"))
        }
        let provenance = Provenance.fixture(provenanceNote)
        let projects = try file.projects.map { p -> ProjectTimeline in
            guard StableKeyRule.isValid(p.slug) else {
                throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid slug \(p.slug)"))
            }
            let bars = try p.bars.enumerated().map { index, b -> TimelineBar in
                if let end = b.end, end < b.start {
                    throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "\(p.slug) bar \(index) ends before it starts"))
                }
                if b.kind == .gate, b.gate == nil {
                    throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "\(p.slug) gate \(index) has no state"))
                }
                return TimelineBar(id: "\(p.slug).\(index)", kind: b.kind, label: b.label, start: b.start,
                                   end: b.end, gateState: b.gate, provenance: provenance)
            }
            return ProjectTimeline(slug: p.slug, name: p.name, lifecycle: p.lifecycle, bars: bars,
                                   provenance: provenance, note: p.note)
        }
        return TimelineFixture(recordedAt: file.recordedAt, window: .init(start: file.window.start, end: file.window.end),
                               projects: projects, note: file.note)
    }

    /// Loads the fixture bundled with StudioKit.
    public static func loadBundled() throws -> TimelineFixture {
        guard let url = Bundle.module.url(forResource: resourceName, withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: "\(resourceName).json"])
        }
        return try decode(try Data(contentsOf: url))
    }
}
