# heddle — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Given the sandboxing here, I can't inspect `app_build` directly — but that's fine, this phase is about deciding the plan, not executing it. Here's the call.

Three repair rounds have failed on the same thing: no `.xcodeproj`/`.xcworkspace` ever gets produced. That means the fix can't be "try harder at wiring things in" — it has to be a fundamentally more reliable path to a project file, plus a hard guardrail against the fix silently degenerating into a blank app that merely compiles. I agree with the skeptic's read: audit-first, then hand-build a minimal project, then prove it with an actual `xcodebuild` run — no claim of success without that log.

CONSENSUS: YES

## Final Output

**Decision:** Do not attempt another "generate everything from scratch" pass. Instead: (1) inventory what's actually in `app_build` — enumerate every `.swift` file, note the type each one declares, and flag duplicate type names, orphaned references, or files that assume frameworks/assets that don't exist; (2) based on that inventory, hand-author a minimal, correct Xcode project (single `.xcodeproj` with `project.pbxproj`, one app target, iOS 17 deployment target, SwiftUI `@main` App lifecycle, one bundle id `com.iosappfactory.heddle` or similar, `Info.plist`, and a minimal `Assets.xcassets` with at least an `AppIcon` placeholder); (3) add every existing source file that compiles cleanly and is part of a coherent, non-conflicting data model to the target's Compile Sources — do not invent new gameplay logic, only patch what's strictly required to unblock compilation (missing `@main` entry point, a missing type a file references, a duplicate symbol that needs renaming/removing); (4) if the audit finds the existing sources are too tangled to include wholesale (conflicting model definitions, half-finished duplicate view hierarchies), prune down to the smallest consistent subset that still delivers one real playable loop, rather than trying to reconcile everything.

**Definition of done for this repair round:** `xcodebuild -scheme Heddle -destination 'platform=iOS Simulator,name=iPhone 15'` (or equivalent) succeeds, and the resulting app shows one real playable loop, not a placeholder: a puzzle/thread board renders using whatever existing loom/weaving mechanic sources already exist, the player can make a move that changes state, and there's a recognizable win/complete state. If no existing sources implement that loop coherently, build the smallest version of it that satisfies Heddle's "warm, tactile, thread/weaving puzzle, not match-3" premise — using SwiftUI, deterministic local state, no third-party dependencies, matching the global app-build rules (real user-visible behavior, empty/loading/success/error states where reachable, accessibility labels, 44pt targets, persistence).

**Verification gate:** the build phase must attach the actual `xcodebuild` log as evidence. "Files look correct" is not sufficient — only a green Simulator build, confirmed by the log, closes this phase.

## Build the change

You've hit your weekly limit · resets Jul 12 at 1pm (America/New_York)

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

## Review

You've hit your weekly limit · resets Jul 12 at 1pm (America/New_York)

VERIFICATION: UNVERIFIED
