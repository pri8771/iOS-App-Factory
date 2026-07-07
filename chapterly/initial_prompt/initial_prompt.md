PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: chapterly

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a warm, editorial reading-journal app: a paper-textured home timeline of books and quotes, a distraction-free quote-capture camera view with OCR crop confirmation, and a small private circle view that reads like shared marginalia rather than a chat app.

## Parent Portfolio Prompt

Build 9 completely separate production-ready iOS apps at the same time: exactly 3 Social Networking apps, 3 Travel apps, and 3 Utilities apps.

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Now generate at least 18 candidate ideas, discuss them thoroughly, choose the best 9, and build all 9 to production quality.
