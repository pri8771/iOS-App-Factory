import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type AttemptId,
} from "@app-factory/contracts";
import type { BrokerCommitRecord, CandidateVerification } from "@app-factory/git-workspace";
import { afterEach, describe, expect, it } from "vitest";

import {
  ExecutionCheckpointError,
  FileExecutionCheckpointStore,
  type ExecutionCheckpointV1,
} from "../src/checkpoint.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "app-factory-checkpoint-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const ATTEMPT_ID: AttemptId = AttemptIdSchema.parse("44444444-4444-4444-8444-444444444444");

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function candidateVerification(attemptId: AttemptId): CandidateVerification {
  return {
    attemptId,
    baseSha: "a".repeat(40),
    attemptHeadSha: "b".repeat(40),
    candidateTreeId: "c".repeat(40),
    changedPaths: [],
    diffBytes: 0,
    totalChangedFileBytes: 0,
    diffDigest: digest("1"),
    treeDigest: digest("2"),
  } as CandidateVerification;
}

function initialCheckpoint(attemptId: AttemptId = ATTEMPT_ID): ExecutionCheckpointV1 {
  return {
    schemaVersion: 1,
    attemptId,
    fence: 1,
    inputDigest: digest("3"),
    revision: 1,
    phase: "candidate-verified",
    candidateVerification: candidateVerification(attemptId),
    candidateVerificationArtifactDigest: digest("4"),
    testBundleDigest: null,
    reviewInputArtifactDigest: null,
    reviewReportDigest: null,
    brokerCommit: null as BrokerCommitRecord | null,
    evidenceIndexDigest: null,
    createdAt: IsoInstantSchema.parse("2026-08-10T12:00:00.000Z"),
    updatedAt: IsoInstantSchema.parse("2026-08-10T12:00:00.000Z"),
  };
}

