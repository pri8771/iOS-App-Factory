import { describe, expect, it } from "vitest";

import {
  LessonV1Schema,
  LifecycleEventV1Schema,
  ModuleManifestV1Schema,
  PolicyLockV1Schema,
  ProjectManifestV1Schema,
  QualityReportV1Schema,
  ReleaseManifestV1Schema,
} from "../src/index.js";

const PROJECT_ID = "73000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "73000000-0000-4000-8000-000000000002";
const RELEASE_ID = "73000000-0000-4000-8000-000000000003";
const EVIDENCE_ID = "73000000-0000-4000-8000-000000000004";
const EVENT_ID = "73000000-0000-4000-8000-000000000005";
const LESSON_ID = "73000000-0000-4000-8000-000000000006";
const FINDING_ID = "73000000-0000-4000-8000-000000000007";
const APPROVAL_ID = "73000000-0000-4000-8000-000000000008";
const NOW = "2026-08-11T12:00:00.000Z";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function projectManifest() {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    slug: "hindsight",
    displayName: "Hindsight",
    kind: "ios",
    lifecycleStage: "building",
    repository: {
      repositoryId: REPOSITORY_ID,
      defaultBranch: "main",
      remoteUrl: "https://github.com/example/hindsight.git",
      branchPolicy: "short-lived-issue-branches",
    },
    rules: {
      authorityPath: "AGENTS.md",
      authorityDigest: DIGEST_A,
      policyLockPath: ".app-factory/policy-lock.json",
      policyDigest: DIGEST_B,
      clientEntrypoints: [
        { client: "claude", path: "CLAUDE.md", digest: DIGEST_A },
        { client: "codex", path: "AGENTS.md", digest: DIGEST_A },
      ],
    },
    protectedPaths: ["AGENTS.md", ".github/workflows/verify.yml"],
    capabilities: ["ios.build", "ios.ui-test"],
    commands: [
      {
        commandId: "unit-tests",
        purpose: "test",
        workingDirectory: ".",
        executable: "/usr/bin/xcodebuild",
        args: ["test", "-scheme", "Hindsight"],
        environmentNames: ["DEVELOPER_DIR"],
        timeoutMs: 1_200_000,
      },
    ],
    integrations: [
      {
        provider: "github",
        resourceType: "github.repository",
        resourceKey: "example/hindsight",
        credentialReference: "keychain:app-factory.github/factory",
      },
    ],
    qualityProfiles: ["quality.ios-internal-testflight-v1"],
    createdAt: NOW,
    updatedAt: NOW,
  } as const;
}

