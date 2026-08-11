# Local daemon

The Week 2 vertical slice owns a
mode-0600 Unix socket and lock file inside a mode-0700, current-user-owned
runtime directory, one migrated SQLite connection, the durable command runtime,
and a restart-safe background scheduler. `startFactoryDaemonService` acquires
socket ownership before opening SQLite, so a second daemon fails without
becoming another database writer. Shutdown stops intake, aborts and joins the
scheduler, drains active connections, and closes SQLite last.

The protocol accepts one bounded JSONL frame per connection, authenticates
before dispatch, and keeps a bounded in-memory replay ledger.

At the socket-server boundary, the business handler remains an injected port.
It must persist `commandId` and make mutating operations idempotent; the socket
server itself does not access SQLite. A repeated
`requestId` with identical logical content coalesces in flight and replays the
exact response bytes while retained by the bounded in-memory ledger. After
restart, ledger eviction, or an ambiguous handler timeout, the caller uses the
same `commandId` and original `issuedAt` with a new `requestId`; the durable
handler then returns or reconciles the logical result. Reusing a `requestId`
with any changed logical metadata, including `issuedAt`, is a protocol conflict.
A completed transport replay entry is never rewritten by late completion.

`task.run` durably returns its queued attempt without waiting for work to finish;
the scheduler continues after the client exits. On restart it recovers queued or
running attempts from SQLite. The default executor is deliberately a
deterministic, no-external-effect Week 2 fake; production execution adapters are
injected through `executor`. Scheduler clock, loop timing, lease duration, and
error observation are also injectable. Process supervision and LaunchAgent
installation remain later slices.
