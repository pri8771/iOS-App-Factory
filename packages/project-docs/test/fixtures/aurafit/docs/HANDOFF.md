# Handoff

## What the project is

AuraFit is a local-first iPhone outfit and camera coach that analyzes a full-body
photo, explains the result, and creates a shareable scorecard.

## Current state

The repository now conforms to the registered App Factory 0.4.0 structure and its
audited source is `code_complete`. The canonical TestFlight backlog contains 26 task plans,
179 stable subtasks, and 26 matching evidence/runbook packs. Release status remains
`human_review_required`: GitHub CI, Apple access/signing, physical-device QA, StoreKit sandbox,
public URLs, App Store Connect metadata, and the first TestFlight smoke are not yet evidenced.

## Build and run

```bash
xcodebuild test \
  -project AuraFit.xcodeproj \
  -scheme AuraFit \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone Air,OS=26.4.1' \
  -derivedDataPath /tmp/AuraFit-DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

## Important constraints

- Preserve local photo processing and explicit user-initiated sharing.
- Do not present the deterministic heuristic as a learned model.
- Do not expand monetization before the first-result loop is verified.

## Known issues

See `docs/BUGS.md` and `docs/RISKS.md`.

## Current verification

- Unsigned generic-device Release build: passed.
- Task/mirror validator: 26 tasks and 179 subtasks passed.
- Current simulator run: 101/101 passed in one result bundle, including the deterministic
  bad-photo rejection and score-ceiling regressions.
- Shared release gate: implemented and negative-tested, but still `verification_pending` until
  one clean 101/101 run uses the canonical App Factory rules checkout.

## Next recommended task

Read `docs/TESTFLIGHT_READINESS.md`, then execute `AURA-OPS-009` and `AURA-OPS-010` with
their evidence packs. Restore GitHub access for `AURA-OPS-001`, provide a canonical rules path
for `AURA-OPS-005`, freeze `AURA-OPS-011`, and install `AURA-OPS-012A`. Do not jump directly
to device QA. Jira and Notion must be refreshed from `docs/mirrors/TESTFLIGHT_BACKLOG.csv`
only after the owner selects both targets; they are not authority.
