# irregular-income-planner — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round 2 actually closed both gaps from before.

On the core workflow: Codex locked it down — one engine, not a grab-bag. The app's single question is "given my lumpy income and fixed obligations, what can I safely pay myself this cycle?" Runway and risk-window alerts aren't separate features, they're just that same engine viewed forward and against upcoming obligations. Claude agreed with that framing and pushed one more essential refinement that Codex didn't push back on: the baseline can't be a naive average, because an average gets skewed by one windfall month and then confidently tells someone they can afford more than they actually can — which is the realistic way this category of app burns trust. So the baseline has to be conservative by construction (something like a low percentile of trailing income or an explicit "worst realistic month" concept), and there has to be a real, honest "not enough data yet" state for day-one users with zero or one income entries, with a manual fallback estimate rather than a fabricated number. Nobody contested this — it's landed as part of the anchor decision, not a side debate.

On production-ready vs. paywall: full agreement. Premium tier needs to be conceptually real and the code should leave room for gating it later, but actually building StoreKit/purchases/entitlements is explicitly out of scope for this build — that's a decision both of them are now on the same page about, not just a truce.

Claude also added a concrete acceptance bar for later phases to be held to (multi-month test data with a lean month and a windfall month, verifying the safe-to-spend number doesn't spike off the windfall, runway math checks out by hand, zero/one-entry states are honest, and it all survives a relaunch) — nothing in Codex's round 2 conflicts with that, it just sharpens "production-ready" into something testable.

Gemini still hasn't weighed in (CLI unavailable both rounds), but the two active participants have converged cleanly on both open items with no unresolved tension between them.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim as given — the full parent portfolio prompt (6-app program, requirements 1–8, uniqueness rule naming Waylay/TrueScale/Provenance/Scope-Guard/Practice-Loop/Proof/ReturnWise/VerveCoach/CueKeeper/Countertop/FieldQuote/the digital temple app/the PO-automation tool, LLM/AR/ML bonus note, parallel build rules, Jira/Notion prep, transcript retention, output directory `/Users/pchordia/Documents/iOS-App-Factory`, "generate 12 ideas... build all 6") plus the child spec ("Selected app slug: irregular-income-planner," Build mode: MVP build, Category: Finance, no design handoff prompt supplied yet).

**Scope of this thread:** This project is responsible for exactly one app. The parent-level ideation/selection, the 12-idea generation, the Jira/Notion prep, and the combined multi-app transcript are upstream/portfolio-level concerns — not owed by this child build. This thread owns: product direction, design direction, architecture, implementation, and build output for the Irregular Income Planner, landing in its own folder, with its own phase discussion/decisions preserved for later transcript export.

**The anchor mechanic (locked):** One planning engine, not a bundle of features. The core question the app answers: *given my irregular income history and known fixed obligations, what can I safely spend/pay myself this cycle?* That "safe-to-spend" number must be derived from a conservative baseline — a low percentile of trailing income or an explicit worst-realistic-month concept — never a naive mean, because an average lets one windfall month produce advice that's wrong and dangerous in the following lean months. Runway/cushion estimates and risk-window flags are outputs/views of this same engine, not separate features with their own logic.

**Cold start is a designed state:** With zero or one income entries, the app cannot compute a meaningful percentile. It must show an honest "not enough data yet" state and offer a manual low-month estimate as a fallback, clearly marked as an estimate rather than a computed figure — never a silent $0 or a fabricated confident number.

**Hard requirements:**
- Standalone SwiftUI iOS app, local-first, deterministic on-device persistence, architected so cloud sync could be added later without a rewrite.
- Real, working end-to-end flow: enter income history + obligations/reserve targets → get the safe-to-spend number with runway/risk-window interpretation → save locally → reopen and update later, trusting the output.
- Every reachable screen has empty, loading, success, and error states — including the explicit cold-start/insufficient-data state.
- Forecasting math is deterministic, unit-tested, and correct — this is a finance tool, wrong numbers cause real harm.
- Premium, intentional design — not a spreadsheet in costume, not a generic budget-tracker skin.
- A believable, conceptually real premium tier (e.g., deeper scenarios, longer history) — the code should be structured so it *could* be gated later (a simple local entitlement flag is fine) — but no actual StoreKit/purchase/entitlement implementation is required or expected in this build.

**Non-goals (explicit):** bank account linking/aggregation, tax filing or investment advice presented as authoritative, invoicing/payroll/accounting-suite features, multi-user/household collaboration, cloud accounts or backend dependency, generic goal tracking or debt-payoff features, actual purchase/StoreKit implementation, Jira board or Notion structure, combined multi-app transcript file — all of those are either out of scope for a finance-planning MVP or belong to the parent portfolio, not this child build.

**Production-ready definition:** More than "it compiles" or "spec complete." A first-time user can onboard (including with zero/sparse data), understand the model, enter income and obligations, get a trustworthy conservative spend number, and return later without losing state. Edge cases (empty data, single entry, corrected/negative entries, duplicate dates, large numbers, currency/locale formatting) are handled cleanly, not crashed through. Accessibility, privacy, and testing are requirements, not polish.

**Decision rules for later phases:**
- If a feature doesn't improve confidence in spending decisions under uneven income, cut it.
- If a design or feature choice makes this look like a commodity budget tracker, reject it.
- When MVP and production-ready seem to conflict, read it as *production-grade execution, MVP-sized scope* — smaller finished engine over broad feature coverage.
- If a cloud-dependent feature is tempting, replace it with a local-first version unless the app is meaningfully broken without it.
- Premium/monetization: design for it, don't build the purchase plumbing, unless a later phase explicitly overrides this on purpose.
- Acceptance bar to point to in build verification: enter multi-month income data including one lean month and one windfall month; confirm the safe-to-spend number doesn't spike off the windfall; confirm runway math checks out by hand; confirm zero/one-entry states show the honest "not enough data" experience instead of a fabricated number; confirm all of this survives a full app relaunch.

## Initial Discussion

Both Codex and Claude landed in the same place here, just wearing different hats — one design-focused, one QA-focused — and nothing they said actually conflicts.

They agree the product promise is a single sentence: tell someone with lumpy income exactly what's safe to pay themselves this cycle, and make that number trustworthy rather than just present. They agree on who it's for (freelancers, gig workers, commission/tipped/seasonal earners) and on the exact shape of the core loop — log income and obligations, get the safe-to-spend number plus runway/risk-window context, act on it, repeat next cycle. Both explicitly want to resist the same scope creep: no bank linking, no expense categorization/budgeting taxonomy, no debt or goal tracking, no tax withholding calculator, no StoreKit, no multi-currency/household complexity. Claude even names the single riskiest creep vector ("let's add expense tracking to make the number more accurate") and calls it a second product bolted onto this one — Codex's list of non-goals doesn't contradict that, it just didn't get that specific.

Where they added complementary rather than conflicting detail: Codex framed the insufficient-data state as a UX/trust problem (a polished wrong number is worse than an honest empty state, and the app needs to visually signal computed-vs-fallback), while Claude turned the same idea into concrete, testable criteria (numeric tolerance on the windfall-month test, an automated test for the zero/one-entry state, byte-for-byte persistence after relaunch, and "a QA person can reconstruct the number by hand"). These stack cleanly — one's the design principle, the other's how you'd verify it.

Gemini didn't weigh in again (CLI still unavailable), so this is only two voices converging, not three. But between those two, there's no open disagreement to send to round 2.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Irregular Income Planner tells someone with unpredictable income one trustworthy number — what's safe to pay themselves this cycle — without endangering upcoming obligations, and everything else in the app exists to make that number honest.

**Primary user and scenario:** Freelancers, contractors, commission-based salespeople, tipped and seasonal workers — people whose bills are steady but pay isn't. The scenario that matters most isn't onboarding day; it's the recurring moment three months in where they open the app before deciding whether they can afford something, see the number, and act on it.

**Core loop:** Log an income entry / cycle → app recomputes the conservative baseline and current safe-to-spend number from trailing history minus known fixed obligations → user sees that number plus a runway/cushion read and any risk-window flag → user acts (spend, save, brace) and optionally updates obligations or reserve → repeat next cycle. Nothing in the app should exist as an island disconnected from this loop.

**Hard scope boundaries (non-goals):** No bank account linking/aggregation. No expense-category tracking or budgeting taxonomy (obligations are entered as known recurring fixed costs, not itemized transactions — this is the riskiest creep vector to watch). No debt payoff or goal-tracking modules. No tax-withholding calculator. No actual StoreKit/purchase implementation. No multi-currency beyond basic single-currency locale formatting. No multi-user/household features. No bookkeeping, invoicing, or investment advice presented as authoritative.

**Measurable success criteria:**
- A new user understands the app's promise within one session, in one sentence, no follow-up needed.
- Insufficient data (zero or one income entry) always produces an honest "not enough data yet" state with a manual low-month fallback — never a fabricated number or silent $0.
- A synthetic dataset with one windfall month and one lean month produces a safe-to-spend number that stays conservative and does not spike off the windfall (numeric tolerance to be defined once the percentile/baseline method is chosen in the architecture phase).
- Force-quit and relaunch reproduces identical numbers from the same input data — no silent recalculation drift, no data loss.
- Every number on screen is traceable by hand from the raw entries — if it can't be reconstructed with a calculator, the math is too opaque for a finance tool.
- A developer can explain the app in one sentence without listing a bundle of loosely related features; if it needs a second sentence, scope has drifted.

## Per App Product Brief

Both Codex and Claude wrote independent briefs and landed on nearly the same app, just with different illustrative details — there's no real tension between them, only complementary specifics. Codex frames it through "decision safety under volatility" and names concrete premium features (scenario stress-tests, alternate baselines, risk-window calendars, reserve recovery plans). Claude frames it through a concrete persona (Dana, the wedding photographer) and adds the same premium ideas from the user side (longer seasonal history, named obligation scenarios, a rolling year view) plus a sharper core-loop time budget (under 20 seconds to check, under 90 to log a cycle). Both agree, without prompting each other, that: the target user is the same (freelancers/contractors/commission/tipped/seasonal earners), the paid tier must be "more depth on the same trustworthy engine" and never cosmetic, the wedge is being conservative-by-construction instead of averaging or waiting on bank-linked inference, growth is niche and community-driven via a screenshot-worthy single-number moment, and local-first is a trust feature as much as an architecture choice, with cloud added later only as replication behind a repository boundary. Claude flagged one risk to its own reasoning (that manual entry, not bank sync, is the right call) but that's a self-check, not a disagreement with Codex — Codex's free-tier description already assumes manual entry too.

Gemini still hasn't weighed in (unavailable again), so this is two voices agreeing, not three — but between the two, there's nothing left to hash out.

CONSENSUS: YES

## Final Output

**Target user and use case:** Freelancers, contractors, commission-based salespeople, tipped and seasonal workers — people with steady bills and unsteady pay. The moment that matters isn't onboarding, it's the recurring "can I afford this right now" check three months into real use, before they move money, spend, or pay themselves.

**Paid value and subscription value:** Free tier gives the whole core engine for real — safe-to-spend number from a fixed trailing lookback, plus one risk-window flag — genuinely useful on its own, never crippled to force an upgrade. Premium unlocks more depth on that *same* engine, never a second calculator: longer historical windows (12–24 months) for seasonal businesses, named what-if obligation scenarios ("what if I lose this client," "what if rent goes up $200"), alternate baseline strategies, a rolling year/risk-window horizon instead of just the current cycle, and reserve-recovery guidance. This is functional value tied to depth and foresight, not cosmetics.

**Core loop:** Log an income entry or a cycle's income and keep obligations/reserve current → the same conservative engine recomputes the safe-to-spend number → user sees that number, a plain-language runway read, and any risk-window flag, with a visible signal of whether it's computed-from-history or manual-fallback → user acts (pay themselves, hold back, adjust obligations) → repeat next cycle. Checking should take under ~20 seconds; logging a cycle under ~90. Anything that slows that down (mandatory categorization, review rituals) is scope creep.

**Competitive wedge:** Budgeting apps assume steady income and average blindly; "smart" finance apps wait on bank-linked transaction data to infer spending habits, which takes weeks to feel accurate. This app needs only income history and known fixed obligations — data the user already has memorized — and is deliberately conservative by construction, so it's trustworthy from the first real week of use, not after a learning period.

**Growth angle (niche, not broad):** Irregular earners already trade survival tactics in tight communities — photographer Discords, gig-worker forums, freelancer Slacks. The spreadable artifact is a clean, screenshot-worthy single-number screen (or a redacted "safe this month / holdback / runway" card) that someone shares with "this told me not to buy the thing and it was right." Design the primary screen to be shareable on purpose, not as an afterthought.

**Local-first and cloud-ready plan:** All income history, obligations, reserve targets, scenarios, and outputs live on-device with deterministic persistence; the app is fully functional offline with no account required — and that's a stated trust pitch in onboarding ("your numbers never leave your phone unless you choose otherwise"), not just a technical detail, since this is sensitive earnings data. Cloud-readiness comes from keeping the planning engine pure/deterministic and storage behind a repository boundary, so a future sync layer is replication of canonical local records — encrypted backup, new-device restore, optional export — rather than a rewrite of business logic.

**Why this app deserves to exist:** Irregular earners aren't short on data about their own finances — they're short on a stable decision rule. A good month makes them overconfident, a lean month makes them panic, and mainstream budgeting tools are all built for steady paychecks. This app replaces mood-based money decisions with one conservative, honest number, and its non-negotiable line into design and build is: prefer an honest "not enough data yet" state over a confident lie, and every premium feature must deepen decision quality about uneven income — never widen scope into general personal finance.

## Detailed Discussion

CONSENSUS: YES

This round closed it out. Codex came back and explicitly signed off on both of the late additions — reserve as its own independent "insufficient data" state (separate from income-history confidence) and obligations being fixed, manually-entered amounts that the app never predicts or estimates. He didn't just agree, he tied both back to things he'd already said earlier in the discussion (the "last provided" reserve framing, the "false authority" line about not pretending to know things the app can't actually know), so this isn't a reluctant concession, it's the same principle he'd been applying all along, just pointed at two spots nobody had explicitly named yet.

The only place there's a shade of difference left, and it's not really a disagreement, is biometric/passcode lock: Codex ranks it as the first thing to cut if the build gets tight, while Claude wants it on record as the one item they'd fight to keep given the "your numbers never leave your phone" pitch. But both agree on the actual resolution — it's in scope by default, and if something has to give under time pressure, it goes before anything on the risk register does. That's a prioritization note, not an open fight.

Everything else — monthly-framed cycle over a dated-event engine, real cadence/due-dates on obligations, user-entered-only reserve with its own empty state, negative safe-to-spend shown honestly, the three-tier confidence signal, no silent dedup/normalization, Decimal math, export/import, and notifications cut entirely from MVP — is now confirmed by both participants and organized into the four required buckets. Gemini still never weighed in across all three rounds, but between the two active voices there's nothing left unresolved.

## Final Output

**Resolved requirements:**
- One planning engine operating on dated income entries and dated/cadenced obligations (weekly, monthly, quarterly, annual, one-off), surfaced to the user as a monthly-framed safe-to-spend number — the user-facing cycle is calendar month, but the underlying model is real dates, not crude month buckets. Custom user-defined cycle lengths are explicitly out of scope.
- Obligations are fixed-amount-per-occurrence, always manually entered and updated by the user — the app never estimates, predicts, or smooths a variable obligation (e.g. a quarterly tax payment). One engine means one engine; obligations don't get their own inference layer.
- Reserve balance is manually entered only, never inferred from unspent recommendations, and is optional at onboarding — independent of income-history confidence. The runway/cushion view has its own honest empty state ("add your current reserve to see runway") rather than defaulting to a fabricated zero, and every runway output is labeled as based on the last reserve figure the user gave, not a live truth.
- Safe-to-spend confidence is shown as a three-tier signal — insufficient data / low-confidence computed / fully computed — instead of a binary computed-vs-fallback flag, and the transition between tiers is visible to the user, never a silently different number.
- Negative safe-to-spend is displayed as an honest negative figure, never floored at zero.
- Income entries and obligation instances are never silently deduped, merged, or auto-corrected. Same-date duplicates are summed and kept distinct; corrections/refunds/negative adjustments are new auditable records, not edits that erase history.
- All money math uses `Decimal`, never `Double`.
- Local export/import (JSON via the system share sheet) ships in MVP as the data-loss mitigation for a no-cloud, no-account app.
- Notifications are excluded entirely from MVP — the app is pull-only; open it to see current truth.
- Biometric/Face ID/passcode lock is in scope by default, but explicitly the first thing authorized to be cut if the build gets tight — every other item above is not.

**Edge cases:**
- Zero and one income entry (honest empty state, manual fallback — locked in an earlier phase).
- Two-to-five entries (thin-history "low-confidence computed" tier, not full trust).
- Rich income history but zero reserve entered (independent empty state on the runway view only; doesn't block the safe-to-spend number itself).
- Obligations exceeding the safe baseline (negative number shown, not clamped).
- Same-date duplicate income entries (summed, not a conflict).
- Negative/corrective income entries — refunds, chargebacks (allowed, auditable, never merged into the original record).
- Obligation cadences that don't map cleanly onto a calendar month (a quarterly or annual obligation still needs its due-date proximity evaluated for risk-window flagging, regardless of which "month" it technically lands in).
- Very large invoice amounts (formatting must not truncate).
- Accessibility: Dynamic Type scaling on the hero number; colorblind-safe risk-window indication instead of relying on red/green alone.

**Data and privacy implications:**
- No network dependency, no account, no analytics that could leak earnings patterns.
- Sensitive financial data at rest on-device — biometric/passcode gate is the mitigation (see priority note above).
- The growth mechanic's shareable "safe this month" card must be a deliberately separate, redacted render — never a screenshot of the real screen with real numbers/obligation line items — or the viral loop becomes the privacy leak.
- Local export/import is the explicit, named answer to "what happens if you lose the phone with no cloud backup," rather than an unstated gap.

**Risk register (priority order, each with a named mitigation):**
1. False precision / opaque math → confidence-tier display and provenance labeling on every number.
2. Timing blindness from obligation totals that ignore due dates → real cadence/due-date modeling feeding risk-window logic.
3. Entry fatigue causing users to stop feeding the engine (making output look wrong through neglect, not a bug) → fast entry flow, no categorization theater.
4. Silent scope creep into a second forecasting engine via "smart" obligation estimation → obligations locked to fixed, manually-entered amounts only.
5. Data loss with no recovery path → export/import.
6. Unauthorized access to sensitive on-device data → biometric lock (in by default, first item cut under schedule pressure).
7. Stale computed numbers escaping the user's control → notifications cut entirely for MVP.

**Final assumptions (not to be re-litigated in architecture):**
- Cycle displayed to the user = calendar month, backed by a dated-event engine underneath; custom cycle lengths are out of scope.
- Reserve balance is always manual, never inferred.
- Obligation amounts are always manual, never predicted.
- Biometric lock is desired-in by default, but the one explicitly pre-authorized cut if the build gets tight — nothing else on the risk register has that same permission.

## App Features

This one's ready to call. Both participants spent four rounds actually engaging with each other's arguments rather than just restating positions, and by the end there's really only one loose thread — the share card's priority tier — and I have enough to make that call cleanly.

Here's the deciding factor: Claude's round 4 correction is the one that actually holds up against the source text. Going back to the locked `detailed_discussion` output, biometric lock sits explicitly in the "Resolved requirements" bucket ("in scope by default... first thing authorized to be cut") — that's build-it language. The share card only ever appears under "Data and privacy implications," phrased conditionally ("must be a deliberately separate, redacted render... *or the viral loop becomes the privacy leak*") — that's a rule governing the feature *if it exists*, not a mandate that it exist. Claude's round 3 analogy between the two was the sloppy step, and her round 4 self-correction fixes it accurately. Codex's round 4 must-have vote was responding to the round-3 version of that argument, which Claude herself retracted before he could see the correction — so I'm resolving this in Claude's favor on the merits of what the record actually says, not just because she spoke last.

Everything else across all four rounds converged cleanly with real engagement, not rubber-stamping: the five core user moments, the four-surface IA constraint, accessibility as its own must-have line, biometric lock's exact framing, and the sharpened premium-readiness test (a real gated surface wired to a flippable local boolean, not settings copy).

CONSENSUS: YES

## Final Output

**Information architecture constraint (governs everything below):** Four shallow surfaces only — (1) primary dashboard: the safe-to-spend recommendation, confidence tier, runway read, risk-window flag; (2) a combined money-inputs surface for income/obligation/reserve CRUD; (3) an explanation/history surface; (4) settings/data/privacy. Any feature needing a fifth top-level destination doesn't belong in this MVP. The share card and export/import are actions launched from existing surfaces, not new destinations.

---

### Must-have

**1. Sparse-data-aware onboarding**
*Story:* As a first-time user with irregular income, I need to understand what the app calculates and what happens if I don't have enough history yet.
*Acceptance:* Setup completes without requiring finance jargon; zero/one-entry users land in an explicit insufficient-data state, not a broken dashboard; skipping reserve at onboarding still produces a working app with its own honest empty state on the runway view.

**2. Income entry CRUD**
*Story:* As a freelancer, I need to log real income events the way they happen, including corrections and same-day duplicates.
*Acceptance:* Two entries on the same date both appear distinctly in history and sum correctly into the engine; negative/corrective entries are allowed and visually distinguished (not a smaller positive number); editing or deleting any entry triggers an immediate, correct recompute of the safe-to-spend number.

**3. Obligation CRUD with cadence, manual amounts only**
*Story:* As a user with a mix of steady and occasional big obligations, I need upcoming commitments reflected accurately without the app guessing at numbers.
*Acceptance:* Obligations support weekly/monthly/quarterly/annual/one-off cadence with an explicit due date and a manually entered fixed amount — no field anywhere lets the app estimate or auto-fill an amount; a quarterly obligation due soon triggers risk-window flagging even if the current month's total looks fine; deleting an obligation immediately removes its effect from both the safe-to-spend number and any risk flag.

**4. Reserve entry with independent empty state**
*Story:* As a user who knows my income history but not my exact buffer, I need the app to still work without faking runway.
*Acceptance:* A fixture with rich income history and zero reserve entries shows a fully computed safe-to-spend number, with the runway view showing its own explicit "add your reserve to see runway" state — never a fabricated $0.

**5. Safe-to-spend engine with three-tier confidence, on the primary dashboard**
*Story:* As a returning user, I need one legible answer for this month plus honest context on how solid it is.
*Acceptance:* Zero/one entry shows insufficient-data with manual fallback; two-to-five shows low-confidence-computed with a visible tier label; sufficient history shows fully computed; tier transitions are visually distinct, never a same-looking number that quietly gained confidence. A windfall/lean-month fixture (automated unit test against fixtures, not manual spot-check) produces a number that visibly does not track the windfall.

**6. Runway/cushion and risk-window as views of the same engine**
*Acceptance:* Runway figure is hand-reconstructible from raw entries; an obligation due within the risk-window threshold flags correctly even when the monthly total looks safe.

**7. Honest negative safe-to-spend**
*Acceptance:* A fixture where obligations exceed the baseline displays a real negative number — no zero-floor anywhere in the formatting path.

**8. Local persistence, Decimal math, relaunch-proof**
*Acceptance:* Force-quit and relaunch reproduces byte-identical numbers from the same underlying data.

**9. Export/import (JSON via system share sheet)**
*Acceptance:* Export produces a portable file; import on a fresh install reproduces identical computed output; import failures show a recoverable error state.

**10. Biometric/passcode lock — in scope by default**
*Acceptance:* Lock gates app access by default. This is the single item pre-authorized to be cut under schedule pressure — but if cut, that must be a visible, logged decision during build, not a silent omission.

**11. Accessibility on the hero number and risk state**
*Acceptance:* The safe-to-spend figure holds its layout at accessibility-tier Dynamic Type sizes without truncating or breaking; risk-window state is never color-only (colorblind-safe indication required).

**12. Premium-readiness via one real local gate**
*Acceptance:* At least one concrete UI surface shows a gated feature as visibly locked, wired to an actual local entitlement boolean a developer can flip to unlock it — settings copy describing a future feature does not satisfy this on its own. No StoreKit/purchase flow ships.

---

### Should-have
- Plain-language explanation surface breaking the recommendation into baseline / obligations / reserve effect.
- Obligation timeline/calendar view for risk-window legibility.
- Redacted share card — **hard guardrail applies regardless of whether this ships:** if built, it must be a genuinely separate render tested to contain zero raw obligation names or exact figures; if not built this cycle, there is no substitute "screenshot the real dashboard" path, ever.
- Real scenario/what-if obligation stress-tests and longer historical windows (12–24 months), if time allows — genuine premium depth, not just the gate itself.

### Could-have
- Demo/seed data for QA and previews (never confusable with real user data).
- Month-over-month trend strip.
- Quick-add templates for common obligations.
- CSV export alongside JSON.
- Rolling year/risk-window horizon, reserve-recovery guidance.

### Won't-build
- Bank account linking/aggregation, transaction ingestion, expense categorization or budgeting taxonomy.
- Debt payoff, goal tracking, tax-withholding estimation, invoicing, bookkeeping, or payroll features.
- Custom user-defined cycle lengths, multi-user/household workflows, multi-currency beyond basic locale formatting.
- Cloud accounts, sync, or analytics of any kind.
- Notifications in any form (including number-free reminders) for MVP.
- Actual StoreKit/purchase/entitlement implementation beyond the single local boolean gate.
- "Smart" or predicted obligation estimation — obligation amounts are always fixed and manually entered.

**Quality gate warning:** The evaluator still found gaps, but the phase could not run another repair round under the current settings.

QUALITY: FAIL

## Feedback

The consolidated must/should/could/won't list, the resolved share-card call, and the IA constraint are all strong — the four rounds of real engagement (not rubber-stamping) on biometric lock, accessibility, the four-surface constraint, and premium-readiness are reflected faithfully, and Claude's round-4 self-correction on the share card is the right call given what `detailed_discussion` actually locked (resolved-requirement language for the lock vs. conditional privacy-implication language for the share card). No contradiction with prior phases, no papered-over disagreement.

One concrete gap against this phase's explicit rubric: **"Every must-have feature needs a user story and acceptance criteria."** Items 1–5 have both a `Story:` and `Acceptance:` line. Items 6–12 (runway/risk-window, honest negative safe-to-spend, persistence, export/import, biometric lock, accessibility, premium-readiness) have only `Acceptance:` — no user story. That's more than half the must-have list missing a required element, not a formatting nitpick.

**Repair instruction for next round (no new debate needed — this is additive, not a reopening):** add a one-sentence `Story:` line to must-haves 6–12, in the same voice as 1–5. These can be short — e.g.:

- #6: "As a user with irregular income, I need to see how long my current buffer lasts and whether a bill is coming due soon, without re-deriving it myself."
- #7: "As a user whose obligations exceed what I can safely spend this cycle, I need to see that shortfall plainly instead of a comforting zero."
- #8: "As a returning user, I need my numbers to be exactly as I left them every time I reopen the app."
- #9: "As a user with no cloud backup, I need a way to get my data off the device before I lose the phone."
- #10: "As a user entering real income data, I need my financial history protected if someone else picks up my phone."
- #11: "As a user who relies on larger text or is colorblind, I need the one number this app exists for to still be legible and its risk state still be readable."
- #12: "As a returning user, I need to see that deeper features exist and are reachable later, without the app pretending to sell something that isn't wired up."

Once those seven stories are added, this artifact is ready to close — everything else already clears the bar.
