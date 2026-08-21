import { spawn } from "node:child_process";

import { CODEX_SAFE_AGENT_ENVIRONMENT_NAMES } from "@app-factory/agent-runner";
import {
  CredentialReferenceV1Schema,
  IsoInstantSchema,
  type CredentialReferenceV1,
  type ProviderHealthEntryV1,
  type ProviderHealthReportV1,
  type RoomProvider,
} from "@app-factory/contracts";
import type { CredentialBroker } from "@app-factory/credential-broker";
import { performProviderHttpRequest } from "@app-factory/provider-http-adapters";
import { createFetchProviderHttpTransport } from "@app-factory/provider-transport";
import {
  CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES,
  deriveOpenRouterBearerAuthorization,
} from "@app-factory/studio-room-adapters";

import type { ProviderRegistryPort } from "./command-runtime.js";
import {
  CONTAINMENT_ATTESTATION_MISSING_DETAIL_V1,
  ProviderRegistryError,
  RoomParticipantsConfigurationError,
  enumerateProviderSlotsV1,
  findProviderSlotV1,
  isRoomsContainmentAttestedV1,
  normalizeOllamaInstances,
  providerInstanceFromSlotV1,
  readProviderConfigSnapshotV1,
  removeProviderInstanceV1,
  setProviderCredentialReferenceV1,
  upsertProviderInstanceV1,
  writeProviderConfigSnapshotV1,
  type RoomParticipantsConfigV1,
  type RoomProviderSlotV1,
} from "./room-participants-config.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `provider.*` (Architecture decisions 2-3): the daemon composition layer's real implementation of
 * `command-runtime.ts`'s `ProviderRegistryPort`. Built from `room-participants-config.ts`'s pure
 * read/write/mutate helpers over the participants config file, plus the Wave-2 `CredentialBroker`
 * for `provider.credential.set`/`provider.health`'s Keychain and network round trips. This file is
 * deliberately never imported BY `command-runtime.ts` (only its `ProviderRegistryPort` TYPE is,
 * and that type is self-contained over `@app-factory/contracts` alone) -- `command-runtime.ts`
 * receives the port `factory-daemon-service.ts` (or a test) builds here as a plain injected value,
 * exactly like `initializeRooms`/`releaseObserver`. This keeps the dependency graph acyclic: this
 * module is free to depend on `room-participants-config.ts`, which itself depends on
 * `room-subsystem.ts`, which depends on `command-runtime.ts` -- a path back INTO command-runtime.ts
 * that a static import from there would turn into a cycle.
 */

const HEALTH_PROBE_TIMEOUT_MS = 5_000;
const MAX_VERSION_PROBE_OUTPUT_BYTES = 4_096;
const MAX_REPORTED_VERSION_LENGTH = 100;
/** Mirrors `openrouter-participant.ts`'s own `DEFAULT_OPENROUTER_BASE_URL` (not exported there). */
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_AUTH_KEY_PATH = "/auth/key";
/** `service`/`account` convention for a freshly minted OpenRouter credential reference (matches
 *  the fixtures `packages/contracts/test/provider.test.ts` and `command-protocol.test.ts` already
 *  exercise: `service: "app-factory.provider.<key>"`, `account: "<key>"`). */
const PROVIDER_CREDENTIAL_SERVICE_PREFIX = "app-factory.provider.";

function throwAsCommandError(error: unknown): never {
  if (error instanceof ProviderRegistryError) {
    throw new CommandHandlerError(error.code, error.message, false);
  }
  if (error instanceof RoomParticipantsConfigurationError) {
    throw new CommandHandlerError("provider.invalid-configuration", error.message, false);
  }
  throw error;
}

function digestConflictError(currentDigest: string): CommandHandlerError {
  return new CommandHandlerError(
    "provider.digest-conflict",
    `The provider registry's current digest is ${currentDigest}, not the expectedDigest supplied. Re-read provider.list and retry.`,
    true,
  );
}

function providerNotFoundError(key: string): CommandHandlerError {
  return new CommandHandlerError(
    "provider.not-found",
    `No provider is configured for key "${key}".`,
    false,
  );
}

/**
 * Reuses an instance's existing Keychain reference (rotation in place -- the same `security
 * add-generic-password -U` semantics `CredentialBroker.store` already provides), or mints a fresh
 * one per this registry's naming convention for a `provider.upsert`-created instance that has
 * never been funded.
 */
