---
id: DOC-LAUNCH-READINESS
canonicalFor: launch-scope-and-prd
status: active
lastVerified: 2026-08-06
readWhen:
  - understanding v1 product scope, MVP features, or acceptance criteria
related:
  - docs/STATUS.md
  - docs/TEST_PLAN.md
  - docs/RELEASE_CHECKLIST.md
  - docs/DEPLOYMENT.md
supersedes: []
---

# Mala — Launch Readiness (v1)

> **Canonical scope:** this document owns v1 product scope, MVP features, user flows, and acceptance criteria. Current status, test counts, and live release-gate state are owned by [`docs/STATUS.md`](docs/STATUS.md), [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md), and [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) — this document links to them rather than restating them.

> Mala is a local-first iOS app for *japa* — the repetition of a mantra a fixed number of times (classically 108, one full *mala*). It is for anyone with a daily repetition practice — Hindu, Buddhist, Sikh, or secular-meditative — who wants a quiet, eyes-free way to keep count without a physical bead string and without the practice becoming a noisy, gamified phone app. The core loop is a single tactile practice screen: the practitioner advances one bead at a time (tap anywhere / thumb-swipe) without looking, each advance is confirmed by a crisp haptic, and reaching the target (the 108th bead, or a chosen target) fires a **distinct completion haptic plus a gentle tone** so the round's end is unmistakable without looking at or listening hard to the device. Sessions complete and are saved to a quiet local history.
>
> **Implementation maturity: v1 in TestFlight beta.** Build 2, containing explicit Finish early and the current fixes, was uploaded manually through Xcode Organizer, processed to `Ready to Submit`, and confirmed working through TestFlight on 2026-08-06. The repository contains a building, tested SwiftUI app generated from `project.yml` via XcodeGen. Present: a pure `JapaEngine` with the frozen contract and a passing unit-test suite; the eyes-free, whole-screen-advance practice surface; explicit Finish early with honest partial-session recording; a distinct completion haptic (CoreHaptics, with `UIFeedbackGenerator` fallback) plus a synthesized gentle tone that respects the silent switch; interruption-safe local persistence; neutral counting plus user-created private labels; a quiet, non-gamified history; settings; Dynamic Type support; CI and optional TestFlight deployment automation; a 21-style Change Mala visual picker with Classic as the default; an app icon; and a truthful `PrivacyInfo.xcprivacy` with a verified no-network/no-analytics posture. Builds in Debug and Release simulator and has been validated on a physical device. **Current test counts, verification dates, and production-readiness are owned by [`docs/STATUS.md`](docs/STATUS.md) and [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md); this document does not restate them.** What remains before public launch: final assets/metadata, questionnaires, and App Review (§9 is the scope-level view; [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) tracks live gate status). The original product definition was developed under the working name Japa; factory registration is recorded in `docs/DECISIONS.md` DEC-004.

---

## 1. PRD / Launch Scope

### Problem & insight
A physical mala already counts beads better than any screen — so a digital mala that merely "counts to 108" is strictly worse than a string of beads and pointless to ship. The only thing software adds that a bead string cannot: **eyes-free, interruption-safe, haptic-confirmed repetition with an unmistakable end-of-round signal.** You advance without looking; the device confirms each bead through a haptic; it keeps your place if you are interrupted (a call, putting the phone down mid-round); and it marks the completion of the round (the 108th bead) with a *distinct* haptic + gentle tone so you never have to count, glance, or break concentration. If the build cannot deliver that eyes-free, look-down-free feel, it is a skinned counter and **should not ship standalone** (the explicit gating insight from the product thread). The build is centered on exactly this.

### Target user
- **Primary:** Someone with an existing daily japa/mantra-repetition practice who currently uses a physical mala or a tally and wants a calmer, pocketable, eyes-free aid — not a habit-tracker, not a social app.
- **Secondary:** A newer meditator who wants a simple, low-pressure way to do a fixed number of repetitions (e.g. 108) without manual counting, and without being pushed by streaks or notifications.

### Value proposition (one sentence)
A quiet digital mala you can use with your eyes closed: advance one bead at a time, feel each repetition confirmed, and know the moment your round is complete — without ever looking at the screen.

