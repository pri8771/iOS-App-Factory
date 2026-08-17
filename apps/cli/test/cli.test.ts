import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CommandClientError } from "@app-factory/command-client";
import { canonicalStudioSnapshotDigestInputV1 } from "@app-factory/contracts";

import {
  CliUsageError,
  parseCliArguments,
  renderCliError,
  renderCommandResult,
  runCli,
  type CliIo,
} from "../src/index.js";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const PROJECT_ID = "00000000-0000-4000-8000-000000000006";
const PHASE_RUN_ID = "00000000-0000-4000-8000-0000000000f1";
const NOW = "2026-08-10T12:00:00.000Z";
const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";
const PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const MILESTONE_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_MILESTONE_ID = "00000000-0000-4000-8000-000000000022";
function withMilestoneOption(option: string, value: string): string[] {
  const argv = [...MILESTONE_UPSERT_ARGV];
  const index = argv.indexOf(option);
  if (index === -1) throw new Error(`${option} is not part of the base argv`);
  argv[index + 1] = value;
  return argv;
}

const MILESTONE_UPSERT_ARGV = [
  "project",
  "milestone",
  "upsert",
  "--project-id",
  PROJECT_ID,
  "--milestone-id",
  MILESTONE_ID,
  "--phase",
  "build",
  "--kind",
  "gate",
  "--label",
  "Owner approves TestFlight",
  "--owner",
  "human",
  "--status",
  "planned",
];

