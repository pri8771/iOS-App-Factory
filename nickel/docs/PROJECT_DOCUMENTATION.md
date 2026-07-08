# nickel — Project Documentation

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

## Design Discussion

CONSENSUS: YES

## Final Output

Codex is still out (sixth phase running solo), but the round-1 pass is thorough, concrete, and doesn't contradict anything locked in the five prior phases — it just turns those decisions into an actual screen map, which is this phase's job. Nothing here reopens the core loop, the honesty rules, or the must-have list.

**Navigation model:** No conventional tab bar as primary chrome. The app opens straight into **Week** (home). A persistent, bottom-center, burnt-orange circular log button is reachable from every screen and is deliberately the single most visually dominant element in the app — if any browsing/history screen ever outshines it, that's a regression against the core thesis. Four other destinations reachable via a minimal icon row: **History** (week list and category browsing unified behind a segmented toggle, since it's one dataset sliced two ways), **Recap** (money-weather card + ShareLink), **Settings** (categories, targets, CSV export/import, Nickel+, and a visible entry point for the logging Shortcut/App Intent), plus modal/sheet-presented **Log Sheet**, **Entry Detail/Edit**, **Category Detail**, **Targets**, **Categories Management**, **Paywall**, **CSV Import Preview**, and a one-screen **Onboarding**.

**Screen inventory:** Week (home), Log Sheet (modal), Entry Detail/Edit, History (week + category toggle), Category Detail, Recap Card, Targets, Categories Management, Settings, Paywall (sheet, never full-screen-forced), CSV Import Preview (dedupe/error states), Onboarding (single screen, kinesthetic — drops the user into an empty Week with the log button pulsing once instead of a carousel).

**Primary flow:** cold launch → onboarding (first time only) → Week (empty, log button pulses) → tap → sheet rises, keypad focused → type amount → tap category glyph → sheet self-dismisses with a settle animation on that day's card → later, History (by week or by category) → edit/delete any entry inline → Sunday, Recap renders the card live from stored data → ShareLink produces a real rendered PNG. Paywall only appears when a genuinely gated action is tapped (10th category, widget config, custom tag), always with a real "Not Now" that returns the user exactly where they were.

**State model per screen (highlights):** Week has four states — true first-launch, thin-week (majority real-world state, dashed-outline unlogged days must look intentional not broken), fully-logged, and a new "gone quiet >10 days" state with a warm non-modal banner (addresses the re-engagement gap detailed_discussion flagged). Log Sheet: idle-typing vs. blocked-save (inert, not an error toast, on $0/blank). Recap Card: the three locked states (0/thin/real) plus a fourth — rendering on demand for any past week from stored data, not just the current live week. Widget: the three locked states, plus tapping it in any state deep-links straight to the Log Sheet. CSV Import: idle/file-picked/parsing/preview-with-counts/error-malformed/success, with human-readable (not generic) error reasons. Entry Detail: delete gets one confirmation tap — the one deliberate exception to "no confirmation screens," since delete is the one truly hard-to-reverse action.

**Visual direction:** cream paper background everywhere including sheets; burnt-orange as the single accent (log button, active/selected states) and nowhere else, so it stays meaningful; serif numerals for money amounts only (chrome/labels stay sans, so the serif marks "this is a fact"); subtle paper-grain on backgrounds only, never behind text/cards; custom single-weight ink-line category glyphs matching the recap card's weather iconography (explicitly not SF Symbols, to avoid the two most-used surfaces clashing); motion minimal and settling, with the sheet-dismiss-on-save spring as the one deliberate moment of flourish.

**Accessibility notes:** real 44pt+ hit targets on log button and category glyphs regardless of drawn artwork size; VoiceOver must announce logged-vs-unlogged days as distinct states ("Tuesday, logged, $12.40, Food" vs. "Wednesday, no entry") since that distinction carries real product meaning, not decoration; burnt-orange-on-cream needs an explicit WCAG AA contrast check before lock, likely requiring a deepened text/icon variant separate from the lighter fill tint; Dynamic Type must be tested specifically on the Log Sheet's keypad + category row, with the row wrapping to a second line at accessibility sizes rather than shrinking below tap-target minimums.

**Named risk (not resolved away):** merging category- and week-browsing into one History screen behind a segmented toggle keeps navigation simple but risks "browse by category" (a locked core workflow) going undiscovered if the toggle isn't obvious — mitigated by requiring it to be a large, labeled segmented control at the top of History, not a small icon; flagged for revisit if usability testing later shows it's being missed.

This satisfies the phase's required output (screen inventory, primary flow, state model per screen, visual direction, accessibility notes) and both acceptance checks — a SwiftUI developer can build the view hierarchy directly from this, and every locked workflow (log, browse by week/category, recap+share, targets, CSV import/export) has an explicit screen/state path.

## Design Handoff

CONSENSUS: YES

## Final Output

Codex is still out (seventh phase running solo), but there's nothing to negotiate here anyway — this round did the actual job the phase calls for: turning design_discussion's screen map into token values, component contracts, and state-machine detail a SwiftUI builder can work from directly, without contradicting anything locked in the six prior phases.

