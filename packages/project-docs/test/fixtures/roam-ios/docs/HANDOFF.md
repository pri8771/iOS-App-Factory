# Handoff

## What the project is

Roam is a private iOS travel map that automatically records supported U.S./
territory Census ZIP Code Tabulation Areas and colors verified hierarchy
boundaries. A separate local Past Places model lets a person remember countries
and cities worldwide without fabricating GPS observations or exact dates.

## Current state

The source is registered against App Factory 0.4.0. Free Beta 1 contains no
StoreKit/Roam Plus path. Exact-current unit, core UI, unsigned Release build,
resource, and source-preflight checks are green; full accessibility,
clean restoration, distribution signing/upload, owner decisions, TestFlight
install, and physical matrices remain red or pending. The project is
`verification_pending`, not TestFlight-ready.
`TESTFLIGHT_READINESS_PLAN.md` controls scope, dependencies, and gates;
`docs/tasks/testflight/README.md` indexes the implementation-ready packets;
and `quality/release/testflight-backlog.json` provides machine routing.

## Exact-current verification — 2026-08-11

- Exact-current `RoamTests` pass 283/283 at
  `/private/tmp/Roam-Exact-Current-Units-20260811.xcresult`; exact-current
  `RoamCoreLoopUITests` pass 2/2 at
  `/private/tmp/Roam-Exact-Current-CoreUI-20260811-R2.xcresult`. The first UI
  attempt was invalid because SpringBoard reported `Busy` before any test ran;
  the dedicated-simulator retry is authoritative. The earlier implementation
  slices remain 95/95 focused, 46/46 progress/date, and 5/5 map-runtime.
- Python/tooling passes 89/89: 86 under `Scripts/tests` discovery plus 3
  hierarchy-builder tests. The unsigned Release configuration builds.
  Source preflight reports 21 passes, zero failures, and the one expected
  warning that no archive was supplied; all seven resources, the 69,792-place
  world catalog, App Factory registration, TestFlight backlog, and product
  roadmap validate.
- Accessibility remediation fixed the named R11 Delete, Home/History contrast,
  Map-label, and Settings findings without app-owned suppression. Exact-current
  R66 executes all nine free-beta surfaces: eight pass, only History fails on
  one anonymous `.elementDetection`/OCR finding, and none skip. This supersedes
  R31 and the R11 4/9 baseline for current status, but the run remains red and
  no physical matrix exists. See
  `quality/evidence/testflight/TF-010/exact-current-automated-audits-2026-08-11.md`.
- Build 4+ still needs a clean resource restoration, automatic provisioning,
  signed archive/export/upload, processed-binary reconciliation, and internal
  TestFlight install/smoke by a non-developer.
- Full Export is v4 and the SwiftData schema is V3 with seven models, including
  the optional remembered-visit purpose companion.

## Historical verification — 2026-07-31

- Integrated non-StoreKit units pass 262/262 on Final8; the prior core UI
  suite passes 2/2, but its exact-current rerun is blocked at UI-test-worker
  materialization; Python/
  tooling passes 80/80, including the provider-neutral TF-002 transaction and
  fail-closed TF-007 draft-screenshot provenance checks.
- Exact-current generic Release analysis and unsigned structural
  archive pass. Preflight has zero failures and one expected unsigned warning;
  all seven production databases and the privacy manifest are present.
- The final integrated Apple Development build installed in place and launched
  successfully on the paired iPhone 16 Pro Max. The first request was denied
  while the phone was locked; the post-unlock retry passed. See
  `quality/evidence/testflight/TF-008/exact-current-device-install-2026-07-31.md`.
- StoreKit system integration was red/hanging in this historical paid-source
  revision; StoreKit is now removed from free Beta 1. The complete accessibility
  run was not clean, and physical route/energy/performance matrices remain. A
  physical run of the two core UI tests was rejected before app assertions
  because the iPhone was not authorized for UI testing actions.
