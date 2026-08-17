# Release Checklist

Last automated review: 2026-08-10

The unchecked gates map to canonical tasks in `TESTFLIGHT_READINESS_PLAN.md`. Check a gate only when its durable evidence exists for the exact candidate.

- [x] Census, Natural Earth, and GeoNames source/license/provenance are recorded; the local world-place artifact identity is 52,236,288 bytes and SHA-256 `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
- [x] All seven local production SQLite resources pass their current integrity/metadata gates: six geometry bundles plus one 250-current-country/250-country-point/69,542-city/175-crosswalk catalog; ZCTA also passes semantic validation. The exact world-catalog validator is enforced by source preflight and Release packaging.
- [ ] The auto-provisioned 2026-08-02 archive contains all seven manifest-matching production resources, excludes sample fallback/test StoreKit data, and passed its 2026-08-03 preflight refresh with zero failures and zero warnings. It remains unchecked because the working tree is not a frozen candidate and only the exported IPA—not the archive—has App Store distribution signing.
- [ ] The 2026-08-02 Release analyzer completed cleanly and the auto-provisioned archive exported successfully. This remains unchecked because analysis/build evidence alone cannot satisfy the exact frozen distribution-candidate gate.
- [x] Pre-Wave-1 simulator baseline is recorded: 89 passed, 0 failed, 0 skipped.
- [ ] Current required suites are all green. The 2026-08-10 local source passes 95/95 focused Milestone 0/1 tests, 283/283 complete unit tests, 2/2 core-flow UI tests, 46/46 progress/date regressions, a 5/5 map-runtime slice, an unsigned Release build, and source preflight with zero failures. Accessibility remains red on one exact-current History viewport-edge hit-region audit, and physical UI, route/energy/performance, clean-candidate, signed-archive, and TestFlight gates remain open. See `quality/evidence/milestone-0-1-implementation-2026-08-10.md`.
- [x] Fake and preview data are excluded from the Release app.
- [x] Debug controls are compiler-protected.
- [x] Permission declarations match the implemented location modes.
- [x] Privacy policy and terms match current repository behavior.
- [x] ZCTA terminology and known limitations are visible and accurate.
- [x] Known limitations and recovery behavior are documented.
- [ ] TF-001 — The App Store Connect record `Roam: Travel Map` (Apple ID `6797686521`) exists for `com.localfirst.roam`, and Build `1.0 (1)` is historical internal-TestFlight evidence. Uploaded Build 3 predates the free source and V3/v4 persistence changes. Build `1.0 (4)` was automatically provisioned, archived, and uploaded on 2026-08-16 (`quality/evidence/testflight/TF-001/build-4-archive-upload-2026-08-16.md`); process, reconcile, assign, install, and smoke-test remain, so no current candidate is claimed yet.
- [ ] WP-008 / FEAT-005 — Automatic hierarchy, offline add/batch/edit, upward-only map coverage, History, Full Export v4/four separate CSVs, Delete All Data, relaunch, and accessibility pass on the integrated exact build.
- [ ] TF-002 — All seven production SQLite resources restore/build reproducibly and validate from a clean checkout.
  The local provider-neutral restore/check/rollback layer is implemented and
  fixture-tested; selecting and connecting the approved provider plus clean-
  checkout/archive evidence remains.
- [ ] TF-003 — Protected release pipeline passes, uploads/processes the build, emits exact-build evidence, and binds that build to a restricted Release QA group with one non-developer TestFlight install.
- [ ] TF-004 — Version/build/commit/artifact identity is unique and reconciled with the processed build.
- [ ] TF-005 — Privacy/support URLs are live; data inventory, App Privacy, privacy manifest, and export compliance agree.
- [ ] TF-006 — Deferred from the free beta by owner decision on 2026-08-08. Source and the unsigned structural archive contain no StoreKit framework/configuration, paywall, purchase, restore, entitlement, or gated limit; see `quality/evidence/testflight/TF-006/free-beta-removal-2026-08-08.md`. The exact signed candidate archive/search proof is pending. Reopen this gate only when commerce is intentionally promoted.
- [ ] TF-007 — App information, age rating, content rights, screenshots/icon, beta description, What to Test, review notes, known limitations from TF-008–TF-012, processed-binary facts, and contacts are complete.
- [ ] TF-008 — Background tracking is reviewed across permission/accuracy changes, lifecycle interruption, devices, and real routes.
- [ ] TF-009 — V1→V2→V3 and genuine V2→V3 migration, automatic and manual history/purpose persistence, failure recovery, relaunch, Full Export v4/four separate CSVs, complete app-controlled data/settings deletion, crash-safe deletion-journal recovery, and full SQLite-store-family corruption handling are verified.
- [ ] TF-010 — Accessibility audit, VoiceOver, Dynamic Type, reduced motion, contrast, appearance, and supported layouts include Add past places/Past Places and have evidence.
- [ ] TF-011 — Seven-resource App Store thinned size, catalog search, automatic/manual map performance, memory, and battery behavior meet approved recorded budgets.
- [ ] TF-012 — Frozen release candidate passes reliability/security/offline/soak QA with no blocking/high defect.
- [ ] TF-013 — Processed build passes non-developer internal smoke, external Beta App Review, and staged rollout controls.
- [ ] TF-014 — Completion report, go/no-go, monitoring, expiry, rollback, and repository-to-mirror reconciliation are recorded.
