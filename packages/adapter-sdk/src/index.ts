import { createHash } from "node:crypto";

import {
  ExternalEffectV1Schema,
  ExternalProviderV1Schema,
  ExternalResourceV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  type ExternalEffectV1,
  type ExternalProviderV1,
  type ExternalResourceV1,
  type IsoInstant,
  type NamespacedCode,
  type Sha256Digest,
} from "@app-factory/contracts";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const KEYCHAIN_COMPONENT_PATTERN = /^[^\0\r\n]{1,200}$/;

export class AdapterContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AdapterContractError";
  }
}

/** A reference is safe to persist; the referenced credential value is not. */
export type CredentialReferenceV1 = Readonly<{
  schemaVersion: 1;
  kind: "macos-keychain";
  service: string;
  account: string;
}>;

export type AdapterCapabilityV1 = Readonly<{
  capability: NamespacedCode;
  available: boolean;
  blockerCode: NamespacedCode | null;
  summary: string;
}>;

export type AdapterPreflightReportV1 = Readonly<{
  schemaVersion: 1;
  adapterId: NamespacedCode;
  adapterVersion: string;
  provider: ExternalProviderV1;
  checkedAt: IsoInstant;
  credentialReference: CredentialReferenceV1 | null;
  capabilities: readonly AdapterCapabilityV1[];
}>;

export type EffectDispatchInput = Readonly<{
  effect: ExternalEffectV1;
  payload: Uint8Array;
  credentialReference: CredentialReferenceV1 | null;
  claim: EffectDispatchClaimV1;
  deadline: IsoInstant;
  signal: AbortSignal;
  assertActive(): Promise<void>;
}>;

export type EffectDispatchClaimV1 = Readonly<{
  ownerId: string;
  fence: number;
  outboxRevision: number;
  effectRevision: number;
  lockedUntil: IsoInstant;
}>;

export type EffectSendResult =
  | Readonly<{
      kind: "observed";
      correlationKey: string;
      resource: ExternalResourceV1;
      detail: Uint8Array;
    }>
  | Readonly<{
      kind: "ambiguous";
      correlationKey: string | null;
      reconcileAfter: IsoInstant;
      detail: Uint8Array;
    }>
  | Readonly<{
      kind: "rejected";
      code: NamespacedCode;
      retryable: boolean;
      detail: Uint8Array;
    }>;

export type EffectReconciliationInput = Readonly<{
  effect: ExternalEffectV1;
  credentialReference: CredentialReferenceV1 | null;
  claim: EffectDispatchClaimV1;
  deadline: IsoInstant;
  signal: AbortSignal;
  assertActive(): Promise<void>;
}>;

export type EffectReconciliationResult =
  | Readonly<{
      kind: "observed";
      correlationKey: string;
      resource: ExternalResourceV1;
      detail: Uint8Array;
    }>
  | Readonly<{
      kind: "not-found";
      correlationKey: string | null;
      reconcileAfter: IsoInstant;
      detail: Uint8Array;
    }>
  | Readonly<{
      kind: "ambiguous";
      correlationKey: string | null;
      reconcileAfter: IsoInstant;
      detail: Uint8Array;
    }>
  | Readonly<{
      kind: "manual-intervention";
      code: NamespacedCode;
      detail: Uint8Array;
    }>;

export type ExternalProviderAdapter = Readonly<{
  adapterId: string;
  adapterVersion: string;
  provider: string;
  preflight(signal: AbortSignal): Promise<unknown>;
  send(input: EffectDispatchInput): Promise<unknown>;
  reconcile(input: EffectReconciliationInput): Promise<unknown>;
}>;

export type ValidatedExternalProviderAdapter = Readonly<{
  adapterId: NamespacedCode;
  adapterVersion: string;
  provider: ExternalProviderV1;
  preflight(signal: AbortSignal): Promise<AdapterPreflightReportV1>;
  send(input: EffectDispatchInput): Promise<EffectSendResult>;
  reconcile(input: EffectReconciliationInput): Promise<EffectReconciliationResult>;
}>;

function fail(message: string): never {
  throw new AdapterContractError(message);
}

