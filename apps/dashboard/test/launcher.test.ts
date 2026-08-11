import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PortfolioReadModelV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
} from "@app-factory/contracts";

import {
  loadDashboardLauncherConfiguration,
  readDashboardAuthorizationFile,
  runDashboardProcess,
  startDashboardLauncher,
  type DashboardLauncherConfiguration,
  type DashboardServer,
} from "../src/index.js";

const AUTHORIZATION = "daemon-authorization-000000000000000000000000000001";
const NOW = "2026-08-10T12:00:00.000Z";
const roots: string[] = [];
const servers: DashboardServer[] = [];
const daemonServers: Server[] = [];
const daemonSockets = new Set<Socket>();

function portfolioSnapshot() {
  const digestInput = {
    schemaVersion: 1 as const,
    generatedAt: NOW,
    projects: [
      {
        projectId: "00000000-0000-4000-8000-000000000101",
        slug: "local-project",
        displayName: "Local Project",
        metadataSource: "task-derived" as const,
        lifecycleStage: "building" as const,
        attemptCount: 1,
        activeAttemptCount: 0,
        blockerCount: 0,
        lastActivityAt: NOW,
        lastDeliveryAt: null,
        openPullRequestCount: null,
        jiraTodoCount: null,
        jiraInProgressCount: null,
        unresolvedP0: null,
        unresolvedP1: null,
        releaseStage: null,
        analyticsFreshness: "unavailable" as const,
        sources: {
          localExecution: "available" as const,
          jira: "unavailable" as const,
          github: "unavailable" as const,
          quality: "unavailable" as const,
          release: "unavailable" as const,
          analytics: "unavailable" as const,
        },
        health: "unknown" as const,
        healthReasons: [
          "jira-unavailable" as const,
          "github-unavailable" as const,
          "quality-unavailable" as const,
          "release-unavailable" as const,
          "analytics-unavailable" as const,
        ],
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
  };
  return PortfolioReadModelV1Schema.parse({
    ...digestInput,
    sourceSnapshotDigest: `sha256:${createHash("sha256")
      .update(canonicalPortfolioReadModelDigestInputV1(digestInput), "utf8")
      .digest("hex")}`,
  });
}

async function privateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-dashboard-"));
  roots.push(root);
  await chmod(root, 0o700);
  return root;
}

async function writePrivate(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function startFakePortfolioDaemon(
  root: string,
  received: Record<string, unknown>[],
): Promise<string> {
  const socketPath = join(root, "daemon.sock");
  const snapshot = portfolioSnapshot();
  const daemon = createServer((socket) => {
    daemonSockets.add(socket);
    socket.once("close", () => daemonSockets.delete(socket));
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const frame = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
      received.push(frame);
      socket.end(
        `${JSON.stringify({
          protocolVersion: 1,
          requestId: frame.requestId,
          ok: true,
          result: { operation: "portfolio.snapshot", snapshot },
        })}\n`,
      );
    });
  });
  daemonServers.push(daemon);
  await new Promise<void>((resolve, reject) => {
    daemon.once("error", reject);
    daemon.listen(socketPath, resolve);
  });
  return socketPath;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await server.close()));
  for (const socket of daemonSockets) socket.destroy();
  daemonSockets.clear();
  await Promise.all(
    daemonServers.splice(0).map(
      async (server) =>
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("dashboard launcher configuration", () => {
  it("loads a strict private configuration file and private authorization file", async () => {
    const root = await privateRoot();
    const authorizationFile = join(root, "authorization");
    const configurationFile = join(root, "dashboard.json");
    await writePrivate(authorizationFile, `${AUTHORIZATION}\n`);
    await writePrivate(
      configurationFile,
      JSON.stringify({
        schemaVersion: 1,
        socketPath: join(root, "daemon.sock"),
        authorizationFile,
        port: 4317,
      }),
    );

    await expect(
      loadDashboardLauncherConfiguration(["--config", configurationFile], {}),
    ).resolves.toEqual({
      socketPath: join(root, "daemon.sock"),
      authorization: AUTHORIZATION,
      port: 4317,
    });
  });

  it("validates direct environment configuration without accepting an inline secret", async () => {
    const root = await privateRoot();
    const authorizationFile = join(root, "authorization");
    await writePrivate(authorizationFile, AUTHORIZATION);

    await expect(
      loadDashboardLauncherConfiguration([], {
        APP_FACTORY_SOCKET: join(root, "daemon.sock"),
        APP_FACTORY_AUTH_FILE: authorizationFile,
        APP_FACTORY_DASHBOARD_PORT: "0",
      }),
    ).resolves.toEqual({
      socketPath: join(root, "daemon.sock"),
      authorization: AUTHORIZATION,
      port: 0,
    });
  });

  it("rejects unknown configuration fields and non-private authorization files", async () => {
    const root = await privateRoot();
    const authorizationFile = join(root, "authorization");
    const configurationFile = join(root, "dashboard.json");
    await writePrivate(authorizationFile, AUTHORIZATION);
    await writePrivate(
      configurationFile,
      JSON.stringify({
        schemaVersion: 1,
        socketPath: join(root, "daemon.sock"),
        authorizationFile,
        port: 0,
        providerToken: "must-not-be-accepted",
      }),
    );
    await expect(
      loadDashboardLauncherConfiguration(["--config", configurationFile], {}),
    ).rejects.toThrow("does not match schema version 1");

    await chmod(authorizationFile, 0o640);
    await expect(readDashboardAuthorizationFile(authorizationFile)).rejects.toThrow(
      "must not be accessible by group or others",
    );
  });

  it("will not follow a symbolic link to the daemon authorization", async () => {
    const root = await privateRoot();
    const authorizationFile = join(root, "authorization");
    const link = join(root, "authorization-link");
    await writePrivate(authorizationFile, AUTHORIZATION);
    await symlink(authorizationFile, link);

    await expect(readDashboardAuthorizationFile(link)).rejects.toThrow("cannot be opened safely");
  });
});

describe("packaged dashboard lifecycle", () => {
  it("serves a digest-verified authoritative portfolio through the packaged launcher", async () => {
    const root = await privateRoot();
    const received: Record<string, unknown>[] = [];
    const socketPath = await startFakePortfolioDaemon(root, received);
    const server = await startDashboardLauncher({
      socketPath,
      authorization: AUTHORIZATION,
      port: 0,
    });
    servers.push(server);

    const authenticated = await fetch(server.launchUrl, { redirect: "manual" });
    const cookie = authenticated.headers.get("set-cookie")?.split(";", 1)[0];
    expect(authenticated.status).toBe(303);

    const response = await fetch(`${server.origin}/api/portfolio`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Readonly<{ snapshot: unknown }>;
    const snapshot = PortfolioReadModelV1Schema.parse(body.snapshot);
    expect(snapshot.projects[0]).toMatchObject({
      openPullRequestCount: null,
      jiraTodoCount: null,
      jiraInProgressCount: null,
      unresolvedP0: null,
      unresolvedP1: null,
      releaseStage: null,
      analyticsFreshness: "unavailable",
      sources: {
        localExecution: "available",
        jira: "unavailable",
        github: "unavailable",
        quality: "unavailable",
        release: "unavailable",
        analytics: "unavailable",
      },
    });
    expect(snapshot.totals).toMatchObject({
      openPullRequests: null,
      jiraTodo: null,
      jiraInProgress: null,
      unresolvedP0: null,
      unresolvedP1: null,
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      authorization: AUTHORIZATION,
      request: { operation: "portfolio.snapshot", payload: {} },
    });
  });

  it("binds only to IPv4 loopback and does not put daemon authorization in its URL", async () => {
    const root = await privateRoot();
    const server = await startDashboardLauncher({
      socketPath: join(root, "daemon.sock"),
      authorization: AUTHORIZATION,
      port: 0,
    });
    servers.push(server);

    expect(new URL(server.origin).hostname).toBe("127.0.0.1");
    expect(new URL(server.launchUrl).hostname).toBe("127.0.0.1");
    expect(server.launchUrl).not.toContain(AUTHORIZATION);
    expect(server.launchUrl).toMatch(/[?&]token=[A-Za-z0-9_-]{32,}/);

    const authenticated = await fetch(server.launchUrl, { redirect: "manual" });
    const cookie = authenticated.headers.get("set-cookie")?.split(";", 1)[0];
    expect(authenticated.status).toBe(303);
    expect(cookie).toMatch(/^factory_dashboard=/);
    const portfolio = await fetch(`${server.origin}/api/portfolio`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(portfolio.status).toBe(503);
    expect(await portfolio.text()).toContain("Portfolio is unavailable.");
  });

  it("waits for a termination signal, closes once, and removes signal handlers", async () => {
    const signals = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const server: DashboardServer = {
      origin: "http://127.0.0.1:4317",
      launchUrl: "http://127.0.0.1:4317/?token=private-browser-token",
      close,
    };
    const configuration: DashboardLauncherConfiguration = {
      socketPath: "/private/tmp/app-factory.sock",
      authorization: AUTHORIZATION,
      port: 4317,
    };
    const stdout: string[] = [];
    const stderr: string[] = [];
    const running = runDashboardProcess(
      [],
      {},
      { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
      {
        signals,
        loadConfiguration: vi.fn(async () => configuration),
        start: vi.fn(async () => server),
      },
    );

    await vi.waitFor(() => expect(stdout).toHaveLength(1));
    signals.emit("SIGTERM");

    await expect(running).resolves.toBe(0);
    expect(close).toHaveBeenCalledOnce();
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(stdout.join("")).not.toContain(AUTHORIZATION);
    expect(stderr).toEqual([]);
  });

  it("renders startup failures without reflecting credentials or internal errors", async () => {
    const signals = new EventEmitter();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = await runDashboardProcess(
      [],
      {},
      { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
      {
        signals,
        loadConfiguration: async () => ({
          socketPath: "/private/tmp/app-factory.sock",
          authorization: AUTHORIZATION,
          port: 4317,
        }),
        start: async () => {
          throw new Error(`provider failed with ${AUTHORIZATION}`);
        },
      },
    );

    expect(result).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["ERROR [dashboard.failed] The local dashboard failed.\n"]);
    expect(stderr.join("")).not.toContain(AUTHORIZATION);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("returns a usage exit for invalid arguments without starting or reflecting them", async () => {
    const signals = new EventEmitter();
    const start = vi.fn(async () => {
      throw new Error("must not start");
    });
    const stderr: string[] = [];
    const result = await runDashboardProcess(
      [AUTHORIZATION],
      {},
      { stdout: () => undefined, stderr: (value) => stderr.push(value) },
      { signals, start },
    );

    expect(result).toBe(2);
    expect(start).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("dashboard.configuration");
    expect(stderr.join("")).not.toContain(AUTHORIZATION);
  });
});
