# linernotes — Complete Project Dossier

_Detailed deterministic archive of the orchestrator run. It includes the original prompt, final phase outputs, full discussion transcripts, task backlog, interface contracts, verification status, and recorded findings. Nothing here is inferred or fabricated._

## Original Prompt

PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: linernotes

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium, cassette-inspired mixtape app: an album-art-forward project view, a track-by-track liner-notes recording flow, and a warm, tactile finished-mixtape playback screen that feels like a keepsake.

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


## Change requested
The app currently FAILS to compile. Fix every compiler error until the build succeeds cleanly; do not drop features unless unavoidable.

## Phase Map

- **Scope the change** (`iterate_scope`) — completed
- **Build the change** (`build_coordination`) — consensus
- **Review** (`final_review`) — completed

## Final Phase Outputs

### Scope the change

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Build the change

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** still not compiling after 2 repair attempt(s)

### Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED

## Full Discussion Transcripts

### Scope the change

# linernotes — Iterate Scope

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 09:12:49._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: linernotes

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium, cassette-inspired mixtape app: an album-art-forward project view, a track-by-track liner-notes recording flow, and a warm, tactile finished-mixtape playback screen that feels like a keepsake.

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


## Change requested
The app currently FAILS to compile. Fix every compiler error until the build succeeds cleanly; do not drop features unless unavoidable.
```

## Phase Purpose

The app ALREADY exists and compiles in app_build. Decide exactly what to change to satisfy the latest requested change (see the '## Change requested' section of the prompt): which files to touch and what to add. Keep it minimal and preserve existing behavior. Do NOT rebuild from scratch.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex returned empty output — refusing to fabricate a response. See logs/._

**Claude (Product Strategist · Skeptic) — Round 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini — Round 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Coordinator (Claude) — decision after round 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Forced Vote (max rounds reached)


**Claude — vote**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Coordinator (Claude) — vote tally & decision**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Coordinator Decision

See the coordinator's message above.

## Final Output

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

---

VOTE_DECISION: NO

### Build the change

# linernotes — Build Coordination

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 09:13:00._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: linernotes

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium, cassette-inspired mixtape app: an album-art-forward project view, a track-by-track liner-notes recording flow, and a warm, tactile finished-mixtape playback screen that feels like a keepsake.

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


## Change requested
The app currently FAILS to compile. Fix every compiler error until the build succeeds cleanly; do not drop features unless unavoidable.
```

## Phase Purpose

Make the requested change to the EXISTING app in app_build. Extend the current code; do not rebuild from scratch and do not delete working features. Ship a compiling app.

## Transcript


_Parallel build — 3 workers running at once: Codex builds the core data model + domain logic — data structures, state management, persistence, and business rules; Claude builds the primary UI — the main screens the user sees and taps through, plus navigation and layout; Gemini builds supporting pieces — services/networking, utilities, secondary screens, and lightweight tests. Integrator: Claude._

### Iteration 1


**Codex (QA & Risk · Skeptic) — Iteration 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (rate_limit)._

**Claude (Frontend Engineer · Pragmatist) — Iteration 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini (QA & Risk · User Advocate) — Iteration 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Integrator (Claude) — after iteration 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Iteration 2


**Codex (QA & Risk · Skeptic) — Iteration 2 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (rate_limit)._

**Claude (Frontend Engineer · Pragmatist) — Iteration 2**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini (QA & Risk · User Advocate) — Iteration 2 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Integrator (Claude) — after iteration 2**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Iteration 3


**Codex (QA & Risk · Skeptic) — Iteration 3 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (rate_limit)._

**Claude (Frontend Engineer · Pragmatist) — Iteration 3**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini (QA & Risk · User Advocate) — Iteration 3 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Integrator (Claude) — after iteration 3**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Iteration 4


**Codex (QA & Risk · Skeptic) — Iteration 4 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (rate_limit)._

**Claude (Frontend Engineer · Pragmatist) — Iteration 4**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini (QA & Risk · User Advocate) — Iteration 4 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Integrator (Claude) — after iteration 4**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Verification

❌ **Verification initial** — compile FAILED for the iOS Simulator (xcodebuild)

**Repair 1 (Claude)**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
❌ **Verification after repair 1** — compile FAILED for the iOS Simulator (xcodebuild)

**Repair 2 (Claude)**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
❌ **Verification after repair 2** — compile FAILED for the iOS Simulator (xcodebuild)

## Coordinator Decision

See the coordinator's message above.

## Final Output

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Build verification:** still not compiling after 2 repair attempt(s)

---

CONSENSUS: YES

### Review

# linernotes — Final Review

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 09:13:28._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-cat-b3
Selected app slug: linernotes

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

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

## Claude Design Handoff Prompt

Design a premium, cassette-inspired mixtape app: an album-art-forward project view, a track-by-track liner-notes recording flow, and a warm, tactile finished-mixtape playback screen that feels like a keepsake.

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


