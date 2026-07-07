# curio — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things stand after round 1: Codex and Gemini couldn't weigh in (both unavailable headlessly), so this round is really just one voice — but that voice laid out a complete, coherent contract and nothing contradicts it, so I'll treat it as the working agreement rather than force an artificial second round.

The gist: this thread only owns the Curio app — the idle "accumulate-and-organize museum/cabinet" game — not the other 7 apps in the portfolio. "MVP build mode" describes scope (how many features), not depth (how polished each one is) — the portfolio's "0 to production-ready" language overrides "MVP" on quality. So: SwiftUI, local-first, no server dependency, but genuinely production-ready by the end, not a demo.

Real disagreement: none surfaced, because there was only one participant. But there's an open structural gap that isn't a disagreement so much as an acknowledged blind spot: this thread has no way to actually verify Curio is distinct from the other idle game in the batch, or from the other 7 apps generally — it can only assert it and flag the assumption for program-level cross-checking later. That's carried forward as a recorded assumption, not something blocking this phase's consensus.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (portfolio-level batch-games prompt, Curio selected as one of 8 apps — the "accumulate-and-organize museum/cabinet idle game").

**Hard requirements:**
- SwiftUI, iOS native, local-first — no cloud backend or server sync in this build, but architected so cloud sync could be bolted on later without a rewrite.
- Core loop must genuinely be an idle/incremental game about accumulating and organizing a museum/cabinet-of-curiosities collection — the "curate and organize" identity is load-bearing, not flavor text on a generic clicker.
- Despite "MVP build mode," must reach production-ready quality by completion: full feature depth where implemented, not placeholder screens.
- Every reachable screen needs empty/loading/success/error states.
- Real monetization tied to actual content, modes, mechanics, or utility — never a cosmetics-only shop.
- Must be differentiable from generic incremental-game genre conventions (not a Cookie Clicker reskin) and from the sibling idle game in this batch (pending cross-check — see decision rules).
- Accessibility (Dynamic Type, VoiceOver, reduced motion), persistence, and testing are product requirements, not polish.
- Idle-game-specific correctness: offline-progress calculation correct across minutes/hours/days elapsed, numeric growth modeled to avoid overflow/precision loss at endgame scale, save integrity survives force-quit mid-write.

**Non-goals:**
- No cloud backend/server sync for this build.
- No multiplayer/social/shared-session features — that's a different category in the portfolio, not this app.
- No AR/ML/LLM feature unless it's genuinely load-bearing for the curation fantasy; bonus-point frameworks are optional and must not be forced in.
- No attempt to feature-match a live competitor idle game exhaustively — deliberate omission of some competitor features is fine and expected in service of differentiation.

**Production-readiness definition:** More than "it builds and runs a five-minute simulator session." Specifically: persistence correctly handles force-quit and elapsed offline time at multiple time scales; numeric systems won't silently overflow or lose precision late-game; every screen has all four states; accessibility is verified, not assumed; monetization has been walked through end-to-end as a real user would experience it (not just a paywall view that exists in code).

**Decision rules for later phases:**
1. If a design idea conflicts with local-first/no-cloud-backend, local-first wins; defer the idea to a documented "future cloud sync" note.
2. If a monetization idea can't be described as concrete content/mechanics/utility a paying user receives, reject it outright — don't soften it into cosmetics-with-extra-steps.
3. Since this thread can't verify uniqueness against the sibling idle game or other batch apps directly, record it explicitly as "assumed distinct pending cross-check" rather than asserting it as fact — that verification is a program-level responsibility, not something to paper over here.
4. If "MVP" and "production-ready" pull in different directions during scoping, production-ready wins: cut feature breadth before cutting depth or quality on whatever ships.

## Initial Discussion

Here's where round 1 landed: same situation as last phase — Codex and Gemini couldn't join headlessly, so it's one voice again. But that voice gave a complete, self-consistent answer that hits every required output for this phase, so I'm calling it consensus rather than manufacturing a second round with no new participants.

The core idea: Curio isn't an idle game with a museum skin — the *curating* is the progression system. You run expedition timers that dump raw specimens into an intake tray, you actively identify/catalog them (a satisfying beat on its own), then place them into cabinet slots where matching by region/era/type/color pays real multipliers that unlock better expeditions. If you could delete the placement step and the game would still work, that's the wrong build — so placement mechanics have to actually matter, not be a cosmetic sorting minigame with an auto-button that trivializes it.

