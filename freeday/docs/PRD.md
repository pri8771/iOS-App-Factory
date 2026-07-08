# freeday — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both of them landed in the same place — Claude's contribution isn't a disagreement with Codex's contract, it's sharpening it with the specific edge cases a rushed build would otherwise fumble. Nobody is contesting scope, priorities, or the shape of the output. This reads as a converged phase.

Where they agree: preserve the prompt verbatim, treat the five core workflows (habit setup, non-punitive streak/relapse, craving timer, milestone card, multi-habit paid tier) as the non-negotiable bar, keep it fully local-first with no network dependency, no LLM coaching, no clinical/medical framing, and require a real compiling StoreKit-backed app rather than a mocked shell. Both also agree Live Activity/widget are real v1 scope but are the first things allowed to degrade under time pressure, since the five core workflows are what "production-ready" actually hinges on.

Claude's additions that Codex didn't contradict and that tighten the contract rather than change it:
- The invalidation criteria ("relapse-loggers don't return within a week") can't be measured with real telemetry because there's no network layer — so it gets verified via a written non-shaming UX checklist instead (no "streak broken" language, no red/warning colors, lifetime-total stat always visible through resets, no punitive confirmation friction), not through data that will never exist.
- "Cost-per-use" alone doesn't yield a savings rate — habit setup needs both a usage-frequency input and a cost-per-unit input, plus an explicit, non-silent rule for what happens to historical savings when a user edits those inputs later.
- The SwiftData model must support multiple habits unconditionally from day one; only the UI/entitlement layer enforces the one-habit-free gate, so there's no fake single-habit schema requiring a breaking migration later.
- Uniqueness against sibling apps in this same portfolio run can't be self-verified here since this app doesn't see the other four — flag it as a check to run when sibling concepts are known, not silently assume no overlap.

No open disagreement remains — this is refinement, not conflict.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (Freeday — habit-quitting/craving-tracker MVP, child of the multi-app-exp7 portfolio batch, build priority 5).

**Hard requirements:**
- One SwiftUI app, local-first, SwiftData-backed, zero network dependency in v1, deployed to its own `freeday/app_build` folder only.
- Five core workflows must be fully functional, not mocked: (1) habit setup capturing **quantity-per-day** and **cost-per-unit** (not just "cost-per-use") so savings math is well-defined; (2) daily streak tracking with one-tap **non-punitive** relapse-and-restart that preserves a lifetime-total stat unaffected by reset; (3) a 90-second guided craving-timer "ride it out" flow, fixed content, works fully offline; (4) a shareable milestone streak+savings recap card via ShareLink; (5) multi-habit management gated to the paid tier.
- Data layer supports N habits unconditionally from day one; only the UI/entitlement layer enforces the free-tier one-habit limit — no breaking migration deferred to later.
- Editing cost/frequency inputs after streak accrual must have an explicit, documented, non-silent recompute rule (retroactive vs. forward-only — pick one and state it).
- StoreKit 2 paywall: real entitlement gating, restore purchases, local `.storekit` config — not a toggle.
- Live Activity (craving-timer) and WidgetKit (streak+savings) are in scope but are the first pieces allowed to degrade/stub if time runs short — core workflows are not.
- Haptics on streak-day and craving-timer completion.
- Every screen that can reach empty/loading/success/error states must implement all four.
- Accessibility baseline: Dynamic Type, VoiceOver, 44pt hit targets, WCAG AA contrast.
- Design system: soft mint-to-sky-blue gradients, rounded iconography, sunrise/counter "days free" motif, non-clinical/non-shaming visual language, documented as a design system (tokens/components/states), and visually distinct from the other four sibling apps in this batch.
- Copy throughout must stay in "personal tracking tool" territory — never medical/clinical/addiction-treatment framing.

**Non-goals:** LLM chat coaching, AR/ML features, CloudKit sync or any backend dependency in v1 (architecture should leave the door open, no sync code shipped), anonymous community/social feed, analytics/telemetry pipeline, punitive streak-reset messaging, re-running app ideation (app is already selected as Freeday for this child project).

