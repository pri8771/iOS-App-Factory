import Foundation

// MARK: - Release rail (release-observation.ts, app-store-connect-read-model.ts, release.ts)
//
// Studio Phase 6 step B. `release.projection` is the read-only view over the daemon's persisted App
// Store Connect observations: the newest one (or an honest "none yet") plus whether the daemon could
// take a fresh one. `release.observe` takes that fresh one — strictly GET-only through the daemon's
// credential broker; the app never sees a key. Every instant here is Apple's own (`uploadedDate`,
// `createdDate`) or the daemon's clock when the observation was taken (`observedAt`); nothing is
// synthesized client-side, so the rail can only ever print what Apple said and when it was asked.

/// `ReleaseStageV1` — the single 8-stage release state machine (`release.ts`, ADR 0003), in order.
/// App Store Connect can only ever prove `.processing` or `.internalTestflightAvailable`; the rest
/// are local or device-side facts this projection never claims.
public enum ReleaseStage: String, Hashable, Sendable, Codable, CaseIterable {
    case candidate
    case certified
    case archived
    case uploadApproved = "upload-approved"
    case uploaded
    case processing
    case internalTestflightAvailable = "internal-testflight-available"
    case deviceSmokePassed = "device-smoke-passed"

    /// Position in `RELEASE_STAGE_ORDER_V1` (0-based).
    public var rank: Int { ReleaseStage.allCases.firstIndex(of: self) ?? 0 }

    /// Short HUD label.
    public var label: String {
        switch self {
        case .candidate: return "candidate"
        case .certified: return "certified"
        case .archived: return "archived"
        case .uploadApproved: return "upload approved"
        case .uploaded: return "uploaded"
        case .processing: return "processing"
        case .internalTestflightAvailable: return "internal TestFlight"
        case .deviceSmokePassed: return "device smoke passed"
        }
    }
}

/// `AscProjectionBasisV1` — exactly one observable Apple fact per value.
public enum AscProjectionBasis: String, Hashable, Sendable, Codable, CaseIterable {
    case noBuildObserved = "no-build-observed"
    case buildProcessing = "build-processing"
    case buildProcessingFailed = "build-processing-failed"
    case buildProcessedNotInInternalTesting = "build-processed-not-in-internal-testing"
    case buildInInternalTesting = "build-in-internal-testing"
    case buildExpired = "build-expired"

    public var label: String {
        switch self {
        case .noBuildObserved: return "no build on App Store Connect"
        case .buildProcessing: return "build processing"
        case .buildProcessingFailed: return "build processing failed"
        case .buildProcessedNotInInternalTesting: return "processed, not in internal testing"
        case .buildInInternalTesting: return "in internal testing"
        case .buildExpired: return "latest build expired"
        }
    }
}

/// `AscBuildProcessingStateV1`.
public enum AscBuildProcessingState: String, Hashable, Sendable, Codable, CaseIterable {
    case processing = "PROCESSING", failed = "FAILED", invalid = "INVALID", valid = "VALID"
}

/// `AscAppV1` — one app as App Store Connect names it.
public struct AscApp: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var appId: String
    public var bundleId: String
    public var name: String
    public var sku: String?
    public var primaryLocale: String?

    public var id: String { appId }

    public init(appId: String, bundleId: String, name: String, sku: String?, primaryLocale: String?) {
        self.appId = appId
        self.bundleId = bundleId
        self.name = name
        self.sku = sku
        self.primaryLocale = primaryLocale
    }
}

/// `AscBuildV1`.
public struct AscBuild: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var buildId: String
    public var appId: String
    public var buildNumber: String
    public var marketingVersion: String?
    /// Apple's own instant; never synthesized.
    public var uploadedDate: IsoInstant?
    public var processingState: AscBuildProcessingState
    public var expired: Bool
    public var internalBuildState: String?
    public var externalBuildState: String?

    public init(buildId: String, appId: String, buildNumber: String, marketingVersion: String?,
                uploadedDate: IsoInstant?, processingState: AscBuildProcessingState, expired: Bool,
                internalBuildState: String?, externalBuildState: String?) {
        self.buildId = buildId
        self.appId = appId
        self.buildNumber = buildNumber
        self.marketingVersion = marketingVersion
        self.uploadedDate = uploadedDate
        self.processingState = processingState
        self.expired = expired
        self.internalBuildState = internalBuildState
        self.externalBuildState = externalBuildState
    }

    /// "1.0 (4)" — marketing version when Apple reported one, else just the build number.
    public var versionLabel: String {
        if let marketingVersion { return "\(marketingVersion) (\(buildNumber))" }
        return "(\(buildNumber))"
    }
}

/// `AscAppStoreVersionV1`.
public struct AscAppStoreVersion: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var appStoreVersionId: String
    public var appId: String
    public var versionString: String
    public var platform: String
    public var appStoreState: String?
    public var appVersionState: String?
    public var createdDate: IsoInstant?

    public init(appStoreVersionId: String, appId: String, versionString: String, platform: String,
                appStoreState: String?, appVersionState: String?, createdDate: IsoInstant?) {
        self.appStoreVersionId = appStoreVersionId
        self.appId = appId
        self.versionString = versionString
        self.platform = platform
        self.appStoreState = appStoreState
        self.appVersionState = appVersionState
        self.createdDate = createdDate
    }

    /// Apple's newer `appVersionState` when present, else the legacy `appStoreState`.
    public var stateLabel: String? { appVersionState ?? appStoreState }
}

