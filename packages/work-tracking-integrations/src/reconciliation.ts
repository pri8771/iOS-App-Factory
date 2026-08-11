import { digestCanonical } from "./canonical.js";
import type { CorrelationRuleV1, ProvisionOperationV1 } from "./plan.js";
import {
  array,
  assertSignal,
  enumeration,
  exact,
  fail,
  identifier,
  isoInstant,
  nullableUrl,
  operationMarker,
  record,
  text,
} from "./validation.js";
import type { Provider } from "./preflight.js";

export type DispatchKnowledge =
  "not-attempted" | "definitive-no-mutation" | "ambiguous-timeout" | "ambiguous-transport";

export type ProviderResourceObservationV1 = Readonly<{
  schemaVersion: 1;
  provider: Provider;
  resourceType: string;
  providerResourceId: string;
  providerUrl: string | null;
  providerRevision: string;
  operationMarker: string;
  containerKey: string;
  logicalKey: string;
  observedAt: string;
}>;

export type CorrelationQueryV1 = Readonly<{
  schemaVersion: 1;
  provider: Provider;
  marker: string;
  resourceType: string;
  containerKey: string;
  logicalKey: string;
}>;

/** The only provider port in this package is read-only by construction. */
export type ReadOnlyCorrelationPort = Readonly<{
  findByCorrelation(query: CorrelationQueryV1, signal: AbortSignal): Promise<unknown>;
}>;

export type ReconciliationDecisionV1 =
  | Readonly<{
      schemaVersion: 1;
      kind: "observed";
      code: null;
      safeToDispatch: false;
      observation: ProviderResourceObservationV1;
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: "not-found";
      code: "reconcile.not-found-before-send" | "reconcile.not-found-definitive-no-mutation";
      safeToDispatch: true;
      observation: null;
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: "pending";
      code:
        "reconcile.ambiguous-timeout" | "reconcile.ambiguous-transport" | "reconcile.read-failed";
      safeToDispatch: false;
      observation: null;
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: "manual-intervention";
      code:
        "reconcile.duplicate-marker" | "reconcile.marker-collision" | "reconcile.invalid-response";
      safeToDispatch: false;
      observation: null;
    }>;

function parseObservation(value: unknown): ProviderResourceObservationV1 {
  const source = record(value, "provider resource observation");
  exact(
    source,
    [
      "schemaVersion",
      "provider",
      "resourceType",
      "providerResourceId",
      "providerUrl",
      "providerRevision",
      "operationMarker",
      "containerKey",
      "logicalKey",
      "observedAt",
    ],
    "provider resource observation",
  );
  if (source.schemaVersion !== 1) fail("provider observation schema is unsupported");
  return {
    schemaVersion: 1,
    provider: enumeration(source.provider, ["jira", "github"] as const, "observation provider"),
    resourceType: identifier(source.resourceType, "provider resource type", 160),
    providerResourceId: text(source.providerResourceId, "provider resource ID", 1_000),
    providerUrl: nullableUrl(source.providerUrl, "provider resource URL"),
    providerRevision: text(source.providerRevision, "provider resource revision", 500),
    operationMarker: operationMarker(source.operationMarker),
    containerKey: text(source.containerKey, "provider resource container key", 500),
    logicalKey: text(source.logicalKey, "provider resource logical key", 500),
    observedAt: isoInstant(source.observedAt, "provider resource observation time"),
  };
}

function assertOperation(operation: ProvisionOperationV1): CorrelationRuleV1 {
  const source = record(operation, "provision operation");
  const correlation = record(source.correlation, "operation correlation rule");
  exact(
    correlation,
    [
      "schemaVersion",
      "provider",
      "marker",
      "resourceType",
      "containerKey",
      "logicalKey",
      "markerLocation",
    ],
    "operation correlation rule",
  );
  if (
    correlation.schemaVersion !== 1 ||
    (correlation.markerLocation !== "jira-entity-property" &&
      correlation.markerLocation !== "github-resource-metadata")
  ) {
    fail("operation correlation rule is unsupported");
  }
  const provider = enumeration(
    correlation.provider,
    ["jira", "github"] as const,
    "correlation provider",
  );
  const marker = operationMarker(correlation.marker);
  const resourceType = enumeration(
    correlation.resourceType,
    [
      "jira.project",
      "github.repository",
      "jira.issue",
      "jira.issue-link",
      "jira.remote-link",
    ] as const,
    "correlation resource type",
  );
  if (source.provider !== provider || source.operationMarker !== marker) {
    fail("provision operation and correlation rule do not match");
  }
  if (
    (provider === "jira" && correlation.markerLocation !== "jira-entity-property") ||
    (provider === "github" && correlation.markerLocation !== "github-resource-metadata")
  ) {
    fail("correlation marker location does not match its provider");
  }
  return {
    schemaVersion: 1,
    provider,
    marker,
    resourceType,
    containerKey: text(correlation.containerKey, "correlation container key", 500),
    logicalKey: text(correlation.logicalKey, "correlation logical key", 500),
    markerLocation: correlation.markerLocation,
  };
}

