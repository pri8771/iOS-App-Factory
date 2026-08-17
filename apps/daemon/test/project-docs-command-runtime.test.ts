import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-16T12:00:00.000Z";
const REQUEST_ID = "81000000-0000-4000-8000-000000000001";
const SNAPSHOT_COMMAND_ID = "81000000-0000-4000-8000-000000000010";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createFixtureRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-docs-command-runtime-")));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  const git = (...arguments_: readonly string[]): void => {
    const result = spawnSync("git", ["-C", root, ...arguments_], {
      encoding: "utf8",
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
      shell: false,
    });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  git("init", "--quiet");
  git("config", "user.name", "Project Docs Command Runtime Test");
  git("config", "user.email", "project-docs-command-runtime@example.invalid");
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture");
  return root;
}

async function makeRuntimeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "project-docs-command-runtime-daemon-"));
  roots.push(root);
  return root;
}

async function openRuntime(): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: await makeRuntimeRoot(),
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T0,
  });
  runtimes.push(runtime);
  return runtime;
}

function request(payload: unknown, commandId = SNAPSHOT_COMMAND_ID): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId,
    issuedAt: T0,
    origin: "cli",
    operation: "project.docs.snapshot",
    payload,
  });
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("project.docs.snapshot", () => {
  it("reads a repository's mandated docs and returns a validated ProjectDocsSnapshotV1", async () => {
    const repositoryRoot = createFixtureRepository({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`beta`\n",
      "docs/RELEASE_CHECKLIST.md": "# Release Checklist\n\n- [x] Done thing\n- [ ] Pending thing\n",
    });
    const runtime = await openRuntime();

    const result = await runtime.handler(request({ repositoryRoot }), { requestId: REQUEST_ID });
    if (result.operation !== "project.docs.snapshot")
      throw new Error("Unexpected result operation");

    expect(result.snapshot.repositoryRoot).toBe(repositoryRoot);
    expect(result.snapshot.layout).toBe("docs");
    expect(result.snapshot.lifecycleStatus.value).toBe("beta");
    expect(result.snapshot.releaseChecklist.value).toEqual({
      items: [
        { text: "Done thing", checked: true },
        { text: "Pending thing", checked: false },
      ],
      totalItems: 2,
      checkedItems: 1,
    });
    expect(result.snapshot.snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("honestly reports every field unavailable for a repository with no docs at all", async () => {
    const repositoryRoot = createFixtureRepository({ "README.md": "nothing mandated here\n" });
    const runtime = await openRuntime();

    const result = await runtime.handler(request({ repositoryRoot }), { requestId: REQUEST_ID });
    if (result.operation !== "project.docs.snapshot")
      throw new Error("Unexpected result operation");

    expect(result.snapshot.layout).toBe("absent");
    expect(result.snapshot.docs.every((doc) => !doc.present)).toBe(true);
    expect(result.snapshot.lifecycleStatus.unavailableReason).not.toBeNull();
  });

  it("rejects a repository path that does not exist, same as project.scan", async () => {
    const runtime = await openRuntime();
    await expect(
      runtime.handler(request({ repositoryRoot: "/nonexistent/app-factory-docs-fixture-path" }), {
        requestId: REQUEST_ID,
      }),
    ).rejects.toMatchObject({ code: "project.repository-not-found" });
  });
});
