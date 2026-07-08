# nickel — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round 2 fixed the one gap the quality gate flagged, and there's no actual disagreement to resolve — Codex was a no-show again, but Claude caught its own round-1 blind spot (treating the portfolio-level rules as background instead of hard contract terms) and patched it cleanly. The two additions are concrete: standalone folder/project location as a hard requirement, and a falsifiable uniqueness check against the named list plus the sibling apps in this same batch, instead of a vague "distinct from the workspace" gesture. Everything else from round 1 — the five named assumptions and the production-readiness bar — stands unchallenged.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved in full — Nickel, a local-first SwiftUI MVP personal-finance app, one of 5 apps in the multi-app-exp7 portfolio. App concept is locked; not open for re-litigation later.

**Hard requirements:**
- SwiftData for all entries on-device; no bank-linking, ever, in v1.
- Log a spend in 3 taps / under 5 seconds: amount, one-tap category, optional receipt photo.
- Browse spend history by category and by week.
- Weekly "money weather" recap card via `ImageRenderer`, shareable via `ShareLink`.
- WidgetKit week-to-date spend widget, backed by a real App Group container.
- Soft weekly spending targets per category.
- CSV export and import.
- Nickel+ paywall via StoreKit 2 at $3.99/mo or $24.99/yr; free tier fully usable, not a trial.
- Repository-protocol boundary so CloudKit sync and bank-import can be added later without UI/domain rewrites.
- Warm editorial paper-and-ink design system (cream, burnt-orange, serif numerals, paper grain, weather iconography).
- Full empty/loading/success/error states on every screen.
- **New:** Built as its own standalone folder and Xcode project at `/Users/pchordia/Documents/iOS-App-Factory/nickel/` — no shared workspace, package, or folder with any of the other 4 portfolio apps.

**Named assumptions (decision rules, state explicitly when applied):**
1. CSV import is additive-only, dedupes, previews before committing; malformed files error visibly, never silently dropped.
2. App Group is mandatory for the widget; it must show a real stale/empty state, never a silently-stale zero.
3. Recap card shows an honest "not enough data yet" state on thin weeks rather than fabricating a weather reading.
4. Free tier ships ~8–10 fixed default categories, no custom tags — Nickel+ unlocks unlimited categories/tags.
5. Single currency, device locale by default.

**Non-goals:**
- No bank/Plaid linking, no OCR receipt parsing in v1, no actual CloudKit sync implementation, no multi-currency/multi-account.
- No re-opening the concept choice.
- **New:** "Looks distinct" is not sufficient proof of uniqueness on its own — any later uniqueness check must be run explicitly against the named list in the original prompt (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, plus the ~50-app prior batch) **and** against whatever the other 4 apps in this same multi-app-exp7 batch turn out to be, since a same-batch collision (e.g. two finance apps) would be worse than colliding with something built months ago.

**Production-readiness definition:** Compiling in `app_build` is the floor. The real bar: zero-data states handled everywhere without crashing or lying, malformed CSV rejected with a visible error, StoreKit wired to a testable local `.storekit` config, and the widget verified end-to-end reading live App Group data — any part of that not confirmable must be reported as a limitation, not marked done.

## Product Research

CONSENSUS: YES

## Final Output

Codex is still in cooldown, so this is Claude's solo research pass — but it's thorough enough to stand on its own without a second voice manufacturing false disagreement.

**Audience and use context:** The spec's "students, young professionals, paycheck-to-paycheck" framing is broad, but the real daily user is narrower — someone financially anxious but avoidant, who already bounced off Mint/YNAB/Copilot/Rocket Money at the bank-linking or categorization step. The true competitive set isn't other finance apps, it's Notes app, a pile of receipts, or nothing at all. That reframes the success bar: not "better than YNAB" but "better than doing nothing," which is easy to clear on day one and easy to lose by week three once logging fatigue sets in.

**Comparables:** Mint (dead but the reference point everyone compares to), Rocket Money, Copilot, YNAB — all auto-import-first, treating manual entry as an afterthought (full-screen forms, merchant search, mandatory sub-categorization). Nickel's whole bet is inverting that, so manual entry needs to feel like tapping a stopwatch lap button, not filling out a form. Also worth learning from: BeReal/Marco Polo-style auto-generated recap cards as a growth loop — proven mechanic, but those run on passively-flowing data (photos, location). Nickel's card is only as good as what got manually logged, so it has to degrade honestly on thin weeks or the share loop undermines the trust it's selling.

