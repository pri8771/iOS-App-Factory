import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentRunSpecV1Schema, type AgentRunSpecV1 } from "@app-factory/contracts";

import {
  CODEX_REPORTED_RESULT_JSON_SCHEMA_V1,
  VERIFIED_CODEX_CLI_VERSIONS,
  buildCodexInvocation,
  classifyCodexProcess,
  parseCodexReportedResultV1,
  preflightCodex,
  serializeCodexReportedResultJsonSchemaV1,
  type CodexProbe,
  type CodexProbeResult,
  type CodexReportedResultV1,
} from "../src/codex.js";

const SHA256 = `sha256:${"a".repeat(64)}`;
const temporaryDirectories: string[] = [];

function makeWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "app-factory-codex-test-"));
  temporaryDirectories.push(workspace);
  mkdirSync(join(workspace, "Sources", "App"), { recursive: true });
  mkdirSync(join(workspace, "Tests"), { recursive: true });
  writeFileSync(join(workspace, "Sources", "App", "Protected.swift"), "protected\n");
  return realpathSync.native(workspace);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function makeRunSpec(overrides: Partial<AgentRunSpecV1> = {}): AgentRunSpecV1 {
  return AgentRunSpecV1Schema.parse({
    schemaVersion: 1,
    runId: "00000000-0000-4000-8000-000000000001",
    attemptId: "00000000-0000-4000-8000-000000000002",
    stepId: "00000000-0000-4000-8000-000000000003",
    fence: 1,
    adapterId: "openai.codex",
    taskSpecDigest: SHA256,
    workingDirectory: "/private/tmp/app-factory-attempt",
    instruction: "Make the bounded source change.",
    authorizedWritePaths: ["Sources/App/Feature.swift"],
    environmentAllowlist: ["PATH", "TMPDIR"],
    limits: {
      timeoutMs: 1_200_000,
      terminationGraceMs: 5_000,
      maxTurns: 1,
      maxEventCount: 50_000,
      maxStdoutBytes: 20_000_000,
      maxStderrBytes: 5_000_000,
    },
    ...overrides,
  });
}

function successfulProbe(overrides: Partial<CodexProbeResult> = {}): CodexProbeResult {
  return {
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    outputLimitExceeded: false,
    spawnError: null,
    ...overrides,
  };
}

function reportedResult(overrides: Partial<CodexReportedResultV1> = {}): CodexReportedResultV1 {
  return {
    schemaVersion: 1,
    reportedDisposition: "finished",
    summary: "The requested edit is complete.",
    changedPaths: ["Sources/App/Feature.swift"],
    blocker: null,
    ...overrides,
  };
}

function completedJsonl(result: CodexReportedResultV1): string {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "item-1",
        type: "agent_message",
        text: JSON.stringify(result),
      },
    }),
    JSON.stringify({ type: "turn.completed", usage: {} }),
    "",
  ].join("\n");
}

