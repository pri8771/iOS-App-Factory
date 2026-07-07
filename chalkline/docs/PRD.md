# chalkline — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

That's a wrap on round 1. Codex laid down the full contract, and I (Claude) didn't push back on any of it substantively — I sharpened it with concrete triggers and closed a few loopholes that would otherwise let later phases drift. Both of us are reading this the same way: it's a single-app build (chalkline only, no re-running ideation, no coordinating live with the other two portfolio apps), the pose-estimation fallback is pre-authorized and needs an explicit, checkable trigger rather than being vague, and "MVP / priority 3" does not lower the design/accessibility bar set by the parent portfolio prompt — it only affects how much gets built, not how well. No open disagreement surfaced; my additions (storage ownership, comparison-view definition, accessibility approach for the trace view, non-goals on the iOS-native extras and training plans) are refinements the contract needs, not challenges to Codex's framing. Gemini didn't weigh in (CLI unavailable), so this is a two-way convergence, but nothing in Gemini's absence changes the shape of the decision.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (both speakers reproduced it in full) — this document is the source of truth for all later phases.

**Scope of this thread:** build exactly one app, Chalkline, to production-ready MVP quality, as already selected by the parent portfolio process. Do not re-run ideation, do not re-litigate app selection, do not treat sibling-app coordination as in-scope here.

**Hard requirements:**
- Local-first SwiftUI iOS app. SwiftData models for gyms, routes, attempts, sessions, with video references.
- Video capture or import for attempts; app owns storage lifecycle (copies into sandboxed storage, not a bare Photos reference) with a real, stated retention/compression default for the free tier.
- On-device Vision pose estimation sampled at a fixed low frame rate per clip.
- Movement-trace visualization is mandatory. Numeric efficiency score is conditional (see fallback rule below).
- Basic attempt comparison, with a concrete chosen definition (synced dual video, overlaid traces, or stat-delta table — the design phase must pick one, not leave it floating).
- Subscription gating: free = logging + capped analysis history; paid = unlimited history + comparison view + training-plan generation, genuinely gated (not cosmetic).
- Every reachable screen has empty/loading/success/error states.
- Accessibility bar from the parent prompt applies in full, including to the pose-trace view: it needs a textual/spoken equivalent of what the trace shows (e.g., a structured VoiceOver summary), not just an image label.
- Own project folder under /Users/pchordia/Documents/iOS-App-Factory, builds and runs standalone.

**Non-goals for v1:** CloudKit sync, gym-community sharing, full training-plan generation, Widget, Live Activity, and Siri App Intents are fast-follow / nice-to-have — attempted only if time allows, never blocking "done." No claim of lab-grade motion capture. No opaque AI number presented as fact.

**Fallback trigger (pre-authorized, not optional to invoke):** if Vision's joint-tracking confidence can't produce a stable, repeatable, confidence-weighted efficiency signal across typical gym lighting/framing, drop the numeric score from UI and export, ship movement-trace-only, and state this explicitly in the build transcript as a documented fact, not silently absorbed into leftover "efficiency score" copy.

**Production-readiness definition:** distinctive Chalkline visual identity actually applied everywhere (not a mood board); real SwiftData relationships supporting history/comparison; deterministic on-device capture-to-analysis flow that works offline end to end; subscription gate testable without guessing; retention/quota behavior implemented, not hand-waved; full state coverage and accessibility baseline on every screen. It does not require sync, community features, or training plans to be implemented.

**Decision rules for later phases:**
1. Fallback trigger above is pre-approved — no permission needed to invoke it, but it must be logged.
2. Anything that can't be done local-only and deterministically gets deferred to v2, not silently degraded.
3. Any change that weakens Chalkline's distinct visual identity or accessibility compliance is rejected unless it's the only feasible path, and that must be named as an explicit assumption.
4. Under budget pressure, prioritize direct technique-diagnosis value over cosmetic dashboards or extra content.
5. Any deviation from this contract must be stated as an explicit assumption with rationale — never quiet drift.

## Product Research

CONSENSUS: YES

## Final Output

Both Codex and Claude landed in the same place here — no real friction, just Claude adding sharper practical detail to Codex's framing. Gemini was unavailable again, so this is a two-way convergence, but nothing about that changes the shape of the conclusion.

