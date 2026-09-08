import Foundation

// MARK: - Protected release operator truth (OR-39 / OR-42)
//
// Session-2 offline path: Studio may show the exact local release identity, approval/effect state,
// and safe recovery actions. It must never imply that a canceled local intent undid a remote upload,
// and must never authorize a new effect from a stale reconnect snapshot.

/// Operator-visible external effect truth for the offline protected-release engine.
public enum ProtectedReleaseEffectTruth: String, Hashable, Sendable, Codable, CaseIterable {
    case queued
    case sending
    case rejected
    case uncertain
    case processing
    case available
    case canceledLocally = "canceled-locally"
    case irreversiblyCompleted = "irreversibly-completed"

    public var label: String {
        switch self {
        case .queued: return "queued"
        case .sending: return "sending"
        case .rejected: return "rejected"
        case .uncertain: return "uncertain"
        case .processing: return "processing"
        case .available: return "available"
        case .canceledLocally: return "canceled locally (remote not undone)"
        case .irreversiblyCompleted: return "irreversibly completed"
        }
    }

    /// Whether this truth may authorize planning a new upload effect from Studio.
    /// Session-2 keeps this false for every state: real release control stays disabled in UI.
    public var mayAuthorizeNewEffect: Bool { false }
}

/// Snapshot Studio renders for one protected-release run. All fields are daemon-sourced; reconnect
/// must replace this whole value rather than merge with a stale client cache.
public struct ProtectedReleaseOperatorSnapshot: Hashable, Sendable, Codable {
    public var releaseRunId: String
    public var stage: ReleaseStage
    public var revision: Int
    public var effectTruth: ProtectedReleaseEffectTruth
    public var identityDigest: String?
    public var effectId: String?
    public var transportProtocol: String
    public var realTransportEnabled: Bool
    public var evidenceBasisAt: IsoInstant?
    public var safeActions: [String]
    public var generatedAt: IsoInstant

    public init(
        releaseRunId: String,
        stage: ReleaseStage,
        revision: Int,
        effectTruth: ProtectedReleaseEffectTruth,
        identityDigest: String?,
        effectId: String?,
        transportProtocol: String,
        realTransportEnabled: Bool,
        evidenceBasisAt: IsoInstant?,
        safeActions: [String],
        generatedAt: IsoInstant
    ) {
        self.releaseRunId = releaseRunId
        self.stage = stage
        self.revision = revision
        self.effectTruth = effectTruth
        self.identityDigest = identityDigest
        self.effectId = effectId
        self.transportProtocol = transportProtocol
        self.realTransportEnabled = realTransportEnabled
        self.evidenceBasisAt = evidenceBasisAt
        self.safeActions = safeActions
        self.generatedAt = generatedAt
    }

    /// Stale reconnect rule: an older revision never authorizes a newer mutation. Session-2 also
    /// keeps protected upload controls disabled even on a fresh revision.
    public func authorizesProtectedUpload(expectedRevision: Int) -> Bool {
        guard revision == expectedRevision else { return false }
        guard !realTransportEnabled else { return false }
        return effectTruth.mayAuthorizeNewEffect
    }
}
