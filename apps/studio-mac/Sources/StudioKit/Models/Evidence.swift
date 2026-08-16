import Foundation

// MARK: - Evidence (evidence.ts + the evidence.* command results in command-protocol.ts)

public enum EvidenceKind: String, Hashable, Sendable, Codable, CaseIterable {
    case agentRun = "agent-run"
    case verification
    case review
    case commit
    case eventLog = "event-log"
}

public struct EvidenceSubject: Hashable, Sendable, Codable {
    public var taskSpecDigest: Sha256Digest
    public var policyDigest: Sha256Digest
    public var baseCommit: GitObjectID
    public var candidateTree: GitObjectID?
    public var fence: Int

    public init(taskSpecDigest: Sha256Digest, policyDigest: Sha256Digest, baseCommit: GitObjectID,
                candidateTree: GitObjectID?, fence: Int) {
        self.taskSpecDigest = taskSpecDigest
        self.policyDigest = policyDigest
        self.baseCommit = baseCommit
        self.candidateTree = candidateTree
        self.fence = fence
    }
}

/// `EvidenceManifestDescriptorV1` — one row of evidence.list.
public struct EvidenceManifestDescriptor: Hashable, Sendable, Codable, Identifiable {
    public var attemptId: AttemptID
    public var createdAt: IsoInstant
    public var manifestDigest: Sha256Digest
    public var subject: EvidenceSubject
    public var entryCount: Int
    public var requiredKinds: [EvidenceKind]

    public var id: AttemptID { attemptId }

    public init(attemptId: AttemptID, createdAt: IsoInstant, manifestDigest: Sha256Digest,
                subject: EvidenceSubject, entryCount: Int, requiredKinds: [EvidenceKind]) {
        self.attemptId = attemptId
        self.createdAt = createdAt
        self.manifestDigest = manifestDigest
        self.subject = subject
        self.entryCount = entryCount
        self.requiredKinds = requiredKinds
    }
}

public struct EvidenceListPage: Hashable, Sendable, Codable {
    public var manifests: [EvidenceManifestDescriptor]
    public var nextAfterAttemptId: AttemptID?
    public var hasMore: Bool

    public init(manifests: [EvidenceManifestDescriptor], nextAfterAttemptId: AttemptID?, hasMore: Bool) {
        self.manifests = manifests
        self.nextAfterAttemptId = nextAfterAttemptId
        self.hasMore = hasMore
    }
}

public struct EvidenceManifestEntry: Hashable, Sendable, Codable {
    public var evidenceId: EvidenceID
    public var digest: Sha256Digest
    public init(evidenceId: EvidenceID, digest: Sha256Digest) {
        self.evidenceId = evidenceId
        self.digest = digest
    }
}

/// `EvidenceManifestV1` — evidence.inspect.
public struct EvidenceManifest: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var attemptId: AttemptID
    public var createdAt: IsoInstant
    public var subject: EvidenceSubject
    public var entries: [EvidenceManifestEntry]
    public var requiredKinds: [EvidenceKind]

    public init(attemptId: AttemptID, createdAt: IsoInstant, subject: EvidenceSubject,
                entries: [EvidenceManifestEntry], requiredKinds: [EvidenceKind]) {
        self.attemptId = attemptId
        self.createdAt = createdAt
        self.subject = subject
        self.entries = entries
        self.requiredKinds = requiredKinds
    }
}

public struct EvidenceInspectResult: Hashable, Sendable, Codable {
    public var manifest: EvidenceManifest
    public var manifestDigest: Sha256Digest
}

/// `EvidenceItemVerificationV1`.
public struct EvidenceItemVerification: Hashable, Sendable, Codable, Identifiable {
    public var evidenceId: EvidenceID
    public var digest: Sha256Digest
    public var kind: EvidenceKind
    public var createdAt: IsoInstant
    public var producer: NamespacedCode
    public var artifactCount: Int
    public var id: EvidenceID { evidenceId }
}

public struct EvidenceVerifyResult: Hashable, Sendable, Codable {
    /// Always `true` on the wire; a verify that fails is a protocol error, not a `false`.
    public var integrityVerified: Bool
    public var manifest: EvidenceManifestDescriptor
    public var evidence: [EvidenceItemVerification]
    public var artifactCount: Int
}
