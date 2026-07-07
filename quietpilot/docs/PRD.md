# quietpilot — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Alright, wrapping up round 1 for this phase.

Both Codex and Claude landed on essentially the same contract, and Gemini didn't get a vote in (CLI unavailable). The two perspectives are complementary rather than contradictory: Codex framed the product philosophy ("predictability under uncertainty," not "noise elimination") and laid out the hard requirements/non-goals/decision-rules skeleton; Claude took that skeleton and stress-tested it, adding concrete, checkable acceptance bars so later phases can't quietly build something easier than what was promised. No disagreement between them — Claude's additions sharpen Codex's contract rather than fight it.

Key things that got nailed down together:
- The scheduling-negotiation loop is the differentiator and the hardest part — it needs a concrete "is this real" test (proposes a block, shows reasoning, accepts/rejects/re-proposes), and if it can't clear that bar, the app must fall back to diagnostic-only framing per the spec's own invalidation clause.
- "Spectral clustering" must produce actual multi-feature analysis and multi-bucket clustering, not a dressed-up decibel average.
- Mic capture is a hard trust boundary: explicit start/stop only, no background listening, raw audio deleted immediately post-extraction, nothing lingering on disk.
- The named iOS features (BGAppRefreshTask, widget, App Intents, haptics, notifications) are required v1 behavior, not stubs — and where something like background refresh can't be reliably demonstrated in dev, that limitation must be stated explicitly rather than silently claimed as working.
- Free/paid gating (1 room vs. unlimited) must actually be enforced in code, not just shown on a pricing screen.
- Calendar integration is assumed to mean real EventKit access (read + propose, no silent writes) since a fake internal calendar would gut the core promise — this is flagged as a named assumption, not a silent substitution.
- Non-goals are locked: no CloudKit/cloud sync yet, no team/multi-person analytics in v1, no LLM, no re-litigating the portfolio-level app selection, no bundling with sibling apps' folders.
- Production-ready means every core workflow has real empty/loading/success/error states, the privacy model is demonstrable, the paywall is enforced, and any spec item that couldn't be made fully real gets called out by name rather than glossed over.

This is genuine convergence — Claude's round wasn't a challenge to Codex's contract, it was operationalizing it.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (QuietPilot MVP spec, full detail retained — acoustic-aware focus scheduling app, portfolio child of multi-app-exp5).

**Hard requirements:**
1. Local persistence models for rooms, sessions, noise-pattern clusters, and calendar-linked focus blocks.
2. Explicit, unmistakable start/stop capture UX — no background/passive listening; raw audio deleted immediately after on-device feature extraction; nothing but derived features ever persisted.
3. Feature extraction must go beyond a single loudness scalar (multiple spectral features per window); clustering must produce genuinely distinct pattern buckets per room, not one averaged bucket dressed up as "clusters."
4. Readiness scoring for a given time window, including recency weighting and explicit uncertainty/confidence.
5. One real calendar-aware focus-block negotiation flow: propose a window with visible reasoning, let the user accept/reject/shift, re-propose on rejection. Calendar integration assumed to mean real EventKit (read + propose only, no silent writes) — this is a named assumption.
6. If negotiation confidence can't clear a real-usefulness bar, the app must fail forward into an explicitly labeled room-diagnostic mode rather than fake a scheduler (per the spec's own invalidation criteria).
7. v1 iOS-native features must all have real behavior: BGAppRefreshTask nightly recompute, Home/Lock Screen widget, App Intents/Shortcuts start-stop, haptics on threshold crossings, local notifications for negotiated windows — any that can't be verifiably demonstrated in dev must be named as a known limitation.
8. Free/paid gating (1 room free vs. unlimited paid, etc.) enforced in actual code, not just displayed.
9. Every screen has real empty/loading/success/error states.
10. Distinctive, restrained "muted steel-and-aurora" design system, actually implemented, not stock SwiftUI defaults.
11. One folder for this app under /Users/pchordia/Documents/iOS-App-Factory, with a full phase-transcript trail.

**Non-goals:** no CloudKit/cloud sync in this build (future roadmap only); no team/shared-space/multi-person analytics in v1; no LLM use of any kind; no cloud audio processing/upload; no re-running portfolio-level app ideation/selection (quietpilot is already chosen); no bundling with sibling portfolio apps' folders or code; no placeholder/mocked primary-screen content.

