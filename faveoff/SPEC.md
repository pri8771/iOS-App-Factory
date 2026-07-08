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