### Positioning / category & one-sentence pitch
- **Category:** Spiritual / meditation utility (a focused single-purpose practice tool, *not* a meditation-content platform or habit tracker).
- **Pitch:** "Mala is a digital mala for daily repetition practice — eyes-free, interruption-safe, and respectfully quiet, with a distinct haptic at the final bead so you always know your round is done."

### Platform & tech baseline (as built)
- **Platform:** iOS, native. **Target iOS 17+** (locked). iPhone, portrait. Generated from `project.yml` via XcodeGen.
- **Frameworks (implemented):**
  - `SwiftUI` — UI, `@Observable` app/practice models.
  - `CoreHaptics` — crisp per-bead transient and a *distinct* completion pattern (rising swell + firm transient), with `UIFeedbackGenerator` as a graceful fallback where the Taptic Engine / Core Haptics is unavailable.
  - `AVFoundation` (minimal) — a single gentle completion tone synthesized in memory (no bundled asset) on the `.ambient` session so it respects the silent switch.
  - Local persistence via a small `Codable`-to-disk store (preferences, custom mantras, history, and the in-progress round).
- **No backend, no network, no accounts.** Local-first by construction (audited; see F7).

### Business model (only what the repo supports/plans)
- **Free core practice.** The repetition loop, neutral counting mode, user free-text labels, and history are free.
- Future, *not in v1 scope*: optional audio/content packs, a one-time "supporter" unlock, or bundling into a larger spiritual product. v1 ships with **no IAP, no StoreKit configuration** (verified — no `.storekit`, no StoreKit import).

### North-star / success signals (local-only / beta-observable; privacy-respecting)
Because the app is local-first with no analytics backend, success is observed through TestFlight feedback and (at most) privacy-preserving on-device counts, never personal practice content:
- **Primary:** a beta user can complete a full round (e.g. 108) **eyes-free** — phone face-down or screen off — and correctly feel the completion signal. (Qualitative: "I didn't have to look.")
- **Interruption safety:** a session interrupted mid-round (call/backgrounding) resumes at the exact bead with no loss.
- **Return practice:** users come back to do another session the next day *without* being nudged by streaks or notifications.
- Explicitly **not** a north-star: streak length, daily-active pressure, or notification opt-in rate (tone failures for devotional practice — see §3).

---

## 2. MVP Feature List (with acceptance criteria)

Status legend: **Built** = implemented and working in repo · **Partial** = some logic present · **Not built** = specified, no code. **All v1 features are Built**; the only items not fully closed are the human/device validations called out per feature (live status: [`docs/STATUS.md`](docs/STATUS.md)).

### F1. Repetition engine (count + place-keeping + round completion) — **Built (unit-tested)**
The pure, UI-independent core in [`Japa/Engine/JapaEngine.swift`](Japa/Engine/JapaEngine.swift): current bead, configured target, exactly-once completion, place-keeping across interruption (via persisted state reconstruction). Built and unit-tested **first**.
- ✅ **Given** target N (default 108) and a fresh session, **when** `advance()` is called k times (k < N), **then** count = k and completion has not fired.
- ✅ **Given** count = N−1, **when** `advance()` is called once more, **then** count = N, a round-completion result fires exactly once, and the engine stops (explicit new round required).
- ✅ **Given** an in-progress session, **when** the app is backgrounded/terminated and relaunched, **then** the engine restores the exact bead and target (no off-by-one, no reset).
- ✅ **Given** any target 1 ≤ N ≤ 1080, **when** the session runs, **then** completion fires only at N; invalid targets (≤0, >max) are rejected/clamped.
- ✅ **Given** a user undo/back-tap, **then** count decrements by 1 without going below 0 and without firing completion.
- ✅ **Verified by:** `JapaEngineTests` (23 tests) — advance, completion-once-at-N, advance-past-target `.alreadyComplete`, target-config incl. boundary/invalid, undo/decrement floor, reset/new-round, reconstruction from persisted count. **Hard gate — green.**

