# aarti-path — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Design Handoff

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Ios Architecture Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Tech Specs

This round is forced to close, and there was never a real multi-agent exchange to draw from — every simulated participant hit the spend cap since round 1 of every phase. Rather than fabricate a consensus that didn't happen, I'm making the call directly using the context already established (digital-temple iOS app for Hindus and Jains, Headspace-meets-Duolingo feel, local-first SwiftUI MVP with a later cloud-sync path). This is a reasonable, buildable spec grounded in that brief and in the iOS pitfalls reference already loaded — not a group decision, but a concrete one the build phase can actually use.

**The call:** SwiftUI + Swift 5.9+ (iOS 17+), MVVM with `@Observable` view models, SwiftData for all mutable user state (sessions, streaks, profile, journal), static bundled JSON for the practice/learning-path content catalog (no server needed for content, ships in the app, loads once at first launch). StoreKit 2 for subscription (extra learning paths, full audio library, journaling). AVFoundation for aarti/mantra audio, `UNUserNotificationCenter` for local daily-practice reminders — no network dependency anywhere in the MVP, so "local-first" is really "local-only" for v1 with the schema shaped so an optional CloudKit mirror can be bolted onto the same SwiftData models later without a rewrite.

Module layout: `App/` (entry, DI container), `Models/` (SwiftData `@Model` classes + enums), `Content/` (bundled JSON catalog + loader), `Services/` (StreakService, ProgressService, AudioPlaybackService, NotificationScheduler, SubscriptionManager), `ViewModels/`, `Views/` (Home, PracticeSession, LearningPath, Lesson, Streak, Profile, Onboarding, Paywall), `Tests/`.

Testing strategy: XCTest unit tests on `StreakService` (increment/reset/freeze logic), `ProgressService` (lesson-unlock rules), and content-catalog decoding; view models are plain `@Observable` classes injected with protocol-typed services so they're testable without SwiftData in the loop.

CONSENSUS: YES

## Final Output

**Architecture:** SwiftUI (iOS 17+, Swift 5.9+), MVVM, `@Observable` view models on `@MainActor`. SwiftData is the persistence layer for all mutable state; static learning/practice content ships as bundled JSON decoded once into SwiftData on first launch. No third-party dependencies. StoreKit 2 handles the subscription. AVFoundation plays aarti/mantra audio. `UNUserNotificationCenter` schedules the daily reminder, entirely local. The app is local-only for MVP but every model is CloudKit-container-compatible so a `NSPersistentCloudKitContainer`-backed sync can be added later without changing the schema.

**Module layout:**
- `App/` — `AartiPathApp.swift`, `AppContainer` (service/DI wiring)
- `Models/` — SwiftData `@Model` classes: `PracticeSessionRecord`, `UserProfile`, `StreakRecord`, `JournalEntry`; plain structs for bundled content: `Practice`, `LearningPath`, `LearningModule`, `Lesson`, `Deity`, `Tradition`
- `Content/` — `ContentCatalog` (decodes bundled JSON), `ContentCatalogLoading` protocol
- `Services/` — `StreakService`, `ProgressService`, `AudioPlaybackService`, `NotificationScheduler`, `SubscriptionManager`
- `ViewModels/` — `HomeViewModel`, `PracticeSessionViewModel`, `LearningPathViewModel`, `ProfileViewModel`
- `Views/` — `HomeView`, `PracticeSessionView`, `LearningPathView`, `LessonView`, `StreakView`, `ProfileView`, `OnboardingView`, `PaywallView`
- `Tests/` — unit tests for services + catalog decoding

**Data model:** `Tradition` (hindu/jain/universal) tags every `Practice` and `LearningPath`. `Practice` (aarti/meditation/mantra/journaling type, duration, audio asset, text) is static content; `PracticeSessionRecord` is the user's log of completions (SwiftData). `LearningPath` → `LearningModule` → `Lesson` is static content; unlock/completion state lives on `ProgressService`-managed SwiftData join records, not on the static structs. `StreakRecord` tracks current/longest streak, last-practice date, and streak-freeze count. `UserProfile` holds selected tradition, daily goal, reminder time, and subscription status.

