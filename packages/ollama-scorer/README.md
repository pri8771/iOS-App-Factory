# @app-factory/ollama-scorer

Local-model `ScorerPort` adapter for Studio rooms, plus the rolling
summarizer that keeps its prompt prefix small. Everything talks to a
loopback Ollama (`http://127.0.0.1:11434`, model `qwen2.5:3b` by default);
no room content leaves the machine.

## Contract

- **One HTTP call per round.** `createOllamaScorer({ transport }).score(request)`
  sends exactly one `POST /api/generate` per `ScoreRequestV1` and resolves to a
  `ScoreResultV1` tagged with the request's `roundId`.
- **Bounded input, never the transcript.** The request carries the room
  charter (≤2,000 chars ≈ 500 tokens), the rolling summary (≤4,000 chars ≈ 1k
  tokens), at most 30 recent messages, and ≤32 personas with one-line
  charters. Each message is excerpted (`messageExcerptMaxChars`) and the
  delta block is capped in characters (`deltaMaxChars`, oldest dropped
  first).
- **Stable prefix, delta last.** Instructions, charter, personas, and summary
  travel as `system`; the recent messages as `prompt`. The `system` string is
  byte-identical across rounds while its inputs are, so the model's prompt
  cache can reuse the prefix KV. `prefixDigest`/`promptDigest` make this
  checkable.
- **Fail-closed parsing.** The model must return exactly a JSON object whose
  keys are a subset of the persona ids and whose values are integers 0–3
  (also constrained via Ollama's JSON-schema `format`). Missing personas bid
  0; any unknown key or malformed value voids the round.
- **Hard timeout = legible silence.** `timeoutMs` (default 3,000; 2–5 s
  recommended) bounds the call regardless of what the transport does. On
  the deadline the request is aborted and the result is
  `{ outcome: "timeout", bids: [] }`; HTTP and transport failures likewise
  yield zero bids with a bounded `detail`. `score` throws only for an
  invalid request (caller bug), never for model or network trouble.
- **Rolling summarizer.** `createRollingSummarizer({ transport, roomCharter })`
  observes messages and, every `everyMessages` (default 20), regenerates the
  ≤1k-token summary in the background through the same model — one
  regeneration at a time, previous summary kept on any failure, bounded
  backlog, and events for observability.

The `ScorerPort`, request, and result schemas live in `src/port.ts` as a
local copy so this package builds independently of `packages/studio-rooms`;
see the `TODO(studio-rooms)` there for the unification at merge.
