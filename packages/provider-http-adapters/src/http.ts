import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import { IsoInstantSchema, type IsoInstant } from "@app-factory/contracts";

const MAX_HEADER_COUNT = 100;
const MAX_HEADER_VALUE_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "if-none-match",
  "x-atlassian-token",
  "x-github-api-version",
]);
const ALLOWED_RESPONSE_HEADERS = new Set([
  "atl-traceid",
  "content-type",
  "date",
  "etag",
  "last-modified",
  "link",
  "retry-after",
  "x-github-request-id",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-resource",
  "x-request-id",
]);

/**
 * Whether a lowercase response header name is part of the bounded
 * `ProviderHttpResponseV1` envelope. A trusted transport projects a live
 * provider response through this predicate before returning it: a real
 * provider answers with dozens of headers (`server`, `cache-control`,
 * `vary`, security headers, ...) that the strict envelope validator
 * `validateProviderHttpResponse` rejects by design, so the transport must
 * drop everything outside the allowlist rather than forward it. Injected
 * in-memory transports never needed this because they only ever emitted
 * allowlisted headers.
 */
export function isAllowedProviderResponseHeader(name: string): boolean {
  return ALLOWED_RESPONSE_HEADERS.has(name);
}

export class ProviderHttpContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProviderHttpContractError";
  }
}

export type ProviderHttpMethod = "GET" | "POST" | "PUT";

export type ProviderHttpHeaderV1 = Readonly<{
  name: string;
  value: string;
}>;

/**
 * The transport is the trusted authentication boundary. It receives a safe
 * Keychain reference, never credential bytes from adapter configuration.
 */
export type ProviderHttpRequestV1 = Readonly<{
  schemaVersion: 1;
  method: ProviderHttpMethod;
  url: string;
  headers: readonly ProviderHttpHeaderV1[];
  body: Uint8Array | null;
  credentialReference: CredentialReferenceV1;
  /** Trusted transport must reject use of this reference outside this origin. */
  credentialOrigin: string;
  maximumResponseBytes: number;
  deadline: IsoInstant;
  signal: AbortSignal;
}>;

export type ProviderHttpResponseV1 = Readonly<{
  schemaVersion: 1;
  status: number;
  headers: readonly ProviderHttpHeaderV1[];
  body: Uint8Array;
}>;

export type BoundedProviderHttpTransport = Readonly<{
  request(input: ProviderHttpRequestV1): Promise<unknown>;
}>;

export type ValidatedProviderHttpResponse = Readonly<{
  status: number;
  headers: ReadonlyMap<string, string>;
  body: Uint8Array;
}>;

function fail(message: string): never {
  throw new ProviderHttpContractError(message);
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exact(value: Readonly<Record<string, unknown>>, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} contains unexpected or missing fields`);
  }
}

function safeHeader(value: unknown, request: boolean): ProviderHttpHeaderV1 {
  const source = record(value, "HTTP header");
  exact(source, ["name", "value"], "HTTP header");
  if (
    typeof source.name !== "string" ||
    source.name !== source.name.toLowerCase() ||
    !/^[a-z0-9!#$%&'*+.^_`|~-]{1,100}$/.test(source.name)
  ) {
    fail("HTTP header name is invalid or not lowercase");
  }
  if (
    typeof source.value !== "string" ||
    source.value.length > MAX_HEADER_VALUE_BYTES ||
    /[\0\r\n]/.test(source.value)
  ) {
    fail("HTTP header value is invalid or too large");
  }
  if (request && !ALLOWED_REQUEST_HEADERS.has(source.name)) {
    fail(`request header ${source.name} is not allowed`);
  }
  if (!request && !ALLOWED_RESPONSE_HEADERS.has(source.name)) {
    fail(`response header ${source.name} is not allowed`);
  }
  if (request && (source.name === "authorization" || source.name === "cookie")) {
    fail("credential values cannot be passed in HTTP headers");
  }
  return { name: source.name, value: source.value };
}

function safeHeaders(value: unknown, request: boolean): readonly ProviderHttpHeaderV1[] {
  if (!Array.isArray(value) || value.length > MAX_HEADER_COUNT) {
    fail("HTTP headers must be a bounded array");
  }
  const headers = value.map((item) => safeHeader(item, request));
  const names = headers.map((header) => header.name);
  if (new Set(names).size !== names.length) fail("HTTP headers must not be duplicated");
  return headers;
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4_000) fail("HTTP URL is invalid");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("HTTP URL is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    fail("provider HTTP URLs must use HTTPS without embedded credentials");
  }
  return parsed.toString();
}