**Production-readiness definition:** all five core workflows (capture, profile building, readiness scoring, negotiate-schedule, trend/before-after comparison) work end-to-end locally with real logic and full UI states; privacy/mic model is airtight and demonstrable; paywall gate is enforced; app builds/runs without crashing across the core flow; any spec item not fully achievable in this pass is explicitly named as a limitation rather than silently omitted or faked.

**Decision rules for later phases:**
- Privacy vs. features conflict → privacy and explicit user control wins.
- Data quality/confidence too low to support a scheduling claim → downgrade to diagnostic mode and surface uncertainty, don't overclaim.
- Design vs. feature-speed conflict → protect design-system fidelity.
- Scope conflict → fewer features that fully work beats more features that look done but aren't.
- Any deviation from the spec's stated v1 scope, iOS-feature list, or subscription gating must be flagged as a named assumption in that phase's output, never silently absorbed.

## Product Research

CONSENSUS: YES

## Final Output

Both Codex and Claude converged on the same picture from different angles — Codex nailed the positioning and platform read, Claude filled in the audience texture and the risk list — and nothing between them contradicts.

**Who this is actually for:** Not "anyone bothered by noise," but people who've already tried to protect focus time and keep losing — remote workers/students/podcasters in shared apartments, open-plan homes, dorms, shared offices. They're calendar-literate, have already tried headphones/white-noise/DND and hit a ceiling, and are specifically burned by not knowing *in advance* which hours are safe. This audience has low tolerance for extra overhead and zero tolerance for anything that feels like ambient surveillance, so the explicit, deliberate, calm tone isn't just branding — it's a retention requirement.

**Comparable apps/patterns to learn from, not copy:**
- Decibel meters (Decibel X, SoundMeter) set a "point and get instant number" expectation — QuietPilot's slower, multi-session capture model has to visibly justify itself ("building a profile," not "measuring right now") or it just reads as a worse decibel meter.
- Masking apps (Noisli, myNoise, Endel) train the reflex "cover the noise," which is the opposite of "schedule around the noise" — a real positioning asset, but it means QuietPilot has to earn its way into a reflex users don't currently have.
- AI calendar/time-blocking tools (Reclaim, Motion, Clockwise) already set the bar for what "negotiate my schedule" means — propose, defend, re-propose on conflict. If QuietPilot's negotiation loop is weaker than a plain time-blocking tool's, it feels like a regression, not an innovation.
- Focus timers (Forest, Flora) set the UX bar for what a short logged "session" should feel like — fast, satisfying, rewarding — which the acoustic capture session currently has no analog for and should borrow from.
- Health apps' "confidence + trend + action" presentation is the right model for how to visually handle uncertainty, since honest uncertainty framing is a UX problem, not just a stats footnote.

**Platform opportunities for the first build:** EventKit-backed negotiation is the credibility centerpiece (real calendar, read + propose, no silent writes). Widgets are the "at a glance" contract (current score + next proposed window). App Intents/Shortcuts matter less as a checkbox and more as a friction-reducer — every entry point that shortens "I want to log a session" to "session is logging" directly protects data volume, which the whole compounding-value thesis depends on. BGAppRefreshTask should be framed as best-effort nightly refresh with graceful degradation, not something to rely on for a demo. Live Activities/Dynamic Island for an in-progress capture or active focus block was raised as a strong conceptual fit but is explicitly *not* in the locked v1 feature list — flagged as a candidate for the design/architecture phase to accept or reject, not assumed in.

**Risks and assumptions, named rather than hidden:**
1. Signal stability — it's unproven whether spectral clustering signal is stable enough across real rooms with realistically small session counts (3-10 sessions early on) to support genuinely useful proposals; clustering needs a documented minimum-sample floor below which the app admits low confidence instead of asserting distinct buckets.
2. Sustained capture behavior — the entire model depends on users actually doing repeated short sessions; if capture has any real friction, data starves and every downstream number degrades quietly.
3. Calendar edge cases aren't edge cases — denied EventKit permission, fully-booked calendars, zero free slots are common cases, each needing its own honest UI response, not a silent failure or a proposal collision with existing events.
4. Cold start — every room starts with no data, so the "building your profile" / low-confidence state is what most new users will actually see for their first week or two, and needs the same design investment as the happy path, not a bolt-on empty state.
5. Mic permission denial needs a real, non-dead-end UI path, since "explicit start/stop" as a trust story is meaningless if denial just silently fails.
6. BGAppRefreshTask is unverifiable in dev/simulator by nature — the build needs an independent manual "recompute now" trigger so the actual recompute logic is demoable regardless of background scheduling luck.

