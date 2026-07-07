# multi-app-exp5 — Project Documentation

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

Here's where this landed: Codex laid out the full contract (requirements, non-goals, production-ready definition, decision rules) straight from the prompt, and I spent round 1 stress-testing it — mostly poking at places where "production-ready" and "months of small-team work" could quietly get watered down, or where compliance could be claimed without being real. Codex's contract already had the bones (priority order: prompt → design → depth → logistics; smaller-finished-over-larger-partial; design distinctiveness as tiebreaker), and my additions sharpen the operational edges rather than fight it: a concrete, checkable definition of "production-ready" (builds clean, runs on simulator, every reachable screen has real empty/loading/error/success states, no crash paths) instead of an open-ended "team-months" bar; an honest limit on what "uniqueness" can actually mean (checked against the named exclusion list + cross-comparison between the 3 apps, not the live App Store); a rule that design tokens must be visibly wired into the actual Swift view code, not just documented; a hard floor that local persistence and at least one real background/algorithmic capability can't be stubbed with a comment; and monetization/Jira/Notion treated as documented hooks and specs, not live integrations, until the user picks a favorite. None of that contradicts Codex's framing — it's the same contract with the fuzzy parts made testable. Gemini didn't weigh in (CLI unavailable). No open disagreement between the two of us.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (both speakers quoted it in full) — build 3 separate, production-ready iOS apps in their own folders under `/Users/pchordia/Documents/iOS-App-Factory`, design/UI-UX as the top priority (generic = failure), complexity/depth as second priority (trivial = failure), from a funnel of 8+ candidate ideas down to 3, each app unique from the other two and from all named prior apps, local-first with cloud-ready architecture, with a real monetization hook and viral potential, built through parallel per-app discussion/design/architecture/build phases with saved transcripts.

**Hard requirements:**
- 3 separate folders, one app each, under `/Users/pchordia/Documents/iOS-App-Factory` — never bundled.
- Funnel: ≥8 candidate ideas → depth/design-weighted scoring → 3 selected → full per-app product direction, design direction, architecture, implementation plan, build.
- Each app: documented design system (color, type scale, spacing, iconography, motion) actually wired into the Swift view code — not just a doc.
- Each app: real domain data model with relationships, non-trivial business logic, local persistence (SwiftData/Core Data), a real background task or on-device algorithm as the "genuinely hard technical capability," and a local-first sync-later architecture (real outbox/queue, not a TODO comment).
- Every reachable screen: empty, loading, error, success states; dark mode; Dynamic Type; VoiceOver labels; 44pt targets; WCAG AA contrast.
- The 3 apps must be unmistakably different in domain, interaction model, visual language, and IA from each other and from the named prior-app list.
- All phase discussions and decisions saved; combined per-app transcript exported as .txt at the end.

**Non-goals:**
- No real backend/cloud service — cloud support is architected-for, not built.
- No real App Store submission, signing, or TestFlight distribution.
- No live StoreKit product IDs, no real Jira/Notion API calls during the build — monetization is a documented paywall/pricing strategy with a UI gate; Jira/Notion structures are only generated as artifacts after the user picks a favorite post-build.
- No claim of verified market uniqueness beyond the named exclusion list — uniqueness is checked against that list plus cross-comparison among the 3 chosen apps, and that limit is stated in the final output.
- AR/ML/LLM are opt-in bonuses only where genuinely useful, never mandatory quota-fillers.
- No third-party dependencies unless they materially reduce risk.

**Production-ready definition (operational, applies identically to all 3 apps):** builds clean in Xcode with zero errors, runs on simulator, every reachable screen has real (not placeholder) empty/loading/error/success handling, no crash-on-launch or crash-on-empty-data paths, local persistence and migration-ready models are real, accessibility and privacy baseline is met, and settings/onboarding/error-recovery exist. Excludes: unfinished screens, mock data as the only source of truth, UI stubs, or "feature-complete parity with a 3-month team product."

