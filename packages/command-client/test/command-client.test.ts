import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
  canonicalPortfolioReadModelDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  canonicalRoomParticipantsCatalogDigestInputV1,
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

function roomParticipantsResponse(requestId: unknown): Record<string, unknown> {
  const catalog = {
    schemaVersion: 1 as const,
    enabled: true,
    unavailableReason: null,
    providers: [{ provider: "ollama" as const, model: "qwen2.5-coder:14b", cliVersion: null }],
    roster: [],
  };
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "room.participants.list",
      catalog: {
        ...catalog,
        sourcedAt: NOW.toISOString(),
        sourceDigest: `sha256:${createHash("sha256")
          .update(canonicalRoomParticipantsCatalogDigestInputV1(catalog), "utf8")
          .digest("hex")}`,
      },
    },
  };
}

function releaseProjectionResponse(requestId: unknown): Record<string, unknown> {
  const projection = {
    schemaVersion: 1 as const,
    observer: {
      configured: false,
      unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
      source: null,
    },
    latest: null,
    observationCount: 0,
  };
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    result: {
      operation: "release.projection",
      projection: {
        ...projection,
        generatedAt: NOW.toISOString(),
        sourceDigest: `sha256:${createHash("sha256")
          .update(canonicalReleaseProjectionDigestInputV1(projection), "utf8")
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

  it("lists room participants with an empty payload and verifies the catalog's source digest", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(`${JSON.stringify(roomParticipantsResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.listRoomParticipants(identity())).resolves.toMatchObject({
      operation: "room.participants.list",
      catalog: { enabled: true, providers: [{ provider: "ollama" }] },
    });
    expect(received[0]).toMatchObject({
      request: { operation: "room.participants.list", payload: {} },
    });
    client.close();
  });

  it("rejects a room participants catalog whose source digest is stale", async () => {
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        const response = roomParticipantsResponse(frame.requestId);
        const result = response.result as Record<string, unknown>;
        const catalog = result.catalog as Record<string, unknown>;
        socket.end(
          `${JSON.stringify({
            ...response,
            result: {
              ...result,
              catalog: { ...catalog, sourceDigest: `sha256:${"f".repeat(64)}` },
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

    await expect(client.listRoomParticipants(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({ code: "protocol.room-participants-digest-mismatch", retryable: false });
    client.close();
  });

  it("reads the release projection with an empty payload and verifies its source digest; sends the strict release.observe payload", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        if (request.operation === "release.observe") {
          socket.end(
            `${JSON.stringify({
              protocolVersion: 1,
              requestId: frame.requestId,
              ok: false,
              error: {
                code: "release.observer-not-configured",
                message: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
                retryable: false,
              },
            })}\n`,
          );
          return;
        }
        socket.end(`${JSON.stringify(releaseProjectionResponse(frame.requestId))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "dashboard",
      now: () => NOW,
    });

    await expect(client.releaseProjection(identity())).resolves.toMatchObject({
      operation: "release.projection",
      projection: { observer: { configured: false }, latest: null, observationCount: 0 },
    });
    expect(received[0]).toMatchObject({
      request: { operation: "release.projection", payload: {} },
    });
    await expect(
      client.observeRelease({ buildsLimit: 3 }, identity("00000000-0000-4000-8000-000000000011")),
    ).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "release.observer-not-configured",
      retryable: false,
    });
    expect(received[1]).toMatchObject({
      request: { operation: "release.observe", payload: { buildsLimit: 3 } },
    });
    client.close();
  });

  it("rejects a release projection whose source digest is stale", async () => {
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        const response = releaseProjectionResponse(frame.requestId);
        const result = response.result as Record<string, unknown>;
        const projection = result.projection as Record<string, unknown>;
        socket.end(
          `${JSON.stringify({
            ...response,
            result: {
              ...result,
              projection: { ...projection, sourceDigest: `sha256:${"f".repeat(64)}` },
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
    await expect(client.releaseProjection(identity())).rejects.toMatchObject<
      Partial<CommandClientError>
    >({ code: "protocol.release-projection-digest-mismatch", retryable: false });
    client.close();
  });

  function fixtureReleaseRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schemaVersion: 1,
      releaseRunId: "00000000-0000-4000-8000-000000000070",
      projectId: "00000000-0000-4000-8000-000000000071",
      repositoryId: "00000000-0000-4000-8000-000000000072",
      releaseId: "00000000-0000-4000-8000-000000000073",
      sourceCommit: "a".repeat(40),
      branch: "main",
      stage: "certified",
      revision: 1,
      promotion: null,
      archive: null,
      upload: null,
      unevaluated: ["quality.coherence"],
      notes: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      ...overrides,
    };
  }

  it("sends the strict release.start payload and parses branded IDs before sending", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: { operation: "release.start", run: fixtureReleaseRun(), created: true },
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

    await expect(
      client.startRelease(
        {
          projectId: "00000000-0000-4000-8000-000000000071",
          repositoryId: "00000000-0000-4000-8000-000000000072",
          sourceCommit: "a".repeat(40),
          branch: "main",
        },
        identity(),
      ),
    ).resolves.toMatchObject({ operation: "release.start", created: true });
    expect(received[0]).toMatchObject({
      request: {
        operation: "release.start",
        payload: {
          projectId: "00000000-0000-4000-8000-000000000071",
          repositoryId: "00000000-0000-4000-8000-000000000072",
          sourceCommit: "a".repeat(40),
          branch: "main",
        },
      },
    });
    client.close();
  });

  it("rejects an invalid release.start input before it ever reaches the socket", async () => {
    const socketPath = await createFakeServer(
      onRequest((_frame, socket) => {
        socket.end(`${JSON.stringify(releaseProjectionResponse("unused"))}\n`);
      }),
    );
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });
    await expect(
      client.startRelease(
        {
          projectId: "00000000-0000-4000-8000-000000000071",
          repositoryId: "00000000-0000-4000-8000-000000000072",
          sourceCommit: "not-a-git-object-id",
          branch: "main",
        },
        identity(),
      ),
    ).rejects.toThrow();
    client.close();
  });

  it("sends the strict release.promote payload", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: { operation: "release.promote", run: fixtureReleaseRun({ revision: 2 }) },
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

    await expect(
      client.promoteRelease("00000000-0000-4000-8000-000000000070", 1, identity()),
    ).resolves.toMatchObject({ operation: "release.promote", run: { revision: 2 } });
    expect(received[0]).toMatchObject({
      request: {
        operation: "release.promote",
        payload: { releaseRunId: "00000000-0000-4000-8000-000000000070", expectedRevision: 1 },
      },
    });
    client.close();
  });

  it("surfaces a release.promote CAS conflict as a typed CommandClientError", async () => {
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: false,
            error: {
              code: "release-run.revision-conflict",
              message: "Release run is at revision 2, not 1.",
              retryable: true,
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
    await expect(
      client.promoteRelease("00000000-0000-4000-8000-000000000070", 1, identity()),
    ).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "release-run.revision-conflict",
      retryable: true,
    });
    client.close();
  });

  it("reads release.status with a strict releaseRunId-only payload", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: { operation: "release.status", run: fixtureReleaseRun() },
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

    await expect(
      client.releaseStatus("00000000-0000-4000-8000-000000000070", identity()),
    ).resolves.toMatchObject({ operation: "release.status" });
    expect(received[0]).toMatchObject({
      request: {
        operation: "release.status",
        payload: { releaseRunId: "00000000-0000-4000-8000-000000000070" },
      },
    });
    client.close();
  });

  it("sends the strict release.archive payload with exportOptions.schemaVersion filled in", async () => {
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
              operation: "release.archive",
              run: fixtureReleaseRun({
                revision: 2,
                stage: "archived",
                promotion: {
                  promotedCommit: "a".repeat(40),
                  branch: "main",
                  at: NOW.toISOString(),
                },
                archive: {
                  buildNumber: "1",
                  marketingVersion: "1.0",
                  archiveDigest: `sha256:${"1".repeat(64)}`,
                  exportedArtifactDigest: `sha256:${"2".repeat(64)}`,
                  receiptDigest: `sha256:${"3".repeat(64)}`,
                  at: NOW.toISOString(),
                },
              }),
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

    await expect(
      client.archiveRelease(
        {
          releaseRunId: "00000000-0000-4000-8000-000000000070",
          expectedRevision: 1,
          exportOptions: {
            teamId: "ABCD123456",
            method: "app-store-connect",
            destination: "export",
            signingStyle: "automatic",
            bundleIdOverride: "com.example.app",
          },
          marketingVersion: "1.0",
        },
        identity(),
      ),
    ).resolves.toMatchObject({ operation: "release.archive", run: { stage: "archived" } });
    expect(received[0]).toMatchObject({
      request: {
        operation: "release.archive",
        payload: {
          releaseRunId: "00000000-0000-4000-8000-000000000070",
          expectedRevision: 1,
          exportOptions: {
            schemaVersion: 1,
            teamId: "ABCD123456",
            method: "app-store-connect",
            destination: "export",
            signingStyle: "automatic",
            bundleIdOverride: "com.example.app",
          },
          marketingVersion: "1.0",
        },
      },
    });
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

  it("lists, upserts a phase, and upserts a preset embedding it (Studio Phase 4)", async () => {
    const phaseDraft = {
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
    } as const;
    const storedPhase = {
      schemaVersion: 1,
      ...phaseDraft,
      revision: 0,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    const storedPreset = {
      schemaVersion: 1,
      presetId: "ios-app-standard-0.4.0",
      name: "iOS App Standard 0.4.0",
      phases: [storedPhase],
      appliesTo: ["ios"],
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
          request.operation === "phase.upsert"
            ? { operation: "phase.upsert", phase: storedPhase, created: true }
            : request.operation === "preset.upsert"
              ? { operation: "preset.upsert", preset: storedPreset, created: true }
              : { operation: "preset.list", presets: [storedPreset] };
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
      client.upsertPhase({ phase: phaseDraft, expectedRevision: null }, identity()),
    ).resolves.toMatchObject({
      operation: "phase.upsert",
      created: true,
      phase: { phaseId: "contract" },
    });
    expect(received[0]).toMatchObject({
      request: {
        operation: "phase.upsert",
        payload: { phase: phaseDraft, expectedRevision: null },
      },
    });

    await expect(
      client.upsertPreset(
        {
          preset: {
            presetId: "ios-app-standard-0.4.0",
            name: "iOS App Standard 0.4.0",
            phases: [storedPhase],
            appliesTo: ["ios"],
          },
          expectedRevision: null,
        },
        identity(),
      ),
    ).resolves.toMatchObject({
      operation: "preset.upsert",
      created: true,
      preset: { presetId: "ios-app-standard-0.4.0" },
    });
    expect(received[1]).toMatchObject({ request: { operation: "preset.upsert" } });

    await expect(client.listPresets(identity())).resolves.toMatchObject({
      operation: "preset.list",
      presets: [{ presetId: "ios-app-standard-0.4.0" }],
    });
    expect(received[2]).toMatchObject({ request: { operation: "preset.list", payload: {} } });

    await expect(
      client.upsertPhase(
        { phase: { ...phaseDraft, mode: "not-a-mode" }, expectedRevision: null },
        identity(),
      ),
    ).rejects.toThrow();
    expect(received).toHaveLength(3);
    client.close();
  });

  it("manages the provider registry: list, upsert, remove, and probe health", async () => {
    const instance = {
      key: "openrouter-fast",
      family: "openrouter",
      model: "openrouter/auto",
      displayName: "OpenRouter (fast)",
      credentialReference: null,
    } as const;
    const digest = `sha256:${"a".repeat(64)}`;
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        const result =
          request.operation === "provider.list"
            ? { operation: "provider.list", providers: [instance] }
            : request.operation === "provider.upsert"
              ? { operation: "provider.upsert", instance, created: true, digest }
              : request.operation === "provider.remove"
                ? { operation: "provider.remove", removed: true, digest }
                : {
                    operation: "provider.health",
                    reports: [
                      {
                        key: "openrouter-fast",
                        report: { status: "ok", detail: null, latencyMs: 120, version: null },
                      },
                    ],
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

    await expect(client.listProviders(identity())).resolves.toMatchObject({
      operation: "provider.list",
      providers: [{ key: "openrouter-fast" }],
    });
    expect(received[0]).toMatchObject({ request: { operation: "provider.list", payload: {} } });

    await expect(
      client.upsertProvider(
        {
          key: "openrouter-fast",
          family: "openrouter",
          model: "openrouter/auto",
          displayName: "OpenRouter (fast)",
        },
        null,
        identity("00000000-0000-4000-8000-000000000021"),
      ),
    ).resolves.toMatchObject({ operation: "provider.upsert", created: true, digest });
    expect(received[1]).toMatchObject({
      request: {
        operation: "provider.upsert",
        payload: {
          instance: { key: "openrouter-fast", family: "openrouter" },
          expectedDigest: null,
        },
      },
    });

    await expect(
      client.removeProvider(
        "openrouter-fast",
        digest,
        identity("00000000-0000-4000-8000-000000000022"),
      ),
    ).resolves.toMatchObject({ operation: "provider.remove", removed: true, digest });
    expect(received[2]).toMatchObject({
      request: {
        operation: "provider.remove",
        payload: { key: "openrouter-fast", expectedDigest: digest },
      },
    });

    await expect(
      client.providerHealth(null, identity("00000000-0000-4000-8000-000000000023")),
    ).resolves.toMatchObject({
      operation: "provider.health",
      reports: [{ key: "openrouter-fast", report: { status: "ok" } }],
    });
    expect(received[3]).toMatchObject({
      request: { operation: "provider.health", payload: { key: null } },
    });
    client.close();
  });

  it("stores a provider credential without ever echoing the secret, and round-trips settings.get/set", async () => {
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        const result =
          request.operation === "provider.credential.set"
            ? {
                operation: "provider.credential.set",
                key: "openrouter-fast",
                credentialReference: {
                  schemaVersion: 1,
                  kind: "macos-keychain",
                  service: "app-factory-provider-openrouter-fast",
                  account: "openrouter-fast",
                },
              }
            : request.operation === "settings.set"
              ? {
                  operation: "settings.set",
                  entry: {
                    key: "default-provider",
                    value: "openrouter-fast",
                    updatedAt: NOW.toISOString(),
                  },
                }
              : {
                  operation: "settings.get",
                  entry: {
                    key: "default-provider",
                    value: "openrouter-fast",
                    updatedAt: NOW.toISOString(),
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
      client.setProviderCredential("openrouter-fast", "sk-super-secret", identity()),
    ).resolves.toMatchObject({
      operation: "provider.credential.set",
      key: "openrouter-fast",
      credentialReference: { kind: "macos-keychain" },
    });
    expect(received[0]).toMatchObject({
      request: {
        operation: "provider.credential.set",
        payload: { key: "openrouter-fast", secret: "sk-super-secret" },
      },
    });

    await expect(
      client.setSetting(
        "default-provider",
        "openrouter-fast",
        identity("00000000-0000-4000-8000-000000000024"),
      ),
    ).resolves.toMatchObject({ operation: "settings.set", entry: { value: "openrouter-fast" } });
    expect(received[1]).toMatchObject({
      request: {
        operation: "settings.set",
        payload: { key: "default-provider", value: "openrouter-fast" },
      },
    });

    await expect(
      client.getSettings("default-provider", identity("00000000-0000-4000-8000-000000000025")),
    ).resolves.toMatchObject({ operation: "settings.get", entry: { value: "openrouter-fast" } });
    expect(received[2]).toMatchObject({
      request: { operation: "settings.get", payload: { key: "default-provider" } },
    });
    client.close();
  });

  it("updates a room via a CAS patch and reads a usage summary", async () => {
    const room = {
      schemaVersion: 1,
      roomId: "00000000-0000-4000-8000-000000000030",
      title: "Renamed",
      projectId: null,
      flavor: "direct",
      createdAt: NOW.toISOString(),
      updatedAt: "2026-08-10T12:05:00.000Z",
      unattendedEnabled: false,
      headSequence: 0,
      headMessageId: null,
      lastHumanAt: null,
      humanTypingUntil: null,
      roundCounter: 0,
      activeGrantId: null,
      pendingTrigger: null,
      agentCooldownEvents: 4,
      participants: [
        {
          persona: "assistant",
          provider: "openrouter-fast",
          displayName: "Assistant",
          position: 0,
          benchedUntil: null,
          benchReason: null,
        },
      ],
      budget: {
        dayKey: "2026-08-10",
        dailyCeilingTokens: 200_000,
        unattendedDailyCeilingTokens: 0,
        maxTokensPerReply: 4_000,
        spentTokens: 0,
        reservedTokens: 0,
        unattendedSpentTokens: 0,
      },
      archivedAt: null,
    };
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        const request = frame.request as Record<string, unknown>;
        const result =
          request.operation === "room.update"
            ? { operation: "room.update", room }
            : {
                operation: "usage.summary",
                summary: {
                  sinceDays: 7,
                  rows: [
                    {
                      providerKey: "openrouter-fast",
                      model: "openrouter/auto",
                      dayKey: "2026-08-10",
                      inputTokens: 120,
                      outputTokens: 40,
                      cachedInputTokens: null,
                      costUsdMicros: null,
                      unreportedCount: 0,
                    },
                  ],
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
      client.updateRoom(
        {
          roomId: "00000000-0000-4000-8000-000000000030",
          expectedUpdatedAt: NOW.toISOString(),
          patch: { title: "Renamed" },
        },
        identity(),
      ),
    ).resolves.toMatchObject({ operation: "room.update", room: { title: "Renamed" } });
    expect(received[0]).toMatchObject({
      request: {
        operation: "room.update",
        payload: { roomId: "00000000-0000-4000-8000-000000000030", patch: { title: "Renamed" } },
      },
    });

    await expect(
      client.usageSummary(7, identity("00000000-0000-4000-8000-000000000026")),
    ).resolves.toMatchObject({
      operation: "usage.summary",
      summary: { rows: [{ providerKey: "openrouter-fast", unreportedCount: 0 }] },
    });
    expect(received[1]).toMatchObject({
      request: { operation: "usage.summary", payload: { sinceDays: 7 } },
    });
    client.close();
  });

  it("round-trips signal.reschedule against a fake server (the typed method works even though today's live daemon build refuses the operation as not-yet-implemented -- Wave 7 lights up the server)", async () => {
    const signal = {
      schemaVersion: 1,
      signalId: "00000000-0000-4000-8000-000000000040",
      name: "Pricing watch",
      watchDescription: "Watch competitor pricing pages for changes.",
      scoutProvider: "codex",
      status: "active",
      checkIntervalMinutes: 60,
      checkCount: 0,
      insightCount: 0,
      lastCheckedAt: null,
      createdAt: NOW.toISOString(),
    };
    const received: Record<string, unknown>[] = [];
    const socketPath = await createFakeServer(
      onRequest((frame, socket) => {
        received.push(frame);
        socket.end(
          `${JSON.stringify({
            protocolVersion: 1,
            requestId: frame.requestId,
            ok: true,
            result: { operation: "signal.reschedule", signal },
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

    await expect(
      client.rescheduleSignal("00000000-0000-4000-8000-000000000040", 60, identity()),
    ).resolves.toMatchObject({
      operation: "signal.reschedule",
      signal: { checkIntervalMinutes: 60 },
    });
    expect(received[0]).toMatchObject({
      request: {
        operation: "signal.reschedule",
        payload: { signalId: "00000000-0000-4000-8000-000000000040", checkIntervalMinutes: 60 },
      },
    });
    client.close();
  });
});
