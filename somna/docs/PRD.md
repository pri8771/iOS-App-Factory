# somna — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

CONSENSUS: YES

Only one voice actually showed up this round (Codex's CLI wasn't available), but Claude's pass was thorough and self-consistent, and there's nothing here that's actually contested — it's a solo read of an unambiguous spec, not a live disagreement between parties. The scope is clean: this phase builds Somna only, not the 5-app portfolio ideation/selection that already happened upstream. Where the spec left things soft (MVP vs. "production-ready," which iOS-native features are hard-required vs. bonus), Claude named the assumption explicitly rather than picking silently, which is exactly what this phase is supposed to do. Nothing here needs a second round of arguing — it's ready to lock in.

## Final Output

**Original prompt:** preserved verbatim above (Somna app spec + parent portfolio prompt for context only — the portfolio-level ideation/selection/uniqueness-against-5-apps work is out of scope for this child build; it was already done one level up).

**Hard requirements:**
- Real, compiling Xcode project with full SwiftUI source in `app_build` — no spec doc, no partial scaffold.
- SwiftData persistence for nightly sleep logs and morning check-ins; fully local-first, no backend dependency.
- All core workflows present and functional: bedtime/wake logging, morning mood/energy check-in with optional tags, weekly recap card, plain-English correlation insights, optional read-only HealthKit import.
- Correlation engine: on-device rule-based/statistical only (no LLM, no hardcoded fake insights), with a real, sample-size-gated "still learning" state — not cosmetic, must actually suppress false-confidence output early on.
- HealthKit: read-only, optional, app must be fully functional with zero permission granted — no crashes, no blocking, no infinite re-prompt loops.
- StoreKit paywall (local `.storekit` config is acceptable for testing) gating: full tag-correlation engine, unlimited history, Live Activity. Free tier keeps logging, streaks, weekly recap.
- Live Activity (bedtime countdown) and WidgetKit widget (last night's score + tonight's target) — treated as required v1 scope per the spec's own "v1 Build Scope"/"iOS-Native Features" listing, but allowed to degrade gracefully (placeholder/last-known state) rather than block ship if they get disproportionately fiddly.
- ShareLink on the recap card.
- Design system must actually match "nocturnal calm": indigo-to-violet dusk gradients lightening toward dawn by time-of-day, soft-glow rounded cards, moon-phase icon motif — default SwiftUI styling is non-compliant.
- Real empty/loading/success/error states everywhere reachable, especially the insights screen's insufficient-data state.
- Accessibility: Dynamic Type, VoiceOver, 44pt targets, WCAG AA contrast.

**Non-goals:**
- No CloudKit/server sync in v1 — only a repository boundary that allows it later.
- No sleep-stage detection, audio recording, wearable/ring integration, ML sleep-staging.
- No LLM-generated insight text — template strings driven by real computed stats.
- No AR.
- No re-running the 5-app ideation/selection — already decided upstream.

**Production-readiness definition:** all v1-scope items work end-to-end on-device, no crashes, real persistence, a real (simple) correlation algorithm on real logged data, a functioning StoreKit paywall, polished UI matching the design direction. Live Activity/widget/HealthKit can be architecturally present but don't need to be flawless across every OS edge case — core logging/check-in/correlation/paywall loop is the non-negotiable bar.

**Decision rules for later phases:**
- If ambiguous, name the assumption in output rather than silently choosing — e.g., Live Activity/widget are hard-required, HealthKit is soft-required, exactly as reasoned above.
- Core workflows and paywall ship no matter what; Live Activity/widget degrade gracefully rather than jeopardizing the core loop.
- Explicitly test/reason about: zero-data first launch, wake-before-bedtime or incomplete log pairs, HealthKit permission denial, StoreKit product load failure (offline/sandbox), midnight-crossing/DST time math, and that the "still learning" threshold is a real gate, not just a label next to a bogus number.

## Product Research

CONSENSUS: YES

Codex didn't weigh in again this round, but the single Claude pass is thorough, internally consistent, and directly answers everything this phase is supposed to produce — there's no live disagreement to resolve, just one solid take that names its own assumptions. It correctly treats the prior phase's comparable-apps knowledge as informed judgment rather than claiming real market research was done, flags concrete risks beyond what was already in the prompt contract (the "still-learning gate set too strict" failure mode, the cross-midnight orphaned-session problem, and the native-feature-scope-creep risk), and lands on a clear build-priority call: nail logging/check-in/recap/gated-insights/paywall first, treat HealthKit/Live Activity/widget as gracefully-degradable. That's consistent with what the prompt contract already decided, so nothing here contradicts it — it just adds texture. Good enough to lock in.

