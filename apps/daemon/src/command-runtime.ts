import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  AttemptIdSchema,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  EventIdSchema,
  IsoInstantSchema,
  COMMAND_PROTOCOL_VERSION_V1,
  type AttemptId,
  type CommandId,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
} from "@app-factory/contracts";
import {
  canonicalJson,
  computeTaskSpecDigest,
  createFactoryRepositories,
  inspectFactoryDatabase,
  openMigratedFactoryDatabase,
  type FactoryRepositories,
} from "@app-factory/kernel";

import { CommandHandlerError, type CommandHandler } from "./unix-command-server.js";

const DATABASE_FILE_NAME = "control-plane.sqlite";
const COMMAND_RESULTS_DIRECTORY_NAME = "command-results";
const RESULT_LEDGER_VERSION = 1;
const MAX_LEDGER_ENTRY_BYTES = 8 * 1024 * 1024;

export type DaemonRuntimeIdPurpose = "attempt" | "attempt-created-event" | "desired-state-event";

export type DaemonRuntimeIdFactory = (
  purpose: DaemonRuntimeIdPurpose,
  commandId: CommandId,
) => string;

export type ReconcileRequest = Readonly<{
  commandId: CommandId;
  issuedAt: IsoInstant;
  attemptId: AttemptId | null;
}>;

/**
 * Reconciliation is an idempotent wake-up signal. Implementations must bind
 * any durable side effect to commandId because a process can stop after the
 * port succeeds but before the response journal is synced.
 */
export type ReconcilePort = (
  request: ReconcileRequest,
) => Promise<readonly AttemptId[]> | readonly AttemptId[];

export type OpenDaemonCommandRuntimeOptions = Readonly<{
  runtimeDirectory: string;
  daemonVersion: string;
  startedAt?: string;
  now?: () => string;
  idFactory?: DaemonRuntimeIdFactory;
  reconcile?: ReconcilePort;
}>;

export type DaemonRuntimePaths = Readonly<{
  root: string;
  database: string;
  commandResults: string;
}>;

export type DaemonCommandRuntime = Readonly<{
  paths: DaemonRuntimePaths;
  startedAt: IsoInstant;
  handler: CommandHandler;
  close: () => void;
}>;

type ResultLedgerEntry = Readonly<{
  ledgerVersion: 1;
  request: CommandRequestV1;
  result: CommandResultV1;
}>;

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function parseDaemonVersion(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > 100
  ) {
    throw new TypeError("daemonVersion must be 1-100 non-whitespace-padded characters");
  }
  return value;
}

export function resolveDaemonRuntimePaths(runtimeDirectory: string): DaemonRuntimePaths {
  if (!isAbsolute(runtimeDirectory) || resolve(runtimeDirectory) !== runtimeDirectory) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "The daemon runtime directory must be an absolute normalized path.",
      false,
    );
  }
  return {
    root: runtimeDirectory,
    database: join(runtimeDirectory, DATABASE_FILE_NAME),
    commandResults: join(runtimeDirectory, COMMAND_RESULTS_DIRECTORY_NAME),
  };
}

async function assertPrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  const uid = currentUserId();
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (uid !== undefined && stat.uid !== uid) ||
    (stat.mode & 0o077) !== 0
  ) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "Daemon runtime directories must not be symlinks and must be owned by the current user with mode 0700.",
      false,
    );
  }
}

async function assertPrivateRegularFile(path: string): Promise<void> {
  const stat = await lstat(path);
  const uid = currentUserId();
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (uid !== undefined && stat.uid !== uid) ||
    (stat.mode & 0o077) !== 0
  ) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "Daemon runtime files must be regular, owned by the current user, and mode 0600.",
      false,
    );
  }
}

