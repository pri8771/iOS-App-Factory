PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp3
Selected app slug: waylay

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Waylay

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Waylay

## Category

personal utility / location-based recall

## One-Sentence Promise

Tap once when something catches your eye out in the world, and Waylay quietly reminds you the next time you're actually standing near it.

## Target User

Everyday iPhone users who constantly get real-world recommendations (from friends, storefronts, social media, conversations) and lose track of them because saving something somewhere doesn't equal remembering it at the moment it matters.

## Painful Moment Solved

You walk right past a restaurant three friends recommended, but you don't remember until you're home; or you save it to Notes or Maps and that list never gets opened again.

## Why It Is Different

Apple Reminders technically supports location-triggered reminders but the capture flow is buried and slow to use in the moment; Google/Apple Maps saved lists never proactively resurface anything. Waylay is built around exactly one loop — sub-3-second capture, automatic proactive resurfacing when nearby.

## Why Users Would Pay

Free tier caps the number of actively monitored places (bounded further by iOS's real 20-region-per-app monitoring limit); paid tier unlocks the full saved-places library with an intelligent rotation engine, richer capture (photo/voice notes), and widgets.

## Subscription Model

$3.99/mo or $24.99/yr Pro: unlimited saved places with smart region rotation, photo/voice notes, home screen widgets. Free tier: ~8 actively monitored places.

## Local-First MVP Scope

Sub-3-second capture (share sheet, camera, manual pin), CoreLocation region monitoring with priority-based rotation across the 20-region system cap, local persistent store, place library browser, proactive resurfacing notifications, snooze/dismiss/mark-visited.

## Future Backend Roadmap

CloudKit-based multi-device sync; optional shared/collaborative lists later, added carefully so it doesn't become a network-effect dependency for the core single-player loop.

## AR / Local ML / Local LLM Fit

Not required for the core loop. Optional on-device Vision OCR to pull a name off a photographed sign is a nice-to-have, cut without hesitation if it adds friction.

## Design Direction

Warm, tactile, 'little discoveries' feel — resurfacing a memory, not managing a system.

## App Store Positioning

The place-memory app for things you'll walk past again.

## Invalidation Criteria

Kill if people don't reliably capture in the moment, or resurfacing feels inaccurate/spammy rather than delightful.

## v1 Build Scope

Capture flow, geofenced resurfacing with rotation logic, place library, notifications, widgets, subscription paywall with free-tier cap, restore flow.

## Core Workflows

- capture a place in under 3 seconds from anywhere
- automatic proactive notification when physically near a saved place
- browse and manage the saved places library
- snooze, dismiss, or mark a place visited

## iOS-Native Features

- CoreLocation region monitoring
- home screen widgets
- share sheet extension
- App Intents/Siri shortcuts

## Key Risks

- iOS hard-caps monitored regions at 20 per app — rotation/prioritization is core architecture, not an edge case
- if capture isn't faster than opening Notes, the loop is dead
- risk of feeling like 'just another list app' if resurfacing isn't reliable and well-timed

## Claude Design Handoff Prompt

Design a warm, low-friction location-memory app whose entire emotional register is 'oh right, that place!' — not a task manager. Capture must feel instant; resurfacing must feel like a delightful nudge, never a chore.

## Parent Portfolio Prompt

Build 2 completely separate iOS apps at the same time.

Requirements:
1. Each app must go from 0 to production-ready, not just a few features.
2. Each app must be unique, useful, and commercially viable.
3. Each app must be beautifully designed and feel premium.
4. Each app must provide real end-user value.
5. Each app should have a realistic path to monetization, with a subscription or paid offering that offers genuine value.
6. Each app should have viral potential in general or within a niche, but virality must not come at the expense of usefulness.
7. Each app should be better than its competitors in a meaningful way.
8. Each app should be local-first, but architected so cloud support could be added later without rewriting everything.
9. The two apps must not be similar to each other.
10. Neither app can be similar to anything I have already built before.
11. Do not reuse prior concepts, themes, or mechanics from earlier apps unless there is a strong, clearly justified reason.

Bonus points:
- Unique use of LLMs
- Unique use of AR
- Unique use of ML

Important:
- Bonus points are optional. Do not force them in if they would weaken the app.
- If an LLM, AR, or ML feature is used, it must provide real value and be integral to the product.
- Do not bias the ideas toward bonus points.
- Do not make the app around novelty alone.
- The final result for each app must be a full production-ready app, not a prototype.

Build rules:
- Run the two app efforts in parallel.
- Keep the discussion and design phases separate for each app.
- Each app should get its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all prompt discussion, phase discussion, and final decisions for each app.
- At the end, combine the full transcript for each app into a .txt file.
- If an app is liked, also prepare a Jira board and Notion project for it separately, including epics, tasks, fields, and all the implementation structure needed for backfilling later.
- If the system supports multiple rounds per phase, use enough rounds to get high-quality discussion, but allow a phase to end early if consensus is reached.
- Make the orchestrator resilient: if a phase stalls, recover cleanly instead of looping.
- Report only important milestones, not every tiny step.

Output:
- Create one folder per app in the output directory.
- If multiple apps are made, there must be one folder per app, not one folder containing all apps.
- Keep the outputs clearly separated and organized.

Output directory:
- /Users/pchordia/Documents/GitHub

Now generate the first two app ideas, discuss them thoroughly, choose the best two, and build both all the way to production quality.


## Change requested
The app currently FAILS to compile. Fix every compiler error until the build succeeds cleanly; do not drop features unless unavoidable.
