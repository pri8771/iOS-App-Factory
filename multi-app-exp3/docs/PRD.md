# multi-app-exp3 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Consensus reached — writing the final phase output.

CONSENSUS: YES

## Final Output

Both reviewers landed in the same place, and Gemini's absence doesn't block a decision here since Codex and Claude converged on all the load-bearing points. Here's where the group ended up:

**What this phase locks in:**

The original prompt is preserved verbatim above and must be carried forward unedited into every later phase.

**Hard requirements (non-negotiable):**
1. Exactly two apps, built in parallel, with genuinely separate discussion/design threads — no cross-pollination between the two efforts even though the same agents reason about both.
2. The two apps must differ on at least three of: target user, primary workflow, monetization style, emotional tone, key technical risk. Same-category apps with different skins do not satisfy requirement 9.
3. Each app must be useful, premium-feeling, commercially viable, and beat competitors in one concrete, user-meaningful way.
4. Local-first by default, with clean-enough architecture (storage/sync boundaries, identity assumptions, domain models) that cloud sync could be bolted on later without a rewrite.
5. Each app needs its own full product direction, design direction, architecture, implementation plan, and actual build output — not just ideation.
6. Bonus tech (LLM/AR/ML) defaults to **off**. It can only be added if the app would be clearly worse without it, and it must survive the test "would this still be a good app without this feature?" No forcing bonus points in for excitement.
7. Discussion, phase transcripts, and final decisions saved per app; each app ends with a combined `.txt` transcript.
8. If the user says they like an app (decided only at the end, by the user, not by agent preference during discussion), that app additionally gets a Jira board and Notion project structure (epics, tasks, fields, backfill-ready).
9. Output: one self-contained folder per app under `/Users/pchordia/Documents/GitHub` — never a shared folder for both.
10. Reporting surfaces milestones only, not step-by-step noise.

**Non-goals:**
- Not maximizing novelty for its own sake; not forcing LLM/AR/ML in; not shipping prototypes, demo shells, or feature-list-as-product; not building broad extensible platforms instead of finished small apps; not merging the two apps into one shared thesis/brand/architecture narrative; not chasing virality at the cost of usefulness.

