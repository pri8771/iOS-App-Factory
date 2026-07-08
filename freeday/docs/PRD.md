# freeday — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's the plain-English recap of round 1.

Codex didn't weigh in (CLI unavailable), so this round is Claude's read alone — but it's thorough, internally consistent, and directly follows the phase playbook's required output shape, and there's nothing left contested to hash out. Time matters on this batch, so I'm calling it here rather than spinning a redundant round 2 just to get a second voice to say "agreed."

The core landing points: preserve the prompt verbatim (done above), then turn the spec's own warnings into hard, testable requirements rather than vibes — especially the relapse/reset flow, which the user explicitly flagged as the make-or-break UX moment. Several scope ambiguities (cost-optional habits, downgrade data handling, what to thin under time pressure) got resolved by naming an assumption rather than leaving them for later phases to each guess differently.

CONSENSUS: YES

## Final Output

**Original prompt**: Preserved verbatim above (full Freeday app spec + parent multi-app-exp7 portfolio prompt). This is the source of truth for every later phase; nothing below replaces it.

**Hard requirements**
1. Relapse/reset flow must never be punitive: no "streak broken / reset to zero / you failed" framing without the lifetime-total stat visible on the same screen, same glance. Testable check: does the default relapse-flow state show a shame-coded word or a zeroed number with no compensating lifetime stat in view? If yes, it fails regardless of visual polish.
2. User-facing copy defaults to non-clinical language ("reset," "starting fresh," "day one again") — avoid AA/medical terms like "relapse," "addiction," "withdrawal" in UI text even though "relapse" is fine as an internal/technical event name. No physiological claims stated as fact (e.g., timed withdrawal-symptom copy). This stays in "personal tracking tool" lane per the spec's own key-risks section.
3. Cost-per-use is optional at habit setup. Every surface showing savings (widget, Live Activity, milestone card, home screen) needs a defined, intentional behavior when cost is unset — not a bare $0.00/NaN. E.g., hide the savings row or show a streak-only card.
4. Downgrading from Freeday+ to free never deletes existing habit data. Only gating is on adding new habits / using premium craving tools going forward.
5. SwiftData persists habits, relapse/reset events, and craving-session logs locally; savings math computed on-device; guided craving content fully bundled, zero network dependency.
6. Core v1 workflows are non-negotiable: habit setup with cost-per-use, streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink. Multi-habit management is the paid-tier gate.
7. StoreKit paywall must gate real features using an actual `.storekit` config, not a hardcoded bypass.

**Non-goals**
- No LLM-based chat coaching — craving support is a fixed, offline guided sequence.
- No AR/local ML.
- No cloud sync / backend / community layer in v1 (CloudKit sync is a future-roadmap boundary only; anonymous community layer is explicitly out of scope for v1).
- Not presenting as medical/addiction-treatment advice.

**Production-readiness definition** (for this app specifically)
- Builds and runs on a fresh simulator with zero crashes across all five core workflows.
- SwiftData state (streak, savings, events) survives force-quit/relaunch.
- Relapse-reset flow passes the non-shaming check above.
- StoreKit paywall gates correctly via a real `.storekit` file.
- Empty/loading/error/success states exist for every reachable screen (first-launch-no-habit, craving timer interrupted mid-session, Live Activity denied entitlement, etc).
- If time runs short, Live Activity and widget are the first candidates to simplify (e.g., static/simplified Live Activity, single widget size) — but not to a broken or half-wired state; a crashing feature is worse than a simplified one. Core five workflows are never cut. Per parent prompt: no buildable Xcode project = failure, full stop.

**Decision rules for later phases**
- When spec ambiguity appears, name the assumption explicitly in that phase's output rather than silently picking one.
- Later design/build phases should verify Freeday's actual mechanic (streak + cost-savings tracking) against Waylay's real scope before finalizing, to confirm category-name difference is actually sufficient — a check, not an assumed blocker.
- "Relapse" as a word may appear in code/data-model naming; it should not leak into user-facing copy without a deliberate, reasoned override in the design phase.

