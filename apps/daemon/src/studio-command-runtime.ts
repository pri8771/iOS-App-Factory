import { createHash } from "node:crypto";

import {
  AssistantIntentIdSchema,
  AssistantIntentV1Schema,
  CommandRequestV1Schema,
  STUDIO_NOT_YET_WIRED_REASON_V1,
  Sha256DigestSchema,
  StudioSnapshotV1Schema,
  canonicalStudioSnapshotDigestInputV1,
  type AssistantAnswerV1,
  type AssistantCannotAnswerReasonV1,
  type AssistantCitationV1,
  type AssistantIntentPayloadV1,
  type AssistantIntentV1,
  type AssistantQueryV1,
  type AttemptId,
  type CommandId,
  type CommandOriginV1,
  type CommandRequestV1,
  type EventV1,
  type ExecutionAttemptV1,
  type IsoInstant,
  type ProjectLifecycleStageV1,
  type StudioAttemptSummaryV1,
  type StudioAwaitingHumanItemV1,
  type StudioFieldSourceV1,
  type StudioPortfolioAggregatesV1,
  type StudioProjectDocsProvenanceV1,
  type StudioProjectV1,
  type StudioSnapshotV1,
  type StudioTimelineActualV1,
} from "@app-factory/contracts";
import type { FactoryRepositories, LocalPortfolioProjectSummary } from "@app-factory/kernel";
import {
  mapCorpusLifecycleStageToCanonicalV1,
  readProjectDocsSnapshot,
} from "@app-factory/project-docs";

import type { DaemonRuntimeIdFactory } from "./daemon-runtime-ids.js";
import type { ProjectDocsSourceV1 } from "./project-docs-sources.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Studio Phase 2 service surface: composes `StudioSnapshotV1` from the daemon's existing
 * attempts/events/portfolio-projection repositories, answers `AssistantQueryV1` questions with a
 * DETERMINISTIC, rules-based responder over that snapshot, and proposes/validates
 * `AssistantIntentV1` values for `studio.assistant.intent.propose`/`.execute`.
 *
 * There is no LLM anywhere in this file. `computeAssistantAnswerV1` is a fixed keyword-match table
 * over `AssistantQueryV1.question`; `proposeAssistantIntentV1` matches `utterance` against a fixed
 * phrase-prefix table per `AssistantIntentKindV1` and requires every identifier the intent's
 * payload names to appear literally in `utterance`. This is the pre-LLM baseline
 * `docs/roadmap/STUDIO_PHASES.md` Phase 3 describes; a future real assistant can replace the
 * keyword table in `computeAssistantAnswerV1` without changing the wire contract, because callers
 * only ever see `AssistantAnswerV1`'s `answered`/`cannot-answer` shape, never how it was derived.
 *
 * `milestones`, project `gates`, and portfolio `rooms` are always reported empty with an explicit
 * `unavailableReason` (see `STUDIO_NOT_YET_WIRED_REASON_V1` in `@app-factory/contracts`) because
 * the branches that will populate them (`studio/policy-engine-scoping`'s typed gates, rooms) are
 * separate, unmerged worktrees as of this writing. Because of that, `computeAssistantAnswerV1` can
 * never honestly answer a "when does X ship" question today: it looks for a milestone with a real
 * `targetDate`, finds none (there are never any milestones yet), and returns `cannotAnswer`. Once
 * those branches merge and this file is reconciled with their real milestone/gate data, the same
 * lookup starts answering for real with no change to the wire contract.
 *
 * `lifecycleStage` and part of `awaitingHuman`, by contrast, ARE wired for real today, for any
 * project `loadProjectDocsSourcesV1` (`project-docs-sources.ts`) names: they come from that
 * project's own repository docs via `@app-factory/project-docs`, per owner doctrine (the repo is the
 * source of truth). Per the corpus's own authority order
 * (`governance/DOCUMENTATION_POLICY.md`: code is authoritative for current behavior, ahead of
 * feature contracts, decision records, completion reports, and the central standard in that order),
 * `lifecycleStage` prefers real kernel/gate evidence over repo docs whenever both exist --
 * `resolveLifecycleStage` below encodes that precedence, even though no kernel-side source exists to
 * outrank repo docs yet (`studio/lifecycle-reconciliation`'s `TypedGateV1` observations are not
 * persisted anywhere in this daemon), so repo docs win by default in practice today. Every project
 * with a configured source carries a non-null `docsProvenance` recording exactly which source
 * populated it; a project with none configured looks exactly as it did before this file's repo-docs
 * wiring existed.
 */

