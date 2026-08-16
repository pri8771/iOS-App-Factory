# Studio phases

These are capability stages for the Studio Mac app (the Gen 5 product
surface), not calendar weeks — the same convention
[`BUILD_STAGES.md`](BUILD_STAGES.md) already uses for the Gen 4 kernel and
daemon. The product decision this plan implements is recorded in
[ADR 0004](../architecture/0004-studio-mac-app.md); nothing in this document
authorizes work beyond what that ADR decided.

Status labels below use the same four-class vocabulary defined in
[`IMPLEMENTATION_STATUS.md`'s Status vocabulary section](../progress/IMPLEMENTATION_STATUS.md#status-vocabulary):
**Implemented**, **Dormant / not wired**, **Blocked — protected approval**,
**Blocked — external/user gate**. As of this writing no Studio phase has
reached a state that vocabulary was designed to describe — every phase below
is either not started, or (Phase 1 only) in progress in a separate,
unmerged worktree — so most entries say plainly "not started" rather than
force-fitting one of the four labels where none yet applies. Once a phase's
work lands in this repository, the corresponding
[`IMPLEMENTATION_STATUS.md`](../progress/IMPLEMENTATION_STATUS.md) entry is
the authoritative status record, not this document.

## Phase 1 — Shell

Deliverables:

- `apps/studio-mac` SwiftPM workspace: `StudioKit` (design system, models,
  daemon client) and `Studio` (the app target), plus tests for both.
- `DaemonClient`: a Swift client speaking the daemon's existing Unix-socket
  command protocol over `NWConnection` — the same protocol `apps/cli`,
  `apps/mcp`, and `apps/dashboard` already use, not a new one.
- The HUD design system (cyan-dominant on near-black, gold reserved for
  states awaiting the human, bracketed panel chrome, the ◆ human-gate
  diamond) as reusable SwiftUI components.
- A first dashboard view reading the daemon's live portfolio snapshot
  (`portfolio.snapshot`) end to end, natively.

Gates: none. This phase is a new client of already-implemented daemon
commands; it adds no new daemon surface and needs no new approval beyond
normal implementation review.

Status: in progress on branch `studio/phase1`, built in a separate worktree
(`/private/tmp/af-studio`). Nothing is merged into `integration/t3-t7` or
`main`. `docs/progress/IMPLEMENTATION_STATUS.md` carries the matching
"Studio (Mac app)" entry recording this same state — nothing merged, nothing
verified.

## Phase 2 — Studio service in the daemon

Deliverables:

- New daemon-owned state and commands for rooms, phases, phase presets, and
  milestones, additive to the daemon's current 21-command surface
  (`apps/daemon/src/command-runtime.ts`).
- A `milestones[]` schema in `packages/contracts` — none exists today
  (verified 2026-08-16: zero matches for "milestone" under `packages/`).
- A `phase` field on tasks/attempts, distinct from the two unrelated
  existing uses of the word "phase" already in contracts
  (`AgentProgressEventV1Schema.data.phase` and
  `EnrollmentPlanActionV1Schema.phase`) — see
  [ADR 0004](../architecture/0004-studio-mac-app.md).
- Rule scoping (`appliesTo` a phase), waivers, a human-only owner field, and
  a check registry in `packages/policy-engine` — none exist there today
  (verified 2026-08-16).

Gates: reconciling the four lifecycle vocabularies ADR 0004 records (the
separately versioned rules corpus's 14-stage lifecycle, a mission-control
`gates.md`, this repository's own project-manifest lifecycle, and the
in-progress studio-ios preset) should happen no later than this phase, so
Phase 4's planner is not built against a vocabulary that changes under it.

Status: not started. No milestone type, Studio `phase` field, or
policy-scoping code exists anywhere in this repository as of this writing.

## Phase 3 — Chat + rooms

Deliverables:

- The corner chat popup (bottom-right, switchable conversations, minimizes
  to a FAB) and the full chat screen.
- The assistant answering status/timeline questions only from repository
  docs and Factory evidence (portfolio snapshot, evidence manifests),
  structurally unable to state a date not present in that evidence.
- Intent-driven actions ("build X", "analyze Y", "queue Z") mapped to
  existing daemon commands (for example `task.submit`/`task.run`,
  `project.scan`), with no wizard screens.

Gates: depends on Phase 2's service surface for durable room/conversation
state.

Status: not started.

## Phase 4 — Phases + planner

Deliverables:

- User-editable Phase Presets: mode `solo | panel | debate | chat`, cast,
  per-phase rules (standard rules machine-enforced, the user's own rules
  prompted), typed outputs written into repository docs, and gates. Phase
  Presets are the renamed carrier for the V3 "Situation" concept.
- The default iOS preset collapsing Gen 2's reported 22 phases to roughly 8
  plus gates, per the deep-dive finding recorded in
  [ADR 0004](../architecture/0004-studio-mac-app.md).

Gates: depends on Phase 2's `phase`/preset/milestone schema and the
lifecycle-vocabulary reconciliation named there; building the planner ahead
of that reconciliation risks binding Phase Presets to a vocabulary that
later changes.

Status: not started.

## Phase 5 — Mirrors + analytics

Deliverables:

- Jira and Notion as one-way mirrors of repository docs. The repository
  remains the source of truth; the mirrors are synced from it and never
  written back into it.
- Dashboard analytics: the Gantt centerpiece with the dashed-red "no honest
  estimate" bar, radial gauges, the portfolio reticle, and per-project phase
  rings — all reading only committed evidence, never inferring a date.

Gates: **Blocked — external/user gate.** No disposable Jira/GitHub sandbox
has been created or mutated (`docs/progress/IMPLEMENTATION_STATUS.md` row
8), and this repository's effect pump ships default-off with an empty
adapter registry (row 7). Notion credentials are a further, separate
external gate with no existing record anywhere in this repository.

Status: not started; blocked on the credential gates above even once
Phase 4 is complete.

## Phase 6 — Release rail

Deliverables:

- Release-stage visibility inside Studio, projected from the single 8-stage
  `ReleaseManifestV1` / `RELEASE_STAGE_ORDER_V1` state machine
  ([ADR 0003](../architecture/0003-release-state-reconciliation.md)) —
  surfaced, not duplicated.

Gates: **Blocked — protected approval** (release and signing logic are
protected surfaces under [`AGENTS.md`](../../AGENTS.md)) and **Blocked —
external/user gate** (Apple Developer / App Store Connect access, per
`docs/progress/IMPLEMENTATION_STATUS.md` rows 13–14).

Status: not started. `IMPLEMENTATION_STATUS.md` row 13 additionally notes
that neither release schema has a consumer yet in this repository — there is
nothing for Studio to surface until a release pipeline wires
`ReleaseManifestV1` to begin with.