Primary user: someone who already dips into idle games in 30-90 second bursts many times a day and wants one that leaves them with something they're visually proud of, not just a number going up — closer to the Two Dots/merge-game crowd than hardcore incremental min-maxers.

Scope was drawn tightly and explicitly: one expandable museum (wings, not parallel museums), a prestige loop ("donate a wing" for a permanent multiplier + fresh cabinet), no drag-and-drop-only interaction (a tap-based non-gesture placement path is mandatory, both for accessibility and because VoiceOver users can't drag reliably), no server- or LLM-generated content at runtime, no live-ops calendar, no trading/social/leaderboards. Monetization is a "Patron" tier sold as real utility — more cabinet capacity, faster/parallel expeditions, an exclusive region with its own specimens and set-bonuses — not a coat of paint.

Success criteria were made concrete and testable rather than vibes-based: offline-progress math verified against a closed-form calc within an epsilon at 1-minute/6-hour/7-day gaps; currency type proven not to overflow or truncate through at least two prestige resets; every screen's four states actually checked; the non-gesture placement path tested with VoiceOver on; IAP flow walked end-to-end in a StoreKit test config including restore-purchases.

No open disagreement surfaced — there's nothing to argue with, just one clear voice. The only carried-forward caveat is the same structural one from the last phase: this thread still can't verify Curio is distinct from its sibling idle game, so that stays flagged as an assumption, not a fact.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Curio is an idle game where dispatching expeditions earns you specimens, but the real progression engine is curating them — cataloging and arranging finds into a growing museum whose deliberate organization (not just its size) generates the multipliers that unlock everything further.

**Primary user and scenario:** A casual idle-game player who opens the app for 30-90 seconds at a time, many times a day (commute, waiting rooms, before bed), and wants an idle game that leaves behind something they're visually proud of — not just a bigger number.

**Core loop:** Earn currency → dispatch timed expeditions → collect specimens into an intake queue → actively identify/catalog each one → place it into a cabinet slot where region/era/type/color adjacency and set-matching pay real multipliers → those multipliers unlock longer/better expeditions → eventually prestige by donating a completed wing to the permanent museum for a lasting bonus and a fresh cabinet to fill.

**Hard scope boundaries:**
- One expandable museum built from wings — no parallel museums or biome-switching in v1.
- No drag-and-drop-only interaction; a tap-to-select, tap-to-place non-gesture path is a mandatory, first-class way to play (accessibility-driven, not a fallback).
- No server- or LLM-generated content at runtime — specimen flavor text is pre-written, keeping the app local-first with no API dependency.
- No live-ops/seasonal event calendar, no trading, no social features, no leaderboards.
- Monetization is a single "Patron" tier providing real utility (expanded cabinet capacity, faster/parallel expeditions, an exclusive expedition region with its own specimens and set-bonuses) — never cosmetic-only.

**Measurable success criteria:**
- Offline-progress calculation matches the closed-form formula within a defined epsilon across 1-minute, 6-hour, and 7-day elapsed gaps (automated test).
- The late-game currency numeric type doesn't overflow or silently truncate through at least the first two prestige resets.
- Every reachable screen (intake, cataloging, cabinet/placement, expedition dispatch, prestige, store) has verified empty/loading/success/error states.
- The non-gesture placement path is functionally tested with VoiceOver enabled, not merely present in code.
- The IAP purchase flow, including restore-purchases, is walked end-to-end in a StoreKit test configuration.

**Carried-forward assumption:** Distinctness from the sibling idle game in this batch remains unverifiable from within this thread and is recorded as "assumed distinct pending cross-check," per the prior phase's decision rule.

## Per App Product Brief

Here's how I'd sum up round 1: Codex and Gemini both couldn't join again, so this is once more a single voice — but it's a thorough, complete pass that hits every required piece for this phase (target user, paid value, core loop, competitive wedge, growth angle, local-first/cloud plan), and nothing in it contradicts the contract or the initial-discussion decisions from earlier phases. So I'm calling this consensus rather than stalling for a second voice that isn't available.

The core of it: Curio's target user is a specific persona ("Maya") — someone with several idle games already installed who's deleted most of them because they devolved into "watch a number go up," and who kept the one where she still remembers what her collection looks like. The paid "Patron" tier is scoped as three concrete things: a second concurrent expedition slot, two extra wing floor plans (real capacity, not an artificial timer wall), and one fully exclusive expedition region with its own specimens/set-bonuses that free players can't even see. Notably, it explicitly rejects bundling in a "2x offline progress" perk — that's flagged as the generic pay-to-skip move that would undercut the "we sell content, not shortcuts" identity.

The core loop is restated at the level of an actual 45-second session (check returned expeditions → dispatch new ones → identify and place 2-4 specimens), and the moment that has to feel great every time — completing a set and watching the multiplier tick up — gets called out as something to protect with dedicated animation/sound, not reuse generic feedback.

Competitive wedge: Curio is positioned as the only game where the *placement decision itself* changes your idle math going forward, unlike clickers (no placement decision) or merge games (placement without an idle-currency engine). There's an explicit warning attached: if engineering pressure later suggests computing bonuses from inventory totals instead of actual placement (to save cost), that would gut the entire differentiation and should be rejected even under schedule pressure.

Growth angle: honestly scoped as niche, not viral — the mechanism is a "wing showcase" screenshot/share view, no forced social graph or watermarking.

Local-first/cloud path: everything lives in local persistence in v1, but the save-state model should be a single versioned Codable snapshot with a schema-version field now, specifically so CloudKit/iCloud sync can be added later additively instead of requiring a migration rewrite.

One genuine new design pressure surfaced (not a disagreement, since there's only one voice, but a real point worth carrying forward): "one museum, wings-only" risks feeling repetitive by week 2-3 if every wing uses the same slot-grid shape. The proposed fix is that each wing should pose a genuinely different placement puzzle (adjacency-based, row-matching, rarity-threshold-based, etc.), and that this needs to be locked into the design phase rather than left as "reuse the same grid component." Also flagged as a hard requirement to preserve: there must be more than one viable way to complete a wing's bonus set, so curation stays a real creative decision rather than a solved optimization with one correct answer.

CONSENSUS: YES

## Final Output

**Target user & use case:** "Maya" — a casual idle-game player who already has several such games installed and has deleted most of them once they became pure number-watching. She opens Curio in short bursts (30-90 seconds) many times a day and wants to end up with something she's visually proud of, not just a bigger stat.

**Paid value / subscription value (the "Patron" tier):** Real, functional utility only — a second concurrent expedition slot (compounds every other system), two additional cabinet/wing floor plans (more real curation surface, addressing the free tier's natural capacity ceiling), and one exclusive expedition region with its own specimen family and set-bonuses that free users cannot access at all. Explicitly excluded: any "offline progress multiplier" as a paid perk — that reads as pay-to-skip, not pay-for-content; if it exists at all, it's an earned mid-game achievement, not something sold.

**Core loop:** Check returned expeditions → dispatch new ones with accumulated currency → identify newly-returned specimens via quick tap-classification → place them into cabinet slots where category/region/era/color matching pays real multipliers → completing a set is the single moment the whole app is built around, and needs distinct, protected feedback (sound/animation) since it happens on nearly every visit.

**Competitive wedge:** Unlike clicker-style idle games (no spatial decision) or merge/collection games (spatial decision without an idle-currency engine underneath), Curio is the only one where how you arrange your specimens actually changes your ongoing idle income — a badly organized cabinet is a strictly worse engine than a well-organized one with identical contents. This must remain true mechanically (real-time-computed bonuses tied to actual placement) — reducing it to inventory-total-based bonuses for engineering convenience would destroy the differentiation and is ruled out.

**Growth angle:** Niche, not viral, by design — the mechanism is a clean, chrome-free "wing showcase" view built for one-tap screenshotting/sharing, leaning on the same impulse that drives Animal Crossing/merge-game sharing. No social graph, no forced watermarking, no feature outside what the contract already scoped.

**Local-first & cloud-ready plan:** All core-loop state (profile, museum/cabinet layout, specimen catalog, prestige history) lives in local persistence only for v1 — no server dependency anywhere in the core loop. The save format should be designed now as a single versioned Codable snapshot with a schema-version field, so that CloudKit/iCloud sync can be added later as an additive change rather than requiring a save-format migration.

**Carried-forward design pressure for the next phase:** Wing variety needs to be a first-class design requirement, not a reused-grid shortcut — each wing should pose a structurally different placement puzzle (adjacency, row-matching, rarity-threshold, etc.) to avoid the loop feeling repetitive by week 2-3. Relatedly, every wing's bonus set must have more than one viable completion arrangement, so curation stays a genuine creative decision rather than a single "correct" solved layout.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Only one voice made it into this round again — Codex and Gemini are still unavailable headlessly — but that voice went through the whole phase checklist methodically: it took the vague spots left over from the last two phases ("donate a wing," "won't overflow," "offline progress") and turned each one into an actual resolved rule instead of leaving it as a nice-sounding phrase. Nothing here contradicts the contract or the product brief, so I'm calling it consensus rather than waiting on a second voice that isn't showing up.

Here's the shape of what got resolved:

**Resolved requirements**
- **Prestige is per-wing and additive, never a full reset.** Donating a completed wing locks it permanently into the public gallery (visible, no longer editable), grants its bonus forever, and opens a fresh wing to curate. The museum never wipes. This is load-bearing for the "visually proud of what I built" promise — a full reset would contradict it directly.
- **Currency/multipliers use a mantissa/exponent representation (or capped Decimal), not raw Double.** Double silently loses precision past 2^53, which idle-game compounding blows through in days, not weeks — this needs to be locked in now, not left for architecture to default to the convenient-but-wrong choice.
- **Elapsed time for expeditions/offline progress is always clamped to ≥0**, with return timestamps stored as absolute dates and cross-checked against a periodically-saved last-known-good timestamp — protecting against clock changes (accidental timezone travel, manual fiddling) causing crashes, stuck expeditions, or self-exploited free currency. This is explicitly not an anti-cheat measure (single-player, self-cheating isn't a real threat) — it's a correctness/crash-prevention measure.
- **Intake tray has a finite but generous cap; overflow while offline auto-converts excess specimens to a small currency refund with an explicit on-open message.** Never silent drop, never silent block.
- **Color can never be the sole carrier of a matching signal.** Any color-coded set-bonus axis needs a non-color source of truth (icon/pattern/label) with color as decoration — resolved now because retrofitting this after art is built is expensive.
- **Placement is non-destructive.** Moving a specimen out of a slot never deletes it (worst case: unplaced holding state), and breaking an active set bonus shows an immediate, visible multiplier drop at the moment of removal so cause and effect stay legible.
- **No IAP ever purchases a randomized outcome** (no paid specimen pulls, no paid expedition re-rolls) — this isn't just a monetization-identity choice, it also avoids tripping Apple's loot-box odds-disclosure requirements. Patron tier stays scoped to capacity, speed, and a fully-visible exclusive region, as already decided.
- **Each wing's puzzle rule is always visible on-screen for that wing**, not a one-time tutorial tip — necessary given wings intentionally use different placement puzzles and sessions are 30-90 seconds with no time to recall six rule sets from memory.

**Edge cases named and handled**
- Backward/forward system clock manipulation during expeditions.
- Intake tray overflow during long offline stretches (especially Patron parallel-expedition users).
- Rearranging a completed set and losing track of why a multiplier dropped.
- Colorblind/VoiceOver users where color is a matching axis.
- A returning player mid-way through several structurally different wings forgetting which puzzle rule applies.
- Patron subscription restored via StoreKit on a new device/reinstall while the actual museum content (which lives only in local storage) is not — a real expectation mismatch that needs explicit in-app messaging ("your Patron benefits are restored; your museum only lives on this device for now").

**Data and privacy implications**
- Surface is intentionally small: no accounts, no PII, no network calls in the core loop, StoreKit handles payment data off-device, local notifications need permission but carry no personal data.
- Local-first means no cloud recovery path if a device is lost/app uninstalled — the whole museum (the thing the product thesis is built on) disappears with it. Proposed mitigation: a manual export/import of the save snapshot (share sheet / iCloud Drive file) using the same versioned Codable format already planned for future sync — flagged as a should-have for this build, riding on infrastructure being built anyway, not a hard requirement.
- No server-side receipt validation means a jailbroken device could locally forge a Patron unlock — accepted as a named limitation appropriate to a casual local-first game, not something worth defending against.

**Risk register**
1. Ambiguous prestige model → resolved (per-wing, additive, no wipe).
2. Double-precision overflow at late game → resolved (mantissa/exponent or capped Decimal).
3. Clock-manipulation crashes/exploits → resolved (clamped elapsed time + last-known-good anchor check).
4. Silent specimen loss on tray overflow → resolved (auto-refund + explicit messaging).
5. Color-only set-matching excluding colorblind/VoiceOver users → resolved (non-color source of truth required).
6. Destructive placement causing emotional/data loss → resolved (non-destructive moves, visible bonus-loss feedback).
7. Loot-box-adjacent IAP triggering App Store odds-disclosure rules → resolved (excluded outright).
8. No offline data-recovery path for an emotionally load-bearing save → named with a should-have mitigation (manual export/import), not fully closed.
9. Subscription-restore vs. museum-content mismatch across devices → named as a known limitation requiring explicit messaging, not a bug to "fix" given local-first is already accepted scope.
10. Jailbreak-forged entitlement → accepted limitation, explicitly not in scope to defend against.

**Final assumptions carried forward**
- Distinctness from the sibling idle game and the rest of the batch remains unverifiable from this thread (unchanged from prior phases — still a program-level responsibility).
- The manual export/import save feature is a should-have, not a hard requirement — if time runs short, this is one of the first things cut before core-loop depth or quality is touched, per the "smaller finished app over larger half-built" rule.
- The per-wing-additive prestige model, mantissa/exponent numeric representation, and non-destructive placement are now treated as locked decisions for the design/architecture phases, not open questions to revisit.

## App Features

CONSENSUS: YES

Same pattern as every phase so far — Codex and Gemini couldn't join, so it's one voice again, but that voice did the actual job of this phase: it drew hard must/should/could/won't lines instead of restating principles, and it put concrete numbers on things that had stayed vague (three wing types, specific specimen counts, exactly which prestige/numeric/persistence rules are must-have vs. which polish items get cut first).

The one thing left genuinely open is self-raised, not a disagreement between voices: whether to commit to three structurally distinct wing puzzle types at launch, or cut to two now and treat the third as a post-launch should-have. The voice flagged a real risk — that "three wings" quietly becomes "two real wings and one reskin" under deadline pressure, which would silently violate the whole "curation is a genuine puzzle" thesis nobody's willing to compromise on. Since there's no second voice to weigh in and this is a closeable fork, I'm resolving it now rather than leaving it dangling: **three wing types stays must-have**, but with the risk explicitly written into the acceptance criteria as a gate, not left as an honor-system promise.

## Final Output

### Must-have (each ships with the acceptance criteria below)

1. **Expedition dispatch** — spend currency to start a timed expedition; timer runs in real elapsed time.
   *Acceptance:* Dispatch is blocked with a clear reason when currency is insufficient or slots are full; a running expedition survives app termination and shows correct remaining/complete state on relaunch; completing while the app is foregrounded and while backgrounded both route specimens to the intake tray.

2. **Intake tray with capped, generous size + overflow auto-refund** (already locked from detailed discussion).
   *Acceptance:* Tray at cap blocks nothing while online (expeditions can still return, oldest-safe overflow triggers refund); an offline period producing more specimens than tray capacity converts the excess to currency and shows an explicit on-open message stating how many and why; nothing is ever silently dropped.

3. **Tap-to-select / tap-to-place cataloging + placement flow — the only placement input method in v1** (drag-and-drop explicitly excluded, not deferred as a parallel path).
   *Acceptance:* A specimen can be fully cataloged and placed using only taps (no gesture required); the same flow is operable end-to-end with VoiceOver on; no cabinet action is reachable only via drag.

4. **Real-time set-bonus computation tied to actual placement**, across **exactly three structurally distinct wing types at launch**: adjacency/region-matching grid, row-based collection, rarity-threshold.
   *Acceptance gate:* each of the three wings' design spec must show at least two non-identical example layouts that both achieve the completion bonus, verified before that wing is considered done — not verified after the fact. **Risk gate carried into build:** if, at the architecture/implementation checkpoint, wing type #3 cannot be shown to use a scoring rule genuinely different from #1 or #2 (i.e., it would ship as a relabeled grid), it is demoted to should-have on the spot and the build proceeds with two wing types rather than shipping a fake third. This demotion decision is pre-authorized now so it doesn't require a late renegotiation.

5. **Per-wing additive prestige/donation** exactly as resolved previously (locks into permanent public gallery, grants permanent bonus, opens a fresh wing, museum never wipes).
   *Acceptance:* Donating a wing removes it from the editable/curating state but keeps it permanently visible in a gallery view; its bonus applies to subsequent calculations irreversibly; a fresh wing is immediately available to curate; no code path can trigger a full-museum reset.

6. **Mantissa/exponent or capped-Decimal numeric engine** for currency and multipliers.
   *Acceptance:* Automated test shows no overflow/precision loss through at least two prestige cycles at simulated late-game magnitudes.

7. **Offline-progress calculation**, elapsed time clamped to ≥0, cross-checked against a last-known-good timestamp.
   *Acceptance:* Matches closed-form expected value within a defined epsilon at 1-minute/6-hour/7-day gaps; a backward or forward system-clock jump never crashes, never freezes an expedition, and never grants unbounded free currency.

8. **Crash-safe persistence** via atomic write (temp file + rename).
   *Acceptance:* Force-quitting mid-save on next launch either loads the last fully-written snapshot or the one in progress — never a corrupted/partial file that fails to decode.

9. **Patron subscription**: second concurrent expedition slot, two extra wing floor plans, one exclusive expedition region with its own specimens/set-bonuses (10-12 specimens). No IAP purchases a randomized outcome.
   *Acceptance:* Purchase and restore-purchases both walked end-to-end in a StoreKit test config; a restored subscription on a device with no local museum shows the explicit "your Patron benefits are restored; your museum only lives on this device" message rather than silently showing an empty exclusive region with no explanation.

10. **Non-destructive placement** with immediate visible multiplier-drop feedback when a set breaks.
    *Acceptance:* Removing a specimen from any slot never deletes it (goes to an unplaced holding state); the multiplier UI updates the instant a set-breaking move happens, with no separate "recalculate" step or delay.

11. **Non-color source of truth** for any color-coded matching axis (icon/pattern/label carries the actual signal).
    *Acceptance:* Every color-keyed matching category is distinguishable by a colorblind simulation pass and by VoiceOver label alone, with color removed.

12. **Always-visible per-wing puzzle rule** on that wing's screen (not a one-time tutorial tip).
    *Acceptance:* A player can identify the active wing's matching rule from the screen itself, cold, without navigating to a help screen or recalling a tutorial.

13. **First-run flow**: guides a new player through one dispatch, one catalog, one placement, and shows the multiplier react.
    *Acceptance:* A player who has never opened the app before reaches a completed placement and a visible multiplier change without needing outside instructions.

14. **Content baseline**: three free wings at ~12-16 specimens each, plus the one Patron-exclusive region at 10-12 specimens with its own set-bonuses.
    *Acceptance:* Content counts are met before calling the build content-complete; this is the number "production-ready" is measured against, not an open-ended "however many we get to."

15. **Every screen has empty/loading/success/error states** (blanket must, not itemized per feature).
    *Acceptance:* Each of the app's reachable screens (intake, cataloging, cabinet/placement, expedition dispatch, prestige, store) has been checked in all four states, not assumed.

### Should/could (value-add, cut first under time pressure, in this order)

1. Wing showcase/share screenshot view.
2. Manual export/import of the save snapshot (mitigates the named no-cloud-recovery gap).
3. Local notifications for expedition-return.
4. A fourth wing puzzle type beyond the three committed must-haves.
5. An earned (never sold) offline-progress-boost achievement.
6. Deeper sound/animation polish beyond the protected set-completion moment.

### Won't-build

- Cloud/CloudKit sync (save format stays sync-ready; sync itself isn't built).
- Any multiplayer, social, trading, or leaderboard surface.
- Any LLM/AR/ML feature (nothing in four phases of discussion made a real case for one).
- Any IAP purchasing a randomized outcome.
- Parallel museums or biome-switching.
- A live-ops or seasonal event calendar.
- Drag-and-drop as a second placement input method (deliberately excluded, not deferred).

### Carried-forward note

Distinctness from the sibling idle game and the rest of the batch remains unverifiable from this thread — still a program-level responsibility, unchanged since the first phase.