## Product Research

Since Codex isn't available this round either, this is Claude talking to itself across two passes — but the second pass (Pragmatist) didn't just repeat the first, it added real substance: named the actual competitors (Quit That!, I Am Sober, Smoke Free), pointed out the doomscrolling/cost-per-use mismatch more sharply, and flagged concrete engineering risks (day-boundary math, Live Activity budget limits, fat-finger reset with no undo). Nothing here contradicts the prompt_contract phase's decisions — it's additive research and risk-surfacing, which is exactly what this phase is for. Nothing is left hanging that needs a round 2.

CONSENSUS: YES

## Final Output

**Audience and use context**
Freeday's addressable audience is broad but not homogeneous — it splits into two behaviorally different groups: (1) spend-based habits with a real per-use cost (cigarettes, vaping, alcohol, takeout coffee) where the "money saved" hook lands perfectly, and (2) non-monetizable habits (doomscrolling, sugar for many users) where streak is the only real signal and "savings" either doesn't apply or is a fuzzy estimate at best. Usage happens in two very different contexts: calm daily check-ins (morning/evening ritual, low-stakes) and acute craving moments (high-stress, one-handed, often in public/hiding, needs to work instantly with zero load time or friction). Design and copy need to serve both without feeling schizophrenic.

**Comparable apps or patterns to learn from**
- **Quit That!** — closest direct analog: generic multi-habit cost/streak tracker. Proves the core mechanic works, but is dated/rough — Freeday's differentiation has to come from actual craft (native feel, design system, guided craving flow), not from claiming genericness as a moat, since a rougher app already ships that idea.
- **I Am Sober** — streak + money-saved + milestone badges at real scale; validates that this exact loop (days + dollars + shareable milestone) retains users. Good pattern to study for the milestone-card mechanic specifically.
- **Smoke Free / QuitNow! / Kwit** — single-purpose cessation apps with more clinical/gamified framing (badges, health-timeline claims); useful as a "what not to do" reference for the shame/clinical-tone risk already flagged in prompt_contract, and a reminder that timed physiological claims ("your lungs recover in X days") are a category norm Freeday should explicitly avoid per its own non-goals.
- Pattern worth borrowing regardless of niche: glanceable widget + shareable recap card is what turns a tracker into a passive daily habit loop rather than an app people forget to open.

**Platform-specific opportunities**
- **Live Activity / Dynamic Island** for the craving timer is the single best-fit native feature here — literally built for "something to glance at on your lock screen while riding out an urge in your pocket." Highest-leverage iOS-native touch in the whole spec.
- **WidgetKit** (streak + savings, home screen and lock screen) matters more than usual for this category — passive visibility is the retention mechanism, not just a nice-to-have.
- **ShareLink** on the milestone card is the built-in viral loop the parent portfolio prompt requires — no custom share-sheet plumbing needed.
- **Haptics** (`CHHapticEngine` after a capability check) for streak-day and craving-timer completion — cheap to build, disproportionately affects how "cared for" a soft, encouraging app like this feels.
- Explicitly **not** using Screen Time / DeviceActivity APIs for auto-detecting doomscrolling in v1 — tempting, genuinely differentiated, but out of scope per the contract's local-first/no-added-complexity boundary. Worth logging as a real v2 idea, not sneaking into this build.

