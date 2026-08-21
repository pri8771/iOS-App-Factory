import { createHash } from "node:crypto";

import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import {
  MAX_PROVIDER_INSTANCES_V1,
  RoomProviderSchema,
  Sha256DigestSchema,
  type ProviderFamilyV1,
  type ProviderInstanceV1,
  type ProviderUpsertSpecV1,
  type RoomProvider,
  type Sha256Digest,
} from "@app-factory/contracts";
import { createCredentialBroker } from "@app-factory/credential-broker";
import { canonicalJson } from "@app-factory/kernel";
import {
  createFetchOllamaTransport,
  createOllamaScorer,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  type OllamaTransportPort,
} from "@app-factory/ollama-scorer";
import { createFetchProviderHttpTransport } from "@app-factory/provider-transport";
import {
  createAlwaysDropRevalidator,
  createClaudeParticipant,
  createCodexParticipant,
  createFactoryAwareQuotaGovernor,
  createGeminiParticipant,
  createKernelAttemptActivityPort,
  createOllamaParticipant,
  createOllamaRoomScorer,
  createOpenRouterParticipant,
  createRoomAdapterContributor,
  createRosterCharterProvider,
  deriveOpenRouterBearerAuthorization,
  parseRoomRosterConfigV1,
  type ParticipantAdapter,
  type RoomRosterConfigV1,
} from "@app-factory/studio-room-adapters";
import type { RoomProviderCatalogPort, RoomProviderModelInfo } from "@app-factory/studio-rooms";

import type { RoomParticipantsCatalogSourceV1 } from "./command-runtime.js";
import {
  LocalExecutionProfileConfigurationError,
  readPrivateFile,
  requireOwnerContainmentAttestation,
  writePrivateFile,
} from "./local-execution-profile.js";
import type { PhaseParticipantsPort } from "./phase-run-executor.js";
import type { RoomSubsystemConfiguration } from "./room-subsystem.js";

/**
 * Real-model room participation is a real-identity path exactly like the
 * coding agent's own execution profile: it is gated behind the SAME
 * `APP_FACTORY_CONTAINMENT_ATTESTATION` file and reader
 * (`requireOwnerContainmentAttestation`) the coding profile uses, not a
 * second gate. This label only shapes the resulting error message.
 */
export const STUDIO_ROOMS_ATTESTATION_MODE = "studio-rooms-live-participants";

const MAX_PARTICIPANTS_CONFIG_BYTES = 262_144;
const PARTICIPANTS_CONFIG_LABEL = "Room participants configuration";

export class RoomParticipantsConfigurationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RoomParticipantsConfigurationError";
  }
}

function configurationError(message: string, cause?: unknown): never {
  throw new RoomParticipantsConfigurationError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Rejects any key outside `allowed`. Every field in these schemas is either
 * genuinely optional or separately enforced as required by its own
 * `boundedString`/`absolutePathValue` value check below, so presence is
 * intentionally not policed here -- only exact-shape (no stray fields).
 */
function allowedKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(record).some((key) => !allowed.includes(key));
  if (unexpected) configurationError(`${label} has an unsupported or non-exact shape.`);
}

function boundedString(value: unknown, label: string, maximum = 1_024): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    configurationError(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function absolutePathValue(value: unknown, label: string): string {
  const text = boundedString(value, label);
  if (!text.startsWith("/")) configurationError(`${label} must be an absolute path.`);
  return text;
}

export type RoomCodexParticipantConfigV1 = Readonly<{
  executable: string;
  executableDigest?: string;
  expectedCliVersion?: string;
  model: string;
  codexHome: string;
  runnerRoot: string;
  scratchRoot: string;
  /** Operator-facing label for Settings -> Providers (`provider.list`/`provider.upsert`); falls
   *  back to a family-derived default when unset (a config predating this field). */
  displayName?: string;
}>;

export type RoomClaudeParticipantConfigV1 = Readonly<{
  executable: string;
  model: string;
  displayName?: string;
}>;

/** Mirrors `RoomClaudeParticipantConfigV1` field for field (Architecture decision 10: gemini is a
 *  CLI-subprocess adapter configured exactly like Claude -- one instance, machine-local
 *  executable path, no credential in this config). */
export type RoomGeminiParticipantConfigV1 = Readonly<{
  executable: string;
  model: string;
  displayName?: string;
}>;

export type RoomOllamaParticipantConfigV1 = Readonly<{
  baseUrl?: string;
  model?: string;
  /** Per-turn HTTP timeout for the Ollama participant adapter; `createOllamaParticipant`'s own
   * default (60s) targets a small, already-warm model. A heavier local model (e.g. a 14B coder
   * model) processing a large `docs/` context routinely needs more than that. */
  timeoutMs?: number;
  /** Per-instance output cap; `createOllamaParticipant`'s own default (150) is preserved when
   *  absent. */
  maxOutputTokens?: number;
  displayName?: string;
}>;

/** One named local Ollama instance in the array form of `config.ollama` (Architecture decision 5):
 *  registers under the `ollama-<id>` provider key, alongside any number of other instances. */
export type RoomOllamaInstanceConfigV1 = Readonly<{
  /** Short slug; becomes this instance's RoomProvider key as `ollama-<id>`. Unique within the
   *  `ollama` array, same pattern as `openrouter.id`. */
  id: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  displayName?: string;
}>;

/** `config.ollama` accepts either the legacy singular object (registers under the bare `"ollama"`
 *  key) or an array of named instances (registers under `"ollama-<id>"` each) -- never both at
 *  once. */
export type RoomOllamaConfigV1 =
  RoomOllamaParticipantConfigV1 | readonly RoomOllamaInstanceConfigV1[];

/** Chooses which configured Ollama instance backs the Tier-1 admission scorer and the rolling
 *  summarizer. `ollama` is either the literal `"legacy"` (the singular object form) or one of the
 *  array form's instance ids. Omitted entirely, the default is the legacy entry when present, else
 *  the first array instance. */
export type RoomScorerConfigV1 = Readonly<{ ollama: string }>;

export type RoomOpenRouterParticipantConfigV1 = Readonly<{
  /** Short slug; becomes this instance's RoomProvider key as `openrouter-<id>`. Unique within the
   *  `openrouter` array -- rooms can be configured against several named OpenRouter instances (one
   *  per model) simultaneously, unlike codex/claude which are each configured at most once. */
  id: string;
  model: string;
  /**
   * `null` for an instance `provider.upsert` just created and no `provider.credential.set` has
   * funded yet (Architecture decisions 2-3: upsert never carries a secret, and a fresh instance is
   * a legitimate, catalog-visible, not-yet-usable state). `buildRoomSubsystemConfiguration` builds
   * no adapter for a `null`-credentialed instance -- it fails exactly like an unconfigured
   * provider until `credential.set` funds it, never a fabricated adapter over no credential.
   */
  credentialReference: CredentialReferenceV1 | null;
  baseUrl?: string;
  timeoutMs?: number;
  /** Per-instance output cap; `createOpenRouterParticipant`'s own default (150) is preserved when
   *  absent. */
  maxOutputTokens?: number;
  displayName?: string;
}>;

export type RoomParticipantsConfigV1 = Readonly<{
  schemaVersion: 1;
  codex?: RoomCodexParticipantConfigV1;
  claude?: RoomClaudeParticipantConfigV1;
  gemini?: RoomGeminiParticipantConfigV1;
  ollama?: RoomOllamaConfigV1;
  openrouter?: readonly RoomOpenRouterParticipantConfigV1[];
  scorer?: RoomScorerConfigV1;
  roster?: RoomRosterConfigV1;
}>;

const INSTANCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;

function parseCodexParticipantConfig(value: unknown): RoomCodexParticipantConfigV1 {
  if (!isRecord(value)) configurationError("codex participant configuration must be an object.");
  allowedKeys(
    value,
    [
      "executable",
      "executableDigest",
      "expectedCliVersion",
      "model",
      "codexHome",
      "runnerRoot",
      "scratchRoot",
      "displayName",
    ],
    "codex participant configuration",
  );
  return {
    executable: absolutePathValue(value.executable, "codex.executable"),
    ...(value.executableDigest === undefined
      ? {}
      : { executableDigest: boundedString(value.executableDigest, "codex.executableDigest", 128) }),
    ...(value.expectedCliVersion === undefined
      ? {}
      : {
          expectedCliVersion: boundedString(
            value.expectedCliVersion,
            "codex.expectedCliVersion",
            100,
          ),
        }),
    model: boundedString(value.model, "codex.model", 200),
    codexHome: absolutePathValue(value.codexHome, "codex.codexHome"),
    runnerRoot: absolutePathValue(value.runnerRoot, "codex.runnerRoot"),
    scratchRoot: absolutePathValue(value.scratchRoot, "codex.scratchRoot"),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "codex.displayName", 100) }),
  };
}