## Final Output

**Audience and use context:** People who are tired and curious why, not sleep-tech enthusiasts — most likely folks who tried Sleep Cycle, Apple Health's sleep tracking, or a Whoop/Oura and bounced off the cost, the hardware requirement, or a hypnogram they couldn't act on. The realistic usage pattern is two ~10-second taps a day: one right before bed, one right after waking, frequently done half-asleep. That implies large tap targets, no required typing on the common path, and tolerance for the user abandoning the screen mid-log and returning later without losing state or double-logging.

**Comparable apps or patterns (drawn from general knowledge, not fresh research — labeled as such):**
- *Sleep Cycle* — mic/motion sensing, graph-heavy, subscription-gated trends. Somna's whole pitch is not being this.
- *AutoSleep / Pillow* — assume an Apple Watch is worn; breaks for a meaningful slice of Somna's stated target (students, parents, shift workers who may not own/wear a watch).
- *Streaks / Way of Life* — the habit-streak mechanic Somna's free tier logging leans on.
- *Bearable / Exist.io* — closest conceptual match for "plain-English correlation instead of a graph," just applied to mood/symptoms broadly rather than sleep specifically. Their known failure mode — users quit the daily log before the insight engine has enough data to say anything useful — is exactly the invalidation criteria already named upstream, and should actively shape the build, not just be acknowledged.

**Platform-specific opportunities:**
- Live Activity / Dynamic Island as a low-friction on-ramp into the morning check-in (bedtime countdown flips to a "log your wake-up" tap target) — genuinely a good fit for this app's rhythm, but real ActivityKit footguns exist (activities can silently fail to start, background updates aren't guaranteed to land on time, simulator testing is unreliable — needs a real device to trust). Treat as an enhancement layered on a working in-app flow, not load-bearing.
- WidgetKit's "last night's score" only updates reliably if `WidgetCenter.shared.reloadTimelines` is explicitly called from every write path (logging, check-in) — it won't refresh on its own just because app state changed. This is a concrete implementation requirement, not a detail to leave implicit.

**Major assumptions and risks:**
1. The "still learning" gate needs a concrete, testable numeric threshold decided now (e.g., minimum nights with a tag present vs. absent, minimum total nights logged) — set it too loose and you get false confidence (the risk already flagged upstream); set it too strict and consistent loggers never see a single insight for weeks, which kills trust just as fast. Both failure directions need guarding against, not just the first.
2. Bedtime and wake are logged as separate taps, possibly on different calendar dates, possibly with one side skipped entirely for a night. The data model and correlation engine must handle orphaned/incomplete sessions across midnight and DST boundaries without silently dropping nights or crashing — this needs explicit handling, not an assumption that logs always arrive in tidy pairs.
3. HealthKit, Live Activity, and WidgetKit are three separate pieces of native surface area that can each absorb disproportionate build time for marginal benefit versus the core loop. Consistent with the prompt contract's "degrade gracefully" call — if time is tight, these are the first things to simplify, not the logging/check-in/insight/paywall loop.

**Implications for the first build:** Build order should prioritize logging → check-in → recap → a correctly-gated insight engine → paywall wiring, in that order of non-negotiability. Because the insight engine only proves itself against real accumulated data, the build should include a way to exercise it against more than zero nights immediately — either a debug-only seed-data path or unit tests against synthetic logs — so the "still learning" threshold and the transition into real insight text can actually be verified during development rather than assumed correct.

## Portfolio Selection

CONSENSUS: YES

Only one voice showed up this round (Codex is still in cooldown), but there's nothing to argue about here — this is the easy, unambiguous case the phase playbook explicitly anticipates: a single selected child app, not a portfolio parent. Claude's take just confirms that plainly and adds two concrete guardrails worth carrying into the build so the app doesn't drift from the spec's core promise.

## Final Output

