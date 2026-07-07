# batch-cat-b1 — Project Documentation

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

Since Codex and Gemini are both unavailable this round, this was effectively a solo pass — there's no second voice to reconcile against, so I'll treat my own round-1 analysis as the working conclusion rather than waiting on participants who aren't there. Nothing in it is contested, and further rounds won't manufacture disagreement that doesn't exist. Here's where things land.

The core tension in this prompt is that "production-ready" and "0 to production-ready" can't literally mean shipped-to-the-App-Store in a headless build environment — no device, no App Store Connect, no code signing team, no live GPS/HealthKit/AR sessions. Rather than quietly lowering the bar, the contract should say explicitly what "production-ready" means here: complete, buildable Xcode projects, zero placeholder screens, full state coverage (empty/loading/success/error) everywhere reachable, local persistence, accessibility, unit/UI tests on core flows, and a real monetization + cloud-extension architecture — verified by simulator build and automated checks, with actual App Store submission and on-device hardware testing named as an explicit, reported limitation, not hidden.

Medical apps are the highest-risk category: "wellness insights and validated risk scores, never diagnosis" is a legal constraint, not a style preference, so it needs to be enforced as a hard gate in ideation (reject/rescope any concept that drifts toward diagnostic language) and again at the UI-copy level, and any named scoring system (QRISK3, FINDRISC-style) must use the actual published formula correctly.

Navigation apps need an explicit definition of what "works" means without live GPS in hand — simulated location, graceful no-permission degradation, offline behavior — decided now, not improvised at build time.

Uniqueness-checking against sibling batch folders is a real filesystem check, not a vibe check, and needs a fallback rule for what happens if those folders are missing or unreadable (flag and proceed with best-effort vs. hard block) — leaning flag-and-proceed since blocking the whole batch on missing sibling context is disproportionate.

For the parallel multi-app structure, a single weak or stalled app track should never hold up the other eight — isolate failures per app, report them as milestones, keep going.

And "if an app is liked, prepare Jira/Notion structures" implies a human checkpoint that doesn't otherwise exist in the pipeline — the contract should say that step only fires on explicit user signal after the build/review phase, not automatically.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above in this phase's record (initial_prompt.md / the "ORIGINAL PROMPT" block) — unmodified, to be carried forward as the reference for every later phase.

**Hard requirements:**
- Exactly 9 apps, exactly 3 per category (Health & Fitness, Medical, Navigation), each its own separate project folder under `/Users/pchordia/Documents/iOS-App-Factory`.
- Every app: unique within the batch, unique against the named prior apps (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, digital temple app, PO-automation tool), and unique against sibling batch folders in the workspace (checked at ideation time).
- Every app: full product direction, design direction, architecture, implementation plan, and build output — not a subset of features.
- Every app: premium SwiftUI design, real end-user value, a credible subscription/paid monetization path with genuine (non-cosmetic) value, competitive differentiation, local-first architecture with a clear seam for future cloud sync.
- Medical/Health apps: outputs framed strictly as wellness insights / validated risk scores (e.g., QRISK3, FINDRISC-style, used per their actual published methodology) — never diagnostic language, enforced in concept selection and in UI copy.
- LLM/AR/ML used only where integral and genuinely valuable — never bolted on for bonus points.
- Discussion/build run per-app in parallel tracks, each with its own saved transcript, combined into a final per-app `.txt` at the end.
- Jira board + Notion structure prepared only for apps the user explicitly flags as "liked," after review — not automatic.
- ≥18 candidate ideas generated and discussed before narrowing to the 9 built.

**Non-goals:**
- Not attempting actual App Store submission, code signing/provisioning for a real team, or on-device hardware validation (GPS/HealthKit/AR/camera) — these are out of scope and will be reported as known limitations, not silently skipped.
- Not building a shared/multi-app codebase or monorepo — one fully independent project per app.
- Not doing real legal/regulatory (e.g., FDA, HIPAA) sign-off for medical apps — framing rules substitute for compliance review.
- Not forcing LLM/AR/ML into every app.

