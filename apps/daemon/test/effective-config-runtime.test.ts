import {
  EffectiveConfigurationV1Schema,
  ProviderInstanceV1Schema,
  RoomProviderSchema,
  type ProviderHealthEntryV1,
} from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  FAMILY_DEFAULT_MODELS_V1,
  assertEffectiveConfigurationRedacted,
  buildConfigEffectiveResultV1,
  resolveEffectiveConfigurationV1,
} from "../src/effective-config-runtime.js";

const SOURCED_AT = "2026-09-08T14:00:00.000Z";

describe("resolveEffectiveConfigurationV1", () => {
  it("attributes family defaults, explicit overrides, and redacts credentials to presence only", () => {
    const configuration = resolveEffectiveConfigurationV1({
      sourcedAt: SOURCED_AT,
      registryDigest: null,
      registryUnavailableReason: null,
      defaultProviderKey: "ollama-fast",
      defaultProviderSource: "settings-override",
      providers: [
        {
          key: RoomProviderSchema.parse("ollama-fast"),
          family: "ollama",
          displayName: "Ollama Fast",
          model: FAMILY_DEFAULT_MODELS_V1.ollama,
          modelExplicit: false,
          displayNameExplicit: true,
          maxOutputTokens: 1000,
          maxOutputTokensExplicit: true,
          credentialService: null,
          credentialAccount: null,
        },
        {
          key: RoomProviderSchema.parse("openrouter-fast"),
          family: "openrouter",
          displayName: "OpenRouter Fast",
          model: "anthropic/claude-sonnet-4",
          modelExplicit: true,
          displayNameExplicit: true,
          maxOutputTokens: null,
          maxOutputTokensExplicit: false,
          credentialService: "app-factory.provider.openrouter-fast",
          credentialAccount: "openrouter-fast",
        },
        {
          key: RoomProviderSchema.parse("codex"),
          family: "codex",
          displayName: "Codex",
          model: "gpt-5",
          modelExplicit: true,
          displayNameExplicit: true,
          maxOutputTokens: null,
          maxOutputTokensExplicit: false,
          credentialService: null,
          credentialAccount: null,
        },
      ],
      phaseRoles: [
        {
          phaseId: "review",
          presetId: "default",
          roleLabel: "reviewer",
          providerKey: "codex",
          tokenBudget: 4000,
        },
        {
          phaseId: "review",
          presetId: "default",
          roleLabel: "missing",
          providerKey: "missing-provider",
          tokenBudget: null,
        },
      ],
    });

    expect(EffectiveConfigurationV1Schema.parse(configuration).schemaVersion).toBe(1);
    expect(configuration.defaultProvider.resolvesToConfiguredProvider).toBe(true);
    expect(configuration.providers[0]?.requestedModel.source).toBe("family-default");
    expect(configuration.providers[1]?.requestedModel.source).toBe("explicit-config");
    expect(configuration.providers[1]?.credential.present).toBe(true);
    expect(configuration.providers[1]?.credential.service).toBe(
      "app-factory.provider.openrouter-fast",
    );
    expect(configuration.providers[2]?.maxOutputTokensApplicable).toBe(false);
    expect(configuration.providers[2]?.maxOutputTokens.source).toBe("invalid");
    expect(configuration.phaseRoles[0]?.providerResolved).toBe(true);
    expect(configuration.phaseRoles[1]?.providerResolved).toBe(false);
    assertEffectiveConfigurationRedacted(configuration);
  });

  it("marks unavailable registry, stale health, invalid CLI caps, and observed model identity", () => {
    const healthByKey = new Map<string, ProviderHealthEntryV1>([
      [
        "ollama-fast",
        {
          key: RoomProviderSchema.parse("ollama-fast"),
          report: {
            status: "ok",
            detail: null,
            latencyMs: 12,
            version: "ollama-0.1-observed",
          },
        },
      ],
      [
        "openrouter-fast",
        {
          key: RoomProviderSchema.parse("openrouter-fast"),
          report: {
            status: "unreachable",
            detail: "HTTP 503",
            latencyMs: 5,
            version: null,
          },
        },
      ],
    ]);

    const configuration = resolveEffectiveConfigurationV1({
      sourcedAt: SOURCED_AT,
      registryDigest: null,
      registryUnavailableReason: null,
      defaultProviderKey: null,
      defaultProviderSource: "unavailable",
      providers: [
        {
          key: RoomProviderSchema.parse("ollama-fast"),
          family: "ollama",
          displayName: "Ollama Fast",
          model: "llama3.2",
          modelExplicit: true,
          displayNameExplicit: true,
          maxOutputTokens: 500,
          maxOutputTokensExplicit: true,
          credentialService: null,
          credentialAccount: null,
        },
        {
          key: RoomProviderSchema.parse("openrouter-fast"),
          family: "openrouter",
          displayName: "OpenRouter Fast",
          model: "x",
          modelExplicit: true,
          displayNameExplicit: true,
          maxOutputTokens: 100,
          maxOutputTokensExplicit: true,
          credentialService: "svc",
          credentialAccount: "acct",
        },
        {
          key: RoomProviderSchema.parse("claude"),
          family: "claude",
          displayName: "Claude",
          model: "claude-sonnet",
          modelExplicit: true,
          displayNameExplicit: true,
          maxOutputTokens: 10,
          maxOutputTokensExplicit: true,
          credentialService: null,
          credentialAccount: null,
        },
      ],
      healthByKey,
      phaseRoles: [],
    });

    expect(configuration.providers[0]?.observedModel.value).toBe("ollama-0.1-observed");
    expect(configuration.providers[0]?.observedModel.source).toBe("observed-probe");
    expect(configuration.providers[1]?.configurationState).toBe("stale");
    expect(configuration.providers[2]?.configurationState).toBe("invalid");
    expect(configuration.defaultProvider.key.source).toBe("unavailable");
  });

  it("reports unavailable registry honestly", () => {
    const configuration = resolveEffectiveConfigurationV1({
      sourcedAt: SOURCED_AT,
      registryDigest: null,
      registryUnavailableReason: "No provider registry is composed.",
      defaultProviderKey: "codex",
      defaultProviderSource: "settings-override",
      providers: [],
      phaseRoles: [],
    });
    expect(configuration.registryUnavailableReason).toContain("No provider registry");
    expect(configuration.defaultProvider.resolvesToConfiguredProvider).toBe(false);
  });
});

describe("buildConfigEffectiveResultV1", () => {
  it("builds a command result from provider instances without leaking secrets", () => {
    const instance = ProviderInstanceV1Schema.parse({
      key: "openrouter-fast",
      family: "openrouter",
      model: "anthropic/claude-sonnet-4",
      displayName: "OpenRouter Fast",
      credentialReference: {
        schemaVersion: 1,
        kind: "macos-keychain",
        service: "app-factory.provider.openrouter-fast",
        account: "openrouter-fast",
      },
      maxOutputTokens: 1000,
    });
    const result = buildConfigEffectiveResultV1({
      sourcedAt: SOURCED_AT,
      defaultProviderSetting: {
        key: "default-provider",
        value: RoomProviderSchema.parse("openrouter-fast"),
        updatedAt: SOURCED_AT,
      },
      providers: [instance],
      registryDigest: null,
      registryUnavailableReason: null,
      presets: [],
    });
    expect(result.operation).toBe("config.effective");
    if (result.operation === "config.effective") {
      expect(result.configuration.providers).toHaveLength(1);
      assertEffectiveConfigurationRedacted(result.configuration);
      expect(JSON.stringify(result)).not.toMatch(/sk-/);
    }
  });
});