- On 2026-08-01, a repeat full accessibility run was interrupted after Xcode
  stalled while materializing/installing the UI-test worker. It produced no
  valid result bundle, so R9 was then the latest valid complete diagnostic run;
  do not treat the interruption as an app audit result or as current evidence.

## Historical verification through 2026-07-30

- The pre-Wave-1 full scheme passed 89/89 tests with zero skips.
- TF-003.5 has a code-complete, explicit-input evidence helper plus focused fixture tests, but no protected workflow has executed it. Do not treat its repository note as signed/archive/upload evidence.
- TF-004.4 has a code-complete explicit-input identity validator and fixture tests, but it has no approved manifest, clean candidate, App Store uniqueness query, archive comparison, or processed-build record. Do not treat the helper as a candidate identity pass.
- Focused UI smoke passed after the MapKit callback fix with no SwiftUI publication warning.
- The generic-device Release build, static analysis, and unsigned archive
  complete with zero errors and zero warnings. Structural preflight reports 29
  passes, zero failures, and one expected unsigned warning. The current
  structural archive is
  `Roam-Final-Unsigned-Structural-20260729-1945R2.xcarchive` with aggregate
  SHA-256
  `2121089cc9cd7a4a09c59c2445d3ecd4c251cb40c965fb19898bee719d7987b1`.
- The historical structural archive contains its then-required six geometry
  databases and a valid privacy manifest, excludes sample fixtures and
  `.storekit`, and matches its source release-critical Info.plist declarations.
  It predates FEAT-005 and is no longer an exact-current archive; the next
  archive must contain seven production SQLite resources.
- Direct keychain inspection finds two valid Apple Development identities.
  Automatic development signing produced, installed, and launched the
  pre-worldwide 2026-07-30 feedback build on the paired iPhone 16 Pro Max
  running iOS 26.5.2.
  Only the final app process remains. This is development install/launch proof,
  not a visual/background/TestFlight or FEAT-005 smoke. No Apple Distribution
  identity or App Store provisioning proof is available; the Release archive
  remains unsigned, not exportable/uploadable, and not a TestFlight candidate.
- An intermediate pre-final-audit worldwide Debug build, app `1.0 (1)`, then
  built with Apple
  Development team `796XH483R4` and installed in place over
  `com.localfirst.roam` on the same iPhone at 17:02 ET. The app path is
  `/private/tmp/Roam-Worldwide-Device-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  executable SHA-256 is
  `4e258505d77aa88e3fabcf8a45e7fdc6deff0993f53dbf2210edd1963ed048a5`,
  and its embedded catalog is the superseded 52,240,384-byte artifact with
  SHA-256
  `ab90f85f9b6a8b4af8fb34250c2d5c36fdec3f9d999f33939337815a497a6fc1`.
  It predates the final 52,236,288-byte
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`
  catalog and the final country-marker, Undo, export, and Release-gate fixes.
  The install did not uninstall or erase existing data, but CLI launch was
  denied because the phone was locked. This is in-place install and
  historical in-place-install evidence, not the final source, a launched
  physical smoke, migration proof, or TestFlight build.
- The exact final-source Debug app `1.0 (1)` then built for the paired iPhone
  16 Pro Max on iOS 26.5.2 (23F84), signed with Apple Development team
  `796XH483R4`, and installed in place over `com.localfirst.roam` at 17:54 ET
  without an uninstall. The source app is
  `/private/tmp/Roam-Final-Device-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  executable SHA-256 is
  `8be757e16b37edab4f1cedc27827b124e598c773b3db90f628ac6e4f5be5e09a`,
  and its embedded 52,236,288-byte catalog has canonical SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
  CoreDevice launched the new path and the stale pre-install process was
  terminated, leaving only the new app process. This is exact-source device
  build/sign/install/launch evidence, not migration-content, background,
  visual, native-share, accessibility, performance, or TestFlight proof.
  Evidence:
  `quality/evidence/testflight/TF-008/final-worldwide-device-install-2026-07-30.md`.
  This installation is superseded by the manual-city hierarchy build below.
- The final source containing both the manual Pittsburgh correction and its
  matching place-card outline state built, signed, and installed in place on
  that iPhone at 18:40 ET. The app is
  `/private/tmp/Roam-Pittsburgh-Device-Final-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  executable SHA-256 is
  `e03378596cad29b34a94b20c5f6debb7d74f429fd508102d6b40955781f843d9`.
  Its embedded 52,236,288-byte world catalog retains SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
  An initial launch attempt was denied while the phone was locked. After
  unlock, CoreDevice launched this final installation at 18:51 ET and process
  inspection showed its executable running from the installed app container.
  The outstanding human/device interaction checklist remains pending.
  Evidence:
  `quality/evidence/testflight/TF-008/manual-pittsburgh-device-install-2026-07-30.md`.
