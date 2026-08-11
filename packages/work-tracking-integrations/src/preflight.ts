import {
  array,
  enumeration,
  exact,
  fail,
  identifier,
  isoInstant,
  record,
  text,
  unique,
} from "./validation.js";

export const JiraCapabilities = [
  "jira.project.read",
  "jira.project.create",
  "jira.issue.read",
  "jira.issue.create",
  "jira.issue.link",
  "jira.remote-link.create",
] as const;

export const GitHubCapabilities = [
  "github.repository.read",
  "github.repository.create",
  "github.branch.read",
  "github.pull-request.read",
  "github.checks.read",
  "github.merge.read",
] as const;

export type JiraCapability = (typeof JiraCapabilities)[number];
export type GitHubCapability = (typeof GitHubCapabilities)[number];
export type WorkTrackingCapability = JiraCapability | GitHubCapability;
export type Provider = "jira" | "github";

export type CredentialReferenceV1 = Readonly<{
  schemaVersion: 1;
  kind: "macos-keychain";
  service: string;
  account: string;
}>;

export type RawCapabilityStateV1 = Readonly<{
  capability: WorkTrackingCapability;
  state: "available" | "unavailable" | "unknown";
  reasonCode: string | null;
  detail: string;
}>;

export type ProviderPreflightSnapshotV1 = Readonly<{
  schemaVersion: 1;
  provider: Provider;
  adapterId: string;
  adapterVersion: string;
  checkedAt: string;
  credentialReference: CredentialReferenceV1 | null;
  capabilities: readonly RawCapabilityStateV1[];
}>;

export type RequiredCapabilityV1 = Readonly<{
  provider: Provider;
  capability: WorkTrackingCapability;
}>;

export type NormalizedCapabilityV1 = Readonly<{
  provider: Provider;
  capability: WorkTrackingCapability;
  available: boolean;
  blockerCode: string | null;
  detail: string;
  checkedAt: string | null;
}>;

export type NormalizedPreflightV1 = Readonly<{
  schemaVersion: 1;
  ready: boolean;
  capabilities: readonly NormalizedCapabilityV1[];
}>;

export function parseCredentialReference(value: unknown): CredentialReferenceV1 {
  const source = record(value, "credential reference");
  exact(source, ["schemaVersion", "kind", "service", "account"], "credential reference");
  if (source.schemaVersion !== 1 || source.kind !== "macos-keychain") {
    fail("credential reference uses an unsupported contract");
  }
  const service = text(source.service, "credential reference service", 200);
  const account = text(source.account, "credential reference account", 200);
  if (service.includes("\n") || account.includes("\n")) {
    fail("credential references cannot contain line breaks");
  }
  return {
    schemaVersion: 1,
    kind: "macos-keychain",
    service,
    account,
  };
}

function capabilityForProvider(value: unknown, provider: Provider): WorkTrackingCapability {
  if (provider === "jira") return enumeration(value, JiraCapabilities, "Jira capability");
  return enumeration(value, GitHubCapabilities, "GitHub capability");
}

function parseCapability(value: unknown, provider: Provider): RawCapabilityStateV1 {
  const source = record(value, "provider capability");
  exact(source, ["capability", "state", "reasonCode", "detail"], "provider capability");
  const state = enumeration(
    source.state,
    ["available", "unavailable", "unknown"] as const,
    "capability state",
  );
  const reasonCode =
    source.reasonCode === null
      ? null
      : identifier(source.reasonCode, "capability reason code", 160);
  if (state === "available" && reasonCode !== null) {
    fail("an available capability cannot include a blocker reason");
  }
  if (state !== "available" && reasonCode === null) {
    fail("an unavailable or unknown capability requires a blocker reason");
  }
  return {
    capability: capabilityForProvider(source.capability, provider),
    state,
    reasonCode,
    detail: text(source.detail, "capability detail", 1_000),
  };
}