**Production-readiness definition:** a real compiling Xcode project with SwiftData models for Habit/RelapseEvent/CravingSession; all five core workflows wired end-to-end with no hardcoded/mocked data; empty/loading/success/error states everywhere reachable; StoreKit 2 entitlement logic actually gating multi-habit access with a working restore flow; relapse-flow copy and visuals audited against the non-shaming checklist; accessibility baseline met. A UI shell with static data, a fake paywall toggle, or a craving timer with no real completion state is a demo, not done, and must be reported as such rather than rounded up.

**Decision rules for later phases:**
1. The invalidation criterion (relapse-loggers abandoning within a week) is verified via a written non-shaming UX checklist, not via telemetry — no analytics pipeline gets added to chase this, since that would break local-first.
2. If any interpretation conflicts with local-first, default to local-only unless the user explicitly approves a network dependency.
3. If mass-market clarity/design distinctiveness conflicts with niche feature depth, preserve mass-market clarity and defer the complexity.
4. If paywall/pricing copy conflicts with the non-shaming tone, empathy and trust win over conversion optics.
5. Under time pressure, Live Activity and widget degrade or get stubbed first; the five core workflows are never cut or faked.
6. Any copy or feature readable as medical/clinical advice gets rewritten or removed — no exceptions.
7. If a sibling app in this same portfolio run turns out to also be a streak/habit tracker, that's a hard uniqueness conflict per the parent prompt and must be reported, not silently waved through.
8. Smaller, fully complete app beats a larger, partially-built one.

## Product Research

CONSENSUS: YES

## Final Output

Both agents converged fast here — no real disagreement, just Codex framing the product philosophy and Claude naming the sharp edges that would otherwise bite during build. Nobody contested the direction.

**Audience and use context:** Mass-market opportunistic users — people cutting cigarettes, vaping, sugar, alcohol, or doomscrolling who bounce in and out based on stress spikes rather than committing to a dramatic life-change program. Cravings hit at inconvenient, often public moments (mid-meeting, on a date, driving), so the "I'm craving right now" entry point must be one tap from the home screen, not buried in navigation — especially since Live Activity/widget are the first things allowed to degrade under time pressure per the prompt contract.

**Comparable apps/patterns:** I Am Sober (closest analog — multi-vice, streak, money-saved math — but its retention engine is a social check-in feed, which this spec deliberately excludes; that's a named tradeoff, not a free lunch), Smoke Free/QuitNow! (single-substance, so Freeday's cross-habit engine is a real differentiator), Kwit (cutesy pet-gamification aesthetic to explicitly avoid, since the spec wants calm/non-gamified), Streaks (validates the home-screen-widget-as-daily-reminder pattern).

**Platform-specific opportunities:** Lean on native trust-builders — widget for glanceable momentum, haptics and motion for calm delight, ShareLink for the milestone card. Live Activity is "optional delight" not core; treat it as opt-in/degradable, not a foundation the core experience depends on.

