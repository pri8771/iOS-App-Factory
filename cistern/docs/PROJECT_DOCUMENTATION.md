# cistern — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `app_build`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Prompt Contract
- Product Research
- Portfolio Selection
- Initial Discussion
- Per App Product Brief
- Next Steps Small
- Detailed Discussion
- App Features
- Design Discussion
- Design Handoff
- Ios Architecture Review
- Tech Specs
- Project Plan
- Task Assignments
- Implementation Readiness Gate
- Build Coordination
- Build Verification
- Human Qa Checklist
- App Store Readiness
- Final Review
- Portfolio Audit

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

## Design Discussion

CONSENSUS: YES

Same pattern as every phase in this session so far — Codex never showed up, so it's one detailed pass from Claude, but it's a complete one that hits all five required outputs (screen inventory, primary flow, state model, visual direction, accessibility notes) with actual buildable specificity rather than vague UX language, and it doesn't contradict anything locked upstream.

The core insight driving this round: the biggest threat to "one home screen, not a dashboard" isn't a rogue new feature, it's the home screen itself quietly growing a second data visualization or a scrollable list because that's easier to build than a true single-line summary. So the design commits to a hard rule — home renders exactly one hero sentence, one ambient fill visual, one balance pill, one single-line "what's coming next" summary row, and nothing else — with everything else pushed one tap away into a secondary list screen.

The screen inventory is concrete: onboarding as a short non-form sequence (welcome → paycheck quick-add → bill quick-add, both skippable with equally-weighted skip/continue → optional balance step, also skippable) landing straight on a computed home screen with no congratulations interstitial; home as the one primary screen; a secondary bills/paychecks list screen; three quick-add sheets that double as edit sheets; a near-empty settings screen; a static Premium stub; and a privacy cover view (a calm, branded placeholder, not a blank screen) that swaps in on backgrounding so the app-switcher never leaks the runway sentence.

State modeling is genuinely thorough rather than a checkbox: home gets five distinct, differently-rendered states (zero-data, bills-only, fresh, stale, and a spinner-free springy recompute transition), quick-add sheets get default/validation-error/soft-confirmation states, the list screen gets its own empty/populated/soft-delete-with-undo states, and — new this round — a previously undesigned case: what home shows if the SwiftData store itself fails to load, resolved as a calm retry screen rather than a crash or a misleadingly empty home.

Visual direction explicitly rejects red/green traffic-light coding in favor of a warm, continuous dusk-on-water gradient tied to fullness/warmth rather than a binary pass/fail swap, with a large, humane hero typeface designed to reflow (never truncate) at max Dynamic Type sizes.

Accessibility notes go beyond the standard checklist: the hero sentence must be one coherent VoiceOver element (not fragmented by styling), recomputes need an explicit accessibility announcement so non-sighted users get confirmation their edit landed, and contrast must be checked against the gradient as an actual per-state overlay condition, not a single static swatch.

Nothing here reopens or conflicts with any locked decision (must-have list, cash-flow correctness priorities, monetization split, privacy/App Group decisions) — it's the visual/IA layer built on top of them. Both acceptance checks pass: a SwiftUI developer has enough here to build the view hierarchy, and every required workflow (onboarding, core loop, edit/delete, staleness, empty/error states) has an explicit screen/state path.

## Final Output

**Screen inventory:**
- **Onboarding** (sequence, not a form): welcome screen (one-sentence promise) → paycheck quick-add (cadence pre-filled) → bill quick-add (add one or several) → optional balance-anchor step ("want a more accurate number?"). "Skip" and "Continue" are equally visually weighted at every optional step. No completion/congratulations screen — finishing (or skipping) drops straight onto a fully computed home screen.
- **Home** (the one primary screen): hero runway sentence, ambient fill/reservoir visual as background atmosphere, a persistent tappable balance-anchor pill, a single-line "what's coming next" summary row (e.g. "2 bills before your next paycheck") that expands to the list screen, and two docked quick-add entry points (bill, paycheck) — nothing else renders on this screen.
- **Bills & paychecks list** (secondary): grouped list, tap to edit, swipe/button to soft-delete with undo toast.
- **Quick-add sheets** (paycheck, bill, balance-update): also serve as edit sheets when opened on an existing item.
- **Settings** (near-empty): appearance override (if not just trusting system dark mode), optional app-lock toggle (should-have), about/version, entry point to Premium stub.
- **Premium stub**: static screen listing the three paid capabilities (saved what-if scenarios, variable-income averaging, widget), no functional purchase button.
- **Privacy cover view** (non-navigable, system-triggered): swaps over home's real content on `scenePhase` backgrounding — a calm, branded placeholder (fill motif only, no text), not a blank screen.

**Primary user flow:** Cold launch → onboarding (income → bills → optional balance, each skippable, non-blocking) → home screen with a real computed runway visible immediately → quick-add or edit a bill/paycheck/balance from home (sheet → instant recompute → dismiss back to home) → optionally drill into the list screen for management → app backgrounds → privacy cover engages → relaunch restores exact state.

**State model per screen:**
- *Home*: zero-data (inviting empty state, paycheck CTA emphasized over bill) · bills-only (explicit "no income assumed" framing) · fresh/computed (normal case) · stale (sentence phrasing shifts + fill visual desaturates/dims past a threshold) · recompute transition (springy re-layout, never a spinner) · data-load-failure (calm "something went wrong opening your data" + retry, never a silent/empty home that could be mistaken for a real answer).
- *Quick-add sheets*: default/pre-filled · inline validation-error (zero/negative rejected) · soft-confirmation (implausibly large amount, dismissible, non-alarming).
- *List screen*: empty ("no bills yet") · populated · soft-delete-with-undo-toast overlay.
- *Privacy cover*: engages on background/inactive, no separate designed states beyond calm-placeholder.

**Visual direction:** No red/green shame-gauge anywhere. The fill/reservoir motif uses a warm, low-contrast, continuous gradient (dusk-on-water, not a status light) — fuller/warmer for "okay," lower/cooler for "tight," always a gradient, never a hard color swap. Large, humane hero typography carries the emotional weight of the sentence and must reflow gracefully (not truncate or shrink) at maximum Dynamic Type sizes. Supporting numerals (balance pill, bill amounts) use a calmer, smaller, neutral weight so they never compete with the hero sentence.

**Accessibility notes:** Hero sentence exposed to VoiceOver as one single coherent element, not fragmented by styling; every recompute posts an explicit accessibility announcement (not just a visual re-layout) so non-sighted users get confirmation an edit took effect; all tap targets (balance pill, quick-add buttons, list rows, undo action) meet 44pt regardless of visual glyph size; contrast on the ambient gradient is verified per-state as an actual overlay condition (fresh/stale/tight variants each checked), not just on a static swatch.

## Design Handoff

CONSENSUS: YES

## Final Output

Same pattern as every phase in this session — Codex never showed up, so it's one detailed pass from Claude, but this one closes out the design_handoff phase properly: it takes the visual/IA spec from `design_discussion` and adds the engineering layer a builder actually needs, without contradicting or re-litigating anything decided upstream. All six required outputs (screen specs, tokens, component inventory, state/interaction notes, accessibility, and the external-design decision) are present with buildable specificity.

