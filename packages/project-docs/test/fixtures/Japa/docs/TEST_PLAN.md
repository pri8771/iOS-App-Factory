---
id: DOC-TEST-PLAN
canonicalFor: test-plan
status: active
lastVerified: 2026-08-06
readWhen:
  - running or changing tests
  - preparing a release
related:
  - RELEASE_CHECKLIST.md
  - ../quality/quality-manifest.json
supersedes: []
---

# Test Plan

## Required suites

| Suite | Status | Location |
|-------|--------|----------|
| Unit | present | `JapaTests/JapaEngineTests.swift`, `PersistenceTests.swift` |
| Integration / flow | present | `JapaTests/PracticeFlowTests.swift` |
| UI smoke | present | `JapaUITests/JapaUITests.swift`, `FeatureAuditUITests.swift` |

## Coverage summary (source inventory 2026-08-03)

- **56** unit/flow tests
- **12** UI tests
- Engine: advance, completion-once, undo floor, boundaries, reconstruct from count
- Persistence: prefs/sessions/active-session round-trip + flush; legacy-snapshot lenient decode (`updatedAt` and active-duration migration)
- Practice flow: resume across relaunch, honest partials, foreground-only duration, per-round timing reset, no streak fields, stale-round detection/finish/touch
- UI: advance/undo/complete, settings/history, in-place resume after terminate, mantra custom, history delete, mala-style apply, accessibility text-size smoke, stale-round Finish prompt end-to-end

## Not automatable (device-only)

- Haptic crispness / latency / distinctness
- Silent-mode haptics behavior
- Full eyes-closed round feel
- Hardware without Core Haptics fallback quality

## Baseline checks for this onboarding

- [x] `xcodebuild -scheme Japa -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' test` — exit 0 on 2026-07-16 (~380s; DebuggerLLDB version-store warnings observed, non-blocking)
- [x] Source inventory of tests and modules
- [x] Registration verify script
- [x] Re-verified 2026-07-17 (registration-upgrade pass): `xcodegen generate`, `xcodebuild build`, and `xcodebuild test` on iPhone 17 Pro (OS 26.5) — build succeeded, 53/53 tests passed (0 failures), confirming the then-current 46+7 count
- [x] Re-verified 2026-07-17 (mala-style + Dynamic Type + CI pass): `xcodegen generate`; Release simulator build; full `xcodebuild test` on iPhone 17 Pro (OS 26.5) — 56/56 tests passed (47 unit/flow + 9 UI); compact-phone accessibility text-size smoke passed on iPhone 17e.
- [x] 2026-07-18: 62 tests (52 unit/flow + 10 UI), all passing after the merged-surface, animation, red-final-bead, and stale-round-Finish work; also on-device validated on a physical iPhone 16 Pro Max. See `STATUS.md` for the on-device evidence link. (Earlier 46+7=53 / 47+9=56 rows above are superseded history.)
- [x] **Current (2026-08-06): 69 tests (56 unit/flow + 13 UI), all passing.** Full `xcodebuild test -scheme Japa -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' CODE_SIGNING_ALLOWED=NO` exited 0 after adding deterministic App Store history-screenshot coverage. The result bundle reports 69 passed, 0 failed, 0 skipped at `/Users/pchordia/Library/Developer/Xcode/DerivedData/Japa-ahlyxesnlbuulvbilkxaukaggzhz/Logs/Test/Test-Japa-2026.08.06_23-17-08--0400.xcresult`. Existing deterministic coverage proves an 8-hour inactive gap adds zero time, every new round resets its duration, and an explicit early finish records a partial and starts a fresh round. This is the canonical current count.
- [x] **TestFlight beta verification:** Build 2 was uploaded manually, processed to `Ready to Submit`, and confirmed working through TestFlight by the accountable user on 2026-08-06. Evidence: `quality/evidence/2026-08-06-manual-app-store-upload-build-2.md`.
- [x] **Re-verified 2026-07-30 after bundle-ID change:** the same full scheme passed **67/67**, with 0 failures and 0 skipped tests, using shipping identifier `com.priyansh.mala`. A signed Release archive also succeeded; see `quality/evidence/2026-07-30-mala-bundle-id.md`.

## Quality manifest alignment

`quality/quality-manifest.json` requires accessibility, dark mode, persistence relaunch tests, fake-data isolation, and completion evidence. UITests isolate via `JAPA_UITEST*` env; persistence relaunch covered in flow + FeatureAudit UI tests. Dynamic Type has implementation + smoke coverage; VoiceOver/accessibility still needs human/user validation on device. Responsive layout tests are **not** a v1 iPad requirement after DEC-003 (iPhone only).
