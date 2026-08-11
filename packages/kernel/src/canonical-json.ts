import { createHash } from "node:crypto";

import {
  Sha256DigestSchema,
  TaskSpecV1Schema,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode a non-finite number");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only accepts plain objects");
    }

    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }

  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

/**
 * Deterministically serializes parsed JSON data with recursively sorted object
 * keys and no insignificant whitespace. Factory V1 contracts contain only
 * JSON-native finite values, so these bytes are stable across input key order.
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

export function computeTaskSpecDigest(taskSpecInput: unknown): Sha256Digest {
  const taskSpec: TaskSpecV1 = TaskSpecV1Schema.parse(taskSpecInput);
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalJson(taskSpec), "utf8").digest("hex")}`,
  );
}
