# Test Plan

This plan defines coverage. `docs/TESTFLIGHT_TASKS.md` defines execution order,
ownership, status, and acceptance evidence.

## Automated gates

Owner: `TF-009`.

- Factory registration verifier.
- JSON/schema validation for factory files and privacy manifest lint.
- Full `SvaraTests` suite.
- Audio-asset packaging/decode regression: every authored recording resolves
  from the app bundle, opens through `AVAudioPlayer`, prepares, and has positive
  duration.
- Svara Points regressions: one-time awards, same-transaction milestone
  unlocking after bonus points, authored 100/250/500 thresholds, visible
  Profile explanation/next-unlock progress, explicit badge requirements, and
  the invariant that points never gate content or expose Plus.
- `SvaraUITests` onboarding and primary-loop smoke suite.
- `ComprehensiveWorkflowUITests`: every app-owned workflow, all daily
  practices, every lesson and lesson step kind, free access from every lesson
  entry point, absence of Plus UI, all festival details/activities, all
  stories/symbol sheets, profile, reminders, persistence, error/empty states,
  and bounded presentation states.
- Release static analysis.
- Unsigned generic iOS Release archive with product validation.
- Archive inspection: architecture, deployment target, dSYM, app icon,
  privacy manifest, and absence of `Svara.storekit`.

## Manual simulator matrix

Owner: `TF-009` for reproducible simulator checks and `TF-010` for the final
device/accessibility matrix.

- Smallest available iOS 17+ iPhone and a current large iPhone.
- Light and dark mode.
- Default and maximum accessibility text.
- Current free mode: no Plus/paywall/membership surface and no restricted
  content. StoreKit scenarios are deferred to the future monetized milestone.
- Notification granted and denied.
- Relaunch after a practice, lesson, reflection, saved festival, and settings
  change.

## Physical-device and human gates

- VoiceOver traversal and activation for onboarding, practice, lesson, and
  Settings. Paywall review is deferred until Plus is re-enabled.
- Daily mantra audio starts on Begin (with play/pause available), and audio
  play/pause, headphones, interruption, lock/background, and route change work
  on hardware. Breathing-practice cue audio is a follow-up product task, not a
  build 3 acceptance assumption.
- StoreKit sandbox purchase/restore/refund path (`TF-012` after a TestFlight
  install; local StoreKit configuration alone is insufficient).
- Notification delivery and Settings recovery after denial.
- Human cultural/theological content review and audio-rights review (`TF-007`).

## Distribution sequence

### Active private-beta milestone

1. `TF-009` reruns automated gates on the exact build 2 commit and records
   its SHA and intended version/build.
2. `TF-011` creates, validates, uploads an external-eligible build (not
   TestFlight Internal Only), and waits for processing.
3. `TF-015` adds only the owner, installs through TestFlight, and runs the
   bounded onboarding/practice/lesson/audio/persistence smoke.

### Close-friends external milestone

1. Complete TF-006–TF-008, TF-010, and TF-013, including legal,
   content/audio, metadata, operations, and physical-device/accessibility gates.
2. Reuse build 2 if no binary/content change invalidates it; otherwise increment
   and rerun TF-009/TF-011.
3. Keep TF-005/TF-012 deferred while Plus is disabled.
4. `TF-014` submits the verified build for TestFlight App Review and
   begins the approved cohort.

## Environment limitations

The 2026-07-29 baseline passed 136 tests, Release analysis, and an unsigned
archive. It is historical evidence only. `TF-009` must repeat applicable gates
on the candidate commit. Two Apple Development identities are installed;
cloud-managed distribution/archive/upload still require verification. Live
StoreKit sandbox is deferred.

The 2026-07-30 comprehensive simulator audit is recorded at
`../quality/evidence/UI-WORKFLOW-AUDIT-2026-07-30.md`. Its consolidated large
simulator run executed 13 tests with 8 passes, 4 expected product failures, one
StoreKit environment skip, and no unexpected automation failures. The small
dark/maximum-text pass also succeeded. Open `UI-001`–`UI-014` in `BUGS.md`
were remediation inputs; the build 2 rerun replaces them only when its result
is recorded in TF-009 evidence.
