# crockwatch — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where round 1 actually lands: Codex and I aren't in conflict — I was pressure-testing and sharpening the same contract Codex laid out, not fighting it. Codex nailed the big framing call (this is an adaptive-pacing intelligence tool, not a timer app, and that's the one thing later phases can't lose), and I added the guardrails that keep that framing from becoming either scope creep or a support disaster: don't re-run the portfolio's "12 ideas, pick 6" process inside this child project (that already happened one level up — crockwatch is the output of that, not a new candidate pool), don't let "MVP" become an excuse to skip states/accessibility/persistence discipline, treat the fermentation-pace model as heuristic guidance only (never "done"/"safe" language), and treat multi-batch concurrency plus background-surviving notifications as hard, testable requirements rather than assumed side effects of "local-first."

Gemini didn't weigh in (CLI unavailable), so this is a two-voice convergence, but the two voices agree rather than split — nothing here is contested, it's additive.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (portfolio-level prompt plus the crockwatch app spec). For this child project, the operative instructions are "Build this app as a working local-first SwiftUI MVP" + the Selected App Spec; the Parent Portfolio Prompt is inherited context (uniqueness bar, monetization bar, production-readiness bar) — its "generate 12 ideas / pick 6 / category quotas / Jira-Notion backfill" instructions were already executed at the portfolio level and are not re-run here.

**Hard requirements:**
- Working local-first SwiftUI iPhone MVP; deterministic local state and persistence, no backend dependency.
- Core loop is an adaptive pace/check-window engine: each batch has a living model driven by ferment type, start conditions, user-entered ambient temperature changes, and prior taste-check outcomes, producing "check sooner / hold longer / likely window" guidance with confidence language the user can feel.
- Must genuinely support multiple concurrent batches with different temperature profiles and staggered starts — verified with at least 3–5 simultaneous batches, not just designed for one.
- Taste-check alerts must survive backgrounding/app-kill via real local notification scheduling — an in-app-only/foreground-only timer does not satisfy the promise.
- User can always override timing, log an off-schedule check, and continue manually — recommendations are guidance, never a locked countdown.
- Real persistence with stable data identity; state survives relaunch, device clock/timezone changes.
- Full state coverage per screen (empty/loading/success/error), accessibility, onboarding that explains the adaptive model without a manual, sensible defaults per common ferment type.
- Architected so cloud sync/collab could be layered on later without rewriting core models — but nothing in v1 requires a backend.
- Own project folder under `/Users/pchordia/Documents/iOS-App-Factory`; own product/design/architecture/implementation trail preserved, including why this app is distinct from the rest of the portfolio (especially from Countertop) and from prior workspace apps.

**Non-goals:**
- Not a general recipe app, social network, shopping list, smart-scale/IoT platform, or broad kitchen/pantry tracker.
- Not a food-safety certification tool — no claims of guaranteed safety, doneness, or pathogen detection; UI copy stays at "time to check," never "ready"/"safe."
- Not an exhaustive species-level fermentation encyclopedia.
- Not cloud-first or multi-user in v1; no account system required.
- No AR/LLM/ML gimmicks — only add if they sharpen adaptive guidance in a way the user directly feels.
- No re-running of portfolio-level idea generation, category quotas, or sibling-app uniqueness auditing inside this child project — that's already decided.

**Production-readiness definition:** a real shippable v1 where a user can create and manage several concurrent batches, log temperature/taste observations over time, get adaptive check guidance with visible confidence/assumptions, review batch history, and hit edge cases (zero batches, many batches, app killed/relaunched, notification permission denied, clock/timezone change, batch left past its window) without crashing, losing data, or silently failing — validated by actually running the app through those states, plus tests around the pacing logic and persistence. It does not require covering every ferment type on earth or shipping cloud sync.

**Monetization thesis:** free tier covers core multi-batch tracking and adaptive guidance; paid tier covers advanced analytics, unlimited history, reusable ferment profiles, richer/deeper adaptive modeling, and multi-location/cellar-level monitoring. Never paywall basic safety-adjacent logging; premium must be functional value, not cosmetic.