function parseClaudeParticipantConfig(value: unknown): RoomClaudeParticipantConfigV1 {
  if (!isRecord(value)) configurationError("claude participant configuration must be an object.");
  allowedKeys(value, ["executable", "model", "displayName"], "claude participant configuration");
  return {
    executable: absolutePathValue(value.executable, "claude.executable"),
    model: boundedString(value.model, "claude.model", 200),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "claude.displayName", 100) }),
  };
}

/** Mirrors {@link parseClaudeParticipantConfig} exactly (Architecture decision 10). */
function parseGeminiParticipantConfig(value: unknown): RoomGeminiParticipantConfigV1 {
  if (!isRecord(value)) configurationError("gemini participant configuration must be an object.");
  allowedKeys(value, ["executable", "model", "displayName"], "gemini participant configuration");
  return {
    executable: absolutePathValue(value.executable, "gemini.executable"),
    model: boundedString(value.model, "gemini.model", 200),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "gemini.displayName", 100) }),
  };
}

function boundedTimeoutMs(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1_000 ||
    value > 10 * 60_000
  ) {
    configurationError(
      `${label} must be an integer number of milliseconds between 1000 and 600000.`,
    );
  }
  return value;
}

function boundedMaxOutputTokens(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    configurationError(`${label} must be an integer number of tokens between 1 and 100000.`);
  }
  return value;
}

function parseOllamaParticipantConfig(value: unknown): RoomOllamaParticipantConfigV1 {
  if (!isRecord(value)) configurationError("ollama participant configuration must be an object.");
  allowedKeys(
    value,
    ["baseUrl", "model", "timeoutMs", "maxOutputTokens", "displayName"],
    "ollama participant configuration",
  );
  return {
    ...(value.baseUrl === undefined
      ? {}
      : { baseUrl: boundedString(value.baseUrl, "ollama.baseUrl", 256) }),
    ...(value.model === undefined
      ? {}
      : { model: boundedString(value.model, "ollama.model", 128) }),
    ...(value.timeoutMs === undefined
      ? {}
      : { timeoutMs: boundedTimeoutMs(value.timeoutMs, "ollama.timeoutMs") }),
    ...(value.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: boundedMaxOutputTokens(value.maxOutputTokens, "ollama.maxOutputTokens"),
        }),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "ollama.displayName", 100) }),
  };
}

function parseOneOllamaInstanceConfig(value: unknown): RoomOllamaInstanceConfigV1 {
  if (!isRecord(value)) configurationError("ollama instance configuration must be an object.");
  allowedKeys(
    value,
    ["id", "baseUrl", "model", "timeoutMs", "maxOutputTokens", "displayName"],
    "ollama instance configuration",
  );
  const id = boundedString(value.id, "ollama instance id", 41);
  if (!INSTANCE_ID_PATTERN.test(id)) {
    configurationError(
      "ollama instance id must be lowercase letters, digits, and hyphens, starting with a letter.",
    );
  }
  return {
    id,
    ...(value.baseUrl === undefined
      ? {}
      : { baseUrl: boundedString(value.baseUrl, "ollama.baseUrl", 256) }),
    ...(value.model === undefined
      ? {}
      : { model: boundedString(value.model, "ollama.model", 128) }),
    ...(value.timeoutMs === undefined
      ? {}
      : { timeoutMs: boundedTimeoutMs(value.timeoutMs, "ollama.timeoutMs") }),
    ...(value.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: boundedMaxOutputTokens(value.maxOutputTokens, "ollama.maxOutputTokens"),
        }),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "ollama.displayName", 100) }),
  };
}

/** `config.ollama` disambiguates legacy-object vs named-array purely by JS shape (`Array.isArray`)
 *  -- the legacy object never carried an `id` field, so there is no ambiguity to resolve. */
function parseOllamaConfig(value: unknown): RoomOllamaConfigV1 {
  if (Array.isArray(value)) {
    if (value.length < 1) configurationError("ollama array configuration must be non-empty.");
    const parsed = value.map((entry) => parseOneOllamaInstanceConfig(entry));
    const ids = new Set<string>();
    for (const entry of parsed) {
      if (ids.has(entry.id)) {
        configurationError(`ollama instance id "${entry.id}" is configured more than once.`);
      }
      ids.add(entry.id);
    }
    return parsed;
  }
  return parseOllamaParticipantConfig(value);
}

function parseScorerConfig(value: unknown): RoomScorerConfigV1 {
  if (!isRecord(value)) configurationError("scorer configuration must be an object.");
  allowedKeys(value, ["ollama"], "scorer configuration");
  return { ollama: boundedString(value.ollama, "scorer.ollama", 64) };
}

/** `null`/absent both mean "no credential yet" (a `provider.upsert`-created instance
 *  `provider.credential.set` has not funded); an explicit non-null value is validated as a real
 *  `CredentialReferenceV1`, never accepted loosely. */
function parseOpenRouterCredentialReference(value: unknown): CredentialReferenceV1 | null {
  if (value === undefined || value === null) return null;
  try {
    return parseCredentialReference(value);
  } catch (error) {
    configurationError("openrouter participant credentialReference is invalid.", error);
  }
}

