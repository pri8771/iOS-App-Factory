import { createHash } from "node:crypto";

import type { CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import {
  IsoInstantSchema,
  Sha256DigestSchema,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  createProviderHttpRequest,
  providerUrl,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
} from "@app-factory/provider-http-adapters";

import { ASC_API_ORIGIN } from "./auth.js";

/**
 * The bounded, GET-only HTTP layer under the App Store Connect observers.
 *
 * Requests are built with `createProviderHttpRequest` from
 * `provider-http-adapters` (HTTPS-only URL, request-header allowlist,
 * credential-origin binding to `https://api.appstoreconnect.apple.com`,
 * deadline shape, byte cap) and dispatched through an injected
 * `BoundedProviderHttpTransport` — in production the fetch transport from
 * `provider-transport`, which resolves the `.p8` just in time, refuses
 * redirects, and zeroizes what it owns. This module never sees a credential.
 *
 * Responses are validated structurally, and only an explicit allowlist of
 * response headers is retained; everything else Apple sends is dropped, not
 * failed on, because a live provider always sends headers no fixture
 * anticipated and none of them are needed for the observation.
 */

export const ASC_MAX_PAGE_SIZE = 200;
export const ASC_DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const ASC_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const RETAINED_RESPONSE_HEADERS = new Set([
  "content-type",
  "date",
  "etag",
  "retry-after",
  "x-rate-limit",
  "x-apple-jingle-correlation-key",
  "x-apple-request-uuid",
  "x-request-id",
]);

export class AscHttpError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AscHttpError";
  }
}

function fail(message: string): never {
  throw new AscHttpError(message);
}

export type AscClock = Readonly<{ now(): Date }>;

export type AscHttpContext = Readonly<{
  transport: BoundedProviderHttpTransport;
  base: URL;
  credentialReference: CredentialReferenceV1;
  clock: AscClock;
  requestTimeoutMs: number;
  maximumResponseBytes: number;
  onExchange: ((record: AscExchangeRecordV1) => void) | null;
}>;

/**
 * A redacted record of one request/response exchange, emitted through
 * `onExchange` for evidence. It can never contain a credential: the observer
 * layer never holds one (the transport attaches it after this record's
 * request headers were fixed), and both the response body and any error text
 * pass through `scrubSecrets` before they are recorded.
 */
export type AscExchangeRecordV1 = Readonly<{
  schemaVersion: 1;
  sequence: number;
  method: "GET";
  url: string;
  requestHeaders: readonly ProviderHttpHeaderV1[];
  startedAt: IsoInstant;
  elapsedMs: number;
  outcome: "response" | "transport-error";
  status: number | null;
  responseHeaders: readonly ProviderHttpHeaderV1[];
  bodyByteLength: number;
  bodyDigest: Sha256Digest | null;
  body: Uint8Array | null;
  errorName: string | null;
  errorMessage: string | null;
}>;

export type AscHttpResponse = Readonly<{
  status: number;
  headers: ReadonlyMap<string, string>;
  body: Uint8Array;
}>;

let exchangeSequence = 0;

