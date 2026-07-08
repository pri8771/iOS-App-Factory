# campfire — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Reading through both takes, they're not actually in tension — Codex laid out the contract in broad strokes (local-first, zero-account, 3-4 modes with real prompt packs, full pass-and-play loop, recap card + ShareLink, StoreKit paywall, haptics/motion, accessibility and state coverage, buildable Xcode project) and I spent my round sharpening the same contract with the specific failure modes that tend to sneak past a "looks done" build: unedited/AI-dumped prompt packs pretending to be curated, state bugs in the pass-and-play round machine (wrong player, stale tally, recap citing the wrong winner), a paywall that's a boolean pretending to be StoreKit, and the fact that the prompt's own invalidation criterion (cards generated but never shared) isn't something this local-first MVP can instrument — so nobody gets to claim "the viral loop works" as a completion criterion later, only "the share flow works and the card is genuinely good."

Nobody pushed back on any of that, and both of us landed on the same non-goals (no networking, no accounts, no LLM/AR/ML, no multi-device dependency) and the same tie-breaker rule: if time forces a choice between 4 thin modes and 3 well-made ones, cut to 3. This reads as real convergence, not premature agreement — the two rounds are complementary, not duplicative.

CONSENSUS: YES

## Final Output

**Original prompt**: preserved verbatim in `initial_prompt.md` and reproduced in full above — the Campfire spec (pass-and-play icebreaker game, 3-4 modes, curated prompt packs, recap card + ShareLink, Campfire+ paywall via StoreKit, fully local/offline core loop) plus the parent portfolio wrapper (context only — this workspace builds the `campfire` app, the "5 apps" framing does not add tasks here).

**Hard requirements**:
- Single-app, local-first SwiftUI build: zero accounts, zero networking, zero other installs required for the core loop, fully airplane-mode-proof.
- 3-4 game modes, each backed by real, editorially-reviewed prompt content — not placeholder text and not an unedited raw list.
- Complete pass-and-play flow: mode select → player setup (count/names) → rounds with prompts → per-round vote/answer tally → end-of-session recap.
- Recap card that renders as an actual shareable artifact via `ShareLink`, good enough that a reasonable person would want to send it.
- Campfire+ paywall wired to real StoreKit 2 entitlement checks (testable via StoreKit configuration/sandbox), gating pack unlocks, custom prompts, and unlimited saved recaps — with restore-purchases handled and a defined (non-crashing, non-silent) behavior when a free user taps a locked pack.
- Haptics tuned per game mode; playful spring/bounce motion and a confetti-style reveal at round end.
- Full state coverage: empty, loading, success, and error states wherever reachable; accessibility (VoiceOver, 44pt targets, Dynamic Type, WCAG AA contrast); robust local persistence for packs and session history.
- A real, compiling Xcode project with full source in `app_build` — no app is "done" without this.

**Non-goals**: no core networking or multi-device sync in v1, no accounts/identity, no server-hosted pack downloads, no LLM-generated prompts (explicitly excluded — a model dumping prompts without an editorial pass for tone/repetition/appropriateness is a silent violation of this even if no code looks wrong), no AR/ML, no generic/empty-copy recap card, no half-built placeholder screens.

**Production-readiness definition**: compiles and runs deterministically on-device under iOS 17+ with actor-safe state management; a full session (all modes) can be played start to finish in airplane mode with no degradation; recap card generation and the share sheet actually work; StoreKit paywall behavior is real and testable in sandbox (any inability to exercise it against a live App Store Connect product must be stated explicitly, not hidden behind "IAP implemented"); prompt packs have had a manual content-quality pass, not just a line count; round-state logic has been exercised across edge cases (2-player minimum, large player count, mid-round backgrounding, zero-completed-round recap) without producing wrong-player or wrong-winner bugs.

