# Project Status

Last verified: 2026-08-16

## Lifecycle status

`mvp_development`

## Current objective

Execute Phase 0 of the canonical `PRODUCT_ROADMAP.md`: produce an App Factory
0.4-conformant, signed, processed, internally verified **free Beta 1** build of
the local-first Roam travel map before promoting Roam Plus, Plan a Trip, or
later product phases. The candidate must contain no StoreKit/Roam Plus surface,
configuration, entitlement limit, or purchase/restore path.

## Verified

- The 2026-08-11 exact-current local source passes 283/283 `RoamTests` and
  2/2 `RoamCoreLoopUITests`, with zero failures or skips, at
  `/private/tmp/Roam-Exact-Current-Units-20260811.xcresult` and
  `/private/tmp/Roam-Exact-Current-CoreUI-20260811-R2.xcresult`. The first
  core-UI attempt was invalid because SpringBoard reported `Busy` before any
  test ran; the dedicated-simulator retry is the retained result. Python/
  tooling passes 89/89: 86 under `Scripts/tests` discovery plus 3 hierarchy-
  builder tests. Source readiness preflight reports 21 passes, zero
  failures, and the expected no-archive warning; release-resource, world-
  catalog, App Factory, TestFlight backlog, and product-roadmap validators are
  green. The earlier 2026-08-10 implementation slices remain 95/95 focused,
  46/46 progress/date, and 5/5 map-runtime. This is local source evidence, not
  signed-candidate or physical-device evidence; see
  `quality/evidence/milestone-0-1-implementation-2026-08-10.md`.
- The exact-current R66 accessibility run is complete across all nine free-
  beta surfaces on an iPhone 17e simulator running iOS 26.4.1: 8 passed, only
  History failed, and none skipped. The retained History failure is one
  anonymous `.elementDetection`/OCR finding; no audit suppression was added.
  This supersedes the R31 History-only checkpoint and the R11 4/9 baseline for
  current status, but the run is still red and the physical matrix remains
  open. See
  `quality/evidence/testflight/TF-010/exact-current-automated-audits-2026-08-11.md`.
- App Factory 0.4 registration, repository navigation, reuse review, and the
  registered feature contracts pass `Scripts/validate_app_factory_registration.py`.
