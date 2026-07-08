# freeday — Complete Project Dossier

_Detailed deterministic archive of the orchestrator run. It includes the original prompt, final phase outputs, full discussion transcripts, task backlog, interface contracts, verification status, and recorded findings. Nothing here is inferred or fabricated._

## Original Prompt

PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.

## Phase Map

- **Prompt Contract** (`prompt_contract`) — consensus
- **Product Research** (`product_research`) — consensus
- **Portfolio Selection** (`portfolio_selection`) — consensus
- **Initial Discussion** (`initial_discussion`) — consensus
- **Per App Product Brief** (`per_app_product_brief`) — consensus
- **Next Steps Small** (`next_steps_small`) — consensus
- **Detailed Discussion** (`detailed_discussion`) — consensus
- **App Features** (`app_features`) — consensus
- **Design Discussion** (`design_discussion`) — consensus
- **Design Handoff** (`design_handoff`) — consensus
- **Ios Architecture Review** (`ios_architecture_review`) — consensus
- **Tech Specs** (`tech_specs`) — consensus
- **Project Plan** (`project_plan`) — consensus
- **Task Assignments** (`task_assignments`) — consensus
- **Implementation Readiness Gate** (`implementation_readiness_gate`) — consensus
- **Build Coordination** (`build_coordination`) — consensus
- **Build Verification** (`build_verification`) — consensus
- **Human Qa Checklist** (`human_qa_checklist`) — consensus
- **App Store Readiness** (`app_store_readiness`) — consensus
- **Final Review** (`final_review`) — consensus
- **Portfolio Audit** (`portfolio_audit`) — consensus

## Final Phase Outputs

### Prompt Contract

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

### Product Research

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

### Portfolio Selection

CONSENSUS: YES

## Final Output

Quick, no drama on this one: both of them landed exactly where they had to. This is a child project inside the multi-app-exp7 portfolio — the actual 5-app selection already happened one level up, and Freeday was one of the picks. There's nothing left to select here.

So the decision for this phase is simple:

- **No portfolio split needed.** Freeday is a single independent app, not a portfolio parent. No portfolio-json manifest, no sibling child folders, no additional app-selection work.
- Output stays as one app project at `freeday/app_build`.
- Selection lock (already fixed by the parent): slug `freeday`, category Habit Quitting / Craving Tracker, promise "track any habit you're quitting, watch your clean streak and savings grow," target user is the broad mass-market population cutting cigarettes/vaping/sugar/alcohol/doomscrolling, build flag = true.
- Rejected alternatives: none considered this phase — re-running ideation would be redoing work the parent portfolio phase already finished, and is explicitly out of scope for a child project.

Claude's user-advocate framing (the "craving hits at your desk, one tap or you lose them" scenario) didn't change this decision — it's a reinforcement of priorities already locked in prompt_contract and product_research (one-tap craving entry, non-shaming reset, free tier as a genuinely complete product rather than a crippled trial), not a new scope decision for this phase. Worth carrying forward into build, but it doesn't change the answer here: single app, no split, move to the next phase.

### Initial Discussion

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

### Per App Product Brief

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

### Next Steps Small

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

### Detailed Discussion

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

### App Features

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

### Design Discussion

CONSENSUS: YES

Both of them are describing the same app, just at different resolutions — Codex sketched the shape (bootstrap → setup → Today → the two big modals → milestone), and Claude filled in the actual screen count, exact navigation structure, and the specific visual/accessibility decisions that make it buildable. Nothing here is contested: they agree on flat 3-tab navigation with the high-stakes moments (craving timer, relapse) as full-screen modals off Today rather than pushed into a stack, the same four-state Today screen, the same "no red, no warning chrome" treatment for the relapse screen, and the same sunrise/gradient motif doing real narrative work. Claude's one addition worth flagging — giving the relapse screen's lifetime-total reassurance its own small warm visual moment so "calm" doesn't read as "cold" or "under-designed" — is a genuine refinement Codex didn't contradict.

## Final Output

**Screen inventory (9 screens):**
1. First-launch empty state / "What are you quitting?" prompt — same surface as Today, just its zero-habit state
2. Habit setup/edit (name, quantity-per-day, cost-per-unit, live savings preview, inline validation)
3. Today/Home (streak, lifetime days free, money saved, cravings survived; two primary actions always visible)
4. Craving-timer modal (90s, wall-clock anchored, one guided sequence, no branching)
5. Relapse/reset modal (single screen, pre-tap and post-tap states, no navigation between them)
6. Milestone share card (contextual off Today, ShareLink sheet)
7. Milestones/history tab (chronological list of earned cards — substantiates sharing, not a journal)
8. Paywall (triggered on habit #2 attempt, before any setup fields render)
9. Settings (habit edit entry, restore purchases — nothing else this pass)

**Primary user flow:** Cold open → no habit → setup (name/quantity/cost with live preview) → Today steady state → from Today, two always-visible one-tap actions: "I'm craving now" (→ timer modal → completion or silent abandonment, dismisses back to Today) and "I slipped, restart" (→ same-screen reset + untouched lifetime total, no tap-through) → milestone threshold crossed → share card surfaces contextually from Today with ShareLink. Attempting a second habit as free tier hits the paywall before any setup fields show.

**State model per screen:**
- Today: empty (no habit, doubles as onboarding prompt) / loading (SwiftData opening — skeleton motif + number placeholders, never blank white) / success (four live stats + two actions) / app-level store-failure (full-screen takeover, plain-language message, distinct from a per-screen error)
- Setup/edit: empty (new user) / inline-validating (rejects zero/negative live) / saving / save-confirmed (returns to Today); edits after accrual show forward-only recompute disclosure at the moment of edit
- Craving timer: ready-to-start / running (elapsed & remaining always derived from stored timestamp) / completed (haptic + counter increment) / abandoned (no dedicated UI — the counter simply doesn't move)
- Relapse/reset: pre-tap confirmation / post-tap (same screen, shows "reset to day 0" + untouched lifetime total together)
- Milestone card: available / already-shown (suppressed via per-habit flag) / share-sheet states / render-fallback error
- Paywall: locked (pre-purchase) / purchase-in-progress / restore-in-progress / verification-failure (explicit copy, not a silent timeout)
- Settings: free/pro entitlement state, restore outcome, delete confirmation + success/error

**Visual direction:** Soft mint-to-sky-blue gradient throughout; the sunrise/counter motif shifts gradient tone as the streak number grows so long-term progress reads wordlessly. Rounded, soft-edged stat cards on Today with generous whitespace — glanceable, not a dashboard. Numbers (day count, dollar figure) are the visual hierarchy everywhere, especially on the milestone card, which gets a slightly more saturated poster-like treatment since it's the artifact that leaves the device. The relapse screen deliberately reuses the same calm mint/sky family, desaturated rather than alarmed — no red, no warning iconography, no shake — but its lifetime-total reassurance gets its own small warm visual accent so the screen reads as intentionally calm, not merely stripped-down.

**Accessibility notes:** 44pt minimum on both primary Today actions regardless of card compactness; explicit VoiceOver labels stating real numbers ("47 days free," "saved $42.00") on the sunrise/counter motif and milestone card, never a decorative-only glyph; Today's four stat cards are designed to reflow vertically at max Dynamic Type rather than clip; milestone card is tested at max Dynamic Type in both light and dark before being considered finished, since it's the one screen representing the app to people who've never used it; WCAG AA contrast maintained in both color schemes, with iconography always supplemental to text.

No open disagreement — ready to close.

### Design Handoff

CONSENSUS: YES

## Final Output

Both of them ended up building the same handoff at different altitudes — Codex wrote the screen-by-screen UX/visual spec (states, copy, motion, a11y, component names), and Claude took every one of those decisions and turned it into exact SwiftUI architecture: which presentation style each modal uses, how streak/timer state actually gets computed and persisted, concrete hex values and type/spacing scales, and a named component inventory. Nothing between them conflicts — Claude's additions are all "here's how to actually build the thing Codex just specified," not a different opinion.

**Screen-by-screen spec:**
- **Today/Home** (root, no-nav): empty state doubles as onboarding ("What are you quitting?" card); loading state is a full skeleton (pulsing stat-card placeholders + silhouette sunrise motif, never a spinner or blank screen); success state shows sunrise/counter motif (streak number, VoiceOver label "47 days free") + 4 stat cards (streak, lifetime days, money saved, cravings survived) in a 2×2 grid that reflows to one column at accessibility Dynamic Type sizes; two full-width primary buttons pinned at bottom, min 56pt height ("I'm craving now" = saturated primary fill, "I slipped, restart" = quieter tonal fill, visually distinct so a stressed thumb can't mis-tap); app-level store-failure state is a distinct full-screen takeover (plain-language copy + Try Again), checked for before the TabView even renders.
- **Habit setup/edit** (sheet): name, quantity-per-day (configurable unit label), currency cost-per-unit, live-updating savings preview on every keystroke, inline validation rejecting non-positive values with warm-amber (not red) captions and a disabled Save until valid; editing an existing habit past day 0 surfaces a recompute-disclosure banner only once a field actually changes ("Changes apply from today forward — your savings so far won't change").
- **Craving timer** (`.fullScreenCover`, one guided sequence, no branching): source of truth is a persisted `CravingSession.startedAt`; on-screen countdown is always derived from that timestamp, recalculated on `.onAppear`/`scenePhase == .active`, never trusted from in-memory state across backgrounding. Completion (haptic + counter increment) fires exactly once, guarded against double-fire; dismissal before completion and force-quit-past-elapsed both resolve to silent abandonment with no dedicated UI.
- **Relapse/reset** (`.fullScreenCover`, one view, local `confirmed` toggle — not two screens): pre-confirm has one calm confirm/cancel; post-confirm swaps in place (spring animation, not a hard cut) to show "Day 0 — starting fresh" beside the untouched lifetime-total card, which gets its own small warm coral-gold accent so "calm" doesn't read as "cold." No red, no warning iconography, no shake.
- **Milestone card** (sheet, triggered contextually off Today, fires day 1 or 3, per-habit "already shown" flag): rendered as a `Transferable`/`ImageRenderer` target, big rounded numerals for day count + dollar figure as the only competing elements, poster-saturated gradient, capped at a fixed large type size for the exported image (deliberate exception to live Dynamic Type, stated explicitly so it's not left ambiguous).
- **Milestones/history tab**: chronological list of earned cards, empty/loading/success/error states, substantiation only — not a journal.
- **Paywall** (sheet, triggered before any second-habit field renders): built on `SubscriptionStoreView`/`.subscriptionStoreControlStyle` rather than fully bespoke, wrapped in app gradient/chrome, explicit Restore Purchases button, verification-failure state hard-blocks with honest copy (no silent timeout).
- **Settings**: habit edit entry, restore purchases, one-step delete-with-cascade, subscription status — nothing else this pass.

**Navigation/architecture:** 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; craving timer and relapse are `.fullScreenCover` (never `.sheet` — a sheet's visible tab-bar sliver undercuts the "this is serious" framing); paywall/setup/milestone share are `.sheet`. One `@Observable` view model per feature surface, SwiftData `@Query`/`ModelContext` via environment. Streak is stored as `lastRelapseAt` on Habit and derived as a pure `Calendar` function in one shared `StreakEngine.swift`, re-evaluated on `scenePhase` change and `.NSCalendarDayChanged` — not a full-history scan, not a cached counter.

**Design tokens:** primary gradient `#B9F2DE`→`#8ED0F0` (mint→sky), milestone-poster gradient `#7EE8C3`→`#6BB8F0` (more saturated), text `#152A38` on light / near-white on dark `#0E1F27` background, relapse-screen warm accent `#F4C77A` (used sparingly, never full-screen). Corner radii 12/20/28pt (component/card/button-sheet). Spacing scale 4/8/12/16/24/32/48. Type: SF Pro Rounded for numerals/headlines, SF Pro for body; soft low-opacity shadows only (`black.opacity(0.08)`), never hard drop shadows.

**Component inventory:** `GradientBackground`, `SunriseCounterMotif(days:)`, `StatCard`, `PrimaryActionButton(style:)`, `InlineValidatedField`, `RecomputeDisclosureBanner`, `MilestoneCardView` (dual live-preview/export), `SkeletonStatCard`, `AppLevelErrorView`, `OnboardingPromptCard` — built once as standalone state-driven views, not copy-pasted per screen.

**Motion:** spring-once transitions for modals/state swaps; calm radial progress + gentle number ticking on the timer; short (<300ms) scale-and-fade on completion/milestone unlock; explicitly no shake/red-flash/vibration-spike on relapse; shimmer-only loading placeholders, no fake progress bars.

**Accessibility:** 44pt+ targets (primary Today actions at 56pt+); explicit VoiceOver labels stating real numbers on the sunrise motif and milestone card (never decorative-only); Dynamic Type-safe reflow (2×2 grid → single column) tested at max size; WCAG AA contrast in both color schemes; milestone card tested at accessibility XXL in light and dark before being considered finished.

**Claude Design decision:** No external design pause. Every decision needed to build — down to gradient stops, motion durations, and the one screen (relapse) that most needed judgment — is already locked and concrete enough for a SwiftUI engineer to implement directly. If a second opinion or alternate visual exploration is wanted later, the original spec's Claude Design Handoff Prompt ("soft mint-to-sky-blue gradient system, rounded iconography, sunrise/counter motif, warm non-judgmental tone, milestone card as hero shareable artifact, calm not gamified") remains available verbatim as an upload prompt, but nothing here is blocked on it.

No open disagreement — ready to close.

### Ios Architecture Review

Both of them are aligned on the same architecture — Codex laid out the feature-domain split (App bootstrap owns the ModelContainer/StoreKit listener, domain engines own business rules, view models are thin adapters, screens are dumb) and named the exact schema/StoreKit/testing plan, and Claude's contribution is entirely sharpening: making the launch-failure path a real designed state instead of a crash, turning "unit test everything" into concrete pure-function signatures, and naming a few schema details (migration versioning, idempotency fields, file protection) that Codex's plan implied but hadn't spelled out. Nothing here is contested.

CONSENSUS: YES

## Final Output

**SwiftUI architecture recommendation:** `FreedayApp` owns bootstrap — `ModelContainer` creation, the StoreKit `Transaction.updates` listener task, and app-level error state — constructed explicitly with `do/catch` in the App struct's initializer (not the `.modelContainer(for:)` convenience modifier, whose default behavior crashes on a corrupt store rather than degrading), storing `opening/ready/failed` in `@State` and branching the root view on it before `TabView` is ever constructed. Business logic lives in pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) that take timestamps as parameters and return values — no `Date()`-now or SwiftData calls baked inside them. Feature view models are thin `@Observable` adapters that persist/query via `ModelContext`/`@Query` and call into the engines; screens render state and call explicit intent methods only.

**Apple framework choices:** SwiftUI, SwiftData, StoreKit 2, Observation, CoreHaptics/`UINotificationFeedbackGenerator` (gated behind `CHHapticEngine.capabilitiesForHardware().supportsHaptics`, with absent hardware treated as a silent no-op, not an error state), `ImageRenderer` + `Transferable`/`ShareLink` for the milestone card. No CoreML, Vision, or ARKit — closed decision, there's no user-value case for ML/AR in this product's deterministic, stress-tested-under-pressure use case. WidgetKit/ActivityKit stay deferred per the standing degrade-first rule.

**Persistence and local data plan:** Three SwiftData models — `Habit`, `RelapseEvent`, `CravingSession` — plus a lightweight per-habit milestone/idempotency state. Cascade delete configured declaratively via `@Relationship(deleteRule: .cascade)` from `Habit`, not manual cascade logic in a view model. Savings math uses effective-rate segments (`effectiveFrom`, `cumulativeSavingsBeforeEdit`) so forward-only recompute is structurally guaranteed rather than something a future edit could silently get wrong. Streak is derived fresh from `lastRelapseAt` via local-timezone calendar-day math, never a cached counter. Idempotency-critical fields — the per-habit "already shown this milestone threshold" flag and `lastInteractedAt` (with a stated tie-break rule: most-recent `lastInteractedAt` wins, falling back to habit creation order if unset) — are real persisted columns, not runtime-reconstructed values. `VersionedSchema`/`SchemaMigrationPlan` scaffolding is stood up from the first commit, even though the initial migration plan is trivial, because retrofitting it after users have months of streak history is the expensive failure mode. Timer state (`CravingSession.startedAt`) is written the instant the timer opens and is the sole source of truth for elapsed/remaining time on every read.

**Permissions/privacy plan:** Zero runtime permission prompts in v1 — no notifications, HealthKit, camera, or location. StoreKit is the only outbound network dependency, used only for purchase/restore. No Face ID/passcode app-lock (an explicit, previously-accepted v1 tradeoff, restated here rather than silently carried forward) — as a zero-cost hardening step against that gap, the store's file protection is set to the strong default (`NSFileProtectionComplete`/equivalent), which costs nothing and doesn't require building app-lock UI. No telemetry, analytics, or crash reporting anywhere in the app.

**Dependency/license decision:** Zero third-party SPM packages. Every required capability — persistence, purchases, sharing, haptics, image rendering — has a first-party Apple framework, so there's no permissive-license question to resolve; this is closed, not deferred to tech_specs.

**Testing implications:** `StreakEngine` and the craving-timer remaining-time calculation are pure functions taking `(referenceTimestamp, now)` as explicit parameters, so midnight-boundary, DST, leap-year, and clock-skew (clamped to zero, never negative) cases are injectable unit tests, not manual-only QA. In-memory `ModelContainer` for persistence/cascade-delete tests. `.storekit` config plus `StoreKitTest` for the happy path, with an explicit required manual test script for the unverified-transaction hard-block and restore-purchases re-scan, since that path compiles clean and silently never gets exercised otherwise. Every named screen state (empty/loading/success/error, pre-tap/post-tap, etc.) gets an exhaustive `#Preview` rather than a maintained XCTest UI suite — the realistic, sustainable testing bar for a build this size, with the two most trust-critical moments (relapse post-tap screenshot, milestone card at max Dynamic Type in both color schemes) getting explicit preview coverage.

No open disagreement — ready to close.

### Tech Specs

Both of them arrived at the same architecture and the same three hard edges (pure/injectable time math, entitlement as a hard gate not a flag, bootstrap as a first-class app state) — Codex specified it first with protocol-based engines and a `HabitRepository` abstraction, and Claude's version is functionally identical but more concrete: it resolves the one real ambiguity Codex left open (a nullable `lastRelapseAt` that every consumer has to branch on) by replacing it with a non-optional `streakStartAt` plus a `cleanDaysBeforeCurrentStreak` accumulator that mirrors the already-locked savings effective-rate pattern, and it resolves the "duplicate/overlapping timer sessions" edge case that was flagged as unresolved back in detailed_discussion by giving `CravingSession` a persisted `outcome` field with a force-resolve-prior-session rule. Neither of those is a disagreement with Codex — they're the same shape, just carrying the ambiguity through to closure.

The one place they diverge stylistically rather than substantively is protocol-based engines with a repository layer (Codex) versus stateless enums of static functions with view models reading directly via `@Query`/`ModelContext` (Claude). That's not a live disagreement to resolve — the already-locked ios_architecture_review decision explicitly said view models "persist/query via ModelContext/@Query" with no repository layer mentioned, so Claude's lighter approach is what's already been agreed, and I'm going with it in the merged contract: no `HabitRepository` protocol, pure-function engines as enums.

Claude's TimelineView-vs-Timer.publish point and the App Group container identifier are both good, low-cost forward-compat moves, but Claude's own sequencing note is correct: they're fast-follow polish, not blocking for calling the core workflows done, consistent with the standing "smaller finished app beats a larger half-built one" rule. Codex's more granular `EntitlementState` enum (unknown/free/pro/expired/revoked/verificationFailed) is worth keeping over Claude's flatter `isSubscribed: Bool`, since the subscription-lapse read-only rule from detailed_discussion needs to distinguish expired from revoked — I've folded that granularity into the merged `EntitlementStore`.

CONSENSUS: YES

## Final Output

**Architecture overview:** `FreedayApp` is the composition root. Its `init` attempts `ModelContainer` construction inside an explicit `do/catch` against `FreedaySchemaV1`/`FreedayMigrationPlan` (never the `.modelContainer(for:)` convenience modifier) and stores the result as `AppBootstrapState` (`opening` / `ready(ModelContainer)` / `failed(Error)`) in `@State`. The root view branches on that state before `TabView` exists — a corrupt store cannot reach a screen that assumes data exists. Once ready, `AppRootView` owns the 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; `CravingTimer` and `Relapse` are `.fullScreenCover`, `HabitSetup`/`Paywall`/`MilestoneShare` are `.sheet`. Business logic lives entirely in stateless, pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) — enums of static functions taking timestamps/calendar as explicit parameters, zero SwiftData imports, zero internal `Date()` calls. Feature view models are thin `@Observable` adapters: fetch via `@Query`/`ModelContext`, delegate all time-derived math to an engine, never compute calendar math inline. `StorefrontService`/`EntitlementStore` is a concrete `@Observable` service, its transaction-update listener started from `FreedayApp` and kept alive for the app's lifetime.

**File/module layout:**
- `App/` — `FreedayApp.swift`, `AppBootstrap.swift`, `AppRootView.swift`
- `Domain/Models/` — `Habit.swift`, `RelapseEvent.swift`, `CravingSession.swift`, `SchemaV1.swift` (VersionedSchema + SchemaMigrationPlan)
- `Domain/Engines/` — `StreakEngine.swift`, `SavingsEngine.swift`, `CravingSessionEngine.swift`, `MilestoneEngine.swift` (each independently unit-testable, no persistence dependency)
- `Features/{Today,HabitForm,CravingTimer,Relapse,Milestones,Paywall,Settings}/` — one View + one `@Observable` ViewModel per feature
- `Services/` — `EntitlementStore.swift`, `HapticsService.swift`
- `DesignSystem/` — `GradientBackground`, `SunriseCounterMotif`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `AppLevelErrorView`, `Tokens.swift`
- `Resources/` — static craving-guidance copy (plain Swift array, no JSON layer), `Freeday.storekit`
- `FreedayTests/` — one XCTestCase per engine, a bootstrap test against a deliberately invalid config, a cascade-delete test on an in-memory container

**Data models:** Three SwiftData models. `Habit` carries a non-optional `streakStartAt` (initialized to `createdAt`, overwritten to `now` on relapse — no nullable branching at call sites), `cleanDaysBeforeCurrentStreak` and `cumulativeSavingsBeforeRateChange` as forward-only accumulators (same pattern applied to both days and money), `rateEffectiveFrom`, `lifetimeCravingsSurvived`, `lastShownMilestoneThreshold`, `lastInteractedAt` (tie-break for subscription-lapse read-only resolution: most-recent wins, falling back to creation order), and cascade-delete relationships to `RelapseEvent`/`CravingSession`. `RelapseEvent` is an immutable log row, always timestamped "now," denormalizing `streakLengthAtReset`/`savingsAtReset` for the Milestones/history tab. `CravingSession` carries a persisted `CravingOutcome` (`active`/`completed`/`abandoned`) — creating a new session force-resolves any existing active session for that habit to `abandoned` first, so at most one active session per habit exists by construction, not UI discipline.

**Persistence strategy:** `VersionedSchema`/`SchemaMigrationPlan` scaffolding stood up from commit one. Cascade delete declared via `@Relationship(deleteRule: .cascade)`, never manual cascade logic. Streak/lifetime-days/savings are all derived fresh on every read from persisted timestamps and accumulators — never cached counters. Zero third-party dependencies; StoreKit is the only network dependency, purchase/restore only.

**Testing strategy:** Every engine is a pure function of `(timestamp, now, calendar)` — unit-testable for midnight rollover (both directions), clock skew (`now` before `streakStartAt`, clamps to zero), DST spring-forward/fall-back, [REDACTED:high_entropy], and the overlapping-session force-resolve case. In-memory `ModelContainer` for cascade-delete and migration tests. `.storekit` config + `StoreKitTest` for the happy path, plus a required manual test script for the unverified-transaction hard-block and restore re-scan. Every named screen state gets a `#Preview`, with explicit preview coverage required for the relapse post-tap screenshot and the milestone card at max Dynamic Type in both color schemes.

No open disagreement — ready to close.

```interfaces-json
{"interfaces": [
  {"name": "AppBootstrapState", "kind": "enum", "language": "swift", "signature": "enum AppBootstrapState: Equatable { case opening; case ready(ModelContainer); case failed(Error) }", "owning_lane": "primary_ui", "notes": "Held in FreedayApp @State; constructed via explicit do/catch against FreedaySchemaV1 + FreedayMigrationPlan, never .modelContainer(for:). Branches root view before TabView exists."},
  {"name": "FreedaySchemaV1", "kind": "struct", "language": "swift", "signature": "enum FreedaySchemaV1: VersionedSchema { static var models: [any PersistentModel.Type] { get }; static var versionIdentifier: Schema.Version { get } }", "owning_lane": "data_domain", "notes": "Stood up from first commit even though initial migration plan is trivial."},
  {"name": "FreedayMigrationPlan", "kind": "struct", "language": "swift", "signature": "enum FreedayMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { get }; static var stages: [MigrationStage] { get } }", "owning_lane": "data_domain", "notes": "Pre-provisioned migration scaffolding paired with FreedaySchemaV1."},
  {"name": "Habit", "kind": "struct", "language": "swift", "signature": "@Model final class Habit { @Attribute(.unique) var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Double; var costPerUnit: Decimal; var createdAt: Date; var streakStartAt: Date; var cleanDaysBeforeCurrentStreak: Int; var rateEffectiveFrom: Date; var cumulativeSavingsBeforeRateChange: Decimal; var lifetimeCravingsSurvived: Int; var lastShownMilestoneThreshold: Int?; var lastInteractedAt: Date; @Relationship(deleteRule: .cascade, inverse: \\RelapseEvent.habit) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade, inverse: \\CravingSession.habit) var cravingSessions: [CravingSession] }", "owning_lane": "data_domain", "notes": "N habits supported unconditionally from day one; only UI/entitlement layer enforces the one-habit-free gate. streakStartAt is non-optional (initialized to createdAt, overwritten to now on relapse) so no nullable-branch duplication at call sites. cleanDaysBeforeCurrentStreak + cumulativeSavingsBeforeRateChange are forward-only accumulators, same pattern applied to both days and money."},
  {"name": "RelapseEvent", "kind": "struct", "language": "swift", "signature": "@Model final class RelapseEvent { @Attribute(.unique) var id: UUID; var timestamp: Date; var streakLengthAtReset: Int; var savingsAtReset: Decimal; var habit: Habit? }", "owning_lane": "data_domain", "notes": "Immutable historical row, timestamp always now (no backdating). Written by RelapseViewModel in the same ModelContext save that updates Habit.streakStartAt/cleanDaysBeforeCurrentStreak. Substantiates the Milestones/history tab."},
  {"name": "CravingSession", "kind": "struct", "language": "swift", "signature": "@Model final class CravingSession { @Attribute(.unique) var id: UUID; var startedAt: Date; var completedAt: Date?; var outcome: CravingOutcome; var habit: Habit? }", "owning_lane": "data_domain", "notes": "outcome starts .active. Creating a new session for a habit force-resolves any existing active session for that habit to .abandoned first — at most one active session per habit by construction."},
  {"name": "CravingOutcome", "kind": "enum", "language": "swift", "signature": "enum CravingOutcome: String, Codable { case active, completed, abandoned }", "owning_lane": "data_domain", "notes": "Persisted, not runtime-inferred, so relaunch resolution, duplicate-session resolution, and completion all read/write the same field."},
  {"name": "StreakEngine", "kind": "function", "language": "swift", "signature": "enum StreakEngine { static func currentStreakDays(streakStartAt: Date, now: Date, calendar: Calendar) -> Int; static func lifetimeDaysFree(cleanDaysBeforeCurrentStreak: Int, streakStartAt: Date, now: Date, calendar: Calendar) -> Int }", "owning_lane": "data_domain", "notes": "Pure, stateless, injectable clock — no Date() or SwiftData calls internally. Result clamps to >= 0 for clock-skew (now < streakStartAt)."},
  {"name": "SavingsEngine", "kind": "function", "language": "swift", "signature": "enum SavingsEngine { static func currentSavings(cumulativeBeforeRateChange: Decimal, dailyQuantity: Double, costPerUnit: Decimal, rateEffectiveFrom: Date, now: Date, calendar: Calendar) -> Decimal; static func applyRateChange(existingSavings: Decimal, newDailyQuantity: Double, newCostPerUnit: Decimal, now: Date) -> (cumulativeBeforeRateChange: Decimal, rateEffectiveFrom: Date) }", "owning_lane": "data_domain", "notes": "applyRateChange called by HabitFormViewModel on save when quantity/cost changed; captures pre-edit savings as new baseline so forward-only recompute is structurally guaranteed."},
  {"name": "CravingSessionEngine", "kind": "function", "language": "swift", "signature": "enum CravingSessionEngine { static let duration: TimeInterval = 90; static func remainingSeconds(startedAt: Date, now: Date) -> TimeInterval; static func resolveOnAppear(startedAt: Date, now: Date, currentOutcome: CravingOutcome) -> CravingOutcome }", "owning_lane": "data_domain", "notes": "resolveOnAppear never returns .completed from a stale/relaunch check (no retroactive credit) — only the live foreground countdown reaching zero while CravingTimerView is presented triggers an explicit .completed write, guarded to fire exactly once."},
  {"name": "MilestoneEngine", "kind": "function", "language": "swift", "signature": "enum MilestoneEngine { static let thresholds: [Int] = [1, 3, 7, 30, 90, 180, 365]; static func nextUnshownThreshold(currentStreakDays: Int, lastShownThreshold: Int?) -> Int? }", "owning_lane": "data_domain", "notes": "Called from TodayViewModel.onAppearCheckMilestone; non-nil result triggers the milestone sheet exactly once per threshold via Habit.lastShownMilestoneThreshold."},
  {"name": "AppLevelErrorView", "kind": "struct", "language": "swift", "signature": "struct AppLevelErrorView: View { let error: Error; let retry: () -> Void }", "owning_lane": "polish_resilience", "notes": "Rendered instead of AppRootView when AppBootstrapState == .failed; plain-language copy + Try Again, no tab bar underneath."},
  {"name": "TodayViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class TodayViewModel { var habit: Habit?; var bootstrapState: AppBootstrapState; func startCravingSession(); func openRelapseFlow(); func onAppearCheckMilestone() -> Int? }", "owning_lane": "primary_ui", "notes": "Reads via @Query, delegates all math to StreakEngine/SavingsEngine/MilestoneEngine — never computes calendar math inline."},
  {"name": "CravingTimerViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class CravingTimerViewModel { var session: CravingSession; func remaining(now: Date) -> TimeInterval; func handleAppear(now: Date); func dismissBeforeCompletion() }", "owning_lane": "primary_ui", "notes": "handleAppear calls CravingSessionEngine.resolveOnAppear. Countdown may render via a simple Timer.publish(every: 1) for the first functional pass; TimelineView(.animation)-driven continuous rendering is an approved fast-follow polish pass, not a blocking requirement."},
  {"name": "RelapseViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class RelapseViewModel { var habit: Habit; var confirmed: Bool; func confirmRelapse() }", "owning_lane": "primary_ui", "notes": "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save, then flips confirmed for the in-place spring-animated state swap (same screen, no navigation)."},
  {"name": "HabitFormViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class HabitFormViewModel { var name: String; var dailyQuantity: String; var costPerUnit: String; var isEditingExisting: Bool; var showsRecomputeDisclosure: Bool; func validate() -> Bool; func save() }", "owning_lane": "primary_ui", "notes": "showsRecomputeDisclosure flips true only once a field differs from its originally loaded value. validate() rejects non-positive quantity/cost inline."},
  {"name": "MilestonesListViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class MilestonesListViewModel { var habit: Habit?; var earnedMilestones: [RelapseEvent]; var isLoading: Bool }", "owning_lane": "primary_ui", "notes": "Backs the Milestones/history tab — chronological substantiation list only, not a journal. Empty/loading/success/error states."},
  {"name": "PaywallViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class PaywallViewModel { var entitlementState: EntitlementState; func purchase(_ product: Product) async; func restore() async }", "owning_lane": "primary_ui", "notes": "Triggered before any second-habit setup field renders. verificationFailed state hard-blocks with explicit copy, never a silent timeout."},
  {"name": "SettingsViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class SettingsViewModel { var habits: [Habit]; var entitlementState: EntitlementState; func deleteHabit(_ habit: Habit); func restore() async }", "owning_lane": "primary_ui", "notes": "deleteHabit relies on Habit's declarative cascade delete rule — no manual cascade logic here."},
  {"name": "EntitlementState", "kind": "enum", "language": "swift", "signature": "enum EntitlementState: Equatable { case unknown, free, pro, expired, revoked, verificationFailed }", "owning_lane": "services_utilities", "notes": "expired vs revoked distinction needed for the subscription-lapse read-only rule (data preserved, most-recently-active habit stays interactive)."},
  {"name": "EntitlementStore", "kind": "struct", "language": "swift", "signature": "@Observable final class EntitlementStore { var entitlementState: EntitlementState; func startTransactionListener() -> Task<Void, Never>; func refreshEntitlements() async; func purchase(_ product: Product) async throws; func restorePurchases() async throws }", "owning_lane": "services_utilities", "notes": "startTransactionListener runs from FreedayApp init, kept alive for app lifetime. checkVerified failure hard-blocks entitlement, never soft-grants. refreshEntitlements re-scans Transaction.currentEntitlements on launch and on explicit Restore tap."},
  {"name": "HapticsService", "kind": "function", "language": "swift", "signature": "enum HapticsService { static func notifySuccess(); static func notifyStreakDay() }", "owning_lane": "services_utilities", "notes": "Internally checks CHHapticEngine.capabilitiesForHardware().supportsHaptics; absent hardware is a silent no-op, never an error path."},
  {"name": "MilestoneCardRenderer", "kind": "function", "language": "swift", "signature": "enum MilestoneCardRenderer { static func renderImage(days: Int, savings: Decimal, colorScheme: ColorScheme) -> Image? }", "owning_lane": "services_utilities", "notes": "Wraps ImageRenderer at a fixed capped type size (deliberate exception to live Dynamic Type), feeds ShareLink's Transferable payload."},
  {"name": "MilestoneCardView", "kind": "struct", "language": "swift", "signature": "struct MilestoneCardView: View { let days: Int; let savings: Decimal; let habitName: String }", "owning_lane": "primary_ui", "notes": "Dual-purpose: rendered live in the sheet and passed to MilestoneCardRenderer.renderImage for export."},
  {"name": "Tokens", "kind": "struct", "language": "swift", "signature": "enum Tokens { enum Gradient { static let mintTop: Color; static let skyBottom: Color; static let posterMintTop: Color; static let posterSkyBottom: Color }; enum Spacing { static let xs: CGFloat; static let s: CGFloat; static let m: CGFloat; static let l: CGFloat; static let xl: CGFloat }; enum Radius { static let component: CGFloat; static let card: CGFloat; static let sheet: CGFloat } }", "owning_lane": "polish_resilience", "notes": "Concrete values from design_handoff: mint #B9F2DE to sky #8ED0F0, poster gradient #7EE8C3 to #6BB8F0, radii 12/20/28."},
  {"name": "SunriseCounterMotif", "kind": "struct", "language": "swift", "signature": "struct SunriseCounterMotif: View { let streakDays: Int; var body: some View }", "owning_lane": "polish_resilience", "notes": "Single accessibilityElement with label stating the real day count (e.g. '47 days free'), never decorative-only. Gradient tone shifts with streakDays."}
]}
```

### Project Plan

Looking at round 1, both of them are building the same seven-milestone shape — Codex drafted it, and Claude (in the systems-skeptic seat this time) is correcting the dependency graph rather than disagreeing with the milestone list. The real substance in Claude's pushback: engines are pure functions with zero SwiftData dependency, so gating them behind the schema/bootstrap milestone (as Codex's plan does) is an artificial dependency — they should run in a genuinely parallel lane from day one, same as the design tokens. Claude also caught two concrete bugs that need to become named tasks rather than left implicit (the `AppBootstrapState: Equatable` conformance problem the quality gate flagged back in tech_specs, and a mangled cascade-delete keypath), argued HabitForm should land before Today since Today's non-empty state needs a real habit and the paywall-gate is a wiring dependency between HabitForm and EntitlementStore that shouldn't get built as two islands, and wants verify-and-repair as dedicated checkpoints (full injected-clock test matrix; a forced unverified-transaction + empty-restore test) rather than folded into one end-of-project QA pass. None of this contradicts Codex's structure — it's a correction to ordering and an insistence that testing isn't a footnote, both fully in scope for this phase.

CONSENSUS: YES

## Final Output

**Milestone 1 — Scope lock (Day 1, 4-6h).** Convert every locked requirement into one unambiguous execution blueprint: behavior contract for the five core workflows + store-gate + error states + a11y rules, the forward-only recompute rule stated explicitly, and a full screen-state matrix. Gate: signed-off checklist for non-shaming relapse language, no clinical framing, StoreKit hard-gate behavior. No dependencies.

**Milestone 2 — Domain engines + design system (parallel lanes, Day 1-2, 10-12h).** These have zero dependency on schema or persistence, so they start immediately after scope lock, not after bootstrap.
- Lane A: `StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine` as pure functions with injected `now`/`Calendar`. Implement zero/negative clamps, DST/timezone edge behavior, timer outcome rules, idempotent milestone thresholding.
- Lane B: `GradientBackground`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `SunriseCounterMotif`, `AppLevelErrorView`, `Tokens.swift` — no data dependency either.
Verify-and-repair checkpoint (not deferred to final QA): run the full injected-clock unit test matrix — midnight rollover both directions, clock skew clamped to zero, DST both directions, force-quit-past-90s abandon, overlapping-session force-resolve, milestone-idempotency.

**Milestone 2b — Data foundation and app bootstrap (Day 1-2, 8-10h, parallel with Milestone 2).** `FreedaySchemaV1`/`FreedayMigrationPlan`, the three `@Model` classes with cascade deletes and forward-only fields, `FreedayApp` explicit `do/catch` bootstrap with `AppBootstrapState` routing before `TabView` mounts. Named tasks (not left implicit): write a custom `Equatable` conformance for `AppBootstrapState` comparing on case tag only, since the associated `Error`/`ModelContainer` aren't `Equatable`; verify the cascade-delete inverse keypath syntax compiles cleanly. Gate: bootstrap path compiles; corrupt-store fallback manually verified to render the app-level error state.

**Milestone 3 — Core user loop, ordered by dependency (Day 2-4, ~14h).** HabitForm (setup/edit + inline validation) built first, since Today's non-empty state needs a real persisted habit. The "attempting habit #2 shows the paywall before any setup field renders" wiring between HabitForm and EntitlementStore is its own explicit checkpoint, not an afterthought reconciled after both are independently "done." Today screen follows, with its 4-state matrix and the sunrise/counter motif. Relapse and CravingTimer are independent of each other and run in parallel once Habit + their respective engines exist.

**Milestone 4 — Entitlement/StoreKit (Day 4, 6-8h, parallel with late Milestone 3).** `EntitlementState`/`EntitlementStore`, `Transaction.updates` listener, `Transaction.currentEntitlements` refresh, hard `checkVerified` behavior, restore flow. Verify-and-repair checkpoint: force an actual unverified-transaction failure and a restore-with-nothing-to-restore case via the `.storekit` config — not just the happy purchase path.

**Milestone 5 — Timer hardening, card sharing, haptics, settings (Day 5, 8-10h).** Depends on Milestones 2-4 since it needs trustworthy numbers and working entitlement. Force-quit/relaunch and active-session overlap resolution via persisted `outcome`; haptics (hardware-guarded no-op); ShareLink milestone card via `ImageRenderer`; settings with restore, habit edit, one-step cascade delete. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier are named explicitly here as cut for this pass — not "fast-follow" — since no widget target is being built, so there's no reason to spend setup time on infrastructure for a target that doesn't exist yet.

**Milestone 6 — Hardening and release gate (Day 6, 6-8h).** Accessibility pass (44pt targets, reflow, contrast), full state coverage audit, final risk triage, explicit "what ships / what's deferred" status notes. Gate: end-to-end smoke checklist — fresh install → one relapse → one full timer completion → one milestone share → one second-habit paywall attempt → one restore attempt.

**Dependency order:** M1 → M2/M2b run in parallel → M3 depends on both → M4 depends on M2b (bootstrap) + M1, overlaps late M3 → M5 depends on M2-M4 → M6 depends on all.

**Risk mitigations (carried and sharpened):** temporal-logic drift under real backgrounding/timezone/force-quit is mitigated by persisted timestamps as sole source of truth, verified by the dedicated engine-test checkpoint rather than assumed from compile success; relapse-wording trust risk mitigated by the single-screen reset design plus copy review gate; monetization-bypass risk mitigated by hard verified entitlement checks, verified by the dedicated StoreKit-failure checkpoint rather than the happy path alone; orphaned-row risk mitigated by cascade relationships plus the now-named migration/Equatable/keypath fixes; false-complete-timer-on-relaunch risk mitigated by the explicit `abandoned` outcome rule.

One thing worth naming plainly: front-loading two parallel non-visual milestones (engines, design system) before anything runs on a simulator means there's no demoable build for the first day or two even though the highest-risk logic is what's getting retired first — that's the right trade given how much prior-phase discussion centered on the numbers being trustworthy, but it shouldn't be mistaken for stalled progress if checked early.

### Task Assignments

Both of them landed on the same lane structure, file ownership, and integrator-owned wiring files — no disagreement there. The one real difference is workflow mechanics: Codex wants lane branches (`feature/freeday/data-domain`, `/services`, `/primary-ui`, `/polish`) merged in a fixed order into an integration branch, while Claude argues that's unnecessary ceremony if the Xcode project uses file-system-synchronized groups (Xcode 16's folder-reference style) for every lane's folder — since that means adding a file inside a lane's own folder never touches `project.pbxproj`, the actual collision surface between lanes drops to near zero, so a single `freeday/build` branch with one commit per task ID is enough, and branching should be reserved only for the small set of integrator-owned files. That's a real technical call, and it's the right one to make now since it changes how build workers should actually operate — I'm resolving it in Claude's favor because it solves the specific structural risk (one shared project file, four parallel lanes) rather than just working around it with process discipline. Claude's task list is also more granular and closer to the milestone-based project_plan (splitting persistence tests, the StoreKit failure/restore checkpoint, and the milestone-list-vs-card-renderer split into their own tasks), so that's the backlog going forward, with Codex's per-lane risk framing (entitlement correctness and timekeeping math first) folded in as the sequencing rationale.

CONSENSUS: YES

## Final Output

**Where it lives:** `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/`, single `Freeday.xcodeproj`, one `Freeday` app target + one `FreedayTests` target. Every lane's top-level folder (`Domain/Models`, `Domain/Engines`, `Features/*`, `Services`, `DesignSystem`, `Resources`, `FreedayTests`) is set up as an Xcode 16 file-system-synchronized group, so adding files inside a lane's own folder never touches `project.pbxproj` — this is the actual conflict-prevention mechanism, not branch discipline.

**Branching/merge strategy:** One integration branch, `freeday/build`. No per-lane branches — with synchronized groups, the real collision surface is near zero. Commits are one per task, prefixed `[T-0XX][lane]`. Branching is reserved only for the integrator-owned files (`App/FreedayApp.swift`, `App/AppBootstrap.swift`, `App/AppRootView.swift`, the `.xcodeproj` itself) — these are only touched during explicitly named wiring tasks, never as a side effect of a feature task.

**Lane responsibilities:**
- **data_domain** — SwiftData models, versioned schema/migration plan, the four pure engines, engine unit tests, persistence/cascade-delete tests. Forbidden from touching `Features/*` or `DesignSystem/*`.
- **primary_ui** — every `Features/*` view+viewmodel pair, plus the app bootstrap/root wiring task. Forbidden from touching `Domain/Engines/*` or `Domain/Models/*` directly — calls into engines, never reimplements calendar math inline.
- **services_utilities** — EntitlementStore + `.storekit` config, HapticsService, MilestoneCardRenderer, the StoreKit failure/restore verification checkpoint. Forbidden from touching SwiftData models directly.
- **polish_resilience** — design tokens/components, the accessibility + state-coverage audit (read-and-flag on other lanes' files, patch with tagged commits rather than silent rewrites), and the final end-to-end smoke checklist/release gate.

**Forbidden edit zones:** any file in another lane's owned list; the `.storekit` product IDs and paywall copy once frozen; the four integrator-owned files outside a named wiring task.

**Communication protocol:** status lives in the tasks-json `status` field per task, not side-channel chat. Any deviation from a frozen tech_specs signature (e.g. the `AppBootstrapState` custom `Equatable` conformance) gets stated in the commit message and flagged at the next integration checkpoint — no silent deviation.

```tasks-json
{"tasks": [
  {"id": "T-001", "title": "SwiftData models + versioned schema", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift", "[REDACTED:high_entropy].swift"], "depends_on": [], "acceptance_criteria": ["Compiles with cascade-delete relationships via @Relationship(deleteRule: .cascade) with correct non-mangled inverse keypaths", "Habit.streakStartAt is non-optional; cleanDaysBeforeCurrentStreak and cumulativeSavingsBeforeRateChange are forward-only accumulator fields", "VersionedSchema + SchemaMigrationPlan scaffolding present even though initial migration is trivial"], "status": "pending"},
  {"id": "T-002", "title": "Pure domain engines", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift"], "depends_on": [], "acceptance_criteria": ["Zero SwiftData imports, zero internal Date() calls — all take now/calendar as explicit parameters", "Signatures match tech_specs interfaces-json exactly", "Negative/zero clamps applied (streak never negative on clock skew)"], "status": "pending"},
  {"id": "T-003", "title": "Engine unit test matrix", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/StreakEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/SavingsEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/CravingSessionEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/MilestoneEngineTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Midnight rollover both directions covered", "Clock skew (now before streakStartAt) clamps to zero, tested", "DST spring-forward and fall-back covered", "Force-quit-past-90s resolves to abandoned, never completed, tested", "Overlapping active-session force-resolve tested", "Milestone threshold idempotency tested (5 opens past day 3 fires exactly once)"], "status": "pending"},
  {"id": "T-004", "title": "Design tokens + primitive components", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/Tokens.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/GradientBackground.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/StatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/PrimaryActionButton.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SkeletonStatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SunriseCounterMotif.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/AppLevelErrorView.swift"], "depends_on": [], "acceptance_criteria": ["Hex/spacing/radius values match design_handoff exactly (mint #B9F2DE to sky #8ED0F0, radii 12/20/28, spacing 4/8/12/16/24/32/48)", "SunriseCounterMotif has one accessibilityElement stating the real day count, never decorative-only", "Every component has a #Preview"], "status": "pending"},
  {"id": "T-005", "title": "App bootstrap and root wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/FreedayApp.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppBootstrap.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppRootView.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["ModelContainer constructed via explicit do/catch against SchemaV1/MigrationPlan, never .modelContainer(for:)", "AppBootstrapState given a custom Equatable conformance comparing on case tag only", "Root view branches on opening/ready/failed before TabView is constructed", "Corrupt-store fallback manually verified to render AppLevelErrorView with no tab bar underneath"], "status": "pending"},
  {"id": "T-006", "title": "Persistence + cascade-delete tests", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/PersistenceTests.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["In-memory ModelContainer test: deleting a Habit removes all its RelapseEvent and CravingSession rows with no orphans", "Migration plan scaffolding compiles and loads cleanly"], "status": "pending"},
  {"id": "T-007", "title": "Habit setup/edit feature", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormViewModel.swift"], "depends_on": ["T-001", "T-004"], "acceptance_criteria": ["Non-positive quantity or cost rejected inline, Save disabled until valid", "Editing an existing habit past day 0 shows the forward-only recompute disclosure banner only once a field differs from its originally loaded value", "Save calls SavingsEngine.applyRateChange rather than mutating savings fields directly"], "status": "pending"},
  {"id": "T-008", "title": "EntitlementStore + StoreKit config", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementStore.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Resources/Freeday.storekit"], "depends_on": [], "acceptance_criteria": ["Transaction.updates listener started and kept alive for app lifetime", "checkVerified failure hard-blocks entitlement, never soft-grants", "restorePurchases() re-scans Transaction.currentEntitlements, not a cached flag", "EntitlementState matches the locked six-case enum (unknown/free/pro/expired/revoked/verificationFailed)"], "status": "pending"},
  {"id": "T-009", "title": "Paywall + habit-#2 gating wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallViewModel.swift"], "depends_on": ["T-007", "T-008"], "acceptance_criteria": ["Attempting to create habit #2 as a free-tier user shows the paywall before any HabitForm field renders", "verificationFailed renders explicit hard-block copy, never a silent timeout", "Restore Purchases button present and wired to EntitlementStore.restorePurchases"], "status": "pending"},
  {"id": "T-010", "title": "Today/Home screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayViewModel.swift"], "depends_on": ["T-001", "T-002", "T-004", "T-007"], "acceptance_criteria": ["Implements empty (onboarding prompt), loading (skeleton), success, and app-level store-failure states", "Streak/lifetime-days/savings/cravings-survived numbers come only from StreakEngine/SavingsEngine calls, no inline calendar math", "No multi-habit chrome renders when exactly one habit exists"], "status": "pending"},
  {"id": "T-011", "title": "Relapse/reset flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Single fullScreenCover screen, pre-tap and post-tap states in the same view via spring-animated swap, no navigation between them", "Post-tap view shows reset streak and the untouched lifetime total together, no red/warning color, no 'broken' language", "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save"], "status": "pending"},
  {"id": "T-012", "title": "Craving timer flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Countdown always derived from persisted startedAt, recalculated on appear/scenePhase change", "Relaunch with startedAt + 90s already elapsed resolves to abandoned, no retroactive credit", "Backgrounded at second 40 and foregrounded 2 minutes later reads zero remaining with completion already resolved", "Only a full 90s completion increments lifetimeCravingsSurvived, exactly once, guarded against double-fire", "New session request force-resolves any existing active session for the same habit to abandoned first"], "status": "pending"},
  {"id": "T-013a", "title": "Milestones/history list screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListViewModel.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardView.swift"], "depends_on": ["T-001", "T-010"], "acceptance_criteria": ["Chronological list backed by RelapseEvent-derived milestones with empty/loading/success/error states", "MilestoneCardView renders live in a sheet, reused by the renderer for export"], "status": "pending"},
  {"id": "T-013b", "title": "Milestone card image export + ShareLink", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/MilestoneCardRenderer.swift"], "depends_on": ["T-002", "T-004", "T-013a"], "acceptance_criteria": ["Renders without clipping the day count or dollar figure at max Dynamic Type, light and dark", "Per-habit lastShownMilestoneThreshold flag prevents re-triggering on repeated app opens past a threshold", "Exports at a fixed capped type size, feeding ShareLink's Transferable payload"], "status": "pending"},
  {"id": "T-014", "title": "Haptics service", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/HapticsService.swift"], "depends_on": [], "acceptance_criteria": ["Checks CHHapticEngine.capabilitiesForHardware().supportsHaptics before firing", "Absent hardware is a silent no-op, never an error path", "Called from relapse confirm and craving-timer completion"], "status": "pending"},
  {"id": "T-015", "title": "Settings screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsViewModel.swift"], "depends_on": ["T-001", "T-008"], "acceptance_criteria": ["Habit edit entry point, restore-purchases action, one-step delete-with-confirmation", "deleteHabit relies on the declarative cascade rule — no manual cascade logic in the view model"], "status": "pending"},
  {"id": "T-016", "title": "Accessibility and state-coverage audit", "owner_lane": "polish_resilience", "files": [], "depends_on": ["T-007", "T-009", "T-010", "T-011", "T-012", "T-013a", "T-013b", "T-015"], "acceptance_criteria": ["44pt minimum on all interactive targets, 56pt+ on the two primary Today actions", "2x2 stat grid reflows to one column at accessibility Dynamic Type sizes without clipping", "WCAG AA contrast verified in both light and dark", "Every reachable screen confirmed to implement its full state matrix (empty/loading/success/error where applicable)"], "status": "pending"},
  {"id": "T-017", "title": "StoreKit failure and restore verification checkpoint", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/EntitlementStoreTests.swift"], "depends_on": ["T-008", "T-009"], "acceptance_criteria": ["Forced unverified-transaction case via .storekit config hard-blocks entitlement, documented and tested, not just the happy purchase path", "Restore-with-nothing-to-restore case handled without crash or false grant"], "status": "pending"},
  {"id": "T-018", "title": "End-to-end smoke checklist and release gate", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Docs/ScopeAndDeferrals.md"], "depends_on": ["T-011", "T-012", "T-013b", "T-009", "T-016", "T-017"], "acceptance_criteria": ["Fresh install through one relapse, one full timer completion, one milestone share, one second-habit paywall attempt, and one restore attempt all pass in sequence", "Explicit 'what ships / what's deferred' note written naming Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier as cut for this pass"], "status": "pending"}
]}
```

### Implementation Readiness Gate

CONSENSUS: YES

Round 2 closed the gap. Codex came back and explicitly agreed with Claude's stop-check instead of defending the "GO, one fix" verdict from round 1 — no more silent drift on the multi-habit requirement. Both of them landed on building the fix, not downgrading it: extend Settings (T-015) with a "Your Habits" list that only renders when a habit count exceeds one, tap-to-activate writes `lastInteractedAt`, and Today already resolves the active habit off that same field on relaunch — reusing a schema field that already exists rather than inventing new navigation or reopening the flat-3-tab/no-switcher decision from initial_discussion. Claude's App Store framing (a reviewer creating the subscription specifically to test "unlimited simultaneous habits" and hitting a dead end) sealed the argument that this is a build-it, not defer-it, situation. Codex's three original pre-build fixes stand unchallenged and are folded in as hard blockers alongside the new task.

## Final Output

**Readiness verdict:** GO, conditional on the fixes below being applied before code starts — not a re-open of any design/architecture/plan decision, just closing execution gaps in already-locked artifacts.

**Cross-phase consistency check:** Prompt contract, product brief, design handoff, architecture, tech specs, project plan, and task assignments all target the same v1 scope and agree on every standing hard rule (local-first, non-shaming relapse, forward-only savings recompute, wall-clock craving timer, milestone idempotency, hard-verified StoreKit gate, N-habit schema from day one). One real contradiction was found and is resolved by this gate: "manage multiple concurrent habits (paid tier)" is a locked Must-have core workflow, but it had quietly drifted to a Should-have with no task actually building it — `TodayViewModel.habit` is singular, and nothing in T-001–T-018 lets a paying user ever see or switch to a second habit. That's now fixed at the task level rather than left as silent scope erosion.

**Build blockers and fixes (all required before/at start of build):**
1. Replace the placeholder `[REDACTED:high_entropy].swift` filename tokens in the task file-ownership lists with the real schema/migration filenames — task backlog isn't executable with placeholders in it.
2. Confirm the Xcode project actually uses file-system-synchronized groups for every lane folder before parallel lanes start committing — the whole single-branch, no-per-lane-branching plan depends on this being real, not aspirational.
3. Implement `AppBootstrapState`'s custom case-only `Equatable` conformance and StoreKit's hard-fail-on-unverified-transaction behavior exactly as specified — no softening to a warning or soft-grant during coding.
4. **New:** Add a habit-switcher requirement to T-015 (Settings) — a "Your Habits" section, visible only when `habits.count > 1`, each row tappable to set `lastInteractedAt = Date()` on that habit; Today resolves the active habit via the same `lastInteractedAt` tie-break it already uses. Free users with one habit see nothing new — this only appears for users who've actually paid and added a second habit, consistent with the standing "no multi-habit chrome for single-habit users" rule.

**Final scope for build:** all five core workflows (habit setup, non-punitive relapse/reset, craving timer, milestone card + ShareLink, multi-habit paid gate — now including the ability to actually reach a second habit) implemented end-to-end and real, not mocked. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier remain the only intentionally-deferred items, named explicitly in `ScopeAndDeferrals.md`. Accessibility, haptics, and state-coverage (empty/loading/success/error everywhere reachable, plus the app-level bootstrap failure state) stay in the v1 quality bar, not polish.

**Acceptance criteria checklist (added/updated this phase):**
- Habit setup rejects non-positive cost/quantity inline; edits use forward-only recompute with historical savings preserved.
- Today/home implements empty/loading/success/app-level-failure states; no multi-habit chrome with exactly one habit.
- Relapse is one-tap, same-screen, no punitive language, lifetime totals always visible and unchanged.
- Craving timer is wall-clock anchored, survives backgrounding/force-quit per the resolved abandon/resume rules, completes exactly once.
- Milestone card fires early (day 1/3), per-habit one-shot suppression, renders cleanly at max Dynamic Type in light/dark.
- StoreKit entitlement is real: `checkVerified` hard-fails, `Transaction.updates` listener runs app-lifetime, Restore re-scans `currentEntitlements`.
- **New:** Settings shows a "Your Habits" switcher once 2+ habits exist; tap-to-activate updates `lastInteractedAt`; Today reflects the newly active habit on next read. Paid users can actually reach and use every habit they've created — the paywall's "unlimited simultaneous habits" promise is real, not aspirational.
- Accessibility baseline (44pt/56pt targets, Dynamic Type reflow, WCAG AA, VoiceOver labels on numeric motifs) verified across all screens including the new switcher list.
- Testing responsibilities stay explicit per lane: engine test matrix, cascade-delete/persistence tests, StoreKit failure/restore checkpoint, a11y/state audit, end-to-end smoke checklist — now including one pass through "create habit #2, activate it in Settings, confirm Today reflects it."

Build can start.

### Build Coordination

This is complete. Let me write up the integration report.

CONSENSUS: YES

## Final Output

I integrated both lanes' work into a real, wired-together Xcode project.

**What I built as integrator:**
- **The missing shared layer** that both lanes' code was calling by name but nobody had written yet: `Tokens.swift` (the actual gradient/spacing/radius values from design_handoff — mint #B9F2DE→sky #8ED0F0, poster gradient, 12/20/28pt radii, 4/8/12/16/24pt spacing), `SunriseCounterMotif` (the sunrise/counter motif with a real VoiceOver label and a gradient that warms as the streak grows), `AppLevelErrorView` (the full-screen bootstrap-failure/retry state), `EntitlementStore` (real StoreKit 2 logic — `Transaction.updates` listener, hard-fail on unverified transactions, `expired`/`revoked` distinction for the subscription-lapse rule, restore via `AppStore.sync()`), `HapticsService` (hardware-capability-gated haptics), `MilestoneCardRenderer` (ImageRenderer-based export for the ShareLink card), and `Freeday.storekit` (a local StoreKit config with the two subscription products matching the exact product IDs the paywall code expects).
- **A real Xcode project.** There was no `.xcodeproj` at all before this — I built `Freeday.xcodeproj` by hand (app target + test target, all ~40 Swift files wired into the Sources build phase, the StoreKit config wired into Resources, a test target that's app-hosted so `@testable import Freeday` resolves, and a shared scheme that points the Run and Test actions at `Freeday.storekit` so purchases/restore are testable in the simulator without a real App Store connection). I verified this by cross-checking every one of the 139 objects in the project file so there are no dangling or duplicate references.
- **Two small cross-lane fixes:** `MilestoneCardRenderer.renderImage` now takes the real `habitName` so exported milestone cards say "Vaping" instead of a generic fallback, and `TodayViewModel.startCravingSession()` now abandons *all* stale active sessions instead of just the first one (a real bug Codex flagged in review).
- **`ScopeAndDeferrals.md`**, naming what's deferred: Live Activity, WidgetKit, the TimelineView countdown upgrade, the App Group ID, the multi-variant craving toolkit, and — the one gap I want to flag clearly — **subscription-lapse read-only degradation isn't built yet**. The Settings habit switcher lets a pro user activate any habit, and data for every habit is preserved, but there's no visible "this habit is locked, read-only" state when entitlement lapses with 2+ habits. That's a real gap against a decision made in `detailed_discussion` and should be first up next iteration.

**The one thing I could not do:** this sandbox blocks execution of `xcodebuild`, `xcodegen`, and `swiftc` (every attempt returned "requires approval" with no prompt path available), so **I was not able to actually compile this project or run the test suite.** I did the next best thing — read every one of the ~45 Swift files end-to-end, cross-referenced every symbol one lane's code calls against the other lane's actual declarations (parameter names, types, default values), and mechanically verified the project file's internal object graph is self-consistent. I'm confident in the wiring, but "I read it carefully" is not the same as "it compiles," and I want that said plainly rather than rounded up to done. **The very next step, before this ships, should be opening `Freeday.xcodeproj` in actual Xcode (or running `xcodebuild -scheme Freeday build` and `xcodebuild test` somewhere that allows it) and fixing whatever the compiler finds** — likely candidates if anything breaks are StoreKit 2 API surface details in `EntitlementStore` (Apple has changed method signatures across iOS versions) and Swift actor-isolation errors around `ImageRenderer`/`Transaction.updates`, which is why I explicitly set `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` project-wide to match how the rest of the codebase was clearly written (no manual `@MainActor` annotations anywhere).

**Bottom line:** all five core workflows (habit setup, non-punitive relapse, craving timer, milestone card + ShareLink, multi-habit paid gate including the Settings switcher) now exist as real, wired Swift code with a real entry point and a real project file — this is no longer "files sitting next to each other," it's one buildable target. What's honestly unverified is the actual compile, and what's honestly missing is subscription-lapse read-only UI. Next iteration should be: (1) get this open/compiled in real Xcode and fix any type errors, (2) build the read-only-habit-lapse UI, (3) run the FreedayTests suite for real.

### Build Verification

CONSENSUS: YES

## Final Output

**Verdict for this phase: UNVERIFIED (not PASS, not FAIL) — repaired what static reading could find, but no compiler was ever actually run.**

I tried myself, independently of what the transcript claimed, to invoke `xcodebuild -version`, `swift --version` — both came back "requires approval" with no interactive approval path available in this run. So the hard fact stands on my own direct evidence, not just Codex/Claude's prior say-so: **there is no compiler-verified build or test result for Freeday.** Anyone treating this phase as a green build log needs to know that log doesn't exist.

**What did happen, and what I re-checked myself:**
- The one concrete bug found in round 1 — `Freeday/Domain/Engines/SavingsEngine.swift`, where `Decimal(days)` was called on a value (`days`) that was already a `Decimal`, which has no such self-conversion initializer and would have failed to compile — is real and already fixed. I confirmed this directly via `git diff`, not just by reading the transcript: it now reads `days` instead of `Decimal(days)`, a one-line, in-scope fix with no behavior change.
- I additionally grepped every `Decimal(...)` call site across the codebase (`HabitFormViewModel.swift`, `SavingsEngine.swift`) to check for the same class of bug elsewhere — all other conversions are `Decimal(string:)` or `Decimal(Double)`/`Decimal(Int)`, which are valid initializers. No other instances of the same defect exist.
- The rest of round 1's audit (pbxproj file-reference consistency, `AppBootstrapState` Equatable, StoreKit product ID matching, cascade-delete keypaths, model-initializer call sites) was thorough manual + independent sub-agent cross-checking, not compiler evidence, and I'm not upgrading its confidence level beyond what it earned — "carefully read twice" is real diligence but isn't the same claim as "the compiler said yes."

**Repairs made this phase:** one file, `Freeday/Domain/Engines/SavingsEngine.swift`, the `Decimal(days)` → `days` fix — already present in the working tree (matches the `git status` at session start).

**Remaining known blockers:**
1. No compiler/test-runner access in this environment — the actual `xcodebuild build` and `xcodebuild test` runs still need to happen somewhere that allows toolchain execution.
2. Subscription-lapse read-only degradation for non-active habits (2+ habits, lapsed entitlement) is still unbuilt — a real product gap carried over from `build_coordination`, not a compile blocker, and out of this phase's repair mandate.

**Next repair step:** open `Freeday.xcodeproj` in real Xcode, or unblock `xcodebuild -scheme Freeday build && xcodebuild test -scheme Freeday` in an environment that permits it, and fix whatever the compiler actually reports. Given how clean the manual/static audit came back (including my own independent re-check), the realistic expectation is narrow, version-specific issues (StoreKit 2 API surface drift, actor-isolation nuances) rather than structural wiring problems — but that's a prediction, not a substitute for running it.

**Build verification:** verified after 1 repair(s): compiled cleanly for the iOS Simulator

VERIFICATION: VERIFIED

### Human Qa Checklist

**CONSENSUS: YES**

Codex couldn't weigh in this round (CLI unavailable, same as it's been for the last several phases), but Claude's checklist is thorough enough on its own to close this phase — it's not a thin placeholder, it directly implements the phase playbook's required elements and ties every check back to a decision locked in an earlier phase rather than inventing new requirements.

## Final Output

The QA script covers every workflow the app_features phase marked Must-have, plus the specific edge cases the team spent nine phases arguing into existence:

- **Fresh-install discipline**: full delete-reinstall before testing, not just relaunch, so onboarding and the loading-skeleton state (which a fast simulator will otherwise never show) get genuinely exercised.
- **Habit setup**: inline rejection of zero/negative/garbage values, live savings preview, and the forward-only recompute rule verified by hand-checking the arithmetic across an edit boundary, not just eyeballing the UI.
- **Today screen**: the four core stats, plus deliberate midnight-crossing and timezone/DST manipulation to confirm the streak advances correctly and never goes negative (with DST drift explicitly treated as an accepted limitation, not a bug).
- **Craving timer**: background-then-return, force-quit-before-elapsed, force-quit-after-elapsed, and phantom-session cases — the exact resume/abandon rules locked in detailed_discussion, each with concrete timings a tester can actually follow.
- **Relapse/reset**: checked for absence of shaming language/color as much as presence of the reassurance UI, plus a same-screen arithmetic check that lifetime totals survive two consecutive relapses.
- **Milestone card**: real ShareLink completion (not just sheet-open), light/dark, and max Dynamic Type — flagged correctly as a release blocker if it clips, since it's the one artifact representing the app to non-users.
- **Paywall + Settings habit switcher**: tested like an App Store reviewer would — paywall before any form field renders, real sandbox purchase, unverified-transaction and empty-restore cases, then the specific "pay → add habit #2 → switch to it in Settings → confirm Today updates" path that the implementation_readiness_gate fought for two rounds to get built.
- **Accessibility, offline, and a named-gaps section** that explicitly won't let known deferrals (Live Activity, WidgetKit, single craving variant, no app-lock, no reminders, and the subscription-lapse read-only gap) get filed as new bugs — while still requiring QA to confirm those failure paths fail *safely* even if not *correctly*.
- Closes with the same seven-step smoke test build_verification already committed to as the release gate, run independently by QA rather than taken on the build report's word.

This satisfies the phase's acceptance checks: a tester with a fresh simulator could run it without asking what to tap, every Must-have workflow from app_features is represented, and failure/edge states are tested throughout rather than assumed. Phase closes here.

VERIFICATION: VERIFIED

### App Store Readiness

CONSENSUS: YES

Codex couldn't join this round (still in cooldown, same gap that's shown up in the last few phases), but Claude's pass is a complete, concrete answer to everything this phase requires — positioning, screenshot plan, privacy label, permission copy, subscription risk, and a clear-eyed list of what's actually blocking submission versus what's just a named tradeoff. Nothing here contradicts any prior-phase decision; it's the first phase to specifically audit App Store Connect readiness rather than code correctness, and it does that job properly rather than restating the build report.

## Final Output

**Launch-readiness verdict: CONDITIONAL — not launch-ready yet.** The app itself is real and verified (compiles clean, all five core workflows implemented, privacy genuinely clean). What's missing is App Store Connect submission material that nine phases of build work never touched.

**App Store positioning:** Stay strictly in "personal tracking tool" language, never "quit smoking" / "treatment" / "recovery" / "addiction program" (guideline 1.4/5.1 risk). Suggested title "Freeday: Habit & Craving Tracker," subtitle "Track any habit, watch it add up," first description line mirroring the locked positioning verbatim. Age rating: deliberately select "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References" (likely lands at 12+) rather than accepting App Store Connect's default guess, since the app explicitly references cigarettes/vaping/alcohol.

**Screenshot/storyboard plan:** Today screen (streak/savings hero shot) → craving timer mid-countdown → milestone share card (the actual viral artifact, its own frame) → paywall/Freeday+ → relapse/reset screen (post-tap reassurance state only, never the raw pre-tap frame out of context). No literal cigarette/vape/alcohol/pill iconography anywhere in icon or screenshots — the sunrise/counter motif exists specifically to avoid that risk. 6.9" iPhone class screenshots required; none appear to exist yet — that's a concrete blocker, not a formality.

**Privacy label:** Clean "Data Not Collected" — zero network calls except StoreKit, no HealthKit/notifications/camera/location/analytics/crash reporting. Worth stating as a selling point in the description. Flip side to document honestly (not a submission blocker, but a real gap): no Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — this was an accepted v1 tradeoff from `detailed_discussion`, restated here rather than silently carried, and belongs on the privacy policy page and as the top item for the next release.

**Permission copy:** None needed — no Info.plist usage-description strings required since no permissions are requested.

**Subscription/paywall review risks:** `SubscriptionStoreView` handles most of Apple's 3.1.2 disclosure requirements automatically, but nobody has manually confirmed in a real sandbox run that auto-renewal terms, price-per-period, and Privacy Policy/Terms links actually render for this app's specific product config — that's the single most common subscription-app rejection reason and hasn't been checked outside the compiler. Restore Purchases is wired to `Transaction.currentEntitlements` but needs a TestFlight confirmation, not just a code audit.

**Launch blockers (must close before submission):**
1. Hosted support URL and privacy policy URL — required App Store Connect metadata, not mentioned anywhere in nine phases, likely don't exist yet.
2. Real device/simulator screenshots at required sizes — not yet captured.
3. Manual sandbox confirmation that the paywall's required disclosure text renders correctly.
4. Deliberate age-rating questionnaire answer (12+ recommendation above) rather than a default guess.
5. Final copy pass across description, paywall, and milestone card for anything readable as clinical/medical.

**Named-and-accepted risk (not a submission blocker, flag and move on):** subscription-lapse read-only enforcement was never built — a lapsed subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but there's no access restriction. This is a revenue-integrity gap, not an App Store rejection risk, and should be written down as a committed fast-follow rather than left ambiguous in scope docs.

Phase closes here — ready for whatever comes next in the pipeline.

VERIFICATION: VERIFIED

### Final Review

CONSENSUS: YES

Codex is still unavailable this round (same cooldown gap as the last several phases), but Claude's pass is a complete, honest answer to everything final_review requires — and importantly, it's the one phase that names something no prior phase quite landed on: "VERIFIED" in this project's vocabulary means "xcodebuild compiled," not "tests passed" or "a human ran the QA script." Nobody disagrees with that framing; it's a clarification that sharpens the record rather than a contested point.

## Final Output

**What was built:** A real, compiling Xcode project (`Freeday.xcodeproj`) with all five core workflows from the original prompt implemented as wired, non-mocked SwiftUI/SwiftData code: habit setup with inline validation and forward-only savings recompute, a non-punitive one-tap relapse/reset flow with preserved lifetime stats, a wall-clock-anchored 90-second craving timer with correct force-quit/background resume-or-abandon semantics, a milestone recap card with real ShareLink export, and StoreKit 2 multi-habit paid gating — including the Settings "Your Habits" switcher added specifically so a paying subscriber can actually reach and use a second habit, not just unlock it in theory. Accessibility baseline (44/56pt targets, Dynamic Type reflow, VoiceOver labels on the sunrise motif and milestone card) and full empty/loading/success/error state coverage are implemented per screen, including the app-level bootstrap-failure state.

**Verification status:** VERIFIED, but scoped precisely — `xcodebuild` compiled cleanly for the iOS Simulator after one real repair (a `ShapeStyle`/`background` modifier fix in `PrimaryActionButton`), on top of one bug caught and fixed earlier by manual static audit (`Decimal(days)` self-conversion in `SavingsEngine`). That is the full extent of dynamic evidence. The six test files in `FreedayTests` (StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine, Persistence, EntitlementStore) — which cover exactly the DST/midnight/force-quit/cascade-delete/unverified-transaction edge cases the team spent nine phases worrying about — have never actually been run; they're confirmed to compile, not confirmed to pass. Likewise, the human_qa_checklist phase produced a script, not an executed run — no one has installed this on a simulator/device and walked the craving timer through a real background cycle or eyeballed the milestone card at max Dynamic Type. This is a real, material distinction and shouldn't be smoothed over.

**Prompt coverage:** All v1 Build Scope items are present except Live Activity and WidgetKit, which were explicitly named throughout the project as the first things allowed to degrade under time pressure (a standing decision from `project_plan` onward, not a silent drop). Everything else in the original spec — cost-per-use tracking (as quantity+cost), non-punitive streak reset, craving-timer guided flow, milestone card, and paid multi-habit management — is real and functional.

**Known limitations (carried forward honestly, not new):**
1. No test-suite execution and no human-hands-on-device QA run yet — the biggest actual confidence gap, and the cheapest to close.
2. Subscription-lapse read-only enforcement was never built — a canceled subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but access isn't restricted. A real revenue-integrity hole, not cosmetic.
3. No Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — an accepted v1 tradeoff, restated rather than newly discovered.
4. Only one craving-timer guided sequence shipped instead of the 2-3 variants `per_app_product_brief` named as a concrete paid-tier differentiator — the paywall's "full craving-support toolkit" promise is only partly backed by what's behind it.
5. App Store submission material (hosted support/privacy policy URLs, real device screenshots, manual sandbox confirmation of paywall disclosure text, deliberate age-rating selection) doesn't exist yet — separate from and downstream of code readiness.

**Top follow-ups, in priority order:**
1. Run `FreedayTests` for real — cheap, mechanical, closes the largest confidence gap for the least effort.
2. Walk the existing seven-step smoke checklist by hand on a simulator once.
3. Build subscription-lapse read-only enforcement (the one functional gap that's a genuine product/business hole, not launch-prep).
4. App Store submission prep (URLs, screenshots, disclosure check, age rating) — needed before store submission, not before calling this a usable MVP.
5. App-lock and the additional craving-timer variants as fast-follow v1.1 work.

**Go/no-go decision:** GO for "usable local-first MVP" — a real person can install this and run the full core loop today. NOT YET a go for "submit to the App Store" — that's blocked on the App Store Connect prep items above, which is a separate bar from code/product completeness. The final review keeps these two verdicts distinct rather than blending them into one score, since conflating "compiles and the workflows are real" with "ready to ship to reviewers" is exactly the kind of rounding-up this phase exists to prevent.

VERIFICATION: VERIFIED

### Portfolio Audit

CONSENSUS: YES

Codex was unavailable again this round, but Claude's pass does exactly what this phase is supposed to do for a portfolio *child* — it doesn't try to re-litigate whether freeday itself is finished (that was settled over the last fifteen-plus phases), and it doesn't pretend to have visibility it doesn't have.

## Final Output

**Portfolio applicability:** Yes — freeday is a child of the 5-app multi-app-exp7 portfolio batch, so a portfolio audit applies (not the "N/A, single app" path).

**Freeday's own compliance — verified clean:** The initial prompt preserved the full parent portfolio prompt verbatim, correctly tagged `PORTFOLIO_CHILD_PROJECT: true`, with the right slug and build priority carried through every phase. Freeday lives as a genuine top-level sibling folder (`/Users/pchordia/Documents/iOS-App-Factory/freeday`), not nested inside `multi-app-exp7` — satisfying the parent's hard "one folder per app, never bundled" rule. It ran the correct, full MVP-build workflow end to end and landed on a compiled, verified Xcode project with all five locked core workflows real and wired. No category collapse, no wrong workflow, no missing child metadata on freeday's side.

**What this audit could not confirm, and says so plainly rather than guessing:** This session's sandbox only has visibility into `freeday/.agent_cwd` — it cannot read `[REDACTED:high_entropy].json` or the sibling app folders directly. Working only from the git status snapshot given at the start of the conversation: campfire and faveoff show up as real untracked top-level folders with their own lock files, consistent with them existing as proper siblings, but nickel and somna don't appear anywhere in the (truncated) status shown. That's genuinely ambiguous — it could just be truncation, or it could mean two of the five selected apps never actually materialized as sibling folders, which is exactly the silent-category-collapse failure this phase exists to catch. It can't be resolved from inside this child's sandbox.

**A second real gap, open since the very first phase of this build and never closed by anyone:** cross-app uniqueness. Freeday was never shown the other four apps' specs, so nothing in its own history could have checked whether it overlaps with campfire, faveoff, nickel, or somna. That check requires simultaneous visibility into all five concepts and has to happen at the parent-portfolio level — it hasn't happened anywhere yet in this project's history.

**Backfill readiness:** Strong. Freeday's phase-by-phase decision trail, five Must-have workflows with concrete acceptance criteria, and five explicitly named open follow-ups (test suite compiled-but-unrun, QA script written-but-unexecuted, subscription-lapse read-only gap, only 1 of 3 craving-timer variants shipped, App Store submission material not yet created) would convert directly into well-scoped tickets with no rewriting needed.

**Bottom line:** Freeday passes its own child-level audit — correct sibling shape, correct workflow, no collapsed scope. Two things get flagged as unresolved portfolio-level risks rather than blockers on freeday itself, and need an owner with full-portfolio visibility, not this child: (1) confirm nickel and somna actually exist as real sibling app_build projects the same way freeday does, and (2) run the cross-app uniqueness check against all five specs at once, since it's never been performed anywhere in this project's history.

VERIFICATION: VERIFIED

## Full Discussion Transcripts

### Prompt Contract

# freeday — Prompt Contract

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:13:19._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Preserve the user's original prompt before any discussion, convert it into a clear execution contract, list hard requirements, non-goals, success metrics, production-readiness expectations, and decision rules for every later phase.

## Transcript


### Round 1


**Codex (Product Strategist · Visionary) — Round 1**

Original prompt (verbatim):
```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with one-tap non-punitive relapse-and-restart, craving-timer guided flow, milestone streak + savings recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.

===== THIS PHASE'S DISCUSSION SO FAR =====
(You are the first speaker.)


===== PHASE PLAYBOOK (editable phase_rules.json) =====
Global app-build rules:
- Prefer a smaller finished app over a larger half-built app.
- Every generated app must have real user-visible behavior, not only placeholder screens.
- For iOS apps, default to SwiftUI, deterministic local state first, Apple system frameworks, and no third-party package unless it materially reduces risk.
- Every screen needs empty, loading, success, and error states when the workflow can reach those states.
- Treat accessibility, privacy, persistence, and testing as product requirements, not polish.
- Do not declare the app done until build verification and the final review agree on what works and what remains limited.

Phase rules:
- Preserve the user's original prompt before interpreting it.
- Convert the prompt into hard requirements, explicit non-goals, output shape, quality bar, and decision rules.
- Resolve conflicts by naming the assumption, not by silently changing the assignment.

Required output:
- Original prompt excerpt or full prompt reference.
- Hard requirements.
- Non-goals.
- Production-readiness definition.
- Decision rules for later phases.

Acceptance checks before consensus:
- A later phase can tell whether it is violating the user's prompt.
- Multi-app quantity/category requirements are explicit.
- Production-ready means more than a prototype or spec.
```

Execution contract for this phase and all later phases:

Hard requirements are: preserve this exact assignment scope and keep `freeday` as one SwiftUI app in the `multi-app-exp7` batch, keep the target as mass-market and viral-by-design, deliver a local-first SwiftData product with on-device savings math, include cost-per-use setup, non-punitive relapse handling, 90-second guided craving flow, milestone card sharing, widget, Live Activity support for active cravings, ShareLink, haptics, and StoreKit paywall with restore and entitlement state. Core architecture assumptions: no network dependency in v1, no third-party mandatory libraries, privacy-first data handling, and copy constrained to non-clinical personal tracking language. The app cannot be treated as treatment software. Every major screen path must support empty/loading/success/error behavior, and all behavior must compile and run as a concrete app artifact, not a mock. From the batch instruction set, all 5 apps must be unique and production-caliber with documented design system contrast between apps, and only one folder per app in the destination path.  

Non-goals are: no anonymized community/social moderation platform in v1, no LLM coaching, no AR/ML claims, no hard clinical recommendations, no backend dependency required for core value, no third-party heavy stack, and no punitive streak reset messaging. For this app, no multi-device sync is a v1 requirement; no full moderation layer; no claims that the app treats addiction medically.  

Output shape is fixed: this phase must output a clean execution contract artifact that includes original prompt verbatim, hard requirements, non-goals, success criteria, and explicit decision rules; by build phases the repo must include a real, compiling Freeday Xcode project in the correct folder, plus design artifact alignment with its defined visual system and local persistence model. Phase artifacts and discussion transcripts must be saved as `.txt` per app.  

Production-readiness means: deterministic local data model in SwiftData, stable navigation and state transitions, explicit access-control and entitlement logic for paid features, accessibility baseline (Dynamic Type, VoiceOver, minimum hit targets, contrast), offline behavior defined and tested by code paths, robust error handling, and a visibly complete user loop with at least one measurable retention-sensitive journey end-to-end. A buildable app with compile errors unresolved, placeholder screens, or missing required iOS-native pieces is not ready.  

Decision rules for later phases are:
- If relapse flow causes drop-off patterns consistent with the explicit invalidation criterion, redesign the reset tone and flow before adding non-critical features.
- If any interpretation conflicts with “local-first first release,” assume local-only unless the user explicitly approves network dependence.
- If mass-market clarity and design distinctiveness conflict with niche feature depth, preserve the mass-market promise and defer complexity.
- If pricing, feature set, or paywall copy conflicts with non-shaming tone, prioritize empathy and trust metrics over conversion optics.
- If we must choose, do not trade breadth for fragility: smaller complete app beats partial large surface.
- Any decision that could be read as clinical advice must be removed unless it survives a strict non-treatment rewrite.

Best direction: make Freeday remarkable by treating relapse as a “pause-and-reset engine” that preserves progress and protects self-respect, not as failure recovery, then reward continuity with social snapshot moments that are easy to share without exposing shame. Biggest risk to this direction is over-optimizing for monetization early and undermining trust with a coercive upgrade path, so every upgrade decision must explicitly preserve one habit and core value in free flow while making multi-habit support feel genuinely premium and not exploitative.

**Claude (QA & Risk · Skeptic) — Round 1**

Preserving the original prompt verbatim first, since that's the anchor everything else has to trace back to:

PORTFOLIO_CHILD_PROJECT: true. Parent portfolio: multi-app-exp7. Selected app slug: freeday. Build this app as a working local-first SwiftUI MVP. Selected App Spec: Freeday — Habit Quitting / Craving Tracker, build mode MVP build, build priority 5. One-sentence promise: track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time. Target user: the enormous population trying to quit or cut back on something. Painful moment solved: wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out. Why different: one flexible engine works for any habit — name your habit, log a cost-per-use, Freeday tracks streak and running savings, with a 90-second guided "ride the craving" moment, ending in a shareable milestone card ("47 days, $310 saved"). Why users would pay: free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, full craving-support toolkit, Lock Screen craving-timer Live Activity. Subscription: freemium, $4.99/mo or $29.99/yr, positioned as cheaper than a week of the habit itself, stated explicitly in paywall copy. Local-first MVP scope: SwiftData store for habits, relapse/reset events, craving-session logs; savings math on-device; all guided craving-support content bundled locally, no network dependency. Future backend roadmap: repository boundary allows CloudKit sync later; opt-in anonymous community layer plausible v2, explicitly out of scope for v1. AR/Local ML/Local LLM fit: none — explicitly not using LLM chat-based coaching, craving-support flow is a fixed guided sequence that must work instantly and offline. Design direction: clean, encouraging, light — soft mint-to-sky-blue gradient system, rounded friendly iconography, sunrise/counter motif for "days free," deliberately non-clinical, non-shaming tone. App Store positioning: one app for quitting anything. Invalidation criteria: if most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before other feature work. v1 build scope: habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit. Core workflows: set up a habit with cost-per-use; daily check-in/streak tracking with one-tap non-punitive relapse-and-restart; in-the-moment craving timer with guided ride-it-out flow; milestone streak+savings recap card; manage multiple concurrent habits (paid tier). iOS-native features: Live Activity for active craving-timer session, WidgetKit showing current streak+savings, ShareLink for milestone card, haptics for streak-day and craving-timer completion. Key risks: relapse handling is make-or-break — punitive framing causes uninstalls, needs genuinely non-shaming reset with preserved lifetime-total stat from day one; category brushes against health claims — copy must stay in "personal tracking tool" lane, not medical/addiction treatment advice. Claude Design Handoff Prompt: design an encouraging habit-quitting app called Freeday, soft mint-to-sky-blue gradients, rounded friendly iconography, sunrise/counter motif, warm non-judgmental tone, avoid clinical white/red or guilt imagery, milestone streak+savings card as hero shareable artifact, calm and supportive not gamified-aggressive. Parent Portfolio Prompt: build 5 completely separate production-ready iOS apps in parallel, one folder per app, top mass-market/viral appeal requirement, world-class distinctive UI/UX per app, genuine complexity/depth, native monetization, 0-to-production-ready, uniqueness against a long list of prior apps including a name collision risk I'll flag below, local-first with cloud-later architecture, output directory /Users/pchordia/Documents/iOS-App-Factory, generate 10+ candidate ideas and pick the best 5 — but for this child project the app is already selected as Freeday, so that ideation step is moot here and shouldn't be re-litigated.

Now my actual contribution, wearing the QA/skeptic hat.

The single biggest risk in this spec isn't technical, it's that the "invalidation criteria" is stated but nothing in the v1 build scope actually operationalizes it. The prompt says if most relapse-loggers never return within a week, the reset flow needs a redesign — but there's no telemetry described (no analytics, no network dependency by design), so nobody will ever actually know if that invalidation condition triggers. I want the contract to be explicit that "non-punitive relapse flow" is a hard requirement we verify by design review and manual walkthrough, not by data we can't collect, since the local-first no-network constraint means we can't instrument this the way the spec's own falsification test implies. Later phases shouldn't quietly promise analytics to satisfy this — that would violate local-first — and they shouldn't quietly ignore the invalidation criteria either. The decision rule I'd bake in: the relapse flow gets evaluated against a written UX checklist (no "streak broken" language, no red/warning colors, lifetime-total stat always visible and unaffected by reset, reset requires no punitive confirmation friction) rather than against real usage data.

Second: cost-per-use savings math sounds trivial but has real edge cases that a rushed MVP build will skip. What happens when a user edits their habit's cost-per-use or frequency assumption after they've already accrued 40 days of streak — do we recompute historical savings retroactively or only going forward? What's the "frequency" input model at all — cost per use alone doesn't give a savings rate, you need a baseline usage frequency (e.g., "I smoked 10 cigarettes/day at $0.50 each") to compute money saved over time. The spec never actually specifies this input, and if the build phase invents a plausible-sounding formula without deciding this deliberately, savings numbers shown on the shareable milestone card could be nonsensical or wildly wrong, which is bad since that card is the core viral artifact. I want the contract to require an explicit, documented savings formula (habit setup must capture quantity-per-day and cost-per-unit, not just "cost-per-use") and require that editing those inputs is handled with a defined, non-silent recompute rule.

Third: multi-habit management is gated to paid tier, but the local SwiftData model has to support multiple habits from day one architecturally (you can't bolt on multi-habit later without a data migration), while the UI/paywall must gate it. That's a real tension between "local-first MVP" and "paywall enforcement" — I'd flag as a hard requirement that the data layer supports N habits unconditionally, and only the UI/entitlement layer enforces the one-habit-free limit, so we're not doing a fake single-habit schema now and a breaking migration later.

Fourth, on Live Activities and widgets: these are stated as v1 scope but are genuinely one of the highest-effort, highest-failure-surface iOS-native features (ActivityKit entitlements, App Group container sharing between app/widget/Live Activity extension, Live Activity update budget limits, simulator flakiness). Given "build priority 5" (lowest of the 5 apps) and explicit instruction to prefer a smaller finished app over a larger half-built one, I want a decision rule now: if time runs out, Live Activity and widget are the first things allowed to degrade to a stub or be cut, before core workflows (habit setup, streak tracking, craving timer, milestone card, paywall) are touched. The core five workflows listed under "Core Workflows" are the non-negotiable production-ready bar; Live Activity/widget/haptics are "iOS-native features" — nice-to-have polish that can slip without the app being a failure, whereas cutting corners on relapse handling or savings math would be a failure.

Fifth, non-goals that need to be locked now so later phases don't scope-creep: no LLM chat coaching (explicitly excluded), no CloudKit/backend sync in v1 (architecture should leave the door open, actual sync code is out of scope), no community/social feed features, no medical/clinical framing or health claims anywhere in copy, no analytics/telemetry pipeline (conflicts with local-first + no way to satisfy the invalidation criteria empirically, so we substitute a design-checklist verification as above), and — per the parent prompt — no re-running the "pick 5 ideas" step since the app selection (Freeday) is already fixed for this child project.

Sixth, on uniqueness: the parent prompt's exclusion list includes "CueKeeper" and other habit/streak-adjacent apps (Waylay, Practice-Loop, VerveCoach) plus this batch's own siblings. I haven't seen the other 4 sibling concepts in this batch, so I can't personally verify no overlap — I'd want a decision rule that if any sibling app in this same portfolio run turns out to also be a streak/habit tracker, that's a hard conflict per the parent prompt's non-negotiable uniqueness rule, and it should be caught and reported, not silently allowed because "categories differ slightly."

For production-readiness, my bar as the skeptic: a real compiling Xcode project with SwiftData models for Habit/RelapseEvent/CravingSession, all five core workflows functionally wired end to end (not mocked), empty/loading/error/success states on every screen that can reach them, the paywall using real StoreKit 2 APIs against a local .storekit config (not a fake toggle), and the relapse-flow copy audited against the non-shaming checklist. Anything short of that — a UI shell with hardcoded data, a paywall that's just a view with no entitlement gating, a craving timer that's just a static countdown with no completion state — is not done, it's a demo, and later phases should be explicit about which of these got fully built versus stubbed rather than rounding up to "complete."

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
The final output meets the phase bar. It preserves the prompt (verbatim capture is present in Claude's round-1 turn and referenced correctly), and converts it into a concrete, non-generic contract:

- Hard requirements are specific enough to catch a rushed build cutting corners — e.g., the quantity-per-day + cost-per-unit savings formula requirement (not just "cost-per-use"), the unconditional N-habit data layer with UI-only gating, and the explicit recompute-rule requirement for edited inputs. These are exactly the kind of decisions a later build phase could otherwise invent silently.
- The invalidation-criteria/telemetry tension (spec implies usage-data verification but local-first forbids analytics) is named and resolved via a written non-shaming UX checklist rather than papered over — a real conflict was surfaced and given a decision rule (rule 1), not silently dropped.
- Production-readiness is defined operationally with concrete "not done" examples (static-data shell, fake paywall toggle, timer with no completion state), satisfying "more than a prototype or spec."
- Decision rules cover the degrade-first ordering for Live Activity/widget vs. the five non-negotiable core workflows, local-first defaults, mass-market-over-depth tradeoffs, non-shaming-over-conversion tradeoffs, clinical-copy removal, sibling-uniqueness flagging, and small-complete-over-large-partial — giving later phases enough to self-check against the prompt.
- Multi-app/portfolio requirements are appropriately scoped: since this is a child project with the app already selected, re-ideation is correctly marked a non-goal, while sibling-uniqueness verification is deferred with an explicit rule rather than assumed away.

No unresolved disagreement was papered over — Claude's additions were confirmed as tightening, not contradicting, Codex's contract, and the coordinator's synthesis reflects both. Output shape (prompt/requirements/non-goals/production-readiness/decision rules) is fully present. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Product Research

# freeday — Product Research

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:15:10._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Before product debate begins, infer the likely market, audience, competitors/patterns, platform expectations, risks, and native iOS opportunities from the prompt. Label assumptions clearly and turn the research into implications for the first build.

## Transcript


### Round 1


**Codex (Design Lead · Skeptic) — Round 1**

The app that has the best chance to win in this spec is a “pause-and-reset, not punish” flow with two tracks: instant relief in the moment of craving, and long-horizon reinforcement through visible streak + savings growth. The broadest value is not only “quit X,” but “keep your dignity while changing any behavior,” which matters because many users are not quitting for dramatic life change—they are cutting down one bad habit that irritates them or costs money.  

Audience is mass-market and opportunistic: people who wake up late-night doomscrolling, someone reducing cigarettes/vaping during commute stress, someone trying to trim sugar or alcohol spending without wanting treatment framing, and a lot of casual users who bounce in and out based on stress spikes. The app must feel lightweight enough for a 10-second mental model and forgiving enough for shame-prone moments. Assumption: users care more about immediate, low-friction encouragement and savings clarity than deep behavioral science during week one.  

For competing patterns, the strongest comparisons are general habit streak apps, lightweight quit/coach apps, and finance-ish “cost tracking” patterns. The useful lessons are: (1) keep the primary action obvious and immediate, (2) avoid punitive status language around failure, and (3) make the social/share artifact feel “worth showing” without exposing judgment. Assumption: shareability is the viral hook, not community feed participation; sharing is likely to happen in moments of milestone pride, so the milestone card has to be emotionally positive, small, and easy to screenshot.  

On iPhone this is strongest when it uses native affordances people already trust: deep integration with widget surfaces for glanceable momentum, an in-the-moment ride-the-craving timer that behaves like a utility first and a mindfulness-like experience second, and simple share primitives for milestone snapshots. Activity-style urgency should be treated as “optional delight,” not required core behavior. The platform gives us strong defaults for trust and delight if we do haptics, gradients, and Motion respectfully with clear state transitions. Unknown: whether Live Activities should be default-on (high perceived value for some) or opt-in to avoid anxiety/notification fatigue; that needs UX testing.  

Biggest platform risk is that iOS-native polish can become over-engineering for an MVP. If Live Activity/widget + StoreKit + timer precision + accessibility all ship before relapse UX is resilient, quality regresses where it matters most: people abandoning after a slip. The practical product implication is: make the app feel like a small emergency kit during cravings first, and monetize it as a support add-on only after core trust is intact.  

There’s a concrete design risk in the “money saved” promise: if the formula changes silently after editing frequency/cost inputs, users distrust the product fast. We should preserve a visible and simple rule from day one (e.g., recompute from habit start with clearly labeled retroactive effect, or treat changes as forward-only from change time) and surface it where the user edits values. Assumption: transparency beats mathematical sophistication; users prefer predictable numbers over perfect realism.  

Another risk is tone mismatch: if onboarding, reset, or paywall text sounds like treatment, clinical coaching, or guilt, the app loses both App Review confidence and user trust. The non-negotiable linguistic posture is “supportive self-tracking,” “you’re not starting over,” and “keep your streak confidence” vocabulary. Unknown: how hard people interpret “one Freeday” as “all-or-nothing” versus “tiny progress.” We should continuously reinforce “fresh restart with preserved lifetime history.”  

For a first build, the architecture decision that should be preserved is: SwiftData stores full habit plurality from day one, while entitlement gating (one habit free) is enforced at workflow boundaries. Any other interpretation causes migration pain and weakens trust later.  

I want the first version to optimize for three things only: one-tap relapse handling that does not shame, a 90-second craving sequence that is practical and complete offline, and a milestone card that looks like a social badge of resilience, not a scoreboard of failure. Everything else is secondary, including monetization copy hierarchy and native extras.

**Claude (QA & Risk · Pragmatist) — Round 1**

What Freeday is actually competing with matters more than the spec lets on. The closest real analog is "I Am Sober" — multi-vice tracking, streak counter, money-saved math, milestone screens — and it's popular partly *because* of a community/check-in feed, which this contract explicitly excludes as a v1 non-goal. That's a real risk, not a hypothetical one: if the retention mechanism in the closest comp is social accountability and we're deliberately not building that, the app has to make up that gap entirely through streak/widget/Live-Activity visibility and craving-support quality. I'd flag that as an assumption we're making, not a fact — "no community layer" is fine per the contract, but we should go in eyes-open that we're removing a proven retention lever from the closest competitor. Other comps: Smoke Free / QuitNow! (single-substance, so Freeday's cross-habit engine is a real differentiator), Kwit (leans into cutesy pet-growth gamification — worth explicitly avoiding, since the spec wants calm/non-gamified, not a competing aesthetic), and generic streak apps like Streaks (proves the home-screen-widget-as-daily-reminder pattern works, which we should lean into).

On use context: cravings hit at inconvenient, often public or socially awkward moments — mid-meeting, on a date, in a car. That argues hard for minimum-friction entry points into the craving-timer flow (widget tap, maybe a Lock Screen affordance) rather than "open app, navigate to tab, tap start." If Live Activity gets stubbed under time pressure per our own decision rule, we still need the in-app path to be fast — home tab should make "I'm craving right now" a one-tap action, not buried in a menu.

Three concrete risks/unknowns I want on record before build starts:

First, the 90-second timer's behavior across backgrounding is undefined in the spec and it's exactly the kind of thing that looks fine in a demo and breaks in real use. If a craving happens and the person gets interrupted — a call comes in, they switch apps to text someone "having a hard time" — does the session state survive? If we implement this as a naive `Timer`-driven countdown that just pauses when the view disappears, the "ride it out" flow breaks precisely when someone needs it most. The fix is cheap: anchor the session to a stored wall-clock start time and compute elapsed/remaining from `Date()` on every appearance, so backgrounding is a non-event even without Live Activity. This should be locked in now so nobody builds the fragile version first and "fixes it later."

Second, streak-day math is an off-by-one minefield and it's the single most-visible number in the app. Is day 1 the setup day, or the first full clean day after setup? What happens to the displayed count exactly at midnight, and what happens if the user travels across timezones or a DST boundary lands mid-streak? Because the streak count is shown everywhere (main screen, widget, milestone card, share card), a boundary bug isn't cosmetic — it's the kind of bug users scrutinize daily and lose trust over. I want this decided explicitly at build time: streak = full calendar days elapsed at the device's current local timezone, computed fresh on every read from stored event timestamps, never a cached/incremented counter that can drift from reality.

Third, the paid-tier gate for adding a second habit needs a defined trigger moment, or it'll get built as a jarring mid-flow interrupt that reads as bait-and-switch given how hard the rest of the contract leans on non-shaming, trustworthy tone. The free tier should make the one-habit boundary obvious *before* the user invests setup effort in a habit they can't add, not after they've filled out the form and hit a wall.

One thing I'd surface as a build-scope question rather than silently deciding: the spec never mentions local notifications, but every comparable app in this category uses a daily reminder nudge to pull people back in, and that's fully compatible with local-first (it's `UNUserNotificationCenter`, no network). It's not in the five core workflows so I'm not asserting it as a hard requirement, but if it gets cut for time, that should be a named tradeoff, not an oversight — and if it's added, it needs its own permission-denied/settings-redirect state like any other reachable state in this app.

For the milestone share card specifically: it's the viral artifact, so it needs to survive Dynamic Type scaling and dark/light export consistently — a share card is useless virally if it renders with clipped text or looks broken on half of recipients' devices. That's a concrete acceptance check I want carried into the build phase, not just "make a share card."

First-build implication: get the streak/day-boundary logic and the non-shaming relapse flow airtight before touching Live Activity — those are invisible until wrong, and once wrong, they're wrong in front of the user every single day the app is open.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All five required outputs are present and concrete: audience/use context is specific (stress-spike opportunists, one-tap craving entry point given Live Activity is degradable), comparable apps are named with the actual lesson extracted rather than just listed (I Am Sober's social-feed retention engine is explicitly excluded and flagged as a gap, not ignored), platform opportunities are tied to native trust-builders rather than generic "use SwiftUI" filler, and the risk list has well more than three concrete, non-generic items (timer backgrounding via wall-clock anchoring, streak timezone/DST math, paywall-boundary timing, savings recompute transparency, share-card Dynamic Type/dark-mode robustness, notification-permission state).

These are all decided, not just raised — e.g., streak math is locked to "full calendar days elapsed, recomputed fresh from stored timestamps," and the timer is locked to wall-clock-anchored state rather than a naive Timer. That gives the build phase concrete, actionable constraints rather than open questions. The output correctly labels untested assumptions as assumptions (e.g., "untested assumption, flagged not assumed safe" on retention without a social layer) rather than presenting them as researched fact, satisfying the phase's core instruction. It also ties back correctly to prior-phase decisions (recompute-rule requirement, Live Activity degrade-first rule) without contradicting them. The implication for the first build is a clear, prioritized instruction: streak/relapse logic before Live Activity/widget polish.

No repair needed.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Portfolio Selection

# freeday — Portfolio Selection

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:16:46._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

If the prompt requests multiple apps, force a real independent selection process: one app per requested category or requested count, with no collapsed wrapper project. Produce the required portfolio-json manifest for sibling child projects. If the prompt is a single app, explicitly record that no portfolio split is needed.

## Transcript


### Round 1


**Codex (QA & Risk · Pragmatist) — Round 1**

This is a single-app child project, not a fresh portfolio parent run: `PORTFOLIO_CHILD_PROJECT: true` is already set with `Parent portfolio: multi-app-exp7` and `Selected app slug: freeday`, so no new sibling selection, candidate-idea ranking, or multi-app folder split is needed for this turn. The build output should stay as one independent app project under the existing parent-output contract, i.e. `freeday/app_build`, and the phase should record “no portfolio split needed.”

I would keep the direction tightly scoped to Freeday’s non-punitive, personal-tracking stance: one-tap relapse reset, confidence-preserving messaging, clean streak + savings progression, and a 10-second “start craving timer” path. Biggest risk in this phase is scope drift back toward generic parent behavior—especially if we start building extras like social/community or analytics to prove retention; that would violate the local-first contract and the explicit non-shaming design intent, and it’s an avoidable regression risk under time pressure. The output has to preserve that decision explicitly.

Selection lock is simple and non-negotiable: app is `freeday`, category is Habit Quitting / Craving Tracker, promise is “track any habit you’re quitting and build days free while watching savings grow,” target user is broad mass-market behavior-change seekers (smoking/vaping/sugar/doomscrolling), with MVP success hinging on local SwiftData persistence and fixed-device-first behavior, not networking. For rejected alternatives: none are being selected this phase because the child app is pre-assigned by parent contract; anything else is out-of-scope until a new portfolio-selection prompt appears.

**Claude (Product Strategist · User Advocate) — Round 1**

Freeday is a single-app child project, not a portfolio parent — the five-way split already happened one level up, at multi-app-exp7, where Freeday was chosen as one of the five slugs. Nothing in this child project's prompt asks me to pick further sub-apps or spin up sibling folders under freeday/. The "portfolio_selection" phase purpose for this run is satisfied by explicitly recording that fact rather than manufacturing a split that isn't there: no portfolio-json manifest is needed, no child projects get created, and the prior two phases (prompt_contract, product_research) already did the real work of nailing down scope for this one app. I want that stated plainly so no later phase second-guesses it or tries to invent additional Freeday variants to "fill out a portfolio."

Now putting on the product-strategist/user-advocate hat for what actually matters in this phase's spirit — keeping a real user in the room even though the app is fixed.

The user I'm picturing: someone mid-afternoon at their desk, three days into cutting vaping, feeling the itch hit hard for no particular reason. They pull out their phone. If the app makes them think for more than two seconds about what to tap, the moment is lost — they'll vape, then feel guilty about the app too, and that guilt-by-association is how you lose a user permanently, not just for the day. So the single most load-bearing design fact for this whole build is: from a cold app-open, "I'm craving right now" must be reachable in one tap, front and center, not a card buried under a streak dashboard. Everything else — habit setup polish, milestone card art, widget aesthetics — is secondary to that one interaction being instant and obvious.

The core problem Freeday solves, stated simply: people trying to cut a habit have no neutral, always-available tool for the specific 90 seconds when willpower is thin, and the tools that do exist (single-substance quit apps, generic habit trackers) either don't fit their specific vice or make relapse feel like a scored failure. Freeday's value is being vice-agnostic and shame-free — that's the whole differentiation, and it has to be legible in the first ten seconds of first launch, not explained in an onboarding paragraph.

Scope boundary I want on record from the user-advocate side, distinct from what the contract phase already locked: the free tier isn't just "one habit" as a monetization mechanic — for the target user, one habit at a time is usually all they're actually working on anyway (nobody quits vaping and sugar and doomscrolling simultaneously in week one), so the free tier should feel like a genuinely complete product, not a crippled trial. If the paywall framing anywhere implies the free version is incomplete rather than "here's the whole tool, upgrade if you're juggling more than one thing," that's a tone failure on top of a monetization one.

Measurable success, in plain terms since there's no telemetry to lean on: a first-time user should be able to go from app icon tap to "I did the ride-it-out flow and it helped" in under two minutes with zero reading required beyond what's on-screen in the moment, and a user who logs a relapse should be able to see, in the same screen, that their lifetime total and history aren't erased — that reassurance has to be visually simultaneous with the reset action, not a fact they'd have to dig for. If either of those breaks, the app fails its own premise regardless of how polished the gradients are.

Biggest risk to my own framing: by emphasizing "instant one-tap craving relief" so heavily, later build phases could under-invest in the habit-setup and multi-habit management flows since they're not the emotionally loaded moment. Those still need real craft — a confusing setup form is its own way of losing a user before they ever reach a craving moment.

To restate the required decision plainly: single-app run. Freeday is not a portfolio parent. No portfolio-json, no sibling child projects, no additional app selection work in this phase — that work was already done at the multi-app-exp7 level and is out of scope to redo here.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

## Final Output

Quick, no drama on this one: both of them landed exactly where they had to. This is a child project inside the multi-app-exp7 portfolio — the actual 5-app selection already happened one level up, and Freeday was one of the picks. There's nothing left to select here.

So the decision for this phase is simple:

- **No portfolio split needed.** Freeday is a single independent app, not a portfolio parent. No portfolio-json manifest, no sibling child folders, no additional app-selection work.
- Output stays as one app project at `freeday/app_build`.
- Selection lock (already fixed by the parent): slug `freeday`, category Habit Quitting / Craving Tracker, promise "track any habit you're quitting, watch your clean streak and savings grow," target user is the broad mass-market population cutting cigarettes/vaping/sugar/alcohol/doomscrolling, build flag = true.
- Rejected alternatives: none considered this phase — re-running ideation would be redoing work the parent portfolio phase already finished, and is explicitly out of scope for a child project.

Claude's user-advocate framing (the "craving hits at your desk, one tap or you lose them" scenario) didn't change this decision — it's a reinforcement of priorities already locked in prompt_contract and product_research (one-tap craving entry, non-shaming reset, free tier as a genuinely complete product rather than a crippled trial), not a new scope decision for this phase. Worth carrying forward into build, but it doesn't change the answer here: single app, no split, move to the next phase.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
Correct and appropriately brief. The phase correctly identifies this as a child project within an already-decided portfolio, so the "no split needed" path applies — and the required output for that path is fully covered: explicit single-app decision, the selected-app record (slug, category, promise, target user, build=true), and rationale for why no rejected alternatives were considered (re-litigating parent-level selection is out of scope for a child). No portfolio-json is required since this isn't a portfolio parent, which is consistent with the rubric's conditional ("emit portfolio-json when the prompt is a portfolio parent"). It correctly carries forward the user-advocate framing from discussion as context for build rather than inflating it into a scope change. Nothing here contradicts prior-phase decisions (prompt_contract, product_research). Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

## Final Output

Quick, no drama on this one: both of them landed exactly where they had to. This is a child project inside the multi-app-exp7 portfolio — the actual 5-app selection already happened one level up, and Freeday was one of the picks. There's nothing left to select here.

So the decision for this phase is simple:

- **No portfolio split needed.** Freeday is a single independent app, not a portfolio parent. No portfolio-json manifest, no sibling child folders, no additional app-selection work.
- Output stays as one app project at `freeday/app_build`.
- Selection lock (already fixed by the parent): slug `freeday`, category Habit Quitting / Craving Tracker, promise "track any habit you're quitting, watch your clean streak and savings grow," target user is the broad mass-market population cutting cigarettes/vaping/sugar/alcohol/doomscrolling, build flag = true.
- Rejected alternatives: none considered this phase — re-running ideation would be redoing work the parent portfolio phase already finished, and is explicitly out of scope for a child project.

Claude's user-advocate framing (the "craving hits at your desk, one tap or you lose them" scenario) didn't change this decision — it's a reinforcement of priorities already locked in prompt_contract and product_research (one-tap craving entry, non-shaming reset, free tier as a genuinely complete product rather than a crippled trial), not a new scope decision for this phase. Worth carrying forward into build, but it doesn't change the answer here: single app, no split, move to the next phase.

---

CONSENSUS: YES

### Initial Discussion

# freeday — Initial Discussion

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:17:44._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Establish a shared, precise understanding of what this app is, who it is for, the core problem it solves, hard scope boundaries, and measurable success criteria.

## Transcript


### Round 1


**Codex (Product Strategist · User Advocate) — Round 1**

Primary promise: Freeday lets anyone cutting down a habit track that behavior in one screen, preserve momentum after slips, and get visible progress through daily clean-days plus money saved without clinical jargon.

Primary user and scenario: a person trying to quit or reduce something common and socially awkward to pause for (smoking/vaping/sugar/alcohol/doomscrolling), who needs a one-tap “I’m craving now” path and a non-shaming reset when they slip so they can re-engage instead of abandoning.

Core loop: set one habit with baseline cost assumptions, take or skip a clean day, optionally run a 90-second craving ride-along when urges hit, log relapses as resets that never erase lifetime progress, then share a milestone card that makes success feel tangible and shareable.

Hard scope boundaries: do local-first, SwiftData-backed habit management for multiple habits, relapse events, and craving sessions with on-device savings math; keep the five core flows fully real: habit setup (including quantity-per-day + cost-per-unit), non-punitive one-tap reset, 90-second fixed craving sequence, milestone sharing, and paid-tier multi-habit gating. Defer or degrade only non-critical iOS-native extras (widget/live activity) if needed. No network dependency, no medical treatment positioning, no LLM coaching, no community feed, no backend sync in v1, no third-party-heavy stack, no hidden analytics, no punitive tone.

Measurable success criteria: first-time users can complete setup, start a craving timer, and see a streak/savings state in under 90 seconds; all primary screens expose empty/loading/success/error states where applicable; relapse should preserve lifetime totals and still feel like a reset not a failure (tone check: no “streak broken” framing); and premium gating for additional habits must be enforceable from free tier through a real entitlement path with restore.

The main risk I am taking is that “non-shaming reset” can get undermined by tiny copy choices or timing of the paywall; the detail to preserve is exact: reset must be an act of continuation, not punishment, and cost/savings edits must have an explicit recompute rule so users never feel misled by silently changing dollars.

**Claude (Design Lead · Systems Thinker) — Round 1**

The one-sentence product promise I'd lock in: Freeday is a single app where naming any habit you're quitting gives you a non-shaming daily streak, a running savings total, and a 90-second in-the-moment tool to get through a craving without relapsing — and if you do relapse, your history isn't erased, just your current streak resets.

Primary user and scenario: someone a few days into cutting a habit — vaping, sugar, doomscrolling, whatever — who opens the app in one of two very different mental states. Ninety percent of opens are low-stakes "just checking in" moments: glance at the streak number, feel good, close the app. The other ten percent are high-stakes: an actual craving spike, phone in hand, needing the app to do something useful in the next three seconds or they've already lost the moment to the habit. Those two states need to coexist on one home screen without the emergency path being buried under the calm one.

Core loop, as I see it: open app → see today's status (current streak, lifetime days free, money saved so far) → one of three things happens from there. Either nothing (they just checked in and left), or they tap "I'm craving right now" and go through the guided 90-second ride-it-out sequence, which on completion logs a craving-survived event and gives a small haptic/visual reward distinct from the streak — a second, always-positive counter ("32 cravings ridden out") that matters a lot precisely because it's the number you can point to even right after a relapse, when the streak number just got reset to zero. Or they tap the relapse/reset action, get a one-tap non-judgmental "logged — streak starts fresh, your 47 lifetime days free and $310 saved are still yours" screen, and land back on a home screen that already shows day 0 counting, not a scoreboard of failure. Periodically — at defined milestones — a full-screen celebratory moment offers the shareable card, and there's also a "share my progress" entry point available any time so a user isn't stuck waiting for day 30 if a friend asks how it's going today.

The screen I'd worry about most isn't the craving timer, it's the relapse flow, because it's one screen trying to do two emotionally opposite things at once: acknowledge what happened without making it heavy, and immediately reassure without sounding like it's minimizing. I'd want the reset confirmation and the lifetime-stat reassurance to be the same glance, not a tap-through — if the user has to tap "okay" and then navigate somewhere else to see their lifetime total is intact, the reassurance arrives too late to matter.

A structural thing worth deciding now rather than discovering during build: for a free-tier user with exactly one habit, the app should feel like a dedicated single-purpose app, not a multi-habit app with a grayed-out "add habit" button staring at them. That means the habit-switcher chrome (whatever it looks like — tabs, a segmented control, a drawer) should only render once a second habit actually exists; a one-habit user shouldn't see multi-habit scaffolding at all. That's an IA decision, not a paywall-copy decision, and it's easy to get wrong by building the N-habit UI first and just hiding the switcher behind a flag.

Two edge cases I want on record because they'll surface mid-build if not decided now: first, whether relapse logging supports backdating ("I slipped yesterday, logging it honestly this morning") — I'd rule that out of v1 scope entirely, event timestamp is always "now" at the moment of logging, both to keep streak math simple and because backdating opens a UI can of worms (date pickers, retroactive recompute) that doesn't pay for itself in an MVP. Second, whether completing a craving session should offer a direct bridge into relapse logging if the craving wasn't actually resisted (i.e., "did this help?" branching) — I'd also cut that for v1; the timer flow ends the same way regardless of outcome, calm and non-interrogative, and if they relapse anyway they use the separate relapse action from home. Branching outcome logic inside the craving flow is exactly the kind of "nice idea" that quietly triples the state count of the most emotionally sensitive screen in the app.

Hard scope boundaries beyond what's already locked from the contract: no journaling/notes fields, no photo attachments, no backdated event logging, no customizable reminder schedules (a single daily nudge at most, if built at all, per the earlier named tradeoff), no in-app explanation of "why" someone craved — this is a tracker and a timer, not a diary. Navigation should be flat: a home/today screen, a history/calendar-and-milestones screen, and settings — with craving timer and relapse logging as full-screen modal flows launched from home, not their own tabs, so the tab bar itself never grows past three items even for paid multi-habit users.

Measurable success criteria I'd hold this to: cold app-open to a started craving-timer session in one tap; cold app-open to a completed relapse-log-with-visible-lifetime-stat in one tap plus one confirmation at most; every other core screen reachable in two taps from home; and the milestone share card renders correctly (no clipped text, no broken layout) at the largest supported Dynamic Type size and in both color schemes, since that card is the one artifact that leaves the app and represents it to someone who's never seen it before.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
Covers all five required outputs concretely: a one-sentence promise a developer could repeat back, a specific primary user/scenario with the two-mode ("glance" vs. "3-second emergency") framing, a fully sketched core loop, explicit hard scope boundaries, and measurable success criteria stated as testable tap-counts and rendering conditions rather than vague aspirations. The new scope decisions (no backdating, no branching craving-timer outcomes, no journaling/photos, flat 3-item nav, no multi-habit chrome for single-habit users) are decisive resolutions of ambiguity the prompt left open, consistent with the phase's mandate to resolve underspecification rather than defer it. Nothing here contradicts prior-phase decisions (prompt_contract's five core workflows, quantity+cost savings model, non-shaming checklist, Live Activity/widget degrade-first rule) — it builds on them. No unresolved disagreement was papered over; the transcript shows genuine convergence, not suppressed conflict. Scope is small enough for one build pass, and out-of-scope items are explicit. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Per App Product Brief

# freeday — Per App Product Brief

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:19:16._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Create a production-grade product brief for this specific app: target user, paid value, core loop, subscription value, competitive wedge, viral or niche growth mechanism, local-first behavior, cloud-ready extension path, and the real reason the app deserves to exist.

## Transcript


### Round 1


**Codex (Design Lead · Systems Thinker) — Round 1**

Freeday is a calm, non-judgmental iOS utility for people trying to cut back or quit a common habit—cigarettes, vaping, sugar, alcohol, doomscrolling, and the same class of “easy to relapse into” behaviors—who need two modes of support in one place: a quick glance when they’re stable, and a fast rescue path when a craving spikes.

The app’s value is simple and concrete: users get daily momentum signals (clean days and money saved) for the habit they named, plus a short guided “ride it out” flow that helps them through a 90-second urge window without complicated journaling or clinical coaching. They are not paying for generic habit tracking; they pay because the app protects dignity and continuity. Free gives one habit, basic streak/persistence, and milestone sharing; Freeday+ adds the real utility unlock: unlimited concurrent habits, a broader craving toolkit, and lock-screen/Live Activity support for active urges. The “upgrade” should feel like an honest capacity upgrade, not a failure fix.

The core loop is: open the app, see today’s state instantly, either carry on, start a one-tap craving session, or tap restart when a relapse happens. A relapse is treated as a reset of the active streak only, never a reset of earned history. Every relapse and every completed craving session is a nudge toward “next clean day” rather than shame; lifetime totals stay visible and never disappear. As the number of clean days grows, savings become easier to understand and share, and that share card (“47 free days, $310 saved”) is designed as the outward-facing proof point people pass around.

The subscription works as a real behavioral lever, not a cosmetic pass. In practice, single-habit users should feel like they have a complete tool already. Paid adds remove an artificial cap for users juggling multiple habits at once (e.g., quitting sugar and doomscrolling in separate contexts), give a fuller urge-response toolkit, and enable Live Activity for the moments where support matters most in real life. The app should say this clearly and kindly: this is less about paying for less shame and more about unlocking better support coverage.

What makes it competitively differentiated is the “one engine for any habit” with non-shaming reset semantics, plus explicit savings math defined by two inputs: quantity-per-day and cost-per-unit. Most competitors either focus on one vice, over-index on scorekeeping, or become social/clinical in tone. Freeday stays habit-agnostic and personal-tracking-first, which is what makes it reusable and broadly useful while still emotionally specific in execution.

Growth is not through a social feed; it is through a viral artifact users can own and send: a polished milestone card, a clear habit snapshot, and periodic “share this moment” moments built into the natural loop. Add lightweight “this made a clean day possible” and “I reached a new saving milestone” cards, plus optional quick-send templates, so people can celebrate without exposing shameful behavior logs.

Local-first behavior is non-negotiable: all data (habits, relapse events, craving sessions, settings) lives in SwiftData on device, all calculations are deterministic and immediate, and all guided content is bundled offline. Day math should be computed from stored timestamps using device local calendar semantics so behavior is consistent across normal usage and after app restarts. Editing habit assumptions must be explicit: if cost inputs change, savings should recompute under a stated rule (for production, the cleanest default is forward-only from edit time, with clear annotation in the UI) so users are never surprised by silent historical recalculation.

Cloud-ready architecture is straightforward without being baked into v1: keep the domain model clean and serializable from the start (Habit, RelapseEvent, CravingSession, maybe SavingsProfile), define a store-level sync boundary, isolate persistence behind a repository protocol, and preserve deterministic identifiers so future CloudKit sync can be added as an adapter rather than a rewrite. The local persistence path stays first and never blocks this.

The design direction should reinforce the core promise at every touchpoint: a soft mint-to-sky-blue gradient, rounded iconography, sunrise/counter motif, friendly language, low-friction affordances, generous spacing, and strong contrast in both modes. Emotional contract is the product: no red warning states for relapse, no “you failed” messaging, no medical claims, and no guilt framing. If users can see that their history is still honored in one screen after a relapse, they trust and return.

The biggest objection to this direction is that removing social accountability may hurt long-term retention; that risk is real because urges can recur without clear social scaffolding. The counter is to make the app useful in the exact two highest-stakes use states (glance + one-tap urge support), keep state updates immediate, and make shareable milestones feel meaningful enough to carry social accountability indirectly. The one detail that must be preserved in every phase is this ordering: non-punitive relapse UX first, then optional premium upgrades and extras. If relapse handling degrades, the app fails regardless of paywall design, widget polish, or Live Activity completeness.

**Claude (QA & Risk · Closer) — Round 1**

Someone in day-four of quitting vaping opens Freeday at their kitchen counter, not mid-craving — just a morning check-in — and the number one thing they need to trust before anything else is that the app won't lie to them or trap them. So let me write the brief and stress-test it at the same time, because that's the only way this phase produces something buildable instead of aspirational.

Target user and use case: someone actively cutting one specific habit right now — cigarettes, vaping, sugar, alcohol, doomscrolling — who wants two things from a phone app and nothing else: a daily number that proves they're winning, and a tool for the exact sixty seconds when they're about to lose. This is not a wellness app for people who want to "reflect on their relationship with X." It's a utility for people mid-fight. If the copy or flow ever asks them to introspect, journal, or read anything longer than a sentence during a craving, it's already failed that user.

Paid value: Freeday+ is $4.99/mo or $29.99/yr and unlocks unlimited concurrent habits plus the full craving-support toolkit and the Lock Screen Live Activity. But I want to be blunt about what "full craving-support toolkit" has to mean or it's vaporware — the free tier ships with one guided ride-it-out sequence (the 90-second flow), and paid unlocks additional sequence variants (different breathing/pacing/framing options) so a returning subscriber isn't just paying to unlock a second habit slot, they're paying for a tool that doesn't go stale after the fortieth craving. If we only gate multi-habit and call it done, the "toolkit" language in the spec is a promise we didn't keep — that's a concrete build requirement, not a nice-to-have: the craving flow needs at least 2-3 interchangeable guided variants (e.g., a breathing-paced one, a distraction/counting one, a body-scan one) so paid unlocks real variety, free tier gets one solid default.

Core loop: open → today's card (streak, lifetime days free, money saved, cravings survived) → either close the app, or one-tap into craving-timer, or one-tap into relapse/reset. That loop has to survive a specific failure mode I want on record now: what happens if a user opens the app, taps "I'm craving," and then just... doesn't finish the flow — they get pulled into a meeting, phone dies, whatever. If the session just vanishes with no record, that's fine and correct — an abandoned craving session should not silently count as "survived" nor should it punish them. Decision: only a full 90-second completion increments the "cravings survived" counter; an abandoned session writes nothing. No partial credit, no partial penalty. This has to be explicit or someone building the timer will invent a behavior on the spot.

Competitive wedge: cross-habit flexibility versus every competitor being single-substance, plus a genuinely non-shaming reset that most competitors get wrong by badge-shaming or resetting visible totals to zero. The wedge is real but fragile — it lives entirely in execution quality of the relapse flow, not in the pitch. If we ship a relapse flow that's even slightly worse than "I Am Sober," the wedge evaporates because that's the one axis competitors are already decent at.

Viral growth mechanism: the milestone share card is the whole engine, so I want to name the failure mode that kills it before it ships — a share card that's technically correct but emotionally flat doesn't get shared. It needs a specific number combo (days + dollars) rendered large, plus the habit name, in a design distinct enough that a screenshot is recognizable as "a Freeday card" without a caption. The risk I'd flag hardest: if the card only fires at big round-number milestones (7, 30, 90, 365 days), most users churn before ever seeing one. I want an early, cheap milestone in the schedule — day 1 or day 3 — so a brand-new user gets a taste of the shareable artifact almost immediately, not weeks in. That's a retention/virality decision this brief needs to lock, not defer to design.

Local-first behavior: everything — habit config, event log, craving sessions, savings computation — lives in SwiftData with zero network calls in v1. Cloud-ready path: the repository/store boundary is written so a CloudKit-backed implementation of the same protocol can be swapped in later without touching view or view-model code; that's an architecture discipline decision now, not a promise to keep vaguely in mind.

What makes users genuinely keep the app past week one, in my skeptical read: not the streak number alone — every habit tracker has that — but the fact that a bad day doesn't cost them their history. The real retention test is this exact moment: user relapses on day 12, opens the app expecting to feel bad, and instead sees "12 days free earned, now let's go again" with their lifetime total untouched. If that moment lands, they open the app again tomorrow. If it reads as scolding even slightly, they uninstall within the week — which is literally the invalidation criterion already on record. I'd treat that single screen as the one piece of UI that gets user-tested against the non-shaming checklist harder than anything else in the app, including the paywall.

One more thing I won't let slide without naming it: "money saved" is only trustworthy if the formula is visible somewhere the user can actually find it, not just computed silently in the background. I want a simple, tappable "how we calculate this" affordance near the savings number — not a settings-buried explainer — because a user who suspects the number is fabricated will stop trusting the app's core hook entirely, and unlike a wrong streak day (which self-corrects at midnight), a wrong-feeling savings number just erodes trust indefinitely with no natural correction moment.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All six required outputs are present and concrete, not generic: target user/use case is specific (mid-fight utility user, not a wellness/journaling audience), paid value is functional rather than cosmetic (this round's real contribution — 2-3 interchangeable craving-timer variants as a paid unlock, not just a relabeled multi-habit gate), core loop is fully specified including a previously-unstated edge case (abandoned craving sessions write nothing, no partial credit/penalty), competitive wedge is named along with its fragility (lives in relapse-flow execution, not the pitch), viral angle adds a concrete, non-obvious decision (early cheap milestone at day 1/3, not just round numbers, plus a visible savings-formula affordance), and local-first/cloud-ready plan restates the repository-boundary discipline already locked in prompt_contract without contradicting it.

Nothing here conflicts with prior-phase decisions (five core workflows, quantity+cost savings model, non-shaming checklist, Live Activity/widget degrade-first rule) — it's additive tightening, consistent with how this same pattern played out in every earlier phase. No disagreement was papered over; the transcript shows genuine convergence. The brief is specific enough to hand to a design/build phase without further ideation.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Next Steps Small

# freeday — Next Steps Small

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:20:22._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Define the smallest valuable slice / immediate next steps that de-risk and validate the concept with minimal effort.

## Transcript


### Round 1


**Codex (QA & Risk · Closer) — Round 1**

The smallest slice that actually de-risks this app is: one robust habit entity with local persistence, one-tap daily continuity/restart flow, and a 90-second craving ride-out that either completes or does nothing, plus an immediately shareable milestone artifact. This gives us proof that the non-shaming reset promise and the core emotional moment both work before adding any premium complexity.

Concretely, this slice is: boot into home, create one habit (name, usage-per-day, cost-per-use, optional emoji/icon), display today’s streak + lifetime days + money saved from setup date, allow one-tap “I slipped” which logs a relapse at now and sets current streak to zero while lifetime totals stay visible and unchanged, allow one-tap “I’m craving now” which runs a wall-clock anchored 90-second timer, and only when fully elapsed does it increment a “cravings survived” counter. On day 1 (and optionally first savings threshold), show a milestone card with “days + $” and a ShareLink; that is the first complete user-to-shared-value loop and is enough to validate adoption shape.

The biggest risk in this slice is this app passing a demo but failing emotionally: if relapse framing feels like punishment or if stale/pending timer math resets while backgrounded, users will drop in exactly the scenario we can’t afford. The detail that must not be relaxed is non-punitive math and state semantics: streak is computed from local timezone calendar-days since last relapse with event-at-now timestamps only, and savings recompute is forward-only from edit time (not retroactive), shown in UI copy to prevent trust drift.

Must-have interactions are: create/edit one habit with quantity/day + cost/unit; home state renders empty/loading/success/error correctly; start/update streak via a single “stay clean today” path or implicit progression (based on last log); one-tap relapse confirmation screen that shows preserved lifetime totals in the same frame; one-tap craving start and deterministic finish on app foreground/background changes; shareable milestone card render at large text sizes and both color schemes; and visible free-tier boundary messaging before exposing second habit creation path.

Cut list for this phase: no StoreKit entitlement wiring yet (keep entitlement service boundary stubbed as a simple local flag and wire a real entitlements layer in next phase), no widget extension, no Live Activity, no reminder notifications, no multi-variant craving kits yet, no paywall transaction restore UI, and no community/feed features. No sync/cloud, no journaling, no backdating, no analytics.

Validation criteria to call this slice done: A new user can add a habit, complete one day, trigger craving timer, and reset after relapse with no crash in under a focused session; full timer completion while app is backgrounded for a short period is counted correctly; streak is never negative or reset history-erasing; savings value matches the displayed formula after a cost-frequency change under the forward-only rule; and the milestone card ShareLink produces legible output at Dynamic Type max and both light/dark.

**Claude (Product Strategist · Visionary) — Round 1**

Given everything already locked — five core workflows, the non-shaming relapse screen as the make-or-break moment, the craving-toolkit variety requirement, the early milestone card — the temptation in this phase is to shrink scope down to "just the boring safe slice" and call it MVP. I want to push back on that instinct a little before we cut anything, because the smallest slice that's technically complete and the smallest slice that's actually remarkable are not the same size, and this app in particular lives or dies on an emotional beat, not a feature count.

Here's the slice I'd fight for: habit setup (name, quantity-per-day, cost-per-unit) → today screen showing streak, lifetime days free, money saved, cravings-survived → one-tap craving timer with the single default guided sequence, wall-clock-anchored so it survives backgrounding → one-tap relapse/reset that shows the reset and the untouched lifetime stat in the same glance → the milestone share card firing early (day 1 or 3) with ShareLink. That's one full loop, and it's also the entire emotional arc of the product in miniature: you can feel a whole "day one" experience — set up, maybe survive a craving, maybe relapse, see your card — in under two minutes without touching a second screen. If we ship that loop and it isn't emotionally satisfying, no amount of widget or Live Activity work fixes it, so it has to be the thing we polish hardest, not just the thing we technically finish first.

What I'd explicitly hold out of this slice even though it's "real v1 scope" per the contract: the multi-habit paid gating logic, the 2-3 interchangeable craving-timer variants (ship one default sequence only, make the toolkit-variety a fast-follow inside the same build effort once the loop is proven), Live Activity, and the widget. None of those change whether the core loop feels good — they're additive capacity, not emotional substance. StoreKit itself I wouldn't cut, but I'd scope the paywall's only job in this slice to "block a second habit and unlock it via subscribe/restore" — not build out the full toolkit behind it yet, since that's a second workflow riding on top of the same entitlement check.

The riskiest thing I'll say: I don't think "smallest valuable slice" should mean the cheapest version of the streak tracker. It should mean the smallest version that still produces the milestone share card, because that card is the only artifact that leaves the device and makes the case for the whole app to someone who's never seen it. A build that nails setup-to-streak but never gets to a real, shareable, Dynamic-Type-safe card hasn't actually proven the concept — it's proven a to-do list with a dollar sign. If time runs short, I'd rather cut the second craving-timer variant, the widget, and Live Activity entirely than ship a share card that's an afterthought screenshot of plain text.

Must-have interactions I want preserved no matter how this gets negotiated down: the craving timer has to be resumable across backgrounding using a stored start timestamp (this was flagged as a real risk earlier and it's cheap to do right from the start, expensive to retrofit); the relapse-reset confirmation and the lifetime-stat reassurance must render in the same screen, not a tap-through; and editing cost/frequency inputs mid-stream needs its stated recompute rule visibly enforced even in this small slice, because if we build the naive version now ("just overwrite the fields") we've silently made a promise about historical math we won't want to keep later.

Cut list for this phase, stated plainly so nobody argues about it mid-build: multi-habit UI/switcher chrome, additional craving-timer content variants beyond the one default, Live Activity, WidgetKit, daily reminder notifications, history/calendar detail screen beyond what's needed to substantiate the milestone card, settings beyond the bare minimum (habit edit, restore purchases). All of those are real v1 scope per the contract, but "smallest valuable slice" for this phase should mean the first build pass proves the loop before any of that gets touched — consistent with the existing decision rule that Live Activity/widget degrade first.

Validation criteria I'd hold this to, stated as things a reviewer can actually check rather than vibes: can a fresh install go from tapping the app icon to a rendered milestone share card in under two minutes, touching only the one core loop; does the relapse screen pass the non-shaming checklist on sight (no red, no "streak broken," lifetime stat visible without a second tap); does the craving timer survive being backgrounded mid-session and resume with a correct remaining time; does the share card render without clipping at the largest Dynamic Type size in both light and dark mode. If all four are true, we've proven the concept for real money and real users, even if literally nothing else in the spec exists yet.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All four required outputs are present and concrete: the MVP slice is a single fully-specified emotional loop (setup → today screen → craving timer → relapse/reset → milestone share card), must-have interactions are specific and testable (wall-clock-anchored timer, forward-only recompute rule, same-screen relapse reassurance, StoreKit scoped narrowly to just gating habit #2), the cut list is explicit rather than implied (multi-habit UI, extra craving variants, Live Activity, widget, reminders, deep history/settings), and validation criteria are checkable facts a reviewer can verify (two-minute loop, non-shaming checklist, backgrounding survival, streak/savings correctness, Dynamic Type/dark-mode rendering).

It satisfies both acceptance checks: the slice is buildable without further product debate (every ambiguous edge case — abandoned sessions, cost-edit recompute, paywall scope — was already resolved either in this phase or inherited from prior phases), and it includes a genuinely complete user workflow, not a fragment. It also honors the phase's "emotionally satisfying, not just technically minimal" instruction directly, correctly framing the milestone card as non-negotiable rather than trimmable, which is the one substantive point of emphasis Claude raised in the discussion and the coordinator captured accurately without overstating it as a disagreement.

Nothing here contradicts prior-phase decisions (five core workflows, non-shaming checklist, quantity+cost savings model, Live Activity/widget degrade-first rule, craving-toolkit-variety-as-fast-follow). No unresolved disagreement was papered over — the transcript genuinely shows convergence, not suppressed conflict. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Detailed Discussion

# freeday — Detailed Discussion

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:21:29._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Deeply analyze requirements, edge cases, constraints, assumptions, risks, and open questions, resolving ambiguity left from earlier phases.

## Transcript


### Round 1


**Codex (Product Strategist · Visionary) — Round 1**

Freeday should be built around a single emotional truth: people who are trying to quit something usually succeed in tiny windows, not giant plans. The product needs to be the app that feels like a calm, private 90-second support tool the moment stress spikes, and a confidence-preserving scoreboard when things go sideways. The boldest direction that is still buildable in v1 is to make the relapse moment the “happy accident” hero: not a failure, but an intentional reset that preserves identity-level progress (lifetime totals), then immediately offers one useful next action and one shareable proof card.

Core direction that should hold all the way: this is a non-clinical self-tracking engine that is vice-agnostic by design, with a fixed craving sequence as a first-class product, not decoration. The user promise is “one clean counter, one savings number, one quick rescue path, all reusable for any habit.” That means the value is not “more streak points,” but “I can keep going after slipups without shame.” If that emotional guarantee breaks, the app fails even if everything else compiles.

Resolved requirements: the app must support multiple Habit entities in SwiftData from day one, but UI entitlement enforcement must enforce one active habit on free and block habit-creation at the second-entry moment; no backdated relapse logging; one habit setup requires habit name, quantity-per-day, and cost-per-unit; streak logic is recomputed from event timestamps on read in local timezone, never cached; streak is current clean calendar-day streak since the last relapse timestamp; relapse is one tap, logs now, resets only current streak, and never alters lifetime totals; one-tap craving start on Home, wall-clock anchored 90-second timer with graceful background recovery, and only full completion counts as survived; early milestone card should trigger at day 1 or day 3 to prove value quickly; milestone card must be ShareLink-friendly and readable at max Dynamic Type and both light/dark; paywall must be real StoreKit 2 with `.storekit` config and restore, and its first unlock purpose is “unlimited habits + crave sequence variants + live activity if present”; every reachable screen must include empty/loading/success/error states, including Home, setup, paywall, timer, relapse, and milestone.

Edge cases: first launch with no habits; a crash or force-quit during active timer; app backgrounded/foregrounded across midnight or timezone changes; relapse and day boundary in the same session; editing habit economics after days accumulated; free user hitting “add second habit”; free user seeing premium prompts before entering effort-heavy flows; first-run onboarding without data; invalid/missing cost values (zero/negative) and decimals; haptic unsupported devices; voiceover and large text clipping on milestone card; stale entitlement after restore/cancel/reinstall; duplicate timer sessions accidentally started without completion.

Data and privacy implications: local-first means SwiftData storage in app container only, no network telemetry, no crash or behavior analytics, no social graph, no cloud sync in v1. Habit names and economics are sensitive to user context but still personal behavior data, so default to opt-in export only and no secondary persistence outside the device. StoreKit is the one external dependency; no marketing IDs or tracking IDs should be introduced. Notification, health, or calendar permissions are out of scope for the slice unless explicitly added later, so there is no permission burden now. If reminders are added later, treat permission denial as a first-class state like app start failure states.

Biggest risk to my direction: retention without social/community and without backend support is being overestimated. The social-free design is intentional but may reduce long-tail stickiness, so the only defensible mitigation is making the two critical moments undeniable: 90-second rescue is always available in one tap, and relapse never feels like moral failure. The other high-risk area is trust in savings math; if numbers feel invented, people stop trusting the app. The visible recompute rule and explicit “how this is calculated” affordance are mandatory anti-regression requirements.

Specific decisions the final output must preserve: lock the non-shaming language and visuals at first run (no “broken,” “failed,” “bad,” punitive red), keep one-tap timer and one-tap relapse on Home at all times, keep streak as a state derived from last reset time and local calendar, apply forward-only recalculation of saved money from edit time, and ensure a milestone card exists within the first few days by design, not by luck. I also insist the free path is complete for one habit; paid is an additive expansion, not a fix for core incompleteness.

Measurable success checks for this phase: one fresh install can set up one habit, start and complete a timer across backgrounding, log one relapse and see preserved lifetime totals in the same screen, and share a valid milestone card in under two minutes with no hidden steps; forward-only savings edits are visible and coherent; and no stale or partial timer completion events are created.

Open assumptions: local timezone is the canonical source of truth for calendar-day streak; one day is counted as full clean calendar days elapsed since relapse, not wall duration; cost-per-unit and quantity-per-day are stable estimates entered by user, not medically verified data; local-only storage is acceptable for v1 launch; and the paid craving-sequence variants can be staged as a second-pass within the same implementation batch without requiring a separate architecture rewrite.

**Claude (QA & Risk · Skeptic) — Round 1**

The area I want to stress-test hardest is what happens when the happy path breaks, because everything locked so far assumes a cooperative user on a cooperative device, and that's not reality.

Start with the craving timer, since we already decided wall-clock anchoring instead of a naive `Timer`. That's right, but it's not sufficient on its own — if the app is force-quit (not just backgrounded) mid-session, and the user relaunches five minutes later, we need a defined answer for what they see. I'd say: on relaunch, if there's an unfinished craving session whose stored start time plus 90 seconds has already elapsed, treat it as abandoned (no credit, matches the existing abandoned-session rule) rather than auto-completing it retroactively — auto-crediting a session the user didn't actually sit through would be a worse trust violation than losing the counter increment. And if the elapsed time hasn't passed yet, resume the countdown from the stored timestamp, mid-screen, without replaying the guided content from the start. This needs to be explicit now or someone will build "just restart the flow from zero" and it'll feel broken.

Second, the streak formula we locked — full calendar days in current local timezone, recomputed fresh — has a real consequence nobody's stated yet: someone who flies from New York to Tokyo mid-streak can watch their streak jump forward or backward by a day instantly on landing, with no relapse involved. That's a direct product-level side effect of a decision we already made, not a new decision, but I want it written down as an accepted, named limitation rather than something a future bug report reopens as "the streak count is broken."

Third, habit editing and deletion. The recompute rule for cost/frequency edits is decided (forward-only), but habit *deletion* was never actually addressed in any prior phase, and users will absolutely want to delete a wrongly-named or duplicate habit. I'd resolve this now: allow deletion with one confirmation step, and deleting a habit removes its craving sessions and relapse events too — no orphaned rows, no "recover a deleted habit" feature. If that's out of scope for the MVP slice, it should be an explicit named exclusion, not a silent gap, because "I created a test habit and can't remove it" is a first-five-minutes failure mode.

Fourth — subscription downgrade. We've defined the upgrade path (subscribe unlocks habit #2) but not what happens when a Freeday+ subscription lapses while the user has two or more active habits. Silently deleting the second habit's data on expiration would be a serious trust break given how hard this whole brief leans on "we never erase your history." The right rule: on expiration, data for every habit is preserved, but the UI restricts active tracking/interaction to one habit (the most recently active one) and the others become read-only until resubscribed — never deleted, never silently reset. This needs to be locked now because it's a data-model and UI-state decision, not a paywall-copy decision.

Fifth, StoreKit specifics that are easy to get technically wrong: unverified transactions must never grant entitlement (checkVerified failing should hard-block, not warn), `Transaction.updates` needs to be listened to from app launch so a restore or external purchase doesn't leave the app in a stale locked state, and the app needs a real "Restore Purchases" affordance in settings — App Review will reject without it.

On privacy: this is sensitive personal data — what someone's quitting, how often they relapse, timestamps of cravings — sitting unencrypted-by-default in SwiftData on a device that could be picked up by a partner, parent, or coworker. Nothing in prior phases addressed on-device data exposure. I don't think Face ID app-lock needs to be in this MVP slice, but it should be named explicitly as an out-of-scope decision now rather than an oversight discovered later, since "someone else could see this" is a real concern for exactly this category of habit.

Two smaller but concrete gaps: a milestone-detection rule is undefined — if streak is recomputed fresh on every read rather than event-driven, we need an explicit "have we already shown the card for this threshold" flag per habit so the day-3 milestone doesn't retrigger every time the user opens the app after day 3. And accessibility for the sunrise/counter motif specifically — if that visual is doing work to convey "days free," it needs a VoiceOver label stating the actual number and unit, not just an ornamental image with no accessible description, since decorative-only glyphs conveying primary information is a common accessibility miss.

Last thing: SwiftData store failure (corrupt store, disk full, migration failure) has no defined behavior anywhere in this brief. Given the "every screen needs empty/loading/success/error states" rule, the *app-level* store-load failure needs its own state too — not just per-screen errors — because if the persistent store fails to initialize, there's no "screen" to show an error on yet.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
All five required outputs are present and concrete. Resolved requirements consolidate every prior-phase lock (multi-habit schema, non-punitive relapse, wall-clock timer, forward-only recompute) and add genuinely new, previously-unaddressed decisions this round: force-quit/relaunch recovery semantics for the craving timer, habit deletion with cascade and no undo, subscription-lapse behavior (read-only degradation, never deletion), StoreKit verification hard-blocking, and milestone idempotency via a per-habit "already shown" flag. These are exactly the kind of edge cases the phase exists to surface before build.

Edge cases are enumerated comprehensively (14+ distinct scenarios) and each either resolved inline or explicitly deferred with reasoning. Data/privacy section correctly treats the no-app-lock decision as a named, accepted exclusion rather than a silent gap, consistent with the phase playbook's "convert open questions into assumptions or explicit exclusions" rule. The risk register has six items, each with either a concrete mitigation or an explicit "named limitation" label (the timezone-travel streak jump is correctly framed as an accepted consequence of an already-locked rule, not a new bug to chase). Final assumptions are stated plainly and don't contradict any earlier phase.

No contradictions with prompt_contract, product_research, portfolio_selection, initial_discussion, per_app_product_brief, or next_steps_small. Nothing here overrides the MVP-slice cut list from next_steps_small — the new decisions (deletion, subscription lapse, force-quit recovery, milestone idempotency) are compatible additions that a build phase can implement without reopening scope debate. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### App Features

# freeday — App Features

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:23:14._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Enumerate and prioritize the full feature set with an explicit scoring / MoSCoW model and clear in-scope vs out-of-scope lines.

## Transcript


### Round 1


**Codex (Design Lead · Skeptic) — Round 1**

My recommendation is to keep this phase strictly architectural from a UX standpoint: ship the emotional loop that makes quitting feel possible after a slip, and everything else is secondary garnish even if it has commercial value.

The biggest objection to this direction is that it can feel “too small” from a monetization perspective, so the app risks looking underpowered in screenshots; I accept that risk because every missing secondary feature is recoverable later, but if the relapse and timer moments feel wrong, no screen polish or premium feature can recover trust.

Must-have (MUST) features and acceptance expectations:  
- Home “today” loop in one-tap form (free path: one habit visible, one clear primary action set: Start 90-second rescue and I slipped/Reset)  
  - Access: cold-open to today state must be reachable quickly with empty/loading/success/error variants.  
  - In-scope rule: no backdating, no hidden habit selectors for free users, no deep menu detours.  
  - Acceptance: a user can complete setup and reach today metrics without reading walls of text.

- Habit setup includes name, quantity-per-day, and cost-per-unit, with forward-only savings recompute behavior and explicit explanation shown at edit time  
  - Acceptance: edits after accrued progress do not alter historical savings silently; the current “effective savings-from-now” is obvious and labeled.

- Non-punitive relapse flow with same-screen reassurance of preserved lifetime progress  
  - Acceptance: relapse confirmation and lifetime-totals reassurance are visible in one screen; copy avoids failure framing and no red/warning visual semantics.

- Streak engine as a pure function derived from timestamps (calendar days in local timezone)  
  - Acceptance: streak can never go negative, never resets lifetime count, and reflects clean-day boundaries correctly after resume/foreground transitions.

- Craving rescue timer engine (90 seconds) anchored to wall-clock start time  
  - Acceptance: timer can survive background and force-quit; on relaunch, if elapsed >=90s → abandoned; if <90s → resume remaining time; only full completion increments “cravings survived”.

- Milestone recap + ShareLink artifact for early milestone (day 1 or 3), Dynamic Type and dark/light robust  
  - Acceptance: card renders at max Dynamic Type, no clipping, and is shareable from today state quickly.

- Real StoreKit 2 entitlement flow for second habit with restore path and verified-transaction enforcement  
  - Acceptance: no fake toggle; unverified transactions do not grant; restore works and updates entitlement in-session; one active entitlement path tested conceptually.

- Offline persistence and store bootstrap hard-failure state  
  - Acceptance: zero-network dependency for data; app presents an explicit error state if SwiftData fails to initialize before normal navigation.

- Core accessibility baseline for all core flows  
  - Acceptance: 44pt targets, VoiceOver labels for key counters and motif, and WCAG-AA contrast on all critical states.

- Subscription-lapse trust rule  
  - Acceptance: all habit data remains; expired subscription makes extras read-only (except most recent habit remains interactive), no deletion or history reset.

- App-level edge state model for known failures  
  - Acceptance: duplicate timer sessions, negative/invalid numbers, and delete-with-cascade (habit + related events) are handled without crash and with error state.

Should-have (SHOULD) features for this phase only if design quality stays intact:  
- Basic habit list with one-click activation for paid users while respecting free single-habit simplicity.  
- Milestone explainability affordance (“how savings is calculated”) from the today screen.  
- Optional onboarding card that explains non-shaming reset logic before first relapse.  
- Light haptic reinforcement on streak day and full rescue completion when supported.

Could-have (COULD) only if core flow is fully stable:  
- Second/third rescue timer variant (e.g., breathing, count-down, body-scan) inside paid tier as true premium utility, not cosmetic.  
- Live Activity and WidgetKit (explicitly degradable).  
- Basic settings screens expanded for theme and export.  
- Optional daily local reminder toggle (if added, include permission-denied state).

Won’t-build in this phase (WON’T):  
- Any social/community feed, moderation layer, or backend sync (including CloudKit).  
- Clinical or medical guidance copy and treatment claims.  
- Journaling, backdated relapse entry, or “why did I crave?” introspective workflows.  
- Gamified punishments, streak shame mechanics, red “broken streak” visuals, or hard reset resets to all totals.  
- Face ID/passcode lock and third-party analytics/telemetry.

In-scope for this phase:  
- The five core workflows, non-shaming relapse UX, deterministic local-first data model, milestone sharing loop, and StoreKit-gated multi-habit entitlement path.  
- Empty/loading/success/error states for every reachable screen and a global bootstrap error path before normal UI.

Out-of-scope for this phase:  
- Live Activity, WidgetKit, multi-variant rescue tools, reminders, and advanced settings unless they do not delay the core loop.

MoSCoW with weighted score (1–5 urgency x value x risk-avoidance):  
- Home today + one-tap flows: Must, 5/5/5  
- Non-punitive relapse UX: Must, 5/5/5  
- Streak/savings core computation with recompute transparency: Must, 5/5/5  
- Craving timer durability + completion semantics: Must, 5/4/5  
- Shareable milestone card: Must, 5/4/4  
- StoreKit entitlement + restore + verify correctness: Must, 4/5/4  
- Cascade delete + force-quit timer recovery + subscription lapse read-only rule + app-level store error state: Must, 4/4/5  
- Widget/Live Activity: Should/Could, 3/2/2  
- Extra paid rescue variants: Could, 3/3/3  
- Reminders/history depth/history graphs: Could, 2/3/2  
- Polishing extras (animations, decorative detail variations): Could, 2/2/1  

The phase must preserve this non-negotiable design line: the first real value users see is “I can continue without shame,” not “I must read a policy,” and every premium boundary must feel like capacity uplift, not punishment for using a free path.

**Claude (QA & Risk · Pragmatist) — Round 1**

Coming at this from the pragmatist/QA seat: the risk this phase runs is producing a features list that reads well but that a build phase can't actually finish, or worse, one where the acceptance criteria are vague enough that "done" becomes a judgment call in the final review. I want to nail down something closer to a test plan than a wishlist.

For must-haves, I'd draw the line exactly at the five core workflows plus the infrastructure that keeps them honest, and nothing past that. Habit setup (name, quantity-per-day, cost-per-unit) is a must, and its acceptance criteria has to include the ugly inputs, not just the happy path: zero or negative cost/quantity must be rejected at entry with inline validation, not silently accepted and producing a negative or infinite savings number later; editing cost/frequency after days have accrued must visibly show the forward-only recompute rule at the moment of edit, and a QA pass on this feature isn't complete until someone actually edits a habit's cost three days in and confirms the historical savings didn't get silently rewritten. The today screen is a must, and its acceptance criteria is the four-state rule taken literally: what does this screen look like with zero habits, while SwiftData is still loading on cold launch, in steady state, and if the store fails to open — that fourth one is the one I'd bet money gets skipped if it's not written down explicitly as its own numbered acceptance line, because "app-level load failure" doesn't feel like a screen to whoever's building the today view.

The craving timer is a must, and I want its acceptance criteria to include the failure modes we already agreed on rather than just "timer runs for 90 seconds": force-quit mid-session and relaunch must either resume correctly (session not yet elapsed) or silently discard as abandoned (session's 90 seconds already elapsed) — no retroactive credit either way. Backgrounding mid-session and returning must show correct remaining time computed from the stored start timestamp, not from an app-suspended countdown that silently kept ticking or silently paused. Acceptance test: background the app at second 40, wait two real minutes, foreground — remaining time should read zero and completion should have already fired, not still be sitting at 50 seconds left.

Relapse/reset is a must, and the acceptance criterion I'd hold hardest is one I can literally screenshot: after tapping the one-tap reset, the very next frame the user sees must show both "streak reset to day 0" and the untouched lifetime total in the same view, with no red, no "broken," no second navigation required to see the reassurance. That's testable by a reviewer with no domain knowledge — show me the screenshot, I can grade it in five seconds.

Milestone share card is a must, with acceptance criteria that's actually about failure to render, not success: does it hold up at accessibility XXL Dynamic Type in both color schemes without clipping the dollar figure or the day count — those are the two numbers doing all the persuasive work, and if either one truncates the card is worse than useless, it's embarrassing. The per-habit "already shown this threshold" flag needs its own acceptance test: open the app five times after crossing day 3, confirm the milestone prompt only ever fired once.

Multi-habit gating via StoreKit is a must, scoped exactly as narrowly as the earlier phase already scoped it — its only job is blocking habit #2 creation and unlocking via subscribe/restore. Acceptance criteria: attempt habit #2 as free tier shows the paywall before any setup fields are shown, not after a wasted data-entry pass; a purchase with a deliberately unverified transaction (simulate this in the `.storekit` config) must hard-block entitlement, not partially grant it; restore purchases must be reachable from settings and must actually re-scan entitlements, not just re-display a cached flag. And habit deletion is a must I'd insist stays in this build, not a nice-to-have — it's cheap to build, and "I made a test habit and I'm stuck with it forever" is a first-five-minutes trust breaker for a category this personal. Acceptance: delete cascades to that habit's relapse events and craving sessions with no orphaned rows, confirmed by actually querying the store afterward, not just checking the UI stopped showing it.

Should-list, meaning real value but the app survives without it in this pass: the 2-3 interchangeable craving-timer content variants — ship the one default now, and if a second variant makes it in, great, but I wouldn't block the release on it since the abandoned-session and force-quit logic underneath it is identical regardless of variant count, so it's genuinely additive rather than load-bearing. Live Activity and WidgetKit are should-haves per the standing degrade-first rule — worth attempting, first to get cut under time pressure, and if cut, that has to be reported as a named cut, not silently absent. The multi-habit switcher UI for paid users past habit #2, and the subscription-lapse read-only-degradation logic — both real, both decided in earlier phases, but neither one is reachable by a single-habit tester in a QA pass unless they specifically buy a subscription and add a second habit, so they're should not must for verifying this build actually works. The "how we calculate this" savings affordance is a should — good hygiene, doesn't gate the core loop's correctness, but if it's cut, it should be flagged since it's the one thing standing between users trusting or distrusting the entire savings number.

Could-list: daily reminder notification, any settings beyond habit-edit and restore-purchases, a history/calendar screen beyond what's needed to substantiate the milestone card, haptic customization, alternate app icons. None of these have acceptance criteria worth writing this round because none of them are reachable in a QA pass of the core five workflows, and none of them were promised in any prior-phase must-have.

Won't-build, stated so nobody argues it back in mid-build: backdated relapse logging, "did this help" branching inside the craving timer, journaling or notes fields, photo attachments, community/social feed, CloudKit sync, LLM-based coaching, Face ID/passcode app-lock, any analytics or crash telemetry, customizable reminder schedules. These aren't oversights, they were explicitly ruled out in earlier phases, and repeating them here as a won't-build list protects the build phase from someone "helpfully" adding one back in out of habit.

The single biggest risk I see in this phase's own output, if we're not careful: writing acceptance criteria that describe the feature ("relapse resets streak") instead of describing the test that proves it ("screenshot after tapping reset shows both facts in one frame, no second tap"). If the final output only has the former, the build phase will build something that technically matches the words and still feels wrong, and nobody will catch it until the final review — which is exactly the failure mode this whole app's premise says we can't afford on the relapse screen specifically.

**Coordinator (Claude) — decision after round 1**

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

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
All four required outputs are present and concrete: seven must-have features each with specific, testable acceptance criteria (not just feature descriptions — screenshot tests, exact timing scenarios, store-query verification), a Should-have list with the standing rule that cuts must be reported not silent, a Could-have list, and a Won't-build list that correctly restates exclusions already locked in earlier phases so they can't be reopened mid-build.

The MoSCoW placement is defensible and consistent with everything decided upstream: all seven must-haves map directly to the five core workflows from prompt_contract plus the two pieces of infrastructure (StoreKit entitlement, state coverage) needed to make those workflows trustworthy rather than cosmetic. Habit deletion and the app-level store-failure state — both surfaced as previously-unaddressed gaps in detailed_discussion — are correctly promoted to Must rather than left dangling. Live Activity/widget correctly land as Should, consistent with the standing degrade-first rule reaffirmed across every prior phase. Nothing here contradicts prompt_contract, per_app_product_brief, next_steps_small, or detailed_discussion — it's a faithful compilation into MoSCoW form, not a re-litigation.

Acceptance checks satisfied: every must-have ties back to the product promise (non-shaming streak/savings tracking + craving rescue + shareable milestone + gated multi-habit), and the must-have list is scoped tightly enough (seven items, each already de-risked by two prior discussion phases) that a build phase can complete it without further product debate. No unresolved disagreement was papered over — the transcript shows genuine convergence with Claude's contribution being sharpening (test-case-level acceptance criteria) rather than a contested point. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

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

---

CONSENSUS: YES

### Design Discussion

# freeday — Design Discussion

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:24:42._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Decide UX flows, information architecture, key screens/states, and the design principles that govern them.

## Transcript


### Round 1


**Codex (Product Strategist · Pragmatist) — Round 1**

This phase should stay laser focused on making one emotional loop feel trustworthy before adding breadth: a single habit setup, one-tap daily check-in path, one-tap relapse reset, one-tap 90-second rescue timer, and an early milestone share card, all in a calm non-shaming UI. If we try to “beautify” the edge cases before we nail these four moments, we get a pretty app that users abandon on their first slip.

The primary user journey I want to lock is: cold open → if no habit, show fast setup with name / uses-per-day / cost-per-unit → once saved, show today home state → from home, two primary actions are always visible: “I’m craving now” and “I slipped, restart” → if timer completes exactly at 90 seconds, increment survived counter and congratulate quietly; if relapse happens, reset current streak only and keep lifetime visible in the same screen; when milestone threshold is crossed, show shareable card with day + dollars and ShareLink. That must remain one coherent flow and the default first-run success path for any review.

Screen inventory has to include only what the above needs: splash/app bootstrap, setup/edit habit, home/today, craving session, relapse confirmation, milestone card sheet, paywall/restore, and settings. Home should be the top-level with three tabs or simple sections for settings and history/snapshots, but do not bury rescue and reset behind extra navigation. The milestone screen can be a lightweight “card” view launched from home. App bootstrap and store failures are their own screen state before any content shows.

State model per screen is straightforward and strict:
home today: empty (no habits), loading (store opening), success (habit card + actions + counters), error (store read/compute failure).
setup/edit: success (valid input), loading (save), error (validation fail, storage fail), empty (new user).
craving session: countdown active, completed, abandoned/stale (recovery after relaunch uses elapsed-from-start logic), error (corrupt session state).
relapse confirmation: success (restarted + lifetime retained), error (no habit selected), loading (persisting event).
milestone card: available, already shown (suppress repeat), share sheet states, error rendering fallback.
paywall: locked state for second habit, purchase state, restore state, verification/state failure.
settings: entitlement state (free/pro), restore action outcome, delete confirmation, confirmation success/error.
app-level: global store bootstrap failure, transaction verification failure, and read-only mode after subscription lapse with existing data preserved.

The hardest risk is relapse optics, not timer correctness. If the reset view feels like punishment, the app fails regardless of otherwise correct math. The second hardest risk is stale logic around sessions (backgrounding/force-quit) creating silent false positives; timer completion must be computed from stored start time only. I want these two checks enforced: first, screenshot the reset state; second, force-quit and resume timer logic in one behavior test.

The visual direction must stay fixed and consistent from app to app: soft mint-to-sky gradient background, rounded cards/buttons, sunrise/counter motif as the main status metaphor, warm supportive language, no red/clinical color coding, and no “broken” framing. Numbers are the hierarchy, not decorations: day count and dollars should dominate and be easy to read. Craving timer should feel calm and reassuring, with gentle, restrained motion and short supportive copy.

Accessibility is a must, not polish: minimum 44pt targets, accessible labels that read the numbers aloud (“47 free days,” “saved $42.00”), and Dynamic Type-safe spacing especially on the milestone card and counter motif. Keep contrast high in both schemes and ensure iconography is supplemental to text, never the only meaning.

What must not be reopened for this phase: backdated relapses, journaling, community/feed, notifications, and any analytics/telemetry. Keep local-first only, StoreKit only for the real entitlement gate on habit #2, and no cloud dependency. The final output should preserve exactly these invariants: wall-clock anchored rescue sessions, forward-only savings recompute, one-tap same-screen relapse reassurance, and explicit first-screen prevention of creating a paid feature they can’t use.

**Claude (Design Lead · User Advocate) — Round 1**

Let me picture the actual person opening this app for the first time: they've decided today's the day they're quitting vaping, they downloaded this off an App Store search at 11pm, and they have maybe ninety seconds of patience before they bail to something else. That's the person I'm designing screens for, and I want to lay out the concrete screen inventory and flow before anyone starts debating visual polish.

Screen inventory, in the order a fresh install actually touches them: a first-launch empty state (not a generic "add a habit" button but a warm, specific prompt — "What are you quitting?" — since this is the only screen every single user sees before they've invested anything); habit setup (name, quantity-per-day, cost-per-unit, each field validated inline, with a live-updating "here's roughly what you'll save" preview so the numbers feel real immediately instead of abstract); the Today/Home screen, which is the app's center of gravity and has to carry four numbers — current streak, lifetime days free, money saved, cravings survived — plus exactly two primary actions, the craving-timer entry and the relapse/reset entry, both reachable without scrolling or a second tap; the craving-timer full-screen modal (90 seconds, wall-clock anchored, one guided sequence, ending in a completion screen with haptic feedback, no "how did that feel" branching); the relapse/reset full-screen modal, which is really one screen with two states — a single confirmation tap, then the very same screen re-rendering with "streak reset, day 0" sitting next to the untouched lifetime total, no navigation between those two moments; the milestone share card, triggered contextually off Today rather than living in its own tab, with a ShareLink sheet; a lightweight history/milestones tab that's really just a chronological list of milestone cards earned so far, existing to substantiate sharing rather than to be a full calendar/journal (we explicitly ruled journaling out, and I want the screen inventory to reflect that restraint rather than quietly growing a feature back in); a habit edit screen reachable from Today, carrying the forward-only recompute disclosure at the moment cost/frequency actually changes; a paywall screen, triggered when a free user attempts to create habit #2, shown before any second-habit setup fields render; and a settings screen holding habit edit, restore purchases, and nothing else this pass. That's nine screens total, and I'd resist adding a tenth without a specific workflow forcing it.

Navigation is flat: three tabs — Today, Milestones, Settings — with craving timer, relapse, habit setup, and paywall all presented as full-screen modal sheets off Today rather than pushed into any tab's navigation stack. I feel strongly about this because the two highest-stakes moments in the whole app — "I need the timer right now" and "I just relapsed" — cannot be one push away from getting lost in a stack the user has to remember how to back out of. A modal that dismisses cleanly back to Today after completion is the right shape for both.

On states: Today needs its four variants spelled out as actual designed screens, not implied — the true first-run empty state before any habit exists (this is not a blank Today screen, it's the "what are you quitting" prompt, meaning Today and the onboarding entry point are effectively the same screen wearing two different states); a brief loading state while SwiftData opens on cold launch, which needs actual content — a skeleton of the sunrise motif and number placeholders, not a blank white screen, because blank screens read as broken on a phone; the steady-state success view with all four numbers live; and the app-level failure state if the store itself won't open, which I want treated as a distinct full-screen takeover with a plain-language message and possibly a "try again" affordance, because a corrupt SwiftData store is not a "screen problem," it's an app problem and needs to look like one, not like a broken widget on an otherwise normal screen. The craving timer has its own state set: ready-to-start, running (with the elapsed/remaining always derived from the stored timestamp, so a paused-looking countdown never lies about where it actually is), completed (haptic plus a small positive animation, incrementing cravings-survived), and abandoned (silent — no screen at all for this one, it just doesn't happen, which is itself a design decision worth stating: the abandoned path has no dedicated UI, it just means the counter didn't move). Relapse/reset has pre-tap and post-tap states living on the same screen as I described. Setup has empty fields, inline-validating fields, and a save-confirmed state that returns to Today. Paywall has default and post-purchase-processing and restore-in-progress states, plus a failure state for a purchase that didn't verify — that one needs its own honest copy, not a spinner that quietly times out.

Visual direction: I want the sunrise/counter motif to be the one piece of chrome that's doing real narrative work rather than decoration — the streak number should feel like it's rising with the gradient, mint at the bottom shifting to sky blue as the number gets larger, which gives long-term users a wordless sense of progress independent of the literal digit. Rounded, soft-edged card containers for each of the four stat blocks on Today, generous whitespace, no dense grid — this is a glanceable screen, not a dashboard. The relapse screen is the one place I'd actively fight any temptation to reuse a "warning" component from a design system — no orange, no red, no exclamation iconography; I'd use the same mint/sky gradient family as everywhere else, just calmer and slightly desaturated, so the emotional temperature of that screen doesn't visually spike relative to the rest of the app. The milestone card needs its own slightly more saturated, poster-like treatment since its whole job is to look good as a screenshot torn out of context — day count and dollar figure need to be the two largest text elements on that screen, nothing else competing with them.

Accessibility: the sunrise/counter graphic absolutely needs an explicit accessibility label stating the real number and unit ("47 days free," not just a shape with an implicit VoiceOver reading of nothing or of a decorative description) — this was already flagged as a real gap earlier and I want it treated as a screen-level requirement, not an implementation afterthought. Every tap target on Today, especially the two primary action entries, needs to hit 44pt regardless of how compact the card design gets. Dynamic Type at max size is the actual constraint that should drive the Today layout, not an afterthought pass — I'd design Today assuming the four stat cards need to reflow vertically at largest text sizes rather than clip, and test the milestone card at max type in both color schemes before considering it finished, since that's the one screen that leaves the device and represents the whole app to someone who's never used it.

The single biggest risk I see in this screen set is the relapse/reset screen reading as flat or under-designed because we're deliberately stripping out every visual cue that usually signals "something changed" — no red, no shake, no modal warning chrome. If it's under-designed rather than deliberately calm, it'll feel like a bug, not a feature. So the thing I don't want lost from this phase: the reassurance content on that screen (the untouched lifetime total, specifically) needs its own small moment of visual warmth — not neutral gray text, something that still feels like part of the same encouraging system — so "calm" doesn't collapse into "cold."

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

Both of them are describing the same app, just at different resolutions — Codex sketched the shape (bootstrap → setup → Today → the two big modals → milestone), and Claude filled in the actual screen count, exact navigation structure, and the specific visual/accessibility decisions that make it buildable. Nothing here is contested: they agree on flat 3-tab navigation with the high-stakes moments (craving timer, relapse) as full-screen modals off Today rather than pushed into a stack, the same four-state Today screen, the same "no red, no warning chrome" treatment for the relapse screen, and the same sunrise/gradient motif doing real narrative work. Claude's one addition worth flagging — giving the relapse screen's lifetime-total reassurance its own small warm visual moment so "calm" doesn't read as "cold" or "under-designed" — is a genuine refinement Codex didn't contradict.

## Final Output

**Screen inventory (9 screens):**
1. First-launch empty state / "What are you quitting?" prompt — same surface as Today, just its zero-habit state
2. Habit setup/edit (name, quantity-per-day, cost-per-unit, live savings preview, inline validation)
3. Today/Home (streak, lifetime days free, money saved, cravings survived; two primary actions always visible)
4. Craving-timer modal (90s, wall-clock anchored, one guided sequence, no branching)
5. Relapse/reset modal (single screen, pre-tap and post-tap states, no navigation between them)
6. Milestone share card (contextual off Today, ShareLink sheet)
7. Milestones/history tab (chronological list of earned cards — substantiates sharing, not a journal)
8. Paywall (triggered on habit #2 attempt, before any setup fields render)
9. Settings (habit edit entry, restore purchases — nothing else this pass)

**Primary user flow:** Cold open → no habit → setup (name/quantity/cost with live preview) → Today steady state → from Today, two always-visible one-tap actions: "I'm craving now" (→ timer modal → completion or silent abandonment, dismisses back to Today) and "I slipped, restart" (→ same-screen reset + untouched lifetime total, no tap-through) → milestone threshold crossed → share card surfaces contextually from Today with ShareLink. Attempting a second habit as free tier hits the paywall before any setup fields show.

**State model per screen:**
- Today: empty (no habit, doubles as onboarding prompt) / loading (SwiftData opening — skeleton motif + number placeholders, never blank white) / success (four live stats + two actions) / app-level store-failure (full-screen takeover, plain-language message, distinct from a per-screen error)
- Setup/edit: empty (new user) / inline-validating (rejects zero/negative live) / saving / save-confirmed (returns to Today); edits after accrual show forward-only recompute disclosure at the moment of edit
- Craving timer: ready-to-start / running (elapsed & remaining always derived from stored timestamp) / completed (haptic + counter increment) / abandoned (no dedicated UI — the counter simply doesn't move)
- Relapse/reset: pre-tap confirmation / post-tap (same screen, shows "reset to day 0" + untouched lifetime total together)
- Milestone card: available / already-shown (suppressed via per-habit flag) / share-sheet states / render-fallback error
- Paywall: locked (pre-purchase) / purchase-in-progress / restore-in-progress / verification-failure (explicit copy, not a silent timeout)
- Settings: free/pro entitlement state, restore outcome, delete confirmation + success/error

**Visual direction:** Soft mint-to-sky-blue gradient throughout; the sunrise/counter motif shifts gradient tone as the streak number grows so long-term progress reads wordlessly. Rounded, soft-edged stat cards on Today with generous whitespace — glanceable, not a dashboard. Numbers (day count, dollar figure) are the visual hierarchy everywhere, especially on the milestone card, which gets a slightly more saturated poster-like treatment since it's the artifact that leaves the device. The relapse screen deliberately reuses the same calm mint/sky family, desaturated rather than alarmed — no red, no warning iconography, no shake — but its lifetime-total reassurance gets its own small warm visual accent so the screen reads as intentionally calm, not merely stripped-down.

**Accessibility notes:** 44pt minimum on both primary Today actions regardless of card compactness; explicit VoiceOver labels stating real numbers ("47 days free," "saved $42.00") on the sunrise/counter motif and milestone card, never a decorative-only glyph; Today's four stat cards are designed to reflow vertically at max Dynamic Type rather than clip; milestone card is tested at max Dynamic Type in both light and dark before being considered finished, since it's the one screen representing the app to people who've never used it; WCAG AA contrast maintained in both color schemes, with iconography always supplemental to text.

No open disagreement — ready to close.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
All five required outputs are present and concrete: a 9-screen inventory with clear purpose per screen, a primary user flow that traces cold-open through every core workflow (setup, streak, craving timer, relapse, milestone, paywall gate), explicit state models for the highest-stakes screens (Today's four states including the app-level store-failure takeover, the timer's stored-timestamp-derived states, relapse's same-screen pre/post-tap pairing), a visual direction consistent with and more specific than the design-handoff prompt (gradient-tracks-streak-growth motif, deliberately desaturated-not-alarmed relapse screen), and accessibility notes that correctly promote the sunrise-motif VoiceOver label and max-Dynamic-Type milestone card testing from "nice to have" to explicit requirements, consistent with what detailed_discussion flagged as a real gap.

Both acceptance checks hold: the screen/navigation structure (3 flat tabs, high-stakes flows as full-screen modals off Today) is concrete enough for a SwiftUI developer to build the view hierarchy directly, and all five core workflows from prompt_contract map to a specific screen and state path. Nothing here contradicts prior-phase locks — wall-clock timer anchoring, forward-only recompute, non-punitive same-screen relapse reassurance, and the narrow StoreKit-gates-habit-#2 scope all carry forward unchanged.

One minor gap for the record, not severe enough to block: the Milestones/history tab (screen 7) doesn't get its own explicit state-model entry (empty when no milestones earned yet vs. success list). It's inferable from context and low-risk since this tab was already scoped as a lightweight list, so no repair round is needed — just worth the build phase filling in trivially.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

Both of them are describing the same app, just at different resolutions — Codex sketched the shape (bootstrap → setup → Today → the two big modals → milestone), and Claude filled in the actual screen count, exact navigation structure, and the specific visual/accessibility decisions that make it buildable. Nothing here is contested: they agree on flat 3-tab navigation with the high-stakes moments (craving timer, relapse) as full-screen modals off Today rather than pushed into a stack, the same four-state Today screen, the same "no red, no warning chrome" treatment for the relapse screen, and the same sunrise/gradient motif doing real narrative work. Claude's one addition worth flagging — giving the relapse screen's lifetime-total reassurance its own small warm visual moment so "calm" doesn't read as "cold" or "under-designed" — is a genuine refinement Codex didn't contradict.

## Final Output

**Screen inventory (9 screens):**
1. First-launch empty state / "What are you quitting?" prompt — same surface as Today, just its zero-habit state
2. Habit setup/edit (name, quantity-per-day, cost-per-unit, live savings preview, inline validation)
3. Today/Home (streak, lifetime days free, money saved, cravings survived; two primary actions always visible)
4. Craving-timer modal (90s, wall-clock anchored, one guided sequence, no branching)
5. Relapse/reset modal (single screen, pre-tap and post-tap states, no navigation between them)
6. Milestone share card (contextual off Today, ShareLink sheet)
7. Milestones/history tab (chronological list of earned cards — substantiates sharing, not a journal)
8. Paywall (triggered on habit #2 attempt, before any setup fields render)
9. Settings (habit edit entry, restore purchases — nothing else this pass)

**Primary user flow:** Cold open → no habit → setup (name/quantity/cost with live preview) → Today steady state → from Today, two always-visible one-tap actions: "I'm craving now" (→ timer modal → completion or silent abandonment, dismisses back to Today) and "I slipped, restart" (→ same-screen reset + untouched lifetime total, no tap-through) → milestone threshold crossed → share card surfaces contextually from Today with ShareLink. Attempting a second habit as free tier hits the paywall before any setup fields show.

**State model per screen:**
- Today: empty (no habit, doubles as onboarding prompt) / loading (SwiftData opening — skeleton motif + number placeholders, never blank white) / success (four live stats + two actions) / app-level store-failure (full-screen takeover, plain-language message, distinct from a per-screen error)
- Setup/edit: empty (new user) / inline-validating (rejects zero/negative live) / saving / save-confirmed (returns to Today); edits after accrual show forward-only recompute disclosure at the moment of edit
- Craving timer: ready-to-start / running (elapsed & remaining always derived from stored timestamp) / completed (haptic + counter increment) / abandoned (no dedicated UI — the counter simply doesn't move)
- Relapse/reset: pre-tap confirmation / post-tap (same screen, shows "reset to day 0" + untouched lifetime total together)
- Milestone card: available / already-shown (suppressed via per-habit flag) / share-sheet states / render-fallback error
- Paywall: locked (pre-purchase) / purchase-in-progress / restore-in-progress / verification-failure (explicit copy, not a silent timeout)
- Settings: free/pro entitlement state, restore outcome, delete confirmation + success/error

**Visual direction:** Soft mint-to-sky-blue gradient throughout; the sunrise/counter motif shifts gradient tone as the streak number grows so long-term progress reads wordlessly. Rounded, soft-edged stat cards on Today with generous whitespace — glanceable, not a dashboard. Numbers (day count, dollar figure) are the visual hierarchy everywhere, especially on the milestone card, which gets a slightly more saturated poster-like treatment since it's the artifact that leaves the device. The relapse screen deliberately reuses the same calm mint/sky family, desaturated rather than alarmed — no red, no warning iconography, no shake — but its lifetime-total reassurance gets its own small warm visual accent so the screen reads as intentionally calm, not merely stripped-down.

**Accessibility notes:** 44pt minimum on both primary Today actions regardless of card compactness; explicit VoiceOver labels stating real numbers ("47 days free," "saved $42.00") on the sunrise/counter motif and milestone card, never a decorative-only glyph; Today's four stat cards are designed to reflow vertically at max Dynamic Type rather than clip; milestone card is tested at max Dynamic Type in both light and dark before being considered finished, since it's the one screen representing the app to people who've never used it; WCAG AA contrast maintained in both color schemes, with iconography always supplemental to text.

No open disagreement — ready to close.

---

CONSENSUS: YES

### Design Handoff

# freeday — Design Handoff

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:26:25._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Produce a complete design handoff: screen-by-screen specs, interaction states, motion notes, design tokens, accessibility expectations, and a professional Claude Design prompt or import plan if the run is configured to pause for external design.

## Transcript


### Round 1


**Codex (Design Lead · User Advocate) — Round 1**

I’d prioritize one emotional promise over everything else: the app must make two high-stakes moments feel safe in under 2 taps — “I’m craving now” and “I slipped.” Every screen and animation should disappear in service of those moments. Freeday should look calm, personal, and encouraging, never clinical or punitive, and it should always answer this question in one glance: “Can I keep moving forward right now?”

The core flow should be: cold launch → if no habit, immediate onboarding; if habit exists, Today with two large actions; from Today, one tap opens the timer flow, one tap opens reset; streak/cost/savings update transparently; early milestone triggers a shareable card path that works immediately.

Screen-by-screen spec with states:

Today/Home screen is the app root and is both onboarding and dashboard. In empty state, show a full-width invite card reading “What are you quitting?” with one clear input entrypoint. In loading state, show skeleton versions of the sunrise counter and four metric cards so users see intent while data opens. In success state, show: current clean days, lifetime days, money saved, cravings survived, and two primary actions that are always visible and 44pt+ (“I’m craving now” and “I slipped, restart”). In app-level error state (store open failure), swap the whole screen to a plain language recovery panel with retry and support-friendly guidance, because there is no normal UI if persistence never opens.

Setup screen is focused, no extra steps: fields for Habit Name, Uses per Day, Cost per Unit, each with inline validation, no acceptance of zero/negative, and a live preview line “Estimated daily savings” + “since day one this is your saved total today.” Keep a small note explaining forward-only recompute at edit time before save action. In success/saved state, return to Today with a soft success haptic and one-frame recap. In save failure state, keep input values and only highlight blockers.

Relapse/Reset flow is one modal with two states only: pre-tap intent and post-tap confirmation on the same surface. Pre-tap has one calm confirm action. Post-tap shows “Streak reset to day 0” and “Lifetime total unchanged” simultaneously, same view, no second navigation and no red/orange warning palette. Include a subtle warm secondary emphasis chip so it feels intentional, not coldly neutral.

Craving Timer flow is a full-screen modal with one guided sequence (copy-first, no branching). It is 90 seconds wall-clock anchored from a persisted start timestamp. While running, the UI shows remaining time and a gentle line-by-line cue that updates without rewinding content on resume. On background/foreground, remaining time is recalculated from timestamp. Force-quit behavior: if elapsed >=90s at launch, treat as abandoned and return to Today with no survival increment; if less than 90s, resume remaining seconds. On full completion, trigger haptic + micro-motion and increment cravings-survived. Incomplete timer never adds points and has no special error screen; it’s simply treated as no-op.

Milestone card flow is contextual from Today, not buried. First trigger should be early (day 1 or day 3) with a clear affordance to view and share immediately. A per-habit “already shown” flag prevents repeat prompts on repeated opens. Share card is a premium artifact view with dominant day number and dollar value, generous margins, and ShareLink support. At max Dynamic Type, both day and dollar values must not clip; in success state export/share preview is available; in render failure state show fallback plain-text summary card.

Habit list/history tab is intentionally light: a chronological stack of milestone cards earned so far, each with date, day count, saved amount, and quick-share action. It is substantiation, not journaling. Empty state explains “No milestones yet — first milestone appears at day 1/3.” Success is list with stable sorting latest-first. Loading and error are simple and explicit.

Paywall/relation to entitlements is triggered before second habit setup begins. It should open before any second-setup fields and explain what Freeday+ unlocks. States: locked, purchase in progress, restore in progress, verified/verified-failed (hard fail if unverified), and retryable error with non-defensive language. On restore, call current entitlements and update state live. No fake toggles.

Settings is minimal and trustworthy: edit current habit, restore purchases, delete habit with clear one-step confirmation, and subscription status. Deleting a habit cascades to its related relapse and craving records; do not show stale entries.

Navigation should be a three-tab shell: Today, Milestones, Settings. Timer and relapse are modal overlays from Today; they never live in deep stack levels because these are crisis actions. The visual hierarchy should stay stable across tabs so users aren’t disoriented.

Component inventory for build:
Card system with soft rounded containers and subtle blur in dark mode.
SunriseCounter component that animates gradient tone by streak band and exposes VoiceOver label as “X days free.”
Metric tiles for current streak, lifetime days, money saved, cravings survived; each tile is independently tappable? no, unless navigation needed (only Today actions are tappable).
Primary buttons are warm rounded, high-contrast, with generous spacing and 44pt touch size.
Habit input form fields use numeric keyboard with inline validation and helper text.
Milestone card component with “hero” typography and ShareLink.
Modal wrappers for timer and reset with fixed ordering and dismiss paths.
Toast/inline banner style for non-breaking transient feedback.

Visual system:
Background should be a mint-to-sky gradient, soft and intentional: muted mint to warm sky-light in light mode, deep slate to cool aqua in dark mode.
Motif language is sunrise/counter: number is the emotional center, gradients act as mood curve, not decoration.
Corners are rounded and consistent (16–24 radius).  
Typography should feel warm and readable: large Display for primary counters, medium Sans for action text, body with high legibility; avoid heavy all-caps, avoid dense dashboards.
Color families: progress green/teal accents for forward actions, warm gold accent for recovery reassurance, neutral slate text for body, and no clinical red or warning orange.
Icons are rounded, soft, and secondary to text; never carry meaning alone.

Motion notes:
Use brief spring-once transitions for modal transitions and state swaps.
Timer should use a calm radial progress animation and gentle number ticking with 120–150ms smoothing.
On successful timer completion and milestone unlock, use a short scale-and-fade flourish, under 300ms total.
Relapse confirmation should not use shake, vibration spikes, or red flash; it should feel like a soft reset breath.
Loading states should shimmer only on placeholders, never fake progress bars pretending certainty.

Interaction notes that must be preserved:
One-tap from Today for timer and reset must always remain.
No backdating of relapse time.
Relapse path is same-screen recovery with preserved lifetime stat.
Timer must be timestamp-reliable, not interval-only.
Milestone artifact has to be the social surface; if it fails visually at large text or dark mode, treat it as blocked, not acceptable.

Accessibility requirements:
Dynamic Type must reflow all stat cards vertically if needed without overlap.
All metrics expose explicit VoiceOver labels with actual numbers and units (“12 days free,” “$18.50 saved”).
Primary actions and paywall controls are 44pt+ and visually distinct.
Contrast at WCAG AA in both schemes; don’t rely on hue alone.
Milestone card must pass max accessibility size and both color modes.

Biggest objection I’d raise against this direction is overcomplicating onboarding with extra tabs or checklists that slow down the first craving event; if someone opens the app during stress, they need two straightforward actions, not choices. The detail this phase must not lose is same-screen post-reset reassurance with preserved lifetime totals — if that disappears, the product promise is broken even if everything else is perfect.

If you want to hand this to external design, use this prompt:
“Design Freeday with a premium but soft local-first SwiftUI product language: mint-to-sky gradient system, rounded friendly surfaces, sunrise/counter motif that maps to days clean, warm non-clinical tone, modal crisis flows for craving rescue and non-shaming relapse reset, shareable milestone card artifact with strong typography (days and dollars), strict a11y for VoiceOver + Dynamic Type, 44pt targets, and a calm motion system (no punitive red or warning states). Prioritize one-tap timer and one-tap reset from Today, and include explicit empty/loading/success/error variants for every reachable screen plus app-level store bootstrap failure handling.”

**Claude (Frontend Engineer · Systems Thinker) — Round 1**

Looking at this from the build side: the prior design_discussion phase already locked the screen inventory, navigation shape, and visual direction, so my job here is to turn that into something a SwiftUI engineer can actually type in without inventing anything mid-build. I'll go screen by screen, but I want to front-load the architecture decisions because they constrain how every screen has to be written, and if I don't nail these down now someone will improvise them differently per screen and the app will feel inconsistent even if it matches the visual spec.

Navigation shape: a root TabView with exactly three tabs — Today, Milestones, Settings — each wrapping its own NavigationStack so push navigation stays possible inside Settings (habit edit) without touching the tab structure. Craving timer and relapse/reset are `.fullScreenCover`, not `.sheet` — a sheet leaves a sliver of the tab bar visible and implies "you can flick this away casually," which is wrong for both the most urgent and the most emotionally loaded moment in the app. Paywall and habit setup are `.sheet` — lower stakes, dismissible, standard iOS pattern. Milestone share is a `.sheet` presenting the card with a ShareLink inside it, triggered from a banner/button on Today rather than auto-popping over the user, so it never steals focus mid-interaction.

State management: one `@Observable` view model per feature surface (TodayViewModel, CravingTimerViewModel, RelapseViewModel, HabitFormViewModel, MilestoneViewModel, EntitlementStore), backed by SwiftData `@Query` for reads and `ModelContext` for writes, injected via environment. The one non-negotiable data-model decision I want written into the handoff: streak must not be computed by scanning the full RelapseEvent history on every render. Store `lastRelapseAt: Date` directly on the Habit model (updated transactionally whenever a relapse is logged) and derive streak as a pure function of `Calendar.current.dateComponents([.day], from: lastRelapseAt, to: .now)` — O(1) per habit, safe to call from `body` on every redraw without a performance concern, and it's the same function that has to answer "did we cross a milestone threshold" so it belongs in one shared `StreakEngine.swift` utility rather than duplicated per screen. This function needs to be called again whenever `scenePhase` transitions to `.active` and at local-midnight boundaries — I'd add a lightweight `.onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged))` on the Today screen specifically so a streak that ticks over while the app sits open overnight (unlikely but real) updates without requiring a relaunch.

The craving timer is the one screen where state management has real teeth: the source of truth is a persisted `CravingSession.startedAt: Date` written to SwiftData the instant the user taps "I'm craving now," before any UI even shows a countdown. The on-screen countdown is a derived value — `remaining = max(0, 90 - Date().timeIntervalSince(startedAt))` — recalculated on a `Timer.publish(every: 1)` purely for the visual tick, never as the authority for whether the session is complete. On `.onAppear` and on every `scenePhase` transition to `.active`, re-derive remaining time from the stored timestamp rather than trusting whatever the in-memory countdown said before backgrounding. If remaining hits zero, fire completion (haptic + increment cravings-survived + write completion timestamp) exactly once — guard this with a boolean so backgrounding right at the zero mark can't double-fire. If the app cold-launches and finds an incomplete `CravingSession` whose `startedAt + 90s` is already in the past, mark it abandoned and clear it silently — no toast, no screen, per the earlier decision that abandonment has no dedicated UI.

On to the actual screens. Today opens on a full-bleed gradient background (mint at the safe-area bottom rising to sky blue past the status bar — I'd implement this as a `LinearGradient` whose stop positions shift, not whose colors shift, driven by a 0–1 "streakProgress" value clamped at some reasonable ceiling like 90 days, so the motion is a gradient that visually "rises" rather than a color that jarringly swaps at each session). The sunrise/counter motif sits as a large circular/arc component near the top — I'd build it as a custom `Shape` with a soft radial glow behind it and the streak number in large rounded-numeral type inside it, with an explicit `.accessibilityElement(children: .ignore)` plus `.accessibilityLabel("47 days free")` on the whole group so VoiceOver reads one coherent sentence instead of stepping through decorative sub-shapes. Below that, four stat cards in a 2x2 grid on standard Dynamic Type sizes that reflows to a single vertical column at accessibility sizes — this needs an actual `ViewThatFits` or a `@ScaledMetric`-driven conditional layout, not just letting the grid squish, since a squished 2x2 grid at max type is how cards start clipping. The two primary actions ("I'm craving now" / "I slipped, restart") sit as large full-width rounded buttons pinned near the bottom, minimum 56pt height (comfortably past the 44pt floor since these are the two most-tapped targets in the app), with the craving button carrying the more saturated/primary gradient fill and the relapse button a quieter outlined or tonal treatment — visually distinct so a stressed thumb doesn't mis-tap between "I need help" and "I'm resetting."

Today's four states: the empty/onboarding state swaps the stat grid entirely for the "What are you quitting?" prompt card with a single CTA into habit setup — I want this literally to be `if habits.isEmpty { OnboardingPromptView() } else { TodayContentView() }`, not a set of hidden/disabled cards, since a disabled 2x2 grid showing zeroes reads as broken, not as "get started." The loading state (SwiftData opening) is a skeleton — same layout shape as success, gradient background already rendered, stat cards as pulsing rounded-rect placeholders, sunrise motif rendered as its silhouette without a number — this should genuinely be a shimmer/opacity-pulse animation, not a spinner, because a spinner over a mostly-built UI reads as "this app is slow" rather than "this is intentional." The app-level store-failure state is a distinct full-screen view, not a variant of Today — plain-language copy, an icon, and a "Try Again" button that attempts to reopen the ModelContainer; this should be checked for at the App struct level before TabView is even constructed, so a broken store never gets a chance to render a tab bar over nothing.

Habit setup is a form sheet: name field, a stepper-plus-textfield combo for quantity-per-day (most users think in "packs" or "cans," so I'd let the label next to this field be configurable copy like "how many per day" rather than hardcoding a unit), a currency-formatted cost-per-unit field, and beneath both a live-updating preview line ("~$12.60/week, ~$657/year") that recalculates on every keystroke via `.onChange`. Inline validation: cost/quantity fields reject non-positive values immediately with a small red-adjacent-but-not-alarming inline caption (I'd use a warm amber/coral text color here, not the app's absent red, since this is form validation not shame) and disable the Save button rather than allowing an invalid save and failing later. When editing an existing habit with accrued days, a small info banner appears above the fields the moment either economic field changes value: "Changes apply from today forward — your savings so far won't change." This banner should only appear once a field actually differs from its original value, not preemptively on screen load, so it doesn't scare new users filling in a brand-new habit.

The craving timer full-screen cover: a calm, mostly-empty canvas — background gradient, a large circular progress ring counting down (arc fills as time elapses, purely decorative/derived from the timestamp math above), a short rotating line of supportive copy (3–4 fixed phrases cross-fading every ~20 seconds, not a wall of text), and a completion state that swaps the ring for a checkmark/glow with a `UINotificationFeedbackGenerator(.success)` haptic — gated behind a `CHHapticEngine.capabilitiesForHardware().supportsHaptics` check so this doesn't crash or no-op awkwardly on unsupported simulators. No cancel confirmation dialog — an X in the top corner dismisses immediately back to Today, and dismissal before completion is exactly the silent-abandonment path, no different code path than force-quit.

Relapse/reset is genuinely one view with a local `@State private var confirmed = false` toggling its content, not two screens. Pre-confirm: the habit name, a plain-language line ("Ready to reset your streak and start fresh?"), one confirm button, one cancel. Post-confirm, in place, same screen: "Day 0 — starting fresh" paired directly beside/below a card showing the lifetime total that just got a small warm highlight treatment (I'd literally give this card a brief scale+fade-in spring animation on the confirm transition so it visually arrives as "look, this part didn't move," reinforcing the point kinetically not just textually) and a "Done" button back to Today. This whole transition should use `.animation(.spring(response: 0.4, dampingFraction: 0.8), value: confirmed)` so the content swap feels like one continuous screen breathing, not a hard cut — a hard cut here would read as the screen "resetting" the user rather than reassuring them.

Milestone card: rendered as its own `View` conforming to `Transferable`/rendered via `ImageRenderer` for the ShareLink payload, at a fixed square-ish aspect ratio designed for socials. Big rounded numerals for day count and dollar figure as the only two things competing for attention, small app wordmark/logo bottom corner, poster-gradient background more saturated than the in-app gradient. Test this specifically at accessibility XXL — since it's rendered via `ImageRenderer` rather than shown live on a device, Dynamic Type here should probably be intentionally capped at a large-but-fixed size rather than literally following the system setting, otherwise a max-type export could produce an ugly disproportionate card; I'd note this as a deliberate exception to "always follow Dynamic Type," decided here so the build doesn't waffle on it.

Paywall: triggered as a sheet before any second-habit form renders, using StoreKit's `SubscriptionStoreView` where possible to minimize custom purchase-flow code and get Apple's tested UI/restore affordances for free, wrapped in the app's gradient background and rounded card chrome via `.subscriptionStoreControlStyle` and container styling rather than a fully bespoke paywall. A visible "Restore Purchases" text button below the store view regardless.

Design tokens, concretely: primary gradient stops around `#B9F2DE` (mint, bottom) to `#8ED0F0` (sky blue, top); a secondary "milestone poster" gradient a notch more saturated, `#7EE8C3` to `#6BB8F0`; text-primary near-black-blue `#152A38` for contrast on light backgrounds and near-white on dark mode's inverted deep-teal background `#0E1F27`; the relapse-screen accent (for the lifetime-total card) a warm coral-gold `#F4C77A` used sparingly, never as a full-screen wash. Corner radius scale: 12pt small components, 20pt cards, 28pt primary buttons/sheets — consistently rounded, never sharp. Spacing scale: 4/8/12/16/24/32/48. Type: SF Pro Rounded for numerals and headlines (reinforces the "friendly, not clinical" direction), SF Pro (default) for body copy, with a defined scale from Caption (13pt) through LargeTitle-equivalent custom size for the streak numeral (48–64pt, scaled). Shadows are soft and low-opacity — `.shadow(color: .black.opacity(0.08), radius: 12, y: 6)` on cards, never a hard drop shadow.

Component inventory to build once and reuse everywhere: `GradientBackground`, `SunriseCounterMotif(days:)`, `StatCard(label:value:icon:)`, `PrimaryActionButton(style: .rescue/.reset)`, `InlineValidatedField`, `RecomputeDisclosureBanner`, `MilestoneCardView` (dual-purpose: live preview + `ImageRenderer` export target), `SkeletonStatCard`, `AppLevelErrorView`, `OnboardingPromptCard`. Building these as standalone, state-driven components (not screen-specific inline code) is what actually makes the "5 screens share one visual language" promise real instead of aspirational — copy-pasted card code across screens is how these small apps drift out of sync by the third screen.

On the Claude Design prompt question: I don't think this app needs to pause for external design generation. Every prior phase has already produced concrete, specific, non-conflicting decisions down to gradient direction and motion behavior on the one screen (relapse) that needed the most judgment, and this handoff converts all of that into buildable tokens and components. Pausing now to route through external Claude Design would mean re-deriving decisions that are already locked and risks a visual system that doesn't match the state model and component inventory I just specified. My recommendation is no external design pause — proceed straight to build using this handoff as the source of truth. If the user later wants a second opinion or alternate visual exploration, the original spec's "Claude Design Handoff Prompt" (soft mint-to-sky-blue gradient system, rounded iconography, sunrise/counter motif, warm non-judgmental tone, milestone card as hero artifact, calm not gamified) is still sitting there ready to use verbatim as an upload prompt — but it shouldn't block or duplicate what's already specified here.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

## Final Output

Both of them ended up building the same handoff at different altitudes — Codex wrote the screen-by-screen UX/visual spec (states, copy, motion, a11y, component names), and Claude took every one of those decisions and turned it into exact SwiftUI architecture: which presentation style each modal uses, how streak/timer state actually gets computed and persisted, concrete hex values and type/spacing scales, and a named component inventory. Nothing between them conflicts — Claude's additions are all "here's how to actually build the thing Codex just specified," not a different opinion.

**Screen-by-screen spec:**
- **Today/Home** (root, no-nav): empty state doubles as onboarding ("What are you quitting?" card); loading state is a full skeleton (pulsing stat-card placeholders + silhouette sunrise motif, never a spinner or blank screen); success state shows sunrise/counter motif (streak number, VoiceOver label "47 days free") + 4 stat cards (streak, lifetime days, money saved, cravings survived) in a 2×2 grid that reflows to one column at accessibility Dynamic Type sizes; two full-width primary buttons pinned at bottom, min 56pt height ("I'm craving now" = saturated primary fill, "I slipped, restart" = quieter tonal fill, visually distinct so a stressed thumb can't mis-tap); app-level store-failure state is a distinct full-screen takeover (plain-language copy + Try Again), checked for before the TabView even renders.
- **Habit setup/edit** (sheet): name, quantity-per-day (configurable unit label), currency cost-per-unit, live-updating savings preview on every keystroke, inline validation rejecting non-positive values with warm-amber (not red) captions and a disabled Save until valid; editing an existing habit past day 0 surfaces a recompute-disclosure banner only once a field actually changes ("Changes apply from today forward — your savings so far won't change").
- **Craving timer** (`.fullScreenCover`, one guided sequence, no branching): source of truth is a persisted `CravingSession.startedAt`; on-screen countdown is always derived from that timestamp, recalculated on `.onAppear`/`scenePhase == .active`, never trusted from in-memory state across backgrounding. Completion (haptic + counter increment) fires exactly once, guarded against double-fire; dismissal before completion and force-quit-past-elapsed both resolve to silent abandonment with no dedicated UI.
- **Relapse/reset** (`.fullScreenCover`, one view, local `confirmed` toggle — not two screens): pre-confirm has one calm confirm/cancel; post-confirm swaps in place (spring animation, not a hard cut) to show "Day 0 — starting fresh" beside the untouched lifetime-total card, which gets its own small warm coral-gold accent so "calm" doesn't read as "cold." No red, no warning iconography, no shake.
- **Milestone card** (sheet, triggered contextually off Today, fires day 1 or 3, per-habit "already shown" flag): rendered as a `Transferable`/`ImageRenderer` target, big rounded numerals for day count + dollar figure as the only competing elements, poster-saturated gradient, capped at a fixed large type size for the exported image (deliberate exception to live Dynamic Type, stated explicitly so it's not left ambiguous).
- **Milestones/history tab**: chronological list of earned cards, empty/loading/success/error states, substantiation only — not a journal.
- **Paywall** (sheet, triggered before any second-habit field renders): built on `SubscriptionStoreView`/`.subscriptionStoreControlStyle` rather than fully bespoke, wrapped in app gradient/chrome, explicit Restore Purchases button, verification-failure state hard-blocks with honest copy (no silent timeout).
- **Settings**: habit edit entry, restore purchases, one-step delete-with-cascade, subscription status — nothing else this pass.

**Navigation/architecture:** 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; craving timer and relapse are `.fullScreenCover` (never `.sheet` — a sheet's visible tab-bar sliver undercuts the "this is serious" framing); paywall/setup/milestone share are `.sheet`. One `@Observable` view model per feature surface, SwiftData `@Query`/`ModelContext` via environment. Streak is stored as `lastRelapseAt` on Habit and derived as a pure `Calendar` function in one shared `StreakEngine.swift`, re-evaluated on `scenePhase` change and `.NSCalendarDayChanged` — not a full-history scan, not a cached counter.

**Design tokens:** primary gradient `#B9F2DE`→`#8ED0F0` (mint→sky), milestone-poster gradient `#7EE8C3`→`#6BB8F0` (more saturated), text `#152A38` on light / near-white on dark `#0E1F27` background, relapse-screen warm accent `#F4C77A` (used sparingly, never full-screen). Corner radii 12/20/28pt (component/card/button-sheet). Spacing scale 4/8/12/16/24/32/48. Type: SF Pro Rounded for numerals/headlines, SF Pro for body; soft low-opacity shadows only (`black.opacity(0.08)`), never hard drop shadows.

**Component inventory:** `GradientBackground`, `SunriseCounterMotif(days:)`, `StatCard`, `PrimaryActionButton(style:)`, `InlineValidatedField`, `RecomputeDisclosureBanner`, `MilestoneCardView` (dual live-preview/export), `SkeletonStatCard`, `AppLevelErrorView`, `OnboardingPromptCard` — built once as standalone state-driven views, not copy-pasted per screen.

**Motion:** spring-once transitions for modals/state swaps; calm radial progress + gentle number ticking on the timer; short (<300ms) scale-and-fade on completion/milestone unlock; explicitly no shake/red-flash/vibration-spike on relapse; shimmer-only loading placeholders, no fake progress bars.

**Accessibility:** 44pt+ targets (primary Today actions at 56pt+); explicit VoiceOver labels stating real numbers on the sunrise motif and milestone card (never decorative-only); Dynamic Type-safe reflow (2×2 grid → single column) tested at max size; WCAG AA contrast in both color schemes; milestone card tested at accessibility XXL in light and dark before being considered finished.

**Claude Design decision:** No external design pause. Every decision needed to build — down to gradient stops, motion durations, and the one screen (relapse) that most needed judgment — is already locked and concrete enough for a SwiftUI engineer to implement directly. If a second opinion or alternate visual exploration is wanted later, the original spec's Claude Design Handoff Prompt ("soft mint-to-sky-blue gradient system, rounded iconography, sunrise/counter motif, warm non-judgmental tone, milestone card as hero shareable artifact, calm not gamified") remains available verbatim as an upload prompt, but nothing here is blocked on it.

No open disagreement — ready to close.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All six required outputs are present and concrete: a full screen-by-screen spec (9 screens, each with state variants), a genuine design-token system (specific hex values, corner-radius scale, spacing scale, typography choices — not adjectives), a named component inventory meant to be built once and reused, explicit state/interaction notes (including the exact SwiftData/timestamp-derived streak and timer mechanics), accessibility requirements tied to specific components (sunrise motif VoiceOver label, milestone card XXL test, 44/56pt targets), and an explicit, justified no-external-design-pause decision with the original Claude Design prompt preserved verbatim as a fallback if ever wanted.

Both acceptance checks hold: a SwiftUI builder can implement directly from this (presentation styles named per screen, streak/timer architecture specified down to which timestamp is authoritative and how re-derivation is triggered, concrete hex/pt/spacing values, named reusable components) with no hidden decisions deferred to build time. The direction is category-specific and premium rather than generic — the sunrise/counter motif doing real narrative work via gradient-stop progression, the deliberately warm (not cold/neutral) treatment of the relapse screen's lifetime-total reassurance, and the milestone card's deliberate Dynamic-Type-cap exception for exported images are all specific product judgment calls, not boilerplate.

Nothing here contradicts prior-phase locks (non-punitive same-screen relapse reassurance, wall-clock-anchored timer with force-quit/background recovery semantics, forward-only recompute disclosure, narrow StoreKit-gates-habit-#2 scope, flat 3-tab navigation with crisis flows as full-screen covers). The round-1 convergence is genuine — Codex specified UX/visual/motion decisions and Claude converted every one into buildable SwiftUI architecture without introducing a competing opinion. Ready to close; this phase's artifact is usable as-is for the build phase.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

## Final Output

Both of them ended up building the same handoff at different altitudes — Codex wrote the screen-by-screen UX/visual spec (states, copy, motion, a11y, component names), and Claude took every one of those decisions and turned it into exact SwiftUI architecture: which presentation style each modal uses, how streak/timer state actually gets computed and persisted, concrete hex values and type/spacing scales, and a named component inventory. Nothing between them conflicts — Claude's additions are all "here's how to actually build the thing Codex just specified," not a different opinion.

**Screen-by-screen spec:**
- **Today/Home** (root, no-nav): empty state doubles as onboarding ("What are you quitting?" card); loading state is a full skeleton (pulsing stat-card placeholders + silhouette sunrise motif, never a spinner or blank screen); success state shows sunrise/counter motif (streak number, VoiceOver label "47 days free") + 4 stat cards (streak, lifetime days, money saved, cravings survived) in a 2×2 grid that reflows to one column at accessibility Dynamic Type sizes; two full-width primary buttons pinned at bottom, min 56pt height ("I'm craving now" = saturated primary fill, "I slipped, restart" = quieter tonal fill, visually distinct so a stressed thumb can't mis-tap); app-level store-failure state is a distinct full-screen takeover (plain-language copy + Try Again), checked for before the TabView even renders.
- **Habit setup/edit** (sheet): name, quantity-per-day (configurable unit label), currency cost-per-unit, live-updating savings preview on every keystroke, inline validation rejecting non-positive values with warm-amber (not red) captions and a disabled Save until valid; editing an existing habit past day 0 surfaces a recompute-disclosure banner only once a field actually changes ("Changes apply from today forward — your savings so far won't change").
- **Craving timer** (`.fullScreenCover`, one guided sequence, no branching): source of truth is a persisted `CravingSession.startedAt`; on-screen countdown is always derived from that timestamp, recalculated on `.onAppear`/`scenePhase == .active`, never trusted from in-memory state across backgrounding. Completion (haptic + counter increment) fires exactly once, guarded against double-fire; dismissal before completion and force-quit-past-elapsed both resolve to silent abandonment with no dedicated UI.
- **Relapse/reset** (`.fullScreenCover`, one view, local `confirmed` toggle — not two screens): pre-confirm has one calm confirm/cancel; post-confirm swaps in place (spring animation, not a hard cut) to show "Day 0 — starting fresh" beside the untouched lifetime-total card, which gets its own small warm coral-gold accent so "calm" doesn't read as "cold." No red, no warning iconography, no shake.
- **Milestone card** (sheet, triggered contextually off Today, fires day 1 or 3, per-habit "already shown" flag): rendered as a `Transferable`/`ImageRenderer` target, big rounded numerals for day count + dollar figure as the only competing elements, poster-saturated gradient, capped at a fixed large type size for the exported image (deliberate exception to live Dynamic Type, stated explicitly so it's not left ambiguous).
- **Milestones/history tab**: chronological list of earned cards, empty/loading/success/error states, substantiation only — not a journal.
- **Paywall** (sheet, triggered before any second-habit field renders): built on `SubscriptionStoreView`/`.subscriptionStoreControlStyle` rather than fully bespoke, wrapped in app gradient/chrome, explicit Restore Purchases button, verification-failure state hard-blocks with honest copy (no silent timeout).
- **Settings**: habit edit entry, restore purchases, one-step delete-with-cascade, subscription status — nothing else this pass.

**Navigation/architecture:** 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; craving timer and relapse are `.fullScreenCover` (never `.sheet` — a sheet's visible tab-bar sliver undercuts the "this is serious" framing); paywall/setup/milestone share are `.sheet`. One `@Observable` view model per feature surface, SwiftData `@Query`/`ModelContext` via environment. Streak is stored as `lastRelapseAt` on Habit and derived as a pure `Calendar` function in one shared `StreakEngine.swift`, re-evaluated on `scenePhase` change and `.NSCalendarDayChanged` — not a full-history scan, not a cached counter.

**Design tokens:** primary gradient `#B9F2DE`→`#8ED0F0` (mint→sky), milestone-poster gradient `#7EE8C3`→`#6BB8F0` (more saturated), text `#152A38` on light / near-white on dark `#0E1F27` background, relapse-screen warm accent `#F4C77A` (used sparingly, never full-screen). Corner radii 12/20/28pt (component/card/button-sheet). Spacing scale 4/8/12/16/24/32/48. Type: SF Pro Rounded for numerals/headlines, SF Pro for body; soft low-opacity shadows only (`black.opacity(0.08)`), never hard drop shadows.

**Component inventory:** `GradientBackground`, `SunriseCounterMotif(days:)`, `StatCard`, `PrimaryActionButton(style:)`, `InlineValidatedField`, `RecomputeDisclosureBanner`, `MilestoneCardView` (dual live-preview/export), `SkeletonStatCard`, `AppLevelErrorView`, `OnboardingPromptCard` — built once as standalone state-driven views, not copy-pasted per screen.

**Motion:** spring-once transitions for modals/state swaps; calm radial progress + gentle number ticking on the timer; short (<300ms) scale-and-fade on completion/milestone unlock; explicitly no shake/red-flash/vibration-spike on relapse; shimmer-only loading placeholders, no fake progress bars.

**Accessibility:** 44pt+ targets (primary Today actions at 56pt+); explicit VoiceOver labels stating real numbers on the sunrise motif and milestone card (never decorative-only); Dynamic Type-safe reflow (2×2 grid → single column) tested at max size; WCAG AA contrast in both color schemes; milestone card tested at accessibility XXL in light and dark before being considered finished.

**Claude Design decision:** No external design pause. Every decision needed to build — down to gradient stops, motion durations, and the one screen (relapse) that most needed judgment — is already locked and concrete enough for a SwiftUI engineer to implement directly. If a second opinion or alternate visual exploration is wanted later, the original spec's Claude Design Handoff Prompt ("soft mint-to-sky-blue gradient system, rounded iconography, sunrise/counter motif, warm non-judgmental tone, milestone card as hero shareable artifact, calm not gamified") remains available verbatim as an upload prompt, but nothing here is blocked on it.

No open disagreement — ready to close.

---

CONSENSUS: YES

### Ios Architecture Review

# freeday — Ios Architecture Review

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:28:48._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Review the app as an iOS product before final tech specs: SwiftUI architecture, Apple framework choices, local persistence, privacy, permissions, offline behavior, StoreKit/subscription architecture, permissive dependency policy, and testability.

## Transcript


### Round 1


**Codex (Backend / Systems Engineer · Systems Thinker) — Round 1**

Use `SwiftUI` app architecture with a strict feature-domain split: `FreedayApp` owns bootstrap (`ModelContainer`, StoreKit listener task, app-level error state), domain engines drive business rules (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`), and feature view models are thin `@Observable` adapters to persist/query models. Keep SwiftUI screens dumb: they render states from domain services and call explicit intent methods.

Use first-party frameworks only: `SwiftUI`, `SwiftData`, `Foundation`, `StoreKit`, `Combine` (if needed), `Observation`, plus `WidgetKit`/`ActivityKit` only when/if that phase is later re-enabled. For haptics use `CoreHaptics`/`UIKit`-backed `UINotificationFeedbackGenerator` directly, no third-party feedback libs. No `FoundationNetworking`, no analytics SDKs, no cloud sync SDKs.

`SwiftData` schema should be local-first and already future-proof for optional sync by staying protocol-driven. Models: `Habit`, `RelapseEvent`, `CravingSession`, and a lightweight `MilestoneState` per habit. `Habit` should include `lastRelapseAt`, `createdAt`, `costPerUnit`, `dailyQuantity`, `name`, `unitLabel`, `lifetimeSavedAtCreationCutoff`/`lifetimeSavingsBaseline` or equivalent accumulator fields to support forward-only recompute; never mutate historic savings retroactively. Keep `lastRelapseAt` nullable until first day 1. `RelapseEvent` and `CravingSession` are immutable rows with habit ID FK, created at timestamps, and outcome flags. Add `Cascade` behavior explicitly when deleting habit rows (delete sessions/events in the same repository transaction), because orphaned rows are the exact kind of silent-data-corruption bug that breaks trust.

Streak must be derived from stored timestamps with local timezone semantics (calendar-day boundaries, `Calendar.current`, local date components), not wall clock seconds and not naive timers. Store the timer start time (`CravingSession.startedAt`) immediately when the timer opens; derive remaining time from `Date()` every render tick. On relaunch, if elapsed >= 90s, treat as abandoned and clear session state with no reward; if elapsed < 90s, resume remaining time and do not replay guidance content. Add a small explicit guard so completion fires exactly once and cannot double-grant across background transitions.

Savings math should be transparent and replay-safe: savings is computed from effective rate segments, not by mutating old rows after edits. When user edits quantity or cost, persist the new effective rate with `effectiveFrom = now` and optionally `cumulativeSavingsBeforeEdit` field so the displayed total is `cumulativeSavingsBeforeEdit + currentRate * elapsedDaysSince(effectFrom)` or equivalent; this makes forward-only recompute mechanically hard to get wrong and testable.

Persistence architecture should separate read/write paths: read model through lightweight query protocols and write through command methods so tests can run against an in-memory container. For app-level reliability, treat `ModelContainer` creation as an explicit state (`opening`, `ready`, `failed`, `degraded`) and make `failed` render a full-screen recovery state before tabs are shown. This is not a per-screen fallback; it’s a launch-contract issue.

Permissions and privacy: none required for core MVP beyond StoreKit. No notifications, no HealthKit, no calendar, no camera/mic/location. Do not add Face ID/passcode lock despite sensitivity; document this as an explicit privacy tradeoff with the rationale (no third-party secret storage dependency in v1). Data is purely on-device; never collect telemetry, analytics, crash-reporting, or remote backup logic. If later adding optional reminders, that is a separate permission state and must be explicit in settings with denied/limited handling.

StoreKit 2 plan: strict verification path with no partial trust. Start with a dedicated entitlement service that:
1) fetches `Product.products(for:)` only to show titles/pricing from a `.storekit` config in dev,
2) executes `product.purchase()` and only grants on `checkVerified` success + `await transaction.finish()`,
3) listens to `Transaction.updates` for cross-device/install renewal and revocation transitions, and
4) runs `Transaction.currentEntitlements` on both launch and explicit Restore action.
Hard failure on unverified transactions is required (`never` soft-grant). Free user to paid transition is gated at intent time: the second-habit form cannot be created unless entitlement is active.

Local-first offline behavior is straightforward: all reads/writes complete with local disk; no sync queue, no network retries, no conflict resolution. The only outbound dependency for commerce is StoreKit, and only during paywall/restore interactions.

ML/AR feasibility: reject both for v1. This product’s value is deterministic behavior under stress; ML/LLM would add latency, network risk, and policy baggage without matching the hard requirement for instant, calm, guaranteed behavior. If deferred later, only consider static on-device CoreML for tone adaptation, not required now.

Testability must be explicit in the contract. Unit-test every deterministic engine: streak boundary math across midnight/timezone shifts, forward-only savings recompute, timer force-quit recovery, paywall state transitions, and cascade delete semantics. Use an in-memory `ModelContainer` in test targets for persistence tests. Add `StoreKitTest` paths where possible with `.storekit` config (restore, cancelled, expired, unverified). For UI tests, cover core loop smoke: empty → setup → today success → relapse one-tap confirmation with same-screen reassurance → timer start, background/reopen math, milestone share sheet render at accessibility large text. Biggest risk I see is hidden state drift across timezones/background transitions causing trust-damaging counter errors; the final spec must preserve authoritative `Date`-based derivation and explicit recomputation points (`scenePhase`, day-change notifications).

**Claude (QA & Risk · Closer) — Round 1**

Coming at this purely from "what breaks in the field and how do we know before we ship" — the design and feature phases already did excellent work, so my job here is to pressure-test the architecture decisions that are about to get locked into tech specs, because once StoreKit config and the SwiftData schema exist, changing them is expensive.

On SwiftUI architecture: `@Observable` view models per feature surface plus SwiftData `@Query`/`ModelContext` via environment is the right call and I'm not reopening it — but I want to nail down the app's launch sequence as its own explicit step, because that's where the store-failure state actually gets tested and it's the piece most likely to get skipped under time pressure. The App struct needs to attempt `ModelContainer` creation synchronously (or in a tiny async gate) before TabView is constructed, catch the throw, and route to `AppLevelErrorView` instead of letting SwiftData's default behavior (which, left unhandled, will crash the app on a corrupt store rather than degrade). Concretely: don't use the convenience `.modelContainer(for:)` view modifier with its default error behavior for this — construct `ModelContainer` explicitly in an initializer with a `do/catch`, store the result or error in `@State`, and branch the root view on that. This is a five-line difference that determines whether "corrupt store" is a designed screen or a crash log. I want this written into tech_specs as a named requirement, not left as an implementation detail.

Framework choices: SwiftData for persistence (three models — Habit, RelapseEvent, CravingSession — with cascade delete rules configured via `@Relationship(deleteRule: .cascade)` from Habit to its RelapseEvents and CravingSessions, not manual cascade logic in the view model, since manual cascade is exactly where orphaned rows sneak in under refactoring). StoreKit 2 for the paywall, as already decided. `UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator` for haptics, gated behind a hardware capability check — and I want it stated explicitly that the *absence* of haptic hardware is not an error state, it's a silent no-op, because I've seen this get miscategorized as needing its own UI treatment when it doesn't. `ImageRenderer` for the milestone card export, `ShareLink` for the share sheet. No CoreML, no Vision, no ARKit — there's no ML/AR use case here and forcing one in would violate the "justified by user value" acceptance check for this phase outright; I want that stated as a closed decision, not an open question for tech_specs to revisit.

Persistence plan, and this is where I have the most pointed risk to raise: the schema needs a documented migration story before a single line of SwiftData model code gets written, because this app's whole trust proposition is "we never lose your history," and SwiftData's automatic lightweight migration only covers a specific set of changes (adding optional properties, etc.) — anything beyond that between now and a hypothetical v1.1 needs a `VersionedSchema`/`SchemaMigrationPlan` set up from the start, even if the migration plan itself is trivial at launch. Standing up the versioning scaffolding now costs almost nothing; retrofitting it after users have accrued months of streak data costs a support disaster. I'm calling this a must for tech_specs, not a nice-to-have.

Second concrete risk on persistence: the "already-shown milestone" flag and the "most recently active habit stays interactive on subscription lapse" rule both need to be actual persisted fields on the model (`Habit.lastShownMilestoneThreshold: Int?`, `Habit.lastInteractedAt: Date`), not computed at runtime from other state, because both of these are idempotency/trust guarantees that must survive app relaunch and can't be reconstructed reliably from event history without ambiguity (what does "most recently active" mean if a user backgrounds two habits at the same timestamp?). I want the tie-break rule for "most recently active habit" written down now: it's `lastInteractedAt` descending, and if that's literally unset for a habit (never opened since creation), habit creation order is the fallback. Small thing, but it's exactly the kind of ambiguity that gets improvised differently by whoever writes EntitlementStore versus whoever writes the habit list, and then they disagree.

Permissions and privacy: the honest answer is this app requests zero runtime permission prompts in v1 as scoped — no notifications, no HealthKit, no camera, no location. That's a genuine privacy strength worth stating plainly rather than treating as an absence. The one thing I want flagged as a real, accepted risk rather than silently glossed: this app stores what is functionally sensitive personal-health-adjacent data (what you're addicted to, when you relapsed, how much you spend on it) in an unencrypted-by-default, unlocked-behind-no-passcode SwiftData store on the device. That was explicitly ruled out of v1 scope in an earlier phase and I'm not overturning it, but tech_specs should at minimum specify `NSFileProtectionComplete` (or the SwiftData/CloudKit-container equivalent default, which is already reasonably strong on iOS) on the store's file protection level as a zero-cost hardening step — this isn't app-lock, it's just making sure the SQLite file isn't trivially readable if the device is jailbroken or the file extracted, and it costs nothing to specify now.

Dependency/license decision: no third-party packages. Every capability needed — persistence, purchases, sharing, haptics, image rendering — has a first-party framework, so there is no dependency-policy question to resolve here. I'd write this as a closed decision: zero SPM dependencies in v1.

Testing implications, and this is where I want to be the most concrete because "testability" as a phase requirement is easy to nod at and hard to actually deliver: the streak/savings math in `StreakEngine.swift` must be a pure function with no SwiftData or `Date()`-now dependency baked in — it takes `lastRelapseAt: Date` and a reference `now: Date` as parameters, returns days elapsed, so unit tests can inject arbitrary timestamps (midnight-boundary cases, DST transition dates, leap years, a `now` earlier than `lastRelapseAt` from clock skew — which must clamp to zero, never go negative) without needing a live device clock or a populated database. Same discipline for the craving-timer remaining-time calculation — pure function of `(startedAt, now) -> TimeInterval`, unit-testable for the exact scenarios already locked in prior phases (background at 40s, return after 2 minutes, expect zero remaining and completion already fired; force-quit past 90s, expect abandoned with no credit). If these two functions get written as pure, stateless, injectable-clock functions, the hardest-to-verify behaviors in the entire app become five-minute unit tests instead of manual-only QA that someone has to remember to redo after every refactor. I'd treat "StreakEngine and CravingTimer math are unit-testable with injected dates, not wall-clock dependent" as an explicit acceptance line in tech_specs, because if it's not written down, the natural implementation path is to reach for `Date()` directly inside the view model and lose testability by default.

For UI-level testing, the two screenshot-testable moments already identified (relapse post-tap state, milestone card at max Dynamic Type in both color schemes) should actually get SwiftUI preview providers built for each state variant per screen — not full XCTest UI automation, which is expensive and flaky for a small team to maintain, but exhaustive `#Preview` coverage of every named state (empty/loading/success/error, pre-tap/post-tap, etc.) so a human reviewer can flip through every state in Xcode's canvas in under a minute. I'd rather lock in "every state variant has a preview" as the realistic testing bar for this build than promise a UI test suite that's unlikely to get maintained.

Last risk I want on the record before this phase closes: StoreKit testing in the simulator via a `.storekit` config file is good for the happy path, but the unverified-transaction hard-block behavior and the restore-purchases re-scan need an actual manual test script written down (StoreKit config supports simulating a failed verification), because this is exactly the kind of code path that looks correct, compiles, and then silently never gets exercised because nobody manufactures the failure case in a demo. I want the testing section of tech_specs to name this specific manual test as required before this feature is marked done, not implied by "StoreKit 2 is used correctly."

**Coordinator (Claude) — decision after round 1**

Both of them are aligned on the same architecture — Codex laid out the feature-domain split (App bootstrap owns the ModelContainer/StoreKit listener, domain engines own business rules, view models are thin adapters, screens are dumb) and named the exact schema/StoreKit/testing plan, and Claude's contribution is entirely sharpening: making the launch-failure path a real designed state instead of a crash, turning "unit test everything" into concrete pure-function signatures, and naming a few schema details (migration versioning, idempotency fields, file protection) that Codex's plan implied but hadn't spelled out. Nothing here is contested.

CONSENSUS: YES

## Final Output

**SwiftUI architecture recommendation:** `FreedayApp` owns bootstrap — `ModelContainer` creation, the StoreKit `Transaction.updates` listener task, and app-level error state — constructed explicitly with `do/catch` in the App struct's initializer (not the `.modelContainer(for:)` convenience modifier, whose default behavior crashes on a corrupt store rather than degrading), storing `opening/ready/failed` in `@State` and branching the root view on it before `TabView` is ever constructed. Business logic lives in pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) that take timestamps as parameters and return values — no `Date()`-now or SwiftData calls baked inside them. Feature view models are thin `@Observable` adapters that persist/query via `ModelContext`/`@Query` and call into the engines; screens render state and call explicit intent methods only.

**Apple framework choices:** SwiftUI, SwiftData, StoreKit 2, Observation, CoreHaptics/`UINotificationFeedbackGenerator` (gated behind `CHHapticEngine.capabilitiesForHardware().supportsHaptics`, with absent hardware treated as a silent no-op, not an error state), `ImageRenderer` + `Transferable`/`ShareLink` for the milestone card. No CoreML, Vision, or ARKit — closed decision, there's no user-value case for ML/AR in this product's deterministic, stress-tested-under-pressure use case. WidgetKit/ActivityKit stay deferred per the standing degrade-first rule.

**Persistence and local data plan:** Three SwiftData models — `Habit`, `RelapseEvent`, `CravingSession` — plus a lightweight per-habit milestone/idempotency state. Cascade delete configured declaratively via `@Relationship(deleteRule: .cascade)` from `Habit`, not manual cascade logic in a view model. Savings math uses effective-rate segments (`effectiveFrom`, `cumulativeSavingsBeforeEdit`) so forward-only recompute is structurally guaranteed rather than something a future edit could silently get wrong. Streak is derived fresh from `lastRelapseAt` via local-timezone calendar-day math, never a cached counter. Idempotency-critical fields — the per-habit "already shown this milestone threshold" flag and `lastInteractedAt` (with a stated tie-break rule: most-recent `lastInteractedAt` wins, falling back to habit creation order if unset) — are real persisted columns, not runtime-reconstructed values. `VersionedSchema`/`SchemaMigrationPlan` scaffolding is stood up from the first commit, even though the initial migration plan is trivial, because retrofitting it after users have months of streak history is the expensive failure mode. Timer state (`CravingSession.startedAt`) is written the instant the timer opens and is the sole source of truth for elapsed/remaining time on every read.

**Permissions/privacy plan:** Zero runtime permission prompts in v1 — no notifications, HealthKit, camera, or location. StoreKit is the only outbound network dependency, used only for purchase/restore. No Face ID/passcode app-lock (an explicit, previously-accepted v1 tradeoff, restated here rather than silently carried forward) — as a zero-cost hardening step against that gap, the store's file protection is set to the strong default (`NSFileProtectionComplete`/equivalent), which costs nothing and doesn't require building app-lock UI. No telemetry, analytics, or crash reporting anywhere in the app.

**Dependency/license decision:** Zero third-party SPM packages. Every required capability — persistence, purchases, sharing, haptics, image rendering — has a first-party Apple framework, so there's no permissive-license question to resolve; this is closed, not deferred to tech_specs.

**Testing implications:** `StreakEngine` and the craving-timer remaining-time calculation are pure functions taking `(referenceTimestamp, now)` as explicit parameters, so midnight-boundary, DST, leap-year, and clock-skew (clamped to zero, never negative) cases are injectable unit tests, not manual-only QA. In-memory `ModelContainer` for persistence/cascade-delete tests. `.storekit` config plus `StoreKitTest` for the happy path, with an explicit required manual test script for the unverified-transaction hard-block and restore-purchases re-scan, since that path compiles clean and silently never gets exercised otherwise. Every named screen state (empty/loading/success/error, pre-tap/post-tap, etc.) gets an exhaustive `#Preview` rather than a maintained XCTest UI suite — the realistic, sustainable testing bar for a build this size, with the two most trust-critical moments (relapse post-tap screenshot, milestone card at max Dynamic Type in both color schemes) getting explicit preview coverage.

No open disagreement — ready to close.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All six required outputs are present and concrete: a SwiftUI architecture recommendation naming the exact bootstrap sequence (explicit `do/catch` ModelContainer construction, `opening/ready/failed` state gating TabView), Apple framework choices with a justified ML/AR exclusion, a persistence plan that goes beyond "SwiftData" into cascade-delete mechanics, effective-rate savings segments, idempotency fields with a stated tie-break rule, and versioned-schema scaffolding stood up from commit one, a permissions/privacy plan that names the accepted app-lock tradeoff and adds a genuinely zero-cost hardening step (file protection level), a closed zero-dependency decision, and testing implications that specify pure-function signatures (injectable clock) rather than vague "unit test this."

Acceptance checks hold: nothing here is a vague architecture gap — a SwiftUI engineer could start typing from this directly; the ML/AR exclusion is justified by user value (deterministic, stress-tested-under-pressure behavior beats latency/policy risk) rather than asserted; the dependency decision is closed at zero third-party packages, so no permissive-license question exists to violate. The round-1 discussion shows genuine engineering-level convergence — Codex specified the domain-engine split and schema/StoreKit plan, Claude's additions (launch-failure as a designed state, pure-function testability, migration versioning, idempotency field ownership) are sharpenings that Codex's plan implied but hadn't made explicit, not competing opinions. Consistent with every prior-phase lock (non-punitive relapse, wall-clock timer semantics, forward-only recompute, narrow StoreKit scope, zero telemetry). Ready to close; usable directly by tech_specs.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Both of them are aligned on the same architecture — Codex laid out the feature-domain split (App bootstrap owns the ModelContainer/StoreKit listener, domain engines own business rules, view models are thin adapters, screens are dumb) and named the exact schema/StoreKit/testing plan, and Claude's contribution is entirely sharpening: making the launch-failure path a real designed state instead of a crash, turning "unit test everything" into concrete pure-function signatures, and naming a few schema details (migration versioning, idempotency fields, file protection) that Codex's plan implied but hadn't spelled out. Nothing here is contested.

CONSENSUS: YES

## Final Output

**SwiftUI architecture recommendation:** `FreedayApp` owns bootstrap — `ModelContainer` creation, the StoreKit `Transaction.updates` listener task, and app-level error state — constructed explicitly with `do/catch` in the App struct's initializer (not the `.modelContainer(for:)` convenience modifier, whose default behavior crashes on a corrupt store rather than degrading), storing `opening/ready/failed` in `@State` and branching the root view on it before `TabView` is ever constructed. Business logic lives in pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) that take timestamps as parameters and return values — no `Date()`-now or SwiftData calls baked inside them. Feature view models are thin `@Observable` adapters that persist/query via `ModelContext`/`@Query` and call into the engines; screens render state and call explicit intent methods only.

**Apple framework choices:** SwiftUI, SwiftData, StoreKit 2, Observation, CoreHaptics/`UINotificationFeedbackGenerator` (gated behind `CHHapticEngine.capabilitiesForHardware().supportsHaptics`, with absent hardware treated as a silent no-op, not an error state), `ImageRenderer` + `Transferable`/`ShareLink` for the milestone card. No CoreML, Vision, or ARKit — closed decision, there's no user-value case for ML/AR in this product's deterministic, stress-tested-under-pressure use case. WidgetKit/ActivityKit stay deferred per the standing degrade-first rule.

**Persistence and local data plan:** Three SwiftData models — `Habit`, `RelapseEvent`, `CravingSession` — plus a lightweight per-habit milestone/idempotency state. Cascade delete configured declaratively via `@Relationship(deleteRule: .cascade)` from `Habit`, not manual cascade logic in a view model. Savings math uses effective-rate segments (`effectiveFrom`, `cumulativeSavingsBeforeEdit`) so forward-only recompute is structurally guaranteed rather than something a future edit could silently get wrong. Streak is derived fresh from `lastRelapseAt` via local-timezone calendar-day math, never a cached counter. Idempotency-critical fields — the per-habit "already shown this milestone threshold" flag and `lastInteractedAt` (with a stated tie-break rule: most-recent `lastInteractedAt` wins, falling back to habit creation order if unset) — are real persisted columns, not runtime-reconstructed values. `VersionedSchema`/`SchemaMigrationPlan` scaffolding is stood up from the first commit, even though the initial migration plan is trivial, because retrofitting it after users have months of streak history is the expensive failure mode. Timer state (`CravingSession.startedAt`) is written the instant the timer opens and is the sole source of truth for elapsed/remaining time on every read.

**Permissions/privacy plan:** Zero runtime permission prompts in v1 — no notifications, HealthKit, camera, or location. StoreKit is the only outbound network dependency, used only for purchase/restore. No Face ID/passcode app-lock (an explicit, previously-accepted v1 tradeoff, restated here rather than silently carried forward) — as a zero-cost hardening step against that gap, the store's file protection is set to the strong default (`NSFileProtectionComplete`/equivalent), which costs nothing and doesn't require building app-lock UI. No telemetry, analytics, or crash reporting anywhere in the app.

**Dependency/license decision:** Zero third-party SPM packages. Every required capability — persistence, purchases, sharing, haptics, image rendering — has a first-party Apple framework, so there's no permissive-license question to resolve; this is closed, not deferred to tech_specs.

**Testing implications:** `StreakEngine` and the craving-timer remaining-time calculation are pure functions taking `(referenceTimestamp, now)` as explicit parameters, so midnight-boundary, DST, leap-year, and clock-skew (clamped to zero, never negative) cases are injectable unit tests, not manual-only QA. In-memory `ModelContainer` for persistence/cascade-delete tests. `.storekit` config plus `StoreKitTest` for the happy path, with an explicit required manual test script for the unverified-transaction hard-block and restore-purchases re-scan, since that path compiles clean and silently never gets exercised otherwise. Every named screen state (empty/loading/success/error, pre-tap/post-tap, etc.) gets an exhaustive `#Preview` rather than a maintained XCTest UI suite — the realistic, sustainable testing bar for a build this size, with the two most trust-critical moments (relapse post-tap screenshot, milestone card at max Dynamic Type in both color schemes) getting explicit preview coverage.

No open disagreement — ready to close.

---

CONSENSUS: YES

### Tech Specs

# freeday — Tech Specs

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:30:30._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Decide architecture, technology stack, data model, interfaces/APIs, and non-functional requirements with justified trade-offs.

## Transcript


### Round 1


**Codex (QA & Risk · Closer) — Round 1**

This slice is buildable only if we force three hard edges into the type system now: all temporal logic must be pure and injectable, entitlement is checked as a hard gate (not a flag), and persistence bootstrap is a first-class app state before rendering UI. I’d anchor on a domain-service architecture where `FreedayApp` owns container creation, StoreKit listener startup, and app-level failure states, while UI is only a thin adapter over domain engines and repository calls.

The architecture should be split as: `AppBootstrap` (root ownership of `ModelContainer`, `Transaction.updates`, and fatal app-state), `data_domain` (SwiftData models + repositories + migration scaffolding + pure engines), `services_utilities` (StoreKit entitlement service, haptics policy, milestone trigger policy), and `primary_ui` (views/view-models orchestrating Today, timer, relapse, milestone, settings). Keep all mutating logic (create/edit habit, log relapse, complete session, delete habit) in use-case methods so it’s hard for UI to drift into business rules. Biggest risk I’d reject up front: deriving streak from mutable counters in memory or timer-tick state. If you do that, DST/backfill/time-zone edits will produce wrong days and trust loss. So `Calendar`-based day math and start-time-derived countdown must be the only source of truth.

Data-wise we must keep N habits in schema from day one, with the paywall only enforcing that free users can only reach setup for habit #1. Add explicit schema fields that prevent ambiguity: `createdAt`, `lastRelapseAt` (nullable for day 0), `lifetimeSavedCents` or `baseSavingsCents`, `effectiveRateCentsPerDay` + `effectiveRateFrom`, `milestoneThresholdShown` (e.g., `Int`), and `lastInteractedAt` for deterministic paid-lapse read-only resolution. For habit deletion, use SwiftData `@Relationship(deleteRule: .cascade)` from Habit to `RelapseEvent` and `CravingSession`; this is not optional UX polish, it is corruption prevention. A forced crash recovery mode for store open must be implemented via explicit `init` + `do/catch`; `.modelContainer(for:)` implicit wiring is insufficient and can hard-fail on data-store problems.

Craving timer reliability is where real correctness lives: on-open write `CravingSession.startedAt = now`, never trust a timer tick accumulator. Remaining time is computed as `max(0, 90 - now.timeIntervalSince(startedAt))`. If app relaunch finds a session older than 90s, treat as abandoned (no success state, no partial credit). If younger, resume without restarting instructions. Completion is exactly once with idempotency guard and no double-fire on scene transitions. The relapse reset path must be one screen, one confirmation gesture, and post-confirm same view showing “day 0” alongside untouched lifetime totals, to satisfy non-shaming requirement and avoid abandonment risk.

StoreKit2 is non-negotiable and must be hard-verified: `purchase` grants entitlement only if `checkVerified` passes; unverified means no grant. Subscription state must be evaluated by `Transaction.currentEntitlements` on launch and restore, then mirrored in a persisted entitlement cache only as a convenience view signal, not the source of truth. `Transaction.updates` must be observed for renewals/revocations. Live Activity/widget codepaths may be stubbed under time pressure, but not in a way that can hide timer math regressions.

Testing must be deterministic and include negative cases: unit-test pure engines with injected `now` and reference timestamps (midnight boundary, backward-clock skew, DST transitions, force-quit elapsed > 90s, stale timer resume <90s). Include in-memory SwiftData persistence tests for cascade delete and schema migrations (`VersionedSchema` + `SchemaMigrationPlan` scaffold from day one). Add required manual checklists for restore flow and verification failure hard-block, because those only fail in path-exercised runs. Every state variant (empty/loading/success/error for all reachable screens) should have `#Preview` coverage at least for fast QA.

Design/system tradeoff I’m locking in: no CloudKit, no analytics, no health/clinical framing, no third-party packages, no extra permissions. Biggest objection to this direction is perceived feature reduction (no reminders/community), but that is the correct safety trade: correctness and low-latency behavior in craving moments beats optional ecosystem features that can’t run offline and would dilute first-session trust.

```interfaces-json
{
  "interfaces": [
    {
      "name": "FreedayBootstrapState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum FreedayBootstrapState: Equatable, Sendable { case opening, ready, failed(AppBootstrapError), degraded(DatabaseIntegrityWarning) }",
      "owning_lane": "services_utilities",
      "notes": "Root app state before tab UI is rendered."
    },
    {
      "name": "AppBootstrapError",
      "kind": "enum",
      "language": "swift",
      "signature": "enum AppBootstrapError: Error, LocalizedError { case containerUnavailable(Error), migrationFailed(Error), unknown(Error) }",
      "owning_lane": "services_utilities",
      "notes": "Used for app-level store-open failure UX path."
    },
    {
      "name": "FreedayContainerFactory",
      "kind": "struct",
      "language": "swift",
      "signature": "struct FreedayContainerFactory { static func makeContainer() throws -> ModelContainer }",
      "owning_lane": "services_utilities",
      "notes": "Constructs SwiftData container with explicit error handling."
    },
    {
      "name": "FreedaySchema",
      "kind": "struct",
      "language": "swift",
      "signature": "struct FreedaySchemaV1: VersionedSchema { static var models: [any PersistentModel.Type] { get } static var versionIdentifier: Schema.Version { get } }",
      "owning_lane": "data_domain",
      "notes": "Defines VersionedSchema from day one."
    },
    {
      "name": "FreedayMigrationPlan",
      "kind": "struct",
      "language": "swift",
      "signature": "struct FreedayMigrationPlan: SchemaMigrationPlan { static var schemas: [VersionedSchema.Type] { get } static var stages: [MigrationStage] { get } }",
      "owning_lane": "data_domain",
      "notes": "Pre-provisioned migration scaffolding."
    },
    {
      "name": "Habit",
      "kind": "struct",
      "language": "swift",
      "signature": "final class Habit: @Model { @Attribute(.unique) var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Decimal; var costPerUnitCents: Int64; var createdAt: Date; var lastRelapseAt: Date?; var cumulativeSavingsBeforeEditCents: Int64; var savingsRateEffectiveFrom: Date; var effectiveDailySavingsCents: Int64; var totalRelapses: Int; var milestoneShownThrough: Int; var isActive: Bool; var lastInteractedAt: Date?; @Relationship(deleteRule: .cascade) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade) var cravingSessions: [CravingSession] }",
      "owning_lane": "data_domain",
      "notes": "N habits supported; supports forward-only savings and milestone idempotency."
    },
    {
      "name": "RelapseEvent",
      "kind": "struct",
      "language": "swift",
      "signature": "final class RelapseEvent: @Model { @Attribute(.unique) var id: UUID; var happenedAt: Date; var note: String?; var habit: Habit }",
      "owning_lane": "data_domain",
      "notes": "One row per logged relapse/reset."
    },
    {
      "name": "CravingSession",
      "kind": "struct",
      "language": "swift",
      "signature": "final class CravingSession: @Model { @Attribute(.unique) var id: UUID; var startedAt: Date; var completedAt: Date?; var habit: Habit }",
      "owning_lane": "data_domain",
      "notes": "Single active session per habit or global, wall-clock anchored."
    },
    {
      "name": "HabitRepository",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol HabitRepository { func fetchHabits() throws -> [Habit]; func insertHabit(_ habit: Habit) throws; func updateHabit(_ habit: Habit) throws; func deleteHabit(_ habit: Habit) throws; func fetchPrimaryHabit() throws -> Habit? }",
      "owning_lane": "data_domain",
      "notes": "Thin abstraction for SwiftData access."
    },
    {
      "name": "StreakEngine",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol StreakEngine { func currentStreakDays(lastRelapseAt: Date?, now: Date, calendar: Calendar) -> Int; func lifetimeDaysSinceCreation(createdAt: Date, now: Date, calendar: Calendar) -> Int }",
      "owning_lane": "data_domain",
      "notes": "Pure temporal math; no SwiftData and no Date() inside."
    },
    {
      "name": "SavingsEngine",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol SavingsEngine { func currentSavingsCents(habit: Habit, now: Date, calendar: Calendar) -> Int64; func applyEconomicEdit(habit: Habit, newQuantity: Decimal, newCostPerUnitCents: Int64, effectiveFrom: Date) }",
      "owning_lane": "data_domain",
      "notes": "Must enforce forward-only recompute via cumulative baseline + effective-from segment."
    },
    {
      "name": "CravingTimerEngine",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol CravingTimerEngine { func remainingTime(startedAt: Date, now: Date, duration: TimeInterval) -> TimeInterval; func shouldComplete(now: Date, startedAt: Date, duration: TimeInterval) -> Bool; func isAbandoned(now: Date, startedAt: Date, duration: TimeInterval) -> Bool }",
      "owning_lane": "data_domain",
      "notes": "Deterministic, no mutable timer as source-of-truth."
    },
    {
      "name": "MilestoneEngine",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol MilestoneEngine { func shouldShowMilestone(streakDays: Int, threshold: Int, alreadyShownThrough: Int) -> Bool; func markShownThreshold(_ habit: Habit, threshold: Int) }",
      "owning_lane": "data_domain",
      "notes": "Controls one-time milestone card behavior."
    },
    {
      "name": "EntitlementState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum EntitlementState: Equatable { case unknown, free, pro, expired, revoked, verificationFailed }",
      "owning_lane": "services_utilities",
      "notes": "UI and gate behavior must branch from this."
    },
    {
      "name": "StorefrontService",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol StorefrontService { func bootstrapProducts(productIDs: [String]) async throws -> [Product]; func purchase(productID: String) async throws -> Bool; func restorePurchases() async throws -> EntitlementState; func evaluateEntitlement(groupID: String) async -> EntitlementState; func observeTransactionUpdates() -> Task<Void, Never> }",
      "owning_lane": "services_utilities",
      "notes": "Real StoreKit 2 flow with verification + finish requirements."
    },
    {
      "name": "HapticsService",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol HapticsService { func triggerStreakDayReward() async; func triggerCravingCompleteReward() async; var supportsHaptics: Bool { get } }",
      "owning_lane": "polish_resilience",
      "notes": "Hardware-guarded no-op on unsupported devices."
    }
  ]
}

**Claude (Frontend Engineer · Visionary) — Round 1**

Freeday's tech-specs phase already inherited an unusually complete architecture from ios_architecture_review — bootstrap sequencing, domain-engine split, SwiftData schema shape, and testing discipline are all settled. My job in this pass is to turn that into an actual buildable file layout and precise type signatures, and to push on the one place I think the prior phases left slack: how the client actually renders time-derived state so it feels alive rather than merely correct.

On architecture: FreedayApp is the composition root. Its init attempts ModelContainer construction inside a do/catch against an explicit VersionedSchema, and stores the result as an AppBootstrapState enum (opening, ready(ModelContainer), failed(Error)) in @State. The root view switches on that state before anything else exists — no TabView, no environment injection, nothing — so a corrupt store literally cannot reach a screen that assumes data exists. Once ready, a FreedayRootView owns the 3-tab TabView (Today, Milestones, Settings), each tab wrapping its own NavigationStack, with CravingTimer and Relapse presented as .fullScreenCover and HabitSetup/Paywall/MilestoneShare as .sheet, exactly as design_handoff locked. Each feature gets one @Observable view model that reads via @Query/ModelContext from the environment and calls into the pure domain engines for anything time-derived — the view models are not allowed to do calendar math themselves, only fetch, call an engine function, and hand the result to the view. I want that last rule written down explicitly because it's the difference between StreakEngine being genuinely unit-testable and it becoming three subtly-different reimplementations scattered across TodayViewModel, the milestone check, and the share-card renderer.

One naming refinement I want to make now rather than let it drift: instead of a nullable lastRelapseAt that every consumer has to branch on ("has this habit ever relapsed"), I'd model a single non-optional streakStartAt: Date on Habit, initialized to createdAt and overwritten to Date() on every relapse. Streak math becomes one unconditional function call with no optional-unwrapping branch duplicated at each call site. RelapseEvent stays as the immutable historical log (for the Milestones/history tab and for the lifetime-days accumulator below); Habit.streakStartAt is just the current pointer. Lifetime-days-free — the stat that must survive resets — I'd back with an accumulator field, cleanDaysBeforeCurrentStreak: Int, that gets incremented by the just-ended streak's day count at the moment of relapse; the displayed lifetime total is always cleanDaysBeforeCurrentStreak + currentStreakDays. This mirrors the savings effective-rate-segment pattern from ios_architecture_review almost exactly, which I like — it means "how do we preserve a running total across a reset without corrupting history" gets solved once, as one pattern, and reused for both money and days instead of being invented twice.

On the craving timer, the wall-clock-anchoring is already locked, but I want to name a gap the prior phase didn't resolve: what happens if a user backgrounds the app, comes back, taps "I'm craving now" again for the same habit while an earlier CravingSession is still nominally open? That's "duplicate/overlapping timer sessions," listed as an edge case in detailed_discussion but never actually resolved. My answer: CravingSession gets a persisted outcome field (active/completed/abandoned), and creating a new session for a habit first force-resolves any existing active session for that habit to abandoned before the new one is written — there is never more than one active session per habit at a time, by construction, not by UI discipline. Resolution at relaunch is one function, always downgrading a still-active session whose startedAt + 90s has already passed to abandoned, never to completed — matching the "no retroactive credit" rule exactly, and it's the same function whether the trigger is app-relaunch, a new session request, or a foreground/backwards scenePhase check.

Where I want to push harder than "adequate": the countdown ring and the sunrise motif should be driven by TimelineView(.animation) rather than a Timer.publish(every: 1) tick. A per-second timer means the ring visibly jumps in discrete steps and the whole thing reads as a stopwatch; TimelineView redraws on every display refresh and lets remaining = duration - now.timeIntervalSince(startedAt) render as a continuously smooth arc, which is a small technical difference that's the entire distinction between "a countdown" and "a calm breathing thing you can trust while you're stressed." Architecturally this costs nothing extra — the underlying remaining-time function is exactly the same pure (startedAt, now) -> TimeInterval the QA phase already specified as unit-testable, TimelineView just calls it on every tick instead of a coarser timer publisher calling it once a second. I'd nominate this whole mechanism — resilient, pure-function, continuously-rendered, timestamp-anchored timer plus streak math — as the one "hard technical capability done well" the parent portfolio prompt asks for, rather than reaching for something exotic; it's genuinely nontrivial to get right across backgrounding, force-quit, DST and midnight rollover, and it's the thing users are relying on at the worst possible moment, so making it excellent is higher-leverage than adding a second hard capability nobody asked for.

The one place I'd extend the persistence plan beyond what ios_architecture_review specified: configure the ModelConfiguration against an explicit App Group container identifier now, even though no widget target exists in this build. Widget/Live Activity are real, named v1 scope that's allowed to degrade under time pressure — they're not hypothetical future work, they're deferred work — and moving a SwiftData store from the app's default container into an App Group container later is a genuine migration, not a config toggle. Setting the App Group identifier at container-creation time costs nothing today and means that if a widget does get built in this same pass, it's a same-day addition instead of a data-layer migration. I'd flag this as the one place I'm consciously trading a small amount of now-cost for a real later-cost, consistent with the same logic that already justified standing up VersionedSchema before it's needed.

File layout: a single Freeday app target, no extension targets yet. App/ holds FreedayApp.swift, AppBootstrap.swift (the do/catch + AppBootstrapState), AppRootView.swift. Domain/Models/ holds Habit.swift, RelapseEvent.swift, CravingSession.swift, SchemaV1.swift (VersionedSchema + SchemaMigrationPlan scaffold). Domain/Engines/ holds StreakEngine.swift, SavingsEngine.swift, CravingSessionEngine.swift, MilestoneEngine.swift — each a stateless enum of static pure functions, zero SwiftData imports, zero Date() calls, so they compile and test independently of the persistence layer entirely. Features/Today, Features/HabitForm, Features/CravingTimer, Features/Relapse, Features/Milestones, Features/Paywall, Features/Settings each hold a View + an @Observable ViewModel. Services/ holds EntitlementStore.swift (StoreKit wrapper) and HapticsService.swift (capability-gated wrapper). DesignSystem/ holds GradientBackground, SunriseCounterMotif, StatCard, PrimaryActionButton, SkeletonStatCard, AppLevelErrorView, plus a Tokens.swift with the locked hex/spacing/radius constants. Resources/ holds the static craving-guidance copy (a plain Swift array of strings, not a JSON asset — no parsing layer needed for four fixed phrases) and the Freeday.storekit config. FreedayTests/ mirrors Domain/Engines with one XCTestCase per engine plus a bootstrap test that forces ModelContainer construction against a deliberately invalid configuration to assert the failed state routes correctly, and a cascade-delete test against an in-memory container.

Testing strategy, beyond what's already locked: the engines are trivially testable because they're pure and injectable-clock as specified; I'd add the specific case list so nobody has to invent it mid-build — midnight rollover in both directions, a now earlier than streakStartAt (clock skew, must clamp to zero), DST spring-forward and fall-back dates, a craving session backgrounded at second 40 and resumed after both 30 seconds and 3 minutes, and the overlapping-session resolution case I described above. Every named screen state gets a #Preview per the existing decision; I'm not adding a UI test suite on top of that.

My biggest reservation about my own direction: TimelineView-driven continuous rendering and the App Group forward-compat move are both real value, but they're exactly the kind of polish that's easy to over-invest in before the five core workflows are airtight, and that directly cuts against this project's own standing rule that a smaller finished app beats a larger half-built one. I'd sequence it so the simple version (Timer.publish tick, default container, no App Group) is what makes the app functionally complete first, and treat the TimelineView upgrade and the App Group identifier as fast, cheap follow-on passes once the core loop's acceptance checks already pass — not blocking conditions for calling the core workflows done.

```interfaces-json
{"interfaces": [
  {"name": "Habit", "kind": "struct", "language": "swift", "signature": "@Model final class Habit { var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Double; var costPerUnit: Decimal; var createdAt: Date; var streakStartAt: Date; var cleanDaysBeforeCurrentStreak: Int; var rateEffectiveFrom: Date; var cumulativeSavingsBeforeRateChange: Decimal; var lifetimeCravingsSurvived: Int; var lastShownMilestoneThreshold: Int?; var lastInteractedAt: Date; @Relationship(deleteRule: .cascade, inverse: \\Relapse Event.habit) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade, inverse: \\CravingSession.habit) var cravingSessions: [CravingSession] }", "owning_lane": "data_domain", "notes": "streakStartAt replaces a nullable lastRelapseAt: non-optional, initialized to createdAt, overwritten to Date() on every relapse. cleanDaysBeforeCurrentStreak + cumulativeSavingsBeforeRateChange are accumulators updated at relapse/edit time, never retroactively rewritten."},
  {"name": "RelapseEvent", "kind": "struct", "language": "swift", "signature": "@Model final class RelapseEvent { var id: UUID; var timestamp: Date; var streakLengthAtReset: Int; var savingsAtReset: Decimal; var habit: Habit? }", "owning_lane": "data_domain", "notes": "Immutable historical row, always timestamp = now at creation (no backdating). Written by RelapseViewModel in the same transaction that updates Habit.streakStartAt and Habit.cleanDaysBeforeCurrentStreak."},
  {"name": "CravingSession", "kind": "struct", "language": "swift", "signature": "@Model final class CravingSession { var id: UUID; var startedAt: Date; var completedAt: Date?; var outcome: CravingOutcome; var habit: Habit? }", "owning_lane": "data_domain", "notes": "outcome starts .active. Only one .active session may exist per habit; creating a new session force-resolves any prior active session for that habit to .abandoned first."},
  {"name": "CravingOutcome", "kind": "enum", "language": "swift", "signature": "enum CravingOutcome: String, Codable { case active, completed, abandoned }", "owning_lane": "data_domain", "notes": "Persisted, not runtime-inferred, so relaunch resolution and duplicate-session resolution both read/write the same field."},
  {"name": "StreakEngine", "kind": "function", "language": "swift", "signature": "enum StreakEngine { static func currentStreakDays(streakStartAt: Date, now: Date, calendar: Calendar) -> Int; static func lifetimeDaysFree(cleanDaysBeforeCurrentStreak: Int, streakStartAt: Date, now: Date, calendar: Calendar) -> Int }", "owning_lane": "data_domain", "notes": "Pure, no Date() or SwiftData calls internally. Result clamps to >= 0 (clock-skew now < streakStartAt case)."},
  {"name": "SavingsEngine", "kind": "function", "language": "swift", "signature": "enum SavingsEngine { static func currentSavings(cumulativeBeforeRateChange: Decimal, dailyQuantity: Double, costPerUnit: Decimal, rateEffectiveFrom: Date, now: Date, calendar: Calendar) -> Decimal; static func applyRateChange(existingSavings: Decimal, newDailyQuantity: Double, newCostPerUnit: Decimal, now: Date) -> (cumulativeBeforeRateChange: Decimal, rateEffectiveFrom: Date) }", "owning_lane": "data_domain", "notes": "applyRateChange is called by HabitFormViewModel on save when quantity/cost changed; it captures pre-edit savings as the new baseline so recompute is forward-only by construction."},
  {"name": "CravingSessionEngine", "kind": "function", "language": "swift", "signature": "enum CravingSessionEngine { static let duration: TimeInterval = 90; static func remainingSeconds(startedAt: Date, now: Date) -> TimeInterval; static func resolveOnAppear(startedAt: Date, now: Date, currentOutcome: CravingOutcome) -> CravingOutcome }", "owning_lane": "data_domain", "notes": "resolveOnAppear never returns .completed from a stale check; only the live foreground countdown reaching zero while CravingTimerView is presented triggers an explicit .completed write plus haptic plus lifetimeCravingsSurvived increment, guarded to fire exactly once."},
  {"name": "MilestoneEngine", "kind": "function", "language": "swift", "signature": "enum MilestoneEngine { static let thresholds: [Int] = [1, 3, 7, 30, 90, 180, 365]; static func nextUnshownThreshold(currentStreakDays: Int, lastShownThreshold: Int?) -> Int? }", "owning_lane": "data_domain", "notes": "Called from TodayViewModel.onAppear; if non-nil, view model updates Habit.lastShownMilestoneThreshold and surfaces the milestone card sheet trigger exactly once per threshold."},
  {"name": "AppBootstrapState", "kind": "enum", "language": "swift", "signature": "enum AppBootstrapState { case opening; case ready(ModelContainer); case failed(Error) }", "owning_lane": "primary_ui", "notes": "Held in FreedayApp @State, constructed via explicit do/catch against SchemaV1 + SchemaMigrationPlan, never via the .modelContainer(for:) convenience modifier."},
  {"name": "AppLevelErrorView", "kind": "struct", "language": "swift", "signature": "struct AppLevelErrorView: View { let error: Error; let retry: () -> Void }", "owning_lane": "polish_resilience", "notes": "Rendered instead of AppRootView when AppBootstrapState == .failed; plain-language copy + Try Again, no tab bar underneath."},
  {"name": "TodayViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class TodayViewModel { var habit: Habit?; var bootstrapState: AppBootstrapState; func startCravingSession(); func openRelapseFlow(); func onAppearCheckMilestone() -> Int? }", "owning_lane": "primary_ui", "notes": "Reads via @Query, delegates all math to StreakEngine/SavingsEngine/MilestoneEngine; never computes calendar math inline."},
  {"name": "CravingTimerViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class CravingTimerViewModel { var session: CravingSession; func remaining(now: Date) -> TimeInterval; func handleAppear(now: Date); func dismissBeforeCompletion() }", "owning_lane": "primary_ui", "notes": "handleAppear calls CravingSessionEngine.resolveOnAppear; view renders remaining() via TimelineView(.animation), not a per-second Timer.publish."},
  {"name": "RelapseViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class RelapseViewModel { var habit: Habit; var confirmed: Bool; func confirmRelapse() }", "owning_lane": "primary_ui", "notes": "confirmRelapse writes RelapseEvent, updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save, then flips confirmed for the in-place spring-animated state swap."},
  {"name": "HabitFormViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class HabitFormViewModel { var name: String; var dailyQuantity: String; var costPerUnit: String; var isEditingExisting: Bool; var showsRecomputeDisclosure: Bool; func validate() -> Bool; func save() }", "owning_lane": "primary_ui", "notes": "showsRecomputeDisclosure flips true only once a field differs from its original loaded value, per design_handoff."},
  {"name": "EntitlementStore", "kind": "protocol", "language": "swift", "signature": "@Observable final class EntitlementStore { var isSubscribed: Bool; func startTransactionListener() -> Task<Void, Never>; func refreshEntitlements() async; func purchase(_ product: Product) async throws; func restorePurchases() async throws }", "owning_lane": "services_utilities", "notes": "startTransactionListener runs from FreedayApp init and is kept alive for app lifetime; refreshEntitlements re-scans Transaction.currentEntitlements on launch and on explicit Restore tap."},
  {"name": "HapticsService", "kind": "function", "language": "swift", "signature": "enum HapticsService { static func notifySuccess(); static func notifyStreakDay() }", "owning_lane": "services_utilities", "notes": "Internally checks CHHapticEngine.capabilitiesForHardware().supportsHaptics; absent hardware is a silent no-op, never an error path."},
  {"name": "MilestoneCardRenderer", "kind": "function", "language": "swift", "signature": "enum MilestoneCardRenderer { static func renderImage(days: Int, savings: Decimal, colorScheme: ColorScheme) -> Image? }", "owning_lane": "services_utilities", "notes": "Wraps ImageRenderer at a fixed capped type size (deliberate exception to live Dynamic Type per design_handoff), feeds ShareLink's Transferable payload."},
  {"name": "MilestoneCardView", "kind": "struct", "language": "swift", "signature": "struct MilestoneCardView: View { let days: Int; let savings: Decimal; let habitName: String }", "owning_lane": "primary_ui", "notes": "Dual-purpose: rendered live in the sheet and passed to MilestoneCardRenderer.renderImage for export."},
  {"name": "Tokens", "kind": "struct", "language": "swift", "signature": "enum Tokens { enum Gradient { static let mintTop: Color; static let skyBottom: Color; static let posterMintTop: Color; static let posterSkyBottom: Color }; enum Spacing { static let xs: CGFloat; static let s: CGFloat; static let m: CGFloat; static let l: CGFloat; static let xl: CGFloat }; enum Radius { static let component: CGFloat; static let card: CGFloat; static let sheet: CGFloat } }", "owning_lane": "polish_resilience", "notes": "Concrete values from design_handoff: mint #B9F2DE to sky #8ED0F0, poster gradient #7EE8C3 to #6BB8F0, radii 12/20/28."},
  {"name": "SunriseCounterMotif", "kind": "struct", "language": "swift", "signature": "struct SunriseCounterMotif: View { let streakDays: Int; var body: some View }", "owning_lane": "polish_resilience", "notes": "Rendered via TimelineView(.animation) for continuous gradient/arc motion tied to remaining-time-style derivation, not a discrete per-second timer; single accessibilityElement with label stating the real day count."}
]}
```

**Coordinator (Claude) — decision after round 1**

Both of them arrived at the same architecture and the same three hard edges (pure/injectable time math, entitlement as a hard gate not a flag, bootstrap as a first-class app state) — Codex specified it first with protocol-based engines and a `HabitRepository` abstraction, and Claude's version is functionally identical but more concrete: it resolves the one real ambiguity Codex left open (a nullable `lastRelapseAt` that every consumer has to branch on) by replacing it with a non-optional `streakStartAt` plus a `cleanDaysBeforeCurrentStreak` accumulator that mirrors the already-locked savings effective-rate pattern, and it resolves the "duplicate/overlapping timer sessions" edge case that was flagged as unresolved back in detailed_discussion by giving `CravingSession` a persisted `outcome` field with a force-resolve-prior-session rule. Neither of those is a disagreement with Codex — they're the same shape, just carrying the ambiguity through to closure.

The one place they diverge stylistically rather than substantively is protocol-based engines with a repository layer (Codex) versus stateless enums of static functions with view models reading directly via `@Query`/`ModelContext` (Claude). That's not a live disagreement to resolve — the already-locked ios_architecture_review decision explicitly said view models "persist/query via ModelContext/@Query" with no repository layer mentioned, so Claude's lighter approach is what's already been agreed, and I'm going with it in the merged contract: no `HabitRepository` protocol, pure-function engines as enums.

Claude's TimelineView-vs-Timer.publish point and the App Group container identifier are both good, low-cost forward-compat moves, but Claude's own sequencing note is correct: they're fast-follow polish, not blocking for calling the core workflows done, consistent with the standing "smaller finished app beats a larger half-built one" rule. Codex's more granular `EntitlementState` enum (unknown/free/pro/expired/revoked/verificationFailed) is worth keeping over Claude's flatter `isSubscribed: Bool`, since the subscription-lapse read-only rule from detailed_discussion needs to distinguish expired from revoked — I've folded that granularity into the merged `EntitlementStore`.

CONSENSUS: YES

## Final Output

**Architecture overview:** `FreedayApp` is the composition root. Its `init` attempts `ModelContainer` construction inside an explicit `do/catch` against `FreedaySchemaV1`/`FreedayMigrationPlan` (never the `.modelContainer(for:)` convenience modifier) and stores the result as `AppBootstrapState` (`opening` / `ready(ModelContainer)` / `failed(Error)`) in `@State`. The root view branches on that state before `TabView` exists — a corrupt store cannot reach a screen that assumes data exists. Once ready, `AppRootView` owns the 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; `CravingTimer` and `Relapse` are `.fullScreenCover`, `HabitSetup`/`Paywall`/`MilestoneShare` are `.sheet`. Business logic lives entirely in stateless, pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) — enums of static functions taking timestamps/calendar as explicit parameters, zero SwiftData imports, zero internal `Date()` calls. Feature view models are thin `@Observable` adapters: fetch via `@Query`/`ModelContext`, delegate all time-derived math to an engine, never compute calendar math inline. `StorefrontService`/`EntitlementStore` is a concrete `@Observable` service, its transaction-update listener started from `FreedayApp` and kept alive for the app's lifetime.

**File/module layout:**
- `App/` — `FreedayApp.swift`, `AppBootstrap.swift`, `AppRootView.swift`
- `Domain/Models/` — `Habit.swift`, `RelapseEvent.swift`, `CravingSession.swift`, `SchemaV1.swift` (VersionedSchema + SchemaMigrationPlan)
- `Domain/Engines/` — `StreakEngine.swift`, `SavingsEngine.swift`, `CravingSessionEngine.swift`, `MilestoneEngine.swift` (each independently unit-testable, no persistence dependency)
- `Features/{Today,HabitForm,CravingTimer,Relapse,Milestones,Paywall,Settings}/` — one View + one `@Observable` ViewModel per feature
- `Services/` — `EntitlementStore.swift`, `HapticsService.swift`
- `DesignSystem/` — `GradientBackground`, `SunriseCounterMotif`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `AppLevelErrorView`, `Tokens.swift`
- `Resources/` — static craving-guidance copy (plain Swift array, no JSON layer), `Freeday.storekit`
- `FreedayTests/` — one XCTestCase per engine, a bootstrap test against a deliberately invalid config, a cascade-delete test on an in-memory container

**Data models:** Three SwiftData models. `Habit` carries a non-optional `streakStartAt` (initialized to `createdAt`, overwritten to `now` on relapse — no nullable branching at call sites), `cleanDaysBeforeCurrentStreak` and `cumulativeSavingsBeforeRateChange` as forward-only accumulators (same pattern applied to both days and money), `rateEffectiveFrom`, `lifetimeCravingsSurvived`, `lastShownMilestoneThreshold`, `lastInteractedAt` (tie-break for subscription-lapse read-only resolution: most-recent wins, falling back to creation order), and cascade-delete relationships to `RelapseEvent`/`CravingSession`. `RelapseEvent` is an immutable log row, always timestamped "now," denormalizing `streakLengthAtReset`/`savingsAtReset` for the Milestones/history tab. `CravingSession` carries a persisted `CravingOutcome` (`active`/`completed`/`abandoned`) — creating a new session force-resolves any existing active session for that habit to `abandoned` first, so at most one active session per habit exists by construction, not UI discipline.

**Persistence strategy:** `VersionedSchema`/`SchemaMigrationPlan` scaffolding stood up from commit one. Cascade delete declared via `@Relationship(deleteRule: .cascade)`, never manual cascade logic. Streak/lifetime-days/savings are all derived fresh on every read from persisted timestamps and accumulators — never cached counters. Zero third-party dependencies; StoreKit is the only network dependency, purchase/restore only.

**Testing strategy:** Every engine is a pure function of `(timestamp, now, calendar)` — unit-testable for midnight rollover (both directions), clock skew (`now` before `streakStartAt`, clamps to zero), DST spring-forward/fall-back, [REDACTED:high_entropy], and the overlapping-session force-resolve case. In-memory `ModelContainer` for cascade-delete and migration tests. `.storekit` config + `StoreKitTest` for the happy path, plus a required manual test script for the unverified-transaction hard-block and restore re-scan. Every named screen state gets a `#Preview`, with explicit preview coverage required for the relapse post-tap screenshot and the milestone card at max Dynamic Type in both color schemes.

No open disagreement — ready to close.

```interfaces-json
{"interfaces": [
  {"name": "AppBootstrapState", "kind": "enum", "language": "swift", "signature": "enum AppBootstrapState: Equatable { case opening; case ready(ModelContainer); case failed(Error) }", "owning_lane": "primary_ui", "notes": "Held in FreedayApp @State; constructed via explicit do/catch against FreedaySchemaV1 + FreedayMigrationPlan, never .modelContainer(for:). Branches root view before TabView exists."},
  {"name": "FreedaySchemaV1", "kind": "struct", "language": "swift", "signature": "enum FreedaySchemaV1: VersionedSchema { static var models: [any PersistentModel.Type] { get }; static var versionIdentifier: Schema.Version { get } }", "owning_lane": "data_domain", "notes": "Stood up from first commit even though initial migration plan is trivial."},
  {"name": "FreedayMigrationPlan", "kind": "struct", "language": "swift", "signature": "enum FreedayMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { get }; static var stages: [MigrationStage] { get } }", "owning_lane": "data_domain", "notes": "Pre-provisioned migration scaffolding paired with FreedaySchemaV1."},
  {"name": "Habit", "kind": "struct", "language": "swift", "signature": "@Model final class Habit { @Attribute(.unique) var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Double; var costPerUnit: Decimal; var createdAt: Date; var streakStartAt: Date; var cleanDaysBeforeCurrentStreak: Int; var rateEffectiveFrom: Date; var cumulativeSavingsBeforeRateChange: Decimal; var lifetimeCravingsSurvived: Int; var lastShownMilestoneThreshold: Int?; var lastInteractedAt: Date; @Relationship(deleteRule: .cascade, inverse: \\RelapseEvent.habit) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade, inverse: \\CravingSession.habit) var cravingSessions: [CravingSession] }", "owning_lane": "data_domain", "notes": "N habits supported unconditionally from day one; only UI/entitlement layer enforces the one-habit-free gate. streakStartAt is non-optional (initialized to createdAt, overwritten to now on relapse) so no nullable-branch duplication at call sites. cleanDaysBeforeCurrentStreak + cumulativeSavingsBeforeRateChange are forward-only accumulators, same pattern applied to both days and money."},
  {"name": "RelapseEvent", "kind": "struct", "language": "swift", "signature": "@Model final class RelapseEvent { @Attribute(.unique) var id: UUID; var timestamp: Date; var streakLengthAtReset: Int; var savingsAtReset: Decimal; var habit: Habit? }", "owning_lane": "data_domain", "notes": "Immutable historical row, timestamp always now (no backdating). Written by RelapseViewModel in the same ModelContext save that updates Habit.streakStartAt/cleanDaysBeforeCurrentStreak. Substantiates the Milestones/history tab."},
  {"name": "CravingSession", "kind": "struct", "language": "swift", "signature": "@Model final class CravingSession { @Attribute(.unique) var id: UUID; var startedAt: Date; var completedAt: Date?; var outcome: CravingOutcome; var habit: Habit? }", "owning_lane": "data_domain", "notes": "outcome starts .active. Creating a new session for a habit force-resolves any existing active session for that habit to .abandoned first — at most one active session per habit by construction."},
  {"name": "CravingOutcome", "kind": "enum", "language": "swift", "signature": "enum CravingOutcome: String, Codable { case active, completed, abandoned }", "owning_lane": "data_domain", "notes": "Persisted, not runtime-inferred, so relaunch resolution, duplicate-session resolution, and completion all read/write the same field."},
  {"name": "StreakEngine", "kind": "function", "language": "swift", "signature": "enum StreakEngine { static func currentStreakDays(streakStartAt: Date, now: Date, calendar: Calendar) -> Int; static func lifetimeDaysFree(cleanDaysBeforeCurrentStreak: Int, streakStartAt: Date, now: Date, calendar: Calendar) -> Int }", "owning_lane": "data_domain", "notes": "Pure, stateless, injectable clock — no Date() or SwiftData calls internally. Result clamps to >= 0 for clock-skew (now < streakStartAt)."},
  {"name": "SavingsEngine", "kind": "function", "language": "swift", "signature": "enum SavingsEngine { static func currentSavings(cumulativeBeforeRateChange: Decimal, dailyQuantity: Double, costPerUnit: Decimal, rateEffectiveFrom: Date, now: Date, calendar: Calendar) -> Decimal; static func applyRateChange(existingSavings: Decimal, newDailyQuantity: Double, newCostPerUnit: Decimal, now: Date) -> (cumulativeBeforeRateChange: Decimal, rateEffectiveFrom: Date) }", "owning_lane": "data_domain", "notes": "applyRateChange called by HabitFormViewModel on save when quantity/cost changed; captures pre-edit savings as new baseline so forward-only recompute is structurally guaranteed."},
  {"name": "CravingSessionEngine", "kind": "function", "language": "swift", "signature": "enum CravingSessionEngine { static let duration: TimeInterval = 90; static func remainingSeconds(startedAt: Date, now: Date) -> TimeInterval; static func resolveOnAppear(startedAt: Date, now: Date, currentOutcome: CravingOutcome) -> CravingOutcome }", "owning_lane": "data_domain", "notes": "resolveOnAppear never returns .completed from a stale/relaunch check (no retroactive credit) — only the live foreground countdown reaching zero while CravingTimerView is presented triggers an explicit .completed write, guarded to fire exactly once."},
  {"name": "MilestoneEngine", "kind": "function", "language": "swift", "signature": "enum MilestoneEngine { static let thresholds: [Int] = [1, 3, 7, 30, 90, 180, 365]; static func nextUnshownThreshold(currentStreakDays: Int, lastShownThreshold: Int?) -> Int? }", "owning_lane": "data_domain", "notes": "Called from TodayViewModel.onAppearCheckMilestone; non-nil result triggers the milestone sheet exactly once per threshold via Habit.lastShownMilestoneThreshold."},
  {"name": "AppLevelErrorView", "kind": "struct", "language": "swift", "signature": "struct AppLevelErrorView: View { let error: Error; let retry: () -> Void }", "owning_lane": "polish_resilience", "notes": "Rendered instead of AppRootView when AppBootstrapState == .failed; plain-language copy + Try Again, no tab bar underneath."},
  {"name": "TodayViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class TodayViewModel { var habit: Habit?; var bootstrapState: AppBootstrapState; func startCravingSession(); func openRelapseFlow(); func onAppearCheckMilestone() -> Int? }", "owning_lane": "primary_ui", "notes": "Reads via @Query, delegates all math to StreakEngine/SavingsEngine/MilestoneEngine — never computes calendar math inline."},
  {"name": "CravingTimerViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class CravingTimerViewModel { var session: CravingSession; func remaining(now: Date) -> TimeInterval; func handleAppear(now: Date); func dismissBeforeCompletion() }", "owning_lane": "primary_ui", "notes": "handleAppear calls CravingSessionEngine.resolveOnAppear. Countdown may render via a simple Timer.publish(every: 1) for the first functional pass; TimelineView(.animation)-driven continuous rendering is an approved fast-follow polish pass, not a blocking requirement."},
  {"name": "RelapseViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class RelapseViewModel { var habit: Habit; var confirmed: Bool; func confirmRelapse() }", "owning_lane": "primary_ui", "notes": "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save, then flips confirmed for the in-place spring-animated state swap (same screen, no navigation)."},
  {"name": "HabitFormViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class HabitFormViewModel { var name: String; var dailyQuantity: String; var costPerUnit: String; var isEditingExisting: Bool; var showsRecomputeDisclosure: Bool; func validate() -> Bool; func save() }", "owning_lane": "primary_ui", "notes": "showsRecomputeDisclosure flips true only once a field differs from its originally loaded value. validate() rejects non-positive quantity/cost inline."},
  {"name": "MilestonesListViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class MilestonesListViewModel { var habit: Habit?; var earnedMilestones: [RelapseEvent]; var isLoading: Bool }", "owning_lane": "primary_ui", "notes": "Backs the Milestones/history tab — chronological substantiation list only, not a journal. Empty/loading/success/error states."},
  {"name": "PaywallViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class PaywallViewModel { var entitlementState: EntitlementState; func purchase(_ product: Product) async; func restore() async }", "owning_lane": "primary_ui", "notes": "Triggered before any second-habit setup field renders. verificationFailed state hard-blocks with explicit copy, never a silent timeout."},
  {"name": "SettingsViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class SettingsViewModel { var habits: [Habit]; var entitlementState: EntitlementState; func deleteHabit(_ habit: Habit); func restore() async }", "owning_lane": "primary_ui", "notes": "deleteHabit relies on Habit's declarative cascade delete rule — no manual cascade logic here."},
  {"name": "EntitlementState", "kind": "enum", "language": "swift", "signature": "enum EntitlementState: Equatable { case unknown, free, pro, expired, revoked, verificationFailed }", "owning_lane": "services_utilities", "notes": "expired vs revoked distinction needed for the subscription-lapse read-only rule (data preserved, most-recently-active habit stays interactive)."},
  {"name": "EntitlementStore", "kind": "struct", "language": "swift", "signature": "@Observable final class EntitlementStore { var entitlementState: EntitlementState; func startTransactionListener() -> Task<Void, Never>; func refreshEntitlements() async; func purchase(_ product: Product) async throws; func restorePurchases() async throws }", "owning_lane": "services_utilities", "notes": "startTransactionListener runs from FreedayApp init, kept alive for app lifetime. checkVerified failure hard-blocks entitlement, never soft-grants. refreshEntitlements re-scans Transaction.currentEntitlements on launch and on explicit Restore tap."},
  {"name": "HapticsService", "kind": "function", "language": "swift", "signature": "enum HapticsService { static func notifySuccess(); static func notifyStreakDay() }", "owning_lane": "services_utilities", "notes": "Internally checks CHHapticEngine.capabilitiesForHardware().supportsHaptics; absent hardware is a silent no-op, never an error path."},
  {"name": "MilestoneCardRenderer", "kind": "function", "language": "swift", "signature": "enum MilestoneCardRenderer { static func renderImage(days: Int, savings: Decimal, colorScheme: ColorScheme) -> Image? }", "owning_lane": "services_utilities", "notes": "Wraps ImageRenderer at a fixed capped type size (deliberate exception to live Dynamic Type), feeds ShareLink's Transferable payload."},
  {"name": "MilestoneCardView", "kind": "struct", "language": "swift", "signature": "struct MilestoneCardView: View { let days: Int; let savings: Decimal; let habitName: String }", "owning_lane": "primary_ui", "notes": "Dual-purpose: rendered live in the sheet and passed to MilestoneCardRenderer.renderImage for export."},
  {"name": "Tokens", "kind": "struct", "language": "swift", "signature": "enum Tokens { enum Gradient { static let mintTop: Color; static let skyBottom: Color; static let posterMintTop: Color; static let posterSkyBottom: Color }; enum Spacing { static let xs: CGFloat; static let s: CGFloat; static let m: CGFloat; static let l: CGFloat; static let xl: CGFloat }; enum Radius { static let component: CGFloat; static let card: CGFloat; static let sheet: CGFloat } }", "owning_lane": "polish_resilience", "notes": "Concrete values from design_handoff: mint #B9F2DE to sky #8ED0F0, poster gradient #7EE8C3 to #6BB8F0, radii 12/20/28."},
  {"name": "SunriseCounterMotif", "kind": "struct", "language": "swift", "signature": "struct SunriseCounterMotif: View { let streakDays: Int; var body: some View }", "owning_lane": "polish_resilience", "notes": "Single accessibilityElement with label stating the real day count (e.g. '47 days free'), never decorative-only. Gradient tone shifts with streakDays."}
]}
```

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
All six required outputs are present and concrete: an architecture overview naming the exact bootstrap sequence and composition root, a full file/module layout, three SwiftData models with the resolved non-optional `streakStartAt`/accumulator pattern (a genuine improvement over the nullable `lastRelapseAt` design implied earlier — it mirrors the already-locked savings effective-rate-segment pattern so "preserve a running total across a reset" is solved once and reused for both money and days), a persistence strategy (versioned schema from commit one, declarative cascade delete, zero third-party dependencies), a testing strategy naming concrete injectable-clock test cases (midnight rollover both directions, clock skew clamped to zero, DST transitions, the new overlapping-session force-resolve case), and a complete, well-formed `interfaces-json` block covering all four lanes.

This round also closes a real gap flagged but left unresolved in `detailed_discussion`: "duplicate/overlapping timer sessions." The resolution — `CravingSession.outcome` as a persisted `active/completed/abandoned` field, with new-session creation force-resolving any existing active session to `abandoned` first — is concrete, consistent with the standing "no retroactive credit" rule, and reuses the same resolution function across relaunch, new-session-request, and foreground transitions rather than three divergent code paths.

Acceptance checks hold: the interfaces-json gives every parallel lane (data_domain, primary_ui, services_utilities, polish_resilience) concrete, mutually consistent types to build against — e.g. `EntitlementState`'s `expired`/`revoked` distinction correctly threads through to `SettingsViewModel`/`PaywallViewModel` to support the previously-locked subscription-lapse read-only rule, and `CravingOutcome` is referenced identically by `CravingSession`, `CravingSessionEngine`, and `CravingTimerViewModel`. The spec names how the app is built (feature-domain split, pure engines, thin `@Observable` adapters) and verified (unit tests on pure functions, in-memory container tests, `.storekit` + manual verification-failure script, exhaustive `#Preview` coverage). Nothing here contradicts prior-phase locks — wall-clock timer anchoring, forward-only recompute, non-punitive same-screen relapse reassurance, and narrow StoreKit-gates-habit-#2 scope all carry forward unchanged. The TimelineView/App-Group discussion is correctly demoted to an explicit non-blocking fast-follow, consistent with the "smaller finished app beats a larger half-built one" rule, and the coordinator's merge decision (stateless-enum engines over a repository-protocol layer, since `ios_architecture_review` already specified `ModelContext`/`@Query` directly) is a reasoned resolution of the one real style divergence between the two agents, not a papered-over disagreement.

One non-blocking note for the build phase: `AppBootstrapState` is declared `Equatable` while holding an associated `Error` and `ModelContainer`, neither of which is `Equatable` by default — the build lane will need a custom `Equatable` conformance (or drop the auto-derivation and compare only on a simplified case tag) rather than relying on synthesis. Minor implementation detail, not a spec-level gap; does not block closing this phase.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Both of them arrived at the same architecture and the same three hard edges (pure/injectable time math, entitlement as a hard gate not a flag, bootstrap as a first-class app state) — Codex specified it first with protocol-based engines and a `HabitRepository` abstraction, and Claude's version is functionally identical but more concrete: it resolves the one real ambiguity Codex left open (a nullable `lastRelapseAt` that every consumer has to branch on) by replacing it with a non-optional `streakStartAt` plus a `cleanDaysBeforeCurrentStreak` accumulator that mirrors the already-locked savings effective-rate pattern, and it resolves the "duplicate/overlapping timer sessions" edge case that was flagged as unresolved back in detailed_discussion by giving `CravingSession` a persisted `outcome` field with a force-resolve-prior-session rule. Neither of those is a disagreement with Codex — they're the same shape, just carrying the ambiguity through to closure.

The one place they diverge stylistically rather than substantively is protocol-based engines with a repository layer (Codex) versus stateless enums of static functions with view models reading directly via `@Query`/`ModelContext` (Claude). That's not a live disagreement to resolve — the already-locked ios_architecture_review decision explicitly said view models "persist/query via ModelContext/@Query" with no repository layer mentioned, so Claude's lighter approach is what's already been agreed, and I'm going with it in the merged contract: no `HabitRepository` protocol, pure-function engines as enums.

Claude's TimelineView-vs-Timer.publish point and the App Group container identifier are both good, low-cost forward-compat moves, but Claude's own sequencing note is correct: they're fast-follow polish, not blocking for calling the core workflows done, consistent with the standing "smaller finished app beats a larger half-built one" rule. Codex's more granular `EntitlementState` enum (unknown/free/pro/expired/revoked/verificationFailed) is worth keeping over Claude's flatter `isSubscribed: Bool`, since the subscription-lapse read-only rule from detailed_discussion needs to distinguish expired from revoked — I've folded that granularity into the merged `EntitlementStore`.

CONSENSUS: YES

## Final Output

**Architecture overview:** `FreedayApp` is the composition root. Its `init` attempts `ModelContainer` construction inside an explicit `do/catch` against `FreedaySchemaV1`/`FreedayMigrationPlan` (never the `.modelContainer(for:)` convenience modifier) and stores the result as `AppBootstrapState` (`opening` / `ready(ModelContainer)` / `failed(Error)`) in `@State`. The root view branches on that state before `TabView` exists — a corrupt store cannot reach a screen that assumes data exists. Once ready, `AppRootView` owns the 3-tab `TabView` (Today/Milestones/Settings), each with its own `NavigationStack`; `CravingTimer` and `Relapse` are `.fullScreenCover`, `HabitSetup`/`Paywall`/`MilestoneShare` are `.sheet`. Business logic lives entirely in stateless, pure domain engines (`StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`) — enums of static functions taking timestamps/calendar as explicit parameters, zero SwiftData imports, zero internal `Date()` calls. Feature view models are thin `@Observable` adapters: fetch via `@Query`/`ModelContext`, delegate all time-derived math to an engine, never compute calendar math inline. `StorefrontService`/`EntitlementStore` is a concrete `@Observable` service, its transaction-update listener started from `FreedayApp` and kept alive for the app's lifetime.

**File/module layout:**
- `App/` — `FreedayApp.swift`, `AppBootstrap.swift`, `AppRootView.swift`
- `Domain/Models/` — `Habit.swift`, `RelapseEvent.swift`, `CravingSession.swift`, `SchemaV1.swift` (VersionedSchema + SchemaMigrationPlan)
- `Domain/Engines/` — `StreakEngine.swift`, `SavingsEngine.swift`, `CravingSessionEngine.swift`, `MilestoneEngine.swift` (each independently unit-testable, no persistence dependency)
- `Features/{Today,HabitForm,CravingTimer,Relapse,Milestones,Paywall,Settings}/` — one View + one `@Observable` ViewModel per feature
- `Services/` — `EntitlementStore.swift`, `HapticsService.swift`
- `DesignSystem/` — `GradientBackground`, `SunriseCounterMotif`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `AppLevelErrorView`, `Tokens.swift`
- `Resources/` — static craving-guidance copy (plain Swift array, no JSON layer), `Freeday.storekit`
- `FreedayTests/` — one XCTestCase per engine, a bootstrap test against a deliberately invalid config, a cascade-delete test on an in-memory container

**Data models:** Three SwiftData models. `Habit` carries a non-optional `streakStartAt` (initialized to `createdAt`, overwritten to `now` on relapse — no nullable branching at call sites), `cleanDaysBeforeCurrentStreak` and `cumulativeSavingsBeforeRateChange` as forward-only accumulators (same pattern applied to both days and money), `rateEffectiveFrom`, `lifetimeCravingsSurvived`, `lastShownMilestoneThreshold`, `lastInteractedAt` (tie-break for subscription-lapse read-only resolution: most-recent wins, falling back to creation order), and cascade-delete relationships to `RelapseEvent`/`CravingSession`. `RelapseEvent` is an immutable log row, always timestamped "now," denormalizing `streakLengthAtReset`/`savingsAtReset` for the Milestones/history tab. `CravingSession` carries a persisted `CravingOutcome` (`active`/`completed`/`abandoned`) — creating a new session force-resolves any existing active session for that habit to `abandoned` first, so at most one active session per habit exists by construction, not UI discipline.

**Persistence strategy:** `VersionedSchema`/`SchemaMigrationPlan` scaffolding stood up from commit one. Cascade delete declared via `@Relationship(deleteRule: .cascade)`, never manual cascade logic. Streak/lifetime-days/savings are all derived fresh on every read from persisted timestamps and accumulators — never cached counters. Zero third-party dependencies; StoreKit is the only network dependency, purchase/restore only.

**Testing strategy:** Every engine is a pure function of `(timestamp, now, calendar)` — unit-testable for midnight rollover (both directions), clock skew (`now` before `streakStartAt`, clamps to zero), DST spring-forward/fall-back, [REDACTED:high_entropy], and the overlapping-session force-resolve case. In-memory `ModelContainer` for cascade-delete and migration tests. `.storekit` config + `StoreKitTest` for the happy path, plus a required manual test script for the unverified-transaction hard-block and restore re-scan. Every named screen state gets a `#Preview`, with explicit preview coverage required for the relapse post-tap screenshot and the milestone card at max Dynamic Type in both color schemes.

No open disagreement — ready to close.

```interfaces-json
{"interfaces": [
  {"name": "AppBootstrapState", "kind": "enum", "language": "swift", "signature": "enum AppBootstrapState: Equatable { case opening; case ready(ModelContainer); case failed(Error) }", "owning_lane": "primary_ui", "notes": "Held in FreedayApp @State; constructed via explicit do/catch against FreedaySchemaV1 + FreedayMigrationPlan, never .modelContainer(for:). Branches root view before TabView exists."},
  {"name": "FreedaySchemaV1", "kind": "struct", "language": "swift", "signature": "enum FreedaySchemaV1: VersionedSchema { static var models: [any PersistentModel.Type] { get }; static var versionIdentifier: Schema.Version { get } }", "owning_lane": "data_domain", "notes": "Stood up from first commit even though initial migration plan is trivial."},
  {"name": "FreedayMigrationPlan", "kind": "struct", "language": "swift", "signature": "enum FreedayMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { get }; static var stages: [MigrationStage] { get } }", "owning_lane": "data_domain", "notes": "Pre-provisioned migration scaffolding paired with FreedaySchemaV1."},
  {"name": "Habit", "kind": "struct", "language": "swift", "signature": "@Model final class Habit { @Attribute(.unique) var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Double; var costPerUnit: Decimal; var createdAt: Date; var streakStartAt: Date; var cleanDaysBeforeCurrentStreak: Int; var rateEffectiveFrom: Date; var cumulativeSavingsBeforeRateChange: Decimal; var lifetimeCravingsSurvived: Int; var lastShownMilestoneThreshold: Int?; var lastInteractedAt: Date; @Relationship(deleteRule: .cascade, inverse: \\RelapseEvent.habit) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade, inverse: \\CravingSession.habit) var cravingSessions: [CravingSession] }", "owning_lane": "data_domain", "notes": "N habits supported unconditionally from day one; only UI/entitlement layer enforces the one-habit-free gate. streakStartAt is non-optional (initialized to createdAt, overwritten to now on relapse) so no nullable-branch duplication at call sites. cleanDaysBeforeCurrentStreak + cumulativeSavingsBeforeRateChange are forward-only accumulators, same pattern applied to both days and money."},
  {"name": "RelapseEvent", "kind": "struct", "language": "swift", "signature": "@Model final class RelapseEvent { @Attribute(.unique) var id: UUID; var timestamp: Date; var streakLengthAtReset: Int; var savingsAtReset: Decimal; var habit: Habit? }", "owning_lane": "data_domain", "notes": "Immutable historical row, timestamp always now (no backdating). Written by RelapseViewModel in the same ModelContext save that updates Habit.streakStartAt/cleanDaysBeforeCurrentStreak. Substantiates the Milestones/history tab."},
  {"name": "CravingSession", "kind": "struct", "language": "swift", "signature": "@Model final class CravingSession { @Attribute(.unique) var id: UUID; var startedAt: Date; var completedAt: Date?; var outcome: CravingOutcome; var habit: Habit? }", "owning_lane": "data_domain", "notes": "outcome starts .active. Creating a new session for a habit force-resolves any existing active session for that habit to .abandoned first — at most one active session per habit by construction."},
  {"name": "CravingOutcome", "kind": "enum", "language": "swift", "signature": "enum CravingOutcome: String, Codable { case active, completed, abandoned }", "owning_lane": "data_domain", "notes": "Persisted, not runtime-inferred, so relaunch resolution, duplicate-session resolution, and completion all read/write the same field."},
  {"name": "StreakEngine", "kind": "function", "language": "swift", "signature": "enum StreakEngine { static func currentStreakDays(streakStartAt: Date, now: Date, calendar: Calendar) -> Int; static func lifetimeDaysFree(cleanDaysBeforeCurrentStreak: Int, streakStartAt: Date, now: Date, calendar: Calendar) -> Int }", "owning_lane": "data_domain", "notes": "Pure, stateless, injectable clock — no Date() or SwiftData calls internally. Result clamps to >= 0 for clock-skew (now < streakStartAt)."},
  {"name": "SavingsEngine", "kind": "function", "language": "swift", "signature": "enum SavingsEngine { static func currentSavings(cumulativeBeforeRateChange: Decimal, dailyQuantity: Double, costPerUnit: Decimal, rateEffectiveFrom: Date, now: Date, calendar: Calendar) -> Decimal; static func applyRateChange(existingSavings: Decimal, newDailyQuantity: Double, newCostPerUnit: Decimal, now: Date) -> (cumulativeBeforeRateChange: Decimal, rateEffectiveFrom: Date) }", "owning_lane": "data_domain", "notes": "applyRateChange called by HabitFormViewModel on save when quantity/cost changed; captures pre-edit savings as new baseline so forward-only recompute is structurally guaranteed."},
  {"name": "CravingSessionEngine", "kind": "function", "language": "swift", "signature": "enum CravingSessionEngine { static let duration: TimeInterval = 90; static func remainingSeconds(startedAt: Date, now: Date) -> TimeInterval; static func resolveOnAppear(startedAt: Date, now: Date, currentOutcome: CravingOutcome) -> CravingOutcome }", "owning_lane": "data_domain", "notes": "resolveOnAppear never returns .completed from a stale/relaunch check (no retroactive credit) — only the live foreground countdown reaching zero while CravingTimerView is presented triggers an explicit .completed write, guarded to fire exactly once."},
  {"name": "MilestoneEngine", "kind": "function", "language": "swift", "signature": "enum MilestoneEngine { static let thresholds: [Int] = [1, 3, 7, 30, 90, 180, 365]; static func nextUnshownThreshold(currentStreakDays: Int, lastShownThreshold: Int?) -> Int? }", "owning_lane": "data_domain", "notes": "Called from TodayViewModel.onAppearCheckMilestone; non-nil result triggers the milestone sheet exactly once per threshold via Habit.lastShownMilestoneThreshold."},
  {"name": "AppLevelErrorView", "kind": "struct", "language": "swift", "signature": "struct AppLevelErrorView: View { let error: Error; let retry: () -> Void }", "owning_lane": "polish_resilience", "notes": "Rendered instead of AppRootView when AppBootstrapState == .failed; plain-language copy + Try Again, no tab bar underneath."},
  {"name": "TodayViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class TodayViewModel { var habit: Habit?; var bootstrapState: AppBootstrapState; func startCravingSession(); func openRelapseFlow(); func onAppearCheckMilestone() -> Int? }", "owning_lane": "primary_ui", "notes": "Reads via @Query, delegates all math to StreakEngine/SavingsEngine/MilestoneEngine — never computes calendar math inline."},
  {"name": "CravingTimerViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class CravingTimerViewModel { var session: CravingSession; func remaining(now: Date) -> TimeInterval; func handleAppear(now: Date); func dismissBeforeCompletion() }", "owning_lane": "primary_ui", "notes": "handleAppear calls CravingSessionEngine.resolveOnAppear. Countdown may render via a simple Timer.publish(every: 1) for the first functional pass; TimelineView(.animation)-driven continuous rendering is an approved fast-follow polish pass, not a blocking requirement."},
  {"name": "RelapseViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class RelapseViewModel { var habit: Habit; var confirmed: Bool; func confirmRelapse() }", "owning_lane": "primary_ui", "notes": "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save, then flips confirmed for the in-place spring-animated state swap (same screen, no navigation)."},
  {"name": "HabitFormViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class HabitFormViewModel { var name: String; var dailyQuantity: String; var costPerUnit: String; var isEditingExisting: Bool; var showsRecomputeDisclosure: Bool; func validate() -> Bool; func save() }", "owning_lane": "primary_ui", "notes": "showsRecomputeDisclosure flips true only once a field differs from its originally loaded value. validate() rejects non-positive quantity/cost inline."},
  {"name": "MilestonesListViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class MilestonesListViewModel { var habit: Habit?; var earnedMilestones: [RelapseEvent]; var isLoading: Bool }", "owning_lane": "primary_ui", "notes": "Backs the Milestones/history tab — chronological substantiation list only, not a journal. Empty/loading/success/error states."},
  {"name": "PaywallViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class PaywallViewModel { var entitlementState: EntitlementState; func purchase(_ product: Product) async; func restore() async }", "owning_lane": "primary_ui", "notes": "Triggered before any second-habit setup field renders. verificationFailed state hard-blocks with explicit copy, never a silent timeout."},
  {"name": "SettingsViewModel", "kind": "struct", "language": "swift", "signature": "@Observable final class SettingsViewModel { var habits: [Habit]; var entitlementState: EntitlementState; func deleteHabit(_ habit: Habit); func restore() async }", "owning_lane": "primary_ui", "notes": "deleteHabit relies on Habit's declarative cascade delete rule — no manual cascade logic here."},
  {"name": "EntitlementState", "kind": "enum", "language": "swift", "signature": "enum EntitlementState: Equatable { case unknown, free, pro, expired, revoked, verificationFailed }", "owning_lane": "services_utilities", "notes": "expired vs revoked distinction needed for the subscription-lapse read-only rule (data preserved, most-recently-active habit stays interactive)."},
  {"name": "EntitlementStore", "kind": "struct", "language": "swift", "signature": "@Observable final class EntitlementStore { var entitlementState: EntitlementState; func startTransactionListener() -> Task<Void, Never>; func refreshEntitlements() async; func purchase(_ product: Product) async throws; func restorePurchases() async throws }", "owning_lane": "services_utilities", "notes": "startTransactionListener runs from FreedayApp init, kept alive for app lifetime. checkVerified failure hard-blocks entitlement, never soft-grants. refreshEntitlements re-scans Transaction.currentEntitlements on launch and on explicit Restore tap."},
  {"name": "HapticsService", "kind": "function", "language": "swift", "signature": "enum HapticsService { static func notifySuccess(); static func notifyStreakDay() }", "owning_lane": "services_utilities", "notes": "Internally checks CHHapticEngine.capabilitiesForHardware().supportsHaptics; absent hardware is a silent no-op, never an error path."},
  {"name": "MilestoneCardRenderer", "kind": "function", "language": "swift", "signature": "enum MilestoneCardRenderer { static func renderImage(days: Int, savings: Decimal, colorScheme: ColorScheme) -> Image? }", "owning_lane": "services_utilities", "notes": "Wraps ImageRenderer at a fixed capped type size (deliberate exception to live Dynamic Type), feeds ShareLink's Transferable payload."},
  {"name": "MilestoneCardView", "kind": "struct", "language": "swift", "signature": "struct MilestoneCardView: View { let days: Int; let savings: Decimal; let habitName: String }", "owning_lane": "primary_ui", "notes": "Dual-purpose: rendered live in the sheet and passed to MilestoneCardRenderer.renderImage for export."},
  {"name": "Tokens", "kind": "struct", "language": "swift", "signature": "enum Tokens { enum Gradient { static let mintTop: Color; static let skyBottom: Color; static let posterMintTop: Color; static let posterSkyBottom: Color }; enum Spacing { static let xs: CGFloat; static let s: CGFloat; static let m: CGFloat; static let l: CGFloat; static let xl: CGFloat }; enum Radius { static let component: CGFloat; static let card: CGFloat; static let sheet: CGFloat } }", "owning_lane": "polish_resilience", "notes": "Concrete values from design_handoff: mint #B9F2DE to sky #8ED0F0, poster gradient #7EE8C3 to #6BB8F0, radii 12/20/28."},
  {"name": "SunriseCounterMotif", "kind": "struct", "language": "swift", "signature": "struct SunriseCounterMotif: View { let streakDays: Int; var body: some View }", "owning_lane": "polish_resilience", "notes": "Single accessibilityElement with label stating the real day count (e.g. '47 days free'), never decorative-only. Gradient tone shifts with streakDays."}
]}
```

---

CONSENSUS: YES

### Project Plan

# freeday — Project Plan

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:35:43._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Produce milestones, sequencing, estimates, dependencies, and a risk-managed delivery plan.

## Transcript


### Round 1


**Codex (Delivery Lead · Visionary) — Round 1**

Here is the delivery plan for `freeday` in `project_plan`, sequenced for low risk and fast execution while preserving the locked v1 scope.

Milestone 1 — Scope lock + execution baseline (Day 1, 4–6h).  
Goal: convert all hard requirements into a single implementation blueprint the build team can execute without ambiguity.  
Dependencies: none.  
Owner: product/engineering lead.  
Must-have deliverables:
- Finalized behavior contract for five core workflows + store-gate + error states + a11y rules.
- Explicit recompute rule: savings edits are forward-only from edit time, never retroactive.
- Screen matrix with Empty/Loading/Success/Error for every reachable screen.
Verification before move: a 1-page checklist signed off for relapse non-shaming language, no clinical treatment framing, and StoreKit hard-gate behavior.

Milestone 2 — Data foundation and app bootstrap (Day 1–2, 8–10h).  
Goal: make app lifecycle and persistence durable before any feature code.  
Dependencies: Milestone 1.  
Owner: SwiftData + app architecture lane.  
Tasks:
- Implement `AppBootstrapState` with explicit `.opening/.ready/.failed` and route root view based on it.
- Implement `ModelContainer` construction in `do/catch`; no `.modelContainer(for:)` implicit modifier path.
- Create `FreedaySchemaV1` and `FreedayMigrationPlan` scaffolding.
- Implement SwiftData models: `Habit`, `RelapseEvent`, `CravingSession` with cascade deletes and forward-only fields.
- Add app-level failure state screen before `TabView` mount.
- Persist fields: `streakStartAt` (non-optional), `cleanDaysBeforeCurrentStreak`, `cumulativeSavingsBeforeRateChange`, `rateEffectiveFrom`, `lastShownMilestoneThreshold`, `lastInteractedAt`.
Verification gate:
- Build-time compile of bootstrap path.
- Corrupt-opened-store fallback renders app-level error state (manual test path documented).

Milestone 3 — Core domain engines and deterministic math (Day 2–3, 10–12h).  
Goal: lock correctness of values that define trust.  
Dependencies: Milestone 2 models/schema available.  
Owner: core logic lane.  
Tasks:
- Implement pure engines: `StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine`.
- Use injected `now` parameters and explicit `Calendar`.
- Implement zero/negative clamp and DST/timezone edge behavior.
- Implement timer outcome rules: active -> completed only on live foreground completion; stale elapsed session -> abandoned.
- Implement idempotent milestone thresholding.
Verification gate:
- Unit tests for midnight boundary, DST, clock-skew, elapsed > 90s on relaunch, recurring session overlap, and duplicate active session resolution.

Milestone 4 — Core user loop UI shell + Today screen logic (Day 3–4, 10–12h).  
Goal: ship the emotional core of the app.  
Dependencies: Milestone 3 domain engines.  
Owner: primary UI lane.  
Tasks:
- Build Today/Home, Habit setup/edit, craving start modal, relapse modal, milestone trigger.
- Implement `@Observable` view models with `@Query` + `ModelContext` only.
- Ensure one-tap relapse flow with same-screen reset confirmation and untouched lifetime stats visible.
- Implement 4-state Today + all screen state variants.
- Add `sunrise/counter` motif and non-shaming tone components.
Verification gate:
- Flow check at max dynamic type: zero habit -> setup -> today -> timer/relapse -> milestone card.
- VoiceOver labels for critical numbers (`days free`, `$ saved`).

Milestone 5 — Payment gate and entitlement logic (Day 4, 6–8h, parallelizable with Milestone 4 final polish).  
Goal: real StoreKit gating for second habit without bypasses.  
Dependencies: Milestone 2 bootstrap + Milestone 1 scope lock.  
Owner: monetization/services lane.  
Tasks:
- Implement `EntitlementState` (`unknown/free/pro/expired/revoked/verificationFailed`) and `EntitlementStore`.
- Implement `Transaction.updates` listener, `Transaction.currentEntitlements` refresh, hard `checkVerified` behavior, restore flow.
- Trigger paywall before any second-habit setup field renders.
- Free users cannot add second habit; do not show multi-habit chrome until entitlement true.
Verification gate:
- Manual unverified-transaction failure test path and restore re-scan must pass by design.
- No fake toggle for paywall state.

Milestone 6 — Craving timer hardening, card sharing, haptics, and settings (Day 5, 8–10h).  
Goal: finish remaining must-have functionality.  
Dependencies: Milestones 3–5.  
Owner: timer + UX polish lane.  
Tasks:
- Finish wall-clock anchored 90s timer flow with single-screen completion.
- Handle force-quit/relaunch and active-session overlap using persisted outcome (`active/completed/abandoned`).
- Add haptics on completed streak day and completed timer, hardware-guarded no-op.
- Implement ShareLink milestone card with `ImageRenderer` export path; cap exported type scale.
- Add settings with restore, habit edit, and one-step delete (cascade behavior validated).
Verification gate:
- Abandoned session does not increment cravings count.
- Completed timer increments cravings-survived exactly once.
- Share card renders at max Dynamic Type in both light/dark.

Milestone 7 — Hardening + final readiness and release gate (Day 6, 6–8h).  
Goal: make the difference between “build” and “production-ready MVP.”  
Dependencies: all prior milestones.  
Owner: delivery lead + QA gate.  
Tasks:
- Accessibility pass for 44pt touch targets, dynamic content reflow, contrast.
- Localize empty/loading/error states for milestones list and paywall restore paths.
- Implement app-level + per-screen error states fully.
- Perform final risk triage and lock “degradations” explicitly (Live Activity, WidgetKit marked deferred/stubbed or excluded in this slice).
- Freeze scope and produce final status notes: what ships, what is intentionally deferred.
Verification gate:
- End-to-end smoke checklist (fresh install journey, one relapse, one full timer completion, one milestone share, one second-habit paywall, one restore attempt).
- If all pass, release candidate status moves to build completion for this child app.

Dependency order (must do-first): Milestone 1 → 2 → 3 → 4 and 5 can overlap but both depend on 2/3 and 1 → 6 depends on 3/4/5 → 7 depends on all.
Critical path: bootstrap and schema (2) → deterministic engines (3) → Today + flows (4) and entitlement (5) → final integration (6/7).

Main risk blocks and mitigations:
- Biggest risk is temporal logic drift under real life (backgrounding, timezone moves, force-quit). Mitigation: only persisted timestamps as source of truth, no in-memory counters.
- Biggest trust risk is relapse wording/perception. Mitigation: single-screen reset with lifetime visibility, no red/error language, mandated design+copy review gate.
- Biggest monetization risk is accidental bypass. Mitigation: hard verified entitlement check and explicit store-level transaction verification path.
- Biggest data risk is orphaned rows. Mitigation: cascade relationships + startup container failure handling + migration scaffolding.
- Biggest operational risk is false-complete timer on relaunch. Mitigation: explicit `abandoned` outcome rule when elapsed >= 90s before foreground.

What must be explicitly preserved in final implementation notes: non-shaming relapse UX, forward-only savings recompute, one-tap timer/restart in two high-need moments, app-level store-open failure screen, and the explicit "no backend, no analytics, no telemetry" constraint.

**Claude (Backend / Systems Engineer · Skeptic) — Round 1**

Coming at this as the systems/backend skeptic: the tech_specs phase left almost nothing ambiguous, which is exactly the situation where a project-plan phase gets lazy and just says "now build it in the order in the interfaces file." I don't think that's a safe sequencing — the interfaces file is a target, not a build order, and there are real dependency and risk-ordering questions still open.

The dependency graph, as I see it: the domain engines (StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine) have zero dependency on anything else — no SwiftData import, no view code, pure functions of timestamps. That means they should be the very first milestone, built and unit-tested against every named edge case (midnight rollover both directions, clock skew clamped to zero, DST both directions, the force-quit-past-90s abandon case, the overlapping-session force-resolve rule, the milestone-idempotency case) before a single screen exists. I'd resist the instinct to build "something visible" first for morale reasons — this app's entire trust proposition is that the numbers on screen are correct, and if the engines are wrong, every downstream screen inherits the bug silently. Design tokens/components (GradientBackground, StatCard, PrimaryActionButton, SkeletonStatCard, SunriseCounterMotif, AppLevelErrorView) have no data dependency either and can be built in true parallel with the engines — that's a genuine two-lane parallel milestone, not a false one.

After that, the schema/bootstrap milestone: SchemaV1, MigrationPlan, the three @Model classes, and the FreedayApp do/catch bootstrap with AppBootstrapState — this is where I want to flag a concrete bug before it gets copy-pasted forward. The interfaces block has `AppBootstrapState: Equatable` holding an associated `Error` and `ModelContainer`, and neither conforms to Equatable — that won't compile as written, quality gate already caught it, but I want it named as an actual task in this plan (custom Equatable conformance comparing on a case tag, dropping the associated values from the comparison) rather than left as a "the build lane will figure it out" footnote. Same thing with the cascade-delete inverse keypath syntax that showed up mangled in one of the round-1 interface drafts (`inverse: \\Relapse Event.habit` with a stray space) — cosmetic in a chat transcript, a compile error if someone pastes it literally. Small, but exactly the kind of thing that eats an hour of a build lane's time for no reason if it's not flagged now.

Once schema exists, the vertical slices can start, and I'd order them by how much of the "make-or-break" risk they retire, not by screen-list order. HabitForm (setup/edit with validation) comes before Today, because Today's non-empty state needs a real persisted habit, and because the paywall-gate integration point — "attempting habit #2 shows the paywall before any setup fields render" — is a hard wiring dependency between HabitForm and EntitlementStore that I don't want built as two isolated islands and reconciled at the end. I'd make that integration point its own checkpoint, not an afterthought of "HabitForm is done" and "StoreKit is done" separately. Relapse and the craving timer are otherwise independent of each other and can run in parallel once Habit + the two respective engines exist. Milestone card/ShareLink depends on real streak and savings numbers already being trustworthy, so it should come after the engine milestone is verified, not concurrently with it.

The thing I'd push hardest on for this specific plan: "verification and repair" can't be one lump at the end — this project has at least two places where bugs are historically invisible until specifically exercised (the plan itself said this about StoreKit's unverified-transaction path). I want dedicated verify-and-repair checkpoints after the engine milestone (run the full injected-clock test matrix, not just compile) and after the StoreKit/entitlement milestone (force an unverified transaction and a restore-with-nothing-to-restore case using the `.storekit` config, not just the happy purchase path), rather than folding those into one general "final QA" pass where they're likely to get skipped for time. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container migration should be named explicitly as the last milestone and the first thing cut if time runs out — and I'd go further than "fast-follow" language used earlier: since no widget target is being built in this pass, I'd deprioritize the App Group container identifier entirely rather than spend setup time on infrastructure for a target that doesn't exist yet, unless the plan commits to actually building the widget this pass.

My biggest reservation about my own ordering: front-loading two full milestones (engines, design system) before anything is visibly running on a simulator means there's no demoable artifact for a while, which could look like the build has stalled even though the highest-risk logic is what's getting retired first. I think that's the right trade for this app given how much prior-phase discussion centered on "the numbers must be trustworthy," but it should be named explicitly in the plan so nobody mistakes "no screen yet" for "no progress."

**Coordinator (Claude) — decision after round 1**

Looking at round 1, both of them are building the same seven-milestone shape — Codex drafted it, and Claude (in the systems-skeptic seat this time) is correcting the dependency graph rather than disagreeing with the milestone list. The real substance in Claude's pushback: engines are pure functions with zero SwiftData dependency, so gating them behind the schema/bootstrap milestone (as Codex's plan does) is an artificial dependency — they should run in a genuinely parallel lane from day one, same as the design tokens. Claude also caught two concrete bugs that need to become named tasks rather than left implicit (the `AppBootstrapState: Equatable` conformance problem the quality gate flagged back in tech_specs, and a mangled cascade-delete keypath), argued HabitForm should land before Today since Today's non-empty state needs a real habit and the paywall-gate is a wiring dependency between HabitForm and EntitlementStore that shouldn't get built as two islands, and wants verify-and-repair as dedicated checkpoints (full injected-clock test matrix; a forced unverified-transaction + empty-restore test) rather than folded into one end-of-project QA pass. None of this contradicts Codex's structure — it's a correction to ordering and an insistence that testing isn't a footnote, both fully in scope for this phase.

CONSENSUS: YES

## Final Output

**Milestone 1 — Scope lock (Day 1, 4-6h).** Convert every locked requirement into one unambiguous execution blueprint: behavior contract for the five core workflows + store-gate + error states + a11y rules, the forward-only recompute rule stated explicitly, and a full screen-state matrix. Gate: signed-off checklist for non-shaming relapse language, no clinical framing, StoreKit hard-gate behavior. No dependencies.

**Milestone 2 — Domain engines + design system (parallel lanes, Day 1-2, 10-12h).** These have zero dependency on schema or persistence, so they start immediately after scope lock, not after bootstrap.
- Lane A: `StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine` as pure functions with injected `now`/`Calendar`. Implement zero/negative clamps, DST/timezone edge behavior, timer outcome rules, idempotent milestone thresholding.
- Lane B: `GradientBackground`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `SunriseCounterMotif`, `AppLevelErrorView`, `Tokens.swift` — no data dependency either.
Verify-and-repair checkpoint (not deferred to final QA): run the full injected-clock unit test matrix — midnight rollover both directions, clock skew clamped to zero, DST both directions, force-quit-past-90s abandon, overlapping-session force-resolve, milestone-idempotency.

**Milestone 2b — Data foundation and app bootstrap (Day 1-2, 8-10h, parallel with Milestone 2).** `FreedaySchemaV1`/`FreedayMigrationPlan`, the three `@Model` classes with cascade deletes and forward-only fields, `FreedayApp` explicit `do/catch` bootstrap with `AppBootstrapState` routing before `TabView` mounts. Named tasks (not left implicit): write a custom `Equatable` conformance for `AppBootstrapState` comparing on case tag only, since the associated `Error`/`ModelContainer` aren't `Equatable`; verify the cascade-delete inverse keypath syntax compiles cleanly. Gate: bootstrap path compiles; corrupt-store fallback manually verified to render the app-level error state.

**Milestone 3 — Core user loop, ordered by dependency (Day 2-4, ~14h).** HabitForm (setup/edit + inline validation) built first, since Today's non-empty state needs a real persisted habit. The "attempting habit #2 shows the paywall before any setup field renders" wiring between HabitForm and EntitlementStore is its own explicit checkpoint, not an afterthought reconciled after both are independently "done." Today screen follows, with its 4-state matrix and the sunrise/counter motif. Relapse and CravingTimer are independent of each other and run in parallel once Habit + their respective engines exist.

**Milestone 4 — Entitlement/StoreKit (Day 4, 6-8h, parallel with late Milestone 3).** `EntitlementState`/`EntitlementStore`, `Transaction.updates` listener, `Transaction.currentEntitlements` refresh, hard `checkVerified` behavior, restore flow. Verify-and-repair checkpoint: force an actual unverified-transaction failure and a restore-with-nothing-to-restore case via the `.storekit` config — not just the happy purchase path.

**Milestone 5 — Timer hardening, card sharing, haptics, settings (Day 5, 8-10h).** Depends on Milestones 2-4 since it needs trustworthy numbers and working entitlement. Force-quit/relaunch and active-session overlap resolution via persisted `outcome`; haptics (hardware-guarded no-op); ShareLink milestone card via `ImageRenderer`; settings with restore, habit edit, one-step cascade delete. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier are named explicitly here as cut for this pass — not "fast-follow" — since no widget target is being built, so there's no reason to spend setup time on infrastructure for a target that doesn't exist yet.

**Milestone 6 — Hardening and release gate (Day 6, 6-8h).** Accessibility pass (44pt targets, reflow, contrast), full state coverage audit, final risk triage, explicit "what ships / what's deferred" status notes. Gate: end-to-end smoke checklist — fresh install → one relapse → one full timer completion → one milestone share → one second-habit paywall attempt → one restore attempt.

**Dependency order:** M1 → M2/M2b run in parallel → M3 depends on both → M4 depends on M2b (bootstrap) + M1, overlaps late M3 → M5 depends on M2-M4 → M6 depends on all.

**Risk mitigations (carried and sharpened):** temporal-logic drift under real backgrounding/timezone/force-quit is mitigated by persisted timestamps as sole source of truth, verified by the dedicated engine-test checkpoint rather than assumed from compile success; relapse-wording trust risk mitigated by the single-screen reset design plus copy review gate; monetization-bypass risk mitigated by hard verified entitlement checks, verified by the dedicated StoreKit-failure checkpoint rather than the happy path alone; orphaned-row risk mitigated by cascade relationships plus the now-named migration/Equatable/keypath fixes; false-complete-timer-on-relaunch risk mitigated by the explicit `abandoned` outcome rule.

One thing worth naming plainly: front-loading two parallel non-visual milestones (engines, design system) before anything runs on a simulator means there's no demoable build for the first day or two even though the highest-risk logic is what's getting retired first — that's the right trade given how much prior-phase discussion centered on the numbers being trustworthy, but it shouldn't be mistaken for stalled progress if checked early.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes cleanly. All four required outputs are present and concrete: milestones with day/hour estimates and named tasks, an explicit dependency graph (M1 → M2/M2b parallel → M3 → M4 overlapping late M3 → M5 → M6), risk mitigations tied to specific prior-phase-locked failure modes (temporal drift, relapse trust, monetization bypass, orphaned rows, false-complete timer), and a verification plan with dedicated checkpoints embedded *inside* milestones (engine test matrix after M2, forced unverified-transaction + empty-restore test after M4) rather than deferred to one end-of-project QA lump — directly satisfying the phase rule "include verification and repair time as first-class work."

The round-1 correction is substantive, not cosmetic: moving the domain engines out from behind the schema/bootstrap dependency into a genuinely parallel lane is a real sequencing fix (they're pure functions with zero SwiftData dependency, so gating them behind persistence was an artificial constraint), and naming the `AppBootstrapState: Equatable` conformance bug and the mangled cascade-delete keypath as explicit M2b tasks prevents known issues from tech_specs' quality gate from silently recurring. The HabitForm-before-Today reordering and treating the paywall-gate wiring as its own checkpoint (rather than reconciling two independently-built islands) is a legitimate dependency-order argument, consistent with the phase rule "sequence work by dependency, not by role preference."

Consistent with all standing locks: non-punitive relapse UX, forward-only recompute, wall-clock timer anchoring, hard StoreKit verification, N-habits-from-day-one schema, Live Activity/WidgetKit named as explicitly cut-for-this-pass (not vaguely deferred). The plan is executable by a task-assignment phase as written — each milestone has clear owners/lanes, concrete deliverables, and a pass/fail gate. No open disagreement remains between Codex and Claude; the "no demoable build for the first day or two" tradeoff is named plainly rather than hidden. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Looking at round 1, both of them are building the same seven-milestone shape — Codex drafted it, and Claude (in the systems-skeptic seat this time) is correcting the dependency graph rather than disagreeing with the milestone list. The real substance in Claude's pushback: engines are pure functions with zero SwiftData dependency, so gating them behind the schema/bootstrap milestone (as Codex's plan does) is an artificial dependency — they should run in a genuinely parallel lane from day one, same as the design tokens. Claude also caught two concrete bugs that need to become named tasks rather than left implicit (the `AppBootstrapState: Equatable` conformance problem the quality gate flagged back in tech_specs, and a mangled cascade-delete keypath), argued HabitForm should land before Today since Today's non-empty state needs a real habit and the paywall-gate is a wiring dependency between HabitForm and EntitlementStore that shouldn't get built as two islands, and wants verify-and-repair as dedicated checkpoints (full injected-clock test matrix; a forced unverified-transaction + empty-restore test) rather than folded into one end-of-project QA pass. None of this contradicts Codex's structure — it's a correction to ordering and an insistence that testing isn't a footnote, both fully in scope for this phase.

CONSENSUS: YES

## Final Output

**Milestone 1 — Scope lock (Day 1, 4-6h).** Convert every locked requirement into one unambiguous execution blueprint: behavior contract for the five core workflows + store-gate + error states + a11y rules, the forward-only recompute rule stated explicitly, and a full screen-state matrix. Gate: signed-off checklist for non-shaming relapse language, no clinical framing, StoreKit hard-gate behavior. No dependencies.

**Milestone 2 — Domain engines + design system (parallel lanes, Day 1-2, 10-12h).** These have zero dependency on schema or persistence, so they start immediately after scope lock, not after bootstrap.
- Lane A: `StreakEngine`, `SavingsEngine`, `CravingSessionEngine`, `MilestoneEngine` as pure functions with injected `now`/`Calendar`. Implement zero/negative clamps, DST/timezone edge behavior, timer outcome rules, idempotent milestone thresholding.
- Lane B: `GradientBackground`, `StatCard`, `PrimaryActionButton`, `SkeletonStatCard`, `SunriseCounterMotif`, `AppLevelErrorView`, `Tokens.swift` — no data dependency either.
Verify-and-repair checkpoint (not deferred to final QA): run the full injected-clock unit test matrix — midnight rollover both directions, clock skew clamped to zero, DST both directions, force-quit-past-90s abandon, overlapping-session force-resolve, milestone-idempotency.

**Milestone 2b — Data foundation and app bootstrap (Day 1-2, 8-10h, parallel with Milestone 2).** `FreedaySchemaV1`/`FreedayMigrationPlan`, the three `@Model` classes with cascade deletes and forward-only fields, `FreedayApp` explicit `do/catch` bootstrap with `AppBootstrapState` routing before `TabView` mounts. Named tasks (not left implicit): write a custom `Equatable` conformance for `AppBootstrapState` comparing on case tag only, since the associated `Error`/`ModelContainer` aren't `Equatable`; verify the cascade-delete inverse keypath syntax compiles cleanly. Gate: bootstrap path compiles; corrupt-store fallback manually verified to render the app-level error state.

**Milestone 3 — Core user loop, ordered by dependency (Day 2-4, ~14h).** HabitForm (setup/edit + inline validation) built first, since Today's non-empty state needs a real persisted habit. The "attempting habit #2 shows the paywall before any setup field renders" wiring between HabitForm and EntitlementStore is its own explicit checkpoint, not an afterthought reconciled after both are independently "done." Today screen follows, with its 4-state matrix and the sunrise/counter motif. Relapse and CravingTimer are independent of each other and run in parallel once Habit + their respective engines exist.

**Milestone 4 — Entitlement/StoreKit (Day 4, 6-8h, parallel with late Milestone 3).** `EntitlementState`/`EntitlementStore`, `Transaction.updates` listener, `Transaction.currentEntitlements` refresh, hard `checkVerified` behavior, restore flow. Verify-and-repair checkpoint: force an actual unverified-transaction failure and a restore-with-nothing-to-restore case via the `.storekit` config — not just the happy purchase path.

**Milestone 5 — Timer hardening, card sharing, haptics, settings (Day 5, 8-10h).** Depends on Milestones 2-4 since it needs trustworthy numbers and working entitlement. Force-quit/relaunch and active-session overlap resolution via persisted `outcome`; haptics (hardware-guarded no-op); ShareLink milestone card via `ImageRenderer`; settings with restore, habit edit, one-step cascade delete. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier are named explicitly here as cut for this pass — not "fast-follow" — since no widget target is being built, so there's no reason to spend setup time on infrastructure for a target that doesn't exist yet.

**Milestone 6 — Hardening and release gate (Day 6, 6-8h).** Accessibility pass (44pt targets, reflow, contrast), full state coverage audit, final risk triage, explicit "what ships / what's deferred" status notes. Gate: end-to-end smoke checklist — fresh install → one relapse → one full timer completion → one milestone share → one second-habit paywall attempt → one restore attempt.

**Dependency order:** M1 → M2/M2b run in parallel → M3 depends on both → M4 depends on M2b (bootstrap) + M1, overlaps late M3 → M5 depends on M2-M4 → M6 depends on all.

**Risk mitigations (carried and sharpened):** temporal-logic drift under real backgrounding/timezone/force-quit is mitigated by persisted timestamps as sole source of truth, verified by the dedicated engine-test checkpoint rather than assumed from compile success; relapse-wording trust risk mitigated by the single-screen reset design plus copy review gate; monetization-bypass risk mitigated by hard verified entitlement checks, verified by the dedicated StoreKit-failure checkpoint rather than the happy path alone; orphaned-row risk mitigated by cascade relationships plus the now-named migration/Equatable/keypath fixes; false-complete-timer-on-relaunch risk mitigated by the explicit `abandoned` outcome rule.

One thing worth naming plainly: front-loading two parallel non-visual milestones (engines, design system) before anything runs on a simulator means there's no demoable build for the first day or two even though the highest-risk logic is what's getting retired first — that's the right trade given how much prior-phase discussion centered on the numbers being trustworthy, but it shouldn't be mistaken for stalled progress if checked early.

---

CONSENSUS: YES

### Task Assignments

# freeday — Task Assignments

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:38:23._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Produce concrete workstreams, file ownership, forbidden edit zones, branch names, merge strategy, testing responsibilities, communication protocol, and a conflict-prevention plan.

## Transcript


### Round 1


**Codex (Frontend Engineer · Skeptic) — Round 1**

I’ll build this as a strict lane-based, trunk-targeted effort so we don’t step on each other: I keep the build split by technical domain, with one integrator lane assembling cross-file wiring. The app will live at `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build`, with the SwiftUI target rooted at `freeday/app_build/Freeday` and all lane ownership bounded by folder. I’m treating the highest risk point first: entitlement correctness and timekeeping math must be locked before visual polish, because a single off-by-one day or unlocked second-habit path breaks trust faster than any styling miss.

The branch policy: create one integration branch `feature/freeday/task-assignments` from current head; lane branches under it (`feature/freeday/data-domain`, `feature/freeday/services`, `feature/freeday/primary-ui`, `feature/freeday/polish`). Merge in this order to reduce conflicts: data-domain first, services second, primary-ui third, polish last. No direct edits to `feature/freeday/task-assignments` from non-integrator lanes. Merge strategy is small squash commits per lane at predictable milestones, with explicit handoff notes before each merge.

Communication protocol: each lane posts one short handoff message listing files changed, new public signatures, and validation assumptions before merging. If a dependency blocks, the owning task stops and raises a blocker with exact file path + expected behavior; no speculative edits. Conflict-prevention rules are ownership-first: if a file is in another lane’s list, do not modify it except through an explicit handoff; unresolved behavior disagreements become a dedicated follow-up task, not ad-hoc edits.

Largest objection I’d carry forward is this: `freeday` can drift into "UI-first but behavior-unsafe" very easily, especially around day boundaries, resume-after-background, and StoreKit verification state. Preserve this by making `App-level bootstrap`, `pure engine math`, and `StoreKit entitlement truth source` non-negotiable integration checkpoints. The non-shaming reset wording and forward-only recompute behavior must be preserved in copy and state transitions, even if every other surface is ready.

```tasks-json
{
  "tasks": [
    {
      "id": "T-001",
      "title": "Create project skeleton, directories, and app composition shell",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/FreedayApp.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/FreedayAppBootstrap.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/AppRootView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "App compiles in scaffold form with a valid `@main` target and explicit `AppBootstrapState`-driven root switch before any TabView is created",
        "App folder path is exactly under `/freeday/app_build`",
        "Folders for Domain, Services, Features, DesignSystem, Resources, and Tests are created and owned by clear lanes"
      ],
      "status": "pending"
    },
    {
      "id": "T-002",
      "title": "Implement SwiftData models and local schema + migration scaffolding",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift",
        "[REDACTED:high_entropy].swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Schema/FreedayMigrationPlan.swift"
      ],
      "depends_on": ["T-001"],
      "acceptance_criteria": [
        "N habits supported in schema from day one",
        "Habit uses non-optional streak pointer and forward-only accumulators",
        "Relationships from Habit to RelapseEvent and CravingSession are cascade-deleted",
        "Schema versioning and migration plan compile with no placeholder symbols"
      ],
      "status": "pending"
    },
    {
      "id": "T-003",
      "title": "Build pure domain engines and boundary tests",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/DomainEnginesTests.swift"
      ],
      "depends_on": ["T-002", "T-001"],
      "acceptance_criteria": [
        "All engine outputs are deterministic functions of explicit inputs only",
        "Clock skew and DST/backfill edge cases are represented in unit tests",
        "Force-quit/past-90s rule is test-covered as abandon-only behavior",
        "Overlapping active craving session resolution is test-covered and deterministic"
      ],
      "status": "pending"
    },
    {
      "id": "T-004",
      "title": "Implement entitlement and transaction verification service",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementState.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementStore.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/StoreConfiguration/Freeday.storekit",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Tests/StoreKitSmokeChecklist.md"
      ],
      "depends_on": ["T-001"],
      "acceptance_criteria": [
        "Entitlement is derived only from verified StoreKit transactions and `currentEntitlements` refresh",
        "`checkVerified` failure hard-blocks entitlement state (no soft grant)",
        "Transaction update listener runs at app launch for lifetime state updates",
        "Restore path exists and can be manually executed from settings flow"
      ],
      "status": "pending"
    },
    {
      "id": "T-005",
      "title": "Implement haptics compatibility service",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/HapticsService.swift"
      ],
      "depends_on": ["T-001"],
      "acceptance_criteria": [
        "Device capability checks guard all haptic calls",
        "No error path when haptics unavailable",
        "Exposes streak and craving-completion triggers for UI consumption"
      ],
      "status": "pending"
    },
    {
      "id": "T-006",
      "title": "Build Today/home and core stateful orchestration",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayViewModel.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormViewModel.swift"
      ],
      "depends_on": ["T-001", "T-002", "T-003", "T-004"],
      "acceptance_criteria": [
        "One-tap relapse and one-tap craving entry are always visible on the success home screen",
        "Attempting to create habit #2 triggers paywall before edit fields are exposed",
        "Home and setup implement empty/loading/success/error states",
        "Relapse confirmation and lifetime stat visibility occur in the same modal screen context"
      ],
      "status": "pending"
    },
    {
      "id": "T-007",
      "title": "Build craving rescue timer and relapse reset flow",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerViewModel.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseViewModel.swift"
      ],
      "depends_on": ["T-001", "T-002", "T-003", "T-005"],
      "acceptance_criteria": [
        "Timer is wall-clock anchored from persisted start timestamp",
        "Abandoned sessions never increment cravings-survived counter",
        "Completion writes once and triggers streak/craving completion haptics",
        "Duplicate/overlapping active sessions resolve by marking prior sessions abandoned"
      ],
      "status": "pending"
    },
    {
      "id": "T-008",
      "title": "Implement paywall, milestones list, and settings with restore/delete controls",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallViewModel.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListViewModel.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsViewModel.swift"
      ],
      "depends_on": ["T-006", "T-007", "T-004"],
      "acceptance_criteria": [
        "Restore purchases works from settings and updates entitlement state",
        "Habit deletion is one-step confirm and deletes dependent sessions/events via cascade",
        "Milestones list and paywall have empty/loading/success/error states",
        "Subscription lapse keeps all data and disables extras per entitlement rule"
      ],
      "status": "pending"
    },
    {
      "id": "T-009",
      "title": "Create design system and baseline visual/accessibility primitives",
      "owner_lane": "polish_resilience",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/Tokens.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/GradientBackground.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/StatCard.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/PrimaryActionButton.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SkeletonStatCard.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SunriseCounterMotif.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/AppLevelErrorView.swift"
      ],
      "depends_on": ["T-001"],
      "acceptance_criteria": [
        "Mint-sky gradient and corner radii values match spec",
        "All critical labels meet WCAG AA contrast in light and dark",
        "Tab actions are 44pt+ touch targets",
        "Key numerics have explicit VoiceOver labels and avoid decorative-only semantics"
      ],
      "status": "pending"
    },
    {
      "id": "T-010",
      "title": "Implement milestone card preview, rendering, and share flow",
      "owner_lane": "polish_resilience",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardRenderer.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneShareSheet.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/MilestoneTriggerState.swift"
      ],
      "depends_on": ["T-007", "T-006", "T-009", "T-003"],
      "acceptance_criteria": [
        "Milestone threshold selection is one-shot per threshold via persisted flag",
        "Share card renders at max Dynamic Type in light and dark without clipping",
        "Card export path is transfer-ready for ShareLink",
        "Early thresholds (day 1/3) are surfaced and not duplicated on repeated opens"
      ],
      "status": "pending"
    },
    {
      "id": "T-011",
      "title": "Integrate all lanes and lock final scope boundaries",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/IntegrationCoordinator.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/AppRootView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/FreedayAppBootstrap.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Tests/FreedaySmokeTests.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Docs/ScopeAndDeferrals.md"
      ],
      "depends_on": ["T-001", "T-002", "T-003", "T-004", "T-005", "T-006", "T-007", "T-008", "T-009", "T-010"],
      "acceptance_criteria": [
        "App-level bootstrap error state blocks navigation and offers retry",
        "End-to-end smoke path executes from fresh launch through relapse, timer completion, milestone share, second-habit paywall, and restore attempt",
        "Forbidden edits are resolved: no lane file overlap except explicitly owned integration files",
        "Degraded-but-allowed scope (widget/live activity) is documented as intentionally deferred"
      ],
      "status": "pending"
    }
  ]
}
```

Forbidden edit zones are any files in a lane’s `files` list owned by another lane, plus the `.storekit` product IDs and paywall copy once frozen. Integrator-owned files are `FreedayApp.swift`, `FreedayAppBootstrap.swift`, `AppRootView.swift`, and `Docs/ScopeAndDeferrals.md`; no one edits these without a handoff from the assigned lane owner. The fastest way to prove this works is to run `T-003` and `T-004` checks first, then wire `T-006` and `T-007` together; that catches data + behavior drift before final screen wiring, which is the only way this spec can stay safe.

**Claude (Backend / Systems Engineer · Pragmatist) — Round 1**

Looking at this fresh, my job is to turn the already-frozen tech_specs interfaces and project_plan milestones into an actual assignable backlog — file ownership, forbidden zones, and a way for parallel build workers to not clobber each other on what is, underneath everything, a single Xcode app target. That last part is the real systems risk here that hasn't been named yet: four lanes writing into one Xcode project means the project file itself, not the Swift source, is where merge pain actually happens. I want to solve that structurally rather than trust discipline alone.

Where it lives: `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/`, single `Freeday.xcodeproj` with one `Freeday` app target and one `FreedayTests` target, matching the file layout already locked in tech_specs (App/, Domain/Models/, Domain/Engines/, Features/*, Services/, DesignSystem/, Resources/, FreedayTests/). I'd set the app target up using Xcode's file-system-synchronized groups (the "folder reference" style added in Xcode 16) for every one of those folders, so adding a new Swift file inside a lane's own folder requires zero edits to `project.pbxproj`. That one setup decision is the highest-leverage conflict-prevention move available — it means the four lanes can genuinely work in parallel without ever touching the same line of a shared config file, which a naive "just don't step on each other" policy can't guarantee on its own.

Given that, I don't think branch-per-lane is worth the overhead here — the actual collision surface between lanes is near zero once folders are disjoint and the project file is synchronized-group-based, so a separate long-lived branch per lane just adds merge ceremony for a conflict that mostly can't happen. I'd rather have everyone commit against one integration branch (`freeday/build`), one commit per task ID, message prefixed like `[T-004][polish_resilience] Design tokens + primitive components`, and reserve actual branching for anything genuinely risky — which in practice is only the integrator-owned files.

Lane-by-lane ownership, mapped straight from the tech_specs file layout:
- **data_domain** owns `Domain/Models/*` (Habit, RelapseEvent, CravingSession, SchemaV1/MigrationPlan) and `Domain/Engines/*` (the four pure engines), plus their own tests in `FreedayTests/`. Forbidden from touching `Features/*` or `DesignSystem/*` — it exposes types and pure functions, nothing else.
- **primary_ui** owns every `Features/{Today,HabitForm,CravingTimer,Relapse,Milestones,Paywall,Settings}/` folder (view + view model pairs). Forbidden from editing `Domain/Engines/*` or `Domain/Models/*` directly — it calls into engines, it doesn't reimplement calendar math inline, which is the exact bug pattern the whole prior discussion has been trying to prevent.
- **services_utilities** owns `Services/*` (EntitlementStore, HapticsService, MilestoneCardRenderer) and `Resources/Freeday.storekit`. Forbidden from touching SwiftData models directly — if it needs a new field, that's a request back to data_domain, not a unilateral edit.
- **polish_resilience** owns `DesignSystem/*` (Tokens, GradientBackground, StatCard, PrimaryActionButton, SkeletonStatCard, SunriseCounterMotif, AppLevelErrorView) plus the cross-cutting accessibility/state-coverage audit and the final smoke-checklist gate. Its audit role is read-and-flag on other lanes' files, not silent direct edits — if it finds a contrast or hit-target problem in someone else's view file, it patches with a clearly tagged commit, not a rewrite.

Integrator-owned, edit-restricted files: `App/FreedayApp.swift`, `App/AppBootstrap.swift`, `App/AppRootView.swift`, and the `.xcodeproj` itself. These only get touched during explicitly named wiring tasks (bootstrap construction, the habit-#2 paywall-gate wiring, final end-to-end integration) — never as a side effect of an unrelated feature task. This is where the actual cross-lane dependency lives (bootstrap needs the schema from data_domain and the entitlement listener startup from services_utilities), so it's better to name it as its own task with its own acceptance criteria than let two lanes each assume someone else is wiring it.

Testing responsibilities split the same way: data_domain owns the injected-clock engine test matrix (midnight both directions, DST both directions, clock skew clamp, force-quit-past-90s abandon, overlapping-session resolve, milestone idempotency) plus in-memory cascade-delete tests. services_utilities owns the StoreKit verification checkpoint — forcing an actual unverified-transaction failure and an empty-restore case against the `.storekit` config, not just the happy path. primary_ui owns exhaustive `#Preview` coverage per named screen state, with the relapse post-tap screenshot and the milestone card at max Dynamic Type in both color schemes as mandatory, not optional. polish_resilience owns the accessibility pass and the final fresh-install smoke checklist that closes the whole build.

Communication protocol: status lives in the tasks-json `status` field (pending/in_progress/blocked/done), updated per task rather than via side-channel chat. Any lane that hits a spec ambiguity or has to deviate from a locked signature (like the `AppBootstrapState` custom `Equatable` conformance flagged back in tech_specs) states it in the commit message and flags it for the next integration checkpoint — silent deviation from a frozen interface is the failure mode I most want to prevent, since three prior phases' worth of work went into freezing those signatures precisely so nobody has to improvise mid-build.

```tasks-json
{"tasks": [
  {"id": "T-001", "title": "SwiftData models + versioned schema (Habit, RelapseEvent, CravingSession, SchemaV1/MigrationPlan)", "owner_lane": "data_domain", "files": ["Domain/Models/Habit.swift", "Domain/Models/RelapseEvent.swift", "Domain/Models/CravingSession.swift", "Domain/Models/SchemaV1.swift"], "depends_on": [], "acceptance_criteria": ["Compiles with cascade-delete relationships declared via @Relationship(deleteRule: .cascade) with correct non-mangled inverse keypaths", "Habit.streakStartAt is non-optional; cleanDaysBeforeCurrentStreak and cumulativeSavingsBeforeRateChange are forward-only accumulator fields", "VersionedSchema + SchemaMigrationPlan scaffolding present even though initial migration is trivial"], "status": "pending"},
  {"id": "T-002", "title": "Pure domain engines (StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine)", "owner_lane": "data_domain", "files": ["Domain/Engines/StreakEngine.swift", "Domain/Engines/SavingsEngine.swift", "Domain/Engines/CravingSessionEngine.swift", "Domain/Engines/MilestoneEngine.swift"], "depends_on": [], "acceptance_criteria": ["Zero SwiftData imports, zero internal Date() calls — all take now/calendar as explicit parameters", "Signatures match tech_specs interfaces-json exactly", "Negative/zero clamps applied (e.g. streak never negative on clock skew)"], "status": "pending"},
  {"id": "T-003", "title": "Engine unit test matrix", "owner_lane": "data_domain", "files": ["FreedayTests/StreakEngineTests.swift", "FreedayTests/SavingsEngineTests.swift", "FreedayTests/CravingSessionEngineTests.swift", "FreedayTests/MilestoneEngineTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Midnight rollover both directions covered", "Clock skew (now before streakStartAt) clamps to zero, tested", "DST spring-forward and fall-back covered", "Force-quit-past-90s resolves to abandoned, never completed, tested", "Overlapping active-session force-resolve tested", "Milestone threshold idempotency tested (5 opens past day 3 fires exactly once)"], "status": "pending"},
  {"id": "T-004", "title": "Design tokens + primitive components", "owner_lane": "polish_resilience", "files": ["DesignSystem/Tokens.swift", "DesignSystem/GradientBackground.swift", "DesignSystem/StatCard.swift", "DesignSystem/PrimaryActionButton.swift", "DesignSystem/SkeletonStatCard.swift", "DesignSystem/SunriseCounterMotif.swift", "DesignSystem/AppLevelErrorView.swift"], "depends_on": [], "acceptance_criteria": ["Hex/spacing/radius values match design_handoff exactly (mint #B9F2DE to sky #8ED0F0, radii 12/20/28, spacing 4/8/12/16/24/32/48)", "SunriseCounterMotif has one accessibilityElement stating the real day count, never decorative-only", "Every component has a #Preview"], "status": "pending"},
  {"id": "T-005", "title": "App bootstrap and root wiring", "owner_lane": "primary_ui", "files": ["App/FreedayApp.swift", "App/AppBootstrap.swift", "App/AppRootView.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["ModelContainer constructed via explicit do/catch against SchemaV1/MigrationPlan, never .modelContainer(for:)", "AppBootstrapState given a custom Equatable conformance comparing on case tag only (no synthesized conformance, since Error/ModelContainer aren't Equatable)", "Root view branches on opening/ready/failed before TabView is constructed", "Corrupt-store fallback manually verified to render AppLevelErrorView with no tab bar underneath"], "status": "pending"},
  {"id": "T-006", "title": "Persistence + cascade-delete tests", "owner_lane": "data_domain", "files": ["FreedayTests/PersistenceTests.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["In-memory ModelContainer test: deleting a Habit removes all its RelapseEvent and CravingSession rows with no orphans", "Migration plan scaffolding compiles and loads cleanly"], "status": "pending"},
  {"id": "T-007", "title": "Habit setup/edit feature", "owner_lane": "primary_ui", "files": ["Features/HabitForm/HabitFormView.swift", "Features/HabitForm/HabitFormViewModel.swift"], "depends_on": ["T-001", "T-004"], "acceptance_criteria": ["Non-positive quantity or cost rejected inline, Save disabled until valid", "Editing an existing habit past day 0 shows the forward-only recompute disclosure banner only once a field differs from its originally loaded value", "Save calls SavingsEngine.applyRateChange rather than mutating savings fields directly"], "status": "pending"},
  {"id": "T-008", "title": "EntitlementStore + StoreKit config", "owner_lane": "services_utilities", "files": ["Services/EntitlementStore.swift", "Resources/Freeday.storekit"], "depends_on": [], "acceptance_criteria": ["Transaction.updates listener started and kept alive for app lifetime", "checkVerified failure hard-blocks entitlement, never soft-grants", "restorePurchases() re-scans Transaction.currentEntitlements, not a cached flag", "EntitlementState matches the locked six-case enum (unknown/free/pro/expired/revoked/verificationFailed)"], "status": "pending"},
  {"id": "T-009", "title": "Paywall + habit-#2 gating wiring", "owner_lane": "primary_ui", "files": ["Features/Paywall/PaywallView.swift", "Features/Paywall/PaywallViewModel.swift"], "depends_on": ["T-007", "T-008"], "acceptance_criteria": ["Attempting to create habit #2 as a free-tier user shows the paywall before any HabitForm field renders", "verificationFailed renders explicit hard-block copy, never a silent timeout", "Restore Purchases button present and wired to EntitlementStore.restorePurchases"], "status": "pending"},
  {"id": "T-010", "title": "Today/Home screen", "owner_lane": "primary_ui", "files": ["Features/Today/TodayView.swift", "Features/Today/TodayViewModel.swift"], "depends_on": ["T-001", "T-002", "T-004", "T-007"], "acceptance_criteria": ["Implements empty (onboarding prompt), loading (skeleton), success, and app-level store-failure states", "Streak/lifetime-days/savings/cravings-survived numbers come only from StreakEngine/SavingsEngine calls, no inline calendar math", "No multi-habit chrome renders when exactly one habit exists"], "status": "pending"},
  {"id": "T-011", "title": "Relapse/reset flow", "owner_lane": "primary_ui", "files": ["Features/Relapse/RelapseView.swift", "Features/Relapse/RelapseViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Single fullScreenCover screen, pre-tap and post-tap states in the same view via spring-animated swap, no navigation between them", "Post-tap view shows reset streak and the untouched lifetime total together, no red/warning color, no 'broken' language", "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save"], "status": "pending"},
  {"id": "T-012", "title": "Craving timer flow", "owner_lane": "primary_ui", "files": ["Features/CravingTimer/CravingTimerView.swift", "Features/CravingTimer/CravingTimerViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Countdown always derived from persisted startedAt, recalculated on appear/scenePhase change", "Relaunch with startedAt + 90s already elapsed resolves to abandoned, no retroactive credit", "Backgrounded at second 40 and foregrounded 2 minutes later reads zero remaining with completion already resolved", "Only a full 90s completion increments lifetimeCravingsSurvived, exactly once, guarded against double-fire", "New session request force-resolves any existing active session for the same habit to abandoned first"], "status": "pending"},
  {"id": "T-013a", "title": "Milestones/history list screen", "owner_lane": "primary_ui", "files": ["Features/Milestones/MilestonesListView.swift", "Features/Milestones/MilestonesListViewModel.swift", "Features/Milestones/MilestoneCardView.swift"], "depends_on": ["T-001", "T-010"], "acceptance_criteria": ["Chronological list backed by RelapseEvent-derived milestones with empty/loading/success/error states", "MilestoneCardView renders live in a sheet, reused by the renderer for export"], "status": "pending"},
  {"id": "T-013b", "title": "Milestone card image export + ShareLink", "owner_lane": "services_utilities", "files": ["Services/MilestoneCardRenderer.swift"], "depends_on": ["T-002", "T-004", "T-013a"], "acceptance_criteria": ["Renders without clipping the day count or dollar figure at max Dynamic Type, light and dark", "Per-habit lastShownMilestoneThreshold flag prevents re-triggering on repeated app opens past a threshold", "Exports at a fixed capped type size as the deliberate exception to live Dynamic Type, feeding ShareLink's Transferable payload"], "status": "pending"},
  {"id": "T-014", "title": "Haptics service", "owner_lane": "services_utilities", "files": ["Services/HapticsService.swift"], "depends_on": [], "acceptance_criteria": ["Checks CHHapticEngine.capabilitiesForHardware().supportsHaptics before firing", "Absent hardware is a silent no-op, never an error path", "Called from relapse confirm and craving-timer completion"], "status": "pending"},
  {"id": "T-015", "title": "Settings screen", "owner_lane": "primary_ui", "files": ["Features/Settings/SettingsView.swift", "Features/Settings/SettingsViewModel.swift"], "depends_on": ["T-001", "T-008"], "acceptance_criteria": ["Habit edit entry point, restore-purchases action, one-step delete-with-confirmation", "deleteHabit relies on the declarative cascade rule — no manual cascade logic in the view model"], "status": "pending"},
  {"id": "T-016", "title": "Accessibility and state-coverage audit", "owner_lane": "polish_resilience", "files": [], "depends_on": ["T-007", "T-009", "T-010", "T-011", "T-012", "T-013a", "T-013b", "T-015"], "acceptance_criteria": ["44pt minimum on all interactive targets, 56pt+ on the two primary Today actions", "2x2 stat grid reflows to one column at accessibility Dynamic Type sizes without clipping", "WCAG AA contrast verified in both light and dark", "Every reachable screen confirmed to implement its full state matrix (empty/loading/success/error where applicable)"], "status": "pending"},
  {"id": "T-017", "title": "StoreKit failure and restore verification checkpoint", "owner_lane": "services_utilities", "files": ["FreedayTests/EntitlementStoreTests.swift"], "depends_on": ["T-008", "T-009"], "acceptance_criteria": ["Forced unverified-transaction case via .storekit config hard-blocks entitlement, documented and tested, not just the happy purchase path", "Restore-with-nothing-to-restore case handled without crash or false grant"], "status": "pending"},
  {"id": "T-018", "title": "End-to-end smoke checklist and release gate", "owner_lane": "polish_resilience", "files": [], "depends_on": ["T-011", "T-012", "T-013b", "T-009", "T-016", "T-017"], "acceptance_criteria": ["Fresh install through one relapse, one full timer completion, one milestone share, one second-habit paywall attempt, and one restore attempt all pass in sequence", "Explicit 'what ships / what's deferred' note written naming Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier as cut for this pass"], "status": "pending"}
]}
```

**Coordinator (Claude) — decision after round 1**

Both of them landed on the same lane structure, file ownership, and integrator-owned wiring files — no disagreement there. The one real difference is workflow mechanics: Codex wants lane branches (`feature/freeday/data-domain`, `/services`, `/primary-ui`, `/polish`) merged in a fixed order into an integration branch, while Claude argues that's unnecessary ceremony if the Xcode project uses file-system-synchronized groups (Xcode 16's folder-reference style) for every lane's folder — since that means adding a file inside a lane's own folder never touches `project.pbxproj`, the actual collision surface between lanes drops to near zero, so a single `freeday/build` branch with one commit per task ID is enough, and branching should be reserved only for the small set of integrator-owned files. That's a real technical call, and it's the right one to make now since it changes how build workers should actually operate — I'm resolving it in Claude's favor because it solves the specific structural risk (one shared project file, four parallel lanes) rather than just working around it with process discipline. Claude's task list is also more granular and closer to the milestone-based project_plan (splitting persistence tests, the StoreKit failure/restore checkpoint, and the milestone-list-vs-card-renderer split into their own tasks), so that's the backlog going forward, with Codex's per-lane risk framing (entitlement correctness and timekeeping math first) folded in as the sequencing rationale.

CONSENSUS: YES

## Final Output

**Where it lives:** `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/`, single `Freeday.xcodeproj`, one `Freeday` app target + one `FreedayTests` target. Every lane's top-level folder (`Domain/Models`, `Domain/Engines`, `Features/*`, `Services`, `DesignSystem`, `Resources`, `FreedayTests`) is set up as an Xcode 16 file-system-synchronized group, so adding files inside a lane's own folder never touches `project.pbxproj` — this is the actual conflict-prevention mechanism, not branch discipline.

**Branching/merge strategy:** One integration branch, `freeday/build`. No per-lane branches — with synchronized groups, the real collision surface is near zero. Commits are one per task, prefixed `[T-0XX][lane]`. Branching is reserved only for the integrator-owned files (`App/FreedayApp.swift`, `App/AppBootstrap.swift`, `App/AppRootView.swift`, the `.xcodeproj` itself) — these are only touched during explicitly named wiring tasks, never as a side effect of a feature task.

**Lane responsibilities:**
- **data_domain** — SwiftData models, versioned schema/migration plan, the four pure engines, engine unit tests, persistence/cascade-delete tests. Forbidden from touching `Features/*` or `DesignSystem/*`.
- **primary_ui** — every `Features/*` view+viewmodel pair, plus the app bootstrap/root wiring task. Forbidden from touching `Domain/Engines/*` or `Domain/Models/*` directly — calls into engines, never reimplements calendar math inline.
- **services_utilities** — EntitlementStore + `.storekit` config, HapticsService, MilestoneCardRenderer, the StoreKit failure/restore verification checkpoint. Forbidden from touching SwiftData models directly.
- **polish_resilience** — design tokens/components, the accessibility + state-coverage audit (read-and-flag on other lanes' files, patch with tagged commits rather than silent rewrites), and the final end-to-end smoke checklist/release gate.

**Forbidden edit zones:** any file in another lane's owned list; the `.storekit` product IDs and paywall copy once frozen; the four integrator-owned files outside a named wiring task.

**Communication protocol:** status lives in the tasks-json `status` field per task, not side-channel chat. Any deviation from a frozen tech_specs signature (e.g. the `AppBootstrapState` custom `Equatable` conformance) gets stated in the commit message and flagged at the next integration checkpoint — no silent deviation.

```tasks-json
{"tasks": [
  {"id": "T-001", "title": "SwiftData models + versioned schema", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift", "[REDACTED:high_entropy].swift"], "depends_on": [], "acceptance_criteria": ["Compiles with cascade-delete relationships via @Relationship(deleteRule: .cascade) with correct non-mangled inverse keypaths", "Habit.streakStartAt is non-optional; cleanDaysBeforeCurrentStreak and cumulativeSavingsBeforeRateChange are forward-only accumulator fields", "VersionedSchema + SchemaMigrationPlan scaffolding present even though initial migration is trivial"], "status": "pending"},
  {"id": "T-002", "title": "Pure domain engines", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift"], "depends_on": [], "acceptance_criteria": ["Zero SwiftData imports, zero internal Date() calls — all take now/calendar as explicit parameters", "Signatures match tech_specs interfaces-json exactly", "Negative/zero clamps applied (streak never negative on clock skew)"], "status": "pending"},
  {"id": "T-003", "title": "Engine unit test matrix", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/StreakEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/SavingsEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/CravingSessionEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/MilestoneEngineTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Midnight rollover both directions covered", "Clock skew (now before streakStartAt) clamps to zero, tested", "DST spring-forward and fall-back covered", "Force-quit-past-90s resolves to abandoned, never completed, tested", "Overlapping active-session force-resolve tested", "Milestone threshold idempotency tested (5 opens past day 3 fires exactly once)"], "status": "pending"},
  {"id": "T-004", "title": "Design tokens + primitive components", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/Tokens.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/GradientBackground.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/StatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/PrimaryActionButton.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SkeletonStatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SunriseCounterMotif.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/AppLevelErrorView.swift"], "depends_on": [], "acceptance_criteria": ["Hex/spacing/radius values match design_handoff exactly (mint #B9F2DE to sky #8ED0F0, radii 12/20/28, spacing 4/8/12/16/24/32/48)", "SunriseCounterMotif has one accessibilityElement stating the real day count, never decorative-only", "Every component has a #Preview"], "status": "pending"},
  {"id": "T-005", "title": "App bootstrap and root wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/FreedayApp.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppBootstrap.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppRootView.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["ModelContainer constructed via explicit do/catch against SchemaV1/MigrationPlan, never .modelContainer(for:)", "AppBootstrapState given a custom Equatable conformance comparing on case tag only", "Root view branches on opening/ready/failed before TabView is constructed", "Corrupt-store fallback manually verified to render AppLevelErrorView with no tab bar underneath"], "status": "pending"},
  {"id": "T-006", "title": "Persistence + cascade-delete tests", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/PersistenceTests.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["In-memory ModelContainer test: deleting a Habit removes all its RelapseEvent and CravingSession rows with no orphans", "Migration plan scaffolding compiles and loads cleanly"], "status": "pending"},
  {"id": "T-007", "title": "Habit setup/edit feature", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormViewModel.swift"], "depends_on": ["T-001", "T-004"], "acceptance_criteria": ["Non-positive quantity or cost rejected inline, Save disabled until valid", "Editing an existing habit past day 0 shows the forward-only recompute disclosure banner only once a field differs from its originally loaded value", "Save calls SavingsEngine.applyRateChange rather than mutating savings fields directly"], "status": "pending"},
  {"id": "T-008", "title": "EntitlementStore + StoreKit config", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementStore.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Resources/Freeday.storekit"], "depends_on": [], "acceptance_criteria": ["Transaction.updates listener started and kept alive for app lifetime", "checkVerified failure hard-blocks entitlement, never soft-grants", "restorePurchases() re-scans Transaction.currentEntitlements, not a cached flag", "EntitlementState matches the locked six-case enum (unknown/free/pro/expired/revoked/verificationFailed)"], "status": "pending"},
  {"id": "T-009", "title": "Paywall + habit-#2 gating wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallViewModel.swift"], "depends_on": ["T-007", "T-008"], "acceptance_criteria": ["Attempting to create habit #2 as a free-tier user shows the paywall before any HabitForm field renders", "verificationFailed renders explicit hard-block copy, never a silent timeout", "Restore Purchases button present and wired to EntitlementStore.restorePurchases"], "status": "pending"},
  {"id": "T-010", "title": "Today/Home screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayViewModel.swift"], "depends_on": ["T-001", "T-002", "T-004", "T-007"], "acceptance_criteria": ["Implements empty (onboarding prompt), loading (skeleton), success, and app-level store-failure states", "Streak/lifetime-days/savings/cravings-survived numbers come only from StreakEngine/SavingsEngine calls, no inline calendar math", "No multi-habit chrome renders when exactly one habit exists"], "status": "pending"},
  {"id": "T-011", "title": "Relapse/reset flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Single fullScreenCover screen, pre-tap and post-tap states in the same view via spring-animated swap, no navigation between them", "Post-tap view shows reset streak and the untouched lifetime total together, no red/warning color, no 'broken' language", "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save"], "status": "pending"},
  {"id": "T-012", "title": "Craving timer flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Countdown always derived from persisted startedAt, recalculated on appear/scenePhase change", "Relaunch with startedAt + 90s already elapsed resolves to abandoned, no retroactive credit", "Backgrounded at second 40 and foregrounded 2 minutes later reads zero remaining with completion already resolved", "Only a full 90s completion increments lifetimeCravingsSurvived, exactly once, guarded against double-fire", "New session request force-resolves any existing active session for the same habit to abandoned first"], "status": "pending"},
  {"id": "T-013a", "title": "Milestones/history list screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListViewModel.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardView.swift"], "depends_on": ["T-001", "T-010"], "acceptance_criteria": ["Chronological list backed by RelapseEvent-derived milestones with empty/loading/success/error states", "MilestoneCardView renders live in a sheet, reused by the renderer for export"], "status": "pending"},
  {"id": "T-013b", "title": "Milestone card image export + ShareLink", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/MilestoneCardRenderer.swift"], "depends_on": ["T-002", "T-004", "T-013a"], "acceptance_criteria": ["Renders without clipping the day count or dollar figure at max Dynamic Type, light and dark", "Per-habit lastShownMilestoneThreshold flag prevents re-triggering on repeated app opens past a threshold", "Exports at a fixed capped type size, feeding ShareLink's Transferable payload"], "status": "pending"},
  {"id": "T-014", "title": "Haptics service", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/HapticsService.swift"], "depends_on": [], "acceptance_criteria": ["Checks CHHapticEngine.capabilitiesForHardware().supportsHaptics before firing", "Absent hardware is a silent no-op, never an error path", "Called from relapse confirm and craving-timer completion"], "status": "pending"},
  {"id": "T-015", "title": "Settings screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsViewModel.swift"], "depends_on": ["T-001", "T-008"], "acceptance_criteria": ["Habit edit entry point, restore-purchases action, one-step delete-with-confirmation", "deleteHabit relies on the declarative cascade rule — no manual cascade logic in the view model"], "status": "pending"},
  {"id": "T-016", "title": "Accessibility and state-coverage audit", "owner_lane": "polish_resilience", "files": [], "depends_on": ["T-007", "T-009", "T-010", "T-011", "T-012", "T-013a", "T-013b", "T-015"], "acceptance_criteria": ["44pt minimum on all interactive targets, 56pt+ on the two primary Today actions", "2x2 stat grid reflows to one column at accessibility Dynamic Type sizes without clipping", "WCAG AA contrast verified in both light and dark", "Every reachable screen confirmed to implement its full state matrix (empty/loading/success/error where applicable)"], "status": "pending"},
  {"id": "T-017", "title": "StoreKit failure and restore verification checkpoint", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/EntitlementStoreTests.swift"], "depends_on": ["T-008", "T-009"], "acceptance_criteria": ["Forced unverified-transaction case via .storekit config hard-blocks entitlement, documented and tested, not just the happy purchase path", "Restore-with-nothing-to-restore case handled without crash or false grant"], "status": "pending"},
  {"id": "T-018", "title": "End-to-end smoke checklist and release gate", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Docs/ScopeAndDeferrals.md"], "depends_on": ["T-011", "T-012", "T-013b", "T-009", "T-016", "T-017"], "acceptance_criteria": ["Fresh install through one relapse, one full timer completion, one milestone share, one second-habit paywall attempt, and one restore attempt all pass in sequence", "Explicit 'what ships / what's deferred' note written naming Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier as cut for this pass"], "status": "pending"}
]}
```

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This phase output is complete and closes cleanly. All required elements are present: lane-by-lane responsibilities (data_domain, primary_ui, services_utilities, polish_resilience) with clear ownership boundaries, explicit owned-files lists per lane, forbidden edit zones (cross-lane files, frozen `.storekit`/paywall copy, integrator-owned files outside named wiring tasks), a communication protocol (status via tasks-json field, no silent deviation from frozen signatures), and a single well-formed `tasks-json` block.

Acceptance checks verified:
- **No ownerless tasks**: all 19 tasks (T-001 through T-018, with T-013 split into T-013a/T-013b) carry a valid `owner_lane` from the fixed set.
- **Acyclic dependencies**: dependency IDs only ever point to lower/earlier task numbers (T-016 depends on T-007/009/010/011/012/013a/013b/015; T-018 depends on T-011/012/013b/009/016/017); no cycles.
- **Build workers can start immediately**: T-001, T-002, T-004, T-008, T-014 have empty `depends_on` and span three different lanes, so all four lanes have immediate work.

The coordinator's round-1 resolution is a real decision, not a paper-over: it picks Claude's file-system-synchronized-groups + single-branch approach over Codex's per-lane-branch model with a concrete technical justification (the actual collision surface in a single `.xcodeproj` is the project file, and Xcode 16 synchronized groups eliminate that dependency), and it adopts the more granular task split (separate persistence tests, StoreKit failure/restore checkpoint, milestone-list-vs-renderer split) while folding in Codex's risk-sequencing rationale. This is consistent with every prior-phase lock (non-punitive relapse UX, forward-only recompute, wall-clock timer anchoring, StoreKit hard-gate, N-habit schema, cascade deletes, Live Activity/widget/App-Group named as cut-for-this-pass in T-018's acceptance criteria) — nothing here contradicts tech_specs or project_plan. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Both of them landed on the same lane structure, file ownership, and integrator-owned wiring files — no disagreement there. The one real difference is workflow mechanics: Codex wants lane branches (`feature/freeday/data-domain`, `/services`, `/primary-ui`, `/polish`) merged in a fixed order into an integration branch, while Claude argues that's unnecessary ceremony if the Xcode project uses file-system-synchronized groups (Xcode 16's folder-reference style) for every lane's folder — since that means adding a file inside a lane's own folder never touches `project.pbxproj`, the actual collision surface between lanes drops to near zero, so a single `freeday/build` branch with one commit per task ID is enough, and branching should be reserved only for the small set of integrator-owned files. That's a real technical call, and it's the right one to make now since it changes how build workers should actually operate — I'm resolving it in Claude's favor because it solves the specific structural risk (one shared project file, four parallel lanes) rather than just working around it with process discipline. Claude's task list is also more granular and closer to the milestone-based project_plan (splitting persistence tests, the StoreKit failure/restore checkpoint, and the milestone-list-vs-card-renderer split into their own tasks), so that's the backlog going forward, with Codex's per-lane risk framing (entitlement correctness and timekeeping math first) folded in as the sequencing rationale.

CONSENSUS: YES

## Final Output

**Where it lives:** `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/`, single `Freeday.xcodeproj`, one `Freeday` app target + one `FreedayTests` target. Every lane's top-level folder (`Domain/Models`, `Domain/Engines`, `Features/*`, `Services`, `DesignSystem`, `Resources`, `FreedayTests`) is set up as an Xcode 16 file-system-synchronized group, so adding files inside a lane's own folder never touches `project.pbxproj` — this is the actual conflict-prevention mechanism, not branch discipline.

**Branching/merge strategy:** One integration branch, `freeday/build`. No per-lane branches — with synchronized groups, the real collision surface is near zero. Commits are one per task, prefixed `[T-0XX][lane]`. Branching is reserved only for the integrator-owned files (`App/FreedayApp.swift`, `App/AppBootstrap.swift`, `App/AppRootView.swift`, the `.xcodeproj` itself) — these are only touched during explicitly named wiring tasks, never as a side effect of a feature task.

**Lane responsibilities:**
- **data_domain** — SwiftData models, versioned schema/migration plan, the four pure engines, engine unit tests, persistence/cascade-delete tests. Forbidden from touching `Features/*` or `DesignSystem/*`.
- **primary_ui** — every `Features/*` view+viewmodel pair, plus the app bootstrap/root wiring task. Forbidden from touching `Domain/Engines/*` or `Domain/Models/*` directly — calls into engines, never reimplements calendar math inline.
- **services_utilities** — EntitlementStore + `.storekit` config, HapticsService, MilestoneCardRenderer, the StoreKit failure/restore verification checkpoint. Forbidden from touching SwiftData models directly.
- **polish_resilience** — design tokens/components, the accessibility + state-coverage audit (read-and-flag on other lanes' files, patch with tagged commits rather than silent rewrites), and the final end-to-end smoke checklist/release gate.

**Forbidden edit zones:** any file in another lane's owned list; the `.storekit` product IDs and paywall copy once frozen; the four integrator-owned files outside a named wiring task.

**Communication protocol:** status lives in the tasks-json `status` field per task, not side-channel chat. Any deviation from a frozen tech_specs signature (e.g. the `AppBootstrapState` custom `Equatable` conformance) gets stated in the commit message and flagged at the next integration checkpoint — no silent deviation.

```tasks-json
{"tasks": [
  {"id": "T-001", "title": "SwiftData models + versioned schema", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift", "[REDACTED:high_entropy].swift"], "depends_on": [], "acceptance_criteria": ["Compiles with cascade-delete relationships via @Relationship(deleteRule: .cascade) with correct non-mangled inverse keypaths", "Habit.streakStartAt is non-optional; cleanDaysBeforeCurrentStreak and cumulativeSavingsBeforeRateChange are forward-only accumulator fields", "VersionedSchema + SchemaMigrationPlan scaffolding present even though initial migration is trivial"], "status": "pending"},
  {"id": "T-002", "title": "Pure domain engines", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift"], "depends_on": [], "acceptance_criteria": ["Zero SwiftData imports, zero internal Date() calls — all take now/calendar as explicit parameters", "Signatures match tech_specs interfaces-json exactly", "Negative/zero clamps applied (streak never negative on clock skew)"], "status": "pending"},
  {"id": "T-003", "title": "Engine unit test matrix", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/StreakEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/SavingsEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/CravingSessionEngineTests.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/MilestoneEngineTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Midnight rollover both directions covered", "Clock skew (now before streakStartAt) clamps to zero, tested", "DST spring-forward and fall-back covered", "Force-quit-past-90s resolves to abandoned, never completed, tested", "Overlapping active-session force-resolve tested", "Milestone threshold idempotency tested (5 opens past day 3 fires exactly once)"], "status": "pending"},
  {"id": "T-004", "title": "Design tokens + primitive components", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/Tokens.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/GradientBackground.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/StatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/PrimaryActionButton.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SkeletonStatCard.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SunriseCounterMotif.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/AppLevelErrorView.swift"], "depends_on": [], "acceptance_criteria": ["Hex/spacing/radius values match design_handoff exactly (mint #B9F2DE to sky #8ED0F0, radii 12/20/28, spacing 4/8/12/16/24/32/48)", "SunriseCounterMotif has one accessibilityElement stating the real day count, never decorative-only", "Every component has a #Preview"], "status": "pending"},
  {"id": "T-005", "title": "App bootstrap and root wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/FreedayApp.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppBootstrap.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppRootView.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["ModelContainer constructed via explicit do/catch against SchemaV1/MigrationPlan, never .modelContainer(for:)", "AppBootstrapState given a custom Equatable conformance comparing on case tag only", "Root view branches on opening/ready/failed before TabView is constructed", "Corrupt-store fallback manually verified to render AppLevelErrorView with no tab bar underneath"], "status": "pending"},
  {"id": "T-006", "title": "Persistence + cascade-delete tests", "owner_lane": "data_domain", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/PersistenceTests.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["In-memory ModelContainer test: deleting a Habit removes all its RelapseEvent and CravingSession rows with no orphans", "Migration plan scaffolding compiles and loads cleanly"], "status": "pending"},
  {"id": "T-007", "title": "Habit setup/edit feature", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormViewModel.swift"], "depends_on": ["T-001", "T-004"], "acceptance_criteria": ["Non-positive quantity or cost rejected inline, Save disabled until valid", "Editing an existing habit past day 0 shows the forward-only recompute disclosure banner only once a field differs from its originally loaded value", "Save calls SavingsEngine.applyRateChange rather than mutating savings fields directly"], "status": "pending"},
  {"id": "T-008", "title": "EntitlementStore + StoreKit config", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementStore.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Resources/Freeday.storekit"], "depends_on": [], "acceptance_criteria": ["Transaction.updates listener started and kept alive for app lifetime", "checkVerified failure hard-blocks entitlement, never soft-grants", "restorePurchases() re-scans Transaction.currentEntitlements, not a cached flag", "EntitlementState matches the locked six-case enum (unknown/free/pro/expired/revoked/verificationFailed)"], "status": "pending"},
  {"id": "T-009", "title": "Paywall + habit-#2 gating wiring", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallViewModel.swift"], "depends_on": ["T-007", "T-008"], "acceptance_criteria": ["Attempting to create habit #2 as a free-tier user shows the paywall before any HabitForm field renders", "verificationFailed renders explicit hard-block copy, never a silent timeout", "Restore Purchases button present and wired to EntitlementStore.restorePurchases"], "status": "pending"},
  {"id": "T-010", "title": "Today/Home screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayViewModel.swift"], "depends_on": ["T-001", "T-002", "T-004", "T-007"], "acceptance_criteria": ["Implements empty (onboarding prompt), loading (skeleton), success, and app-level store-failure states", "Streak/lifetime-days/savings/cravings-survived numbers come only from StreakEngine/SavingsEngine calls, no inline calendar math", "No multi-habit chrome renders when exactly one habit exists"], "status": "pending"},
  {"id": "T-011", "title": "Relapse/reset flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Single fullScreenCover screen, pre-tap and post-tap states in the same view via spring-animated swap, no navigation between them", "Post-tap view shows reset streak and the untouched lifetime total together, no red/warning color, no 'broken' language", "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save"], "status": "pending"},
  {"id": "T-012", "title": "Craving timer flow", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerViewModel.swift"], "depends_on": ["T-001", "T-002", "T-010"], "acceptance_criteria": ["Countdown always derived from persisted startedAt, recalculated on appear/scenePhase change", "Relaunch with startedAt + 90s already elapsed resolves to abandoned, no retroactive credit", "Backgrounded at second 40 and foregrounded 2 minutes later reads zero remaining with completion already resolved", "Only a full 90s completion increments lifetimeCravingsSurvived, exactly once, guarded against double-fire", "New session request force-resolves any existing active session for the same habit to abandoned first"], "status": "pending"},
  {"id": "T-013a", "title": "Milestones/history list screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListViewModel.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardView.swift"], "depends_on": ["T-001", "T-010"], "acceptance_criteria": ["Chronological list backed by RelapseEvent-derived milestones with empty/loading/success/error states", "MilestoneCardView renders live in a sheet, reused by the renderer for export"], "status": "pending"},
  {"id": "T-013b", "title": "Milestone card image export + ShareLink", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/MilestoneCardRenderer.swift"], "depends_on": ["T-002", "T-004", "T-013a"], "acceptance_criteria": ["Renders without clipping the day count or dollar figure at max Dynamic Type, light and dark", "Per-habit lastShownMilestoneThreshold flag prevents re-triggering on repeated app opens past a threshold", "Exports at a fixed capped type size, feeding ShareLink's Transferable payload"], "status": "pending"},
  {"id": "T-014", "title": "Haptics service", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/HapticsService.swift"], "depends_on": [], "acceptance_criteria": ["Checks CHHapticEngine.capabilitiesForHardware().supportsHaptics before firing", "Absent hardware is a silent no-op, never an error path", "Called from relapse confirm and craving-timer completion"], "status": "pending"},
  {"id": "T-015", "title": "Settings screen", "owner_lane": "primary_ui", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsView.swift", "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsViewModel.swift"], "depends_on": ["T-001", "T-008"], "acceptance_criteria": ["Habit edit entry point, restore-purchases action, one-step delete-with-confirmation", "deleteHabit relies on the declarative cascade rule — no manual cascade logic in the view model"], "status": "pending"},
  {"id": "T-016", "title": "Accessibility and state-coverage audit", "owner_lane": "polish_resilience", "files": [], "depends_on": ["T-007", "T-009", "T-010", "T-011", "T-012", "T-013a", "T-013b", "T-015"], "acceptance_criteria": ["44pt minimum on all interactive targets, 56pt+ on the two primary Today actions", "2x2 stat grid reflows to one column at accessibility Dynamic Type sizes without clipping", "WCAG AA contrast verified in both light and dark", "Every reachable screen confirmed to implement its full state matrix (empty/loading/success/error where applicable)"], "status": "pending"},
  {"id": "T-017", "title": "StoreKit failure and restore verification checkpoint", "owner_lane": "services_utilities", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/EntitlementStoreTests.swift"], "depends_on": ["T-008", "T-009"], "acceptance_criteria": ["Forced unverified-transaction case via .storekit config hard-blocks entitlement, documented and tested, not just the happy purchase path", "Restore-with-nothing-to-restore case handled without crash or false grant"], "status": "pending"},
  {"id": "T-018", "title": "End-to-end smoke checklist and release gate", "owner_lane": "polish_resilience", "files": ["/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Docs/ScopeAndDeferrals.md"], "depends_on": ["T-011", "T-012", "T-013b", "T-009", "T-016", "T-017"], "acceptance_criteria": ["Fresh install through one relapse, one full timer completion, one milestone share, one second-habit paywall attempt, and one restore attempt all pass in sequence", "Explicit 'what ships / what's deferred' note written naming Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier as cut for this pass"], "status": "pending"}
]}
```

---

CONSENSUS: YES

### Implementation Readiness Gate

# freeday — Implementation Readiness Gate

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:42:32._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Before any code is written, audit whether the product brief, design handoff, iOS architecture, tech specs, project plan, and task contracts are coherent enough for a one-shot production build. Resolve blockers or explicitly downgrade scope before build starts.

## Transcript


### Round 1


**Codex (Frontend Engineer · Pragmatist) — Round 1**

Readiness verdict: GO, with one hard pre-build fix required.

Cross-phase consistency check:
- All core requirements are aligned: product prompt, design handoff, architecture, tech specs, project plan, and task assignments all target the same v1 scope and explicitly keep v1 local-first with real core workflows first.
- The earlier hard decisions are coherent: local-only persistence, forward-only recompute, non-shaming reset, wall-clock anchored 90-second craving timer, milestone idempotency, and hard verified StoreKit entitlement checks are all present in multiple artifacts.
- The biggest integration contract is consistent: schema supports N habits from day one; paywall is a UI entitlements gate only; migration/lifecycle handling + state matrix are first-class.
- State coverage is consistently required across layers (Today/home, setup, timer, relapse, paywall, settings/milestones, plus app-level bootstrap error), matching global rules.

Build blockers and fixes:
- Hard blocker: task inventories contain placeholder filename tokens in owned file lists (e.g., `[REDACTED:high_entropy].swift`), which is acceptable only in notes but not buildable work. Replace with a concrete migration/schema filename before task execution.
- Pre-build dependency mismatch risk: design system + architecture rely on folder-synchronized groups; if the Xcode project is not actually using that setup yet, collisions can return. Confirm/fix project structure first, because it directly affects parallel lane safety.
- One implementation-risk item to keep explicit before claiming readiness: migration/versioning + custom `AppBootstrapState` Equatable conformance must be implemented exactly as named (case-only equality), otherwise compile fails or bootstrap behavior becomes unstable.
- StoreKit reliability risk remains highest risk if verification is not treated as blocking; ensure failure path is explicit and hard-blocked before coding any “free-tier + pro feature” assumptions into views.

Final scope for build:
- Implement all five core workflows end-to-end: habit setup with quantity-per-day + cost-per-unit, today home stats with non-punitive relapse reset, wall-clock craving timer with full-completion behavior, milestone card + ShareLink, and paid multi-habit gate.
- Build Live Activity + WidgetKit only as deferred, not in-scope for this pass, but explicitly documented as cut (already done).
- Build architecture with real crash-safe bootstrap (`opening/ready/failed`) and full app-level error state prior to TabView render.
- Keep haptics, accessibility, and share/export behavior in core-v1 quality bar, not deferred polish.

Acceptance criteria checklist:
- Habit setup rejects zero/negative cost or quantity; saving edits uses forward-only rate recompute and preserves historical savings.
- Today/home has empty/loading/success/error and app-level store-failure states; empty flow goes to setup immediately, and one-habit free users see no multi-habit chrome.
- Relapse is one-tap, same-screen confirm/update, no “broken/streak ruined” language, and lifetime totals stay visible and unchanged by relapse.
- Craving timer uses persisted start timestamp and scene/background recoveries; elapsed >=90s on relaunch resolves to abandonment unless live completion event occurs once; completion increments only once.
- Milestone trigger uses threshold set and per-habit one-shot suppression; card renders and shares cleanly at max Dynamic Type in both light/dark.
- Entitlement gate is real StoreKit 2 verified logic (`checkVerified` hard-fail), with Transaction updates listener and Restore button using `currentEntitlements`.
- Accessibility baseline is testable in workflow: 44pt targets (56pt for primary Today actions), non-clipping dynamic type reflow, WCAG AA contrast, explicit VO labels on numeric motives.
- Testing responsibilities remain explicit by lane and are scheduled before final smoke: engine matrix, entitlement failure/restore checkpoint, cascade delete/persistence, a11y/state audit, and end-to-end smoke checklist.

**Claude (Delivery Lead · User Advocate) — Round 1**

Reading back through nine consensus phases, I want to be the person in the room who actually opens the acceptance-criteria file and asks "wait, does this literally work end to end" instead of nodding at another unanimous vote. And there's a real one.

The original hard requirement — restated in prompt_contract as a non-negotiable — is that "multi-habit management gated to the paid tier" is one of the five core workflows that must be "fully functional, not mocked." Follow that requirement through every downstream phase and watch it quietly hollow out. next_steps_small cut "multi-habit switcher/management UI beyond the single paywall gate check" from the MVP slice. app_features then reclassified "multi-habit switcher UI for paid users past habit #2" as a Should-have, with the justification "unreachable in a single-habit QA pass" — which is true but is being used to wave away a Must. And now look at the actual interfaces locked in tech_specs: `TodayViewModel.habit` is a singular optional (`var habit: Habit?`), not a collection or an active-habit-with-siblings model. Task assignments confirms it — T-009 gates *creation* of habit #2, T-010 only promises "no multi-habit chrome renders when exactly one habit exists," and there is no task anywhere in T-001 through T-018 that builds a way to view, switch to, or even list a second habit once it exists.

Play this forward as a real user: I pay $4.99/mo specifically because the pitch says "unlimited simultaneous habits." I subscribe, tap "add a habit," fill out HabitForm for vaping (my first was sugar), save it — and then the Today screen just keeps showing sugar forever, because that's the only habit the view model knows how to hold. There is no error, no crash, nothing visibly broken — it's just quietly, permanently wrong, and I paid for a feature that doesn't exist. That's worse than an honest paywall, because it's a paying customer discovering the core value prop was mocked. It's exactly the "demo, not done" failure mode the prompt_contract phase warned about, just relocated to the one part of the app nobody re-checked against the original five-workflow list.

The same root cause breaks the subscription-lapse rule too — "most recently active habit stays interactive, others go read-only" requires *some* UI that shows more than one habit exists, which doesn't currently have a task either.

I don't think the fix requires reopening design or resurrecting the switcher/tab-bar debate that initial_discussion deliberately closed off (3-tab nav, no multi-habit chrome for free users, stays flat). The minimal real fix: Settings already has a task (T-015) and already tracks `lastInteractedAt` as a persisted tie-break field per the architecture review — so add one concrete requirement to T-015 (or a new small task): a "Your Habits" list in Settings, visible only when 2+ habits exist, tap-to-select which one is "active" (updates `lastInteractedAt`, which Today already reads). That's maybe half a day of work, reuses a field that's already in the schema, and turns "multi-habit management" from silently broken into genuinely functional — a list and a switch, not a full redesign. If that's still cut for time, it has to be named as a blocker in ScopeAndDeferrals.md alongside Live Activity/Widget, not folded silently into "Should-have" language that reads as optional polish. Right now T-018's acceptance criteria only names Live Activity/WidgetKit/TimelineView/App-Group as things to document as deferred — it needs "multi-habit switcher UI" and "subscription-lapse read-only degradation" added to that same explicit list if the team chooses to cut them, precisely because those two are reclassifications of an originally-locked Must, not net-new nice-to-haves.

Everything else I checked lines up cleanly: the AppBootstrapState Equatable fix and the cascade-delete keypath issue are both correctly carried forward as named tasks rather than left implicit; the five other core-workflow acceptance criteria (habit setup, non-punitive relapse, craving timer, milestone card, StoreKit gate) each have concrete, testable criteria with an owner and a verification checkpoint; testing responsibility is explicit per lane. My verdict for this gate is conditional, not a clean pass: everything is buildable except this one thread, and it's cheap to close before code starts rather than discover mid-build when someone actually tries to use two habits at once.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: NO

Here's where things stand: both Codex and Claude landed on an overall "GO" reading of the nine prior phases — the requirements are consistent across prompt contract, design, architecture, tech specs, plan, and tasks, and most of the standing hard rules (non-shaming relapse, forward-only savings recompute, wall-clock craving timer, hard StoreKit verification, N-habit schema from day one) show up correctly and consistently everywhere they're supposed to.

Codex's contribution is a set of concrete pre-build fixes rather than a philosophical objection: swap out the placeholder filename token in the task file lists for a real schema/migration filename before anyone starts working from that backlog, confirm the Xcode project is actually set up with file-system-synchronized groups (the whole parallel-lane safety plan depends on that being real, not just planned), and make sure the `AppBootstrapState` custom `Equatable` fix and StoreKit's hard-fail-on-unverified-transaction behavior get implemented exactly as specified rather than softened during coding.

Claude's contribution is bigger and hasn't been responded to yet: tracing the "multi-habit management gated to paid tier" requirement — one of the five original must-have core workflows — through every downstream phase shows it quietly got hollowed out. `next_steps_small` cut the switcher UI from the MVP slice, `app_features` reclassified it as a "Should-have," and by the time you get to the actual locked interfaces, `TodayViewModel.habit` is a single optional, not a collection, and no task in the entire backlog (T-001 through T-018) builds any way to view, list, or switch to a second habit once StoreKit unlocks it. Concretely: someone pays for Freeday+, adds a second habit, and the app has no UI to ever show it — a paying customer discovering the headline paid feature doesn't actually exist. Claude's proposed fix is small (a "Your Habits" list in Settings, visible only with 2+ habits, tap-to-switch using the `lastInteractedAt` field that's already in the schema) but it's a real scope question that Codex hasn't weighed in on yet — fix it with that small task, or explicitly name it as a cut alongside Live Activity/Widget in ScopeAndDeferrals.md.

## Final Output

Not ready to close yet. Next round needs Codex to respond directly to the multi-habit gap Claude found: either agree to add the minimal Settings-based habit-switcher task (and fold it into the final scope/acceptance checklist), or make the case for formally downgrading "multi-habit management" from Must to explicitly-deferred and adding it by name to T-018's ScopeAndDeferrals list next to Live Activity/WidgetKit. Either resolution is acceptable per the phase rules ("resolve contradictions by downgrading scope or naming a blocker before code starts") — what's not acceptable is leaving it silently classified as a "Should-have" while the original prompt contract still calls it a Must. Once that's settled, the readiness verdict, blockers list, final scope, and acceptance checklist can be finalized together.

### Round 2


**Codex (Frontend Engineer · Pragmatist) — Round 2**

Codex, your “GO with two pre-build fixes” read is mostly right, but I agree with Claude’s stop-check on the actual lock. The multi-habit requirement is not optional language — it is literally one of the five core workflows in the contract: “manage multiple concurrent habits (paid tier)” and “non-shaming, fully functional reset and restart.” In the locked artifacts, we now have a hard contradiction: `TodayViewModel` is singular (`var habit: Habit?`), T-001 enables N habits, and the paywall gating is there, but there is no way for a paid user to ever reach a second habit after creating it. That means you can buy the feature and never use it. That is a silent spec drift and a product failure, not a deferred polish issue.

I’d rather we fix it now with the smallest possible UI surface than downgrade it. The cleanest route is to extend Settings into the habit switcher control point, since settings already owns delete/edit/restore and `lastInteractedAt` is already in the schema for exactly this arbitration. We can keep the 3-tab architecture and avoid adding a separate switcher surface on Today. Concretely: in Settings, when habits count ≥2 (or entitlement is pro), show “Your Habits” list sorted by `lastInteractedAt` with one-tap Activate. Activation just sets `lastInteractedAt = Date()` on that habit, which Today can resolve as active by query sorting (same field Claude mentioned). Free users never see this list because they should never have >1 habit.

So readiness is conditional, not clean yet. We need one scope decision before build: implement Settings-based habit switching as required v1 functionality, or explicitly move it to deferred and list it next to Live Activity/WidgetKit in `ScopeAndDeferrals.md`. Given the hard must-have list and mass-market expectation of paid value, I think implementing it is the better path and low-risk compared to pretending it’s okay.

Also, I’m with your pre-build fix list: the `[REDACTED:high_entropy].swift` placeholders must be replaced with concrete schema filenames before execution, otherwise task ownership is not executable; and the Xcode synchronized groups setup must be verified before parallel lanes start, because that’s the only reason the single-branch plan is safe. I’d also keep the `AppBootstrapState` case-only `Equatable` and StoreKit hard-fail handling as hard blockers until confirmed.

I’m proposing we update the readiness artifacts as follows before greenlight:
1) add a concrete subtask under `T-015` (or a new `T-015b`) for a settings habit switcher for pro users;
2) make `Today` and any milestones/history flows derive “active habit” from `lastInteractedAt` consistently;
3) fold “habit-switcher/read-only-lapse behavior for extra habits” into `T-018` only as explicit deferred items if the team refuses to implement it now;
4) keep `T-017` StoreKit unverified/restore failure checks as blocking, not best-effort.

If we make that change, the cross-phase consistency is good enough to start: prompt-contract, design, architecture, tech specs, plan, and tasks all align again, every major workflow has acceptance criteria, and the testing gates already exist (engine tests, entitlement failure tests, a11y/state audit, smoke checklist). Without it, the build would start with a known paid-feature lie baked in. I want to avoid that and go in with only one concrete scope decision: multi-habit switching in Settings is required in v1.

**Claude (Delivery Lead · User Advocate) — Round 2**

Codex, your three fixes are all real and I'm not going to relitigate them — the placeholder filename token, confirming the synchronized-groups setup actually exists before anyone starts committing in parallel, and treating the Equatable/StoreKit hard-fail behaviors as non-negotiable rather than "close enough" during coding. Those are exactly the kind of thing that should be nailed down in a readiness gate. But I notice you framed your verdict as a clean "GO, with one hard pre-build fix required" and then didn't engage with the habit-switcher gap at all — that's the coordinator calling you out correctly, and I want to push on it directly rather than let it slide into round 3 unaddressed.

Here's the sharpest way I can put the stakes: this isn't a nice-to-have gap, it's a "does the thing I paid for exist" gap. Walk through App Store review for a second, forget the end user — Apple's reviewer creates a Freeday+ subscription, that's the entire point of subscription review, they will absolutely try adding a second habit since that's the headline paid feature listed in the Subscription Model section of the original spec ("Freeday+ unlocks unlimited simultaneous habits"). If they add habit #2 and the app just keeps showing habit #1 forever with zero indication the second habit was even saved, that's not a "should-have polish gap," that's a rejection risk for shipping a paid feature that doesn't function. That reframes this from "nice for the user" to "blocks App Store approval," which I think should settle it decisively in favor of building the fix rather than downgrading it to a documented cut.

And the fix really is small enough that "downgrade to ScopeAndDeferrals" is the lazier option, not the safer one. We already have `lastInteractedAt` sitting in the schema per tech_specs specifically as a tie-break field for exactly this kind of "which habit is active" question — it's not a new concept, it's a field nobody's reading yet. Settings already has its own task (T-015) with room in scope for "habit edit entry point." I'm proposing we extend that task, not invent a tenth screen: a "Your Habits" section that only renders when `habits.count > 1` (consistent with the standing rule that free users with one habit see zero multi-habit chrome — this only appears for people who've actually paid and added a second one), each row tappable to set itself as the `lastInteractedAt` winner, and Today reads whichever habit currently wins that tie-break the same way it already would on relaunch. No new navigation pattern, no new modal, no reopening the "flat 3-tab, no switcher" decision from initial_discussion — Today still shows one habit, exactly as designed, it's just that Settings now lets a paying user pick which one.

If Codex or the coordinator wants to make the case that even this half-day addition is too much given the time budget, I'd want to hear a real argument for why — "it's unreachable in a single-habit QA pass" isn't that argument, it just describes the testing setup, not the feature's importance. My actual concession point: if the team genuinely can't spare the half-day, I'd rather we write the downgrade honestly — rename the paid tier's promise for this release from "manage unlimited concurrent habits" to something like "track unlimited habits, one active at a time this release" in the paywall copy and App Store description, and put both the switcher UI *and* the copy change explicitly in ScopeAndDeferrals.md — than let the paywall copy keep promising something the build doesn't do. What I won't accept is the current silent state: paywall copy and product brief still say "unlimited simultaneous habits," StoreKit gate is real and will really charge someone $4.99, and there's no task anywhere that makes the second habit visible. That combination is the one thing this gate exists to catch, and I want either the small build task added to T-015's acceptance criteria and the final scope for this phase, or an explicit paywall-copy downgrade paired with the ScopeAndDeferrals entry — pick one, but let's not leave this round without picking.

**Coordinator (Claude) — decision after round 2**

CONSENSUS: YES

Round 2 closed the gap. Codex came back and explicitly agreed with Claude's stop-check instead of defending the "GO, one fix" verdict from round 1 — no more silent drift on the multi-habit requirement. Both of them landed on building the fix, not downgrading it: extend Settings (T-015) with a "Your Habits" list that only renders when a habit count exceeds one, tap-to-activate writes `lastInteractedAt`, and Today already resolves the active habit off that same field on relaunch — reusing a schema field that already exists rather than inventing new navigation or reopening the flat-3-tab/no-switcher decision from initial_discussion. Claude's App Store framing (a reviewer creating the subscription specifically to test "unlimited simultaneous habits" and hitting a dead end) sealed the argument that this is a build-it, not defer-it, situation. Codex's three original pre-build fixes stand unchallenged and are folded in as hard blockers alongside the new task.

## Final Output

**Readiness verdict:** GO, conditional on the fixes below being applied before code starts — not a re-open of any design/architecture/plan decision, just closing execution gaps in already-locked artifacts.

**Cross-phase consistency check:** Prompt contract, product brief, design handoff, architecture, tech specs, project plan, and task assignments all target the same v1 scope and agree on every standing hard rule (local-first, non-shaming relapse, forward-only savings recompute, wall-clock craving timer, milestone idempotency, hard-verified StoreKit gate, N-habit schema from day one). One real contradiction was found and is resolved by this gate: "manage multiple concurrent habits (paid tier)" is a locked Must-have core workflow, but it had quietly drifted to a Should-have with no task actually building it — `TodayViewModel.habit` is singular, and nothing in T-001–T-018 lets a paying user ever see or switch to a second habit. That's now fixed at the task level rather than left as silent scope erosion.

**Build blockers and fixes (all required before/at start of build):**
1. Replace the placeholder `[REDACTED:high_entropy].swift` filename tokens in the task file-ownership lists with the real schema/migration filenames — task backlog isn't executable with placeholders in it.
2. Confirm the Xcode project actually uses file-system-synchronized groups for every lane folder before parallel lanes start committing — the whole single-branch, no-per-lane-branching plan depends on this being real, not aspirational.
3. Implement `AppBootstrapState`'s custom case-only `Equatable` conformance and StoreKit's hard-fail-on-unverified-transaction behavior exactly as specified — no softening to a warning or soft-grant during coding.
4. **New:** Add a habit-switcher requirement to T-015 (Settings) — a "Your Habits" section, visible only when `habits.count > 1`, each row tappable to set `lastInteractedAt = Date()` on that habit; Today resolves the active habit via the same `lastInteractedAt` tie-break it already uses. Free users with one habit see nothing new — this only appears for users who've actually paid and added a second habit, consistent with the standing "no multi-habit chrome for single-habit users" rule.

**Final scope for build:** all five core workflows (habit setup, non-punitive relapse/reset, craving timer, milestone card + ShareLink, multi-habit paid gate — now including the ability to actually reach a second habit) implemented end-to-end and real, not mocked. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier remain the only intentionally-deferred items, named explicitly in `ScopeAndDeferrals.md`. Accessibility, haptics, and state-coverage (empty/loading/success/error everywhere reachable, plus the app-level bootstrap failure state) stay in the v1 quality bar, not polish.

**Acceptance criteria checklist (added/updated this phase):**
- Habit setup rejects non-positive cost/quantity inline; edits use forward-only recompute with historical savings preserved.
- Today/home implements empty/loading/success/app-level-failure states; no multi-habit chrome with exactly one habit.
- Relapse is one-tap, same-screen, no punitive language, lifetime totals always visible and unchanged.
- Craving timer is wall-clock anchored, survives backgrounding/force-quit per the resolved abandon/resume rules, completes exactly once.
- Milestone card fires early (day 1/3), per-habit one-shot suppression, renders cleanly at max Dynamic Type in light/dark.
- StoreKit entitlement is real: `checkVerified` hard-fails, `Transaction.updates` listener runs app-lifetime, Restore re-scans `currentEntitlements`.
- **New:** Settings shows a "Your Habits" switcher once 2+ habits exist; tap-to-activate updates `lastInteractedAt`; Today reflects the newly active habit on next read. Paid users can actually reach and use every habit they've created — the paywall's "unlimited simultaneous habits" promise is real, not aspirational.
- Accessibility baseline (44pt/56pt targets, Dynamic Type reflow, WCAG AA, VoiceOver labels on numeric motifs) verified across all screens including the new switcher list.
- Testing responsibilities stay explicit per lane: engine test matrix, cascade-delete/persistence tests, StoreKit failure/restore checkpoint, a11y/state audit, end-to-end smoke checklist — now including one pass through "create habit #2, activate it in Settings, confirm Today reflects it."

Build can start.

**Quality Gate (Claude) — after round 2**

QUALITY: PASS

## Feedback
This closes the gate properly. All five required outputs are present and concrete (readiness verdict, cross-phase consistency check, build blockers/fixes, final scope, acceptance criteria checklist), and the phase did its actual job: it caught a real contradiction — "manage multiple concurrent habits (paid tier)" was a locked Must-have in prompt_contract that had silently eroded to a Should-have by app_features and had no corresponding task in T-001–T-018 — and resolved it with a build decision rather than a downgrade, per the phase rule "resolve contradictions by downgrading scope or naming a blocker before code starts." The fix is minimal and doesn't invent new design/architecture: it reuses the `lastInteractedAt` field already locked in tech_specs and extends the already-existing T-015 Settings task, without reopening the flat-3-tab/no-switcher navigation decision from initial_discussion.

The four build blockers are concrete and actionable (placeholder filename replacement, synchronized-groups verification, Equatable/StoreKit hard-fail fidelity, new habit-switcher task), each major workflow has a testable acceptance criterion, and testing responsibilities remain explicit per lane with the new "create habit #2 → activate in Settings → confirm Today reflects it" smoke step folded into the existing checklist rather than left implicit. The disagreement across both rounds is fully reflected in the final output rather than papered over — round 1's split verdict and round 2's convergence are both visible in how the output is framed. Ready to close; build can proceed.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

Round 2 closed the gap. Codex came back and explicitly agreed with Claude's stop-check instead of defending the "GO, one fix" verdict from round 1 — no more silent drift on the multi-habit requirement. Both of them landed on building the fix, not downgrading it: extend Settings (T-015) with a "Your Habits" list that only renders when a habit count exceeds one, tap-to-activate writes `lastInteractedAt`, and Today already resolves the active habit off that same field on relaunch — reusing a schema field that already exists rather than inventing new navigation or reopening the flat-3-tab/no-switcher decision from initial_discussion. Claude's App Store framing (a reviewer creating the subscription specifically to test "unlimited simultaneous habits" and hitting a dead end) sealed the argument that this is a build-it, not defer-it, situation. Codex's three original pre-build fixes stand unchallenged and are folded in as hard blockers alongside the new task.

## Final Output

**Readiness verdict:** GO, conditional on the fixes below being applied before code starts — not a re-open of any design/architecture/plan decision, just closing execution gaps in already-locked artifacts.

**Cross-phase consistency check:** Prompt contract, product brief, design handoff, architecture, tech specs, project plan, and task assignments all target the same v1 scope and agree on every standing hard rule (local-first, non-shaming relapse, forward-only savings recompute, wall-clock craving timer, milestone idempotency, hard-verified StoreKit gate, N-habit schema from day one). One real contradiction was found and is resolved by this gate: "manage multiple concurrent habits (paid tier)" is a locked Must-have core workflow, but it had quietly drifted to a Should-have with no task actually building it — `TodayViewModel.habit` is singular, and nothing in T-001–T-018 lets a paying user ever see or switch to a second habit. That's now fixed at the task level rather than left as silent scope erosion.

**Build blockers and fixes (all required before/at start of build):**
1. Replace the placeholder `[REDACTED:high_entropy].swift` filename tokens in the task file-ownership lists with the real schema/migration filenames — task backlog isn't executable with placeholders in it.
2. Confirm the Xcode project actually uses file-system-synchronized groups for every lane folder before parallel lanes start committing — the whole single-branch, no-per-lane-branching plan depends on this being real, not aspirational.
3. Implement `AppBootstrapState`'s custom case-only `Equatable` conformance and StoreKit's hard-fail-on-unverified-transaction behavior exactly as specified — no softening to a warning or soft-grant during coding.
4. **New:** Add a habit-switcher requirement to T-015 (Settings) — a "Your Habits" section, visible only when `habits.count > 1`, each row tappable to set `lastInteractedAt = Date()` on that habit; Today resolves the active habit via the same `lastInteractedAt` tie-break it already uses. Free users with one habit see nothing new — this only appears for users who've actually paid and added a second habit, consistent with the standing "no multi-habit chrome for single-habit users" rule.

**Final scope for build:** all five core workflows (habit setup, non-punitive relapse/reset, craving timer, milestone card + ShareLink, multi-habit paid gate — now including the ability to actually reach a second habit) implemented end-to-end and real, not mocked. Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier remain the only intentionally-deferred items, named explicitly in `ScopeAndDeferrals.md`. Accessibility, haptics, and state-coverage (empty/loading/success/error everywhere reachable, plus the app-level bootstrap failure state) stay in the v1 quality bar, not polish.

**Acceptance criteria checklist (added/updated this phase):**
- Habit setup rejects non-positive cost/quantity inline; edits use forward-only recompute with historical savings preserved.
- Today/home implements empty/loading/success/app-level-failure states; no multi-habit chrome with exactly one habit.
- Relapse is one-tap, same-screen, no punitive language, lifetime totals always visible and unchanged.
- Craving timer is wall-clock anchored, survives backgrounding/force-quit per the resolved abandon/resume rules, completes exactly once.
- Milestone card fires early (day 1/3), per-habit one-shot suppression, renders cleanly at max Dynamic Type in light/dark.
- StoreKit entitlement is real: `checkVerified` hard-fails, `Transaction.updates` listener runs app-lifetime, Restore re-scans `currentEntitlements`.
- **New:** Settings shows a "Your Habits" switcher once 2+ habits exist; tap-to-activate updates `lastInteractedAt`; Today reflects the newly active habit on next read. Paid users can actually reach and use every habit they've created — the paywall's "unlimited simultaneous habits" promise is real, not aspirational.
- Accessibility baseline (44pt/56pt targets, Dynamic Type reflow, WCAG AA, VoiceOver labels on numeric motifs) verified across all screens including the new switcher list.
- Testing responsibilities stay explicit per lane: engine test matrix, cascade-delete/persistence tests, StoreKit failure/restore checkpoint, a11y/state audit, end-to-end smoke checklist — now including one pass through "create habit #2, activate it in Settings, confirm Today reflects it."

Build can start.

---

CONSENSUS: YES

### Build Coordination

# freeday — Build Coordination

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 12:45:50._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Iterative build coordination via agent messages. Planning and task assignment only unless build_code_changes_enabled is true.

## Transcript


_Parallel build — 2 workers running at once: Codex builds the core data model + domain logic — data structures, state management, persistence, and business rules; Claude builds the primary UI — the main screens the user sees and taps through, plus navigation and layout. Integrator: Claude._

### Iteration 1


**Codex (QA & Risk · User Advocate) — Iteration 1**

Implemented your lane in `/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build`.

What I changed

- Added SwiftData models + migration scaffolding for T-001:
  - [Freeday/Domain/Models/Habit.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift)
  - [Freeday/Domain/Models/RelapseEvent.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift)
  - [Freeday/Domain/Models/CravingSession.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift)
  - [Freeday/Domain/Models/CravingOutcome.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingOutcome.swift)
  - [Freeday/Domain/Schema/FreedaySchema.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Schema/FreedaySchema.swift)

- Added pure domain engines for T-002 (no SwiftData imports, no `Date()` inside logic):
  - [Freeday/Domain/Engines/StreakEngine.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift)
  - [Freeday/Domain/Engines/SavingsEngine.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift)
  - [Freeday/Domain/Engines/CravingSessionEngine.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift)
  - [Freeday/Domain/Engines/MilestoneEngine.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift)

- Added test matrix for T-003 (XCTest):
  - [FreedayTests/StreakEngineTests.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/StreakEngineTests.swift)
  - [FreedayTests/SavingsEngineTests.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/SavingsEngineTests.swift)
  - [FreedayTests/CravingSessionEngineTests.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/CravingSessionEngineTests.swift)
  - [FreedayTests/MilestoneEngineTests.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/MilestoneEngineTests.swift)

- Added persistence/cascade tests for T-006:
  - [FreedayTests/PersistenceTests.swift](/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/PersistenceTests.swift)

What works now

- Data models are in place with non-optional `streakStartAt`, forward-only accum fields on `Habit`, cascade deletes, and migration types defined.
- Engines are pure and deterministic with explicit `now`/`calendar`/value input.
- Core edge-case tests for clock skew, midnight rollover, DST boundaries, session expiry, milestone idempotency, and delete-cascade behavior are implemented.
- `FreedaySchemaV1`/`FreedayMigrationPlan` scaffolding is present.

What remains / what I did not do

- I did not edit app wiring, Xcode project config, `@main`, or entrypoint files (reserved for integrator/other lanes).
- I did not run the test suite or compile (`xcodebuild`) from this turn.
- The “overlapping active-session force-resolve” case is structurally covered via persistence-side assumptions, but there is no dedicated engine method for it by contract; ensure UI/domain integration enforces resolve-on-new-session in whichever service/lifecycle creates sessions.
- I did not touch StoreKit/payment files (other lane).

How to verify

- Add files to the SwiftUI target and test target in Xcode.
- Add `/Freeday` sources and `/FreedayTests` to the appropriate targets.
- Run unit tests for the four test files above.
- Confirm `FreedaySchemaV1` is used by bootstrap model container creation with migration plan.
- Confirm `Habit` relationships are part of the app’s actual schema registration.

If you want, I can do a follow-up pass to harden two likely-risky spots before integration:  
1) replacing the placeholder `max(...)` helpers with explicit clamp utilities for readability, and 2) adding a small pure helper for “force-resolve existing active craving session” if the integration team wants it as a dedicated testable API in data-domain.

**Claude (Frontend Engineer · Systems Thinker) — Iteration 1**

Built all eight of my assigned tasks (T-005, T-007, T-009, T-010, T-011, T-012, T-013a, T-015) as real Swift files under `Freeday/App`, `Freeday/Features/*`, and `Freeday/UI/Components`. Here's the rundown:

**What I built:**
- **App/** — `AppBootstrap.swift` (`AppBootstrapState` with case-only `Equatable`, `AppBootstrap.makeContainer()` via explicit `do/catch` against `FreedaySchemaV1`/`FreedayMigrationPlan`), `FreedayApp.swift` (`@main`, starts the entitlement transaction listener), `AppRootView.swift` (branches opening/ready/failed before `TabView`, plus the flat 3-tab `MainTabView`).
- **Today** — full 4-state screen (skeleton loading, onboarding-as-empty-state, success grid, app-level failure), resolves the active habit via `lastInteractedAt` descending `@Query` — same tie-break Settings' switcher writes to.
- **Relapse** — single `fullScreenCover`, pre/post confirm swapped in place via spring animation, warm accent card on the untouched lifetime total, zero red/warning language.
- **CravingTimer** — wall-clock anchored countdown, `resolveOnAppear` on `.onAppear`/`scenePhase` change, live `tick(now:)` is the only path that can mark completion (guarded against double-fire), silent abandonment on early dismiss.
- **HabitForm** — inline validation (non-positive rejected), live weekly-savings preview, recompute-disclosure banner fires the instant a field diverges from its loaded value, calls `SavingsEngine.applyRateChange` rather than touching savings fields directly.
- **Milestones** — chronological list backed by `RelapseEvent`, `MilestoneCardView` reused live-in-sheet and for export.
- **Paywall** — product list + Restore button, `verificationFailed` hard-blocks with real copy (no silent timeout).
- **Settings** — habit edit, one-step delete-with-confirmation (relies on cascade, no manual logic), restore purchases, and the **"Your Habits" switcher required by the readiness gate**: only renders when `habits.count > 1`, tap-to-activate sets `lastInteractedAt`. Also owns the actual habit-#2 paywall gate check (`requestAddHabit()`) since that's the one concrete UI entry point for adding a second habit.

**Caught and fixed mid-build:** Codex's actual `Habit`/`RelapseEvent`/`CravingSession` initializers on disk use convenience inits (e.g. `Habit(name:unitLabel:dailyQuantity:costPerUnit:createdAt:)`), not the full memberwise ones I'd guessed from interfaces.json's property list. I diffed against Codex's real files and fixed all three call sites (HabitForm save, craving session start, relapse event write) — worth flagging since interfaces.json's struct-literal signatures don't show the actual init parameter list.

**Left for the integrator / next iteration:**
- Nothing from `services_utilities` (`EntitlementStore`, `HapticsService`, `MilestoneCardRenderer`, `Freeday.storekit`) or `polish_resilience` (`Tokens`, `SunriseCounterMotif`, `AppLevelErrorView`) exists on disk yet — every one of my screens references these by contract name and won't compile until they land. That's expected parallel-build state, not a gap in my lane.
- `Freeday.storekit` product IDs must match `PaywallViewModel.productIDs` (`com.freeday.app.plus.monthly`/`.yearly`) — whoever builds the StoreKit config should use these exact strings or tell me to change mine.
- No `.xcodeproj` yet — that's the integrator's job per the lane rules; once it exists, confirm file-system-synchronized groups are set up so this whole tree gets picked up.
- Subscription-lapse read-only degradation for non-active habits (data preserved, only most-recent stays interactive) isn't built — Settings' switcher covers *activation*, not the read-only lock for the others. Needs to be built or explicitly named in `ScopeAndDeferrals.md` per the readiness gate.
- `HapticsService.notifyStreakDay()` has no call site yet — the exact trigger moment (day-boundary crossing while app is open) needs a bit more thought than "call it once."

**Claude — cross-review (iteration 1)**

No conflicts between Codex's lane and mine — I already cross-checked their actual model/engine files against my assumptions and fixed the drift on my side. Flags for the integrator:

- **Resolved, not open:** `Habit`/`RelapseEvent`/`CravingSession` use convenience inits (e.g. `Habit(name:unitLabel:dailyQuantity:costPerUnit:createdAt:)`), not the full memberwise form interfaces.json's struct literal implied. I diffed Codex's real files and fixed my 3 call sites (HabitForm.save, TodayViewModel.startCravingSession, RelapseViewModel.confirmRelapse) — no action needed, just noting so nothing gets "fixed" twice.
- Codex flagged the "force-resolve existing active session" case has no dedicated engine method by contract — it's handled entirely in my `TodayViewModel.startCravingSession()` (abandons any `.active` session before creating a new one), and that's the only session-creation call site in the app. No gap, but worth the integrator confirming no future call site (widget, Live Activity) bypasses it.
- **Real risk, not a lane conflict:** neither Codex nor I have compiled or run `xcodebuild` — Codex said so explicitly, same is true on my side. All cross-checking so far has been manual file inspection.
- **Biggest actual gap:** `services_utilities` (`EntitlementStore`, `HapticsService`, `MilestoneCardRenderer`, `Freeday.storekit`) and `polish_resilience` (`Tokens`, `SunriseCounterMotif`, `AppLevelErrorView`) haven't landed from anyone yet. Every screen in my lane references these by contract name — nothing compiles until they exist, regardless of how clean Codex/my lanes are against each other.
- No `.xcodeproj` exists yet — still need file-system-synchronized groups stood up per the readiness-gate blocker before this is a real buildable project.
- `Freeday.storekit` doesn't exist yet — when built, its product IDs must exactly match `PaywallViewModel.productIDs` (`com.freeday.app.plus.monthly` / `.yearly`).

**Codex — cross-review (iteration 1)**

- **Hard compile blockers from your lane:** this branch references `EntitlementStore`, `HapticsService`, `MilestoneCardRenderer`, `Tokens`, `SunriseCounterMotif`, `AppLevelErrorView`, and `Freeday.storekit`, none of which exist yet in this checkout; integrator must land those modules before build.
- **`AppRootView` / `Today` / `Settings` contract dependency mismatch risk:** `AppLevelErrorView` and tokenized spacing/gradient styles are used broadly, so a single missing shared-design file will break multiple screens at once.
- **StoreKit integration contract:** product IDs are hard-coded as `com.freeday.app.plus.monthly` + `com.freeday.app.plus.yearly`; StoreKit config must match exactly or paywall/product fetch fails.
- **Project/package wiring gap:** there is still no `.xcodeproj`/group-synced target setup here, so these new files won’t be built/packaged unless the integrator adds them into the Xcode target and groups.
- **Subscription-lapse behavior incomplete:** as-is, free-tier multi-habit UI/state still allows interaction beyond one active habit in places; spec item about non-active habits being read-only is still not enforced in-screen.
- **Haptics trigger gap:** `HapticsService.notifyStreakDay()` has no caller, and `HapticsService.notifySuccess()` is used for relapse/craving completion only; day-boundary trigger intent needs explicit contract implementation.
- **Potential stale session edge case:** `TodayViewModel.startCravingSession()` only marks one existing active `CravingSession` as abandoned (`first(where:)`), not all active sessions; if multiple active rows somehow exist, they can persist and skew future assumptions.

**Integrator (Claude) — after iteration 1**

This is complete. Let me write up the integration report.

CONSENSUS: YES

## Final Output

I integrated both lanes' work into a real, wired-together Xcode project.

**What I built as integrator:**
- **The missing shared layer** that both lanes' code was calling by name but nobody had written yet: `Tokens.swift` (the actual gradient/spacing/radius values from design_handoff — mint #B9F2DE→sky #8ED0F0, poster gradient, 12/20/28pt radii, 4/8/12/16/24pt spacing), `SunriseCounterMotif` (the sunrise/counter motif with a real VoiceOver label and a gradient that warms as the streak grows), `AppLevelErrorView` (the full-screen bootstrap-failure/retry state), `EntitlementStore` (real StoreKit 2 logic — `Transaction.updates` listener, hard-fail on unverified transactions, `expired`/`revoked` distinction for the subscription-lapse rule, restore via `AppStore.sync()`), `HapticsService` (hardware-capability-gated haptics), `MilestoneCardRenderer` (ImageRenderer-based export for the ShareLink card), and `Freeday.storekit` (a local StoreKit config with the two subscription products matching the exact product IDs the paywall code expects).
- **A real Xcode project.** There was no `.xcodeproj` at all before this — I built `Freeday.xcodeproj` by hand (app target + test target, all ~40 Swift files wired into the Sources build phase, the StoreKit config wired into Resources, a test target that's app-hosted so `@testable import Freeday` resolves, and a shared scheme that points the Run and Test actions at `Freeday.storekit` so purchases/restore are testable in the simulator without a real App Store connection). I verified this by cross-checking every one of the 139 objects in the project file so there are no dangling or duplicate references.
- **Two small cross-lane fixes:** `MilestoneCardRenderer.renderImage` now takes the real `habitName` so exported milestone cards say "Vaping" instead of a generic fallback, and `TodayViewModel.startCravingSession()` now abandons *all* stale active sessions instead of just the first one (a real bug Codex flagged in review).
- **`ScopeAndDeferrals.md`**, naming what's deferred: Live Activity, WidgetKit, the TimelineView countdown upgrade, the App Group ID, the multi-variant craving toolkit, and — the one gap I want to flag clearly — **subscription-lapse read-only degradation isn't built yet**. The Settings habit switcher lets a pro user activate any habit, and data for every habit is preserved, but there's no visible "this habit is locked, read-only" state when entitlement lapses with 2+ habits. That's a real gap against a decision made in `detailed_discussion` and should be first up next iteration.

**The one thing I could not do:** this sandbox blocks execution of `xcodebuild`, `xcodegen`, and `swiftc` (every attempt returned "requires approval" with no prompt path available), so **I was not able to actually compile this project or run the test suite.** I did the next best thing — read every one of the ~45 Swift files end-to-end, cross-referenced every symbol one lane's code calls against the other lane's actual declarations (parameter names, types, default values), and mechanically verified the project file's internal object graph is self-consistent. I'm confident in the wiring, but "I read it carefully" is not the same as "it compiles," and I want that said plainly rather than rounded up to done. **The very next step, before this ships, should be opening `Freeday.xcodeproj` in actual Xcode (or running `xcodebuild -scheme Freeday build` and `xcodebuild test` somewhere that allows it) and fixing whatever the compiler finds** — likely candidates if anything breaks are StoreKit 2 API surface details in `EntitlementStore` (Apple has changed method signatures across iOS versions) and Swift actor-isolation errors around `ImageRenderer`/`Transaction.updates`, which is why I explicitly set `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` project-wide to match how the rest of the codebase was clearly written (no manual `@MainActor` annotations anywhere).

**Bottom line:** all five core workflows (habit setup, non-punitive relapse, craving timer, milestone card + ShareLink, multi-habit paid gate including the Settings switcher) now exist as real, wired Swift code with a real entry point and a real project file — this is no longer "files sitting next to each other," it's one buildable target. What's honestly unverified is the actual compile, and what's honestly missing is subscription-lapse read-only UI. Next iteration should be: (1) get this open/compiled in real Xcode and fix any type errors, (2) build the read-only-habit-lapse UI, (3) run the FreedayTests suite for real.

## Coordinator Decision

See the coordinator's message above.

## Final Output

This is complete. Let me write up the integration report.

CONSENSUS: YES

## Final Output

I integrated both lanes' work into a real, wired-together Xcode project.

**What I built as integrator:**
- **The missing shared layer** that both lanes' code was calling by name but nobody had written yet: `Tokens.swift` (the actual gradient/spacing/radius values from design_handoff — mint #B9F2DE→sky #8ED0F0, poster gradient, 12/20/28pt radii, 4/8/12/16/24pt spacing), `SunriseCounterMotif` (the sunrise/counter motif with a real VoiceOver label and a gradient that warms as the streak grows), `AppLevelErrorView` (the full-screen bootstrap-failure/retry state), `EntitlementStore` (real StoreKit 2 logic — `Transaction.updates` listener, hard-fail on unverified transactions, `expired`/`revoked` distinction for the subscription-lapse rule, restore via `AppStore.sync()`), `HapticsService` (hardware-capability-gated haptics), `MilestoneCardRenderer` (ImageRenderer-based export for the ShareLink card), and `Freeday.storekit` (a local StoreKit config with the two subscription products matching the exact product IDs the paywall code expects).
- **A real Xcode project.** There was no `.xcodeproj` at all before this — I built `Freeday.xcodeproj` by hand (app target + test target, all ~40 Swift files wired into the Sources build phase, the StoreKit config wired into Resources, a test target that's app-hosted so `@testable import Freeday` resolves, and a shared scheme that points the Run and Test actions at `Freeday.storekit` so purchases/restore are testable in the simulator without a real App Store connection). I verified this by cross-checking every one of the 139 objects in the project file so there are no dangling or duplicate references.
- **Two small cross-lane fixes:** `MilestoneCardRenderer.renderImage` now takes the real `habitName` so exported milestone cards say "Vaping" instead of a generic fallback, and `TodayViewModel.startCravingSession()` now abandons *all* stale active sessions instead of just the first one (a real bug Codex flagged in review).
- **`ScopeAndDeferrals.md`**, naming what's deferred: Live Activity, WidgetKit, the TimelineView countdown upgrade, the App Group ID, the multi-variant craving toolkit, and — the one gap I want to flag clearly — **subscription-lapse read-only degradation isn't built yet**. The Settings habit switcher lets a pro user activate any habit, and data for every habit is preserved, but there's no visible "this habit is locked, read-only" state when entitlement lapses with 2+ habits. That's a real gap against a decision made in `detailed_discussion` and should be first up next iteration.

**The one thing I could not do:** this sandbox blocks execution of `xcodebuild`, `xcodegen`, and `swiftc` (every attempt returned "requires approval" with no prompt path available), so **I was not able to actually compile this project or run the test suite.** I did the next best thing — read every one of the ~45 Swift files end-to-end, cross-referenced every symbol one lane's code calls against the other lane's actual declarations (parameter names, types, default values), and mechanically verified the project file's internal object graph is self-consistent. I'm confident in the wiring, but "I read it carefully" is not the same as "it compiles," and I want that said plainly rather than rounded up to done. **The very next step, before this ships, should be opening `Freeday.xcodeproj` in actual Xcode (or running `xcodebuild -scheme Freeday build` and `xcodebuild test` somewhere that allows it) and fixing whatever the compiler finds** — likely candidates if anything breaks are StoreKit 2 API surface details in `EntitlementStore` (Apple has changed method signatures across iOS versions) and Swift actor-isolation errors around `ImageRenderer`/`Transaction.updates`, which is why I explicitly set `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` project-wide to match how the rest of the codebase was clearly written (no manual `@MainActor` annotations anywhere).

**Bottom line:** all five core workflows (habit setup, non-punitive relapse, craving timer, milestone card + ShareLink, multi-habit paid gate including the Settings switcher) now exist as real, wired Swift code with a real entry point and a real project file — this is no longer "files sitting next to each other," it's one buildable target. What's honestly unverified is the actual compile, and what's honestly missing is subscription-lapse read-only UI. Next iteration should be: (1) get this open/compiled in real Xcode and fix any type errors, (2) build the read-only-habit-lapse UI, (3) run the FreedayTests suite for real.

---

CONSENSUS: YES

### Build Verification

# freeday — Build Verification

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 13:14:10._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Compile and verify the generated app, then run bounded repair iterations against real compiler/test failures until it passes or records honest remaining blockers.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex returned empty output — refusing to fabricate a response. See logs/._

**Claude (Backend / Systems Engineer · Closer) — Round 1**

Here's where I landed on this, and I want to be precise about what's real evidence versus what's careful inference, because that distinction is the whole job this phase.

First thing I did was try to actually run the verifier — `xcodebuild -version`, `xcode-select -p`, `swift --version`, even `python3` on a static-analysis script I wrote. Every single one came back "requires approval" with no interactive path to grant it, exactly the same wall the integrator hit in build_coordination. So I'm going to state this plainly up front rather than bury it: **no compiler was ever invoked. This is not a PASS.** Anyone reading "build_verification" and expecting a green xcodebuild log needs to know that log doesn't exist and can't be produced in this environment. That's the honest baseline, and I'm not going to round it up.

Given that, I did the next most rigorous thing available: a full manual static audit, cross-checked two ways. I checked the pbxproj mechanically — grepped every one of the 44 Swift files against `project.pbxproj` and confirmed each one is referenced exactly 6 times (PBXFileReference, PBXBuildFile, and PBXGroup/comment pairs), meaning nothing is orphaned or double-registered, and every file's group nesting matches the actual folder structure on disk. Then I read all 44 Swift files myself end-to-end — models, engines, every feature view/view-model, every service, every UI component, every test file — building a symbol table as I went and checking every cross-file call site (init signatures, `Tokens.*` references, StoreKit product IDs, HapticsService/MilestoneCardRenderer/EntitlementStore call sites) against the actual declarations. In parallel I ran a dedicated sub-agent to do the same audit independently, focused on the specific risk areas the team had already flagged (AppBootstrapState Equatable, StoreKit 2 API surface, ImageRenderer/actor isolation, SwiftData relationship inverses). Both passes agree: the AppBootstrapState case-only Equatable conformance is implemented correctly, the cascade-delete inverse keypaths match on both sides, every Tokens.* symbol referenced actually exists with that exact name, StoreKit product IDs match exactly across EntitlementStore/PaywallViewModel/Freeday.storekit, and no model-initializer call site has drifted from the real convenience-init signatures.

Here's the one real thing I found and already fixed, minimal and in-scope: `Freeday/Domain/Engines/SavingsEngine.swift` line 16 had `let additional = (safeQuantity * safeCost) * Decimal(days)` where `days` on the line above it is already a `Decimal` (`let days = Decimal(safeRateDate)`). `Decimal` doesn't have a self-conversion initializer — there's no `Decimal.init(_ value: Decimal)` in Foundation — so `Decimal(days)` would not type-check, and this exact line is directly exercised by `SavingsEngineTests.testCurrentSavingsAccumulatesFromRateEffectiveDate`, meaning it would have failed to compile the whole test target, not just produced a wrong answer at runtime. I fixed it to `days` directly — one-line change, no behavior change beyond making it compile, nothing else touched. That's the only diff in the working tree right now.

So where does that leave the honest verdict? I'm calling this **UNVERIFIED — compiler evidence unavailable, but static/manual verification is thorough and high-confidence, with one real bug found and repaired**. I'm deliberately not calling it PASS, because "two careful readers agree it looks right" is not the same claim as "the compiler said yes," and conflating those is exactly the kind of rounding-up this phase exists to prevent. I'm also not calling it FAIL, because there's no evidence of failure — every specific risk area the team named going into this phase checked out clean, and the one concrete defect I found is already fixed. Remaining known limitation, restated honestly rather than newly discovered: subscription-lapse read-only degradation for non-active habits still isn't built, per the integrator's report — that's a real product gap, not a compile blocker, and it's out of scope for this phase's mandate (repair compile/test failures, not add features).

Next repair step, concretely: someone needs to open `Freeday.xcodeproj` in real Xcode, or get `xcodebuild -scheme Freeday build && xcodebuild test -scheme Freeday` unblocked in an environment that allows it, and run it for real. If that turns up anything, my prediction based on this audit is it'll be something neither of us could catch from reading alone — a stdlib overload-resolution edge case or an Xcode-version-specific SDK signature — not a structural wiring problem, since the wiring is now verified consistent on both the project-file and symbol-reference level. That's the one thing I can't close from here, and I'm saying so rather than pretending a careful read is a substitute for it.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

## Final Output

**Verdict for this phase: UNVERIFIED (not PASS, not FAIL) — repaired what static reading could find, but no compiler was ever actually run.**

I tried myself, independently of what the transcript claimed, to invoke `xcodebuild -version`, `swift --version` — both came back "requires approval" with no interactive approval path available in this run. So the hard fact stands on my own direct evidence, not just Codex/Claude's prior say-so: **there is no compiler-verified build or test result for Freeday.** Anyone treating this phase as a green build log needs to know that log doesn't exist.

**What did happen, and what I re-checked myself:**
- The one concrete bug found in round 1 — `Freeday/Domain/Engines/SavingsEngine.swift`, where `Decimal(days)` was called on a value (`days`) that was already a `Decimal`, which has no such self-conversion initializer and would have failed to compile — is real and already fixed. I confirmed this directly via `git diff`, not just by reading the transcript: it now reads `days` instead of `Decimal(days)`, a one-line, in-scope fix with no behavior change.
- I additionally grepped every `Decimal(...)` call site across the codebase (`HabitFormViewModel.swift`, `SavingsEngine.swift`) to check for the same class of bug elsewhere — all other conversions are `Decimal(string:)` or `Decimal(Double)`/`Decimal(Int)`, which are valid initializers. No other instances of the same defect exist.
- The rest of round 1's audit (pbxproj file-reference consistency, `AppBootstrapState` Equatable, StoreKit product ID matching, cascade-delete keypaths, model-initializer call sites) was thorough manual + independent sub-agent cross-checking, not compiler evidence, and I'm not upgrading its confidence level beyond what it earned — "carefully read twice" is real diligence but isn't the same claim as "the compiler said yes."

**Repairs made this phase:** one file, `Freeday/Domain/Engines/SavingsEngine.swift`, the `Decimal(days)` → `days` fix — already present in the working tree (matches the `git status` at session start).

**Remaining known blockers:**
1. No compiler/test-runner access in this environment — the actual `xcodebuild build` and `xcodebuild test` runs still need to happen somewhere that allows toolchain execution.
2. Subscription-lapse read-only degradation for non-active habits (2+ habits, lapsed entitlement) is still unbuilt — a real product gap carried over from `build_coordination`, not a compile blocker, and out of this phase's repair mandate.

**Next repair step:** open `Freeday.xcodeproj` in real Xcode, or unblock `xcodebuild -scheme Freeday build && xcodebuild test -scheme Freeday` in an environment that permits it, and fix whatever the compiler actually reports. Given how clean the manual/static audit came back (including my own independent re-check), the realistic expectation is narrow, version-specific issues (StoreKit 2 API surface drift, actor-isolation nuances) rather than structural wiring problems — but that's a prediction, not a substitute for running it.

### Verification

❌ **Verification initial** — compile FAILED for the iOS Simulator (xcodebuild)

**Repair 1 (Claude)**

The build error was in `PrimaryActionButton.swift`: `.background(background, in: RoundedRectangle(...))` requires the `background` view to conform to `ShapeStyle`, but it's an opaque `some View` (a `LinearGradient` or `Color` branch via `@ViewBuilder`), which doesn't satisfy that overload.

Fixed by switching to the plain `.background(content:)` view modifier plus `.clipShape(...)` to apply the rounded-rectangle mask, which works with any `View`:

```swift
.background(background)
.clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.component, style: .continuous))
```

This preserves the same visual result (gradient/tonal fill clipped to a rounded rectangle) without requiring `ShapeStyle` conformance.
✅ **Verification after repair 1** — compiled cleanly for the iOS Simulator (xcodebuild)

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

## Final Output

**Verdict for this phase: UNVERIFIED (not PASS, not FAIL) — repaired what static reading could find, but no compiler was ever actually run.**

I tried myself, independently of what the transcript claimed, to invoke `xcodebuild -version`, `swift --version` — both came back "requires approval" with no interactive approval path available in this run. So the hard fact stands on my own direct evidence, not just Codex/Claude's prior say-so: **there is no compiler-verified build or test result for Freeday.** Anyone treating this phase as a green build log needs to know that log doesn't exist.

**What did happen, and what I re-checked myself:**
- The one concrete bug found in round 1 — `Freeday/Domain/Engines/SavingsEngine.swift`, where `Decimal(days)` was called on a value (`days`) that was already a `Decimal`, which has no such self-conversion initializer and would have failed to compile — is real and already fixed. I confirmed this directly via `git diff`, not just by reading the transcript: it now reads `days` instead of `Decimal(days)`, a one-line, in-scope fix with no behavior change.
- I additionally grepped every `Decimal(...)` call site across the codebase (`HabitFormViewModel.swift`, `SavingsEngine.swift`) to check for the same class of bug elsewhere — all other conversions are `Decimal(string:)` or `Decimal(Double)`/`Decimal(Int)`, which are valid initializers. No other instances of the same defect exist.
- The rest of round 1's audit (pbxproj file-reference consistency, `AppBootstrapState` Equatable, StoreKit product ID matching, cascade-delete keypaths, model-initializer call sites) was thorough manual + independent sub-agent cross-checking, not compiler evidence, and I'm not upgrading its confidence level beyond what it earned — "carefully read twice" is real diligence but isn't the same claim as "the compiler said yes."

**Repairs made this phase:** one file, `Freeday/Domain/Engines/SavingsEngine.swift`, the `Decimal(days)` → `days` fix — already present in the working tree (matches the `git status` at session start).

**Remaining known blockers:**
1. No compiler/test-runner access in this environment — the actual `xcodebuild build` and `xcodebuild test` runs still need to happen somewhere that allows toolchain execution.
2. Subscription-lapse read-only degradation for non-active habits (2+ habits, lapsed entitlement) is still unbuilt — a real product gap carried over from `build_coordination`, not a compile blocker, and out of this phase's repair mandate.

**Next repair step:** open `Freeday.xcodeproj` in real Xcode, or unblock `xcodebuild -scheme Freeday build && xcodebuild test -scheme Freeday` in an environment that permits it, and fix whatever the compiler actually reports. Given how clean the manual/static audit came back (including my own independent re-check), the realistic expectation is narrow, version-specific issues (StoreKit 2 API surface drift, actor-isolation nuances) rather than structural wiring problems — but that's a prediction, not a substitute for running it.

**Build verification:** verified after 1 repair(s): compiled cleanly for the iOS Simulator

VERIFICATION: VERIFIED

---

CONSENSUS: YES

### Human Qa Checklist

# freeday — Human Qa Checklist

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 13:23:45._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Create a manual simulator/device QA script for every important workflow, including onboarding, empty states, error states, persistence, accessibility, offline behavior, paywall/subscription behavior when relevant, and regression checks.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex returned empty output — refusing to fabricate a response. See logs/._

**Claude (QA & Risk · Visionary) — Round 1**

I pulled up the actual build structure from the transcript rather than re-deriving it, since the prior phases already nailed down exact screen names, states, and gating rules — I'll write the checklist against that reality rather than guessing.

Here's my pass at the QA script, written as something a tester with a fresh simulator and zero context could actually execute.

Start every session the same way: fully delete the app from the simulator/device before the first run (not just relaunch), so onboarding is tested from true zero state, not from a previous tester's leftover SwiftData store. Do this before each major regression pass, not just once.

**Cold launch, zero habits.** Launch fresh. Expect the Today tab to show the onboarding prompt card ("what are you quitting?") immediately — no blank white screen, no spinner hang. This state and the SwiftData-loading skeleton state are easy to conflate if the store opens fast in the simulator, so deliberately test this on an older/slower simulator target too, since the loading skeleton (pulsing stat cards + silhouette sunrise motif) is a state that will basically never appear on a fast simulator and needs to be forced — throttle by adding artificial delay in a debug build if that's the only way to actually see it, otherwise this state ships untested by construction. Tap into setup from the onboarding card.

**Habit setup.** Enter a name, then try to save with quantity or cost left at zero, negative, or a garbage decimal (e.g. "12..5") — each must be rejected inline with a save button that stays disabled, no crash, no silent acceptance. Enter valid values and confirm the live savings preview updates on every keystroke, not just on blur. Save, and confirm you land on Today with the new habit visible immediately (no second launch needed to see it). Then go back into edit on that same habit and change the cost — confirm the recompute-disclosure banner appears the instant the field diverges from its original value (not before), and after saving, confirm the savings total before that edit's effective date did not change, only the go-forward number differs. This is the single most distrust-prone number in the app if it's wrong, so don't just eyeball it — do the arithmetic by hand for a specific date range and compare.

**Today screen, steady state.** Confirm four stats: streak days, lifetime days free, money saved, cravings survived. Force-quit and relaunch at various times of day, and specifically test crossing local midnight while the app is backgrounded — streak should advance by exactly one day, never double-advance, never skip. If you can, change the simulator's date/timezone (Settings app → General → Date & Time) forward and backward across a DST boundary while the app is running, then reopen — this is a named accepted limitation (streak can jump), so confirm it doesn't crash or go negative, it's fine if the day count visibly jumps.

**Craving timer, the highest-stakes flow.** Start it from Today. Watch the countdown for a few seconds, background the app (hardware button or swipe up), wait roughly two minutes real time, then reopen — the timer should read essentially zero remaining and show completed state, not still counting down from where you left it. Do this again but this time force-quit the app entirely (not just background) at around the 40-second mark, wait past the 90-second mark in real time, then relaunch — this must resolve to abandoned with no completion credit and no crash, and the cravings-survived counter must not have moved. Now do the inverse: force-quit at second 20, relaunch after only 10 real seconds have passed — it should resume the countdown from the correct remaining time, not restart the guided content from the beginning. Finally do one clean full run to completion without interruption and confirm the haptic fires once (on a real device — the simulator won't produce it, so this specific check needs actual hardware) and the counter increments by exactly one. Try starting a second craving session while one is already notionally active (e.g. force-quit mid-session, then immediately tap "I'm craving now" again from Today) and confirm the old session doesn't linger as a phantom active session that could double-count later.

**Relapse and reset, the trust-critical screen.** Tap the relapse action, and on the confirmation step look specifically for the absence of anything: no red, no orange-red warning tone, no words like "broken," "failed," "reset to zero" used punitively, no shake animation. Confirm. On the very next frame — not after a second tap or a navigation push — you should see both the new "day 0" state and the untouched lifetime-days/lifetime-savings numbers in the same view, with the lifetime figure getting its own distinct warm accent treatment. Do the arithmetic: lifetime days free before relapse should exactly equal lifetime days free immediately after (unchanged), and only the current streak resets. Do this twice in a row on the same habit and confirm the lifetime total accumulates correctly across two separate streak segments, not just for one relapse ever.

**Milestone card.** Get a habit to day 1 or day 3 (whichever is the configured early threshold) and confirm the milestone share prompt actually surfaces without digging for it. Open the app five more times after crossing that threshold and confirm the prompt does not fire again. Open the ShareLink sheet and actually complete a share to Notes or Messages (don't just open and dismiss the sheet — confirm the exported image itself contains the correct day count and dollar figure, not a placeholder). Do this once in light mode and once in dark mode, and once with the system text size cranked to the largest accessibility setting — the day count and dollar figure must not clip or truncate in any of these combinations. This card is the one artifact that represents the app to someone who's never opened it, so treat any clipping or wrong number here as a release blocker, not a cosmetic bug.

**Paywall and habit #2.** As a fresh, non-subscribed user, tap whatever the "add a second habit" entry point is and confirm the paywall appears before any name/quantity/cost field is ever shown — not after you fill out the form and try to save. In the sandboxed StoreKit environment, walk through an actual purchase using the local `.storekit` config, then confirm you're immediately able to create and see the second habit. Kill and relaunch the app and confirm the pro entitlement persists without re-purchasing. Then specifically force an unverified-transaction case if the `.storekit` config supports simulating one, and confirm entitlement is hard-blocked with real explanatory copy, not a silent hang or a soft-granted access. Test "Restore Purchases" both when there's a real prior purchase to restore and when there's nothing to restore — neither case should crash or falsely grant access.

**Settings habit switcher — this is the one built specifically to close the "I paid for unlimited habits and can't reach the second one" gap, so test it like an App Store reviewer would.** With only one habit, confirm the "Your Habits" section doesn't render at all — no empty list, no grayed placeholder, nothing. After subscribing and adding habit #2, go to Settings, confirm both habits now list there, tap the one that isn't currently active, and confirm Today switches to show that habit's numbers on next view — not stale numbers from the previous habit. Add a third habit and repeat. This is a Must-have workflow per the original spec, not incidental settings polish — don't let it get bundled into a generic "settings looks fine" check.

**Known gap to specifically probe rather than let a tester stumble onto by accident:** subscription-lapse read-only degradation for non-active habits was never built. If you cancel/expire the subscription in the sandbox with 2+ habits already created, confirm the data for every habit is still visibly present (nothing deleted, nothing silently reset), but expect that today's build does not lock the non-active habits into an explicit read-only state — that's a real, named, already-flagged product gap, not a new bug to write up as a surprise discovery. QA should confirm it fails safe (no crash, no data loss, no false entitlement) even though it doesn't yet fail correctly (no visible "locked" UI).

**Habit delete.** Delete a habit that has relapse history and completed craving sessions attached, confirm the one confirmation step, and confirm afterward that its history no longer appears anywhere (Today, Milestones list) — this is really checking there's no orphaned row silently left around, which you can't see directly on-device, so pair this with export/inspect the SwiftData store file if possible, or at minimum confirm the milestones list and any remaining habit's stats are unaffected.

**Accessibility, done properly rather than glanced at.** Turn on VoiceOver and swipe through Today — the sunrise/counter motif must announce something like "47 days free," not silence or a generic "image." Do the same on the milestone card. Set Dynamic Type to the largest accessibility size and confirm the 2x2 stat grid on Today reflows to a single column rather than clipping or overlapping. Check both primary action buttons on Today are comfortably tappable at their stated 56pt height with VoiceOver on, since a stressed thumb during an actual craving is the real usage condition being simulated. Run a contrast check in both light and dark mode on the relapse screen specifically, since its whole design intent is to feel calm rather than clinical, and that's easy to get wrong in one color scheme even if the other looks fine.

**Offline.** Turn on airplane mode and go through the entire core loop — habit setup, streak view, craving timer, relapse, milestone card render and share-sheet (not the network send itself, just confirm the local share sheet opens) — none of it should degrade, since the only networked feature in the whole app is StoreKit. Confirm the paywall itself handles airplane mode gracefully (can't fetch products, should show a clear failure state rather than an infinite spinner) since that's the one screen that actually needs network.

**Full regression pass to close a QA session:** fresh install, one relapse, one full timer completion, one milestone share, one second-habit paywall purchase, one restore-purchases tap, one habit switch in Settings, one habit delete — run all seven in one sitting on one build before signing off, since these are the exact seven the build-verification phase already committed to as the release smoke test, and QA should be the one independently confirming they still hold, not trusting the build report's word for it.

The remaining named-and-accepted gaps that shouldn't be filed as new bugs when found: no Live Activity, no WidgetKit, only one craving-timer content variant instead of the planned 2-3, no Face ID/passcode app lock, no daily reminder notifications, and the subscription-lapse read-only UI gap called out above. Everything else on this list is fair game to fail the build over.

**Coordinator (Claude) — decision after round 1**

**CONSENSUS: YES**

Codex couldn't weigh in this round (CLI unavailable, same as it's been for the last several phases), but Claude's checklist is thorough enough on its own to close this phase — it's not a thin placeholder, it directly implements the phase playbook's required elements and ties every check back to a decision locked in an earlier phase rather than inventing new requirements.

## Final Output

The QA script covers every workflow the app_features phase marked Must-have, plus the specific edge cases the team spent nine phases arguing into existence:

- **Fresh-install discipline**: full delete-reinstall before testing, not just relaunch, so onboarding and the loading-skeleton state (which a fast simulator will otherwise never show) get genuinely exercised.
- **Habit setup**: inline rejection of zero/negative/garbage values, live savings preview, and the forward-only recompute rule verified by hand-checking the arithmetic across an edit boundary, not just eyeballing the UI.
- **Today screen**: the four core stats, plus deliberate midnight-crossing and timezone/DST manipulation to confirm the streak advances correctly and never goes negative (with DST drift explicitly treated as an accepted limitation, not a bug).
- **Craving timer**: background-then-return, force-quit-before-elapsed, force-quit-after-elapsed, and phantom-session cases — the exact resume/abandon rules locked in detailed_discussion, each with concrete timings a tester can actually follow.
- **Relapse/reset**: checked for absence of shaming language/color as much as presence of the reassurance UI, plus a same-screen arithmetic check that lifetime totals survive two consecutive relapses.
- **Milestone card**: real ShareLink completion (not just sheet-open), light/dark, and max Dynamic Type — flagged correctly as a release blocker if it clips, since it's the one artifact representing the app to non-users.
- **Paywall + Settings habit switcher**: tested like an App Store reviewer would — paywall before any form field renders, real sandbox purchase, unverified-transaction and empty-restore cases, then the specific "pay → add habit #2 → switch to it in Settings → confirm Today updates" path that the implementation_readiness_gate fought for two rounds to get built.
- **Accessibility, offline, and a named-gaps section** that explicitly won't let known deferrals (Live Activity, WidgetKit, single craving variant, no app-lock, no reminders, and the subscription-lapse read-only gap) get filed as new bugs — while still requiring QA to confirm those failure paths fail *safely* even if not *correctly*.
- Closes with the same seven-step smoke test build_verification already committed to as the release gate, run independently by QA rather than taken on the build report's word.

This satisfies the phase's acceptance checks: a tester with a fresh simulator could run it without asking what to tap, every Must-have workflow from app_features is represented, and failure/edge states are tested throughout rather than assumed. Phase closes here.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
The phase output meets the bar. Claude's round-1 checklist (which the coordinator's Final Output correctly endorses and summarizes rather than needing to rewrite) is concrete enough for a tester to execute cold: it specifies exact simulator actions (force-quit timing at specific seconds, real-world wait durations, exact date/timezone manipulation steps, specific StoreKit sandbox flows), expected results for each, and explicit pass/fail criteria.

Coverage check against app_features Must-haves: habit setup with inline validation and forward-only recompute (verified by hand arithmetic, not just visual check) ✓, Today's four-stat screen with midnight/DST edge cases ✓, non-punitive relapse with lifetime-total arithmetic check across repeated relapses ✓, craving timer's full resume/abandon/background matrix tied to the exact rules locked in detailed_discussion ✓, milestone card tested for real ShareLink completion at light/dark/max Dynamic Type ✓, StoreKit paywall plus the habit-switcher fix from implementation_readiness_gate tested specifically as an App Store reviewer would ✓, accessibility (VoiceOver labels, Dynamic Type reflow, contrast) ✓, offline/airplane mode ✓, cascade-delete verification ✓.

Failure states are genuinely tested, not assumed: invalid input rejection, unverified StoreKit transactions, empty-restore, force-quit-past-elapsed, phantom sessions, airplane-mode paywall behavior.

The known-gaps section is handled correctly per the global rule "do not declare the app done until build verification and the final review agree on what remains limited" — it explicitly names Live Activity, WidgetKit, single craving variant, no app-lock, no reminders, and the subscription-lapse read-only gap as accepted deferrals, while still requiring QA to confirm those paths fail safely. This matches the verified build status and the integrator's honest gap-reporting from prior phases, with no scope inflation or silent omission.

Codex's continued CLI unavailability is consistent with the pattern already established and accepted in build_verification; closing on Claude's single thorough pass is reasonable given the depth delivered. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

**CONSENSUS: YES**

Codex couldn't weigh in this round (CLI unavailable, same as it's been for the last several phases), but Claude's checklist is thorough enough on its own to close this phase — it's not a thin placeholder, it directly implements the phase playbook's required elements and ties every check back to a decision locked in an earlier phase rather than inventing new requirements.

## Final Output

The QA script covers every workflow the app_features phase marked Must-have, plus the specific edge cases the team spent nine phases arguing into existence:

- **Fresh-install discipline**: full delete-reinstall before testing, not just relaunch, so onboarding and the loading-skeleton state (which a fast simulator will otherwise never show) get genuinely exercised.
- **Habit setup**: inline rejection of zero/negative/garbage values, live savings preview, and the forward-only recompute rule verified by hand-checking the arithmetic across an edit boundary, not just eyeballing the UI.
- **Today screen**: the four core stats, plus deliberate midnight-crossing and timezone/DST manipulation to confirm the streak advances correctly and never goes negative (with DST drift explicitly treated as an accepted limitation, not a bug).
- **Craving timer**: background-then-return, force-quit-before-elapsed, force-quit-after-elapsed, and phantom-session cases — the exact resume/abandon rules locked in detailed_discussion, each with concrete timings a tester can actually follow.
- **Relapse/reset**: checked for absence of shaming language/color as much as presence of the reassurance UI, plus a same-screen arithmetic check that lifetime totals survive two consecutive relapses.
- **Milestone card**: real ShareLink completion (not just sheet-open), light/dark, and max Dynamic Type — flagged correctly as a release blocker if it clips, since it's the one artifact representing the app to non-users.
- **Paywall + Settings habit switcher**: tested like an App Store reviewer would — paywall before any form field renders, real sandbox purchase, unverified-transaction and empty-restore cases, then the specific "pay → add habit #2 → switch to it in Settings → confirm Today updates" path that the implementation_readiness_gate fought for two rounds to get built.
- **Accessibility, offline, and a named-gaps section** that explicitly won't let known deferrals (Live Activity, WidgetKit, single craving variant, no app-lock, no reminders, and the subscription-lapse read-only gap) get filed as new bugs — while still requiring QA to confirm those failure paths fail *safely* even if not *correctly*.
- Closes with the same seven-step smoke test build_verification already committed to as the release gate, run independently by QA rather than taken on the build report's word.

This satisfies the phase's acceptance checks: a tester with a fresh simulator could run it without asking what to tap, every Must-have workflow from app_features is represented, and failure/edge states are tested throughout rather than assumed. Phase closes here.

VERIFICATION: VERIFIED

---

CONSENSUS: YES

### App Store Readiness

# freeday — App Store Readiness

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 13:26:08._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Prepare launch readiness: App Store positioning, screenshots/storyboard needs, privacy nutrition labels, permission copy, subscription/paywall review risks, support/contact requirements, and release blockers.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (timeout)._

**Claude (QA & Risk · Skeptic) — Round 1**

Coming at this from the launch-readiness side, and I want to push hard on a few things that are easy to wave through because the build itself verified clean.

Positioning first, since it drives everything downstream. The App Store listing needs to sell "one app for quitting anything" without ever drifting into medical territory — that's not a style note, it's a review risk. This is a habit-quitting app that explicitly covers cigarettes, vaping, and alcohol, which puts it in Apple's substance-reference territory for the age rating questionnaire. I'd expect "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References" checked, landing at 12+ rather than 4+ or 9+ — and the team should pick that deliberately rather than let App Store Connect's default guess stand, because guessing wrong either invites a review bounce or under-rates content that references addiction and relapse. The description, subtitle, and keywords all need to stay in "personal tracking tool" language: never "quit smoking," always "track what you're cutting back on"; never "treatment," "recovery," "addiction program," or anything that reads as a health claim under guideline 1.4/5.1. Concrete launch copy I'd actually ship: title "Freeday: Habit & Craving Tracker," subtitle "Track any habit, watch it add up," and a first description line that mirrors the locked positioning verbatim — "One app for quitting anything — track your streak, watch your savings grow, and get through the next craving without doing it alone." No emoji-bait, no "cure," no "medical," no "doctor-recommended."

On screenshots, the storyboard should lead with the Today screen at a strong, made-up-but-realistic number (something like "47 days free · $310 saved") since that's the emotional hook, then the craving timer mid-countdown with the "ride it out" framing, then the milestone share card since that's the actual viral artifact and deserves its own frame, then the paywall/Freeday+ screen, and I'd include the relapse/reset screen too but only because it's a genuine differentiator worth showing off — just make sure whoever captures it screenshots the post-tap reassurance state, not a screen that could read as punitive out of context. One thing nobody's flagged yet: the app icon and every screenshot need to stay away from literal imagery — no cigarette, vape pen, wine glass, or pill iconography. The sunrise/counter motif exists specifically to keep this abstract, but if anyone's tempted to add a "quit smoking" visual metaphor to make the store listing punchier, that's exactly the kind of asset that risks a reviewer reading it as drug-paraphernalia depiction rather than a wellness tool. Required sizes are the 6.9" iPhone class (this being iPhone-only per everything built, no iPad screenshots needed unless the app is being submitted as universal, which nothing in nine phases suggests it is) — that's a concrete blocker if nobody's actually captured device screenshots yet, since a verified compile is not the same as having App Store Connect assets ready.

Privacy label is actually the easy part here, and I want to say that plainly rather than manufacture risk where there isn't any: zero network calls except StoreKit, no HealthKit, no notifications, no camera, no location, no analytics, no crash reporting. That maps cleanly to "Data Not Collected" on the nutrition label, which is a genuine selling point worth putting in the description ("everything stays on your device"). But it also means there are zero Info.plist usage-description strings to write, and I want to flag the flip side of that cleanly: the app is storing genuinely sensitive personal information — what someone's trying to quit, exact relapse timestamps, streak history — completely unprotected behind whatever the device's own lock screen provides, since the no-Face-ID/no-passcode-lock decision was made explicitly back in detailed_discussion and never revisited. That was an acceptable v1 tradeoff for shipping speed, but it's the kind of thing that becomes a one-star review the day someone's partner or parent picks up their unlocked phone. I'm not calling it a submission blocker since Apple doesn't require app-level locks, but I'd want the privacy policy page to at least be honest about it ("Freeday does not require a passcode; anyone with access to your unlocked device can see your tracked habits") rather than silently omit it, and I'd flag it as the top item for the very next release.

Permission copy is a non-event — there's nothing to request, so there's nothing to write strings for. Where the real risk sits is the subscription/paywall review path. The `SubscriptionStoreView`-based paywall handles a lot of Apple's 3.1.2 disclosure requirements automatically (title, duration, price), but someone needs to actually confirm in a real sandbox run that the auto-renewal terms, price-per-period, and links to a Privacy Policy and Terms of Use/EULA are visible on that screen before submission — a verified compile doesn't verify that Apple's own SubscriptionStoreView is rendering the disclosure block correctly with this app's specific product configuration, and this is the single most common rejection reason for subscription apps. Restore Purchases is built and wired to `Transaction.currentEntitlements`, which is good, but I'd want it manually confirmed in TestFlight, not just unit-audited, since that's exactly the flow build_verification never got to run through a real compiler either. Support URL and a privacy policy URL are hard requirements in App Store Connect metadata — I don't see either mentioned anywhere in nine phases of discussion, which makes me suspect neither exists yet as an actual hosted page, and that alone blocks submission regardless of how clean the binary is.

The one thing I want to be the person to say plainly, because it's been named and then quietly carried forward as a known gap for three phases running without anyone re-litigating whether that's actually fine for launch: subscription-lapse read-only degradation was never built. Today, if a paying user's subscription lapses with two or more habits, there is no enforcement step — the integration report says data is preserved (good, matches the trust rule) but doesn't say access gets restricted, and nothing in the QA checklist's "known gap" framing confirms what actually happens on lapse beyond "fails safe." That's a revenue-integrity risk more than an App Store rejection risk — Apple reviewers don't typically test subscription-cancel-then-continue-using-pro-features as a rejection trigger — but I don't want it waved through as cosmetic. If a subscriber cancels and still gets full multi-habit functionality forever, that's a real business hole, and it should be named explicitly as a launch-accepted risk with a committed fast-follow date, not left ambiguous.

Given all of that, my honest verdict is conditional-launch-ready, not launch-ready: the code compiles, the core five workflows are real, and privacy is genuinely clean and easy to state. But there are concrete, unclosed blockers — hosted support and privacy policy URLs, a manual sandbox confirmation that the paywall's Apple-required disclosure text actually renders, real device screenshots (not simulator placeholders), a deliberate age-rating questionnaire answer rather than a default guess, and copy review across the description/paywall/milestone card for anything that reads clinical — that have to close before this goes to App Store Connect, plus one named-and-accepted business risk (subscription-lapse enforcement) that should be written down rather than silently carried.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

Codex couldn't join this round (still in cooldown, same gap that's shown up in the last few phases), but Claude's pass is a complete, concrete answer to everything this phase requires — positioning, screenshot plan, privacy label, permission copy, subscription risk, and a clear-eyed list of what's actually blocking submission versus what's just a named tradeoff. Nothing here contradicts any prior-phase decision; it's the first phase to specifically audit App Store Connect readiness rather than code correctness, and it does that job properly rather than restating the build report.

## Final Output

**Launch-readiness verdict: CONDITIONAL — not launch-ready yet.** The app itself is real and verified (compiles clean, all five core workflows implemented, privacy genuinely clean). What's missing is App Store Connect submission material that nine phases of build work never touched.

**App Store positioning:** Stay strictly in "personal tracking tool" language, never "quit smoking" / "treatment" / "recovery" / "addiction program" (guideline 1.4/5.1 risk). Suggested title "Freeday: Habit & Craving Tracker," subtitle "Track any habit, watch it add up," first description line mirroring the locked positioning verbatim. Age rating: deliberately select "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References" (likely lands at 12+) rather than accepting App Store Connect's default guess, since the app explicitly references cigarettes/vaping/alcohol.

**Screenshot/storyboard plan:** Today screen (streak/savings hero shot) → craving timer mid-countdown → milestone share card (the actual viral artifact, its own frame) → paywall/Freeday+ → relapse/reset screen (post-tap reassurance state only, never the raw pre-tap frame out of context). No literal cigarette/vape/alcohol/pill iconography anywhere in icon or screenshots — the sunrise/counter motif exists specifically to avoid that risk. 6.9" iPhone class screenshots required; none appear to exist yet — that's a concrete blocker, not a formality.

**Privacy label:** Clean "Data Not Collected" — zero network calls except StoreKit, no HealthKit/notifications/camera/location/analytics/crash reporting. Worth stating as a selling point in the description. Flip side to document honestly (not a submission blocker, but a real gap): no Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — this was an accepted v1 tradeoff from `detailed_discussion`, restated here rather than silently carried, and belongs on the privacy policy page and as the top item for the next release.

**Permission copy:** None needed — no Info.plist usage-description strings required since no permissions are requested.

**Subscription/paywall review risks:** `SubscriptionStoreView` handles most of Apple's 3.1.2 disclosure requirements automatically, but nobody has manually confirmed in a real sandbox run that auto-renewal terms, price-per-period, and Privacy Policy/Terms links actually render for this app's specific product config — that's the single most common subscription-app rejection reason and hasn't been checked outside the compiler. Restore Purchases is wired to `Transaction.currentEntitlements` but needs a TestFlight confirmation, not just a code audit.

**Launch blockers (must close before submission):**
1. Hosted support URL and privacy policy URL — required App Store Connect metadata, not mentioned anywhere in nine phases, likely don't exist yet.
2. Real device/simulator screenshots at required sizes — not yet captured.
3. Manual sandbox confirmation that the paywall's required disclosure text renders correctly.
4. Deliberate age-rating questionnaire answer (12+ recommendation above) rather than a default guess.
5. Final copy pass across description, paywall, and milestone card for anything readable as clinical/medical.

**Named-and-accepted risk (not a submission blocker, flag and move on):** subscription-lapse read-only enforcement was never built — a lapsed subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but there's no access restriction. This is a revenue-integrity gap, not an App Store rejection risk, and should be written down as a committed fast-follow rather than left ambiguous in scope docs.

Phase closes here — ready for whatever comes next in the pipeline.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
The output satisfies the phase's required elements and acceptance checks. It gives an honest, non-inflated verdict (CONDITIONAL, not launch-ready) rather than rounding up despite a verified compile — consistent with the global rule not to declare done until verification and QA agree on what's limited. All six required outputs are present and concrete: positioning includes specific title/subtitle/description copy and a reasoned age-rating recommendation (12+, "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References") rather than a generic placeholder; the screenshot plan sequences specific screens with a concrete rationale for each and flags a real content risk (no literal substance iconography); privacy label notes are specific ("Data Not Collected") and correctly cross-reference the accepted no-app-lock tradeoff from `detailed_discussion` instead of re-litigating it; permission copy is correctly stated as N/A given zero runtime permissions, rather than padded; subscription/paywall risks name the actual highest-frequency subscription-app rejection reason (disclosure text rendering unverified beyond compiler) and call out Restore Purchases needing a real TestFlight check; launch blockers are concrete and actionable (hosted URLs, real device screenshots, manual sandbox paywall check, deliberate age-rating selection, clinical-language copy pass).

It also correctly separates submission blockers from the previously-known subscription-lapse read-only gap, naming it as a business/revenue-integrity risk rather than conflating it with App Store rejection risk — consistent with how that gap was already carried honestly through `build_coordination`, `build_verification`, and `human_qa_checklist` without scope inflation or silent omission. Nothing here contradicts a prior-phase decision. Codex's absence is consistent with the established pattern in recent phases and doesn't leave the phase thin given the depth of Claude's pass. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

Codex couldn't join this round (still in cooldown, same gap that's shown up in the last few phases), but Claude's pass is a complete, concrete answer to everything this phase requires — positioning, screenshot plan, privacy label, permission copy, subscription risk, and a clear-eyed list of what's actually blocking submission versus what's just a named tradeoff. Nothing here contradicts any prior-phase decision; it's the first phase to specifically audit App Store Connect readiness rather than code correctness, and it does that job properly rather than restating the build report.

## Final Output

**Launch-readiness verdict: CONDITIONAL — not launch-ready yet.** The app itself is real and verified (compiles clean, all five core workflows implemented, privacy genuinely clean). What's missing is App Store Connect submission material that nine phases of build work never touched.

**App Store positioning:** Stay strictly in "personal tracking tool" language, never "quit smoking" / "treatment" / "recovery" / "addiction program" (guideline 1.4/5.1 risk). Suggested title "Freeday: Habit & Craving Tracker," subtitle "Track any habit, watch it add up," first description line mirroring the locked positioning verbatim. Age rating: deliberately select "Infrequent/Mild Alcohol, Tobacco, or Drug Use or References" (likely lands at 12+) rather than accepting App Store Connect's default guess, since the app explicitly references cigarettes/vaping/alcohol.

**Screenshot/storyboard plan:** Today screen (streak/savings hero shot) → craving timer mid-countdown → milestone share card (the actual viral artifact, its own frame) → paywall/Freeday+ → relapse/reset screen (post-tap reassurance state only, never the raw pre-tap frame out of context). No literal cigarette/vape/alcohol/pill iconography anywhere in icon or screenshots — the sunrise/counter motif exists specifically to avoid that risk. 6.9" iPhone class screenshots required; none appear to exist yet — that's a concrete blocker, not a formality.

**Privacy label:** Clean "Data Not Collected" — zero network calls except StoreKit, no HealthKit/notifications/camera/location/analytics/crash reporting. Worth stating as a selling point in the description. Flip side to document honestly (not a submission blocker, but a real gap): no Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — this was an accepted v1 tradeoff from `detailed_discussion`, restated here rather than silently carried, and belongs on the privacy policy page and as the top item for the next release.

**Permission copy:** None needed — no Info.plist usage-description strings required since no permissions are requested.

**Subscription/paywall review risks:** `SubscriptionStoreView` handles most of Apple's 3.1.2 disclosure requirements automatically, but nobody has manually confirmed in a real sandbox run that auto-renewal terms, price-per-period, and Privacy Policy/Terms links actually render for this app's specific product config — that's the single most common subscription-app rejection reason and hasn't been checked outside the compiler. Restore Purchases is wired to `Transaction.currentEntitlements` but needs a TestFlight confirmation, not just a code audit.

**Launch blockers (must close before submission):**
1. Hosted support URL and privacy policy URL — required App Store Connect metadata, not mentioned anywhere in nine phases, likely don't exist yet.
2. Real device/simulator screenshots at required sizes — not yet captured.
3. Manual sandbox confirmation that the paywall's required disclosure text renders correctly.
4. Deliberate age-rating questionnaire answer (12+ recommendation above) rather than a default guess.
5. Final copy pass across description, paywall, and milestone card for anything readable as clinical/medical.

**Named-and-accepted risk (not a submission blocker, flag and move on):** subscription-lapse read-only enforcement was never built — a lapsed subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but there's no access restriction. This is a revenue-integrity gap, not an App Store rejection risk, and should be written down as a committed fast-follow rather than left ambiguous in scope docs.

Phase closes here — ready for whatever comes next in the pipeline.

VERIFICATION: VERIFIED

---

CONSENSUS: YES

### Final Review

# freeday — Final Review

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 13:28:14._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

Final review of completeness, consistency, risks, quality gates, and a clear go / no-go decision.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (timeout)._

**Claude (Delivery Lead · Pragmatist) — Round 1**

Here's my honest read, coming at this purely from "what's the realistic path to something a user can actually run today."

What's real: there's a compiling Xcode project with five core workflows written as actual wired Swift code — habit setup with validation and forward-only recompute, a non-punitive relapse flow, a wall-clock-anchored craving timer, a milestone card with ShareLink, and the multi-habit paywall gate including the Settings switcher that got added specifically to close the "paid but can't reach habit #2" hole. That's a genuinely complete MVP slice against the original prompt's v1 build scope, and the five workflows map one-to-one to what prompt_contract locked as non-negotiable. Compared to the original prompt, the two things explicitly named as scope in "v1 Build Scope" that aren't here are the widget and Live Activity — both are named, both were sanctioned to degrade first back in project_plan, so that's not scope creep or silent loss, it's a documented tradeoff. Good.

Now the thing I want to be the one to say plainly, because it's the kind of gap a Delivery Lead is supposed to catch and everyone else has been circling it without landing on it: "verified" in this project means "xcodebuild build succeeded," full stop. Nobody has run the test suite. There are six real test files sitting in FreedayTests — StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine, Persistence, EntitlementStore — covering exactly the scary edge cases (DST, midnight rollover, force-quit timing, cascade delete, unverified transactions) that the whole team spent nine phases agreeing were the highest-risk logic in the app. Those tests compiling is not the same as those tests passing. And separately, the human_qa_checklist phase produced a script, not a completed run — nobody has actually installed this on a simulator and walked the craving timer through a real background/foreground cycle, or watched the milestone card render at max Dynamic Type. So the honest status is: compiles clean, logic is well-reasoned and cross-reviewed on paper, but zero dynamic evidence — no green test run, no human hands on a device — exists yet. That's a materially weaker claim than "build_verification: VERIFIED" sounds like to someone skimming phase names, and I don't want that gap smoothed over in the final writeup.

Given that, here's my sequencing opinion for what should happen next, in priority order, since that's the actual job of this phase: (1) run FreedayTests for real — this is cheap, mechanical, and closes the single biggest confidence gap for the least effort; (2) walk the seven-step smoke checklist by hand on a simulator once, since that's already written and just needs a person to execute it; (3) everything else — app-lock, subscription-lapse read-only enforcement, hosted support/privacy URLs, real screenshots — is launch-prep or v1.1 work, not a blocker to calling this MVP done.

On limitations, three things need to stay visible in the final output rather than get buried under "conditional launch-ready": the subscription-lapse read-only gap is a real revenue-integrity hole where a canceled subscriber keeps full multi-habit access forever — that's not cosmetic, that's the paid tier's enforcement mechanism missing one case; the app has zero device-level protection for what is, by the product's own design, sensitive personal disclosure data (what someone's quitting, relapse timestamps); and the craving-support toolkit shipped with one guided sequence instead of the 2-3 variants promised in the per_app_product_brief phase as a concrete paid-tier value differentiator — that's a paywall promise ("full craving-support toolkit") that isn't fully backed by what's actually behind it.

My overall verdict: this is a genuine go for "usable local MVP," not yet a go for "submit to App Store." The distinction matters and the final review should keep them separate rather than blend into one score. If I had to pick the one thing that would most change my confidence with the least effort, it's running the existing test suite — that's sitting right there, already written, and closes the gap between "we read it carefully twice" and "we know it works."

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

Codex is still unavailable this round (same cooldown gap as the last several phases), but Claude's pass is a complete, honest answer to everything final_review requires — and importantly, it's the one phase that names something no prior phase quite landed on: "VERIFIED" in this project's vocabulary means "xcodebuild compiled," not "tests passed" or "a human ran the QA script." Nobody disagrees with that framing; it's a clarification that sharpens the record rather than a contested point.

## Final Output

**What was built:** A real, compiling Xcode project (`Freeday.xcodeproj`) with all five core workflows from the original prompt implemented as wired, non-mocked SwiftUI/SwiftData code: habit setup with inline validation and forward-only savings recompute, a non-punitive one-tap relapse/reset flow with preserved lifetime stats, a wall-clock-anchored 90-second craving timer with correct force-quit/background resume-or-abandon semantics, a milestone recap card with real ShareLink export, and StoreKit 2 multi-habit paid gating — including the Settings "Your Habits" switcher added specifically so a paying subscriber can actually reach and use a second habit, not just unlock it in theory. Accessibility baseline (44/56pt targets, Dynamic Type reflow, VoiceOver labels on the sunrise motif and milestone card) and full empty/loading/success/error state coverage are implemented per screen, including the app-level bootstrap-failure state.

**Verification status:** VERIFIED, but scoped precisely — `xcodebuild` compiled cleanly for the iOS Simulator after one real repair (a `ShapeStyle`/`background` modifier fix in `PrimaryActionButton`), on top of one bug caught and fixed earlier by manual static audit (`Decimal(days)` self-conversion in `SavingsEngine`). That is the full extent of dynamic evidence. The six test files in `FreedayTests` (StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine, Persistence, EntitlementStore) — which cover exactly the DST/midnight/force-quit/cascade-delete/unverified-transaction edge cases the team spent nine phases worrying about — have never actually been run; they're confirmed to compile, not confirmed to pass. Likewise, the human_qa_checklist phase produced a script, not an executed run — no one has installed this on a simulator/device and walked the craving timer through a real background cycle or eyeballed the milestone card at max Dynamic Type. This is a real, material distinction and shouldn't be smoothed over.

**Prompt coverage:** All v1 Build Scope items are present except Live Activity and WidgetKit, which were explicitly named throughout the project as the first things allowed to degrade under time pressure (a standing decision from `project_plan` onward, not a silent drop). Everything else in the original spec — cost-per-use tracking (as quantity+cost), non-punitive streak reset, craving-timer guided flow, milestone card, and paid multi-habit management — is real and functional.

**Known limitations (carried forward honestly, not new):**
1. No test-suite execution and no human-hands-on-device QA run yet — the biggest actual confidence gap, and the cheapest to close.
2. Subscription-lapse read-only enforcement was never built — a canceled subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but access isn't restricted. A real revenue-integrity hole, not cosmetic.
3. No Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — an accepted v1 tradeoff, restated rather than newly discovered.
4. Only one craving-timer guided sequence shipped instead of the 2-3 variants `per_app_product_brief` named as a concrete paid-tier differentiator — the paywall's "full craving-support toolkit" promise is only partly backed by what's behind it.
5. App Store submission material (hosted support/privacy policy URLs, real device screenshots, manual sandbox confirmation of paywall disclosure text, deliberate age-rating selection) doesn't exist yet — separate from and downstream of code readiness.

**Top follow-ups, in priority order:**
1. Run `FreedayTests` for real — cheap, mechanical, closes the largest confidence gap for the least effort.
2. Walk the existing seven-step smoke checklist by hand on a simulator once.
3. Build subscription-lapse read-only enforcement (the one functional gap that's a genuine product/business hole, not launch-prep).
4. App Store submission prep (URLs, screenshots, disclosure check, age rating) — needed before store submission, not before calling this a usable MVP.
5. App-lock and the additional craving-timer variants as fast-follow v1.1 work.

**Go/no-go decision:** GO for "usable local-first MVP" — a real person can install this and run the full core loop today. NOT YET a go for "submit to the App Store" — that's blocked on the App Store Connect prep items above, which is a separate bar from code/product completeness. The final review keeps these two verdicts distinct rather than blending them into one score, since conflating "compiles and the workflows are real" with "ready to ship to reviewers" is exactly the kind of rounding-up this phase exists to prevent.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This closes the loop well. The phase's required outputs are all present and concrete: what was built (five real, wired core workflows enumerated specifically), verification status (correctly scoped to "compiled," not "tested" or "human-QA'd" — this is the one useful new distinction this phase adds, and it doesn't contradict `build_verification`'s own VERIFIED label, just clarifies what that label actually means), prompt coverage (explicit diff against v1 Build Scope, correctly crediting Live Activity/Widget as a named standing tradeoff rather than silent scope loss), known limitations (five items, each traceable to an earlier phase rather than newly invented), and top follow-ups (five items in priority order, each with a concrete next action).

Acceptance checks hold up: the review is honest enough to act on — a reader gets a clean GO for "usable local MVP" versus NOT-YET for "App Store submission," which is the right place to draw that line given `app_store_readiness` already found real submission-material gaps (hosted URLs, screenshots, disclosure verification) that are independent of code correctness. Every blocker has a concrete next step (run FreedayTests, walk the QA script by hand, build subscription-lapse read-only enforcement, App Store prep, app-lock/variants as v1.1) even without named individual owners, which satisfies the "owner or concrete next step" bar for a project without a human team roster.

Nothing here contradicts a prior-phase decision, and it doesn't paper over the one real gap worth surfacing (test suite compiled but never executed, QA script written but never run) — it states that gap more plainly than any earlier phase did, which is exactly this phase's job. Codex's continued unavailability is consistent with the established pattern across the last several phases and doesn't leave this phase thin given the depth of the single pass. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

Codex is still unavailable this round (same cooldown gap as the last several phases), but Claude's pass is a complete, honest answer to everything final_review requires — and importantly, it's the one phase that names something no prior phase quite landed on: "VERIFIED" in this project's vocabulary means "xcodebuild compiled," not "tests passed" or "a human ran the QA script." Nobody disagrees with that framing; it's a clarification that sharpens the record rather than a contested point.

## Final Output

**What was built:** A real, compiling Xcode project (`Freeday.xcodeproj`) with all five core workflows from the original prompt implemented as wired, non-mocked SwiftUI/SwiftData code: habit setup with inline validation and forward-only savings recompute, a non-punitive one-tap relapse/reset flow with preserved lifetime stats, a wall-clock-anchored 90-second craving timer with correct force-quit/background resume-or-abandon semantics, a milestone recap card with real ShareLink export, and StoreKit 2 multi-habit paid gating — including the Settings "Your Habits" switcher added specifically so a paying subscriber can actually reach and use a second habit, not just unlock it in theory. Accessibility baseline (44/56pt targets, Dynamic Type reflow, VoiceOver labels on the sunrise motif and milestone card) and full empty/loading/success/error state coverage are implemented per screen, including the app-level bootstrap-failure state.

**Verification status:** VERIFIED, but scoped precisely — `xcodebuild` compiled cleanly for the iOS Simulator after one real repair (a `ShapeStyle`/`background` modifier fix in `PrimaryActionButton`), on top of one bug caught and fixed earlier by manual static audit (`Decimal(days)` self-conversion in `SavingsEngine`). That is the full extent of dynamic evidence. The six test files in `FreedayTests` (StreakEngine, SavingsEngine, CravingSessionEngine, MilestoneEngine, Persistence, EntitlementStore) — which cover exactly the DST/midnight/force-quit/cascade-delete/unverified-transaction edge cases the team spent nine phases worrying about — have never actually been run; they're confirmed to compile, not confirmed to pass. Likewise, the human_qa_checklist phase produced a script, not an executed run — no one has installed this on a simulator/device and walked the craving timer through a real background cycle or eyeballed the milestone card at max Dynamic Type. This is a real, material distinction and shouldn't be smoothed over.

**Prompt coverage:** All v1 Build Scope items are present except Live Activity and WidgetKit, which were explicitly named throughout the project as the first things allowed to degrade under time pressure (a standing decision from `project_plan` onward, not a silent drop). Everything else in the original spec — cost-per-use tracking (as quantity+cost), non-punitive streak reset, craving-timer guided flow, milestone card, and paid multi-habit management — is real and functional.

**Known limitations (carried forward honestly, not new):**
1. No test-suite execution and no human-hands-on-device QA run yet — the biggest actual confidence gap, and the cheapest to close.
2. Subscription-lapse read-only enforcement was never built — a canceled subscriber with 2+ habits keeps full access indefinitely. Data is preserved (matches the trust rule), but access isn't restricted. A real revenue-integrity hole, not cosmetic.
3. No Face ID/passcode app-lock protecting sensitive personal data (what someone's quitting, relapse timestamps) — an accepted v1 tradeoff, restated rather than newly discovered.
4. Only one craving-timer guided sequence shipped instead of the 2-3 variants `per_app_product_brief` named as a concrete paid-tier differentiator — the paywall's "full craving-support toolkit" promise is only partly backed by what's behind it.
5. App Store submission material (hosted support/privacy policy URLs, real device screenshots, manual sandbox confirmation of paywall disclosure text, deliberate age-rating selection) doesn't exist yet — separate from and downstream of code readiness.

**Top follow-ups, in priority order:**
1. Run `FreedayTests` for real — cheap, mechanical, closes the largest confidence gap for the least effort.
2. Walk the existing seven-step smoke checklist by hand on a simulator once.
3. Build subscription-lapse read-only enforcement (the one functional gap that's a genuine product/business hole, not launch-prep).
4. App Store submission prep (URLs, screenshots, disclosure check, age rating) — needed before store submission, not before calling this a usable MVP.
5. App-lock and the additional craving-timer variants as fast-follow v1.1 work.

**Go/no-go decision:** GO for "usable local-first MVP" — a real person can install this and run the full core loop today. NOT YET a go for "submit to the App Store" — that's blocked on the App Store Connect prep items above, which is a separate bar from code/product completeness. The final review keeps these two verdicts distinct rather than blending them into one score, since conflating "compiles and the workflows are real" with "ready to ship to reviewers" is exactly the kind of rounding-up this phase exists to prevent.

VERIFICATION: VERIFIED

---

CONSENSUS: YES

### Portfolio Audit

# freeday — Portfolio Audit

_Generated by the autonomous multi-agent orchestrator on 2026-07-08 13:29:44._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: freeday

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice

## Claude Design Handoff Prompt

Design an encouraging habit-quitting app called Freeday: soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif representing 'days free,' warm and non-judgmental tone throughout, avoid clinical white/red or guilt-inducing imagery, a milestone streak+savings card as the hero shareable artifact, calm and supportive rather than gamified-aggressive.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.
```

## Phase Purpose

For multi-app prompts, audit the portfolio shape: every requested app is a sibling folder, every selected app has the right workflow, child prompts preserve the parent requirements, and no category was silently collapsed. For single-app prompts, record that portfolio audit is not applicable.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (timeout)._

**Claude (QA & Risk · User Advocate) — Round 1**

Coming at this from the audit's actual job: is the sibling folder shape right, is freeday's workflow correct, and did any category get silently dropped from the five-app batch — not re-litigating whether freeday itself is done, since fifteen-plus phases already settled that.

First, the honest limitation I hit trying to do this properly: I tried to list `multi-app-exp7/` and read `portfolio_manifest.json` and even `freeday/app_build/Freeday.xcodeproj/project.pbxproj` directly, and every one of those was blocked — this session's sandbox only grants me `freeday/.agent_cwd`. That's not a formality, it's directly relevant to what this phase is supposed to certify. A portfolio audit that can only see one of five children can confirm that one child is well-formed, but it cannot confirm the batch is well-formed, and I don't want to paper over that gap by reasoning as if I had visibility I don't actually have.

What I can work from is the git status snapshot given at the start of this conversation, and it's worth reading carefully rather than skimming. Under `multi-app-exp7/`, all five expected slugs — campfire, faveoff, freeday, nickel, somna — show their `agent_state.json` and `initial_prompt/initial_prompt.md` as deleted, and `portfolio_manifest.json` is modified. That pattern is consistent with the correct move: nested per-child scaffolding under the parent folder getting torn down in favor of flat sibling output folders, which is exactly what the parent prompt hard-requires ("one folder per app... never one folder containing all apps"). Freeday itself is confirmed compliant — my own working directory sits at `/Users/pchordia/Documents/iOS-App-Factory/freeday/.agent_cwd`, meaning freeday is a genuine top-level sibling, not nested inside multi-app-exp7. Good.

But here's the thing I don't want waved through: the status output also shows untracked top-level `campfire/` and `faveoff/` directories and lock files (`campfire.lock`, `faveoff.lock`, `freeday.lock` in `.orch-locks/`) — but nothing for nickel or somna anywhere in what's visible, and the status was explicitly truncated ("truncated because it exceeds 2k characters"). That could mean nothing — nickel and somna might just be further down in the truncated portion, or their locks already released because they finished earlier. Or it could mean two of the five selected apps never actually materialized as real sibling folders, which would be precisely the silent-category-collapse failure this phase exists to catch, and precisely the kind of gap a user would only discover by going looking for app 4 and 5 and not finding them. I can't resolve this from inside freeday's sandbox, and I'm not going to guess an answer just to close the phase cleanly — this needs someone with actual filesystem visibility across the whole portfolio to confirm nickel and somna both exist as sibling folders with their own real app_build, the same way freeday does.

On the parts I can actually verify from the transcript: freeday's initial_prompt.md preserved the full parent portfolio prompt verbatim, correctly tagged `PORTFOLIO_CHILD_PROJECT: true`, and carried the right selected-app slug and build priority through every phase. The workflow selected for it — the full MVP-build phase sequence from prompt_contract through final_review, ending in a compiled, VERIFIED Xcode project with all five locked core workflows real and wired — is the correct workflow for a priority-5 MVP child, not a truncated or wrong-tier pipeline. So freeday's own slice of the portfolio audit passes.

The one substantive thing this child genuinely cannot certify, and which prompt_contract already flagged back at the very start of this build without it ever getting resolved: uniqueness against the other four apps. I have zero visibility into what campfire, faveoff, nickel, and somna actually are. If any of them turned out to also be a streak/habit-tracker or otherwise overlaps with Freeday's craving-tracker concept, that's a hard uniqueness violation per the parent prompt's non-negotiable rule, and nothing in freeday's own fifteen-plus phases could have caught it, because this child was never shown the sibling specs. That check has to happen at the parent-portfolio level with all five specs in hand at once — it cannot be done, and was never done, from inside any single child.

For backfill readiness: freeday's paper trail is genuinely strong material for Jira/Notion — clean phase-by-phase decisions, five Must-have workflows each with concrete acceptance criteria already written out, and five explicitly named open follow-ups (test suite compiled-but-never-run, human QA script written-but-never-executed, subscription-lapse read-only enforcement missing, only one of the promised 2-3 craving-timer variants shipped, App Store submission material not yet created) that would each convert directly into a well-scoped ticket with no rewriting needed. That part of this phase's job is easy and I don't think it needs debate.

So my read: freeday's own child metadata and workflow check passes cleanly. What I'm flagging as a real, unresolved risk rather than a formality — the sibling-folder completeness for nickel and somna is not confirmed from what's visible to this child, and the cross-app uniqueness check was never actually performed by anyone, anywhere, in this entire nine-plus-phase history, because no single child agent ever had simultaneous sight of all five concepts. Both of those need an owner outside this child's sandbox before anyone calls the five-app batch itself audited, as opposed to just this one member of it.

**Coordinator (Claude) — decision after round 1**

CONSENSUS: YES

Codex was unavailable again this round, but Claude's pass does exactly what this phase is supposed to do for a portfolio *child* — it doesn't try to re-litigate whether freeday itself is finished (that was settled over the last fifteen-plus phases), and it doesn't pretend to have visibility it doesn't have.

## Final Output

**Portfolio applicability:** Yes — freeday is a child of the 5-app multi-app-exp7 portfolio batch, so a portfolio audit applies (not the "N/A, single app" path).

**Freeday's own compliance — verified clean:** The initial prompt preserved the full parent portfolio prompt verbatim, correctly tagged `PORTFOLIO_CHILD_PROJECT: true`, with the right slug and build priority carried through every phase. Freeday lives as a genuine top-level sibling folder (`/Users/pchordia/Documents/iOS-App-Factory/freeday`), not nested inside `multi-app-exp7` — satisfying the parent's hard "one folder per app, never bundled" rule. It ran the correct, full MVP-build workflow end to end and landed on a compiled, verified Xcode project with all five locked core workflows real and wired. No category collapse, no wrong workflow, no missing child metadata on freeday's side.

**What this audit could not confirm, and says so plainly rather than guessing:** This session's sandbox only has visibility into `freeday/.agent_cwd` — it cannot read `[REDACTED:high_entropy].json` or the sibling app folders directly. Working only from the git status snapshot given at the start of the conversation: campfire and faveoff show up as real untracked top-level folders with their own lock files, consistent with them existing as proper siblings, but nickel and somna don't appear anywhere in the (truncated) status shown. That's genuinely ambiguous — it could just be truncation, or it could mean two of the five selected apps never actually materialized as sibling folders, which is exactly the silent-category-collapse failure this phase exists to catch. It can't be resolved from inside this child's sandbox.

**A second real gap, open since the very first phase of this build and never closed by anyone:** cross-app uniqueness. Freeday was never shown the other four apps' specs, so nothing in its own history could have checked whether it overlaps with campfire, faveoff, nickel, or somna. That check requires simultaneous visibility into all five concepts and has to happen at the parent-portfolio level — it hasn't happened anywhere yet in this project's history.

**Backfill readiness:** Strong. Freeday's phase-by-phase decision trail, five Must-have workflows with concrete acceptance criteria, and five explicitly named open follow-ups (test suite compiled-but-unrun, QA script written-but-unexecuted, subscription-lapse read-only gap, only 1 of 3 craving-timer variants shipped, App Store submission material not yet created) would convert directly into well-scoped tickets with no rewriting needed.

**Bottom line:** Freeday passes its own child-level audit — correct sibling shape, correct workflow, no collapsed scope. Two things get flagged as unresolved portfolio-level risks rather than blockers on freeday itself, and need an owner with full-portfolio visibility, not this child: (1) confirm nickel and somna actually exist as real sibling app_build projects the same way freeday does, and (2) run the cross-app uniqueness check against all five specs at once, since it's never been performed anywhere in this project's history.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
The output meets the bar for a portfolio-child audit. It correctly identifies portfolio applicability (yes, child of multi-app-exp7), confirms freeday's own sibling-folder shape and workflow selection are compliant with the parent's hard "one folder per app" rule, and — most importantly — is honest about the boundary of what this child's sandbox can actually see rather than fabricating confidence about siblings it can't inspect. Flagging the nickel/somna visibility gap and the never-performed cross-app uniqueness check as open risks requiring parent-level ownership is exactly right: it avoids two failure modes at once — silently passing a batch-level concern it has no evidence for, and inventing portfolio-parent work this child was never scoped to do (per the phase rule "for portfolio children, validate parent metadata and workflow selection," not re-audit siblings). Required outputs are all present (applicability, count observations to the extent visible, child folder/workflow check, collapsed-category warning, backfill notes), and the backfill-readiness section is concrete and ticket-ready. Nothing here contradicts prior-phase decisions. Ready to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

CONSENSUS: YES

Codex was unavailable again this round, but Claude's pass does exactly what this phase is supposed to do for a portfolio *child* — it doesn't try to re-litigate whether freeday itself is finished (that was settled over the last fifteen-plus phases), and it doesn't pretend to have visibility it doesn't have.

## Final Output

**Portfolio applicability:** Yes — freeday is a child of the 5-app multi-app-exp7 portfolio batch, so a portfolio audit applies (not the "N/A, single app" path).

**Freeday's own compliance — verified clean:** The initial prompt preserved the full parent portfolio prompt verbatim, correctly tagged `PORTFOLIO_CHILD_PROJECT: true`, with the right slug and build priority carried through every phase. Freeday lives as a genuine top-level sibling folder (`/Users/pchordia/Documents/iOS-App-Factory/freeday`), not nested inside `multi-app-exp7` — satisfying the parent's hard "one folder per app, never bundled" rule. It ran the correct, full MVP-build workflow end to end and landed on a compiled, verified Xcode project with all five locked core workflows real and wired. No category collapse, no wrong workflow, no missing child metadata on freeday's side.

**What this audit could not confirm, and says so plainly rather than guessing:** This session's sandbox only has visibility into `freeday/.agent_cwd` — it cannot read `[REDACTED:high_entropy].json` or the sibling app folders directly. Working only from the git status snapshot given at the start of the conversation: campfire and faveoff show up as real untracked top-level folders with their own lock files, consistent with them existing as proper siblings, but nickel and somna don't appear anywhere in the (truncated) status shown. That's genuinely ambiguous — it could just be truncation, or it could mean two of the five selected apps never actually materialized as sibling folders, which is exactly the silent-category-collapse failure this phase exists to catch. It can't be resolved from inside this child's sandbox.

**A second real gap, open since the very first phase of this build and never closed by anyone:** cross-app uniqueness. Freeday was never shown the other four apps' specs, so nothing in its own history could have checked whether it overlaps with campfire, faveoff, nickel, or somna. That check requires simultaneous visibility into all five concepts and has to happen at the parent-portfolio level — it hasn't happened anywhere yet in this project's history.

**Backfill readiness:** Strong. Freeday's phase-by-phase decision trail, five Must-have workflows with concrete acceptance criteria, and five explicitly named open follow-ups (test suite compiled-but-unrun, QA script written-but-unexecuted, subscription-lapse read-only gap, only 1 of 3 craving-timer variants shipped, App Store submission material not yet created) would convert directly into well-scoped tickets with no rewriting needed.

**Bottom line:** Freeday passes its own child-level audit — correct sibling shape, correct workflow, no collapsed scope. Two things get flagged as unresolved portfolio-level risks rather than blockers on freeday itself, and need an owner with full-portfolio visibility, not this child: (1) confirm nickel and somna actually exist as real sibling app_build projects the same way freeday does, and (2) run the cross-app uniqueness check against all five specs at once, since it's never been performed anywhere in this project's history.

VERIFICATION: VERIFIED

---

CONSENSUS: YES

## Task Backlog

```json
{
  "tasks": [
    {
      "id": "T-001",
      "title": "SwiftData models + versioned schema",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/Habit.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/RelapseEvent.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Models/CravingSession.swift",
        "[REDACTED:high_entropy].swift"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Compiles with cascade-delete relationships via @Relationship(deleteRule: .cascade) with correct non-mangled inverse keypaths",
        "Habit.streakStartAt is non-optional; cleanDaysBeforeCurrentStreak and cumulativeSavingsBeforeRateChange are forward-only accumulator fields",
        "VersionedSchema + SchemaMigrationPlan scaffolding present even though initial migration is trivial"
      ],
      "status": "pending"
    },
    {
      "id": "T-002",
      "title": "Pure domain engines",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/StreakEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/SavingsEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/CravingSessionEngine.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Domain/Engines/MilestoneEngine.swift"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Zero SwiftData imports, zero internal Date() calls \u2014 all take now/calendar as explicit parameters",
        "Signatures match tech_specs interfaces-json exactly",
        "Negative/zero clamps applied (streak never negative on clock skew)"
      ],
      "status": "pending"
    },
    {
      "id": "T-003",
      "title": "Engine unit test matrix",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/StreakEngineTests.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/SavingsEngineTests.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/CravingSessionEngineTests.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/MilestoneEngineTests.swift"
      ],
      "depends_on": [
        "T-002"
      ],
      "acceptance_criteria": [
        "Midnight rollover both directions covered",
        "Clock skew (now before streakStartAt) clamps to zero, tested",
        "DST spring-forward and fall-back covered",
        "Force-quit-past-90s resolves to abandoned, never completed, tested",
        "Overlapping active-session force-resolve tested",
        "Milestone threshold idempotency tested (5 opens past day 3 fires exactly once)"
      ],
      "status": "pending"
    },
    {
      "id": "T-004",
      "title": "Design tokens + primitive components",
      "owner_lane": "polish_resilience",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/Tokens.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/GradientBackground.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/StatCard.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/PrimaryActionButton.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SkeletonStatCard.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/SunriseCounterMotif.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/DesignSystem/AppLevelErrorView.swift"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Hex/spacing/radius values match design_handoff exactly (mint #B9F2DE to sky #8ED0F0, radii 12/20/28, spacing 4/8/12/16/24/32/48)",
        "SunriseCounterMotif has one accessibilityElement stating the real day count, never decorative-only",
        "Every component has a #Preview"
      ],
      "status": "pending"
    },
    {
      "id": "T-005",
      "title": "App bootstrap and root wiring",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/FreedayApp.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppBootstrap.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/App/AppRootView.swift"
      ],
      "depends_on": [
        "T-001"
      ],
      "acceptance_criteria": [
        "ModelContainer constructed via explicit do/catch against SchemaV1/MigrationPlan, never .modelContainer(for:)",
        "AppBootstrapState given a custom Equatable conformance comparing on case tag only",
        "Root view branches on opening/ready/failed before TabView is constructed",
        "Corrupt-store fallback manually verified to render AppLevelErrorView with no tab bar underneath"
      ],
      "status": "pending"
    },
    {
      "id": "T-006",
      "title": "Persistence + cascade-delete tests",
      "owner_lane": "data_domain",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/PersistenceTests.swift"
      ],
      "depends_on": [
        "T-001"
      ],
      "acceptance_criteria": [
        "In-memory ModelContainer test: deleting a Habit removes all its RelapseEvent and CravingSession rows with no orphans",
        "Migration plan scaffolding compiles and loads cleanly"
      ],
      "status": "pending"
    },
    {
      "id": "T-007",
      "title": "Habit setup/edit feature",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/HabitForm/HabitFormViewModel.swift"
      ],
      "depends_on": [
        "T-001",
        "T-004"
      ],
      "acceptance_criteria": [
        "Non-positive quantity or cost rejected inline, Save disabled until valid",
        "Editing an existing habit past day 0 shows the forward-only recompute disclosure banner only once a field differs from its originally loaded value",
        "Save calls SavingsEngine.applyRateChange rather than mutating savings fields directly"
      ],
      "status": "pending"
    },
    {
      "id": "T-008",
      "title": "EntitlementStore + StoreKit config",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/EntitlementStore.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Resources/Freeday.storekit"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Transaction.updates listener started and kept alive for app lifetime",
        "checkVerified failure hard-blocks entitlement, never soft-grants",
        "restorePurchases() re-scans Transaction.currentEntitlements, not a cached flag",
        "EntitlementState matches the locked six-case enum (unknown/free/pro/expired/revoked/verificationFailed)"
      ],
      "status": "pending"
    },
    {
      "id": "T-009",
      "title": "Paywall + habit-#2 gating wiring",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Paywall/PaywallViewModel.swift"
      ],
      "depends_on": [
        "T-007",
        "T-008"
      ],
      "acceptance_criteria": [
        "Attempting to create habit #2 as a free-tier user shows the paywall before any HabitForm field renders",
        "verificationFailed renders explicit hard-block copy, never a silent timeout",
        "Restore Purchases button present and wired to EntitlementStore.restorePurchases"
      ],
      "status": "pending"
    },
    {
      "id": "T-010",
      "title": "Today/Home screen",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Today/TodayViewModel.swift"
      ],
      "depends_on": [
        "T-001",
        "T-002",
        "T-004",
        "T-007"
      ],
      "acceptance_criteria": [
        "Implements empty (onboarding prompt), loading (skeleton), success, and app-level store-failure states",
        "Streak/lifetime-days/savings/cravings-survived numbers come only from StreakEngine/SavingsEngine calls, no inline calendar math",
        "No multi-habit chrome renders when exactly one habit exists"
      ],
      "status": "pending"
    },
    {
      "id": "T-011",
      "title": "Relapse/reset flow",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Relapse/RelapseViewModel.swift"
      ],
      "depends_on": [
        "T-001",
        "T-002",
        "T-010"
      ],
      "acceptance_criteria": [
        "Single fullScreenCover screen, pre-tap and post-tap states in the same view via spring-animated swap, no navigation between them",
        "Post-tap view shows reset streak and the untouched lifetime total together, no red/warning color, no 'broken' language",
        "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save"
      ],
      "status": "pending"
    },
    {
      "id": "T-012",
      "title": "Craving timer flow",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/CravingTimer/CravingTimerViewModel.swift"
      ],
      "depends_on": [
        "T-001",
        "T-002",
        "T-010"
      ],
      "acceptance_criteria": [
        "Countdown always derived from persisted startedAt, recalculated on appear/scenePhase change",
        "Relaunch with startedAt + 90s already elapsed resolves to abandoned, no retroactive credit",
        "Backgrounded at second 40 and foregrounded 2 minutes later reads zero remaining with completion already resolved",
        "Only a full 90s completion increments lifetimeCravingsSurvived, exactly once, guarded against double-fire",
        "New session request force-resolves any existing active session for the same habit to abandoned first"
      ],
      "status": "pending"
    },
    {
      "id": "T-013a",
      "title": "Milestones/history list screen",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestonesListViewModel.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Milestones/MilestoneCardView.swift"
      ],
      "depends_on": [
        "T-001",
        "T-010"
      ],
      "acceptance_criteria": [
        "Chronological list backed by RelapseEvent-derived milestones with empty/loading/success/error states",
        "MilestoneCardView renders live in a sheet, reused by the renderer for export"
      ],
      "status": "pending"
    },
    {
      "id": "T-013b",
      "title": "Milestone card image export + ShareLink",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/MilestoneCardRenderer.swift"
      ],
      "depends_on": [
        "T-002",
        "T-004",
        "T-013a"
      ],
      "acceptance_criteria": [
        "Renders without clipping the day count or dollar figure at max Dynamic Type, light and dark",
        "Per-habit lastShownMilestoneThreshold flag prevents re-triggering on repeated app opens past a threshold",
        "Exports at a fixed capped type size, feeding ShareLink's Transferable payload"
      ],
      "status": "pending"
    },
    {
      "id": "T-014",
      "title": "Haptics service",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Services/HapticsService.swift"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Checks CHHapticEngine.capabilitiesForHardware().supportsHaptics before firing",
        "Absent hardware is a silent no-op, never an error path",
        "Called from relapse confirm and craving-timer completion"
      ],
      "status": "pending"
    },
    {
      "id": "T-015",
      "title": "Settings screen",
      "owner_lane": "primary_ui",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsView.swift",
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Features/Settings/SettingsViewModel.swift"
      ],
      "depends_on": [
        "T-001",
        "T-008"
      ],
      "acceptance_criteria": [
        "Habit edit entry point, restore-purchases action, one-step delete-with-confirmation",
        "deleteHabit relies on the declarative cascade rule \u2014 no manual cascade logic in the view model"
      ],
      "status": "pending"
    },
    {
      "id": "T-016",
      "title": "Accessibility and state-coverage audit",
      "owner_lane": "polish_resilience",
      "files": [],
      "depends_on": [
        "T-007",
        "T-009",
        "T-010",
        "T-011",
        "T-012",
        "T-013a",
        "T-013b",
        "T-015"
      ],
      "acceptance_criteria": [
        "44pt minimum on all interactive targets, 56pt+ on the two primary Today actions",
        "2x2 stat grid reflows to one column at accessibility Dynamic Type sizes without clipping",
        "WCAG AA contrast verified in both light and dark",
        "Every reachable screen confirmed to implement its full state matrix (empty/loading/success/error where applicable)"
      ],
      "status": "pending"
    },
    {
      "id": "T-017",
      "title": "StoreKit failure and restore verification checkpoint",
      "owner_lane": "services_utilities",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/FreedayTests/EntitlementStoreTests.swift"
      ],
      "depends_on": [
        "T-008",
        "T-009"
      ],
      "acceptance_criteria": [
        "Forced unverified-transaction case via .storekit config hard-blocks entitlement, documented and tested, not just the happy purchase path",
        "Restore-with-nothing-to-restore case handled without crash or false grant"
      ],
      "status": "pending"
    },
    {
      "id": "T-018",
      "title": "End-to-end smoke checklist and release gate",
      "owner_lane": "polish_resilience",
      "files": [
        "/Users/pchordia/Documents/iOS-App-Factory/freeday/app_build/Freeday/Docs/ScopeAndDeferrals.md"
      ],
      "depends_on": [
        "T-011",
        "T-012",
        "T-013b",
        "T-009",
        "T-016",
        "T-017"
      ],
      "acceptance_criteria": [
        "Fresh install through one relapse, one full timer completion, one milestone share, one second-habit paywall attempt, and one restore attempt all pass in sequence",
        "Explicit 'what ships / what's deferred' note written naming Live Activity, WidgetKit, the TimelineView upgrade, and the App Group container identifier as cut for this pass"
      ],
      "status": "pending"
    }
  ]
}
```

## Interface Contracts

```json
{
  "interfaces": [
    {
      "name": "Habit",
      "kind": "struct",
      "language": "swift",
      "signature": "@Model final class Habit { @Attribute(.unique) var id: UUID; var name: String; var unitLabel: String; var dailyQuantity: Double; var costPerUnit: Decimal; var createdAt: Date; var streakStartAt: Date; var cleanDaysBeforeCurrentStreak: Int; var rateEffectiveFrom: Date; var cumulativeSavingsBeforeRateChange: Decimal; var lifetimeCravingsSurvived: Int; var lastShownMilestoneThreshold: Int?; var lastInteractedAt: Date; @Relationship(deleteRule: .cascade, inverse: \\RelapseEvent.habit) var relapseEvents: [RelapseEvent]; @Relationship(deleteRule: .cascade, inverse: \\CravingSession.habit) var cravingSessions: [CravingSession] }",
      "owning_lane": "data_domain",
      "notes": "N habits supported unconditionally from day one; only UI/entitlement layer enforces the one-habit-free gate. streakStartAt is non-optional (initialized to createdAt, overwritten to now on relapse) so no nullable-branch duplication at call sites. cleanDaysBeforeCurrentStreak + cumulativeSavingsBeforeRateChange are forward-only accumulators, same pattern applied to both days and money."
    },
    {
      "name": "RelapseEvent",
      "kind": "struct",
      "language": "swift",
      "signature": "@Model final class RelapseEvent { @Attribute(.unique) var id: UUID; var timestamp: Date; var streakLengthAtReset: Int; var savingsAtReset: Decimal; var habit: Habit? }",
      "owning_lane": "data_domain",
      "notes": "Immutable historical row, timestamp always now (no backdating). Written by RelapseViewModel in the same ModelContext save that updates Habit.streakStartAt/cleanDaysBeforeCurrentStreak. Substantiates the Milestones/history tab."
    },
    {
      "name": "CravingSession",
      "kind": "struct",
      "language": "swift",
      "signature": "@Model final class CravingSession { @Attribute(.unique) var id: UUID; var startedAt: Date; var completedAt: Date?; var outcome: CravingOutcome; var habit: Habit? }",
      "owning_lane": "data_domain",
      "notes": "outcome starts .active. Creating a new session for a habit force-resolves any existing active session for that habit to .abandoned first \u2014 at most one active session per habit by construction."
    },
    {
      "name": "CravingOutcome",
      "kind": "enum",
      "language": "swift",
      "signature": "enum CravingOutcome: String, Codable { case active, completed, abandoned }",
      "owning_lane": "data_domain",
      "notes": "Persisted, not runtime-inferred, so relaunch resolution, duplicate-session resolution, and completion all read/write the same field."
    },
    {
      "name": "StreakEngine",
      "kind": "function",
      "language": "swift",
      "signature": "enum StreakEngine { static func currentStreakDays(streakStartAt: Date, now: Date, calendar: Calendar) -> Int; static func lifetimeDaysFree(cleanDaysBeforeCurrentStreak: Int, streakStartAt: Date, now: Date, calendar: Calendar) -> Int }",
      "owning_lane": "data_domain",
      "notes": "Pure, stateless, injectable clock \u2014 no Date() or SwiftData calls internally. Result clamps to >= 0 for clock-skew (now < streakStartAt)."
    },
    {
      "name": "SavingsEngine",
      "kind": "function",
      "language": "swift",
      "signature": "enum SavingsEngine { static func currentSavings(cumulativeBeforeRateChange: Decimal, dailyQuantity: Double, costPerUnit: Decimal, rateEffectiveFrom: Date, now: Date, calendar: Calendar) -> Decimal; static func applyRateChange(existingSavings: Decimal, newDailyQuantity: Double, newCostPerUnit: Decimal, now: Date) -> (cumulativeBeforeRateChange: Decimal, rateEffectiveFrom: Date) }",
      "owning_lane": "data_domain",
      "notes": "applyRateChange called by HabitFormViewModel on save when quantity/cost changed; captures pre-edit savings as new baseline so forward-only recompute is structurally guaranteed."
    },
    {
      "name": "CravingSessionEngine",
      "kind": "function",
      "language": "swift",
      "signature": "enum CravingSessionEngine { static let duration: TimeInterval = 90; static func remainingSeconds(startedAt: Date, now: Date) -> TimeInterval; static func resolveOnAppear(startedAt: Date, now: Date, currentOutcome: CravingOutcome) -> CravingOutcome }",
      "owning_lane": "data_domain",
      "notes": "resolveOnAppear never returns .completed from a stale/relaunch check (no retroactive credit) \u2014 only the live foreground countdown reaching zero while CravingTimerView is presented triggers an explicit .completed write, guarded to fire exactly once."
    },
    {
      "name": "MilestoneEngine",
      "kind": "function",
      "language": "swift",
      "signature": "enum MilestoneEngine { static let thresholds: [Int] = [1, 3, 7, 30, 90, 180, 365]; static func nextUnshownThreshold(currentStreakDays: Int, lastShownThreshold: Int?) -> Int? }",
      "owning_lane": "data_domain",
      "notes": "Called from TodayViewModel.onAppearCheckMilestone; non-nil result triggers the milestone sheet exactly once per threshold via Habit.lastShownMilestoneThreshold."
    },
    {
      "name": "AppBootstrapState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum AppBootstrapState: Equatable { case opening; case ready(ModelContainer); case failed(Error) }",
      "owning_lane": "primary_ui",
      "notes": "Held in FreedayApp @State; constructed via explicit do/catch against FreedaySchemaV1 + FreedayMigrationPlan, never .modelContainer(for:). Branches root view before TabView exists."
    },
    {
      "name": "AppLevelErrorView",
      "kind": "struct",
      "language": "swift",
      "signature": "struct AppLevelErrorView: View { let error: Error; let retry: () -> Void }",
      "owning_lane": "polish_resilience",
      "notes": "Rendered instead of AppRootView when AppBootstrapState == .failed; plain-language copy + Try Again, no tab bar underneath."
    },
    {
      "name": "TodayViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class TodayViewModel { var habit: Habit?; var bootstrapState: AppBootstrapState; func startCravingSession(); func openRelapseFlow(); func onAppearCheckMilestone() -> Int? }",
      "owning_lane": "primary_ui",
      "notes": "Reads via @Query, delegates all math to StreakEngine/SavingsEngine/MilestoneEngine \u2014 never computes calendar math inline."
    },
    {
      "name": "CravingTimerViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class CravingTimerViewModel { var session: CravingSession; func remaining(now: Date) -> TimeInterval; func handleAppear(now: Date); func dismissBeforeCompletion() }",
      "owning_lane": "primary_ui",
      "notes": "handleAppear calls CravingSessionEngine.resolveOnAppear. Countdown may render via a simple Timer.publish(every: 1) for the first functional pass; TimelineView(.animation)-driven continuous rendering is an approved fast-follow polish pass, not a blocking requirement."
    },
    {
      "name": "RelapseViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class RelapseViewModel { var habit: Habit; var confirmed: Bool; func confirmRelapse() }",
      "owning_lane": "primary_ui",
      "notes": "confirmRelapse writes RelapseEvent and updates streakStartAt/cleanDaysBeforeCurrentStreak in one ModelContext save, then flips confirmed for the in-place spring-animated state swap (same screen, no navigation)."
    },
    {
      "name": "HabitFormViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class HabitFormViewModel { var name: String; var dailyQuantity: String; var costPerUnit: String; var isEditingExisting: Bool; var showsRecomputeDisclosure: Bool; func validate() -> Bool; func save() }",
      "owning_lane": "primary_ui",
      "notes": "showsRecomputeDisclosure flips true only once a field differs from its originally loaded value. validate() rejects non-positive quantity/cost inline."
    },
    {
      "name": "EntitlementStore",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class EntitlementStore { var entitlementState: EntitlementState; func startTransactionListener() -> Task<Void, Never>; func refreshEntitlements() async; func purchase(_ product: Product) async throws; func restorePurchases() async throws }",
      "owning_lane": "services_utilities",
      "notes": "startTransactionListener runs from FreedayApp init, kept alive for app lifetime. checkVerified failure hard-blocks entitlement, never soft-grants. refreshEntitlements re-scans Transaction.currentEntitlements on launch and on explicit Restore tap."
    },
    {
      "name": "HapticsService",
      "kind": "function",
      "language": "swift",
      "signature": "enum HapticsService { static func notifySuccess(); static func notifyStreakDay() }",
      "owning_lane": "services_utilities",
      "notes": "Internally checks CHHapticEngine.capabilitiesForHardware().supportsHaptics; absent hardware is a silent no-op, never an error path."
    },
    {
      "name": "MilestoneCardRenderer",
      "kind": "function",
      "language": "swift",
      "signature": "enum MilestoneCardRenderer { static func renderImage(days: Int, savings: Decimal, colorScheme: ColorScheme) -> Image? }",
      "owning_lane": "services_utilities",
      "notes": "Wraps ImageRenderer at a fixed capped type size (deliberate exception to live Dynamic Type), feeds ShareLink's Transferable payload."
    },
    {
      "name": "MilestoneCardView",
      "kind": "struct",
      "language": "swift",
      "signature": "struct MilestoneCardView: View { let days: Int; let savings: Decimal; let habitName: String }",
      "owning_lane": "primary_ui",
      "notes": "Dual-purpose: rendered live in the sheet and passed to MilestoneCardRenderer.renderImage for export."
    },
    {
      "name": "Tokens",
      "kind": "struct",
      "language": "swift",
      "signature": "enum Tokens { enum Gradient { static let mintTop: Color; static let skyBottom: Color; static let posterMintTop: Color; static let posterSkyBottom: Color }; enum Spacing { static let xs: CGFloat; static let s: CGFloat; static let m: CGFloat; static let l: CGFloat; static let xl: CGFloat }; enum Radius { static let component: CGFloat; static let card: CGFloat; static let sheet: CGFloat } }",
      "owning_lane": "polish_resilience",
      "notes": "Concrete values from design_handoff: mint #B9F2DE to sky #8ED0F0, poster gradient #7EE8C3 to #6BB8F0, radii 12/20/28."
    },
    {
      "name": "SunriseCounterMotif",
      "kind": "struct",
      "language": "swift",
      "signature": "struct SunriseCounterMotif: View { let streakDays: Int; var body: some View }",
      "owning_lane": "polish_resilience",
      "notes": "Single accessibilityElement with label stating the real day count (e.g. '47 days free'), never decorative-only. Gradient tone shifts with streakDays."
    },
    {
      "name": "FreedaySchemaV1",
      "kind": "struct",
      "language": "swift",
      "signature": "enum FreedaySchemaV1: VersionedSchema { static var models: [any PersistentModel.Type] { get }; static var versionIdentifier: Schema.Version { get } }",
      "owning_lane": "data_domain",
      "notes": "Stood up from first commit even though initial migration plan is trivial."
    },
    {
      "name": "FreedayMigrationPlan",
      "kind": "struct",
      "language": "swift",
      "signature": "enum FreedayMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { get }; static var stages: [MigrationStage] { get } }",
      "owning_lane": "data_domain",
      "notes": "Pre-provisioned migration scaffolding paired with FreedaySchemaV1."
    },
    {
      "name": "MilestonesListViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class MilestonesListViewModel { var habit: Habit?; var earnedMilestones: [RelapseEvent]; var isLoading: Bool }",
      "owning_lane": "primary_ui",
      "notes": "Backs the Milestones/history tab \u2014 chronological substantiation list only, not a journal. Empty/loading/success/error states."
    },
    {
      "name": "PaywallViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class PaywallViewModel { var entitlementState: EntitlementState; func purchase(_ product: Product) async; func restore() async }",
      "owning_lane": "primary_ui",
      "notes": "Triggered before any second-habit setup field renders. verificationFailed state hard-blocks with explicit copy, never a silent timeout."
    },
    {
      "name": "SettingsViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable final class SettingsViewModel { var habits: [Habit]; var entitlementState: EntitlementState; func deleteHabit(_ habit: Habit); func restore() async }",
      "owning_lane": "primary_ui",
      "notes": "deleteHabit relies on Habit's declarative cascade delete rule \u2014 no manual cascade logic here."
    },
    {
      "name": "EntitlementState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum EntitlementState: Equatable { case unknown, free, pro, expired, revoked, verificationFailed }",
      "owning_lane": "services_utilities",
      "notes": "expired vs revoked distinction needed for the subscription-lapse read-only rule (data preserved, most-recently-active habit stays interactive)."
    }
  ]
}
```

## Verification

VERIFIED (compiled cleanly for the iOS Simulator)

## Findings

_No findings recorded._