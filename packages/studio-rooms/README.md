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

No LLM adapters live here; every external dependency is a port.
