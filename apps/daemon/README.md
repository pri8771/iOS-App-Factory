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
error observation are also injectable. Composed executor/agent startup recovery
must finish before commands become ready; callers receive retryable
`daemon.starting` while it runs. LaunchAgent installation remains a later slice.

`daemon.reconcile` is a durable wake request, not a synchronous scheduler tick.
Its command result is journaled before the service wakes the background loop, so
a crash at the result-ledger boundary cannot advance an attempt and then replay
the command as new work. A daemon restart independently begins with a scheduler
tick. The v1 `reconciledAttemptIds` response field reports synchronous work and
is therefore always empty for this wake-only operation.

`attempt.list` is an authoritative, bounded navigation read. It is ordered by
`updatedAt` and `attemptId` descending, can be scoped to active work or one
project, and bypasses the durable mutation result journal just like status and
events. Consumers must re-read one exact attempt before taking action.

## Local-agent result journals

Legacy local adapters remain supported: a successful legacy run produces the
exact V1 result journal and the existing event-log evidence. A supervised
adapter enrolled with trusted invocation identity must return the strict
protocol-evidence envelope. Enrollment is all-or-nothing: the environment,
identity, and V2-required flag must be declared together. The
daemon then validates the issued run spec, terminal result, ordered events,
captured stdout/stderr, canonical invocation descriptor, and canonical
supervisor intent and receipt before publishing an immutable V2 result journal.

The V2 journal content-addresses the run spec, result, event log, both output
streams, invocation descriptor, supervisor intent, and supervisor receipt. The
invocation descriptor records the executable path and digest, argv, CLI
version, selected model, environment names plus a non-secret projection
digest, stdin digest, and the supervisor intent/invocation digests. The daemon
recomputes those digests from the canonical intent, checks its executable
path/digest, CLI version, model, and exact environment-name set against trusted
project enrollment, and binds the receipt to that intent, durable process
identity, exit, timestamps, and bounded output spools. The environment-name
set is compared to enrollment; the non-secret value projection is checked for
self-consistency between the canonical intent and descriptor, not against an
independently enrolled value set. Successful V2 runs add an `agent-run` entry
to the evidence manifest;
the existing required evidence kinds and all trusted diff, verifier, reviewer,
and commit gates are unchanged.

A valid V2 journal is the terminal result of that exact adapter invocation.
Replay returns its persisted success, blocker, or failure and never launches
the adapter again. In particular, resuming a blocked step can only reproduce
the same durable blocker; resolving it requires a newly submitted attempt with
new immutable inputs. A failed attempt is terminal and likewise cannot be
silently re-executed. Once a project requires protocol evidence, the daemon
also refuses live results without the complete envelope and rejects legacy V1
journals instead of downgrading trust during recovery.

If a terminal supervisor receipt survives under an older fence but its V2
journal does not, recovery neither relaunches Codex nor promotes that receipt
into the newer fence. The attempt fails with `agent.supervisor-stale-fence`;
the operator must inspect the durable receipt and submit a replacement attempt.

The Codex conformance adapter is not wired into `daemon-entrypoint`. Its
no-network fake-executable test traverses the real detached supervisor and
trusted Swift pipeline, but live-model host execution remains prohibited by
[`ADR 0002`](../../docs/architecture/0002-untrusted-agent-containment.md).
