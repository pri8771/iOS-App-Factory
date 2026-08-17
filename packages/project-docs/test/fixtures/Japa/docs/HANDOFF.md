---
id: DOC-HANDOFF
canonicalFor: next-agent-context
status: active
lastVerified: 2026-08-06
readWhen:
  - starting work in a fresh session with no prior context
related:
  - STATUS.md
  - DECISIONS.md
supersedes: []
---

# Handoff

## What the project is

Mala is a local-first iOS digital mala for daily repetition practice. Differentiator: eyes-free, interruption-safe, haptic-confirmed counting with a distinct end-of-round signal. Internal code, scheme, bundle, and persistence identifiers retain the original `Japa` name.

## Current state (2026-08-06)

- Registered with App Factory as **existing**; product lifecycle state is **`verified`** (registration/onboarding complete)
- **Enrolled in Studio OS** as **`PROD-JAPA`** (`pri8771/studio-ios`); product-side pointer in `.factory/studio-link.json`; Studio OS is an external portfolio mirror, not the product authority
- v1 implementation present and **on-device validated** on iPhone 16 Pro Max (2026-07-18)
- Automated suite: **69 tests (56 unit/flow + 13 UI), all passing** — re-verified 2026-08-06; the added UI case validates the deterministic 9m 0s App Store history fixture; see `docs/STATUS.md`/`TEST_PLAN.md`
- **Automated-UI-testing foundation** in `quality/ui/` (screens/journeys/safe-actions + generated Maestro flows); deterministic `UI_TEST_MODE`/`UI_FIXTURE` contract in `Japa/JapaApp.swift`
- Platforms: **iOS / iPhone only** (DEC-003)
- Standard lock: `pri8771/iOS_app_factory_rules` @ `0.4.0` (upgraded from `0.2.0` on 2026-07-17 — DEC-004)
- **TestFlight beta:** Build 1 is in Testing. Build 2 was uploaded manually through Xcode Organizer, processed as `Ready to Submit`, and confirmed working through TestFlight on 2026-08-06. `ASC_KEY_CONTENT` remains missing but blocks only optional GitHub automation.
- **App Store submission:** five final screenshots and all required product metadata are accepted; Data Not Collected is published; non-trader DSA status is Active in 27 EU regions; version 1.0 Build 2 was submitted on 2026-08-06 at 11:40 PM and is Waiting for Review under submission `897d1493-c2f1-474f-afa6-01d3e92694c4`. Release remains manual. Exact store name `Mala` was unavailable, so the store record remains `Mala: A Quiet Digital Mala`; the device display name is still `Mala`.
- Jira mirror project is **`MALA`**; repository documents are authoritative and the older `JAPA`/`JALA` trackers are historical only (see `docs/GOVERNANCE.md` and `docs/JIRA_SYNC_PENDING.md`)

## Read first

1. `.factory/repository-map.json`
2. `.factory/project-context.json`
3. `.factory/standard-lock.json`
4. `.factory/studio-link.json`
5. `docs/README.md`
6. `docs/GOVERNANCE.md`
7. `docs/STATUS.md`
8. `docs/ARCHITECTURE.md`
9. `LAUNCH_READINESS.md`
10. `quality/feature-contracts/FEAT-001*.json` through `FEAT-003*.json`
11. `quality/ui/README.md` (automated UI-testing foundation)

## Do not

- Re-scaffold or rewrite the engine
- Add streaks, notifications, backend, or third-party SDKs
- Claim iPad support
- Mark work `done` without evidence

## Next verification

Bundled spiritual content has been removed. Build 2 is processed, confirmed working through TestFlight, and Waiting for Review. Monitor submission `897d1493-c2f1-474f-afa6-01d3e92694c4`; after approval, perform the final product-page check and manually release. VoiceOver user validation is explicitly deferred post-v1 with residual risk recorded in MALA-7. Device haptics + full round + all 21 mala styles were validated on physical iPhone 16 Pro Max on 2026-07-18. GitHub automation may be configured later and is not a release blocker.
