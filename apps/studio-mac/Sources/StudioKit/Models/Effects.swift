import Foundation

// MARK: - External effects (external-effect.ts, effect-read-model.ts, approval.ts subject)

public enum ExternalProvider: String, Hashable, Sendable, Codable, CaseIterable {
    case jira, github, apple, website, email, social, analytics, crm
}

public enum ExternalEffectState: String, Hashable, Sendable, Codable, CaseIterable {
    case planned, sent, observed, confirmed, unknown
    case manualIntervention = "manual-intervention"
    case rejected
}

public struct ExternalTarget: Hashable, Sendable, Codable {
    public var provider: ExternalProvider
    public var resourceType: NamespacedCode
    public var resourceKey: String
}

public struct ApprovalSubject: Hashable, Sendable, Codable {
    public var projectId: ProjectID?
    public var taskId: TaskID?
    public var attemptId: AttemptID?
    public var releaseId: ReleaseID?
}

public struct ExternalEffect: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var effectId: EffectID
    public var attemptId: AttemptID
    public var action: NamespacedCode
    public var operationMarker: String
    public var target: ExternalTarget
    public var subject: ApprovalSubject
    public var payloadDigest: Sha256Digest
    public var policyDigest: Sha256Digest
    public var approvalId: ApprovalID?
    public var state: ExternalEffectState
    public var revision: Int
    public var sendCount: Int
    public var providerCorrelationKey: String?
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant
    public var lastObservedAt: IsoInstant?
    public var nextReconcileAt: IsoInstant?
    public var detailDigest: Sha256Digest?

    public var id: EffectID { effectId }
}

public struct EffectListCursor: Hashable, Sendable, Codable {
    public var updatedAt: IsoInstant
    public var effectId: EffectID
    public init(updatedAt: IsoInstant, effectId: EffectID) {
        self.updatedAt = updatedAt
        self.effectId = effectId
    }
}

/// `EffectListQueryV1`. Nullable fields are always emitted.
public struct EffectListQuery: Hashable, Sendable, Codable {
    public var state: ExternalEffectState?
    public var provider: ExternalProvider?
    public var after: EffectListCursor?
    public var limit: Int

    public init(state: ExternalEffectState? = nil, provider: ExternalProvider? = nil,
                after: EffectListCursor? = nil, limit: Int = 50) {
        self.state = state
        self.provider = provider
        self.after = after
        self.limit = limit
    }

    private enum CodingKeys: String, CodingKey { case state, provider, after, limit }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(state, forKey: .state)
        try c.encode(provider, forKey: .provider)
        try c.encode(after, forKey: .after)
        try c.encode(limit, forKey: .limit)
    }
}

public struct EffectListItem: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var effect: ExternalEffect
    public var id: EffectID { effect.effectId }
}

public struct EffectListPage: Hashable, Sendable, Codable {
    public var effects: [EffectListItem]
    public var nextAfter: EffectListCursor?
    public var hasMore: Bool
}

public struct EffectStateCounts: Hashable, Sendable, Codable {
    public var planned: Int
    public var sent: Int
    public var observed: Int
    public var confirmed: Int
    public var unknown: Int
    public var manualIntervention: Int
    public var rejected: Int

    private enum CodingKeys: String, CodingKey {
        case planned, sent, observed, confirmed, unknown, rejected
        case manualIntervention = "manual-intervention"
    }
}

public struct EffectPumpStatus: Hashable, Sendable, Codable {
    public var enabled: Bool
    public var lastActivityAt: IsoInstant?
    public var lastErrorMessage: String?
}

public struct EffectStatus: Hashable, Sendable, Codable {
    public var counts: EffectStateCounts
    public var pendingOutbox: Int
    public var pump: EffectPumpStatus
}