**Implications for the first build:** cold-start/low-confidence states get first-class design effort, not leftovers. The negotiation flow's visible reasoning ("proposing 2-4pm because your last 6 sessions here were quiet weekday afternoons") is a testable UI requirement, not flavor text — it's literally what separates this from a generic calendar suggestion, and it must not get silently stripped later. Clustering gets a named minimum-sample threshold decided explicitly in the architecture phase. And a manual recompute action ships independent of BGAppRefreshTask, both for demoability and because it gives users agency right after a real-world change (moved desk, added a rug).

## Portfolio Selection

CONSENSUS: YES

## Final Output

The quality gate caught a real gap in round 1 — we'd made the right call (single-app, no portfolio split) but skipped the actual required-output checklist item: a concrete selected-app record. Round 2 closes that cleanly, with Codex and Claude in full agreement and nothing left in dispute.

**Decision: single-app run for quietpilot. No portfolio split, no portfolio-json manifest.**

This session builds one app because the prompt is an explicit child handoff (`PORTFOLIO_CHILD_PROJECT: true`, `Parent portfolio: multi-app-exp5`, `Selected app slug: quietpilot`) — the 3-app selection and 8-idea ideation already happened at the parent level. Re-running that here would risk contradicting whatever the parent and sibling sessions already locked in, and isn't this session's decision to make.

**Selected app record (required output, now complete):**
- **slug:** quietpilot
- **category:** Acoustic-aware focus scheduling
- **promise:** Learns how your real environments actually sound and negotiates your daily focus blocks around them instead of just measuring decibels once.
- **target user:** Remote workers, students, and podcasters in shared or noise-variable spaces (open-plan homes, shared offices, apartments) who need predictable deep-work time.
- **build:** true

**Rejected alternatives, named explicitly:** (1) running a fresh portfolio-wide candidate generation — rejected because the parent already selected; (2) considering alternate app concepts in this session — rejected because changing the selection here would violate the child-handoff contract.

**Why no portfolio-json:** there's no fresh selection to enumerate — this is a single confirmed app, not a portfolio parent producing siblings, so a manifest would misrepresent what actually happened in this session.

**One clarification locked in for later phases:** `build: true` means quietpilot is being built in this session, full stop. It is *not* a claim that the scheduling-negotiation loop will ship at full ambition — if that loop can't clear the real-usefulness bar established in the prompt-contract phase, the correct response is the invalidation clause (fail forward to diagnostic-only mode, still built, just narrower), not a build=false outcome. Those are different questions and shouldn't get conflated downstream.

Output stays as one folder: `/Users/pchordia/Documents/iOS-App-Factory/quietpilot`.

No disagreement left open — ready to move to the next phase.

## Initial Discussion

Here's where this round landed: Codex and Claude are telling the same story from two altitudes — Codex nailed the compact version (promise, user, loop, boundaries, metrics) and Claude did the same work but pushed one genuinely important structural idea further: that "core loop" is actually two loops running at different speeds, not one. No contradiction between them, just Claude sharpening what Codex already said. Gemini still couldn't join (CLI unavailable), but there's no gap left to fill — this is real convergence, not a coordinator papering over a split.

The one idea that has to survive verbatim into later phases: capture is a fast, near-daily loop (tap to start, instant feedback, satisfying on its own) that feeds data into a slower, gated negotiation loop (only fires once a room clears a confidence floor, proposes one block with visible reasoning, accept/reject/re-propose). If a later phase collapses these into "one daily card that always shows a negotiated block," that's a regression from what got agreed here, not a simplification.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** QuietPilot turns repeated short room recordings into a per-room quiet-time profile with an honest confidence level, and uses that profile plus the user's real calendar to propose one focus block at a time it can actually defend with visible reasoning — not a decibel reading, not a full-day replanner.