function resolveOrMintCredentialReferenceV1(
  config: RoomParticipantsConfigV1,
  key: RoomProvider,
): CredentialReferenceV1 {
  const existing = findProviderSlotV1(config, key)?.credentialReference;
  if (existing !== null && existing !== undefined) return existing;
  return CredentialReferenceV1Schema.parse({
    schemaVersion: 1,
    kind: "macos-keychain",
    service: `${PROVIDER_CREDENTIAL_SERVICE_PREFIX}${key}`,
    account: key,
  });
}

function summarizeProbeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replaceAll(/\s+/g, " ").trim();
  return (normalized.length > 0 ? normalized : "unknown probe failure").slice(0, 500);
}

export type VersionProbeResult = Readonly<{
  ok: boolean;
  version: string | null;
  timedOut: boolean;
}>;

/** Test seam: replaces the real `spawn`-based `<executable> --version` probe. */
export type VersionProbePort = (
  executable: string,
  environment: Readonly<Record<string, string>>,
  timeoutMs: number,
) => Promise<VersionProbeResult>;

function pickSafeEnvironment(names: readonly string[]): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  environment.NO_COLOR = "1";
  return environment;
}

/** Bounded, allowlisted-env `<executable> --version` probe: no shell, capped stdout, killed at
 *  `timeoutMs`. A non-zero exit or a spawn failure is `ok: false`, never thrown -- the caller
 *  reports it as an honest `unreachable` status. */
const defaultVersionProbe: VersionProbePort = (executable, environment, timeoutMs) =>
  new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    const finish = (result: VersionProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, version: null, timedOut: true });
    }, timeoutMs);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, ["--version"], {
        env: environment,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, version: null, timedOut: false });
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_VERSION_PROBE_OUTPUT_BYTES) {
        stdout += chunk.toString("utf8").slice(0, MAX_VERSION_PROBE_OUTPUT_BYTES - stdout.length);
      }
    });
    child.on("error", () => finish({ ok: false, version: null, timedOut: false }));
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      finish({
        ok: code === 0,
        version: trimmed.length > 0 ? trimmed.slice(0, MAX_REPORTED_VERSION_LENGTH) : null,
        timedOut: false,
      });
    });
  });

export type ProviderRegistryDependencies = Readonly<{
  /** Absolute path to the participants config JSON file `provider.*` reads, writes, and probes. */
  configPath: string;
  /** Same attestation file (and gate) the rooms subsystem and the coding-agent profile use.
   *  Checked FRESH on every activating call (every upsert/remove/credential.set/health), never
   *  cached -- Architecture decision 3. */
  containmentAttestationPath?: string;
  /** The daemon's shared credential broker (Architecture decision 2). Tests inject one built over
   *  a fake `CredentialCommandPort` so no real Keychain is ever touched. */
  credentialBroker: CredentialBroker;
  /**
   * Called after every successful `provider.upsert`/`provider.remove`/`provider.credential.set`
   * write with the freshly-written config (Architecture decision 3): hot-swaps the composed rooms
   * subsystem (and its phase-participants pool) so the change is live with no daemon restart.
   * Omitted (or a no-op) when rooms were never composed at all -- `provider.*` still persists to
   * the file correctly; there is simply nothing to swap.
   */
  reloadRooms?: (config: RoomParticipantsConfigV1, attested: boolean) => Promise<void>;
  /** Test seam: replaces the real `child_process.spawn`-based codex/claude `--version` probe. */
  versionProbe?: VersionProbePort;
  /** Test seam: replaces the platform `fetch` the ollama `/api/tags` probe and the OpenRouter
   *  HTTP transport use. */
  fetchImpl?: typeof fetch;
}>;

function findOpenRouterBaseUrl(config: RoomParticipantsConfigV1, slotKey: RoomProvider): string {
  const id = slotKey.slice("openrouter-".length);
  const instance = config.openrouter?.find((candidate) => candidate.id === id);
  return instance?.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL;
}

async function probeCodexOrClaude(
  executable: string,
  environment: Readonly<Record<string, string>>,
  deps: ProviderRegistryDependencies,
): Promise<ProviderHealthReportV1> {
  const startedAt = Date.now();
  const probe = deps.versionProbe ?? defaultVersionProbe;
  const result = await probe(executable, environment, HEALTH_PROBE_TIMEOUT_MS);
  const latencyMs = Date.now() - startedAt;
  if (result.timedOut) {
    return { status: "unreachable", detail: "--version probe timed out", latencyMs, version: null };
  }
  if (!result.ok) {
    return {
      status: "unreachable",
      detail: "--version probe exited non-zero or could not be started",
      latencyMs,
      version: null,
    };
  }
  return { status: "ok", detail: null, latencyMs, version: result.version };
}

