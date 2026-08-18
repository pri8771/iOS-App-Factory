import { createHash } from "node:crypto";

import {
  createAscJwtAuthorization,
  createAscReadObserver,
  parseAscIssuerId,
  parseAscKeyId,
  type AscReadObserver,
  type AscReadOutcome,
} from "@app-factory/asc-adapter";
import {
  AscReleaseObservationV1Schema,
  IsoInstantSchema,
  RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
  ReleaseProjectionV1Schema,
  Sha256DigestSchema,
  canonicalAscReleaseObservationDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  type AscAppReleaseObservationV1,
  type AscObserverSourceV1,
  type AscReadOutcomeSummaryV1,
  type AscReleaseObservationDigestInputV1,
  type AscReleaseObservationId,
  type AscReleaseObservationV1,
  type IsoInstant,
  type ReleaseObserverStatusV1,
  type ReleaseProjectionV1,
} from "@app-factory/contracts";
import { createCredentialBroker } from "@app-factory/credential-broker";
import type { AscReleaseObservationRepository } from "@app-factory/kernel";
import type { BoundedProviderHttpTransport } from "@app-factory/provider-http-adapters";
import { createFetchProviderHttpTransport } from "@app-factory/provider-transport";

import {
  LocalExecutionProfileConfigurationError,
  readPrivateFile,
} from "./local-execution-profile.js";

/**
 * Studio Phase 6 step B — `release.observe` / `release.projection`.
 *
 * The daemon composes the read-only App Store Connect observer (`packages/asc-adapter`) exactly the
 * way the manual live smoke did (`scripts/ops/asc-live-read.mjs`): the credential broker resolves
 * the `.p8` Keychain item just in time, the sanctioned fetch transport attaches an ES256 JWT it
 * mints inside the broker's window, and the observer issues bounded GETs only. Nothing here can
 * write to Apple; there is no POST/PATCH/DELETE code path in the adapter.
 *
 * Composition is OPT-IN by configuration file (`APP_FACTORY_ASC_OBSERVER_CONFIG`). Without it the
 * port is inert: `release.observe` refuses with `release.observer-not-configured` and
 * `release.projection` still serves whatever an earlier configured daemon persisted, badged with
 * that observation's own `observedAt`. The observation itself is taken OUTSIDE the command
 * runtime's serial executor (network time must not stall every other command) and persisted inside
 * it; see `command-runtime.ts`.
 */

const ASC_OBSERVER_CONFIG_LABEL = "APP_FACTORY_ASC_OBSERVER_CONFIG";
const MAX_ASC_OBSERVER_CONFIG_BYTES = 16 * 1024;

/**
 * The on-disk shape of `APP_FACTORY_ASC_OBSERVER_CONFIG` (names only; the `.p8` stays in Keychain):
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "keyId": "ABCDEFGHIJ",
 *   "issuerId": "<lowercase uuid>",
 *   "credentialReference": { "schemaVersion": 1, "kind": "macos-keychain", "service": "...", "account": "..." },
 *   "requestTimeoutMs": 30000,
 *   "jwtTtlSeconds": 600
 * }
 * ```
 */
export type AscObserverConfigV1 = Readonly<{
  schemaVersion: 1;
  keyId: string;
  issuerId: string;
  credentialReference: Readonly<{
    schemaVersion: 1;
    kind: "macos-keychain";
    service: string;
    account: string;
  }>;
  requestTimeoutMs: number;
  jwtTtlSeconds: number;
}>;

function configurationError(message: string, cause?: unknown): never {
  throw new LocalExecutionProfileConfigurationError(message, {
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    configurationError(
      `${ASC_OBSERVER_CONFIG_LABEL}: ${label} must be a string of 1..${String(maximum)} characters.`,
    );
  }
  return value;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    configurationError(
      `${ASC_OBSERVER_CONFIG_LABEL}: ${label} must be an integer in ${String(minimum)}..${String(maximum)}.`,
    );
  }
  return value;
}

