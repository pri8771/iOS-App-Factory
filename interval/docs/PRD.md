# interval — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both takes line up more than they clash — Codex framed the big-picture bet (adaptation has to be real and legible, not vibes), and Claude's round added the specific guardrails that make that bet buildable: what "learns" can honestly mean on day one, what happens before there's any history, how MVP-sized scope reconciles with the parent's production-ready bar, why the timer has to survive backgrounding, why this data is privacy-sensitive by nature, and where the paywall has to sit to satisfy "never cosmetics-only." Nothing here contradicts Codex's framing — it's the same direction with the fuzzy edges pinned down. No open disagreement to flag; Gemini didn't weigh in (CLI unavailable), so this is a two-way but coherent convergence.

CONSENSUS: YES

## Final Output

**Original prompt** — preserved in full above (Interval, MVP build, Productivity category, promise: "a focus timer that learns your real focus patterns and adapts session length/timing to you," under the batch-cat-b2 portfolio's global rules for uniqueness, production quality, monetization, and local-first architecture).

**Hard requirements**
- One separate SwiftUI iOS project/folder for Interval under the portfolio output dir, local-first, deterministic on-device state, architected so cloud sync could be added later without a rewrite.
- The core loop must actually exist and work end to end: start a focus session → log the outcome → derive pattern insights from history → adapt future session-length/timing/break recommendations accordingly.
- "Learns" for v1 means a transparent, deterministic, on-device heuristic computed from the user's own logged sessions (e.g. rolling completion rate by duration and time-of-day, interruption/early-stop rate, simple trend detection) — not a trained model, not cloud ML, not anything needing more than local history to function from day one.
- Cold start is explicitly designed: sensible fixed defaults (e.g. 25/5) until a defined minimum number of completed sessions is reached, and the UI must honestly distinguish "still learning" from "adapted to you" rather than faking personalization early.
- Adaptation must be inspectable: the user can see what signal changed the recommendation and why (completion rate, interruptions, energy check-in, time-of-day performance, etc.) — no hidden pseudo-AI.
- Session timing must survive backgrounding/lock via locally scheduled notifications (UNUserNotificationCenter) for session-end/break-end, not a live in-process timer alone.
- No network calls in the core timer/logging path; this app's behavioral data (when/how long someone focuses) is treated as privacy-sensitive by default — local only unless/until a future opt-in cloud feature exists.
- Monetization must gate genuine functional value — the adaptive engine's depth and long-range analytics/multiple context profiles are the plausible paid layer, with a real (not crippled) free tier underneath. Cosmetic-only paywalls are disallowed by the parent prompt.
- Every reachable screen needs empty/loading/active/completed/error states; accessibility, persistence, and testing are product requirements for this app, especially for the adaptation logic and persistence paths.
- Feature scope should be MVP-sized, but everything in that scope must be built to production craftsmanship — no placeholder screens, no dead ends in the main flow.

**Non-goals (v1)**
- No task manager, calendar suite, habit tracker, meditation app, social/accountability network, or general "productivity dashboard" — features only earn a place if they directly strengthen adaptive focus timing.
- No cloud sync, team features, wearable integration, or LLM dependency to feel "intelligent."
- No account creation required for the core loop to work.
- No telemetry/analytics SDKs phoning home session data.
- Re-litigating batch-level sibling-app uniqueness is out of scope here — that's assumed checked at app-selection time, before this phase.

**Production-readiness definition**
Installable, usable end to end with persistent local data and stable session state that recovers cleanly from interruption (backgrounding, lock, force-quit mid-session). The adaptive system must produce genuinely different recommendations over time as behavior changes, not just present manual presets dressed up as "AI." Screens cover empty/active/completed/failure states. Privacy posture is crisp and local-first by default. Testing covers adaptation logic and persistence, not just UI smoke tests. This is the bar that separates "MVP" (scope) from "prototype" (quality) — small and finished, not broad and half-built.

**Decision rules for later phases**
- If a feature doesn't improve the adaptive focus loop, cut it.
- If a design choice makes the app feel smarter but less trustworthy, choose trust; show the signal behind any claimed intelligence.
- Breadth vs. learning quality → choose learning quality.
- Premium vs. finished → choose finished, without settling for visually generic.
- If a feature needs cloud infrastructure to matter, defer it past v1.
- If the app drifts toward a general productivity dashboard, pull it back to timing, recovery, and pattern learning.
- Any conflict between this contract and a later phase's convenient interpretation is resolved in favor of this document — a later phase that can't point to a line here justifying a decision has failed to honor the contract, not the other way around.

## Initial Discussion

Both Codex and Claude landed in the same place this round, just approaching it from different angles — Codex pushed on making the adaptation *feel* real and visible in the moment, Claude pushed on where the scope could quietly balloon or where testing would get skipped under pressure. Where they overlap is telling: both independently decided that "adapts session length/timing" should mean duration and break-length adaptation as the real feature, with time-of-day treated as at most a secondary explanatory signal rather than its own full recommendation engine — Codex called it "a confidence-aware note," Claude called it "a secondary insight, not its own recommendation engine." Same conclusion, reached separately, which is a good sign it's right rather than just first-mover bias.

They also agree on the shape of the core loop (see recommendation + why → start → survive backgrounding → end via completion/early-stop/interruption → log → recommendation updates for next time), on keeping this to one timer experience with no task manager/calendar/social/gamification bloat, and on cold-start honesty (never fake personalization before the threshold). Claude added a few extra hard boundaries Codex didn't explicitly rule on but also never contradicted — no multiple session profiles in v1 (save for paid tier later), no parallel manual timer, no background audio/soundscapes — and flagged explicitly that narrowing "timing" down from the original promise is an intentional scope call, not an oversight, which is exactly the kind of thing this phase is supposed to catch. No real disagreement surfaced. Gemini didn't participate again.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Interval is a focus timer that starts you on a sensible default session/break schedule, logs what actually happens (completed, stopped early, or interrupted), and — once you've logged enough real sessions — adapts its recommended session and break length to match your observed behavior, always showing you the reason behind any change.

**Primary user and scenario:** Someone who already wants to do focused work (student, knowledge worker, freelancer) and has bounced off rigid fixed-interval timers because their real focus capacity varies by day, workload, or energy. They open the app, see today's recommendation (and once personalized, why it is what it is), start the session, and the timer has to survive their phone being locked or backgrounded — because most real sessions end by early-stop or interruption, not a clean finish, and the app has to treat that as the main case, not an edge case.

**Core loop:** Open app → see current recommended session/break length and, once adapted, a one-line reason why → start (optionally override the suggested duration) → session runs and survives lock/background via local notifications → session ends as completed, stopped early, or interrupted, and a quick outcome (plus optional energy/focus rating) is logged → history updates → recommendation is re-derived for the next session, with an explanation surfaced if it changed.

**Hard scope boundaries:**
- Duration/break-length adaptation is the load-bearing v1 feature. Time-of-day performance can inform the reasoning shown to the user, but it is not its own recommendation surface in v1.
- One session context/profile only in v1 — no multiple named profiles (work vs. study, etc.); that's a plausible future paid feature, explicitly deferred.
- A single timer experience — no separate manual/free-form timer running alongside the adaptive one. The user can override a recommended duration before starting, but there's only one subsystem to build and test.
- No task manager, calendar, social/accountability features, streaks/badges/gamification, background audio/soundscapes, or general "productivity dashboard" sprawl.
- No claimed personalization before the defined minimum completed-session threshold — the UI must honestly distinguish "still learning" from "adapted to you."
- No cloud dependency, no required account, no telemetry/analytics in the core timer/logging/adaptation path.

**Measurable success criteria:**
- A brand-new user can start a session within seconds of first launch, with clearly labeled (non-personalized) defaults; the UI must never claim personalization before the threshold is met — this is a testable assertion, not a vibe check.
- After the minimum-session threshold, feeding different synthetic session histories (varying completion/interruption patterns) through the adaptation logic must produce genuinely different recommended durations — covered by an automated test.
- Any changed recommendation is explainable in one line, visible on the main timer/home screen — never buried in a separate analytics tab.
- Backgrounding or locking mid-session fires the correct local notification, and the app correctly reconciles session state (completed/abandoned/still-in-progress) on relaunch or force-quit — covered by explicit test scenarios, not just a general QA pass.
- The app remains fully usable offline, and an audit confirms zero network calls originate from the timer/logging/adaptation code path.

## Per App Product Brief

Both agents converged completely this round, and it's clear convergence rather than one voice dominating — they're hitting the same conclusions from genuinely different entry points (Codex from "what makes this deserve to exist commercially," Claude from "what makes this true to a specific user").

On target user: both describe the same person almost word-for-word — someone who's already tried and abandoned rigid Pomodoro timers because a fixed interval doesn't track their real day-to-day focus capacity. No daylight between them here.

On paid value: both reject cosmetic gating outright and land on the same shape of subscription — the free tier is a fully-functional single-profile adaptive timer with real history, and the paid tier is *more contexts and deeper math*, not crippled functionality. Claude gets more specific (named profiles like deep work/reading/admin, a longer rolling history window vs. a capped one for free), which sharpens Codex's version rather than contradicting it.

On competitive wedge: identical instinct — trust and legibility, not black-box "AI." Both independently used almost the same example sentence structure ("you finish X% of sessions at this duration, so today's recommendation moved to Y") to describe what the "why" should look like.

On growth: both explicitly rule out gamification/streaks and land on the same alternative — a small, shareable, honest artifact (a weekly pattern insight, screenshot-worthy) that spreads in productivity/focus communities rather than going for broad virality.

On local-first/cloud path: both say local-first is a trust argument as much as an architecture choice, and both sketch the same future extension (device-sync later via a decoupled repository boundary, no account required for v1).

The one thing both flagged as the real risk is the same too: cold start is a dead zone where the app is just a nice-looking timer with a promise attached, and if that period isn't designed honestly (explicit "N more sessions until I start learning" messaging, a genuinely pleasant default experience), users churn before adaptation ever proves itself. No disagreement on how to handle it — just a shared warning to protect it in later phases.

Nothing here contradicts the prompt contract or the initial discussion; if anything this round mostly reinforces the duration/break-length-first, timing-as-secondary-signal scope call already made. There's no open fork to resolve.

CONSENSUS: YES

## Final Output

**Target user & use case:** Knowledge workers, students, and freelancers who've already tried and abandoned fixed-interval timers (Pomodoro-style apps) because a constant 25/5 cadence doesn't match how their real focus capacity varies day to day. They're not looking for a productivity system or a coach — they want to sit down, get told the smartest focus block for right now, run it reliably even through lock/background, and have the app get measurably better at that recommendation over time.

**Core loop:** Open app → see today's recommended focus/break length, with a one-line "why" once there's history (e.g. "32 min — you finish sessions like this 85% of the time in the afternoon") → start (optionally override) → session survives lock/background via local notifications → session ends as completed / stopped early / interrupted, captured with a fast two-tap outcome + optional one-tap energy rating → log feeds directly into the next recommendation, and the app says so when it changes. The recommendation must visibly move in response to real behavior — three early stops at 45 minutes should produce a shorter, explained suggestion next time, or there's no product here.

**Paid value / subscription value:** Free tier is a fully-adaptive single-profile timer with real local history, real duration/break-length adaptation, and the "why" explanation — not crippled, because a hobbled core loop kills the thing worth recommending. Subscription unlocks genuine functional depth: multiple independently-learned session profiles (deep work vs. admin vs. study, since focus capacity differs by task type), a longer rolling history window feeding the adaptation math (vs. a shorter capped window free), and a proper pattern-insights view (weekly/monthly trends, best-performing windows). This is "more context and better-tuned math," not cosmetic gating — satisfies the parent portfolio's "never cosmetics-only" rule concretely.

**Competitive wedge:** Trust through legibility. Competitors either stay static forever or use vague "AI" language with no visible evidence anything changed. Interval shows the actual signal behind every recommendation change in plain language, in the moment, on the main screen — not buried in an analytics tab. That inspectability is the product, not a feature of it.

**Viral / niche growth angle:** Not gamification, streaks, or social pressure — a small, honest, shareable artifact (e.g. "My best focus window this week was 9:30–11:00," or a screenshot of a specific "why" explanation) that's naturally screenshot-worthy in productivity/deep-work/student communities (r/productivity, finals-week students, indie hackers). Niche and word-of-mouth by design, not mass-market virality.

**Local-first & cloud-ready plan:** All session history, learning state, and the recommendation engine live entirely on-device (SwiftData/local store) with zero network calls in the timer/logging/adaptation path and no account required — this is framed as a trust argument in onboarding and App Store copy, not just an architecture default, since focus-behavior data is quietly intimate. The store is structured behind a repository boundary so a future opt-in sync layer (CloudKit is the natural fit given the platform) could mirror history across a user's own devices later without touching the adaptation logic itself.

**Shared risk to protect in later phases:** Cold start is a dead zone for the core value prop — for the first handful of sessions the app is just a well-made timer with a promise attached. It must be designed as an honest countdown ("3 more sessions until Interval starts learning your pattern"), with the un-adapted default experience still feeling complete and premium on its own, since a meaningful share of users will judge the whole app before adaptation ever kicks in.

## Detailed Discussion

Both Codex and Claude spent this round doing the same job from complementary angles — Codex focused on making the adaptive system feel trustworthy rather than jerky (bounded recommendation moves, a three-stage learning state instead of a binary "not learning/learning" flip, a clean taxonomy for session outcomes, and a real recovery flow for force-quit sessions), while Claude stress-tested the mechanics underneath that same philosophy (what happens if the user never comes back to log an outcome, clamping bounds so sparse/noisy data can't produce absurd recommendations, a floor so accidental taps don't poison the data, recency weighting so the app doesn't get stuck on stale history, notification permission timing, store-corruption fail-safe, and what happens to paid-tier profile data on subscription lapse).

There's no real fight here, just two people filling in different missing pieces of the same picture. The one place their specifics don't line up perfectly is exactly how force-quit reconciliation surfaces to the user — Codex describes a recovery dialog on relaunch asking the user to classify what happened, Claude wants the system to auto-resolve based on elapsed time and *not* block starting a new session. Those aren't contradictory in spirit (both want honest, accurate history, no silent data loss), so I've merged them below: auto-resolve a provisional outcome immediately, then surface a lightweight, dismissible confirmation rather than a blocking dialog. Everything else stacks cleanly. Gemini didn't participate again.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- Session outcome taxonomy (fixed, five values): completed, stopped early, interrupted, expired-while-away (ran out while backgrounded/locked, unconfirmed), canceled-before-meaningful-progress (near-instant abandon).
- Learning state is three-phase, not binary: **default** (no data, generic schedule), **learning** (enough sessions to show pattern signals in the UI but not enough to move recommendations materially), **adapted** (recommendation is genuinely behavior-driven). Copy and UI must reflect which state is active at all times.
- Recommendation changes move in small, bounded increments — no dramatic swings — and every change is paired with a plain-language reason ("moved from 30 to 28 minutes because you stopped early in 3 of your last 5 afternoon sessions").
- Manual overrides are permitted before a session starts, are logged as signal, but do not instantly retrain the system on their own — sustained override patterns (e.g., repeatedly overriding upward and completing those sessions) can shift future recommendations over time; one-off overrides (a user only has 18 minutes) should not.
- Adaptation math has hard guardrails regardless of what the heuristic computes: a sane min/max clamp on recommended duration, and a floor that excludes degenerate sessions (under ~1 minute) from the adaptation calculation while still keeping them in visible history.
- History uses recency weighting or a rolling window as a v1 decision (not deferred) — old patterns must eventually give way to new behavior, or the "adapts over time" claim stops being true after the first plateau.
- Force-quit / backgrounded-past-end reconciliation: on relaunch, the app auto-resolves a provisional outcome by comparing stored start time + scheduled duration against the current clock (ran to completion untouched → provisional "completed, unconfirmed"), then offers a lightweight, non-blocking confirmation the user can adjust or dismiss — it never blocks starting a new session and never silently drops the session from history.
- Any locally scheduled "session complete" notification must be canceled the moment the user stops a session early from inside the app — no stale notifications claiming a session ended after the user already knows they abandoned it.
- Notification permission is important but not load-bearing: if denied, the app still works fully in-app while foregrounded, with an honest (non-nagging) explanation that lock-screen/background alerts won't fire. Permission should be requested contextually — the first time the user taps start — not at cold launch before any value has been shown.
- Privacy data minimalism is explicit: store only timestamps, planned duration, actual elapsed duration, outcome, optional energy rating, and a coarse time-of-day bucket. No task names, notes, or journaling fields unless a later phase can justify them directly against the adaptive loop.
- A corrupted or unreadable local store fails safe: reset to a fresh empty history with a clear, honest in-app message about what happened — never a launch crash, never silent unexplained data loss.
- Subscription lapse handling for paid-tier data (extra profiles, extended history) is decided now: data is preserved but access is soft-locked (read-only/inaccessible) rather than deleted, satisfying App Store review expectations around not destroying purchased-tier user data.

**Edge cases**
- User never returns to log an outcome at all (phone stays locked for hours, or app isn't reopened) — covered by the auto-resolve rule above.
- Device clock changes mid-session, midnight crossover, or a session landing exactly on a time-of-day bucket boundary — session truth is always derived from stored start/end timestamps, never a continuously running in-memory timer; time-of-day bucketing needs a fixed, documented boundary rule.
- Sparse or highly irregular history (a handful of sessions, no consistent pattern) — clamped output prevents absurd recommendations; UI stays honest about being in "learning," not "adapted."
- Override-heavy users (frequently overriding the recommendation) — treated as a distinct behavior pattern the system can eventually learn from, not noise to discard or an instant override of the baseline.
- Near-instant cancel (accidental launch/tap) — logged for transparency, excluded from adaptation math via the floor threshold.
- Notification permission denied — degraded but functional in-app-only mode, communicated once, not repeatedly.

**Data and privacy implications**
- Data collected is limited to what the adaptation loop needs (timestamps, durations, outcome, optional energy rating, coarse time bucket) — no journaling/task-name creep.
- Local store (SwiftData) will be swept into the user's standard device backup (iCloud/iTunes) by default — this is the user's own backup, not a network call from the app, but it means "never leaves your phone" App Store/onboarding copy should be worded precisely (e.g. "stays on your device and your own iCloud backup," not an absolute never-leaves-the-device claim).
- Corrupted-store recovery must be user-visible and honest, never a silent reset.

**Risk register**
- Notification permission denial degrading the core reliability promise → mitigated by contextual ask + honest in-app degraded-mode messaging.
- Force-quit / backgrounding data loss or ambiguous session state → mitigated by timestamp-based auto-resolution + non-blocking confirmation.
- Stale notifications after early-stop undermining trust in the app's reliability → mitigated by mandatory cancellation on early stop.
- Sparse/noisy/degenerate data distorting recommendations (accidental taps, tiny samples) → mitigated by clamping and a minimum-duration floor.
- Stale personalization (app never lets go of old behavior patterns) → mitigated by recency weighting/rolling window as a v1 requirement.
- Local store corruption causing total data loss (single-copy, local-first) → mitigated by fail-safe reset with honest messaging.
- Subscription lapse destroying paid-tier data → mitigated by soft-lock/read-only rather than deletion.
- Accessibility risk: live countdown over-announcing via VoiceOver, and the "why" explanation text clipping under Dynamic Type → named as a requirement (milestone-based announcements, explicit Dynamic Type check on that specific string), not a nice-to-have.

**Final assumptions**
- Interruption/stopped-early classification is primarily self-reported at the two-tap outcome screen, not passively inferred from system signals (call interruptions, backgrounding duration) — passive detection is out of scope for v1 to avoid misclassification risk.
- Exact recency-weighting formula and the exact grace-window duration for auto-resolving an unconfirmed session are left as tunable implementation details for the architecture/build phase, not re-litigated here — the requirement is that some form of both exists, not their precise constants.
- Backup inclusion (iCloud/iTunes sweeping up the local store) is accepted as expected platform behavior and handled via precise copy, not an engineering exclusion.

## App Features

Codex and Claude both converged again — Claude took what was decided in earlier phases (the loop, the guardrails, the taxonomy) and turned it into an actual MoSCoW list with real numbers attached, and Codex's independent pass landed on almost the same shape from the "trust curve" framing. Where they overlap is nearly total: both put the home/timer screen with inline "why," the resilient session runner with lock/background survival, fast outcome capture, local history, the adaptation engine with hard guardrails, cold-start/degraded-mode honesty, and a real (not mockup) paywall boundary all in must-have. Both independently rule out the same things too — no task manager/calendar/habit tracking/streaks/social, no second manual timer, no standalone time-of-day recommendation engine, no cloud/account/telemetry.

The one real difference is that Codex kept some algorithm constants as "tunable, decide later" (grace windows, exact thresholds), while Claude went further and hard-committed actual numbers now — 25/5 default, 5-session learning threshold, 10–90 min focus / 3–20 min break clamps, 20-session rolling window for free tier, 10%-or-5-minute step cap per recalculation, ≥90%/<90% elapsed-time reconciliation split, ±5 second notification tolerance. Claude's argument is that a must-have with an undefined threshold isn't actually decided — it's a deferred argument with a checkbox on it, and this phase's job is specifically to produce acceptance criteria, not punt them again. Codex never objected to specific numbers, just hadn't proposed them yet, and nothing here contradicts anything Codex said (bounded increments, clamps, floor exclusion, rolling window as v1 — Codex already agreed to all of that in the prior phase, Claude is just supplying the constants). I'm treating this as Claude sharpening Codex's position rather than a real fork, since Codex's own council explicitly deferred these exact numbers to "architecture/build phase" and this is that moment.

Both also agree on cutting Live Activity/Dynamic Island and a home screen widget to could-have (not must), on keeping the paid tier as "more contexts + deeper math" (multi-profile, extended history, pattern-insights view), and on holding the app to 3-4 tabs max with the "why" never buried off the home screen.

No open disagreement worth another round. Gemini didn't participate again.

CONSENSUS: YES

## Final Output

**Must-have features** (each with a concrete, testable acceptance condition):

1. **Adaptive home/timer screen** — shows current recommended focus + break length, current learning state, and a one-line "why" once adapted. *Acceptance:* fresh install shows fixed 25/5 defaults with zero personalization language; once adapted, every changed recommendation carries an inline plain-language reason on this screen, never buried in a separate tab; starting a session is one tap away.

2. **Start-with-override** — user can start the recommendation as-is or adjust duration before starting. *Acceptance:* an override is logged as the session's planned duration, distinct from the engine's recommendation, so the two can diverge in history and feed override-pattern learning later.

3. **Resilient session runner** — local `UNUserNotificationCenter` notifications for session-end/break-end; survives lock, background, and force-quit. *Acceptance:* notification fires within ±5 seconds of scheduled end even after kill/lock; stopping early cancels the pending notification immediately (test asserts zero pending notifications for that session ID post-stop).

4. **Outcome capture on the fixed 5-value taxonomy** (completed, stopped early, interrupted, expired-while-away/unconfirmed, canceled-before-meaningful-progress). *Acceptance:* every terminal session gets exactly one taxonomy value; normal end flow closes in two taps plus optional energy rating.

5. **Relaunch reconciliation** — auto-resolves sessions that ran while the app was killed/backgrounded, using elapsed-vs-planned time: ≥90% elapsed → completed-unconfirmed; below 90% (above the degenerate floor) → expired-while-away. Surfaces as a dismissible, non-blocking banner; never blocks starting a new session; never silently drops a session. *Acceptance:* tested across a kill-time matrix (10%, 50%, 95%, 100%+ of planned duration).

6. **Local history/log screen** listing past sessions with outcome tags, so the "why" explanation is independently checkable against real data.

7. **Adaptation engine** for duration + break-length only, with hard guardrails: focus clamped 10–90 min, break clamped 3–20 min, sessions under 60 seconds excluded from the math (but kept in visible history), recommendation moves capped at 10% or 5 minutes per recalculation (whichever is smaller), rolling window of last 20 sessions (free) / effectively unbounded (paid). *Acceptance:* synthetic histories engineered to want a bigger jump or an out-of-range value still land inside the clamp and step cap — covered by an automated unit test suite, not manual spot checks.

8. **Three-phase learning-state UI** (default / learning / adapted) reflected everywhere it's shown, with a committed threshold: fewer than 5 non-degenerate completed sessions = learning (pattern signals may show, recommendation stays at default); 5+ = adapted, recommendation can move. *Acceptance:* automated test asserts the recommendation cannot move off default before session 5 regardless of synthetic data fed in.

9. **Contextual notification permission request** (asked at first "start," not cold launch), with honest one-time (non-repeating) degraded-mode messaging if denied, and full in-app-only functionality preserved either way. *Acceptance:* deny permission in a test run → timer still runs/completes correctly foregrounded, no re-prompt/nag on later launches.

10. **Corrupted-store fail-safe** — unreadable local store resets to empty history with an explicit in-app message; never a crash, never a silent wipe. *Acceptance:* test deliberately corrupts the store file and asserts a clean recovery with visible messaging.

11. **Real StoreKit 2 subscription flow** gating multiple session profiles, extended/full history, and the pattern-insights view — kept as must-have (not should), since "realistic path to monetization" was a hard requirement from the prompt contract, not a mockup screen. *Acceptance:* sandbox purchase, restore, and lapse are all exercised; lapse triggers the already-agreed soft-lock (data preserved, read-only, never deleted).

12. **Local data reset/delete control** in settings. *Acceptance:* one control wipes all locally stored session/behavioral data on confirmation.

13. **Accessibility built in, not bolted on** — VoiceOver gets milestone-based (not per-second) countdown announcements; the "why" string is explicitly checked against largest Dynamic Type sizes for clipping. *Acceptance:* both are explicit test cases.

14. **Zero-network-calls audit** across the timer/logging/adaptation code path, enforced by an automated check, not a promise in a doc.

**Should-have:** multiple named session profiles beyond the single default (paid, but only "should" once the free single-profile loop is airtight — building the upsell before the thing it upsells is out of order); a proper weekly/monthly pattern-insights view beyond the one-liner (paid-gated); an expandable "more detail behind this recommendation" view; optional one-tap energy rating at outcome capture (deliberately not must — the adaptation math must work correctly even if it's never used, since most users will skip it); a polished non-error-feeling recovery banner UI (same logic as the must-have reconciliation, better presentation); basic export/reset visibility in settings beyond delete-everything; a lightweight standalone insights screen — can collapse into Home + History if build time is tight without breaking the product promise.

**Could-have:** shareable weekly pattern card for niche/community growth; a simple explicit onboarding sequence for default/learning/adapted (can otherwise live inline on Home); a profile/paywall preview UI without real multi-profile logic; Live Activity/Dynamic Island presence during a session (first thing to cut under time pressure — the backgrounding requirement is already fully satisfied by local notifications alone, and it would add a separate extension target + entitlements + its own test surface); home screen widget showing today's recommendation (same reasoning, arguably lower value); richer haptics/motion/visual polish beyond the core flow.

**Won't-build:** task manager, calendar integration, habit tracking, streaks/badges/social/accountability features; background audio or soundscapes; a second manual/free-form timer alongside the adaptive one; multiple simultaneous concurrent sessions; cloud sync or any account creation in v1; analytics/telemetry SDKs; passive interruption detection via system signals (self-reported outcome only); a standalone time-of-day recommendation engine as its own surface (time-of-day stays an explanatory input only); Siri/Shortcuts/App Intents integration; Apple Watch companion app; data export/import beyond the simple local delete-everything control.

**UX shape:** three to four tabs max — Home/Timer, History, (Insights, could collapse into Home+History), Settings. The "why" explanation must live on Home, never require a detour to prove the app is honest.
