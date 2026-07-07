# chalkline — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Confirmed — this working directory is empty, consistent with the premise that app_build has no project or sources yet. This phase is a scoping decision, not the build itself, so my job is to finalize round 1 with a concrete, buildable plan for the next phase to execute against.

The skeptic's take is right, and it's the only real proposal on the table anyway: three passes have already produced docs instead of code when asked to hit the full spec in one shot, so asking for everything again just reproduces the failure. The fix is to cut to a vertical slice that's guaranteed to compile and demonstrate the app's actual differentiator (on-device pose analysis), and explicitly log everything else as deferred rather than pretend it's built. I'm also taking the skeptic's fallback clause seriously — if the Vision pipeline can't be made solid, movement-trace-only (no fake efficiency number) is an acceptable outcome for this phase, not a failure, per the app's own documented invalidation criteria.

CONSENSUS: YES

## Final Output

**Scope for this build phase:** a real, compiling Xcode project implementing the core log → capture/import → pose-trace-overlay loop. Everything else is explicitly deferred, not silently dropped.

**Project setup (must be correct or nothing else matters):**
- Create a proper `.xcodeproj` (or Swift Package-backed app target) with correct target membership for every source file, valid bundle id, iOS 17+ deployment target, and a scheme that builds for iOS Simulator.
- App name/bundle: Chalkline.
- No third-party dependencies — SwiftUI, SwiftData, Vision, AVFoundation, PhotosUI only.

**In scope — must exist and compile:**
1. **SwiftData models**: `Gym`, `Route` (color-coded grade, gym relationship), `Attempt` (route relationship, timestamp, video file reference — not a blob, stored in Documents directory), `Session` (attempts relationship). Real relationships, not flat structs.
2. **Route/attempt logging flow**: list gyms → routes → log an attempt against a route, with empty, loading, and error states.
3. **Video import**: `PhotosPicker`-based import of an attempt clip (skip live AVCaptureSession complexity this pass — import only).
4. **Pose pipeline**: `VNDetectHumanBodyPoseRequest` sampling the imported clip at a fixed low frame rate via `AVAssetImageGenerator`/`AVAssetReader`, converting Vision's normalized bottom-left coordinates into SwiftUI overlay space correctly, rendered as a pose-trace overlay on the video.
5. **Efficiency score OR documented fallback**: attempt a simple, explainable efficiency signal (e.g., center-of-mass path smoothness) tied to a visible confidence indicator. If this doesn't produce something stable and honest, ship movement-trace visualization with no numeric score — that is a valid, accepted outcome per the original spec's own invalidation criteria, not a shortfall.
6. Basic accessibility (VoiceOver labels, 44pt targets) and dark mode on the screens that exist.

**Explicitly deferred (must be logged as not-yet-built, not silently cut):**
- Side-by-side attempt comparison
- Widget (streak/next goal)
- Live Activity (timed attempts/rest)
- App Intents / Siri ("log a send")
- Training-plan generation
- Live camera capture (import-only for now)

**Acceptance bar:** project opens and builds clean for iOS Simulator, SwiftData models persist real data, the log flow and pose-trace-overlay flow are functional end to end with real Vision output (not mocked), and the deferred list above is written down somewhere in the repo (e.g. a `KNOWN_LIMITATIONS.md` or README section) so the next iteration starts from truth instead of another rebuild-from-docs cycle.

## Build the change

Nothing new to wire this round — `ProcessingGauge.swift` was edited in place (already registered), no new files, and my sanity checks still tie out cleanly: 49 Swift files, 49 build-phase entries, 52 file references (49 source + Info.plist + 2 product refs). I updated `KNOWN_LIMITATIONS.md` with the frontend lane's concrete finding — the route-picker UI is blocked on a missing `PersistenceGateway.assignRoute` method, not just deferred — so that's a scoped, actionable next step instead of a vague TODO.

CONSENSUS: YES

## Final Output

Chalkline is a real, wired-together Xcode project now: `Chalkline.xcodeproj` builds a `Chalkline` app target and a `ChalklineTests` unit test target out of 49 Swift files, targeting iOS 17+ Simulator. To run it: open `Chalkline.xcodeproj` in Xcode, pick an iPhone simulator, and hit run (or `xcodebuild -project Chalkline.xcodeproj -scheme Chalkline -destination 'platform=iOS Simulator,name=iPhone 16' build` from the CLI).

What it does: log a climbing attempt, record it live through `AVCaptureSession` with an on-screen framing guide or import a clip via `PHPickerViewController`, run it through `VNDetectHumanBodyPoseRequest` at a fixed low sample rate, and land on a review screen showing the pose trace overlaid on the clip with a visible confidence indicator — a real numeric efficiency score when the signal is stable, or an honest "trace only" view when it isn't, per the app's own documented fallback. Attempts persist through SwiftData (`Gym`/`Route`/`Attempt`/`Session`, with real relationships), and a lightweight inline comparison shows how the latest attempt on a route stacks up against the last one. Dark mode, VoiceOver labels, 44pt targets, and Dynamic Type scaling (including a real bug fix this round in the processing gauge) are in place throughout.