describe("CLI argument parser", () => {
  it.each([
    [["doctor"], { outputMode: "human", command: { kind: "doctor" } }],
    [["portfolio"], { outputMode: "human", command: { kind: "portfolio.snapshot" } }],
    [
      ["--json", "submit", "--task", "task.json"],
      { outputMode: "json", command: { kind: "task.submit", taskFile: "task.json" } },
    ],
    [
      ["run", "--task", "task.json", "--json"],
      { outputMode: "json", command: { kind: "task.run", taskFile: "task.json" } },
    ],
    [
      ["status", ATTEMPT_ID],
      { outputMode: "human", command: { kind: "attempt.status", attemptId: ATTEMPT_ID } },
    ],
    [
      ["attempts"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.list",
          scope: "active",
          projectId: null,
          after: null,
          limit: 50,
        },
      },
    ],
    [
      [
        "attempts",
        "--all",
        "--project",
        PROJECT_ID,
        "--after-updated-at",
        NOW,
        "--after-attempt",
        ATTEMPT_ID,
        "--limit",
        "25",
      ],
      {
        outputMode: "human",
        command: {
          kind: "attempt.list",
          scope: "all",
          projectId: PROJECT_ID,
          after: { updatedAt: NOW, attemptId: ATTEMPT_ID },
          limit: 25,
        },
      },
    ],
    [
      ["events", ATTEMPT_ID, "--after", "7", "--limit", "25"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.events",
          attemptId: ATTEMPT_ID,
          afterSequence: 7,
          limit: 25,
        },
      },
    ],
    [
      ["pause", ATTEMPT_ID, "--reason", "Review requested"],
      {
        outputMode: "human",
        command: {
          kind: "attempt.pause",
          attemptId: ATTEMPT_ID,
          reason: "Review requested",
        },
      },
    ],
    [
      ["resume", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "attempt.resume", attemptId: ATTEMPT_ID, reason: null },
      },
    ],
    [
      ["cancel", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "attempt.cancel", attemptId: ATTEMPT_ID, reason: null },
      },
    ],
    [
      ["retry", "00000000-0000-4000-8000-000000000008", ATTEMPT_ID],
      {
        outputMode: "human",
        command: {
          kind: "task.retry",
          taskId: "00000000-0000-4000-8000-000000000008",
          attemptId: ATTEMPT_ID,
        },
      },
    ],
    [
      ["unblock", ATTEMPT_ID, "--answer", "Use staging."],
      {
        outputMode: "human",
        command: { kind: "attempt.unblock", attemptId: ATTEMPT_ID, answer: "Use staging." },
      },
    ],
    [
      ["blocker", ATTEMPT_ID],
      { outputMode: "human", command: { kind: "attempt.blocker", attemptId: ATTEMPT_ID } },
    ],
    [
      ["reconcile"],
      { outputMode: "human", command: { kind: "daemon.reconcile", attemptId: null } },
    ],
    [
      ["reconcile", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "daemon.reconcile", attemptId: ATTEMPT_ID },
      },
    ],
    [
      ["evidence", "list", "--after", ATTEMPT_ID, "--limit", "25"],
      {
        outputMode: "human",
        command: { kind: "evidence.list", afterAttemptId: ATTEMPT_ID, limit: 25 },
      },
    ],
    [
      ["evidence", "inspect", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "evidence.inspect", attemptId: ATTEMPT_ID },
      },
    ],
    [
      ["evidence", "verify", ATTEMPT_ID],
      {
        outputMode: "human",
        command: { kind: "evidence.verify", attemptId: ATTEMPT_ID },
      },
    ],
    [
      ["run", "export", ATTEMPT_ID],
      { outputMode: "human", command: { kind: "run.export", attemptId: ATTEMPT_ID } },
    ],
    [
      ["--json", "run", "export", ATTEMPT_ID],
      { outputMode: "json", command: { kind: "run.export", attemptId: ATTEMPT_ID } },
    ],
    [
      ["project", "scan", "/repo/app"],
      { outputMode: "human", command: { kind: "project.scan", repositoryRoot: "/repo/app" } },
    ],
    [
      ["docs", "snapshot", "/repo/app"],
      {
        outputMode: "human",
        command: { kind: "project.docs.snapshot", repositoryRoot: "/repo/app" },
      },
    ],
    [
      ["project", "plan", PLAN_DIGEST],
      { outputMode: "human", command: { kind: "project.enroll-plan", planDigest: PLAN_DIGEST } },
    ],
    [
      ["project", "apply", PLAN_DIGEST],
      {
        outputMode: "human",
        command: { kind: "project.apply", planDigest: PLAN_DIGEST, branchName: null },
      },
    ],
    [
      ["project", "register", "/repo/app"],
      {
        outputMode: "human",
        command: {
          kind: "project.register",
          source: { kind: "path", repositoryRoot: "/repo/app" },
          displayName: null,
          slug: null,
        },
      },
    ],
    [
      ["project", "register", "--from-scan", PLAN_DIGEST, "--name", "App", "--slug", "app"],
      {
        outputMode: "human",
        command: {
          kind: "project.register",
          source: { kind: "scan", planDigest: PLAN_DIGEST },
          displayName: "App",
          slug: "app",
        },
      },
    ],
    [["project", "list"], { outputMode: "human", command: { kind: "project.list" } }],
    [
      ["project", "show", PROJECT_ID],
      { outputMode: "human", command: { kind: "project.show", projectId: PROJECT_ID } },
    ],
    [
      ["--json", "project", "apply", PLAN_DIGEST, "--branch", "app-factory/enroll-abc123"],
      {
        outputMode: "json",
        command: {
          kind: "project.apply",
          planDigest: PLAN_DIGEST,
          branchName: "app-factory/enroll-abc123",
        },
      },
    ],
    [["effects", "status"], { outputMode: "human", command: { kind: "effects.status" } }],
    [
      ["effects", "list"],
      {
        outputMode: "human",
        command: { kind: "effects.list", state: null, provider: null, after: null, limit: 50 },
      },
    ],
    [
      ["effects", "list", "--state", "planned", "--provider", "github", "--limit", "10"],
      {
        outputMode: "human",
        command: {
          kind: "effects.list",
          state: "planned",
          provider: "github",
          after: null,
          limit: 10,
        },
      },
    ],
    [
      [
        "effects",
        "list",
        "--after-updated-at",
        NOW,
        "--after-effect",
        "00000000-0000-4000-8000-000000000009",
      ],
      {
        outputMode: "human",
        command: {
          kind: "effects.list",
          state: null,
          provider: null,
          after: { updatedAt: NOW, effectId: "00000000-0000-4000-8000-000000000009" },
          limit: 50,
        },
      },
    ],
    [
      ["project", "milestones", PROJECT_ID],
      { outputMode: "human", command: { kind: "project.milestones.list", projectId: PROJECT_ID } },
    ],
    [
      MILESTONE_UPSERT_ARGV,
      {
        outputMode: "human",
        command: {
          kind: "project.milestone.upsert",
          upsert: {
            milestone: {
              milestoneId: MILESTONE_ID,
              projectId: PROJECT_ID,
              phase: "build",
              kind: "gate",
              label: "Owner approves TestFlight",
              targetDate: null,
              dependsOn: [],
              owner: "human",
              status: "planned",
              evidenceDigest: null,
            },
            expectedRevision: null,
          },
        },
      },
    ],
    [
      [
        ...MILESTONE_UPSERT_ARGV,
        "--target-date",
        "2026-09-01",
        "--depends-on",
        OTHER_MILESTONE_ID,
        "--evidence-digest",
        PLAN_DIGEST,
        "--expected-revision",
        "2",
        "--json",
      ],
      {
        outputMode: "json",
        command: {
          kind: "project.milestone.upsert",
          upsert: {
            milestone: {
              milestoneId: MILESTONE_ID,
              projectId: PROJECT_ID,
              phase: "build",
              kind: "gate",
              label: "Owner approves TestFlight",
              targetDate: "2026-09-01",
              dependsOn: [OTHER_MILESTONE_ID],
              owner: "human",
              status: "planned",
              evidenceDigest: PLAN_DIGEST,
            },
            expectedRevision: 2,
          },
        },
      },
    ],
    [["studio", "snapshot"], { outputMode: "human", command: { kind: "studio.snapshot" } }],
    [
      ["studio", "ask", "What is the status?"],
      {
        outputMode: "human",
        command: {
          kind: "studio.assistant.query",
          question: "What is the status?",
          projectId: null,
        },
      },
    ],
    [
      ["studio", "ask", "status?", "--project", PROJECT_ID],
      {
        outputMode: "human",
        command: { kind: "studio.assistant.query", question: "status?", projectId: PROJECT_ID },
      },
    ],
    [
      ["phase", "run", "ios-app-standard-0.4.0", "research", "--project", PROJECT_ID],
      {
        outputMode: "human",
        command: {
          kind: "phase.run",
          presetId: "ios-app-standard-0.4.0",
          phaseId: "research",
          projectId: PROJECT_ID,
        },
      },
    ],
    [
      ["phase", "run", "research", "--project", PROJECT_ID],
      {
        outputMode: "human",
        command: { kind: "phase.run", presetId: null, phaseId: "research", projectId: PROJECT_ID },
      },
    ],
    [
      ["phase", "status", PHASE_RUN_ID],
      { outputMode: "human", command: { kind: "phase.status", phaseRunId: PHASE_RUN_ID } },
    ],
    [
      ["phase", "list"],
      {
        outputMode: "human",
        command: { kind: "phase.list", projectId: null, state: null, limit: 50 },
      },
    ],
    [
      ["phase", "list", "--project", PROJECT_ID, "--state", "awaiting-human"],
      {
        outputMode: "human",
        command: {
          kind: "phase.list",
          projectId: PROJECT_ID,
          state: "awaiting-human",
          limit: 50,
        },
      },
    ],
    [
      ["phase", "approve", PHASE_RUN_ID],
      {
        outputMode: "human",
        command: { kind: "phase.approve", phaseRunId: PHASE_RUN_ID, reason: null },
      },
    ],
    [
      ["phase", "reject", PHASE_RUN_ID, "--reason", "Not ready"],
      {
        outputMode: "human",
        command: { kind: "phase.reject", phaseRunId: PHASE_RUN_ID, reason: "Not ready" },
      },
    ],
  ])("parses %j", (arguments_, expected) => {
    expect(parseCliArguments(arguments_)).toEqual({ ...expected, retryIdentity: null });
  });

  it("accepts the complete durable identity needed to retry an ambiguous command", () => {
    expect(
      parseCliArguments([
        "pause",
        ATTEMPT_ID,
        "--command-id",
        "00000000-0000-4000-8000-000000000004",
        "--issued-at",
        NOW,
      ]),
    ).toMatchObject({
      retryIdentity: {
        commandId: "00000000-0000-4000-8000-000000000004",
        issuedAt: NOW,
      },
      command: { kind: "attempt.pause", attemptId: ATTEMPT_ID },
    });
  });

  it("generates a milestone ID for a first create but never fills in a target date", () => {
    const argv = MILESTONE_UPSERT_ARGV.filter(
      (argument) => argument !== "--milestone-id" && argument !== MILESTONE_ID,
    );
    const first = parseCliArguments(argv);
    const second = parseCliArguments(argv);
    if (
      first.command.kind !== "project.milestone.upsert" ||
      second.command.kind !== "project.milestone.upsert"
    ) {
      throw new Error("Unexpected command kind");
    }
    expect(first.command.upsert.milestone.milestoneId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.command.upsert.milestone.milestoneId).not.toBe(
      second.command.upsert.milestone.milestoneId,
    );
    expect(first.command.upsert.milestone.targetDate).toBeNull();
    expect(first.command.upsert.expectedRevision).toBeNull();
  });

  it.each([
    [[]],
    [["unknown"]],
    [["doctor", "extra"]],
    [["submit"]],
    [["status", "not-an-id"]],
    [["attempts", "--project", "not-an-id"]],
    [["attempts", "--after-updated-at", NOW]],
    [["attempts", "--after-attempt", ATTEMPT_ID]],
    [["attempts", "--after-updated-at", "not-an-instant", "--after-attempt", ATTEMPT_ID]],
    [["attempts", "--limit", "101"]],
    [["attempts", "--all", "--all"]],
    [["events", ATTEMPT_ID, "--limit", "0"]],
    [["events", ATTEMPT_ID, "--limit", "1001"]],
    [["pause", ATTEMPT_ID, "--reason"]],
    [["retry", ATTEMPT_ID]],
    [["retry", "not-an-id", ATTEMPT_ID]],
    [["unblock", ATTEMPT_ID]],
    [["unblock", ATTEMPT_ID, "--answer"]],
    [["blocker"]],
    [["blocker", "not-an-id"]],
    [["evidence"]],
    [["evidence", "list", "--limit", "101"]],
    [["evidence", "inspect", "not-an-id"]],
    [["run", "export"]],
    [["run", "export", "not-an-id"]],
    [["run", "export", ATTEMPT_ID, "extra"]],
    [["run", "export", ATTEMPT_ID, "--task", "task.json"]],
    [["project"]],
    [["project", "unknown"]],
    [["project", "scan"]],
    [["project", "plan"]],
    [["project", "plan", "not-a-digest"]],
    [["project", "apply", "not-a-digest"]],
    [["project", "apply", PLAN_DIGEST, "--branch"]],
    [["project", "apply", PLAN_DIGEST, "--branch", "not a valid branch"]],
    [["project", "milestones"]],
    [["project", "milestones", "not-an-id"]],
    [["project", "milestones", PROJECT_ID, "extra"]],
    [["project", "milestone"]],
    [["project", "milestone", "delete"]],
    [["project", "milestone", "upsert"]],
    [
      [
        ...MILESTONE_UPSERT_ARGV.filter(
          (argument) => argument !== "--project-id" && argument !== PROJECT_ID,
        ),
      ],
    ],
    [[...MILESTONE_UPSERT_ARGV, "--target-date", "2026-02-30"]],
    [[...MILESTONE_UPSERT_ARGV, "--target-date", "tomorrow"]],
    [[...MILESTONE_UPSERT_ARGV, "--phase", "research"]],
    [withMilestoneOption("--phase", "Build Phase")],
    [withMilestoneOption("--kind", "wish")],
    [withMilestoneOption("--owner", "robot")],
    [withMilestoneOption("--status", "maybe")],
    [withMilestoneOption("--label", "")],
    [withMilestoneOption("--milestone-id", "not-an-id")],
    [[...MILESTONE_UPSERT_ARGV, "--depends-on", "not-an-id"]],
    [[...MILESTONE_UPSERT_ARGV, "--depends-on", MILESTONE_ID]],
    [
      [
        ...MILESTONE_UPSERT_ARGV,
        "--depends-on",
        OTHER_MILESTONE_ID,
        "--depends-on",
        OTHER_MILESTONE_ID,
      ],
    ],
    [[...MILESTONE_UPSERT_ARGV, "--expected-revision", "-1"]],
    [[...MILESTONE_UPSERT_ARGV, "--expected-revision", "1.5"]],
    [[...MILESTONE_UPSERT_ARGV, "--evidence-digest", "not-a-digest"]],
    [[...MILESTONE_UPSERT_ARGV, "--unknown", "x"]],
    [
      [
        ...MILESTONE_UPSERT_ARGV.filter(
          (argument) => argument !== "--milestone-id" && argument !== MILESTONE_ID,
        ),
        "--command-id",
        "00000000-0000-4000-8000-000000000004",
        "--issued-at",
        NOW,
      ],
    ],
    [["effects"]],
    [["effects", "unknown"]],
    [["effects", "status", "extra"]],
    [["effects", "list", "--state", "not-a-state"]],
    [["effects", "list", "--provider", "not-a-provider"]],
    [["effects", "list", "--limit", "101"]],
    [["effects", "list", "--after-updated-at", NOW]],
    [["effects", "list", "--after-effect", "00000000-0000-4000-8000-000000000009"]],
    [["effects", "list", "--after-updated-at", "not-an-instant", "--after-effect", ATTEMPT_ID]],
    [["doctor", "--json", "--json"]],
    [["service"]],
    [["service", "install", "--config", "service.json"]],
    [["service", "plan", "--config", "service.json"]],
    [["doctor", "--command-id", "00000000-0000-4000-8000-000000000004"]],
    [["doctor", "--issued-at", NOW]],
    [["doctor", "--command-id", "not-an-id", "--issued-at", NOW]],
    [
      [
        "doctor",
        "--command-id",
        "00000000-0000-4000-8000-000000000004",
        "--issued-at",
        "not-an-instant",
      ],
    ],
  ])("rejects invalid arguments %j", (arguments_) => {
    expect(() => parseCliArguments(arguments_)).toThrow(CliUsageError);
  });
});

