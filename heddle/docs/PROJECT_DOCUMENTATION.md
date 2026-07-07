# heddle — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Confirmed — I'm sandboxed to `.agent_cwd`, same as the other agents, so I can't inspect `app_build` directly either. I'll finalize the decision based on the discussion.

Both takes agree on the core move: this phase is "make it compile," not "make it bigger." Codex is right that the mechanical piece — a real `.xcodeproj`, correct target membership, resources actually in the bundle — is non-negotiable and is probably where the literal failure lives. But my round-1 concern stands: in a 7-app parallel factory run, "existing sources" is very likely partial/inconsistent scaffolding rather than a coherent app, so "wire in existing sources" can't be the whole instruction — it has to come with an explicit fallback and an explicit scope line, or whoever builds this will either stall on incoherent fragments or quietly do a full rewrite. Codex's own fallback clause (state explicitly if sources aren't salvageable, then build the thinnest complete MVP around the decided concept) is the right tiebreaker, so I'm folding it in as a required step rather than an optional one.

CONSENSUS: YES

## Final Output

**Scope for this phase: get Heddle compiling and running in the iOS Simulator as a real, playable puzzle-game MVP. Nothing else.**

1. **Audit first, don't assume.** Before writing any project file, enumerate every `.swift` file in `app_build`, check for a single consistent domain model, and check for competing/duplicate entry points (multiple `@main` App structs, orphaned view models, types referenced but never defined). Report this inventory plainly.
   - If the sources are salvageable (one coherent model, one entry point, logic that's just unwired): proceed to step 2 as-is.
   - If the sources are incoherent fragments: state that explicitly, keep only what's genuinely reusable (data models, isolated logic that compiles standalone), and discard/replace the rest. Do not attempt to force-integrate contradictory scaffolding.

2. **Commit to one concrete core mechanic now**, not later: a thread/weave/loom-based logic puzzle — pulling, crossing, or tensioning threads through a warp to complete a pattern, evaluated deterministically each move (not physics-based, not real-time). This is the "tactile, not match-3" identity from the spec, kept simple enough to actually ship compiling. If the audited sources already implement something coherent and different but still warm/tactile and puzzle-appropriate, keep that instead of forcing this exact mechanic — but pick one and state it.

3. **Build the project skeleton:**
   - Create `Heddle.xcodeproj` with one iOS app target, deployment target iOS 17, bundle id `com.iosappfactory.heddle` (or whatever convention the other 6 sibling apps use — match it).
   - Root entry point is the real game/puzzle root view (daily puzzle or first-level entry + local progress), never a placeholder `ContentView`.
   - Attach every kept source file, asset catalog, and resource with correct target membership.
   - Local persistence only (e.g. `UserDefaults`/on-disk JSON for progress/state) — deterministic, no network, no cloud stub required yet.

4. **Explicitly out of scope this phase**, even though the original spec mentions them: subscriptions, IAP, season pass, cosmetics, daily-challenge infra, any idle-game crossover. Defer all of it. This phase ends when the app builds clean for Simulator and the one core puzzle loop is actually playable start-to-finish (empty/loading/success/error states can be minimal but must exist).

5. **Definition of done:** `xcodebuild` succeeds for iOS Simulator with zero errors, app launches into the real puzzle root (not a stub), and one full puzzle can be played and solved locally. Report the file-level diff (created vs. kept vs. deleted) in the phase output — no vague "wired in existing sources" language.

## Build the change

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

## Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: UNVERIFIED
