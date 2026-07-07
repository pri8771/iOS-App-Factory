# chalkline — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

Round 2 closed it. Codex explicitly conceded to Claude's flatter structure ("I'm with Claude on this one... eight-screen split is too close to a workflow tutorial"), and the remaining friction points got resolved as genuine syntheses rather than one side just winning:

- **Comparison-as-separate-screen** — Claude pointed out this wasn't actually an open design question, it was a drafting error that quietly reopened something already locked in `per_app_product_brief` (comparison has to surface inline in Review, not in a separate tab/peek screen). Codex didn't contest this once it was flagged — it's folded into the single Review surface now.
- **Processing screen vs. non-blocking background state** — this is the one place both sides actually moved. Codex wanted a real screen with a deterministic progress gauge; Claude worried that contradicted the earlier "analysis runs in the background while the user recovers" requirement. They landed on both being true at once: Processing is a real screen with the gauge/confidence build-up right after capture (because it's genuinely satisfying and useful to watch), but it's dismissible at any point without cancelling the work, and Home shows the same attempt card in an "analyzing" state whether the user stuck around or bailed immediately.
- **Route tagging as its own screen** — dropped in favor of an inline, skippable field at the bottom of Review with a lightweight chip-fill/haptic confirmation instead of a page transition; a save failure renders as an inline banner rather than needing its own screen to exist.
- **Recording/Import status** — settled as sub-states layered on the Capture screen itself (armed/recording/interrupted), with Import specifically riding in as a secondary sheet presentation (picker-open/importing/rejected-too-long) rather than a separate pushed destination.
- **Permissions** — a modal sheet reachable from either the Capture or Import failure path, not a persistent nav destination. Both agreed on this shape.

Net result: five real surfaces instead of eight, same full state coverage, no ambiguity left about who owns what. Gemini stayed unavailable again this round, so this is a two-way convergence, consistent with every other phase in this thread.

CONSENSUS: YES

## Final Output

**Screen inventory (five real surfaces):**
1. **Home** — reverse-chronological attempt feed with a persistent, thumb-reachable Capture control docked at the bottom (not a tab bar, not a floating button).
2. **Capture** — full-screen camera modal; live framing/body-detection guard is chrome on the same view, not a separate screen; Import is a secondary control that presents the system Photos picker as a sheet from here.
3. **Processing** — a real screen with a deterministic progress gauge and confidence build-up, reached right after recording stops or import completes; dismissible at any time (swipe-down/back) without cancelling analysis.
4. **Review** — one scrollable surface: playback + trace overlay, confidence/degradation indicator, one-line interpretive text anchored to a timeline point, inline prior-attempt comparison (or explicit "no comparable segment confidence" message), inline skippable route-label field.
5. **Permission-denied** — modal sheet, reachable from either the Capture or Import path, with a working Settings link.

**Primary flow:** Home (empty state has an actionable first sentence + the same Capture control they'll use forever) → tap Capture → guard evaluates the live feed continuously; blocked shows "can't see you clearly, reposition," ready enables record → manual record with a visible 45s auto-stop countdown, or switch to Import via the picker sheet (with too-long rejection handled in place) → interruption (call/notification) discards the clip and returns to Capture with one clear sentence, never a saved fragment → on stop, land on Processing (dismissible immediately; Home shows the same attempt card with an "analyzing" badge whether the user stayed or left) → tap the finished card → Review, with the comparison line and route tag both visible on the same surface, no further navigation required → done.

**State model per screen:**
- **Home:** empty (actionable copy + Capture control) / loading (near-instant, local SwiftData — treat as flash-safe, not a spinner opportunity) / populated (cards grouped by recency, "analyzing" badge on in-flight attempts) / error (store failed to load).
- **Capture:** guard-blocked / ready-to-record / recording (with visible countdown) / interrupted / permission-denied. Import sub-states layered on the same screen via sheet: picker-open / importing / rejected-too-long.
- **Processing:** running (progress gauge tied to sampled frame count + confidence band) / taking-longer-than-usual / complete-handoff. A genuine technical failure resolves to the same soft "trace-only, here's what we could tell you" outcome as low confidence, rather than a separate scary error screen — carried over from round 1 and never contested.
- **Review:** full-confidence / degraded-confidence-with-visible-gap / trace-only-no-score / no-prior-attempt-for-comparison (actionable: "log a second attempt on this route to see it compared") / prior-attempt-present-but-uncomparable (explicit sentence, never a fabricated stat) / route-tag inline confirm (chip fill + soft haptic) / route-tag save-error (inline banner).
- **Permission-denied:** single state — plain-language explanation of what's used (camera for capture, photos for import, never microphone) + Settings deep link.

**Visual direction:** The chalk-line motif is load-bearing, not a logo flourish — the capture framing guide and the Review trace overlay share the same taut, dusty line quality, but that texture stays confined to chrome, backgrounds, and transitions; it never appears inside the trace itself or behind body text, because the trace has to read as an instrument reading, not decoration, or it undermines the trust the whole product depends on. Route color-coding and confidence-state color-coding are two strictly separate hue systems that never overlap, so a glancing, winded user can't misread one for the other. Type pairs a bold condensed display face for headers/numbers with a plain humanist body face for the interpretive sentence and comparison text, since that sentence is the actual product and can't fight a stylized typeface for legibility. Haptics are tied only to real state transitions — body detected, auto-stop triggered, analysis complete, comparison unlocked — never decorative taps.

**Accessibility notes:** Every Capture control (record, stop, switch to import) needs a real 44pt target regardless of how chrome is styled over the live camera feed. Dynamic Type must be tested specifically against the bold display face, since condensed/energetic type scales are where truncation and overlap bugs hide at larger accessibility sizes. VoiceOver reading order on Review is deliberate: confidence state first, then the interpretive sentence, then the comparison line — so a VoiceOver user knows immediately whether what they're about to hear is trustworthy or degraded, without having to explore the screen to find out.

## Design Handoff

Round two actually closed the loop. Codex delivered the full screen-by-screen spec exactly against the locked five-surface architecture, explicitly conceded the PHPicker point ("photo permission UX is camera-first... aligning with the engineering correction"), and already moved toward tightening the Claude Design prompt to exclude data-driven surfaces — landing very close to what Claude was asking for. Claude's round-2 pass didn't reopen the architecture at all; it did a line-by-line audit of Codex's own deliverable and caught real, concrete problems that needed fixing before this could ship as final:

- **A genuine bug hiding in the token list**: `confidenceHigh` (#38D39A) and `accentRouteMint` (#32D4A9) are close enough to be indistinguishable at a glance — exactly the failure mode the design phase built a rule to prevent. Fix: move confidence onto a cool-to-warm (blue→amber→red) axis, keep route colors in their own saturated rainbow, zero overlap in hue or lightness.
- **Custom display fonts (Space Grotesk/Bebas Neue) traded for system fonts** at heavy/black weight with tight tracking — same "gym signage" energy, but with Dynamic Type correctness for free and no licensing/binary-bloat risk, which matches the project's own "no dependency unless it materially reduces risk" rule.
- **PHPicker photo-permission state formally cut** — not just deprioritized, actually removed as a state, since it's not something iOS can ever trigger if Import is built correctly. Permission sheet becomes camera-only.
- **Delete and retake, which snuck into Codex's Review action row without being named anywhere in `app_features`**, get scoped properly: delete requires a real confirm-before-destroy alert (it's irreversible against locally-owned video), retake just returns to Capture without touching the already-saved attempt.
- **A real gap in the Processing recovery story**: if the app is actually killed (not just backgrounded) mid-analysis, the in-memory queue is gone and any attempt stuck in `.analyzing` would stay broken forever with nothing watching it. Fix: a cold-launch reconciliation sweep that resubmits any orphaned `.analyzing` attempt to the queue before Home paints its populated state — cheap because the pipeline is fast and idempotent, and necessary because "the log never breaks" was the one promise this app can't compromise on.
- **The Claude Design prompt got its final shape**: two prompts, not one. Prompt A goes external for genuinely static stuff — app icon, empty-state art, viewfinder chrome, token/mood exploration. Prompt B isn't external at all — the trace canvas, confidence badge/rail, comparison row, and processing gauge get built directly in SwiftUI against a fabricated-but-realistic reference dataset (timestamped joint points with an intentional tracking gap, a confidence curve that dips and recovers), so those trust-critical surfaces are designed in the medium they'll ship in, not mocked as static illustrations disconnected from what real Vision output looks like.

None of this contradicts anything Codex put down — it's the same kind of fact-check-and-tighten pass Claude ran in round one, and Codex had already moved in the same direction on the two live disputes (PHPicker, prompt scope) before Claude's message even landed. Gemini stayed unavailable for the whole phase.

CONSENSUS: YES

## Final Output

### Screen-by-screen specification (five surfaces, unchanged from `design_discussion`, now fully detailed)

**1. Home** — reverse-chronological attempt feed, persistent thumb-reachable Capture bar docked at the bottom (never a tab bar, never a floating button).
- Components: hero/status headline, last-route summary chip, `AttemptCard` list (timestamp, route label or "No label yet," status chip [analyzed / analyzing / trace-only / uncomparable], confidence badge, mini scrub-point preview).
- States: **empty** (operational copy — "Record your next attempt now, no setup needed" — plus the same Capture control used forever); **loading** (brief flash-safe skeleton, never a spinner, and this is also where the cold-launch reconciliation sweep runs — see Processing below); **populated** (recent attempts, one-tap into Review or Processing); **error** ("attempts not loading" + retry, without blocking Capture).
- Motion: short stagger on row appearance, only when content actually changes.
- Any in-flight attempt shows a live "Analyzing" badge and is tappable into Processing or Review depending on completion.

**2. Capture** — one full-screen camera view; armed/blocked/recording/interrupted/permission-denied are chrome variants of the same view, not separate screens.
- Continuous (not one-shot) framing guard: green = ready, amber = "can't see you clearly," red = concrete action text ("step back," "move phone lower," "wait for cleaner frame").
- Import rides in as a sheet from Capture with its own inline sub-states: picker-open, importing, rejected-too-long (with trim guidance).
- Manual record, visible 45s countdown, auto-stop haptic fires only at the actual stop transition.
- Interruption (call/notification) discards the clip and returns to Capture with an explicit sentence and retry path — never a saved fragment.
- Permission-denied is **camera-only**. Photo-library denial is not a reachable state — `PHPickerViewController`'s out-of-process default never triggers a library prompt, so that state is formally cut, not just deprioritized. Import failures get a generic "import unavailable" fallback message instead.

**3. Processing** — real screen, deterministic frame-count progress + confidence trend, reached automatically after stop/import.
- Ownership: analysis lives in a shared `@Observable` analysis-queue service that outlives the view — dismissing/swiping away never cancels the work. Home reflects the same in-flight state via the "Analyzing" badge regardless of whether the user stayed.
- A second capture while one is processing enters a visible queued/"taking longer than usual" state rather than faking true parallelism on a phone about to thermal-throttle.
- Technical failure resolves to the same trust-first outcome as low confidence ("trace available, score unavailable") — never a dead-end error screen.
- **Crash/kill recovery**: on cold launch, before Home paints its populated state, any `Attempt` still marked `.analyzing` with no live task gets silently resubmitted to the queue from scratch (the pipeline is fast and idempotent against the stored video, so no partial-resume logic is needed). This closes the "abrupt app termination during analysis" edge case named back in `detailed_discussion` — without it, orphaned attempts would stay permanently stuck, which would break the one promise (the log survives everything) that isn't allowed to bend.

**4. Review** — one scrollable surface, fixed order every time: playback + trace overlay → confidence/degradation strip → one-line interpretation anchored to a timeline point → inline prior-attempt comparison (or explicit "no comparable segment confidence") → inline skippable route-label field → actions (retake / delete / share-later, deferred).
- Trace rule, precisely specified: draw a normal connecting line between consecutive valid 6fps samples (that's expected sparsity, not loss); render a visible break only when 2+ *consecutive* samples come back unusable or below the confidence threshold. This distinction is load-bearing — without it every clip looks shattered by normal sampling.
- Score suppressed below the stability threshold; "no prior attempt" gets an actionable row ("add/confirm a label to unlock comparison"); uncomparable pairs get an explicit sentence, never a fabricated delta.
- **Retake** routes back to Capture without touching the saved attempt. **Delete** is a distinct, confirm-before-destroy action (plain alert: "Delete this attempt? This can't be undone.") that removes both the SwiftData row and the sandboxed video file — never bundled into a casual action row.

**5. Permission-denied** — modal sheet, camera-only, single purpose: plain-language usage statement + Settings deep link. No branching copy, no photo-library case.

### Design tokens / visual system

- **Two fully separate hue systems, verified non-overlapping**: route colors stay in a saturated, playful set (blue/orange/mint/violet); confidence moves onto a cool-to-warm axis (trustworthy = cool blue-green, degraded = amber, low = red) chosen specifically so it can't visually collide with any route hue or lightness band — this replaces the original token set, which had a real collision between `confidenceHigh` and `accentRouteMint`.
- **Confidence signal is color + shape/icon paired**, never hue alone, for colorblind accessibility (filled / hatched / broken-line glyph alongside the word).
- **Type: system fonts only**, no bundled custom faces. Heavy/black weight with tight tracking for display (headers, numerals, timeline labels); regular weight for body/interpretive/comparison text. This trade — dropping Space Grotesk/Bebas Neue/Inter/Manrope — buys automatic Dynamic Type correctness and removes licensing/binary-bloat risk for a visual difference that's marginal next to what heavy system type already delivers, consistent with the project's own no-unnecessary-dependency rule.
- **Spacing**: 4/8/12/16/24/32 base grid. **Corners**: cards at 16, media/control modules at 12.
- **Motion/haptics**: short stiff spring for state-confirming transitions; haptics restricted to four real state transitions only — body-detected-ready, auto-stop-triggered, analysis-complete, comparison-line-appearing. Nothing decorative.

### Component inventory

`AttemptCard` (with analyzing badge), `CaptureOverlayViewfinder` (continuous body-detection halo + action text), `RecordControl` (44pt hit target independent of visual glyph size), `ProcessingGauge` (frame progress + confidence band + queue state), `TraceCanvas` (6fps polyline with the precise 2+-consecutive-sample gap rule baked in, not left to styling), `ConfidenceBadge`/`ConfidenceRail` (color+shape pair), `BreakdownCallout` (anchored interpretive sentence), `ComparisonInlineRow` (has-delta / no-prior / uncomparable), `RouteTagFieldInline` (trim+lowercase normalize, chip-fill confirm), `PermissionSheet` (camera-only), plus a `DeleteConfirmationAlert` and a `ReconciliationSweep` service (not a view — runs at cold launch against orphaned `.analyzing` attempts).

### State and interaction notes (architecture-level, non-negotiable)

- Analysis is owned by a shared `@Observable` queue service, never by `.task {}` on the Processing view — dismissal must never cancel work.
- Two separate detection code paths: a throttled live body-check for the Capture guard vs. the deterministic once-run 6fps analysis pipeline over the finished asset — never reuse one for the other, or determinism breaks.
- Video stored as a relative path rooted in the app's Application Support container, never an absolute URL (sandbox paths change across reinstalls/updates).
- Cold-launch reconciliation resubmits orphaned `.analyzing` attempts before Home renders populated state.
- Comparison and route-tag stay inline in Review, no separate screens, no extra taps — reaffirmed, not reopened.

### Accessibility requirements

- All Capture/Review controls 44pt minimum regardless of visual chrome over the live camera feed.
- WCAG AA contrast on every state, including with the corrected (non-colliding) confidence ramp.
- VoiceOver reads Review as one custom, code-built sentence (not `.accessibilityElement(children: .combine)`, which can't guarantee order): confidence state → interpretive sentence → comparison line.
- Dynamic Type stress-tested at accessibility XXXL specifically against the display-weight system font, since that's where truncation bugs surface first.
- State text always exists as real text labels, never icon-only.

### Claude Design plan — two prompts, split by what's actually static

**Prompt A (external, to Claude Design)**: "Design Chalkline's static visual identity: app icon, Home empty-state illustration, chalk-dust chrome treatment for the Capture viewfinder frame, and token/mood exploration for the corrected palette (separate route-hue and confidence-hue systems, system-font type pairing at heavy/regular weight). Bold gym-signage identity, premium and legible, not a fitness-tracker template. Do not design the trace overlay, confidence badge, comparison row, or processing gauge — those are data-driven and rendered live in SwiftUI, not static mockups."

**Prompt B — no external tool.** TraceCanvas, ConfidenceBadge/Rail, ComparisonInlineRow, and ProcessingGauge get built and visually tuned directly in SwiftUI against a fabricated-but-realistic reference dataset (timestamped joint points with a deliberate 2-sample tracking gap mid-clip, plus a confidence trajectory that dips and recovers) — so the surfaces that carry the app's trust are designed in the medium they ship in, against data shaped like real Vision output, not as a disconnected Figma illustration of a skeleton overlay.

## Ios Architecture Review

Round four closed it. Codex fully backed Claude's argument for keeping four attempt statuses instead of five — "more states = more failure modes" — and added a clean refinement: track any transient in-memory retry/queue intent inside the `AnalysisQueue` actor itself (`.running`/`.queued`/`.retryingInMemory`) rather than persisting it, so the UI can still show "taking longer than usual" without polluting the SwiftData schema. Codex also tightened one more thing everyone accepted without friction: "importing" isn't its own persisted attempt status — it's a capture-flow substate, and the attempt only becomes `.analyzing` once the asset is actually written to sandbox and queued.

Claude then closed the loop by pressure-testing the one thing that could've revived the fifth-status argument (showing users a distinct "suspended" badge) and showing it doesn't apply — the only time a human could observe that distinction is while the app is backgrounded, i.e. never, since the reconciliation sweep already resolves it before Home repaints. Claude also named one residual edge case explicitly rather than building machinery for it: pathological rapid background/foreground cycling that could theoretically starve analysis forever — accepted as an extremely unlikely limitation, not engineered around, consistent with how this thread has always handled long-tail edge cases (cross-gym collisions, bystander privacy).

Nothing here contradicts anything settled in earlier rounds, and every open thread is now nailed down with a specific, buildable answer. Gemini stayed unavailable the whole phase.

CONSENSUS: YES

## Final Output

**SwiftUI architecture:** Single-window app (`WindowGroup` rooted at Home), no tab bar. Capture is a `fullScreenCover` (its own camera-session lifecycle), Processing/Review reached via push navigation, Permission-denied a `.sheet`. Two long-lived `@Observable` services injected at the app root: `AnalysisQueue` (an actor holding job state, producing plain `PoseAnalysisResult` value objects — never touches SwiftData directly) and a view-scoped `CaptureGuardController` for the throttled live body-detection loop (fine to die with the Capture view, unlike the queue). Everything else is `@Query`-driven from SwiftData plus ordinary `@State`. Only a `@MainActor` persistence gateway writes `Attempt` fields — Vision/sampling math always happens off-main as pure value types first.

**Apple frameworks:** SwiftUI, SwiftData, AVFoundation (video-only `AVCaptureSession`, enforced in code — no audio input path, ever), `PHPickerViewController` for import (no photo-library permission needed), Vision (`VNDetectHumanBodyPoseRequest`) via two genuinely separate call sites — a throttled live check for the Capture guard and the deterministic once-run 6fps offline pipeline — never shared, or determinism breaks. `UINotificationFeedbackGenerator`/`UIImpactFeedbackGenerator` for the four locked haptic events. No ARKit (there's no AR surface in this app — pose estimation over recorded video is a Vision task). `beginBackgroundTask` at analysis start.

**Persistence/local data plan:** `Attempt`-only schema — no `Gym`, `Route`, or `Session` tables this pass (explicitly reversing Codex's earlier proposal; those were named in `app_features`'s Won't-build list and the whole route-matching design already relies on free-text label normalization, not referential identity). `Attempt` carries: `id` (UUID), `createdAt`, `attemptOutcome` (sent/fell/other), `source` (recorded/imported), `routeLabelRaw`/`routeLabelNormalized`, `videoRelativePath` (rooted at Application Support via a canonicalized path helper — never an absolute URL), `status` (exactly four cases: `.recording/.analyzing/.analyzed/.analysisFailed`), plus cached analysis outputs (`analysisScore`, `isScoreStable`, `overallConfidence`, `summaryText`) so Review never recomputes on open. Pose-sample/trace data lives in a linked blob or child entity, persisted once at analysis time. Versioned-schema/migration-plan scaffolding (`VersionedSchema`/`SchemaMigrationPlan`) starts now even with nothing to migrate yet, since that's what makes deferring `Gym`/`Route`/`Session` safe rather than risky. Recovery model: a single trigger — any `Attempt` still `.analyzing` with no live task in the `AnalysisQueue` — checked at cold launch and app-foreground, before Home paints its populated state. No fifth "queuedForRetry" status; transient queue/retry intent is tracked only in-memory inside the queue actor.

**Permissions/privacy plan:** `NSCameraUsageDescription` only (on-device pose analysis, no audio mentioned since none is requested). No microphone permission, no photo-library permission (confirmed via PHPicker's out-of-process behavior). Capture interruption (calls, notifications) driven by real `AVCaptureSession.wasInterruptedNotification`/`interruptionEndedNotification` hooks, not `scenePhase` heuristics. `PrivacyInfo.xcprivacy` manifest required from day one given the app's constant use of file-timestamp/disk-space APIs — a submission blocker if skipped, not optional polish. Bystander privacy remains a named, accepted MVP limitation (carried unchanged from `detailed_discussion`).

**Dependency/license decision:** Zero third-party dependencies. First-party frameworks only (SwiftUI, SwiftData, AVFoundation, Vision, PhotosUI, StoreKit not even touched yet). This fully satisfies the permissive-dependency policy by having nothing to evaluate.

**StoreKit/entitlement:** `@AppStorage("isPro")` wrapped in a single `EntitlementService` exposing `canUseComparison` (hardcoded `true` — comparison ships ungated this pass) and `canStoreUnlimitedHistory` (reads the flag). No SwiftData entity, no StoreKit code, no paywall UI — genuinely nothing else to build here.

**Testing implications:** Pure-function unit tests (no device/simulator dependency) for route-label normalization, frame-gap detection (single missing sample = no break, two-plus consecutive = break, boundary cases at clip start/end, all-low-confidence-but-continuous-trace), and confidence aggregation. A determinism regression test that runs a fixture through the pipeline twice and asserts identical output. Explicit, named device-only acceptance lane for anything Simulator structurally can't exercise: camera capture, the live body-detection guard, real Vision accuracy against gym footage, thermal/concurrent-analysis behavior, and interruption handling — tests passing above the AVFoundation/Vision boundary are not proof the capture flow works, only that the math does.

## Tech Specs

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Project Plan

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Implementation Readiness Gate

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