async function prepareRuntimePaths(paths: DaemonRuntimePaths): Promise<void> {
  await assertPrivateDirectory(paths.root);
  await assertPrivateDirectory(paths.commandResults);
  try {
    await assertPrivateRegularFile(paths.database);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

function deterministicUuid(purpose: DaemonRuntimeIdPurpose, commandId: CommandId): string {
  const digest = createHash("sha256")
    .update(`app-factory.daemon.v1\0${purpose}\0${commandId}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function defaultIdFactory(purpose: DaemonRuntimeIdPurpose, commandId: CommandId): string {
  return deterministicUuid(purpose, commandId);
}

function parseGeneratedAttemptId(factory: DaemonRuntimeIdFactory, commandId: CommandId): AttemptId {
  return AttemptIdSchema.parse(factory("attempt", commandId));
}

function parseGeneratedEventId(
  factory: DaemonRuntimeIdFactory,
  purpose: Exclude<DaemonRuntimeIdPurpose, "attempt">,
  commandId: CommandId,
) {
  return EventIdSchema.parse(factory(purpose, commandId));
}

function laterInstant(...values: readonly string[]): IsoInstant {
  const milliseconds = Math.max(
    ...values.map((value) => Date.parse(IsoInstantSchema.parse(value))),
  );
  if (!Number.isFinite(milliseconds)) throw new TypeError("Could not compare ISO instants");
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function nextInstant(...values: readonly string[]): IsoInstant {
  const milliseconds = Date.parse(laterInstant(...values));
  if (milliseconds >= 8_640_000_000_000_000) {
    throw new RangeError("Cannot advance beyond the maximum supported instant");
  }
  return IsoInstantSchema.parse(new Date(milliseconds + 1).toISOString());
}

function parseLedgerEntry(value: unknown): ResultLedgerEntry {
  if (
    value === null ||
    typeof value !== "object" ||
    !("ledgerVersion" in value) ||
    value.ledgerVersion !== RESULT_LEDGER_VERSION ||
    !("request" in value) ||
    !("result" in value)
  ) {
    throw new Error("Command result journal entry has an unsupported shape");
  }
  return {
    ledgerVersion: RESULT_LEDGER_VERSION,
    request: CommandRequestV1Schema.parse(value.request),
    result: CommandResultV1Schema.parse(value.result),
  };
}

function resultPath(paths: DaemonRuntimePaths, commandId: CommandId): string {
  return join(paths.commandResults, `${commandId}.json`);
}

async function readLedgerEntry(
  paths: DaemonRuntimePaths,
  commandId: CommandId,
): Promise<ResultLedgerEntry | null> {
  const path = resultPath(paths, commandId);
  try {
    await assertPrivateRegularFile(path);
    const stat = await lstat(path);
    if (stat.size > MAX_LEDGER_ENTRY_BYTES) {
      throw new Error(
        `Command result journal entry exceeds ${String(MAX_LEDGER_ENTRY_BYTES)} bytes`,
      );
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return parseLedgerEntry(value);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function persistLedgerEntry(
  paths: DaemonRuntimePaths,
  entry: ResultLedgerEntry,
): Promise<ResultLedgerEntry> {
  const commandId = entry.request.commandId;
  const finalPath = resultPath(paths, commandId);
  const temporaryPath = join(
    paths.commandResults,
    `.${commandId}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  const encoded = Buffer.from(`${JSON.stringify(entry)}\n`, "utf8");
  if (encoded.byteLength > MAX_LEDGER_ENTRY_BYTES) {
    throw new Error(`Command result journal entry exceeds ${String(MAX_LEDGER_ENTRY_BYTES)} bytes`);
  }

  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(encoded);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporaryPath, finalPath);
      await syncDirectory(paths.commandResults);
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      const existing = await readLedgerEntry(paths, commandId);
      if (existing === null) throw error;
      return existing;
    }
    return entry;
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }
}

class SerialExecutor {
  #tail: Promise<void> = Promise.resolve();

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release: (() => void) | undefined;
    this.#tail = new Promise<void>((resolvePromise) => {
      release = resolvePromise;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

function assertMatchingRequest(original: CommandRequestV1, retry: CommandRequestV1): void {
  if (canonicalJson(original) !== canonicalJson(retry)) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a different command or issuedAt value.",
      false,
    );
  }
}

function expectedKernelCommand(request: CommandRequestV1): unknown | null {
  switch (request.operation) {
    case "task.submit":
    case "task.run":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "task.submit",
        initialDesiredState: request.operation === "task.submit" ? "paused" : "running",
        taskSpec: request.payload.taskSpec,
      };
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "attempt.set-desired-state",
        attemptId: request.payload.attemptId,
        desiredState:
          request.operation === "attempt.pause"
            ? "paused"
            : request.operation === "attempt.resume"
              ? "running"
              : "cancelled",
        reason: request.payload.reason,
      };
    case "doctor":
    case "attempt.status":
    case "attempt.events":
    case "daemon.reconcile":
      return null;
  }
}

