import { describe, expect, it, vi } from "vitest";

import { createSystemPlatformProbe } from "../src/index.js";

describe("system platform probe", () => {
  it("uses the macOS boot-session UUID and parses a process start identity", () => {
    const execFile = vi.fn((file: string, args: readonly string[]) => {
      if (file === "/usr/sbin/sysctl") {
        expect(args).toEqual(["-n", "kern.bootsessionuuid"]);
        return "ABCD-1234\n";
      }
      return "  912   912 Mon Aug 10 12:34:56 2026\n";
    });
    const probe = createSystemPlatformProbe({ platform: "darwin", execFile });

    expect(probe.currentBootIdentity()).toBe("darwin-bootsession:ABCD-1234");
    expect(probe.inspectProcess(912)).toEqual({
      kind: "live",
      pid: 912,
      processGroupId: 912,
      processStartIdentity: "ps-lstart:Mon Aug 10 12:34:56 2026",
    });
  });

  it("distinguishes a missing PID from an inspection failure", () => {
    const missing = new Error("missing") as Error & { status: number };
    missing.status = 1;
    const missingProbe = createSystemPlatformProbe({
      platform: "darwin",
      execFile: () => {
        throw missing;
      },
    });
    expect(missingProbe.inspectProcess(912)).toEqual({ kind: "missing" });

    const failed = Object.assign(new Error("denied"), { code: "EPERM" });
    const failedProbe = createSystemPlatformProbe({
      platform: "darwin",
      execFile: () => {
        throw failed;
      },
    });
    expect(failedProbe.inspectProcess(912)).toEqual({
      kind: "unprovable",
      reason: "ps-failed:EPERM",
    });
  });

  it("signals the negative process-group ID and reports ESRCH without masking other errors", () => {
    const kill = vi.fn<(pid: number, signal: NodeJS.Signals) => void>();
    const probe = createSystemPlatformProbe({ platform: "darwin", kill });
    expect(probe.signalProcessGroup(912, "SIGTERM")).toBe("sent");
    expect(kill).toHaveBeenCalledWith(-912, "SIGTERM");

    const missingProbe = createSystemPlatformProbe({
      platform: "darwin",
      kill: () => {
        throw Object.assign(new Error("gone"), { code: "ESRCH" });
      },
    });
    expect(missingProbe.signalProcessGroup(912, "SIGKILL")).toBe("missing");
  });
});
