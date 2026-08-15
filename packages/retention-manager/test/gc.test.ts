import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  EvidenceIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type AttemptId,
  type EvidenceManifestV1,
  type EvidenceSubjectV1,
  type EvidenceV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  FileExecutionCheckpointStore,
  type ExecutionCheckpointV1,
} from "@app-factory/execution-engine";
import type { BrokerCommitRecord, CandidateVerification } from "@app-factory/git-workspace";
import { openMigratedFactoryDatabase } from "@app-factory/kernel";
import {
  inspectSupervisedRun,
  launchPreparedSupervisedRun,
  prepareSupervisedRun,
  waitForSupervisedRunRegistration,
} from "@app-factory/process-supervisor";
import { afterEach, describe, expect, it } from "vitest";

import { runGarbageCollection } from "../src/gc.js";
import { RetentionManagerError, type GcConfigurationV1 } from "../src/types.js";

const temporaryDirectories: string[] = [];
function temporaryDirectory(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-retention-gc-")));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Control-plane database (terminal-attempt source of truth)
// ---------------------------------------------------------------------------

function seedAttempt(
  database: ReturnType<typeof openMigratedFactoryDatabase>,
  input: Readonly<{
    attemptId: string;
    state: "queued" | "running" | "succeeded";
    terminalAt: string | null;
  }>,
): void {
  const suffix = input.attemptId.slice(0, 8);
  const commandId = `${suffix}-0000-4000-8000-000000000c01`;
  const taskId = `${suffix}-0000-4000-8000-0000000000ta`;
  const projectId = `${suffix}-0000-4000-8000-000000000ppp`;
  const repositoryId = `${suffix}-0000-4000-8000-000000000rrr`;
  const taskDigest = `sha256:${suffix.padEnd(64, "0")}`;
  database
    .prepare(
      `INSERT INTO commands(command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json)
       VALUES (?, 1, 'task.submit', 'cli', '2026-08-01T00:00:00.000Z', ?, NULL, '{}')`,
    )
    .run(commandId, taskId);
  database
    .prepare(
      `INSERT INTO task_snapshots(task_id, schema_version, project_id, repository_id, base_commit, task_spec_digest, submitted_by_command_id, created_at, payload_json)
       VALUES (?, 1, ?, ?, ?, ?, ?, '2026-08-01T00:00:00.000Z', '{}')`,
    )
    .run(taskId, projectId, repositoryId, "a".repeat(40), taskDigest, commandId);
  const terminal = input.state === "succeeded";
  database
    .prepare(
      `INSERT INTO attempts(attempt_id, schema_version, task_id, task_spec_digest, attempt_number, state, desired_state, revision, fence, current_step_id, blocker_json, outcome_json, created_at, updated_at, terminal_at, payload_json)
       VALUES (?, 1, ?, ?, 1, ?, 'running', 0, 0, NULL, NULL, ?, '2026-08-01T00:00:00.000Z', ?, ?, '{}')`,
    )
    .run(
      input.attemptId,
      taskId,
      taskDigest,
      input.state,
      terminal ? '{"kind":"succeeded"}' : null,
      input.terminalAt ?? "2026-08-01T00:00:00.000Z",
      input.terminalAt,
    );
}

// ---------------------------------------------------------------------------
// Evidence store fixture
// ---------------------------------------------------------------------------

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function evidenceSubject(): EvidenceSubjectV1 {
  return {
    taskSpecDigest: digest("1"),
    policyDigest: digest("2"),
    baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
    candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
    fence: 1,
  };
}

function eventEvidence(attemptId: AttemptId): EvidenceV1 {
  return {
    schemaVersion: 1,
    evidenceId: EvidenceIdSchema.parse(randomUUID()),
    attemptId,
    createdAt: IsoInstantSchema.parse("2026-08-10T12:00:00.000Z"),
    producer: "factory.event-log",
    subject: evidenceSubject(),
    artifacts: [],
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

// ---------------------------------------------------------------------------
// Checkpoint store fixture
// ---------------------------------------------------------------------------

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

function checkpointAt(attemptId: AttemptId, revision: number): ExecutionCheckpointV1 {
  return {
    schemaVersion: 1,
    attemptId,
    fence: revision,
    inputDigest: digest("3"),
    revision,
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

function advanceCheckpoint(
  store: FileExecutionCheckpointStore,
  attemptId: AttemptId,
  revisions: number,
): void {
  for (let revision = 1; revision <= revisions; revision += 1) {
    store.compareAndSet(
      attemptId,
      revision - 1 === 0 ? null : revision - 1,
      checkpointAt(attemptId, revision),
    );
  }
}

// ---------------------------------------------------------------------------
// Supervised-run spool fixture (real, fast subprocess; see run-directories.test.ts)
// ---------------------------------------------------------------------------

const COMPILED_ENTRYPOINT = join(
  process.cwd(),
  "packages/process-supervisor/dist/supervised-entrypoint.js",
);

async function waitUntil<T>(observe: () => T | null, timeoutMs = 8_000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  do {
    const result = observe();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (performance.now() < deadline);
  throw new Error("Condition was not observed before the polling deadline");
}

/**
 * process-supervisor's own file-identity checks (`readStablePrivateFileDescriptor`)
 * are deliberately paranoid about a file's metadata changing mid-read; under
 * heavy parallel test-suite load that occasionally trips on a real,
 * transient race that has nothing to do with the code under test here (the
 * task's own known-flaky list already names this subsystem:
 * process-supervisor's "uncooperative-target" test). Retrying the whole
 * spawn with a fresh run key is a setup-robustness measure, not a
 * weakening of any assertion in the tests that call this.
 */
async function terminalSupervisedRunDirectory(
  root: string,
  attemptId: string,
  runKey: string,
  attempt = 0,
): Promise<string> {
  const effectiveRunKey = attempt === 0 ? runKey : `${runKey}-retry${String(attempt)}`;
  try {
    return await terminalSupervisedRunDirectoryOnce(root, attemptId, effectiveRunKey);
  } catch (error) {
    if (attempt >= 2) throw error;
    return terminalSupervisedRunDirectory(root, attemptId, runKey, attempt + 1);
  }
}

async function terminalSupervisedRunDirectoryOnce(
  root: string,
  attemptId: string,
  runKey: string,
): Promise<string> {
  const prepared = prepareSupervisedRun(root, {
    runKey,
    attemptId,
    fence: 1,
    createdAt: "2026-08-11T12:00:00.000Z",
    executable: process.execPath,
    argv: ["-e", "process.stdout.write('ok')"],
    cwd: root,
    limits: {
      timeoutMs: 5_000,
      graceMs: 100,
      forceWaitMs: 500,
      pollMs: 10,
      maxOutputBytesPerStream: 16_384,
    },
  });
  const launch = launchPreparedSupervisedRun(prepared, {
    controllerEntrypointPath: COMPILED_ENTRYPOINT,
  });
  if (launch.outcome !== "launch-requested") throw new Error("expected a launch request");
  await waitForSupervisedRunRegistration(prepared, launch.registration, {
    timeoutMs: 5_000,
    pollMs: 10,
  });
  const targetLockPath = join(prepared.paths.runDirectory, ".target.state.json.mutation-lock");
  const controllerLockPath = join(
    prepared.paths.runDirectory,
    ".controller.state.json.mutation-lock",
  );
  await waitUntil(() => {
    const inspection = inspectSupervisedRun(prepared);
    return inspection.state === "terminal" &&
      inspection.stateCleanup === "complete" &&
      !existsSync(targetLockPath) &&
      !existsSync(controllerLockPath)
      ? true
      : null;
  });
  return prepared.paths.runDirectory;
}

// ---------------------------------------------------------------------------
// Verification checkout fixture (plain filesystem; attemptId is a path segment)
// ---------------------------------------------------------------------------

function makeScratchDirectory(gitRuntimeRoot: string, attemptId: string): string {
  const path = join(
    gitRuntimeRoot,
    "verification-scratch",
    attemptId,
    "fence-1",
    "swiftpm-build-1",
  );
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return join(gitRuntimeRoot, "verification-scratch", attemptId);
}

// ---------------------------------------------------------------------------
// Full four-category fixture
// ---------------------------------------------------------------------------

const SUCCEEDED_A = "11111111-1111-4111-8111-111111111111";
const RUNNING_B = "22222222-2222-4222-8222-222222222222";

type Fixture = Readonly<{
  configuration: GcConfigurationV1;
  referencedBlobPath: string;
  unreferencedBlobPath: string;
  checkpointDirectory: string;
  nonTerminalCheckpointDirectory: string;
  supervisedRunDirectory: string;
  nonTerminalSupervisedRunDirectory: string;
  scratchDirectory: string;
  nonTerminalScratchDirectory: string;
}>;

async function buildFixture(): Promise<Fixture> {
  const root = temporaryDirectory();

  const databasePath = join(root, "control-plane.sqlite");
  const database = openMigratedFactoryDatabase(databasePath);
  seedAttempt(database, {
    attemptId: SUCCEEDED_A,
    state: "succeeded",
    terminalAt: "2026-08-01T00:00:00.000Z",
  });
  seedAttempt(database, { attemptId: RUNNING_B, state: "running", terminalAt: null });
  database.close();

  const evidenceRoot = join(root, "evidence");
  const evidenceStore = new EvidenceStore(evidenceRoot);
  const unreferencedDigest = evidenceStore.putBlob(
    Buffer.from("orphaned xcodebuild output\n", "utf8"),
  );
  const referencedEvidence = eventEvidence(AttemptIdSchema.parse(SUCCEEDED_A));
  const storedReferenced = evidenceStore.putEvidence(referencedEvidence);
  evidenceStore.commitManifest(manifestFor(storedReferenced.evidence, storedReferenced.digest));

  const checkpointRoot = join(root, "checkpoints");
  const checkpointStore = new FileExecutionCheckpointStore(checkpointRoot);
  advanceCheckpoint(checkpointStore, AttemptIdSchema.parse(SUCCEEDED_A), 5);
  advanceCheckpoint(checkpointStore, AttemptIdSchema.parse(RUNNING_B), 5);

  const supervisedRoot = join(root, "supervised-runs");
  const supervisedRunDirectory = await terminalSupervisedRunDirectory(
    supervisedRoot,
    SUCCEEDED_A,
    "run-a",
  );
  const nonTerminalSupervisedRunDirectory = await terminalSupervisedRunDirectory(
    supervisedRoot,
    RUNNING_B,
    "run-b",
  );

  const gitRuntimeRoot = join(root, "git");
  const scratchDirectory = makeScratchDirectory(gitRuntimeRoot, SUCCEEDED_A);
  const nonTerminalScratchDirectory = makeScratchDirectory(gitRuntimeRoot, RUNNING_B);

  return {
    configuration: {
      schemaVersion: 1,
      databasePath,
      evidenceRoots: [evidenceRoot],
      checkpointRoots: [checkpointRoot],
      runDirectoryRoots: [{ path: supervisedRoot, kind: "supervised" }],
      verificationRoots: [{ gitRuntimeRoot }],
      retentionWindowMs: 0,
      keepLatestCheckpointRevisions: 2,
    },
    referencedBlobPath: evidenceStore.blobPath(storedReferenced.digest),
    unreferencedBlobPath: evidenceStore.blobPath(unreferencedDigest),
    checkpointDirectory: join(checkpointRoot, SUCCEEDED_A),
    nonTerminalCheckpointDirectory: join(checkpointRoot, RUNNING_B),
    supervisedRunDirectory,
    nonTerminalSupervisedRunDirectory,
    scratchDirectory,
    nonTerminalScratchDirectory,
  };
}

describe("runGarbageCollection", () => {
  it("refuses an invalid configuration rather than guessing defaults", async () => {
    await expect(runGarbageCollection({})).rejects.toThrow();
    await expect(runGarbageCollection({ schemaVersion: 1 })).rejects.toThrow();
  });

  it("dry-run lists a reclaimable item from every category but deletes nothing", async () => {
    const fixture = await buildFixture();
    const now = () => new Date("2027-01-01T00:00:00.000Z");

    const result = await runGarbageCollection(fixture.configuration, { apply: false, now });

    expect(result.mode).toBe("dry-run");
    expect(result.applied).toBeNull();
    expect(new Set(result.selection.items.map((item) => item.category))).toEqual(
      new Set(["evidence-blob", "checkpoint-revision", "run-directory", "verification-checkout"]),
    );
    // Nothing was touched by a dry run.
    for (const path of [
      fixture.referencedBlobPath,
      fixture.unreferencedBlobPath,
      fixture.checkpointDirectory,
      fixture.supervisedRunDirectory,
      fixture.scratchDirectory,
    ]) {
      expect(existsSync(path)).toBe(true);
    }
  }, 20_000);

  it("--apply reclaims exactly the selected set and leaves everything else untouched", async () => {
    const fixture = await buildFixture();
    const now = () => new Date("2027-01-01T00:00:00.000Z");

    const result = await runGarbageCollection(fixture.configuration, { apply: true, now });

    expect(result.mode).toBe("apply");
    expect(result.applied).not.toBeNull();
    expect(result.applied?.every((outcome) => outcome.reclaimed)).toBe(true);
    expect(result.applied).toHaveLength(result.selection.items.length);

    // Reclaimed: the unreferenced blob, the stale checkpoint revisions,
    // the terminal supervised spool, the terminal scratch directory.
    expect(existsSync(fixture.unreferencedBlobPath)).toBe(false);
    expect(existsSync(fixture.supervisedRunDirectory)).toBe(false);
    expect(existsSync(fixture.scratchDirectory)).toBe(false);

    // Never touched: referenced blob, non-terminal attempt's checkpoint,
    // supervised spool, and scratch directory.
    expect(existsSync(fixture.referencedBlobPath)).toBe(true);
    expect(existsSync(fixture.nonTerminalCheckpointDirectory)).toBe(true);
    expect(existsSync(fixture.nonTerminalSupervisedRunDirectory)).toBe(true);
    expect(existsSync(fixture.nonTerminalScratchDirectory)).toBe(true);

    // A second dry-run afterward finds nothing left to reclaim from the
    // categories that were fully cleared.
    const after = await runGarbageCollection(fixture.configuration, { apply: false, now });
    expect(after.selection.items.some((item) => item.category === "evidence-blob")).toBe(false);
    expect(after.selection.items.some((item) => item.category === "run-directory")).toBe(false);
    expect(
      after.selection.items.some(
        (item) => item.category === "verification-checkout" && item.attemptId === SUCCEEDED_A,
      ),
    ).toBe(false);
  }, 20_000);

  it("never selects or reclaims anything belonging to a non-terminal attempt", async () => {
    const fixture = await buildFixture();
    const now = () => new Date("2027-01-01T00:00:00.000Z");

    const result = await runGarbageCollection(fixture.configuration, { apply: false, now });
    for (const item of result.selection.items) {
      expect(item.attemptId === RUNNING_B || item.path.includes(RUNNING_B)).toBe(false);
    }
  }, 20_000);

  it("aborts the whole run without deleting anything when evidence data is corrupted", async () => {
    const fixture = await buildFixture();
    const now = () => new Date("2027-01-01T00:00:00.000Z");
    writeFileSync(fixture.referencedBlobPath, "tampered\n", { mode: 0o600 });

    await expect(
      runGarbageCollection(fixture.configuration, { apply: true, now }),
    ).rejects.toThrow();

    // The abort happened during selection, before any deletion phase for
    // any category — so even the plainly-reclaimable items elsewhere are
    // still present.
    expect(existsSync(fixture.unreferencedBlobPath)).toBe(true);
    expect(existsSync(fixture.supervisedRunDirectory)).toBe(true);
    expect(existsSync(fixture.scratchDirectory)).toBe(true);
  }, 20_000);

  it("refuses to run when the control-plane database does not exist", async () => {
    const fixture = await buildFixture();
    await expect(
      runGarbageCollection(
        { ...fixture.configuration, databasePath: join(temporaryDirectory(), "missing.sqlite") },
        { apply: false },
      ),
    ).rejects.toThrow(RetentionManagerError);
  });
});
