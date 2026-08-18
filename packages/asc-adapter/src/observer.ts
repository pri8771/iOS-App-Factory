import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import {
  AscAppStoreVersionV1Schema,
  AscAppV1Schema,
  AscBuildV1Schema,
  IsoInstantSchema,
  projectAscReleaseStageV1,
  type AscAppStoreVersionV1,
  type AscAppV1,
  type AscBuildV1,
  type AscReleaseProjectionV1,
  type IsoInstant,
} from "@app-factory/contracts";
import {
  providerBaseUrl,
  type BoundedProviderHttpTransport,
} from "@app-factory/provider-http-adapters";

import { ASC_API_ORIGIN } from "./auth.js";
import {
  ascGet,
  ascRequestUrl,
  ASC_DEFAULT_MAX_RESPONSE_BYTES,
  ASC_MAX_PAGE_SIZE,
  AscHttpError,
  boundedPositiveInteger,
  boundedResponseBytes,
  scrubSecrets,
  type AscClock,
  type AscExchangeRecordV1,
  type AscHttpContext,
  type AscHttpResponse,
} from "./http.js";

/**
 * Read-only App Store Connect observers.
 *
 * Every method issues bounded GETs only. There is no code path that builds a
 * POST/PATCH/DELETE, no request body, and no write endpoint string anywhere in
 * this package. Outcomes are explicit: `observed`, `denied` (401/403 — the
 * key or its role), or `ambiguous` (transport failure, redirect, unexpected
 * status, malformed body, page bound exceeded). Nothing is retried here.
 */

const MAX_PAGES_DEFAULT = 5;
const MAX_PAGES_LIMIT = 25;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

export class AscObserverError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AscObserverError";
  }
}

function fail(message: string): never {
  throw new AscObserverError(message);
}

export type AscReadObserverOptions = Readonly<{
  transport: BoundedProviderHttpTransport;
  /** Keychain reference to the `.p8` item; resolved by the transport, never here. */
  credentialReference: CredentialReferenceV1;
  /** Defaults to `https://api.appstoreconnect.apple.com`; anything else is rejected. */
  apiBaseUrl?: string;
  clock?: AscClock;
  requestTimeoutMs?: number;
  /** JSON:API `limit` per page, 1..200 (Apple's maximum). Default 200. */
  pageSize?: number;
  /** Maximum `links.next` pages followed per list observation. Default 5. */
  maxPages?: number;
  maximumResponseBytes?: number;
  onExchange?: (record: AscExchangeRecordV1) => void;
}>;

export type AscReadOutcome<T> =
  | Readonly<{ kind: "observed"; status: number; value: T; pages: number }>
  | Readonly<{
      kind: "denied";
      status: 401 | 403;
      code: "asc.unauthorized" | "asc.forbidden";
      detail: string;
    }>
  | Readonly<{ kind: "ambiguous"; status: number | null; code: string; detail: string }>;

export type AscListBuildsOptions = Readonly<{
  /** Newest-first page size, 1..200. Default 5. */
  limit?: number;
}>;

export type AscAppReleaseObservation = Readonly<{
  app: AscAppV1;
  builds: AscReadOutcome<readonly AscBuildV1[]>;
  appStoreVersions: AscReadOutcome<readonly AscAppStoreVersionV1[]>;
  /** Present only when both observations succeeded. */
  projection: AscReleaseProjectionV1 | null;
}>;

export type AscReadObserver = Readonly<{
  listApps(signal: AbortSignal): Promise<AscReadOutcome<readonly AscAppV1[]>>;
  listBuilds(
    appId: string,
    options: AscListBuildsOptions,
    signal: AbortSignal,
  ): Promise<AscReadOutcome<readonly AscBuildV1[]>>;
  listAppStoreVersions(
    appId: string,
    signal: AbortSignal,
  ): Promise<AscReadOutcome<readonly AscAppStoreVersionV1[]>>;
  observeAppRelease(
    app: AscAppV1,
    signal: AbortSignal,
    options?: AscListBuildsOptions,
  ): Promise<AscAppReleaseObservation>;
}>;

