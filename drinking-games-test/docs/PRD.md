# drinking-games-test — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round three actually closed the two open items from last time — and then surfaced that the real disagreement isn't a gap to fill, it's Gemma3 pushing to delete things the user explicitly asked for.

**Deck exhaustion is ratified.** Codex, Gemini, and I all landed on the same three-way end condition: the game ends on whichever comes first — the 4th King drunk, 10 full rounds completed, or the 53-card deck running dry. Gemini did the math out loud and signed off without hedging. This closes the gap that's been open since round one.

**Image export and funniest-rule stay in scope.** Codex, Gemini, and I all made the same point independently: "Export game recap as a sharable image" is sitting verbatim in the user's own prompt under both "Key features" and "Tech" — it's not ours to cut in a contract phase. Funniest-rule already has a fully specified, deterministic design (end-of-game ballot from rules that actually fired, defaulting to the last custom/Joker rule if skipped, explicit "no custom rules this game" empty state if nothing fired) that three people converged on independently across two rounds.

**Where it's not resolved:** Gemma3 used round three to reject all three of these again — cut funniest-rule, cut image export, and go back to plain "10 turns or cup empty" without the deck-exhaustion condition — without engaging with the specific counterarguments (the verbatim-prompt point, the working vote-mechanism design, or the 60-draws-against-a-53-card-deck arithmetic). That's a real, repeated objection, not nothing, but it's now a lone dissent against four aligned voices (Codex, Gemini, me, and Qwen's restated list — which, tellingly, already includes funniest-rule and image export straight from the prompt without Qwen even weighing in on the debate). Since the panel's own decision rule is that the original prompt outranks any single contributor's risk preference, and Gemma3's objections don't identify an actual ambiguity in the prompt — they argue for removing stated requirements — I don't think this blocks calling the phase done. It's worth carrying forward as a flagged risk (Gemma3's specific worry about unmoderated UGC in an exported image), not as an open scope question.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim in `initial_prompt.md` — Kings, local pass-and-play, 2–6 players, SwiftUI + CoreData, no server/login, customizable/saveable rulesets, game history with recap, sober-mode-default with gated drinking mode, face-down privacy shield, shareable recap image export, Kings-only MVP scope. This text is binding; nothing below overrides it.

**Hard requirements**
1. Single SwiftUI iOS app, local pass-and-play for exactly 2–6 players on one device, sequential turn order.
2. Standard 53-card deck (52 + 1 Joker); bundled default Kings ruleset.
3. Deterministic end condition — game ends the instant any of the following is true, whichever comes first: (a) 4th King drawn (cup fills ¼ per King, full on the 4th), (b) 10 full rounds completed (every player has drawn 10 times), (c) deck exhausted. Each condition writes its own distinct end-reason to the recap (e.g. "cup finished," "round limit reached," "ran out of cards") — no generic/blended messaging.
4. Game engine is a pure Swift state machine, decoupled from SwiftUI and CoreData, fully unit-testable.
5. Mandatory handoff privacy shield between turns: card is fully hidden, requires an explicit confirmation tap from the incoming player to reveal, fails safe to hidden on backgrounding/rotation/rapid taps. Optional sensor-based face-down detection is allowed only alongside a manual override button (simulators and flat-table use must still work).
6. Rulesets are editable pre-game and persist locally via CoreData across relaunches.
7. CoreData-backed game history: players, full round timeline, and recap highlights (most drinks/dares, funniest rule, end-reason).
8. Funniest rule: end-of-game ballot over rules actually triggered that session; defaults to the last custom/Joker rule if skipped; shows an explicit empty state ("no custom rules played this game") if none fired.
9. Sober mode is the default and only changes copy. Drinking mode unlocks via a one-time in-app self-attestation dialog (no ID/OS-level check), reversible anytime. App Store age rating is set for alcohol content regardless of current toggle state, since Apple rates the binary, not runtime state.
10. Recap exports as a shareable image (name, date, player list, highlights) via `ImageRenderer`, with a visible error/blocked state if Photos/share permission is denied.
11. Every reachable flow (history load/save, rule edits, export, handoff, end-of-game) has explicit empty, loading, success, and error states — no silent failures.

**Non-goals:** no server/backend/accounts/login; no networking, multiplayer, or cross-device sync; no other card-game variants (Hearts, Asshole, etc.); no monetization or IAP; no biometric/ID age verification; no content moderation or filtering of custom rule text (accepted local-UGC risk, extends to the export image); no analytics/telemetry, and therefore no usage-percentage success metrics.

**Production-readiness definition:** no placeholder screens or stubbed flows; zero card leakage across handoff under any timing/gesture/backgrounding scenario; crash-free at min (2) and max (6) player counts including the deck-exhaustion path; ruleset and history persistence survive relaunch; CoreData or export failures degrade to a visible, actionable error rather than losing game state; 44×44pt minimum tap targets and accessibility labels on core controls; sober/drinking copy sets are fully distinct with no cross-mode placeholder strings. Success is measured by binary QA pass/fail per flow (e.g. "a full 6-player game completes end-to-end without crash," "rule edits survive relaunch," "export succeeds and also degrades gracefully when permission is denied") — never by user-percentage metrics, since no telemetry exists to measure them.

**Decision rules for later phases:** the original prompt outranks any single contributor's preference — features stated in it (image export, funniest rule, etc.) cannot be silently cut, only implemented, deferred with a named reason, or flagged as a risk. When ambiguous, choose the stricter, more deterministic, more privacy-preserving interpretation and write the assumption down explicitly rather than picking silently. Anything that improves polish but weakens privacy, safety, or reliability is deferred. Changes to core loop math, recap metrics, or gating must preserve backward-compatible reads of already-saved histories and rulesets. Accepted, named risk going forward: unmoderated custom Joker-rule text can appear in the exported image — this is a deliberate local-only-app tradeoff, not an open defect.

## Product Research

CONSENSUS: YES

Here's how this actually shook out. For the second round running, three of the five seats didn't produce usable product research: the Gemini seat came back broken/off-topic again (this is now twice), Qwen2.5Vl declined to answer rather than fabricate something (better than noise, but no signal), and Gemma3 drifted into describing what sounds like a different app entirely ("trust it to handle their money"), then spent its turn arguing to reopen things the prompt-contract phase already ratified with explicit consensus — reinstating deck-exhaustion ambiguity, adding an auto-correcting rules engine, and proposing usage-metrics collection that directly contradicts the contract's no-telemetry non-goal. None of that is new research; it's litigating settled scope in the wrong phase, so it's not carrying forward.

The real work happened between Codex and Claude, and they've converged into a coherent, usable picture:

**Audience:** in-the-room, synchronous groups of adults who already know Kings — including sober friends and designated drivers playing alongside drinkers. Not a discovery app, not something opened daily; the whole value is "we just pulled this out at a party, zero confusion." That means onboarding needs to be close to instant — a handful of taps from launch to first card draw, sensible defaults, minimal required setup.

**Comparables (labeled as assumptions, no live market research done):** this looks and feels more like a local turn-by-turn utility — score trackers, pass-and-play timers, minimal "reveal" flows — than a flashy social app. Existing drinking-game apps in this space tend to lose trust through card leakage, ad clutter, and friction; the differentiator here is being the boring, predictable, trustworthy option.

**Platform opportunities:** SwiftUI state-driven screens built around the deterministic engine, `ImageRenderer` + native ShareSheet for the recap export, light haptic feedback on card draw and cup-fill (with the required hardware capability check), and real accessibility defaults (Dynamic Type, 44×44 tap targets, VoiceOver labels, high contrast). If any sensor-based face-down detection gets used, it always ships with a manual override and fails closed rather than clever.

**Two concrete build decisions that came out of this round, both small and testable:**
1. Sober mode is a first-class voice, not a word-substitution pass on drinking-mode copy — whoever writes the ruleset text needs to write two genuinely distinct tracks, and it should be QA-checked for zero cross-mode leakage.
2. Mid-game interruption is resolved: an in-progress game does not persist across an app relaunch or kill. `isIdleTimerDisabled` stays true during active play to minimize auto-lock in the first place, but if the app does get killed mid-round anyway, the game is simply gone — no partial/orphaned history row, just a clean setup screen on relaunch. Codex's round-2 comment left a little more room for a "resume to same turn" option; going with the stricter, simpler, lower-privacy-risk version here (no resume, ever) per the standing decision rule from the contract phase that ambiguity gets resolved toward the stricter/more deterministic/more privacy-preserving choice.

**Risks carried forward for the build phase**, per Codex and Claude both: the handoff privacy shield is the single highest-stakes surface in the app — real failure modes to specifically hunt for are notification banners sliding over a "hidden" card, one-frame leaks during SwiftUI transitions, and rapid-tap bypass; there's a genuine UX tension between confirmation-tap friction (protects privacy) and reveal speed (protects a group's willingness to keep using the app mid-session), which needs an actual six-player playtest rather than being reasoned out in the abstract; and the export/share-sheet path is the one flow most likely to behave differently on a real device than in the simulator, so it needs explicit on-device testing, not just simulator coverage.

