import { z } from "zod";

import { ProviderFamilyV1Schema, ProviderHealthStatusV1Schema } from "./provider.js";
import {
  IsoInstantSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";
import { RoomProviderSchema } from "./room.js";

/**
 * OR-23 / IF-T008: machine-readable *effective* provider and phase configuration.
 *
 * Distinct from `provider.list` (raw roster) and `preset.list` (raw phase bundles): this view
 * attributes every resolved value to a provenance source, surfaces unavailable/stale/invalid
 * facts honestly, redacts secrets to Keychain references only, and records requested-versus-
 * observed model identity when a probe has supplied an observation.
 */

export const ConfigValueSourceV1Schema = z.enum([
  "family-default",
  "explicit-config",
  "settings-override",
  "phase-cast",
  "phase-budget",
  "unavailable",
  "invalid",
  "stale",
  "observed-probe",
]);
export type ConfigValueSourceV1 = z.infer<typeof ConfigValueSourceV1Schema>;

export const EffectiveAttributedValueV1Schema = z.strictObject({
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  source: ConfigValueSourceV1Schema,
  /** Human-readable explanation when value is null or non-obvious. Never contains secrets. */
  detail: z.string().min(1).max(500).nullable(),
});
export type EffectiveAttributedValueV1 = z.infer<typeof EffectiveAttributedValueV1Schema>;

export const EffectiveCredentialPresenceV1Schema = z.strictObject({
  present: z.boolean(),
  /** Safe Keychain service name only; never a secret. */
  service: z.string().min(1).max(200).nullable(),
  /** Safe Keychain account name only; never a secret. */
  account: z.string().min(1).max(200).nullable(),
  source: ConfigValueSourceV1Schema,
});
export type EffectiveCredentialPresenceV1 = z.infer<typeof EffectiveCredentialPresenceV1Schema>;

export const EffectiveProviderEntryV1Schema = z.strictObject({
  key: RoomProviderSchema,
  family: ProviderFamilyV1Schema,
  displayName: EffectiveAttributedValueV1Schema,
  requestedModel: EffectiveAttributedValueV1Schema,
  observedModel: EffectiveAttributedValueV1Schema,
  maxOutputTokens: EffectiveAttributedValueV1Schema,
  maxOutputTokensApplicable: z.boolean(),
  credential: EffectiveCredentialPresenceV1Schema,
  healthStatus: ProviderHealthStatusV1Schema.nullable(),
  healthDetail: z.string().min(1).max(1_000).nullable(),
  configurationState: z.enum(["ok", "unavailable", "invalid", "stale"]),
});
export type EffectiveProviderEntryV1 = z.infer<typeof EffectiveProviderEntryV1Schema>;

export const EffectivePhaseRoleV1Schema = z.strictObject({
  phaseId: z.string().min(1).max(64),
  presetId: z.string().min(1).max(96).nullable(),
  roleLabel: z.string().min(1).max(100),
  providerKey: EffectiveAttributedValueV1Schema,
  tokenBudget: EffectiveAttributedValueV1Schema,
  providerResolved: z.boolean(),
  providerMissingReason: z.string().min(1).max(500).nullable(),
});
export type EffectivePhaseRoleV1 = z.infer<typeof EffectivePhaseRoleV1Schema>;

export const EffectiveDefaultProviderV1Schema = z.strictObject({
  key: EffectiveAttributedValueV1Schema,
  resolvesToConfiguredProvider: z.boolean(),
  unresolvedReason: z.string().min(1).max(500).nullable(),
});
export type EffectiveDefaultProviderV1 = z.infer<typeof EffectiveDefaultProviderV1Schema>;

export const EffectiveConfigurationV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  sourcedAt: IsoInstantSchema,
  registryDigest: Sha256DigestSchema.nullable(),
  registryUnavailableReason: z.string().min(1).max(500).nullable(),
  defaultProvider: EffectiveDefaultProviderV1Schema,
  providers: z.array(EffectiveProviderEntryV1Schema).max(32),
  phaseRoles: z.array(EffectivePhaseRoleV1Schema).max(200),
});
export type EffectiveConfigurationV1 = z.infer<typeof EffectiveConfigurationV1Schema>;
