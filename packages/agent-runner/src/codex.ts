import { spawn } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { AgentRunSpecV1Schema, type AgentRunSpecV1 } from "@app-factory/contracts";

export const VERIFIED_CODEX_CLI_VERSIONS = ["0.147.0-alpha.1.2"] as const;
export const CODEX_PREFLIGHT_TIMEOUT_MS = 5_000;
export const CODEX_PREFLIGHT_OUTPUT_LIMIT_BYTES = 64 * 1_024;

export const CODEX_DISABLED_FEATURES = [
  "apps",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "goals",
  "hooks",
  "image_generation",
  "in_app_browser",
  "multi_agent",
  "plugins",
  "plugin_sharing",
  "remote_plugin",
  "skill_mcp_dependency_install",
  "skill_search",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "workspace_dependencies",
] as const;

export const CODEX_SAFE_AGENT_ENVIRONMENT_NAMES = [
  "DEVELOPER_DIR",
  "LANG",
  "LC_ALL",
  "PATH",
  "SDKROOT",
  "SWIFT_DETERMINISTIC_HASHING",
  "TMPDIR",
  "TZ",
] as const;

const DEFAULT_DENIED_WORKSPACE_PATHS = [
  ".codex",
  "**/.env*",
  "**/*.mobileprovision",
  "**/*.p12",
  "**/*.pem",
] as const;

const SAFE_PERMISSION_PROFILE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const SAFE_FEATURE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const NORMALIZED_RELATIVE_PATH_PATTERN =
  /^(?!\/)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))(?!.*\/\/)(?!.*\/$)(?!.*\\)(?!.*\0).+$/;
const CONCRETE_RELATIVE_PATH_PATTERN = /^[^*?[\]{}]+$/;
const NAMESPACED_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$/;
const SENSITIVE_ENVIRONMENT_NAME_PATTERN = /(?:AUTH|COOKIE|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i;
const SENSITIVE_WORKSPACE_PATH_PATTERN =
  /(?:^|\/)(?:\.codex(?:\/.*)?|\.env(?:\..*)?|[^/]+\.(?:mobileprovision|p12|pem))$/i;
const AUTHENTICATION_ERROR_PATTERN =
  /(?:401\s+unauthorized|authentication|missing bearer|not logged in)/i;

interface TomlInlineTable {
  readonly [key: string]: TomlInlineValue;
}

type TomlInlineValue = boolean | number | string | readonly TomlInlineValue[] | TomlInlineTable;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeTomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function serializeTomlInline(value: TomlInlineValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeTomlInline).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${serializeTomlKey(key)}=${serializeTomlInline(child)}`)
    .join(",")}}`;
}

function assertAbsolutePath(value: string, label: string): void {
  if (!isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path: ${value}`);
  }
}

function assertConcreteRelativePath(value: string, label: string): void {
  if (
    !NORMALIZED_RELATIVE_PATH_PATTERN.test(value) ||
    !CONCRETE_RELATIVE_PATH_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a concrete normalized relative path: ${value}`);
  }
}

function assertInsideWorkspace(root: string, candidate: string, label: string): void {
  const child = relative(root, candidate);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new TypeError(`${label} resolves outside the working directory`);
  }
}

function validateWorkspacePath(
  realWorkspaceRoot: string,
  relativePath: string,
  label: string,
): void {
  assertConcreteRelativePath(relativePath, label);
  const segments = relativePath.split("/");
  let current = realWorkspaceRoot;

  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    assertInsideWorkspace(realWorkspaceRoot, resolve(current), label);

    if (!existsSync(current)) {
      if (index !== segments.length - 1) {
        throw new TypeError(`${label} has a missing parent component: ${relativePath}`);
      }
      return;
    }

    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new TypeError(`${label} contains a symbolic-link component: ${relativePath}`);
    }
    assertInsideWorkspace(realWorkspaceRoot, realpathSync.native(current), label);
  }
}

export function validateCodexWorkspaceScope(
  workingDirectory: string,
  authorizedWritePaths: readonly string[],
  readOnlyPaths: readonly string[],
): string {
  assertAbsolutePath(workingDirectory, "Codex working directory");
  if (!existsSync(workingDirectory)) {
    throw new TypeError(`Codex working directory does not exist: ${workingDirectory}`);
  }
  const rootStat = lstatSync(workingDirectory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError(`Codex working directory must be a real directory: ${workingDirectory}`);
  }

  const realWorkspaceRoot = realpathSync.native(workingDirectory);
  for (const path of authorizedWritePaths) {
    validateWorkspacePath(realWorkspaceRoot, path, "authorized write path");
  }
  for (const path of readOnlyPaths) {
    validateWorkspacePath(realWorkspaceRoot, path, "read-only path");
  }
  return realWorkspaceRoot;
}