## Final Output

**Audience and use context:** Small in-person friend groups (mixed drinkers and sober/designated-driver players) who already know Kings, playing a single synchronous session with a phone passed around the table. Not a discovery or daily-use app — success is "does it survive tonight," and onboarding must get from launch to first card draw in just a few taps with sensible defaults.

**Comparable apps or patterns to learn from (assumptions, not verified market research):** Local turn-by-turn utilities — pass-and-play score trackers, board-game timers, minimal reveal-style companions — rather than social/discovery apps. The broader "drinking game app" category on the App Store is assumed to skew cluttered, ad-driven, and untrustworthy (leaky card reveals, forced ads between turns); this app's edge is being fast, private, and predictable instead of feature-heavy.

**Platform-specific opportunities:** SwiftUI state-driven navigation matching the deterministic game engine; `ImageRenderer` + native ShareSheet for the recap export; light haptic feedback on card draw/cup-fill (behind a hardware capability check); Dynamic Type, dark mode, and full accessibility (44×44 tap targets, VoiceOver labels) coming for free if SwiftUI defaults aren't fought; any sensor-assisted face-down detection always paired with a manual override, failing closed rather than relying on timing cleverness.

**Major assumptions and risks:**
1. Assumption: audience already knows the rules of Kings and wants facilitation, not teaching — so onboarding should stay minimal.
2. Assumption: the competitive landscape is weak on trust/privacy/ad-cleanliness; this is unverified but shapes the differentiation bet.
3. Risk (highest priority): the handoff privacy shield can leak via notification banners, screen rotation, backgrounding, animation-frame gaps, or rapid double-taps — this needs to be a dedicated adversarial QA pass, not folded into general testing.
4. Risk: confirmation-tap friction on every handoff creates a real tension between privacy safety and in-session retention (people tapping through reflexively by round 6) — needs an actual multi-player playtest to tune, not a design guess.
5. Risk: export/share-sheet behavior diverges between simulator (fake permission dialogs) and real devices (actual Photos/Screen Time restrictions) — needs explicit on-device test coverage as its own QA scenario.
6. Risk (accepted, carried from the contract phase): unmoderated custom Joker-rule text can appear in the exported image; this phase adds that the app's copy/onboarding should surface this plainly to users rather than let it be a silent surprise.

