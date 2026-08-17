# Studio (macOS)

The native macOS front end for the App Factory daemon. SwiftPM package, macOS 14+, Swift 6 language
mode.

```
apps/studio-mac/
├── Package.swift                 StudioKit (library) · Studio (app) · StudioKitTests
├── Sources/StudioKit
│   ├── DesignSystem/             HUDTheme, HUDTypography, HUDPanel, RadialGauge, PhaseRing,
│   │                             DiamondGate, StatusPill, HUDButton, ProvenanceBadge, HUDGallery
│   ├── Client/                   DaemonClient (actor, Network.framework), AuthorizationToken,
│   │                             ExchangeSession, DaemonClientError, DaemonLocator
│   ├── Models/                   Codable mirrors of packages/contracts v1 (49 operations — the
│   │                             phase-1 21, Studio Phase 2's studio.snapshot,
│   │                             studio.assistant.{query,intent.propose,intent.execute},
│   │                             project.milestones.{list,upsert}, the six room.* ops
│   │                             (room.create/list/post/events/typing + the read-only
│   │                             room.participants.list catalog), and Studio Phase 4's
│   │                             preset.{list,upsert}/phase.upsert, phase.{run,status,list,approve,
│   │                             reject}, plan.{propose,edit,approve,execute,approve-gate,status,
│   │                             tick}, and project.seed): StudioSnapshot.swift, Assistant.swift,
│   │                             Milestone.swift, Room.swift, Phase.swift, PhaseRun.swift,
│   │                             ProjectPlan.swift, ProjectSeed.swift), Provenance/Sourced,
│   │                             Timeline (ProjectTimeline, DayStamp, fixture loader)
│   ├── Canonical/                JSONValue, CanonicalJSON, PortfolioDigest, StudioSnapshotDigest,
│   │                             RoomParticipantsCatalogDigest
│   ├── Dashboard/                DashboardModel (pure derivations — a phase-1 portfolio.snapshot
│   │                             branch and a Phase 2 studio.snapshot branch), TimelineView
│   │                             (Canvas Gantt), PortfolioReticle, GaugeRowView, AwaitingYouList,
│   │                             PhaseRingsRow + LifecycleTrack, ProjectDetailView, RunDetail,
│   │                             MilestoneEditorView
│   ├── Chat/                     ScriptedAssistant (stub fallback) + DaemonAssistant
│   │                             (AssistantBackend, IntentRecognizer) + ChatModel, CornerChatView,
│   │                             ChatScreen — both gain a Rooms section when a RoomsModel is
│   │                             supplied, and open the Planner when confirming a propose-plan/
│   │                             execute-plan intent card resolves to a ProjectPlan (see ADR 0004)
│   ├── Rooms/                    RoomsModel (@Observable — room.list/events polling, room.post,
│   │                             debounced room.typing, room.participants.list on sheet appear),
│   │                             RoomMessageRow (human/agent/system/typed-error/PASS),
│   │                             RoomTranscriptView, RoomRosterPanel (live state · budget meter ·
│   │                             mode line), NewRoomSheet (participants sourced from the catalog)
│   ├── Phases/                   PhasesModel (@Observable — preset.list, phase.upsert then
│   │                             preset.upsert on save, phase.run + phase.status polling,
│   │                             phase.approve/reject, phase.list), PhasesScreen (presets ·
│   │                             editor · recent runs), PhaseEditorView, PhaseRunStatusStrip
│   ├── Planner/                  PlannerModel (@Observable — plan.propose/edit/approve/execute/
│   │                             approve-gate, plan.status polling while executing,
│   │                             project.seed), PlannerScreen (the punch list), SeedProjectSheet
│   ├── Shell/                    StudioStore (@Observable, owns a RoomsModel/PhasesModel/
│   │                             PlannerModel), StudioTitleBar, DashboardScreen, StudioRootView
│   └── Resources/timeline-fixture.json   FIXTURE rows for the six apps (see docs 0002)
├── Sources/Studio/StudioApp.swift  the app: locate daemon from env, own the store, one window
├── Tests/StudioKitTests/         unit, fake-daemon, snapshot, and live-daemon (skippable) tests
├── scripts/record-fixtures.mjs   regenerates Tests/…/Fixtures through the real zod schemas
├── scripts/record-room-fixtures.mjs   the room.* fixtures (transcript ops + room.participants.list,
│                                 enabled and disabled), standalone — see the script's own doc
│                                 comment for why it isn't folded into record-fixtures.mjs
├── scripts/record-phase4-fixtures.mjs   the preset/phase-run/plan/project.seed fixtures, against
│                                 this worktree's own built contracts (see ADR 0004)
├── scripts/record-lifecycle-stage-fixture.mjs   lifecycle-stages.json — the canonical six /
│                                 legacy eight / fold map, straight from lifecycle.ts, so
│                                 ProjectLifecycleStage is pinned to the contract (ADR 0005)
└── docs/architecture/            0001 foundations · 0002 dashboard provenance + fixture timeline ·
                                   0003 Studio Phase 2 (studio.snapshot, assistant, milestones) ·
                                   0004 Studio Phase 4 (presets, the Phase Runner, the Planner)
```