### F2. Eyes-free tactile practice screen — **Built (device-validated on iPhone 16 Pro Max)**
[`Japa/Views/PracticeView.swift`](Japa/Views/PracticeView.swift): a whole-screen advance layer; only the close/undo controls capture touches. Each advance fires a crisp haptic; the target fires the distinct completion haptic + tone.
- ✅ **Given** the practice screen, **when** the user taps anywhere (or the VoiceOver advance action), **then** the bead advances and a per-bead haptic fires (in-memory state + haptic first, then async persist).
- ✅ **Given** eyes-closed use, **then** no visual confirmation is required — the haptic is the confirmation; whole-screen hit area needs no aiming.
- ✅ **Given** silent mode, **then** per-bead haptics still fire (independent of the mute switch); the completion tone respects the silent switch + setting.
- ✅ **Given** an accidental tap, **then** a one-step undo (swipe-down or the Undo control) maps to F1 decrement.
- ✅ **Manual device validation:** per-bead haptic crispness and the eyes-free practice flow were confirmed on iPhone 16 Pro Max on 2026-07-18. Broader device-class coverage is optional post-v1.

### F3. Distinct end-of-round completion signal — **Built (device-validated on iPhone 16 Pro Max)**
[`Japa/Haptics/HapticPlayer.swift`](Japa/Haptics/HapticPlayer.swift): per-bead tick is a single sharp transient; completion is a short rising swell capped by a firm transient — a deliberately different Core Haptics pattern — plus one synthesized gentle tone.
- ✅ **Given** the per-bead haptic, **then** the completion pattern uses a different Core Haptics shape (continuous swell + transient vs. a single transient).
- ✅ **Given** target reached, **then** completion fires exactly once (engine returns `.completed` once; `complete()` runs once), with one tone.
- ✅ **Given** no Core Haptics, **then** a graceful fallback (`UINotificationFeedbackGenerator(.success)`) fires and the tone still plays.
- ✅ **Given** the tone is muted in settings, **then** only the completion haptic fires.
- ✅ **Manual device validation:** per-bead and completion signals were distinguishable eyes-free on iPhone 16 Pro Max on 2026-07-18, including the fallback path.

### F4. Mantra selection: neutral counting mode **plus** user free-text — **Built**
[`Japa/Content/SeedMantras.swift`](Japa/Content/SeedMantras.swift) + [`MantraSelectView`](Japa/Views/MantraSelectView.swift). Mala v1 ships only a neutral counting default; bundled spiritual seed content was removed on 2026-07-26.
- ✅ **Given** the seed set, **then** a small list of mantras (title, script, neutral note) is shown.
- ✅ **Given** a custom mantra, **then** the user types free text (title + optional script), it's usable for a session and persisted locally for reuse; deletable.
- ✅ **Given** any mantra, **then** counting logic is identical (mantra text never affects the engine).
- ✅ **Given** no desire for a label, **then** a neutral "Counting" entry lets practice proceed.
- ✅ **Content scope verified:** v1 includes only neutral Counting plus private custom labels; the former seed-content review is retained as historical context.

### F5. Session completion + simple history — **Built**
[`PracticeSession`](Japa/Models/PracticeSession.swift) + [`HistoryView`](Japa/Views/HistoryView.swift).
- ✅ **Given** a completed round, **then** a record is saved with mantra title, target, completed count, start time, duration, and reached-target flag.
- ✅ **Given** saved sessions, **then** they list reverse-chronologically in a calm presentation — **no streak counter, no chain framing** (structurally asserted in tests).
- ✅ **Given** an abandoned session, **then** it is recorded honestly as `partial` (or discarded if zero count).
- ✅ **Given** privacy needs, **then** the user deletes a single entry or clears all.
- ✅ **Verified by:** persistence round-trips + flow tests; structural no-streak assertion.

### F6. Practice preferences — **Built**
[`Preferences`](Japa/Models/Preferences.swift) + [`SettingsView`](Japa/Views/SettingsView.swift).
- ✅ **Given** settings, **then** the user sets a target (27/54/108/216/1080) that persists and is used by subsequent sessions.
- ✅ **Given** settings, **then** the user can open **Mala Style**, preview all 21 visual worlds, and apply one without changing the underlying count behavior.
- ✅ **Given** settings, **then** toggling the completion tone off suppresses F3's tone while the completion haptic remains.
- ✅ **Given** a haptic-strength slider, **then** the per-bead intensity respects it (honored where hardware supports variable intensity; ignored gracefully elsewhere).
- ✅ **Given** any preference change, **then** it persists locally and applies without a restart.
- ✅ **Verified by:** preference round-trip tests + UI navigation test.

