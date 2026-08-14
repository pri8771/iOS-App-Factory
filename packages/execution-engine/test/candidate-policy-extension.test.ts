import {
  GitWorkspaceError,
  decodeProtectedPathPolicyExtension,
  normalizeCandidatePolicy,
  type ProtectedPathPolicyExtensionV1,
} from "@app-factory/git-workspace";
import { describe, expect, it } from "vitest";

import {
  canonicalDigest,
  canonicalJsonBytes,
  parseNormalizedCandidatePolicy,
} from "../src/index.js";

// Recorded on the pre-extension code, before packages/git-workspace or
// packages/execution-engine knew about protectedPathPolicyExtension: the
// exact sha256 candidate-policy digest for two representative
// extension-free policies (explicit limits, and defaulted limits). This is
// the digest-neutrality fixture the task requires: today's already-recorded
// evidence carries these exact digests, and any regression to canonical
// encoding for an extension-free policy would move one of these hashes and
// fail this test closed.
const RECORDED_EXPLICIT_LIMITS_DIGEST =
  "sha256:fff259974239dc75e696e1156adc0b732457dfc18592d876258d036e0ffa0f03";
const RECORDED_DEFAULT_LIMITS_DIGEST =
  "sha256:4cdc0bf052bb871c0c049b6e5298ad63bbb679d4b00c78bf3ea44b78e5e6d58f";

function decodeExtension(extension: unknown): ProtectedPathPolicyExtensionV1 {
  return decodeProtectedPathPolicyExtension(Buffer.from(JSON.stringify(extension), "utf8"))
    .extension;
}

const pbxprojAllowanceExtension = decodeExtension({
  schemaVersion: 1,
  additionalTrustBoundaryPathPrefixes: [],
  additionalTrustBoundarySegments: [],
  additionalPolicyMarkers: [],
  allowances: ["xcode-project-membership"],
});

describe("candidate-policy digest neutrality (extension-free policies)", () => {
  it("keeps the recorded digest byte-identical for an explicit-limits policy", () => {
    const normalized = normalizeCandidatePolicy({
      authorizedScopes: ["src/", "docs/README.md"],
      maxChangedFileBytes: 250_000,
      maxDiffBytes: 2_000_000,
    });
    expect(canonicalDigest(normalized)).toBe(RECORDED_EXPLICIT_LIMITS_DIGEST);
  });

  it("keeps the recorded digest byte-identical for a defaulted-limits policy", () => {
    const normalized = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    expect(canonicalDigest(normalized)).toBe(RECORDED_DEFAULT_LIMITS_DIGEST);
  });

  it("produces canonical bytes indistinguishable from the original three-key shape", () => {
    // A literal built directly in the pre-extension three-key shape stands in
    // for what the schema could ever have produced before this field
    // existed. If normalizeCandidatePolicy's output ever diverges from this
    // for an extension-free input, canonical bytes -- and therefore the
    // recorded digest -- would change.
    const preExtensionShapeLiteral = {
      authorizedScopes: ["docs/README.md", "src"],
      maxChangedFileBytes: 250_000,
      maxDiffBytes: 2_000_000,
    };
    const normalized = normalizeCandidatePolicy({
      authorizedScopes: ["src/", "docs/README.md"],
      maxChangedFileBytes: 250_000,
      maxDiffBytes: 2_000_000,
    });
    expect(canonicalJsonBytes(normalized)).toEqual(canonicalJsonBytes(preExtensionShapeLiteral));
    expect(canonicalDigest(normalized)).toBe(canonicalDigest(preExtensionShapeLiteral));
  });

  it("omits the protectedPathPolicyExtension key entirely when the policy carries no extension", () => {
    const normalized = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    expect(Object.keys(normalized).sort()).toEqual(
      ["authorizedScopes", "maxChangedFileBytes", "maxDiffBytes"].sort(),
    );
    expect(JSON.parse(canonicalJsonBytes(normalized).toString("utf8"))).not.toHaveProperty(
      "protectedPathPolicyExtension",
    );
  });

  it("adds the protectedPathPolicyExtension key -- and changes the digest -- only when present", () => {
    const withoutExtension = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    const withExtension = normalizeCandidatePolicy({
      authorizedScopes: ["src"],
      protectedPathPolicyExtension: pbxprojAllowanceExtension,
    });
    expect(Object.keys(withExtension).sort()).toEqual(
      [
        "authorizedScopes",
        "maxChangedFileBytes",
        "maxDiffBytes",
        "protectedPathPolicyExtension",
      ].sort(),
    );
    expect(canonicalDigest(withExtension)).not.toBe(canonicalDigest(withoutExtension));
  });
});

describe("parseNormalizedCandidatePolicy", () => {
  it("round-trips an extension-free policy back to its exact canonical bytes", () => {
    const normalized = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    const bytes = canonicalJsonBytes(normalized);
    const parsed = parseNormalizedCandidatePolicy(JSON.parse(bytes.toString("utf8")) as unknown);
    expect(canonicalJsonBytes(parsed)).toEqual(bytes);
    expect(parsed.protectedPathPolicyExtension).toBeUndefined();
  });

  it("round-trips a policy carrying the extension", () => {
    const normalized = normalizeCandidatePolicy({
      authorizedScopes: ["src"],
      protectedPathPolicyExtension: pbxprojAllowanceExtension,
    });
    const bytes = canonicalJsonBytes(normalized);
    const parsed = parseNormalizedCandidatePolicy(JSON.parse(bytes.toString("utf8")) as unknown);
    expect(canonicalJsonBytes(parsed)).toEqual(bytes);
    expect(parsed.protectedPathPolicyExtension).toEqual(pbxprojAllowanceExtension);
  });

  it("rejects a raw value that claims the extension key with a malformed extension", () => {
    const normalized = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    const tampered = {
      ...JSON.parse(canonicalJsonBytes(normalized).toString("utf8")),
      protectedPathPolicyExtension: { schemaVersion: 1 },
    };
    expect(() => parseNormalizedCandidatePolicy(tampered)).toThrow();
  });

  it("rejects a raw value with unexpected fields even when only the original three are near-correct", () => {
    const normalized = normalizeCandidatePolicy({ authorizedScopes: ["src"] });
    const tampered = {
      ...JSON.parse(canonicalJsonBytes(normalized).toString("utf8")),
      extraField: true,
    };
    expect(() => parseNormalizedCandidatePolicy(tampered)).toThrow();
  });
});

describe("GitWorkspaceError propagation through normalizeCandidatePolicy", () => {
  it("fails closed on an unknown relaxation key even when reached through normalizeCandidatePolicy", () => {
    expect(() =>
      normalizeCandidatePolicy({
        authorizedScopes: ["src"],
        protectedPathPolicyExtension: {
          schemaVersion: 1,
          additionalTrustBoundaryPathPrefixes: [],
          additionalTrustBoundarySegments: [],
          additionalPolicyMarkers: [],
          allowances: ["made-up-relaxation"],
        } as unknown as ProtectedPathPolicyExtensionV1,
      }),
    ).toThrow(GitWorkspaceError);
  });
});
