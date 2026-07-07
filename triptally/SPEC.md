# TripTally

Build mode: **MVP build**.
Build priority: **5**.

## App Name

TripTally

## Category

Travel

## One-Sentence Promise

A trip-specific shared expense ledger that handles multiple currencies and settles up without everyone needing the app or being online.

## Target User

Groups of friends or family splitting costs across a multi-day, multi-currency trip.

## Painful Moment Solved

Generic expense splitters aren't trip-aware — no day-by-day view, no currency-at-time-of-purchase handling, and everyone must be online with the same app.

## Why It Is Different

A trip-day timeline view of spending with manually-entered, locked-at-time exchange rates (no live FX dependency), letting one organizer log for the whole group and export a settle-up summary via Messages/PDF.

## Why Users Would Pay

Multiple simultaneous trips, receipt photo OCR, multi-organizer collaborative editing via exchanged trip files, detailed spend-by-category reports.

## Subscription Model

Free: 1 active trip, manual entry only. Paid: unlimited trips, OCR receipts, detailed reports.

## Local-First MVP Scope

Fully local ledger per trip; sharing/settling via exported summary (share sheet/PDF/text), not live multi-device sync.

## Future Backend Roadmap

Real-time shared ledger via CloudKit sharing so multiple people edit the same trip live.

## AR / Local ML / Local LLM Fit

On-device Vision OCR for receipt photo capture of amount and currency.

## Design Direction

Clean financial-editorial look, currency-forward typography, a trip-day timeline as the visual centerpiece.

## App Store Positioning

The trip expense ledger built for real multi-currency, multi-day travel — not a generic bill splitter.

## Invalidation Criteria

If organizers churn mid-trip at a high rate, the single-logger dependency fails and needs a faster, lighter capture flow.

## v1 Build Scope

Trip/traveler setup, expense logging with currency, day timeline, settle-up calculation, export summary.

## Core Workflows

- Create trip and travelers
- Log an expense with currency and split
- View day-by-day spend timeline
- View settle-up summary
- Export/share the summary

## iOS-Native Features

- Widgets for current trip spend
- Live Activities for active trip-day spend total
- App Intents for quick expense logging

## Key Risks

- Value depends on one diligent organizer logging for the group
- Manually-entered exchange rates must be clearly labeled as user-entered, not live
- Risk of reading as 'just Splitwise for trips' if execution doesn't distinguish it
