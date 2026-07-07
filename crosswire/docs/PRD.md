# crosswire — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round 2 was quick: the Quality Gate caught a real defect (a redaction artifact had eaten the actual text of one non-goal line, leaving it unreadable), and Claude fixed it directly rather than arguing with the catch — that line sits in the one section whose whole job is telling later phases what they're not allowed to claim, so a garbled version of it was actively dangerous, not cosmetic. Everything else from round 1 held up untouched: single-app scope, the hard requirements, the transport-risk framing, guest-never-gated monetization, the production-readiness definition. One process note worth carrying forward rather than burying: Codex and Gemini still haven't participated across two rounds, so this contract is really a solo pass, not a three-way sign-off — worth a sanity-check from another model later if either tool comes back online, especially on the transport-risk and monetization calls. No open substantive disagreement otherwise.

CONSENSUS: YES

## Final Output

**Scope:** This phase — and the whole build — covers Crosswire only. The 16-candidate-ideas/pick-8 portfolio exercise already happened upstream; it is out of scope here. This project inherits the parent portfolio's binding constraints and applies them to one app. If any later phase drifts into re-discussing portfolio-level app selection, cross-app parallelism, or Jira/Notion backfill for the other seven apps, that's out of scope for this transcript and should be redirected, not entertained.

**Original prompt:** Preserved verbatim above — the full parent portfolio prompt plus the Crosswire-specific spec (name, category: multiplayer 10-12 players, one-line promise: fully cooperative asymmetric-clue game with no deception, no design handoff prompt supplied yet).

**Hard requirements:**
- SwiftUI, iOS 17+, local-first, MultipeerConnectivity/GameKit as the primary transport, built behind an abstracted transport layer so a cloud relay can be added later without a rewrite.
- Full production polish: empty/loading/success/error states on every reachable screen, accessibility, persistence of session/game state across interruptions.
- Monetization must sell real value (content/modes/mechanics) and must never gate core participation — joining and playing as a guest stays free and frictionless; paid tier is host-side (extra scenario/clue packs, more concurrent hosted sessions, new mission types).
- Mechanical uniqueness must be explicitly argued in the design phase against the closest existing cooperative-asymmetric-info games (Hanabi, The Mind, Codenames Duet, Decrypto, Spaceteam, Keep Talking and Nobody Explodes) — not assumed by default.
- Degraded-connectivity handling (partial groups, late joins, reconnect without losing progress) and an explicit answer for host backgrounding/locking mid-round are required design decisions, not afterthoughts.
- Secret-info UI mitigations (tap-and-hold to reveal, auto-hide on background) are a stated requirement.

**Non-goals:** No voice/video chat. No cross-platform/Android client. No real-time cloud multiplayer in v1. No attempt to solve MultipeerConnectivity's fundamental range/interference limits beyond graceful degradation. No claim of verified 10-12-simultaneous-real-device testing — that scale is not executable in this pipeline; real-device testing is limited to whatever small device count is actually available (likely 2-3 devices/simulators), and the build/verification phases must state that limitation explicitly rather than imply broader coverage.

**Production-readiness definition for Crosswire specifically:** the rules engine/state machine is fully implemented and unit-tested independent of the transport layer (mock transport simulating N peers, latency, drop, reconnect); the MC session layer handles disconnect/reconnect/host-loss without corrupting game state; real-device testing happens at whatever small scale is actually available (likely 2-3 devices), and the final review explicitly states what device-count scale was tested versus what remains an untested assumption, rather than silently implying full-scale verification.

**Decision rules for later phases:** If a design idea requires reliable real-time sync across all 10-12 peers simultaneously (rather than turn-based/event-based sync), flag it immediately as exceeding what the chosen transport can promise — don't quietly build around it. If a monetization idea would gate anything a guest needs to participate, reject it outright regardless of revenue appeal. If the design phase can't articulate a concrete mechanical delta from the closest 2-3 existing games, that's a blocking gap, not a nice-to-have. This contract was produced with only one of three participants actually weighing in (Codex and Gemini unavailable both rounds) — if either becomes available before the design phase concludes, sanity-check this contract against them, particularly the transport-risk and monetization-never-gates-guests calls.

## Initial Discussion

