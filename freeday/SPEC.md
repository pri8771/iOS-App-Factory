# Freeday

Build mode: **MVP build**.
Build priority: **5**.

## App Name

Freeday

## Category

Habit Quitting / Craving Tracker

## One-Sentence Promise

Track any habit you're quitting — cigarettes, vaping, sugar, doomscrolling — and watch your clean streak and money saved grow, one Freeday at a time.

## Target User

The enormous population trying to quit or cut back on something — smokers, vapers, people cutting sugar or alcohol, people breaking a doomscrolling habit — a mass-market need spanning age and background.

## Painful Moment Solved

Wanting to quit something and having only single-purpose apps that don't talk to each other, plus feeling alone in the moment of a craving with no quick, non-judgmental tool to ride it out.

## Why It Is Different

One flexible engine works for any habit instead of a dozen single-purpose cessation apps — name your habit, log a cost-per-use, and Freeday tracks streak and running savings, with a 90-second guided 'ride the craving' moment when tempted, ending in a shareable milestone card ('47 days, $310 saved') tuned for social sharing rather than clinical tracking.

## Why Users Would Pay

Free tier covers one habit, streak tracking, and milestone cards; Freeday+ unlocks unlimited simultaneous habits, the full craving-support toolkit, and a Lock Screen craving-timer Live Activity.

## Subscription Model

Freemium, $4.99/mo or $29.99/yr — positioned as cheaper than one week of the habit itself, stated explicitly in the paywall copy.

## Local-First MVP Scope

SwiftData store for habits, relapse/reset events, and craving-session logs; savings math computed on-device; all guided craving-support content bundled locally, no network dependency.

## Future Backend Roadmap

Repository boundary allows CloudKit sync later; an opt-in anonymous community layer is a plausible v2 but explicitly out of scope for v1 to avoid backend/moderation overhead.

## AR / Local ML / Local LLM Fit

None; explicitly not using LLM chat-based coaching — the craving-support flow is a fixed, well-designed guided sequence that must work instantly and offline.

## Design Direction

Clean, encouraging, and light — soft mint-to-sky-blue gradient system, rounded friendly iconography, a sunrise/counter motif for 'days free,' deliberately non-clinical, non-shaming tone.

## App Store Positioning

One app for quitting anything — not just cigarettes. Track your streak, watch your savings grow, and get through the next craving without white-knuckling it alone.

## Invalidation Criteria

If most users who log a relapse never open the app again within a week, the reset/relapse flow is driving shame-based abandonment and needs a redesign before any other feature work.

## v1 Build Scope

Habit setup with cost-per-use, daily streak tracking with non-punitive reset, craving-timer guided flow, milestone recap card + ShareLink, widget, Freeday+ paywall with StoreKit.

## Core Workflows

- set up a habit with cost-per-use
- daily check-in / streak tracking with one-tap non-punitive relapse-and-restart
- in-the-moment craving timer with guided ride-it-out flow
- milestone streak + savings recap card
- manage multiple concurrent habits (paid tier)

## iOS-Native Features

- Live Activity for an active craving-timer session
- WidgetKit showing current streak + savings
- ShareLink for milestone card
- haptics for streak-day and craving-timer completion

## Key Risks

- Relapse handling is the make-or-break UX moment — punitive 'streak broken, back to zero' framing will cause uninstalls; needs a genuinely non-shaming reset flow with a preserved lifetime-total stat from day one
- This category brushes against health claims — copy must stay in the 'personal tracking tool' lane, not present as medical/addiction treatment advice
