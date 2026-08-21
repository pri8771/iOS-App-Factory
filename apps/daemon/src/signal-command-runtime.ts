import { createHash, randomUUID } from "node:crypto";

import {
  RoomPersonaSchema,
  Sha256DigestSchema,
  SignalIdSchema,
  SignalScoutFindingV1Schema,
  canonicalSignalInsightDigestInputV1,
  type CommandRequestV1,
  type CommandResultV1,
  type IsoInstant,
  type SignalId,
  type SignalInsightId,
  type SignalInsightV1,
  type SignalScoutFindingV1,
  type SignalScoutRunOutcomeV1,
  type SignalV1,
} from "@app-factory/contracts";
import type { FactoryRepositories } from "@app-factory/kernel";
import type { ParticipantAdapter, ParticipantContext } from "@app-factory/studio-room-adapters";
import type { RoomProviderCatalogPort } from "@app-factory/studio-rooms";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `signal.create` / `signal.list` / `signal.pause` / `signal.resume` / `insight.list`: plain
 * repository reads and writes, no network or model call -- dispatched through the normal serial
 * executor exactly like `plan.approve`/`project.register`. `signal.run-now`'s actual Scout
 * execution (`runSignalScout` below) is deliberately NOT here: that one call is a real model round
 * trip and is orchestrated outside the serial executor by `command-runtime.ts`, mirroring
 * `release.observe` exactly -- see `runSignalScout`'s own doc comment for why its result is still a
 * pure function of its inputs, with no ledger or repository access of its own.
 */

function notFound(signalId: string): never {
  throw new CommandHandlerError("signal.not-found", `Signal ${signalId} does not exist.`, false);
}

export function executeSignalCreateCommand(
  repositories: Pick<FactoryRepositories, "signals">,
  request: Extract<CommandRequestV1, { operation: "signal.create" }>,
  observedAt: IsoInstant,
  signalId: SignalId,
): CommandResultV1 {
  const created = repositories.signals.create({
    signalId,
    name: request.payload.name,
    watchDescription: request.payload.watchDescription,
    scoutProvider: request.payload.scoutProvider,
    createdAt: observedAt,
    checkIntervalMinutes: request.payload.checkIntervalMinutes,
  });
  return { operation: "signal.create", signal: created };
}

export function buildSignalListResultV1(
  repositories: Pick<FactoryRepositories, "signals">,
): CommandResultV1 {
  return { operation: "signal.list", signals: [...repositories.signals.list()] };
}

function requireSignal(
  repositories: Pick<FactoryRepositories, "signals">,
  signalIdInput: string,
): SignalV1 {
  const signalId = SignalIdSchema.parse(signalIdInput);
  const signal = repositories.signals.findById(signalId);
  if (signal === null) notFound(signalId);
  return signal;
}

export function executeSignalPauseCommand(
  repositories: Pick<FactoryRepositories, "signals">,
  request: Extract<CommandRequestV1, { operation: "signal.pause" }>,
): CommandResultV1 {
  const existing = requireSignal(repositories, request.payload.signalId);
  const signal = repositories.signals.setStatus(existing.signalId, "paused");
  return { operation: "signal.pause", signal };
}

export function executeSignalResumeCommand(
  repositories: Pick<FactoryRepositories, "signals">,
  request: Extract<CommandRequestV1, { operation: "signal.resume" }>,
): CommandResultV1 {
  const existing = requireSignal(repositories, request.payload.signalId);
  const signal = repositories.signals.setStatus(existing.signalId, "active");
  return { operation: "signal.resume", signal };
}

/** Sets or clears (`null`) a signal's scheduled check interval (Architecture decision 11). A plain
 *  repository write dispatched through the normal serial executor, exactly like pause/resume --
 *  the scheduler itself (`signal-scheduler.ts`) only ever READS `checkIntervalMinutes`. */
export function executeSignalRescheduleCommand(
  repositories: Pick<FactoryRepositories, "signals">,
  request: Extract<CommandRequestV1, { operation: "signal.reschedule" }>,
): CommandResultV1 {
  const existing = requireSignal(repositories, request.payload.signalId);
  const signal = repositories.signals.reschedule(
    existing.signalId,
    request.payload.checkIntervalMinutes,
  );
  return { operation: "signal.reschedule", signal };
}

export function buildInsightListResultV1(
  repositories: Pick<FactoryRepositories, "signals" | "signalInsights">,
  request: Extract<CommandRequestV1, { operation: "insight.list" }>,
): CommandResultV1 {
  const signal = requireSignal(repositories, request.payload.signalId);
  return {
    operation: "insight.list",
    insights: [...repositories.signalInsights.listBySignal(signal.signalId)],
  };
}

