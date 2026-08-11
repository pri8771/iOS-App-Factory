import { request } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startDashboardServer,
  type DashboardCommandPort,
  type DashboardServer,
} from "../src/index.js";

const TOKEN = "browser-token-00000000000000000000000000000001";
const CSRF = "csrf-token-0000000000000000000000000000000001";
const SESSION = "session-token-0000000000000000000000000000001";
const ATTEMPT = "75000000-0000-4000-8000-000000000001";
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
});
