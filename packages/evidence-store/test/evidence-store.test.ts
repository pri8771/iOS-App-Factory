import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
import { afterEach, describe, expect, it } from "vitest";

import { EvidenceStore, EvidenceStoreError } from "../src/index.js";

const roots: string[] = [];

function makeRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "app-factory-evidence-"));
  roots.push(path);
  return path;
}

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function subject(): EvidenceSubjectV1 {
  return {
    taskSpecDigest: digest("1"),
    policyDigest: digest("2"),
    baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
    candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
    fence: 3,
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
      ? [
          {
            ...artifact,
            mediaType: "text/plain",
            logicalName: "events.jsonl",
          },
        ]
      : [],
    kind: "event-log",
    claims: {
      firstSequence: 1,
      lastSequence: 3,
      eventCount: 3,
      eventLogDigest: digest("3"),
    },
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

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("EvidenceStore", () => {
  it("atomically commits and verifies content-addressed evidence and artifacts", () => {
    const root = makeRoot();
    const store = new EvidenceStore(root);
    const artifactBytes = Buffer.from("one\ntwo\n", "utf8");
    const artifactDigest = store.putBlob(artifactBytes);
    const evidence = eventEvidence(undefined, {
      digest: artifactDigest,
      byteLength: artifactBytes.byteLength,
    });
    const stored = store.putEvidence(evidence);

    store.commitManifest(manifestFor(stored.evidence, stored.digest));
    const result = store.verify(stored.evidence.attemptId);

    expect(result.evidence).toEqual([stored.evidence]);
    expect(result.artifactCount).toBe(1);
    expect(store.readBlob(artifactDigest)).toEqual(artifactBytes);
    expect(
      lstatSync(join(root, "manifests", `${stored.evidence.attemptId}.json`)).mode & 0o777,
    ).toBe(0o600);
  });

  it("is replay-safe for the same bytes and rejects an immutable manifest collision", () => {
    const store = new EvidenceStore(makeRoot());
    const stored = store.putEvidence(eventEvidence());
    const manifest = manifestFor(stored.evidence, stored.digest);

    expect(store.putEvidence(stored.evidence).digest).toBe(stored.digest);
    store.commitManifest(manifest);
    expect(() =>
      store.commitManifest({
        ...manifest,
        createdAt: IsoInstantSchema.parse("2026-08-10T12:02:00.000Z"),
      }),
    ).toThrow(/Immutable evidence collision/);
  });

  it("rejects a missing referenced artifact before publishing a manifest", () => {
    const root = makeRoot();
    const store = new EvidenceStore(root);
    const evidence = eventEvidence(undefined, { digest: digest("f"), byteLength: 10 });
    const stored = store.putEvidence(evidence);

    expect(() => store.commitManifest(manifestFor(evidence, stored.digest))).toThrow();
    expect(() => readFileSync(join(root, "manifests", `${evidence.attemptId}.json`))).toThrow();
  });

  it("detects changed blob bytes during verification", () => {
    const root = makeRoot();
    const store = new EvidenceStore(root);
    const stored = store.putEvidence(eventEvidence());
    store.commitManifest(manifestFor(stored.evidence, stored.digest));
    const hex = stored.digest.slice("sha256:".length);
    const blob = join(root, "blobs", "sha256", hex.slice(0, 2), hex.slice(2));
    writeFileSync(blob, "tampered\n", { mode: 0o600 });

    expect(() => store.verify(stored.evidence.attemptId)).toThrow(/digest mismatch/);
  });

  it("rejects public paths and symbolic-link roots", () => {
    const publicRoot = makeRoot();
    chmodSync(publicRoot, 0o755);
    expect(() => new EvidenceStore(publicRoot)).toThrow(/not private/);

    const parent = makeRoot();
    const target = join(parent, "target");
    mkdirSync(target, { mode: 0o700 });
    const link = join(parent, "link");
    symlinkSync(target, link);
    expect(() => new EvidenceStore(link)).toThrow(EvidenceStoreError);
  });
});
