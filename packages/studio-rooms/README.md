# @app-factory/studio-rooms

The Studio room engine core: a deterministic moderator over a single-writer,
append-only room transcript stored in the kernel's SQLite control plane
(migration `0007-studio-rooms`).

- **Moderator** (`RoomModerator`): admission tiers (Tier 0 deterministic
  gates, Tier 1 one `ScorerPort` call per round, Tier 2 the admitted
  `ContributorPort` reply, which may `pass`), wall-clock grant leases stamped
  with the transcript head, compare-and-swap commit with `RevalidatePort`
  when a human posted meanwhile, budget reservations, a
  `QuotaGovernorPort` shared with the factory (factory > rooms), unattended
  dormancy, and legible system-line outcomes.
- **Repository** (`RoomRepository`): the SQLite rows the moderator resumes
  from after a restart.
- **Loop** (`RoomModeratorLoop`): per-room driver with orphan sweep on
  start/wake.
- **Factory-event bridge** (`RoomFactoryEventBridge`): the producer of
  `factory-event` system lines, i.e. of the only trigger a dormant room with
  `unattendedEnabled` acts on. See below.

No LLM adapters live here; every external dependency is a port.

## Factory-event bridge

A dormant room (no human message for `dormancyMs`, default 10 minutes) with
`unattendedEnabled = true` runs a round **only** on a `factory-event`
trigger; nothing else in the engine produces one. The bridge is the daemon
composition that turns kernel attempt transitions into those triggers:

- **Source of truth.** The kernel's own append-only `events` ledger, read
  through a `FactoryEventSourcePort` (`head` / `positionOf` / `scan`). The
  daemon's real port (`apps/daemon/src/room-factory-event-source.ts`) scans
  `events` in rowid order joined to `attempts` and `task_snapshots`; only
  `attempt.state-changed` rows become transitions. There is no second event
  bus: the bridge is drained on the daemon's existing scheduler tick loop
  (`afterTick`), so a transition the tick just committed reaches its rooms in
  the same poll cycle, and once at start.
- **What is bridged.** `→ succeeded` (with `broker commit <sha8>` when the
  attempt's committed evidence carries a `commit` item), `→ failed
(<failure code>)`, `→ blocked (<blocker code>)`, `→ cancelled`, and
  `blocked → running` (an operator's unblock). `queued → running` and pauses
  are not bridged. The body is built from durable state only and never
  contains a date; the line's `occurredAt` is the transcript instant, and the
  cursor keeps the kernel event's own `occurredAt`.
- **Routing.** A transition is delivered to every room whose `projectId`
  equals the attempt's task `projectId`. **Portfolio-wide rooms
  (`projectId === null`) do not receive factory events.** The design docs
  (`docs/architecture/0004-studio-mac-app.md`, `docs/roadmap/STUDIO_PHASES.md`)
  are silent on this; the bridge fails closed on it because an unattended
  portfolio-wide room would otherwise be woken — and spend its unattended
  ceiling — on every attempt of every project. Widening it is a one-line
  routing change once the docs decide.
- **Durability / exactly-once.** Migration `0013-room-factory-event-cursor`
  adds the single-row `room_factory_event_cursor` table. The line append(s)
  and the cursor advance happen in one IMMEDIATE transaction
  (`RoomRepository.bridgeFactoryEvent`), so a daemon restart can neither
  bridge one kernel event twice nor skip one. A fresh cursor anchors at the
  ledger head (history is never replayed into rooms); an existing cursor is
  re-anchored by kernel `event_id` on start in case the `events` table was
  ever rebuilt and renumbered.
- **Visibility.** `room.events` reports `moderator.factoryBridge`
  (`{ enabled, cursor }`); the cursor names the ledger position and kernel
  event scanned through, the last delivered event and instant, and the
  lifetime delivered count. Bridge failures surface through the rooms
  `onError` port and `getLastRoomsError()`; the cursor is left where the last
  fully bridged event put it and the next tick retries.
- **Budgets/gates are unchanged.** The bridge only queues the trigger; the
  moderator still applies attendance, the unattended ceiling, chain cap,
  cooldown, and the shared quota governor (which throttles rooms while an
  attempt is running, so a room round follows the attempt, never overlaps it).

## Live proof (2026-08-17)

Unattended mode was proven live once, against a preserved private runtime
(`~/.app-factory-unattended-proof-2026-08-17`, owner-only; built at
`/private/tmp/af-unattended` from commit `ccb5898` of the bridge). Ollama-only
participants (`qwen2.5-coder:14b` at `127.0.0.1:11434`, no Codex/Claude, no
paid call); the factory event came from a **real** kernel attempt over the
deterministic `swift-greeter-fixture-v1` local execution profile (no model
call, real verifier, real broker commit). Sequence, all from that runtime's
`runtime/control-plane.sqlite` (queries below):

1. Room `e49e190f-57d7-4dee-ba32-71544baa6faf` bound to project
   `a3000000-0000-4000-8000-000000000002`, `unattended_enabled = 1`,
   `unattended_daily_ceiling_tokens 20000`, `max_tokens_per_reply 2000`.
2. One human message (#1, `21:41:07.804Z`) → real Ollama rounds #2
   `local-scout` (round 1) and #3 `local-critic` (round 2), attended.
3. A genuine ten-minute wait (no dormancy knob was added); `room.events`
   then reported `attendance: "dormant"`, `unattendedSpentTokens 0`.
4. `factory run` of the fixture task at `21:51:55Z`; attempt
   `9a557d45-7152-52e6-87cd-a2714631155d` reached `succeeded` at
   `21:52:00.931Z` (kernel event #13, ledger rowid 13; broker commit
   `b258c769…` at `refs/app-factory/attempts/9a557d45-…` in the mirror).
5. #4 `system/factory-event` (`21:52:00.924Z`): `Factory: attempt 9a557d45
for task "Add a farewell to GreetingFormatter" → succeeded (broker commit
b258c769)`; then #5 `local-scout` (round 3, `21:52:08.763Z`) — a real
   Ollama reply granted while dormant. `room_budgets.unattended_spent_tokens
= 39`, `spent_tokens = 156`; the round-3 grant is `committed`,
   `tokensUsed 39`. `room_factory_event_cursor`: `ledger_position 13`,
   `event_id f2b5e0bf-d857-5a35-ab47-89087a361948`, `delivered_count 1`.

```
sqlite3 runtime/control-plane.sqlite \
  "SELECT sequence, occurred_at, kind, author_handle, system_code, round_number FROM room_messages ORDER BY sequence;" \
  "SELECT spent_tokens, unattended_spent_tokens FROM room_budgets;" \
  "SELECT round_number, persona, state, outcome_json FROM room_grants ORDER BY round_number;" \
  "SELECT * FROM room_factory_event_cursor;" \
  "SELECT rowid, event_id, type, occurred_at FROM events WHERE type = 'attempt.state-changed';" \
  "SELECT attempt_id, state, terminal_at FROM attempts;"
git -C runtime/local-execution/git/mirrors/62000000-0000-4000-8000-000000000002.git \
  for-each-ref refs/app-factory/attempts/
```

Known nuance from that run: the delivered line's transcript instant
(`21:52:00.924Z`) is 7 ms _before_ the kernel event it reports
(`21:52:00.931Z`) because the scheduler's monotone clock ran slightly ahead
of the daemon's wall clock. The bridge now floors the line at the event's own
`occurredAt` (unit-tested); the preserved runtime predates that floor. What
this does not establish: nothing beyond one round in one room; the scorer's
verdict is a live model's and is not reproducible; the SQLite copy is a copy.