// Bounded per-project attempt sample used to derive latestAttemptSummary, awaitingHuman, timeline
// actuals, and the portfolio aggregates below. MAX_ATTEMPT_LIST_ITEMS_V1 (100) is the largest page
// AttemptListQueryV1 allows; a project with more than 100 attempts touched within the aggregation
// window (most notably "verified this week") could under-count until this handler pages through
// more than one page, which v1 does not do yet.
const STUDIO_ATTEMPT_SAMPLE_LIMIT_V1 = 100;
const STUDIO_TIMELINE_ACTUAL_LIMIT_V1 = 50;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function latestInstant(...values: readonly string[]): IsoInstant {
  const milliseconds = Math.max(...values.map((value) => Date.parse(value)));
  return new Date(milliseconds).toISOString() as IsoInstant;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const middleValue = sorted[middle];
  const lowerMiddleValue = sorted[middle - 1];
  if (middleValue === undefined) throw new RangeError("median requires at least one value");
  return sorted.length % 2 === 0 && lowerMiddleValue !== undefined
    ? (lowerMiddleValue + middleValue) / 2
    : middleValue;
}

function timelineLabelForEvent(event: EventV1): string | null {
  switch (event.type) {
    case "attempt.created":
      return "attempt started";
    case "attempt.state-changed":
      return `attempt ${event.data.to}`;
    default:
      return null;
  }
}

function buildTimelineActuals(
  repositories: FactoryRepositories,
  attempts: readonly ExecutionAttemptV1[],
): StudioTimelineActualV1[] {
  const actuals: StudioTimelineActualV1[] = [];
  for (const attempt of attempts) {
    for (const event of repositories.events.listByAttempt(attempt.attemptId)) {
      const label = timelineLabelForEvent(event);
      if (label !== null)
        actuals.push({ attemptId: attempt.attemptId, label, occurredAt: event.occurredAt });
    }
  }
  actuals.sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.attemptId.localeCompare(right.attemptId),
  );
  return actuals.slice(0, STUDIO_TIMELINE_ACTUAL_LIMIT_V1);
}

// Docs-derived awaitingHuman items (RELEASE_CHECKLIST.md items still unchecked) are bounded so one
// sparse checklist cannot flood the "awaiting you" list; the checklist's real totals are still fully
// reported in `project.docs.snapshot` for anyone who wants the complete list.
const MAX_DOCS_AWAITING_HUMAN_ITEMS_V1 = 10;

type DocsAugmentationV1 = Readonly<{
  lifecycleStage: ProjectLifecycleStageV1 | null;
  extraAwaitingHuman: StudioAwaitingHumanItemV1[];
  docsProvenance: StudioProjectDocsProvenanceV1;
}>;

/**
 * Precedence: real kernel/gate evidence for this project's lifecycle stage outranks its repo docs
 * whenever both exist (the corpus's "code is authoritative" ordering, applied to `lifecycleStage`
 * specifically). `factoryEvidenceStage` is always `null` today -- no kernel table persists
 * `TypedGateV1`/`ProjectLifecycleStateV1` observations yet -- so repo docs win in practice, but the
 * precedence itself is real code, not just a comment, and needs no change when that kernel wiring
 * eventually lands.
 */
function resolveLifecycleStage(
  factoryEvidenceStage: ProjectLifecycleStageV1 | null,
  docsLifecycleStatusRaw: string | null,
): Readonly<{ stage: ProjectLifecycleStageV1 | null; source: StudioFieldSourceV1 | null }> {
  if (factoryEvidenceStage !== null) {
    return { stage: factoryEvidenceStage, source: "factory-evidence" };
  }
  if (docsLifecycleStatusRaw !== null) {
    const mapped = mapCorpusLifecycleStageToCanonicalV1(docsLifecycleStatusRaw);
    if (mapped !== null) return { stage: mapped, source: "repo-docs" };
  }
  return { stage: null, source: null };
}