Round 2 was a clean fix-up: the Quality Gate caught a real self-contradiction (the promise sentence said "8-12," the scope section said "10-12," and a third number, 5-6, floated around unattached to either), and Claude owned it directly as a mistake rather than dressing it up as a deliberate call. The resolution is straightforward — the ceiling is 10-12 everywhere, full stop, because that's inherited verbatim from the parent portfolio prompt and reaffirmed as a hard requirement in the locked prompt contract, not something this phase has standing to quietly revise. The floor is named as one open question for the design phase, with one candidate range (5-8, explicitly a starting hypothesis, not a locked number) and a requirement that whatever floor the design phase lands on comes with a stated reason — either mechanical viability (does the puzzle actually still work with less content spread around) or party-energy viability (does it stop feeling like a party at low counts) — rather than an arbitrary pick. Everything else from round 1 — the silent/text-only differentiator, the core loop, the v1 bans on procedural content and spectator mode, the success criteria tied to a fully playable scenario pack plus mock-transport unit tests — held up untouched and wasn't in dispute.

No open disagreement remains. Codex and Gemini still haven't participated across two rounds (rate-limit and auth issues respectively), so this is still a solo pass — worth a gut-check from another model later, same as the last phase — but there's no substantive fork left to resolve.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Crosswire is a silent, text-only cooperative party game for 10-12 players where every player holds a unique fragment of a shared mystery and the group must reconstruct the whole picture by exchanging short, truthful clues through their phones — no one ever holds the full truth, and no clue is ever a lie.

**Primary user & scenario:** The primary user is the host — the "designated game person" in a friend group, family, or coworker team who owns the app, physically gathers the group in one room, picks a scenario pack, and runs the session. Everyone else is a guest: install the app, join the nearby session, no account, no setup friction.

**Core loop:** Host creates a session and picks a scenario pack → players join over MultipeerConnectivity → each player is dealt a private fragment tied to one shared puzzle → a bounded clue-exchange phase where players post short, constrained, always-true clues into a shared visible log → the group submits a collective solution attempt before a round/turn budget expires → win/loss resolves → a debrief screen reveals what everyone was actually holding (the "aha" payoff) → replay or move to the next scenario.

**Hard scope boundaries:**
- Player count ceiling is 10-12, inherited directly from the locked prompt contract — not open for revision at this phase.
- Player count floor is an explicit open question for the design phase to resolve deliberately, not assume: candidate starting range is 5-8, and whatever number is chosen must come with a stated reason tied to either mechanical viability (does the puzzle still hold together with more content per player) or party-energy viability (does it stop feeling like a party at low counts) — not an arbitrary pick.
- No procedurally generated puzzles in v1 — scenarios ship as finite, hand-authored decks.
- No deception, ever — every clue a player gives must be true; this is the mechanical core, not flavor text.
- No live spectator / big-screen mode in v1 (candidate for v2).
- The design phase must directly address the "feels like solo homework, not a party" risk (energy/pacing of the silent clue-passing loop) as a named, must-solve design problem — not an afterthought.
- All non-goals and hard requirements from the prompt contract (no voice/video, no cross-platform, no cloud multiplayer in v1, guest-never-gated monetization, transport abstraction, etc.) carry forward unchanged.

**Measurable success criteria:** MVP is done when one full scenario pack is playable start-to-finish (create session → join → play → win-or-lose → debrief → replay) and the rules engine is unit-tested independent of transport against mocked multi-peer conditions (latency, drop, reconnect) — not just "the code compiles." A developer should be able to explain the app in the one sentence above, and the scope above is small enough to build in one pass.

**Process note carried forward:** As with the prompt-contract phase, Codex and Gemini have not participated across either round (rate-limit / auth issues) — this is a solo pass. If either becomes available before the design phase concludes, sanity-check this product framing against them, particularly the "silent/text-only as the differentiator" claim and the open player-count-floor question.

## Per App Product Brief

Here's where this landed: again it was just Claude carrying the round solo — Codex is still in its rate-limit cooldown and Gemini's still locked out on auth, so nobody's pushed back or added a second angle yet. But what got put down is thorough and directly answers everything this phase asks for, with no internal contradictions I can find (the player-count language stays consistent with the locked 10-12 ceiling from earlier phases, unlike the mix-up in the prior phase).