- TF-003.5's bounded standard-library evidence writer is code-complete and has focused fixture tests for successful `.xcresult` counts, parse/zero-test failure, and redaction. It has not run in a hosted release workflow and is not candidate evidence.
- TF-004.4's bounded identity validator is code-complete with fixture coverage for pre/archive mismatch cases. It remains unable to pass without the owner-approved version/build, approved production manifest, clean candidate, fresh App Store uniqueness result, archive inspection, and processed-build reconciliation.
- The six local production geometry bundles pass SQLite integrity and
  production-metadata checks; the ZCTA bundle also passes semantic validation.
  The new seventh production resource,
  `world_places_bundle.sqlite`, is a 52,236,288-byte deterministic production
  artifact with SQLite integrity `ok`, SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`,
  250 addable current countries with verified GeoNames points, 69,542 cities,
  and 175 Natural Earth country-polygon crosswalks. The other 75 current
  countries are marker-only; historical source rows `AN` and `CS` are excluded.
- Production geometry feature counts are ZCTA 33,791; places 32,612; counties
  3,235; states 56; countries 177; continents 8. The separate world-place
  catalog has 69,792 searchable place rows.
- Neighboring visited map polygons now use different translucent fill colors
  at every hierarchy tier without emphasized borders; current and selected
  states retain distinct fills. The focused renderer checks pass 2/2, the
  complete hierarchy suite passes 19/19, and a disposable-simulator MapKit
  capture confirms adjacent San Francisco ZIP Areas remain individually
  legible. See `quality/evidence/map-neighbor-boundaries-2026-07-31.md`.
- The 2026-07-31 integrated unit target, exact only to its then-current
  revision and excluding the separately red StoreKit system-integration class,
  passed 262/262 with zero
  failures/skips on iPhone 17e / iOS 26.4.1. The prior core UI suite passes
  2/2 after catching and fixing Home ZIP/States drill-down scope retention;
  its current-candidate rerun is blocked because Xcode stalls while
  materializing/installing the UI-test worker.
  Python/tooling suites pass 80/80 (77 under `Scripts/tests`, including the
  TF-002 restore/rollback and TF-007 screenshot-provenance matrices, plus 3
  portable-builder tests). See
  `quality/evidence/testflight/TF-012/exact-current-local-verification-2026-07-31.md`.
- Generic Release static analysis and an unsigned structural archive passed for
  that historical revision. Archive preflight had zero failures and one
  expected unsigned warning;
  `/private/tmp/Roam-TestFlight-Structural-Final8-20260801.xcarchive` is 270 MB,
  contains a 258 MB app, all seven exact production
  databases and the privacy manifest, and excludes sample/StoreKit test data.
  It predates both the August 8 commerce removal and the V3/v4 change and is not
  current candidate evidence.
- The pre-Wave-1 full iPhone 17 Pro / iOS 26.4.1 simulator scheme passed 89 of 89 tests with zero failures and zero skips.
- The focused UI smoke test passed again after the MapKit publication fix and no longer emits the SwiftUI “Publishing changes from within view updates” runtime warning.
- The pre-worldwide generic-device Release build, static analysis, and unsigned
  structural archive completed with zero errors and zero warnings. Structural
  preflight reports 29 passes, zero failures, and the one expected unsigned
  warning. That historical six-geometry archive is
  `Roam-Final-Unsigned-Structural-20260729-1945R2.xcarchive`, with
  deterministic aggregate SHA-256
  `2121089cc9cd7a4a09c59c2445d3ecd4c251cb40c965fb19898bee719d7987b1`.
  It predates FEAT-005 and is no longer an exact-current packaging candidate.
- That historical archive contains its then-required six production geometry
  databases and a valid privacy manifest, and excludes sample SQLite fixtures
  and the test-only `Roam.storekit` configuration. A replacement archive must
  contain all seven current production SQLite resources.
- The pre-worldwide 2026-07-30 feedback build targeted to the paired iPhone 16 Pro Max
  on iOS 26.5.2, used automatic Apple Development signing for team
  `796XH483R4`, installed as `com.localfirst.roam`, launched successfully, and
  remained running after the stale prior process was terminated. This proves a
  development install/launch only, not visual behavior, background delivery,
  TestFlight installation, App Store distribution signing, automatic hierarchy,
  or worldwide Past Places behavior in the current source.
- An intermediate pre-final-audit worldwide Debug build, app version `1.0 (1)`,
  also signed with
  Apple Development team `796XH483R4` for `com.localfirst.roam`, built and
  installed over the existing paired iPhone 16 Pro Max app without uninstalling
  it at 17:02 ET. The installed app bundle came from
  `/private/tmp/Roam-Worldwide-Device-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  its executable SHA-256 is
  `4e258505d77aa88e3fabcf8a45e7fdc6deff0993f53dbf2210edd1963ed048a5`
  and its embedded catalog is the superseded 52,240,384-byte artifact with
  SHA-256
  `ab90f85f9b6a8b4af8fb34250c2d5c36fdec3f9d999f33939337815a497a6fc1`.
  It predates the final 52,236,288-byte
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`
  catalog and the final country-marker, Undo, export, and Release-gate fixes.
  CLI launch was denied because the phone was locked, so this proves build,
  signing, catalog embedding, in-place installation, and preservation of the
  app container only—not the final source, launch, migration correctness,
  visual behavior, or a physical smoke pass.
- The exact final-source Debug app `1.0 (1)` then built successfully for the
  paired iPhone 16 Pro Max on iOS 26.5.2 (23F84), signed with Apple Development
  team `796XH483R4`, and installed in place over `com.localfirst.roam` at 17:54
  ET without an uninstall. The source app is
  `/private/tmp/Roam-Final-Device-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  executable SHA-256 is
  `8be757e16b37edab4f1cedc27827b124e598c773b3db90f628ac6e4f5be5e09a`,
  and its embedded 52,236,288-byte catalog has canonical SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
  CoreDevice launched the new installed path successfully, and the stale
  pre-install Roam process was terminated so only the new process remained.
  This proves exact-source device build/sign/install/launch and embedded
  catalog identity, not migration contents, background tracking, visual
  correctness, native sharing, accessibility, performance, or TestFlight.
  See
  `quality/evidence/testflight/TF-008/final-worldwide-device-install-2026-07-30.md`.
  This installation was superseded by the manual-city hierarchy build below.
- The final source containing both the manual Pittsburgh hierarchy correction
  and matching place-card outline state built, signed, and installed in place
  on the same iPhone at 18:40 ET. The app is
  `/private/tmp/Roam-Pittsburgh-Device-Final-20260730/Build/Products/Debug-iphoneos/Roam.app`;
  executable SHA-256 is
  `e03378596cad29b34a94b20c5f6debb7d74f429fd508102d6b40955781f843d9`,
  and its embedded 52,236,288-byte catalog retains SHA-256
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
  An initial launch attempt was denied while the phone was locked; after
  unlock, CoreDevice launched the final installation at 18:51 ET and process
  inspection showed its executable running from the installed app container.
  This is final-source build/install/launch proof—not a human visual hierarchy
  check or a broader physical-device pass. See
  `quality/evidence/testflight/TF-008/manual-pittsburgh-device-install-2026-07-30.md`.