- The TestFlight backlog now contains 14 parent tasks and 100 subtasks with dependencies, procedures, acceptance criteria, evidence paths, metadata drafts, and rollout operations. TF-008.8–TF-008.12 cover measured callback/save cadence, effective settings, ordered/coalesced persistence, bounded diagnostics, and energy/service proof.
- All 114 TestFlight task/subtask records have lower-model-safe descriptions that explicitly answer summary, what, why, expected change, and how, with user-story context plus concrete execution, verification, evidence, and escalation instructions.
- FEAT-006 has a separate planned backlog of 10 tasks and 37 subtasks in
  `docs/tasks/trip-planning/README.md`; it is not included in those 114 current
  TestFlight records.
- The Notion mirror's 2026-07-29 snapshot has 110 unique rows (epic + 14 tasks
  + 95 subtasks), complete description fields/canonical paths, and 13 then-
  synchronized implementation-progress rows. The 2026-07-30 seven-resource/
  FEAT-005 repository updates now supersede that copy; re-export/re-query after
  integrated status settles. Jira is pending because no Roam project exists in
  the connected workspace.
- TF-002 now has code-complete portable builders plus a provider-neutral local
  restore/check transaction with 21/21 fixture tests; the owner-selected
  provider/authenticated CI and clean-checkout proof remain. Wave 1 also has a
  code-complete TF-004.3 canonical-generator slice. TF-006.1–TF-006.4 now have an injected StoreKit
  boundary, one explicit Plus state, exact localized product loading, truthful
  paywall states, and pending/duplicate guards. All 13 fake-backed tests pass
  in the Final8 262/262 non-StoreKit unit result. The six serial local
  integration cases
  are red on Xcode 26.6 / iOS 26.5 because the production product request
  returns no exact product and direct `SKTestSession.buyProduct` returns
  `StoreKitError.notEntitled`; rerun them on a known-good StoreKitTest runtime.
  None of these local slices completes its parent release task.
- TF-008.2 now has honest callback provenance plus finite structured
  lifecycle/filter/gate/lookup/transition/persistence/error diagnostics,
  disabled routine logging, 500-row pruning, and legacy coordinate/free-form
  export redaction. Accepted state/data-change now publishes only after save
  success, and a generation/suspension fence rejects late callbacks while
  deletion/recovery owns the persistence boundary. The current processor
  privacy/save-order/fence class passed 11/11; earlier broader affected and
  fault/context runs passed 35/35 and 19/19. TF-008.2 remains
  `verification_pending` for real store faults, overhead, and signed-device
  gates. See
  `quality/evidence/testflight/TF-008/structured-diagnostics-implementation.md`.
- TF-008.10 ordered/checkpoint infrastructure is locally `code_complete`:
  each Core Location callback is one stable timestamp-sorted actor batch,
  repeated same-area progress has an injectable retryable checkpoint, deletion
  drops stale pending work, and discovery effects follow save success. The
  cadence/privacy run passes 17/17 and transition/routing regressions pass 9/9.
  Production deliberately remains immediate because no cadence/loss budget is
  owner-approved; physical save/route/energy proof remains. See
  `quality/evidence/testflight/TF-008/persistence-cadence.md`.