/**
 * Reads `source`'s repository docs and derives the fields `buildStudioProject`/
 * `buildObservedStudioProject` fold in. Fails soft (returns `null`), never throws: one
 * unreadable/misconfigured repository must never take the whole portfolio snapshot down.
 */
function buildDocsAugmentation(
  source: ProjectDocsSourceV1,
  observedAt: IsoInstant,
): DocsAugmentationV1 | null {
  let docsSnapshot;
  try {
    docsSnapshot = readProjectDocsSnapshot(source.repositoryRoot, observedAt);
  } catch {
    return null;
  }
  const { stage, source: lifecycleStageSource } = resolveLifecycleStage(
    null,
    docsSnapshot.lifecycleStatus.value,
  );
  const extraAwaitingHuman: StudioAwaitingHumanItemV1[] = (
    docsSnapshot.releaseChecklist.value?.items.filter((item) => !item.checked) ?? []
  )
    .slice(0, MAX_DOCS_AWAITING_HUMAN_ITEMS_V1)
    .map((item) => ({
      kind: "gate-approval",
      attemptId: null,
      summary: item.text,
      since: docsSnapshot.generatedAt,
    }));
  return {
    lifecycleStage: stage,
    extraAwaitingHuman,
    docsProvenance: {
      sourceKind: source.enrolled ? "enrolled" : "observed",
      repositoryRoot: source.repositoryRoot,
      docsSnapshotDigest: docsSnapshot.snapshotDigest,
      lifecycleStageSource,
      awaitingHumanFromDocsCount: extraAwaitingHuman.length,
    },
  };
}

type StudioProjectBuild = Readonly<{
  project: StudioProjectV1;
  sampledAttempts: readonly ExecutionAttemptV1[];
}>;

/**
 * Builds a full `StudioProjectV1` for a repo-docs source that has no kernel attempt history at all
 * (an "observed" project: known to the factory, not yet enrolled). Every attempt/gate/milestone
 * field is honestly empty/unavailable -- there is genuinely nothing there yet -- while
 * `lifecycleStage`/`awaitingHuman`/`docsProvenance` are real, read from the repository the same way
 * an enrolled project's are.
 */
function buildObservedStudioProject(
  source: ProjectDocsSourceV1,
  observedAt: IsoInstant,
): StudioProjectBuild | null {
  const augmentation = buildDocsAugmentation(source, observedAt);
  if (augmentation === null) return null;
  const project: StudioProjectV1 = {
    projectId: source.projectId,
    name: source.name,
    lifecycleStage: augmentation.lifecycleStage,
    gates: {
      typed: null,
      owner: null,
      state: "unavailable",
      unavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
    },
    latestAttemptSummary: null,
    awaitingHuman: augmentation.extraAwaitingHuman,
    timeline: {
      milestones: [],
      milestonesUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
      actuals: [],
    },
    docsProvenance: augmentation.docsProvenance,
  };
  return { project, sampledAttempts: [] };
}

