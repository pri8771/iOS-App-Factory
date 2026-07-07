# kitbag — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

CONSENSUS: YES

Both sides landed in the same place. Codex framed the ambitious version — Kitbag as a "personal packing editor" that visibly gets smarter each trip, with trust and honesty (explaining *why* an item is suggested, labeling climate data as historical not forecast) as the core differentiator over a generic checklist. Claude then pressure-tested that against reality: it flagged the real tension between "MVP build, priority 4" in the child spec and "0-to-production-ready" in the parent portfolio prompt, and resolved it by scoping full production quality to the five named core workflows while treating Widgets/Live Activities/Siri as stretch scope that must be justified if dropped rather than silently cut. Claude also drew clean boundaries around what this phase does *not* own (re-running ideation, cross-app uniqueness verification, Jira/Notion backfill, combined 9-app transcripts — all parent-portfolio concerns), and set concrete guardrails on the two riskiest parts of the spec: the climate-normal data must be real bundled data honestly labeled, and the post-trip review has to be fast enough that people actually complete it, since the whole learning loop depends on that. Nobody pushed back on any of this — it's additive clarification, not disagreement.

## Final Output

**Original prompt:** preserved verbatim above (Kitbag app spec + parent portfolio prompt).

**Hard requirements:**
- Ship a working local-first SwiftUI MVP for iPhone covering all five core workflows end-to-end with real on-device persistence (no placeholder logic): create trip → generate smart packing list → checklist interaction → post-trip review → personal insights.
- The learning loop is real: post-trip review outcomes must actually influence future list generation once at least one trip has been reviewed.
- Bundle real offline climate-normal reference data (by month/region), UI-labeled explicitly as historical averages, never as a forecast.
- Zero-history first trip must be genuinely useful via smart defaults — no dependency on prior data to deliver value.
- Free/paid split as specified (3 trips free vs. unlimited history/analytics/premium templates paid), with real entitlement-gating logic wired to StoreKit 2 and testable via a local StoreKit config file.
- Widgets, Live Activities, and App Intents/Siri are in scope; code should be built for them, though full interactive verification may be limited by the headless environment — that limitation must be reported, not hidden.
- Local-first architecture that doesn't block future optional cloud sync.
- Every screen needs empty/loading/success/error states; accessibility (Dynamic Type, VoiceOver) and privacy are real requirements, not polish.

**Non-goals:**
- No live weather, booking, social/collaborative trip features, general travel journal, or AI concierge.
- No account creation or network dependency required for core value.
- No re-running app ideation, no verifying batch-wide uniqueness across the other 8 apps, no Jira/Notion backfill, no combined cross-app transcript — those are parent-portfolio-level jobs.
- No fabricated precision in climate data, no vaporware personalization (it only kicks in after a real completed review).
- No claiming a verified live App Store purchase flow — only local StoreKit config testing.
- Don't let a large template marketplace or on-device LLM phrasing balloon the MVP; both are optional/secondary at most.

**Production-readiness definition:** all five core workflows work end-to-end with real persistence across launches; four UI states present wherever reachable; accessibility actually implemented; cold-start (zero history) is polished and useful on its own; climate data honestly labeled; monetization boundary coherent and functional locally; build verification actually built (and ran where possible) rather than just eyeballing source; anything unverifiable in this environment (Widgets/Live Activities/Siri behavior, live purchases) is explicitly flagged as a limitation in the final review rather than asserted as working.

**Decision rules for later phases:**
1. Conflict between breadth and finish → cut breadth, keep the core loop fully working.
2. Conflict between cleverness and trust → explain suggestions plainly; keep climate/history influence transparent.
3. Conflict between ML/LLM flourish and deterministic reliability → keep it deterministic; LLM phrasing is optional garnish only.
4. Conflict between review depth and review friction → optimize hard for a fast, low-friction post-trip review — this is the invalidation risk named by the spec itself.
5. If a feature doesn't strengthen "this list learns from you," treat it as secondary/roadmap.
6. If a design choice makes it look like a generic to-do app, reject it.
7. If a feature needs network dependence for core value, reject it for MVP.
8. Dropping Widgets/Live Activities/App Intents must be a stated, justified limitation — never a silent omission.
9. Nothing gets marked "done"/"verified" unless actually built (and run where feasible) — untestable-in-this-environment items get flagged explicitly.

