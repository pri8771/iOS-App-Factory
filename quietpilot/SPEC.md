# QuietPilot

Build mode: **MVP build**.
Build priority: **2**.

## App Name

QuietPilot

## Category

Acoustic-aware focus scheduling

## One-Sentence Promise

Learns how your real environments actually sound and negotiates your daily focus blocks around them instead of just measuring decibels once.

## Target User

Remote workers, students, and podcasters in shared or noise-variable spaces (open-plan homes, shared offices, apartments) who need predictable deep-work time.

## Painful Moment Solved

Noise and interruptions wreck long focus sessions, and there's no way to know in advance which hours in which room are actually going to be quiet enough — so people either guess, or get burned mid-session by the espresso machine or a neighbor's call.

## Why It Is Different

Not a one-shot decibel meter: on-device spectral analysis and local pattern clustering build a per-room acoustic profile over repeated short sessions, and the app's daily verb is a scheduling negotiation — it proposes and defends focus blocks against your calendar using what it's learned about when a room is actually quiet, so the value compounds with use instead of being a single diagnostic you run once and forget.

## Why Users Would Pay

Saves real deep-work hours and reduces interruption-recovery cost; subscription unlocks unlimited room profiles, calendar-aware scheduling intelligence, and multi-person/team readiness views for shared spaces.

## Subscription Model

Free tier: one room profile, manual session logging, basic score. Paid: unlimited room profiles, calendar-integrated scheduling recommendations, team/shared-space readiness analytics, historical trend export.

## Local-First MVP Scope

SwiftData models for rooms, sessions, detected noise-pattern clusters, and calendar-linked focus blocks; spectral feature extraction and clustering run fully on-device against locally captured short audio sessions, discarding raw audio after feature extraction.

## Future Backend Roadmap

CloudKit sync across a person's devices; opt-in shared household/team room profiles; policy templates for shared offices — additive, no rewrite needed.

## AR / Local ML / Local LLM Fit

On-device FFT-based spectral feature extraction plus local CoreML clustering for recurring noise-pattern detection — no cloud audio processing, no LLM required.

## Design Direction

Muted steel-and-aurora palette, waveform-to-heatmap card transitions, strict micro-typography scale, calm spring motion — restrained rather than clinical.

## App Store Positioning

The focus app that learns how your spaces actually sound and negotiates your schedule around them, instead of a decibel meter you check once and forget.

## Invalidation Criteria

If the scheduling-negotiation loop can't be made genuinely useful against real calendars, narrow v1 to room-profile-and-score only and market it honestly as a diagnostic tool rather than a scheduler, rather than overclaiming a weak scheduling feature.

## v1 Build Scope

Manual session capture, on-device spectral clustering for up to 3 room profiles, readiness scoring, one calendar-aware focus-block proposal flow, trend timeline, local export — no team/multi-person analytics in v1.

## Core Workflows

- Start/stop a short acoustic capture session with automatic metadata (time, room, activity type)
- Build and refine a room's noise-pattern profile from repeated sessions
- Get a room readiness score for a given time window
- Get and negotiate a proposed focus-block schedule against the calendar
- Review trends and compare before/after a room change (e.g., moved desks, added a rug)

## iOS-Native Features

- BGAppRefreshTask for nightly profile recomputation
- Home/Lock Screen widget for current room score and next proposed focus window
- App Intents for starting/stopping a session from Shortcuts or Siri
- Haptic feedback for threshold crossings
- Local notifications for negotiated quiet windows

## Key Risks

- Microphone capture needs an unmistakably explicit start/stop model or it reads as creepy always-listening surveillance
- Repeat-use value depends on the scheduling-negotiation loop actually working, not just the initial room diagnostic — if that loop is weak the app becomes a one-time novelty
- Environmental variability (a different noise source each day) can undercut confidence in the profile and needs honest uncertainty framing, not false precision