**Design tokens:**
- Color: `paperCream` (~#F7F1E6) as base background, with a genuine dark-mode counterpart (deep warm charcoal ~#221E1A, not an inverted system gray) so the paper-and-ink metaphor survives mode switching. Burnt-orange ships as two tokens — `accentFill` (~#D97A3F, large fill areas like the log button) and `accentText` (~#B85C1F or darker, anything sitting as text/small icon on cream) — because the earlier WCAG risk flagged in design_discussion needs a real measured 4.5:1 contrast check before lock, not an eyeballed one. `inkPrimary`/`inkMuted` for text and the dashed-outline unlogged-day treatment; a soft muted red-brown (not stock system red) for delete/error states.
- Type: serif (New York, Semibold/Bold — free, no bundling issue) reserved exclusively for money amounts at three sizes (display/large/small); everything else stays system sans via default Dynamic Type text styles. Hard rule for the builder: serif-for-money-only is a token violation if broken either direction.
- Layout: 8pt grid, one consistent 16pt corner radius across cards/rows/recap card, 20-24pt safe margins everywhere. Paper-grain is one reusable background-layer modifier, explicitly never on cards or behind text.

**Component inventory:** LogButton, CategoryGlyph (shape-based, not bitmap, so it scales cleanly across Dynamic Type/dark mode), MoneyText (single wrapper enforcing the serif+token rule everywhere), DayCard (one component with a state enum for logged/unlogged, not two views, so the honesty distinction can't drift), EntryRow, WeatherIcon, RecapCardView, SoftTargetBar, PaywallSheet, ImportPreviewTable.

**Two architectural calls that go beyond visuals, both directly answering risks named in earlier phases:**
1. RecapCardView fed to `ImageRenderer` must be a plain value-type view driven by a pre-computed `RecapCardData` struct, never the live `@Query`-bound on-screen view — otherwise the shareable card render is flaky/sometimes-blank depending on SwiftData fetch timing, and this same struct is what makes "render any past week on demand" trivial for free.
2. The widget's three states become an explicit three-case enum (`.uninitialized`, `.empty(weekStart:)`, `.data(RecapCardData)`) that the TimelineProvider switches over explicitly — turning the "collapsing states = fail" acceptance criteria from app_features into something enforceable in code review, not just a screenshot check.

**Other interaction/state notes locked this phase:** a single `AppRoute`/sheet-destination enum owned near the app root (not scattered `@State` booleans) so the widget-tap-to-Log-Sheet deep link works reliably from any screen or cold launch; keypad focus driven via `.onAppear`, not `.task`, to avoid a visible keyboard-pop-in delay on the app's single most important interaction; the category row's accessibility-size wrapped-to-two-rows layout is a real designed state, not an implementation afterthought; recap/trend calculations live in the repository/service layer as pure functions, not recomputed inline on every view redraw; StoreKit entitlement-unknown defaults to free-tier, never a blocking spinner.

**Claude Design decision:** explicit no-external-design. design_discussion already produced a decision-complete screen map and visual system; this phase supplied the token values and component/state contracts a SwiftUI builder needs. Running an external visual-design pass now would risk producing polish disconnected from the data-flow constraints just locked (especially the RecapCardView value-type requirement, which a pure visual tool would have no way to know about or respect).

This satisfies the phase's required output (screen specs inherited + extended, design tokens, component inventory, state/interaction notes, accessibility requirements, explicit no-external-design decision) and both acceptance checks — a SwiftUI builder can implement directly from this handoff plus design_discussion, and nothing here depends on a hidden decision still waiting to be made.

## Ios Architecture Review

CONSENSUS: YES

Codex is still out — that's eight phases running solo now, worth flagging plainly rather than quietly absorbing, since a decision this technical (SwiftData/CloudKit schema constraints, App Group wiring) really benefits from a second reviewer and hasn't gotten one. That said, the single pass this round is rigorous, catches a real latent contract violation nobody had named yet, and doesn't contradict anything locked across the seven prior phases — so there's nothing here to argue about, just a lot to lock down.

## Final Output

**SwiftUI architecture recommendation:** Plain MV, not MVVM — `@Query` in views already gives observation, so a hand-rolled ViewModel layer per screen is pure overhead at this app's scale. Real logic (week-boundary math, the weather algorithm, CSV parse/dedupe, StoreKit entitlement checks) lives in plain Swift services behind the repository protocol, injected via environment, unit-testable independent of SwiftUI. Three build targets: main app, widget extension, and a local source-only Swift package holding the shared model layer (`@Model` types, repository protocol, `RecapCardData`) so app and widget share one source of truth and the "CloudKit-ready domain model" claim is checkable by inspecting one package. Sheet/navigation state centralizes in one `AppRoute` enum near the app root (locked in design_handoff) so the widget-tap deep link works from any screen or cold launch.

**New hard requirement this phase (the one real gap found):** the SwiftData schema must be built CloudKit-compatible from day one, even though CloudKit sync itself isn't in v1 — every attribute Optional-or-defaulted, every relationship Optional-with-inverse, **no `@Attribute(.unique)` anywhere**. CSV dedupe on the stable UUID must be an application-level check against a fetched set, not a database uniqueness constraint. Skipping this because "CloudKit isn't v1" would make the repository-protocol boundary a boundary in name only — a promise that quietly breaks the day someone tries to cash it in. Cheap to do now, expensive to discover later.

**Apple framework choices, all first-party:** SwiftData (persistence), WidgetKit (widget), StoreKit 2 with a `.storekit` config file checked into the repo and wired into the Xcode scheme (an actual file + scheme reference, not just API calls), App Intents (quick-log write path), ImageRenderer (recap card), PhotosPicker/PhotosUI (receipt photos), Charts (Nickel+ trends). No ML/AR — none is load-bearing per the original spec, correctly kept out.

**Persistence and local data plan:** One `ModelContainer` with a shared App Group `ModelConfiguration`, same schema version read by app and widget. App Group identifier and schema get frozen now, with `SchemaMigrationPlan` scaffolding from day one even at schema-version-1, since a post-ship schema change against an already-deployed widget is exactly the silent-failure class this project keeps flagging. Every SwiftData write triggers `WidgetCenter.shared.reloadTimelines(ofKind:)` immediately, so "log entry → background app → widget updates" has an actual mechanism instead of hoping WidgetKit's refresh budget cooperates. Receipt photos copy into the App Group container's filesystem (already locked); widget extension needs the identical App Group entitlement checkbox as the main app — easy to forget since it's added after the main target, worth a manual check.

**Permissions/privacy plan:** PhotosPicker exclusively for receipt photos — it runs out-of-process with zero permission prompt, so `PHPhotoLibrary.requestAuthorization` must never be reached for and no `NSPhotoLibraryUsageDescription` key should exist. Beyond that, **zero permissions of any kind** — no location, contacts, notifications, camera/microphone, no network usage description (no network client exists). This absence is a real feature of the app and should be verified by hand at the end of the build (Info.plist inspected for zero stray permission keys), not just assumed true.

**Dependency/license decision:** Zero third-party SPM packages. Every requirement has a first-party answer — CSV parsing is a hand-rolled splitter, trends use Charts. Stated flatly so nothing gets added later under time pressure.

**Testing implications:** Pure-function unit tests (in-memory `ModelContainer`) for week-boundary calc across `firstWeekday` locales, the weather algorithm at 0/thin/real boundaries, CSV parse/dedupe/malformed detection, entitlement-to-free-tier fallback. StoreKit tested via `StoreKitTest`/`SKTestSession` against the checked-in `.storekit` config, not just eyeballed in simulator. Widget's three-state logic extracted into a plain testable function plus `#Preview` fixtures for all three states. XCUITest coverage targets exactly the things prior phases demanded hand-verification for (cold-launch-to-save timing, edit/delete round-trip, CSV export-delete-reimport with zero duplicates) so those stay true after future changes, not just true on ship day.

Both acceptance checks pass: the architecture has no vague gaps (target split, data flow, state ownership are all concrete), there's no ML/AR/LLM use to justify since none is claimed, and the zero-dependency decision trivially satisfies the permissive-license policy.

## Tech Specs

CONSENSUS: YES

## Final Output

Codex stayed in cooldown for this phase too (ninth phase running solo), but there's nothing left to negotiate — this round took everything locked across the prior architecture-focused phases (MV pattern, three targets, CloudKit-safe schema, value-type `RecapCardData`, three-state widget enum, `AppRoute`-centralized navigation) and turned it into an actual module layout and concrete type contract, which is exactly this phase's job. The one genuine addition — making the weather algorithm relative to the user's own trailing baseline rather than a fixed dollar threshold, with an explicit `.insufficientHistory` degrade state — sharpens the product without contradicting anything upstream, and it comes with its own honesty safeguard (same "don't fabricate a reading" principle already applied to entry-count, now applied to history-depth too).

**Architecture overview:** Plain MV — `@Query` in views supplies observation directly, so no ViewModel layer. All real logic (week math, weather algorithm, CSV parse/dedupe, StoreKit entitlement) lives in plain Swift services behind a single `SpendRepository` protocol, injected via environment. This protocol is the literal seam the future-CloudKit/bank-import promise rests on — every View and the App Intent call through it, never touch `ModelContext` directly.

**File/module layout:** Three targets, one shared local package.
- `NickelKit` (source-only local Swift package): `@Model` types, `SpendRepository` protocol + `SwiftDataSpendRepository`, pure-function services (`WeekCalculator`, `WeatherAlgorithm`, `CSVService`), `RecapCardData`, `WidgetState`, `AppRoute`. Both app and widget depend on this and only this for shared logic, so the "domain model is untouched by CloudKit" claim is checkable by inspecting one package.
- `NickelApp`: SwiftUI views/components, `LogSpendIntent`/`NickelShortcuts`, the `.storekit` config, App Group + StoreKit entitlements.
- `NickelWidget`: widget extension, depends only on `NickelKit`, never reaches into `NickelApp`.

**Data models (CloudKit-safe from day one, per the architecture review):** `SpendEntry` (optional `category` relationship with inverse, `weekOfYear`/`weekYear` snapshotted at insert via locale-aware `WeekCalculator`, never recomputed live), `Category` (inverse `entries` relationship, `isCustom` flag for the free-tier cap), `WeeklyTarget` (visual-only, no notification wiring anywhere in the type). No `@Attribute(.unique)` anywhere — CSV/import dedupe is an application-level `Set<UUID>` check against fetched entries inside the repository, never a database constraint.

**Persistence strategy:** One `ModelContainer` on a shared App Group `ModelConfiguration`, opened identically by `NickelApp` and `NickelWidget` against the same schema version, with `SchemaMigrationPlan` scaffolding present from schema-version-1. Every mutating repository call ends with `WidgetCenter.shared.reloadTimelines(ofKind:)`. Widget's `SpendWidgetProvider` wraps the App Group store-open in an explicit `do/catch` (never `try?`) so `.uninitialized` can't collapse into `.empty`. Receipt photos and CSV files stay inside the App Group container's filesystem, consistent with earlier phases.

**Testing strategy:** Pure-function unit tests (in-memory `ModelContainer`) for `WeekCalculator` across `firstWeekday` locales, `WeatherAlgorithm` at the notEnoughData/insufficientHistory/real-reading boundaries, `CSVService` parse/dedupe/malformed-file detection, and `EntitlementStore`'s fallback-to-free-tier behavior. StoreKit exercised via `StoreKitTest`/`SKTestSession` against the checked-in `.storekit` config. `SpendWidgetProvider`'s state-selection logic isolated into a plain testable function plus `#Preview` fixtures for all three `WidgetState` cases. XCUITest coverage targets the specific behaviors prior phases demanded hand-verification for: cold-launch-to-saved-entry timing, edit/delete round-trip, CSV export→delete→reimport with zero duplicates.

**Named risk, carried forward explicitly:** the trailing-baseline weather algorithm is more surface for a subtle bug (e.g., a divide-by-zero on an empty prior-weeks array) than a hardcoded threshold would be — mitigated by the `.insufficientHistory` case being a hard, non-overridable fallback below 2 comparable prior weeks, same as the existing `.notEnoughData` rule below 3 entries.

Both acceptance checks pass: the interfaces-json contract below gives parallel build lanes a single shared type/signature surface to code against (no incompatible types possible), and the spec names concretely how the app gets built (module layout, data flow through the repository protocol) and verified (unit tests, StoreKitTest, XCUITest, plus the hand-verification steps carried from earlier phases).

```interfaces-json
{"interfaces": [
{"name": "SpendEntry", "kind": "struct", "language": "swift", "signature": "@Model final class SpendEntry { var id: UUID; var amount: Decimal; var category: Category?; var loggedDate: Date; var weekOfYear: Int; var weekYear: Int; var note: String?; var receiptPhotoRelativePath: String?; var createdAt: Date }", "owning_lane": "data_domain", "notes": "No @Attribute(.unique). weekOfYear/weekYear snapshotted at insert via WeekCalculator, never recomputed live. category relationship optional with inverse for CloudKit compatibility."},
{"name": "Category", "kind": "struct", "language": "swift", "signature": "@Model final class Category { var id: UUID; var name: String; var glyphName: String; var sortOrder: Int; var isCustom: Bool; var createdAt: Date; @Relationship(inverse: \\SpendEntry.category) var entries: [SpendEntry]? }", "owning_lane": "data_domain", "notes": "Free tier ships ~9 fixed non-custom categories seeded on first launch."},
{"name": "WeeklyTarget", "kind": "struct", "language": "swift", "signature": "@Model final class WeeklyTarget { var id: UUID; var category: Category?; var amountLimit: Decimal; var isActive: Bool }", "owning_lane": "data_domain", "notes": "Visual-only, no notification scheduling anywhere in the type or its consumers."},
{"name": "SpendRepository", "kind": "protocol", "language": "swift", "signature": "protocol SpendRepository { func fetchEntries(weekStart: Date) async throws -> [SpendEntry]; func fetchEntries(categoryID: UUID) async throws -> [SpendEntry]; func addEntry(amount: Decimal, categoryID: UUID, date: Date, receiptPhotoPath: String?) async throws -> SpendEntry; func updateEntry(id: UUID, amount: Decimal, categoryID: UUID) async throws; func deleteEntry(id: UUID) async throws; func fetchCategories() async throws -> [Category]; func addCategory(name: String, glyphName: String) async throws -> Category; func recapData(weekStart: Date) async throws -> RecapCardData; func importCSV(data: Data) async throws -> CSVImportResult; func exportCSV() async throws -> Data }", "owning_lane": "data_domain", "notes": "The whole future-CloudKit/bank-import promise depends on every View/App-Intent call site going through this protocol, never ModelContext directly."},
{"name": "SwiftDataSpendRepository", "kind": "struct", "language": "swift", "signature": "final class SwiftDataSpendRepository: SpendRepository { init(modelContainer: ModelContainer) }", "owning_lane": "data_domain", "notes": "Only concrete implementation in v1. CSV dedupe is an application-level Set<UUID> check against fetched entries, never a DB uniqueness constraint."},
{"name": "RecapCardData", "kind": "struct", "language": "swift", "signature": "struct RecapCardData: Equatable, Codable { let weekStart: Date; let weekEnd: Date; let totalAmount: Decimal; let entryCount: Int; let categoryBreakdown: [CategoryTotal]; let weatherReading: WeatherReading; let generatedAt: Date }", "owning_lane": "data_domain", "notes": "Plain value type only, zero @Query/@Environment dependency, so it can feed both the on-screen Recap view and the ImageRenderer export identically."},
{"name": "CategoryTotal", "kind": "struct", "language": "swift", "signature": "struct CategoryTotal: Equatable, Codable { let categoryID: UUID; let categoryName: String; let glyphName: String; let amount: Decimal }", "owning_lane": "data_domain", "notes": "Element type inside RecapCardData.categoryBreakdown."},
{"name": "WeatherReading", "kind": "enum", "language": "swift", "signature": "enum WeatherReading: Equatable, Codable { case notEnoughData; case insufficientHistory(totalAmount: Decimal, entryCount: Int); case sunny(totalAmount: Decimal); case cloudy(totalAmount: Decimal); case stormy(totalAmount: Decimal) }", "owning_lane": "data_domain", "notes": "notEnoughData when entryCount < 3 regardless of amount. insufficientHistory when entryCount >= 3 but fewer than 2 comparable prior weeks exist to baseline against — shows total only, no relative claim."},
{"name": "WidgetState", "kind": "enum", "language": "swift", "signature": "enum WidgetState { case uninitialized; case empty(weekStart: Date); case data(RecapCardData) }", "owning_lane": "data_domain", "notes": "TimelineProvider must switch exhaustively over this; .uninitialized only reachable via a thrown/caught store-open error, never a fallback from try?."},
{"name": "WeekCalculator", "kind": "function", "language": "swift", "signature": "enum WeekCalculator { static func weekBounds(containing date: Date, calendar: Calendar) -> (start: Date, end: Date); static func weekOfYear(for date: Date, calendar: Calendar) -> (week: Int, year: Int) }", "owning_lane": "services_utilities", "notes": "Must respect calendar.firstWeekday (locale-aware), not hardcode Sunday/Monday. Pure function, unit-tested across locales."},
{"name": "WeatherAlgorithm", "kind": "function", "language": "swift", "signature": "enum WeatherAlgorithm { static func reading(for currentWeek: (totalAmount: Decimal, entryCount: Int), priorWeeks: [RecapCardData]) -> WeatherReading }", "owning_lane": "services_utilities", "notes": "Baseline is trailing average of prior logged weeks, not a fixed dollar threshold. Degrades to .insufficientHistory below 2 comparable prior weeks."},
{"name": "CSVService", "kind": "function", "language": "swift", "signature": "enum CSVService { static func parse(data: Data) -> Result<CSVParseResult, CSVImportError>; static func serialize(entries: [SpendEntry], categories: [Category]) -> Data }", "owning_lane": "services_utilities", "notes": "Hand-rolled parser, no third-party dependency. Export includes a stable UUID column used for import dedupe."},
{"name": "CSVParseResult", "kind": "struct", "language": "swift", "signature": "struct CSVParseResult { let newEntries: [ParsedCSVEntry]; let duplicateCount: Int; let totalRowCount: Int }", "owning_lane": "polish_resilience", "notes": "Feeds the CSV Import Preview screen's counts UI."},
{"name": "ParsedCSVEntry", "kind": "struct", "language": "swift", "signature": "struct ParsedCSVEntry: Identifiable { let id: UUID; let amount: Decimal; let categoryName: String; let date: Date }", "owning_lane": "polish_resilience", "notes": "Row-level parsed record shown in the import preview table before commit."},
{"name": "CSVImportError", "kind": "enum", "language": "swift", "signature": "enum CSVImportError: Error, LocalizedError { case emptyFile; case missingRequiredColumn(String); case malformedRow(line: Int, reason: String); case unreadableEncoding }", "owning_lane": "polish_resilience", "notes": "Every case must produce a specific human-readable errorDescription, never a generic 'import failed'."},
{"name": "CSVImportResult", "kind": "struct", "language": "swift", "signature": "struct CSVImportResult { let importedCount: Int; let skippedDuplicateCount: Int }", "owning_lane": "data_domain", "notes": "Returned by SpendRepository.importCSV after commit; feeds a post-import confirmation summary."},
{"name": "EntitlementStore", "kind": "struct", "language": "swift", "signature": "@Observable final class EntitlementStore { private(set) var isPlusActive: Bool; func refresh() async; func purchase(_ product: Product) async throws; func restore() async throws }", "owning_lane": "services_utilities", "notes": "Defaults isPlusActive = false on any unknown/unreachable entitlement state; never blocks UI with a spinner."},
{"name": "AppRoute", "kind": "enum", "language": "swift", "signature": "enum AppRoute: Identifiable { case logSheet(prefill: LogPrefill?); case entryDetail(UUID); case categoryDetail(UUID); case paywall(trigger: PaywallTrigger); case csvImportPreview(CSVParseResult) }", "owning_lane": "primary_ui", "notes": "Single router owns this; driven identically by in-app taps, widget deep link URL, and App Intent completion."},
{"name": "LogPrefill", "kind": "struct", "language": "swift", "signature": "struct LogPrefill { let amount: Decimal?; let categoryID: UUID? }", "owning_lane": "primary_ui", "notes": "Used when a deep link arrives with partial data pre-filled."},
{"name": "PaywallTrigger", "kind": "enum", "language": "swift", "signature": "enum PaywallTrigger { case newCategoryLimit; case widgetConfig; case customTag; case trendCharts }", "owning_lane": "primary_ui", "notes": "Determines paywall copy context; every trigger must resolve to a dismissible sheet with a working Not Now."},
{"name": "RecapCardView", "kind": "struct", "language": "swift", "signature": "struct RecapCardView: View { let data: RecapCardData; init(data: RecapCardData) }", "owning_lane": "primary_ui", "notes": "Plain value-driven View, zero @Query/@Environment access, safe to feed directly into ImageRenderer for both on-screen display and ShareLink export."},
{"name": "DayCard", "kind": "struct", "language": "swift", "signature": "struct DayCard: View { enum State { case logged(entries: [SpendEntry]); case noEntry }; let date: Date; let state: State }", "owning_lane": "primary_ui", "notes": "Single component with a state enum, not two views, so the logged-vs-no-entry honesty distinction can't drift out of sync."},
{"name": "MoneyText", "kind": "struct", "language": "swift", "signature": "struct MoneyText: View { enum Size { case display, large, small }; let amount: Decimal; let size: Size }", "owning_lane": "primary_ui", "notes": "Only sanctioned way to render a dollar amount; always applies serif token, never used for non-money numbers."},
{"name": "LogSpendIntent", "kind": "struct", "language": "swift", "signature": "struct LogSpendIntent: AppIntent { static var title: LocalizedStringResource; @Parameter var amount: Double; @Parameter var category: CategoryEntity; func perform() async throws -> some IntentResult }", "owning_lane": "services_utilities", "notes": "Calls SpendRepository.addEntry directly; proves the write path independent of Siri-facing phrasing polish."},
{"name": "CategoryEntity", "kind": "struct", "language": "swift", "signature": "struct CategoryEntity: AppEntity { var id: UUID; var name: String; static var typeDisplayRepresentation: TypeDisplayRepresentation; static var defaultQuery: CategoryEntityQuery }", "owning_lane": "services_utilities", "notes": "AppEntity wrapper resolving Category rows for Shortcuts/Siri parameter selection."},
{"name": "SpendWidgetProvider", "kind": "struct", "language": "swift", "signature": "struct SpendWidgetProvider: TimelineProvider { func placeholder(in: Context) -> WidgetState; func getSnapshot(in: Context, completion: @escaping (WidgetState) -> Void); func getTimeline(in: Context, completion: @escaping (Timeline<WidgetState>) -> Void) }", "owning_lane": "polish_resilience", "notes": "Store-open wrapped in explicit do/catch; must never let try? collapse .uninitialized into .empty."}
]}
```

## Project Plan

CONSENSUS: YES

## Final Output

Codex is out again (tenth phase running solo now — flagged explicitly in the transcript as a real gap for a plan this technical, not just a formality), but the single pass this round does the actual job: it doesn't just restate tech_specs as a milestone list, it surfaces three concrete bugs that hadn't been named yet and builds the sequencing around avoiding them.

**Three new decisions locked this phase, beyond pure sequencing:**
1. **CSV format is locale-independent, always** — period decimal separator, ISO-8601 dates, regardless of the device's current locale (which the keypad itself is allowed to be locale-aware about). Without this, a CSV exported on a comma-locale device and reimported on a period-locale device (or vice versa) silently corrupts amounts. This gets baked into `CSVService` from the start, not retrofitted after files are already in the wild in the wrong format.
2. **Widget reload batching** — single mutations call `WidgetCenter.reloadTimelines` immediately, but CSV import (potentially 100+ rows) reloads exactly once after the whole batch commits, not once per row. This has to be decided at the same time `importCSV` is implemented, not discovered later as widget stutter.
3. **WeekCalculator ships before the schema is finalized**, unit-tested across at least three `firstWeekday` locales, since a subtly wrong week-boundary function silently corrupts every downstream feature that groups by week — and a US-locale-only test pass would never catch it.

**Milestone sequence (dependency-ordered, not feature-list-ordered):**
- **M0** — Xcode scaffold: three targets, App Group entitlement on app *and* widget, schema/App Group identifier frozen, `.storekit` config created and wired into the scheme from day one.
- **M1** — NickelKit core: CloudKit-safe `@Model` types, `SwiftDataSpendRepository`, `WeekCalculator` with locale unit tests, in-memory `ModelContainer` test harness for everything downstream to use.
- **M2** — the sacred core loop: Log Sheet, Week view, `DayCard` logged/unlogged states, wired to the real repository, hand-verified for sub-5-second timing before anything builds on top.
- **M3** — `WeatherAlgorithm` → `RecapCardData` → `RecapCardView` → `ImageRenderer`/`ShareLink`, built in that order so there's never a live `@Query`-bound view to tempt into the render path.
- **M4** — widget target: `WidgetState` enum, `SpendWidgetProvider` with explicit do/catch, hand-verified as three visually distinct states (not two).
- **M5** — History/category browsing, edit/delete.
- **M6** — CSV export then import-with-preview, including the fixed-locale-format and batched-reload decisions above.
- **M7** — StoreKit: `EntitlementStore` stubbed as early as M2/3 (explicit judgment call, named as a real trade-off — a seam maintained across several milestones instead of one clean chunk — but justified since design_handoff already said entitlement-gating shouldn't be bolted on), full `PaywallSheet`/`Transaction.updates` landing here.
- **M8** — `LogSpendIntent` + `AppShortcutsProvider`, parallelizable with M3–M7 once NickelKit is stable.
- **M9** — soft targets, settings, onboarding.
- **M10** — full integration re-verification pass re-running every hand-verification checklist together, since a widget verified working in isolation at M4 can regress once M6/M9 touch the same repository paths.

**Verification plan:** not deferred to the end — unit tests land in the same milestone as the function they cover (WeekCalculator at M1, WeatherAlgorithm at M3, CSVService at M6); the three hand-verification items carried from earlier phases (log timing, recap three-state, widget three-state) are checked at the milestone that builds them; CSV round-trip gets a named concrete test case (two entries with identical amount/category/date, export, delete, reimport, confirm both return rather than getting wrongly deduped). M10 is a regression safety net, not a first attempt at any of this.

**Risk register:** WeekCalculator locale bugs (mitigated by M1 multi-locale tests before schema use), CSV cross-locale corruption (mitigated by fixed format decision), widget reload storms during batch import (mitigated by batched-reload rule), EntitlementStore front-loading adding an extra seam (accepted trade-off, named explicitly), and the standing meta-risk that ten straight solo phases means no adversarial check on this sequencing before code gets written against it.

Both acceptance checks hold: the plan is directly executable by a task-assignment phase (concrete milestones, explicit dependencies, no vague "and also testing" appendix), and testing/integration is embedded per-milestone with a dedicated cross-milestone regression pass at the end, not left as end-of-project polish.

## Task Assignments

Codex stayed dark again — that's eleven phases running solo now — but this round's pass is thorough enough that there's genuinely nothing to send back for a second round. It took what tech_specs and project_plan already locked (the owning_lane assignments on every type, the M0–M10 milestone sequence) and turned it into something a build worker can actually pick up: real file paths, real dependencies, real acceptance criteria, plus two concrete process risks nobody had flagged yet — the shared `project.pbxproj` merge-conflict trap, and the temptation to let primary_ui start against a guessed repository shape while data_domain is still finishing it up.

CONSENSUS: YES

## Final Output

**Lane responsibilities:**
- **data_domain** — Xcode project scaffold (three targets + App Group entitlements + `.storekit` config wired to scheme), the CloudKit-safe `@Model` types and value types, the `SpendRepository` protocol + `SwiftDataSpendRepository`, default-category seeding, migration-plan scaffolding, and the `WidgetCenter.reloadTimelines` call sites (immediate on single mutations, exactly one batched call after CSV import commits).
- **services_utilities** — `WeekCalculator` (locale-aware, tested across 3+ `firstWeekday` locales, built before the repository snapshots week fields), `WeatherAlgorithm` (trailing-baseline, honest degrade states), `CSVService` (locale-independent format: period decimal, ISO-8601 dates, always), `EntitlementStore`, and the App Intent write path (`LogSpendIntent`, `CategoryEntity`, `NickelShortcuts`).
- **primary_ui** — `AppRoute`/router, design tokens and shared components (`MoneyText`, `DayCard`, `CategoryGlyph`, `WeatherIcon`, paper-grain background), every main-app screen (Week, Log Sheet, History, Category/Entry Detail, Recap, Targets, Categories Management, Settings, Onboarding, PaywallSheet shell), and `RecapCardView` (plain value-driven, zero `@Query`/`@Environment`).
- **polish_resilience** — the widget extension target end to end, CSV Import Preview types + screen, XCUITest suite, the accessibility/privacy audit, and the final cross-lane integration re-verification pass.

**Forbidden zones:** nobody but data_domain touches `NickelKit/Sources/NickelKit/Models/` or `Persistence/` — UI needing a new repository method files a request, not a self-serve edit. Nobody but services_utilities edits `WeekCalculator`/`WeatherAlgorithm`/`CSVService` logic. `NickelWidget`'s source directory is polish_resilience-only. And critically: after the initial scaffold, nobody edits `project.pbxproj` target-membership directly — new files land in the right folder by the owning lane, and one person (data_domain, since it owns the scaffold) batches target-membership changes at defined sync points, because Xcode project files don't merge cleanly and a bad merge produces a project that silently fails to compile.

**Sync points:** (1) repository method signatures frozen and broadcast once data_domain's models + WeekCalculator-backed repository land; (2) `AppRoute` shape frozen and broadcast once primary_ui defines it, since the widget deep-link and App Intent both consume it; (3) any `.pbxproj` target-membership change is a batched request to data_domain, not continuous self-service; (4) before anything is called done, polish_resilience runs the full integration pass and reports explicit pass/fail against the project_plan hand-verification checklist.

**Named risk:** data_domain and services_utilities sit on the critical path for almost everything downstream (Log Sheet, App Intent, widget all need the real repository) — the plan explicitly rejects letting primary_ui start the Log Sheet against a guessed repository shape to avoid idle time; instead primary_ui's first task is repository-independent (tokens/components), and data-dependent screens wait for the frozen signature.

Both acceptance checks hold: every task in the backlog below has an owner_lane, the dependency graph is acyclic, and the sequencing (scaffold → models/WeekCalculator → repository → everything else) means build workers can start immediately on unblocked tasks.

```tasks-json
{"tasks": [
{"id": "T-001", "title": "Xcode project scaffold: three targets, App Group entitlements, .storekit config wired to scheme", "owner_lane": "data_domain", "files": ["app_build/Nickel.xcodeproj", "app_build/NickelApp/NickelApp.entitlements", "app_build/NickelWidget/NickelWidget.entitlements", "app_build/Nickel.storekit", "app_build/NickelKit/Package.swift"], "depends_on": [], "acceptance_criteria": ["Project opens in Xcode with NickelApp, NickelWidgetExtension, NickelKitTests, NickelUITests targets all present", "App Group entitlement identical on NickelApp and NickelWidgetExtension targets", ".storekit file exists and is referenced by the active scheme", "Empty project builds and runs on simulator with zero warnings"], "status": "pending"},
{"id": "T-002", "title": "CloudKit-safe SwiftData models + value types (SpendEntry, Category, WeeklyTarget, RecapCardData, CategoryTotal, WeatherReading, WidgetState, CSVImportResult)", "owner_lane": "data_domain", "files": ["app_build/NickelKit/Sources/NickelKit/Models/SpendEntry.swift", "app_build/NickelKit/Sources/NickelKit/Models/Category.swift", "app_build/NickelKit/Sources/NickelKit/Models/WeeklyTarget.swift", "app_build/NickelKit/Sources/NickelKit/Models/RecapCardData.swift", "app_build/NickelKit/Sources/NickelKit/Models/WeatherReading.swift", "app_build/NickelKit/Sources/NickelKit/Models/WidgetState.swift", "app_build/NickelKit/Sources/NickelKit/Models/CSVImportResult.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["No @Attribute(.unique) anywhere in the schema", "Every relationship is Optional with an explicit inverse", "Every non-relationship attribute is Optional or has a default value", "Package compiles standalone via swift build"], "status": "pending"},
{"id": "T-003", "title": "WeekCalculator: locale-aware week bounds/week-of-year, unit tested across 3+ firstWeekday locales", "owner_lane": "services_utilities", "files": ["app_build/NickelKit/Sources/NickelKit/Services/WeekCalculator.swift", "app_build/NickelKitTests/WeekCalculatorTests.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["weekBounds and weekOfYear respect calendar.firstWeekday, never hardcode Sunday/Monday", "Unit tests pass for a Sunday-start locale, a Monday-start (ISO) locale, and a Saturday-start locale", "Pure function, zero SwiftData/SwiftUI import"], "status": "pending"},
{"id": "T-004", "title": "SpendRepository protocol + SwiftDataSpendRepository, default category seeding, widget reload wiring", "owner_lane": "data_domain", "files": ["app_build/NickelKit/Sources/NickelKit/Persistence/SpendRepository.swift", "app_build/NickelKit/Sources/NickelKit/Persistence/SwiftDataSpendRepository.swift", "app_build/NickelKit/Sources/NickelKit/Persistence/SchemaMigrationPlan.swift", "app_build/NickelKit/Sources/NickelKit/Seed/DefaultCategories.swift", "app_build/NickelKitTests/RepositoryTests.swift"], "depends_on": ["T-002", "T-003"], "acceptance_criteria": ["addEntry rejects amount <= 0, never persists a zero-amount entry", "weekOfYear/weekYear computed once at insert via WeekCalculator, never recomputed live on read", "CSV/import dedupe is an application-level Set<UUID> check against fetched entries, no DB uniqueness constraint used", "Every mutating call triggers WidgetCenter.reloadTimelines(ofKind:) immediately; importCSV triggers exactly one reload after the whole batch commits", "~9 default categories seeded on first launch of an empty store", "All CRUD + recapData(weekStart:) methods covered by tests against an in-memory ModelContainer"], "status": "pending"},
{"id": "T-005", "title": "WeatherAlgorithm: trailing-baseline weather reading with honest degrade states", "owner_lane": "services_utilities", "files": ["app_build/NickelKit/Sources/NickelKit/Services/WeatherAlgorithm.swift", "app_build/NickelKitTests/WeatherAlgorithmTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Returns .notEnoughData when entryCount < 3 regardless of amount, no override path", "Returns .insufficientHistory when entryCount >= 3 but fewer than 2 comparable prior weeks exist", "Baseline is a trailing average of prior logged weeks, never a fixed dollar threshold", "Empty priorWeeks array does not crash or divide by zero — covered by an explicit test"], "status": "pending"},
{"id": "T-006", "title": "CSVService: locale-independent parse/serialize with malformed-file detection", "owner_lane": "services_utilities", "files": ["app_build/NickelKit/Sources/NickelKit/Services/CSVService.swift", "app_build/NickelKitTests/CSVServiceTests.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Serialize always emits period decimal separator and ISO-8601 dates regardless of device locale", "Parse assumes the same fixed format regardless of device locale", "Each CSVImportError case produces a specific, human-readable errorDescription, never a generic failure message", "Round-trip test: two entries with identical amount/category/date both survive export-delete-reimport without being wrongly collapsed by dedupe"], "status": "pending"},
{"id": "T-007", "title": "EntitlementStore: StoreKit 2 wrapper defaulting to free tier", "owner_lane": "services_utilities", "files": ["app_build/NickelKit/Sources/NickelKit/Services/EntitlementStore.swift"], "depends_on": ["T-001"], "acceptance_criteria": ["isPlusActive defaults false on any unknown/unreachable entitlement state", "refresh()/purchase()/restore() never block the UI with a spinner", "Verified against the checked-in .storekit config via StoreKitTest/SKTestSession"], "status": "pending"},
{"id": "T-008", "title": "AppRoute/AppRouter + app entry wiring the shared App Group ModelContainer", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/App/NickelApp.swift", "app_build/NickelApp/App/AppRoute.swift", "app_build/NickelApp/App/AppRouter.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["Single @Observable router owns AppRoute state near the app root, no scattered @State booleans", "ModelContainer configured against the shared App Group ModelConfiguration, identical schema version widget will use", "AppRoute enum shape frozen and broadcast before T-011/T-013 begin consuming it"], "status": "pending"},
{"id": "T-009", "title": "Design tokens + core shared components (MoneyText, DayCard, CategoryGlyph, WeatherIcon, paper-grain background)", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/DesignSystem/Tokens.swift", "app_build/NickelApp/DesignSystem/PaperBackground.swift", "app_build/NickelApp/Components/MoneyText.swift", "app_build/NickelApp/Components/DayCard.swift", "app_build/NickelApp/Components/CategoryGlyph.swift", "app_build/NickelApp/Components/WeatherIcon.swift"], "depends_on": ["T-002"], "acceptance_criteria": ["MoneyText is the only place serif numerals are applied; never used for non-money numbers", "DayCard is one component with a State enum (logged/noEntry), not two views", "accentText token measured at real 4.5:1 contrast against paperCream", "Dark mode counterpart present for every color token, not an inverted system gray"], "status": "pending"},
{"id": "T-010", "title": "Log Sheet + Week view: the sacred core loop wired to the real repository", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/LogSheet/LogSheetView.swift", "app_build/NickelApp/Views/Week/WeekView.swift"], "depends_on": ["T-004", "T-008", "T-009"], "acceptance_criteria": ["Keypad focused via .onAppear with zero intermediate screen", "Category row is a single visible row, one tap both selects and dismisses, no separate save button", "Save is unreachable/disabled on zero or blank amount", "Cold-run tap-to-saved-entry measured under 5 seconds by hand", "Week view shows logged vs no-entry days as visually and VoiceOver-distinct states"], "status": "pending"},
{"id": "T-011", "title": "App Intent write path: LogSpendIntent, CategoryEntity, AppShortcutsProvider", "owner_lane": "services_utilities", "files": ["app_build/NickelApp/Intents/LogSpendIntent.swift", "app_build/NickelApp/Intents/CategoryEntity.swift", "app_build/NickelApp/Intents/NickelShortcuts.swift"], "depends_on": ["T-004"], "acceptance_criteria": ["perform() calls SpendRepository.addEntry directly, no duplicated write logic", "A fixed test case (known amount + category) logs correctly via the intent, verified by hand", "Discoverable in the Shortcuts app via AppShortcutsProvider"], "status": "pending"},
{"id": "T-012", "title": "Recap screen: RecapCardView + ImageRenderer + ShareLink, three honest states", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/Recap/RecapCardView.swift", "app_build/NickelApp/Views/Recap/RecapView.swift"], "depends_on": ["T-004", "T-005", "T-009"], "acceptance_criteria": ["RecapCardView takes only RecapCardData, zero @Query/@Environment access", "0 / 1-2 (thin week) / 3+ entries render three visibly distinct cards, confirmed by hand", "ShareLink produces a real ImageRenderer PNG that opens correctly in the share sheet", "Can render any past week on demand from stored data, not just the live current week"], "status": "pending"},
{"id": "T-013", "title": "Widget extension: three-state SpendWidgetProvider + widget views + tap-to-deep-link", "owner_lane": "polish_resilience", "files": ["app_build/NickelWidget/SpendWidgetProvider.swift", "app_build/NickelWidget/NickelWidgetBundle.swift", "app_build/NickelWidget/Views/WidgetViews.swift"], "depends_on": ["T-001", "T-004", "T-008"], "acceptance_criteria": ["Store-open wrapped in explicit do/catch, never try?, so .uninitialized can never collapse into .empty", "uninitialized / empty(weekStart) / data(RecapCardData) render as three visually distinct states, confirmed by hand on a real device/simulator", "Tapping the widget in any state deep-links to the Log Sheet via AppRoute", "#Preview fixtures exist for all three states"], "status": "pending"},
{"id": "T-014", "title": "History screen (week/category toggle), Category Detail, Entry Detail/Edit with delete confirmation", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/History/HistoryView.swift", "app_build/NickelApp/Views/History/CategoryDetailView.swift", "app_build/NickelApp/Views/History/EntryDetailView.swift"], "depends_on": ["T-004", "T-009", "T-010"], "acceptance_criteria": ["Segmented control for week/category is large and labeled at the top, not a small icon", "Every logged entry is editable and deletable; edits immediately update recap totals", "Delete requires exactly one confirmation tap, the sole exception to no-confirmation-screens"], "status": "pending"},
{"id": "T-015", "title": "CSV Import Preview: parse types + preview/error/success UI", "owner_lane": "polish_resilience", "files": ["app_build/NickelKit/Sources/NickelKit/Models/CSVParseResult.swift", "app_build/NickelKit/Sources/NickelKit/Models/ParsedCSVEntry.swift", "app_build/NickelKit/Sources/NickelKit/Models/CSVImportError.swift", "app_build/NickelApp/Views/CSVImport/ImportPreviewView.swift"], "depends_on": ["T-006", "T-004"], "acceptance_criteria": ["Malformed file always produces a specific visible error, never a silent partial import", "Preview shows new/duplicate/total counts before commit", "Post-import confirmation summary shown from CSVImportResult"], "status": "pending"},
{"id": "T-016", "title": "PaywallSheet UI wired to EntitlementStore and PaywallTrigger contexts", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/Paywall/PaywallSheet.swift", "app_build/NickelApp/App/PaywallTrigger.swift"], "depends_on": ["T-007", "T-008"], "acceptance_criteria": ["Every trigger (newCategoryLimit, widgetConfig, customTag, trendCharts) resolves to a dismissible sheet", "A genuine Not Now control returns the user exactly where they were, no forced interstitial", "Downgrade path never hides existing custom-category entries, gates only new-category creation"], "status": "pending"},
{"id": "T-017", "title": "Settings, Categories Management, Targets screens", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/Settings/SettingsView.swift", "app_build/NickelApp/Views/Settings/CategoriesManagementView.swift", "app_build/NickelApp/Views/Settings/TargetsView.swift"], "depends_on": ["T-004", "T-009", "T-016"], "acceptance_criteria": ["Soft targets are visual-only, zero local/push notification scheduling anywhere in this screen or its call paths", "Custom category creation gates behind Nickel+; historical entries on old custom categories stay visible and labeled after downgrade", "CSV export/import and Nickel+ entry points present and reachable"], "status": "pending"},
{"id": "T-018", "title": "Onboarding screen + true first-launch empty state", "owner_lane": "primary_ui", "files": ["app_build/NickelApp/Views/Onboarding/OnboardingView.swift"], "depends_on": ["T-010"], "acceptance_criteria": ["Single screen, kinesthetic — drops user into empty Week with log button pulsing once, no carousel", "Shown exactly once on true first launch, never again after first entry or dismissal"], "status": "pending"},
{"id": "T-019", "title": "Accessibility and privacy audit", "owner_lane": "polish_resilience", "files": ["app_build/NickelApp/Info.plist"], "depends_on": ["T-009", "T-010", "T-013"], "acceptance_criteria": ["VoiceOver announces logged vs no-entry days as distinct, not generic", "Log Sheet keypad + category row tested at accessibility Dynamic Type sizes, category row wraps to a second line rather than shrinking below 44pt", "Info.plist inspected by hand and contains zero permission usage-description keys", "accentText-on-cream contrast measured and confirmed at or above 4.5:1"], "status": "pending"},
{"id": "T-020", "title": "XCUITest suite for the load-bearing hand-verification behaviors", "owner_lane": "polish_resilience", "files": ["app_build/NickelUITests/CoreLoopTests.swift", "app_build/NickelUITests/CSVRoundTripTests.swift", "app_build/NickelUITests/EditDeleteTests.swift"], "depends_on": ["T-010", "T-014", "T-015"], "acceptance_criteria": ["Cold-launch-to-saved-entry timing test exists and passes", "Edit/delete round-trip test exists and passes", "CSV export-delete-reimport test confirms zero duplicates and zero data loss on the identical-entry case"], "status": "pending"},
{"id": "T-021", "title": "Full integration re-verification pass across all lanes", "owner_lane": "polish_resilience", "files": ["app_build/NickelUITests/IntegrationRegressionTests.swift"], "depends_on": ["T-012", "T-013", "T-016", "T-017", "T-020"], "acceptance_criteria": ["Widget three-state check re-run after CSV import and targets features exist, not just in isolation at their own milestone", "Recap card three-state honesty re-confirmed against real repository data end to end", "Any must-have from app_features found missing or regressed is reported explicitly as a limitation, not silently passed"], "status": "pending"}
]}
```

## Implementation Readiness Gate

CONSENSUS: YES

## Final Output

**Readiness verdict:** Ready to build. This is a genuine pre-build gate pass, not a rubber stamp — it checked the eleven prior phases against each other, found them consistent, and caught three real build-mechanics gaps that no earlier phase (being product/design/architecture focused) had reason to catch. None of them require reopening a product or design decision; they're conditions to satisfy while executing the plan that's already locked.

**Cross-phase consistency check:** prompt_contract's hard-requirement list and app_features' must/should/could split line up, with one already-named, deliberate exception carried forward rather than silently dropped: prompt_contract calls soft weekly targets a hard requirement, app_features knowingly demoted it to should-have (while still keeping unlimited-category-creation *gating* as must-have, per T-017). That's not a new contradiction — it's a risk accepted six phases ago — and it's re-ratified here rather than re-litigated. Everything else (SwiftData-only/no-bank-linking, 3-tap log flow, three-state recap honesty, three-state widget honesty, CloudKit-safe schema, CSV locale-independent format, zero third-party dependencies, zero stray permissions) traces cleanly from prompt_contract through tech_specs into the T-001–T-021 backlog with no drift.

**Build blockers and fixes (none of these block starting — they're conditions attached to specific tasks):**
1. **Headless `.pbxproj` construction risk.** A hand-built or scripted three-target project (app, widget extension, local package) with matching App Group entitlements on two targets and a `.storekit` config wired into the scheme is exactly the class of thing that can look correct in source and still not compile. Fix: T-001's acceptance criteria now explicitly require actually opening/building the scaffold — confirm all four targets appear, confirm the widget's App Group container ID literally matches the main app's, get a green build on the empty scaffold — before any other lane starts consuming it. Reading the file back is not sufficient verification.
2. **Widget reload verification is Simulator-only, not device-equivalent.** `WidgetCenter.reloadTimelines` is subject to a real per-app system refresh budget on physical devices that Simulator doesn't enforce the same way, so a passing three-state check in Simulator doesn't guarantee real-device promptness. Fix: state this plainly as a named, accepted limitation of the verification method in the final report, not something "verified by hand" quietly implies device-level confidence about.
3. **CategoryGlyph/WeatherIcon must be code, not assets.** design_handoff already implied shape-based iconography; this phase makes it an explicit, testable acceptance criterion — built as SwiftUI `Shape`/`Path` code, never a placeholder SF Symbol swap or a blocked task waiting on art nobody can produce in a one-shot build.

**Final scope for build:** Unchanged from task_assignments' T-001 through T-021. The sacred floor if time runs short: T-001 (verified green scaffold) → T-002/T-003/T-004 (schema, WeekCalculator, repository) → T-008/T-009/T-010 (routing, tokens, Log Sheet/Week view, hand-timed under 5 seconds) → T-005/T-012 (weather algorithm, recap card with real three honest states). If the build has to visibly leave something unfinished, it must be CSV import, Shortcuts polish, targets, or paywall chrome — named explicitly as a limitation — never a silent compromise on log-speed or on the recap card fabricating a reading.

**Acceptance criteria checklist for the build phase:**
- T-001 scaffold opened and built green, App Group parity confirmed on app + widget targets, before any other lane starts.
- Cold-run log-sheet-to-saved-entry under 5 seconds, hand-timed.
- Recap card renders three visually distinct, honest states (0 / thin-week / real-week) — never a fabricated reading.
- Widget renders three visually distinct states in Simulator; device-level reload-budget caveat named as an accepted limitation, not silently assumed equivalent.
- CategoryGlyph/WeatherIcon implemented as SwiftUI Shape/Path code, not SF Symbols or bitmap placeholders.
- Edit/delete round-trip on logged entries; CSV export→delete→reimport round-trip with the identical-entry dedupe case producing zero duplicates/zero loss.
- Info.plist inspected by hand: zero stray permission usage-description keys.
- If soft targets or any other named should-have ships incomplete, reported explicitly as a limitation against prompt_contract's letter, never passed silently as done.

**Testing responsibilities:** unchanged from project_plan/task_assignments — unit tests land with their functions (WeekCalculator, WeatherAlgorithm, CSVService), polish_resilience owns XCUITest and the hand-verification checklist, and T-021's integration pass re-confirms widget/recap honesty after CSV import and targets exist, not just in isolation.

## Build Coordination

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Build Verification

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** still not compiling after 3 repair attempt(s)

VERIFICATION: FAILED

## Human Qa Checklist

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED

## App Store Readiness

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED

## Final Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED

## Portfolio Audit

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED
