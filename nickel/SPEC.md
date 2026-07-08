# Nickel

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Nickel

## Category

Personal Finance / Spending Awareness

## One-Sentence Promise

See where your money actually went this week without linking a single bank account.

## Target User

Anyone who feels vaguely anxious about spending but has bounced off budgeting apps that demand bank-linking and categorization homework — students, young professionals, anyone living paycheck-to-paycheck or just habit-forming with money.

## Painful Moment Solved

Checking your bank balance on a Sunday night with no idea where the money went, then opening a budgeting app that wants your bank login before it'll tell you anything.

## Why It Is Different

No bank-linking wall — log a spend in under 5 seconds (amount, one-tap category, optional receipt photo) and get an auto-generated shareable weekly 'money weather' recap card instead of a spreadsheet.

## Why Users Would Pay

Free tier covers manual logging and the weekly recap card forever; Nickel+ unlocks unlimited categories/tags, multi-month trend charts, CSV export, and a live week-to-date widget.

## Subscription Model

Freemium, $3.99/mo or $24.99/yr for Nickel+; free tier is fully usable, not a trial.

## Local-First MVP Scope

SwiftData for all entries on-device; recap card rendered locally via ImageRenderer; CSV export/import for backup.

## Future Backend Roadmap

Repository-protocol boundary over the data store so CloudKit sync and an optional bank-import data source can be added later without touching the UI or domain model.

## AR / Local ML / Local LLM Fit

None load-bearing; Vision OCR for receipt scanning is a plausible v2, not required for v1.

## Design Direction

Warm editorial paper-and-ink system — cream backgrounds, burnt-orange accent, serif numerals for amounts, soft paper-grain texture, weather-metaphor iconography for the recap score.

## App Store Positioning

The spending tracker with no bank-linking wall — log it in 5 seconds, see your money weather every week.

## Invalidation Criteria

If manual logging drops below ~2 entries/week for most users even with the widget nudge, the core loop is too much friction and needs a lighter capture method (e.g. Shortcuts/Siri quick-log) before anything else.

## v1 Build Scope

Log spend, category browsing, weekly recap card + ShareLink, widget, CSV export, Nickel+ paywall with StoreKit.

## Core Workflows

- log a spend in 3 taps
- browse spend history by category/week
- generate & share weekly recap card
- set soft weekly targets per category
- export/import CSV

## iOS-Native Features

- WidgetKit week-to-date spend widget
- ShareLink for recap card
- ImageRenderer for card generation
- PhotosPicker for optional receipt photo

## Key Risks

- Manual entry has natural drop-off risk vs. auto-imported transactions — mitigate with a <5-second logging flow and a persistent widget nudge
- Totals are only as complete as what's logged — must show 'logged spend' honestly rather than implying full completeness
