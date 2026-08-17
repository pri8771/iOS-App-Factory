import { MAX_ROOM_MESSAGE_BODY_LENGTH_V1 } from "@app-factory/contracts";

/**
 * The structured-output contract every real-model adapter enforces on its
 * provider: exactly one JSON object, `kind: "message" | "pass"`, `text`
 * present (bounded) for a message and `null` for a pass. Sent as-is to
 * Codex's `--output-schema` and Claude's `--json-schema`; Ollama's `format`
 * instead gets {@link ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1}, a wire variant
 * loosened for its structured-output compiler (see that constant's doc).
 * All three adapters still agree on one parser: {@link parseRoomContribution}.
 */
export const ROOM_CONTRIBUTION_JSON_SCHEMA_V1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "text"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    kind: { type: "string", enum: ["message", "pass"] },
    text: {
      type: ["string", "null"],
      minLength: 1,
      maxLength: MAX_ROOM_MESSAGE_BODY_LENGTH_V1,
    },
  },
} as const;

export function serializeRoomContributionJsonSchemaV1(): string {
  return `${JSON.stringify(ROOM_CONTRIBUTION_JSON_SCHEMA_V1, null, 2)}\n`;
}

/**
 * Ollama-only wire variant of {@link ROOM_CONTRIBUTION_JSON_SCHEMA_V1}: the
 * `text` property's `maxLength` is dropped.
 *
 * Observed live against local Ollama 0.21.0 (`POST /api/generate` with
 * `format`, every locally available model -- gemma3:4b, qwen3.5:9b, etc.):
 * a `string`/`["string","null"]` property carrying `maxLength` above ~2,000
 * makes the whole request fail with HTTP 500 `"failed to load model
 * vocabulary required for format"` before generation even starts (verified
 * by bisection: 2,000 succeeds, 2,001 fails, independent of `num_predict`
 * and of which model is loaded). `MAX_ROOM_MESSAGE_BODY_LENGTH_V1` is
 * 20,000, an order of magnitude past that ceiling, and unlike Codex's
 * `uniqueItems`/lookaround rejections (see `agent-runner/src/codex.ts`)
 * there is no smaller-but-still-useful `maxLength` to fall back to here:
 * `OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS` (150) already bounds a
 * well-behaved model's output far below either ceiling, so the bound is
 * simply dropped from the wire schema rather than narrowed. Every other
 * keyword in {@link ROOM_CONTRIBUTION_JSON_SCHEMA_V1} -- `additionalProperties:
 * false`, `const`, `enum`, the `["string","null"]` union, `minLength` --
 * was individually verified live to compile fine. `parseRoomContribution`
 * is unweakened and remains the sole authority on the true 20,000-char
 * bound for every provider, Ollama included.
 */
export const ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "text"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    kind: { type: "string", enum: ["message", "pass"] },
    text: { type: ["string", "null"], minLength: 1 },
  },
} as const;

export type ParsedRoomContribution =
  Readonly<{ kind: "message"; text: string }> | Readonly<{ kind: "pass" }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fail-closed parse of a provider's final structured message, whether it
 * arrives as a raw JSON string (Codex/Ollama) or an already-decoded object
 * (Claude's `structured_output`). Throws `TypeError` on any structural
 * violation; callers map that to a `RoomAgentErrorCodeV1` of `"internal"`.
 *
 * `schemaVersion` is required by {@link ROOM_CONTRIBUTION_JSON_SCHEMA_V1} and
 * enforced whenever a provider actually runs the response through its
 * structured-output mechanism (Codex always does; Ollama always does via
 * `format`). Claude's CLI, observed live, only enforces `--json-schema` when
 * the model routes its answer through the dedicated structured-output tool
 * call (`stop_reason: "tool_use"`); when it instead ends its turn with
 * ordinary prose that happens to already be a JSON object, that text is
 * *not* schema-validated by the CLI, and `schemaVersion` is the one field a
 * model has no reason to know is expected -- it carries no information a
 * model would infer from context, unlike `kind`/`text`. This parser
 * therefore treats `schemaVersion` as optional (defaulting to 1, and
 * rejected if present with any other value) while keeping every other field
 * -- shape, allowed keys, `kind`, and `text`'s bounds -- exactly as strict.
 */
export function parseRoomContribution(input: string | unknown): ParsedRoomContribution {
  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input) as unknown;
    } catch (error) {
      throw new TypeError("Room contribution output is not valid JSON", { cause: error });
    }
  } else {
    parsed = input;
  }
  if (!isRecord(parsed)) {
    throw new TypeError("Room contribution output must be an object");
  }
  const actualKeys = new Set(Object.keys(parsed));
  const allowedKeys = new Set(["kind", "schemaVersion", "text"]);
  const requiredKeys = ["kind", "text"];
  if (
    [...actualKeys].some((key) => !allowedKeys.has(key)) ||
    requiredKeys.some((key) => !actualKeys.has(key))
  ) {
    throw new TypeError("Room contribution output contains unexpected or missing fields");
  }
  if (actualKeys.has("schemaVersion") && parsed.schemaVersion !== 1) {
    throw new TypeError("Room contribution output has an unsupported schema version");
  }
  if (parsed.kind !== "message" && parsed.kind !== "pass") {
    throw new TypeError("Room contribution output has an invalid kind");
  }
  if (parsed.kind === "pass") {
    if (parsed.text !== null) {
      throw new TypeError("A pass contribution must carry a null text");
    }
    return { kind: "pass" };
  }
  if (
    typeof parsed.text !== "string" ||
    parsed.text.length < 1 ||
    parsed.text.length > MAX_ROOM_MESSAGE_BODY_LENGTH_V1
  ) {
    throw new TypeError("A message contribution must carry bounded non-empty text");
  }
  return { kind: "message", text: parsed.text };
}
