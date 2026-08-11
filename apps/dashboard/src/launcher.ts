import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { TextDecoder } from "node:util";

import { createCommandClient } from "@app-factory/command-client";
import { CommandAuthorizationV1Schema } from "@app-factory/contracts";
import { z } from "zod";

import {
  createDashboardCommandPort,
  startDashboardServer,
  type DashboardServer,
} from "./server.js";

const MAX_CONFIGURATION_BYTES = 16 * 1024;
const MAX_AUTHORIZATION_BYTES = 512;
const MAX_UNIX_SOCKET_PATH_BYTES = 100;

const DashboardConfigurationFileV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  socketPath: z.string(),
  authorizationFile: z.string(),
  port: z.number().int().min(0).max(65_535).optional(),
});

export type DashboardLauncherEnvironment = Readonly<{
  APP_FACTORY_DASHBOARD_CONFIG?: string;
  APP_FACTORY_SOCKET?: string;
  APP_FACTORY_AUTH_FILE?: string;
  APP_FACTORY_DASHBOARD_PORT?: string;
}>;

export type DashboardLauncherConfiguration = Readonly<{
  socketPath: string;
  authorization: string;
  port: number;
}>;

export type DashboardLauncherIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

type ShutdownSignal = "SIGINT" | "SIGTERM";

export type DashboardSignalSource = Readonly<{
  once(signal: ShutdownSignal, listener: () => void): unknown;
  removeListener(signal: ShutdownSignal, listener: () => void): unknown;
}>;

export type DashboardProcessDependencies = Readonly<{
  signals?: DashboardSignalSource;
  loadConfiguration?: (
    argv: readonly string[],
    environment: DashboardLauncherEnvironment,
  ) => Promise<DashboardLauncherConfiguration>;
  start?: (configuration: DashboardLauncherConfiguration) => Promise<DashboardServer>;
}>;

export class DashboardLauncherConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DashboardLauncherConfigurationError";
  }
}

function configurationError(message: string): never {
  throw new DashboardLauncherConfigurationError(message);
}

function absolutePath(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) configurationError(`${name} is required.`);
  if (value.includes("\0") || !isAbsolute(value)) {
    configurationError(`${name} must be an absolute path.`);
  }
  return normalize(value);
}

function socketPath(value: string | undefined): string {
  const path = absolutePath(value, "socketPath");
  if (Buffer.byteLength(path, "utf8") > MAX_UNIX_SOCKET_PATH_BYTES) {
    configurationError("socketPath must be at most 100 UTF-8 bytes.");
  }
  return path;
}

function portFromEnvironment(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    configurationError("APP_FACTORY_DASHBOARD_PORT must be an integer from 0 to 65535.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 65_535) {
    configurationError("APP_FACTORY_DASHBOARD_PORT must be an integer from 0 to 65535.");
  }
  return parsed;
}

function parseConfigurationArgument(argv: readonly string[]): string | null {
  const arguments_ = [...argv];
  const indexes = arguments_
    .map((argument, index) => (argument === "--config" ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) configurationError("--config may only be provided once.");
  const index = indexes[0];
  if (index === undefined) {
    if (arguments_.length > 0) configurationError("Unexpected launcher argument.");
    return null;
  }
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    configurationError("--config requires an absolute file path.");
  }
  arguments_.splice(index, 2);
  if (arguments_.length > 0) configurationError("Unexpected launcher argument.");
  return absolutePath(value, "--config");
}

async function readStablePrivateFile(
  path: string,
  label: string,
  maximumBytes: number,
): Promise<Buffer> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | noFollow);
  } catch {
    configurationError(`${label} cannot be opened safely.`);
  }
  let buffer: Buffer | null = null;
  let transferred = false;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1) {
      configurationError(`${label} must be one regular, unlinked file.`);
    }
    if ((before.mode & 0o077) !== 0) {
      configurationError(`${label} must not be accessible by group or others.`);
    }
    const currentUserId = typeof process.getuid === "function" ? process.getuid() : null;
    if (currentUserId !== null && before.uid !== currentUserId) {
      configurationError(`${label} must be owned by the current user.`);
    }
    if (before.size < 1 || before.size > maximumBytes) {
      configurationError(`${label} has an invalid size.`);
    }
    buffer = Buffer.alloc(before.size + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (
      bytesRead !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      buffer.fill(0);
      configurationError(`${label} changed while it was being read.`);
    }
    transferred = true;
    return buffer.subarray(0, bytesRead);
  } finally {
    let closeFailed = false;
    try {
      await handle.close();
    } catch {
      closeFailed = true;
    }
    if (!transferred || closeFailed) buffer?.fill(0);
    if (closeFailed) configurationError(`${label} could not be closed safely.`);
  }
}

function decodeUtf8(bytes: Buffer, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    configurationError(`${label} must contain valid UTF-8.`);
  }
}