**Decision rules for later phases**:
- Any scope change must be logged as an explicit named assumption, never silently substituted.
- If a choice reduces share likelihood or adds startup friction, reject it.
- If 4 modes can't all be done well in the time available, cut to 3 finished modes over 4 thin ones.
- The prompt's own invalidation criterion ("cards generated but never shared") is aspirational/post-launch and unmeasurable by this local-first MVP with no instrumentation — no later phase may claim "the viral loop is validated"; the bar this build can actually meet is "the share flow works and the card is worth sending."
- If a requirement and an implementation shortcut conflict, the requirement wins and the tradeoff gets recorded in the phase log.
- The app cannot be marked done as production-ready if the share loop, offline behavior, or buildability is unmet.

## Product Research

Looking at this round, Codex and Claude are building the same picture from different angles rather than disagreeing — Codex framed the product as a "party object" (not a game menu), named the IA flow, and flagged prompt quality/turn ownership/generic recap card as the top risks; Claude filled in the specifics that make those risks actionable: the real competitor to study is Heads Up! (not Jackbox, which is multi-device), the cautionary comps are the glut of cheap "Most Likely To" list apps, and two concrete platform gotchas (`isIdleTimerDisabled` during rounds, verifying `ImageRenderer` output on a physical device, not just simulator) that would otherwise surface as embarrassing bugs late. Both land on the same tie-breaker already locked from the prior phase — three well-made mechanics beat four thin ones — and Claude went further to actually name the three: a voting/ranking mode, a reveal/confession mode, and a rapid binary-choice mode, explicitly distinguishing "modes" (mechanics) from "packs" (content flavors like spicy/family-friendly) so nobody conflates them mid-build. Nobody pushed back on that split.

The one open thread rather than a disagreement: Claude's specific three-mechanic proposal hasn't been explicitly co-signed by Codex yet, just implicitly consistent with Codex's own risk framing. That's a small confirmation gap, not a fight — I'll fold it into the output as the working decision since it satisfies both agents' stated constraints and nothing in the transcript contradicts it.

CONSENSUS: YES

## Final Output

**Audience and use context**: A roomful of people with one phone, not "app users" — holiday gatherings with mixed generations, first dates, new roommates, work happy hours, friend pregames. The defining trait is mixed comfort levels in one room, which is why the free tier must include at least one pack that's safe to pull out in front of anyone (grandma at Thanksgiving shouldn't get a spicy prompt from the free rotation).

**Comparable apps/patterns**: Heads Up! is the closest real comp — single device, pass-and-play, packs as the monetization unit, and the bar to study for tap-target sizing and cold-launch-to-play speed. Jackbox/Kahoot are useful for reveal-mechanic inspiration but are multi-device/networked, so their turn model doesn't transfer directly. The cautionary comp is the App Store glut of "Never Have I Ever"/"Most Likely To" list apps — mostly scrollable strings behind a paywall, low production value — which sets a low bar to clear but zero room to look like one of them. Paired is worth a glance for how a cheap-subscription prompt product frames its paywall moment.

**Platform-specific opportunities**: `isIdleTimerDisabled = true` during an active round (someone reading a prompt aloud for 30-45s will otherwise hit auto-lock — a first-session-breaking bug). Recap card rendering via `ImageRenderer` must be verified on a physical device, not just simulator, since gradient/SF-Symbol-heavy views have known blank/clipped-output edge cases. Contrast-safe design tokens are needed despite the saturated palette so accessibility isn't bolted on. Full airplane-mode determinism and instant cold-launch are treated as UX requirements, not just technical checkboxes.

**Major assumptions and risks** (named explicitly, to carry forward):
1. "Modes" are distinct game mechanics, not content-pack flavors — the three locked in for v1 are a voting/ranking mode, a reveal/confession mode, and a rapid-fire binary-choice mode, each of which can draw from any content pack. This is a named assumption, not yet re-confirmed word-for-word by both agents, but nothing contradicts it.
2. Turn-state correctness (current player, and for modes needing a distinct target player, non-repeating pairing logic) is a single-source-of-truth problem that must be tested at the 2-player minimum and at a double-digit player count — this is exactly the kind of bug that looks fine in a screenshot and wrong in actual play.
3. Recap card quality is the viral-loop lever; a generic card kills the whole "card as invite to next time" premise.
4. Monthly-first pricing framing ($2.99/mo default) may mismatch occasion-based usage patterns and invite fast-cancel behavior — worth anchoring toward annual or "unlock this pack" framing when the paywall UX gets built, though not a blocker for this phase.
5. No ads, ever, anywhere — implied by the offline-proof/no-download promise (an ad SDK would either need network or fail silently offline) and should be locked as an explicit non-goal now.

