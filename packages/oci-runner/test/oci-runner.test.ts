import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DockerCliEngine,
  OciRunner,
  assertOciInspectionMatchesIntent,
  buildDockerCreateArguments,
  digestOciRunIntent,
  labelsForOciRun,
  parseDockerInspection,
  parseOciRunIntent,
  prepareOciRun,
  sha256Digest,
  type DockerCommandResult,
  type OciContainerInspection,
  type OciEnginePort,
  type OciImageIdentityV1,
  type OciLogCapture,
  type OciRunIntentV1,
} from "../src/index.js";

const temporaryDirectories: string[] = [];
const CONTAINER_ID = "a".repeat(64);
const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const IMAGE_REFERENCE = `factory/codex@sha256:${"2".repeat(64)}`;
const TASK_DIGEST = `sha256:${"3".repeat(64)}`;
const POLICY_DIGEST = `sha256:${"4".repeat(64)}`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(path);
  return path;
}

function fixtureIntent(overrides: Partial<OciRunIntentV1> = {}): OciRunIntentV1 {
  const worktree = temporaryDirectory("factory-oci-worktree-");
  mkdirSync(join(worktree, "Sources"));
  writeFileSync(join(worktree, "Sources", "App.swift"), "struct App {}\n");
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey: "codex-11111111-f0",
    attemptId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    fence: 0,
    createdAt: "2026-08-11T16:00:00.000Z",
    taskSpecDigest: TASK_DIGEST,
    policyDigest: POLICY_DIGEST,
    baseCommit: "5".repeat(40),
    baseTree: "6".repeat(40),
    containerName: "app-factory-codex-11111111-f0",
    image: { reference: IMAGE_REFERENCE, imageId: IMAGE_ID },
    worktreeHostPath: worktree,
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: "/usr/local/bin/codex",
    agentArguments: ["exec", "--json", "--skip-git-repo-check", "-"],
    environment: [
      { name: "LANG", value: "C" },
      { name: "PATH", value: "/usr/local/bin:/usr/bin:/bin" },
      { name: "TZ", value: "UTC" },
    ],
    limits: {
      cpuCount: 2,
      memoryBytes: 1_073_741_824,
      pidLimit: 128,
      outputBytesPerStream: 1_048_576,
      wallTimeMs: 60_000,
      stopGraceMs: 5_000,
      privateTmpfsBytes: 67_108_864,
    },
    ...overrides,
  });
}

function inspectionFor(
  intent: OciRunIntentV1,
  status: "created" | "running" | "terminal",
  overrides: Partial<OciContainerInspection> = {},
): OciContainerInspection {
  const running = status === "running";
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
    running,
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
      {
        type: "bind",
        source: intent.worktreeHostPath,
        destination: "/workspace",
        readWrite: true,
      },
    ],
    ...overrides,
  };
}

class FakeEngine implements OciEnginePort {
  public inspection: OciContainerInspection | null = null;
  public createCount = 0;
  public startCount = 0;
  public stopCount = 0;
  public killCount = 0;
  public removeCount = 0;
  public logsResult: OciLogCapture = {
    stdout: Buffer.from("ok\n"),
    stderr: Buffer.alloc(0),
    stdoutObservedBytes: 3,
    stderrObservedBytes: 0,
  };
  readonly #intent: OciRunIntentV1;

  public constructor(intent: OciRunIntentV1) {
    this.#intent = intent;
  }

  public async verifyImage(image: OciImageIdentityV1): Promise<void> {
    if (
      image.imageId !== this.#intent.image.imageId ||
      image.reference !== this.#intent.image.reference
    ) {
      throw new Error("wrong image");
    }
  }

  public async findByLabels(): Promise<OciContainerInspection | null> {
    return this.inspection;
  }

