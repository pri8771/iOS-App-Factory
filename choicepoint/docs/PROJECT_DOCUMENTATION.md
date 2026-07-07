# choicepoint — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Looking at this, the discussion converged pretty cleanly even without the other two models weighing in — the single Claude round already did the real work: diagnose the failure as packaging (not scope), and refuse to let "make it compile" become a backdoor for building the widget/Siri/LLM features that were never actually laid down. I agree with that framing and I'm making it the decision for this phase.

The one thing I'd add on top of round 1: before generating the project file, someone (the next phase) needs to actually open app_build and check for the "cracked foundation" risk flagged at the end — duplicate types, conflicting persistence layers, orphaned widget/intent stub files with no home. That's a 5-minute check that prevents wiring garbage into a project and calling it done. So the decision includes that as a required first step, not an afterthought.

CONSENSUS: YES

## Final Output

Scope for this phase: **fix packaging only, single-target app, no new features.**

1. **Audit before wiring.** Open every file currently in app_build. Confirm there's one coherent data model and one persistence approach for decisions/predictions/outcomes. If duplicate/conflicting types exist (e.g. from separate incomplete attempts), reconcile to the most complete version — do not wire both in and let the compiler pick a winner via last-file-wins. Do not rename existing types/files while doing this; reconcile by deleting the clearly-inferior duplicate, not by merging renames across the tree.

2. **Generate one Xcode project, one app target** ("Choicepoint"), covering:
   - All existing SwiftUI views, view models, and data/model files for decision capture, revisit scheduling, outcome logging, and calibration stats — added to the target's Compile Sources.
   - A proper `@main App` entry point and root `Scene`/`WindowGroup` if one doesn't already exist in the sources (write the minimal glue, don't invent new screens).
   - A minimal but correct Info.plist: app display name, bundle id (e.g. `com.choicepoint.app` placeholder), required device orientations, and — only if the source actually calls Speech/AVAudioSession/microphone APIs for the voice-note feature — `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. Do not add these keys speculatively if no source touches those APIs.
   - Local notification authorization request (`UNUserNotificationCenter.requestAuthorization`) wired into the existing revisit-scheduling code path if that code already assumes notifications but never requests permission — this is a one- or two-line addition to existing flow, not a new feature.

3. **Explicitly descope, don't fake-compile:** any widget extension code, App Intents/Siri code, or on-device LLM voice-structuring code that exists as source but has no corresponding extension target, App Group, or entitlements already set up. Exclude those files from the app target's Compile Sources (keep the files on disk, just uncheck target membership) and note them as descoped for a future phase. Do not strip their functionality to force a fake compile, and do not build out the missing target/entitlement infrastructure in this pass.

4. **Success bar:** `xcodebuild -scheme Choicepoint -destination 'platform=iOS Simulator,name=iPhone 16' build` exits 0, AND the app actually launches in the simulator and renders the decision-capture screen without crashing (catches missing scene setup or bad Info.plist that a clean compile wouldn't).

5. **No renames, no reorganization, no scope additions** beyond what's needed to satisfy items 2–4.

## Build the change

_No build integrator was available this iteration (attempted: Claude, Gemini). The observer recorded this as integrationless iteration 1._

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

## Review

VERIFICATION: UNVERIFIED