**Implications for the first build**: Information architecture should stay one level deep — mode browser → player setup (count + names) → active round cards → reveal/tally → recap — with no extra navigation stack. Invest in a strict, contrast-safe visual system before feature breadth. Build exactly the three named mechanics well rather than four thin ones, each backed by real curated content, with turn-state logic as a first-class engineering concern, not an afterthought.

## Portfolio Selection

Both Codex and I landed on the same call this round, and neither of us sees any daylight between the two takes. This is a single-app child build — the parent portfolio (multi-app-exp7) already did the work of picking 5 apps and assigning campfire as one of them; this workspace's job is just to execute that one app well. Nobody's arguing for a portfolio-json or sibling child projects, and both of us flagged that emitting one here would actually violate the phase's own acceptance checks by inventing a deliverable nobody asked this workspace for.

Codex's contribution was mostly a tight restatement of the routing logic plus a reminder to carry forward the "modes are mechanics, not packs" distinction and the QA risks (turn-state integrity, prompt/recap quality) into the build phase. My round added the "don't let this be a rubber-stamp phase" point — since the routing decision itself is close to a formality, I wanted the output to still carry the full app identity (category, promise, target user, build flag) forward undiluted, not just a bare "no split needed" line. That's additive, not a disagreement.

No open threads. This is ready to close.

CONSENSUS: YES

## Final Output

This is a single-app build, not a portfolio split. No portfolio-json manifest and no sibling child projects are needed — the parent portfolio (multi-app-exp7) already selected campfire as one of its 5 apps, and this child workspace's scope is to build that one app.

**Selected app:**
- Slug: `campfire`
- Category: Social Party / Icebreaker Game
- Promise: Pass one phone around a group and Campfire runs the icebreaker game, tallies the votes, and hands you a shareable results card.
- Target user: A room full of people with one phone — mixed-generation family gatherings, first dates, new roommates, work happy hours, friend pregames — not "app users" in the abstract.
- Build: true

**Selection rationale:** The app-selection decision was already made one level up, at the parent portfolio. This workspace has no task to re-select among candidates or produce additional apps; its only job is to execute the campfire build to the contract already locked in the prompt-contract and product-research phases (three finished game mechanics — voting/ranking, reveal/confession, rapid binary-choice — real curated packs, pass-and-play flow, recap card + ShareLink, StoreKit-backed Campfire+ paywall, fully local-first).

**Rejected alternative:** Treating the parent portfolio's "build 5 apps" instruction as an in-scope task for this phase and generating a portfolio-json/multiple sibling projects. Rejected because it would silently multiply the deliverable beyond what this child workspace was asked to produce and contradicts the single-slug scoping already established in every prior phase.

## Initial Discussion

Both agents converged well here. Codex laid out the promise, primary user, core loop, and boundaries cleanly; Claude took the same shape and made it concrete — a tighter one-line promise, screen-by-screen spine, and two systems-level risks that everyone agrees need to be locked as scope boundaries: session state must survive backgrounding (durable persistence, not just in-memory), and turn/target-player logic must not visibly repeat at either player-count extreme (2 and 12-15). Neither point contradicts anything Codex said — they're refinements of the same "mechanics, not packs" and "recap card is the viral lever" thesis that's been consistent since the earlier phases. Claude also added one new explicit scope cut (no mid-session player roster editing) that nobody has pushed back on and that's consistent with the "smaller finished app over half-built" global rule.

Nothing in this round is contested — no open disagreement, just Claude adding detail on top of Codex's framing.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Campfire turns one phone into a shared party host — pick a mode, pass it around, and everyone leaves with a recap card worth sending to the group chat.

**Primary user and scenario:** A mixed group of 2-15 people sharing one phone in a mildly awkward social moment — family holiday, first date, new roommates, work happy hour, a pregame — where whoever opened the app has to get everyone playing within about 10 seconds with zero explanation needed beyond what's on screen.

