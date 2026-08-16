#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  type CommandClient,
  CommandClientError,
  CommandRemoteError,
  createCommandClient,
  type CommandIdentity,
  type RetryableCommandIdentity,
} from "@app-factory/command-client";
import {
  AttemptIdSchema,
  CommandIdSchema,
  EffectIdSchema,
  ExternalEffectStateV1Schema,
  ExternalProviderV1Schema,
  GitBranchNameSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  Sha256DigestSchema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type AttemptId,
  type AttemptListCursorV1,
  type CommandResultV1,
  type EffectListCursorV1,
  type EventV1,
  type ExternalEffectStateV1,
  type ExternalProviderV1,
  type GitBranchName,
  type ProjectId,
  type Sha256Digest,
  type TaskId,
  type TaskSpecV1,
} from "@app-factory/contracts";

import { CliUsageError } from "./cli-errors.js";
import {
  buildTaskSpecFromOptions,
  parseTaskNewArguments,
  renderTaskNewResult,
  writeTaskNewOutput,
  type TaskNewOptionsV1,
} from "./task-new.js";

export { CliUsageError } from "./cli-errors.js";

export type CliOutputMode = "human" | "json";

export type ParsedCliCommand =
  | Readonly<{ kind: "doctor" }>
  | Readonly<{ kind: "portfolio.snapshot" }>
  | Readonly<{ kind: "task.submit" | "task.run"; taskFile: string }>
  | Readonly<{ kind: "task.new"; options: TaskNewOptionsV1 }>
  | Readonly<{ kind: "attempt.status"; attemptId: AttemptId }>
  | Readonly<{
      kind: "attempt.events";
      attemptId: AttemptId;
      afterSequence: number;
      limit: number;
    }>
  | Readonly<{
      kind: "attempt.list";
      scope: "active" | "all";
      projectId: ProjectId | null;
      after: AttemptListCursorV1 | null;
      limit: number;
    }>
  | Readonly<{
      kind: "attempt.pause" | "attempt.resume" | "attempt.cancel";
      attemptId: AttemptId;
      reason: string | null;
    }>
  | Readonly<{ kind: "task.retry"; taskId: TaskId; attemptId: AttemptId }>
  | Readonly<{ kind: "attempt.unblock"; attemptId: AttemptId; answer: string }>
  | Readonly<{ kind: "attempt.blocker"; attemptId: AttemptId }>
  | Readonly<{ kind: "daemon.reconcile"; attemptId: AttemptId | null }>
  | Readonly<{
      kind: "evidence.list";
      afterAttemptId: AttemptId | null;
      limit: number;
    }>
  | Readonly<{ kind: "evidence.inspect" | "evidence.verify"; attemptId: AttemptId }>
  | Readonly<{ kind: "project.scan"; repositoryRoot: string }>
  | Readonly<{ kind: "project.enroll-plan"; planDigest: Sha256Digest }>
  | Readonly<{ kind: "project.apply"; planDigest: Sha256Digest; branchName: GitBranchName | null }>
  | Readonly<{ kind: "effects.status" }>
  | Readonly<{
      kind: "effects.list";
      state: ExternalEffectStateV1 | null;
      provider: ExternalProviderV1 | null;
      after: EffectListCursorV1 | null;
      limit: number;
    }>;

export type ParsedCliInvocation = Readonly<{
  outputMode: CliOutputMode;
  retryIdentity: RetryableCommandIdentity | null;
  command: ParsedCliCommand;
}>;

function usageError(message: string): never {
  throw new CliUsageError(message);
}

function parseAttemptId(value: string | undefined): AttemptId {
  if (value === undefined) usageError("An attempt ID is required.");
  const parsed = AttemptIdSchema.safeParse(value);
  if (!parsed.success) usageError("The attempt ID must be a canonical lowercase UUID.");
  return parsed.data;
}

function parseTaskId(value: string | undefined): TaskId {
  if (value === undefined) usageError("A task ID is required.");
  const parsed = TaskIdSchema.safeParse(value);
  if (!parsed.success) usageError("The task ID must be a canonical lowercase UUID.");
  return parsed.data;
}

