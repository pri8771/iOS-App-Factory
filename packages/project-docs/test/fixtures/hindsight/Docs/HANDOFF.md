# Handoff

## What the project is

Hindsight is a private decision journal that preserves beliefs and predictions,
prompts later outcome review, and helps users improve judgment.

## Current state

This app is currently **deprioritized** — no active work is planned until the owner decides to
resume it. Lifecycle status is `verification_pending`.

The current release candidate is **Hindsight 1.0 (4) — Adult Decision Observatory**, a local-only
SwiftData personal judgment journal (Today / History / Capture / Insights / Settings) with all
social/account/sync paths hidden and failing closed. Build 4 passed 127/127 automated tests on an
iPhone 17 Pro simulator, was archived, exported, and uploaded to App Store Connect on 2026-08-10
17:15 UTC (app ID `6796111127`, delivery UUID `f572a99b-eb57-4cd6-8757-4e41db82310a`). It was last
known to be **processing**; App Store Connect completion and TestFlight availability were never
confirmed. See `Docs/STATUS.md` for full evidence and `Docs/RELEASE_CHECKLIST.md` for the gated
checklist.

**Known blocker (new as of 2026-08-14):** commit `59938e2` on the unmerged branch
`fix/todayview-forecast-crash` fixes an `EXC_BREAKPOINT` index-out-of-range crash in `TodayView`
triggered by saving an outcome review. This fix postdates the build-4 upload, so build 4 almost
certainly still contains this crash. **Do not treat build 4 as release-ready.** The next required
action when this app is picked back up is to land that fix and upload a new build before any
TestFlight tester or reviewer exercises the app. See `Docs/STATUS.md` "Known blocker" and
`Docs/BUGS.md` HIND-B05.

Build 1 and the pre-pivot Future Postcards direction are superseded/historical and are not the
current candidate; do not use them as a description of present state.

The Social v2 networked direction remains a separate, still-planning-only program: only its
mandatory F0 planning/contracts, local integrity/delivery controls, default-off client rollout
boundary, and hosted repository CI have begun (hosted foundation run `30591583112` was green as of
its date). No Social v2 user-facing feature, cloud backend, account, user-data upload, runtime flag
loader, or third-party runtime dependency exists. It does not affect the 1.0 (4) personal-release
candidate above.

## Build and run

```bash
xcodebuild build \
  -project Hindsight.xcodeproj \
  -scheme Hindsight \
  -destination 'platform=iOS Simulator,name=iPhone Air' \
  -derivedDataPath /tmp/Hindsight-DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

Automated unit, integration, and UI-smoke targets exist. The final exact-source preflight for the
1.0 (4) candidate passed 127/127 tests on an iPhone 17 Pro simulator (2026-08-10); GitHub Actions
run `30591583112` separately passed the complete shared scheme and all repository foundation gates
for the Social v2 planning work. Note commit `59938e2` (2026-08-14, unmerged) fixes a crash not
covered by the 2026-08-10 127/127 result, since it was uploaded before the fix existed.
Physical-device accessibility/notification/export checks and final distribution signing remain.

## Important constraints

- Keep decisions local and preserve user work through interruption and relaunch.
- Demo deletion must never delete personal decisions.
- Preserve existing uncommitted notification and outcome-review changes.
- Do not implement quick capture until minimum required fields are approved.
- Do not present low-sample Insights as established personal patterns.
- Existing local records remain private by default. Server-backed work must follow
  `SOCIAL_PRODUCT_V2_IMPLEMENTATION_PLAN.md`, the accepted F0 contracts, and the vendor-neutral
  API boundary; never upload legacy data without explicit consent or claim a social lock before
  server acknowledgement.
- ADR-008 is proposed, not accepted. Do not create provider projects, add an SDK, or begin Phase 1
  identity/sync work until its hosted proof and owner reviews pass.

## Known issues

See `Docs/BUGS.md` and `Docs/RISKS.md`. In particular, HIND-B05 (`Docs/BUGS.md`) is a
release-blocking crash fixed in an unmerged branch — the currently uploaded build 4 almost
certainly still has it.

## Next recommended task

This app is deprioritized; the items below are ordered for whenever the owner resumes work, not
for immediate execution.

1. **First, when resuming:** merge/land `fix/todayview-forecast-crash` (commit `59938e2`), cut a
   new build (1.0 (5)+), and re-run the release-candidate check before promoting anything to
   TestFlight testers or reviewers. See `Docs/STATUS.md` "Known blocker" and
   `Docs/RELEASE_CHECKLIST.md`.
2. Confirm App Store Connect processing/TestFlight availability for whichever build supersedes
   build 4, complete the physical-device pass, and finish the manual accessibility review listed
   in `Docs/STATUS.md` "Verification pending".
3. Separately, the Social v2 program remains planning-only: send `CLAUDE_DESIGN_PROMPT.md` to
   Claude Design, review the F0.1/F0.4–F0.6 owner decisions, and extend the passed local
   PostgreSQL parity slice into the hosted F0.3 Apple-auth/Supabase RLS/realtime/APNs/isolation/
   restore proof. Accept or revise ADR-008 before provisioning isolated development and QA
   services or adding a runtime flag loader. This does not block or depend on items 1–2.

## Build 1 marketing-page handoff

The separate portfolio-website brief is tracked in
`MARKETING_LANDING_PAGE_TASKS.md`. It requests three complete Build 1 landing
pages and three icon candidates, real synthetic-data screenshots, and a
Hindsight-specific HubSpot waitlist. Do not confuse this with
`CLAUDE_DESIGN_PROMPT.md`, which belongs to Social v2 product research. The
marketing page must pass a Social v2 claim-leak review before publication.
Note: this brief predates the Adult Decision Observatory pivot to build 4 and refers to "Build 1"
by name; re-scope it against the current candidate before acting on it.
