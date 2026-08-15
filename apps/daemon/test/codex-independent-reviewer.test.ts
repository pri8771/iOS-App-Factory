import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  VERIFIED_CODEX_CLI_VERSIONS,
  type CodexPreflightResult,
  type PreflightCodexOptions,
} from "@app-factory/agent-runner";
import { Sha256DigestSchema, TaskSpecV1Schema, type Sha256Digest } from "@app-factory/contracts";
import { sha256Digest } from "@app-factory/execution-engine";
import {
  computeReviewInputDigest,
  parseIndependentReviewInput,
  runIndependentReview,
  type IndependentReviewInput,
} from "@app-factory/independent-review";
import {
  parseSupervisedRunReceipt,
  type LaunchSupervisedRunResult,
  type PreparedSupervisedRun,
  type SupervisedRunReceiptV1,
} from "@app-factory/process-supervisor";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODEX_REVIEW_ADAPTER_ID,
  CODEX_REVIEW_ADAPTER_VERSION,
  CodexIndependentReviewerConfigurationError,
  CodexIndependentReviewerError,
  REVIEW_CAPABILITIES,
  buildCodexReviewInvocation,
  classifyCodexReviewProcess,
  createCodexIndependentReviewer,
  digestDirectoryTree,
  parseCodexReviewReportedResultV1,
  serializeCodexReviewReportedResultJsonSchemaV1,
  type CodexIndependentReviewerConfigurationV1,
  type CodexIndependentReviewerDependencies,
} from "../src/codex-independent-reviewer.js";

const GIT = "/usr/bin/git";
const roots: string[] = [];

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2026-08-11T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-11T12:00:00Z",
      GIT_COMMITTER_EMAIL: "factory-tests@example.invalid",
      GIT_COMMITTER_NAME: "Factory Tests",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
    },
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function digestFile(path: string): Sha256Digest {
  return sha256Digest(readFileSync(path));
}

type Fixture = Readonly<{
  root: string;
  mirrorPath: string;
  candidateTree: string;
  checkoutRoot: string;
  configuration: CodexIndependentReviewerConfigurationV1;
}>;

function makeFixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "af-codex-reviewer-")));
  chmodSync(root, 0o700);
  roots.push(root);

  const source = join(root, "source");
  mkdirSync(join(source, "src"), { recursive: true, mode: 0o700 });
  git(source, ["init", "--initial-branch=main", "--quiet"]);
  writeFileSync(join(source, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(source, "README.md"), "# Sample candidate\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "--quiet", "-m", "initial"]);
  const candidateTree = git(source, ["rev-parse", "HEAD^{tree}"]);

  const mirrorPath = join(root, "mirror.git");
  git(root, ["clone", "--quiet", "--bare", "--no-local", source, mirrorPath]);

  const executable = join(root, "fake-codex");
  writeFileSync(executable, "fake Codex executable: tests must never launch this file\n", {
    mode: 0o700,
  });
  chmodSync(executable, 0o700);
  const executableDigest = digestFile(executable);

  const codexHome = join(root, "codex-home");
  const runnerRoot = join(root, "runner");
  const checkoutRoot = join(root, "checkouts");
  mkdirSync(codexHome, { mode: 0o700 });
  mkdirSync(runnerRoot, { mode: 0o700 });
  mkdirSync(checkoutRoot, { mode: 0o700 });

  const outputSchemaPath = join(runnerRoot, "review-result.schema.json");
  writeFileSync(outputSchemaPath, serializeCodexReviewReportedResultJsonSchemaV1(), {
    mode: 0o600,
  });

  return {
    root,
    mirrorPath,
    candidateTree,
    checkoutRoot,
    configuration: {
      schemaVersion: 1,
      executable,
      executableDigest,
      expectedCliVersion: VERIFIED_CODEX_CLI_VERSIONS[0],
      model: "gpt-5.6-codex",
      codexHome,
      runnerRoot,
      checkoutRoot,
      outputSchemaPath,
      environmentAllowlist: ["PATH", "TMPDIR"],
      environment: { PATH: "/usr/bin:/bin", TMPDIR: "/private/tmp" },
      registrationTimeoutMs: 50,
      pollMs: 1,
    },
  };
}

function makeEvidence(): Readonly<{
  map: Map<Sha256Digest, Buffer>;
  digests: readonly Sha256Digest[];
}> {
  const blobs = [
    Buffer.from(
      JSON.stringify({ kind: "task-spec-artifact", title: "Add a value export" }),
      "utf8",
    ),
    Buffer.from("diff --git a/src/app.ts b/src/app.ts\n+export const value = 1;\n", "utf8"),
  ];
  const map = new Map<Sha256Digest, Buffer>();
  const digests: Sha256Digest[] = [];
  for (const bytes of blobs) {
    const digest = sha256Digest(bytes);
    map.set(digest, bytes);
    digests.push(digest);
  }
  return { map, digests };
}

function makeReviewInput(
  fixture: Fixture,
  evidenceDigests: readonly Sha256Digest[],
  overrides: Partial<IndependentReviewInput> = {},
): IndependentReviewInput {
  const policyDigest = Sha256DigestSchema.parse(`sha256:${"1".repeat(64)}`);
  const taskSpec = TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: randomUUID(),
    projectId: randomUUID(),
    createdAt: "2026-08-11T12:00:00.000Z",
    title: "Add a value export",
    objective: "Export a constant value from src/app.ts.",
    acceptanceCriteria: [
      {
        id: "exports-value",
        statement: "src/app.ts exports a `value` constant.",
        verification: "automated",
      },
    ],
    base: { repositoryId: randomUUID(), commit: "a".repeat(40) },
    requestedScope: { paths: ["src/app.ts"] },
    policyDigest,
  });
  return parseIndependentReviewInput({
    attemptId: randomUUID(),
    implementingRunId: randomUUID(),
    reviewerRunId: randomUUID(),
    taskSpec,
    candidateTree: fixture.candidateTree,
    diffDigest: evidenceDigests[0] ?? Sha256DigestSchema.parse(`sha256:${"2".repeat(64)}`),
    policyDigest,
    evidenceManifestDigest: Sha256DigestSchema.parse(`sha256:${"3".repeat(64)}`),
    rawEvidenceDigests: evidenceDigests,
    ...overrides,
  });
}

function reviewInputDigestRunKey(reviewInput: IndependentReviewInput): string {
  const digest = computeReviewInputDigest(reviewInput);
  return `review-${digest.slice("sha256:".length, "sha256:".length + 32)}`;
}

function completedReviewTranscript(
  reported: Readonly<{ verdict: string; findings: readonly unknown[] }>,
): Buffer {
  return Buffer.from(
    [
      JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "fake-message",
          type: "agent_message",
          text: JSON.stringify({
            schemaVersion: 1,
            verdict: reported.verdict,
            findings: reported.findings,
          }),
        },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 12, output_tokens: 6, cached_input_tokens: 0 },
      }),
      "",
    ].join("\n"),
    "utf8",
  );
}

function rawMessageTranscript(text: string): Buffer {
  return Buffer.from(
    [
      JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "fake-message", type: "agent_message", text },
      }),
      JSON.stringify({ type: "turn.completed", usage: null }),
      "",
    ].join("\n"),
    "utf8",
  );
}

function outputRecord(bytes: Buffer, observedByteLength = bytes.byteLength) {
  return {
    capturedByteLength: bytes.byteLength,
    observedByteLength,
    sha256: sha256Digest(bytes),
    truncated: observedByteLength > bytes.byteLength,
  } as const;
}

const CREATED_AT = "2026-08-11T12:00:00.000Z";

