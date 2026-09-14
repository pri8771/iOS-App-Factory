# Tether — the daily distance card for two people who miss each other

Tether is a long-distance app for any two people separated by miles — partners, best friends, a parent and a kid abroad, siblings on different continents. It turns the exact distance between you into ONE gorgeous, co-created daily artifact you both hold, answer, and post: the **distance card**. Build a native iOS SwiftUI app (iOS 17+), local-first so it compiles and passes gates fully offline, with a clean sync seam behind it for production. The entire product commits to depth in one narrow surface: the hero distance card. Everything else serves it.

## The one thing
The daily distance card. If a feature does not make that card more beautiful, more emotional, or more shareable, it is out of scope.

## Core loop (concrete user actions)
1. **Pair.** On first launch you name your person and share a join link/code. The card literally cannot be created solo — the invite is the mechanic, not a growth afterthought. (For solo testing and the UI-crawl gate, a "Preview with a sample partner" path fully simulates the second user so every downstream state is reachable offline.)
2. **Drop locations.** Both people set a home location (city search over a bundled city seed list; no map-tile network dependency). The two points ignite on the globe and the amber tether draws across it for the first time.
3. **Open today's card.** Each day the app issues one shared prompt ("What did you eat without me?", "Best thing that happened today?"). The home screen shows the globe, the live distance, the dual clock, and today's prompt in a "waiting" state.
4. **Answer.** You type a one-line reply. The card stays half-lit until BOTH have answered — this two-sided gated reveal is the heartbeat of the app. When your person answers, you feel a two-beat "heartbeat" haptic and the card completes: both answers slide in, the tether snaps taut with a crisp tick.
5. **Share.** Pick a skin, toggle animated vs. still, export to Stories/Messages. Free = static PNG with a join watermark; Tether+ = animated MP4/Live Photo.
6. **Archive + streak.** Every completed card threads into a vertical Timeline — your relationship as a scrollable archive — and extends your answer streak.
7. **Count down to reunion.** A Reunion countdown (paid) tracks the next time you'll be together; hitting a milestone or zero produces its own hero card worth posting.

## Key screens
1. **Onboarding / Pair** — name your person, share a join link, both drop a home location; the two points ignite and the tether draws on for the first time (signature minting ritual).
2. **Today (home)** — the hero distance card: animated night-globe, the amber tether, live distance readout, dual clock (both local times), and today's shared prompt. This screen is the app.
3. **Answer sheet** — a focused sheet to type your one-line reply; submitting fires a crisp tick and moves the card to "waiting for them" (or completes it if they already answered).
4. **Compose & Share** — pick a skin, toggle animated vs. still, preview, export to Stories/Messages/Photos with the watermark join link.
5. **Timeline** — a vertical thread of past completed cards + both answers; tap any card to relive it or re-share.
6. **Reunion (Tether+)** — countdown to your next meet-up with its own hero visual; an anniversary/"Year Tethered" retrospective reel stitched from past cards.
7. **Connections & Settings** — manage connections (multiple are Tether+), notification cadence ("your person opened today's card"), units (km/mi), subscription, sign-out.
8. **Paywall** — presented at the three paid triggers (tap "animated export", tap "add a second connection", open Reunion). Clean, one-screen, honest about what is and isn't gated.

## Design language — opinionated and machine-checkable
All colors and all type live in a single **`DesignSystem.swift`** (the design-lint gate forbids inline `Color(...)`/`UIColor(...)` and raw `.font(.system(size:))` anywhere else). Dark-first. 8pt spacing grid. No third-party SPM packages, no bundled custom fonts (avoid licensing/compile risk) — the type ramp is realized entirely in San Francisco via width/weight/tracking.

**Palette (owned, tiny):**
- Canvas / night ocean: deep indigo `#12132B`; raised panels `#1B1D3A`.
- Text: ivory `#F2EFE6` primary; ivory at ~62% for secondary; ~40% for tertiary/coastlines.
- Coastline hairlines: ivory at low alpha, ~0.75pt.
- **The one accent — amber.** `#FFB454`, with a glow gradient `#FF9E3D → #FFCE8A`. HARD RULE: amber colors ONLY the tether arc, the two glowing endpoints, and the single primary action that "lights the tether" (create/answer). Nothing else in the entire app may be amber — this restraint is what reads premium and is trivially lint-verified.

**Type ramp (two "families" via SF width):**
- `display` (distance readout, e.g. "2,847 km"): SF `.width(.compressed)`, weight `.heavy`, ~80pt, `monospacedDigit`, tight tracking, `numericText` transition so it ticks.
- `title` ~28 semibold; `headline` ~20 semibold; `body` ~17 regular; `caption` ~13.
- `meta` (dual clock, coordinates, dates): monospaced-digit, tracking +0.5 — a quiet "instrument" voice against the humanist UI.
- Every token scales with Dynamic Type via `relativeTo:`.