**Decision rules for later phases:**
1. If a feature doesn't improve adaptive tracking for concurrent home batches, it's probably out.
2. Reject choices that make the app more generic/broad at the expense of the adaptive-timing wedge.
3. Reject any workflow that assumes a fixed clock instead of temp-dependent variable timing.
4. Reject drift toward recipes, social features, or hardware/IoT dependency unless it directly strengthens the core loop.
5. Reject design choices that obscure state, confidence, or override control in favor of looking "clean."
6. MVP defines scope (what's built), not quality (how well it's built) — everything in scope must clear the full production-readiness bar above.
7. Any gap in the spec (supported ferment types, exact temp-to-time heuristics) must be written down explicitly as a named assumption in that phase's output, not silently baked in.
8. When "feels premium" conflicts with "the adaptive alert is correct and reliable," reliability wins.
9. If a later phase can't explain why this beats a reminder app plus a notes app, it hasn't met the bar.

## Initial Discussion

Both Codex and I converged hard on this one — there's no real fight here, just two people sharpening the same shape from different angles (Codex from the design/IA side, me from the QA/verification side).

**Where we agree:** the promise has to stay narrow and boring-sounding — this app answers one question per batch ("should I check this today?") by adjusting the check window as temperature and taste results come in, not by counting down a fixed number of days. The user is someone running several ferments at once in a real kitchen with drifting temperature, and the core loop is: create batch → get initial check-window estimate → log temp/taste observations as they happen → estimate shifts with visible confidence/reasoning → notification fires → user checks and logs outcome → loop continues or closes out. We both independently landed on nearly identical success criteria (5 concurrent batches tracked independently, state survives kill/relaunch, notification-denied doesn't fail silently, off-schedule logging actually moves future guidance, timezone change doesn't silently shift a window) — which is a good sign this isn't just two people restating the same brief, it's real convergence on what "done" looks like.

We also agree on the scope knife: nothing earns a place in v1 unless it changes what the check-window says or how confidently it says it. Photos, notes, history charts — fine as secondary screens, never allowed to compete with or delay the core loop. And nothing in the UI is allowed to imply "done" or "safe" — only "time to check."

**The one new detail, not yet contested:** I proposed naming a small explicit set of supported ferment types (vegetable/kraut-kimchi style, dough-based, one liquid ferment like kombucha or kefir) with everything else falling back to a generic heuristic, so "which ferment types do we support" doesn't stay vague into the build phase. Codex hasn't pushed back or built on this yet — it's additive, not a disagreement, but worth flagging as the one thing next round could sharpen further if anyone wants to.

Gemini's still unavailable, so this is a two-voice read, but the two voices aren't splitting on anything material.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** crockwatch tells a home fermenter when it's actually time to taste-check each of their active batches, by adjusting the check window as temperature and prior taste-check results come in — instead of running a fixed countdown.

**Primary user and scenario:** A home fermentation hobbyist running 3-5 ferments at once (e.g., kraut, kimchi, kombucha) started on different days, in a kitchen or basement with naturally drifting temperature. They open the app not to browse content but to answer one question per batch: check it today or not? Design and testing target the multi-batch scenario from the start — not a single-jar demo with concurrency bolted on later.

**Core loop:** Create a batch (ferment type, start date/time, optional starting temp) → app produces an initial check-window estimate → user logs ambient temperature changes and taste-check outcomes as they occur → the estimate recalculates (check sooner / hold longer / likely window) with visible confidence and reasoning → a local notification fires near the revised window → user checks, logs the outcome, and either closes the batch out or the loop continues. Every other screen (history, settings, onboarding) supports this loop; none of them compete with it.

