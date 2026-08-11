import { createHash } from "node:crypto";

import {
  ExternalProviderV1Schema,
  LifecycleEventV1Schema,
  ModuleManifestV1Schema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  StableKeySchema,
  type ExternalProviderV1,
  type LifecycleEventV1,
  type ModuleManifestV1,
  type NamespacedCode,
  type Sha256Digest,
  type StableKey,
} from "@app-factory/contracts";

const SECRET_KEY_PATTERN = /(?:^|[_-])(?:auth|credential|password|secret|token)(?:$|[_-])/i;

export class ModuleContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ModuleContractError";
  }
}

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>;

export type ModuleEffectIntent = Readonly<{
  provider: ExternalProviderV1;
  action: NamespacedCode;
  resourceType: NamespacedCode;
  resourceKey: string;
  payload: JsonValue;
  requiresApproval: true;
}>;

export type PlannedModuleEffect = ModuleEffectIntent &
  Readonly<{
    payloadDigest: Sha256Digest;
    operationMarker: string;
  }>;

export type ModuleEventResult = Readonly<{
  summary: string;
  effects: readonly ModuleEffectIntent[];
}>;

export type ModuleCommandResult = Readonly<{
  summary: string;
  output: JsonValue;
  effects: readonly ModuleEffectIntent[];
}>;

export type ModuleQualityGateResult = Readonly<{
  status: "passed" | "failed" | "blocked";
  summary: string;
  evidenceDigests: readonly Sha256Digest[];
}>;

export type ModuleExecutionContext = Readonly<{
  moduleId: NamespacedCode;
  moduleVersion: string;
  config: JsonValue;
}>;

export type FactoryModule = Readonly<{
  manifest: unknown;
  parseConfig(value: unknown): JsonValue;
  commands: Readonly<
    Record<string, (input: JsonValue, context: ModuleExecutionContext) => Promise<unknown>>
  >;
  eventConsumers: Readonly<
    Record<string, (event: LifecycleEventV1, context: ModuleExecutionContext) => Promise<unknown>>
  >;
  qualityGates: Readonly<
    Record<string, (input: JsonValue, context: ModuleExecutionContext) => Promise<unknown>>
  >;
}>;

export type RegisteredModule = Readonly<{
  manifest: ModuleManifestV1;
  config: JsonValue;
  executeCommand(command: unknown, input: unknown): Promise<ValidatedModuleCommandResult>;
  consumeEvent(event: unknown): Promise<ValidatedModuleEventResult>;
  runQualityGate(gate: unknown, input: unknown): Promise<ValidatedModuleQualityGateResult>;
}>;

export type ValidatedModuleEventResult = Readonly<{
  moduleId: NamespacedCode;
  moduleVersion: string;
  eventId: string;
  eventType: NamespacedCode;
  effects: readonly PlannedModuleEffect[];
  summary: string;
  resultDigest: Sha256Digest;
}>;

export type ValidatedModuleCommandResult = Readonly<{
  moduleId: NamespacedCode;
  command: NamespacedCode;
  summary: string;
  output: JsonValue;
  effects: readonly PlannedModuleEffect[];
  resultDigest: Sha256Digest;
}>;

export type ValidatedModuleQualityGateResult = ModuleQualityGateResult &
  Readonly<{
    moduleId: NamespacedCode;
    gate: NamespacedCode;
    resultDigest: Sha256Digest;
  }>;

function fail(message: string): never {
  throw new ModuleContractError(message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: unknown, path = "config", seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${path} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object") fail(`${path} is not JSON-compatible`);
  if (seen.has(value)) fail(`${path} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 10_000) fail(`${path} exceeds the array limit`);
      return value.map((item, index) => parseJson(item, `${path}[${String(index)}]`, seen));
    }
    const output: Record<string, JsonValue> = {};
    const entries = Object.entries(value as Readonly<Record<string, unknown>>);
    if (entries.length > 10_000) fail(`${path} exceeds the property limit`);
    for (const [key, item] of entries) {
      if (key.length < 1 || key.length > 500 || key.includes("\0")) {
        fail(`${path} contains an invalid key`);
      }
      if (SECRET_KEY_PATTERN.test(key)) {
        fail(`${path}.${key} looks like a secret; modules may receive references only`);
      }
      output[key] = parseJson(item, `${path}.${key}`, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function canonicalJson(value: JsonValue): string {
  const normalize = (item: JsonValue): JsonValue => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function digestJson(value: JsonValue): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`,
  );
}

function boundedSummary(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_000) {
    fail("module result summary must be 1-2000 characters");
  }
  return value;
}

