#!/usr/bin/env node

import { randomUUID } from "node:crypto";
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
  CalendarDateSchema,
  CommandIdSchema,
  EffectIdSchema,
  ExternalEffectStateV1Schema,
  ExternalProviderV1Schema,
  GitBranchNameSchema,
  IsoInstantSchema,
  MilestoneIdSchema,
  PhasePresetIdSchema,
  ProjectIdSchema,
  ProjectMilestoneKindV1Schema,
  ProjectMilestoneOwnerV1Schema,
  ProjectMilestoneStatusV1Schema,
  ProjectMilestoneUpsertV1Schema,
  ProjectPlanEditBatchV1Schema,
  ProjectPlanEditV1Schema,
  ProjectPlanIdSchema,
  ProjectPlanItemIdSchema,
  ProjectPlanProposeV1Schema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  StableKeySchema,
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
  type PhasePresetId,
  type ProjectId,
  type ProjectMilestoneUpsertV1,
  type ProjectPlanApproveGateV1,
  type ProjectPlanApproveV1,
  type ProjectPlanEditV1,
  type ProjectPlanExecuteV1,
  type ProjectPlanId,
  type ProjectPlanProposeV1,
  type ProjectPlanV1,
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
  | Readonly<{ kind: "studio.snapshot" }>
  | Readonly<{ kind: "studio.assistant.query"; question: string; projectId: ProjectId | null }>
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
  | Readonly<{ kind: "run.export"; attemptId: AttemptId }>
  | Readonly<{ kind: "project.scan"; repositoryRoot: string }>
  | Readonly<{ kind: "project.enroll-plan"; planDigest: Sha256Digest }>
  | Readonly<{ kind: "project.apply"; planDigest: Sha256Digest; branchName: GitBranchName | null }>
  | Readonly<{ kind: "project.milestones.list"; projectId: ProjectId }>
  | Readonly<{ kind: "project.milestone.upsert"; upsert: ProjectMilestoneUpsertV1 }>
  | Readonly<{ kind: "phases.list" }>
  | Readonly<{ kind: "phases.show"; presetId: PhasePresetId }>
  | Readonly<{ kind: "project.docs.snapshot"; repositoryRoot: string }>
  | Readonly<{ kind: "project.seed"; targetDirectory: string; name: string }>
  | Readonly<{ kind: "plan.propose"; propose: ProjectPlanProposeV1 }>
  | Readonly<{
      kind: "plan.edit";
      planId: ProjectPlanId;
      expectedRevision: number;
      editsFile: string;
    }>
  | Readonly<{ kind: "plan.approve"; approve: ProjectPlanApproveV1 }>
  | Readonly<{ kind: "plan.execute"; execute: ProjectPlanExecuteV1 }>
  | Readonly<{ kind: "plan.approve-gate"; approveGate: ProjectPlanApproveGateV1 }>
  | Readonly<{ kind: "plan.status"; planId: ProjectPlanId }>
  | Readonly<{ kind: "plan.tick"; planId: ProjectPlanId }>
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

function parsePresetId(value: string | undefined): PhasePresetId {
  if (value === undefined) usageError("A preset ID is required.");
  const parsed = PhasePresetIdSchema.safeParse(value);
  if (!parsed.success)
    usageError("The preset ID must be a stable lowercase key, e.g. ios-app-standard-0.4.0.");
  return parsed.data;
}

function parsePlanId(value: string | undefined): ProjectPlanId {
  if (value === undefined) usageError("A plan ID is required.");
  const parsed = ProjectPlanIdSchema.safeParse(value);
  if (!parsed.success) usageError("The plan ID must be a canonical lowercase UUID.");
  return parsed.data;
}

function parseExpectedRevisionOption(value: string | undefined): number {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) {
    usageError("--expected-revision is required and must be a non-negative integer.");
  }
  return Number(value);
}

function parseRepositoryIdOption(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = RepositoryIdSchema.safeParse(value);
  if (!parsed.success) usageError("--repository must be a canonical lowercase UUID.");
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

/** Human rendering of an absent target date: the plan has no honest estimate. */
export const MILESTONE_NO_TARGET_DATE_LABEL = "won't guess";

function parseEnumOption<Value extends string>(
  option: string,
  value: string | undefined,
  schema: Readonly<{ safeParse: (input: unknown) => { success: boolean; data?: Value } }>,
  choices: readonly string[],
): Value {
  if (value === undefined) usageError(`${option} is required (one of: ${choices.join(", ")}).`);
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    usageError(`${option} must be one of: ${choices.join(", ")}.`);
  }
  return parsed.data;
}

