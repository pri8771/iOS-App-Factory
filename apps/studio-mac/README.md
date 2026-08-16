# Studio (macOS)

The native macOS front end for the App Factory daemon. SwiftPM package, macOS 14+, Swift 6 language
mode.

```
apps/studio-mac/
├── Package.swift                 StudioKit (library) · Studio (app) · StudioKitTests
├── Sources/StudioKit
│   ├── DesignSystem/             HUDTheme, HUDTypography, HUDPanel, RadialGauge, PhaseRing,
│   │                             DiamondGate, StatusPill, HUDButton, HUDGallery (previews)
│   ├── Client/                   DaemonClient (actor, Network.framework), AuthorizationToken,
│   │                             ExchangeSession, DaemonClientError, DaemonLocator
│   ├── Models/                   Codable mirrors of packages/contracts v1 (all 21 operations)
│   └── Canonical/                JSONValue, CanonicalJSON, PortfolioDigest
├── Sources/Studio/StudioApp.swift  the phase-1 shell: daemon panel + attempts + gallery
├── Tests/StudioKitTests/         unit, fake-daemon, snapshot, and live-daemon (skippable) tests
├── scripts/record-fixtures.mjs   regenerates Tests/…/Fixtures through the real zod schemas
└── docs/architecture/0001-studio-foundations.md
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

## Design rules (non-negotiable)

* Cyan (`HUDTheme.arc`) is the machine's voice. Gold (`HUDTheme.gold`) is only things waiting on the
  human. Components take a `HUDRole`, never a raw colour, so this holds by construction.
* Mono uppercase letter-spaced labels; Avenir Next for headings; SF Pro for body.
* Bracketed panel corners, radial gauges, phase rings, ◆ human gates, dashed cyan = planned,
  dashed alert = "won't guess". Every instrument shows a real value or an honest "—".
