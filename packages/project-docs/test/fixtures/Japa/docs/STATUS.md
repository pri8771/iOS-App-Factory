---
id: DOC-STATUS
canonicalFor: current-status
status: active
lastVerified: 2026-08-06
readWhen:
  - onboarding
  - checking current progress or blockers
related:
  - DECISIONS.md
  - BUGS.md
  - TEST_PLAN.md
supersedes: []
---

# Project Status

## Lifecycle status

Product lifecycle (per `iOS_app_factory_rules/governance/PROJECT_LIFECYCLE.md`
controlled vocabulary): **`beta`** — Build 1 is available in TestFlight and
Build 2, containing explicit Finish early and the current fixes, was uploaded
manually through Xcode Organizer on 2026-08-06, processed to **Ready to
Submit**, and **submitted for App Review on 2026-08-06 at 11:40 PM**
(submission `897d1493-c2f1-474f-afa6-01d3e92694c4`), where it currently sits
**Waiting for Review**. VoiceOver support is out of scope by product decision
(2026-08-14) — it is not a v1 gate, not a post-v1 plan, and not tracked as a
residual risk. Dynamic Type remains the app's accessibility baseline.

Factory registration is a separate axis and is **complete** (`projectType:
existing`, standard `0.4.0`); it is no longer an in-flight "onboarding" state.

## Current objective

Monitor App Review for version 1.0 Build 2, respond to any reviewer questions,
and manually release the approved version after a final status check.

## Product maturity

- **Implementation:** v1 feature set built and on-device validated (2026-07-18, iPhone 16 Pro Max); mala-style picker, Dynamic Type, merged practice surface, stale-round Finish, CI, and TestFlight deployment automation in place
- **Factory registration:** existing project, standard `0.4.0` (upgraded from `0.2.0` on 2026-07-17), registered 2026-07-16
- **App Review:** version 1.0 Build 2 is Waiting for Review. It was submitted on
  2026-08-06 at 11:40 PM under submission `897d1493-c2f1-474f-afa6-01d3e92694c4`.
  Public release remains manual. GitHub automation is deferred and is not a
  blocker. VoiceOver support is out of scope by product decision (2026-08-14)
  and is not tracked as a residual risk.

## Verified

