# crosswire — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

CONSENSUS: YES

Claude carried this round solo again (Codex still cooling down on rate limits, Gemini still locked out on auth), but what came out of it is a complete, concrete design pass that hits every required section for this phase and doesn't contradict anything locked earlier. The headline idea — a "situation room / intercepted transmission" visual identity, with a corkboard-style shared clue board, monospace type for verified-true clue text, and one accent color per scenario genre — gives Crosswire an actual visual identity instead of generic chat-app styling, and it's cheap to build now even though only one pack ships at MVP.

The single biggest structural call is collapsing the whole round into one persistent Mission screen (board + your fragment tray + clue composer + timer + solution-confirm, all layered as sheets on one canvas) rather than a multi-screen round flow — this is argued as the actual fix for the "feels like solo homework" risk named all the way back in the initial discussion, more load-bearing than haptic pings. It also surfaces a real conflict nobody had caught yet: tap-and-hold-to-reveal (a locked hard requirement) doesn't work for VoiceOver users, since VoiceOver has its own gesture vocabulary and can't "secretly peek." The fix proposed — make the reveal control a proper accessible button/toggle, and get the privacy guarantee from timing/haptic-confirmed private reveal rather than from the gesture being obscure — resolves the conflict instead of quietly picking one requirement over the other. The corkboard metaphor is explicitly scoped as a skin over a plain, linear, VoiceOver-readable list, with Dynamic Type causing reflow (not truncation) and Reduce Motion killing the pin-drop/connecting-line animations — so the boldness never becomes a comprehension tax.

No disagreement to resolve — still only one voice in the room, same process gap as every phase before it. Nothing here contradicts the prompt contract, the locked 6-12 player range, the full-confirm rule, or the resilience states from the detailed-discussion phase; it takes each of those and gives it an actual screen and state treatment for the first time.

## Final Output

**Visual direction:** Crosswire reads as a shared "intercepted transmission / situation room," not a chat app with a timer. Dark surface, corkboard/evidence-board metaphor for the shared clue log (pinned clue cards, subtle connecting lines between related clues — location/time/object matches — restrained, not literal string-and-pushpin kitsch). Clue text renders in a distinct monospace/transmission-style typeface against a humanist sans for chrome, so "structurally-guaranteed-true" clue text is visually distinct from ordinary UI copy everywhere it appears. Each scenario pack owns one accent color (amber/heist, cold teal/missing-persons, red/sabotage) — a visual identity system seeded now even though one pack ships at MVP. Hard rule: the metaphor is a skin over a strictly linear, semantically-ordered list underneath — strip every visual flourish and the screen still has to work as a plain accessible list.

**Core IA decision:** One persistent **Mission screen** carries the entire round — shared board, your fragment tray, clue composer, countdown timer, and propose/confirm-solution action all live as layers/sheets on one canvas. Players never navigate away from the board mid-round; that single-canvas rule is the primary mitigation for the "silent solo homework" risk named in earlier phases, more load-bearing than haptic pings (which remain a could-have on top).

