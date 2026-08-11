import { describe, expect, it } from "vitest";

import {
  createProjectProvisionPlan,
  digestCanonical,
  normalizeCapabilityPreflight,
  parseCrossProjectWorkPackage,
  parseProviderPreflightSnapshot,
  requiredCapabilitiesForProvisioning,
} from "../src/index.js";
import { projectSpec, T0 } from "./fixtures.js";

function availableSnapshot(provider: "jira" | "github", capabilities: readonly string[]) {
  return {
    schemaVersion: 1,
    provider,
    adapterId: `${provider}.rest`,
    adapterVersion: "1.0.0",
    checkedAt: T0,
    credentialReference: {
      schemaVersion: 1,
      kind: "macos-keychain",
      service: `app-factory.${provider}`,
      account: "factory",
    },
    capabilities: capabilities.map((capability) => ({
      capability,
      state: "available",
      reasonCode: null,
      detail: `${capability} is available.`,
    })),
  };
}

describe("deterministic project provisioning", () => {
  it("creates stable, dependency-explicit operations regardless of input order", () => {
    const spec = projectSpec();
    const first = createProjectProvisionPlan(spec);
    const reordered = createProjectProvisionPlan({
      ...spec,
      epics: [...spec.epics]
        .reverse()
        .map((epic) => ({ ...epic, tasks: [...epic.tasks].reverse() })),
    });

    expect(reordered).toEqual(first);
    expect(createProjectProvisionPlan({ ...spec, displayName: "Hindsight Beta" }).planId).not.toBe(
      first.planId,
    );
    expect(first.operations).toHaveLength(8);
    expect(new Set(first.operations.map((operation) => operation.operationMarker)).size).toBe(8);
    expect(
      first.operations.every((operation) =>
        operation.operationMarker.startsWith(`app-factory:v1:${operation.provider}:`),
      ),
    ).toBe(true);
    expect(
      first.operations.every(
        (operation) => digestCanonical(operation.payload) === operation.payloadDigest,
      ),
    ).toBe(true);

    const operationIds = new Set(first.operations.map((operation) => operation.operationId));
    expect(
      first.operations.every((operation) =>
        operation.dependsOnOperationIds.every((dependency) => operationIds.has(dependency)),
      ),
    ).toBe(true);
    const release = first.operations.find(
      (operation) => operation.correlation.logicalKey === "release.testflight",
    );
    const coherence = first.operations.find(
      (operation) => operation.correlation.logicalKey === "quality.coherence",
    );
    expect(release?.dependsOnOperationIds).toContain(coherence?.operationId);
    expect(first.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "jira.issue-link.ensure",
          payload: expect.objectContaining({
            inwardLogicalId: "quality.coherence",
            outwardLogicalId: "release.testflight",
            linkType: "blocks",
          }),
        }),
      ]),
    );
  });

  it("enforces small tasks, known dependencies, and an acyclic graph", () => {
    const spec = projectSpec();
    expect(() =>
      createProjectProvisionPlan({
        ...spec,
        epics: spec.epics.map((epic, index) =>
          index === 0
            ? {
                ...epic,
                tasks: epic.tasks.map((task) => ({ ...task, estimatePoints: 4 })),
              }
            : epic,
        ),
      }),
    ).toThrow(/task estimate/);

    const cyclic = {
      ...spec,
      epics: spec.epics.map((epic) => ({
        ...epic,
        tasks: epic.tasks.map((task) => ({
          ...task,
          dependsOn:
            task.logicalId === "quality.coherence" ? ["release.testflight"] : ["quality.coherence"],
        })),
      })),
    };
    expect(() => createProjectProvisionPlan(cyclic)).toThrow(/cycle/);
  });
});

