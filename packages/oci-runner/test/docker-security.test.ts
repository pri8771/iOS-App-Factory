import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DockerCliEngine,
  buildDockerCreateArguments,
  labelsForOciRun,
  parseOciRunIntent,
  type DockerCliConfiguration,
  type DockerCommandResult,
  type OciRunIntentV1,
} from "../src/index.js";

const CONTAINER_ID = "a".repeat(64);
const OTHER_CONTAINER_ID = "b".repeat(64);
const IMAGE_ID = `sha256:${"1".repeat(64)}`;
const IMAGE_REFERENCE = `factory/codex@sha256:${"2".repeat(64)}`;
const MAX_CONTROL_OUTPUT = 2 * 1024 * 1024;
const DOCKER_SERVER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_DOCKER_SERVER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DOCKER_SERVER_IDENTITY = `${DOCKER_SERVER_ID}|29.5.2|linux|aarch64`;
const temporaryDirectories: string[] = [];
const servers: Server[] = [];

type RawInspection = Readonly<{
  Id: string;
  Name: string;
  Image: string;
  Created: string;
  Config: Record<string, unknown>;
  HostConfig: Record<string, unknown>;
  State: Record<string, unknown>;
  NetworkSettings: Record<string, unknown>;
  Mounts: Record<string, unknown>[];
}>;

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        await new Promise<void>((resolvePromise) => {
          server.close(() => resolvePromise());
        }),
    ),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(path);
  return path;
}

function fixtureIntent(): OciRunIntentV1 {
  const worktree = temporaryDirectory("factory-docker-security-worktree-");
  mkdirSync(join(worktree, "Sources"));
  writeFileSync(join(worktree, "Sources", "App.swift"), "struct App {}\n");
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey: "codex-11111111-f0",
    attemptId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    fence: 0,
    createdAt: "2026-08-11T16:00:00.000Z",
    taskSpecDigest: `sha256:${"3".repeat(64)}`,
    policyDigest: `sha256:${"4".repeat(64)}`,
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
  });
}