What's honestly still open, all logged in `KNOWN_LIMITATIONS.md`: the gym/route picker UI (blocked on one missing persistence method, otherwise ready to build), session goals/streaks, a dedicated side-by-side comparison screen, the widget, Live Activity, Siri intents, and training-plan generation — none of those were silently dropped, they're just not started. And the one thing I want to be straight about since this is the last iteration: everything here was built and cross-checked by hand and by an independent multi-file audit (zero mismatches found across four rounds), but no iteration of this pipeline ever had actual `xcodebuild` CLI access to confirm it compiles — that sandbox constraint held all four rounds. The code should compile; it hasn't been proven to. That's the very first thing to do with this repo in an environment that has real Xcode tooling.

**Build verification:** verified after 1 repair(s): compiled cleanly for the iOS Simulator

## Review

This is a final review, so my job is to write the go/no-go — not add another round of discussion.

The user advocate's round 1 assessment is right and there's nothing left to adjudicate: verification is now authoritative (xcodebuild confirmed a clean simulator compile after one repair — this isn't a hand-audit claim anymore, it's a real build result), the core differentiator (log → capture/import → Vision pose-trace → review with an honest efficiency-or-fallback signal) is genuinely built and matches the app's own invalidation criteria, and the deferred list was tracked honestly throughout rather than silently dropped. The one substantive gap worth elevating to a named follow-up rather than burying in the limitations file is that "route log" attempts aren't actually linked to routes yet — that's a real product/name mismatch, not cosmetic, and it's cheap to close (one persistence method + wiring an already-drafted picker).

CONSENSUS: YES

## Final Output

**Go.** Chalkline ships as a working local-first MVP that delivers its core promise.

**What was built:** SwiftData models (`Gym`/`Route`/`Attempt`/`Session`, real relationships) in a proper `Chalkline.xcodeproj` (app + unit test targets, iOS 17+ Simulator). Full loop: log an attempt → capture live via `AVCaptureSession` with a framing guide, or import via `PHPickerViewController` → `VNDetectHumanBodyPoseRequest` samples the clip at a fixed low rate → review screen with a coordinate-correct pose-trace overlay, visible confidence indicator, and either a real efficiency score or an honest "trace only" fallback when the signal isn't stable (per the spec's own invalidation criteria — respected, not faked). A lightweight inline latest-vs-previous comparison exists. Dark mode, VoiceOver labels, 44pt targets, Dynamic Type are in place across the built screens, including a real fix to a `ProcessingGauge` text-overflow bug at accessibility text sizes. Video is stored as file references in Documents, not blobs.

**Verification status:** VERIFIED — `xcodebuild` confirmed a clean compile for the iOS Simulator after one repair (a doubled group-path bug in `project.pbxproj`). This is a real compiler result, not a hand audit, and it supersedes the four prior rounds' "should compile but unproven" caveat.

**Prompt coverage:** Core v1 scope (route/attempt logging, video capture/import, pose-trace overlay with efficiency score or fallback, basic comparison) is built. Explicitly deferred and documented, not silently cut: widget, Live Activity, Siri/App Intents, training-plan generation, session goals/streaks, and a dedicated side-by-side comparison screen (only inline comparison exists today).

**Known limitations (launch-blocking-adjacent, not launch-blocking):**
1. **Route linking is incomplete** — attempts use free-text labels instead of a real `Route` relationship, because `PersistenceGateway` has no `assignRoute`-style method. For an app named and positioned around being a "route log," this is the most user-visible gap between promise and delivery. Top follow-up, concrete next step: add the persistence method, wire the already-drafted picker UI to it.
2. **Comparison view doesn't match the spec's paid-tier hook** — only inline latest-vs-previous exists, not the side-by-side comparison workflow named as a core monetization lever. Fine for MVP, but worth knowing the subscription story isn't demonstrated yet.
3. **No hands-on Simulator run** — compile success is confirmed, but nobody has tapped through the app on a running Simulator (permission prompts, PHPicker edge cases, real Vision confidence behavior on actual footage). This is the next concrete step before calling it launch-ready, not before calling it built.

**Top follow-ups, in order:** (1) route-attempt linking, (2) hands-on Simulator smoke test of the full loop, (3) session goals/streaks for retention, (4) dedicated comparison screen to support monetization, (5) widget/Live Activity/Siri/training-plans as later fast-follows — all already scoped in `KNOWN_LIMITATIONS.md`.

VERIFICATION: VERIFIED
