import {
  EffectiveConfigurationV1Schema,
  RoomProviderSchema,
  type CommandResultV1,
  type EffectiveConfigurationV1,
  type EffectiveCredentialPresenceV1,
  type EffectivePhaseRoleV1,
  type EffectiveProviderEntryV1,
  type IsoInstant,
  type PhasePresetV1,
  type ProviderFamilyV1,
  type ProviderHealthEntryV1,
  type ProviderHealthStatusV1,
  type ProviderInstanceV1,
  type RoomProvider,
  type Sha256Digest,
  type StudioSettingEntryV1,
} from "@app-factory/contracts";

/**
 * OR-23 pure resolver: builds source-attributed effective configuration without reading
 * environment secrets or echoing credential material. Inputs are already-sanitized roster,
 * settings, phase casts, and optional health observations.
 */

const CLI_FAMILIES = new Set<ProviderFamilyV1>(["codex", "claude", "gemini"]);
const TOKEN_CAP_FAMILIES = new Set<ProviderFamilyV1>(["ollama", "openrouter"]);

/** Family defaults used when an ollama/openrouter slot omits an explicit model. */
export const FAMILY_DEFAULT_MODELS_V1: Readonly<Record<"ollama" | "openrouter", string>> = {
  ollama: "llama3.2",
  openrouter: "openrouter/auto",
};

export type EffectiveConfigProviderInputV1 = Readonly<{
  key: RoomProvider;
  family: ProviderFamilyV1;
  displayName: string;
  model: string;
  modelExplicit: boolean;
  displayNameExplicit: boolean;
  maxOutputTokens: number | null;
  maxOutputTokensExplicit: boolean;
  credentialService: string | null;
  credentialAccount: string | null;
}>;

export type EffectiveConfigPhaseRoleInputV1 = Readonly<{
  phaseId: string;
  presetId: string | null;
  roleLabel: string;
  providerKey: string | null;
  tokenBudget: number | null;
}>;

export type ResolveEffectiveConfigurationInputV1 = Readonly<{
  sourcedAt: string;
  registryDigest: Sha256Digest | null;
  registryUnavailableReason: string | null;
  defaultProviderKey: string | null;
  defaultProviderSource: "settings-override" | "unavailable";
  providers: readonly EffectiveConfigProviderInputV1[];
  healthByKey?: ReadonlyMap<string, ProviderHealthEntryV1>;
  phaseRoles: readonly EffectiveConfigPhaseRoleInputV1[];
  registryStale?: boolean;
  registryInvalid?: boolean;
  registryInvalidDetail?: string | null;
}>;

function attributed(
  value: string | number | boolean | null,
  source: EffectiveProviderEntryV1["requestedModel"]["source"],
  detail: string | null = null,
): EffectiveProviderEntryV1["requestedModel"] {
  return { value, source, detail };
}

function credentialPresence(
  service: string | null,
  account: string | null,
): EffectiveCredentialPresenceV1 {
  const present = service !== null && account !== null;
  return {
    present,
    service,
    account,
    source: present ? "explicit-config" : "unavailable",
  };
}