describe("CLI output renderer", () => {
  it("renders concise deterministic human output", () => {
    expect(
      renderCommandResult(
        {
          operation: "doctor",
          readiness: "ready",
          daemonVersion: "0.1.0",
          protocolVersion: 1,
          startedAt: NOW,
          issues: [],
        },
        "human",
      ),
    ).toBe("daemon ready (v0.1.0, protocol 1)\n");

    expect(
      renderCommandResult(
        {
          operation: "attempt.events",
          events: [],
          nextAfterSequence: 0,
        },
        "human",
      ),
    ).toBe("no events\n");

    expect(
      renderCommandResult(
        {
          operation: "attempt.list",
          page: {
            attempts: [
              {
                schemaVersion: 1,
                projectId: PROJECT_ID,
                title: "Fix\nunsafe title",
                phase: null,
                attempt: {
                  schemaVersion: 1,
                  attemptId: ATTEMPT_ID,
                  taskId: "00000000-0000-4000-8000-000000000007",
                  taskSpecDigest: `sha256:${"a".repeat(64)}`,
                  attemptNumber: 1,
                  state: "queued",
                  desiredState: "running",
                  revision: 0,
                  fence: 0,
                  currentStepId: null,
                  blocker: null,
                  outcome: null,
                  createdAt: NOW,
                  updatedAt: NOW,
                  terminalAt: null,
                },
              },
            ],
            nextAfter: { updatedAt: NOW, attemptId: ATTEMPT_ID },
            hasMore: true,
          },
        },
        "human",
      ),
    ).toBe(
      `${ATTEMPT_ID}\tqueued\t${PROJECT_ID}\t(no phase)\t"Fix\\nunsafe title"\nmore after ${NOW} ${ATTEMPT_ID}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "task.retry",
          taskId: "00000000-0000-4000-8000-000000000007",
          attemptId: "00000000-0000-4000-8000-000000000008",
          state: "queued",
          priorAttemptId: ATTEMPT_ID,
        },
        "human",
      ),
    ).toBe(
      `task.retry: attempt 00000000-0000-4000-8000-000000000008 is queued (retried from ${ATTEMPT_ID})\n`,
    );

    expect(
      renderCommandResult(
        { operation: "attempt.unblock", attemptId: ATTEMPT_ID, state: "running", accepted: true },
        "human",
      ),
    ).toBe(`attempt.unblock: accepted for ${ATTEMPT_ID} (now running)\n`);

    expect(
      renderCommandResult(
        {
          operation: "portfolio.snapshot",
          snapshot: {
            schemaVersion: 1,
            generatedAt: NOW,
            projects: [],
            totals: {
              projects: 0,
              attempts: 0,
              activeAttempts: 0,
              blockers: 0,
              openPullRequests: null,
              jiraTodo: null,
              jiraInProgress: null,
              unresolvedP0: null,
              unresolvedP1: null,
            },
            sourceSnapshotDigest: `sha256:${"a".repeat(64)}`,
          },
        },
        "human",
      ),
    ).toBe(
      "portfolio: 0 projects, 0 attempts, 0 active, 0 blockers; PRs unavailable, Jira todo unavailable, P0 unavailable, P1 unavailable\n",
    );

    expect(
      renderCommandResult(
        {
          operation: "studio.snapshot",
          snapshot: {
            schemaVersion: 1,
            generatedAt: NOW,
            projects: [],
            rooms: [],
            roomsUnavailableReason: "not yet wired (studio/milestones-and-phase pending)",
            portfolio: {
              verifiedThisWeek: { value: 0, unavailableReason: null },
              awaitingYouCount: { value: 0, unavailableReason: null },
              passRate: { value: null, unavailableReason: "no succeeded or failed attempts" },
              medianRunSeconds: { value: null, unavailableReason: "no succeeded attempts" },
              agentWindowShare: { value: null, unavailableReason: "not yet computed" },
            },
            sourceSnapshotDigest: `sha256:${"a".repeat(64)}`,
          },
        },
        "human",
      ),
    ).toBe(
      [
        `studio: 0 project(s), digest sha256:${"a".repeat(64)}`,
        "verified this week: 0",
        "awaiting you: 0",
        "pass rate: unavailable (no succeeded or failed attempts)",
        "median run seconds: unavailable (no succeeded attempts)",
        "agent window share: unavailable (not yet computed)",
        "",
      ].join("\n"),
    );

    expect(
      renderCommandResult(
        {
          operation: "studio.assistant.query",
          answer: {
            kind: "answered",
            schemaVersion: 1,
            text: "Project Alpha's latest attempt is running.",
            citations: [{ kind: "attempt", id: ATTEMPT_ID }],
          },
        },
        "human",
      ),
    ).toBe(`Project Alpha's latest attempt is running.\ncitations: attempt:${ATTEMPT_ID}\n`);

    expect(
      renderCommandResult(
        {
          operation: "studio.assistant.query",
          answer: {
            kind: "cannot-answer",
            schemaVersion: 1,
            cannotAnswer: {
              reason: "no-milestone-target-date",
              detail: "No milestone with a real target date exists yet.",
            },
          },
        },
        "human",
      ),
    ).toBe(
      "cannot answer [no-milestone-target-date]: No milestone with a real target date exists yet.\n",
    );

    expect(
      renderCommandResult(
        {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockers: [],
        },
        "human",
      ),
    ).toBe(
      `project.scan: /repo/app\nplan digest: ${PLAN_DIGEST}\nfingerprint: ${PLAN_DIGEST}\ninventory digest: ${PLAN_DIGEST}\nnot blocked\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: true,
          blockers: [
            {
              issueId: "esi-000000000000000000000001",
              code: "safety.secret-material-detected",
              summary: "A file matches secret-shaped-file detection heuristics.",
            },
          ],
        },
        "human",
      ),
    ).toBe(
      `project.scan: /repo/app\nplan digest: ${PLAN_DIGEST}\nfingerprint: ${PLAN_DIGEST}\ninventory digest: ${PLAN_DIGEST}\nblocked by 1 issue(s):\n  esi-000000000000000000000001\tsafety.secret-material-detected\tA file matches secret-shaped-file detection heuristics.\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.docs.snapshot",
          snapshot: {
            schemaVersion: 1,
            repositoryRoot: "/repo/app",
            generatedAt: NOW,
            layout: "docs",
            docs: (
              [
                "status",
                "architecture",
                "features",
                "bugs",
                "decisions",
                "risks",
                "assumptions",
                "testPlan",
                "releaseChecklist",
                "handoff",
              ] as const
            ).map((key) => ({
              key,
              present: key !== "handoff",
              source:
                key === "handoff"
                  ? null
                  : { path: `docs/${key.toUpperCase()}.md`, sha256: PLAN_DIGEST, lineRange: null },
              legacySourced: false,
              looksSuperseded: false,
            })),
            lifecycleStatus: { value: "beta", unavailableReason: null, sources: [] },
            lastVerifiedAt: {
              value: null,
              unavailableReason: "no Last verified line",
              sources: [],
            },
            statusDatedEntries: { value: null, unavailableReason: "no dated entries", sources: [] },
            releaseChecklist: {
              value: { items: [], totalItems: 4, checkedItems: 3 },
              unavailableReason: null,
              sources: [],
            },
            openBugs: {
              value: { rows: [], totalCount: 5, openCount: 1 },
              unavailableReason: null,
              sources: [],
            },
            openRisks: { value: null, unavailableReason: "no RISKS.md table", sources: [] },
            decisions: { value: null, unavailableReason: "no DECISIONS.md entries", sources: [] },
            qualityManifest: { value: null, unavailableReason: "no quality manifest", sources: [] },
            completionReports: {
              value: null,
              unavailableReason: "no completion reports",
              sources: [],
            },
            snapshotDigest: PLAN_DIGEST,
          },
        },
        "human",
      ),
    ).toBe(
      `project.docs.snapshot: /repo/app (layout: docs, digest ${PLAN_DIGEST})\n` +
        "lifecycle status: beta\n" +
        "last verified: unavailable (no Last verified line)\n" +
        "release checklist: 3/4 checked\n" +
        "open bugs: 1/5\n" +
        "open risks: unavailable (no RISKS.md table)\n" +
        "missing docs: handoff\n",
    );

    expect(
      renderCommandResult(
        {
          operation: "project.enroll-plan",
          planDigest: PLAN_DIGEST,
          repositoryRoot: "/repo/app",
          plan: {
            schemaVersion: 1,
            mode: "proposal-only",
            requiresSourceRevalidation: true,
            sourceFingerprint: PLAN_DIGEST,
            inventoryDigest: PLAN_DIGEST,
            blocked: false,
            blockerIssueIds: [],
            actions: [],
          },
        },
        "human",
      ),
    ).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mode: "proposal-only",
          requiresSourceRevalidation: true,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockerIssueIds: [],
          actions: [],
        },
        null,
        2,
      )}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "project.apply",
          repositoryRoot: "/repo/app",
          baseHeadSha: "a".repeat(40),
          branchName: "app-factory/enroll-abc123",
          commitSha: "b".repeat(40),
          appliedActionKinds: ["declare-project", "declare-experience"],
          resolvedIssueIds: ["esi-000000000000000000000002"],
          skippedActions: [],
          convergence: {
            blocked: false,
            blockerIssueIds: [],
            openIssueCount: 3,
            sourceFingerprint: PLAN_DIGEST,
          },
        },
        "human",
      ),
    ).toBe(
      `project.apply: /repo/app\nbranch: app-factory/enroll-abc123\ncommit: ${"b".repeat(40)}\napplied: declare-project, declare-experience\nskipped: 0\nconvergence: clear, 3 open issue(s)\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 2,
              sent: 1,
              observed: 0,
              confirmed: 3,
              unknown: 0,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 3,
            pump: { enabled: true, lastActivityAt: NOW, lastErrorMessage: null },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=2 sent=1 observed=0 confirmed=3 unknown=0 manual-intervention=0 rejected=0\n" +
        `pending outbox: 3\npump: enabled, last activity ${NOW}\n`,
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 0,
              sent: 0,
              observed: 0,
              confirmed: 0,
              unknown: 0,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 0,
            pump: { enabled: false, lastActivityAt: null, lastErrorMessage: null },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=0 sent=0 observed=0 confirmed=0 unknown=0 manual-intervention=0 rejected=0\npending outbox: 0\npump: disabled\n",
    );

    expect(
      renderCommandResult(
        {
          operation: "effects.status",
          status: {
            counts: {
              planned: 0,
              sent: 0,
              observed: 0,
              confirmed: 0,
              unknown: 1,
              "manual-intervention": 0,
              rejected: 0,
            },
            pendingOutbox: 1,
            pump: { enabled: true, lastActivityAt: NOW, lastErrorMessage: "adapter unavailable" },
          },
        },
        "human",
      ),
    ).toBe(
      "effects: planned=0 sent=0 observed=0 confirmed=0 unknown=1 manual-intervention=0 rejected=0\n" +
        `pending outbox: 1\npump: enabled, last activity ${NOW}, last error: adapter unavailable\n`,
    );

    expect(
      renderCommandResult(
        { operation: "effects.list", page: { effects: [], nextAfter: null, hasMore: false } },
        "human",
      ),
    ).toBe("no effects\n");

    expect(
      renderCommandResult(
        {
          operation: "effects.list",
          page: {
            effects: [
              {
                schemaVersion: 1,
                effect: {
                  schemaVersion: 1,
                  effectId: ATTEMPT_ID,
                  attemptId: ATTEMPT_ID,
                  action: "github.merge-pr",
                  operationMarker: `app-factory:v1:github:merge:${ATTEMPT_ID}`,
                  target: {
                    provider: "github",
                    resourceType: "github.pull-request",
                    resourceKey: "owner/repository#42",
                  },
                  subject: {
                    projectId: PROJECT_ID,
                    taskId: null,
                    attemptId: null,
                    releaseId: null,
                  },
                  payloadDigest: `sha256:${"a".repeat(64)}`,
                  policyDigest: `sha256:${"a".repeat(64)}`,
                  approvalId: null,
                  state: "planned",
                  revision: 0,
                  sendCount: 0,
                  providerCorrelationKey: null,
                  createdAt: NOW,
                  updatedAt: NOW,
                  lastObservedAt: null,
                  nextReconcileAt: null,
                  detailDigest: null,
                },
              },
            ],
            nextAfter: { updatedAt: NOW, effectId: ATTEMPT_ID },
            hasMore: true,
          },
        },
        "human",
      ),
    ).toBe(
      `${ATTEMPT_ID}\tplanned\tgithub\tapp-factory:v1:github:merge:${ATTEMPT_ID}\nmore after ${NOW} ${ATTEMPT_ID}\n`,
    );
  });

  it("renders a run record as a compact human summary and a machine-stable JSON envelope", () => {
    const digest = (character: string) => `sha256:${character.repeat(64)}` as const;
    const runExport = {
      operation: "run.export",
      recordDigest: digest("d"),
      record: {
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        taskId: "00000000-0000-4000-8000-000000000008",
        attemptNumber: 1,
        state: "succeeded",
        implementingRunId: "00000000-0000-4000-8000-000000000011",
        repositoryId: "00000000-0000-4000-8000-000000000012",
        taskSpecDigest: digest("1"),
        policyDigest: digest("2"),
        baseCommit: "a".repeat(40),
        candidateTree: "b".repeat(40),
        fence: 3,
        brokerCommit: {
          commit: "c".repeat(40),
          tree: "b".repeat(40),
          commitDigest: digest("3"),
          attemptMarker: ATTEMPT_ID,
        },
        verification: [
          {
            checkId: "tests.swift",
            argv: ["/usr/bin/swift", "test"],
            checkoutTree: "b".repeat(40),
            startedAt: NOW,
            finishedAt: NOW,
            toolVersions: [{ name: "swift", version: "6.0" }],
            passed: true,
            exitCode: 0,
          },
        ],
        review: {
          reviewerId: "fixture.reviewer",
          reviewerVersion: "1.0.0",
          reviewerRunId: "00000000-0000-4000-8000-000000000013",
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
          usage: { inputTokens: 71_953, outputTokens: 923, cachedInputTokens: 53_248 },
        },
        timings: {
          attemptCreatedAt: NOW,
          attemptTerminalAt: NOW,
          agentStartedAt: NOW,
          agentFinishedAt: NOW,
          evidenceCreatedAt: NOW,
        },
      },
    } as const;

    const human = renderCommandResult(runExport, "human");
    expect(human).toBe(
      [
        `run record ${ATTEMPT_ID} (${digest("d")})`,
        "task: 00000000-0000-4000-8000-000000000008 attempt 1 fence 3",
        `task spec: ${digest("1")}`,
        `policy: ${digest("2")}`,
        `repository: 00000000-0000-4000-8000-000000000012 base ${"a".repeat(40)}`,
        `broker commit: ${"c".repeat(40)} tree ${"b".repeat(40)}`,
        "verification: tests.swift=passed",
        "review: pass by fixture.reviewer@1.0.0 (0 finding(s))",
        `evidence: manifest ${digest("5")} index ${digest("6")} (5 records, 20 artifacts)`,
        `agent: openai.codex@1.0.0 cli 0.148.0-alpha.9 model gpt-5.6-codex executable ${digest("7")}`,
        "tokens: 71953 in / 53248 cached / 923 out",
        `timings: attempt ${NOW} -> ${NOW}; agent ${NOW} -> ${NOW}; evidence ${NOW}`,
        "",
      ].join("\n"),
    );
    expect(JSON.parse(renderCommandResult(runExport, "json"))).toEqual({
      ok: true,
      result: runExport,
    });

    const legacyAgent = renderCommandResult(
      {
        ...runExport,
        record: {
          ...runExport.record,
          agent: {
            adapterId: "fixture.swift-greeter-agent",
            adapterVersion: null,
            cliVersion: null,
            model: null,
            executableDigest: null,
            usage: null,
          },
        },
      },
      "human",
    );
    expect(legacyAgent).toContain("agent: fixture.swift-greeter-agent\n");
    expect(legacyAgent).toContain("tokens: unavailable\n");
  });

  it("renders machine-stable JSON success and failure envelopes", () => {
    const success = renderCommandResult(
      {
        operation: "daemon.reconcile",
        accepted: true,
        reconciledAttemptIds: [],
      },
      "json",
    );
    expect(JSON.parse(success)).toEqual({
      ok: true,
      result: { operation: "daemon.reconcile", accepted: true, reconciledAttemptIds: [] },
    });

    const failure = renderCliError(new CliUsageError("Bad input."), "json");
    expect(JSON.parse(failure)).toEqual({
      ok: false,
      error: { code: "cli.usage", message: "Bad input.", retryable: false },
    });
  });

  it("renders a reusable durable identity for an ambiguous delivery failure", () => {
    const retryIdentity = {
      commandId: "00000000-0000-4000-8000-000000000004",
      issuedAt: NOW,
    } as const;
    const error = new CommandClientError(
      "transport.remote-closed",
      "The command response was lost.",
      true,
      retryIdentity,
    );

    expect(JSON.parse(renderCliError(error, "json"))).toEqual({
      ok: false,
      error: {
        code: "transport.remote-closed",
        message: "The command response was lost.",
        retryable: true,
        retryIdentity,
      },
    });
    expect(renderCliError(error, "human")).toContain(
      `--command-id ${retryIdentity.commandId} --issued-at ${retryIdentity.issuedAt}`,
    );
  });
});

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

/**
 * A minimal fake daemon that answers by request operation, for `runCli`
 * end-to-end tests. It also mirrors the real daemon's per-requestId replay
 * ledger (see apps/daemon/src/unix-command-server.ts RequestReplayLedger /
 * logicalRequestFingerprint): reusing a requestId for a different logical
 * request (different commandId/issuedAt/origin/operation/payload) fails the
 * call with `protocol.request-id-conflict`, exactly like production. A
 * client bug that reuses one identity across distinct calls -- such as
 * apps/cli diagnoseBlocker once did across its status/events/verifyEvidence
 * calls -- is caught here instead of only in production.
 */
async function startFakeDaemon(
  respond: (
    operation: string,
    requestId: string,
    request?: Readonly<{ payload: unknown }>,
  ) => Readonly<{ result: unknown } | { error: Readonly<Record<string, unknown>> }>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-cli-"));
  roots.push(root);
  const socketPath = join(root, "daemon.sock");
  const seenRequestFingerprints = new Map<string, string>();
  const server = createServer((socket: Socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = JSON.parse(buffer.slice(0, newline)) as Readonly<{
        requestId: string;
        request: Readonly<{
          commandId: unknown;
          issuedAt: unknown;
          origin: unknown;
          operation: string;
          payload: unknown;
        }>;
      }>;
      const fingerprint = JSON.stringify({
        commandId: frame.request.commandId,
        issuedAt: frame.request.issuedAt,
        origin: frame.request.origin,
        operation: frame.request.operation,
        payload: frame.request.payload,
      });
      const previousFingerprint = seenRequestFingerprints.get(frame.requestId);
      if (previousFingerprint !== undefined && previousFingerprint !== fingerprint) {
        const conflict = {
          protocolVersion: 1,
          requestId: frame.requestId,
          ok: false,
          error: {
            code: "protocol.request-id-conflict",
            message: "The request ID was already used for a different command.",
            retryable: false,
          },
        };
        socket.end(`${JSON.stringify(conflict)}\n`);
        return;
      }
      seenRequestFingerprints.set(frame.requestId, fingerprint);
      const outcome = respond(frame.request.operation, frame.requestId, frame.request);
      const response =
        "result" in outcome
          ? { protocolVersion: 1, requestId: frame.requestId, ok: true, result: outcome.result }
          : {
              protocolVersion: 1,
              requestId: frame.requestId,
              ok: false,
              error: outcome.error,
            };
      socket.end(`${JSON.stringify(response)}\n`);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return socketPath;
}

function fakeIo(): Readonly<{
  io: CliIo;
  captured: () => Readonly<{ stdout: string; stderr: string }>;
}> {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: (value: string) => {
        stdout += value;
      },
      stderr: (value: string) => {
        stderr += value;
      },
    },
    captured: () => ({ stdout, stderr }),
  };
}

describe("runCli attempt blocker diagnosis", () => {
  const blockedAttempt = {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    taskId: "00000000-0000-4000-8000-000000000007",
    taskSpecDigest: `sha256:${"a".repeat(64)}`,
    attemptNumber: 1,
    state: "blocked",
    desiredState: "running",
    revision: 4,
    fence: 1,
    currentStepId: "00000000-0000-4000-8000-000000000009",
    blocker: {
      kind: "clarification",
      code: "task.needs-input",
      summary: "Which environment should this target?",
      requiredAction: "Answer the question and unblock the attempt.",
    },
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    terminalAt: null,
  } as const;

  it("prints the blocker code, step, and evidence summaries", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: blockedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: {
            operation: "attempt.events",
            events: [
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000010",
                attemptId: ATTEMPT_ID,
                sequence: 4,
                occurredAt: NOW,
                commandId: null,
                causationEventId: null,
                fence: 1,
                type: "step.created",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  ordinal: 0,
                  operation: "factory.execute",
                  inputDigest: `sha256:${"b".repeat(64)}`,
                },
              },
            ],
            nextAfterSequence: 4,
          },
        };
      }
      if (operation === "evidence.verify") {
        return {
          result: {
            operation: "evidence.verify",
            integrityVerified: true,
            manifest: {
              attemptId: ATTEMPT_ID,
              createdAt: NOW,
              manifestDigest: `sha256:${"c".repeat(64)}`,
              subject: {
                taskSpecDigest: `sha256:${"a".repeat(64)}`,
                policyDigest: `sha256:${"d".repeat(64)}`,
                baseCommit: "e".repeat(40),
                candidateTree: null,
                fence: 1,
              },
              entryCount: 1,
              requiredKinds: ["agent-run"],
            },
            evidence: [
              {
                evidenceId: "00000000-0000-4000-8000-000000000011",
                digest: `sha256:${"f".repeat(64)}`,
                kind: "agent-run",
                createdAt: NOW,
                producer: "app-factory.agent",
                artifactCount: 2,
              },
            ],
            artifactCount: 2,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const { stdout, stderr } = captured();
    expect(stderr).toBe("");
    expect(stdout).toContain(`attempt ${ATTEMPT_ID}: blocked`);
    expect(stdout).toContain("code: task.needs-input");
    expect(stdout).toContain("summary: Which environment should this target?");
    expect(stdout).toContain("step: 00000000-0000-4000-8000-000000000009 (factory.execute)");
    expect(stdout).toContain("agent-run");
    expect(stdout).toContain("00000000-0000-4000-8000-000000000011");
  });

  it("reports when the attempt is neither blocked nor failed, without querying events or evidence", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return {
          result: {
            operation: "attempt.status",
            attempt: { ...blockedAttempt, state: "running", blocker: null },
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", "blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(captured().stdout)).toEqual({
      ok: true,
      result: {
        operation: "attempt.blocker",
        diagnosed: false,
        attemptId: ATTEMPT_ID,
        state: "running",
      },
    });
  });

  it("surfaces the failure code and last-known step for a failed attempt without a current step", async () => {
    const failedAttempt = {
      ...blockedAttempt,
      state: "failed",
      currentStepId: null,
      blocker: null,
      outcome: {
        kind: "failed",
        failure: {
          code: "task.execution-failed",
          summary: "The verify step exited non-zero.",
          retryable: true,
          detailArtifactDigest: null,
        },
      },
      terminalAt: NOW,
    } as const;
    const socketPath = await startFakeDaemon((operation) => {
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: failedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: {
            operation: "attempt.events",
            events: [
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000010",
                attemptId: ATTEMPT_ID,
                sequence: 4,
                occurredAt: NOW,
                commandId: null,
                causationEventId: null,
                fence: 1,
                type: "step.created",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  ordinal: 1,
                  operation: "factory.verify",
                  inputDigest: `sha256:${"b".repeat(64)}`,
                },
              },
              {
                schemaVersion: 1,
                eventId: "00000000-0000-4000-8000-000000000012",
                attemptId: ATTEMPT_ID,
                sequence: 5,
                occurredAt: NOW,
                commandId: null,
                causationEventId: "00000000-0000-4000-8000-000000000010",
                fence: 1,
                type: "step.state-changed",
                data: {
                  stepId: "00000000-0000-4000-8000-000000000009",
                  from: "running",
                  to: "failed",
                  outputDigest: null,
                  failureCode: "task.execution-failed",
                },
              },
            ],
            nextAfterSequence: 5,
          },
        };
      }
      if (operation === "evidence.verify") {
        return {
          error: {
            code: "evidence.not-found",
            message: "No evidence manifest exists for this attempt.",
            retryable: false,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const { stdout } = captured();
    expect(stdout).toContain(`attempt ${ATTEMPT_ID}: failed`);
    expect(stdout).toContain("code: task.execution-failed");
    expect(stdout).toContain("step: 00000000-0000-4000-8000-000000000009 (factory.verify)");
    expect(stdout).toContain("evidence: none recorded");
  });

  it("gives the status, events, and evidence calls each a distinct request identity", async () => {
    // Regression test: diagnoseBlocker once reused one CommandIdentity (and
    // therefore one requestId) across all three calls. The real daemon keys
    // its replay/conflict ledger on requestId, so reusing it for different
    // operations fails the second and third call with
    // protocol.request-id-conflict -- the fake daemon above reproduces that
    // exact check. This test both proves the three calls all succeed (which
    // requires three distinct requestIds) and records the requestIds seen to
    // assert directly on their distinctness.
    const requestIdsByOperation = new Map<string, string[]>();
    const socketPath = await startFakeDaemon((operation, requestId) => {
      const seen = requestIdsByOperation.get(operation) ?? [];
      seen.push(requestId);
      requestIdsByOperation.set(operation, seen);
      if (operation === "attempt.status") {
        return { result: { operation: "attempt.status", attempt: blockedAttempt } };
      }
      if (operation === "attempt.events") {
        return {
          result: { operation: "attempt.events", events: [], nextAfterSequence: 0 },
        };
      }
      if (operation === "evidence.verify") {
        return {
          error: {
            code: "evidence.not-found",
            message: "No evidence manifest exists for this attempt.",
            retryable: false,
          },
        };
      }
      throw new Error(`Unexpected operation in test: ${operation}`);
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["blocker", ATTEMPT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(captured().stderr).toBe("");
    expect(exitCode).toBe(0);
    const allRequestIds = [
      ...(requestIdsByOperation.get("attempt.status") ?? []),
      ...(requestIdsByOperation.get("attempt.events") ?? []),
      ...(requestIdsByOperation.get("evidence.verify") ?? []),
    ];
    expect(allRequestIds).toHaveLength(3);
    expect(new Set(allRequestIds).size).toBe(3);
  });
});

describe("runCli project enrollment", () => {
  it("scans a repository given an already-absolute path", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.scan") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.scan",
          repositoryRoot: "/repo/app",
          planDigest: PLAN_DIGEST,
          sourceFingerprint: PLAN_DIGEST,
          inventoryDigest: PLAN_DIGEST,
          blocked: false,
          blockers: [],
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "scan", "/repo/app"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("project.scan: /repo/app");
    expect(captured().stdout).toContain("not blocked");
  });

  it("fetches the full stored plan as JSON", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.enroll-plan")
        throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.enroll-plan",
          planDigest: PLAN_DIGEST,
          repositoryRoot: "/repo/app",
          plan: {
            schemaVersion: 1,
            mode: "proposal-only",
            requiresSourceRevalidation: true,
            sourceFingerprint: PLAN_DIGEST,
            inventoryDigest: PLAN_DIGEST,
            blocked: false,
            blockerIssueIds: [],
            actions: [],
          },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "plan", PLAN_DIGEST],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(captured().stdout)).toMatchObject({
      sourceFingerprint: PLAN_DIGEST,
      blocked: false,
    });
  });

  it("applies a plan with an explicit branch name", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.apply") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.apply",
          repositoryRoot: "/repo/app",
          baseHeadSha: "a".repeat(40),
          branchName: "app-factory/enroll-abc123",
          commitSha: "b".repeat(40),
          appliedActionKinds: ["declare-project"],
          resolvedIssueIds: [],
          skippedActions: [],
          convergence: {
            blocked: false,
            blockerIssueIds: [],
            openIssueCount: 0,
            sourceFingerprint: PLAN_DIGEST,
          },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "apply", PLAN_DIGEST, "--branch", "app-factory/enroll-abc123"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("branch: app-factory/enroll-abc123");
    expect(captured().stdout).toContain("convergence: clear, 0 open issue(s)");
  });

  it("surfaces a fingerprint-drift failure as a distinct, non-retryable error code", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.apply") throw new Error(`Unexpected operation: ${operation}`);
      return {
        error: {
          code: "project.apply-fingerprint-drift",
          message: "the enrollment plan's sourceFingerprint no longer matches a fresh scan",
          retryable: false,
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", "project", "apply", PLAN_DIGEST],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(captured().stderr)).toMatchObject({
      ok: false,
      error: { code: "project.apply-fingerprint-drift", retryable: false },
    });
  });
});

describe("runCli project register / list / show", () => {
  const REGISTERED_PROJECT = {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    slug: "app",
    displayName: "App",
    sourceRepositoryPath: "/repo/app",
    repositoryId: PROJECT_ID,
    standardVersion: null,
    policyLockDigest: null,
    docsLayout: { docsDir: "docs" },
    enrolledAt: "2026-08-16T09:00:00.000Z",
    revision: 0,
    updatedAt: "2026-08-16T09:00:00.000Z",
  };

  it("registers a project from a bare repository path", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.register") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.register",
          project: REGISTERED_PROJECT,
          created: true,
          secretFindings: [],
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "register", "/repo/app"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain(`project.register: registered ${PROJECT_ID}`);
    expect(captured().stdout).toContain("secret findings: none");
  });

  it("surfaces a rules.* blocker refusal as a distinct, non-retryable error code", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.register") throw new Error(`Unexpected operation: ${operation}`);
      return {
        error: {
          code: "project.register-blocked",
          message: "The repository has unresolved rules.* blocker(s): ...",
          retryable: false,
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", "project", "register", "/repo/app"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(captured().stderr)).toMatchObject({
      ok: false,
      error: { code: "project.register-blocked", retryable: false },
    });
  });

  it("lists every registered project", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.list") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "project.list", projects: [REGISTERED_PROJECT] } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "list"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain(PROJECT_ID);
    expect(captured().stdout).toContain("app");
  });

  it("shows one registered project by ID", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.show") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "project.show", project: REGISTERED_PROJECT } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "show", PROJECT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain(`project.show: ${PROJECT_ID}`);
    expect(captured().stdout).toContain("docs layout: docs/");
  });
});

describe("runCli project milestones", () => {
  const dated = {
    schemaVersion: 1,
    milestoneId: MILESTONE_ID,
    projectId: PROJECT_ID,
    phase: "build",
    kind: "stage",
    label: "Core loop builds green",
    targetDate: "2026-09-01",
    dependsOn: [],
    owner: "machine",
    status: "done",
    evidenceDigest: PLAN_DIGEST,
    revision: 2,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const undated = {
    ...dated,
    milestoneId: OTHER_MILESTONE_ID,
    kind: "gate",
    phase: "release",
    label: "Owner approves TestFlight",
    targetDate: null,
    dependsOn: [MILESTONE_ID],
    owner: "human",
    status: "planned",
    evidenceDigest: null,
    revision: 0,
  };
  const timeline = {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    generatedAt: NOW,
    milestones: [dated, undated],
    actuals: {
      phases: [
        {
          phase: "build",
          attemptCount: 2,
          activeAttemptCount: 1,
          blockerCount: 0,
          succeededAttemptCount: 1,
          firstAttemptAt: "2026-08-09T12:00:00.000Z",
          lastActivityAt: NOW,
          lastSucceededAt: NOW,
        },
      ],
      lifecycle: [],
    },
    sources: { localExecution: "available", lifecycleEvents: "unavailable" },
  };

  it("lists a project's timeline and renders an undated milestone as won't guess", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.milestones.list") {
        throw new Error(`Unexpected operation: ${operation}`);
      }
      return { result: { operation: "project.milestones.list", timeline } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "milestones", PROJECT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const lines = captured().stdout.split("\n");
    expect(lines[0]).toBe(
      `project.milestones: ${PROJECT_ID} (2 milestones, 1 phases with attempts; lifecycle events unavailable)`,
    );
    expect(lines[1]).toBe(
      `${MILESTONE_ID}\tdone\tstage\tbuild\t2026-09-01\tmachine\tr2\t"Core loop builds green"`,
    );
    expect(lines[2]).toBe(
      `${OTHER_MILESTONE_ID}\tplanned\tgate\trelease\twon't guess\thuman\tr0\t"Owner approves TestFlight"`,
    );
    expect(lines[3]).toBe("actuals:");
    expect(lines[4]).toBe(
      `build\t2 attempts, 1 active, 0 blocked, 1 succeeded\tfirst 2026-08-09T12:00:00.000Z\tlast ${NOW}\tsucceeded ${NOW}`,
    );
    expect(captured().stdout).not.toContain("null");
  });

  it("upserts a milestone, sending null for an omitted target date, and renders the result", async () => {
    let payload: unknown;
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.milestone.upsert") {
        throw new Error(`Unexpected operation: ${operation}`);
      }
      return {
        result: {
          operation: "project.milestone.upsert",
          milestone: {
            ...undated,
            milestoneId: MILESTONE_ID,
            phase: "build",
            dependsOn: [],
          },
          created: true,
        },
      };
    });
    const server = servers.at(-1);
    server?.prependListener("connection", (socket: Socket) => {
      let buffer = "";
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        payload = (JSON.parse(buffer.slice(0, newline)) as { request: { payload: unknown } })
          .request.payload;
      });
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      MILESTONE_UPSERT_ARGV,
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(payload).toEqual({
      milestone: {
        milestoneId: MILESTONE_ID,
        projectId: PROJECT_ID,
        phase: "build",
        kind: "gate",
        label: "Owner approves TestFlight",
        targetDate: null,
        dependsOn: [],
        owner: "human",
        status: "planned",
        evidenceDigest: null,
      },
      expectedRevision: null,
    });
    expect(captured().stdout).toBe(
      `project.milestone.upsert: created ${MILESTONE_ID} r0 planned gate build target won't guess "Owner approves TestFlight"\n`,
    );
  });

  it("surfaces a revision conflict as a distinct, non-retryable error code", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.milestone.upsert") {
        throw new Error(`Unexpected operation: ${operation}`);
      }
      return {
        error: {
          code: "milestone.revision-conflict",
          message: "milestone is at revision 3, not 2",
          retryable: false,
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["--json", ...MILESTONE_UPSERT_ARGV, "--expected-revision", "2"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(captured().stderr)).toMatchObject({
      ok: false,
      error: { code: "milestone.revision-conflict", retryable: false },
    });
  });
});