- The Final8 exact-current 2026-08-01 development-signed build supersedes those
  device installations. It built for team `796XH483R4` and installed in place
  on the paired iPhone 16 Pro Max without uninstalling its container. Its
  executable SHA-256 is
  `7825d0c5a79266e7f97fb0f0205327616c4c57fa4c5578819613b1f9f307d455`;
  its catalog matches the canonical hash. CoreDevice launched the exact-current
  app successfully at 22:55 local time immediately after installation. See
  `quality/evidence/testflight/TF-008/exact-current-device-install-2026-07-31.md`.
- Source and archive release-critical Info.plist declarations now agree and
  are guarded by preflight. Version/build derive from build settings; required
  location, launch/display, orientation, and encryption declarations are
  present.
- Release runtime paths refuse sample data, and the build fails closed for missing, corrupt, or non-production geometry.
- Privacy policy, terms, in-app privacy/support links, and persistence failure behavior now match the current product.
- The complete TestFlight backlog is defined in the repository as 14 parent tasks and 100 implementation subtasks with dependencies, exact procedures, acceptance criteria, evidence paths, App Store Connect metadata drafts, and an operational rollout/rollback runbook. TF-008.8–TF-008.12 add measured cadence, truthful controls, ordered/coalesced persistence, bounded diagnostics, and physical energy/service proof.
- Every parent task and subtask has a repository-canonical execution packet that explicitly answers summary, what, why, expected change, and how, with user-story context, ordered steps, files, commands, evidence, verification, and stop/escalation conditions suitable for a lower-capability implementation agent.
- The planned FEAT-006 Plan a Trip backlog is separately defined as 10 parent
  tasks and 37 subtasks. Every item has an implementation-safe description,
  steps, and acceptance criteria; it remains outside the 14-task/100-subtask
  TestFlight backlog.
- The 2026-07-29 Notion snapshot contains 110 unique rows (one epic, 14 tasks,
  and 95 subtasks) with complete description/canonical-path fields; the epic
  plus 12 slices then had synchronized implementation progress. The
  2026-07-30 seven-resource/FEAT-005 repository updates now supersede that
  mirror and must be copied after integrated status/evidence stabilizes.
- Wave 1 local slices removed workstation-specific geometry-builder defaults
  and made `project.yml` authoritative for generated version/build settings.
  The former Roam Plus implementation used an injected production boundary,
  one explicit state, exact localized product loading, verified exact-product
  entitlement checks, and pending/duplicate guards. That implementation and
  its 13 fake-backed tests are historical future-commerce evidence only; the
  2026-08-08 free-beta source removes them from Beta 1.
- Honest single-manager location provenance, diagnostic coordinate redaction,
  idempotent legacy diagnostic cleanup, hard-redacted diagnostic exports, and
  attempt-specific Settings exports are locally code-complete for their named
  slices. The location pipeline now publishes accepted state/data-change only
  after its primary save succeeds and rejects callbacks captured before or
  during deletion recovery.
- TF-008.9 is locally `code_complete`: one validated effective location
  configuration now applies persisted custom distance/accuracy/auto-pause and
  the background-indicator preference through an injected manager adapter.
  Invalid legacy values normalize back into the displayed settings, unchanged
  reconfiguration does not restart services, and changed service membership
  touches only the affected service. The focused suite passed 10/10 with zero
  failures/skips, and a fresh unsigned generic-iOS Release build passed.
- The superseded 2026-07-30 integrated `RoamTests` target, excluding only the
  separately red `StoreKitIntegrationTests`, passed 192 of 192 with zero
  failures and zero skips on iPhone 17 Pro / iOS 26.5. It includes 19
  manual-place persistence/Undo tests, one migration test, 13 catalog tests, 17
  multi-tier hierarchy tests, 13 zoom-resolver tests, and 13 fake-backed
  StoreManager tests. The result is
  `/private/tmp/Roam-PostTripHierarchy-NonStoreKit-20260730-R4.xcresult`;
  baseline commit `b53e0ad750b57a9a58addfe706952c9da0101b28` does not identify
  the dirty workspace as an exact release candidate. The latest focused
  production hierarchy suite passed 17/17 at
  `/private/tmp/Roam-ManualPittsburgh-Hierarchy-20260730-R3.xcresult`;
  the preceding focused CSV/manual/catalog/hierarchy run passed 60/60 at
  `/private/tmp/Roam-FinalFocused-20260730.xcresult`. Python tooling passed
  29/29. App Factory validation passed six contracts, TestFlight
  plan validation passes 14 tasks/100 subtasks, product-roadmap validation
  passes 14/100 TF, 8/21 WP, 10/37 TRIP, and 16/69 product-evolution items,
  and seven-resource enforcement
  passed. Structural preflight had zero failures and one expected no-archive
  warning. This is integrated non-StoreKit unit/tooling evidence, not a green
  UI/accessibility suite, physical-device pass, signed archive, or TestFlight
  installation.