describe("Codex invocation policy", () => {
  it("builds a no-TTY stdin invocation with a least-privilege permission profile", () => {
    const workingDirectory = makeWorkspace();
    const invocation = buildCodexInvocation(makeRunSpec({ workingDirectory }), {
      executable: "/Applications/ChatGPT.app/Contents/Resources/codex",
      codexHome: "/private/tmp/app-factory-codex-home",
      outputSchemaPath: "/private/tmp/app-factory-schema.json",
      readOnlyPaths: ["Sources/App/Protected.swift", "Tests"],
      sourceEnvironment: {
        PATH: "/usr/bin:/bin",
        TMPDIR: "/private/tmp/attempt-tmp",
        OPENAI_API_KEY: "must-not-leak",
        UNRELATED: "must-not-leak",
      },
    });

    expect(invocation.executable).toBe("/Applications/ChatGPT.app/Contents/Resources/codex");
    expect(invocation.cwd).toBe(workingDirectory);
    expect(invocation.stdin).toBe("Make the bounded source change.");
    expect(invocation.args).not.toContain(invocation.stdin);
    expect(invocation.args).not.toContain("--sandbox");
    expect(invocation.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(invocation.args.at(-1)).toBe("-");
    expect(invocation.args).toContain("--json");
    expect(invocation.args).toContain("--output-schema");
    expect(invocation.args).toContain("--ignore-user-config");
    expect(invocation.args).toContain("--ignore-rules");

    const configOverrides = invocation.args.filter((argument) => argument.includes("="));
    expect(configOverrides.join("\n")).toContain('":root"="deny"');
    expect(configOverrides.join("\n")).toContain('"."="read"');
    expect(configOverrides.join("\n")).toContain('"Sources/App/Feature.swift"="write"');
    expect(configOverrides.join("\n")).toContain('"Sources/App/Protected.swift"="read"');
    expect(configOverrides.join("\n")).toContain('Tests="read"');
    expect(configOverrides.join("\n")).toContain("enabled=false");
    expect(configOverrides.join("\n")).toContain('trust_level="untrusted"');

    expect(invocation.environment).toEqual({
      CODEX_HOME: "/private/tmp/app-factory-codex-home",
      NO_COLOR: "1",
      PATH: "/usr/bin:/bin",
      RUST_LOG: "error",
      TERM: "dumb",
      TMPDIR: "/private/tmp/attempt-tmp",
    });
    expect(JSON.stringify(invocation)).not.toContain("must-not-leak");
  });

  it("rejects sensitive or protected write scopes before launching Codex", () => {
    const workingDirectory = makeWorkspace();
    expect(() =>
      buildCodexInvocation(makeRunSpec({ workingDirectory, authorizedWritePaths: [".env"] }), {
        executable: "/usr/local/bin/codex",
        codexHome: "/private/tmp/codex-home",
        outputSchemaPath: "/private/tmp/schema.json",
      }),
    ).toThrow(/Sensitive path/);

    expect(() =>
      buildCodexInvocation(
        makeRunSpec({ workingDirectory, authorizedWritePaths: ["Tests/Fixtures"] }),
        {
          executable: "/usr/local/bin/codex",
          codexHome: "/private/tmp/codex-home",
          outputSchemaPath: "/private/tmp/schema.json",
          readOnlyPaths: ["Tests"],
        },
      ),
    ).toThrow(/overlaps read-only path/);

    expect(() =>
      buildCodexInvocation(
        makeRunSpec({ workingDirectory, authorizedWritePaths: ["Sources/App"] }),
        {
          executable: "/usr/local/bin/codex",
          codexHome: "/private/tmp/codex-home",
          outputSchemaPath: "/private/tmp/schema.json",
          readOnlyPaths: ["Sources/App/Protected.swift"],
        },
      ),
    ).toThrow(/overlaps read-only path/);
  });

  it("rejects every environment name outside the adapter-owned safe allowlist", () => {
    const workingDirectory = makeWorkspace();
    expect(() =>
      buildCodexInvocation(
        makeRunSpec({ workingDirectory, environmentAllowlist: ["PATH", "NODE_OPTIONS"] }),
        {
          executable: "/usr/local/bin/codex",
          codexHome: "/private/tmp/codex-home",
          outputSchemaPath: "/private/tmp/schema.json",
          sourceEnvironment: {
            PATH: "/usr/bin",
            NODE_OPTIONS: "--require=/tmp/inject.js",
          },
        },
      ),
    ).toThrow(/adapter-owned safe allowlist/);
  });

  it("rejects authorized paths with symbolic-link components", () => {
    const workingDirectory = makeWorkspace();
    const outsideDirectory = mkdtempSync(join(tmpdir(), "app-factory-codex-outside-"));
    temporaryDirectories.push(outsideDirectory);
    writeFileSync(join(outsideDirectory, "escaped.swift"), "outside\n");
    symlinkSync(outsideDirectory, join(workingDirectory, "Sources", "Escape"));

    expect(() =>
      buildCodexInvocation(
        makeRunSpec({
          workingDirectory,
          authorizedWritePaths: ["Sources/Escape/escaped.swift"],
        }),
        {
          executable: "/usr/local/bin/codex",
          codexHome: "/private/tmp/codex-home",
          outputSchemaPath: "/private/tmp/schema.json",
        },
      ),
    ).toThrow(/symbolic-link component/);
  });
});

describe("Codex preflight", () => {
  it("checks the tested CLI version before checking saved authentication", async () => {
    const calls: string[][] = [];
    const probe: CodexProbe = vi.fn(async (request) => {
      calls.push([...request.args]);
      return request.args[0] === "--version"
        ? successfulProbe({
            stdout: `codex-cli ${VERIFIED_CODEX_CLI_VERSIONS[0]}\n`,
          })
        : successfulProbe({ stdout: "Logged in using ChatGPT\n" });
    });

    await expect(
      preflightCodex({
        executable: "/usr/local/bin/codex",
        cwd: "/private/tmp/app-factory-attempt",
        environment: { CODEX_HOME: "/private/tmp/codex-home" },
        probe,
      }),
    ).resolves.toEqual({
      ready: true,
      executable: "/usr/local/bin/codex",
      version: VERIFIED_CODEX_CLI_VERSIONS[0],
      authConfigured: true,
    });
    expect(calls).toEqual([["--version"], ["login", "status"]]);
  });

  it("fails closed for an untested Codex version", async () => {
    const probe: CodexProbe = async () => successfulProbe({ stdout: "codex-cli 999.0.0\n" });

    const result = await preflightCodex({
      executable: "/usr/local/bin/codex",
      cwd: "/private/tmp/app-factory-attempt",
      environment: {},
      probe,
    });
    expect(result).toMatchObject({
      ready: false,
      reason: "unsupported-version",
      version: "999.0.0",
    });
  });

  it("maps missing authentication and timeouts to explicit blockers", async () => {
    const missingAuthProbe: CodexProbe = async (request) =>
      request.args[0] === "--version"
        ? successfulProbe({
            stdout: `codex-cli ${VERIFIED_CODEX_CLI_VERSIONS[0]}\n`,
          })
        : successfulProbe({ exitCode: 1 });
    const missingAuth = await preflightCodex({
      executable: "/usr/local/bin/codex",
      cwd: "/private/tmp/app-factory-attempt",
      environment: {},
      probe: missingAuthProbe,
    });
    expect(missingAuth).toMatchObject({
      ready: false,
      reason: "authentication",
    });

    const timeoutProbe: CodexProbe = async () =>
      successfulProbe({ exitCode: null, signal: "SIGKILL", timedOut: true });
    const timeout = await preflightCodex({
      executable: "/usr/local/bin/codex",
      cwd: "/private/tmp/app-factory-attempt",
      environment: {},
      probe: timeoutProbe,
    });
    expect(timeout).toMatchObject({ ready: false, reason: "timeout" });
  });
});

describe("Codex strict reported result", () => {
  it("serializes a strict JSON Schema and parses a valid result", () => {
    const serialized = serializeCodexReportedResultJsonSchemaV1();
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(CODEX_REPORTED_RESULT_JSON_SCHEMA_V1);
    expect(parseCodexReportedResultV1(JSON.stringify(reportedResult()))).toEqual(reportedResult());
  });

  it("rejects unknown fields, duplicate paths, and incoherent blockers", () => {
    expect(() =>
      parseCodexReportedResultV1(JSON.stringify({ ...reportedResult(), unexpected: true })),
    ).toThrow(/unexpected or missing fields/);

    expect(() =>
      parseCodexReportedResultV1(
        JSON.stringify(
          reportedResult({
            changedPaths: ["Sources/A.swift", "Sources/A.swift"],
          }),
        ),
      ),
    ).toThrow(/duplicates/);

    expect(() =>
      parseCodexReportedResultV1(
        JSON.stringify(reportedResult({ reportedDisposition: "blocked" })),
      ),
    ).toThrow(/requires a blocker/);
  });
});

describe("Codex JSONL process classification", () => {
  it("classifies schema-valid exit zero as process completion, not verified success", () => {
    const result = classifyCodexProcess({
      exitCode: 0,
      signal: null,
      terminationOrigin: "none",
      stdout: completedJsonl(reportedResult()),
      stderr: "diagnostics are not protocol events",
    });
    expect(result).toMatchObject({
      kind: "process-completed",
      reported: { reportedDisposition: "finished" },
    });
    expect(JSON.stringify(result)).not.toContain('"kind":"succeeded"');
  });

  it("keeps a structured blocker distinct from process success", () => {
    const blocked = reportedResult({
      reportedDisposition: "blocked",
      summary: "A product decision is required.",
      changedPaths: [],
      blocker: {
        kind: "clarification",
        code: "product.decision-needed",
        summary: "Choose the intended behavior.",
        requiredAction: "Select option A or B.",
      },
    });
    const result = classifyCodexProcess({
      exitCode: 0,
      signal: null,
      terminationOrigin: "none",
      stdout: completedJsonl(blocked),
      stderr: "",
    });
    expect(result).toMatchObject({
      kind: "process-completed",
      reported: { reportedDisposition: "blocked" },
    });
  });

  it("rejects exit-zero blocker prose that bypasses the strict schema", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item-1", type: "agent_message", text: "Blocked." },
      }),
      JSON.stringify({ type: "turn.completed", usage: {} }),
      "",
    ].join("\n");
    expect(
      classifyCodexProcess({
        exitCode: 0,
        signal: null,
        terminationOrigin: "none",
        stdout,
        stderr: "",
      }),
    ).toMatchObject({ kind: "protocol-error" });
  });

  it("maps terminal authentication failures without trusting stderr", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "turn.failed",
        error: { message: "401 Unauthorized: Missing bearer authentication" },
      }),
      "",
    ].join("\n");
    expect(
      classifyCodexProcess({
        exitCode: 1,
        signal: null,
        terminationOrigin: "none",
        stdout,
        stderr: "untrusted diagnostic text",
      }),
    ).toMatchObject({ kind: "blocked-auth" });
  });

  it("gives Factory timeout and cancellation precedence over process output", () => {
    const stdout = completedJsonl(reportedResult());
    expect(
      classifyCodexProcess({
        exitCode: 0,
        signal: null,
        terminationOrigin: "cancelled",
        stdout,
        stderr: "",
      }),
    ).toMatchObject({ kind: "cancelled" });
    expect(
      classifyCodexProcess({
        exitCode: 0,
        signal: null,
        terminationOrigin: "timed-out",
        stdout,
        stderr: "",
      }),
    ).toMatchObject({ kind: "timed-out" });
  });

  it("fails closed on malformed, oversized, or non-terminal JSONL", () => {
    const baseCapture = {
      exitCode: 0,
      signal: null,
      terminationOrigin: "none" as const,
      stderr: "",
    };
    expect(classifyCodexProcess({ ...baseCapture, stdout: "not-json\n" })).toMatchObject({
      kind: "protocol-error",
    });
    expect(
      classifyCodexProcess(
        { ...baseCapture, stdout: completedJsonl(reportedResult()) },
        { maxStdoutBytes: 1, maxLineBytes: 1_000_000, maxEventCount: 50_000 },
      ),
    ).toMatchObject({ kind: "protocol-error" });
    expect(
      classifyCodexProcess({
        ...baseCapture,
        stdout: `${JSON.stringify({ type: "thread.started" })}\n${JSON.stringify({ type: "turn.started" })}\n`,
      }),
    ).toMatchObject({ kind: "protocol-error" });
  });
});