## Build & test

```sh
cd apps/studio-mac
swift build
swift test
```

The live-daemon tests skip unless a socket exists. Point them at one with:

```sh
STUDIO_TEST_DAEMON_SOCKET=/tmp/af-ui/runtime/daemon.sock \
STUDIO_TEST_DAEMON_AUTH_FILE=/tmp/af-ui/etc/auth.token \
STUDIO_TEST_EXPECTED_ATTEMPTS=3 swift test --filter DaemonIntegrationTests
```

## Run the shell

```sh
APP_FACTORY_SOCKET=/tmp/af-ui/runtime/daemon.sock \
APP_FACTORY_AUTH_FILE=/tmp/af-ui/etc/auth.token \
swift run Studio
```

`APP_FACTORY_RUNTIME_DIR` (socket = `<dir>/daemon.sock`) and `APP_FACTORY_AUTH_TOKEN` are also honoured.
The token file must be a private (0600, owned by you) regular file, as the daemon itself requires.

Release binary (bare executable, no bundle; the same environment applies):

```sh
swift build -c release
APP_FACTORY_SOCKET=/tmp/af-ui/runtime/daemon.sock \
APP_FACTORY_AUTH_FILE=/tmp/af-ui/etc/auth.token \
.build/release/Studio
```

No daemon at that path? Run one on a private runtime and point both the app and the tests at it — the
daemon insists on a 0700 runtime directory and a 0600 token file, and Unix socket paths must stay short:

```sh
RT="$TMPDIR/afrt"; mkdir -p "$RT/runtime" "$RT/etc"; chmod 700 "$RT" "$RT/runtime" "$RT/etc"
(umask 077; head -c 32 /dev/urandom | xxd -p -c 64 | tr -d '\n' > "$RT/etc/auth.token")
APP_FACTORY_RUNTIME_DIR="$RT/runtime" APP_FACTORY_AUTH_FILE="$RT/etc/auth.token" \
APP_FACTORY_DAEMON_VERSION=0.1.0-ui-demo node ../daemon/dist/main.js &
# seed attempts with @app-factory/command-client (task.run × 3 → DeterministicFakeExecutor → succeeded)
APP_FACTORY_SOCKET="$RT/runtime/daemon.sock" APP_FACTORY_AUTH_FILE="$RT/etc/auth.token" .build/release/Studio
```

## What is live, fixture, or stub

Every value on screen carries a provenance badge — LIVE · DERIVED · FIXTURE · STATIC · NOT YET SOURCED.

Studio feature-detects `studio.snapshot` on every refresh (see docs/architecture/0003): against a
daemon with the Phase 2 studio service, the dashboard, awaiting-you, timeline gates/milestones, and the
corner chat are sourced from it; against a phase-1-only daemon (or none), everything below still holds.

- **Live** (daemon): title-bar beacon (doctor), projects gauge, awaiting-you count, reticle when the
  daemon reports lifecycle stages, awaiting-you blocked attempts, attempt marks on timeline rows,
  live-only project rows, project detail readouts, latest-run checks (attempt.events + evidence.verify).
  With `studio.snapshot`: the gauge row's verified/awaiting/pass-rate/median-run/agent-window readouts
  (each independently NOT YET SOURCED per its own `unavailableReason`), awaiting-you from
  `projects[].awaitingHuman`, ◆ gates from `projects[].gates` (gold only when human-owned), milestone
  bars overlaid on the timeline (flips a matched fixture row FIXTURE → FIXTURE + LIVE), the project
  detail gates/milestones panels, and the corner chat's `studio.assistant.query` answers (citations as
  chips) and intent confirmation cards.