describe("runCli phases", () => {
  const phase = {
    schemaVersion: 1,
    phaseId: "contract",
    name: "Contract",
    purpose: "Define the user outcome, MVP boundary, and Definition of Done.",
    mode: "solo",
    cast: {
      participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: {
      standard: ["rule.new.scope-before-breadth"],
      yours: [],
      requiredOutput: [],
      acceptanceChecks: [],
    },
    outputs: [{ path: "docs/product/contract.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const gatePhase = {
    ...phase,
    phaseId: "ready",
    name: "Ready",
    mode: "chat",
    cast: { participants: [], coordinator: null, grader: null },
    gates: ["build", "tests"],
  };
  const preset = {
    schemaVersion: 1,
    presetId: "ios-app-standard-0.4.0",
    name: "iOS App Standard 0.4.0",
    phases: [phase, gatePhase],
    appliesTo: ["ios"],
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("lists every preset", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "preset.list") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "preset.list", presets: [preset] } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phases", "list"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe(
      'ios-app-standard-0.4.0\tr0\t2 phase(s)\t"iOS App Standard 0.4.0"\n',
    );
  });

  it("reports no presets honestly rather than an empty table", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "preset.list") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "preset.list", presets: [] } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phases", "list"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe("no presets\n");
  });

  it("shows one preset's ordered phases, fetched via preset.list and filtered client-side", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "preset.list") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "preset.list", presets: [preset] } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phases", "show", "ios-app-standard-0.4.0"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const lines = captured().stdout.split("\n");
    expect(lines[0]).toBe('ios-app-standard-0.4.0 r0 "iOS App Standard 0.4.0" (applies to: ios)');
    expect(lines[1]).toBe('1. contract\tsolo\t"Contract"\tcast: claude/contract-writer');
    expect(lines[2]).toBe(
      '2. ready\tchat ◆gate[build,tests]\t"Ready"\tcast: (no agent participants)',
    );
  });

  it("fails clearly when the named preset does not exist", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "preset.list") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "preset.list", presets: [preset] } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phases", "show", "no-such-preset"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(2);
    expect(captured().stderr).toContain("No preset named no-such-preset exists");
  });

  it("rejects an invalid preset ID before contacting the daemon", async () => {
    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phases", "show", "Not A Valid Id"],
      {
        APP_FACTORY_SOCKET: "/private/tmp/does-not-need-to-exist.sock",
        APP_FACTORY_AUTH_TOKEN: AUTHORIZATION,
      },
      io,
    );

    expect(exitCode).toBe(2);
    expect(captured().stderr).toContain("preset ID must be a stable lowercase key");
  });
});