function parseEffect(value: unknown): ModuleEffectIntent {
  if (!isRecord(value)) fail("module effect must be an object");
  const expected = [
    "provider",
    "action",
    "resourceType",
    "resourceKey",
    "payload",
    "requiresApproval",
  ];
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== [...expected].sort()[index])
  ) {
    fail("module effect contains unexpected or missing fields");
  }
  if (value.requiresApproval !== true) fail("every module effect must require approval");
  if (
    typeof value.resourceKey !== "string" ||
    value.resourceKey.length < 1 ||
    value.resourceKey.length > 1_000 ||
    value.resourceKey.trim() !== value.resourceKey ||
    value.resourceKey.includes("\0")
  ) {
    fail("module effect resource key is invalid");
  }
  return {
    provider: ExternalProviderV1Schema.parse(value.provider),
    action: NamespacedCodeSchema.parse(value.action),
    resourceType: NamespacedCodeSchema.parse(value.resourceType),
    resourceKey: value.resourceKey,
    payload: parseJson(value.payload, "effect payload"),
    requiresApproval: true,
  };
}

function parseEffects(value: unknown): readonly ModuleEffectIntent[] {
  if (!Array.isArray(value) || value.length > 100) fail("module effects must be a bounded array");
  return value.map(parseEffect);
}

function stableEffect(
  manifest: ModuleManifestV1,
  operationSeed: string,
  intent: ModuleEffectIntent,
  ordinal: number,
): PlannedModuleEffect {
  const declared = manifest.externalEffects.some(
    (effect) => effect.provider === intent.provider && effect.action === intent.action,
  );
  if (!declared) fail(`module emitted undeclared effect ${intent.provider}/${intent.action}`);
  const payloadDigest = digestJson(intent.payload);
  const suffix = createHash("sha256")
    .update(
      [
        manifest.moduleId,
        manifest.moduleVersion,
        operationSeed,
        String(ordinal),
        intent.provider,
        intent.action,
        intent.resourceType,
        intent.resourceKey,
        payloadDigest,
      ].join("\0"),
    )
    .digest("hex");
  return {
    ...intent,
    payloadDigest,
    operationMarker: `app-factory:v1:module:${suffix}`,
  };
}

function parseEventResult(
  value: unknown,
  manifest: ModuleManifestV1,
  event: LifecycleEventV1,
): ValidatedModuleEventResult {
  if (!isRecord(value)) fail("module event result must be an object");
  const summary = boundedSummary(value.summary);
  const effects = parseEffects(value.effects).map((effect, index) =>
    stableEffect(manifest, event.eventId, effect, index),
  );
  const resultCore = parseJson({
    moduleId: manifest.moduleId,
    moduleVersion: manifest.moduleVersion,
    eventId: event.eventId,
    eventType: event.type,
    effects,
    summary,
  });
  return {
    moduleId: manifest.moduleId,
    moduleVersion: manifest.moduleVersion,
    eventId: event.eventId,
    eventType: event.type,
    effects,
    summary,
    resultDigest: digestJson(resultCore),
  };
}

function parseCommandResult(
  value: unknown,
  manifest: ModuleManifestV1,
  command: NamespacedCode,
): ValidatedModuleCommandResult {
  if (!isRecord(value)) fail("module command result must be an object");
  const summary = boundedSummary(value.summary);
  const output = parseJson(value.output, "command output");
  const effects = parseEffects(value.effects).map((effect, index) =>
    stableEffect(manifest, command, effect, index),
  );
  const core = parseJson({ moduleId: manifest.moduleId, command, summary, output, effects });
  return {
    moduleId: manifest.moduleId,
    command,
    summary,
    output,
    effects,
    resultDigest: digestJson(core),
  };
}

