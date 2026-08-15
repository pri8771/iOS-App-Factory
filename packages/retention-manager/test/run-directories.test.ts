import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  OciRunner,
  labelsForOciRun,
  parseOciRunIntent,
  prepareOciRun,
  type OciContainerInspection,
  type OciEnginePort,
  type OciLogCapture,
  type OciRunIntentV1,
} from "@app-factory/oci-runner";
import {
  inspectSupervisedRun,
  launchPreparedSupervisedRun,
  prepareSupervisedRun,
  waitForSupervisedRunRegistration,
  type PreparedSupervisedRun,
} from "@app-factory/process-supervisor";
import { afterEach, describe, expect, it } from "vitest";

import { reclaimRunDirectory, selectStaleRunDirectories } from "../src/run-directories.js";
import type { TerminalAttemptIndex } from "../src/terminal-index.js";
import { RetentionManagerError } from "../src/types.js";

const temporaryDirectories: string[] = [];
function temporaryDirectory(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(path);
  return path;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const TERMINAL_ATTEMPT = "11111111-1111-4111-8111-111111111111";
const NON_TERMINAL_ATTEMPT = "22222222-2222-4222-8222-222222222222";

/** A minimal, always-consistent terminal index for isolated unit tests of
 * the run-directory selectors, independent of the real kernel database
 * (that cross-check is exercised end-to-end in gc.test.ts). */
function fakeTerminalIndex(
  terminalAtByAttemptId: Readonly<Record<string, string>> = {
    [TERMINAL_ATTEMPT]: "2026-08-10T00:00:00.000Z",
  },
): TerminalAttemptIndex {
  return {
    isTerminal: (attemptId) => attemptId in terminalAtByAttemptId,
    terminalAt: (attemptId) => terminalAtByAttemptId[attemptId] ?? null,
  };
}

// ---------------------------------------------------------------------------
// OCI run directories
// ---------------------------------------------------------------------------

const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const IMAGE_REFERENCE = `factory/deterministic@sha256:${"2".repeat(64)}`;
const CONTAINER_ID = "a".repeat(64);

function ociIntent(attemptId: string, runId: string): OciRunIntentV1 {
  const worktree = temporaryDirectory("factory-gc-oci-worktree-");
  mkdirSync(join(worktree, "Sources"));
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey: `oci-${runId}`,
    attemptId,
    runId,
    fence: 0,
    createdAt: "2026-08-11T16:00:00.000Z",
    taskSpecDigest: `sha256:${"3".repeat(64)}`,
    policyDigest: `sha256:${"4".repeat(64)}`,
    baseCommit: "5".repeat(40),
    baseTree: "6".repeat(40),
    containerName: `app-factory-oci-${runId}`,
    image: { reference: IMAGE_REFERENCE, imageId: IMAGE_ID },
    worktreeHostPath: worktree,
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: "/usr/local/bin/agent",
    agentArguments: ["run"],
    environment: [{ name: "LANG", value: "C" }],
    limits: {
      cpuCount: 2,
      memoryBytes: 1_073_741_824,
      pidLimit: 128,
      outputBytesPerStream: 1_048_576,
      wallTimeMs: 60_000,
      stopGraceMs: 5_000,
      privateTmpfsBytes: 67_108_864,
    },
  });
}

