# Architecture

This is the factory-governed current architecture summary. The root
`ARCHITECTURE.md` remains a detailed design reference; this file controls when
the two disagree.

## Current architecture

Anjali is a single-target, offline SwiftUI app for iOS 17+ with unit and UI test
targets. `AppCoordinator` owns tab/player/deep-link navigation.
`PrayerLibrary` loads immutable bundled JSON. `TodayContextEngine` is a pure
ranking function. `PrayerLibrary` also supports Moment, Intention, and Deity
discovery. `PlayerController` owns session state and delegates Listen resource
selection to an exact-ID, approved-catalog resolver; it never substitutes a
related prayer.

```text
Bundled prayers.json ─→ PrayerDataLoader ─→ PrayerLibrary
                                             │
UserDefaults ─→ AppSettings ────────────────┤
SwiftData ─→ completions/favorites ─────────┤
                                             ▼
                                      SwiftUI views
                                             │
                            AppCoordinator / PlayerController
                                             │
                         AVFoundation + local notifications
```

## Persistence

- UserDefaults stores onboarding, preferences, enabled reminder slots, and
  per-slot local hour/minute values.
- SwiftData stores `PrayerCompletion` and unique `FavoritePrayer` records.
- Save/delete errors roll back and are shown to the user.
- If the disk store cannot open, an in-memory container keeps the app usable
  while a persistent banner states that changes will not survive closing.
- No schema migration has shipped yet. Any model change after a TestFlight
  build must add old-store fixture/migration verification.
- The Debug-only `-uiTestReset` hook clears UserDefaults and SwiftData. It is
  excluded from Release compilation.

## Permissions and asynchronous boundaries

Notification permission is requested only after opt-in. Settings update only
after `UNUserNotificationCenter.add` succeeds. Dawn, sunset, and sleep use
stable request identifiers; editing a time replaces the same request and
commits the new value only after success. The UI rolls back to the previous time
on failure. Onboarding does not request notification permission. Me reconciles
stored enabled slots with pending system requests whenever it returns to the
foreground and offers iOS Settings recovery after denial.

## Player and audio boundary

- Normal Debug, device, Release, and TestFlight builds use the approved-catalog
  policy and contain no synthetic or provisional audio.
- Listen is visible only when an exact approved human recording for the
  displayed prayer resolves. A load/play failure leaves the session unstarted
  and cannot create a completion.
- Chant is self-led aloud; Silent is inward reading/repetition. Neither plays
  audio, both show the full selected text and meaning, and both require explicit
  Begin and Complete actions. Their duration is pacing guidance, not an
  automatic completion trigger.

## External dependencies

None. Production uses SwiftUI, SwiftData, AVFoundation, UserNotifications, and
Foundation only. There is no backend, package manager dependency, or network
client.

## Known architectural risks

- SwiftData currently has no shipped-version migration fixtures.
- The app targets iPad but remains phone-shaped rather than iPad-optimized.
- Notification-center delivery and permission state require real-device QA.
- No acceptable human audio currently exists, so Listen is hidden in normal
  builds. `docs/AUDIO_LYRIC_ALIGNMENT_PLAN.md` owns the future approval path
  and prohibits estimated lyric synchronization.
- The complete current compact-iPhone/iPad UI, physical-device, reminder
  delivery, and manual accessibility matrices remain pending.
- Consumer TestFlight remains gated by `docs/DAILY_USE_PRODUCT_PLAN.md` in
  addition to the distribution backlog.

Consumer architecture tasks and evidence requirements are linked from the
[Daily-Use Consumer Product Plan](DAILY_USE_PRODUCT_PLAN.md).
