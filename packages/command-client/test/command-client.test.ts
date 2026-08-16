import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalPortfolioReadModelDigestInputV1,
  canonicalStudioSnapshotDigestInputV1,
} from "@app-factory/contracts";

import { createCommandClient, type CommandClientError } from "../src/index.js";

const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";
const REQUEST_ID = "00000000-0000-4000-8000-000000000010";
const COMMAND_ID = "00000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000005";
const TASK_ID = "00000000-0000-4000-8000-000000000013";
const RETRIED_ATTEMPT_ID = "00000000-0000-4000-8000-000000000014";
const NOW = new Date("2026-08-10T12:00:00.000Z");

function identity(requestId = REQUEST_ID) {
  return {
    requestId,
    commandId: COMMAND_ID,
    issuedAt: NOW.toISOString(),
  } as const;
}

const roots: string[] = [];
const servers: Server[] = [];
const sockets = new Set<Socket>();

async function createFakeServer(onConnection: (socket: Socket) => void): Promise<string> {
  const base = process.platform === "darwin" ? "/private/tmp" : tmpdir();
  const root = await mkdtemp(join(base, "afclient-"));
  roots.push(root);
  const socketPath = join(root, "server.sock");
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    onConnection(socket);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return socketPath;
}

function onRequest(
  respond: (frame: Record<string, unknown>, socket: Socket) => void,
): (socket: Socket) => void {
  return (socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      respond(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>, socket);
    });
  };
}

function doctorResponse(requestId: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "doctor",
      readiness: "ready",
      daemonVersion: "0.1.0",
      protocolVersion: 1,
      startedAt: NOW.toISOString(),
      issues: [],
    },
  };
}

function evidenceListResponse(requestId: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "evidence.list",
      manifests: [
        {
          attemptId: ATTEMPT_ID,
          createdAt: NOW.toISOString(),
          manifestDigest: `sha256:${"1".repeat(64)}`,
          subject: {
            taskSpecDigest: `sha256:${"2".repeat(64)}`,
            policyDigest: `sha256:${"3".repeat(64)}`,
            baseCommit: "a".repeat(40),
            candidateTree: "b".repeat(40),
            fence: 1,
          },
          entryCount: 4,
          requiredKinds: ["agent-run", "verification", "review", "commit"],
        },
      ],
      nextAfterAttemptId: ATTEMPT_ID,
      hasMore: false,
    },
  };
}

function retryResponse(requestId: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "task.retry",
      taskId: TASK_ID,
      attemptId: RETRIED_ATTEMPT_ID,
      state: "queued",
      priorAttemptId: ATTEMPT_ID,
    },
  };
}

function unblockResponse(requestId: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "attempt.unblock",
      attemptId: ATTEMPT_ID,
      state: "running",
      accepted: true,
    },
  };
}

function attemptListResponse(requestId: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "attempt.list",
      page: { attempts: [], nextAfter: null, hasMore: false },
    },
  };
}

function portfolioResponse(requestId: unknown): Record<string, unknown> {
  const snapshot = {
    schemaVersion: 1 as const,
    generatedAt: NOW.toISOString(),
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
  };
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "portfolio.snapshot",
      snapshot: {
        ...snapshot,
        sourceSnapshotDigest: `sha256:${createHash("sha256")
          .update(canonicalPortfolioReadModelDigestInputV1(snapshot), "utf8")
          .digest("hex")}`,
      },
    },
  };
}