**Platform-specific opportunities:** The spec under-scopes this. The real fast path isn't the app icon — it's an interactive Lock Screen widget or Control Center control backed by an `AppIntent`, or a Siri/Shortcuts quick-log action that logs "$12, Food" without even opening the app. This isn't a nice-to-have: the contract's own invalidation criteria says sub-2-entries/week means "needs Shortcuts/Siri quick-log" — that's a known failure mode stated up front, so it's worth building the interactive quick-log path (or at minimum designing for it) in v1 rather than discovering the drop-off later.

**Major risks/assumptions:**
1. Honesty-vs-engagement tension — a "sunny" card for a week with two logged coffees and nothing else is technically true but functionally misleading; the weather algorithm needs to treat "days with zero logged entries" as distinct from "days with zero spending," or the card stops being trustworthy and the share loop dies.
2. App Group/widget silent half-failure — the single most likely thing to compile fine, show a static preview, and never actually read the shared container, with no automated test catching it. Needs an explicit manual verification step (log an entry, background the app, confirm the widget updates), not just "widget target added to project."
3. StoreKit paywall dark patterns — the free-tier category cap is already a named assumption; add that the paywall needs a genuine no-friction "not now" path, since a finance app that feels manipulative about money is a worse trust failure than in most other categories.

**Implications for the first build:** Protect the 3-tap log flow and SwiftData model above everything else — recap card, widget, CSV, and paywall are all downstream of that data being correct. Better to ship the interactive quick-log widget/App Intent as a stubbed deep-link into the log sheet than to have full scope with a sluggish core loop or flaky App Group wiring. The recap card's "not enough data" state and the CSV malformed-file error state aren't polish — they're the two states most likely to get skipped under time pressure and most likely to be the first thing a real user hits, so both should be verified by hand before this app is called done, not just confirmed present in code.

## Portfolio Selection

CONSENSUS: YES

## Final Output

This one's simple: Nickel is a single-app build, not a portfolio-parent phase. The 5-way portfolio split already happened one level up, in the multi-app-exp7 parent conversation — this conversation only ever had one selected app slug ("nickel") handed to it, and nothing in the prompt asks this phase to pick multiple apps or split further. So there's no portfolio-json manifest to emit here; that artifact belongs to the parent orchestration, not to this child project's phase history.

Claude's round-1 take (Codex still in cooldown, no second voice, but nothing here is contentious) locks in the product boundary the build phase will work from: the log-spend flow is sacred — numeric keypad on launch, one row of tappable category icons, save = dismiss, no intermediate screens — and depth belongs on the browsing/trends/targets side, never in the capture path. Success is framed around week-3 retention (per the spec's own sub-2-entries/week invalidation tripwire), not paywall conversion, which means the widget and any quick-log affordance count as retention infrastructure, not decoration.

**Decision record for this phase:**
- Single-app decision: yes, this is a standalone child build, not a portfolio parent.
- No child projects, no portfolio-json manifest — not applicable at this level.
- Selected app: Nickel — Personal Finance / Spending Awareness — "See where your money actually went this week without linking a single bank account" — target user: financially anxious, bank-linking-averse, budgeting-app dropouts — build flag: true.
- Selection rationale: already resolved upstream (parent portfolio selection); this phase's job was confirming scope, not re-picking. No rejected alternatives to record at this level.
- App boundary carried forward untouched from the locked prompt contract — nothing added, nothing quietly dropped.

Acceptance checks are satisfied: the app count (1) matches what this phase was actually handed, it maps to exactly one folder (`/Users/pchordia/Documents/iOS-App-Factory/nickel/`), and no category got collapsed since there was only ever one category here.

## Initial Discussion

CONSENSUS: YES

## Final Output

Codex is still in cooldown, so this is another solo pass — but the take is decisive and internally consistent, and it builds cleanly on what prompt_contract, product_research, and portfolio_selection already locked, so there's no reason to manufacture a second round just to wait for a voice that isn't showing up.