The gist of what got proposed: the target user isn't "party game players" in the abstract, it's the recurring host — the friend-group organizer, the family holiday-gathering planner, the office social-committee person — who already owns the ritual of getting 10-12 people in a room and is stuck because physical party games break down past 6-8 players. The core loop is host picks a scenario pack → zero-friction nearby join (no codes, no accounts) → private fragments dealt → clues posted to a shared live board (structurally true by construction, not just "please don't lie") → group-confirmed solution → a debrief reveal that's the actual payoff and screenshot bait. Money comes from the host side only: 2-3 scenario packs free forever (so first impressions are great and guests never hit a wall), then a subscription for new monthly genre packs plus a paid "campaign mode" that links missions into an ongoing storyline — real content and mechanics, not cosmetics, and guests can always join any session for free since that's what keeps the invite loop alive. The competitive wedge is that this is the first game in this space where the phone *is* the entire communication channel rather than a sidekick to talk-over-each-other play, which is exactly why it can scale to 10-12 without turning into noise, and why it works in loud rooms and includes hard-of-hearing players on equal footing. Growth is structural (every session forces new installs) rather than a bolted-on referral gimmick, and local-first is treated as core to the product promise (zero-bar reliability) with cloud kept strictly to future content delivery and an already-abstracted transport, not a v1 dependency.

No disagreement surfaced because there's still only one voice in the room — that's a process gap worth flagging again, not evidence of unanimous agreement.

CONSENSUS: YES

## Final Output

**Target user and use case:** The recurring social-gathering host (game-night organizer, family-holiday-gathering planner, office social-committee lead) who already wrangles 10-12 people into one room regularly and has hit the ceiling of what physical party games can do at that size. Her use case: turn "everyone's phone is already out" into a 20-35 minute cooperative mystery with a real beginning, middle, and payoff — no one sitting out, no one "running" the game as an exhausting judge.

**Core loop:** Host picks a scenario pack → app opens a nearby session, guests join with zero friction (no codes, no accounts) → host locks roster and starts the mission → each player is dealt a private, concrete fragment (name/timestamp/location/object) tied to one shared central question → players post short clues built from constrained, structurally-true-only building blocks (lying is impossible by construction, not just discouraged) onto a shared live-updating board while a countdown runs → the group proposes and majority/full-confirms a solution together → debrief screen reveals everyone's full fragment side-by-side (the "wait, YOU had that?!" payoff and the retention/replay hook) → replay or next scenario.

**Paid value and subscription value:** Free tier includes 2-3 complete scenario packs so a host's first several nights are genuinely great — never bait-and-switch. Paid subscription unlocks ongoing new genre packs (monthly), plus a "campaign mode" that chains multiple missions into a persistent storyline across game nights. This is real content/mechanics spend by the host, never a cosmetic-only tier, and it never touches what a guest needs to join and play — that stays free and frictionless forever.

**Competitive wedge:** Every adjacent cooperative-clue game (Hanabi, Codenames Duet, Decrypto, Spaceteam, Keep Talking) is built around live speech at a small table, which caps them well below 10 players before chaos (the point, for Spaceteam) or breakdown (Hanabi past ~5) sets in. Crosswire makes the phone the entire communication channel instead of a sidekick to conversation — that's what lets it scale to 10-12 without collapsing into noise, work in a loud bar, put a deaf/hard-of-hearing player on equal footing, and travel with zero physical setup. Named risk to guard in design: silent/text-only can tip into "everyone quietly doing homework," so a live shared board, visible countdown urgency, and haptic/sound pings on new clues are required, not optional polish.

**Viral or niche growth angle:** Structural, not bolted-on — every session requires every guest to install the app to participate at all, so one host running one game night is a guaranteed multi-install event. The debrief reveal screen is inherently screenshot-shareable without any dedicated share feature needing to exist in v1. Growth strategy is niche-first: communities that already host recurring group gatherings (game-night circles, r/boardgames, corporate team-building/HR) rather than broad general awareness.

