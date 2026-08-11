import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { dirname, isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

import {
  COMMAND_PROTOCOL_VERSION_V1,
  CommandAuthorizationV1Schema,
  CommandRequestFrameV1Schema,
  CommandResultV1Schema,
  CommandResponseV1Schema,
  RequestIdSchema,
  type CommandFailureResponseV1,
  type CommandRequestV1,
  type CommandResultV1,
  type RequestId,
} from "@app-factory/contracts";

export const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;
export const DEFAULT_REQUEST_ID_CAPACITY = 10_000;
const MAX_UNIX_SOCKET_PATH_BYTES = 100;

type LockMetadata = Readonly<{
  instanceId: string;
  pid: number;
}>;

export type CommandHandlerContext = Readonly<{
  requestId: RequestId;
}>;

export type CommandHandler = (
  request: CommandRequestV1,
  context: CommandHandlerContext,
) => Promise<CommandResultV1> | CommandResultV1;

export type UnixCommandServerOptions = Readonly<{
  socketPath: string;
  authorization: string;
  handler: CommandHandler;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  handlerTimeoutMs?: number;
  requestIdCapacity?: number;
}>;

export type UnixCommandServer = Readonly<{
  socketPath: string;
  close: () => Promise<void>;
}>;

export class CommandServerStartError extends Error {
  public constructor(
    public readonly code: "daemon.already-running" | "daemon.unsafe-runtime-path",
    message: string,
  ) {
    super(message);
    this.name = "CommandServerStartError";
  }
}

export class CommandHandlerError extends Error {
  public readonly code: string;

  public constructor(
    code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CommandHandlerError";
    this.code = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/.test(code)
      ? code
      : "daemon.invalid-error-code";
  }
}

function validatePositiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateSocketPath(socketPath: string): void {
  if (!isAbsolute(socketPath) || Buffer.byteLength(socketPath) > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new CommandServerStartError(
      "daemon.unsafe-runtime-path",
      "The command socket path must be absolute and at most 100 UTF-8 bytes.",
    );
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

async function assertPrivateRuntimeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  const uid = currentUserId();
  if (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid) || (stat.mode & 0o077) !== 0) {
    throw new CommandServerStartError(
      "daemon.unsafe-runtime-path",
      "The command socket directory must be owned by the current user with mode 0700.",
    );
  }
}

async function readLockMetadata(lockPath: string): Promise<LockMetadata | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(lockPath, "utf8"));
    if (
      value !== null &&
      typeof value === "object" &&
      "instanceId" in value &&
      "pid" in value &&
      typeof value.instanceId === "string" &&
      typeof value.pid === "number" &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 0
    ) {
      return { instanceId: value.instanceId, pid: value.pid };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, "EPERM");
  }
}

async function assertOwnedPrivateFile(path: string): Promise<void> {
  const stat = await lstat(path);
  const uid = currentUserId();
  if ((uid !== undefined && stat.uid !== uid) || (stat.mode & 0o077) !== 0) {
    throw new CommandServerStartError(
      "daemon.unsafe-runtime-path",
      "An existing daemon ownership file is not private to the current user.",
    );
  }
}

async function isSocketAcceptingConnections(socketPath: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ path: socketPath });
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