function parseBoundedString(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    fail(`${label} must be a non-empty, trimmed string of at most ${String(maximum)} characters`);
  }
  return value;
}

function parseIdentifier(value: unknown, label: string): string {
  const parsed = parseBoundedString(value, label, 200);
  if (!IDENTIFIER_PATTERN.test(parsed)) fail(`${label} is not a portable identifier`);
  return parsed;
}

function parseObject(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} contains unexpected or missing fields`);
  }
}

export function sha256Bytes(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`,
  );
}

export function parseCredentialReference(value: unknown): CredentialReferenceV1 {
  const record = parseObject(value, "credential reference");
  assertExactKeys(record, ["schemaVersion", "kind", "service", "account"], "credential reference");
  if (record.schemaVersion !== 1 || record.kind !== "macos-keychain") {
    fail("credential reference uses an unsupported contract");
  }
  const service = parseBoundedString(record.service, "credential service", 200);
  const account = parseBoundedString(record.account, "credential account", 200);
  if (!KEYCHAIN_COMPONENT_PATTERN.test(service) || !KEYCHAIN_COMPONENT_PATTERN.test(account)) {
    fail("credential reference contains unsafe characters");
  }
  return { schemaVersion: 1, kind: "macos-keychain", service, account };
}

function parseNullableCredentialReference(value: unknown): CredentialReferenceV1 | null {
  return value === null ? null : parseCredentialReference(value);
}

function parseDetail(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) fail(`${label} must be bytes`);
  if (value.byteLength > 8 * 1024 * 1024) fail(`${label} exceeds the 8 MiB limit`);
  return Uint8Array.from(value);
}

function parseCorrelationKey(value: unknown, nullable: boolean): string | null {
  if (value === null && nullable) return null;
  return parseBoundedString(value, "provider correlation key", 1_000);
}

function parseSafeInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(`${label} must be a safe integer of at least ${String(minimum)}`);
  }
  return value as number;
}

function parseDispatchClaim(value: unknown, effect: ExternalEffectV1): EffectDispatchClaimV1 {
  const record = parseObject(value, "effect dispatch claim");
  assertExactKeys(
    record,
    ["ownerId", "fence", "outboxRevision", "effectRevision", "lockedUntil"],
    "effect dispatch claim",
  );
  const claim = {
    ownerId: parseIdentifier(record.ownerId, "dispatch owner ID"),
    fence: parseSafeInteger(record.fence, "dispatch fence", 1),
    outboxRevision: parseSafeInteger(record.outboxRevision, "outbox revision", 0),
    effectRevision: parseSafeInteger(record.effectRevision, "effect revision", 0),
    lockedUntil: IsoInstantSchema.parse(record.lockedUntil),
  };
  if (claim.effectRevision !== effect.revision) {
    fail("dispatch claim effect revision does not match the effect snapshot");
  }
  return claim;
}

function parseCapability(value: unknown): AdapterCapabilityV1 {
  const record = parseObject(value, "adapter capability");
  assertExactKeys(
    record,
    ["capability", "available", "blockerCode", "summary"],
    "adapter capability",
  );
  const capability = NamespacedCodeSchema.parse(record.capability);
  if (typeof record.available !== "boolean") fail("capability availability must be boolean");
  const blockerCode =
    record.blockerCode === null ? null : NamespacedCodeSchema.parse(record.blockerCode);
  if (record.available && blockerCode !== null) {
    fail("an available capability cannot have a blocker code");
  }
  if (!record.available && blockerCode === null) {
    fail("an unavailable capability must have a blocker code");
  }
  return {
    capability,
    available: record.available,
    blockerCode,
    summary: parseBoundedString(record.summary, "capability summary", 1_000),
  };
}

