# longwave — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things landed after round 1. Codex and Claude approached this from different angles — Codex from "what makes this game's identity bold and real," Claude from "what will silently drift or get faked" — but they didn't actually disagree on anything substantive. Both agree: Longwave is a locked decision (not a candidate to re-litigate against the 16-idea/8-app portfolio process), it's an MVP in scope but production-grade in quality, and its soul is network optimization (routing, interference, coverage vs. efficiency tradeoffs) rather than a generic number-go-up loop with a radio skin. Both independently landed on the same monetization guardrail: no pay-to-skip-wait-timers, no cosmetics — a real Pro tier needs to unlock actual mechanics/content depth. Gemini didn't weigh in (CLI unavailable), so this is a two-voice consensus, but there's no open disagreement to resolve.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above by both participants — this is a portfolio-child assignment; the 8-app/16-idea/parallel-batch instructions are background context explaining why Longwave exists, not a task list for this run. The concrete assignment is: build Longwave, a single idle game about constructing and optimizing a radio-relay network, as a local-first SwiftUI MVP.

**Hard requirements:**
- Own, self-contained SwiftUI iOS project folder under `/Users/pchordia/Documents/iOS-App-Factory` — not merged with other apps.
- Local-first, deterministic state, real persistence across relaunch (not UserDefaults-as-database).
- A complete, real gameplay loop: place/upgrade relay nodes, signal/throughput flows, constraints (interference, coverage vs. efficiency, bandwidth/routing), optimization decisions with visible consequences, progression over time.
- At least one genuinely interesting systems-level tradeoff (e.g., interference vs. throughput, or coverage breadth vs. relay efficiency) — this is the app's strategic signature, not decoration.
- Data layer architected so cloud/social features could be added later without a rewrite (but not built now).
- Monetization path with real value (extra scenarios/maps/challenge modes/deeper progression/prestige systems) — never cosmetics-only, never just "pay to remove wait."
- Beautifully designed, premium feel; a design direction must be generated now since the handoff prompt field was empty ("not supplied yet") — treat whatever gets chosen as provisional-but-binding, not re-opened every phase.
- Bignum-safe / capped display math for idle numbers, correct offline-progress calculation handling backgrounding, force-quit, and clock changes.

**Non-goals:**
- No multiplayer, no MultipeerConnectivity/GameKit, no shared sessions — that's other portfolio slots' job.
- No cloud backend or account system for the MVP itself.
- No forced AR/ML/LLM feature — bonus-only, and only if it's genuinely load-bearing to the radio-relay concept (unlikely here).
- No re-running the 16-idea brainstorm or the other 7 apps in this execution.
- No Jira/Notion scaffolding unless a later checkpoint confirms the app is "liked" first.
- Not a literal RF-engineering simulator, not a spreadsheet-only optimizer, not a passive incrementer with a radio reskin.

**Production-readiness definition:** builds and runs without manual fixup; every reachable screen has real empty/loading/success/error states (first-launch empty network, populated network, corrupted-save recovery, invalid-placement feedback); save/resume genuinely works; offline-earnings math is correct, not faked; accessibility basics (Dynamic Type, VoiceOver labels) present; no crash paths on zero-relays-owned, large-number overflow, negative/zero elapsed time, or rapid double-taps on upgrade actions. Small, finished surface area beats a larger half-built one.

**Decision rules for later phases:**
- If a mechanic could be swapped for generic idle-currency-math without changing the game's identity, it's too shallow — cut or deepen it.
- When polish and scope conflict, ship fewer systems, but make the loop legible and stable.
- When realism and usability conflict, favor game feel and clarity over authentic RF fidelity.
- If monetization feels bolted-on, cut it back to value-bearing expansions only.
- Any deviation from this contract (scope, monetization model, whether to add an LLM/AR/ML bonus, what "done" means) must be stated explicitly as "overriding X because Y" — silent reinterpretation is the failure mode to guard against, not outright refusal.
- Uniqueness is judged against the named exclusion list (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the temple app, the PO tool) plus categorical distinctness (none of those are idle/network-building games) — don't claim to have verified sibling-batch folders that may not be accessible; state the assumption instead of pretending to have checked.

