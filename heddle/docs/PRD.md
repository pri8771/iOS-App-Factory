# heddle — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Since Codex didn't come online for this round, it's really just been one voice — Claude playing skeptic — laying out the contract. But it did the job thoroughly: preserved the prompt, and more importantly caught the one thing that could quietly wreck every later phase — this child spec says "MVP build" while the parent portfolio prompt it's wrapped in demands "production-ready," "deeply monetized," season-pass-grade puzzle games. Nobody had named that tension yet, and now there's a clear rule for it: MVP wins on scope/content volume, but not on design or monetization-architecture quality — build less, not worse.

The other big catch: there's no actual puzzle mechanic specified. Just a name that hints at weaving/thread, a category, and "not match-3." That's flagged as the highest-risk gap and gets a hard rule — the ideation phase has to lock one concrete, one-sentence mechanic (not match-3, not a reskinned sliding puzzle, not a generic swipe-clear grid) and nothing after that gets to re-litigate it.

"Warm and tactile" also got a real definition instead of being left as a vibe — analog material metaphors (thread/fabric/wood/paper), real haptics, a handmade-not-neon palette — since there's no design handoff doc to fall back on.

There's no disagreement on the table because there's only one perspective in the room so far, but the reasoning is sound, doesn't contradict the phase playbook, and hits all four required outputs. I'm treating this as settled rather than manufacturing a fight that doesn't exist.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim above — this is a child build thread under the multi-app-exp6 portfolio, app slug `heddle`, category `puzzle_game`, target user "casual puzzle player wanting something warm and tactile, not match-3," build mode explicitly `MVP build`, no design handoff prompt supplied. The full parent portfolio prompt (7-app program, design/complexity/monetization priorities, idle+puzzle special requirements, uniqueness rule, Jira/Notion backfill, output directory) is inherited context, not a literal instruction to this thread.

**Hard requirements for this thread:**
- Build Heddle only, as a real, runnable, local-first SwiftUI MVP — not a spec, not a design doc.
- Exactly one concrete, describable-in-one-sentence puzzle mechanic must be chosen in the next (ideation/mechanic) phase and then locked — no match-3, no sliding-tile reskin, no generic swipe-to-clear grid.
- Visual identity must read as "warm and tactile": analog/material metaphors (thread, fabric, wood, paper, fiber), tangible haptics on interactions, a handmade-feeling palette — not glass/neon/gem aesthetics.
- Full accessibility: VoiceOver labels on every interactive element, 44pt hit targets, Dynamic Type, dark mode, WCAG AA contrast.
- Working persistence that survives app relaunch.
- Every reachable screen has empty, loading, success, and error states.
- Monetization must be architecturally present (entitlement model, paywall points, stubbed IAP product identifiers) even though it isn't fully live.
- Local-first architecture that doesn't preclude adding sync later.

**Non-goals for this thread:**
- The other 6 apps in the parent portfolio, cross-app Jira/Notion backfill, and the combined-transcript rollup — all out of scope here.
- Live App Store Connect configuration, real payment processing, a full season-pass/battle-pass content pipeline, or large content volume (many levels) — deferred past MVP.
- Backend/cloud sync implementation itself — only the architecture must not block adding it later.

**Production-readiness definition:** Not "a spec that describes a good app" — an actual build a user can open, play the one locked mechanic in, quit, relaunch, and find their progress intact, with every reachable screen showing correct empty/loading/success/error states, full accessibility support, and visible (even if stubbed) paths to monetization. Content volume and live payments can be thin; correctness, polish, and completeness of what exists cannot.

**Decision rules for later phases:**
1. Where the child spec ("MVP") and the parent portfolio prompt (design/monetization bar) conflict, MVP wins on scope and content volume; design quality and monetization architecture still have to meet the parent prompt's bar.
2. Where the prompt is silent (the mechanic), the phase that resolves it must state its choice explicitly as a locked assumption — never leave it implicit for the build phase to guess.
3. Any conflict resolution must be written down as a named assumption, never silently resolved.
4. Nothing is "done" until there's a runnable build with the four states present on every reachable screen — matching the global rule that a smaller finished app beats a larger half-built one.

## Product Research

CONSENSUS: YES

## Final Output