**Hard scope boundaries:**
- No feature ships in v1 unless it changes what the check-window says or how confidently it says it — photos, free-text notes, and history charts are acceptable only as secondary, non-blocking screens.
- No recipes, social features, shopping lists, IoT/hardware integration, or fermentation encyclopedia breadth.
- No safety/doneness claims anywhere in copy — "time to check," never "ready" or "safe."
- No cloud sync or accounts in v1 (architecture may allow it later).
- Named assumption (per decision rule 7): v1 ships sensible defaults for a small explicit set of ferment types — vegetable/kraut-kimchi style, dough-based, and one liquid ferment (kombucha or milk kefir) — with everything else falling back to a generic heuristic curve. This is a placeholder scope decision for design/architecture to confirm or adjust, not a locked-in final list.

**Measurable success criteria (all must be observable by actually using the app, not asserted):**
1. A new user can start their first batch in under two minutes without instructions.
2. With 5 concurrent batches of different types and staggered start times, a user can tell from the home screen which one needs attention first in under five seconds, and each batch's notifications/state track independently with no cross-batch clobbering or delay.
3. Logging a temperature change or taste-check result visibly and immediately updates that batch's next recommended check.
4. Local notifications still fire correctly after the app is backgrounded or force-killed.
5. All batch data and history survive app relaunch and a device timezone/clock change without a check-window silently jumping.
6. Denying notification permission is handled visibly (the app tells the user their check windows won't be pushed to them) — it never crashes and never produces a batch that silently never alerts.
7. Every batch detail screen shows current window, last observation, next action, and manual override without scrolling or digging.

## Per App Product Brief

Both Codex and I landed on essentially the same shape here — no real fight, just convergence from slightly different angles (Codex from the operational/monetization mechanics side, me from the emotional-user-trust side).

**Where we agree completely:** the target user is a serious hobbyist with 3-5 batches in motion, not a beginner, not a commercial user. The core loop is unchanged from prior phases — start batch, get window, log observations, watch it recalculate with visible reasoning, get notified, log outcome, repeat/close. We both independently converged on the same monetization shape: free tier gives the *full honest core loop* (adaptive windows, real reasoning, manual override) but capped on scale (Codex framed it as "no dumbed-down free version," I put a number on it — cap at 3 concurrent batches / 30 days history), and paid unlocks unlimited batches/history plus something functionally deeper: reusable learned ferment profiles that tighten confidence bands based on a user's own repeated results, not just generic heuristics. Both of us are adamant that paid must never mean "the free version was artificially crippled" — it has to be additive depth, not gated honesty. We also agree the wedge is the same thing product phase already named: nobody else models fermentation timing as live and feedback-driven instead of a static countdown, and the niche growth channel is fermentation communities (r/fermentation etc.) sharing screenshots of visible reasoning ("moved 2 days earlier because kitchen ran hot") — utility-driven word of mouth, not manufactured virality. Local-first with UUID/event-sourced data model so cloud sync can bolt on later is agreed and consistent with the architecture guardrail already set in the contract phase.

**Nothing contested yet.** Codex named the biggest shared risk as "false precision" (the model must never look more certain than it is); I named the same risk from the flip side ("if the model's too crude, the 'it's learning me' feeling never shows up and it collapses into a countdown with extra steps"). Those are two faces of one risk, not a disagreement.

Gemini's still unavailable, so this is a two-voice read again, but the two voices are reinforcing, not splitting.

CONSENSUS: YES

## Final Output

**Target user & use case:** The serious home fermenter running 3-5 concurrent batches (kraut, kimchi, kombucha, sourdough, etc.) in a real, temperature-variable home environment — someone who has already been burned by a fixed-day countdown being wrong, and wants one fast, trustworthy daily answer: which batch needs checking now, and which can wait.

**Core loop:** Create batch (ferment style, vessel, start date/time, starting temp) → app gives an initial check window, not a fake exact date → user logs ambient temp changes and taste-check outcomes as they happen → window and confidence recalculate with plain-language reasoning shown on-screen ("kraut usually needs 5-7 days at 70°F; your kitchen's been running 74°F, so I'm moving your window to 4-6 days") → local notification fires near the revised window → user checks, logs outcome, batch closes or the loop continues. The home screen must rank all active batches by urgency/confidence at a glance — this is treated as a hard usability bar, not a nice-to-have.

**Paid value / subscription value:** Free tier = the full honest core loop (real adaptive windows, real visible reasoning, manual override, no dumbed-down guidance) capped at 3 concurrent batches and 30 days of history. Paid tier (~$3-4/mo or ~$25/yr) = unlimited concurrent batches, unlimited history, and reusable learned ferment profiles — the app tightens its confidence band for a specific recipe/vessel/location combo based on the user's own repeated outcomes, which is real personalization value, not a feature unlock disguised as a paywall. Hard rule carried forward: paid must never mean the free tier's guidance was secretly worse — only that paid users get more scale and deeper personalization of the same trustworthy model.

**Competitive wedge:** No competitor treats fermentation timing as a live, temperature-and-feedback-driven model — the alternatives are static countdowns, generic kitchen timers, or recipe apps with a bolted-on reminder. crockwatch's moat is the pacing engine itself plus its commitment to transparent reasoning and honest uncertainty (never claiming "safe," "done," or lab-grade accuracy) — that honesty is part of the differentiation, not a limitation.

**Viral/niche growth angle:** Fermentation hobbyist communities (r/fermentation, r/kimchi, fermentation forums) already trade notes on kitchen temperature quirks manually. Shareable, utility-driven artifacts — a clean snapshot of a finished batch's timeline (temp drift, check count, final process length) or a reusable ferment profile shared with another hobbyist — spread organically in that niche because they look like exactly the tool people are already improvising with spreadsheets and sticky notes. No social feed, no gamification bait.

**Local-first & cloud-ready plan:** All batch data, observations, the pace model, and notification scheduling live entirely on-device for v1 — zero account required, first batch loggable within two minutes of opening the app. Data model uses stable UUIDs and timestamped events (not array indices or current-state-only snapshots) from day one, so a future CloudKit/backend sync layer can be added as an additive adapter above local storage — the pacing engine and persistence layer are never rewritten to support it.

**Why it deserves to exist:** it has to beat "I just checked it because it felt like enough days had passed" — and it does that by making the reasoning behind each check-window visible and by getting visibly smarter about a specific user's specific kitchen and recipes over time, not by being a prettier timer.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Both voices are building the same house from different floors — Codex nailed down the product-level requirements that were still soft, and Claude(QA) found the specific technical trip-wires that would sink those requirements if left as "implementation details for later." Nothing here is contested; it's one team converging on a fuller spec.

**What's now resolved:**

- **Ferment coverage:** a small named starter set — vegetable ferments (kraut/kimchi), dough/sourdough, and one liquid ferment (kombucha) — plus a generic custom profile for everything else, which is explicitly flagged to the user as lower-confidence. This confirms and locks the placeholder from the product-brief phase.
- **Logging surface, kept deliberately narrow:** only two observation types in v1 — ambient condition updates and taste-check outcomes. Nothing else gets added to the core loop.
- **Explainability bar:** every recommendation must be sayable in one on-screen sentence, or the app doesn't get to make it.
- **Edge-case set, now fairly complete:** no notification permission → visible "manual watch" state; passed-window-with-no-check → an "overdue" state that stays honest, not alarmist; no temperature data for a while → confidence visibly degrades instead of holding steady; off-schedule checks immediately affect future guidance; timezone/DST/clock changes must never silently shift a window; duplicate/same-day batches must never collide in notifications or history; deleting a batch cancels its pending notification; notification permission getting revoked mid-life (not just at onboarding) must be re-checked on foreground and reflected in the UI.
- **New, concrete engineering constraints from this round that architecture must treat as binding, not optional:**
  1. iOS caps an app at 64 pending local notifications total — so the design must be one pending notification per batch at a time, identified by batch UUID, always cancel-before-reschedule on every recalculation. "Overdue" is carried by home-screen urgency ranking, not a second stacked notification.
  2. All elapsed-time math must be computed from absolute timestamps (epoch/`Date` diffing), never calendar-day counting — otherwise DST and timezone changes will silently shift windows, which is a success criterion this app is explicitly required to pass.
  3. Subscription downgrades may restrict visibility/editability of over-cap batches or aged-out history (archive/read-only), but must never delete underlying data — protecting the "state survives" guarantee already locked earlier.
  4. The paid "learned ferment profile" feature needs a minimum sample-size floor (3+ completed batches of the same recipe/vessel/location) before it's allowed to present a tightened, personalized confidence band — below that threshold it visibly says it's still learning and falls back to the generic curve. This closes the same false-precision risk the product brief flagged, but applied specifically to the premium personalization feature, where it hadn't been addressed yet.
- **Privacy:** stays fully on-device, no account, no analytics SDK, no location/health inference. One acknowledged minor exposure: lock-screen notification previews will show batch/ferment names to anyone glancing at a locked phone — worth a one-line note, not a blocker. The only place data ever intentionally leaves the device is an explicit, user-triggered share-sheet action for batch snapshots — never automatic, never bundled into analytics.

**Nothing is left open or contested for design/architecture to inherit as ambiguity** — the two rounds of discussion converted every soft spot (ferment breadth, logging scope, notification math, downgrade behavior, personalization overfitting) into either a resolved rule or an explicit named assumption. Gemini remains unavailable, so this is a two-voice convergence, but the voices are reinforcing rather than splitting, and the acceptance checks for this phase (no major ambiguity remains, risks have concrete mitigations) are met.

## App Features

CONSENSUS: YES

They actually closed all four open points this round, and it wasn't just Claude asserting them — Codex came in and changed his own cut to match on the two that mattered most. Codex agreed the free/paid cap enforcement has to be a must-have (not should-have), specifically because "archive vs. not-yet-built" isn't a spectrum — either the cap is enforced without deleting data, or there's no monetization mechanism at all, which fails the portfolio's hard monetization requirement outright. He also agreed the learned ferment profile should come out of must-have scope for the same reason Claude gave (its own precondition makes it unverifiable in one build cycle), while keeping the door open by requiring the event-sourced data model to support it later for free. Both of them independently landed on demoting the shareable snapshot to could-have, and Codex went further than Claude on widgets/Live Activities, explicitly calling widget a "won't-build for v1" (not just could-have) and agreeing Live Activities has no place in a check-window product that's explicitly trying to escape fake countdown precision. Claude's closing proposal folds all of that in cleanly, plus one genuinely new and useful addition nobody had named yet: splitting the free-cap behavior into two distinct, separately-tested triggers — blocking new batch creation at the cap with a paywall prompt (never auto-archiving a live, still-fermenting batch) versus archiving inactive overflow on downgrade. Nothing in Claude's final list contradicts anything Codex said this round, and Codex's own message already pre-agreed to the substance of it.

## Final Output

**Must-have (in scope for build, each needs the acceptance criteria below):**

1. **Multi-batch home screen with urgency ranking** — as a fermenter running several batches, I can open the app and immediately see which needs attention first. AC: with 5 active batches across different ferment families, the home screen sorts by actionable urgency; each row shows name, ferment type, check-window state, confidence, next action; overdue/manual-watch/no-data states are visually distinct; works at zero batches too.

2. **Batch creation (named ferment set + generic custom)** — as a user starting a ferment, I can create a batch fast with sensible defaults. AC: kraut/kimchi, sourdough/dough, kombucha, or generic-custom batch created in under two minutes (stopwatch-verified); each gets an initial window and visible confidence; generic-custom is clearly labeled lower-confidence.

3. **Adaptive check-window engine with one-sentence reasoning** — as a user, I see not just when to check but why. AC: every active batch shows current window, confidence, one-sentence explanation; new observations recalculate immediately; copy never says "safe"/"ready" — only "time to check"/"hold"/"check sooner" language.

4. **Observation logging (ambient temp + taste-check only)** — as a user, I log only the two things that change the recommendation. AC: both types supported per batch; off-schedule checks allowed; every logged observation updates history and future guidance; fast enough for a few taps.

5. **Real local notifications, one pending per batch** — as a user, I'm still prompted when the app is closed. AC: scheduled per batch UUID; rescheduling always cancels the prior pending notification first; permission-denied state surfaced clearly and re-checked on every foreground (not just onboarding); deleting a batch removes its pending notification; killing the app after scheduling and cold-launching still fires the alert.

6. **Batch detail screen** — as a user, I understand one batch's status without digging. AC: shows window, confidence, reasoning, last observation, next action, notification status, manual override — no scrolling maze.

7. **Local persistence, stable identity, absolute-timestamp math** — as a user, I don't lose ferments or history on relaunch or timezone change. AC: batches/observations/notification metadata survive relaunch; same-day duplicate batches never collide; forced device timezone/DST change mid-batch does not shift the displayed window (tested on-device, not just unit-tested math); deleting one batch never touches another; logging on batch 3 never changes batch 1's window or notification (multi-batch isolation test, run explicitly).

8. **State handling / degraded-mode UX** — as a user, I'm never left guessing. AC: empty, success, permission-denied/manual-watch, overdue, and low-confidence/stale-data states are all explicitly designed; notifications-unavailable still leaves the app fully usable as a manual tracker with a visible warning.

9. **Lightweight onboarding** — as a first-time user, I understand this gives check guidance, not certification, without a manual. AC: first run explains adaptive windows, confidence, and notification permission in plain language; skippable; batch creation reachable immediately after.

10. **Free/paid cap enforcement (archive-not-delete)** — as a user, downgrading or hitting a plan limit never destroys my data. AC: free tier = 3 active batches / 30 days editable history (locked from the product brief); two distinct, separately-tested behaviors: (a) attempting to create a 4th active batch while on free tier **blocks creation with a paywall/upgrade prompt** and never auto-archives a live, still-fermenting batch; (b) downgrading past the cap **archives** the inactive overflow batches/aged-out history as read-only-but-visible, never deleted, with a clear "archived due to plan limit" label and read-only detail view.

**Should-have:**
- Closed-batch history/timeline review.
- Reusable presets for user-created batch setups.
- Learned ferment profile: personalization computation and its UI are deferred out of v1, but the event-sourced data model must support deriving it later without a rewrite — non-negotiable now, free given the timestamped-events decision already made.

**Could-have (ship only if they fall out cheaply near the end):**
- Shareable finished-batch snapshot (share-sheet export).
- Home-screen widget (explicitly not planned for — would require a shared App Group container, a real architecture decision, not an afternoon add-on).
- Free-text notes on observations, batch photos, basic trend chart, extra vessel metadata.

**Won't-build:**
- Recipes, encyclopedia content, or starter guides beyond onboarding.
- Social feed/comments/likes/profiles.
- Sensor/IoT integrations.
- Accounts, sync, or cloud backup.
- "Safe"/"done"/certification-style claims.
- Deep analytics dashboards that don't change check guidance.
- Broad support beyond the named ferment set plus generic custom.
- Live Activities (explicitly ruled out — wrong fit for a check-window product, adds ActivityKit lifecycle/staleness edge cases nobody asked for).
- Fancy StoreKit edges (promotional offers, family sharing) — basic purchase/restore is in must-have #10, the rest is not.
- LLM/AR/ML bonus features — nothing proposed sharpens the check-window in a way the user would feel.

**Guardrail carried into build:** the home screen and batch detail answer "what should I check next, and why" first, archive/history second. Any feature that mainly helps a user admire or document a ferment after the fact loses to anything that helps them decide what to check next under uncertainty.
