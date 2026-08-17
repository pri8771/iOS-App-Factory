# Release Checklist

Current verdict: **not ready for external TestFlight**. This is the compact
gate summary. The canonical executable tasks, subtasks, dependencies,
acceptance criteria, and evidence paths are in
`docs/TESTFLIGHT_READINESS_BACKLOG.md`. Consumer-product readiness is separately
gated by the [Daily-Use Consumer Product Plan](DAILY_USE_PRODUCT_PLAN.md).

## Verified engineering gates

- [x] Registered and verified against `ios_app_factory_rules` 0.2.0.
- [x] Xcode 26.6 / iOS 26.5 SDK Release simulator build succeeds.
- [x] Structural content validation passes.
- [x] Production has no third-party dependencies, backend, network, analytics,
      accounts, ads, IAP, or undisclosed fixtures.
- [x] Privacy manifest is bundled; Info.plist declares no non-exempt encryption.
- [x] 1024×1024 no-alpha app icon compiles.
- [x] Debug UI-reset behavior is excluded from Release.
- [x] Persistence and reminder failures have explicit recovery/error states.
- [x] Moment, Intention, and Deity discovery is implemented.
- [x] Reminder times are editable, persist by stable slot ID, and roll the UI
      back when rescheduling fails.
- [x] Listen is hidden without exact approved human audio; Chant and Silent
      explain their no-audio behavior, show text/meaning, and require explicit
      Begin and Complete.
- [x] A Listen playback failure cannot start a pretend timer or create a
      completion.

## Automated verification

- [x] Current unit/integration suite green: 75/75.
- [x] Current responsive UI matrix green: 4/4 each on large iPhone, compact
      iPhone, and iPad (12/12 total), including Om Namo Narayanaya.
- [x] Clean signed Debug build contains zero audio, installs, and launches on
      the connected iPhone 16 Pro Max.
- [x] `python3 Scripts/export_catalog.py` is byte-stable on repeated runs.
- [ ] `python3 Scripts/validate_prayers.py --require-signoff` passes.

## Human/content gates

- [ ] **TF-001:** all 22 prayer records have named reviewer/date sign-off.
- [x] Synthetic/provisional audio is excluded from every normal Debug, device,
      Release, and TestFlight build; no acceptable human recording exists yet.
- [ ] Icon legibility/brand approved at small sizes.
- [ ] **TF-007:** VoiceOver, largest text, Reduce Motion, contrast, iPad layout,
      editable reminder delivery/rollback, and real-device behavior signed off.

## Consumer-product gate

- [ ] P0 and named-human prerequisites in
      `docs/DAILY_USE_PRODUCT_PLAN.md` are verified.
- [ ] 22/22 prayer-content records have named review; current status is 0/22.
- [ ] A moderated consumer/cultural beta decision authorizes candidate freeze.

## TestFlight distribution gates

- [ ] **TF-002:** agreements, App ID/app record, bundle/team, name, SKU, content
      rights, and initial region decision confirmed.
- [ ] **TF-003–TF-004:** public privacy URL, monitored feedback email, review
      contact, beta description/notes, and What to Test verified.
- [ ] **TF-005–TF-006:** exact release SHA and unused build number frozen; full
      candidate gate and CI green.
- [ ] **TF-008–TF-009:** signed Release archive validates, uploads, processes,
      and clears export compliance.
- [ ] **TF-010:** internal TestFlight real-device matrix passes.
- [ ] **TF-011:** external TestFlight group clears Beta App Review.
- [ ] **TF-012:** controlled external cohort completes with no open P0 or
      release-blocking P1.

Age rating, categories, storefront screenshots/copy, DSA/trader status, price,
and full availability are App Store submission follow-ons. They may be
completed earlier, but are not all blockers for the first internal TestFlight
install. See `AppStore/RELEASE_CHECKLIST.md`.
