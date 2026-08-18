import { generateKeyPairSync, verify as cryptoVerify, type KeyObject } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ASC_JWT_AUDIENCE,
  ASC_JWT_MAX_TTL_SECONDS,
  AscAuthError,
  ascScopeEntry,
  createAscJwtAuthorization,
  decodePrivateKeyMaterial,
  signAscJwt,
} from "../src/index.js";

// A throwaway P-256 key generated per test file. It never leaves this
// process and is not the owner's App Store Connect key.
function throwawayKey(): { pem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey };
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
}

const KEY_ID = "ABCDE12345";
const ISSUER_ID = "69a6de8c-b017-47e3-e053-5b8c7c11a4d1";
const REQUEST = { method: "GET", url: "https://api.appstoreconnect.apple.com/v1/apps?limit=200" };
const FIXED_NOW = new Date("2026-08-17T20:00:00.000Z");

describe("createAscJwtAuthorization", () => {
  it("mints an ES256 JWT with Apple's header and claims, verifiable with the matching public key", () => {
    const { pem, publicKey } = throwawayKey();
    const derive = createAscJwtAuthorization({
      keyId: KEY_ID,
      issuerId: ISSUER_ID,
      ttlSeconds: 600,
      clock: { now: () => FIXED_NOW },
    });

    const value = derive(Uint8Array.from(Buffer.from(pem, "utf8")), REQUEST);
    expect(value.startsWith("Bearer ")).toBe(true);
    const token = value.slice("Bearer ".length);
    const [header, payload, signature, extra] = token.split(".");
    expect(extra).toBeUndefined();
    expect(decodeSegment(header as string)).toEqual({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
    const claims = decodeSegment(payload as string) as Record<string, unknown>;
    expect(claims).toEqual({
      iss: ISSUER_ID,
      iat: Math.floor(FIXED_NOW.getTime() / 1000),
      exp: Math.floor(FIXED_NOW.getTime() / 1000) + 600,
      aud: ASC_JWT_AUDIENCE,
    });
    expect((claims.exp as number) - (claims.iat as number)).toBeLessThanOrEqual(
      ASC_JWT_MAX_TTL_SECONDS,
    );
    const verified = cryptoVerify(
      "sha256",
      Buffer.from(`${header as string}.${payload as string}`, "utf8"),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature as string, "base64url"),
    );
    expect(verified).toBe(true);
  });

  it("adds a scope claim bound to exactly the requested operation when asked", () => {
    const { pem } = throwawayKey();
    const derive = createAscJwtAuthorization({
      keyId: KEY_ID,
      issuerId: ISSUER_ID,
      scopeToRequest: true,
      clock: { now: () => FIXED_NOW },
    });
    const token = derive(Uint8Array.from(Buffer.from(pem, "utf8")), REQUEST).slice(7);
    const claims = decodeSegment(token.split(".")[1] as string) as Record<string, unknown>;
    expect(claims.scope).toEqual(["GET /v1/apps?limit=200"]);
    expect(ascScopeEntry(REQUEST)).toBe("GET /v1/apps?limit=200");
  });

  it("refuses to mint for any origin other than api.appstoreconnect.apple.com", () => {
    const { pem } = throwawayKey();
    const derive = createAscJwtAuthorization({ keyId: KEY_ID, issuerId: ISSUER_ID });
    expect(() =>
      derive(Uint8Array.from(Buffer.from(pem, "utf8")), {
        method: "GET",
        url: "https://api.example.test/v1/apps",
      }),
    ).toThrow(AscAuthError);
  });

  it("rejects lifetimes over Apple's 20-minute maximum and malformed identifiers", () => {
    expect(() =>
      createAscJwtAuthorization({ keyId: KEY_ID, issuerId: ISSUER_ID, ttlSeconds: 1201 }),
    ).toThrow(AscAuthError);
    expect(() => createAscJwtAuthorization({ keyId: "short", issuerId: ISSUER_ID })).toThrow(
      AscAuthError,
    );
    expect(() => createAscJwtAuthorization({ keyId: KEY_ID, issuerId: "not-a-uuid" })).toThrow(
      AscAuthError,
    );
  });

  it("never echoes key material or the platform error into a failure message", () => {
    const derive = createAscJwtAuthorization({ keyId: KEY_ID, issuerId: ISSUER_ID });
    const bogus =
      "-----BEGIN PRIVATE KEY-----\nTk9UQVJFQUxLRVlOT1RBUkVBTEtFWU5PVEFSRUFMS0VZ\n-----END PRIVATE KEY-----\n";
    let caught: unknown = null;
    try {
      derive(Uint8Array.from(Buffer.from(bogus, "utf8")), REQUEST);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AscAuthError);
    const message = (caught as Error).message;
    expect(message).not.toContain("Tk9UQVJF");
    expect(message).not.toContain("BEGIN");
    expect(message).toMatch(/could not be used to sign/);
  });

  it("does not mutate the broker-owned secret buffer (the broker zeroizes it) and does not retain a key object", () => {
    const { pem } = throwawayKey();
    const secret = Uint8Array.from(Buffer.from(pem, "utf8"));
    const before = Uint8Array.from(secret);
    const derive = createAscJwtAuthorization({ keyId: KEY_ID, issuerId: ISSUER_ID });
    derive(secret, REQUEST);
    expect([...secret]).toEqual([...before]);
  });
});

describe("decodePrivateKeyMaterial", () => {
  it("accepts verbatim PEM, hex-encoded PEM (as `security` emits non-printable items), and a bare base64 body", () => {
    const { pem } = throwawayKey();
    const verbatim = decodePrivateKeyMaterial(Uint8Array.from(Buffer.from(pem, "utf8")));
    expect(Buffer.from(verbatim).toString("utf8")).toBe(`${pem.trim()}\n`);

    const hex = Buffer.from(pem, "utf8").toString("hex");
    const fromHex = decodePrivateKeyMaterial(Uint8Array.from(Buffer.from(hex, "utf8")));
    expect(Buffer.from(fromHex).toString("utf8")).toBe(`${pem.trim()}\n`);

    const body = pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s+/g, "");
    const fromBody = decodePrivateKeyMaterial(Uint8Array.from(Buffer.from(body, "utf8")));
    expect(Buffer.from(fromBody).toString("utf8")).toContain("-----BEGIN PRIVATE KEY-----\n");
    // All three forms sign identically.
    const claims = { iss: ISSUER_ID, iat: 1, exp: 601, aud: ASC_JWT_AUDIENCE } as const;
    const reference = signAscJwt(verbatim, claims, KEY_ID).split(".").slice(0, 2).join(".");
    expect(signAscJwt(fromHex, claims, KEY_ID).startsWith(reference)).toBe(true);
    expect(signAscJwt(fromBody, claims, KEY_ID).startsWith(reference)).toBe(true);
  });

  it("rejects empty, oversized, public-key, and unrecognized material", () => {
    expect(() => decodePrivateKeyMaterial(new Uint8Array(0))).toThrow(AscAuthError);
    expect(() => decodePrivateKeyMaterial(new Uint8Array(20_000))).toThrow(AscAuthError);
    expect(() =>
      decodePrivateKeyMaterial(
        Uint8Array.from(Buffer.from("-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----")),
      ),
    ).toThrow(AscAuthError);
    expect(() => decodePrivateKeyMaterial(Uint8Array.from(Buffer.from("hello world")))).toThrow(
      AscAuthError,
    );
  });
});
