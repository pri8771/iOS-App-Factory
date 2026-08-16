import Foundation

// MARK: - Portfolio read model (portfolio-read-model.ts, project.ts)

public enum ProjectLifecycleStage: String, Hashable, Sendable, Codable, CaseIterable {
    case exploring, planned, building, qa
    case internalTestflight = "internal-testflight"
    case released, paused, archived
}

public enum PortfolioSourceAvailability: String, Hashable, Sendable, Codable, CaseIterable {
    case available, unavailable
}

public enum PortfolioHealth: String, Hashable, Sendable, Codable, CaseIterable {
    case healthy, attention, blocked, unknown
}

public enum PortfolioHealthReason: String, Hashable, Sendable, Codable, CaseIterable {
    case unresolvedP0 = "unresolved-p0"
    case deliveryBlocker = "delivery-blocker"
    case unresolvedP1 = "unresolved-p1"
    case jiraUnavailable = "jira-unavailable"
    case githubUnavailable = "github-unavailable"
    case qualityUnavailable = "quality-unavailable"
    case releaseUnavailable = "release-unavailable"
    case analyticsStale = "analytics-stale"
    case analyticsUnavailable = "analytics-unavailable"
}

public enum AnalyticsFreshness: String, Hashable, Sendable, Codable, CaseIterable {
    case fresh, stale, unavailable
}

public struct PortfolioProjectSources: Hashable, Sendable, Codable {
    /// Always "available" on the wire (z.literal).
    public var localExecution: PortfolioSourceAvailability
    public var jira: PortfolioSourceAvailability
    public var github: PortfolioSourceAvailability
    public var quality: PortfolioSourceAvailability
    public var release: PortfolioSourceAvailability
    public var analytics: PortfolioSourceAvailability

    public init(localExecution: PortfolioSourceAvailability = .available, jira: PortfolioSourceAvailability,
                github: PortfolioSourceAvailability, quality: PortfolioSourceAvailability,
                release: PortfolioSourceAvailability, analytics: PortfolioSourceAvailability) {
        self.localExecution = localExecution
        self.jira = jira
        self.github = github
        self.quality = quality
        self.release = release
        self.analytics = analytics
    }
}

/// `PortfolioProjectReadModelV1`. Nullable counts are `nil` exactly when their source is unavailable —
/// the UI must render those as an honest "—", never as 0.
public struct PortfolioProject: Hashable, Sendable, Codable, Identifiable {
    public var projectId: ProjectID
    public var slug: StableKey
    public var displayName: String
    /// Always "task-derived" on the wire (z.literal).
    public var metadataSource: String
    public var lifecycleStage: ProjectLifecycleStage?
    public var attemptCount: Int
    public var activeAttemptCount: Int
    public var blockerCount: Int
    public var lastActivityAt: IsoInstant?
    public var lastDeliveryAt: IsoInstant?
    public var openPullRequestCount: Int?
    public var jiraTodoCount: Int?
    public var jiraInProgressCount: Int?
    public var unresolvedP0: Int?
    public var unresolvedP1: Int?
    public var releaseStage: String?
    public var analyticsFreshness: AnalyticsFreshness
    public var sources: PortfolioProjectSources
    public var health: PortfolioHealth
    public var healthReasons: [PortfolioHealthReason]

    public var id: ProjectID { projectId }
}

public struct PortfolioTotals: Hashable, Sendable, Codable {
    public var projects: Int
    public var attempts: Int
    public var activeAttempts: Int
    public var blockers: Int
    public var openPullRequests: Int?
    public var jiraTodo: Int?
    public var jiraInProgress: Int?
    public var unresolvedP0: Int?
    public var unresolvedP1: Int?
}

/// `PortfolioReadModelV1`. `sourceSnapshotDigest` is re-verified client-side by `DaemonClient` — see
/// `PortfolioDigest`.
public struct PortfolioReadModel: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var generatedAt: IsoInstant
    public var projects: [PortfolioProject]
    public var totals: PortfolioTotals
    public var sourceSnapshotDigest: Sha256Digest
}