**Output shape:** one self-contained project folder at `/Users/pchordia/Documents/iOS-App-Factory/kitbag` with a compiling Xcode project, correct target membership, seeded offline climate dataset, and this app's own saved phase discussion/decision transcript.

## Initial Discussion

CONSENSUS: YES

Both Codex and Claude landed on essentially the same product definition, just phrased differently. Codex's promise — "a packing app that builds your list from trip context plus your own keep/skip history, and only gets smarter if the post-trip review stays fast enough that people finish it" — and Claude's version — "starts useful on day one with zero data, gets measurably more personal after every trip you actually review" — are the same idea from two angles. They agree on the core loop (create trip → smart default list → check off items while packing → fast post-trip review → list changes next time), agree that the 9pm-night-before moment is the real make-or-break UX (not the insights screen), and agree that the post-trip review has to be radically low-friction — Codex says 30-60 seconds, Claude pushes for under 30 seconds by defaulting everything to "used" and only asking about exceptions. That's a minor difference in target number, not a real disagreement, and both treat review-completion time as a first-class, testable success metric rather than a nice-to-have.

They also agree on hard boundaries: no live weather, no bookings/itineraries, no social or shared trips, no account/cloud requirement, no on-device LLM as a load-bearing dependency (templated phrasing at most), no general travel journal, and climate-normal data must always read as historical averages, never a forecast. Claude flagged that Widgets/Live Activities/Siri shouldn't be allowed to eat time that should go to the core loop — sequencing, not deletion — and nothing from Codex pushed back on that. Both want the personalization to be explainable ("why was this suggested") rather than a black box, since that's what makes the learning claim trustworthy instead of decorative.

No open disagreement to carry into another round.

## Final Output

**One-sentence product promise:** A packing checklist that's genuinely useful with zero history on your first trip, and gets measurably more personal — with visible, explainable reasons — after every trip you complete a fast post-trip review for.

**Primary user and scenario:** A frequent traveler (business trips, weekend city trips, a big annual vacation — repeated patterns, repeated packing mistakes) who opens the app in the 9pm-the-night-before moment wanting a trustworthy list fast, and who, in the 2 minutes after getting home, gets one chance to tell the app what went unused or was missing.

**Core loop:** Create a trip (destination, dates, type) → get a generated list from trip-type/climate defaults, weighted by personal history once any exists → check items off while packing → complete a short post-trip review (default everything to "used," only flag the exceptions) → that review updates the personal model → the next similar trip's list visibly and explainably reflects it.

**Hard scope boundaries:**
- Packing intelligence only — not a travel dashboard. No live weather, no bookings/itineraries/maps, no shared/multi-user trips, no travel journaling, no chat or AI-concierge behavior, no account/cloud requirement for core value.
- No on-device LLM as a load-bearing dependency — templated phrasing only, if used at all.
- Item taxonomy stays lightweight: suggested items, a few personal custom items, simple trip types/regions — not an open-ended editable system.
- Climate-normal data is a background input for defaults only, always labeled as historical averages, never phrased as a forecast.
- Insights and native iOS features (Widgets, Live Activities, Siri/App Intents) are real scope per the existing contract, but sequenced behind the five core workflows — they must not consume build effort at the core loop's expense, and if cut, that's a stated, justified limitation, not a silent drop.

**Measurable success criteria:**
1. A brand-new user with zero history creates a trip and gets a non-empty, sensible list in the first session — no data dependency.
2. Post-trip review completes in well under a minute (target: under 30–60 seconds) for a typical list.
3. After one completed reviewed trip, a specific, attributable change appears in the next similarly-typed trip's list, and the app can state why (e.g., "based on your last 3 city trips").
4. Every suggested item can show a short, honest reason for its inclusion.
5. Bundled climate-normal data is unambiguously labeled historical/average.
6. Data persists across a real kill-and-relaunch of the app.
7. Free tier caps at 3 trips of history, enforced.

