import { EffectiveConfigurationV1Schema } from "../src/v1/effective-config.js";
import { describe, expect, it } from "vitest";

describe("EffectiveConfigurationV1Schema", () => {
  it("accepts a minimal redacted effective configuration", () => {
    const parsed = EffectiveConfigurationV1Schema.parse({
      schemaVersion: 1,
      sourcedAt: "2026-09-08T14:00:00.000Z",
      registryDigest: null,
      registryUnavailableReason: "No provider registry is composed.",
      defaultProvider: {
        key: { value: null, source: "unavailable", detail: "unset" },
        resolvesToConfiguredProvider: false,
        unresolvedReason: "Default provider setting is unset.",
      },
      providers: [],
      phaseRoles: [],
    });
    expect(parsed.providers).toEqual([]);
  });

  it("rejects raw secret-shaped credential payloads via strict credential presence shape", () => {
    expect(() =>
      EffectiveConfigurationV1Schema.parse({
        schemaVersion: 1,
        sourcedAt: "2026-09-08T14:00:00.000Z",
        registryDigest: null,
        registryUnavailableReason: null,
        defaultProvider: {
          key: { value: "codex", source: "settings-override", detail: null },
          resolvesToConfiguredProvider: true,
          unresolvedReason: null,
        },
        providers: [
          {
            key: "codex",
            family: "codex",
            displayName: { value: "Codex", source: "explicit-config", detail: null },
            requestedModel: { value: "gpt-5", source: "explicit-config", detail: null },
            observedModel: { value: null, source: "unavailable", detail: "none" },
            maxOutputTokens: { value: null, source: "invalid", detail: "n/a" },
            maxOutputTokensApplicable: false,
            credential: {
              present: true,
              service: "svc",
              account: "acct",
              source: "explicit-config",
              secret: "sk-leak",
            },
            healthStatus: null,
            healthDetail: null,
            configurationState: "ok",
          },
        ],
        phaseRoles: [],
      }),
    ).toThrow();
  });
});