- The focused persisted-tracking resume/routing suite passed 8/8; the final
  production hierarchy, visited-overlay, and territory suite passed 28/28; the
  snapshot suite passed 5/5; and both core-loop UI journeys passed 2/2. The
  processor privacy/save-order/deletion-fence class passed 11/11.
- WP-001 is locally `code_complete`: 24/24 focused tests exercise the
  automatic North America → United States → Pennsylvania → Allegheny County →
  Pittsburgh → ZCTA progression and Home focus-versus-lock behavior.
- WP-002 is locally `code_complete`: the deterministic catalog build above,
  six builder fixture tests, 13 Swift catalog tests, nine exact-validator
  tests, exact seven-resource enforcement, and source/license evidence are
  recorded at
  `quality/evidence/world-place-catalog-2026-07-30.json`. This is local
  artifact evidence, not clean-checkout restoration or exact candidate proof.
  An actual unsigned generic-iOS Release build also passed, and the catalog
  packaged in its `Roam.app` revalidated to the exact reviewed hash. Source
  preflight reports zero failures and one expected no-archive warning; no
  signed archive/export/upload was produced.
- WP-003/WP-010 are locally `code_complete`: the current `RoamSchemaV3` store
  adds normalized `PlaceVisitPurposeTag` rows without changing V1/V2 entities,
  and guarded visit operations participate in Full Export v4 and Delete All
  Data. V1→V2→V3 and V2→V3 fixtures, seven-model relaunch state, purpose export,
  Undo, and deletion are included in the current 283/283 unit run. Exact-build
  relaunch, rollback, UI, and physical-device evidence remain.
- WP-005 now resolves a manual Pittsburgh record through its persisted catalog
  point to Pittsburgh `4261000`, Allegheny County `42003`, Pennsylvania `42`,
  United States, and North America while contributing no ZIP. The 17/17
  production hierarchy suite and the current 283/283 unit target are green;
  human device zoom inspection remains pending.
- The retained TF-010.1 R9 baseline runs ten independent automated
  accessibility audits across its then-current screens with zero skips and no
  blanket handler. The historical
  complete run, `Roam-A11y-Remediation-Final-20260731-R9.xcresult`, executed all ten:
  Delete, Export Data, Onboarding, Privacy & Help, and Roam Plus passed; five
  failed; none skipped (SHA-256
  `28e31ff6633291875b6c64a2329912f78da5beb48a11a1b13b942f5b171acd93`).
  Native adaptive labels resolve three app-owned cells. History, Home,
  Progress, and Settings retain contrast findings, while Map retains an
  elementless native `_MKUILabel` Dynamic Type report. No full clean run is
  claimed. Because that baseline includes the now-removed Roam Plus screen, it
  cannot establish the current free-beta screen inventory or a build-4+
  candidate.
  A final narrow R10 diagnostic made no safe net improvement: Map passed with
  the existing exact MapKit classifications, but the experiment regressed
  Export and encountered AX snapshot failures. All R10 source changes were
  reverted. R9 matched that retained 2026-07-31 source but is superseded for the
  current free-beta inventory by the 2026-08-11 R66 result below.
- On 2026-08-01, a fresh iPhone 17e focused History audit reproduced the
  `Today` header contrast finding. A semantic-foreground experiment was
  reverted after its clean retry still failed contrast without identifying a
  different target. One prior retry was invalid because Xcode produced no
  readable result bundle after `DebuggerLLDB.DebuggerVersionStore.StoreError`;
  the clean retry is evidence of an unresolved finding, not a pass.
- The same fresh-simulator investigation then resolved the Home audit through
  exact element-by-element remediation. The shared SectionHeader, Share card,
  Recent row, and statistic-tile text now use native Dynamic-Type-aware labels
  where they were the audit target; `testHomeAccessibilityAudit` passed in
  8.48 seconds at
  `/private/tmp/Roam-A11y-Fresh-Home-Fix8-20260801.xcresult`. At that source
  revision, a full ten-surface rerun was still required.
- The Progress ring and Settings privacy/section text received the same
  app-owned adaptive-label remediation. Their focused audits still report only
  element-less SwiftUI/Form contrast nodes, so no exception is retained.
  Those full-unit/full-audit attempts were invalid because Xcode left result
  directories without `Info.plist`; they are not counted as passing evidence.