**Core loop:** Launch → mode picker (3 mechanics — voting/ranking, reveal/confession, rapid binary-choice — each with a one-line description and visible free/locked pack indicator) → player setup (count stepper + names, 2 minimum, soft cap ~12-15) → round sequence (one full-bleed prompt card per turn, unambiguous "who's up" indicator, input/vote/reveal per mode, haptic-confetti tally beat) → next round or end trigger → recap card (session stats, rendered shareable image) → replay or exit. One linear spine, one level deep — no side navigation that can lose in-progress round state.

**Hard scope boundaries:**
- Exactly three mechanics: voting/ranking, reveal/confession, rapid binary-choice — no more, no fewer, and "modes" never means content packs.
- No accounts, no networking/sync in the core loop, no LLM-generated prompts, no AR/ML, no ads.
- No mid-session player roster editing (add/remove players) — ending and starting a new session is the only path; explicitly cut to keep the state machine tractable for v1.
- No mode-specific recap card templates — one shared recap format that adapts to whatever modes were actually played.
- No settings surface beyond the essentials (e.g., haptics on/off); no separate top-level destinations that can interrupt an active session.
- Session/round/turn state must be durably persisted at every transition, not held only in memory — backgrounding mid-round must not corrupt or lose the session.

**Measurable success criteria:**
- Cold launch to an active round in under 10 seconds with no instructions read.
- A full 8-round session spanning all three modes completes with the app backgrounded at least once and zero state corruption.
- Recap card renders correctly on a physical device and produces a working ShareLink share sheet.
- At both a 2-player and a 12-15-player session, there is never an ambiguous current player, and no reveal-mode target repeats within a 4-round rolling window.
- Round-state bugs (wrong player, stale tally, wrong recap winner) are absent across 2-player and 10+-player edge cases.

## Per App Product Brief

