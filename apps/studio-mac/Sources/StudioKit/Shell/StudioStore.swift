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
    /// `studio.snapshot`, once a refresh has confirmed the daemon supports it. `nil` either means
    /// "not loaded yet" or "this daemon doesn't have the studio service" — `errors["studio.snapshot"]`
    /// distinguishes a real failure from silent, expected unsupported-operation fallback (which sets
    /// no error).
    public private(set) var studioSnapshot: StudioSnapshot?
    /// `release.projection` (Studio Phase 6 step B), refreshed with the dashboard. `nil` means "not
    /// loaded yet" or "this daemon predates the release rail" (unsupported-operation fallback sets no
    /// error, mirroring `studioSnapshot`).
    public private(set) var releaseProjection: ReleaseProjection?
    public private(set) var isObservingRelease = false
    /// Per-operation errors from the last refresh, keyed by wire operation.
    public private(set) var errors: [String: String] = [:]
    public private(set) var lastRefreshAt: Date?
    public private(set) var isRefreshing = false
    /// Cached run details by attempt.
    public private(set) var runs: [AttemptID: RunDetail] = [:]
    /// Cached `project.milestones.list` results by project.
    public private(set) var milestoneTimelines: [ProjectID: ProjectMilestoneTimeline] = [:]
    public private(set) var milestoneErrors: [ProjectID: String] = [:]

    public let timeline: TimelineFixture?
    public let timelineLoadError: String?
    public let chat = ChatModel()
    public let rooms: RoomsModel
    public let phases: PhasesModel
    public let planner: PlannerModel
    public let settings: SettingsModel

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
        self.rooms = RoomsModel(client: client, now: now)
        self.phases = PhasesModel(client: client, now: now)
        self.planner = PlannerModel(client: client, now: now)
        self.settings = SettingsModel(client: client)
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
                        timeline: timeline, studioSnapshot: studioSnapshot, now: now())
    }

    public var dashboard: DashboardSnapshot { DashboardDerivation.snapshot(inputs) }

    public var assistantContext: AssistantContext {
        AssistantContext(link: link.description, doctor: link.doctor, portfolio: portfolio, attempts: attempts,
                         timeline: timeline, now: now())
    }

    public var isConnected: Bool { link.doctor != nil }

    /// Every project id + name Studio currently knows about, from whichever snapshot sourced the
    /// dashboard — for the new-room sheet's optional project picker. Not itself a new read: it only
    /// re-presents `portfolio`/`studioSnapshot`, already fetched by `refresh()`.
    public var knownProjects: [(id: ProjectID, name: String)] {
        var seen = Set<ProjectID>()
        var result: [(id: ProjectID, name: String)] = []
        for project in portfolio?.projects ?? [] where seen.insert(project.projectId).inserted {
            result.append((project.projectId, project.displayName))
        }
        for project in studioSnapshot?.projects ?? [] where seen.insert(project.projectId).inserted {
            result.append((project.projectId, project.name))
        }
        return result
    }

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

    /// Tries `studio.snapshot` first (Phase 2); on an unsupported-operation-style failure (see
    /// `DaemonClientError.isUnsupportedOperation`) falls back to the phase-1 path — portfolio.snapshot
    /// · attempt.list (scope all, up to 100). `evidence.list` is fetched either way: project detail's
    /// "latest run" checks read it regardless of which snapshot sourced the dashboard.
    public func refresh() async {
        guard let client, isConnected else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        var sourcedFromStudio = false
        do {
            studioSnapshot = try await client.studioSnapshot()
            errors["studio.snapshot"] = nil
            sourcedFromStudio = true
        } catch let error as DaemonClientError where error.isUnsupportedOperation {
            studioSnapshot = nil
            errors["studio.snapshot"] = nil
        } catch {
            studioSnapshot = nil
            errors["studio.snapshot"] = describe(error)
        }

        if sourcedFromStudio {
            portfolio = nil
            attempts = nil
            errors["portfolio.snapshot"] = nil
            errors["attempt.list"] = nil
        } else {
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
        }
        do {
            let page = try await client.listEvidence(limit: 50)
            evidence = page.manifests
            errors["evidence.list"] = nil
        } catch {
            errors["evidence.list"] = describe(error)
        }
        await refreshReleaseProjection()
        // Chat is the default tab as of this wave, so its sidebar of rooms needs to stay fresh even
        // when the human never opens the dedicated rooms UI that used to be the only caller of
        // `loadRooms()`. Piggybacks on this same 15s loop rather than a second timer; the 1.5s
        // per-room transcript poll (`RoomsModel.resumePollingSelected()`) is unrelated and unchanged.
        await rooms.loadRooms()
        lastRefreshAt = now()
    }

    /// `release.projection` alone (also called after `observeRelease()` so the rail shows the new
    /// latest without waiting for the next full refresh).
    public func refreshReleaseProjection() async {
        guard let client, isConnected else { return }
        do {
            releaseProjection = try await client.releaseProjection()
            errors["release.projection"] = nil
        } catch let error as DaemonClientError where error.isUnsupportedOperation {
            releaseProjection = nil
            errors["release.projection"] = nil
        } catch {
            releaseProjection = nil
            errors["release.projection"] = describe(error)
        }
    }

    /// `release.observe`: asks the daemon for ONE fresh, strictly read-only App Store Connect
    /// observation, then re-reads the projection. The daemon refuses (`release.observer-not-configured`)
    /// when it has no observer composed; that refusal lands in `errors["release.observe"]`.
    public func observeRelease(buildsLimit: Int = 5) async {
        guard let client, isConnected, !isObservingRelease else { return }
        isObservingRelease = true
        defer { isObservingRelease = false }
        do {
            _ = try await client.observeRelease(buildsLimit: buildsLimit)
            errors["release.observe"] = nil
        } catch {
            errors["release.observe"] = describe(error)
        }
        await refreshReleaseProjection()
    }

    /// The release rail's render state, composed from the last projection read and observe outcome.
    public var releaseRail: ReleaseRailState {
        ReleaseRailState(projection: releaseProjection,
                         error: errors["release.observe"] ?? errors["release.projection"],
                         isObserving: isObservingRelease)
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

    /// `project.milestones.list` for one project. Cached; `force` refetches (used after an upsert).
    @discardableResult
    public func loadMilestones(_ projectId: ProjectID, force: Bool = false) async -> ProjectMilestoneTimeline? {
        if !force, let cached = milestoneTimelines[projectId] { return cached }
        guard let client, isConnected else { return nil }
        do {
            let timeline = try await client.milestonesList(projectId: projectId)
            milestoneTimelines[projectId] = timeline
            milestoneErrors[projectId] = nil
            return timeline
        } catch {
            milestoneErrors[projectId] = describe(error)
            return nil
        }
    }

    /// Creates or compare-and-set updates a milestone, then refreshes that project's cached timeline
    /// so the panel and the Gantt row are live from inside the app.
    @discardableResult
    public func upsertMilestone(_ draft: ProjectMilestoneDraft, expectedRevision: Int?) async -> Result<ProjectMilestoneUpsertResult, AssistantBackendError> {
        guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
        do {
            let result = try await client.upsertMilestone(draft, expectedRevision: expectedRevision)
            await loadMilestones(draft.projectId, force: true)
            return .success(result)
        } catch {
            return .failure(AssistantBackendError(describe(error)))
        }
    }

    /// The daemon-backed corner-chat assistant. Captures only the (`Sendable`) client, not `self`, so
    /// it can be handed to `ChatModel` and called off the main actor.
    public var assistantBackend: AssistantBackend {
        let client = self.client
        return AssistantBackend(
            query: { question, projectId in
                guard let client else { return .unsupported }
                do {
                    return .answer(try await client.assistantQuery(AssistantQuery(question: question, projectId: projectId)))
                } catch let error as DaemonClientError where error.isUnsupportedOperation {
                    return .unsupported
                } catch {
                    return .failed(Self.describeStatic(error))
                }
            },
            proposeIntent: { utterance, payload in
                guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
                do {
                    return .success(try await client.proposeIntent(utterance: utterance, payload: payload))
                } catch {
                    return .failure(AssistantBackendError(Self.describeStatic(error)))
                }
            },
            executeIntent: { intent in
                guard let client else { return .failure(AssistantBackendError("no daemon configured")) }
                do {
                    return .success(try await client.executeIntent(intent).outcome)
                } catch {
                    return .failure(AssistantBackendError(Self.describeStatic(error)))
                }
            })
    }

    private func describe(_ error: any Error) -> String { Self.describeStatic(error) }

    nonisolated private static func describeStatic(_ error: any Error) -> String {
        if let e = error as? DaemonClientError { return e.description }
        return String(describing: error)
    }
}