function parsePreflight(
  value: unknown,
  identity: Readonly<{
    adapterId: NamespacedCode;
    adapterVersion: string;
    provider: ExternalProviderV1;
  }>,
): AdapterPreflightReportV1 {
  const record = parseObject(value, "adapter preflight report");
  assertExactKeys(
    record,
    [
      "schemaVersion",
      "adapterId",
      "adapterVersion",
      "provider",
      "checkedAt",
      "credentialReference",
      "capabilities",
    ],
    "adapter preflight report",
  );
  if (record.schemaVersion !== 1) fail("adapter preflight schema version is unsupported");
  if (
    record.adapterId !== identity.adapterId ||
    record.adapterVersion !== identity.adapterVersion ||
    record.provider !== identity.provider
  ) {
    fail("adapter preflight identity does not match the registered adapter");
  }
  if (!Array.isArray(record.capabilities) || record.capabilities.length > 100) {
    fail("adapter capabilities must be a bounded array");
  }
  const capabilities = record.capabilities.map(parseCapability);
  if (new Set(capabilities.map((item) => item.capability)).size !== capabilities.length) {
    fail("adapter capabilities must be unique");
  }
  return {
    schemaVersion: 1,
    adapterId: identity.adapterId,
    adapterVersion: identity.adapterVersion,
    provider: identity.provider,
    checkedAt: IsoInstantSchema.parse(record.checkedAt),
    credentialReference: parseNullableCredentialReference(record.credentialReference),
    capabilities,
  };
}

function assertEffectForAdapter(
  input: EffectDispatchInput | EffectReconciliationInput,
  provider: ExternalProviderV1,
): ExternalEffectV1 {
  const effect = ExternalEffectV1Schema.parse(input.effect);
  if (effect.target.provider !== provider) fail("effect provider does not match its adapter");
  IsoInstantSchema.parse(input.deadline);
  if (!(input.signal instanceof AbortSignal)) fail("adapter signal is invalid");
  if (input.credentialReference !== null) parseCredentialReference(input.credentialReference);
  const claim = parseDispatchClaim(input.claim, effect);
  if (input.deadline > claim.lockedUntil) {
    fail("adapter deadline cannot extend beyond the active outbox claim");
  }
  if (typeof input.assertActive !== "function") fail("adapter assertActive callback is required");
  return effect;
}

function parseResource(value: unknown, effect: ExternalEffectV1): ExternalResourceV1 {
  const resource = ExternalResourceV1Schema.parse(value);
  if (resource.effectId !== effect.effectId) fail("external resource has the wrong effect ID");
  if (
    resource.target.provider !== effect.target.provider ||
    resource.target.resourceType !== effect.target.resourceType ||
    resource.target.resourceKey !== effect.target.resourceKey
  ) {
    fail("external resource target does not match the effect");
  }
  return resource;
}

function parseSendResult(value: unknown, effect: ExternalEffectV1): EffectSendResult {
  const record = parseObject(value, "adapter send result");
  switch (record.kind) {
    case "observed":
      assertExactKeys(
        record,
        ["kind", "correlationKey", "resource", "detail"],
        "observed send result",
      );
      return {
        kind: "observed",
        correlationKey: parseCorrelationKey(record.correlationKey, false) as string,
        resource: parseResource(record.resource, effect),
        detail: parseDetail(record.detail, "send detail"),
      };
    case "ambiguous":
      assertExactKeys(
        record,
        ["kind", "correlationKey", "reconcileAfter", "detail"],
        "ambiguous send result",
      );
      return {
        kind: "ambiguous",
        correlationKey: parseCorrelationKey(record.correlationKey, true),
        reconcileAfter: IsoInstantSchema.parse(record.reconcileAfter),
        detail: parseDetail(record.detail, "send detail"),
      };
    case "rejected":
      assertExactKeys(record, ["kind", "code", "retryable", "detail"], "rejected send result");
      if (typeof record.retryable !== "boolean") fail("send retryable must be boolean");
      return {
        kind: "rejected",
        code: NamespacedCodeSchema.parse(record.code),
        retryable: record.retryable,
        detail: parseDetail(record.detail, "send detail"),
      };
    default:
      fail("adapter send result has an unsupported kind");
  }
}

