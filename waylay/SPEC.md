# Waylay

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Waylay

## Category

personal utility / location-based recall

## One-Sentence Promise

Tap once when something catches your eye out in the world, and Waylay quietly reminds you the next time you're actually standing near it.

## Target User

Everyday iPhone users who constantly get real-world recommendations (from friends, storefronts, social media, conversations) and lose track of them because saving something somewhere doesn't equal remembering it at the moment it matters.

## Painful Moment Solved

You walk right past a restaurant three friends recommended, but you don't remember until you're home; or you save it to Notes or Maps and that list never gets opened again.

## Why It Is Different

Apple Reminders technically supports location-triggered reminders but the capture flow is buried and slow to use in the moment; Google/Apple Maps saved lists never proactively resurface anything. Waylay is built around exactly one loop — sub-3-second capture, automatic proactive resurfacing when nearby.

## Why Users Would Pay

Free tier caps the number of actively monitored places (bounded further by iOS's real 20-region-per-app monitoring limit); paid tier unlocks the full saved-places library with an intelligent rotation engine, richer capture (photo/voice notes), and widgets.

## Subscription Model

$3.99/mo or $24.99/yr Pro: unlimited saved places with smart region rotation, photo/voice notes, home screen widgets. Free tier: ~8 actively monitored places.

## Local-First MVP Scope

Sub-3-second capture (share sheet, camera, manual pin), CoreLocation region monitoring with priority-based rotation across the 20-region system cap, local persistent store, place library browser, proactive resurfacing notifications, snooze/dismiss/mark-visited.

## Future Backend Roadmap

CloudKit-based multi-device sync; optional shared/collaborative lists later, added carefully so it doesn't become a network-effect dependency for the core single-player loop.

## AR / Local ML / Local LLM Fit

Not required for the core loop. Optional on-device Vision OCR to pull a name off a photographed sign is a nice-to-have, cut without hesitation if it adds friction.

## Design Direction

Warm, tactile, 'little discoveries' feel — resurfacing a memory, not managing a system.

## App Store Positioning

The place-memory app for things you'll walk past again.

## Invalidation Criteria

Kill if people don't reliably capture in the moment, or resurfacing feels inaccurate/spammy rather than delightful.

## v1 Build Scope

Capture flow, geofenced resurfacing with rotation logic, place library, notifications, widgets, subscription paywall with free-tier cap, restore flow.

## Core Workflows

- capture a place in under 3 seconds from anywhere
- automatic proactive notification when physically near a saved place
- browse and manage the saved places library
- snooze, dismiss, or mark a place visited

## iOS-Native Features

- CoreLocation region monitoring
- home screen widgets
- share sheet extension
- App Intents/Siri shortcuts

## Key Risks

- iOS hard-caps monitored regions at 20 per app — rotation/prioritization is core architecture, not an edge case
- if capture isn't faster than opening Notes, the loop is dead
- risk of feeling like 'just another list app' if resurfacing isn't reliable and well-timed