/// `AscReleaseProjectionV1` — Apple's observed state projected onto `ReleaseStage`. `projectedStage`
/// is `nil` exactly when Apple has no build; `internalTestFlightAvailableAt` is always `nil` from
/// App Store Connect (Apple does not report it) and exists only as a like-typed slot.
public struct AscReleaseProjection: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var app: AscApp
    public var latestBuild: AscBuild?
    public var latestAppStoreVersion: AscAppStoreVersion?
    public var projectedStage: ReleaseStage?
    public var projectionBasis: AscProjectionBasis
    public var uploadedAt: IsoInstant?
    public var internalTestFlightAvailableAt: IsoInstant?
    public var observedAt: IsoInstant

    public init(app: AscApp, latestBuild: AscBuild?, latestAppStoreVersion: AscAppStoreVersion?,
                projectedStage: ReleaseStage?, projectionBasis: AscProjectionBasis, uploadedAt: IsoInstant?,
                internalTestFlightAvailableAt: IsoInstant?, observedAt: IsoInstant) {
        self.app = app
        self.latestBuild = latestBuild
        self.latestAppStoreVersion = latestAppStoreVersion
        self.projectedStage = projectedStage
        self.projectionBasis = projectionBasis
        self.uploadedAt = uploadedAt
        self.internalTestFlightAvailableAt = internalTestFlightAvailableAt
        self.observedAt = observedAt
    }
}

/// `AscReadOutcomeSummaryV1` — how one bounded GET (or paged list) ended.
public struct AscReadOutcomeSummary: Hashable, Sendable, Codable {
    public enum Kind: String, Hashable, Sendable, Codable, CaseIterable {
        case observed, denied, ambiguous
    }

    public var kind: Kind
    public var status: Int?
    public var pages: Int?
    public var code: String?
    public var detail: String?

    public init(kind: Kind, status: Int?, pages: Int?, code: String?, detail: String?) {
        self.kind = kind
        self.status = status
        self.pages = pages
        self.code = code
        self.detail = detail
    }

    public var isObserved: Bool { kind == .observed }

    /// "denied · asc.forbidden" / "ambiguous · asc.transport-failed" — for the rail's honest cell.
    public var problemLabel: String? {
        guard kind != .observed else { return nil }
        if let code { return "\(kind.rawValue) · \(code)" }
        return kind.rawValue
    }
}

/// `AscAppReleaseObservationV1` — one app as the observer saw it.
public struct AscAppReleaseObservation: Hashable, Sendable, Codable, Identifiable {
    public var app: AscApp
    public var builds: AscReadOutcomeSummary
    public var appStoreVersions: AscReadOutcomeSummary
    /// Present exactly when both per-app reads were observed.
    public var projection: AscReleaseProjection?

    public var id: String { app.appId }

    public init(app: AscApp, builds: AscReadOutcomeSummary, appStoreVersions: AscReadOutcomeSummary,
                projection: AscReleaseProjection?) {
        self.app = app
        self.builds = builds
        self.appStoreVersions = appStoreVersions
        self.projection = projection
    }
}

/// `AscObserverSourceV1` — where the credential came from, by name only.
public struct AscObserverSource: Hashable, Sendable, Codable {
    public var keyId: String
    public var issuerId: String
    public var keychainService: String
    public var keychainAccount: String
    public var origin: String

    public init(keyId: String, issuerId: String, keychainService: String, keychainAccount: String, origin: String) {
        self.keyId = keyId
        self.issuerId = issuerId
        self.keychainService = keychainService
        self.keychainAccount = keychainAccount
        self.origin = origin
    }
}

/// `AscReleaseObservationV1`.
public struct AscReleaseObservation: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var observationId: String
    /// The daemon's clock when the observation began; never Apple's.
    public var observedAt: IsoInstant
    public var source: AscObserverSource
    public var apps: AscReadOutcomeSummary
    /// Sorted by app name (case-insensitive), then `appId` — the wire order is canonical.
    public var appObservations: [AscAppReleaseObservation]
    public var requestCount: Int
    public var statuses: [Int]
    public var observationDigest: Sha256Digest

    public var id: String { observationId }

    public init(observationId: String, observedAt: IsoInstant, source: AscObserverSource,
                apps: AscReadOutcomeSummary, appObservations: [AscAppReleaseObservation], requestCount: Int,
                statuses: [Int], observationDigest: Sha256Digest) {
        self.observationId = observationId
        self.observedAt = observedAt
        self.source = source
        self.apps = apps
        self.appObservations = appObservations
        self.requestCount = requestCount
        self.statuses = statuses
        self.observationDigest = observationDigest
    }
}

/// `ReleaseObserverStatusV1` — whether `release.observe` can take a fresh observation, and if not, why.
public struct ReleaseObserverStatus: Hashable, Sendable, Codable {
    public var configured: Bool
    public var unavailableReason: String?
    public var source: AscObserverSource?

    public init(configured: Bool, unavailableReason: String?, source: AscObserverSource?) {
        self.configured = configured
        self.unavailableReason = unavailableReason
        self.source = source
    }
}

/// `ReleaseProjectionV1` — what `release.projection` returns.
public struct ReleaseProjection: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var observer: ReleaseObserverStatus
    /// The newest persisted observation, or `nil` when none has ever been taken on this runtime.
    public var latest: AscReleaseObservation?
    public var observationCount: Int
    public var generatedAt: IsoInstant
    /// SHA-256 of the canonical JSON of every field above except `generatedAt` and this digest.
    public var sourceDigest: Sha256Digest

    public init(observer: ReleaseObserverStatus, latest: AscReleaseObservation?, observationCount: Int,
                generatedAt: IsoInstant, sourceDigest: Sha256Digest) {
        self.observer = observer
        self.latest = latest
        self.observationCount = observationCount
        self.generatedAt = generatedAt
        self.sourceDigest = sourceDigest
    }
}