## Initial Discussion

Both Codex and Claude clearly landed in the same place, just describing it from two angles. Codex came at it as "what makes this feel alive" — map-centric, visual-first feedback, teach one tradeoff well. Claude came at it as "what will get faked or half-built" — pick one tradeoff and build it completely, plus hard numeric acceptance checks (offline math, save integrity, timing benchmarks). When you line up their actual proposals, they're describing the same mechanic: relay density/coverage overlap causes interference, which caps throughput — Codex calls it "coverage vs efficiency," Claude calls it "interference vs throughput," but it's one system, not two competing ones. No real disagreement to resolve, just two names for the same spine. Everything else — three-screen MVP, three-to-four relay types, single main resource, no tech tree, no live-ops/ads/social, one region plus maybe one gated unlock, offline-progress and save-integrity as first-class acceptance criteria — matches up cleanly.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Longwave is an idle game where you build and tune a radio-relay network on a constrained map, and the core decision every session is managing the tradeoff between packing relays in for coverage/throughput versus the interference that overlap creates — not "wait for numbers to go up," but "this link is choking, fix the network."

**Primary user and scenario:** Someone who already likes idle/incremental and light optimization games (Cookie Clicker-adjacent, but also Mini Metro-curious) and checks in for 2-5 minute sessions several times a day, plus a longer "see what accumulated" check-in once or twice a day. Cold open: a clean map, one demand zone, enough currency for a starter relay. Placing it makes throughput start flowing immediately. Within minutes, adding a second relay creates visible interference/overlap, teaching the player that naive expansion has a cost — this moment has to land inside the first five minutes with no tutorial wall.

**Core loop:** Place a relay → it produces signal/throughput toward a demand zone → earn currency from delivered throughput → as more relays go in, interference from overlapping coverage and bandwidth limits start capping effective output → spend currency to upgrade, reposition, or retune a relay, or unlock a new relay type/region → each choice trades something visible against something else (denser coverage costs more interference; tighter/more focused routing boosts throughput but leaves dead zones) → progress continues while the app is closed; the player returns to correct, rebalanced, or newly-bottlenecked state and makes the next round of decisions. Every action must produce a visible change on the map — if a player can't look at the network and explain why income moved, the mechanic doesn't belong in the MVP.

**Hard scope boundaries:**
- One map/region for MVP, with at most one additional unlockable region gated behind progress or the paid tier (not an open world, not multiple biomes).
- Three to four relay types max: a cheap broad relay, a focused high-throughput relay, a stabilizer/booster that reduces local interference — no tech tree.
- One primary resource ("bandwidth credits" or equivalent) — no currency sprawl.
- Interference/coverage/congestion must be visual-first (overlays, saturation indicators, before/after feedback), not hidden math the player experiences as random punishment.
- Three real MVP surfaces: network map (the product), a build/upgrade/tuning panel, a compact progression/offline-summary screen. Nothing beyond that for v1.
- No live-ops/server-driven events, no leaderboards/social, no ads or rewarded-video loops, no procedural world generation, no literal RF simulation, no multiplayer — consistent with the locked prior-phase contract.
- Monetization stays a single IAP/subscription unlocking a defined second layer (extra region, relay type, deeper offline cap) — not a multi-SKU store, not pay-to-skip timers.

**Measurable success criteria:**
- A new player can state the game's premise in one sentence within two minutes of playing.
- Cold launch to first placeable relay in under 30 seconds, no tutorial wall.
- First interference-driven decision point reached within 5 minutes of first launch.
- At least three distinct "next goal" moments reachable in one sitting (first relay placed, first interference conflict resolved, first new relay type/region unlocked).
- A player can create a visibly bad network state and recover from it without restarting.
- Save/relaunch survives 20+ cycles with no resets, duplication, or silent data loss; force-quit mid-placement or mid-upgrade doesn't corrupt state.
- Offline progress over a simulated 8+ hour gap matches the documented formula exactly (not a flat/fake reward), correctly handling backgrounding, force-quit, and clock changes.
- Every reachable screen (map, build/upgrade panel, progression/offline screen, monetization/unlock screen, settings) has real empty, loading, success, and error states.

