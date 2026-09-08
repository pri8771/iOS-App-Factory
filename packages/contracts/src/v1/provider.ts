import { z } from "zod";

import { NonNegativeSafeIntegerSchema } from "./primitives.js";
import { RoomProviderSchema } from "./room.js";

/**
 * Provider registry (Studio Settings -> Providers): the roster of AI providers/instances the
 * daemon can dispatch a room, phase, or signal contribution to. The registry's source of truth
 * stays the participants config JSON file the daemon already reads once at start
 * (`APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG`; see `apps/daemon/src/room-participants-config.ts`) --
 * this file defines only the wire shapes that cross the command boundary to read and mutate that
 * roster (`provider.list`/`provider.upsert`/`provider.remove`/`provider.credential.set`/
 * `provider.health`), never a second source of truth. See "Architecture decisions" items 2 and 3
 * in the Studio chat-first shell plan.
 *
 * `key` is the same room-provider key a room's cast, an `@mention`, or a Signal's `scoutProvider`
 * already reference (`RoomProviderSchema`; e.g. `codex`, `openrouter-fast`) -- one instance, one
 * key, everywhere in the wire protocol.
 */

const KEYCHAIN_COMPONENT_PATTERN = /^[^\0\r\n]{1,200}$/;

/**
 * Mirrors `@app-factory/adapter-sdk`'s `CredentialReferenceV1` type field-for-field
 * (`schemaVersion`, `kind`, `service`, `account`) rather than importing it: the
 * `contracts-are-foundational` dependency-cruiser rule forbids `packages/contracts` from
 * depending on any other workspace package (`dependency-cruiser.config.cjs`). Keep the two in
 * sync by hand -- the same discipline `command-protocol.ts`'s Project Enrollment section already
 * documents for its own hand-kept mirror of `@app-factory/project-sdk` shapes. A reference is safe
 * to persist in the provider config file; the credential value itself never is.
 */
export const CredentialReferenceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("macos-keychain"),
  service: z
    .string()
    .min(1)
    .max(200)
    .regex(KEYCHAIN_COMPONENT_PATTERN, "Expected a safe Keychain service string"),
  account: z
    .string()
    .min(1)
    .max(200)
    .regex(KEYCHAIN_COMPONENT_PATTERN, "Expected a safe Keychain account string"),
});
export type CredentialReferenceV1 = z.infer<typeof CredentialReferenceV1Schema>;

export const ProviderFamilyV1Schema = z.enum(["codex", "claude", "gemini", "ollama", "openrouter"]);
export type ProviderFamilyV1 = z.infer<typeof ProviderFamilyV1Schema>;

export const MAX_PROVIDER_INSTANCES_V1 = 32 as const;

export const MIN_PROVIDER_MAX_OUTPUT_TOKENS_V1 = 1 as const;
export const MAX_PROVIDER_MAX_OUTPUT_TOKENS_V1 = 8_192 as const;

/**
 * Per-instance output cap, shared by `ProviderInstanceV1` (what the instance is currently
 * configured with) and `ProviderUpsertSpecV1` (what a caller proposes). `null` means "no explicit
 * instance override" -- the adapter's own family default applies (`OLLAMA_PARTICIPANT_MAX_OUTPUT
 * _TOKENS`/`OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS`, both 150, tuned for turn-taking rooms where
 * a short contribution is the point). 150 is too tight for an interactive chat reply, which is
 * exactly the gap this field closes: `apps/daemon/src/room-participants-config.ts`'s
 * `upsertProviderInstanceV1` defaults a NEW ollama/openrouter instance to 1000 (not null) when a
 * caller omits this field, so an instance created through Settings never silently inherits the
 * 150-token room default. Only Ollama and OpenRouter instances honor it -- codex/claude/gemini have
 * no such knob in their config (their CLI subprocess picks its own output length), and
 * `provider.upsert` refuses a non-null value for those families rather than silently ignoring it.
 */
