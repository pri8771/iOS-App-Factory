# scope-guard — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Review

CONSENSUS: YES

Here's the call: ship this as a build fix, with two named risks that need follow-up before anyone treats it as fully validated.

The core fix is legitimate, not a shortcut. The actual bug — an untyped `catch` around a typed-throws call in `IntakeViewModel.swift` that broke exhaustive matching over `ScopeExtractorError` — got fixed by correctly typing the catch, not by gutting the switch or force-routing everything to manual fallback. That was the single biggest risk this whole thread worried about going in, and it didn't happen. Verification confirms `xcodebuild` now compiles cleanly for the iOS Simulator (attempt 2, after the typed-catch correction).

What still works, per multiple independent hand-audits across this thread: the on-device extraction path, the manual-tagging fallback, the StoreKit 2 paywall/entitlement gating (free tier 1 project/10 extractions vs. unlimited paid), and the full workflow from create-project through baseline, paste, extract, review, and change-order draft + export. Nobody stubbed or bypassed any of these to get to green.

What's a known, pre-existing gap rather than a regression: there is no Share Extension target in the project at all — it was never built, confirmed by inspecting `project.yml`/`project.pbxproj` directly, and the integrator correctly declined to build a whole new extension target (new target, entry point, Info.plist activation rules, App Group entitlements on two targets) under a "fix the compile error" mandate. That's honest scoping, not a silent drop, but it does mean one of the four listed iOS-native features and a natural on-ramp (client ask lands in Mail/Messages) doesn't exist yet.

Two things are genuine top risks that this phase can't resolve itself and need to be flagged forward, not buried:
1. **No human or simulator has actually driven the core loop.** Every check in this whole chain was static/hand-audit or a headless compiler invocation — nobody pasted a real messy client message and watched paste → flag → change-order draft happen on device. Compiling is orthogonal to working; that gap should close before anyone calls the mechanic validated.
2. **`@unchecked Sendable` got added to `Project`, `AnalysisSession`, `DraftDocument`, `IntakeDraft`, and `ManualTaggingDraftRecord`** to satisfy the compiler during this fix. That's turning off Swift's concurrency safety net on exactly the objects holding client data and billing state — for an app whose pitch depends on trusting a flag enough to bill on it, a silent data race here wouldn't show up as a build error, it'd show up as a rare wrong classification, which is precisely the failure mode the spec's own invalidation criteria warns about. This needs a real concurrency review, not just a compiler-satisfied pass.

## Final Output

**Go/no-go: GO** — the app compiles cleanly for iOS Simulator and the fix preserved every feature (extraction, fallback, paywall, wiring) rather than stubbing them out.

**What changed:** One real fix — `IntakeViewModel.swift:114` catch block changed from untyped `catch { switch error {...} }` to `catch let error as ScopeExtractorError { switch error {...} }`, resolving a typed-throws mismatch that broke the exhaustive switch over `ScopeExtractorError` cases (this mirrors the existing correct pattern in `DraftPreviewViewModel.swift`). Supporting fixes already landed earlier in this build cycle: `AIScopeExtractor` gained required `Sendable` conformance, several model types gained `@unchecked Sendable`, a mixed-switch missing-return bug was fixed in `ProjectHomeView.swift`, and a missing `import UIKit` was added to `DraftPreviewView.swift`.

**Verification:** `xcodebuild -destination 'generic/platform=iOS Simulator' build` succeeded cleanly (verified on attempt 2, after the typed-catch fix). No simulator app launch / manual smoke test has been performed by anyone in this process — that remains open.

**Prompt coverage:** Full v1 workflow (project/client management, manual baseline, paste-and-extract with LLM + manual fallback, review/reclassify, change-order draft, local export, StoreKit 2 paywall) is present and wired. The Share Extension from Mail/Messages, listed as an iOS-native feature in the spec, was never built — no target, no entry point, no App Group entitlement on either side.

**Known limitations:**
- Share Extension target does not exist (pre-existing gap, not caused by this fix).
- `@unchecked Sendable` on `Project`, `AnalysisSession`, `DraftDocument`, `IntakeDraft`, `ManualTaggingDraftRecord` disables compiler concurrency checking on data-integrity-sensitive types — unreviewed risk, not unreviewed by choice but by time.
- No end-to-end manual/simulator run of the core loop has happened; only static audits and headless compiler checks.
- Extraction quality/accuracy against messy real client phrasing remains completely unvalidated — compiling says nothing about whether flags are correct, which is the spec's own stated invalidation criterion.

**Top follow-ups (with owner/next step):**
1. Run the app in the iOS Simulator and manually drive paste → extract → review → draft once, on a real device/simulator session — owner: next build-verification pass, before any user-facing claim of "it works."
2. Concurrency-review the `@unchecked Sendable` types — replace with real `Sendable` conformance or actor isolation where feasible — owner: next iteration touching data_domain models.
3. Scope and build the Share Extension target (new target, entry point, Info.plist NSExtension rules, App Group entitlement on both targets) as a standalone follow-up task, not bundled into a future compile-fix request.
4. Validate extraction quality against real, messy client message samples — this is unstarted and is the spec's primary invalidation risk.

VERIFICATION: VERIFIED
## Build Verification

VERIFIED (compiled cleanly for the iOS Simulator)