- TF-008.11 now has locally `code_complete` bounded buffer/flush
  infrastructure and 29/29 focused diagnostic/privacy/cadence tests. It
  preserves finite redaction, durable 500-row retention, diagnostics-off,
  explicit access/clear, and deletion-generation boundaries without changing
  TF-009-owned files. Production still flushes immediately; owner-approved
  crash-loss/flush budgets, end-to-end export/clear wiring, and physical
  save/energy proof remain. See
  `quality/evidence/testflight/TF-008/diagnostic-cadence.md`.
- Delete All Data now covers app-controlled SwiftData history/settings,
  exports, diagnostics, and transient state; its actor-owned fence rejects
  late writers and confirmed deletion resets filter/transition state. The
  implementation supports atomic rollback/forward recovery for ordinary
  interruptions but does not claim power-loss durability. Real SwiftData/file
  faults, on-disk relaunch/migration, device, backup, and candidate proof
  remain.
- The superseded 2026-07-30 integrated `RoamTests` target, excluding only the separately red
  `StoreKitIntegrationTests`, passed 192/192 with no failures or skips on
  iPhone 17 Pro / iOS 26.5. It includes 19 manual-place
  persistence/Undo tests, one migration test, 13 catalog tests, 17 multi-tier
  hierarchy tests, 13 zoom tests, and 13 fake-backed StoreManager tests. The
  result is
  `/private/tmp/Roam-PostTripHierarchy-NonStoreKit-20260730-R4.xcresult`;
  baseline commit `b53e0ad750b57a9a58addfe706952c9da0101b28` does not identify
  the dirty workspace as an exact candidate. Final focused CSV, manual
  persistence/Undo, catalog, and hierarchy suites passed 60/60 at
  `/private/tmp/Roam-FinalFocused-20260730.xcresult`. Python tooling passed
  29/29, the App
  Factory and 14-task/100-subtask plan validators pass; the product-roadmap
  validator passes 14/100 TF, 8/21 WP, 10/37 TRIP, and 16/69 evolution items.
  Seven-resource
  enforcement passed. This is not a green UI/accessibility run, physical-device
  pass, signed archive, or TestFlight installation.
- The persisted-resume/routing suite passed 8/8, the final production
  hierarchy/visited-overlay/territory suite passed 28/28, the snapshot suite
  passed 5/5, and the core-loop UI suite passed 2/2. The processor
  privacy/save-order/deletion-fence class passed 11/11.
- Manual Pittsburgh now derives verified Census place `4261000`, county
  `42003`, and state `42` from its persisted catalog point, then United States
  and North America, while never consulting or contributing to the ZCTA tier.
  The focused production hierarchy suite passed 17/17. Existing saved
  Pittsburgh rows need no migration; human zoom inspection is still pending.
- FEAT-006 Plan a Trip is a repository-canonical planned proposal, not current
  source or TestFlight scope. `docs/tasks/trip-planning/README.md` contains
  TRIP-001–TRIP-010 and preserves the observed/remembered/planned model split.
- `docs/PRODUCT_ROADMAP.md` is now the product-phase authority. It routes the
  complete Phase 0–6 inventory into existing TestFlight/WP/TRIP packets and the
  16-task/69-subtask post-MVP plan in
  `docs/tasks/product-evolution/README.md`; external tools are copies only.
- Automatic zoom hierarchy WP-001 is locally `code_complete`: 24/24 focused
  tests cover North America → United States → Pennsylvania → Allegheny County
  → Pittsburgh → ZCTA. Automatic map behavior remains zoom-driven, while an
  explicit Home ZIP/States drill-down now truthfully retains the selected tier.
