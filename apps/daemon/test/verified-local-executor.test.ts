import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  NamespacedCodeSchema,
  TaskSpecV1Schema,
  type AgentRunResultV1,
  type RunId,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  canonicalJsonBytes,
  FileExecutionCheckpointStore,
  VERIFICATION_SCRATCH_TOKEN,
  sha256Digest,
  verifyExecutionEvidenceIndex,
} from "@app-factory/execution-engine";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import type { IndependentReviewAdapter } from "@app-factory/independent-review";
import {
  createSupervisedRunIntent,
  digestSupervisedRunIntent,
  parseSupervisedRunIntent,
} from "@app-factory/process-supervisor";
import {
  canonicalJsonLine as canonicalOciJsonLine,
  labelsForOciRun,
  parseOciRunIntent,
  prepareOciRun,
  type OciContainerInspection,
  type OciEnginePort,
  type OciImageIdentityV1,
  type OciLogCapture,
  type OciRunIntentV1,
} from "@app-factory/oci-runner";
import type { SchedulerClockPort } from "@app-factory/scheduler";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandClient,
  type CommandClient,
} from "../../../packages/command-client/src/index.js";
import {
  MAX_REVIEWED_POLICY_BYTES,
  OciLocalAgent,
  RetryableExecutionManifestPublicationError,
  commitVerifiedExecutionManifest,
  computeTaskSemanticProfileDigest,
  decodeReviewedPolicyPayload,
  reconcileAgentResultPublicationLinks,
  startFactoryDaemonService,
  taskMatchesEnrolledProjectBase,
  type FactoryDaemonService,
  type LocalAgentAdapter,
  type LocalAgentProtocolEvidenceV1,
  type LocalOciAgentProtocolEvidenceV1,
  type LocalAgentRunContext,
  type LocalAgentRunOutcome,
  type VerifiedLocalExecutionProject,
  type VerifiedLocalExecutionConfiguration,
} from "../src/index.js";

const GIT = "/usr/bin/git";
const SWIFT = "/usr/bin/swift";
const GREP = "/usr/bin/grep";
const AUTHORIZATION = "verified-local-execution-test-token-0001";
const REPOSITORY_ID = "62000000-0000-4000-8000-000000000002";
const POLICY_TEXT = [
  "App Factory reviewed Swift Greeter policy v1",
  "Only Sources/Greeter/GreetingFormatter.swift may change.",
  "Tests, package configuration, Git metadata, and release files are protected.",
  "The coding agent must not commit, stage, push, use credentials, or access a network.",
  "",
].join("\n");
const EXPECTED_GREETER_SOURCE = [
  "public struct GreetingFormatter: Sendable {",
  "    public init() {}",
  "",
  "    public func greeting(for name: String) -> String {",
  '        "Hello, \\(name)!"',
  "    }",
  "",
  "    public func farewell(for name: String) -> String {",
  '        "Goodbye, \\(name)!"',
  "    }",
  "}",
  "",
].join("\n");
const TEMPLATE_ROOT = fileURLToPath(new URL("../../../fixtures/swift-greeter/", import.meta.url));
const roots: string[] = [];
const services: FactoryDaemonService[] = [];
const clients: CommandClient[] = [];

type Fixture = Readonly<{
  root: string;
  runtime: string;
  source: string;
  baseCommit: string;
  baseTree: string;
  policyBytes: Buffer;
  policyDigest: `sha256:${string}`;
  taskSpec: TaskSpecV1;
}>;

function gitRaw(cwd: string, args: readonly string[], allowed = [0]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_AUTHOR_EMAIL: "fixture@app-factory.invalid",
      GIT_AUTHOR_NAME: "App Factory Fixture",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_EMAIL: "fixture@app-factory.invalid",
      GIT_COMMITTER_NAME: "App Factory Fixture",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    },
    shell: false,
  });
  if (!allowed.includes(result.status ?? -1)) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function git(cwd: string, args: readonly string[], allowed = [0]): string {
  return gitRaw(cwd, args, allowed).trim();
}

function digestFile(path: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function fixture(taskSuffix: number): Fixture {
  // Keep the Unix-domain command socket below macOS' 104-byte path limit.
  const root = realpathSync(mkdtempSync("/private/tmp/af-vle-"));
  roots.push(root);
  const source = join(root, "swift-greeter");
  const runtime = join(root, "runtime");
  cpSync(TEMPLATE_ROOT, source, { recursive: true });
  git(source, ["init", "--quiet", "--initial-branch=main", "--object-format=sha1"]);
  git(source, ["add", "--all"]);
  git(source, [
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "--no-verify",
    "--message=Create deterministic Swift Greeter baseline",
  ]);
  const baseCommit = git(source, ["rev-parse", "HEAD"]);
  const baseTree = git(source, ["rev-parse", "HEAD^{tree}"]);
  const policyBytes = Buffer.from(POLICY_TEXT, "utf8");
  const policyDigest = sha256Digest(policyBytes);
  const taskSpec = TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: `62000000-0000-4000-8000-${String(taskSuffix).padStart(12, "0")}`,
    projectId: "62000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-11T00:00:00.000Z",
    title: "Add a farewell to GreetingFormatter",
    objective:
      "Add a public farewell(for:) method that returns `Goodbye, <name>!` without changing greeting behavior.",
    acceptanceCriteria: [
      {
        id: "returns-farewell",
        statement: 'farewell(for: "Factory") returns "Goodbye, Factory!".',
        verification: "automated",
      },
      {
        id: "preserves-greeting",
        statement: "Existing greeting tests continue to pass.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: baseCommit },
    requestedScope: { paths: ["Sources/Greeter/GreetingFormatter.swift"] },
    policyDigest,
  });
  return {
    root,
    runtime,
    source,
    baseCommit,
    baseTree,
    policyBytes,
    policyDigest,
    taskSpec,
  };
}

function exactGreeterReviewer(
  f: Fixture,
  reviewerRunId: RunId,
  calls: { count: number },
): IndependentReviewAdapter {
  const mirrorPath = join(f.runtime, "local-execution", "git", "mirrors", `${REPOSITORY_ID}.git`);
  return {
    reviewerId: "review.swift-greeter-exact-source",
    reviewerVersion: "1.0.0",
    reviewerRunId,
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
    review: ({ reviewInputDigest, input }) => {
      calls.count += 1;
      let actualSource: string | null = null;
      try {
        actualSource = gitRaw(f.root, [
          "--git-dir",
          mirrorPath,
          "show",
          `${input.candidateTree}:Sources/Greeter/GreetingFormatter.swift`,
        ]);
      } catch {
        // An unreadable candidate blob is a review failure, never a pass.
      }
      const exactMatch = actualSource === EXPECTED_GREETER_SOURCE;
      const supportingDigest = input.rawEvidenceDigests.at(0);
      if (supportingDigest === undefined) {
        throw new Error("The fixture reviewer requires bound raw evidence");
      }
      return {
        schemaVersion: 1,
        reviewerId: "review.swift-greeter-exact-source",
        reviewerVersion: "1.0.0",
        reviewInputDigest,
        verdict: exactMatch ? "pass" : "changes-required",
        findings: exactMatch
          ? []
          : [
              {
                schemaVersion: 1,
                findingId: "62000000-0000-4000-8000-000000000901",
                ruleId: "fixture.greeter-exact-source",
                category: "quality.correctness",
                severity: "p1",
                title: "Greeter implementation differs from the reviewed fixture result",
                description:
                  "The read-only reviewer loaded the candidate blob from the Factory mirror and it did not exactly match the reviewed Swift Greeter implementation.",
                locations: [
                  {
                    path: "Sources/Greeter/GreetingFormatter.swift",
                    lineStart: null,
                    lineEnd: null,
                  },
                ],
                supportingArtifactDigests: [supportingDigest],
              },
            ],
      };
    },
  };
}

class DeterministicSwiftAgent implements LocalAgentAdapter {
  public readonly adapterId = "agent.deterministic-process";
  public readonly adapterVersion = "1.0.0";
  public calls = 0;
  public readonly observedFences: number[] = [];
  public readonly instructions: string[] = [];
  readonly #mode: "succeed" | "interrupt" | "protected-edit" | "wrong-result";
  readonly #started: Promise<void>;
  #markStarted: (() => void) | undefined;
  readonly #aborted: Promise<void>;
  #markAborted: (() => void) | undefined;

  public constructor(mode: "succeed" | "interrupt" | "protected-edit" | "wrong-result") {
    this.#mode = mode;
    this.#started = new Promise((resolvePromise) => {
      this.#markStarted = resolvePromise;
    });
    this.#aborted = new Promise((resolvePromise) => {
      this.#markAborted = resolvePromise;
    });
  }

  public async started(): Promise<void> {
    await this.#started;
  }

  public async aborted(): Promise<void> {
    await this.#aborted;
  }

  public async run(context: LocalAgentRunContext) {
    this.calls += 1;
    this.observedFences.push(context.spec.fence);
    this.instructions.push(context.spec.instruction);
    await context.assertActive();
    const source = join(context.spec.workingDirectory, "Sources/Greeter/GreetingFormatter.swift");
    writeFileSync(
      source,
      this.#mode === "wrong-result"
        ? EXPECTED_GREETER_SOURCE.replace("Goodbye,", "See you,")
        : EXPECTED_GREETER_SOURCE,
    );
    if (this.#mode === "protected-edit") {
      writeFileSync(
        join(context.spec.workingDirectory, "Tests/GreeterTests/GreetingFormatterTests.swift"),
        "// weakened by an untrusted coding run\n",
      );
    }
    this.#markStarted?.();
    if (this.#mode === "interrupt") {
      await new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          this.#markAborted?.();
          reject(new Error("deterministic agent interrupted"));
        };
        if (context.signal.aborted) abort();
        else context.signal.addEventListener("abort", abort, { once: true });
      });
    }
    await context.assertActive();
    return {
      kind: "succeeded" as const,
      summary: "Implemented the deterministic Swift Greeter change.",
      changedPaths:
        this.#mode === "protected-edit"
          ? [
              "Sources/Greeter/GreetingFormatter.swift",
              "Tests/GreeterTests/GreetingFormatterTests.swift",
            ]
          : ["Sources/Greeter/GreetingFormatter.swift"],
    };
  }
}

type ProtocolMutation =
  | "none"
  | "missing-protocol-envelope"
  | "run-spec-binding"
  | "result-binding"
  | "event-terminal"
  | "final-sequence"
  | "stdout-metadata"
  | "descriptor-binding"
  | "descriptor-identity"
  | "receipt-binding"
  | "receipt-output-invariant"
  | "intent-binding"
  | "intent-canonical"
  | "descriptor-environment"
  | "stdout-limit"
  | "stderr-limit"
  | "failure-detail-artifact"
  | "unknown-outcome-kind"
  | "envelope-shape"
  | "outcome-status"
  | "reported-failure"
  | "turn-limit-exceeded"
  | "auth-blocker";

