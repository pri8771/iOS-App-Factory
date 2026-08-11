import {
  canonicalJson,
  digestCanonical,
  type Sha256Digest as WorkTrackingDigest,
} from "@app-factory/work-tracking-integrations";
import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

export class ProviderResponseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export function fail(message: string): never {
  throw new ProviderResponseError(message);
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

export function exactOneOf(
  value: Readonly<Record<string, unknown>>,
  choices: readonly (readonly string[])[],
  label: string,
): void {
  const actual = Object.keys(value).sort().join("\0");
  if (!choices.some((keys) => [...keys].sort().join("\0") === actual)) {
    fail(`${label} contains unexpected or missing fields`);
  }
}

export function text(value: unknown, label: string, maximum = 1_000): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\0\r]/.test(value)
  ) {
    fail(`${label} must be a non-empty, trimmed string of at most ${String(maximum)} characters`);
  }
  return value;
}

export function nullableText(value: unknown, label: string, maximum = 1_000): string | null {
  return value === null ? null : text(value, label, maximum);
}

export function possiblyEmptyText(value: unknown, label: string, maximum = 1_000): string {
  if (typeof value !== "string" || value.length > maximum || /[\0\r]/.test(value)) {
    fail(`${label} must be a string of at most ${String(maximum)} characters`);
  }
  return value;
}

export function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

export function integer(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`${label} must be a safe integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return value as number;
}

export function enumeration<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) fail(`${label} is unsupported`);
  return value as T[number];
}

export function array(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} must be a bounded array`);
  return value;
}

export function safeUrl(value: unknown, label: string): string {
  const raw = text(value, label, 4_000);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    fail(`${label} must use HTTPS without embedded credentials`);
  }
  return parsed.toString();
}

export function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

export function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(canonicalJson(value), "utf8");
}

export function sha256Canonical(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(digestCanonical(value as never) as WorkTrackingDigest);
}

export function zeroBytes(value: Uint8Array): void {
  value.fill(0);
}

export function boundedIdentifier(value: unknown, label: string, maximum = 160): string {
  const parsed = text(value, label, maximum);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

export function operationMarker(value: unknown): string {
  const parsed = text(value, "operation marker", 500);
  if (!/^app-factory:v1:(?:jira|github):[a-z0-9][a-z0-9:._-]+$/.test(parsed)) {
    fail("operation marker is invalid");
  }
  return parsed;
}

export function repositoryName(value: unknown): string {
  const parsed = text(value, "GitHub repository", 141);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/.test(parsed)) {
    fail("GitHub repository is invalid");
  }
  const repository = parsed.slice(parsed.indexOf("/") + 1);
  if (repository === "." || repository === "..") fail("GitHub repository is invalid");
  return parsed;
}

export function projectKey(value: unknown): string {
  const parsed = text(value, "Jira project key", 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(parsed)) fail("Jira project key is invalid");
  return parsed;
}

export function issueKey(value: unknown): string {
  const parsed = text(value, "Jira issue key", 32);
  if (!/^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/.test(parsed)) fail("Jira issue key is invalid");
  return parsed;
}

export function gitSha(value: unknown, label: string): string {
  const parsed = text(value, label, 64);
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(parsed)) fail(`${label} is invalid`);
  return parsed;
}

export function isoInstant(value: unknown, label: string): string {
  const parsed = text(value, label, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(parsed)) {
    fail(`${label} is invalid`);
  }
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds)) fail(`${label} is invalid`);
  return new Date(milliseconds).toISOString();
}
