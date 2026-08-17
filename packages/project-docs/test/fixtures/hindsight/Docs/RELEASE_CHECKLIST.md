# Hindsight 1.0 (4) Release Checklist — Adult Decision Observatory

**Lifecycle:** `verification_pending`

## Candidate contract

- [x] Today, History, Capture, Insights, and Settings use the approved adult Decision Observatory
      entry-point and copy names.
- [x] Capture requires a non-empty statement, intentionally selected 0–100 confidence, and a
      future date; Why remains optional.
- [x] A neutral confidence-slider position is not treated as a selected value.
- [x] Capture and resolution drafts survive interruption and retry; a repeated commit creates at
      most one record.
- [x] Final integrity fixes cover explicit detailed-confidence selection, optional rating presence,
      due-date analytics eligibility, sample-safe reminders, coherent fast resolution, durable
      notes, and transaction-safe deletion/new-decision retry.
- [x] History presents only the real, resolved evidence ledger and supports truthful empty and
      no-match states.
- [x] Insights use deterministic calibration rules with visible denominator, window, eligibility,
      exclusions, and low-sample state.
- [x] Example/sample records use stable explicit provenance and never affect personal counts,
      analytics, reminders, notifications, exports, or social relationships.
- [x] All social, account, sync, sharing, Circles, group, and remote-content paths are hidden or
      truthfully unavailable; flags default off and fail closed.

## Evidence and release gates

- [x] Final exact-source release preflight passed: 127/127 tests, 0 failures, 0 skips, on iPhone
      17 Pro simulator / iOS 26.4.1; result bundle:
      `/private/tmp/hindsight-personal-release-20260810-build4-final/Logs/Test/Test-Hindsight-2026.08.10_13-07-48--0400.xcresult`.
- [x] Privacy, appearance, manifest, test-registration, unsigned Release, and release-specific
      validation passed in the final preflight.
- [x] The exact build-4 simulator product installed, launched normally as
      `com.pchordia.hindsight`, and rendered Today without a crash; screenshot:
      `/private/tmp/hindsight-build4-final-launch.png`.
- [x] Responsive visual smoke passed in light/dark on iPhone 17 Pro, narrow iPhone 17e, and iPad
      mini.
- [x] Build 3 was previously installed on the paired physical iPhone 16 Pro Max (historical only).
- [ ] Build-4 physical-device install/launch, Capture-to-resolution core loop, notification/deep-link,
      export, deletion, and relaunch pass. The previously paired iPhone 16 Pro Max is unavailable.
- [ ] Manual VoiceOver, notification permission, largest Dynamic Type, contrast, and reduced
      motion review pass.
- [x] Signed `1.0 (4)` archive succeeded at `/private/tmp/Hindsight-1.0-4.xcarchive`; exported IPA
      `/private/tmp/Hindsight-1.0-4-export/Hindsight.ipa` is 3.1 MB (`com.pchordia.hindsight`,
      minimum iOS 17, arm64).
- [x] App Store Connect accepted the build-4 upload at 2026-08-10 17:15:06Z (app ID `6796111127`,
      delivery UUID `f572a99b-eb57-4cd6-8757-4e41db82310a`); it is processing.
- [ ] Build 4 completes App Store Connect processing and becomes available for TestFlight
      review/testing.
- [ ] App Store privacy answers, support email, privacy-policy/support URLs, terms, age rating,
      and screenshots match actual local-only behavior.
- [ ] Support URL (`https://priyanshchordia.com/apps/hindsight/support/`), Privacy Policy URL
      (`https://priyanshchordia.com/apps/hindsight/privacy/`), and Marketing URL
      (`https://priyanshchordia.com/products/hindsight/`) confirmed live: verified 2026-08-14 via
      `curl -sI`, all three returned `HTTP/2 200`.
- [ ] `fix/todayview-forecast-crash` (commit `59938e2`) merged to `origin/main` and a new build
      (1.0 (5) or later) archived/uploaded. Build 4 predates this fix and almost certainly still
      traps in `TodayView` when an outcome review is saved; see `Docs/STATUS.md` "Known blocker"
      and `Docs/BUGS.md` HIND-B05. **No build should be promoted to TestFlight tester/review or
      submitted until this gate is checked.**

## Completion rule

Do not mark the candidate `done` or ready/shipped until every applicable gate has dated evidence.
Build 3 is superseded/historical; previous Build 1 or Future Postcards results, including the
`1.0 (2)` upload, do not satisfy a build-4 gate. Build 4 additionally does not satisfy the
crash-fix gate above; a later build is required before this candidate can be considered
release-ready.