### F7. Local-first persistence & privacy posture — **Built (audited)**
- ✅ **Given** the build, **then** it makes **no network calls** and links no analytics/ad SDKs (grep-audited: no `URLSession`/`http(s)`/analytics imports; no `UserDefaults`).
- ✅ **Given** app data, **then** it lives in app-sandbox Application Support as JSON, readable only by the app.
- ✅ **Given** App Store privacy requirements, **then** `PrivacyInfo.xcprivacy` declares **no tracking, no collected data, no accessed-API reasons**, and it is bundled in the built app (verified in the Release product).
- ✅ **Verified by:** source audit + bundle inspection. **Hard gate — green** (privacy nutrition label to be entered at submission to match).

---

## 3. Out of Scope (v1 non-goals)

Unchanged from the locked product decision, and honored by the build:

- **Streaks / "don't break the chain" / loss-aversion mechanics — forbidden for v1.** History is gentle; a test structurally asserts no streak/chain concept exists in the models.
- **Reminders / push notifications.** None requested; no notification permission is triggered.
- **Audio / guided chanting / per-bead recited audio.** Out. v1 ships at most one gentle completion tone.
- **External 3D/photoreal asset pipeline.** Out. v1 visual styles are native SwiftUI/Canvas renderers plus the haptic rhythm.
- **Content library / large curated catalog, translations, meanings, pronunciation audio.** Out. Neutral Counting plus private user-created labels only.
- **Accounts, cloud sync, cross-device, sharing, social, leaderboards.** Out. Local-first, single-device.
- **Analytics, telemetry, ads, third-party SDKs.** Out (would break F7).
- **In-app purchases / StoreKit.** Out for v1 (no `.storekit`, no IAP UI).
- **Apple Watch / widgets / Live Activities / iPad layout.** Out for v1 (single-screen iPhone app).
- **Localization beyond seed-mantra needs.** Post-v1.

---

## 4. User Flows (as built)

### Flow A — First run / onboarding (intentionally minimal)
1. App launches; on first run a brief, skippable `IntroView` explains "tap anywhere to advance; a distinct buzz at the target." No account, no permission wall.
2. No notification permission and no tracking prompt are requested (none used).
3. User taps **Begin** → Home with the default mantra + target 108.

### Flow B — Core loop (the product)
1. From **Home**, the user has a selected mantra and a target (default 108).
2. **Begin** opens the immersive **Practice** screen — a whole-screen advance area and a quiet ring/count that is not required to read.
3. The user advances anywhere; each advance → crisp per-bead haptic. State + haptic update first, then persist.
4. If interrupted (call, backgrounding, force-quit), the place is persisted; on relaunch a **Resume** card restores the exact bead.
5. On the target bead, the **distinct completion haptic + gentle tone** fires once → **Completion** screen.
6. **Completion**: count, mantra, minutes; saved to history. **New round** (explicit) or **Rest** (back to Home). No streak, no "come back tomorrow."

### Flow C — Choose / create a mantra
1. From Home, open **Mantra Select**.
2. Use neutral **Counting**, or **Add your own** free-text label (title + optional script), saved locally for reuse.

### Flow D — History
1. **History**: a calm, reverse-chronological list (mantra, date, count/target, duration; partials labeled). Swipe to delete an entry; **Clear** removes all. No streaks anywhere.

### Flow E — Settings / privacy
1. **Settings**: default target, completion-tone toggle, haptic strength, clear history. Footers state the silent-switch behavior and the local-only/no-collection posture.

### Flow F — Eyes-free / screen-off practice (the acceptance scenario)
1. Start a session, close eyes or turn the phone face-down; advance by feel; the round's completion is felt distinctly at the target — the "didn't have to look" success signal (§1).

---

## 5. Acceptance Criteria Summary

