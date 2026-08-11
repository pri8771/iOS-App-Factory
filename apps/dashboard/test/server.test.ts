import { createHash } from "node:crypto";
import { request } from "node:http";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandClientError } from "@app-factory/command-client";

import {
  PortfolioReadModelV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
} from "@app-factory/contracts";

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
const COMMAND_ID = "75000000-0000-4000-8000-000000000003";
const TASK = "75000000-0000-4000-8000-000000000004";
const NOW = "2026-08-10T12:00:00.000Z";
const servers: DashboardServer[] = [];

function port(): DashboardCommandPort {
  return {
    doctor: vi.fn(async () => ({ readiness: "ready" })),
    listAttempts: vi.fn(async () => attemptListPage()),
    status: vi.fn(async (attemptId) => ({ attempt: { attemptId, state: "running" } })),
    events: vi.fn(async () => ({ events: [{ sequence: 1, type: "attempt.created" }] })),
    pause: vi.fn(async () => ({ desiredState: "paused" })),
    resume: vi.fn(async () => ({ desiredState: "running" })),
    cancel: vi.fn(async () => ({ desiredState: "cancelled" })),
    reconcile: vi.fn(async () => ({ reconciledAttemptIds: [] })),
    close: vi.fn(),
  };
}

function attemptListPage(
  title = "Review onboarding",
  blockerSummary: string | null = "Waiting for visual review",
) {
  return {
    attempts: [
      {
        schemaVersion: 1,
        projectId: PROJECT,
        title,
        attempt: {
          schemaVersion: 1,
          attemptId: ATTEMPT,
          taskId: TASK,
          taskSpecDigest: `sha256:${"a".repeat(64)}`,
          attemptNumber: 1,
          state: blockerSummary === null ? "running" : "blocked",
          desiredState: "running",
          revision: 3,
          fence: 2,
          currentStepId: null,
          blocker:
            blockerSummary === null
              ? null
              : {
                  kind: "clarification",
                  code: "review.visual",
                  summary: blockerSummary,
                  requiredAction: "Review the simulator recording",
                },
          outcome: null,
          createdAt: "2026-08-10T11:00:00.000Z",
          updatedAt: NOW,
          terminalAt: null,
        },
      },
    ],
    nextAfter: null,
    hasMore: false,
  } as const;
}

