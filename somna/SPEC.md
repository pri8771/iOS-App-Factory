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
