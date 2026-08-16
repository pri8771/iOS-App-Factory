import { z } from "zod";

import {
  RollingSummarizerConfigV1Schema,
  type RollingSummarizerConfigInputV1,
  type RollingSummarizerConfigV1,
} from "./config.js";
import {
  generateBounded,
  OllamaScorerError,
  performanceClock,
  type MonotonicClockPort,
  type OllamaGenerateRequestBody,
  type OllamaGenerateUsage,
  type OllamaTransportPort,
} from "./ollama-client.js";
import {
  ROLLING_SUMMARY_MAX_CHARS,
  ROOM_CHARTER_MAX_CHARS,
  RoomMessageV1Schema,
  type RoomMessageV1,
} from "./port.js";
import { buildSummarizerPrompt, excerpt, sanitizeText } from "./prompt.js";

export const RollingSummaryV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  /** ≤1k tokens by construction (see `ROLLING_SUMMARY_MAX_CHARS`). */
  text: z.string().max(ROLLING_SUMMARY_MAX_CHARS),
  /** 0 for the empty initial summary; +1 per successful regeneration. */
  generation: z.int().min(0),
  /** Highest message `seq` folded into `text`; null before the first regeneration. */
  coversThroughSeq: z.int().min(0).nullable(),
});
export type RollingSummaryV1 = z.infer<typeof RollingSummaryV1Schema>;

export const EMPTY_ROLLING_SUMMARY: RollingSummaryV1 = Object.freeze({
  schemaVersion: 1,
  text: "",
  generation: 0,
  coversThroughSeq: null,
});

const RoomCharterSchema = z.string().trim().min(1).max(ROOM_CHARTER_MAX_CHARS);

export type RegenerationFailureReason =
  "timeout" | "transport-error" | "http-error" | "malformed-response" | "empty-response";

export type RollingSummarizerEvent =
  | Readonly<{
      kind: "regenerated";
      summary: RollingSummaryV1;
      latencyMs: number;
      /** The model's summary exceeded `summaryMaxChars` and was cut. */
      truncated: boolean;
      messagesSummarized: number;
      /** Oldest messages of the batch left out by `batchMaxChars`. */
      messagesDropped: number;
      usage: OllamaGenerateUsage;
    }>
  | Readonly<{
      kind: "regeneration-failed";
      reason: RegenerationFailureReason;
      detail: string;
      latencyMs: number;
      /** Messages still awaiting a successful regeneration. */
      pendingMessages: number;
    }>
  | Readonly<{
      kind: "backlog-trimmed";
      /** Oldest unsummarized messages discarded to respect `maxPendingMessages`. */
      dropped: number;
      pendingMessages: number;
    }>;

export type CreateRollingSummarizerOptions = Readonly<{
  transport: OllamaTransportPort;
  roomCharter: string;
  config?: RollingSummarizerConfigInputV1;
  clock?: MonotonicClockPort;
  /** Resume from persisted state; defaults to the empty generation-0 summary. */
  initialSummary?: RollingSummaryV1;
  /** Observability hook; a throwing listener never disturbs the summarizer. */
  onEvent?: (event: RollingSummarizerEvent) => void;
}>;

export type ObserveOutcome = Readonly<{
  /** True when this observation started an asynchronous regeneration. */
  scheduled: boolean;
  pendingMessages: number;
}>;

export type RollingSummarizer = Readonly<{
  config: RollingSummarizerConfigV1;
  /** The latest successfully generated summary (or the initial one). */
  current(): RollingSummaryV1;
  pendingMessages(): number;
  /**
   * Records one message. Every `everyMessages` observations a regeneration
   * starts in the background; this call never awaits the model.
   */
  observe(message: RoomMessageV1): ObserveOutcome;
  /** Forces one regeneration of whatever is pending and awaits it. */
  regenerate(): Promise<void>;
  /** Resolves once no regeneration is in flight. */
  idle(): Promise<void>;
}>;

/**
 * Regenerates the ≤1k-token rolling summary every N observed messages via
 * the same local model as the scorer, asynchronously and one at a time.
 * A failed regeneration keeps the previous summary and the unsummarized
 * backlog (bounded), and the next observation may try again; the
 * summarizer never throws from its background work and never stalls
 * the caller.
 */