type Context = AscHttpContext & Readonly<{ pageSize: number; maxPages: number }>;

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordOf(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function stringOf(value: unknown, label: string, maximum = 1_000): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\0\r]/.test(value)
  ) {
    fail(`${label} must be a non-empty string of at most ${String(maximum)} characters`);
  }
  return value;
}

function optionalString(value: unknown, label: string, maximum = 1_000): string | null {
  if (value === undefined || value === null) return null;
  return stringOf(value, label, maximum);
}

function booleanOf(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function resourceId(value: unknown, label: string): string {
  const id = stringOf(value, label, 200);
  if (!RESOURCE_ID_PATTERN.test(id)) fail(`${label} contains unsafe characters`);
  return id;
}

/** Apple emits RFC 3339 with offsets; contracts want `Z` + milliseconds. Never invents. */
function optionalInstant(value: unknown, label: string): IsoInstant | null {
  if (value === undefined || value === null) return null;
  const raw = stringOf(value, label, 64);
  const millis = Date.parse(raw);
  if (!Number.isFinite(millis)) fail(`${label} is not a parseable timestamp`);
  return IsoInstantSchema.parse(new Date(millis).toISOString());
}

function parseJson(body: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    fail("ASC response body is not UTF-8");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail("ASC response body is not JSON");
  }
}

function jsonApiEnvelope(
  response: AscHttpResponse,
  expectedType: string,
  pageSize: number,
): Readonly<{ data: readonly JsonRecord[]; included: readonly JsonRecord[]; next: string | null }> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/json/i.test(contentType)) fail("ASC response is not JSON-typed");
  const root = recordOf(parseJson(response.body), "ASC response");
  if (!Array.isArray(root.data) || root.data.length > pageSize) {
    fail(`ASC ${expectedType} page must be an array of at most ${String(pageSize)} resources`);
  }
  const data = root.data.map((item) => {
    const resource = recordOf(item, `ASC ${expectedType} resource`);
    if (resource.type !== expectedType) fail(`ASC resource type is not ${expectedType}`);
    return resource;
  });
  let included: readonly JsonRecord[] = [];
  if (root.included !== undefined) {
    if (!Array.isArray(root.included) || root.included.length > 3 * pageSize) {
      fail("ASC included resources must be a bounded array");
    }
    included = root.included.map((item) => recordOf(item, "ASC included resource"));
  }
  let next: string | null = null;
  if (root.links !== undefined) {
    const links = recordOf(root.links, "ASC links");
    if (links.next !== undefined && links.next !== null) {
      next = stringOf(links.next, "ASC next link", 4_000);
    }
  }
  return { data, included, next };
}

function attributesOf(resource: JsonRecord, label: string): JsonRecord {
  return recordOf(resource.attributes, `${label} attributes`);
}

/** Resolves `relationships.<name>.data.id` when the relationship was included; null otherwise. */
function relatedId(resource: JsonRecord, name: string, expectedType: string): string | null {
  if (!isRecord(resource.relationships)) return null;
  const relationship = resource.relationships[name];
  if (!isRecord(relationship)) return null;
  const data = relationship.data;
  if (data === undefined || data === null) return null;
  const linkage = recordOf(data, `ASC ${name} linkage`);
  if (linkage.type !== expectedType) fail(`ASC ${name} linkage has an unexpected type`);
  return resourceId(linkage.id, `ASC ${name} linkage id`);
}

function includedAttributes(
  included: readonly JsonRecord[],
  type: string,
  id: string | null,
): JsonRecord | null {
  if (id === null) return null;
  const match = included.find((item) => item.type === type && item.id === id);
  return match === undefined ? null : attributesOf(match, `ASC included ${type}`);
}

function stateToken(value: unknown, label: string): string | null {
  const token = optionalString(value, label, 64);
  if (token !== null && !/^[A-Z][A-Z0-9_]*$/.test(token)) fail(`${label} is not a state token`);
  return token;
}

