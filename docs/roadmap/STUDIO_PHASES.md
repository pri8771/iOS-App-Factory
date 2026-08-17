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
**Blocked — external/user gate**. Updated 2026-08-17 against
`integration/studio-wave1`: Phases 1–4 are merged and this is now the
authoritative status for them; the corresponding
[`IMPLEMENTATION_STATUS.md`](../progress/IMPLEMENTATION_STATUS.md) "Studio
(Mac app)" section carries the same read, with file-level citations. Phases
5–6 remain not started, credential-gated as described below.

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

**Status: Implemented.** `apps/studio-mac` is a real app in this repository
(not a separate worktree) — `Sources/StudioKit/Client/DaemonClient.swift`
(631 lines) frames the Unix-socket protocol over `NWConnection`
(`UnixSocketExchange.swift`), and `Sources/StudioKit/Dashboard/` reads
`portfolio.snapshot` through `StudioStore`/`DashboardDerivation`.
`swift build` succeeds; see the "Build & test" section of
[`apps/studio-mac/README.md`](../../apps/studio-mac/README.md).

## Phase 2 — Studio service in the daemon

Deliverables:

- New daemon-owned state and commands for rooms, phases, phase presets, and
  milestones, additive to the daemon's command surface
  (`apps/daemon/src/command-runtime.ts`).
- A `milestones[]` schema in `packages/contracts`.
- A `phase` field on tasks/attempts, distinct from the two unrelated
  existing uses of the word "phase" already in contracts
  (`AgentProgressEventV1Schema.data.phase` and
  `EnrollmentPlanActionV1Schema.phase`) — see
  [ADR 0004](../architecture/0004-studio-mac-app.md).
- Rule scoping (`appliesTo` a phase), waivers, a human-only owner field, and
  a check registry in `packages/policy-engine`.

Gates: the lifecycle-vocabulary reconciliation ADR 0004 required is decided
in [ADR 0005](../architecture/0005-lifecycle-reconciliation.md) — the
project lifecycle is `ProjectLifecycleStageV1` (`idea | building | qa |
launch-prep | live | frozen`) with typed, owner-marked gates, and the
release sub-lifecycle beneath `launch-prep -> live` is ADR 0003's
`ReleaseManifestV1`.

**Status: Implemented, with one sub-item still Dormant / not wired.**

- `studio.snapshot` and
  `studio.assistant.{query,intent.propose,intent.execute}` are real,
  unconditional operations —
  `packages/contracts/src/v1/command-protocol.ts`'s `CommandRequestFrameV1Schema`
  discriminated union carries all four as first-class literals (not
  feature-gated), and `apps/daemon/src/command-runtime.ts` dispatches them to
  real handlers (`buildStudioSnapshotV1`, `computeAssistantAnswerV1`,
  `proposeAssistantIntentV1`, plus a full intent-dispatch path). The Swift
  client's `DaemonClientError.isUnsupportedOperation` fallback exists only
  for talking to an _older_ daemon build; against this daemon these ops are
  always present.
- `packages/contracts/src/v1/milestone.ts` defines `ProjectMilestoneV1Schema`,
  and `ProjectTimelineV1Schema` carries `milestones: []`. Kernel migration
  [`0007-project-milestones.ts`](../../packages/kernel/src/migrations/0007-project-milestones.ts)
  persists it (a compare-and-set-upsert-plus-revision-history table, the same
  pattern every later Studio revisioned entity reuses).
- `packages/contracts/src/v1/task-spec.ts` carries
  `phase: StableKeySchema.optional()` on `TaskSpecV1Schema`, with a doc
  comment distinguishing it from the two pre-existing unrelated uses of
  "phase".
- `packages/policy-engine/src/index.ts` now has `RuleScopeV1Schema`
  (`appliesTo`), `WaiverV1Schema`, a `PolicyOwnerV1Schema` owner field on both
  rules and required checks, and `RequiredCheckV1Schema` (the check
  registry) — all four features the original Phase 2 deliverable named as
  missing now exist. It is wired into the daemon, not merely compiled
  standalone: `apps/daemon/src/command-runtime.ts`'s `assertTaskPolicyBinding`
  calls `decideTaskPolicyBinding` against a resolved `PolicyLockV1` on every
  task intake and rejects on a `"rejected"` verdict
  (`apps/daemon/test/task-policy-gate.test.ts` covers this), and
  `apps/daemon/src/phase-command-runtime.ts`'s `loadKnownStandardRuleIdsV1`
  validates `rules.standard[]` references on every phase/preset upsert
  against the compiled corpus (`packages/policy-corpus`,
  [`docs/policy/ios-app-factory-policy-source.v1.json`](../policy/ios-app-factory-policy-source.v1.json)).