**Major assumptions and risks**
1. *Assumption:* cost-per-use is optional and every habit needs a coherent unit model decided at setup time (per-use price × frequency, or flat daily estimate) — resolved in prompt_contract, but the data model needs to encode this deliberately rather than bolt savings math on after the fact.
2. *Risk:* day-boundary streak logic (timezone travel, DST, manual clock changes) is a classic bug nest, and here a wrong streak-break reading directly triggers the exact abandonment failure mode the user named in the invalidation criteria. Must use calendar-day comparison in the user's current timezone, not elapsed-seconds math.
3. *Risk:* "one-tap non-punitive relapse-and-restart" cuts both ways — one-tap encourages honest logging, but with no undo it's one fat-finger away from wiping a real streak. Needs a brief undo window (snackbar-style), not a scary confirm dialog and not silent irreversibility.
4. *Risk:* Live Activities have OS-enforced lifetime budgets and can be force-ended by the system mid-session — if the craving timer's reassurance depends on the Live Activity surviving, a killed one reads as "the app crashed" at the worst possible emotional moment. The in-app timer must be the standalone source of truth; Live Activity is strictly a bonus layer.
5. *Risk:* as build-priority-5 of five parallel apps, this is the most likely to get its polish phase compressed — the core loop (add habit → see streak → hit craving button → ride timer → completion) must work perfectly with zero dependency on widget/Live Activity landing.

**Implications for the first build**
- Data model must support cost being nil/optional per habit, with every savings-displaying surface (widget, Live Activity, milestone card, home screen) having a defined non-broken behavior when cost is unset (streak-only card, hidden savings row) — not a bare $0.00.
- Streak/date logic should be centralized in one calendar-day-aware utility, not reimplemented ad hoc per screen, given how much rides on it being correct.
- Reset/relapse action needs a short undo affordance baked into the interaction design from the start, not added later.
- Craving timer + guided flow is the true core deliverable and must work fully standalone (no Live Activity, no widget) before either of those additive features gets touched.
- Given time pressure across the portfolio, build order should be: habit setup + streak/reset core loop → craving timer flow → milestone card + ShareLink → StoreKit paywall → widget → Live Activity, so that if anything gets thinned, it's from the back of that list, matching the production-readiness definition already locked in prompt_contract.

## Portfolio Selection

CONSENSUS: YES

## Final Output

This one's straightforward — it's a single-app child project, not a portfolio parent, so there's no fan-out decision to make here at all.

**Single-app vs portfolio-parent decision**: Single app. The `PORTFOLIO_CHILD_PROJECT: true` flag tells us the "pick 5 out of 10 ideas" selection already happened one level up in the parent `multi-app-exp7` orchestration. This project only received its one already-selected app (freeday) to build. No portfolio-json manifest is needed or produced here — that artifact belongs to the parent run, not this child.

**Selected app list**:
| slug | category | promise | target user | build |
|---|---|---|---|---|
| freeday | Habit Quitting / Craving Tracker | Track any habit you're quitting and watch your clean streak and money saved grow, one Freeday at a time | Mass-market population trying to quit or cut back on something (smoking, vaping, sugar, alcohol, doomscrolling) | true |

**Selection rationale and rejected alternatives**: N/A at this level — no candidate-idea contest runs inside a portfolio child project; that competition already concluded upstream when the parent chose Freeday as one of its 5 winners. Nothing was rejected here because nothing was up for selection here.

**One guardrail worth stating explicitly for later phases**: Freeday's "one flexible engine for any habit" pitch (cigarettes, vaping, sugar, doomscrolling) is a single app with a flexible data model — not grounds for spinning up per-habit-type sub-projects, separate schemas, or additional sibling folders. One app, one Xcode project, one target user population. Later phases should read "supports multiple habit types" as a data-model requirement, not a splitting instruction.

**portfolio-json manifest**: Not applicable — this phase is not a portfolio parent.

## Initial Discussion

CONSENSUS: YES

## Final Output

Only one voice in the room this round (Codex is still on cooldown), but it's a thorough, decisive pass that hits every required element cleanly and doesn't contradict anything locked in prompt_contract or product_research — so there's no reason to spin a second round just for an echo. Time matters on this batch, calling it here.

**One-sentence product promise**: Freeday lets you name anything you're trying to quit, then turns each clean day into a visible, growing win — a streak and a running savings number — with a 90-second guided moment to lean on when a craving hits.