- The seventh production SQLite resource,
  `world_places_bundle.sqlite`, is locally verified at 52,236,288 bytes and
  SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
  It contains 250 addable current countries, all with verified GeoNames
  representative points, 69,542 GeoNames city points, and 175 Natural Earth
  country-polygon crosswalks. The other 75 current countries are marker-only;
  historical source records `AN` and `CS` are excluded. The exact validator,
  source preflight, and actual unsigned Release packaging gate pass locally.
  GeoNames requires CC BY 4.0 attribution; Natural Earth is public domain.
  Catalog/build/runtime slices are `code_complete`, but the seven-resource
  clean-checkout restore and candidate size gates remain.
  The fail-closed catalog validator has 9/9 fixture tests. An actual unsigned
  generic-iOS Release build passed and its packaged catalog revalidated to the
  exact reviewed hash; source preflight has zero failures and one expected
  no-archive warning. This is structural Release evidence only.
- Manual `VisitedPlace`/`PlaceVisit` persistence is separate from automatic
  ZCTA history, preserves unknown/year/month/range precision, exports in Full
  Export v4 plus separate Past Places/place-period/purpose CSVs, and participates in Delete
  All Data. Add-flow, upward-only map coverage/pins, History/detail, and
  receipt-based atomic Undo are present. The Undo/persistence/view-model suite
  passes 19/19; full UI, offline, accessibility, relaunch, and exact-device
  evidence remain `verification_pending`.
- ROAM-B22–ROAM-B25 now have one guarded persisted-tracking resume path,
  opt-in-safe one-shot routing, actionable Home metrics, explicit map scopes,
  production-index hierarchy translation with territory fallbacks, and an
  image-backed privacy-safe travel snapshot. See the 2026-07-30 TF-008/TF-010
  evidence notes. Keep them `verification_pending` until the launched iPhone
  completes the exact visual/share/relaunch checks.
- TF-010.1 now inventories nine free-beta surfaces; Roam Plus is absent. The
  named R11 defects were remediated without app-owned audit exceptions. The
  complete exact-current R66 run passes eight surfaces and fails only History
  on one anonymous `.elementDetection`/OCR finding. A green clean-run sequence
  and physical review remain `verification_pending`; older R9–R31 results are
  historical diagnostics only.

## Build and run

Use the commands in `TEST_PLAN.md`. Regenerate `Roam.xcodeproj` after changing project inputs. For a final release, run `Scripts/check_testflight_readiness.sh --archive <path>` without `--allow-unsigned`.

## Important constraints

- Preserve the local-first location-data posture.
- ZCTA boundaries are approximations, not official USPS delivery boundaries.
- Release must fail closed if any of the seven production SQLite resources
  (six geometry bundles plus one world-place catalog) is missing or invalid.
- Passive automatic collection remains supported-ZCTA-gated. Manual worldwide
  history is FEAT-005 data; country/city coverage propagates upward only and
  never marks child regions, cities, or ZIP areas.
- GeoNames city records are points, not city polygons. Show a marker and
  “Outline unavailable” when no verified outline exists.
- Overture Divisions packs are deferred until legal/product approval of ODbL,
  attribution/share-alike, disputed-boundary, hosting, size, and offline-cache
  behavior.
- Never describe a development-signed or unexportable archive as TestFlight-ready.
- Preserve unrelated user changes in the existing worktree.
- Treat Jira and Notion as mirrors; update repository task status/evidence first.
- When delegating, give the implementer exactly one packet section, require it to read the packet prerequisites and stop conditions first, and reject completion unless the named evidence exists.

## Next recommended task

Execute WP-008's Past Places UI, offline, migration/relaunch, export, deletion,
and accessibility checks on the installed exact final development build, then
run the automatic hierarchy, Past Places, and
ROAM-B22–ROAM-B25 checklists. Continue TF-010.6 with the exact R66 History
`.elementDetection`/OCR finding; do not add a broad audit suppression, and
rerun the full nine-surface suite after any retained change.
In parallel, authorized owners must execute TF-001, select/approve TF-002.1's
provider and redistribution/CI controls for all seven resources, and execute
TF-004.1–TF-004.2.