**Production-ready, defined concretely (so it can't be redefined downward later):** builds and runs without crashing; every reachable screen has real empty/loading/success/error states; data persists across relaunch; no unjustified third-party dependencies; a real subscription/paywall flow (StoreKit, can be locally stubbed for testing); Dynamic Type, VoiceOver labels, and contrast handled; some automated or scripted verification of core flows, not just "it compiles." A pile of unrun SwiftUI files is a prototype, not production.

**Decision rules for later phases:**
- Don't advance an idea without a specific user problem, a narrow first-release scope, a real competitive wedge, and a believable reason to pay.
- Reject ideas dependent on heavy network effects, enterprise sales, large creator ecosystems, or cloud infra to be useful — conflicts with local-first-from-zero.
- If the differentiator is "AI does X," reject unless the product is compelling without the magic and AI clearly improves the core loop.
- When breadth vs. finish trade off, cut scope and protect the premium core.
- Because prior-app history isn't enumerated in this session, treat requirement 10 ("not similar to anything I've built before") as **unverifiable without more input** — proceed by explicitly flagging this as an assumption in later phases (avoid overfamiliar archetypes as a hedge) rather than silently claiming compliance. Similarity (both to competitors and between the two apps) is judged on category + core mechanic + target user, not surface theme/skin.
- Stall recovery rule: if a phase goes past ~4-5 rounds without convergence, the orchestrator forces a decision using majority support and records the dissent, rather than looping indefinitely or picking silently.
- Portfolio shape to bias toward (not mandatory, but a useful default): one high-frequency personal-utility app with obsessive UX/habit lock-in, one lower-frequency higher-value specialist tool for an underserved niche — this naturally creates the separation requirement 9 demands.

This phase's output is now the binding contract. Ready to move to idea generation whenever you want to proceed — let me know if you'd like me to continue driving the next phase, or if you want to weigh in on anything here first (particularly: do you have a list of apps you've built before, so requirement 10 can actually be checked rather than assumed?).

## Product Research

Both Codex and Claude converged fully here — no real tension, just two people covering complementary ground (Codex on UX/audience shape, Claude on monetization mechanics and platform risk). Nobody pushed back on the other's points, so this reads as genuine consensus rather than a forced call.

CONSENSUS: YES

## Final Output

**Audience and use context**

- *High-frequency utility app*: an individual consumer who already pays for polished tools (the Things/Streaks/Fantastical/Day One buyer), unforgiving about launch speed, widget quality, and data respect (no forced accounts, no dark-pattern paywalls). Use context is fast, interrupted, one-handed, emotionally lightweight — capture/triage/gentle-review, not deep configuration or "managing a system."
- *Niche specialist app*: a self-directed professional or serious hobbyist with a repeated field workflow, discovered via subreddit/Discord/creator recommendation rather than App Store browse. Will tolerate mediocre visuals if the app nails a specific weird workflow (PCalc, ProCreate, Carrot Weather, GoodNotes archetype). Design polish matters less here than functional depth — don't let design conversation starve it.

**Comparable apps or patterns to learn from**

- Utility category table stakes that now read as differentiation-neutral: home screen widgets, Live Activities/Dynamic Island for time-based state, App Intents/Shortcuts (Siri + automation), iCloud-optional sync with no forced account. Skipping these makes an app feel dated on day one — and local-first is orthogonal to this (CloudKit is deferred; WidgetKit/App Intents are not).
- For the niche tool, the decisive question is whether the incumbent is a desktop-first tool with a phoned-in iOS port (real wedge, defensible) versus an already-excellent mobile-native competitor (weak wedge, high risk — flag before committing build time).
- Avoid the most overfarmed indie iOS categories (plain journaling, habit trackers, budget trackers, Pomodoro timers, meditation timers) unless the wedge is unusually sharp — saturation raises the bar and raises the odds of colliding with something the user has plausibly already built or seen (requirement 10 hedge).
- Interaction-skeleton check: if both apps reduce to "capture item → organize item → review item," requirement 9 fails even with different audiences/skins.

**Platform-specific opportunities**

- Shallow IA (3 tabs or fewer) so the product is inferable at a glance; first-session value from direct entry and local intelligence, not a dashboard begging for connected services.
- Camera-first capture, quick annotation, offline persistence, location/time context, share-sheet intake, and a trustworthy review/export flow — strong native fits for the specialist tool.
- If bonus tech is used at all: on-device only by default (Vision, Core ML, on-device NL/foundation models). A cloud-LLM dependency breaks local-first and adds a recurring API cost that undermines the subscription math — treat "requires network + API key + per-call cost" as a red flag needing explicit justification, not a convenience.
- Widgets/Live Activities/App Intents should only be added if they tighten the core loop, not as checkbox feature additions.

**Major assumptions and risks**

1. Prior-app history is unknown, so "avoid overfamiliar archetypes" is a hedge, not verified compliance with requirement 10 (carried over from the prompt-contract phase).
2. Subscription-with-genuine-value is harder for single-player local-first apps than it looks: subscriptions feel natural when there's an ongoing cost driver and extractive when they're just a paywall on local logic. Each app needs an explicit answer to "what does this subscription keep paying for, every month, forever" — real functional depth unlock or a real ongoing content/service layer, not an artificial limit.
3. StoreKit/App Store review mechanics (sandbox testing, subscription groups, restore-purchases-on-new-device, receipt validation edge cases, no paywall on first launch) are a real implementation tax that's easy to hand-wave in a product spec — "restore purchases works and is testable" belongs in the definition of done, not discovered late.
4. Picking a niche whose real competitor is a desktop workflow/existing habit rather than another app — harder to displace than it looks on paper.
5. Confusing "could use ML/LLM/AR well" with "needs it" — risk of a brittle core experience built around a bonus feature that isn't load-bearing.

**Implications for the first build**

- Pick the two ideas where the competitive wedge is a single sentence a real user would nod at, and where that sentence is explicitly about iPhone being the best place for the product's core moment (if that sentence can't be written cleanly, it's a desktop or cloud product wearing a mobile shell).
- Prototype the paywall and restore-purchase flow early, not last.
- Budget real design time asymmetrically — icon, empty states, and one signature interaction — rather than spreading polish evenly and thin.
- For the niche tool, model the actual workflow of that specific user before locking feature scope; solving the wrong sub-problem beautifully still fails.
- Bias toward the portfolio shape already agreed in the prompt-contract phase (one high-frequency habit-lock-in utility, one lower-frequency higher-value specialist tool) since it structurally satisfies the differentiation requirement.

## Portfolio Selection

CONSENSUS: YES

Round three closed the gap. Codex explicitly updated his position after seeing Claude's synthesis — not because he was talked into it, but because the specific fix (make AR an additive layer on top of a fully-functional manual-entry tool, not a dependency the whole product hinges on) actually answered his real objection: a shaky AR feature no longer poisons the whole app, because the app is sellable and production-ready with AR off. Both of them landed on the same two apps with the same reasoning, independently converging on nearly identical merged specs for the second one. The only daylight left is a monetization micro-detail (whether AR capture itself sits behind the paywall or just rides along with the existing Pro tier) — that's a build-phase tuning question, not a strategic disagreement, so it doesn't block closing this phase.

## Final Output

**Decision: portfolio-parent, two apps.** The prompt asked for two completely separate apps; that's what got built here — no collapsing into one shared app, no third app added.

**Selected apps:**

1. **Waylay** — `personal_utility_location_recall`. "Tap once when something catches your eye out in the world, and Waylay quietly reminds you the next time you're actually standing near it." Target user: everyday iPhone users who collect real-world recommendations and forget them by the time they'd be useful. High-frequency, consumer, local-first via on-device CoreLocation geofencing (no server needed), monetized on unlocking the full saved-places library plus smart region-rotation beyond iOS's real 20-region monitoring cap. `build: true`.

2. **Truescale** — `professional_field_documentation`. A complete, structured field-documentation and reporting tool for solo inspectors/contractors/adjusters (project → area/room grouping → photo capture with severity/status tagging → branded PDF export), fully functional and sellable with manual measurement entry alone, with true-to-scale AR/LiDAR measurement layered on top as a genuine differentiator on supported hardware — never a dependency. Lower-frequency, professional, monetized on unlimited projects + branding + (likely) the AR capability. `build: true`.

**Why these two and not the alternatives:** Neighbour (relationship-memory) was rejected because its exact positioning already belongs to Clay and Dex, and because its real usage cadence (checking in on people every week or two) isn't actually high-frequency — it would have quietly broken the high/low-frequency split the portfolio needed to satisfy requirement 9. Plain Fieldproof (fast capture + export, no AR) was rejected as the final spec on its own because "faster and cheaper than CompanyCam without a per-seat account" is a pricing wedge, not the kind of concrete "better than competitors" story requirement 7 asks for — but its structured room/severity/status workflow wasn't thrown away, it became the backbone of Truescale so the AR feature has a real, complete product underneath it.

**Differentiation check:** Waylay and Truescale differ on target user (general consumer vs. solo field professional), primary workflow (passive capture + proactive resurfacing vs. active on-site capture + report generation), monetization shape, emotional tone, and technical risk profile (geofence rotation limits vs. AR/LiDAR device support and accuracy validation) — clearing the three-of-five bar with room to spare.

**portfolio-json:**
```json
{"apps":[
{"name":"Waylay","slug":"waylay","category":"personal utility / location-based recall","one_sentence_promise":"Tap once when something catches your eye out in the world, and Waylay quietly reminds you the next time you're actually standing near it.","target_user":"Everyday iPhone users who constantly get real-world recommendations (from friends, storefronts, social media, conversations) and lose track of them because saving something somewhere doesn't equal remembering it at the moment it matters.","painful_moment":"You walk right past a restaurant three friends recommended, but you don't remember until you're home; or you save it to Notes or Maps and that list never gets opened again.","why_different":"Apple Reminders technically supports location-triggered reminders but the capture flow is buried and slow to use in the moment; Google/Apple Maps saved lists never proactively resurface anything. Waylay is built around exactly one loop — sub-3-second capture, automatic proactive resurfacing when nearby.","why_users_pay":"Free tier caps the number of actively monitored places (bounded further by iOS's real 20-region-per-app monitoring limit); paid tier unlocks the full saved-places library with an intelligent rotation engine, richer capture (photo/voice notes), and widgets.","subscription_model":"$3.99/mo or $24.99/yr Pro: unlimited saved places with smart region rotation, photo/voice notes, home screen widgets. Free tier: ~8 actively monitored places.","local_first_mvp_scope":"Sub-3-second capture (share sheet, camera, manual pin), CoreLocation region monitoring with priority-based rotation across the 20-region system cap, local persistent store, place library browser, proactive resurfacing notifications, snooze/dismiss/mark-visited.","future_backend_roadmap":"CloudKit-based multi-device sync; optional shared/collaborative lists later, added carefully so it doesn't become a network-effect dependency for the core single-player loop.","core_workflows":["capture a place in under 3 seconds from anywhere","automatic proactive notification when physically near a saved place","browse and manage the saved places library","snooze, dismiss, or mark a place visited"],"ios_native_features":["CoreLocation region monitoring","home screen widgets","share sheet extension","App Intents/Siri shortcuts"],"ar_ml_llm_fit":"Not required for the core loop. Optional on-device Vision OCR to pull a name off a photographed sign is a nice-to-have, cut without hesitation if it adds friction.","design_direction":"Warm, tactile, 'little discoveries' feel — resurfacing a memory, not managing a system.","claude_design_prompt":"Design a warm, low-friction location-memory app whose entire emotional register is 'oh right, that place!' — not a task manager. Capture must feel instant; resurfacing must feel like a delightful nudge, never a chore.","app_store_positioning":"The place-memory app for things you'll walk past again.","key_risks":["iOS hard-caps monitored regions at 20 per app — rotation/prioritization is core architecture, not an edge case","if capture isn't faster than opening Notes, the loop is dead","risk of feeling like 'just another list app' if resurfacing isn't reliable and well-timed"],"invalidation_criteria":"Kill if people don't reliably capture in the moment, or resurfacing feels inaccurate/spammy rather than delightful.","v1_build_scope":"Capture flow, geofenced resurfacing with rotation logic, place library, notifications, widgets, subscription paywall with free-tier cap, restore flow.","build":true,"build_priority":1},
{"name":"Truescale","slug":"truescale","category":"professional field tool / AR-assisted documentation","one_sentence_promise":"Truescale captures site issues faster than camera-plus-notes and turns them into structured, client-ready reports — with true-to-scale AR measurement attached to every photo on supported devices.","target_user":"Independent contractors, home inspectors, property managers, insurance adjusters, and punch-list-oriented design/renovation professionals documenting issues on-site from an iPhone.","painful_moment":"Field documentation today means switching between a camera, a separate measuring tool, and a notes app, then rebuilding a structured report at a desk — or paying for team-collaboration SaaS (CompanyCam, Fieldwire) that bills per seat and assumes a company account even for a solo operator.","why_different":"The foundation is a complete, fast, structured capture-and-report tool that already beats camera-plus-notes and undercuts per-seat SaaS pricing for solo users, fully functional with manual measurement entry alone. On top of that, on supported hardware it attaches a true-to-scale AR/LiDAR measurement directly to each photo — a capability gap no competitor offers at any price, never a dependency the app needs to function.","why_users_pay":"Free tier caps active projects per month; paid tier removes the cap and unlocks custom report branding, richer export formats, and AR-measured capture on supported devices — ongoing value is unlimited professional output plus a precision feature no free tool offers.","subscription_model":"$14.99/mo or $119/yr Pro: unlimited projects, custom report branding, advanced PDF/CSV export, AR measurement capture, priority updates. Free tier: 2 active projects/month, manual measurement entry only.","local_first_mvp_scope":"Offline project creation, area/room grouping, issue capture with photo plus structured metadata (severity, status), manual measurement entry as the default input, optional AR/LiDAR measurement on supported devices, structured branded PDF report generation, project library, filtering and history — all on-device.","future_backend_roadmap":"Optional cloud backup/sync for device loss protection; team collaboration, client portals, and signed reports later as explicit opt-ins without changing the local project/observation model.","core_workflows":["create a project and define site areas or rooms","capture an issue with photo, note, severity, and status in seconds, with measurement entered manually or via AR on supported devices","review observations by area, urgency, or status","auto-generate a structured branded PDF report and export it from the phone"],"ios_native_features":["Camera capture","ARKit/RoomPlan and LiDAR-based measurement (supported devices only)","PDFKit report generation","Files app and share sheet export","location stamping","App Intents for quick project start"],"ar_ml_llm_fit":"AR measurement is an additive precision layer, not a dependency — the app is complete and production-ready without it. Where available (iPhone 12 Pro+), it's a genuine capability gap versus every existing competitor. No LLM needed for v1.","design_direction":"Crisp, technical, trustworthy, 'instrument panel' feel — strong hierarchy, large touch targets, bright-light legibility, glove-friendly one-handed capture.","claude_design_prompt":"Design a premium iOS field documentation app for solo site professionals. Prioritize speed, clarity, and confidence in bright outdoor conditions. Capture should minimize taps and work identically well with manual or AR measurement. Report output must look credible enough to hand directly to a client.","app_store_positioning":"The fastest way to document site issues and send clean, accurately measured reports from your iPhone — no team account required.","key_risks":["AR measurement accuracy must be validated within professional tolerance on supported hardware before being sold as a headline feature; if it slips, the app still ships and sells on capture speed and export quality alone","fails if structured capture (with or without AR) isn't materially faster and cleaner than camera-plus-notes","scope can bloat into inspection/compliance software if tagging isn't kept narrow","real competitor may be the professional's existing multi-app habit, not another single app"],"invalidation_criteria":"Kill or descope AR if measurement accuracy can't be validated within professional tolerance — the base app still stands alone. Kill the whole product if structured capture isn't clearly faster/cleaner than camera-plus-notes, or reports feel too amateur to send to a client.","v1_build_scope":"Project creation, area/room grouping, structured issue capture (photo, severity, status, manual or AR measurement), branded PDF report generation, project library, filtering/history, subscription paywall with free-tier project cap and restore flow.","build":true,"build_priority":2}
]}
```

Both apps are cleared to move into their own independent product-direction, design, architecture, and build phases as separate sibling projects, each destined for its own folder under `/Users/pchordia/Documents/GitHub`.

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
