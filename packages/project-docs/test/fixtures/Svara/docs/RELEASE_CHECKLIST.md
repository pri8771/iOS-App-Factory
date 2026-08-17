# TestFlight Release Checklist

This is the release gate view of the canonical tasks in
`docs/TESTFLIGHT_TASKS.md`. A checked item requires evidence; unchecked
human/external gates prevent `done`.

## Release configuration and account

- [x] [`TF-001`] Full five-tab, iPhone-only, English (U.S.), SKU, owner roles,
  private close-friends group, and stop authority are recorded in `DEC-005`;
  commerce is explicitly deferred.
- [x] [`TF-002`] Apple membership, team, upload/internal-testing roles, and
  upload-required agreement state are verified. Paid Apps, banking, and tax may
  remain explicitly deferred to TF-005.
- [x] [`TF-004`] The App Store Connect record exactly matches the confirmed
  bundle ID, team, version, SKU, language, and platform.

## Automated and repository gates

- [x] Factory registration verifies against standard 0.4.0.
- [x] Full unit and UI smoke suites pass: 136/136 (baseline).
- [x] Comprehensive simulator workflow audit executed; result and limitations
  are indexed in `quality/evidence/UI-WORKFLOW-AUDIT-2026-07-30.md`.
- [x] Active `UI-001`–`UI-010` regressions pass without expected failures
  (153/153 exact-candidate tests). Physical verification for hardened `UI-014`
  remains under TF-010. Dormant
  commerce-only issues remain deferred under `DEC-006`.
- [x] Release static analysis passes (baseline).
- [x] Unsigned Release archive and product validation pass (baseline).
- [x] Archive includes the privacy manifest and excludes `Svara.storekit`
  (baseline).
- [x] Preview/test data are not an undisclosed production fallback.
- [x] No fake login/account control is exposed.
- [x] Current owner-testing build exposes no Plus/paywall/membership UI and all
  bundled content opens freely (`DEC-006`).
- [x] Privacy, terms, marketing, and support URLs are populated.
- [ ] [`TF-006`] Corrected privacy, terms, and support content is deployed at
  those URLs and content-checked from a clean network. Deferred from TF-015.
- [x] App Store keywords are at most 100 UTF-8 bytes.
- [x] Export-compliance Info.plist flag is declared.
- [x] [`TF-009`] Build 3 repository gates, 159/159 complete tests, Release
  analysis, frozen commit `ed29548`, archive inspection, and remote CI pass.
  The prior build 2 evidence remains historical.

## App Store Connect and signing

- [x] [`TF-003`] Automatic cloud-managed App Store distribution is valid
  for the confirmed team and explicit App ID.
- [ ] [`TF-005`] Before any future monetized build, monthly, yearly, and
  lifetime IAPs match identifiers, group, prices, localization, availability,
  and review state. Deferred from the current free build.
- [ ] [`TF-008`] App Privacy, age rating, content rights, export compliance, and
  TestFlight metadata are complete and match the build.
- [x] [`TF-011`] A signed, external-eligible build 3 archive validates, uploads
  without the **TestFlight Internal Only** restriction, processes, and passes
  Apple build-metadata inspection. Build 2 did so historically but failed the
  required audio smoke.

## Human and device gates

- [ ] [`TF-007`] Audio provenance, performer consent, and distribution rights are complete
  for every file in `docs/AUDIO_PROVENANCE.md`.
- [ ] [`TF-007`] Cultural/theological sign-off covers every shipped content item.
- [ ] [`TF-010`] Small and large iPhone layouts pass in light/dark and largest text.
- [ ] [`TF-010`] VoiceOver primary workflows pass on a physical device.
- [ ] [`TF-010`] Audio interruption and route changes pass on a physical device.
- [ ] [`TF-010`] Notification denial/delivery pass on a physical device.

## Owner internal smoke gate

- [ ] [`TF-015`] Designate one of the two empty internal groups as the owner
  smoke group and add exactly the owner.
- [ ] [`TF-015`] Attach processed build 3—and no historical build—to the new
  one-owner manual group.
- [ ] [`TF-015`] Build 3 is installed through TestFlight on the owner's physical
  iPhone.
- [ ] [`TF-015`] The bounded onboarding, practice, lesson, audio, relaunch
  persistence, and notification-prompt smoke passes.

## Deferred monetized gate

- [ ] [`TF-012`] If Plus returns, a new monetized processed build installs
  through internal TestFlight.
- [ ] [`TF-012`] StoreKit sandbox purchase, cancellation, pending, restore,
  renewal/expiry, refund, and revocation
  behavior pass.

## External TestFlight gate

- [ ] [`TF-013`] Cohorts, feedback workflow, severity model, stop criteria, and
  replacement-build procedure are recorded.
- [ ] [`TF-014`] TestFlight App Review approves the internally verified build.
- [ ] [`TF-014`] Only the approved initial cohort is enabled and monitored.

Final App Store product-page screenshots and preview video are deferred from
this external TestFlight gate unless the release owner explicitly adds them.

## Release decision

- **Current state:** `verification_pending`
- **Owner internal smoke allowed:** Not currently distributable because the new
  groups are empty. After the owner designates the owner-smoke group, add only
  the owner, attach build 3 only, install it through TestFlight, and
  perform/record TF-015.
- **External beta allowed:** No, until every blocker above is checked or an
  explicit, approved, time-bounded waiver is recorded in `quality/waivers/`.

[`TF-001`]: tasks/testflight/TF-001-release-decisions.md
[`TF-002`]: tasks/testflight/TF-002-apple-account-business.md
[`TF-003`]: tasks/testflight/TF-003-signing-provisioning.md
[`TF-004`]: tasks/testflight/TF-004-app-store-record.md
[`TF-005`]: tasks/testflight/TF-005-storekit-products.md
[`TF-006`]: tasks/testflight/TF-006-legal-privacy-support.md
[`TF-007`]: tasks/testflight/TF-007-content-audio-signoff.md
[`TF-008`]: tasks/testflight/TF-008-app-store-testflight-metadata.md
[`TF-009`]: tasks/testflight/TF-009-final-automated-gates.md
[`TF-010`]: tasks/testflight/TF-010-device-accessibility-qa.md
[`TF-011`]: tasks/testflight/TF-011-signed-build-upload.md
[`TF-012`]: tasks/testflight/TF-012-internal-testflight-storekit.md
[`TF-013`]: tasks/testflight/TF-013-beta-operations.md
[`TF-014`]: tasks/testflight/TF-014-external-testflight-rollout.md
[`TF-015`]: tasks/testflight/TF-015-owner-only-internal-smoke.md