function buildStudioProject(
  repositories: FactoryRepositories,
  summary: LocalPortfolioProjectSummary,
  docsSource: ProjectDocsSourceV1 | undefined,
  observedAt: IsoInstant,
): StudioProjectBuild {
  const page = repositories.attempts.list({
    scope: "all",
    projectId: summary.projectId,
    after: null,
    limit: STUDIO_ATTEMPT_SAMPLE_LIMIT_V1,
  });
  // AttemptListPageV1 is ordered updatedAt/attemptId descending, so the first row is the latest.
  const sampledAttempts = page.attempts.map((item) => item.attempt);
  const latest = sampledAttempts[0] ?? null;
  const latestAttemptSummary: StudioAttemptSummaryV1 | null =
    latest === null
      ? null
      : {
          attemptId: latest.attemptId,
          taskId: latest.taskId,
          state: latest.state,
          updatedAt: latest.updatedAt,
          blocker: latest.blocker,
        };
  const blockedAttemptItems: StudioAwaitingHumanItemV1[] = sampledAttempts
    .filter((attempt) => attempt.state === "blocked")
    .map((attempt) => ({
      kind: "blocked-attempt",
      attemptId: attempt.attemptId,
      summary: attempt.blocker?.summary ?? "Attempt is blocked and needs an operator answer.",
      since: attempt.updatedAt,
    }));

  const augmentation =
    docsSource === undefined ? null : buildDocsAugmentation(docsSource, observedAt);

  const project: StudioProjectV1 = {
    projectId: summary.projectId,
    // Mirrors buildLocalPortfolioReadModel's own placeholder displayName in command-runtime.ts:
    // no project-manifest/display-name source is wired into the local execution profile yet.
    name: `Project ${summary.projectId}`,
    lifecycleStage: augmentation?.lifecycleStage ?? null,
    gates: {
      typed: null,
      owner: null,
      state: "unavailable",
      unavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
    },
    latestAttemptSummary,
    awaitingHuman: [...blockedAttemptItems, ...(augmentation?.extraAwaitingHuman ?? [])],
    timeline: {
      milestones: [],
      milestonesUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
      actuals: buildTimelineActuals(repositories, sampledAttempts),
    },
    docsProvenance: augmentation?.docsProvenance ?? null,
  };
  return { project, sampledAttempts };
}

function computePortfolioAggregates(
  builds: readonly StudioProjectBuild[],
  generatedAt: IsoInstant,
): StudioPortfolioAggregatesV1 {
  const allAttempts = builds.flatMap((build) => build.sampledAttempts);
  const cutoffMs = Date.parse(generatedAt) - ONE_WEEK_MS;

  const verifiedThisWeekCount = allAttempts.filter(
    (attempt) =>
      attempt.outcome?.kind === "succeeded" &&
      attempt.terminalAt !== null &&
      Date.parse(attempt.terminalAt) >= cutoffMs,
  ).length;

  const awaitingYouCount = builds.reduce(
    (sum, build) => sum + build.project.awaitingHuman.length,
    0,
  );

  const decisiveAttempts = allAttempts.filter(
    (attempt) => attempt.outcome?.kind === "succeeded" || attempt.outcome?.kind === "failed",
  );
  const succeededCount = decisiveAttempts.filter(
    (attempt) => attempt.outcome?.kind === "succeeded",
  ).length;

  const runDurationsSeconds = allAttempts
    .filter(
      (attempt): attempt is ExecutionAttemptV1 & { terminalAt: string } =>
        attempt.outcome?.kind === "succeeded" && attempt.terminalAt !== null,
    )
    .map((attempt) => (Date.parse(attempt.terminalAt) - Date.parse(attempt.createdAt)) / 1_000)
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0);

  return {
    verifiedThisWeek: { value: verifiedThisWeekCount, unavailableReason: null },
    awaitingYouCount: { value: awaitingYouCount, unavailableReason: null },
    passRate:
      decisiveAttempts.length === 0
        ? {
            value: null,
            unavailableReason:
              "no succeeded or failed attempts found in the sampled attempt window",
          }
        : { value: succeededCount / decisiveAttempts.length, unavailableReason: null },
    medianRunSeconds:
      runDurationsSeconds.length === 0
        ? {
            value: null,
            unavailableReason:
              "no succeeded attempts with a recorded run duration in the sampled attempt window",
          }
        : { value: median(runDurationsSeconds), unavailableReason: null },
    // Genuinely not computable yet: no daemon aggregation correlates step timing into an
    // agent-active-window ratio. Left explicitly unavailable rather than defaulted to 0 or 1.
    agentWindowShare: {
      value: null,
      unavailableReason:
        "not yet computed: step-level timing is not aggregated into an agent-active-window ratio",
    },
  };
}

/**
 * `docsSources` names every project (enrolled or merely observed) whose repository docs should be
 * folded into this snapshot -- see `loadProjectDocsSourcesV1` (`project-docs-sources.ts`). A source
 * whose `projectId` already has kernel attempt history augments that project's normal build; a
 * source with none synthesizes a full, honestly-empty-elsewhere `StudioProjectV1` entry (an
 * "observed" project the factory knows about but has not enrolled), so the dashboard can show every
 * configured project rather than silently omitting the ones with no attempts yet.
 */