function assertKernelCommandIdentity(
  repositories: FactoryRepositories,
  request: CommandRequestV1,
): void {
  const stored = repositories.commands.findById(request.commandId);
  if (stored === null) return;
  const expected = expectedKernelCommand(request);
  if (expected === null || canonicalJson(stored) !== canonicalJson(expected)) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a different durable kernel command.",
      false,
    );
  }
}

function requireAttempt(repositories: FactoryRepositories, attemptId: AttemptId) {
  const attempt = repositories.attempts.findById(attemptId);
  if (attempt === null) {
    throw new CommandHandlerError(
      "attempt.not-found",
      `No attempt exists for ID ${attemptId}.`,
      false,
    );
  }
  return attempt;
}

function nextEventContext(repositories: FactoryRepositories, attemptId: AttemptId) {
  const events = repositories.events.listByAttempt(attemptId);
  const last = events.at(-1);
  return {
    sequence: (last?.sequence ?? 0) + 1,
    causationEventId: last?.eventId ?? null,
  };
}

function intakeTask(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "task.submit" | "task.run" }>,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const taskSpecDigest = computeTaskSpecDigest(request.payload.taskSpec);
  const attemptId = parseGeneratedAttemptId(idFactory, request.commandId);
  const createdAt = laterInstant(request.issuedAt, request.payload.taskSpec.createdAt);
  const initialDesiredState = request.operation === "task.submit" ? "paused" : "running";
  const created = repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "task.submit",
      initialDesiredState,
      taskSpec: request.payload.taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId: request.payload.taskSpec.taskId,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState: initialDesiredState,
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt,
      updatedAt: createdAt,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: parseGeneratedEventId(idFactory, "attempt-created-event", request.commandId),
      attemptId,
      sequence: 1,
      occurredAt: createdAt,
      commandId: request.commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: request.payload.taskSpec.taskId, taskSpecDigest },
    },
  });
  const authoritative = requireAttempt(repositories, created.attempt.attemptId);
  return {
    operation: request.operation,
    taskId: authoritative.taskId,
    attemptId: authoritative.attemptId,
    state: authoritative.state,
  };
}

function setDesiredState(
  repositories: FactoryRepositories,
  request: Extract<
    CommandRequestV1,
    { operation: "attempt.pause" | "attempt.resume" | "attempt.cancel" }
  >,
  now: () => string,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const desiredState =
    request.operation === "attempt.pause"
      ? "paused"
      : request.operation === "attempt.resume"
        ? "running"
        : "cancelled";
  const attempt = requireAttempt(repositories, request.payload.attemptId);
  const context = nextEventContext(repositories, attempt.attemptId);
  const occurredAt = nextInstant(now(), request.issuedAt, attempt.updatedAt);
  repositories.desiredStates.apply({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "attempt.set-desired-state",
      attemptId: attempt.attemptId,
      desiredState,
      reason: request.payload.reason,
    },
    expectedRevision: attempt.revision,
    event: {
      schemaVersion: 1,
      eventId: parseGeneratedEventId(idFactory, "desired-state-event", request.commandId),
      attemptId: attempt.attemptId,
      sequence: context.sequence,
      occurredAt,
      commandId: request.commandId,
      causationEventId: context.causationEventId,
      fence: attempt.fence,
      type: "attempt.desired-state-changed",
      data: {
        from: attempt.desiredState,
        to: desiredState,
        reason: request.payload.reason,
      },
    },
  });
  return {
    operation: request.operation,
    attemptId: attempt.attemptId,
    desiredState,
    accepted: true,
  };
}