**Decision rules for later phases:**
1. Priority order when conflicts arise: preserve the original prompt as written → design/UX quality → depth/complexity → build logistics. Never lower the design bar to hit scope — narrow scope instead.
2. Prefer a smaller fully-finished app over a larger half-built one.
3. A concept is disqualified if it lacks a hard technical capability beyond CRUD, weakens domain distinctiveness from the other 2, or has no explicit premium conversion mechanism.
4. Tie-breaker between equally strong candidates: design distinctiveness wins.
5. "Looks generic" and "trivial/toy" are both explicit failure conditions, checkable at review time — a feature-rich app with default SwiftUI styling fails design; a beautiful single-screen toy fails depth. Both must be caught before declaring any app done.
6. Review phase must spot-check actual view code against the documented design tokens for a sample of screens — a token doc the code doesn't reference is a failure, not a partial pass.
7. The same operational bar (production-readiness, uniqueness-check method, token audit, persistence/background-work floor) applies identically across all 3 apps — no app gets a bespoke standard.

## Product Research

Both Codex and I converged on the same core picture, even though we came at it from different angles. Here's the honest summary:

**Where we agree:** The real audience isn't a market category — it's the prosumer, design-literate iPhone owner who already pays for apps like Things 3, Fantastical, Flighty, Day One, Streaks, Craft, Carrot Weather. That's a narrow, craft-sensitive, subscription-tolerant buyer, not a mass audience. We both landed on the same platform playbook for hitting "local-first + genuinely hard capability" honestly: on-device intelligence (Vision/NaturalLanguage/CoreML), BGTask for real background work, widgets/Live Activities/App Intents for native-feeling surface area, and CloudKit as the natural "add cloud later" path rather than inventing a custom sync backend. We also both flagged the same failure trap from the prompt: it's easy to build something feature-rich that still reads as generic CRUD with rounded corners, so the domain's own structure has to be the source of both the visual identity and the hard technical capability — not two things bolted on separately. And we both explicitly named the same limitation: uniqueness can only be checked against the named exclusion list plus cross-comparison between our own 3 picks, not the live App Store.

**Where there's a real (if minor) tension still open:** Codex framed the three apps as three cognitive modes — organize, reason, collaborate. I pushed a caution that "organize" and "collaborate" are exactly the shape of the domains most likely to drift into the excluded list's territory (task managers, calendars, shared trackers) even without a name collision, so the ideation phase needs to pick specific concepts that satisfy Codex's cognitive-mode framing without defaulting into those familiar shapes. I also raised that "viral" and "rewards long-term daily use" pull toward different audiences, and no single app should be forced to be great at both — that's a framing point for ideation to apply per-concept, not something that needed to be resolved here.

Neither of these is a disagreement about facts — they're both open questions that the next phase (ideation) needs to actively steer around, not something this research phase itself needs to settle.

CONSENSUS: YES

## Final Output

**Audience and use context:** Prosumer, design-literate iPhone power users who already pay for polished subscription apps (Things 3, Fantastical, Flighty, Day One, Streaks, Craft, Carrot Weather–type buyers). Mostly US/EU, iPhone-first but should stay iPad-friendly without special-casing. High tolerance for setup complexity if the payoff is clearly crafted. Note the internal tension: "viral potential" favors a mechanic a stranger gets in 10 seconds; "rewards long-term daily use" favors a tool that proves itself after a week. Each of the 3 apps can lean toward one or the other — none should be forced to be equally both.

**Comparable apps/patterns to learn from (as a craft bar, not a domain to copy):** Fantastical (dense-but-legible IA, natural-language parsing), Flighty (Live Activities, real-time state), Copilot Money/MoneyCoach (relational complexity hiding inside a "simple" domain), Streaks/Structured (scheduling logic), Day One (rich content + search + confident visual voice), Carrot Weather (opinionated personality carrying an entire visual identity), Halide/Obscura (power-user depth inside an apparently single-purpose tool). Lesson: the distinctive visual identity and the "hard capability" should both emerge from the domain's own internal structure, not be applied afterward.

