import type { CredentialBroker } from "@app-factory/credential-broker";
import {
  createProviderHttpRequest,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
  type ProviderHttpRequestV1,
} from "@app-factory/provider-http-adapters";

/**
 * Names that must never arrive as caller-supplied request headers. The
 * `provider-http-adapters` contract (`createProviderHttpRequest`) already
 * hard-rejects these; this transport re-checks them at the point it is about
 * to attach a resolved credential, because the transport is the trusted
 * authentication boundary and must not rely solely on an upstream guarantee.
 */
const FORBIDDEN_REQUEST_HEADER_NAMES = new Set(["authorization", "cookie"]);

export class ProviderTransportError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProviderTransportError";
  }
}

export type ProviderTransportFetch = typeof fetch;

export type ProviderTransportClockPort = Readonly<{ now(): Date }>;

/**
 * The subset of a validated request an authorization derivation may see:
 * enough to bind a derived token to the exact operation (for example an
 * App Store Connect JWT `scope` claim), never headers, body, or credentials.
 */
export type ProviderAuthorizationRequestV1 = Readonly<{
  method: string;
  url: string;
}>;

/**
 * Derives the outbound `Authorization` header value from the just-resolved
 * Keychain secret. The default (when no derivation is supplied) is the
 * verbatim secret, for credentials provisioned as a complete header value.
 * A derivation exists for providers whose Keychain item is signing material
 * rather than a bearer token (App Store Connect's `.p8` -> ES256 JWT): it is
 * invoked once per dispatched request, inside the broker's `withCredential`
 * window, and must not retain, copy beyond its own call, log, or persist
 * `secret` — the broker zeroizes the buffer the moment this call returns.
 */
export type ProviderAuthorizationDerivation = (
  secret: Uint8Array,
  request: ProviderAuthorizationRequestV1,
) => string;

export type CreateFetchProviderHttpTransportOptions = Readonly<{
  /**
   * Sole trusted source of the outbound Authorization value. The transport
   * resolves it just-in-time, for the exact duration of one dispatched HTTP
   * request, and never retains or caches it beyond that call.
   */
  credentials: CredentialBroker;
  /**
   * Optional: derive the Authorization value from the resolved secret instead
   * of sending it verbatim. See `ProviderAuthorizationDerivation`.
   */
  authorization?: ProviderAuthorizationDerivation;
  /** Injectable for deterministic tests; defaults to the platform `fetch`. */
  fetch?: ProviderTransportFetch;
  clock?: ProviderTransportClockPort;
}>;

function fail(message: string): never {
  throw new ProviderTransportError(message);
}

function zero(bytes: Uint8Array): void {
  bytes.fill(0);
}

function zeroAll(chunks: readonly Uint8Array[]): void {
  for (const chunk of chunks) zero(chunk);
}

function assertNoCredentialHeaders(headers: readonly ProviderHttpHeaderV1[]): void {
  for (const header of headers) {
    if (FORBIDDEN_REQUEST_HEADER_NAMES.has(header.name)) {
      fail(
        `caller-supplied "${header.name}" header is not permitted; only the transport may attach credentials`,
      );
    }
  }
}

/**
 * By default the Keychain-stored secret is treated as the complete, verbatim
 * Authorization header value (whatever scheme the provisioning process wrote
 * there, e.g. "Bearer <token>" or "Basic <base64>"). This keeps the
 * transport free of any provider-specific authentication-scheme knowledge;
 * a provider that needs a derived value supplies a
 * `ProviderAuthorizationDerivation` and the transport still applies the same
 * header-safety check to whatever it returns.
 */
function credentialHeaderValue(
  secret: Uint8Array,
  request: ProviderAuthorizationRequestV1,
  derive: ProviderAuthorizationDerivation | undefined,
): string {
  const value =
    derive === undefined ? Buffer.from(secret).toString("utf8") : derive(secret, request);
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 8_192 ||
    /[\0\r\n]/.test(value)
  ) {
    fail("resolved credential value is not a safe HTTP header value");
  }
  return value;
}

function remainingMillis(deadline: string, clock: ProviderTransportClockPort): number {
  return Date.parse(deadline) - clock.now().getTime();
}

/**
 * Reads a response body under a hard byte cap, counting bytes as they
 * stream in rather than trusting any declared Content-Length. Any bytes
 * already read are zeroized before the cap violation is raised.
 */