async function removeStaleSocket(socketPath: string): Promise<void> {
  try {
    const stat = await lstat(socketPath);
    const uid = currentUserId();
    if (!stat.isSocket() || (uid !== undefined && stat.uid !== uid)) {
      throw new CommandServerStartError(
        "daemon.unsafe-runtime-path",
        "Refusing to remove a command socket path that is not an owned Unix socket.",
      );
    }
    if (await isSocketAcceptingConnections(socketPath)) {
      throw new CommandServerStartError(
        "daemon.already-running",
        "A command server is already listening on the configured socket.",
      );
    }
    await unlink(socketPath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }
}

async function acquireOwnership(lockPath: string, socketPath: string): Promise<LockMetadata> {
  const metadata: LockMetadata = { instanceId: randomUUID(), pid: process.pid };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle: FileHandle | undefined;
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      return metadata;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (!isNodeError(error, "EEXIST")) throw error;

      await assertOwnedPrivateFile(lockPath);
      const existing = await readLockMetadata(lockPath);
      if (existing === undefined || isProcessAlive(existing.pid)) {
        throw new CommandServerStartError(
          "daemon.already-running",
          "Another command server owns the configured socket.",
        );
      }

      await removeStaleSocket(socketPath);
      const current = await readLockMetadata(lockPath);
      if (current?.instanceId !== existing.instanceId) {
        throw new CommandServerStartError(
          "daemon.already-running",
          "Command server ownership changed while stale state was inspected.",
        );
      }
      await unlink(lockPath);
    }
  }

  throw new CommandServerStartError(
    "daemon.already-running",
    "Unable to acquire command server ownership.",
  );
}

function authenticate(received: string, expected: string): boolean {
  const receivedDigest = createHash("sha256").update(received).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function failure(
  requestId: RequestId | null,
  code: string,
  message: string,
  retryable = false,
): CommandFailureResponseV1 {
  return CommandResponseV1Schema.parse({
    protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
    requestId,
    ok: false,
    error: { code, message, retryable },
  }) as CommandFailureResponseV1;
}

function extractRequestId(value: unknown): RequestId | null {
  if (value === null || typeof value !== "object" || !("requestId" in value)) return null;
  const result = RequestIdSchema.safeParse(value.requestId);
  return result.success ? result.data : null;
}

type ReplayEntry = {
  readonly fingerprint: string;
  readonly response: Promise<Buffer | undefined>;
  readonly resolve: (response: Buffer | undefined) => void;
  completed: boolean;
};

type ReplayReservation =
  | Readonly<{ kind: "new"; entry: ReplayEntry }>
  | Readonly<{ kind: "existing"; entry: ReplayEntry }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "capacity-exhausted" }>;

class RequestReplayLedger {
  readonly #entries = new Map<RequestId, ReplayEntry>();

  public constructor(private readonly capacity: number) {}

  public reserve(requestId: RequestId, fingerprint: string): ReplayReservation {
    const existing = this.#entries.get(requestId);
    if (existing !== undefined) {
      return existing.fingerprint === fingerprint
        ? { kind: "existing", entry: existing }
        : { kind: "conflict" };
    }

    if (this.#entries.size >= this.capacity) {
      const completed = [...this.#entries].find(([, entry]) => entry.completed);
      if (completed === undefined) return { kind: "capacity-exhausted" };
      this.#entries.delete(completed[0]);
    }

    let resolveResponse: ((response: Buffer | undefined) => void) | undefined;
    const response = new Promise<Buffer | undefined>((resolve) => {
      resolveResponse = resolve;
    });
    if (resolveResponse === undefined) throw new Error("Unable to create replay reservation.");
    const entry: ReplayEntry = {
      fingerprint,
      response,
      resolve: resolveResponse,
      completed: false,
    };
    this.#entries.set(requestId, entry);
    return { kind: "new", entry };
  }

  public complete(entry: ReplayEntry, response: Buffer | undefined): void {
    if (entry.completed) return;
    entry.completed = true;
    entry.resolve(response);
  }
}

function logicalRequestFingerprint(request: CommandRequestV1): string {
  // A requestId is an exact delivery identity. Durable retries use a new
  // requestId while preserving commandId and the original issuedAt.
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: request.schemaVersion,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        operation: request.operation,
        payload: request.payload,
      }),
    )
    .digest("hex");
}

function serializeBoundedResponse(
  response: unknown,
  requestId: RequestId | null,
  maxResponseBytes: number,
): Buffer | undefined {
  let validated = CommandResponseV1Schema.safeParse(response);
  if (!validated.success) {
    validated = CommandResponseV1Schema.safeParse(
      failure(
        requestId,
        "daemon.invalid-handler-result",
        "The command handler returned an invalid protocol result.",
      ),
    );
  }
  if (!validated.success) return undefined;

  let encoded = Buffer.from(`${JSON.stringify(validated.data)}\n`, "utf8");
  if (encoded.byteLength <= maxResponseBytes) return encoded;

  encoded = Buffer.from(
    `${JSON.stringify(
      failure(
        requestId,
        "protocol.response-too-large",
        "The command response exceeded the configured byte limit.",
      ),
    )}\n`,
    "utf8",
  );
  return encoded.byteLength <= maxResponseBytes ? encoded : undefined;
}