export function parseProviderPreflightSnapshot(value: unknown): ProviderPreflightSnapshotV1 {
  const source = record(value, "provider preflight snapshot");
  exact(
    source,
    [
      "schemaVersion",
      "provider",
      "adapterId",
      "adapterVersion",
      "checkedAt",
      "credentialReference",
      "capabilities",
    ],
    "provider preflight snapshot",
  );
  if (source.schemaVersion !== 1) fail("preflight schema version is unsupported");
  const provider = enumeration(source.provider, ["jira", "github"] as const, "provider");
  const capabilities = array(source.capabilities, "provider capabilities", 40).map((item) =>
    parseCapability(item, provider),
  );
  unique(
    capabilities.map((item) => item.capability),
    "provider capabilities",
  );
  return {
    schemaVersion: 1,
    provider,
    adapterId: identifier(source.adapterId, "adapter ID", 160),
    adapterVersion: text(source.adapterVersion, "adapter version", 80),
    checkedAt: isoInstant(source.checkedAt, "preflight check time"),
    credentialReference:
      source.credentialReference === null
        ? null
        : parseCredentialReference(source.credentialReference),
    capabilities,
  };
}

function parseRequiredCapability(value: unknown): RequiredCapabilityV1 {
  const source = record(value, "required capability");
  exact(source, ["provider", "capability"], "required capability");
  const provider = enumeration(source.provider, ["jira", "github"] as const, "provider");
  return { provider, capability: capabilityForProvider(source.capability, provider) };
}

/**
 * Produces a fail-closed, order-independent capability matrix. Missing provider
 * snapshots and unreported capabilities are explicit blockers.
 */
export function normalizeCapabilityPreflight(
  snapshotsInput: unknown,
  requiredInput: unknown,
): NormalizedPreflightV1 {
  const snapshots = array(snapshotsInput, "preflight snapshots", 2).map(
    parseProviderPreflightSnapshot,
  );
  unique(
    snapshots.map((item) => item.provider),
    "preflight snapshot providers",
  );
  const required = array(requiredInput, "required capabilities", 40, 1).map(
    parseRequiredCapability,
  );
  unique(
    required.map((item) => `${item.provider}:${item.capability}`),
    "required capabilities",
  );
  const byProvider = new Map(snapshots.map((snapshot) => [snapshot.provider, snapshot]));
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const capabilities = required
    .map((requirement): NormalizedCapabilityV1 => {
      const snapshot = byProvider.get(requirement.provider);
      if (snapshot === undefined) {
        return {
          ...requirement,
          available: false,
          blockerCode: "preflight.provider-missing",
          detail: `No ${requirement.provider} preflight snapshot was supplied.`,
          checkedAt: null,
        };
      }
      const observed = snapshot.capabilities.find(
        (item) => item.capability === requirement.capability,
      );
      if (observed === undefined) {
        return {
          ...requirement,
          available: false,
          blockerCode: "preflight.capability-unreported",
          detail: `${requirement.capability} was not reported by ${snapshot.adapterId}.`,
          checkedAt: snapshot.checkedAt,
        };
      }
      return {
        ...requirement,
        available: observed.state === "available",
        blockerCode: observed.state === "available" ? null : observed.reasonCode,
        detail: observed.detail,
        checkedAt: snapshot.checkedAt,
      };
    })
    .sort((left, right) =>
      compare(`${left.provider}:${left.capability}`, `${right.provider}:${right.capability}`),
    );
  return {
    schemaVersion: 1,
    ready: capabilities.every((item) => item.available),
    capabilities,
  };
}

export function requiredCapabilitiesForProvisioning(): readonly RequiredCapabilityV1[] {
  return [
    { provider: "github", capability: "github.repository.create" },
    { provider: "github", capability: "github.repository.read" },
    { provider: "jira", capability: "jira.issue.create" },
    { provider: "jira", capability: "jira.issue.link" },
    { provider: "jira", capability: "jira.project.create" },
    { provider: "jira", capability: "jira.remote-link.create" },
  ];
}

export function requiredCapabilitiesForObservation(): readonly RequiredCapabilityV1[] {
  return [
    { provider: "github", capability: "github.branch.read" },
    { provider: "github", capability: "github.checks.read" },
    { provider: "github", capability: "github.merge.read" },
    { provider: "github", capability: "github.pull-request.read" },
    { provider: "github", capability: "github.repository.read" },
    { provider: "jira", capability: "jira.issue.read" },
    { provider: "jira", capability: "jira.project.read" },
  ];
}
