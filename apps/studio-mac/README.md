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
│   ├── Models/                   Codable mirrors of packages/contracts v1 (all 21 operations),
│   │                             Provenance/Sourced, Timeline (ProjectTimeline, DayStamp, fixture loader)
│   ├── Canonical/                JSONValue, CanonicalJSON, PortfolioDigest
│   ├── Dashboard/                DashboardModel (pure derivations), TimelineView (Canvas Gantt),
│   │                             PortfolioReticle, GaugeRowView, AwaitingYouList, PhaseRingsRow +
│   │                             LifecycleTrack, ProjectDetailView, RunDetail
│   ├── Chat/                     ScriptedAssistant (stub) + ChatModel, CornerChatView, ChatScreen
│   ├── Shell/                    StudioStore (@Observable), StudioTitleBar, DashboardScreen,
│   │                             StudioRootView, PhasesScreen
│   └── Resources/timeline-fixture.json   FIXTURE rows for the six apps (see docs 0002)
├── Sources/Studio/StudioApp.swift  the app: locate daemon from env, own the store, one window
├── Tests/StudioKitTests/         unit, fake-daemon, snapshot, and live-daemon (skippable) tests
├── scripts/record-fixtures.mjs   regenerates Tests/…/Fixtures through the real zod schemas
└── docs/architecture/            0001 foundations · 0002 dashboard provenance + fixture timeline
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

## What is live, fixture, or stub (phase 1)

Every value on screen carries a provenance badge — LIVE · DERIVED · FIXTURE · STATIC · NOT YET SOURCED.

* **Live** (daemon): title-bar beacon (doctor), projects gauge, awaiting-you count, reticle when the
  daemon reports lifecycle stages, awaiting-you blocked attempts, attempt marks on timeline rows,
  live-only project rows, project detail readouts, latest-run checks (attempt.events + evidence.verify),
  assistant answers about attempts / blocked / projects / daemon.
* **Derived** (computed from live): verified · 7d.
* **Fixture** (`timeline-fixture.json`, TODO milestones schema): the six timeline rows and their
  lifecycle tracks, ◆ gates in awaiting-you, phase rings, reticle fallback.
* **Static / stub**: budget 38%, the Phases tab, the scripted assistant's fallbacks.
* **Not yet sourced**: min / release, agent window.

## Design rules (non-negotiable)

* Cyan (`HUDTheme.arc`) is the machine's voice. Gold (`HUDTheme.gold`) is only things waiting on the
  human. Components take a `HUDRole`, never a raw colour, so this holds by construction.
* Mono uppercase letter-spaced labels; Avenir Next for headings; SF Pro for body.
* Bracketed panel corners, radial gauges, phase rings, ◆ human gates, dashed cyan = planned,
  dashed alert = "won't guess". Every instrument shows a real value or an honest "—".
