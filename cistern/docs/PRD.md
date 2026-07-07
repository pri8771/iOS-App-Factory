# cistern — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things stand after round one: Codex didn't weigh in (CLI unavailable), so this round is really just one detailed pass from Claude playing skeptic — but it's a thorough one, and nothing in it drew pushback because there was no one else in the room. The core moves it makes are reasonable and directly resolve the ambiguities baked into this prompt, so I'm treating it as the working contract rather than waiting on a round that may never get a second voice.

The big call: this session is scoped to Cistern alone. The seven-app portfolio brief pasted alongside it is background — it explains why Cistern exists and what bar the *program* aspires to, but it is not a work order to regenerate 10 ideas, pick 7 apps, or build an idle/puzzle game inside this thread. If a later phase starts doing portfolio-level work, that's a scope violation.

Second call: "MVP build" wins over "production-ready, months-of-work scope" for what actually gets *built* this pass. The portfolio-level bar gets captured as documented direction (design tokens, written monetization plan, architecture that doesn't block adding the bigger stuff later) — not as things that must ship working today.

Third: "avoids their banking app" is read as no live bank linking — manual/local entry only, CSV import at most. This is a local-first MVP; OAuth/Plaid-style aggregation is out of scope. That phrase is also read as a *tone* signal (calm, non-shaming), not a mandate to cut features.

Fourth: monetization must be documented and thoughtfully designed (including the ethical tension of paywalling help from a financially strained user), but doesn't need working StoreKit/IAP plumbing in the MVP — a clearly labeled "Premium" stub is enough.

Fifth: paycheck-cadence and cash-flow math (biweekly/semimonthly/weekly, month-end, DST, negative-balance edge cases) is called out as the most likely place this app silently lies to the user, and it's flagged as a required QA/architecture concern, not an afterthought.

Sixth: a concrete, checkable definition of done for this pass — builds/runs without crashing, core loop (enter income + bills, see cash-flow/runway, persist across relaunch) works with real empty/loading/error states, VoiceOver labels + 44pt targets present, dark mode works, zero network dependency required to function. Anything beyond that (bank linking, real IAP, Jira/Notion backfill) is explicitly deferred, not silently absorbed.

No open disagreement exists to hash out — there's just no second voice yet to test these calls against. Since the calls are internally consistent, satisfy the phase's acceptance checks, and nothing in the record contradicts them, I'm calling this converged rather than spinning an empty round waiting for Codex.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim above — this is a PORTFOLIO_CHILD_PROJECT run for app slug `cistern`, one child of a 7-app portfolio brief (`multi-app-exp6`). The full portfolio brief is inherited context/ambition-setting, not a work order for this thread.

**Scope of this session:** Build exactly one app, Cistern — finance category, target user is "paycheck-to-paycheck, avoids their banking app" — as a local-first SwiftUI MVP. No other app in the portfolio is in scope here.

**Hard requirements:**
- SwiftUI, local-first, deterministic state, Apple system frameworks; no third-party dependency unless it materially reduces risk.
- Core loop: user enters income (with a real paycheck cadence — weekly/biweekly/semimonthly) and recurring bills/expenses, and sees a cash-flow/runway projection. Data persists across relaunch.
- No live bank account linking (no Plaid/OAuth/credential storage) — manual entry only, optional CSV import if attempted.
- Every reachable screen has empty, loading, success, and error states.
- Accessibility: VoiceOver labels, 44pt tap targets, Dynamic Type, WCAG AA contrast, dark mode.
- Tone/design north star: calm, non-shaming, not a red-alert budgeting app or spreadsheet-with-a-UI — this shapes visual/copy decisions, not feature count.
- Paycheck-cadence and cash-flow math edge cases (month-end, DST/timezone, no-income-scheduled, income-in-the-past) must be deliberately handled, not left to accident.
- A monetization strategy must be documented (free tier that delivers real value, premium tier that doesn't gate core safety-relevant insight like low-balance projection) — but does not require working StoreKit/IAP plumbing in this MVP; a labeled Premium stub suffices.
- Architecture should not block adding cloud sync, real bank linking, or real IAP later — but none of those get built now.

**Non-goals for this pass:**
- Generating alternate app ideas, selecting among 7 apps, or building the idle game / puzzle game (portfolio-level work, out of scope for this child session).
- Live bank account linking / financial data aggregation.
- Working payment processing, receipt validation, or entitlement restoration.
- Full portfolio deliverables — Jira/Notion backfill, combined multi-app transcripts — unless the user explicitly asks for them in this thread.
- Exhaustive settings, background sync, or Apple-Design-Award-level animation polish as *shipped* work (documented direction is fine; full execution is not required).

**Production-readiness definition for this MVP pass:** Builds and runs on simulator without crashing; core loop (enter income + bills → see cash-flow/runway → data persists) fully functional with real empty/loading/error states; VoiceOver labels and 44pt targets present; dark mode works; zero network dependency required for core function. Anything short of this is not done. Anything beyond this (real payments, bank linking, portfolio backfill) is out of scope unless the user says otherwise in this thread.

**Decision rules for later phases:**
- If a later phase starts producing portfolio-level artifacts (other app ideas, idle/puzzle game work, Jira/Notion structures) without the user explicitly requesting it in this thread, treat it as a contract violation and flag it rather than completing it.
- If "MVP" and "production-ready/months-of-scope" language conflict again in a later phase, MVP wins for what gets built; the larger bar gets documented as direction only.
- Any temptation to add bank-account linking or real payment processing must be named as a new decision requiring explicit user sign-off, not implemented silently.
- Paycheck-cadence/cash-flow math changes must be treated as correctness-critical (silent-wrong-answer risk), not cosmetic — flag for explicit test coverage in architecture/QA phases.
- Don't declare Cistern done until build verification and review agree it meets the production-readiness bar stated above.

## Product Research

Here's where the group landed: only one voice showed up again this round (Codex still unavailable), but the analysis is thorough enough to close this phase — it hits every required output and doesn't contradict anything from the prompt contract.

The read on the audience: this isn't a daily-check-in budgeter, it's someone who opens the app in a moment of dread ("can I afford this?") and wants one glanceable answer, not a system to maintain. That points the design away from YNAB's "assign every dollar a job" confrontation and toward the PocketGuard/Simplifi pattern — a single "am I okay" number (runway/days-until-tight) rather than category-by-category budgeting.

The real tension identified: bank-sync apps earn trust by doing the number-knowing for you; Cistern is manual-entry-only by contract, which means the runway number is only as good as how recently the user updated it — and a stale-but-confident "you're fine" is the single worst failure mode for this persona, worse than no app at all. That reframes quick-add/recurring-templates and a visible staleness indicator ("last updated 9 days ago") as core-loop work, not later polish.

Three concrete risks/gaps got named, satisfying the phase's bar: (1) staleness silently producing a wrong-but-confident number, (2) the fixed-cadence income assumption breaking for gig/hourly/variable-income users who are disproportionately represented in this exact persona, (3) any proactive notification being one copy decision away from becoming the shaming red-alert experience the app is supposed to not be — recommendation is to cut notifications from this pass rather than ship them half-tuned. A fourth, softer point worth keeping visible: manual entry itself may be a form of the confrontation this user avoids, so the entry flow has to be the calmest part of the app, not an afterthought.

Platform opportunity: a home-screen widget (or at minimum a widget-ready data layer) showing the runway number is called out as the single highest-leverage native capability for this persona specifically, because it serves the avoidance instead of fighting it — ranked above Siri Shortcuts, and worth protecting even under MVP time pressure by not architecturally blocking it, even if not shipped this pass.

Nothing here conflicts with the prompt contract, and no disagreement is on the table to resolve — there's just no second voice to stress-test it against, same as last phase. The output is usable as-is by the next phase without redoing this discovery.

CONSENSUS: YES

## Final Output

**Audience and use context:** A financially strained, avoidant user whose relationship with money-checking is anxiety-driven, not habitual. Sessions are short and bursty ("can I afford this right now"), not daily rituals. This audience is disproportionately likely to have variable income (hourly, tipped, gig, overtime) rather than clean fixed salaried cadence.

**Comparable apps/patterns:** YNAB is the anti-pattern to learn from — its category-assignment onboarding is exactly the confrontation this user avoids. PocketGuard's "In My Pocket" and Simplifi's "left to spend" are the closer model: one glanceable, cash-flow-forward number instead of category-backward budgeting. None of these comparables are manual-entry-only, which is the key structural difference Cistern has to design around.

**Platform-specific opportunities:** A home-screen widget (or at minimum a widget-ready data model) surfacing the runway/days-until-tight number is the single highest-leverage native iOS capability for this persona — it lets them get the answer without the confrontation of opening the app. Rank it above Siri Shortcuts. Don't architecturally block it even if it slips from this MVP pass.

**Major assumptions and risks:**
1. Staleness risk (top risk): since there's no bank sync, a runway number based on stale manual entries can confidently tell a financially stressed user they're fine when they're not — the worst possible failure mode. Mitigate via fast quick-add/recurring templates and a visible "last updated" signal rather than presenting stale projections with false confidence.
2. Fixed-cadence income assumption may not fit a meaningfully sized part of this exact audience (gig/hourly/variable income). Needs an explicit decision: support estimated/range income entry, or explicitly scope out variable income and say so.
3. Tonal risk in notifications: any low-balance alert or reminder is one bad copy call away from becoming the shaming experience this app exists to avoid. Recommendation: cut proactive notifications from this MVP pass entirely, or ship strictly opt-in and neutrally worded — don't half-tune this under time pressure.
4. Manual entry may itself be a form of the avoidance this user practices, not just a UI step — so the entry flow needs to be the lowest-friction, calmest part of the whole app, not a secondary concern behind the balance screen.

**Implications for the first build, in priority order:** (1) cash-flow math must be correct under the edge cases already flagged in the prompt contract (irregular cadence, month-end, no-income-scheduled) — a confidently wrong number is worse than no app; (2) manual entry has to be fast enough that staleness doesn't creep in within a week, via quick-add and recurring templates as core-loop features; (3) treat widget-readiness in the data layer as near-core, not a stretch goal; (4) leave proactive notifications out of this pass rather than ship them undertuned.

## Portfolio Selection

CONSENSUS: YES

## Final Output

This is a single-app build, not a portfolio parent. The `PORTFOLIO_CHILD_PROJECT: true` flag plus a single named slug (`cistern`) with a fully-formed spec (category, target user, build mode) makes that clear — the seven-app brief attached underneath is inherited ambition-setting from the parent program, not a work order for this thread to act on. Nothing here asks this session to generate 10 ideas, pick 7, or spin up sibling folders, and all three phases run so far (prompt contract, product research, and this one) have independently landed on the same read. No portfolio-json manifest is warranted, and none is being produced.

Selected app for this session:
- **Slug:** cistern
- **Category:** finance
- **Promise:** "Tell me, in one glance, whether I'm okay — without making me do my banking app's homework."
- **Target user:** Paycheck-to-paycheck, avoidant of their banking app — anxiety-driven, bursty check-ins rather than daily habit.
- **Build:** true

Selection rationale: Cistern is deliberately not "Mint but calmer" — it's a structurally different product, a manual cash-flow projector rather than a bank-synced aggregator, because the prior contract and research phases concluded live bank linking is out of scope for this local-first MVP. That's the one rejected alternative worth recording explicitly: no competitor-style bank-linking UX should get borrowed downstream just because it's familiar, since the whole point of this app is to work without requiring the user to face their actual bank data.

No other apps, categories, or portfolio siblings are in scope for this session — Cistern is the only folder this phase produces.

## Initial Discussion

Here's where the discussion landed: same pattern as the last three phases — Codex is still unavailable, so it's one detailed pass from Claude, but this one earns its keep. It surfaces something genuinely new rather than just restating prior decisions: nobody had yet answered *how the runway math gets its starting number*, and that turns out to be the most emotionally loaded moment in the whole app, since manually typing in your real current balance is arguably more confrontational than looking at your banking app in the first place. The resolution proposed — don't gate onboarding on a scary balance field, let people add income/bills first (lower stakes), treat starting balance as an optional last step framed as "want a more accurate number?", and if skipped, show the runway as explicitly relative-to-zero rather than falsely precise — is a good answer to a real problem, and nothing in the room contradicts it.

The shape of the app that falls out of this: one primary screen, not a tab-bar dashboard — a plain-language runway answer plus its freshness, with quick-add as sheets that dismiss back to that one answer. The current-balance number is treated as a permanent, always-visible, one-tap-to-update affordance rather than a one-time onboarding field, because it decays faster than anything else in the model. The "Cistern" name is proposed as ambient visual language (fill/reserve motif) supporting — not replacing — a precise plain-language number, avoiding both the red/green shame-gauge and the cold spreadsheet look.

Scope boundaries got locked explicitly: single account/balance only, no multi-account or credit tracking, no transaction ledger or categorization, no bank linking or notifications (already decided), CSV import treated as optional-and-likely-cut rather than core, single currency, no debt-payoff or budgeting features, and — the one new addition — no promise of penny-accurate reconciliation, since that's a promise this architecture can't keep and would erode trust the moment it's wrong.

Measurable success criteria were proposed concretely: first-run to a runway answer in under 2 minutes with no forced dead-end field; adding a bill/paycheck in ≤3 taps; updating balance in 1 tap + number entry from anywhere; instant reflection of updates with no save-and-wait; survives force-quit/relaunch.

No disagreement is on the table — there's no second voice to push back, but nothing here conflicts with the prompt contract or product research, and it directly satisfies this phase's required outputs (promise, user/scenario, core loop, boundaries, success criteria) and acceptance checks (one-sentence explainable, small enough for one pass, non-goals explicit).

CONSENSUS: YES

## Final Output

**Product promise:** Cistern answers one question — "am I okay until my next paycheck?" — in one glance, without ever making the user do bank-app-style bookkeeping.

**Primary user and scenario:** A paycheck-to-paycheck user who actively avoids their banking app because checking it is an anxiety event. They open Cistern in short, bursty moments of dread ("can I afford this?"), not as a daily habit, and need an answer in seconds, not a system to maintain.

**Core loop:** Open app → see a plain-language runway answer (a date or day-count, not a dashboard) with a visible freshness indicator → if it needs updating, add a bill/paycheck or update the current-balance anchor in one or two taps via a quick-add sheet → see the answer recompute instantly → done, close app. Everything else (bill list, income schedule, settings) is secondary and architected in service of that one screen, not a co-equal tab.

**Hard scope boundaries (non-goals):**
- Single account / single balance only — no multi-account or credit-card tracking.
- No transaction-level ledger or spend categorization — this is cash-flow-forward, not budget-backward.
- No live bank linking (carried over from prior phases).
- No proactive notifications in this pass (carried over from prior phases).
- CSV import is optional and likely cut, not core loop.
- Single currency, locale-formatted; no multi-currency.
- No debt-payoff planning, no category budgeting.
- No promise of penny-accurate reconciliation — the app states it projects a runway estimate, not exact accounting, and copy/design should say so rather than imply precision the architecture can't guarantee.
- Onboarding never gates progress behind a forced "enter your exact current balance" field — starting balance is offered as an optional, clearly-framed last step, with a relative-to-zero fallback if skipped.

**Measurable success criteria:**
- A first-time user reaches a runway answer (even a provisional zero-anchored one) within 2 minutes of first launch, with no dead-end or forced required field.
- Adding a recurring bill or paycheck takes 3 taps or fewer from the home screen.
- Updating the balance anchor takes 1 tap plus a number entry, reachable from anywhere in the app.
- The runway number updates instantly on any change — no save-and-wait state.
- Data survives force-quit and relaunch with no reset or data loss.

## Per App Product Brief

**Coordinator (Claude) — decision after round 1**

Same pattern as every phase before this one: Codex never showed up, so it's a single detailed pass, but this one lands on real, specific decisions rather than vague gestures — which is exactly what this phase needed, since the acceptance bar here is "specific enough to build" and "subscription value functional, not cosmetic."

The target user gets sharpened one more notch: not just "avoids their banking app" but someone asking one narrow question under stress — "if I spend $40 right now, do I regret it in nine days" — and any screen that makes them do arithmetic or read a dashboard first has failed. That's a good, buildable bar for design to hold every screen against.

The monetization split is the meatiest new decision this round, and it's a clean one: the core safety insight (the runway number itself, unlimited bills, unlimited paychecks, balance updates) stays free forever — gating that behind a paywall for a financially strained user was correctly called out as predatory and trust-destroying. What's paid is genuinely harder-to-build, genuinely optional capability: saved/comparable what-if scenarios, variable/irregular income averaging for gig workers, and the home-screen widget. Pricing landed at $3.99/mo or $19.99/yr, deliberately underpriced versus PocketGuard/Simplifi's $8-12 because the audience is price-sensitive by definition and the wedge is trust, not feature count. That's a real, checkable subscription design, not a cosmetic "Premium" label.

Three concrete QA scenarios got named as the actual acceptance test for this app working at all — zero-data empty state must never look falsely authoritative, a 3-weeks-stale user must get an impossible-to-miss freshness signal, and cadence/DST/past-dated-paycheck edge cases must not silently corrupt the math. That directly operationalizes the "confident wrong answer is worse than a crash" principle this whole project has been building toward since the prompt contract.

Competitive wedge and growth angle are both stated as decisions, not options: the wedge is "built for someone who's decided looking is the problem" (not a bank-linking substitute), and it lives or dies entirely on quick-add actually staying frictionless — flagged as the single biggest business risk, which is a useful thing to hand design. Growth is explicitly niche/word-of-mouth, with a direct rejection of share-sheet virality as tonally hostile to this user — no fake virality mechanic getting invented to compensate.

Local-first/cloud path got a concrete architectural commitment: SwiftData (not UserDefaults) given the relational multi-scenario feature, zero network calls for any core-loop action, and — the one binding decision for this phase — model sync metadata as a separate concern from local records now, so CloudKit or a backend can be layered on later without a schema rewrite.

Nothing here contradicts the prompt contract, product research, portfolio selection, or initial discussion phases — it builds on all four cleanly. All three required outputs for this phase (specific-enough value, functional subscription value, design-ready brief) are satisfied, and there's no open disagreement to hash out, just the recurring absence of a second voice. Calling this converged.

CONSENSUS: YES

## Final Output

**Target user and use case:** A paycheck-to-paycheck user who has stopped opening their banking app because it produces dread, not information. Not budget-curious, doesn't want to learn a system. They open Cistern in a moment of stress with one question: "if I spend $X right now, am I still okay until my next paycheck?" Every screen must answer that without requiring arithmetic, categorization, or dashboard-reading first.

**Core loop:** Open app → one plain-language answer ("You're okay through Friday, July 17" / "You'll be tight starting Tuesday") with a highly visible freshness indicator → quick-add or correct a bill/paycheck/balance in 1-2 taps → instantly recomputed answer → close. Treated as a P0 defect class, not an edge case: a confident wrong answer is worse than any crash. Three scenarios are the real acceptance test for "does this app work": (1) zero-data state must never render a falsely authoritative number — explicit "add your first paycheck" empty state instead; (2) 3+ weeks stale data must show an impossible-to-miss freshness warning, never a quietly stale-but-confident projection; (3) end-of-month bill dates, DST boundaries, and past-dated paycheck entries must not silently drop, double-count, or misplace data in the runway math.

**Paid value and subscription value:** Free tier is the complete core loop, unlimited, forever — unlimited bills, unlimited paychecks, the runway answer, and balance updates. Gating the core safety insight behind a paywall for this specific audience is rejected as predatory and trust-destroying. Paid ($3.99/month or $19.99/year — deliberately underpriced vs. PocketGuard/Simplifi's $8-12 because this audience is price-sensitive by definition) unlocks three functionally real capabilities: (1) saved, side-by-side comparable "what if" scenarios (extra shift, rent increase) — requires the app to hold and diff multiple projected futures, not a toggle; (2) variable/irregular income support via average-of-last-N-paycheck estimation for gig/hourly users — genuinely harder to build and genuinely more valuable to a real subset of this audience; (3) the home-screen widget — gated because it's a want-more (ambient reassurance without opening the app), not a need-more, so gating it doesn't touch the core safety promise.

**Competitive wedge:** Every competitor's value prop is "we know your real numbers so you don't have to look." Cistern's is the opposite: it's built for someone who has already decided that looking is the problem, not the solution. This wedge only holds if manual entry stays genuinely low-friction and non-judgmental in practice — if quick-add exceeds 3 taps or copy reads as scoldy anywhere, the wedge collapses into "a worse version of what competitors already do." This is named as the single biggest risk to the business model, not just a design nice-to-have.

**Viral or niche growth angle:** Deliberately niche, word-of-mouth growth — not manufactured virality. No share-sheet/social features; broadcasting "look how broke I am" is hostile to this user's emotional posture. Realistic mechanism: organic mention inside communities where this exact financial anxiety is already discussed openly (personal-finance-adjacent spaces, financial-therapy content, gig-worker communities), helped along by the app being something a user is willing to show a friend without it feeling like a confession.

**Local-first and cloud-ready plan:** All data (balance anchor, bills, paychecks, saved scenarios) persists locally via SwiftData, zero network calls required for any core-loop action. Cloud-ready seam locked as an architecture decision now, not deferred: every persisted entity gets a stable identifier with sync metadata modeled as a separate concern from the local record, so CloudKit or a custom backend can be added later as a sync layer without a data-model rewrite.

**Retention reality check:** Habit mechanics (streaks, notifications, gamification) are largely closed off by this app's own tonal contract (no shaming, no proactive alerts this pass). Retention has to come from being reliably right and reliably fast every time someone opens it in a moment of dread — a correctness bar, not a delight bar. This tradeoff is stated explicitly rather than left implied for a later phase to discover the hard way.

## Next Steps Small

CONSENSUS: YES

## Final Output

Only one voice showed up this round again (Codex still unavailable), but it lands on a clean, checkable answer to exactly what this phase needs: the smallest slice that's still emotionally real, not just a form with math behind it.

**MVP slice:** Onboarding that never opens with a scary balance field — add income and bills first, offer the balance anchor last as an optional "want a more accurate number?" step → one home screen showing a plain-language runway sentence plus a highly visible freshness indicator → quick-add sheets for paycheck, bill, and balance-anchor update, each within the promised tap budget → instant on-screen recompute with no save-and-wait → full persistence across relaunch. That's the whole app for this pass. The one workflow (enter income/bills → see runway → correct an input → watch it recompute → close) is the single thing that has to be excellent, not five half-built things.

**Must-have interactions, in order of what breaks the product if missing:**
1. Balance-anchor update reachable in one tap from anywhere, since it's the number that decays fastest.
2. Bill/paycheck quick-add with sane cadence defaults (weekly/biweekly/semimonthly/monthly) — the user should never have to hand-compute "when's my next payday."
3. A freshness indicator with real visual weight that changes how the runway sentence itself is framed once stale, not just a small ignorable timestamp.
4. A deliberately designed zero-data empty state ("add your first paycheck to get a real answer") that reads as an invitation, not a chore or a fake-precise $0 answer.
5. Live, instant recompute on every input change — no spinner, no stale value lingering.

**Cut list (explicit, to block scope creep later):** No CSV import. No saved/comparable what-if scenarios (premium-tier work — a labeled "Premium" stub explaining what it unlocks is enough). No variable/irregular-income averaging — fixed cadence only, and the app is honest about that limit rather than faking support. No widget extension itself — keep the data layer widget-ready, but don't build the Xcode widget target. No notifications, no multi-account, no transaction ledger (already decided upstream, not reopened here). No settings screen beyond near-nothing, since currency/locale comes from device locale automatically — a settings screen that exists just to look complete dilutes focus.

**The one place this round pushes back on itself:** "smallest slice" must not be read as license to make the cash-flow math naive. The month-end/DST/past-dated-paycheck/no-income-scheduled edge cases already flagged since the prompt-contract phase are not extra features to defer — they're what determines whether the one feature being built actually tells the truth. Cut screens and entry types, never cut correctness.

**Validation criteria (the actual build-phase checklist):**
- First launch to a runway sentence in under 2 minutes, no forced dead-end field.
- Adding a bill or paycheck takes 3 taps or fewer.
- Updating the balance anchor takes 1 tap plus a number entry, from anywhere.
- Every add/edit action produces an instantly-updated runway answer — no spinner, no stale value.
- Force-quit and relaunch preserves every entry and the balance anchor exactly.
- Zero-data state never shows a $0-anchored number as if it were a real answer.
- A bill due on the 31st in a 30-day month lands correctly on that month's last day — never silently dropped or pushed to next month.
- A paycheck dated in the past is either clearly rejected or correctly folded into the projection — never silently ignored.

If any of those eight checks fail, the MVP isn't done, regardless of visual polish. This satisfies the phase's acceptance checks: the slice is buildable without further product debate, and it contains one genuinely complete user workflow.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Same pattern as every phase before this one — Codex still hasn't shown up, so this is one detailed pass, but it's the right pass: it stops treating "handle month-end and DST" as a checkbox and actually enumerates the specific scenarios someone has to write logic for, then does the same for a privacy gap (app-switcher snapshot, backup, App Group container) that no earlier phase had touched at all. Nothing here contradicts the prompt contract, product research, or product brief — it sharpens them into buildable decisions. Calling this converged.

**Resolved requirements:**
- Same-day bills are treated as already subtracted from the runway (conservative bias) — consistent with the standing principle that a confidently wrong "you're okay" is worse than any other failure.
- A bills-only state (bills exist, no paycheck scheduled) is a distinct UI state from zero-data — it must show a bills-only projection against the current anchor and say plainly that no income is assumed, not silently borrow a future paycheck that doesn't exist.
- Negative and zero-amount entries are rejected at the input layer for both bills and paychecks. Implausibly large amounts get a soft, dismissible "that's a big number, just checking" confirmation rather than a hard block — this app doesn't supervise its user, it double-checks fat-fingers.
- Deletion of a bill or paycheck uses soft-delete-with-undo-toast, not a blocking confirm alert — a blocking alert is a small but real tonal violation in an app whose entire premise is calm.
- App-switcher (task-switcher) snapshots of the runway sentence must be obscured — this is sensitive content sitting in plain text in an OS surface nobody had considered.
- An optional, free-tier Face ID/passcode app-lock is offered — cheap to build, directly serves the anxiety this app is designed around, and stays free because it's a trust feature, not a value-add.
- The SwiftData store stays included in default device backup (not excluded for "privacy") — for a local-first, no-sync app, backup is the only thing preventing total data loss, and this user's situation makes that loss especially costly.
- The SwiftData store is placed in an App Group container from day one, even with no widget target built this pass — this is the concrete mechanism behind "widget-ready," since retrofitting it later means migrating an existing user's data with real loss risk.

**Edge cases (the actual list a naive implementation would get wrong):**
- Semimonthly cadence (1st/15th) landing on a weekend or on Feb 29/30/31 — needs an explicit, stated rule (calendar-fixed date, user expected to know their bank posts early) rather than silent drift.
- Biweekly cadence generating pay periods indefinitely without a generation horizon or cap — a bad start date shouldn't be able to make the app compute forty years of future paychecks.
- Month-end clamping (a bill or paycheck dated the 31st placed in a shorter month) applies to paycheck dates too, not just bills, which prior phases only stated for bills.
- The same-day boundary (is a bill due today already subtracted?) — resolved conservative, as above.
- Bills-only / no-income-scheduled state — resolved as its own honest state, as above.
- Negative, zero, and implausibly large amounts — resolved at entry, as above.
- Device clock manipulation (backward/forward) is named and explicitly accepted as an out-of-scope limitation, not defended against — disproportionate effort for a rare, low-stakes case in an MVP.

**Data and privacy implications:**
- App-switcher snapshot exposure of the runway sentence — mitigated by obscuring sensitive content (cover view on `scenePhase` change or equivalent) before backgrounding.
- Optional biometric/passcode app-lock, offered free, as a direct answer to this being a financially-anxious user's most personal screen.
- Device backup inclusion is a deliberate decision (included, not excluded) weighing data-loss risk against privacy-by-exclusion, and it comes down on the side of not losing the user's only record of their financial runway.
- App Group container adoption now is a data-loss-prevention decision for a future migration, not just a widget convenience.
- No new network/third-party exposure introduced by any of this — all mitigations are local, OS-level surface concerns, not sync or backend concerns.

**Risk register:**
1. Naive cadence math misprojecting paydays (weekend/month-end/Feb edge cases) → mitigation: explicit clamping and boundary rules stated above, required test coverage per the prompt contract's standing flag on this exact class of bug.
2. Unbounded pay-period generation → mitigation: hard cap/sane horizon on generated future occurrences.
3. Off-by-one on same-day bills producing a falsely optimistic runway → mitigation: conservative same-day-subtracted rule, locked as a requirement, not left to implementation discretion.
4. Bills-only state being misread as a full projection → mitigation: distinct UI state with explicit "no income scheduled" framing.
5. Fat-fingered amounts (negative, zero, decimal-point typos) → mitigation: hard rejection of negative/zero, soft confirmation on outlier magnitude.
6. App-switcher snapshot leaking financial content → mitigation: obscure sensitive content on background.
7. No entry-point protection for a sensitive app → mitigation: optional free Face ID/passcode lock.
8. Future widget retrofit requiring a risky data migration → mitigation: App Group container adopted now, before any user data exists in the non-shared location.
9. Device clock tampering producing a nonsensical freshness/runway read → accepted as a named, out-of-scope limitation; no mitigation built.

**Final assumptions:**
- Same-day bills: already subtracted (conservative).
- Bills-only projections: shown honestly, no income assumed.
- Negative/zero amounts: rejected at entry; outlier magnitudes get a soft confirmation, not a block.
- App-switcher content: obscured by default.
- Face ID/passcode app-lock: optional, opt-in, free.
- Device backup: includes the data store by default.
- SwiftData store: lives in an App Group container from the start, no widget target required.
- Deletions: soft-delete with undo toast, not confirm-alert.
- Device clock tampering: explicitly out of scope, accepted as a known limitation.

No open disagreement remains to hash out — there's no second voice to stress-test this against, but the content is internally consistent, resolves every ambiguity the phase playbook asks for, and doesn't reopen anything settled in prior phases. Both acceptance checks are met: no major ambiguity remains for design or architecture, and every named risk has either a concrete mitigation or is explicitly scoped out as a limitation.

## App Features

Here's where this round landed: same pattern as every phase before it in this session — Codex still hasn't shown up, so it's one detailed pass, but it's a strong one that does the actual work this phase needs rather than gesturing at it. The pragmatist voice didn't just relist everything from `detailed_discussion` as must-have; it drew a real must/should/could line and defended it, which is exactly what "prioritize ruthlessly" should look like at this point in the process.

The key judgment call, and I think it's the right one: things like the Face ID/passcode lock, haptics, and an animated fill-level visual system all got locked as good ideas in earlier phases, but this round correctly demotes them to should/could rather than must — not because they're bad ideas, but because they're real additional surface area (LocalAuthentication integration, animation work) that competes for time against the one thing that actually can't be wrong: the cash-flow math. The explicit warning here — that the real risk isn't building too little, it's that edge-case test coverage quietly gets sacrificed for demo-able onboarding/visual polish under time pressure — is a useful thing to put in writing now, before a build phase is under any pressure at all.

Everything on the must-have list ties back to the product promise (a truthful, instant runway answer) and every one of the "won't build" items was already locked in earlier phases, not newly invented here. No disagreement is on the table to hash out — there's no second voice yet, but nothing here contradicts the prompt contract, product brief, or detailed discussion, and it hits both acceptance checks: every must-have supports the core promise, and the list is scoped tightly enough that a build phase could actually finish it.

CONSENSUS: YES

## Final Output

**Must-have features** (each with user story + acceptance criteria):

1. **Data model (BalanceAnchor, Bill, Paycheck) in an App Group container from day one**
   - Story: As a future user of a widget (not built this pass), I need my data to already live in a shared container so adding the widget later never requires migrating my existing data.
   - Acceptance: SwiftData store is created in an App Group container at first launch, with zero widget target present; no code path writes to a non-shared container.

2. **Onboarding that never opens with a required balance field**
   - Story: As a first-time user, I want to reach a runway answer without being forced to type in my real balance, so first launch doesn't feel like a confrontation.
   - Acceptance: Fresh install reaches a runway sentence in under 2 minutes with zero required fields; skipping the balance step produces a coherent, honestly-framed (relative-to-zero) answer, never an error state.

3. **One home screen: plain-language runway sentence + high-visual-weight freshness indicator**
   - Story: As a returning user, I want one glanceable answer that also tells me how much to trust it, so I don't act on stale information.
   - Acceptance: Sentence text changes by state (fresh / stale / bills-only / zero-data); crossing the staleness threshold visibly changes the framing of the sentence itself, not just a corner timestamp.

4. **Quick-add sheets for paycheck, bill, and balance update, with cadence defaults**
   - Story: As a user correcting my numbers mid-dread, I want adding or updating an entry to be nearly instant, so checking in doesn't feel like homework.
   - Acceptance: Bill/paycheck add completes in ≤3 taps, balance update in 1 tap + number entry; cadence options cover weekly/biweekly/semimonthly/monthly; every flow dismisses to an already-recomputed home screen with no spinner.

5. **Edit and soft-delete-with-undo-toast for bills and paychecks**
   - Story: As a user who fat-fingered an entry, I need to fix it without a scary confirmation dialog, so the app stays calm even when I made a mistake.
   - Acceptance: Deleting shows an undo affordance for several seconds; no blocking confirm-alert exists anywhere in the delete path; editing an entry immediately recomputes the runway.

6. **Cash-flow engine correctness** (the highest-stakes must-have)
   - Story: As a financially strained user, I need the runway number to never be confidently wrong, because that failure mode is worse than any crash.
   - Acceptance: negative/zero amounts rejected at entry; implausibly large amounts get a soft, dismissible confirmation, not a hard block; same-day bills are treated as already subtracted; bill and paycheck dates on the 31st (or Feb 29/30) clamp correctly into shorter months; pay-period generation is capped at a sane horizon; a bills-only/no-income-scheduled state renders honestly instead of assuming a paycheck. **Unit test coverage per edge case is required** — this is the one must-have where missing tests block shipping even if everything else looks polished.

7. **Zero-data empty state**
   - Story: As a brand-new user, I want an inviting first screen, not a fake-precise $0 answer, so I'm not misled or discouraged.
   - Acceptance: Empty state reads as an invitation ("add your first paycheck to get a real answer"), never renders a numeric runway with no underlying data.

8. **Full persistence across force-quit and relaunch**
   - Story: As any user, I need my data to survive closing the app, or the whole product is untrustworthy.
   - Acceptance: force-quit and relaunch preserves every bill, paycheck, and the balance anchor exactly, with no reset.

9. **Accessibility basics**
   - Story: As a user relying on VoiceOver, Dynamic Type, or dark mode, I need full access to the core loop, not a degraded version.
   - Acceptance: VoiceOver labels on every interactive element, 44pt minimum tap targets, Dynamic Type support, dark mode, WCAG AA contrast — verified on the home screen and all quick-add sheets.

10. **App-switcher content obscured on background**
    - Story: As a user of a financially sensitive app, I don't want my runway sentence visible in the OS app-switcher thumbnail.
    - Acceptance: A cover view swaps in on `scenePhase` change before backgrounding; the sensitive sentence never appears in the task-switcher snapshot.

11. **Labeled, non-functional Premium stub**
    - Story: As a user curious about paid features, I want to see what Premium unlocks, so the free/paid split is legible even before real IAP exists.
    - Acceptance: A clearly labeled screen lists the three paid capabilities (saved what-if scenarios, variable-income averaging, widget); no working purchase flow, no StoreKit calls.

**Should/could:**
- **Should:** Optional Face ID/passcode app-lock — build it if the must-have list and its test coverage are solid with time remaining; do not let it delay or crowd out cash-flow correctness work.
- **Could:** Haptic feedback on recompute, delete, and undo.
- **Could:** The water-level/fill-reserve visual motif as an actual animated illustration tied to runway state (vs. a static color accent) — real design lift, worth pursuing only once the core loop is correct and polished.
- **Could:** A near-empty settings screen for anything not already automatic from device locale, if something real turns out to belong there.

**Won't build (restated so it isn't quietly reopened under time pressure):** CSV import; saved/comparable what-if scenarios; variable/irregular income averaging; the actual widget extension target; notifications; multi-account or credit-card tracking; transaction-level ledger or categorization; live bank linking; working StoreKit/IAP plumbing; debt-payoff or category-budgeting features; multi-currency support; any hardening against device clock manipulation.

**Standing priority rule for the build phase:** if something has to give under time pressure, cut from the should/could list, or trim a quick-add convenience — never cut unit-test coverage for month-end clamping, same-day bias, or the pay-period generation cap. Those determine whether the app tells the truth; everything else is negotiable against that.