/** The Scout resolver: any configured `ParticipantAdapter` may act as a Scout, looked up by the
 *  same provider key a room's cast would use. Deliberately a narrower, string-keyed port (not
 *  `PhaseParticipantsPort` itself, whose `resolve` is typed over the distinct `PhaseProvider`
 *  brand) -- the daemon composes it from the SAME configured adapters
 *  (`phaseParticipants`/`buildPhaseParticipantsPortV1` in `room-participants-config.ts`); see
 *  `command-runtime.ts`'s composition of `runSignalNow`. */
export type SignalScoutParticipantsPort = Readonly<{
  resolve(provider: string): ParticipantAdapter | null;
}>;

/**
 * Runs one signal's Scout once: resolves its configured adapter, builds a research-flavored
 * `ParticipantContext` (the room charter IS the watch description; the transcript carries the
 * signal's most recent insight headlines so the Scout can recognize what it has already reported
 * and pass rather than repeat itself; `networkEnabled` is always true -- that is the whole point of
 * a Scout), and calls `contribute()` -- the exact same call a chat room makes, deciding whether to
 * speak. A `{kind: "pass"}` answer means nothing new; a `{kind: "message"}` answer is parsed
 * strictly against `SignalScoutFindingV1Schema` (zod, fail closed) -- a malformed answer, even from
 * a model that "found something," is refused exactly like a malformed chat contribution, never
 * trusted as evidence. A `{kind: "error"}` answer is refused too, folded into `scout-error`.
 *
 * Pure with respect to the daemon's durable state: this function persists nothing and never reads
 * or writes the ledger or the repositories. Its caller (`command-runtime.ts`'s `runSignalNow`)
 * decides what to do with the outcome, mirroring `release-command-runtime.ts`'s
 * `AscReadObserver.observe` returning a value for its own caller to persist.
 *
 * Known first-cut limitation, deliberately not fixed here: the underlying adapters (Ollama,
 * OpenRouter) hard-cap chat output at 150 tokens regardless of `maxOutputTokens` -- fine for a
 * chat message, tight for a headline plus rationale plus citations. Widening that needs a small,
 * separate change to those adapters (a Scout-specific output cap), not a workaround here.
 */
export async function runSignalScout(
  adapters: SignalScoutParticipantsPort,
  signal: SignalV1,
  recentInsightHeadlines: readonly string[],
  options: Readonly<{ signal: AbortSignal }>,
): Promise<SignalScoutRunOutcomeV1> {
  const adapter = adapters.resolve(String(signal.scoutProvider));
  if (adapter === null) {
    return {
      kind: "scout-failed",
      code: "scout-not-configured",
      message: `No configured room participant answers to provider "${signal.scoutProvider}"; configure it (APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG) before running this signal.`,
      usage: null,
    };
  }
  const context: ParticipantContext = {
    persona: RoomPersonaSchema.parse("scout"),
    roomCharter: signal.watchDescription,
    rollingSummary: "",
    personaCharter:
      "You are a research Scout, not a chat participant: your job is to search for genuinely NEW, " +
      "concrete developments related to the charter above -- not to converse. The 'most recent " +
      "messages' below are headlines you already reported; if you have nothing beyond them, pass. " +
      "If you find something new, report exactly one finding as the required JSON object: " +
      '{"schemaVersion":1,"headline":"...","rationale":"...","confidence":"weak"|"moderate"|"strong",' +
      '"citations":[{"url":"...","title":"..."}]} -- citations are required; never report a claim ' +
      "you cannot cite a real source for.",
    transcript: recentInsightHeadlines.map((headline) => ({
      author: "scout (already reported)",
      body: headline,
    })),
    networkEnabled: true,
    maxOutputTokens: 800,
    signal: options.signal,
    reportWorkerPid: () => undefined,
  };
  const contribution = await adapter.contribute(context);
  if (contribution.kind === "pass") return { kind: "nothing-new", usage: contribution.usage };
  if (contribution.kind === "error") {
    return {
      kind: "scout-failed",
      code: "scout-error",
      message: `Scout "${signal.scoutProvider}" answered with error(${contribution.code}).`,
      usage: null,
    };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(contribution.text) as unknown;
  } catch {
    return {
      kind: "scout-failed",
      code: "scout-malformed-finding",
      message: "Scout answer was not valid JSON.",
      usage: contribution.usage,
    };
  }
  const parsed = SignalScoutFindingV1Schema.safeParse(decoded);
  if (!parsed.success) {
    return {
      kind: "scout-failed",
      code: "scout-malformed-finding",
      message: `Scout answer did not match the required finding schema: ${parsed.error.issues[0]?.message ?? "invalid"}.`,
      usage: contribution.usage,
    };
  }
  return { kind: "found", finding: parsed.data, usage: contribution.usage };
}

/** Projects a Scout's accepted finding onto the durable shape, minus `insightDigest` (the caller
 *  computes and appends that, mirroring `ascReleaseObservationDigestInputV1`'s split). */