function parseProjectId(value: string | undefined): ProjectId {
  if (value === undefined) usageError("A project ID is required.");
  const parsed = ProjectIdSchema.safeParse(value);
  if (!parsed.success) usageError("The project ID must be a canonical lowercase UUID.");
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

function parseRepositoryPath(value: string | undefined): string {
  if (value === undefined || value.length === 0) usageError("A repository path is required.");
  // The daemon may be a long-lived background process, so "relative to the daemon" is
  // meaningless; resolve against the CLI's own cwd to always send an absolute, normalized path.
  return resolve(value);
}

function parsePlanDigest(value: string | undefined): Sha256Digest {
  if (value === undefined) usageError("A plan digest is required.");
  const parsed = Sha256DigestSchema.safeParse(value);
  if (!parsed.success) {
    usageError("The plan digest must be a lowercase sha256 digest (sha256:<64 hex characters>).");
  }
  return parsed.data;
}

function parseBranchNameOption(value: string | undefined): GitBranchName | null {
  if (value === undefined) return null;
  const parsed = GitBranchNameSchema.safeParse(value);
  if (!parsed.success) usageError("--branch must be a valid Git branch name.");
  return parsed.data;
}

function parseEffectStateOption(value: string | undefined): ExternalEffectStateV1 | null {
  if (value === undefined) return null;
  const parsed = ExternalEffectStateV1Schema.safeParse(value);
  if (!parsed.success) usageError("--state must be a valid effect state.");
  return parsed.data;
}

function parseEffectProviderOption(value: string | undefined): ExternalProviderV1 | null {
  if (value === undefined) return null;
  const parsed = ExternalProviderV1Schema.safeParse(value);
  if (!parsed.success) usageError("--provider must be a valid external provider.");
  return parsed.data;
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
  const commandIdValue = consumeOption(arguments_, "--command-id");
  const issuedAtValue = consumeOption(arguments_, "--issued-at");
  if ((commandIdValue === undefined) !== (issuedAtValue === undefined)) {
    usageError("--command-id and --issued-at must be provided together.");
  }
  const retryIdentity: RetryableCommandIdentity | null =
    commandIdValue === undefined || issuedAtValue === undefined
      ? null
      : (() => {
          const commandId = CommandIdSchema.safeParse(commandIdValue);
          if (!commandId.success) {
            usageError("--command-id must be a canonical lowercase UUID.");
          }
          const issuedAt = IsoInstantSchema.safeParse(issuedAtValue);
          if (!issuedAt.success) {
            usageError("--issued-at must be a canonical ISO-8601 instant.");
          }
          return { commandId: commandId.data, issuedAt: issuedAt.data };
        })();

  const command = arguments_.shift();
  if (command === undefined) usageError("A command is required.");

  if (command === "doctor") {
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "doctor" } };
  }

  if (command === "portfolio") {
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "portfolio.snapshot" } };
  }

  if (command === "submit" || command === "run") {
    const taskFile = consumeOption(arguments_, "--task");
    if (taskFile === undefined || taskFile.length === 0) usageError("--task is required.");
    rejectUnexpected(arguments_);
    return {
      outputMode,
      retryIdentity,
      command: { kind: command === "submit" ? "task.submit" : "task.run", taskFile },
    };
  }

  if (command === "task") {
    const subcommand = arguments_.shift();
    if (subcommand === "new") {
      let options: TaskNewOptionsV1;
      try {
        options = parseTaskNewArguments(arguments_);
      } catch (error) {
        if (error instanceof CliUsageError) throw error;
        throw new CliUsageError(error instanceof Error ? error.message : String(error));
      }
      return { outputMode, retryIdentity, command: { kind: "task.new", options } };
    }
    usageError("Task requires one of: new.");
  }

  if (command === "status") {
    const attemptId = parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "attempt.status", attemptId } };
  }

  if (command === "attempts") {
    const all = consumeFlag(arguments_, "--all");
    const projectValue = consumeOption(arguments_, "--project");
    const afterUpdatedAtValue = consumeOption(arguments_, "--after-updated-at");
    const afterAttemptValue = consumeOption(arguments_, "--after-attempt");
    const limitValue = consumeOption(arguments_, "--limit");
    if ((afterUpdatedAtValue === undefined) !== (afterAttemptValue === undefined)) {
      usageError("--after-updated-at and --after-attempt must be provided together.");
    }
    const after: AttemptListCursorV1 | null =
      afterUpdatedAtValue === undefined || afterAttemptValue === undefined
        ? null
        : {
            updatedAt: (() => {
              const parsed = IsoInstantSchema.safeParse(afterUpdatedAtValue);
              if (!parsed.success) {
                usageError("--after-updated-at must be a canonical ISO-8601 instant.");
              }
              return parsed.data;
            })(),
            attemptId: parseAttemptId(afterAttemptValue),
          };
    rejectUnexpected(arguments_);
    return {
      outputMode,
      retryIdentity,
      command: {
        kind: "attempt.list",
        scope: all ? "all" : "active",
        projectId: projectValue === undefined ? null : parseProjectId(projectValue),
        after,
        limit: limitValue === undefined ? 50 : parsePositiveInteger("--limit", limitValue, 100),
      },
    };
  }

  if (command === "events") {
    const attemptId = parseAttemptId(arguments_.shift());
    const afterValue = consumeOption(arguments_, "--after");
    const limitValue = consumeOption(arguments_, "--limit");
    rejectUnexpected(arguments_);
    return {
      outputMode,
      retryIdentity,
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
      retryIdentity,
      command: {
        kind: `attempt.${command}`,
        attemptId,
        reason,
      },
    };
  }

  if (command === "retry") {
    const taskId = parseTaskId(arguments_.shift());
    const attemptId = parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "task.retry", taskId, attemptId } };
  }

  if (command === "unblock") {
    const attemptId = parseAttemptId(arguments_.shift());
    const answer = consumeOption(arguments_, "--answer");
    if (answer === undefined || answer.length === 0) usageError("--answer is required.");
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "attempt.unblock", attemptId, answer } };
  }

  if (command === "blocker") {
    const attemptId = parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "attempt.blocker", attemptId } };
  }

  if (command === "reconcile") {
    const attemptId = arguments_.length === 0 ? null : parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "daemon.reconcile", attemptId } };
  }

  if (command === "evidence") {
    const subcommand = arguments_.shift();
    if (subcommand === "list") {
      const afterValue = consumeOption(arguments_, "--after");
      const limitValue = consumeOption(arguments_, "--limit");
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: {
          kind: "evidence.list",
          afterAttemptId: afterValue === undefined ? null : parseAttemptId(afterValue),
          limit: limitValue === undefined ? 50 : parsePositiveInteger("--limit", limitValue, 100),
        },
      };
    }
    if (subcommand === "inspect" || subcommand === "verify") {
      const attemptId = parseAttemptId(arguments_.shift());
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: `evidence.${subcommand}`, attemptId },
      };
    }
    usageError("Evidence requires one of: list, inspect, verify.");
  }

  if (command === "effects") {
    const subcommand = arguments_.shift();
    if (subcommand === "status") {
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "effects.status" } };
    }
    if (subcommand === "list") {
      const stateValue = consumeOption(arguments_, "--state");
      const providerValue = consumeOption(arguments_, "--provider");
      const afterUpdatedAtValue = consumeOption(arguments_, "--after-updated-at");
      const afterEffectValue = consumeOption(arguments_, "--after-effect");
      const limitValue = consumeOption(arguments_, "--limit");
      if ((afterUpdatedAtValue === undefined) !== (afterEffectValue === undefined)) {
        usageError("--after-updated-at and --after-effect must be provided together.");
      }
      const after: EffectListCursorV1 | null =
        afterUpdatedAtValue === undefined || afterEffectValue === undefined
          ? null
          : {
              updatedAt: (() => {
                const parsed = IsoInstantSchema.safeParse(afterUpdatedAtValue);
                if (!parsed.success) {
                  usageError("--after-updated-at must be a canonical ISO-8601 instant.");
                }
                return parsed.data;
              })(),
              effectId: (() => {
                const parsed = EffectIdSchema.safeParse(afterEffectValue);
                if (!parsed.success)
                  usageError("--after-effect must be a canonical lowercase UUID.");
                return parsed.data;
              })(),
            };
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: {
          kind: "effects.list",
          state: parseEffectStateOption(stateValue),
          provider: parseEffectProviderOption(providerValue),
          after,
          limit: limitValue === undefined ? 50 : parsePositiveInteger("--limit", limitValue, 100),
        },
      };
    }
    usageError("Effects requires one of: status, list.");
  }

  if (command === "project") {
    const subcommand = arguments_.shift();
    if (subcommand === "scan") {
      const repositoryRoot = parseRepositoryPath(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "project.scan", repositoryRoot } };
    }
    if (subcommand === "plan") {
      const planDigest = parsePlanDigest(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "project.enroll-plan", planDigest } };
    }
    if (subcommand === "apply") {
      const planDigest = parsePlanDigest(arguments_.shift());
      const branchName = parseBranchNameOption(consumeOption(arguments_, "--branch"));
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "project.apply", planDigest, branchName },
      };
    }
    usageError("Project requires one of: scan, plan, apply.");
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
    case "attempt.list":
      return result.page.attempts.length === 0
        ? "no attempts\n"
        : `${result.page.attempts
            .map(
              ({ attempt, projectId, title }) =>
                `${attempt.attemptId}\t${attempt.state}\t${projectId}\t${JSON.stringify(title)}`,
            )
            .join("\n")}\n${
            result.page.hasMore && result.page.nextAfter !== null
              ? `more after ${result.page.nextAfter.updatedAt} ${result.page.nextAfter.attemptId}\n`
              : ""
          }`;
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return `${result.operation}: ${result.accepted ? "accepted" : "not accepted"} for ${result.attemptId}\n`;
    case "task.retry":
      return `task.retry: attempt ${result.attemptId} is ${result.state} (retried from ${result.priorAttemptId})\n`;
    case "attempt.unblock":
      return `attempt.unblock: ${result.accepted ? "accepted" : "not accepted"} for ${result.attemptId} (now ${result.state})\n`;
    case "daemon.reconcile":
      return `daemon.reconcile: scheduler wake ${result.accepted ? "accepted" : "not accepted"}; ${result.reconciledAttemptIds.length} synchronous attempt(s)\n`;
    case "evidence.list":
      return result.manifests.length === 0
        ? "no evidence manifests\n"
        : `${result.manifests
            .map(
              (manifest) =>
                `${manifest.attemptId}\t${String(manifest.entryCount)} entries\t${manifest.manifestDigest}`,
            )
            .join(
              "\n",
            )}\n${result.hasMore ? `more after ${result.nextAfterAttemptId ?? ""}\n` : ""}`;
    case "evidence.inspect":
      return `evidence manifest ${result.manifest.attemptId}: ${String(result.manifest.entries.length)} entries (${result.manifestDigest})\n`;
    case "evidence.verify":
      return `evidence storage integrity verified for ${result.manifest.attemptId}: ${String(result.evidence.length)} records, ${String(result.artifactCount)} artifacts (${result.manifest.manifestDigest})\n`;
    case "portfolio.snapshot": {
      const available = (value: number | null): string =>
        value === null ? "unavailable" : String(value);
      return `portfolio: ${String(result.snapshot.totals.projects)} projects, ${String(result.snapshot.totals.attempts)} attempts, ${String(result.snapshot.totals.activeAttempts)} active, ${String(result.snapshot.totals.blockers)} blockers; PRs ${available(result.snapshot.totals.openPullRequests)}, Jira todo ${available(result.snapshot.totals.jiraTodo)}, P0 ${available(result.snapshot.totals.unresolvedP0)}, P1 ${available(result.snapshot.totals.unresolvedP1)}\n`;
    }
    case "project.scan": {
      const lines = [
        `project.scan: ${result.repositoryRoot}`,
        `plan digest: ${result.planDigest}`,
        `fingerprint: ${result.sourceFingerprint}`,
        `inventory digest: ${result.inventoryDigest}`,
        result.blocked
          ? `blocked by ${String(result.blockers.length)} issue(s):\n${result.blockers
              .map((blocker) => `  ${blocker.issueId}\t${blocker.code}\t${blocker.summary}`)
              .join("\n")}`
          : "not blocked",
      ];
      return `${lines.join("\n")}\n`;
    }
    case "project.enroll-plan":
      return `${JSON.stringify(result.plan, null, 2)}\n`;
    case "project.apply": {
      const lines = [
        `project.apply: ${result.repositoryRoot}`,
        `branch: ${result.branchName ?? "(none; nothing to apply)"}`,
        `commit: ${result.commitSha ?? "(none)"}`,
        `applied: ${result.appliedActionKinds.length === 0 ? "none" : result.appliedActionKinds.join(", ")}`,
        `skipped: ${String(result.skippedActions.length)}`,
        `convergence: ${
          result.convergence.blocked
            ? `still blocked (${String(result.convergence.blockerIssueIds.length)} blocker(s))`
            : "clear"
        }, ${String(result.convergence.openIssueCount)} open issue(s)`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "effects.status": {
      const { counts, pendingOutbox, pump } = result.status;
      const countsLine = (
        [
          "planned",
          "sent",
          "observed",
          "confirmed",
          "unknown",
          "manual-intervention",
          "rejected",
        ] as const
      )
        .map((state) => `${state}=${String(counts[state])}`)
        .join(" ");
      const pumpLine = pump.enabled
        ? `pump: enabled, last activity ${pump.lastActivityAt ?? "(none yet)"}${
            pump.lastErrorMessage === null ? "" : `, last error: ${pump.lastErrorMessage}`
          }`
        : "pump: disabled";
      return `effects: ${countsLine}\npending outbox: ${String(pendingOutbox)}\n${pumpLine}\n`;
    }
    case "effects.list":
      return result.page.effects.length === 0
        ? "no effects\n"
        : `${result.page.effects
            .map(
              ({ effect }) =>
                `${effect.effectId}\t${effect.state}\t${effect.target.provider}\t${effect.operationMarker}`,
            )
            .join("\n")}\n${
            result.page.hasMore && result.page.nextAfter !== null
              ? `more after ${result.page.nextAfter.updatedAt} ${result.page.nextAfter.effectId}\n`
              : ""
          }`;
    case "room.create":
      return `room ${result.room.roomId}: ${JSON.stringify(result.room.title)}${
        result.duplicate ? " (already existed)" : ""
      }\n`;
    case "room.list":
      return result.rooms.length === 0
        ? "no rooms\n"
        : `${result.rooms
            .map(
              (room) =>
                `${room.roomId}\t${JSON.stringify(room.title)}\thead ${String(room.headSequence)}\t${
                  room.activeGrantId === null ? "idle" : "generating"
                }`,
            )
            .join("\n")}\n`;
    case "room.post":
      return `room ${result.room.roomId}: posted #${String(result.message.sequence)}\n`;
    case "room.events":
      return `${
        result.messages.length === 0
          ? "no messages"
          : result.messages
              .map((message) =>
                message.kind === "system"
                  ? `${String(message.sequence)}\t${message.occurredAt}\tsystem:${message.code}\t${message.body}`
                  : `${String(message.sequence)}\t${message.occurredAt}\t${
                      message.author.kind === "human"
                        ? `@${message.author.handle}`
                        : message.author.persona
                    }\t${message.body}`,
              )
              .join("\n")
      }\nmoderator: ${result.moderator.enabled ? "enabled" : "disabled"}, room ${result.moderator.attendance}\n`;
    case "room.typing":
      return `room ${result.roomId}: typing until ${result.typingUntil}\n`;
  }
}