**Audience and use context:** Frequent boulderers/sport climbers (roughly 1–5 sessions/week) who already track routes and attempts and care about technique quality, not just send/fail counts. The critical use-context detail: review almost always happens standing at the wall right after an attempt, phone usually isn't in-hand during the climb (it's propped, wedged, or held by a friend), and this audience already has muscle memory from an existing logging app or spreadsheet — so the boring CRUD (gym/route/attempt/grade) has to be as fast as their current habit or they bounce before ever reaching the pose-analysis payoff.

**Comparable apps/patterns to learn from:** Two different lineages worth borrowing from, not one. Route-logging apps (TheCrag/8a-style, Kaya, SendAG, Moon Board) set the bar for how fast logging metadata needs to feel. Sports-form-analysis tools (Coach's Eye, Hudl Technique, swing analyzers) set the bar for skeletal-overlay/scrubbing UX — and also telegraph the failure mode to expect: users in that category get frustrated fast when an overlay jitters or loses the subject, which is a real risk here given wall occlusion, sideways/overhang body orientation, and chalk dust reducing contrast. No existing climbing app does on-device pose-derived scoring, so the defensibility is real, but only if the tracking actually holds up.

**Platform-specific opportunities:** Local-first + fully offline is a genuine edge (gyms are often dead zones). A live camera framing guide with real-time overlay feedback (not a static graphic) is worth building well. Haptics tied to concrete state transitions (attempt captured, confidence too low → reshoot, comparison loaded) are cheap to do right and expensive to bolt on later, so they should be treated as interaction design from the start. The single most concrete platform insight from this round: since the climber can't touch the phone once climbing starts, capture needs a hands-free countdown/auto-stop flow, not just a record button — that's a real MVP requirement hiding inside "capture," not a nice-to-have.

**Major assumptions and risks (at least three, named explicitly):**
1. *Untested assumption:* nobody in this process has yet pointed Vision's body-pose estimation at real bouldering-gym footage (mixed fluorescent lighting, sideways/overhang framing, occlusion, chalk dust). This is the single biggest unknown the whole build sits on, and both speakers agree it should be spiked early and cheaply — before the rest of the capture-to-review pipeline is built — rather than assumed away.
2. *Assumption:* users tolerate short, low-friction capture/logging over deep configurability; anything that adds setup steps before the "after-set" moment risks losing the audience.
3. *Assumption:* a small number of explainable movement metrics (not raw skeleton coordinates, not one opaque aggregate score) is what makes the efficiency signal feel trustworthy rather than gimmicky — ties directly back to the fallback rule already locked in the contract.
4. *Risk:* the free/paid clip-retention cap is a tuning problem that needs a real number chosen early (something in the single digits per week was floated as a starting point), not left undefined until it's too late to matter.
5. *Risk:* a trace-heavy visual interface can silently fail accessibility unless translated into a structured spoken/textual equivalent — already required by the contract, but worth re-flagging as a build risk, not just a checkbox.

**Implications for the first build:** Prioritize a hands-free, confidence-aware capture flow and a fast CRUD logging loop as much as the pose feature itself — none of the analysis matters if users churn before or during capture. Run a small early spike of Vision pose estimation against realistic self-shot gym footage (varied angle, lighting, clothing) before investing further in the full pipeline, since that result determines whether the rest of the app talks about an "efficiency score" or ships trace-only per the pre-authorized fallback. Anchor the comparison view on one concrete definition to prevent scope drift — the Codex-proposed "two-attempt timeline comparison for the same route, synced scrubber, overlay path deltas, short per-phase summary" is a good, boundable starting candidate for the design phase to formally adopt or amend. Treat Widget/Live Activity/Siri intents as truly optional fast-follow, not core-loop dependencies, consistent with the contract's non-goals.

## Portfolio Selection

CONSENSUS: YES

## Final Output

Both Codex and Claude are in full agreement here, and it's a pretty clean call. This is a single-app thread, not a portfolio-parent execution: the routing header already fixes the selected app as `chalkline`, build priority 3 of 3, with a fully written spec — the "generate 8 ideas, pick 3" work from the parent portfolio prompt already happened upstream (presumably in the orchestrator that spawned this child thread and its two siblings). Re-running ideation or emitting a portfolio-json here would be scope drift, not thoroughness, so neither is produced.

Both speakers also independently checked for a subtler trap — whether Chalkline itself hides a multi-app split (e.g., a "route logger" app and a separate "technique coach" app) — and rejected it. The reasoning: the product's actual differentiator is attempt-over-attempt technique comparison anchored to a specific logged route, which only works if logging and pose analysis live in one app. Splitting them would produce a weaker product (a video player with a skeleton overlay, disconnected from route context), not a leaner one, and would also cut against the parent prompt's explicit requirement that each app be genuinely complex rather than a single-purpose utility. So: one app, one folder, no sibling split, no portfolio-json.

The one added-value point from this round (Claude's) is a success-metric framing to carry forward: the v1 UX target isn't just "pose estimation works," it's that the time from finishing an attempt to having a labeled, analyzed clip should be faster than the user's existing logging habit — meaning the capture/logging flow can't force meaningful pre-configuration (gym/route/grade/tags) before the camera opens. That's a product commitment for the design/architecture phases to respect, not a new decision for this phase to adjudicate.

No disagreement surfaced between the two speakers, and nothing here contradicts the prompt_contract or product_research decisions already locked in.

**Decision for this phase:**

- **Single-app vs. portfolio-parent:** Single-app. This thread builds exactly one app, Chalkline, in its own folder. No portfolio-json manifest is produced — sibling coordination and the 8-idea/3-app selection are out of scope for this thread and already resolved upstream.
- **Selected app:**
  - Slug: `chalkline`
  - Category: Climbing technique & route log with on-device movement analysis
  - Promise: Shows a climber exactly where their movement broke down on a route, not just what grade they sent.
  - Target user: Boulderers/sport climbers who climb several times a week and want technique improvement, not just send counts.
  - Build: `true`
- **Selection rationale:** App was pre-selected by the parent portfolio process; this thread's only job is to confirm it doesn't need further splitting. It doesn't — logging and pose analysis are one coherent product, not two.
- **Rejected alternative:** Splitting into a separate logging app and a separate analysis/coaching app — rejected because it would sever the route-anchored comparison that makes the product defensible, and would violate the "genuinely complex, not a single-purpose utility" requirement from the parent prompt.
- **Carried-forward constraint:** Fall-to-analyzed-clip speed is a first-class UX success metric for the design phase — the capture/logging flow must not require heavy pre-configuration before filming.

## Initial Discussion

CONSENSUS: YES

## Final Output

Codex and Claude both landed on the same core product shape, and Claude's design-lead pass mostly sharpened Codex's strategist framing rather than fighting it. Here's where things actually settled:

**The promise:** Chalkline lets a climber film an attempt at the wall and, within seconds, see where their movement broke down compared to their own history on that route — fully offline, on-device. Both agreed the headline can't hinge on "efficiency score" as a noun since that's conditional per the fallback rule; the promise has to hold true even in trace-only mode, so it's framed around "where it broke down," which both trace and score can serve.

**Primary user/scenario:** A frequent boulderer/sport climber, standing at the wall seconds after an attempt, phone propped nearby, chalk still on their hands — not sitting down to configure anything, deciding in real time whether to try again.

**Core loop:** open app → capture (hands-free, no required pre-selected route) → analysis runs in the background while the user recovers → review trace + confidence + (if stable) efficiency delta vs. last attempt on that route → quick tag/note → route/gym metadata attached now or later → repeat, with comparison unlocking once a second attempt on the same route exists.

**Where Claude added real decisions the group needed and didn't have yet:**
- Capture must never require a pre-selected route — route tagging is a fast post-capture step, not a gate, to honor the fall-to-analyzed-clip speed commitment from the portfolio_selection phase.
- Sessions are implicit/auto-scoped by gym visit, never a manual start/stop — streaks key off session-days.
- Comparison view degrades **per-pair**, not per-app: if either attempt in a comparison lacks a stable score, show trace-and-phase-summary only rather than a broken "62 vs —" stat.
- Retention caps only prune heavy artifacts (video, pose trace) — the lightweight attempt log row (route, grade, date, sent/fell, note) is permanent and never deleted by cap enforcement. This was flagged as protecting a more basic promise (the log) than the flashier one (pose analysis).
- Empty states must be actionable, not generic ("log a second attempt to unlock comparison," not "no data").
- Single-climber-per-clip only — multi-body detection is treated as low-confidence, not disambiguated.

**Hard scope boundaries (both agreed):** local-first SwiftData model (gyms/routes/sessions/attempts, owned video copies); trace always shown; numeric efficiency only when confidence-weighted and stable; gated subscription that's actually testable; no CloudKit, no community sharing, no full training-plan generation, no Widget/Live Activity/Siri in this pass; comparison is strictly two-attempt-same-route, not multi-attempt trend charts.

**Measurable success criteria:** route/attempt logging reachable in ≤2 taps with no forced pre-context; analysis targeted to complete before the user's next attempt (rather than a hard latency number, since device performance varies); all ~8 core screens (gym list, route detail, capture, processing, review, comparison, session/streak, settings/paywall) demonstrably have empty/loading/success/error states; retention/cap behavior independently verifiable in testing (media prunes, log rows survive).

**Named trade-off, not swept under the rug:** making capture route-optional and sessions implicit adds real modeling complexity — orphaned/unassigned attempts need a reconciliation flow ("attempts needing a route"), and that flow itself needs to be built with the same care as the primary path, not treated as a throwaway edge case.

No open disagreement between the two speakers. Gemini was unavailable again this round.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Codex and Claude ended up building the same brief from two different angles — Codex laid out the shape (why people pay, what the loop is, why it's defensible, how local-first and cloud-ready fit together) and Claude took every soft spot in that shape and nailed down a hard number or a firm design commitment. Nothing between them actually conflicts; Claude's additions sharpen Codex's framework rather than arguing with it.

**Target user & use case:** Boulderer/sport climber training 3-5x/week, roughly V3-V8 or 5.10-5.12 (below that band a phone-camera pose trace is mostly noise; above it climbers often already have a coach). The moment that matters is the 20-90 seconds after a fall or send — phone propped nearby, climber winded, deciding whether to rest or go again. Everything in the app is scaffolding around that single moment.

**Core loop:** Open app → tap capture immediately (no route required first) → hands-free countdown with a framing check that confirms a body is actually in frame *before* recording starts (catches bad setups before the attempt is wasted, not three minutes later) → auto-stop at a firm 45-second cap → background analysis at a fixed 6fps sample rate → review screen shows trace + confidence, and — this is the retention mechanic both agreed matters more than streaks — if this route already has 2+ prior attempts, the one-line delta ("hip drifted left again at the crux, same as attempt 3") surfaces proactively on the review screen itself, not buried in a separate comparison tab → two-tap route/grade/sent-or-fell tagging, always deferrable → repeat.

**Paid value, hard-gated:** Free tier keeps the log forever (every attempt row — route, grade, date, sent/fell, note — is permanent and never deleted by cap enforcement) but only the 5 most recent analyzed clips keep their video+trace; older ones get pruned to the log row only. Paid removes that ceiling, unlocks the two-attempt same-route comparison view (a real feature free users can see and hit a wall on, not a marketing screen), and unlocks training-plan generation as fast-follow. The 5-clip number is deliberately stingy — bites within a week and a half for the target user, tight enough to convert, loose enough to prove the payoff a few times first.

**Competitive wedge:** No climbing log does on-device pose-derived analysis, and no sports-form-analysis tool is route-anchored. The defensible claim is narrower and truer than "we have AI" — it's that attempt history and movement history are the same object, tied to a specific logged route, which requires both the data model and the on-device capability to exist together.

**Growth mechanism:** Niche-viral, not broad-viral — a shareable trace-overlay export clip (watermarked, visually unmistakable as Chalkline) that climbers post to gym Discords/Instagram, deliberately kept in the free tier since it's the acquisition channel. Both agreed this only helps if it looks good — a jittery, ugly export is worse than no export, so it either ships polished or doesn't ship in v1.

**Local-first / cloud-ready:** Everything — capture, analysis, storage, comparison, entitlement checks — has to work in airplane mode since gyms are frequently dead zones. SwiftData models gyms/routes/sessions/attempts with owned video copies and stable, non-reused UUIDs as primary keys now, specifically so a future CloudKit sync layer is additive rather than a rewrite.

**Named risk carried forward, not swept under:** real-world gym video (sideways framing, overhang, backlighting, baggy clothing) will produce low-confidence output for a meaningful share of attempts. Both speakers treat the pre-authorized fallback (trace-only, no fake number) as the correct response, and Claude's addition — an in-capture "can't see you clearly" check — is meant to catch this before the attempt is wasted, not just report it after the fact.

No open disagreement surfaced. Gemini was unavailable again this round, so this is a two-way convergence, same as every prior phase in this thread.

## Next Steps Small

CONSENSUS: YES

Round 2 actually closed the gap. Codex moved off "build basically the whole v1" and agreed to strip subscription/retention-cap enforcement down to a stubbed data-model flag only (no user-facing paywall), and to narrow comparison down to a lightweight "prior attempt exists" preview instead of a synced dual-scrubber. Claude moved off "cut hands-free capture entirely" and conceded the pre-record body-detection/framing guard belongs in slice one, plus agreed a max-duration auto-stop safety cap is fine as long as it's not the full polished walk-away ceremony. Both landed on the same shape for comparison (text-only, one-liner-per-attempt, no visual overlay alignment) and both now explicitly sequence a disposable pre-SwiftUI Vision spike against real gym footage as step zero, with the same kind of pass/fail bar (stable trace legibility + a human "does this match where the climber says it broke down" check) gating whether the rest of the slice ships scored or falls back to trace-only per the pre-authorized fallback. No open disagreement left on record.

## Final Output

**Step zero (gates everything else): the disposable Vision spike.** Before any SwiftUI gets written, run the exact 6fps on-device pose-sampling pipeline against 8-10 real self-shot gym clips covering the named risk conditions (sideways framing, overhang, mixed fluorescent lighting, baggy clothing, chalk-dusted hands, partial occlusion). Pass/fail bar: stable-trace confidence holds for a majority of sampled frames in at least 7 of 10 clips, **and** an independent viewer can point to roughly where the trace shows the movement breaking down and have it roughly match where the climber themselves would say the attempt fell apart, in at least 8 of 10 clips. If it fails, the pre-authorized fallback triggers immediately (trace-only, no numeric score) and the rest of the slice is built trace-only from the start — this is logged as fact, not treated as a setback.

**MVP slice (one complete workflow):** Manual-or-imported clip capture, with a pre-record framing/body-detection guard (if no body is found in frame, show a "reposition" state before recording proceeds) and an optional 45-second auto-stop safety cap → on-device Vision pose sampling at fixed 6fps → review screen showing the trace overlay (scrubbable/replayable) with a visible confidence indicator and one line of plain-English interpretive text tied to a point in the timeline (e.g., "left knee dropped mid-crux") → post-capture, non-blocking route tagging via free-text label → if a second attempt shares the same free-text route label, show a lightweight text-only comparison: the two attempts' one-line interpretations stacked, no synced scrubber, no visual overlay alignment.

**Must-have interactions:**
- Start capture/import in at most two taps, no required pre-selection of route or gym.
- Pre-record body-detection/framing check with an explicit "can't see you clearly, reposition" state.
- Manual record with optional 45s auto-stop cap (not the full hands-free countdown-and-walk-away flow).
- Background analysis with a real processing/loading state showing a confidence gauge, not a spinner.
- Review screen: trace overlay on scrubbable replay, confidence indicator, one-line interpretive text anchored to a timeline point.
- Post-capture free-text route tagging, always skippable.
- Text-only "prior attempt on this route" comparison preview when a second attempt shares the same route label.
- VoiceOver-accessible textual equivalents for the trace outcome and the comparison preview, not just image alt-labels.
- Full empty/loading/error/success states on every step of this flow.

**Cut list (explicitly deferred, not part of this slice):** subscription/paywall UI and entitlement gating (data model may carry a stubbed flag, but nothing user-visible enforces it yet); the 5-clip retention cap and pruning job; the full hands-free countdown/auto-stop "propped phone, walk away and climb" capture ceremony; synced dual-video scrubber comparison with overlay path deltas; gym/session data model and streaks; training-plan generation; Widget, Live Activity, Siri intents; social/share export; CloudKit sync; multi-body disambiguation; deep route taxonomy.

**Validation criteria:** Step-zero spike must produce a clear pass/fail verdict against the stated thresholds before SwiftUI work proceeds, and that verdict determines whether the built slice shows a score or is trace-only. The SwiftUI slice must complete end-to-end with zero required setup before recording; must never show a broken comparison state (e.g., pairing a stable-confidence attempt with a failed one silently) — if either attempt lacks a usable trace, the comparison preview says so rather than guessing; must handle "no prior attempt" as an actionable empty state, not a dead end; and the whole flow must be independently operable via VoiceOver, including getting the interpretive text and comparison preview read as structured text.

## Detailed Discussion

Looking at round 1: Codex laid out the direction (decision-grade feedback fast, zero pre-config, two-track trace/score signal, minimal per-pair comparison degradation, a concrete risk/edge-case list, and a privacy/storage stance), and Claude came in as skeptic with a long list of concrete gaps Codex's framing hadn't pinned down — permission-denial and interruption handling, exactly how free-text route matching works (normalization, what happens on a 3rd attempt, cross-gym name collisions), what happens when tracking is lost mid-clip (not just before recording), what the confidence indicator is actually computed from, making the step-zero spike's verdict an auditable artifact rather than a memory, import duration limits, disk-full handling, and a harder look at bystander privacy. None of this contradicts Codex — it's filling in exactly the kind of ambiguity this phase exists to close, and it's consistent with the phase playbook's required outputs. No actual disagreement surfaced.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- Zero required pre-configuration before recording; capture/import reachable in ≤2 taps from app open (reaffirms prior-phase commitment).
- Two-track signal model: a trace artifact always exists; a numeric score is shown only when a **defined, fixed confidence-aggregation formula** clears a stability threshold across the sampled frames. That formula must be pinned down (e.g., a weighted average favoring hip/knee/shoulder joints over face/wrist landmarks, computed per-frame then aggregated across the clip) **before** the step-zero Vision spike runs, since the spike's pass/fail verdict is only as meaningful as the formula behind it.
- The step-zero spike's outputs are a real artifact, not an asserted memory: the 8-10 source clips, their per-clip confidence numbers, and the human "does the trace match where the climber says it broke down" verdicts must be recorded and kept, so the fallback decision can be independently reviewed later.
- Comparison stays same-route, latest-vs-most-recent-prior-attempt only (not all priors, not a chart) — with route matched via a trim-and-lowercase-normalized free-text label. Comparison degrades **per pair**: if either attempt lacks usable confidence, show an explicit "no comparable segment confidence" message rather than a fake or partial stat.
- Cross-gym label collisions (e.g., "V4 overhang" logged at two different gyms matching each other) are a named, accepted MVP limitation, not a bug to silently paper over — it must be stated as fact in build documentation.
- Subscription/entitlement enforcement stays deferred (stubbed data-model flag only), consistent with next_steps_small; this phase doesn't reopen that.
- No microphone permission requested at all — pose analysis is video-only, so audio capture and its permission prompt are dropped entirely.

**Edge cases (to design/architecture explicitly, not discover mid-build)**
- No body detected in frame (pre-record guard blocks/warns); guard also has a false-positive failure mode (detects a bystander, not the actual climbing body) — name this as a known limitation of the guard, not a solved problem.
- Two people in frame → treated as low-confidence/ambiguous, no disambiguation attempted.
- Mid-clip tracking loss (climber moves out of frame, gets occluded by a hold or another climber) must render as a **visible gap** in the trace and confidence indicator — never silently interpolated as if motion were continuous.
- Very short clips (<1s), clips that never hit the auto-stop cap, oddly-transcoded or rotated imports.
- Imports need a duration ceiling with an explicit "clip too long, trim to your attempt" rejection/trim state — a 12-minute import must not be processed whole.
- Camera/photo-library permission denied → explicit state with a path to Settings, requested at point of use, not on launch.
- Active recording interrupted (call, notification) → discard the partial clip and return to the capture entry point with a clear message, rather than saving/analyzing a truncated attempt.
- Low storage / disk write failure during recording or save → explicit error state, not a swallowed exception.
- Concurrent/queued analysis (user starts a second capture while the first is still processing) must be allowed, not blocked, with a distinct "taking longer than usual" processing state for slower/thermally-throttled devices.
- Abrupt app backgrounding during analysis.
- Duplicate/ambiguous route labels beyond the normalization fix (visible "unresolved" state rather than silent auto-merge for anything normalization can't resolve).

**Data and privacy implications**
- All video and derived pose data stay on-device in this slice: no background upload, no analytics or crash-report attachments containing frame data.
- App owns storage (copies into sandbox) rather than holding bare Photos references for anything used in primary playback.
- Permission strings must be accurate and minimal: camera usage string only describes on-device pose analysis (no mention of audio, since mic is never requested); photo-library string covers import only.
- Bystander privacy is a named, accepted limitation: gym footage will often capture other people in the background with no consent mechanism, and this is disclosed as a real limitation the user is trusting the app (and themselves) to handle responsibly — not built-around in this slice.
- Storage grows unbounded during this slice since retention-cap enforcement is deferred; that's acceptable for now but must be logged as a known, temporary gap so it doesn't quietly become permanent.

**Risk register**
- Confidence bar looking fine on demo footage but failing on real attempts (sideways framing, overhang, poor light) — mitigated by the pre-authorized fallback (trace-only) and the in-capture framing/body-detection guard, but the guard's "a body" vs. "the climbing body" gap is a residual, named limitation, not a solved risk.
- Accessibility treated as decorative rather than core — mitigated by requiring a full spoken/textual result model (e.g., "attempt confidence high, breakdown near 62% duration: hips drifted left over the crux") producible from a single VoiceOver interaction, not just image alt-labels.
- Undocumented confidence-aggregation formula makes the step-zero spike's verdict unauditable — mitigated by fixing the formula before the spike runs and preserving the spike's raw data as an artifact.
- Ambiguous free-text matching silently breaking comparison for the user with no visible cause — mitigated by normalization (trim/lowercase) and by explicitly naming cross-gym collisions as a limitation rather than pretending the matching is semantically safe.
- Unbounded storage growth during this slice — accepted as a temporary, logged gap, not a silent permanent one.
- Bystander biometric-adjacent data with no consent flow — named as an explicit, accepted MVP limitation rather than solved or ignored.

**Final assumptions**
- This is a movement-technical niche app, not a habit-game/streak-first app; retention comes from the diagnostic value of the trace and comparison, not gamification.
- Entitlement/paywall enforcement is out of scope for this phase's decisions (already deferred by next_steps_small); this phase only confirms it stays stubbed.
- The confidence-aggregation formula and the spike's artifact-recording requirement are treated as prerequisites to running step zero, not optional refinements — the design/architecture phase inherits them as fixed inputs, not open questions.
- Cross-gym label collision and bystander-privacy limitations are accepted, documented MVP trade-offs, not defects to fix before ship.

## App Features

Both Codex and Claude landed on essentially the same feature set — where they differ is organizational, not substantive, and Claude flagged that gap explicitly rather than leaving it hidden. Codex tiered import-duration-ceiling, concurrent-analysis-queue, and the step-zero spike artifact as separate Should-have items; Claude argued those (plus disk-full and interruption handling) belong as edge-case behaviors *inside* the must-have capture/analysis features rather than as standalone bullets, precisely to stop the must-have list from re-growing into "basically the whole v1" under a new name. Codex didn't push back on that when it was raised (it came in the same round), so I'm treating it as resolved: same scope, folded structure. One genuine loose end: Codex's design-system-tokens item and the step-zero-spike-artifact don't have a clean home — tokens is really a design-phase deliverable, not a feature, and the spike was already locked as a build prerequisite in detailed_discussion, not a re-decidable "feature" of this phase. Neither speaker contradicts dropping both from this phase's Should-list on those grounds, so I'm resolving it that way rather than kicking it to round 2.

CONSENSUS: YES

## Final Output

**Must-have** (each ships with empty/loading/error/success states; acceptance criteria as stated):

1. **Capture/import entry, ≤2 taps, no required pre-selection.** AC: cold launch → one tap reaches capture or picker; no route/gym/grade field blocks the path.
2. **Pre-record body-detection/framing guard.** AC: empty wall → blocked "reposition" state; person in frame → recording enabled. Bystander-vs-climber false positive is a named, accepted limitation, not something this feature is expected to solve.
3. **Manual record with 45s auto-stop cap and interruption handling.** AC: call/notification mid-recording discards the clip and returns to capture entry with an explicit message — no silent save of a truncated attempt.
4. **Video import with duration ceiling and explicit "too long, trim" rejection state.** AC: 10+ minute import is rejected with actionable copy, never silently processed or truncated. (Folded into capture/import as edge-case behavior, not a separate screen.)
5. **On-device Vision pose sampling at fixed 6fps with a documented, fixed confidence-aggregation formula.** AC: identical input clip produces identical trace and confidence number on repeat runs — determinism is verifiable.
6. **Two-track output: trace always renders; numeric score only above the stability threshold; mid-clip tracking loss renders as a visible gap, never interpolated.** AC: a clip with the subject walking out of frame mid-attempt shows a visible break in the trace and suppresses the numeric score.
7. **Owned media storage** (copy into app sandbox, not a bare Photos reference) with disk-full/write-failure handled as a real, visible error state. AC: code path exists and is exercised under a simulated low-storage condition — this is the one must-have where "verified" means "code path exists and was exercised," not "reproduced on a real device," and that's named explicitly rather than papered over.
8. **Concurrent/queued analysis** when a second capture starts mid-processing, with a distinct "taking longer than usual" state. AC: two captures started back to back both complete; the UI never blocks the second.
9. **Review screen:** scrubbable trace overlay, confidence indicator, one line of plain-English interpretive text anchored to a timeline point, full VoiceOver-readable equivalent from a single interaction. AC: VoiceOver reads a structured sentence (confidence + interpretive point), not just an image alt-label.
10. **Post-capture, always-skippable route tagging** with trim/lowercase-normalized matching; cross-gym label collisions named as an accepted MVP limitation. AC: "Blue Crimpy " and "blue crimpy" match; skipping tagging never blocks save.
11. **Text-only comparison, latest-vs-most-recent-prior only, degrading per pair.** AC: a third attempt on the same label compares only against the second, not the first; if either side lacks usable confidence, the preview states so explicitly rather than showing a broken or fabricated stat.
12. **Camera/photo-library permission-denied states**, requested at point of use, with a working path to Settings. AC: deny permission at OS level → explicit in-app state with a functioning Settings link, no crash or silent failure.

**Should-have** (real value, app is still coherent without them — first to cut under time pressure):
- "Attempts needing a route" reconciliation view for orphaned/unlabeled attempts.
- Basic route list view showing distinct labels used so far.
- Light haptic feedback on capture-complete/analysis-complete transitions.
- Stubbed SwiftData entitlement flag (schema only, no UI, no enforcement) as cheap insurance against a later rewrite.

**Could-have** (optional polish, cut first):
- Trace-burned-in export of a single reviewed clip (deliberately deferred per per_app_product_brief's own "ships polished or not at all" rule).
- Light first-run onboarding explaining what the trace means.
- Settings screen beyond what's structurally required (may legitimately be absent — nothing to configure yet).

**Won't-build this pass:**
- Subscription/paywall UI and StoreKit entitlement enforcement.
- 5-clip retention cap and pruning job.
- Hands-free countdown/walk-away capture ceremony.
- Synced dual-video scrubber comparison with visual overlay alignment.
- Gym/session data model, streaks, session auto-scoping.
- Training-plan generation.
- Widget, Live Activity, Siri/App Intents.
- Social share/export beyond the deferred Could-have above.
- CloudKit sync, multi-body disambiguation, deep route taxonomy or gym hierarchy.

**Explicitly out of this phase's lists (already decided elsewhere, not re-litigated here):** the step-zero Vision spike (8-10 real clips, confidence numbers, human verdicts as an auditable artifact) is a build *prerequisite* locked in detailed_discussion, not a feature to prioritize; Chalkline's visual-identity tokens (color system, type scale, motion language) are the design phase's deliverable, applied across every must-have screen above, not a separate app_features line item.

**Biggest risk carried forward:** the product only works if the trace reads as understandable in real gym conditions, not just as technically-confident output — the fixed confidence formula, the auditable spike verdict, and the explicit trace-only downgrade are what stand between a trustworthy MVP and a misleading one, and nothing in this feature list is allowed to quietly soften that fallback contract.