  public async create(): Promise<string> {
    this.createCount += 1;
    this.inspection = inspectionFor(this.#intent, "created");
    return CONTAINER_ID;
  }

  public async inspect(containerId: string): Promise<OciContainerInspection | null> {
    if (containerId !== CONTAINER_ID) throw new Error("wrong container");
    return this.inspection;
  }

  public async start(): Promise<void> {
    this.startCount += 1;
    this.inspection = inspectionFor(this.#intent, "running");
  }

  public async logs(): Promise<OciLogCapture> {
    return this.logsResult;
  }

  public async stop(): Promise<void> {
    this.stopCount += 1;
    this.inspection = inspectionFor(this.#intent, "terminal", {
      exitCode: 143,
      finishedAt: "2026-08-11T16:01:03.000Z",
    });
  }

  public async kill(): Promise<void> {
    this.killCount += 1;
    this.inspection = inspectionFor(this.#intent, "terminal", { exitCode: 137 });
  }

  public async remove(): Promise<void> {
    this.removeCount += 1;
    this.inspection = null;
  }

  public finish(exitCode = 0): void {
    this.inspection = inspectionFor(this.#intent, "terminal", { exitCode });
  }
}

function prepare(intent: OciRunIntentV1) {
  const root = temporaryDirectory("factory-oci-runtime-");
  return prepareOciRun(root, intent);
}

describe("OCI intent and Docker create contract", () => {
  it("locks image, network, root filesystem, resource limits, labels, and mounts", () => {
    const intent = fixtureIntent();
    const args = buildDockerCreateArguments(intent);
    expect(args).toContain("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("no-new-privileges=true");
    expect(args).toContain("10001:10001");
    expect(args).toContain(intent.image.reference);
    expect(args.filter((value) => value.startsWith("type=bind,"))).toEqual([
      `type=bind,src=${intent.worktreeHostPath},dst=/workspace,bind-propagation=rprivate`,
    ]);
    expect(args.filter((value) => value.startsWith("/run/app-factory:"))).toHaveLength(1);
    for (const [name, value] of Object.entries(labelsForOciRun(intent))) {
      expect(args).toContain(`${name}=${value}`);
    }
  });

  it("rejects tags, network access, credentials, and unsafe worktrees", () => {
    const intent = fixtureIntent();
    expect(() => parseOciRunIntent({ ...intent, networkMode: "bridge" })).toThrow(/no-network/u);
    expect(() =>
      parseOciRunIntent({
        ...intent,
        image: { ...intent.image, reference: "factory/codex:latest" },
      }),
    ).toThrow(/pinned/u);
    expect(() =>
      parseOciRunIntent({ ...intent, environment: [{ name: "OPENAI_API_KEY", value: "canary" }] }),
    ).toThrow(/credential/u);
    symlinkSync(join(intent.worktreeHostPath, "Sources"), join(intent.worktreeHostPath, "linked"));
    expect(() => buildDockerCreateArguments(intent)).toThrow(/symbolic link/u);
  });

  it("attests the complete normalized Docker inspection", () => {
    const intent = fixtureIntent();
    expect(() =>
      assertOciInspectionMatchesIntent(inspectionFor(intent, "running"), intent),
    ).not.toThrow();
    expect(() =>
      assertOciInspectionMatchesIntent(inspectionFor(intent, "running", { user: "0:0" }), intent),
    ).toThrow(/identity or isolation/u);
    expect(() =>
      assertOciInspectionMatchesIntent(
        inspectionFor(intent, "running", { privileged: true }),
        intent,
      ),
    ).toThrow(/identity or isolation/u);
    expect(() =>
      assertOciInspectionMatchesIntent(
        inspectionFor(intent, "running", {
          environment: [...inspectionFor(intent, "running").environment, "EXTRA=1"],
        }),
        intent,
      ),
    ).toThrow(/identity or isolation/u);
  });

  it("parses the Docker inspection fields used by attestation", () => {
    const intent = fixtureIntent();
    const expected = inspectionFor(intent, "running");
    const parsed = parseDockerInspection([
      {
        Id: expected.containerId,
        Name: `/${expected.name}`,
        Image: expected.imageId,
        Created: expected.createdAt,
        Config: {
          Labels: expected.labels,
          User: expected.user,
          Cmd: expected.command,
          Entrypoint: null,
          WorkingDir: expected.workingDirectory,
          Env: expected.environment,
        },
        HostConfig: {
          ReadonlyRootfs: true,
          NetworkMode: "none",
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges=true"],
          Memory: expected.memoryBytes,
          MemorySwap: expected.memorySwapBytes,
          PidsLimit: expected.pidLimit,
          NanoCpus: expected.cpuNanoCount,
          StopTimeout: expected.stopTimeoutSeconds,
          Privileged: false,
          Tmpfs: expected.tmpfs,
          LogConfig: { Type: expected.logDriver, Config: expected.logOptions },
        },
        State: {
          Running: true,
          OOMKilled: false,
          ExitCode: 0,
          Status: "running",
          StartedAt: expected.startedAt,
          FinishedAt: "0001-01-01T00:00:00Z",
        },
        Mounts: expected.mounts.map((mount) => ({
          Type: mount.type,
          Source: mount.source,
          Destination: mount.destination,
          RW: mount.readWrite,
        })),
      },
    ]);
    expect(parsed).toEqual(expected);
  });

  it("pins the Docker executable and client/server identity before use", async () => {
    const directory = temporaryDirectory("factory-docker-cli-");
    const executable = join(directory, "docker");
    writeFileSync(executable, "fixture docker executable\n");
    chmodSync(executable, 0o555);
    const digest = `sha256:${createHash("sha256").update("fixture docker executable\n").digest("hex")}`;
    const calls: readonly string[][] = [];
    const mutableCalls = calls as string[][];
    const invoke = async (
      _executable: string,
      args: readonly string[],
    ): Promise<DockerCommandResult> => {
      mutableCalls.push([...args]);
      const stdout = Buffer.from("29.6.1|29.6.1|linux|arm64\n");
      return {
        exitCode: 0,
        signal: null,
        stdout,
        stderr: Buffer.alloc(0),
        stdoutObservedBytes: stdout.byteLength,
        stderrObservedBytes: 0,
        timedOut: false,
      };
    };
    await DockerCliEngine.create(
      {
        executable,
        executableDigest: digest,
        host: "unix:///private/tmp/factory-docker.sock",
        expectedClientVersion: "29.6.1",
        expectedServerVersion: "29.6.1",
        expectedServerOs: "linux",
        expectedServerArchitecture: "arm64",
      },
      { invoke },
    );
    expect(calls[0]).toEqual([
      "--host",
      "unix:///private/tmp/factory-docker.sock",
      "version",
      "--format",
      "{{.Client.Version}}|{{.Server.Version}}|{{.Server.Os}}|{{.Server.Arch}}",
    ]);
  });
});

describe("durable OCI lifecycle", () => {
  it("reconciles planned through removed and emits a digest-bound receipt", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    const runner = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    expect(await runner.reconcile(prepared)).toEqual({
      phase: "running",
      containerId: CONTAINER_ID,
    });
    engine.finish(0);
    const result = await runner.reconcile(prepared);
    expect(result.phase).toBe("removed");
    if (result.phase !== "removed") throw new Error("expected receipt");
    expect(result.receipt).toMatchObject({
      intentDigest: digestOciRunIntent(intent),
      outcome: "succeeded",
      terminationOrigin: "natural",
      containerId: CONTAINER_ID,
    });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
    expect(engine.removeCount).toBe(1);
    expect(await runner.reconcile(prepared)).toEqual(result);
  });

  it("recovers a lost create response without creating a duplicate", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    let failed = false;
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-create" && !failed) {
          failed = true;
          throw new Error("injected create response loss");
        }
      },
    });
    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected/u);
    const recovered = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    expect(await recovered.reconcile(prepared)).toMatchObject({ phase: "running" });
    expect(engine.createCount).toBe(1);
  });

  it("recovers a lost start response without relaunching", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    let failed = false;
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:10.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-start" && !failed) {
          failed = true;
          throw new Error("injected start response loss");
        }
      },
    });
    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected/u);
    const recovered = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    expect(await recovered.reconcile(prepared)).toMatchObject({ phase: "running" });
    expect(engine.createCount).toBe(1);
    expect(engine.startCount).toBe(1);
  });

  it("recovers a lost remove response from terminal evidence", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    const runner = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    await runner.reconcile(prepared);
    engine.finish();
    let failed = false;
    const crashing = new OciRunner(engine, {
      now: () => new Date("2026-08-11T16:00:11.000Z"),
      afterBoundary: (boundary) => {
        if (boundary === "after-remove" && !failed) {
          failed = true;
          throw new Error("injected remove response loss");
        }
      },
    });
    await expect(crashing.reconcile(prepared)).rejects.toThrow(/injected/u);
    const recovered = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:12.000Z") });
    expect(await recovered.reconcile(prepared)).toMatchObject({
      phase: "removed",
      receipt: { outcome: "succeeded" },
    });
    expect(engine.removeCount).toBe(1);
  });

  it("enforces the wall-time deadline and records a timeout", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    const initial = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    await initial.reconcile(prepared);
    const expired = new OciRunner(engine, { now: () => new Date("2026-08-11T16:02:10.000Z") });
    const result = await expired.reconcile(prepared);
    expect(result).toMatchObject({
      phase: "removed",
      receipt: { outcome: "timed-out", terminationOrigin: "wall-time" },
    });
    expect(engine.stopCount).toBe(1);
  });

  it("records bounded output-overflow provenance", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    const runner = new OciRunner(engine, { now: () => new Date("2026-08-11T16:00:10.000Z") });
    await runner.reconcile(prepared);
    engine.finish();
    engine.logsResult = {
      stdout: Buffer.alloc(intent.limits.outputBytesPerStream, 0x61),
      stderr: Buffer.alloc(0),
      stdoutObservedBytes: intent.limits.outputBytesPerStream + 1,
      stderrObservedBytes: 0,
    };
    const result = await runner.reconcile(prepared);
    expect(result).toMatchObject({
      phase: "removed",
      receipt: {
        outcome: "output-overflow",
        terminationOrigin: "output-overflow",
        stdout: { truncated: true, observedByteLength: intent.limits.outputBytesPerStream + 1 },
      },
    });
    if (result.phase === "removed") {
      expect(result.receipt.stdout.digest).toBe(sha256Digest(engine.logsResult.stdout));
    }
  });

  it("blocks reconciliation when immutable container identity drifts", async () => {
    const intent = fixtureIntent();
    const prepared = prepare(intent);
    const engine = new FakeEngine(intent);
    engine.inspection = inspectionFor(intent, "running", { networkMode: "bridge" });
    const runner = new OciRunner(engine);
    await expect(runner.reconcile(prepared)).rejects.toThrow(/identity or isolation/u);
    expect(engine.createCount).toBe(0);
  });
});
