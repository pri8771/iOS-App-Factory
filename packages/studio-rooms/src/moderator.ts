import { randomUUID } from "node:crypto";

import {
  AgentUsageV1Schema,
  IsoInstantSchema,
  MAX_ROOM_MESSAGE_BODY_LENGTH_V1,
  NonNegativeSafeIntegerSchema,
  ROOM_MAX_CONSECUTIVE_AGENT_MESSAGES_V1,
  RoomAgentErrorCodeV1Schema,
  RoomGrantIdSchema,
  RoomMessageIdSchema,
  type IsoInstant,
  type RoomAgentErrorCodeV1,
  type RoomAttendanceV1,
  type RoomChatMessageV1,
  type RoomGrantId,
  type RoomGrantOutcomeV1,
  type RoomGrantV1,
  type RoomId,
  type RoomMessageV1,
  type RoomParticipantV1,
  type RoomPersona,
  type RoomTriggerV1,
  type RoomV1,
} from "@app-factory/contracts";
import { z } from "zod";

import { RoomAgentFailure, RoomError, RoomHeadMovedError } from "./errors.js";
import type {
  ContributorPort,
  QuotaGovernorPort,
  QuotaReservation,
  RevalidatePort,
  RoomClockPort,
  RoomContributionResult,
  RoomIdFactoryPort,
  RoomProcessPort,
  RoomRandomPort,
  RoomRevalidationDecision,
  RoomScorerCandidate,
  RoomUrgency,
  RoomWaitPort,
  ScorerPort,
} from "./ports.js";
import { unlimitedQuotaGovernor } from "./quota-governor.js";
import type { RoomRepository } from "./repository.js";

export const DEFAULT_ROOM_DORMANCY_MS = 10 * 60_000;
export const DEFAULT_ROOM_LEASE_MS = 120_000;
export const DEFAULT_ROOM_SCORER_TIMEOUT_MS = 30_000;
export const DEFAULT_ROOM_REVALIDATE_TIMEOUT_MS = 30_000;
export const DEFAULT_ROOM_TRANSCRIPT_WINDOW = 50;
export const MAX_ROOM_REVALIDATIONS_PER_GRANT = 3;
const MAX_LEASE_MS = 60 * 60_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_TRANSCRIPT_WINDOW = 500;

export type RoomBenchPolicy = Readonly<{
  /** Rate limit with no provider reset hint: bench the whole provider this long. */
  limitDefaultBenchMs: number;
  /** Timeout: bench the persona this long. */
  timeoutBenchMs: number;
  /** Capacity: bench the persona for base ± jitter, retried soon. */
  capacityBenchBaseMs: number;
  capacityJitterFraction: number;
  /** Untyped adapter failure: bench the persona this long. */
  internalBenchMs: number;
}>;

export const DEFAULT_ROOM_BENCH_POLICY: RoomBenchPolicy = {
  limitDefaultBenchMs: 15 * 60_000,
  timeoutBenchMs: 60_000,
  capacityBenchBaseMs: 20_000,
  capacityJitterFraction: 0.5,
  internalBenchMs: 60_000,
};

export type RoomModeratorOptions = Readonly<{
  repository: RoomRepository;
  scorer: ScorerPort;
  contributor: ContributorPort;
  revalidator: RevalidatePort;
  process: RoomProcessPort;
  clock?: RoomClockPort;
  wait?: RoomWaitPort;
  random?: RoomRandomPort;
  ids?: RoomIdFactoryPort;
  quota?: QuotaGovernorPort;
  dormancyMs?: number;
  leaseDurationMs?: number;
  scorerTimeoutMs?: number;
  revalidateTimeoutMs?: number;
  transcriptWindow?: number;
  benchPolicy?: RoomBenchPolicy;
}>;

export type RoomRoundOutcome =
  | Readonly<{
      kind: "deferred";
      reason: "generation-in-flight" | "human-typing";
      retryAt: IsoInstant | null;
    }>
  | Readonly<{
      kind: "refused";
      reason:
        | "room-dormant"
        | "no-chains-while-dormant"
        | "chain-cap"
        | "no-eligible-agents"
        | "budget-exhausted";
    }>
  | Readonly<{ kind: "throttled"; roundNumber: number; retryAt: IsoInstant }>
  | Readonly<{ kind: "scorer-failed"; roundNumber: number }>
  | Readonly<{ kind: "all-passed"; roundNumber: number }>
  | Readonly<{
      kind: "granted";
      roundNumber: number;
      grantId: RoomGrantId;
      persona: RoomPersona;
      outcome: RoomGrantOutcomeV1;
    }>;

