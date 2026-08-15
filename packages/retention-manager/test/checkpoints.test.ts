import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type AttemptId,
} from "@app-factory/contracts";
import {
  FileExecutionCheckpointStore,
  type ExecutionCheckpointV1,
} from "@app-factory/execution-engine";
import type { BrokerCommitRecord, CandidateVerification } from "@app-factory/git-workspace";
import { afterEach, describe, expect, it } from "vitest";

import { reclaimCheckpointRevisions, selectStaleCheckpointRevisions } from "../src/checkpoints.js";
import type { TerminalAttemptIndex } from "../src/terminal-index.js";

const roots: string[] = [];
function makeRoot(): string {
  const path = mkdtempSync(join(tmpdir(), "app-factory-retention-checkpoints-"));
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

function initialCheckpoint(attemptId: AttemptId): ExecutionCheckpointV1 {
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

// Each call re-leases at the same phase with a strictly higher fence, so
// compareAndSet accepts it without needing the extra rank-specific digest
// fields a real phase advance would require.
function advanceToRevision(
  store: FileExecutionCheckpointStore,
  attemptId: AttemptId,
  revision: number,
): void {
  store.compareAndSet(attemptId, revision - 1 === 0 ? null : revision - 1, {
    ...initialCheckpoint(attemptId),
    fence: revision,
    revision,
  });
}

const TERMINAL = AttemptIdSchema.parse("11111111-1111-4111-8111-111111111111");
const NON_TERMINAL = AttemptIdSchema.parse("22222222-2222-4222-8222-222222222222");

function terminalIndexWith(terminalAttemptIds: readonly AttemptId[]): TerminalAttemptIndex {
  const set = new Set(terminalAttemptIds);
  return {
    isTerminal: (attemptId) => set.has(attemptId),
    terminalAt: (attemptId) => (set.has(attemptId) ? "2026-08-11T00:00:00.000Z" : null),
  };
}

describe("selectStaleCheckpointRevisions / reclaimCheckpointRevisions", () => {
  it("selects a terminal attempt with more revisions than the keep count, one item for the whole attempt", () => {
    const root = makeRoot();
    const store = new FileExecutionCheckpointStore(root);
    for (let revision = 1; revision <= 5; revision += 1)
      advanceToRevision(store, TERMINAL, revision);
    const terminalIndex = terminalIndexWith([TERMINAL]);

    const items = selectStaleCheckpointRevisions(root, store, terminalIndex, 2);
    expect(items).toEqual([
      {
        category: "checkpoint-revision",
        id: TERMINAL,
        path: join(root, TERMINAL),
        attemptId: TERMINAL,
        reason:
          "terminal attempt; 3 checkpoint revision(s) older than the latest 2 (keeping from revision 4)",
      },
    ]);
  });

  it("does not select a terminal attempt at or under the keep count", () => {
    const root = makeRoot();
    const store = new FileExecutionCheckpointStore(root);
    for (let revision = 1; revision <= 2; revision += 1)
      advanceToRevision(store, TERMINAL, revision);

    expect(selectStaleCheckpointRevisions(root, store, terminalIndexWith([TERMINAL]), 2)).toEqual(
      [],
    );
  });

  it("never selects a non-terminal attempt, no matter how many revisions it has", () => {
    const root = makeRoot();
    const store = new FileExecutionCheckpointStore(root);
    for (let revision = 1; revision <= 20; revision += 1)
      advanceToRevision(store, NON_TERMINAL, revision);

    expect(selectStaleCheckpointRevisions(root, store, terminalIndexWith([TERMINAL]), 1)).toEqual(
      [],
    );
    expect(store.listRevisions(NON_TERMINAL)).toHaveLength(20);
  });

  it("reclaims exactly the stale revisions, keeps the latest, and is idempotent", () => {
    const root = makeRoot();
    const store = new FileExecutionCheckpointStore(root);
    for (let revision = 1; revision <= 5; revision += 1)
      advanceToRevision(store, TERMINAL, revision);
    const terminalIndex = terminalIndexWith([TERMINAL]);
    const [item] = selectStaleCheckpointRevisions(root, store, terminalIndex, 2);
    if (item === undefined) throw new Error("expected one selected item");

    expect(reclaimCheckpointRevisions(store, terminalIndex, 2, item)).toBe(true);
    expect(store.listRevisions(TERMINAL)).toEqual([4, 5]);
    expect(reclaimCheckpointRevisions(store, terminalIndex, 2, item)).toBe(false);
  });

  it("never reclaims a non-terminal attempt even if handed a fabricated item for it", () => {
    const root = makeRoot();
    const store = new FileExecutionCheckpointStore(root);
    for (let revision = 1; revision <= 5; revision += 1)
      advanceToRevision(store, NON_TERMINAL, revision);
    const terminalIndex = terminalIndexWith([TERMINAL]);

    const fabricated = {
      category: "checkpoint-revision" as const,
      id: NON_TERMINAL,
      path: join(root, NON_TERMINAL),
      attemptId: NON_TERMINAL,
      reason: "fabricated for the test",
    };
    expect(reclaimCheckpointRevisions(store, terminalIndex, 2, fabricated)).toBe(false);
    expect(store.listRevisions(NON_TERMINAL)).toHaveLength(5);
  });
});