**Local-first and cloud-ready plan:** The entire mission lifecycle (session creation, roster, fragment dealing, clue exchange, resolution, debrief) runs over MultipeerConnectivity with zero internet dependency — a genuine selling point for basements, backyards, cabins, and offices with bad wifi. Cloud is scoped strictly as a future distribution/content channel: scenario packs are static bundles that can later be fetched remotely without touching the transport layer, and the transport already sits behind an abstraction so a v2 remote-play or leaderboard-sync feature is additive, not a rewrite. The local session is the product; cloud never becomes a v1 dependency.

**Process note carried forward:** Codex and Gemini have not participated in this phase's round 1 (rate-limit/auth issues, consistent with both prior phases) — this is a solo pass. If either becomes available before the design phase, sanity-check this brief against them, particularly the subscription-value framing (campaign mode, monthly packs) and the competitive-wedge claim.

## Detailed Discussion

Here's where round 1 landed: same pattern as every phase so far — Codex is still cooling down on rate limits and Gemini's still locked out on auth, so this is Claude flying solo again. But the substance holds up well: it takes every loose thread the last three phases explicitly punted forward (host-loss, backgrounding, late joins, degraded connectivity, secret-info UI) and actually resolves each one into a concrete rule instead of leaving it vague, and it adds several real edge cases nobody had named yet (auto-lock silently dropping peers, scenario-content solvability validation, local-network permission denial as an App Store/first-run gate, MC display-name privacy leakage, duplicate-name collisions). Nothing here contradicts the locked prompt contract, initial discussion, or product brief — the "no host migration in v1" call is a genuine judgment call but it's argued honestly (matches the earlier phase's own admission that we can't build/verify real multi-device resilience credibly) rather than silently smuggled in. The player-count-floor question stays correctly parked for the design phase, as previously assigned, with just a sharper risk to test against (dense fragments breaking the clue vocabulary, not just "energy" dying).

I don't see any internal contradiction or missing required section, so I'm not going to manufacture a fake disagreement just because only one voice showed up — same call the coordinator made on the last three phases. If Codex or Gemini come back online before design starts, the host-loss/no-migration call and the RF-interference "accepted limitation" framing are the two highest-value things to sanity-check.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
- No host migration in v1: the host device is the sole source of truth for round state. If it's lost mid-round (locked, backgrounded, crashed, force-quit), every peer detects the MC disconnect and shows an explicit "host disconnected, mission ended" state with a "return to lobby" action — never a silent hang or infinite spinner.
- The idle/auto-lock timer is disabled for the duration of an active session and restored afterward, on every device — silent/text gameplay has long no-touch stretches that would otherwise trigger auto-lock and drop players from the MC session without any error on their part.
- Joining is only possible in the lobby, before the host locks the roster and starts the mission. Once fragments are dealt, the roster is frozen — no live re-dealing to accommodate late arrivals. A late arrival after start sees an explicit "mission in progress, wait for the next one" state and can queue for the lobby of the next scenario.
- Mid-round player departure (background, lock, quit) triggers a bounded reconnect grace period (60-90s) during which the player's originally-dealt fragment is preserved untouched. If the grace period expires, the round transitions to an explicit "mission compromised" loss state that names which fragment went dark, rather than leaving the group to fail silently against an now-unsolvable puzzle.
- Scenario content must pass a build/import-time validation gate: schema correctness plus an automated solvability check confirming the puzzle's answer is actually derivable from the union of all dealt fragments using only the allowed clue-token vocabulary. This is what makes "no deception, ever" an enforced mechanical guarantee rather than a marketing claim resting on hand-authored content that could silently drift inconsistent.
- MultipeerConnectivity's local-network permission prompt is treated as a first-class, detectable state — if a guest denies it, the app shows a specific "local network access needed" error with a Settings deep link, not a generic "no sessions found" empty state.
- MC peer display names are always the player's in-app-entered game name, never defaulted to the device name (which commonly leaks a real first name). Duplicate display names within one session are disambiguated automatically (auto-suffix) at join time, since clue attribution on the shared board depends on distinguishable names.

**Edge cases enumerated:** host disconnect mid-round; screen auto-lock silently dropping a connected peer; non-host player backgrounding/locking/quitting mid-round; late join attempts after mission start; partial/incomplete lobby at start time; scenario content with internal contradictions or an unreachable solution; local-network permission denial on first launch; duplicate in-session display names; real-world RF interference from co-located Bluetooth devices and multi-household Wi-Fi.

