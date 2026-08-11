import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  EvidenceIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type CommandRequestV1,
  type EvidenceManifestV1,
  type EvidenceV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import { afterEach, describe, expect, it } from "vitest";

import { executeEvidenceCommand, type EvidenceCommandRequestV1 } from "../src/index.js";

const ATTEMPT = AttemptIdSchema.parse("75000000-0000-4000-8000-000000000001");
const NOW = IsoInstantSchema.parse("2026-08-10T12:00:00.000Z");
const roots: string[] = [];

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function command(operation: EvidenceCommandRequestV1["operation"], payload: unknown) {
  return {
    schemaVersion: 1,
    commandId: "75000000-0000-4000-8000-000000000010",
    issuedAt: NOW,
    origin: "cli",
    operation,
    payload,
  } as CommandRequestV1 as EvidenceCommandRequestV1;
}

function populatedStore(): EvidenceStore {
  const root = mkdtempSync(join(tmpdir(), "factory-evidence-command-"));
  roots.push(root);
  const store = new EvidenceStore(root);
  const evidence: EvidenceV1 = {
    schemaVersion: 1,
    evidenceId: EvidenceIdSchema.parse("75000000-0000-4000-8000-000000000002"),
    attemptId: ATTEMPT,
    createdAt: NOW,
    producer: "factory.event-log",
    subject: {
      taskSpecDigest: digest("1"),
      policyDigest: digest("2"),
      baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
      candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
      fence: 1,
    },
    artifacts: [],
    kind: "event-log",
    claims: {
      firstSequence: 1,
      lastSequence: 1,
      eventCount: 1,
      eventLogDigest: digest("3"),
    },
  };
  const stored = store.putEvidence(evidence);
  const manifest: EvidenceManifestV1 = {
    schemaVersion: 1,
    attemptId: ATTEMPT,
    createdAt: NOW,
    subject: evidence.subject,
    entries: [{ evidenceId: evidence.evidenceId, digest: stored.digest }],
    requiredKinds: ["event-log"],
  };
  store.commitManifest(manifest);
  return store;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("daemon-owned evidence commands", () => {
  it("lists and inspects immutable manifests without returning blob contents", () => {
    const store = populatedStore();
    expect(
      executeEvidenceCommand(store, command("evidence.list", { afterAttemptId: null, limit: 50 })),
    ).toMatchObject({
      operation: "evidence.list",
      manifests: [{ attemptId: ATTEMPT, entryCount: 1 }],
      hasMore: false,
    });
    expect(
      executeEvidenceCommand(store, command("evidence.inspect", { attemptId: ATTEMPT })),
    ).toMatchObject({
      operation: "evidence.inspect",
      manifest: { attemptId: ATTEMPT },
    });
  });

  it("recomputes every referenced digest before reporting storage integrity", () => {
    const result = executeEvidenceCommand(
      populatedStore(),
      command("evidence.verify", { attemptId: ATTEMPT }),
    );
    expect(result).toMatchObject({
      operation: "evidence.verify",
      integrityVerified: true,
      manifest: { attemptId: ATTEMPT, entryCount: 1 },
      evidence: [{ kind: "event-log", artifactCount: 0 }],
      artifactCount: 0,
    });
    expect(result).not.toHaveProperty("verified");
  });

  it("returns a stable not-found error instead of probing arbitrary paths", () => {
    expect(() =>
      executeEvidenceCommand(
        populatedStore(),
        command("evidence.inspect", {
          attemptId: "75000000-0000-4000-8000-000000000099",
        }),
      ),
    ).toThrow(/No evidence manifest exists/);
  });
});