- **Dormant / not wired**: [ADR 0005](../architecture/0005-lifecycle-reconciliation.md)'s
  `ProjectLifecycleStateV1` machine
  (`packages/contracts/src/v1/lifecycle.ts` — `ProjectLifecycleStageV1`,
  `TypedGateV1`, `evaluateProjectLifecycleV1`, `applyProjectLifecycleGate`,
  `advanceProjectLifecycleStage`) exists as contracts only. The ADR's own
  "Non-goals" section says so directly: persisting the state (a kernel
  table, a daemon command, a `LifecycleEventV1`) is explicitly out of scope,
  and no consumer is wired. `apps/daemon/src/studio-command-runtime.ts`
  confirms this in a code comment: "no kernel-side source exists to outrank
  repo docs yet." Studio still reads project lifecycle from the older,
  separate `ProjectManifestV1.lifecycleStage` enum in repo docs, not this
  machine.

## Phase 3 — Chat + rooms

Deliverables:

- The corner chat popup (bottom-right, switchable conversations, minimizes
  to a FAB) and the full chat screen.
- The assistant answering status/timeline questions only from repository
  docs and Factory evidence (portfolio snapshot, evidence manifests),
  structurally unable to state a date not present in that evidence.
- Intent-driven actions ("build X", "analyze Y", "queue Z") mapped to
  existing daemon commands, with no wizard screens.
- A daemon-owned room engine (deterministic moderator, admission/scoring/
  budget rules) and live Codex/Claude/Ollama room participants.

Gates: depends on Phase 2's service surface for durable room/conversation
state.

**Status: Implemented for the code path; the specific claim of a live,
real-model round is owner-reported, not independently verifiable from this
repository.**

- `packages/studio-rooms` (moderator, admission, quota governor, repository
  — kernel migration
  [`0008-studio-rooms.ts`](../../packages/kernel/src/migrations/0008-studio-rooms.ts))
  and `packages/studio-room-adapters` (`codex-participant.ts`,
  `claude-participant.ts`, `ollama-participant.ts`, `scorer-bridge.ts`,
  `roster.ts`) both exist with substantial, tested, non-stub
  implementations. `room.create/list/post/events/typing` are unconditional
  wire operations, dispatched in `apps/daemon/src/command-runtime.ts`.
  `apps/studio-mac/Sources/StudioKit/Rooms/` (`RoomsModel.swift`,
  `RoomViews.swift`) is wired into `StudioRootView`'s `.chat` tab and corner
  chat.
- The commit history records a claimed live round: `513fb39`'s message says
  "Live smoke (owner-approved real-model use...): a real daemon with rooms
  enabled ran a research room with Codex + Claude + a local Ollama model
  (qwen2.5-coder:14b)... The moderator then autonomously chained two more
  real-model rounds... before correctly self-limiting at the
  3-consecutive-agent-message chain cap," and the `620b1fb` merge message
  adds "value-gated admission, @mention forced invite, and the
  3-consecutive-agent-message cap all observed on real CLIs." **This claim
  could not be independently verified**: every test added by that change
  (`packages/studio-room-adapters/test/*`) exercises a `FakeProcess`/
  `fakeSupervisor` fixture, not a real Codex/Claude/Ollama binary, and no
  transcript, evidence blob, or mirror/broker-commit reference exists for
  it anywhere in this repository. Unlike a task attempt, a room round's
  transcript lives only in the kernel's private SQLite database, not a
  Git-backed Factory mirror — so there is no mechanism today for a reader
  of this repository to check this claim the way
  [`RUN_LEDGER.md`](../progress/RUN_LEDGER.md)'s own verification recipe
  checks a task attempt. It is recorded there as owner-reported, not fact.

## Phase 4 — Phases + planner

Deliverables:

- User-editable Phase Presets: mode `solo | panel | debate | chat`, cast,
  per-phase rules (standard rules machine-enforced, the user's own rules
  prompted), typed outputs written into repository docs, and gates.
- The default iOS preset collapsing Gen 2's reported 22 phases to roughly 8
  plus gates.
- The Phase Runner: durable, attempt-shaped execution of one phase
  (`phase.run/status/list/approve/reject`).
- The Planner: an editable, ordered plan of tasks and human gates built
  from a preset
  (`plan.propose/edit/approve/execute/approve-gate/status/tick`), plus
  `project.seed` — the from-scratch entry point for a brand-new project.
- A multi-project registry so the daemon can track more than one enrolled
  project at once (`project.register/list/show`).

Gates: depends on Phase 2's `phase`/preset/milestone schema. The lifecycle
vocabulary the planner binds to is settled by
[ADR 0005](../architecture/0005-lifecycle-reconciliation.md), though (see
Phase 2 above) that vocabulary is not yet persisted anywhere the planner
reads.

**Status: Implemented**, including two wire gaps
[`apps/studio-mac/docs/architecture/0004-studio-phase4-presets-planner.md`](../../apps/studio-mac/docs/architecture/0004-studio-phase4-presets-planner.md)
recorded honestly and this pass closed:

