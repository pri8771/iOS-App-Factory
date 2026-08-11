import {
  CommandClientError,
  type CommandClient,
  type CommandIdentity,
  type RetryableCommandIdentity,
} from "@app-factory/command-client";
import {
  AttemptIdSchema,
  AttemptListCursorV1Schema,
  AttemptListScopeV1Schema,
  CommandIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type AttemptListQueryV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

export type McpCommandPort = Readonly<{
  doctor(signal?: AbortSignal): Promise<unknown>;
  submit(
    taskSpec: TaskSpecV1,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  run(
    taskSpec: TaskSpecV1,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  status(attemptId: AttemptId, signal?: AbortSignal): Promise<unknown>;
  events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence: number; limit: number }>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listAttempts(options: AttemptListQueryV1, signal?: AbortSignal): Promise<unknown>;
  pause(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  resume(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  cancel(
    attemptId: AttemptId,
    reason: string | null,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  reconcile(
    attemptId: AttemptId | null,
    retryIdentity: RetryableCommandIdentity | null,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listEvidence(
    options: Readonly<{ afterAttemptId: AttemptId | null; limit: number }>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  inspectEvidence(attemptId: AttemptId, signal?: AbortSignal): Promise<unknown>;
  verifyEvidence(attemptId: AttemptId, signal?: AbortSignal): Promise<unknown>;
  portfolioSnapshot(signal?: AbortSignal): Promise<unknown>;
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
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.retryable && error.retryIdentity !== null
            ? { retryIdentity: error.retryIdentity }
            : {}),
        }
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

const RETRY_IDENTITY_SHAPE = {
  commandId: CommandIdSchema.optional(),
  issuedAt: IsoInstantSchema.optional(),
} as const;

function requireCompleteRetryIdentity(value: {
  commandId: string | undefined;
  issuedAt: string | undefined;
}): RetryableCommandIdentity | null {
  if ((value.commandId === undefined) !== (value.issuedAt === undefined)) {
    throw new CommandClientError(
      "mcp.incomplete-retry-identity",
      "commandId and issuedAt must be provided together.",
      false,
    );
  }
  return value.commandId === undefined || value.issuedAt === undefined
    ? null
    : {
        commandId: CommandIdSchema.parse(value.commandId),
        issuedAt: IsoInstantSchema.parse(value.issuedAt),
      };
}

function deliveryIdentity(
  client: CommandClient,
  retryIdentity: RetryableCommandIdentity | null,
): CommandIdentity {
  return retryIdentity === null
    ? client.createIdentity()
    : client.createRetryIdentity(retryIdentity);
}

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
      inputSchema: z.strictObject({ taskSpec: TaskSpecV1Schema, ...RETRY_IDENTITY_SHAPE }),
      annotations: { ...CONTROL, idempotentHint: false },
    },
    async ({ taskSpec, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.submit(
            taskSpec,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
  );

  server.registerTool(
    "factory_task_run",
    {
      title: "Start Factory task",
      description:
        "Persist and start a validated TaskSpec. This does not bypass policy, approval, or verification gates.",
      inputSchema: z.strictObject({ taskSpec: TaskSpecV1Schema, ...RETRY_IDENTITY_SHAPE }),
      annotations: { ...CONTROL, idempotentHint: false },
    },
    async ({ taskSpec, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.run(
            taskSpec,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
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

  server.registerTool(
    "factory_attempt_list",
    {
      title: "List Factory attempts",
      description:
        "Read a bounded, newest-first work queue. Each row is for navigation; re-read one attempt before acting on it.",
      inputSchema: z.strictObject({
        scope: AttemptListScopeV1Schema.default("active"),
        projectId: ProjectIdSchema.nullable().default(null),
        after: AttemptListCursorV1Schema.nullable().default(null),
        limit: z.number().int().positive().max(100).default(50),
      }),
      annotations: READ_ONLY,
    },
    async (options, context) =>
      await invoke(async () => await port.listAttempts(options, context.mcpReq.signal)),
  );

  const reasonSchema = z.string().min(1).max(1_000).nullable().default(null);
  server.registerTool(
    "factory_attempt_pause",
    {
      title: "Pause Factory attempt",
      description: "Persist a paused desired state. Running work stops at its fenced boundary.",
      inputSchema: z.strictObject({
        attemptId: AttemptIdSchema,
        reason: reasonSchema,
        ...RETRY_IDENTITY_SHAPE,
      }),
      annotations: CONTROL,
    },
    async ({ attemptId, reason, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.pause(
            attemptId,
            reason,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
  );

  server.registerTool(
    "factory_attempt_resume",
    {
      title: "Resume Factory attempt",
      description:
        "Persist a running desired state and let the daemon reconcile from durable evidence.",
      inputSchema: z.strictObject({
        attemptId: AttemptIdSchema,
        reason: reasonSchema,
        ...RETRY_IDENTITY_SHAPE,
      }),
      annotations: CONTROL,
    },
    async ({ attemptId, reason, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.resume(
            attemptId,
            reason,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
  );

  server.registerTool(
    "factory_attempt_cancel",
    {
      title: "Cancel Factory attempt",
      description:
        "Persist cancellation for one attempt. Completed external effects are not undone.",
      inputSchema: z.strictObject({
        attemptId: AttemptIdSchema,
        reason: reasonSchema,
        ...RETRY_IDENTITY_SHAPE,
      }),
      annotations: { ...CONTROL, destructiveHint: true },
    },
    async ({ attemptId, reason, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.cancel(
            attemptId,
            reason,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
  );

  server.registerTool(
    "factory_reconcile",
    {
      title: "Reconcile App Factory",
      description:
        "Durably request a background-scheduler wake for one existing attempt or the daemon queue. Observe later progress through status and events.",
      inputSchema: z.strictObject({
        attemptId: AttemptIdSchema.nullable().default(null),
        ...RETRY_IDENTITY_SHAPE,
      }),
      annotations: CONTROL,
    },
    async ({ attemptId, commandId, issuedAt }, context) =>
      await invoke(
        async () =>
          await port.reconcile(
            attemptId,
            requireCompleteRetryIdentity({ commandId, issuedAt }),
            context.mcpReq.signal,
          ),
      ),
  );

  server.registerTool(
    "factory_evidence_list",
    {
      title: "List Factory evidence",
      description: "List a bounded page of immutable attempt evidence manifests.",
      inputSchema: z.strictObject({
        afterAttemptId: AttemptIdSchema.nullable().default(null),
        limit: z.number().int().positive().max(100).default(50),
      }),
      annotations: READ_ONLY,
    },
    async ({ afterAttemptId, limit }, context) =>
      await invoke(
        async () => await port.listEvidence({ afterAttemptId, limit }, context.mcpReq.signal),
      ),
  );

  server.registerTool(
    "factory_evidence_inspect",
    {
      title: "Inspect Factory evidence",
      description: "Read one immutable evidence manifest and its content digest.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema }),
      annotations: READ_ONLY,
    },
    async ({ attemptId }, context) =>
      await invoke(async () => await port.inspectEvidence(attemptId, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_evidence_verify",
    {
      title: "Verify Factory evidence",
      description:
        "Recompute one attempt's manifest, evidence, and artifact digests inside the daemon boundary. This verifies storage integrity, not execution semantics.",
      inputSchema: z.strictObject({ attemptId: AttemptIdSchema }),
      annotations: READ_ONLY,
    },
    async ({ attemptId }, context) =>
      await invoke(async () => await port.verifyEvidence(attemptId, context.mcpReq.signal)),
  );

  server.registerTool(
    "factory_portfolio_snapshot",
    {
      title: "Read Factory portfolio",
      description:
        "Read the bounded authoritative multi-project snapshot. Unavailable provider values remain null.",
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
    },
    async (_input, context) =>
      await invoke(async () => await port.portfolioSnapshot(context.mcpReq.signal)),
  );

  return server;
}

export function commandClientMcpPort(client: CommandClient): McpCommandPort {
  return {
    doctor: async (signal) => await client.doctor(undefined, signal),
    submit: async (taskSpec, retryIdentity, signal) =>
      await client.submit(taskSpec, deliveryIdentity(client, retryIdentity), signal),
    run: async (taskSpec, retryIdentity, signal) =>
      await client.run(taskSpec, deliveryIdentity(client, retryIdentity), signal),
    status: async (attemptId, signal) => await client.status(attemptId, undefined, signal),
    events: async (attemptId, options, signal) =>
      await client.events(attemptId, options, undefined, signal),
    listAttempts: async (options, signal) => await client.listAttempts(options, undefined, signal),
    pause: async (attemptId, reason, retryIdentity, signal) =>
      await client.pause(attemptId, reason, deliveryIdentity(client, retryIdentity), signal),
    resume: async (attemptId, reason, retryIdentity, signal) =>
      await client.resume(attemptId, reason, deliveryIdentity(client, retryIdentity), signal),
    cancel: async (attemptId, reason, retryIdentity, signal) =>
      await client.cancel(attemptId, reason, deliveryIdentity(client, retryIdentity), signal),
    reconcile: async (attemptId, retryIdentity, signal) =>
      await client.reconcile(attemptId, deliveryIdentity(client, retryIdentity), signal),
    listEvidence: async (options, signal) => await client.listEvidence(options, undefined, signal),
    inspectEvidence: async (attemptId, signal) =>
      await client.inspectEvidence(attemptId, undefined, signal),
    verifyEvidence: async (attemptId, signal) =>
      await client.verifyEvidence(attemptId, undefined, signal),
    portfolioSnapshot: async (signal) => await client.portfolioSnapshot(undefined, signal),
  };
}