## Per App Product Brief

This round was just closing the one gap the quality gate flagged, and both sides did it the same way — no new disagreement surfaced. Codex and Claude independently wrote out essentially the same competitive-wedge paragraph: idle games (Cookie Clicker, Melvor, Antimatter Dimensions, Egg Inc) are menus where spatial layout is cosmetic at best; spatial-puzzle games (Mini Metro, Dorfromantik) demand continuous attention and stop producing anything the moment you close the app. Longwave is the only thing that's both — the map is the actual mechanic, and it keeps paying off while unattended. Claude went a step further and tied that wedge back to justify three earlier scope calls (health readout makes the spatial claim legible, dropping daily-challenge-mode avoids diluting into "occasionally a puzzle game," and heatmap/history over prestige avoids pulling back toward generic idle tropes), and explicitly said nothing else in the prior final output is being reopened. Codex agreed with the repair and didn't contest any of it. Everything else — target user, core loop, Pro pillars, purchase model, growth angle, local-first/cloud path — both sides confirmed as settled and didn't touch again.

Gemini was unavailable again this round.

CONSENSUS: YES

## Final Output

**Target user & use case:** An idle-game veteran (Cookie Clicker/Melvor/Antimatter Dimensions history, maybe Mini Metro/Dorfromantik affection) who bounces off pure tappers because they stop rewarding thought. They open Longwave for 2-5 minute check-ins several times a day plus a longer "see what happened" session once or twice daily — commute, waiting room, ad break. What hooks them isn't accumulation, it's ownership of a specific network topology they understand and can improve.

**Core loop:** Place relay → throughput flows into a demand zone → overlapping coverage creates interference that caps effective output → player retunes/repositions/upgrades to fix it → network changes visibly → currency accrues → progress continues offline. Layered on top: a single glanceable **network-health readout** (one number or visual state signaling "healthy" vs "choking") that gives players a reason to open the app beyond currency-checking, and doubles as the thing that makes a screenshot worth posting.

**Competitive wedge:** Top-chart idle games (Cookie Clicker, Melvor, Antimatter Dimensions, Egg Inc) are menus with numbers — the "board," where it exists at all, is cosmetic; you never decide *where* something goes, only *whether* to buy it. Spatial-puzzle games that do reward placement (Mini Metro, Dorfromantik) demand continuous attention and produce nothing the moment you close the app. Longwave is the only thing in that comparison set that's both: the map is the actual mechanic, not a skin on a number-go-up loop, and the network keeps producing value while the phone's in your pocket. That's a concrete, checkable claim, and it's the standing test for every future feature proposal: does this make the map more legible and more consequential, or does it quietly turn Longwave into a menu with a map-shaped background.

**Paid value (Longwave Pro):** One Pro tier, not a feature store, unlocking three things — (1) a second region with a genuinely different terrain/interference profile (a different constraint shape, not a reskin), (2) a substantially larger/removed offline-earnings cap, and (3) bottleneck history + a replayable interference heatmap — a deeper lens on data the simulation already computes for the free-tier health readout, chosen specifically because it deepens the spatial-reasoning wedge rather than pulling toward generic idle tropes. A fourth relay class is an optional nice-to-have, not a shipping commitment. Explicitly cut: no prestige/rebirth system — it's a pure idle-game trope that would pull the product back toward the "menu of numbers" genre it's positioned against, and it would touch core-loop math, need its own balancing pass, save-migration handling, and first-time-use explanation.

**Purchase model:** One Pro value proposition sold at multiple price points on a single screen — lifetime unlock as the anchor (no server, no live content drops, so "pay once" is more honest than a subscription treadmill for this audience) plus a subscription option for people who don't want the upfront cost. Pricing flexibility on one feature set, not the multi-SKU fragmentation the locked contract rules out.