/**
 * Parses `project milestone upsert`. `--target-date` is optional and its
 * absence is meaningful: the milestone is stored with `targetDate: null` and
 * rendered as "won't guess". The CLI never fills in today's date or anything
 * else. `--milestone-id` may be omitted on a first create (one is generated
 * and printed), but a retry (`--command-id`/`--issued-at`) must name it, so
 * the replayed payload is byte-identical to the original.
 */
function parseMilestoneUpsertArguments(
  arguments_: string[],
  retrying: boolean,
): ProjectMilestoneUpsertV1 {
  const projectId = parseProjectId(consumeOption(arguments_, "--project-id"));
  const milestoneIdValue = consumeOption(arguments_, "--milestone-id");
  if (milestoneIdValue === undefined && retrying) {
    usageError("--milestone-id is required when retrying with --command-id and --issued-at.");
  }
  const milestoneId = MilestoneIdSchema.safeParse(milestoneIdValue ?? randomUUID());
  if (!milestoneId.success) usageError("--milestone-id must be a canonical lowercase UUID.");
  const phaseValue = consumeOption(arguments_, "--phase");
  if (phaseValue === undefined) usageError("--phase is required.");
  const phase = StableKeySchema.safeParse(phaseValue);
  if (!phase.success) {
    usageError(
      "--phase must be a stable lowercase key (a-z, 0-9, hyphens; at most 64 characters).",
    );
  }
  const kind = parseEnumOption(
    "--kind",
    consumeOption(arguments_, "--kind"),
    ProjectMilestoneKindV1Schema,
    ProjectMilestoneKindV1Schema.options,
  );
  const label = consumeOption(arguments_, "--label");
  if (label === undefined || label.length === 0) usageError("--label is required.");
  const targetDateValue = consumeOption(arguments_, "--target-date");
  const targetDate =
    targetDateValue === undefined
      ? null
      : (() => {
          const parsed = CalendarDateSchema.safeParse(targetDateValue);
          if (!parsed.success)
            usageError("--target-date must be a real calendar date (YYYY-MM-DD).");
          return parsed.data;
        })();
  const dependsOn: string[] = [];
  for (;;) {
    const index = arguments_.indexOf("--depends-on");
    if (index === -1) break;
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) usageError("--depends-on requires a value.");
    if (!MilestoneIdSchema.safeParse(value).success) {
      usageError("--depends-on must be a canonical lowercase UUID.");
    }
    dependsOn.push(value);
    arguments_.splice(index, 2);
  }
  const owner = parseEnumOption(
    "--owner",
    consumeOption(arguments_, "--owner"),
    ProjectMilestoneOwnerV1Schema,
    ProjectMilestoneOwnerV1Schema.options,
  );
  const status = parseEnumOption(
    "--status",
    consumeOption(arguments_, "--status"),
    ProjectMilestoneStatusV1Schema,
    ProjectMilestoneStatusV1Schema.options,
  );
  const evidenceValue = consumeOption(arguments_, "--evidence-digest");
  const evidenceDigest =
    evidenceValue === undefined
      ? null
      : (() => {
          const parsed = Sha256DigestSchema.safeParse(evidenceValue);
          if (!parsed.success) {
            usageError("--evidence-digest must be a lowercase sha256 digest.");
          }
          return parsed.data;
        })();
  const expectedRevisionValue = consumeOption(arguments_, "--expected-revision");
  const expectedRevision =
    expectedRevisionValue === undefined
      ? null
      : parseNonNegativeInteger("--expected-revision", expectedRevisionValue);
  rejectUnexpected(arguments_);
  const upsert = ProjectMilestoneUpsertV1Schema.safeParse({
    milestone: {
      milestoneId: milestoneId.data,
      projectId,
      phase: phase.data,
      kind,
      label,
      targetDate,
      dependsOn,
      owner,
      status,
      evidenceDigest,
    },
    expectedRevision,
  });
  if (!upsert.success) usageError(`The milestone is invalid: ${upsert.error.message}`);
  return upsert.data;
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

/** Like {@link consumeOption}, but collects every occurrence of `option` in order (used for
 * repeatable flags like `plan propose`'s `--constraint`). */