function protocolResult(
  context: LocalAgentRunContext,
  status: "succeeded" | "failed" | "blocked" = "succeeded",
  processExitCode = status === "succeeded" || status === "blocked" ? 0 : 1,
  mutation: ProtocolMutation = "none",
  additionalProgressEvents = 0,
): Readonly<{
  evidence: LocalAgentProtocolEvidenceV1;
  failure: NonNullable<Extract<AgentRunResultV1, { status: "failed" }>["failure"]>;
  blocker: NonNullable<Extract<AgentRunResultV1, { status: "blocked" }>["blocker"]>;
}> {
  const startedAt = "2026-08-11T12:00:00.000Z";
  const finishedAt = "2026-08-11T12:00:00.001Z";
  const stdout =
    mutation === "stderr-limit"
      ? Buffer.from("ok\n", "utf8")
      : Buffer.from('{"type":"turn.completed"}\n', "utf8");
  const stderr =
    mutation === "stderr-limit"
      ? Buffer.from("stderr exceeds twenty bytes\n", "utf8")
      : Buffer.from("codex diagnostic\n", "utf8");
  const failure = {
    code:
      mutation === "turn-limit-exceeded"
        ? ("agent.turn-limit-exceeded" as const)
        : ("agent.process-failed" as const),
    summary:
      mutation === "turn-limit-exceeded"
        ? "Codex exceeded its configured turn limit."
        : "The supervised agent process failed.",
    retryable: false,
    detailArtifactDigest:
      mutation === "failure-detail-artifact"
        ? sha256Digest(Buffer.from("unpublished failure detail", "utf8"))
        : null,
  };
  const blocker = {
    kind: "authentication" as const,
    code: "agent.authentication-required" as const,
    summary: "The supervised agent requires authentication.",
    requiredAction: "Refresh the local Codex login, then submit a new attempt.",
  };
  // A well-formed multi-turn event log stays a single contiguous run: exactly
  // one agent.started, exactly one agent.finished, and one agent.progress
  // event per completed turn in between.
  const progressEventDrafts = Array.from(
    { length: additionalProgressEvents },
    (_unused, index) => ({
      schemaVersion: 1 as const,
      eventId: `63000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
      runId: context.spec.runId,
      attemptId: context.spec.attemptId,
      stepId: context.spec.stepId,
      fence: context.spec.fence,
      occurredAt: startedAt,
      type: "agent.progress" as const,
      data: {
        phase: NamespacedCodeSchema.parse("codex.turn-completed"),
        level: "info" as const,
        message: `Completed turn ${String(index + 1)}.`,
      },
    }),
  );
  const eventDrafts = [
    {
      schemaVersion: 1 as const,
      eventId: "63000000-0000-4000-8000-000000000001",
      runId: context.spec.runId,
      attemptId: context.spec.attemptId,
      stepId: context.spec.stepId,
      fence: context.spec.fence,
      occurredAt: startedAt,
      type: "agent.started" as const,
      data: { adapterId: context.spec.adapterId },
    },
    ...progressEventDrafts,
    ...(status === "blocked"
      ? [
          {
            schemaVersion: 1 as const,
            eventId: "63000000-0000-4000-8000-000000000003",
            runId: context.spec.runId,
            attemptId: context.spec.attemptId,
            stepId: context.spec.stepId,
            fence: context.spec.fence,
            occurredAt: finishedAt,
            type: "agent.blocked" as const,
            data: { blocker },
          },
        ]
      : []),
    {
      schemaVersion: 1 as const,
      eventId: "63000000-0000-4000-8000-000000000002",
      runId: context.spec.runId,
      attemptId: context.spec.attemptId,
      stepId: context.spec.stepId,
      fence: context.spec.fence,
      occurredAt: finishedAt,
      type: "agent.finished" as const,
      data: { status },
    },
  ];
  const events = eventDrafts.map((draft, index) =>
    AgentEventV1Schema.parse({ ...draft, sequence: index + 1 }),
  );
  const result = AgentRunResultV1Schema.parse({
    schemaVersion: 1,
    runId: context.spec.runId,
    attemptId: context.spec.attemptId,
    stepId: context.spec.stepId,
    fence: context.spec.fence,
    startedAt,
    finishedAt,
    finalEventSequence: events.length,
    stdout: { digest: sha256Digest(stdout), byteLength: stdout.byteLength, truncated: false },
    stderr: { digest: sha256Digest(stderr), byteLength: stderr.byteLength, truncated: false },
    usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
    process: { exitCode: processExitCode, signal: null },
    status,
    failure: status === "failed" ? failure : null,
    blocker: status === "blocked" ? blocker : null,
  });
  const supervisorRunKey = `run-${context.spec.runId}`;
  const supervisorIntent = createSupervisedRunIntent({
    runKey: supervisorRunKey,
    attemptId: context.spec.attemptId,
    fence: context.spec.fence,
    createdAt: "2026-08-11T11:59:59.996Z",
    executable: "/Users/pchordia/.local/bin/codex",
    argv: ["exec", "--json"],
    cwd: context.spec.workingDirectory,
    environment: { CODEX_HOME: "/private/tmp/codex-home", LANG: "C", PATH: "/usr/bin:/bin" },
    stdin: Buffer.from(context.spec.instruction, "utf8"),
    limits: {
      timeoutMs: context.spec.limits.timeoutMs,
      graceMs: context.spec.limits.terminationGraceMs,
      forceWaitMs: context.spec.limits.terminationGraceMs,
      pollMs: 25,
      maxOutputBytesPerStream: context.spec.limits.maxStdoutBytes,
    },
  });
  const supervisorIntentDigest = sha256Digest(
    Buffer.from(`${JSON.stringify(supervisorIntent)}\n`, "utf8"),
  );
  expect(supervisorIntentDigest).toBe(digestSupervisedRunIntent(supervisorIntent));
  const supervisorInvocationDigest = supervisorIntent.invocationDigest;
  const invocationDescriptor = canonicalJsonBytes({
    schemaVersion: 1,
    adapterId: context.spec.adapterId,
    adapterVersion: "1.0.0",
    cliVersion: "0.147.0-alpha.1.2",
    model: "gpt-5.6-codex",
    executable: "/Users/pchordia/.local/bin/codex",
    executableDigest: sha256Digest(Buffer.from("codex executable fixture", "utf8")),
    argv: ["exec", "--json"],
    workingDirectory: context.spec.workingDirectory,
    environmentNames: ["CODEX_HOME", "LANG", "PATH"],
    environmentProjectionDigest: sha256Digest(
      canonicalJsonBytes(supervisorIntent.environment.map(({ name, value }) => [name, value])),
    ),
    stdinDigest: sha256Digest(Buffer.from(context.spec.instruction, "utf8")),
    supervisorRunKey,
    supervisorIntentDigest,
    supervisorInvocationDigest,
  });
  const supervisorReceipt = {
    schemaVersion: 1,
    runKey: supervisorRunKey,
    attemptId: context.spec.attemptId,
    fence: context.spec.fence,
    intentDigest: supervisorIntentDigest,
    invocationDigest: supervisorInvocationDigest,
    controllerStartedAt: "2026-08-11T11:59:59.997Z",
    targetRegisteredAt: "2026-08-11T11:59:59.998Z",
    permittedAt: startedAt,
    finishedAt,
    identity: {
      schemaVersion: 2,
      attemptId: context.spec.attemptId,
      fence: context.spec.fence,
      pid: 41001,
      processStartIdentity: "test-process-start-identity",
      bootIdentity: "test-boot-identity",
      processGroupId: 41001,
      launchedAt: "2026-08-11T11:59:59.997Z",
      primaryChild: null,
    },
    process: { exitCode: processExitCode, signal: null },
    terminationOrigin: "natural",
    outcome: processExitCode === 0 ? "succeeded" : "failed",
    stdout: {
      capturedByteLength: stdout.byteLength,
      observedByteLength: stdout.byteLength,
      sha256: sha256Digest(stdout),
      truncated: false,
    },
    stderr: {
      capturedByteLength: stderr.byteLength,
      observedByteLength: stderr.byteLength,
      sha256: sha256Digest(stderr),
      truncated: false,
    },
  } as const;
  return {
    failure,
    blocker,
    evidence: {
      schemaVersion: 1,
      runSpec: context.spec,
      result,
      events,
      stdout,
      stderr,
      invocationDescriptor,
      supervisorIntent: Buffer.from(`${JSON.stringify(supervisorIntent)}\n`, "utf8"),
      supervisorReceipt: Buffer.from(`${JSON.stringify(supervisorReceipt)}\n`, "utf8"),
    },
  };
}

class ProtocolSwiftAgent implements LocalAgentAdapter {
  public readonly adapterId = "agent.supervised-protocol";
  public readonly adapterVersion = "1.0.0";
  public calls = 0;
  readonly #mutation: ProtocolMutation;
  readonly #additionalProgressEvents: number;

  public constructor(mutation: ProtocolMutation = "none", additionalProgressEvents = 0) {
    this.#mutation = mutation;
    this.#additionalProgressEvents = additionalProgressEvents;
  }

  public async run(context: LocalAgentRunContext) {
    this.calls += 1;
    await context.assertActive();
    writeFileSync(
      join(context.spec.workingDirectory, "Sources/Greeter/GreetingFormatter.swift"),
      EXPECTED_GREETER_SOURCE,
    );
    const status =
      this.#mutation === "outcome-status" ||
      this.#mutation === "reported-failure" ||
      this.#mutation === "turn-limit-exceeded" ||
      this.#mutation === "failure-detail-artifact"
        ? "failed"
        : this.#mutation === "auth-blocker"
          ? "blocked"
          : "succeeded";
    const materialized = protocolResult(
      context,
      status,
      this.#mutation === "reported-failure" ? 0 : this.#mutation === "auth-blocker" ? 1 : undefined,
      this.#mutation,
      this.#additionalProgressEvents,
    );
    let evidence: unknown = materialized.evidence;
    if (this.#mutation === "run-spec-binding") {
      evidence = {
        ...materialized.evidence,
        runSpec: { ...materialized.evidence.runSpec, fence: context.spec.fence + 1 },
      };
    } else if (this.#mutation === "result-binding") {
      evidence = {
        ...materialized.evidence,
        result: {
          ...materialized.evidence.result,
          attemptId: "63000000-0000-4000-8000-000000000099",
        },
      };
    } else if (this.#mutation === "event-terminal") {
      evidence = {
        ...materialized.evidence,
        events: materialized.evidence.events.map((event, index) =>
          index === materialized.evidence.events.length - 1 && event.type === "agent.finished"
            ? { ...event, data: { status: "failed" } }
            : event,
        ),
      };
    } else if (this.#mutation === "final-sequence") {
      evidence = {
        ...materialized.evidence,
        result: {
          ...materialized.evidence.result,
          finalEventSequence: materialized.evidence.result.finalEventSequence + 1,
        },
      };
    } else if (this.#mutation === "stdout-metadata") {
      evidence = {
        ...materialized.evidence,
        stdout: Buffer.from("different captured bytes\n", "utf8"),
      };
    } else if (this.#mutation === "descriptor-binding") {
      const descriptor = JSON.parse(
        Buffer.from(materialized.evidence.invocationDescriptor).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        invocationDescriptor: canonicalJsonBytes({
          ...descriptor,
          workingDirectory: "/private/tmp/different-worktree",
        }),
      };
    } else if (this.#mutation === "descriptor-identity") {
      const descriptor = JSON.parse(
        Buffer.from(materialized.evidence.invocationDescriptor).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        invocationDescriptor: canonicalJsonBytes({
          ...descriptor,
          model: "untrusted-unenrolled-model",
        }),
      };
    } else if (this.#mutation === "receipt-binding") {
      const receipt = JSON.parse(
        Buffer.from(materialized.evidence.supervisorReceipt).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        supervisorReceipt: Buffer.from(
          `${JSON.stringify({
            ...receipt,
            invocationDigest: sha256Digest(Buffer.from("different invocation", "utf8")),
          })}\n`,
          "utf8",
        ),
      };
    } else if (this.#mutation === "receipt-output-invariant") {
      const receipt = JSON.parse(
        Buffer.from(materialized.evidence.supervisorReceipt).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      const receiptStdout = receipt.stdout as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        supervisorReceipt: Buffer.from(
          `${JSON.stringify({
            ...receipt,
            stdout: {
              ...receiptStdout,
              observedByteLength: (receiptStdout.capturedByteLength as number) + 1,
              truncated: false,
            },
          })}\n`,
          "utf8",
        ),
      };
    } else if (this.#mutation === "intent-binding") {
      const intent = JSON.parse(
        Buffer.from(materialized.evidence.supervisorIntent).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        supervisorIntent: Buffer.from(
          `${JSON.stringify({ ...intent, cwd: "/private/tmp/different-worktree" })}\n`,
          "utf8",
        ),
      };
    } else if (this.#mutation === "intent-canonical") {
      evidence = {
        ...materialized.evidence,
        supervisorIntent: Buffer.concat([
          Buffer.from(materialized.evidence.supervisorIntent),
          Buffer.from(" ", "utf8"),
        ]),
      };
    } else if (this.#mutation === "descriptor-environment") {
      const descriptor = JSON.parse(
        Buffer.from(materialized.evidence.invocationDescriptor).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      evidence = {
        ...materialized.evidence,
        invocationDescriptor: canonicalJsonBytes({
          ...descriptor,
          environmentNames: ["CODEX_HOME", "PATH"],
        }),
      };
    } else if (this.#mutation === "envelope-shape") {
      evidence = { ...materialized.evidence, unexpected: true };
    }
    await context.assertActive();
    const succeeded = {
      kind: "succeeded" as const,
      summary: "Implemented the protocol-backed Swift Greeter change.",
      changedPaths: ["Sources/Greeter/GreetingFormatter.swift"],
      protocolEvidence: evidence as LocalAgentProtocolEvidenceV1,
    };
    if (this.#mutation === "missing-protocol-envelope") {
      return {
        kind: succeeded.kind,
        summary: succeeded.summary,
        changedPaths: succeeded.changedPaths,
      };
    }
    if (
      this.#mutation === "reported-failure" ||
      this.#mutation === "turn-limit-exceeded" ||
      this.#mutation === "failure-detail-artifact"
    ) {
      return {
        kind: "failed" as const,
        failure: materialized.failure,
        protocolEvidence: evidence as LocalAgentProtocolEvidenceV1,
      };
    }
    if (this.#mutation === "unknown-outcome-kind") {
      return {
        kind: "unsupported-at-runtime",
        protocolEvidence: evidence as LocalAgentProtocolEvidenceV1,
      } as unknown as LocalAgentRunOutcome;
    }
    if (this.#mutation === "auth-blocker") {
      return {
        kind: "needs-input" as const,
        blocker: materialized.blocker,
        protocolEvidence: evidence as LocalAgentProtocolEvidenceV1,
      };
    }
    return succeeded;
  }
}

const OCI_TEST_CONTAINER_ID = "a".repeat(64);
const OCI_TEST_IMAGE_ID = `sha256:${"b".repeat(64)}`;
const OCI_TEST_IMAGE_REFERENCE = `factory/codex@sha256:${"c".repeat(64)}`;
const OCI_TEST_ENGINE_ID = `sha256:${"d".repeat(64)}`;

function ociInspection(
  intent: OciRunIntentV1,
  status: "created" | "running" | "terminal",
): OciContainerInspection {
  return {
    containerId: OCI_TEST_CONTAINER_ID,
    name: intent.containerName,
    imageId: intent.image.imageId,
    labels: labelsForOciRun(intent),
    user: "10001:10001",
    command: [intent.agentExecutable, ...intent.agentArguments],
    entrypoint: null,
    workingDirectory: "/workspace",
    environment: intent.environment.map(({ name, value }) => `${name}=${value}`),
    status,
    createdAt: intent.createdAt,
    startedAt: status === "created" ? null : intent.createdAt,
    finishedAt: status === "terminal" ? intent.createdAt : null,
    exitCode: status === "terminal" ? 0 : null,
    oomKilled: false,
    running: status === "running",
    readOnlyRootFilesystem: true,
    networkMode: "none",
    capDrop: ["ALL"],
    securityOptions: ["no-new-privileges=true"],
    memoryBytes: intent.limits.memoryBytes,
    memorySwapBytes: intent.limits.memoryBytes,
    pidLimit: intent.limits.pidLimit,
    cpuNanoCount: intent.limits.cpuCount * 1_000_000_000,
    stopTimeoutSeconds: Math.ceil(intent.limits.stopGraceMs / 1_000),
    privileged: false,
    tmpfs: {
      "/run/app-factory": `rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    },
    logDriver: "local",
    logOptions: {
      "max-size": `${String(intent.limits.outputBytesPerStream)}b`,
      "max-file": "1",
      compress: "false",
    },
    mounts: [
      {
        type: "bind",
        source: intent.worktreeHostPath,
        destination: "/workspace",
        readWrite: true,
      },
    ],
  };
}

class ExecutorOciEngine implements OciEnginePort {
  public readonly engineIdentityDigest = OCI_TEST_ENGINE_ID;
  public inspection: OciContainerInspection | null = null;
  public intent: OciRunIntentV1 | null = null;
  public creates = 0;
  public starts = 0;
  public removals = 0;
  public observations = 0;

  public async observeEngineIdentityDigest(): Promise<string> {
    this.observations += 1;
    return this.engineIdentityDigest;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    if (image.imageId !== OCI_TEST_IMAGE_ID || image.reference !== OCI_TEST_IMAGE_REFERENCE) {
      throw new Error("Unexpected OCI test image");
    }
  }

  public async findByLabels(): Promise<OciContainerInspection | null> {
    return this.inspection;
  }

  public async create(intent: OciRunIntentV1): Promise<string> {
    this.creates += 1;
    this.intent = intent;
    this.inspection = ociInspection(intent, "created");
    return OCI_TEST_CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (containerId !== OCI_TEST_CONTAINER_ID) throw new Error("Unexpected OCI container");
    return this.inspection;
  }

  public async start(containerId: string): Promise<void> {
    if (containerId !== OCI_TEST_CONTAINER_ID || this.intent === null) {
      throw new Error("Unexpected OCI start");
    }
    this.starts += 1;
    writeFileSync(
      join(this.intent.worktreeHostPath, "Sources/Greeter/GreetingFormatter.swift"),
      EXPECTED_GREETER_SOURCE,
    );
    this.inspection = ociInspection(this.intent, "running");
  }

  public async logs(): Promise<OciLogCapture> {
    const stdout = Buffer.from('{"type":"turn.completed"}\n', "utf8");
    const stderr = Buffer.from("oci diagnostic\n", "utf8");
    return {
      stdout,
      stderr,
      stdoutObservedBytes: stdout.byteLength,
      stderrObservedBytes: stderr.byteLength,
    };
  }

  public async stop(): Promise<void> {
    this.finish();
  }

  public async kill(): Promise<void> {
    this.finish();
  }

  public async remove(): Promise<void> {
    this.removals += 1;
    this.inspection = null;
  }

  public finish(): void {
    if (this.intent === null) throw new Error("OCI test run was not created");
    this.inspection = ociInspection(this.intent, "terminal");
  }
}

type OciEvidenceMutation =
  "none" | "schema-downgrade" | "missing-ref" | "reordered-ref" | "run-key-convention";

function mutateOciEvidence(
  evidence: LocalOciAgentProtocolEvidenceV1,
  mutation: Exclude<OciEvidenceMutation, "none">,
): LocalOciAgentProtocolEvidenceV1 {
  if (mutation === "schema-downgrade") {
    return { ...evidence, schemaVersion: 1 } as unknown as LocalOciAgentProtocolEvidenceV1;
  }
  const artifacts = evidence.ociEvidenceClosure.artifacts.map((artifact) => ({
    ...artifact,
    bytes: Buffer.from(artifact.bytes),
  }));
  const references = evidence.ociEvidenceClosure.envelope.artifacts.map((artifact) => ({
    ...artifact,
  }));
  if (mutation === "run-key-convention") {
    const envelope = {
      ...evidence.ociEvidenceClosure.envelope,
      runKey: `alternate-${evidence.runSpec.runId}`,
      artifacts: references,
    };
    const envelopeBytes = canonicalOciJsonLine(envelope);
    return {
      ...evidence,
      ociEvidenceClosure: {
        envelope,
        envelopeBytes,
        envelopeDigest: sha256Digest(envelopeBytes),
        artifacts,
      },
    };
  }
  if (mutation === "missing-ref") {
    artifacts.splice(1, 1);
    references.splice(1, 1);
  } else {
    [artifacts[1], artifacts[2]] = [
      artifacts[2] as (typeof artifacts)[number],
      artifacts[1] as (typeof artifacts)[number],
    ];
    [references[1], references[2]] = [
      references[2] as (typeof references)[number],
      references[1] as (typeof references)[number],
    ];
  }
  const envelope = { ...evidence.ociEvidenceClosure.envelope, artifacts: references };
  const envelopeBytes = canonicalOciJsonLine(envelope);
  return {
    ...evidence,
    ociEvidenceClosure: {
      envelope,
      envelopeBytes,
      envelopeDigest: sha256Digest(envelopeBytes),
      artifacts,
    },
  };
}

class CountingOciAgent implements LocalAgentAdapter {
  public readonly adapterId: string;
  public readonly adapterVersion: string;
  public calls = 0;

  public constructor(
    private readonly delegate: OciLocalAgent,
    private readonly mutation: OciEvidenceMutation,
    private readonly adoptPriorFence: boolean,
  ) {
    this.adapterId = delegate.adapterId;
    this.adapterVersion = delegate.adapterVersion;
  }

  public async inspectStartup() {
    return await this.delegate.inspectStartup();
  }

  public async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
    this.calls += 1;
    if (this.adoptPriorFence && this.calls === 1) {
      if (context.spec.fence < 1) throw new Error("OCI adoption fixture requires a later fence");
      const identity = this.delegate.trustedIdentity;
      const runKey = `oci-${context.spec.runId}`;
      prepareOciRun(
        identity.evidenceRoot,
        parseOciRunIntent({
          schemaVersion: 1,
          runKey,
          attemptId: context.spec.attemptId,
          runId: context.spec.runId,
          fence: context.spec.fence - 1,
          createdAt: "2026-08-11T15:59:59.000Z",
          taskSpecDigest: context.spec.taskSpecDigest,
          policyDigest: context.policyDigest,
          baseCommit: context.baseCommit,
          baseTree: context.baseTree,
          containerName: `app-factory-${runKey}`,
          image: identity.image,
          worktreeHostPath: context.spec.workingDirectory,
          worktreeContainerPath: identity.worktreeContainerPath,
          privateTmpfsPath: identity.privateTmpfsPath,
          networkMode: "none",
          readOnlyRootFilesystem: true,
          agentExecutable: identity.agentExecutable,
          agentArguments: identity.agentArguments,
          environment: identity.environment,
          limits: {
            cpuCount: identity.cpuCount,
            memoryBytes: identity.memoryBytes,
            pidLimit: identity.pidLimit,
            outputBytesPerStream: context.spec.limits.maxStdoutBytes,
            wallTimeMs: context.spec.limits.timeoutMs,
            stopGraceMs: context.spec.limits.terminationGraceMs,
            privateTmpfsBytes: identity.privateTmpfsBytes,
          },
        }),
      );
    }
    const outcome = await this.delegate.run(context);
    if (this.mutation === "none" || outcome.protocolEvidence?.schemaVersion !== 3) return outcome;
    return {
      ...outcome,
      protocolEvidence: mutateOciEvidence(outcome.protocolEvidence, this.mutation),
    };
  }
}

