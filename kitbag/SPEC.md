# Kitbag

Build mode: **MVP build**.
Build priority: **4**.

## App Name

Kitbag

## Category

Travel

## One-Sentence Promise

A packing list that learns from your own trip history instead of handing you a generic template.

## Target User

Frequent travelers who over- or under-pack and want a personal system rather than a one-size-fits-all checklist.

## Painful Moment Solved

Staring at a blank generic packing checklist the night before a trip and forgetting the same things every time.

## Why It Is Different

Builds lists from your own packing/usage history captured via a quick post-trip review, and uses bundled offline climate-normal data by month and region instead of a live weather feed.

## Why Users Would Pay

Unlimited trip history, deeper post-trip analytics, list export/share to travel companions, premium curated templates for niche trip types.

## Subscription Model

Free: 3 trips of history, basic list. Paid: unlimited history/analytics/premium templates.

## Local-First MVP Scope

Entirely on-device trip and packing history, with a bundled offline climate-normal reference table.

## Future Backend Roadmap

Optional cloud backup/sync of trip history; potential live-weather enhancement layered on later, never required.

## AR / Local ML / Local LLM Fit

On-device weighting of list suggestions from personal packing history; optional on-device LLM phrasing of suggestions.

## Design Direction

Crisp, modern travel-editorial look with destination-photo headers — a boutique travel planner, not a generic checklist app.

## App Store Positioning

The packing list that actually learns from you — not a generic template.

## Invalidation Criteria

If post-trip review completion stays very low, the self-improving loop can't function and the app should be redesigned around a faster review prompt.

## v1 Build Scope

Trip creation, smart default list by type/region, checklist UI, post-trip review, personal insights.

## Core Workflows

- Create a trip (destination, dates, type)
- Generate a smart packing list
- Check off items while packing
- Post-trip review of what went unused
- Browse personal packing insights over time

## iOS-Native Features

- Widgets for days-until-trip and packing progress
- Live Activities for an active packing session
- App Intents/Siri to add items by voice

## Key Risks

- First trip has no history to learn from, so v1 must be useful with zero history via smart defaults
- Climate-normal data must be clearly labeled as historical averages, not a forecast
