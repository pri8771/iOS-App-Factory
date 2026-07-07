# Rollcall

Build mode: **MVP build**.
Build priority: **9**.

## App Name

Rollcall

## Category

Utilities

## One-Sentence Promise

A shooting log and on-device light meter for film photographers, so every roll comes back matched to the settings you actually used.

## Target User

Film photography hobbyists shooting manual cameras with no metadata, who struggle to remember settings per frame.

## Painful Moment Solved

Getting a developed roll back weeks later with no idea what aperture/shutter/ISO combo was used on which frame, losing the chance to learn from it.

## Why It Is Different

Combines a fast per-frame logging flow with an on-device camera-based incident light meter using Vision/Core Image luminance analysis — a distinct hobbyist workflow, not a general measurement or object-history tool.

## Why Users Would Pay

Unlimited rolls/cameras tracked, advanced spot/incident metering presets per film stock, scan-matching to attach developed negatives later, shooting analytics.

## Subscription Model

Free: 2 active rolls, basic light meter. Paid: unlimited rolls, advanced metering, scan matching, analytics.

## Local-First MVP Scope

Entirely on-device roll/frame log and camera-based light meter computation.

## Future Backend Roadmap

Optional cloud backup/sync across devices; potential future community film-stock preset database.

## AR / Local ML / Local LLM Fit

On-device Vision/Core Image luminance analysis for the light meter — the clean, non-forced ML fit for this batch.

## Design Direction

Tactile, analog-inspired premium design — film-stock color swatches, dial/gauge-style meter UI, feels like a well-made physical accessory.

## App Store Positioning

The shooting log made for film — meter your light, log your frame, never lose a setting again.

## Invalidation Criteria

If the light-meter feature is rarely used and manual logging alone doesn't retain users, refocus purely on fast logging plus scan-matching.

## v1 Build Scope

Roll/frame logging flow, on-device light meter, roll history browsing.

## Core Workflows

- Start a roll (camera, lens, film stock)
- Log a frame with meter-assisted settings and a note
- Close out a roll
- Browse past rolls/frames
- Attach scanned negatives to matched frames later

## iOS-Native Features

- Camera/Vision framework for on-device light metering
- Widgets showing current roll progress
- App Intents/Siri for quick frame logging

## Key Risks

- Niche audience caps broad virality; growth must lean on niche-community channels
- On-device light-meter accuracy must be credible to a technically knowledgeable audience
