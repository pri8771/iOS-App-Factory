# Test Plan

Task-level procedures, owners, dependencies, acceptance criteria, and evidence paths are canonical in `TESTFLIGHT_READINESS_PLAN.md`. This file defines the shared verification environments and evidence rules.

## Automated release checks

Run from the repository root:

```bash
python3 Scripts/validate_app_factory_registration.py
python3 Scripts/validate_testflight_task_plans.py
python3 Scripts/validate_product_roadmap.py
python3 Scripts/export_testflight_task_descriptions.py > /dev/null
python3 Scripts/validate_world_place_catalog.py
bash Scripts/check_testflight_readiness.sh
python3 Scripts/generate_xcodeproj.py
xcodebuild test \
  -project Roam.xcodeproj \
  -scheme Roam \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.4.1' \
  CODE_SIGNING_ALLOWED=NO
xcodebuild analyze \
  -project Roam.xcodeproj \
  -scheme Roam \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO
xcodebuild archive \
  -project Roam.xcodeproj \
  -scheme Roam \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/Roam.xcarchive
xcodebuild -exportArchive \
  -archivePath /tmp/Roam.xcarchive \
  -exportPath /tmp/Roam-TestFlight \
  -exportOptionsPlist ExportOptions-TestFlight.plist
bash Scripts/check_testflight_readiness.sh --archive /tmp/Roam.xcarchive
```

The final preflight must run without `--allow-unsigned`. A structural archive checked with that flag is evidence for packaging only, not TestFlight readiness.

Every candidate test record must include bundle ID, marketing version, build, commit SHA, production-artifact manifest version, Xcode version, device/runtime, command, start/end timestamp, exit status, test counts, unexpected skips, and evidence path.

## Required suites

- Unit/integration: polygon decoding, spatial lookup, production hierarchy,
  world-place catalog/search, V1→V2→V3 and V2→V3 migration, manual-place transactions,
  upward-only coverage, location gates, transition rules, statistics, export,
  bundle status, and map zoom behavior.
- UI smoke: onboarding, permission state, map, seeded first discovery, progress, and relaunch.
- Failure scenarios: missing/corrupt bundle, persistent-store failure, denied/revoked/reduced-accuracy location, failed deletion, and interrupted background tracking. Purchase-state failures return only when the deferred paid feature is promoted.
- Human/device: background route, termination/relaunch, migration, export/share, deletion, small/standard/large phones, Dynamic Type, VoiceOver, reduced motion, dark appearance, and large histories. Purchase/restore coverage returns only with the deferred paid feature.
- Commerce is excluded from the free beta (TF-006). The Release archive must contain no StoreKit configuration, paywall, purchase, restore, entitlement, or Roam Plus UI path; restore the full StoreKit matrix only when the paid feature is promoted.
- Accessibility (TF-010): automated `performAccessibilityAudit` on every critical surface plus human VoiceOver journeys.
- Release-candidate (TF-012): offline/interruption, soak/stress, archive hygiene, secret/debug/test-data inspection, and exact-build regression.

### 2026-07-30 device-feedback regressions

- **Tracking resume:** enable tracking, force-quit, relaunch normally, and
  background/foreground the app. The persisted setting remains enabled and
  Home/Map report the authorization-appropriate active or recovery state; the
  app must not fall back to “Tracking Off.” Repeat with denied permission,
  missing geometry, persistence recovery, and deletion recovery to prove every
  block remains fail-closed.
- **Tracking-off current location:** disable tracking, record the visit/area
  counts, open Home and Map, and recenter. The blue dot may refresh, but no
  tracked area, visit, transition, or diagnostic implying an accepted tracked
  sample is added. Re-enable tracking and prove a subsequent valid sample can
  enter the normal processor.
- **Tracking configuration truth:** use an injected manager adapter to assert
  every preset and custom distance/accuracy/auto-pause value, background
  indicator on/off, unchanged/changed reconfiguration, authorization downgrade,
  invalid legacy value, tracking-off, and relaunch case. The effective value
  shown in UI must equal the manager assignment; reconfiguration must not open
  or close a visit.
