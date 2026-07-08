# multi-app-exp7 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round 3 catches one more real gap (the "better than competitors" clause is a different, external claim from internal uniqueness, and it wasn't captured anywhere) plus folds in the Quality Gate's round-2 fixes cleanly. The additions are all additive and nobody's contesting them — but per our own rule, I have to flag that Codex has now been silent three rounds running, so this is a single-voice consensus, not a cross-checked one, and I'm saying so explicitly rather than letting it pass as ordinary agreement.

CONSENSUS: YES *(single-participating-agent consensus — Codex has been unavailable for all three rounds of this phase; per this contract's own decision rule, that's noted here rather than treated as silently equivalent to cross-checked agreement. If Codex is silent again in ideation or build, that's the trigger for treating the orchestration itself as stalled.)*

## Final Output

**Original prompt:** preserved verbatim across all three rounds above — full, unedited request. Build 5 separate, production-ready, mass-market/viral iOS apps in parallel, each in its own folder under `/Users/pchordia/Documents/iOS-App-Factory`, distinct in design and concept from each other and from ~50+ prior apps in the workspace, with real depth, monetization, and local-first architecture.

**Hard requirements**
1. Exactly 5 apps, each a fully separate Xcode project in its own folder (never bundled).
2. Every app targets a broad mainstream audience — no niche/hobbyist/professional-vertical concepts. One-sentence pitch, 10-second demo test.
3. Every app has a genuine built-in viral loop (shareable result, streak, challenge, comparison) that's core to the interaction, not bolted on.
4. Distinctive, non-default visual identity per app — five clearly different design directions, each with its own documented design tokens/components/states that the built UI actually matches.
5. Apple-Design-Award-level polish: empty/loading/success/error states, transitions, haptics, spring animations, dark mode, Dynamic Type, VoiceOver, 44pt targets, WCAG AA contrast — on every reachable screen.
6. Real substance: interconnected features, a real domain data model, offline persistence with a clear seam for later sync, settings, import/export, at least one hard technical capability done well — but never at the cost of mass-market simplicity (mass-market wins that tradeoff).
7. Real monetization per app (subscription/IAP/premium) with actual StoreKit configuration and entitlement-gated logic — not a dead-end "Upgrade" button.
8. Local-first, with a repository/protocol-style boundary so cloud sync can be added later without a rewrite.
9. **Internal** uniqueness is a gate, not a vibe check: every concept checked against the other 4 in this batch AND against the full prior-apps list, by mechanic as well as by category.
10. Nothing is "done" unless a real, compiling Xcode project with full source exists in `app_build` — no exceptions for time pressure.
11. Each app's full phase-discussion transcript is combined into a single per-app `.txt` file at the end. This is a literal, checkable deliverable with the same weight as the buildable-Xcode-project requirement — "done" requires both.
12. The five app efforts run in parallel, with phases kept separate per app. "Parallel" means real concurrent dispatch across apps, not one app time-sliced after another dressed up as parallel. "Separate" means each app's phase discussion is self-contained and never silently imports a concept/name/conclusion from another app's thread — if that happens, it's a uniqueness-rule failure, caught immediately.
13. **Ideation must generate at least 10 candidate concepts before narrowing to 5.** The narrowing decision is judged primarily on mass-market/viral potential — per the stated priority order (viral/mass-market > design > depth > monetization) — not on novelty or technical interest alone.
14. **Each app needs an explicit external "beats the competitor" answer, separate from internal uniqueness.** One concrete sentence per app naming the realistic existing App Store incumbent in its category and the specific mechanism that's better (faster core loop, sharper viral hook, less friction, etc.). Passing the internal-uniqueness gate (novel within this workspace) is not the same claim as "better than competitors in a meaningful way," and both must hold.

**Non-goals**
- No niche/professional-vertical apps, even if technically impressive.
- No bundling apps into one folder/project.
- No viral loop added after the fact instead of designed in.
- No open-ended "platform" apps that never reach a shippable v1.
- No deferring accessibility to "phase 2."
- No fake paywalls or non-functional monetization UI.
- No sacrificial fifth app — if time runs short, that's flagged to the user explicitly rather than shipping one app at a visibly lower bar.
- LLM/AR/ML integration is optional bonus, never required — include only if it's integral to the core loop, never bolted on to chase bonus points.

**Production-readiness definition**
An app is production-ready only when ALL of the following hold:
- It compiles and runs in Xcode/Simulator with no manual fixes.
- Every reachable screen has real empty/loading/success/error handling, not just the happy path.
- Data persists across a relaunch.
- There's no TODO-shaped hole in the core loop.
- Monetization, if claimed, is wired to real StoreKit config and gating logic.
- The cloud-later claim is backed by an actual persistence-layer seam, not just a design-doc assertion.
- Build verification and final review agree on what works and what's limited — disagreement means not done.
- The per-app transcript `.txt` exists and actually contains that app's full phase history.
- Each app has a stated, specific answer to "how does this beat its realistic competitor."

**Decision rules for later phases**
- If a feature threatens the one-sentence/10-second clarity bar, cut it or hide it behind progressive disclosure — mass-market clarity outranks technical depth whenever they conflict.
- If two candidate concepts in the batch of 5 rhyme in mechanic (not just differ in label), kill one at ideation, before build.
- If a later phase wants to loosen the "buildable Xcode project" bar for schedule reasons, that's a contract violation, not a judgment call — surface it to the user instead.
- Any conflict between this contract and a later phase's convenience gets resolved by naming the assumption out loud, not by silently redefining scope.
- Discussion phases should end as soon as genuine consensus is reached — don't manufacture extra rounds once agreement exists — but this never justifies skipping or thinning the build itself.
- If one participating agent (e.g. Codex) is silent/unavailable for a round, that is not consensus by default — either get a real second pass before declaring agreement, or the record must say explicitly "consensus declared with only one participating agent."
- A "stall" is defined concretely: an app's phase produces no forward progress (no new decision, no build-artifact change) across a full round for reasons other than genuine open debate. Recovery means restating the last known-good state and continuing — never silently restarting from scratch or dropping the app.
- "Report only important milestones" means: idea selection, first successful compile, first full state-coverage pass, monetization wired, final done declaration — not every intermediate design tweak.
- **Every later phase (ideation, design, build, final review) should end with a quick clause-by-clause pass against the original prompt text before declaring done** — not just a general risk/synthesis pass. This contract phase missed concrete prompt clauses twice in a row before catching them; later phases shouldn't rely solely on a gate to catch the same pattern.
- **If Codex is silent again in the ideation or build phases** (making it three-for-three or worse), that's the signal to treat the multi-agent orchestration itself as stalled, not just an individual app effort — escalate rather than quietly continuing on one voice indefinitely.

## Product Research

Round 2 actually delivered — a real, substantive research pass came through this time, even though Codex is still dark (that's four rounds running now with zero participation across two phases, which the contract already flagged as the trigger to call the orchestration single-voice). The pragmatist's analysis holds together and directly answers what this phase needs: it names concrete iOS-native opportunities (Share Sheet as the backend-free viral mechanic, WidgetKit and Live Activities as underused daily-touch/viral surfaces), calls out real comparable apps and what to borrow from each (BeReal, Duolingo, Spotify Wrapped, Locket, Rocket Money/Copilot, Pillow/Sleep Cycle), flags concrete scope risks (money/sleep categories pulling toward bank-linking or all-night sensor infra that's too big for a parallel five-app sprint), pushes back on chasing the LLM/AR/ML bonus for its own sake, and draws a clear implication for the first build: every app's v1 should be one tight core loop plus a share-card or widget moment, sized down given effectively-single-voice execution capacity. Nothing here is contested — there's no second voice to disagree, but the content itself is coherent and directly actionable by the next phase, which is what this phase is for.

CONSENSUS: YES *(single-participating-agent consensus — Codex has now been unavailable for four consecutive rounds across two phases. Per the prompt contract's own decision rule, this is the explicit trigger to treat the orchestration as running single-voice going forward, not a silent one-off. Flagging it here rather than letting it pass as normal.)*

## Final Output

**Audience and use context:** Broad, mainstream, non-technical users — the "parents, barista, college student" bar from the contract. These are everyday-life apps used in short daily bursts (checking a streak, logging a mood, snapping a photo, glancing at a widget), not power-user tools with deep settings menus. Real usage context is opportunistic and ambient — home screen glances, notification taps, a 10-second interaction between other things — not sit-down sessions.

**Comparable apps or patterns to learn from:**
- BeReal — simultaneous-capture social mechanic (networked, higher-cost pattern to avoid replicating directly in v1).
- Duolingo — streak mechanics and friend leaderboards; its shareable "streak saved" card is the more replicable piece.
- Spotify Wrapped / Co-Star — generate a good-looking local shareable artifact, let iMessage/Instagram carry the virality. This is the reference pattern for local-first viral loops.
- Locket — proof that a well-executed widget alone can carry a viral loop, no feed required.
- Rocket Money / Copilot / Monarch — money apps that live and die by bank-linking (Plaid); a cautionary example of scope, not a v1 blueprint.
- Pillow / Sleep Cycle — sleep apps leaning on HealthKit or overnight mic sensing; genuinely hard technical capability, but a battery/permissions risk if it's load-bearing for the core loop.

**Platform-specific opportunities:**
- Native Share Sheet + ShareLink for locally-generated shareable cards (streak cards, stat cards, comparison cards) — this is the recommended default viral mechanic for this batch since it requires no backend and survives even if the recipient hasn't installed the app.
- WidgetKit as a first-class daily-engagement and viral surface, not an afterthought — recommend at least two of the five apps treat a home-screen widget as core to the concept.
- Live Activities / Dynamic Island for any app with an active session (timer, fast, workout) — a stronger "look what my phone is doing" moment than an in-app screen.
- Vision framework (on-device, no network call) as an acceptable "hard technical capability," if genuinely integral to a concept's core loop — not Apple Intelligence/Foundation Models, which are gated to newer hardware and would undercut the mass-market bar.

**Major assumptions and risks:**
1. Viral loops that require a live backend (real-time friend graphs, server-mediated challenges) conflict with the local-first hard requirement and are too much infra to build well across five parallel apps — assume every viral loop in this batch reduces to "generate a local artifact, hand it to Share Sheet," and flag any candidate idea that can't clear that bar as higher-risk.
2. Money and sleep concepts (both explicitly in-scope per the prompt) pull hard toward integrations bigger than a v1 should carry — bank-linking for money, all-night sensing/HealthKit dependency for sleep. Assume v1 for either category works on manual entry / on-device sensing alone, with HealthKit as a read-only bonus at most, never a dependency.
3. The LLM/AR/ML bonus is a risk magnet, not a free win — cloud LLM calls break offline/local-first and add cost-per-request; on-device Foundation Models are hardware-gated and undercut mass-market reach. Assume this bonus stays unused unless one concept's core loop is genuinely dead without it.
4. Codex's four-round silence means real execution capacity is lower than the plan assumed. Assume smaller, tighter v1 scope per app (not a shrunk headcount of five) to keep "finished small" beating "half-built large."

**Implications for the first build:** Favor concepts whose viral hook is a locally-rendered shareable card or a widget, not a networked feature. If a money or sleep app makes the final 5, scope its v1 to manual/on-device data only. Skip the LLM/AR/ML bonus unless it's truly load-bearing for one concept. Each of the five apps should aim for one tight core loop plus one shareable/widget moment for v1, rather than a broad feature set — this is now a capacity constraint as well as a design preference, given the single-voice execution reality.

## Portfolio Selection

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Initial Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Per App Product Brief

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Next Steps Small

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Detailed Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## App Features

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.