| ID | Feature | Status | Launch pass/fail gate (summary) |
|----|---------|--------|----------------------------------|
| F1 | Repetition engine | **Built ✓** | Unit tests green: advance, completion once at N only, interruption-resume, target-config (boundary/invalid), undo/decrement. **Hard gate — passed.** |
| F2 | Eyes-free practice screen | **Built** (device-validated) | Whole-screen advance, per-bead haptic, silent-mode haptics, one-step undo, eyes-closed operable; UI-tested and validated on iPhone 16 Pro Max. |
| F3 | Distinct completion signal | **Built** (device-validated) | Distinct Core Haptics pattern, fires once at target, graceful fallback, respects tone-off; validated on iPhone 16 Pro Max. |
| F4 | Neutral counting + private labels | **Built** | Neutral Counting shown; custom free-text usable + persisted; label text never affects counting. |
| F5 | Session completion + history | **Built ✓** | Sessions saved; calm reverse-chron list; partials honest; delete/clear; **no streak UI** (asserted). |
| F6 | Preferences | **Built ✓** | Target/tone/intensity persist and apply without restart. |
| F7 | Local-first persistence & privacy | **Built ✓** | No network/analytics; sandbox-only JSON; bundled `PrivacyInfo.xcprivacy`. **Hard gate — passed** (label entered at submission). |

**Overall launch gate:** F1/F7 hard gates passed; F3 was validated on device; F2/F4/F5/F6 meet criteria. Build 2 is processed, confirmed working through TestFlight, and was submitted for App Review on 2026-08-06 (Waiting for Review). Remaining items are the App Review decision and public-release review. VoiceOver support is out of scope by product decision (2026-08-14) — Dynamic Type is the app's accessibility baseline and is implemented and smoke-tested.

---

## 6. Known Limitations

- **Haptic feel is device-dependent.** Crispness, latency, and distinctness vary across Taptic Engine generations. The core claim was validated on iPhone 16 Pro Max; broader device-class coverage is optional post-v1. The Simulator has no Taptic Engine, so feel cannot be auto-tested.
- **Silent-switch / tone split is nuanced.** Haptics ignore the mute switch; the tone (`.ambient`) follows it. This is documented in Settings copy but should be watched in beta for "why no sound?" confusion.
- **Bundled spiritual seed content is not in Mala v1.** `docs/CONTENT_REVIEW.md` is retained as historical context and must be reactivated if that content returns.
- **Accessibility baseline is Dynamic Type, not VoiceOver.** VoiceOver support is out of scope by product decision (2026-08-14) and is not planned for any version, though existing VoiceOver labels/values/actions and reduced-motion handling remain in place as-is. Dynamic Type has simulator smoke coverage at accessibility text size on large and compact iPhones and is the accessibility baseline required before public launch.
- **The generated `.xcodeproj` is committed for convenience** but `project.yml` is the source of truth — regenerate with `xcodegen generate` rather than hand-editing the project.

---

## 7. Bug & Risk Triage

The original "blocking" list captured the gaps between an empty repo and a shippable v1. Most are now **resolved by the build**; what remains is human/device validation and App Store prep.

### Resolved by the build

| ID | Was | Now |
|----|-----|-----|
| B1 | No app exists | **Resolved** — XcodeGen SwiftUI app, builds Debug+Release for iOS 17+. |
| B2 | Repetition engine unbuilt/untested | **Resolved** — `JapaEngine` + 23 passing unit tests (the hard gate). |
| B3 | Distinct completion haptic + tone unbuilt | **Resolved (code)** — distinct Core Haptics pattern + fallback + synthesized tone; on-device A/B sign-off remains (see open). |
| B4 | Eyes-free per-bead haptic + forgiving advance unbuilt | **Resolved (code)** — whole-screen advance + per-bead haptic; on-device latency/feel sign-off remains. |
| B5 | Privacy artifacts missing | **Resolved** — `PrivacyInfo.xcprivacy` bundled; no-network/no-analytics audited. |
| B7 | Streak/reminder scope leak in docs | **Resolved** — docs corrected; build has no streaks/reminders; test asserts no streak/chain concept. |
| B8 | No persistence/interruption-resume | **Resolved** — `ActiveSessionStore` (advance/haptic first → async persist → resign-active flush); resume verified across a simulated relaunch. |

### Open (must close before public launch)