const ProviderMaxOutputTokensV1Schema = z
  .int()
  .min(MIN_PROVIDER_MAX_OUTPUT_TOKENS_V1)
  .max(MAX_PROVIDER_MAX_OUTPUT_TOKENS_V1)
  .nullable();

export const ProviderInstanceV1Schema = z.strictObject({
  key: RoomProviderSchema,
  family: ProviderFamilyV1Schema,
  /** The effective model the instance speaks (the daemon resolves a family default when unset). */
  model: z.string().min(1).max(200),
  displayName: z.string().min(1).max(100),
  credentialReference: CredentialReferenceV1Schema.nullable(),
  /** See {@link ProviderMaxOutputTokensV1Schema}'s doc comment. `.default(null)` so a config
   *  predating this field (codex/claude/gemini always, or an ollama/openrouter instance configured
   *  by hand before this field existed) still parses as an honest "no override configured." */
  maxOutputTokens: ProviderMaxOutputTokensV1Schema.default(null),
});
export type ProviderInstanceV1 = z.infer<typeof ProviderInstanceV1Schema>;

/**
 * What a client proposes to `provider.upsert`. Never carries a credential: the bare secret
 * crosses the wire exactly once, through the separate `provider.credential.set` operation
 * (Architecture decision 2) -- upsert only ever names or reconfigures an instance, and the daemon
 * preserves whatever `credentialReference` (if any) that instance already had.
 */
export const ProviderUpsertSpecV1Schema = z.strictObject({
  key: RoomProviderSchema,
  family: ProviderFamilyV1Schema,
  model: z.string().min(1).max(200),
  displayName: z.string().min(1).max(100),
  /** See {@link ProviderMaxOutputTokensV1Schema}'s doc comment. `.default(null)` (omitted on the
   *  wire = null = "caller has no preference") keeps every pre-existing caller/fixture that never
   *  sent this field parsing unchanged -- retuning an existing instance without it preserves
   *  whatever the instance already had; creating a new ollama/openrouter instance without it gets
   *  the daemon's 1000-token default instead of the bare adapter fallback. */
  maxOutputTokens: ProviderMaxOutputTokensV1Schema.default(null),
});
export type ProviderUpsertSpecV1 = z.infer<typeof ProviderUpsertSpecV1Schema>;

export const ProviderHealthStatusV1Schema = z.enum([
  "ok",
  "unreachable",
  "unauthenticated",
  "not-configured",
  "blocked",
]);
export type ProviderHealthStatusV1 = z.infer<typeof ProviderHealthStatusV1Schema>;

export const MAX_PROVIDER_HEALTH_DETAIL_LENGTH_V1 = 1_000 as const;

/**
 * Honest nulls (Architecture decision 3): a probe that could not measure latency, could not
 * identify a version, or has nothing more to say than its status reports `null` for that field,
 * never a fabricated value. `detail` carries the probe's own words for anything other than plain
 * `ok` -- a blocked-on-attestation reason, an auth failure, a timeout.
 */
export const ProviderHealthReportV1Schema = z.strictObject({
  status: ProviderHealthStatusV1Schema,
  detail: z.string().min(1).max(MAX_PROVIDER_HEALTH_DETAIL_LENGTH_V1).nullable(),
  latencyMs: NonNegativeSafeIntegerSchema.nullable(),
  version: z.string().min(1).max(100).nullable(),
});
export type ProviderHealthReportV1 = z.infer<typeof ProviderHealthReportV1Schema>;

export const ProviderHealthEntryV1Schema = z.strictObject({
  key: RoomProviderSchema,
  report: ProviderHealthReportV1Schema,
});
export type ProviderHealthEntryV1 = z.infer<typeof ProviderHealthEntryV1Schema>;

export const MAX_PROVIDER_CREDENTIAL_SECRET_LENGTH_V1 = 4_000 as const;
