# crux-cycle — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Review

This is the final round, so the call needs to be made now.

The right synthesis is Codex's framing with Claude's honesty layer bolted on: the build is a genuine go for "does it compile," but the two most substantive points from this round — that "compiled" and "verified working" are different claims, and that "enforcement" and "monetization" are currently overstated relative to what's built — have to survive into the record rather than get smoothed over into a clean bill of health.

CONSENSUS: YES

## Final Output

**What was built:** A real, compiling iOS app. `Crux Cycle.xcodeproj` with correct target membership, scheme, iOS 17+ deployment target, and a single `@main` entry (`CruxCycleApp` → `AppRootView`) wraps a SwiftData-backed local persistence layer, a 4-tab UI (Today/History/Trends/Settings), session logging with backdate/edit/delete, load-snapshot recomputation, phase labeling, and a rest-day gate banner with acknowledge-and-override backed by a persisted `GateAcknowledgmentStore`. Pro-gated features (CSV export, discipline split, phase history) are wired to an `EntitlementStore` flag.

**Verification status:** `xcodebuild -sdk iphonesimulator build` succeeded after one repair (a `Text(_:specifier:)` resolution failure in `VerdictCard.swift`, fixed by switching to `String(format:)`). That's a real, orchestrator-confirmed compile — the launch blocker from the prior phase is cleared. What is **not** verified: nobody has actually run the app in Simulator, logged a session, triggered the rest-day gate, force-quit, and relaunched to confirm state round-trips. All "reachable and working" claims about the UI flow are static/code-review-level confidence (integrator cross-check + hand-verification against SwiftData/SwiftUI APIs), not runtime-observed. Automated test coverage is limited to `LoadMathTests.swift` — pure domain math only, no persistence, engine, or UI-flow tests.

**Prompt coverage:** The core promise — structured periodization + rest-day handling, local-first — is present in a form that matches the app's own product logic reasonably well. One word-choice flag: the original spec says "rest-day enforcement," but what's built is a dismissible advisory banner (acknowledge-and-proceed), not a hard block. That's likely the right product call for an MVP, not a defect, but the final record should call it a soft nudge, not enforcement, so nobody downstream assumes a stronger guarantee than exists.

**Known limitations (named, not hidden):**
1. No runtime/manual QA pass has happened — only compile-time verification.
2. "Rest-day enforcement" is advisory-only (one-tap dismissible), weaker than the spec's word choice implies.
3. Monetization is scaffolding only: `EntitlementStore.isPro` is a debug toggle in Settings, not backed by StoreKit — there is no real purchase path a user could complete. This is a genuine gap against the portfolio's hard monetization requirement, not a nice-to-have.
4. Persistence, `TrainingLoadEngine` recompute correctness, and gate-state consistency across edit/backdate/delete/relaunch cycles are unverified by both tests and manual use.

**Top follow-ups (ranked):**
1. Manual Simulator smoke test: log → edit → backdate → delete → force-quit → relaunch, confirm Today verdict, snapshot history, and gate-acknowledgment state all remain coherent. This is cheap and should happen before calling anything launch-ready.
2. Replace the debug Pro toggle with real StoreKit 2 purchase/restore flow — currently the single biggest gap against "realistic path to monetization."
3. Add test coverage for `TrainingLoadEngine`'s recompute pipeline and SwiftData round-trip, since that layer has never been exercised by anything other than static review.

**Verdict: go, with the above named as open items — not a blind go.** The app is real, compiles, and has genuine local-first functionality a climber could use today; what's left is runtime validation and turning the entitlement flag into an actual subscription.

VERIFICATION: VERIFIED
## Build Verification

VERIFIED (compiled cleanly for the iOS Simulator)