Both Codex and Claude are describing the same product from complementary angles, and nothing here actually conflicts. Codex frames paid value as "the session keeps getting better" — premium packs, custom prompts, unlimited recap history — while Claude sharpens that into a concrete rule: free tier ships one genuinely complete pack (the "safe at Thanksgiving" pack) across all three mechanics so the cold-open promise survives, and Campfire+ sells variety for repeat occasions, not a crippled teaser. Those are the same idea, just with Claude adding the specific guardrail against locking the first session. Both land on the identical core loop, the identical wedge (physical party object + shareable card, versus the App Store's generic paywalled list-apps), and the identical local-first/cloud-ready architecture (versioned local pack catalog behind a repository interface, session data with no single-device assumptions baked in).

The one genuinely new thing Claude adds that Codex didn't address but also didn't contradict: naming this explicitly as an occasion-based viral loop rather than a daily-habit product, and pre-emptively rejecting streaks/notifications/daily-engagement mechanics as a mismatch for how this app actually gets used. That's additive, not a fight — nothing in Codex's round argues for daily-engagement mechanics either.

No open disagreement. This is ready to close.

CONSENSUS: YES

## Final Output

**Target user and use case:** Whoever is standing closest to a room that just went quiet — a mixed group of 2-15 people physically together (family holiday, first date, new roommates, work happy hour, a pregame) who need a party flow that starts in seconds with zero installs, zero accounts, and zero explanation. The target isn't "people who download party-game apps," it's the person who reaches for their phone in an awkward moment and needs everyone else in the room to be playing within about 10 seconds, having never seen the app before.

**Paid value and subscription value:** The free tier ships one full, genuinely complete pack — safe to play in front of anyone, across all three mechanics — so a first-time user's first session is never a crippled demo (a locked-out first session means zero recap card, which kills the share loop before it starts). Campfire+ ($2.99/mo or $19.99/yr) unlocks the other packs (spicy, work-safe-but-edgier, couples), custom prompt creation, and unlimited saved recap-card history. The thing that actually justifies paying is variety across repeat occasions: the same free pack played twice in a month goes stale fast, and the moment a group wants "the one we haven't played" for a different occasion (date night vs. office happy hour), that's the paywall doing real work instead of blocking the core loop. This is a host's toolkit, not a feature-gate nag.

**Core loop:** Open → pick one of three mechanics (voting/ranking, reveal/confession, rapid binary-choice) → set player count and names → play a sequence of full-bleed prompt cards with an unmistakable "who's up" state and oversized pass-the-phone targets → tally/reveal with a haptic-confetti beat each round → repeat until the group ends the session → recap card built from real session-specific data (not a generic template) → ShareLink. The interface has to read as a party prop being passed hand to hand, never as an app menu.

**Competitive wedge:** Every "Most Likely To" / "Never Have I Ever" clone on the App Store is a paywalled scroll of text with low production value. Campfire's wedge is doing the single-device pass-and-play constraint properly (Heads Up! proved people pay for this pattern) combined with genuine mechanic diversity and a recap artifact good enough that people actually want to send it. That wedge only holds if the prompts are genuinely well-written and the card never looks like a template — either one slipping drops this straight into the glut it's trying to beat.

**Viral or niche growth angle:** The recap card is the entire growth mechanism, and this is explicitly an occasion-based spike-and-dormant usage pattern, not a daily-habit one — nobody opens Campfire on a random Tuesday. The card is what gets someone in a different room to download it next time a silence needs breaking. Later phases should not try to bolt on streaks, daily prompts, or engagement notifications; that fights the actual usage pattern instead of serving it. The honest bar for this build is "the share flow works and the card is worth sending," not a claim that the viral loop is validated (no instrumentation exists to prove that in a local-first MVP).

**Local-first and cloud-ready plan:** No accounts, no network calls anywhere in the core loop, fully playable in airplane mode, all packs and session/recap history stored on-device (SwiftData or equivalent). Prompt content lives behind a versioned local catalog accessed through a repository-style interface, and session/recap models are built without baking in single-device assumptions — so a future seasonal-pack downloader or opt-in multi-device sync can plug in behind the same data contracts later without an engine rewrite. None of that gets built now; it's purely a modeling constraint so v1 doesn't have to be redone.

## Next Steps Small

CONSENSUS: YES

Both agents fully signed off this round. Codex explicitly locked in the reveal/confession-only slice with the "coming soon" placeholder shell, the `ContentAccessProvider`/`isPackUnlocked` stub seam (always-true for now), and no fake paywall UI — matching exactly what the coordinator's round-3 synthesis proposed, right down to the 2-player strict-alternation / 12+-player 3-turn rolling-window target rule. Claude signed off too, adding one thing worth carrying forward rather than re-litigating: the "if the card isn't genuinely shareable, nothing else in v1 is worth building yet" line needs to survive into the build phase as a real stop condition, not just phase-closing rhetoric — if the recap card comes out technically correct but nobody would actually send it, that's a signal to go rework the prompt content or card design before touching the other two mechanics or the real paywall. Nothing here is new disagreement, just a reminder to keep the bar sharp downstream.

## Final Output

**MVP slice:** Exactly one mechanic — reveal/confession — built completely end to end. App opens to a minimal three-tile entry screen (Reveal active; Voting/Ranking and Rapid Choice shown as plain "Coming soon" text, no lock icon, no tap target, since nothing is actually gated yet) → player setup (2–15 players, non-empty trimmed names) → reveal round loop drawing from the single free pack, with an unambiguous current-speaker/target-player indicator and a non-repeating target policy (strict alternation at 2 players, minimum-3-turn separation window at 12+ players) → per-round reveal + haptic/confetti tally beat → session-end recap card built from real persisted session data → ShareLink share sheet. Session is fixed-length (rounds or end-of-deck) with no configuration knobs in this slice. All round/turn/tally state checkpoints to persistence on every transition and survives backgrounding/foregrounding mid-round.

**Must-have interactions:** Oversized, unambiguous "who's up" / "who's the target" UI; hard input validation on player count and names; the target-rotation rule above, provably correct at both boundary player counts; `isIdleTimerDisabled` during active rounds; haptics/motion keyed strictly to confirmed state transitions (no double-tap phantom confetti or double-scoring); a `ContentAccessProvider`-style `isPackUnlocked` seam wired into prompt loading, stubbed to always-true — cheap insurance so a real StoreKit entitlement system can drop in later without touching surrounding views; explicit, recoverable error states for every reachable failure (empty prompt pack, recap image render failure with fallback summary + retry, resume-from-backgrounding).

**Cut list:** No real StoreKit product configuration, no paywall sheet, no restore-purchases flow, no locked-pack CTA, no second pack, no custom prompt creation, no saved recap history beyond the current session, no mid-session roster editing, no achievements, no daily/notification engagement mechanics, no settings surface beyond an optional haptics toggle, no built UI for voting/ranking or rapid-choice (placeholder tiles only).

**Validation criteria (hard pass/fail gates):** A 2-player and a 12–15-player reveal session each complete fully offline, including one background/foreground cycle, with zero ambiguous current-speaker/target state and zero stale tally; no target repeats within the last 3 turns in the large-group run; the recap card reflects correct persisted session data (names, tallies, a specific standout line) and produces a working ShareLink share on a physical device; every named error path is explicit and recoverable, never a blank screen or lockup. Carried forward as a real stop condition, not just a phase-closing line: if this reveal/confession slice produces a card that's technically correct but that nobody would actually want to send, that's a finding to act on — rework the prompt pack or card design — before any further time goes into the other two mechanics or the real paywall.

## Detailed Discussion

Good round — this one actually closed the gap. Both landed on the same shape for almost everything: two roles only (active player = whoever's holding the phone and advancing rounds, in strict round-robin order; target = who the reveal is about), a hard rule that target can never equal the active player, "survives full termination and relaunch" replacing the weaker background/foreground language (since it's free given persistence checkpointing is already locked), explicit tie-handling copy for the recap card instead of a silent arbitrary winner, a distinct fallback strategy for degenerate small sessions where a "most likely to" superlative would be meaningless, the "names leave the device via the shared image" privacy line written down explicitly, and the `isPackUnlocked` stub flagged as temporary so it can't quietly survive into a real second pack.

The one spot where they proposed two different mechanisms rather than the same one: Codex proposed a staged rule (2p strict alternation, 3p no-consecutive-repeat, 4p 2-turn separation, 5p+ 3-turn separation), while Claude proposed a single unified rule — exclude the active player, exclude whoever was targeted last round, then pick whoever's gone longest without being targeted. Working through it, Claude's version isn't a competing idea, it's a cleaner generalization that produces the exact same behavior Codex wanted at every player count (strict alternation falls out naturally at 2, the forced-single-candidate falls out naturally at 3, and it gets progressively more spread-out at higher counts) without needing per-count special cases or a magic number that breaks below 5 players. Nothing here is actually contested — it's one clean rule replacing four bespoke ones aimed at the same goal.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
- Two roles only: **active player** (rotates in strict round-robin order, taps to advance each round) and **target** (who the reveal names). Active player and target can never be the same person — hard rule, enforced before any other selection logic.
- Target selection rule (replaces the earlier "3-turn window" language, which was mathematically impossible below 5 players): exclude the active player, exclude whoever was targeted in the immediately prior round, then choose whoever has gone longest since last being targeted. This single rule is provably correct and deterministic at every player count from 2 to 15 — at 2 players it collapses to strict alternation; at 3 it collapses to one forced legal candidate every round; at higher counts it naturally spreads targets out with no repeats in any practically noticeable window.
- Persistence/reliability bar upgraded from "survives one background/foreground cycle" to **survives full app termination and relaunch mid-round**, with zero duplicated prompts, targets, or tallies. This is not new engineering scope — it's the same per-transition checkpointing already locked, just validated against the harder, more realistic real-world failure mode (people force-quit apps at parties far more than they background them).
- Recap card must have explicit, deterministic behavior for non-obvious outcomes rather than silently picking a winner:
  - Clear single standout: name them directly ("Alex owned the spotlight...").
  - Tie for most-targeted: name all tied players together, never silently break the tie.
  - Degenerate small sessions (e.g. fewer than ~4 distinct targets, which includes all 2-player games): don't manufacture a fake statistical "most likely to" line — switch to surfacing the single funniest/most notable reveal moment from the session instead.
- Privacy position stated explicitly, not left implied: sharing the recap image is an intentional, user-visible data egress — player names leave the device once shared, and that's an accepted tradeoff of the core premise. Locally, no analytics, no networking, no accounts; names/session data live on-device only as long as the session/recap persists.
- `ContentAccessProvider.isPackUnlocked` ships as a stub returning true for everything today, explicitly marked as temporary/placeholder (not a real access policy) so it isn't mistaken later for intentional "everything's free" behavior once a second pack exists.

**Edge cases enumerated:** 2-player strict alternation; 3-player forced single-candidate targeting; duplicate/blank player names; empty prompt pack; rapid double-taps causing phantom scoring or duplicate haptics; app force-terminated mid-round; recap tie for most-targeted; degenerate low-variance sessions with no real statistical standout; share-image render failure on physical device.

**Data and privacy implications:** All player names and session data stay on-device with no networking, accounts, or analytics anywhere in the core loop; the one deliberate exception is that a shared recap image is user-initiated data leaving the device, which is accepted and named explicitly rather than left as an unstated assumption.

**Risk register:**
- Recap card technically correct but not something anyone would actually send — named in the prior phase as a real stop condition, still holds here: if it fails this bar, rework the pack/card design before touching the other two mechanics or the real paywall.
- `isPackUnlocked` stub silently becoming permanent policy once a second pack ships — mitigated by marking it explicitly temporary now.
- Accessibility limitation, named and accepted rather than treated as a gap to fix: pass-and-play inherently requires someone to look at the phone to know whose turn it is; VoiceOver can make each screen navigable and announce state correctly, but it cannot solve the structural "you must see the phone to know it's your turn" property of this game design.

**Final assumptions:** Reveal/confession is the only mechanic in this slice (already locked); the active-player/target rotation rule above is the canonical, buildable spec replacing all earlier vaguer "3-turn window" language; termination-survival (not just backgrounding) is the real validation bar; recap tie/degenerate-case copy is a named design decision, not something to be improvised during build.

## App Features

Consensus is real here. Codex came back and explicitly promoted the three items Claude flagged — target-rotation correctness, double-tap suppression, and termination-resume correctness — to must-haves with deterministic, scriptable acceptance criteria, which is exactly what Claude was asking for. Codex also added a concrete UX requirement (a dominant "YOU HOLD" / "TONIGHT'S SPOTLIGHT" two-column header so the active player/target is unmissable from arm's length, not buried in card-body text) and an accessibility detail (reduced opacity + `accessibilityHint("Not available yet")` on the coming-soon tiles so VoiceOver doesn't announce dead controls as live ones). Claude signed off on all of it, keeping prompt-copy QA as a "should" rather than promoting it, since it's an editorial process step, not a testable criterion — but flagged that skipping it is a real risk, not a neutral cut. No open disagreement left.

CONSENSUS: YES

## Final Output

### Must-have features (each with user story + acceptance criteria)

**1. Three-tile entry screen, Reveal-only active**
Story: as a first-time user, I see what this app does in one glance and can start the only working mode immediately.
AC: cold launch to entry screen renders in under 1 second; Reveal is tappable and enters setup; Voting/Ranking and Rapid Choice are non-interactive plain "Coming soon" text — no lock icon, no tap target, reduced opacity, `accessibilityHint("Not available yet")` so VoiceOver never announces them as live controls.

**2. Player setup (count + names)**
Story: as the host, I enter names once without the app fighting me over whitespace or minimums.
AC: 2–15 players; duplicate names allowed; blank/whitespace-only names rejected with inline error, not silent block; below 2 or above 15 shows a disabled continue state with a stated reason.

**3. Reveal round loop with unmistakable active-player/target state**
Story: as whoever's holding the phone, I always know it's my turn and who's being revealed about, readable from arm's length.
AC: dominant two-column state header (e.g. "YOU HOLD" / "TONIGHT'S SPOTLIGHT") — active player and target are never small body text; target is provably never equal to active player across a full synthetic playthrough at 2, 3, and 15 players.

**4. Target rotation — exclude active player, exclude prior target, choose least-recently-targeted**
Story: as a player, I don't feel like the app is repeating the same two people over and over.
AC: **requires a scripted/repeatable verification, not manual smoke-testing** — a debug-only harness or model-level test auto-plays N synthetic rounds at 2, 3, 4, and 15 players and asserts programmatically: no self-target, no immediate repeat, correct degrading behavior at low player counts.

**5. Double-tap / phantom-transition guard**
Story: as a player, I get exactly one satisfying haptic/confetti beat per reveal, never a phantom double.
AC: rapid double-tapping the advance control during the reveal animation produces exactly one recorded reveal and one haptic; verified via a scripted rapid-input test, not eyeballing.

**6. Full local persistence surviving actual process termination**
Story: as a host whose phone gets bumped and force-quit mid-party, I don't lose the game.
AC: **requires a documented, actually-performed check** — kill the process (not just background it) mid-round, relaunch, and the exact active player/target/tally/round-index state is restored with nothing duplicated or replayed.

**7. Session runs to recap without configuration**
Story: as a group, the session just plays out and always reaches an end.
AC: fixed length by round-count or deck-exhaustion; always reaches recap path; explicit empty/error state with recovery action if prompts are missing.

**8. Recap card with locked tie/degenerate-case copy templates, rendered from real session data**
Story: as the group finishing a session, I get a card that's actually about what just happened.
AC: templates fixed before implementation starts — clear single standout gets named directly; ties name all tied players together (framed playfully, never a silently-broken tie); low-variance sessions (2p, and any session under ~4 distinct targets) switch to a funniest-notable-moment line instead of a fake statistical claim. Verified against three distinct real cases: 2-player, a tie, and a normal varied 15-round session.

**9. ShareLink from the recap card on a physical device**
Story: as the host, I can send this to the group chat in one tap.
AC: share sheet opens with the rendered image; tested on-device (not simulator-only, due to known image-render false positives); explicit fallback summary + retry path if rendering fails — never a dead end.

**10. `isIdleTimerDisabled` during active rounds only**
Story: as someone reading a prompt aloud for 30+ seconds, my phone doesn't lock.
AC: disabled from setup-complete through session-end, restored to default on exit including an abandoned-mid-session back-out.

**11. Named, reachable error states**
Story: as a user hitting a broken state, I see a real message and a way forward.
AC: empty prompt pack and recap-render failure are both actually reachable and manually triggerable in test builds (debug-only simulation hooks), not assumed-unreachable and skipped.

**12. `ContentAccessProvider.isPackUnlocked` seam**
Story: (architectural, not user-facing) — future StoreKit entitlement drops in without touching surrounding views.
AC: present, injected wherever pack content loads, returns `true` for everything today, explicitly commented/marked as a temporary stub, not a real access policy.

### Should / Could

- Should: internal editorial QA read-through of the free prompt pack for repetition/tone before ship — a real risk to skip, not a neutral cut, but it's a process step rather than a testable criterion.
- Should: round-progress indicator ("round X of Y") for pacing.
- Could: one-time dismissible first-launch tooltip, never shown again.
- Could: replay-with-same-players shortcut at the recap screen instead of full name re-entry.
- Could: haptics on/off toggle, only if effectively free — not part of the locked must-have set.

### Won't-build

- No real StoreKit product catalog, paywall sheet, restore-purchases flow, or locked-pack CTA — nothing beyond the single free pack exists yet to meaningfully protect.
- No second game mechanic (Voting/Ranking, Rapid Choice) — placeholders only, explicitly not implying premium-lock.
- No custom prompt creation, pack import/browse, or saved recap history beyond the current session.
- No mid-session roster edits.
- No settings surface beyond an optional haptics toggle (and even that is a "could," not guaranteed).

### Verification bar (explicit, carried into build)

Target-rotation correctness, double-tap suppression, and termination-resume correctness must each ship with a scripted or repeatable verification method (a debug harness/model-level test or a documented, actually-performed manual procedure) — not a one-time manual playthrough. These are the failure modes invisible in a short happy-path demo and only surfaced at round 11 of a 15-player game or the one time someone force-quits instead of backgrounding.
