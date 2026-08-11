import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

import {
  COMMAND_PROTOCOL_VERSION_V1,
  AttemptIdSchema,
  CommandIdSchema,
  CommandAuthorizationV1Schema,
  CommandRequestFrameV1Schema,
  CommandResponseV1Schema,
  IsoInstantSchema,
  RequestIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type CommandOperationV1,
  type CommandOriginV1,
  type CommandRequestForOperationV1,
  type CommandResponseV1,
  type CommandResultForOperationV1,
  type CommandId,
  type IsoInstant,
  type RequestId,
  type TaskSpecV1,
} from "@app-factory/contracts";

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_CLIENT_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_CLIENT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_UNIX_SOCKET_PATH_BYTES = 100;

export type CommandClientOptions = Readonly<{
  socketPath: string;
  authorization: string;
  origin: CommandOriginV1;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  createRequestId?: () => string;
  createCommandId?: () => string;
  now?: () => Date;
}>;

export type CommandIdentity = Readonly<{
  requestId: RequestId;
  commandId: CommandId;
  issuedAt: IsoInstant;
}>;

export class CommandClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CommandClientError";
  }
}

export class CommandRemoteError extends CommandClientError {
  public constructor(
    code: string,
    message: string,
    retryable: boolean,
    public readonly requestId: RequestId | null,
  ) {
    super(code, message, retryable);
    this.name = "CommandRemoteError";
  }
}

function validatePositiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateSocketPath(socketPath: string): string {
  if (!isAbsolute(socketPath) || Buffer.byteLength(socketPath) > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new CommandClientError(
      "client.invalid-socket-path",
      "The command socket path must be absolute and at most 100 UTF-8 bytes.",
      false,
    );
  }
  return socketPath;
}

export class CommandClient {
  readonly #socketPath: string;
  readonly #authorization: string;
  readonly #origin: CommandOriginV1;
  readonly #timeoutMs: number;
  readonly #maxRequestBytes: number;
  readonly #maxResponseBytes: number;
  readonly #createRequestId: () => string;
  readonly #createCommandId: () => string;
  readonly #now: () => Date;
  readonly #sockets = new Set<Socket>();
  #closed = false;

