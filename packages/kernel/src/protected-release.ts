import { createHash } from "node:crypto";

import {
  ReleaseIdentityV1Schema,
  Sha256DigestSchema,
  type ReleaseIdentityV1,
  type Sha256Digest,
} from "@app-factory/contracts";

import { canonicalJson } from "./canonical-json.js";

/**
 * Canonical digest of a protected-release identity. Approval bindings and upload intents bind this
 * digest; callers never supply a competing identity under a different digest.
 */
export function computeReleaseIdentityDigestV1(identityInput: unknown): Sha256Digest {
  const identity: ReleaseIdentityV1 = ReleaseIdentityV1Schema.parse(identityInput);
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalJson(identity), "utf8").digest("hex")}`,
  );
}
