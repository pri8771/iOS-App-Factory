import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  EvidenceIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  Sha256DigestSchema,
  TaskSpecV1Schema,
  type CommandRequestV1,
  type EvidenceManifestV1,
  type EvidenceV1,
  type ExecutionAttemptV1,
  type RunRecordV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import { computeTaskSpecDigest } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  CommandHandlerError,
  computeRunRecordDigest,
  createRunExportMirrorPort,
  executeRunExportCommand,
  type RunExportCommandRequestV1,
  type RunExportDependencies,
  type RunExportMirrorPort,
} from "../src/index.js";

const ATTEMPT = AttemptIdSchema.parse("76000000-0000-4000-8000-000000000001");
const NOW = IsoInstantSchema.parse("2026-08-16T12:00:00.000Z");
const roots: string[] = [];

function digest(character: string) {
  return Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function request(attemptId: string = ATTEMPT): RunExportCommandRequestV1 {
  return {
    schemaVersion: 1,
    commandId: "76000000-0000-4000-8000-000000000010",
    issuedAt: NOW,
    origin: "cli",
    operation: "run.export",
    payload: { attemptId },
  } as CommandRequestV1 as RunExportCommandRequestV1;
}

function taskSpec(): TaskSpecV1 {
  return TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: "76000000-0000-4000-8000-000000000002",
    projectId: "76000000-0000-4000-8000-000000000003",
    createdAt: NOW,
    title: "Add a farewell",
    objective: "Add a public farewell(for:) method.",
    acceptanceCriteria: [
      { id: "returns-farewell", statement: "farewell works", verification: "automated" },
    ],
    base: { repositoryId: "76000000-0000-4000-8000-000000000004", commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/Greeter/GreetingFormatter.swift"] },
    policyDigest: digest("2"),
  });
}

function attempt(overrides: Partial<ExecutionAttemptV1> = {}): ExecutionAttemptV1 {
  const spec = taskSpec();
  return {
    schemaVersion: 1,
    attemptId: ATTEMPT,
    taskId: spec.taskId,
    taskSpecDigest: computeTaskSpecDigest(spec),
    attemptNumber: 1,
    state: "succeeded",
    desiredState: "running",
    revision: 9,
    fence: 2,
    currentStepId: null,
    blocker: null,
    outcome: { kind: "succeeded", summary: "verified", outputDigest: null },
    createdAt: NOW,
    updatedAt: NOW,
    terminalAt: NOW,
    ...overrides,
  } as ExecutionAttemptV1;
}

function emptyStore(): EvidenceStore {
  const root = mkdtempSync(join(tmpdir(), "factory-run-export-"));
  roots.push(root);
  return new EvidenceStore(root);
}