function resolve(
  rule: CorrelationRuleV1,
  values: readonly unknown[],
  dispatchKnowledge: DispatchKnowledge,
): ReconciliationDecisionV1 {
  let observations: ProviderResourceObservationV1[];
  try {
    observations = values.map(parseObservation);
  } catch {
    return {
      schemaVersion: 1,
      kind: "manual-intervention",
      code: "reconcile.invalid-response",
      safeToDispatch: false,
      observation: null,
    };
  }
  const markerMatches = observations.filter(
    (observation) => observation.operationMarker === rule.marker,
  );
  if (
    markerMatches.some(
      (observation) =>
        observation.provider !== rule.provider ||
        observation.resourceType !== rule.resourceType ||
        observation.containerKey !== rule.containerKey ||
        observation.logicalKey !== rule.logicalKey,
    )
  ) {
    return {
      schemaVersion: 1,
      kind: "manual-intervention",
      code: "reconcile.marker-collision",
      safeToDispatch: false,
      observation: null,
    };
  }
  const exactMatches = markerMatches.filter(
    (observation) =>
      observation.containerKey === rule.containerKey && observation.logicalKey === rule.logicalKey,
  );
  const byResource = new Map<string, ProviderResourceObservationV1>();
  for (const observation of exactMatches) {
    const existing = byResource.get(observation.providerResourceId);
    if (existing !== undefined && digestCanonical(existing) !== digestCanonical(observation)) {
      return {
        schemaVersion: 1,
        kind: "manual-intervention",
        code: "reconcile.duplicate-marker",
        safeToDispatch: false,
        observation: null,
      };
    }
    byResource.set(observation.providerResourceId, observation);
  }
  if (byResource.size > 1) {
    return {
      schemaVersion: 1,
      kind: "manual-intervention",
      code: "reconcile.duplicate-marker",
      safeToDispatch: false,
      observation: null,
    };
  }
  const observed = [...byResource.values()][0];
  if (observed !== undefined) {
    return {
      schemaVersion: 1,
      kind: "observed",
      code: null,
      safeToDispatch: false,
      observation: observed,
    };
  }
  if (dispatchKnowledge === "not-attempted") {
    return {
      schemaVersion: 1,
      kind: "not-found",
      code: "reconcile.not-found-before-send",
      safeToDispatch: true,
      observation: null,
    };
  }
  if (dispatchKnowledge === "definitive-no-mutation") {
    return {
      schemaVersion: 1,
      kind: "not-found",
      code: "reconcile.not-found-definitive-no-mutation",
      safeToDispatch: true,
      observation: null,
    };
  }
  return {
    schemaVersion: 1,
    kind: "pending",
    code:
      dispatchKnowledge === "ambiguous-timeout"
        ? "reconcile.ambiguous-timeout"
        : "reconcile.ambiguous-transport",
    safeToDispatch: false,
    observation: null,
  };
}

export async function reconcileProvisionOperation(
  input: Readonly<{
    operation: ProvisionOperationV1;
    dispatchKnowledge: DispatchKnowledge;
    port: ReadOnlyCorrelationPort;
    signal: AbortSignal;
  }>,
): Promise<ReconciliationDecisionV1> {
  assertSignal(input.signal);
  const rule = assertOperation(input.operation);
  const query: CorrelationQueryV1 = {
    schemaVersion: 1,
    provider: rule.provider,
    marker: rule.marker,
    resourceType: rule.resourceType,
    containerKey: rule.containerKey,
    logicalKey: rule.logicalKey,
  };
  let response: unknown;
  try {
    response = await input.port.findByCorrelation(query, input.signal);
  } catch {
    return {
      schemaVersion: 1,
      kind: "pending",
      code: "reconcile.read-failed",
      safeToDispatch: false,
      observation: null,
    };
  }
  let values: readonly unknown[];
  try {
    values = array(response, "provider correlation observations", 100);
  } catch {
    return {
      schemaVersion: 1,
      kind: "manual-intervention",
      code: "reconcile.invalid-response",
      safeToDispatch: false,
      observation: null,
    };
  }
  return resolve(rule, values, input.dispatchKnowledge);
}
