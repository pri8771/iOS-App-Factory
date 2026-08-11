import { createHash } from "node:crypto";

import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

function normalize(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(normalize);
  if (input !== null && typeof input === "object") {
    const record = input as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalize(record[key])]),
    );
  }
  return input;
}

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(normalize(value)), "utf8");
}

export function sha256Digest(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

export function canonicalDigest(value: unknown): Sha256Digest {
  return sha256Digest(canonicalJsonBytes(value));
}
