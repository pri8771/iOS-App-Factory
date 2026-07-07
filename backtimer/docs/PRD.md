# backtimer — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's the round-1 recap: Codex and Gemini both came back unavailable (CLI/auth issues on this machine), so the only substantive voice this round was Claude's QA/skeptic pass. Nobody's here to disagree with it, and the analysis itself doesn't leave loose threads — it directly hits the phase's required outputs (prompt preservation, hard requirements, non-goals, production bar, decision rules) and flags the real risks (MVP vs. production-ready tension, contention/replanning edge cases, notification reliability, monetization boundaries, uniqueness collision risk with Countertop/CueKeeper). Since there's no counter-argument on the table and the acceptance checks are satisfiable from this one pass, I'm calling this converged rather than spinning another round waiting on tools that aren't coming back.

CONSENSUS: YES

## Final Output

**Original prompt** — preserved verbatim above in Claude's round-1 message (child spec for `backtimer` plus the full parent portfolio prompt, including the uniqueness exclusion list naming Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the digital temple app, and the PO-automation tool).

**Assignment scope (decision rule):** This project's job is to design, architect, and build *backtimer specifically* — the concept is already selected at the portfolio level. The parent prompt's "generate 12 ideas, pick 6" instruction was already executed one level up and does not re-run here. This project only inherits the parent's *global constraints*: production-readiness bar, monetization requirement, uniqueness rule, local-first-then-cloud architecture, and the general app-build rules (SwiftUI, deterministic local state, no unnecessary third-party deps, real states everywhere).

**Hard requirements:**
- Deliver a working, local-first SwiftUI MVP that lets a host enter multiple recipes' active/passive step durations and get a single backward-planned countdown to one target serve time.
- Time-critical alerts must fire reliably with the phone locked/backgrounded — this is a functional requirement, not polish. A lock-screen/Live Activity view is the expected way to satisfy it.
- Real persistence, real accessibility, every screen has empty/loading/success/error states.
- A genuine paid tier (subscription or one-time) gating something with real ongoing value — never cosmetic-only — decided before the architecture locks feature boundaries.
- Uniqueness against **Countertop** and **CueKeeper** (both workspace-adjacent, plausibly kitchen/timing apps) and against the sibling Food & Drink app in this same batch must be actively checked, not assumed clean.

**Non-goals for this MVP (explicit, so nobody rediscovers them as "missing"):**
- No recipe import, OCR, or text parsing — manual entry of steps/durations only, unless a later phase deliberately overturns this and states why.
- No resource-contention modeling (oven/burner/mixer conflicts) unless the design phase explicitly decides to add it — if it's out of scope, the app's promise language must be worded honestly rather than implying full schedule-conflict detection.
- No Watch app, widgets, or sharing/export in v1 — small and finished beats broad and half-built.

**Production-readiness definition:** Not "more features," but full craft depth on a small surface — the MVP/production-ready tension in the source prompts is resolved as *MVP scope, production-grade polish*. Every included screen and flow must be finished (no placeholders), not expanded in breadth to "feel" more done.

**Open questions the design phase must answer explicitly (not default away):**
1. Does the app model resource contention (shared oven/burners), or does it just merge timelines and let conflicts surface at cook time? Whichever answer, the promise copy must match reality.
2. What happens in real time when the host falls behind — does the plan reflow from now, or does it keep counting to the original serve time? A backward planner needs a stated behavior here.
3. How is background/lock-screen notification reliability going to be verified, not just assumed from local-notification APIs?
4. What exactly sits behind the paywall — decided before architecture, not retrofitted.
5. Confirm what Countertop and CueKeeper actually are, and confirm the sibling F&D app's direction, before locking backtimer's design direction.

## Product Research

Here's where this landed: since Codex and Gemini are both unavailable again this round, the only real input was Claude's pragmatist pass — but it holds up on its own and there's nothing pulling against it. It maps cleanly onto what this phase actually needs to hand off (who's using this, what's out there already, what iOS gives us for free, what could go wrong, and what that means for the first build), so I don't see a reason to spin another round waiting on tools that clearly aren't coming back this session.

