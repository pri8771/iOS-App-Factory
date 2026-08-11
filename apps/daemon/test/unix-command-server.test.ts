import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startUnixCommandServer,
  type CommandServerStartError,
  type UnixCommandServer,
} from "../src/index.js";

const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";
const REQUEST_ID = "00000000-0000-4000-8000-000000000010";
const COMMAND_ID = "00000000-0000-4000-8000-000000000004";
const NOW = "2026-08-10T12:00:00.000Z";

const requestId = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const runtimeRoots: string[] = [];
const servers: UnixCommandServer[] = [];

async function createSocketPath(): Promise<string> {
  const base = process.platform === "darwin" ? "/private/tmp" : tmpdir();
  const root = await mkdtemp(join(base, "afcmd-"));
  runtimeRoots.push(root);
  return join(root, "daemon.sock");
}

function doctorFrame(
  overrides: Readonly<{
    authorization?: string;
    requestId?: string;
    commandId?: string;
    issuedAt?: string;
  }> = {},
): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId: overrides.requestId ?? REQUEST_ID,
    authorization: overrides.authorization ?? AUTHORIZATION,
    request: {
      schemaVersion: 1,
      commandId: overrides.commandId ?? COMMAND_ID,
      issuedAt: overrides.issuedAt ?? NOW,
      origin: "cli",
      operation: "doctor",
      payload: {},
    },
  };
}

function doctorResult() {
  return {
    operation: "doctor" as const,
    readiness: "ready" as const,
    daemonVersion: "0.1.0",
    protocolVersion: 1 as const,
    startedAt: NOW,
    issues: [],
  };
}

async function exchange(
  socketPath: string,
  request: Buffer | string | Record<string, unknown>,
): Promise<Buffer> {
  const encoded = Buffer.isBuffer(request)
    ? request
    : typeof request === "string"
      ? Buffer.from(request, "utf8")
      : Buffer.from(`${JSON.stringify(request)}\n`);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection({ path: socketPath });
    socket.once("connect", () => socket.write(encoded));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => resolve(Buffer.concat(chunks)));
    socket.once("error", reject);
  });
}

function decode(response: Buffer): Record<string, unknown> {
  return JSON.parse(response.toString("utf8")) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await server.close()));
  await Promise.all(
    runtimeRoots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
});

describe("Unix command server security", () => {
  it("creates a private socket and ownership file", async () => {
    const socketPath = await createSocketPath();
    const server = await startUnixCommandServer({
      socketPath,
      authorization: AUTHORIZATION,
      handler: () => doctorResult(),
    });
    servers.push(server);

    expect((await lstat(socketPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(`${socketPath}.lock`)).mode & 0o777).toBe(0o600);
  });

  it("authenticates before invoking the business handler and never echoes credentials", async () => {
    const socketPath = await createSocketPath();
    const handler = vi.fn(() => doctorResult());
    servers.push(
      await startUnixCommandServer({ socketPath, authorization: AUTHORIZATION, handler }),
    );

    const response = await exchange(
      socketPath,
      doctorFrame({ authorization: "wrong-authorization-token-32-bytes-minimum" }),
    );
    expect(decode(response)).toMatchObject({
      ok: false,
      error: { code: "protocol.unauthorized", retryable: false },
    });
    expect(response.toString("utf8")).not.toContain(AUTHORIZATION);
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses an active second owner", async () => {
    const socketPath = await createSocketPath();
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        handler: () => doctorResult(),
      }),
    );
    await expect(
      startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        handler: () => doctorResult(),
      }),
    ).rejects.toMatchObject<Partial<CommandServerStartError>>({ code: "daemon.already-running" });
  });

  it("reclaims a private stale ownership record", async () => {
    const socketPath = await createSocketPath();
    await writeFile(
      `${socketPath}.lock`,
      `${JSON.stringify({ instanceId: "stale-test", pid: 2_147_483_647 })}\n`,
      { mode: 0o600 },
    );
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        handler: () => doctorResult(),
      }),
    );
    expect((await lstat(socketPath)).isSocket()).toBe(true);
  });

  it("never removes a non-socket collision", async () => {
    const socketPath = await createSocketPath();
    await writeFile(socketPath, "operator data", { mode: 0o600 });
    await expect(
      startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        handler: () => doctorResult(),
      }),
    ).rejects.toMatchObject<Partial<CommandServerStartError>>({
      code: "daemon.unsafe-runtime-path",
    });
    expect((await lstat(socketPath)).isFile()).toBe(true);
  });
});

