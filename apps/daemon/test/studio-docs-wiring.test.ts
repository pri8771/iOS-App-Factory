import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CommandRequestV1Schema,
  ProjectIdSchema,
  type CommandRequestV1,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

/**
 * End-to-end tests of `studio.snapshot`'s repo-docs wiring (`studio-command-runtime.ts` +
 * `project-docs-sources.ts`), driven through the real daemon handler with a real
 * `APP_FACTORY_PROJECT_DOCS_SOURCES` config file, exactly the way an operator would deploy it. Each
 * test sets and then restores `process.env.APP_FACTORY_PROJECT_DOCS_SOURCES` in `afterEach` so no
 * state leaks to any other test file (vitest workers do not share `process.env` across files, and
 * these tests never run concurrently with each other).
 */

const T0 = "2026-08-16T12:00:00.000Z";
const REQUEST_ID = "83000000-0000-4000-8000-000000000001";
const SNAPSHOT_COMMAND_ID = "83000000-0000-4000-8000-000000000010";
const ENROLLED_PROJECT_ID = ProjectIdSchema.parse(randomUUID());
const OBSERVED_PROJECT_ID = ProjectIdSchema.parse(randomUUID());

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];
const originalEnvValue = process.env.APP_FACTORY_PROJECT_DOCS_SOURCES;

function writeFixtureFile(root: string, path: string, content: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function makeDocsRepo(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "studio-docs-wiring-repo-")));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) writeFixtureFile(root, path, content);
  return root;
}

function writeSourcesConfig(sources: readonly unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "studio-docs-wiring-config-"));
  roots.push(dir);
  const path = join(dir, "sources.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, sources }));
  return path;
}

async function makeRuntimeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "studio-docs-wiring-daemon-"));
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

function snapshotRequest(): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: SNAPSHOT_COMMAND_ID,
    issuedAt: T0,
    origin: "cli",
    operation: "studio.snapshot",
    payload: {},
  });
}

afterEach(async () => {
  if (originalEnvValue === undefined) delete process.env.APP_FACTORY_PROJECT_DOCS_SOURCES;
  else process.env.APP_FACTORY_PROJECT_DOCS_SOURCES = originalEnvValue;
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("studio.snapshot repo-docs wiring", () => {
  it("synthesizes a full StudioProject entry for an observed (never-enrolled) project", async () => {
    const repositoryRoot = makeDocsRepo({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`mvp_development`\n",
      "docs/RELEASE_CHECKLIST.md": "# Release Checklist\n\n- [ ] Ship it\n- [x] Write tests\n",
    });
    process.env.APP_FACTORY_PROJECT_DOCS_SOURCES = writeSourcesConfig([
      { projectId: OBSERVED_PROJECT_ID, name: "Roam", repositoryRoot, enrolled: false },
    ]);
    const runtime = await openRuntime();

    const result = await runtime.handler(snapshotRequest(), { requestId: REQUEST_ID });
    if (result.operation !== "studio.snapshot") throw new Error("Unexpected result operation");

    const project = result.snapshot.projects.find(
      (entry) => entry.projectId === OBSERVED_PROJECT_ID,
    );
    expect(project).toBeDefined();
    expect(project?.name).toBe("Roam");
    // "mvp_development" maps onto the canonical six-stage vocabulary as "building".
    expect(project?.lifecycleStage).toBe("building");
    expect(project?.latestAttemptSummary).toBeNull();
    // The one unchecked release-checklist item surfaces as a gate-approval awaitingHuman item.
    expect(project?.awaitingHuman).toEqual([
      { kind: "gate-approval", attemptId: null, summary: "Ship it", since: expect.any(String) },
    ]);
    expect(project?.docsProvenance).toMatchObject({
      sourceKind: "observed",
      repositoryRoot,
      lifecycleStageSource: "repo-docs",
      awaitingHumanFromDocsCount: 1,
    });
  });

  it("leaves a project with no configured docs source exactly as before (docsProvenance null, lifecycleStage null)", async () => {
    process.env.APP_FACTORY_PROJECT_DOCS_SOURCES = writeSourcesConfig([]);
    const runtime = await openRuntime();

    const result = await runtime.handler(snapshotRequest(), { requestId: REQUEST_ID });
    if (result.operation !== "studio.snapshot") throw new Error("Unexpected result operation");

    expect(result.snapshot.projects).toEqual([]);
  });

  it("honestly reports no lifecycle stage when the docs token is not a recognized corpus stage", async () => {
    const repositoryRoot = makeDocsRepo({
      "docs/STATUS.md": "# Project Status\n\n## Lifecycle status\n\n`shipping_soon`\n",
    });
    process.env.APP_FACTORY_PROJECT_DOCS_SOURCES = writeSourcesConfig([
      { projectId: ENROLLED_PROJECT_ID, name: "Placeholder", repositoryRoot, enrolled: true },
    ]);
    const runtime = await openRuntime();

    const result = await runtime.handler(snapshotRequest(), { requestId: REQUEST_ID });
    if (result.operation !== "studio.snapshot") throw new Error("Unexpected result operation");

    const project = result.snapshot.projects.find(
      (entry) => entry.projectId === ENROLLED_PROJECT_ID,
    );
    expect(project?.lifecycleStage).toBeNull();
    expect(project?.docsProvenance?.lifecycleStageSource).toBeNull();
  });

  it("fails closed on a malformed sources config rather than silently reporting zero sources", async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-docs-wiring-bad-config-"));
    roots.push(dir);
    const path = join(dir, "bad.json");
    writeFileSync(path, "not json");
    process.env.APP_FACTORY_PROJECT_DOCS_SOURCES = path;
    const runtime = await openRuntime();

    await expect(runtime.handler(snapshotRequest(), { requestId: REQUEST_ID })).rejects.toThrow(
      /valid JSON/,
    );
  });
});
