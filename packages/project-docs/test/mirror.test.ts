import { randomUUID } from "node:crypto";

import { ProjectIdSchema, type ProjectId } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  MIRROR_REVERSE_SYNC_REFUSED_CODE_V1,
  MirrorReverseSyncRefusedError,
  applyMirrorDataToRepoDocs,
  buildMirrorProjectionV1,
  diffMirrorProjectionV1,
  readProjectDocsSnapshot,
} from "../src/index.js";

const PROJECT_ID: ProjectId = ProjectIdSchema.parse(randomUUID());

function docsSnapshot(root: string) {
  return readProjectDocsSnapshot(root, "2026-08-16T12:00:00.000Z");
}

describe("buildMirrorProjectionV1 / diffMirrorProjectionV1", () => {
  it("projects only the mirror-allowed subset of a docs snapshot", () => {
    const snapshot = docsSnapshot(
      new URL("fixtures/hindsight/", import.meta.url).pathname.replace(/\/$/, ""),
    );
    const projection = buildMirrorProjectionV1(PROJECT_ID, snapshot);

    expect(projection.projectId).toBe(PROJECT_ID);
    expect(projection.sourceSnapshotDigest).toBe(snapshot.snapshotDigest);
    expect(projection.lifecycleStatus).toBe("verification_pending");
    expect(projection.releaseChecklistProgress).toEqual({ totalItems: 22, checkedItems: 16 });
    // Only the open (looksOpen) bugs/risks cross into the mirror -- resolved ones do not.
    expect(projection.openBugs.length).toBe(2);
    expect(projection.openBugs.every((item) => item.status !== "resolved")).toBe(true);
    expect(projection.milestones).toEqual([]);
    expect(projection.projectionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Deterministic: rebuilding from the same snapshot yields a byte-identical projection digest.
    const rebuilt = buildMirrorProjectionV1(PROJECT_ID, snapshot);
    expect(rebuilt.projectionDigest).toBe(projection.projectionDigest);
  });

  it("reports the initial push (no previous projection) as changed with one entry per populated field", () => {
    const snapshot = docsSnapshot(
      new URL("fixtures/hindsight/", import.meta.url).pathname.replace(/\/$/, ""),
    );
    const projection = buildMirrorProjectionV1(PROJECT_ID, snapshot);
    const diff = diffMirrorProjectionV1(null, projection);

    expect(diff.previousProjectionDigest).toBeNull();
    expect(diff.nextProjectionDigest).toBe(projection.projectionDigest);
    expect(diff.changed).toBe(true);
    expect(diff.changes.some((change) => change.field === "lifecycleStatus")).toBe(true);
    expect(diff.changes.some((change) => change.field.startsWith("openBugs["))).toBe(true);
  });

  it("reports no diff when nothing changed, and precise field-level deltas when something did", () => {
    const before = buildMirrorProjectionV1(
      PROJECT_ID,
      docsSnapshot(new URL("fixtures/aurafit/", import.meta.url).pathname.replace(/\/$/, "")),
    );
    const unchanged = diffMirrorProjectionV1(before, before);
    expect(unchanged.changed).toBe(false);
    expect(unchanged.changes).toEqual([]);
    expect(unchanged.previousProjectionDigest).toBe(before.projectionDigest);

    // A synthetic "next" projection with one field changed (lifecycle advanced) produces exactly the
    // one expected field-level change, not a wholesale rebuild.
    const advanced = {
      ...before,
      lifecycleStatus: "beta",
      projectionDigest: before.projectionDigest,
    };
    const diff = diffMirrorProjectionV1(before, advanced);
    expect(diff.changed).toBe(true);
    expect(diff.changes).toEqual([
      {
        field: "lifecycleStatus",
        changeKind: "changed",
        previousValue: JSON.stringify("mvp_development"),
        nextValue: JSON.stringify("beta"),
      },
    ]);
  });

  it("refuses to diff projections for two different projects", () => {
    const projectA = buildMirrorProjectionV1(
      PROJECT_ID,
      docsSnapshot(new URL("fixtures/hindsight/", import.meta.url).pathname.replace(/\/$/, "")),
    );
    const otherProjectId: ProjectId = ProjectIdSchema.parse(randomUUID());
    const projectB = buildMirrorProjectionV1(
      otherProjectId,
      docsSnapshot(new URL("fixtures/aurafit/", import.meta.url).pathname.replace(/\/$/, "")),
    );
    expect(() => diffMirrorProjectionV1(projectA, projectB)).toThrow(RangeError);
  });
});

describe("applyMirrorDataToRepoDocs (owner doctrine: repo docs are never written from a mirror)", () => {
  it("always refuses, for any input, with the typed reverse-sync error", () => {
    const inputs: readonly unknown[] = [
      null,
      undefined,
      {},
      { lifecycleStatus: "released", projectId: PROJECT_ID },
      buildMirrorProjectionV1(
        PROJECT_ID,
        docsSnapshot(new URL("fixtures/roam-ios/", import.meta.url).pathname.replace(/\/$/, "")),
      ),
      "a raw string someone might try to push back",
    ];
    for (const input of inputs) {
      expect(() => applyMirrorDataToRepoDocs(input)).toThrow(MirrorReverseSyncRefusedError);
      try {
        applyMirrorDataToRepoDocs(input);
        expect.unreachable("applyMirrorDataToRepoDocs must always throw");
      } catch (error) {
        expect(error).toBeInstanceOf(MirrorReverseSyncRefusedError);
        expect((error as MirrorReverseSyncRefusedError).code).toBe(
          MIRROR_REVERSE_SYNC_REFUSED_CODE_V1,
        );
        expect((error as Error).message).toMatch(/source of truth/i);
      }
    }
  });
});
