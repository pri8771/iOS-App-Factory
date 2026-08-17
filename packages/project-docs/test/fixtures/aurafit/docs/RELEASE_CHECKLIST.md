# Release Checklist

This is the release sign-off view. `TESTFLIGHT_READINESS.md` is authoritative for task
instructions, dependencies, statuses, and evidence. A checkbox may be selected only when the
linked task evidence exists under `quality/evidence/testflight/<TASK-ID>/`.

## `TF-G1` — upload eligible

- [ ] `AURA-OPS-001`: exact release commit is green in CI with 101/101 tests.
- [ ] `AURA-OPS-009`: membership, agreements, roles, Paid Apps Agreement, banking, and tax are verified.
- [ ] `AURA-OPS-010`: explicit App ID and App Store Connect record match `com.pchordia.aurafit`.
- [ ] `AURA-OPS-011`: version/build identity and beta scope are frozen.
- [ ] `AURA-OPS-005`: machine-checkable release-candidate script passes.
- [ ] `AURA-OPS-012A`: signed Release build installs and launches on a physical supported iPhone.
- [ ] `AURA-QA-002`: camera/import/export/persistence/permission device matrix passes.
- [ ] `AURA-QA-004`: VoiceOver, Dynamic Type, appearance, and supported-layout matrix passes.
- [ ] `AURA-QA-005`: performance/interruption/storage/thermal smoke passes or exceptions are approved.
- [ ] `AURA-OPS-014`: export-compliance determination is recorded and matches the archive.
- [ ] `AURA-OPS-012B`: final signed archive validates; immutable identifiers are recorded.
- [ ] `AURA-OPS-013`: upload finishes processing without blocking issues.

## `TF-G2` — internal TestFlight ready

- [ ] `AURA-MON-002`: initial prices, territories, trials/offers, and Family Sharing policy are owner-approved.
- [ ] `AURA-MON-008`: production StoreKit products/subscription group are complete in App Store Connect.
- [ ] `AURA-QA-010`: sandbox/TestFlight purchase, restore, expiry, refund/revoke, and offline paths pass.
- [ ] `AURA-QA-006`: an internal tester installs from TestFlight and passes the release-build smoke.

## `TF-G3` — external TestFlight ready

- [ ] `AURA-MKT-004`: durable public privacy-policy and support URLs return correct content.
- [ ] `AURA-LEG-003`: EULA/terms choice and subscription legal links are approved.
- [ ] `AURA-LEG-004`: App Privacy answers are published and match the binary.
- [ ] `AURA-LEG-005`: age rating and content-rights answers are complete.
- [ ] `AURA-LEG-008`: beta description, What to Test, feedback contact, and reviewer notes are approved.
- [ ] `AURA-QA-007`: external group exists and the build passes TestFlight App Review.
- [ ] `AURA-QA-008`: structured beta questions and feedback intake are operating.
- [ ] `AURA-QA-009`: findings are triaged and the owner records an external-beta go/no-go.

## Already verified in the repository

- [x] Shipping analysis claims match bundled behavior.
- [x] Privacy manifest and usage descriptions match implemented access.
- [x] Unsigned Release builds are warning-free for generic device and Simulator.
- [x] 98 required tests pass in the audited environment.
- [x] Test-only controls/assets are excluded or protected from Release.
- [x] Known limitations are documented.
