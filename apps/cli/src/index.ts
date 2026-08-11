#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { CommandClientError, createCommandClient } from "@app-factory/command-client";
import {
  AttemptIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type CommandResultV1,
  type TaskSpecV1,
} from "@app-factory/contracts";

export type CliOutputMode = "human" | "json";

export type ParsedCliCommand =
  | Readonly<{ kind: "doctor" }>
  | Readonly<{ kind: "task.submit" | "task.run"; taskFile: string }>
  | Readonly<{ kind: "attempt.status"; attemptId: AttemptId }>
  | Readonly<{
      kind: "attempt.events";
      attemptId: AttemptId;
      afterSequence: number;
      limit: number;
    }>
  | Readonly<{
      kind: "attempt.pause" | "attempt.resume" | "attempt.cancel";
      attemptId: AttemptId;
      reason: string | null;
    }>
  | Readonly<{ kind: "daemon.reconcile"; attemptId: AttemptId | null }>;

export type ParsedCliInvocation = Readonly<{
  outputMode: CliOutputMode;
  command: ParsedCliCommand;
}>;

export class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function usageError(message: string): never {
  throw new CliUsageError(message);
}

function parseAttemptId(value: string | undefined): AttemptId {
  if (value === undefined) usageError("An attempt ID is required.");
  const parsed = AttemptIdSchema.safeParse(value);
  if (!parsed.success) usageError("The attempt ID must be a canonical lowercase UUID.");
  return parsed.data;
}

function parsePositiveInteger(name: string, value: string | undefined, maximum: number): number {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    usageError(`${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    usageError(`${name} must not exceed ${maximum}.`);
  }
  return parsed;
}

function parseNonNegativeInteger(name: string, value: string | undefined): number {
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    usageError(`${name} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) usageError(`${name} is too large.`);
  return parsed;
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

function rejectUnexpected(arguments_: readonly string[]): void {
  if (arguments_.length > 0) usageError(`Unexpected argument: ${arguments_[0]}`);
}

export function parseCliArguments(argv: readonly string[]): ParsedCliInvocation {
  const arguments_ = [...argv];
  const jsonIndexes = arguments_
    .map((argument, index) => (argument === "--json" ? index : -1))
    .filter((index) => index >= 0);
  if (jsonIndexes.length > 1) usageError("--json may only be provided once.");
  if (jsonIndexes[0] !== undefined) arguments_.splice(jsonIndexes[0], 1);
  const outputMode: CliOutputMode = jsonIndexes.length === 1 ? "json" : "human";

  const command = arguments_.shift();
  if (command === undefined) usageError("A command is required.");

  if (command === "doctor") {
    rejectUnexpected(arguments_);
    return { outputMode, command: { kind: "doctor" } };
  }

  if (command === "submit" || command === "run") {
    const taskFile = consumeOption(arguments_, "--task");
    if (taskFile === undefined || taskFile.length === 0) usageError("--task is required.");
    rejectUnexpected(arguments_);
    return {
      outputMode,
      command: { kind: command === "submit" ? "task.submit" : "task.run", taskFile },
    };
  }

  if (command === "status") {
    const attemptId = parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, command: { kind: "attempt.status", attemptId } };
  }

  if (command === "events") {
    const attemptId = parseAttemptId(arguments_.shift());
    const afterValue = consumeOption(arguments_, "--after");
    const limitValue = consumeOption(arguments_, "--limit");
    rejectUnexpected(arguments_);
    return {
      outputMode,
      command: {
        kind: "attempt.events",
        attemptId,
        afterSequence:
          afterValue === undefined ? 0 : parseNonNegativeInteger("--after", afterValue),
        limit: limitValue === undefined ? 100 : parsePositiveInteger("--limit", limitValue, 1_000),
      },
    };
  }

  if (command === "pause" || command === "resume" || command === "cancel") {
    const attemptId = parseAttemptId(arguments_.shift());
    const reason = consumeOption(arguments_, "--reason") ?? null;
    rejectUnexpected(arguments_);
    return {
      outputMode,
      command: {
        kind: `attempt.${command}`,
        attemptId,
        reason,
      },
    };
  }

  if (command === "reconcile") {
    const attemptId = arguments_.length === 0 ? null : parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, command: { kind: "daemon.reconcile", attemptId } };
  }

  usageError(`Unknown command: ${command}`);
}