**One-sentence product promise:** Nickel lets you log a spend in three taps and see an honest picture of where your money went this week, without ever asking for your bank login.

**Primary user and scenario:** Someone financially anxious but bank-linking-averse, who has already bounced off Mint/YNAB/Copilot-style apps. The critical scenario isn't the calm Sunday-night review — it's the four seconds right after a purchase (at the register, in the car, mid-checkout online), because if logging waits for "later," later never comes. The recap card belongs to the Sunday-night context; the log flow belongs to the checkout-line context, and those two contexts get designed differently on purpose.

**Core loop:** Open app or tap widget → numeric keypad already focused, no intermediate menu → type amount → tap one category icon from a single visible row → sheet dismisses itself, no separate save button. Photo attach is optional and off to the side, never blocking or interrupting the critical path with a permission prompt. Everything else — category/week browsing, soft targets, the weather recap card, CSV — is the slower, more reflective "second loop" that can afford real screens and states.

**Hard scope boundaries (beyond what's already contractually locked):** no merchant name field, no required notes, no sub-category/tag hierarchy on the free tier, no multi-step "confirm your entry" screen. Any future proposal to add "just one field" to the log flow is scope creep against the core promise, not a neutral addition. Richness (streaks, save animations, encouragement) is allowed only in the post-log moment or the weekly review — never inside the log gesture itself.

**Measurable success criteria:** median time from opening the log sheet to dismissal under 5 seconds; recap card shows three visually distinct states (0 entries, 1–2 "thin week" honest not-enough-data state, 3+ real weather reading) rather than ever fabricating a reading; widget reflects a new entry within one app-background cycle, confirmed by hand; CSV export→import round-trip produces zero duplicate or lost entries.

**States called out as easy to underweight:** true first-launch zero-data state (empty categories should teach the log gesture, not just say "no data"), the mid-week partial-logging state (logged days must look visually distinct from confirmed-zero-spend days — the same honesty risk flagged in product_research), and the "logged once weeks ago, gone quiet" state, which is realistically the most common state this app will be in and needs its own re-engagement design rather than just a stale widget.

**Open tension named, not resolved away:** keeping capture "dumb and fast" risks the app feeling too thin to justify the $24.99/yr tier. The resolution on record is that all the substance goes into the browsing/trends/targets side, never into the capture gesture — but this is flagged as a deliberate tradeoff so a later phase under time pressure doesn't quietly "fix" it by adding friction to logging.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Codex stayed in cooldown for this phase too, so it's another solo pass from Claude — but it directly answers every required element from the phase playbook (target user/use case, paid value, subscription value, core loop, competitive wedge, growth angle, local-first/cloud-ready plan) and doesn't contradict anything locked in prompt_contract, product_research, portfolio_selection, or initial_discussion. It sharpens rather than re-opens those decisions, so there's nothing here that needs a second voice to resolve.

**Target user & use case:** Someone who has actively rejected a bank-linking budgeting app before, and whose real problem isn't "manage a budget" but "stop the low-grade dread of not knowing." Success is a $6 coffee logged without thinking, three weeks running — not a complete ledger.

**Paid value / subscription value:** Free tier is a genuinely complete spend-logger forever — unlimited entries, ~9 default categories, the weekly recap card, CSV export. Nickel+ ($3.99/mo, $24.99/yr) buys scale and depth on data the user already owns: unlimited custom categories/tags, multi-month trend charts, CSV import, and the live week-to-date widget. The widget is the sharpest wedge — it's retention infrastructure, so gating it behind the subscription targets people who've already proven they log regularly, not new users who haven't decided to trust the app yet. Paywall trigger is behavioral (surfaced after a real second week of 3+ entries, or on the widget's locked state), not a day-one nag.

**Core loop:** tap widget or app icon → keypad already focused → type amount → tap one category glyph from a single row → done, no confirmation screen. All design budget goes into that category row and the recap card — the two moments someone actually looks at the screen.

**Competitive wedge:** No-bank-linking is real but invisible — nobody screenshots an absence. The thing that actually has to carry retention and virality is the recap card, which is why the three-state honesty rule (0 entries / thin week / real week) is load-bearing, not a nice-to-have — a fake-looking "sunny" card sent to a friend during a silent week kills the loop before it starts.