function parseOneOpenRouterParticipantConfig(value: unknown): RoomOpenRouterParticipantConfigV1 {
  if (!isRecord(value))
    configurationError("openrouter participant configuration must be an object.");
  allowedKeys(
    value,
    [
      "id",
      "model",
      "credentialReference",
      "baseUrl",
      "timeoutMs",
      "maxOutputTokens",
      "displayName",
    ],
    "openrouter participant configuration",
  );
  const id = boundedString(value.id, "openrouter.id", 41);
  if (!INSTANCE_ID_PATTERN.test(id)) {
    configurationError(
      "openrouter.id must be lowercase letters, digits, and hyphens, starting with a letter.",
    );
  }
  return {
    id,
    model: boundedString(value.model, "openrouter.model", 200),
    credentialReference: parseOpenRouterCredentialReference(value.credentialReference),
    ...(value.baseUrl === undefined
      ? {}
      : { baseUrl: boundedString(value.baseUrl, "openrouter.baseUrl", 256) }),
    ...(value.timeoutMs === undefined
      ? {}
      : { timeoutMs: boundedTimeoutMs(value.timeoutMs, "openrouter.timeoutMs") }),
    ...(value.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: boundedMaxOutputTokens(
            value.maxOutputTokens,
            "openrouter.maxOutputTokens",
          ),
        }),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedString(value.displayName, "openrouter.displayName", 100) }),
  };
}

function parseOpenRouterParticipantsConfig(
  value: unknown,
): readonly RoomOpenRouterParticipantConfigV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    configurationError("openrouter must be a non-empty array of at most 5 instances.");
  }
  const parsed = value.map((entry) => parseOneOpenRouterParticipantConfig(entry));
  const ids = new Set<string>();
  for (const entry of parsed) {
    if (ids.has(entry.id)) {
      configurationError(`openrouter instance id "${entry.id}" is configured more than once.`);
    }
    ids.add(entry.id);
  }
  return parsed;
}

export function parseRoomParticipantsConfigV1(input: unknown): RoomParticipantsConfigV1 {
  if (!isRecord(input)) configurationError(`${PARTICIPANTS_CONFIG_LABEL} must be an object.`);
  allowedKeys(
    input,
    ["schemaVersion", "codex", "claude", "gemini", "ollama", "openrouter", "scorer", "roster"],
    PARTICIPANTS_CONFIG_LABEL,
  );
  if (input.schemaVersion !== 1)
    configurationError(`${PARTICIPANTS_CONFIG_LABEL} must declare schemaVersion 1.`);
  let roster: RoomRosterConfigV1 | undefined;
  if (input.roster !== undefined) {
    try {
      roster = parseRoomRosterConfigV1(input.roster);
    } catch (error) {
      configurationError(`${PARTICIPANTS_CONFIG_LABEL} has an invalid roster.`, error);
    }
  }
  const ollama = input.ollama === undefined ? undefined : parseOllamaConfig(input.ollama);
  const scorer = input.scorer === undefined ? undefined : parseScorerConfig(input.scorer);
  if (scorer !== undefined) {
    const validIds =
      ollama === undefined
        ? []
        : Array.isArray(ollama)
          ? ollama.map((instance) => instance.id)
          : ["legacy"];
    if (!validIds.includes(scorer.ollama)) {
      configurationError(
        `scorer.ollama "${scorer.ollama}" does not match any configured ollama instance.`,
      );
    }
  }
  return {
    schemaVersion: 1,
    ...(input.codex === undefined ? {} : { codex: parseCodexParticipantConfig(input.codex) }),
    ...(input.claude === undefined ? {} : { claude: parseClaudeParticipantConfig(input.claude) }),
    ...(input.gemini === undefined ? {} : { gemini: parseGeminiParticipantConfig(input.gemini) }),
    ...(ollama === undefined ? {} : { ollama }),
    ...(input.openrouter === undefined
      ? {}
      : { openrouter: parseOpenRouterParticipantsConfig(input.openrouter) }),
    ...(scorer === undefined ? {} : { scorer }),
    ...(roster === undefined ? {} : { roster }),
  };
}

/** Reads the participants config through the same private-file discipline as the local execution profile. */
export function loadRoomParticipantsConfigFile(path: string): RoomParticipantsConfigV1 {
  const bytes = readPrivateFile(path, MAX_PARTICIPANTS_CONFIG_BYTES, PARTICIPANTS_CONFIG_LABEL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    configurationError(`${PARTICIPANTS_CONFIG_LABEL} must contain valid JSON.`, error);
  }
  return parseRoomParticipantsConfigV1(parsed);
}

/** One configured provider instance, whichever family/slot it came from -- the single place that
 *  derives the real `roomProviderKey` every consumer needs (the wire catalog, the moderator's
 *  `RoomProviderCatalogPort`, and `provider.list`'s richer owner-surface view): `"codex"`,
 *  `"claude"`, `"ollama"` (legacy singular) / `"ollama-<id>"` (array), `"openrouter-<id>"`. Fixes
 *  the live bug where 2+ OpenRouter instances shared the bare `"openrouter"` key and violated
 *  `RoomParticipantsCatalogV1Schema`'s own uniqueness refine (Architecture decision 9). */
export type RoomProviderSlotV1 = Readonly<{
  key: RoomProvider;
  family: ProviderFamilyV1;
  model: string;
  cliVersion: string | null;
  displayName: string;
  credentialReference: CredentialReferenceV1 | null;
}>;

function defaultDisplayName(family: ProviderFamilyV1, instanceKey: string): string {
  const familyLabel = family.charAt(0).toUpperCase() + family.slice(1);
  return instanceKey === family ? familyLabel : `${familyLabel} (${instanceKey})`;
}

/** Enumerates every configured provider slot in a stable order (codex, claude, every Ollama
 *  instance, every OpenRouter instance) -- the single source both the wire-safe catalog
 *  (`buildRoomParticipantsCatalogSourceV1`) and the moderator's family/model resolver
 *  (`buildProviderCatalogPortV1`) project from, so the two can never disagree about which
 *  instances exist. */
export function enumerateProviderSlotsV1(
  config: RoomParticipantsConfigV1,
): readonly RoomProviderSlotV1[] {
  const slots: RoomProviderSlotV1[] = [];
  if (config.codex !== undefined) {
    slots.push({
      key: RoomProviderSchema.parse("codex"),
      family: "codex",
      model: config.codex.model,
      cliVersion: config.codex.expectedCliVersion ?? null,
      displayName: config.codex.displayName ?? defaultDisplayName("codex", "codex"),
      credentialReference: null,
    });
  }
  if (config.claude !== undefined) {
    slots.push({
      key: RoomProviderSchema.parse("claude"),
      family: "claude",
      model: config.claude.model,
      cliVersion: null,
      displayName: config.claude.displayName ?? defaultDisplayName("claude", "claude"),
      credentialReference: null,
    });
  }
  if (config.gemini !== undefined) {
    slots.push({
      key: RoomProviderSchema.parse("gemini"),
      family: "gemini",
      model: config.gemini.model,
      cliVersion: null,
      displayName: config.gemini.displayName ?? defaultDisplayName("gemini", "gemini"),
      credentialReference: null,
    });
  }
  for (const instance of normalizeOllamaInstances(config.ollama)) {
    const key = instance.instanceKey === "legacy" ? "ollama" : `ollama-${instance.instanceKey}`;
    slots.push({
      key: RoomProviderSchema.parse(key),
      family: "ollama",
      model: instance.model,
      cliVersion: null,
      displayName: instance.displayName ?? defaultDisplayName("ollama", key),
      credentialReference: null,
    });
  }
  for (const instance of config.openrouter ?? []) {
    const key = `openrouter-${instance.id}`;
    slots.push({
      key: RoomProviderSchema.parse(key),
      family: "openrouter",
      model: instance.model,
      cliVersion: null,
      displayName: instance.displayName ?? defaultDisplayName("openrouter", key),
      credentialReference: instance.credentialReference,
    });
  }
  return slots;
}