export function renderCommandResult(result: CommandResultV1, mode: CliOutputMode): string {
  if (mode === "json") return `${JSON.stringify({ ok: true, result })}\n`;

  switch (result.operation) {
    case "doctor":
      return `daemon ${result.readiness} (v${result.daemonVersion}, protocol ${result.protocolVersion})${
        result.issues.length === 0 ? "" : `\nissues: ${result.issues.join("; ")}`
      }\n`;
    case "task.submit":
    case "task.run":
      return `${result.operation}: attempt ${result.attemptId} is ${result.state}\n`;
    case "attempt.status":
      return `attempt ${result.attempt.attemptId}: ${result.attempt.state} (desired ${result.attempt.desiredState}, revision ${result.attempt.revision})\n`;
    case "attempt.events":
      return result.events.length === 0
        ? "no events\n"
        : `${result.events
            .map((event) => `${event.sequence}\t${event.occurredAt}\t${event.type}`)
            .join("\n")}\n`;
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return `${result.operation}: ${result.accepted ? "accepted" : "not accepted"} for ${result.attemptId}\n`;
    case "daemon.reconcile":
      return `daemon.reconcile: ${result.accepted ? "accepted" : "not accepted"}; ${result.reconciledAttemptIds.length} attempt(s)\n`;
  }
}

export function renderCliError(error: unknown, mode: CliOutputMode): string {
  const normalized =
    error instanceof CommandClientError
      ? { code: error.code, message: error.message, retryable: error.retryable }
      : error instanceof CliUsageError
        ? { code: "cli.usage", message: error.message, retryable: false }
        : { code: "cli.failed", message: "The command failed.", retryable: false };
  return mode === "json"
    ? `${JSON.stringify({ ok: false, error: normalized })}\n`
    : `ERROR [${normalized.code}] ${normalized.message}\n`;
}

async function loadTaskSpec(path: string): Promise<TaskSpecV1> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliUsageError("The task file is not valid JSON.");
    }
    throw error;
  }
  const parsed = TaskSpecV1Schema.safeParse(decoded);
  if (!parsed.success) throw new CliUsageError("The task file does not match TaskSpec V1.");
  return parsed.data;
}

export type CliEnvironment = Readonly<{
  APP_FACTORY_SOCKET?: string;
  APP_FACTORY_AUTH_TOKEN?: string;
}>;

export type CliIo = Readonly<{
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}>;

export async function runCli(
  argv: readonly string[],
  environment: CliEnvironment,
  io: CliIo,
): Promise<number> {
  let invocation: ParsedCliInvocation;
  try {
    invocation = parseCliArguments(argv);
  } catch (error) {
    io.stderr(renderCliError(error, argv.includes("--json") ? "json" : "human"));
    return 2;
  }

  const socketPath = environment.APP_FACTORY_SOCKET;
  const authorization = environment.APP_FACTORY_AUTH_TOKEN;
  if (socketPath === undefined || authorization === undefined) {
    io.stderr(
      renderCliError(
        new CliUsageError("APP_FACTORY_SOCKET and APP_FACTORY_AUTH_TOKEN are required."),
        invocation.outputMode,
      ),
    );
    return 2;
  }

  const client = createCommandClient({ socketPath, authorization, origin: "cli" });
  try {
    let result: CommandResultV1;
    switch (invocation.command.kind) {
      case "doctor":
        result = await client.doctor();
        break;
      case "task.submit":
        result = await client.submit(await loadTaskSpec(invocation.command.taskFile));
        break;
      case "task.run":
        result = await client.run(await loadTaskSpec(invocation.command.taskFile));
        break;
      case "attempt.status":
        result = await client.status(invocation.command.attemptId);
        break;
      case "attempt.events":
        result = await client.events(invocation.command.attemptId, {
          afterSequence: invocation.command.afterSequence,
          limit: invocation.command.limit,
        });
        break;
      case "attempt.pause":
        result = await client.pause(invocation.command.attemptId, invocation.command.reason);
        break;
      case "attempt.resume":
        result = await client.resume(invocation.command.attemptId, invocation.command.reason);
        break;
      case "attempt.cancel":
        result = await client.cancel(invocation.command.attemptId, invocation.command.reason);
        break;
      case "daemon.reconcile":
        result = await client.reconcile(invocation.command.attemptId);
        break;
    }
    io.stdout(renderCommandResult(result, invocation.outputMode));
    return 0;
  } catch (error) {
    io.stderr(renderCliError(error, invocation.outputMode));
    return error instanceof CliUsageError ? 2 : 1;
  } finally {
    client.close();
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const exitCode = await runCli(process.argv.slice(2), process.env, {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
  process.exitCode = exitCode;
}
