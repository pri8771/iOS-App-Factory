import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";

import { CommandAuthorizationV1Schema } from "@app-factory/contracts";

import {
  startFactoryDaemonService,
  type EffectSubsystemConfiguration,
  type FactoryDaemonService,
} from "./factory-daemon-service.js";
import {
  LocalExecutionProfileConfigurationError,
  loadLocalExecutionProfile,
  type LocalExecutionProfileDependencies,
} from "./local-execution-profile.js";
import type { PhaseParticipantsPort } from "./phase-run-executor.js";
import {
  loadPlannerExecutionConfigFile,
  type PlannerExecutionConfigV1,
} from "./planner-project-execution.js";
import {
  createAscReleaseObserverPort,
  loadAscObserverConfigFile,
  type ReleaseObserverPort,
} from "./release-command-runtime.js";
import {
  loadPhaseParticipantsPortV1,
  loadRoomsSubsystemConfiguration,
  RoomParticipantsConfigurationError,
} from "./room-participants-config.js";
import type { RoomSubsystemConfiguration } from "./room-subsystem.js";
import type { VerifiedLocalExecutionConfiguration } from "./verified-local-executor.js";

const MAX_SECRET_BYTES = 512;
const DEFAULT_POLL_INTERVAL_MS = 100;

export type DaemonProcessEnvironment = Readonly<{
  APP_FACTORY_RUNTIME_DIR?: string;
  APP_FACTORY_AUTH_FILE?: string;
  APP_FACTORY_DAEMON_VERSION?: string;
  APP_FACTORY_POLL_INTERVAL_MS?: string;
  APP_FACTORY_LOCAL_EXECUTION_CONFIG?: string;
  APP_FACTORY_CONTAINMENT_ATTESTATION?: string;
  /**
   * Default OFF. Set to "1" or "true" to run the effect subsystem's
   * send/reconcile pump loop. Adapter registration always stays code-level
   * (see `EffectSubsystemConfiguration.configureAdapters`); this flag only
   * decides whether the pump loop itself runs at all.
   */
  APP_FACTORY_EFFECTS_PUMP_ENABLED?: string;
  /**
   * Default OFF. Set to "1" or "true" to compose the room moderator with
   * real Codex/Claude/Ollama participants (see
   * `APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG`). Real-model room participation
   * is a real-identity path: enabling this refuses to load without
   * `APP_FACTORY_CONTAINMENT_ATTESTATION` set to a valid attestation file,
   * exactly like the coding agent's local execution profile.
   */
  APP_FACTORY_ROOMS_ENABLED?: string;
  /** Absolute path to the room participants/roster JSON config; required when rooms are enabled. */
  APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG?: string;
  /**
   * Default OFF (unset). Absolute path to the App Store Connect observer config
   * (`release-command-runtime.ts`'s `AscObserverConfigV1`: key ID, issuer ID, and the Keychain
   * reference of the `.p8` item -- names only). When set, `release.observe` can take strictly
   * read-only App Store Connect observations through the credential broker; when unset,
   * `release.observe` refuses and `release.projection` serves only persisted observations.
   */
  APP_FACTORY_ASC_OBSERVER_CONFIG?: string;
  /**
   * Default OFF (unset). Absolute path to the planner execution config
   * (`planner-project-execution.ts`'s `PlannerExecutionConfigV1`: `planner-codex-v1` with the Codex
   * identity fields, or `planner-fixture-v1`; the reviewer; the `ios-xcodegen-v1` verification
   * toolchain). When set, the verified executor runs the task items of owner-approved plans against
   * any registered project. `planner-codex-v1` is a real-identity mode and refuses to load without
   * `APP_FACTORY_CONTAINMENT_ATTESTATION`, exactly like `enrolled-codex-v1`.
   */
  APP_FACTORY_PLANNER_EXECUTION_CONFIG?: string;
}>;