/**
 * The wire-safe projection of a parsed participants config that `room.participants.list` serves:
 * one entry per configured provider carrying its real `roomProviderKey`, effective model, and
 * (Codex) pinned CLI version, plus the roster verbatim. Executables, executable digests,
 * `codexHome`, runner/scratch roots, credential references, and the Ollama base URL are
 * daemon-local (or, for the credential reference, owner-surface-only) and are deliberately not
 * projected here -- a client proposing a roster needs to know WHICH providers speak WHICH model
 * under WHICH key, never where they live or how they authenticate.
 */
export function buildRoomParticipantsCatalogSourceV1(
  config: RoomParticipantsConfigV1,
): RoomParticipantsCatalogSourceV1 {
  const providers = enumerateProviderSlotsV1(config).map((slot) => ({
    provider: slot.family,
    roomProviderKey: slot.key,
    model: slot.model,
    cliVersion: slot.cliVersion,
  }));
  const roster = (config.roster?.rooms ?? []).map((entry) => ({
    roomId: entry.roomId,
    kind: entry.kind,
    charter: entry.charter ?? null,
    participants: entry.participants.map((participant) => ({
      persona: participant.persona,
      oneLineCharter: participant.oneLineCharter,
    })),
  }));
  return { providers, roster };
}

/**
 * The honest token ledger's attribution source (contracts Architecture decision 6, "KNOWN GAP" the
 * daemon composition must close): resolves a grant's `roomProviderKey` to the adapter family and
 * configured model the SAME parsed config already knows, over the SAME `enumerateProviderSlotsV1`
 * enumeration the wire catalog projects from. A provider absent from this config has no business
 * closing a grant at all (call-time resolution means a room can only ever grant a provider its
 * roster names, and a roster can only ever name a provider the catalog listed) -- throwing here is
 * an honest invariant violation, not a fabricated fallback.
 */
export function buildProviderCatalogPortV1(
  config: RoomParticipantsConfigV1,
): RoomProviderCatalogPort {
  const byKey = new Map<string, RoomProviderModelInfo>(
    enumerateProviderSlotsV1(config).map((slot) => [
      slot.key,
      { family: slot.family, model: slot.model },
    ]),
  );
  return {
    resolve(provider) {
      const info = byKey.get(provider);
      if (info === undefined) {
        throw new Error(`No provider is configured for room-provider key "${provider}".`);
      }
      return info;
    },
  };
}

/** One normalized local Ollama instance, whichever of the two `config.ollama` shapes it came
 *  from -- `instanceKey` is `"legacy"` for the singular object form, else the array entry's `id`. */
export type NormalizedOllamaInstance = Readonly<{
  instanceKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  displayName?: string;
}>;

export function normalizeOllamaInstances(
  ollama: RoomOllamaConfigV1 | undefined,
): readonly NormalizedOllamaInstance[] {
  if (ollama === undefined) return [];
  if (Array.isArray(ollama)) {
    return ollama.map((instance) => ({
      instanceKey: instance.id,
      baseUrl: instance.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      model: instance.model ?? DEFAULT_OLLAMA_MODEL,
      ...(instance.timeoutMs === undefined ? {} : { timeoutMs: instance.timeoutMs }),
      ...(instance.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: instance.maxOutputTokens }),
      ...(instance.displayName === undefined ? {} : { displayName: instance.displayName }),
    }));
  }
  // `Array.isArray` narrows the true branch above cleanly, but TypeScript does not exclude a
  // `readonly T[]` union member from the false branch (a known checker limitation), so the
  // legacy-object member is recovered with an explicit cast rather than relying on that narrowing.
  const legacy = ollama as RoomOllamaParticipantConfigV1;
  return [
    {
      instanceKey: "legacy",
      baseUrl: legacy.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      model: legacy.model ?? DEFAULT_OLLAMA_MODEL,
      ...(legacy.timeoutMs === undefined ? {} : { timeoutMs: legacy.timeoutMs }),
      ...(legacy.maxOutputTokens === undefined ? {} : { maxOutputTokens: legacy.maxOutputTokens }),
      ...(legacy.displayName === undefined ? {} : { displayName: legacy.displayName }),
    },
  ];
}

/**
 * Builds one `ParticipantAdapter` per normalized instance, registering each under its own
 * provider key (the legacy bare `"ollama"`, or `"ollama-<id>"` per array entry) -- shared by both
 * `buildRoomSubsystemConfiguration` and `buildPhaseParticipantsPortV1` so a room's cast and a
 * phase's participants port always draw from the exact same configured pool (Architecture
 * decision 5).
 */
function buildOllamaAdapters(
  instances: readonly NormalizedOllamaInstance[],
  transport: OllamaTransportPort,
): ParticipantAdapter[] {
  return instances.map((instance) =>
    createOllamaParticipant({
      ...(instance.instanceKey === "legacy" ? {} : { id: instance.instanceKey }),
      transport,
      baseUrl: instance.baseUrl,
      model: instance.model,
      ...(instance.timeoutMs === undefined ? {} : { timeoutMs: instance.timeoutMs }),
      ...(instance.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: instance.maxOutputTokens }),
    }),
  );
}

/**
 * Picks the Ollama instance that backs the Tier-1 admission scorer and rolling summarizer
 * (Architecture decision 5): an explicit `config.scorer.ollama` selection (validated against the
 * configured instances at parse time by `parseRoomParticipantsConfigV1`, so this is a defensive
 * second check for configs assembled by hand, e.g. in tests), else the legacy singular entry when
 * present, else the first array instance. `null` only when no Ollama instance is configured at
 * all -- the caller falls back to the bare default local endpoint in that case, preserving the
 * pre-multi-instance behavior of always running a scorer even with no explicit `ollama` config.
 */
function resolveScorerOllamaInstance(
  instances: readonly NormalizedOllamaInstance[],
  scorer: RoomScorerConfigV1 | undefined,
): NormalizedOllamaInstance | null {
  if (scorer !== undefined) {
    return instances.find((instance) => instance.instanceKey === scorer.ollama) ?? null;
  }
  const legacy = instances.find((instance) => instance.instanceKey === "legacy");
  if (legacy !== undefined) return legacy;
  return instances[0] ?? null;
}

/**
 * Builds every real port `RoomSubsystemConfiguration` needs (`scorer`,
 * `contributor`, `revalidator`, `providerCatalog`, `quotaFactory`) from a parsed participants
 * config, plus the wire-safe `participantsCatalog` `room.participants.list`
 * answers from. Only the providers present in `config` get a `ParticipantAdapter`
 * -- a room whose roster names a provider with no configured adapter simply
 * fails that provider's contributions closed (`error(internal)`) via
 * `createRoomAdapterContributor`, rather than refusing to start the whole
 * subsystem. An OpenRouter instance with `credentialReference: null` (Architecture decisions 2-3:
 * `provider.upsert`-created, not yet funded by `provider.credential.set`) is one such case: it is
 * always in `participantsCatalog` and `providerCatalog` (so `provider.list`/`room.participants.list`
 * see it and `provider.health` can report it `not-configured`), but never gets a
 * `ParticipantAdapter` -- there is no credential to build one from.
 */