describe("runCli plan", () => {
  const PLAN_ID = "00000000-0000-4000-8000-000000000031";
  const REPOSITORY_ID = "00000000-0000-4000-8000-000000000032";

  function samplePlan(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      schemaVersion: 1,
      planId: PLAN_ID,
      projectId: PROJECT_ID,
      repositoryId: REPOSITORY_ID,
      brief: { title: "Sample App", oneLiner: "A sample app.", constraints: ["local-only"] },
      presetId: "ios-app-standard-0.4.0",
      items: [
        {
          itemId: "contract",
          kind: "task",
          phase: "contract",
          title: "Contract",
          detail: null,
          taskSpecDraft: {
            objective: "Define the outcome.",
            acceptanceCriteria: [{ id: "ac-1", statement: "Stated.", verification: "review" }],
            scope: { paths: ["docs"] },
            phase: "contract",
          },
          dependsOn: [],
          status: "proposed",
          taskId: null,
          attemptId: null,
        },
        {
          itemId: "ready",
          kind: "gate",
          phase: "ready",
          title: "Ready",
          detail: null,
          gate: { owner: "human", reason: "Confirm before build." },
          dependsOn: ["contract"],
          status: "proposed",
        },
      ],
      state: "draft",
      revision: 0,
      createdAt: NOW,
      updatedAt: NOW,
      digest: `sha256:${"b".repeat(64)}`,
      ...overrides,
    };
  }

  it("proposes a plan from --preset/--title/--one-liner/--constraint", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "plan.propose") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "plan.propose", plan: samplePlan() } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      [
        "plan",
        "propose",
        "--preset",
        "ios-app-standard-0.4.0",
        "--title",
        "Sample App",
        "--one-liner",
        "A sample app.",
        "--constraint",
        "local-only",
        "--constraint",
        "xcodegen",
      ],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    const lines = captured().stdout.split("\n");
    expect(lines[0]).toContain(PLAN_ID);
    expect(lines[0]).toContain("draft");
    expect(lines[1]).toContain("1.  [task] contract");
    expect(lines[2]).toContain("2. ◆[gate] ready");
  });

  it("shows a plan's current state via plan.status", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "plan.status") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: { operation: "plan.status", plan: samplePlan({ state: "approved", revision: 1 }) },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "show", PLAN_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("approved");
    expect(captured().stdout).toContain("r1");
  });

  it("executes a plan with --expected-revision", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "plan.execute") throw new Error(`Unexpected operation: ${operation}`);
      return { result: { operation: "plan.execute", plan: samplePlan({ state: "executing" }) } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "execute", PLAN_ID, "--expected-revision", "0"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("executing");
  });

  it("approves a pending gate item", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "plan.approve-gate") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "plan.approve-gate",
          plan: samplePlan({
            state: "executing",
            items: [samplePlan().items[0], { ...samplePlan().items[1], status: "approved" }],
          }),
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "approve-gate", PLAN_ID, "ready", "--expected-revision", "1"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("2. ◆[gate] ready\tapproved");
  });

  it("ticks a plan and reports whether it advanced", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "plan.tick") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: { operation: "plan.tick", plan: samplePlan({ state: "complete" }), advanced: true },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "tick", PLAN_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout.split("\n")[0]).toBe("advanced");
    expect(captured().stdout).toContain("complete");
  });

  it("rejects propose without --title before contacting the daemon", async () => {
    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "propose", "--preset", "ios-app-standard-0.4.0", "--one-liner", "x"],
      {
        APP_FACTORY_SOCKET: "/private/tmp/does-not-need-to-exist.sock",
        APP_FACTORY_AUTH_TOKEN: AUTHORIZATION,
      },
      io,
    );

    expect(exitCode).toBe(2);
    expect(captured().stderr).toContain("--title is required");
  });

  it("rejects execute without --expected-revision before contacting the daemon", async () => {
    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["plan", "execute", PLAN_ID],
      {
        APP_FACTORY_SOCKET: "/private/tmp/does-not-need-to-exist.sock",
        APP_FACTORY_AUTH_TOKEN: AUTHORIZATION,
      },
      io,
    );

    expect(exitCode).toBe(2);
    expect(captured().stderr).toContain("--expected-revision");
  });
});