**Production-readiness definition:** A complete, independently buildable Xcode/SwiftUI project with no placeholder screens; every reachable screen has empty/loading/success/error states; local persistence, accessibility labeling, and unit/UI tests on core flows are in place; monetization and cloud-extension points are architected, not just described; verified via simulator build and automated checks. Explicitly excludes real device testing and store submission, which are called out as limitations in the final report.

**Decision rules for later phases:**
1. If a concept trends toward diagnostic medical language, reject/rescope it in ideation — don't catch it at final review.
2. If sibling batch folders are missing/unreadable, flag it and proceed with best-effort uniqueness rather than blocking the whole program.
3. If one app's track stalls or produces a weak concept, isolate it, report as a milestone, and let the other 8 continue — never block the batch on one app.
4. Any place where scope is tempting to quietly shrink (e.g., "production-ready" drifting toward "prototype"), name the assumption explicitly in that phase's output instead of silently downgrading.
5. Jira/Notion prep triggers only on explicit user "liked" signal post-build, per app — not automatically for all 9.

## Product Research

Since Codex and Gemini didn't show up again, this round is really just the Pragmatist's read standing alone — but it's a strong, specific pass that names real crowded-out territory instead of hedging, and nothing in it is in tension with the prompt contract from the last phase. I don't think another round manufactures a second opinion out of nothing here, so I'm closing this out now rather than spinning for a round that would just restate the same points.

The shared take, in plain terms: the danger in this phase isn't factual error, it's genericness. If the research reads as "Health & Fitness = people who want to be healthier," ideation will spit out Strava/MyFitnessPal clones that die on the uniqueness rule and on commercial viability, since Apple's own free apps already cover the generic case. So the research needs to name the crowded space explicitly per category and point ideation at the gaps, not the center.

For Health & Fitness: the category is owned in specific wedges already (Strava=endurance/social, Whoop/Oura=recovery science, Fitness+=guided workouts, Hevy=strength logging, MyFitnessPal=macros, Zwift=virtual riding). Three viable apps means three genuinely different niches or populations, not three skins on "log your workout." Native-feeling differentiators worth building toward: HealthKit read/write, Live Activities for in-progress sessions, interactive widgets, App Intents/Siri shortcuts — all architectable without a real device, just not fully validatable without one.

For Medical: the real audience is prevention-minded, health-anxious consumers who want a number, not a verdict — not "patients" in a clinical sense. Ada Health/WebMD-style symptom checkers are the cautionary comparable, having taken real heat for sounding diagnostic. If we cite QRISK3/FINDRISC, the actual published coefficients need correct implementation and unit tests against known reference cases — a wrong score is worse than no feature. Biggest structural risk: three medical apps that are all "questionnaire → risk score" collide on mechanic regardless of health domain, so differentiation has to come from population/condition/life-stage and the follow-through loop (tracking, clinician-visit prep, lifestyle nudges), not the calculator.

For Navigation: real skepticism that three mutually-unique, commercially viable navigation apps even exist as turn-by-turn products — that market belongs to Apple/Google Maps and Waze, full stop. The viable space is navigation-adjacent: offline/trail nav (Gaia GPS, AllTrails, Komoot comparables), accessibility-aware routing, indoor/venue navigation, or AR-assisted wayfinding for a narrow context — places where GPS is one ingredient, not the whole product, and where simulated location + canned routes can plausibly demonstrate value. Hard limitation to carry forward: without live GPS/traffic/a real device, we can validate the app's logic, UI, and offline behavior against synthetic input — not real-world route quality. That has to be stated as a build-time limitation, not discovered later.

Cross-cutting: "viral potential" in these categories almost never means broad virality — it means a shareable artifact (a score, a route, a streak) or niche word-of-mouth. If ideation bolts on virality mechanics to chase this, that's the same forced-bonus-feature problem as LLM/AR/ML for its own sake, and should be rejected the same way. Also worth carrying into product-direction: with 9 parallel tracks, the real failure mode is two apps converging on the same mechanic under different branding — each app's product-direction phase should have to state in one sentence what's mechanically different from the other 8 before moving to design.

CONSENSUS: YES

## Final Output