- **Callback and save cadence:** feed single and multi-location callbacks,
  out-of-order timestamps, stationary repeats, boundary transitions, rejected/
  unmatched samples, diagnostics on/off, lifecycle flushes, save failures, and
  deletion races. Count callbacks, samples, lookups, meaningful mutations,
  diagnostics, and save attempts separately. Assert timestamp-ordered actor
  processing, immediate durable open/transition/close, bounded same-area and
  diagnostic checkpoints, post-commit success effects, finite buffers, and no
  sensitive metric fields.
- **Physical energy comparison:** on the same candidate family and devices,
  compare the current simultaneous standard/significant-change/visit policy
  with any proposed service state machine across stationary, walking, genuine
  crossing, jitter, background/lock, reduced accuracy, and Low Power Mode.
  Record at least three critical-route runs or a dated waiver. Do not adopt a
  lower-energy policy unless both visit-correctness and owner-approved energy/
  save budgets pass.
- **Home actions:** with seeded/non-zero history, tap ZIP Areas and States and
  verify Map opens with the matching scope and visibly highlighted stored
  coverage. Tap New Areas This Week and verify the unambiguous label and
  History destination. Tap Longest Visit and verify ZIP Code Area, state, date,
  longest-of-N rank, and average comparison. Verify zero-value cards are
  disabled with an explanatory accessibility hint.
- **Map scopes:** exercise Automatic, ZIP Areas, States, Countries, and
  Continents with single-state, multi-state, continental-US, Puerto Rico,
  U.S. Virgin Islands, American Samoa, Guam, and Northern Mariana Islands
  fixtures. Production-bundle tests must assert that a visited ZCTA produces a
  real `.visited` state/country/continent polygon, not only a changed scope
  label. Confirm state overlays use Census FIPS identifiers and
  country/continent highlights are derived only from supported persisted
  ZCTAs for the automatic-history path. A non-ZCTA coordinate must not
  fabricate an automatic visit; separately saved FEAT-005 countries/cities may
  affect manual coverage only through the upward-only resolver. At every tier,
  verify touching visited polygons receive different translucent fill colors
  on Standard, Hybrid, and Satellite maps without emphasized borders;
  switching the base map must refresh existing overlay opacity. Selecting a
  scope from the Map menu must preserve the current camera center/span; only
  an explicit Home navigation request may fit the camera to all visited data.
- **Automatic hierarchy:** from a broad Pittsburgh-centered view, verify real
  visited geometry progresses North America → United States of America →
  Pennsylvania/FIPS 42 → Allegheny County/42003 → Pittsburgh/4261000 → the
  stored ZCTA as the camera span crosses `80`, `30`, `10`, `3`, `0.5`, and
  `0.1`. A Home States/ZIP action may fit the camera but must leave the chip in
  `Automatic · <live tier>`; only a Map menu selection may lock a tier.
- **Travel snapshot:** open from Home and Progress in light/dark appearance and
  small/large Dynamic Type. Verify “Snapshot created <month year>,” the
  decorative-gradient/white-bar explanation, state-total privacy note,
  rendering progress, retry copy, and VoiceOver summary. Tap Share coverage
  snapshot and verify the native destinations are not blank; save/copy the
  image and inspect an opaque, readable 1080×1350 asset with no exact ZIP or
  coordinate disclosure.

### Worldwide Past Places regressions

