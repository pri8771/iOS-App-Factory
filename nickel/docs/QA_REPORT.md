# nickel — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Review

CONSENSUS: YES

The Product Strategist's read is correct and the build data backs it up: this is a **no-go**. An app that fails to compile has delivered zero user value regardless of how sound the surrounding architecture audits claim the Swift code is. Two repair attempts (actor-isolation fix on `CategoryEntityQuery.init`, then a `nonisolated(unsafe)` fix on `EntitlementStore.deinit`) were both made *without ever seeing an actual compiler error message* — nobody in this entire process has successfully run `xcodebuild` and read real diagnostics. Both fixes were plausible Swift 6 concurrency guesses, and both times verification still failed. That's not a diagnosis process, it's speculative patching, and it needs to be reported as such rather than wrapped in confidence the process hasn't earned.

## Final Output

**Go/No-Go: NO-GO.** The app does not compile. Verification failed on the initial attempt and on both subsequent repair attempts (attempt 2 result: compile FAILED for the iOS Simulator via xcodebuild). This is unconditional — no feature works if the binary doesn't build.

**What was built:** Per two independent full-codebase static audits (every `.swift` file in NickelKit's models/repository/services/intents, the app UI layer, the widget target, and all test files), the feature set matches v1 scope on paper: manual spend logging, category browsing, weekly recap card via `ImageRenderer`/`ShareLink`, WidgetKit week-to-date widget, CSV export/import, soft weekly targets, and a StoreKit 2 Nickel+ paywall. A real config regression (App Group entitlement, widget's `NSExtensionPointIdentifier`, URL scheme all stripped from Info.plist/entitlements files) was found and repaired. Two further fixes addressed Swift 6 actor-isolation issues in `CategoryEntityQuery` and `EntitlementStore`.

**Verification status:** FAILED, 2 repair attempts, still failing. Critically, **no actual compiler error log has been captured or read by anyone in this process at any point** — every fix so far has been either a static-audit inference or an educated guess at a plausible Swift 6 concurrency problem. We do not know what is currently causing the build to fail. That is the single most important fact for the next iteration to act on.

**Prompt coverage:** Cannot be assessed meaningfully — coverage of a non-compiling app is theoretical. All v1-scope features are present in source form per static audit, but "present in source" ≠ "working" until there's a green build.

**Known limitations:**
- No confirmed build-error text has ever been obtained in this process; all fixes to date are inferential, not diagnostic.
- `PhotosPicker` is imported in `LogSheetView.swift` but never wired up — receipt photo capture silently no-ops (`receiptPhotoPath` hardcoded to `nil`). Flagged, not fixed, since it's not a compile blocker.
- Two rounds of "exhaustive static audit found zero errors" turned out to be wrong or at least incomplete — treat future "should compile" claims from static review alone with skepticism until backed by a real build log.

**Top follow-ups (in order):**
1. **Blocker, owner: next build pass.** Run `xcodebuild -scheme Nickel -destination 'generic/platform=iOS' build` (or open in Xcode) and capture the actual, literal error text before making any further edit. This is the one step that has been missing through the entire fix history and is non-negotiable before another speculative patch is attempted.
2. **Blocker, owner: next build pass.** Fix strictly against that real error list, continuing the a/b/c triage discipline from the iterate_scope phase (genuine bug vs. target-membership vs. disclosed scope-cut) — do not guess again.
3. **Non-blocker, owner: future iteration.** Decide whether to wire up `PhotosPicker` for receipt photos or explicitly descope it, since right now it's a dead import silently doing nothing.

VERIFICATION: FAILED
## Build Verification

FAILED (compile FAILED for the iOS Simulator)