export type RoomSweepEntry = Readonly<{
  grantId: RoomGrantId;
  roomId: RoomId;
  persona: RoomPersona;
  workerKilled: boolean;
}>;

export type RoomSweepReport = Readonly<{ orphaned: readonly RoomSweepEntry[] }>;

const UrgencySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const TokensUsedSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** A contributor's answer is untrusted adapter output; anything off-shape is an `internal` failure. */
const ContributionResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("message"),
    body: z.string().min(1).max(MAX_ROOM_MESSAGE_BODY_LENGTH_V1),
    tokensUsed: TokensUsedSchema,
    usage: AgentUsageV1Schema.nullable().default(null),
    costUsdMicros: NonNegativeSafeIntegerSchema.nullable().default(null),
  }),
  z.strictObject({
    kind: z.literal("pass"),
    tokensUsed: TokensUsedSchema,
    usage: AgentUsageV1Schema.nullable().default(null),
    costUsdMicros: NonNegativeSafeIntegerSchema.nullable().default(null),
  }),
  z.strictObject({
    kind: z.literal("error"),
    code: RoomAgentErrorCodeV1Schema,
    retryAfterMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  }),
]);

function validateDuration(label: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be a positive integer of at most ${String(maximum)}`);
  }
  return value;
}

function validateBenchPolicy(policy: RoomBenchPolicy): RoomBenchPolicy {
  validateDuration("limitDefaultBenchMs", policy.limitDefaultBenchMs, 24 * 60 * 60_000);
  validateDuration("timeoutBenchMs", policy.timeoutBenchMs, 24 * 60 * 60_000);
  validateDuration("capacityBenchBaseMs", policy.capacityBenchBaseMs, 24 * 60 * 60_000);
  validateDuration("internalBenchMs", policy.internalBenchMs, 24 * 60 * 60_000);
  if (
    typeof policy.capacityJitterFraction !== "number" ||
    !Number.isFinite(policy.capacityJitterFraction) ||
    policy.capacityJitterFraction < 0 ||
    policy.capacityJitterFraction > 1
  ) {
    throw new TypeError("capacityJitterFraction must be a number in [0, 1]");
  }
  return policy;
}

function instant(date: Date): IsoInstant {
  return IsoInstantSchema.parse(date.toISOString());
}

function addMs(base: IsoInstant, ms: number): IsoInstant {
  return IsoInstantSchema.parse(new Date(Date.parse(base) + ms).toISOString());
}

function laterOf(left: IsoInstant, right: IsoInstant): IsoInstant {
  return left >= right ? left : right;
}

/** Ensures the moderator's own clock is monotone with the transcript so appends never predate the head. */
function noEarlierThan(now: IsoInstant, floor: IsoInstant | null): IsoInstant {
  return floor === null ? now : laterOf(now, floor);
}

/**
 * Attendance is a pure function of the last human message: a room with no
 * human message within `dormancyMs` (or none at all) is dormant. Shared by
 * the moderator and the daemon's `room.events` read model so both agree.
 */
export function roomAttendanceAt(
  room: Pick<RoomV1, "lastHumanAt">,
  now: IsoInstant,
  dormancyMs: number = DEFAULT_ROOM_DORMANCY_MS,
): RoomAttendanceV1 {
  if (room.lastHumanAt === null) return "dormant";
  return Date.parse(now) - Date.parse(room.lastHumanAt) >= dormancyMs ? "dormant" : "attended";
}

const defaultWait: RoomWaitPort = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

function abortError(): Error {
  const error = new Error("The room wait was aborted.");
  error.name = "AbortError";
  return error;
}

const defaultIds: RoomIdFactoryPort = {
  messageId: () => RoomMessageIdSchema.parse(randomUUID()),
  grantId: () => RoomGrantIdSchema.parse(randomUUID()),
};

class RoomTimeoutError extends Error {
  public constructor(label: string) {
    super(`${label} exceeded its wall-clock lease.`);
    this.name = "RoomTimeoutError";
  }
}

/**
 * The deterministic moderator. Every decision reads durable rows and writes
 * durable rows; the only in-memory state is the set of grants whose
 * contribution promise is awaited by this very process (so a wake-time sweep
 * never orphans a lease this process is still honouring).
 */
export class RoomModerator {
  readonly #repository: RoomRepository;
  readonly #scorer: ScorerPort;
  readonly #contributor: ContributorPort;
  readonly #revalidator: RevalidatePort;
  readonly #process: RoomProcessPort;
  readonly #clock: RoomClockPort;
  readonly #wait: RoomWaitPort;
  readonly #random: RoomRandomPort;
  readonly #ids: RoomIdFactoryPort;
  readonly #quota: QuotaGovernorPort;
  readonly #dormancyMs: number;
  readonly #leaseDurationMs: number;
  readonly #scorerTimeoutMs: number;
  readonly #revalidateTimeoutMs: number;
  readonly #transcriptWindow: number;
  readonly #benchPolicy: RoomBenchPolicy;
  readonly #inFlight = new Set<RoomGrantId>();

  public constructor(options: RoomModeratorOptions) {
    this.#repository = options.repository;
    this.#scorer = options.scorer;
    this.#contributor = options.contributor;
    this.#revalidator = options.revalidator;
    this.#process = options.process;
    if (!Number.isSafeInteger(this.#process.pid) || this.#process.pid < 1) {
      throw new TypeError("process.pid must be a positive safe integer");
    }
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#wait = options.wait ?? defaultWait;
    this.#random = options.random ?? { fraction: () => Math.random() };
    this.#ids = options.ids ?? defaultIds;
    this.#quota = options.quota ?? unlimitedQuotaGovernor;
    this.#dormancyMs = validateDuration(
      "dormancyMs",
      options.dormancyMs ?? DEFAULT_ROOM_DORMANCY_MS,
      7 * 24 * 60 * 60_000,
    );
    this.#leaseDurationMs = validateDuration(
      "leaseDurationMs",
      options.leaseDurationMs ?? DEFAULT_ROOM_LEASE_MS,
      MAX_LEASE_MS,
    );
    this.#scorerTimeoutMs = validateDuration(
      "scorerTimeoutMs",
      options.scorerTimeoutMs ?? DEFAULT_ROOM_SCORER_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );
    this.#revalidateTimeoutMs = validateDuration(
      "revalidateTimeoutMs",
      options.revalidateTimeoutMs ?? DEFAULT_ROOM_REVALIDATE_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );
    this.#transcriptWindow = validateDuration(
      "transcriptWindow",
      options.transcriptWindow ?? DEFAULT_ROOM_TRANSCRIPT_WINDOW,
      MAX_TRANSCRIPT_WINDOW,
    );
    this.#benchPolicy = validateBenchPolicy(options.benchPolicy ?? DEFAULT_ROOM_BENCH_POLICY);
  }

  public get inFlightGrantIds(): ReadonlySet<RoomGrantId> {
    return this.#inFlight;
  }

  public get dormancyMs(): number {
    return this.#dormancyMs;
  }

  public attendanceOf(room: RoomV1, now: IsoInstant = this.#now()): RoomAttendanceV1 {
    return roomAttendanceAt(room, now, this.#dormancyMs);
  }

  /**
   * Orphan sweep, run on start and on every wake: any open grant whose owner
   * is not this process, or whose lease has expired without this process
   * still awaiting it, has its worker killed (if reported and alive), its
   * reservation credited, and the room lock released — with a system line so
   * the human sees why the reply never came. The room is re-polled with a
   * wake trigger so a pending human message still gets its round.
   */
  public sweep(): RoomSweepReport {
    const orphaned: RoomSweepEntry[] = [];
    for (const grant of this.#repository.listOpenGrants()) {
      const now = this.#now();
      const ownedHere = grant.ownerPid === this.#process.pid;
      const expired = grant.leaseExpiresAt <= now;
      if (ownedHere && (this.#inFlight.has(grant.grantId) || !expired)) continue;
      let workerKilled = false;
      if (
        grant.workerPid !== null &&
        grant.workerPid !== this.#process.pid &&
        this.#process.isAlive(grant.workerPid)
      ) {
        workerKilled = this.#process.kill(grant.workerPid);
      }
      const room = this.#repository.requireRoom(grant.roomId);
      const at = this.#appendInstant(room, now);
      this.#repository.finishGrant({
        grantId: grant.grantId,
        outcome: { kind: "orphaned", workerKilled },
        tokensUsed: 0,
        unattended: this.attendanceOf(room, at) === "dormant",
        now: at,
        systemLine: {
          messageId: this.#ids.messageId(),
          code: "grant-orphaned",
          body: `${grant.persona}'s reply was abandoned by a previous daemon run and its lease released${workerKilled ? " (worker terminated)" : ""}.`,
          roundNumber: grant.roundNumber,
          persona: grant.persona,
        },
      });
      const refreshed = this.#repository.requireRoom(grant.roomId);
      if (refreshed.pendingTrigger === null) {
        this.#repository.setPendingTrigger(grant.roomId, {
          kind: "wake",
          requestedAt: at,
          sourceSequence: 0,
        });
      }
      orphaned.push({
        grantId: grant.grantId,
        roomId: grant.roomId,
        persona: grant.persona,
        workerKilled,
      });
    }
    return { orphaned };
  }

  /** Runs one poll round for a trigger. Never throws for a room-level refusal; those are outcomes. */
  public async runRound(roomIdInput: RoomId, trigger: RoomTriggerV1): Promise<RoomRoundOutcome> {
    const room = this.#repository.requireRoom(roomIdInput);
    const now = this.#appendInstant(room, this.#now());

    if (room.activeGrantId !== null) {
      this.#repository.setPendingTrigger(room.roomId, trigger);
      return { kind: "deferred", reason: "generation-in-flight", retryAt: null };
    }
    if (room.humanTypingUntil !== null && room.humanTypingUntil > now) {
      this.#repository.setPendingTrigger(room.roomId, trigger);
      return { kind: "deferred", reason: "human-typing", retryAt: room.humanTypingUntil };
    }

    const attendance: RoomAttendanceV1 =
      trigger.kind === "human-message" ? "attended" : this.attendanceOf(room, now);
    const unattended = attendance === "dormant";
    if (unattended) {
      if (!room.unattendedEnabled) {
        this.#postOnce(room, {
          code: "room-dormant",
          body: "Room is dormant: no human message for 10 minutes and unattended mode is off. Agents resume when you post.",
        });
        return { kind: "refused", reason: "room-dormant" };
      }
      if (trigger.kind !== "factory-event") {
        return { kind: "refused", reason: "no-chains-while-dormant" };
      }
    }

    // Tier 0: deterministic gates.
    const recent = this.#repository.listRecentMessages(room.roomId, this.#transcriptWindow);
    if (RoomModerator.#consecutiveAgentMessages(recent) >= ROOM_MAX_CONSECUTIVE_AGENT_MESSAGES_V1) {
      this.#postOnce(room, {
        code: "chain-cap",
        body: `Agents have posted ${String(ROOM_MAX_CONSECUTIVE_AGENT_MESSAGES_V1)} messages in a row; waiting for a human message before granting the floor again.`,
      });
      return { kind: "refused", reason: "chain-cap" };
    }
    const source = this.#sourceMessage(room, trigger, recent);
    const excludedAuthor =
      source !== null && source.author.kind === "agent" ? source.author.persona : null;
    const mentioned = new Set<RoomPersona>(source?.mentions ?? []);
    const cooldownAuthors = RoomModerator.#recentAgentAuthors(recent, room.agentCooldownEvents);
    const candidates: RoomScorerCandidate[] = [];
    for (const participant of room.participants) {
      if (participant.persona === excludedAuthor) continue;
      if (participant.benchedUntil !== null && participant.benchedUntil > now) continue;
      const forced = mentioned.has(participant.persona);
      if (!forced && cooldownAuthors.has(participant.persona)) continue;
      candidates.push({ persona: participant.persona, provider: participant.provider, forced });
    }
    if (candidates.length === 0) {
      return { kind: "refused", reason: "no-eligible-agents" };
    }
    this.#repository.rolloverBudget(room.roomId, now);
    const gate = this.#repository.evaluateBudgetGate(room.roomId, unattended);
    if (!gate.admitted) {
      this.#postOnce(room, {
        code: "budget-exhausted",
        body: `Room budget exhausted for today (${String(gate.availableTokens)} of ${String(gate.ceilingTokens)} tokens available${unattended ? ", unattended ceiling" : ""}). Agents resume tomorrow (UTC).`,
      });
      return { kind: "refused", reason: "budget-exhausted" };
    }

    const roundNumber = this.#repository.beginRound(room.roomId);
    const provider = candidates[0]?.provider;
    if (provider === undefined) throw new Error("Round candidate invariant failed");
    const quota = this.#quota.reserve({
      priority: "rooms",
      provider,
      tokens: room.budget.maxTokensPerReply,
      now: new Date(now),
    });
    if (!quota.granted) {
      const retryAt = instant(quota.retryAt);
      this.#repository.appendSystemLine({
        roomId: room.roomId,
        messageId: this.#ids.messageId(),
        code: "throttled",
        body: `Shared model quota is depleted; rooms yield to factory work. Retry after ${retryAt}.`,
        now: this.#appendInstant(this.#repository.requireRoom(room.roomId), this.#now()),
        roundNumber,
        retryAt,
      });
      return { kind: "throttled", roundNumber, retryAt };
    }

    // Tier 1: one scorer call per round.
    let scores: Readonly<Record<string, RoomUrgency>>;
    try {
      scores = await this.#score(room, roundNumber, recent, candidates);
    } catch (error) {
      quota.reservation.release();
      this.#repository.appendSystemLine({
        roomId: room.roomId,
        messageId: this.#ids.messageId(),
        code: "scorer-unavailable",
        body: `The admission scorer did not return a usable verdict (${RoomModerator.#summarize(error)}); nobody was granted the floor this round.`,
        now: this.#appendInstant(this.#repository.requireRoom(room.roomId), this.#now()),
        roundNumber,
      });
      return { kind: "scorer-failed", roundNumber };
    }
    const winner = RoomModerator.#pickWinner(candidates, scores);
    if (winner === null) {
      quota.reservation.release();
      this.#repository.appendSystemLine({
        roomId: room.roomId,
        messageId: this.#ids.messageId(),
        code: "all-passed",
        body: "All agents passed.",
        now: this.#appendInstant(this.#repository.requireRoom(room.roomId), this.#now()),
        roundNumber,
      });
      return { kind: "all-passed", roundNumber };
    }

    // Grant: wall-clock lease stamped with the head, budget reserved.
    let grant: RoomGrantV1;
    const grantedAt = this.#appendInstant(this.#repository.requireRoom(room.roomId), this.#now());
    try {
      grant = this.#repository.createGrant({
        grantId: this.#ids.grantId(),
        roomId: room.roomId,
        roundNumber,
        persona: winner.persona,
        ownerPid: this.#process.pid,
        leaseExpiresAt: addMs(grantedAt, this.#leaseDurationMs),
        now: grantedAt,
        unattended,
      });
    } catch (error) {
      quota.reservation.release();
      if (error instanceof RoomError && error.code === "room.generation-in-flight") {
        this.#repository.setPendingTrigger(room.roomId, trigger);
        return { kind: "deferred", reason: "generation-in-flight", retryAt: null };
      }
      if (error instanceof RoomError && error.code === "room.budget-exhausted") {
        this.#postOnce(this.#repository.requireRoom(room.roomId), {
          code: "budget-exhausted",
          body: "Room budget exhausted for today. Agents resume tomorrow (UTC).",
        });
        return { kind: "refused", reason: "budget-exhausted" };
      }
      throw error;
    }

    const participant = room.participants.find(({ persona }) => persona === grant.persona);
    if (participant === undefined) throw new Error("Grant persona invariant failed");
    const outcome = await this.#execute(grant, participant, unattended, quota.reservation);
    return {
      kind: "granted",
      roundNumber,
      grantId: grant.grantId,
      persona: grant.persona,
      outcome,
    };
  }

  // Tier 2 and completion.
  async #execute(
    grant: RoomGrantV1,
    participant: RoomParticipantV1,
    unattended: boolean,
    reservation: QuotaReservation,
  ): Promise<RoomGrantOutcomeV1> {
    this.#inFlight.add(grant.grantId);
    try {
      const room = this.#repository.requireRoom(grant.roomId);
      const transcript = this.#repository.listRecentMessages(room.roomId, this.#transcriptWindow);
      let result: RoomContributionResult;
      try {
        result = ContributionResultSchema.parse(
          await this.#withLease(
            (signal) =>
              this.#contributor.contribute({
                room,
                grant,
                participant,
                transcript,
                maxTokens: grant.reservedTokens,
                signal,
                reportWorkerPid: (pid) => {
                  this.#repository.recordWorkerPid(grant.grantId, pid, this.#now());
                },
              }),
            this.#leaseDurationMs,
            "Agent contribution",
          ),
        );
      } catch (error) {
        result = RoomModerator.#classifyFailure(error);
      }
      try {
        switch (result.kind) {
          case "message":
            return await this.#commit(grant, participant, result, unattended, reservation);
          case "pass":
            return this.#pass(grant, result, unattended, reservation);
          case "error":
            return this.#fail(
              grant,
              participant,
              result.code,
              result.retryAfterMs,
              unattended,
              reservation,
            );
        }
      } catch (error) {
        // An unexpected failure while completing must not leave the room
        // locked until the lease expires: close the grant as an internal
        // failure if the repository still lets us, then surface the cause.
        const open = this.#repository.findGrant(grant.grantId);
        if (open !== null && (open.state === "active" || open.state === "held")) {
          try {
            this.#fail(grant, participant, "internal", null, unattended, reservation);
          } catch {
            // The original error is the one worth reporting.
          }
        }
        throw error;
      }
    } finally {
      this.#inFlight.delete(grant.grantId);
    }
  }

  async #commit(
    grant: RoomGrantV1,
    participant: RoomParticipantV1,
    result: Extract<RoomContributionResult, { kind: "message" }>,
    unattended: boolean,
    reservation: QuotaReservation,
  ): Promise<RoomGrantOutcomeV1> {
    let body = result.body;
    let expectedHead = grant.headSequence;
    let revalidated = false;
    let revalidations = 0;
    for (;;) {
      try {
        const committed = this.#repository.commitGrant({
          grantId: grant.grantId,
          messageId: this.#ids.messageId(),
          expectedHeadSequence: expectedHead,
          body,
          tokensUsed: result.tokensUsed,
          revalidated,
          unattended,
          now: this.#appendInstant(this.#repository.requireRoom(grant.roomId), this.#now()),
        });
        reservation.settle(result.tokensUsed);
        if (revalidated) {
          const room = this.#repository.requireRoom(grant.roomId);
          this.#repository.appendSystemLine({
            roomId: grant.roomId,
            messageId: this.#ids.messageId(),
            code: "contribution-revised",
            body: `${grant.persona} re-checked its reply against your newer message before posting.`,
            now: this.#appendInstant(room, this.#now()),
            roundNumber: grant.roundNumber,
            grantId: grant.grantId,
            persona: grant.persona,
          });
        }
        this.#queueChain(grant, committed.message);
        return {
          kind: "committed",
          messageSequence: committed.message.sequence,
          tokensUsed: result.tokensUsed,
          revalidated,
          // The honest token ledger (contracts Architecture decision 6): whatever the contributor
          // itself reported for this contribution, never fabricated when the adapter reported
          // nothing usable.
          usage: result.usage,
          costUsdMicros: result.costUsdMicros,
        };
      } catch (error) {
        if (!(error instanceof RoomHeadMovedError)) throw error;
        const delta = this.#repository.listMessages(
          grant.roomId,
          expectedHead,
          Math.max(1, error.currentHeadSequence - expectedHead),
        );
        const humanPosted = delta.some(
          (message) => message.kind === "message" && message.author.kind === "human",
        );
        expectedHead = error.currentHeadSequence;
        if (!humanPosted) continue;
        revalidations += 1;
        if (revalidations > MAX_ROOM_REVALIDATIONS_PER_GRANT) {
          return this.#drop(grant, "revalidation-exhausted", unattended, reservation);
        }
        const room = this.#repository.requireRoom(grant.roomId);
        const held = this.#repository.holdGrant(
          grant.grantId,
          body,
          this.#appendInstant(room, this.#now()),
        );
        let decision: RoomRevalidationDecision;
        try {
          decision = await this.#withLease(
            (signal) =>
              this.#revalidator.revalidate({
                room,
                grant: held,
                participant,
                bufferedBody: body,
                newMessages: delta,
                signal,
              }),
            this.#revalidateTimeoutMs,
            "Revalidation",
          );
        } catch {
          decision = { decision: "drop" };
        }
        if (decision.decision === "drop") {
          return this.#drop(grant, "revalidation-dropped", unattended, reservation);
        }
        if (decision.decision === "revise") {
          if (decision.body.length < 1 || decision.body.length > 20_000) {
            return this.#drop(grant, "revalidation-dropped", unattended, reservation);
          }
          body = decision.body;
        }
        revalidated = true;
      }
    }
  }

  #pass(
    grant: RoomGrantV1,
    result: Extract<RoomContributionResult, { kind: "pass" }>,
    unattended: boolean,
    reservation: QuotaReservation,
  ): RoomGrantOutcomeV1 {
    const room = this.#repository.requireRoom(grant.roomId);
    const tokensUsed = result.tokensUsed;
    const outcome: RoomGrantOutcomeV1 = {
      kind: "passed",
      tokensUsed,
      usage: result.usage,
      costUsdMicros: result.costUsdMicros,
    };
    this.#repository.finishGrant({
      grantId: grant.grantId,
      outcome,
      tokensUsed,
      unattended,
      now: this.#appendInstant(room, this.#now()),
      systemLine: {
        messageId: this.#ids.messageId(),
        code: "agent-passed",
        body: `${grant.persona} passed.`,
        roundNumber: grant.roundNumber,
        persona: grant.persona,
      },
    });
    reservation.settle(tokensUsed);
    return outcome;
  }

  #drop(
    grant: RoomGrantV1,
    reason: "revalidation-dropped" | "revalidation-exhausted",
    unattended: boolean,
    reservation: QuotaReservation,
  ): RoomGrantOutcomeV1 {
    const room = this.#repository.requireRoom(grant.roomId);
    const outcome: RoomGrantOutcomeV1 = { kind: "dropped", reason };
    this.#repository.finishGrant({
      grantId: grant.grantId,
      outcome,
      tokensUsed: 0,
      unattended,
      now: this.#appendInstant(room, this.#now()),
      systemLine: {
        messageId: this.#ids.messageId(),
        code: "contribution-dropped",
        body:
          reason === "revalidation-dropped"
            ? `${grant.persona} withdrew its reply after you posted.`
            : `${grant.persona} withdrew its reply; you posted faster than it could re-check.`,
        roundNumber: grant.roundNumber,
        persona: grant.persona,
      },
    });
    reservation.release();
    return outcome;
  }

  /**
   * A typed failure is a legible event with a bench-until, never a hold: the
   * grant closes as `failed`, the reservation is credited, the room lock is
   * released, and the persona (or, for rate limits, every persona on the
   * provider) is benched.
   */
  #fail(
    grant: RoomGrantV1,
    participant: RoomParticipantV1,
    code: RoomAgentErrorCodeV1,
    retryAfterMs: number | null,
    unattended: boolean,
    reservation: QuotaReservation,
  ): RoomGrantOutcomeV1 {
    const room = this.#repository.requireRoom(grant.roomId);
    const now = this.#appendInstant(room, this.#now());
    const benchedUntil = this.#benchUntil(now, code, retryAfterMs);
    if (code === "limit") {
      this.#repository.benchProvider(participant.provider, benchedUntil, code);
    } else {
      this.#repository.benchPersona(grant.roomId, grant.persona, benchedUntil, code);
    }
    const outcome: RoomGrantOutcomeV1 = { kind: "failed", code, benchedUntil };
    this.#repository.finishGrant({
      grantId: grant.grantId,
      outcome,
      tokensUsed: 0,
      unattended,
      now,
      systemLine: {
        messageId: this.#ids.messageId(),
        code: "agent-error",
        body: `${grant.persona} failed (${code}); ${code === "limit" ? `provider ${participant.provider}` : grant.persona} benched until ${benchedUntil}.`,
        roundNumber: grant.roundNumber,
        persona: grant.persona,
        errorCode: code,
        benchedUntil,
        retryAt: benchedUntil,
      },
    });
    reservation.release();
    return outcome;
  }

  #benchUntil(
    now: IsoInstant,
    code: RoomAgentErrorCodeV1,
    retryAfterMs: number | null,
  ): IsoInstant {
    switch (code) {
      case "limit":
        return addMs(now, retryAfterMs ?? this.#benchPolicy.limitDefaultBenchMs);
      case "timeout":
        return addMs(now, this.#benchPolicy.timeoutBenchMs);
      case "capacity": {
        const base = retryAfterMs ?? this.#benchPolicy.capacityBenchBaseMs;
        const spread = base * this.#benchPolicy.capacityJitterFraction;
        const fraction = this.#random.fraction();
        const jitter = Math.round((Math.min(Math.max(fraction, 0), 1) * 2 - 1) * spread);
        return addMs(now, Math.max(1_000, base + jitter));
      }
      case "internal":
        return addMs(now, this.#benchPolicy.internalBenchMs);
    }
  }

  /** After a committed agent message, an attended room may chain one more round (bounded by cooldown and the cap). */
  #queueChain(grant: RoomGrantV1, message: RoomChatMessageV1): void {
    const room = this.#repository.requireRoom(grant.roomId);
    if (this.attendanceOf(room, this.#now()) === "dormant") return;
    this.#repository.setPendingTrigger(room.roomId, {
      kind: "agent-message",
      requestedAt: message.occurredAt,
      sourceSequence: message.sequence,
    });
  }

  async #score(
    room: RoomV1,
    roundNumber: number,
    transcript: readonly RoomMessageV1[],
    candidates: readonly RoomScorerCandidate[],
  ): Promise<Readonly<Record<string, RoomUrgency>>> {
    const raw = await this.#withLease(
      (signal) => this.#scorer.score({ room, roundNumber, transcript, candidates, signal }),
      this.#scorerTimeoutMs,
      "Scorer",
    );
    const parsed = z.record(z.string(), UrgencySchema).parse(raw);
    const expected = new Set(candidates.map(({ persona }) => persona));
    const received = new Set(Object.keys(parsed));
    if (
      expected.size !== received.size ||
      [...expected].some((persona) => !received.has(persona))
    ) {
      throw new Error("Scorer verdict must cover exactly the candidate personas");
    }
    return parsed;
  }

  static #pickWinner(
    candidates: readonly RoomScorerCandidate[],
    scores: Readonly<Record<string, RoomUrgency>>,
  ): RoomScorerCandidate | null {
    let winner: RoomScorerCandidate | null = null;
    let winnerUrgency: RoomUrgency = 0;
    for (const candidate of candidates) {
      const scored = scores[candidate.persona] ?? 0;
      // A forced invite must answer: it always bids at least urgency 1.
      const urgency: RoomUrgency = candidate.forced && scored === 0 ? 1 : scored;
      if (urgency === 0) continue;
      if (
        winner === null ||
        urgency > winnerUrgency ||
        (urgency === winnerUrgency && candidate.forced && !winner.forced)
      ) {
        winner = candidate;
        winnerUrgency = urgency;
      }
    }
    return winner;
  }

  static #consecutiveAgentMessages(recent: readonly RoomMessageV1[]): number {
    let count = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const message = recent[index];
      if (message === undefined || message.kind === "system") continue;
      if (message.author.kind === "human") break;
      count += 1;
    }
    return count;
  }

  static #recentAgentAuthors(recent: readonly RoomMessageV1[], window: number): Set<RoomPersona> {
    const authors = new Set<RoomPersona>();
    for (const message of recent.slice(-window)) {
      if (message.kind === "message" && message.author.kind === "agent") {
        authors.add(message.author.persona);
      }
    }
    return authors;
  }

  #sourceMessage(
    room: RoomV1,
    trigger: RoomTriggerV1,
    recent: readonly RoomMessageV1[],
  ): RoomChatMessageV1 | null {
    if (trigger.sourceSequence > 0) {
      const found = this.#repository.findMessage(room.roomId, trigger.sourceSequence);
      if (found !== null && found.kind === "message") return found;
      if (found !== null) return null;
    }
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const message = recent[index];
      if (message !== undefined && message.kind === "message") return message;
    }
    return null;
  }

  /** Posts a system line unless the head is already the same line, so idle re-polls stay quiet. */
  #postOnce(
    room: RoomV1,
    line: Readonly<{ code: "room-dormant" | "chain-cap" | "budget-exhausted"; body: string }>,
  ): void {
    const head =
      room.headSequence === 0 ? null : this.#repository.findMessage(room.roomId, room.headSequence);
    if (head !== null && head.kind === "system" && head.code === line.code) return;
    this.#repository.appendSystemLine({
      roomId: room.roomId,
      messageId: this.#ids.messageId(),
      code: line.code,
      body: line.body,
      now: this.#appendInstant(room, this.#now()),
    });
  }

  async #withLease<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timerAbort = new AbortController();
    const timer = this.#wait(ms, timerAbort.signal).then(
      () => {
        throw new RoomTimeoutError(label);
      },
      (error: unknown) => {
        if (timerAbort.signal.aborted) return new Promise<never>(() => undefined);
        throw error;
      },
    );
    try {
      return await Promise.race([operation(controller.signal), timer]);
    } catch (error) {
      if (error instanceof RoomTimeoutError) {
        controller.abort();
        throw new RoomAgentFailure("timeout", error.message);
      }
      throw error;
    } finally {
      timerAbort.abort();
    }
  }

  static #classifyFailure(error: unknown): Extract<RoomContributionResult, { kind: "error" }> {
    if (error instanceof RoomAgentFailure) {
      return { kind: "error", code: error.code, retryAfterMs: error.retryAfterMs };
    }
    return { kind: "error", code: "internal", retryAfterMs: null };
  }

  static #summarize(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.replaceAll(/\s+/g, " ").trim();
    return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized || "unknown";
  }

  #now(): IsoInstant {
    return instant(this.#clock.now());
  }

  /** Never appends before the current head's own instant. */
  #appendInstant(room: RoomV1, now: IsoInstant): IsoInstant {
    const head =
      room.headSequence === 0 ? null : this.#repository.findMessage(room.roomId, room.headSequence);
    return noEarlierThan(now, head?.occurredAt ?? null);
  }
}