**Major assumptions and risks named:**
- Removing the community/social layer (per contract) means the app has to earn retention entirely through streak/widget visibility and craving-support quality — untested assumption, flagged not assumed safe.
- The 90-second craving timer must survive backgrounding — anchor to a stored wall-clock start time and compute elapsed/remaining from `Date()` on every appearance, not a naive pausing `Timer`, since a broken session during a real craving is the worst possible failure moment.
- Streak-day math is an off-by-one/timezone/DST minefield and is the most-scrutinized number in the app (shown on main screen, widget, share card) — decided now: streak = full calendar days elapsed in the device's current local timezone, computed fresh from stored event timestamps on every read, never a cached incrementing counter.
- The one-habit-free paywall boundary needs to be visible *before* a user invests setup effort in a second habit, not sprung on them after — consistent with the non-shaming/trust tone already locked into the contract.
- Money-saved formula transparency beats sophistication: if a user edits cost/frequency inputs, the recompute rule must be visibly stated at the point of edit (ties back to the prompt-contract phase's decision to require an explicit, non-silent recompute rule).
- Milestone share card must hold up under Dynamic Type and dark/light export — a broken share card kills the viral loop that's the whole point of the artifact.
- Local daily-reminder notifications (`UNUserNotificationCenter`) are a plausible, fully local-first-compatible addition used by every comparable app, but they're not in the five core workflows — if cut for time, that's a named tradeoff, not an oversight; if built, it needs its own permission-denied/settings-redirect state like any other reachable state.

**Implication for the first build:** get streak/day-boundary logic and the non-shaming relapse flow airtight before touching Live Activity or widget polish — those two are invisible when correct and glaringly wrong every single day when not, whereas Live Activity/widget can degrade gracefully per the existing decision rules.

## Portfolio Selection

CONSENSUS: YES

## Final Output

Quick, no drama on this one: both of them landed exactly where they had to. This is a child project inside the multi-app-exp7 portfolio — the actual 5-app selection already happened one level up, and Freeday was one of the picks. There's nothing left to select here.

So the decision for this phase is simple:

- **No portfolio split needed.** Freeday is a single independent app, not a portfolio parent. No portfolio-json manifest, no sibling child folders, no additional app-selection work.
- Output stays as one app project at `freeday/app_build`.
- Selection lock (already fixed by the parent): slug `freeday`, category Habit Quitting / Craving Tracker, promise "track any habit you're quitting, watch your clean streak and savings grow," target user is the broad mass-market population cutting cigarettes/vaping/sugar/alcohol/doomscrolling, build flag = true.
- Rejected alternatives: none considered this phase — re-running ideation would be redoing work the parent portfolio phase already finished, and is explicitly out of scope for a child project.

Claude's user-advocate framing (the "craving hits at your desk, one tap or you lose them" scenario) didn't change this decision — it's a reinforcement of priorities already locked in prompt_contract and product_research (one-tap craving entry, non-shaming reset, free tier as a genuinely complete product rather than a crippled trial), not a new scope decision for this phase. Worth carrying forward into build, but it doesn't change the answer here: single app, no split, move to the next phase.

## Initial Discussion

CONSENSUS: YES

## Final Output

Both agents landed in the same place and just built on each other rather than disagreeing.

**The product promise:** Freeday is one app where naming any habit you're quitting gives you a non-shaming daily streak, a running savings total, and a 90-second in-the-moment tool to survive a craving — and if you relapse, only the current streak resets, never your lifetime history.

**Primary user/scenario:** someone days into cutting a habit (vaping, sugar, doomscrolling, whatever), checking in most of the time in a low-stakes "just glancing at my streak" mode, but occasionally opening the app in a high-stakes "craving right now, need help in 3 seconds" mode. Both moods have to live on one home screen without the emergency path getting buried.

**Core loop:** open app → see today's status (streak, lifetime days free, money saved) → either nothing, or tap into the 90-second craving ride-out (which logs its own always-positive "cravings survived" counter, separate from streak, so there's still a win to point to right after a relapse), or tap the one-tap relapse/reset that shows the reset and the untouched lifetime stats in the same glance, not a tap-through. Milestones periodically surface the shareable card, plus a "share progress" option available any time.

**New scope decisions that came out of this round (nobody contested them):**
- No backdated relapse logging — timestamp is always "now," to keep streak math simple and avoid a date-picker/recompute rabbit hole.
- Craving-timer flow has one ending, period — no "did this help?" branching into relapse logging. Keeps the most emotionally loaded screen from tripling its state count.
- No journaling/notes, no photos, no customizable reminder schedules, no "why did you crave" prompts — this is a tracker and a timer, not a diary.
- Flat navigation: home/today, history/milestones, settings. Craving timer and relapse logging are full-screen modals off home, not tabs — tab bar stays at 3 items even for paid multi-habit users.
- Free-tier users with one habit shouldn't see any multi-habit chrome (switcher, grayed "add habit" button) at all — that UI only renders once a second habit exists. This is an IA decision to bake in now, not something to retrofit behind a paywall flag later.

