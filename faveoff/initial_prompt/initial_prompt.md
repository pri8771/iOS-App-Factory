PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: faveoff

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# FaveOff

Build mode: **MVP build**.
Build priority: **4**.

## App Name

FaveOff

## Category

Entertainment / Taste Ranking

## One-Sentence Promise

Rank the movies and shows you've watched head-to-head, and FaveOff builds your real, personal top 10 — then turns it into a shareable taste card.

## Target User

Anyone who watches movies/shows and has opinions but finds star ratings meaningless and social-network movie apps like overhead — mass-market watchers, not cinephile completionists.

## Painful Moment Solved

Rating a movie 1-5 stars and realizing that number means nothing next to the 40 other movies you've also rated 4 stars — you genuinely don't know your own top 10.

## Why It Is Different

Instead of star ratings, shows two watched titles and asks which was better, building an Elo-style ranked list from a handful of quick head-to-head picks — far more decisive than star ratings, ending in a poster-grid 'Taste Card' built for sharing, with zero social graph or account required to get value.

## Why Users Would Pay

Free tier ranks movies only with a capped list length; FaveOff+ unlocks TV shows and music/albums as separate ranking tracks, unlimited list length, genre-filtered sub-rankings, and periodic 'Wrapped'-style recap cards.

## Subscription Model

Freemium, $3.99/mo or $24.99/yr.

## Local-First MVP Scope

SwiftData store for titles, comparisons, and computed rankings; ranking algorithm runs fully on-device; title/poster metadata lookup is the one network dependency, isolated behind a protocol.

## Future Backend Roadmap

Repository boundary allows CloudKit sync across devices and, later, an optional social taste-comparison layer without touching the core ranking engine.

## AR / Local ML / Local LLM Fit

None load-bearing; the hard technical capability is a proper Elo/merge-sort-style pairwise ranking engine, not ML.

## Design Direction

Cinematic dark-mode-first system — near-black backgrounds, marquee-red accent, bold condensed poster-style typography, poster artwork as the dominant visual element, film-reel-inspired transitions.

## App Store Positioning

Star ratings lie to you. FaveOff makes you pick, one match-up at a time, until your real top 10 falls out.

## Invalidation Criteria

If users abandon mid-ranking after only a handful of comparisons and never reach a shareable top-10, the comparison flow is too tedious and needs a faster convergence algorithm or smaller default list size.

## v1 Build Scope

Add titles (movies+TV), head-to-head ranking engine, ranked list view, Taste Card generation + ShareLink, FaveOff+ paywall with StoreKit.

## Core Workflows

- add a watched title
- head-to-head comparison rounds
- browse computed ranked list
- generate & share Taste Card (poster grid of top 10)
- filter rankings by genre/decade

## iOS-Native Features

- ShareLink for Taste Card
- ImageRenderer for poster-grid card generation
- WidgetKit small widget showing current #1

## Key Risks

- The one network touchpoint (title/poster lookup) must degrade gracefully offline (initials/color-block placeholder), never blocking the core ranking loop
- Comparison fatigue on large libraries — needs a smart pairing algorithm scaling ~n log n, not full round-robin n²

## Claude Design Handoff Prompt

Design a cinematic entertainment-ranking app called FaveOff: near-black dark-mode-first backgrounds, marquee-red accent, bold condensed poster-style typography, movie/show poster art as the dominant visual content, film-reel-inspired swipe/transition motion for head-to-head comparison screens, feels like a red-carpet awards show, not a spreadsheet.

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