## Per App Product Brief

Both Codex and Claude arrived at nearly the same brief independently, just in different voices. They agree on who this is for (a frequent traveler — 8-12 trips a year, mixed business/family/vacation — who's tired of generic checklists failing them the same way every time), agree on exactly what unlocks with payment (unlimited history, real pattern-based analytics, export/share, niche premium templates — nothing cosmetic), agree on the core loop word-for-word in substance, and agree on the sharpest point in the whole discussion: the competitive wedge is *not* "AI-powered," it's honest, inspectable personal memory — every suggested item needs a real one-line reason tied to actual data, never a black-box claim. Both explicitly reject forcing viral mechanics and land on the same growth story instead — quiet, niche word-of-mouth through the paid export/share feature putting a Kitbag list in front of a non-user, plus recurring App Store search traffic for "packing list." Both treat local-first as a trust/privacy feature, not just an implementation detail, and both keep cloud sync strictly optional/future, never a v1 dependency. No disagreement surfaced — Claude's only self-objection (that this reads as under-scoped against the portfolio's production-readiness bar) is answered the same way the prior phase already settled it: a tight, fully-working five-workflow loop beats false breadth. Gemini was unavailable again this round, so there's no third perspective, but the two contributions are substantively converged rather than talking past each other.

CONSENSUS: YES

## Final Output

**Target user and use case:** A frequent traveler (roughly 8-12 trips/year — short business trips, weekend family visits, one real vacation) who has been burned by generic packing templates that don't fit their actual trips (e.g., "hiking boots" for a November trip to Chicago) and wants a list they can trust in the 9pm-the-night-before moment without thinking hard.