export function providerBaseUrl(value: unknown, label: string): URL {
  const safe = safeUrl(value);
  const parsed = new URL(safe);
  if (parsed.search !== "" || parsed.hash !== "") fail(`${label} cannot include a query or hash`);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

export function providerUrl(base: URL, pathname: string, query?: URLSearchParams): string {
  if (
    !pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    pathname.includes("?") ||
    pathname.includes("#")
  ) {
    fail("provider request path is invalid");
  }
  for (const segment of pathname.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      fail("provider request path contains invalid percent encoding");
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      fail("provider request path contains an unsafe segment");
    }
  }
  const basePath = base.pathname === "/" ? "" : base.pathname;
  const result = new URL(base.toString());
  result.pathname = `${basePath}${pathname}`;
  result.search = query?.toString() ?? "";
  result.hash = "";
  if (result.origin !== base.origin || !result.pathname.startsWith(basePath)) {
    fail("provider request escaped its configured origin");
  }
  return result.toString();
}

export function createProviderHttpRequest(input: {
  method: ProviderHttpMethod;
  url: string;
  headers: readonly ProviderHttpHeaderV1[];
  body: Uint8Array | null;
  credentialReference: CredentialReferenceV1;
  credentialOrigin: string;
  deadline: IsoInstant;
  signal: AbortSignal;
  maximumResponseBytes?: number;
}): ProviderHttpRequestV1 {
  const maximumResponseBytes = input.maximumResponseBytes ?? 2 * 1024 * 1024;
  if (
    !Number.isSafeInteger(maximumResponseBytes) ||
    maximumResponseBytes < 1 ||
    maximumResponseBytes > MAX_RESPONSE_BYTES
  ) {
    fail("maximum response bytes is invalid");
  }
  if (!(input.signal instanceof AbortSignal)) fail("HTTP signal is invalid");
  if (input.signal.aborted) fail("HTTP request was aborted before dispatch");
  if (input.body !== null && input.body.byteLength > MAX_RESPONSE_BYTES) {
    fail("HTTP request body exceeds the 8 MiB limit");
  }
  const url = safeUrl(input.url);
  const credentialScope = new URL(safeUrl(input.credentialOrigin));
  if (
    credentialScope.pathname !== "/" ||
    credentialScope.search !== "" ||
    credentialScope.hash !== ""
  ) {
    fail("provider credential scope must be an HTTPS origin");
  }
  const credentialOrigin = credentialScope.origin;
  if (new URL(url).origin !== credentialOrigin) {
    fail("provider credential scope does not match the request origin");
  }
  const validatedHeaders = safeHeaders(input.headers, true);
  const credentialReference = parseCredentialReference(input.credentialReference);
  const parsedDeadline = IsoInstantSchema.parse(input.deadline);
  const body = input.body === null ? null : Uint8Array.from(input.body);
  return {
    schemaVersion: 1,
    method: input.method,
    url,
    headers: validatedHeaders,
    body,
    credentialReference,
    credentialOrigin,
    maximumResponseBytes,
    deadline: parsedDeadline,
    signal: input.signal,
  };
}

export function validateProviderHttpResponse(
  value: unknown,
  maximumResponseBytes: number,
): ValidatedProviderHttpResponse {
  const source = record(value, "provider HTTP response");
  exact(source, ["schemaVersion", "status", "headers", "body"], "provider HTTP response");
  if (source.schemaVersion !== 1) fail("provider HTTP response schema is unsupported");
  const status = source.status;
  if (!Number.isSafeInteger(status) || (status as number) < 100 || (status as number) > 599) {
    fail("provider HTTP status is invalid");
  }
  if (!(source.body instanceof Uint8Array)) fail("provider HTTP body must be bytes");
  if (source.body.byteLength > maximumResponseBytes) {
    source.body.fill(0);
    fail("provider HTTP response exceeded its declared limit");
  }
  const headers = safeHeaders(source.headers, false);
  return {
    status: status as number,
    headers: new Map(headers.map((header) => [header.name, header.value])),
    body: source.body,
  };
}

export async function performProviderHttpRequest(
  transport: BoundedProviderHttpTransport,
  request: ProviderHttpRequestV1,
): Promise<ValidatedProviderHttpResponse> {
  let raw: unknown;
  try {
    raw = await transport.request(request);
    const parsed = validateProviderHttpResponse(raw, request.maximumResponseBytes);
    const ownedBody = Uint8Array.from(parsed.body);
    parsed.body.fill(0);
    return { ...parsed, body: ownedBody };
  } finally {
    request.body?.fill(0);
    if (raw !== null && typeof raw === "object") {
      try {
        const body = (raw as Readonly<{ body?: unknown }>).body;
        if (body instanceof Uint8Array) body.fill(0);
      } catch {
        // An injected transport is untrusted. Cleanup is best-effort for a Proxy.
      }
    }
  }
}

export function headerValue(response: ValidatedProviderHttpResponse, name: string): string | null {
  return response.headers.get(name) ?? null;
}