**Persistence:** SwiftData `ModelContainer` for everything mutable; bundled JSON (versioned) for content, loaded into SwiftData tables keyed by stable content IDs so updates to the JSON in a future app version can upsert without wiping user progress.

**Testing:** XCTest on `StreakService` (increment/reset/freeze edge cases: same-day double practice, missed day, freeze consumption), `ProgressService` (lesson unlock ordering), and `ContentCatalog` decoding (malformed/missing JSON fields). View models take protocol-typed services so they're unit-testable without a live SwiftData store.

```interfaces-json
{"interfaces": [
  {"name": "Tradition", "kind": "enum", "language": "swift", "signature": "enum Tradition: String, Codable, CaseIterable { case hindu, jain, universal }", "owning_lane": "data_domain", "notes": "Tags Practice and LearningPath content"},
  {"name": "PracticeType", "kind": "enum", "language": "swift", "signature": "enum PracticeType: String, Codable { case aarti, meditation, mantra, journaling }", "owning_lane": "data_domain", "notes": ""},
  {"name": "Practice", "kind": "struct", "language": "swift", "signature": "struct Practice: Identifiable, Codable { let id: String; let title: String; let tradition: Tradition; let type: PracticeType; let durationSeconds: Int; let audioAssetName: String?; let textContent: String? }", "owning_lane": "data_domain", "notes": "Bundled static content, decoded from JSON catalog"},
  {"name": "LearningPath", "kind": "struct", "language": "swift", "signature": "struct LearningPath: Identifiable, Codable { let id: String; let title: String; let tradition: Tradition; let modules: [LearningModule] }", "owning_lane": "data_domain", "notes": "Bundled static content"},
  {"name": "LearningModule", "kind": "struct", "language": "swift", "signature": "struct LearningModule: Identifiable, Codable { let id: String; let title: String; let order: Int; let lessons: [Lesson] }", "owning_lane": "data_domain", "notes": ""},
  {"name": "Lesson", "kind": "struct", "language": "swift", "signature": "struct Lesson: Identifiable, Codable { let id: String; let title: String; let content: String; let linkedPracticeID: String? }", "owning_lane": "data_domain", "notes": ""},
  {"name": "PracticeSessionRecord", "kind": "struct", "language": "swift", "signature": "@Model final class PracticeSessionRecord { var id: UUID; var practiceID: String; var date: Date; var durationCompleted: Int; var completed: Bool }", "owning_lane": "data_domain", "notes": "SwiftData model, mutable user log"},
  {"name": "StreakRecord", "kind": "struct", "language": "swift", "signature": "@Model final class StreakRecord { var currentStreak: Int; var longestStreak: Int; var lastPracticeDate: Date?; var freezesAvailable: Int }", "owning_lane": "data_domain", "notes": "SwiftData, singleton row per user"},
  {"name": "UserProfile", "kind": "struct", "language": "swift", "signature": "@Model final class UserProfile { var selectedTradition: Tradition; var dailyGoalMinutes: Int; var reminderTime: Date?; var subscriptionActive: Bool }", "owning_lane": "data_domain", "notes": "SwiftData, singleton row per user"},
  {"name": "JournalEntry", "kind": "struct", "language": "swift", "signature": "@Model final class JournalEntry { var id: UUID; var date: Date; var text: String; var moodTag: String? }", "owning_lane": "data_domain", "notes": "SwiftData"},
  {"name": "LessonProgressRecord", "kind": "struct", "language": "swift", "signature": "@Model final class LessonProgressRecord { var lessonID: String; var unlocked: Bool; var completed: Bool; var completedDate: Date? }", "owning_lane": "data_domain", "notes": "SwiftData join table between static Lesson content and user progress"},
  {"name": "ContentCatalogLoading", "kind": "protocol", "language": "swift", "signature": "protocol ContentCatalogLoading { func loadPractices() throws -> [Practice]; func loadLearningPaths() throws -> [LearningPath] }", "owning_lane": "data_domain", "notes": "Decodes bundled JSON; throws on malformed content for error-state UI"},
  {"name": "StreakServicing", "kind": "protocol", "language": "swift", "signature": "protocol StreakServicing { func recordPractice(on date: Date) async; func currentStreak() -> Int; func useFreeze() -> Bool }", "owning_lane": "services_utilities", "notes": "Backs StreakRecord; freeze/reset edge cases are the core unit-test target"},
  {"name": "ProgressServicing", "kind": "protocol", "language": "swift", "signature": "protocol ProgressServicing { func isUnlocked(lessonID: String) -> Bool; func completeLesson(lessonID: String) async }", "owning_lane": "services_utilities", "notes": "Enforces sequential lesson unlock ordering"},
  {"name": "AudioPlaybackServicing", "kind": "protocol", "language": "swift", "signature": "protocol AudioPlaybackServicing { func play(assetName: String) async throws; func stop() }", "owning_lane": "services_utilities", "notes": "Wraps AVAudioPlayer, off-main prep"},
  {"name": "NotificationScheduling", "kind": "protocol", "language": "swift", "signature": "protocol NotificationScheduling { func scheduleDailyReminder(at time: Date) async throws; func cancelReminder() }", "owning_lane": "services_utilities", "notes": "UNUserNotificationCenter, local only"},
  {"name": "SubscriptionManaging", "kind": "protocol", "language": "swift", "signature": "protocol SubscriptionManaging { var isSubscribed: Bool { get }; func purchase(productID: String) async throws; func restorePurchases() async }", "owning_lane": "services_utilities", "notes": "StoreKit 2, product ids aartipath.premium.monthly / .annual"},
  {"name": "HomeViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class HomeViewModel { var todaysPractice: Practice?; var streak: Int; var loadState: LoadState<Void> }", "owning_lane": "primary_ui", "notes": ""},
  {"name": "PracticeSessionViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class PracticeSessionViewModel { var practice: Practice; var isPlaying: Bool; func start() async; func complete() async }", "owning_lane": "primary_ui", "notes": ""},
  {"name": "LearningPathViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class LearningPathViewModel { var path: LearningPath; var lessonProgress: [String: LessonProgressRecord] }", "owning_lane": "primary_ui", "notes": ""},
  {"name": "ProfileViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class ProfileViewModel { var profile: UserProfile; func updateReminder(_ time: Date) async }", "owning_lane": "primary_ui", "notes": ""},
  {"name": "LoadState", "kind": "enum", "language": "swift", "signature": "enum LoadState<T> { case idle, loading, loaded(T), failed(Error) }", "owning_lane": "polish_resilience", "notes": "Generic state used by every screen for empty/loading/success/error"},
  {"name": "AppError", "kind": "enum", "language": "swift", "signature": "enum AppError: Error, LocalizedError { case contentLoadFailed, audioUnavailable, notificationDenied, purchaseFailed }", "owning_lane": "polish_resilience", "notes": "Shared error type surfaced in error-state views"}
]}
```