function safeRawInspection(intent: OciRunIntentV1, id = CONTAINER_ID): RawInspection {
  return {
    Id: id,
    Name: `/${intent.containerName}`,
    Image: intent.image.imageId,
    Created: "2026-08-11T16:00:01.000Z",
    Config: {
      Labels: labelsForOciRun(intent),
      User: "10001:10001",
      Cmd: [intent.agentExecutable, ...intent.agentArguments],
      Entrypoint: null,
      WorkingDir: "/workspace",
      Env: intent.environment.map(({ name, value }) => `${name}=${value}`),
      StopTimeout: Math.ceil(intent.limits.stopGraceMs / 1_000),
    },
    HostConfig: {
      ReadonlyRootfs: true,
      NetworkMode: "none",
      CapAdd: null,
      CapDrop: ["ALL"],
      CgroupnsMode: "private",
      Devices: [],
      DeviceRequests: null,
      DeviceCgroupRules: null,
      PidMode: "",
      IpcMode: "private",
      UTSMode: "",
      UsernsMode: "",
      RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
      AutoRemove: false,
      PublishAllPorts: false,
      PortBindings: {},
      SecurityOpt: ["no-new-privileges=true"],
      Memory: intent.limits.memoryBytes,
      MemorySwap: intent.limits.memoryBytes,
      PidsLimit: intent.limits.pidLimit,
      NanoCpus: intent.limits.cpuCount * 1_000_000_000,
      Privileged: false,
      Tmpfs: {
        "/run/app-factory": `rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
      },
      LogConfig: {
        Type: "local",
        Config: {
          "max-size": `${String(intent.limits.outputBytesPerStream)}b`,
          "max-file": "1",
          compress: "false",
        },
      },
    },
    State: {
      Running: true,
      Paused: false,
      Restarting: false,
      OOMKilled: false,
      Dead: false,
      Error: "",
      ExitCode: 0,
      Status: "running",
      StartedAt: "2026-08-11T16:00:02.000Z",
      FinishedAt: "0001-01-01T00:00:00Z",
    },
    NetworkSettings: {
      SandboxID: "c".repeat(64),
      SandboxKey: `/var/run/docker/netns/${"d".repeat(12)}`,
      Ports: {},
      Networks: {
        none: {
          IPAMConfig: null,
          Links: null,
          Aliases: null,
          DriverOpts: null,
          GwPriority: 0,
          NetworkID: "e".repeat(64),
          EndpointID: "",
          Gateway: "",
          IPAddress: "",
          MacAddress: "",
          IPPrefixLen: 0,
          IPv6Gateway: "",
          GlobalIPv6Address: "",
          GlobalIPv6PrefixLen: 0,
          DNSNames: null,
        },
      },
    },
    Mounts: [
      {
        Type: "bind",
        Source: intent.worktreeHostPath,
        Destination: "/workspace",
        RW: true,
        Propagation: "rprivate",
      },
    ],
  };
}

function result(
  stdout: string | Buffer,
  overrides: Partial<DockerCommandResult> = {},
): DockerCommandResult {
  const output = typeof stdout === "string" ? Buffer.from(stdout) : stdout;
  return {
    exitCode: 0,
    signal: null,
    stdout: output,
    stderr: Buffer.alloc(0),
    stdoutObservedBytes: output.byteLength,
    stderrObservedBytes: 0,
    timedOut: false,
    ...overrides,
  };
}

function missingContainerResult(
  containerId = CONTAINER_ID,
  overrides: Partial<DockerCommandResult> = {},
): DockerCommandResult {
  const stderr = Buffer.from(
    `Error response from daemon: No such container: ${containerId}\n`,
    "utf8",
  );
  return result("\n", {
    exitCode: 1,
    stderr,
    stderrObservedBytes: stderr.byteLength,
    ...overrides,
  });
}

function serverIdentityLine(serverId: string, configuration: DockerCliConfiguration): string {
  const architecture = configuration.expectedServerArchitecture === "arm64" ? "aarch64" : "x86_64";
  return `${serverId}|${configuration.expectedServerVersion}|${configuration.expectedServerOs}|${architecture}\n`;
}

async function privateSocket(directory: string): Promise<string> {
  const path = join(directory, "s");
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(path, () => resolvePromise());
  });
  chmodSync(path, 0o600);
  return path;
}

async function engineFixture(
  afterIdentity: (args: readonly string[]) => DockerCommandResult,
  options: Readonly<{
    executableAlias?: boolean;
    socketAlias?: boolean;
    serverId?: string;
    serverIds?: readonly string[];
    serverIdentityResult?: DockerCommandResult;
  }> = {},
): Promise<
  Readonly<{
    engine: DockerCliEngine;
    executable: string;
    socketPath: string;
    calls: readonly Readonly<{ executable: string; args: readonly string[] }>[];
    createEngine: (
      serverId?: string,
      configurationOverrides?: Partial<DockerCliConfiguration>,
    ) => Promise<DockerCliEngine>;
  }>
> {
  const directory = temporaryDirectory("fd-");
  const realExecutable = join(directory, "d-real");
  writeFileSync(realExecutable, "fixture docker executable\n");
  chmodSync(realExecutable, 0o555);
  const executable = options.executableAlias ? join(directory, "d") : realExecutable;
  if (options.executableAlias) symlinkSync(realExecutable, executable);
  const realSocketPath = await privateSocket(directory);
  const socketPath = options.socketAlias ? join(directory, "s-alias") : realSocketPath;
  if (options.socketAlias) symlinkSync(realSocketPath, socketPath);
  const digest = `sha256:${createHash("sha256")
    .update("fixture docker executable\n")
    .digest("hex")}`;
  const calls: { executable: string; args: readonly string[] }[] = [];
  const configuration: DockerCliConfiguration = {
    executable,
    executableDigest: digest,
    host: `unix://${socketPath}`,
    expectedClientVersion: "29.6.1",
    expectedServerVersion: "29.5.2",
    expectedServerOs: "linux",
    expectedServerArchitecture: "arm64",
  };
  const createEngine = async (
    serverId = options.serverId ?? DOCKER_SERVER_ID,
    configurationOverrides: Partial<DockerCliConfiguration> = {},
  ): Promise<DockerCliEngine> => {
    const configured = { ...configuration, ...configurationOverrides };
    let serverObservation = 0;
    return await DockerCliEngine.create(configured, {
      invoke: async (invokedExecutable, args) => {
        calls.push({ executable: invokedExecutable, args: [...args] });
        if (args[2] === "version") {
          return result(`${configured.expectedClientVersion}\n`);
        }
        if (args[2] === "info") {
          const observedServerId = options.serverIds?.[serverObservation] ?? serverId;
          serverObservation += 1;
          return (
            options.serverIdentityResult ?? result(serverIdentityLine(observedServerId, configured))
          );
        }
        return afterIdentity(args);
      },
    });
  };
  const engine = await createEngine();
  return {
    engine,
    executable: realExecutable,
    socketPath: realSocketPath,
    calls,
    createEngine,
  };
}

function cloneRaw(raw: RawInspection): RawInspection {
  return structuredClone(raw);
}

describe("Docker OCI containment contract", () => {
  it("uses a private non-root tmpfs and rejects hard-linked worktree files", () => {
    const intent = fixtureIntent();
    const args = buildDockerCreateArguments(intent);
    const tmpfsIndex = args.indexOf("--tmpfs");
    expect(args[tmpfsIndex + 1]).toBe(
      `/run/app-factory:rw,nosuid,nodev,noexec,size=${String(intent.limits.privateTmpfsBytes)},mode=0700,uid=10001,gid=10001`,
    );
    expect(args).toContain("--cgroupns");
    expect(args).toContain("--ipc");
    expect(args).toContain("--restart");
    expect(args.slice(0, 3)).toEqual(["create", "--pull", "never"]);
    expect(args).toContain("compress=false");
    expect(args.filter((value) => value.startsWith("type=bind,"))).toEqual([
      `type=bind,src=${intent.worktreeHostPath},dst=/workspace,bind-propagation=rprivate`,
    ]);

    linkSync(
      join(intent.worktreeHostPath, "Sources", "App.swift"),
      join(intent.worktreeHostPath, "Sources", "HardLink.swift"),
    );
    expect(() => buildDockerCreateArguments(intent)).toThrow(/hard-linked/u);
  });

  it("rejects unsafe Docker name and mount grammar before create", () => {
    const intent = fixtureIntent();
    expect(() =>
      buildDockerCreateArguments(parseOciRunIntent({ ...intent, containerName: "-unsafe" })),
    ).toThrow(/name.*Docker-safe/u);

    const parent = temporaryDirectory("factory-docker-unsafe-path-");
    const worktree = join(parent, "comma,path");
    mkdirSync(worktree);
    expect(() =>
      buildDockerCreateArguments(parseOciRunIntent({ ...intent, worktreeHostPath: worktree })),
    ).toThrow(/mount grammar/u);
  });

  it("accepts the exact locked Colima inspection shape", async () => {
    const intent = fixtureIntent();
    const raw = safeRawInspection(intent);
    const fixture = await engineFixture(() => result(JSON.stringify(raw)));
    await expect(fixture.engine.inspect(CONTAINER_ID)).resolves.toMatchObject({
      containerId: CONTAINER_ID,
      networkMode: "none",
      capDrop: ["ALL"],
      securityOptions: ["no-new-privileges=true"],
    });
    expect(fixture.calls.at(-1)?.args.slice(-5)).toEqual([
      "container",
      "inspect",
      "--format",
      "{{json .}}",
      CONTAINER_ID,
    ]);
  });

  it("accepts an otherwise inert none-network record before Docker assigns its network ID", async () => {
    const intent = fixtureIntent();
    const raw = safeRawInspection(intent);
    raw.NetworkSettings.Networks.none.NetworkID = "";
    const fixture = await engineFixture(() => result(JSON.stringify(raw)));

    await expect(fixture.engine.inspect(CONTAINER_ID)).resolves.toMatchObject({
      containerId: CONTAINER_ID,
      networkMode: "none",
    });
  });

  it("accepts Docker's opaque endpoint identity while the none-network record remains inert", async () => {
    const intent = fixtureIntent();
    const raw = safeRawInspection(intent);
    raw.NetworkSettings.Networks.none.EndpointID = "d".repeat(64);
    const fixture = await engineFixture(() => result(JSON.stringify(raw)));

    await expect(fixture.engine.inspect(CONTAINER_ID)).resolves.toMatchObject({
      containerId: CONTAINER_ID,
      networkMode: "none",
    });
  });

  const unsafeMetadata: readonly Readonly<{
    name: string;
    mutate(raw: RawInspection): void;
  }>[] = [
    {
      name: "added capability",
      mutate: (raw) => {
        raw.HostConfig.CapAdd = ["SYS_ADMIN"];
      },
    },
    {
      name: "device mapping",
      mutate: (raw) => {
        raw.HostConfig.Devices = [{ PathOnHost: "/dev/null" }];
      },
    },
    {
      name: "device request",
      mutate: (raw) => {
        raw.HostConfig.DeviceRequests = [{}];
      },
    },
    {
      name: "device cgroup rule",
      mutate: (raw) => {
        raw.HostConfig.DeviceCgroupRules = ["c 1:3 rwm"];
      },
    },
    {
      name: "host pid namespace",
      mutate: (raw) => {
        raw.HostConfig.PidMode = "host";
      },
    },
    {
      name: "host ipc namespace",
      mutate: (raw) => {
        raw.HostConfig.IpcMode = "host";
      },
    },
    {
      name: "host uts namespace",
      mutate: (raw) => {
        raw.HostConfig.UTSMode = "host";
      },
    },
    {
      name: "host user namespace",
      mutate: (raw) => {
        raw.HostConfig.UsernsMode = "host";
      },
    },
    {
      name: "host cgroup namespace",
      mutate: (raw) => {
        raw.HostConfig.CgroupnsMode = "host";
      },
    },
    {
      name: "restart policy",
      mutate: (raw) => {
        raw.HostConfig.RestartPolicy = { Name: "always", MaximumRetryCount: 0 };
      },
    },
    {
      name: "auto removal",
      mutate: (raw) => {
        raw.HostConfig.AutoRemove = true;
      },
    },
    {
      name: "unconfined seccomp",
      mutate: (raw) => {
        raw.HostConfig.SecurityOpt = ["no-new-privileges=true", "seccomp=unconfined"];
      },
    },
    {
      name: "unconfined apparmor",
      mutate: (raw) => {
        raw.HostConfig.SecurityOpt = ["apparmor=unconfined"];
      },
    },
    {
      name: "shared bind propagation",
      mutate: (raw) => {
        const mount = raw.Mounts[0];
        if (mount === undefined) throw new Error("missing fixture mount");
        mount.Propagation = "shared";
      },
    },
    {
      name: "active network endpoint",
      mutate: (raw) => {
        const networks = raw.NetworkSettings.Networks as Record<string, Record<string, unknown>>;
        const none = networks.none;
        if (none === undefined) throw new Error("missing fixture network");
        none.EndpointID = "active-endpoint";
      },
    },
    {
      name: "active network sandbox",
      mutate: (raw) => {
        raw.NetworkSettings.SandboxID = "active-sandbox";
      },
    },
    {
      name: "root-owned tmpfs",
      mutate: (raw) => {
        raw.HostConfig.Tmpfs = {
          "/run/app-factory": "rw,nosuid,nodev,noexec,size=67108864,mode=0700,uid=0,gid=0",
        };
      },
    },
    {
      name: "failed runtime state",
      mutate: (raw) => {
        raw.State.Error = "runtime failed";
      },
    },
  ];

  for (const scenario of unsafeMetadata) {
    it(`rejects ${scenario.name}`, async () => {
      const intent = fixtureIntent();
      const raw = cloneRaw(safeRawInspection(intent));
      scenario.mutate(raw);
      const fixture = await engineFixture(() => result(JSON.stringify(raw)));
      await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow();
    });
  }

  it("requires inspect to return the exact requested container ID", async () => {
    const intent = fixtureIntent();
    const fixture = await engineFixture(() =>
      result(JSON.stringify(safeRawInspection(intent, OTHER_CONTAINER_ID))),
    );
    await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow(/different container/u);
  });

  it("accepts exact empty label reconciliation output as absence", async () => {
    const fixture = await engineFixture(() => result(""));
    await expect(
      fixture.engine.findByLabels({ "com.example.z": "last", "com.example.a": "first" }),
    ).resolves.toBeNull();
    expect(fixture.calls.at(-1)?.args.slice(2)).toEqual([
      "ps",
      "-a",
      "--no-trunc",
      "--filter",
      "label=com.example.a=first",
      "--filter",
      "label=com.example.z=last",
      "--format",
      "{{.ID}}",
    ]);
  });

  it("accepts one exact LF-terminated label reconciliation ID", async () => {
    const intent = fixtureIntent();
    const fixture = await engineFixture((args) => {
      if (args[2] === "ps") return result(`${CONTAINER_ID}\n`);
      if (args.includes("inspect")) return result(JSON.stringify(safeRawInspection(intent)));
      throw new Error(`unexpected Docker fixture command: ${args.join(" ")}`);
    });
    await expect(fixture.engine.findByLabels(labelsForOciRun(intent))).resolves.toMatchObject({
      containerId: CONTAINER_ID,
    });
  });

  const unsafeLabelReconciliationResults: readonly Readonly<{
    name: string;
    response: DockerCommandResult;
  }>[] = [
    {
      name: "stderr diagnostic on empty stdout",
      response: (() => {
        const stderr = Buffer.from("warning\n", "utf8");
        return result("", { stderr, stderrObservedBytes: stderr.byteLength });
      })(),
    },
    { name: "incomplete stdout capture", response: result("", { stdoutObservedBytes: 1 }) },
    { name: "incomplete stderr capture", response: result("", { stderrObservedBytes: 1 }) },
    { name: "missing final LF", response: result(CONTAINER_ID) },
    { name: "malformed ID line", response: result("not-a-container-id\n") },
    { name: "whitespace-padded line", response: result(` ${CONTAINER_ID}\n`) },
    { name: "CRLF line", response: result(`${CONTAINER_ID}\r\n`) },
    { name: "empty interior line", response: result(`${CONTAINER_ID}\n\n`) },
    {
      name: "multiple exact IDs",
      response: result(`${CONTAINER_ID}\n${OTHER_CONTAINER_ID}\n`),
    },
  ];

  for (const scenario of unsafeLabelReconciliationResults) {
    it(`rejects unsafe label reconciliation output: ${scenario.name}`, async () => {
      const fixture = await engineFixture(() => scenario.response);
      await expect(fixture.engine.findByLabels({ "com.example.run": "one" })).rejects.toThrow(
        /label reconciliation|bounded process metadata/u,
      );
    });
  }

  it("removes the exact never-started container when create attestation fails", async () => {
    const intent = fixtureIntent();
    const unsafe = cloneRaw(safeRawInspection(intent));
    unsafe.HostConfig.CapAdd = ["SYS_ADMIN"];
    const fixture = await engineFixture((args) => {
      if (args.includes("image")) {
        return result(
          JSON.stringify([{ Id: intent.image.imageId, RepoDigests: [intent.image.reference] }]),
        );
      }
      if (args.includes("create")) return result(`${CONTAINER_ID}\n`);
      if (args.includes("inspect")) return result(JSON.stringify(unsafe));
      if (args.includes("rm")) return result(`${CONTAINER_ID}\n`);
      throw new Error(`unexpected Docker fixture command: ${args.join(" ")}`);
    });

    await expect(fixture.engine.create(intent)).rejects.toThrow(
      /exact pre-start container was removed/u,
    );
    expect(fixture.calls.at(-1)?.args.slice(-2)).toEqual(["rm", CONTAINER_ID]);
    expect(fixture.calls.some((call) => call.args.includes("start"))).toBe(false);
  });

  const unsafeInspectResults: readonly Readonly<{
    name: string;
    response: DockerCommandResult;
  }>[] = [
    {
      name: "timeout",
      response: result("", { timedOut: true, exitCode: null, signal: "SIGKILL" }),
    },
    {
      name: "signal",
      response: result("", { exitCode: null, signal: "SIGTERM" }),
    },
    {
      name: "stdout overflow",
      response: result("[]", { stdoutObservedBytes: MAX_CONTROL_OUTPUT + 1 }),
    },
    {
      name: "stderr overflow",
      response: result("[]", { stderrObservedBytes: MAX_CONTROL_OUTPUT + 1 }),
    },
    {
      name: "underreported output",
      response: result("[]", { stdoutObservedBytes: 0 }),
    },
  ];

  for (const scenario of unsafeInspectResults) {
    it(`fails closed on inspect ${scenario.name}`, async () => {
      const fixture = await engineFixture(() => scenario.response);
      await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow(
        /inspect failed closed|invalid bounded process metadata/u,
      );
    });
  }

  it("accepts only the exact bounded missing-container diagnostic for the requested ID", async () => {
    const fixture = await engineFixture(() => missingContainerResult());
    await expect(fixture.engine.inspect(CONTAINER_ID)).resolves.toBeNull();
  });

  const unsafeMissingContainerResults: readonly Readonly<{
    name: string;
    response: DockerCommandResult;
  }>[] = [
    {
      name: "wrong exit status",
      response: missingContainerResult(CONTAINER_ID, { exitCode: 2 }),
    },
    {
      name: "empty stdout",
      response: missingContainerResult(CONTAINER_ID, {
        stdout: Buffer.alloc(0),
        stdoutObservedBytes: 0,
      }),
    },
    {
      name: "extra stdout",
      response: missingContainerResult(CONTAINER_ID, {
        stdout: Buffer.from("[]\n"),
        stdoutObservedBytes: 3,
      }),
    },
    {
      name: "wrong container ID",
      response: missingContainerResult(OTHER_CONTAINER_ID),
    },
    {
      name: "client-prefixed diagnostic",
      response: (() => {
        const stderr = Buffer.from(`Error: No such container: ${CONTAINER_ID}\n`);
        return missingContainerResult(CONTAINER_ID, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
    {
      name: "mixed diagnostic",
      response: (() => {
        const stderr = Buffer.from(
          `warning\nError response from daemon: No such container: ${CONTAINER_ID}\n`,
        );
        return missingContainerResult(CONTAINER_ID, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
    {
      name: "trailing diagnostic",
      response: (() => {
        const stderr = Buffer.from(
          `Error response from daemon: No such container: ${CONTAINER_ID}\nretrying\n`,
        );
        return missingContainerResult(CONTAINER_ID, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
    {
      name: "incomplete diagnostic",
      response: (() => {
        const stderr = Buffer.from(
          `Error response from daemon: No such container: ${CONTAINER_ID}`,
        );
        return missingContainerResult(CONTAINER_ID, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
    {
      name: "truncated capture",
      response: (() => {
        const response = missingContainerResult();
        return { ...response, stderrObservedBytes: response.stderr.byteLength + 1 };
      })(),
    },
    {
      name: "other daemon error",
      response: (() => {
        const stderr = Buffer.from("Error response from daemon: permission denied\n");
        return missingContainerResult(CONTAINER_ID, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
  ];

  for (const scenario of unsafeMissingContainerResults) {
    it(`rejects missing-container ambiguity: ${scenario.name}`, async () => {
      const fixture = await engineFixture(() => scenario.response);
      await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow(/inspect failed closed/u);
    });
  }

  it("accepts only the expected SIGKILL provenance for bounded log overflow", async () => {
    const unsafe = await engineFixture(() =>
      result(Buffer.alloc(16), {
        exitCode: null,
        signal: "SIGTERM",
        stdoutObservedBytes: 17,
      }),
    );
    await expect(unsafe.engine.logs(CONTAINER_ID, 16)).rejects.toThrow(/logs failed closed/u);

    const bounded = await engineFixture(() =>
      result(Buffer.alloc(16), {
        exitCode: null,
        signal: "SIGKILL",
        stdoutObservedBytes: 17,
      }),
    );
    await expect(bounded.engine.logs(CONTAINER_ID, 16)).resolves.toMatchObject({
      stdoutObservedBytes: 17,
    });
  });

  it("derives a stable canonical engine identity bound to configuration and server ID", async () => {
    const fixture = await engineFixture(() => result("[]"), { executableAlias: true });
    const originalDigest = fixture.engine.engineIdentityDigest;
    expect(originalDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(fixture.calls.slice(0, 2).map(({ args }) => args.slice(-3))).toEqual([
      ["version", "--format", "{{.Client.Version}}"],
      ["info", "--format", "{{.ID}}|{{.ServerVersion}}|{{.OSType}}|{{.Architecture}}"],
    ]);

    const samePins = await fixture.createEngine();
    expect(samePins.engineIdentityDigest).toBe(originalDigest);
    await expect(fixture.engine.observeEngineIdentityDigest()).resolves.toBe(originalDigest);
    expect(fixture.engine.engineIdentityDigest).toBe(originalDigest);

    const otherServer = await fixture.createEngine(OTHER_DOCKER_SERVER_ID);
    expect(otherServer.engineIdentityDigest).not.toBe(originalDigest);

    const sameTargetOtherConfiguration = await fixture.createEngine(DOCKER_SERVER_ID, {
      executable: fixture.executable,
    });
    expect(sameTargetOtherConfiguration.engineIdentityDigest).not.toBe(originalDigest);

    rmSync(fixture.executable);
    writeFileSync(fixture.executable, "fixture docker executable\n");
    chmodSync(fixture.executable, 0o555);
    const replacedExecutable = await fixture.createEngine();
    expect(replacedExecutable.engineIdentityDigest).not.toBe(originalDigest);

    chmodSync(fixture.socketPath, 0o700);
    chmodSync(fixture.socketPath, 0o600);
    const changedSocketIdentity = await fixture.createEngine();
    expect(changedSocketIdentity.engineIdentityDigest).not.toBe(
      replacedExecutable.engineIdentityDigest,
    );
  });

  it("returns a fresh digest when the daemon changes without mutating the creation digest", async () => {
    const fixture = await engineFixture(() => result("[]"), {
      serverIds: [DOCKER_SERVER_ID, OTHER_DOCKER_SERVER_ID],
    });
    const creationDigest = fixture.engine.engineIdentityDigest;
    await expect(fixture.engine.observeEngineIdentityDigest()).resolves.not.toBe(creationDigest);
    expect(fixture.engine.engineIdentityDigest).toBe(creationDigest);
  });

  const malformedServerIdentities: readonly Readonly<{
    name: string;
    response: DockerCommandResult;
  }>[] = [
    { name: "empty value", response: result("\n") },
    { name: "missing final newline", response: result(DOCKER_SERVER_IDENTITY) },
    { name: "multiple lines", response: result(`${DOCKER_SERVER_IDENTITY}\nsecond\n`) },
    { name: "carriage return", response: result(`${DOCKER_SERVER_IDENTITY}\r\n`) },
    { name: "unsafe token", response: result("server id|29.5.2|linux|aarch64\n") },
    {
      name: "server version mismatch",
      response: result(`${DOCKER_SERVER_ID}|29.5.3|linux|aarch64\n`),
    },
    {
      name: "server OS mismatch",
      response: result(`${DOCKER_SERVER_ID}|29.5.2|windows|aarch64\n`),
    },
    {
      name: "server architecture mismatch",
      response: result(`${DOCKER_SERVER_ID}|29.5.2|linux|riscv64\n`),
    },
    {
      name: "oversized value",
      response: result(`${"a".repeat(129)}|29.5.2|linux|aarch64\n`),
    },
    {
      name: "stderr diagnostic",
      response: (() => {
        const stderr = Buffer.from("warning\n", "utf8");
        return result(`${DOCKER_SERVER_IDENTITY}\n`, {
          stderr,
          stderrObservedBytes: stderr.byteLength,
        });
      })(),
    },
    {
      name: "incomplete capture",
      response: result(`${DOCKER_SERVER_IDENTITY}\n`, {
        stdoutObservedBytes: Buffer.byteLength(`${DOCKER_SERVER_IDENTITY}\n`) + 1,
      }),
    },
  ];

  for (const scenario of malformedServerIdentities) {
    it(`rejects malformed Docker server identity: ${scenario.name}`, async () => {
      await expect(
        engineFixture(() => result("[]"), { serverIdentityResult: scenario.response }),
      ).rejects.toThrow(/Docker server (?:identity|ID)|bounded process metadata/u);
    });
  }

  it("revalidates executable metadata and digest before every invocation", async () => {
    const fixture = await engineFixture(() => result("[]"));
    chmodSync(fixture.executable, 0o755);
    writeFileSync(fixture.executable, "replacement executable\n");
    chmodSync(fixture.executable, 0o555);
    await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow(/executable identity/u);
    expect(fixture.calls).toHaveLength(2);
  });

  it("revalidates private socket identity before every invocation", async () => {
    const fixture = await engineFixture(() => result("[]"));
    chmodSync(fixture.socketPath, 0o660);
    await expect(fixture.engine.inspect(CONTAINER_ID)).rejects.toThrow(/socket no longer/u);
    expect(fixture.calls).toHaveLength(2);
  });

  it("resolves a Homebrew-style executable symlink once and invokes the pinned target", async () => {
    const intent = fixtureIntent();
    const fixture = await engineFixture(() => result(JSON.stringify(safeRawInspection(intent))), {
      executableAlias: true,
    });
    await fixture.engine.inspect(CONTAINER_ID);
    expect(fixture.calls.every((call) => call.executable === fixture.executable)).toBe(true);
  });

  it("rejects a socket alias and a hard-linked executable", async () => {
    await expect(engineFixture(() => result("[]"), { socketAlias: true })).rejects.toThrow(
      /canonical real path/u,
    );

    const directory = temporaryDirectory("fdh-");
    const executable = join(directory, "docker");
    const secondLink = join(directory, "docker-link");
    writeFileSync(executable, "hard-linked docker\n");
    chmodSync(executable, 0o555);
    linkSync(executable, secondLink);
    const socketPath = await privateSocket(directory);
    const digest = `sha256:${createHash("sha256").update("hard-linked docker\n").digest("hex")}`;
    await expect(
      DockerCliEngine.create(
        {
          executable,
          executableDigest: digest,
          host: `unix://${socketPath}`,
          expectedClientVersion: "29.6.1",
          expectedServerVersion: "29.5.2",
          expectedServerOs: "linux",
          expectedServerArchitecture: "arm64",
        },
        { invoke: async () => result("29.6.1|29.5.2|linux|arm64\n") },
      ),
    ).rejects.toThrow(/singly-linked/u);
  });
});
