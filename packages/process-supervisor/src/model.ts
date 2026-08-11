export const SUPERVISOR_IDENTITY_SCHEMA_VERSION = 1 as const;

export type SupervisorIdentityV1 = Readonly<{
  schemaVersion: typeof SUPERVISOR_IDENTITY_SCHEMA_VERSION;
  attemptId: string;
  fence: number;
  pid: number;
  processStartIdentity: string;
  bootIdentity: string;
  processGroupId: number;
  launchedAt: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDENTITY_KEYS = [
  "attemptId",
  "bootIdentity",
  "fence",
  "launchedAt",
  "pid",
  "processGroupId",
  "processStartIdentity",
  "schemaVersion",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>): void {
  const actual = Object.keys(value).sort();
  const expected = [...IDENTITY_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Supervisor identity has unknown or missing fields");
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

export function parseSupervisorIdentityV1(value: unknown): SupervisorIdentityV1 {
  if (!isRecord(value)) {
    throw new TypeError("Supervisor identity must be an object");
  }
  assertExactKeys(value);

  if (value.schemaVersion !== SUPERVISOR_IDENTITY_SCHEMA_VERSION) {
    throw new TypeError("Unsupported supervisor identity schema version");
  }
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
    schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION,
    attemptId: value.attemptId,
    fence: value.fence as number,
    pid: value.pid,
    processStartIdentity: value.processStartIdentity,
    bootIdentity: value.bootIdentity,
    processGroupId: value.processGroupId,
    launchedAt: value.launchedAt,
  };
}