function ociAgentFixture(
  f: Fixture,
  reviewCalls: { count: number },
  mutation: OciEvidenceMutation = "none",
  adoptPriorFence = false,
  dependencies: Readonly<{
    engine?: ExecutorOciEngine;
    sleep?: (milliseconds: number) => Promise<void>;
  }> = {},
): Readonly<{
  agent: CountingOciAgent;
  delegate: OciLocalAgent;
  engine: ExecutorOciEngine;
  project: VerifiedLocalExecutionProject;
}> {
  const runnerRoot = join(f.root, "oci-runs");
  mkdirSync(runnerRoot, { recursive: true, mode: 0o700 });
  const engine = dependencies.engine ?? new ExecutorOciEngine();
  const delegate = new OciLocalAgent(
    {
      schemaVersion: 1,
      runnerRoot,
      engineIdentityDigest: OCI_TEST_ENGINE_ID,
      image: { reference: OCI_TEST_IMAGE_REFERENCE, imageId: OCI_TEST_IMAGE_ID },
      agentExecutable: "/usr/local/bin/codex",
      agentArguments: ["exec", "--json", "-"],
      environment: [
        { name: "LANG", value: "C" },
        { name: "PATH", value: "/usr/local/bin:/usr/bin:/bin" },
        { name: "TZ", value: "UTC" },
      ],
      resources: {
        cpuCount: 2,
        memoryBytes: 1_073_741_824,
        pidLimit: 128,
        privateTmpfsBytes: 67_108_864,
      },
      protocolMaterializer: ({ spec, receipt, stdout, stderr }) => {
        const events = [
          AgentEventV1Schema.parse({
            schemaVersion: 1,
            eventId: "64000000-0000-4000-8000-000000000001",
            runId: spec.runId,
            attemptId: spec.attemptId,
            stepId: spec.stepId,
            fence: spec.fence,
            sequence: 1,
            occurredAt: receipt.startedAt,
            type: "agent.started",
            data: { adapterId: spec.adapterId },
          }),
          AgentEventV1Schema.parse({
            schemaVersion: 1,
            eventId: "64000000-0000-4000-8000-000000000002",
            runId: spec.runId,
            attemptId: spec.attemptId,
            stepId: spec.stepId,
            fence: spec.fence,
            sequence: 2,
            occurredAt: receipt.finishedAt,
            type: "agent.finished",
            data: { status: "succeeded" },
          }),
        ];
        return {
          result: AgentRunResultV1Schema.parse({
            schemaVersion: 1,
            runId: spec.runId,
            attemptId: spec.attemptId,
            stepId: spec.stepId,
            fence: spec.fence,
            startedAt: receipt.startedAt,
            finishedAt: receipt.finishedAt,
            finalEventSequence: events.length,
            stdout: {
              digest: sha256Digest(stdout),
              byteLength: stdout.byteLength,
              truncated: receipt.stdout.truncated,
            },
            stderr: {
              digest: sha256Digest(stderr),
              byteLength: stderr.byteLength,
              truncated: receipt.stderr.truncated,
            },
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
            process: { exitCode: receipt.exitCode, signal: null },
            status: "succeeded",
            failure: null,
            blocker: null,
          }),
          events,
          summary: "Implemented through the contained OCI agent.",
          changedPaths: ["Sources/Greeter/GreetingFormatter.swift"],
        };
      },
      pollMs: 1,
    },
    {
      engine,
      now: () => new Date("2026-08-11T16:00:00.000Z"),
      sleep: dependencies.sleep ?? (async () => engine.finish()),
    },
  );
  const agent = new CountingOciAgent(delegate, mutation, adoptPriorFence);
  const enrolled = project(f, agent, reviewCalls);
  return {
    agent,
    delegate,
    engine,
    project: {
      ...enrolled,
      verificationPlans: enrolled.verificationPlans.filter(
        ({ checkId }) => checkId !== "tests.swift",
      ),
      agentProtocol: "oci-v3",
      ociAgentIdentity: delegate.trustedIdentity,
    },
  };
}