**Primary user and scenario**: Not one persona but two recurring moments the same person lives through — the calm, low-stakes daily check-in (a few seconds, almost ambient, "still going") and the acute craving moment (high-stakes, one-handed, often in public or hiding, needs the right screen instantly with zero navigation hunting). The app has to serve both without feeling like two apps stapled together, and it fails at its actual job if craving support is ever buried behind a menu.

**Core loop**: Open app → see today's status (day count + optional savings, framed positively) → either nothing happens (passive win) or tap the always-visible craving button → 90-second guided ride-it-out → land back on "you got through it" with the streak reinforced → periodically get offered a shareable milestone card. Reset is a low-visual-weight escape hatch, not a big red button — and critically, tapping it doesn't produce a dedicated "sorry, you failed" interstitial; it transitions straight into the same home screen state as any other day, just with day count reset to 1 and the lifetime-total stat still visibly present. Making reset boring, not consoling, is the deliberate design choice here — a warm message on its own dead-end screen still reads as a consequence screen no matter the copy.

**Hard scope boundaries**: No LLM chat coaching (craving flow is fixed, pre-scripted content — this is a feature, not a limitation, since it means the tone can be tested and locked, not generated live). No Screen Time/DeviceActivity auto-tracking. No cloud sync or account system in v1. No social feed or community layer — sharing is outbound-only via ShareLink. No "why did you relapse" journaling/analytics prompt in v1 — genuinely useful but adds an optional-text-entry UX problem mid emotionally-loaded-moment that isn't in the locked build scope; half-building it is worse than skipping it. Free tier is architecturally one habit, paid tier is many — but the data layer and navigation stack must support N habits from day one, with the free UI simply not exposing a switcher, so upgrading later is unlocking latent capability rather than a rewrite.

**Measurable success criteria**:
1. Zero to a running habit (name + optional cost + streak showing day 1) in under 60 seconds, three or fewer screens.
2. Craving button reachable and guided flow begins in exactly one tap from home — no intermediate confirmation screen.
3. A user who taps reset lands on a normal, non-terminal home screen — nothing about it visually reads as a dead end or scoreboard-wipe (direct test of the prompt_contract invalidation criteria).
4. Every savings-displaying surface (home, milestone card, widget) has a verified, intentional non-broken state when cost is left nil at setup — no bare $0.00, no blank hole.

## Per App Product Brief

CONSENSUS: YES

Codex is still on cooldown, so this is a single-voice round again — but it's a tight, decisive pass that hits every required element from the phase playbook (target user, paid value, core loop, competitive wedge, growth angle, local-first/cloud-ready plan) and it builds directly on top of everything already locked in prompt_contract, product_research, and initial_discussion without contradicting any of it. The one new substantive addition this round is on monetization: paid tier shouldn't just be "more habits," it should be functionally richer craving support (multiple guided-flow variants, not one script reused) so the subscription actually sells something beyond a habit-count tax — that's a real, checkable requirement, not just restating the spec. No open disagreement to hash out, so calling it here.

## Final Output

**Target user and use case**: The person mid-craving who's already bounced off single-purpose quit apps because none of them fit everything they're trying to cut out — one install, name the habit, go. The use case that actually drives retention isn't the calm daily check-in, it's the acute moment (couch at 9pm, gas-station parking lot) where they open the app one tap from caving. Hard build constraint: cold-launch-to-craving-timer-running must be under 2 seconds and one tap, verified on a base-model device, not just the simulator.

**Paid value and subscription value**: Free = one habit, streak, milestone card, a basic craving timer. Freeday+ ($4.99/mo or $29.99/yr) = unlimited concurrent habits, the full craving toolkit, and the Lock Screen Live Activity. The toolkit itself needs real breadth to make the subscription functional rather than cosmetic — at least 3–4 distinct guided flows (breathing-paced, distraction-redirect, "text someone," delay-and-reassess), not one script gated only by habit count. A single reused script tests "do you have two bad habits," not "would you pay for better support" — that's the wrong test to build toward.

**Core loop**: Launch → home shows day count + savings-if-set (accumulation framing, not scoreboard) → craving button is the dominant tap target → guided flow runs standalone, zero network, zero dependency on Live Activity/widget landing → completion reinforces the streak with no new UI → reset is a small, unshamed affordance that immediately renders the exact same home screen shape (day count at 1, lifetime-total still visible), no interstitial, no "that's okay!" screen. QA gate before ship: log a reset, screenshot one second later — it must be visually indistinguishable from a normal daily-open screenshot except the number.

**Competitive wedge**: Not "we're generic" (Quit That! and I Am Sober already are). The wedge is craft plus one real structural difference — a genuinely native, multi-modal craving companion (Live Activity as the actual point of difference, since neither major competitor has a real lock-screen presence) and a milestone card designed to be the best-looking artifact in the category, since that card is the only thing that leaves the app and markets it for free.

**Viral/growth angle**: The milestone card via ShareLink, tuned for "I need to brag about this" — big number, dollar amount, clean enough to screenshot even unshared. Concrete constraint: the card must render and be shareable at day 1, not just at day 7/30/100 milestones — otherwise every user who churns in week one generates zero viral surface, which is the exact cohort we're least confident about retaining.

**Local-first and cloud-ready plan**: SwiftData is the sole source of truth for v1 — every number on every surface (home, widget, Live Activity, milestone card) must be derivable from local data in airplane mode from first launch, tested literally, not just described. Cloud-readiness means routing all persistence through a small repository/service layer now rather than scattering SwiftData queries through views, so a CloudKit container can be swapped in later without touching business logic or view code — worth the extra structure now given how expensive it'd be to retrofit later.

**Standing non-negotiable carried into build**: the whole bet of this product is avoiding the invalidation criteria. A two-step reset confirmation or any shame-adjacent empty state is a shipped failure, full stop — this needs to be a literal pass/fail gate at review time, not a hoped-for design intention.

## Next Steps Small

CONSENSUS: YES

Only one voice this round (Codex still on cooldown), but it's a complete, decisive pass that satisfies the phase's required output shape (MVP slice, must-haves, cut list, validation criteria) and builds cleanly on everything locked in the four prior phases — no contradictions, nothing left to contest. The one real judgment call made this round: whether the milestone card belongs in the "smallest slice" or can be deferred. The Visionary argued it must be in, since a version without a shareable artifact doesn't actually test the thing this whole portfolio is betting on (viral, mass-market shareability), even though that makes the slice slightly bigger than a pure-minimalist cut would be. That's a reasoned trade-off, explicitly named as such rather than snuck in, and it doesn't conflict with anything the earlier phases decided — if anything it operationalizes what per_app_product_brief already flagged (the card must work at day 1, not just at big milestones). Calling consensus here rather than spinning a second round to re-litigate a well-argued, self-aware trade-off.

## Final Output

**MVP slice**: A single, complete emotional loop — first launch → name a habit (cost-per-use optional/skippable) → home screen shows day count starting at 1 with a dominant, always-visible craving button → tap it → one real, fully-scripted, well-produced guided ride-it-out flow runs start to finish (not four thin variants — one polished flow) → completion reinforces the streak with no new screen → a low-visual-weight reset affordance exists, and tapping it renders the exact same home screen shape at day 1 with the lifetime-total stat still visible, no interstitial, no consolation screen → a shareable milestone card renders and opens a real share sheet, working correctly on day 1 even when cost was left unset.