Only one voice showed up this round (Codex stayed offline again), but Claude's pass covered everything the phase playbook asks for, so there's no real gap to negotiate — just a set of findings to hand off cleanly to the mechanic/ideation phase next.

**Audience and use context:** A casual player reaching for a few-minute, low-stakes session — waiting for coffee, in bed before sleep, decompressing — who already has Two Dots, Wordle, Sudoku.com, or Knotwords on their phone and wants something in that same calm, no-timer, no-lives register rather than a Candy Crush adrenaline loop. Labeled explicitly as an assumption: this skews toward people who like low-pressure daily-ritual puzzles, not toward hardcore puzzle veterans chasing escalating difficulty — that framing should shape what "replayable" means later, not a generic difficulty ramp.

**Comparable apps/patterns:** Two Dots (proof that handmade, seasonal-reskin visual identity works commercially in this genre), Knotwords (proof a thread/knot-adjacent mechanic can carry an entire game), Threes (proof one simple rule can sell as a one-time premium purchase), Monument Valley (proof "gorgeous and short" is a legitimate commercial shape, not just an art-game curiosity).

**Platform-specific opportunities:** Tactile feel is the whole design bet here, which means Core Haptics and spring-driven gesture feedback carry more weight than usual — and critically, haptics don't fire in Simulator at all, so "tactile" can't be verified or signed off on without a real-device pass. That's now a named build-verification requirement, not something to discover late.

**Major assumptions and risks (four, named explicitly):**
1. **Monetization/tone conflict:** the parent prompt's puzzle monetization playbook (levels as premium content, daily challenges, lives, season pass) is shaped for punishing-failure games. A "warm, gentle, not match-3" cozy puzzle shouldn't have lives or fail states — that would break the exact tone the brief asks for. This needs an explicit translation in the monetization phase: puzzle packs sold outright, cosmetic thread/loom skins, an optional daily-challenge streak that never blocks or resets progress — rather than energy timers or gated lives. If nobody makes that translation on purpose, we either get a cozy game with anxiety-inducing lives, or monetization with no real pressure point and weak revenue.
2. **Zero built-in player intuition:** nobody has innate priors for a heddle/thread-routing puzzle the way they do for color-matching or numbers, so the first 30 seconds have to teach it wordlessly — the first puzzle IS the tutorial, no instructions screen, or the casual audience this is aimed at bounces immediately.
3. **Haptics unverifiable in Simulator** — the single most important "feel" signal in the whole brief can silently go unchecked if the build is only ever run in Simulator.
4. **The "one genuinely hard technical capability" the parent prompt requires can't be a backend/server thing** since this is fully local with no accounts — it should be procedural, guaranteed-solvable puzzle generation, which usefully also solves the daily-challenge content problem without needing a hand-authored level pipeline for MVP.

**Implications for the first build:** whatever mechanic gets locked next phase should be one a generator can produce infinitely (not one requiring hand-authored levels), MVP failure state should stay gentle — no lives, no timers — with monetization shaped as unlock/cosmetic/pack-purchase rather than gated progression, haptics need a real-device check before any interaction is called done, and the first playable puzzle needs to double as the tutorial with zero explanatory text.

This clears the phase's acceptance bar — audience, comparables, platform opportunities, four named risks, and a concrete shippable-first-version direction are all on the table for the mechanic/ideation phase to build from without re-deriving any of it.

## Portfolio Selection

This is a single-app thread — no portfolio split needed. Let me record that clearly for this phase.

The discussion converged cleanly: this is Heddle only, one puzzle mechanic (not a bundle hedging across several), gentle-by-design (no lives/timers/fail states), with accessibility requiring a discrete non-drag interaction path alongside the tactile drag gesture. No real disagreement surfaced — just one voice (Claude) since Codex stayed in cooldown, but it covered the required outputs fully and didn't contradict the phase_rules or prior phase decisions.

CONSENSUS: YES

## Final Output

**Single-app vs portfolio-parent decision:** Single-app. This is a portfolio *child* thread (`PORTFOLIO_CHILD_PROJECT: true`, parent portfolio `multi-app-exp6`, already-selected slug `heddle`). The parent's "build 7 apps" language is inherited context describing the sibling program this thread lives inside — it is not an instruction for this thread to select or spawn additional apps. No portfolio-json manifest is produced here; that belongs to the parent orchestration, not this child thread.