function consumeRepeated(arguments_: string[], option: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < arguments_.length;) {
    if (arguments_[index] !== option) {
      index += 1;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) usageError(`${option} requires a value.`);
    values.push(value);
    arguments_.splice(index, 2);
  }
  return values;
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

  // `run export <attemptId>` re-derives a verified run's canonical record; it
  // is distinguished from `run --task <file>` by its literal first argument.
  if (command === "run" && arguments_[0] === "export") {
    arguments_.shift();
    const attemptId = parseAttemptId(arguments_.shift());
    rejectUnexpected(arguments_);
    return { outputMode, retryIdentity, command: { kind: "run.export", attemptId } };
  }

  if (command === "studio") {
    const subcommand = arguments_.shift();
    if (subcommand === "snapshot") {
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "studio.snapshot" } };
    }
    if (subcommand === "ask") {
      const question = arguments_.shift();
      if (question === undefined || question.length === 0) usageError("A question is required.");
      const projectValue = consumeOption(arguments_, "--project");
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: {
          kind: "studio.assistant.query",
          question,
          projectId: projectValue === undefined ? null : parseProjectId(projectValue),
        },
      };
    }
    usageError("Studio requires one of: snapshot, ask.");
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
    if (subcommand === "milestones") {
      const projectId = parseProjectId(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "project.milestones.list", projectId } };
    }
    if (subcommand === "milestone") {
      const verb = arguments_.shift();
      if (verb === "upsert") {
        const upsert = parseMilestoneUpsertArguments(arguments_, retryIdentity !== null);
        return { outputMode, retryIdentity, command: { kind: "project.milestone.upsert", upsert } };
      }
      usageError("Project milestone requires: upsert.");
    }
    if (subcommand === "seed") {
      const targetDirectoryValue = arguments_.shift();
      if (targetDirectoryValue === undefined || targetDirectoryValue.length === 0) {
        usageError("A target directory is required.");
      }
      const targetDirectory = resolve(targetDirectoryValue);
      const name = consumeOption(arguments_, "--name");
      if (name === undefined || name.length === 0) usageError("--name is required.");
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "project.seed", targetDirectory, name },
      };
    }
    usageError("Project requires one of: scan, plan, apply, milestones, milestone, seed.");
  }

  if (command === "phases") {
    const subcommand = arguments_.shift();
    if (subcommand === "list") {
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "phases.list" } };
    }
    if (subcommand === "show") {
      const presetId = parsePresetId(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "phases.show", presetId } };
    }
    usageError("Phases requires one of: list, show.");
  }

  if (command === "docs") {
    const subcommand = arguments_.shift();
    if (subcommand === "snapshot") {
      const repositoryRoot = parseRepositoryPath(arguments_.shift());
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "project.docs.snapshot", repositoryRoot },
      };
    }
    usageError("Docs requires: snapshot.");
  }

  if (command === "plan") {
    const subcommand = arguments_.shift();
    if (subcommand === "propose") {
      const presetId = parsePresetId(consumeOption(arguments_, "--preset"));
      const title = consumeOption(arguments_, "--title");
      if (title === undefined || title.length === 0) usageError("--title is required.");
      const oneLiner = consumeOption(arguments_, "--one-liner");
      if (oneLiner === undefined || oneLiner.length === 0) usageError("--one-liner is required.");
      const constraints = consumeRepeated(arguments_, "--constraint");
      const projectValue = consumeOption(arguments_, "--project");
      const repositoryId = parseRepositoryIdOption(consumeOption(arguments_, "--repository"));
      rejectUnexpected(arguments_);
      const propose = ProjectPlanProposeV1Schema.parse({
        brief: { title, oneLiner, constraints },
        presetId,
        projectId: projectValue === undefined ? null : parseProjectId(projectValue),
        repositoryId,
        source: null,
      });
      return { outputMode, retryIdentity, command: { kind: "plan.propose", propose } };
    }
    if (subcommand === "show" || subcommand === "status") {
      const planId = parsePlanId(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "plan.status", planId } };
    }
    if (subcommand === "edit") {
      const planId = parsePlanId(arguments_.shift());
      const expectedRevision = parseExpectedRevisionOption(
        consumeOption(arguments_, "--expected-revision"),
      );
      const editsFile = consumeOption(arguments_, "--edits");
      if (editsFile === undefined || editsFile.length === 0) {
        usageError("--edits (a path to a JSON array of edits) is required.");
      }
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "plan.edit", planId, expectedRevision, editsFile },
      };
    }
    if (subcommand === "approve") {
      const planId = parsePlanId(arguments_.shift());
      const expectedRevision = parseExpectedRevisionOption(
        consumeOption(arguments_, "--expected-revision"),
      );
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "plan.approve", approve: { planId, expectedRevision } },
      };
    }
    if (subcommand === "execute") {
      const planId = parsePlanId(arguments_.shift());
      const expectedRevision = parseExpectedRevisionOption(
        consumeOption(arguments_, "--expected-revision"),
      );
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: { kind: "plan.execute", execute: { planId, expectedRevision } },
      };
    }
    if (subcommand === "approve-gate") {
      const planId = parsePlanId(arguments_.shift());
      const itemIdValue = arguments_.shift();
      const itemId = ProjectPlanItemIdSchema.safeParse(itemIdValue);
      if (!itemId.success) usageError("An item ID is required.");
      const expectedRevision = parseExpectedRevisionOption(
        consumeOption(arguments_, "--expected-revision"),
      );
      rejectUnexpected(arguments_);
      return {
        outputMode,
        retryIdentity,
        command: {
          kind: "plan.approve-gate",
          approveGate: { planId, itemId: itemId.data, expectedRevision },
        },
      };
    }
    if (subcommand === "tick") {
      const planId = parsePlanId(arguments_.shift());
      rejectUnexpected(arguments_);
      return { outputMode, retryIdentity, command: { kind: "plan.tick", planId } };
    }
    usageError("Plan requires one of: propose, show, edit, approve, execute, approve-gate, tick.");
  }

  usageError(`Unknown command: ${command}`);
}