export function buildStudioSnapshotV1(
  repositories: FactoryRepositories,
  observedAt: IsoInstant,
  docsSources: readonly ProjectDocsSourceV1[] = [],
): StudioSnapshotV1 {
  const summaries = repositories.portfolio.listProjectSummaries();
  const summaryProjectIds = new Set(summaries.map((summary) => summary.projectId));
  const docsSourceByProjectId = new Map(
    docsSources.map((source) => [source.projectId, source] as const),
  );

  const enrolledBuilds = summaries.map((summary) =>
    buildStudioProject(
      repositories,
      summary,
      docsSourceByProjectId.get(summary.projectId),
      observedAt,
    ),
  );
  const observedBuilds = docsSources
    .filter((source) => !summaryProjectIds.has(source.projectId))
    .map((source) => buildObservedStudioProject(source, observedAt))
    .filter((build): build is StudioProjectBuild => build !== null);

  const builds = [...enrolledBuilds, ...observedBuilds].sort((left, right) =>
    `${left.project.name.toLowerCase()} ${left.project.projectId}`.localeCompare(
      `${right.project.name.toLowerCase()} ${right.project.projectId}`,
    ),
  );

  const activityTimestamps = builds.flatMap((build) => [
    ...(build.project.latestAttemptSummary === null
      ? []
      : [build.project.latestAttemptSummary.updatedAt]),
    ...build.project.timeline.actuals.map((actual) => actual.occurredAt),
  ]);
  const generatedAt = latestInstant(observedAt, ...activityTimestamps);

  const envelope = {
    schemaVersion: 1 as const,
    generatedAt,
    projects: builds.map((build) => build.project),
    rooms: [],
    roomsUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
    portfolio: computePortfolioAggregates(builds, generatedAt),
  };
  const sourceSnapshotDigest = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalStudioSnapshotDigestInputV1(envelope)).digest("hex")}`,
  );
  return StudioSnapshotV1Schema.parse({ ...envelope, sourceSnapshotDigest });
}

// ---------------------------------------------------------------------------
// studio.assistant.query — deterministic rules-based responder (the pre-LLM baseline).
// ---------------------------------------------------------------------------

const DATE_KEYWORDS_V1 = ["when", "date", "ship", "eta", "deadline", "due"];
const STATUS_KEYWORDS_V1 = ["status", "state", "progress", "how is", "where"];
const COUNT_KEYWORDS_V1 = ["how many", "count", "awaiting", "blocked", "waiting"];

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function cannotAnswer(reason: AssistantCannotAnswerReasonV1, detail: string): AssistantAnswerV1 {
  return { kind: "cannot-answer", schemaVersion: 1, cannotAnswer: { reason, detail } };
}

function answerDateQuestion(
  snapshot: StudioSnapshotV1,
  scopedProject: StudioProjectV1 | undefined,
): AssistantAnswerV1 {
  const projects = scopedProject === undefined ? snapshot.projects : [scopedProject];
  for (const project of projects) {
    const dated = project.timeline.milestones.find((milestone) => milestone.targetDate !== null);
    if (dated !== undefined && dated.targetDate !== null) {
      return {
        kind: "answered",
        schemaVersion: 1,
        text: `${project.name}'s "${dated.name}" milestone targets ${dated.targetDate}.`,
        citations: [{ kind: "milestone", id: dated.milestoneId }],
      };
    }
  }
  // Always reached today: `milestones` is always empty until studio/milestones-and-phase merges
  // (see the module doc comment), so this is the "no honest date" refusal by construction.
  return cannotAnswer(
    "no-milestone-target-date",
    "No milestone with a real target date exists yet in the current snapshot; the assistant does not invent one.",
  );
}

