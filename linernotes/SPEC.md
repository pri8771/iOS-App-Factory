# Linernotes

Build mode: **MVP build**.
Build priority: **3**.

## App Name

Linernotes

## Category

Social Networking

## One-Sentence Promise

Build a mixtape gift for someone, pairing your music with short voice or text notes on why each track matters.

## Target User

People creating a meaningful music gift for an occasion — birthdays, closure, anniversaries, new parents — not everyday social use.

## Painful Moment Solved

Sharing a playlist link is emotionally flat; there's no way to say why each song matters without a separate long text.

## Why It Is Different

Solo-first personal archive of mixtapes built from your own library, with optional collaborators who each add a track plus a voice liner note for the same occasion.

## Why Users Would Pay

Unlimited mixtape projects and collaborators, higher-quality voice-note recording with waveform art, premium cover-art themes, permanent video/export keepsake.

## Subscription Model

Free: 1 active project, 5 tracks, no collaborators. Paid: unlimited projects, collaborators, exports.

## Local-First MVP Scope

Local mixtape builder against the user's music library, locally stored voice notes; collaboration via share-sheet-exchanged project files, no server.

## Future Backend Roadmap

Real-time collaborative editing via CloudKit sharing once a backend exists.

## AR / Local ML / Local LLM Fit

Optional on-device speech-to-text captioning of liner notes for accessibility; not core to the pitch.

## Design Direction

Nostalgic mixtape/cassette-inspired but premium — tactile album art, warm gradients, a liner-notes-booklet track list.

## App Store Positioning

The mixtape, reinvented — music with the story behind each song, made to give.

## Invalidation Criteria

If most users create exactly one mixtape and never return within 90 days with no organic collaborator invites, pivot toward a personal music journal rather than a gifting product.

## v1 Build Scope

Local mixtape builder, voice liner notes, share-sheet single-occasion collaboration, playback.

## Core Workflows

- Create an occasion/mixtape
- Add tracks from library
- Record a liner note per track
- Invite collaborators via share sheet
- Play or export the finished mixtape

## iOS-Native Features

- MusicKit integration
- Share Sheet for collaboration/delivery
- Widgets for in-progress mixtapes
- Live Activities during mixtape playback

## Key Risks

- MusicKit/rights constraints on exporting copyrighted audio in a shareable artifact
- Risk of one-time novelty use rather than a recurring habit