**Implications for the first build:**
- Sober mode and drinking mode need two actually distinct copy voices written from scratch, not a search-and-replace pass — and should be checked for zero cross-mode string leakage as a discrete QA item.
- Mid-game state is intentionally disposable: no relaunch/resume of an in-progress game. `isIdleTimerDisabled` is set true during active play to reduce the auto-lock case; if the app is killed anyway, relaunch lands cleanly on a fresh setup screen with no orphaned or corrupted history entry. This is the smaller, safer, more testable choice over building real crash-safe mid-turn state recovery.
- Engineering priority order for the first build: the deterministic state machine and the zero-leak privacy shield come first and get the most scrutiny; ruleset editing and image export are contractually required and must work, but can ship functionally plain before they get visual polish.
- Screen flow stays deliberately narrow: Setup → Game (shielded reveal → rule → pass) → End-of-game recap (with funniest-rule vote/empty-state) → Share/History — no extra branches added beyond what the contract already scopes.

## Portfolio Selection

Codex, Claude, and (for round 1) Gemma3 all landed in the same place: this is one app, not a portfolio. The prompt names exactly one product ("Build Kings"), explicitly excludes other variants ("Kings rules only, not Hearts, Asshole, or other variants"), and every decision baked into the contract and research phases (single deterministic engine, single CoreData schema, single screen flow) assumes one coherent codebase. Nobody argued for a split — the Gemini seat again returned a broken fallback with no content, and the Qwen2.5Vl seat just re-pasted prior-phase boilerplate rather than engaging with the actual question. That's not disagreement, just non-participation. Codex and Claude even converged independently on the same slug philosophy (keep the existing project folder, don't invent a new one) and the same build=true intent.

CONSENSUS: YES

## Final Output

**Decision:** Single-app run. No portfolio split, no sibling projects, no portfolio-json manifest needed.

**Why:** The original prompt names one product only and explicitly forecloses breadth — "MVP with Kings rules only (not Hearts, Asshole, or other variants)." There's no category list, count, or portfolio language anywhere in the ask. Every hard requirement ratified in the contract phase (one deck, one engine, one CoreData store, one screen flow: Setup → Game → Recap → Share/History) was built assuming a single app. Splitting into sibling apps (e.g., by mode, by variant, or by some invented category axis) would fragment decisions that only make sense unified, and would directly override the user's own written scope boundary — that's scope invention, not thoroughness.

