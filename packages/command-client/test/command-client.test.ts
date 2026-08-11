import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCommandClient, type CommandClientError } from "../src/index.js";

const AUTHORIZATION = "test-authorization-token-32-bytes-minimum";
const REQUEST_ID = "00000000-0000-4000-8000-000000000010";
const COMMAND_ID = "00000000-0000-4000-8000-000000000004";
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
    const socketPath = await createFakeServer(onRequest(() => undefined));
    const client = createCommandClient({
      socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => NOW,
    });

    const inFlight = client.doctor(identity());
    await new Promise((resolve) => setImmediate(resolve));
    client.close();
    await expect(inFlight).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.closed",
    });
    await expect(client.doctor()).rejects.toMatchObject<Partial<CommandClientError>>({
      code: "client.closed",
    });
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
    >({ code: "protocol.malformed-response" });
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
    >({ code: "protocol.response-too-large" });
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