**Selected app:**
| Field | Value |
|---|---|
| Category | puzzle_game |
| Slug | heddle |
| Promise | A warm, tactile, no-stakes weaving/thread puzzle for a 2–8 minute session — the physical satisfaction of untangling something with your hands, not a match-3 dopamine loop |
| Target user | Casual puzzle player, 30s–50s, non-hardcore-gamer, phone in bed/on the couch, wants zero friction in and zero anxiety about losing progress or a streak |
| Build flag | true |

**Selection rationale:** The app was already chosen upstream (slug `heddle`, category `puzzle_game` fixed by the parent selection process); this phase's job is to confirm scope, not re-select. Locked as **one mechanic, one app** — no hedging across multiple puzzle types (weaving vs. knots vs. something else) to see what lands. Depth comes from procedural generation and difficulty variation of a single locked mechanic (mechanic itself to be named next phase), not from breadth of mechanics. Monetization and fail-state design must translate the parent's "levels/lives/season pass" puzzle playbook into a punishment-free shape (packs, cosmetics, non-blocking streaks) — carried forward from product_research, reaffirmed here.

**Rejected alternative:** A "puzzle bundle" MVP offering 2-3 different mechanic types to hedge on which resonates. Rejected because it fragments limited MVP build effort across shallow implementations instead of one deep, replayable, accessible mechanic — directly against the global rule that a smaller finished app beats a larger half-built one.

**New constraint surfaced this phase (binding on the mechanic-choice phase):** Whatever mechanic gets locked must support a discrete, non-drag interaction path for VoiceOver/accessibility, not just a continuous-gesture path. A mechanic that's *only* playable via continuous drag would make full accessibility compliance (already a hard requirement) impossible to retrofit cleanly.

**Portfolio-json:** Not applicable — explicitly recorded as not needed since this is a single selected child app, not a portfolio parent.

## Initial Discussion

CONSENSUS: YES

## Final Output

**Product promise:** Heddle is a one-touch weaving puzzle where you trace a thread across a small loom to connect matching color ends — Flow Free's path-tracing logic wearing a loom's clothing, played for two to eight minutes at a time by someone who wants their hands occupied and their brain unbothered, not tested.

**Primary user and scenario:** A casual, non-hardcore player in their 30s–50s, phone in one hand, thumb doing the work, lying in bed or on the couch for a single puzzle or two between other things — a between-things app, not a session-length app. This drives a persistence requirement beyond "save completed puzzles": the live, in-progress thread state must survive a hard backgrounding or force-quit, not just resume at the puzzle list.

**Core loop (locked, not left for a later phase to guess):** Each puzzle is a small loom grid with colored thread ends seeded around the edges/interior. The player drags a continuous thread from one end to its match (or, for VoiceOver, taps origin then successive cells) until every cell is covered by exactly one thread with no crossings. Chosen because it's wordlessly learnable in one attempt, is provably generatable with guaranteed solvability (generate solution paths first, then strip to endpoints), and naturally supports both a continuous-gesture path and a discrete tap path — satisfying the accessibility constraint locked in the prior phase.

**Screen inventory (capped intentionally):** first-launch puzzle that IS the tutorial (no onboarding carousel); a hub screen ("today's puzzle" + past puzzles + stubbed shop); the puzzle screen with four real states (generating/loading, ready-to-play, solved/celebration, generation-failure-with-fallback); and a settings screen for accessibility/data controls. Nothing more for MVP — stats/cosmetics galleries wait.

**Hard scope boundaries:** No multiplayer, no leaderboards, no social sharing. No streak mechanic that can break or reset — only an optional streak that counts up, never guilts. A small curated set of hand-tunable difficulty tiers for MVP even though puzzle instances themselves are infinitely generated. No real payment processing — entitlement flags and paywall UI only. Grid/puzzle complexity is capped to whatever fits comfortably at a 44pt minimum hit target on the smallest supported device — visual density loses to accessibility, not the other way around.

**Measurable success criteria:** first-time user reaches a solved first puzzle within 60 seconds with zero text read; force-quit mid-puzzle and relaunch restores the exact thread state, not just the puzzle list; the entire core loop (select, trace, solve, advance) is completable via VoiceOver using only discrete taps, no drag required; all four puzzle-screen states (and equivalents on hub/settings) show correct real content, not placeholders; haptic feedback is verified on a physical device before any interaction is called done. Missing any one of these means the build isn't finished, regardless of visual polish.