describe("FileExecutionCheckpointStore", () => {
  it("ignores OS metadata junk in an attempt's checkpoint directory instead of failing closed", () => {
    const root = temporaryRoot();
    const store = new FileExecutionCheckpointStore(root);
    store.compareAndSet(ATTEMPT_ID, null, initialCheckpoint());
    const attemptDirectory = join(root, ATTEMPT_ID);

    // Finder writes .DS_Store and AppleDouble sidecars as files; Spotlight,
    // Trash, and fseventsd bookkeeping are directories. Both shapes must be
    // ignored by name, regardless of entry type.
    writeFileSync(join(attemptDirectory, ".DS_Store"), "junk\n", { mode: 0o600 });
    writeFileSync(join(attemptDirectory, "._0000000000000001.json"), "junk\n", { mode: 0o600 });
    mkdirSync(join(attemptDirectory, ".Spotlight-V100"), { mode: 0o700 });
    mkdirSync(join(attemptDirectory, ".Trashes"), { mode: 0o700 });
    mkdirSync(join(attemptDirectory, ".fseventsd"), { mode: 0o700 });

    expect(store.load(ATTEMPT_ID)).toMatchObject({ attemptId: ATTEMPT_ID, revision: 1 });
  });

  it("still fails closed on a genuinely unexpected checkpoint entry", () => {
    const root = temporaryRoot();
    const store = new FileExecutionCheckpointStore(root);
    store.compareAndSet(ATTEMPT_ID, null, initialCheckpoint());
    const attemptDirectory = join(root, ATTEMPT_ID);
    writeFileSync(join(attemptDirectory, "untrusted.txt"), "not a checkpoint\n", { mode: 0o600 });

    expect(() => store.load(ATTEMPT_ID)).toThrow(/Unexpected checkpoint entry/);
    expect(() => store.load(ATTEMPT_ID)).toThrow(ExecutionCheckpointError);
  });

  // Each call re-leases at the same phase with a strictly higher fence, so
  // compareAndSet accepts it (a phase advance would need the extra
  // rank-specific digest fields; a fence-only re-lease does not).
  function advance(
    store: FileExecutionCheckpointStore,
    attemptId: AttemptId,
    revision: number,
  ): void {
    store.compareAndSet(attemptId, revision - 1 === 0 ? null : revision - 1, {
      ...initialCheckpoint(attemptId),
      fence: revision,
      revision,
      phase: "candidate-verified",
    });
  }

  describe("retention-facing listing and pruning", () => {
    it("lists attempt directories, ignoring the reserved tmp directory and OS junk", () => {
      const root = temporaryRoot();
      const store = new FileExecutionCheckpointStore(root);
      const second = AttemptIdSchema.parse("55555555-5555-4555-8555-555555555555");
      store.compareAndSet(ATTEMPT_ID, null, initialCheckpoint());
      store.compareAndSet(second, null, initialCheckpoint(second));
      writeFileSync(join(root, ".DS_Store"), "junk\n", { mode: 0o600 });
      mkdirSync(join(root, ".Spotlight-V100"), { mode: 0o700 });

      expect(store.listAttemptIds()).toEqual([ATTEMPT_ID, second].sort());
    });

    it("fails closed when the checkpoint root contains a genuinely unexpected entry", () => {
      const root = temporaryRoot();
      const store = new FileExecutionCheckpointStore(root);
      store.compareAndSet(ATTEMPT_ID, null, initialCheckpoint());
      mkdirSync(join(root, "not-an-attempt"), { mode: 0o700 });

      expect(() => store.listAttemptIds()).toThrow(/Unexpected checkpoint root entry/);
    });

    it("lists revisions present without requiring load's from-1 contiguity", () => {
      const root = temporaryRoot();
      const store = new FileExecutionCheckpointStore(root);
      advance(store, ATTEMPT_ID, 1);
      advance(store, ATTEMPT_ID, 2);
      advance(store, ATTEMPT_ID, 3);

      expect(store.listRevisions(ATTEMPT_ID)).toEqual([1, 2, 3]);
      expect(
        store.listRevisions(AttemptIdSchema.parse("66666666-6666-4666-8666-666666666666")),
      ).toEqual([]);
    });

    it("prunes revisions below the floor but always keeps the latest, and stays idempotent", () => {
      const root = temporaryRoot();
      const store = new FileExecutionCheckpointStore(root);
      advance(store, ATTEMPT_ID, 1);
      advance(store, ATTEMPT_ID, 2);
      advance(store, ATTEMPT_ID, 3);
      advance(store, ATTEMPT_ID, 4);
      advance(store, ATTEMPT_ID, 5);

      expect(store.deleteRevisionsBelow(ATTEMPT_ID, 4)).toBe(3);
      expect(store.listRevisions(ATTEMPT_ID)).toEqual([4, 5]);
      // Re-running is a no-op; nothing left below the floor.
      expect(store.deleteRevisionsBelow(ATTEMPT_ID, 4)).toBe(0);
      // The latest revision survives even a floor set above it.
      expect(store.deleteRevisionsBelow(ATTEMPT_ID, 999)).toBe(1);
      expect(store.listRevisions(ATTEMPT_ID)).toEqual([5]);
      // load()'s strict from-1 contiguity check is deliberately left
      // untouched by this pruning: it now fails closed rather than
      // returning a silently incomplete history. This is the accepted,
      // documented tradeoff (see deleteRevisionsBelow's doc comment):
      // load() is only ever called by the coordinator while resuming a
      // non-terminal attempt, so a terminal attempt's pruned checkpoint is
      // never read again in practice; if it ever is, failing closed here
      // is strictly safer than guessing.
      expect(() => store.load(ATTEMPT_ID)).toThrow(/not contiguous/);
    });

    it("is a no-op for an attempt with no checkpoint directory and rejects a non-positive floor", () => {
      const root = temporaryRoot();
      const store = new FileExecutionCheckpointStore(root);
      const missing = AttemptIdSchema.parse("77777777-7777-4777-8777-777777777777");

      expect(store.deleteRevisionsBelow(missing, 1)).toBe(0);
      store.compareAndSet(ATTEMPT_ID, null, initialCheckpoint());
      expect(() => store.deleteRevisionsBelow(ATTEMPT_ID, 0)).toThrow(/positive safe integer/);
    });
  });
});
