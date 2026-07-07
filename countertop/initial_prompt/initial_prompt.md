PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: multi-app-exp
Selected app slug: countertop

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium iPhone cooking app called Countertop. The signature screen is a multi-dish cook-mode timeline that interleaves steps and timers across 2-3 recipes being cooked together for one meal, so the user always knows what to start next to make everything finish at once. Warm neutral palette, food-safe accent color, large legible typography readable at arm's length, one-handed touch targets, calm and editorial rather than social or gamified. Secondary screens: a structured recipe library, a weekly planner, and a grouped grocery list.

## Parent Portfolio Prompt

You are an elite iOS product strategy, design, and engineering system.

I want exactly 2 completely different iOS apps built from 0 to production readiness.

Categories:
- Choose any 2 categories from:
  Business
  Finance
  Food & Drink
  Graphics & Design
  Health & Fitness
  Medical
  Navigation
  News
  Photo & Video
  Productivity
  Reference
  Social Networking
  Travel
  Utilities

Core requirements for each app:
1. It must be unique within its category and meaningfully different from existing competitors.
2. It must provide real value to the end user.
3. It must be something users would genuinely pay a subscription for because the subscription delivers real ongoing utility, not cosmetic upgrades.
4. It must be beautifully designed, polished, and feel world-class.
5. It must have the potential to go viral, either broadly or within a niche market.
6. It must be strong enough to eventually become the best product in its category.
7. It must be local-first for this version, but designed so it can be extended to a cloud-backed architecture later if needed.
8. It must be a real product, not a gimmick, toy, or thin wrapper around an API.
9. It must be feasible as a premium iOS app experience.
10. Each app must be production-ready in scope and thinking, not just a concept, feature list, prototype, or spec.

Important constraints:
- Build 2 apps, not 1.
- These should be two separate apps, each in its own folder/project.
- Do not merge the ideas together.
- Do not reduce this to “one built app and one spec.”
- Both selected apps should go through the full app-building process.
- The ideas should be independent and strong on their own.
- Do not choose ideas just because they contain AI, AR, or ML.
- If LLM, AR, or ML is used, it must create real user value and be justified by the product.

Bonus points only if they provide genuine value:
1. Unique use of LLMs
2. Unique use of AR
3. Unique use of ML

Process requirements:
1. Start by restating my original prompt clearly and preserving its intent.
2. Do a serious research/discussion phase before locking the app choices.
3. Generate a strong pool of candidate ideas first.
4. The agents should give real opinions, not just build on each other passively.
5. Then select the best 2 apps.
6. After selection, each chosen app must be treated as its own full product and built separately.
7. Every later phase must build on prior discussion and use the full context from earlier phases.
8. Documentation must be extremely detailed.
9. Save all discussions, decisions, and phase outputs.
10. At the end, produce a full transcript artifact.

For each selected app, optimize for:
- premium UX
- clear monetization
- strong retention
- high practical value
- elegant local-first architecture
- excellent iOS-native experience
- differentiation from competitors
- App Store viability
- subscription-worthy usefulness

Design requirement:
At some point, produce a high-quality Claude Design handoff prompt for each app so the design can be taken further externally if needed.

Final instruction:
Select exactly 2 apps and build both as full, separate, production-ready iOS app projects.