function parseApp(resource: JsonRecord): AscAppV1 {
  const attributes = attributesOf(resource, "ASC app");
  return AscAppV1Schema.parse({
    schemaVersion: 1,
    appId: resourceId(resource.id, "ASC app id"),
    bundleId: stringOf(attributes.bundleId, "ASC app bundleId", 255),
    name: stringOf(attributes.name, "ASC app name", 500),
    sku: optionalString(attributes.sku, "ASC app sku", 500),
    primaryLocale: optionalString(attributes.primaryLocale, "ASC app primaryLocale", 50),
  });
}

function parseBuild(
  resource: JsonRecord,
  included: readonly JsonRecord[],
  appId: string,
): AscBuildV1 {
  const attributes = attributesOf(resource, "ASC build");
  const betaDetail = includedAttributes(
    included,
    "buildBetaDetails",
    relatedId(resource, "buildBetaDetail", "buildBetaDetails"),
  );
  const preRelease = includedAttributes(
    included,
    "preReleaseVersions",
    relatedId(resource, "preReleaseVersion", "preReleaseVersions"),
  );
  return AscBuildV1Schema.parse({
    schemaVersion: 1,
    buildId: resourceId(resource.id, "ASC build id"),
    appId,
    buildNumber: stringOf(attributes.version, "ASC build version", 100),
    marketingVersion:
      preRelease === null
        ? null
        : optionalString(preRelease.version, "ASC preRelease version", 100),
    uploadedDate: optionalInstant(attributes.uploadedDate, "ASC build uploadedDate"),
    processingState: stringOf(attributes.processingState, "ASC build processingState", 32),
    expired: booleanOf(attributes.expired, "ASC build expired"),
    internalBuildState:
      betaDetail === null
        ? null
        : stateToken(betaDetail.internalBuildState, "ASC build internalBuildState"),
    externalBuildState:
      betaDetail === null
        ? null
        : stateToken(betaDetail.externalBuildState, "ASC build externalBuildState"),
  });
}

function parseAppStoreVersion(resource: JsonRecord, appId: string): AscAppStoreVersionV1 {
  const attributes = attributesOf(resource, "ASC appStoreVersion");
  return AscAppStoreVersionV1Schema.parse({
    schemaVersion: 1,
    appStoreVersionId: resourceId(resource.id, "ASC appStoreVersion id"),
    appId,
    versionString: stringOf(attributes.versionString, "ASC appStoreVersion versionString", 100),
    platform: stateToken(attributes.platform, "ASC appStoreVersion platform"),
    appStoreState: stateToken(attributes.appStoreState, "ASC appStoreVersion appStoreState"),
    appVersionState: stateToken(attributes.appVersionState, "ASC appStoreVersion appVersionState"),
    createdDate: optionalInstant(attributes.createdDate, "ASC appStoreVersion createdDate"),
  });
}

function providerErrorDetail(response: AscHttpResponse): string {
  // Apple's error envelope: { errors: [{ status, code, title, detail }] }.
  // Only bounded, scrubbed code/title are surfaced; never the whole body.
  try {
    const root = parseJson(response.body);
    if (isRecord(root) && Array.isArray(root.errors) && root.errors.length > 0) {
      const first = root.errors[0];
      if (isRecord(first)) {
        const code = typeof first.code === "string" ? first.code.slice(0, 100) : "";
        const title = typeof first.title === "string" ? first.title.slice(0, 200) : "";
        return scrubSecrets(`${code}${code && title ? ": " : ""}${title}`).slice(0, 300);
      }
    }
  } catch {
    // Not JSON or not Apple's shape; fall through.
  }
  return "";
}

/**
 * Follows a JSON:API `links.next` only when it stays on the configured
 * origin and the same path — and even then the URL is rebuilt through
 * `providerUrl` from its parts rather than dispatched verbatim.
 */
function nextPageUrl(context: Context, pathname: string, next: string): string {
  let parsed: URL;
  try {
    parsed = new URL(next);
  } catch {
    fail("ASC next link is not a URL");
  }
  if (parsed.origin !== context.base.origin || parsed.pathname !== pathname) {
    fail("ASC next link escaped the observed collection");
  }
  return ascRequestUrl(context.base, pathname, parsed.searchParams);
}