**Hard scope boundaries:** local-first SwiftData for N habits/relapse events/craving sessions, on-device savings math, the five core workflows fully real (setup with quantity+cost, non-punitive one-tap reset, fixed 90-second craving sequence, milestone share, paid multi-habit gating). Widget/Live Activity degrade first under time pressure. No network, no medical framing, no LLM coaching, no community feed, no backend sync, no hidden analytics, no punitive tone, no backdating, no journaling.

**Measurable success criteria:** cold-open to started craving timer in one tap; cold-open to a completed relapse-log with lifetime stats visible in one tap plus at most one confirmation; every other core screen reachable within two taps of home; milestone share card renders cleanly at max Dynamic Type size in both light and dark mode; setup-to-first-streak-state achievable in under 90 seconds.

No open disagreement — this phase is ready to close.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Both Codex and Claude wrote essentially the same brief from different angles and nothing here is in conflict — Codex laid out the product vision, Claude stress-tested it for gaps, and everything Claude added sharpens rather than contradicts.

**Target user and use case:** Someone actively mid-fight with one specific habit right now (cigarettes, vaping, sugar, alcohol, doomscrolling) — not a "reflect on my relationship with X" wellness user. They want exactly two things: a daily number proving they're winning, and a tool for the sixty seconds they're about to lose. If a flow ever asks them to journal or read more than a sentence during a craving, it's failed.

**Paid value / subscription value — the one real addition this round:** Free tier gets one habit, streak/lifetime tracking, milestone cards, and **one solid guided craving sequence**. Freeday+ ($4.99/mo, $29.99/yr) unlocks unlimited concurrent habits, the Lock Screen Live Activity, and — this is the concrete build requirement that came out of this round — **2-3 interchangeable guided craving-timer variants** (e.g. breathing-paced, distraction/counting, body-scan), so "full craving-support toolkit" is an actual toolkit and not just a relabeled multi-habit gate. Everyone agreed this needs to be locked now as a build requirement, not left to design to improvise.

**Core loop:** open → today's card (streak, lifetime days free, money saved, cravings-survived count) → nothing, or one-tap craving timer, or one-tap non-punitive relapse/reset. New rule nailed down this round: only a full 90-second completion increments "cravings survived" — an abandoned session (call interrupted, phone dies) writes nothing, no partial credit and no penalty, so nobody building the timer has to invent that behavior on the spot.

**Competitive wedge:** one flexible engine across habits vs. every competitor being single-substance, plus a non-shaming reset most competitors get wrong. Both agents flagged this wedge as fragile — it lives entirely in relapse-flow execution quality, not the pitch, so that screen gets the highest scrutiny in build and review.

**Viral/growth angle:** the milestone share card is the whole engine, no social feed. New decision this round: don't wait for big round-number milestones (7/30/90/365 days) to show a card — include an early, cheap milestone (day 1 or day 3) so brand-new users see the shareable artifact almost immediately, since most churn happens before day 7. Also locked in: a visible, tappable "how we calculate this" affordance near the savings number, since a silently-computed number that a user distrusts erodes the app's core hook with no natural correction moment (unlike a streak day, which self-corrects at midnight).

**Local-first / cloud-ready plan:** everything (habit config, event log, craving sessions, savings computation) lives in SwiftData, zero network calls in v1. Repository/store boundary is written so a CloudKit-backed implementation of the same protocol can swap in later without touching view/view-model code — an architecture discipline decision for this build, not a deferred promise.

No open disagreement — Claude's additions (craving-toolkit variety requirement, abandoned-session rule, early milestone timing, visible savings-formula affordance) are concrete tightenings that Codex's framing already implied but hadn't nailed down. Ready to close.

## Next Steps Small

Both agents landed on essentially the same shape and Claude's round-1 pushback was more of a "make sure we polish this, not shrink it" reframe than an actual disagreement — Codex proposed a specific minimal loop, Claude accepted its bones but argued to keep the milestone share card and backgrounding-safe timer inside the slice rather than treating them as trimmable. Nobody contested the cut list in substance, just the emphasis on why the card matters.

CONSENSUS: YES