export function renderCliError(error: unknown, mode: CliOutputMode): string {
  const retryIdentity =
    error instanceof CommandClientError && error.retryable ? error.retryIdentity : null;
  const normalized =
    error instanceof CommandClientError
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(retryIdentity === null ? {} : { retryIdentity }),
        }
      : error instanceof CliUsageError
        ? { code: "cli.usage", message: error.message, retryable: false }
        : { code: "cli.failed", message: "The command failed.", retryable: false };
  return mode === "json"
    ? `${JSON.stringify({ ok: false, error: normalized })}\n`
    : `ERROR [${normalized.code}] ${normalized.message}${
        retryIdentity === null
          ? ""
          : `\nretry with: --command-id ${retryIdentity.commandId} --issued-at ${retryIdentity.issuedAt}`
      }\n`;
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

/**
 * Diagnoses why an attempt is blocked or failed without requiring the
 * operator to read raw events or evidence blobs by hand. This composes three
 * existing read-only operations (status, events, evidence) client-side; the
 * daemon gains no new operation for it.
 *
 * Each of the three calls is a distinct logical request, so each gets its own
 * fresh requestId via `createRetryIdentity`: the daemon's replay ledger keys
 * conflict detection on requestId, and reusing one requestId for different
 * operations/payloads trips `protocol.request-id-conflict` on the second
 * call. `createRetryIdentity` mints a new requestId while preserving the
 * caller's commandId/issuedAt lineage, so an operator-supplied
 * `--command-id`/`--issued-at` retry identity for the overall `blocker`
 * invocation is still honored for every sub-call.
 */