function writeTerminalArtifacts(
  prepared: PreparedSupervisedRun,
  stdout: Buffer,
  stderr: Buffer = Buffer.alloc(0),
): SupervisedRunReceiptV1 {
  writeFileSync(prepared.paths.stdoutPath, stdout, { mode: 0o600 });
  writeFileSync(prepared.paths.stderrPath, stderr, { mode: 0o600 });
  const receipt = parseSupervisedRunReceipt({
    schemaVersion: 1,
    runKey: prepared.intent.runKey,
    attemptId: prepared.intent.attemptId,
    fence: prepared.intent.fence,
    intentDigest: prepared.intentDigest,
    invocationDigest: prepared.intent.invocationDigest,
    controllerStartedAt: CREATED_AT,
    targetRegisteredAt: CREATED_AT,
    permittedAt: CREATED_AT,
    finishedAt: CREATED_AT,
    identity: {
      schemaVersion: 2,
      attemptId: prepared.intent.attemptId,
      fence: prepared.intent.fence,
      pid: 4_321,
      processStartIdentity: "fake-supervisor-start",
      bootIdentity: "fake-boot",
      processGroupId: 4_321,
      launchedAt: CREATED_AT,
      primaryChild: null,
    },
    process: { exitCode: 0, signal: null },
    terminationOrigin: "natural",
    outcome: "succeeded",
    stdout: outputRecord(stdout),
    stderr: outputRecord(stderr),
  });
  writeFileSync(prepared.paths.receiptPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  return receipt;
}

function terminalLaunch(stdout: Buffer, stderr: Buffer = Buffer.alloc(0)) {
  return vi.fn((prepared: PreparedSupervisedRun): LaunchSupervisedRunResult => ({
    outcome: "already-terminal",
    receipt: writeTerminalArtifacts(prepared, stdout, stderr),
  }));
}

async function makeReviewer(
  fixture: Fixture,
  evidence: Map<Sha256Digest, Buffer>,
  overrides: Readonly<{
    preflight?: (options: PreflightCodexOptions) => Promise<CodexPreflightResult>;
    launch?: (prepared: PreparedSupervisedRun) => LaunchSupervisedRunResult;
    configuration?: CodexIndependentReviewerConfigurationV1;
  }> = {},
) {
  const preflight =
    overrides.preflight ??
    vi.fn(async (options: PreflightCodexOptions): Promise<CodexPreflightResult> => ({
      ready: true,
      executable: options.executable,
      version: VERIFIED_CODEX_CLI_VERSIONS[0],
      authConfigured: true,
    }));
  const dependencies: CodexIndependentReviewerDependencies = {
    preflight,
    sleep: async () => undefined,
    supervisor: overrides.launch === undefined ? {} : { launch: overrides.launch },
  };
  const reviewer = await createCodexIndependentReviewer(
    overrides.configuration ?? fixture.configuration,
    {
      mirror: { mirrorPath: fixture.mirrorPath },
      readEvidence: (digest) => {
        const bytes = evidence.get(digest);
        if (bytes === undefined) throw new Error(`No fixture evidence for ${digest}`);
        return bytes;
      },
    },
    dependencies,
  );
  return { reviewer, preflight };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

// ---------------------------------------------------------------------------

describe("parseCodexReviewReportedResultV1", () => {
  const reviewInputDigest = Sha256DigestSchema.parse(`sha256:${"7".repeat(64)}`);
  const evidenceDigest = Sha256DigestSchema.parse(`sha256:${"8".repeat(64)}`);
  const available = new Set<Sha256Digest>([evidenceDigest]);

  it("parses a passing report with no findings", () => {
    const result = parseCodexReviewReportedResultV1(
      JSON.stringify({ schemaVersion: 1, verdict: "pass", findings: [] }),
      reviewInputDigest,
      available,
    );
    expect(result.verdict).toBe("pass");
    expect(result.findings).toHaveLength(0);
  });

  it("parses a changes-required report and synthesizes a deterministic findingId", () => {
    const rawFinding = {
      ruleId: "review.missing-test",
      category: "quality.correctness",
      severity: "p1",
      title: "No regression test",
      description: "The new export has no covering test.",
      locations: [{ path: "src/app.ts", lineStart: 1, lineEnd: 1 }],
      supportingArtifactDigests: [evidenceDigest],
    };
    const first = parseCodexReviewReportedResultV1(
      JSON.stringify({ schemaVersion: 1, verdict: "changes-required", findings: [rawFinding] }),
      reviewInputDigest,
      available,
    );
    const second = parseCodexReviewReportedResultV1(
      JSON.stringify({ schemaVersion: 1, verdict: "changes-required", findings: [rawFinding] }),
      reviewInputDigest,
      available,
    );
    expect(first.findings).toHaveLength(1);
    expect(first.findings[0]?.findingId).toBe(second.findings[0]?.findingId);
    expect(first.findings[0]?.supportingArtifactDigests).toEqual([evidenceDigest]);
  });

  it("fails closed on malformed JSON", () => {
    expect(() =>
      parseCodexReviewReportedResultV1("{not json", reviewInputDigest, available),
    ).toThrow(TypeError);
  });

  it("fails closed on an oversized message", () => {
    const huge = JSON.stringify({
      schemaVersion: 1,
      verdict: "pass",
      findings: [],
      padding: "x".repeat(2_000_000),
    });
    expect(() => parseCodexReviewReportedResultV1(huge, reviewInputDigest, available)).toThrow(
      /bounded byte limit/,
    );
  });

  it("fails closed on an unexpected top-level field", () => {
    expect(() =>
      parseCodexReviewReportedResultV1(
        JSON.stringify({ schemaVersion: 1, verdict: "pass", findings: [], extra: true }),
        reviewInputDigest,
        available,
      ),
    ).toThrow(TypeError);
  });

  it("fails closed on a fabricated evidence digest", () => {
    const fabricated = Sha256DigestSchema.parse(`sha256:${"9".repeat(64)}`);
    const rawFinding = {
      ruleId: "review.fabricated",
      category: "quality.correctness",
      severity: "p2",
      title: "t",
      description: "d",
      locations: [],
      supportingArtifactDigests: [fabricated],
    };
    expect(() =>
      parseCodexReviewReportedResultV1(
        JSON.stringify({ schemaVersion: 1, verdict: "changes-required", findings: [rawFinding] }),
        reviewInputDigest,
        available,
      ),
    ).toThrow(CodexIndependentReviewerError);
  });

  it("fails closed when pass is paired with a P0/P1 finding", () => {
    const rawFinding = {
      ruleId: "review.blocking",
      category: "quality.correctness",
      severity: "p0",
      title: "t",
      description: "d",
      locations: [],
      supportingArtifactDigests: [],
    };
    expect(() =>
      parseCodexReviewReportedResultV1(
        JSON.stringify({ schemaVersion: 1, verdict: "pass", findings: [rawFinding] }),
        reviewInputDigest,
        available,
      ),
    ).toThrow(/verdict pass alongside/);
  });

  it("fails closed when changes-required has no blocking finding", () => {
    expect(() =>
      parseCodexReviewReportedResultV1(
        JSON.stringify({ schemaVersion: 1, verdict: "changes-required", findings: [] }),
        reviewInputDigest,
        available,
      ),
    ).toThrow(/without a P0 or P1 finding/);
  });

  it("allows a blocked verdict with no findings", () => {
    const result = parseCodexReviewReportedResultV1(
      JSON.stringify({ schemaVersion: 1, verdict: "blocked", findings: [] }),
      reviewInputDigest,
      available,
    );
    expect(result.verdict).toBe("blocked");
  });
});

describe("classifyCodexReviewProcess", () => {
  const reviewInputDigest = Sha256DigestSchema.parse(`sha256:${"7".repeat(64)}`);
  const available = new Set<Sha256Digest>();

  it("classifies a clean completed transcript", () => {
    const stdout = completedReviewTranscript({ verdict: "pass", findings: [] }).toString("utf8");
    const classification = classifyCodexReviewProcess(
      {
        exitCode: 0,
        signal: null,
        terminationOrigin: "none",
        stdout,
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      reviewInputDigest,
      available,
    );
    expect(classification.kind).toBe("process-completed");
  });

  it("classifies a timed-out capture without touching the transcript", () => {
    const classification = classifyCodexReviewProcess(
      {
        exitCode: null,
        signal: "SIGKILL",
        terminationOrigin: "timed-out",
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      reviewInputDigest,
      available,
    );
    expect(classification.kind).toBe("timed-out");
  });

  it("classifies an authentication failure distinctly", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "t" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "turn.failed", error: { message: "401 Unauthorized" } }),
      "",
    ].join("\n");
    const classification = classifyCodexReviewProcess(
      {
        exitCode: 1,
        signal: null,
        terminationOrigin: "none",
        stdout,
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      reviewInputDigest,
      available,
    );
    expect(classification.kind).toBe("blocked-auth");
  });

  it("propagates a review-integrity violation as a thrown error rather than a protocol-error classification", () => {
    const stdout = rawMessageTranscript(
      JSON.stringify({
        schemaVersion: 1,
        verdict: "pass",
        findings: [
          {
            ruleId: "x.y",
            category: "x.y",
            severity: "p0",
            title: "t",
            description: "d",
            locations: [],
            supportingArtifactDigests: [],
          },
        ],
      }),
    ).toString("utf8");
    expect(() =>
      classifyCodexReviewProcess(
        {
          exitCode: 0,
          signal: null,
          terminationOrigin: "none",
          stdout,
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        },
        reviewInputDigest,
        available,
      ),
    ).toThrow(CodexIndependentReviewerError);
  });
});

describe("buildCodexReviewInvocation", () => {
  it("builds a read-only, network-disabled, --output-schema-driven invocation", () => {
    const fixture = makeFixture();
    const invocation = buildCodexReviewInvocation({
      executable: fixture.configuration.executable,
      model: "gpt-5.6-codex",
      codexHome: fixture.configuration.codexHome,
      outputSchemaPath: fixture.configuration.outputSchemaPath,
      workingDirectory: fixture.checkoutRoot,
      instruction: "Review the candidate.",
      environmentAllowlist: ["PATH"],
      sourceEnvironment: { PATH: "/usr/bin:/bin" },
    });
    expect(invocation.executable).toBe(fixture.configuration.executable);
    expect(invocation.cwd).toBe(realpathSync(fixture.checkoutRoot));
    expect(invocation.args).toContain("--output-schema");
    expect(invocation.args).toContain(fixture.configuration.outputSchemaPath);
    expect(invocation.stdin).toBe("Review the candidate.");

    const permissionArg = invocation.args.find((arg) => arg.startsWith("permissions."));
    expect(permissionArg).toBeDefined();
    expect(permissionArg).toContain("network={enabled=false}");
    expect(permissionArg).toContain('":tmpdir"="deny"');
    expect(permissionArg).toContain('":slash_tmp"="deny"');
    expect(permissionArg).not.toMatch(/"write"/);
  });

  it("rejects a relative executable path", () => {
    expect(() =>
      buildCodexReviewInvocation({
        executable: "relative/codex",
        model: "gpt-5.6-codex",
        codexHome: "/tmp/codex-home",
        outputSchemaPath: "/tmp/schema.json",
        workingDirectory: "/tmp/checkout",
        instruction: "Review.",
        environmentAllowlist: [],
      }),
    ).toThrow(TypeError);
  });
});

describe("digestDirectoryTree", () => {
  it("is stable for identical content and changes when a file changes", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "af-digest-")));
    roots.push(root);
    mkdirSync(join(root, "a"), { recursive: true });
    writeFileSync(join(root, "a", "file.txt"), "hello\n");
    const first = digestDirectoryTree(root);
    const second = digestDirectoryTree(root);
    expect(first).toBe(second);

    writeFileSync(join(root, "a", "file.txt"), "hello world\n");
    const third = digestDirectoryTree(root);
    expect(third).not.toBe(first);
  });
});

