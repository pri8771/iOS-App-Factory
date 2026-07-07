# Returnwise

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Returnwise

## Category

shopping-admin

## One-Sentence Promise

Never lose money to missed return windows or forgotten warranties again.

## Target User

Frequent online and in-store shoppers who buy enough that return deadlines and warranty terms become easy to miss.

## Painful Moment Solved

The user realizes an item is wrong or broken and cannot quickly tell whether they can still return or claim it.

## Why It Is Different

Focuses on deadline leverage and proof readiness, not generic receipt storage or expense tracking.

## Why Users Would Pay

Directly saves money by surfacing deadlines, documents, and next actions before options expire.

## Subscription Model

Free tier for a small number of tracked purchases; premium for unlimited tracking, smart reminders, warranty folders, and return evidence exports.

## Local-First MVP Scope

Receipt scan/import, purchase records, deadline calculations, reminder schedules, warranty docs, exportable return packets on-device.

## Future Backend Roadmap

Email receipt sync, merchant integrations, household sharing, optional cross-device sync.

## AR / Local ML / Local LLM Fit

ML/OCR is integral for extracting merchant, date, and totals from receipts; no LLM dependency required.

## Design Direction

Sharp, deadline-aware interface with strong calendar cues and clear status labeling.

## App Store Positioning

A premium receipt and warranty app built around action, not archiving.

## Invalidation Criteria

If users still need to manually read every receipt to know what to do, the product isn't differentiated enough.

## v1 Build Scope

Local purchase tracking with receipt scan/import, editable extracted fields, deadline engine, reminder center, exportable proof bundle, onboarding, paywall, tests.

## Core Workflows

- Scan or import a receipt
- Track return and warranty deadlines
- Assemble a merchant-ready return packet

## iOS-Native Features

- Vision text extraction
- Document scanner
- Notifications
- Widgets for upcoming deadlines
- Share extension for imported receipts

## Key Risks

- OCR quality and correction UX must be strong enough for trust
- Could slide toward generic expense tracking if return actions are weak