export function insightFromFinding(
  finding: SignalScoutFindingV1,
  ids: Readonly<{
    insightId: SignalInsightV1["insightId"];
    signalId: SignalId;
    discoveredAt: IsoInstant;
  }>,
): Omit<SignalInsightV1, "insightDigest"> {
  return {
    schemaVersion: 1,
    insightId: ids.insightId,
    signalId: ids.signalId,
    discoveredAt: ids.discoveredAt,
    headline: finding.headline,
    rationale: finding.rationale,
    confidence: finding.confidence,
    citations: finding.citations,
  };
}

export type PerformSignalCheckDependencies = Readonly<{
  scoutParticipants: SignalScoutParticipantsPort;
  signals: Pick<FactoryRepositories["signals"], "recordCheck">;
  signalInsights: Pick<FactoryRepositories["signalInsights"], "record" | "listBySignal">;
  /** The honest token ledger (Wave 7, Architecture decision 6): one `source: "signal"` row per
   *  scout call that reported usable usage. */
  tokenUsage: Pick<FactoryRepositories["tokenUsage"], "append">;
  /** Resolves `signal.scoutProvider` to the family/model the `token_usage` row attributes to --
   *  the SAME participants config `scoutParticipants` was built from. */
  providerCatalog: RoomProviderCatalogPort;
}>;

export type PerformSignalCheckResult = Readonly<{
  signal: SignalV1;
  insight: SignalInsightV1 | null;
  outcome: SignalScoutRunOutcomeV1;
}>;

/**
 * The shared scout-execution core of `signal.run-now` (Wave 7): resolves recent headlines, calls
 * `runSignalScout`, records an accepted finding as a durable Insight, appends one `token_usage` row
 * whenever the scout call reported usable usage, and always calls `recordCheck` -- whether the
 * scout found something, found nothing new, or failed outright (`SignalScoutRunOutcomeV1`'s three
 * kinds). Extracted from `command-runtime.ts`'s `runSignalNow` so the new `signal-scheduler.ts` loop
 * shares the exact same core; the wire `signal.run-now` op keeps its own command-ledger idempotency
 * envelope (ledger check before, persist after) wrapped AROUND a call to this function, mirroring
 * `release.observe`'s shape. `ids.insightId` is minted by the caller -- `command-runtime.ts` derives
 * it from the commandId, `signal-scheduler.ts` from a slot-aligned identity -- so a retried check
 * dedupes through `signalInsights.record`'s own digest-matching idempotency (same ID + same digest
 * -> `inserted: false`), never a duplicate row. A genuine conflict (same ID, a DIFFERENT digest --
 * e.g. a live model answering differently on a same-slot retry) is a real edge case neither this
 * function nor its pre-Wave-7 predecessor specially handles: `signalInsights.record` throws, and
 * `recordCheck` is skipped for that attempt, exactly like today's `signal.run-now` on an equivalent
 * repository-level conflict -- the caller's own retry/backoff (the scheduler's bounded backoff, or a
 * client re-issuing `signal.run-now`) is what recovers, not a fabricated success here.
 */
export async function performSignalCheck(
  deps: PerformSignalCheckDependencies,
  signal: SignalV1,
  ids: Readonly<{ insightId: SignalInsightId }>,
  now: IsoInstant,
  options: Readonly<{ signal: AbortSignal }>,
): Promise<PerformSignalCheckResult> {
  const recentHeadlines = deps.signalInsights
    .listBySignal(signal.signalId)
    .slice(0, 10)
    .map((insight) => insight.headline);
  const outcome = await runSignalScout(deps.scoutParticipants, signal, recentHeadlines, options);

  let insight: SignalInsightV1 | null = null;
  if (outcome.kind === "found") {
    const draft = insightFromFinding(outcome.finding, {
      insightId: ids.insightId,
      signalId: signal.signalId,
      discoveredAt: now,
    });
    const insightDigest = Sha256DigestSchema.parse(
      `sha256:${createHash("sha256")
        .update(canonicalSignalInsightDigestInputV1(draft), "utf8")
        .digest("hex")}`,
    );
    const recorded = deps.signalInsights.record({ ...draft, insightDigest });
    insight = recorded.insight;
  }

  const usage = outcome.usage;
  if (usage !== null) {
    const info = deps.providerCatalog.resolve(signal.scoutProvider);
    deps.tokenUsage.append({
      schemaVersion: 1,
      usageId: randomUUID(),
      occurredAt: now,
      providerFamily: info.family,
      providerKey: signal.scoutProvider,
      model: info.model,
      source: "signal",
      roomId: null,
      phaseRunId: null,
      signalId: signal.signalId,
      inputTokens: usage.reported?.inputTokens ?? null,
      outputTokens: usage.reported?.outputTokens ?? null,
      cachedInputTokens: usage.reported?.cachedInputTokens ?? null,
      costUsdMicros: usage.costUsdMicros ?? null,
    });
  }

  const updatedSignal = deps.signals.recordCheck(signal.signalId, now, insight !== null);
  return { signal: updatedSignal, insight, outcome };
}
