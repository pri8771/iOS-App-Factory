import { sign as cryptoSign } from "node:crypto";

import type {
  ProviderAuthorizationDerivation,
  ProviderAuthorizationRequestV1,
} from "@app-factory/provider-transport";

/**
 * App Store Connect API v1 authentication: an ES256 JWT per Apple's
 * "Generating Tokens for API Requests", signed with the team key's `.p8`.
 *
 * Trust boundary: the `.p8` bytes arrive only as the disposable buffer the
 * credential broker hands to a `ProviderAuthorizationDerivation` inside one
 * `withCredential` window. This module never stores that buffer, never
 * creates a long-lived `KeyObject` from it, and passes the PEM straight to
 * `crypto.sign` (which builds and discards its own key handle). The owned
 * decoded copy it makes (see `decodePrivateKeyMaterial`) is zeroized in a
 * `finally`. The resulting JWT is returned to the transport as the header
 * value and is never logged, persisted, or placed in an error message.
 */

export const ASC_API_ORIGIN = "https://api.appstoreconnect.apple.com";
export const ASC_JWT_AUDIENCE = "appstoreconnect-v1";
/** Apple rejects tokens valid for longer than 20 minutes. */
export const ASC_JWT_MAX_TTL_SECONDS = 20 * 60;
export const ASC_JWT_DEFAULT_TTL_SECONDS = 10 * 60;

const KEY_ID_PATTERN = /^[A-Z0-9]{10}$/;
const ISSUER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_KEY_MATERIAL_BYTES = 16 * 1024;

export class AscAuthError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AscAuthError";
  }
}

function fail(message: string): never {
  throw new AscAuthError(message);
}

export type AscClockPort = Readonly<{ now(): Date }>;

export type AscJwtAuthorizationOptions = Readonly<{
  /** The 10-character App Store Connect API key ID (JWT `kid`). Not secret. */
  keyId: string;
  /** The team's Issuer ID (JWT `iss`). Not secret. */
  issuerId: string;
  /** Token lifetime; default 600 s, hard maximum 1200 s (Apple's limit). */
  ttlSeconds?: number;
  /**
   * When true, every token carries a `scope` claim naming exactly the one
   * `METHOD /path?query` it is minted for, so the token is useless for any
   * other operation even if intercepted. Off by default: Apple documents the
   * claim but its exact query-matching rules are not something this package
   * has proven live yet.
   */
  scopeToRequest?: boolean;
  clock?: AscClockPort;
}>;

export function parseAscKeyId(value: unknown): string {
  if (typeof value !== "string" || !KEY_ID_PATTERN.test(value)) {
    fail("App Store Connect key ID must be 10 upper-case alphanumerics");
  }
  return value;
}

export function parseAscIssuerId(value: unknown): string {
  if (typeof value !== "string" || !ISSUER_ID_PATTERN.test(value)) {
    fail("App Store Connect issuer ID must be a lowercase UUID");
  }
  return value;
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function isHexText(text: string): boolean {
  return text.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(text);
}

/**
 * Turns whatever the Keychain returned for the `.p8` item into PEM bytes the
 * platform signer accepts. Handles the three ways `security` can hand a PEM
 * back (verbatim text; hex-encoded when the item was judged non-printable; a
 * bare base64 DER body with the armour stripped) — never anything else. The
 * returned buffer is a fresh, owned copy the caller must zeroize.
 */
export function decodePrivateKeyMaterial(secret: Uint8Array): Uint8Array {
  if (secret.byteLength === 0 || secret.byteLength > MAX_KEY_MATERIAL_BYTES) {
    fail("App Store Connect key material has an unusable length");
  }
  let text = Buffer.from(secret).toString("utf8").trim();
  if (/^0x/i.test(text) && isHexText(text.slice(2))) text = text.slice(2);
  if (isHexText(text) && !text.startsWith("-----")) {
    text = Buffer.from(text, "hex").toString("utf8").trim();
  }
  if (text.includes("\\n") && !text.includes("\n")) text = text.replaceAll("\\n", "\n");
  if (text.startsWith("-----BEGIN ") && text.includes("-----END ")) {
    if (!/^-----BEGIN (?:EC )?PRIVATE KEY-----/.test(text)) {
      fail("App Store Connect key material is not a private key PEM");
    }
    return Uint8Array.from(Buffer.from(`${text}\n`, "utf8"));
  }
  const compact = text.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length >= 64) {
    const lines = compact.match(/.{1,64}/g) ?? [];
    return Uint8Array.from(
      Buffer.from(
        `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`,
        "utf8",
      ),
    );
  }
  fail("App Store Connect key material is not in a recognized private key form");
}

