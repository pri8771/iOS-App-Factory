PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: somna

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Somna

Build mode: **MVP build**.
Build priority: **2**.

## App Name

Somna

## Category

Sleep & Morning Energy

## One-Sentence Promise

Log your sleep and how you feel each morning, and Somna shows you exactly what actually helps you feel rested.

## Target User

Anyone who's tired and curious why some mornings feel great and others don't, without wanting to wear a sleep-tracking ring or let an app record audio all night — students, parents, shift workers, broadly anyone.

## Painful Moment Solved

Waking up exhausted despite 'enough' sleep with no idea whether it was the late coffee, the doomscrolling, or the stress — and existing sleep apps just show a graph with no explanation.

## Why It Is Different

Pairs a 10-second bedtime/wake log with a 10-second morning mood+energy check-in, then surfaces plain-English on-device correlations ('you feel 34% more rested after 7+ hours') instead of raw sleep-stage graphs.

## Why Users Would Pay

Free tier covers logging, streaks, and the weekly recap card; Somna+ unlocks the full correlation engine (caffeine/exercise/screen-time tags vs. sleep quality), unlimited history, and a bedtime Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr for Somna+.

## Local-First MVP Scope

SwiftData for nightly logs and morning check-ins; correlation engine computed on-device; optional read-only HealthKit import of sleep duration, never a requirement.

## Future Backend Roadmap

Repository boundary allows swapping the local store for CloudKit sync later; correlation engine stays fully on-device regardless of sync status for privacy.

## AR / Local ML / Local LLM Fit

None required; the correlation engine is simple on-device statistics, the honest and battery-safe choice over sensor-heavy sleep-staging.

## Design Direction

Nocturnal calm gradient system — deep indigo-to-violet dusk gradients lightening toward soft dawn tones in daytime views, soft-glow rounded components, a moon-phase mark, restful rather than clinical.

## App Store Positioning

Not another sleep-stage graph — Somna tells you what actually helped you feel rested, no ring or overnight mic required.

## Invalidation Criteria

If users keep the bedtime log but stop doing the morning check-in after week 2, the correlation engine has no fuel — signals the check-in flow needs to get shorter or gamified.

## v1 Build Scope

Bedtime/wake logging, morning check-in, weekly recap card + widget, on-device rule-based correlation insights, Somna+ paywall with StoreKit.

## Core Workflows

- log bedtime & wake time
- morning mood/energy check-in with optional tags
- view weekly sleep recap card
- browse plain-English correlation insights
- optional read-only HealthKit import

## iOS-Native Features

- Live Activity for tonight's bedtime countdown
- WidgetKit showing last night's score + tonight's target bedtime
- HealthKit read-only (optional)
- ShareLink for recap card

## Key Risks

- Correlation insights need weeks of data before they're meaningful — needs an honest 'still learning' partial state, not false-confidence insights early
- Read-only HealthKit import is a bonus only — must fully function without HealthKit permission granted

## Claude Design Handoff Prompt

Design a calm sleep & morning-energy app called Somna: deep indigo-to-violet gradient backgrounds that lighten toward soft dawn tones in daytime views, soft-glow rounded cards, a moon-phase mark as the icon motif, minimal typography, restful and quiet rather than clinical or data-dense.

## Parent Portfolio Prompt

Build 5 completely separate, production-ready iOS apps at the same time.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app, never bundled together.

Pick any 5 categories/concepts — no fixed assignment. Choose the 5 strongest MASS-MARKET ideas.

TOP PRIORITY — VIRAL, MASS-MARKET APPEAL (hard requirement):
- Every app must target a BROAD, mainstream audience. NO niche-community apps (no hobbyist tools, no professional verticals, no special-interest utilities). If your parents, your barista, and a college student wouldn't all instantly get it, it fails.
- Each app must have a built-in viral loop: something people naturally share, screenshot, send to friends, or compete over (shareable results/cards, streaks, challenges, comparisons, "send this to a friend" moments).
- The concept must be explainable in one sentence and demo-able in 10 seconds.
- Think the scale of habit trackers, photo tools, social utilities, everyday life tools, casual self-improvement, money, food, sleep, relationships, entertainment — things with tens of millions of potential users.

SECOND PRIORITY — DESIGN & UI/UX:
- World-class, distinctive visual identity per app: deliberate color system, type scale, spacing, iconography, motion language — not stock SwiftUI defaults.
- "Apple Design Award" caliber polish. Every screen considered: empty, loading, error states, transitions, haptics, spring animations.
- Dark mode, Dynamic Type, accessibility (VoiceOver, 44pt targets, WCAG AA contrast).
- Each of the 5 apps must look clearly DIFFERENT from the other four — five distinct design directions.
- Documented design system per app (tokens, components, states); built UI must match it.

THIRD PRIORITY — COMPLEXITY & DEPTH:
- Genuinely substantial apps — interconnected features, real domain data model, non-trivial logic, offline persistence with sync-later architecture, robust settings, import/export, and at least one hard technical capability done well.
- Depth that rewards daily use — but never at the expense of instant mass-market clarity.

FOURTH PRIORITY — MONETIZATION:
- Clear, sustainable revenue path per app (subscription tiers, IAP, premium) that feels native to the product, never punitive. Free tier hooks users; paid tier is compelling.

General Requirements:
1. Each app goes from 0 to production-ready.
2. Each app must be unique, useful, and commercially viable, better than competitors in a meaningful way.
3. Local-first, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built in this workspace: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, brinekeeper, chalkline, quietpilot, cistern, thicket, undersong, undertow, heddle, marginalia, skyglass, and the ~50 apps of prior batches (aarti-path, afterglow, backtimer, chapterly, cleanline, clearpath-access, crockwatch, crosswire, crux-cycle, curio, dayframe, dharma-trail, docket, flinch, heartline, kitbag, night-sky-logbook, pattern-pulse, pillcheck, referral-loop, risk-compass, rollcall, runway, scenario-ledger, shelf, sincerely, tabzero, talkthrough, tessella, throughline, trestle, triptally, umbra, wordsmith-atlas, and others).
- Produce differentiated concepts even if a category overlaps.

Bonus points (optional, only when integral): unique use of LLMs, AR, or ML.

Build rules:
- Run the five app efforts in parallel; keep phases separate per app.
- TIME MATTERS on this batch: reach consensus quickly in discussion phases (end phases early on agreement), but never skip the build, and never mark an app done unless a real, compiling Xcode project with full source exists in app_build. An app without a buildable Xcode project is a FAILURE.
- Save all phase discussions; combine each app's transcript into a .txt at the end.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 10 candidate ideas, judge them primarily on mass-market viral potential, choose the best 5, and build all 5 to production quality with exceptional UI/UX.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