export type DaemonProcessConfiguration = Readonly<{
  runtimeDirectory: string;
  authorization: string;
  daemonVersion: string;
  pollIntervalMs: number;
  localExecution?: VerifiedLocalExecutionConfiguration;
  effects?: EffectSubsystemConfiguration;
  rooms?: RoomSubsystemConfiguration;
  phaseParticipants?: PhaseParticipantsPort;
  releaseObserver?: ReleaseObserverPort;
  plannerExecution?: Readonly<{ config: PlannerExecutionConfigV1 }>;
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

/** Strict "1"/"true" (case-insensitive) → true, "0"/"false"/unset → false; anything else fails closed. */
function booleanFlag(name: string, value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false" || normalized === "") return false;
  configurationError(`${name} must be one of: 1, 0, true, false.`);
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

const MAX_SCHEDULER_ERROR_LOG_MESSAGE_LENGTH = 500;
// Deliberately loose (no version/variant nibble check): kernel and scheduler
// invariant messages embed already-validated attempt IDs verbatim, so a
// best-effort scan is enough and keeps this independent of the branded schema.
const UUID_LIKE_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
// Every error class this codebase actually throws through the scheduler loop
// (SchedulerFenceError, SchedulerInvariantError, TypeError, the native Error,
// ...) has a plain identifier name. Anything else is treated as untrusted and
// replaced, so a crafted `.name` can never ride into the log verbatim.
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

export type SchedulerErrorLogEntry = Readonly<{
  ts: string;
  code: string;
  attemptId: string | null;
  message: string;
}>;

function boundedLogMessage(value: string): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > MAX_SCHEDULER_ERROR_LOG_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_SCHEDULER_ERROR_LOG_MESSAGE_LENGTH)}...`
    : normalized;
}

/**
 * Best-effort attemptId recovery for operator diagnosis. The scheduler's own
 * errors (SchedulerFenceError, SchedulerInvariantError, and the kernel errors
 * they sometimes wrap as `cause`) usually embed the attempt's UUID directly in
 * their message text; this never reads error properties beyond name/message
 * one cause level deep, so it cannot surface command payloads or secrets.
 */
function extractAttemptId(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const direct = UUID_LIKE_PATTERN.exec(error.message);
  if (direct !== null) return direct[0];
  if (error.cause instanceof Error) {
    const fromCause = UUID_LIKE_PATTERN.exec(error.cause.message);
    if (fromCause !== null) return fromCause[0];
  }
  return null;
}

/**
 * Renders one structured, single-line JSON log entry for a scheduler-loop
 * error: a timestamp, an error-name code, a best-effort attemptId, and a
 * bounded message. `JSON.stringify` without indentation always escapes
 * embedded newlines/control characters within string values, so the result
 * is guaranteed single-line regardless of what the error message contains.
 */
export function formatSchedulerErrorLogLine(
  error: unknown,
  now: () => string = () => new Date().toISOString(),
): string {
  const name = error instanceof Error ? error.name : "";
  const entry: SchedulerErrorLogEntry = {
    ts: now(),
    code: SAFE_ERROR_CODE_PATTERN.test(name) ? name : "UnknownError",
    attemptId: extractAttemptId(error),
    message:
      error instanceof Error
        ? boundedLogMessage(error.message)
        : "A non-Error value was thrown by the scheduler loop.",
  };
  return JSON.stringify(entry);
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
  localExecutionDependencies: LocalExecutionProfileDependencies = {},
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
  // Shared by both real-identity execution surfaces below (the coding agent's
  // local execution profile and, separately, studio-rooms' live participants):
  // one env var, one resolved path, one attestation file -- never two gates.
  const attestationPath =
    environment.APP_FACTORY_CONTAINMENT_ATTESTATION === undefined
      ? undefined
      : absolutePath(
          environment.APP_FACTORY_CONTAINMENT_ATTESTATION,
          "APP_FACTORY_CONTAINMENT_ATTESTATION",
        );
  let localExecution: VerifiedLocalExecutionConfiguration | undefined;
  if (environment.APP_FACTORY_LOCAL_EXECUTION_CONFIG !== undefined) {
    const configPath = absolutePath(
      environment.APP_FACTORY_LOCAL_EXECUTION_CONFIG,
      "APP_FACTORY_LOCAL_EXECUTION_CONFIG",
    );
    try {
      localExecution = await loadLocalExecutionProfile(configPath, runtimeDirectory, {
        ...localExecutionDependencies,
        ...(attestationPath === undefined ? {} : { containmentAttestationPath: attestationPath }),
      });
    } catch (error) {
      if (error instanceof LocalExecutionProfileConfigurationError) {
        configurationError(error.message);
      }
      throw error;
    }
  }
  const effectsPumpEnabled = booleanFlag(
    "APP_FACTORY_EFFECTS_PUMP_ENABLED",
    environment.APP_FACTORY_EFFECTS_PUMP_ENABLED,
  );
  const roomsEnabled = booleanFlag(
    "APP_FACTORY_ROOMS_ENABLED",
    environment.APP_FACTORY_ROOMS_ENABLED,
  );
  let rooms: RoomSubsystemConfiguration | undefined;
  let phaseParticipants: PhaseParticipantsPort | undefined;
  if (roomsEnabled) {
    const participantsConfigPath = absolutePath(
      environment.APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG,
      "APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG",
    );
    try {
      rooms = loadRoomsSubsystemConfiguration({
        participantsConfigPath,
        ...(attestationPath === undefined ? {} : { containmentAttestationPath: attestationPath }),
      });
      // Seam (b) of the project-registry task: `phase.run`'s participant pool is built from the
      // SAME participants config file and the SAME containment attestation gate `rooms` (above)
      // just loaded -- never a second, independently configured pool.
      phaseParticipants = loadPhaseParticipantsPortV1({
        participantsConfigPath,
        ...(attestationPath === undefined ? {} : { containmentAttestationPath: attestationPath }),
      });
    } catch (error) {
      if (error instanceof RoomParticipantsConfigurationError) {
        configurationError(error.message);
      }
      throw error;
    }
  }
  let releaseObserver: ReleaseObserverPort | undefined;
  if (
    environment.APP_FACTORY_ASC_OBSERVER_CONFIG !== undefined &&
    environment.APP_FACTORY_ASC_OBSERVER_CONFIG.length > 0
  ) {
    const observerConfigPath = absolutePath(
      environment.APP_FACTORY_ASC_OBSERVER_CONFIG,
      "APP_FACTORY_ASC_OBSERVER_CONFIG",
    );
    try {
      releaseObserver = createAscReleaseObserverPort({
        config: loadAscObserverConfigFile(observerConfigPath),
      });
    } catch (error) {
      if (error instanceof LocalExecutionProfileConfigurationError) {
        configurationError(error.message);
      }
      throw error;
    }
  }
  let plannerExecution: Readonly<{ config: PlannerExecutionConfigV1 }> | undefined;
  if (
    environment.APP_FACTORY_PLANNER_EXECUTION_CONFIG !== undefined &&
    environment.APP_FACTORY_PLANNER_EXECUTION_CONFIG.length > 0
  ) {
    const plannerConfigPath = absolutePath(
      environment.APP_FACTORY_PLANNER_EXECUTION_CONFIG,
      "APP_FACTORY_PLANNER_EXECUTION_CONFIG",
    );
    try {
      plannerExecution = {
        config: loadPlannerExecutionConfigFile(plannerConfigPath, {
          ...(attestationPath === undefined ? {} : { containmentAttestationPath: attestationPath }),
        }),
      };
    } catch (error) {
      if (error instanceof LocalExecutionProfileConfigurationError) {
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
    // Adapter registration is deliberately left unconfigured here: it stays a
    // code-level seam (`configureAdapters`) for a future task to populate
    // once real provider credentials exist. Omitted entirely (rather than
    // `{ enabled: false }`) when off, matching `localExecution`'s pattern of
    // leaving disabled subsystems out of the resolved configuration.
    ...(effectsPumpEnabled ? { effects: { enabled: true } } : {}),
    ...(rooms === undefined ? {} : { rooms }),
    ...(phaseParticipants === undefined ? {} : { phaseParticipants }),
    ...(releaseObserver === undefined ? {} : { releaseObserver }),
    ...(plannerExecution === undefined ? {} : { plannerExecution }),
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

  const now = dependencies.now ?? (() => new Date().toISOString());
  let service: FactoryDaemonService;
  try {
    service = await start(environment, (error) => {
      io.stderr(`${formatSchedulerErrorLogLine(error, now)}\n`);
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
  /** Clock for the scheduler-error log line's `ts` field; defaults to the wall clock. */
  now?: () => string;
}>;
