import { registerFactoryModule } from "@app-factory/module-sdk";
import { describe, expect, it } from "vitest";

import { WebsiteLifecycleError, createWebsiteLifecycleModule } from "../src/index.js";

const PROJECT_ID = "74000000-0000-4000-8000-000000000001";
const RELEASE_ID = "74000000-0000-4000-8000-000000000002";
const EVENT_ID = "74000000-0000-4000-8000-000000000003";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function config() {
  return {
    schemaVersion: 1,
    repository: "example/portfolio",
    baseBranch: "main",
    statusFile: "src/data/projects.json",
    projects: [{ projectId: PROJECT_ID, slug: "hindsight", displayName: "Hindsight" }],
  } as const;
}

function lifecycleEvent(eventId = EVENT_ID) {
  return {
    schemaVersion: 1,
    eventId,
    type: "release.testflight-available",
    projectId: PROJECT_ID,
    releaseId: RELEASE_ID,
    operationKey: "app-factory:v1:release:hindsight:5",
    payloadDigest: DIGEST_A,
    policyDigest: DIGEST_A,
    evidenceDigest: DIGEST_B,
    causationEventId: null,
    emittedAt: "2026-08-11T12:00:00.000Z",
  } as const;
}

describe("website release lifecycle", () => {
  it("maps one exact event to one deterministic approval-bound PR preview", async () => {
    const module = registerFactoryModule(createWebsiteLifecycleModule(), config());
    const first = await module.consumeEvent(lifecycleEvent());
    const replay = await module.consumeEvent(lifecycleEvent());

    expect(replay).toEqual(first);
    expect(first.effects).toHaveLength(1);
    expect(first.effects[0]).toMatchObject({
      provider: "website",
      action: "website.pull-request-create",
      resourceKey: "example/portfolio",
      requiresApproval: true,
      payload: {
        branch: `factory/status/hindsight/${EVENT_ID}`,
        requestedOutcome: "pull-request-preview-only",
        mergeAuthorized: false,
        deploymentAuthorized: false,
        project: {
          lifecycleStage: "private-beta",
          publicTestFlightLink: null,
        },
        provenance: {
          lifecycleEventId: EVENT_ID,
          releaseId: RELEASE_ID,
          lifecyclePayloadDigest: DIGEST_A,
          releaseEvidenceDigest: DIGEST_B,
        },
      },
    });
    expect(JSON.stringify(first)).not.toMatch(/tester|testflight\.apple|https?:\/\//i);
  });

  it("changes the operation marker for a distinct lifecycle event", async () => {
    const module = registerFactoryModule(createWebsiteLifecycleModule(), config());
    const first = await module.consumeEvent(lifecycleEvent());
    const second = await module.consumeEvent(
      lifecycleEvent("74000000-0000-4000-8000-000000000004"),
    );
    expect(second.effects[0]?.operationMarker).not.toBe(first.effects[0]?.operationMarker);
  });

  it("rejects an event for a project not explicitly enrolled in the website", async () => {
    const module = registerFactoryModule(createWebsiteLifecycleModule(), config());
    await expect(
      module.consumeEvent({
        ...lifecycleEvent(),
        projectId: "74000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow(WebsiteLifecycleError);
  });

  it("rejects duplicate mappings and unexpected credential-like configuration", () => {
    expect(() =>
      registerFactoryModule(createWebsiteLifecycleModule(), {
        ...config(),
        projects: [...config().projects, ...config().projects],
      }),
    ).toThrow(/unique/);
    expect(() =>
      registerFactoryModule(createWebsiteLifecycleModule(), {
        ...config(),
        apiToken: "do-not-accept",
      }),
    ).toThrow();
  });

  it("accepts only evidence that proves private-beta structured data has no internal link", async () => {
    const module = registerFactoryModule(createWebsiteLifecycleModule(), config());
    const valid = {
      schemaVersion: 1,
      projectId: PROJECT_ID,
      lifecycleEventId: EVENT_ID,
      candidateCommit: "a".repeat(40),
      status: "private-beta",
      structuredDataDigest: DIGEST_A,
      previewEvidenceDigest: DIGEST_B,
      containsInternalTestFlightLink: false,
      checkedAt: "2026-08-11T13:00:00.000Z",
    } as const;
    await expect(module.runQualityGate("website.structured-data", valid)).resolves.toMatchObject({
      status: "passed",
      evidenceDigests: [DIGEST_A, DIGEST_B],
    });
    await expect(
      module.runQualityGate("website.structured-data", {
        ...valid,
        containsInternalTestFlightLink: true,
      }),
    ).rejects.toThrow();
  });
});