export type AscJwtClaims = Readonly<{
  iss: string;
  iat: number;
  exp: number;
  aud: typeof ASC_JWT_AUDIENCE;
  scope?: readonly string[];
}>;

/**
 * Builds and signs one token. `privateKeyPem` is borrowed, not owned: the
 * caller (`createAscJwtAuthorization`) zeroizes it. Exported for tests that
 * sign with a throwaway key and decode the unsigned parts.
 */
export function signAscJwt(privateKeyPem: Uint8Array, claims: AscJwtClaims, keyId: string): string {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const signingInput = `${base64Url(Buffer.from(JSON.stringify(header), "utf8"))}.${base64Url(
    Buffer.from(JSON.stringify(claims), "utf8"),
  )}`;
  let signature: Buffer;
  try {
    signature = cryptoSign("sha256", Buffer.from(signingInput, "utf8"), {
      key: Buffer.from(privateKeyPem),
      format: "pem",
      dsaEncoding: "ieee-p1363",
    });
  } catch {
    // Deliberately drop the platform error: OpenSSL messages can echo key
    // fragments and never belong in a log or evidence string.
    fail("App Store Connect key material could not be used to sign (not a P-256 private key?)");
  }
  if (signature.byteLength !== 64) fail("App Store Connect signature has an unexpected length");
  return `${signingInput}.${base64Url(signature)}`;
}

/** `METHOD /path?query` as Apple's `scope` claim expects it. */
export function ascScopeEntry(request: ProviderAuthorizationRequestV1): string {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}${url.search}`;
}

/**
 * The `ProviderAuthorizationDerivation` for App Store Connect. Wire it into
 * `createFetchProviderHttpTransport({ credentials, authorization })`; the
 * transport calls it once per request with the just-resolved `.p8` bytes.
 */
export function createAscJwtAuthorization(
  options: AscJwtAuthorizationOptions,
): ProviderAuthorizationDerivation {
  const keyId = parseAscKeyId(options.keyId);
  const issuerId = parseAscIssuerId(options.issuerId);
  const ttlSeconds = options.ttlSeconds ?? ASC_JWT_DEFAULT_TTL_SECONDS;
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 30 ||
    ttlSeconds > ASC_JWT_MAX_TTL_SECONDS
  ) {
    fail(`App Store Connect JWT lifetime must be 30..${String(ASC_JWT_MAX_TTL_SECONDS)} seconds`);
  }
  const clock = options.clock ?? { now: () => new Date() };
  const scopeToRequest = options.scopeToRequest ?? false;

  return (secret, request) => {
    if (new URL(request.url).origin !== ASC_API_ORIGIN) {
      fail("App Store Connect tokens are only minted for api.appstoreconnect.apple.com");
    }
    const pem = decodePrivateKeyMaterial(secret);
    try {
      const iat = Math.floor(clock.now().getTime() / 1000);
      const claims: AscJwtClaims = {
        iss: issuerId,
        iat,
        exp: iat + ttlSeconds,
        aud: ASC_JWT_AUDIENCE,
        ...(scopeToRequest ? { scope: [ascScopeEntry(request)] } : {}),
      };
      return `Bearer ${signAscJwt(pem, claims, keyId)}`;
    } finally {
      pem.fill(0);
    }
  };
}
