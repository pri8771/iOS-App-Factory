import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";

import { CommandAuthorizationV1Schema } from "@app-factory/contracts";

import { startFactoryDaemonService, type FactoryDaemonService } from "./factory-daemon-service.js";
import {
  SwiftGreeterFixtureConfigurationError,
  loadSwiftGreeterFixtureExecutionConfiguration,
} from "./swift-greeter-fixture-execution.js";
import type { VerifiedLocalExecutionConfiguration } from "./verified-local-executor.js";

const MAX_SECRET_BYTES = 512;
const DEFAULT_POLL_INTERVAL_MS = 100;

export type DaemonProcessEnvironment = Readonly<{
  APP_FACTORY_RUNTIME_DIR?: string;
  APP_FACTORY_AUTH_FILE?: string;
  APP_FACTORY_DAEMON_VERSION?: string;
  APP_FACTORY_POLL_INTERVAL_MS?: string;
  APP_FACTORY_LOCAL_EXECUTION_CONFIG?: string;
}>;

export type DaemonProcessConfiguration = Readonly<{
  runtimeDirectory: string;
  authorization: string;
  daemonVersion: string;
  pollIntervalMs: number;
  localExecution?: VerifiedLocalExecutionConfiguration;
}>;

export type DaemonProcessIo = Readonly<{
  stderr(value: string): void;
}>;

export class DaemonConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DaemonConfigurationError";
  }
}

function configurationError(message: string): never {
  throw new DaemonConfigurationError(message);
}

function absolutePath(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) configurationError(`${name} is required.`);
  if (value.includes("\0") || !isAbsolute(value)) {
    configurationError(`${name} must be an absolute path.`);
  }
  return normalize(value);
}

function daemonVersion(value: string | undefined): string {
  if (
    value === undefined ||
    value.length < 1 ||
    value.length > 100 ||
    !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(value)
  ) {
    configurationError("APP_FACTORY_DAEMON_VERSION must be a portable version identifier.");
  }
  return value;
}

function pollInterval(value: string | undefined): number {
  if (value === undefined) return DEFAULT_POLL_INTERVAL_MS;
  if (!/^[1-9][0-9]*$/.test(value)) {
    configurationError("APP_FACTORY_POLL_INTERVAL_MS must be a positive integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 60_000) {
    configurationError("APP_FACTORY_POLL_INTERVAL_MS must not exceed 60000.");
  }
  return parsed;
}

function withoutOneLineEnding(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

/**
 * Reads a token through an already opened, non-symlink file descriptor. The
 * LaunchAgent receives only this path; the secret never appears in its plist,
 * argv, or environment.
 */
export async function readPrivateAuthorizationFile(
  path: string,
  expectedUserId: number | null = typeof process.getuid === "function" ? process.getuid() : null,
): Promise<string> {
  const normalizedPath = absolutePath(path, "APP_FACTORY_AUTH_FILE");
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await open(normalizedPath, constants.O_RDONLY | noFollow);
  } catch {
    configurationError("The Factory authorization file cannot be opened safely.");
  }

  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) {
      configurationError("The Factory authorization file must be one regular, unlinked file.");
    }
    if ((before.mode & 0o077) !== 0) {
      configurationError(
        "The Factory authorization file must not be accessible by group or others.",
      );
    }
    if (expectedUserId !== null && before.uid !== expectedUserId) {
      configurationError("The Factory authorization file must be owned by the current user.");
    }
    if (before.size < 32 || before.size > MAX_SECRET_BYTES + 2) {
      configurationError("The Factory authorization file has an invalid size.");
    }

    const buffer = Buffer.alloc(MAX_SECRET_BYTES + 3);
    try {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== before.size || bytesRead > MAX_SECRET_BYTES + 2) {
        configurationError("The Factory authorization file changed while it was being read.");
      }
      const after = await handle.stat();
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs
      ) {
        configurationError("The Factory authorization file changed while it was being read.");
      }

      const decoded = buffer.subarray(0, bytesRead).toString("utf8");
      if (Buffer.byteLength(decoded, "utf8") !== bytesRead) {
        configurationError("The Factory authorization file must contain valid UTF-8.");
      }
      const parsed = CommandAuthorizationV1Schema.safeParse(withoutOneLineEnding(decoded));
      if (!parsed.success) {
        configurationError("The Factory authorization file contains an invalid token.");
      }
      return parsed.data;
    } finally {
      buffer.fill(0);
    }
  } finally {
    await handle.close();
  }
}