export function createRollingSummarizer(
  options: CreateRollingSummarizerOptions,
): RollingSummarizer {
  const config = RollingSummarizerConfigV1Schema.parse(options.config ?? {});
  const clock = options.clock ?? performanceClock;
  const transport = options.transport;
  const roomCharter = RoomCharterSchema.parse(options.roomCharter);
  const onEvent = options.onEvent;

  let current: RollingSummaryV1 = RollingSummaryV1Schema.parse(
    options.initialSummary ?? EMPTY_ROLLING_SUMMARY,
  );
  let lastSeq: number | null = current.coversThroughSeq;
  let pending: RoomMessageV1[] = [];
  let inFlight: Promise<void> | null = null;
  let forced = false;

  const emit = (event: RollingSummarizerEvent): void => {
    if (onEvent === undefined) return;
    try {
      onEvent(event);
    } catch {
      // Listener failures are the listener's problem; the summarizer's
      // state and cadence must not depend on them.
    }
  };

  const shouldRun = (): boolean =>
    pending.length > 0 && (forced || pending.length >= config.everyMessages);

  /** One regeneration over a snapshot of the pending backlog. */
  const runOnce = async (): Promise<boolean> => {
    const batch = pending.slice();
    const last = batch[batch.length - 1];
    if (last === undefined) return true;
    const built = buildSummarizerPrompt({
      roomCharter,
      previousSummary: current.text,
      newMessages: batch,
      summaryMaxChars: config.summaryMaxChars,
      messageExcerptMaxChars: config.messageExcerptMaxChars,
      batchMaxChars: config.batchMaxChars,
    });
    const body: OllamaGenerateRequestBody = {
      model: config.model,
      system: built.system,
      prompt: built.prompt,
      stream: false,
      options: {
        temperature: 0,
        num_ctx: config.contextTokens,
        num_predict: config.maxOutputTokens,
      },
      keep_alive: config.keepAlive,
    };
    const outcome = await generateBounded({
      transport,
      clock,
      baseUrl: config.baseUrl,
      body,
      timeoutMs: config.timeoutMs,
    });
    if (outcome.kind !== "ok") {
      emit({
        kind: "regeneration-failed",
        reason: outcome.kind,
        detail: outcome.detail,
        latencyMs: outcome.latencyMs,
        pendingMessages: pending.length,
      });
      return false;
    }
    const text = sanitizeText(outcome.text).trim();
    if (text.length === 0) {
      emit({
        kind: "regeneration-failed",
        reason: "empty-response",
        detail: "model returned an empty summary; previous summary kept",
        latencyMs: outcome.latencyMs,
        pendingMessages: pending.length,
      });
      return false;
    }
    const cut = excerpt(text, config.summaryMaxChars);
    current = RollingSummaryV1Schema.parse({
      schemaVersion: 1,
      text: cut.text,
      generation: current.generation + 1,
      coversThroughSeq: last.seq,
    });
    pending = pending.filter((message) => message.seq > last.seq);
    emit({
      kind: "regenerated",
      summary: current,
      latencyMs: outcome.latencyMs,
      truncated: cut.truncated,
      messagesSummarized: built.includedMessages,
      messagesDropped: built.droppedMessages,
      usage: outcome.usage,
    });
    return true;
  };

  /** Starts the background loop when due; at most one loop runs at a time. */
  const kick = (): boolean => {
    if (inFlight !== null || !shouldRun()) return false;
    inFlight = (async () => {
      try {
        while (shouldRun()) {
          forced = false;
          const succeeded = await runOnce();
          // After a failure, wait for the next observation rather than
          // hammering a model that is down or slow.
          if (!succeeded) break;
        }
      } catch {
        // `runOnce` reports every failure through events; nothing here
        // may surface as an unhandled rejection from background work.
      } finally {
        forced = false;
        inFlight = null;
      }
    })();
    return true;
  };

  const idle = async (): Promise<void> => {
    while (inFlight !== null) await inFlight;
  };

  return {
    config,
    current: () => current,
    pendingMessages: () => pending.length,
    observe(message: RoomMessageV1): ObserveOutcome {
      const parsed = RoomMessageV1Schema.safeParse(message);
      if (!parsed.success) {
        throw new OllamaScorerError(`invalid room message: ${parsed.error.message}`);
      }
      if (lastSeq !== null && parsed.data.seq <= lastSeq) {
        throw new OllamaScorerError(
          `message seq ${parsed.data.seq} does not advance past ${lastSeq}; refusing to observe`,
        );
      }
      lastSeq = parsed.data.seq;
      pending.push(parsed.data);
      if (pending.length > config.maxPendingMessages) {
        const dropped = pending.length - config.maxPendingMessages;
        pending.splice(0, dropped);
        emit({ kind: "backlog-trimmed", dropped, pendingMessages: pending.length });
      }
      const scheduled = kick();
      return { scheduled, pendingMessages: pending.length };
    },
    async regenerate(): Promise<void> {
      if (pending.length > 0) {
        forced = true;
        kick();
      }
      await idle();
    },
    idle,
  };
}
