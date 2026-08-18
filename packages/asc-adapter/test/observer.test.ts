import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import { AscReleaseProjectionV1Schema, projectAscReleaseStageV1 } from "@app-factory/contracts";
import {
  createCredentialBroker,
  type CredentialCommandPort,
  type CredentialCommandRequest,
} from "@app-factory/credential-broker";
import type {
  BoundedProviderHttpTransport,
  ProviderHttpRequestV1,
} from "@app-factory/provider-http-adapters";
import { createFetchProviderHttpTransport } from "@app-factory/provider-transport";

import {
  ASC_API_ORIGIN,
  createAscJwtAuthorization,
  createAscReadObserver,
  scrubSecrets,
  type AscExchangeRecordV1,
} from "../src/index.js";

const CREDENTIAL: CredentialReferenceV1 = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: "app-factory-asc-key",
  account: "ABCDE12345",
};
const CLOCK = { now: () => new Date("2026-08-17T20:00:00.000Z") };
const APP_ID = "1234567890";

type Fixture = Readonly<{
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Fixture {
  return { status, headers: { "content-type": "application/json", ...headers }, body };
}

/**
 * An in-memory `BoundedProviderHttpTransport`. It records every request it
 * sees so tests can assert that no credential header, body, or non-GET method
 * ever reaches the transport, and serves fixtures keyed by pathname+search.
 */
function memoryTransport(
  routes: Record<string, Fixture | ((request: ProviderHttpRequestV1) => Fixture)>,
) {
  const requests: ProviderHttpRequestV1[] = [];
  const transport: BoundedProviderHttpTransport = {
    request: vi.fn(async (request: ProviderHttpRequestV1) => {
      requests.push(request);
      const url = new URL(request.url);
      const key = `${url.pathname}${url.search}`;
      const route = routes[key];
      if (route === undefined) throw new Error(`unrouted ${key}`);
      const fixture = typeof route === "function" ? route(request) : route;
      const bodyBytes =
        typeof fixture.body === "string"
          ? Buffer.from(fixture.body, "utf8")
          : fixture.body instanceof Uint8Array
            ? Buffer.from(fixture.body)
            : Buffer.from(JSON.stringify(fixture.body), "utf8");
      return {
        schemaVersion: 1 as const,
        status: fixture.status,
        headers: Object.entries(fixture.headers ?? {}).map(([name, value]) => ({ name, value })),
        body: Uint8Array.from(bodyBytes),
      };
    }),
  };
  return { transport, requests };
}

function appResource(id: string, bundleId: string, name: string, sku: string | null = "SKU") {
  return {
    type: "apps",
    id,
    attributes: { bundleId, name, sku, primaryLocale: "en-US", isOrEverWasMadeForKids: false },
    relationships: { builds: { links: { self: "x" } } },
    links: { self: `${ASC_API_ORIGIN}/v1/apps/${id}` },
  };
}

function buildResource(
  id: string,
  version: string,
  uploadedDate: string,
  processingState: string,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "builds",
    id,
    attributes: {
      version,
      uploadedDate,
      processingState,
      expired: false,
      minOsVersion: "17.0",
      ...extra,
    },
    relationships: {
      buildBetaDetail: { data: { type: "buildBetaDetails", id: `bbd-${id}` } },
      preReleaseVersion: { data: { type: "preReleaseVersions", id: `prv-${id}` } },
    },
  };
}

function versionResource(id: string, versionString: string, createdDate: string, state: string) {
  return {
    type: "appStoreVersions",
    id,
    attributes: {
      platform: "IOS",
      versionString,
      appStoreState: state,
      appVersionState: state,
      createdDate,
      downloadable: true,
    },
  };
}

const APPS_PAGE = json({
  data: [
    appResource("2", "com.example.zeta", "Zeta"),
    appResource("1", "com.example.alpha", "Alpha", null),
  ],
  links: { self: `${ASC_API_ORIGIN}/v1/apps` },
  meta: { paging: { total: 2, limit: 200 } },
});

const BUILDS_KEY = `/v1/builds?filter%5Bapp%5D=${APP_ID}&sort=-uploadedDate&limit=5&include=buildBetaDetail%2CpreReleaseVersion`;
const VERSIONS_KEY = `/v1/apps/${APP_ID}/appStoreVersions?limit=200`;