**Paid value / subscription value:** Free proves the concept across 3 trips of history with a solid generated list. Paid unlocks things that only matter once someone is a repeat user, all functional rather than cosmetic: unlimited trip history (so the personal model isn't capped to a rolling window of 3), deeper post-trip analytics that surface real behavior-derived patterns ("you've packed a rain layer for 6 of your last 7 Pacific Northwest trips and used it 5 times"), list export/share so a generated list can go to a travel companion who doesn't have the app, and premium curated templates for niche trip types (ski, infant-in-tow, multi-leg business, multi-climate) that would take real effort for a user to build alone.

**Core loop:** Create a trip (destination, dates, type) → app generates a non-empty, trustworthy list immediately from trip-type rules plus bundled climate-normal data, with zero dependency on prior history → user checks items off while actually packing → post-trip review defaults every item to "used" and only asks about the handful that weren't touched or were missing, completable in well under a minute → that outcome updates the personal model → the next similar trip visibly changes, with a short, honest, inspectable reason attached to each suggestion (never a hand-wavy "smart suggestion").

**Competitive wedge:** Not "AI-powered" — that's table stakes and usually a thin, memoryless wrapper in this category. Kitbag's edge is real persistent memory of one person's actual packing behavior, tied to real trip type and real bundled seasonal/regional climate data, that shows its work on every item. Boring-and-true beats magical-and-fake, because trust is what keeps someone doing the post-trip review on trip four, five, six.

**Viral or niche growth angle:** Not a virality play — no referral gimmicks, no forced social mechanics, which would also break the "no shared trips" boundary already set. Growth is niche and compounding: the paid export/share feature puts a Kitbag-generated list (lightly branded) in front of a travel companion who isn't a user, and the honest "your list, not a template" story differentiates in recurring App Store search traffic for "packing list," which spikes seasonally around holidays and travel seasons.

**Local-first and cloud-ready plan:** All trip data, packing history, and review outcomes live on-device by default — this is a trust and privacy feature worth stating plainly in the app (this data reveals travel timing and home-empty windows), not just an architecture choice, and it removes any account-creation friction from proving the personalization works. Cloud sync/backup is architected as optional future insurance against phone loss/upgrade, with the persistence layer built to be swappable later, but it's never required for value and never surfaced as a nag in v1.

**What must survive downstream phases unchanged:** the reason-string on every suggested item, and the "changed because of you" moment right after a review — those are the actual product. Widgets, Live Activities, Siri, and the insights dashboard all exist in service of that moment and must not consume build time it needs.

## Detailed Discussion

CONSENSUS: YES

Codex and Claude weren't in tension here — Codex laid out the product-level rules for what "learns from you" has to mean concretely (fast trip creation, zero-history usefulness, visible reason-strings, review as the trust mechanism, insights that are actionable not decorative), and Claude took that and drove it down into the specific structural edge cases that would otherwise get guessed inconsistently by design and architecture — month-boundary handling, destination entry, trip editing/deletion, cancelled trips, review editability, overfitting on thin data, lock-screen privacy exposure, and the precise mechanics of the free-tier cap. Nothing Claude added contradicts anything Codex said; it's the same philosophy (honest, inspectable, low-friction) applied to harder corners of the problem. Gemini was unavailable again, so it's a two-way convergence, but there's no live disagreement to carry forward — this reads as done.

## Final Output

**Resolved requirements:**
- Trip creation stays lightweight: destination (from a bundled offline region/city list, not free text or online geocoding — keeps climate lookup deterministic and the flow airplane-mode-safe), dates, trip type, optional length-sensitive notes (laundry access, carry-on only).
- First generated list must be useful with zero history, built from trip type + trip length + bundled climate normals alone.
- Every suggested item carries a visible, honest reason string (common for this trip type, added from your history, average cool evenings, repeated manual add) — never a vague "smart suggestion."
- Post-trip review is the sole learning signal. Checklist-checking during packing is packing progress, not usage truth, and must not feed personalization — only explicit review answers do. This keeps every reason-string traceable to one clean source.
- Review defaults everything to "used," asks only about exceptions and one optional "wish I'd packed" input, finishable in seconds.
- Insights summarize actionable behavior patterns, not vanity stats.
- Multi-climate trips: MVP uses primary-destination-climate + trip type only; true multi-climate modeling is explicitly deferred to premium templates/roadmap, not faked.
- Free tier never blocks trip creation — it only caps visible/usable history depth and analytics at the most recent 3 trips. Downgrading after payment lapses never deletes data, only re-locks access to it.
- Notifications (e.g., a nudge to complete a post-trip review) and Siri/App Intents are conveniences layered on top of a fully-reachable core flow — permission denial can never block a core-loop step. Voice-add defaults to the most imminent upcoming trip, with a clean spoken failure state when there are zero trips.

**Edge cases to handle explicitly:**
- Trip date range spanning a month boundary → resolved deterministically by whichever month has the majority of trip days.
- Editing a trip's dates/destination after list generation → regenerate suggested items but preserve user-added custom items and anything already checked off; make the change visibly obvious to the user, never a silent overwrite.
- Deleting a trip → does not retroactively un-teach the model; learning already incorporated from a completed review stays applied even after the source trip is gone.
- A trip that's cancelled/never taken → needs an explicit "this didn't happen" exit distinct from a normal review, so it's excluded entirely from the learning set rather than force-reviewed as "everything unused" (which would poison the model with a false signal).
- Reopening and editing a completed review → downstream aggregates (insights, future-list weighting) must be recomputed deterministically from the full review history, not incremented, so edits don't cause unexplainable model drift.
- Thin-data overfitting in both directions → a single "unused" mark (or a single manual add) shouldn't be enough to permanently suppress or promote an item; require a minimum sample size / decay-weighted confidence before a suggestion visibly shifts.

**Data and privacy implications:**
- All trip/history/review data on-device by default, no account required — this is stated in-app as a trust feature, not buried in a privacy policy.
- Lock-screen-visible surfaces (widgets, notifications) show generic countdown copy ("Upcoming trip in 5 days"), never destination specifics, since trip timing reveals home-empty windows to anyone glancing at the phone.
- Exported/shared lists (paid feature) strip personal analytic reasoning — a travel companion sees the plain item list, not "removed because you never use this on business trips."
- Climate-normal data needs in-product provenance/labeling as historical average, never phrased as forecast — trust and (likely) compliance issue.
- Persistence must be durable and boring since there's no server-side recovery path in MVP; destructive actions (delete trip, clear history) require confirmation.

**Risk register:**
1. Review abandonment (named invalidation risk) → mitigated by ruthless review compression: default-to-fine, tap-only-exceptions, single free-text miss field, seconds not minutes.
2. Overclaiming intelligence / reason-strings sounding smarter than the evidence → mitigated by deterministic, traceable copy tied to real stored data, even at the cost of feeling less "magical."
3. Monetization gating killing habit formation before the loop proves itself → mitigated by never blocking trip creation; the 3-trip cap applies only to retained history/analytics depth.
4. Cancelled-trip false signal corrupting the model → mitigated by an explicit non-review exit path for trips that didn't happen.
5. Single-data-point whiplash making the model feel erratic → mitigated by a minimum-sample/confidence threshold before visible suggestion changes.
6. Passive location/schedule exposure via lock-screen widgets/notifications → mitigated by generic, non-destination-specific copy on any lock-screen-visible surface.

**Final assumptions locked for design/architecture:**
- Month-of-majority-days determines climate-normal lookup for date ranges crossing months.
- Destination is chosen from a bundled offline region/city list, not free text or live geocoding.
- Trip edits merge (preserve customizations/checked state); deletion doesn't reverse already-applied learning.
- Trips have an explicit "didn't happen" state, fully excluded from the learning set.
- Only post-trip review answers feed personalization; checklist interaction never does. Re-editing a review triggers deterministic recomputation of downstream aggregates.
- Suggestion changes require a minimum evidence threshold before they visibly shift, in both the suppress and promote direction.
- Free tier: unlimited trip creation, history/analytics capped at most recent 3 trips; lapsed payment re-locks rather than deletes.
- Lock-screen/notification copy is generic; exported lists carry no personal analytic commentary.
- Widgets, Live Activities, and Siri are conveniences that never gate a core-loop step, consistent with the standing decision rule that they're sequenced behind, not load-bearing for, the five core workflows.

## App Features

Both Codex and Claude ended up drawing the line in almost the same place — the eight must-have areas (trip create/edit, smart zero-history list generation, explainable reasons on every item, checklist interaction, fast post-trip review, the personalization/learning engine, insights, and local persistence+privacy+monetization gating) match nearly one-for-one between them. Where Claude added value was in nailing down specifics Codex left a little soft: an explicit fallback path for when a user's destination isn't in the bundled list (a climate-zone bucket they pick manually, since a dead-end there would be worse than any personalization bug), a locked six-item trip-type taxonomy, a concrete climate dataset size (30-40 regions), a literal "3 taps or fewer" review acceptance test, and a specific minimum-evidence rule (two same-type-or-region data points before a suggestion visibly shifts, not one). Neither of those contradicts anything Codex said — they're the kind of concrete numbers a build phase actually needs instead of "reasonable defaults." Both agree should-have is reminders/notifications, export-share, premium template scaffolding, and the editorial visual layer; both agree could-have is Widgets, Live Activities, Siri, and deeper premium templates, with the same cut order if time runs short (Live Activities first to go, Widgets last since they're cheap and screenshot-valuable). Both also landed on the identical won't-build list — live weather, bookings/social/shared trips, account requirement, LLM-as-dependency, true multi-climate modeling, open-ended taxonomy. No open disagreement surfaced; Gemini was unavailable again, so it's a two-way convergence, but nothing here is contested.

