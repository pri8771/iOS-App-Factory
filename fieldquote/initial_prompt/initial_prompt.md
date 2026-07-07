PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp
Selected app slug: fieldquote

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium iPhone business app called FieldQuote for solo contractors and home-service pros. It must feel trustworthy, fast, and jobsite-ready, not corporate or bloated. Optimize for one-handed data entry during a walkthrough, quick assembly of reusable line-item scopes, clear tiered pricing breakdowns, and a polished client-facing PDF output screen. Strong hierarchy, practical spacing, durable typography, a restrained visual system that reads as a serious tool a pro would confidently hand to a customer.

## Parent Portfolio Prompt

You are an elite iOS product strategy, design, and engineering system.

I want exactly 2 completely different iOS apps built from 0 to production readiness.

Categories:
- Choose any 2 categories from:
  Business
  Finance
  Food & Drink
  Graphics & Design
  Health & Fitness
  Medical
  Navigation
  News
  Photo & Video
  Productivity
  Reference
  Social Networking
  Travel
  Utilities

Core requirements for each app:
1. It must be unique within its category and meaningfully different from existing competitors.
2. It must provide real value to the end user.
3. It must be something users would genuinely pay a subscription for because the subscription delivers real ongoing utility, not cosmetic upgrades.
4. It must be beautifully designed, polished, and feel world-class.
5. It must have the potential to go viral, either broadly or within a niche market.
6. It must be strong enough to eventually become the best product in its category.
7. It must be local-first for this version, but designed so it can be extended to a cloud-backed architecture later if needed.
8. It must be a real product, not a gimmick, toy, or thin wrapper around an API.
9. It must be feasible as a premium iOS app experience.
10. Each app must be production-ready in scope and thinking, not just a concept, feature list, prototype, or spec.

Important constraints:
- Build 2 apps, not 1.
- These should be two separate apps, each in its own folder/project.
- Do not merge the ideas together.
- Do not reduce this to “one built app and one spec.”
- Both selected apps should go through the full app-building process.
- The ideas should be independent and strong on their own.
- Do not choose ideas just because they contain AI, AR, or ML.
- If LLM, AR, or ML is used, it must create real user value and be justified by the product.

Bonus points only if they provide genuine value:
1. Unique use of LLMs
2. Unique use of AR
3. Unique use of ML

Process requirements:
1. Start by restating my original prompt clearly and preserving its intent.
2. Do a serious research/discussion phase before locking the app choices.
3. Generate a strong pool of candidate ideas first.
4. The agents should give real opinions, not just build on each other passively.
5. Then select the best 2 apps.
6. After selection, each chosen app must be treated as its own full product and built separately.
7. Every later phase must build on prior discussion and use the full context from earlier phases.
8. Documentation must be extremely detailed.
9. Save all discussions, decisions, and phase outputs.
10. At the end, produce a full transcript artifact.

For each selected app, optimize for:
- premium UX
- clear monetization
- strong retention
- high practical value
- elegant local-first architecture
- excellent iOS-native experience
- differentiation from competitors
- App Store viability
- subscription-worthy usefulness

Design requirement:
At some point, produce a high-quality Claude Design handoff prompt for each app so the design can be taken further externally if needed.

Final instruction:
Select exactly 2 apps and build both as full, separate, production-ready iOS app projects.