function project(
  f: Fixture,
  agent: LocalAgentAdapter,
  reviewCalls: { count: number },
  options: Readonly<{ reviewerOnlyAcceptance?: boolean }> = {},
): VerifiedLocalExecutionProject {
  const protectedFiles = {
    "FactoryAcceptance/FarewellAcceptanceTests.swift": digestFile(
      join(f.source, "FactoryAcceptance/FarewellAcceptanceTests.swift"),
    ),
    "Package.swift": digestFile(join(f.source, "Package.swift")),
    "Tests/GreeterTests/GreetingFormatterTests.swift": digestFile(
      join(f.source, "Tests/GreeterTests/GreetingFormatterTests.swift"),
    ),
  };
  const sharedPlan = {
    environment: {
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      SWIFT_DETERMINISTIC_HASHING: "1",
      TMPDIR: "/private/tmp",
      TZ: "UTC",
    },
    protectedFiles,
    timeoutMs: 120_000,
    terminationGraceMs: 1_000,
    maxStdoutBytes: 4 * 1024 * 1024,
    maxStderrBytes: 4 * 1024 * 1024,
  } as const;
  return {
    repositoryId: REPOSITORY_ID,
    sourceRepositoryPath: f.source,
    allowedBaseCommit: f.baseCommit,
    allowedBaseTree: f.baseTree,
    taskSemanticProfileDigest: computeTaskSemanticProfileDigest(f.taskSpec),
    policyBytes: f.policyBytes,
    agent,
    reviewerForRun: (runId) => exactGreeterReviewer(f, runId, reviewCalls),
    verificationPlans: [
      {
        ...sharedPlan,
        checkId: "tests.swift",
        executable: SWIFT,
        args: ["test", "--scratch-path", `${VERIFICATION_SCRATCH_TOKEN}/swiftpm-build`],
        toolVersions: [{ name: "swift", version: "fixture-toolchain" }],
      },
      ...(options.reviewerOnlyAcceptance
        ? []
        : [
            {
              ...sharedPlan,
              checkId: "acceptance.signature",
              executable: GREP,
              args: [
                "-F",
                "--",
                "public func farewell(for name: String) -> String {",
                "Sources/Greeter/GreetingFormatter.swift",
              ],
              toolVersions: [{ name: "grep", version: "system" }],
            },
            {
              ...sharedPlan,
              checkId: "acceptance.behavior",
              executable: GREP,
              args: ["-F", "--", '"Goodbye, \\(name)!"', "Sources/Greeter/GreetingFormatter.swift"],
              toolVersions: [{ name: "grep", version: "system" }],
            },
          ]),
    ],
    ...(agent.adapterId === "agent.supervised-protocol"
      ? {
          requireAgentProtocolEvidence: true,
          agentInvocationEnvironmentNames: ["CODEX_HOME", "LANG", "PATH"],
          agentInvocationIdentity: {
            executable: "/Users/pchordia/.local/bin/codex",
            executableDigest: sha256Digest(Buffer.from("codex executable fixture", "utf8")),
            cliVersion: "0.147.0-alpha.1.2",
            model: "gpt-5.6-codex",
          },
        }
      : {}),
    agentLimits: {
      timeoutMs: 30_000,
      terminationGraceMs: 500,
      maxTurns: 1,
      maxEventCount: 1_000,
      maxStdoutBytes: 1024 * 1024,
      maxStderrBytes: 1024 * 1024,
    },
  };
}

async function start(
  f: Fixture,
  agent: LocalAgentAdapter,
  reviewCalls: { count: number },
  options: Readonly<{
    leaseDurationMs?: number;
    reviewerOnlyAcceptance?: boolean;
    schedulerClock?: SchedulerClockPort;
    executorNow?: () => Date;
    projectOverride?: VerifiedLocalExecutionProject;
    executionManifestPublisher?: VerifiedLocalExecutionConfiguration["executionManifestPublisher"];
  }> = {},
): Promise<FactoryDaemonService> {
  const service = await startFactoryDaemonService({
    runtimeDirectory: f.runtime,
    authorization: AUTHORIZATION,
    daemonVersion: "0.4.0-verified-local-test",
    pollIntervalMs: 5,
    leaseDurationMs: options.leaseDurationMs ?? 5_000,
    ...(options.schedulerClock === undefined ? {} : { schedulerClock: options.schedulerClock }),
    localExecution: {
      projects: [
        options.projectOverride ??
          project(f, agent, reviewCalls, {
            ...(options.reviewerOnlyAcceptance === undefined
              ? {}
              : { reviewerOnlyAcceptance: options.reviewerOnlyAcceptance }),
          }),
      ],
      heartbeatIntervalMs: 100,
      ...(options.executionManifestPublisher === undefined
        ? {}
        : { executionManifestPublisher: options.executionManifestPublisher }),
      ...(options.executorNow === undefined ? {} : { now: options.executorNow }),
    },
  });
  services.push(service);
  return service;
}

function clientFor(service: FactoryDaemonService): CommandClient {
  const client = createCommandClient({
    socketPath: service.socketPath,
    authorization: AUTHORIZATION,
    origin: "cli",
  });
  clients.push(client);
  return client;
}

