# Anjali — Launch Readiness

Last verified: 30 July 2026.

This is the human-readable launch audit. The machine-readable requirements and
evidence live in `.factory/`, `quality/`, and `docs/`. Detailed product scope
remains in `PRD.md`; feature acceptance criteria are in `docs/FEATURES.md` and
`quality/feature-contracts/`. The canonical TestFlight execution plan is
`docs/TESTFLIGHT_READINESS_BACKLOG.md`; consumer-product readiness is governed
by the
[Daily-Use Consumer Product Plan](docs/DAILY_USE_PRODUCT_PLAN.md); external
task systems are copies only.

## Verdict

**Not ready for external TestFlight distribution.**

The app is registered with `ios_app_factory_rules` 0.2.0, builds with the
current required Apple toolchain, and has a green current unit/integration
suite plus focused consumer-path UI evidence.
Its repository lifecycle is intentionally `verification_pending`, not `done`,
because content, accessibility, distribution, and real-device gates remain.

## Product and release scope

Anjali is an offline, accountless Hindu micro-prayer app for iOS 17 and later.
It provides one contextual prayer; Moment, Intention, and Deity discovery;
local saved prayers and completions; editable optional local reminders; and
`anjali://` deep links. Chant is self-led aloud and Silent is inward reading or
repetition. Both show the prayer text and meaning and require explicit Begin
and Complete. Listen appears only for an exact approved human recording; none
currently exists, so normal builds hide it.
There is no backend, network layer, analytics, advertising, tracking, account,
in-app purchase, or third-party dependency in the current product.

The release target is iPhone and iPad. The interface remains phone-first, so an
iPad UI run and human large-screen review are release gates.

## Verified engineering gates

- Xcode 26.6 (build 17F113) and the iOS 26.5 SDK produce a clean Release
  simulator build.
- The current unit/integration suite passes 75/75 tests.
- The current responsive UI suite passes 4/4 on each of iPhone 17 Pro Max,
  iPhone 17e, and iPad (A16), 12/12 total. It covers first use through explicit
  completion, largest accessibility text, saved-prayer relaunch persistence,
  and Om Namo Narayanaya with Listen absent, both scripts visible, self-led
  Chant explained, and running state exposed.
- All 22 prayer records pass structural validation.
- The app contains a 1024×1024 RGB icon with no alpha and builds without a
  missing-icon warning.
- `PrivacyInfo.xcprivacy` is bundled. It declares no tracking, no collected data
  types, and the UserDefaults required-reason code `CA92.1`.
- `ITSAppUsesNonExemptEncryption` is `NO`.
- Release builds exclude the UI-test reset path.
- Failed SwiftData setup is visibly disclosed instead of silently pretending
  to persist.
- Save, delete, reminder-toggle, and reminder-time flows do not claim success
  before persistence or notification scheduling succeeds. Onboarding does not
  request notification permission.
- Enabled reminder times use stable notification IDs, persist locally, and
  restore the prior UI/value after a failed reschedule.
- A Listen load/play failure remains unstarted, runs no pretend silent timer,
  and cannot create a completion.
- The build harness discovers an installed iPhone simulator and performs a
  Release build before tests. CI uses a macOS 26 runner.
- An unsigned arm64 device archive succeeds. Its app bundle contains the icon,
  privacy manifest, and catalog, with zero provisional audio files.

Exact commands, destinations, results, and limitations are recorded in
`quality/evidence/2026-07-29-testflight-factory-audit.md`.

## Blocking gates

1. **Prayer review:** 0/22 records have a named cultural/theological reviewer
   and review date. `validate_prayers.py --require-signoff` correctly fails.
2. **Human accessibility:** VoiceOver order, contrast across all five themes,
   Reduce Motion, and final largest-text layout need recorded human sign-off.
   Automated responsive UI passes; human iPad/large-text usability remains
   pending.
3. **Real-device behavior:** local-notification permission/delivery, denial,
   editable time replacement/rollback, timezone/DST behavior, deep-link launch,
   background/foreground, offline mode, future approved-audio behavior, and
   persistence need a TestFlight device pass.
4. **Distribution:** Apple agreements/account roles, App ID/app-record
   ownership, signing/provisioning, next unique build number, signed validation,
   upload processing, internal install, and Beta App Review are unverified.
5. **Public beta information:** a verified-live privacy-policy URL, monitored
   feedback email, review contact, Beta App Description, Review Notes, and What
   to Test are missing. The support URL is a later App Store submission
   requirement and should be published early, but it does not replace the
   TestFlight feedback email.
6. **Name availability:** App Store search shows another accented `ANJĀLI`
   listing. Confirm the final display-name and trademark/metadata choice before
   creating or submitting the record.
7. **Consumer product gate:** the P0 and named-human prerequisites in
   `docs/DAILY_USE_PRODUCT_PLAN.md` are not complete. A consumer TestFlight
   candidate cannot be frozen until that plan authorizes it.

## Apple submission baseline

- Uploads from 28 April 2026 onward must use Xcode 26 or later and an iOS 26 SDK.
  This repository now meets that build baseline.
- App Review requires accurate metadata, a working product, and privacy-policy
  access both in App Store Connect and within the app. An offline in-app privacy
  notice is now present; the public listing URL remains pending.
- The privacy manifest and App Store privacy answers must agree with actual
  behavior. The current implementation is local-only and the manifest states no
  data collection.
- A local unsigned archive can prove archive construction, but only a signed
  App Store Connect upload can prove validation and processing.

## Release sequence

1. Execute the P0 and named-human gates in
   `docs/DAILY_USE_PRODUCT_PLAN.md` while TF-001 content review and TF-002/
   TF-003 Apple identity/public-contact setup proceed in parallel. Keep
   synthetic/provisional audio out of every normal build.
2. Complete the beta packet (TF-004), then freeze an exact source SHA and
   App Store Connect-confirmed unused build number (TF-005).
3. Run the exact-commit automated gate and human accessibility/device matrix
   (TF-006/TF-007).
4. Create/validate the signed archive, upload it, and clear processing/export
   compliance (TF-008/TF-009).
5. Install Apple's processed binary through an internal TestFlight group and
   record go/no-go (TF-010).
6. Submit the controlled external group for Beta App Review, then invite the
   first 20–30 testers and triage evidence (TF-011/TF-012).

Store screenshots, final age rating, categories, price/availability, full
storefront copy, and DSA/region compliance remain AS-001–AS-006 follow-ons.
They do not all block the first internal TestFlight install.

Do not mark the factory lifecycle `done` until the above evidence is attached.