function parseReconciliationResult(
  value: unknown,
  effect: ExternalEffectV1,
): EffectReconciliationResult {
  const record = parseObject(value, "adapter reconciliation result");
  switch (record.kind) {
    case "observed":
      assertExactKeys(
        record,
        ["kind", "correlationKey", "resource", "detail"],
        "observed reconciliation result",
      );
      return {
        kind: "observed",
        correlationKey: parseCorrelationKey(record.correlationKey, false) as string,
        resource: parseResource(record.resource, effect),
        detail: parseDetail(record.detail, "reconciliation detail"),
      };
    case "not-found":
    case "ambiguous":
      assertExactKeys(
        record,
        ["kind", "correlationKey", "reconcileAfter", "detail"],
        `${record.kind} reconciliation result`,
      );
      return {
        kind: record.kind,
        correlationKey: parseCorrelationKey(record.correlationKey, true),
        reconcileAfter: IsoInstantSchema.parse(record.reconcileAfter),
        detail: parseDetail(record.detail, "reconciliation detail"),
      };
    case "manual-intervention":
      assertExactKeys(
        record,
        ["kind", "code", "detail"],
        "manual-intervention reconciliation result",
      );
      return {
        kind: "manual-intervention",
        code: NamespacedCodeSchema.parse(record.code),
        detail: parseDetail(record.detail, "reconciliation detail"),
      };
    default:
      fail("adapter reconciliation result has an unsupported kind");
  }
}

/**
 * Turns an untrusted provider implementation into the only callable adapter
 * surface. The wrapper validates both directions and copies all byte buffers.
 */
export function validateExternalProviderAdapter(
  adapter: ExternalProviderAdapter,
): ValidatedExternalProviderAdapter {
  const adapterId = NamespacedCodeSchema.parse(adapter.adapterId);
  const adapterVersion = parseIdentifier(adapter.adapterVersion, "adapter version");
  const provider = ExternalProviderV1Schema.parse(adapter.provider);
  const identity = { adapterId, adapterVersion, provider } as const;
  return {
    ...identity,
    async preflight(signal) {
      if (!(signal instanceof AbortSignal)) fail("adapter signal is invalid");
      return parsePreflight(await adapter.preflight(signal), identity);
    },
    async send(input) {
      const effect = assertEffectForAdapter(input, provider);
      if (effect.state !== "sent") fail("only a durably sent effect may reach its adapter");
      if (sha256Bytes(input.payload) !== effect.payloadDigest) {
        fail("effect payload bytes do not match the persisted payload digest");
      }
      await input.assertActive();
      if (input.signal.aborted) fail("effect dispatch was aborted before provider invocation");
      const safeInput = {
        ...input,
        claim: parseDispatchClaim(input.claim, effect),
        payload: Uint8Array.from(input.payload),
        effect,
      };
      return parseSendResult(await adapter.send(safeInput), effect);
    },
    async reconcile(input) {
      const effect = assertEffectForAdapter(input, provider);
      if (effect.state !== "sent" && effect.state !== "unknown" && effect.state !== "observed") {
        fail("only sent, unknown, or observed effects may be reconciled");
      }
      await input.assertActive();
      if (input.signal.aborted)
        fail("effect reconciliation was aborted before provider invocation");
      return parseReconciliationResult(
        await adapter.reconcile({
          ...input,
          claim: parseDispatchClaim(input.claim, effect),
          effect,
        }),
        effect,
      );
    },
  };
}

export class AdapterRegistry {
  readonly #byProvider = new Map<ExternalProviderV1, ValidatedExternalProviderAdapter>();

  public register(adapter: ExternalProviderAdapter): ValidatedExternalProviderAdapter {
    const validated = validateExternalProviderAdapter(adapter);
    if (this.#byProvider.has(validated.provider)) {
      fail(`an adapter is already registered for provider ${validated.provider}`);
    }
    this.#byProvider.set(validated.provider, validated);
    return validated;
  }

  public require(providerInput: unknown): ValidatedExternalProviderAdapter {
    const provider = ExternalProviderV1Schema.parse(providerInput);
    const adapter = this.#byProvider.get(provider);
    if (adapter === undefined) fail(`no adapter is registered for provider ${provider}`);
    return adapter;
  }

  public list(): readonly ValidatedExternalProviderAdapter[] {
    return [...this.#byProvider.values()].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }
}
