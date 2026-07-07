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
