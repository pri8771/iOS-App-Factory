# Countertop

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Countertop

## Category

Food & Drink

## One-Sentence Promise

A private cooking system that sequences every dish in your meal so everything finishes together, and gets sharper the more you cook.

## Target User

Home cooks who cook multiple times per week, save recipes from many places, and want calm, repeatable execution instead of more recipe discovery.

## Painful Moment Solved

You're making three components for one dinner and juggling tabs, timers, and guesswork about when to start the rice so it's not cold by the time the chicken's done.

## Why It Is Different

Not a recipe library or discovery app like Paprika — its core mechanic is a multi-dish sequenced cook mode that interleaves timing across everything you're making for one meal, showing a unified timeline instead of isolated recipe steps.

## Why Users Would Pay

A private recipe library with corrected ingredients, personal timing notes, and meal history that compounds every week, plus a cook-mode sequencing engine that gets more useful the more real dinners you run through it.

## Subscription Model

Freemium with a capped recipe library and single-recipe cook mode; subscription unlocks unlimited recipes, multi-dish sequenced cook mode, weekly planning, and grocery extraction.

## Local-First MVP Scope

SwiftData recipe store with structured ingredients/steps, share-extension and OCR import, multi-dish sequencing engine with interleaved timers, weekly planner, grocery list generation, cook history with personal notes, StoreKit paywall.

## Future Backend Roadmap

Optional cross-device sync and shared household meal plans later, without changing the local domain model.

## AR / Local ML / Local LLM Fit

On-device Vision OCR for recipe capture is optional and justified; no LLM or AR required in v1.

## Design Direction

Warm, editorial, tactile — generous typography, calm kitchen-safe contrast, a timeline view for multi-dish sequencing that reads clearly at arm's length while hands are messy.

## App Store Positioning

The cooking system for people who already save recipes everywhere but want real weekly execution — especially the moment of cooking more than one dish at once.

## Invalidation Criteria

If cooking two or three dishes for one meal in Countertop isn't demonstrably calmer and better-timed than just eyeballing separate recipes, the core mechanic has failed and the app has no reason to exist.

## v1 Build Scope

Recipe library with import/edit, multi-dish sequenced cook mode with concurrent timers, weekly planner, grocery list, cook history/notes, settings/paywall, full empty/loading/success/error coverage.

## Core Workflows

- Import a recipe via paste, share extension, or photographed page and clean it into structured ingredients/steps
- Select 2-3 recipes for one meal and let the app compute a single interleaved timeline across all of them
- Cook with step-by-step guidance, concurrent timers, and substitution notes
- Plan a week of meals and generate one grouped grocery list
- Review cook history and adjust timing/ingredients for next time

## iOS-Native Features

- SwiftData local persistence
- Share extension for recipe import
- On-device Vision OCR for photographed recipe pages
- Live Activities for multi-dish concurrent timers
- Interactive widgets for tonight's plan
- App Intents/Shortcuts for quick plan/cook actions

## Key Risks

- If the sequencing engine's timing estimates are wrong, it actively makes dinner worse, not better — this must be conservative and editable
- Import cleanup is still brittle for messy sources and must fail gracefully rather than silently produce a bad recipe
- Risks reverting to 'Paprika but nicer' if the sequenced cook mode isn't kept as the centerpiece of every core flow