- The five named R11 Delete, History/Home contrast, Map-label, and Settings
  failures were remediated without suppressing an app-owned audit finding.
  The 2026-08-11 exact-current R66 run now executes the complete nine-surface
  inventory: Delete, Export, Home, Map, Onboarding, Privacy, Progress, and
  Settings pass; only History fails; none skip. The remaining failure is one
  anonymous `.elementDetection`/OCR finding, not the stale R31-only result, and
  no audit suppression was added. TF-010 remains `verification_pending` until
  the run is green under its clean-run policy and the physical matrix exists;
  see
  `quality/evidence/testflight/TF-010/exact-current-automated-audits-2026-08-11.md`.
- Current Apple TestFlight, signing, privacy, export-compliance, review, size,
  accessibility, and metrics requirements were reconciled against official
  Apple documentation on 2026-07-29. The IAP research is retained only for the
  deferred future paid-release specification, not as a Beta 1 requirement.
- The two core UI tests were attempted on the paired iPhone after the final
  install. XCTest rejected both before app assertions because the device was
  not authorized for UI testing actions. This is retained as an explicit
  physical-device environment blocker; a retained earlier Simulator run passes
  2/2 and the 2026-08-11 exact-current local simulator retry also passes 2/2,
  but a signed-candidate physical UI rerun is still required.

## Verification pending

- TF-011's recorded bounded local prerequisite is historical relative to V3:
  fixed-seed test-only histories covered the prior six SwiftData models, and a
  37-row contract probe locks its
  manifest SHA-256, a 593-row simulator probe records non-gating fetch/catalog/
  hierarchy measurements, and exact built-app/archive checks reject the unique
  performance-fixture control. The final Release-optimized focused run passed
  7/7 with zero skips on iPhone 17e simulator / iOS 26.5. These counts and
  observations have no approved typical/large or pass/fail meaning. TF-011
  remains blocked on owner workloads/budgets, production instrumentation,
  CI variance, exact-candidate physical memory/frame/battery results, archive/
  app size, Apple thinned sizes, and a fresh seven-model V3 fixture run. See
  `quality/evidence/testflight/TF-011/local-simulator-baseline-2026-07-31.md`.

- TF-001: on 2026-08-02, Xcode automatic provisioning for team `796XH483R4`
  exported `/private/tmp/Roam-TestFlight-Export-20260802/Roam.ipa` with a
  Cloud Managed Apple Distribution certificate, an App Store provisioning
  profile for `com.localfirst.roam`, `get-task-allow=false`, and
  `beta-reports-active=true`. The initial upload attempt stopped because no app
  record existed. On 2026-08-03, the authorized operator created `Roam: Travel
  Map` (Apple ID `6797686521`) with the approved SKU, language, Travel category,
  and copyright, then delivered build `1.0 (1)` without upload errors. The
  immediate TestFlight view had no build yet, which is consistent with Apple
  processing/propagation; no processed or tester-available build is claimed.
- TF-001: on 2026-08-16, the frozen `codex/app-store-candidate-1.0.4` candidate
  (commit `2b32c45b8a06bcd74d9f0ea640fe45a3683fd639`, working tree clean, = origin)
  was archived with `xcodebuild archive` (`CODE_SIGN_STYLE=Automatic`,
  `DEVELOPMENT_TEAM=796XH483R4`) and delivered with `xcodebuild -exportArchive`
  using `ExportOptions-TestFlight-Upload.plist` (`destination=upload`,
  `signingStyle=automatic`). The archive embeds the exact seven production SQLite
  resources with no sample/StoreKit data; release resource validation passed
  during the archive build. Xcode's distribution log and the archive's own
  structured `Info.plist` delivery record both report success: `Upload
  succeeded`, `uploadedBuildNumber "4"`, `uploadEvent state "success"` for
  `adamId 6797686521` / `com.localfirst.roam`, the same App Store Connect record
  as the historical builds above. This supersedes builds `1.0 (1)`–`(3)` as the
  current candidate delivery. Apple processing, tester-visible availability,
  internal-group assignment, install, and smoke-test are not yet verified. See
  `quality/evidence/testflight/TF-001/build-4-archive-upload-2026-08-16.md`.
- TF-012 local release checks were refreshed on 2026-08-02: the exact
  auto-provisioned archive passed the repository structural preflight with
  zero failures and zero warnings on its 2026-08-03 refresh, and the Release
  analyzer completed cleanly. A focused Core Loop UI rerun remains
  unverified because Xcode aborted before recording test results with
  `DebuggerLLDB.DebuggerVersionStore.StoreError`; restarting a crashed
  CoreSimulatorService on 2026-08-03 restored simulator operation but not the
  UI debugger handoff. A focused `ManualPlacePersistenceTests` unit rerun did
  produce a valid 19/19 passing result on the repaired iPhone 17 Pro/iOS 26.5
  simulator. This remains a local Xcode UI-test runner failure, not an app
  assertion failure, and is not a substitute for the required UI evidence.