**Selected app:**
```json
{
  "apps": [
    {
      "category": "Local pass-and-play party/social utility game",
      "slug": "drinking-games-test",
      "promise": "The trustworthy, private, zero-setup way to run a full Kings game off one shared phone — deterministic turns, mandatory handoff privacy shielding, customizable/saveable rulesets, sober-mode-default with gated drinking mode, game history with recap metrics, and a sharable recap image export.",
      "target_user": "Small in-person groups of 2–6 adults (including sober/designated-driver players) who already know Kings, want near-zero setup friction, and need zero card leakage during phone handoff across a full session.",
      "build": true
    }
  ],
  "portfolio_parent": false,
  "selection_rationale": "The prompt specifies a single product with a single bounded scope (Kings only), and prior phases already ratified one engine/one schema/one screen flow around that single app. No category, count, or portfolio intent appears anywhere in the original ask.",
  "rejected_alternatives": [
    "Separate apps for sober mode vs. drinking mode",
    "Separate apps per card-game variant (Hearts, Asshole, etc.) — explicitly excluded by the prompt's own non-goal",
    "A companion web/backend multi-device app — excluded by the local-only, no-server requirement",
    "A standalone recap-exporter utility as its own app"
  ]
}
```

**Note for future phases:** the project slug/folder name "drinking-games-test" refers to the drinking-game genre in general, not a multi-game portfolio — the app itself builds exactly one game (Kings), per the prompt's explicit "Kings rules only" scope boundary. This should not be reopened as a portfolio question later.

## Initial Discussion

CONSENSUS: YES

Here's where this landed. Codex and Claude both did the real work this phase and converged tightly — Gemini's seat again fell back to a broken local model that just spat out garbled JSON from the *previous* phase (portfolio selection, not this one), Gemma3 spent its turn re-fighting battles that prompt-contract already settled with explicit consensus (funniest rule, deck-exhaustion math, success metrics) instead of engaging with this phase's actual question, and Qwen2.5Vl just listed section names without content. None of that is new input for this phase, so it's not carrying forward.

Codex and Claude agree on all the required pieces: one clear product promise, the same primary user (small in-person adult group, mixed drinkers/sober players, already knows Kings), the same core loop (configure → shielded draw/reveal/confirm → rule fires → handoff → repeat until 4th King / 10 rounds / deck exhaustion, whichever comes first → recap → share), and the same hard scope boundaries pulled straight from the ratified contract (single device, 2–6 players, Kings only, no networking/accounts/sync, no mid-game resume, no moderation of custom rule text, no telemetry). Claude added one concrete design refinement Codex didn't have — that the handoff shield needs to render as the *first* thing in a player transition, not a separate step after a "pass to next player" screen, to close the one-frame-leak risk everyone flagged in research — and that's a good, specific addition rather than a disagreement. Both frame success the same way: binary, QA-checkable pass/fail per flow (crash-free 2p and 6p runs, zero card leakage across dozens of adversarial handoffs, distinct end-reasons per end condition, persistence surviving relaunch, export succeeding or failing visibly) since there's no telemetry to lean on.

## Final Output

**Product promise:** Kings is the app you pull out at a party that runs a complete, private, pass-and-play King's Cup game on one shared phone — nobody ever sees a card that isn't theirs, nobody argues about the rules, and everyone gets a shareable recap afterward.

**Primary user and scenario:** A host and 2–6 friends around a table who already know how to play Kings — including sober or designated-driver players — pull out one shared phone at a party. They want near-zero setup (a few taps from launch to first draw), no rule arguments, and total confidence that the phone never shows a card to the wrong person as it's passed around, sometimes dozens of times over a session.

**Core loop:** Set up players and confirm the active ruleset (default bundled, or a saved custom one) → deck is fixed at 53 cards → each turn: card is shielded/hidden until the receiving player explicitly confirms → card reveals with its rule (drink/dare framed per sober or drinking mode) → drink/dare counts and cup fill update → phone is handed off and immediately re-shielded for the next player, with the shield rendering before any "pass to" UI so there's no transitional gap where a card could leak → repeat until the earliest of: 4th King drawn (cup full), 10 full rounds completed, or the deck runs out → game ends with its own specific, correctly-labeled end-reason → recap screen (highlights, funniest-rule ballot or empty state, full timeline including a visually honest partial final round) → optional shareable image export and local history save.

**Hard scope boundaries:** One app, one variant (Kings only — no Hearts, Asshole, or other games); local pass-and-play on a single device for exactly 2–6 players; no server, accounts, login, networking, or cross-device sync; no in-progress-game resume across an app relaunch or kill (an interrupted game is simply gone, by design); no content moderation or filtering of custom rule text, even though it can appear in the exported image (accepted, named risk); no analytics or telemetry, and therefore no usage-percentage success metrics — everything is measured by binary QA pass/fail.

