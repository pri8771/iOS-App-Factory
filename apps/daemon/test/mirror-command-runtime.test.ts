import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  CommandRequestV1Schema,
  ProjectIdSchema,
  type CommandRequestV1,
  type MirrorProjectionV1,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-16T12:00:00.000Z";
const REQUEST_ID = "82000000-0000-4000-8000-000000000001";
const PLAN_COMMAND_ID = "82000000-0000-4000-8000-000000000010";
const PROJECT_ID = ProjectIdSchema.parse(randomUUID());

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function createFixtureRepository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "mirror-command-runtime-")));
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
  git("config", "user.name", "Mirror Command Runtime Test");
  git("config", "user.email", "mirror-command-runtime@example.invalid");
  git("add", "-A");
  git("commit", "--quiet", "-m", "fixture");
  return root;
}

async function makeRuntimeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mirror-command-runtime-daemon-"));
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

function request(payload: unknown, commandId = PLAN_COMMAND_ID): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId,
    issuedAt: T0,
    origin: "cli",
    operation: "mirror.plan",
    payload,
  });
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("mirror.plan", () => {
  it("builds a mirror projection from the repository's current docs and reports it as an initial-push diff", async () => {
    const repositoryRoot = createFixtureRepository({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`verification_pending`\n",
      "docs/BUGS.md": [
        "# Bugs",
        "",
        "| ID | Summary | Status |",
        "|---|---|---|",
        "| B-1 | Crash | confirmed |",
      ].join("\n"),
    });
    const runtime = await openRuntime();

    const result = await runtime.handler(
      request({ projectId: PROJECT_ID, repositoryRoot, previousProjection: null }),
      { requestId: REQUEST_ID },
    );
    if (result.operation !== "mirror.plan") throw new Error("Unexpected result operation");

    expect(result.projection.projectId).toBe(PROJECT_ID);
    expect(result.projection.lifecycleStatus).toBe("verification_pending");
    expect(result.projection.openBugs).toEqual([
      { id: "B-1", summary: "Crash", status: "confirmed" },
    ]);
    expect(result.diff.previousProjectionDigest).toBeNull();
    expect(result.diff.nextProjectionDigest).toBe(result.projection.projectionDigest);
    expect(result.diff.changed).toBe(true);
  });

  it("reports no diff on a second call with the previous projection round-tripped back in", async () => {
    const repositoryRoot = createFixtureRepository({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`mvp_development`\n",
    });
    const runtime = await openRuntime();

    const first = await runtime.handler(
      request({ projectId: PROJECT_ID, repositoryRoot, previousProjection: null }),
      { requestId: REQUEST_ID },
    );
    if (first.operation !== "mirror.plan") throw new Error("Unexpected result operation");

    const second = await runtime.handler(
      request(
        { projectId: PROJECT_ID, repositoryRoot, previousProjection: first.projection },
        "82000000-0000-4000-8000-000000000011",
      ),
      { requestId: "82000000-0000-4000-8000-000000000002" },
    );
    if (second.operation !== "mirror.plan") throw new Error("Unexpected result operation");

    expect(second.diff.changed).toBe(false);
    expect(second.diff.changes).toEqual([]);
    expect(second.diff.previousProjectionDigest).toBe(first.projection.projectionDigest);
  });

  it("rejects a previousProjection for a different project", async () => {
    const repositoryRoot = createFixtureRepository({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`beta`\n",
    });
    const runtime = await openRuntime();
    const otherProjection: MirrorProjectionV1 = {
      schemaVersion: 1,
      projectId: ProjectIdSchema.parse(randomUUID()),
      generatedAt: T0,
      sourceSnapshotDigest: `sha256:${"0".repeat(64)}`,
      lifecycleStatus: null,
      lastVerifiedAt: null,
      releaseChecklistProgress: null,
      openBugs: [],
      openRisks: [],
      milestones: [],
      projectionDigest: `sha256:${"1".repeat(64)}`,
    };

    await expect(
      runtime.handler(
        request({ projectId: PROJECT_ID, repositoryRoot, previousProjection: otherProjection }),
        { requestId: REQUEST_ID },
      ),
    ).rejects.toMatchObject({ code: "mirror.previous-projection-project-mismatch" });
  });
});
