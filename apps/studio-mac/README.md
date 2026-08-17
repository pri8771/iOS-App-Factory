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
│   ├── Models/                   Codable mirrors of packages/contracts v1 (32 operations — the
│   │                             phase-1 21, Studio Phase 2's studio.snapshot,
│   │                             studio.assistant.{query,intent.propose,intent.execute},
│   │                             project.milestones.{list,upsert}, and the five room.* ops
│   │                             (room.create/list/post/events/typing): StudioSnapshot.swift,
│   │                             Assistant.swift, Milestone.swift, Room.swift), Provenance/Sourced,
│   │                             Timeline (ProjectTimeline, DayStamp, fixture loader)
│   ├── Canonical/                JSONValue, CanonicalJSON, PortfolioDigest, StudioSnapshotDigest
│   ├── Dashboard/                DashboardModel (pure derivations — a phase-1 portfolio.snapshot
│   │                             branch and a Phase 2 studio.snapshot branch), TimelineView
│   │                             (Canvas Gantt), PortfolioReticle, GaugeRowView, AwaitingYouList,
│   │                             PhaseRingsRow + LifecycleTrack, ProjectDetailView, RunDetail,
│   │                             MilestoneEditorView
│   ├── Chat/                     ScriptedAssistant (stub fallback) + DaemonAssistant
│   │                             (AssistantBackend, IntentRecognizer) + ChatModel, CornerChatView,
│   │                             ChatScreen — both gain a Rooms section when a RoomsModel is supplied
│   ├── Rooms/                    RoomsModel (@Observable — room.list/events polling, room.post,
│   │                             debounced room.typing), RoomMessageRow (human/agent/system/typed
│   │                             -error/PASS), RoomTranscriptView, RoomRosterPanel (live state ·
│   │                             budget meter · mode line), NewRoomSheet
│   ├── Shell/                    StudioStore (@Observable, owns a RoomsModel), StudioTitleBar,
│   │                             DashboardScreen, StudioRootView, PhasesScreen
│   └── Resources/timeline-fixture.json   FIXTURE rows for the six apps (see docs 0002)
├── Sources/Studio/StudioApp.swift  the app: locate daemon from env, own the store, one window
├── Tests/StudioKitTests/         unit, fake-daemon, snapshot, and live-daemon (skippable) tests
├── scripts/record-fixtures.mjs   regenerates Tests/…/Fixtures through the real zod schemas
├── scripts/record-room-fixtures.mjs   the room.* fixtures, standalone — see the script's own doc
│                                 comment for why it isn't folded into record-fixtures.mjs
└── docs/architecture/            0001 foundations · 0002 dashboard provenance + fixture timeline ·
                                   0003 Studio Phase 2 (studio.snapshot, assistant, milestones)
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
- **Static / stub**: budget 38%, the Phases tab, the scripted assistant — now only the fallback path
  when `studio.assistant.query`/`.intent.propose` is unsupported or fails (see docs/architecture/0003).
- **Not yet sourced**: min / release (no Phase 2 aggregate names it — see 0003); agent window until the
  daemon actually computes `agentWindowShare` (today it always reports `unavailableReason`).

### Rooms

`room.create/list/post/events/typing` are unconditionally supported by any daemon built from this
contract — no feature-detection fallback, unlike `studio.snapshot`/`studio.assistant.*` above (see
`CommandOperation`'s doc comment). Everything the Chat tab's Rooms section and a selected room's
transcript/roster/budget panel show is **live**, straight off `room.events`: messages (human/agent/
system), the roster's benched-until state, and the budget meter. "Passed last round" in the roster is
**derived** from the loaded transcript's most recent system line for that persona. A round in progress
is shown at room level only (`room.activeGrantId != nil`) — the wire never says *which* participant
currently holds the floor, so Studio never attributes it to one. The new-room sheet's participant rows
are an honest **not yet sourced** local suggestion, editable before creating: no `room.*` operation
lists the daemon's configured personas (`room-participants-config.ts` is daemon-local configuration,
never on the wire), and `RoomCreateSpecV1` has no "kind" (research/project/lounge) field to source a
picker from either.

## Design rules (non-negotiable)

- Cyan (`HUDTheme.arc`) is the machine's voice. Gold (`HUDTheme.gold`) is only things waiting on the
  human. Components take a `HUDRole`, never a raw colour, so this holds by construction.
- Mono uppercase letter-spaced labels; Avenir Next for headings; SF Pro for body.
- Bracketed panel corners, radial gauges, phase rings, ◆ human gates, dashed cyan = planned,
  dashed alert = "won't guess". Every instrument shows a real value or an honest "—".