export function buildRoomSubsystemConfiguration(
  config: RoomParticipantsConfigV1,
): Omit<RoomSubsystemConfiguration, "enabled"> {
  const adapters: ParticipantAdapter[] = [];
  if (config.codex !== undefined) {
    adapters.push(createCodexParticipant(config.codex));
  }
  if (config.claude !== undefined) {
    adapters.push(createClaudeParticipant(config.claude));
  }
  if (config.gemini !== undefined) {
    adapters.push(createGeminiParticipant(config.gemini));
  }
  const ollamaTransport = createFetchOllamaTransport();
  const ollamaInstances = normalizeOllamaInstances(config.ollama);
  adapters.push(...buildOllamaAdapters(ollamaInstances, ollamaTransport));
  // Falls back to the bare default local endpoint when no `ollama` instance is configured at all,
  // preserving the pre-multi-instance behavior of always running a scorer.
  const scorerInstance: Pick<NormalizedOllamaInstance, "baseUrl" | "model"> =
    resolveScorerOllamaInstance(ollamaInstances, config.scorer) ?? {
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      model: DEFAULT_OLLAMA_MODEL,
    };
  if (config.openrouter !== undefined && config.openrouter.length > 0) {
    // One credential broker + fetch transport shared across every configured OpenRouter instance:
    // the broker resolves whichever `credentialReference` each request carries, so instances that
    // happen to share one Keychain item (a single API key calling several models) need no special
    // casing, and instances with distinct keys are equally well served.
    const openRouterTransport = createFetchProviderHttpTransport({
      credentials: createCredentialBroker(),
      authorization: deriveOpenRouterBearerAuthorization,
    });
    for (const instance of config.openrouter) {
      // No credential yet (a fresh `provider.upsert`-created instance): stays in the catalog, gets
      // no adapter. `createOpenRouterParticipant` requires a real `CredentialReferenceV1` and
      // cannot itself represent "not configured yet".
      if (instance.credentialReference === null) continue;
      adapters.push(
        createOpenRouterParticipant({
          id: instance.id,
          model: instance.model,
          credentialReference: instance.credentialReference,
          transport: openRouterTransport,
          ...(instance.baseUrl === undefined ? {} : { baseUrl: instance.baseUrl }),
          ...(instance.timeoutMs === undefined ? {} : { timeoutMs: instance.timeoutMs }),
          ...(instance.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: instance.maxOutputTokens }),
        }),
      );
    }
  }

  const charters = createRosterCharterProvider({
    transport: ollamaTransport,
    ...(config.roster === undefined ? {} : { roster: config.roster }),
    summarizerConfig: { baseUrl: scorerInstance.baseUrl, model: scorerInstance.model },
  });
  const scorer = createOllamaRoomScorer({
    scorer: createOllamaScorer({
      transport: ollamaTransport,
      // `@app-factory/ollama-scorer`'s own default timeout (3s) targets a
      // small, already-warm model; real local hardware serving a heavier
      // structured-output-capable model (the recommended choice for
      // three-way admission judgment) regularly needs more than that, so
      // this daemon composition widens it rather than forcing every room
      // scorer configuration to rediscover the same headroom.
      config: { baseUrl: scorerInstance.baseUrl, model: scorerInstance.model, timeoutMs: 20_000 },
    }),
    charters,
  });
  const contributor = createRoomAdapterContributor({ adapters, charters });
  const revalidator = createAlwaysDropRevalidator();

  return {
    scorer,
    contributor,
    revalidator,
    providerCatalog: buildProviderCatalogPortV1(config),
    quotaFactory: (database) =>
      createFactoryAwareQuotaGovernor({ activity: createKernelAttemptActivityPort(database) }),
    participantsCatalog: buildRoomParticipantsCatalogSourceV1(config),
  };
}

export type LoadRoomsSubsystemConfigurationOptions = Readonly<{
  /** Path to the JSON participants/roster configuration file. */
  participantsConfigPath: string;
  /** Already-resolved attestation path (the same one the local execution profile uses), if any. */
  containmentAttestationPath?: string;
}>;

/** An empty, schema-valid registry: no providers, no roster. The daemon's honest starting point
 *  before any `provider.upsert` has ever run (Architecture decision 3). */
