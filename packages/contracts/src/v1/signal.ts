import { z } from "zod";

import {
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";
import { RoomProviderSchema } from "./room.js";

/**
 * A Signal is a standing, named watch: "keep looking for developments related to X," run
 * periodically (or on demand, via `signal.run-now`) by a Scout -- an existing room-participant
 * adapter (`ParticipantAdapter`, `@app-factory/studio-room-adapters`; Codex, Claude, Ollama, or an
 * OpenRouter instance, whichever the operator already configured with network access) reused
 * exactly as it is, asked a different question. A chat participant decides "do I have something to
 * say in this conversation, right now"; a Scout decides "is there something genuinely NEW to
 * report about this watch, since I last looked" -- the same `contribute()` call, the same
 * value-gated speak-or-stay-silent contract, a different structured answer
 * (`SignalScoutFindingV1Schema` instead of a chat message) and a different trigger (a periodic or
 * manual check instead of a live room round).
 *
 * A Scout's finding is never trusted as-is: it must carry at least one citation
 * (`SignalCitationV1Schema`, a URL is required) or the daemon refuses to record it as an Insight --
 * the same "nothing invented, no citation-free claims" discipline this repository already applies
 * everywhere else evidence is recorded. An Insight, once recorded, is retained and never rewritten
 * (SQL triggers on `signal_insights`, migration 0015) -- a dated fact about what the Scout reported
 * and when, exactly like an ASC release observation.
 *
 * This is deliberately the FIRST slice of a larger, not-yet-built lifecycle
 * (Signal -> Insight -> Opportunity -> Product Bet -> owner gate -> Plan -> Build (existing
 * planner execution) -> Release (existing release rail) -> Outcome -> back to Signal): a working,
 * evidence-bound way to define what to watch and durably capture what a Scout finds. Clustering
 * insights into an Opportunity, drafting a Product Bet, and the owner-gated investment decision
 * that turns a Bet into a Plan are not implemented by this file.
 */

const LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const SignalIdSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID")
  .brand<"SignalId">();
export type SignalId = z.infer<typeof SignalIdSchema>;

/** Derived deterministically from the `signal.run-now` (or scheduled) check that recorded it. */
export const SignalInsightIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "lowercase UUID")
  .brand<"SignalInsightId">();
export type SignalInsightId = z.infer<typeof SignalInsightIdSchema>;

export const SignalStatusV1Schema = z.enum(["active", "paused"]);
export type SignalStatusV1 = z.infer<typeof SignalStatusV1Schema>;

export const MAX_SIGNAL_NAME_LENGTH_V1 = 200;
export const MAX_SIGNAL_WATCH_DESCRIPTION_LENGTH_V1 = 2_000;

export const SignalV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  signalId: SignalIdSchema,
  name: z.string().min(1).max(MAX_SIGNAL_NAME_LENGTH_V1),
  /** Free text describing what to watch for, e.g. "fashion and streetwear trends relevant to a
   *  Halloween-season Shopify store." Fed verbatim into the Scout's room charter. */
  watchDescription: z.string().min(1).max(MAX_SIGNAL_WATCH_DESCRIPTION_LENGTH_V1),
  /** Which configured room-participant adapter acts as this signal's Scout -- the same
   *  `RoomProvider` key a room's cast would reference (e.g. "codex", "openrouter-fast"). */
  scoutProvider: RoomProviderSchema,
  status: SignalStatusV1Schema,
  createdAt: IsoInstantSchema,
  /** `null` until the first check (manual or scheduled) runs. */
  lastCheckedAt: IsoInstantSchema.nullable(),
  checkCount: NonNegativeSafeIntegerSchema,
  insightCount: NonNegativeSafeIntegerSchema,
});
export type SignalV1 = z.infer<typeof SignalV1Schema>;

export const MAX_SIGNAL_CITATIONS_V1 = 10;

export const SignalCitationV1Schema = z.strictObject({
  url: z.string().url().max(2_000),
  title: z.string().min(1).max(300),
});
export type SignalCitationV1 = z.infer<typeof SignalCitationV1Schema>;