**Data and privacy implications:** No accounts, no telemetry, no analytics, no cloud sync of personal data in v1 — stated as a firm assumption, not a default that can be quietly reversed later without a deliberate, reviewed decision. The only per-player data is a self-chosen in-app display name, which is broadcast in the clear over local Bluetooth/Wi-Fi via MC advertising to any nearby listening device (not just session members) — a mild but real local-network exposure, mitigated by never using device names and never persisting anything beyond the session.

**Risk register (with mitigations, or named as accepted limitations):**
- Host loss mid-round → mitigation: graceful session termination, no migration attempted, explicit UI state (locked decision, not a gap).
- Mid-round player departure → mitigation: grace-period reconnect preserving the original fragment, then explicit "mission compromised" loss state.
- Auto-lock silently dropping a peer → mitigation: idle timer disabled for the session's duration.
- Local-network permission denial → mitigation: specific detected error state with Settings remediation, not a generic empty state.
- Content-authoring violating the truth-only guarantee → mitigation: mandatory schema + solvability validation gate before a scenario pack can ship.
- Duplicate display names → mitigation: uniqueness enforcement / auto-suffix at join.
- Real-world RF interference in a crowded party room (multiple phones, Bluetooth peripherals, competing Wi-Fi) → **accepted limitation, not solved**: no app-layer fix exists; mitigated only by graceful degradation (clear reconnecting states, no data corruption on drop) and setting expectations via a first-run tip, not a promise of flawless connectivity. This is consistent with the prompt contract's existing non-goal against claiming full-scale device reliability.

**Final assumptions carried into design/architecture as locked:** no host migration in v1; idle-timer suspension during active sessions; lobby-only join window with mission-start roster freeze; grace-period-then-loss-state for mid-round departures; mandatory scenario validation (schema + solvability) as a build gate; MC display names sourced only from in-app input, never device identity; no accounts/telemetry/cloud sync of personal data in v1; explicit, detected local-network-permission-denial error state; duplicate-name collision handling at join. The player-count floor remains the design phase's open call, now sharpened with a concrete test to run against real scenario content: check whether fewer players makes individual fragments too dense to compress into the constrained clue vocabulary, which would be a mechanical break rather than just a party-energy problem.

## App Features

Only Claude weighed in again this round (Codex still cooling down, Gemini still locked out), but the output directly resolves everything this phase needed, including the one number every prior phase punted forward: the player-count floor. It lands on 6 as the floor (paired with the locked 10-12 ceiling), reasoned through rather than picked arbitrarily — below 6 the "nobody holds the whole picture" premise stops being a real differentiator from what Decrypto/Codenames Duet already do at small scale. That becomes a concrete feature (a minimum-player gate on "Start Mission" with a named blocked state), not just a number in a doc.

The must-have list is scoped tightly to the already-locked MVP success criteria (one scenario pack, playable start to finish) and takes every resilience/edge-case decision from the earlier detailed-discussion phase and turns it into a buildable feature with a testable acceptance bar, rather than re-litigating them. A few real judgment calls get made cleanly: full-confirm (not majority) for solution locking, since a wrong majority-guess in a cooperative game feels bad; the free/locked pack-picker model gets built honestly even with only one pack shipping, so the guest-never-gated monetization rule has a concrete UI expression instead of being an abstract policy. The single biggest named risk — that the solvability validator has only ever been checked against one hypothetical scenario, and that fragments might not scale cleanly from 12 players down to 6 without redesigning how content splits — is flagged as needing real content to resolve, not just code, and it's smart that this is being named now rather than discovered mid-build.

No disagreement exists to resolve because there's still only one participant — same process gap as every phase before it, worth a gut-check later if Codex/Gemini come back, but nothing here is contested and the required output (must/should/could/won't with acceptance criteria) is fully present and concrete.

CONSENSUS: YES

## Final Output

**Product promise this scope must serve:** every must-have below exists to deliver one full scenario pack, playable start to finish (host → join → play → win/lose → debrief → replay), for 6-12 players, with no lying possible and no guest ever paywalled.

**Player-count floor, resolved:** 6 (ceiling stays 10-12, locked earlier). Reason: below 6, "no one holds the full picture" stops being a real mechanical delta from small-table games like Decrypto/Codenames Duet — 6 is the point where enough distinct fragments exist that no single player can mentally reconstruct the board alone.

