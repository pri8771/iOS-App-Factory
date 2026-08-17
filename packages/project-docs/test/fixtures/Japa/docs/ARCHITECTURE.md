---
id: DOC-ARCHITECTURE
canonicalFor: current-architecture
status: active
lastVerified: 2026-07-30
readWhen:
  - onboarding
  - changing architecture
related:
  - DECISIONS.md
  - TEST_PLAN.md
  - REUSABLE_COMPONENTS.md
supersedes: []
---

# Architecture

**Architecture Version:** 0.1.0  
**Date Recorded:** 2026-07-16  
**Last Cross-Checked Against Source:** 2026-07-17 — verified accurate against all 13 core source files, no deltas found  
**Status:** documented (existing baseline)

## Current architecture

Mala is a local-first SwiftUI iOS app (iOS 17+) generated with XcodeGen from `project.yml`. There is no backend, networking, accounts, analytics, or third-party packages. Internal target, scheme, engine symbols, and persistence-directory identifiers retain the original `Japa` name for compatibility; the release bundle identifier is product-branded.

```text
JapaApp
  └── AppModel (prefs, mantras, history, resumable session factory)
        ├── Persistence (Application Support JSON)
        │     ├── preferences.json
        │     ├── mantras.json
        │     ├── sessions.json
        │     └── active-session.json (ActiveSessionStore)
        ├── PracticeController (one round)
        │     ├── JapaEngine (pure value type — count/completion contract)
        │     ├── HapticPlayer / HapticFeedback
        │     └── CompletionTone (AVFoundation ambient)
        └── Views (Root → Practice surface [is the home screen] / Completion overlay / MantraSelect / History / Settings / MalaStylePicker / Intro)
```

### Modules

| Folder | Responsibility |
|--------|----------------|
| `Engine/` | Pure `JapaEngine` + `AdvanceResult` — frozen count/completion/undo contract |
| `Models/` | `Mantra`, `MalaStyle`, `PracticeSession`, `Preferences`, `ActiveSessionState` |
| `Persistence/` | Codable JSON sandbox store + async active-session flush |
| `Haptics/` | Core Haptics player with UIKit fallback |
| `Audio/` | Single completion tone |
| `Content/` | Neutral built-in Counting option |
| `ViewModels/` | `AppModel`, `PracticeController` |
| `Views/` | SwiftUI screens, including the 21-style Change Mala picker |
| `Design/` | Theme and mala-style renderers |
| `Resources/` | Assets + `PrivacyInfo.xcprivacy` |

### Targets

| Target | Type | Platform | Device family |
|--------|------|----------|---------------|
| Japa | app | iOS 17+ | iPhone (`TARGETED_DEVICE_FAMILY = 1`) |
| JapaTests | unit | iOS 17+ | iPhone |
| JapaUITests | UI | iOS 17+ | iPhone |

Bundle ID: `com.priyansh.mala`

### Persistence & interruption model

- Application Support `/Japa/` JSON files (not UserDefaults / Core Data / SwiftData / iCloud)
- Advance → haptic → async enqueue active-session write; `persistNow()` / `flush()` on resign/background
- The practice surface is the home screen (no Begin step, 2026-07-17): launch auto-resumes the exact persisted bead in place via `JapaEngine(target:count:)`
- Completion clears active snapshot and appends `PracticeSession` to history; completion overlays the surface in place

### Quality boundaries

- Engine logic must remain pure and unit-tested (F1 hard gate)
- Mantra text never affects counting
- No streaks, notifications, or network surfaces in v1

## Potential Improvements — Not Approved

Observations from the 2026-07-17 architecture cross-check. None of these are approved work; do not implement without an explicit decision recorded in `DECISIONS.md`.

- `HapticPlayer.startEngineIfNeeded()` swallows `CHHapticEngine` creation errors silently (`engine = nil`), with no logging — a debug-only log point could help diagnose hardware fallback without needing to reproduce the failure.
- `ActiveSessionStore.save()` enqueues writes on a serial background queue with no coalescing; likely a non-issue at real tap cadence, but the queue has no depth bound.
- `AppModel.resumePracticeController()` and `refreshResumable()` both independently reconstruct a `JapaEngine` via `state.makeEngine()` to check `isComplete` — cheap duplication that could become a single `ActiveSessionState.isResumable` computed property if the pattern grows.
- `Persistence.save()` and `ActiveSessionStore` writes both silently discard encode/write errors via `try?`, with no surfaced failure signal — acceptable for a local-only v1 app, a candidate for at least debug-level diagnostics if data-loss reports ever surface.
- The module tree above doesn't name `PracticeContainerView` or `BeadRingView` (both exist under `Views/`) — not currently inaccurate since the doc claims only folder-level granularity, but worth adding if this document is ever expanded to view-level detail.