describe("capability preflight normalization", () => {
  it("normalizes complete provider reports into a sorted ready matrix", () => {
    const required = requiredCapabilitiesForProvisioning();
    const jira = availableSnapshot(
      "jira",
      required.filter((item) => item.provider === "jira").map((item) => item.capability),
    );
    const github = availableSnapshot(
      "github",
      required.filter((item) => item.provider === "github").map((item) => item.capability),
    );
    const normalized = normalizeCapabilityPreflight([jira, github], [...required].reverse());
    expect(normalized.ready).toBe(true);
    expect(normalized.capabilities.map((item) => `${item.provider}:${item.capability}`)).toEqual(
      [...normalized.capabilities].map((item) => `${item.provider}:${item.capability}`).sort(),
    );
  });

  it("fails closed for missing reports or unreported capabilities", () => {
    const required = requiredCapabilitiesForProvisioning();
    const normalized = normalizeCapabilityPreflight(
      [availableSnapshot("jira", ["jira.project.create"])],
      required,
    );
    expect(normalized.ready).toBe(false);
    expect(
      normalized.capabilities.some((item) => item.blockerCode === "preflight.provider-missing"),
    ).toBe(true);
    expect(
      normalized.capabilities.some(
        (item) => item.blockerCode === "preflight.capability-unreported",
      ),
    ).toBe(true);
  });

  it("accepts only credential references and rejects embedded credential values", () => {
    const snapshot = availableSnapshot("github", ["github.repository.read"]);
    expect(parseProviderPreflightSnapshot(snapshot).credentialReference).toEqual(
      snapshot.credentialReference,
    );
    expect(() =>
      parseProviderPreflightSnapshot({
        ...snapshot,
        credentialReference: { ...snapshot.credentialReference, token: "secret-value" },
      }),
    ).toThrow(/unexpected or missing fields/);
    expect(JSON.stringify(parseProviderPreflightSnapshot(snapshot))).not.toContain("secret-value");
  });
});

describe("cross-project work packages", () => {
  it("normalizes a shared website/app outcome without duplicating ownership", () => {
    const appProjectId = "71000000-0000-4000-8000-000000000001";
    const webProjectId = "71000000-0000-4000-8000-000000000002";
    const input = {
      schemaVersion: 1,
      packageId: "71000000-0000-4000-8000-000000000003",
      title: "Hindsight launch SEO",
      objective: "Ship indexed app pages and consistent launch metadata.",
      participants: [
        {
          projectId: webProjectId,
          role: "contributor",
          jiraSiteId: "cloud-site-1",
          jiraProjectKey: "WEB",
          githubRepository: "priyansh/website",
        },
        {
          projectId: appProjectId,
          role: "coordinator",
          jiraSiteId: "cloud-site-1",
          jiraProjectKey: "HIND",
          githubRepository: "priyansh/hindsight-ios",
        },
      ],
      workItems: [
        {
          logicalId: "website.page",
          projectId: webProjectId,
          summary: "Publish app page",
          expectedOutcome: "The app has one canonical indexable page.",
          dependsOnWorkItemIds: ["app.metadata"],
          jiraIssuePin: null,
        },
        {
          logicalId: "app.metadata",
          projectId: appProjectId,
          summary: "Finalize metadata",
          expectedOutcome: "Approved product metadata is available.",
          dependsOnWorkItemIds: [],
          jiraIssuePin: null,
        },
      ],
    };
    const first = parseCrossProjectWorkPackage(input);
    const reordered = parseCrossProjectWorkPackage({
      ...input,
      participants: [...input.participants].reverse(),
      workItems: [...input.workItems].reverse(),
    });
    expect(reordered).toEqual(first);
    expect(first.participants).toHaveLength(2);
    expect(first.workItems.find((item) => item.logicalId === "website.page")?.projectId).toBe(
      webProjectId,
    );

    expect(() =>
      parseCrossProjectWorkPackage({
        ...input,
        workItems: input.workItems.filter((item) => item.projectId === appProjectId),
      }),
    ).toThrow(/has no owned work item/);
  });
});