const EMPTY_ROOM_PARTICIPANTS_CONFIG_V1: RoomParticipantsConfigV1 = { schemaVersion: 1 };

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof LocalExecutionProfileConfigurationError &&
    error.cause instanceof Error &&
    "code" in error.cause &&
    (error.cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * The same reader as {@link loadRoomParticipantsConfigFile} (private-file discipline unchanged),
 * except a MISSING file is not a startup-killing error (Architecture decision 3): the daemon has
 * simply never had a provider upserted into it yet, and starts with
 * {@link EMPTY_ROOM_PARTICIPANTS_CONFIG_V1}. A file that exists but fails to parse (bad JSON,
 * invalid shape, an operator's broken hand-edit) still fails loudly -- only "nothing here yet" is
 * soft.
 */
export function loadRoomParticipantsConfigFileOrEmpty(path: string): RoomParticipantsConfigV1 {
  try {
    return loadRoomParticipantsConfigFile(path);
  } catch (error) {
    if (isMissingFileError(error)) return EMPTY_ROOM_PARTICIPANTS_CONFIG_V1;
    throw error;
  }
}

/**
 * Whether the owner containment attestation is currently present and valid, WITHOUT throwing
 * (Architecture decision 3: attestation is checked at provider-activation time -- initial load AND
 * every `provider.upsert`/reload -- rather than only once at daemon startup, so a daemon started
 * before the operator has attested yet still starts, and later activation decisions stay honest
 * about whatever the attestation file says right now).
 */
export function isRoomsContainmentAttestedV1(
  containmentAttestationPath: string | undefined,
): boolean {
  try {
    requireOwnerContainmentAttestation(containmentAttestationPath, STUDIO_ROOMS_ATTESTATION_MODE);
    return true;
  } catch (error) {
    if (error instanceof LocalExecutionProfileConfigurationError) return false;
    throw error;
  }
}

/** Literal detail `provider.health` reports for every instance when the containment attestation is
 *  missing or invalid: providers persist to the config file either way, but no adapter is ever
 *  activated for them (Architecture decision 3). */
export const CONTAINMENT_ATTESTATION_MISSING_DETAIL_V1 = "containment-attestation-missing" as const;

/**
 * The single composition rule Architecture decision 3 states once and every activation site
 * (initial daemon startup, and every `provider.upsert`/`provider.remove` reload) applies
 * identically: attested -> real adapters built from `config`; not attested -> the wire-safe
 * catalog still reflects `config` in full (so `provider.list`/`room.participants.list` show what
 * is configured and `provider.health` can report each instance `blocked`), but ZERO adapters are
 * activated -- `buildRoomSubsystemConfiguration` is called against the empty registry so its
 * `contributor`/`providerCatalog` know nothing, and the phase-participants pool resolves nothing
 * either.
 */
export function buildRoomsCompositionV1(
  config: RoomParticipantsConfigV1,
  attested: boolean,
): Readonly<{
  subsystemConfiguration: Omit<RoomSubsystemConfiguration, "enabled">;
  phaseParticipants: PhaseParticipantsPort;
  /**
   * The SAME family/model resolver `subsystemConfiguration.providerCatalog` carries, exposed
   * directly too (Wave 7): `phase.run`'s and the signal scheduler's honest `token_usage` rows
   * (`source: "phase"`/`"signal"`) need exactly this resolution and have no room to read it
   * through -- never a second, independently configured catalog.
   */
  providerCatalog: RoomProviderCatalogPort;
}> {
  const participantsCatalog = buildRoomParticipantsCatalogSourceV1(config);
  if (!attested) {
    return {
      subsystemConfiguration: {
        ...buildRoomSubsystemConfiguration(EMPTY_ROOM_PARTICIPANTS_CONFIG_V1),
        participantsCatalog,
      },
      phaseParticipants: { resolve: () => null },
      providerCatalog: buildProviderCatalogPortV1(EMPTY_ROOM_PARTICIPANTS_CONFIG_V1),
    };
  }
  return {
    subsystemConfiguration: buildRoomSubsystemConfiguration(config),
    phaseParticipants: buildPhaseParticipantsPortV1(config),
    providerCatalog: buildProviderCatalogPortV1(config),
  };
}

/**
 * Top-level daemon entrypoint hook: loads and validates the participants config -- a MISSING file
 * starts an empty registry, never a startup-killing error -- and gates real adapter activation on
 * the containment attestation (Architecture decision 3). Always returns `enabled: true`: rooms are
 * a durable transcript with a live moderator loop the instant `APP_FACTORY_ROOMS_ENABLED` is set,
 * regardless of whether any provider is configured or attested yet.
 */
export function loadRoomsSubsystemConfiguration(
  options: LoadRoomsSubsystemConfigurationOptions,
): RoomSubsystemConfiguration {
  const attested = isRoomsContainmentAttestedV1(options.containmentAttestationPath);
  const config = loadRoomParticipantsConfigFileOrEmpty(options.participantsConfigPath);
  return { enabled: true, ...buildRoomsCompositionV1(config, attested).subsystemConfiguration };
}

/**
 * Seam (b) of the project-registry task: `phase.run`'s `phaseParticipants` port, built from the
 * SAME `RoomParticipantsConfigV1` (`config.codex`/`config.claude`/`config.ollama`) and the SAME
 * `ParticipantAdapter` factories (`createCodexParticipant`/`createClaudeParticipant`/
 * `createOllamaParticipant`) {@link buildRoomSubsystemConfiguration} already builds its room
 * adapters from -- a phase cast and a room roster draw from one identical pool of configured
 * providers, never two independently configured ones. `PhaseDefinitionV1["cast"].participants[].provider`
 * (`PhaseProvider`) and `ParticipantAdapter.provider` (`RoomProvider`) are distinct branded string
 * types over the same underlying provider keys (`"codex"`/`"claude"`/`"ollama"`), so the lookup below
 * compares them as plain strings rather than forcing a brand match.
 */
export function buildPhaseParticipantsPortV1(
  config: RoomParticipantsConfigV1,
): PhaseParticipantsPort {
  const adapters = new Map<string, ParticipantAdapter>();
  if (config.codex !== undefined) {
    const adapter = createCodexParticipant(config.codex);
    adapters.set(String(adapter.provider), adapter);
  }
  if (config.claude !== undefined) {
    const adapter = createClaudeParticipant(config.claude);
    adapters.set(String(adapter.provider), adapter);
  }
  if (config.gemini !== undefined) {
    const adapter = createGeminiParticipant(config.gemini);
    adapters.set(String(adapter.provider), adapter);
  }
  const ollamaInstances = normalizeOllamaInstances(config.ollama);
  for (const adapter of buildOllamaAdapters(ollamaInstances, createFetchOllamaTransport())) {
    adapters.set(String(adapter.provider), adapter);
  }
  if (config.openrouter !== undefined && config.openrouter.length > 0) {
    const openRouterTransport = createFetchProviderHttpTransport({
      credentials: createCredentialBroker(),
      authorization: deriveOpenRouterBearerAuthorization,
    });
    for (const instance of config.openrouter) {
      if (instance.credentialReference === null) continue;
      const adapter = createOpenRouterParticipant({
        id: instance.id,
        model: instance.model,
        credentialReference: instance.credentialReference,
        transport: openRouterTransport,
        ...(instance.baseUrl === undefined ? {} : { baseUrl: instance.baseUrl }),
        ...(instance.timeoutMs === undefined ? {} : { timeoutMs: instance.timeoutMs }),
        ...(instance.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: instance.maxOutputTokens }),
      });
      adapters.set(String(adapter.provider), adapter);
    }
  }
  return { resolve: (provider) => adapters.get(String(provider)) ?? null };
}

export type LoadPhaseParticipantsPortOptions = LoadRoomsSubsystemConfigurationOptions;

/**
 * Top-level daemon entrypoint hook mirroring {@link loadRoomsSubsystemConfiguration} exactly --
 * SAME containment attestation gate (`isRoomsContainmentAttestedV1`, checked fresh rather than
 * thrown-on-missing, `STUDIO_ROOMS_ATTESTATION_MODE`; never a second gate), SAME participants
 * config file, SAME empty-registry tolerance for a missing file -- but returning a
 * `PhaseParticipantsPort` for `phase.run` instead of a `RoomSubsystemConfiguration` for the rooms
 * moderator.
 */
export function loadPhaseParticipantsPortV1(
  options: LoadPhaseParticipantsPortOptions,
): PhaseParticipantsPort {
  const attested = isRoomsContainmentAttestedV1(options.containmentAttestationPath);
  const config = loadRoomParticipantsConfigFileOrEmpty(options.participantsConfigPath);
  return buildRoomsCompositionV1(config, attested).phaseParticipants;
}

export type LoadPhaseProviderCatalogPortOptions = LoadRoomsSubsystemConfigurationOptions;

/**
 * Top-level daemon entrypoint hook mirroring {@link loadPhaseParticipantsPortV1} exactly (Wave 7):
 * the honest token ledger's family/model resolver for `phase.run`'s and the signal scheduler's
 * `token_usage` rows, built from the SAME participants config file and attestation gate. Not hot-
 * swapped on `provider.upsert`/`remove` today, matching `phaseParticipants`'s own known limitation
 * (see `daemon-entrypoint.ts`'s composition of both) -- a future task can thread live reload through
 * both together.
 */
export function loadPhaseProviderCatalogPortV1(
  options: LoadPhaseProviderCatalogPortOptions,
): RoomProviderCatalogPort {
  const attested = isRoomsContainmentAttestedV1(options.containmentAttestationPath);
  const config = loadRoomParticipantsConfigFileOrEmpty(options.participantsConfigPath);
  return buildRoomsCompositionV1(config, attested).providerCatalog;
}

// ---------------------------------------------------------------------------
// provider.* (Architecture decisions 2-3): read/write/CAS-digest the participants config file and
// mutate one provider instance at a time. `provider-command-runtime.ts` is the sole caller -- this
// module owns every rule about what a config file may contain; the command runtime owns the wire
// contract, digest-CAS enforcement, and hot-reload dispatch.
// ---------------------------------------------------------------------------

export class ProviderRegistryError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderRegistryError";
    this.code = code;
  }
}

function registryError(code: string, message: string): never {
  throw new ProviderRegistryError(code, message);
}

export type ProviderConfigSnapshotV1 = Readonly<{
  config: RoomParticipantsConfigV1;
  digest: Sha256Digest;
}>;

