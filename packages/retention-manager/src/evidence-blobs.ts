import type { EvidenceStore } from "@app-factory/evidence-store";
import type { AttemptId, Sha256Digest } from "@app-factory/contracts";

import type { GcSelectedItemV1 } from "./types.js";

/**
 * The full set of blob digests referenced by any committed manifest in one
 * evidence store: each manifest entry's own digest (the evidence record
 * blob) plus every artifact digest referenced from within that evidence
 * (for example the multi-MB xcodebuild stdout/stderr blobs). Uses
 * `EvidenceStore.verify`, the store's own strictest read path — any
 * unreadable blob, digest mismatch, or malformed manifest throws and
 * propagates, aborting the whole GC run rather than computing a
 * partial/wrong reference set and guessing which blobs are safe to delete.
 */
export function computeReferencedEvidenceDigests(store: EvidenceStore): ReadonlySet<Sha256Digest> {
  const referenced = new Set<Sha256Digest>();
  let afterAttemptId: AttemptId | null = null;
  for (;;) {
    const page = store.listManifests({ afterAttemptId, limit: 200 });
    for (const record of page.records) {
      const verification = store.verify(record.manifest.attemptId);
      for (const entry of verification.manifest.entries) {
        referenced.add(entry.digest);
      }
      for (const evidence of verification.evidence) {
        for (const artifact of evidence.artifacts) {
          referenced.add(artifact.digest);
        }
      }
    }
    if (!page.hasMore) break;
    afterAttemptId = page.nextAfterAttemptId;
  }
  return referenced;
}

/** Every blob physically present in the store that no manifest references. */
export function selectUnreferencedEvidenceBlobs(store: EvidenceStore): readonly GcSelectedItemV1[] {
  const referenced = computeReferencedEvidenceDigests(store);
  const items: GcSelectedItemV1[] = [];
  for (const digest of store.listBlobDigests()) {
    if (referenced.has(digest)) continue;
    items.push({
      category: "evidence-blob",
      id: digest,
      path: store.blobPath(digest),
      attemptId: null,
      reason: "unreferenced by any evidence manifest",
    });
  }
  return items;
}

/**
 * Deletes exactly one previously selected blob, first re-proving it is
 * still unreferenced. This is the one place in this whole tool with a real
 * (if narrow) time-of-check/time-of-use window: a manifest committed
 * between selection and apply could reference this exact content-addressed
 * digest. Returns `false` — never deletes — if that has happened, or if
 * the blob is already gone.
 */
export function reclaimEvidenceBlob(store: EvidenceStore, item: GcSelectedItemV1): boolean {
  const referenced = computeReferencedEvidenceDigests(store);
  if (referenced.has(item.id as Sha256Digest)) return false;
  return store.deleteBlob(item.id);
}