/** A skimmable, top-to-bottom item list -- never a graph -- for `plan.*` results. */
function renderPlan(plan: ProjectPlanV1): string {
  const header = `plan ${plan.planId} r${String(plan.revision)} ${plan.state} "${plan.brief.title}" (preset ${plan.presetId}, digest ${plan.digest})`;
  const items = plan.items
    .map((item, index) => {
      const marker = item.kind === "gate" ? "◆" : " ";
      const detail = item.kind === "task" ? "" : ` -- ${item.gate.reason}`;
      return `${String(index + 1)}. ${marker}[${item.kind}] ${item.itemId}\t${item.status}\t${JSON.stringify(item.title)}${detail}`;
    })
    .join("\n");
  return `${header}\n${items}\n`;
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
              ({ attempt, projectId, phase, title }) =>
                `${attempt.attemptId}\t${attempt.state}\t${projectId}\t${phase ?? "(no phase)"}\t${JSON.stringify(title)}`,
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
    case "run.export": {
      const { record } = result;
      const usage = record.agent.usage;
      const tokens =
        usage === null
          ? "unavailable"
          : `${String(usage.inputTokens ?? "?")} in / ${String(usage.cachedInputTokens ?? "?")} cached / ${String(usage.outputTokens ?? "?")} out`;
      const lines = [
        `run record ${record.attemptId} (${result.recordDigest})`,
        `task: ${record.taskId} attempt ${String(record.attemptNumber)} fence ${String(record.fence)}`,
        `task spec: ${record.taskSpecDigest}`,
        `policy: ${record.policyDigest}`,
        `repository: ${record.repositoryId} base ${record.baseCommit}`,
        `broker commit: ${record.brokerCommit.commit} tree ${record.brokerCommit.tree}`,
        `verification: ${record.verification
          .map((claim) => `${claim.checkId}=${claim.passed ? "passed" : "failed"}`)
          .join(", ")}`,
        `review: ${record.review.verdict} by ${record.review.reviewerId}@${record.review.reviewerVersion} (${String(record.review.findingCount)} finding(s))`,
        `evidence: manifest ${record.evidence.manifestDigest} index ${record.evidence.indexDigest} (${String(record.evidence.entryCount)} records, ${String(record.evidence.artifactCount)} artifacts)`,
        `agent: ${record.agent.adapterId}${record.agent.adapterVersion === null ? "" : `@${record.agent.adapterVersion}`}${
          record.agent.cliVersion === null ? "" : ` cli ${record.agent.cliVersion}`
        }${record.agent.model === null ? "" : ` model ${record.agent.model}`}${
          record.agent.executableDigest === null
            ? ""
            : ` executable ${record.agent.executableDigest}`
        }`,
        `tokens: ${tokens}`,
        `timings: attempt ${record.timings.attemptCreatedAt} -> ${record.timings.attemptTerminalAt}; agent ${record.timings.agentStartedAt} -> ${record.timings.agentFinishedAt}; evidence ${record.timings.evidenceCreatedAt}`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "portfolio.snapshot": {
      const available = (value: number | null): string =>
        value === null ? "unavailable" : String(value);
      return `portfolio: ${String(result.snapshot.totals.projects)} projects, ${String(result.snapshot.totals.attempts)} attempts, ${String(result.snapshot.totals.activeAttempts)} active, ${String(result.snapshot.totals.blockers)} blockers; PRs ${available(result.snapshot.totals.openPullRequests)}, Jira todo ${available(result.snapshot.totals.jiraTodo)}, P0 ${available(result.snapshot.totals.unresolvedP0)}, P1 ${available(result.snapshot.totals.unresolvedP1)}\n`;
    }
    case "studio.snapshot": {
      const metric = (value: number | null, unavailableReason: string | null): string =>
        value === null ? `unavailable (${unavailableReason ?? "unknown"})` : String(value);
      const { portfolio } = result.snapshot;
      const lines = [
        `studio: ${String(result.snapshot.projects.length)} project(s), digest ${result.snapshot.sourceSnapshotDigest}`,
        `verified this week: ${metric(portfolio.verifiedThisWeek.value, portfolio.verifiedThisWeek.unavailableReason)}`,
        `awaiting you: ${metric(portfolio.awaitingYouCount.value, portfolio.awaitingYouCount.unavailableReason)}`,
        `pass rate: ${metric(portfolio.passRate.value, portfolio.passRate.unavailableReason)}`,
        `median run seconds: ${metric(portfolio.medianRunSeconds.value, portfolio.medianRunSeconds.unavailableReason)}`,
        `agent window share: ${metric(portfolio.agentWindowShare.value, portfolio.agentWindowShare.unavailableReason)}`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "studio.assistant.query": {
      const { answer } = result;
      return answer.kind === "answered"
        ? `${answer.text}\ncitations: ${answer.citations.map((citation) => `${citation.kind}:${citation.id}`).join(", ")}\n`
        : `cannot answer [${answer.cannotAnswer.reason}]: ${answer.cannotAnswer.detail}\n`;
    }
    case "studio.assistant.intent.propose":
      return `${JSON.stringify(result.intent, null, 2)}\n`;
    case "studio.assistant.intent.execute":
      return `studio.assistant.intent.execute: intent ${result.intentId} dispatched to ${result.outcome.kind}\n${JSON.stringify(result.outcome.result, null, 2)}\n`;
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
    case "project.milestones.list": {
      const { timeline } = result;
      const header = `project.milestones: ${timeline.projectId} (${String(timeline.milestones.length)} milestones, ${String(timeline.actuals.phases.length)} phases with attempts; lifecycle events ${timeline.sources.lifecycleEvents})`;
      const milestones =
        timeline.milestones.length === 0
          ? "no milestones"
          : timeline.milestones
              .map(
                (milestone) =>
                  `${milestone.milestoneId}\t${milestone.status}\t${milestone.kind}\t${milestone.phase}\t${
                    milestone.targetDate ?? MILESTONE_NO_TARGET_DATE_LABEL
                  }\t${milestone.owner}\tr${String(milestone.revision)}\t${JSON.stringify(milestone.label)}`,
              )
              .join("\n");
      const actuals =
        timeline.actuals.phases.length === 0
          ? "no attempts observed"
          : timeline.actuals.phases
              .map(
                (phase) =>
                  `${phase.phase ?? "(no phase)"}\t${String(phase.attemptCount)} attempts, ${String(phase.activeAttemptCount)} active, ${String(phase.blockerCount)} blocked, ${String(phase.succeededAttemptCount)} succeeded\tfirst ${phase.firstAttemptAt}\tlast ${phase.lastActivityAt}\tsucceeded ${phase.lastSucceededAt ?? "never"}`,
              )
              .join("\n");
      return `${header}\n${milestones}\nactuals:\n${actuals}\n`;
    }
    case "project.milestone.upsert": {
      const { milestone } = result;
      return `project.milestone.upsert: ${result.created ? "created" : "updated"} ${milestone.milestoneId} r${String(milestone.revision)} ${milestone.status} ${milestone.kind} ${milestone.phase} target ${
        milestone.targetDate ?? MILESTONE_NO_TARGET_DATE_LABEL
      } ${JSON.stringify(milestone.label)}\n`;
    }
    case "preset.list": {
      if (result.presets.length === 0) return "no presets\n";
      return `${result.presets
        .map(
          (preset) =>
            `${preset.presetId}\tr${String(preset.revision)}\t${String(preset.phases.length)} phase(s)\t${JSON.stringify(preset.name)}`,
        )
        .join("\n")}\n`;
    }
    case "preset.upsert": {
      const { preset } = result;
      return `preset.upsert: ${result.created ? "created" : "updated"} ${preset.presetId} r${String(preset.revision)} ${String(preset.phases.length)} phase(s) ${JSON.stringify(preset.name)}\n`;
    }
    case "phase.upsert": {
      const { phase } = result;
      return `phase.upsert: ${result.created ? "created" : "updated"} ${phase.phaseId} r${String(phase.revision)} ${phase.mode} ${JSON.stringify(phase.name)}\n`;
    }
    case "project.docs.snapshot": {
      const { snapshot } = result;
      const availability = (value: unknown, unavailableReason: string | null): string =>
        value === null ? `unavailable (${unavailableReason ?? "unknown"})` : "available";
      const missingDocs = snapshot.docs.filter((doc) => !doc.present).map((doc) => doc.key);
      const lines = [
        `project.docs.snapshot: ${snapshot.repositoryRoot} (layout: ${snapshot.layout}, digest ${snapshot.snapshotDigest})`,
        `lifecycle status: ${snapshot.lifecycleStatus.value ?? availability(snapshot.lifecycleStatus.value, snapshot.lifecycleStatus.unavailableReason)}`,
        `last verified: ${snapshot.lastVerifiedAt.value ?? availability(snapshot.lastVerifiedAt.value, snapshot.lastVerifiedAt.unavailableReason)}`,
        `release checklist: ${
          snapshot.releaseChecklist.value === null
            ? availability(null, snapshot.releaseChecklist.unavailableReason)
            : `${String(snapshot.releaseChecklist.value.checkedItems)}/${String(snapshot.releaseChecklist.value.totalItems)} checked`
        }`,
        `open bugs: ${
          snapshot.openBugs.value === null
            ? availability(null, snapshot.openBugs.unavailableReason)
            : `${String(snapshot.openBugs.value.openCount)}/${String(snapshot.openBugs.value.totalCount)}`
        }`,
        `open risks: ${
          snapshot.openRisks.value === null
            ? availability(null, snapshot.openRisks.unavailableReason)
            : `${String(snapshot.openRisks.value.openCount)}/${String(snapshot.openRisks.value.totalCount)}`
        }`,
        missingDocs.length === 0
          ? "all mandated docs present"
          : `missing docs: ${missingDocs.join(", ")}`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "mirror.plan": {
      const { projection, diff } = result;
      const lines = [
        `mirror.plan: project ${projection.projectId}, projection ${projection.projectionDigest}`,
        `lifecycle status: ${projection.lifecycleStatus ?? "unavailable"}`,
        `open bugs: ${String(projection.openBugs.length)}, open risks: ${String(projection.openRisks.length)}, milestones: ${String(projection.milestones.length)}`,
        diff.changed
          ? `${String(diff.changes.length)} change(s) vs previous projection ${diff.previousProjectionDigest ?? "(none)"}:\n${diff.changes
              .map((change) => `  ${change.changeKind}\t${change.field}`)
              .join("\n")}`
          : "no change vs previous projection",
      ];
      return `${lines.join("\n")}\n`;
    }
    case "project.seed": {
      const lines = [
        `project.seed: ${result.repositoryRoot}`,
        `scaffold commit: ${result.scaffoldCommitSha}`,
        `xcodegen: available=${String(result.xcodegen.available)} generated=${String(result.xcodegen.generated)} built=${String(result.xcodegen.built)} -- ${result.xcodegen.detail}`,
        `enrollment: branch ${result.enrollment.branchName ?? "(none)"} commit ${result.enrollment.commitSha ?? "(none)"}, applied ${result.enrollment.appliedActionKinds.join(", ") || "none"}`,
        `convergence: ${result.enrollment.convergence.blocked ? `still blocked (${String(result.enrollment.convergence.blockerIssueIds.length)} blocker(s))` : "clear"}, ${String(result.enrollment.convergence.openIssueCount)} open issue(s)`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "plan.propose":
    case "plan.edit":
    case "plan.approve":
    case "plan.execute":
    case "plan.approve-gate":
    case "plan.status":
      return renderPlan(result.plan);
    case "plan.tick":
      return `${result.advanced ? "advanced" : "no change"}\n${renderPlan(result.plan)}`;
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

/** `plan edit --edits <path>`: the file must contain a JSON array of `ProjectPlanEditV1` objects. */
async function loadPlanEdits(path: string): Promise<readonly ProjectPlanEditV1[]> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new CliUsageError("The edits file is not valid JSON.");
    throw error;
  }
  const parsed = ProjectPlanEditV1Schema.array().min(1).safeParse(decoded);
  if (!parsed.success) {
    throw new CliUsageError("The edits file must contain a non-empty JSON array of plan edits.");
  }
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

/**
 * `phases show <preset>`: there is no dedicated single-preset wire op, so this fetches the full
 * `preset.list` page and selects the matching entry client-side.
 */
async function showPreset(
  client: CommandClient,
  presetId: PhasePresetId,
  mode: CliOutputMode,
  identity: CommandIdentity,
): Promise<string> {
  const { presets } = await client.listPresets(client.createRetryIdentity(identity));
  const preset = presets.find((candidate) => candidate.presetId === presetId);
  if (preset === undefined) {
    throw new CliUsageError(`No preset named ${presetId} exists on this daemon.`);
  }
  if (mode === "json") {
    return `${JSON.stringify({ ok: true, result: { operation: "phases.show", preset } })}\n`;
  }
  const header = `${preset.presetId} r${String(preset.revision)} ${JSON.stringify(preset.name)} (applies to: ${
    preset.appliesTo === null ? "every project kind" : preset.appliesTo.join(", ")
  })`;
  const phases = preset.phases
    .map((phase, index) => {
      const gate = phase.gates.length > 0 ? ` ◆gate[${phase.gates.join(",")}]` : "";
      const participants =
        phase.cast.participants.length === 0
          ? "(no agent participants)"
          : phase.cast.participants
              .map(
                (participant) => `${participant.provider}/${participant.persona ?? "(no persona)"}`,
              )
              .join(", ");
      return `${String(index + 1)}. ${phase.phaseId}\t${phase.mode}${gate}\t${JSON.stringify(phase.name)}\tcast: ${participants}`;
    })
    .join("\n");
  return `${header}\n${phases}\n`;
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
      case "studio.snapshot":
        result = await client.studioSnapshot(identity);
        break;
      case "studio.assistant.query":
        result = await client.assistantQuery(
          invocation.command.question,
          { projectId: invocation.command.projectId },
          identity,
        );
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
      case "run.export":
        result = await client.exportRun(invocation.command.attemptId, identity);
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
      case "project.milestones.list":
        result = await client.listProjectMilestones(invocation.command.projectId, identity);
        break;
      case "project.milestone.upsert":
        result = await client.upsertProjectMilestone(invocation.command.upsert, identity);
        break;
      case "project.seed":
        result = await client.seedProject(
          invocation.command.targetDirectory,
          invocation.command.name,
          identity,
        );
        break;
      case "plan.propose":
        result = await client.proposePlan(invocation.command.propose, identity);
        break;
      case "plan.edit": {
        const edits = await loadPlanEdits(invocation.command.editsFile);
        result = await client.editPlan(
          ProjectPlanEditBatchV1Schema.parse({
            planId: invocation.command.planId,
            expectedRevision: invocation.command.expectedRevision,
            edits,
          }),
          identity,
        );
        break;
      }
      case "plan.approve":
        result = await client.approvePlan(invocation.command.approve, identity);
        break;
      case "plan.execute":
        result = await client.executePlan(invocation.command.execute, identity);
        break;
      case "plan.approve-gate":
        result = await client.approvePlanGate(invocation.command.approveGate, identity);
        break;
      case "plan.status":
        result = await client.planStatus(invocation.command.planId, identity);
        break;
      case "plan.tick":
        result = await client.tickPlan(invocation.command.planId, identity);
        break;
      case "phases.list":
        result = await client.listPresets(identity);
        break;
      case "phases.show": {
        const output = await showPreset(
          client,
          invocation.command.presetId,
          invocation.outputMode,
          identity,
        );
        io.stdout(output);
        return 0;
      }
      case "project.docs.snapshot":
        result = await client.docsSnapshot(invocation.command.repositoryRoot, identity);
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
