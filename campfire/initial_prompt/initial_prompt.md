PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp7
Selected app slug: campfire

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# Campfire

Build mode: **MVP build**.
Build priority: **3**.

## App Name

Campfire

## Category

Social Party / Icebreaker Game

## One-Sentence Promise

Pass one phone around a group and Campfire runs the icebreaker game, tallies the votes, and hands you a shareable results card.

## Target User

Groups of friends, family at a holiday gathering, a first date, new roommates, a work team at happy hour — anyone in a room together who wants a quick, no-download, no-account party game.

## Painful Moment Solved

Awkward silence at a group hangout, or reaching for a party-game app only to realize everyone needs to download it and make an account before the game can even start.

## Why It Is Different

Single-device pass-and-play — zero accounts, zero other installs, zero networking. One person opens it, picks a game mode, and the phone gets passed around; results render into a shareable recap card that acts as its own invite to next time.

## Why Users Would Pay

Free tier includes a rotating set of prompt packs; Campfire+ unlocks all prompt packs (family-friendly, spicy, work-safe, couples), custom prompt creation, and unlimited saved session recap cards.

## Subscription Model

Freemium, $2.99/mo or $19.99/yr — deliberately cheap as an impulse/occasion purchase.

## Local-First MVP Scope

All prompt packs and session history stored locally; no accounts or networking needed for the core loop at all.

## Future Backend Roadmap

Repository boundary allows an optional future server-hosted seasonal prompt pack downloader and, later, an opt-in synchronous multi-device mode — neither required for v1 value.

## AR / Local ML / Local LLM Fit

None — intentionally excluded; LLM-generated prompts would break the offline-anywhere promise for no real gain over a well-curated static prompt library.

## Design Direction

High-energy saturated party palette — campfire-orange to hot-pink gradients, bold rounded slab type, oversized tap targets for pass-the-phone play, playful bounce transitions, confetti-style haptic-synced reveals.

## App Store Positioning

The party game that starts in 5 seconds on one phone — no downloads for your friends, no account, just pass it around.

## Invalidation Criteria

If session recap cards get generated but essentially never shared, the viral loop isn't firing and the card design/moment needs rework before anything else.

## v1 Build Scope

3-4 game modes with real curated prompt packs, pass-and-play flow, end-of-session recap card + ShareLink, Campfire+ paywall with StoreKit.

## Core Workflows

- pick a game mode and player count/names
- run pass-the-phone rounds with prompts
- tally votes/answers per round
- generate & share end-of-session recap card
- browse/unlock prompt packs

## iOS-Native Features

- ShareLink for the recap card
- haptics tuned per game mode
- fully on-device, airplane-mode-proof by design

## Key Risks

- Prompt content quality/appropriateness is the entire product — needs genuinely well-written, tested prompt packs at launch, not placeholder text
- One-off occasion-based usage makes retention harder than daily-habit apps — recap-card sharing is the main lever to bring people back

## Claude Design Handoff Prompt

Design a high-energy party/icebreaker game app called Campfire: saturated campfire-orange to hot-pink gradients, bold rounded slab typography, oversized tap targets for pass-the-phone play, playful spring/bounce transitions, a confetti-style reveal moment at the end of each round, feels like a fun physical party prop, not a utility app.

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