- TF-002: all seven production SQLite artifacts are generated and gitignored;
  a clean checkout lacks an authenticated restore or deterministic complete
  build.
- TF-002: portable builders, the canonical seven-resource manifest, shared
  fail-closed validation, and a provider-neutral local restore transaction are
  code-complete. The transaction accepts an explicit exact directory/zip/tar,
  is offline/read-only in `--check`, validates before mutation, serializes
  installs, uses an incomplete marker, and rolls back injected interruption.
  Its 21 tests pass; the manifest validator's 19 tests also pass. The owner-
  approved artifact strategy/provider, authenticated CI path, credential names,
  second-operator review, and clean-checkout proof do not yet exist.
- TF-004: generator drift is removed, but owner decisions for the first beta version/build policy and exact archive/processed-build reconciliation remain.
- TF-004/TF-007: owner decisions remain for first beta version/build, SKU, category, age rating, content rights, screenshots, and private review/tester contacts.
- TF-007.5's icon structure is locally enforced: the source AppIcon is
  1024×1024 without alpha, and archive preflight requires the compiled AppIcon,
  asset catalog, 120×120 phone rendition, and no alpha. Product approval,
  processed-build reconciliation, and privacy-safe candidate screenshots remain.
- TF-007.5 now also has a reproducible disposable-simulator draft workflow and
  a fail-closed validator with 6/6 focused tests. Six privacy-safe 1320×2868
  JPEG drafts—Home, Map, Progress, Past Places, Add Past Places, and Privacy—
  were captured without alpha from the current compile-green Debug source and
  recorded with provenance. R4 resolves the earlier History debug label and
  Home/Progress obstruction findings; preview controls are DEBUG-only and
  absent from the inspected Release executable. The set remains explicitly
  non-candidate and not upload-ready: it is not the exact processed build, has
  no product/legal or App Store Connect approval, and its Progress image shows
  a Plus entry that is prohibited in Beta 1. Recapture that surface from the
  exact build-4+ free candidate; TF-006 does not make the old image eligible.
- TF-005: both configured privacy/support URLs return public HTTPS 200 responses
  while logged out. Owner/legal approval, exact-candidate network inventory,
  and App Privacy/export-compliance entry/reconciliation remain.
- TF-006: Roam Plus is deferred and its historical unit/integration, App Store
  Connect product, sandbox, and commerce-accessibility requirements are not
  Beta 1 gates. Source-level removal is locally `code_complete` as of
  2026-08-08, but the signed exact-candidate absence proof is still pending.
  The uploaded build `1.0 (3)` predates that removal and cannot satisfy it.
- TF-008–TF-012: physical-device location/background, automatic hierarchy,
  worldwide add/map/history behavior, V1→V2→V3 persistence/migration/Full
  Export v4/deletion,
  accessibility/layout, performance/battery, and full release-candidate
  evidence are incomplete. TF-010.1 and TF-010.6 remain
  `verification_pending`: exact-current R66 is a complete nine-surface run but
  is red at 8/9 because History retains one anonymous `.elementDetection`/OCR
  finding. Complete the
  largest Dynamic Type, VoiceOver, light/dark, increased-contrast, motion, and
  transparency device matrix; fix any reproduced defect or narrowly classify
  only the exact retained Xcode findings; then produce three clean consecutive
  full runs on the exact candidate.
- Physical XCTest is also an explicit environment blocker: the paired iPhone
  rejected both core UI tests before application assertions with `Not
  authorized for performing UI testing actions`. Enable device UI automation
  before the physical UI/accessibility matrix; do not count that attempt as an
  application regression.
- ROAM-B22–ROAM-B25 are code-complete and locally green. The exact final
  development-signed build is installed and launches on the connected phone,
  but a user/device pass must still
  confirm persisted tracking after force-quit, no off-state visit writes,
  highlighted ZIP/state scopes and camera framing, Longest Visit context, and
  non-blank native share destinations plus the saved snapshot. Map performance
  and the full accessibility matrix remain separate release gates.
- TF-008 now records honest single-manager callback provenance and uses finite,
  versioned privacy-safe diagnostics for lifecycle, authorization, filtering,
  lookup, auto-color gates, transitions, save outcomes, pause/resume, and
  Core Location error categories. New and legacy diagnostic coordinates and
  free-form messages are redacted before export. The broader affected suite
  passed 35/35 and the latest fault/context subset passed 19/19, both with zero
  skips on an iPhone 17 / iOS 26.4.1 simulator. TF-008.2 remains
  `verification_pending` for real persistent-store fault, overhead, and
  signed-candidate device proof.
