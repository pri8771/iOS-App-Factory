PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp4
Selected app slug: scope-guard

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Scope Guard

Build mode: **MVP build**.
Build priority: **2**.

## App Name

Scope Guard

## Category

Freelance & Consulting Tools

## One-Sentence Promise

Paste in client messages and get scope-creep flagged with a drafted change order before you do unpaid work.

## Target User

Independent freelancers and small consultancies who lose money to informal scope creep buried in message threads.

## Painful Moment Solved

A client casually asks for 'one more small thing' and the freelancer must decide, under time pressure, whether that's billable.

## Why It Is Different

Intervenes before the unpaid work happens, at the moment the ask lands, instead of tracking time after the fact.

## Why Users Would Pay

Unlimited projects/clients and unlimited LLM extractions versus a capped free tier.

## Subscription Model

Free: 1 active project, 10 extractions/month. Paid (~$9.99/mo): unlimited projects and extractions, change-order templates, PDF export.

## Local-First MVP Scope

Local project/client records, pasted-text ingestion, on-device LLM extraction of deliverables vs. new asks, manual scope baseline, change-order draft generation, local export.

## Future Backend Roadmap

Repository protocol boundary now; later, optional email/Slack ingestion via cloud connector behind the same interface.

## AR / Local ML / Local LLM Fit

LLM extraction is the entire value proposition; ships an explicit non-LLM manual-tagging fallback for ineligible devices.

## Design Direction

Sharp, contract-grade, no-nonsense — legal document meets modern productivity app.

## App Store Positioning

Stop doing unpaid work you didn't agree to.

## Invalidation Criteria

If freelancers stop pasting messages after week one, or flags are routinely wrong, the mechanic needs rework.

## v1 Build Scope

Single-user local project/client management, manual scope baseline, paste-and-extract with LLM and manual fallback, change-order draft + export, full state coverage, StoreKit 2 paywall.

## Core Workflows

- define project scope baseline
- paste in new client message
- LLM flags in-scope vs out-of-scope asks
- review and edit flagged items
- generate change-order draft

## iOS-Native Features

- On-device Foundation Models framework
- Share extension from Mail/Messages
- Local document export
- Accessibility-first form-heavy UI

## Key Risks

- Devices without Apple Intelligence eligibility need a genuinely usable manual fallback
- Extraction quality needs validation against messy real-world phrasing

## Claude Design Handoff Prompt

Design a premium iOS app called Scope Guard for freelancers to catch client scope creep. Sharp contract-grade aesthetic, clear in-scope/flagged distinction, paste-in-message screen, review/flag screen, change-order draft preview. Include empty state and an on-device-AI-unavailable fallback state.

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


## Change requested
The app currently FAILS to compile for the iOS Simulator. Fix the build: resolve every compiler error until xcodebuild succeeds cleanly. Do not remove features to make it compile unless unavoidable.
