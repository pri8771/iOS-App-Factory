# faveoff — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both of you clearly overlap on the fundamentals — this isn't a fight, it's Claude sharpening screws Codex left loose. Let me recap where things actually stand.

**What everyone agrees on:** This is a real local-first SwiftUI build, not a concept exercise. SwiftData owns titles/comparisons/rankings, ranking math runs entirely on-device, network touches only metadata/poster lookup and must never block the core loop. Production-ready means it compiles and behaves end-to-end — full screen states, real persistence across relaunch, working share flow, non-blocking paywall — not a spec or a demo reel. Non-goals are settled: no accounts, no social graph, no live backend, no music/album track in v1. Both of you also independently landed on the same instinct about pacing: Codex wants "fast-converging adaptive pairing" so the first few minutes feel like a bracket, not a form; Claude wants ranking done incrementally via binary-insertion as titles are added, rather than a big upfront round. These are the same idea stated two ways, not a conflict.

**What Claude added that Codex hadn't nailed down yet, and that doesn't contradict anything Codex said:**
- The spec's "Elo-style" and "merge-sort-style" language is internally inconsistent — Claude's fix is to commit to bounded merge-insertion (Ford-Johnson-style binary insertion), which gives a real n·log(n) guarantee and fits "rank from a handful of comparisons" far better than Elo, which needs repeated play to converge. This becomes a decision rule: defaulting to raw Elo scoring is treated as a contract violation.
- Metadata lookup: default provider must be a local/offline stub (manual entry + initials/color-block art), with any real API treated as optional and additive — never the happy path.
- StoreKit: real gating logic and purchase flow using a local `.storekit` config for testing is in-scope; actual App Store commerce is explicitly out of scope for "production-ready" and shouldn't be claimed as live.
- WidgetKit isn't in the Core Workflows list (only in "iOS-native features"), so it's flagged as the first thing allowed to slip under time pressure — ranking engine and share flow are not allowed to slip.
- Cold-start states need to be pinned: 0/1/2-title states, and comparisons happen continuously as the library grows, not as a one-time gauntlet.

None of this walks back Codex's contract — it fills in the gaps Codex's draft left open, and it's consistent with Codex's own stated decision rule ("if a feature proposal adds comparison fatigue, replace it with faster convergence logic before adding depth"). No open disagreement remains for this phase's scope.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above by both speakers (FaveOff MVP spec + parent multi-app-exp7 portfolio prompt).

**Hard requirements:**
- Real compiling Xcode project in `app_build`, not mocks or a spec.
- SwiftData persistence for titles, comparisons, computed rankings; ranking computed fully on-device.
- Ranking algorithm is bounded merge-insertion / binary-insertion (Ford-Johnson-style), not classic repeated-play Elo — comparisons happen incrementally as titles are added, not as a single upfront round.
- Metadata/poster lookup isolated behind a protocol; default/offline provider (manual entry + initials/color-block placeholder art) must fully support the core loop with networking off; any real API is optional and additive.
- Core workflows must all be real and functional: add title, head-to-head comparison, ranked list view, Taste Card generation (`ImageRenderer`) + `ShareLink`, genre/decade filtering.
- FaveOff+ gating and StoreKit 2 purchase flow must be real, tested via local `.storekit` config — not claimed as live App Store commerce.
- WidgetKit small widget is in-scope but lowest priority — first to slip under time pressure; ranking engine, comparison flow, and share flow are never allowed to slip.
- Every reachable screen has empty/loading/success/error states; accessibility (VoiceOver, Dynamic Type, 44pt targets, contrast) is a requirement, not polish.
- Cinematic dark-mode-first design system (near-black, marquee-red accent, condensed poster typography, film-reel transitions) applied consistently.
- Distinct from all other apps in this batch and from ~50+ prior workspace apps.

**Non-goals:** no accounts/auth, no social graph/feed, no live backend or CloudKit wiring (protocol boundary only), no music/album ranking track in v1, no live/production App Store commerce claims, no full round-robin (n²) comparison matching.

**Production-readiness definition:** compiles clean from a fresh checkout; persists across relaunch; ranking is deterministic and verifiably bounded (not "looks plausible"); works fully offline; Taste Card renders and shares; paywall gating logic is real but sandbox-only; accessible on every screen; widget can be added without crashing but may be the first thing cut for time.

**Decision rules for later phases:** under time pressure, cut in this order — widget first, then design polish, never the ranking engine, comparison loop, offline behavior, or share flow. Any conflict between spec ambiguity (Elo vs merge-sort wording) resolves to bounded merge-insertion. Metadata network dependency is always additive, never load-bearing. Monetization/sharing must never block free-tier core value delivery.