describe("platform contracts", () => {
  it("accepts a versioned project manifest and rejects duplicate protected paths", () => {
    expect(ProjectManifestV1Schema.safeParse(projectManifest()).success).toBe(true);
    const manifest = projectManifest();
    expect(
      ProjectManifestV1Schema.safeParse({
        ...manifest,
        rules: {
          ...manifest.rules,
          clientEntrypoints: [
            ...manifest.rules.clientEntrypoints,
            { client: "copilot", path: ".github/copilot-instructions.md", digest: DIGEST_A },
          ],
        },
      }).success,
    ).toBe(true);
    const invalid = projectManifest();
    expect(
      ProjectManifestV1Schema.safeParse({
        ...invalid,
        protectedPaths: ["AGENTS.md", "AGENTS.md"],
      }).success,
    ).toBe(false);
  });

  it("requires a locked authority and independently approved protected surfaces", () => {
    expect(
      PolicyLockV1Schema.safeParse({
        schemaVersion: 1,
        policyId: "factory.ios-policy",
        policyVersion: 1,
        policyDigest: DIGEST_A,
        authorityFiles: [{ path: "AGENTS.md", digest: DIGEST_B }],
        protectedSurfaces: [
          {
            path: "quality/baselines",
            classification: "baseline",
            changeApprovalAction: "quality.baseline-change",
          },
        ],
        requiredChecks: ["quality.ui-coherence"],
        generatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  it("models compile-time trusted modules without kernel/database capabilities", () => {
    expect(
      ModuleManifestV1Schema.safeParse({
        schemaVersion: 1,
        moduleId: "website.lifecycle",
        moduleVersion: "1.0.0",
        trusted: true,
        entrypoint: "dist/index.js",
        minimumKernelVersion: "0.1.0",
        configSchemaDigest: DIGEST_A,
        commands: ["website.preview-plan"],
        consumesEvents: ["release.testflight-available"],
        externalEffects: [{ provider: "website", action: "website.pull-request-create" }],
        qualityGates: ["website.structured-data"],
        dashboardPanels: ["website-preview"],
      }).success,
    ).toBe(true);
  });

  it("prevents a quality pass with failed checks or unresolved blockers", () => {
    const base = {
      schemaVersion: 1,
      reportId: EVIDENCE_ID,
      releaseId: RELEASE_ID,
      projectId: PROJECT_ID,
      candidateCommit: "a".repeat(40),
      policyDigest: DIGEST_A,
      experienceManifestDigest: DIGEST_B,
      findingIds: [FINDING_ID],
      unresolvedP0: 0,
      unresolvedP1: 0,
      generatedAt: NOW,
    } as const;
    expect(
      QualityReportV1Schema.safeParse({
        ...base,
        checks: [
          {
            checkId: "quality.ui-coherence",
            status: "passed",
            durationMs: 10,
            evidenceDigests: [DIGEST_A],
            summary: "All routes use one generation.",
          },
        ],
        verdict: "passed",
      }).success,
    ).toBe(true);
    expect(
      QualityReportV1Schema.safeParse({
        ...base,
        checks: [
          {
            checkId: "quality.ui-coherence",
            status: "failed",
            durationMs: 10,
            evidenceDigests: [DIGEST_A],
            summary: "Mixed generations.",
          },
        ],
        verdict: "passed",
      }).success,
    ).toBe(false);
  });

  it("requires archive and provider identity as release stages advance", () => {
    const base = {
      schemaVersion: 1,
      releaseId: RELEASE_ID,
      projectId: PROJECT_ID,
      profile: "quality.ios-internal-testflight-v1",
      target: "ios-internal-testflight",
      candidate: {
        commit: "a".repeat(40),
        tree: "b".repeat(40),
        cleanTree: true,
        policyDigest: DIGEST_A,
        releaseContractDigest: DIGEST_A,
        experienceManifestDigest: DIGEST_B,
        qualityReportDigest: DIGEST_A,
        evidenceManifestDigest: DIGEST_B,
        findingLedgerDigest: DIGEST_B,
      },
      ios: {
        bundleId: "com.example.hindsight",
        marketingVersion: "1.1",
        buildNumber: "5",
        testerGroup: "Internal",
      },
      metadataDigest: DIGEST_A,
      exportedArtifactDigest: null,
      internalTestFlightAvailableAt: null,
      deviceSmokeEvidenceDigest: null,
      approvals: [APPROVAL_ID],
      lifecycleEventKeys: [],
      createdAt: NOW,
      updatedAt: NOW,
    } as const;
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...base,
        stage: "candidate",
        archiveDigest: null,
        appStoreBuildId: null,
      }).success,
    ).toBe(true);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...base,
        stage: "uploaded",
        archiveDigest: DIGEST_B,
        appStoreBuildId: null,
      }).success,
    ).toBe(false);
  });

  it("binds lifecycle events and reviewed learning adoption to immutable evidence", () => {
    expect(
      LifecycleEventV1Schema.safeParse({
        schemaVersion: 1,
        eventId: EVENT_ID,
        type: "release.testflight-available",
        projectId: PROJECT_ID,
        releaseId: RELEASE_ID,
        operationKey: "app-factory:v1:release:hindsight:5",
        payloadDigest: DIGEST_A,
        policyDigest: DIGEST_B,
        evidenceDigest: DIGEST_A,
        causationEventId: null,
        emittedAt: NOW,
      }).success,
    ).toBe(true);
    expect(
      LessonV1Schema.safeParse({
        schemaVersion: 1,
        lessonId: LESSON_ID,
        title: "Reject mixed UI generations",
        sourceProjectId: PROJECT_ID,
        sourceFindingIds: [FINDING_ID],
        rootCause: "Slice checks did not inspect the whole route graph.",
        escapeMechanism: "Old and new screens were independently valid.",
        scope: "all-projects",
        regressionFixtureDigest: DIGEST_A,
        proposedPolicyDigest: DIGEST_B,
        reviewEvidenceDigest: DIGEST_A,
        status: "adopted",
        adoptedProjectIds: [PROJECT_ID],
        createdAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });
});