**Growth angle:** Deliberately niche, not mass-viral — ShareLink on the recap card is the only growth lever in v1. No referral program, no leaderboard, because a competitive/social layer would contradict the app's private, judgment-free positioning. Named explicitly as a smaller bet than a leaderboard-style mechanic, on purpose.

**Local-first / cloud-ready:** Everything in SwiftData on-device, no account creation, no login screen anywhere — and that absence should be verified as an absence, not just an unbuilt feature. The repository-protocol boundary gets a concrete acceptance test: a future CloudKit implementation must be addable as one new type conforming to the existing protocol, with zero View/ViewModel changes — if that's not literally true at the end of the build, the boundary isn't real.

**New commitment this round (not previously locked):** v1 ships with a real Siri/Shortcuts App Intent for zero-tap logging ("log $12 lunch"), not just a stubbed deep-link — because the contract's own invalidation criteria already names this as the predicted failure mode, and building the write path now (while the SwiftData model is still being designed) is cheap compared to retrofitting it later. If a later phase decides this is too much for v1, that has to be an explicit, named cut, not a silent drop.

**Verification requirements baked into the brief, not deferred to QA:** widget update checked by hand (log entry → background app → confirm widget updates); CSV round-trip checked by hand (export → delete test entry → import → confirm exact restoration, no duplicates); recap card thin-week state checked by hand (log one entry, confirm no fabricated weather reading). These are treated as done-criteria, not polish.

## Next Steps Small

CONSENSUS: YES

## Final Output

Codex is still in cooldown (third phase in a row it's been a no-show), so this is Claude's solo pass again — but it's a clean, decisive answer to what this phase actually asks for, and it doesn't quietly re-cut anything that prompt_contract or per_app_product_brief already locked in. Worth flagging in the transcript, though: three straight phases with only one voice in the room is a real gap, not just a formality — someone should check why Codex keeps being unavailable if that pattern continues into the build phase.

**The core call:** this phase isn't about shrinking Nickel's v1 scope — everything in the locked build scope (App Intent, CSV, widget, StoreKit) still has to ship by the time the app is called done. What this phase decides is *build order*: which slice gets built and hand-verified first, before time is spent on anything else, so that if time runs short later, what's already solid is the part that actually proves the concept.

**MVP slice:** the complete loop from logging a spend through to a shared recap card — SwiftData model → 3-tap log flow → week view → weekly recap card with its three-state honesty rule → ShareLink. This is the one loop that tests both halves of the bet: is logging fast enough to survive real use, and is the recap card good enough that someone would actually send it. Nothing else matters if either of those fails.

**Must-have interactions in that first slice:** keypad auto-focused on launch/tap, no intermediate screen; single row of category glyphs, one tap both selects and dismisses (no separate save button); week view where logged days are visually distinct from unlogged days (not just present eventually — true even in this smallest slice); recap card renders three genuinely distinct states (0 / thin-week / real-week), not stubs; ShareLink produces a real ImageRenderer-generated image, not a placeholder.

**One nuance worth locking in:** the App Intent's underlying write path (the SwiftData insert logic) should be designed alongside the core model now, even though the Shortcuts/Siri-facing surface itself comes later — because per_app_product_brief already flagged that retrofitting that write path later is the expensive way to do it.

**Cut list (deferred to next wave, not cut from the contract):** CSV import, the widget's full App Group wiring/polish, the Shortcuts/Siri-facing surface of the App Intent, soft weekly targets, and the StoreKit paywall UI (though entitlement-gating logic — what checks "is this user Nickel+" — should be designed in early so it's not bolted on).

**Validation criteria, meant to be done by hand, not inferred from code existing:** cold-run log-sheet-to-dismiss under 5 seconds; week view visibly distinguishes logged vs. unlogged days across at least two days; recap card generates three actually different renders at 0/1/5+ entries; a real ShareLink share produces a legible, on-brand image. Any failure here is a stop-and-fix before touching widget/CSV/paywall.