/** Digested over the canonical JSON of the parsed config object -- the same "hash the meaning, not
 *  the bytes" discipline the rest of this codebase's CAS digests already use (`canonicalJson`), so
 *  two configs that differ only in key order or incidental JSON formatting are the same digest. */
export function digestRoomParticipantsConfigV1(config: RoomParticipantsConfigV1): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalJson(config), "utf8").digest("hex")}`,
  );
}

/** `provider.list`'s and `provider.upsert`'s CAS read: the current config plus its digest, an
 *  empty registry (never a missing-file error) when nothing has been configured yet. */
export function readProviderConfigSnapshotV1(path: string): ProviderConfigSnapshotV1 {
  const config = loadRoomParticipantsConfigFileOrEmpty(path);
  return { config, digest: digestRoomParticipantsConfigV1(config) };
}

/** `provider.upsert`/`provider.remove`/`provider.credential.set`'s write side: re-validates
 *  `config` through the exact same parser a hand-edited file goes through (defense in depth -- the
 *  in-memory mutation helpers below only ever produce schema-valid shapes, but this is the one
 *  point that would catch a future mutator that didn't), then writes it atomically. */
export function writeProviderConfigSnapshotV1(
  path: string,
  config: RoomParticipantsConfigV1,
): ProviderConfigSnapshotV1 {
  const validated = parseRoomParticipantsConfigV1(config);
  writePrivateFile(
    path,
    Buffer.from(`${JSON.stringify(validated, null, 2)}\n`, "utf8"),
    PARTICIPANTS_CONFIG_LABEL,
  );
  return { config: validated, digest: digestRoomParticipantsConfigV1(validated) };
}

/** Which slot in `RoomParticipantsConfigV1` a wire `{key, family}` pair names. `"gemini"` is
 *  configured exactly like `"claude"` (Architecture decision 10): one instance, key must equal
 *  `"gemini"`, and `upsertProviderInstanceV1` refuses to CREATE a brand-new one over the wire for
 *  the same machine-local-executable-path reason codex/claude are refused -- it may only retune
 *  the `model`/`displayName` of a gemini instance an operator already configured by hand. */
export type ProviderSlotIdentityV1 =
  | Readonly<{ kind: "codex" }>
  | Readonly<{ kind: "claude" }>
  | Readonly<{ kind: "gemini" }>
  | Readonly<{ kind: "ollama-legacy" }>
  | Readonly<{ kind: "ollama-instance"; id: string }>
  | Readonly<{ kind: "openrouter-instance"; id: string }>;

const OLLAMA_INSTANCE_KEY_PATTERN = /^ollama-([a-z][a-z0-9-]{0,40})$/;
const OPENROUTER_INSTANCE_KEY_PATTERN = /^openrouter-([a-z][a-z0-9-]{0,40})$/;

/** The single place that decides whether a wire `{key, family}` pair names a real config slot --
 *  `provider.upsert`/`provider.remove` both derive identity through this before touching anything. */
export function deriveProviderSlotIdentityV1(
  key: string,
  family: ProviderFamilyV1,
): ProviderSlotIdentityV1 {
  if (family === "gemini") {
    if (key !== "gemini") {
      registryError(
        "provider.key-family-mismatch",
        `key "${key}" does not match family gemini; the gemini instance's key must be exactly "gemini".`,
      );
    }
    return { kind: "gemini" };
  }
  if (family === "codex") {
    if (key !== "codex") {
      registryError(
        "provider.key-family-mismatch",
        `key "${key}" does not match family codex; the codex instance's key must be exactly "codex".`,
      );
    }
    return { kind: "codex" };
  }
  if (family === "claude") {
    if (key !== "claude") {
      registryError(
        "provider.key-family-mismatch",
        `key "${key}" does not match family claude; the claude instance's key must be exactly "claude".`,
      );
    }
    return { kind: "claude" };
  }
  if (family === "ollama") {
    if (key === "ollama") return { kind: "ollama-legacy" };
    const match = OLLAMA_INSTANCE_KEY_PATTERN.exec(key);
    if (match === null) {
      registryError(
        "provider.key-family-mismatch",
        `key "${key}" does not match family ollama; expected "ollama" or "ollama-<id>".`,
      );
    }
    return { kind: "ollama-instance", id: match[1] as string };
  }
  // family === "openrouter"
  const match = OPENROUTER_INSTANCE_KEY_PATTERN.exec(key);
  if (match === null) {
    registryError(
      "provider.key-family-mismatch",
      `key "${key}" does not match family openrouter; expected "openrouter-<id>".`,
    );
  }
  return { kind: "openrouter-instance", id: match[1] as string };
}

export type ProviderUpsertOutcomeV1 = Readonly<{
  config: RoomParticipantsConfigV1;
  created: boolean;
}>;

function assertProviderInstanceLimitV1(config: RoomParticipantsConfigV1): void {
  const count = enumerateProviderSlotsV1(config).length;
  if (count > MAX_PROVIDER_INSTANCES_V1) {
    registryError(
      "provider.limit-exceeded",
      `At most ${String(MAX_PROVIDER_INSTANCES_V1)} provider instances may be configured.`,
    );
  }
}

/**
 * Builds the NEXT `RoomParticipantsConfigV1` with `spec` applied over the CURRENT one -- pure, no
 * I/O. Creating a brand-new codex/claude instance is refused
 * (`provider.family-requires-local-configuration`): `executable`/`codexHome`/runner-and-scratch
 * roots are machine-local paths the generic wire payload cannot supply, so codex/claude must
 * already exist in the file (configured once by hand) before `provider.upsert` may retune their
 * `model`/`displayName`. A brand-new OpenRouter instance is created with `credentialReference:
 * null` -- catalog-visible, not yet adapter-activated until `provider.credential.set` funds it.
 */