function portfolioSnapshot() {
  const candidate = PortfolioReadModelV1Schema.parse({
    schemaVersion: 1,
    generatedAt: NOW,
    projects: [
      {
        projectId: PROJECT,
        slug: "first-app",
        displayName: "First app",
        metadataSource: "task-derived",
        lifecycleStage: null,
        attemptCount: 1,
        activeAttemptCount: 0,
        blockerCount: 0,
        openPullRequestCount: null,
        jiraTodoCount: null,
        jiraInProgressCount: null,
        unresolvedP0: null,
        unresolvedP1: null,
        releaseStage: null,
        lastActivityAt: "2026-08-10T11:00:00.000Z",
        lastDeliveryAt: null,
        health: "unknown",
        healthReasons: [
          "jira-unavailable",
          "github-unavailable",
          "quality-unavailable",
          "release-unavailable",
          "analytics-unavailable",
        ],
        analyticsFreshness: "unavailable",
        sources: {
          localExecution: "available",
          jira: "unavailable",
          github: "unavailable",
          quality: "unavailable",
          release: "unavailable",
          analytics: "unavailable",
        },
      },
    ],
    totals: {
      projects: 1,
      attempts: 1,
      activeAttempts: 0,
      blockers: 0,
      openPullRequests: null,
      jiraTodo: null,
      jiraInProgress: null,
      unresolvedP0: null,
      unresolvedP1: null,
    },
    sourceSnapshotDigest: `sha256:${"a".repeat(64)}`,
  });
  return PortfolioReadModelV1Schema.parse({
    ...candidate,
    sourceSnapshotDigest: `sha256:${createHash("sha256")
      .update(canonicalPortfolioReadModelDigestInputV1(candidate), "utf8")
      .digest("hex")}`,
  });
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

  it("serves a default active work queue through the typed command port", async () => {
    const commandPort = port();
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);

    const response = await exchange(server.origin, {
      path: "/api/attempts",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      page: {
        attempts: [{ title: "Review onboarding", attempt: { attemptId: ATTEMPT } }],
        nextAfter: null,
        hasMore: false,
      },
    });
    expect(commandPort.listAttempts).toHaveBeenCalledWith(
      { scope: "active", projectId: null, after: null, limit: 50 },
      expect.any(AbortSignal),
    );
  });

  it("parses the complete attempt work-queue filter and cursor without ambiguity", async () => {
    const commandPort = port();
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);

    const response = await exchange(server.origin, {
      path: `/api/attempts?scope=all&projectId=${PROJECT}&limit=25&updatedAt=${encodeURIComponent(NOW)}&attemptId=${ATTEMPT}`,
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(commandPort.listAttempts).toHaveBeenCalledWith(
      {
        scope: "all",
        projectId: PROJECT,
        after: { updatedAt: NOW, attemptId: ATTEMPT },
        limit: 25,
      },
      expect.any(AbortSignal),
    );
  });

  it.each([
    "/api/attempts?scope=active&scope=all",
    "/api/attempts?scope=recent",
    "/api/attempts?projectId=not-a-uuid",
    "/api/attempts?limit=0",
    "/api/attempts?limit=101",
    "/api/attempts?limit=1.0",
    `/api/attempts?updatedAt=${encodeURIComponent(NOW)}`,
    `/api/attempts?attemptId=${ATTEMPT}`,
    "/api/attempts?providerToken=secret",
  ])("rejects a non-strict work-queue query: %s", async (path) => {
    const commandPort = port();
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);

    const response = await exchange(server.origin, {
      path,
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });

    expect(response.status).toBe(400);
    expect(commandPort.listAttempts).not.toHaveBeenCalled();
  });

  it("rejects an invalid attempt-list response instead of reflecting unexpected data", async () => {
    const commandPort = port();
    vi.mocked(commandPort.listAttempts).mockResolvedValue({
      ...attemptListPage(),
      providerCredential: "must-not-be-reflected",
    });
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);

    const response = await exchange(server.origin, {
      path: "/api/attempts",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });

    expect(response.status).toBe(400);
    expect(response.body).not.toContain("must-not-be-reflected");
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
    expect(commandPort.pause).toHaveBeenCalledWith(ATTEMPT, "Review", null);
  });

  it("exposes and accepts the durable retry identity after an ambiguous mutation", async () => {
    const commandPort = port();
    vi.mocked(commandPort.pause).mockRejectedValueOnce(
      new CommandClientError("transport.remote-closed", "The response was lost.", true, {
        commandId: COMMAND_ID,
        issuedAt: NOW,
      }),
    );
    const server = await startDashboardServer({
      commandPort,
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const headers = {
      cookie: `factory_dashboard=${SESSION}`,
      "content-type": "application/json",
      origin: server.origin,
      "x-factory-csrf": CSRF,
    };
    const first = await exchange(server.origin, {
      path: "/api/action",
      method: "POST",
      headers,
      body: JSON.stringify({ action: "pause", attemptId: ATTEMPT, reason: null }),
    });
    expect(first.status).toBe(503);
    expect(JSON.parse(first.body)).toMatchObject({
      error: { retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW } },
    });

    const retry = await exchange(server.origin, {
      path: "/api/action",
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "pause",
        attemptId: ATTEMPT,
        reason: null,
        commandId: COMMAND_ID,
        issuedAt: NOW,
      }),
    });
    expect(retry.status).toBe(200);
    expect(commandPort.pause).toHaveBeenLastCalledWith(ATTEMPT, null, {
      commandId: COMMAND_ID,
      issuedAt: NOW,
    });
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
      snapshot: {
        projects: [{ displayName: "First app", openPullRequestCount: null }],
        totals: { openPullRequests: null },
      },
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

  it("rejects a valid-looking portfolio when its source digest is stale", async () => {
    const snapshot = portfolioSnapshot();
    const portfolioPort: DashboardPortfolioPort = {
      snapshot: vi.fn(async () => ({
        ...snapshot,
        sourceSnapshotDigest: `sha256:${"f".repeat(64)}`,
      })),
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
  });

  it("ships explicit unavailable rendering for nullable provider values", async () => {
    const server = await startDashboardServer({
      commandPort: port(),
      portfolioPort: { snapshot: async () => portfolioSnapshot() },
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const response = await exchange(server.origin, {
      path: "/dashboard.js",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain("value===null?'unavailable'");
    expect(response.body).toContain("GitHub PRs:");
  });

  it("auto-loads a refreshable queue, escapes untrusted rows, and drills into exact status", async () => {
    const server = await startDashboardServer({
      commandPort: port(),
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const headers = { cookie: `factory_dashboard=${SESSION}` };
    const [page, script] = await Promise.all([
      exchange(server.origin, { path: "/", headers }),
      exchange(server.origin, { path: "/dashboard.js", headers }),
    ]);
    expect(page.body).toContain('id="attempt-queue"');
    expect(page.body).toContain('id="queue-scope"');
    expect(page.body).toContain('id="queue-project"');

    type FakeEvent = Readonly<{
      target?: Readonly<{
        closest?: (selector: string) => Readonly<{ dataset: { attemptId: string } }> | null;
      }>;
      preventDefault?: () => void;
    }>;
    type FakeElement = {
      content: string;
      value: string;
      textContent: string;
      innerHTML: string;
      className: string;
      disabled: boolean;
      dataset: Record<string, string>;
      classList: {
        add: (name: string) => void;
        remove: (name: string) => void;
        toggle: (name: string, force?: boolean) => void;
      };
      addEventListener: (event: string, listener: (event: FakeEvent) => unknown) => void;
    };
    const listeners = new Map<string, (event: FakeEvent) => unknown>();
    const elements = new Map<string, FakeElement>();
    const element = (selector: string): FakeElement => {
      const existing = elements.get(selector);
      if (existing !== undefined) return existing;
      const created: FakeElement = {
        content: selector === "meta[name=factory-csrf]" ? CSRF : "",
        value: selector === "#queue-scope" ? "active" : "",
        textContent: "",
        innerHTML: "",
        className: "",
        disabled: false,
        dataset: {},
        classList: {
          add: () => undefined,
          remove: () => undefined,
          toggle: () => undefined,
        },
        addEventListener: (event, listener) => {
          if (selector === "#attempt-queue") listeners.set(event, listener);
        },
      };
      elements.set(selector, created);
      return created;
    };
    const requested: string[] = [];
    const unsafeTitle = '<img src=x onerror="alert(1)">';
    const unsafeBlocker = '"><script>alert(2)</script>';
    const fetchStub = async (path: string) => {
      requested.push(path);
      if (path === "/api/doctor") {
        return { ok: true, json: async () => ({ result: { readiness: "ready" } }) };
      }
      if (path.startsWith("/api/attempts?")) {
        return {
          ok: true,
          json: async () => ({ page: attemptListPage(unsafeTitle, unsafeBlocker) }),
        };
      }
      if (path === `/api/attempt/${ATTEMPT}`) {
        return {
          ok: true,
          json: async () => ({
            status: {
              attempt: {
                attemptId: ATTEMPT,
                state: "paused",
                desiredState: "paused",
                revision: 4,
                fence: 2,
                blocker: null,
              },
            },
            events: { events: [] },
          }),
        };
      }
      throw new Error(`Unexpected dashboard request: ${path}`);
    };

    runInNewContext(script.body, {
      document: {
        querySelector: (selector: string) => element(selector),
        querySelectorAll: () => [],
      },
      fetch: fetchStub,
      alert: () => undefined,
      setInterval: () => 0,
      encodeURIComponent,
      Error,
      JSON,
      Map,
      String,
      URLSearchParams,
    });

    await vi.waitFor(() => expect(element("#attempt-queue").innerHTML).toContain("&lt;img"));
    expect(element("#attempt-queue").innerHTML).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(element("#attempt-queue").innerHTML).not.toContain("<img");
    expect(element("#attempt-queue").innerHTML).not.toContain("<script>");
    expect(requested).toContain("/api/attempts?scope=active&limit=25");

    const click = listeners.get("click");
    if (click === undefined) throw new Error("Queue click listener was not registered");
    click({
      target: {
        closest: () => ({ dataset: { attemptId: ATTEMPT } }),
      },
    });

    await vi.waitFor(() => expect(requested).toContain(`/api/attempt/${ATTEMPT}`));
    await vi.waitFor(() => expect(element("#attempt-title").textContent).toBe("paused · 75000000"));
    expect(element("#attempt-id").value).toBe(ATTEMPT);
  });

  it("discards an ambiguous action identity after a different successful action", async () => {
    const server = await startDashboardServer({
      commandPort: port(),
      browserToken: TOKEN,
      csrfToken: CSRF,
      sessionToken: SESSION,
    });
    servers.push(server);
    const script = await exchange(server.origin, {
      path: "/dashboard.js",
      headers: { cookie: `factory_dashboard=${SESSION}` },
    });
    const listeners = new Map<string, () => Promise<void>>();
    const actionBodies: Record<string, unknown>[] = [];
    const buttons = ["pause", "resume"].map((action) => ({
      dataset: { action },
      disabled: false,
      addEventListener: (_event: string, listener: () => Promise<void>) =>
        listeners.set(action, listener),
    }));
    const elements = new Map<string, Record<string, unknown>>();
    const element = (selector: string): Record<string, unknown> => {
      const existing = elements.get(selector);
      if (existing !== undefined) return existing;
      const created = {
        content: CSRF,
        value: "",
        textContent: "",
        innerHTML: "",
        className: "",
        classList: {
          add: () => undefined,
          remove: () => undefined,
          toggle: () => undefined,
        },
        addEventListener: () => undefined,
      };
      elements.set(selector, created);
      return created;
    };
    let firstPause = true;
    const fetchStub = async (path: string, options: { body?: string } = {}) => {
      if (path === "/api/doctor") {
        return { ok: true, json: async () => ({ result: { readiness: "ready" } }) };
      }
      if (path.startsWith("/api/attempt/")) {
        return {
          ok: true,
          json: async () => ({
            status: {
              attempt: {
                attemptId: ATTEMPT,
                state: "running",
                desiredState: "running",
                revision: 1,
                fence: 1,
                blocker: null,
              },
            },
            events: { events: [] },
          }),
        };
      }
      if (path === "/api/action") {
        const body = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        actionBodies.push(body);
        if (body.action === "pause" && firstPause) {
          firstPause = false;
          return {
            ok: false,
            json: async () => ({
              error: {
                message: "The response was lost.",
                retryIdentity: { commandId: COMMAND_ID, issuedAt: NOW },
              },
            }),
          };
        }
        return { ok: true, json: async () => ({ result: { accepted: true } }) };
      }
      throw new Error(`Unexpected dashboard request: ${path}`);
    };
    runInNewContext(
      `${script.body}\nselected=${JSON.stringify(ATTEMPT)};attemptId.value=selected;`,
      {
        document: {
          querySelector: (selector: string) => element(selector),
          querySelectorAll: () => buttons,
        },
        fetch: fetchStub,
        alert: () => undefined,
        setInterval: () => 0,
        encodeURIComponent,
        Error,
        JSON,
        Map,
        String,
        URLSearchParams,
      },
    );
    const pause = listeners.get("pause");
    const resume = listeners.get("resume");
    if (pause === undefined || resume === undefined) {
      throw new Error("Dashboard action listeners were not registered");
    }

    await pause();
    await resume();
    await pause();

    expect(actionBodies).toHaveLength(3);
    expect(actionBodies[0]).not.toHaveProperty("commandId");
    expect(actionBodies[1]).not.toHaveProperty("commandId");
    expect(actionBodies[2]).not.toHaveProperty("commandId");
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
