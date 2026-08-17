# Test Plan

## Automated suites

Run from the repository root:

```bash
python3 Scripts/validate_prayers.py
python3 Scripts/validate_prayers.py --require-signoff
./Scripts/build.sh
```

`build.sh` discovers an available iPhone when `DESTINATION` is unset, performs
a clean Release build, then runs the Debug unit/UI suite. Override with a
simulator UDID to repeat on iPad or another iPhone.

Run the release candidate only from a clean checkout of the TF-005 commit.
Record `git rev-parse HEAD`, `xcodebuild -version`, and each destination before
the commands. Do not treat `validate_prayers.py --require-signoff` as optional.

For an exact-commit release candidate, use the maintained release gate instead
of assembling the matrix by hand:

```bash
EXPECTED_SHA="<EXACT_40_CHARACTER_COMMIT_SHA>" ./Scripts/release_gate.sh
```

The script requires a clean checkout. It dynamically selects distinct large
and compact iPhones plus an iPad from the newest installed iOS runtime, runs a
clean Release build, runs the complete Debug unit/UI suite once on the large
iPhone, runs Debug UI-only rows on the compact iPhone and iPad, creates an
unsigned generic iOS Release archive, and inspects its identity,
privacy/content assets, architecture, system dependencies, and zero-audio
claim. Evidence is written beneath
`BuildReports/release-gate/<SHA>-<UTC timestamp>/`, including an `.xcresult`
and `xcresulttool` JSON test summary for each matrix row.

UI automation intentionally uses Debug because its deterministic reset/seed
launch hooks are guarded by `#if DEBUG` and excluded from the production app.
Do not define `DEBUG` or expose test hooks in Release. Release fidelity is
established separately by the clean Release build and unsigned Release archive.

`.github/workflows/release-gate.yml` runs the same exact-commit gate on demand
or for `v*` tags. Its Ubuntu preflight runs structural and named-human sign-off
content gates before allocating the macOS runner; this avoids an expensive
matrix run for a candidate that is already blocked. An optional manual
`candidate_sha` must be a full commit SHA. The regular push/PR CI workflow is
unchanged and remains the faster development baseline.

Coverage includes:

- deterministic selection, time bands, content decoding, model fallbacks,
  theme polarity, and deep links;
- UserDefaults recreation/persistence and invalid-value recovery;
- Moment, Intention, and Deity discovery;
- onboarding → Today → explicit Begin → Chant/Silent → explicit Complete;
- hidden Listen behavior when no exact approved human recording exists;
- a Listen load/play failure that remains unstarted and cannot create a
  completion;
- editable stable-ID reminder-time persistence and UI rollback behavior;
- largest accessibility text primary-path reachability;
- save → terminate → relaunch → saved-prayer persistence.

## Required destination matrix

- Current compact iPhone (iPhone 17e or smallest installed supported device).
- Current large iPhone.
- iPad full screen; manually inspect a supported multitasking width.
- Real iPhone installed through TestFlight.

Discover current destinations instead of assuming a simulator exists:

```bash
xcodebuild -showdestinations \
  -project Anjali/Anjali.xcodeproj \
  -scheme Anjali
xcrun simctl list devices available
```

For each chosen simulator, copy its UDID exactly and run:

```bash
DESTINATION="platform=iOS Simulator,id=<EXACT_UDID>" ./Scripts/build.sh
```

The large-iPhone release-gate run executes the complete Debug unit/UI suite.
For diagnostic compact-iPhone and iPad Debug UI-only matrix rows, use:

```bash
xcodebuild test \
  -project Anjali/Anjali.xcodeproj \
  -scheme Anjali \
  -destination "platform=iOS Simulator,id=<EXACT_UDID>" \
  -only-testing:AnjaliUITests
```

Do not substitute an unavailable simulator name. If a destination is missing,
install an appropriate runtime/device or document the blocked matrix row.

## Manual release checks

- VoiceOver reading/focus order through onboarding, Today, player, completion,
  Moments, Me, Privacy, and error alerts.
- Reduce Motion and all five time-band contrast palettes.
- Notification first-run grant, denial, Settings revocation, delivery, tap
  routing, repeated toggles, edited-time replacement, failed-edit rollback,
  relaunch persistence, timezone/daylight-saving changes, and
  background/foreground behavior.
- Airplane-mode full loop, audio interruption, force-quit/relaunch, save/delete,
  and persistent-store behavior.
- Signed device archive validation, App Store Connect processing, and
  TestFlight install.

Copy `docs/templates/TESTFLIGHT_QA_EVIDENCE.md` for TF-007 and TF-010. A model
may prepare/record the run, but only a named human can sign the manual result.

## Candidate archive checks

An unsigned archive is an engineering bundle check only. The maintained
release gate creates it inside its timestamped evidence directory. To diagnose
archive construction independently:

```bash
xcodebuild archive \
  -project Anjali/Anjali.xcodeproj \
  -scheme Anjali \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath BuildReports/Anjali.xcarchive \
  CODE_SIGNING_ALLOWED=NO
```