describe("Unix command protocol framing", () => {
  it("rejects malformed and oversized frames deterministically", async () => {
    const socketPath = await createSocketPath();
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        maxRequestBytes: 512,
        handler: () => doctorResult(),
      }),
    );

    expect(decode(await exchange(socketPath, "{not-json}\n"))).toMatchObject({
      ok: false,
      error: { code: "protocol.malformed-request" },
    });
    expect(decode(await exchange(socketPath, Buffer.from([0xff, 0x0a])))).toMatchObject({
      ok: false,
      error: { code: "protocol.malformed-request" },
    });
    expect(decode(await exchange(socketPath, `${"x".repeat(513)}\n`))).toMatchObject({
      ok: false,
      error: { code: "protocol.request-too-large" },
    });
  });

  it("replaces an oversized handler response with a bounded protocol error", async () => {
    const socketPath = await createSocketPath();
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        maxResponseBytes: 300,
        handler: () => ({ ...doctorResult(), issues: ["x".repeat(1_000)] }),
      }),
    );

    const response = await exchange(socketPath, doctorFrame());
    expect(response.byteLength).toBeLessThanOrEqual(300);
    expect(decode(response)).toMatchObject({
      ok: false,
      error: { code: "protocol.response-too-large" },
    });
  });

  it("coalesces in-flight duplicates and replays byte-identical completed responses", async () => {
    const socketPath = await createSocketPath();
    let release: ((value: ReturnType<typeof doctorResult>) => void) | undefined;
    const handler = vi.fn(
      async () =>
        await new Promise<ReturnType<typeof doctorResult>>((resolve) => {
          release = resolve;
        }),
    );
    servers.push(
      await startUnixCommandServer({ socketPath, authorization: AUTHORIZATION, handler }),
    );

    const firstPromise = exchange(socketPath, doctorFrame());
    while (handler.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
    const duplicatePromise = exchange(socketPath, doctorFrame());
    release?.(doctorResult());
    const [first, duplicate] = await Promise.all([firstPromise, duplicatePromise]);
    const completedReplay = await exchange(socketPath, doctorFrame());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(duplicate.equals(first)).toBe(true);
    expect(completedReplay.equals(first)).toBe(true);
  });

  it("coalesces an oversized in-flight replay but does not retain it past the byte budget", async () => {
    const socketPath = await createSocketPath();
    let release: ((value: ReturnType<typeof doctorResult>) => void) | undefined;
    const handler = vi.fn(
      async () =>
        await new Promise<ReturnType<typeof doctorResult>>((resolve) => {
          release = resolve;
        }),
    );
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        replayResponseByteBudget: 64,
        handler,
      }),
    );

    const firstPromise = exchange(socketPath, doctorFrame());
    while (handler.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
    const duplicatePromise = exchange(socketPath, doctorFrame());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler).toHaveBeenCalledTimes(1);
    release?.(doctorResult());
    const [first, duplicate] = await Promise.all([firstPromise, duplicatePromise]);
    expect(duplicate.equals(first)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    const lateReplayPromise = exchange(socketPath, doctorFrame());
    while (handler.mock.calls.length < 2) await new Promise((resolve) => setImmediate(resolve));
    release?.(doctorResult());
    const lateReplay = await lateReplayPromise;
    expect(lateReplay.equals(first)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(Buffer.concat([first, duplicate, lateReplay]).toString("utf8")).not.toContain(
      AUTHORIZATION,
    );
  });

  it("evicts completed responses by byte-bounded LRU order", async () => {
    const socketPath = await createSocketPath();
    const handler = vi.fn(() => doctorResult());
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        replayResponseByteBudget: 470,
        handler,
      }),
    );
    const first = doctorFrame({ requestId: requestId(101), commandId: requestId(201) });
    const second = doctorFrame({ requestId: requestId(102), commandId: requestId(202) });
    const third = doctorFrame({ requestId: requestId(103), commandId: requestId(203) });

    await exchange(socketPath, first);
    await exchange(socketPath, second);
    await exchange(socketPath, first);
    await exchange(socketPath, third);
    await exchange(socketPath, first);
    expect(handler).toHaveBeenCalledTimes(3);

    await exchange(socketPath, second);
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it("expires completed replay responses after the configured TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    try {
      const socketPath = await createSocketPath();
      const handler = vi.fn(() => doctorResult());
      servers.push(
        await startUnixCommandServer({
          socketPath,
          authorization: AUTHORIZATION,
          replayResponseTtlMs: 1_000,
          handler,
        }),
      );

      const first = await exchange(socketPath, doctorFrame());
      const immediateReplay = await exchange(socketPath, doctorFrame());
      expect(immediateReplay.equals(first)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-08-10T12:00:01.000Z"));
      const expiredReplay = await exchange(socketPath, doctorFrame());
      expect(expiredReplay.equals(first)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves durable command effects when an evicted delivery is retried", async () => {
    const socketPath = await createSocketPath();
    const durableResults = new Map<string, ReturnType<typeof doctorResult>>();
    let durableEffects = 0;
    const handler = vi.fn((request: { commandId: string }) => {
      const existing = durableResults.get(request.commandId);
      if (existing !== undefined) return existing;
      durableEffects += 1;
      const result = doctorResult();
      durableResults.set(request.commandId, result);
      return result;
    });
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        replayResponseByteBudget: 64,
        handler,
      }),
    );

    const first = await exchange(socketPath, doctorFrame());
    const retry = await exchange(socketPath, doctorFrame());
    expect(retry.equals(first)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(durableEffects).toBe(1);
  });

  it("rejects reuse of a request ID with a changed issuedAt", async () => {
    const socketPath = await createSocketPath();
    const handler = vi.fn(() => doctorResult());
    servers.push(
      await startUnixCommandServer({ socketPath, authorization: AUTHORIZATION, handler }),
    );

    await exchange(socketPath, doctorFrame());
    const conflict = decode(
      await exchange(socketPath, doctorFrame({ issuedAt: "2026-08-10T12:00:01.000Z" })),
    );
    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "protocol.request-id-conflict" },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("marks handler timeouts ambiguous and replays that outcome without a second execution", async () => {
    const socketPath = await createSocketPath();
    let release: ((value: ReturnType<typeof doctorResult>) => void) | undefined;
    const handler = vi.fn(
      async () =>
        await new Promise<ReturnType<typeof doctorResult>>((resolve) => {
          release = resolve;
        }),
    );
    servers.push(
      await startUnixCommandServer({
        socketPath,
        authorization: AUTHORIZATION,
        handlerTimeoutMs: 10,
        handler,
      }),
    );

    const first = await exchange(socketPath, doctorFrame());
    expect(decode(first)).toMatchObject({
      ok: false,
      error: { code: "daemon.handler-timeout-ambiguous", retryable: true },
    });
    release?.(doctorResult());
    const replay = await exchange(socketPath, doctorFrame());
    expect(replay.equals(first)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