CONSENSUS: YES

## Final Output

**Must-have (all required for MVP; each must support "this list learns from you" directly):**

1. **Trip creation & editing** — destination from a bundled offline region/city list *with an explicit climate-zone-bucket fallback* when the real destination isn't listed (e.g., "temperate Europe," "tropical coastal"), dates, trip type from a closed six-item set (Business, City/Weekend, Beach/Warm, Cold/Winter, Outdoor/Hiking, Family/Kids), optional carry-on-only/laundry-access modifiers. *Acceptance:* works fully offline; end date can't precede start; trip appears immediately; editing regenerates suggested items but preserves custom items/checked state and visibly flags the change; a trip can be marked "didn't happen" and is fully excluded from learning.
2. **Smart zero-history list generation** from trip type + length + bundled climate normals. *Acceptance:* non-empty, sensible list for every bundled destination/month combo with zero prior history; month-spanning trips resolve via majority-day-month; quantities scale with length but cap sanely; runs instantly offline with no spinner for what's a local deterministic computation; climate copy always reads "historical average," never forecast language.
3. **Explainable suggestion reasons** on every item. *Acceptance:* every suggested item shows a short, real reason string (trip type, climate, repeated manual add, or reviewed history) — never generic "smart suggestion" copy.
4. **Checklist interaction** — check off, add/edit/remove custom items (flat text, no rich taxonomy). *Acceptance:* checked state and custom items survive a real kill-and-relaunch; empty/loading/success/error states present.
5. **Fast post-trip review** — defaults everything to used, exceptions-only tapping, one free-text "wish I'd packed" field, "didn't happen" bypass. *Acceptance:* a zero-exception review is completable in 3 taps or fewer; review is reopenable/editable and recomputes downstream aggregates deterministically.
6. **Personal learning engine** — only explicit review answers feed personalization, never checklist-checking. *Acceptance (the go/no-go test for the whole app):* review trip A marking an item unused → create trip B of same type/climate → item is visibly absent/demoted with a reason string naming trip A. Requires **two** same-type-or-region data points (not one) before a suggestion visibly shifts, weighted toward recency, to avoid single-sample whiplash.
7. **Personal insights view** — behavior-derived patterns only, honest empty state before any review exists (no fabricated sample chart), free tier capped at most recent 3 trips.
8. **Local persistence, privacy, and monetization gating** — durable on-device storage across relaunch, no account required, trip creation never blocked, history/analytics capped at most recent 3 trips on free tier, lapsed subscription re-locks (never deletes), wired to StoreKit 2 and actually exercised (simulated purchase + simulated expiration) against a local StoreKit config file, destructive actions require confirmation, lock-screen-visible surfaces stay generic (no destination text). Bundled climate dataset target: ~30-40 regions/cities with full 12-month data, legitimately sourced.