CONSENSUS: YES

## Final Output

**Audience and use context.** The target user is a host running a multi-dish meal where timing coordination is the actual pain point — think Thanksgiving/holiday dinners, dinner parties, or any meal where a roast, sides, and a dessert all need to hit the table warm at once. This is inherently a bursty, occasion-driven use pattern (a handful of high-stakes cooks per year, likely spiking around holidays) layered on top of possible lighter weeknight two-dish use. The user is cooking with wet/messy/gloved hands, multitasking across a kitchen, often with the phone locked or physically out of reach — so the app has to be usable by glance and by ear (notification/Live Activity), not by unlocking and tapping through screens mid-cook.

**Comparable apps/patterns.** The nearest reference points are: built-in iOS Clock multi-timers, dedicated multi-timer apps (Multi Timer, Perfect Timer-style utilities), and per-step timers baked into recipe apps (Kitchen Stories, NYT Cooking). None of those do the thing backtimer is promising — working backward from one shared serve time across *several independent recipes* to produce one merged countdown. That gap is the differentiation, but it also means there's no existing UX pattern to copy wholesale; the merged-timeline view is a genuinely new interaction we have to design carefully. The flagged open item from the prior phase still stands and isn't resolved: we have not confirmed what Countertop or CueKeeper (workspace-adjacent, plausibly kitchen/timing apps) actually do, so uniqueness against them is still assumed, not verified.

**Platform-specific opportunities.** The strongest native-iOS fit is Live Activities/Dynamic Island — a glanceable, always-visible current-step-and-countdown view that doesn't require unlocking the phone, which directly answers the "messy hands, phone locked" use context. Complementary opportunities: StandBy mode turning a charging iPhone into a kitchen countdown display, haptic pulses at step transitions so a step change can be felt/heard without looking, and Siri/Shortcuts support for "what's next" queries. Apple Watch is explicitly out of scope for v1 per the non-goals, but it's a natural post-MVP extension of the same Live Activity data.

**Major assumptions and risks.**
1. Assumption: manual entry (no recipe import/OCR) is acceptable friction because the trigger occasion (a big multi-dish meal) is high-stakes enough that a host will invest a few minutes of setup — this is unverified and is the biggest adoption risk if wrong.
2. Risk: local notification delivery is not guaranteed exact-second under Low Power Mode, Focus, or system throttling — for an app whose entire promise is "everything lands together," a late or dropped alert is a visible, trust-breaking failure, not a minor bug. Live Activity is the mitigation, not a guarantee.
3. Risk: uniqueness collision with Countertop and/or CueKeeper remains unconfirmed — this is a hard blocking check before design commits to a direction.
4. Risk: scope pressure between the parent prompt's "production-ready" language and the child's "MVP build" mode could cause a later phase to quietly widen scope (contention modeling, recipe import, Watch app) instead of polishing the small surface — this needs active resistance, not just a one-time decision.

**Implications for the first build.** Ship a flat merge-and-sort backward planner (no resource-contention modeling), manual dish/step entry, one global serve time, persisted plan state that survives force-quit, local notifications paired with a Live Activity for lock-screen visibility, and a single manual "push the whole remaining plan back N minutes" affordance for when the host falls behind — no auto-replanning or conflict resolution. Promise copy must say "merges into one countdown," not "detects conflicts." Freemium boundary: free tier caps active plans/dishes at a small number sufficient to prove value on a weeknight meal; paid unlocks unlimited dishes plus saved/reusable meal templates (the once-a-year Thanksgiving plan is genuine recurring value, not a cosmetic gate). Before design locks a direction, confirm what Countertop and CueKeeper are and check the sibling Food & Drink app's direction.

## Portfolio Selection

CONSENSUS: YES

## Final Output

This is a single-app project, not a portfolio parent — the "generate 12 ideas, pick 6" decomposition already happened one level up in the batch-cat-a2 parent process, which assigned this child project exactly one app: backtimer. Re-running ideation/selection here would duplicate that work and risk contradicting what the portfolio already locked in, so this phase's job is just to confirm the assignment and record why no further split happens underneath it.

**Decision:**
- **Single-app vs. portfolio-parent:** Single app. No portfolio-json manifest is emitted — there's no fan-out to describe, since this project itself *is* one resolved fan-out target from the parent.
- **Selected app:** backtimer — Food & Drink — "Merges several recipes' active/passive time into one backward-planned countdown to a single serve time" — target user is the multi-dish host coordinating a meal — build=true.
- **Rejected alternatives:** none listed here; alternative selection was the parent portfolio's job, already closed.
- **Rationale:** The app fills a real, narrow, recurring pain point (backward-planning multiple dishes to one serve time, currently done in a host's head) with no direct existing solution, which is exactly the kind of scope this project should protect rather than dilute with recipe-import, Watch-app, or contention-detection features aimed at "looking" more production-ready.

**What must carry forward into design/architecture, unchanged:**
- Scope stays merge-and-sort (no oven/burner contention detection), per the earlier decisions.
- Entry UX must feel like a fast checklist, not a form — and the merged countdown payoff should be visible after just one dish is entered, not only after the whole plan is built, since a tedious entry flow will burn the one shot an occasion-driven app gets.
- Promise language stays honest: "merges into one countdown," never implying conflict/schedule detection the app doesn't do — onboarding should say this plainly rather than let users discover the boundary as a bug.

No disagreement to flag — only one substantive voice spoke this round (Codex and Gemini were both unavailable), but its reasoning is internally consistent, matches the phase playbook's acceptance checks (selected-app count matches the prompt's assignment, the app maps to one folder, no category silently collapsed), and doesn't conflict with anything decided in prompt_contract or product_research.

## Initial Discussion

Here's where the room landed after round one: Codex and Gemini both stayed unavailable, so it's just Claude's design-lead pass again — but it's a solid, complete pass that directly answers this phase's job (turn the prompt into one precise promise, name the user/job/loop/non-goals) and doesn't just restate the prior phases, it makes several concrete calls that were left open before. Nothing contradicts prompt_contract or product_research, and the acceptance checks (one-sentence explainability, buildable-in-one-pass scope, explicit non-goals) are all satisfied.

CONSENSUS: YES

## Final Output

**Product promise (one sentence):** Tell backtimer when you want to serve, list what you're cooking, and it hands you one merged countdown that tells you what to start next for every dish, at once. ("Merge into a countdown" — never "coordinate," "schedule," or "manage," since those imply resource-awareness the app doesn't do.)

**Primary user and scenario:** A host planning a multi-dish meal (holiday dinner, dinner party) who sits down once, calmly, the night before or morning-of to enter dishes — then hours later, mid-cook with messy hands and a locked phone, needs the app to be glanceable, not tappable. These are treated as two different modes of the same person, not one screen trying to serve both.

