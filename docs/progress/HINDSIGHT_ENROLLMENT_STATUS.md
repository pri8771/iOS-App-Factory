# Hindsight enrollment status

- Date: 2026-08-11
- Source repository: `/Users/pchordia/Documents/wip_apps/ios_apps/hindsight`
- Local checkpoint branch: `checkpoint/factory-enrollment-2026-08-11`
- Checkpoint commit: `c66c690c21c0d662fa623ea104bd8d5dc0a700c0`
- Remote push: none
- Enrollment state: blocked; no plan has been applied

The user-authorized checkpoint preserved the complete pre-enrollment working
tree in one local commit. The production read-only scanner then completed with
all four preservation claims true: HEAD, porcelain status, scan-surface bytes,
and Git administrative state were unchanged by inspection.

## Bound scan identity

- Source fingerprint:
  `sha256:e96dffcb9e88496ded80c18d9e2a8455e831e9872f3fe33b89eb9310c0e819c2`
- Inventory digest:
  `sha256:21c1b7f4bb32e706a1ae24e874ab5a3186161cbcf5a13ab0847bc1996348563e`
- Proposal-only plan digest:
  `sha256:b70311eb36e8def017c296bd1202eff6d97dd37f69da47b88a41109a78a5917c`

The inventory structurally verified 53 Swift source files, 12 unit-test source
files, one UI-test source file, the existing CI workflow, one Xcode container,
and one shared scheme. The post-fix production scan reported no Xcode gaps.

## Blocking findings

The post-fix scan has exactly three blockers:

- `compatibility.legacy-factory-layout`: the existing `.factory` authority must
  be adopted or migrated atomically; a parallel `.app-factory` layout is
  prohibited.
- `rules.canonical-unverifiable`: the canonical rule file lacks the required
  machine-checkable declarations.
- `rules.adapter-nonconforming`: the Cursor adapter is not digest-bound to its
  nearest canonical `AGENTS.md` authority.

The historical missing-container and missing-scheme findings were Factory PBX
parser false-negatives: the object catalog confused nested `TargetAttributes`
entries with top-level objects. The corrected parser and realistic regression
fixture received real `xcodebuild -list` and `xcodebuild build-for-testing`
validation before the production rescan. That fixture proof validates the
regression surface; it does not enroll Hindsight or replace its trusted Xcode
results. The proposal-only scanner plan remains evidence, not an applied
enrollment decision, and no Hindsight project file was changed.

## Trusted macOS verification

The checkpoint was built and tested on the trusted macOS plane with Xcode,
using iOS Simulator 26.5 on the existing `Hindsight-AgentSession-1785185137`
iPhone 17 Pro simulator. `xcodebuild -list` enumerated the application, unit,
and UI-test targets and the shared `Hindsight` scheme. The full scheme built,
then reported 126 passing tests and one release-blocking UI-test failure out of
127 total.

The failure is deterministic: an isolated rerun of
`HindsightCaptureFlowUITests.testDetailedDecisionFlowRemainsAvailable()` also
failed. Saving the outcome review terminates the application. The fresh crash
report records `EXC_BREAKPOINT` / `SIGTRAP` from an array subscript in
`TodayView.upcomingForecastsSection` at `Hindsight/Views/TodayView.swift:353`.
The view derives indices from one live `upcomingDecisions` snapshot and then
indexes a newly evaluated snapshot; the collection can change between those
operations after the review save.

The full and isolated result bundles were observed at these local temporary
paths:

- `/private/tmp/hindsight-factory-host-RDx2h9/Hindsight.xcresult`
- `/private/tmp/hindsight-factory-host-RDx2h9/Hindsight-failed-ui-rerun.xcresult`
- `/private/tmp/hindsight-factory-host-RDx2h9/Hindsight-unit-serial.xcresult`

These `/private/tmp` bundles are not an immutable Factory evidence manifest and
may be removed by the operating system. A separate trusted rerun of all 121
unit tests with Xcode parallel testing disabled passed 121/121. That result
shows the unit assertions passed serially, but it neither replaces the original
126/127 scheme result nor by itself closes the SwiftData concurrency/lifetime
diagnostics. The release command must remain failing until the deterministic
production crash and the separate fixture diagnostics are repaired and the
complete scheme is rerun from a bound clean state.

The source checkout remained clean at checkpoint
`c66c690c21c0d662fa623ea104bd8d5dc0a700c0` after all runs. No repair,
baseline update, assertion weakening, or TestFlight promotion was performed.
Legacy-layout migration, rule-authority changes, the deterministic crash, and
the separate SwiftData store-lifetime diagnostics remain reviewed follow-up
work before enrollment or release.
