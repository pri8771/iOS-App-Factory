import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import { createCredentialBroker } from "@app-factory/credential-broker";
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

import type { RoomParticipantsCatalogSourceV1 } from "./command-runtime.js";
import { readPrivateFile, requireOwnerContainmentAttestation } from "./local-execution-profile.js";
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
}>;

export type RoomClaudeParticipantConfigV1 = Readonly<{
  executable: string;
  model: string;
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
  credentialReference: CredentialReferenceV1;
  baseUrl?: string;
  timeoutMs?: number;
  /** Per-instance output cap; `createOpenRouterParticipant`'s own default (150) is preserved when
   *  absent. */
  maxOutputTokens?: number;
}>;

export type RoomParticipantsConfigV1 = Readonly<{
  schemaVersion: 1;
  codex?: RoomCodexParticipantConfigV1;
  claude?: RoomClaudeParticipantConfigV1;
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
  };
}

function parseClaudeParticipantConfig(value: unknown): RoomClaudeParticipantConfigV1 {
  if (!isRecord(value)) configurationError("claude participant configuration must be an object.");
  allowedKeys(value, ["executable", "model"], "claude participant configuration");
  return {
    executable: absolutePathValue(value.executable, "claude.executable"),
    model: boundedString(value.model, "claude.model", 200),
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
    ["baseUrl", "model", "timeoutMs", "maxOutputTokens"],
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
  };
}

function parseOneOllamaInstanceConfig(value: unknown): RoomOllamaInstanceConfigV1 {
  if (!isRecord(value)) configurationError("ollama instance configuration must be an object.");
  allowedKeys(
    value,
    ["id", "baseUrl", "model", "timeoutMs", "maxOutputTokens"],
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

function parseOpenRouterCredentialReference(value: unknown): CredentialReferenceV1 {
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
    ["id", "model", "credentialReference", "baseUrl", "timeoutMs", "maxOutputTokens"],
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
    ["schemaVersion", "codex", "claude", "ollama", "openrouter", "scorer", "roster"],
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

/**
 * The wire-safe projection of a parsed participants config that `room.participants.list` serves:
 * one entry per configured provider carrying ONLY its key, effective model, and (Codex) pinned CLI
 * version, plus the roster verbatim. Executables, executable digests, `codexHome`, runner/scratch
 * roots, and the Ollama base URL are daemon-local and are deliberately not projected -- a client
 * proposing a roster needs to know WHICH providers speak WHICH model, never where they live.
 */
export function buildRoomParticipantsCatalogSourceV1(
  config: RoomParticipantsConfigV1,
): RoomParticipantsCatalogSourceV1 {
  // `roomProviderKey` is left `null` here (the schema's own legacy/not-yet-computed case, see
  // `RoomCatalogProviderEntryV1Schema` in `packages/contracts/src/v1/room.ts`): deriving the real
  // per-instance key (including the `openrouter-<id>` keys that fix the multi-instance uniqueness
  // bug) is Wave 5 work (`room-participants-config.ts` extensions), not this contracts-only wave.
  const providers: RoomParticipantsCatalogSourceV1["providers"][number][] = [];
  if (config.codex !== undefined) {
    providers.push({
      provider: "codex",
      roomProviderKey: null,
      model: config.codex.model,
      cliVersion: config.codex.expectedCliVersion ?? null,
    });
  }
  if (config.claude !== undefined) {
    providers.push({
      provider: "claude",
      roomProviderKey: null,
      model: config.claude.model,
      cliVersion: null,
    });
  }
  // Only the legacy singular object form is projected here: multi-instance `ollama-<id>` catalog
  // surfacing (like the openrouter `roomProviderKey` derivation) is Wave 5 work, not this wave's.
  // (`Array.isArray`'s negative branch does not exclude a `readonly T[]` union member -- see
  // `normalizeOllamaInstances`'s comment -- so the legacy member is recovered with a cast.)
  if (config.ollama !== undefined && !Array.isArray(config.ollama)) {
    const legacy = config.ollama as RoomOllamaParticipantConfigV1;
    providers.push({
      provider: "ollama",
      roomProviderKey: null,
      model: legacy.model ?? DEFAULT_OLLAMA_MODEL,
      cliVersion: null,
    });
  }
  for (const instance of config.openrouter ?? []) {
    providers.push({
      provider: "openrouter",
      roomProviderKey: null,
      model: instance.model,
      cliVersion: null,
    });
  }
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

/** One normalized local Ollama instance, whichever of the two `config.ollama` shapes it came
 *  from -- `instanceKey` is `"legacy"` for the singular object form, else the array entry's `id`. */
type NormalizedOllamaInstance = Readonly<{
  instanceKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}>;

function normalizeOllamaInstances(
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
 * `contributor`, `revalidator`, `quotaFactory`) from a parsed participants
 * config, plus the wire-safe `participantsCatalog` `room.participants.list`
 * answers from. Only the providers present in `config` get a `ParticipantAdapter`
 * -- a room whose roster names a provider with no configured adapter simply
 * fails that provider's contributions closed (`error(internal)`) via
 * `createRoomAdapterContributor`, rather than refusing to start the whole
 * subsystem.
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

/**
 * Top-level daemon entrypoint hook: gates on the containment attestation
 * (fails closed, exactly like the coding-agent profile, if the attestation
 * file is absent or invalid), loads and validates the participants config,
 * and returns a ready-to-use `RoomSubsystemConfiguration` with `enabled: true`.
 */
export function loadRoomsSubsystemConfiguration(
  options: LoadRoomsSubsystemConfigurationOptions,
): RoomSubsystemConfiguration {
  requireOwnerContainmentAttestation(
    options.containmentAttestationPath,
    STUDIO_ROOMS_ATTESTATION_MODE,
  );
  const config = loadRoomParticipantsConfigFile(options.participantsConfigPath);
  return { enabled: true, ...buildRoomSubsystemConfiguration(config) };
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
 * SAME containment attestation gate (`requireOwnerContainmentAttestation`,
 * `STUDIO_ROOMS_ATTESTATION_MODE`; never a second gate), SAME participants config file -- but
 * returning a `PhaseParticipantsPort` for `phase.run` instead of a `RoomSubsystemConfiguration` for
 * the rooms moderator.
 */
export function loadPhaseParticipantsPortV1(
  options: LoadPhaseParticipantsPortOptions,
): PhaseParticipantsPort {
  requireOwnerContainmentAttestation(
    options.containmentAttestationPath,
    STUDIO_ROOMS_ATTESTATION_MODE,
  );
  const config = loadRoomParticipantsConfigFile(options.participantsConfigPath);
  return buildPhaseParticipantsPortV1(config);
}
