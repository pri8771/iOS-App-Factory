# Test Plan

`TESTFLIGHT_READINESS.md` owns the task-level procedures and acceptance criteria.
This document owns the test strategy, matrices, environments, and recorded results.

## Required suites

- Existing unit tests for scoring, color, persistence, entitlement logic, and export.
- Deterministic image fixtures spanning valid, dark, bright, cropped, no-person,
  multiple-person, and unsupported inputs.
- UI smoke from clean install through import, analysis, result, history, export,
  relaunch, and deletion.
- Physical camera and Photos permission grant/deny/revoke paths.
- Interrupted analysis/export, low storage, StoreKit offline/restore, and daily-limit cases.
- Supported phone sizes, Dynamic Type, VoiceOver, dark appearance, and long copy.
- Bad-photo scoring regression: unusable dark, blown-out, blurry, low-detail, cropped,
  no-person, too-small, and too-large subjects must be rejected; borderline photos must not
  exceed their deterministic score ceiling even when outfit/color signals are strong.

## Automated evidence — 2026-07-29

- Full Debug test run on iPhone Air simulator, iOS 26.4.1:
  100 unit/integration tests and 1 scan/import-to-result UI smoke test passed.
- Release build for `generic/platform=iOS Simulator`: passed.
- Release-bundle inspection: privacy manifest present; `AuraFit.storekit`,
  learned-model assets, and DEBUG-only switches absent; generated `Info.plist`
  permissions and encryption setting match the release contract.
- App Factory 0.4.0 canonical project-registration verifier: passed.
- App Factory Maestro manifests generate successfully with
  `MAESTRO_APP_ID=com.pchordia.aurafit`; the Maestro CLI flows were not executed.

The durable evidence index is
`quality/evidence/testflight-readiness-2026-07-29.md`. Raw `.xcresult` bundles are
temporary local artifacts and should be retained by CI for future runs.

## Manual release gate

Execute `AURA-QA-002`, `AURA-QA-004`, `AURA-QA-005`, and `AURA-QA-010` from
`TESTFLIGHT_READINESS.md`. For each case, record device model, OS, app version/build,
Release/TestFlight source, result, defect ID, reviewer, date/time, and artifact location:

- Camera capture and library import through analysis, result, scorecard/video export, and share.
- Relaunch/history/favourite/delete and upgrade/migration from the previous beta build.
- Camera and add-only Photos permission grant, deny, revoke, and Settings recovery.
- Dark, bright, blurry, cropped, no-person, and multiple-person inputs.
- StoreKit sandbox monthly/yearly purchase, template purchase, restore, offline, and refund/revoke.
- VoiceOver, Dynamic Type XL/XXXL, dark appearance, supported phone sizes, and long copy.
- Background interruption, low storage, airplane mode, repeated scans, performance, and thermal behavior.

Create one evidence index per task under `quality/evidence/testflight/<TASK-ID>/`.
An empty row or an unlinked statement that a matrix “passed” is not release evidence.

## Required device coverage

Before the final archive, use at least:

- the oldest supported iPhone/OS combination available to the team;
- one current supported iPhone/OS combination;
- one device with a smaller supported display when those are different devices;
- the exact processed TestFlight build for the final internal smoke.

If hardware is unavailable, record the missing combination and owner decision under
`AURA-QA-009`; do not silently substitute simulator evidence for camera, StoreKit, thermal,
or signed-distribution behavior.

## Environment limitations

- Simulator cannot validate live camera quality.
- A passing heuristic test does not validate classifier product quality.
- App Store Connect purchases and privacy declarations require release configuration.
- StoreKit local configuration proves UI logic only; production IDs, metadata, price display,
  purchase/restore, expiry, refund/revoke, and offline entitlement require sandbox/TestFlight.
