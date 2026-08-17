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