const BUILDS_PAGE = json({
  data: [
    buildResource("b2", "42", "2026-08-10T10:00:00-07:00", "VALID"),
    buildResource("b1", "41", "2026-08-01T10:00:00-07:00", "VALID", { expired: true }),
  ],
  included: [
    {
      type: "buildBetaDetails",
      id: "bbd-b2",
      attributes: {
        internalBuildState: "IN_BETA_TESTING",
        externalBuildState: "READY_FOR_BETA_SUBMISSION",
      },
    },
    { type: "preReleaseVersions", id: "prv-b2", attributes: { version: "1.4.0", platform: "IOS" } },
    {
      type: "buildBetaDetails",
      id: "bbd-b1",
      attributes: { internalBuildState: "EXPIRED", externalBuildState: "EXPIRED" },
    },
    { type: "preReleaseVersions", id: "prv-b1", attributes: { version: "1.3.0", platform: "IOS" } },
  ],
  links: { self: "x" },
});

const VERSIONS_PAGE = json({
  data: [
    versionResource("v1", "1.3.0", "2026-07-01T00:00:00Z", "READY_FOR_SALE"),
    versionResource("v2", "1.4.0", "2026-08-09T00:00:00Z", "PREPARE_FOR_SUBMISSION"),
  ],
  links: { self: "x" },
});

function observer(
  transport: BoundedProviderHttpTransport,
  overrides: Partial<Parameters<typeof createAscReadObserver>[0]> = {},
) {
  return createAscReadObserver({
    transport,
    credentialReference: CREDENTIAL,
    clock: CLOCK,
    ...overrides,
  });
}

