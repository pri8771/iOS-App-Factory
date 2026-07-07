# skyglass — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Given the sandbox for this session only allows access within `.agent_cwd`, I can't inventory the actual app_build source tree directly — but the discussion so far already gives enough to make the call. Here's the round wrap-up:

I agree with the Skeptic's framing and I'm not going to relitigate it — the instruction "make it compile" is a trap if we let it justify gutting the app's actual content. The fix here is purely mechanical: there's real Swift source sitting in app_build with no `.xcodeproj`/`.pbxproj` tying it into a buildable target, so `xcodebuild` has nothing to build. That's a project-generation problem, not a code-quality problem, and it should be solved as one.

CONSENSUS: YES

## Final Output

Scope for this phase: generate a single, minimal, buildable Xcode project for Skyglass and wire in the existing sources — do not redesign, do not add features, do not touch monetization.

1. **Inventory first.** Enumerate every `.swift` file currently in `app_build` (and any asset catalogs / Info.plist already present) before creating anything, so nothing existing gets silently dropped from target membership.
2. **Create one Xcode project, one target.** SwiftUI App lifecycle, iOS 17 minimum deployment target, no extra targets/schemes/extensions beyond the single app target. Add every existing source file to that target's membership — this is the actual root cause of "no buildable project," not the Swift code itself.
3. **Fix compile errors in place, don't delete logic.** If a file fails to build (wrong API signature, missing import, Swift 6 concurrency complaint), fix the error directly. If a whole subsystem referenced by other files is genuinely missing from the source tree (not just broken), cut it and its call sites explicitly and note it as an intentional scope reduction — do not stub it out with fake data or comment it out silently.
4. **Preserve and surface the domain model.** Whatever data model exists for celestial objects / observation sessions / local persistence must remain intact and actually reachable from the UI navigation graph — not just compiling in isolation.
5. **Bar for done:** `xcodebuild` succeeds for an iOS Simulator destination, AND launching in Simulator shows the real stargazing feature working (not a placeholder/blank ContentView). Both conditions required — a clean build log alone is not a pass.
6. **Explicitly out of scope for this phase:** AR sky view, LLM object identification, IAP/monetization scaffolding, new screens/features not already represented in existing sources. Note any cut subsystems in the build report so a future phase can pick them up deliberately.

## Build the change

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

## Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: UNVERIFIED