## Final Output

**MVP slice:** One complete emotional loop, not a feature checklist. A fresh install can: create one habit (name, quantity-per-day, cost-per-unit) → see the today screen (streak, lifetime days free, money saved, cravings-survived) → run the one default 90-second craving timer (wall-clock-anchored so it survives backgrounding, only a full completion increments the counter) → trigger the one-tap relapse/reset that shows the reset and the untouched lifetime stat in the same screen → reach an early milestone (day 1 or day 3) that renders a real ShareLink milestone card. That's the whole arc of the product compressed into one sitting, and it's the thing that has to feel good before anything else gets built.

**Must-have interactions:**
- Habit creation/edit capturing quantity-per-day + cost-per-unit, with the recompute rule (forward-only from edit time) visibly enforced, not silently applied.
- Today screen with real empty/loading/success/error states.
- Streak computed fresh from stored event timestamps using local-timezone calendar days — never a cached counter.
- Craving timer anchored to a stored start timestamp, resumable correctly after backgrounding; only full completion counts, abandoned sessions write nothing.
- Relapse/reset as one tap, with the reset confirmation and lifetime-stat reassurance rendered in the same screen, not a tap-through.
- Milestone share card firing early (day 1 or 3), rendering cleanly via ShareLink at max Dynamic Type in both light and dark mode.
- A basic StoreKit boundary that blocks a second habit and can unlock via subscribe/restore — but its only job this slice is gating habit #2, not the full toolkit behind it.
- Free-tier boundary visible before a user invests effort setting up a habit they can't have.

**Cut list (explicit, not implicit):** multi-habit switcher/management UI beyond the single paywall gate check, the 2-3 interchangeable craving-timer content variants (ship one default sequence only), Live Activity, WidgetKit, daily reminder notifications, history/calendar detail screens beyond what substantiates the milestone card, settings beyond habit-edit and restore purchases, community/social features, backdating, journaling. These are real v1 scope per the contract, but this phase proves the loop first — consistent with the standing rule that Live Activity/widget degrade before core workflows.

**Validation criteria:**
1. Fresh install → tapping only the core loop → a rendered milestone share card in under two minutes.
2. Relapse screen passes the non-shaming checklist on sight: no red/warning color, no "streak broken" language, lifetime stat visible without a second tap.
3. Craving timer survives being backgrounded mid-session and resumes with correct remaining time.
4. Streak is never negative and never erases lifetime history; savings value matches the stated forward-only formula after a cost/frequency edit.
5. Milestone share card renders without clipping at max Dynamic Type size, in both light and dark mode.

If all five hold, the concept is proven for real — even though multi-habit UI, extra craving variants, Live Activity, and widget don't exist yet in this slice.

## Detailed Discussion

Both of them are pulling in the same direction — Codex laid out the full resolved-requirements picture (multi-habit schema from day one, one-tap relapse/timer, streak-from-timestamps math, forward-only savings recompute, StoreKit as the one paywall unlock), and Claude's contribution is entirely additive: naming specific unresolved edge cases that Codex's brief didn't cover and proposing concrete resolutions for each rather than disputing anything already locked. Nothing here is contested — it's the same "sharpen, don't argue" pattern as every prior phase in this app's history.

CONSENSUS: YES

## Final Output

