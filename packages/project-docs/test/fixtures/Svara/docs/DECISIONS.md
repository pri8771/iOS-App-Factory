# Decisions

## DEC-001 — App Factory registration

- **Status:** accepted
- **Decision:** Classify Svara as an existing iOS project governed by App
  Factory standard 0.4.0. The initial 0.2.0 enrollment was migrated on
  2026-07-29 to add the required repository map, documentation index, and
  reusable-library catalog.
- **Consequences:** Agents read `.factory` registration, project docs, quality
  manifest, and relevant contracts before changing code.

## DEC-002 — Local profile, not mock authentication

- **Status:** accepted
- **Context:** The former form accepted arbitrary email/password combinations.
- **Decision:** Ship without an account surface. Users may edit a display name
  stored only on their device.
- **Consequences:** No account-deletion flow or sign-in promise applies to 1.0.
  A real backend account feature requires a new contract and privacy review.

## DEC-003 — StoreKit is entitlement authority

- **Status:** accepted
- **Decision:** Premium access derives only from verified current StoreKit
  entitlements. The legacy profile flag is retained solely for decoding and is
  cleared during migration.
- **Consequences:** Expiration, refund, and revocation remove access after
  entitlement refresh.

## DEC-004 — StoreKit configuration is development-only

- **Status:** accepted
- **Decision:** Keep the shared scheme reference for simulator testing but
  exclude `Svara.storekit` from production target membership.

## DEC-006 — Owner testing build is free

- **Status:** accepted
- **Date:** 2026-07-30
- **Decision:** The current owner-only testing configuration exposes every
  bundled feature and content item for free. It has no Svara Plus card,
  membership label, paywall, or StoreKit product-loading flow.
- **Implementation:** `FeatureFlags.current.plusTierEnabled` is `false`.
  Authored premium markers, the paywall, StoreKit service, product identifiers,
  and a `monetizedFull` configuration remain dormant for intentional future
  reactivation.
- **Consequences:** Commerce tasks `TF-005` and `TF-012` are deferred and do
  not block the owner-only free build. Re-enabling Plus requires a new explicit
  owner decision, metadata/legal reconciliation, and full commerce testing.

## DEC-005 — TestFlight release configuration

- **Status:** accepted
- **Date:** 2026-07-30
- **Decision:** Upload Svara 1.0 (build 2) as an external-eligible TestFlight
  candidate for the owner first and a small, invitation-only close-friends
  cohort after TestFlight App Review. The build uses the full five-tab surface,
  targets iPhone on iOS 17+, and uses English (U.S.) as its primary language.
  Public links remain disabled. The existing App Store Connect record uses the
  immutable internal SKU `SVARA001` (reconciled on 2026-07-30; the earlier
  fallback proposal `SVARA-IOS-001` was never created). The historical private
  external-group proposal was `Svara Close Friends`, initially capped at 10
  testers; `DEC-011` supersedes that group name with two empty external cohort
  containers whose membership and rollout mapping remain pending. The owner is
  the release operator, QA/feedback owner, and stop authority.
- **Review contact:** Use the owner’s secure contact record in App Store
  Connect; do not copy phone or other private contact data into the repository.
- **Commerce:** All content is free under `DEC-006`; IAP setup and testing are
  deferred and do not gate this free beta.
- **Consequences:** The uploaded build must not be marked TestFlight Internal
  Only, because that would make it permanently ineligible for close-friends
  external testing. Upload and owner-internal smoke may proceed first. External
  invitations remain blocked until metadata/legal/content/audio and physical
  QA gates are satisfied and Apple approves TestFlight App Review.

## DEC-007 — Daily-practice and breath audio behavior

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** A mantra recording is not presented as a separate “chant” mode
  in Today. It starts automatically when the user begins a mantra or prayer
  practice, with an ordinary play/pause control available during the active
  timer. Breathing practices should later receive optional, audio-on-by-default
  nonverbal timing cues plus a visible mute/play control; they should not reuse
  mantra recordings or require continuous spoken coaching.
