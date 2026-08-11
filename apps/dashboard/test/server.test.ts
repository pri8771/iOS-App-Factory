import { request } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startDashboardServer,
  type DashboardCommandPort,
  type DashboardPortfolioPort,
  type DashboardServer,
} from "../src/index.js";

const TOKEN = "browser-token-00000000000000000000000000000001";
const CSRF = "csrf-token-0000000000000000000000000000000001";
const SESSION = "session-token-0000000000000000000000000000001";
const ATTEMPT = "75000000-0000-4000-8000-000000000001";
const PROJECT = "75000000-0000-4000-8000-000000000002";
const NOW = "2026-08-10T12:00:00.000Z";
const servers: DashboardServer[] = [];

function port(): DashboardCommandPort {
  return {
    doctor: vi.fn(async () => ({ readiness: "ready" })),
    status: vi.fn(async (attemptId) => ({ attempt: { attemptId, state: "running" } })),
    events: vi.fn(async () => ({ events: [{ sequence: 1, type: "attempt.created" }] })),
    pause: vi.fn(async () => ({ desiredState: "paused" })),
    resume: vi.fn(async () => ({ desiredState: "running" })),
    cancel: vi.fn(async () => ({ desiredState: "cancelled" })),
    reconcile: vi.fn(async () => ({ reconciledAttemptIds: [] })),
    close: vi.fn(),
  };
}

function portfolioSnapshot() {
  return {
    schemaVersion: 1,
    generatedAt: NOW,
    projects: [
      {
        projectId: PROJECT,
        slug: "first-app",
        displayName: "First app",
        lifecycleStage: "building",
        activeAttemptCount: 0,
        blockerCount: 0,
        openPullRequestCount: 0,
        jiraTodoCount: 1,
        jiraInProgressCount: 0,
        unresolvedP0: 0,
        unresolvedP1: 0,
        releaseStage: null,
        lastDeliveryAt: null,
        health: "unknown",
        healthReasons: ["analytics-unavailable"],
        analyticsFreshness: "unavailable",
      },
    ],
    totals: {
      projects: 1,
      activeAttempts: 0,
      blockers: 0,
      openPullRequests: 0,
      unresolvedP0: 0,
      unresolvedP1: 0,
    },
    sourceSnapshotDigest: `sha256:${"a".repeat(64)}`,
  } as const;
}

async function exchange(
  origin: string,
  input: Readonly<{
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }>,
) {
  const target = new URL(origin);
  const response = await new Promise<
    Readonly<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
      body: string;
    }>
  >((resolvePromise, rejectPromise) => {
    const call = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: input.path,
        method: input.method ?? "GET",
        headers: input.headers,
      },
      (reply) => {
        const chunks: Buffer[] = [];
        reply.on("data", (chunk: Buffer) => chunks.push(chunk));
        reply.on("end", () =>
          resolvePromise({
            status: reply.statusCode ?? 0,
            headers: reply.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    call.once("error", rejectPromise);
    if (input.body !== undefined) call.write(input.body);
    call.end();
  });
  return response;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await server.close()));
});

describe("local dashboard server", () => {
  it("authenticates through a token redirect without exposing daemon authorization", async () => {
    const server = await startDashboardServer({
      commandPort: port(),
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const denied = await exchange(server.origin, { path: "/" });
    expect(denied.status).toBe(401);
    const auth = await exchange(server.origin, { path: `/?token=${TOKEN}` });
    expect(auth.status).toBe(303);
    expect(String(auth.headers["set-cookie"])).toContain("HttpOnly");
    expect(auth.body).not.toContain(TOKEN);
    const page = await exchange(server.origin, {
      path: "/",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(page.status).toBe(200);
    expect(page.body).toContain("App Factory");
    expect(page.body).not.toContain(TOKEN);
    expect(page.body).not.toContain(SESSION);
    expect(page.headers["content-security-policy"]).toContain("default-src 'none'");
    const replay = await exchange(server.origin, { path: `/?token=${TOKEN}` });
    expect(replay.status).toBe(403);
  });

  it("serves typed status and rejects cross-origin or missing-CSRF mutation", async () => {
    const commandPort = port();
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const headers = { cookie: `factory_dashboard=${SESSION}` };
    const status = await exchange(server.origin, { path: `/api/attempt/${ATTEMPT}`, headers });
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toMatchObject({ status: { attempt: { state: "running" } } });
    const denied = await exchange(server.origin, {
      path: "/api/action",
      method: "POST",
      headers: { ...headers, "content-type": "application/json", origin: "https://attacker.test" },
      body: JSON.stringify({ action: "cancel", attemptId: ATTEMPT, reason: null }),
    });
    expect(denied.status).toBe(403);
    expect(commandPort.cancel).not.toHaveBeenCalled();
  });

  it("routes approved actions only through the command port", async () => {
    const commandPort = port();
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/action",
      method: "POST",
      headers: {
        cookie: `factory_dashboard=${SESSION}`,
        "content-type": "application/json",
        origin: server.origin,
        "x-factory-csrf": CSRF,
      },
      body: JSON.stringify({ action: "pause", attemptId: ATTEMPT, reason: "Review" }),
    });
    expect(response.status).toBe(200);
    expect(commandPort.pause).toHaveBeenCalledWith(ATTEMPT, "Review");
  });

  it("serves a provider-neutral multi-project snapshot through its read-only port", async () => {
    const snapshot = portfolioSnapshot();
    const portfolioPort: DashboardPortfolioPort = {
      snapshot: vi.fn(async () => snapshot),
    };
    const server = await startDashboardServer({
      commandPort: port(),
      portfolioPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/portfolio",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      snapshot: { projects: [{ displayName: "First app" }] },
    });
    expect(portfolioPort.snapshot).toHaveBeenCalledOnce();
    expect(portfolioPort.snapshot).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("rejects unbounded or unexpected portfolio DTOs without leaking provider errors", async () => {
    const canary = "provider-secret-canary";
    const portfolioPort: DashboardPortfolioPort = {
      snapshot: vi.fn(async () => {
        throw new Error(canary);
      }),
    };
    const server = await startDashboardServer({
      commandPort: port(),
      portfolioPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/portfolio",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(503);
    expect(response.body).toContain("Portfolio is unavailable.");
    expect(response.body).not.toContain(canary);
  });

  it("rejects unexpected portfolio fields instead of reflecting them", async () => {
    const canary = "credential-that-must-not-be-reflected";
    const portfolioPort: DashboardPortfolioPort = {
      snapshot: vi.fn(async () => ({ ...portfolioSnapshot(), credential: canary })),
    };
    const server = await startDashboardServer({
      commandPort: port(),
      portfolioPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/portfolio",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(503);
    expect(response.body).not.toContain(canary);
  });

  it("cancels a portfolio source that exceeds its bounded response time", async () => {
    let observedSignal: AbortSignal | undefined;
    const portfolioPort: DashboardPortfolioPort = {
      snapshot: vi.fn(
        async (signal) =>
          await new Promise<never>((_resolve, reject) => {
            observedSignal = signal;
            signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
          }),
      ),
    };
    const server = await startDashboardServer({
      commandPort: port(),
      portfolioPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
      portfolioTimeoutMs: 10,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/portfolio",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(503);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("fails honestly when no portfolio projection has been composed", async () => {
    const server = await startDashboardServer({
      commandPort: port(),
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/api/portfolio",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(503);
    expect(response.body).toContain("dashboard.portfolio-unavailable");
  });
});