### Must-have features (with acceptance criteria)

1. **Session hosting & discovery** — Host starts a session over the transport layer; nearby guests see it by host-chosen name. *Acceptance:* a permitted guest sees the session within seconds with zero typing; a guest who denied local-network permission sees the specific named remediation state (Settings deep link), never a blank/generic empty list.

2. **Lobby with roster lock + minimum-player gate** — Guests join freely pre-start; "Start Mission" is disabled below 6 or above the pack's max, with a labeled reason. *Acceptance:* joining after lock shows "mission in progress, wait for next one," never a silent failure; the disabled-start button always states why.

3. **Fragment dealing scaled across the full 6-12 range** — The shipped pack defines how its total fact content splits at every player count in range, not just at max. *Acceptance:* the schema + solvability validator passes for every player count 6 through 12 individually, not once at a single count.

4. **Constrained, structurally-true clue composition on a shared live board** — No free-text clue field; clues are built only from tokens tied to the player's own dealt fragment. *Acceptance:* it's mechanically impossible to submit a clue not derivable from your fragment; the board updates for all peers within a couple seconds, with collision-proofed display names attached.

5. **Round timer + solution proposal with full-confirm** — Visible synced countdown; any player can propose a solution; full-group confirm (not majority) locks it in. *Acceptance:* all peers see materially the same countdown; a solution only resolves once every player has confirmed.

6. **Debrief reveal screen** — Every player's original fragment shown side-by-side after resolution. *Acceptance:* fires on both win and loss — the reveal is the payoff regardless of outcome.

7. **Resilience states (host-loss, idle-lock, mid-round departure)** — Host disconnect → terminal "mission ended" + return-to-lobby; idle timer suspended for session duration; mid-round departure → grace-period reconnect preserving the original fragment, expiring into a named "mission compromised" state naming the missing fragment. *Acceptance:* none of these ever present as an infinite spinner — each resolves to a labeled screen within its stated window.

8. **Secret-info UI protection** — Tap-and-hold to reveal your own fragment; auto-hide/blur on background. *Acceptance:* an immediate background/foreground cycle mid-round blurs the fragment before the OS finishes its transition animation.

9. **Persistence across interruptions** — Force-quit/relaunch within the grace period restores the in-progress round with fragment intact, not a reset to onboarding.

10. **Honest free/locked pack-picker model** — Shipped pack shown as free/unlocked; at least one truthfully-labeled "more packs — coming later" entry. *Acceptance:* a guest joining someone else's session never encounters a paywall anywhere in their flow — no exceptions.

11. **Accessibility + full state coverage** — VoiceOver labels on fragment content/clue tokens/debrief reveal; Dynamic Type doesn't clip the board; every screen above has explicit empty/loading/error states, not just a success screenshot.

### Should-have (real value, not gating MVP completion)
- A second scenario pack, to prove the validation gate generalizes beyond one hand-tuned case.
- A real StoreKit subscription purchase flow behind the paywall placeholder.
- A first-run tip about Bluetooth/Wi-Fi spacing, given the accepted RF-interference limitation.

### Could-have
- Campaign mode chaining missions across nights.
- More than 2-3 free packs.
- Cosmetic per-scenario-genre theming.
- Sound/haptic pings on new clue posts (the live board + timer are the required "feels alive" mitigations; pings are an enhancement, not required to hit the bar).

### Won't-build (this pass)
- Host migration of any kind.
- Live re-dealing for late joiners.
- Spectator/big-screen mode.
- Voice/video chat.
- Cross-platform (Android) client.
- Cloud multiplayer.
- Procedurally generated scenarios.
- Real/live payment processing (sandbox or production StoreKit purchase is should-not-must).
- Campaign mode.
- Multiple confirm-threshold variants — one rule (full confirm) ships; no host-togglable majority mode.

### Standing risk carried into build
Fragment-scaling across the 6-12 range is unproven until real scenario content exists and the solvability validator actually runs at both ends of the range. If dense fragments at low player counts can't compress into the clue-token vocabulary, the fallback is redundant/overlapping fragments rather than bigger ones — a content-design pivot, not a code fix — and it needs to surface early in the build, not at the end.
