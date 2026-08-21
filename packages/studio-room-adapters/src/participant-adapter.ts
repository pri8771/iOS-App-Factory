import type {
  AgentUsageV1,
  RoomAgentErrorCodeV1,
  RoomPersona,
  RoomProvider,
} from "@app-factory/contracts";

/**
 * One transcript line handed to a `ParticipantAdapter`, already excerpted and
 * bounded by the caller (`buildParticipantContext` in `context.ts`). This is
 * intentionally a smaller, adapter-owned shape rather than the full
 * `RoomMessageV1` union: adapters need "who said what", not grant ids, typed
 * system codes, or schema plumbing.
 */
export type ParticipantContextMessage = Readonly<{
  author: string;
  body: string;
}>;

/**
 * The room context recipe every provider is fed, verbatim, before the
 * per-provider adapter renders it into its own wire format (a CLI stdin
 * payload, an HTTP prompt, ...). Every field is already bounded by the
 * caller: `roomCharter` ≤500 tok, `rollingSummary` ≤1k tok, `transcript` ≤30
 * messages -- the same recipe shape `@app-factory/ollama-scorer`'s
 * `ScoreRequestV1` uses for Tier 1, so a room's charter and rolling summary
 * are computed once and shared by both the scorer and every contributor.
 */
export type ParticipantContext = Readonly<{
  /** The persona this contribution is being requested from. */
  persona: RoomPersona;
  /** Bounded room mission statement (~500 tokens). */
  roomCharter: string;
  /** Bounded rolling summary of everything before the transcript window (~1k tokens). */
  rollingSummary: string;
  /** One-line description of this persona's role in the room. */
  personaCharter: string;
  /** Last ≤30 messages, oldest first. */
  transcript: readonly ParticipantContextMessage[];
  /** True only for research rooms: project rooms never grant network access. */
  networkEnabled: boolean;
  /** Hard output budget in tokens; also the historical 25-minute-generation guard for local models. */
  maxOutputTokens: number;
  /** Aborted at the moderator's lease deadline; adapters must honor it promptly. */
  signal: AbortSignal;
  /** Reports a spawned worker pid so a crashed daemon's orphan sweep can terminate it. */
  reportWorkerPid: (pid: number) => void;
}>;

/**
 * The honest token ledger (contracts Architecture decision 6): `tokensUsed` keeps its historical
 * budget-debit meaning exactly (each adapter's own approximation, used to settle the room/phase
 * token reservation) -- `reported` and `costUsdMicros` are the separate, never-fabricated figures
 * an adapter parsed straight from the provider's own usage accounting, `null` whenever the
 * provider reported nothing usable rather than a fabricated zero.
 */
export type ParticipantUsage = Readonly<{
  tokensUsed: number;
  reported: AgentUsageV1 | null;
  costUsdMicros: number | null;
}>;

export type ParticipantContributionResult =
  | Readonly<{ kind: "message"; text: string; usage: ParticipantUsage }>
  | Readonly<{ kind: "pass"; usage: ParticipantUsage }>
  | Readonly<{ kind: "error"; code: RoomAgentErrorCodeV1; retryAfterMs: number | null }>;

/**
 * One provider's real-model implementation: invoke the pinned CLI or local
 * HTTP endpoint, map its output (or failure) to the shape above. Adapters are
 * stateless per contribution -- no session id, no conversation carried
 * between calls, no repo access, no credentials read from `process.env` --
 * and never throw for a provider-side failure; every failure this package
 * anticipates is a typed `{ kind: "error" }` result instead. An adapter may
 * still throw for a genuine programming error (bad config), which the
 * contributor router (`contributor.ts`) catches and reports as `internal`.
 */
export type ParticipantAdapter = Readonly<{
  /** Stable adapter identity for logs/diagnostics, e.g. "openai.codex-room-participant". */
  id: string;
  /** Which `RoomProvider` this adapter backs (must match a participant's `provider` field). */
  provider: RoomProvider;
  contribute(context: ParticipantContext): Promise<ParticipantContributionResult>;
}>;