## Product Research

Looking at where Codex and Claude landed, they're not disagreeing — Claude is putting a sharper point on things Codex sketched in broad strokes, the same pattern as the previous phase.

**Where they agree:** The audience is the same in both takes — casual watchers with opinions, not cinephiles or people who already keep a Letterboxd diary. The mechanic (Beli-style pairwise picks) is inherently game-like, not form-like, and that's the whole point — it needs to feel like a fast, low-stakes tap-tap decision with visible progress after every single comparison, not an admin task. Both want a light IA (Codex: Rank / Browse / Share tabs), single-task-focused comparison screens, offline-first behavior that feels intentional rather than degraded, and accessibility treated as core, not decoration. Both also flag that the paywall/premium gating must never feel like it's blocking the free core loop.

**What Claude sharpened without contradicting Codex:** Claude names Beli specifically as the real proof-of-concept for this mechanic at consumer scale (rather than Letterboxd/IMDb, which are the wrong comps — those are archive tools for people who already know their opinions). Claude also surfaces one genuine spec gap Codex hadn't resolved: the contract between "add titles (movies+TV)" and "FaveOff+ unlocks TV as a separate track" is ambiguous, and Claude proposes a specific resolution (track-level gate: TV titles can be added/logged for free but only ranked after upgrade). Claude also adds two build-relevant risks Codex's draft touched on more loosely: a named "skip/can't compare" escape hatch for the ranking algorithm (so odd pairings don't break trust), and a heads-up that the condensed cinematic typography plus red-on-black accent needs real contrast/Dynamic-Type verification, not just aesthetic intent. None of this walks back Codex's framing — it fills gaps and turns "risks to watch" into concrete decision rules.

No open fight remains — this reads as convergence.

CONSENSUS: YES

## Final Output

**Audience & use context:** Mass-market casual viewers who watch a lot of movies/TV and have opinions, but aren't cinephiles and don't want a logging/critique app. The psychographic is "I liked both, but if you make me pick..." — someone who finds head-to-head comparison fun rather than effortful, and who has never had a way to discover their own real top 10.

**Comparable apps/patterns (assumption, not verified research):** Beli is the closest real-world proof that pairwise "which was better" comparisons work at mass-market scale with a shareable score card as the growth loop — treat it as the reference for pacing and lightness of interaction. Letterboxd/IMDb/Rotten Tomatoes are the wrong comps to imitate (archive/critique tools for people who already have opinions); useful only as a contrast case. Personality-quiz and bracket-style apps are the right pattern to borrow for onboarding clarity and the "ritualized choice" feel of each comparison screen.

**Platform-specific opportunities:** Light IA (Rank / Browse / Share), single primary action per comparison screen, offline-first with local fallback artwork so day-one value doesn't depend on network, ShareLink + ImageRenderer for a native-feeling Taste Card export, VoiceOver labels that describe the choice being made ("select this title over —"), and widget value treated as fully optional bonus, never a blocker.

**Major assumptions & risks:**
1. Movies-free/TV-paid ambiguity in the spec is resolved as: free users can add and watch-log TV titles, but only the movies track is ranked/shareable for free — FaveOff+ unlocks a second TV ranking track through the same engine. This needs to be a build assumption, not something the build phase guesses at.
2. The binary-insertion ranking algorithm needs a first-class "too close to call / haven't thought about it" skip path that doesn't corrupt the sort invariant (insert adjacent to the most recently compared item) — without it, arbitrary-feeling pairings (rom-com vs. slasher) will erode trust in the "real top 10" promise and trigger the exact abandonment risk the spec's own invalidation criteria warns about.
3. Comparison-fatigue ceiling is unknown — needs bounded, incremental (rank-on-add) comparisons, not a big upfront gauntlet, with visible progress/confidence cues after each tap.
4. Cinematic condensed typography + marquee-red-on-black is a contrast/Dynamic-Type risk: condensed display faces degrade at accessibility sizes and low-weight red-on-black can fail WCAG AA. Resolution: condensed face reserved for short display strings (titles, rank numbers), normal-width system style for anything that must scale, contrast-checked before any screen is called done.
5. Metadata scarcity/offline mismatch — genre/decade filters must work off whatever the local/offline provider or manual entry supplies, since a real API isn't guaranteed to be wired.
6. WidgetKit requires an App Group container (real plumbing: entitlements, shared container, cross-target schema) — sequence it dead last and don't let the main app's architecture take on complexity for its sake, consistent with it already being flagged lowest-priority.

**Implications for the first build:** Rank-on-add with bounded, incremental comparisons (no big-bang round); explicit empty/cold-start states for 0/1/2 titles; a named skip/tie escape hatch in the ranking engine; a track-level (not feature-level) free/paid gate between movies and TV; offline-safe metadata lookup as the default happy path; accessibility and contrast verified against the condensed typography before screens are considered finished; widget scoped and built last, isolated so its absence doesn't block anything else.

## Portfolio Selection

Codex came back in round 2 and explicitly conceded the point — no more 5-app manifest, no re-running candidate selection, single-app child build confirmed. Claude's round 2 message was posted concurrently and makes the same case in more detail, but both land in the same place: this is a single-app child project, the portfolio split already happened upstream, and the only selected app here is FaveOff. Codex even folds in the substantive carry-forwards (bounded merge-insertion, skip/too-close-to-call as first-class, offline-safe metadata default, non-blocking paywall) rather than treating them as still up for debate. No one is contesting the routing-header reading anymore — both speakers cite the same three prompt fields as dispositive.

CONSENSUS: YES

## Final Output

This is a portfolio **child** project, not a portfolio parent — the routing header (`PORTFOLIO_CHILD_PROJECT: true`, `Parent portfolio: multi-app-exp7`, `Selected app slug: faveoff`) means the cross-project selection (10 candidates → best 5) already happened one level up, before this child folder was ever created. That work is not this phase's job to redo, and doing so would have produced a manifest with four unrelated sibling apps (`mealsprint`, `loopfit`, `snapwardrobe`, `walletriff`) marked `build: true` inside the FaveOff folder — which doesn't belong here and risks real confusion downstream if anything acted on it.

**Decision for this phase:** No portfolio split is needed at this level. This child project has exactly one selected app:

```json
{
  "portfolio_parent": "multi-app-exp7",
  "portfolio_child": true,
  "selected_apps": [
    {
      "slug": "faveoff",
      "category": "Entertainment / Taste Ranking",
      "promise": "Rank watched movies and shows head-to-head to build a shareable personal top 10 taste card.",
      "target_user": "Casual watchers who find star ratings meaningless and want a fast, decisive, shareable read on their own taste.",
      "build": true
    }
  ]
}
```

Everything already locked in `prompt_contract` and `product_research` (bounded merge-insertion ranking, offline-first metadata provider as default with a "skip/too-close-to-call" escape that doesn't break the sort invariant, track-level movies-free/TV-paid gate, non-blocking sandbox-only StoreKit paywall, widget lowest-priority) carries forward unchanged — this phase doesn't reopen any of it. The one thing both speakers want carried into the build phases as a live constraint, not just a nice-to-have: the test for scope creep is whether a first-time user can go from zero titles to a shareable top-10 card in a couple of minutes without hitting a screen that requires reading instructions first — any core-loop screen that fails that is a defect, not a polish item.

## Initial Discussion

CONSENSUS: YES

## Final Output

Codex and Claude are lined up here — same promise, same user, same loop, and Claude's additions fill in gaps rather than fight anything Codex said.

**Product promise:** FaveOff turns quick head-to-head picks between watched titles into a real, trustworthy personal top 10 — something you'd actually be confident sharing, not a star rating you don't believe.

**Primary user & scenario:** A casual movie/TV watcher who has opinions but no system for them — not a completionist, not someone building an archive. The scenario that matters most isn't a big one-time onboarding dump; it's the steady-state habit of "I watched something, let me place it" — add a couple of titles a week, get a couple of quick comparisons, watch the list update. That recurring small loop is what the app needs to nail, not a one-time gauntlet.

**Core loop:** Add a title (manual entry by default, offline-safe placeholder art) → Compare it against the ranked list via bounded binary-insertion match-ups (with a skip/"haven't thought about it" escape) → **Placed** — a distinct, small payoff moment showing where it landed ("#4 of 12, ahead of X, behind Y") that both agree is the actual reward beat and can't be skipped over silently → Browse the living ranked list, filterable by genre/decade → Share a Taste Card via ImageRenderer + ShareLink. When there's nothing left to compare, the app shows a calm steady-state ("add something to keep ranking") rather than manufacturing forced re-comparisons just to stay engaging.

**Hard scope boundaries:** No accounts, no social graph, no network-first architecture, no music/album track in v1, no ML in the ranking loop, no full round-robin (n²) comparisons. Movies are the free-ranked track; TV titles can be added/logged for free but only ranked after upgrading (carried over from earlier phases). No manual drag-to-reorder of the list — the whole point is that comparisons, not curation, produce the order. No tutorial/instruction screens — if the comparison screen's two-tap interaction isn't self-evident on its own, that's a design defect to fix, not something to patch with an explainer.

**Measurable success criteria:** A brand-new user should reach a shareable card (even a small one, 3–5 titles) in a few minutes of real interaction, not a big session; ranking must be stable — the same two titles should never resolve to a contradictory order later; and the spec's own "abandons after a handful of comparisons" failure mode gets an operational definition: if most first-session users don't complete at least 5 comparisons, that's the tedious-flow failure, and the fix is a smaller default list or faster convergence — not more onboarding. Offline behavior (placeholder art, working share/export with no network) and persistence across relaunch are part of the bar, not stretch goals.

**Open tension flagged, not a blocker:** Claude names its own risk here — betting that "no tutorial, no manual reorder" holds up once real screens exist. If a later phase's wireframes show people genuinely lost on first launch, that's worth revisiting rather than defending on principle.

## Per App Product Brief

Both speakers landed in the same place again — this is the fourth phase in a row where Codex lays out the framework and Claude locks specific numbers/decisions on top of it without contradicting anything. No open fight here.

CONSENSUS: YES

## Final Output

**Target user & use case:** Someone who watches 2-3 things a week, has a strong reaction the moment the credits roll, but has never been able to confidently answer "what's actually your favorite movie." Not a Letterboxd person, not a completionist — they'll bounce off anything that smells like inventory management or logging. The use case is narrow and recurring: place the thing I just watched relative to what I already know I liked, and eventually have something worth showing off. Working App Store subtitle: "You already know which one was better."

**Paid value & subscription value:** Free tier is a genuinely complete, satisfying product — unlimited movie adds, full movie ranking via the comparison engine, genre/decade filtering, and full Taste Card generation + sharing for the movies track, capped at 25 ranked movies (large enough for a real top 10 to surface repeatedly, small enough to keep re-rank fast and leave paid list-length removal meaningful). A crippled free tier would kill the viral loop this app depends on, so the cap is generous by design, not a teaser. FaveOff+ ($3.99/mo or $24.99/yr) unlocks real functional depth, not cosmetics: the TV ranking track (TV titles can already be logged for free per the track-level gate; ranking and TV Taste Cards are paid), removal of the 25-item cap, saved/nameable genre-decade sub-ranking views instead of one-off filters, and periodic recap cards ("Your Q3 Rewatch") reusing the same Taste Card renderer against a different data slice.

**Core loop:** Watch something → add it in under 10 seconds (title + type, offline placeholder art by default) → one comparison at a time against the existing ranked list via bounded binary-insertion (skip/"too close to call" escape available) → the **Placed** moment as a first-class, purpose-built screen state — not a derived view of the list — showing rank number, what it beat, what beat it → back to browsing, or continue if insertion isn't done. Bounded at log2(n) comparisons per insert, never more. Cold-start/edge case locked now: if a title is auto-placed without a comparison (empty list or single-item list), the Placed copy must be coherent ("first one in — add another to start ranking"), not a broken "#1 of 1, ahead of nothing" string.

**Competitive wedge:** Letterboxd/IMDb/Rotten Tomatoes assume you already know your opinion and ask you to type it as a number or review — recall. FaveOff produces the opinion by making you choose — recognition, the same reason personality quizzes finish and forms don't. Against Beli (the closest real analog), the wedge is that posters carry identity weight restaurant photos never will, so the Taste Card has more emotional pull as a shareable object. Against bracket/tournament apps, the wedge is persistence — this is a living list that grows with you, not a one-shot bracket that resets, which is why someone opens it a second and fiftieth time.

**Viral/growth angle:** The Taste Card is the growth loop, not a leaderboard or social graph. The trigger is disagreement — "no way you have [movie] above [movie]" — and the natural reply is "make your own and prove me wrong," a zero-friction acquisition loop with no account creation or friend-finding required. Concrete design requirement flowing out of this: the card needs a small persistent brand mark and must read clearly at iMessage/Instagram-story thumbnail size, not just full-screen — if it looks generic or unbranded, the share doesn't convert to installs.

**Local-first & cloud-ready plan:** SwiftData is the sole source of truth for titles, comparisons, and computed rank position — no server round-trip anywhere in the core loop. Poster/metadata network lookup sits behind a protocol with an offline-first stub (manual entry, initials/color-block art) as the default happy path; missing metadata means "compare anyway, enrich later," never "cannot proceed." Cloud-readiness is an architectural bet enforced by code review, not a built feature: no view or ranking code may reach into SwiftData directly — everything routes through a repository protocol, so a future CloudKit sync layer or account system can slot in later without touching ranking logic.

## Next Steps Small

CONSENSUS: YES

They actually landed on a real compromise here, not just Claude caving. Claude looked back at round 1 and admitted lumping filters and the cap in with the paywall was wrong — once genre/decade are already fields on `Title` (which both agreed to two rounds ago), filter chips are just a `.filter{}` and an empty-state, not new scope, and cutting them would mean only testing four of the five locked core workflows. Same logic for the 25-item cap: it's a count check plus one static "you're capped" screen, and skipping it would quietly decide "free ranking is unlimited" without anyone actually deciding that. Codex gets both of those.

On the actual StoreKit purchase flow, Codex came around too, once Claude answered the real worry directly: the thing that prevents "hidden churn" (someone hitting a wall and discovering rules that weren't there before) is the boundary being visible and consistent — TV shows as ranking-disabled, the cap fires at 25 — not whether the upgrade button completes a real transaction. Both now agree the upgrade CTA is real, tappable UI, but it opens a "coming soon" sheet in this slice rather than wiring actual StoreKit 2 purchases, sandbox config, and restore logic — that's explicitly named as the next slice, not a cut feature.

## Final Output

**MVP slice for this phase:** one continuous, offline-first movies-centered loop — add a title (title + type, optional genre/decade, placeholder art, no network dependency) → bounded binary-insertion comparison with a skip/"too close to call" escape → a real Placed confirmation screen (rank + neighbors, with coherent 0/1-item cold-start copy) → ranked list view with genre/decade filter chips → Taste Card generation via `ImageRenderer` + `ShareLink`. Everything persists across relaunch through SwiftData and works with the network off.

**Must-have interactions:**
- Manual add-title form (title, type toggle, optional genre/decade — never required to proceed)
- Compare screen: two-way choice + skip, with deterministic, sort-order-preserving insertion (~log₂n per insert)
- Placed confirmation as its own designed state, not a derived list view
- Ranked list with genre/decade filter chips (minimal — filter-and-empty-state only, no saved views)
- TV titles are addable but show as ranking-disabled with a real, tappable "Unlock with FaveOff+" CTA that opens a "coming soon" sheet (no live transaction)
- Free movie-ranking cap enforced at 25, with its own capped-state screen using the same CTA/sheet pattern
- Taste Card render + working ShareLink export
- Full data model locked now: `Title.type`, optional genre, optional decade/year — so no future migration is needed even though filter UI and StoreKit are sequenced later
- Empty/loading/success/error states and VoiceOver labels on every reachable screen in this slice

**Cut list:** real StoreKit 2 purchase flow (sandbox config, transactions, restore-purchase) — explicitly the next slice, not deferred indefinitely; no tutorial/onboarding; no WidgetKit; no periodic recap cards; no saved/named sub-rank profiles; no drag-to-reorder; no live metadata/poster API in the core loop.

**Validation criteria:** fresh install, no network — add 3+ movies, complete bounded comparisons, reach a coherent ranked list and a legible, shareable Taste Card in under ~3 minutes; the same two titles compared twice never produce a contradictory order, including after relaunch; skip never corrupts the sort invariant; adding a TV title never pollutes movie ranking and never blocks the movie loop; the cap state appears predictably at exactly 25 ranked movies without blocking further adds; every screen in this slice shows correct empty/loading/success/error behavior. Failure on any of these is a defect in this slice, not a note for later polish.

## Detailed Discussion

CONSENSUS: YES

Codex came back and conceded both of the open points cleanly rather than re-arguing them: pending/insertion-state persistence is locked in as required now (not deferred), and the real sandboxed StoreKit 2 flow is locked into this build rather than staying a "coming soon" stub. Claude's round 3 message lands in the same place on both — it refines the pending-state point (agreeing crash-recovery persistence is required, but conceding that a visible "queue depth" UI for deliberate rapid-adding can genuinely wait as a post-v1 enhancement, since those turned out to be separable asks) and doesn't need to push further on StoreKit since Codex already got there first. The one new thing Claude adds — a named worst-case test scenario (skip the first two comparisons on a large list, fall back to the bottom with honest "come back and compare it for a more precise spot" copy instead of a vague "quick-pass" label) — is additive, not contested. Nothing left unresolved that changes build scope.

## Final Output

**Resolved requirements**
- Ranking engine is plain **binary-search insertion** into an already-sorted list (≤ ceil(log2(n+1)) real comparisons per insert). The "Ford-Johnson" name is retired from all downstream docs/code comments — it described the wrong algorithm.
- **Skip contract**: each insertion tracks a search window (`lo`, `hi`), `lastComparedIndex`, and a 2-skip uncertainty budget. Two skips in a row without a decisive pick terminates the insertion and places the title at the nearest edge of the current window (or `lo` if no real comparison ever happened). This must never contradict a previously confirmed ordering.
- Placement copy must be honest about how a title landed: a title placed via full comparisons gets normal "#N, ahead of X, behind Y" copy; a title placed via the skip-fallback with zero real comparisons gets explicit, non-generic copy (e.g. "added to the bottom of your list — come back and compare it for a more precise spot"), not a vague "quick-pass" label.
- Schema locks now: `Title.type` (movie/TV), `Title.year: Int?` (decade derived as `(year/10)*10`, never stored as free text), `Title.genre` as a single-pick fixed enum (not free text, not multi-select), and `Title.rankingState` (`unranked` / `insertionInProgress` / `ranked`) with the active insertion's search bounds (`lo`, `hi`, `lastComparedIndex`, `skipBudget`) persisted in SwiftData — required for crash/interruption recovery, not deferred. A full rapid-add "N more to place" queue UI is explicitly deferred post-v1; the persisted state just has to make resuming a single in-flight insertion safe.
- **Real StoreKit 2 purchase flow ships in this build**, sandbox-only: local `.storekit` config with both subscription products, a real upgrade sheet (price, buy state, pending/failed states), `Transaction.currentEntitlements` reconciliation on launch, a visible Restore Purchases action, and purchase failures fully contained to their own sheet so they can never block or stall the ranking loop. This reverses nothing — it fulfills what `prompt_contract` already locked as part of "production-ready"; the earlier "coming soon" sheet was a checkpoint for the smaller `next_steps_small` slice, not the final answer.
- Deletion: removing a title soft-archives/ignores referencing comparisons (no dangling pointers, no crash); deleting a title mid-active-comparison cancels that insertion and returns to the list with explicit "title removed, comparison canceled" messaging; a title baked into an already-generated Taste Card is safe because `ImageRenderer` output is a frozen bitmap, not a live reference.
- Duplicates are allowed by design (no uniqueness constraint, no merge-by-title) with an optional, non-blocking "similar title already exists" nudge.
- Subscription lapse: never hide or delete data a user already generated; only new paid-tier ranking actions (TV ranking, beyond-cap movie ranking) are blocked until re-entitlement.
- Accessibility contrast is a concrete, testable gate, not an adjective: marquee-red-on-near-black must hit **≥4.5:1 for body-weight text and ≥3:1 for large/bold text (WCAG AA)**, verified across the Dynamic Type range, before any comparison or Placed screen is considered done.
- Non-goals locked explicitly for this build: no push notifications, no custom Photos-save button (rely on ShareLink's built-in save), no data export/backup beyond the generated Taste Card image, no widget in this slice, no social graph, no forced re-comparisons, no manual drag-to-reorder, no tutorial/onboarding screens.

**Edge cases**
- 0/1-title cold starts produce coherent, non-broken Placed copy ("first one in — add another to start ranking"), never a nonsensical "#1 of 1" string.
- Skip-twice-immediately on a large (near-25-item) list is a named test case: must terminate deterministically, fall back to the window edge, and show honest bottom-placement copy rather than reading like a bug.
- App killed/backgrounded mid-insertion: resumed from persisted `lo`/`hi`/`lastComparedIndex` state, never silently loses the title or drops it into the ranked list without having gone through comparison or an honest skip-fallback.
- Title deleted while actively displayed in a live comparison screen: cancel cleanly, return to list, no crash.
- Duplicate titles (including legitimately same-named different works) are allowed and ranked independently; disambiguated by year when present.
- TV title added when movie list is at the 25-item cap: TV add still succeeds (TV was never counted against the movie cap), remains addable/loggable, stays visibly ranking-disabled with the "Unlock with FaveOff+" CTA.
- Filter chips with no matching results show a nudge state, not a blank screen.
- Purchase flow: slow/failed network mid-checkout stays fully contained to the purchase sheet; ranking loop keeps working unaffected the entire time.

**Data and privacy implications**
- No accounts, no cross-device sync, no analytics requirement this phase, no camera/mic/location permissions, no personal identifiers beyond user-entered text.
- All data lives locally in SwiftData; uninstalling the app deletes it via OS defaults — named openly as an accepted v1 limitation (no export/backup beyond the Taste Card image), with CloudKit sync as the stated future answer, not built now.
- Metadata network lookup (if ever wired) stays opt-in, behind a protocol, with the offline stub as the default happy path — never load-bearing for the core loop.
- StoreKit is the one real network touchpoint in this build; it's isolated so its failure modes can't leak into ranking/offline behavior.

**Risk register**
- *Trust collapse from arbitrary-feeling placements* → mitigated by bounded insertion + deterministic skip rule + honest, scenario-specific placement copy (not generic "quick-pass" language) for the low-confidence fallback case.
- *Crash/interruption data loss or invariant corruption* → mitigated by persisting rankingState + active insertion search bounds in SwiftData; resuming from persisted state rather than in-memory view state.
- *Condensed cinematic typography failing contrast at accessibility sizes* → mitigated by the explicit 4.5:1 / 3:1 WCAG AA targets checked across the Dynamic Type range before any screen ships.
- *Silent scope drift on StoreKit* → closed this phase by explicitly locking the real sandboxed flow into the build and naming it as not on the "safe to cut under time pressure" list (that list stays: widget first, then design polish — never ranking engine, comparison loop, offline behavior, share flow, or now StoreKit).
- *First-launch confusion with no tutorial* → stays a named, accepted bet, with an explicit bailout path recorded: if build/test reveals real confusion, the fix is simplifying the comparison screen's own affordances (larger VS-style divider, obvious two-tap zones, a first-time-only inline hint in empty-state copy), not adding a separate onboarding flow — that distinction is preserved so a later phase can't casually undo it.
- *Uninstall = total data loss* → named and accepted as a v1 limitation, deferred to the future CloudKit roadmap rather than solved now.
- *Rank position writes are O(n) per insert* → named as an explicit, accepted assumption; trivial at the 25-item free cap and still trivial at realistic paid-tier list sizes, not something requiring a different data structure in v1.

**Final assumptions**
- This is a single-app child build (FaveOff only); no further portfolio split applies here.
- Movies are the only free-ranked track; TV is addable/loggable for free but ranking-disabled until upgrade.
- Free movie ranking is capped at exactly 25 titles, enforced with its own capped-state screen.
- The comparison/skip/placement mechanics described above are the actual algorithm to build — not classic Elo, not full Ford-Johnson merge-insertion, not full round-robin.
- Every reachable screen carries empty/loading/success/error states, VoiceOver labels, and 44pt touch targets as a hard requirement, not polish.
- Widget is the only feature still explicitly first-to-cut under time pressure; everything else locked in this phase (including the real StoreKit flow) is now a hard build requirement for v1.

## App Features

CONSENSUS: YES

They've closed both gaps the last round left open. Codex flipped accessibility (contrast ratios, VoiceOver, 44pt targets) from Should to Must, agreeing with Claude that this was already locked with real numbers in an earlier phase and can't be treated as a later hardening pass. On deletion, Codex wanted it as its own Must bullet; Claude's counter — fold delete-safety (no crash, no corruption, clean cancellation) into the crash-safe-persistence must-have's acceptance criteria since they're really the same "what happens when the thing my insertion referenced disappears" problem, while keeping "where the delete button actually lives in the UI" as a separate Should — is a packaging difference, not a substance disagreement; both agree deletion must never crash or corrupt state, they just organize it differently. Nothing else moved: the core loop, the insertion engine, the cap/TV boundary, StoreKit, and the Taste Card are Must for both, and the won't-build list hasn't been touched by either side in two rounds. Claude's added "count the taps" test for whether policy screens (TV lock, cap, paywall) ever appear unprompted is a concrete tightening of a risk Codex already named, not a new fight.

## Final Output

**Must-have features** (each with its user story and falsifiable acceptance test):

1. **Add a title** — as a user I can add a movie or TV title with just name + type in under 10 seconds, optional year/genre, no network required. *Acceptance:* with airplane mode on, adding a title succeeds, shows placeholder initials/color-block art, and appears in the correct unranked/pending state immediately.

2. **Head-to-head comparison with skip** — as a user placing a new title I see one pairwise choice at a time, bounded to `ceil(log2(n+1))` comparisons, with a skip option that terminates deterministically after two consecutive skips. *Acceptance:* adding a 25th title and skipping the first two comparisons lands it at the bottom with the exact non-generic copy ("added to the bottom for now — compare later to refine"), never a vague "quick-pass" label, and never contradicts a previously confirmed pairwise result.

3. **Placed confirmation screen** — as a user I see exactly where my title landed and what it's adjacent to, as a designed reward moment, not a passive list refresh. *Acceptance:* 0-item and 1-item cold starts produce coherent copy ("first one in..."), never a broken "#1 of 1, ahead of nothing" string.

4. **Ranked list with genre/decade filter chips** — minimal, one-pass filtering off the existing `year`/genre schema fields. *Acceptance:* no-match state shows a nudge, not a blank screen; filters never block or gate the base ranked list.

5. **TV-addable-but-ranking-disabled boundary** — TV titles can be added/logged for free but show a visibly disabled ranking action with a real "Unlock with FaveOff+" CTA. *Acceptance:* adding a TV title never blocks or alters movie ranking state; the disabled row is one clean, non-modal explainer, not a forced interruption.

6. **25-item free movie ranking cap** — enforced with its own non-blocking capped state. *Acceptance:* the cap state appears exactly at the 25th ranked movie; further title adds still succeed; only ranking beyond 25 is blocked.

7. **Taste Card generation + ShareLink** — `ImageRenderer` → branded poster-grid card → native share sheet. *Acceptance:* card is legible at iMessage-thumbnail size with a persistent brand mark; rendered as a static image so later title deletion can never corrupt an already-shared card.

8. **Real sandboxed StoreKit 2 purchase flow** — local `.storekit` config, both subscription products, real buy/pending/failed states, `Transaction.currentEntitlements` reconciliation on launch, visible Restore Purchases. *Acceptance:* a forced network failure or slow checkout stays fully contained to the purchase sheet and leaves the ranking loop completely unaffected — a real test case, not an assumption.

9. **Crash/interruption-safe persistence (including delete-safety)** — insertion state (`rankingState`, persisted `lo`/`hi`/`lastComparedIndex`/`skipBudget`) is always derived from SwiftData truth, never assumed in-memory. This must-have's acceptance criteria explicitly cover deletion, since it's the same failure category (the thing an in-flight insertion referenced is gone): deleting a title mid-active-comparison cancels that insertion cleanly, returns to the list with explicit "title removed, comparison canceled" copy, no crash, no dangling comparison references. *Acceptance:* kill the app mid-insertion, relaunch, and it resumes from persisted bounds exactly; delete a title while it's on-screen in a live comparison and the app recovers cleanly instead of crashing.

10. **Accessibility as a build gate on the Compare and Placed screens specifically** — measured contrast ≥4.5:1 body-weight / ≥3:1 large-bold text across the full Dynamic Type range, VoiceOver labels on every actionable element, 44pt touch targets. *Acceptance:* a Compare or Placed screen that hasn't been contrast-checked isn't considered a finished must-have — it's an incomplete one. This is folded directly into must-haves #2 and #3's definition of done, not a freestanding polish pass.

**Additional testable acceptance framing that applies across the whole must-have list:** count the taps between "user just added their 3rd movie" and "user is looking at their ranked list of 3" — if the TV-lock explainer, cap warning, or paywall CTA appears anywhere in that path unprompted (without the user tapping something that leads there), that's a failure. Policy/boundary screens are allowed to exist; they're not allowed to intrude on a path nobody asked to be shown.

**Should-have:** metadata enrichment via an optional protocol-backed provider (offline stub remains the default, never load-bearing); per-title "confidence" indicator showing how many real comparisons it's actually been through; delete-as-a-discoverable-UI-affordance (where the delete action actually lives — swipe, detail screen, etc. — as opposed to delete-safety itself, which is a Must); non-blocking "similar title already exists" duplicate nudge; light micro-haptics on comparison taps.

**Could-have:** brand-forward visual/motion polish (film-reel transitions) beyond the restrained baseline; filter-selection persistence across sessions; queue-depth indicator for rapid multi-add (explicitly deferred, separable from the crash-safety persistence which is already a Must); CSV/history import.

**Won't-build:** WidgetKit, tutorial/onboarding screens, manual drag-to-reorder, social graph/feed, periodic recap cards, saved/named sub-rank profiles, music/album ranking track, live metadata/poster API as a load-bearing dependency, push notifications, custom Photos-save button, data export/backup beyond the Taste Card image, classic Elo, full Ford-Johnson merge-insertion, full round-robin n² comparisons, forced re-comparisons.