No disagreement to resolve — only one voice was in the room this round (Codex stayed in cooldown), but it delivered all three required acceptance checks concretely and didn't contradict any decision locked in prompt_contract, product_research, or portfolio_selection.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Same pattern as every phase so far — Codex stayed in cooldown, so it's a single voice, but that voice actually closed every open thread the phase needed closed rather than leaving things fuzzy for the build phase to guess at.

**Target user and use case:** Reconfirmed, not reopened — casual, non-hardcore puzzle player, 30s–50s, phone in bed or on the couch, 2–8 minute sessions, already has Wordle/Two Dots/Sudoku.com habits and wants one more calm daily ritual. The new angle added here: this is a user segment with proven willingness to pay for exactly this shape of product — habit-and-archive monetization (Wordle-adjacent), not pressure-based monetization (Candy Crush-adjacent).

**Core loop:** Open app → today's procedurally generated, guaranteed-solvable loom → drag or discrete-tap-chain colored threads to their matches → every cell covered, no crossings → haptic-and-visual settle. No fail state, ever, locked as non-negotiable — unlimited free undo plus a "loosen" action instead of lives or timers. Any later phase proposing a fail state or countdown timer is now explicitly a scope violation, not a design opinion up for debate.

**Paid value / subscription value:** Free tier gets one full-quality generated puzzle per day, a 7-day rolling archive, and one free hint per puzzle — genuinely good, not a stripped demo. Loom Pass ($4.99/mo or $29.99/year, priced under Calm/Headspace and near Two Dots' VIP tier) unlocks unlimited on-demand generation, the full permanent archive, unlimited hints/undo-assist, and — the functional core, not a cosmetic dressing — a custom generator panel where subscribers directly control grid size, palette, and difficulty. That last piece doubles as the "genuinely hard technical capability" the parent prompt wants, since it means the solvability guarantee has to hold across arbitrary parameter combinations. Cosmetic thread/loom skins ride along with the subscription; one-time curated puzzle packs (~30 puzzles, $2.99, no subscription needed) are a third, separate revenue path. No ads, nothing punitive.

**Competitive wedge:** Not the mechanic alone — the combination of infinite guaranteed-solvable generation (no hand-authored content bottleneck), genuinely non-punitive design (competitors all hide a fail state, lives, or energy timer somewhere), and real accessibility (Flow Free is drag-only; Heddle's discrete tap-chain path is a structural advantage competitors can't easily retrofit, not just a compliance checkbox).

**Growth angle:** One committed mechanic — a Wordle-style "share your loom" image (the solved thread pattern as small textile art, plus move count, no puzzle spoilers) — paired with a real, cheap niche-seeding channel: fiber arts/weaving communities (Ravelry, weaving/knitting social media) who already have affinity for the visual metaphor.

**Local-first / cloud-ready plan:** SwiftData for puzzle state (including live in-progress thread position), archive, entitlements, and generator seeds — every record gets stable UUID identity from day one specifically so CloudKit sync later doesn't force a schema migration. StoreKit 2 for entitlement/purchase flow with stubbed product identifiers. No backend, no accounts, no network calls required for MVP functionality.

**Named risk carried forward, not resolved here (correctly, since it's a build/copy concern, not a strategy one):** the free tier's "one puzzle per day" must be framed as a ritual (tomorrow's loom simply doesn't exist yet), never as a limit, lockout, or countdown — if later copy or UI implies scarcity-as-punishment, that's a bug against this phase's decision, not a valid interpretation of it.

This hits all six required outputs and both acceptance checks that matter most (subscription value is functional — a real feature, the generator panel — not just skins; and the brief is concrete enough to hand straight to design without more ideation).

## Next Steps Small

CONSENSUS: YES

## Final Output

Only Claude showed up this round (Codex still in cooldown), but the pass is decisive and doesn't leave anything for the build phase to guess at — it draws a tight, defensible line around what ships first.

**The bet this slice exists to test:** can a total stranger, handed the phone with zero explanation, trace their first thread, feel the pull-taut-and-settle moment, and want to do it again tomorrow? Everything else is secondary until that's proven.

**MVP slice:** One real puzzle generator (algorithmic, guaranteed-solvable — not hardcoded demo levels), one puzzle screen, a minimal hub, and a settings screen. Cold launch straight into a small generated loom — no splash, no permissions prompt, no "welcome" screen. Thumb on a thread within a second of opening the app.

**Must-have interactions (four, deliberately capped):** drag-to-trace a thread to its match; the discrete tap-chain equivalent for VoiceOver, built in from day one rather than retrofitted later; a visible, reachable undo (since "no fail state" is meaningless without a way to unwind a tangle); and the solve moment itself — haptic pulse plus visual settle/bloom — which gets disproportionate craft time because it's carrying most of the brand's "warm and tactile" promise.

**Cut list, argued for explicitly rather than just listed:** no live shop/entitlement gating (an inert "Loom Pass" button is enough to prove the paywall point architecturally); no custom generator panel (that's the subscription's whole value prop — a second-slice feature, not first); no real archive/history browsing; no share-image growth mechanic (great idea, but worthless without a validated core loop under it); no streak counter, even the gentle kind; no cosmetic skins at all. The one thing explicitly refused as a cut: faking the generator with a handful of hardcoded puzzles — that would quietly gut the one hard technical capability the whole app is supposed to prove, so it stays real even in a small slice.

**Validation criteria (five, all checkable, not vibes):** cold solve of puzzle one in under 60 seconds with zero reading; the identical puzzle solvable via VoiceOver using only discrete taps, no drag; force-quit-and-relaunch mid-puzzle restores exact thread state; the haptic solve moment judged "satisfying, not gimmicky" by a real person on a real device (Simulator doesn't count); and the generator run a few hundred times against its one or two locked difficulty settings never produces an unsolvable puzzle. All five have to hold before the next slice (shop, archive, streak, skins) gets built.

This satisfies both acceptance checks: it's buildable without further product debate (every inclusion and exclusion is argued, not left open), and it contains one complete, real user workflow (open → generate → trace → solve → settle) rather than a scattershot of half-features.

## Detailed Discussion

Codex stayed offline again, so this round is just Claude playing devil's advocate against its own prior phases — but it did real work: it stopped treating the mechanic as "locked" and started asking what a build actually needs, catching several load-bearing gaps nobody had pinned down (thread-overlap behavior, VoiceOver mid-chain cancellation, color-only identification, seed-vs-materialized persistence, mid-gesture interruption handling, corrupted-store fallback, Reduce Motion fallback for the solve moment, privacy stance, StoreKit stub safety, and turning the generator's solvability claim into an actual automated test rather than a one-time manual check). Nothing here contradicts earlier decisions — it's all filling in the cracks underneath them. Since there's no second voice to disagree, I'll treat this as settled: it's thorough, checkable, and doesn't leave the build phase guessing on anything load-bearing.

CONSENSUS: YES

## Final Output

**Resolved requirements (newly pinned down this phase):**
- **Thread-overlap rule:** dragging a new thread's path over a cell already occupied by a different color's placed thread causes that older thread to retract back to its endpoint. The gesture is never blocked and never crashes.
- **VoiceOver mid-chain cancellation:** the discrete tap-chain interaction must include an explicit "cancel current in-progress thread" action, separate from and cheaper than global undo. Relying on undo alone as the only recovery path for a wrong tap is an accessibility parity failure, not an acceptable substitute.
- **Colorblind-safe thread identity:** color is not the sole identity channel for thread ends — each color gets a distinct end-cap shape/texture as a secondary channel. This applies even though the app explicitly isn't "color-matching" as a genre; thread ends still use color for identity and need the same accommodation match-3 games do.
- **Persistence model:** the materialized puzzle (cell contents, endpoints, in-progress thread paths) is what gets persisted and restored — never a seed-plus-regenerate approach. Seeds are provenance metadata only; regenerating from a seed after a generator code change could silently produce a different board than what the user left, which would violate the "restore exact thread state" requirement already locked in `initial_discussion`.
- **Mid-gesture commit boundary:** only cell-boundary crossings count as committed state. Anything between commits (raw finger coordinates, in-flight touch position) is transient view state that's safe to lose. System interruptions (calls, notifications, multitasking gestures) mid-drag cleanly revert to the last committed cell rather than leaving an undefined half-drawn thread.
- **Reduce Motion fallback for the solve moment:** the bloom/settle animation degrades to a simpler cross-fade when Reduce Motion is on; the haptic pulse stays regardless, since haptic feedback isn't a motion concern.
- **Dynamic Type and the grid:** the puzzle grid itself is graphical and does not reflow with type scale; surrounding labels/instructional text must scale at the largest accessibility sizes without breaking 44pt targets or overlapping the board. Explicitly needs testing at largest accessibility size, not just "Large."
- **Privacy stance, stated sharply:** zero network calls of any kind in this build, no analytics SDK, no crash reporter beyond opt-in Apple-native tooling, no data ever leaves the device. This closes the gap the `prompt_contract` quality gate flagged (privacy named only by inference).
- **Corrupted/unreadable local store at launch:** defined fallback is start fresh with a calm, visible message — never a crash, never silent undetectable data loss.

**Edge cases (added to the register):**
- New thread dragged over an existing different-color thread mid-puzzle.
- VoiceOver user taps a wrong cell mid-chain and needs to back out without losing the whole session to undo.
- Colorblind user distinguishing thread ends without relying on hue.
- App force-quit or interrupted mid-drag, before a cell boundary is crossed vs. after.
- Generator algorithm changes between app versions while an old seed-based board is still "in progress" on a device (mitigated by never relying on seed replay for resume).
- SwiftData store unreadable at launch (disk pressure, bad migration, corruption).
- Reduce Motion and largest Dynamic Type accessibility sizes on the puzzle and solve-celebration screens specifically.

**Data and privacy implications:** All puzzle state, archive, entitlement flags, and generator seeds stay local via SwiftData (per `per_app_product_brief`); this phase adds the explicit rule that persisted board state must be the materialized puzzle, not a reconstructable seed, and reaffirms/hardens the privacy posture to an absolute zero-network, zero-analytics stance for this MVP build rather than a general "no backend" implication.

**Risk register (with concrete mitigations):**
1. **Stubbed StoreKit product identifiers accidentally shipping live** — mitigated by gating any StoreKit calls behind a debug/feature flag that defaults off, not by relying on someone remembering they're stubs.
2. **Generator solvability guarantee currently only "manually eyeballed"** — mitigated by converting it into an automated unit test that runs the generator across locked difficulty parameters a large N times and asserts solvability programmatically, so it's a permanent regression gate, not a one-time pass.
3. **Seed-based resume silently diverging from the board the user actually saw**, if generator code changes between versions — mitigated by persisting materialized board/thread state, never reconstructing from seed on resume (seed is provenance-only).
4. **VoiceOver users having a strictly worse error-recovery experience than sighted users** (only global undo, no cheap in-chain cancel) — mitigated by adding an explicit cancel-current-thread action to the discrete interaction model.
5. **Colorblind users unable to distinguish thread identity** — mitigated by a secondary non-color channel (end-cap shape/texture) on every thread.

**Final assumptions (explicit, not silent):**
- Data import/export and archive-browsing remain out of scope for this build, consistent with `next_steps_small`'s cut list — their absence here is a deliberate deferral, not an oversight, and doesn't contradict the parent prompt's depth requirement since it's satisfied in a later slice.
- "Undo" alone does not satisfy VoiceOver interaction-parity; a dedicated cancel-in-progress-thread action is required in addition.
- Persistence is materialized-state-based, not seed-based, as the permanent architectural choice — this is binding on the architecture phase, not a suggestion.

No open ambiguity remains that would block the design or architecture phase — every item above has either a resolved rule or a named mitigation, satisfying this phase's acceptance checks.

## App Features

Here's where this landed: with Codex still offline, it's another single-voice pass — but a decisive one. The QA/Risk voice took twelve phases of "we'll figure it out later" and actually pinned every must-have to a checkable acceptance criterion instead of a vibe, which is exactly what this phase needs to produce.

The one thing left genuinely open was a self-flagged tradeoff: should "today's puzzle" be calendar-date-deterministic (with all the midnight-rollover/timezone edge-case handling that implies), or just "whatever's current, next one generated only when this one's solved"? Since there's no live paywall gating anything yet, I'm resolving this one as coordinator rather than leaving it dangling: go with the simpler model for this slice. Calendar-day cadence is entitlement-adjacent logic — it doesn't earn its complexity until the paywall is real, and `next_steps_small` already set the precedent of deferring anything paywall-shaped to the next slice. Retrofitting date logic later is a smaller cost than carrying rollover/timezone edge cases through an MVP that has no gate for them to serve yet.

CONSENSUS: YES

## Final Output

**Must-have features (each with acceptance criteria):**

1. **Procedural puzzle generator** (solve-path-first, strip to endpoints, 1-2 locked difficulty tiers). *Acceptance:* automated test generates 500+ boards per tier, asserts programmatic solvability on every run, wired into the build so it re-runs on every generator change — not a one-time manual check.
2. **Drag-to-trace interaction** with thread-overlap retraction (dragging over a different-color placed thread retracts it to its endpoint, never blocks/crashes) and completion detection (all cells covered, no crossings, both ends matched). *Acceptance:* QA deliberately drags across several placed threads of different colors in sequence; each retracts cleanly, no crash, no orphaned partial state.
3. **VoiceOver discrete tap-chain path**, including the cancel-current-thread action (distinct from global undo) locked last phase. *Acceptance:* with VoiceOver on and drag ignored, a tester solves the same puzzle using only tap-origin/tap-successive-cell/cancel — zero drag required.
4. **Undo**, defined at thread granularity (each call removes the most recently completed thread, freeing its cells; "loosen" folds into repeatable undo rather than being a second mechanism). *Acceptance:* complete three threads, undo three times, board returns to exact pre-thread state verified cell-by-cell.
5. **Solve moment**: haptic pulse + visual bloom, degrading to cross-fade under Reduce Motion (haptic stays). *Acceptance:* manual sign-off on a physical device — Simulator cannot produce Core Haptics, so a Simulator-only build hasn't met this criterion.
6. **Four puzzle-screen states** — generating, ready, solved, generation-failure-with-fallback, where "fallback" is now concretely one bundled backup puzzle used only if the generator throws/times out. *Acceptance:* force the generator to throw via a debug hook; confirm the fallback loads, is fully playable/solvable, and no blank/spinner-forever state appears.
7. **Materialized-state persistence** across real force-quit (not backgrounding), including in-progress partial threads. *Acceptance:* place two threads, force-quit, relaunch, confirm both threads are exactly where they were, no regeneration.
8. **Current-puzzle model** (resolved this round): one persistent "current puzzle," next one generated only when the current is solved — no calendar-date logic, no rollover/timezone handling in this slice. Deferred until a live paywall gives that cadence a reason to exist.
9. **Minimal hub screen**: current-puzzle entry point, "a previous one exists" without a real archive browser, one inert Loom Pass button. *Acceptance:* tapping the inert button shows an acknowledgment (e.g., "coming soon" sheet), never a dead silent tap.
10. **Settings screen**: inherits Reduce Motion from system (no duplicate toggle), plus a data-reset action that doubles as the corrupted-store recovery path. *Acceptance:* triggering reset or hitting an actually-corrupted store at launch lands on a calm "starting fresh" message — never a crash, never a silent wipe.
11. **Colorblind-safe end-caps** (shape/texture per color, not hue alone) and the grid-vs-label Dynamic Type split (grid stays graphical/fixed, labels scale). *Acceptance:* tested at the largest accessibility Dynamic Type size specifically, labels scale without clipping, grid hit targets stay ≥44pt.
12. **Zero network/analytics**, verified by literally confirming no networking code path exists, not just "we didn't add any on purpose."

**Should/could (explicitly deferred, not forgotten):** the custom generator panel (the actual subscription value-prop), real archive/history browsing, a hint button, the share-image growth mechanic, any streak counter, cosmetic skins, and a live StoreKit purchase flow behind the inert button.

**Won't-build:** multiplayer, leaderboards, social sharing beyond the deferred share-image idea, any fail state/lives/countdown timer, real payment processing, data import/export, push notifications, onboarding carousel or welcome screen, and actual cloud-sync implementation (architecture just can't preclude it later).

This satisfies both acceptance checks: every must-have traces directly back to the locked product promise (tactile thread-tracing, gentle/no-fail-state, real accessibility, real generation), and the list is scoped tightly enough — twelve items, each with a concrete pass/fail test — that a build phase can complete it without further product debate.