**Measurable success criteria:** Setup takes a handful of taps with no forced tutorial; a full 2-player game and a full 6-player game each complete end-to-end with zero crashes across all three possible end conditions (each with its own distinct, correctly labeled recap end-reason — no generic fallback text); across at least 50 handoff cycles under adversarial conditions (backgrounding, rotation, rapid double-taps, incoming notification banners), zero frames of the wrong player's card content are ever visible; ruleset edits and completed game history both survive a force-quit and relaunch; recap always includes name/date/players/highlights with sober and drinking copy fully distinct (no cross-mode leakage); export either succeeds and produces a correct image or fails with a visible, actionable error — never a silent no-op.

## Per App Product Brief

CONSENSUS: YES

Three of five seats actually engaged this round — Codex, Claude, and Gemma3 — while Gemini and Qwen2.5Vl came back empty (unavailable/no fabrication), which mirrors the pattern in every prior phase, so it's noted but not blocking.

The one thing that looked like it might be a real fight — subscription value — turned out not to be. The phase playbook asks for "paid value and subscription value," but the ratified contract explicitly says no monetization or IAP for this build. Claude named that tension directly instead of quietly picking a side, and it turns out Codex had already landed on the same resolution independently: v1 ships completely free, zero IAP, exactly as contracted, and this phase's job is only to describe what a real (non-cosmetic) paid tier would look like *if* monetization is greenlit in some future phase — not to build it now. Both converge on the same shape for that future tier too: it lives entirely outside the core fairness loop (never gates the privacy shield, the bundled default ruleset, or export), and instead unlocks things that compound with repeat use by the same friend group — extra curated ruleset packs, unlimited saved custom rulesets (vs. a small free cap), and optional iCloud sync of rulesets/history across a group's own devices. Gemma3's "premium unlocks more rulesets" idea fits inside that same shape without contradicting it.

Everything else was already agreement, not new debate: same target user (host + 2-6 friends, mixed drinkers/sober, already know Kings), same core loop (shielded draw → confirm reveal → rule fires → re-shield → repeat to 4th King/10 rounds/deck-out → recap → export), same competitive wedge (boringly trustworthy, zero card leaks, no ads, where competitors fail), same growth mechanism (the shareable recap image is the entire viral loop — no accounts, no invite codes, no social layer), and the same local-first/cloud-ready split (CoreData and zero network calls for v1; CloudKit sync of finished games and rulesets only, strictly additive/opt-in, never a gameplay dependency).

## Final Output

**Target user and use case:** A host and 2–6 friends already fluent in Kings (including sober/DD players) pull one shared phone out at a party for a single synchronous session — bursty, infrequent per person, success is "the app survived tonight without an argument or a leaked card."

**Paid value and subscription value:** V1 ships completely free — no IAP, no monetization, no paywall anywhere in the core loop, matching the ratified contract's non-goal. This phase specifies (not builds) what a future optional tier would look like if monetization is ever greenlit: extra curated ruleset packs beyond the bundled default, unlimited saved custom rulesets (vs. a small free cap), and opt-in iCloud sync of rulesets/history across a user's own devices. That future tier must never touch the privacy shield, the bundled default ruleset, the core draw/reveal/handoff mechanic, or export — gating any of those would break the app's entire trust proposition. No ads in any tier, ever.

**Core loop:** Configure players + ruleset → shielded draw → explicit confirm-tap reveal → rule fires (drink/dare framed per mode) → counts/cup update → immediate re-shield before any "pass to" UI appears → repeat until 4th King, 10 full rounds, or deck exhaustion (whichever comes first) → recap with distinct end-reason, funniest-rule ballot or empty state, full timeline → optional image export + local history save.

**Competitive wedge:** Wins by being boringly correct where competitors fail — zero card leaks, deterministic end logic, no ads, no clutter, visible error/success states everywhere. Trust is the entire moat.

**Viral/niche growth angle:** The exported recap image (drinks/dares highlights, funniest rule, small app attribution) posted to a group chat or story after the party is the sole growth loop — no accounts, referral codes, or in-app social features, consistent with the local-only non-goal.

**Local-first and cloud-ready plan:** V1 is 100% on-device (CoreData for rulesets/history, no network calls, no cloud dependency for gameplay). Future cloud extension is strictly additive and opt-in — CloudKit sync of completed games and saved rulesets only, never in-progress game state, and the app must behave identically with it off or denied.

## Next Steps Small

