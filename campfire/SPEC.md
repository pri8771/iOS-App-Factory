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
