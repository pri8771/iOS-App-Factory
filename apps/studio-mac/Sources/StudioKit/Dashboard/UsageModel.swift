import Foundation
import Observation

// MARK: - UsageModel
//
// The observable state behind the dashboard's Analytics panel: `usage.summary` for the currently
// selected `AnalyticsRange`. Owned by `StudioStore`, mirroring `SettingsModel`/`RoomsModel` — a
// distinct wire family gets its own model. `range` is NOT persisted here — `StudioRootView`'s
// `studio.analyticsRange` `@AppStorage` (Wave 8) is the one source of truth for the human's choice;
// this model only holds the value it last loaded against, set via `setRange(_:)` before `load()`.
//
// `usage.summary` is unconditionally supported (Usage.swift's header comment — no
// unsupported-operation fallback exists on a current daemon), but `load()` still feature-detects it
// defensively, exactly like `StudioStore.refresh()` treats `studio.snapshot`: an
// `isUnsupportedOperation` failure (an older daemon this build predates) clears `summary` with no
// `error` set, so `AnalyticsPanel` renders its honest empty state silently; any OTHER failure keeps
// the daemon's own `code: message` in `error` so the panel can show it next to that same empty state.

@Observable
@MainActor
public final class UsageModel {

    public private(set) var range: AnalyticsRange
    public private(set) var summary: UsageSummary?
    public private(set) var isLoading = false
    public private(set) var error: String?

    private let client: DaemonClient?

    public init(client: DaemonClient?, range: AnalyticsRange = .sevenDays) {
        self.client = client
        self.range = range
    }

    public var isConnected: Bool { client != nil }

    /// Changes the window a subsequent `load()` reads. A no-op call (same range) does not clear
    /// `summary` — the stale-but-still-honest reading stays on screen until the new one lands.
    public func setRange(_ range: AnalyticsRange) {
        self.range = range
    }

    public func load() async {
        guard let client else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            summary = try await client.usageSummary(sinceDays: range.sinceDays)
            error = nil
        } catch let e as DaemonClientError where e.isUnsupportedOperation {
            summary = nil
            error = nil
        } catch {
            summary = nil
            self.error = Self.describe(error)
        }
    }

    nonisolated private static func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