**Must-have interactions**:
1. Habit setup: name + optional cost-per-use, skippable, under a minute, three screens or fewer.
2. Home screen: day count + optional savings (accumulation framing), craving button as the dominant tap target.
3. Craving-timer guided flow: one real polished script, runs standalone, zero network dependency, completes back to the reinforced streak view.
4. Reset: one tap, no confirm dialog, transitions straight into a normal-looking home screen at day 1 with lifetime-total visible — this is the single interaction worth hand-testing pixel-by-pixel before touching anything else, since the whole invalidation criteria hangs on it.
5. Milestone card + ShareLink: renders and shares correctly at day 1, including when cost is unset (no $0.00, no blank hole).

**Cut list** (deferred, not abandoned): multi-habit management/switcher UI (architecture stays N-habit-ready per earlier phases, free UI only ever shows one); WidgetKit; Live Activity; the StoreKit paywall itself (code structured so gating slots in later without a rewire); three of the four promised guided-flow variants (ship one real one, not four stubs); any settings beyond editing/deleting the one habit — no export, theming, or notification preferences yet.

**Validation criteria** (all human-clickable, no analytics needed):
1. Fresh install → running streak at day 1 in under a minute.
2. Craving button is one tap from home; the guided flow runs start to finish with real content, not a placeholder timer.
3. A screenshot taken one second after tapping reset is visually indistinguishable from a normal day-one screenshot except the number — direct test of the invalidation criteria.
4. The milestone card renders and opens a real share sheet on day 1, using a habit with no cost set, proving the optional-cost path never produces a broken or blank card.

If all four hold up under a real click-through, the concept is proven; widget, Live Activity, multi-habit, and paywall are additive from here.

## Detailed Discussion

CONSENSUS: YES

Only one voice showed up this round too (Codex still on cooldown), but the Skeptic pass earned its keep — it didn't just restate prior phases, it closed out several things that had been left as vague intentions across four rounds: the cost-per-use/frequency math gap, the exact day-1 convention, the undo-window mechanics, the craving-timer's abandoned-session handling, the downgrade-which-habit-shows question, and widget/Live Activity staleness on reset. None of it contradicts anything locked in prompt_contract, product_research, initial_discussion, per_app_product_brief, or next_steps_small — it's the detailed-discussion phase doing exactly its job of turning "we'll figure that out later" into a concrete, buildable rule. Nothing here is contested; it's all additive resolution. Calling consensus rather than spinning a redundant round.

## Final Output