function withoutOneLineEnding(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export async function readDashboardAuthorizationFile(path: string): Promise<string> {
  const normalizedPath = absolutePath(path, "authorizationFile");
  const bytes = await readStablePrivateFile(
    normalizedPath,
    "The Factory authorization file",
    MAX_AUTHORIZATION_BYTES + 2,
  );
  try {
    const parsed = CommandAuthorizationV1Schema.safeParse(
      withoutOneLineEnding(decodeUtf8(bytes, "The Factory authorization file")),
    );
    if (!parsed.success) {
      configurationError("The Factory authorization file contains an invalid token.");
    }
    return parsed.data;
  } finally {
    bytes.fill(0);
  }
}

async function readDashboardConfigurationFile(path: string): Promise<unknown> {
  const bytes = await readStablePrivateFile(
    absolutePath(path, "dashboard configuration file"),
    "The dashboard configuration file",
    MAX_CONFIGURATION_BYTES,
  );
  try {
    try {
      return JSON.parse(decodeUtf8(bytes, "The dashboard configuration file")) as unknown;
    } catch (error) {
      if (error instanceof DashboardLauncherConfigurationError) throw error;
      configurationError("The dashboard configuration file is not valid JSON.");
    }
  } finally {
    bytes.fill(0);
  }
}

export async function loadDashboardLauncherConfiguration(
  argv: readonly string[],
  environment: DashboardLauncherEnvironment,
): Promise<DashboardLauncherConfiguration> {
  const argumentConfigurationPath = parseConfigurationArgument(argv);
  const environmentConfigurationPath = environment.APP_FACTORY_DASHBOARD_CONFIG;
  const configurationPath =
    argumentConfigurationPath ??
    (environmentConfigurationPath === undefined
      ? null
      : absolutePath(environmentConfigurationPath, "APP_FACTORY_DASHBOARD_CONFIG"));

  let source: Readonly<{
    socketPath: string;
    authorizationFile: string;
    port: number;
  }>;
  if (configurationPath === null) {
    source = {
      socketPath: socketPath(environment.APP_FACTORY_SOCKET),
      authorizationFile: absolutePath(environment.APP_FACTORY_AUTH_FILE, "APP_FACTORY_AUTH_FILE"),
      port: portFromEnvironment(environment.APP_FACTORY_DASHBOARD_PORT),
    };
  } else {
    const parsed = DashboardConfigurationFileV1Schema.safeParse(
      await readDashboardConfigurationFile(configurationPath),
    );
    if (!parsed.success) {
      configurationError("The dashboard configuration file does not match schema version 1.");
    }
    source = {
      socketPath: socketPath(parsed.data.socketPath),
      authorizationFile: absolutePath(parsed.data.authorizationFile, "authorizationFile"),
      port: parsed.data.port ?? 0,
    };
  }

  return {
    socketPath: source.socketPath,
    authorization: await readDashboardAuthorizationFile(source.authorizationFile),
    port: source.port,
  };
}

export async function startDashboardLauncher(
  configuration: DashboardLauncherConfiguration,
): Promise<DashboardServer> {
  const client = createCommandClient({
    socketPath: configuration.socketPath,
    authorization: configuration.authorization,
    origin: "dashboard",
  });
  try {
    return await startDashboardServer({
      commandPort: createDashboardCommandPort(client),
      browserToken: randomBytes(32).toString("base64url"),
      port: configuration.port,
    });
  } catch (error) {
    client.close();
    throw error;
  }
}

function renderLauncherError(error: unknown): string {
  if (error instanceof DashboardLauncherConfigurationError) {
    return `ERROR [dashboard.configuration] ${error.message}\n`;
  }
  return "ERROR [dashboard.failed] The local dashboard failed.\n";
}

export async function runDashboardProcess(
  argv: readonly string[],
  environment: DashboardLauncherEnvironment,
  io: DashboardLauncherIo,
  dependencies: DashboardProcessDependencies = {},
): Promise<number> {
  const signals = dependencies.signals ?? process;
  const loadConfiguration = dependencies.loadConfiguration ?? loadDashboardLauncherConfiguration;
  const start = dependencies.start ?? startDashboardLauncher;
  let server: DashboardServer | null = null;
  let requestStop: (() => void) | undefined;
  let stopping = false;
  const stopped = new Promise<void>((resolve) => {
    requestStop = resolve;
  });
  const onSignal = (): void => {
    if (stopping) return;
    stopping = true;
    requestStop?.();
  };

  signals.once("SIGINT", onSignal);
  signals.once("SIGTERM", onSignal);
  try {
    const configuration = await loadConfiguration(argv, environment);
    server = await start(configuration);
    io.stdout(`App Factory dashboard: ${server.launchUrl}\n`);
    await stopped;
    await server.close();
    return 0;
  } catch (error) {
    if (server !== null) {
      try {
        await server.close();
      } catch {
        // Preserve a stable, secret-free process error below.
      }
    }
    io.stderr(renderLauncherError(error));
    return error instanceof DashboardLauncherConfigurationError ? 2 : 1;
  } finally {
    signals.removeListener("SIGINT", onSignal);
    signals.removeListener("SIGTERM", onSignal);
  }
}