- TF-008.9 remains `verification_pending` for an exact-candidate physical check
  that the Settings values and background-indicator preference match observed
  iOS behavior. Local fake-manager proof is recorded in
  `quality/evidence/testflight/TF-008/effective-configuration.md`.
- TF-008.10 ordered-batch and checkpoint infrastructure is locally
  `code_complete`: one callback reaches one timestamp-sorted actor operation,
  repeat same-area progress is retryable, lifecycle/deletion flush fences are
  explicit, and discovery publishes only after save. The release task remains
  `verification_pending`: focused cadence/privacy tests pass 17/17 and the
  transition/routing regression passes 9/9 with zero skips, but production
  still uses the immediate policy until an owner approves measured
  cadence/loss bounds, and physical route/save/energy evidence is absent.
  This slice does not claim a non-immediate diagnostic policy. See
  `quality/evidence/testflight/TF-008/persistence-cadence.md`.
- TF-008.11 bounded diagnostic-buffer infrastructure is locally
  `code_complete`: count/age/critical/lifecycle policy, hard memory cap,
  oldest-first finite rows, combined visit saves, failure retention/retry,
  explicit generation-fenced flush/discard seams, toggle behavior, redaction,
  and deletion fencing pass 29/29 focused tests with zero skips. It remains
  `verification_pending`: production still flushes immediately, no crash-loss
  budget or write/energy improvement is approved, and end-to-end TF-009-owned
  export/clear coordination remains a prerequisite to any delayed policy. See
  `quality/evidence/testflight/TF-008/diagnostic-cadence.md`.
- TF-009's audited consequential production reads and writes now fail closed.
  The stale Settings export-success path is fixed. Main-context settings
  fetch/create/update and production Dashboard, History, Map, selected-place,
  and Past Places reads now enter preserved-data recovery instead of
  fabricating an empty store or continuing follow-up effects. Offline
  worldwide map-catalog construction/read failure now presents Coverage
  Unavailable instead of silently using an empty crosswalk. The final injected
  boundary passes 4/4, the preceding broader affected run passes 39/39, and the
  actor-fetch regression passes 30/30. Those focused results are retained; the
  current merged unit target passes 283/283.
  Per-ZCTA deletion now returns its durable-save result so the view cannot
  dismiss after rollback, and its CSV export attempt clears stale success and
  uses privacy-safe finite failure copy rendered in an alert; focused
  regressions cover failure, success, and retry state.
  Delete All Data now
  journals app-controlled model/file work, fences late location/diagnostic/
  end-visit writers, resets processor state only after confirmed deletion, and
  provides rollback/forward recovery for ordinary interrupted operations. A
  real injected SwiftData save failure exposed unsafe batch deletion; the
  relationship-safe object-delete fix preserved all six then-current model
  categories on rollback and cleared/reset them on forward retry. Historical
  V1→V2, six-model relaunch, and export-v3 runs remain useful for their exact
  revisions. Current `RoamSchemaV3` adds the seventh
  `PlaceVisitPurposeTag` model and Full Export v4; V1→V2→V3, V2→V3,
  seven-model relaunch/rollback/deletion, and purpose export checks now run in
  the current 283/283 unit target. They still require exact-candidate/device
  repetition. Representative SwiftData fetch
  failure plus real temporary-file stage/rollback/quarantine-removal failures
  retry in the correct direction. The recorded pre-V3 export/deletion TF-009
  slice is 36/36 on iPhone 17e simulator / iOS 26.5; the separate pre-V3
  migration/relaunch slice is 30/30. Actor-local tracked-area, open-visit,
  display-start, same-area
  checkpoint, legacy-diagnostic normalization, and diagnostic-retention reads
  now fail explicitly instead of becoming empty state; the focused regression
  passes 30/30 on iPhone 17e / iOS 26.4.1. This is not proof of power-loss
  durability. The bounded TF-009.8 storage slice passes 15/15: a complete
  synthetic store family is checkpointed, copied, validated, deterministically
  corrupted, and proven byte-preserved while fallback blocks tracking/writes;
  injected no-space/permission commits and FileStore writes preserve prior
  durable data and expose no false success. OS-level permission/volume faults,
  representative large history, physical low-space,
  exact-candidate/device, and approved backup/file-protection evidence remain.
- 2026-08-08 release recheck: the then-current full non-StoreKit unit suite
  passed, source
  TestFlight preflight has zero failures (no archive supplied), and the Map
  coverage menu now preserves the current camera while changing its scope.
  The complete-scheme attempt, which still included the then-present
  `StoreKitIntegrationTests`, was interrupted after 239.536 seconds because the
  simulator runner could not materialize workers. That is historical runner
  evidence, not a current StoreKit gate. The remaining UI/launcher verification
  failure still blocks exact-candidate evidence; removed StoreKit tests do not.