For TF-008, an authorized signing owner must archive with the confirmed team
and validate the signed App Store archive in Xcode Organizer. Do not set
`CODE_SIGNING_ALLOWED=NO` for TF-008 and do not call an unsigned archive
TestFlight-ready.

Inspect the resulting app without changing it:

```bash
plutil -p BuildReports/Anjali.xcarchive/Products/Applications/Anjali.app/Info.plist
find BuildReports/Anjali.xcarchive/Products/Applications/Anjali.app \
  -type f | sort
```

Confirm bundle/version/build/minimum OS, icon, `PrivacyInfo.xcprivacy`,
`prayers.json`, and zero `.mp3`, `.m4a`, `.wav`, `.caf`, or `.aac` files.

## Environment limitations

Simulator tests cannot establish real notification delivery, audio interruption,
device accessibility usability, provisioning, App Store metadata correctness,
or TestFlight processing. Those remain explicit manual gates.

## Audio and lyric integrity

Automated checks prove resolution and bundle policy, not audible Sanskrit.

- `PrayerAudioAssetResolverTests` must prove exact-ID lookup, Debug/Release
  policy, missing and duplicate fail-closed behavior, normal-build exclusion
  of unapproved audio, and the explicit
  `vishnu-shantakaram`/`hanuman-manojavam` non-substitution regressions.
- Release inspection must find zero provisional audio until the candidate
  manifest and named approvals authorize a policy change.
- Normal Debug, device, Release, and TestFlight builds must also contain no
  synthetic or provisional audio. Listen is currently hidden because there is
  no approved human recording.
- `PlayerControllerTests` must prove a Listen failure leaves the session
  unstarted with zero progress and no completion, while Chant and Silent use
  explicit completion.
- For every proposed recording, a named reviewer must compare a verbatim heard
  transcript (including every repetition/addition/omission) with canonical
  Devanagari and IAST, then judge pronunciation, prayer/time/moment suitability,
  and musical treatment.
- After an approved human pilot exists, physical-iPhone QA must test exact
  prayer identity, route/volume, pause/resume, background/foreground,
  Listen→Chant→Silent switching, script switching during playback, failure
  recovery without false completion, progress/completion, and any measured
  line timing.
- Missing or invalid timing must show static lyrics, never estimated
  synchronization.

Use `docs/AUDIO_LYRIC_ALIGNMENT_PLAN.md` and
`Content/audio_candidate_manifest.csv` for task order and per-prayer state.

### Audio-alignment execution — 30 July 2026

- 75/75 unit/integration tests passed on iPhone 17 Pro Max / iOS 26.5
  simulator; this includes exact-ID resolver, player failure-state,
  explicit-completion, availability, discovery, and reminder-time persistence
  coverage.
- The current UI suite passed 4/4 on each of iPhone 17 Pro Max, iPhone 17e, and
  iPad (A16), 12/12 total: first use through explicit completion, largest
  accessibility text, saved-prayer relaunch persistence, and Om Namo
  Narayanaya with hidden Listen, both scripts, self-led Chant guidance, and
  visible running state.
- Unsigned generic-device Release build succeeded and contains zero audio.
- Normal Debug and device builds also exclude synthetic/provisional audio.
- A clean signed Debug build was produced for the connected iPhone 16 Pro Max
  (iOS 26.5.2), inspected at zero audio files, installed successfully as
  `app.anjali.Anjali`, and launched. Manual interaction is not inferred from a
  successful process launch.
- The automated responsive matrix is current. Physical-device behavior and
  manual accessibility/usability matrices have not yet passed for this binary.
- Audible prayer-by-prayer words, repetitions, pronunciation, and contextual
  suitability remain blocked until a rights-cleared human pilot exists and
  receives named review.

## Historical full matrix — 29 July 2026

Environment: macOS 26.5.2, Xcode 26.6 (17F113), iOS 26.5 simulator runtime.

- iPhone 17 Pro Max: Release build succeeded; 58/58 unit/integration and 4/4 UI
  tests passed.
- iPhone 17e: 4/4 UI tests passed.
- iPad (A16): 4/4 UI tests passed.
- Generic iOS device: unsigned arm64 Release archive succeeded.
- Archive inspection: privacy manifest and icon present; zero audio files;
  version 1.0 (1), bundle `app.anjali.Anjali`, minimum iOS 17.0.
- Structural prayer validation: 22/22 passed.
- Human sign-off gate: expected failure, 0/22 signed.

This matrix predates the 30 July player, discovery, and reminder changes and is
not current candidate evidence. The unsigned archive verifies device
compilation and bundle contents, not provisioning, App Store validation,
upload processing, or a TestFlight install.

Consumer TestFlight is additionally blocked by the P0 and named-human gates in
the [Daily-Use Consumer Product Plan](DAILY_USE_PRODUCT_PLAN.md).