- **Derived** (computed from live): verified · 7d (phase-1 path only — Phase 2 reads it straight off
  `StudioPortfolioAggregates.verifiedThisWeek`).
- **Fixture** (`timeline-fixture.json`, TODO milestones schema): the six timeline rows and their
  lifecycle tracks, ◆ gates in awaiting-you, phase rings, reticle fallback.
- **Static / stub**: budget 38%, the scripted assistant — now only the fallback path when
  `studio.assistant.query`/`.intent.propose` is unsupported or fails (see docs/architecture/0003).
- **Not yet sourced**: min / release (no Phase 2 aggregate names it — see 0003); agent window until the
  daemon actually computes `agentWindowShare` (today it always reports `unavailableReason`); a
  proposed plan's `repositoryId`/`projectId` when `project.seed` did not register (rare — only when the
  post-seed rescan still carries a `rules.*` blocker; see ADR 0004 decision 5, closed).

### Phases and the Planner

`preset.*`/`phase.*`/`plan.*`/`project.seed` are unconditionally supported, like `room.*` below — no
feature-detection fallback (see ADR 0004). Everything the PHASES tab and the Planner show is **live**:
the preset list and the selected phase's fields, a launched run's state (polled via `phase.status`
while it is not terminal), the recent-runs panel (`phase.list`), and the punch list (`plan.status`,
polled while `executing`), including the brief at the top of the punch list — `plan.edit` gained an
`edit-brief` kind (ADR 0004 decision 4, closed), so the brief is ordinary live plan data now, not a
provenance-badged exception. `PlannerModel.editBrief(_:)` calls it; `PlannerScreen` does not yet draw
an edit affordance for it (nor for retitle/edit-task-spec-draft/add-item/remove-item/set-repository —
those are wired at the model level too, with no UI here either), but it no longer claims the daemon
lacks the capability. `project.seed` also now registers a converged seed into the Project Registry and
returns a real `repositoryId`/`projectId` (ADR 0004 decision 5, closed); `SeedProjectSheet` proposes
the plan with that real ID instead of `nil` whenever `registered` is `true`.

### Rooms

`room.create/list/post/events/typing/participants.list` are unconditionally supported by any daemon
built from this contract — no feature-detection fallback, unlike `studio.snapshot`/`studio.assistant.*`
above (see `CommandOperation`'s doc comment). Everything the Chat tab's Rooms section and a selected
room's transcript/roster/budget panel show is **live**, straight off `room.events`: messages (human/
agent/system), the roster's benched-until state, and the budget meter. "Passed last round" in the
roster is **derived** from the loaded transcript's most recent system line for that persona. A round in
progress is shown at room level only (`room.activeGrantId != nil`) — the wire never says _which_
participant currently holds the floor, so Studio never attributes it to one. The new-room sheet's
participant rows are sourced from `room.participants.list` (`RoomParticipantsCatalogV1`: the daemon's
configured providers by key/model/pinned CLI version plus the operator's roster — never executables,
paths, digests, or base URLs; `sourceDigest` re-verified client-side like `studio.snapshot`), read
afresh every time the sheet appears: with the rooms subsystem enabled the sheet seeds one **live** seat
per configured provider (personas/display names editable; rows the human edited are never overwritten
by a later read); with it disabled the daemon says so (`enabled: false` + its own `unavailableReason`,
never an error) and the sheet keeps a clearly-labelled **not yet sourced** local suggestion instead.
`RoomCreateSpecV1` still has no "kind" (research/project/lounge) field to source a picker from — the
catalog's roster carries the operator's per-room `kind`, but a new room has no roster entry yet.

## Design rules (non-negotiable)

- Cyan (`HUDTheme.arc`) is the machine's voice. Gold (`HUDTheme.gold`) is only things waiting on the
  human. Components take a `HUDRole`, never a raw colour, so this holds by construction.
- Mono uppercase letter-spaced labels; Avenir Next for headings; SF Pro for body.
- Bracketed panel corners, radial gauges, phase rings, ◆ human gates, dashed cyan = planned,
  dashed alert = "won't guess". Every instrument shows a real value or an honest "—".