async function probeOllama(
  baseUrl: string,
  deps: ProviderRegistryDependencies,
): Promise<ProviderHealthReportV1> {
  const startedAt = Date.now();
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        status: "unreachable",
        detail: `HTTP ${String(response.status)}`,
        latencyMs,
        version: null,
      };
    }
    return { status: "ok", detail: null, latencyMs, version: null };
  } catch (error) {
    return {
      status: "unreachable",
      detail: summarizeProbeError(error),
      latencyMs: Date.now() - startedAt,
      version: null,
    };
  }
}

async function probeOpenRouter(
  slot: RoomProviderSlotV1,
  baseUrl: string,
  deps: ProviderRegistryDependencies,
): Promise<ProviderHealthReportV1> {
  const startedAt = Date.now();
  const reference = slot.credentialReference;
  if (reference === null) {
    return {
      status: "not-configured",
      detail: "no credential set for this instance yet",
      latencyMs: null,
      version: null,
    };
  }
  const signal = AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS);
  const preflight = await deps.credentialBroker.preflight(reference, signal);
  if (!preflight.available) {
    return {
      status: "unauthenticated",
      detail: preflight.blockerCode ?? "credential unavailable",
      latencyMs: Date.now() - startedAt,
      version: null,
    };
  }
  const transport = createFetchProviderHttpTransport({
    credentials: deps.credentialBroker,
    authorization: deriveOpenRouterBearerAuthorization,
    ...(deps.fetchImpl === undefined ? {} : { fetch: deps.fetchImpl }),
  });
  try {
    const response = await performProviderHttpRequest(transport, {
      schemaVersion: 1,
      method: "GET",
      url: `${baseUrl}${OPENROUTER_AUTH_KEY_PATH}`,
      headers: [],
      body: null,
      credentialReference: reference,
      credentialOrigin: new URL(baseUrl).origin,
      maximumResponseBytes: 65_536,
      deadline: IsoInstantSchema.parse(
        new Date(Date.now() + HEALTH_PROBE_TIMEOUT_MS).toISOString(),
      ),
      signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (response.status === 401 || response.status === 403) {
      return {
        status: "unauthenticated",
        detail: `HTTP ${String(response.status)}`,
        latencyMs,
        version: null,
      };
    }
    if (response.status !== 200) {
      return {
        status: "unreachable",
        detail: `HTTP ${String(response.status)}`,
        latencyMs,
        version: null,
      };
    }
    return { status: "ok", detail: null, latencyMs, version: null };
  } catch (error) {
    return {
      status: "unreachable",
      detail: summarizeProbeError(error),
      latencyMs: Date.now() - startedAt,
      version: null,
    };
  }
}

async function probeOneProviderV1(
  slot: RoomProviderSlotV1,
  config: RoomParticipantsConfigV1,
  attested: boolean,
  deps: ProviderRegistryDependencies,
): Promise<ProviderHealthEntryV1> {
  if (!attested) {
    return {
      key: slot.key,
      report: {
        status: "blocked",
        detail: CONTAINMENT_ATTESTATION_MISSING_DETAIL_V1,
        latencyMs: null,
        version: null,
      },
    };
  }
  let report: ProviderHealthReportV1;
  try {
    switch (slot.family) {
      case "codex": {
        if (config.codex === undefined) {
          report = { status: "not-configured", detail: null, latencyMs: null, version: null };
          break;
        }
        const environment = pickSafeEnvironment(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
        environment.CODEX_HOME = config.codex.codexHome;
        report = await probeCodexOrClaude(config.codex.executable, environment, deps);
        break;
      }
      case "claude": {
        if (config.claude === undefined) {
          report = { status: "not-configured", detail: null, latencyMs: null, version: null };
          break;
        }
        report = await probeCodexOrClaude(
          config.claude.executable,
          pickSafeEnvironment(CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES),
          deps,
        );
        break;
      }
      case "ollama": {
        const instance = normalizeOllamaInstances(config.ollama).find(
          (candidate) =>
            (candidate.instanceKey === "legacy" ? "ollama" : `ollama-${candidate.instanceKey}`) ===
            slot.key,
        );
        if (instance === undefined) {
          report = { status: "not-configured", detail: null, latencyMs: null, version: null };
          break;
        }
        report = await probeOllama(instance.baseUrl, deps);
        break;
      }
      case "openrouter":
        report = await probeOpenRouter(slot, findOpenRouterBaseUrl(config, slot.key), deps);
        break;
      case "gemini":
        report = {
          status: "not-configured",
          detail: "gemini is not yet a supported provider family",
          latencyMs: null,
          version: null,
        };
        break;
    }
  } catch (error) {
    report = {
      status: "unreachable",
      detail: summarizeProbeError(error),
      latencyMs: null,
      version: null,
    };
  }
  return { key: slot.key, report };
}

/**
 * Builds the real `ProviderRegistryPort` `factory-daemon-service.ts` wires into
 * `openDaemonCommandRuntime`. Every mutation re-reads the config file fresh (no cached state --
 * the digest-CAS check itself depends on that), applies the pure mutator from
 * `room-participants-config.ts`, writes atomically, then hot-reloads (Architecture decision 3).
 */
export function createProviderRegistryPort(
  deps: ProviderRegistryDependencies,
): ProviderRegistryPort {
  const attested = (): boolean => isRoomsContainmentAttestedV1(deps.containmentAttestationPath);
  const reload = async (config: RoomParticipantsConfigV1): Promise<void> => {
    await deps.reloadRooms?.(config, attested());
  };

  return {
    list() {
      const { config } = readProviderConfigSnapshotV1(deps.configPath);
      return {
        operation: "provider.list",
        providers: enumerateProviderSlotsV1(config).map(providerInstanceFromSlotV1),
      };
    },

    async upsert(request) {
      const { config: current, digest } = readProviderConfigSnapshotV1(deps.configPath);
      if (request.payload.expectedDigest !== null && request.payload.expectedDigest !== digest) {
        throw digestConflictError(digest);
      }
      let outcome;
      try {
        outcome = upsertProviderInstanceV1(current, request.payload.instance);
      } catch (error) {
        throwAsCommandError(error);
      }
      const written = writeProviderConfigSnapshotV1(deps.configPath, outcome.config);
      await reload(written.config);
      const slot = findProviderSlotV1(written.config, request.payload.instance.key);
      if (slot === null) {
        throw new Error(
          `provider.upsert wrote key "${request.payload.instance.key}" but it is absent from the config it just wrote`,
        );
      }
      return {
        operation: "provider.upsert",
        instance: providerInstanceFromSlotV1(slot),
        created: outcome.created,
        digest: written.digest,
      };
    },

    async remove(request) {
      const { config: current, digest } = readProviderConfigSnapshotV1(deps.configPath);
      if (request.payload.expectedDigest !== null && request.payload.expectedDigest !== digest) {
        throw digestConflictError(digest);
      }
      const outcome = removeProviderInstanceV1(current, request.payload.key);
      if (!outcome.removed) {
        return { operation: "provider.remove", removed: false, digest };
      }
      const written = writeProviderConfigSnapshotV1(deps.configPath, outcome.config);
      await reload(written.config);
      return { operation: "provider.remove", removed: true, digest: written.digest };
    },

    async credentialSet(request) {
      const { config: current } = readProviderConfigSnapshotV1(deps.configPath);
      const reference = resolveOrMintCredentialReferenceV1(current, request.payload.key);
      const secretBytes = new TextEncoder().encode(request.payload.secret);
      const storeSignal = AbortSignal.timeout(10_000);
      try {
        await deps.credentialBroker.store(reference, secretBytes, storeSignal);
      } finally {
        secretBytes.fill(0);
      }
      // Verify the write actually landed and is readable back before recording the reference --
      // "run a preflight" (the task's own words): a broken store must never look like success.
      const preflight = await deps.credentialBroker.preflight(
        reference,
        AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
      );
      if (!preflight.available) {
        throw new CommandHandlerError(
          "provider.credential-store-unverified",
          `The credential for "${request.payload.key}" was written to the Keychain but could not be read back (${preflight.blockerCode ?? "unknown"}).`,
          true,
        );
      }
      let nextConfig: RoomParticipantsConfigV1;
      try {
        nextConfig = setProviderCredentialReferenceV1(current, request.payload.key, reference);
      } catch (error) {
        throwAsCommandError(error);
      }
      const written = writeProviderConfigSnapshotV1(deps.configPath, nextConfig);
      await reload(written.config);
      return {
        operation: "provider.credential.set",
        key: request.payload.key,
        credentialReference: reference,
      };
    },

    async health(request) {
      const { config } = readProviderConfigSnapshotV1(deps.configPath);
      const slots = enumerateProviderSlotsV1(config);
      const targets =
        request.payload.key === null
          ? slots
          : slots.filter((slot) => slot.key === request.payload.key);
      if (request.payload.key !== null && targets.length === 0) {
        throw providerNotFoundError(request.payload.key);
      }
      const isAttested = attested();
      const reports = await Promise.all(
        targets.map((slot) => probeOneProviderV1(slot, config, isAttested, deps)),
      );
      return { operation: "provider.health", reports };
    },
  };
}
