# CLI

Thin client for the typed App Factory command service. Business logic does not
belong in this package.

Set `APP_FACTORY_SOCKET` and `APP_FACTORY_AUTH_TOKEN`, then use `doctor`,
`submit --task`, `run --task`, `status`, `events`, `pause`, `resume`, `cancel`,
`reconcile`, or the read-only `portfolio` snapshot. Portfolio output preserves
unknown Jira, GitHub, quality, release, and analytics values as `unavailable`;
it never substitutes numeric zero. Immutable run proof is daemon-owned and
available through `evidence list`, `evidence inspect <attempt-id>`, and
`evidence verify <attempt-id>`. The list command accepts bounded `--after` and
`--limit` pagination. Add `--json` for a stable machine-readable envelope.
Task files are parsed as strict TaskSpec V1 documents before transmission.

Every invocation creates an explicit durable command identity. If delivery is
ambiguous after dispatch, human output prints a recovery command and JSON
output includes `error.retryIdentity`. Retry the same operation and payload
with both `--command-id UUID` and `--issued-at ISO_INSTANT`; providing only one
is rejected. The client creates a new request ID while preserving that exact
logical command identity, so the daemon can return the journaled result instead
of applying the mutation twice.

LaunchAgent bootstrap inspection is intentionally separate: use
`pnpm service plan --config /absolute/path/to/service.json` or
`pnpm service status --config /absolute/path/to/service.json`. The `factory`
client never imports service-management or bypasses the daemon command boundary.