function answerStatusQuestion(scopedProject: StudioProjectV1 | undefined): AssistantAnswerV1 {
  if (scopedProject === undefined) {
    return cannotAnswer(
      "no-matching-project",
      "Scope the question to one project (AssistantQueryV1.projectId) to ask about its status.",
    );
  }
  if (scopedProject.latestAttemptSummary === null) {
    return cannotAnswer("no-matching-data", `${scopedProject.name} has no recorded attempts yet.`);
  }
  const attempt = scopedProject.latestAttemptSummary;
  const awaitingCount = scopedProject.awaitingHuman.length;
  return {
    kind: "answered",
    schemaVersion: 1,
    text: `${scopedProject.name}'s latest attempt is ${attempt.state} (updated ${attempt.updatedAt})${
      awaitingCount > 0 ? `; ${String(awaitingCount)} item(s) await you.` : "."
    }`,
    citations: [{ kind: "attempt", id: attempt.attemptId }],
  };
}

function answerCountQuestion(snapshot: StudioSnapshotV1): AssistantAnswerV1 {
  const items = snapshot.projects.flatMap((project) =>
    project.awaitingHuman.filter(
      (item): item is StudioAwaitingHumanItemV1 & { attemptId: AttemptId } =>
        item.attemptId !== null,
    ),
  );
  const citations: AssistantCitationV1[] =
    items.length === 0
      ? [{ kind: "doc", id: snapshot.sourceSnapshotDigest }]
      : items.slice(0, 50).map((item) => ({ kind: "attempt", id: item.attemptId }));
  return {
    kind: "answered",
    schemaVersion: 1,
    text:
      items.length === 0
        ? "Nothing is currently awaiting you across the portfolio."
        : `${String(items.length)} item(s) are awaiting you across the portfolio.`,
    citations,
  };
}

/**
 * Deterministic, keyword-table rules engine — see the module doc comment. Never consults an LLM,
 * never fabricates a citation, and never states a date it cannot point at inside `snapshot`.
 */
export function computeAssistantAnswerV1(
  snapshot: StudioSnapshotV1,
  query: AssistantQueryV1,
): AssistantAnswerV1 {
  const scopedProject =
    query.projectId === null
      ? undefined
      : snapshot.projects.find((project) => project.projectId === query.projectId);
  if (query.projectId !== null && scopedProject === undefined) {
    return cannotAnswer(
      "no-matching-project",
      `No project with ID ${query.projectId} exists in the current snapshot.`,
    );
  }

  const question = query.question.toLowerCase();
  if (containsAny(question, DATE_KEYWORDS_V1)) return answerDateQuestion(snapshot, scopedProject);
  if (containsAny(question, STATUS_KEYWORDS_V1)) return answerStatusQuestion(scopedProject);
  if (containsAny(question, COUNT_KEYWORDS_V1)) return answerCountQuestion(snapshot);
  return cannotAnswer(
    "no-matching-data",
    'This baseline assistant only answers status, count, or "when does X ship" questions grounded in the current snapshot.',
  );
}

// ---------------------------------------------------------------------------
// studio.assistant.intent.propose / .execute
// ---------------------------------------------------------------------------

const INTENT_PHRASE_PREFIX_V1: Readonly<Record<AssistantIntentPayloadV1["kind"], string>> = {
  "queue-task": "queue ",
  "run-phase": "run ",
  "scan-project": "scan ",
  "enroll-project": "enroll ",
  "approve-attempt": "approve ",
};

function identifiersOf(payload: AssistantIntentPayloadV1): readonly string[] {
  switch (payload.kind) {
    case "queue-task":
    case "run-phase":
      return [payload.taskSpec.taskId];
    case "scan-project":
      return [payload.repositoryRoot];
    case "enroll-project":
      return [payload.planDigest];
    case "approve-attempt":
      return [payload.attemptId];
  }
}

/**
 * The daemon's entire "phrasing" understanding: `utterance` must start with the fixed prefix for
 * `payload.kind`, and every identifier `payload` names (a task ID, a path, a digest, an attempt ID)
 * must appear literally in `utterance`. Deterministic and re-run on every execute (not just
 * propose), so execute never trusts a client-echoed intent it has not independently re-validated.
 */