async function observeList<T>(
  context: Context,
  pathname: string,
  query: URLSearchParams,
  expectedType: string,
  followPages: boolean,
  signal: AbortSignal,
  parseItem: (resource: JsonRecord, included: readonly JsonRecord[]) => T,
): Promise<AscReadOutcome<readonly T[]>> {
  const items: T[] = [];
  let url = ascRequestUrl(context.base, pathname, query);
  let pages = 0;
  let lastStatus = 0;
  try {
    for (;;) {
      pages += 1;
      const response = await ascGet(context, url, signal);
      lastStatus = response.status;
      if (response.status === 401 || response.status === 403) {
        return {
          kind: "denied",
          status: response.status,
          code: response.status === 401 ? "asc.unauthorized" : "asc.forbidden",
          detail: providerErrorDetail(response),
        };
      }
      if (response.status >= 300 && response.status < 400) {
        return {
          kind: "ambiguous",
          status: response.status,
          code: "asc.redirect-refused",
          detail: "redirect responses are never followed",
        };
      }
      if (response.status === 429) {
        return {
          kind: "ambiguous",
          status: 429,
          code: "asc.rate-limited",
          detail: `retry-after=${response.headers.get("retry-after") ?? "unspecified"}`,
        };
      }
      if (response.status === 404) {
        return {
          kind: "ambiguous",
          status: 404,
          code: "asc.not-found",
          detail: providerErrorDetail(response),
        };
      }
      if (response.status !== 200) {
        return {
          kind: "ambiguous",
          status: response.status,
          code: "asc.unexpected-status",
          detail: providerErrorDetail(response),
        };
      }
      const envelope = jsonApiEnvelope(response, expectedType, context.pageSize);
      for (const resource of envelope.data) items.push(parseItem(resource, envelope.included));
      if (!followPages || envelope.next === null) break;
      if (pages >= context.maxPages) {
        return {
          kind: "ambiguous",
          status: 200,
          code: "asc.page-bound-exceeded",
          detail: `more than ${String(context.maxPages)} pages of ${expectedType}`,
        };
      }
      url = nextPageUrl(context, pathname, envelope.next);
    }
  } catch (error) {
    if (error instanceof AscHttpError || error instanceof AscObserverError) {
      return {
        kind: "ambiguous",
        status: lastStatus === 0 ? null : lastStatus,
        code:
          error instanceof AscHttpError && error.message.startsWith("ASC transport failed")
            ? "asc.transport-failed"
            : "asc.malformed-response",
        detail: scrubSecrets(error.message).slice(0, 500),
      };
    }
    if (error instanceof Error && error.name === "ZodError") {
      return {
        kind: "ambiguous",
        status: lastStatus === 0 ? null : lastStatus,
        code: "asc.malformed-response",
        detail: `ASC ${expectedType} resource failed contract validation`,
      };
    }
    throw error;
  }
  return { kind: "observed", status: lastStatus, value: items, pages };
}

function latestBuild(builds: readonly AscBuildV1[]): AscBuildV1 | null {
  // The builds request is `sort=-uploadedDate`, so the first is newest; the
  // reduce below is a guard should a page ever arrive unsorted.
  let latest: AscBuildV1 | null = null;
  for (const build of builds) {
    if (latest === null) {
      latest = build;
      continue;
    }
    if (
      build.uploadedDate !== null &&
      (latest.uploadedDate === null || build.uploadedDate > latest.uploadedDate)
    ) {
      latest = build;
    }
  }
  return latest;
}

function latestAppStoreVersion(
  versions: readonly AscAppStoreVersionV1[],
): AscAppStoreVersionV1 | null {
  let latest: AscAppStoreVersionV1 | null = null;
  for (const version of versions) {
    if (latest === null) {
      latest = version;
      continue;
    }
    if (
      version.createdDate !== null &&
      (latest.createdDate === null || version.createdDate > latest.createdDate)
    ) {
      latest = version;
    }
  }
  return latest;
}

