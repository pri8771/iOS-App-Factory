# Project Status

## Lifecycle status

`mvp_development`

## Release status

`human_review_required` — the repository and simulator release candidate are
code-complete for the audited scope, and all 26 TestFlight tasks now have executable evidence
packs. On 2026-08-13 the first signed device archive (`1.0 (1)`) was produced and successfully
uploaded to App Store Connect (evidence:
`quality/evidence/testflight/AURA-OPS-012A/UPLOAD-2026-08-13.md`). Apple's processing completion
and TestFlight availability of that build are still unverified, and `TF-G1` has not fully
cleared — physical-device QA, export-compliance sign-off, and other owner items remain open.
Build number 1 is now consumed in App Store Connect; any future re-upload requires
`AURA-OPS-011` to freeze a new candidate with `CURRENT_PROJECT_VERSION` bumped to 2 before
another archive is built. The canonical backlog is `TESTFLIGHT_READINESS.md`; Jira and Notion
are mirrors only.

## Verified on 2026-08-13

- A signed Release device archive of `1.0 (1)` was produced and uploaded to App Store Connect:
  `Upload succeeded` / `** EXPORT SUCCEEDED **` at 2026-08-13 20:41 local.
- The successful upload evidences a functional Apple account/agreements session
  (`AURA-OPS-009`) and an existing App Store Connect app record for `com.pchordia.aurafit`
  (`AURA-OPS-010`).
- Build number 1 (`1.0 (1)`) is now consumed in App Store Connect and cannot be reused for a
  future upload.
- Not yet evidenced: Apple processing completion/TestFlight availability of `1.0 (1)`,
  physical-device install and QA, and the export-compliance owner determination.

## Verified on 2026-07-29

- App Factory registration passes the canonical `iOS_app_factory_rules` 0.4.0 verifier.
- The Release configuration builds warning-free for generic iOS device and Simulator
  destinations with code signing disabled.
- The Release bundle contains the privacy manifest and required-reason declaration,
  contains no StoreKit test configuration or unlicensed model assets, and exposes no
  DEBUG-only test switches.
- The updated suite passes 101/101 on an iPhone Air simulator running iOS 26.4.1:
  100 unit/integration tests plus the deterministic import-to-result UI smoke.
- Camera and add-only Photos usage descriptions match the implemented permission paths.
- Shipping copy and the privacy policy accurately describe the deterministic,
  on-device heuristic instead of claiming an absent learned image model.
- The TestFlight backlog validates as 26 canonical task plans and 179 stable subtasks; all 26
  tasks have repository evidence/runbook packs under `quality/evidence/testflight/`.
- The release-candidate gate, CI integration, controlled negative check, ShellCheck validation,
  reviewer drafts, support-page source, compliance preflights, and StoreKit preflight are
  implemented.
- A fresh unsigned generic-device Release build passed. The current full simulator verification
  passes 101/101 in one result bundle, including the bad-photo scoring regressions.

## Verification pending

- Apple processing completion and TestFlight availability confirmation for the uploaded
  `1.0 (1)` build.
- Physical-device installation, launch, and signing inspection of a Release build (the archive
  itself is signed and already uploaded, but the on-device install/QA in
  `AURA-QA-002/004/005` has not run).
- Physical-device camera, import, export/share, relaunch, deletion, interruption,
  low-storage, permission deny/revoke, and supported-device checks.
- StoreKit sandbox purchase, restore, offline entitlement, prices, and App Store Connect
  product-ID validation.
- VoiceOver, Dynamic Type, layout, dark appearance, and performance/thermal review.
- Hosted public support and privacy-policy URLs plus App Store Connect privacy,
  age-rating, test-information, and export-compliance metadata.
- TestFlight internal smoke and any required external Beta App Review.
- One clean 101/101 invocation of the shared release-candidate gate using the canonical App
  Factory rules checkout; the split result above is useful diagnosis but is not a gate pass.
- GitHub Actions verification on the frozen candidate and main; local GitHub authentication is
  currently invalid.

## Blockers

- Apple processing completion and TestFlight availability for the uploaded `1.0 (1)` build have
  not been confirmed, and physical-device install/QA against that build has not been executed.
- The physical-device and StoreKit sandbox matrices have not been executed.
- The repository does not prove that public support/privacy URLs and App Store metadata
  are configured and reachable.
- Owner choices are still required for pricing/offers, EULA, support contact/URLs, asset rights,
  age rating, export compliance, reviewer contacts/test image, and Jira/Notion targets.
- Build number 1 is consumed; any future re-archive/re-upload needs `AURA-OPS-011` to freeze a
  new candidate with `CURRENT_PROJECT_VERSION` bumped to 2 first.

## Next action

Owner: confirm Apple processing completion and TestFlight availability for the uploaded
`1.0 (1)` build, and review the `AURA-OPS-009`/`AURA-OPS-010`/`AURA-OPS-012A` evidence packs
now on file. In parallel, restore GitHub access for `AURA-OPS-001`, supply the canonical rules
checkout for the clean `AURA-OPS-005` gate run, and provide the owner-required values listed
above. Then run the prepared device/accessibility/performance/StoreKit matrices against the
uploaded build, or against a fresh candidate via `AURA-OPS-011` (build 2) if a new archive is
needed first.

## Gate snapshot

| Gate | Status | Blocking task families |
|---|---|---|
| `TF-G1` upload eligible | `human_review_required` | First archive/upload succeeded (OPS-009/010/012A evidence on file); Apple processing confirmation, OPS-011/012B/013, device QA, and export compliance remain open |
| `TF-G2` internal beta | `blocked_external` | StoreKit catalog/testing and internal TestFlight smoke |
| `TF-G3` external beta | `blocked_external` | Public URLs, privacy/legal metadata, beta packet, Beta App Review |
