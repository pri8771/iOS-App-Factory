import Foundation

// MARK: - Project enrollment wire types (command-protocol.ts `project.*`)
//
// These are the daemon's deliberately narrow mirror of project-sdk's plan/action/issue fields; the
// issue and action id patterns are `esi-<24 hex>` and `epa-<24 hex>`.

public enum EnrollmentActionKind: String, Hashable, Sendable, Codable, CaseIterable {
    case resolvePathSafety = "resolve-path-safety"
    case resolveSecretMaterial = "resolve-secret-material"
    case establishRuleAuthority = "establish-rule-authority"
    case repairRuleAdapter = "repair-rule-adapter"
    case resolveRuleConflict = "resolve-rule-conflict"
    case adoptOrMigrateLegacyLayout = "adopt-or-migrate-legacy-layout"
    case declareProject = "declare-project"
    case repairProjectManifest = "repair-project-manifest"
    case declareExperience = "declare-experience"
    case repairExperienceManifest = "repair-experience-manifest"
    case createXcodeContainer = "create-xcode-container"
    case shareXcodeScheme = "share-xcode-scheme"
    case addSwiftSource = "add-swift-source"
    case addTestTarget = "add-test-target"
    case addUITestTarget = "add-ui-test-target"
    case addCIVerification = "add-ci-verification"
}

public enum EnrollmentPhase: String, Hashable, Sendable, Codable, CaseIterable {
    case safety, compatibility, authority, project, quality, automation
}

public struct EnrollmentBlocker: Hashable, Sendable, Codable, Identifiable {
    public var issueId: String
    public var code: NamespacedCode
    public var summary: String
    public var id: String { issueId }

    public init(issueId: String, code: NamespacedCode, summary: String) {
        self.issueId = issueId
        self.code = code
        self.summary = summary
    }
}

public struct EnrollmentPlanAction: Hashable, Sendable, Codable, Identifiable {
    public var actionId: String
    public var phase: EnrollmentPhase
    public var kind: EnrollmentActionKind
    public var targetPath: RelativePath?
    public var reason: String
    public var resolvesIssueIds: [String]
    public var id: String { actionId }
}

public struct EnrollmentPlan: Hashable, Sendable, Codable {
    public var schemaVersion: SchemaVersion1 = .init()
    /// Always "proposal-only".
    public var mode: String
    /// Always `true`.
    public var requiresSourceRevalidation: Bool
    public var sourceFingerprint: Sha256Digest
    public var inventoryDigest: Sha256Digest
    public var blocked: Bool
    public var blockerIssueIds: [String]
    public var actions: [EnrollmentPlanAction]
}

public struct EnrollmentSkippedAction: Hashable, Sendable, Codable, Identifiable {
    public var actionId: String
    public var kind: EnrollmentActionKind
    public var targetPath: RelativePath?
    public var reason: String
    public var id: String { actionId }
}

/// `ProjectScanCommandResultV1`. `planDigest` identifies the daemon's persisted scan record and is the
/// handle `project.enroll-plan` / `project.apply` take.
public struct ProjectScanResult: Hashable, Sendable, Codable {
    public var repositoryRoot: AbsolutePath
    public var planDigest: Sha256Digest
    public var sourceFingerprint: Sha256Digest
    public var inventoryDigest: Sha256Digest
    public var blocked: Bool
    public var blockers: [EnrollmentBlocker]
}

public struct ProjectEnrollPlanResult: Hashable, Sendable, Codable {
    public var planDigest: Sha256Digest
    public var repositoryRoot: AbsolutePath
    public var plan: EnrollmentPlan
}

public struct ProjectApplyConvergence: Hashable, Sendable, Codable {
    public var blocked: Bool
    public var blockerIssueIds: [String]
    public var openIssueCount: Int
    public var sourceFingerprint: Sha256Digest
}

public struct ProjectApplyResult: Hashable, Sendable, Codable {
    public var repositoryRoot: AbsolutePath
    public var baseHeadSha: GitObjectID
    public var branchName: GitBranchName?
    public var commitSha: GitObjectID?
    public var appliedActionKinds: [EnrollmentActionKind]
    public var resolvedIssueIds: [String]
    public var skippedActions: [EnrollmentSkippedAction]
    public var convergence: ProjectApplyConvergence
}
