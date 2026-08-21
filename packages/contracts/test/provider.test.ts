import { describe, expect, it } from "vitest";

import {
  CredentialReferenceV1Schema,
  MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1,
  ProviderFamilyV1Schema,
  ProviderHealthEntryV1Schema,
  ProviderHealthReportV1Schema,
  ProviderHealthStatusV1Schema,
  ProviderInstanceV1Schema,
  ProviderUpsertSpecV1Schema,
} from "../src/index.js";

function credentialReference(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    kind: "macos-keychain",
    service: "app-factory.provider.openrouter-fast",
    account: "openrouter-fast",
    ...overrides,
  };
}

describe("ProviderFamilyV1Schema", () => {
  it("accepts every known family", () => {
    for (const family of ["codex", "claude", "gemini", "ollama", "openrouter"]) {
      expect(ProviderFamilyV1Schema.safeParse(family).success).toBe(true);
    }
  });

  it("rejects an unknown family", () => {
    expect(ProviderFamilyV1Schema.safeParse("chatgpt").success).toBe(false);
  });
});

describe("CredentialReferenceV1Schema", () => {
  it("accepts a well-formed macOS Keychain reference and round-trips through JSON", () => {
    const parsed = CredentialReferenceV1Schema.parse(credentialReference());
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejects any schemaVersion or kind other than the one supported contract", () => {
    expect(
      CredentialReferenceV1Schema.safeParse(credentialReference({ schemaVersion: 2 })).success,
    ).toBe(false);
    expect(
      CredentialReferenceV1Schema.safeParse(credentialReference({ kind: "env-var" })).success,
    ).toBe(false);
  });

  it("rejects a service or account containing an unsafe character", () => {
    expect(
      CredentialReferenceV1Schema.safeParse(credentialReference({ service: "line1\nline2" }))
        .success,
    ).toBe(false);
    expect(
      CredentialReferenceV1Schema.safeParse(credentialReference({ account: "null\0byte" })).success,
    ).toBe(false);
  });

  it("never carries the secret itself -- only the strict service/account reference shape", () => {
    expect(
      CredentialReferenceV1Schema.safeParse(credentialReference({ secret: "sk-do-not-leak" }))
        .success,
    ).toBe(false);
  });
});

describe("ProviderInstanceV1Schema", () => {
  function instance(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      key: "openrouter-fast",
      family: "openrouter",
      model: "anthropic/claude-3.7-sonnet",
      displayName: "Fast (OpenRouter)",
      credentialReference: null,
      ...overrides,
    };
  }

  it("accepts an instance with no credential yet and one with a credential reference", () => {
    expect(ProviderInstanceV1Schema.safeParse(instance()).success).toBe(true);
    expect(
      ProviderInstanceV1Schema.safeParse(instance({ credentialReference: credentialReference() }))
        .success,
    ).toBe(true);
  });

  it("rejects an unknown extra field (strict shape)", () => {
    expect(ProviderInstanceV1Schema.safeParse(instance({ apiKey: "leaked" })).success).toBe(false);
  });
});

describe("ProviderUpsertSpecV1Schema", () => {
  it("accepts key/family/model/displayName with no credential field at all", () => {
    expect(
      ProviderUpsertSpecV1Schema.safeParse({
        key: "ollama",
        family: "ollama",
        model: "qwen2.5-coder:14b",
        displayName: "Ollama",
      }).success,
    ).toBe(true);
  });

  it("never accepts a credentialReference or a bare secret -- upsert never carries a credential", () => {
    expect(
      ProviderUpsertSpecV1Schema.safeParse({
        key: "ollama",
        family: "ollama",
        model: "qwen2.5-coder:14b",
        displayName: "Ollama",
        credentialReference: null,
      }).success,
    ).toBe(false);
    expect(
      ProviderUpsertSpecV1Schema.safeParse({
        key: "openrouter-fast",
        family: "openrouter",
        model: "anthropic/claude-3.7-sonnet",
        displayName: "Fast",
        secret: "sk-leak",
      }).success,
    ).toBe(false);
  });
});

describe("ProviderHealthReportV1Schema / ProviderHealthEntryV1Schema", () => {
  it("accepts every health status with fully honest nulls", () => {
    for (const status of ProviderHealthStatusV1Schema.options) {
      expect(
        ProviderHealthReportV1Schema.safeParse({
          status,
          detail: null,
          latencyMs: null,
          version: null,
        }).success,
      ).toBe(true);
    }
  });

  it("accepts an ok report with measured latency and version", () => {
    expect(
      ProviderHealthReportV1Schema.safeParse({
        status: "ok",
        detail: null,
        latencyMs: 42,
        version: "0.42.0",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      ProviderHealthReportV1Schema.safeParse({
        status: "healthy",
        detail: null,
        latencyMs: null,
        version: null,
      }).success,
    ).toBe(false);
  });

  it("pairs a report with the instance key it describes", () => {
    expect(
      ProviderHealthEntryV1Schema.safeParse({
        key: "codex",
        report: {
          status: "not-configured",
          detail: "no credential on file",
          latencyMs: null,
          version: null,
        },
      }).success,
    ).toBe(true);
  });
});

describe("MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1", () => {
  it("is a positive bound suitable for a bounded secret string field", () => {
    expect(MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1).toBeGreaterThan(0);
  });
});