function resolveProviderEntry(
  input: EffectiveConfigProviderInputV1,
  health: ProviderHealthEntryV1 | undefined,
  registryState: "ok" | "unavailable" | "invalid" | "stale",
): EffectiveProviderEntryV1 {
  const maxApplicable = TOKEN_CAP_FAMILIES.has(input.family);
  const requestedModel = attributed(
    input.model,
    input.modelExplicit ? "explicit-config" : "family-default",
    input.modelExplicit
      ? null
      : `Family default for ${input.family} applied because no explicit model was configured.`,
  );

  let observedModel = attributed(
    null,
    "unavailable",
    "No probe observation is available for this provider yet.",
  );
  let healthStatus: ProviderHealthStatusV1 | null = null;
  let healthDetail: string | null = null;

  if (health !== undefined) {
    healthStatus = health.report.status;
    healthDetail = health.report.detail;
    if (health.report.version !== null && health.report.version.length > 0) {
      observedModel = attributed(health.report.version, "observed-probe", null);
    } else if (health.report.status === "ok") {
      observedModel = attributed(
        input.model,
        "observed-probe",
        "Probe succeeded without a distinct observed model/version string; requested model is reported as observed.",
      );
    } else {
      observedModel = attributed(null, "unavailable", health.report.detail);
    }
  }

  let configurationState: EffectiveProviderEntryV1["configurationState"] = registryState;
  if (registryState === "ok") {
    if (CLI_FAMILIES.has(input.family) && input.maxOutputTokens !== null) {
      configurationState = "invalid";
    } else if (healthStatus === "not-configured" || healthStatus === "unauthenticated") {
      configurationState = "unavailable";
    } else if (healthStatus === "blocked" || healthStatus === "unreachable") {
      configurationState = "stale";
    }
  }

  return {
    key: input.key,
    family: input.family,
    displayName: attributed(
      input.displayName,
      input.displayNameExplicit ? "explicit-config" : "family-default",
      null,
    ),
    requestedModel,
    observedModel,
    maxOutputTokens: maxApplicable
      ? attributed(
          input.maxOutputTokens,
          input.maxOutputTokensExplicit
            ? "explicit-config"
            : input.maxOutputTokens === null
              ? "unavailable"
              : "family-default",
          input.maxOutputTokensExplicit
            ? null
            : input.maxOutputTokens === null
              ? "No explicit output cap; adapter family default applies at dispatch."
              : null,
        )
      : attributed(
          null,
          "invalid",
          `maxOutputTokens is not applicable to ${input.family}; CLI families refuse a non-null cap.`,
        ),
    maxOutputTokensApplicable: maxApplicable,
    credential: credentialPresence(input.credentialService, input.credentialAccount),
    healthStatus,
    healthDetail,
    configurationState,
  };
}

function resolvePhaseRole(
  role: EffectiveConfigPhaseRoleInputV1,
  configuredKeys: ReadonlySet<string>,
): EffectivePhaseRoleV1 {
  const providerKey = role.providerKey;
  const providerResolved = providerKey !== null && configuredKeys.has(providerKey);
  return {
    phaseId: role.phaseId,
    presetId: role.presetId,
    roleLabel: role.roleLabel,
    providerKey: attributed(
      providerKey,
      providerKey === null ? "unavailable" : "phase-cast",
      providerKey === null ? "Phase cast did not name a provider." : null,
    ),
    tokenBudget: attributed(
      role.tokenBudget,
      role.tokenBudget === null ? "unavailable" : "phase-budget",
      role.tokenBudget === null ? "No phase token budget override." : null,
    ),
    providerResolved,
    providerMissingReason: providerResolved
      ? null
      : providerKey === null
        ? "Phase cast omitted provider."
        : `Provider "${providerKey}" is not present in the effective registry.`,
  };
}

export function resolveEffectiveConfigurationV1(
  input: ResolveEffectiveConfigurationInputV1,
): EffectiveConfigurationV1 {
  const registryState: EffectiveProviderEntryV1["configurationState"] = input.registryInvalid
    ? "invalid"
    : input.registryStale
      ? "stale"
      : input.registryUnavailableReason !== null
        ? "unavailable"
        : "ok";

  const providers = input.providers.map((provider) =>
    resolveProviderEntry(provider, input.healthByKey?.get(provider.key), registryState),
  );
  const configuredKeys = new Set<string>(providers.map((entry) => entry.key as string));
  const defaultKey = input.defaultProviderKey;
  const defaultResolves = defaultKey !== null && configuredKeys.has(defaultKey as string);

  const configuration = {
    schemaVersion: 1 as const,
    sourcedAt: input.sourcedAt,
    registryDigest: input.registryDigest,
    registryUnavailableReason: input.registryInvalid
      ? (input.registryInvalidDetail ?? "Provider registry configuration is invalid.")
      : input.registryUnavailableReason,
    defaultProvider: {
      key: attributed(
        defaultKey,
        input.defaultProviderSource,
        defaultKey === null ? "No default-provider setting is configured." : null,
      ),
      resolvesToConfiguredProvider: defaultResolves,
      unresolvedReason: defaultResolves
        ? null
        : defaultKey === null
          ? "Default provider setting is unset."
          : `Default provider "${defaultKey}" is not in the configured registry.`,
    },
    providers,
    phaseRoles: input.phaseRoles.map((role) => resolvePhaseRole(role, configuredKeys)),
  };

  return EffectiveConfigurationV1Schema.parse(configuration);
}

/** Assert a payload never contains raw secret-like keys (defense-in-depth for tests). */
export function assertEffectiveConfigurationRedacted(value: unknown): void {
  const json = JSON.stringify(value);
  const forbidden = [
    /"secret"\s*:/i,
    /"password"\s*:/i,
    /"apiKey"\s*:/i,
    /"token"\s*:/i,
    /sk-[a-z0-9]/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(json)) {
      throw new Error(
        `Effective configuration leaked a forbidden secret-shaped field (${String(pattern)}).`,
      );
    }
  }
}

