---
id: DOC-DECISIONS
canonicalFor: approved-decisions
status: active
lastVerified: 2026-08-06
readWhen:
  - a change crosses a previously locked decision
related:
  - STATUS.md
supersedes: []
---

# Decisions

## DEC-001 — Project registration

- **Status:** accepted
- **Date Recorded:** 2026-07-16
- **Context:** This repository is governed by the App Factory standards.
- **Decision:** Use `.factory/project-context.json` as the authoritative project classification marker.
- **Consequences:** Agents must read the registration and quality files before coding.

## DEC-002 — Register as existing project

- **Status:** accepted
- **Date Recorded:** 2026-07-16
- **Actual Start Date:** 2026-07-16
- **Actual End Date:** 2026-07-16
- **Context:** Japa already has a built SwiftUI app, tests, and launch docs. User requested App Factory registration via `bootstrap-project.sh --mode existing`.
- **Options Considered:** `new` scaffold vs `existing` registration
- **Decision:** Register as `existing` with lifecycle `onboarding_existing`; do not re-scaffold.
- **Consequences:** Preserve working engine/practice/persistence behavior; introduce contracts and evidence incrementally.
- **Related Prompt:** App Factory existing registration + onboarding
- **Related Files:** `.factory/project-context.json`, `AGENTS.md`, `quality/quality-manifest.json`

## DEC-003 — Platforms = iOS only (not iPadOS)

- **Status:** accepted
- **Date Recorded:** 2026-07-16
- **Context:** Bootstrap initially used `--platforms ios,ipados`, but `project.yml` uses `TARGETED_DEVICE_FAMILY = 1` and v1 explicitly excludes iPad layout.
- **Options Considered:** Keep ipados registration and add iPad support; align registration to iPhone-only reality
- **Decision:** Align factory registration and quality manifest to **`ios` only**. iPad remains out of scope for v1.
- **Consequences:** Agents must not claim iPad support or require responsive iPad layout tests as ship criteria for v1.
- **Related Files:** `.factory/project-context.json`, `.factory/standard-lock.json`, `quality/quality-manifest.json`, `project.yml`

## DEC-004 — Upgrade to standard 0.4.0 and close registration gap

- **Status:** accepted
- **Date Recorded:** 2026-07-17
- **Context:** Central standard advanced 0.2.0 → 0.4.0 (0.3.0 added the library-catalog layer, 0.4.0 added the repository-map + `docs/README.md` navigation layer). `bootstrap-project.sh` refuses to re-run against an already-registered project (`.factory/project-context.json` present → exit 3), so the gap had to be closed manually rather than via the automated bootstrap script.
- **Options Considered:** Leave Japa on 0.2.0; manually reconcile the 4 missing files (`.factory/repository-map.json`, `.factory/library-catalog.json`, `docs/README.md`, `docs/REUSABLE_COMPONENTS.md`) and bump versions; open a PR to add an "upgrade" mode to the central bootstrap tooling first and block on it.
- **Decision:** Manually reconcile Japa to 0.4.0 now (non-destructive — only added missing files/fields, never overwrote Japa-specific facts); flag the missing "upgrade an already-registered project" bootstrap mode as a global gap candidate for the central repository rather than block this registration on it.
- **Consequences:** Japa's `.factory/standard-lock.json`, `quality/quality-manifest.json`, and `.factory/project-context.json` now declare `0.4.0`. Future re-onboarding prompts against Japa should treat it as fully registered at 0.4.0, not re-run bootstrap.
- **Related Files:** `.factory/standard-lock.json`, `.factory/project-context.json`, `.factory/repository-map.json`, `.factory/library-catalog.json`, `quality/quality-manifest.json`, `docs/README.md`, `docs/REUSABLE_COMPONENTS.md`

## DEC-005 — TestFlight deployment via Fastlane + App Store Connect API key, without changing project.yml signing

