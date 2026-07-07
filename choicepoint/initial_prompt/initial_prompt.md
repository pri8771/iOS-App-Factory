PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: choicepoint

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Choicepoint

Build mode: **MVP build**.
Build priority: **7**.

## App Name

Choicepoint

## Category

Utilities

## One-Sentence Promise

Captures your reasoning and prediction at the moment of a real decision, then reminds you to check whether you were right.

## Target User

People making recurring, consequential personal or professional decisions who want to improve their judgment over time.

## Painful Moment Solved

Making an important decision, forgetting the reasoning within weeks, and never learning if it was actually a good call.

## Why It Is Different

A judgment-improvement tool, not a habit tracker: timestamped decision-and-prediction capture paired with a scheduled future revisit that surfaces your own past reasoning for calibration.

## Why Users Would Pay

Unlimited decisions tracked, calibration analytics (how often predictions were right), custom revisit schedules, export for professional reflection.

## Subscription Model

Free: 5 active decisions tracked. Paid: unlimited plus analytics and export.

## Local-First MVP Scope

Fully on-device decision log with local-notification-based revisit prompts.

## Future Backend Roadmap

Optional cloud sync/backup; potential shared decision journals for co-founders or partners deciding together.

## AR / Local ML / Local LLM Fit

Optional on-device LLM to structure a rambling voice note into a clean decision record.

## Design Direction

Calm, restrained, ledger-like typography with no gamification or badges — feels serious and premium.

## App Store Positioning

A journal for your decisions — not your habits. See if your judgment actually improves.

## Invalidation Criteria

If revisit completion stays low after onboarding tuning, drop the calibration claim and pivot to pure decision-logging.

## v1 Build Scope

Decision capture, revisit scheduling/notifications, outcome logging, basic calibration stats.

## Core Workflows

- Log a decision (context, options, prediction, confidence)
- Set a revisit date
- Get reminded to revisit and record the actual outcome
- View calibration stats over time

## iOS-Native Features

- Local notifications for revisit prompts
- Widgets showing upcoming revisits
- App Intents/Siri for quick decision capture

## Key Risks

- Logging a decision in the moment must be fast or it won't happen
- Low revisit completion would undermine the entire calibration promise

## Claude Design Handoff Prompt

Design a calm, ledger-inspired decision journal: a fast decision-capture form, a quiet upcoming-revisits list, and a restrained calibration-stats view with no game mechanics.

## Parent Portfolio Prompt

Build 9 completely separate production-ready iOS apps at the same time: exactly 3 Social Networking apps, 3 Travel apps, and 3 Utilities apps.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 18 candidate ideas, discuss them thoroughly, choose the best 9, and build all 9 to production quality.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
