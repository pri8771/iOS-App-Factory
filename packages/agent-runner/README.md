# Agent runner

Credential-isolated headless process adapters for Codex, Claude, and future
providers, all implementing the same versioned run contract.

The Codex adapter is split at a deliberate durability boundary:

- `buildCodexInvocation` and `preflightCodex` create and validate the locked-down
  invocation profile.
- `materializeCodexRunV1` is pure. It validates a completed process capture,
  exact adapter/CLI identity, timestamps, output/turn/event limits, and reported
  changed-path scopes. It then emits contract-validated `AgentRunResultV1` and
  deterministic, bounded `AgentEventV1` records.
- A separate supervisor must own spawning, cancellation, durable stdout/stderr
  spools, crash recovery, and publication. This package does not perform those
  operations.

An authorized write path is a scope root: it authorizes that exact relative path
and descendants separated by `/`. The current `AgentRunSpecV1` contract does not
distinguish a leaf file from a directory scope. The current result contract also
has no structural fields for adapter/CLI versions, reported summaries, or
reported changed paths; deterministic event IDs bind the identity and capture,
but the supervisor/evidence layer must preserve those additional inputs.

`CodexProcessCapture` does not carry truncation provenance, so materialized
captured outputs are marked `truncated: false`. The supervising process must
provide complete bounded strings; an over-limit capture is converted to a
non-retryable failure.