**Single-app vs portfolio-parent decision:** Single-app. This is a portfolio *child* project (`PORTFOLIO_CHILD_PROJECT: true`, parent `multi-app-exp7`) — the 5-app ideation, judging, and selection already happened one level up. This phase's job is not to generate or re-judge candidate ideas; Somna is already the selected app. No portfolio-json manifest is needed.

**Selected app:**
- Slug: `somna`
- Category: Sleep & Morning Energy
- Promise: Log your sleep and how you feel each morning; Somna shows you what actually helps you feel rested.
- Target user: Tired, curious people who don't want a sleep-tracking ring or overnight mic — students, parents, shift workers.
- Build flag: `true` (inherited from the parent portfolio decision).

**Selection rationale / rejected alternatives:** N/A at this phase — selection and rejection of alternative concepts was the parent portfolio's job, not this child build's. Re-opening that question here would be scope creep.

**Guardrails carried forward into the build** (from this round's discussion, on top of the locked prompt contract and product research):
- Build priority order stays: logging → morning check-in → recap → gated correlation engine → paywall, in that order of non-negotiability. Live Activity and widget are the first things simplified/cut if time is tight — never the core loop.
- The morning check-in's fast path must be completable with taps only — no required text entry, one screen, optional tags collapsed behind a single "add detail" affordance rather than shown by default. A check-in that takes more than ~3 taps for the common case is a product failure even if it technically satisfies the spec's checklist.
- The "still learning" insufficient-data state should read as encouraging progress ("3 more nights until your first insight"), not a bare clinical "not enough data" message — this materially affects day-5 retention per the invalidation criteria already on record.

No further discussion needed for this phase — it's ready to move forward into design/build on Somna alone.

## Initial Discussion

CONSENSUS: YES

Only Claude showed up this round (Codex is still down), but the pass is a genuinely complete answer to what this phase needs, and it doesn't fight anything already locked in the prompt contract, product research, or portfolio selection — it sharpens those into concrete IA and data-model decisions. The one new thing worth calling out: it reframes Somna as "an insight app with lightweight logging as the mechanism" rather than "a tracker with insights bolted on" — a framing shift, not a scope change, and it adds real teeth to two things the spec left vague: how bedtime/wake events get stitched into a "night" (a plausibility-window rule, keyed by timestamp not calendar date, so naps and skipped nights don't corrupt the model), and a third Insights-screen state ("logged enough, but this tag has no signal") that the spec's own language would have let a builder skip. Nothing here is contested — it's ready to lock.

## Final Output

**One-sentence product promise:** Somna turns two ten-second daily logs into a plain-English answer for why you feel rested or wrecked — the insight is the product, the logging is just fuel for it.

**Primary user and scenario:** Someone tired and curious, not a sleep-tech enthusiast — a student, parent, or shift worker who's bounced off Sleep Cycle/Whoop-style apps because the output was a graph nobody could act on. They interact with Somna in two near-unconscious ten-second bursts a day (tapping bedtime around 11pm, tapping wake + a quick mood/energy check-in around 7am), and check in on trends maybe once a week. The app has to survive being opened, abandoned mid-log, and reopened later without losing state or double-logging.

**Core loop:** log bedtime → (sleep happens) → log wake + morning check-in → weekly recap surfaces → correlation insights update → an insight subtly changes tonight's behavior → log bedtime again. The loop only has value if the last step closes back into the first — e.g., an insight like "you feel better with 7+ hours" should be visible from the bedtime-logging screen itself (a suggested target bedtime), not stranded on a separate Insights tab.

**IA shape:** Two modes, not one dashboard trying to do both — a "fast capture" mode (bedtime/wake/check-in) that's reachable in one tap with no navigation, and a slower "reflection" mode (recap, insights, history). The capture surface should visually collapse to a quiet "done for today" state once nothing's actionable, rather than staying a live dashboard demanding attention.