This round actually closed the gap. Codex made the case that stopping at an on-screen recap leaves the export/persistence risk completely untested even though it's been named as a top risk since the very first research phase — and Claude did something worth calling out explicitly: read that argument, agreed it was right, and changed position instead of defending the earlier stance. That's a real update, not just politeness.

Where Codex and Claude land together now: slice 1 is the full loop through to a **persisted, exportable** recap — shielded handoff with confirm-tap reveal, all three end conditions built in from day one, on-screen recap with correct end-reason and honest partial-round timeline, a CoreData save of the completed game so it's still there after a relaunch, and real image export tested with actual success and permission-denied states — on a physical device, not just the simulator, since that's the specific gap prior phases already flagged. Claude's reasoning for including persistence is a good one: a finished-game save is small and low-risk on its own, and building the recap view now without ever thinking about "this has to be reconstructable from a saved record" just means retrofitting it later on a data model that wasn't designed for it. Both agree drinking mode and ruleset editing stay out of slice 1 — not because they're risky, but because they're genuinely orthogonal, bolt-on-able later without touching the state machine, shield, or export pipeline. Funniest-rule voting stays deferred too, but the cheap "no custom rules this game" empty state ships now since there's nothing to gate it on.

Gemma3 is still arguing to cut history persistence out of slice 1 as a "nice-to-have," but that's now a lone position against two people who've actually engaged with and rebutted that exact argument (the retrofit-cost point, and the "this is a named top risk, not polish" point) — it's not restating old ground this time, but it also doesn't grapple with the counterargument, so I don't think it should reopen something Codex and Claude worked hard to actually resolve together this round.

CONSENSUS: YES

## Final Output