**Resolved requirements** (carrying forward and finalizing everything locked in prior phases, plus this round's new decisions):
- SwiftData supports N habits from day one; free tier UI/entitlement blocks habit #2 creation before setup effort is invested, not after.
- Habit setup requires name + quantity-per-day + cost-per-unit; no backdated relapse logging; relapse is one tap, timestamped "now," resets only the current streak, never touches lifetime totals — reset confirmation and lifetime-stat reassurance render in the same screen.
- Streak = full clean calendar days since last relapse timestamp, computed fresh on every read in the device's current local timezone — never a cached counter.
- Craving timer is wall-clock-anchored (stored start time, not a naive `Timer`); only a full 90-second completion increments "cravings survived"; abandoned sessions write nothing.
- **New this round — force-quit recovery, decided:** on relaunch, if a stored session's start-time + 90s has already elapsed, treat it as abandoned (no retroactive auto-credit); if not yet elapsed, resume the countdown from the stored timestamp without replaying content from the start.
- **New — habit deletion, previously unaddressed:** allowed, one confirmation step, cascades to delete that habit's craving sessions and relapse events too. No orphaned rows, no "recover a deleted habit" feature in v1.
- **New — subscription expiration behavior, previously unaddressed:** data for every habit is preserved forever; on lapse, only one habit (most recently active) stays interactive, others go read-only until resubscribed. Never deleted, never silently reset — this is a hard trust rule, not a paywall-copy nuance.
- StoreKit 2: unverified transactions (`checkVerified` failure) hard-block entitlement, never soft-warn; `Transaction.updates` listened to from app launch; real "Restore Purchases" affordance in settings (App Review requirement).
- Milestone card fires early (day 1 or 3); **new** — needs an explicit "already shown this threshold" flag per habit so it doesn't retrigger every app open past that day, since streak is recomputed fresh rather than event-driven.
- Forward-only savings recompute on cost/frequency edits, visibly enforced with a "how we calculate this" affordance.
- Every reachable screen (Home, setup, paywall, timer, relapse, milestone) implements empty/loading/success/error states; **new** — the app also needs an app-level store-load-failure state (corrupt store, disk full, migration failure), since that failure happens before any screen exists to host a per-screen error.

**Edge cases enumerated:** first launch with zero habits; force-quit mid-timer (resolved above); app backgrounded/foregrounded across midnight or a timezone change; relapse and day-boundary rollover in the same session; editing habit economics after days have accrued; free user attempting habit #2; zero/negative/decimal cost values; devices without haptic support; VoiceOver + max Dynamic Type on the milestone card and the sunrise/counter motif specifically (needs an accessible label stating the actual number, not just a decorative glyph); stale entitlement after restore/cancel/reinstall; duplicate/overlapping timer sessions; subscription lapse with 2+ habits active (resolved above); habit deletion (resolved above); SwiftData store failure at launch (resolved above).

**Data and privacy implications:** fully local, SwiftData-only, zero telemetry/analytics/crash reporting, zero network calls except StoreKit itself. Named and accepted as an explicit v1 exclusion (not an oversight): no Face ID/passcode app-lock, even though habit/relapse/craving data is sensitive personal information that could be seen by anyone who picks up the device. No export/secondary persistence beyond an opt-in export path. No notification/HealthKit/calendar permissions requested in this slice — if reminders get added later, permission-denied gets its own first-class state like any other reachable state.

**Risk register:**
1. Timezone travel can jump the streak count forward or backward by a day with no relapse involved — accepted as a **named limitation** of the already-locked "local timezone, recomputed fresh" streak rule, not a bug to silently fix later.
2. Retention without a social/community layer is unproven — mitigation is making the two critical moments (one-tap rescue, non-shaming relapse) unquestionably good, since that's the only lever left.
3. Savings-math trust erosion if the formula ever feels invented — mitigated by the visible recompute rule and "how we calculate this" affordance.
4. Relapse-flow execution quality is the entire competitive wedge — any regression here breaks the pitch, not just the screen.
5. Milestone re-triggering without an idempotency flag would spam the share prompt — mitigated by the per-habit "already shown" flag decided this round.
6. Subscription-lapse data loss would break the "we never erase your history" promise — mitigated by the read-only-not-deleted rule decided this round.

**Final assumptions:** local device timezone is the sole source of truth for calendar-day streak math; a "day" is a full clean calendar day, not a wall-duration window; cost-per-unit/quantity-per-day are user-estimated, not verified figures; local-only storage is acceptable for v1 launch with no app-lock; paid craving-sequence variants can be staged as a fast-follow within the same build batch without an architecture rewrite.

No open disagreement — ready to close this phase.

## App Features

CONSENSUS: YES

## Final Output

Codex and Claude both drew the line in the same place — the five core workflows plus the infrastructure that keeps them honest are Must, everything else is Should/Could, and the explicit Won't-list from earlier phases carries forward untouched. Claude's round added real value by converting Codex's acceptance criteria from feature descriptions into actual test cases (screenshots, specific timings, specific store queries) — that's a sharpening, not a disagreement. Nobody contested the MoSCoW placement of anything.

### Must-have features (with acceptance criteria)

1. **Habit setup** (name, quantity-per-day, cost-per-unit)
   - Zero/negative/invalid cost or quantity rejected inline at entry, never silently accepted.
   - Editing cost/frequency after days have accrued visibly shows the forward-only recompute rule at the moment of edit; historical savings before the edit point do not change.
   - Habit deletion (one confirmation) cascades to delete that habit's relapse events and craving sessions — verified by no orphaned rows, not just UI disappearance.

2. **Today/Home screen** (streak, lifetime days free, money saved, cravings-survived)
   - Four explicit states: zero habits (empty), SwiftData still loading on cold launch, steady-state success, and app-level store-open failure (corrupt store/disk full/migration failure) — the last one written down as its own numbered state, not assumed to be "some screen's problem."
   - Free tier: no multi-habit chrome renders with exactly one habit.

3. **Non-punitive relapse/reset (one tap)**
   - The very next frame after tapping reset shows both "streak reset to day 0" and the untouched lifetime total in the same view — no red, no "broken" language, no second navigation to find the reassurance. Screenshot-testable in five seconds.

4. **Craving-timer rescue flow (90s, wall-clock anchored)**
   - Force-quit mid-session, relaunch: if stored start + 90s already elapsed → treated as abandoned, no retroactive credit; if not yet elapsed → resumes countdown from stored timestamp, doesn't replay content from the start.
   - Backgrounded mid-session and returned: remaining time computed from stored start timestamp, not a suspended/paused counter. Concrete test: background at second 40, wait 2 real minutes, foreground → reads zero remaining, completion already fired.
   - Only a full 90-second completion increments "cravings survived"; abandoned sessions write nothing.

5. **Milestone recap card + ShareLink** (fires early, day 1 or day 3)
   - Renders without clipping the dollar figure or day count at max Dynamic Type, in both light and dark mode.
   - Per-habit "already shown this threshold" flag: opening the app 5 times after crossing day 3 fires the milestone prompt exactly once.

6. **StoreKit 2 entitlement gating habit #2** (real, not a toggle)
   - Attempting habit #2 as free tier shows the paywall before any setup fields are shown.
   - Unverified transaction (`checkVerified` failure) hard-blocks entitlement, never partially grants.
   - Restore Purchases is reachable from settings and actually re-scans entitlements via `Transaction.currentEntitlements`, not a cached flag.

7. **App-level and per-screen state coverage**
   - Every reachable screen (Home, setup, paywall, timer, relapse, milestone) implements empty/loading/success/error states.
   - Accessibility baseline: 44pt targets, VoiceOver labels stating actual numbers on the sunrise/counter motif and milestone card, WCAG AA contrast.

### Should-have (real value, build survives without it this pass — cut must be reported, not silent)
- Second/third craving-timer content variant beyond the one default sequence.
- Live Activity and WidgetKit (standing degrade-first rule).
- Multi-habit switcher UI for paid users past habit #2, and subscription-lapse read-only degradation (both decided in prior phases, but unreachable in a single-habit QA pass).
- "How we calculate this" savings-formula affordance.

### Could-have
- Daily reminder notification (with its own permission-denied state if built).
- Settings beyond habit-edit and restore-purchases.
- History/calendar screen beyond what substantiates the milestone card.
- Haptic customization, alternate app icons.

### Won't-build (restated so it doesn't get reopened mid-build)
- Backdated relapse logging, "did this help?" branching inside the craving timer, journaling/notes, photo attachments.
- Community/social feed, CloudKit sync, LLM-based coaching.
- Face ID/passcode app-lock, analytics/telemetry/crash reporting.
- Customizable reminder schedules, clinical/medical framing, punitive streak-shame visuals.

No open disagreement — this phase is ready to close.