describe("CodexIndependentReviewer", () => {
  it("exposes the exact protocol-required capability gate", async () => {
    const fixture = makeFixture();
    const { reviewer } = await makeReviewer(fixture, new Map());
    expect(REVIEW_CAPABILITIES).toEqual({
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    });
    const runId = randomUUID();
    const adapter = reviewer.reviewerForRun(runId as never);
    expect(adapter.capabilities).toEqual(REVIEW_CAPABILITIES);
    expect(adapter.reviewerId).toBe(CODEX_REVIEW_ADAPTER_ID);
    expect(adapter.reviewerVersion).toBe(CODEX_REVIEW_ADAPTER_VERSION);
  });

  it("round-trips a passing review through the real protocol verifier and cleans up its checkout", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const runKey = reviewInputDigestRunKey(reviewInput);
    const workspaceRoot = join(fixture.checkoutRoot, runKey);

    const launch = terminalLaunch(completedReviewTranscript({ verdict: "pass", findings: [] }));
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    // The checkout must exist, contain the exact candidate content, and be
    // read-only, at the moment `launch` observes it -- prove this from
    // inside the mock, since afterward the adapter deletes it.
    let sawCandidateDuringRun = false;
    launch.mockImplementationOnce((prepared: PreparedSupervisedRun) => {
      sawCandidateDuringRun = existsSync(join(workspaceRoot, "candidate", "src", "app.ts"));
      expect(readFileSync(join(workspaceRoot, "candidate", "src", "app.ts"), "utf8")).toBe(
        "export const value = 1;\n",
      );
      expect(existsSync(join(workspaceRoot, "evidence", "MANIFEST.json"))).toBe(true);
      return {
        outcome: "already-terminal",
        receipt: writeTerminalArtifacts(
          prepared,
          completedReviewTranscript({ verdict: "pass", findings: [] }),
        ),
      };
    });

    const report = await runIndependentReview(reviewInput, adapter);
    expect(sawCandidateDuringRun).toBe(true);
    expect(report.verdict).toBe("pass");
    expect(report.findings).toHaveLength(0);
    expect(report.reviewInputDigest).toBe(computeReviewInputDigest(reviewInput));
    expect(existsSync(workspaceRoot)).toBe(false);
  });

  it("round-trips a changes-required review citing real supplied evidence", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const citedDigest = digests[0] as Sha256Digest;
    const finding = {
      ruleId: "review.missing-test",
      category: "quality.correctness",
      severity: "p1",
      title: "No regression test",
      description: "The new export has no covering test.",
      locations: [{ path: "src/app.ts", lineStart: 1, lineEnd: 1 }],
      supportingArtifactDigests: [citedDigest],
    };
    const launch = terminalLaunch(
      completedReviewTranscript({ verdict: "changes-required", findings: [finding] }),
    );
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    const report = await runIndependentReview(reviewInput, adapter);
    expect(report.verdict).toBe("changes-required");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.supportingArtifactDigests).toEqual([citedDigest]);
  });

  it("fails closed end-to-end when the model cites an unsupplied evidence digest", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const fabricated = Sha256DigestSchema.parse(`sha256:${"f".repeat(64)}`);
    const finding = {
      ruleId: "review.fabricated",
      category: "quality.correctness",
      severity: "p1",
      title: "t",
      description: "d",
      locations: [],
      supportingArtifactDigests: [fabricated],
    };
    const launch = terminalLaunch(
      completedReviewTranscript({ verdict: "changes-required", findings: [finding] }),
    );
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    await expect(runIndependentReview(reviewInput, adapter)).rejects.toThrow();
  });

  it("fails closed end-to-end on a pass verdict paired with a P0 finding", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const finding = {
      ruleId: "review.blocking",
      category: "quality.correctness",
      severity: "p0",
      title: "t",
      description: "d",
      locations: [],
      supportingArtifactDigests: [],
    };
    const launch = terminalLaunch(
      completedReviewTranscript({ verdict: "pass", findings: [finding] }),
    );
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    await expect(runIndependentReview(reviewInput, adapter)).rejects.toThrow();
  });

  it("fails closed when a write to the read-only checkout is detected, regardless of the reported verdict", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const runKey = reviewInputDigestRunKey(reviewInput);
    const workspaceRoot = join(fixture.checkoutRoot, runKey);

    const launch = vi.fn((prepared: PreparedSupervisedRun): LaunchSupervisedRunResult => {
      const candidateFile = join(workspaceRoot, "candidate", "src", "app.ts");
      chmodSync(candidateFile, 0o600);
      writeFileSync(candidateFile, "mutated by a would-be sandbox escape\n");
      chmodSync(candidateFile, 0o400);
      return {
        outcome: "already-terminal",
        receipt: writeTerminalArtifacts(
          prepared,
          completedReviewTranscript({ verdict: "pass", findings: [] }),
        ),
      };
    });
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    await expect(runIndependentReview(reviewInput, adapter)).rejects.toThrow(/write/i);
    expect(existsSync(workspaceRoot)).toBe(false);
  });

  it("refuses to let a run review itself even if called directly", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const launch = terminalLaunch(completedReviewTranscript({ verdict: "pass", findings: [] }));
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    await expect(
      adapter.review({
        reviewInputDigest: computeReviewInputDigest(reviewInput),
        input: { ...reviewInput, implementingRunId: reviewInput.reviewerRunId },
      }),
    ).rejects.toThrow(/review itself/);
  });

  it("fails closed when the pinned executable changes after preflight", async () => {
    const fixture = makeFixture();
    const { map, digests } = makeEvidence();
    const reviewInput = makeReviewInput(fixture, digests);
    const launch = terminalLaunch(completedReviewTranscript({ verdict: "pass", findings: [] }));
    const { reviewer } = await makeReviewer(fixture, map, { launch });
    const adapter = reviewer.reviewerForRun(reviewInput.reviewerRunId);

    writeFileSync(
      fixture.configuration.executable,
      "fake Codex executable: mutated after preflight\n",
      {
        mode: 0o700,
      },
    );

    await expect(runIndependentReview(reviewInput, adapter)).rejects.toThrow(/executable changed/);
  });

  it("rejects construction when preflight fails", async () => {
    const fixture = makeFixture();
    const preflight = vi.fn(async (): Promise<CodexPreflightResult> => ({
      ready: false,
      reason: "authentication",
      summary: "not logged in",
      version: VERIFIED_CODEX_CLI_VERSIONS[0],
    }));
    await expect(makeReviewer(fixture, new Map(), { preflight })).rejects.toThrow(
      CodexIndependentReviewerConfigurationError,
    );
  });

  it("rejects a configuration whose output schema file does not match the adapter-owned schema", async () => {
    const fixture = makeFixture();
    writeFileSync(fixture.configuration.outputSchemaPath, "{}\n", { mode: 0o600 });
    await expect(makeReviewer(fixture, new Map())).rejects.toThrow(
      CodexIndependentReviewerConfigurationError,
    );
  });

  it("rejects a configuration with an unknown field", async () => {
    const fixture = makeFixture();
    await expect(
      makeReviewer(fixture, new Map(), {
        configuration: {
          ...fixture.configuration,
          unknownField: true,
        } as unknown as CodexIndependentReviewerConfigurationV1,
      }),
    ).rejects.toThrow(CodexIndependentReviewerConfigurationError);
  });

  it("rejects a checkout root nested inside the runner root, in either direction", async () => {
    const fixture = makeFixture();
    // Regression test: an earlier version of pathsOverlap only checked one
    // direction (is `right` inside `left`), so a `checkoutRoot` that is an
    // *ancestor* of `runnerRoot` slipped through undetected. Both directions
    // must be rejected.
    const nestedCheckoutRoot = join(fixture.configuration.runnerRoot, "nested-checkouts");
    mkdirSync(nestedCheckoutRoot, { recursive: true, mode: 0o700 });
    await expect(
      makeReviewer(fixture, new Map(), {
        configuration: { ...fixture.configuration, checkoutRoot: nestedCheckoutRoot },
      }),
    ).rejects.toThrow(CodexIndependentReviewerConfigurationError);

    const ancestorCheckoutRoot = fixture.root;
    await expect(
      makeReviewer(fixture, new Map(), {
        configuration: { ...fixture.configuration, checkoutRoot: ancestorCheckoutRoot },
      }),
    ).rejects.toThrow(CodexIndependentReviewerConfigurationError);
  });
});