**Hard scope boundaries (new, on top of what's already locked):**
- No free-text notes field in v1 — it fights the sub-3-tap fast path and can't be correlated by a rule-based engine anyway. Tags only, from a small fixed set.
- Sessions are keyed by their own start/end timestamps, not calendar date, so odd-hours logging (shift workers, naps) doesn't corrupt pairing — naps themselves aren't a feature to build, just something the model must not choke on.
- A wake log only auto-pairs with an open bedtime log if the gap is under a plausibility ceiling (~16 hours); otherwise the dangling bedtime closes out as "incomplete/no wake logged" and the new wake log starts its own orphan session. This is a real rule in the data model, not implicit behavior.
- The Insights screen needs three states, not two: "still learning" (below threshold, encouraging progress), "here's what we found" (threshold met), and "no signal for this tag" (enough nights logged, but no contrast group exists for that specific tag — e.g., always drinks coffee). Conflating the third into the first reads as the app being permanently stuck at 0%.

**Measurable success criteria:**
1. Cold-start bedtime-log-to-morning-check-in cycle completes in under 15 seconds combined, no required text field.
2. With zero data, every screen (Today, Insights, History, Recap) shows a real designed empty state — no blank views, no crashes.
3. The correlation engine produces zero insights below its sample-size threshold and at least one correctly-worded insight once seeded/synthetic data crosses it — verifiable without waiting three real weeks.
4. Out-of-order or incomplete logs (wake with no bedtime, bedtime with no wake for 3+ nights) never crash the app or corrupt the next night's pairing.

This carries forward everything already locked (core-loop build priority, sub-3-tap check-in, encouraging "still learning" copy, Live Activity/widget degrade-gracefully) and adds the session-pairing rule and third Insights state as concrete requirements for the build phase.

## Per App Product Brief

CONSENSUS: YES

Only Claude showed up this round (Codex's still in cooldown), but the pass is a complete, non-generic answer to everything this phase needs, and it doesn't contradict anything locked upstream — it just turns the already-agreed core loop and design direction into a concrete product brief with real teeth. Nothing here is contested since it's a solo pass, but it's specific enough to build from without another round.

## Final Output

**Target user and use case:** Someone who's already tried and bounced off a sleep app — Sleep Cycle, Apple Health's sleep tab, a hand-me-down Whoop/Oura — because it gave them a graph instead of an answer. Concretely: a nursing student on rotating clinicals, a parent whose sleep is chopped up by a toddler, a shift worker whose "bedtime" is 3pm on a Tuesday. They want two ten-second taps a day to eventually produce one sentence they couldn't have worked out themselves ("you feel 34% more rested after 7+ hours," "your energy tanks on days with 3+ hours of screen time before bed"). That sentence *is* the product — if the app can't produce it honestly and on schedule, there's no app.

**Paid value and subscription value:** Free tier is genuinely useful on its own — bedtime/wake logging, morning check-in, streaks, weekly recap card, plus one coarse always-on comparison (e.g. average energy on 7+ hour nights vs. under 7). Somna+ ($4.99/mo or $29.99/yr) unlocks the real causal engine — per-tag correlations (caffeine, exercise, screen time, whatever's been tagged), unlimited history instead of a rolling window, and the bedtime Live Activity. That's a felt utility difference, not a fake wall — and the recap card specifically must never be paywalled, since it's both the retention hook and the thing that has to sell the app before anyone decides to pay for it.

**Core loop:** log bedtime → log wake + 10-second check-in the next morning → weekly recap renders → correlation engine updates → next bedtime session, if a correlation clears threshold, the bedtime screen itself surfaces a suggested target time derived from it → user acts or doesn't → logs bedtime again. The loop's known failure seam (people keep the bedtime tap, drop the morning check-in) gets addressed with a data commitment, not just a UX tweak: the recap card and streak must visibly react specifically to the morning check-in, so skipping it has an immediate, noticeable cost within a week rather than an invisible cost to a correlation engine the user can't see.

**Competitive wedge:** Every ring/sensor-based competitor sells data about sleep; Somna sells an instruction. A ring literally cannot see that you had two coffees at 4pm — the correlation is only possible by pairing sleep with self-reported daytime behavior, which is structurally something sensor-first competitors can't bolt on without contradicting their own hardware-sales business model.

**Viral/niche growth angle:** The weekly recap card via ShareLink is the whole v1 growth mechanism, and the bar is concrete: a stranger should understand the screenshot in under 3 seconds without context ("You slept 7h 12m on average this week — your best night was Tuesday," rendered in the nocturnal gradient system). No social/friend-comparison layer in v1 — that would be scope creep past what's already locked.

**Local-first and cloud-ready plan:** SwiftData is the source of truth for every session, check-in, and computed correlation; the correlation engine runs entirely on-device with no network call ever on the critical path. Cloud-ready path is a repository-protocol boundary (`SleepSessionRepository`, `CheckInRepository`) so a CloudKit-backed implementation can later be swapped in for multi-device sync without touching the correlation engine or views — and the engine stays on-device permanently even after sync ships, since "your patterns never leave your phone" is part of the trust being sold, not just an implementation detail.

**New requirement surfaced this round, worth carrying into build:** the insight engine needs a relevance floor, not just a sample-size floor. If both a bland/obvious correlation (more sleep → more energy) and a genuinely non-obvious one (caffeine timing, screen time) clear the statistical threshold at the same time, the engine should prefer surfacing the non-obvious one — otherwise the user's first proof-of-value moment can be a shrug ("no kidding"), which risks churn right as the paywall would've made sense. Also: the "still learning" threshold must be a hard gate with no exceptions, including after a HealthKit bulk-import backfills history all at once — a build-time test should force-feed threshold-minus-one nights and assert zero insights, then threshold nights and assert at least one.

## Next Steps Small

CONSENSUS: YES

Only Claude showed up this round (Codex's still in cooldown), but the take is complete and doesn't contradict anything already locked — it just makes an explicit, well-argued call on a question this phase exists to answer: does "smallest slice" mean "just logging" or "the full loop, narrowed"? Claude argues for the latter and I think that's right — logging alone doesn't test anything specific to Somna (any habit tracker has a logging screen), while a slice that runs bedtime → check-in → recap → at least one real, seed-verifiable insight actually tests the thing this app is betting on. That's consistent with the build-priority order already locked in every prior phase (logging → check-in → recap → correlation engine → paywall), it just draws the "first buildable slice" line after the correlation engine and before HealthKit/Live Activity/Widget/paywall UI, which is a sharper but compatible reading of what's already agreed. Nothing here is contested since it's a solo pass, and it satisfies both acceptance checks (buildable without further debate, includes a complete end-to-end workflow).

## Final Output

**MVP slice:** The full core loop, narrowed rather than stopped short — bedtime/wake logging (timestamp-keyed sessions, 16-hour plausibility window, orphan/incomplete-pair handling), the sub-3-tap morning check-in (energy/mood scale + optional fixed tag chips), the weekly recap card, and a real but narrow correlation engine covering exactly two insight types (sleep duration vs. energy, and one tag — caffeine — vs. energy), each properly gated by the agreed sample-size threshold. A debug/seed data path that lets the engine be force-fed synthetic nights is part of this slice, not an extra — it's the only way to prove the "still learning → real insight" transition works without waiting three real weeks.

**Must-have interactions:**
- One-screen bedtime log (defaults to now, adjustable time).
- One-screen wake + check-in (energy/mood as a single tap-driven scale, tags as optional chips), completable in the fast path in ≤3 taps.
- A Today view that collapses to a quiet "done for today" state once both are logged for the current session.
- An Insights view showing all three agreed states on demand: still learning (encouraging progress), real insight (once threshold cleared), and no-signal-for-this-tag — not just the first two.
- The weekly recap card rendering from real logged/seeded data.

**Cut list (deferred past this slice, not abandoned):** HealthKit import, Live Activity, WidgetKit, and the StoreKit paywall UI/gating logic (repository/StoreKit scaffolding can exist, but monetization mechanics don't belong in the validation slice since they monetize a concept, not validate it). This is consistent with — and sharpens — the "degrade gracefully" call already locked for these features.

**Validation criteria:**
1. The full loop (bedtime → wake+check-in → recap renders → at least one insight visible once seeded data crosses threshold) is demonstrable in a single sitting using seeded/synthetic data — no waiting on real calendar weeks.
2. Today view shows a correct empty state on first launch and a correct "done" state after both logs land same-day.
3. An incomplete pair (bedtime logged, no wake for 3+ nights) never crashes the app or corrupts the next session's pairing.
4. The Insights screen can show all three of its states on demand against test data (still learning / real insight / no-signal-for-tag), not just the happy path.

If a later round wants to argue for cutting the correlation engine out of this first slice entirely (pure-logging-first), that would be a real disagreement worth reopening — but nobody's raised that counter-argument yet, so there's nothing unresolved to carry forward.

## Detailed Discussion

CONSENSUS: YES

Only one voice showed up this round again (Codex still unavailable), but it's a genuinely thorough skeptic pass that doesn't just restate prior phases — it closes real gaps that were still open after four rounds of "logging → check-in → recap → correlation → paywall" agreement. Nothing here contradicts anything locked earlier; it resolves ambiguity the earlier phases left soft (correlation causality language, duplicate-tap handling, edit/delete semantics, streak-farming, lock-screen privacy, accessibility of a custom scale control, clock/DST edge cases, backup posture, StoreKit fail-open behavior). This is exactly what the detailed_discussion phase exists to do, and it's specific and testable enough to hand straight to design/build.

## Final Output

**Resolved requirements (new this round, on top of everything already locked):**
- Insight copy must be strictly associational, never causal ("on nights you slept 7+ hours, your energy averaged X% higher" — not "sleeping 7+ hours makes you X% more rested"). A one-line non-medical disclaimer must be reachable (settings or first-run).
- A second "log bedtime" tap while a session is already open updates that session's start time — it never creates a second concurrent open session.
- Morning check-ins can exist standalone, unpaired to any bedtime session (they just don't feed duration-based correlation until paired) — this keeps the fast path alive for anyone who missed a step.
- Editing is limited to the most-recent/open session (fixing a fat-fingered time); deletion is allowed on any entry. Correlations are always recomputed fresh on each app foreground, never cached-and-diffed, so there's no need to explain why a shown insight silently changed.
- Streaks increment at most once per local calendar day, keyed to the check-in timestamp; a second same-day check-in updates that day's record rather than creating a new tick or being silently dropped.
- Lock-screen-visible surfaces (Live Activity, widget) show only generic content — a countdown or a target bedtime — never mood/energy scores or insight text. Privacy is the default to degrade toward, not just simplicity.
- The mood/energy check-in control (a custom tap-driven scale, not a stock Slider) needs explicit VoiceOver value/adjustable-trait support, tested directly — not assumed covered by generic "accessibility is a requirement" language. Card text sits on a guaranteed-contrast surface fill, never directly on the raw gradient.
- Entitlement/StoreKit checks fail open to free tier — a slow or failed product-list load or entitlement check can never block or delay the core logging loop.

**Edge cases enumerated:**
- Duplicate/overlapping bedtime taps; standalone check-ins with no paired session; editing/deleting past entries that already fed a shown insight; two same-day check-ins from shift-worker/nap patterns; negative or absurd computed durations from DST fallback or manual clock changes (must be discarded/flagged, never displayed or fed to the engine); StoreKit product load failure or hung entitlement check at first launch.

**Data and privacy implications:**
- Confounded tags (e.g., exercise and low screen time co-occurring) mean the rule-based engine can misattribute correlation — mitigated by keeping all copy associational rather than causal, not by trying to engineer true causal inference.
- No cloud sync in v1 is already locked, but that means a lost/reset phone permanently loses history with no warning ever given — mitigated by a deliberate, stated decision to leave the SwiftData store under normal iOS device-backup behavior (not excluded from iCloud/iTunes backup) as the only backstop this version gets.
- No analytics/telemetry SDK, consistent with the local-first privacy stance already sold as part of the product's trust proposition.

**Risk register:**
1. Rule-based correlation confusable with causation → mitigated by strictly associational copy + non-medical disclaimer.
2. Duplicate-session / duplicate-check-in bugs corrupting pairing or streaks → mitigated by the concrete resolution rules above (update-in-place, once-per-day streak ticks).
3. Lock-screen disclosure of personal mood/health data → mitigated by keeping ActivityKit/widget content generic, never scores or insight text.
4. Custom scale control silently breaking VoiceOver → named explicitly as a build/test requirement, not assumed handled.
5. DST/clock-change producing nonsensical durations → guarded by discarding implausible (negative or absurd) sessions rather than displaying or computing on them.
6. Total data loss on device loss/reset with v1's no-sync scope → accepted as a known limitation, mitigated only by leaving standard device backup enabled (a stated choice, not a default nobody made).
7. StoreKit failure blocking the free core loop → mitigated by fail-open entitlement resolution.

**Final assumptions locked for design/build:**
iPhone-only layout for v1; no push notifications/local reminders (Live Activity is the only proactive nudge); check-ins can exist unpaired; edits limited to the most-recent open session, deletion otherwise allowed, correlations always recomputed fresh; streaks increment at most once per local calendar day; no analytics/telemetry SDK; insight copy is contractually associational, never causal, with a reachable one-line non-medical disclaimer; standard iOS backup left enabled as the only data-loss backstop in v1.

## App Features

CONSENSUS: YES

Codex was unavailable again this round, so it's a single voice, but the pass is thorough and doesn't contradict anything locked in the five prior phases — it just converts all that accumulated detail into a clean MoSCoW list with real acceptance criteria attached to each must-have. The key judgment call — keeping HealthKit/Live Activity/WidgetKit as should-haves rather than musts despite the spec's own "v1 Build Scope" wording — isn't new; it's the same "degrade gracefully" resolution that's been reaffirmed in every phase since next_steps_small. Nothing here is in dispute.

## Final Output

**Must-have features** (each ships with a user story + acceptance criteria):

1. **Bedtime logging** — User can start tonight's sleep session with one tap, time defaulting to now, adjustable via picker.
   - *Acceptance:* a second bedtime tap while a session is open updates that session's start time rather than creating a concurrent second session; sessions are keyed by their own timestamp, not calendar date.

2. **Wake + morning check-in** — User logs wake time and a mood/energy check-in on one screen, ≤3 taps for the fast path, tags optional and collapsed behind an "add detail" affordance.
   - *Acceptance:* submittable with zero tags/zero text; a wake log auto-pairs to an open bedtime session only if the gap is under 16 hours, otherwise the bedtime session closes as incomplete and the wake log becomes its own orphan; a standalone check-in with no paired session is valid, not an error.

3. **Today view** — Shows the single next action (log bedtime, or log wake+check-in) and collapses to a quiet "done for today" state once both are logged.
   - *Acceptance:* correct empty state at first launch with zero data; correct done state same-day after both logs land; never blank or crashes regardless of pairing state.

4. **Weekly recap card** — Summarizes the last 7 days (average sleep, best night, check-in completion rate) with ShareLink.
   - *Acceptance:* renders correctly with fewer than 7 nights of data; shareable output is understandable by a stranger in under 3 seconds with no app context; never gated behind the paywall.

5. **Correlation insights** (narrow scope: sleep-duration-vs-energy, one tag-vs-energy) — Plain-English insights once enough nights are logged.
   - *Acceptance:* a build-time test force-feeds threshold-minus-one nights and asserts zero scored insights, then threshold nights and asserts at least one; all three states (still learning / real insight / no-signal-for-tag) are reachable on demand against test data; copy is associational only, never causal, with the disclaimer reachable; a foreground recompute is always fresh, never a stale cached number.

6. **Data integrity guards** — Sessions can't be corrupted by edge-case input.
   - *Acceptance:* negative/implausible durations (DST, manual clock changes) are discarded, never displayed or fed to the engine; streaks increment at most once per local calendar day keyed to check-in timestamp, with a second same-day check-in updating rather than double-counting or being dropped; edits limited to the most-recent/open session, deletion allowed on any entry.

7. **Somna+ paywall (StoreKit)** — User can see what's locked and purchase it; free-tier logging is never blocked by entitlement checks.
   - *Acceptance:* product-list load failure or a hung entitlement check fails open to free tier with no blocking spinner on Today; Restore Purchases present; only the per-tag correlation view is gated — the coarse duration-vs-energy comparison and the recap card are not.

**Should-have list:** HealthKit read-only duration import (must fully no-op with zero permission granted, never a blocking prompt on first launch); WidgetKit last-night's-score widget (must call `WidgetCenter.shared.reloadTimelines` from every write path or it'll show stale data, which is worse than no widget); Live Activity bedtime countdown (lock-screen content generic only — never a score or insight text).

**Could-have list:** onboarding walkthrough beyond a single first-run screen; settings polish beyond the required disclaimer/data-management basics; additional tag types beyond the fixed starter set; a richer history-browsing UI beyond a simple list.

**Won't-build:** free-text notes field; any social/friend-comparison layer; push notifications or local reminders; cloud sync/CloudKit in this build; sleep-stage detection or audio recording; causal-language insight copy; any analytics/telemetry SDK.

**One acceptance criterion the group wants preserved word-for-word into the build phase:** the correlation engine's threshold-gating test (N-1 nights → zero insights, N nights → at least one) is a must-have test, not optional polish — it's the only proof this app didn't ship a set of hardcoded strings dressed up as an insight engine.
