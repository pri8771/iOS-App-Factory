import { createHash } from "node:crypto";

import { fail } from "./validation.js";

export type Sha256Digest = `sha256:${string}`;

function normalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail("canonical values require finite numbers");
    return value;
  }
  if (typeof value === "undefined" || typeof value === "bigint" || typeof value === "function") {
    fail("canonical values cannot contain unsupported JavaScript types");
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail("canonical values cannot be cyclic");
    seen.add(value);
    const result = value.map((item) => normalize(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value !== "object") fail("canonical value is unsupported");
  const object = value as object;
  if (Object.getPrototypeOf(object) !== Object.prototype) {
    fail("canonical objects must have the default object prototype");
  }
  if (seen.has(object)) fail("canonical values cannot be cyclic");
  seen.add(object);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) {
    const item = (object as Readonly<Record<string, unknown>>)[key];
    if (item === undefined) fail("canonical objects cannot contain undefined values");
    result[key] = normalize(item, seen);
  }
  seen.delete(object);
  return result;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(normalize(value, new Set()))}\n`;
}

export function digestCanonical(value: unknown): Sha256Digest {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function markerFor(
  provider: "jira" | "github",
  action: string,
  logicalIdentity: Readonly<Record<string, unknown>>,
): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(action)) fail("marker action is invalid");
  const suffix = digestCanonical({ provider, action, logicalIdentity }).slice("sha256:".length);
  return `app-factory:v1:${provider}:${action}:${suffix}`;
}