This satisfies the phase's required output (MVP slice, must-have interactions, cut list, validation criteria) and both acceptance checks — it's buildable without further product debate, and it names one complete end-to-end workflow.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Codex is still out (fourth phase running with just one voice), but the solo pass this round is thorough and doesn't contradict anything locked upstream — it just fills in the edge-case/risk gaps that earlier phases left open, which is exactly this phase's job. Nothing here reopens the concept, the scope, or the build-order decision from next_steps_small.

**Resolved requirements (new decision rules added this phase):**
- Logged entries are editable and deletable after the fact from the week view. This isn't optional polish — the whole "no confirmation screen" design only works ethically if a fat-fingered $1000-instead-of-$10 entry can be fixed afterward.
- Save is disabled (or simply unreachable) on a zero-amount entry — a $0 "spend" doesn't get logged, since it would corrupt the recap card's honesty math.
- Each entry snapshots its date/week-of-year at log time using the device's calendar/locale at that instant, baked into the record — not recomputed later from a raw UTC timestamp. This prevents entries from silently reshuffling between weeks after a timezone change.
- "This week" follows `Calendar.current.firstWeekday` (locale-aware start-of-week), not a hardcoded Sunday or Monday.
- Nickel+ downgrade path: entries logged against custom categories keep their real category label forever, visibly (greyed out / read-only if needed) — never silently reassigned to a fallback "Other" bucket. Only the *creation* of new custom categories is gated, not the display of historical ones.
- Receipt photos are copied into app storage (sandbox or shared App Group container) at `PhotosPicker` selection time, not referenced by asset identifier — so a later Photos permission change can't orphan them.
- Soft weekly targets are visual-only, no local notifications — consistent with the no-nag, no-dark-pattern stance already set for the paywall.
- CSV dedupe on import keys off a stable exported UUID/ID column, not a date+amount+category heuristic, so two legitimately identical same-day purchases don't get wrongly collapsed.

**Edge cases enumerated:**
- Zero-amount entry, fat-finger amount typos with no confirmation step, decimal input on comma-separator locales.
- Entry logged at 11:58pm crossing midnight, or logged while traveling across time zones.
- Widget added to the home screen before the app has ever been opened / before the App Group store has initialized — must read as a distinct "container doesn't exist yet" state, not collapse into the same blank state as "zero entries logged."
- Nickel+ subscription lapsing after custom categories and entries already exist against them.

**Data and privacy implications:**
- No cloud sync by design means a lost/stolen/reset device is unrecoverable data loss — this needs to be named as an accepted, explicit limitation, with a lightweight mitigating nudge (periodic "back up your data" prompt pointing at CSV export, ideally to Files/iCloud Drive rather than only an ephemeral share sheet).
- CSV export is plaintext financial data leaving the sandbox the moment it's shared — the share flow should make clear what's in the file rather than exporting silently.
- Receipt photos must be durably copied in, not referenced, to survive Photos-permission changes.

**Risk register:**
1. App Group first-run-before-first-open race — widget could show a silently-stale zero instead of a real "not initialized yet" state. Mitigation: explicit state check distinguishing "no container" from "container, zero entries."
2. Irreversible fat-finger entries under a no-confirmation design. Mitigation: mandatory edit/delete affordance on every logged entry.
3. Timezone/week-boundary drift silently reshuffling historical entries between weeks. Mitigation: snapshot date/week at log time, don't recompute live.
4. Silent category reassignment on subscription downgrade, which would repeat the same "don't lie about logged spend" violation the contract already prohibits elsewhere. Mitigation: keep original category label, gate only creation of new ones.
5. Total, permanent data loss with no cloud backup. Named as an accepted limitation, mitigated only by a CSV-export nudge, not eliminated.
6. CSV dedupe heuristics wrongly merging legitimate duplicate purchases. Mitigation: dedupe on a stable ID column, not a content heuristic.

**Final assumptions (added this phase, on top of the five already locked in prompt_contract):**
6. Logged entries are always editable/deletable post-save.
7. Week boundaries use locale-aware `firstWeekday`, snapshotted per entry at log time.
8. Downgraded Nickel+ users retain visibility of their original custom category labels on old entries, permanently.
9. Soft targets are visual-only; no push/local notifications anywhere in v1.
10. Data loss on device loss with no backup is an accepted, explicitly named limitation — not something to silently solve or silently ignore.

