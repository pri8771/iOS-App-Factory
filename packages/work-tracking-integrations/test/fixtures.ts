import {
  createProjectProvisionPlan,
  type ProjectProvisionPlanV1,
  type ProjectProvisionSpecV1,
} from "../src/index.js";

export const T0 = "2026-08-11T12:00:00.000Z";
export const T1 = "2026-08-11T12:01:00.000Z";
export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);
export const SHA_C = "c".repeat(40);

export function projectSpec(): ProjectProvisionSpecV1 {
  return {
    schemaVersion: 1,
    projectId: "71000000-0000-4000-8000-000000000001",
    projectSlug: "hindsight",
    displayName: "Hindsight",
    jira: {
      siteId: "cloud-site-1",
      projectKey: "HIND",
      projectName: "Hindsight",
      projectType: "software",
    },
    github: {
      owner: "priyansh",
      repository: "hindsight-ios",
      visibility: "private",
      defaultBranch: "main",
    },
    epics: [
      {
        logicalId: "release",
        summary: "Release safely",
        description: "Prepare the app for delivery.",
        tasks: [
          {
            logicalId: "release.testflight",
            summary: "Upload TestFlight build",
            description: "Create a verified release candidate.",
            issueType: "task",
            estimatePoints: 2,
            acceptanceCriteria: ["Build is observable", "Checks are green"],
            dependsOn: ["quality.coherence"],
          },
        ],
      },
      {
        logicalId: "quality",
        summary: "Enforce quality",
        description: "Verify the whole application.",
        tasks: [
          {
            logicalId: "quality.coherence",
            summary: "Check UI coherence",
            description: "Reject mixed old and new presentation families.",
            issueType: "story",
            estimatePoints: 3,
            acceptanceCriteria: ["No stale presentation family remains"],
            dependsOn: [],
          },
        ],
      },
    ],
  };
}

export function provisionPlan(): ProjectProvisionPlanV1 {
  return createProjectProvisionPlan(projectSpec());
}

export function jiraIssue(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    siteId: "cloud-site-1",
    issueId: "10001",
    key: "HIND-1",
    projectKey: "HIND",
    issueType: "story",
    summary: "Check UI coherence",
    description: "Reject mixed presentation families.",
    status: "In Progress",
    labels: ["quality", "ios"],
    operationMarker: `app-factory:v1:jira:issue.ensure:${"d".repeat(64)}`,
    version: 7,
    providerRevision: "etag-7",
    updatedAt: T0,
    observedAt: T1,
    ...overrides,
  };
}

export function resourceObservation(
  operation:
    ProjectProvisionPlanV1["operations"][number] | undefined = provisionPlan().operations.find(
    (item) => item.action === "jira.issue.ensure",
  ),
  overrides: Readonly<Record<string, unknown>> = {},
) {
  if (operation === undefined) throw new Error("fixture has no Jira issue operation");
  return {
    schemaVersion: 1,
    provider: operation.provider,
    resourceType: operation.action === "jira.issue.ensure" ? "jira.issue" : "provider.resource",
    providerResourceId: "10001",
    providerUrl: "https://example.atlassian.net/browse/HIND-1",
    providerRevision: "etag-1",
    operationMarker: operation.operationMarker,
    containerKey: operation.correlation.containerKey,
    logicalKey: operation.correlation.logicalKey,
    observedAt: T1,
    ...overrides,
  };
}