| ID | Description | Why blocking |
|----|-------------|--------------|
| O1 (was B6) | **Bundled spiritual content review** | Closed for v1 because bundled spiritual content was removed; reactivate only if it returns. |
| O2 (was B3/B4) | **Broader haptic device coverage** | Core haptic and completion behavior passed on iPhone 16 Pro Max; broader coverage is optional post-v1. |
| O3 (was B9) | **App Store metadata:** name (cleared), bundle id, category (Lifestyle vs Health & Fitness), age rating, screenshots, description, support URL, privacy label. | Required to submit. |
| O4 | **Accessibility pass** with Dynamic Type users. | **Closed 2026-08-14** — VoiceOver support is out of scope by product decision and is no longer a launch gate. Dynamic Type is implemented and smoke-tested at accessibility text size and is the app's accessibility baseline. |
| O5 | **Release-candidate distribution** | **Closed 2026-08-06** — Build 2 processed to `Ready to Submit` and confirmed working through TestFlight. GitHub automation is deferred. |

### Non-blocking (ship-with, fix later)

| ID | Description | Rationale |
|----|-------------|-----------|
| N1 | Haptic-intensity control on unsupported devices | Degrades gracefully; not core. |
| N2 | Literal/visual bead-string rendering | Abstract-tactile suffices for v1. |
| N3 | Expanded mantra catalog with meanings/audio | Seed + free-text covers the core. |
| N4 | Audio (chanting, per-bead audio) | Post-v1. |
| N5 | Apple Watch / widgets / Live Activities | Not the differentiator. |
| N6 | UI localization beyond seed-mantra needs | Post-v1. |
| N7 | iCloud/cross-device sync | Local-first by design. |
| N8 | Partial-session UX refinement | Basic honest recording suffices for launch. |

---

## 8. Production-Readiness Assessment

### Current estimated readiness

The live readiness estimate and latest verification are owned by [`docs/STATUS.md`](docs/STATUS.md); this section describes the *shape* of what remains, not a number this document maintains. Qualitatively the product is **built, tested, device-validated, uploaded, and submitted for App Review** (2026-08-06, Waiting for Review), not yet publicly released — a pure tested engine (the hard gate), the eyes-free practice surface, explicit early completion, a distinct completion signal with fallback, interruption-safe persistence, neutral/custom label selection, a non-gamified history, settings, Dynamic Type support, optional TestFlight deployment automation, the 21-style Change Mala picker, an app icon, and a verified privacy posture. What remains is the App Review decision and, once approved, the manual public release.

### Remaining work to reach launch (ordered)
1. ✅ Scaffold (XcodeGen, SwiftUI, iOS 17+, bundle id, app name, icon, README).
2. ✅ Build + unit-test the repetition engine (F1) — passing.
3. ✅ Haptics (F2+F3) — Core Haptics distinct patterns + `UIFeedbackGenerator` fallback; silent-mode behavior.
4. ✅ Practice screen (F2) — whole-screen advance, quiet progress, one-step undo, completion tone via AVFoundation (respects silent switch + setting).
5. ✅ Local persistence (F7) + interruption-resume (B8).
6. ✅ Mantra selection (F4) — reviewed seed + free-text, never affects counting.
7. ✅ History (F5) — calm reverse-chron, delete/clear, no streak UI.
8. ✅ Settings (F6) — target, tone, intensity, mala style, clear history.
9. ✅ Change Mala visual picker — 21 native SwiftUI/Canvas styles; Classic remains default.
10. ✅ Privacy/no-network audit (F7) + `PrivacyInfo.xcprivacy`.
11. ✅ **Content scope (O1)** — bundled spiritual seed content removed from v1; historical review retained.
12. ✅ **Accessibility pass (O4)** — Dynamic Type is the accessibility baseline, implemented and smoke-tested; VoiceOver support is out of scope by product decision (2026-08-14), closing this gate.
13. ✅ **On-device haptic validation (O2)** — done on a physical iPhone 16 Pro Max (2026-07-18). ✅ **App Store prep + release candidate (O3/O5)** — Build 2 uploaded, processed, and submitted for App Review on 2026-08-06; App Review decision and manual public release remain (`docs/DEPLOYMENT.md`).

### Audit (2026-07-01)
A full audit was run against the built app. Findings fixed:
- **Haptic engine reliability (core experience).** `CHHapticEngine.isAutoShutdownEnabled` was `true`, which would stop the Taptic Engine between slow japa taps and drop the next bead's haptic; it is now `false`, the engine resumes on `didBecomeActive` (so a bead is never dropped after a call/backgrounding — the exact interruption this app targets), and a failed play restarts + retries once before falling back. 
- **Resume-card reactivity + disk I/O.** `resumableState` was a computed property doing synchronous disk reads on every Home render and wasn't observable; it's now cached observable state refreshed on launch, on returning from practice, and on foreground.
- **Mantra-add double-dismiss** removed (adding a custom mantra no longer pops the whole stack unexpectedly).
The flagship interruption-safety flow was verified **end-to-end in the running app** (advance → background → terminate → relaunch → resume card → exact bead restored), along with mantra selection/creation, history record + delete, and settings.

