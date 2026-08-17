import Foundation

// MARK: - project.seed
//
// The from-scratch entry point for the planner's "seed-repo" template item. Given a target
// directory that must not exist or be empty, the daemon creates a brand-new local repository (Git
// init, an XcodeGen `project.yml` plus a unit test target, a GitHub Actions workflow, one passing
// XCTest, README, `docs/STATUS.md`, `.app-factory/project.json`), commits it, then runs the same
// enrollment scan-and-apply `project.scan`/`project.apply` already perform on it so the result is a
// converged enrolled project, not just a pile of files.

public struct ProjectSeedPayload: Hashable, Sendable, Codable {
    public var targetDirectory: AbsolutePath
    public var name: String
    public init(targetDirectory: AbsolutePath, name: String) {
        self.targetDirectory = targetDirectory
        self.name = name
    }
}

/// `xcodegen` reflects `which xcodegen`: when unavailable, `generated`/`built` are both `false` and
/// `detail` says so plainly rather than silently skipping the step. Nothing is ever installed.
public struct ProjectSeedToolchainStep: Hashable, Sendable, Codable {
    public var available: Bool
    public var generated: Bool
    public var built: Bool
    public var detail: String

    public init(available: Bool, generated: Bool, built: Bool, detail: String) {
        self.available = available
        self.generated = generated
        self.built = built
        self.detail = detail
    }
}

public struct ProjectSeedResult: Hashable, Sendable, Codable {
    public struct Enrollment: Hashable, Sendable, Codable {
        public var branchName: GitBranchName?
        public var commitSha: GitObjectID?
        public var appliedActionKinds: [EnrollmentActionKind]
        public var convergence: ProjectApplyConvergence

        public init(branchName: GitBranchName?, commitSha: GitObjectID?, appliedActionKinds: [EnrollmentActionKind],
                    convergence: ProjectApplyConvergence) {
            self.branchName = branchName
            self.commitSha = commitSha
            self.appliedActionKinds = appliedActionKinds
            self.convergence = convergence
        }

        private enum CodingKeys: String, CodingKey { case branchName, commitSha, appliedActionKinds, convergence }

        public func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(branchName, forKey: .branchName)
            try c.encode(commitSha, forKey: .commitSha)
            try c.encode(appliedActionKinds, forKey: .appliedActionKinds)
            try c.encode(convergence, forKey: .convergence)
        }
    }

    public var repositoryRoot: AbsolutePath
    public var scaffoldCommitSha: GitObjectID
    public var planDigest: Sha256Digest
    public var enrollment: Enrollment
    public var xcodegen: ProjectSeedToolchainStep

    public init(repositoryRoot: AbsolutePath, scaffoldCommitSha: GitObjectID, planDigest: Sha256Digest,
                enrollment: Enrollment, xcodegen: ProjectSeedToolchainStep) {
        self.repositoryRoot = repositoryRoot
        self.scaffoldCommitSha = scaffoldCommitSha
        self.planDigest = planDigest
        self.enrollment = enrollment
        self.xcodegen = xcodegen
    }
}