export const SignalConfidenceV1Schema = z.enum(["weak", "moderate", "strong"]);
export type SignalConfidenceV1 = z.infer<typeof SignalConfidenceV1Schema>;

/**
 * The structured shape a Scout's `contribute()` call must return, JSON-encoded, as the `text` of a
 * `{kind: "message"}` contribution -- parsed strictly (zod, fail closed) by the daemon before
 * anything is recorded. `{kind: "pass"}` (nothing new since last check) needs no shape at all.
 * `citations` is required and non-empty: an unsourced claim is not an Insight, it is a rejected
 * Scout answer -- the daemon treats a schema violation exactly like a malformed chat contribution
 * (`internal`), never as evidence.
 */
export const SignalScoutFindingV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  /** One line: the finding itself, e.g. "Searches for \"gothic streetwear\" are up sharply
   *  month-over-month heading into October." */
  headline: z.string().min(1).max(300),
  /** Why this is worth surfacing -- the reasoning a human would want before acting on it. */
  rationale: z.string().min(1).max(4_000),
  confidence: SignalConfidenceV1Schema,
  citations: z.array(SignalCitationV1Schema).min(1).max(MAX_SIGNAL_CITATIONS_V1),
});
export type SignalScoutFindingV1 = z.infer<typeof SignalScoutFindingV1Schema>;

const SignalInsightDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  insightId: SignalInsightIdSchema,
  signalId: SignalIdSchema,
  discoveredAt: IsoInstantSchema,
  headline: z.string().min(1).max(300),
  rationale: z.string().min(1).max(4_000),
  confidence: SignalConfidenceV1Schema,
  citations: z.array(SignalCitationV1Schema).min(1).max(MAX_SIGNAL_CITATIONS_V1),
};

export const SignalInsightDigestInputV1Schema = z.strictObject(SignalInsightDigestInputV1Shape);
export type SignalInsightDigestInputV1 = z.infer<typeof SignalInsightDigestInputV1Schema>;

export const SignalInsightV1Schema = z.strictObject({
  ...SignalInsightDigestInputV1Shape,
  /** SHA-256 of the canonical JSON of every field above. */
  insightDigest: Sha256DigestSchema,
});
export type SignalInsightV1 = z.infer<typeof SignalInsightV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it as recursively
 * key-sorted JSON UTF-8 and exclude `insightDigest`. Mirrors
 * `ascReleaseObservationDigestInputV1`/`roomParticipantsCatalogDigestInputV1` exactly.
 */
export function signalInsightDigestInputV1(
  insight: SignalInsightDigestInputV1 | SignalInsightV1,
): SignalInsightDigestInputV1 {
  return SignalInsightDigestInputV1Schema.parse({
    schemaVersion: insight.schemaVersion,
    insightId: insight.insightId,
    signalId: insight.signalId,
    discoveredAt: insight.discoveredAt,
    headline: insight.headline,
    rationale: insight.rationale,
    confidence: insight.confidence,
    citations: insight.citations,
  });
}

function canonicalJson(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node !== null && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return node;
  };
  return JSON.stringify(normalize(value));
}

/** Canonical UTF-8 text to hash for `insightDigest`. */
export function canonicalSignalInsightDigestInputV1(
  insight: SignalInsightDigestInputV1 | SignalInsightV1,
): string {
  return canonicalJson(signalInsightDigestInputV1(insight));
}

/** What a Scout run produced, before persistence -- the daemon's own classification of the
 *  contribution it got back, independent of the wire command result shape. */
export type SignalScoutRunOutcomeV1 =
  | Readonly<{ kind: "found"; finding: SignalScoutFindingV1 }>
  | Readonly<{ kind: "nothing-new" }>
  | Readonly<{
      kind: "scout-failed";
      code: "scout-not-configured" | "scout-error" | "scout-malformed-finding";
      message: string;
    }>;