function parseQualityResult(
  value: unknown,
  manifest: ModuleManifestV1,
  gate: NamespacedCode,
): ValidatedModuleQualityGateResult {
  if (!isRecord(value)) fail("module quality result must be an object");
  if (value.status !== "passed" && value.status !== "failed" && value.status !== "blocked") {
    fail("module quality status is invalid");
  }
  const summary = boundedSummary(value.summary);
  if (!Array.isArray(value.evidenceDigests) || value.evidenceDigests.length > 1_000) {
    fail("quality evidence digests must be a bounded array");
  }
  const evidenceDigests = value.evidenceDigests.map((digest) => Sha256DigestSchema.parse(digest));
  if (new Set(evidenceDigests).size !== evidenceDigests.length) {
    fail("quality evidence digests must be unique");
  }
  const core = parseJson({
    moduleId: manifest.moduleId,
    gate,
    status: value.status,
    summary,
    evidenceDigests,
  });
  return {
    moduleId: manifest.moduleId,
    gate,
    status: value.status,
    summary,
    evidenceDigests,
    resultDigest: digestJson(core),
  };
}

function assertHandlerKeys(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    fail(`${label} handlers do not exactly match the module manifest`);
  }
}

export function registerFactoryModule(
  module: FactoryModule,
  configValue: unknown,
): RegisteredModule {
  const manifest = ModuleManifestV1Schema.parse(module.manifest);
  const config = parseJson(module.parseConfig(configValue));
  assertHandlerKeys("command", Object.keys(module.commands), manifest.commands);
  assertHandlerKeys("event", Object.keys(module.eventConsumers), manifest.consumesEvents);
  assertHandlerKeys("quality", Object.keys(module.qualityGates), manifest.qualityGates);
  const context: ModuleExecutionContext = {
    moduleId: manifest.moduleId,
    moduleVersion: manifest.moduleVersion,
    config,
  };
  return {
    manifest,
    config,
    async executeCommand(commandValue, inputValue) {
      const command = NamespacedCodeSchema.parse(commandValue);
      const handler = module.commands[command];
      if (handler === undefined) fail(`module does not handle command ${command}`);
      return parseCommandResult(
        await handler(parseJson(inputValue, "command input"), context),
        manifest,
        command,
      );
    },
    async consumeEvent(eventValue) {
      const event = LifecycleEventV1Schema.parse(eventValue);
      const handler = module.eventConsumers[event.type];
      if (handler === undefined) fail(`module does not consume event ${event.type}`);
      return parseEventResult(await handler(event, context), manifest, event);
    },
    async runQualityGate(gateValue, inputValue) {
      const gate = NamespacedCodeSchema.parse(gateValue);
      const handler = module.qualityGates[gate];
      if (handler === undefined) fail(`module does not implement quality gate ${gate}`);
      return parseQualityResult(
        await handler(parseJson(inputValue, "quality input"), context),
        manifest,
        gate,
      );
    },
  };
}

export class ModuleRegistry {
  readonly #byId = new Map<NamespacedCode, RegisteredModule>();
  readonly #commands = new Map<NamespacedCode, RegisteredModule>();
  readonly #panels = new Map<StableKey, RegisteredModule>();

  public register(module: FactoryModule, config: unknown): RegisteredModule {
    const registered = registerFactoryModule(module, config);
    if (this.#byId.has(registered.manifest.moduleId)) {
      fail(`module is already registered: ${registered.manifest.moduleId}`);
    }
    for (const command of registered.manifest.commands) {
      if (this.#commands.has(command)) fail(`module command collision: ${command}`);
    }
    for (const panel of registered.manifest.dashboardPanels) {
      if (this.#panels.has(panel)) fail(`dashboard panel collision: ${panel}`);
    }
    this.#byId.set(registered.manifest.moduleId, registered);
    for (const command of registered.manifest.commands) this.#commands.set(command, registered);
    for (const panel of registered.manifest.dashboardPanels) this.#panels.set(panel, registered);
    return registered;
  }

  public modulesConsuming(eventTypeValue: unknown): readonly RegisteredModule[] {
    const eventType = NamespacedCodeSchema.parse(eventTypeValue);
    return [...this.#byId.values()]
      .filter((module) => module.manifest.consumesEvents.includes(eventType))
      .sort((left, right) => left.manifest.moduleId.localeCompare(right.manifest.moduleId));
  }

  public moduleForCommand(commandValue: unknown): RegisteredModule {
    const command = NamespacedCodeSchema.parse(commandValue);
    const module = this.#commands.get(command);
    if (module === undefined) fail(`no module handles command ${command}`);
    return module;
  }

  public list(): readonly RegisteredModule[] {
    return [...this.#byId.values()].sort((left, right) =>
      left.manifest.moduleId.localeCompare(right.manifest.moduleId),
    );
  }
}

export function dashboardPanelKey(value: unknown): StableKey {
  return StableKeySchema.parse(value);
}
