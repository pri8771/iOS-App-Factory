import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { readFileSync } from "node:fs";

export type ProcessObservation =
  | Readonly<{
      kind: "live";
      pid: number;
      processGroupId: number;
      processStartIdentity: string;
    }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "unprovable"; reason: string }>;

export type GroupSignalResult = "sent" | "missing";

export interface PlatformProcessProbe {
  currentBootIdentity(): string;
  inspectProcess(pid: number): ProcessObservation;
  signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): GroupSignalResult;
}

type ExecFile = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

export type SystemPlatformProbeOptions = Readonly<{
  platform?: NodeJS.Platform;
  execFile?: ExecFile;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
}>;

function assertPositiveProcessId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new TypeError(`${label} must be a safe process identifier greater than one`);
  }
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0 || normalized.length > 512) {
    throw new Error(`${label} was empty or unreasonably long`);
  }
  return normalized;
}

function inspectWithPs(pid: number, run: ExecFile): ProcessObservation {
  assertPositiveProcessId(pid, "pid");
  let output: string;
  try {
    output = run("/bin/ps", ["-p", String(pid), "-o", "pid=", "-o", "pgid=", "-o", "lstart="], {
      encoding: "utf8",
      timeout: 1_000,
      maxBuffer: 65_536,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { status?: number | null };
    if (failure.status === 1) {
      return { kind: "missing" };
    }
    return { kind: "unprovable", reason: `ps-failed:${failure.code ?? "unknown"}` };
  }

  const line = output.trim();
  if (line.length === 0) {
    return { kind: "missing" };
  }
  if (line.includes("\n")) {
    return { kind: "unprovable", reason: "ps-returned-multiple-processes" };
  }
  const match = /^(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
  if (match === null) {
    return { kind: "unprovable", reason: "ps-output-was-not-parseable" };
  }
  const observedPid = Number(match[1]);
  const processGroupId = Number(match[2]);
  if (observedPid !== pid || !Number.isSafeInteger(processGroupId) || processGroupId < 2) {
    return { kind: "unprovable", reason: "ps-returned-invalid-identifiers" };
  }

  try {
    return {
      kind: "live",
      pid,
      processGroupId,
      processStartIdentity: `ps-lstart:${normalizeIdentity(match[3] ?? "", "process start")}`,
    };
  } catch (error) {
    return { kind: "unprovable", reason: (error as Error).message };
  }
}

export function createSystemPlatformProbe(
  options: SystemPlatformProbeOptions = {},
): PlatformProcessProbe {
  const platform = options.platform ?? process.platform;
  const run: ExecFile =
    options.execFile ?? ((file, args, execOptions) => execFileSync(file, args, execOptions));
  const read = options.readFile ?? ((path, encoding) => readFileSync(path, encoding));
  const kill = options.kill ?? ((pid, signal) => process.kill(pid, signal));

  return {
    currentBootIdentity(): string {
      if (platform === "darwin") {
        const value = run("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], {
          encoding: "utf8",
          timeout: 1_000,
          maxBuffer: 4_096,
          stdio: ["ignore", "pipe", "pipe"],
        });
        return `darwin-bootsession:${normalizeIdentity(value, "boot session")}`;
      }
      if (platform === "linux") {
        return `linux-boot-id:${normalizeIdentity(
          read("/proc/sys/kernel/random/boot_id", "utf8"),
          "boot id",
        )}`;
      }
      throw new Error(`Process identity is unsupported on ${platform}`);
    },

    inspectProcess(pid: number): ProcessObservation {
      if (platform !== "darwin" && platform !== "linux") {
        return { kind: "unprovable", reason: `unsupported-platform:${platform}` };
      }
      return inspectWithPs(pid, run);
    },

    signalProcessGroup(processGroupId: number, signal: NodeJS.Signals): GroupSignalResult {
      assertPositiveProcessId(processGroupId, "processGroupId");
      try {
        kill(-processGroupId, signal);
        return "sent";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          return "missing";
        }
        throw error;
      }
    },
  };
}
