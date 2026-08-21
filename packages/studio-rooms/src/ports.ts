import type {
  AgentUsageV1,
  ProviderFamilyV1,
  RoomAgentErrorCodeV1,
  RoomGrantId,
  RoomGrantV1,
  RoomMessageId,
  RoomMessageV1,
  RoomParticipantV1,
  RoomPersona,
  RoomProvider,
  RoomV1,
} from "@app-factory/contracts";

/**
 * Every external dependency of the moderator is a port. Nothing in this
 * package talks to a model, a process, a clock, or a random source directly,
 * so every behaviour is deterministic under test fakes.
 */

export type RoomClockPort = Readonly<{ now(): Date }>;

/** Resolves after `ms` (or rejects with an AbortError-shaped error when `signal` aborts). */
export type RoomWaitPort = (ms: number, signal: AbortSignal) => Promise<void>;

/** Uniform random fraction in [0, 1); used only for capacity-retry jitter. */
export type RoomRandomPort = Readonly<{ fraction(): number }>;

export type RoomIdFactoryPort = Readonly<{
  messageId(): RoomMessageId;
  grantId(): RoomGrantId;
}>;

/**
 * Process facts the lease sweep needs. `pid` is the daemon's own pid stamped
 * on every grant it owns; `isAlive`/`kill` act on worker pids a contributor
 * reported for its spawned agent CLI so an orphan from a dead daemon can be
 * terminated on the next start/wake.
 */
export type RoomProcessPort = Readonly<{
  pid: number;
  isAlive(pid: number): boolean;
  /** Returns true when a termination signal was delivered. */
  kill(pid: number): boolean;
}>;

export type RoomUrgency = 0 | 1 | 2 | 3;

export type RoomScorerCandidate = Readonly<{
  persona: RoomPersona;
  provider: RoomProvider;
  /** Addressed by `@persona` in the trigger message: must be scored, wins ties. */
  forced: boolean;
}>;

export type RoomScorerRequest = Readonly<{
  room: RoomV1;
  roundNumber: number;
  /** Bounded recent transcript window, oldest first. */
  transcript: readonly RoomMessageV1[];
  candidates: readonly RoomScorerCandidate[];
  signal: AbortSignal;
}>;

/**
 * Tier 1: exactly one call per poll round. Returns an urgency 0-3 for every
 * candidate persona; 0 means "no bid". A response that omits or adds
 * personas, or is not an integer 0-3, is a scorer failure (fail closed).
 */
export type ScorerPort = Readonly<{
  score(request: RoomScorerRequest): Promise<Readonly<Record<string, number>>>;
}>;

export type RoomContributionRequest = Readonly<{
  room: RoomV1;
  grant: RoomGrantV1;
  participant: RoomParticipantV1;
  transcript: readonly RoomMessageV1[];
  maxTokens: number;
  signal: AbortSignal;
  /** Report a spawned worker pid so an orphan can be swept after a daemon crash. */
  reportWorkerPid(pid: number): void;
}>;

export type RoomContributionResult =
  | Readonly<{
      kind: "message";
      body: string;
      tokensUsed: number;
      /** The honest token ledger's own record of this contribution's usage, when the adapter
       *  reported one (contracts Architecture decision 6) -- `tokensUsed` above keeps its existing
       *  budget-debit meaning unchanged; this is the separate, never-fabricated ledger figure. */
      usage: AgentUsageV1 | null;
      costUsdMicros: number | null;
    }>
  /** Tier 2: the admitted agent may decline; the moderator treats this as success. */
  | Readonly<{
      kind: "pass";
      tokensUsed: number;
      usage: AgentUsageV1 | null;
      costUsdMicros: number | null;
    }>
  | Readonly<{ kind: "error"; code: RoomAgentErrorCodeV1; retryAfterMs: number | null }>;

export type ContributorPort = Readonly<{
  contribute(request: RoomContributionRequest): Promise<RoomContributionResult>;
}>;

export type RoomRevalidationRequest = Readonly<{
  room: RoomV1;
  grant: RoomGrantV1;
  participant: RoomParticipantV1;
  bufferedBody: string;
  /** Messages appended after the grant's head, oldest first (includes the human post). */
  newMessages: readonly RoomMessageV1[];
  signal: AbortSignal;
}>;

export type RoomRevalidationDecision =
  | Readonly<{ decision: "post" }>
  | Readonly<{ decision: "revise"; body: string }>
  | Readonly<{ decision: "drop" }>;

/**
 * Consulted only when the human posted between grant and commit. The buffered
 * completion is never posted over the human's message without this verdict.
 */
export type RevalidatePort = Readonly<{
  revalidate(request: RoomRevalidationRequest): Promise<RoomRevalidationDecision>;
}>;

/**
 * The honest token ledger's own attribution source (contracts Architecture decision 6): the
 * moderator knows a grant's room-provider key (`RoomParticipantV1.provider`) but not which
 * adapter family backs it or which model it is configured to speak -- that lives only in the
 * daemon-side participants config (`apps/daemon/src/room-participants-config.ts`). A required
 * port, not a default, so a closing grant never fabricates or silently omits either field: the
 * composition wiring the daemon is responsible for.
 */
export type RoomProviderModelInfo = Readonly<{ family: ProviderFamilyV1; model: string }>;

export type RoomProviderCatalogPort = Readonly<{
  resolve(provider: RoomProvider): RoomProviderModelInfo;
}>;

export type QuotaPriorityClass = "factory" | "rooms";

export type QuotaReservation = Readonly<{
  /** Record actual consumption (may be less than reserved) and release the rest. */
  settle(actualTokens: number): void;
  /** Release the whole reservation unused. */
  release(): void;
}>;

export type QuotaReserveRequest = Readonly<{
  priority: QuotaPriorityClass;
  provider: RoomProvider;
  tokens: number;
  now: Date;
}>;

export type QuotaDecision =
  | Readonly<{ granted: true; reservation: QuotaReservation }>
  | Readonly<{ granted: false; retryAt: Date }>;

/**
 * Shared token window across the factory and rooms. Priority classes are
 * strict: factory work may consume the whole window, rooms only the share
 * left above the factory reserve, so rooms throttle first as the window
 * depletes.
 */
export type QuotaGovernorPort = Readonly<{
  reserve(request: QuotaReserveRequest): QuotaDecision;
}>;
