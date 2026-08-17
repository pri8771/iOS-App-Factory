# Handoff

## What the project is

Anjali is an offline Hindu micro-prayer app for iOS 17+. It gives a practitioner
one short contextual prayer without accounts, tracking, a feed, or pressure
mechanics.

## Current state

The core app is implemented and Release-compilable. Factory registration and
feature contracts are present. On the dirty current tree, 75/75
unit/integration and 12/12 current UI tests pass across large/compact iPhone
and iPad. A clean signed Debug build with zero audio installs and launches on
the connected iPhone 16 Pro Max. Manual device/accessibility checks remain
open; no clean exact-commit release gate is green. External release remains
blocked by named prayer review, human audio acquisition, public URLs,
accessibility/device QA, distribution signing, and App Store Connect work. See
`docs/STATUS.md` and `docs/DAILY_USE_PRODUCT_PLAN.md`. The complete executable sequence is
`docs/TESTFLIGHT_READINESS_BACKLOG.md`; do not reconstruct it from Jira or
Notion. Each task's Haiku-executable subtask plan is in
`docs/testflight-tasks/`.

## Build and run

Use Xcode 26+:

```bash
./Scripts/build.sh
python3 Scripts/validate_prayers.py
python3 Scripts/validate_prayers.py --require-signoff
```

The last command is expected to fail until the human content gate closes.

## Important constraints

- iOS 17+, SwiftUI/SwiftData, Swift 5 language mode.
- Local-only; no backend/network/third-party dependency.
- Data Not Collected; optional local notifications only.
- Never fabricate Sanskrit, provenance, reviewer identity, or audio approval.
- Do not label the project done while device/human gates remain.

## Known issues

Reference `docs/BUGS.md`.

## Next recommended task

Run the following human/account gates in parallel:

1. appoint the named cultural/theological reviewer and complete the 22-record
   review without fabricating provenance; and
2. have the Account Holder confirm agreements, team/App ID ownership, and the
   App Store Connect app record.

Also supply a public privacy-policy URL, support URL, and monitored beta contact
for TF-003. App Store Connect is currently signed out in the available browser
sessions. A Development identity/profile can sign and install Debug, but the
authorized owner must still verify App Store distribution identity,
provisioning, agreements, roles, and the app record.
Use `AppStore/testflight_metadata.md` for the beta packet and
`docs/templates/TESTFLIGHT_QA_EVIDENCE.md` for human/device evidence.
The TF-001 reviewer worksheet and TF-002/TF-003/TF-004 repository preflights
are linked from their detailed briefs under `docs/testflight-tasks/`.
The future frozen-SHA automation and current baseline are documented in
`quality/evidence/2026-07-29-tf-006-release-automation.md` and
`quality/evidence/2026-07-29-current-engineering-preflight.md`.

## Marketing-page handoff

The owner opened a parallel public-website track covering three distinct
Anjali landing-page concepts, three icon candidates, real screenshot capture,
and an app-specific HubSpot waitlist. Execute and update
`docs/MARKETING_LANDING_PAGE_TASKS.md`; do not infer approval from the local
Claude Design ZIP or publish unreviewed sacred content or audio claims.