- **Catalog provenance and integrity:** validate source URLs, retrieval date,
  SHA-256, GeoNames CC BY attribution, Natural Earth crosswalk, SQLite
  integrity, production metadata, stable-ID uniqueness, country/city counts,
  valid coordinates, indexes, deterministic representative result ordering,
  accented/ascii search, and explicit point-versus-polygon status. The current
  expected artifact is 52,236,288 bytes, SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`,
  250 addable current countries, 250 verified country points, zero missing
  country points, 69,542 cities, and 175 Natural Earth polygon crosswalks.
  Verify that source rows `AN` and `CS` are classified as historical and
  excluded, while 75 current countries truthfully remain marker-only.
- **Migration:** create an on-disk V1 store with settings, a tracked ZCTA, visit,
  and diagnostic log; open through the V2 migration and prove every value
  survives before adding a manual place. Relaunch the migrated store.
- **Manual write semantics:** cover one-tap unknown-date add, repeated-add
  dedupe, explicit second period, year/month/range validation, bulk input
  uniqueness, same-operation retry, save failure rollback, draft preservation,
  persistence unavailable, and deletion-recovery fencing. No test may infer an
  exact date or observed coordinate from catalog metadata.
- **Coverage:** prove a city contributes only verified city/ancestor IDs and a
  country only itself/continent. Assert no country→state/city/ZIP and no
  city→ZIP propagation. The production manual Pittsburgh fixture must resolve
  to place `4261000`, county `42003`, state `42`, United States, and North
  America through its persisted representative point, while its manual ZCTA
  set and close-zoom visited-ZCTA overlays remain empty. Repeat without a
  coordinate and with bogus GeoNames admin IDs to prove no polygon is
  fabricated. Union a separately tracked ZCTA-derived and manually added
  country ID and assert one coverage item without changing provenance.
- **UI:** offline and with no typing, browse continent → country → city, add an
  unknown-date country/city, bulk-add with month/year, use Undo, edit/add/delete
  periods, relaunch, search, open the map card, and exercise the
  outline-unavailable state. A list must provide every map-only selection.
  Receipt-based Undo and its focused persistence/view-model reversal tests are
  implemented; do not mark the flow accepted until the full UI,
  accessibility, offline/relaunch, and physical-device cases also pass.
- **Lifecycle:** Full Export JSON v4 plus separate Past Places and Past Place
  Periods CSVs retain source IDs, optional normalized purposes, and coarse
  precision while labeling catalog representative coordinates honestly as
  reference metadata, not observed locations or guaranteed geometric
  centroids. Every deletion-journal phase clears or restores manual models
  consistently with existing history.
- **Accessibility/layout:** audit Add Places, batch date editor, Past Places
  list, and detail on small/current/large phones, portrait/landscape, light/dark,
  accessibility text, VoiceOver, RTL, Reduce Motion, and offline/corrupt
  catalog states.

## Proposed Plan a Trip verification

FEAT-006 and TRIP-001–TRIP-010 are planned and excluded from the current
TestFlight gate. When the owner promotes that scope, follow
`tasks/trip-planning/README.md` and add evidence for:

- migration and atomic persistence of `PlannedTrip`/day/stop records without
  changing existing automatic or remembered history;
- offline Madrid destination selection, “Someday” dates, base, itinerary,
  relaunch, export, deletion, and a complete map-free list path;
- injected MapKit discovery/directions clients covering loading, empty,
  cancelled, stale, throttled, offline, failed, retry, advisory, and no-route
  states;
- zero history writes from plan creation, dates, stop completion, route
  calculation, one-shot current location, arrival, archive, or completion;
- explicit conversion only: Madrid uses available verified parents and no
  children; manual Pittsburgh contributes city/county/state/country/continent
  but no ZIP; an independently tracked ZIP retains separate provenance;
- VoiceOver, accessibility text, dark mode, landscape, RTL, Reduce Motion,
  foreground location permission, Apple Maps handoff, privacy, performance,
  and battery on physical devices.

## Production data and performance

- Record each source, vintage, license/provenance, SHA-256 checksum, feature
  count, and integrity result in `quality/evidence/`.
- Validate all seven production SQLite resources as one release set: six
  geometry bundles plus `world_places_bundle.sqlite`. Archive inspection must
  reject the prior six-only set as incomplete for FEAT-005.
- Measure app/archive size, cold open, point lookup, visible-overlay query, memory, pan/zoom frame behavior, and battery impact on physical devices.
- Measure cold catalog open, continent/country/city browse queries, short and
  accented search, large-result cancellation, and manual-marker clustering on
  the owner-approved minimum device.
- Do not invent pass thresholds without product approval and measurements.
- The TF-011 local prerequisite uses only the explicitly non-approved
  `tf011-contract-probe-v1` and `tf011-local-simulator-probe-v1` test datasets.
  Its three focused test classes and 2026-07-31 simulator observations are
  recorded in `quality/evidence/testflight/TF-011/`; they are correctness and
  baseline evidence only and are not a release performance gate.

## Required physical-device matrix

### Physical-device preflight

Before running XCTest UI or accessibility work on an iPhone:

1. In Xcode Device Hub, confirm the device is paired, connected, and available.
2. On the device, enable Developer Mode under **Settings → Privacy & Security**
   and complete the restart/passcode confirmation required by iOS.
3. On the unlocked device, open **Settings → Developer** and turn on **Enable
   UI Automation**. This is a separate device-owned control; Developer Mode
   alone is not sufficient. Start the focused retry and enter the device
   passcode locally if iOS asks to authorize UI automation.
4. Confirm Xcode's Developer Disk Image is compatible. A read-only command may
   use `xcrun devicectl device info ddiServices --no-auto-mount-ddis`; do not
   mount, update, reset, erase, or change device settings merely to collect
   evidence.
5. Run one focused, non-destructive UI smoke test before the full matrix. A
   failure such as `Not authorized for performing UI testing actions` is an
   environment failure until an authorized rerun reaches app assertions.
6. Redact UDIDs, serial numbers, hostnames, tunnel addresses, Apple IDs, and
   passcodes from committed evidence. Record only the privacy-safe model, OS
   build, Xcode build, candidate identity, counts, and result classification.

No supported Xcode 26.6 `devicectl` command currently exposes the state of, or
sets, the separate **Enable UI Automation** preference. It requires the device
owner's visible confirmation. Apple states that there is no officially
supported way to automate the passcode entry that protects this access; do not
remove the passcode, use private preferences, or mutate device files to bypass
it.

| Gate | Minimum coverage | Task |
|---|---|---|
| Location/background | iOS 17.x and current iOS; representative small/current devices; permission, accuracy, lifecycle, real-route, jitter, callback/save cadence, effective controls, and energy A/B cases | TF-008 |
| Persistence | relaunch, upgrade fixture, write/delete/export failures, large history, low storage/corruption fixture | TF-009 |
| Accessibility/layout | small/current/large supported phones; light/dark; accessibility text; VoiceOver; contrast; reduced motion | TF-010 |
| Performance | owner-approved minimum device plus current device; empty/typical/large history; national→ZCTA map scopes | TF-011 |
| Deferred commerce (not a free-Beta-1 gate) | When the paid feature is promoted: sandbox physical-device purchase, cancellation/pending where feasible, reinstall/restore, refund/revocation | TF-006 future-paid plan |
| Internal install | a non-developer installation from TestFlight, not an Xcode-installed build | TF-013 |

An unavailable device/OS case needs a dated waiver in `quality/waivers/` that names the risk, compensating evidence, owner, and expiry.

## Performance budget record

TF-011 must replace `OWNER_REQUIRED` with approved values before final measurement:

| Metric | Device/dataset | Budget |
|---|---|---|
| Cold launch to usable map | minimum approved device, typical history | `OWNER_REQUIRED` |
| Warm launch | minimum approved device, typical history | `OWNER_REQUIRED` |
| Point/hierarchy lookup | minimum approved device, dense boundary case | `OWNER_REQUIRED` |
| Visible overlay query/decode | minimum approved device, densest supported scope | `OWNER_REQUIRED` |
| Map interaction | minimum approved device, national/state/city/ZCTA scopes | `OWNER_REQUIRED` |
| Peak memory | minimum approved device, large history/dense map | `OWNER_REQUIRED` |
| Background battery | approved device, approved route/duration | `OWNER_REQUIRED` |
| App Store download/install size | thinned sizes after upload | `OWNER_REQUIRED` |

Record median, worst observed value, run count, thermal state, OS, build identity, and measurement method. Simulator measurements may guard CPU/query regressions but cannot approve battery or production animation quality.

## Evidence retention

- Durable, privacy-safe summaries belong under `quality/evidence/testflight/<TASK-ID>/`.
- XCResult bundles, Instruments traces, archives, videos, and large logs may live in protected artifact storage; commit a checksum, retention/expiry, access owner, and stable reference.
- Never commit signing assets, secrets, private App Store contacts, sandbox passwords, raw personal routes, or real location-history exports.
- Any binary/resource/signing/entitlement change invalidates affected evidence and creates a new candidate identity.

## Environment limitations

- Simulator routes do not verify background delivery, battery behavior, or all permission transitions.
- Automated geometry fixtures do not replace human boundary inspection.
- A development-signed archive is not an uploadable App Store Connect artifact.
- App Store download/install size can only be approved after Apple processes the upload and reports thinned sizes.
- TestFlight telemetry is useful after distribution but does not replace pre-upload device testing.