export function upsertProviderInstanceV1(
  config: RoomParticipantsConfigV1,
  spec: ProviderUpsertSpecV1,
): ProviderUpsertOutcomeV1 {
  const identity = deriveProviderSlotIdentityV1(spec.key, spec.family);
  let next: ProviderUpsertOutcomeV1;
  switch (identity.kind) {
    case "codex": {
      if (config.codex === undefined) {
        registryError(
          "provider.family-requires-local-configuration",
          "A new codex instance cannot be created over the wire: executable/codexHome/runnerRoot/scratchRoot are machine-local paths only an operator editing the config file directly can supply. Configure codex once by hand, then provider.upsert may update its model/displayName.",
        );
      }
      next = {
        config: {
          ...config,
          codex: { ...config.codex, model: spec.model, displayName: spec.displayName },
        },
        created: false,
      };
      break;
    }
    case "claude": {
      if (config.claude === undefined) {
        registryError(
          "provider.family-requires-local-configuration",
          "A new claude instance cannot be created over the wire: executable is a machine-local path only an operator editing the config file directly can supply. Configure claude once by hand, then provider.upsert may update its model/displayName.",
        );
      }
      next = {
        config: {
          ...config,
          claude: { ...config.claude, model: spec.model, displayName: spec.displayName },
        },
        created: false,
      };
      break;
    }
    case "gemini": {
      if (config.gemini === undefined) {
        registryError(
          "provider.family-requires-local-configuration",
          "A new gemini instance cannot be created over the wire: executable is a machine-local path only an operator editing the config file directly can supply. Configure gemini once by hand, then provider.upsert may update its model/displayName.",
        );
      }
      next = {
        config: {
          ...config,
          gemini: { ...config.gemini, model: spec.model, displayName: spec.displayName },
        },
        created: false,
      };
      break;
    }
    case "ollama-legacy": {
      if (config.ollama !== undefined && Array.isArray(config.ollama)) {
        registryError(
          "provider.key-family-mismatch",
          'key "ollama" names the legacy singular instance, but this config already configures named ollama instances; use "ollama-<id>" instead.',
        );
      }
      const created = config.ollama === undefined;
      next = {
        config: {
          ...config,
          ollama: { ...config.ollama, model: spec.model, displayName: spec.displayName },
        },
        created,
      };
      break;
    }
    case "ollama-instance": {
      if (config.ollama !== undefined && !Array.isArray(config.ollama)) {
        registryError(
          "provider.key-family-mismatch",
          `key "ollama-${identity.id}" names a named instance, but this config's ollama entry is the legacy singular form; use key "ollama" instead, or remove the legacy entry first.`,
        );
      }
      const instances = config.ollama ?? [];
      const index = instances.findIndex((instance) => instance.id === identity.id);
      const created = index === -1;
      const existing = created ? undefined : instances[index];
      const nextInstance: RoomOllamaInstanceConfigV1 = {
        ...(existing ?? {}),
        id: identity.id,
        model: spec.model,
        displayName: spec.displayName,
      };
      next = {
        config: {
          ...config,
          ollama: created
            ? [...instances, nextInstance]
            : instances.map((instance, i) => (i === index ? nextInstance : instance)),
        },
        created,
      };
      break;
    }
    case "openrouter-instance": {
      const instances = config.openrouter ?? [];
      const index = instances.findIndex((instance) => instance.id === identity.id);
      const created = index === -1;
      if (created && instances.length >= 5) {
        registryError(
          "provider.limit-exceeded",
          "At most 5 OpenRouter instances may be configured.",
        );
      }
      const existing = created ? undefined : instances[index];
      const nextInstance: RoomOpenRouterParticipantConfigV1 = {
        ...(existing ?? { credentialReference: null }),
        id: identity.id,
        model: spec.model,
        displayName: spec.displayName,
      };
      next = {
        config: {
          ...config,
          openrouter: created
            ? [...instances, nextInstance]
            : instances.map((instance, i) => (i === index ? nextInstance : instance)),
        },
        created,
      };
      break;
    }
  }
  assertProviderInstanceLimitV1(next.config);
  return next;
}

export type ProviderRemoveOutcomeV1 = Readonly<{
  config: RoomParticipantsConfigV1;
  removed: boolean;
}>;

/** Drops one top-level field from a config, e.g. clearing `codex` back to "not configured" on
 *  removal. Goes through a loosely-typed local (never `delete` on the strongly-typed, all-readonly
 *  `RoomParticipantsConfigV1`) purely to avoid an unused destructured binding for the dropped key. */
function withoutField(
  config: RoomParticipantsConfigV1,
  key: "codex" | "claude" | "gemini" | "ollama" | "openrouter",
): RoomParticipantsConfigV1 {
  const next: Record<string, unknown> = { ...config };
  Reflect.deleteProperty(next, key);
  return next as RoomParticipantsConfigV1;
}

/** Idempotent: removing an already-absent key is a no-op (`removed: false`), never an error --
 *  the same "safe to retry" idiom `RoomRepository`'s own durable operations use. */
export function removeProviderInstanceV1(
  config: RoomParticipantsConfigV1,
  key: RoomProvider,
): ProviderRemoveOutcomeV1 {
  if (key === "codex" && config.codex !== undefined) {
    return { config: withoutField(config, "codex"), removed: true };
  }
  if (key === "claude" && config.claude !== undefined) {
    return { config: withoutField(config, "claude"), removed: true };
  }
  if (key === "gemini" && config.gemini !== undefined) {
    return { config: withoutField(config, "gemini"), removed: true };
  }
  if (config.ollama !== undefined) {
    if (key === "ollama" && !Array.isArray(config.ollama)) {
      return { config: withoutField(config, "ollama"), removed: true };
    }
    if (Array.isArray(config.ollama)) {
      const match = OLLAMA_INSTANCE_KEY_PATTERN.exec(key);
      if (match !== null) {
        const id = match[1] as string;
        const remaining = config.ollama.filter((instance) => instance.id !== id);
        if (remaining.length !== config.ollama.length) {
          return {
            config:
              remaining.length === 0
                ? withoutField(config, "ollama")
                : { ...config, ollama: remaining },
            removed: true,
          };
        }
      }
    }
  }
  if (config.openrouter !== undefined) {
    const match = OPENROUTER_INSTANCE_KEY_PATTERN.exec(key);
    if (match !== null) {
      const id = match[1] as string;
      const remaining = config.openrouter.filter((instance) => instance.id !== id);
      if (remaining.length !== config.openrouter.length) {
        return {
          config:
            remaining.length === 0
              ? withoutField(config, "openrouter")
              : { ...config, openrouter: remaining },
          removed: true,
        };
      }
    }
  }
  return { config, removed: false };
}

/** `provider.credential.set`'s config-side half (Architecture decision 2): sets (or replaces) an
 *  OpenRouter instance's `credentialReference` in place. Refuses a key naming any other family --
 *  codex/claude/ollama never carry a Keychain credential in this config (codex/claude authenticate
 *  through their own CLI session; ollama is loopback-only). */
export function setProviderCredentialReferenceV1(
  config: RoomParticipantsConfigV1,
  key: RoomProvider,
  credentialReference: CredentialReferenceV1,
): RoomParticipantsConfigV1 {
  const match = OPENROUTER_INSTANCE_KEY_PATTERN.exec(key);
  if (match === null) {
    registryError(
      "provider.credential-not-applicable",
      `key "${key}" does not name an OpenRouter instance; only OpenRouter instances take a Keychain credential in this registry.`,
    );
  }
  const id = match[1] as string;
  const instances = config.openrouter ?? [];
  const index = instances.findIndex((instance) => instance.id === id);
  if (index === -1) {
    registryError(
      "provider.not-found",
      `No OpenRouter instance is configured for key "${key}". provider.upsert it first, then set its credential.`,
    );
  }
  const updated = instances[index] as RoomOpenRouterParticipantConfigV1;
  return {
    ...config,
    openrouter: instances.map((instance, i) =>
      i === index ? { ...updated, credentialReference } : instance,
    ),
  };
}

/** Maps one enumerated slot to the wire's owner-surface `ProviderInstanceV1` (`provider.list`
 *  /`provider.upsert`'s result) -- may carry a credential REFERENCE (service/account), never the
 *  secret itself (Architecture decision 2). */
export function providerInstanceFromSlotV1(slot: RoomProviderSlotV1): ProviderInstanceV1 {
  return {
    key: slot.key,
    family: slot.family,
    model: slot.model,
    displayName: slot.displayName,
    credentialReference: slot.credentialReference,
  };
}

/** `provider.upsert`'s result echoes the instance it just wrote; look it up by key from the
 *  freshly-written config rather than re-deriving it field by field. */
export function findProviderSlotV1(
  config: RoomParticipantsConfigV1,
  key: RoomProvider,
): RoomProviderSlotV1 | null {
  return enumerateProviderSlotsV1(config).find((slot) => slot.key === key) ?? null;
}