**Audience and use context (assumptions, labeled as such):**
- Health & Fitness: people already invested enough in fitness to want more than Apple's free tools — the differentiation has to be a specific population, modality, or behavioral mechanic, not "general fitness."
- Medical: prevention-minded, health-anxious consumers seeking a validated risk number and a plan, explicitly not people seeking diagnosis — framing must reinforce this at every touchpoint.
- Navigation: people navigating a specific context where mainstream turn-by-turn doesn't serve them well (off-grid, accessibility needs, indoor/venue, spatial memory) — not general drivers.

**Comparable apps/patterns to learn from (and avoid copying):**
- Health & Fitness: Strava, Whoop, Oura, Apple Fitness+, Hevy, MyFitnessPal, Zwift — each owns a wedge; a new app must claim unclaimed territory, not compete head-on.
- Medical: Ada Health, WebMD symptom checkers — useful mainly as a cautionary pattern for how diagnostic-sounding language creates real risk; QRISK3/FINDRISC as the validated-instrument model to follow precisely.
- Navigation: Apple Maps/Google Maps/Waze own turn-by-turn outright; Gaia GPS, AllTrails, Komoot are the right comparables for the navigation-adjacent space this batch should actually target.

**Platform-specific opportunities:**
- HealthKit integration, Live Activities/Dynamic Island for active sessions, interactive widgets, and App Intents/Siri shortcuts make fitness apps feel native — architect for these even though full validation needs a real device.
- Medical apps benefit from on-device, private-by-default computation of risk scores (local-first fits naturally here) plus clear, reusable disclaimer/copy components enforced across the app.
- Navigation-adjacent apps can lean on MapKit overlays, offline map/region caching, and (where relevant) ARKit for short-range wayfinding — all of which can be built and exercised via simulated location/canned routes.

**Major assumptions and risks:**
1. "Production-ready" validation is capped at simulator/automated checks — no real device, live GPS, HealthKit hardware, or App Store submission (already named as a limitation in the prompt contract; re-affirmed here per category).
2. Medical risk-scoring is a legal tripwire: any named instrument (QRISK3, FINDRISC-style) must use the real published formula, tested against reference inputs — an incorrect score is a worse failure than omitting the feature.
3. Navigation cannot validate real-world route/traffic quality at all in this environment — only logic, UI, and offline behavior against synthetic location data.
4. The biggest cross-app risk is mechanic convergence (three medical apps all being "questionnaire → score," or two apps in different categories both being "score + streak") — this is a bigger uniqueness threat than branding similarity.
5. "Viral potential" must stay a niche/earned mechanic (shareable score, route, streak) — chasing broad virality risks becoming a forced feature, the same failure mode the contract already flagged for LLM/AR/ML.

**Implications for the first build:**
- Ideation (next phase) must generate candidates that occupy specifically named gaps per category (see comparables above), not generic versions of the category leaders.
- Each of the 18+ candidates should be checkable against a one-sentence "what's mechanically different from every other candidate in this batch" test before shortlisting to 9.
- Medical candidates that drift toward diagnostic framing get rescoped or rejected at ideation, not caught later.
- Navigation candidates should be scoped from the start around simulated-location-friendly value (offline data, routing logic, accessibility, indoor/AR) rather than live-GPS-dependent value.
- Build phase should plan concrete platform hooks (HealthKit, Live Activities, App Intents, MapKit offline caching, on-device computation) as architecture decisions now, not afterthoughts.

## Portfolio Selection

## Round 1 Wrap-Up

Same pattern as the last two phases — Codex and Gemini didn't show up, so this is Claude's solo pass standing as the round. But it's a thorough one: 18 candidates considered (6 per category), each checked against the research's crowded-space warnings and the contract's uniqueness rules, narrowed to 9 with explicit rejections and reasons. Nothing here contradicts the prompt contract or product research from earlier phases — if anything it's a direct application of both (the "one-sentence mechanic difference" test from research is used explicitly to cut candidates). I don't see a second round manufacturing real disagreement, so I'm closing this phase now.

Where it landed: three Health & Fitness apps that don't share a mechanic — a perimenopause-specific strength/recovery coach, a return-to-running injury rehab pacer that enforces a physio's walk-run plan, and a climbing periodization app for boulderers/route climbers. Three Medical apps, each a different mechanic and life situation, not three skins on "quiz → score" — a cardiometabolic risk app (real QRISK3 methodology) paired with GP-visit prep, a medication/polypharmacy interaction checker aimed at caregivers, and a perinatal mood risk companion (EPDS-style) with resource connections, all strictly non-diagnostic. Three Navigation apps that treat GPS as one ingredient rather than the whole product — accessibility-aware pedestrian routing for wheelchair/mobility-impaired users, off-grid overlanding navigation for remote road trips, and a sensory-friendly wayfinding/transit companion for neurodivergent and anxiety-prone travelers.

