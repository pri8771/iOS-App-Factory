import Foundation

// MARK: - Portfolio read model (portfolio-read-model.ts, project.ts)

/// ADR 0005 (`docs/architecture/0005-lifecycle-reconciliation.md`) canonical six-stage lifecycle
/// vocabulary — `ProjectLifecycleStageV1` (`lifecycle.ts`). `StudioProject.lifecycleStage` sends this
/// vocabulary for real as of the `studio/repo-docs-truth` merge (previously always `null`).
/// `PortfolioProject.lifecycleStage` still comes from the daemon's legacy 8-value
/// `ProjectManifestV1.lifecycleStage` (`LegacyProjectLifecycleStageV1Schema`, `project.ts`) — decoding
/// folds any of those raw values onto its canonical stage below via `legacyMap`, which mirrors
/// `LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1` (`lifecycle.ts`) verbatim, so both fields — and any older
/// recorded fixture still carrying a legacy raw value — decode into one shared vocabulary.
public enum ProjectLifecycleStage: String, Hashable, Sendable, CaseIterable {
    case idea, building, qa
    case launchPrep = "launch-prep"
    case live, frozen
}

extension ProjectLifecycleStage: Codable {
    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if let canonical = ProjectLifecycleStage(rawValue: raw) {
            self = canonical
            return
        }
        if let legacy = ProjectLifecycleStage.legacyMap[raw] {
            self = legacy
            return
        }
        throw DecodingError.dataCorruptedError(
            in: container, debugDescription: "Unrecognized ProjectLifecycleStage value: \(raw)")
    }

    /// Always the canonical raw value — a decoded legacy value re-encodes as its canonical stage,
    /// never round-trips back to the legacy string it was folded from.
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    /// `LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1` (`lifecycle.ts`), verbatim: `planned` is still `idea`
    /// (nothing built, no gate can hold); `internal-testflight` is `launch-prep` (the release
    /// sub-lifecycle, ADR 0003, runs there).
    private static let legacyMap: [String: ProjectLifecycleStage] = [
        "exploring": .idea,
        "planned": .idea,
        "building": .building,
        "qa": .qa,
        "internal-testflight": .launchPrep,
        "released": .live,
        "paused": .frozen,
        "archived": .frozen,
    ]
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