**Screen inventory:**
1. Name entry (first launch, persisted locally, editable later, never defaults to device name)
2. Home/Discovery (dual host/guest entry point — dominant "Join [Host]'s Mission" card if one's broadcasting, "Host a Mission" always available)
3. Local-network-permission primer (shown before the system prompt, since a reflexive "Don't Allow" is otherwise unrecoverable without a Settings trip)
4. Pack Picker (host only — free pack unlocked, honestly-labeled locked packs with visible genre accent colors)
5. Lobby/Roster (shared host/guest view — host sees live roster + Start button disabled below 6 with reason stated inline; guest sees "waiting for host to start")
6. Late-join-blocked screen (arriving after roster lock)
7. Mission Briefing (one-shot cinematic beat, identical on every device the instant host starts — scenario title, premise, central question — host advances it to trigger fragment dealing; the "everyone leans in together" ritual moment)
8. Mission screen (persistent canvas: board, fragment tray, composer, timer, solution flow — richest state set in the app)
9. Solution Confirm overlay (proposed answer + live tally of who has/hasn't confirmed — full-confirm per the locked rule)
10. Resolution beat (deliberate pause/transition before Debrief)
11. Debrief/Reveal (every fragment shown side-by-side, "Case Closed"/"Case Unsolved," never punitive in tone)
12. Replay/Next-Scenario
13. Resilience-state screens: host-disconnected terminal state; visible (not hidden) "reconnecting" indicator for a peer's grace period; "mission compromised" state naming the dark fragment; relaunch-restore transition
14. Settings/About (display name edit, RF-spacing tip, privacy note, restore-purchases placeholder)

**Primary user flow:** Name entry → Home/Discovery → (host: Pack Picker → Lobby with roster/minimum-player gate) or (guest: join a discovered session → Lobby waiting state) → roster lock → Mission Briefing (simultaneous on all devices) → Mission screen (fragment dealt, clue exchange on shared board, countdown running) → Solution Confirm (propose → full-group confirm) → Resolution beat → Debrief/Reveal → Replay or next scenario. Off-path branches at every step: permission denial, late-join-blocked, host-disconnect, peer grace-period/mission-compromised, force-quit-and-relaunch-within-grace-period restore.

**State model per screen (representative, not exhaustive):**
- *Home/Discovery:* scanning/loading (visible searching animation, not blank), populated-success, true empty ("no missions found nearby" with the RF-spacing tip folded into this exact state), permission-denied error (visually distinct from the empty state, with Settings deep link).
- *Lobby:* connecting/loading, populated (roster growing), disabled-Start-with-stated-reason (below minimum), locked/starting transition.
- *Mission screen:* normal live play; degraded (a peer visibly in reconnect grace window); mission-compromised terminal state; fragment-hidden vs. fragment-revealed (the core secret-info toggle, now via an accessible control, not a bare gesture).
- *Debrief:* single complete state by definition, but structurally identical whether the case closed or not, so the reveal payoff isn't weaker on a loss.

**Accessibility notes:**
- **Named conflict + resolution:** tap-and-hold-to-reveal (locked hard requirement) is incompatible with VoiceOver as a bare gesture. Fix: the reveal control is a real accessible button/toggle with a clear label ("Reveal your fragment"), and the privacy property comes from auto-hide timing plus private haptic/audio confirmation — not from the gesture being secret, since gesture obscurity was never accessible to begin with.
- VoiceOver reads the board as a straightforward ordered list ("clue from [name]: [text], posted [time]") regardless of the visual connecting-line layout.
- Dynamic Type causes clue cards to grow and re-stack vertically, never truncate or overlap.
- Reduce Motion disables pin-drop/connecting-line animations in favor of instant appearance.
- Peer reconnect status stays visible to the rest of the group (not silently hidden) — this doubles as both a resilience-state requirement and a shared-tension design beat.

**Standing risk carried forward:** none new from this phase — the fragment-scaling-across-6–12 risk from the prior phase is unaffected by this design pass and remains a content-authoring question, not a screen/IA question.

## Design Handoff

Looking at where round 1 landed: Claude did another solo pass (Codex still cooling down, Gemini still locked out — same story as every phase in this project), but it directly picks up the design_discussion phase's screen inventory and turns it into the actually-buildable handoff this phase requires, rather than restating adjectives. The headline calls: a single `MissionViewModel` owns all round state so the "one persistent Mission screen" idea from last phase doesn't get built as several sheets secretly holding duplicate state (a real bug class with async MC delivery); the corkboard connecting-lines effect gets demoted from must-have to optional/should-have because it's genuinely expensive at 40-60 clue cards and risks janking exactly the moment ten people are watching a clue land; the countdown needs periodic host-authoritative correction ticks, not a free-running per-device timer, or "materially the same countdown" (a locked acceptance bar) quietly fails over a multi-minute round; and a real gap gets caught — full-confirm had no way to say no, so a "decline and return to board" control gets added next to confirm. On the Claude Design question, it makes an explicit, argued call: no external design pass for the interactive screens (a static mockup can't represent a live stateful multi-peer canvas), reserving Claude Design only for three optional background-texture images per pack theme.

Nothing here contradicts anything locked in prior phases — it's implementation detail added on top of the design_discussion's IA and visual direction, not a re-litigation. There's no disagreement to resolve, just the standing process gap (still one voice in the room).

CONSENSUS: YES

## Final Output

### Screen-by-screen design specification

**1. Name Entry** (first launch)
- Layout intent: single centered text field, short copy explaining the name is shown to other players, primary CTA below.
- Key components: `NameField`, primary `Button`.
- State variants: empty (CTA disabled), typed (CTA enabled), validation error (blank/whitespace-only name rejected inline, no alert).
- Accessibility: field auto-focused with VoiceOver announcing purpose; label is not a placeholder-only (placeholder text disappears for VoiceOver on focus if used as the sole label).
- Motion: none required; simple fade-in on appear.

**2. Home/Discovery**
- Layout intent: dominant "Join [Host]'s Mission" card when a session is broadcasting nearby; "Host a Mission" button always present beneath, never hidden by a found session.
- Key components: `SessionCard`, `ScanningIndicator`, `PermissionPrimerCard`, `EmptyStateView`.
- State variants: scanning/loading (visible searching animation, not blank), populated-success (one or more sessions), true empty ("no missions found nearby" with the RF-spacing tip folded directly into this state's copy), permission-denied error (visually distinct treatment from empty — icon + Settings deep-link button, never collapsed into the empty state).
- Accessibility: scanning state announces via VoiceOver ("Searching for nearby missions") rather than relying on a silent spinner; permission-denied state's Settings button is a first-class accessible element, not a text link.
- Motion: scanning indicator uses a looping animation that Reduce Motion converts to a static "searching…" label with a subtle opacity pulse only.

**3. Local-Network Permission Primer**
- Layout intent: single full-screen explainer shown before the system permission dialog fires, plain language on why the permission is needed, one CTA that triggers the system prompt.
- Key components: `PermissionPrimerCard` (shared with Home's denied state, parameterized by pre/post).
- State variants: pre-prompt (only state — this screen exists once per first-run).
- Accessibility: standard button semantics; no custom gesture.
- Motion: none.

**4. Pack Picker** (host only)
- Layout intent: card grid or list, one card per pack, each showing its genre accent color, free/locked badge.
- Key components: `PackCard` (accent-colored border/glow, lock badge when locked), grid/list container.
- State variants: unlocked-selectable, locked-labeled ("coming later," tappable to a non-paywall info sheet, never a dead button and never a purchase flow in MVP), selected/confirmed.
- Accessibility: lock state announced in the accessibility label itself ("Heist pack, locked, coming later"), not conveyed by icon color alone.
- Motion: selection uses a simple scale/highlight, no accent-color animation.

**5. Lobby/Roster** (shared host/guest view)
- Layout intent: roster list growing top-to-bottom, host sees Start button pinned at bottom; guest sees a "waiting for host" status bar in the same position.
- Key components: `RosterRow`, `MinPlayerGateBanner`, `StartButton` (host) / `WaitingIndicator` (guest).
- State variants: connecting/loading, populated (roster growing live), disabled-Start-with-stated-reason (below 6 or above pack max — reason text always visible, never just a grayed-out button), locked/starting transition (brief, non-interactive beat before Mission Briefing).
- Accessibility: roster changes announced via VoiceOver as a polite live-region-style update ("Jordan joined — 7 of 12"), not silently re-rendered.
- Motion: new-row insertion animates with a simple slide/fade; Reduce Motion replaces with instant appearance.

**6. Late-Join-Blocked**
- Layout intent: single explanatory screen ("Mission in progress — you'll be ready for the next one"), CTA to join the lobby queue for the next scenario.
- Key components: shared `ResilienceBanner`-style layout (informational severity).
- State variants: single state.
- Accessibility: standard.
- Motion: none.

**7. Mission Briefing**
- Layout intent: full-screen cinematic case-file cover — scenario title, 2-3 lines of premise, the central question — identical simultaneously on every device; host has an "advance" control, guests see a "waiting for host to begin" sub-state on the same screen.
- Key components: `BriefingCard`, host-only `AdvanceButton`.
- State variants: displayed (host), displayed-waiting (guest, same visual, disabled advance control hidden or replaced with status text).
- Accessibility: content read as one ordered block (title → premise → question); host's advance button clearly labeled ("Begin Mission — deals fragments to everyone").
- Motion: entrance uses a deliberate, slightly slower fade/scale than typical screen transitions to sell the "everyone leans in" beat; Reduce Motion keeps the pause but drops the scale, using fade only.

**8. Mission Screen** (persistent canvas — richest screen in the app)
- Layout intent: shared board fills the main canvas as a virtualized `LazyVStack` inside a `ScrollView`; a collapsed `FragmentTray` tab docked at the bottom edge; a floating composer-entry affordance; countdown ring/bar pinned in the top bar; propose-solution action reachable from the same persistent bottom area. All secondary surfaces (fragment reveal, composer, solution confirm) present as sheets/drawers over this canvas — the canvas itself never navigates away.
- Key components: `ClueCard` (author, clue text, timestamp, optional connection indicator), `FragmentTray` (collapsed/expanded), `TokenComposer`, `CountdownIndicator`, `ResilienceBanner` (degraded/compromised overlays), presence hint (e.g., "2 players composing" without content).
- State variants: normal live play; degraded (a named peer visibly in reconnect grace window — banner stays until resolved or expires); mission-compromised terminal state (names the dark fragment, offers return-to-lobby); fragment-hidden vs. fragment-revealed (the core secret-info toggle).
- Accessibility: board reads as a straightforward ordered list ("clue from [name]: [text], posted [time]") regardless of visual connecting-line layout; fragment reveal is a real accessible button/toggle labeled "Reveal your fragment," not a bare long-press gesture — the privacy guarantee comes from auto-hide timing plus a private haptic/audio confirmation on reveal, not from gesture obscurity, since VoiceOver has no equivalent to "secretly peek."
- Motion: connecting-line decoration (see below) is the first thing Reduce Motion disables entirely; new-clue arrival uses a brief highlight/pulse on the new card, replaced by instant appearance under Reduce Motion; countdown ticks discretely under Reduce Motion rather than animating continuously.
- **Engineering note carried into this spec:** one `@Observable @MainActor` `MissionViewModel` per device owns roster, board (ordered array, never keyed by dictionary), local fragment, and the countdown's authoritative end-time; `activeSheet: MissionSheet?` drives which sheet presents. No sheet holds a duplicate copy of round state — every sheet reads the view model directly, and MC delegate callbacks marshal onto the main actor before mutating it. The board renders as a plain virtualized list; the "related clues" connecting-line effect is computed only over the currently-visible card set (never full history) and ships as an optional should-have toggle, not a must-have, given its cost at 40-60 cards. The countdown is host-authoritative: the host periodically rebroadcasts the corrected remaining-seconds value (every 5-10s), and each client eases its displayed value toward the correction rather than snapping — the same correction message also supplies a reconnecting peer's current remaining time on rejoin.

**9. Solution Confirm Overlay**
- Layout intent: proposed answer text prominent at top, a per-player tally list below, propose/confirm/decline actions pinned at the bottom.
- Key components: `ConfirmTally` (per-player status: pending/confirmed/declined — three distinct visual states, never collapsed to two), `DeclineButton` ("Not this — back to board").
- State variants: proposal-pending (tally filling in live), all-confirmed (resolves to Resolution beat), any-declined (proposal withdrawn, returns everyone to the Mission screen with a brief "returned to board" toast, not a silent disappearance).
- Accessibility: tally announces state changes as they arrive; decline control has an unambiguous label distinct from a generic "cancel."
- Motion: tally entries animate in with a simple check/x transition; Reduce Motion uses instant state swaps.

**10. Resolution Beat**
- Layout intent: brief, deliberate full-screen pause/transition (not an abrupt cut) bridging Solution Confirm and Debrief.
- Key components: minimal — a single transition view.
- State variants: single state, timed.
- Accessibility: not a VoiceOver trap — if VoiceOver is running, this beat should be brief enough or skippable so it doesn't read as a stuck screen.
- Motion: this is the one screen allowed a purely decorative beat; Reduce Motion shortens it rather than removing it outright, since it also serves as pacing, not just flourish.

**11. Debrief/Reveal**
- Layout intent: every player's original fragment shown side-by-side, framed "Case Closed"/"Case Unsolved," identical structure regardless of outcome (never a visually weaker layout on a loss).
- Key components: `FragmentRevealGrid` (or ordered list), outcome banner.
- State variants: single complete state by definition, but win/loss share the same structural layout with only the outcome banner and tone differing.
- Accessibility: the grid's VoiceOver reading order must be an explicit, deliberate sequence (e.g., alphabetical by name or host-designated order) — not left to `LazyVGrid`'s default traversal, which can silently diverge from the visual top-to-bottom-left-to-right scan sighted users follow. This is a required accessibility fix, not optional.
- Motion: fragments reveal with a staggered fade-in; Reduce Motion shows them all at once.

**12. Replay/Next-Scenario**
- Layout intent: simple choice screen — replay same pack or return to pack picker (host) / return to lobby-waiting (guest).
- Key components: primary/secondary buttons.
- State variants: single state.
- Accessibility: standard.
- Motion: none required.

**13. Resilience-State Screens** (host-disconnected terminal, reconnecting indicator, mission-compromised, relaunch-restore)
- Layout intent: all four share one `ResilienceBanner`/full-screen-state component, parameterized by severity (info/warning/terminal), so they read as one visual family rather than three drifting one-offs.
- Key components: `ResilienceBanner`.
- State variants: reconnecting (visible to the whole group, names the affected player, shows remaining grace time), mission-compromised (names the dark fragment, offers return-to-lobby), host-disconnected (terminal, "mission ended," return-to-lobby), relaunch-restore (brief transition screen shown on app relaunch within grace period, restoring the in-progress round rather than dropping to onboarding).
- Accessibility: severity is conveyed in the accessibility label text itself, not by color alone.
- Motion: reconnecting banner may use a subtle pulsing indicator; Reduce Motion replaces with a static icon plus text.

**14. Settings/About**
- Layout intent: simple form list — display name edit, RF-spacing tip content, privacy note, restore-purchases placeholder.
- Key components: standard form rows.
- State variants: single state; name-edit has inline validation matching the Name Entry screen's rule.
- Accessibility: standard list semantics.
- Motion: none.

### Design tokens / visual system
- **Surface:** near-black base (not pure black) so elevated clue cards read via a subtle lightness step plus minimal shadow, not shadow alone.
- **Chrome text:** one neutral text/chrome color pair (primary/secondary) used for all non-clue UI copy.
- **Clue text:** a monospace/slab typeface at a distinct weight from chrome text, used consistently everywhere clue content appears (composer preview, board card, debrief reveal) — this consistency is what makes "this text is guaranteed true" legible as a system, not a one-off style.
- **Accent-per-pack:** exactly one accent color per scenario pack (amber/heist, teal/missing-persons, red/sabotage), used only for that pack's card border/glow, its countdown ring color, and its pack-picker card accent — never reused for error/warning states, to keep genre identity and system-status color meaning from colliding.
- **Severity colors (system, not pack-linked):** separate, pack-independent colors for info/warning/terminal resilience states.
- **Type scale:** supports Dynamic Type reflow (cards grow/re-stack vertically) rather than truncation at any step.
- **Motion tokens:** a single "reduced" variant of every animation (fade-only/instant) gated on Reduce Motion, applied consistently rather than per-screen ad hoc decisions.

### Component inventory
`ClueCard`, `FragmentTray`, `TokenComposer` (assembles a clue only from the player's own dealt fragment data — never a raw `TextField`, since that's the control that must make lying mechanically impossible), `RosterRow`, `CountdownIndicator` (accepts a host-corrected remaining-time stream, ticks discretely under Reduce Motion), `ConfirmTally` (pending/confirmed/declined — three states), `PermissionPrimerCard`, `ResilienceBanner` (shared across reconnecting/compromised/host-disconnected, parameterized by severity), `SessionCard`, `PackCard`, `BriefingCard`, `FragmentRevealGrid`.

### State and interaction notes
- Single source of truth: one `MissionViewModel` per device; sheets never duplicate its state; MC delegate callbacks marshal to the main actor before mutating it.
- Countdown correction, not free-running per-device timers, is required to satisfy the locked "materially the same countdown" acceptance bar over a multi-minute round; the same correction message doubles as the reconnect-time-sync mechanism.
- Full-confirm needed an explicit unwind path that wasn't previously specified: a "decline and return to board" control is now required alongside propose/confirm on the Solution Confirm overlay, with tally states distinguishing pending vs. declined.
- The corkboard "connecting lines between related clues" visual is reclassified from must-have to an optional, Reduce-Motion-disabled enhancement, computed only over the visible card set — given board sizes of 40-60 cards by round's end, this protects frame rate at the exact moment the room is watching a clue land.

### Accessibility requirements
- Tap-and-hold-to-reveal is replaced by a real accessible button/toggle ("Reveal your fragment"); privacy comes from auto-hide timing and a private haptic/audio confirmation, not gesture obscurity.
- The shared board is a strictly linear, VoiceOver-readable list under any visual skin; Dynamic Type reflows cards vertically, never truncates.
- The Debrief reveal grid requires an explicit, deliberate VoiceOver reading order (not default grid traversal).
- Reduce Motion disables all decorative/connecting-line animation, replacing continuous effects with discrete or instant equivalents throughout.
- Severity/status states (permission-denied, resilience banners) are conveyed in label text, never by color alone.

### Claude Design prompt / external-design decision
**Decision: no external Claude Design pass for the interactive screens.** The Mission screen — the app's core and highest-risk surface — is a live, stateful, multi-peer canvas (sheets over a virtualized board, a host-corrected countdown, asynchronous clue arrival); a generated static mockup cannot represent that interaction model and would only need reverse-engineering into SwiftUI, which is wasted effort on the highest-risk screen in the app. The rest of the screens are specified concretely enough above (layout intent, components, states) for a SwiftUI builder to implement directly without a generated mockup.

The one place Claude Design (or an equivalent image-generation pass) is worth using is narrow and purely cosmetic: three background texture/mood images for the pack accent themes, used only as subtle surface texture behind the corkboard UI, never as a literal implementation spec. If used, the prompt should be:

> "Generate three dark, moody, abstract background textures suitable as a subtle full-bleed surface behind pinned index-card UI elements in a mobile app. No text, no UI chrome, no literal objects — texture and color mood only. Variant 1: warm amber/heist tone, subtle worn-paper or cork grain. Variant 2: cold teal/missing-persons tone, subtle fog or static-noise grain. Variant 3: deep red/sabotage tone, subtle scorched or industrial grain. Each should read as almost-solid from a few feet away, with just enough texture to avoid flatness. Export as flat images, no gradients requiring transparency, safe to place low-opacity UI elements over."

This is treated as an optional asset step, not a blocking part of this handoff.

## Ios Architecture Review

CONSENSUS: YES

## Final Output

Same pattern as every phase in this project — Codex is still rate-limited and Gemini still can't authenticate, so this is Claude's solo pass again. But it's a thorough one that hits every required output for this phase and doesn't waffle on any of the calls it needed to make.

**SwiftUI architecture:** One `@Observable @MainActor MissionViewModel` per device owns the entire active round (already locked in design_handoff), plus small separate `@Observable` view models for the short-lived pre-session screens (name entry, discovery, pack picker, lobby) rather than cramming everything into one god object. Navigation is a plain `NavigationStack` with an enum path pre-session, then a hard cutover to the single persistent Mission screen once a round starts — no push/pop once you're in a mission, which protects the "never navigate away from the board" rule from the design phase.

**Framework choices:** MultipeerConnectivity is the transport, wrapped behind a `GameTransport` protocol with exactly two conformances — `MultipeerGameTransport` (real) and `MockGameTransport` (simulates N peers, latency, drops, reconnects for tests). Nothing above that protocol ever imports MultipeerConnectivity directly, which is what actually makes "cloud relay later without a rewrite" true rather than a slogan. GameKit is explicitly ruled out and the reasoning is written down so it doesn't get re-litigated later: GameKit's real-time matchmaking needs Game Center sign-in, which breaks the locked "zero-friction, no accounts" guest promise. StoreKit 2's async APIs get architected in now (even though a live purchase flow is only should-have) because retrofitting StoreKit into a boolean-flag paywall later is genuinely painful.

**Persistence:** Three different things get three different mechanisms instead of one hammer for everything — `UserDefaults` for display name/settings, bundled versioned JSON for scenario packs, and a `Codable` atomic-write snapshot in Application Support for in-progress round state (the thing that has to survive force-quit/relaunch). SwiftData is explicitly rejected for the round snapshot as the wrong tool for an ephemeral single-blob use case. This surfaces a real gap: nothing before this phase actually specified *how* "relaunch restores state" gets implemented — it was stated as a requirement with no mechanism — so this is the first phase to give it one, and it's flagged as the top risk for tech_specs to nail down precisely (what triggers a write, how a stale snapshot from a truly-dead session gets distinguished from a live one).

**Permissions/privacy:** Local network access is the only permission the app needs, with the easy-to-miss build detail that `NSBonjourServices` has to exactly match the advertised service type or discovery silently fails and looks like the "no sessions found" empty state. A `PrivacyInfo.xcprivacy` manifest is required (UserDefaults is a "required reason" API). The strong recommendation is to answer "data not collected" on the App Store privacy questionnaire, since the only personal data point (a self-chosen display name) never leaves the local peer-to-peer session — a genuine, defensible privacy badge worth not losing to an overly cautious questionnaire answer.

**Dependencies:** Zero third-party packages, full stop — everything is covered by Foundation/SwiftUI/MultipeerConnectivity/StoreKit 2/XCTest. ML and AR bonus points are explicitly declined with reasoning: either would directly conflict with the locked no-procedural-content, hand-authored-and-validated design.

**Testing:** The rules engine (dealing, clue-token validation, timer, confirm/decline state machine, solvability check) is a plain Swift module with no MultipeerConnectivity/SwiftUI import, tested against the mock transport — the only way to get deterministic CI coverage given real multi-device testing isn't executable here. The scenario-validation gate becomes an actual automated test across all of player counts 6-12, not a manual step. XCUITest covers single-device flows; multi-peer behavior stays an honestly-scoped manual 2-3 device pass, consistent with what's already been agreed.

No open disagreement — just the one standing risk (round-snapshot mechanism) explicitly handed to tech_specs to fully specify.

## Tech Specs

CONSENSUS: YES

Same story as every phase in this project — Codex is still cooling down on rate limits and Gemini still can't authenticate, so it's Claude carrying tech_specs solo again. But this round does real, load-bearing work rather than restating prior phases: it takes the one standing risk that's been explicitly handed forward since the ios_architecture_review phase — "relaunch-restore was stated as a requirement with no mechanism" — and actually gives it a concrete, unambiguous algorithm (restore eligibility = phase non-terminal AND saved-within-grace-window, checked at read time; anything else is silently deleted as crash debris, never surfaced as a user choice). That's exactly the kind of gap this phase existed to close.

The structural call — a local Swift Package split into `CrosswireModels` / `CrosswireRulesEngine` / `CrosswireTransport` / `CrosswirePersistence` / `CrosswirePurchases`, mapped directly onto the four build lanes (data_domain, services_utilities, primary_ui, polish_resilience) — is argued well: it makes the already-locked "rules engine has zero import of SwiftUI/MultipeerConnectivity" requirement a compiler-enforced boundary instead of a code-review hope, and it's what actually makes "parallel build lanes can't invent incompatible types" true rather than aspirational, which is this phase's explicit acceptance bar. The data model carries forward every earlier lock correctly (board as ordered `[Clue]`, never a dictionary; fresh UUID + fresh tally on every re-propose after a decline, closing a real UX trap where a stale tally could bleed into a new proposal). Three genuinely new, concrete decisions get added on top of what prior phases scoped: an actor-isolated `RoundSnapshotWriter` so file I/O never blocks the main-actor view model (fire-and-forget from the view model except at two explicit flush points — phase transition and backgrounding); a scroll-position-preserving board with a "new clue" indicator instead of forced auto-scroll, so a fast-moving shared board doesn't yank a player's attention away mid-read; and a hard requirement that the pre-session-to-Mission cutover be a navigation-root *replacement*, not a push, since a push would let the system back-swipe gesture silently defeat the whole single-canvas design decision.

Nothing here contradicts anything locked upstream — the package layout, snapshot mechanism, and UX fixes all extend decisions already made (MissionViewModel, GameTransport, the resilience states, full-confirm) into implementation-ready detail rather than re-opening them. All five required outputs for this phase (architecture overview, module layout, data models, persistence strategy, interfaces-json) are present and specific; testing strategy is inherited correctly from the locked ios_architecture_review decisions (RulesEngine tested purely against MockGameTransport, scenario validation as an automated per-player-count test) rather than needing to be re-litigated here. No disagreement to resolve — just the standing process gap (still one voice in the room) worth a sanity check later if Codex/Gemini come back before the build phase.

## Final Output

**Architecture overview:** Crosswire ships as one SwiftUI app target consuming a local Swift Package, `CrosswireKit`, split into targets that map 1:1 onto the four parallel build lanes so no worker can accidentally cross a boundary: `CrosswireModels` (pure Codable structs/enums, Foundation only), `CrosswireRulesEngine` (fragment dealing, clue-token validation, solvability checking, confirm/decline state machine — depends only on `CrosswireModels`, zero SwiftUI/MultipeerConnectivity imports, the module that must be independently unit-testable per the locked acceptance bar), `CrosswireTransport` (the `GameTransport` protocol plus `MultipeerGameTransport` and `MockGameTransport` conformances), `CrosswirePersistence` and `CrosswirePurchases` (snapshotting, scenario-pack loading, settings, StoreKit 2 wrapper). The app target itself owns primary_ui (all screen view models and views from the design_handoff inventory) and polish_resilience (`ResilienceBanner` family, `AppLifecycleObserver`, idle-timer management). One `@Observable @MainActor MissionViewModel` per device owns the entire active round as sole source of truth; small separate `@Observable` view models handle the short-lived pre-session screens. Navigation is a plain `NavigationStack` with an `AppRoute` enum path pre-session, then a hard *replacement* of the navigation root (never a push) at mission start, so the system back-swipe gesture can't defeat the single-canvas Mission screen design.

**File/module layout:**
- `CrosswireModels` (data_domain): `Player`, `ConnectionState`, `RosterEntry`, `ScenarioGenre`, `ClueTokenType`, `FragmentFact`, `Fragment`, `ClueTokenTemplate`, `SolutionKey`, `ScenarioPack`, `Clue`, `SolutionProposalStatus`, `SolutionProposal`, `RoundOutcome`, `RoundPhase`, `RoundSnapshot`.
- `CrosswireRulesEngine` (data_domain): `RulesEngine` protocol — dealing, clue validation, solvability, proposal resolution. Depends only on `CrosswireModels`.
- `CrosswireTransport` (services_utilities): `PeerID`, `GameMessage`, `TransportEvent`, `GameTransport` protocol, `MultipeerGameTransport`, `MockGameTransport`.
- `CrosswirePersistence` / `CrosswirePurchases` (services_utilities): `RoundSnapshotWriter` (actor), `ScenarioPackLoader`, `SettingsStore`, `PurchaseManager`.
- App target — primary_ui: `MissionViewModel`, `MissionSheet`, `AppRoute`, `AppRootCoordinator`, plus per-screen views from the design_handoff spec.
- App target — polish_resilience: `AppLifecycleObserver`, `ResilienceBannerSeverity`, `ResilienceState`.

**Data models:** Board state is an ordered `[Clue]`, never a dictionary, carried through from UI convention (design_handoff) into the model layer as a hard rule, since `RoundSnapshot` must serialize that exact ordering for relaunch-restore to reproduce an identical board. `RoundPhase` is an enum (`briefing`, `clueExchange`, `solutionConfirm`, `resolved(RoundOutcome)`); `RoundOutcome` carries data inline (`compromised(missingFragmentID:)`) so resilience screens render directly off the model. `SolutionProposal` gets a fresh UUID and fresh tally on every propose — a decline discards the old proposal entirely rather than letting a stale tally bleed into a new one. `ScenarioPack.fragmentSets` is keyed by exact player count 6...12, directly supporting the locked requirement that the solvability validator runs at every count in range, not just the max.

**Persistence strategy:** Three distinct mechanisms for three distinct data shapes (unchanged from ios_architecture_review): `UserDefaults` for display name/settings; bundled versioned JSON for scenario packs; a `Codable` `RoundSnapshot` written by a dedicated `actor RoundSnapshotWriter` (never the main-actor view model doing file I/O directly) using atomic writes. Writes coalesce during bursty clue activity (~once per couple seconds) but flush synchronously on every phase transition and on `scenePhase` moving to `.background`. **Standing risk resolved:** on cold launch, before showing anything else, check Application Support for a snapshot. Restore eligibility requires `phase` non-terminal AND `savedAt` within the same 60-90s grace window already locked for mid-round reconnect — anything older or already-resolved is silently deleted as crash debris, never presented as a user choice. If eligible, show a bounded (~1.5s cap) "Restoring mission…" transition, restore the view model, and attempt reconnect over the transport using the same `sessionID`; failure routes to the existing "mission compromised"/"host disconnected" states rather than a silent resurrection.

**Testing strategy:** Unchanged from the locked ios_architecture_review decisions — `CrosswireRulesEngine` is tested in isolation against `MockGameTransport` (simulated N-peer/latency/drop/reconnect), the scenario-validation gate is an automated test across player counts 6-12 per pack, XCUITest covers single-device flows, and multi-peer behavior stays an honestly-scoped manual 2-3 device pass.

**New UX-level decisions locked this phase:** sheets (`FragmentTray`, `TokenComposer`, solution confirm) use a partial/medium detent so the countdown ring stays visible while composing; the board preserves scroll position with a "new clue" indicator pill instead of forcing auto-scroll to bottom; snapshot writes are fire-and-forget from `MissionViewModel`'s perspective, awaited inline only at the two flush points.

```interfaces-json
{"interfaces": [
{"name": "Player", "kind": "struct", "language": "swift", "signature": "struct Player: Codable, Identifiable, Hashable { let id: UUID; var displayName: String; var isHost: Bool }", "owning_lane": "data_domain", "notes": "id generated once at name-entry, persisted in UserDefaults, stable across reconnects; displayName never defaults to device name"},
{"name": "ConnectionState", "kind": "enum", "language": "swift", "signature": "enum ConnectionState: Codable, Equatable { case connected; case reconnecting(gracePeriodEndsAt: Date); case lost }", "owning_lane": "data_domain", "notes": "drives RosterRow and ResilienceBanner rendering"},
{"name": "RosterEntry", "kind": "struct", "language": "swift", "signature": "struct RosterEntry: Codable, Identifiable { var id: UUID { player.id }; var player: Player; var connectionState: ConnectionState }", "owning_lane": "data_domain", "notes": ""},
{"name": "ScenarioGenre", "kind": "enum", "language": "swift", "signature": "enum ScenarioGenre: String, Codable, CaseIterable { case heist, missingPersons, sabotage }", "owning_lane": "data_domain", "notes": "maps 1:1 to accent-color design token"},
{"name": "ClueTokenType", "kind": "enum", "language": "swift", "signature": "enum ClueTokenType: String, Codable { case person, location, time, object, relationship }", "owning_lane": "data_domain", "notes": ""},
{"name": "FragmentFact", "kind": "struct", "language": "swift", "signature": "struct FragmentFact: Codable, Identifiable, Hashable { let id: String; let tokenType: ClueTokenType; let value: String }", "owning_lane": "data_domain", "notes": "atomic unit a player's fragment is built from; TokenComposer may only reference facts the local player owns"},
{"name": "Fragment", "kind": "struct", "language": "swift", "signature": "struct Fragment: Codable, Identifiable { let id: String; let ownerRole: String; let facts: [FragmentFact] }", "owning_lane": "data_domain", "notes": "one dealt per player per round"},
{"name": "ClueTokenTemplate", "kind": "struct", "language": "swift", "signature": "struct ClueTokenTemplate: Codable { let type: ClueTokenType; let template: String }", "owning_lane": "data_domain", "notes": "constrains TokenComposer's allowed phrasing so a clue can never be freetext"},
{"name": "SolutionKey", "kind": "struct", "language": "swift", "signature": "struct SolutionKey: Codable { let answerText: String; let requiredFactIDs: [String] }", "owning_lane": "data_domain", "notes": "used by SolvabilityChecker"},
{"name": "ScenarioPack", "kind": "struct", "language": "swift", "signature": "struct ScenarioPack: Codable, Identifiable { let id: String; let schemaVersion: Int; let title: String; let genre: ScenarioGenre; let premise: String; let centralQuestion: String; let minPlayers: Int; let maxPlayers: Int; let fragmentSets: [Int: [Fragment]]; let solution: SolutionKey; let allowedTokenVocabulary: [ClueTokenTemplate]; let isFree: Bool }", "owning_lane": "data_domain", "notes": "fragmentSets keyed by exact player count 6...12; bundled as versioned JSON, loaded by CrosswirePersistence"},
{"name": "Clue", "kind": "struct", "language": "swift", "signature": "struct Clue: Codable, Identifiable { let id: UUID; let authorID: UUID; let authorName: String; let tokens: [FragmentFact]; let renderedText: String; let postedAt: Date }", "owning_lane": "data_domain", "notes": "board is [Clue] ordered array, ForEach keys off id, never index"},
{"name": "SolutionProposalStatus", "kind": "enum", "language": "swift", "signature": "enum SolutionProposalStatus: Codable { case pending, confirmed, declined }", "owning_lane": "data_domain", "notes": ""},
{"name": "SolutionProposal", "kind": "struct", "language": "swift", "signature": "struct SolutionProposal: Codable, Identifiable { let id: UUID; let proposedByID: UUID; let answerText: String; var tally: [UUID: SolutionProposalStatus] }", "owning_lane": "data_domain", "notes": "a decline discards this proposal entirely; a new propose creates a fresh id and fresh tally, never reuses"},
{"name": "RoundOutcome", "kind": "enum", "language": "swift", "signature": "enum RoundOutcome: Codable { case solved, unsolved, compromised(missingFragmentID: String) }", "owning_lane": "data_domain", "notes": ""},
{"name": "RoundPhase", "kind": "enum", "language": "swift", "signature": "enum RoundPhase: Codable { case briefing, clueExchange, solutionConfirm, resolved(RoundOutcome) }", "owning_lane": "data_domain", "notes": ""},
{"name": "RoundSnapshot", "kind": "struct", "language": "swift", "signature": "struct RoundSnapshot: Codable { let schemaVersion: Int; let sessionID: UUID; let scenarioPackID: String; var phase: RoundPhase; var roster: [RosterEntry]; var board: [Clue]; let localPlayerID: UUID; let localFragment: Fragment; var remainingSeconds: Int; var activeProposal: SolutionProposal?; var savedAt: Date }", "owning_lane": "data_domain", "notes": "restore eligibility = phase is non-terminal AND now - savedAt <= graceWindow(60...90s); anything else deleted silently on launch"},
{"name": "RulesEngine", "kind": "protocol", "language": "swift", "signature": "protocol RulesEngine { func dealFragments(pack: ScenarioPack, playerCount: Int) -> [Fragment]; func validateClue(tokens: [FragmentFact], against fragment: Fragment) -> Bool; func evaluateSolvability(pack: ScenarioPack, playerCount: Int) -> Bool; func resolveProposal(_ proposal: SolutionProposal, roster: [RosterEntry]) -> SolutionProposalStatus }", "owning_lane": "data_domain", "notes": "pure, synchronous, non-isolated; zero imports beyond CrosswireModels; testable without any transport"},
{"name": "PeerID", "kind": "struct", "language": "swift", "signature": "struct PeerID: Hashable, Codable { let rawValue: String }", "owning_lane": "services_utilities", "notes": "opaque wrapper so nothing above transport touches MCPeerID directly"},
{"name": "GameMessage", "kind": "enum", "language": "swift", "signature": "enum GameMessage: Codable { case roster(RosterEntry); case missionStart(ScenarioPack); case fragmentDeal(Fragment); case clue(Clue); case timerCorrection(remainingSeconds: Int); case solutionProposed(SolutionProposal); case solutionTallyUpdate(SolutionProposal); case roundResolved(RoundOutcome); case hostDisconnect }", "owning_lane": "services_utilities", "notes": "wire format sent over GameTransport.send/broadcast"},
{"name": "TransportEvent", "kind": "enum", "language": "swift", "signature": "enum TransportEvent { case peerDiscovered(PeerID, name: String); case peerConnected(PeerID); case peerReconnecting(PeerID, gracePeriodEndsAt: Date); case peerLost(PeerID); case messageReceived(GameMessage, from: PeerID); case localNetworkPermissionDenied; case sendFailed(GameMessage, to: PeerID) }", "owning_lane": "services_utilities", "notes": "emitted only on the main actor; MultipeerGameTransport hops internally before yielding"},
{"name": "GameTransport", "kind": "protocol", "language": "swift", "signature": "protocol GameTransport { var events: AsyncStream<TransportEvent> { get }; func startAdvertising(sessionName: String, packID: String); func startBrowsing(); func stopAll(); func send(_ message: GameMessage, to peers: [PeerID]) async throws; func broadcast(_ message: GameMessage) async throws; func disconnect(peer: PeerID) }", "owning_lane": "services_utilities", "notes": "MultipeerGameTransport and MockGameTransport are the only two conformances; nothing above this protocol imports MultipeerConnectivity"},
{"name": "MockGameTransport", "kind": "struct", "language": "swift", "signature": "final class MockGameTransport: GameTransport { func simulate(peerCount: Int, latencyMs: ClosedRange<Int>, dropRate: Double) }", "owning_lane": "services_utilities", "notes": "used by RulesEngine and MissionViewModel test suites for deterministic N-peer/latency/drop/reconnect coverage"},
{"name": "RoundSnapshotWriter", "kind": "function", "language": "swift", "signature": "actor RoundSnapshotWriter { func save(_ snapshot: RoundSnapshot) async; func loadIfRestorable(graceWindowSeconds: Int) async -> RoundSnapshot?; func delete() async }", "owning_lane": "services_utilities", "notes": "atomic Data.write with .atomic option; coalesces bursty writes, flushes immediately on phase transition and on scenePhase .background"},
{"name": "ScenarioPackLoader", "kind": "function", "language": "swift", "signature": "struct ScenarioPackLoader { func loadBundled() -> [ScenarioPack] }", "owning_lane": "services_utilities", "notes": "reads bundled versioned JSON; a build-time test runs evaluateSolvability across player counts 6...12 for every pack"},
{"name": "SettingsStore", "kind": "function", "language": "swift", "signature": "struct SettingsStore { var displayName: String; var hasSeenRFTip: Bool }", "owning_lane": "services_utilities", "notes": "thin UserDefaults wrapper"},
{"name": "PurchaseManager", "kind": "function", "language": "swift", "signature": "@MainActor final class PurchaseManager { func products() async throws -> [Product]; func currentEntitlements() async -> Set<String>; func restore() async throws }", "owning_lane": "services_utilities", "notes": "StoreKit 2 async APIs; entitlement check is local-only via Transaction.currentEntitlements, no backend"},
{"name": "MissionViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class MissionViewModel { var roster: [RosterEntry]; var board: [Clue]; var localFragment: Fragment; var phase: RoundPhase; var remainingSeconds: Int; var activeProposal: SolutionProposal?; var activeSheet: MissionSheet?; func handle(_ event: TransportEvent) }", "owning_lane": "primary_ui", "notes": "sole owner of active-round mutable state; every sheet reads this directly, none holds a duplicate copy"},
{"name": "MissionSheet", "kind": "enum", "language": "swift", "signature": "enum MissionSheet: Identifiable { case fragmentTray, composer, solutionConfirm }", "owning_lane": "primary_ui", "notes": "presented via medium/partial detent so the countdown stays visible"},
{"name": "AppRoute", "kind": "enum", "language": "swift", "signature": "enum AppRoute: Hashable { case nameEntry, home, permissionPrimer, packPicker, lobby(sessionID: UUID), lateJoinBlocked, settings }", "owning_lane": "primary_ui", "notes": "drives the pre-session NavigationStack path; replaced wholesale (not pushed) by the Mission root once a round starts"},
{"name": "AppRootCoordinator", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class AppRootCoordinator { var path: [AppRoute]; var activeMission: MissionViewModel?; func restoreIfEligible() async }", "owning_lane": "primary_ui", "notes": "on launch calls RoundSnapshotWriter.loadIfRestorable before deciding between onboarding and the bounded Restoring-mission transition"},
{"name": "AppLifecycleObserver", "kind": "function", "language": "swift", "signature": "@MainActor final class AppLifecycleObserver { func sessionDidStart(); func sessionDidEnd(); func scenePhaseChanged(_ phase: ScenePhase) }", "owning_lane": "polish_resilience", "notes": "toggles UIApplication.shared.isIdleTimerDisabled for session duration only; on .background triggers fragment auto-hide and a flush write"},
{"name": "ResilienceBannerSeverity", "kind": "enum", "language": "swift", "signature": "enum ResilienceBannerSeverity: Codable { case info, warning, terminal }", "owning_lane": "polish_resilience", "notes": "severity conveyed in accessibility label text, never color alone"},
{"name": "ResilienceState", "kind": "enum", "language": "swift", "signature": "enum ResilienceState: Equatable { case none; case peerReconnecting(playerName: String, secondsRemaining: Int); case missionCompromised(missingFragmentOwner: String); case hostDisconnected; case restoringMission }", "owning_lane": "polish_resilience", "notes": "drives which ResilienceBanner variant renders on the Mission canvas"}
]}
```

## Project Plan

Looking at where this landed: it's Claude going solo again (Codex still in rate-limit cooldown, Gemini still locked out on auth — the same story every phase in this project), but the round-1 pass does real, useful work rather than just restating the tech_specs handoff. The core insight is that the frozen interfaces-json is good news for scheduling — the four build lanes don't need to serialize, they can all start day one against the stable contract. But it also surfaces genuine open gaps that need owners before task assignment can run cleanly: whether `dealFragments` is deterministic lookup or randomized assignment (with real consequences for test determinism and replay value), and what `MissionViewModel` actually does when a transport send fails mid-round (nothing upstream has specified this). It also makes the strongest call yet that scenario-content authoring + solvability validation — flagged as a standing risk in every phase since app_features — has to become actual milestone-one work with real schedule slack, not something handed forward again. Nothing here contradicts any locked decision; it's sequencing and risk-surfacing on top of what's already agreed. No disagreement exists to resolve since there's still only one voice in the room — consistent with every phase before it.

CONSENSUS: YES

## Final Output

**Milestones**

**M0 — Foundations & Content Kickoff (parallel start, no serialization)**
- Stand up `CrosswireModels` from the frozen interfaces-json, with a single named owner — any mid-build change to a shared type/protocol must land through this module, never a local shim in another lane.
- Start scenario-pack content authoring and the solvability-validator harness *immediately*, in parallel with the Swift lanes below — this is the one task in the whole build without a knowable duration, so it gets the longest lead time, not the shortest.
- Resolve two open design gaps as explicit, owned tasks before M1 code depends on their answers: (1) is `dealFragments` a deterministic lookup into pre-authored `fragmentSets`, or randomized assignment within a set (with a seeded/injectable RNG if the latter, for deterministic tests and meaningful replay)? (2) what does `MissionViewModel` do when `GameTransport.send`/`.broadcast` throws mid-round — retry once, drop silently, or surface a resilience banner?

**M1 — Core Engine & Transport (parallel lanes, gated only by M0's Models + the two resolved gaps)**
- `CrosswireRulesEngine`: dealing, clue-token validation, solvability checker, confirm/decline state machine. Unit tests land in this same milestone, not deferred.
- `CrosswireTransport`: `GameTransport` protocol, `MockGameTransport`, `MultipeerGameTransport`.
- `CrosswirePersistence`: `RoundSnapshotWriter`, `ScenarioPackLoader`, `SettingsStore` — with explicit edge-case tests for a stale/expired snapshot (silently discarded) and an atomic write interrupted mid-flight.
- `CrosswirePurchases`: `PurchaseManager` (StoreKit 2), largely independent of the other three.
- Scenario-pack solvability gate becomes an automated test run across player counts 6–12 for every pack, checked in this milestone, not left as a manual step.

**M2 — Mission Integration (gates UI work)**
- Wire `MissionViewModel` + `AppRootCoordinator` to the real `RulesEngine` and `MockGameTransport`, implementing the resolved send-failure policy from M0.
- A full-round integration test against `MockGameTransport`: deal → clue exchange → propose → decline/reconfirm → resolve → snapshot write → simulated relaunch → restore. This is its own milestone and gates the UI-integration milestone below — it's the cheapest place to catch state-machine bugs, before they're wrapped in SwiftUI and harder to isolate.

**M3 — UI Build-out (primary_ui + polish_resilience)**
- All 14 screens from design_handoff, built against the `MissionViewModel`/`AppRootCoordinator` shape. Pre-session screens (name entry, discovery, pack picker, lobby) can start as soon as their view models stabilize, overlapping M2 rather than waiting on it, since they don't depend on Mission-round logic.
- `ResilienceBanner` family, `AppLifecycleObserver` (idle-timer, backgrounding, auto-hide), accessibility requirements (VoiceOver reveal toggle, Debrief reading order, Dynamic Type reflow, Reduce Motion tokens) per the locked design spec.
- StoreKit paywall placeholder wired to `PurchaseManager`; free/locked pack-picker honesty enforced.

**M4 — Device/Simulator Verification & Repair**
- State up front, honestly, what device count is actually available for this pipeline (likely 2-3 physical devices, or zero — in which case simulator-to-simulator MC pairs is the stated fallback, not a silent gap discovered at the end).
- XCUITest for single-device flows (name entry, discovery empty/permission-denied states, pack picker, settings).
- Manual multi-peer pass at whatever small scale is genuinely available.
- Repair time is budgeted as first-class work here, not squeezed after "verification" nominally finishes.

**M5 — Final Review & Ship Readiness**
- Confirm against the prompt_contract's production-readiness definition. The review must state explicitly what device-count scale was actually tested versus what remains an untested assumption at 10-12 simultaneous peers — never imply broader coverage than what M4 actually exercised.

**Dependencies**
- Everything in M1-M3 depends on `CrosswireModels` (M0) and, for `RulesEngine`/`MissionViewModel` specifically, on the two resolved design gaps (dealing determinism, send-failure policy).
- Scenario content + solvability validation (M0) must complete before M2's integration test can run meaningfully, since that test needs a real, validated pack.
- M2's integration test gates M3's UI-integration work (not the pre-session screens, which can overlap).
- M4 depends on M3 being functionally complete; M5 depends on M4's honest results, not on M4 being "clean."

**Risk mitigations**
- Scenario-content/solvability risk (standing since app_features): given the longest lead time in M0, with the agreed fallback (redundant/overlapping fragments over denser ones) treated as an expected possible pivot, not a failure.
- Dealing-determinism and send-failure gaps: resolved as owned tasks in M0 before the lanes that depend on them start coding against guesses.
- Contract drift across parallel lanes: single-owner gate on `CrosswireModels` for any interface change.
- RF interference in real multi-device conditions: accepted limitation carried from earlier phases, mitigated only by graceful degradation UI, not solved.
- Device-availability risk for real-device testing: named and scoped honestly in M4 rather than discovered at final review.
- Process risk carried through every phase: still a solo Claude pass — worth a sanity check on this plan's sequencing and risk calls if Codex/Gemini become available before task assignment.

**Verification plan**
- Unit tests ship inside the same milestone as the code they cover (RulesEngine, solvability gate, persistence edge cases) — never deferred to a polish pass.
- The full-round `MockGameTransport` integration test (M2) is a named gate before UI-integration work proceeds.
- XCUITest covers single-device deterministic flows (M4).
- Multi-peer behavior gets an honestly-scoped manual pass at whatever device count is actually available, with simulator-to-simulator MC pairs as the stated fallback if zero physical devices exist.
- Final review (M5) reconciles what was actually verified against what remains an assumption, rather than letting the two silently diverge.

## Implementation Readiness Gate

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
