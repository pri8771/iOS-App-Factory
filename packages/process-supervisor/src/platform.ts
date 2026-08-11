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

export type LiveProcessObservation = Extract<ProcessObservation, { kind: "live" }>;

export type ProcessGroupObservation =
  | Readonly<{
      kind: "live";
      processGroupId: number;
      members: readonly LiveProcessObservation[];
    }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "unprovable"; reason: string }>;

export type GroupSignalResult = "sent" | "missing";

export interface PlatformProcessProbe {
  currentBootIdentity(): string;
  inspectProcess(pid: number): ProcessObservation;
  inspectProcessGroup(processGroupId: number): ProcessGroupObservation;
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

function inspectGroupWithPs(processGroupId: number, run: ExecFile): ProcessGroupObservation {
  assertPositiveProcessId(processGroupId, "processGroupId");
  let output: string;
  try {
    output = run("/bin/ps", ["-ax", "-o", "pid=", "-o", "pgid=", "-o", "lstart="], {
      encoding: "utf8",
      timeout: 1_000,
      maxBuffer: 1_048_576,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException;
    return { kind: "unprovable", reason: `ps-group-failed:${failure.code ?? "unknown"}` };
  }

  const members: LiveProcessObservation[] = [];
  for (const line of output.split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/u.exec(line);
    if (match === null) {
      return { kind: "unprovable", reason: "ps-group-output-was-not-parseable" };
    }
    const pid = Number(match[1]);
    const observedGroupId = Number(match[2]);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(observedGroupId)) {
      return { kind: "unprovable", reason: "ps-group-returned-invalid-identifiers" };
    }
    if (observedGroupId !== processGroupId) continue;
    if (pid < 2 || observedGroupId < 2) {
      return { kind: "unprovable", reason: "ps-group-returned-invalid-identifiers" };
    }
    try {
      members.push({
        kind: "live",
        pid,
        processGroupId: observedGroupId,
        processStartIdentity: `ps-lstart:${normalizeIdentity(match[3] ?? "", "process start")}`,
      });
    } catch (error) {
      return { kind: "unprovable", reason: (error as Error).message };
    }
  }

  if (members.length === 0) return { kind: "missing" };
  members.sort((left, right) => left.pid - right.pid);
  return { kind: "live", processGroupId, members };
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

    inspectProcessGroup(processGroupId: number): ProcessGroupObservation {
      if (platform !== "darwin" && platform !== "linux") {
        return { kind: "unprovable", reason: `unsupported-platform:${platform}` };
      }
      return inspectGroupWithPs(processGroupId, run);
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