function writeResponse(
  socket: Socket,
  response: unknown,
  requestId: RequestId | null,
  maxResponseBytes: number,
): void {
  const encoded = serializeBoundedResponse(response, requestId, maxResponseBytes);
  if (encoded === undefined) {
    socket.destroy();
    return;
  }
  socket.end(encoded);
}

function writeEncodedResponse(socket: Socket, encoded: Buffer | undefined): void {
  if (encoded === undefined) socket.destroy();
  else socket.end(encoded);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new CommandHandlerError(
                "daemon.handler-timeout-ambiguous",
                "Command completion is unknown after timeout; retry with the same command ID.",
                true,
              ),
            ),
          timeoutMs,
        );
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function handleConnection(
  socket: Socket,
  options: Readonly<{
    authorization: string;
    handler: CommandHandler;
    handlerTimeoutMs: number;
    maxRequestBytes: number;
    maxResponseBytes: number;
    replay: RequestReplayLedger;
  }>,
): void {
  let buffer = Buffer.alloc(0);
  let completed = false;

  socket.on("error", () => undefined);

  const reject = (response: CommandFailureResponseV1) => {
    if (completed) return;
    completed = true;
    writeResponse(socket, response, response.requestId, options.maxResponseBytes);
  };

  socket.on("data", (chunk: Buffer) => {
    if (completed) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.byteLength > options.maxRequestBytes) {
      reject(
        failure(
          null,
          "protocol.request-too-large",
          "The command request exceeded the configured byte limit.",
        ),
      );
      return;
    }

    const newline = buffer.indexOf(0x0a);
    if (newline < 0) return;
    completed = true;

    const frameBytes = buffer.subarray(0, newline);
    const trailing = buffer.subarray(newline + 1);
    if (trailing.some((byte) => byte !== 0x0d && byte !== 0x0a && byte !== 0x20 && byte !== 0x09)) {
      writeResponse(
        socket,
        failure(
          null,
          "protocol.multiple-frames",
          "Only one request frame is allowed per connection.",
        ),
        null,
        options.maxResponseBytes,
      );
      return;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frameBytes));
    } catch {
      writeResponse(
        socket,
        failure(null, "protocol.malformed-request", "The command request is not valid JSON."),
        null,
        options.maxResponseBytes,
      );
      return;
    }

    const requestId = extractRequestId(decoded);
    const parsed = CommandRequestFrameV1Schema.safeParse(decoded);
    if (!parsed.success) {
      writeResponse(
        socket,
        failure(
          requestId,
          "protocol.invalid-request",
          "The command request does not match protocol version 1.",
        ),
        requestId,
        options.maxResponseBytes,
      );
      return;
    }

    if (!authenticate(parsed.data.authorization, options.authorization)) {
      writeResponse(
        socket,
        failure(parsed.data.requestId, "protocol.unauthorized", "Authorization failed."),
        parsed.data.requestId,
        options.maxResponseBytes,
      );
      return;
    }

    const reservation = options.replay.reserve(
      parsed.data.requestId,
      logicalRequestFingerprint(parsed.data.request),
    );
    if (reservation.kind === "conflict") {
      writeResponse(
        socket,
        failure(
          parsed.data.requestId,
          "protocol.request-id-conflict",
          "The request ID is already bound to different command content.",
        ),
        parsed.data.requestId,
        options.maxResponseBytes,
      );
      return;
    }
    if (reservation.kind === "capacity-exhausted") {
      writeResponse(
        socket,
        failure(
          parsed.data.requestId,
          "protocol.replay-capacity-exhausted",
          "All request replay slots are currently in flight.",
          true,
        ),
        parsed.data.requestId,
        options.maxResponseBytes,
      );
      return;
    }
    if (reservation.kind === "existing") {
      void reservation.entry.response.then((response) => writeEncodedResponse(socket, response));
      return;
    }

    void withTimeout(
      Promise.resolve()
        .then(() => options.handler(parsed.data.request, { requestId: parsed.data.requestId }))
        .then((result) => CommandResultV1Schema.parse(result)),
      options.handlerTimeoutMs,
    )
      .then((result) => {
        if (result.operation !== parsed.data.request.operation) {
          throw new CommandHandlerError(
            "daemon.operation-mismatch",
            "The handler returned a result for a different operation.",
            false,
          );
        }
        return {
          protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
          requestId: parsed.data.requestId,
          ok: true,
          result,
        } as const;
      })
      .catch((error: unknown) => {
        const handlerError =
          error instanceof CommandHandlerError
            ? error
            : new CommandHandlerError(
                "daemon.handler-failed",
                "The command handler failed.",
                false,
              );
        return failure(
          parsed.data.requestId,
          handlerError.code,
          handlerError.message,
          handlerError.retryable,
        );
      })
      .then((response) => {
        const encoded = serializeBoundedResponse(
          response,
          parsed.data.requestId,
          options.maxResponseBytes,
        );
        options.replay.complete(reservation.entry, encoded);
        writeEncodedResponse(socket, encoded);
      });
  });
}