- **Why:** The user chose a guided practice by tapping Begin, so a second chant
  choice is confusing. Sparse breath cues can make eyes-closed timing usable
  without turning calm guidance into constant narration.
- **Consequences:** Build 3 replaces Apple-incompatible MP3 encodings with
  AAC-in-M4A assets and adds explicit playback-failure UI. Breath cues remain a
  separate asset, content, accessibility, and physical-device QA task; no
  unreviewed cue is invented for this release candidate.

## DEC-008 — Svara Points unlock milestones, never content

- **Status:** accepted
- **Date:** 2026-07-31
- **Decision:** Keep every bundled feature and content item free and available
  independently of points. Svara Points are a private, cumulative record of
  completed practices, lessons, festival activities, and achievement bonuses.
  They unlock visible milestone badges at 100, 250, and 500 points; they cannot
  be spent, purchased, compared publicly, or used to gate content.
- **Why:** Points were shown and awarded without explaining their purpose, and
  the sole 500-point achievement was too hidden to establish a useful mental
  model. Explicit milestones provide gentle feedback without turning spiritual
  practice into an economy or contradicting the all-free testing build.
- **Expected product change:** Today identifies Svara Points as badge progress;
  Profile explains how they are earned, shows the next unlock and progress,
  and labels every badge requirement. A bonus that crosses a points threshold
  unlocks the milestone in the same transaction.

## DEC-009 — Separate internal friends group

- **Status:** superseded by `DEC-010`
- **Date:** 2026-08-02
- **Decision:** Keep the one-owner `Svara Owner Smoke` group unchanged for
  TF-015 and create a separate, manually distributed `Svara Friends Internal`
  group for build 1.0 (3). Add the owner immediately. Invite one approved friend
  as a Marketing user restricted to Svara because Apple requires internal
  testers to be App Store Connect users with an eligible role.
- **Current state:** The Svara-only App Store Connect user invitation was sent.
  The friend cannot be added to the TestFlight group until that invitation is
  accepted; the repository must not claim that the TestFlight invite was sent
  before the user becomes selectable and is added to the group.
- **Consequences:** This does not change TF-015's one-owner acceptance criteria,
  approve an external group, enable a public link, or clear TF-006–TF-010 and
  TF-014. Tester email addresses remain outside the repository.

## DEC-010 — Reset TestFlight groups before cohort redesign

- **Status:** accepted
- **Date:** 2026-08-02
- **Decision:** Delete every internal and external TestFlight group, preserve
  all App Store Connect users, and leave replacement groups uncreated until the
  owner explicitly approves each group's name, type, and membership.
- **Reset outcome:** Immediately after deletion, App Store Connect had zero
  internal and zero external groups; builds 1.0 (2) and 1.0 (3) were unassigned;
  and the existing Svara-only user invitation remained pending. Replacement
  group creation is recorded separately in `DEC-011`.
- **Why:** The owner wants the distribution cohorts remade deliberately without
  deleting account access or guessing which users belong in which group.
- **Consequences:** Prior group-based build access was removed. After `DEC-011`,
  TF-015 remains blocked until one existing internal group is designated and
  configured with only the owner and build 3. External distribution remains
  blocked by its existing release gates, and no public link may be enabled by
  inference. Tester email addresses remain outside the repository.

## DEC-011 — Four family and friends TestFlight groups

- **Status:** accepted
- **Date:** 2026-08-02
- **Decision:** Create internal groups `internal_family` and
  `internal_family_and_friends`, and matching external groups `external_family`
  and `external_family_and_friends`.
- **Configuration:** Both internal groups use manual distribution. All four
  groups start with zero testers and zero builds. No public link is enabled and
  no build is submitted for TestFlight App Review as part of group creation.
- **Why:** The owner wants separate family-only and combined family/friends
  cohort containers for both internal and external distribution before deciding
  membership and build allocation.
- **Consequences:** Group existence does not authorize tester invitations,
  attach a build, close TF-015, or clear any external-release gate. The owner
  must explicitly map users and builds and designate one internal group for the
  one-owner TF-015 smoke before distribution changes. Tester email addresses
  remain outside the repository.