**Core loop:**
1. Set the target serve time first (the plan's anchor).
2. Add a dish: name + flat list of steps (label, duration, active/passive toggle) — no ingredients, no photos, nothing recipe-app-like.
3. As soon as one dish has one step, show the live merged countdown preview — this must happen after dish #1, not after "Generate."
4. Add more dishes; the merged timeline re-sorts live.
5. Start the plan — a real state transition. Once started, editing is locked or heavily restricted, because free editing mid-cook means silently re-scheduling every notification.
6. Live execution: current step huge and dominant, next step visibly secondary, a persistent "running late" button that shifts everything remaining, plus a way to mark a step done early.
7. Completion: an actual finished screen, not just zero on a clock.

**Hard scope boundaries (non-goals, reaffirmed and extended):** no recipe import/OCR, no resource-contention (oven/burner) modeling, no auto-replanning beyond the manual "push back N minutes," no Watch app/widgets/sharing in v1. Newly surfaced and decided this round: Dish and Plan must be separate data entities from day one (even though free tier won't expose a saved-dish library), so paid-tier template reuse doesn't require a data-model rewrite later.

**Measurable success criteria:**
- First-time user reaches a visible merged countdown preview in under 2 minutes with 2 dishes / 4 steps.
- A plan survives force-quit and device restart with zero data loss and notifications still correctly scheduled.
- The "running late" affordance is usable one-handed during execution with no detour through settings.
- All four UI states (empty/loading/success/error) exist independently for both the Plan Builder and the Live Countdown surfaces — including a defined error state for a silently-failed notification or lost background execution, which is the state most half-built apps skip.
- A new edge case is now explicitly called out for design to resolve, not defaulted away: if a step's required start time is already in the past when the plan is created (e.g., a 4-hour marinade for a 6pm serve time built at 3pm), the plan still saves, but that specific step is flagged loudly as already-late — an all-or-nothing "plan doesn't fit" rejection is too blunt for a multi-dish tool.

## Per App Product Brief

Here's where round one landed: with Codex still in cooldown and Gemini still unavailable, it's Claude's single pass again — but it's a thorough one that actually closes several things prior phases had been kicking down the road (pricing, the "start" confirmation gap, the DST/notification verification requirements) rather than just repeating the loop/scope/non-goals that were already locked in initial_discussion. There's no second voice to disagree with it, and nothing in it contradicts prompt_contract, product_research, or initial_discussion — it builds directly on top of them. The three "required, verifiable behavior" commitments on notifications/Live Activity/wall-clock state and the pricing model ($4.99/mo or $19.99/yr, free tier capped at 1 plan / 3 dishes / no templates) are concrete enough to hand to design without another ideation round. I'm calling this converged.

CONSENSUS: YES

## Final Output

**Target user and use case:** A host planning a multi-dish meal (holiday dinner, dinner party, or an ambitious weeknight two-dish push) who needs a roast, sides, and a dessert to all hit the table warm at the same time — work they currently do as backward math in their head or on a scrap of paper. Two modes of the same person: calm data entry the night before/morning-of, then a stressed, messy-handed, phone-locked execution window hours later.

**Core loop:** Set the serve time first (the anchor) → add a dish as a flat list of steps (label, duration, active/passive) → merged countdown preview appears live after just the first dish, re-sorting as more dishes are added → **Start**, gated by a hard confirmation sheet showing the full merged timeline one last time (not a soft tap), because starting locks editing and commits real scheduled notifications → live execution with the current step dominant, next step secondary, a persistent "running late" push-back affordance, and a way to mark a step done early → a genuine completion screen, not just zero on a clock.

**Paid value / subscription value:** Free tier: one active plan at a time, capped at 3 dishes, no saved templates — enough to prove the merge-into-one-countdown value on a real weeknight meal, not enough to run a holiday spread. Paid ($4.99/mo or $19.99/yr, priced like a seasonal one-time purchase because that's how this user actually thinks about it): unlimited dishes per plan, unlimited concurrent saved plans, and reusable Dish/Plan templates. The template library is the real subscription anchor — it turns last year's already-debugged Thanksgiving plan (turkey rest time, stuffing steps, timing that was stress-tested once) into a one-tap duplicate-and-adjust instead of a from-scratch re-entry, which is genuine compounding utility for a bursty, occasion-driven app rather than a cosmetic gate. To fight the obvious cancel-between-occasions risk, saved plans stay visible (grayed out, not deleted) after a lapse so resubscribing is a one-tap decision, not a rebuild.

**Competitive wedge:** Nothing on the App Store does backward multi-recipe merge into one countdown — generic multi-timer apps don't backward-plan from a serve time or structure per-dish steps, and recipe apps with per-recipe timers don't merge across recipes. The wedge is being the only app that answers "what do I start right now, across everything I'm cooking" as one ranked list — defended by explicitly refusing to grow ingredient lists, photos, or browsing, since the day this looks like a recipe app with a timer bolted on, it's competing on a field it can't win.

**Viral or niche growth angle:** Niche, word-of-mouth, not a referral mechanic — a guest sees a host calmly land five dishes at once, asks how, and the answer is the app name. That means the live-execution and completion screens need to be genuinely showable mid-cook and screenshot-worthy, even with no share sheet built in v1.

**Local-first and cloud-ready plan:** Plans, dishes, steps, and scheduled-notification state all persist locally (SwiftData) with zero network dependency — the app must fully work in airplane mode. Cloud-readiness is architected in now via UUID-based entity identity and a sync-friendly shape for the already-decided Dish/Plan separation, so a future paid "sync templates across devices" feature is additive, not a rewrite. Cloud sync itself stays explicitly out of v1.

**Reliability commitments carried into design/architecture as required, testable behavior (not aspirational):** every step transition gets both a local notification and a Live Activity update, with detection on next foreground of a force-ended Live Activity so the user sees "here's where things actually stand" rather than silent drift; the plan's source of truth is wall-clock target `Date`s computed once at start and re-derived from `Date()` on foreground/notification (never a live-only countdown timer), so force-quit/restart produce zero data loss; DST and midnight-crossing plans get an explicit test in build verification, not assumed correctness from `Date` math.

**Still open, not blocking this phase but flagged again for the fourth time:** the Countertop/CueKeeper uniqueness check has never actually been performed — design must treat this as step zero before locking visual direction.

## Next Steps Small

CONSENSUS: YES

## Final Output

Same story as every phase so far — Codex and Gemini couldn't join (cooldown/auth issues), so it's just Claude's single pass again. But that pass is a real, complete answer to what this phase needs, not a rehash of prior phases, so there's nothing to argue about and no reason to keep waiting on tools that aren't showing up.

Here's where it landed: the smallest slice that actually tests whether backtimer's core idea works isn't "build the whole MVP smaller" — it's the one path that produces the "oh, it just figured out my order" reaction with the least effort. That means: set a serve time, add exactly two dishes with two steps each, watch the merged list interleave live as you add the second dish, hit Start behind a hard confirmation sheet, live-execute with a dominant current step, one fixed "+10 min, running late" button, a Live Activity on the lock screen, and a real completion screen when the last step clears.

**Must-haves, no exceptions:** live re-sorting before Start (not after), the hard Start confirmation showing the full merged order, the Live Activity (this is the one item everyone agrees can't be cut — the whole premise is that this works with a locked phone and messy hands, and skipping it would mean testing a different, easier hypothesis), and an actual completion screen rather than a countdown hitting zero.

**Cut list for this slice specifically** (on top of what's already out of scope for the whole MVP): no saved templates or plan history, no adjustable late-button increment (one fixed value only), no mark-step-done-early, no multiple concurrent plans, no real IAP/paywall wiring (stub the tier check), no settings screen.

**One wrinkle worth keeping:** the two test dishes shouldn't both be tidy — one needs a passive step long enough that it's already overdue the moment the plan is created, specifically to force the "loudly flag this step as already-late" behavior (decided back in initial_discussion) to actually get exercised in the build, not just designed on paper.

**Validation criteria this slice has to clear:** a first-time user reaches the live merge re-sort in under two minutes with no explanation; force-quitting mid-countdown and relaunching shows the correct step with zero drift; locking the phone through a full step still delivers the Live Activity/notification without the user touching the app; and a past-due step at creation actually renders its late flag instead of silently accepting an impossible plan.

Important framing point: this isn't a throwaway prototype — it uses the real data model (Dish/Plan as separate entities), real SwiftData persistence, and real wall-clock Date scheduling. Only templates, multi-plan, IAP, and mark-done-early are deferred; everything else in the slice is production code that carries straight into the full build.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Same pattern as every phase before this one — Codex and Gemini both stayed unavailable, so it's a single Claude pass again. But this pass earns its keep: it's the first phase to actually stop deferring the Countertop/CueKeeper uniqueness check (it's been punted six times running) and it surfaces several concrete, previously-invisible gaps in the design rather than just repeating what's already locked. Nothing here contradicts any prior decision, and it hits everything this phase is supposed to produce — resolved requirements, edge cases, privacy/data implications, a risk register, and final assumptions — so there's no reason to spin a second round waiting on tools that clearly aren't showing up this session.

**Resolved requirements carried forward from this round:**
- The uniqueness check against Countertop/CueKeeper stops being "flag and defer" — it becomes a literal first action of the architecture phase, before any screen or asset is built, with a defensive fallback in the meantime: avoid generic "timer/countdown" framing in the name and marketing, and lean into "backward-planning from a serve time" as the distinguishing hook so the positioning survives even if one of those sibling apps turns out to be timer-adjacent.
- The Live Countdown screen's "one dominant current step" model was underspecified for the app's actual use case (several dishes genuinely in progress at once — a turkey resting while potatoes mash while gravy simmers). Resolved: the screen shows one dominant "next thing to start" plus a secondary, always-visible list of other steps currently in progress, so a passive step doesn't silently disappear from view once its start-notification has fired.
- Simultaneous step start times get a defined, deterministic tie-break: dish entry order as the secondary sort key.
- Notification scheduling is rolling/windowed (next ~16-20 steps scheduled at a time, rescheduled at start/foreground/each completion), not all-at-once, to stay under iOS's 64-pending-notification ceiling — this matters specifically because "unlimited dishes" is the paid tier, which is exactly where a 6+ dish holiday spread would blow past that limit.
- The "running late" push-back is specified precisely: it must shift every not-yet-started step's target time, the serve time itself, AND the end/notification time of any already-in-progress passive step — not just future starts — so an in-flight roast's "done" alert doesn't fire against the old schedule while everything else has moved.
- Post-start editing lock gets an actual answer instead of silence: you cannot edit existing steps/timing after Start (unchanged, protects notification integrity), but you can add a new forgotten dish, which merges only into the remaining timeline. If that's cut for MVP complexity, the fallback is that the Start confirmation screen must say so explicitly ("once started, you can't add more dishes") rather than leaving it undiscovered.
- Notification and Live Activity permissions are separate iOS toggles a user can deny independently; a real degraded-mode state is required (banner offered at the Start-confirmation screen, with a path to Settings) so a denied permission doesn't silently break the core "locked phone, messy hands" promise.

**Edge cases now on record:**
- Multiple genuinely-simultaneous in-progress steps across dishes (not a rare case — routine for this app).
- Two steps landing at the identical start time (tie-break resolved above).
- Plans running long enough (8-10 hours, e.g. a real Thanksgiving prep-to-serve span) to hit ActivityKit's ~8-hour automatic Live Activity expiration — named as an accepted limitation for very long plans, not silently hoped away.
- A forgotten dish discovered after Start has locked editing.
- An in-flight passive step's end-notification going stale relative to a "running late" shift.

**Data and privacy implications:** Everything stays local, single-device, no accounts, no analytics SDK — the entire privacy disclosure is "your dish and step names, kept on your device." No new privacy surface introduced this round; the only addition is making notification/Live Activity permission denial into a real, visible product state instead of a silent failure.

**Risk register:**
1. Uniqueness collision with Countertop/CueKeeper — unresolved for six phases; mitigated now by defensive naming/positioning, but the actual check is a hard gate on the architecture phase.
2. Live Activity's ~8-hour system cap colliding with realistically long holiday-scale plans — named limitation, communicated to the user, not hidden.
3. 64-pending-notification ceiling colliding with the "unlimited dishes" paid tier — mitigated by rolling/windowed scheduling as an architectural requirement.
4. Silent loss of the "everything lands together" promise if a permission is denied and no degraded-mode UI exists — mitigated by the new required banner/Settings path.
5. Trust-breaking inconsistency if "running late" only shifts future steps and ignores in-flight passive ones — resolved by the precise push-back spec above.

**Final assumptions locked coming out of this phase:** single timezone only, no travel/timezone-change handling; step start times are fixed absolute `Date`s computed once at plan creation, independent of each other, so marking a step done early never cascades into recomputing other steps; deterministic tie-break sort order for simultaneous steps; rolling/windowed notification scheduling; Live Activity's 8-hour cap is an accepted, communicated limitation for very long plans; post-start editing is locked except for the resolved add-a-forgotten-dish path (or, if that's dropped for MVP, an explicit statement of the limitation at Start confirmation).

No open disagreement to carry into another round — only one voice spoke, but it's internally consistent, resolves rather than restates prior open questions, and satisfies both acceptance checks for this phase (no major ambiguity left for design/architecture; every named risk has either a concrete mitigation or is explicitly accepted as a limitation).

## App Features

CONSENSUS: YES

## Final Output

Only Claude's pass showed up this round (Codex and Gemini are still unavailable), but it's a genuinely thorough MoSCoW cut, not a rehash — it takes the huge pile of decisions from six prior phases and actually sorts them into must/should/could/won't with checkable acceptance criteria, which is exactly this phase's job. Nothing in it contradicts anything locked earlier, so there's nothing to send back for another round.

**Where it landed:** 16 must-have features, each with a user story and a concrete, testable acceptance criterion:

1. Serve-time-first entry (blocks dish/step creation until set; live recompute on change)
2. Dish + flat step list entry, max 3 inputs per step, zero recipe-app fields
3. Live merged countdown preview after dish #1, re-sorting live, <2min for a first-timer with 2 dishes/4 steps
4. Deterministic tie-break for simultaneous step times (dish entry order), unit-tested
5. Past-due-step loud flagging at creation — plan still saves
6. Hard Start confirmation sheet showing full merged order, no side effects on dismiss
7. Post-start editing lock, with either the forgotten-dish escape hatch or explicit stated limitation on the confirmation screen
8. Live execution: dominant "next to start" + always-visible secondary in-progress list
9. Mark step done early, no cascading recompute
10. "Running late" push-back shifting future steps, serve time, AND in-flight passive step end-times
11. Notification + Live Activity pairing per step transition, with force-ended detection on foreground
12. Wall-clock Date-based scheduling surviving force-quit/restart with zero drift
13. Rolling/windowed notification scheduling (respecting the 64-pending ceiling)
14. Real completion screen
15. Permission-denial degraded mode (banner + Settings path at Start confirmation)
16. Real StoreKit paywall/entitlement (unlimited dishes + concurrent plans) with Restore Purchases — explicitly promoted from stub to must-have here, since this phase scores the full production build, not the validation slice
17. Accessibility + four UI states on both surfaces, including the "notification silently failed" error state
18. DST/midnight-crossing correctness as an explicit build-verification test case

**Should-haves** (real value, ship-without-them-first is fine): saved/reusable Dish & Plan templates, a minimal settings screen, grayed-out lapsed-plan visibility, haptic pulses at transitions, adjustable late-button increment.

**Could-haves** (genuinely optional, block nothing): StandBy-mode display, Siri/Shortcuts "what's next," richer completion-screen polish, multiple late-button increment choices.

**Won't-build** (closed off explicitly so it can't resurface as "missing" later): recipe import/OCR, resource-contention/conflict detection, auto-replanning beyond manual push-back, Watch app, widgets, sharing/export, cloud sync (architected-for only), multi-timezone/travel handling, any copy implying "coordinates/manages" resources.

**Named risk carried forward:** the must-have list is long (16 items) for an "MVP build" label — if time gets tight, the two lowest-blast-radius cuts are mark-done-early and the forgotten-dish escape hatch (both have clean fallback statements); notification reliability, the Start confirmation, and the real paywall are the three that must not be cut or half-built, since a broken version of any of those is worse than not shipping that piece.