This satisfies the phase's required output (resolved requirements, edge cases, data/privacy implications, risk register, final assumptions) and both acceptance checks — no remaining ambiguity blocks design/architecture, and every named risk now has either a concrete mitigation or is explicitly logged as an accepted limitation.

## App Features

CONSENSUS: YES

## Final Output

Codex was a no-show again (fifth phase running solo), but there's nothing contentious here to hash out with a second voice anyway — this is Claude doing the actual job of this phase: drawing a real MoSCoW line through the pile of features already locked across five prior phases, rather than just rubber-stamping all of it as "must-have."

**Must-have (the app doesn't deliver its promise without these — each with acceptance criteria):**

1. **3-tap log flow, keypad auto-focused, zero intermediate screens.** *Story:* as an anxious spender, I log a purchase before I lose the urge to. *AC:* cold-run tap-to-saved-entry in under 5 seconds, no rehearsal.
2. **Zero-amount entries blocked.** *AC:* a $0 entry cannot be saved, full stop.
3. **Every entry editable/deletable after the fact from week view.** *AC:* tapping a logged entry opens edit/delete; changes persist and immediately update recap totals. Non-negotiable because the "no confirmation screen" design is only fair to the user if mistakes are fixable.
4. **Week/category browsing with logged-vs-unlogged days visually distinct.** *AC:* a week with entries on two non-adjacent days shows exactly those two as "logged," the other five as "no entry" (never implying "confirmed zero spend").
5. **Recap card + ShareLink, three honest states.** *AC:* renders visibly different cards at 0 / 1–2 / 3+ entries; a single $4 entry must never produce a "great week" reading; ShareLink produces a real `ImageRenderer` image that opens correctly in the share sheet.
6. **Widget, three-state verified by hand.** *AC:* no-container-yet, container-with-zero-entries, and real week-to-date data must all be visually distinct — collapsing the first two is a fail.
7. **StoreKit paywall with genuine "not now" path.** *AC:* dismissible with no forced interstitial; gates only new custom-category *creation*, never hides existing custom-category entries after a downgrade.
8. **App Intent write path (SwiftData insert), even if Siri-facing UX isn't polished yet.** *AC:* a minimal `AppIntent` can log a fixed test case correctly categorized and dated — proves the write path, not the voice UX.
9. **CSV export.** *AC:* export → delete a test entry → reimport → entry restored exactly, no duplicates.
10. **CSV import with visible error on malformed files, UUID-keyed dedupe.** *AC:* malformed file always produces a specific visible error, never a silent partial import; dedupe never collapses two legitimately identical same-day entries.

**Should-have (real, locked features — valuable but the app still tells the truth and works without them if time runs short):** soft weekly targets (visual-only, no notifications), unlimited custom categories/tags for Nickel+, multi-month trend charts, the "back up your data" CSV nudge, and a richer CSV-import preview/diff UI beyond the bare error/dedupe bar.

**Could-have (first things cut under time pressure, non-load-bearing):** receipt photo attach via PhotosPicker, streak indicators, a Live Activity widget variant, extra haptics/animation polish beyond baseline delight.

**Won't-build (restating locked exclusions so nothing sneaks back in under a new name):** bank/Plaid linking, Vision OCR receipt parsing, actual working CloudKit sync (protocol boundary only), multi-currency/multi-account, merchant-name field, mandatory notes, any multi-step confirmation screen, push/local notifications tied to targets, and any referral/leaderboard/social layer.

**Named risk, on the record:** pushing soft targets and custom categories to "should" means if the build runs out of time and skips them, the app satisfies "smallest correct MVP" but not the letter of prompt_contract's hard-requirements list (which does include targets and unlimited categories under Nickel+). That's judged the right trade — a smaller, fully-correct app beats a feature-complete one with silent bugs — but if either ends up missing from the final build, it must be reported explicitly as a limitation against the locked contract, not silently passed as done.

This satisfies the phase's required output (must-have list with AC, should/could list, won't-build list) and both acceptance checks — every must-have supports the core promise, and this is a build the MVP phase can actually complete without silent corner-cutting.
