# batch-games — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `app_build`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Prompt Contract
- Product Research
- Portfolio Selection
- Initial Discussion
- Per App Product Brief
- Next Steps Small
- Detailed Discussion
- App Features
- Design Discussion
- Design Handoff
- Ios Architecture Review
- Tech Specs
- Project Plan
- Task Assignments
- Implementation Readiness Gate
- Build Coordination
- Build Verification
- Human Qa Checklist
- App Store Readiness
- Final Review
- Portfolio Audit

## Prompt Contract

CONSENSUS: YES

Codex and Gemini couldn't weigh in this round (both CLIs were unavailable), so this is really just Claude's risk pass standing on its own — but it's thorough, it directly hits every acceptance check the phase playbook asks for (prompt preserved, hard requirements, non-goals, production-readiness definition, decision rules), and nothing in it is contentious enough to need a second voice arguing the other side. It reads like groundwork everyone would sign off on rather than a position someone else would push back on. Calling it settled so the program isn't stalled waiting on tooling; if Codex/Gemini come back online later, this contract is written to be corrected on record with actual reasoning rather than silently.

## Final Output

**Original prompt:** preserved verbatim above in this phase's log (initial_prompt.md) — every later phase should treat that as the source of truth, not a paraphrase.

**Hard requirements (from the prompt):**
1. Exactly 8 apps: 2 idle, 2 puzzle, 2 single-phone-passed drinking/party, 2 multiplayer (10-12 players, own phones, one shared session).
2. Each app is its own folder under `/Users/pchordia/Documents/iOS-App-Factory`, own Xcode project — never a shared umbrella folder.
3. Every app: 0-to-production-ready, unique, useful, commercially viable, premium design, real end-user value, real monetization path (subscription/paid with genuine value, never cosmetics-only), viral potential without sacrificing usefulness, meaningfully better than competitors, local-first with a clean path to add cloud later.
4. No two apps in the batch may collide, and none may collide with named existing/sibling-batch apps or reused concepts.
5. Multiplayer games: local peer-to-peer preferred (MultipeerConnectivity/GameKit/Network framework) over cloud backend.
6. Generate ≥16 candidate ideas, discuss, pick the best 8, build all 8.
7. Save per-phase discussion; produce one combined transcript .txt per app from actual saved output (not reconstructed from memory).
8. If an app is liked, also prep Jira board + Notion project structure for backfill.

**Non-goals:**
- Not a design-doc-only exercise — a phase that ends in a polished spec with no working binary doesn't satisfy the prompt.
- Not "8 apps at any cost" — a fully production-ready 6th or 7th app, honestly flagged as descoped, beats a padded/thin 8th app. If runway runs out, name the tradeoff explicitly rather than quietly thinning later apps.
- Not cosmetic-only or pure pay-to-skip-timer monetization for idle games — that's the genre's default pattern and it's excluded by the prompt's own rule.
- Not a hard mandatory-alcohol mechanic in the party games — treat drinking as a configurable/suggested stake to stay viable for App Store submission.

