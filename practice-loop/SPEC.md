# Practice Loop

Build mode: **MVP build**.
Build priority: **3**.

## App Name

Practice Loop

## Category

Music Practice

## One-Sentence Promise

Play your instrument and get real pitch and rhythm-stability feedback on the actual piece you're practicing, not just a metronome click.

## Target User

Serious amateur and pre-professional instrumentalists who practice alone without a teacher present to catch intonation and timing drift.

## Painful Moment Solved

Practicing a difficult passage alone and not being sure if it's actually improving.

## Why It Is Different

Analyzes practice rather than merely timing it — piece-specific pitch/rhythm feedback instead of generic metronome and streak mechanics.

## Why Users Would Pay

Unlimited pieces, historical trend analysis, and per-passage breakdowns versus a single-piece free tier.

## Subscription Model

Free: 1 tracked piece, basic timer + log. Paid (~$7.99/mo or $59/yr): unlimited pieces, on-device audio analysis feedback, progress trends.

## Local-First MVP Scope

Local practice-session log, on-device audio capture and analysis (pitch tracking, tempo-stability detection), per-piece history and trend view.

## Future Backend Roadmap

Repository protocol boundary now; later, optional cloud backup and teacher-sharing of progress reports.

## AR / Local ML / Local LLM Fit

On-device audio pitch/rhythm analysis is the core value driver, not a bonus — works fully offline.

## Design Direction

Calm studio aesthetic — warm wood/brass tones, waveform-driven visuals.

## App Store Positioning

The practice partner that actually listens.

## Invalidation Criteria

If real instrumentalists find feedback inaccurate, rework before the paid tier leans on it.

## v1 Build Scope

Single-user local practice log, on-device audio analysis for one or two instrument families at launch, per-piece history/trends, full state coverage, StoreKit 2 paywall.

## Core Workflows

- start a practice session for a piece
- record and get real-time pitch/rhythm feedback
- review session summary
- track progress per piece over time

## iOS-Native Features

- On-device audio analysis (AVAudioEngine, no cloud call)
- Live Activities during an active session
- Local notifications for practice reminders
- Widgets showing practice streak/last session

## Key Risks

- Analysis accuracy varies by instrument family
- Ambient noise could degrade analysis and needs graceful handling