**Quality gate warning:** The evaluator still found gaps, but the phase could not run another repair round under the current settings.

QUALITY: FAIL

## Feedback

The architecture, persistence, and testing sections are solid and consistent with the local-first SwiftUI mandate (SwiftData for mutable state, bundled JSON content, StoreKit 2, no third-party deps, CloudKit-ready schema). However, the `interfaces-json` contract has gaps that will cause parallel build lanes to invent incompatible types — the acceptance check this phase must satisfy:

1. **Missing view models for two named screens.** The module layout lists `OnboardingView` and `PaywallView` under `Views/`, but there is no `OnboardingViewModel` or `PaywallViewModel` in the interfaces list. Paywall is the monetization surface (StoreKit purchase/restore flow) — a build lane implementing it has nothing to code against and will fabricate its own shape, likely diverging from `SubscriptionManaging`. Add both, e.g.:
   - `PaywallViewModel { var products: [Product]; var isPurchasing: Bool; func purchase(_ id: String) async; func restore() async }`
   - `OnboardingViewModel { var selectedTradition: Tradition?; func completeOnboarding() async }`

2. **`Deity` is named in the `Models/` module layout but never defined in interfaces-json.** Either give it a real struct entry (if it's real content, e.g. `Deity { id, name, tradition, description, iconAssetName }`) or drop it from the module layout text if it's not actually needed for MVP — don't leave a dangling reference a build lane has to guess at.

3. **`kind` field is wrong for all SwiftData model entries.** `PracticeSessionRecord`, `StreakRecord`, `UserProfile`, `JournalEntry`, `LessonProgressRecord` all have `@Model final class ...` signatures but are tagged `"kind": "struct"`. Fix to `"kind": "class"` so codegen/build workers don't emit conflicting declarations.

4. **No concrete `ContentCatalog` type**, only the `ContentCatalogLoading` protocol — fine if intentional (protocol is the shared contract), but confirm in prose that the concrete implementation is a lane-owned detail, not something other lanes need to reference by name.

Once these are patched (2 new interfaces, 1 dropped/added struct, 5 kind-field fixes), this phase is ready to close — everything else (data model shape, persistence strategy, testing strategy, module layout) is concrete and buildable.

## Project Plan

Only one real contribution came in this round — Codex and Gemini are still structurally unavailable (same CLI/rate-limit issues as every prior phase), so this is effectively a single voice laying out a full plan rather than a group converging. But the plan itself is complete and addresses everything the phase playbook requires (milestones, dependencies, risks, verification), so there's nothing contradictory to resolve — just gaps that need a decision to be locked in rather than left open for a lane to guess at later. I'll close this round by making those calls directly, the same way the tech_specs phase got force-closed with a direct coordinator decision.

CONSENSUS: YES

## Final Output

**Milestone 0 — Freeze the contract (half-day, blocking, before any lane starts).** The tech_specs quality gate failed and got force-closed by round limits, not by agreement — so this has to be fixed before task assignment hands out lane work, or the primary_ui lane will invent its own PaywallViewModel shape that doesn't match SubscriptionManaging. Fix, in order:
- Add `PaywallViewModel { products: [Product]; isPurchasing: Bool; func purchase(_ id: String) async; func restore() async }`
- Add `OnboardingViewModel { selectedTradition: Tradition?; func completeOnboarding() async }`
- Resolve `Deity`: define it (`id, name, tradition, description, iconAssetName`) if it's real MVP content, otherwise drop it from the module layout text — no dangling reference.
- Fix `"kind": "struct"` → `"kind": "class"` on the five `@Model` entries (PracticeSessionRecord, StreakRecord, UserProfile, JournalEntry, LessonProgressRecord).
- Note in the frozen doc that `ContentCatalog` (concrete) is lane-owned; only `ContentCatalogLoading` is the shared contract.

**Milestone 1 — Data domain lane, solo.** SwiftData `ModelContainer`, the corrected `@Model` classes, bundled content JSON, and the `ContentCatalog` loader. Nothing downstream can be honestly built or tested until this exists — there's no backend to stub against, so this is a true serial dependency, not a preference.

**Milestone 2 — Services lane.** StreakService, ProgressService, AudioPlaybackService, NotificationScheduler, SubscriptionManager, built against the frozen protocols and unit-tested in isolation before any view model touches them.

**Milestone 3 — ViewModels + Views (8 screens).** Starts once services are real, not stubbed.

**Milestone 3b — Paywall, as its own checkbox, not folded into "views."** Needs a StoreKit Configuration file wired into the scheme and a sandbox tester account provisioned *before* purchase/restore work starts. Restore-after-reinstall is the path everyone skips — it's explicitly in scope for testing.

**Parallel workstream — Content authoring.** Real aarti/mantra audio and lesson text is a content/licensing task, not an engineering one. Hard gate before integration: no session-audio screen ships pointing at silence or a placeholder beep.

**Decisions locked now (no second voice available to litigate these, so calling them directly rather than leaving them ambiguous for a lane to guess at):**
- **Streak day boundary:** local calendar day on the device's current timezone (matches how Duolingo-style streaks are commonly understood). Cross-timezone travel edge cases are an accepted MVP limitation, not a blocker.
- **Clock tampering:** no on-device tamper detection for MVP (not reliably feasible without a server). `recordPractice` uses device "now" as truth, and is idempotent for same local day — it doesn't punish or refuse based on clock changes.
- **Tradition switching:** `LessonProgressRecord` is keyed by `lessonID`, not by tradition, so progress is never wiped by switching. `UserProfile.selectedTradition` only changes what's recommended on Home — switching back and forth doesn't lose lesson progress in either path.

**Verification plan (release gate, not implicit):** fresh install → onboarding with tradition selection → complete first practice → streak increments → open a learning path → complete a lesson → next lesson unlocks → hit paywall → sandbox purchase → entitlement flips → force-quit/relaunch → confirm everything persisted → second fresh install, deny notification permission → reminder feature shows a visible error state instead of silently no-oping. Plus one dedicated test for the catalog version-bump upsert path (seed v1 content, record progress, reseed v2 content, assert progress survives) — this is the mechanism that's supposed to let future content updates ship without wiping user progress, and it needs an actual test, not just a design note.

## Implementation Readiness Gate

CONSENSUS: YES

Round 2 was really just one more precision pass on an already-good close, not new disagreement. The gate's design lock and flame identity were solid in prose, but they were sitting in this document's narrative and in the interfaces-json *notes* field rather than in the actual `acceptance_criteria` arrays that task_assignments told every lane to build against — which is the exact same "decided in prose, never made it into the artifact" failure the gate itself caught one level up in tech_specs. That's a fair catch, and it's a two-line fix, not new scope. The additional idea — carrying the flame motif into the App Store icon/launch screen so the promise made by the icon matches what the app actually opens into — is a good, cheap addition to the same T-018 polish pass, not a new task or lane. Nobody's pushing back on any of it, so this closes now with those criteria folded in directly.

## Final Output

This phase is done. Readiness verdict, cross-phase consistency check, blockers/fixes, final scope, and the corrected canonical `interfaces-json` from round 1 all stand as decided — the only change is that the design lock and flame identity are now written into the actual task acceptance criteria, not just gate prose, so a build lane can't miss them by working strictly off task_assignments.

**Amend task_assignments as follows (two-line-per-task patch, no new tasks, no new scope):**

- **T-012 (HomeViewModel + HomeView)** — add acceptance criterion: *"HomeView's primary interaction is tapping the flame/diya motif to begin today's practice, sized/brightened according to current streak — not a plain button or a numeric streak counter."*
- **T-015 (ProfileViewModel + ProfileView + StreakView)** — add acceptance criterion: *"StreakView visualizes streak health as flame brightness/size (the locked motif), not a numeric counter or generic progress bar."*
- **T-018 (Accessibility/polish pass)** — add acceptance criterion: *"App icon and launch screen use the same flame/light motif as Home/Streak — not a generic or unrelated logo."*

Everything else from the round 1 decision holds without change: the corrected `interfaces-json` (Deity dropped, all five SwiftData models tagged `kind: class`, `OnboardingViewModel`/`PaywallViewModel` added) is the one canonical contract every lane builds against, superseding the stale tech_specs artifact. The minimal design lock (warm neutral palette with a single amber/saffron flame accent, system font with one serif-leaning display weight for titles, 16pt spacing rhythm, 16pt rounded-rect cards, dark-leaning ceremony mode for practice/paywall screens) stands as scoped, additive work inside existing UI tasks — not a new lane. Lane ownership, forbidden edit zones, dependency sequencing, and the T-019 end-to-end release-gate smoke test are all unchanged and already sound.

**Readiness verdict: GO.** Build can start now. The three real blockers this gate existed to catch — a stale/broken frozen contract, a missing visual identity for a "must feel premium" app, and no stated differentiation from Aarti Path's own sibling digital-temple app — are all closed with concrete, checkable decisions rather than deferred to another round or discovered mid-build.