  public constructor(options: CommandClientOptions) {
    this.#socketPath = validateSocketPath(options.socketPath);
    this.#authorization = CommandAuthorizationV1Schema.parse(options.authorization);
    this.#origin = options.origin;
    this.#timeoutMs = validatePositiveInteger(
      "timeoutMs",
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    );
    this.#maxRequestBytes = validatePositiveInteger(
      "maxRequestBytes",
      options.maxRequestBytes ?? DEFAULT_CLIENT_MAX_REQUEST_BYTES,
    );
    this.#maxResponseBytes = validatePositiveInteger(
      "maxResponseBytes",
      options.maxResponseBytes ?? DEFAULT_CLIENT_MAX_RESPONSE_BYTES,
    );
    this.#createRequestId = options.createRequestId ?? randomUUID;
    this.#createCommandId = options.createCommandId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
  }

  public createIdentity(): CommandIdentity {
    return {
      requestId: RequestIdSchema.parse(this.#createRequestId()),
      commandId: CommandIdSchema.parse(this.#createCommandId()),
      issuedAt: IsoInstantSchema.parse(this.#now().toISOString()),
    };
  }

  public createRetryIdentity(
    original: Pick<CommandIdentity, "commandId" | "issuedAt">,
  ): CommandIdentity {
    return {
      requestId: RequestIdSchema.parse(this.#createRequestId()),
      commandId: CommandIdSchema.parse(original.commandId),
      issuedAt: IsoInstantSchema.parse(original.issuedAt),
    };
  }

  public async doctor(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"doctor">> {
    return await this.#request("doctor", {}, identity, signal);
  }

  public async submit(
    taskSpec: TaskSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"task.submit">> {
    return await this.#request(
      "task.submit",
      { taskSpec: TaskSpecV1Schema.parse(taskSpec) },
      identity,
      signal,
    );
  }

  public async run(
    taskSpec: TaskSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"task.run">> {
    return await this.#request(
      "task.run",
      { taskSpec: TaskSpecV1Schema.parse(taskSpec) },
      identity,
      signal,
    );
  }

  public async status(
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.status">> {
    return await this.#request(
      "attempt.status",
      { attemptId: AttemptIdSchema.parse(attemptId) },
      identity,
      signal,
    );
  }

  public async events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence?: number; limit?: number }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.events">> {
    return await this.#request(
      "attempt.events",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        afterSequence: options.afterSequence ?? 0,
        limit: options.limit ?? 100,
      },
      identity,
      signal,
    );
  }

  public async pause(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.pause">> {
    return await this.#request(
      "attempt.pause",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  public async resume(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.resume">> {
    return await this.#request(
      "attempt.resume",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  public async cancel(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.cancel">> {
    return await this.#request(
      "attempt.cancel",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  public async reconcile(
    attemptId: AttemptId | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"daemon.reconcile">> {
    return await this.#request(
      "daemon.reconcile",
      {
        attemptId: attemptId === null ? null : AttemptIdSchema.parse(attemptId),
      },
      identity,
      signal,
    );
  }

  async #request<Operation extends CommandOperationV1>(
    operation: Operation,
    payload: CommandRequestForOperationV1<Operation>["payload"],
    suppliedIdentity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<Operation>> {
    if (this.#closed) {
      throw new CommandClientError("client.closed", "The command client is closed.", false);
    }
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      throw new TypeError("signal must be an AbortSignal");
    }
    if (signal?.aborted === true) {
      throw new CommandClientError("client.cancelled", "The command request was cancelled.", false);
    }

    const identity = suppliedIdentity ?? this.createIdentity();
    const requestId = RequestIdSchema.parse(identity.requestId);
    const commandId = CommandIdSchema.parse(identity.commandId);
    const issuedAt = IsoInstantSchema.parse(identity.issuedAt);
    const request = {
      schemaVersion: 1,
      commandId,
      issuedAt,
      origin: this.#origin,
      operation,
      payload,
    } as CommandRequestForOperationV1<Operation>;
    const frame = CommandRequestFrameV1Schema.parse({
      protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
      requestId,
      authorization: this.#authorization,
      request,
    });
    const encoded = Buffer.from(`${JSON.stringify(frame)}\n`, "utf8");
    if (encoded.byteLength > this.#maxRequestBytes) {
      throw new CommandClientError(
        "client.request-too-large",
        "The command request exceeds the configured byte limit.",
        false,
      );
    }

    const response = await this.#exchange(encoded, requestId, signal);
    if (!response.ok) {
      throw new CommandRemoteError(
        response.error.code,
        response.error.message,
        response.error.retryable,
        response.requestId,
      );
    }
    if (response.requestId !== requestId) {
      throw new CommandClientError(
        "protocol.response-id-mismatch",
        "The command response ID does not match the request.",
        false,
      );
    }
    if (response.result.operation !== operation) {
      throw new CommandClientError(
        "protocol.response-operation-mismatch",
        "The command response operation does not match the request.",
        false,
      );
    }
    return response.result as CommandResultForOperationV1<Operation>;
  }

  async #exchange(
    encoded: Buffer,
    requestId: RequestId,
    signal?: AbortSignal,
  ): Promise<CommandResponseV1> {
    return await new Promise<CommandResponseV1>((resolve, reject) => {
      const socket = createConnection({ path: this.#socketPath });
      this.#sockets.add(socket);
      let buffer = Buffer.alloc(0);
      let settled = false;
      const timer = setTimeout(() => {
        finish(new CommandClientError("transport.timeout", "The command request timed out.", true));
      }, this.#timeoutMs);
      timer.unref();

      const finish = (error?: CommandClientError, response?: CommandResponseV1) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.#sockets.delete(socket);
        socket.destroy();
        if (error !== undefined) reject(error);
        else if (response !== undefined) resolve(response);
      };

      const onAbort = (): void => {
        finish(
          new CommandClientError("client.cancelled", "The command request was cancelled.", false),
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      socket.once("connect", () => socket.write(encoded));
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.byteLength > this.#maxResponseBytes) {
          finish(
            new CommandClientError(
              "protocol.response-too-large",
              "The command response exceeded the configured byte limit.",
              false,
            ),
          );
          return;
        }
      });
      socket.once("end", () => {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) {
          finish(
            new CommandClientError(
              "transport.remote-closed",
              "The command server closed before returning a complete response.",
              true,
            ),
          );
          return;
        }
        const trailing = buffer.subarray(newline + 1);
        if (
          trailing.some((byte) => byte !== 0x0d && byte !== 0x0a && byte !== 0x20 && byte !== 0x09)
        ) {
          finish(
            new CommandClientError(
              "protocol.multiple-responses",
              "The command server returned multiple response frames.",
              false,
            ),
          );
          return;
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, newline)),
          );
        } catch {
          finish(
            new CommandClientError(
              "protocol.malformed-response",
              "The command server returned malformed JSON.",
              false,
            ),
          );
          return;
        }
        const parsed = CommandResponseV1Schema.safeParse(decoded);
        if (!parsed.success) {
          finish(
            new CommandClientError(
              "protocol.invalid-response",
              "The command server returned an invalid protocol response.",
              false,
            ),
          );
          return;
        }
        if (parsed.data.requestId !== null && parsed.data.requestId !== requestId) {
          finish(
            new CommandClientError(
              "protocol.response-id-mismatch",
              "The command response ID does not match the request.",
              false,
            ),
          );
          return;
        }
        finish(undefined, parsed.data);
      });
      socket.once("error", () => {
        finish(
          new CommandClientError(
            "transport.connection-failed",
            "The command socket connection failed.",
            true,
          ),
        );
      });
      socket.once("close", () => {
        if (this.#closed) {
          finish(new CommandClientError("client.closed", "The command client is closed.", false));
        }
      });
    });
  }
}

export function createCommandClient(options: CommandClientOptions): CommandClient {
  return new CommandClient(options);
}