- 2026-08-08 free-beta decision: Roam Plus/StoreKit is now removed from the
  shipping source, generated project, and unsigned structural archive rather
  than merely hidden. The full `RoamTests` target passes and the structural
  archive has the exact seven resources without a sample fixture or commerce
  artifact. The complete scheme still stops before UI assertions at the
  separate `DebuggerLLDB.DebuggerVersionStore.StoreError` launcher failure;
  signed candidate, UI, accessibility, and physical evidence remain open. The
  unsigned structural archive reports local build number `1.0 (3)`, but that
  does not make it the same binary as the already uploaded August 6 build 3;
  App Store build numbers cannot be reused for the replacement. A signed,
  uploaded, processed build `1.0 (4)` or higher must repeat the archive and
  no-commerce checks.
- FEAT-005/WP-004–WP-010 remain `verification_pending`: the V3 purpose-tag,
  Full Export v4, catalog-denominated progress, date validation, map-runtime,
  and History action changes are included in the current 283/283 unit run.
  Focused Milestone 0/1 integration passes 95/95, core-flow UI passes 2/2,
  progress/date regressions pass 46/46, map-runtime regressions pass 5/5, and
  the unsigned Release/source preflight gates are green. The add/map/history
  journeys still need a green complete accessibility run plus offline/relaunch,
  physical-device, and exact-candidate evidence. Worldwide city,
  administrative, postal, and road polygon packs remain future scope; London
  is a marker with verified United Kingdom/Europe parents, not a city polygon.
  Do not infer user-flow completion from unit coverage alone.
- FEAT-006 Plan a Trip is `planned` and intentionally excluded from this
  TestFlight gate. Its repository-canonical TRIP-001–TRIP-010 plan defines
  future intent as separate from both observed and remembered history.
- TF-013/TF-014: historical build 1 is in the controlled internal group, but no
  processed build-4+ free-beta candidate, exact-candidate internal smoke,
  external review, staged rollout, or final go/no-go evidence exists.
- Jira remains intentionally unsynchronized because the connected workspace has no Roam project; copying into an unrelated project would violate the repository-first mirror policy.
- Notion's 110-row 2026-07-29 copy is stale after the repository's
  seven-resource/FEAT-005 updates. Re-export and re-query it only after the
  repository descriptions/status settle; the repository remains authoritative.

## Blockers

- TF-001/TF-003: build `1.0 (1)` is historical internal-TestFlight evidence.
  Uploaded build `1.0 (3)` was accepted on 2026-08-06 as a Plus-hidden binary,
  before the 2026-08-08 source-level StoreKit removal. It cannot prove the
  free-beta source, generated project, or archive. Build `1.0 (4)` was frozen,
  distribution-signed, and uploaded on 2026-08-16 (see
  `quality/evidence/testflight/TF-001/build-4-archive-upload-2026-08-16.md`);
  Apple processing, reconciliation, TestFlight group binding, install, and
  smoke-test evidence still remain before exact-candidate QA or smoke evidence
  begins.
- TF-002: establish reproducible release-artifact restoration for all seven
  SQLite resources: six geometry bundles plus the world-place catalog.
- TF-004/007: freeze a clean candidate and approve/enter version/build,
  categories, age/content rights, copyright, screenshots, and private contacts.
- TF-006: Roam Plus and all StoreKit/IAP work are deferred from free Beta 1.
  Build 4+ must prove there is no commerce code, configuration, purchase/
  restore surface, entitlement, or state-limit paywall; future paid-release
  specifications remain in `docs/tasks/testflight/TF-006.md`.
- TF-010/011: complete physical accessibility, performance, memory, size, and
  background-location energy/cadence budgets and evidence.
- TF-013/014: distribution-sign, upload, process, assign, install through
  TestFlight, and record rollout/go-no-go evidence.

## Next action

Build `1.0 (4)` from the 2026-08-08-or-later free-beta source was frozen,
distribution-signed, and uploaded on 2026-08-16 (see
`quality/evidence/testflight/TF-001/build-4-archive-upload-2026-08-16.md`). The
strict archive search that proves commerce is absent (TF-006) against this
exact uploaded build still needs to be repeated and recorded. Confirm Apple
finishes processing build 4 in App Store Connect, then reconcile its identity
(TF-004), bind it to the restricted Release QA group, install, and smoke-test
(TF-003/TF-013) — none of that ASC-side work is done yet. Only after Apple
processes that exact build should automatic hierarchy, Past Places,
ROAM-B22–ROAM-B25, background/force-quit, VoiceOver/largest-Dynamic-Type,
migration/export/deletion, and performance/energy physical checklists begin.
In parallel, resolve TF-002.1's artifact strategy, metadata/private contacts,
and performance/cadence budgets. Do not reuse build 3 or carry its UI/device
evidence forward.