**Should-have (build if must-haves are solid; cutting any of these needs a stated reason, not a silent drop):**
- Local notification nudge to complete post-trip review (core flow must work fully with permission denied).
- Paid list export/share, stripped of personal analytic commentary.
- Premium template scaffolding (architecture + a locked surface, not a full marketplace).
- Editorial destination-photo trip header / premium visual hierarchy.

**Could-have (cut order if time runs short: Live Activities first, Siri/App Intents second, Widgets last):**
- Widget for generic days-until-trip/packing-progress countdown.
- Live Activity for an active packing session.
- App Intent/Siri voice-add targeting the most imminent trip, clean spoken failure at zero trips.
- One or two example premium multi-climate templates.

**Won't-build (explicit, with reasons):**
- Live weather/forecast integration — breaks offline-trust model, forecast-liability confusion.
- Free-text or online-geocoded destination entry — breaks deterministic climate mapping and offline guarantee.
- Shared/collaborative/multi-user trips — dilutes the personal-memory product, adds sync complexity.
- General travel planning (flights, bookings, itineraries, maps, journaling) — turns this into a travel dashboard.
- On-device LLM as a load-bearing dependency — templated phrasing only if used at all; product needs deterministic trust, not intelligence theater.
- True multi-climate modeling within a single trip — deferred to roadmap/premium templates, not faked.
- Open-ended custom item taxonomy (categories/icons/tags) — flat text only; avoids sliding into a generic to-do app.
- Any claim of a verified live App Store purchase flow — local StoreKit config testing is the ceiling for this build.
