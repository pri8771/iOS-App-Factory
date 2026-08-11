# Daemon command boundary

Week 2 provides only the secured local command-server primitive. It owns a
mode-0600 Unix socket and lock file inside a mode-0700, current-user-owned
runtime directory. The protocol accepts one bounded JSONL frame per connection,
authenticates before dispatch, and keeps a bounded in-memory replay ledger.

The business handler is an injected port. It must persist `commandId` and make
mutating operations idempotent; this package does not access SQLite. A repeated
`requestId` with identical logical content coalesces in flight and replays the
exact response bytes while retained by the bounded in-memory ledger. After
restart, ledger eviction, or an ambiguous handler timeout, the caller uses the
same `commandId` and original `issuedAt` with a new `requestId`; the durable
handler then returns or reconciles the logical result. Reusing a `requestId`
with any changed logical metadata, including `issuedAt`, is a protocol conflict.
A completed transport replay entry is never rewritten by late completion.

This slice does not yet provide background scheduling, process supervision, or
LaunchAgent installation.