## Change requested
The app currently FAILS to compile. Fix every compiler error until the build succeeds cleanly; do not drop features unless unavoidable.
```

## Phase Purpose

Go/no-go on the change: what changed, what still works, and the top risks. One round.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (rate_limit)._

**Claude (Product Strategist · User Advocate) — Round 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Gemini — Round 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini(key) -> Warning: 256-color support not detected. Using a terminal with at least 256-color support is recomme | gemini CLI -> auth/tier error_

**Coordinator (Claude) — decision after round 1**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

### Forced Vote (max rounds reached)


**Claude — vote**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

**Coordinator (Claude) — vote tally & decision**

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Coordinator Decision

See the coordinator's message above.

## Final Output

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

VERIFICATION: FAILED

---

VOTE_DECISION: NO

## Task Backlog

```json
{
  "tasks": [
    {
      "id": "T-001",
      "title": "Xcode project scaffolding: targets, App Group, signing, UTType/document-opener registration, privacy strings, .storekit skeleton, launch seam",
      "owner_lane": "services_utilities",
      "files": [
        "Linernotes.xcodeproj/project.pbxproj",
        "LinernotesApp/Info.plist",
        "LinernotesApp/Linernotes.entitlements",
        "LinernotesWidget/Info.plist",
        "LinernotesWidget/LinernotesWidget.entitlements",
        "LinernotesKit/Package.swift",
        "Configuration/Linernotes.storekit",
        "LinernotesApp/Support/LaunchSeam.swift"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "App + widget targets build empty on simulator",
        "App Group ID matches across app and widget entitlements",
        ".linernotes UTType and document-opener capability declared in Info.plist",
        "NSAppleMusicUsageDescription and NSMicrophoneUsageDescription present with plain-language copy",
        "-linernotesUITestMode launch arg and LINERNOTES_FIXTURE env var are parseable via LaunchSeam"
      ],
      "status": "pending"
    },
    {
      "id": "T-002",
      "title": "Core enums and lightweight value types",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/Occasion.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/Theme.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/ContributorRole.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/PackageKind.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/EntitlementTier.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/MusicAuthorizationStatus.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/TrackPlaybackAvailability.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/RecordingResult.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/AudioRecordingEvent.swift"
      ],
      "depends_on": [
        "T-001"
      ],
      "acceptance_criteria": [
        "All types Codable/Sendable per interfaces contract",
        "Zero imports beyond Foundation",
        "Package builds and existing tests (if any) stay green"
      ],
      "status": "pending"
    },
    {
      "id": "T-003",
      "title": "Liner note content and contributor models",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/LinerNoteContent.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/Contributor.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/LinerNote.swift"
      ],
      "depends_on": [
        "T-002"
      ],
      "acceptance_criteria": [
        "LinerNoteContent voice/text cases are equal-weight, no isFallback flag anywhere",
        "Codable round-trip unit test for both LinerNoteContent cases"
      ],
      "status": "pending"
    },
    {
      "id": "T-004",
      "title": "Track and Project models plus catalog track type",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/TrackEntry.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/Project.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/MusicCatalogTrack.swift"
      ],
      "depends_on": [
        "T-003"
      ],
      "acceptance_criteria": [
        "TrackEntry.artworkFilename is a relative on-disk path, never a URL type",
        "Project Codable round-trip test including nested tracks/contributors",
        "MusicCatalogTrack.id computed from catalogID per interfaces contract"
      ],
      "status": "pending"
    },
    {
      "id": "T-005",
      "title": "Library index and shared widget summary models",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/LibraryIndexEntry.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/LibraryIndex.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/SharedProjectSummary.swift"
      ],
      "depends_on": [
        "T-004"
      ],
      "acceptance_criteria": [
        "LibraryIndexEntry never requires decoding a full Project to populate the shelf",
        "SharedProjectSummary is the only model referenced anywhere in widget-facing code"
      ],
      "status": "pending"
    },
    {
      "id": "T-006",
      "title": "Package manifest, entitlement snapshot, and all error enums",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/ProjectPackageManifest.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/EntitlementSnapshot.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/AudioRecordingError.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/ProjectPersistenceError.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/ProjectImportError.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/EntitlementError.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/ImportArrivalContext.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/ImportState.swift",
        "LinernotesKit/Sources/LinernotesKit/Models/SaveState.swift"
      ],
      "depends_on": [
        "T-004"
      ],
      "acceptance_criteria": [
        "ProjectPackageManifest is schema-versioned and Codable round-trip tested",
        "Every error enum used by services_utilities in tech_specs exists here with matching cases"
      ],
      "status": "pending"
    },
    {
      "id": "T-007",
      "title": "Entitlement pure rule engine with boundary unit tests",
      "owner_lane": "data_domain",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Models/EntitlementRules.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ModelsTests/EntitlementRulesTests.swift"
      ],
      "depends_on": [
        "T-006"
      ],
      "acceptance_criteria": [
        "canCreateAdditionalProject/canAddTrack/canAddCollaborator are pure functions with no StoreKit or IO dependency",
        "Boundary tests cover exactly: 1st vs 2nd project on free, 5th vs 6th track on free, 0 vs 1 collaborator on free, and unlimited on paid for all three",
        "This is the only place free/paid limits are computed anywhere in the codebase"
      ],
      "status": "pending"
    },
    {
      "id": "T-008",
      "title": "Service protocol definitions",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/MusicLibraryProviding.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/AudioRecording.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/AudioPlayback.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/ProjectFileStore.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/EntitlementProviding.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/ProjectPackageExporting.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/ProjectPackageImporting.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Protocols/WidgetSummaryWriting.swift"
      ],
      "depends_on": [
        "T-007"
      ],
      "acceptance_criteria": [
        "Every protocol signature matches the tech_specs interfaces-json verbatim",
        "No implementation code in this task, protocols only, compiles standalone"
      ],
      "status": "pending"
    },
    {
      "id": "T-009",
      "title": "Fake service implementations for all protocols, including synthesizable interruption",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeServices.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeMusicLibraryProvider.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeAudioRecording.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeAudioPlayback.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/InMemoryProjectFileStore.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeEntitlementProvider.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakePackageExporterImporter.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Fake/FakeWidgetSummaryWriter.swift"
      ],
      "depends_on": [
        "T-008"
      ],
      "acceptance_criteria": [
        "FakeAudioRecording.events() can emit .interrupted on demand via a test-only trigger method",
        "FakeMusicLibraryProvider returns fixture arrays keyed by a fixture name string",
        "InMemoryProjectFileStore round-trips save/load with no disk IO",
        "Unit tests exist for the fakes themselves, not just consumers of them"
      ],
      "status": "pending"
    },
    {
      "id": "T-010",
      "title": "FileManagerProjectStore: atomic persistence and asset lifecycle",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Live/FileManagerProjectStore.swift"
      ],
      "depends_on": [
        "T-008"
      ],
      "acceptance_criteria": [
        "All writes are atomic write-then-rename",
        "writeArtwork/writeAudioFile write real bytes to disk under the project folder and return relative paths",
        "deleteAsset removes the file immediately, not just the reference",
        "sweepOrphanedAssets(projectID:) is scoped to one project and does not touch other projects",
        "Simulated crash-mid-write test proves no partial file is ever visible to a reader"
      ],
      "status": "pending"
    },
    {
      "id": "T-011",
      "title": "DebouncedSaveController",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/DebouncedSaveController.swift"
      ],
      "depends_on": [
        "T-010"
      ],
      "acceptance_criteria": [
        "scheduleSave debounces at 300ms default, configurable via init",
        "forceFlush awaits any pending write to completion before returning",
        "Unit test proves forceFlush after rapid scheduleSave calls results in exactly the latest project state on disk"
      ],
      "status": "pending"
    },
    {
      "id": "T-012",
      "title": "Live package exporter/importer wired to validation",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Live/ProjectPackageExporter.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Live/ProjectPackageImporter.swift"
      ],
      "depends_on": [
        "T-010",
        "T-013"
      ],
      "acceptance_criteria": [
        "makePackage never writes catalog audio bytes into the package directory, only metadata/art/text/voice-note files, inspectable by a test that lists package contents",
        "inspect()/importProject call validateImportedPackage before touching app storage",
        "importProject copies into owned storage only after validation passes, never opens the untrusted directory in place"
      ],
      "status": "pending"
    },
    {
      "id": "T-013",
      "title": "validateImportedPackage with explicit path-traversal rejection and fuzz tests",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/PackageValidation.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/SchemaMigrator.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ResilienceTests/PackageValidationTests.swift"
      ],
      "depends_on": [
        "T-006"
      ],
      "acceptance_criteria": [
        "Rejects any declared asset filename containing a path separator or .. component, with a dedicated test case",
        "Rejects schema-version mismatches and oversized/too-numerous files, each with its own test",
        "Fuzzed test feeds at least 50 adversarial filename/size/schema permutations and asserts none are ever accepted incorrectly",
        "SchemaMigrator throws on unrecognized versions rather than best-effort partial decode"
      ],
      "status": "pending"
    },
    {
      "id": "T-014",
      "title": "MusicKit live provider",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Live/MusicKitMusicLibraryProvider.swift"
      ],
      "depends_on": [
        "T-008"
      ],
      "acceptance_criteria": [
        "requestAuthorization wraps MusicAuthorization.request()",
        "search wraps MusicCatalogSearchRequest and returns MusicCatalogTrack fixtures-compatible shape",
        "availability(forCatalogID:) reflects real catalog/subscription state",
        "Manual-device-only test noted in code comments since Simulator MusicKit is unreliable"
      ],
      "status": "pending"
    },
    {
      "id": "T-015",
      "title": "Live audio recording and playback services",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Live/AVAudioRecordingService.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Live/AVAudioPlaybackService.swift"
      ],
      "depends_on": [
        "T-008"
      ],
      "acceptance_criteria": [
        "Recorder wired to real AVAudioSession.interruptionNotification, publishing .interrupted/.resumed through events()",
        "Audio format fixed to mono AAC 32-48kbps",
        "startRecording begins the AVAudioRecorder synchronously on call, no awaited setup before recording visibly starts"
      ],
      "status": "pending"
    },
    {
      "id": "T-016",
      "title": "StoreKit entitlement provider and App Group widget summary writer",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/Live/StoreKitEntitlementProvider.swift",
        "LinernotesKit/Sources/LinernotesKit/Services/Live/AppGroupWidgetSummaryWriter.swift"
      ],
      "depends_on": [
        "T-011",
        "T-007"
      ],
      "acceptance_criteria": [
        "StoreKitEntitlementProvider calls EntitlementRules for every boundary decision, never reimplements the limits",
        "Built against the local .storekit config from T-001, no live product ID wiring",
        "AppGroupWidgetSummaryWriter writes SharedProjectSummary JSON into the shared App Group container and nothing else"
      ],
      "status": "pending"
    },
    {
      "id": "T-017",
      "title": "AppEnvironment composition root: fake() factory",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/AppEnvironment.swift"
      ],
      "depends_on": [
        "T-008",
        "T-009"
      ],
      "acceptance_criteria": [
        "AppEnvironment.fake(fixture:) fully wires FakeServices and is usable standalone",
        "AppEnvironment.live() exists as a clearly marked fatalError stub pointing at T-021, not silently missing",
        "Struct matches the tech_specs interfaces-json signature exactly"
      ],
      "status": "pending"
    },
    {
      "id": "T-018",
      "title": "ProjectLibrary and ProjectEditor view models",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/ViewModels/ProjectLibrary.swift",
        "LinernotesKit/Sources/LinernotesKit/ViewModels/ProjectEditor.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ViewModelTests/ProjectLibraryTests.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ViewModelTests/ProjectEditorTests.swift"
      ],
      "depends_on": [
        "T-017"
      ],
      "acceptance_criteria": [
        "createProject throws EntitlementError.projectLimitReached on the 2nd free project, verified by test against AppEnvironment.fake()",
        "addTrack throws EntitlementError.trackLimitReached on the 6th track",
        "moveTrackEarlier, moveTrackLater, and reorderTracks call one identical underlying mutation function",
        "Every mutation goes through DebouncedSaveController, never a direct ProjectFileStore.save call from the view model"
      ],
      "status": "pending"
    },
    {
      "id": "T-019",
      "title": "RecordCaptureViewModel",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/ViewModels/RecordCaptureViewModel.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ViewModelTests/RecordCaptureViewModelTests.swift"
      ],
      "depends_on": [
        "T-017"
      ],
      "acceptance_criteria": [
        "interruptedRecoverable state is reached only by driving the fake AudioRecording's synthesized .interrupted event, never a stub flag set directly on RecordCaptureState",
        "Re-record path calls ProjectFileStore.deleteAsset on the prior file before saving the new one",
        "Text draft/save path is a fully separate, equally-weighted code path from voice, not a fallback branch"
      ],
      "status": "pending"
    },
    {
      "id": "T-020",
      "title": "PlaybackViewModel",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/ViewModels/PlaybackViewModel.swift",
        "LinernotesKit/Tests/LinernotesKitTests/ViewModelTests/PlaybackViewModelTests.swift"
      ],
      "depends_on": [
        "T-017"
      ],
      "acceptance_criteria": [
        ".unavailable state always carries a non-nil openInAppleMusicURL when one exists",
        "advance(to:) updates currentIndex and keeps note playback/text in sync with the displayed track regardless of song availability"
      ],
      "status": "pending"
    },
    {
      "id": "T-021",
      "title": "AppEnvironment.live() wiring and launch-seam integration",
      "owner_lane": "services_utilities",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Services/AppEnvironment.swift"
      ],
      "depends_on": [
        "T-012",
        "T-014",
        "T-015",
        "T-016",
        "T-017"
      ],
      "acceptance_criteria": [
        "live() wires every real service with no remaining fatalError stub",
        "App root selects fake vs live purely from the T-001 launch seam, verified by a test launching with -linernotesUITestMode"
      ],
      "status": "pending"
    },
    {
      "id": "T-022",
      "title": "Shelf and New Occasion screens",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesApp/Features/Shelf/ShelfView.swift",
        "LinernotesApp/Features/NewOccasion/NewOccasionView.swift",
        "LinernotesApp/Features/Shared/EmptyStateCard.swift",
        "LinernotesApp/Features/Shared/PaywallSheet.swift"
      ],
      "depends_on": [
        "T-018"
      ],
      "acceptance_criteria": [
        "Shelf renders empty/populated/importing/corrupted-import states, each independently reachable in a SwiftUI preview",
        "New Occasion blocks the 2nd project at the commit action via PaywallSheet, not a disabled button with no explanation"
      ],
      "status": "pending"
    },
    {
      "id": "T-023",
      "title": "Authoring booklet and Add Track screens",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesApp/Features/Authoring/AuthoringView.swift",
        "LinernotesApp/Features/Authoring/TrackCard.swift",
        "LinernotesApp/Features/AddTrack/AddTrackView.swift",
        "LinernotesApp/Features/Shared/ThemeSwatchPicker.swift",
        "LinernotesApp/Features/Shared/OccasionChip.swift",
        "LinernotesApp/Features/Shared/ContributorBadge.swift"
      ],
      "depends_on": [
        "T-018",
        "T-022",
        "T-027"
      ],
      "acceptance_criteria": [
        "TrackCard exposes one combined VoiceOver label including note status spoken as a full phrase, not icon-only",
        "Drag reorder and the T-027 VoiceOver move-earlier/move-later actions call the identical ProjectEditor mutation",
        "AddTrackState machine implements denied-with-retry, empty-results, and the 6th-track entitlement block visibly at the add action",
        "ForEach over tracks keys on TrackEntry.id, never array index"
      ],
      "status": "pending"
    },
    {
      "id": "T-024",
      "title": "Record Capture and Playback screens",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesApp/Features/RecordCapture/RecordCaptureView.swift",
        "LinernotesApp/Features/RecordCapture/AmplitudeIndicator.swift",
        "LinernotesApp/Features/RecordCapture/RecordButton.swift",
        "LinernotesApp/Features/Playback/PlaybackView.swift",
        "LinernotesApp/Features/Playback/CompactPlaybackStrip.swift",
        "LinernotesApp/Features/Playback/SideMarker.swift"
      ],
      "depends_on": [
        "T-019",
        "T-020",
        "T-023"
      ],
      "acceptance_criteria": [
        "Record surface visibly enters recording state within 300ms of tap, verified by a UI test measuring state transition timing against the fake recorder",
        "Voice/Text toggle renders both options at equal size, no secondary/fallback visual treatment",
        "Playback screen swaps unavailable tracks to an Open-in-Apple-Music affordance, never a spinner",
        "Reduced Motion fallback (T-027) is applied to every spool/flip/breathing animation on both screens"
      ],
      "status": "pending"
    },
    {
      "id": "T-025",
      "title": "Share/Handoff and Import Arrival screens",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesApp/Features/ShareHandoff/ShareHandoffView.swift",
        "LinernotesApp/Features/ShareHandoff/PackagePreviewManifest.swift",
        "LinernotesApp/Features/ImportArrival/ImportArrivalView.swift",
        "LinernotesApp/Features/ImportArrival/ImportStatusBanner.swift",
        "LinernotesApp/Features/Shared/RightsSafeInfoRow.swift"
      ],
      "depends_on": [
        "T-017",
        "T-018"
      ],
      "acceptance_criteria": [
        "Send-the-Gift and Invite-a-Contributor are visually distinct with independent copy",
        "PackagePreviewManifest renders from the exact same ProjectPackageManifest the exporter produces, no separate preview-only struct",
        "Import Arrival's failed state is fail-closed, shows calm error copy, and never falls through to a track list"
      ],
      "status": "pending"
    },
    {
      "id": "T-026",
      "title": "App root integration: navigation, scenePhase force-flush, live environment swap-in",
      "owner_lane": "primary_ui",
      "files": [
        "LinernotesApp/LinernotesApp.swift",
        "LinernotesApp/RootNavigationView.swift"
      ],
      "depends_on": [
        "T-021",
        "T-024",
        "T-025"
      ],
      "acceptance_criteria": [
        "Exactly one scenePhase observer at the app root calls DebouncedSaveController.forceFlush() on .background and .inactive",
        "App boots on AppEnvironment.live() by default and AppEnvironment.fake() only under the T-001 launch seam",
        "Full core loop (create, add track, record note, reorder, preview, export) completes manually on simulator with the fake fixture with zero crashes"
      ],
      "status": "pending"
    },
    {
      "id": "T-027",
      "title": "Accessibility helpers: custom reorder actions and reduced-motion environment value",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesKit/Sources/LinernotesKit/Accessibility/AccessibilityReorderActions.swift",
        "LinernotesKit/Sources/LinernotesKit/Accessibility/ReducedMotionFallback.swift"
      ],
      "depends_on": [
        "T-001"
      ],
      "acceptance_criteria": [
        "trackReorderActions adds VoiceOver 'Move earlier'/'Move later' custom actions that call the passed closures directly",
        "linernotesReduceMotion wraps accessibilityReduceMotion and is usable from any View",
        "Unit/UI test confirms the custom actions are exposed and fire the correct closure"
      ],
      "status": "pending"
    },
    {
      "id": "T-028",
      "title": "Orphan-sweep vs crash-recovery race integration tests",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesKit/Tests/LinernotesKitTests/ResilienceTests/OrphanSweepRaceTests.swift"
      ],
      "depends_on": [
        "T-010"
      ],
      "acceptance_criteria": [
        "Test proves sweepOrphanedAssets(projectID:) never runs before that project's own load/recovery reconciliation completes",
        "Simulated crash-mid-write scenario followed immediately by a sweep call proves no legitimately-referenced asset is ever deleted",
        "Test explicitly fails if sweep is ever invoked as a single global pass instead of per-project"
      ],
      "status": "pending"
    },
    {
      "id": "T-029",
      "title": "Widget extension",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesWidget/LinernotesWidget.swift",
        "LinernotesWidget/LinernotesWidgetTimelineProvider.swift"
      ],
      "depends_on": [
        "T-016"
      ],
      "acceptance_criteria": [
        "Timeline provider reads SharedProjectSummary only, never imports Project or any Models file outside SharedProjectSummary",
        "Widget shows in-progress annotated/total count or a recent finished keepsake and deep-links into the app",
        "Verified running in a simulator widget preview, not just compiling"
      ],
      "status": "pending"
    },
    {
      "id": "T-030",
      "title": "Live Activity for playback",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesWidget/LinernotesPlaybackActivity.swift",
        "LinernotesApp/Support/LiveActivityAdapter.swift"
      ],
      "depends_on": [
        "T-016",
        "T-020"
      ],
      "acceptance_criteria": [
        "Activity starts/updates/ends tied to real PlaybackViewModel state transitions via a thin adapter, not a mocked timeline",
        "Activity shows current track and note progress and is verified running on a simulator or device"
      ],
      "status": "pending"
    },
    {
      "id": "T-031",
      "title": "XCUITest golden-path smoke test",
      "owner_lane": "polish_resilience",
      "files": [
        "LinernotesAppUITests/GoldenPathSmokeTests.swift"
      ],
      "depends_on": [
        "T-026"
      ],
      "acceptance_criteria": [
        "Test launches with -linernotesUITestMode and a named LINERNOTES_FIXTURE",
        "Walks create project, add fixture track, record a text note, reorder, preview playback, export package, asserting no crash and expected text at each step"
      ],
      "status": "pending"
    },
    {
      "id": "T-032",
      "title": "Manual verification checklist and final production-readiness review",
      "owner_lane": "polish_resilience",
      "files": [
        "docs/VERIFICATION_CHECKLIST.md",
        "docs/FINAL_REVIEW.md"
      ],
      "depends_on": [
        "T-026",
        "T-029",
        "T-030",
        "T-031"
      ],
      "acceptance_criteria": [
        "Checklist lists every M7 manual device check (permission denials, real interruption during real recording, force-quit at each named point, unavailable-track playback, corrupted-package import, widget refresh, Live Activity timing, cross-device handoff) with pass/fail/owner columns",
        "Final review explicitly names any ceiling gaps (widget/Live Activity depth, no live StoreKit, no CloudKit) rather than omitting them, matching the production-readiness bar from the prompt contract"
      ],
      "status": "pending"
    }
  ]
}
```

## Interface Contracts

```json
{
  "interfaces": [
    {
      "name": "ProjectID",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct ProjectID: Hashable, Codable, Sendable { let rawValue: UUID }",
      "owning_lane": "data_domain",
      "notes": "Stable project identity used across persistence, import/export, and UI routing."
    },
    {
      "name": "TrackEntryID",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct TrackEntryID: Hashable, Codable, Sendable { let rawValue: UUID }",
      "owning_lane": "data_domain",
      "notes": "Stable identity for reorder, note attachment, and deletion."
    },
    {
      "name": "ContributorIdentity",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct ContributorIdentity: Codable, Hashable, Sendable { var displayName: String; var role: ContributorRole }",
      "owning_lane": "data_domain",
      "notes": "Minimal collaborator identity for v1 package exchange."
    },
    {
      "name": "ContributorRole",
      "kind": "enum",
      "language": "swift",
      "signature": "enum ContributorRole: String, Codable, Sendable { case owner, collaborator }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "OccasionKind",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum OccasionKind: String, Codable, CaseIterable, Sendable { case birthday, goodbye, anniversary, newBaby, justBecause }",
      "owning_lane": "data_domain",
      "notes": "Fixed v1 occasion taxonomy from design decisions."
    },
    {
      "name": "ThemeToken",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum ThemeToken: String, Codable, CaseIterable, Sendable { case amber, fadedRed, tobacco, charcoal }",
      "owning_lane": "data_domain",
      "notes": "Stable serialized theme identifier; UI maps this to visuals."
    },
    {
      "name": "PackageKind",
      "kind": "enum",
      "language": "swift",
      "signature": "enum PackageKind: String, Codable, Sendable { case keepsake, invite }",
      "owning_lane": "data_domain",
      "notes": "Set at export time; drives Import Arrival's two intro variants."
    },
    {
      "name": "Project",
      "kind": "struct",
      "language": "swift",
      "signature": "struct Project: Identifiable, Codable, Sendable { let id: UUID; var schemaVersion: Int; var title: String; var recipientName: String; var occasion: Occasion; var dedication: String?; var theme: Theme; var tracks: [TrackEntry]; var contributors: [Contributor]; var createdAt: Date; var updatedAt: Date }",
      "owning_lane": "data_domain",
      "notes": "One folder on disk per project; this struct is the versioned manifest JSON at its root."
    },
    {
      "name": "CollaborationMode",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum CollaborationMode: String, Codable, Sendable { case solo, linearHandoff }",
      "owning_lane": "data_domain",
      "notes": "V1 explicitly excludes concurrent merge."
    },
    {
      "name": "TrackEntry",
      "kind": "struct",
      "language": "swift",
      "signature": "struct TrackEntry: Identifiable, Codable, Sendable { let id: UUID; var catalogID: String; var snapshotTitle: String; var snapshotArtist: String; var artworkFilename: String?; var addedByContributorID: UUID; var note: LinerNote?; var sortIndex: Int }",
      "owning_lane": "data_domain",
      "notes": "artworkFilename is a relative path to bytes on disk, written at add-time by ProjectEditor.addTrack via ProjectFileStore.writeArtwork, never a remote URL."
    },
    {
      "name": "MusicTrackReference",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct MusicTrackReference: Codable, Hashable, Sendable { var appleMusicSongID: String?; var snapshottedTitle: String; var snapshottedArtist: String; var snapshottedArtworkFilename: String?; var durationSeconds: TimeInterval? }",
      "owning_lane": "data_domain",
      "notes": "Separates external playback capability from local renderable truth."
    },
    {
      "name": "LinerNote",
      "kind": "struct",
      "language": "swift",
      "signature": "struct LinerNote: Identifiable, Codable, Sendable { let id: UUID; var content: LinerNoteContent; var createdAt: Date; var updatedAt: Date }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "TextNote",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct TextNote: Codable, Hashable, Sendable { var body: String; var createdAt: Date; var updatedAt: Date }",
      "owning_lane": "data_domain",
      "notes": "Pure text note payload."
    },
    {
      "name": "VoiceNote",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct VoiceNote: Codable, Hashable, Sendable { var filename: String; var durationSeconds: TimeInterval; var format: VoiceNoteFormat; var createdAt: Date }",
      "owning_lane": "data_domain",
      "notes": "References owned local audio asset."
    },
    {
      "name": "VoiceNoteFormat",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum VoiceNoteFormat: String, Codable, Sendable { case aacMono32kbps, aacMono48kbps }",
      "owning_lane": "data_domain",
      "notes": "Locked v1 presets to bound file size."
    },
    {
      "name": "EntitlementTier",
      "kind": "enum",
      "language": "swift",
      "signature": "enum EntitlementTier: String, Codable, Sendable { case free, paid }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "EntitlementSnapshot",
      "kind": "struct",
      "language": "swift",
      "signature": "struct EntitlementSnapshot: Codable, Sendable { var tier: EntitlementTier; var cachedAt: Date }",
      "owning_lane": "data_domain",
      "notes": "Gate decisions read this cached value, never a live purchase check at the moment of action."
    },
    {
      "name": "EntitlementGateReason",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum EntitlementGateReason: String, Codable, Sendable, Error { case projectLimitReached, trackLimitReached, collaboratorsRequirePaid, exportRequiresPaid }",
      "owning_lane": "data_domain",
      "notes": "Stable reasons surfaced by domain and UI."
    },
    {
      "name": "ProjectLimits",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct ProjectLimits: Sendable { func canCreateProject(existingProjectCount: Int, entitlement: EntitlementSnapshot) -> Result<Void, EntitlementGateReason>; func canAddTrack(currentTrackCount: Int, entitlement: EntitlementSnapshot) -> Result<Void, EntitlementGateReason>; func canInviteCollaborator(entitlement: EntitlementSnapshot) -> Result<Void, EntitlementGateReason>; func canExport(entitlement: EntitlementSnapshot) -> Result<Void, EntitlementGateReason> }",
      "owning_lane": "data_domain",
      "notes": "Pure rule engine for local gating."
    },
    {
      "name": "ProjectSummary",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct ProjectSummary: Codable, Identifiable, Sendable { var id: ProjectID; var title: String; var recipientName: String; var occasion: OccasionKind; var theme: ThemeToken; var annotatedTrackCount: Int; var totalTrackCount: Int; var updatedAt: Date; var packageKind: PackageKind }",
      "owning_lane": "data_domain",
      "notes": "Shelf and widget-friendly lightweight summary."
    },
    {
      "name": "ProjectPackageManifest",
      "kind": "struct",
      "language": "swift",
      "signature": "struct ProjectPackageManifest: Codable, Sendable { var schemaVersion: Int; var packageKind: PackageKind; var project: Project; var exportedAt: Date; var appBuildVersion: String }",
      "owning_lane": "data_domain",
      "notes": "Same struct backs the Share preview and the Import Arrival read, so preview can never drift from the real export."
    },
    {
      "name": "ProjectPersistenceError",
      "kind": "enum",
      "language": "swift",
      "signature": "enum ProjectPersistenceError: Error, Sendable { case notFound; case decodeFailed; case encodeFailed; case atomicWriteFailed; case assetWriteFailed; case assetDeleteFailed }",
      "owning_lane": "data_domain",
      "notes": "Thrown by ProjectFileStore."
    },
    {
      "name": "ProjectImportError",
      "kind": "enum",
      "language": "swift",
      "signature": "enum ProjectImportError: Error, Sendable { case unsupportedSchema; case malformedManifest; case invalidPackageKind; case missingReferencedAsset; case fileTooLarge; case tooManyFiles; case securityValidationFailed }",
      "owning_lane": "data_domain",
      "notes": "Fail-closed package import errors, thrown by ProjectPackageImporting."
    },
    {
      "name": "ProjectFileStore",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol ProjectFileStore: Sendable { func loadLibraryIndex() async throws -> LibraryIndex; func loadProject(id: UUID) async throws -> Project; func save(_ project: Project) async throws; func deleteProject(id: UUID) async throws; func writeArtwork(_ data: Data, projectID: UUID, trackID: UUID) async throws -> String; func writeAudioFile(from tempURL: URL, projectID: UUID, noteID: UUID) async throws -> String; func audioFileURL(projectID: UUID, noteID: UUID) -> URL; func deleteAsset(projectID: UUID, relativeFilename: String) async throws; func sweepOrphanedAssets(projectID: UUID) async throws }",
      "owning_lane": "services_utilities",
      "notes": "Single local-truth persistence boundary; throws ProjectPersistenceError. Package import/export deliberately excluded \u2014 see ProjectPackageImporting/Exporting, since untrusted-package handling is a distinct trust boundary."
    },
    {
      "name": "MusicCatalogTrack",
      "kind": "struct",
      "language": "swift",
      "signature": "struct MusicCatalogTrack: Identifiable, Sendable { var id: String { catalogID }; let catalogID: String; let title: String; let artist: String; let artworkURL: URL?; let durationSeconds: TimeInterval? }",
      "owning_lane": "data_domain",
      "notes": "Lightweight search-result row; artworkURL is only for the Add Track results list preview. Adding a track triggers a separate fetch-and-write-to-disk step producing TrackEntry.artworkFilename \u2014 the search result itself never carries full image bytes."
    },
    {
      "name": "TrackPlaybackAvailability",
      "kind": "enum",
      "language": "swift",
      "signature": "enum TrackPlaybackAvailability: Sendable { case playable; case unavailable(openInAppleMusicURL: URL?) }",
      "owning_lane": "data_domain",
      "notes": "Drives the playback screen's 'Open in Apple Music' fallback; computed independently of the note experience."
    },
    {
      "name": "MusicLibraryProviding",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol MusicLibraryProviding: Sendable { func requestAuthorization() async -> MusicAuthorizationStatus; func search(term: String) async throws -> [MusicCatalogTrack]; func availability(forCatalogID id: String) async -> TrackPlaybackAvailability; func startPlayback(catalogID: String) async throws; func stopPlayback() async }",
      "owning_lane": "services_utilities",
      "notes": "Real impl wraps MusicAuthorization/MusicCatalogSearchRequest/ApplicationMusicPlayer; fake impl returns fixture arrays since real MusicKit is unreliable in Simulator/CI."
    },
    {
      "name": "MusicAuthorizationState",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum MusicAuthorizationState: Sendable { case notDetermined, authorized, denied, restricted }",
      "owning_lane": "services_utilities",
      "notes": "UI-visible authorization state."
    },
    {
      "name": "AudioMeterSample",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct AudioMeterSample: Sendable { var power: Float; var timestamp: TimeInterval }",
      "owning_lane": "services_utilities",
      "notes": "Cheap amplitude feed for waveform/spool skin."
    },
    {
      "name": "RecordingDraft",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct RecordingDraft: Sendable { var fileURL: URL; var durationSeconds: TimeInterval; var meterSamples: [AudioMeterSample] }",
      "owning_lane": "services_utilities",
      "notes": "Temporary captured note before commit into owned storage."
    },
    {
      "name": "AudioRecordingError",
      "kind": "enum",
      "language": "swift",
      "signature": "enum AudioRecordingError: Error, Sendable { case permissionDenied; case sessionUnavailable; case startFailed; case interrupted; case finalizeFailed }",
      "owning_lane": "data_domain",
      "notes": "Thrown by startRecording/stopRecording; distinct from the async events() stream."
    },
    {
      "name": "AudioRecording",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol AudioRecording: AnyObject, Sendable { func requestPermission() async -> Bool; func startRecording(to fileURL: URL, maxDuration: TimeInterval) throws; func stopRecording() async throws -> RecordingResult; func cancelRecording(); func events() -> AsyncStream<AudioRecordingEvent> }",
      "owning_lane": "services_utilities",
      "notes": "startRecording must feel instant (<300ms to visible recording state); fake impl can push .interrupted through events() to drive interruptedRecoverable in tests without real hardware."
    },
    {
      "name": "EntitlementProviding",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol EntitlementProviding: Sendable { func currentSnapshot() async -> EntitlementSnapshot; func refreshSnapshot() async -> EntitlementSnapshot; func canCreateAdditionalProject(currentCount: Int) -> Bool; func canAddTrack(currentCount: Int) -> Bool; func canAddCollaborator(currentCount: Int) -> Bool }",
      "owning_lane": "services_utilities",
      "notes": "The boundary-check functions are pure and unit-testable with no StoreKit involved; currentSnapshot/refreshSnapshot are the only async/StoreKit-touching members."
    },
    {
      "name": "ExtensionSummaryWriter",
      "kind": "protocol",
      "language": "Swift",
      "signature": "protocol ExtensionSummaryWriter { func write(summary: ProjectSummary) async throws; func clear(projectID: ProjectID) async throws }",
      "owning_lane": "services_utilities",
      "notes": "App-group summary writer for widget and live activity surfaces."
    },
    {
      "name": "ProjectLibrary",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable @MainActor final class ProjectLibrary { private(set) var entries: [LibraryIndexEntry]; private(set) var entitlement: EntitlementSnapshot; private(set) var importState: ImportState; func refresh() async; func createProject(title: String, recipientName: String, occasion: Occasion, theme: Theme, dedication: String?) async throws -> Project; func deleteProject(id: UUID) async throws; func importPackage(at url: URL) async throws -> ImportArrivalContext }",
      "owning_lane": "primary_ui",
      "notes": "@Observable requires a class, not a struct; createProject throws EntitlementError.projectLimitReached rather than silently ignoring the free-tier cap."
    },
    {
      "name": "NewProjectDraft",
      "kind": "struct",
      "language": "Swift",
      "signature": "struct NewProjectDraft: Sendable { var title: String; var recipientName: String; var occasion: OccasionKind; var dedication: String?; var theme: ThemeToken }",
      "owning_lane": "primary_ui",
      "notes": "Creation flow input payload."
    },
    {
      "name": "ImportState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum ImportState: Sendable { case idle; case processing; case failed(message: String) }",
      "owning_lane": "data_domain",
      "notes": "Shelf's transient import-processing/error banner state."
    },
    {
      "name": "ProjectEditor",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable @MainActor final class ProjectEditor { private(set) var project: Project; private(set) var addTrackState: AddTrackState; private(set) var saveState: SaveState; func addTrack(_ track: MusicCatalogTrack) async throws; func removeTrack(id: UUID) async throws; func moveTrackEarlier(id: UUID) async throws; func moveTrackLater(id: UUID) async throws; func reorderTracks(from source: IndexSet, to destination: Int) async throws; func attachTextNote(trackID: UUID, body: String) async throws; func removeVoiceNote(trackID: UUID) async throws; func beginRecording(trackID: UUID) -> RecordCaptureViewModel; func exportPackage(kind: PackageKind) async throws -> URL }",
      "owning_lane": "primary_ui",
      "notes": "moveTrackEarlier/moveTrackLater and reorderTracks call the identical underlying mutation, satisfying the single-mutation-path accessibility requirement. addTrack throws EntitlementError.trackLimitReached at the 6th track."
    },
    {
      "name": "PlaybackScreenState",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum PlaybackScreenState: Sendable { case idle; case loadingTrack(TrackEntryID); case playing(TrackEntryID); case unavailable(TrackEntryID, openInAppleMusicURL: URL?); case failed(message: String) }",
      "owning_lane": "primary_ui",
      "notes": "Playback UI never assumes songs resolve."
    },
    {
      "name": "SaveState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum SaveState: Sendable { case clean; case dirty; case saving; case failed(message: String) }",
      "owning_lane": "data_domain",
      "notes": "User-visible autosave feedback surfaced by ProjectEditor."
    },
    {
      "name": "RecordingScreenState",
      "kind": "enum",
      "language": "Swift",
      "signature": "enum RecordingScreenState: Sendable { case idle; case recording(elapsed: TimeInterval, remaining: TimeInterval, meter: AudioMeterSample?); case interruptedRecoverable; case preview(RecordingDraft); case micDenied; case failed(message: String) }",
      "owning_lane": "primary_ui",
      "notes": "Explicit record flow state machine."
    },
    {
      "name": "beginRecordingFlow",
      "kind": "function",
      "language": "Swift",
      "signature": "func beginRecordingFlow(recorder: AudioRecording, maxDuration: TimeInterval) async -> RecordingScreenState",
      "owning_lane": "polish_resilience",
      "notes": "Shared resilience helper for starting recording with permission/interruption handling."
    },
    {
      "name": "recoverFromInterruption",
      "kind": "function",
      "language": "Swift",
      "signature": "func recoverFromInterruption(editor: ProjectEditor, trackID: TrackEntryID, recorder: AudioRecording) async -> RecordingScreenState",
      "owning_lane": "polish_resilience",
      "notes": "Defines the interrupted-recoverable behavior contract."
    },
    {
      "name": "validateImportedPackage",
      "kind": "function",
      "language": "swift",
      "signature": "func validateImportedPackage(at url: URL, maxTotalBytes: Int, maxFileCount: Int) async throws -> ProjectPackageManifest",
      "owning_lane": "polish_resilience",
      "notes": "Shared validator called by ProjectPackageImporting.inspect() before any copy into owned storage."
    },
    {
      "name": "Occasion",
      "kind": "enum",
      "language": "swift",
      "signature": "enum Occasion: String, Codable, Sendable { case birthday, goodbye, anniversary, newBaby, justBecause }",
      "owning_lane": "data_domain",
      "notes": "Fixed chip set, not free text."
    },
    {
      "name": "Theme",
      "kind": "enum",
      "language": "swift",
      "signature": "enum Theme: String, Codable, Sendable { case amber, fadedRed, tobacco, charcoal }",
      "owning_lane": "data_domain",
      "notes": "Maps to design token accent set; charcoal is the dark variant."
    },
    {
      "name": "LinerNoteContent",
      "kind": "enum",
      "language": "swift",
      "signature": "enum LinerNoteContent: Codable, Sendable { case voice(audioFilename: String, durationSeconds: Double); case text(body: String) }",
      "owning_lane": "data_domain",
      "notes": "Text and voice are equal-weight variants of one type, never a fallback flag."
    },
    {
      "name": "Contributor",
      "kind": "struct",
      "language": "swift",
      "signature": "struct Contributor: Identifiable, Codable, Sendable { let id: UUID; var displayName: String; var role: ContributorRole }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "LibraryIndexEntry",
      "kind": "struct",
      "language": "swift",
      "signature": "struct LibraryIndexEntry: Identifiable, Codable, Sendable { let id: UUID; var title: String; var recipientName: String; var occasion: Occasion; var theme: Theme; var trackCount: Int; var annotatedCount: Int; var isFinished: Bool; var updatedAt: Date }",
      "owning_lane": "data_domain",
      "notes": "Cheap shelf-load projection; avoids decoding every full Project on launch."
    },
    {
      "name": "LibraryIndex",
      "kind": "struct",
      "language": "swift",
      "signature": "struct LibraryIndex: Codable, Sendable { var entries: [LibraryIndexEntry] }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "SharedProjectSummary",
      "kind": "struct",
      "language": "swift",
      "signature": "struct SharedProjectSummary: Codable, Sendable { var projectID: UUID; var title: String; var recipientName: String; var annotatedCount: Int; var totalCount: Int; var themeToken: String; var isFinished: Bool }",
      "owning_lane": "data_domain",
      "notes": "The only type the widget/Live Activity extension target ever imports; written via App Group container."
    },
    {
      "name": "MusicAuthorizationStatus",
      "kind": "enum",
      "language": "swift",
      "signature": "enum MusicAuthorizationStatus: Sendable { case notDetermined, authorized, denied, restricted }",
      "owning_lane": "data_domain",
      "notes": "Single canonical name, replacing duplicate MusicAuthorizationState."
    },
    {
      "name": "RecordingResult",
      "kind": "struct",
      "language": "swift",
      "signature": "struct RecordingResult: Sendable { let fileURL: URL; let durationSeconds: Double }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "AudioRecordingEvent",
      "kind": "enum",
      "language": "swift",
      "signature": "enum AudioRecordingEvent: Sendable { case levelUpdate(Float); case interrupted; case resumed }",
      "owning_lane": "data_domain",
      "notes": "interrupted/resumed sourced from AVAudioSession.interruptionNotification, not custom polling."
    },
    {
      "name": "AudioPlayback",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol AudioPlayback: AnyObject, Sendable { func play(url: URL) throws; func pause(); func stop() }",
      "owning_lane": "services_utilities",
      "notes": "Used for note playback (voice liner notes), not MusicKit song playback."
    },
    {
      "name": "ProjectPackageExporting",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol ProjectPackageExporting: Sendable { func makePackage(for project: Project, kind: PackageKind) async throws -> URL }",
      "owning_lane": "services_utilities",
      "notes": "Returns a URL to the .linernotes-typed directory package; never bundles licensed audio."
    },
    {
      "name": "ProjectPackageImporting",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol ProjectPackageImporting: Sendable { func inspect(packageAt url: URL) async throws -> ProjectPackageManifest; func importProject(packageAt url: URL) async throws -> Project }",
      "owning_lane": "services_utilities",
      "notes": "inspect() decodes+validates only (delegates to validateImportedPackage), never opens in place; importProject copies into app storage or throws ProjectImportError on schema/size/type violation."
    },
    {
      "name": "WidgetSummaryWriting",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol WidgetSummaryWriting: Sendable { func write(_ summary: SharedProjectSummary) async throws; func writeRecent(_ summaries: [SharedProjectSummary]) async throws; func clear(projectID: UUID) async throws }",
      "owning_lane": "services_utilities",
      "notes": "Writes to the App Group container the widget/Live Activity extension reads from."
    },
    {
      "name": "AppEnvironment",
      "kind": "struct",
      "language": "swift",
      "signature": "struct AppEnvironment: Sendable { let musicLibrary: MusicLibraryProviding; let audioRecordingFactory: @Sendable () -> AudioRecording; let audioPlaybackFactory: @Sendable () -> AudioPlayback; let projectFileStore: ProjectFileStore; let entitlement: EntitlementProviding; let packageExporter: ProjectPackageExporting; let packageImporter: ProjectPackageImporting; let widgetSummaryWriter: WidgetSummaryWriting; static func live() -> AppEnvironment; static func fake(fixture: String?) -> AppEnvironment }",
      "owning_lane": "services_utilities",
      "notes": "Composition root selected by -linernotesUITestMode launch argument + LINERNOTES_FIXTURE env var; the DI seam every test tier depends on."
    },
    {
      "name": "DebouncedSaveController",
      "kind": "struct",
      "language": "swift",
      "signature": "final class DebouncedSaveController { init(store: ProjectFileStore, debounceMilliseconds: Int = 300); func scheduleSave(_ project: Project); func forceFlush() async }",
      "owning_lane": "services_utilities",
      "notes": "Owned by ProjectEditor; forceFlush is called from one scenePhase observer at app root plus interruption/termination paths."
    },
    {
      "name": "AddTrackState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum AddTrackState: Sendable { case authorizing; case denied; case idle; case searching(term: String); case results([MusicCatalogTrack]); case empty(term: String); case blockedByEntitlement }",
      "owning_lane": "primary_ui",
      "notes": "denied state must offer retry, never be a dead end."
    },
    {
      "name": "RecordCaptureState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum RecordCaptureState: Sendable { case idle; case recording(elapsedSeconds: Double, level: Float); case interruptedRecoverable(elapsedSeconds: Double); case recordedPreview(durationSeconds: Double); case reRecordConfirm; case textDraft(String); case textSaved(String); case micDenied }",
      "owning_lane": "primary_ui",
      "notes": "interruptedRecoverable must only be reachable via a real AVAudioSession interruption event (or the fake's synthesized one) in tests, never a stub flag."
    },
    {
      "name": "RecordCaptureViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable @MainActor final class RecordCaptureViewModel { private(set) var state: RecordCaptureState; func startRecording(); func stopAndSave() async throws; func discardRecording(); func switchToText(); func saveText(_ body: String) async throws }",
      "owning_lane": "primary_ui",
      "notes": "startRecording must feel instant (<300ms to visible recording state); re-record path deletes the prior audio file from disk immediately via ProjectFileStore.deleteAsset."
    },
    {
      "name": "PlaybackState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum PlaybackState: Sendable { case idle; case loadingTrack(UUID); case playing(UUID); case unavailable(UUID, openInAppleMusicURL: URL?); case failed(message: String) }",
      "owning_lane": "primary_ui",
      "notes": "unavailable never renders as a spinner and always carries a concrete deep link; note audio/text continues regardless of song availability."
    },
    {
      "name": "PlaybackViewModel",
      "kind": "struct",
      "language": "swift",
      "signature": "@Observable @MainActor final class PlaybackViewModel { private(set) var state: PlaybackState; private(set) var currentIndex: Int; func play(); func pause(); func advance(to index: Int) }",
      "owning_lane": "primary_ui",
      "notes": ""
    },
    {
      "name": "ImportArrivalContext",
      "kind": "struct",
      "language": "swift",
      "signature": "struct ImportArrivalContext: Sendable { var manifest: ProjectPackageManifest; var kind: PackageKind }",
      "owning_lane": "data_domain",
      "notes": ""
    },
    {
      "name": "ImportArrivalState",
      "kind": "enum",
      "language": "swift",
      "signature": "enum ImportArrivalState: Sendable { case keepsakeIntro(ImportArrivalContext); case contributorIntro(ImportArrivalContext); case failed(reason: String) }",
      "owning_lane": "primary_ui",
      "notes": "failed is fail-closed and non-crashing; never falls through to the track list."
    },
    {
      "name": "EntitlementError",
      "kind": "enum",
      "language": "swift",
      "signature": "enum EntitlementError: Error, Sendable { case projectLimitReached; case trackLimitReached; case collaboratorNotAllowed }",
      "owning_lane": "data_domain",
      "notes": "Thrown by ProjectLibrary/ProjectEditor at the exact action point, driving the contextual PaywallSheet."
    },
    {
      "name": "MusicKitMusicLibraryProvider",
      "kind": "struct",
      "language": "swift",
      "signature": "final class MusicKitMusicLibraryProvider: MusicLibraryProviding { }",
      "owning_lane": "services_utilities",
      "notes": "Live implementation wrapping MusicAuthorization + MusicCatalogSearchRequest + ApplicationMusicPlayer."
    },
    {
      "name": "AVAudioRecordingService",
      "kind": "struct",
      "language": "swift",
      "signature": "final class AVAudioRecordingService: AudioRecording { }",
      "owning_lane": "services_utilities",
      "notes": "Wraps AVAudioRecorder + AVAudioSession.interruptionNotification; mono AAC 32-48kbps settings fixed here."
    },
    {
      "name": "FileManagerProjectStore",
      "kind": "struct",
      "language": "swift",
      "signature": "actor FileManagerProjectStore: ProjectFileStore { }",
      "owning_lane": "services_utilities",
      "notes": "Actor-isolated for off-main file I/O; atomic write-then-rename; owns the orphan-sweep implementation."
    },
    {
      "name": "StoreKitEntitlementProvider",
      "kind": "struct",
      "language": "swift",
      "signature": "final class StoreKitEntitlementProvider: EntitlementProviding { }",
      "owning_lane": "services_utilities",
      "notes": "Built against a local .storekit config; boundary logic itself is must-have, live purchase wiring is out of scope."
    },
    {
      "name": "FakeServiceDoubles",
      "kind": "struct",
      "language": "swift",
      "signature": "enum FakeServices { static func musicLibrary(fixture: String?) -> MusicLibraryProviding; static func audioRecording() -> AudioRecording; static func projectFileStore(inMemory: Bool) -> ProjectFileStore; static func entitlement(tier: EntitlementTier) -> EntitlementProviding }",
      "owning_lane": "services_utilities",
      "notes": "Backs both unit tests and the -linernotesUITestMode XCUITest seam; fake AudioRecording can synthesize .interrupted via events()."
    },
    {
      "name": "SchemaMigrator",
      "kind": "protocol",
      "language": "swift",
      "signature": "protocol SchemaMigrator: Sendable { func migrate(rawJSON: Data, fromVersion: Int) throws -> Project }",
      "owning_lane": "polish_resilience",
      "notes": "Fail-closed: unrecognized/future schema versions throw rather than attempt a best-effort partial decode."
    },
    {
      "name": "AccessibilityReorderActions",
      "kind": "function",
      "language": "swift",
      "signature": "extension View { func trackReorderActions(moveEarlier: @escaping () -> Void, moveLater: @escaping () -> Void) -> some View }",
      "owning_lane": "polish_resilience",
      "notes": "Applies the custom VoiceOver 'Move earlier'/'Move later' accessibility actions, calling the same ProjectEditor methods as drag."
    },
    {
      "name": "ReducedMotionFallback",
      "kind": "function",
      "language": "swift",
      "signature": "extension EnvironmentValues { var linernotesReduceMotion: Bool { get } }",
      "owning_lane": "polish_resilience",
      "notes": "Wraps accessibilityReduceMotion; every spool/flip/breathing animation branches on this with a static/cross-fade fallback."
    },
    {
      "name": "FakeServices",
      "kind": "struct",
      "language": "swift",
      "signature": "enum FakeServices { static func musicLibrary(fixture: String?) -> MusicLibraryProviding; static func audioRecording() -> AudioRecording; static func audioPlayback() -> AudioPlayback; static func projectFileStore(inMemory: Bool) -> ProjectFileStore; static func entitlement(tier: EntitlementTier) -> EntitlementProviding; static func packageExporter() -> ProjectPackageExporting; static func packageImporter() -> ProjectPackageImporting; static func widgetSummaryWriter() -> WidgetSummaryWriting }",
      "owning_lane": "services_utilities",
      "notes": "Backs both unit tests and the -linernotesUITestMode XCUITest seam."
    }
  ]
}
```

## Verification

FAILED (compile FAILED for the iOS Simulator)

## Findings

```json
[
  {
    "schema_version": 1,
    "source": "secret_scan",
    "category": "secret_hardcoded",
    "severity": "Critical",
    "confidence": "high",
    "title": "Hardcoded secret (assignment) at LinernotesKit/Sources/LinernotesKit/Models/SharedProjectSummary.swift:28",
    "file": "LinernotesKit/Sources/LinernotesKit/Models/SharedProjectSummary.swift",
    "line": 28,
    "why": "A assignment-shaped credential is committed in generated source.",
    "fix": "Move the value to secure configuration (Keychain / env / build settings) and rotate the exposed credential.",
    "status": "open"
  }
]
```