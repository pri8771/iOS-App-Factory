PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp4
Selected app slug: provenance

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Provenance

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Provenance

## Category

Collecting & Valuation

## One-Sentence Promise

Photograph what you collect and get insurance-grade condition, provenance, and value tracking without a spreadsheet.

## Target User

Serious collectors of high-value physical goods (watches, vinyl, trading cards, wine, sneakers) who currently track holdings in Notes or spreadsheets and have no real sense of aggregate value or condition history.

## Painful Moment Solved

You just bought or received a piece, you want to log it before the details slip your mind, and existing apps are single-category or spreadsheet-grade.

## Why It Is Different

Cross-category, condition-aware valuation over time with photographic condition history, and an actual exportable report insurers/appraisers can use.

## Why Users Would Pay

Ongoing market-value tracking and alerts, unlimited items/categories, and insurance-ready PDF export are gated behind the paid tier.

## Subscription Model

Free: manual catalog up to 25 items, no valuation tracking. Paid (~$6.99/mo or $59/yr): unlimited items, on-device photo-based item ID assist, value-over-time charts, insurance export.

## Local-First MVP Scope

SwiftData-backed local catalog, on-device Vision framework classification assist, manual condition/provenance fields, local value-history entries, PDF export via local rendering.

## Future Backend Roadmap

Repository protocol boundary now; later, optional cloud sync and an opt-in market-price feed behind the same interface.

## AR / Local ML / Local LLM Fit

On-device Vision-based item ID assist is integral to reducing cataloging friction; fully usable via manual entry if classification fails.

## Design Direction

Quiet, archival, museum-catalog aesthetic — dark neutral backgrounds, serif accents, photo-forward cards.

## App Store Positioning

The valuation ledger for people who collect things worth tracking.

## Invalidation Criteria

If users only ever use manual entry and value fields go unfilled, reposition as pure catalog+condition tracking.

## v1 Build Scope

Single-user local catalog, photo capture + classification assist, condition/provenance logging, manual value entries with history chart, PDF insurance export, full state coverage, StoreKit 2 paywall.

## Core Workflows

- capture item via photo
- assist-classify item type/model
- log condition, provenance, purchase price
- track value entries over time
- generate insurance export report

## iOS-Native Features

- Vision framework on-device classification
- Camera capture
- Files/document export
- Widgets for total collection value
- Dynamic Type/VoiceOver accessible detail views

## Key Risks

- On-device classification may misidentify niche items
- Value tracking depends on user-entered market data absent a live price feed

## Claude Design Handoff Prompt

Design a premium iOS collector's valuation app called Provenance. Archival/museum-catalog aesthetic, dark neutral background, serif display type, photo-forward item cards, condition timeline view, value-over-time chart screen. Include empty state, item detail screen, insurance-export preview.

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