async function executeRequest(
  repositories: FactoryRepositories,
  database: ReturnType<typeof openMigratedFactoryDatabase>,
  request: CommandRequestV1,
  dependencies: Readonly<{
    daemonVersion: string;
    startedAt: IsoInstant;
    now: () => string;
    idFactory: DaemonRuntimeIdFactory;
    reconcile: ReconcilePort;
  }>,
): Promise<CommandResultV1> {
  switch (request.operation) {
    case "doctor": {
      const issues: string[] = [];
      try {
        inspectFactoryDatabase(database);
      } catch {
        issues.push("The control-plane database failed its health check.");
      }
      return {
        operation: "doctor",
        readiness: issues.length === 0 ? "ready" : "degraded",
        daemonVersion: dependencies.daemonVersion,
        protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
        startedAt: dependencies.startedAt,
        issues,
      };
    }
    case "task.submit":
    case "task.run":
      return intakeTask(repositories, request, dependencies.idFactory);
    case "attempt.status":
      return {
        operation: "attempt.status",
        attempt: requireAttempt(repositories, request.payload.attemptId),
      };
    case "attempt.events": {
      requireAttempt(repositories, request.payload.attemptId);
      const events = repositories.events
        .listByAttempt(request.payload.attemptId)
        .filter((event) => event.sequence > request.payload.afterSequence)
        .slice(0, request.payload.limit);
      return {
        operation: "attempt.events",
        events,
        nextAfterSequence: events.at(-1)?.sequence ?? request.payload.afterSequence,
      };
    }
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return setDesiredState(repositories, request, dependencies.now, dependencies.idFactory);
    case "daemon.reconcile": {
      if (request.payload.attemptId !== null) {
        requireAttempt(repositories, request.payload.attemptId);
      }
      const reconciled = await dependencies.reconcile({
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        attemptId: request.payload.attemptId,
      });
      const unique = [...new Set(reconciled.map((attemptId) => AttemptIdSchema.parse(attemptId)))];
      if (unique.length > 10_000) {
        throw new CommandHandlerError(
          "daemon.reconcile-result-too-large",
          "The reconcile port returned more than 10000 attempt IDs.",
          false,
        );
      }
      for (const attemptId of unique) requireAttempt(repositories, attemptId);
      return {
        operation: "daemon.reconcile",
        accepted: true,
        reconciledAttemptIds: unique,
      };
    }
  }
}

function closedError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.runtime-closed",
    "The daemon command runtime is closed.",
    false,
  );
}

export async function openDaemonCommandRuntime(
  options: OpenDaemonCommandRuntimeOptions,
): Promise<DaemonCommandRuntime> {
  const paths = resolveDaemonRuntimePaths(options.runtimeDirectory);
  const daemonVersion = parseDaemonVersion(options.daemonVersion);
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = IsoInstantSchema.parse(options.startedAt ?? now());
  const idFactory = options.idFactory ?? defaultIdFactory;
  await prepareRuntimePaths(paths);

  const database = openMigratedFactoryDatabase(paths.database);
  try {
    await chmod(paths.database, 0o600);
    await assertPrivateRegularFile(paths.database);
  } catch (error) {
    database.close();
    throw error;
  }
  const repositories = createFactoryRepositories(database);
  const reconcile: ReconcilePort =
    options.reconcile ?? ((request) => (request.attemptId === null ? [] : [request.attemptId]));
  const serial = new SerialExecutor();
  let closed = false;

  const handler: CommandHandler = async (requestInput: CommandRequestV1) => {
    if (closed) throw closedError();
    const request = CommandRequestV1Schema.parse(requestInput);
    return await serial.run(async () => {
      if (closed) throw closedError();
      const original = await readLedgerEntry(paths, request.commandId);
      if (original !== null) {
        assertMatchingRequest(original.request, request);
        return original.result;
      }

      assertKernelCommandIdentity(repositories, request);

      const result = CommandResultV1Schema.parse(
        await executeRequest(repositories, database, request, {
          daemonVersion,
          startedAt,
          now,
          idFactory,
          reconcile,
        }),
      );
      const persisted = await persistLedgerEntry(paths, {
        ledgerVersion: RESULT_LEDGER_VERSION,
        request,
        result,
      });
      assertMatchingRequest(persisted.request, request);
      return persisted.result;
    });
  };

  return {
    paths,
    startedAt,
    handler,
    close: () => {
      if (closed) return;
      closed = true;
      database.close();
    },
  };
}