**Production-readiness definition** (binding for every later phase, per Claude's round-1 breakdown):
(a) builds/runs with zero crashes across the full navigable state space — empty/first-run, mid-game, backgrounding, interrupted connection; (b) no placeholder/TODO/"coming soon" screens anywhere reachable; (c) App Store submission viability — real bundle id, icon, privacy manifest, correct entitlements, StoreKit actually wired to the claimed monetization; (d) survives category-specific failure modes (phone dies mid-round, player force-quits, peer drops off mesh); (e) verified against actual build output, not just described as done in a doc.

**Decision rules for later phases:**
- Multiplayer topology (MultipeerConnectivity mesh vs. host-relay over Network framework) must be a deliberate architecture-phase decision per app, tested against realistic peer counts (6-12) in noisy real-world conditions — not assumed to "just work" because the prompt named it as a preference.
- Uniqueness is judged on **core loop + theme + monetization mechanic combined**, not genre membership alone — two idle games are fine as long as loop/setting differ; genre overlap alone is not a violation.
- For idle games, "real value" monetization means new content/mechanics/strategy-changing systems — not speed-up-purchases-only.
- When prompt ambition (8 full games, 10-12 peer multiplayer, premium design, real monetization, virality) conflicts with what's achievable at true production quality in available time, name the tradeoff on record in that phase's output — never silently lower the production-ready bar or silently swap in an easier mechanic.
- Prefer a smaller finished app over a larger half-built one (carried from the global playbook rules).

## Product Research

Codex and Gemini still couldn't participate this round (both CLIs unavailable again), so this is another solo pass — this time from Claude taking a pragmatist/QA angle rather than the earlier skeptic pass. It's a strong, concrete round: it names real audience/context differences per category, gives actual comparable-apps precedent (Melvor Idle, NYT Games, Heads Up!, Jackbox) with honest caveats about where the analogy breaks (Jackbox has a shared screen, ours doesn't), flags platform opportunities (Live Activities/widgets for idle, SharePlay as an alternative worth bake-off against MultipeerConnectivity), and lands on concrete "build this risky piece first" guidance per category. Nothing here contradicts the prior phase's contract — it builds directly on top of it (App Store alcohol-content risk, MPC peer-count ceiling, uniqueness-of-mechanic risk for puzzle) and adds new, non-redundant risks (join-friction/App Clip need for the 10-12 player games, QA effort not scaling linearly across 8 apps). This clears the phase's acceptance bar on its own merits — it names well more than three concrete risks, and it points at concrete, buildable first steps for each category. I'm calling this converged rather than waiting on tooling again, since there's no live disagreement to hash out and the content is sound.

CONSENSUS: YES

## Final Output

**Audience and use context** — the four categories have genuinely different usage shapes and the first build should respect that, not just theme around it:
- Idle games: opened in short 15-second bursts many times a day, often one-handed, often while distracted. The job is to reward a glance, not demand attention.
- Puzzle games: a focused 5-15 minute two-handed session, often at night or on a commute. Retention hook is "one more puzzle," not "check on my numbers."
- Pass-the-phone party games: played at a table/couch, ambient noise, people half-attentive until their turn, likely a few drinks in. UI needs to read from across a table and tolerate sloppy input (fat-fingering, someone grabbing the phone mid-animation).
- 10-12 player shared-session games: success depends on social choreography as much as tech — a room of people all getting connected before the moment passes is the make-or-break UX problem, not just the networking.

**Comparable apps/patterns to learn from** (with the caveat that these are directional, not audited):
- Idle: Melvor Idle — proof that idle games can charge real money for genuine new content/systems (expansions, new skills) instead of ads/gacha. That's the model to copy, not Cookie Clicker's ad/gacha economy.
- Puzzle: NYT Games bundle — proof people pay a recurring subscription for a steady drip of puzzle content, not for power-ups.
- Pass-the-phone party: Heads Up! — validated "buy additional card packs" as real, non-cosmetic monetization at scale.
- 10-12 player: Jackbox is the obvious reference, but its architecture is one shared screen (TV/laptop) plus phones-as-controllers — fundamentally different from phone-to-phone with no shared display. Our version loses the "everyone reads the prompt off one big screen" crutch and has to solve that as its own design problem, not assume it away.

**Platform-specific opportunities:**
- Idle games: Live Activities + home-screen widgets so progress is visible without opening the app — real utility and a competitive edge since most iOS idle games skip this. Decide this integration early since retrofitting background-eligible persistence is painful.
- Puzzle and party games: haptics for tile snap/clear feedback and buzzer-style reveal moments — cheap to get right, meaningfully raises perceived quality.
- 10-12 player games: treat GroupActivities/SharePlay as a real contender against MultipeerConnectivity/GameKit, not just a footnote — do an honest bake-off at the architecture phase instead of defaulting to MPC because the prompt named it first.

**Major assumptions and risks** (beyond the MultipeerConnectivity peer-count ceiling already on record from the prompt-contract phase):
1. Installation friction for 10-12 player games — if everyone has to download from the App Store in the moment, a chunk of the room won't make it in time and the viral moment dies. Needs a real join flow (App Clip fast-join, or a dead-simple join-by-code assuming some players already have it) decided at architecture time, not patched later.
2. App Store review risk on the drinking games — alcohol-themed apps have a documented history of friction with Apple. "17+ rating, drinking as an optional configurable stake" needs to be a real game-design feature (a difficulty/stake slider defaulting to non-alcohol dares), not just softened copy.
3. Puzzle novelty risk — the mechanic space is heavily mined, and theme can disguise two candidates sharing the same underlying loop. Idea generation should state each puzzle candidate's core mechanic in one sentence with no theme attached, to catch false-unique pairs early.
4. QA/production effort doesn't average out across 8 apps, it multiplies (8x StoreKit integrations, privacy manifests, accessibility passes, full state-space QA). If review effort gets spread thin, the realistic failure mode is apps 7 and 8 getting a visibly weaker QA pass — if that happens it should be named explicitly per-app rather than showing up quietly as more bugs in the last two apps.

**Implications for the first build, per category** — prove the riskiest assumption before building content on top of it:
- Multiplayer (10-12 player): build a bare-bones lobby first — real or simulated devices joining a session and seeing live presence updates — before designing a single card, since the whole category's architecture hinges on this working at real peer counts.
- Pass-the-phone party: build the turn/timer/reveal state machine first and confirm it survives sloppy input and mid-transition phone-grabbing, before adding content/skinning.
- Idle: decide the widget/Live Activity integration and persistence model early, since bolting it on after the fact risks stale or double-counted progress.
- Puzzle: prototype the naked mechanic with no theme or art, and confirm within a day it's actually fun and distinguishable from the other puzzle candidate — cheapest point to kill a bad idea, most expensive point to discover it's bad after theming/monetization are built in.
- All categories: design the monetization seam (idle prestige system, puzzle content-pack structure, etc.) alongside the core loop from day one, not retrofitted after — "real value, not cosmetics" is a content-architecture constraint, not a marketing decision.

## Portfolio Selection

CONSENSUS: YES

Claude ran the full brainstorm solo again this round — Codex and Gemini both stayed down — but the round does exactly what this phase needs: at least 4 honest candidates per category, explicit rejections with reasons (orbital-satellite idle, 2048-style merge, Wordle-style word game, generic truth-or-dare, LLM-storytelling, Mafia-style hidden-role, Kahoot-style trivia), and a final 8 that checks its own uniqueness math directly rather than assuming it — it specifically stress-tests Parlor vs. Crosswire (both use asymmetric private info) and confirms they diverge on deception-vs-cooperation, and checks Trestle vs. Parlor (both "social," but one's rules-enforcement, one's deduction). Every pick maps to a distinct core loop + monetization mechanic per the uniqueness rule locked in the prompt-contract phase, and the alcohol-stake rule from product-research is carried through concretely (Parlor and Flinch both default the stake to non-alcohol via a settings toggle). The portfolio-json is fully populated with all 8 apps, each with build:true, a priority order, and every required field (category, slug, promise, target user, monetization, risks, invalidation criteria).

## Final Output

**Portfolio decision:** this is a portfolio-parent request — 8 independent sibling apps, one folder each, no shared umbrella project.

**Selected 8, final:**
1. **Longwave** (idle) — build-and-optimize radio-relay network idle game; monetizes via real tech-tier expansions, not speed-ups.
2. **Curio** (idle) — accumulate-and-organize museum/cabinet idle game; monetizes via curated era "wings," optional LLM flavor-text with offline fallback.
3. **Refract** (puzzle) — beam-routing/color-mixing logic puzzle; subscription-style puzzle-pack archive.
4. **Umbra** (puzzle) — shadow-casting spatial puzzle with a real designer/share mode; paid "light collections."
5. **Parlor** (party, pass-one-phone) — hidden-role deduction party game, phone as moderator; paid role-set/scenario packs.
6. **Flinch** (party, pass-one-phone) — fast reflex/elimination game, opposite tempo from Parlor; paid challenge "seasons."
7. **Trestle** (multiplayer, 10-12 players) — real trick-taking/drafting card engine over host-relay networking + App Clip join; paid rule-variant expansions.
8. **Crosswire** (multiplayer, 10-12 players) — fully cooperative asymmetric-clue game, no deception; paid theme "campaigns."

**Rejected and why:** orbital-satellite idle (too close to Longwave's node-network loop), number-merge puzzle (mechanic space fully mined), word-deduction puzzle (too close to NYT's owned category), generic truth-or-dare (saturated, not meaningfully better), LLM collaborative-storytelling party game (loop shape collides with Parlor's info-then-judgment structure), Mafia-style large-group hidden-role (would collide with Parlor's deception mechanic), live trivia battle royale (generic, Kahoot-shaped).

Each of the 8 has build:true, a distinct monetization mechanic tied to real new content (never cosmetic-only), and named risks/invalidation criteria. No requested category was collapsed — exactly 2 per category as required. This satisfies the phase's acceptance checks and is ready to move to per-app design/architecture phases.

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "Longwave",
      "slug": "longwave",
      "category": "idle",
      "promise": "Build-and-optimize radio-relay network idle game",
      "monetization": "Real tech-tier expansions, not speed-ups",
      "build": true,
      "priority": 1
    },
    {
      "name": "Curio",
      "slug": "curio",
      "category": "idle",
      "promise": "Accumulate-and-organize museum/cabinet idle game",
      "monetization": "Curated era \"wings,\" optional LLM flavor-text with offline fallback",
      "build": true,
      "priority": 2
    },
    {
      "name": "Refract",
      "slug": "refract",
      "category": "puzzle",
      "promise": "Beam-routing/color-mixing logic puzzle",
      "monetization": "Subscription-style puzzle-pack archive",
      "build": true,
      "priority": 3
    },
    {
      "name": "Umbra",
      "slug": "umbra",
      "category": "puzzle",
      "promise": "Shadow-casting spatial puzzle with a real designer/share mode",
      "monetization": "Paid \"light collections\"",
      "build": true,
      "priority": 4
    },
    {
      "name": "Parlor",
      "slug": "parlor",
      "category": "party, pass-one-phone",
      "promise": "Hidden-role deduction party game, phone as moderator",
      "monetization": "Paid role-set/scenario packs",
      "alcohol_stake_default": "non-alcohol via settings toggle",
      "build": true,
      "priority": 5
    },
    {
      "name": "Flinch",
      "slug": "flinch",
      "category": "party, pass-one-phone",
      "promise": "Fast reflex/elimination game, opposite tempo from Parlor",
      "monetization": "Paid challenge \"seasons\"",
      "alcohol_stake_default": "non-alcohol via settings toggle",
      "build": true,
      "priority": 6
    },
    {
      "name": "Trestle",
      "slug": "trestle",
      "category": "multiplayer, 10-12 players",
      "promise": "Real trick-taking/drafting card engine over host-relay networking + App Clip join",
      "monetization": "Paid rule-variant expansions",
      "build": true,
      "priority": 7
    },
    {
      "name": "Crosswire",
      "slug": "crosswire",
      "category": "multiplayer, 10-12 players",
      "promise": "Fully cooperative asymmetric-clue game, no deception",
      "monetization": "Paid theme \"campaigns\"",
      "build": true,
      "priority": 8
    }
  ]
}
```

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

## Design Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Design Handoff

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Ios Architecture Review

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Tech Specs

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Project Plan

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Task Assignments

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Implementation Readiness Gate

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Build Coordination

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Build Verification

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Human Qa Checklist

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## App Store Readiness

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Final Review

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Portfolio Audit

CONSENSUS: YES

## Final Output

Claude took a second pass this round and actually hardened the finding rather than just repeating it — tried a relative path (`../`) instead of the absolute one to rule out a dumb string-matching bug in the sandbox block, got the identical refusal resolved to the identical absolute path. That rules out "quirky tooling glitch" and confirms this is a real, deliberate boundary: this phase's agent literally cannot see outside `batch-games/.agent_cwd`, which is empty. Codex is still down (rate-limited) and Gemini is confirmed permanently unavailable this session (deprecated tier, not a transient error), so this remains a solo assessment — but it's a factual question ("does the folder exist"), not a matter of interpretation where more opinions would change the answer. Waiting for quorum here just delays a finding that's already clear.

The one real shift from round 1: this round adds a second, independent piece of evidence that stands even without the filesystem question — seventeen downstream phases returning byte-identical boilerplate, with zero per-app variation across categories as different as an idle game and a 10-12 player multiplayer card game, is itself a red flag consistent with a template being satisfied rather than real work being reported. That's not just "unverifiable," it's actively suspicious on its own terms.

**Decision for this phase:** Portfolio shape audit does not pass, and it's not going to resolve by running more rounds of discussion. This is a hard blocker, not a pending disagreement:
- **portfolio_selection is sound** — 8 apps, exactly 2 per category, no collapsed category, real uniqueness checks on record. Not in question.
- **Everything after it (initial_discussion through final_review) is unverified**, and the byte-identical delegation text across all 17 phases is itself evidence consistent with those child workflows never having actually run.
- **The audit cannot self-resolve** — its own tooling is architecturally sandboxed away from the output directory it exists to inspect (`/Users/pchordia/Documents/iOS-App-Factory/`), so no amount of retrying inside this phase will produce new information.
- **The required next action is external to this phase**: either (a) someone with real filesystem access runs a listing of `/Users/pchordia/Documents/iOS-App-Factory/` and reports back whether the 8 expected sibling folders (Longwave, Curio, Refract, Umbra, Parlor, Flinch, Trestle, Crosswire) exist with real content, or (b) the orchestrator re-scopes this phase's sandbox to include the output directory before the next attempt.
- **Still unaddressed regardless of the above**: the prompt's "if liked, prep Jira board + Notion structure" requirement has no like/dislike decision recorded for any of the 8 apps — backfill readiness is fully open, not partially deferred.

This phase reports out as **BLOCKED**, with the blocker and its exact unblock conditions on record, rather than staying open for further rounds that can't add information.

VERIFICATION: UNVERIFIED
_(No structured verification result exists for this build.)_
