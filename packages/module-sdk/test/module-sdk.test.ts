import { describe, expect, it, vi } from "vitest";

import {
  ModuleContractError,
  ModuleRegistry,
  registerFactoryModule,
  type FactoryModule,
} from "../src/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const PROJECT_ID = "74000000-0000-4000-8000-000000000001";
const RELEASE_ID = "74000000-0000-4000-8000-000000000002";
const EVENT_ID = "74000000-0000-4000-8000-000000000003";

function manifest() {
  return {
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
  } as const;
}

function lifecycleEvent() {
  return {
    schemaVersion: 1,
    eventId: EVENT_ID,
    type: "release.testflight-available",
    projectId: PROJECT_ID,
    releaseId: RELEASE_ID,
    operationKey: "app-factory:v1:release:hindsight:5",
    payloadDigest: DIGEST_A,
    policyDigest: DIGEST_A,
    evidenceDigest: DIGEST_A,
    causationEventId: null,
    emittedAt: "2026-08-11T12:00:00.000Z",
  } as const;
}

function websiteModule(): FactoryModule {
  return {
    manifest: manifest(),
    parseConfig(value) {
      return value as never;
    },
    commands: {
      "website.preview-plan": async (input) => ({
        summary: "Preview planned.",
        output: input,
        effects: [],
      }),
    },
    eventConsumers: {
      "release.testflight-available": async (event, context) => ({
        summary: "A review-only website PR was planned.",
        effects: [
          {
            provider: "website",
            action: "website.pull-request-create",
            resourceType: "website.repository",
            resourceKey: String((context.config as { repository: string }).repository),
            payload: { projectId: event.projectId, stage: "private-beta" },
            requiresApproval: true,
          },
        ],
      }),
    },
    qualityGates: {
      "website.structured-data": async () => ({
        status: "passed",
        summary: "Structured data is valid.",
        evidenceDigests: [DIGEST_A],
      }),
    },
  };
}

describe("module SDK", () => {
  it("turns one lifecycle event into one deterministic approval-bound effect", async () => {
    const module = registerFactoryModule(websiteModule(), {
      repository: "example/site",
      credentialReference: "keychain:website/factory",
    });
    const first = await module.consumeEvent(lifecycleEvent());
    const second = await module.consumeEvent(lifecycleEvent());
    expect(first).toEqual(second);
    expect(first.effects).toHaveLength(1);
    expect(first.effects[0]).toMatchObject({
      provider: "website",
      requiresApproval: true,
      resourceKey: "example/site",
    });
    expect(first.effects[0]?.operationMarker).toMatch(/^app-factory:v1:module:[0-9a-f]{64}$/);
  });

  it("rejects undeclared effects and secret-bearing configuration", async () => {
    expect(() => registerFactoryModule(websiteModule(), { api_token: "secret" })).toThrow(
      /looks like a secret/,
    );
    const module = registerFactoryModule(
      {
        ...websiteModule(),
        eventConsumers: {
          "release.testflight-available": async () => ({
            summary: "Bad effect.",
            effects: [
              {
                provider: "email",
                action: "email.campaign-send",
                resourceType: "email.list",
                resourceKey: "all",
                payload: {},
                requiresApproval: true,
              },
            ],
          }),
        },
      },
      { repository: "example/site" },
    );
    await expect(module.consumeEvent(lifecycleEvent())).rejects.toThrow(/undeclared effect/);
  });

  it("requires handler declarations to exactly match the manifest", () => {
    expect(() =>
      registerFactoryModule({ ...websiteModule(), commands: {} }, { repository: "example/site" }),
    ).toThrow(/do not exactly match/);
  });

  it("routes unique commands/events and rejects registry collisions", () => {
    const registry = new ModuleRegistry();
    const registered = registry.register(websiteModule(), { repository: "example/site" });
    expect(registry.moduleForCommand("website.preview-plan")).toBe(registered);
    expect(registry.modulesConsuming("release.testflight-available")).toEqual([registered]);
    expect(() => registry.register(websiteModule(), { repository: "other/site" })).toThrow();
  });

  it("validates quality evidence and does not expose persistence to handlers", async () => {
    const gate = vi.fn(websiteModule().qualityGates["website.structured-data"]);
    if (gate === undefined) throw new Error("quality gate fixture missing");
    const module = registerFactoryModule(
      { ...websiteModule(), qualityGates: { "website.structured-data": gate } },
      { repository: "example/site" },
    );
    await expect(module.runQualityGate("website.structured-data", {})).resolves.toMatchObject({
      status: "passed",
      evidenceDigests: [DIGEST_A],
    });
    const context = gate.mock.calls[0]?.[1];
    expect(context).toEqual({
      moduleId: "website.lifecycle",
      moduleVersion: "1.0.0",
      config: { repository: "example/site" },
    });
    expect(context).not.toHaveProperty("database");
    expect(context).not.toHaveProperty("credentials");
    expect(ModuleContractError).toBeDefined();
  });
});