**Platform-specific opportunities:** Widgets (Home/Lock Screen), Live Activities for real-time/countdown state, App Intents for Siri/Shortcuts/Spotlight, BGAppRefreshTask/BGProcessingTask for real (not commented-out) background work, on-device Vision/NaturalLanguage/CoreML/Accelerate for the required hard technical capability (keeps it local-first honestly), CloudKit as the natural future cloud-sync path. Haptics, swipe/long-press/drag affordances, large touch targets, Dynamic Type, reduce-motion, and accessibility labels are baseline native-feel requirements, not stretch goals. HealthKit/EventKit/Watch companions are optional per-app stretch, not baseline — avoid scope creep that steals time from design polish.

**Major assumptions and risks:**
1. Uniqueness can only be verified against the named exclusion list plus cross-comparison among our own 3 apps — no live App Store check is possible, and that limit is stated rather than hidden (already fixed in the prompt contract).
2. Empty/loading/error states are the most likely place depth silently breaks down once a feature path grows past the happy path.
3. Local-first durability (real persistence, real background tasks, real outbox/sync) is easy to fake on paper and hard to execute — must be committed to in architecture, not deferred.
4. "Viral potential" can't actually be engineered or verified by this pipeline — the honest move is building in shareability affordances (exportable images, streaks, referral-shaped mechanics), not claiming virality as a guaranteed outcome.
5. The single hard technical capability per app must be deliberately small enough to actually ship (e.g., a real constraint scheduler, a spaced-repetition model, on-device classification) rather than research-grade scope that eats the whole build.
6. Default "safe" domain instincts (habit trackers, journals, calendars, finance trackers) are the most likely to collide in spirit with the exclusion list even without a name match — ideation should actively steer away from them.
7. Running 3 apps in parallel risks uneven design/polish investment across them — worth a rough effort-balance commitment rather than discovering an imbalance at review.