function studioSnapshotResponse(requestId: unknown): Record<string, unknown> {
  const snapshot = {
    schemaVersion: 1 as const,
    generatedAt: NOW.toISOString(),
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
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "studio.snapshot",
      snapshot: {
        ...snapshot,
        sourceSnapshotDigest: `sha256:${createHash("sha256")
          .update(canonicalStudioSnapshotDigestInputV1(snapshot), "utf8")
          .digest("hex")}`,
      },
    },
  };
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers
      .splice(0)
      .map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("typed command client", () => {
  it("sends a strict authenticated request with caller-controlled durable identity", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(doctorResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    const result = await client.doctor(identity());
    expect(result).toMatchObject({ operation: "doctor", readiness: "ready" });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      protocolVersion: 1,
      requestId: REQUEST_ID,
      authorization: AUTHORIZATION,
      request: { commandId: COMMAND_ID, operation: "doctor" },
    });
    client.close();
  });

  it("uses the same authenticated boundary for bounded evidence inspection", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(evidenceListResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    await expect(
      client.listEvidence({ afterAttemptId: ATTEMPT_ID, limit: 25 }, identity()),
    ).resolves.toMatchObject({ operation: "evidence.list", hasMore: false });
    expect(received[0]).toMatchObject({
      request: {
        operation: "evidence.list",
        payload: { afterAttemptId: ATTEMPT_ID, limit: 25 },
      },
    });
    client.close();
  });

  it("requests effects.status with an empty read-only payload and effects.list with a strict bounded query", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        if (request.operation === "effects.status") {
          socket.end(
            `${JSON.stringify({
              protocolVersion: 1,
              requestId: frame.requestId,
              ok: true,
              result: {
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
            })}\n`,
          );
          return;
        }
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: {
              operation: "effects.list",
              page: { effects: [], nextAfter: null, hasMore: false },
            },
          })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    await expect(client.effectsStatus(identity())).resolves.toMatchObject({
      operation: "effects.status",
      status: { pendingOutbox: 0 },
    });
    expect(received[0]).toMatchObject({
      request: { operation: "effects.status", payload: {} },
    });

    await expect(
      client.listEffects({ state: "planned", provider: "github", limit: 10 }, identity()),
    ).resolves.toMatchObject({ operation: "effects.list" });
    expect(received[1]).toMatchObject({
      request: {
        operation: "effects.list",
        payload: { state: "planned", provider: "github", after: null, limit: 10 },
      },
    });
    client.close();
  });

  it("sends the strict project.milestones.list and project.milestone.upsert payloads", async () => {
    const PROJECT_ID = "00000000-0000-4000-8000-000000000021";
    const MILESTONE_ID = "00000000-0000-4000-8000-000000000022";
    const draft = {
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
    } as const;
    const stored = {
      schemaVersion: 1,
      ...draft,
      revision: 0,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        const result =
          request.operation === "project.milestone.upsert"
            ? { operation: "project.milestone.upsert", milestone: stored, created: true }
            : {
                operation: "project.milestones.list",
                timeline: {
                  schemaVersion: 1,
                  projectId: PROJECT_ID,
                  generatedAt: NOW.toISOString(),
                  milestones: [stored],
                  actuals: { phases: [], lifecycle: [] },
                  sources: { localExecution: "available", lifecycleEvents: "unavailable" },
                },
              };
        socket.end(
          `${JSON.stringify({ protocolVersion: 1, requestId: frame.requestId, ok: true, result })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    await expect(
      client.upsertProjectMilestone({ milestone: draft, expectedRevision: null }, identity()),
    ).resolves.toMatchObject({
      operation: "project.milestone.upsert",
      created: true,
      milestone: { milestoneId: MILESTONE_ID, targetDate: null, revision: 0 },
    });
    expect(received[0]).toMatchObject({
      request: {
        operation: "project.milestone.upsert",
        payload: { milestone: draft, expectedRevision: null },
      },
    });

    await expect(client.listProjectMilestones(PROJECT_ID, identity())).resolves.toMatchObject({
      operation: "project.milestones.list",
      timeline: { projectId: PROJECT_ID, milestones: [{ targetDate: null }] },
    });
    expect(received[1]).toMatchObject({
      request: { operation: "project.milestones.list", payload: { projectId: PROJECT_ID } },
    });

    await expect(
      client.upsertProjectMilestone(
        { milestone: { ...draft, targetDate: "2026-02-30" }, expectedRevision: null },
        identity(),
      ),
    ).rejects.toThrow();
    await expect(client.listProjectMilestones("not-a-project", identity())).rejects.toThrow();
    expect(received).toHaveLength(2);
    client.close();
  });

  it("sends the strict task.retry and attempt.unblock request payloads", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const response =
          (frame.request as Record<string, unknown>).operation === "task.retry"
            ? retryResponse(frame.requestId)
            : unblockResponse(frame.requestId);
        socket.end(`${JSON.stringify(response)}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    await expect(client.retry(TASK_ID, ATTEMPT_ID, identity())).resolves.toMatchObject({
      operation: "task.retry",
      attemptId: RETRIED_ATTEMPT_ID,
      priorAttemptId: ATTEMPT_ID,
    });
    expect(received[0]).toMatchObject({
      request: { operation: "task.retry", payload: { taskId: TASK_ID, attemptId: ATTEMPT_ID } },
    });

    await expect(
      client.unblock(ATTEMPT_ID, "Use the staging environment.", identity()),
    ).resolves.toMatchObject({ operation: "attempt.unblock", state: "running", accepted: true });
    expect(received[1]).toMatchObject({
      request: {
        operation: "attempt.unblock",
        payload: { attemptId: ATTEMPT_ID, answer: "Use the staging environment." },
      },
    });
    client.close();
  });

  it("sends a strict bounded attempt-list query with safe defaults and cursors", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(attemptListResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    await expect(client.listAttempts({}, identity())).resolves.toMatchObject({
      operation: "attempt.list",
      page: { attempts: [], hasMore: false },
    });
    expect(received[0]).toMatchObject({
      request: {
        operation: "attempt.list",
        payload: { scope: "active", projectId: null, after: null, limit: 50 },
      },
    });

    await client.listAttempts(
      {
        scope: "all",
        projectId: "20000000-0000-4000-8000-000000000001",
        after: { updatedAt: NOW.toISOString(), attemptId: ATTEMPT_ID },
        limit: 25,
      },
      identity("00000000-0000-4000-8000-000000000011"),
    );
    expect(received[1]).toMatchObject({
      request: {
        operation: "attempt.list",
        payload: {
          scope: "all",
          projectId: "20000000-0000-4000-8000-000000000001",
          after: { updatedAt: NOW.toISOString(), attemptId: ATTEMPT_ID },
          limit: 25,
        },
      },
    });
    client.close();
  });

  it("requests the authoritative portfolio snapshot with an empty read-only payload", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(portfolioResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.portfolioSnapshot(identity())).resolves.toMatchObject({
      operation: "portfolio.snapshot",
      snapshot: { projects: [], totals: { openPullRequests: null } },
    });
    expect(received[0]).toMatchObject({
      request: { operation: "portfolio.snapshot", payload: {} },
    });
    client.close();
  });

  it("rejects a portfolio response whose canonical source digest is stale", async () => {
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        const response = portfolioResponse(frame.requestId);
        const result = response.result as Record<string, unknown>;
        const snapshot = result.snapshot as Record<string, unknown>;
        socket.end(
          `${JSON.stringify({
            ...response,
            result: {
              ...result,
              snapshot: { ...snapshot, sourceSnapshotDigest: `sha256:${"f".repeat(64)}` },
            },
          })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.portfolioSnapshot(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({ code: "protocol.portfolio-digest-mismatch", retryable: false });
    client.close();
  });

  it("requests the studio snapshot and verifies its canonical source digest", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(studioSnapshotResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.studioSnapshot(identity())).resolves.toMatchObject({
      operation: "studio.snapshot",
      snapshot: { projects: [], rooms: [] },
    });
    expect(received[0]).toMatchObject({ request: { operation: "studio.snapshot", payload: {} } });
    client.close();
  });

  it("rejects a studio snapshot response whose canonical source digest is stale", async () => {
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        const response = studioSnapshotResponse(frame.requestId);
        const result = response.result as Record<string, unknown>;
        const snapshot = result.snapshot as Record<string, unknown>;
        socket.end(
          `${JSON.stringify({
            ...response,
            result: {
              ...result,
              snapshot: { ...snapshot, sourceSnapshotDigest: `sha256:${"f".repeat(64)}` },
            },
          })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.studioSnapshot(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({ code: "protocol.studio-snapshot-digest-mismatch", retryable: false });
    client.close();
  });

  it("asks the assistant with a strict scoped query payload", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: {
              operation: "studio.assistant.query",
              answer: {
                kind: "cannot-answer",
                schemaVersion: 1,
                cannotAnswer: { reason: "no-matching-data", detail: "No data." },
              },
            },
          })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(
      client.assistantQuery("status?", { projectId: null }, identity()),
    ).resolves.toMatchObject({ answer: { kind: "cannot-answer" } });
    expect(received[0]).toMatchObject({
      request: {
        operation: "studio.assistant.query",
        payload: { query: { schemaVersion: 1, question: "status?", projectId: null } },
      },
    });
    client.close();
  });

  it("proposes and executes an assistant intent through the strict wire payloads", async () => {
    const taskSpec = {
      schemaVersion: 1,
      taskId: TASK_ID,
      projectId: "00000000-0000-4000-8000-000000000015",
      createdAt: NOW.toISOString(),
      title: "Ship it",
      objective: "Ship it.",
      acceptanceCriteria: [{ id: "done", statement: "It ships.", verification: "operator" }],
      base: { repositoryId: "00000000-0000-4000-8000-000000000016", commit: "a".repeat(40) },
      requestedScope: { paths: ["Sources/App.swift"] },
      policyDigest: `sha256:${"b".repeat(64)}`,
    };
    const intent = {
      schemaVersion: 1 as const,
      intentId: "00000000-0000-4000-8000-000000000017",
      utterance: `run task ${TASK_ID} now`,
      payload: { kind: "run-phase" as const, taskSpec },
      summary: "Run it.",
      requiresConfirmation: true,
      proposedAt: NOW.toISOString(),
    };

    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        const result =
          request.operation === "studio.assistant.intent.propose"
            ? { operation: "studio.assistant.intent.propose", intent }
            : {
                operation: "studio.assistant.intent.execute",
                intentId: intent.intentId,
                outcome: {
                  kind: "task.run",
                  result: {
                    operation: "task.run",
                    taskId: TASK_ID,
                    attemptId: "00000000-0000-4000-8000-000000000018",
                    state: "queued",
                  },
                },
              };
        socket.end(
          `${JSON.stringify({ protocolVersion: 1, requestId: frame.requestId, ok: true, result })}\n`,
        );
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    const proposed = await client.proposeAssistantIntent(
      intent.utterance,
      intent.payload,
      identity(),
    );
    expect(proposed.intent).toMatchObject({ intentId: intent.intentId });

    const executed = await client.executeAssistantIntent(
      proposed.intent,
      identity("00000000-0000-4000-8000-000000000019"),
    );
    expect(executed).toMatchObject({ outcome: { kind: "task.run" } });

    expect(received[0]).toMatchObject({
      request: {
        operation: "studio.assistant.intent.propose",
        payload: { utterance: intent.utterance, intent: intent.payload },
      },
    });
    expect(received[1]).toMatchObject({
      request: { operation: "studio.assistant.intent.execute", payload: { intent } },
    });
    client.close();
  });

  it("can reuse an explicit request and command identity for transport retry", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(doctorResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });
    const delivery = identity();

    await client.doctor(delivery);
    await client.doctor(delivery);

    expect(received).toHaveLength(2);
    expect(received[0]?.requestId).toBe(REQUEST_ID);
    expect(received[1]?.requestId).toBe(REQUEST_ID);
    expect(received[0]?.request).toMatchObject({ commandId: COMMAND_ID });
    expect(received[1]?.request).toMatchObject({ commandId: COMMAND_ID });
    client.close();
  });

  it("retains the original issuedAt when retrying a command with a new request ID", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(doctorResponse(frame.requestId))}\n`);
      }),
    );
    let requestNumber = 10;
    let clockTick = 0;
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      createRequestId: () => `00000000-0000-4000-8000-${String(requestNumber++).padStart(12, "0")}`,
      createCommandId: () => COMMAND_ID,
      now: () => new Date(NOW.getTime() + clockTick++ * 60_000),
    });
    const original = client.createIdentity();
    const retry = client.createRetryIdentity(original);

    await client.doctor(original);
    await client.doctor(retry);

    expect(retry.requestId).not.toBe(original.requestId);
    expect(retry.commandId).toBe(original.commandId);
    expect(retry.issuedAt).toBe(original.issuedAt);
    expect(received[0]?.request).toMatchObject({
      commandId: original.commandId,
      issuedAt: original.issuedAt,
    });
    expect(received[1]?.request).toMatchObject({
      commandId: original.commandId,
      issuedAt: original.issuedAt,
    });
    client.close();
  });

  it("fails closed after close and terminates an in-flight request", async () => {
    let observeDispatch: (() => void) | undefined;
    const dispatched = new Promise<void>((resolve) => {
      observeDispatch = resolve;
    });
    const socketPath = await createFakeServer(
      onRequest(() => {
        observeDispatch?.();
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    const inFlight = client.doctor(identity());
    await dispatched;
    client.close();
    await expect(inFlight).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.closed-after-dispatch",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    await expect(client.doctor()).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.closed",
    });
  });

  it("preserves retry identity when its caller cancels after dispatch", async () => {
    let observeDispatch: (() => void) | undefined;
    const dispatched = new Promise<void>((resolve) => {
      observeDispatch = resolve;
    });
    const socketPath = await createFakeServer(
      onRequest(() => {
        observeDispatch?.();
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "mcp",
      now: () => NOW,
    });
    const controller = new AbortController();

    const inFlight = client.doctor(identity(), controller.signal);
    await dispatched;
    controller.abort();

    await expect(inFlight).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.cancelled-after-dispatch",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    client.close();
  });

  it("keeps cancellation terminal when the signal is already aborted before dispatch", async () => {
    const client = createCommandClient({
      socketPath: "/private/tmp/does-not-need-to-exist.sock",
      authorization: AUTHORIZATION,
      origin: "mcp",
      now: () => NOW,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(client.doctor(identity(), controller.signal)).rejects.toMatchObject<
      Partial<CommandClientError>
    >({ code: "client.cancelled", retryable: false, retryIdentity: null });
    client.close();
  });

  it("rejects a terminal connection without a response", async () => {
    const socketPath = await createFakeServer((socket) => socket.end());
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });
    await expect(client.doctor(identity())).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "transport.remote-closed",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    client.close();
  });

  it("rejects malformed, oversized, and mismatched responses", async () => {
    const malformedPath = await createFakeServer(onRequest((_, socket) => socket.end("{bad}\n")));
    const malformedClient = createCommandClient({
      socketPath: malformedPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });
    await expect(malformedClient.doctor(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({
      code: "protocol.malformed-response",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    malformedClient.close();

    const oversizedPath = await createFakeServer(
      onRequest((_, socket) => socket.end(`${"x".repeat(257)}\n`)),
    );
    const oversizedClient = createCommandClient({
      socketPath: oversizedPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      maxResponseBytes: 256,
      now: () => NOW,
    });
    await expect(oversizedClient.doctor(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({
      code: "protocol.response-too-large",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    oversizedClient.close();

    const mismatchPath = await createFakeServer(
      onRequest((_, socket) =>
        socket.end(`${JSON.stringify(doctorResponse("00000000-0000-4000-8000-000000000099"))}\n`),
      ),
    );
    const mismatchClient = createCommandClient({
      socketPath: mismatchPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });
    await expect(mismatchClient.doctor(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({
      code: "protocol.response-id-mismatch",
      retryable: true,
      retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW.toISOString() },
    });
    mismatchClient.close();
  });

  it("rejects an oversized request before opening a socket", async () => {
    const client = createCommandClient({
      socketPath: "/private/tmp/does-not-need-to-exist.sock",
      authorization: AUTHORIZATION,
      origin: "cli",
      maxRequestBytes: 64,
      now: () => NOW,
    });
    await expect(client.doctor(identity())).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.request-too-large",
    });
    client.close();
  });
});
