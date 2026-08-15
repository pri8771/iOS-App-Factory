import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  EvidenceIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type EvidenceManifestV1,
  type EvidenceSubjectV1,
  type EvidenceV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import { afterEach, describe, expect, it } from "vitest";

import {
  computeReferencedEvidenceDigests,
  reclaimEvidenceBlob,
  selectUnreferencedEvidenceBlobs,
} from "../src/evidence-blobs.js";

const roots: string[] = [];
function makeRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "app-factory-retention-evidence-"));
  roots.push(path);
  return path;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function subject(): EvidenceSubjectV1 {
  return {
    taskSpecDigest: digest("1"),
    policyDigest: digest("2"),
    baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
    candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
    fence: 1,
  };
}

function eventEvidence(
  attemptId = AttemptIdSchema.parse(randomUUID()),
  artifact?: Readonly<{ digest: ReturnType<typeof digest>; byteLength: number }>,
): EvidenceV1 {
  return {
    schemaVersion: 1,
    evidenceId: EvidenceIdSchema.parse(randomUUID()),
    attemptId,
    createdAt: IsoInstantSchema.parse("2026-08-10T12:00:00.000Z"),
    producer: "factory.event-log",
    subject: subject(),
    artifacts: artifact
      ? [{ ...artifact, mediaType: "text/plain", logicalName: "stdout.log" }]
      : [],
    kind: "event-log",
    claims: { firstSequence: 1, lastSequence: 3, eventCount: 3, eventLogDigest: digest("3") },
  };
}

function manifestFor(
  evidence: EvidenceV1,
  evidenceDigest: ReturnType<typeof digest>,
): EvidenceManifestV1 {
  return {
    schemaVersion: 1,
    attemptId: evidence.attemptId,
    createdAt: IsoInstantSchema.parse("2026-08-10T12:01:00.000Z"),
    subject: evidence.subject,
    entries: [{ evidenceId: evidence.evidenceId, digest: evidenceDigest }],
    requiredKinds: [evidence.kind],
  };
}

describe("computeReferencedEvidenceDigests / selectUnreferencedEvidenceBlobs", () => {
  it("treats a manifest entry's own blob and its nested artifact blobs as referenced", () => {
    const store = new EvidenceStore(makeRoot());
    const artifactBytes = Buffer.from("multi-MB stdout, in spirit\n", "utf8");
    const artifactDigest = store.putBlob(artifactBytes);
    const evidence = eventEvidence(undefined, {
      digest: artifactDigest,
      byteLength: artifactBytes.byteLength,
    });
    const stored = store.putEvidence(evidence);
    store.commitManifest(manifestFor(stored.evidence, stored.digest));

    const referenced = computeReferencedEvidenceDigests(store);
    expect(referenced.has(stored.digest)).toBe(true);
    expect(referenced.has(artifactDigest)).toBe(true);
    expect(selectUnreferencedEvidenceBlobs(store)).toEqual([]);
  });

  it("selects a blob that was written but never referenced by any manifest", () => {
    const store = new EvidenceStore(makeRoot());
    const orphanDigest = store.putBlob(Buffer.from("never referenced\n", "utf8"));
    const evidence = eventEvidence();
    const stored = store.putEvidence(evidence);
    store.commitManifest(manifestFor(stored.evidence, stored.digest));

    const items = selectUnreferencedEvidenceBlobs(store);
    expect(items).toEqual([
      {
        category: "evidence-blob",
        id: orphanDigest,
        path: store.blobPath(orphanDigest),
        attemptId: null,
        reason: "unreferenced by any evidence manifest",
      },
    ]);
  });

  it("never selects a referenced blob even when many other blobs are unreferenced", () => {
    const store = new EvidenceStore(makeRoot());
    const evidence = eventEvidence();
    const stored = store.putEvidence(evidence);
    store.commitManifest(manifestFor(stored.evidence, stored.digest));
    for (let index = 0; index < 5; index += 1) {
      store.putBlob(Buffer.from(`orphan-${String(index)}\n`, "utf8"));
    }

    const items = selectUnreferencedEvidenceBlobs(store);
    expect(items.map((item) => item.id)).not.toContain(stored.digest);
    expect(items).toHaveLength(5);
  });

  it("aborts rather than guessing when a manifest's evidence fails verification", () => {
    const root = makeRoot();
    const store = new EvidenceStore(root);
    const evidence = eventEvidence();
    const stored = store.putEvidence(evidence);
    store.commitManifest(manifestFor(stored.evidence, stored.digest));
    const hex = stored.digest.slice("sha256:".length);
    writeFileSync(join(root, "blobs", "sha256", hex.slice(0, 2), hex.slice(2)), "tampered\n", {
      mode: 0o600,
    });

    expect(() => selectUnreferencedEvidenceBlobs(store)).toThrow();
    expect(() => computeReferencedEvidenceDigests(store)).toThrow();
  });
});

describe("reclaimEvidenceBlob", () => {
  it("deletes an unreferenced blob and is idempotent", () => {
    const store = new EvidenceStore(makeRoot());
    store.putBlob(Buffer.from("delete-me\n", "utf8"));
    const [item] = selectUnreferencedEvidenceBlobs(store);
    if (item === undefined) throw new Error("expected one selected item");

    expect(reclaimEvidenceBlob(store, item)).toBe(true);
    expect(store.listBlobDigests()).toEqual([]);
    expect(reclaimEvidenceBlob(store, item)).toBe(false);
  });

  it("refuses to delete a blob that became referenced after selection (time-of-check/time-of-use)", () => {
    const store = new EvidenceStore(makeRoot());
    const artifactBytes = Buffer.from("became referenced later\n", "utf8");
    const artifactDigest = store.putBlob(artifactBytes);
    const [item] = selectUnreferencedEvidenceBlobs(store);
    if (item === undefined) throw new Error("expected one selected item");
    expect(item.id).toBe(artifactDigest);

    // A manifest committed after selection references the exact same
    // content-addressed digest.
    const evidence = eventEvidence(undefined, {
      digest: artifactDigest,
      byteLength: artifactBytes.byteLength,
    });
    const stored = store.putEvidence(evidence);
    store.commitManifest(manifestFor(stored.evidence, stored.digest));

    expect(reclaimEvidenceBlob(store, item)).toBe(false);
    expect(store.listBlobDigests()).toContain(artifactDigest);
  });
});
