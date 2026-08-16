# ADR 0004: Studio — one native Mac app is the Gen 5 product surface

Status: accepted decision (owner, 2026-08-16); Phase 1 implementation in
progress on branch `studio/phase1` in a separate worktree, not merged into
this branch  
Date: 2026-08-16

## Context

This repository's current operator-facing surfaces are `apps/cli`, the
`apps/daemon` singleton scheduler and command broker, `apps/dashboard` (a
React/Vite loopback-only local web control surface, per
[ADR 0001](0001-greenfield-foundation.md)), and `apps/mcp`. The daemon's
command switch (`apps/daemon/src/command-runtime.ts`) currently dispatches 21
distinct commands (task submit/run, attempt pause/resume/cancel/retry/unblock,
attempt status/events/list, `daemon.reconcile`, evidence list/inspect/verify,
`portfolio.snapshot`, project scan/enroll-plan/apply, and effects
status/list — counted 2026-08-16). `docs/roadmap/BUILD_STAGES.md`'s Stage 7
had planned to grow `apps/dashboard` into "the full supported local command
center, approval, evidence, cost, health, and portfolio experience."
`docs/progress/IMPLEMENTATION_STATUS.md` row 15 records what the dashboard
actually does today: daemon health, attempt actions, one-use browser
authentication, graceful shutdown, and a digest-verified local portfolio
view — not the multi-project analytics, chat, and phase-editing surface the
owner wants.

The owner decided on 2026-08-16 that the dashboard's planned growth path is
not the product. The decision (superseding a 2026-08-15 five-tab framing)
is:

1. One native Mac app, working name **Studio**, chat-centric.
2. Dashboard = analytics and timelines for every project: a Gantt chart as
   the centerpiece, with a dashed-red bar meaning "no honest estimate" (the
   assistant and the dashboard must never invent a date it cannot source from
   evidence), radial gauges, a portfolio reticle, and per-project phase
   rings.
3. A corner chat popup (bottom-right, switchable conversations, minimizes to
   a FAB) plus a full chat screen for longer work.
4. The assistant answers status/timeline queries from repository docs and
   Factory evidence and never invents dates; it acts directly on intent
   ("build X", "analyze Y", "queue Z") with no wizard screens.
