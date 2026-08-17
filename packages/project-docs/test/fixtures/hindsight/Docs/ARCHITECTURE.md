# Architecture

## Target architecture — Social v2

The accepted product direction is a hybrid networked architecture. The existing local Build 1
implementation remains the current shipped candidate while the foundation in
`SOCIAL_PRODUCT_V2_IMPLEMENTATION_PLAN.md` is designed and verified.

```text
SwiftUI feature views
    -> domain/repository protocols
       -> local SwiftData store (drafts + legacy private journal)
       -> sync cache/outbox (offline network state)
       -> versioned API
          -> identity + authorization
          -> groups/friends/invites
          -> immutable forecasts + resolution ledger
          -> scoring/leaderboards/analytics
          -> moderation + audit + notifications
          -> relational database + background jobs
```

Authority is per domain:

- Device: unsaved drafts and legacy private records until explicit migration consent.
- Server: accounts, profiles, friends, blocks, invites, groups, memberships, social/public events,
  locked forecasts and timestamps, resolutions, disputes, scores, leaderboards, moderation, and
  audit events.
- Device cache: read models and an idempotent outbox; never authoritative for a social lock,
  resolution, membership, or score.

ADR-008 now proposes Supabase-hosted Postgres behind a thin Hindsight-owned versioned API, with
native Sign in with Apple on iOS and no approved vendor SDK. The decision remains conditional:
the F0.3 disposable spike must prove authentication replay defenses, negative authorization,
atomic immutable locking, realtime/APNs recovery, backup/export, and environment isolation.
Until that evidence exists, the backend vendor remains unaccepted. API schemas, server
authorization, UTC deadlines, idempotency, auditability, offline recovery, and environment
isolation are required regardless of vendor.

The current vendor-neutral semantic contract is
`Docs/SOCIAL_V2_DOMAIN_API_CONTRACT.md`; its machine-readable draft is
`Contracts/social-v1.openapi.yaml`. Neither permits clients to write integrity-sensitive tables
directly. `SocialV2RolloutPolicy` is the current client-side foundation boundary: all flags are
off by default, decisions are bound to environment/account/contract/build, invalid dependencies
fail closed, and there is deliberately no runtime configuration loader or Social v2 UI yet.

## Current architecture

Hindsight is a native SwiftUI and SwiftData app. The root view gates onboarding
and the main tab shell. Decision capture uses a transient `DecisionDraft` across
four paged views, then writes related decisions, options, predictions, and reviews
to SwiftData. `Statistics` derives Insights from local models. Notification and
export managers provide reminders and JSON/PDF output.

## Data flow

```text
Capture UI -> DecisionDraft validation -> SwiftData decision graph
-> Today/Decisions/Review -> Statistics -> Insights
                               -> Notification scheduling
                               -> JSON/PDF export
```

## Persistence

- Decisions own options, predictions, and outcome reviews through cascading relationships.
- Demo decisions use stable identifiers and can be removed without deleting user decisions.
- Full deletion and export are user initiated.
- Draft interruption, migration, relaunch, and reminder reconciliation require tests.

## External dependencies

- Apple SwiftUI, SwiftData, Charts, UserNotifications, and UIKit share/PDF surfaces.
- The current Build 1 binary has no backend, account, analytics SDK, or third-party runtime
  dependency.
- Social v2 permits a backend but no provider or third-party runtime dependency is approved yet.
- A managed Postgres/Supabase approach is proposed for a disposable spike only. No production
  account, credential, iOS SDK, or external user data is approved.
- Local F0 tooling uses Ruby/JSON/YAML, shell, and disposable PostgreSQL only; it is not shipped
  in the application target.

## Known architectural risks

- Capture validity is coupled to four mandatory steps.
- Statistics are unprotected by automated tests.
- Notification scheduling is difficult to verify without abstraction and device QA.
- Demo identification includes compatibility handling for legacy title-based samples.
- Social v2 adds identity, authorization, migration, offline sync, resolution integrity,
  moderation, anti-cheat, and operations risks. The foundation gates in the Social v2 plan must be
  complete before feature implementation.