The one deliberate, non-obvious rejection worth flagging: a "retrace your steps" solo-safety breadcrumb navigation app was considered and cut specifically because it sits too close to Waylay's location-based personal recall territory — that's a uniqueness-rule dodge, not an oversight.

CONSENSUS: YES

## Final Output

**Decision:** This is a multi-app portfolio request. 9 apps selected, one independent sibling project folder per app, no collapsed wrapper project, no category collapsed into another.

**Selected apps:**

| # | Category | Slug | Promise | Target user | Build |
|---|----------|------|---------|-------------|-------|
| 1 | Health & Fitness | `meno-strength` | A strength & recovery coach built around perimenopause/menopause physiology — adapts training load to hot flashes, sleep disruption, and hormonal recovery shifts | 48-year-old former regular exerciser now waking at 3am drenched in sweat, whose current fitness apps assume she's 28 | true |
| 2 | Health & Fitness | `return-to-run` | Enforces a physio-prescribed walk-run return-to-running progression, flags pain signals, and refuses to let you outrun your own rehab plan | Someone 6 weeks post stress-fracture/IT-band flare-up with a paper progression plan and no discipline enforcement | true |
| 3 | Health & Fitness | `crux-cycle` | Structured training-block periodization and mandatory rest-day enforcement for boulderers and route climbers managing finger-tendon load | A climber training for a grade breakthrough who over-trains without a periodized plan | true |
| 4 | Medical | `heartline` | QRISK3-methodology cardiometabolic risk score paired with a GP-visit prep sheet — a number and real questions, not a diagnosis | Someone whose parent had a heart attack at 58, lying awake wondering if it's coming for them | true |
| 5 | Medical | `pillcheck` | Medication interaction and polypharmacy-burden checker with pharmacist-visit prep, built for people juggling 5+ prescriptions across providers | An adult child managing a parent's 7 medications from 3 doctors who don't talk to each other | true |
| 6 | Medical | `postpartum-compass` | EPDS-style perinatal mood risk screening with ongoing check-ins and connection to real local resources — never diagnostic language | Someone 4 weeks postpartum who suspects something's wrong and is scared saying so gets her reported, not helped | true |
| 7 | Navigation | `clearpath-access` | Accessibility-aware pedestrian routing accounting for curb cuts, stairs, grade, and construction, with community obstacle reporting | A wheelchair/mobility-impaired user dumped at the bottom of a staircase by Apple Maps one time too many | true |
| 8 | Navigation | `overland-nav` | Off-grid overlanding navigation: fuel/water/service-stop range planning, offline vector maps for dirt roads, waypoint logging | Someone planning a remote road trip with no cell signal and real fuel-range anxiety | true |
| 9 | Navigation | `quietroute` | Sensory-friendly wayfinding and transit companion: predictable low-stimulation step-by-step guidance, no sudden reroutes or visual clutter | A neurodivergent/anxiety-prone traveler for whom an unpredictable transit reroute means the trip doesn't happen | true |