- Contracts: `phase.ts`, `phase-run.ts`, `project-plan.ts`,
  `project-registry.ts` in `packages/contracts/src/v1`. Daemon:
  `phase-command-runtime.ts`, `phase-run-command-runtime.ts`,
  `phase-run-executor.ts`, `phase-output-mirror.ts`,
  `project-plan-command-runtime.ts`, `project-seed-command-runtime.ts`,
  `project-registry-command-runtime.ts`. Kernel migrations
  [`0009-phase-presets.ts`](../../packages/kernel/src/migrations/0009-phase-presets.ts),
  [`0010-project-plans.ts`](../../packages/kernel/src/migrations/0010-project-plans.ts),
  [`0011-phase-runs.ts`](../../packages/kernel/src/migrations/0011-phase-runs.ts),
  [`0012-project-registry.ts`](../../packages/kernel/src/migrations/0012-project-registry.ts).
  StudioKit: `Phases/` (`PhasesModel`, `PhasesScreen`, `PhaseEditorView`,
  `PhaseRunStatusStrip`) and `Planner/` (`PlannerModel`, `PlannerScreen`,
  `SeedProjectSheet`), all calling real `DaemonClient` methods, not stubs.
  The daemon's wire surface is 54 distinct operations (counted from
  `apps/daemon/src/command-runtime.ts`'s dispatch switch), all real,
  including the sixteen this phase added.
- **Closed this pass**: `plan.edit`'s edit union had no kind to change the
  plan's brief (title/oneLiner/constraints) — `ProjectPlanEditV1` gained an
  `edit-brief` kind (contracts, the daemon handler, and tests), and
  `PlannerScreen` no longer renders the brief with a "not editable yet"
  provenance badge.
- **Closed this pass**: `project.seed`'s result named no
  `RepositoryID`/`ProjectID`, so a seeded project could not be planned
  against without an operator manually setting one. `project.seed` now
  registers the seeded project into the Project Registry when the post-seed
  enrollment scan carries zero `rules.*` blockers (the same gate
  `project.register` itself enforces) and returns
  `{registered, projectId, repositoryId, slug}`; `SeedProjectSheet` proposes
  the plan with the real IDs whenever `registered` is `true`.
- Live proof recorded in the `studio/project-registry` merge commit message
  (`d757bea`, this repository's own history): a dedicated Hindsight scratch
  clone (never the real checkout) was registered via `project.register`,
  and the research phase of the `ios-app-standard-0.4.0` preset ran against
  it end to end with a composed Ollama roster (`qwen2.5-coder:14b`),
  producing a real grader verdict (pass) and a commit landing at
  `Docs/product/research.md`, read back from the project's real Factory
  mirror. This is anchored in a commit message in this repository, not
  independently re-verified here against the external Hindsight mirror; see
  [`RUN_LEDGER.md`](../progress/RUN_LEDGER.md) for the same caveat applied
  to every "phase-runner live run" claim below it.

## Phase 5 — Mirrors + analytics

Deliverables:

- Jira and Notion as one-way mirrors of repository docs. The repository
  remains the source of truth; the mirrors are synced from it and never
  written back into it.
- Dashboard analytics: the Gantt centerpiece with the dashed-red "no honest
  estimate" bar, radial gauges, the portfolio reticle, and per-project phase
  rings — all reading only committed evidence, never inferring a date.

Gates: **Blocked — external/user gate.** No disposable Jira/GitHub sandbox
has been created or mutated
(`docs/progress/IMPLEMENTATION_STATUS.md` row 8), and this repository's
effect pump ships default-off with an empty adapter registry (row 7). Notion
credentials are a further, separate external gate with no existing record
anywhere in this repository.

Status: not started; the credential gates above are unchanged as of
2026-08-17.

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

## What is NOT proven, as of 2026-08-17

Independent of the phase-by-phase status above, these remain true for the
whole Studio effort and the Gen 4 daemon it runs on:

- No live Jira, GitHub, or App Store Connect call has ever been made from
  this repository's code — the effect pump ships default-off with an empty
  adapter registry (row 7 of `IMPLEMENTATION_STATUS.md`).
- The read-only Codex independent-reviewer adapter has never made a live
  model call; it has passed only fake-executable tests.
- No quality gate, certification, archive, upload, or TestFlight build has
  run from this daemon.
- Unattended rooms mode (`room.unattendedEnabled`, the `dormant` attendance
  path in `packages/studio-rooms/src/moderator.ts`) is implemented and unit
  tested against fakes, but has not been proven live the way the attended
  path's commit messages claim.
- `room.participants.list` (read-only, `RoomParticipantsCatalogV1`) now lists
  the daemon's configured providers and roster, wire-safe, and the new-room
  sheet seeds its participant rows from it (`apps/studio-mac/README.md`'s
  "Rooms" section). With `APP_FACTORY_ROOMS_ENABLED` unset the daemon answers
  `enabled: false` with a reason and the sheet keeps an honest client-side
  suggestion badged NOT YET SOURCED — the catalog is served, but its contents
  have not been read from a live rooms-enabled daemon by this repository's
  tests (fake ports and recorded fixtures only).
- Phases 5–6 remain credential-gated as described above.