5. Phases are kept and made user-editable: mode `solo | panel | debate |
chat`, cast, per-phase rules (standard rules are machine-enforced, the
   user's own rules are prompted), typed outputs written into repository
   docs, and gates. "Phase Presets" bundle an ordered phase list — the
   renamed carrier for the V3 "Situation" concept. The default iOS preset
   collapses Gen 2's reported 22 phases to roughly 8 plus gates, grounded in
   a deep-dive finding that only `app_features`, `tech_specs`,
   `task_assignments`, and `design_handoff` emitted machine-readable
   artifacts, and 82% of phases reached round-1 consensus without further
   debate. (Gen 2's own codebase is not part of this repository and, per the
   owner's records, no longer exists in recoverable form; this ADR records
   the finding as owner-reported grounding for the preset design, not as
   something independently reproduced here.)
6. Docs inside each project repository are the source of truth; Jira and
   Notion are convenience mirrors synced from the repository, never the
   reverse.
7. Theme "HUD": cyan (`#3FD8E8`)-dominant on near-black; gold (`#F0A93B`)
   reserved exclusively for things awaiting the human; bracketed panel
   corners; a ◆ diamond marks a human gate. Rule: nothing the machine claims
   renders gold, and nothing the human decides renders cyan.
8. The Mac app is a client of the existing daemon over its current wire
   protocol; CLI and MCP remain the automation-facing clients; `apps/dashboard`
   is demoted to a debug surface.
9. Gen 2 GUI verdict: harvest only. Its `ThemeTokens`, `ComponentKit`, and
   shell-skeleton ideas carry over, reimplemented; the app itself is a fresh
   Swift client. [ADR 0001](0001-greenfield-foundation.md)'s "no legacy
   module is imported into the new kernel" stands, and this decision applies
   the same boundary to the GUI: nothing is imported wholesale.
10. Allowed SwiftPM dependencies: `swift-markdown-ui`, `Highlightr`,
    `swift-snapshot-testing`. No others without a further decision.

## Decision

Adopt the above as the Gen 5 product decision. The build proceeds in six
capability phases, detailed in
[`docs/roadmap/STUDIO_PHASES.md`](../roadmap/STUDIO_PHASES.md):

1. **Shell** — `apps/studio-mac` SwiftPM workspace (`StudioKit` + `Studio` +
   tests), a `DaemonClient` over `NWConnection` speaking the daemon's
   existing command protocol, the HUD design system, and a dashboard reading
   the live daemon.
2. **Studio service in the daemon** — rooms, phases, presets, and milestones
   as new daemon-owned state and commands.
3. **Chat + rooms.**
4. **Phases + planner.**
5. **Mirrors + analytics** — Jira/Notion one-way sync; credential gates
   apply (see Consequences).
6. **Release rail.**

Phase 1 is in progress on branch `studio/phase1`, built in a separate
worktree. As of this decision it is not merged into `integration/t3-t7` or
`main`; nothing described in this ADR is implemented, wired, or verified in
this repository yet.

## Consequences

- **New app target.** `apps/studio-mac` will join this repository's `apps/`
  once Phase 1 merges. Until then, this repository's `apps/` listing stays
  exactly `cli`, `daemon`, `dashboard`, `mcp` (see `README.md`).
- **`apps/dashboard` demoted.** Its planned growth into a full command center
  (`docs/roadmap/BUILD_STAGES.md` Stage 7) is superseded. Its existing
  capabilities (IMPLEMENTATION_STATUS.md row 15) are not removed, only
  reframed: it is a local web debug surface, not the product.
- **Daemon service additions required.** Rooms, phases, presets, and
  milestones (Studio phase 2) do not exist anywhere in the daemon's current
  21-command surface and must be added additively.
- **Known gaps this decision surfaces**, none scheduled by this ADR — they
  are recorded here so a later phase does not have to rediscover them:
  - `packages/contracts/src/v1/task-spec.ts` has no `phase` field. Contracts
    already use the word "phase" for two unrelated concepts:
    `AgentProgressEventV1Schema.data.phase` (a free-form label for a step
    inside one running agent) and `EnrollmentPlanActionV1Schema.phase` (a
    six-value enrollment-action category: `safety | compatibility |
authority | project | quality | automation`). Neither is a Studio Phase
    Preset stage; a Studio `phase` field is a new, distinct addition.
  - No milestone type exists anywhere under `packages/` (verified
    2026-08-16: zero matches for "milestone"). A `milestones[]` schema is a
    prerequisite for the Gantt view's planned-vs-actual dates and the
    dashed-red "no honest estimate" bar.
  - `packages/policy-engine/src/index.ts` has no rule scoping (`appliesTo` a
    phase), waivers, a human-only owner field, or a check registry (verified
    2026-08-16: zero matches for `appliesTo`, `waiver`, or `scope` in that
    file).
  - Four lifecycle vocabularies are reported to disagree: the separately
    versioned rules corpus's 14-stage lifecycle (outside this repository —
    see ADR 0001's "rules" state-authority row), a mission-control
    `gates.md` (outside this repository), this repository's own
    `ProjectManifest` lifecycle, and the in-progress studio-ios preset. This
    ADR does not reconcile them; reconciliation is a prerequisite for
    Studio phase 4 so the planner does not bind Phase Presets to a
    vocabulary that later changes under it.
  - The separately versioned rules corpus is reported pinned at three
    different versions depending on which consumer reads it — 0.2.0 local,
    0.4.0 upstream, 0.5.0 CLI — not independently checked from within this
    repository, whose own `packages/policy-engine` uses an unrelated integer
    `policyVersion`, not this semver string.

## Alternatives rejected

- **Five-tab layout (the 2026-08-15 framing).** Rejected 2026-08-16 in favor
  of the chat-centric single-app framing above. The five-tab shape was never
  merged or implemented; it is superseded, not removed code.
- **Salvaging Gen 2 GUI wholesale.** Rejected: ADR 0001 already forecloses
  importing legacy modules into the new kernel, and this decision applies
  the same boundary to the GUI. Gen 2 GUI's own store is reported by the
  owner as a large, Python-coupled monolith; only the `ThemeTokens`,
  `ComponentKit`, and shell-skeleton ideas carry over, reimplemented against
  the current daemon protocol.
- **The Composable Architecture (TCA).** Rejected: the allowed-dependency
  list settled on 2026-08-16 (`swift-markdown-ui`, `Highlightr`,
  `swift-snapshot-testing`) does not include it. Committing to a
  reducer-based, cross-cutting state-management framework before Phase 1's
  shell and daemon client have proven the app's actual state shape would
  lock the harvested `ThemeTokens`/`ComponentKit` ideas to a specific
  architecture ahead of any evidence that it fits; that evidence, if it
  emerges, is a later decision, not this one.