### Test coverage summary
- **Current suite (counts owned by [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md); latest verification date/result in [`docs/STATUS.md`](docs/STATUS.md)) — what it covers:**
  - *Unit (hard gate):* engine — advance, completion exactly once at N, advance-past-target, target-config incl. boundary/invalid, undo/decrement floor, reset/new-round, reconstruction from persisted count.
  - *Persistence:* preferences/sessions round-trips, active-session save/flush/load, survival across a new store instance (force-quit sim), latest-write-wins, clear.
  - *Flow:* completion→history + resumable cleared, interruption-resume across a simulated relaunch, honest partial, zero-count discard, undo, explicit new round, custom-mantra + selection persistence, mala-style preference persistence, structural no-streak assertion.
  - *UI:* tap→advance, undo→decrement, target→completion + new round, settings/history navigation, **resume after interruption (background → terminate → relaunch → exact bead)**, mantra selection + custom authoring, history record + swipe-delete, settings tone toggle.
- **Cannot be automated (manual/device):** per-bead haptic crispness/latency; per-bead vs. completion distinctness eyes-free; haptics-in-silent-mode; eyes-closed/screen-off full round; per-device fallback.

---

## 9. Launch Checklist

> Live gate status is tracked in [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) and [`docs/STATUS.md`](docs/STATUS.md); the list below is the PRD's scope-level view.

- [x] **Repetition engine built + unit-tested** (hard gate, F1).
- [x] **Distinct completion haptic + tone implemented and device-validated** with fallback (F3/O2).
- [x] **Eyes-free whole-screen practice + one-step undo** (F2).
- [x] **Interruption-safe persistence / exact-bead resume** (B8/F7).
- [x] **`PrivacyInfo.xcprivacy`** present, bundled, declaring no tracking / no collection (F7).
- [x] **No network / no SDKs audit** — source grep + bundle inspection clean.
- [x] **No tracking prompt / no notification permission** — none triggered (v1, §3).
- [x] **No streaks / no loss-aversion / no nagging** in the shipped UI (asserted by test).
- [x] **No StoreKit / IAP in v1** — none present.
- [x] **App icon** (respectful, abstract bead-ring — no appropriated imagery).
- [x] **Haptics & silent-switch behavior documented in-app** (Settings copy).
- [x] **Local data controls** — delete an entry / clear all.
- [x] **Accessibility baseline implemented** — Dynamic Type and reduced-motion handling are coded and smoke-tested; existing VoiceOver labels/values/advance action remain in place as-is, but VoiceOver support is out of scope by product decision (2026-08-14) and is not a launch requirement.
- [x] **Content scope (O1):** bundled spiritual seed content removed from Mala v1 on 2026-07-26; historical review record retained in `docs/CONTENT_REVIEW.md`.
- [x] **On-device haptic / completion validation (O2)** — validated on a physical iPhone 16 Pro Max (2026-07-18): tick + distinct completion + fallback path; closes JAPA-7. (One hardware class; additional classes optional.)
- [x] **Accessibility gate closed (O4)** — Dynamic Type validated at accessibility text size on device; VoiceOver is out of scope, so no VoiceOver user validation is required.
- [ ] **App identity (O3):** App Store name cleared, category chosen (Lifestyle or Health & Fitness), age rating set honestly.
- [x] **Release-candidate distribution (O5):** Build 2 processed to `Ready to Submit` and confirmed working through TestFlight on 2026-08-06.
- [ ] **App Store privacy "nutrition label"** entered to match `PrivacyInfo.xcprivacy` (no data collected/tracked).
- [ ] **Crash-free core loop on a physical device:** a full 108-bead round end-to-end, including an interruption mid-round, on clean install and on upgrade.
- [ ] **Support/contact URL** and a short, respectful App Store description.
- [~] **TestFlight beta:** intended testers reported the release-candidate behavior acceptable; verify processed Build 2 installs and launches before public release.