**Implications for the first build:** Score candidate ideas first on interaction originality and state clarity, not feature count. Favor domains with data models that have real intrinsic relationships (so depth isn't forced), a hard capability that's deterministic and on-device (so it's both finishable and genuinely local-first), and a subject that suggests its own visual language rather than needing one applied after the fact. Aim for three genuinely different cognitive/interaction modes across the trio (e.g., organize, reason, collaborate) while picking specific concepts that avoid the familiar domain shapes already in the exclusion list.

## Portfolio Selection

Four rounds in, and this has actually been a genuinely productive fight rather than a stall — real ground got covered. Brinekeeper and QuietPilot were locked back in round 2 and nobody's touched them since. The whole debate has been about the third seat, and it's been a legitimate disagreement, not people talking past each other: Codex fixed the real overclaiming problem with Casekeeper's "tamper-evident" language (that objection is genuinely resolved, not just argued down), and in this round Codex explicitly acknowledged the design-tonality tension is real rather than dodging it — committing to a "restrained but premium" interaction model as Casekeeper's answer to the delight requirement. Claude's read is that "restrained and premium" is good enterprise-software copy, but it's still a different emotional target than what the prompt demands in capital letters, and that the domain itself (forensic/compliance tooling for auditors) fights the "delightful, joyful, Apple Design Award" register in a way climbing/motion/chalk just doesn't.

Neither side fully converted the other — Codex still thinks Casekeeper is the better bet on execution risk and hasn't withdrawn that pick, and Claude locked Chalkline by invoking the tiebreaker rule this group itself wrote into the prompt contract back in phase one (design distinctiveness wins between two otherwise-strong candidates), rather than getting a verbal concession out of Codex. That's a legitimate way to close this out: the two sides agree on the underlying facts (Casekeeper is lower implementation risk; Chalkline is more design-differentiated and more on-brief for a design-first prompt), they just weigh those facts differently, and the group already pre-committed to how ties like this get broken before this argument ever started. Re-running the same two arguments a fifth time isn't going to produce new information.

CONSENSUS: YES

## Final Output

The final portfolio is **Brinekeeper**, **QuietPilot**, and **Chalkline** — all three with `build: true`.

- **Brinekeeper** (reef aquarium chemistry & livestock management) — a deterministic dosing solver plus a bioload/aggression/allelopathy compatibility graph, bioluminescent glass-morphism visual language. Locked since round 2, no dissent.
- **QuietPilot** (acoustic-aware focus scheduling) — on-device spectral clustering that builds per-room noise profiles and negotiates daily focus blocks against the calendar (reframed from a one-shot decibel meter into a compounding daily tool), muted steel-and-aurora visual language. Locked since round 2, no dissent.
- **Chalkline** (climbing technique app with on-device Vision pose estimation) — takes the third seat over Casekeeper by direct application of the prompt contract's own tie-breaker rule (design distinctiveness wins between equally strong candidates), since the prompt ranks design above depth/execution-risk when the two are in tension, and a forensic/compliance case-management tool was judged unlikely to hit the "delightful, Apple Design Award caliber" bar the domain itself resists. Bold gym-signage visual language with chalk-dust texture and haptic-tied transitions.

**Casekeeper** is not being built this round but is retained as the documented fallback: if Chalkline's on-device pose-estimation capability genuinely fails to produce a stable, explainable signal during the build phase (per its own written invalidation criteria — narrow to movement-trace-only, drop the numeric efficiency score), Casekeeper is the strongest bench alternative, with its "tamper-evident" language already corrected to "integrity-checked/auditable local ledger" so it doesn't overclaim if it's ever picked up later.

Rejected earlier in the funnel for competitive crowding or weak differentiation: Leafline (too close to existing plant-care apps like Planta/Vera/Greg), Ledgerstone (too close to existing TTRPG world-graph tools like World Anvil/LegendKeeper/Kanka), plus the nine other round-1 candidates from both speakers (Pantry Pulse, Trip Memory, Habit Orbit, Time Ledger, Meal Loop, Home Journal, Simple Tasks, Mood Dock, Event Stack, wine-cellar app, fishing log, tabletop-wargaming builder, stage-lighting/DMX tool, ham-radio app, film-photography darkroom companion).

Portfolio manifest (final):

```portfolio-json
{"apps":[
{"name":"Brinekeeper","slug":"brinekeeper","category":"Reef aquarium chemistry & livestock management","one_sentence_promise":"Turns a water test into an exact dosing plan and warns you before a new fish or coral wrecks your tank.","target_user":"Serious saltwater reef aquarium hobbyists who test water parameters weekly and actively manage coral/fish stocking.","painful_moment":"After a water test you have raw numbers (Ca, Mg, Alk, NO3, PO4) but have to hand-calculate reef chemistry to know exactly how much of which product to dose without overshooting and crashing the tank, and you're guessing whether a new species will fight or chemically poison something already in there.","why_different":"A real deterministic dosing-optimization solver (tank volume + current + target parameters + product concentration → exact dose) and a livestock compatibility graph that reasons about bioload, aggression, and allelopathy instead of a static compatibility list; bioluminescent glass-morphism visual language with glowing coral-accent gradients, distinct from any tracker template and from existing single-purpose dosing calculators.","why_users_pay":"Reef hobbyists already spend heavily on test kits and equipment; subscription unlocks multi-tank management, parameter-trend analytics over time, and unlimited livestock graph size.","subscription_model":"Free tier: one tank, basic dosing calculator, manual logging. Paid: multi-tank support, trend analytics, unlimited livestock compatibility graph, data export.","local_first_mvp_scope":"SwiftData models for tanks, water tests, dosing products, livestock, and compatibility rules; dosing solver and compatibility engine run fully on-device; local notification/BGTask reminders for test/dose schedule.","future_backend_roadmap":"CloudKit sync across a hobbyist's devices; optional shared tank profiles for clubs — no rewrite required since the solver and data model stay local-first.","core_workflows":["Log a water test","Get a computed dosing recommendation","Track parameter trends over time","Build a livestock roster","Get compatibility warnings before adding a new species","Maintenance/testing schedule reminders"],"ios_native_features":["Home screen widget: days since last test / next dose due","BGTaskScheduler for test and dosing reminders","Live Activity for an in-progress dosing session","Optional Vision-based test-strip color reading as a stretch capability"],"ar_ml_llm_fit":"On-device Vision for optional test-strip colorimetric reading; no LLM use — chemistry and compatibility logic must stay deterministic and auditable.","design_direction":"Bioluminescent depths: near-black abyssal backgrounds, glowing coral-reef accent gradients (teal/violet/coral), glass-morphism data cards, luminous line graphs for parameter trends.","claude_design_prompt":"Design a reef-aquarium chemistry app called Brinekeeper with a bioluminescent deep-water visual identity: near-black backgrounds, glowing coral/teal/violet accent gradients, glass-morphism cards for water-test data, and luminous animated trend graphs. It must feel like a precision scientific instrument, not a generic tracker.","app_store_positioning":"The reef tank app that does the chemistry math for you and stops you from an incompatible-livestock mistake before you make it.","key_risks":["Dosing math must be genuinely correct — a wrong solver output has real financial/livestock consequences, so it needs conservative, explainable output, not a black box","Compatibility rules graph could feel thin if not seeded with enough real species data","Niche audience size caps ceiling relative to a mass-market pick"],"invalidation_criteria":"If the dosing solver can't be made deterministic and explainable without external chemistry APIs, or if the compatibility graph can't be seeded with enough real relational data to feel non-trivial, cut back to a single-tank calculator and drop the compatibility graph rather than fake either.","v1_build_scope":"Single and multi-tank dosing solver, water-test logging with trend charts, livestock roster with compatibility warnings, local reminders — no photo/Vision test-strip reading in v1.","build":true,"build_priority":1},
{"name":"QuietPilot","slug":"quietpilot","category":"Acoustic-aware focus scheduling","one_sentence_promise":"Learns how your real environments actually sound and negotiates your daily focus blocks around them instead of just measuring decibels once.","target_user":"Remote workers, students, and podcasters in shared or noise-variable spaces (open-plan homes, shared offices, apartments) who need predictable deep-work time.","painful_moment":"Noise and interruptions wreck long focus sessions, and there's no way to know in advance which hours in which room are actually going to be quiet enough — so people either guess, or get burned mid-session by the espresso machine or a neighbor's call.","why_different":"Not a one-shot decibel meter: on-device spectral analysis and local pattern clustering build a per-room acoustic profile over repeated short sessions, and the app's daily verb is a scheduling negotiation — it proposes and defends focus blocks against your calendar using what it's learned about when a room is actually quiet, so the value compounds with use instead of being a single diagnostic you run once and forget.","why_users_pay":"Saves real deep-work hours and reduces interruption-recovery cost; subscription unlocks unlimited room profiles, calendar-aware scheduling intelligence, and multi-person/team readiness views for shared spaces.","subscription_model":"Free tier: one room profile, manual session logging, basic score. Paid: unlimited room profiles, calendar-integrated scheduling recommendations, team/shared-space readiness analytics, historical trend export.","local_first_mvp_scope":"SwiftData models for rooms, sessions, detected noise-pattern clusters, and calendar-linked focus blocks; spectral feature extraction and clustering run fully on-device against locally captured short audio sessions, discarding raw audio after feature extraction.","future_backend_roadmap":"CloudKit sync across a person's devices; opt-in shared household/team room profiles; policy templates for shared offices — additive, no rewrite needed.","core_workflows":["Start/stop a short acoustic capture session with automatic metadata (time, room, activity type)","Build and refine a room's noise-pattern profile from repeated sessions","Get a room readiness score for a given time window","Get and negotiate a proposed focus-block schedule against the calendar","Review trends and compare before/after a room change (e.g., moved desks, added a rug)"],"ios_native_features":["BGAppRefreshTask for nightly profile recomputation","Home/Lock Screen widget for current room score and next proposed focus window","App Intents for starting/stopping a session from Shortcuts or Siri","Haptic feedback for threshold crossings","Local notifications for negotiated quiet windows"],"ar_ml_llm_fit":"On-device FFT-based spectral feature extraction plus local CoreML clustering for recurring noise-pattern detection — no cloud audio processing, no LLM required.","design_direction":"Muted steel-and-aurora palette, waveform-to-heatmap card transitions, strict micro-typography scale, calm spring motion — restrained rather than clinical.","claude_design_prompt":"Design an acoustic-focus scheduling app called QuietPilot with a muted steel-and-aurora visual identity: waveform imagery that resolves into calm heatmap cards, restrained motion, high legibility at a glance, and a tone that reads as a considerate daily planner rather than a surveillance meter.","app_store_positioning":"The focus app that learns how your spaces actually sound and negotiates your schedule around them, instead of a decibel meter you check once and forget.","key_risks":["Microphone capture needs an unmistakably explicit start/stop model or it reads as creepy always-listening surveillance","Repeat-use value depends on the scheduling-negotiation loop actually working, not just the initial room diagnostic — if that loop is weak the app becomes a one-time novelty","Environmental variability (a different noise source each day) can undercut confidence in the profile and needs honest uncertainty framing, not false precision"],"invalidation_criteria":"If the scheduling-negotiation loop can't be made genuinely useful against real calendars, narrow v1 to room-profile-and-score only and market it honestly as a diagnostic tool rather than a scheduler, rather than overclaiming a weak scheduling feature.","v1_build_scope":"Manual session capture, on-device spectral clustering for up to 3 room profiles, readiness scoring, one calendar-aware focus-block proposal flow, trend timeline, local export — no team/multi-person analytics in v1.","build":true,"build_priority":2},
{"name":"Chalkline","slug":"chalkline","category":"Climbing technique & route log with on-device movement analysis","one_sentence_promise":"Shows a climber exactly where their movement broke down on a route, not just what grade they sent.","target_user":"Boulderers and sport climbers who climb several times a week and want to improve technique, not just log send counts.","painful_moment":"A climber films an attempt on their phone but has no objective way to see where their center of mass drifted, where they over-gripped, or how this attempt compares to the last one — improvement is guesswork and the route log is just numbers.","why_different":"On-device Vision body-pose estimation over captured attempt video produces a movement trace and an efficiency score per attempt — a real, deterministic, camera-centric technical capability nobody else localizes in a climbing app; bold gym-signage graphic visual language with chalk-dust texture, route-color-coding, and haptic-tied transitions between attempts.","why_users_pay":"Subscription unlocks unlimited video-analysis history, side-by-side attempt comparison, and training-plan generation from logged technique weaknesses.","subscription_model":"Free tier: route/attempt logging, capped video-analysis history. Paid: unlimited analysis history, attempt-comparison view, generated training plans.","local_first_mvp_scope":"SwiftData models for gyms/routes/attempts/sessions with video references; Vision pose estimation samples each attempt clip at a fixed low frame rate (not full video framerate) and efficiency scoring runs fully on-device against locally stored video.","future_backend_roadmap":"CloudKit sync for cross-device attempt history; optional gym-community route-sharing later — additive on top of the local-first model.","core_workflows":["Log a route and attempt","Capture or import attempt video","View pose-trace overlay and efficiency score","Compare attempts side by side","Track session goals and streaks","Get a training-plan suggestion from logged weaknesses"],"ios_native_features":["Widget: session streak / next gym goal","Live Activity for timed attempts or rest intervals","App Intents for Siri (\"log a send\")","On-device Vision framework for pose estimation"],"ar_ml_llm_fit":"On-device Vision framework for body-pose estimation during attempt review, sampled at a fixed low frame rate per clip for reliability — the app's defining hard capability, not a bonus feature.","design_direction":"Bold gym-signage graphic design: chalk-dust textures, high-contrast route-color-coding, kinetic haptic-tied transitions between attempts, energetic but legible type scale.","claude_design_prompt":"Design a climbing technique app called Chalkline with a bold gym-signage graphic visual identity: chalk-dust textures, high-contrast route-color-coded UI, energetic display type, and kinetic transitions tied to haptics. It should feel like climbing-gym wayfinding brought to life, not a fitness-tracker template.","app_store_positioning":"The climbing app that shows you where your technique actually broke down, using pose analysis no other climbing log does on-device.","key_risks":["Pose estimation accuracy depends on video framing/lighting the user controls — mitigated with an in-app framing guide and a visible confidence indicator rather than presenting shaky data as certain","Efficiency scoring could feel like a gimmick if not clearly tied to actionable technique feedback","Clip storage needs a sane retention/compression default so it doesn't balloon like a general video library"],"invalidation_criteria":"If on-device pose estimation can't produce a stable, explainable efficiency signal from typical gym-lighting phone video even with the framing guide, narrow v1 to movement-trace visualization only and drop the numeric efficiency score rather than ship a misleading number — this is the documented fallback, not a hoped-for outcome.","v1_build_scope":"Route/attempt logging, video capture/import, low-frame-rate pose-trace overlay with efficiency score, basic attempt comparison; training-plan generation deferred as a fast-follow if time allows.","build":true,"build_priority":3}
]}
```

Each of the three gets its own folder under `/Users/pchordia/Documents/iOS-App-Factory` — no bundled monolith. Next phase (per-app design/architecture) proceeds independently and in parallel for Brinekeeper, QuietPilot, and Chalkline.

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

Good news — this one actually closed. After three rounds of back-and-forth, both sides landed on the same concrete answer, even though the trust question underneath it never fully resolved. Codex never did paste raw `ls`/`cat` output despite being asked twice, and instead in round 3 doubled down with more specific claims (down to what `find` allegedly returned for `.swift`/`.xcodeproj` files) — but notably, Codex's own conclusion moved toward caution rather than away from it: no Xcode projects, no Swift source, no combined transcript `.txt` bundles found, only spec/planning artifacts. Claude decided that chasing a fourth round of "trust me" wasn't going to produce anything better than what's already checkable, and proposed closing on the fallback framing — which Codex's own stated conclusion now matches almost word for word. So this converged on substance, not just fatigue.

CONSENSUS: YES

## Final Output

**Portfolio applicability:** This is a multi-app portfolio parent (`multi-app-exp5`), not a single-app run. Portfolio audit is fully applicable.

**Expected vs. actual app/project count:** 3 expected (per `portfolio_manifest.json`, all `build: true`), 3 accounted for as sibling folders/projects: `brinekeeper`, `quietpilot`, `chalkline`. No monolithic bundling, no silent collapse.

**Child folder/workflow check — PASS (shape/manifest level):** All three children carry `workflow.txt = app_build`, `portfolio_child.json` with `parent: "multi-app-exp5"`, `build: true`, and priorities 1/2/3, plus an `initial_prompt/initial_prompt.md` preserving the full parent prompt and contract. This is treated as verified based on what's transcript-checkable (the portfolio_selection final output all three agents could see) — Codex's specific claim to have independently confirmed this via direct filesystem access was never backed by raw output despite being asked twice, so it's accepted only insofar as it matches what the transcript already substantiates, not taken as independent proof.

**Category distinctness:** Confirmed — reef aquarium chemistry & livestock management, acoustic-aware focus scheduling, and climbing technique/pose analysis are three genuinely different domains, interaction models, and visual languages. No category was silently collapsed or merged.

**Rejection trail:** Clean and traceable — Leafline, Ledgerstone, Casekeeper (retained as documented fallback), and the other round-1 candidates are named as explicitly cut, not dropped without record.

**Named blocker (first-class, not a footnote):** On-disk existence of real per-app build content — Xcode projects, Swift source, design tokens actually wired into view code, saved phase transcripts, and the combined per-app `.txt` transcript export the original prompt explicitly required — is **unverified by this audit room**. Every agent's tool access (including the coordinator's) was sandboxed away from `/Users/pchordia/Documents/iOS-App-Factory`, and the one claim of direct filesystem verification was never accompanied by raw evidence. This must remain an open blocker until an actual build-verification phase for each child produces real, checkable output (compiler results, file listings, etc.) — it should not be read as confirmation that the three apps were actually built to production quality.

**Backfill readiness (Jira/Notion):** Not yet applicable — this only triggers post-build once a specific app is liked, and no evidence of a completed build exists yet.

VERIFICATION: UNVERIFIED
_(No structured verification result exists for this build.)_
