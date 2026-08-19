import { parseCredentialReference, type CredentialReferenceV1 } from "@app-factory/adapter-sdk";
import { createCredentialBroker } from "@app-factory/credential-broker";
import {
  createFetchOllamaTransport,
  createOllamaScorer,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
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
}>;

export type RoomOpenRouterParticipantConfigV1 = Readonly<{
  /** Short slug; becomes this instance's RoomProvider key as `openrouter-<id>`. Unique within the
   *  `openrouter` array -- rooms can be configured against several named OpenRouter instances (one
   *  per model) simultaneously, unlike codex/claude/ollama which are each configured at most once. */
  id: string;
  model: string;
  credentialReference: CredentialReferenceV1;
  baseUrl?: string;
  timeoutMs?: number;
}>;

export type RoomParticipantsConfigV1 = Readonly<{
  schemaVersion: 1;
  codex?: RoomCodexParticipantConfigV1;
  claude?: RoomClaudeParticipantConfigV1;
  ollama?: RoomOllamaParticipantConfigV1;
  openrouter?: readonly RoomOpenRouterParticipantConfigV1[];
  roster?: RoomRosterConfigV1;
}>;

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

function parseOllamaParticipantConfig(value: unknown): RoomOllamaParticipantConfigV1 {
  if (!isRecord(value)) configurationError("ollama participant configuration must be an object.");
  allowedKeys(value, ["baseUrl", "model", "timeoutMs"], "ollama participant configuration");
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
  };
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
    ["id", "model", "credentialReference", "baseUrl", "timeoutMs"],
    "openrouter participant configuration",
  );
  const id = boundedString(value.id, "openrouter.id", 41);
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(id)) {
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
    ["schemaVersion", "codex", "claude", "ollama", "openrouter", "roster"],
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
  return {
    schemaVersion: 1,
    ...(input.codex === undefined ? {} : { codex: parseCodexParticipantConfig(input.codex) }),
    ...(input.claude === undefined ? {} : { claude: parseClaudeParticipantConfig(input.claude) }),
    ...(input.ollama === undefined ? {} : { ollama: parseOllamaParticipantConfig(input.ollama) }),
    ...(input.openrouter === undefined
      ? {}
      : { openrouter: parseOpenRouterParticipantsConfig(input.openrouter) }),
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
  const providers: RoomParticipantsCatalogSourceV1["providers"][number][] = [];
  if (config.codex !== undefined) {
    providers.push({
      provider: "codex",
      model: config.codex.model,
      cliVersion: config.codex.expectedCliVersion ?? null,
    });
  }
  if (config.claude !== undefined) {
    providers.push({ provider: "claude", model: config.claude.model, cliVersion: null });
  }
  if (config.ollama !== undefined) {
    providers.push({
      provider: "ollama",
      model: config.ollama.model ?? DEFAULT_OLLAMA_MODEL,
      cliVersion: null,
    });
  }
  for (const instance of config.openrouter ?? []) {
    providers.push({ provider: "openrouter", model: instance.model, cliVersion: null });
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
  const ollamaConfig = config.ollama ?? {};
  const ollamaTransport = createFetchOllamaTransport();
  const ollamaBaseUrl = ollamaConfig.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  const ollamaModel = ollamaConfig.model ?? DEFAULT_OLLAMA_MODEL;
  if (config.ollama !== undefined) {
    adapters.push(
      createOllamaParticipant({
        transport: ollamaTransport,
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
        ...(ollamaConfig.timeoutMs === undefined ? {} : { timeoutMs: ollamaConfig.timeoutMs }),
      }),
    );
  }
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
        }),
      );
    }
  }

  const charters = createRosterCharterProvider({
    transport: ollamaTransport,
    ...(config.roster === undefined ? {} : { roster: config.roster }),
    summarizerConfig: { baseUrl: ollamaBaseUrl, model: ollamaModel },
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
      config: { baseUrl: ollamaBaseUrl, model: ollamaModel, timeoutMs: 20_000 },
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
  if (config.ollama !== undefined) {
    const ollamaConfig = config.ollama;
    const adapter = createOllamaParticipant({
      transport: createFetchOllamaTransport(),
      baseUrl: ollamaConfig.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      model: ollamaConfig.model ?? DEFAULT_OLLAMA_MODEL,
      ...(ollamaConfig.timeoutMs === undefined ? {} : { timeoutMs: ollamaConfig.timeoutMs }),
    });
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