**MVP slice:** One complete, real Kings session for 2–6 players using only the bundled default ruleset, sober-mode copy only (no drinking-mode toggle at all in this slice) — set up player names → shield renders first on every handoff, confirm-tap required to reveal (no separate "pass to" screen, so there's no frame where the wrong card could show) → rule fires, drink/dare counts and cup fill update on a persistent, always-visible HUD → re-shield immediately → repeat until whichever end condition hits first: 4th King, 10 full rounds, or deck exhaustion → recap screen with a distinct, correctly-worded end-reason and a timeline that honestly shows a partial final round → the completed game is saved locally (CoreData) so it's still visible after a force-quit and relaunch → real image export (name, date, players, highlights) with genuine success and permission-denied/error states, verified on an actual device, not just the simulator.

**Must-have interactions:** name-entry setup with a 2–6 player validation gate; the shield-first, confirm-tap reveal gesture with haptic feedback (this is the interaction repeated dozens of times a session and it has to feel trustworthy and fast every time); the live round-counter and cup-fill HUD so players can always see roughly how much game is left; the end-of-game recap with its distinct end-reason text; the "no custom or Joker rules played this game" empty state (cheap to include even with no ruleset editor yet); the export flow's four states — loading, success, empty, and blocked/error.

**Cut list (deferred with named reasons, not removed):** custom ruleset editing and saved/alternate rulesets — additive UI on a proven engine, no early-architecture risk; the funniest-rule voting UI itself — nothing to vote on until custom rules exist; drinking-mode toggle and its self-attestation gate — a pure copy-swap-plus-boolean that never touches the state machine, shield, or export pipeline; iCloud/cloud sync of anything; sensor-based face-down detection (manual tap-to-reveal only); any in-progress-game resume across a relaunch (already ruled out earlier, stays out).

**Validation criteria (binary pass/fail):** a full 2-player and a full 6-player game each complete end-to-end with zero crashes across all three end conditions, each producing its own distinct, correctly labeled end-reason; across ≥50 handoff cycles under adversarial conditions (rapid double-taps, backgrounding, rotation, incoming notification banners), zero frames of the wrong player's card are ever visible; a completed game is present and correctly displayed after a force-quit and relaunch; on a real device, a successful export produces a correct image and a denied permission produces a visible, actionable error rather than a silent failure.

## Detailed Discussion

Round 3 closed the last open item. Codex and Claude both landed on replay-fidelity for the mode question — Claude actually walked through why it's the correct pick against the contract's own standing rule (choose the stricter/more deterministic/more privacy-preserving option): view-time rendering means the same saved record can display two different ways depending on an unrelated toggle's state on a given day, which is exactly the "silent state changes the meaning of history" pattern this app avoids everywhere else. Codex's concrete implementation — store `mode` per timeline entry/turn event (not just a single game-header field, so a mid-session toggle is captured accurately), alongside `schemaVersion`, `endReason`, and the Joker rule-text captures, all from the first CoreData migration — is exactly the kind of specificity the quality gate was asking for, and Claude ratified it outright.

Gemma3's round 3 entry doesn't engage with any of this — it re-argues against Joker-text capture and against accessibility-hidden shielding, both of which were already settled with clear reasoning in round 2 (the Joker-capture point in particular directly rebuts Gemma3's "it's optional so don't bother" framing, since the whole issue is that skipping it silently breaks a feature the contract already requires to exist). That's a repeat objection to closed ground, not new material, so it doesn't block.

CONSENSUS: YES

## Final Output

This phase closes with eight concrete, previously-unspecified decisions locked in, all additive to the already-ratified build:

1. **Joker rule-text capture is in scope for slice 1.** After a Joker reveal, the player gets an optional short text field ("Set the house rule text") with Save/Skip actions, saved as a timeline entry flagged custom/Joker-origin. Without this, the funniest-rule ballot's empty state would fire on every game ever played — a feature that could never produce its own intended output.

2. **The HUD drops the misleading "round X of 10" display.** Since 6-player games mathematically cannot reach 10 full rounds before the 53-card deck runs out, the HUD shows honest, player-count-independent signals instead: Kings drawn (of 4) and cards remaining in the deck. A round count only appears when it's actually reachable at the current player count.

3. **Tie-break rule, explicit:** if the last card in the deck is also the 4th King, cup-full wins as the end-reason over deck-exhaustion.

4. **Accessibility-hidden shielding is a named hard requirement.** The shielded state must remove card content from the accessibility tree entirely (`.accessibilityHidden(true)` or equivalent), not just hide it visually — verified with VoiceOver on as its own dedicated QA pass, and fail-safe-hidden behavior tested against full-screen system interruptions (calls, Face ID/passcode prompts), not just banners.

5. **History rows get a swipe-to-delete action** — an undeletable local drinking/dare log doesn't fit a trust-first app.

6. **Export outcomes split into three distinct states:** user-cancelled (neutral no-op), permission-denied (routes to Settings with recovery copy), and actual render/share failure (real error state).

7. **CoreData carries a `schemaVersion` field from the first migration**, with a migration-safe decode path.

8. **Mode rendering is resolved as replay-fidelity, not view-time render.** A completed game's recap always renders using the mode(s) actually active during play, stored per turn/timeline entry (not just once at the game header, so a mid-session toggle is captured correctly) — never reinterpreted by whatever sober/drinking toggle happens to be set when someone reopens an old recap later. This is the stricter, more deterministic option per the contract's own standing tie-break rule, it matches how every other piece of a completed game's record is already frozen at save time (timeline, end-reason, counts), and it's stored alongside `schemaVersion` from the very first migration since retrofitting it later would require a real data migration. Onboarding copy should note this plainly: "Recaps are a record of how the game was played — changing mode later won't rewrite old games."

## App Features

CONSENSUS: YES

Codex and Claude (playing pragmatist/QA this round) independently produced full must/should/could/won't lists and they land in essentially the same place — no real fork this round, just two people converging with different amounts of hedging. Codex organized around seven must-have clusters (core loop, privacy-safe handoff as default not option, deterministic isolated engine, usable rules/funniest-rule mechanics, sober/drinking mode with replay-fidelity, exportable+persistent recap, trustworthy/deletable history, explicit states everywhere), each with a user story and acceptance criteria. Claude organized the same material by build-risk tier — foundation (setup, engine+all three end conditions, shield-first handoff with accessibility-tree removal) first, then the things that make a finished game meaningful (HUD, Joker capture, recap/funniest-rule, persistence with schemaVersion+per-turn mode, history delete, device-tested export, gated drinking mode) — and only flagged ruleset editing as the one item with the most unknown build cost, while still keeping it must-have per the contract rather than trying to cut it. That's a risk callout, not a disagreement with Codex.

Should/could/won't lists match too: haptics and onboarding polish as should-have, visual flourishes and analytics-style recap views as could-have, and the same won't-build list (no server/accounts/networking, no other game variants, no paywall/IAP/telemetry, no mid-game resume, no moderation of custom text).

Gemma3 spent this round arguing again to defer Joker-rule capture and downplay per-turn mode storage — both of which were already settled with explicit reasoning three rounds ago in the detailed_discussion phase (the funniest-rule ballot literally can't function without Joker capture; replay-fidelity mode storage was picked specifically because it's the stricter/more deterministic option). That's a repeat objection to already-closed ground, consistent with the pattern in every prior phase, so it doesn't reopen anything here.

## Final Output

**Must-have (with user story + acceptance criteria each):**

1. **Full local game loop, 2–6 players, bundled + editable rulesets.** Story: host sets up and plays a complete game without leaving the app. AC: setup validates exactly 2–6 non-empty names; deck is always the fixed 53-card set with one active ruleset; draws only happen after shield confirmation; game ends on the first of 4th King / 10 full rounds / deck exhaustion, with cup-full winning any simultaneous tie against deck-exhaustion; end-reason is distinct and correctly labeled per path; recap shows highlights and timeline.

2. **Privacy-safe handoff shield is the default behavior, not a visual nicety.** Story: no player ever sees another player's card, not even for one frame. AC: shield renders before any "pass to" UI on every transition; reveal requires explicit incoming-player confirm-tap; shield fails back to hidden on backgrounding, rotation, app switch, rapid taps, notification banners, and full-screen system interruptions (calls, Face ID/passcode); shielded card content is removed from the accessibility tree (`accessibilityHidden` or equivalent), verified with a dedicated VoiceOver-on QA pass — zero tolerance for any wrong-card exposure.

3. **Deterministic engine, isolated from UI/persistence.** Story: turns and end logic behave the same regardless of device timing. AC: pure Swift state machine, unit-testable independent of SwiftUI/CoreData; idempotent actions (no duplicate draws from rapid taps); turn order never advances without a legal confirm/reveal; HUD shows honest, player-count-independent signals (Kings drawn of 4, cards remaining) with a round counter only when mathematically reachable at the current player count.

4. **Rules and funniest-rule mechanics are functional, not decorative.** Story: players can customize card meanings pre-game and get a real funniest-rule result after. AC: rules editable pre-game and saved as named local rulesets; Joker draw offers an optional Save/Skip text-capture field; funniest-rule ballot runs over rules actually fired that session, defaulting to the last custom/Joker rule if skipped; explicit "no custom/Joker rules played this game" empty state when nothing fired.

5. **Sober-default mode with gated, replay-faithful drinking mode.** Story: mixed groups keep one mechanic set with safer or drinking phrasing. AC: sober is default; drinking mode requires a one-time self-attestation gate and is reversible anytime; copy is fully distinct per mode with zero cross-mode leakage; recap renders using the mode captured per turn/timeline entry at play time (replay-fidelity), never reinterpreted by whatever toggle is active later; onboarding states this plainly.

6. **Exportable recap + persistent history as first-class, not bolted on.** Story: a player can export a shareable recap image and find finished games after relaunch. AC: export includes name/date/players/highlights as a shareable image; export flow has distinct loading/success/permission-denied/render-failure/user-cancelled states, tested on a physical device; permission-denied routes to Settings with recovery copy; completed games persist in CoreData (with `schemaVersion` from the first migration) and are visible after force-quit/relaunch; export/recap work from the persisted record, not just in-memory state.

7. **History is trustworthy and user-manageable.** Story: a user can audit and remove past sessions. AC: history list shows each game with end-reason and highlights; swipe-to-delete per row, reflected immediately; explicit empty/loading/error states on history load/save/delete.

8. **Explicit states across every major flow.** Story: no operation fails silently. AC: setup, draw/reveal, handoff, recap, rule edit/save, history load/save/delete, and export each define empty/loading/success/error states; failures preserve continuity where possible (e.g., an in-session timeline survives even if export itself fails).

**Should-have:** haptic feedback on confirm-tap reveal and cup-fill (behind a hardware capability check); concise first-run onboarding covering the shield flow and end-condition precedence with a quick-start path; accessibility/ergonomics baseline — Dynamic Type, 44×44 minimum tap targets, high-contrast readability, reduced-motion option.

**Could-have:** tasteful card/deck/cup visual polish and light animation; optional card-back personalization; grouped analytics-style recap views (per-player mini-bars, trend charts); an explicit opt-in "reformat for current mode" action on old recaps (never the default, since replay-fidelity is ratified).

**Won't-build:** no server, accounts, login, networking, or cross-device sync/multiplayer; no other card-game variants (Hearts, Asshole, etc.) — Kings-only stays strict; no paywall, subscriptions, ads, IAP, telemetry, or usage analytics in this build; no in-progress-game resume across a relaunch (a killed game is simply discarded — only completed games persist); no moderation/filtering pipeline for custom rule text (unmoderated text may appear in recap/export — accepted, named risk); no sensor-based face-down detection as a primary mechanism (manual tap-to-reveal only).

**Named build-sequencing note (not a scope cut):** if runway gets tight, ruleset editing is the single must-have with the most unknown build cost and the most defensible candidate for a fast-follow — everything else in the must-have list (core loop, shield, persistence, export, history, mode gating) should be protected first, since a Kings game with only the bundled ruleset is still complete and honest, while a broken shield or a silently-always-empty funniest-rule ballot is not.
