const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9]{1,9}$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MARKER = /^app-factory:v1:(?:jira|github):[a-z0-9][a-z0-9:._-]+$/;
const URL_SCHEMES = new Set(["https:"]);

export class IntegrationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IntegrationContractError";
  }
}

export function fail(message: string): never {
  throw new IntegrationContractError(message);
}

export function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function exact(
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

export function text(value: unknown, label: string, maximum = 500): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\0\r]/.test(value)
  ) {
    fail(`${label} must be a non-empty, trimmed string of at most ${String(maximum)} characters`);
  }
  return value;
}

export function optionalText(value: unknown, label: string, maximum = 10_000): string | null {
  if (value === null) return null;
  return text(value, label, maximum);
}

export function identifier(value: unknown, label: string, maximum = 160): string {
  const parsed = text(value, label, maximum);
  if (!IDENTIFIER.test(parsed)) fail(`${label} is not a portable identifier`);
  return parsed;
}

export function slug(value: unknown, label: string, maximum = 80): string {
  const parsed = text(value, label, maximum);
  if (!SLUG.test(parsed)) fail(`${label} is not a lowercase slug`);
  return parsed;
}

export function projectKey(value: unknown, label = "Jira project key"): string {
  const parsed = text(value, label, 10);
  if (!PROJECT_KEY.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

export function issueKey(value: unknown, label = "Jira issue key"): string {
  const parsed = text(value, label, 32);
  if (!ISSUE_KEY.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

export function uuid(value: unknown, label: string): string {
  const parsed = text(value, label, 36).toLowerCase();
  if (!UUID.test(parsed)) fail(`${label} must be a UUID`);
  return parsed;
}

export function isoInstant(value: unknown, label: string): string {
  const parsed = text(value, label, 30);
  if (!ISO_INSTANT.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    fail(`${label} must be an ISO UTC instant`);
  }
  return new Date(parsed).toISOString();
}

export function gitSha(value: unknown, label: string): string {
  const parsed = text(value, label, 64);
  if (!SHA.test(parsed)) fail(`${label} must be a lowercase Git object ID`);
  return parsed;
}

export function gitRef(value: unknown, label: string): string {
  const parsed = text(value, label, 255);
  const components = parsed.split("/");
  if (
    parsed.startsWith("/") ||
    parsed.endsWith("/") ||
    parsed.endsWith(".") ||
    parsed === "@" ||
    parsed.includes("..") ||
    parsed.includes("@{") ||
    parsed.includes("//") ||
    [...parsed].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || code === 127 || "~^:?*\\[".includes(character);
    }) ||
    components.some((component) => component.startsWith(".") || component.endsWith(".lock"))
  ) {
    fail(`${label} is not a valid Git ref name`);
  }
  return parsed;
}

export function sha256Digest(value: unknown, label: string): `sha256:${string}` {
  const parsed = text(value, label, 71);
  if (!DIGEST.test(parsed)) fail(`${label} must be a SHA-256 digest`);
  return parsed as `sha256:${string}`;
}

export function operationMarker(value: unknown, label = "operation marker"): string {
  const parsed = text(value, label, 500);
  if (!MARKER.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

export function safeInteger(value: unknown, label: string, minimum = 0, maximum = 1e9): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`${label} must be a safe integer from ${String(minimum)} to ${String(maximum)}`);
  }
  return value as number;
}

export function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

export function enumeration<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${label} is unsupported`);
  }
  return value as T[number];
}

export function array(
  value: unknown,
  label: string,
  maximum: number,
  minimum = 0,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${label} must contain ${String(minimum)} to ${String(maximum)} items`);
  }
  return value;
}

export function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

export function url(value: unknown, label: string): string {
  const parsed = text(value, label, 4_000);
  let result: URL;
  try {
    result = new URL(parsed);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (!URL_SCHEMES.has(result.protocol) || result.username !== "" || result.password !== "") {
    fail(`${label} must be an HTTPS URL without embedded credentials`);
  }
  return result.toString();
}

export function nullableUrl(value: unknown, label: string): string | null {
  return value === null ? null : url(value, label);
}

export function assertSignal(value: unknown): asserts value is AbortSignal {
  if (!(value instanceof AbortSignal)) fail("read port signal is invalid");
}
