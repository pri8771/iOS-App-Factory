import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type McpServer } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFactoryMcpServer, type McpCommandPort } from "../src/server.js";

const ATTEMPT_ID = "76000000-0000-4000-8000-000000000001";
const clients: Client[] = [];
const servers: McpServer[] = [];

function commandPort(): McpCommandPort {
  return {
    doctor: vi.fn(async () => ({
      operation: "doctor",
      readiness: "ready",
      daemonVersion: "0.1.0",
      protocolVersion: 1,
      startedAt: "2026-08-11T12:00:00.000Z",
      issues: [],
    })),
    submit: vi.fn(async () => ({ operation: "task.submit" })),
    run: vi.fn(async () => ({ operation: "task.run" })),
    status: vi.fn(async (attemptId) => ({
      operation: "attempt.status",
      attempt: { attemptId, state: "running" },
    })),
    events: vi.fn(async () => ({
      operation: "attempt.events",
      events: [],
      nextAfterSequence: 0,
    })),
    pause: vi.fn(async (attemptId) => ({
      operation: "attempt.pause",
      attemptId,
      accepted: true,
    })),
    resume: vi.fn(async (attemptId) => ({
      operation: "attempt.resume",
      attemptId,
      accepted: true,
    })),
    cancel: vi.fn(async (attemptId) => ({
      operation: "attempt.cancel",
      attemptId,
      accepted: true,
    })),
    reconcile: vi.fn(async () => ({
      operation: "daemon.reconcile",
      accepted: true,
      reconciledAttemptIds: [],
    })),
  };
}

async function connected(port: McpCommandPort): Promise<Client> {
  const server = createFactoryMcpServer(port);
  const client = new Client({ name: "factory-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  servers.push(server);
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => await client.close()));
  await Promise.all(servers.splice(0).map(async (server) => await server.close()));
});

describe("Factory MCP command surface", () => {
  it("advertises the complete thin-client surface with safety annotations", async () => {
    const client = await connected(commandPort());
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "factory_attempt_cancel",
      "factory_attempt_events",
      "factory_attempt_pause",
      "factory_attempt_resume",
      "factory_attempt_status",
      "factory_doctor",
      "factory_reconcile",
      "factory_task_run",
      "factory_task_submit",
    ]);
    expect(tools.tools.find((tool) => tool.name === "factory_doctor")?.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(
      tools.tools.find((tool) => tool.name === "factory_attempt_cancel")?.annotations,
    ).toMatchObject({ destructiveHint: true });
  });

  it("returns the same typed daemon results and routes mutations through the port", async () => {
    const port = commandPort();
    const client = await connected(port);
    const doctor = await client.callTool({ name: "factory_doctor", arguments: {} });
    expect(doctor.isError).not.toBe(true);
    expect(doctor.structuredContent).toMatchObject({
      result: { operation: "doctor", readiness: "ready" },
    });

    const pause = await client.callTool({
      name: "factory_attempt_pause",
      arguments: { attemptId: ATTEMPT_ID, reason: "Operator review" },
    });
    expect(pause.isError).not.toBe(true);
    expect(port.pause).toHaveBeenCalledWith(ATTEMPT_ID, "Operator review", expect.any(AbortSignal));
  });

  it("rejects invalid input before daemon dispatch", async () => {
    const port = commandPort();
    const client = await connected(port);
    const response = await client.callTool({
      name: "factory_attempt_status",
      arguments: { attemptId: "not-an-attempt" },
    });
    expect(response.isError).toBe(true);
    expect(port.status).not.toHaveBeenCalled();
  });

  it("returns stable failures without leaking unexpected daemon errors", async () => {
    const port = commandPort();
    vi.mocked(port.status).mockRejectedValueOnce(
      new Error("provider token should-not-appear-in-MCP-output"),
    );
    const client = await connected(port);
    const response = await client.callTool({
      name: "factory_attempt_status",
      arguments: { attemptId: ATTEMPT_ID },
    });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response)).toContain("mcp.command-failed");
    expect(JSON.stringify(response)).not.toContain("should-not-appear");
  });
});
