import Foundation
import Observation

// MARK: - StudioStore
//
// The one observable object behind the shell. It owns the daemon client, fetches the read models the
// dashboard is derived from (doctor · portfolio.snapshot · attempt.list · evidence.list), keeps the
// bundled timeline fixture, and exposes a derived `DashboardSnapshot`. Views never touch the client.
//
// Loading is honest: each read model is `nil` until it has been read, and per-operation errors are
// kept (not swallowed) so the UI can print them next to the instrument they starve.

@Observable
@MainActor
public final class StudioStore {

    public enum Link: Equatable, Sendable {
        case unconfigured
        case connecting
        case connected(DoctorResult)
        case offline(String)

        public var description: String {
            switch self {
            case .unconfigured: return "no daemon configured (set APP_FACTORY_SOCKET / APP_FACTORY_RUNTIME_DIR and APP_FACTORY_AUTH_TOKEN / APP_FACTORY_AUTH_FILE)"
            case .connecting: return "connecting"
            case .connected(let d): return "connected · daemon \(d.daemonVersion) \(d.readiness.rawValue)"
            case .offline(let reason): return "offline · \(reason)"
            }
        }

        public var doctor: DoctorResult? {
            if case .connected(let d) = self { return d }
            return nil
        }
    }

    public private(set) var link: Link = .unconfigured
    public let socketPath: String?
    public private(set) var portfolio: PortfolioReadModel?
    public private(set) var attempts: [AttemptListItem]?
    public private(set) var evidence: [EvidenceManifestDescriptor]?
    /// Per-operation errors from the last refresh, keyed by wire operation.
    public private(set) var errors: [String: String] = [:]
    public private(set) var lastRefreshAt: Date?
    public private(set) var isRefreshing = false
    /// Cached run details by attempt.
    public private(set) var runs: [AttemptID: RunDetail] = [:]

    public let timeline: TimelineFixture?
    public let timelineLoadError: String?
    public let chat = ChatModel()

    /// Injectable clock so derivations (and snapshots) are deterministic.
    public var now: @Sendable () -> Date

    private let client: DaemonClient?
    private var refreshLoop: Task<Void, Never>?

    public init(client: DaemonClient?, socketPath: String?, timeline: TimelineFixture?, timelineLoadError: String? = nil,
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.socketPath = socketPath
        self.timeline = timeline
        self.timelineLoadError = timelineLoadError
        self.now = now
    }

    /// Locates the daemon from the environment (`APP_FACTORY_SOCKET` / `APP_FACTORY_RUNTIME_DIR`,
    /// `APP_FACTORY_AUTH_TOKEN` / `APP_FACTORY_AUTH_FILE`) and loads the bundled timeline fixture.
    public static func fromEnvironment(_ environment: [String: String] = ProcessInfo.processInfo.environment) -> StudioStore {
        var timeline: TimelineFixture?
        var timelineError: String?
        do { timeline = try TimelineFixture.loadBundled() } catch { timelineError = String(describing: error) }

        guard let path = DaemonLocator.socketPath(environment: environment) else {
            return StudioStore(client: nil, socketPath: nil, timeline: timeline, timelineLoadError: timelineError)
        }
        do {
            let token = try AuthorizationToken.resolve(environment: environment)
            let client = try DaemonClient(configuration: .init(socketPath: path, authorization: token))
            return StudioStore(client: client, socketPath: path, timeline: timeline, timelineLoadError: timelineError)
        } catch let error as DaemonClientError {
            let store = StudioStore(client: nil, socketPath: path, timeline: timeline, timelineLoadError: timelineError)
            store.link = .offline(error.description)
            return store
        } catch {
            let store = StudioStore(client: nil, socketPath: path, timeline: timeline, timelineLoadError: timelineError)
            store.link = .offline(String(describing: error))
            return store
        }
    }

    // MARK: Derived

    public var inputs: DashboardInputs {
        DashboardInputs(doctor: link.doctor, portfolio: portfolio, attempts: attempts, evidence: evidence,
                        timeline: timeline, now: now())
    }

    public var dashboard: DashboardSnapshot { DashboardDerivation.snapshot(inputs) }

    public var assistantContext: AssistantContext {
        AssistantContext(link: link.description, doctor: link.doctor, portfolio: portfolio, attempts: attempts,
                         timeline: timeline, now: now())
    }

    public var isConnected: Bool { link.doctor != nil }

    // MARK: Wire

    /// doctor, then the read models. Safe to call again (reconnect).
    public func connect() async {
        guard let client else {
            if case .offline = link { return }
            link = .unconfigured
            return
        }
        link = .connecting
        do {
            let doctor = try await client.doctor()
            link = .connected(doctor)
            errors["doctor"] = nil
        } catch let error as DaemonClientError {
            link = .offline(error.description)
            errors["doctor"] = error.description
            return
        } catch {
            link = .offline(String(describing: error))
            errors["doctor"] = String(describing: error)
            return
        }
        await refresh()
    }

    /// portfolio.snapshot · attempt.list (scope all, up to 100) · evidence.list. Each independently.
    public func refresh() async {
        guard let client, isConnected else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            portfolio = try await client.portfolioSnapshot()
            errors["portfolio.snapshot"] = nil
        } catch {
            errors["portfolio.snapshot"] = describe(error)
        }
        do {
            let page = try await client.listAttempts(AttemptListQuery(scope: .all, limit: AttemptListQuery.maxItems))
            attempts = page.attempts
            errors["attempt.list"] = nil
        } catch {
            errors["attempt.list"] = describe(error)
        }
        do {
            let page = try await client.listEvidence(limit: 50)
            evidence = page.manifests
            errors["evidence.list"] = nil
        } catch {
            errors["evidence.list"] = describe(error)
        }
        lastRefreshAt = now()
    }

    /// Re-run doctor + refresh every `interval` seconds until cancelled.
    public func startRefreshLoop(interval: Duration = .seconds(15)) {
        refreshLoop?.cancel()
        refreshLoop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self else { return }
                if self.isConnected { await self.refresh() } else if self.client != nil { await self.connect() }
            }
        }
    }

    public func stopRefreshLoop() {
        refreshLoop?.cancel()
        refreshLoop = nil
    }

    /// attempt.events (all pages) + evidence.verify for one attempt. Cached; `force` refetches.
    @discardableResult
    public func loadRun(_ attemptId: AttemptID, force: Bool = false) async -> RunDetail? {
        if !force, let cached = runs[attemptId] { return cached }
        guard let client, isConnected else { return nil }
        var events: [AttemptEvent] = []
        var after = 0
        do {
            while true {
                let page = try await client.events(attemptId: attemptId, afterSequence: after, limit: 100)
                let fresh = page.events.filter { $0.sequence > after }
                events += fresh
                guard !fresh.isEmpty, page.nextAfterSequence > after, events.count < 1000 else { break }
                after = page.nextAfterSequence
            }
            errors["attempt.events"] = nil
        } catch {
            errors["attempt.events"] = describe(error)
        }
        var verify: EvidenceVerifyResult?
        var note: String?
        do {
            verify = try await client.verifyEvidence(attemptId: attemptId)
        } catch {
            note = describe(error)
        }
        let detail = RunDetail(attemptId: attemptId, events: events, verify: verify, evidenceNote: note)
        runs[attemptId] = detail
        return detail
    }

    private func describe(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