function isSameOrDescendant(path: string, possibleAncestor: string): boolean {
  return path === possibleAncestor || path.startsWith(`${possibleAncestor}/`);
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains unexpected or missing fields`);
  }
}

function readBoundedString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new TypeError(`${label} must be a non-empty bounded string`);
  }
  return value;
}

export type CodexReportedDispositionV1 = "finished" | "blocked" | "failed";

export type CodexReportedBlockerV1 = Readonly<{
  kind: "authentication" | "clarification" | "approval" | "environment" | "policy";
  code: string;
  summary: string;
  requiredAction: string | null;
}>;

export type CodexReportedResultV1 = Readonly<{
  schemaVersion: 1;
  reportedDisposition: CodexReportedDispositionV1;
  summary: string;
  changedPaths: readonly string[];
  blocker: CodexReportedBlockerV1 | null;
}>;

export const CODEX_REPORTED_RESULT_JSON_SCHEMA_V1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "reportedDisposition", "summary", "changedPaths", "blocker"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    reportedDisposition: {
      type: "string",
      enum: ["finished", "blocked", "failed"],
    },
    summary: { type: "string", minLength: 1, maxLength: 4_000 },
    changedPaths: {
      type: "array",
      maxItems: 100,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 1_024,
        pattern: "^(?!/)(?!\\.{1,2}(?:/|$))(?!.*\\/\\.{1,2}(?:/|$))(?!.*//)(?!.*\\/$)(?!.*\\\\).+$",
      },
    },
    blocker: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "code", "summary", "requiredAction"],
          properties: {
            kind: {
              type: "string",
              enum: ["authentication", "clarification", "approval", "environment", "policy"],
            },
            code: {
              type: "string",
              minLength: 3,
              maxLength: 128,
              pattern: "^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$",
            },
            summary: { type: "string", minLength: 1, maxLength: 1_000 },
            requiredAction: {
              type: ["string", "null"],
              minLength: 1,
              maxLength: 2_000,
            },
          },
        },
      ],
    },
  },
} as const;

export function serializeCodexReportedResultJsonSchemaV1(): string {
  return `${JSON.stringify(CODEX_REPORTED_RESULT_JSON_SCHEMA_V1, null, 2)}\n`;
}

export function parseCodexReportedResultV1(contents: string): CodexReportedResultV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new TypeError("Codex final response is not valid JSON", { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new TypeError("Codex final response must be an object");
  }
  assertExactKeys(
    parsed,
    ["schemaVersion", "reportedDisposition", "summary", "changedPaths", "blocker"],
    "Codex final response",
  );

  if (parsed.schemaVersion !== 1) {
    throw new TypeError("Codex final response has an unsupported schema version");
  }
  if (
    parsed.reportedDisposition !== "finished" &&
    parsed.reportedDisposition !== "blocked" &&
    parsed.reportedDisposition !== "failed"
  ) {
    throw new TypeError("Codex final response has an invalid disposition");
  }
  const summary = readBoundedString(parsed.summary, "summary", 4_000);

  if (!Array.isArray(parsed.changedPaths) || parsed.changedPaths.length > 100) {
    throw new TypeError("changedPaths must be a bounded array");
  }
  const changedPaths = parsed.changedPaths.map((path, index) => {
    if (typeof path !== "string" || path.length > 1_024) {
      throw new TypeError(`changedPaths[${index}] must be a bounded string`);
    }
    assertConcreteRelativePath(path, `changedPaths[${index}]`);
    return path;
  });
  if (new Set(changedPaths).size !== changedPaths.length) {
    throw new TypeError("changedPaths must not contain duplicates");
  }

  let blocker: CodexReportedBlockerV1 | null = null;
  if (parsed.blocker !== null) {
    if (!isRecord(parsed.blocker)) {
      throw new TypeError("blocker must be an object or null");
    }
    assertExactKeys(parsed.blocker, ["kind", "code", "summary", "requiredAction"], "blocker");
    if (
      parsed.blocker.kind !== "authentication" &&
      parsed.blocker.kind !== "clarification" &&
      parsed.blocker.kind !== "approval" &&
      parsed.blocker.kind !== "environment" &&
      parsed.blocker.kind !== "policy"
    ) {
      throw new TypeError("blocker.kind is invalid");
    }
    if (
      typeof parsed.blocker.code !== "string" ||
      !NAMESPACED_CODE_PATTERN.test(parsed.blocker.code)
    ) {
      throw new TypeError("blocker.code must be a namespaced code");
    }
    const blockerSummary = readBoundedString(parsed.blocker.summary, "blocker.summary", 1_000);
    const requiredAction = parsed.blocker.requiredAction;
    if (
      requiredAction !== null &&
      (typeof requiredAction !== "string" ||
        requiredAction.length < 1 ||
        requiredAction.length > 2_000)
    ) {
      throw new TypeError("blocker.requiredAction is invalid");
    }

    blocker = {
      kind: parsed.blocker.kind,
      code: parsed.blocker.code,
      summary: blockerSummary,
      requiredAction,
    };
  }

  if (parsed.reportedDisposition === "blocked" && blocker === null) {
    throw new TypeError("A blocked Codex result requires a blocker");
  }
  if (parsed.reportedDisposition !== "blocked" && blocker !== null) {
    throw new TypeError("Only a blocked Codex result may contain a blocker");
  }

  return {
    schemaVersion: 1,
    reportedDisposition: parsed.reportedDisposition,
    summary,
    changedPaths,
    blocker,
  };
}

export type CodexInvocation = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
  stdin: string;
  stdoutProtocol: "jsonl";
}>;

export type BuildCodexInvocationOptions = Readonly<{
  executable: string;
  model: string;
  codexHome: string;
  outputSchemaPath: string;
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  readOnlyPaths?: readonly string[];
  permissionProfileName?: string;
  disabledFeatures?: readonly string[];
}>;

function buildControllerEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  allowlist: readonly string[],
  codexHome: string,
): Readonly<Record<string, string>> {
  const safeNames = new Set<string>(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
  const environment: Record<string, string> = {};
  for (const name of [...new Set(allowlist)].sort()) {
    if (!safeNames.has(name)) {
      throw new Error(`Environment variable is not in the adapter-owned safe allowlist: ${name}`);
    }
    if (SENSITIVE_ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`Refusing to expose sensitive environment variable: ${name}`);
    }
    const value = source[name];
    if (value !== undefined) {
      if (value.includes("\0")) {
        throw new Error(`Environment variable ${name} contains a null byte`);
      }
      environment[name] = value;
    }
  }

  environment.CODEX_HOME = codexHome;
  environment.NO_COLOR = "1";
  environment.RUST_LOG = "error";
  environment.TERM = "dumb";
  return environment;
}

function buildPermissionProfile(
  authorizedWritePaths: readonly string[],
  readOnlyPaths: readonly string[],
): Readonly<Record<string, TomlInlineValue>> {
  const workspaceRules: Record<string, TomlInlineValue> = {
    ".": "read",
    ".git": "read",
  };

  const normalizedReadOnlyPaths = [...new Set(readOnlyPaths)].sort();
  for (const path of normalizedReadOnlyPaths) {
    assertConcreteRelativePath(path, "read-only path");
    workspaceRules[path] = "read";
  }

  for (const path of [...new Set(authorizedWritePaths)].sort()) {
    assertConcreteRelativePath(path, "authorized write path");
    if (SENSITIVE_WORKSPACE_PATH_PATTERN.test(path)) {
      throw new Error(`Sensitive path cannot be authorized for agent writes: ${path}`);
    }
    const overlappingReadOnlyPath = normalizedReadOnlyPaths.find(
      (readOnlyPath) =>
        isSameOrDescendant(path, readOnlyPath) || isSameOrDescendant(readOnlyPath, path),
    );
    if (overlappingReadOnlyPath !== undefined) {
      throw new Error(
        `Authorized write path ${path} overlaps read-only path ${overlappingReadOnlyPath}`,
      );
    }
    workspaceRules[path] = "write";
  }

  for (const path of DEFAULT_DENIED_WORKSPACE_PATHS) {
    workspaceRules[path] = "deny";
  }

  return {
    description: "App Factory attempt workspace only",
    extends: ":workspace",
    filesystem: {
      ":minimal": "read",
      ":root": "deny",
      ":slash_tmp": "deny",
      ":tmpdir": "write",
      ":workspace_roots": workspaceRules,
    },
    network: { enabled: false },
  };
}

export function buildCodexInvocation(
  untrustedSpec: AgentRunSpecV1,
  options: BuildCodexInvocationOptions,
): CodexInvocation {
  const spec = AgentRunSpecV1Schema.parse(untrustedSpec);
  assertAbsolutePath(options.executable, "Codex executable");
  assertAbsolutePath(options.codexHome, "Codex home");
  assertAbsolutePath(options.outputSchemaPath, "Codex output schema path");
  if (
    options.model.length < 1 ||
    options.model.length > 200 ||
    options.model.trim() !== options.model ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u.test(options.model)
  ) {
    throw new TypeError("Codex model must be an explicit bounded portable identifier");
  }

  const permissionProfileName = options.permissionProfileName ?? "factory_agent";
  if (!SAFE_PERMISSION_PROFILE_NAME_PATTERN.test(permissionProfileName)) {
    throw new TypeError(`Codex permission profile name is invalid: ${permissionProfileName}`);
  }

  const disabledFeatures = [...new Set(options.disabledFeatures ?? CODEX_DISABLED_FEATURES)].sort();
  for (const feature of disabledFeatures) {
    if (!SAFE_FEATURE_NAME_PATTERN.test(feature)) {
      throw new TypeError(`Codex feature name is invalid: ${feature}`);
    }
  }

  const readOnlyPaths = options.readOnlyPaths ?? [];
  const workingDirectory = validateCodexWorkspaceScope(
    spec.workingDirectory,
    spec.authorizedWritePaths,
    readOnlyPaths,
  );
  const permissionProfile = buildPermissionProfile(spec.authorizedWritePaths, readOnlyPaths);
  const shellEnvironmentPolicy = {
    filters: {
      "*_KEY": "exclude",
      "*_SECRET": "exclude",
      "*_TOKEN": "exclude",
      "CODEX_*": "exclude",
      "GH_*": "exclude",
      "GITHUB_*": "exclude",
      "JIRA_*": "exclude",
      "OPENAI_*": "exclude",
    },
    ignore_default_excludes: false,
    inherit: "core",
  } as const satisfies Readonly<Record<string, TomlInlineValue>>;
  const projectTrust = {
    [workingDirectory]: { trust_level: "untrusted" },
  } as const satisfies Readonly<Record<string, TomlInlineValue>>;

  const args: string[] = [
    "--strict-config",
    "--ask-for-approval",
    "never",
    "--cd",
    workingDirectory,
    "--model",
    options.model,
  ];
  for (const feature of disabledFeatures) {
    args.push("--disable", feature);
  }
  args.push(
    "-c",
    `default_permissions=${serializeTomlInline(permissionProfileName)}`,
    "-c",
    `permissions.${permissionProfileName}=${serializeTomlInline(permissionProfile)}`,
    "-c",
    `projects=${serializeTomlInline(projectTrust)}`,
    "-c",
    `shell_environment_policy=${serializeTomlInline(shellEnvironmentPolicy)}`,
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--color",
    "never",
    "--output-schema",
    options.outputSchemaPath,
    "-",
  );

  return {
    executable: options.executable,
    args,
    cwd: workingDirectory,
    environment: buildControllerEnvironment(
      options.sourceEnvironment ?? process.env,
      spec.environmentAllowlist,
      options.codexHome,
    ),
    stdin: spec.instruction,
    stdoutProtocol: "jsonl",
  };
}

export type CodexProbeRequest = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
}>;

export type CodexProbeResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  spawnError: string | null;
}>;

export type CodexProbe = (request: CodexProbeRequest) => Promise<CodexProbeResult>;

export async function runCodexProbe(request: CodexProbeRequest): Promise<CodexProbeResult> {
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputLimitExceeded = false;
    let spawnError: string | null = null;
    let settled = false;

    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: { ...request.environment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        outputLimitExceeded,
        spawnError,
      });
    };

    const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const current = stream === "stdout" ? stdout : stderr;
      const combined = `${current}${chunk.toString("utf8")}`;
      if (Buffer.byteLength(combined, "utf8") > request.maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      if (stream === "stdout") stdout = combined;
      else stderr = combined;
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => {
      spawnError = error.message;
    });
    child.once("close", finish);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, request.timeoutMs);
    timer.unref();
  });
}

export type CodexPreflightResult =
  | Readonly<{
      ready: true;
      executable: string;
      version: string;
      authConfigured: true;
    }>
  | Readonly<{
      ready: false;
      reason:
        | "unavailable"
        | "timeout"
        | "output-limit"
        | "invalid-version"
        | "unsupported-version"
        | "authentication"
        | "probe-failed";
      summary: string;
      version: string | null;
    }>;

export type PreflightCodexOptions = Readonly<{
  executable: string;
  cwd: string;
  environment: Readonly<Record<string, string>>;
  supportedVersions?: readonly string[];
  timeoutMs?: number;
  probe?: CodexProbe;
}>;

function classifyProbeFailure(
  result: CodexProbeResult,
  phase: string,
  version: string | null,
): CodexPreflightResult | null {
  if (result.timedOut) {
    return {
      ready: false,
      reason: "timeout",
      summary: `Codex ${phase} probe timed out`,
      version,
    };
  }
  if (result.outputLimitExceeded) {
    return {
      ready: false,
      reason: "output-limit",
      summary: `Codex ${phase} probe exceeded its output limit`,
      version,
    };
  }
  if (result.spawnError !== null) {
    return {
      ready: false,
      reason: "unavailable",
      summary: `Codex ${phase} probe could not start: ${result.spawnError}`,
      version,
    };
  }
  return null;
}

export async function preflightCodex(
  options: PreflightCodexOptions,
): Promise<CodexPreflightResult> {
  assertAbsolutePath(options.executable, "Codex executable");
  assertAbsolutePath(options.cwd, "Codex preflight working directory");
  const probe = options.probe ?? runCodexProbe;
  const timeoutMs = options.timeoutMs ?? CODEX_PREFLIGHT_TIMEOUT_MS;
  const supportedVersions = options.supportedVersions ?? VERIFIED_CODEX_CLI_VERSIONS;
  const baseRequest = {
    executable: options.executable,
    cwd: options.cwd,
    environment: options.environment,
    timeoutMs,
    maxOutputBytes: CODEX_PREFLIGHT_OUTPUT_LIMIT_BYTES,
  } as const;

  try {
    const versionProbe = await probe({ ...baseRequest, args: ["--version"] });
    const versionFailure = classifyProbeFailure(versionProbe, "version", null);
    if (versionFailure !== null) return versionFailure;
    if (versionProbe.exitCode !== 0 || versionProbe.signal !== null) {
      return {
        ready: false,
        reason: "probe-failed",
        summary: "Codex version probe exited unsuccessfully",
        version: null,
      };
    }

    const versionMatch = /^codex-cli\s+(\S+)\s*$/.exec(versionProbe.stdout.trim());
    if (versionMatch === null || versionMatch[1] === undefined) {
      return {
        ready: false,
        reason: "invalid-version",
        summary: "Codex version probe returned an unrecognized value",
        version: null,
      };
    }
    const version = versionMatch[1];
    if (!supportedVersions.includes(version)) {
      return {
        ready: false,
        reason: "unsupported-version",
        summary: `Codex ${version} has not passed Factory conformance`,
        version,
      };
    }

    const authProbe = await probe({
      ...baseRequest,
      args: ["login", "status"],
    });
    const authFailure = classifyProbeFailure(authProbe, "authentication", version);
    if (authFailure !== null) return authFailure;
    if (authProbe.exitCode !== 0 || authProbe.signal !== null) {
      return {
        ready: false,
        reason: "authentication",
        summary: "Codex authentication is not configured",
        version,
      };
    }

    return {
      ready: true,
      executable: options.executable,
      version,
      authConfigured: true,
    };
  } catch (error) {
    return {
      ready: false,
      reason: "probe-failed",
      summary: `Codex preflight failed: ${error instanceof Error ? error.message : String(error)}`,
      version: null,
    };
  }
}

export type CodexTerminationOrigin = "none" | "cancelled" | "timed-out" | "output-overflow";

export type CodexProcessCapture = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  terminationOrigin: CodexTerminationOrigin;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}>;

export type CodexProcessClassification =
  | Readonly<{ kind: "process-completed"; reported: CodexReportedResultV1 }>
  | Readonly<{ kind: "blocked-auth"; reason: string }>
  | Readonly<{ kind: "process-failed"; reason: string }>
  | Readonly<{ kind: "cancelled"; reason: string }>
  | Readonly<{ kind: "timed-out"; reason: string }>
  | Readonly<{ kind: "protocol-error"; reason: string }>;

export type CodexProtocolLimits = Readonly<{
  maxStdoutBytes: number;
  maxLineBytes: number;
  maxEventCount: number;
}>;

export const DEFAULT_CODEX_PROTOCOL_LIMITS: CodexProtocolLimits = {
  maxStdoutBytes: 20_000_000,
  maxLineBytes: 1_000_000,
  maxEventCount: 50_000,
};

export function classifyCodexProcess(
  capture: CodexProcessCapture,
  limits: CodexProtocolLimits = DEFAULT_CODEX_PROTOCOL_LIMITS,
): CodexProcessClassification {
  if (capture.terminationOrigin === "cancelled") {
    return { kind: "cancelled", reason: "Factory cancellation terminated Codex" };
  }
  if (capture.terminationOrigin === "timed-out") {
    return { kind: "timed-out", reason: "Factory deadline terminated Codex" };
  }
  if (capture.terminationOrigin === "output-overflow") {
    return { kind: "protocol-error", reason: "Codex output exceeded its capture limit" };
  }
  if (Buffer.byteLength(capture.stdout, "utf8") > limits.maxStdoutBytes) {
    return { kind: "protocol-error", reason: "Codex stdout exceeded its byte limit" };
  }

  const lines = capture.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0 || lines.length > limits.maxEventCount) {
    return {
      kind: "protocol-error",
      reason: "Codex emitted no events or exceeded its event limit",
    };
  }

  let threadStarted = 0;
  let turnStarted = 0;
  let terminalType: "turn.completed" | "turn.failed" | null = null;
  let terminalIndex = -1;
  let terminalFailureMessage = "";
  let finalAgentMessage: string | null = null;

  for (const [index, line] of lines.entries()) {
    if (Buffer.byteLength(line, "utf8") > limits.maxLineBytes) {
      return { kind: "protocol-error", reason: "Codex emitted an oversized JSONL line" };
    }

    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      return { kind: "protocol-error", reason: "Codex emitted malformed JSONL" };
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      return { kind: "protocol-error", reason: "Codex emitted an invalid event envelope" };
    }

    if (event.type === "thread.started") threadStarted += 1;
    if (event.type === "turn.started") turnStarted += 1;
    if (event.type === "turn.completed" || event.type === "turn.failed") {
      if (terminalType !== null) {
        return { kind: "protocol-error", reason: "Codex emitted multiple terminal events" };
      }
      terminalType = event.type;
      terminalIndex = index;
      if (
        event.type === "turn.failed" &&
        isRecord(event.error) &&
        typeof event.error.message === "string"
      ) {
        terminalFailureMessage = event.error.message;
      }
    }
    if (
      event.type === "item.completed" &&
      isRecord(event.item) &&
      event.item.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      finalAgentMessage = event.item.text;
    }
  }

  if (threadStarted !== 1 || turnStarted < 1) {
    return {
      kind: "protocol-error",
      reason: "Codex did not emit one thread start and at least one turn start",
    };
  }
  if (terminalType === null || terminalIndex !== lines.length - 1) {
    return {
      kind: "protocol-error",
      reason: "Codex did not end with exactly one terminal event",
    };
  }
  if (terminalType === "turn.failed") {
    if (AUTHENTICATION_ERROR_PATTERN.test(terminalFailureMessage)) {
      return {
        kind: "blocked-auth",
        reason: "Codex reported an authentication failure",
      };
    }
    return {
      kind: "process-failed",
      reason: terminalFailureMessage || "Codex turn failed",
    };
  }
  if (capture.exitCode !== 0 || capture.signal !== null) {
    return {
      kind: "process-failed",
      reason: `Codex process exited with code ${String(capture.exitCode)} and signal ${String(capture.signal)}`,
    };
  }
  if (finalAgentMessage === null) {
    return {
      kind: "protocol-error",
      reason: "Codex completed without a final agent message",
    };
  }

  try {
    return {
      kind: "process-completed",
      reported: parseCodexReportedResultV1(finalAgentMessage),
    };
  } catch (error) {
    return {
      kind: "protocol-error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
