#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { runGarbageCollection } from "./gc.js";
import { RetentionManagerError, type GcRunResultV1 } from "./types.js";

export type GcCliOutputMode = "human" | "json";

export type ParsedGcCliInvocation = Readonly<{
  outputMode: GcCliOutputMode;
  configFile: string;
  apply: boolean;
}>;

export type GcCliIo = Readonly<{
  stdout(value: string): void;
  stderr(value: string): void;
}>;

export class GcCliUsageError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GcCliUsageError";
  }
}

function usageError(message: string): never {
  throw new GcCliUsageError(message);
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

function consumeFlag(arguments_: string[], flag: string): boolean {
  const indexes = arguments_
    .map((argument, index) => (argument === flag ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length > 1) usageError(`${flag} may only be provided once.`);
  const index = indexes[0];
  if (index === undefined) return false;
  arguments_.splice(index, 1);
  return true;
}

/**
 * Parses `factory-gc [--config <path>] [--apply] [--json]`. The default
 * (no `--apply`) is a dry-run listing; `--apply` is the only way to delete
 * anything, matching the "dry-run by default" hard safety rule.
 */
export function parseGcCliArguments(argv: readonly string[]): ParsedGcCliInvocation {
  const arguments_ = [...argv];
  const jsonIndexes = arguments_
    .map((argument, index) => (argument === "--json" ? index : -1))
    .filter((index) => index >= 0);
  if (jsonIndexes.length > 1) usageError("--json may only be provided once.");
  if (jsonIndexes[0] !== undefined) arguments_.splice(jsonIndexes[0], 1);
  const outputMode: GcCliOutputMode = jsonIndexes.length === 1 ? "json" : "human";
  const apply = consumeFlag(arguments_, "--apply");
  const configFile = consumeOption(arguments_, "--config");
  if (configFile === undefined || configFile.length === 0) usageError("--config is required.");
  if (arguments_.length > 0) usageError(`Unexpected argument: ${String(arguments_[0])}`);
  return { outputMode, configFile, apply };
}

async function loadConfiguration(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new GcCliUsageError(`Could not read the gc configuration file: ${path}`, {
      cause: error,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new GcCliUsageError("The gc configuration file is not valid JSON.", { cause: error });
  }
}

function renderResult(result: GcRunResultV1, mode: GcCliOutputMode): string {
  if (mode === "json") return `${JSON.stringify({ ok: true, result })}\n`;

  const lines = [
    `factory-gc: ${result.mode} — ${String(result.selection.items.length)} item(s) selected`,
  ];
  for (const item of result.selection.items) {
    lines.push(`  [${item.category}] ${item.path}\n    ${item.reason}`);
  }
  if (result.applied === null) {
    lines.push("dry run: nothing was deleted. Pass --apply to reclaim the listed items.");
  } else {
    const reclaimedCount = result.applied.filter((outcome) => outcome.reclaimed).length;
    lines.push(`reclaimed ${String(reclaimedCount)}/${String(result.applied.length)} item(s)`);
    for (const outcome of result.applied) {
      if (!outcome.reclaimed) {
        lines.push(
          `  skipped: [${outcome.item.category}] ${outcome.item.path}\n    ${outcome.skippedReason ?? "unknown reason"}`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderError(error: unknown, mode: GcCliOutputMode): string {
  const normalized =
    error instanceof GcCliUsageError
      ? { code: "factory-gc.usage", message: error.message, retryable: false }
      : error instanceof RetentionManagerError
        ? { code: "factory-gc.refused", message: error.message, retryable: false }
        : { code: "factory-gc.failed", message: "The gc command failed.", retryable: false };
  return mode === "json"
    ? `${JSON.stringify({ ok: false, error: normalized })}\n`
    : `ERROR [${normalized.code}] ${normalized.message}\n`;
}

export async function runGcCli(argv: readonly string[], io: GcCliIo): Promise<number> {
  let invocation: ParsedGcCliInvocation;
  try {
    invocation = parseGcCliArguments(argv);
  } catch (error) {
    io.stderr(renderError(error, argv.includes("--json") ? "json" : "human"));
    return 2;
  }

  try {
    const configuration = await loadConfiguration(invocation.configFile);
    const result = await runGarbageCollection(configuration, { apply: invocation.apply });
    io.stdout(renderResult(result, invocation.outputMode));
    return 0;
  } catch (error) {
    io.stderr(renderError(error, invocation.outputMode));
    return error instanceof GcCliUsageError ? 2 : 1;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  process.exitCode = await runGcCli(process.argv.slice(2), {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
}
