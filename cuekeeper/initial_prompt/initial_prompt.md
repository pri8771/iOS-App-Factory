PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp4
Selected app slug: cuekeeper

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# CueKeeper

Build mode: **MVP build**.
Build priority: **7**.

## App Name

CueKeeper

## Category

event-operations

## One-Sentence Promise

Run a live event from your iPhone without losing the sequence, timing, or backup plan.

## Target User

Wedding planners, stage managers, DJs, MCs, and small production operators running events without expensive show-control software.

## Painful Moment Solved

The event is live, timing is slipping, and someone needs a reliable run-of-show tool that still works offline.

## Why It Is Different

Designed for live execution under pressure, not static planning or generic to-do lists.

## Why Users Would Pay

A single avoided live-event mistake is worth the subscription for professionals and serious operators.

## Subscription Model

Free for simple single-event runs; premium for unlimited events, cue templates, contingency plans, advanced timing features.

## Local-First MVP Scope

Event timelines, cue lists, role assignments, timing controls, contingency notes, offline run mode on-device — scoped to a single operator, not a synced team.

## Future Backend Roadmap

Team sync, remote cue sharing, client-facing run sheets, multi-device coordination — explicitly deferred, not required for v1 value.

## AR / Local ML / Local LLM Fit

No LLM, AR, or ML required; the product wins on execution reliability.

## Design Direction

High-contrast operational UI that stays elegant but favors legibility and fast recovery under pressure.

## App Store Positioning

An offline-first run-of-show app for people who cannot afford chaos during live events.

## Invalidation Criteria

If the live run mode is not obviously better than Notes or a PDF schedule, the app should be cut.

## v1 Build Scope

Single-user event runner with timeline builder, cue execution mode, timers, contingency notes, templates, onboarding, paywall, accessibility, offline verification.

## Core Workflows

- Build a run-of-show
- Run cues in live mode with timing support
- Adjust and recover when the plan shifts

## iOS-Native Features

- Live Activities
- Notifications
- Haptics
- Widgets for event countdowns
- App Intents for quick event start

## Key Risks

- Must feel faster and more trustworthy than a printed run sheet
- Live mode interaction design has to be extremely clear
- Must stay genuinely useful as a single-operator tool, not silently assume multi-device coordination

## Claude Design Handoff Prompt

Design a premium live event operations app with clock-aware run mode, strong cue hierarchy, big-touch controls, graceful contingency handling.

## Parent Portfolio Prompt

Build 7 completely separate iOS apps at the same time.

Requirements:
1. Each app must go from 0 to production-ready, not just a few features.
2. Each app must be unique, useful, and commercially viable.
3. Each app must be beautifully designed and feel premium.
4. Each app must provide real end-user value.
5. Each app should have a realistic path to monetization, with a subscription or paid offering that offers genuine value.
6. Each app should have viral potential in general or within a niche, but virality must not come at the expense of usefulness.
7. Each app should be better than its competitors in a meaningful way.
8. Each app should be local-first, but architected so cloud support could be added later without rewriting everything.
9. The seven apps must not be similar to each other.
10. No app can be similar to anything I have already built before — including the apps already in this workspace (e.g. Waylay and TrueScale, currently in progress).
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
- Run the seven app efforts in parallel.
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
- There must be one folder per app, not one folder containing all apps.
- Keep the outputs clearly separated and organized.

Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate candidate app ideas (at least 10), discuss them thoroughly, choose the best 7, and build all seven to production quality.