- App Factory registration files present and verified (`verify-project-registration.sh`)
- Local-first, no networking, no third-party SDKs (source inventory)
- **Current automated suite: 69 tests (56 unit/flow + 13 UI), all passing** — re-verified 2026-08-06 after adding the deterministic App Store history-screenshot fixture; canonical count, see `TEST_PLAN.md`
- XcodeGen `project.yml` is source of truth for targets
- **On-device validated on a physical iPhone 16 Pro Max (2026-07-18):** signed dev build installed and run; eyes-free haptics (tick + distinct completion), full round flow, and all 21 animated mala styles confirmed working on hardware by the accountable human. Closes JAPA-7 and JAPA-12. Evidence: `quality/evidence/2026-07-18-device-validation-iphone16promax.md`.
- Public product identity is **Mala**. The release bundle ID is `com.priyansh.mala`; internal Xcode target/scheme, engine symbols, and persistence path retain `Japa` for compatibility.
- Bundled spiritual seed content was removed; v1 ships neutral Counting plus private user-created labels.
- Five final App Store screenshots were accepted in App Store Connect and are stored at 1284 × 2778 with no alpha under `AppStoreAssets/Screenshots/en-US/6.5-inch/`.
- A 6.9-inch UI-test run exposed top-chrome taps being intercepted by the practice gesture; the counting hit area now excludes the control bands and the history flow passes.
- Physical-device QA exposed inflated history durations (for example, 803m). Root cause was wall-clock timing across background/termination plus a new-round path that retained the prior start time. `B-SESSION-DURATION` now tracks foreground-active time only and resets timing for every round; full simulator regression is green, with refreshed device validation still required.
- TestFlight deployment pipeline committed (`fastlane/` + `release-testflight.yml`); Ruby/YAML syntax validated. Build 1 is in App Store Connect TestFlight (`Testing`). Follow-up workflow runs 30778381551 and 30778424180 failed because `ASC_KEY_CONTENT` is empty; see `docs/DEPLOYMENT.md`.
- Enrolled in Studio OS as `PROD-JAPA` (`pri8771/studio-ios`, 2026-07-19); `.factory/studio-link.json` is the product-side pointer. Automated-UI-testing manifests (`quality/ui/`) and generated Maestro flows were added the same day; Maestro simulator execution is still pending (CLI unavailable at enrollment time).
- `Gemfile.lock` is committed (regenerated via `bundle install` 2026-07-27) so the TestFlight CD workflow's `ruby/setup-ruby@v1` `bundler-cache: true` step no longer hard-fails before it can run.
- Public privacy and support pages are live at `priyanshchordia.com/apps/mala/privacy/` and `/apps/mala/support/`; both returned HTTP 200 and exposed `support@priyanshchordia.com` on 2026-07-29.
- The fresh-runner signing implementation now materializes the App Store Connect key only in the runner's temporary directory and passes Xcode's authentication-key arguments during both archive and export. The runner is pinned to `macos-26`, and the workflow rejects Xcode versions older than 26. End-to-end signing/upload remains unverified until the first workflow run.
- The product-branded bundle identifier change is locally verified: XcodeGen succeeded, 67/67 tests passed, and Xcode produced a signed `com.priyansh.mala` 1.0 (1) archive for team `796XH483R4` using automatic provisioning. Evidence: `quality/evidence/2026-07-30-mala-bundle-id.md`.
- The current release candidate was independently re-verified 2026-07-31 on iPhone 17 Pro / iOS 26.5 simulator: 67 passed, 0 failed, 0 skipped. Result bundle: `/private/tmp/mala-release-verification/Logs/Test/Test-Japa-2026.07.31_10-02-36--0400.xcresult` (local ephemeral evidence; record durable CI/TestFlight evidence before release).
- Explicit Finish early is now available from the practice surface with confirmation; it records an honest partial session and starts a fresh round. Targeted UI verification passed 2026-08-02.
- Mala 1.0 (2) was archived and uploaded manually through Xcode Organizer on 2026-08-06. Xcode reported `App upload complete`; App Store Connect processed it to `Ready to Submit`, expiring in 90 days. Evidence: `quality/evidence/2026-08-06-manual-app-store-upload-build-2.md`.
- The accountable user confirmed on 2026-08-06 that processed Build 2 worked correctly through TestFlight. This closes the release-candidate distribution-path smoke check.
- Repository-backed App Store metadata and approval-gated submission automation are implemented locally (`fastlane/metadata`, `store_metadata`, `submit_review`, and `release-app-store.yml`). Metadata upload cannot submit; submission requires an exact version/build confirmation and keeps public release manual. Authenticated execution remains unverified. Evidence: `quality/evidence/2026-07-31-app-store-automation.md`.
- App Store Connect preparation was completed manually through the in-app browser on 2026-08-06: five final screenshots accepted and ordered; product copy, Support URL, category, content rights, 4+ age rating, free worldwide availability, manual release, and Build 2 entered. Build metadata confirms non-exempt encryption is No. Exact store name `Mala` was unavailable, so the saved store name remains `Mala: A Quiet Digital Mala` while the installed display name remains `Mala`. Evidence: `quality/evidence/2026-08-06-app-store-connect-preparation.md`.
- The Data Not Collected privacy response was published, DSA non-trader status became Active for 27 EU regions, App Review contact information was saved, and version 1.0 Build 2 was submitted successfully on 2026-08-06 at 11:40 PM. Current status: Waiting for Review. Submission ID: `897d1493-c2f1-474f-afa6-01d3e92694c4`.
- A GitHub Actions audit on 2026-08-03 found `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `DEVELOPMENT_TEAM` present; `ASC_KEY_CONTENT` remains the single missing TestFlight secret. Two follow-up upload runs failed at authentication preflight before archive/upload.

### Test-count history (superseded — do not treat as current)

- 2026-07-16: baseline `xcodebuild test` on iPhone 17 (OS 26.5) exited 0.
- 2026-07-17: 53/53 on iPhone 17 Pro (registration-upgrade pass).
- 2026-07-17: 56/56 (47 unit/flow + 9 UI) after mala-style + Dynamic Type + CI; compact-phone text-size smoke on iPhone 17e.
- 2026-07-17/18: grew to the current 62 (52 unit/flow + 10 UI) after the merged-surface, animation, red-final-bead, and stale-round-Finish work.

## Verification pending

- Apple App Review decision and any reviewer follow-up
- Accountable-human final release decision after approval; automatic release is disabled
- VoiceOver validation with a real assistive-tech user is deferred post-v1 (MALA-7); Dynamic Type remains implemented and smoke-tested

## External trackers

- **Authority:** repository documents listed in `docs/README.md`; synchronization and conflict rules live in `docs/GOVERNANCE.md`.
- **Notion mirror:** [Mala Release Hub](https://app.notion.com/p/3a8ab1f22765811fb3cbcdbf485af251) provides convenient Work Items, Research & Design, Decisions, Lessons & Mistakes, and Release Evidence views.
- **Jira mirror: project `MALA`** — work is split into independently assignable items with Execution Agent, estimate, worklog, dependency, and human-gate fields. Jira mirrors repository state and does not override it.

## Blockers

- No pre-review submission blocker remains. The release is waiting on Apple's review decision.

## Documentation reconciliation (2026-07-17)

- App Factory registration upgraded 0.2.0 → 0.4.0; repository-map.json, library-catalog.json, docs/README.md, docs/REUSABLE_COMPONENTS.md created; verify-project-registration.sh passes clean
- Stale test-count claims (41+3) corrected to the actual 46+7=53 across README.md, docs/PROJECT_DOCUMENTATION.md, LAUNCH_READINESS.md (B-DOC resolved)
- docs/RELEASE_CHECKLIST.md reconciled against verified evidence (was an unstarted template despite several items being done)
- BUGS.md B-A11Y updated: Dynamic Type is now implemented and smoke-tested; VoiceOver/accessibility user validation remains open. New O5/signing-blocker row added to LAUNCH_READINESS.md §7/§9
- FEAT-001 extended with explicit completion-signal-distinctness requirements; verification gap (no spy-based test) documented rather than silently left implied-covered

## Documentation reconciliation (2026-07-17, later session)

- Independent design-fidelity audit of the mala style picker against the source Claude Design spec (`Japa Concepts.dc.html`); found high overall fidelity with 3 confirmed cosmetic gaps, all fixed: Sculptural Monument's rotating engraved-surface texture, Celestial's twinkling starfield, Ceramic Glaze's craquelure detail
- Verified full suite still green after fixes: 56/56 (47 unit/flow + 9 UI)
- Jira connector reauthenticated; corrected `JALA-4`'s stale "Dynamic Type not implemented" description and posted a progress comment to the `JALA-1` epic
- **Jira tracker consolidation:** discovered the pre-existing `JAPA` project (12 tickets from a 2026-06-30 Codex audit) duplicated by `JALA`; per user decision JAPA is now canonical — JALA-1..5 retired as Deferred/Replaced-By, JAPA-10/11 closed Done with evidence, JAPA-1/8 updated with current state

## Documentation reconciliation (2026-07-18)

- Reconciled docs to the App Factory standard (`iOS_app_factory_rules` @ 0.4.0, verified equal to the local lock):
  - Lifecycle field now uses the controlled `PROJECT_LIFECYCLE.md` vocabulary: product state is `verified` (was `onboarding_existing`, a registration mode) in `STATUS.md` and `.factory/project-context.json`. Clarified the app is not `done` while human gates are open.
  - Removed the in-doc test-count contradiction (a "47+9" summary line alongside "62"); current canonical count (62) now leads and older counts are marked superseded history.
  - `lastVerified` metadata advanced 2026-07-17 → 2026-07-18 across the docs whose current truth changed.
- Added the TestFlight deployment pipeline (DEC-005): `fastlane/` + `.github/workflows/release-testflight.yml`, canonical process doc `docs/DEPLOYMENT.md`, wired into `.factory/repository-map.json`. `project.yml` signing unchanged; simulator CI unaffected.

## Documentation reconciliation (2026-07-19)

- **Studio OS enrollment.** Linked this repo to Studio OS product `PROD-JAPA`
  (`pri8771/studio-ios`): product-side pointer `.factory/studio-link.json`,
  authoritative `products/japa/` record proposed via studio-ios PR. Registered in
  `.factory/repository-map.json` (`studioLink`, `studio-os-linkage` route).
- **Automated UI-testing foundation.** Added `quality/ui/{screens,journeys,safe-actions}.yaml`
  + generated Maestro flows (`quality/ui/generated/`) per App Factory standard
  0.4.0. `Japa/JapaApp.swift` now honors the standard `UI_TEST_MODE`/`UI_FIXTURE`/
  `UI_RESET_STATE`/`UI_DISABLE_ANIMATIONS` contract alongside the original
  `JAPA_UITEST` hooks; added one `historyRoot` accessibility identifier and a
  contract test. Maestro simulator execution is pending (CLI unavailable at
  enrollment; tracked in the Studio OS Atlas task ATLAS-JAPA-LAUNCH-001).
- **Test count (superseded by the 2026-07-27 merge below).** Suite was **64
  (53 unit/flow + 11 UI)** on this branch of history, after adding a
  `Preferences` unknown-mala-style regression test and the `UI_TEST_MODE`
  contract test; verified green on iOS simulator 2026-07-19.

## Documentation reconciliation (2026-07-27, branch merge)

- Merged local branch `agent/fix-app-icon` (Mala rebrand, seed-content removal,
  App Store screenshot assets, chrome hit-testing fix, tag-driven Fastfile
  marketing version) with `origin/main` (Studio OS enrollment, Maestro
  UI-testing manifests) to unblock release — the two branches had diverged
  from a common ancestor and neither included the other's work. All
  non-conflicting additions from both sides are preserved; true conflicts were
  resolved file-by-file favoring whichever side reflected the more current,
  accurate state (see `docs/HANDOFF.md`).
- Added a real `Gemfile.lock` (via `bundle install`) so `release-testflight.yml`'s
  `ruby/setup-ruby@v1` `bundler-cache: true` step no longer hard-fails before
  reaching the (still-unconfigured) signing step.
- Post-merge full-suite verification: `xcodebuild test` on iPhone 17 Pro
  (iOS 26.5), `CODE_SIGNING_ALLOWED=NO` — **64/64 passing** (`JapaTests.xctest`
  53/53, `JapaUITests.xctest` 11/11), `** TEST SUCCEEDED **`, 0 failures.
  `xcodebuild build -configuration Release` also succeeded. See `TEST_PLAN.md`.

## Next action

1. Monitor submission `897d1493-c2f1-474f-afa6-01d3e92694c4` for review status or reviewer messages.
2. Address any App Review issue without replacing Build 2 unless a code change is required.
3. After approval, perform a final product-page check and manually release version 1.0.