**Primary user and scenario:** A remote worker, student, or podcaster in a shared or noise-variable space (apartment, open-plan home, shared office/studio) who already blocks focus time on a calendar and keeps losing that time to predictable-but-unmapped noise (espresso machine, neighbor's call, shared-room activity). The concrete moment to design for: sitting down in the morning with a few things that need uninterrupted focus today, opening QuietPilot to ask "when can I actually trust this room to stay quiet today, and can I lock that onto my calendar before something else gets booked over it" — a planning-ahead act, not a live meter-check.

**Core loop — two cadences, not one:**
1. *Fast loop (frequent, low-friction):* explicit tap to start a short capture → label room/activity → extract spectral features only (raw audio discarded) → instant feedback comparing this session to the room's history. This has to be as satisfying and fast as a focus-timer app, because it's the only source of the data everything else depends on.
2. *Slower, gated loop (the actual differentiator):* once a room clears a minimum-sample confidence floor, the app computes a readiness score per window, proposes one calendar-aware focus block with reasoning tied to real session history, and lets the user accept/reject/shift — with re-proposal on rejection actually changing the offered window, not repeating it. Below the confidence floor, the app says so plainly instead of faking a score or a proposal.

**Hard scope boundaries:**
- Explicit start/stop capture only — never background or passive listening.
- Raw audio is deleted immediately after feature extraction; nothing else persists.
- Negotiation proposes exactly one block at a time for a stated duration — no full-day replanning, no multi-block optimization, no general calendar assistant.
- No silent calendar writes — proposals only, confirmed by an explicit user tap (assumed real EventKit integration, per earlier phases).
- Free tier is hard-capped at one room, enforced by actually blocking a second room's creation in the UI, not just a pricing label.
- Below the (architecture-phase-defined) minimum-sample threshold, no confident-looking score or proposal is shown — ever.
- No team/multi-person analytics, no CloudKit sync, no LLM — all consistent with earlier phases.

**Measurable success criteria:**
- Capture is startable in 3 taps or fewer from home screen, 1 tap from widget/App Intent.
- A room with ≥6 sessions across ≥2 times of day returns a numeric readiness score plus explicit confidence label from real clustering output, not a static default.
- Given a calendar with an overlapping open slot, negotiation produces a proposal with reasoning text that references actual session history (not boilerplate), and supports at least one reject→different-re-proposal cycle.
- Free-tier room cap is enforced by blocking second-room creation in the UI itself.
- Zero raw audio bytes remain in the app sandbox after any capture session completes — verifiable by filesystem inspection.
- Within a 14-day usage window at 3-5 sessions/room, prediction uncertainty measurably decreases and a defensible proposal becomes available; low-confidence/conflict scenarios degrade to an explicit diagnostic explanation rather than a falsely confident suggestion.

## Per App Product Brief

Looking at this round, Codex and Claude are in genuine agreement — Codex framed the full brief (user, paid value, core loop, wedge, growth, local-first), and Claude's contribution was to make every one of those pieces concrete and testable rather than to challenge any of it: sharper paid-value boundaries (exactly three paid unlocks, named), a QA-gate version of the wedge ("the reasoning sentence must be real and dynamic or it's a failed build"), and one added architecture note (sync-safe UUIDs now, so CloudKit later doesn't force a migration). Gemini still couldn't join, but there's nothing left for a third voice to adjudicate — this is convergence, not a gap.

CONSENSUS: YES

## Final Output

**Target user and use case:** Remote workers, students, and podcasters who already block focus time on a calendar and have already lost that time — this week, not hypothetically — to a predictable noise source in a shared or noise-variable room (espresso machine, roommate's call, HVAC, shared-room activity). They typically work from one to three real rooms (home desk, maybe a coworking spot, maybe a studio). Someone with a private quiet office is explicitly not the target — designing for them is scope drift, not inclusivity. The use case is a planning-ahead act each morning: "when can I trust this room to stay quiet today, and can I lock that onto my calendar before it gets booked over."

**Paid value and subscription value:** Free tier is a genuinely useful, non-crippled diagnostic — one room, manual capture, readiness score with confidence label. Paid unlocks exactly three things, no more: (1) unlimited room profiles — the hard functional need for anyone splitting time across ≥2 spaces; (2) the calendar-negotiation flow itself (propose/accept/reject/re-propose against real EventKit data) — the feature a free user will feel the absence of daily; (3) trend export / before-after comparison — the retention hook for existing payers. The one-room cap works as a funnel specifically because most target users are two-space people, so it has to bite quickly for a real slice of the audience, not just in theory.

**Core loop (two cadences, locked from the prior phase and defended here, not reopened):** Fast loop — tap to start a short capture, label room/activity, get instant "quieter/louder than your last N sessions" feedback; this has to feel as satisfying as a focus-timer app since it's the only data source for everything downstream. Slow loop — once a room clears its minimum-sample confidence floor, the app proposes one focus block with a reasoning string tied to real session history, user accepts/rejects/shifts, and the real outcome feeds back into the profile. QA gate carried forward as a hard rule: if negotiation ever repeats an identical rejected slot, or its "reasoning" is boilerplate rather than referencing actual session counts/times for that room, that's a failed build that must trigger the diagnostic-only fallback, not ship as a fake negotiation.

**Competitive wedge:** Decibel meters answer "how loud right now." Masking apps answer "how to ignore it." Calendar-AI tools (Reclaim, Motion) answer "when can you work" with zero knowledge of the physical space. QuietPilot is the only one that couples a learned per-room acoustic model to real calendar negotiation — concretely, a sentence like "proposing 2-4pm because your last six sessions here on weekday afternoons were quiet," built from real numbers, not a template. That sentence being dynamically true is the entire moat; if it isn't real in the shipped build, there is no wedge, just a nicer decibel app.

**Viral/niche growth angle:** Niche virality, not broad virality — no leaderboards, no social room-sharing features, that's explicitly out of scope. Primary mechanism: the trend/before-after comparison ("added a rug, here's the readiness score before and after") is a satisfying, shareable static export/image, in the same vein as Screen Time or Wrapped-style stats. Secondary, smaller mechanism: household word-of-mouth — "which room is quiet at 3pm" is a genuinely useful thing to settle among roommates, driving organic recommends within a shared living situation, not a true viral loop.

**Local-first and cloud-ready plan:** Everything — capture, feature extraction, clustering, scoring, negotiation logic, EventKit reads — runs on-device against SwiftData with zero network dependency for any core workflow. Concrete architecture note carried into the next phase: SwiftData models should use stable, sync-safe UUIDs (not auto-incrementing local-only IDs) from the start, so the already-planned future CloudKit sync (roadmap item, not v1) can be bolted on additively without a model migration disaster.

**Retention mechanism named explicitly for the design phase to take seriously (not bolt on later):** the moment a proposed window is right twice in a row (trust threshold) and the moment a trend chart shows a room measurably improving/degrading after a real change — both need real design weight, not an afterthought line chart or generic reasoning text, or the app has no retention mechanism regardless of capture-flow polish.

## Next Steps Small

CONSENSUS: YES

## Final Output

Codex and Claude landed on the same slice, just described from two angles — Codex wrote it like a QA checklist, Claude argued *why* it has to be this big and not smaller. No real fight here, and the one place that looked like a disagreement (paywall enforcement) actually dissolves once you notice this slice only ever builds one room, so "free users capped at one room" is satisfied by construction, not by a separate gating feature to build yet.

**The slice:** one room, real end-to-end. User grants mic + calendar permission (each with an honest, specific explanation, not iOS boilerplate) → creates that one room → taps to start/stop a short capture → gets real multi-feature spectral extraction (not a single loudness number) with the raw audio file deleted immediately → gets instant, comparison-based feedback ("quieter than your last N sessions here") with the waveform-to-heatmap transition, because that transition is the cheapest, most legible proof that this is QuietPilot and not a generic utility. Below the confidence floor (6 sessions, 2+ times of day) the room honestly shows "not enough data yet, N more sessions needed" — never a faked score. Once the floor is cleared, the room shows a real numeric readiness score with confidence label, and the app produces exactly one calendar-aware focus-block proposal with a reasoning string built from that room's actual session history, checked against real EventKit free/busy time. User can accept, reject, or shift it; a reject must produce a genuinely different re-proposed window, not a repeat.

**The one addition Claude pushed that Codex's draft didn't spell out, and it's staying in:** a DEBUG-only synthetic session seed path, unreachable from any release build or UI, that generates a structurally realistic multi-session history so the negotiation loop can actually be exercised and judged in one sitting instead of waiting real days for six sessions to accumulate. This is a test accelerant, not a shipped fake-data feature, and the later build phase needs to treat "not reachable outside DEBUG" as a checkable requirement.

**Cut list (deferred as real v1 features, not deleted from scope):** everything past the single room — multi-room creation and the associated paywall-cap UI (trivial once multi-room exists, and not exercisable yet since this slice never offers a second room to create), widget, App Intents/Shortcuts, BGAppRefreshTask (manual "recompute now" trigger stands in for it here, which was already the plan), local notifications, trend/before-after timeline and export, and any onboarding beyond the two permission asks. Clustering uses a deterministic on-device approach for this pass rather than a tuned CoreML model — real multi-bucket clustering behavior is required, just not model-tuning polish yet.

**Validation criteria, checkable rather than vibes-based:**
- Capture → stop in ≤3 taps once permissions are granted.
- Persisted session data is a genuine multi-dimensional feature vector, not one scalar dressed up as "features" — verified by inspecting what's actually stored.
- Zero raw audio bytes remain in the sandbox after any capture completes.
- Below the sample/diversity floor, UI always shows the honest low-confidence state — no exceptions, no partial score leaking through.
- At/above the floor, two differently-seeded rooms produce genuinely distinguishable clusters and different, non-templated reasoning text referencing their own real session counts/times.
- A reject on the proposal yields a materially different re-proposed window (directly comparable, not identical).
- Denied mic permission, denied calendar permission, and a fully-booked calendar each show their own distinct, non-dead-end error/recovery state.

Both agree the risk of building this bigger-than-"just capture and score" slice is worth taking on purpose: a smaller slice would only prove "we can record and average a number," which is a decibel meter, not QuietPilot. If the negotiation loop can't be built honestly at this size, that's exactly when the invalidation clause should fire — better to find out now than after multi-room, widgets, and a paywall get built on a negotiation feature that doesn't hold up.

## Detailed Discussion

CONSENSUS: YES

Round 3 actually closed all four gaps cleanly — and interestingly, Codex fully came around to Claude's side on three of the four rather than splitting the difference, while the fourth (post-accept conflict handling) turned out not to be a real fork at all once someone said "just do both." Nobody's holding out on anything anymore:

- **Tentative events block negotiation** — no exception. Codex dropped its earlier "tentative is non-blocking" position after Claude reframed it as the same trust-breaking failure mode as an acoustic surprise (the app told you it was safe and it wasn't). The one addition: when a tentative event is the reason a window got skipped, say so in the reasoning text rather than silently omitting the slot.
- **All-day events use EventKit's native `availability` field, same rule as timed events** — no custom "calendar policy" settings screen. Codex agreed this was unnecessary scope for v1 since the OS API already distinguishes a free all-day entry (birthday) from a busy one (Out of Office).
- **Re-propose threshold: 60 minutes or a different day.** Both landed here independently after their own numbers (30 and 90) turned out to be wrong in opposite directions — 30 felt like a nudge, not a rethink; 90 would starve out legitimate options on a busy calendar.
- **Post-accept conflict handling: both mechanisms, not a choice.** The scheduled local notification (built from an EventKit snapshot at accept-time, honestly labeled as potentially stale) covers the passive case; the manual "check again" refresh button covers the active case for anyone who wants reassurance before the block starts. Neither replaces the other.

## Final Output

**Resolved requirements:**
- Capture sessions are hard-stopped and discarded (never salvaged as partial data) on interruption, backgrounding, or mid-session audio route change; the UI always shows an explicit "capture cancelled — [reason]" state with a one-tap retry, never a silent failure.
- Input route is locked at capture start; any route change invalidates the sample rather than silently mixing microphone characteristics.
- Clustering has two gates, not one: clearing the 6-session/2-time-of-day floor unlocks an *attempt* at clustering; if clusters don't stabilize after a defined buffer (intra-cluster variance not tightening), the room shows an explicit "this room's noise doesn't show a stable pattern yet" state — a different message and different code path from "not enough data yet."
- Calendar busy/free logic uses EventKit's native `availability` field uniformly for both timed and all-day events — busy and tentative both block proposal windows; free (including free all-day entries) doesn't. No custom in-app calendar-policy setting in v1.
- Tentative events are treated as blocking by default; if a tentative event is the reason a window was skipped, that's surfaced in the reasoning text rather than silently omitted.
- Re-proposal on reject must differ from every prior rejected slot in that session by either a different day or a start-time shift of at least 60 minutes, with materially different rationale text. After 3 rejects (or an exhausted candidate pool), the app shows a real terminal state — "no viable quiet windows today" — with concrete recovery actions (try a shorter duration, try tomorrow, capture more sessions to enrich the profile).
- No live conflict re-detection is promised. Proposals are explicitly scoped to an EventKit snapshot taken at propose/accept time. Two honest mitigations ship together: a scheduled local notification before the block starts (built from the accept-time snapshot, with copy naming that availability may have changed), and a manual "check again" button that re-runs the overlap check on demand and can flip the card to "window appears stale, re-negotiate now?"
- Room deletion cascade-deletes its sessions, clusters, and pending proposals.
- Activity type is a fixed enum, not free text.
- Every app launch sweeps and deletes any orphaned temp audio files from a prior session/crash — a hard requirement, not a nice-to-have.
- The SwiftData store's file URL is marked excluded from backup where feasible; if that can't be guaranteed, it's named as a limitation with a real "erase all local data" fallback control in settings.
- Paid-tier gating logic (room cap, negotiation access) is enforced in real code regardless of purchase state; the purchase flow itself uses StoreKit Testing (a local `.storekit` configuration) to exercise genuine StoreKit 2 code paths, explicitly named as a simulated/local entitlement rather than a live App Store transaction.
- App Intents/Shortcuts scope is stated honestly as narrower than the original spec implies: one tap opens the app and immediately starts capture — not silent background recording without opening the app, since iOS doesn't realistically allow that.
- The widget reads a lightweight snapshot written by the main app after each recompute via an App Group–shared container, rather than querying SwiftData live across the extension boundary.
- A "mark room changed" action exists in the data model to timestamp a break point (e.g., moved desk, added a rug), so pre- and post-change sessions aren't blended into one misleading average — this is a schema requirement, needed before architecture, not an afterthought.

**Edge cases enumerated and resolved:** first-run with zero rooms/permissions; mic permission denied then later granted via Settings; calendar permission denied vs. zero calendars configured vs. fully-booked calendar; mid-capture interruption/backgrounding/route-change; sparse or all-noisy-all-the-time rooms that never stabilize into clusters; multiple rooms with wildly different sample counts; odd-hour outlier sessions; environmental drift after a real room change; recurring/all-day/tentative calendar events; post-accept calendar changes; exhausted re-proposal candidate pool; app crash between audio capture and feature-extraction cleanup.

**Data and privacy implications:** raw audio never persists past feature extraction, with a launch-time sweep as a crash-safety backstop; only derived feature vectors, cluster summaries, and scheduling metadata persist; backup exclusion attempted and explicitly reported as successful or named as a limitation with a manual erase-all fallback; calendar access is read-plus-propose only, never a silent write; room identity has no geofencing/location verification (named limitation, not solved, to preserve privacy minimalism).

**Risk register:** confidence illusion (mitigated by the two-gate clustering rule and explicit uncertainty states); scheduling trust violation via calendar surprises (mitigated by treating tentative as blocking); repeated/stale-feeling re-proposals (mitigated by the 60-minute-or-different-day rule and a real terminal state); silent data corruption from partial sessions or mixed input routes (mitigated by hard-stop-and-discard); drift after real-world room changes going undetected (mitigated by the "mark room changed" timestamp hook); unverifiable background recompute in dev (named limitation, manual recompute trigger stands in); App Intents overpromising background capture (resolved by stating the narrower, honest scope now); post-accept calendar races (named limitation, covered by dual notification + manual refresh mitigations, not a false promise of live protection).

**Final assumptions:** users work from 1–3 real rooms; EventKit's own availability semantics are sufficient and preferable to any custom in-app policy; "good enough" predictive scheduling beats perfect DSP as long as uncertainty is represented honestly; StoreKit Testing is an acceptable, technically real stand-in for live purchase verification in this build; no live cross-device or cross-user conflict detection is in scope for v1.

## App Features

CONSENSUS: YES

## Final Output

Codex and Claude actually converge on almost everything here, and the one place they visibly differ (whether the widget/App Intents belong on the must-have list) isn't a real fight — Codex put them in "should," Claude argued for demoting them too but as an explicit, pre-agreed cut-first decision. So there's nothing left to hash out; it just needs to be written down as one list.

**Must-have features** (each with a testable acceptance bar, not a vibe):

1. **Permission onboarding (mic + calendar)** — plain-language rationale screens shown only when relevant; denial produces a distinct, non-dead-end recovery screen with a path to Settings; no capture/negotiation UI appears until permissions are resolved.
2. **Single-room creation, capped by tier in code** — free = 1 room, paid = up to 3; attempting a second room on free is actually blocked in the UI layer (verified by trying it), not just described on a pricing screen.
3. **Explicit tap-to-start/tap-to-stop capture** — ≤3 taps from room screen; interruption, backgrounding, or route change always hard-stops and discards the sample, surfaced as an explicit "capture cancelled — [reason]" state with one-tap retry; a cancelled sample never enters the profile.
4. **On-device multi-feature extraction + sandbox hygiene** — raw audio deleted immediately post-extraction; launch-time sweep removes orphaned temp files; filesystem inspection shows zero raw audio bytes surviving any capture or simulated crash.
5. **Two-gate confidence ladder, three distinct states** — "not enough data," "attempting but unstable," and "stable/ready" are visually and semantically separate screens (not two); no readiness score or confidence language shown until the stability gate is actually earned — Codex's flagged self-objection (don't let the UI show a clean number before clustering earns it) is locked in as a hard rule here.
6. **Readiness scoring for a selected time window** — real numeric score plus confidence label, driven by actual clustering output, only shown once state 3 above is reached.
7. **Full negotiation flow** — one proposal at a time with a dynamic, non-templated reasoning string referencing that room's real session counts/times and calendar overlap; accept/reject/shift; reject enforces the locked 60-minutes-or-different-day rule with genuinely different rationale; after 3 rejects (or an exhausted pool), the real terminal "no viable windows today" state appears with recovery actions. Two differently-seeded rooms must produce visibly different reasoning text — this is the wedge, and it's a build-or-fail gate.
8. **Post-accept hygiene, both mechanisms together** — scheduled local notification (accept-time snapshot, staleness named in copy) plus a manual "check again" refresh button; neither replaces the other, both ship as one requirement.
9. **Trend timeline with "mark room changed" break-point action** — before/after comparisons don't blend pre- and post-change sessions.
10. **Local export of derived history** — session/trend data only, never raw audio.
11. **Manual "recompute now" trigger** — independent of any background scheduling, since BGAppRefreshTask can't be reliably demoed in dev.
12. **Full empty/loading/success/error states everywhere reachable**, with VoiceOver labels and 44pt hit targets, across all of the above.

**Should-have:** widget (reads a shared snapshot, not live SwiftData) for current score + next proposed window; App Intents/one-tap-launch-and-capture from Shortcuts, honestly scoped as foreground-required; haptics on threshold crossings; local notifications framing (already partly folded into must-have #8, but general polish here); immediate post-capture comparison feedback ("quieter than your last N sessions"); activity-type enum tagging UI polish. **Explicitly agreed as the first things to cut if the build gets tight** — this is a standing decision, not a scramble-later call.

**Could-have:** shareable trend/before-after image export (the named growth mechanism, layered on top of the must-have trend timeline, not a prerequisite for it); richer settings beyond erase-all-data; extra capture-metadata refinement.

**Won't-build (locked, not to be quietly reintroduced):** CloudKit/cross-device sync; team/shared-space/multi-person analytics; any LLM usage; geofenced/location-verified room identity; live/real-time calendar conflict re-detection or locking; a custom in-app calendar-policy setting (EventKit's native `availability` field already does this); more than 3 room profiles; any capture mode other than explicit tap-to-start/tap-to-stop; BGAppRefreshTask as a promised, verifiable behavior (manual recompute stands in for it, per earlier phases).

**Design/UX principles carried into this list as binding constraints, not just style notes:** the home experience always resolves to one of three explicit truths (not-yet-usable / usable-but-uncertain / usable-and-defensible); the waveform-to-heatmap transition is a trust signal tied to real extraction completing, not decoration; state-language must stay visually and semantically distinct across "capture cancelled," "not enough data," "unpredictable pattern," and "no viable windows"; reduced-motion and full accessibility are first-class, not polish.