function ociInspection(
  intent: OciRunIntentV1,
  status: "created" | "running" | "terminal",
  overrides: Partial<OciContainerInspection> = {},
): OciContainerInspection {
  return {
    containerId: CONTAINER_ID,
    name: intent.containerName,
    imageId: intent.image.imageId,
    labels: labelsForOciRun(intent),
    user: "10001:10001",
    command: [intent.agentExecutable, ...intent.agentArguments],
    entrypoint: null,
    workingDirectory: "/workspace",
    environment: intent.environment.map(({ name, value }) => `${name}=${value}`),
    status,
    createdAt: "2026-08-11T16:00:01.000Z",
    startedAt: status === "created" ? null : "2026-08-11T16:00:02.000Z",
    finishedAt: status === "terminal" ? "2026-08-11T16:00:03.000Z" : null,
    exitCode: status === "terminal" ? 0 : null,
    oomKilled: false,
    running: status === "running",
    readOnlyRootFilesystem: true,
    networkMode: "none",
    capDrop: ["ALL"],
    securityOptions: ["no-new-privileges=true"],
    memoryBytes: intent.limits.memoryBytes,
    memorySwapBytes: intent.limits.memoryBytes,
    pidLimit: intent.limits.pidLimit,
    cpuNanoCount: intent.limits.cpuCount * 1_000_000_000,
    stopTimeoutSeconds: Math.ceil(intent.limits.stopGraceMs / 1_000),
    privileged: false,
    tmpfs: {
      "/run/app-factory": `rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    },
    logDriver: "local",
    logOptions: {
      "max-size": `${String(intent.limits.outputBytesPerStream)}b`,
      "max-file": "1",
      compress: "false",
    },
    mounts: [
      { type: "bind", source: intent.worktreeHostPath, destination: "/workspace", readWrite: true },
    ],
    ...overrides,
  };
}

class FakeOciEngine implements OciEnginePort {
  public readonly engineIdentityDigest = `sha256:${"7".repeat(64)}`;
  public inspection: OciContainerInspection | null = null;
  readonly #intent: OciRunIntentV1;

  public constructor(intent: OciRunIntentV1) {
    this.#intent = intent;
  }

  public async observeEngineIdentityDigest(): Promise<string> {
    return this.engineIdentityDigest;
  }

  public async verifyImage(): Promise<void> {}

  public async findByLabels(): Promise<OciContainerInspection | null> {
    return this.inspection;
  }

  public async create(): Promise<string> {
    this.inspection = ociInspection(this.#intent, "created");
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (containerId !== CONTAINER_ID) throw new Error("wrong container");
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.inspection = ociInspection(this.#intent, "running");
  }

  public async logs(): Promise<OciLogCapture> {
    return {
      stdout: Buffer.from("ok\n"),
      stderr: Buffer.alloc(0),
      stdoutObservedBytes: 3,
      stderrObservedBytes: 0,
    };
  }

  public async stop(): Promise<void> {
    this.inspection = ociInspection(this.#intent, "terminal");
  }

  public async kill(): Promise<void> {
    this.inspection = ociInspection(this.#intent, "terminal", { exitCode: 137 });
  }

  public async remove(): Promise<void> {
    this.inspection = null;
  }

  public finish(): void {
    this.inspection = ociInspection(this.#intent, "terminal");
  }
}

/** Drives a fresh OCI run all the way to the "removed" disposition, the
 * same two-call `reconcile` recipe `packages/oci-runner/test/oci-
 * runner.test.ts` uses (no real Docker engine involved — `OciEnginePort`
 * is a port, and a fake implementation is the intended way to exercise
 * this without a container runtime). */
async function removedOciRun(
  root: string,
  attemptId: string,
  runId: string,
): Promise<{ intent: OciRunIntentV1 }> {
  const intent = ociIntent(attemptId, runId);
  const prepared = prepareOciRun(root, intent);
  const engine = new FakeOciEngine(intent);
  const runner = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
  await runner.reconcile(prepared);
  engine.finish();
  const result = await runner.reconcile(prepared);
  expect(result.phase).toBe("removed");
  return { intent };
}

describe("selectStaleRunDirectories (OCI)", () => {
  it("returns nothing for a root that does not exist", async () => {
    const items = await selectStaleRunDirectories(
      { path: join(temporaryDirectory("factory-gc-oci-"), "missing"), kind: "oci" },
      fakeTerminalIndex(),
      0,
      new Date("2026-08-12T00:00:00.000Z"),
    );
    expect(items).toEqual([]);
  });

  it("never selects an incomplete (never finished) run, regardless of attempt terminality", async () => {
    const root = temporaryDirectory("factory-gc-oci-");
    const intent = ociIntent(TERMINAL_ATTEMPT, "33333333-3333-4333-8333-333333333333");
    prepareOciRun(root, intent);

    const items = await selectStaleRunDirectories(
      { path: root, kind: "oci" },
      fakeTerminalIndex(),
      0,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(items).toEqual([]);
  });

  it("selects a removed run for a terminal attempt past the retention window, and reclaims exactly it", async () => {
    const root = temporaryDirectory("factory-gc-oci-");
    const { intent } = await removedOciRun(
      root,
      TERMINAL_ATTEMPT,
      "44444444-4444-4444-8444-444444444444",
    );
    const configuredRoot = { path: root, kind: "oci" as const };
    const terminalIndex = fakeTerminalIndex();
    const now = new Date("2027-01-01T00:00:00.000Z");

    const items = await selectStaleRunDirectories(configuredRoot, terminalIndex, 0, now);
    expect(items).toMatchObject([
      { category: "run-directory", attemptId: TERMINAL_ATTEMPT, id: `oci:${intent.runKey}` },
    ]);
    const [item] = items;
    if (item === undefined) throw new Error("expected one selected item");
    expect(item.path.endsWith(intent.runKey)).toBe(true);

    expect(await reclaimRunDirectory(configuredRoot, terminalIndex, 0, now, item)).toBe(true);
    expect(await selectStaleRunDirectories(configuredRoot, terminalIndex, 0, now)).toEqual([]);
    // Idempotent: reclaiming an already-gone directory reports "not reclaimed" rather than throwing.
    expect(await reclaimRunDirectory(configuredRoot, terminalIndex, 0, now, item)).toBe(false);
  });

  it("never selects a removed run belonging to a non-terminal attempt", async () => {
    const root = temporaryDirectory("factory-gc-oci-");
    await removedOciRun(root, NON_TERMINAL_ATTEMPT, "55555555-5555-4555-8555-555555555555");

    const items = await selectStaleRunDirectories(
      { path: root, kind: "oci" },
      fakeTerminalIndex(),
      0,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(items).toEqual([]);
  });

  it("respects the retention window even for a terminal attempt's removed run", async () => {
    const root = temporaryDirectory("factory-gc-oci-");
    await removedOciRun(root, TERMINAL_ATTEMPT, "66666666-6666-4666-8666-666666666666");

    const items = await selectStaleRunDirectories(
      { path: root, kind: "oci" },
      fakeTerminalIndex(),
      365 * 24 * 60 * 60 * 1_000,
      new Date("2026-08-11T16:00:20.000Z"),
    );
    expect(items).toEqual([]);
  });

  it("fails closed on a genuinely unexpected entry, ignores OS junk", async () => {
    const root = temporaryDirectory("factory-gc-oci-");
    writeFileSync(join(root, ".DS_Store"), "junk\n");
    mkdirSync(join(root, ".Trashes"));
    mkdirSync(join(root, "not-an-oci-run"));

    await expect(
      selectStaleRunDirectories(
        { path: root, kind: "oci" },
        fakeTerminalIndex(),
        0,
        new Date("2026-08-12T00:00:00.000Z"),
      ),
    ).rejects.toThrow(RetentionManagerError);
  });
});

// ---------------------------------------------------------------------------
// Supervised-run spools
// ---------------------------------------------------------------------------

const COMPILED_ENTRYPOINT = join(
  process.cwd(),
  "packages/process-supervisor/dist/supervised-entrypoint.js",
);

async function waitUntil<T>(observe: () => T | null, timeoutMs = 8_000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  do {
    const result = observe();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (performance.now() < deadline);
  throw new Error("Condition was not observed before the polling deadline");
}

/**
 * process-supervisor's own file-identity checks (`readStablePrivateFileDescriptor`)
 * are deliberately paranoid about a file's metadata changing mid-read; under
 * heavy parallel test-suite load that occasionally trips on a real,
 * transient race that has nothing to do with the code under test here (the
 * task's own known-flaky list already names this subsystem:
 * process-supervisor's "uncooperative-target" test). Retrying the whole
 * spawn with a fresh run key is a setup-robustness measure, not a
 * weakening of any assertion below.
 */
async function terminalSupervisedRun(
  root: string,
  attemptId: string,
  runKey: string,
  attempt = 0,
): Promise<PreparedSupervisedRun> {
  const effectiveRunKey = attempt === 0 ? runKey : `${runKey}-retry${String(attempt)}`;
  try {
    return await terminalSupervisedRunOnce(root, attemptId, effectiveRunKey);
  } catch (error) {
    if (attempt >= 2) throw error;
    return terminalSupervisedRun(root, attemptId, runKey, attempt + 1);
  }
}

async function terminalSupervisedRunOnce(
  root: string,
  attemptId: string,
  runKey: string,
): Promise<PreparedSupervisedRun> {
  const prepared = prepareSupervisedRun(root, {
    runKey,
    attemptId,
    fence: 1,
    createdAt: "2026-08-11T12:00:00.000Z",
    executable: process.execPath,
    argv: ["-e", "process.stdout.write('ok')"],
    cwd: root,
    limits: {
      timeoutMs: 5_000,
      graceMs: 100,
      forceWaitMs: 500,
      pollMs: 10,
      maxOutputBytesPerStream: 16_384,
    },
  });
  const launch = launchPreparedSupervisedRun(prepared, {
    controllerEntrypointPath: COMPILED_ENTRYPOINT,
  });
  if (launch.outcome !== "launch-requested") throw new Error("expected a launch request");
  await waitForSupervisedRunRegistration(prepared, launch.registration, {
    timeoutMs: 5_000,
    pollMs: 10,
  });
  // Wait past full state-file cleanup, not just the terminal receipt, so
  // the controller has released every handle under the run directory
  // before a test recursively removes it (matches the process-supervisor
  // package's own `waitForTerminal` test helper).
  const targetLockPath = join(prepared.paths.runDirectory, ".target.state.json.mutation-lock");
  const controllerLockPath = join(
    prepared.paths.runDirectory,
    ".controller.state.json.mutation-lock",
  );
  await waitUntil(() => {
    const inspection = inspectSupervisedRun(prepared);
    return inspection.state === "terminal" &&
      inspection.stateCleanup === "complete" &&
      !existsSync(targetLockPath) &&
      !existsSync(controllerLockPath)
      ? true
      : null;
  });
  return prepared;
}

describe("selectStaleRunDirectories (supervised)", () => {
  it("selects a terminal supervised spool for a terminal attempt past the retention window, and reclaims exactly it", async () => {
    const root = temporaryDirectory("factory-gc-supervised-");
    const prepared = await terminalSupervisedRun(root, TERMINAL_ATTEMPT, "run-terminal");
    const configuredRoot = { path: root, kind: "supervised" as const };
    const terminalIndex = fakeTerminalIndex();
    const now = new Date("2027-01-01T00:00:00.000Z");

    const items = await selectStaleRunDirectories(configuredRoot, terminalIndex, 0, now);
    expect(items).toMatchObject([
      { category: "run-directory", attemptId: TERMINAL_ATTEMPT, id: "supervised:run-terminal" },
    ]);
    const [item] = items;
    if (item === undefined) throw new Error("expected one selected item");
    expect(item.path).toBe(prepared.paths.runDirectory);

    expect(await reclaimRunDirectory(configuredRoot, terminalIndex, 0, now, item)).toBe(true);
    expect(await selectStaleRunDirectories(configuredRoot, terminalIndex, 0, now)).toEqual([]);
  }, 15_000);

  it("never selects a terminal spool belonging to a non-terminal attempt", async () => {
    const root = temporaryDirectory("factory-gc-supervised-");
    await terminalSupervisedRun(root, NON_TERMINAL_ATTEMPT, "run-active-owner");

    const items = await selectStaleRunDirectories(
      { path: root, kind: "supervised" },
      fakeTerminalIndex(),
      0,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(items).toEqual([]);
  }, 15_000);

  it("never selects a live (not yet launched) spool", async () => {
    const root = temporaryDirectory("factory-gc-supervised-");
    prepareSupervisedRun(root, {
      runKey: "run-prepared-only",
      attemptId: TERMINAL_ATTEMPT,
      fence: 1,
      createdAt: "2026-08-11T12:00:00.000Z",
      executable: process.execPath,
      argv: ["-e", "process.stdout.write('ok')"],
      cwd: root,
      limits: {
        timeoutMs: 5_000,
        graceMs: 100,
        forceWaitMs: 500,
        pollMs: 10,
        maxOutputBytesPerStream: 16_384,
      },
    });

    const items = await selectStaleRunDirectories(
      { path: root, kind: "supervised" },
      fakeTerminalIndex(),
      0,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(items).toEqual([]);
  });

  it("fails closed on a genuinely unexpected entry under a supervised root", async () => {
    const root = temporaryDirectory("factory-gc-supervised-");
    // A private, run-key-shaped directory with no intent.json: plausibly a
    // corrupted/tampered spool, not OS junk.
    mkdirSync(join(root, "not-a-run-key"), { mode: 0o700 });

    await expect(
      selectStaleRunDirectories(
        { path: root, kind: "supervised" },
        fakeTerminalIndex(),
        0,
        new Date("2026-08-12T00:00:00.000Z"),
      ),
    ).rejects.toThrow(RetentionManagerError);
  });
});
