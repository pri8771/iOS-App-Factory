import { CommandClientError, type CommandClient } from "@app-factory/command-client";
import {
  AttemptIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

export type McpCommandPort = Readonly<{
  doctor(signal?: AbortSignal): Promise<unknown>;
  submit(taskSpec: TaskSpecV1, signal?: AbortSignal): Promise<unknown>;
  run(taskSpec: TaskSpecV1, signal?: AbortSignal): Promise<unknown>;
  status(attemptId: AttemptId, signal?: AbortSignal): Promise<unknown>;
  events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence: number; limit: number }>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  pause(attemptId: AttemptId, reason: string | null, signal?: AbortSignal): Promise<unknown>;
  resume(attemptId: AttemptId, reason: string | null, signal?: AbortSignal): Promise<unknown>;
  cancel(attemptId: AttemptId, reason: string | null, signal?: AbortSignal): Promise<unknown>;
  reconcile(attemptId: AttemptId | null, signal?: AbortSignal): Promise<unknown>;
}>;

function resultObject(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(JSON.stringify(value)) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { value: parsed };
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function success(value: unknown): CallToolResult {
  const result = resultObject(value);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}

function failure(error: unknown): CallToolResult {
  const normalized =
    error instanceof CommandClientError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : { code: "mcp.command-failed", message: "The Factory command failed.", retryable: false };
  return {
    content: [{ type: "text", text: JSON.stringify({ error: normalized }, null, 2) }],
    structuredContent: { error: normalized },
    isError: true,
  };
}

async function invoke(call: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return success(await call());
  } catch (error) {
    return failure(error);
  }
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const CONTROL = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createFactoryMcpServer(port: McpCommandPort): McpServer {
  const server = new McpServer({ name: "app-factory", version: "0.1.0" });

  server.registerTool(
    "factory_doctor",
    {
      title: "Check App Factory",
      description: "Check the local daemon's readiness and protocol version.",
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
    },
    async (_input, context) => await invoke(async () => await port.doctor(context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_task_submit",
    {
      title: "Submit Factory task",
      description:
        "Persist a validated TaskSpec without starting it. The daemon remains authoritative.",
      inputSchema: z.strictObject({ taskSpec: TaskSpecV1Schema }),
      annotations: { ...CONTROL, idempotentHint: false },
    },
    async ({ taskSpec }, context) =>
      await invoke(async () => await port.submit(taskSpec, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_task_run",
    {
      title: "Start Factory task",
      description:
        "Persist and start a validated TaskSpec. This does not bypass policy, approval, or verification gates.",
      inputSchema: z.strictObject({ taskSpec: TaskSpecV1Schema }),
      annotations: { ...CONTROL, idempotentHint: false },
    },
    async ({ taskSpec }, context) =>
      await invoke(async () => await port.run(taskSpec, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_attempt_status",
    {
      title: "Inspect Factory attempt",
      description: "Read the durable state and blocker for one execution attempt.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema }),
      annotations: READ_ONLY,
    },
    async ({ attemptId }, context) =>
      await invoke(async () => await port.status(attemptId, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_attempt_events",
    {
      title: "Read Factory timeline",
      description: "Read a bounded page from an attempt's ordered, append-only event timeline.",
      inputSchema: z.strictObject({
        attemptId: AttemptIdSchema,
        afterSequence: z.number().int().nonnegative().default(0),
        limit: z.number().int().positive().max(1_000).default(100),
      }),
      annotations: READ_ONLY,
    },
    async ({ attemptId, afterSequence, limit }, context) =>
      await invoke(
        async () => await port.events(attemptId, { afterSequence, limit }, context.mcpReq.signal),
      ),
  );

  const reasonSchema = z.string().min(1).max(1_000).nullable().default(null);
  server.registerTool(
    "factory_attempt_pause",
    {
      title: "Pause Factory attempt",
      description: "Persist a paused desired state. Running work stops at its fenced boundary.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema, reason: reasonSchema }),
      annotations: CONTROL,
    },
    async ({ attemptId, reason }, context) =>
      await invoke(async () => await port.pause(attemptId, reason, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_attempt_resume",
    {
      title: "Resume Factory attempt",
      description:
        "Persist a running desired state and let the daemon reconcile from durable evidence.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema, reason: reasonSchema }),
      annotations: CONTROL,
    },
    async ({ attemptId, reason }, context) =>
      await invoke(async () => await port.resume(attemptId, reason, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_attempt_cancel",
    {
      title: "Cancel Factory attempt",
      description:
        "Persist cancellation for one attempt. Completed external effects are not undone.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema, reason: reasonSchema }),
      annotations: { ...CONTROL, destructiveHint: true },
    },
    async ({ attemptId, reason }, context) =>
      await invoke(async () => await port.cancel(attemptId, reason, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_reconcile",
    {
      title: "Reconcile App Factory",
      description:
        "Ask the daemon to reconcile one attempt or all attempts against durable local state.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema.nullable().default(null) }),
      annotations: CONTROL,
    },
    async ({ attemptId }, context) =>
      await invoke(async () => await port.reconcile(attemptId, context.mcpReq.signal)),
  );

  return server;
}

export function commandClientMcpPort(client: CommandClient): McpCommandPort {
  return {
    doctor: async (signal) => await client.doctor(undefined, signal),
    submit: async (taskSpec, signal) => await client.submit(taskSpec, undefined, signal),
    run: async (taskSpec, signal) => await client.run(taskSpec, undefined, signal),
    status: async (attemptId, signal) => await client.status(attemptId, undefined, signal),
    events: async (attemptId, options, signal) =>
      await client.events(attemptId, options, undefined, signal),
    pause: async (attemptId, reason, signal) =>
      await client.pause(attemptId, reason, undefined, signal),
    resume: async (attemptId, reason, signal) =>
      await client.resume(attemptId, reason, undefined, signal),
    cancel: async (attemptId, reason, signal) =>
      await client.cancel(attemptId, reason, undefined, signal),
    reconcile: async (attemptId, signal) => await client.reconcile(attemptId, undefined, signal),
  };
}
