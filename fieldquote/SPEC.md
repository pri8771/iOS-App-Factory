# FieldQuote

Build mode: **MVP build**.
Build priority: **2**.

## App Name

FieldQuote

## Category

Business

## One-Sentence Promise

Create clean, client-ready estimates from templates, measurements, and photos before you leave the job site.

## Target User

Solo contractors and home-service operators who scope jobs in person and need to turn a walkthrough into a professional estimate fast.

## Painful Moment Solved

You finish a walkthrough, drive away with half-remembered details, and lose the job or the margin because the estimate is late or misses line items.

## Why It Is Different

Not a CRM, invoicing tool, or project manager — a focused jobsite quoting tool built around room-level notes, reusable scopes, measurements, tiered options, and immediate client-ready output on the spot.

## Why Users Would Pay

Faster turnaround and fewer missed line items pay for the subscription on the very first job; a durable local library of templates and past quotes makes every future estimate faster than the last.

## Subscription Model

Freemium with limited active jobs/templates; subscription unlocks unlimited quotes, branded PDF export, template libraries, tiered options, and full history.

## Local-First MVP Scope

Local client/job records, room notes with photos and measurements, reusable line-item templates, quote builder with good-better-best options, branded PDF export/share, follow-up reminders, settings/paywall.

## Future Backend Roadmap

Optional device sync, team handoff, shared pricing libraries, and accounting/invoicing integrations later.

## AR / Local ML / Local LLM Fit

No LLM or AR required in v1; on-device OCR for model numbers/handwritten notes is a possible later addition only if it clearly saves time.

## Design Direction

Confident, precise, field-ready — high-contrast hierarchy, fast one-handed entry, crisp pricing tables, restrained industrial accents that look credible in front of a client.

## App Store Positioning

A premium offline quoting tool for independent pros who need to turn a site visit into a professional estimate before they leave the driveway.

## Invalidation Criteria

If producing a presentable estimate on-site takes longer than jotting numbers in Notes and texting the client later, the app has no reason to exist.

## v1 Build Scope

Job list, client/job detail, room capture, templates and line items, quote builder with tiered options, PDF preview/export/share, reminders, settings/paywall, full empty/loading/success/error coverage.

## Core Workflows

- Start a job record during or right before a site visit
- Capture room notes, measurements, and photos locally
- Assemble an estimate from reusable templates and editable line items
- Offer tiered options on the spot
- Export and share a branded PDF estimate before leaving

## iOS-Native Features

- SwiftData local persistence
- Camera capture for room/issue photos
- PDFKit export and share sheet
- App Intents for quick new-quote actions
- Interactive widgets for pending follow-ups
- Local notifications for quote follow-up

## Key Risks

- Scope creep into a full CRM or invoicing suite would dilute the core promise
- Weak PDF output undermines credibility at the exact moment monetization depends on it
- Some users will expect team sync or accounting integration sooner than v1 supports