export async function loadDaemonProcessConfiguration(
  environment: DaemonProcessEnvironment,
): Promise<DaemonProcessConfiguration> {
  const authorizationFile = absolutePath(
    environment.APP_FACTORY_AUTH_FILE,
    "APP_FACTORY_AUTH_FILE",
  );
  const runtimeDirectory = absolutePath(
    environment.APP_FACTORY_RUNTIME_DIR,
    "APP_FACTORY_RUNTIME_DIR",
  );
  const authorization = await readPrivateAuthorizationFile(authorizationFile);
  let localExecution: VerifiedLocalExecutionConfiguration | undefined;
  if (environment.APP_FACTORY_LOCAL_EXECUTION_CONFIG !== undefined) {
    const configPath = absolutePath(
      environment.APP_FACTORY_LOCAL_EXECUTION_CONFIG,
      "APP_FACTORY_LOCAL_EXECUTION_CONFIG",
    );
    try {
      localExecution = loadSwiftGreeterFixtureExecutionConfiguration(configPath, runtimeDirectory);
    } catch (error) {
      if (error instanceof SwiftGreeterFixtureConfigurationError) {
        configurationError(error.message);
      }
      throw error;
    }
  }
  return {
    runtimeDirectory,
    authorization,
    daemonVersion: daemonVersion(environment.APP_FACTORY_DAEMON_VERSION),
    pollIntervalMs: pollInterval(environment.APP_FACTORY_POLL_INTERVAL_MS),
    ...(localExecution === undefined ? {} : { localExecution }),
  };
}

export async function startDaemonFromEnvironment(
  environment: DaemonProcessEnvironment,
  onSchedulerError: (error: unknown) => void = () => undefined,
): Promise<FactoryDaemonService> {
  const configuration = await loadDaemonProcessConfiguration(environment);
  return await startFactoryDaemonService({ ...configuration, onSchedulerError });
}

export async function runDaemonProcess(
  environment: DaemonProcessEnvironment,
  io: DaemonProcessIo,
  dependencies: DaemonProcessDependencies = {},
): Promise<number> {
  const signals = dependencies.signals ?? process;
  const start = dependencies.start ?? startDaemonFromEnvironment;
  const shutdownTimeoutMs = dependencies.shutdownTimeoutMs ?? 25_000;
  if (
    !Number.isSafeInteger(shutdownTimeoutMs) ||
    shutdownTimeoutMs < 1 ||
    shutdownTimeoutMs > 60_000
  ) {
    throw new TypeError("shutdownTimeoutMs must be between 1 and 60000 milliseconds");
  }
  let stopping = false;
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    signals.removeListener("SIGINT", stop);
    signals.removeListener("SIGTERM", stop);
    resolveStop?.();
  };
  signals.once("SIGINT", stop);
  signals.once("SIGTERM", stop);

  let service: FactoryDaemonService;
  try {
    service = await start(environment, () => {
      io.stderr("factory-daemon scheduler error\n");
    });
  } catch (error) {
    signals.removeListener("SIGINT", stop);
    signals.removeListener("SIGTERM", stop);
    const message =
      error instanceof DaemonConfigurationError
        ? error.message
        : "The Factory daemon failed to start.";
    io.stderr(`factory-daemon: ${message}\n`);
    return 1;
  }

  await stopped;

  let shutdownTimer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      service.close(),
      new Promise<never>((_resolve, reject) => {
        shutdownTimer = setTimeout(
          () => reject(new DaemonConfigurationError("daemon shutdown timed out")),
          shutdownTimeoutMs,
        );
      }),
    ]);
    return 0;
  } catch {
    io.stderr("factory-daemon: shutdown did not complete cleanly.\n");
    return 1;
  } finally {
    if (shutdownTimer !== undefined) clearTimeout(shutdownTimer);
    signals.removeListener("SIGINT", stop);
    signals.removeListener("SIGTERM", stop);
  }
}

export type DaemonSignalPort = Readonly<{
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}>;

export type DaemonProcessDependencies = Readonly<{
  start?: (
    environment: DaemonProcessEnvironment,
    onSchedulerError: (error: unknown) => void,
  ) => Promise<FactoryDaemonService>;
  signals?: DaemonSignalPort;
  shutdownTimeoutMs?: number;
}>;