function assertUtteranceMatchesIntentV1(
  utterance: string,
  payload: AssistantIntentPayloadV1,
): void {
  const normalized = utterance.trim().toLowerCase();
  const prefix = INTENT_PHRASE_PREFIX_V1[payload.kind];
  if (!normalized.startsWith(prefix)) {
    throw new CommandHandlerError(
      "assistant.intent-utterance-mismatch",
      `An utterance proposing a "${payload.kind}" intent must start with "${prefix}".`,
      false,
    );
  }
  for (const identifier of identifiersOf(payload)) {
    if (!utterance.includes(identifier)) {
      throw new CommandHandlerError(
        "assistant.intent-utterance-mismatch",
        `The utterance must literally mention ${identifier}, the identifier this intent targets.`,
        false,
      );
    }
  }
}

function summarizeIntentPayloadV1(payload: AssistantIntentPayloadV1): string {
  switch (payload.kind) {
    case "queue-task":
      return `Queue task "${payload.taskSpec.title}" (${payload.taskSpec.taskId}) for project ${payload.taskSpec.projectId}.`;
    case "run-phase":
      return `Run task "${payload.taskSpec.title}" (${payload.taskSpec.taskId}) for project ${payload.taskSpec.projectId} now.`;
    case "scan-project":
      return `Scan ${payload.repositoryRoot} for enrollment readiness.`;
    case "enroll-project":
      return `Apply enrollment plan ${payload.planDigest}${
        payload.branchName === null ? "" : ` on branch ${payload.branchName}`
      }.`;
    case "approve-attempt":
      return `Approve attempt ${payload.attemptId} and resume it with the given answer.`;
  }
}

export function proposeAssistantIntentV1(
  input: Readonly<{ utterance: string; intent: AssistantIntentPayloadV1 }>,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
  commandId: CommandId,
): AssistantIntentV1 {
  assertUtteranceMatchesIntentV1(input.utterance, input.intent);
  return AssistantIntentV1Schema.parse({
    schemaVersion: 1,
    intentId: AssistantIntentIdSchema.parse(idFactory("assistant-intent", commandId)),
    utterance: input.utterance,
    payload: input.intent,
    summary: summarizeIntentPayloadV1(input.intent),
    requiresConfirmation: true,
    proposedAt: observedAt,
  });
}

/**
 * Re-validates `intent` from scratch (the same phrase/identifier check `proposeAssistantIntentV1`
 * ran) and builds the exact inner `CommandRequestV1` execute dispatches to. `innerCommandId` is
 * minted by the caller (deterministically, from the outer execute command's own commandId) so a
 * retried execute call derives the identical inner commandId and rides the target operation's own
 * existing idempotency, rather than this file inventing a second one.
 */
export function buildAssistantIntentDispatchRequestV1(
  intent: AssistantIntentV1,
  outer: Readonly<{ issuedAt: IsoInstant; origin: CommandOriginV1 }>,
  innerCommandId: CommandId,
): CommandRequestV1 {
  if (!intent.requiresConfirmation) {
    throw new CommandHandlerError(
      "assistant.intent-not-confirmable",
      "This intent does not require confirmation and cannot be dispatched through execute.",
      false,
    );
  }
  assertUtteranceMatchesIntentV1(intent.utterance, intent.payload);
  const base = {
    schemaVersion: 1 as const,
    commandId: innerCommandId,
    issuedAt: outer.issuedAt,
    origin: outer.origin,
  };
  switch (intent.payload.kind) {
    case "queue-task":
      return CommandRequestV1Schema.parse({
        ...base,
        operation: "task.submit",
        payload: { taskSpec: intent.payload.taskSpec },
      });
    case "run-phase":
      return CommandRequestV1Schema.parse({
        ...base,
        operation: "task.run",
        payload: { taskSpec: intent.payload.taskSpec },
      });
    case "scan-project":
      return CommandRequestV1Schema.parse({
        ...base,
        operation: "project.scan",
        payload: { repositoryRoot: intent.payload.repositoryRoot },
      });
    case "enroll-project":
      return CommandRequestV1Schema.parse({
        ...base,
        operation: "project.apply",
        payload: { planDigest: intent.payload.planDigest, branchName: intent.payload.branchName },
      });
    case "approve-attempt":
      return CommandRequestV1Schema.parse({
        ...base,
        operation: "attempt.unblock",
        payload: { attemptId: intent.payload.attemptId, answer: intent.payload.answer },
      });
  }
}
