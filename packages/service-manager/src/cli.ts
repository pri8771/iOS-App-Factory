#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  attestLaunchAgentProgramFiles,
  buildLaunchAgentPlan,
  decideLaunchAgentInstallation,
  inspectLaunchAgentFile,
  queryLaunchAgentStatus,
  type LaunchAgentPlanV1,
  type LaunchAgentRuntimeStatusV1,
} from "./index.js";

export type ServiceCliOutputMode = "human" | "json";

export type ParsedServiceCliInvocation = Readonly<{
  outputMode: ServiceCliOutputMode;
  command: Readonly<{
    kind: "service.plan" | "service.status";
    configFile: string;
  }>;
}>;

export type ServiceCliIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

export type ServiceCliDependencies = Readonly<{
  queryStatus?: (plan: LaunchAgentPlanV1) => Promise<LaunchAgentRuntimeStatusV1>;
}>;

export class ServiceCliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ServiceCliUsageError";
  }
}

function usageError(message: string): never {
  throw new ServiceCliUsageError(message);
}

function consumeOption(arguments_: string[], option: string): string | undefined {
  const indexes = arguments_
    .map((argument, index) => (argument === option ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) usageError(`${option} may only be provided once.`);
  const index = indexes[0];
  if (index === undefined) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) usageError(`${option} requires a value.`);
  arguments_.splice(index, 2);
  return value;
}

export function parseServiceCliArguments(argv: readonly string[]): ParsedServiceCliInvocation {
  const arguments_ = [...argv];
  const jsonIndexes = arguments_
    .map((argument, index) => (argument === "--json" ? index : -1))
    .filter((index) => index >= 0);
  if (jsonIndexes.length > 1) usageError("--json may only be provided once.");
  if (jsonIndexes[0] !== undefined) arguments_.splice(jsonIndexes[0], 1);
  const outputMode: ServiceCliOutputMode = jsonIndexes.length === 1 ? "json" : "human";
  const operation = arguments_.shift();
  if (operation === "install" || operation === "uninstall" || operation === "logs") {
    usageError(`${operation} is unavailable pending the explicit human installation gate.`);
  }
  if (operation !== "plan" && operation !== "status") {
    usageError("factory-service requires plan or status.");
  }
  const configFile = consumeOption(arguments_, "--config");
  if (configFile === undefined || configFile.length === 0) usageError("--config is required.");
  if (arguments_.length > 0) usageError(`Unexpected argument: ${String(arguments_[0])}`);
  return { outputMode, command: { kind: `service.${operation}`, configFile } };
}

async function loadConfiguration(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ServiceCliUsageError("Service configuration is not valid JSON.");
    }
    throw error;
  }
}

type ServicePlanProjection = Readonly<{
  operation: "service.plan" | "service.status";
  planDigest: string;
  plistPath: string;
  installDecision: "create" | "noop" | "blocked-foreign";
  decisionReason: string;
  expectedExistingDigest: string | null;
  programAttestationDigest: string;
  activate: readonly Readonly<{ executable: string; arguments: readonly string[] }>[];
  runtimeStatus?: "loaded" | "not-loaded" | "unknown";
  statusObservationDigest?: string;
}>;

function renderResult(result: ServicePlanProjection, mode: ServiceCliOutputMode): string {
  if (mode === "json") return `${JSON.stringify({ ok: true, result })}\n`;
  const status = result.runtimeStatus === undefined ? "" : `; runtime ${result.runtimeStatus}`;
  return `service ${result.installDecision}${status}\nplan: ${result.planDigest}\nprograms: ${result.programAttestationDigest}\nplist: ${result.plistPath}\n${result.decisionReason}\n`;
}

function renderError(error: unknown, mode: ServiceCliOutputMode): string {
  const normalized =
    error instanceof ServiceCliUsageError
      ? { code: "factory-service.usage", message: error.message, retryable: false }
      : {
          code: "factory-service.failed",
          message: "The service command failed.",
          retryable: false,
        };
  return mode === "json"
    ? `${JSON.stringify({ ok: false, error: normalized })}\n`
    : `ERROR [${normalized.code}] ${normalized.message}\n`;
}

export async function runServiceCli(
  argv: readonly string[],
  io: ServiceCliIo,
  dependencies: ServiceCliDependencies = {},
): Promise<number> {
  let invocation: ParsedServiceCliInvocation;
  try {
    invocation = parseServiceCliArguments(argv);
  } catch (error) {
    io.stderr(renderError(error, argv.includes("--json") ? "json" : "human"));
    return 2;
  }

  try {
    const plan = buildLaunchAgentPlan(await loadConfiguration(invocation.command.configFile));
    const programAttestation = await attestLaunchAgentProgramFiles(plan);
    const existing = await inspectLaunchAgentFile(plan.plistPath);
    const decision = decideLaunchAgentInstallation(plan, existing, null, programAttestation);
    const status =
      invocation.command.kind === "service.status"
        ? await (dependencies.queryStatus ?? queryLaunchAgentStatus)(plan)
        : undefined;
    const result: ServicePlanProjection = {
      operation: invocation.command.kind,
      planDigest: plan.plistDigest,
      plistPath: plan.plistPath,
      installDecision: decision.operation,
      decisionReason: decision.reason,
      expectedExistingDigest: decision.expectedExistingDigest,
      programAttestationDigest: programAttestation.attestationDigest,
      activate: plan.activate,
      ...(status === undefined
        ? {}
        : {
            runtimeStatus: status.status,
            statusObservationDigest: status.observationDigest,
          }),
    };
    io.stdout(renderResult(result, invocation.outputMode));
    return 0;
  } catch (error) {
    io.stderr(renderError(error, invocation.outputMode));
    return error instanceof ServiceCliUsageError ? 2 : 1;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  process.exitCode = await runServiceCli(process.argv.slice(2), {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
}