**Growth angle:** Zero-infrastructure for MVP. No daily seeded maps or challenge modes — deferred as v2 material, both because it needs a screen and scoring logic the locked "three screens only" / "no live-ops" boundaries don't allow, and because grafting a puzzle-game challenge mode onto an idle game risks diluting the fused identity that is the whole wedge. Growth instead comes from the map being inherently screenshot-worthy (helped by the health-readout visual language) so players share before/after network shots and "why does this ugly layout outperform mine" posts in existing idle/optimization communities like r/incremental_games.

**Local-first & cloud-ready path:** Deterministic on-device simulation, persisted snapshots as source of truth, offline progress resolved from stored timestamps. Saves, content, and future challenge/seed systems sit behind repository-style interfaces so cross-device sync or shareable seeded maps (the deferred growth idea) can be added later without touching game rules or rewriting the simulation.

**The real reason this app deserves to exist:** It gives idle-game players a form of spatial optimization — a map they can misbuild, diagnose, and fix — that's more tactile than a menu-based incremental and faster/lighter than a full factory sim, while still paying off passively when they're not looking at it.

## Detailed Discussion

CONSENSUS: YES

Codex signed off on all three of the outstanding items point by point — closed-form offline math (agreeing it's not really a new decision but the direct implementation consequence of "the world keeps producing, not deciding, while you're away"), the merged clock-threshold rule (with a preference for neutral, non-accusatory copy on the "welcome back" note), and kept-but-hidden Pro history with a hard retention cap. Claude then added one last small, uncontroversial piece — Pro entitlement checks must read from StoreKit's on-device cache, never block on a live network call, so local-first extends to "what do I own," not just "what's my network state" — and reframed the demand-zone rationale around authorship-preservation (Codex's phrasing) rather than pure testability (Claude's original framing), which both agree is the sharper reason. Nothing contradicts anything else on the table. This is real convergence, not one voice filling gaps solo.

## Final Output

**Resolved requirements:**
- The network map + a mandatory network-health readout is the single source of truth; a 20-second open must answer "what's happening / what's broken / what to do next" without submenus or hidden math.
- Every relay action (place, move, upgrade, retune) previews its consequence before commit and is reversible enough to recover from a bad experiment without soft-locking.
- Offline accrual is passive and closed-form: `earnings = steadyStateRate × min(elapsedSeconds, capSeconds)`, computed from the last player-built configuration. Never an iterative tick-by-tick catch-up loop — the topology is frozen while the app is closed, so there's nothing new for a per-tick replay to generate, and a catch-up loop would make longer absences feel slower to reopen instead of snappier.
- Demand zones are static and finite per region for MVP (at most one clearly signposted milestone-gated unlock adding a new zone) — no ambient movement, no spawning, no hidden volatility. This preserves player authorship over the map they remember building, and incidentally is what makes the closed-form offline formula well-defined.
- Interference is a continuous function of overlap with a minimum-distance floor baked in (no divide-by-zero/NaN at close range) — no invisible threshold breakpoints. A relay placed on a demand zone is either a normal position under standard distance rules or cleanly disallowed with a placement preview; no hidden bonus state either way.
- Upgrade/build actions validate and mutate currency+effect inside a single synchronous state transition, so rapid double-taps can't double-spend or apply an upgrade against stale state.
- Pro entitlement reads from StoreKit's on-device cache, never blocks launch or core gameplay on a live network call — local-first covers "what do I own," not just game state.
- Health/interference indicators carry a redundant non-color signal (icon, pattern, or text label VoiceOver can read verbatim) — color-only "healthy vs. choking" is a failure, not polish.
- No notifications, no analytics, no accounts, no off-device data in MVP.

**Edge cases:**
- Two relays placed at/near-identical coordinates: rejected cleanly with a readable reason, or governed by the same minimum-distance floor — never NaN/infinite interference.
- First launch, zero relays: a real, designed empty state, not an awkward near-empty success screen.
- Clock handling, merged into one two-threshold rule: deltas under a couple of minutes (ordinary drift/DST/timezone noise) silently floor to zero elapsed, no message; deltas beyond the Pro-tier's own extended offline cap clamp at that formula's max and show one neutral, factual note ("here's your capped offline production" — never accusatory or cheating-adjacent framing); everything in between is normal offline math with no special-casing.
- App closed/killed mid-placement, mid-upgrade, or mid-save-flush must never corrupt the snapshot; corrupted saves get humane recovery (preserve the broken file if possible, roll back to last-known-good or a clean network, tell the player plainly what happened).
- Reinstall/new device with restored Pro: region two comes back unlocked but empty, with copy that makes the local-first boundary obvious rather than reading as broken.
- Subscription lapse: paid region goes frozen/read-only — visible, intact, not earning, not editable — resuming exactly where it was on resubscribe/restore. Same rule extends to Pro's bottleneck-history/heatmap data: kept and hidden (not deleted) while lapsed, but bounded by a hard retention cap (days or significant-event count, to be sized in architecture) regardless of entitlement state, so it can't grow unbounded even for an active long-term subscriber.
- Large-number growth needs display caps and internal sanity limits — no `inf`/`NaN`/unreadable scientific notation.
- If the offline gap had zero configuration changes (the normal case, since topology is frozen while closed), the Pro history view shows a single flat summary entry for that span rather than needing per-tick replay data that doesn't exist.

**Data and privacy implications:** No personal data, no account, no permission requests beyond what's structurally required (explicitly no Photos-library permission — the system share sheet handles screenshot sharing without it). Nothing leaves the device except StoreKit's own transaction flow. Saves stay included in the standard encrypted device backup (excluding them would turn a lost/replaced phone into a total, unrecoverable progress wipe, which is a worse trust failure than the marginal privacy cost). Data model stays small: network topology, relay stats, currency/progression, offline-resolution timestamps, lightweight settings, and a capped Pro history buffer.

**Risk register:**
- Opaque simulation (player can't tell why output changed) → mitigated by visual causality on the map, continuous (non-cliff) interference, and per-relay explanations.
- Fake-feeling offline progress → mitigated by the documented closed-form formula tied to last-known state, capped, with a calm/neutral return summary.
- Save loss/corruption → mitigated by atomic writes, versioned snapshots, last-known-good rollback, and designed recovery UX.
- Monetization contamination (free tier deliberately cramped) → mitigated by keeping free complete and honest in one region; Pro sells deeper analysis/second region/bigger cap, never relief from artificial pain.
- Session drag (too many taps to diagnose the network) → mitigated by one-screen clarity and preview-driven actions.
- Scope drift via "interesting" systems (prestige, weather, relay failures, daily challenges, dynamic demand) → explicitly excluded from MVP unless they strengthen the map-as-mechanic wedge.
- Entitlement/local-save mismatch (Pro restored on a device with no local build) → mitigated by the unlocked-but-empty vs. frozen-read-only split, both stated in-app in plain language.
- Double-tap race conditions → mitigated by synchronous validate-and-mutate transactions.
- Colorblind accessibility failure on health/interference signals → mitigated by mandatory redundant non-color indicators.
- Unbounded local storage growth from Pro history → mitigated by a hard retention cap independent of entitlement state.

**Final assumptions:**
- Player is optimization-motivated, not narrative-motivated — no lore/campaign writing needed.
- Fully local-first: no cloud sync, no social features, no analytics, no notifications, no live-ops in MVP.
- Demand zones are static/finite per region (at most one signposted milestone unlock); interference is continuous with a distance floor; offline earnings are closed-form and capped, never an iterative catch-up simulation.
- Pro entitlement and its associated data (region progress, history buffer) are never deleted on lapse or reinstall — only access is gated, and gating reads from StoreKit's local cache rather than requiring connectivity.
- Build verification must explicitly run and report on: 20-cycle save/relaunch stability, sane output for both an 8-hour and an extreme (e.g. 400-day) simulated offline gap, and graceful rejection of identical-coordinate/invalid placement — these are pass/fail acceptance checks, not eyeballed impressions.
- Any future deviation (dynamic demand zones, notifications, prestige, etc.) must be stated explicitly as an override with a reason, consistent with the standing rule from the locked prompt contract.

## App Features

CONSENSUS: YES

Both Codex and Claude did exactly the mechanical repair the quality gate asked for — no new scope debate, just filling in the missing user-story/acceptance-criteria pairs for items 5 and 7 (which had none) and adding one-line user stories to the rest. Their fill-ins are near-identical in substance, so this is a clean close. Locking in the fuller, more precise combined version below as the phase's real final output.

## Final Output

**Must-have features** (each defends the map-as-mechanic wedge; cutting any one breaks an already-locked product promise):

1. **Network map as the mandatory home screen, with the network-health readout as an inseparable part of it.**
   User story: as a returning player, I open the app and within 20 seconds know what my network is doing, what's broken, and what to fix — with no submenus.
   Acceptance criteria: launch lands on the map; zero-relay first-launch state is a real designed empty state; every relay, demand zone, coverage area, and interference overlap is visible; the health readout updates within one frame of any state change; the health signal is carried redundantly in text/icon/pattern, not color alone (VoiceOver must read the state verbatim — an actual VoiceOver pass is required, not a label-string code review).

2. **Four core relay actions — place, move, upgrade, retune — each with preview-before-commit and atomic validate-and-mutate transactions.**
   User story: as a player, I can try a change, see its consequence, and commit or back out, without fear of corrupting my currency or network state.
   Acceptance criteria: every action shows a live preview of its effect on output/interference before commit; invalid placement (off-map, inside the minimum-distance floor) is rejected with a readable, VoiceOver-legible reason, never silently; 10 rapid taps on an upgrade with only enough currency for one purchase produces exactly one deduction and one effect, verified by a scripted test.

3. **Three relay types minimum** (broad/cheap, focused/high-throughput, stabilizer).
   User story: as a player, I can understand the strategic difference between relay options quickly enough to make a deliberate choice, rather than treating them as interchangeable stat sticks.
   Acceptance criteria: each has a distinct visual identity and tactical role; at least two are exposed within the first five minutes; none is a stat-clone of another.

4. **Continuous interference/throughput simulation** with a minimum-distance floor — no cliff-edge breakpoints, no NaN/Infinity at close range.
   User story: as a player, when I nudge a relay a little, I see the network respond a little, so I trust the system is readable and not rigged against me.
   Acceptance criteria: dragging two relays toward each other produces smoothly changing (never step-function) interference and health readout values; identical/near-identical coordinates are cleanly rejected or floor-clamped, never crash or produce unreadable numbers.

5. **One currency, one free region with static/finite demand zones.**
   User story: as a player, I never have to think about currency conversion or juggle multiple resource types, and I never come back to find the map's fundamental layout has shifted without my action.
   Acceptance criteria: exactly one currency type exists anywhere in the UI and data model — no secondary or premium-currency track; the free region's demand zone(s) sit at fixed, hardcoded coordinates for the entire session and across relaunches, and the only way their count changes is the milestone-unlock event from item 10 firing — never ambient spawning or movement; a save/reload cycle produces byte-identical demand-zone positions.

6. **Honest, closed-form offline progress**: `earnings = steadyStateRate × min(elapsed, cap)`, with the two-threshold clock rule (small/negative drift silently floors to zero; extreme gaps clamp and show one neutral, factual note; everything between is normal math, no special-casing).
   User story: as a returning player, I can leave the app and come back trusting that what I earned reflects the exact network I built, not a fake or randomized reward.
   Acceptance criteria: an 8-hour and a 400+ day simulated gap both return finite, correctly-formatted, formula-matching numbers; a ~90-second rollback silently floors to zero with no message; no iterative catch-up delay on reopen.

7. **Compact progression/offline-summary screen**, built around the single currency.
   User story: as a player, I can look at one screen and know what I'm working toward right now and what happened while I was away, without doing the math myself.
   Acceptance criteria: the screen displays the current currency total, the current network-health state pulled from the same source as the map's readout (not a second, potentially-inconsistent calculation), and a checklist-style view of the session's reachable next-goals — first relay placed, first interference conflict resolved, and the third goal from item 10 — each with a visibly distinct checked/unchecked state; the offline-earnings figure shown here matches the item 6 closed-form formula exactly (same elapsed-time/steady-rate inputs fed to both the display and a unit test must assert equal); from a cold start or a resume-with-offline-earnings, a reviewer can identify the next actionable objective in under 10 seconds without opening a second screen.

8. **Real persistence and recovery**: atomic writes, versioned snapshots, humane corrupted-save recovery (preserve/rollback/plain-language explanation).
   User story: as a player, I trust my network survives relaunches, bad timing, and local errors, and if something does go wrong I'm told plainly rather than finding silent data loss.
   Acceptance criteria: 20 consecutive save/relaunch cycles — including at least one force-quit mid-placement and one mid-upgrade — produce zero corruption, duplication, or silent resets.

9. **The full three-pillar Pro offering, sold as real depth, not convenience**: a second region with a genuinely different constraint shape, a materially larger/removed offline cap, and bottleneck-history + heatmap replay (collapsing to a single flat summary entry when no configuration changed during a span). Plus purchase, restore, and on-device StoreKit entitlement caching — no live network call required to determine what's owned.
   User story: as a free player I get a complete, honest game; as a Pro subscriber I get genuinely deeper optimization space, not relief from artificial friction, and my paid progress is never deleted regardless of entitlement changes.
   Acceptance criteria: fresh install with restored Pro shows region two unlocked-but-empty; simulated subscription lapse shows region two frozen/intact/visible, never deleted; both states verified with airplane mode on.

10. **At least one additional in-sitting "next goal" moment** beyond first-placement and first-interference-resolution — an experience-level requirement, not tied to one specific feature.
    User story: as a player, within one sitting I have a third thing to work toward beyond my first relay and my first interference fix, so the session doesn't run out of momentum.
    Acceptance criteria — the actual gate: **a scripted ten-minute first-session walkthrough**, run using only the must-have feature set (no should/could items enabled), verifying a new player reaches: (a) initial success from first signal flow, (b) visible self-inflicted degradation from a second relay's interference, (c) recovery via a smarter move, and (d) a legible fourth objective. If the walkthrough fails to produce (d) using must-haves alone, the milestone-gated demand zone is promoted from should-have to must-have before ship (not the fourth relay class, which stays cuttable regardless).

11. **Accessibility basics**: VoiceOver labels on every actionable element, Dynamic Type support that doesn't break the build/inspect panel, redundant non-color health/interference signals.
    User story: as a player using VoiceOver, larger text, or with color-vision deficiency, I get the same "what's happening, what's broken, what to do next" answer as any other player, with no information conveyed by color alone.
    Acceptance criteria: folded into item 1's checks — VoiceOver pass required, no color-only signal anywhere, Dynamic Type at largest accessibility size doesn't clip or break controls in the build/inspect panel.

**Should-have** (valuable, expected to be attempted, explicitly cuttable without invalidating the product promise — except that at least one of the first two must clear the item 10 walkthrough gate):
- Milestone-gated second demand-zone unlock in the free region.
- Fourth relay class for Pro, only if it introduces a genuinely new topology decision.
- Share-sheet screenshot support for the map (system API, no Photos permission) — the growth mechanic depends on the map being screenshot-worthy by default even without this.
- A slightly richer before/after output-delta preview on relay actions.
- Embedded first-session teaching that emerges from placement/preview feedback, no modal tutorial wall.

**Could-have** (only if must/should are already solid):
- Cosmetic map variation within a region that doesn't hurt readability.
- A minimal settings screen (restore purchases, about/version).

**Won't-build** (explicit, to fence off scope drift):
No prestige/rebirth, no daily seeded challenge maps, no dynamic or moving demand zones, no relay failure/decay/weather/sabotage systems, no notifications, no multiplayer/social/leaderboards, no cloud sync in MVP, no currency packs/timer-skips/ad-based acceleration, no tech tree, no extra currencies, no more than two regions, no forced AR/ML/LLM feature, no extra screens beyond map / build-upgrade panel / progression-offline summary / paywall / settings.