async function readBoundedBody(
  response: Response,
  maximumResponseBytes: number,
  controller: AbortController,
): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined || value.byteLength === 0) continue;
        total += value.byteLength;
        if (total > maximumResponseBytes) {
          zero(value);
          const overLimit = new ProviderTransportError(
            "provider response exceeded its declared maximum byte length",
          );
          controller.abort(overLimit);
          try {
            await reader.cancel(overLimit);
          } catch {
            // Best-effort: the stream is already being torn down by the abort.
          }
          throw overLimit;
        }
        chunks.push(value);
      }
    } catch (error) {
      // Any failure while streaming (the byte cap above, a network reset, an
      // aborted deadline mid-read, ...) must not leave partially-read
      // response bytes sitting unzeroized in memory.
      zeroAll(chunks);
      chunks.length = 0;
      throw error;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released by cancel() on the over-limit path above.
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
    zero(chunk);
  }
  chunks.length = 0;
  return body;
}

/**
 * A fetch-based implementation of the `BoundedProviderHttpTransport`
 * contract declared in `provider-http-adapters/src/http.ts`. This module
 * contains no adapter/provider-specific logic: it only dispatches an
 * already-validated `ProviderHttpRequestV1`, attaches the resolved
 * credential when (and only when) the request's URL origin matches the
 * bound credential scope, enforces the deadline and byte cap, and zeroizes
 * every buffer it owns once it is no longer needed.
 */
export function createFetchProviderHttpTransport(
  options: CreateFetchProviderHttpTransportOptions,
): BoundedProviderHttpTransport {
  const doFetch = options.fetch ?? fetch;
  const credentials = options.credentials;
  const clock = options.clock ?? { now: () => new Date() };

  return {
    async request(request: ProviderHttpRequestV1): Promise<unknown> {
      // Fail fast on a caller-supplied credential header before doing any
      // other work (no Keychain access, no network call).
      assertNoCredentialHeaders(request.headers);

      // Compose with, rather than duplicate, the contract's own validation:
      // this re-derives and re-checks the HTTPS-only URL, the request
      // header allowlist (including the authorization/cookie rejection
      // above), the credential-origin binding, the deadline shape, and the
      // body size cap. `validated.body` is an owned copy, independent of
      // the caller's buffer.
      const validated = createProviderHttpRequest({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        credentialReference: request.credentialReference,
        credentialOrigin: request.credentialOrigin,
        deadline: request.deadline,
        signal: request.signal,
        maximumResponseBytes: request.maximumResponseBytes,
      });

      try {
        if (validated.signal.aborted) fail("request aborted before dispatch");
        const remaining = remainingMillis(validated.deadline, clock);
        if (!Number.isFinite(remaining) || remaining <= 0) {
          fail("request deadline has already elapsed");
        }

        // Explicit, testable re-check immediately before a credential is
        // ever attached. `createProviderHttpRequest` already guarantees
        // this, but the transport does not attach a secret to any request
        // on the strength of an upstream guarantee alone.
        if (new URL(validated.url).origin !== validated.credentialOrigin) {
          fail(
            "request URL origin does not match the bound credential scope; refusing to dispatch",
          );
        }

        const controller = new AbortController();
        const onParentAbort = (): void => {
          controller.abort(validated.signal.reason);
        };
        validated.signal.addEventListener("abort", onParentAbort, { once: true });
        const deadlineTimer = setTimeout(() => {
          controller.abort(new ProviderTransportError("request deadline elapsed"));
        }, remaining);

        try {
          return await credentials.withCredential(
            validated.credentialReference,
            controller.signal,
            async (secret) => {
              const authorization = credentialHeaderValue(
                secret,
                { method: validated.method, url: validated.url },
                options.authorization,
              );
              const fetchHeaders = new Headers();
              for (const header of validated.headers) fetchHeaders.set(header.name, header.value);
              fetchHeaders.set("authorization", authorization);

              const response = await doFetch(validated.url, {
                method: validated.method,
                headers: fetchHeaders,
                redirect: "manual",
                signal: controller.signal,
                ...(validated.body === null ? {} : { body: validated.body }),
              });

              const body = await readBoundedBody(
                response,
                validated.maximumResponseBytes,
                controller,
              );
              const headers: ProviderHttpHeaderV1[] = [];
              response.headers.forEach((value, name) => {
                headers.push({ name: name.toLowerCase(), value });
              });
              return {
                schemaVersion: 1 as const,
                status: response.status,
                headers,
                body,
              };
            },
          );
        } finally {
          clearTimeout(deadlineTimer);
          validated.signal.removeEventListener("abort", onParentAbort);
        }
      } finally {
        // `validated.body` is this call's own copy (see above); the
        // caller's original buffer is zeroized independently by
        // `performProviderHttpRequest`.
        validated.body?.fill(0);
      }
    },
  };
}
