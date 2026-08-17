# Test Plan

## Required suites

- Model relationships, deletion cascades, derived state, and migrations.
- `DecisionDraft`, clarity, minimum quick-capture fields, and optional enrichment.
- Statistics and minimum-sample behavior for every Insights claim.
- Demo insertion idempotency, coexistence, legacy recognition, targeted deletion,
  export behavior, and preservation of user records.
- Notification scheduling, cancellation, permission denial, and reconciliation.
- JSON/PDF export and full user-data deletion.
- UI smoke: onboarding demo, remove demo, quick capture, review, Insights, relaunch.
- Small/standard/large phones with keyboard, Dynamic Type, VoiceOver, and dark appearance.

## Environment limitations

- Notification delivery and authorization transitions require physical-device QA.
- Subjective capture friction and Insights usefulness require uncoached human review.
- Automated unit, integration, and UI-smoke targets now exist; the 2026-07-30 dedicated-simulator
  integrated foundation regression passed 80/80 tests, including seven default-off Social v2
  rollout-policy tests and Quick Capture at the largest accessibility text size.
  Hosted foundation run `30591583112` passed the complete shared scheme plus syntax, whitespace,
  contract, privacy, credential, and dynamic-simulator gates.
  Physical notification/deep-link, manual VoiceOver, manual largest-Dynamic-Type review of
  resolution and Insights, export/delete/relaunch, and distribution signing remain
  `verification_pending`.

## Social v2 planned suites

Before any Social v2 phase reaches `qa`, add task-specific coverage from
`SOCIAL_PRODUCT_V2_IMPLEMENTATION_PLAN.md`, including:

- authentication token, replay, revocation, and cross-account cases;
- server authorization matrices for friends, blocks, groups, roles, and visibility;
- idempotent/concurrent forecast locking against server UTC deadlines;
- migration consent, interruption, relaunch, duplicate, and recovery fixtures;
- offline outbox, conflict, stale realtime event, pagination, and removed-access behavior;
- resolution, dispute, void, correction, scoring version, and leaderboard reconciliation;
- universal-link/iMessage installed, uninstalled, signed-out, expired, forwarded, and tampered
  routes;
- telemetry/push/share payload leakage tests;
- moderation, anti-cheat, environment isolation, backup/restore, load, and rollback drills.

Foundation contract checks additionally include:

- parse and structurally validate `Contracts/social-v1.openapi.yaml`, then run full OpenAPI lint
  and generated-client compatibility after F0.7 approves a pinned toolchain;
- run the disposable PostgreSQL RLS/negative/concurrency/immutability/outbox/reconciliation/
  isolation/restore spike using synthetic data;
- validate all write-operation idempotency/security/schema requirements and the 18 synthetic
  contract expectations without misrepresenting declarations as live-backend results;
- reject content-bearing telemetry/push fields through the machine-readable allowlist and all 13
  deterministic privacy fixtures;
- validate non-secret environment manifests and reject placeholder, mixed-environment, non-HTTPS,
  secret-bearing, or branch/environment-mismatched promotion inputs;
- run the local client CI command against an explicit simulator destination and retain the
  `.xcresult` summary; the integrated 2026-07-30 run passed 80/80 with no failures or skips at
  `/private/tmp/hindsight-social-foundation-wave2-20260730.xcresult`;
- require the same shared scheme and repository gates on hosted pushes/PRs to `dev` and `qa`;
  GitHub Actions run `30591583112` is the first green hosted evidence;
- treat Figma/prototype review, product-owner approval, legal review, hosted-provider behavior,
  APNs, backup restore, and cross-project isolation as checks not run until their real evidence
  exists.