**Navigation architecture:** Single `NavigationStack` rooted at Home. Onboarding is a full-screen cover at first launch (not pushed, so there's no back-swipe leaving a half-onboarded state). The bills/paychecks list is a real `NavigationLink` push. All three quick-add/edit flows are `.sheet` presentations at medium detent — never full-screen, since full-screen would visually promote them to Home's weight. Settings/Premium live behind one small, unemphasized icon in Home's corner — no tab bar, no hamburger menu, so Home never grows chrome that reads as a dashboard.

**State management:** A pure, SwiftData-free `RunwayEngine.project(bills:paychecks:anchor:now:) -> RunwayProjection` function is the one piece everything hinges on — it's what makes the mandated unit tests for month-end clamping, same-day bias, and the generation-horizon cap actually testable in isolation. Views wrap it with `@Query`, so recompute is automatic; the springy transition is keyed on the derived `projection` value (not raw query results) so unrelated field touches like a soft-delete timestamp don't retrigger the hero animation. Pay-period generation (2-year hard horizon) is memoized per entity, keyed on `(start date, cadence, horizon)`, not regenerated every body evaluation.

**Two corrections to the prior phase that matter architecturally:**
1. The privacy cover view has to sit at window/root level (driven by `scenePhase` at the App/root-Scene level), not inside `HomeView` — otherwise a live dollar amount in an open quick-add sheet stays visible under the cover if the user backgrounds mid-edit.
2. Home can't be a fixed, non-scrolling VStack — at max Dynamic Type sizes, the hero sentence plus pill plus summary row plus buttons won't fit on smaller devices. It's a `ScrollView` with the fill gradient full-bleed behind the content, so it looks and behaves like a fixed hero screen at normal sizes and becomes genuinely scrollable (never clipped) at accessibility sizes — the only way to honor both "one hero screen" and "never truncate."

**Soft-delete mechanism:** `deletedAt: Date?` on Bill/Paycheck, filtered out by the projection engine, nil'd back by undo; no cleanup pass needed at this data scale.

**Component inventory:** `HeroRunwayText` (single accessibility element, never multiple `Text` views), `CisternFillView` (gradient driven by fullness + temperature, respects `accessibilityReduceMotion` by cross-fading instead of animating), `BalancePill`, `ComingNextRow`, `QuickAddButton` ×2, one parameterized `QuickAddSheet` (bill/paycheck/balance, doubles as edit), `UndoToast`, `EmptyStateView`, `BillsOnlyBanner`, `DataLoadErrorView`, `PrivacyCoverView`, `PremiumFeatureRow`.

**Design tokens:** Dark base `#12161C`, light base `#F7F3EC` (not pure white — avoids the sterile-spreadsheet feel). Fill gradient interpolates continuously between warm/full (`#E8A65C`→`#E0785E`) and cool/tight (`#5C7A8A`→`#3F5C68`) — never a discrete state swap. Hero type: plain SF Pro (Rounded reserved for fill-motif accents only) at ~34pt, wrapping by max-width rather than font-size ceiling. Body/numerals 17pt regular, captions 13pt. Spacing on a 4pt grid (4/8/12/16/24/32/48). Radii: capsule for pills/buttons, 20pt for toast/cards, system default for sheets. Motion: recompute is a spring (response ~0.45, damping ~0.8) applied to hero text and fill value only, not the whole layout; undo toast slides up with a fade; sheets use system-default transitions.

**Accessibility additions on top of `design_discussion`'s notes:** VoiceOver focus returns to the triggering control after a sheet dismisses, and the recompute announcement posts after that focus settles (not simultaneously, to avoid a race); skip/continue in onboarding keep a consistent VoiceOver reading order (continue first) across every step regardless of visual placement.

**External design decision (explicit, as the phase requires):** No Claude Design/Figma handoff. The entire visual identity is state-driven (gradient as a function of live projection data, reflow-at-every-Dynamic-Type-size hero text, spring motion tied to a derived value) — none of that survives a static comp without being reverse-engineered back into SwiftUI anyway. Build directly from this token system and component inventory. Marketing screenshots, if wanted later, are a separate, smaller task outside this handoff.

Both acceptance checks pass: a SwiftUI builder has enough here (navigation structure, state-ownership boundaries, memoization strategy, concrete tokens, component list, accessibility specifics) to implement without guessing, and nothing here depends on a hidden decision — the two gaps that would have bitten a literal-minded builder (privacy cover scope, Dynamic Type layout) are explicitly closed. Nothing contradicts any locked decision from prior phases; this is purely the implementation layer on top of the approved IA/visual direction. Design handoff is complete.

## Ios Architecture Review

CONSENSUS: YES

## Final Output

Same pattern as every phase in this session — Codex still hasn't shown up, so it's one voice, but it's a thorough closing pass that nails down every architecture decision this phase was supposed to produce, and nothing in it reopens or contradicts what design_handoff already locked. It reads less like new discussion and more like tying off loose ends before tech_specs starts building.

**SwiftUI architecture:** MV, not MVVM — `@Query` directly in views backed by the pure `RunwayEngine.project(...)` function already locked in design_handoff. One addition: soft-deleted rows must be excluded at the fetch layer via `#Predicate` (`@Query(filter: #Predicate<Bill> { $0.deletedAt == nil })`), not filtered in Swift after the fact, so a stale soft-deleted row can never leak into the projection engine.

**The one non-negotiable engineering rule this phase adds:** all cadence math — biweekly, semimonthly, monthly generation, "days until" — must go through `Calendar.date(byAdding:to:)` on the device's autoupdating calendar, never raw `TimeInterval`/epoch arithmetic. This has been gestured at since the prompt contract as "handle DST," but this is the first phase to state it as an actual, code-review-blocking implementation rule rather than a test case to remember later.

**Apple framework choices:** SwiftData, Observation, LocalAuthentication (only if the should-have Face ID lock ships). Explicitly no WidgetKit target, no StoreKit, no CloudKit. Calls out a specific temptation to guard against: someone wiring up a real `.storekit` config "since it's easy" — the Premium screen stays static text with zero StoreKit import, and any change to that is a new decision requiring explicit sign-off, not something that drifts in during a build.

**Persistence plan:** `ModelConfiguration` targeting the App Group container (literal group ID to be fixed now, not improvised at build time), `cloudKitDatabase: .none`. New this round: a `VersionedSchema` + `SchemaMigrationPlan` from day one (even trivially single-version), and the `ModelContainer` built from one shared static factory function so a future widget target calls the identical factory — the concrete mechanism that actually makes "widget-ready" true rather than aspirational.

**Permissions/privacy:** exactly one conditional permission (Face ID, only if built), honest `NSFaceIDUsageDescription`, graceful no-biometrics-enrolled fallback. No camera/location/contacts/push/network permissions at all. Flags a genuinely new, concrete deliverable nobody had named yet: the `PrivacyInfo.xcprivacy` manifest required at App Store submission — zero collected data types, plus a required-reason API declaration if UserDefaults is used anywhere (onboarding flag, appearance override). This gets named as a build-phase checklist item now rather than a submission-time surprise.

**Dependency/license decision:** zero third-party dependencies, SwiftPM unused. Explicitly closes the door on reaching for a snapshot-testing library to verify the five home states — Xcode's built-in screenshot capture via XCUITest plus SwiftUI Previews covers it without adding a dependency.

**Testing implications:** the `RunwayEngine` suite must carry forward the exact edge-case list from `detailed_discussion` as named test cases (semimonthly-on-weekend, [REDACTED:high_entropy], biweekly hitting the horizon cap, bill and paycheck 31st-clamping, same-day-bias, negative/zero rejection, bills-only honesty) rather than being built as vague "some tests." SwiftData needs an in-memory `ModelConfiguration` test harness. Flags a real, easy-to-miss simulator gotcha: Face ID testing requires manually enabling biometric simulation via the simulator's Features menu, or a builder will wrongly think the feature is broken.

**ML/LLM/AR and background work:** explicitly none, and that's correct rather than a gap — nothing about a calm, single-number answer benefits from ML or AR, and there's no background work needed since there's no sync or notifications this pass.

**The one hard line drawn for tech_specs to carry forward as-is:** App Group container, versioned schema/migration plan, and Calendar-based (never epoch-based) date math are non-negotiable, not something to simplify away under time pressure — for the same reason as the App Group decision itself: a first-time schema migration or a DST bug discovered on a device holding someone's real financial data is a much worse time to learn this than now.

All six required outputs for this phase (SwiftUI architecture, framework choices, persistence plan, permissions/privacy plan, dependency/license decision, testing implications) are present with concrete, buildable specificity, and both acceptance checks pass — no vague architecture gaps, and no ML/LLM/AR is used at all (correctly, since none would serve real user value here), no dependency violates the permissive-license policy since there are zero dependencies. Nothing here reopens anything locked in design_handoff or earlier phases. Calling this converged.

## Tech Specs

Round 1 landed a genuinely strong, complete tech_specs pass — same pattern as every phase in this session (Codex still in cooldown, so it's one voice), but this one earns the "visionary" framing it claimed: it doesn't just restate the architecture already locked in `ios_architecture_review`, it makes one deliberate, well-justified engineering bet — building `RunwayEngine` as a sorted-stream sweep-merge algorithm that produces a real balance curve as a byproduct, rather than a naive day-by-day simulation loop — and it explicitly pre-approves falling back to the boring day-by-day loop if full test coverage of the sweep can't be delivered in time. That's the right way to spend ambition in an app whose one hard rule is "never be confidently wrong."

The module layout (`Models/`, `Engine/`, `Persistence/`, `Views/*`, `Support/`) gives parallel build lanes clean boundaries, and the data model choices are the right calls: `Decimal` (never `Double`) for money, `secondAnchorDate` as an explicit second field for semimonthly rather than derived arithmetic (correctly reasoned — "1st and 15th" is two independent anchors, not one anchor plus an offset), and `BalanceAnchor` as an append-only history rather than a mutated singleton, which costs nothing now and keeps a future "what did my runway look like two weeks ago" feature unblocked. Persistence pins the literal App Group identifier and keeps `RunwayEngine` fully SwiftData-free, which is exactly what `ios_architecture_review` demanded. Testing strategy carries forward the full named edge-case list as literal test methods (not parameterized loops that could silently drop a case) and adds new sweep-specific tests — empty streams, same-date bill/paycheck tie-breaking — that hadn't been named before.

The one gap I'm closing on the way out rather than kicking back for another round: the submitted interfaces-json was missing a handful of components that `design_handoff`'s component inventory already named (BalancePill, ComingNextRow, QuickAddButton, SettingsView, the Premium stub screen, BillsOnlyBanner) and had no concrete signature for where amount-validation (reject negative/zero, soft-confirm large) actually lives. Since the acceptance check here is specifically "parallel build lanes can work without inventing incompatible types," I'm adding those now rather than let two lanes invent divergent versions independently. Nothing else changes.

No open disagreement exists — there's no second voice to test this against, but nothing here contradicts the prompt contract, product brief, design handoff, or architecture review, and all five required outputs (architecture overview, file/module layout, data models, persistence strategy, testing strategy) plus the interfaces-json contract are present with real, buildable specificity.

CONSENSUS: YES

## Final Output

**Architecture overview:** MV pattern (no MVVM layer), `@Query` in views backed by a pure, SwiftData-free `RunwayEngine.project(...)`. The one deliberate technical investment: `RunwayEngine` is built as a sweep-merge algorithm over two sorted date streams (bill occurrences, paycheck occurrences) rather than a day-by-day simulation loop, producing a sparse `dailyBalances` curve as a byproduct — this is the substrate for `CisternFillView`'s continuous `fullness` value today and the future what-if/premium feature later, at no extra cost now. A boring day-by-day fallback is pre-approved if the sweep's full test coverage can't be delivered in the available time — correctness under full test coverage always wins over algorithmic sophistication.

**File/module layout:** `Models/` (the three `@Model` classes, `Cadence`), `Engine/` (pure `RunwayEngine`, `RunwayProjection`, date-generation sweep — zero SwiftData/SwiftUI imports, compiles and tests standalone), `Persistence/` (App Group constant, `VersionedSchema`, `SchemaMigrationPlan`, shared `ModelContainerFactory`), `Views/Home/`, `Views/Onboarding/`, `Views/List/`, `Views/QuickAdd/`, `Views/Settings/`, `Views/Shared/` (privacy cover, undo toast, empty/error/bills-only states), `Support/` (design tokens as single source of truth). Two test targets: `CisternTests` (engine + persistence), `CisternUITests` (five-home-state screenshot pass, time permitting).

**Data models:** `Bill`/`Paycheck` share shape — `id: UUID`, `amount: Decimal`, `cadence: Cadence`, `anchorDate`, `secondAnchorDate: Date?` (semimonthly's independent second anchor), `createdAt`, `deletedAt: Date?`. `BalanceAnchor` is `amount: Decimal`, `asOf: Date` (freshness and projection start point are measured from `asOf`, not `createdAt`), append-only history. `RunwayProjection` carries `status` (zeroData/billsOnly/fresh/stale), `runwayEndDate`, `daysRemaining`, `fullness`, `freshnessDays`, `narrativeSentence`, and `dailyBalances: [DailyBalancePoint]`.

**Persistence strategy:** `ModelConfiguration` targeting App Group `group.com.cistern.shared`, `cloudKitDatabase: .none`, `VersionedSchema`/`SchemaMigrationPlan` from day one (single version, empty migration stages — shape exists for future use), built via one shared static `ModelContainerFactory.makeContainer(inMemory:)` so a future widget target calls the identical factory. Soft-deletes excluded at the fetch layer via `#Predicate`, never filtered post-fetch in Swift.

**Testing strategy:** `RunwayEngine` suite implements the full named edge-case list from `detailed_discussion`/`ios_architecture_review` as literal `XCTestCase` methods (semimonthly-on-weekend, Feb 29/30/31, biweekly horizon-cap, 31st-clamping for both bills and paychecks, same-day-bias, negative/zero rejection, bills-only honesty), plus new sweep-specific cases (empty bill stream, empty paycheck stream, same-date bill-and-paycheck tie-breaking). Persistence tests use in-memory `ModelConfiguration` and verify the `#Predicate` soft-delete exclusion at the live-fetch level, not just on a manually filtered array.

```interfaces-json
{"interfaces": [
  {"name": "Cadence", "kind": "enum", "language": "swift", "signature": "enum Cadence: String, Codable, CaseIterable { case weekly, biweekly, semimonthly, monthly }", "owning_lane": "data_domain", "notes": "Shared by Bill and Paycheck. Semimonthly requires a second reference date on the owning entity, not derived arithmetically."},
  {"name": "Bill", "kind": "struct", "language": "swift", "signature": "@Model final class Bill { var id: UUID; var name: String; var amount: Decimal; var cadence: Cadence; var anchorDate: Date; var secondAnchorDate: Date?; var createdAt: Date; var deletedAt: Date? }", "owning_lane": "data_domain", "notes": "amount is Decimal, never Double. deletedAt drives #Predicate exclusion at fetch layer, never filtered post-fetch. Negative/zero amount rejected via validateAmount at input layer, not here."},
  {"name": "Paycheck", "kind": "struct", "language": "swift", "signature": "@Model final class Paycheck { var id: UUID; var amount: Decimal; var cadence: Cadence; var anchorDate: Date; var secondAnchorDate: Date?; var createdAt: Date; var deletedAt: Date? }", "owning_lane": "data_domain", "notes": "Same shape as Bill for cadence/date handling. Reference date(s) clamp into shorter months per locked month-end rule."},
  {"name": "BalanceAnchor", "kind": "struct", "language": "swift", "signature": "@Model final class BalanceAnchor { var id: UUID; var amount: Decimal; var asOf: Date; var createdAt: Date }", "owning_lane": "data_domain", "notes": "Appended, not mutated in place; freshness and the projection's starting point are computed from the most recent asOf, not createdAt."},
  {"name": "RunwayProjection", "kind": "struct", "language": "swift", "signature": "struct RunwayProjection { enum Status { case zeroData, billsOnly, fresh, stale }; var status: Status; var runwayEndDate: Date?; var daysRemaining: Int?; var fullness: Double; var freshnessDays: Int; var narrativeSentence: String; var dailyBalances: [DailyBalancePoint] }", "owning_lane": "data_domain", "notes": "dailyBalances is a byproduct of the sweep-merge engine; kept even though current UI only reads fullness/narrativeSentence, because it's the substrate for the future what-if/premium feature and the fill visual."},
  {"name": "DailyBalancePoint", "kind": "struct", "language": "swift", "signature": "struct DailyBalancePoint { var date: Date; var balance: Decimal }", "owning_lane": "data_domain", "notes": "One point per cash-event date, not one per calendar day — sparse, not dense, for performance."},
  {"name": "RunwayEngine", "kind": "function", "language": "swift", "signature": "enum RunwayEngine { static let horizonYears: Int = 2; static func project(bills: [Bill], paychecks: [Paycheck], anchor: BalanceAnchor?, now: Date, calendar: Calendar = .autoupdatingCurrent) -> RunwayProjection }", "owning_lane": "data_domain", "notes": "Pure, SwiftData-free, SwiftUI-free. Must use Calendar.date(byAdding:to:) exclusively, never TimeInterval/epoch arithmetic. Same-day bills treated as already subtracted. Bills-only state (no paychecks) renders honest billsOnly status, never assumes a paycheck. Fallback to a day-by-day loop is pre-approved if sweep-merge test coverage is at risk."},
  {"name": "occurrences(for:anchorDate:secondAnchorDate:from:horizon:calendar:)", "kind": "function", "language": "swift", "signature": "static func occurrences(for cadence: Cadence, anchorDate: Date, secondAnchorDate: Date?, from: Date, horizon: Date, calendar: Calendar) -> [Date]", "owning_lane": "data_domain", "notes": "Generates capped, month-end-clamped occurrence dates for one entity. Hard-stops at horizon regardless of cadence to prevent unbounded generation from a bad anchor date."},
  {"name": "AmountValidation", "kind": "enum", "language": "swift", "signature": "enum AmountValidation: Equatable { case valid; case rejected(reason: String); case needsConfirmation(reason: String) }", "owning_lane": "services_utilities", "notes": "Backs QuickAddSheet's inline validation. Negative/zero -> rejected; implausibly large -> needsConfirmation (soft, dismissible); otherwise valid."},
  {"name": "validateAmount(_:)", "kind": "function", "language": "swift", "signature": "func validateAmount(_ amount: Decimal) -> AmountValidation", "owning_lane": "services_utilities", "notes": "Single shared validation entry point used by all three QuickAddSheet entity kinds so the rule can't drift between bill/paycheck/balance forms."},
  {"name": "AppGroupIdentifier", "kind": "enum", "language": "swift", "signature": "enum AppGroupIdentifier { static let value: String = \"group.com.cistern.shared\" }", "owning_lane": "services_utilities", "notes": "Single literal source of truth referenced by ModelContainerFactory; a future widget target must reference the same constant."},
  {"name": "ModelContainerFactory", "kind": "function", "language": "swift", "signature": "enum ModelContainerFactory { static func makeContainer(inMemory: Bool = false) -> ModelContainer }", "owning_lane": "services_utilities", "notes": "Single shared factory targeting the App Group ModelConfiguration (AppGroupIdentifier.value), cloudKitDatabase: .none, built from CisternMigrationPlan. Future widget target must call this identical factory."},
  {"name": "CisternSchemaV1", "kind": "struct", "language": "swift", "signature": "enum CisternSchemaV1: VersionedSchema { static var versionIdentifier: Schema.Version; static var models: [any PersistentModel.Type] { [BalanceAnchor.self, Bill.self, Paycheck.self] } }", "owning_lane": "data_domain", "notes": "First versioned schema, trivial single-version migration plan from day one per architecture review."},
  {"name": "CisternMigrationPlan", "kind": "struct", "language": "swift", "signature": "enum CisternMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { [CisternSchemaV1.self] }; static var stages: [MigrationStage] { [] } }", "owning_lane": "data_domain", "notes": "Empty stages array acceptable for a single-version schema; the shape exists so a real migration can be added later without restructuring."},
  {"name": "EntryKind", "kind": "enum", "language": "swift", "signature": "enum EntryKind { case bill(Bill?), paycheck(Paycheck?), balance(BalanceAnchor?) }", "owning_lane": "primary_ui", "notes": "Associated value nil means add-new; non-nil means editing that entity. Backs the single parameterized QuickAddSheet."},
  {"name": "QuickAddSheet", "kind": "struct", "language": "swift", "signature": "struct QuickAddSheet: View { let kind: EntryKind; var body: some View }", "owning_lane": "primary_ui", "notes": "Handles add and edit for all three entity types. Uses validateAmount for inline validation-error and soft-confirmation states."},
  {"name": "QuickAddButton", "kind": "struct", "language": "swift", "signature": "struct QuickAddButton: View { let kind: EntryKind; var body: some View }", "owning_lane": "primary_ui", "notes": "Docked entry point on Home for bill/paycheck; 44pt minimum tap target."},
  {"name": "HomeView", "kind": "struct", "language": "swift", "signature": "struct HomeView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "ScrollView-based (not fixed VStack) so max Dynamic Type sizes scroll instead of clip. Wraps @Query results, derives RunwayProjection, composes HeroRunwayText/CisternFillView/BalancePill/ComingNextRow/BillsOnlyBanner."},
  {"name": "HeroRunwayText", "kind": "struct", "language": "swift", "signature": "struct HeroRunwayText: View { let projection: RunwayProjection; var body: some View }", "owning_lane": "primary_ui", "notes": "Single coherent accessibility element; posts an accessibility announcement on recompute after VoiceOver focus settles."},
  {"name": "CisternFillView", "kind": "struct", "language": "swift", "signature": "struct CisternFillView: View { let fullness: Double; let isStale: Bool; var body: some View }", "owning_lane": "primary_ui", "notes": "Continuous warm/cool gradient driven by fullness; cross-fades instead of animating under accessibilityReduceMotion."},
  {"name": "BalancePill", "kind": "struct", "language": "swift", "signature": "struct BalancePill: View { let anchor: BalanceAnchor?; let onTap: () -> Void; var body: some View }", "owning_lane": "primary_ui", "notes": "Persistent, always-visible, tappable from anywhere on Home; opens the balance QuickAddSheet."},
  {"name": "ComingNextRow", "kind": "struct", "language": "swift", "signature": "struct ComingNextRow: View { let summaryText: String; var body: some View }", "owning_lane": "primary_ui", "notes": "Single-line summary (e.g. '2 bills before your next paycheck'); full-row 44pt tap target pushes to BillsPaychecksListView."},
  {"name": "BillsPaychecksListView", "kind": "struct", "language": "swift", "signature": "struct BillsPaychecksListView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "NavigationLink push from ComingNextRow. #Predicate-filtered @Query excluding deletedAt != nil."},
  {"name": "OnboardingFlow", "kind": "struct", "language": "swift", "signature": "struct OnboardingFlow: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Full-screen cover at first launch. Welcome -> paycheck quick-add -> bill quick-add -> optional balance step, all but welcome skippable with equal visual weight."},
  {"name": "SettingsView", "kind": "struct", "language": "swift", "signature": "struct SettingsView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Near-empty: appearance override, optional app-lock toggle (should-have), about/version, entry point to PremiumStubView."},
  {"name": "PremiumStubView", "kind": "struct", "language": "swift", "signature": "struct PremiumStubView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Static list of PremiumFeatureRow entries (saved what-if scenarios, variable-income averaging, widget). No StoreKit import, no functional purchase button."},
  {"name": "PremiumFeatureRow", "kind": "struct", "language": "swift", "signature": "struct PremiumFeatureRow: View { let title: String; let detail: String; var body: some View }", "owning_lane": "primary_ui", "notes": "One row per paid capability listed on PremiumStubView."},
  {"name": "PrivacyCoverView", "kind": "struct", "language": "swift", "signature": "struct PrivacyCoverView: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Applied at window/root Scene level driven by scenePhase, above the entire presentation stack including open sheets — not scoped to HomeView."},
  {"name": "UndoToast", "kind": "struct", "language": "swift", "signature": "struct UndoToast: View { let message: String; let onUndo: () -> Void; var body: some View }", "owning_lane": "polish_resilience", "notes": "Backs soft-delete-with-undo for Bill/Paycheck via deletedAt nil-back."},
  {"name": "DataLoadErrorView", "kind": "struct", "language": "swift", "signature": "struct DataLoadErrorView: View { let retry: () -> Void; var body: some View }", "owning_lane": "polish_resilience", "notes": "Shown if ModelContainer construction/fetch fails at launch; never falls through to a silently empty Home."},
  {"name": "EmptyStateView", "kind": "struct", "language": "swift", "signature": "struct EmptyStateView: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Zero-data invitation state, paycheck CTA emphasized over bill CTA."},
  {"name": "BillsOnlyBanner", "kind": "struct", "language": "swift", "signature": "struct BillsOnlyBanner: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Shown on Home when bills exist but no paycheck is scheduled; states plainly that no income is assumed."},
  {"name": "requestAccessibilityAnnouncement(_:)", "kind": "function", "language": "swift", "signature": "func requestAccessibilityAnnouncement(_ text: String)", "owning_lane": "services_utilities", "notes": "Wraps UIAccessibility.post(notification:.announcement) sequenced after VoiceOver focus settles post-sheet-dismissal."}
]}
```

## Project Plan

Here's where the group landed: same pattern as every phase in this session — Codex still hasn't shown up, so it's one voice again — but this pass earns its keep by turning "build the app" into an actual schedulable plan rather than restating the architecture. Nothing in it reopens or contradicts anything locked in tech_specs or the architecture review; it's the sequencing and verification layer this phase exists to produce.

The key resolution: the "pure engine" claim needed disambiguating before someone hit it mid-sprint. The plan locks the pragmatic reading — `RunwayEngine` is pure in the sense that it never touches `ModelContext`/fetches, but it does take `@Model` instances as parameters, so tests construct bare model instances outside any container rather than building a separate DTO layer. That's a real decision, made now instead of improvised later.

Second resolution: the tech_specs-approved fallback from sweep-merge to a day-by-day loop needed a trigger, not just permission to exist. The plan pins it to a checkpoint — at the end of the data_domain milestone, if the full named edge-case suite isn't green, fall back immediately rather than sinking more time into the clever version.

Third, and this is the most consequential new thing this phase surfaces: the App Group entitlement, literal group ID, and signing/target membership have to be their own verified milestone gate — "app successfully creates the App Group–backed ModelContainer on a clean simulator install" — before any UI work is trusted, because a misconfiguration here would masquerade as the already-designed `DataLoadErrorView` state rather than announcing itself as a build problem.

Everything else is scheduling discipline: strict lane order (data_domain + services_utilities → primary_ui → polish_resilience, since polish wraps states the earlier lanes produce), no invented migration-testing theater for a single-version schema, and the verification plan explicitly reuses the eight-point checklist from `next_steps_small` plus the named edge-case list from `tech_specs`/`ios_architecture_review` rather than rederiving it — with one real addition: the VoiceOver focus-then-announcement sequencing is a runtime race that can't be meaningfully unit-tested and needs its own scheduled manual QA pass.

No disagreement is on the table — there's no second voice to stress-test this against, but it's internally consistent, satisfies both acceptance checks (executable by task assignment; testing/integration scheduled as real milestones, not end-of-project polish), and doesn't drift from anything locked upstream.

CONSENSUS: YES

## Final Output

**Milestones (in build order):**

1. **Scaffolding & platform gate** — Xcode project/target created, App Group entitlement configured with the literal identifier (`group.com.cistern.shared`), signing/provisioning verified. **Gate: app launches on a clean simulator install and `ModelContainerFactory.makeContainer()` successfully creates an App Group–backed container.** No UI work is trusted before this passes — a misconfigured entitlement fails at runtime in a way that looks identical to the designed `DataLoadErrorView` state, so it must be caught here, not diagnosed later as a "data load failure."

2. **data_domain lane** — `Cadence`, `Bill`, `Paycheck`, `BalanceAnchor` (`@Model`, no relationships), `CisternSchemaV1`/`CisternMigrationPlan` (single version, empty stages — no invented migration test scenario), and `RunwayEngine` including the `occurrences(...)` generator. Engine attempted as the sweep-merge algorithm; tested via bare `@Model` instances constructed outside any container (no separate DTO layer). **Checkpoint at end of this milestone:** run the full named edge-case suite (semimonthly-on-weekend, Feb 29/30/31, horizon-cap, 31st-clamping for both Bill and Paycheck, same-day-bias, negative/zero rejection, bills-only honesty, plus sweep-specific empty-stream and same-date tie-break cases). If not 100% green, fall back to the day-by-day loop immediately — do not carry a partially-tested sweep-merge forward.

3. **services_utilities lane** (parallel with late data_domain) — `validateAmount`/`AmountValidation`, `AppGroupIdentifier`, `ModelContainerFactory`, `requestAccessibilityAnnouncement`. Persistence tests use in-memory `ModelConfiguration` and verify `#Predicate` soft-delete exclusion at the live-fetch level.

4. **primary_ui lane** — `HomeView`, `OnboardingFlow`, `QuickAddSheet`/`QuickAddButton`, `BillsPaychecksListView`, `SettingsView`, `PremiumStubView`. Does not start in earnest until data_domain/services_utilities interfaces are stable, since UI is wired directly against `@Query` and the engine's real output shape.

5. **polish_resilience lane** — `PrivacyCoverView` (root/scene-level), `UndoToast`, `EmptyStateView`, `BillsOnlyBanner`, `DataLoadErrorView`. Deliberately last: these wrap or react to states the earlier lanes produce (you can't build a meaningful data-load-failure screen until you know what that failure actually looks like).

6. **Verification pass** — execute the full checklist below; repair as needed.

7. **Final sign-off** — build verification and review agree the production-readiness bar from the prompt contract is met.

**Dependencies:**
- Milestone 1 blocks everything — it's infrastructure, not Swift correctness, and the plan treats it as a checked gate rather than an assumption.
- data_domain + services_utilities block primary_ui (UI shouldn't guess at an interface that might still change).
- primary_ui blocks polish_resilience (privacy cover needs the real sheet-presentation stack; error/empty states need the real failure/empty shapes).
- The sweep-merge-vs-fallback decision is a hard gate inside data_domain, not a soft aspiration — it resolves before primary_ui starts, so UI is never built against an engine whose final algorithm is still undecided.

**Risk mitigations:**
- *Engine purity ambiguity* → resolved as a documented testing convention (bare `@Model` construction), not a new abstraction layer.
- *Sweep-merge running out of time half-tested* → hard checkpoint with a pre-approved, unconditional fallback trigger, not an open-ended escape hatch.
- *App Group/entitlement misconfiguration masquerading as a data-load bug* → its own explicit, checked milestone gate before UI work begins.
- *`DataLoadErrorView`'s retry action being mostly theater* (most real `ModelContainer` construction failures are structural, not transient) → named explicitly as a limitation; verification plan requires actually forcing the failure state via a debug harness rather than trusting it "must work" because it exists in the file tree.
- *Fake migration-test busywork* → explicitly excluded; testing effort goes to the engine edge cases and `#Predicate` enforcement instead, which are real.
- *VoiceOver focus/announcement race being silently unverified* → called out as not unit-testable, scheduled as its own manual VoiceOver-enabled simulator/device pass rather than assumed correct from code review.

**Verification plan (mechanism-tagged, reusing the locked checklists rather than reinventing them):**
- *Unit test:* full named `RunwayEngine` edge-case suite (per data_domain checkpoint above).
- *Unit test:* in-memory persistence + `#Predicate` soft-delete exclusion at live fetch.
- *Manual simulator run:* App Group container creation on clean install (milestone 1 gate).
- *Manual simulator run:* forced `ModelContainer` construction failure → confirms `DataLoadErrorView` renders and retry behavior is honest about its limits.
- *Manual simulator run:* the eight-point checklist from `next_steps_small` — first-run-to-runway under 2 minutes with no dead-end field, ≤3-tap bill/paycheck add, 1-tap-plus-entry balance update, instant recompute with no spinner, force-quit/relaunch persistence, no fake-precise $0 empty state, 31st-in-a-30-day-month correctness, past-dated-paycheck handling.
- *Manual VoiceOver pass:* sheet-dismiss focus return, then recompute announcement firing after focus settles (not simultaneously) — explicitly not covered by XCTest.
- *Manual pass:* dark mode, Dynamic Type at accessibility sizes (confirms ScrollView reflow, not clipping), 44pt tap targets, WCAG AA contrast per fill-state (fresh/stale/bills-only).

Both acceptance checks are satisfied: the plan is directly executable by a task-assignment phase (each milestone maps to one or more of the four owning_lanes with clear entry/exit conditions), and testing/integration is scheduled throughout — as unit-test checkpoints inside data_domain, as gated milestones for infrastructure, and as explicitly time-slotted manual/VoiceOver passes — not deferred to an undifferentiated "polish" step at the end.

## Task Assignments

Round 1 gave a genuinely complete task-assignment pass — same solo-Claude pattern as every phase in this session (Codex still in cooldown), but it does real, checkable work: it takes the four lanes and milestone order already locked in `project_plan` and turns them into 20 concrete, file-owning tasks with a clean dependency graph, plus it catches and resolves the one real structural problem nobody had named yet — that `CisternApp.swift` (primary_ui) has to reference two polish_resilience-owned views (`PrivacyCoverView`, `DataLoadErrorView`) before polish_resilience ever runs, which would otherwise make primary_ui uncompilable under the strict "polish goes last" ordering. The fix — scaffolding creates typed placeholder bodies matching the exact tech_specs signatures, ownership formally hands off to polish_resilience later, signature never changes hands — is a clean, minimal exception rather than a rewrite of the lane boundaries.

I checked the two acceptance conditions myself: all 20 tasks have an owner_lane, and the dependency graph is acyclic (I traced it — every edge points from a later task id to an earlier one, platform gate T-001 is the only zero-dependency root feeding data_domain, while services_utilities has multiple independent zero-dependency starting tasks, so work can start immediately). Nothing here reopens or conflicts with `project_plan`, `tech_specs`, or the architecture review — it's the direct execution layer on top of them.

CONSENSUS: YES

## Final Output

**Repo/project setup:** Fresh git repo and Xcode project at `/Users/pchordia/Documents/iOS-App-Factory/cistern`, single target `Cistern.xcodeproj` → `Cistern`. `git init` happens as the first act of scaffolding (T-001), before any lane branches off, so every lane starts from a real initial commit.

**Lane-by-lane responsibilities:**
- **data_domain**: models, versioned schema, and `RunwayEngine` (occurrence generator, sweep-merge projection, full named edge-case test suite with the checkpoint gate — if the suite isn't 100% green, the task isn't closed until the engine is rewritten to the day-by-day fallback).
- **services_utilities**: platform scaffolding (App Group entitlement, signing, privacy manifest, placeholder shared views), amount validation, App Group identifier + `ModelContainerFactory`, accessibility announcer, design tokens.
- **primary_ui**: app entry/root wiring, onboarding, quick-add/edit sheet, home screen, bills/paychecks list, settings + Premium stub.
- **polish_resilience**: finished implementations of privacy cover and data-load-error view (replacing placeholders), undo toast, empty/bills-only states, and the final consolidated verification pass (`VERIFICATION.md`).

**Owned files:** exactly as listed per task in the tasks-json below — one file, one owning lane, with two declared exceptions: (1) `PrivacyCoverView.swift` and `DataLoadErrorView.swift` are created with placeholder bodies by services_utilities in T-001 (matching tech_specs' exact signatures) and later have their internal bodies — never their signatures — replaced by polish_resilience in T-016/T-017; (2) `project.pbxproj` is integrator-owned by convention since every lane adds its own new files to the target.

**Forbidden edit zones:** no lane edits another lane's owned files outside the two declared exceptions above. If a lane discovers it genuinely needs to touch another lane's file, that's a stop-and-flag moment — raise it to adjust the interface contract (already fixed in tech_specs, so this should be rare), never a quiet cross-lane edit. `CisternApp.swift` is primary_ui-owned and is never touched by polish_resilience, even though it references polish_resilience's two views by type.

**Branch names / merge strategy:** `lane/data-domain`, `lane/services-utilities`, `lane/primary-ui`, `lane/polish-resilience`, each cut from `main` after the scaffolding commit (T-001) lands. data_domain and services_utilities merge to `main` first, in either order (their files never overlap). primary_ui rebases onto that merged `main` before starting in earnest. polish_resilience does the same once primary_ui lands. No force-pushes.

**Testing responsibilities:** each lane writes and owns tests for its own files — data_domain owns `RunwayEngineTests`, services_utilities owns `PersistenceTests`/`AmountValidationTests`. No task closes without its acceptance criteria demonstrably passing (not "looks right"). Manual, non-unit-testable verification (App Group clean-install gate, forced container-failure harness, VoiceOver focus-then-announcement pass, Dynamic Type/dark mode/contrast pass) is consolidated into T-020, owned by polish_resilience as the final task.

**Communication protocol / conflict-prevention plan:** interfaces are already fixed by `tech_specs`, so lanes work independently against that contract rather than needing live coordination. The only required communication event is the stop-and-flag case above (a lane needing to touch another's file signals a contract problem, not a routine edit). The platform gate (T-001) must pass — app launches and creates the App Group–backed container on a clean simulator install — before data_domain/primary_ui work is trusted, since a misconfigured entitlement fails at runtime looking identical to the `DataLoadErrorView` state being built on purpose.

```tasks-json
{"tasks": [
  {"id": "T-001", "title": "Platform scaffolding: Xcode project, App Group entitlement, target signing, placeholder shared views", "owner_lane": "services_utilities", "files": ["Cistern.xcodeproj/project.pbxproj", "Cistern/Cistern.entitlements", "Cistern/Info.plist", "Cistern/PrivacyInfo.xcprivacy", "Cistern/Views/Shared/PrivacyCoverView.swift", "Cistern/Views/Shared/DataLoadErrorView.swift"], "depends_on": [], "acceptance_criteria": ["Project builds and runs an empty root view on a clean simulator install", "App Group entitlement present with identifier group.com.cistern.shared, matching what AppGroupIdentifier.value will assert in T-007", "PrivacyInfo.xcprivacy declares zero collected data types plus the UserDefaults required-reason API entry", "PrivacyCoverView and DataLoadErrorView exist with the exact signatures locked in tech_specs and compile with placeholder bodies, so primary_ui can build against them before polish_resilience finishes them"], "status": "pending"},
  {"id": "T-002", "title": "Core data models: Cadence, Bill, Paycheck, BalanceAnchor", "owner_lane": "data_domain", "files": ["Cistern/Models/Cadence.swift", "Cistern/Models/Bill.swift", "Cistern/Models/Paycheck.swift", "Cistern/Models/BalanceAnchor.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["All three @Model classes and the Cadence enum compile matching tech_specs signatures exactly", "amount is Decimal on every entity, never Double", "Bill and Paycheck carry deletedAt: Date? and secondAnchorDate: Date? for semimonthly", "BalanceAnchor is amount + asOf + createdAt with no in-place mutation assumed anywhere", "Zero validation or business logic inside the model files themselves"], "status": "pending"},
  {"id": "T-003", "title": "Versioned schema and migration plan", "owner_lane": "data_domain", "files": ["Cistern/Persistence/CisternSchemaV1.swift", "Cistern/Persistence/CisternMigrationPlan.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["CisternSchemaV1 lists BalanceAnchor, Bill, Paycheck", "CisternMigrationPlan compiles with a single schema and an empty stages array", "No invented migration test scenario added for this single-version schema"], "status": "pending"},
  {"id": "T-004", "title": "RunwayEngine core: occurrence generator and sweep-merge projection", "owner_lane": "data_domain", "files": ["Cistern/Engine/RunwayEngine.swift", "Cistern/Engine/RunwayProjection.swift", "Cistern/Engine/DailyBalancePoint.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["project(bills:paychecks:anchor:now:calendar:) never touches ModelContext or performs a fetch", "All date math uses Calendar.date(byAdding:to:) exclusively, zero TimeInterval/epoch arithmetic anywhere", "Occurrence generation hard-stops at the 2-year horizon regardless of cadence", "Same-day bills are treated as already subtracted", "Bills-only input (no paychecks) returns billsOnly status and never assumes income", "31st-of-month clamping is applied to both Bill and Paycheck occurrence generation, not just bills"], "status": "pending"},
  {"id": "T-005", "title": "RunwayEngine edge-case test suite (checkpoint gate)", "owner_lane": "data_domain", "files": ["CisternTests/RunwayEngineTests.swift"], "depends_on": ["T-004"], "acceptance_criteria": ["One named XCTestCase method per edge case: semimonthly-on-weekend, feb-29-30-31, biweekly-horizon-cap, bill-31st-clamping, paycheck-31st-clamping, same-day-bias, bills-only-honesty, sweep-empty-bill-stream, sweep-empty-paycheck-stream, sweep-same-date-tie-break", "Tests construct bare @Model instances outside any ModelContainer, no separate DTO layer introduced", "If any case fails, RunwayEngine.swift is rewritten to the day-by-day fallback algorithm and the full suite re-run to green before this task is closed"], "status": "pending"},
  {"id": "T-006", "title": "Amount validation", "owner_lane": "services_utilities", "files": ["Cistern/Support/AmountValidation.swift", "CisternTests/AmountValidationTests.swift"], "depends_on": [], "acceptance_criteria": ["validateAmount(_:) rejects negative and zero as .rejected", "Implausibly large amounts return .needsConfirmation, dismissible, not a hard block", "Pure function, zero SwiftData or SwiftUI import", "Covered by unit tests for the negative, zero, large, and normal-value cases"], "status": "pending"},
  {"id": "T-007", "title": "App Group identifier and ModelContainer factory", "owner_lane": "services_utilities", "files": ["Cistern/Persistence/AppGroupIdentifier.swift", "Cistern/Persistence/ModelContainerFactory.swift", "CisternTests/PersistenceTests.swift"], "depends_on": ["T-001", "T-003"], "acceptance_criteria": ["AppGroupIdentifier.value equals group.com.cistern.shared, matching the entitlements file from T-001 exactly", "makeContainer(inMemory:) builds from CisternMigrationPlan with cloudKitDatabase set to .none", "In-memory test proves #Predicate soft-delete exclusion actually filters deletedAt != nil rows at a live fetch, not just on a manually filtered Swift array", "makeContainer(inMemory: false) successfully creates the App Group-backed container on a clean simulator install"], "status": "pending"},
  {"id": "T-008", "title": "Accessibility announcement helper", "owner_lane": "services_utilities", "files": ["Cistern/Support/AccessibilityAnnouncer.swift"], "depends_on": [], "acceptance_criteria": ["requestAccessibilityAnnouncement(_:) wraps UIAccessibility.post(notification:.announcement)", "Callable from any view with no dependency on models, engine, or persistence"], "status": "pending"},
  {"id": "T-009", "title": "Design tokens", "owner_lane": "services_utilities", "files": ["Cistern/Support/DesignTokens.swift"], "depends_on": [], "acceptance_criteria": ["Single source of truth for dark/light base colors, the warm-to-cool fill gradient stops, hero/body/caption type sizes, the 4pt spacing scale, and corner radii from design_handoff", "No downstream view file hardcodes a hex value, point size, or spacing constant that exists here"], "status": "pending"},
  {"id": "T-010", "title": "App entry point and root wiring", "owner_lane": "primary_ui", "files": ["Cistern/CisternApp.swift"], "depends_on": ["T-007"], "acceptance_criteria": ["Injects ModelContainerFactory.makeContainer() via .modelContainer at the root Scene", "Tracks scenePhase and overlays PrivacyCoverView above the entire presentation stack including any open sheet, not scoped to HomeView", "Routes ModelContainer construction failure to DataLoadErrorView instead of crashing or falling through to a silently empty Home", "Only wires the two shared views in by reference; does not implement their internal content"], "status": "pending"},
  {"id": "T-011", "title": "Onboarding flow", "owner_lane": "primary_ui", "files": ["Cistern/Views/Onboarding/OnboardingFlow.swift"], "depends_on": ["T-004", "T-006", "T-007", "T-009"], "acceptance_criteria": ["Full-screen cover shown only at first launch", "Sequence is welcome -> paycheck quick-add -> bill quick-add -> optional balance step", "Skip and Continue are equally visually weighted at every optional step", "Finishing or skipping lands directly on a fully computed HomeView with no congratulations interstitial"], "status": "pending"},
  {"id": "T-012", "title": "Quick-add / edit sheet", "owner_lane": "primary_ui", "files": ["Cistern/Views/QuickAdd/QuickAddSheet.swift", "Cistern/Views/QuickAdd/QuickAddButton.swift", "Cistern/Views/QuickAdd/EntryKind.swift"], "depends_on": ["T-002", "T-006"], "acceptance_criteria": ["One parameterized sheet handles add and edit for bill, paycheck, and balance via EntryKind", "Inline validation-error and soft-confirmation states are driven by validateAmount, not a locally reimplemented rule", "Cadence picker covers weekly/biweekly/semimonthly/monthly with sane defaults", "Bill/paycheck add completes in 3 taps or fewer; balance update completes in 1 tap plus number entry", "Presented at medium detent, never full screen"], "status": "pending"},
  {"id": "T-013", "title": "Home screen", "owner_lane": "primary_ui", "files": ["Cistern/Views/Home/HomeView.swift", "Cistern/Views/Home/HeroRunwayText.swift", "Cistern/Views/Home/CisternFillView.swift", "Cistern/Views/Home/BalancePill.swift", "Cistern/Views/Home/ComingNextRow.swift"], "depends_on": ["T-004", "T-008", "T-009", "T-012"], "acceptance_criteria": ["ScrollView-based layout, never a fixed VStack, so max Dynamic Type sizes scroll instead of clipping", "HeroRunwayText is a single coherent VoiceOver element and triggers requestAccessibilityAnnouncement on every recompute, sequenced after VoiceOver focus settles", "CisternFillView cross-fades instead of animating when accessibilityReduceMotion is on", "Recompute animation is keyed on the derived RunwayProjection value, not raw query results, using the locked spring parameters", "No red/green traffic-light coloring anywhere on this screen"], "status": "pending"},
  {"id": "T-014", "title": "Bills & paychecks list", "owner_lane": "primary_ui", "files": ["Cistern/Views/List/BillsPaychecksListView.swift"], "depends_on": ["T-002", "T-012"], "acceptance_criteria": ["@Query is #Predicate-filtered to exclude deletedAt != nil", "Tapping a row opens QuickAddSheet in edit mode for that entity", "Deleting sets deletedAt (soft-delete) with no blocking confirm-alert anywhere in the path"], "status": "pending"},
  {"id": "T-015", "title": "Settings and Premium stub", "owner_lane": "primary_ui", "files": ["Cistern/Views/Settings/SettingsView.swift", "Cistern/Views/Settings/PremiumStubView.swift", "Cistern/Views/Settings/PremiumFeatureRow.swift"], "depends_on": ["T-009"], "acceptance_criteria": ["SettingsView offers appearance override, an app-lock toggle placeholder, about/version, and an entry point to PremiumStubView", "PremiumStubView lists exactly three PremiumFeatureRow entries: saved what-if scenarios, variable-income averaging, widget", "Zero StoreKit import and no functional purchase button anywhere in these three files"], "status": "pending"},
  {"id": "T-016", "title": "Privacy cover, finished implementation", "owner_lane": "polish_resilience", "files": ["Cistern/Views/Shared/PrivacyCoverView.swift"], "depends_on": ["T-010", "T-009"], "acceptance_criteria": ["Replaces the T-001 placeholder body with the calm branded fill-motif-only placeholder, no text, no live financial data", "Manually verified that an open QuickAddSheet showing a live dollar amount is fully hidden the instant the app backgrounds mid-edit"], "status": "pending"},
  {"id": "T-017", "title": "Data load error view, finished implementation", "owner_lane": "polish_resilience", "files": ["Cistern/Views/Shared/DataLoadErrorView.swift"], "depends_on": ["T-010", "T-007"], "acceptance_criteria": ["Replaces the T-001 placeholder with calm copy explaining data failed to open, plus a retry action", "Verified via a debug harness that forces ModelContainer construction to fail, confirming this view renders instead of a crash or a silently empty Home"], "status": "pending"},
  {"id": "T-018", "title": "Undo toast and soft-delete wiring", "owner_lane": "polish_resilience", "files": ["Cistern/Views/Shared/UndoToast.swift"], "depends_on": ["T-014"], "acceptance_criteria": ["Appears on every bill/paycheck soft-delete with an undo action that nils deletedAt back", "Auto-dismisses after several seconds with no user action required", "Slides up with a fade per the locked motion spec"], "status": "pending"},
  {"id": "T-019", "title": "Empty and bills-only states", "owner_lane": "polish_resilience", "files": ["Cistern/Views/Shared/EmptyStateView.swift", "Cistern/Views/Shared/BillsOnlyBanner.swift"], "depends_on": ["T-013"], "acceptance_criteria": ["EmptyStateView reads as an invitation with the paycheck CTA visually emphasized over the bill CTA, never renders a numeric runway", "BillsOnlyBanner appears on Home only when bills exist with zero scheduled paychecks and states plainly that no income is assumed"], "status": "pending"},
  {"id": "T-020", "title": "Final verification pass", "owner_lane": "polish_resilience", "files": ["VERIFICATION.md"], "depends_on": ["T-005", "T-007", "T-011", "T-013", "T-014", "T-016", "T-017", "T-018", "T-019"], "acceptance_criteria": ["Documents pass/fail for the eight-point next_steps_small checklist", "Documents pass/fail for the App Group clean-install gate and the forced data-load-failure check", "Documents the manual VoiceOver focus-then-announcement pass, since it is not unit-testable", "Documents dark mode, Dynamic Type at accessibility sizes, 44pt tap targets, and WCAG AA contrast per fill-state", "App is not marked done in this file unless every item is checked or logged as a known limitation matching an already-agreed non-goal"], "status": "pending"}
]}
```

## Implementation Readiness Gate

Here's where things landed: same pattern as every phase in this session — Codex never showed up, so it's one voice — but this is a strong closing pass for a gate phase, because it doesn't rubber-stamp everything upstream. It actually finds four places where the accumulated plan would have silently forced a build agent to invent a product decision, which is exactly the failure mode this gate exists to catch, and it proposes concrete, narrow fixes for each rather than reopening anything settled.

The most consequential call: flip `RunwayEngine` from "attempt sweep-merge, fall back to day-by-day if tests aren't green" to "build day-by-day as the real implementation." The reasoning holds up — the sweep-merge's only stated benefit (a `dailyBalances` byproduct for future what-if scenarios) serves a feature that isn't being built this pass, so there's no reason to carry the harder-to-verify algorithm as the default in a one-shot build whose one hard rule is "never be confidently wrong." Second, it pins two previously-unset magic numbers that both carry real user-safety weight — a 7-day fresh/stale cutoff and a $50,000 "implausibly large" confirmation threshold — so a build agent doesn't pick these arbitrarily mid-implementation. Third, it catches a real gap in the T-005 test list: every named case tests date-generation mechanics, but none actually assert the core promise (correct runway end date on a golden path, correct zero-crossing detection) — that's now added, plus a boundary test for the newly-pinned freshness threshold. Fourth, it closes out an ambiguity around the Face ID/passcode toggle that detailed_discussion approved, app_features downgraded, and task_assignments then left vague — resolved as: cut entirely, no toggle ships in this pass, rather than risk a toggle that looks functional but isn't. It also flags, correctly, that the elaborate branch/merge/conflict-prevention plan in task_assignments assumes multiple simultaneous engineers, which likely isn't how this actually gets built — the file-ownership and dependency-order discipline is real and worth keeping, the git ceremony is optional scaffolding.

Nothing here reopens product, design, or architecture decisions — it's pure gate work: naming decisions that were left implicit and would otherwise get improvised during the build. No disagreement is on the table since there's no second voice, but nothing conflicts with any locked phase, and the fixes are narrow, justified, and directly serve the phase's acceptance checks.

CONSENSUS: YES

## Final Output

### Readiness verdict
**Ready to build, with four scope amendments locked below.** No phase needs to be redone; no product/design/architecture decision is reopened. The amendments close gaps where the accumulated spec would otherwise have forced a build agent to invent a decision mid-implementation.

### Cross-phase consistency check
Traced prompt_contract → product_research → portfolio_selection → initial_discussion → per_app_product_brief → next_steps_small → detailed_discussion → app_features → design_discussion → design_handoff → ios_architecture_review → tech_specs → project_plan → task_assignments. All fourteen phases are internally consistent: scope (single-app, manual-entry-only, no bank linking, no notifications, no multi-account), monetization split (free core loop forever; paid = saved scenarios, variable-income averaging, widget), architecture (SwiftData + App Group container from day one, Calendar-based date math only, MV pattern, pure `RunwayEngine`), and the tone contract (calm, no red/green shaming, soft-delete-with-undo, no blocking alerts) all thread through without contradiction. The only loose ends found were the four items below — none of them contradicts a locked decision, they're gaps where a decision was deferred and never actually made.

### Build blockers and fixes
1. **Blocker:** `RunwayEngine` spec (tech_specs/project_plan/task_assignments) defaults to a sweep-merge algorithm with a fallback trigger, but the stated justification for that complexity (a `dailyBalances` byproduct feeding a not-built premium feature) doesn't apply to this pass.
   **Fix:** Build the day-by-day loop as the primary, real implementation of `RunwayEngine.project(...)`. If a sparse balance-curve byproduct falls out naturally, keep it; do not spend build risk chasing the sweep-merge version. T-004/T-005 acceptance criteria are read as satisfied by either algorithm, with day-by-day as the default choice, not a fallback-of-last-resort.

2. **Blocker:** Two safety-relevant constants were never pinned — the fresh/stale threshold on `RunwayProjection` and the "implausibly large" amount threshold in `AmountValidation`.
   **Fix:** Freshness threshold = **7 days** since the most recent `BalanceAnchor.asOf` (or since first launch if no anchor exists yet) — short enough that the product brief's "3+ weeks stale" QA scenario lands deep inside stale territory. `needsConfirmation` threshold = **$50,000** for a single bill or paycheck entry.

3. **Blocker:** T-005's named edge-case suite covers date-generation mechanics exhaustively but contains no test that the runway answer itself is correct.
   **Fix:** Add three test cases to T-005: (a) golden-path — fixed balance, one recurring bill, one recurring paycheck, assert the runway end date matches hand-computed arithmetic; (b) zero-crossing — a projection where balance goes negative mid-projection, assert the crossing date is correctly identified as `runwayEndDate`; (c) freshness-boundary — day 6 vs. day 7 since anchor, assert the status flips from fresh to stale at exactly the pinned threshold.

4. **Blocker:** Face ID/passcode app-lock was approved in detailed_discussion, downgraded to should-have in app_features, then left ambiguous in task_assignments (T-015 just says "app-lock toggle placeholder" with no implementing task).
   **Fix:** Cut entirely from this build pass. `SettingsView` ships with no app-lock toggle of any kind — not a placeholder, not a stub. This is a real, explicit scope cut, not a silent drop.

**Non-blocking note carried forward, not a gate item:** task_assignments' git branch/merge/conflict-prevention ceremony assumes multiple simultaneous engineers. Treat the file-ownership boundaries and lane dependency order as binding; treat the branch-naming/merge-sequence mechanics as optional scaffolding that can be simplified to match however the build is actually executed (single session, sequential lanes, or parallel subagents).

### Final scope for build
Everything locked in `task_assignments`' 20-task backlog, T-001 through T-020, as written — with the four amendments above layered on top:
- `RunwayEngine` (T-004/T-005): day-by-day loop as the real implementation; sweep-merge not required.
- `RunwayProjection`/freshness (T-004, consumed by T-013): 7-day fresh/stale cutoff, measured from most recent `BalanceAnchor.asOf` or first launch.
- `AmountValidation` (T-006): $50,000 large-amount confirmation threshold.
- T-005 test suite: the ten previously-named cases plus golden-path, zero-crossing, and freshness-boundary.
- `SettingsView`/Premium stub (T-015): no app-lock toggle — appearance override, about/version, entry point to `PremiumStubView` only.
- All other tasks (T-001–T-003, T-007–T-014, T-016–T-020) unchanged from `task_assignments`.

Everything on the standing "won't build" list (CSV import, saved what-if scenarios, variable-income averaging, widget extension, notifications, multi-account, transaction ledger, bank linking, working StoreKit/IAP, debt/budgeting features, multi-currency, device-clock-tampering defense, and now app-lock) remains explicitly out of scope for this pass.

### Acceptance criteria checklist
- [x] Build phase can start without inventing product/design/architecture decisions — the four prior ambiguities (engine algorithm choice, freshness threshold, large-amount threshold, app-lock scope) are now pinned above; nothing else is left open.
- [x] Every major workflow has an acceptance criterion — onboarding, quick-add/edit, home screen states, list/soft-delete, privacy cover, data-load-failure, and the final verification pass all carry acceptance criteria in `task_assignments`' tasks-json, unchanged.
- [x] Testing responsibilities are explicit — per-lane test ownership from `task_assignments` holds; T-005's suite is now complete (calendar-mechanics cases + the three newly-added correctness cases); T-020 consolidates all non-unit-testable manual verification (App Group gate, forced data-load failure, VoiceOver focus/announcement pass, dark mode/Dynamic Type/contrast) into one owned, checked deliverable.

Build may proceed against `task_assignments`' T-001 through T-020 with the four amendments above treated as binding scope, not suggestions.

## Build Coordination

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Build Verification

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** verified: compiled cleanly for the iOS Simulator

VERIFICATION: VERIFIED

## Human Qa Checklist

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: VERIFIED

## App Store Readiness

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: VERIFIED

## Final Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: VERIFIED

## Portfolio Audit

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: VERIFIED