/** A storage-valid manifest that is not a verified-execution closure (only an event log). */
function incompleteStore(): EvidenceStore {
  const store = emptyStore();
  const evidence: EvidenceV1 = {
    schemaVersion: 1,
    evidenceId: EvidenceIdSchema.parse("76000000-0000-4000-8000-000000000005"),
    attemptId: ATTEMPT,
    createdAt: NOW,
    producer: "factory.local-agent",
    subject: {
      taskSpecDigest: computeTaskSpecDigest(taskSpec()),
      policyDigest: digest("2"),
      baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
      candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
      fence: 2,
    },
    artifacts: [],
    kind: "event-log",
    claims: { firstSequence: 1, lastSequence: 2, eventCount: 2, eventLogDigest: digest("3") },
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

const unreachableMirrors: RunExportMirrorPort = {
  open: () => {
    throw new Error("mirror port must not be consulted before the closure is complete");
  },
};

function dependencies(
  overrides: Partial<{
    attempt: ExecutionAttemptV1 | null;
    taskSpec: TaskSpecV1 | null;
    evidenceStore: EvidenceStore;
    mirrors: RunExportMirrorPort;
  }> = {},
): RunExportDependencies {
  const attemptRow = overrides.attempt === undefined ? attempt() : overrides.attempt;
  const spec = overrides.taskSpec === undefined ? taskSpec() : overrides.taskSpec;
  return {
    repositories: {
      attempts: { findById: (id) => (id === attemptRow?.attemptId ? attemptRow : null) },
      taskSnapshots: { findById: (id) => (id === spec?.taskId ? spec : null) },
    },
    evidenceStore: overrides.evidenceStore ?? emptyStore(),
    mirrors: overrides.mirrors ?? unreachableMirrors,
  };
}

function expectHandlerError(run: () => unknown, code: string, message?: RegExp): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CommandHandlerError);
  const handlerError = caught as CommandHandlerError;
  expect(handlerError.code).toBe(code);
  expect(handlerError.retryable).toBe(false);
  if (message !== undefined) expect(handlerError.message).toMatch(message);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("run.export command runtime", () => {
  it("fails closed for an unknown attempt", () => {
    expectHandlerError(
      () => executeRunExportCommand(dependencies({ attempt: null }), request()),
      "attempt.not-found",
    );
  });

  it.each(["queued", "running", "paused", "blocked"] as const)(
    "fails closed while the attempt is still %s (non-terminal)",
    (state) => {
      expectHandlerError(
        () =>
          executeRunExportCommand(
            dependencies({ attempt: attempt({ state, terminalAt: null }) }),
            request(),
          ),
        "run.export-not-terminal",
        /only a terminal attempt can be exported/,
      );
    },
  );

  it.each(["failed", "cancelled"] as const)(
    "fails closed for a terminal %s attempt that never produced a verified closure",
    (state) => {
      expectHandlerError(
        () => executeRunExportCommand(dependencies({ attempt: attempt({ state }) }), request()),
        "run.export-not-verified",
        /only a succeeded, verified run has an exportable record/,
      );
    },
  );

  it("fails closed when the attempt's durable TaskSpec snapshot is missing or drifted", () => {
    expectHandlerError(
      () => executeRunExportCommand(dependencies({ taskSpec: null }), request()),
      "run.export-integrity-failed",
      /no immutable TaskSpec snapshot/,
    );
    const drifted = TaskSpecV1Schema.parse({ ...taskSpec(), title: "A different task" });
    expectHandlerError(
      () => executeRunExportCommand(dependencies({ taskSpec: drifted }), request()),
      "run.export-integrity-failed",
      /does not match its digest/,
    );
  });

  it("fails closed when a succeeded attempt has no evidence manifest", () => {
    expectHandlerError(
      () => executeRunExportCommand(dependencies(), request()),
      "evidence.not-found",
    );
  });

  it("fails closed when the manifest is not a complete verified-execution closure", () => {
    expectHandlerError(
      () => executeRunExportCommand(dependencies({ evidenceStore: incompleteStore() }), request()),
      "run.export-evidence-incomplete",
      /complete verified-execution closure/,
    );
  });

  it("refuses to open a mirror that does not exist without creating the git runtime root", () => {
    const root = mkdtempSync(join(tmpdir(), "factory-run-export-git-"));
    roots.push(root);
    const gitRuntimeRoot = join(root, "local-execution", "git");
    const port = createRunExportMirrorPort({ gitRuntimeRoot });
    expect(() => port.open(taskSpec().base.repositoryId)).toThrow(
      /No Factory mirror exists for repository/,
    );
    // Nothing was created as a side effect of the failed open.
    expect(() => rmSync(gitRuntimeRoot, { recursive: false })).toThrow();
  });

  it("binds the record digest to the canonical, key-order-independent encoding of the record", () => {
    const record: RunRecordV1 = {
      schemaVersion: 1,
      attemptId: ATTEMPT,
      taskId: taskSpec().taskId,
      attemptNumber: 1,
      state: "succeeded",
      implementingRunId: "76000000-0000-4000-8000-000000000006",
      repositoryId: taskSpec().base.repositoryId,
      taskSpecDigest: digest("1"),
      policyDigest: digest("2"),
      baseCommit: GitObjectIdSchema.parse("a".repeat(40)),
      candidateTree: GitObjectIdSchema.parse("b".repeat(40)),
      fence: 2,
      brokerCommit: {
        commit: GitObjectIdSchema.parse("c".repeat(40)),
        tree: GitObjectIdSchema.parse("b".repeat(40)),
        commitDigest: digest("3"),
        attemptMarker: ATTEMPT,
      },
      verification: [
        {
          checkId: "tests.swift",
          argv: ["/usr/bin/swift", "test"],
          checkoutTree: GitObjectIdSchema.parse("b".repeat(40)),
          startedAt: NOW,
          finishedAt: NOW,
          toolVersions: [],
          passed: true,
          exitCode: 0,
        },
      ],
      review: {
        reviewerId: "fixture.reviewer",
        reviewerVersion: "1.0.0",
        reviewerRunId: "76000000-0000-4000-8000-000000000007",
        verdict: "pass",
        findingCount: 0,
        reviewInputDigest: digest("4"),
      },
      evidence: {
        manifestDigest: digest("5"),
        indexDigest: digest("6"),
        entryCount: 5,
        artifactCount: 20,
      },
      agent: {
        adapterId: "openai.codex",
        adapterVersion: "1.0.0",
        cliVersion: "0.148.0-alpha.9",
        model: "gpt-5.6-codex",
        executableDigest: digest("7"),
        usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: null },
      },
      timings: {
        attemptCreatedAt: NOW,
        attemptTerminalAt: NOW,
        agentStartedAt: NOW,
        agentFinishedAt: NOW,
        evidenceCreatedAt: NOW,
      },
    } as RunRecordV1;
    const reverseKeyOrder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeyOrder);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .reverse()
            .map(([key, child]) => [key, reverseKeyOrder(child)]),
        );
      }
      return value;
    };
    const reordered = reverseKeyOrder(record) as RunRecordV1;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(record));
    const first = computeRunRecordDigest(record);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeRunRecordDigest(reordered)).toBe(first);
    expect(computeRunRecordDigest({ ...record, fence: 3 })).not.toBe(first);
    expect(() =>
      computeRunRecordDigest({ ...record, state: "failed" } as unknown as RunRecordV1),
    ).toThrow();
  });
});