**The globe (the visual signature, fully native):** an orthographic Earth in SwiftUI `Canvas`. Bundle a low-res world coastline as `[[lon,lat]]` polylines (Natural Earth 110m, simplified). Project each point with the standard orthographic formula about a center (λ0, φ0); draw only the front hemisphere (visible when `sin φ0·sin φ + cos φ0·cos φ·cos(λ−λ0) ≥ 0`). Deep-indigo ocean disk, ivory hairline coastlines, a soft day/night **terminator** as a drifting gradient. The **tether** is a great-circle arc between the two points, sampled, projected, clipped to the front hemisphere, stroked in amber with an additive glow. Distance is haversine between the two lat/lon. No 3D engine, no map tiles, no network — deterministic and compile-clean.

**Motion:**
- Tether **draws on** over ~1.1s (`trim` 0→1, easeOut) — the minting ritual.
- Endpoints **ignite** (scale + bloom) as the arc lands.
- Globe **parallax**: gentle damped yaw/pitch (±6°) mapped from CoreMotion device attitude; terminator drifts slowly. `Reduce Motion` → static globe, cross-fade instead of draw-on. Haptics still fire.
- Card **completion**: soft cross-dissolve from "waiting" to complete; both answer lines slide up; distance counter uses `numericText`.

**Haptics (signature):**
- **Two-beat "heartbeat"** (`.soft`, two taps ~140ms apart) when your person opens/answers today's card and when the tether lands — the emotional tell of the app.
- **Crisp tick** (`.rigid`) when you submit an answer and when the arc snaps taut.
- **Success** notification haptic on card completion.

## Data & backend (complex tier, but bounded)
Local-first is the build/gate target; production sync lives behind a protocol seam.
- **Models (SwiftData):** `Person` (name, avatar tint, home lat/lon, timezone), `Connection` (the pair, created date, skin, streak count), `Card` (date, promptID, my answer, their answer, completed flag, distance snapshot), `Prompt` (id, text, day), `Reunion` (target date, title).
- **`SyncService` protocol** with a default **`LocalSyncService`** (SwiftData-backed, in-process simulated partner for offline testing and the crawler) and a documented **Firebase-style adapter** as the production target: auth, a Firestore-style paired `connection` document, a daily server-issued shared prompt, two-sided answer state with a **gated reveal** (the card completes only when both `myAnswer` and `theirAnswer` exist), locations, sync, and push ("your person opened today's card"). The local build ships a bundled 60-day prompt list so "today's prompt" works with no network.
- **State machine per card:** `awaitingBoth → awaitingThem/awaitingMe → complete`. Reveal is gated on `complete`. This is the app's core correctness invariant — cover it with tests.

## Monetization (exact)
Freemium subscription — **Tether+**, **$4.99/mo or $29.99/yr, 7-day trial**, billed to one person for the pair. StoreKit 2 driven by a bundled `.storekit` configuration so purchases succeed in the simulator during gates.
- **Free forever:** one connection, classic indigo globe, static PNG export (watermarked with join link). The core daily card is NEVER paywalled.
- **Tether+ unlocks exactly:** (1) **animated card export** (globe rotation + tether draw-on rendered to MP4/Live Photo via native `Canvas` snapshot loop → `AVAssetWriter`, no third-party); (2) **more than one connection**; (3) **premium skins** (Aurora, Blueprint, Film-grain, Solstice); (4) the **Reunion** module + the annual **Year Tethered** retrospective reel.
- **Paywall triggers:** tap animated export, tap "add a connection", open Reunion.

## Virality (exact)
- **Share unit:** the completed daily distance card (two points, amber tether, live distance, dual clock, both one-line answers).
- **Why it spreads:** (1) it is impossible to make alone — creating your first card forces you to invite your specific person, so every install recruits a second user by design (K≥1 from the mechanic, before any voluntary share); (2) it is emotionally irresistible to post ("1,204 days. 8,300 km. still tethered."). Every export carries a small "Tethered" wordmark + join deep link; Tether+ adds a subtle foil corner.
- **Amplifiers:** milestone cards (100 days connected, reunion countdown → zero) and the annual **Year Tethered** retrospective (total days apart, total miles between you, longest streak) as a second yearly viral pulse.

## Build constraints
- iOS 17+, SwiftUI, SwiftData, StoreKit 2, CoreMotion, AVFoundation. **No third-party SPM packages. No inline colors or raw font sizes outside `DesignSystem.swift`.**
- Must COMPILE and be fully traversable in the iOS Simulator OFFLINE: local sync, bundled prompts, bundled city + coastline data, "Preview with a sample partner" so the gated-reveal completed-card state is always reachable.

## Explicitly out of scope (V2)
- Real-time chat/messaging, photo attachments on cards, group chat, Android, Apple Watch app, live location tracking, in-app calling, more than the four launch skins. Keep the surface narrow; make the one card unforgettable.


## Change requested
The app currently FAILS its release gate: design lint: 1 design/dependency lint error(s) — e.g. raw_font_size at Tether/Resilience/ResilienceHelpers.swift:69 (raw font size — use the DesignSystem type ramp). Full list in docs/design_lint.json. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Full findings with file:line are in docs/design_lint.json — fix EVERY error entry.