describe("createAscReadObserver", () => {
  it("lists apps with GET only, an accept header, the ASC credential origin, a bounded page size, and no credential in the request", async () => {
    const { transport, requests } = memoryTransport({ "/v1/apps?limit=200": APPS_PAGE });
    const outcome = await observer(transport).listApps(new AbortController().signal);

    expect(outcome.kind).toBe("observed");
    if (outcome.kind !== "observed") return;
    expect(outcome.value.map((app) => app.bundleId)).toEqual([
      "com.example.alpha",
      "com.example.zeta",
    ]);
    expect(outcome.value[0]).toEqual({
      schemaVersion: 1,
      appId: "1",
      bundleId: "com.example.alpha",
      name: "Alpha",
      sku: null,
      primaryLocale: "en-US",
    });
    expect(requests).toHaveLength(1);
    const request = requests[0] as ProviderHttpRequestV1;
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(request.headers).toEqual([{ name: "accept", value: "application/json" }]);
    expect(request.credentialOrigin).toBe(ASC_API_ORIGIN);
    expect(request.credentialReference).toEqual(CREDENTIAL);
    expect(request.maximumResponseBytes).toBe(1024 * 1024);
    expect(request.deadline).toBe("2026-08-17T20:00:30.000Z");
    expect(new URL(request.url).searchParams.get("limit")).toBe("200");
  });

  it("follows links.next only on the same origin+path, up to maxPages, and reports page-bound-exceeded beyond that", async () => {
    const page = (n: number, next: string | null) =>
      json({
        data: [appResource(String(n), `com.example.app${String(n)}`, `App ${String(n)}`)],
        links: { self: "x", ...(next === null ? {} : { next }) },
      });
    const { transport, requests } = memoryTransport({
      "/v1/apps?limit=200": page(1, `${ASC_API_ORIGIN}/v1/apps?cursor=AAA&limit=200`),
      "/v1/apps?cursor=AAA&limit=200": page(2, `${ASC_API_ORIGIN}/v1/apps?cursor=BBB&limit=200`),
      "/v1/apps?cursor=BBB&limit=200": page(3, null),
    });
    const ok = await observer(transport, { maxPages: 3 }).listApps(new AbortController().signal);
    expect(ok.kind).toBe("observed");
    if (ok.kind === "observed") {
      expect(ok.pages).toBe(3);
      expect(ok.value.map((app) => app.appId)).toEqual(["1", "2", "3"]);
    }
    expect(requests).toHaveLength(3);

    const bounded = await observer(transport, { maxPages: 2 }).listApps(
      new AbortController().signal,
    );
    expect(bounded).toMatchObject({
      kind: "ambiguous",
      code: "asc.page-bound-exceeded",
      status: 200,
    });
    expect(requests).toHaveLength(5);

    const escaping = memoryTransport({
      "/v1/apps?limit=200": page(1, "https://evil.example/v1/apps?cursor=AAA"),
    });
    const escaped = await observer(escaping.transport).listApps(new AbortController().signal);
    expect(escaped).toMatchObject({ kind: "ambiguous", code: "asc.malformed-response" });
    expect(escaping.requests).toHaveLength(1);
  });

  it("rejects a page size or builds limit above Apple's 200 maximum", async () => {
    const { transport } = memoryTransport({});
    expect(() => observer(transport, { pageSize: 201 })).toThrow(/page size/);
    // A caller-supplied bound above Apple's maximum is a contract error, not an observation.
    await expect(
      observer(transport).listBuilds(APP_ID, { limit: 201 }, new AbortController().signal),
    ).rejects.toThrow(/builds limit/);
  });

  it("refuses redirects instead of following them", async () => {
    const { transport, requests } = memoryTransport({
      "/v1/apps?limit=200": {
        status: 302,
        headers: { location: "https://api.appstoreconnect.apple.com/v1/apps?limit=200&x=1" },
        body: "",
      },
    });
    const outcome = await observer(transport).listApps(new AbortController().signal);
    expect(outcome).toEqual({
      kind: "ambiguous",
      status: 302,
      code: "asc.redirect-refused",
      detail: "redirect responses are never followed",
    });
    expect(requests).toHaveLength(1);
  });

  it("classifies 401/403 as denied with only Apple's bounded error code/title", async () => {
    const denied = (status: number, code: string) =>
      json(
        {
          errors: [
            {
              status: String(status),
              code,
              title: "Authentication credentials are missing or invalid.",
              detail: "secret-looking eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.sig",
            },
          ],
        },
        status,
      );
    const t401 = memoryTransport({ "/v1/apps?limit=200": denied(401, "NOT_AUTHORIZED") });
    const o401 = await observer(t401.transport).listApps(new AbortController().signal);
    expect(o401).toEqual({
      kind: "denied",
      status: 401,
      code: "asc.unauthorized",
      detail: "NOT_AUTHORIZED: Authentication credentials are missing or invalid.",
    });
    const t403 = memoryTransport({ "/v1/apps?limit=200": denied(403, "FORBIDDEN_ERROR") });
    const o403 = await observer(t403.transport).listApps(new AbortController().signal);
    expect(o403).toMatchObject({ kind: "denied", status: 403, code: "asc.forbidden" });
    expect(JSON.stringify(o403)).not.toContain("eyJ");
  });

  it("maps 429, 404, other statuses, transport failures, and malformed bodies to ambiguous outcomes", async () => {
    const cases: [Fixture | (() => never), Record<string, unknown>][] = [
      [
        json({ errors: [] }, 429, { "retry-after": "60" }),
        { code: "asc.rate-limited", status: 429, detail: "retry-after=60" },
      ],
      [
        json({ errors: [{ code: "NOT_FOUND", title: "nope" }] }, 404),
        { code: "asc.not-found", status: 404 },
      ],
      [json({}, 500), { code: "asc.unexpected-status", status: 500 }],
      [
        { status: 200, headers: { "content-type": "text/html" }, body: "<html>" },
        { code: "asc.malformed-response", status: 200 },
      ],
      [
        { status: 200, headers: { "content-type": "application/json" }, body: "{not json" },
        { code: "asc.malformed-response", status: 200 },
      ],
      [json({ data: { type: "apps" } }), { code: "asc.malformed-response" }],
      [
        json({ data: [{ type: "builds", id: "1", attributes: {} }] }),
        { code: "asc.malformed-response" },
      ],
      [
        json({ data: [{ type: "apps", id: "1", attributes: { bundleId: "no-dots", name: "x" } }] }),
        { code: "asc.malformed-response" },
      ],
      [
        () => {
          throw new Error("socket hang up");
        },
        { code: "asc.transport-failed", status: null },
      ],
    ];
    for (const [fixture, expected] of cases) {
      const { transport } = memoryTransport({ "/v1/apps?limit=200": fixture as Fixture });
      const outcome = await observer(transport).listApps(new AbortController().signal);
      expect(outcome).toMatchObject({ kind: "ambiguous", ...expected });
    }
  });

  it("observes builds newest-first with included beta detail + marketing version, and app store versions, then projects the release stage without inventing dates", async () => {
    const records: AscExchangeRecordV1[] = [];
    const { transport, requests } = memoryTransport({
      "/v1/apps?limit=200": json({ data: [appResource(APP_ID, "com.example.alpha", "Alpha")] }),
      [BUILDS_KEY]: BUILDS_PAGE,
      [VERSIONS_KEY]: VERSIONS_PAGE,
    });
    const asc = observer(transport, { onExchange: (record) => records.push(record) });
    const apps = await asc.listApps(new AbortController().signal);
    if (apps.kind !== "observed" || apps.value[0] === undefined) throw new Error("expected apps");
    const observation = await asc.observeAppRelease(apps.value[0], new AbortController().signal);

    expect(observation.builds.kind).toBe("observed");
    if (observation.builds.kind !== "observed") return;
    expect(observation.builds.value).toEqual([
      {
        schemaVersion: 1,
        buildId: "b2",
        appId: APP_ID,
        buildNumber: "42",
        marketingVersion: "1.4.0",
        uploadedDate: "2026-08-10T17:00:00.000Z",
        processingState: "VALID",
        expired: false,
        internalBuildState: "IN_BETA_TESTING",
        externalBuildState: "READY_FOR_BETA_SUBMISSION",
      },
      {
        schemaVersion: 1,
        buildId: "b1",
        appId: APP_ID,
        buildNumber: "41",
        marketingVersion: "1.3.0",
        uploadedDate: "2026-08-01T17:00:00.000Z",
        processingState: "VALID",
        expired: true,
        internalBuildState: "EXPIRED",
        externalBuildState: "EXPIRED",
      },
    ]);
    expect(observation.appStoreVersions.kind).toBe("observed");
    expect(observation.projection).not.toBeNull();
    const projection = AscReleaseProjectionV1Schema.parse(observation.projection);
    expect(projection.projectedStage).toBe("internal-testflight-available");
    expect(projection.projectionBasis).toBe("build-in-internal-testing");
    expect(projection.uploadedAt).toBe("2026-08-10T17:00:00.000Z");
    expect(projection.internalTestFlightAvailableAt).toBeNull();
    expect(projection.latestAppStoreVersion).toMatchObject({
      versionString: "1.4.0",
      appVersionState: "PREPARE_FOR_SUBMISSION",
      platform: "IOS",
    });
    expect(projection.observedAt).toBe("2026-08-17T20:00:00.000Z");

    // Every request was a credential-free GET on the ASC origin.
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.map((header) => header.name)).toEqual(["accept"]);
      expect(new URL(request.url).origin).toBe(ASC_API_ORIGIN);
    }
    // Exchange records carry status, timing, retained headers, and digests, never credentials.
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record.outcome).toBe("response");
      expect(record.status).toBe(200);
      expect(record.responseHeaders).toEqual([{ name: "content-type", value: "application/json" }]);
      expect(record.bodyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(JSON.stringify({ ...record, body: null })).not.toMatch(/authorization|Bearer/i);
    }
  });

  it("projects processing / failed / expired / not-yet-in-testing builds onto the highest provable stage, and no build onto no stage", () => {
    const app = {
      schemaVersion: 1 as const,
      appId: APP_ID,
      bundleId: "com.example.alpha",
      name: "Alpha",
      sku: null,
      primaryLocale: null,
    };
    const build = (
      processingState: "PROCESSING" | "FAILED" | "INVALID" | "VALID",
      internal: string | null,
      expired = false,
    ) => ({
      schemaVersion: 1 as const,
      buildId: "b",
      appId: APP_ID,
      buildNumber: "1",
      marketingVersion: null,
      uploadedDate: null,
      processingState,
      expired,
      internalBuildState: internal,
      externalBuildState: null,
    });
    const observedAt = "2026-08-17T20:00:00.000Z";
    const project = (latestBuild: ReturnType<typeof build> | null) =>
      projectAscReleaseStageV1({ app, latestBuild, latestAppStoreVersion: null, observedAt });

    expect(project(null)).toMatchObject({
      projectedStage: null,
      projectionBasis: "no-build-observed",
      uploadedAt: null,
    });
    expect(project(build("PROCESSING", null))).toMatchObject({
      projectedStage: "processing",
      projectionBasis: "build-processing",
    });
    expect(project(build("FAILED", null))).toMatchObject({
      projectedStage: "processing",
      projectionBasis: "build-processing-failed",
    });
    expect(project(build("VALID", "READY_FOR_BETA_TESTING"))).toMatchObject({
      projectedStage: "processing",
      projectionBasis: "build-processed-not-in-internal-testing",
    });
    expect(project(build("VALID", null))).toMatchObject({ projectedStage: "processing" });
    expect(project(build("VALID", "IN_BETA_TESTING"))).toMatchObject({
      projectedStage: "internal-testflight-available",
    });
    expect(project(build("VALID", "IN_BETA_TESTING", true))).toMatchObject({
      projectedStage: "processing",
      projectionBasis: "build-expired",
    });
    // Contract-level guard: nothing may claim a stage ASC cannot prove.
    expect(() =>
      AscReleaseProjectionV1Schema.parse({
        ...project(build("VALID", "IN_BETA_TESTING")),
        projectedStage: "device-smoke-passed",
      }),
    ).toThrow();
    expect(() =>
      AscReleaseProjectionV1Schema.parse({
        ...project(build("VALID", "IN_BETA_TESTING")),
        internalTestFlightAvailableAt: observedAt,
      }),
    ).toThrow();
  });

  it("only addresses the App Store Connect origin", () => {
    const { transport } = memoryTransport({});
    expect(() => observer(transport, { apiBaseUrl: "https://api.example.test" })).toThrow(
      /only address/,
    );
  });

  it("scrubs token- and PEM-shaped text from evidence strings", () => {
    expect(scrubSecrets("Bearer eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln and more")).toBe(
      "Bearer [redacted-token] and more",
    );
    expect(scrubSecrets("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----")).toBe(
      "[redacted-pem]",
    );
  });
});