**Resolved requirements**
1. **Savings math needs two inputs, not one.** Habit setup asks for cost-per-use AND typical uses-per-day as a linked optional pair. If either is left blank, the app shows a streak-only card — no savings figure, never a guessed frequency. This prevents a confidently-wrong number (e.g. assuming "once per day" and understating a pack-a-day smoker's savings by ~20x).
2. **Day-1 convention, fixed:** the day you finish setup is day 1 (same-day framing), and the count increments at the next local-midnight rollover. Reset follows the identical rule — tapping reset makes *today* day 1 again, never day 0 counting up.
3. **Craving timer uses monotonic elapsed time**, not wall-clock `Date` math, so DST shifts or manual clock changes can't instantly complete or hang the timer. Craving sessions get a real state (started/completed/abandoned) rather than only ever writing "completed," so an interrupted session (call, backgrounding, force-quit) doesn't lie in the data or leave a stuck 0:00 timer on relaunch.
4. **Undo window on reset, pinned to a number:** a 5-second "Day 1 · Undo" snackbar. Nothing is committed to SwiftData (no relapse event, no lifetime-total mutation) until the window closes — tapping Undo means nothing was ever persisted, avoiding write-then-delete inconsistency. VoiceOver's announcement on reset says "Day 1," not "streak reset," so accessibility users don't get shame-coded language the visual design deliberately avoids.
5. **Freeday+ downgrade with multiple habits:** free UI shows whichever habit was most recently interacted with; the rest stay fully intact in storage and reappear instantly on resubscribe. No picker UI in v1 — not worth new screens for a small lapsed-subscriber edge case.
6. **Widget/Live Activity must reflect a reset immediately** — `WidgetCenter.shared.reloadAllTimelines()` fires synchronously with the reset write; a stale "Day 47" widget after reset is worse than no widget, since it visibly contradicts the whole non-punitive design goal.
7. **Live Activity starts defensively:** check `ActivityAuthorizationInfo().areActivitiesEnabled` before every `Activity.request` (not just at first launch, since users can disable it later in Settings), and a failed start must not visibly break the standalone in-app timer.
8. **Currency is locale-derived** (`NumberFormatter` with `.currency` style + device locale), not a hardcoded `$`.
9. **Sanity ceiling on cost-per-use input** (e.g., reject/double-confirm above ~$500) to stop a fat-fingered decimal producing an absurd, embarrassing milestone-card number.
10. **"Text someone" guided-flow variant** is scoped narrowly: opens the system Messages composer to a user-picked contact. No built-in crisis-line numbers, no hotline integration, no "are you in danger" branching — that would sharpen the health-claims risk this app is explicitly staying away from.

**Edge cases**
- Setup completed seconds before local midnight (day count must still read "Day 1," not flip to 2 within minutes).
- Craving session interrupted by a phone call, app backgrounding under memory pressure, or force-quit mid-flow.
- Reset tapped, then Undo tapped within the 5-second window.
- Freeday+ subscriber with 3 active habits downgrades to free, then later resubscribes.
- Cost-per-use entered without uses-per-day (or vice versa) — must degrade to streak-only, not a broken number.
- Live Activity disabled by the user mid-way through app usage, then a craving session is started.
- Non-US locale currency formatting.

**Data and privacy implications**
- All data stays local/on-device with zero network dependency (already locked); the residual privacy risk is physical device access, not exfiltration, since a habit like "quitting drinking" sitting visible in an unlocked phone is a real, foreseeable concern.
- App-lock/Face ID gating is explicitly named as a known limitation for this version rather than silently absent — new scope this late isn't being snuck in, but the gap shouldn't go unstated either.
- A one-line non-medical disclaimer belongs in an About/Settings screen (not a dismiss-me modal), giving prompt_contract's "personal tracking tool, not medical advice" requirement an actual concrete home instead of just being a copywriting guideline that could get missed screen by screen.

**Risk register**
- *Wrong savings math from an unspecified frequency model* → mitigated by requiring the linked cost/frequency pair, defaulting to streak-only when incomplete.
- *Wall-clock-based craving timer breaking under DST/clock changes* → mitigated by monotonic elapsed-time measurement.
- *Fat-fingered reset with no recovery* → mitigated by the 5-second uncommitted undo window.
- *Stale widget/Live Activity contradicting a reset* → mitigated by synchronous timeline reload tied to the reset write.
- *Silent Live Activity failure breaking perceived reliability* → mitigated by authorization check before every request and a standalone in-app timer that never depends on it.
- *Crisis-adjacent scope creep in the "text someone" flow sharpening health-claims exposure* → mitigated by scoping it to a bare system contact/Messages composer, nothing more.
- *Device-access privacy exposure for sensitive habit data* → named as a known v1 limitation, not solved this round.

**Final assumptions**
- Cost-per-use and uses-per-day are collected as a linked optional pair at setup; savings are never shown from a guessed frequency.
- Day 1 = day of setup or day of reset, incrementing at local midnight.
- Reset has a 5-second undo window with deferred persistence (nothing written until it expires).
- Downgrade-to-free habit selection uses "most recently interacted with," no picker UI.
- App-lock/biometric gating and crisis-hotline integration are out of scope for this version, stated as explicit limitations rather than silent gaps.

## App Features

Only one voice again this round (Codex still on cooldown), but this pass did real work rather than just re-stating the locked slice — it made an explicit, reasoned call to escalate the StoreKit paywall from next_steps_small's "cut list" back into this phase's must-have list, since prompt_contract had already named it a hard requirement and this phase's job (final feature scope) is a different bar than the earlier "smallest validation slice" phase. It also surfaced a real, honest gap rather than quietly papering over it: shipping only one guided-flow variant means the paywall would have nothing functionally real to gate on the craving-support side, which per_app_product_brief already flagged as the wrong test to build toward. Nothing here contradicts any prior phase — it's the "prioritize ruthlessly" job the phase playbook actually asks for, done with acceptance criteria attached to every item. There's no live disagreement to hash out, so I'm calling consensus rather than spinning a redundant round.

CONSENSUS: YES

## Final Output

**Must-have features** (each with acceptance criteria):

1. **Habit setup** — name + linked optional cost-per-use/uses-per-day pair, skippable together, three screens or fewer, under a minute. *Acceptance:* create a habit with no cost entered; confirm no screen anywhere shows $0.00 or a blank hole — a streak-only card renders instead.
2. **Home/streak screen** — day count + optional savings (accumulation framing), dominant always-visible craving button; data layer supports N habits even though free UI renders one. *Acceptance:* force-quit and relaunch — streak/savings survive intact; SwiftData model has no hardcoded single-habit assumption.
3. **Non-punitive reset with 5-second undo** — deferred persistence, no confirm dialog. *Acceptance:* screenshot one second after reset is pixel-indistinguishable from a normal day-one screenshot except the number; tap reset then Undo within the window and confirm zero rows written to the event table.
4. **Craving-timer guided flow** — one fully-scripted flow, monotonic elapsed time, real session state (started/completed/abandoned). *Acceptance:* force-background mid-session and relaunch — no crash, no frozen 0:00, session logs "abandoned" rather than lying.
5. **Milestone card + ShareLink** — renders and shares correctly on day 1 even with cost skipped. *Acceptance:* fresh no-cost habit, tap share on day 1, real share sheet opens with a rendered card.
6. **StoreKit paywall** — escalated from next_steps_small's deferred list back to must-have, because prompt_contract already named it a hard, non-optional requirement and this phase governs final ship scope, not the smallest validation slice. Gates adding habit #2+; real `.storekit` config, no hardcoded bypass; downgrade never deletes existing habit data. *Acceptance:* a real `.storekit` file exists in the project; a free user hitting habit #2 sees a genuine gate; downgrading a 3-habit Freeday+ user to free preserves all 3 habits in storage.
7. **About/Settings screen with the one-line non-medical disclaimer** — folded into must-have (it's cheap and the screen likely exists anyway for habit edit/delete). *Acceptance:* disclaimer text is visible without a dismiss-me modal.

**Should-have** (attempt, simplify if needed, never ship half-wired or crashing):
- WidgetKit (streak + savings), reset-synchronized via `reloadAllTimelines()`.
- Live Activity for craving sessions, with defensive authorization checks.
- A second guided-flow variant (breathing-paced recommended — cheapest to build well, no contact picker/MessageUI needed) so the paywall gates something functionally real on the craving-support side, not just habit count. Explicitly flagged: if this doesn't make it in, the "full craving toolkit" promise is a stated v1.1 gap in review, not faked with stub content.

**Could-have:**
- Additional guided-flow variants beyond the second.
- Habit switcher UI for paid multi-habit users (gating logic is must-have; a polished switcher isn't — a plain list push suffices).
- Extra non-US currency spot-checks beyond the already-correct locale-derived formatter.

**Won't-build** (unchanged from earlier phases): LLM chat coaching, Screen Time/DeviceActivity auto-detection, cloud sync/accounts, social/community feed, relapse-reason journaling, built-in crisis hotline integration, app-lock/biometric gating (named limitation, not a silent gap), data export/import, habit-type-specific sub-schemas.

**Process note carried into build:** streak/milestone logic can't be verified by manually waiting out real calendar days during the build cycle — the repository layer needs an injectable date provider (internal only, not a user-facing debug menu) so day-31/milestone paths are actually testable before ship. Without this seam, several of the acceptance criteria above aren't verifiable in the time available.