export function createAscReadObserver(options: AscReadObserverOptions): AscReadObserver {
  const base = providerBaseUrl(options.apiBaseUrl ?? ASC_API_ORIGIN, "ASC API base URL");
  if (base.origin !== ASC_API_ORIGIN) {
    fail("ASC observers only address https://api.appstoreconnect.apple.com");
  }
  const context: Context = {
    transport: options.transport,
    base,
    credentialReference: parseCredentialReference(options.credentialReference),
    clock: options.clock ?? { now: () => new Date() },
    requestTimeoutMs: boundedPositiveInteger(
      options.requestTimeoutMs ?? 30_000,
      "ASC request timeout",
      100,
      120_000,
    ),
    maximumResponseBytes: boundedResponseBytes(
      options.maximumResponseBytes ?? ASC_DEFAULT_MAX_RESPONSE_BYTES,
    ),
    onExchange: options.onExchange ?? null,
    pageSize: boundedPositiveInteger(
      options.pageSize ?? ASC_MAX_PAGE_SIZE,
      "ASC page size",
      1,
      ASC_MAX_PAGE_SIZE,
    ),
    maxPages: boundedPositiveInteger(
      options.maxPages ?? MAX_PAGES_DEFAULT,
      "ASC max pages",
      1,
      MAX_PAGES_LIMIT,
    ),
  };

  const listApps = async (signal: AbortSignal): Promise<AscReadOutcome<readonly AscAppV1[]>> => {
    const query = new URLSearchParams({ limit: String(context.pageSize) });
    const outcome = await observeList(
      context,
      "/v1/apps",
      query,
      "apps",
      true,
      signal,
      (resource) => parseApp(resource),
    );
    if (outcome.kind !== "observed") return outcome;
    const sorted = [...outcome.value].sort((left, right) =>
      left.bundleId < right.bundleId ? -1 : left.bundleId > right.bundleId ? 1 : 0,
    );
    if (new Set(sorted.map((app) => app.appId)).size !== sorted.length) {
      return {
        kind: "ambiguous",
        status: outcome.status,
        code: "asc.malformed-response",
        detail: "ASC apps list repeated an app id across pages",
      };
    }
    return { ...outcome, value: sorted };
  };

  const listBuilds = async (
    appIdValue: string,
    listOptions: AscListBuildsOptions,
    signal: AbortSignal,
  ): Promise<AscReadOutcome<readonly AscBuildV1[]>> => {
    const appId = resourceId(appIdValue, "ASC app id");
    const limit = boundedPositiveInteger(
      listOptions.limit ?? 5,
      "ASC builds limit",
      1,
      ASC_MAX_PAGE_SIZE,
    );
    const query = new URLSearchParams();
    query.set("filter[app]", appId);
    query.set("sort", "-uploadedDate");
    query.set("limit", String(limit));
    query.set("include", "buildBetaDetail,preReleaseVersion");
    return await observeList(
      { ...context, pageSize: limit },
      "/v1/builds",
      query,
      "builds",
      false,
      signal,
      (resource, included) => parseBuild(resource, included, appId),
    );
  };

  const listAppStoreVersions = async (
    appIdValue: string,
    signal: AbortSignal,
  ): Promise<AscReadOutcome<readonly AscAppStoreVersionV1[]>> => {
    const appId = resourceId(appIdValue, "ASC app id");
    const query = new URLSearchParams({ limit: String(context.pageSize) });
    return await observeList(
      context,
      `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions`,
      query,
      "appStoreVersions",
      true,
      signal,
      (resource) => parseAppStoreVersion(resource, appId),
    );
  };

  const observeAppRelease = async (
    appValue: AscAppV1,
    signal: AbortSignal,
    releaseOptions: AscListBuildsOptions = {},
  ): Promise<AscAppReleaseObservation> => {
    const app = AscAppV1Schema.parse(appValue);
    const builds = await listBuilds(app.appId, releaseOptions, signal);
    const appStoreVersions = await listAppStoreVersions(app.appId, signal);
    let projection: AscReleaseProjectionV1 | null = null;
    if (builds.kind === "observed" && appStoreVersions.kind === "observed") {
      projection = projectAscReleaseStageV1({
        app,
        latestBuild: latestBuild(builds.value),
        latestAppStoreVersion: latestAppStoreVersion(appStoreVersions.value),
        observedAt: context.clock.now().toISOString(),
      });
    }
    return { app, builds, appStoreVersions, projection };
  };

  return { listApps, listBuilds, listAppStoreVersions, observeAppRelease };
}
