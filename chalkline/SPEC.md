# Chalkline

Build mode: **MVP build**.
Build priority: **3**.

## App Name

Chalkline

## Category

Climbing technique & route log with on-device movement analysis

## One-Sentence Promise

Shows a climber exactly where their movement broke down on a route, not just what grade they sent.

## Target User

Boulderers and sport climbers who climb several times a week and want to improve technique, not just log send counts.

## Painful Moment Solved

A climber films an attempt on their phone but has no objective way to see where their center of mass drifted, where they over-gripped, or how this attempt compares to the last one — improvement is guesswork and the route log is just numbers.

## Why It Is Different

On-device Vision body-pose estimation over captured attempt video produces a movement trace and an efficiency score per attempt — a real, deterministic, camera-centric technical capability nobody else localizes in a climbing app; bold gym-signage graphic visual language with chalk-dust texture, route-color-coding, and haptic-tied transitions between attempts.

## Why Users Would Pay

Subscription unlocks unlimited video-analysis history, side-by-side attempt comparison, and training-plan generation from logged technique weaknesses.

## Subscription Model

Free tier: route/attempt logging, capped video-analysis history. Paid: unlimited analysis history, attempt-comparison view, generated training plans.

## Local-First MVP Scope

SwiftData models for gyms/routes/attempts/sessions with video references; Vision pose estimation samples each attempt clip at a fixed low frame rate (not full video framerate) and efficiency scoring runs fully on-device against locally stored video.

## Future Backend Roadmap

CloudKit sync for cross-device attempt history; optional gym-community route-sharing later — additive on top of the local-first model.

## AR / Local ML / Local LLM Fit

On-device Vision framework for body-pose estimation during attempt review, sampled at a fixed low frame rate per clip for reliability — the app's defining hard capability, not a bonus feature.

## Design Direction

Bold gym-signage graphic design: chalk-dust textures, high-contrast route-color-coding, kinetic haptic-tied transitions between attempts, energetic but legible type scale.

## App Store Positioning

The climbing app that shows you where your technique actually broke down, using pose analysis no other climbing log does on-device.

## Invalidation Criteria

If on-device pose estimation can't produce a stable, explainable efficiency signal from typical gym-lighting phone video even with the framing guide, narrow v1 to movement-trace visualization only and drop the numeric efficiency score rather than ship a misleading number — this is the documented fallback, not a hoped-for outcome.

## v1 Build Scope

Route/attempt logging, video capture/import, low-frame-rate pose-trace overlay with efficiency score, basic attempt comparison; training-plan generation deferred as a fast-follow if time allows.

## Core Workflows

- Log a route and attempt
- Capture or import attempt video
- View pose-trace overlay and efficiency score
- Compare attempts side by side
- Track session goals and streaks
- Get a training-plan suggestion from logged weaknesses

## iOS-Native Features

- Widget: session streak / next gym goal
- Live Activity for timed attempts or rest intervals
- App Intents for Siri ("log a send")
- On-device Vision framework for pose estimation

## Key Risks

- Pose estimation accuracy depends on video framing/lighting the user controls — mitigated with an in-app framing guide and a visible confidence indicator rather than presenting shaky data as certain
- Efficiency scoring could feel like a gimmick if not clearly tied to actionable technique feedback
- Clip storage needs a sane retention/compression default so it doesn't balloon like a general video library
