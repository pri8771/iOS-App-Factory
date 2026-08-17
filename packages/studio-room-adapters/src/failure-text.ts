/**
 * Best-effort classification of a provider CLI/HTTP failure into the room
 * engine's four typed codes. No provider here exposes a structured
 * machine-readable rate-limit signal over the channel these adapters use
 * (Codex's JSONL protocol and Claude's `--output-format json` both fold a
 * rate limit into free-form error text), so this is deliberately
 * pattern-based and deliberately conservative: anything that does not match
 * a recognized phrase classifies as `internal` (the room engine's own
 * "fail closed on the unknown" convention) rather than guessing at
 * retryability.
 */
export type FailureClassification = Readonly<{
  code: "limit" | "capacity" | "internal";
  retryAfterMs: number | null;
}>;

const LIMIT_PATTERN = /\b(?:rate.?limit|usage limit|quota exceeded|too many requests|429)\b/i;
const CAPACITY_PATTERN =
  /\b(?:overloaded|at capacity|temporarily unavailable|try again (?:shortly|later)|529|503)\b/i;

/**
 * Parses a duration hint out of provider text such as "try again in 42
 * minutes" or "resets at 3h12m". Recognizes plain `<n><unit>` tokens
 * (seconds/minutes/hours) and sums every one found; returns `null` when no
 * duration-shaped text is present, in which case the caller falls back to a
 * policy default rather than inventing a number.
 */
export function parseRetryHintMs(text: string): number | null {
  const pattern = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/gi;
  let totalMs = 0;
  let matched = false;
  for (const match of text.matchAll(pattern)) {
    const amount = Number.parseFloat(match[1] ?? "");
    const unit = (match[2] ?? "").toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) continue;
    let unitMs: number;
    if (unit.startsWith("h")) unitMs = 3_600_000;
    else if (unit.startsWith("m")) unitMs = 60_000;
    else unitMs = 1_000;
    totalMs += amount * unitMs;
    matched = true;
  }
  if (!matched || totalMs <= 0) return null;
  return Math.min(Math.round(totalMs), 24 * 60 * 60_000);
}

/** Classifies bounded provider-supplied failure text (never model output). */
export function classifyFailureText(text: string): FailureClassification {
  if (LIMIT_PATTERN.test(text)) {
    return { code: "limit", retryAfterMs: parseRetryHintMs(text) };
  }
  if (CAPACITY_PATTERN.test(text)) {
    return { code: "capacity", retryAfterMs: parseRetryHintMs(text) };
  }
  return { code: "internal", retryAfterMs: null };
}

/** Bounded, control-character-free excerpt safe to fold into a typed-error message or a log line. */
export function boundedText(text: string, maximumLength = 500): string {
  const cleaned = text
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maximumLength ? `${cleaned.slice(0, maximumLength - 1)}…` : cleaned;
}