describe("end to end through the real fetch transport and credential broker (fake Keychain, fake fetch)", () => {
  it("resolves the .p8 just in time, mints a Bearer JWT for the request, dispatches a GET, and leaves the secret zeroized; no JWT appears in the outcome or exchange records", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const seenSecrets: Uint8Array[] = [];
    const port: CredentialCommandPort = {
      run: vi.fn(async (request: CredentialCommandRequest) => {
        expect(request.executable).toBe("/usr/bin/security");
        expect(request.arguments.slice(0, 2)).toEqual(["find-generic-password", "-w"]);
        expect(request.arguments).toContain("app-factory-asc-key");
        return {
          exitCode: 0,
          stdout: Uint8Array.from(Buffer.from(`${pem}\n`, "utf8")),
          stderr: new Uint8Array(0),
          timedOut: false,
          outputLimitExceeded: false,
        };
      }),
    };
    const broker = createCredentialBroker(port);
    const authorizations: string[] = [];
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Headers;
      authorizations.push(headers.get("authorization") ?? "");
      expect(init.method).toBe("GET");
      expect(init.redirect).toBe("manual");
      expect(url).toBe(`${ASC_API_ORIGIN}/v1/apps?limit=200`);
      return new Response(JSON.stringify(APPS_PAGE.body), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-rate-limit": "user-hour-lim:3600;user-hour-rem:3599;",
          server: "daiquiri",
        },
      });
    });
    const transport = createFetchProviderHttpTransport({
      credentials: broker,
      fetch: fetchSpy,
      clock: CLOCK,
      authorization: (secret, request) => {
        seenSecrets.push(secret);
        return createAscJwtAuthorization({
          keyId: "ABCDE12345",
          issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
          clock: CLOCK,
        })(secret, request);
      },
    });
    const records: AscExchangeRecordV1[] = [];
    const asc = createAscReadObserver({
      transport,
      credentialReference: CREDENTIAL,
      clock: CLOCK,
      onExchange: (record) => records.push(record),
    });

    const outcome = await asc.listApps(new AbortController().signal);
    expect(outcome.kind).toBe("observed");
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]).toMatch(/^Bearer eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(seenSecrets).toHaveLength(1);
    expect([...(seenSecrets[0] as Uint8Array)].every((byte) => byte === 0)).toBe(true);
    // Retained ASC headers include the rate-limit header; unknown ones are dropped, not fatal.
    expect(records[0]?.responseHeaders).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "x-rate-limit", value: "user-hour-lim:3600;user-hour-rem:3599;" },
    ]);
    const evidence = JSON.stringify({
      outcome,
      records: records.map((r) => ({ ...r, body: null })),
    });
    expect(evidence).not.toMatch(/eyJ|Bearer|PRIVATE KEY/);
  });
});
