PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp5
Selected app slug: chalkline

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Chalkline

Build mode: **MVP build**.
Build priority: **3**.

## App Name

Chalkline

## Category

Climbing technique & route log with on-device movement analysis

## One-Sentence Promise

Shows a climber exactly where their movement broke down on a route, not just what grade they sent.

## Target User

Boulderers and sport climbers who climb several times a week and want to improve technique, not just log send counts.

## Painful Moment Solved

A climber films an attempt on their phone but has no objective way to see where their center of mass drifted, where they over-gripped, or how this attempt compares to the last one — improvement is guesswork and the route log is just numbers.

## Why It Is Different

On-device Vision body-pose estimation over captured attempt video produces a movement trace and an efficiency score per attempt — a real, deterministic, camera-centric technical capability nobody else localizes in a climbing app; bold gym-signage graphic visual language with chalk-dust texture, route-color-coding, and haptic-tied transitions between attempts.

## Why Users Would Pay

Subscription unlocks unlimited video-analysis history, side-by-side attempt comparison, and training-plan generation from logged technique weaknesses.

## Subscription Model

Free tier: route/attempt logging, capped video-analysis history. Paid: unlimited analysis history, attempt-comparison view, generated training plans.

## Local-First MVP Scope

SwiftData models for gyms/routes/attempts/sessions with video references; Vision pose estimation samples each attempt clip at a fixed low frame rate (not full video framerate) and efficiency scoring runs fully on-device against locally stored video.

## Future Backend Roadmap

CloudKit sync for cross-device attempt history; optional gym-community route-sharing later — additive on top of the local-first model.

## AR / Local ML / Local LLM Fit

On-device Vision framework for body-pose estimation during attempt review, sampled at a fixed low frame rate per clip for reliability — the app's defining hard capability, not a bonus feature.

## Design Direction

Bold gym-signage graphic design: chalk-dust textures, high-contrast route-color-coding, kinetic haptic-tied transitions between attempts, energetic but legible type scale.

## App Store Positioning

The climbing app that shows you where your technique actually broke down, using pose analysis no other climbing log does on-device.

## Invalidation Criteria

If on-device pose estimation can't produce a stable, explainable efficiency signal from typical gym-lighting phone video even with the framing guide, narrow v1 to movement-trace visualization only and drop the numeric efficiency score rather than ship a misleading number — this is the documented fallback, not a hoped-for outcome.

## v1 Build Scope

Route/attempt logging, video capture/import, low-frame-rate pose-trace overlay with efficiency score, basic attempt comparison; training-plan generation deferred as a fast-follow if time allows.

## Core Workflows

- Log a route and attempt
- Capture or import attempt video
- View pose-trace overlay and efficiency score
- Compare attempts side by side
- Track session goals and streaks
- Get a training-plan suggestion from logged weaknesses

## iOS-Native Features

- Widget: session streak / next gym goal
- Live Activity for timed attempts or rest intervals
- App Intents for Siri ("log a send")
- On-device Vision framework for pose estimation

## Key Risks

- Pose estimation accuracy depends on video framing/lighting the user controls — mitigated with an in-app framing guide and a visible confidence indicator rather than presenting shaky data as certain
- Efficiency scoring could feel like a gimmick if not clearly tied to actionable technique feedback
- Clip storage needs a sane retention/compression default so it doesn't balloon like a general video library

## Claude Design Handoff Prompt

Design a climbing technique app called Chalkline with a bold gym-signage graphic visual identity: chalk-dust textures, high-contrast route-color-coded UI, energetic display type, and kinetic transitions tied to haptics. It should feel like climbing-gym wayfinding brought to life, not a fitness-tracker template.

## Parent Portfolio Prompt

Build 3 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 3 categories/concepts you like — there is no fixed category assignment. Choose the 3 strongest ideas.

TOP PRIORITY — DESIGN & UI/UX (this outweighs every other consideration):
- Design and UI/UX quality is the single most important success criterion. An app that works but looks generic is a FAILURE here.
- Each app must have a world-class, distinctive visual identity: a deliberate color system, type scale, spacing system, iconography, and motion language — not stock SwiftUI defaults.
- Premium, polished, "Apple Design Award" caliber. Every screen considered: empty states, loading states, error states, transitions.
- Delightful, purposeful microinteractions and animation (haptics, spring transitions, meaningful state changes) — never gratuitous.
- Strong visual hierarchy, generous whitespace, real content density decisions, dark mode, Dynamic Type, and full accessibility (VoiceOver labels, 44pt targets, WCAG AA contrast).
- Each of the 3 apps must look and feel clearly DIFFERENT from the other two — three distinct design directions, not one template recolored.
- Include a documented design system per app (tokens, components, states) and make the built UI actually match it.

SECOND PRIORITY — COMPLEXITY & DEPTH (required):
- Each app must be genuinely COMPLEX and substantial — NOT a simple single-purpose utility or a weekend toy.
- Expect many interconnected features and screens, a real domain data model with relationships, non-trivial business logic and algorithms, meaningful state management, background work, and offline persistence with a clear sync-later architecture.
- Depth that rewards long-term daily use: robust settings, edge-case handling, empty/error/loading states everywhere, data import/export, and at least one genuinely hard technical capability done well.
- Aim for the scope a small team would build over months, not something trivial. Complexity must serve real user value — never complexity for its own sake.

Requirements:
1. Each app must go from 0 to production-ready, not just a few features.
2. Each app must be unique, useful, and commercially viable.
3. Each app must provide real end-user value.
4. Each app should have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
5. Each app should have viral potential (broad or niche) without sacrificing usefulness.
6. Each app should be better than its competitors in a meaningful way, especially on design and depth.
7. Each app should be local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace or before (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, and the ~50 apps of the prior batch such as aarti-path, afterglow, backtimer, batchbridge, chapterly, choicepoint, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, fastlane-po, flinch, heartline, kitbag, linernotes, longwave, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the three app efforts in parallel; keep discussion and design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Spend real effort in the design AND architecture phases — design discussion, design handoff, and technical architecture must be thorough and specific.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 8 candidate ideas, discuss them thoroughly with heavy weight on design potential AND depth, choose the best 3, and build all 3 to production quality with exceptional UI/UX and real complexity.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.


## Change requested — BUILD DID NOT PRODUCE AN APP
The pipeline finished but app_build has NO Xcode project and NO source files (the build workers were rate-limited). The full product/design/architecture work IS already done in this project's phase folders (design_discussion, design_handoff, tech_specs, ios_architecture_review, task_assignments). Now actually BUILD the app: create a complete, buildable Xcode project and implement the full app in Swift/SwiftUI per those specs and the design system — premium UI/UX and real feature depth as specified — until it COMPILES cleanly for the iOS Simulator. Do not stop until real source files exist and the build succeeds.