async function diagnoseBlocker(
  client: CommandClient,
  attemptId: AttemptId,
  mode: CliOutputMode,
  identity: CommandIdentity,
): Promise<string> {
  const { attempt } = await client.status(attemptId, client.createRetryIdentity(identity));
  if (attempt.state !== "blocked" && attempt.state !== "failed") {
    const summary = `attempt ${attemptId} is not blocked or failed (state: ${attempt.state})`;
    return mode === "json"
      ? `${JSON.stringify({
          ok: true,
          result: {
            operation: "attempt.blocker",
            diagnosed: false,
            attemptId,
            state: attempt.state,
          },
        })}\n`
      : `${summary}\n`;
  }

  const code =
    attempt.state === "blocked"
      ? attempt.blocker?.code
      : attempt.outcome?.kind === "failed"
        ? attempt.outcome.failure.code
        : undefined;
  const summary =
    attempt.state === "blocked"
      ? attempt.blocker?.summary
      : attempt.outcome?.kind === "failed"
        ? attempt.outcome.failure.summary
        : undefined;
  if (code === undefined || summary === undefined) {
    throw new CliUsageError(`Attempt ${attemptId} is ${attempt.state} but has no recorded cause.`);
  }

  const { events } = await client.events(
    attemptId,
    { afterSequence: 0, limit: 1_000 },
    client.createRetryIdentity(identity),
  );
  const operationByStepId = new Map<string, string>();
  for (const event of events) {
    if (event.type === "step.created")
      operationByStepId.set(event.data.stepId, event.data.operation);
  }
  const stepId = attempt.currentStepId ?? findLastStepIdInState(events, attempt.state);
  const operation = stepId === null ? null : (operationByStepId.get(stepId) ?? null);

  let evidence: Array<{
    kind: string;
    evidenceId: string;
    producer: string;
    createdAt: string;
    artifactCount: number;
  }> = [];
  try {
    const verified = await client.verifyEvidence(attemptId, client.createRetryIdentity(identity));
    evidence = verified.evidence;
  } catch (error) {
    if (!(error instanceof CommandRemoteError) || error.code !== "evidence.not-found") throw error;
  }

  if (mode === "json") {
    return `${JSON.stringify({
      ok: true,
      result: {
        operation: "attempt.blocker",
        diagnosed: true,
        attemptId,
        state: attempt.state,
        code,
        summary,
        stepId,
        stepOperation: operation,
        evidence,
      },
    })}\n`;
  }

  const lines = [
    `attempt ${attemptId}: ${attempt.state}`,
    `code: ${code}`,
    `summary: ${summary}`,
    `step: ${stepId ?? "unknown"}${operation === null ? "" : ` (${operation})`}`,
    evidence.length === 0
      ? "evidence: none recorded"
      : `evidence:\n${evidence
          .map(
            (item) =>
              `  ${item.kind}\t${item.evidenceId}\t${String(item.artifactCount)} artifact(s)\t${item.producer}\t${item.createdAt}`,
          )
          .join("\n")}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Finds the step named by the last step.state-changed event that reached the attempt's own terminal step state. */
function findLastStepIdInState(
  events: readonly EventV1[],
  attemptState: "blocked" | "failed",
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "step.state-changed" && event.data.to === attemptState) {
      return event.data.stepId;
    }
  }
  return null;
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

  // `task new` without --run computes and emits a TaskSpec entirely locally;
  // it never contacts the daemon, so it does not require a socket or token.
  if (invocation.command.kind === "task.new" && !invocation.command.options.run) {
    try {
      const build = buildTaskSpecFromOptions(invocation.command.options);
      const outPath = invocation.command.options.outPath;
      if (outPath !== null) writeTaskNewOutput(build, outPath);
      io.stdout(renderTaskNewResult(build, outPath, invocation.outputMode));
      return 0;
    } catch (error) {
      io.stderr(renderCliError(error, invocation.outputMode));
      return error instanceof CliUsageError ? 2 : 1;
    }
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
  const identity =
    invocation.retryIdentity === null
      ? client.createIdentity()
      : client.createRetryIdentity(invocation.retryIdentity);
  try {
    let result: CommandResultV1;
    switch (invocation.command.kind) {
      case "doctor":
        result = await client.doctor(identity);
        break;
      case "portfolio.snapshot":
        result = await client.portfolioSnapshot(identity);
        break;
      case "task.submit":
        result = await client.submit(await loadTaskSpec(invocation.command.taskFile), identity);
        break;
      case "task.run":
        result = await client.run(await loadTaskSpec(invocation.command.taskFile), identity);
        break;
      case "task.new":
        // Reached only when --run was set; the no-run path returns earlier.
        result = await client.run(
          buildTaskSpecFromOptions(invocation.command.options).taskSpec,
          identity,
        );
        break;
      case "attempt.status":
        result = await client.status(invocation.command.attemptId, identity);
        break;
      case "attempt.events":
        result = await client.events(
          invocation.command.attemptId,
          {
            afterSequence: invocation.command.afterSequence,
            limit: invocation.command.limit,
          },
          identity,
        );
        break;
      case "attempt.list":
        result = await client.listAttempts(
          {
            scope: invocation.command.scope,
            projectId: invocation.command.projectId,
            after: invocation.command.after,
            limit: invocation.command.limit,
          },
          identity,
        );
        break;
      case "attempt.pause":
        result = await client.pause(
          invocation.command.attemptId,
          invocation.command.reason,
          identity,
        );
        break;
      case "attempt.resume":
        result = await client.resume(
          invocation.command.attemptId,
          invocation.command.reason,
          identity,
        );
        break;
      case "attempt.cancel":
        result = await client.cancel(
          invocation.command.attemptId,
          invocation.command.reason,
          identity,
        );
        break;
      case "task.retry":
        result = await client.retry(
          invocation.command.taskId,
          invocation.command.attemptId,
          identity,
        );
        break;
      case "attempt.unblock":
        result = await client.unblock(
          invocation.command.attemptId,
          invocation.command.answer,
          identity,
        );
        break;
      case "attempt.blocker": {
        const output = await diagnoseBlocker(
          client,
          invocation.command.attemptId,
          invocation.outputMode,
          identity,
        );
        io.stdout(output);
        return 0;
      }
      case "daemon.reconcile":
        result = await client.reconcile(invocation.command.attemptId, identity);
        break;
      case "evidence.list":
        result = await client.listEvidence(
          {
            afterAttemptId: invocation.command.afterAttemptId,
            limit: invocation.command.limit,
          },
          identity,
        );
        break;
      case "evidence.inspect":
        result = await client.inspectEvidence(invocation.command.attemptId, identity);
        break;
      case "evidence.verify":
        result = await client.verifyEvidence(invocation.command.attemptId, identity);
        break;
      case "project.scan":
        result = await client.scanProject(invocation.command.repositoryRoot, identity);
        break;
      case "project.enroll-plan":
        result = await client.getEnrollmentPlan(invocation.command.planDigest, identity);
        break;
      case "project.apply":
        result = await client.applyEnrollmentPlan(
          invocation.command.planDigest,
          invocation.command.branchName,
          identity,
        );
        break;
      case "effects.status":
        result = await client.effectsStatus(identity);
        break;
      case "effects.list":
        result = await client.listEffects(
          {
            state: invocation.command.state,
            provider: invocation.command.provider,
            after: invocation.command.after,
            limit: invocation.command.limit,
          },
          identity,
        );
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
