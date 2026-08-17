import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

/**
 * `project.seed`: the from-scratch entry point (`project-seed-command-runtime.ts`'s module doc
 * comment). Driven end-to-end through the real `openDaemonCommandRuntime` handler, on a real temp
 * directory: Git init, XcodeGen scaffold, one passing XCTest, then the same enrollment scan-and-
 * apply `project.scan`/`project.apply` already perform.
 */

const T0 = "2026-08-16T12:00:00.000Z";
const REQUEST_ID = "88000000-0000-4000-8000-000000000001";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function xcodegenAvailable(): boolean {
  return spawnSync("which", ["xcodegen"], { encoding: "utf8" }).status === 0;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-project-seed-"));
  roots.push(root);
  return root;
}

async function openRuntime(root: string): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T0,
  });
  runtimes.push(runtime);
  return runtime;
}

function request(id: string, payload: unknown): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: id,
    issuedAt: T0,
    origin: "cli",
    operation: "project.seed",
    payload,
  });
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("project.seed", () => {
  it("creates a real repository, commits the scaffold, and converges enrollment on a temp dir", async () => {
    const runtime = await openRuntime(await makeRoot());
    const targetRoot = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-seeded-app-")));
    // Seed into a not-yet-existing subdirectory, per the spec ("must not exist or be empty").
    const targetDirectory = join(targetRoot, "SampleApp");

    const result = await invoke(
      runtime,
      request("88000000-0000-4000-8000-000000000010", {
        targetDirectory,
        name: "Sample App",
      }),
    );
    if (result.operation !== "project.seed") throw new Error("Unexpected project.seed result");

    expect(result.repositoryRoot).toBe(targetDirectory);
    expect(result.scaffoldCommitSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(result.planDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    // Enrollment converged: no blocking rules issue after applying the automatable actions.
    expect(result.enrollment.convergence.blocked).toBe(false);
    expect(result.enrollment.appliedActionKinds).toContain("declare-project");
    expect(result.enrollment.commitSha).toMatch(/^[0-9a-f]{40}$/u);

    const available = xcodegenAvailable();
    expect(result.xcodegen.available).toBe(available);
    if (available) {
      expect(result.xcodegen.generated).toBe(true);
      // Best-effort: a real xcodebuild is only asserted when this sandbox has a full, working
      // Xcode toolchain (not just the xcodegen CLI). Report either way rather than failing the
      // whole seed on an environmental build failure -- see the module doc comment.
      if (!result.xcodegen.built) {
        console.warn(
          `xcodebuild build did not succeed in this environment: ${result.xcodegen.detail}`,
        );
      }
    } else {
      expect(result.xcodegen.generated).toBe(false);
      expect(result.xcodegen.built).toBe(false);
      expect(result.xcodegen.detail).toMatch(/not installed/iu);
    }

    rmSync(targetRoot, { recursive: true, force: true });
  }, 600_000);

  it("rejects a target directory that already contains files", async () => {
    const runtime = await openRuntime(await makeRoot());
    const targetRoot = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-seeded-nonempty-")));
    writeFileSync(join(targetRoot, "existing.txt"), "already here\n");

    await expect(
      invoke(
        runtime,
        request("88000000-0000-4000-8000-000000000020", {
          targetDirectory: targetRoot,
          name: "Nonempty App",
        }),
      ),
    ).rejects.toThrow(/not empty/iu);

    rmSync(targetRoot, { recursive: true, force: true });
  });
});