**Rejected alternatives (and why):**
- *Health & Fitness:* shift-worker circadian/training scheduler (thin as a fitness product, weak willingness-to-pay); long-COVID/chronic-fatigue pacing app (real need, but drifts into medical-category territory — kept out to avoid blurring the line).
- *Medical:* FINDRISC-style diabetes risk app (mechanically identical "quiz → score" shape as the cardiometabolic app — collision, not differentiation); travel-health risk assessment (occasional-use only, no realistic subscription case); caregiver-burnout risk app (thematically overlaps with the perinatal app's "quietly not okay" framing).
- *Navigation:* backcountry trail navigation (Gaia GPS/AllTrails/Komoot already own this exactly); indoor venue navigation (structurally a B2B floorplan-data sales motion, not a consumer subscription app); AR last-fifty-feet parking wayfinding (too thin to be a whole product); retrace-your-steps solo-safety breadcrumb app (deliberately cut — too close to Waylay's location-based personal recall concept; a uniqueness-rule dodge, not an oversight).

**Risks carried forward to design/build phases:**
- `postpartum-compass` is the sharpest legal/ethical edge in the batch — non-diagnostic copy and resource-connector framing are non-negotiable, not a nice-to-have.
- `overland-nav` is hardest to demonstrate convincingly without a real device/trip — its production-readiness bar leans on believable canned routes and correct offline-mode behavior, not pretending real-world validation happened.

```portfolio-json
{
  "portfolio": true,
  "outputDirectory": "/Users/pchordia/Documents/iOS-App-Factory",
  "apps": [
    {
      "slug": "meno-strength",
      "category": "Health & Fitness",
      "promise": "Strength & recovery coach adapted to perimenopause/menopause physiology",
      "targetUser": "48-year-old former regular exerciser navigating hot flashes, sleep disruption, and changing recovery needs",
      "mechanic": "life-stage-adapted training coach",
      "build": true
    },
    {
      "slug": "return-to-run",
      "category": "Health & Fitness",
      "promise": "Enforces a physio-prescribed walk-run return-to-running progression with pain-signal discipline",
      "targetUser": "Runner rehabbing a stress fracture or IT band injury on a graduated return plan",
      "mechanic": "rehab plan enforcer",
      "build": true
    },
    {
      "slug": "crux-cycle",
      "category": "Health & Fitness",
      "promise": "Structured periodization and rest-day enforcement for boulderers and route climbers",
      "targetUser": "Climber managing finger-tendon load across training blocks",
      "mechanic": "periodization planner",
      "build": true
    },
    {
      "slug": "heartline",
      "category": "Medical",
      "promise": "QRISK3-methodology cardiometabolic risk score with GP-visit prep sheet",
      "targetUser": "Adult with family cardiac history seeking a real number, not vague anxiety",
      "mechanic": "validated risk score + clinician-visit prep",
      "build": true
    },
    {
      "slug": "pillcheck",
      "category": "Medical",
      "promise": "Medication interaction and polypharmacy-burden checker with pharmacist-visit prep",
      "targetUser": "Caregiver managing a family member's 5+ prescriptions across multiple providers",
      "mechanic": "interaction checker + pharmacist-visit prep",
      "build": true
    },
    {
      "slug": "postpartum-compass",
      "category": "Medical",
      "promise": "EPDS-style perinatal mood risk screening with ongoing check-ins and real local resource connections",
      "targetUser": "Pregnant or postpartum parent worried about their mood, afraid of being judged or reported",
      "mechanic": "validated mood screen + longitudinal check-ins + resource connector",
      "build": true
    },
    {
      "slug": "clearpath-access",
      "category": "Navigation",
      "promise": "Accessibility-aware pedestrian routing with community-sourced obstacle reporting",
      "targetUser": "Wheelchair or mobility-impaired pedestrian underserved by mainstream turn-by-turn apps",
      "mechanic": "physical-accessibility-constrained routing",
      "build": true
    },
    {
      "slug": "overland-nav",
      "category": "Navigation",
      "promise": "Off-grid overlanding navigation with fuel/water/service-stop range planning and offline vector maps",
      "targetUser": "Remote road-tripper/overlander planning routes with no cell signal",
      "mechanic": "vehicle logistics + offline routing",
      "build": true
    },
    {
      "slug": "quietroute",
      "category": "Navigation",
      "promise": "Sensory-friendly, predictable step-by-step wayfinding and transit companion",
      "targetUser": "Neurodivergent or anxiety-prone traveler for whom unpredictable reroutes derail the trip",
      "mechanic": "cognitive/sensory-accessibility-constrained routing",
      "build": true
    }
  ],
  "rejectedAlternatives": [
    {"category": "Health & Fitness", "concept": "shift-worker circadian/training scheduler", "reason": "thin product-market fit, weak willingness-to-pay"},
    {"category": "Health & Fitness", "concept": "long-COVID/chronic-fatigue pacing app", "reason": "drifts into medical-category territory, blurs the line"},
    {"category": "Medical", "concept": "FINDRISC-style diabetes risk app", "reason": "mechanically identical quiz-to-score shape as heartline — collision"},
    {"category": "Medical", "concept": "travel-health risk assessment", "reason": "occasional-use only, no realistic subscription case"},
    {"category": "Medical", "concept": "caregiver-burnout risk app", "reason": "thematic overlap with postpartum-compass"},
    {"category": "Navigation", "concept": "backcountry trail navigation", "reason": "Gaia GPS/AllTrails/Komoot already own this space directly"},
    {"category": "Navigation", "concept": "indoor venue navigation", "reason": "structurally B2B floorplan-data sales motion, not consumer subscription fit"},
    {"category": "Navigation", "concept": "AR last-fifty-feet parking wayfinding", "reason": "too thin to be a whole product"},
    {"category": "Navigation", "concept": "retrace-your-steps solo-safety breadcrumb app", "reason": "too close to Waylay's location-based personal recall concept — uniqueness violation"}
  ]
}
```

**Acceptance checks:** 9 apps selected, matching the prompt's exact 3/3/3 split — no reduction to explain. Each has a distinct slug and can become its own independent project folder. No category collapsed into another or into a shared wrapper.

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "Meno Strength",
      "slug": "meno-strength",
      "category": "Health & Fitness",
      "promise": "Strength & recovery coach adapted to perimenopause/menopause physiology",
      "targetUser": "48-year-old former regular exerciser navigating hot flashes, sleep disruption, and changing recovery needs",
      "mechanic": "life-stage-adapted training coach",
      "build": true
    },
    {
      "name": "Return To Run",
      "slug": "return-to-run",
      "category": "Health & Fitness",
      "promise": "Enforces a physio-prescribed walk-run return-to-running progression with pain-signal discipline",
      "targetUser": "Runner rehabbing a stress fracture or IT band injury on a graduated return plan",
      "mechanic": "rehab plan enforcer",
      "build": true
    },
    {
      "name": "Crux Cycle",
      "slug": "crux-cycle",
      "category": "Health & Fitness",
      "promise": "Structured periodization and rest-day enforcement for boulderers and route climbers",
      "targetUser": "Climber managing finger-tendon load across training blocks",
      "mechanic": "periodization planner",
      "build": true
    },
    {
      "name": "Heartline",
      "slug": "heartline",
      "category": "Medical",
      "promise": "QRISK3-methodology cardiometabolic risk score with GP-visit prep sheet",
      "targetUser": "Adult with family cardiac history seeking a real number, not vague anxiety",
      "mechanic": "validated risk score + clinician-visit prep",
      "build": true
    },
    {
      "name": "Pillcheck",
      "slug": "pillcheck",
      "category": "Medical",
      "promise": "Medication interaction and polypharmacy-burden checker with pharmacist-visit prep",
      "targetUser": "Caregiver managing a family member's 5+ prescriptions across multiple providers",
      "mechanic": "interaction checker + pharmacist-visit prep",
      "build": true
    },
    {
      "name": "Postpartum Compass",
      "slug": "postpartum-compass",
      "category": "Medical",
      "promise": "EPDS-style perinatal mood risk screening with ongoing check-ins and real local resource connections",
      "targetUser": "Pregnant or postpartum parent worried about their mood, afraid of being judged or reported",
      "mechanic": "validated mood screen + longitudinal check-ins + resource connector",
      "build": true
    },
    {
      "name": "Clearpath Access",
      "slug": "clearpath-access",
      "category": "Navigation",
      "promise": "Accessibility-aware pedestrian routing with community-sourced obstacle reporting",
      "targetUser": "Wheelchair or mobility-impaired pedestrian underserved by mainstream turn-by-turn apps",
      "mechanic": "physical-accessibility-constrained routing",
      "build": true
    },
    {
      "name": "Overland Nav",
      "slug": "overland-nav",
      "category": "Navigation",
      "promise": "Off-grid overlanding navigation with fuel/water/service-stop range planning and offline vector maps",
      "targetUser": "Remote road-tripper/overlander planning routes with no cell signal",
      "mechanic": "vehicle logistics + offline routing",
      "build": true
    },
    {
      "name": "Quietroute",
      "slug": "quietroute",
      "category": "Navigation",
      "promise": "Sensory-friendly, predictable step-by-step wayfinding and transit companion",
      "targetUser": "Neurodivergent or anxiety-prone traveler for whom unpredictable reroutes derail the trip",
      "mechanic": "cognitive/sensory-accessibility-constrained routing",
      "build": true
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

Only Claude showed up this round (Codex and Gemini both stayed dark again), but it did real verification work rather than just reasoning from the manifest — it actually probed the filesystem with existence checks against the output directory. That's the right instinct for a QA/risk pass on a portfolio audit, and nothing here conflicts with anything decided in earlier phases, so I'm not spinning a second round to manufacture disagreement that isn't there.

Here's where it landed: all 9 expected sibling folders genuinely exist on disk under `/Users/pchordia/Documents/iOS-App-Factory` in the correct 3/3/3 split (`meno-strength`, `return-to-run`, `crux-cycle` / `heartline`, `pillcheck`, `postpartum-compass` / `clearpath-access`, `overland-nav`, `quietroute`), there's no collapsed wrapper folder, and the sibling batches `batch-cat-b2`/`batch-cat-b3` are confirmed reachable so the uniqueness rule's "check sibling folders" clause was at least checkable. That clears the hard acceptance check: this is not one folder containing all apps.

The honest limit it flagged: it could verify folder-level shape but nothing below that — per-child workflow correctness (whether each of the 9 actually ran `app_build` with a prompt preserving the parent's requirements) isn't independently checkable from this parent vantage point, since the orchestrator's state for that lives outside flat files it can reach. That's not a red flag, it's an architectural limit worth naming honestly rather than either over-claiming full verification or raising a false alarm. It also correctly notes one carried-forward gap from the earlier portfolio_selection phase: nobody has actually diffed these 9 concepts against whatever concepts exist in sibling batches b2/b3 — only the Waylay-specific rejection was ever demonstrated. That's real remaining work, not paperwork, and should stay open rather than be assumed closed. Jira/Notion backfill is correctly untriggered since no "liked" signal has come from the user yet — that's expected pending state, not a gap.

## Final Output

**Portfolio applicability:** Applicable — this is a genuine multi-app portfolio run (9 apps, 3 categories).

**Expected vs. actual app/project count:** Expected 9 (3 Health & Fitness, 3 Medical, 3 Navigation). Actual: 9 sibling folders confirmed to exist on disk at `/Users/pchordia/Documents/iOS-App-Factory` — `meno-strength`, `return-to-run`, `crux-cycle`, `heartline`, `pillcheck`, `postpartum-compass`, `clearpath-access`, `overland-nav`, `quietroute` — matching the manifest's 3/3/3 split exactly. No shortfall, no reduction to explain.

**Child folder/workflow check:** Folder-level shape verified directly via filesystem probes — no collapsed wrapper folder found (no `apps/`-style container), each app is an independent sibling directory. Per-child *workflow content* (whether each child's `app_build` run actually preserved its assigned brief) is not independently verifiable from the parent's vantage point in this environment; this is asserted by the manifest (`build: true` for all 9) and should be confirmed at each child's own build_verification/final_review output rather than assumed here.

**Skipped or collapsed category warnings:** None. No category was collapsed into another or into a shared project.

**Backfill readiness notes for Jira/Notion:** Correctly not triggered — no explicit "liked" signal from the user yet, consistent with the contract's rule that this only fires on explicit post-review user signal.

**Open risk carried forward (not a blocker, but should not be treated as closed):** The uniqueness rule's requirement to check sibling batch folders (`batch-cat-b2`, `batch-cat-b3`, confirmed reachable) for concept overlap has still only been partially demonstrated — the Waylay-named-app rejection was checked explicitly, but no actual diff of these 9 concepts against b2/b3's concepts has been shown. This should be closed out before this batch is considered fully uniqueness-verified, not assumed satisfied by this audit.

**Acceptance check outcome:** Passes — apps were not collapsed into one folder; folder/count match is real and verified; the one open item (sibling-batch concept diff) is recorded as a carried-forward risk rather than a blocker, since it doesn't indicate a structural mismatch, only unfinished verification.

VERIFICATION: UNVERIFIED
_(No structured verification result exists for this build.)_
