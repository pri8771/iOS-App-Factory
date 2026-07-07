# Chapterly

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Chapterly

## Category

Social Networking

## One-Sentence Promise

A personal reading journal that turns solitary reading into shared discussion with the two or three people who actually finish books with you.

## Target User

Adults who read regularly and want deeper engagement than a library app, without a public Goodreads-style feed.

## Painful Moment Solved

Finishing a book with a strong reaction and having nowhere specific to put it — group chats bury book talk, public feeds feel performative.

## Why It Is Different

Solo-first private journal and quote capture with page-synced private circles of 2-6 people invited via Contacts/Messages, not a public algorithmic feed.

## Why Users Would Pay

Unlimited circles/books, OCR quote capture from physical pages, yearly reading wrap-up exports, on-device discussion prompts.

## Subscription Model

Free: 1 circle, manual quotes. Paid monthly/annual: unlimited circles, OCR capture, advanced stats/export.

## Local-First MVP Scope

On-device journal and circle data; circle exchange for v1 happens via Messages/share-sheet delivery of entries, no server.

## Future Backend Roadmap

CloudKit/private server sync for real-time circle discussion threads.

## AR / Local ML / Local LLM Fit

On-device Vision OCR for photographed quotes; optional on-device LLM to generate discussion questions from a synopsis.

## Design Direction

Warm, literary, editorial — serif headlines, paper textures, generous whitespace; feels like a nice notebook, not a feed.

## App Store Positioning

The private, beautiful way to talk about the books you actually finish — not another public feed.

## Invalidation Criteria

If solo retention alone doesn't hold at 4 weeks and few users ever invite a second person, rethink circles as an optional export rather than a core loop.

## v1 Build Scope

Personal reading log, manual+OCR quote capture, one circle via Messages share, personal stats.

## Core Workflows

- Log a book
- Capture a quote (manual or OCR)
- Rate and reflect
- Invite a circle via Messages
- View personal reading timeline/stats

## iOS-Native Features

- Vision OCR for quote capture
- Share Sheet/Messages extension for invites
- Widgets for currently-reading and streak
- App Intents/Siri for logging a quote

## Key Risks

- Circles need a second person to show full value; solo users may never invite anyone
- On-device OCR accuracy on varied print/lighting
- Competing with generic notes apps for the same journaling habit
