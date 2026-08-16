import Foundation

// MARK: - Provenance
//
// Every value an instrument shows carries where it came from, and the UI prints that next to the
// value. This is how "no fake numbers" is enforced at the type level: a `Sourced` value that has no
// backing (`notYetSourced`) has no `value`, so it can only ever render as "—".
//
//   live      read straight off a daemon wire operation (portfolio.snapshot, attempt.list, …)
//   derived   computed client-side from live operations (a count over a time window, a ratio)
//   fixture   from a bundled fixture that mirrors reality but is not read from the daemon
//   staticValue   a hard-coded placeholder the machine does not source yet, shown as such
//   notYetSourced the machine has no source for this yet — renders "—"

public enum Provenance: Hashable, Sendable {
    /// Read directly from the named wire operation(s), e.g. "portfolio.snapshot".
    case live(String)
    /// Computed client-side from live operations; the note names the inputs, e.g. "attempt.list · 7d".
    case derived(String)
    /// From a bundled fixture; the note names it, e.g. "timeline-fixture.json".
    case fixture(String)
    /// A hard-coded placeholder, honestly labelled (e.g. the phase-1 budget gauge).
    case staticValue(String)
    /// No source exists yet.
    case notYetSourced

    /// The short mono badge printed next to the value.
    public var badge: String {
        switch self {
        case .live: return "live"
        case .derived: return "derived"
        case .fixture(let note): return note.hasSuffix("+ live") ? "fixture + live" : "fixture"
        case .staticValue: return "static"
        case .notYetSourced: return "not yet sourced"
        }
    }

    /// The badge plus its note, for tooltips and VoiceOver.
    public var detail: String {
        switch self {
        case .live(let op): return "live · \(op)"
        case .derived(let note): return "derived · \(note)"
        case .fixture(let name): return "fixture · \(name)"
        case .staticValue(let note): return "static · \(note)"
        case .notYetSourced: return "not yet sourced"
        }
    }

    /// True when the value came from the daemon (directly or by computation).
    public var isLive: Bool {
        switch self {
        case .live, .derived: return true
        default: return false
        }
    }
}

/// A value plus where it came from. `value == nil` means the instrument must render "—".
public struct Sourced<Value: Hashable & Sendable>: Hashable, Sendable {
    public var value: Value?
    public var provenance: Provenance

    public init(_ value: Value?, _ provenance: Provenance) {
        self.value = value
        self.provenance = provenance
    }

    /// The honest empty: no value, no source.
    public static var notYetSourced: Sourced<Value> { Sourced(nil, .notYetSourced) }
}
