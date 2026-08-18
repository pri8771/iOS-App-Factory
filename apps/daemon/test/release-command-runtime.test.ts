import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
  canonicalAscReleaseObservationDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  type CommandRequestV1,
} from "@app-factory/contracts";
import type {
  BoundedProviderHttpTransport,
  ProviderHttpRequestV1,
} from "@app-factory/provider-http-adapters";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";
import {
  INERT_RELEASE_OBSERVER_PORT,
  createAscReleaseObserverPort,
  parseAscObserverConfigV1,
  type AscObserverConfigV1,
} from "../src/release-command-runtime.js";
import { CommandHandlerError } from "../src/unix-command-server.js";

const T0 = "2026-08-18T02:26:00.000Z";
const T1 = "2026-08-18T02:26:05.000Z";
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const ASC_ORIGIN = "https://api.appstoreconnect.apple.com";

const CONFIG: AscObserverConfigV1 = parseAscObserverConfigV1({
  schemaVersion: 1,
  keyId: "HGUBSYYP6G",
  issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
  credentialReference: {
    schemaVersion: 1,
    kind: "macos-keychain",
    service: "app-factory-asc-key",
    account: "HGUBSYYP6G",
  },
});

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function commandId(suffix: number): string {
  return `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  suffix: number,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: commandId(suffix),
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-release-runtime-"));
  roots.push(root);
  return root;
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-release-test",
    startedAt: T0,
    now: () => T0,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// In-memory App Store Connect (mirrors packages/asc-adapter/test/observer.test.ts): serves JSON:API
// fixtures keyed by pathname+search, records every request, and never sees a credential header.
// ---------------------------------------------------------------------------

type Fixture = Readonly<{ status: number; body: unknown }>;

function memoryTransport(routes: Record<string, Fixture>) {
  const requests: ProviderHttpRequestV1[] = [];
  const transport: BoundedProviderHttpTransport = {
    request: async (request: ProviderHttpRequestV1) => {
      requests.push(request);
      const url = new URL(request.url);
      const key = `${url.pathname}${url.search}`;
      const route = routes[key];
      if (route === undefined) throw new Error(`unrouted ${key}`);
      return {
        schemaVersion: 1 as const,
        status: route.status,
        headers: [{ name: "content-type", value: "application/json" }],
        body: Uint8Array.from(Buffer.from(JSON.stringify(route.body), "utf8")),
      };
    },
  };
  return { transport, requests };
}

function appResource(id: string, bundleId: string, name: string) {
  return {
    type: "apps",
    id,
    attributes: { bundleId, name, sku: null, primaryLocale: "en-US" },
    links: { self: `${ASC_ORIGIN}/v1/apps/${id}` },
  };
}

function buildResource(id: string, version: string, uploadedDate: string) {
  return {
    type: "builds",
    id,
    attributes: { version, uploadedDate, processingState: "VALID", expired: false },
    relationships: {
      buildBetaDetail: { data: { type: "buildBetaDetails", id: `bbd-${id}` } },
      preReleaseVersion: { data: { type: "preReleaseVersions", id: `prv-${id}` } },
    },
  };
}

function betaDetail(id: string, internal: string) {
  return {
    type: "buildBetaDetails",
    id: `bbd-${id}`,
    attributes: { internalBuildState: internal, externalBuildState: "READY_FOR_BETA_SUBMISSION" },
  };
}

function preRelease(id: string, version: string) {
  return { type: "preReleaseVersions", id: `prv-${id}`, attributes: { version, platform: "IOS" } };
}

function versionResource(id: string, versionString: string, state: string) {
  return {
    type: "appStoreVersions",
    id,
    attributes: {
      platform: "IOS",
      versionString,
      appStoreState: state,
      appVersionState: state,
      createdDate: "2026-08-09T00:00:00Z",
    },
  };
}

function buildsKey(appId: string, limit = 5): string {
  return `/v1/builds?filter%5Bapp%5D=${appId}&sort=-uploadedDate&limit=${String(limit)}&include=buildBetaDetail%2CpreReleaseVersion`;
}

function versionsKey(appId: string): string {
  return `/v1/apps/${appId}/appStoreVersions?limit=200`;
}

const HINDSIGHT = "1001";
const ROAM = "1003";

function portfolioRoutes(): Record<string, Fixture> {
  return {
    "/v1/apps?limit=200": {
      status: 200,
      body: {
        data: [
          appResource(ROAM, "com.priyanshchordia.roam", "Roam"),
          appResource(HINDSIGHT, "com.priyanshchordia.hindsight", "Hindsight"),
        ],
        links: { self: `${ASC_ORIGIN}/v1/apps` },
      },
    },
    [buildsKey(HINDSIGHT)]: {
      status: 200,
      body: {
        data: [buildResource("b4", "4", "2026-08-10T10:00:00-07:00")],
        included: [betaDetail("b4", "IN_BETA_TESTING"), preRelease("b4", "1.0")],
        links: { self: "x" },
      },
    },
    [versionsKey(HINDSIGHT)]: {
      status: 200,
      body: {
        data: [versionResource("v1", "1.0", "PREPARE_FOR_SUBMISSION")],
        links: { self: "x" },
      },
    },
    [buildsKey(ROAM)]: { status: 200, body: { data: [], links: { self: "x" } } },
    [versionsKey(ROAM)]: {
      status: 403,
      body: { errors: [{ status: "403", code: "FORBIDDEN_ERROR", detail: "role" }] },
    },
  };
}

describe("release.* command boundary", () => {
  it("serves an honest empty projection with the observer inert, and refuses to observe", async () => {
    const runtime = await openRuntime(await makeRoot());
    const projection = await invoke(runtime, request("release.projection", 1, {}));
    expect(projection).toMatchObject({
      operation: "release.projection",
      projection: {
        schemaVersion: 1,
        observer: {
          configured: false,
          unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
          source: null,
        },
        latest: null,
        observationCount: 0,
        generatedAt: T0,
      },
    });
    if (projection.operation !== "release.projection") throw new Error("unreachable");
    expect(projection.projection.sourceDigest).toBe(
      sha256(canonicalReleaseProjectionDigestInputV1(projection.projection)),
    );

    await expect(
      invoke(runtime, request("release.observe", 2, { buildsLimit: 5 })),
    ).rejects.toMatchObject({
      name: CommandHandlerError.name,
      code: "release.observer-not-configured",
      retryable: false,
    });
    // Nothing was persisted or journaled by the refusal.
    expect(await invoke(runtime, request("release.projection", 3, {}))).toMatchObject({
      projection: { observationCount: 0, latest: null },
    });
  });

  it("observes through the composed port (GET only, credential-free transport), persists, and projects", async () => {
    const { transport, requests } = memoryTransport(portfolioRoutes());
    const clockValues = [T0, T1];
    const runtime = await openRuntime(await makeRoot(), {
      now: () => clockValues[0] ?? T1,
      releaseObserver: createAscReleaseObserverPort({
        config: CONFIG,
        transport,
        now: () => new Date(T0),
      }),
    });

    const observed = await invoke(runtime, request("release.observe", 10, { buildsLimit: 5 }));
    if (observed.operation !== "release.observe") throw new Error("unreachable");
    const { observation } = observed;

    // Wire truth: only GETs, no credential ever handed to the transport, one exchange per route.
    expect(requests.map((entry) => entry.method)).toEqual(["GET", "GET", "GET", "GET", "GET"]);
    for (const entry of requests) {
      expect(entry.headers.some((header) => /authorization|cookie/i.test(header.name))).toBe(false);
      expect(entry.credentialOrigin).toBe(ASC_ORIGIN);
    }
    expect(observation).toMatchObject({
      schemaVersion: 1,
      observedAt: T0,
      source: {
        keyId: "HGUBSYYP6G",
        issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
        keychainService: "app-factory-asc-key",
        keychainAccount: "HGUBSYYP6G",
        origin: ASC_ORIGIN,
      },
      apps: { kind: "observed", status: 200, pages: 1 },
      requestCount: 5,
      statuses: [200, 200, 200, 200, 403],
    });
    // Canonical order (by name), and the projection surfaces RELEASE_STAGE_ORDER_V1 unchanged.
    expect(observation.appObservations.map(({ app }) => app.name)).toEqual(["Hindsight", "Roam"]);
    const [hindsight, roam] = observation.appObservations;
    if (hindsight === undefined || roam === undefined) throw new Error("expected two apps");
    expect(hindsight.builds).toEqual({
      kind: "observed",
      status: 200,
      pages: 1,
      code: null,
      detail: null,
    });
    expect(hindsight.projection).toMatchObject({
      projectedStage: "internal-testflight-available",
      projectionBasis: "build-in-internal-testing",
      uploadedAt: "2026-08-10T17:00:00.000Z",
      latestBuild: { buildNumber: "4", marketingVersion: "1.0" },
      latestAppStoreVersion: { versionString: "1.0", appVersionState: "PREPARE_FOR_SUBMISSION" },
    });
    // Roam: builds observed (none), versions denied by role -> no projection, honest per-read outcome.
    expect(roam.builds).toMatchObject({ kind: "observed", status: 200 });
    expect(roam.appStoreVersions).toMatchObject({
      kind: "denied",
      status: 403,
      code: "asc.forbidden",
    });
    expect(roam.projection).toBeNull();
    expect(observation.observationDigest).toBe(
      sha256(canonicalAscReleaseObservationDigestInputV1(observation)),
    );

    // Same command replays byte-equivalently WITHOUT a second observation.
    expect(await invoke(runtime, request("release.observe", 10, { buildsLimit: 5 }))).toEqual(
      observed,
    );
    expect(requests).toHaveLength(5);

    // The projection now serves it as latest, with the observer configured.
    clockValues.shift();
    const projection = await invoke(runtime, request("release.projection", 11, {}));
    expect(projection).toMatchObject({
      operation: "release.projection",
      projection: {
        observer: { configured: true, unavailableReason: null, source: { keyId: "HGUBSYYP6G" } },
        latest: { observationId: observation.observationId },
        observationCount: 1,
        generatedAt: T1,
      },
    });

    // A fresh command takes a fresh observation and becomes the new latest.
    const again = await invoke(runtime, request("release.observe", 12, { buildsLimit: 5 }, T1));
    if (again.operation !== "release.observe") throw new Error("unreachable");
    expect(again.observation.observationId).not.toBe(observation.observationId);
    expect(requests).toHaveLength(10);
    expect(await invoke(runtime, request("release.projection", 13, {}))).toMatchObject({
      projection: {
        observationCount: 2,
        latest: { observationId: again.observation.observationId },
      },
    });
  });

  it("survives a daemon restart: persisted observations outlive the composed observer", async () => {
    const root = await makeRoot();
    const { transport } = memoryTransport(portfolioRoutes());
    const configured = await openRuntime(root, {
      releaseObserver: createAscReleaseObserverPort({
        config: CONFIG,
        transport,
        now: () => new Date(T0),
      }),
    });
    const observed = await invoke(configured, request("release.observe", 20, { buildsLimit: 5 }));
    if (observed.operation !== "release.observe") throw new Error("unreachable");
    configured.close();

    const unconfigured = await openRuntime(root, {
      now: () => T1,
      releaseObserver: INERT_RELEASE_OBSERVER_PORT,
    });
    expect(await invoke(unconfigured, request("release.projection", 21, {}))).toMatchObject({
      projection: {
        observer: {
          configured: false,
          unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
        },
        latest: { observationId: observed.observation.observationId, observedAt: T0 },
        observationCount: 1,
        generatedAt: T1,
      },
    });
  });

  it("maps an observer failure to a retryable release.observe-failed without persisting anything", async () => {
    const runtime = await openRuntime(await makeRoot(), {
      releaseObserver: {
        status: () => ({ configured: true, unavailableReason: null, source: null as never }),
        observe: () => Promise.reject(new Error("socket hang up")),
      },
    });
    await expect(
      invoke(runtime, request("release.observe", 30, { buildsLimit: 5 })),
    ).rejects.toMatchObject({ code: "release.observe-failed", retryable: true });
  });
});

describe("parseAscObserverConfigV1", () => {
  it("accepts the documented shape with defaults and rejects drift", () => {
    expect(CONFIG).toEqual({
      schemaVersion: 1,
      keyId: "HGUBSYYP6G",
      issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
      credentialReference: {
        schemaVersion: 1,
        kind: "macos-keychain",
        service: "app-factory-asc-key",
        account: "HGUBSYYP6G",
      },
      requestTimeoutMs: 30_000,
      jwtTtlSeconds: 600,
    });
    const base = {
      schemaVersion: 1,
      keyId: "HGUBSYYP6G",
      issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
      credentialReference: {
        schemaVersion: 1,
        kind: "macos-keychain",
        service: "s",
        account: "a",
      },
    };
    expect(() => parseAscObserverConfigV1({ ...base, keyId: "short" })).toThrow(/key ID/);
    expect(() => parseAscObserverConfigV1({ ...base, issuerId: "NOPE" })).toThrow(/issuer ID/);
    expect(() => parseAscObserverConfigV1({ ...base, extra: 1 })).toThrow(/unknown key extra/);
    expect(() =>
      parseAscObserverConfigV1({
        ...base,
        credentialReference: { ...base.credentialReference, kind: "env" },
      }),
    ).toThrow(/macos-keychain/);
    expect(() => parseAscObserverConfigV1({ ...base, jwtTtlSeconds: 5_000 })).toThrow(
      /jwtTtlSeconds/,
    );
    // The `.p8` value itself has no slot in this file, by construction.
    expect(() =>
      parseAscObserverConfigV1({ ...base, privateKey: "-----BEGIN PRIVATE KEY-----" }),
    ).toThrow(/unknown key privateKey/);
  });
});
