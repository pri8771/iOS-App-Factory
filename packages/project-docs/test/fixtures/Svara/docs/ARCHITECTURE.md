# Architecture

## Current architecture

Svara is a local-first iOS 17+ SwiftUI app. `AppEnvironment` is the composition
root and owns observable session state plus protocol-backed content, progress,
notification, and local-profile services. `StoreService` encapsulates StoreKit
2. Feature views use small view models or send intent to the environment.

```text
SwiftUI view
→ feature view model / AppEnvironment operation
→ service or repository protocol
→ bundled content, UserDefaults, Documents, StoreKit, AVFoundation,
  or UserNotifications
```

## Data and persistence

- Authored content: bundled JSON under `Svara/Resources/SeedData`, with an
  in-code parity fallback.
- Profile, progress, settings: Codable values in `UserDefaults`.
- Points and achievements: `LocalProgressService` awards idempotent points,
  repeatedly evaluates the finite achievement catalogue so bonus thresholds
  unlock immediately, and persists unlocked badge IDs locally. Points never
  participate in access control; `FeatureFlags.current.plusTierEnabled` remains
  the separate, disabled commerce boundary.
- Private reflections: `Documents/reflections.json`; not synced or collected.
- Current access: every bundled content item is free while
  `FeatureFlags.current.plusTierEnabled` is false.
- Dormant premium access: if deliberately re-enabled, only verified
  `Transaction.currentEntitlements`; legacy profile entitlement flags are
  cleared during bootstrap.
- Audio: bundled AAC-in-M4A recordings played by `AVAudioPlayer`. Daily mantra
  practices start their recording when the timed practice begins; the active
  practice exposes play/pause. Missing or undecodable recordings surface an
  explicit user-safe error instead of reporting a false playing state.
- Data-removal semantics: there is no sign-in or server account. Uninstalling
  the app removes its sandbox; reflection storage supports explicit local
  clearing. Any future in-app “erase all local data” control requires a
  separate contract and tests.

## Production boundaries

- No backend, analytics, advertising, tracking, remote configuration, or
  third-party SDK dependency ships in 1.0.
- Preview content is development-only.
- `Svara.storekit` is referenced by the shared Run scheme but excluded from app
  target membership and the archived product.
- A commented content-repository seam documents possible future cloud work; no
  backend SDK is linked, configured, or called.

## Known architectural risks

- StoreKit is coupled to Apple test environments for end-to-end verification.
- UserDefaults is appropriate for the current small local model but will need a
  migration plan before schema growth or cloud sync.
- Cultural content and audio provenance require human evidence beyond automated
  validation (`TF-007`).