export function parseAscObserverConfigV1(input: unknown): AscObserverConfigV1 {
  if (!isRecord(input)) configurationError(`${ASC_OBSERVER_CONFIG_LABEL} must be a JSON object.`);
  const allowed = new Set([
    "schemaVersion",
    "keyId",
    "issuerId",
    "credentialReference",
    "requestTimeoutMs",
    "jwtTtlSeconds",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) configurationError(`${ASC_OBSERVER_CONFIG_LABEL}: unknown key ${key}.`);
  }
  if (input.schemaVersion !== 1)
    configurationError(`${ASC_OBSERVER_CONFIG_LABEL}: schemaVersion must be 1.`);
  let keyId: string;
  let issuerId: string;
  try {
    keyId = parseAscKeyId(input.keyId);
    issuerId = parseAscIssuerId(input.issuerId);
  } catch (error) {
    configurationError(
      `${ASC_OBSERVER_CONFIG_LABEL}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const reference = input.credentialReference;
  if (!isRecord(reference)) {
    configurationError(`${ASC_OBSERVER_CONFIG_LABEL}: credentialReference must be an object.`);
  }
  for (const key of Object.keys(reference)) {
    if (!["schemaVersion", "kind", "service", "account"].includes(key)) {
      configurationError(
        `${ASC_OBSERVER_CONFIG_LABEL}: credentialReference has unknown key ${key}.`,
      );
    }
  }
  if (reference.schemaVersion !== 1 || reference.kind !== "macos-keychain") {
    configurationError(
      `${ASC_OBSERVER_CONFIG_LABEL}: credentialReference must be { schemaVersion: 1, kind: "macos-keychain", ... }.`,
    );
  }
  return {
    schemaVersion: 1,
    keyId,
    issuerId,
    credentialReference: {
      schemaVersion: 1,
      kind: "macos-keychain",
      service: boundedString(reference.service, "credentialReference.service", 200),
      account: boundedString(reference.account, "credentialReference.account", 200),
    },
    requestTimeoutMs: boundedInteger(
      input.requestTimeoutMs,
      "requestTimeoutMs",
      100,
      120_000,
      30_000,
    ),
    jwtTtlSeconds: boundedInteger(input.jwtTtlSeconds, "jwtTtlSeconds", 60, 1_200, 600),
  };
}

/** Reads the observer config through the same private-file discipline as every other daemon config file. */
export function loadAscObserverConfigFile(path: string): AscObserverConfigV1 {
  const bytes = readPrivateFile(path, MAX_ASC_OBSERVER_CONFIG_BYTES, ASC_OBSERVER_CONFIG_LABEL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    configurationError(`${ASC_OBSERVER_CONFIG_LABEL} must contain valid JSON.`, error);
  }
  return parseAscObserverConfigV1(parsed);
}

export type TakeReleaseObservationInput = Readonly<{
  observationId: AscReleaseObservationId;
  observedAt: IsoInstant;
  buildsLimit: number;
  signal: AbortSignal;
}>;

/**
 * What the command runtime composes against. `status()` is what `release.projection` reports;
 * `observe` is what `release.observe` calls (outside the serial executor). The inert port reports
 * `configured: false` and refuses to observe.
 */
export type ReleaseObserverPort = Readonly<{
  status(): ReleaseObserverStatusV1;
  observe(input: TakeReleaseObservationInput): Promise<AscReleaseObservationV1>;
}>;

export class ReleaseObserverNotConfiguredError extends Error {
  public constructor() {
    super(RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1);
    this.name = "ReleaseObserverNotConfiguredError";
  }
}

export const INERT_RELEASE_OBSERVER_PORT: ReleaseObserverPort = {
  status: () => ({
    configured: false,
    unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
    source: null,
  }),
  observe: () => Promise.reject(new ReleaseObserverNotConfiguredError()),
};

function summarizeOutcome(outcome: AscReadOutcome<unknown>): AscReadOutcomeSummaryV1 {
  switch (outcome.kind) {
    case "observed":
      return {
        kind: "observed",
        status: outcome.status,
        pages: outcome.pages,
        code: null,
        detail: null,
      };
    case "denied":
      return {
        kind: "denied",
        status: outcome.status,
        pages: null,
        code: outcome.code,
        detail: outcome.detail.slice(0, 2_000),
      };
    case "ambiguous":
      return {
        kind: "ambiguous",
        status: outcome.status,
        pages: null,
        code: outcome.code,
        detail: outcome.detail.slice(0, 2_000),
      };
  }
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function sortKey(entry: AscAppReleaseObservationV1): string {
  return `${entry.app.name.toLowerCase()} ${entry.app.appId}`;
}

/**
 * Drives one complete observation through an already-composed observer: `GET /v1/apps`, then for
 * each app the builds + App Store versions reads (`observeAppRelease`), counting every exchange the
 * observer reports. Pure with respect to time: `observedAt` is the caller's clock reading.
 */
export async function takeAscReleaseObservationV1(
  observer: AscReadObserver,
  source: AscObserverSourceV1,
  input: TakeReleaseObservationInput,
  exchanges: Readonly<{ count(): number; statuses(): readonly number[] }>,
): Promise<AscReleaseObservationV1> {
  const apps = await observer.listApps(input.signal);
  const appObservations: AscAppReleaseObservationV1[] = [];
  if (apps.kind === "observed") {
    for (const app of apps.value) {
      const observation = await observer.observeAppRelease(app, input.signal, {
        limit: input.buildsLimit,
      });
      appObservations.push({
        app: observation.app,
        builds: summarizeOutcome(observation.builds),
        appStoreVersions: summarizeOutcome(observation.appStoreVersions),
        projection: observation.projection,
      });
    }
  }
  appObservations.sort((left, right) => {
    const a = sortKey(left);
    const b = sortKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const digestInput: AscReleaseObservationDigestInputV1 = {
    schemaVersion: 1,
    observationId: input.observationId,
    observedAt: input.observedAt,
    source,
    apps: summarizeOutcome(apps),
    appObservations,
    requestCount: exchanges.count(),
    statuses: [...exchanges.statuses()],
  };
  return AscReleaseObservationV1Schema.parse({
    ...digestInput,
    observationDigest: sha256(canonicalAscReleaseObservationDigestInputV1(digestInput)),
  });
}

export type CreateAscReleaseObserverPortOptions = Readonly<{
  config: AscObserverConfigV1;
  /**
   * Test seam: a transport to observe through instead of the composed broker + fetch transport +
   * ES256 JWT derivation. Production callers omit it. Nothing in this module can hand a real
   * credential to an injected transport: the broker is only ever composed into the default one.
   */
  transport?: BoundedProviderHttpTransport;
  now?: () => Date;
}>;

/** The composed, opt-in App Store Connect observer port. */
export function createAscReleaseObserverPort(
  options: CreateAscReleaseObserverPortOptions,
): ReleaseObserverPort {
  const { config } = options;
  const source: AscObserverSourceV1 = {
    keyId: config.keyId,
    issuerId: config.issuerId,
    keychainService: config.credentialReference.service,
    keychainAccount: config.credentialReference.account,
    origin: "https://api.appstoreconnect.apple.com",
  };
  const clock = { now: options.now ?? (() => new Date()) };
  return {
    status: () => ({ configured: true, unavailableReason: null, source }),
    async observe(input) {
      const transport =
        options.transport ??
        createFetchProviderHttpTransport({
          credentials: createCredentialBroker(),
          authorization: createAscJwtAuthorization({
            keyId: config.keyId,
            issuerId: config.issuerId,
            ttlSeconds: config.jwtTtlSeconds,
            scopeToRequest: false,
            clock,
          }),
          clock,
        });
      const statuses: number[] = [];
      let count = 0;
      const observer = createAscReadObserver({
        transport,
        credentialReference: config.credentialReference,
        requestTimeoutMs: config.requestTimeoutMs,
        clock,
        onExchange: (record) => {
          count += 1;
          if (record.status !== null) statuses.push(record.status);
        },
      });
      return takeAscReleaseObservationV1(observer, source, input, {
        count: () => count,
        statuses: () => statuses,
      });
    },
  };
}

/** `release.projection`: the read-only view over persisted observations plus observer status. */
export function buildReleaseProjectionV1(
  repository: AscReleaseObservationRepository,
  observer: ReleaseObserverPort,
  generatedAt: IsoInstant,
): ReleaseProjectionV1 {
  const digestInput = {
    schemaVersion: 1 as const,
    observer: observer.status(),
    latest: repository.latest(),
    observationCount: repository.count(),
  };
  return ReleaseProjectionV1Schema.parse({
    ...digestInput,
    generatedAt: IsoInstantSchema.parse(generatedAt),
    sourceDigest: Sha256DigestSchema.parse(
      sha256(canonicalReleaseProjectionDigestInputV1(digestInput)),
    ),
  });
}