export function providerInstanceToEffectiveInputV1(
  instance: ProviderInstanceV1,
): EffectiveConfigProviderInputV1 {
  const familyDefault =
    instance.family === "ollama" || instance.family === "openrouter"
      ? FAMILY_DEFAULT_MODELS_V1[instance.family]
      : null;
  const modelExplicit = familyDefault === null ? true : instance.model !== familyDefault;
  return {
    key: instance.key,
    family: instance.family,
    displayName: instance.displayName,
    model: instance.model,
    modelExplicit,
    displayNameExplicit: true,
    maxOutputTokens: instance.maxOutputTokens,
    maxOutputTokensExplicit: instance.maxOutputTokens !== null,
    credentialService: instance.credentialReference?.service ?? null,
    credentialAccount: instance.credentialReference?.account ?? null,
  };
}

export function phasePresetsToEffectiveRoleInputsV1(
  presets: readonly PhasePresetV1[],
): EffectiveConfigPhaseRoleInputV1[] {
  const roles: EffectiveConfigPhaseRoleInputV1[] = [];
  for (const preset of presets) {
    for (const phase of preset.phases) {
      const budget = phase.tokenBudget?.maxTotalTokens ?? null;
      for (const participant of phase.cast.participants) {
        roles.push({
          phaseId: phase.phaseId,
          presetId: preset.presetId,
          roleLabel: participant.persona ?? participant.provider,
          providerKey: participant.provider,
          tokenBudget: budget,
        });
      }
      if (phase.cast.coordinator !== null) {
        roles.push({
          phaseId: phase.phaseId,
          presetId: preset.presetId,
          roleLabel: "coordinator",
          providerKey: phase.cast.coordinator.provider,
          tokenBudget: budget,
        });
      }
      if (phase.cast.grader !== null) {
        roles.push({
          phaseId: phase.phaseId,
          presetId: preset.presetId,
          roleLabel: "grader",
          providerKey: phase.cast.grader.provider,
          tokenBudget: budget,
        });
      }
    }
  }
  return roles;
}

export function buildConfigEffectiveResultV1(
  options: Readonly<{
    sourcedAt: IsoInstant;
    defaultProviderSetting: StudioSettingEntryV1 | null;
    providers: readonly ProviderInstanceV1[];
    registryDigest: Sha256Digest | null;
    registryUnavailableReason: string | null;
    presets: readonly PhasePresetV1[];
    healthByKey?: ReadonlyMap<string, ProviderHealthEntryV1>;
    registryStale?: boolean;
    registryInvalid?: boolean;
    registryInvalidDetail?: string | null;
  }>,
): CommandResultV1 {
  const defaultProviderKey = options.defaultProviderSetting?.value ?? null;
  const parsedDefault =
    defaultProviderKey === null ? null : RoomProviderSchema.safeParse(defaultProviderKey);
  const resolveInput: ResolveEffectiveConfigurationInputV1 = {
    sourcedAt: options.sourcedAt,
    registryDigest: options.registryDigest,
    registryUnavailableReason: options.registryUnavailableReason,
    defaultProviderKey: parsedDefault?.success === true ? parsedDefault.data : defaultProviderKey,
    defaultProviderSource: defaultProviderKey === null ? "unavailable" : "settings-override",
    providers: options.providers.map(providerInstanceToEffectiveInputV1),
    phaseRoles: phasePresetsToEffectiveRoleInputsV1(options.presets),
  };
  if (options.healthByKey !== undefined) {
    (resolveInput as { healthByKey?: ReadonlyMap<string, ProviderHealthEntryV1> }).healthByKey =
      options.healthByKey;
  }
  if (options.registryStale !== undefined) {
    (resolveInput as { registryStale?: boolean }).registryStale = options.registryStale;
  }
  if (options.registryInvalid !== undefined) {
    (resolveInput as { registryInvalid?: boolean }).registryInvalid = options.registryInvalid;
  }
  if (options.registryInvalidDetail !== undefined) {
    (resolveInput as { registryInvalidDetail?: string | null }).registryInvalidDetail =
      options.registryInvalidDetail;
  }
  const configuration = resolveEffectiveConfigurationV1(resolveInput);
  assertEffectiveConfigurationRedacted(configuration);
  return { operation: "config.effective", configuration };
}