describe("runCli phase", () => {
  const phaseSnapshot = {
    schemaVersion: 1,
    phaseId: "research",
    name: "Research",
    purpose: "Inventory prior art before proposing a design.",
    mode: "solo",
    cast: {
      participants: [{ provider: "ollama", persona: "researcher", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [{ path: "docs/product/research.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
  function run(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      schemaVersion: 1,
      phaseRunId: PHASE_RUN_ID,
      presetId: "ios-app-standard-0.4.0",
      phaseId: "research",
      projectId: PROJECT_ID,
      phaseSnapshotDigest: `sha256:${"a".repeat(64)}`,
      phaseSnapshot,
      state: "succeeded",
      revision: 2,
      roomId: null,
      outputs: [
        {
          path: "docs/product/research.md",
          digest: `sha256:${"b".repeat(64)}`,
          evidence: {
            commit: "c".repeat(40),
            tree: "d".repeat(40),
            branch: "factory/phase/research/x",
          },
        },
      ],
      graderVerdict: null,
      tokenUsage: { totalTokens: 120 },
      outcome: { kind: "succeeded" },
      createdAt: NOW,
      startedAt: NOW,
      finishedAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it("runs a phase from a preset and reports its terminal state", async () => {
    const socketPath = await startFakeDaemon((operation, _requestId, request) => {
      if (operation !== "phase.run") throw new Error(`Unexpected operation: ${operation}`);
      expect(request?.payload).toEqual({
        presetId: "ios-app-standard-0.4.0",
        phaseId: "research",
        projectId: PROJECT_ID,
        inputsOverride: null,
      });
      return { result: { operation: "phase.run", run: run() } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phase", "run", "ios-app-standard-0.4.0", "research", "--project", PROJECT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe(
      `phase.run: ${PHASE_RUN_ID} research is succeeded (revision 2)\noutputs: docs/product/research.md\noutcome: succeeded\n`,
    );
  });

  it("reports an awaiting-human run", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "phase.status") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "phase.status",
          run: run({ state: "awaiting-human", outcome: null, finishedAt: null, outputs: [] }),
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phase", "status", PHASE_RUN_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe(
      `phase.status: ${PHASE_RUN_ID} research is awaiting-human (revision 2)\n`,
    );
  });

  it("approves an awaiting-human run", async () => {
    const socketPath = await startFakeDaemon((operation, _requestId, request) => {
      if (operation !== "phase.approve") throw new Error(`Unexpected operation: ${operation}`);
      expect(request?.payload).toEqual({ phaseRunId: PHASE_RUN_ID, reason: null });
      return { result: { operation: "phase.approve", run: run() } };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phase", "approve", PHASE_RUN_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("phase.approve:");
  });

  it("rejects an awaiting-human run with a reason", async () => {
    const socketPath = await startFakeDaemon((operation, _requestId, request) => {
      if (operation !== "phase.reject") throw new Error(`Unexpected operation: ${operation}`);
      expect(request?.payload).toEqual({ phaseRunId: PHASE_RUN_ID, reason: "Not ready" });
      return {
        result: {
          operation: "phase.reject",
          run: run({
            state: "failed",
            outcome: { kind: "failed", code: "rejected", summary: "Not ready" },
          }),
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phase", "reject", PHASE_RUN_ID, "--reason", "Not ready"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("outcome: failed (rejected) Not ready");
  });

  it("lists phase runs", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "phase.list") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "phase.list",
          page: { runs: [run()], nextAfter: null, hasMore: false },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["phase", "list", "--project", PROJECT_ID],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe(`${PHASE_RUN_ID}\tresearch\t${PROJECT_ID}\tsucceeded\tr2\n`);
  });
});

describe("runCli project seed", () => {
  it("seeds a new project and reports the scaffold, xcodegen, and enrollment outcome", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "project.seed") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "project.seed",
          repositoryRoot: "/tmp/seeded-app",
          scaffoldCommitSha: "d".repeat(40),
          planDigest: `sha256:${"c".repeat(64)}`,
          enrollment: {
            branchName: "app-factory/enroll-abc123",
            commitSha: "e".repeat(40),
            appliedActionKinds: ["declare-project"],
            convergence: {
              blocked: false,
              blockerIssueIds: [],
              openIssueCount: 0,
              sourceFingerprint: `sha256:${"f".repeat(64)}`,
            },
          },
          xcodegen: { available: true, generated: true, built: true, detail: "ok" },
          registered: true,
          projectId: "82000000-0000-4000-8000-000000000001",
          repositoryId: "82000000-0000-4000-8000-000000000001",
          slug: "seeded-app",
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "seed", "/tmp/seeded-app", "--name", "Seeded App"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("project.seed: /tmp/seeded-app");
    expect(captured().stdout).toContain("convergence: clear");
  });

  it("requires --name before contacting the daemon", async () => {
    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["project", "seed", "/tmp/seeded-app"],
      {
        APP_FACTORY_SOCKET: "/private/tmp/does-not-need-to-exist.sock",
        APP_FACTORY_AUTH_TOKEN: AUTHORIZATION,
      },
      io,
    );

    expect(exitCode).toBe(2);
    expect(captured().stderr).toContain("--name is required");
  });
});

describe("runCli studio surface", () => {
  it("fetches and verifies the studio snapshot digest", async () => {
    const snapshot = {
      schemaVersion: 1,
      generatedAt: NOW,
      projects: [],
      rooms: [],
      roomsUnavailableReason: "not yet wired (studio/milestones-and-phase pending)",
      portfolio: {
        verifiedThisWeek: { value: 0, unavailableReason: null },
        awaitingYouCount: { value: 0, unavailableReason: null },
        passRate: { value: null, unavailableReason: "no data" },
        medianRunSeconds: { value: null, unavailableReason: "no data" },
        agentWindowShare: { value: null, unavailableReason: "not yet computed" },
      },
    };
    const sourceSnapshotDigest = `sha256:${createHash("sha256")
      .update(canonicalStudioSnapshotDigestInputV1(snapshot as never))
      .digest("hex")}`;

    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "studio.snapshot") throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: { operation: "studio.snapshot", snapshot: { ...snapshot, sourceSnapshotDigest } },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["studio", "snapshot"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toContain("studio: 0 project(s)");
  });

  it("asks the assistant and prints an honest refusal", async () => {
    const socketPath = await startFakeDaemon((operation) => {
      if (operation !== "studio.assistant.query")
        throw new Error(`Unexpected operation: ${operation}`);
      return {
        result: {
          operation: "studio.assistant.query",
          answer: {
            kind: "cannot-answer",
            schemaVersion: 1,
            cannotAnswer: {
              reason: "no-milestone-target-date",
              detail: "No milestone with a real target date exists yet.",
            },
          },
        },
      };
    });

    const { io, captured } = fakeIo();
    const exitCode = await runCli(
      ["studio", "ask", "when does this ship?"],
      { APP_FACTORY_SOCKET: socketPath, APP_FACTORY_AUTH_TOKEN: AUTHORIZATION },
      io,
    );

    expect(exitCode).toBe(0);
    expect(captured().stdout).toBe(
      "cannot answer [no-milestone-target-date]: No milestone with a real target date exists yet.\n",
    );
  });
});
