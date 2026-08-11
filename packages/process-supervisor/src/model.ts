export const SUPERVISOR_IDENTITY_SCHEMA_VERSION = 1 as const;
export const SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2 = 2 as const;

export type SupervisorProcessWitnessV1 = Readonly<{
  pid: number;
  processStartIdentity: string;
  processGroupId: number;
}>;

type SupervisorIdentityBase = Readonly<{
  attemptId: string;
  fence: number;
  pid: number;
  processStartIdentity: string;
  bootIdentity: string;
  processGroupId: number;
  launchedAt: string;
}>;

/** Legacy identity records remain readable and exact. They cannot authorize a leaderless group. */
export type SupervisorIdentityV1 = SupervisorIdentityBase &
  Readonly<{ schemaVersion: typeof SUPERVISOR_IDENTITY_SCHEMA_VERSION }>;

/** V2 adds the optional process identity that may witness a leaderless process group. */
export type SupervisorIdentityV2 = SupervisorIdentityBase &
  Readonly<{
    schemaVersion: typeof SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2;
    primaryChild: SupervisorProcessWitnessV1 | null;
  }>;

export type SupervisorIdentity = SupervisorIdentityV1 | SupervisorIdentityV2;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V1_IDENTITY_KEYS = [
  "attemptId",
  "bootIdentity",
  "fence",
  "launchedAt",
  "pid",
  "processGroupId",
  "processStartIdentity",
  "schemaVersion",
] as const;
const V2_IDENTITY_KEYS = [...V1_IDENTITY_KEYS, "primaryChild"] as const;
const WITNESS_KEYS = ["pid", "processGroupId", "processStartIdentity"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function assertBoundedIdentity(value: unknown, name: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.trim() !== value ||
    value.includes("\0") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new TypeError(`${name} must be a non-empty, bounded single-line string`);
  }
}

function assertProcessId(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 2) {
    throw new TypeError(`${name} must be a safe process identifier greater than one`);
  }
}

function parseBase(value: Record<string, unknown>): SupervisorIdentityBase {
  if (typeof value.attemptId !== "string" || !UUID_PATTERN.test(value.attemptId)) {
    throw new TypeError("attemptId must be a lowercase canonical UUID");
  }
  if (!Number.isSafeInteger(value.fence) || (value.fence as number) < 0) {
    throw new TypeError("fence must be a non-negative safe integer");
  }
  assertProcessId(value.pid, "pid");
  assertProcessId(value.processGroupId, "processGroupId");
  assertBoundedIdentity(value.processStartIdentity, "processStartIdentity");
  assertBoundedIdentity(value.bootIdentity, "bootIdentity");
  if (
    typeof value.launchedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.launchedAt) ||
    Number.isNaN(Date.parse(value.launchedAt))
  ) {
    throw new TypeError("launchedAt must be a canonical UTC timestamp");
  }
  return {
    attemptId: value.attemptId,
    fence: value.fence as number,
    pid: value.pid,
    processStartIdentity: value.processStartIdentity,
    bootIdentity: value.bootIdentity,
    processGroupId: value.processGroupId,
    launchedAt: value.launchedAt,
  };
}

function parseWitness(
  value: unknown,
  supervisorPid: number,
  processGroupId: number,
): SupervisorProcessWitnessV1 | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new TypeError("primaryChild must be an object or null");
  assertExactKeys(value, WITNESS_KEYS, "Supervisor primary-child witness");
  assertProcessId(value.pid, "primaryChild.pid");
  assertProcessId(value.processGroupId, "primaryChild.processGroupId");
  assertBoundedIdentity(value.processStartIdentity, "primaryChild.processStartIdentity");
  if (value.pid === supervisorPid) {
    throw new TypeError("primaryChild.pid must differ from the supervisor PID");
  }
  if (value.processGroupId !== processGroupId) {
    throw new TypeError("primaryChild must belong to the supervisor process group");
  }
  return {
    pid: value.pid,
    processStartIdentity: value.processStartIdentity,
    processGroupId: value.processGroupId,
  };
}

export function parseSupervisorIdentityV1(value: unknown): SupervisorIdentityV1 {
  if (!isRecord(value)) throw new TypeError("Supervisor identity must be an object");
  assertExactKeys(value, V1_IDENTITY_KEYS, "Supervisor V1 identity");
  if (value.schemaVersion !== SUPERVISOR_IDENTITY_SCHEMA_VERSION) {
    throw new TypeError("Unsupported supervisor V1 identity schema version");
  }
  return { schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION, ...parseBase(value) };
}

export function parseSupervisorIdentityV2(value: unknown): SupervisorIdentityV2 {
  if (!isRecord(value)) throw new TypeError("Supervisor identity must be an object");
  assertExactKeys(value, V2_IDENTITY_KEYS, "Supervisor V2 identity");
  if (value.schemaVersion !== SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2) {
    throw new TypeError("Unsupported supervisor V2 identity schema version");
  }
  const base = parseBase(value);
  return {
    schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
    ...base,
    primaryChild: parseWitness(value.primaryChild, base.pid, base.processGroupId),
  };
}

export function parseSupervisorIdentity(value: unknown): SupervisorIdentity {
  if (!isRecord(value)) throw new TypeError("Supervisor identity must be an object");
  if (value.schemaVersion === SUPERVISOR_IDENTITY_SCHEMA_VERSION) {
    return parseSupervisorIdentityV1(value);
  }
  if (value.schemaVersion === SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2) {
    return parseSupervisorIdentityV2(value);
  }
  throw new TypeError("Unsupported supervisor identity schema version");
}

export function withSupervisorPrimaryChild(
  identity: SupervisorIdentity,
  witness: SupervisorProcessWitnessV1,
): SupervisorIdentityV2 {
  const validated = parseSupervisorIdentity(identity);
  return parseSupervisorIdentityV2({
    ...validated,
    schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
    primaryChild: {
      pid: witness.pid,
      processStartIdentity: witness.processStartIdentity,
      processGroupId: witness.processGroupId,
    },
  });
}