- **Status:** accepted
- **Date Recorded:** 2026-07-18
- **Context:** The user asked for automatic deployment to TestFlight, reusable across apps. Distribution requires real code signing, but DEC (JAPA-9, working agreement) deliberately keeps `project.yml` shipping `CODE_SIGNING_ALLOWED: NO` so the simulator CI (`ios-ci.yml`) stays green and the repo is not tied to an Apple team. The device-install flow already overrides signing at the command line (team `796XH483R4`, automatic provisioning).
- **Options Considered:** (a) flip `project.yml` to committed signing (rejected — breaks simulator CI, ties repo to the team, contradicts JAPA-9); (b) Xcode Cloud (rejected for now — less portable, not "works for any app" off-GitHub); (c) `fastlane match` with a private certs repo (more reproducible but adds a second repo + `MATCH_PASSWORD` setup — deferred as a hardening option); (d) **Fastlane `beta` lane authenticated by an App Store Connect API key, injecting distribution signing only at archive time via `xcargs` + `-allowProvisioningUpdates`, triggered by a tag/dispatch GitHub Actions workflow.**
- **Decision:** Option (d). `project.yml` is unchanged; signing is applied only inside the archive step, mirroring the existing device-install override. Authentication uses an ASC API key (no Apple ID/2FA) so runs are unattended. Build number = CI run number (monotonic).
- **Consequences:** `ios-ci.yml` simulator build/test is unaffected. The automated path remains unavailable until the four secrets (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`, `DEVELOPMENT_TEAM`) are configured; `ASC_KEY_CONTENT` is currently missing. This does not block a manual Xcode Organizer upload: Build 2 was uploaded manually on 2026-08-06. Public release still waits on Apple App Review and the human launch gates (JAPA-6/8/9).
- **Related Prompt:** Automatic TestFlight deployment + doc reconciliation to App Factory standard
- **Related Files:** `fastlane/Fastfile`, `fastlane/Appfile`, `Gemfile`, `.github/workflows/release-testflight.yml`, `docs/DEPLOYMENT.md`, `docs/RELEASE_CHECKLIST.md`

## DEC-006 — Use support@priyanshchordia.com as the Mala public support contact

- **Status:** accepted
- **Date Recorded:** 2026-07-28
- **Context:** The App Store support URL and privacy policy require a real public contact path. The canonical page drafts still contained an unpublished-email placeholder.
- **Options Considered:** A personal mailbox; a product-specific mailbox; `support@priyanshchordia.com`.
- **Decision:** Publish `support@priyanshchordia.com` on both Mala public pages and use it for App Store support and privacy inquiries.
- **Consequences:** The mailbox or forwarding rule must be configured and tested before the URLs are marked live. Both pages should use a `mailto:support@priyanshchordia.com` link. If the address changes, update the public pages, App Store Connect, and `docs/RELEASE_METADATA.md` together.
- **Related Files:** `docs/RELEASE_METADATA.md`, `docs/RELEASE_CHECKLIST.md`

## DEC-007 — Repository documents are authoritative; external tools are mirrors

- **Status:** accepted
- **Date Recorded:** 2026-07-29
- **Context:** Jira and Notion improve assignment, time tracking, filtering, and visibility, but tracker state drifted from verified code and repository documents. Studio OS also described its product record as authoritative, creating conflicting ownership.
- **Options Considered:** Jira as execution source of truth; Notion as project source of truth; multiple equal authorities; repository-first authority with external mirrors.
- **Decision:** Code, evidence, feature contracts, and canonical documents committed to the product repository are the source of truth. Jira, Notion, Studio OS, dashboards, and chat history are external mirrors and convenience views.
- **Consequences:** Synchronization flows from verified repository state outward. Material external events must be recorded in the applicable repository document. Conflicts are resolved by verifying repository evidence and correcting mirrors. Tracker status alone cannot change scope or prove completion.
- **Related Files:** `AGENTS.md`, `.factory/AGENTS.factory.md`, `.factory/repository-map.json`, `docs/GOVERNANCE.md`, `docs/README.md`, `docs/STATUS.md`

## DEC-008 — Use the product-branded App Store bundle identifier

- **Status:** accepted
- **Date Recorded:** 2026-07-30
- **Context:** Before the first App Store Connect or TestFlight upload, the user chose a product-branded bundle identifier rather than retaining the original internal project name in the public release identity.
- **Options Considered:** Retain `com.priyansh.japa`; change the release bundle to `com.priyansh.mala` while preserving compatibility-sensitive internal target, scheme, engine, and persistence-directory names.
- **Decision:** Use `com.priyansh.mala` for the shipping app, with matching test-target and UI-automation identifiers. Preserve the internal `Japa` target/scheme and persistence directory.
- **Consequences:** Apple must accept and register `com.priyansh.mala` before the first upload. Development builds under the former bundle identifier use a different app sandbox and do not share local history with the new identifier; no customer migration is required because the app has not shipped.
- **Related Files:** `project.yml`, `fastlane/Appfile`, `quality/ui/`, `docs/ARCHITECTURE.md`, `docs/RELEASE_METADATA.md`, `docs/DEPLOYMENT.md`

## DEC-009 — Separate store-content upload from App Review submission

- **Status:** accepted
- **Date Recorded:** 2026-07-31
- **Context:** TestFlight upload automation existed, but App Store metadata,
  screenshots, and review submission were manual-only. Public submission is a
  consequential action and must never occur from a tag push or an ambiguous
  command.
- **Options Considered:** Keep all store work manual; make a tag-triggered full
  release lane; create one workflow with separate metadata and explicit submit
  actions.
- **Decision:** Version the approved App Store copy under `fastlane/metadata`.
  Add `store_metadata`, which cannot submit or upload a binary, and
  `submit_review`, which selects an exact processed build, requires a manually
  dispatched workflow with the confirmation `SUBMIT-MALA-<version>`, and sets
  `automatic_release: false`.
- **Consequences:** Store copy and screenshots can be synchronized repeatably
  after human approval, while TestFlight upload, review submission, and public
  release remain distinct gates. Privacy, age-rating, export, agreement,
  territory, and pricing answers are not inferred by automation. The new lanes
  remain unverified until authenticated App Store Connect runs succeed.
- **Related Files:** `fastlane/Fastfile`, `fastlane/metadata/`,
  `.github/workflows/release-app-store.yml`, `docs/DEPLOYMENT.md`,
  `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_METADATA.md`

## DEC-010 — VoiceOver support is out of scope, not deferred

- **Status:** accepted
- **Date Recorded:** 2026-08-14
- **Context:** B-A11Y/R3/O4 tracked VoiceOver user validation as an "accepted
  post-v1 risk" — implying VoiceOver support was still planned, just not yet
  validated. The user decided VoiceOver is not wanted for this app at all.
- **Options Considered:** Keep VoiceOver as a deferred post-v1 gate requiring
  future user validation; drop VoiceOver as a product requirement entirely
  while leaving existing VoiceOver labels/actions in the code as-is (no code
  removal, just no further investment or launch-gating on it).
- **Decision:** VoiceOver support is out of scope for Mala, for any version.
  It is not a launch gate, not a post-v1 roadmap item, and not tracked as a
  residual risk going forward. Dynamic Type remains the app's accessibility
  baseline and stays implemented, tested, and required for launch.
- **Consequences:** B-A11Y (BUGS.md) and R3 (RISKS.md) are closed as
  out-of-scope rather than left open as accepted risk. O4 (LAUNCH_READINESS.md
  §7/§9) is closed — no VoiceOver user-validation step blocks launch.
  Existing VoiceOver labels/values/actions in `Japa/Design/Theme.swift` are
  left in place unmodified; this decision governs requirements and roadmap,
  not existing code.
- **Related Files:** `docs/BUGS.md`, `docs/RISKS.md`, `docs/STATUS.md`,
  `LAUNCH_READINESS.md`