/**
 * Belt-and-braces redaction applied to every string that leaves this package
 * as evidence or error detail: JWT-shaped tokens and PEM blocks are replaced
 * even though no code path should ever place one there.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[redacted-pem]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{4,}){1,2}/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer [redacted-token]");
}

function sha256(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`,
  );
}

function boundedErrorText(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "Error";
  const raw = error instanceof Error ? error.message : String(error);
  return { name: name.slice(0, 100), message: scrubSecrets(raw).slice(0, 500) };
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function retainedHeaders(value: unknown): ProviderHttpHeaderV1[] {
  if (!Array.isArray(value) || value.length > 200)
    fail("ASC response headers must be a bounded array");
  const retained: ProviderHttpHeaderV1[] = [];
  for (const item of value) {
    const header = record(item, "ASC response header");
    if (typeof header.name !== "string" || typeof header.value !== "string") {
      fail("ASC response header is malformed");
    }
    const name = header.name.toLowerCase();
    if (!RETAINED_RESPONSE_HEADERS.has(name)) continue;
    if (header.value.length > 2_048 || /[\0\r\n]/.test(header.value)) continue;
    if (retained.some((existing) => existing.name === name)) continue;
    retained.push({ name, value: header.value });
  }
  return retained;
}

function validateAscResponse(
  raw: unknown,
  maximumResponseBytes: number,
): { status: number; headers: ProviderHttpHeaderV1[]; body: Uint8Array } {
  const source = record(raw, "ASC transport response");
  if (source.schemaVersion !== 1) fail("ASC transport response schema is unsupported");
  const status = source.status;
  if (!Number.isSafeInteger(status) || (status as number) < 100 || (status as number) > 599) {
    fail("ASC transport response status is invalid");
  }
  if (!(source.body instanceof Uint8Array)) fail("ASC transport response body must be bytes");
  if (source.body.byteLength > maximumResponseBytes) {
    source.body.fill(0);
    fail("ASC response exceeded its declared byte limit");
  }
  return {
    status: status as number,
    headers: retainedHeaders(source.headers),
    body: Uint8Array.from(source.body),
  };
}

export function ascDeadline(context: AscHttpContext): IsoInstant {
  return IsoInstantSchema.parse(
    new Date(context.clock.now().getTime() + context.requestTimeoutMs).toISOString(),
  );
}

export function ascRequestUrl(base: URL, pathname: string, query: URLSearchParams): string {
  return providerUrl(base, pathname, query);
}

export function boundedPositiveInteger(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return value;
}

export function boundedResponseBytes(value: number): number {
  return boundedPositiveInteger(value, "ASC maximum response bytes", 1_024, ASC_MAX_RESPONSE_BYTES);
}

/**
 * Performs exactly one GET. Throws `AscHttpError` for a transport-level or
 * structural failure (the observer maps that to an ambiguous outcome);
 * returns every HTTP status, including 3xx/4xx/5xx, for the observer to
 * classify. Never retries, never follows a redirect.
 */
export async function ascGet(
  context: AscHttpContext,
  url: string,
  signal: AbortSignal,
): Promise<AscHttpResponse> {
  const requestHeaders: readonly ProviderHttpHeaderV1[] = [
    { name: "accept", value: "application/json" },
  ];
  const request = createProviderHttpRequest({
    method: "GET",
    url,
    headers: requestHeaders,
    body: null,
    credentialReference: context.credentialReference,
    credentialOrigin: ASC_API_ORIGIN,
    deadline: ascDeadline(context),
    signal,
    maximumResponseBytes: context.maximumResponseBytes,
  });
  const sequence = (exchangeSequence += 1);
  const startedAt = IsoInstantSchema.parse(context.clock.now().toISOString());
  const startedMs = context.clock.now().getTime();
  let raw: unknown;
  try {
    raw = await context.transport.request(request);
  } catch (error) {
    const { name, message } = boundedErrorText(error);
    context.onExchange?.({
      schemaVersion: 1,
      sequence,
      method: "GET",
      url: request.url,
      requestHeaders,
      startedAt,
      elapsedMs: Math.max(0, context.clock.now().getTime() - startedMs),
      outcome: "transport-error",
      status: null,
      responseHeaders: [],
      bodyByteLength: 0,
      bodyDigest: null,
      body: null,
      errorName: name,
      errorMessage: message,
    });
    fail(`ASC transport failed: ${name}: ${message}`);
  }
  let validated: { status: number; headers: ProviderHttpHeaderV1[]; body: Uint8Array };
  try {
    validated = validateAscResponse(raw, request.maximumResponseBytes);
  } finally {
    if (raw !== null && typeof raw === "object") {
      try {
        const body = (raw as Readonly<{ body?: unknown }>).body;
        if (body instanceof Uint8Array) body.fill(0);
      } catch {
        // Injected transports are untrusted; cleanup is best-effort.
      }
    }
  }
  context.onExchange?.({
    schemaVersion: 1,
    sequence,
    method: "GET",
    url: request.url,
    requestHeaders,
    startedAt,
    elapsedMs: Math.max(0, context.clock.now().getTime() - startedMs),
    outcome: "response",
    status: validated.status,
    responseHeaders: validated.headers,
    bodyByteLength: validated.body.byteLength,
    bodyDigest: sha256(validated.body),
    body: Uint8Array.from(validated.body),
    errorName: null,
    errorMessage: null,
  });
  return {
    status: validated.status,
    headers: new Map(validated.headers.map((header) => [header.name, header.value])),
    body: validated.body,
  };
}