async function eventually(predicate: () => Promise<boolean>, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for verified local execution");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await Promise.allSettled(services.splice(0).map(async (service) => await service.close()));
  for (const root of roots.splice(0)) {
    if (existsSync(root)) {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("daemon verified local execution", () => {
  it.each(["environment", "identity"] as const)(
    "rejects a partial trusted invocation %s enrollment",
    async (partialEnrollment) => {
      const f = fixture(partialEnrollment === "environment" ? 42 : 43);
      const agent = new DeterministicSwiftAgent("succeed");
      const reviewCalls = { count: 0 };
      const baseProject = project(f, agent, reviewCalls);
      const partialProject: VerifiedLocalExecutionProject = {
        ...baseProject,
        ...(partialEnrollment === "environment"
          ? { agentInvocationEnvironmentNames: ["CODEX_HOME", "LANG", "PATH"] }
          : {
              agentInvocationIdentity: {
                executable: "/Users/pchordia/.local/bin/codex",
                executableDigest: sha256Digest(Buffer.from("codex executable fixture", "utf8")),
                cliVersion: "0.147.0-alpha.1.2",
                model: "gpt-5.6-codex",
              },
            }),
      };

      await expect(
        start(f, agent, reviewCalls, { projectOverride: partialProject }),
      ).rejects.toThrow("must be declared together");
    },
  );

  it("repairs only a matching same-inode agent-result publication remnant", () => {
    const root = realpathSync(mkdtempSync("/private/tmp/af-vle-links-"));
    roots.push(root);
    const agentResults = join(root, "agent-results");
    const temporaryRoot = join(agentResults, "tmp");
    mkdirSync(temporaryRoot, { recursive: true, mode: 0o700 });
    const target = join(agentResults, "62000000-0000-4000-8000-000000000099.json");
    writeFileSync(target, "{}\n", { mode: 0o600 });
    const matching = join(temporaryRoot, "123-00000000-0000-4000-8000-000000000099.tmp");
    linkSync(target, matching);

    reconcileAgentResultPublicationLinks(target, temporaryRoot);

    expect(lstatSync(target).nlink).toBe(1);
    expect(existsSync(matching)).toBe(false);

    const unknown = join(root, "unknown-hard-link");
    linkSync(target, unknown);
    expect(() => reconcileAgentResultPublicationLinks(target, temporaryRoot)).toThrow(
      "unknown hard link",
    );
    expect(lstatSync(target).nlink).toBe(2);
  });

  it.each(["before", "after"] as const)(
    "recovers a %s-publication manifest interruption without duplicating execution",
    { timeout: 180_000 },
    async (failurePoint) => {
      const f = fixture(failurePoint === "before" ? 8 : 9);
      const agent = new DeterministicSwiftAgent("succeed");
      const reviewCalls = { count: 0 };
      let publications = 0;
      const service = await start(f, agent, reviewCalls, {
        executionManifestPublisher: (store, evidence) => {
          publications += 1;
          if (failurePoint === "before" && publications === 1) {
            throw new RetryableExecutionManifestPublicationError(
              "simulated interruption before manifest publication",
            );
          }
          const manifest = commitVerifiedExecutionManifest(store, evidence);
          if (failurePoint === "after" && publications === 1) {
            throw new RetryableExecutionManifestPublicationError(
              "simulated interruption after manifest publication",
            );
          }
          return manifest;
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "succeeded";
      });

      expect(publications).toBe(2);
      expect(agent.calls).toBe(1);
      expect(reviewCalls.count).toBe(1);
      expect((await client.listEvidence()).manifests).toHaveLength(1);
      expect(
        git(f.root, [
          "--git-dir",
          join(service.executionPaths.gitRuntimeRoot, "mirrors", `${REPOSITORY_ID}.git`),
          "for-each-ref",
          "--format=%(refname)",
          `refs/app-factory/attempts/${intake.attemptId}`,
        ])
          .split("\n")
          .filter((line) => line.length > 0),
      ).toHaveLength(1);
    },
  );

  it(
    "persists a complete V2 protocol closure and republishes it without relaunching the agent",
    { timeout: 180_000 },
    async () => {
      const f = fixture(13);
      const agent = new ProtocolSwiftAgent();
      const reviewCalls = { count: 0 };
      let publications = 0;
      const service = await start(f, agent, reviewCalls, {
        executionManifestPublisher: (store, evidence, agentRun) => {
          publications += 1;
          if (publications === 1) {
            throw new RetryableExecutionManifestPublicationError(
              "simulated interruption before V2 manifest publication",
            );
          }
          return commitVerifiedExecutionManifest(store, evidence, agentRun);
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(
        async () => (await client.status(intake.attemptId)).attempt.state === "succeeded",
      );

      expect(publications).toBe(2);
      expect(agent.calls).toBe(1);
      expect(reviewCalls.count).toBe(1);
      const journal = JSON.parse(
        readFileSync(
          join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`),
          "utf8",
        ),
      ) as Readonly<Record<string, unknown>>;
      expect(journal).toMatchObject({
        schemaVersion: 2,
        attemptId: intake.attemptId,
        adapterId: agent.adapterId,
        adapterVersion: agent.adapterVersion,
      });

      const integrity = await client.verifyEvidence(intake.attemptId);
      expect(integrity.manifest.requiredKinds).toEqual([
        "event-log",
        "verification",
        "review",
        "commit",
      ]);
      const storedIntegrity = new EvidenceStore(service.executionPaths.evidenceRoot).verify(
        intake.attemptId,
      );
      const agentRun = storedIntegrity.evidence.find((item) => item.kind === "agent-run");
      expect(agentRun).toMatchObject({
        kind: "agent-run",
        producer: agent.adapterId,
        claims: {
          runSpecDigest: journal.runSpecDigest,
          result: { status: "succeeded", finalEventSequence: 2 },
        },
      });
      expect(agentRun?.artifacts.map((artifact) => artifact.logicalName)).toEqual([
        "agent-run-spec.v1.json",
        "agent-run-result.v1.json",
        "agent-stdout.bin",
        "agent-stderr.bin",
        "agent-invocation-descriptor.v1.json",
        "supervised-run-intent.v1.json",
        "supervised-run-receipt.v1.json",
      ]);
      const descriptorArtifact = agentRun?.artifacts.find(
        (artifact) => artifact.logicalName === "agent-invocation-descriptor.v1.json",
      );
      if (descriptorArtifact === undefined) throw new Error("Missing invocation descriptor");
      expect(
        JSON.parse(
          new EvidenceStore(service.executionPaths.evidenceRoot)
            .readBlob(descriptorArtifact.digest)
            .toString("utf8"),
        ),
      ).toMatchObject({
        schemaVersion: 1,
        executable: "/Users/pchordia/.local/bin/codex",
        cliVersion: "0.147.0-alpha.1.2",
        model: "gpt-5.6-codex",
        executableDigest: expect.stringMatching(/^sha256:/u),
        environmentProjectionDigest: expect.stringMatching(/^sha256:/u),
      });
      const intentArtifact = agentRun?.artifacts.find(
        (artifact) => artifact.logicalName === "supervised-run-intent.v1.json",
      );
      const receiptArtifact = agentRun?.artifacts.find(
        (artifact) => artifact.logicalName === "supervised-run-receipt.v1.json",
      );
      if (intentArtifact === undefined || receiptArtifact === undefined) {
        throw new Error("Missing supervised intent or receipt");
      }
      const evidenceStore = new EvidenceStore(service.executionPaths.evidenceRoot);
      const storedIntent = parseSupervisedRunIntent(
        JSON.parse(evidenceStore.readBlob(intentArtifact.digest).toString("utf8")) as unknown,
      );
      const storedReceipt = JSON.parse(
        evidenceStore.readBlob(receiptArtifact.digest).toString("utf8"),
      ) as Readonly<Record<string, unknown>>;
      expect(intentArtifact.digest).toBe(journal.supervisorIntentDigest);
      expect(storedReceipt.intentDigest).toBe(digestSupervisedRunIntent(storedIntent));
    },
  );

  it(
    "accepts a well-formed multi-turn protocol event log within a raised turn budget",
    { timeout: 180_000 },
    async () => {
      const f = fixture(90);
      // Two extra agent.progress events represent two completed Codex turns.
      // The log stays a single contiguous run: one agent.started, one
      // agent.finished, and the turn events between them.
      const agent = new ProtocolSwiftAgent("none", 2);
      const reviewCalls = { count: 0 };
      const enrolled = project(f, agent, reviewCalls);
      const multiTurnProject: VerifiedLocalExecutionProject = {
        ...enrolled,
        agentLimits: {
          timeoutMs: 30_000,
          terminationGraceMs: 500,
          maxTurns: 2,
          maxEventCount: 1_000,
          maxStdoutBytes: 1024 * 1024,
          maxStderrBytes: 1024 * 1024,
        },
      };
      const service = await start(f, agent, reviewCalls, { projectOverride: multiTurnProject });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(
        async () => (await client.status(intake.attemptId)).attempt.state === "succeeded",
      );

      expect(agent.calls).toBe(1);
      expect(reviewCalls.count).toBe(1);
      const journal = JSON.parse(
        readFileSync(
          join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`),
          "utf8",
        ),
      ) as Readonly<Record<string, unknown>>;
      expect(journal).toMatchObject({ schemaVersion: 2, attemptId: intake.attemptId });

      const storedIntegrity = new EvidenceStore(service.executionPaths.evidenceRoot).verify(
        intake.attemptId,
      );
      const agentRun = storedIntegrity.evidence.find((item) => item.kind === "agent-run");
      expect(agentRun).toMatchObject({
        kind: "agent-run",
        claims: { result: { status: "succeeded", finalEventSequence: 4 } },
      });
    },
  );

  it(
    "rejects a durable V1 journal after the project is enrolled as protocol-required",
    { timeout: 180_000 },
    async () => {
      const f = fixture(44);
      const legacyImplementation = new DeterministicSwiftAgent("succeed");
      const legacyAgent: LocalAgentAdapter = {
        adapterId: "agent.supervised-protocol",
        adapterVersion: "1.0.0",
        run: async (context) => await legacyImplementation.run(context),
      };
      const legacyReviews = { count: 0 };
      const legacyBaseProject = project(f, legacyImplementation, legacyReviews, {
        reviewerOnlyAcceptance: true,
      });
      const existingPlan = legacyBaseProject.verificationPlans[0];
      if (existingPlan === undefined) throw new Error("Missing fixture verification plan");
      const legacyProject: VerifiedLocalExecutionProject = {
        ...legacyBaseProject,
        agent: legacyAgent,
        verificationPlans: [
          {
            ...existingPlan,
            checkId: "tests.replay-pause",
            executable: "/bin/sleep",
            args: ["30"],
            timeoutMs: 60_000,
            toolVersions: [{ name: "sleep", version: "system" }],
          },
        ],
      };
      const first = await start(f, legacyAgent, legacyReviews, {
        projectOverride: legacyProject,
      });
      const firstClient = clientFor(first);
      const intake = await firstClient.run(f.taskSpec);
      const journalPath = join(first.executionPaths.agentResultRoot, `${intake.attemptId}.json`);
      await eventually(async () => existsSync(journalPath), 20_000);
      expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({
        schemaVersion: 1,
        adapterId: legacyAgent.adapterId,
      });

      firstClient.close();
      await first.close();

      const enrolledAgent = new ProtocolSwiftAgent();
      const enrolledReviews = { count: 0 };
      const restarted = await start(f, enrolledAgent, enrolledReviews);
      const restartedClient = clientFor(restarted);
      await eventually(
        async () => (await restartedClient.status(intake.attemptId)).attempt.state === "failed",
        20_000,
      );

      expect(await restartedClient.status(intake.attemptId)).toMatchObject({
        attempt: {
          state: "failed",
          outcome: {
            kind: "failed",
            failure: { code: "local-execution.verification-failed", retryable: false },
          },
        },
      });
      expect(JSON.parse(readFileSync(journalPath, "utf8"))).toMatchObject({ schemaVersion: 1 });
      expect(enrolledAgent.calls).toBe(0);
      expect(enrolledReviews.count).toBe(0);
    },
  );

  it(
    "publishes and replays a complete OCI V3 closure without relaunching containment",
    { timeout: 180_000 },
    async () => {
      const f = fixture(70);
      const reviewCalls = { count: 0 };
      const oci = ociAgentFixture(f, reviewCalls);
      let publications = 0;
      const service = await start(f, oci.agent, reviewCalls, {
        projectOverride: oci.project,
        executionManifestPublisher: (store, evidence, agentRun) => {
          publications += 1;
          if (publications === 1) {
            throw new RetryableExecutionManifestPublicationError(
              "simulated interruption before OCI V3 manifest publication",
            );
          }
          return commitVerifiedExecutionManifest(store, evidence, agentRun);
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const state = (await client.status(intake.attemptId)).attempt.state;
        return state === "succeeded" || state === "failed";
      }, 20_000);
      expect((await client.status(intake.attemptId)).attempt.state).toBe("succeeded");

      expect(publications).toBe(2);
      expect(oci.agent.calls).toBe(1);
      expect(oci.engine.creates).toBe(1);
      expect(oci.engine.starts).toBe(1);
      expect(oci.engine.removals).toBe(1);
      expect(reviewCalls.count).toBe(1);
      const journal = JSON.parse(
        readFileSync(
          join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`),
          "utf8",
        ),
      ) as Readonly<{
        schemaVersion: number;
        ociEnvelopeDigest: string;
        ociArtifacts: readonly Readonly<{ logicalName: string }>[];
      }>;
      expect(journal.schemaVersion).toBe(3);
      expect(journal.ociArtifacts.map(({ logicalName }) => logicalName)).toEqual([
        "intent.json",
        "engine-binding.json",
        "create-attempt.json",
        "created.inspect.json",
        "launch-attempt.json",
        "start-dispatched.json",
        "post-start.inspect.json",
        "post-start-attested.json",
        "running.inspect.json",
        "terminal.inspect.json",
        "stdout.bin",
        "stderr.bin",
        "terminal.json",
        "removed.json",
        "receipt.json",
      ]);
      const stored = new EvidenceStore(service.executionPaths.evidenceRoot).verify(
        intake.attemptId,
      );
      const agentRun = stored.evidence.find((item) => item.kind === "agent-run");
      expect(agentRun?.artifacts.map(({ logicalName }) => logicalName)).toEqual([
        "agent-run-spec.v1.json",
        "agent-run-result.v1.json",
        "agent-stdout.bin",
        "agent-stderr.bin",
        "oci-evidence-envelope.v1.json",
        ...journal.ociArtifacts.map(({ logicalName }) => `oci-${logicalName}`),
      ]);
      expect(
        agentRun?.artifacts.find(
          ({ logicalName }) => logicalName === "oci-evidence-envelope.v1.json",
        )?.digest,
      ).toBe(journal.ociEnvelopeDigest);
    },
  );

  it("adopts an exact prior-fence OCI closure while publishing under the active lease", async () => {
    const f = fixture(76);
    const reviewCalls = { count: 0 };
    const oci = ociAgentFixture(f, reviewCalls, "none", true);
    const service = await start(f, oci.agent, reviewCalls, { projectOverride: oci.project });
    const client = clientFor(service);
    const intake = await client.run(f.taskSpec);
    await eventually(async () => {
      const state = (await client.status(intake.attemptId)).attempt.state;
      return state === "succeeded" || state === "failed";
    }, 20_000);
    const status = await client.status(intake.attemptId);
    expect(status.attempt.state).toBe("succeeded");
    expect(status.attempt.fence).toBe(1);
    expect(
      JSON.parse(
        readFileSync(
          join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`),
          "utf8",
        ),
      ),
    ).toMatchObject({ schemaVersion: 3, agentFence: 0 });
    expect(oci.agent.calls).toBe(1);
    expect(oci.engine.creates).toBe(1);
    expect(reviewCalls.count).toBe(1);
  });

  it.each([
    ["schema downgrade", "schema-downgrade"],
    ["missing lifecycle reference", "missing-ref"],
    ["reordered lifecycle references", "reordered-ref"],
    ["nonconventional run key", "run-key-convention"],
  ] as const)("rejects OCI V3 %s before journal publication", async (_label, mutation) => {
    const f = fixture(
      71 +
        ["schema-downgrade", "missing-ref", "reordered-ref", "run-key-convention"].indexOf(
          mutation,
        ),
    );
    const reviewCalls = { count: 0 };
    const oci = ociAgentFixture(f, reviewCalls, mutation);
    const service = await start(f, oci.agent, reviewCalls, { projectOverride: oci.project });
    const client = clientFor(service);
    const intake = await client.run(f.taskSpec);
    await eventually(
      async () => (await client.status(intake.attemptId)).attempt.state === "failed",
      20_000,
    );

    expect(oci.agent.calls).toBe(1);
    expect(reviewCalls.count).toBe(0);
    expect(
      existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
    ).toBe(false);
  });

  it("rejects an adapter closure missing from the independently configured OCI root", async () => {
    const f = fixture(75);
    const reviewCalls = { count: 0 };
    const oci = ociAgentFixture(f, reviewCalls);
    const differentRoot = join(f.root, "different-oci-root");
    mkdirSync(differentRoot, { mode: 0o700 });
    const service = await start(f, oci.agent, reviewCalls, {
      projectOverride: {
        ...oci.project,
        ociAgentIdentity: {
          ...(oci.project.ociAgentIdentity as NonNullable<
            VerifiedLocalExecutionProject["ociAgentIdentity"]
          >),
          evidenceRoot: differentRoot,
        },
      },
    });
    const client = clientFor(service);
    const intake = await client.run(f.taskSpec);
    await eventually(
      async () => (await client.status(intake.attemptId)).attempt.state === "failed",
      20_000,
    );

    expect(oci.agent.calls).toBe(1);
    expect(reviewCalls.count).toBe(0);
    expect(
      existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
    ).toBe(false);
  });

  it(
    "fails closed on a corrupted V2 journal during replay without relaunching the agent",
    { timeout: 180_000 },
    async () => {
      const f = fixture(14);
      const agent = new ProtocolSwiftAgent();
      const reviewCalls = { count: 0 };
      let publications = 0;
      const service = await start(f, agent, reviewCalls, {
        executionManifestPublisher: (_store, evidence) => {
          publications += 1;
          writeFileSync(
            join(service.executionPaths.agentResultRoot, `${evidence.index.attemptId}.json`),
            "{}",
          );
          throw new RetryableExecutionManifestPublicationError(
            "simulated interruption after corrupting the V2 journal",
          );
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(
        async () => (await client.status(intake.attemptId)).attempt.state === "failed",
      );

      expect(agent.calls).toBe(1);
      expect(publications).toBe(1);
      expect(reviewCalls.count).toBe(1);
      expect(await client.status(intake.attemptId)).toMatchObject({
        attempt: {
          state: "failed",
          outcome: {
            kind: "failed",
            failure: { code: "local-execution.verification-failed", retryable: false },
          },
        },
      });
    },
  );

  it.each([
    "missing-protocol-envelope",
    "run-spec-binding",
    "result-binding",
    "event-terminal",
    "final-sequence",
    "stdout-metadata",
    "descriptor-binding",
    "descriptor-identity",
    "receipt-binding",
    "receipt-output-invariant",
    "intent-binding",
    "intent-canonical",
    "descriptor-environment",
    "failure-detail-artifact",
    "unknown-outcome-kind",
    "envelope-shape",
    "outcome-status",
  ] as const)("rejects %s protocol evidence before publishing a V2 journal", async (mutation) => {
    const f = fixture(
      20 +
        [
          "missing-protocol-envelope",
          "run-spec-binding",
          "result-binding",
          "event-terminal",
          "final-sequence",
          "stdout-metadata",
          "descriptor-binding",
          "descriptor-identity",
          "receipt-binding",
          "receipt-output-invariant",
          "intent-binding",
          "intent-canonical",
          "descriptor-environment",
          "failure-detail-artifact",
          "unknown-outcome-kind",
          "envelope-shape",
          "outcome-status",
        ].indexOf(mutation),
    );
    const agent = new ProtocolSwiftAgent(mutation);
    const reviewCalls = { count: 0 };
    const service = await start(f, agent, reviewCalls);
    const client = clientFor(service);
    const intake = await client.run(f.taskSpec);
    await eventually(
      async () => (await client.status(intake.attemptId)).attempt.state === "failed",
      20_000,
    );

    expect(agent.calls).toBe(1);
    expect(reviewCalls.count).toBe(0);
    expect(
      existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
    ).toBe(false);
  });

  it.each(["stdout-limit", "stderr-limit"] as const)(
    "rejects protocol %s bytes beyond the daemon-issued limit",
    async (mutation) => {
      const f = fixture(mutation === "stdout-limit" ? 40 : 41);
      const agent = new ProtocolSwiftAgent(mutation);
      const reviewCalls = { count: 0 };
      const enrolled = project(f, agent, reviewCalls);
      const service = await start(f, agent, reviewCalls, {
        projectOverride: {
          ...enrolled,
          agentLimits: {
            ...(enrolled.agentLimits as NonNullable<typeof enrolled.agentLimits>),
            maxStdoutBytes: 20,
            maxStderrBytes: 20,
          },
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(
        async () => (await client.status(intake.attemptId)).attempt.state === "failed",
        20_000,
      );

      expect(agent.calls).toBe(1);
      expect(reviewCalls.count).toBe(0);
      expect(
        existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
      ).toBe(false);
    },
  );

  it.each([
    ["reported-failure", "failed", "agent.process-failed"],
    ["turn-limit-exceeded", "failed", "agent.turn-limit-exceeded"],
    ["auth-blocker", "blocked", "agent.authentication-required"],
  ] as const)(
    "persists and replays a V2 %s result without silently relaunching",
    { timeout: 30_000 },
    async (mutation, expectedState, expectedCode) => {
      const f = fixture(
        mutation === "reported-failure" ? 30 : mutation === "turn-limit-exceeded" ? 32 : 31,
      );
      const agent = new ProtocolSwiftAgent(mutation);
      const service = await start(f, agent, { count: 0 });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(
        async () => (await client.status(intake.attemptId)).attempt.state === expectedState,
        20_000,
      );
      expect(agent.calls).toBe(1);
      expect(
        JSON.parse(
          readFileSync(
            join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`),
            "utf8",
          ),
        ),
      ).toMatchObject({ schemaVersion: 2 });

      const status = await client.status(intake.attemptId);
      if (mutation === "auth-blocker") {
        expect(status.attempt.blocker?.code).toBe(expectedCode);
        await client.pause(intake.attemptId, "stage an explicit blocked-result replay");
        await eventually(
          async () => (await client.status(intake.attemptId)).attempt.state === "paused",
          20_000,
        );
        const beforeResume = (await client.status(intake.attemptId)).attempt.updatedAt;
        await client.resume(intake.attemptId, "retry the durable blocked result");
        await eventually(async () => {
          const replayed = await client.status(intake.attemptId);
          return replayed.attempt.state === "blocked" && replayed.attempt.updatedAt > beforeResume;
        }, 20_000);
        expect(agent.calls).toBe(1);
      } else {
        expect(status.attempt.outcome).toMatchObject({
          kind: "failed",
          failure: { code: expectedCode },
        });
      }
    },
  );

  it(
    "fails terminally for manual intervention when a published manifest is permanently corrupt",
    { timeout: 180_000 },
    async () => {
      const f = fixture(10);
      const agent = new DeterministicSwiftAgent("succeed");
      const reviewCalls = { count: 0 };
      let publications = 0;
      const service = await start(f, agent, reviewCalls, {
        executionManifestPublisher: (store, evidence) => {
          publications += 1;
          const manifest = commitVerifiedExecutionManifest(store, evidence);
          writeFileSync(
            join(f.runtime, "evidence", "manifests", `${manifest.attemptId}.json`),
            "{permanently-corrupt\n",
          );
          return manifest;
        },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      });

      expect(await client.status(intake.attemptId)).toMatchObject({
        attempt: {
          state: "failed",
          outcome: {
            kind: "failed",
            failure: { code: "evidence.publication-integrity-failed", retryable: false },
          },
        },
      });
      expect(publications).toBe(1);
      expect(agent.calls).toBe(1);
      expect(reviewCalls.count).toBe(1);
    },
  );

  it.each(["objective", "acceptance-criterion"] as const)(
    "rejects an unsupported %s before the deterministic fixture agent runs",
    async (change) => {
      const f = fixture(change === "objective" ? 11 : 12);
      const agent = new DeterministicSwiftAgent("succeed");
      const reviewCalls = { count: 0 };
      const service = await start(f, agent, reviewCalls);
      const client = clientFor(service);
      const altered = TaskSpecV1Schema.parse({
        ...f.taskSpec,
        ...(change === "objective"
          ? { objective: "Create an unrelated feature while preserving the enrolled base." }
          : {
              acceptanceCriteria: f.taskSpec.acceptanceCriteria.map((criterion, index) =>
                index === 0
                  ? { ...criterion, statement: "An unrelated outcome is accepted." }
                  : criterion,
              ),
            }),
      });
      const intake = await client.run(altered);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      }, 20_000);

      expect(await client.status(intake.attemptId)).toMatchObject({
        attempt: {
          outcome: {
            kind: "failed",
            failure: { code: "task.semantic-profile-not-enrolled", retryable: false },
          },
        },
      });
      expect(agent.calls).toBe(0);
      expect(reviewCalls.count).toBe(0);
    },
  );

  it(
    "recovers a prepared-immutable attempt without reading its removed source checkout",
    { timeout: 180_000 },
    async () => {
      const f = fixture(7);
      const firstAgent = new DeterministicSwiftAgent("interrupt");
      const reviewCalls = { count: 0 };
      const baseProject = project(f, firstAgent, reviewCalls);
      const gitRuntimeRoot = join(f.runtime, "local-execution", "git");
      mkdirSync(gitRuntimeRoot, { recursive: true, mode: 0o700 });
      const sourceIdentityDigest = sha256Digest(
        Buffer.from(`prepared-test-source\0${f.baseCommit}\0${f.baseTree}`, "utf8"),
      );
      new GitWorkspaceManager({ gitExecutable: GIT }).prepareImmutableMirror(
        {
          sourceRepositoryPath: f.source,
          sourceIdentityDigest,
          runtimeRoot: gitRuntimeRoot,
          repositoryId: REPOSITORY_ID,
          baseCommit: f.baseCommit,
          baseTree: f.baseTree,
        },
        () => undefined,
      );
      const preparedProject: VerifiedLocalExecutionProject = {
        ...baseProject,
        mirrorMode: "prepared-immutable",
        sourceIdentityDigest,
      };
      rmSync(f.source, { recursive: true, force: false });

      const first = await start(f, firstAgent, reviewCalls, {
        projectOverride: preparedProject,
      });
      const firstClient = clientFor(first);
      const intake = await firstClient.run(f.taskSpec);
      await firstAgent.started();
      firstClient.close();
      await first.close();
      await firstAgent.aborted();

      const recoveredAgent = new DeterministicSwiftAgent("succeed");
      const restarted = await start(f, recoveredAgent, reviewCalls, {
        projectOverride: { ...preparedProject, agent: recoveredAgent },
      });
      const restartedClient = clientFor(restarted);
      await eventually(async () => {
        const status = await restartedClient.status(intake.attemptId);
        return status.attempt.state === "succeeded";
      });

      expect(await restartedClient.status(intake.attemptId)).toMatchObject({
        attempt: { state: "succeeded", fence: 2 },
      });
      expect(recoveredAgent.observedFences).toEqual([2]);
      expect(reviewCalls.count).toBe(1);
    },
  );

  it("records agent start before a delayed adapter and finish only after it returns", async () => {
    const f = fixture(6);
    const underlying = new DeterministicSwiftAgent("succeed");
    let phase: "before" | "running" | "after" = "before";
    const delayed: LocalAgentAdapter = {
      adapterId: underlying.adapterId,
      adapterVersion: underlying.adapterVersion,
      run: async (context) => {
        phase = "running";
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
        const outcome = await underlying.run(context);
        phase = "after";
        return outcome;
      },
    };
    const base = Date.now();
    const instants = {
      before: new Date(base),
      running: new Date(base + 50),
      after: new Date(base + 100),
    };
    const service = await start(
      f,
      delayed,
      { count: 0 },
      {
        leaseDurationMs: 10_000,
        reviewerOnlyAcceptance: true,
        executorNow: () => instants[phase],
      },
    );
    const client = clientFor(service);
    const intake = await client.run(f.taskSpec);
    const journalPath = join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`);
    await eventually(async () => existsSync(journalPath), 20_000);
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      eventDigest: `sha256:${string}`;
    };
    const events = JSON.parse(
      new EvidenceStore(service.executionPaths.evidenceRoot)
        .readBlob(journal.eventDigest)
        .toString("utf8"),
    ) as readonly { type: string; occurredAt: string }[];

    expect(events).toEqual([
      expect.objectContaining({ type: "agent.started", occurredAt: instants.before.toISOString() }),
      expect.objectContaining({ type: "agent.finished", occurredAt: instants.after.toISOString() }),
    ]);
  });

  it(
    "recovers an interrupted Factory-owned Swift worktree and publishes one bound commit",
    { timeout: 180_000 },
    async () => {
      const f = fixture(1);
      const firstAgent = new DeterministicSwiftAgent("interrupt");
      const firstReviews = { count: 0 };
      const first = await start(f, firstAgent, firstReviews);
      const firstClient = clientFor(first);
      const intake = await firstClient.run(f.taskSpec);
      await firstAgent.started();
      firstClient.close();
      await first.close();
      await firstAgent.aborted();

      expect(
        existsSync(join(first.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
      ).toBe(false);
      const recoveredAgent = new DeterministicSwiftAgent("succeed");
      const recoveredReviews = { count: 0 };
      const restarted = await start(f, recoveredAgent, recoveredReviews);
      const restartedClient = clientFor(restarted);
      await eventually(async () => {
        const status = await restartedClient.status(intake.attemptId);
        return status.attempt.state === "succeeded";
      });

      const status = await restartedClient.status(intake.attemptId);
      expect(status.attempt).toMatchObject({ state: "succeeded", fence: 2 });
      expect(recoveredAgent.calls).toBe(1);
      expect(recoveredAgent.observedFences).toEqual([2]);
      expect(recoveredAgent.instructions[0]).toContain(
        `Reviewed policy SHA-256: ${f.policyDigest}`,
      );
      expect(recoveredAgent.instructions[0]).toContain(JSON.stringify(POLICY_TEXT));
      expect(recoveredReviews.count).toBe(1);
      expect(restarted.executionPaths.evidenceRoot).toBe(join(f.runtime, "evidence"));

      const checkpoint = new FileExecutionCheckpointStore(
        restarted.executionPaths.checkpointRoot,
      ).load(intake.attemptId);
      expect(checkpoint).toMatchObject({ phase: "completed", fence: 2 });
      if (checkpoint?.evidenceIndexDigest === null || checkpoint === null) {
        throw new Error("Completed execution checkpoint is missing evidence");
      }
      const manager = new GitWorkspaceManager({ gitExecutable: GIT });
      const mirror = manager.ensureMirror({
        sourceRepositoryPath: f.source,
        runtimeRoot: restarted.executionPaths.gitRuntimeRoot,
        repositoryId: REPOSITORY_ID,
      });
      const evidence = verifyExecutionEvidenceIndex({
        indexDigest: checkpoint.evidenceIndexDigest,
        evidenceStore: new EvidenceStore(restarted.executionPaths.evidenceRoot),
        gitWorkspace: manager,
        mirror,
      });
      expect(evidence.index).toMatchObject({
        attemptId: intake.attemptId,
        taskSpecDigest: status.attempt.taskSpecDigest,
        policyDigest: f.policyDigest,
        baseCommit: f.baseCommit,
        fence: 2,
      });
      expect(evidence.brokerCommit.baseSha).toBe(f.baseCommit);
      const listedEvidence = await restartedClient.listEvidence();
      expect(listedEvidence).toMatchObject({
        operation: "evidence.list",
        manifests: [
          {
            attemptId: intake.attemptId,
            subject: {
              taskSpecDigest: status.attempt.taskSpecDigest,
              policyDigest: f.policyDigest,
              baseCommit: f.baseCommit,
              candidateTree: evidence.index.candidateTree,
              fence: 2,
            },
            requiredKinds: ["event-log", "verification", "review", "commit"],
          },
        ],
        hasMore: false,
      });
      const inspectedEvidence = await restartedClient.inspectEvidence(intake.attemptId);
      expect(inspectedEvidence.manifest).toMatchObject({
        attemptId: intake.attemptId,
        subject: listedEvidence.manifests[0]?.subject,
        requiredKinds: ["event-log", "verification", "review", "commit"],
      });
      expect(inspectedEvidence.manifest.entries).toHaveLength(3 + evidence.testCount);
      const integrity = await restartedClient.verifyEvidence(intake.attemptId);
      expect(integrity).toMatchObject({
        operation: "evidence.verify",
        integrityVerified: true,
        manifest: {
          attemptId: intake.attemptId,
          manifestDigest: inspectedEvidence.manifestDigest,
        },
      });
      expect(integrity.evidence.map((item) => item.kind)).toEqual([
        "event-log",
        ...Array.from({ length: evidence.testCount }, () => "verification" as const),
        "review",
        "commit",
      ]);
      expect(
        git(f.root, [
          "--git-dir",
          mirror.mirrorPath,
          "show",
          `${evidence.brokerCommit.commitSha}:Sources/Greeter/GreetingFormatter.swift`,
        ]),
      ).toContain("Goodbye, \\(name)!");
      expect(git(f.source, ["rev-parse", "HEAD"])).toBe(f.baseCommit);
      expect(git(f.source, ["status", "--porcelain"])).toBe("");

      const storedEvidence = new EvidenceStore(restarted.executionPaths.evidenceRoot).verify(
        intake.attemptId,
      );
      const transitiveArtifact = storedEvidence.evidence
        .find((item) => item.kind === "verification")
        ?.artifacts.find((artifact) => artifact.logicalName.endsWith("-stdout.bin"));
      if (transitiveArtifact === undefined) {
        throw new Error("Verified execution manifest is missing trusted stdout evidence");
      }
      const artifactHex = transitiveArtifact.digest.slice("sha256:".length);
      writeFileSync(
        join(
          restarted.executionPaths.evidenceRoot,
          "blobs",
          "sha256",
          artifactHex.slice(0, 2),
          artifactHex.slice(2),
        ),
        "tampered trusted output\n",
      );
      await expect(restartedClient.verifyEvidence(intake.attemptId)).rejects.toMatchObject({
        code: "evidence.integrity-failed",
        retryable: false,
      });
    },
  );

  it(
    "rejects a protected-path edit before trusted checks, review, or commit",
    { timeout: 30_000 },
    async () => {
      const f = fixture(2);
      const agent = new DeterministicSwiftAgent("protected-edit");
      const reviewCalls = { count: 0 };
      const service = await start(f, agent, reviewCalls);
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      }, 20_000);

      const status = await client.status(intake.attemptId);
      expect(status.attempt.outcome).toMatchObject({
        kind: "failed",
        failure: { code: "candidate.protected-path" },
      });
      expect(reviewCalls.count).toBe(0);
      expect(
        git(
          f.root,
          [
            "--git-dir",
            join(service.executionPaths.gitRuntimeRoot, "mirrors", `${REPOSITORY_ID}.git`),
            "rev-parse",
            "--verify",
            "--quiet",
            `refs/app-factory/attempts/${intake.attemptId}`,
          ],
          [0, 1],
        ),
      ).toBe("");
      expect(
        new FileExecutionCheckpointStore(service.executionPaths.checkpointRoot).load(
          intake.attemptId,
        ),
      ).toBeNull();
    },
  );

  it(
    "fails an authorized but incorrect candidate in the independent read-only reviewer",
    { timeout: 30_000 },
    async () => {
      const f = fixture(5);
      const reviewCalls = { count: 0 };
      const service = await start(f, new DeterministicSwiftAgent("wrong-result"), reviewCalls, {
        reviewerOnlyAcceptance: true,
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      }, 20_000);

      const status = await client.status(intake.attemptId);
      expect(status.attempt.outcome).toMatchObject({
        kind: "failed",
        failure: { code: "local-execution.verification-failed" },
      });
      expect(reviewCalls.count).toBe(1);
      expect(
        new FileExecutionCheckpointStore(service.executionPaths.checkpointRoot).load(
          intake.attemptId,
        )?.phase,
      ).toBe("tests-passed");
    },
  );

  it(
    "surfaces a supervisor V2 pre-launch stale-fence rejection under its real code after restart adoption",
    { timeout: 60_000 },
    async () => {
      // Restart-adoption scenario: a Codex-style supervised adapter (supervisor V2,
      // protocol evidence required) is asked to run under a fresh fence, discovers a
      // durable terminal receipt for the same logical run at an older fence during
      // #reconcilePriorFences, and refuses to launch. No agent process ran under
      // this fence, so the outcome carries no protocol evidence -- exactly what
      // CodexLocalAgent emits. The attempt must fail under the adapter's own code,
      // not be masked as `local-execution.verification-failed`.
      const f = fixture(91);
      const staleFenceSummary =
        "An older-fence Codex run at fence 1 has a durable terminal receipt. Its worktree effects cannot be safely replayed into fence 2; inspect the receipt and submit a replacement attempt.";
      const preLaunchRejectingAgent: LocalAgentAdapter & { calls: number } = {
        adapterId: "agent.supervised-protocol",
        adapterVersion: "1.0.0",
        calls: 0,
        async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
          preLaunchRejectingAgent.calls += 1;
          await context.assertActive();
          return {
            kind: "failed",
            failure: {
              code: NamespacedCodeSchema.parse("agent.supervisor-stale-fence"),
              summary: staleFenceSummary,
              retryable: false,
              detailArtifactDigest: null,
            },
          };
        },
      };
      const reviewCalls = { count: 0 };
      const service = await start(f, preLaunchRejectingAgent, reviewCalls);
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      }, 30_000);

      const status = await client.status(intake.attemptId);
      expect(status.attempt.outcome).toMatchObject({
        kind: "failed",
        failure: {
          code: "agent.supervisor-stale-fence",
          summary: staleFenceSummary,
          retryable: false,
        },
      });
      expect(preLaunchRejectingAgent.calls).toBe(1);
      expect(reviewCalls.count).toBe(0);
      // A pre-launch rejection publishes no agent-result journal: nothing ran under this fence.
      expect(
        existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
      ).toBe(false);
    },
  );

  it(
    "keeps blocking evidence-free supervisor V2 outcomes that claim the agent ran",
    { timeout: 60_000 },
    async () => {
      // The complementary guarantee: an evidence-free *success* still fails closed
      // under the generic protocol-breach code, because a success claims an agent
      // ran to completion and must carry the complete V2 closure.
      const f = fixture(92);
      const evidenceFreeSuccessAgent: LocalAgentAdapter = {
        adapterId: "agent.supervised-protocol",
        adapterVersion: "1.0.0",
        async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
          await context.assertActive();
          writeFileSync(
            join(context.spec.workingDirectory, "Sources/Greeter/GreetingFormatter.swift"),
            EXPECTED_GREETER_SOURCE,
          );
          return {
            kind: "succeeded",
            summary: "claims completion without a V2 closure",
            changedPaths: ["Sources/Greeter/GreetingFormatter.swift"],
          };
        },
      };
      const reviewCalls = { count: 0 };
      const service = await start(f, evidenceFreeSuccessAgent, reviewCalls);
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "failed";
      }, 30_000);

      expect((await client.status(intake.attemptId)).attempt.outcome).toMatchObject({
        kind: "failed",
        failure: { code: "local-execution.verification-failed", retryable: false },
      });
      expect(reviewCalls.count).toBe(0);
    },
  );

  it(
    "propagates an evidence-free supervisor V2 ambiguity blocker instead of failing the attempt",
    { timeout: 60_000 },
    async () => {
      // `supervisorAmbiguityOutcome` in CodexLocalAgent deliberately blocks (rather
      // than fails) so an operator can inspect the durable run identity before
      // resuming; that intent must reach the attempt as a blocker with its own code.
      const f = fixture(93);
      const ambiguousAgent: LocalAgentAdapter = {
        adapterId: "agent.supervised-protocol",
        adapterVersion: "1.0.0",
        async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
          await context.assertActive();
          return {
            kind: "needs-input",
            blocker: {
              kind: "environment",
              code: NamespacedCodeSchema.parse("agent.supervisor-ambiguous"),
              summary: "Durable Codex preparation failed closed: intent directory unreadable.",
              requiredAction:
                "Inspect the durable supervised-run identity and receipt before explicitly resuming or submitting a replacement attempt.",
            },
          };
        },
      };
      const reviewCalls = { count: 0 };
      const service = await start(f, ambiguousAgent, reviewCalls);
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await eventually(async () => {
        const status = await client.status(intake.attemptId);
        return status.attempt.state === "blocked";
      }, 30_000);

      const status = await client.status(intake.attemptId);
      expect(status.attempt.state).toBe("blocked");
      expect(status.attempt.blocker).toMatchObject({
        code: "agent.supervisor-ambiguous",
        summary: "Durable Codex preparation failed closed: intent directory unreadable.",
      });
      expect(reviewCalls.count).toBe(0);
    },
  );

  it("rejects invalid and oversized policy configuration", async () => {
    expect(() => decodeReviewedPolicyPayload(Buffer.from([0xff]))).toThrow(/valid UTF-8/u);
    expect(() => decodeReviewedPolicyPayload(Buffer.alloc(MAX_REVIEWED_POLICY_BYTES + 1))).toThrow(
      /1-/u,
    );

    const f = fixture(3);
    const reviewCalls = { count: 0 };
    const enrolledProject = project(f, new DeterministicSwiftAgent("succeed"), reviewCalls);
    expect(taskMatchesEnrolledProjectBase(enrolledProject, f.taskSpec)).toBe(true);
    expect(
      taskMatchesEnrolledProjectBase(
        enrolledProject,
        TaskSpecV1Schema.parse({
          ...f.taskSpec,
          base: { ...f.taskSpec.base, commit: "f".repeat(f.baseCommit.length) },
        }),
      ),
    ).toBe(false);
    expect(
      taskMatchesEnrolledProjectBase(
        enrolledProject,
        TaskSpecV1Schema.parse({
          ...f.taskSpec,
          base: {
            repositoryId: "62000000-0000-4000-8000-000000000099",
            commit: f.baseCommit,
          },
        }),
      ),
    ).toBe(false);
  });

  it("accepts a multi-turn agent limit configuration", async () => {
    const f = fixture(91);
    const reviewCalls = { count: 0 };
    const enrolledProject = project(f, new DeterministicSwiftAgent("succeed"), reviewCalls);
    const multiTurnProject: VerifiedLocalExecutionProject = {
      ...enrolledProject,
      agentLimits: {
        timeoutMs: 30_000,
        terminationGraceMs: 500,
        maxTurns: 2,
        maxEventCount: 1_000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      },
    };
    const service = await startFactoryDaemonService({
      runtimeDirectory: f.runtime,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-multi-turn-limit",
      localExecution: { projects: [multiTurnProject] },
    });
    services.push(service);
    expect(service.socketPath.length).toBeGreaterThan(0);
  });

  it(
    "aborts a long-running adapter when lease renewal fails and publishes no result",
    { timeout: 20_000 },
    async () => {
      const f = fixture(4);
      const agent = new DeterministicSwiftAgent("interrupt");
      const reviewCalls = { count: 0 };
      // Keep the injected scheduler wall clock unambiguously ahead of the
      // command-runtime timestamps. A fixed time on today's date becomes
      // order-dependent once the real wall clock passes it, and the scheduler
      // correctly refuses to move its monotonic clock backwards.
      let schedulerNow = new Date("2100-08-11T12:00:00.000Z");
      const service = await start(f, agent, reviewCalls, {
        leaseDurationMs: 1_000,
        schedulerClock: { now: () => schedulerNow },
      });
      const client = clientFor(service);
      const intake = await client.run(f.taskSpec);
      await agent.started();
      schedulerNow = new Date("2100-08-11T12:01:00.000Z");
      await agent.aborted();
      await service.close();

      expect(
        existsSync(join(service.executionPaths.agentResultRoot, `${intake.attemptId}.json`)),
      ).toBe(false);
      expect(
        new FileExecutionCheckpointStore(service.executionPaths.checkpointRoot).load(
          intake.attemptId,
        ),
      ).toBeNull();
      expect(reviewCalls.count).toBe(0);
    },
  );
});
