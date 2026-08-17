# Decisions

## DEC-001 — Project registration

- **Status:** accepted
- **Context:** This repository is governed by the App Factory standards.
- **Decision:** Use `.factory/project-context.json` as the authoritative project classification marker.
- **Consequences:** Agents must read the registration and quality files before coding.

## DEC-002 — Capture depth

- **Status:** proposed
- **Context:** The four mandatory steps create excessive friction before value.
- **Decision:** Support a compact quick capture and treat alternatives, detailed trade-offs, and predictions as optional enrichment.
- **Consequences:** A worker must define minimum fields and behavior for partial decisions before implementation.

## DEC-003 — Demo data

- **Status:** accepted
- **Context:** Empty Insights and zero-count dashboards do not explain the product.
- **Decision:** Recommend an explicit removable demo during onboarding; allow it alongside user data and remove only tagged demo records.
- **Consequences:** Demo data must remain distinguishable, idempotent, and excluded from user exports unless clearly disclosed.

## DEC-004 — Insights purpose

- **Status:** accepted
- **Context:** A long metric stack is less useful than a clear lesson or next action.
- **Decision:** Prioritize review backlog, calibration, recurring patterns, and sample-aware explanations.
- **Consequences:** Every displayed claim requires deterministic statistics coverage.

## DEC-005 — Networked social product direction

- **Status:** accepted
- **Date:** 2026-07-30
- **Context:** Private group predictions, friends, shared scoreboards, iMessage challenges, curated
  public events, and public leaderboards require identity, shared state, server-authoritative
  timestamps, resolution operations, moderation, and anti-cheat controls. The previous
  local-only/backend-prohibited constraint cannot support the approved product.
- **Decision:** Hindsight becomes a networked social prediction platform with a valuable private
  mode. A backend is permitted. The Social v2 program is governed by
  `SOCIAL_PRODUCT_V2_IMPLEMENTATION_PLAN.md`; its foundation gates precede social feature code.
- **Consequences:** App Store disclosures, privacy policy, account deletion, Terms, infrastructure,
  support, safety, and release operations must change before a networked build reaches testers.
  The existing Build 1 release remains a separately testable local product and is not represented
  as already networked.

## DEC-006 — Hybrid data authority and explicit sharing

- **Status:** accepted
- **Date:** 2026-07-30
- **Context:** The factory currently exposes a Boolean `localFirst` constraint, but the approved
  architecture needs different authority by data domain.
- **Decision:** Unsaved drafts and legacy journal records remain device-authoritative until
  explicit migration consent. Accounts, relationships, groups, social/public events, forecasts,
  server timestamps, resolutions, scores, and leaderboards are server-authoritative. Devices may
  cache server data and queue permitted mutations, but must not claim a social lock or result
  before server acknowledgement.
- **Consequences:** Existing content is never silently uploaded. Visibility is explicit
  (`private`, `group`, `unlisted`, or `public`) and enforced server-side. The project context sets
  `localFirst` to false because the product is no longer exclusively local-first; this decision is
  the more precise authority contract until the central schema supports a hybrid value.

## DEC-007 — Backend dependencies require a separate architecture decision

- **Status:** accepted
- **Date:** 2026-07-30
- **Context:** A backend is approved, but no vendor, hosted processor, or iOS client SDK has been
  selected.
- **Decision:** Keep third-party runtime dependencies prohibited until F0.3 records a specific ADR
  and change request naming each dependency, purpose, privacy/license impact, update owner, cost,
  exit strategy, and native/protocol boundary.
- **Consequences:** Planning may evaluate vendors and use throwaway spikes, but production feature
  code must not introduce an unapproved SDK or credential.

## DEC-008 — Conditional managed-Postgres backend direction

- **Status:** proposed; not accepted until the F0.3 proof-of-fitness spike passes
- **Date:** 2026-07-30
- **Context:** The weighted comparison in `SOCIAL_V2_BACKEND_EVALUATION.md` favors relational
  authorization and transactions for groups, immutable forecast locks, resolution ledgers,
  scoring, moderation, and leaderboards. A fully custom service provides maximum control but
  transfers operations and security ownership too early; Firebase increases relational and
  aggregation complexity; CloudKit does not satisfy the independent public-network authority.
- **Proposed decision:** Use Supabase-hosted Postgres in isolated projects, behind a thin
  vendor-neutral Hindsight API and transactional server functions. iOS uses native
  `AuthenticationServices`; no Supabase iOS SDK or generic direct-table mutation is approved.
- **Acceptance gate:** Prove Apple-token validation/replay rejection, outsider/removed/blocked
  authorization, one atomic server-UTC forecast lock and audit event under concurrency, immutable
  resolution/score ledgers, private realtime/APNs recovery, backup/export, and dev/QA isolation
  with synthetic data.
- **Consequences:** Until the spike passes, this remains an evaluation target rather than a
  dependency or infrastructure commitment. Failure reopens the decision; it never permits a
  client-authoritative fallback.

## DEC-009 — Future Postcards v3 reflection-first personal baseline

- **Status:** accepted
- **Date:** 2026-08-08
- **Context:** The approved `Hindsight - Future Postcards - Production Candidate v3 - Guided Start - Complete Clickable` design and its v3 specification establish a guided-start, reflection-first experience. Existing Social v2 planning remains valuable but would be premature as the first implementation target if it replaces the personal habit loop.
- **Decision:** Implement the Future Postcards v3 personal core first: one local prediction statement, intentional 0–100 confidence, optional Why, future return date, atomic local seal, durable draft, later resolution/reflection, and central sample-aware analytics. Personal records remain local SwiftData-authoritative in this slice. Social capabilities are additive—not a replacement for private reflection—and must remain feature-flagged off/fail-closed until their separately approved account, authority, safety, and backend gates are met.
- **Consequences:** The implementation baseline is `FUTURE_POSTCARDS_V3_IMPLEMENTATION_BASELINE.md` and the executable quality boundary is `quality/feature-contracts/future-postcards-v3-personal-core.json`. Guided samples require explicit provenance and strict isolation from personal metrics and data. Accounts, synchronization, friends, Circles, shared forecasts, messages, public events, leaderboards, and backend vendor work are staged later work; this decision neither claims they ship nor reverses DEC-005 through DEC-008.