async function listen(server: Server, socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function releaseOwnership(lockPath: string, metadata: LockMetadata): Promise<void> {
  const current = await readLockMetadata(lockPath);
  if (current?.instanceId === metadata.instanceId) {
    await unlink(lockPath).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }
}

export async function startUnixCommandServer(
  supplied: UnixCommandServerOptions,
): Promise<UnixCommandServer> {
  validateSocketPath(supplied.socketPath);
  const authorization = CommandAuthorizationV1Schema.parse(supplied.authorization);
  const maxRequestBytes = validatePositiveInteger(
    "maxRequestBytes",
    supplied.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
  );
  const maxResponseBytes = validatePositiveInteger(
    "maxResponseBytes",
    supplied.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
  );
  const handlerTimeoutMs = validatePositiveInteger(
    "handlerTimeoutMs",
    supplied.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
  );
  const requestIdCapacity = validatePositiveInteger(
    "requestIdCapacity",
    supplied.requestIdCapacity ?? DEFAULT_REQUEST_ID_CAPACITY,
  );

  await assertPrivateRuntimeDirectory(dirname(supplied.socketPath));
  await removeStaleSocket(supplied.socketPath);
  const lockPath = `${supplied.socketPath}.lock`;
  const ownership = await acquireOwnership(lockPath, supplied.socketPath);
  const replay = new RequestReplayLedger(requestIdCapacity);
  const server = createServer((socket) =>
    handleConnection(socket, {
      authorization,
      handler: supplied.handler,
      handlerTimeoutMs,
      maxRequestBytes,
      maxResponseBytes,
      replay,
    }),
  );

  try {
    await listen(server, supplied.socketPath);
    await chmod(supplied.socketPath, 0o600);
    const socketStat = await lstat(supplied.socketPath);
    const uid = currentUserId();
    if (
      !socketStat.isSocket() ||
      (uid !== undefined && socketStat.uid !== uid) ||
      (socketStat.mode & 0o777) !== 0o600
    ) {
      throw new CommandServerStartError(
        "daemon.unsafe-runtime-path",
        "The command socket is not an owned mode-0600 Unix socket.",
      );
    }
  } catch (error) {
    await closeServer(server).catch(() => undefined);
    await releaseOwnership(lockPath, ownership).catch(() => undefined);
    throw error;
  }

  let closed = false;
  return {
    socketPath: supplied.socketPath,
    close: async () => {
      if (closed) return;
      closed = true;
      await closeServer(server);
      await releaseOwnership(lockPath, ownership);
    },
  };
}
