# Truescale

Build mode: **MVP build**.
Build priority: **2**.

## App Name

Truescale

## Category

professional field tool / AR-assisted documentation

## One-Sentence Promise

Truescale captures site issues faster than camera-plus-notes and turns them into structured, client-ready reports — with true-to-scale AR measurement attached to every photo on supported devices.

## Target User

Independent contractors, home inspectors, property managers, insurance adjusters, and punch-list-oriented design/renovation professionals documenting issues on-site from an iPhone.

## Painful Moment Solved

Field documentation today means switching between a camera, a separate measuring tool, and a notes app, then rebuilding a structured report at a desk — or paying for team-collaboration SaaS (CompanyCam, Fieldwire) that bills per seat and assumes a company account even for a solo operator.

## Why It Is Different

The foundation is a complete, fast, structured capture-and-report tool that already beats camera-plus-notes and undercuts per-seat SaaS pricing for solo users, fully functional with manual measurement entry alone. On top of that, on supported hardware it attaches a true-to-scale AR/LiDAR measurement directly to each photo — a capability gap no competitor offers at any price, never a dependency the app needs to function.

## Why Users Would Pay

Free tier caps active projects per month; paid tier removes the cap and unlocks custom report branding, richer export formats, and AR-measured capture on supported devices — ongoing value is unlimited professional output plus a precision feature no free tool offers.

## Subscription Model

$14.99/mo or $119/yr Pro: unlimited projects, custom report branding, advanced PDF/CSV export, AR measurement capture, priority updates. Free tier: 2 active projects/month, manual measurement entry only.

## Local-First MVP Scope

Offline project creation, area/room grouping, issue capture with photo plus structured metadata (severity, status), manual measurement entry as the default input, optional AR/LiDAR measurement on supported devices, structured branded PDF report generation, project library, filtering and history — all on-device.

## Future Backend Roadmap

Optional cloud backup/sync for device loss protection; team collaboration, client portals, and signed reports later as explicit opt-ins without changing the local project/observation model.

## AR / Local ML / Local LLM Fit

AR measurement is an additive precision layer, not a dependency — the app is complete and production-ready without it. Where available (iPhone 12 Pro+), it's a genuine capability gap versus every existing competitor. No LLM needed for v1.

## Design Direction

Crisp, technical, trustworthy, 'instrument panel' feel — strong hierarchy, large touch targets, bright-light legibility, glove-friendly one-handed capture.

## App Store Positioning

The fastest way to document site issues and send clean, accurately measured reports from your iPhone — no team account required.

## Invalidation Criteria

Kill or descope AR if measurement accuracy can't be validated within professional tolerance — the base app still stands alone. Kill the whole product if structured capture isn't clearly faster/cleaner than camera-plus-notes, or reports feel too amateur to send to a client.

## v1 Build Scope

Project creation, area/room grouping, structured issue capture (photo, severity, status, manual or AR measurement), branded PDF report generation, project library, filtering/history, subscription paywall with free-tier project cap and restore flow.

## Core Workflows

- create a project and define site areas or rooms
- capture an issue with photo, note, severity, and status in seconds, with measurement entered manually or via AR on supported devices
- review observations by area, urgency, or status
- auto-generate a structured branded PDF report and export it from the phone

## iOS-Native Features

- Camera capture
- ARKit/RoomPlan and LiDAR-based measurement (supported devices only)
- PDFKit report generation
- Files app and share sheet export
- location stamping
- App Intents for quick project start

## Key Risks

- AR measurement accuracy must be validated within professional tolerance on supported hardware before being sold as a headline feature; if it slips, the app still ships and sells on capture speed and export quality alone
- fails if structured capture (with or without AR) isn't materially faster and cleaner than camera-plus-notes
- scope can bloat into inspection/compliance software if tagging isn't kept narrow
- real competitor may be the professional's existing multi-app habit, not another single app
