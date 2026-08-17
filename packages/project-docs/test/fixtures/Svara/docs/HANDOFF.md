# Handoff

## What the project is

Svara is a local-first iPhone app for brief Hindu spiritual-wellness practice,
learning, festival context, stories, and gentle progress.

## Current state

The external-eligible build 3 replacement is processed. Per `DEC-010`, both
prior internal groups were deleted on 2026-08-02 while users were preserved.
Per `DEC-011`, four empty replacement groups now exist: internal
`internal_family` and `internal_family_and_friends`, plus external
`external_family` and `external_family_and_friends`. Internal automatic
distribution is disabled. No tester or build is assigned, no public link is
enabled, and no TestFlight App Review submission was made. One approved
friend's Svara-only App Store Connect invitation remains pending acceptance;
do not assign any user or build until the owner approves the mapping.
Factory registration and current quality state live in `.factory/`,
`quality/`, `docs/STATUS.md`, and the canonical
`docs/TESTFLIGHT_TASKS.md`. Apple account scope, cloud-managed signing, and
the existing record (Apple ID `6785557134`) are verified. Build 1.0 (2) was
uploaded as external-eligible and processed, but its bundled MP3 encoding
failed physical-device audio evaluation. Build 3 replaces those recordings
with AAC-in-M4A and changes Today audio to start on Begin. Per
`DEC-006`, every content item is free
and Plus/paywall/membership UI is hidden in the current testing configuration.
Current build 3 source also explains Svara Points in Today/Profile: points unlock
private 100/250/500-point achievement badges and never gate content.
Dormant StoreKit commerce is deferred. Deployed legal pages, content review,
audio rights, and full physical-device QA remain required before friend
invitations, although the owner may complete TF-015 first.

The 2026-07-30 comprehensive simulator UI audit traversed the shipped workflow
families. Its active product findings were remediated. Exact build 3 commit
`ed29548` passes the locked Factory checks, 159/159 complete tests, Release
analysis, archive inspection, remote CI, signed upload, and Apple processing.
Group membership, build 3 attachment, and human
audio/notification/accessibility checks govern release status. Read
`quality/evidence/UI-WORKFLOW-AUDIT-2026-07-30.md`.

## Build and run

Open `Svara.xcodeproj` in Xcode 16+ and select the shared `Svara` scheme. The
scheme retains a dormant `Svara/Resources/Svara.storekit` reference for future
purchase testing; `FeatureFlags.current.plusTierEnabled` is currently `false`.
No package installation or backend setup is required.

## Important constraints

- iOS 17+, iPhone target.
- Local-first; no backend, analytics, ads, or tracking.
- No third-party dependencies.
- All content is free in the current owner-testing configuration.
- If Plus is later re-enabled, StoreKit is the only premium entitlement authority.
- `ProductGuardrails.md` is binding for content and product behavior.
- Jira and Notion are copies only. Update the repository task, evidence, status,
  and commit reference first.

## Known issues

See `docs/BUGS.md`.

## Next recommended task

Approve the group membership and build allocation, designate one existing
internal group as owner-only, add only the owner, attach build 3 only, then
install it through TestFlight and run the remaining TF-015 smoke. The pending
Svara-only user invitation may be retained, but the user must not be assigned
until the mapping is approved. External close friends remain gated
by TF-006–TF-008,
TF-010, TF-013, and TF-014.

## Marketing-page handoff

The owner also opened a parallel public-website track. Use
`docs/MARKETING_LANDING_PAGE_TASKS.md` for the three Svara page concepts, three
icon candidates, real screenshots, HubSpot waitlist, and publication gates.
Do not treat generated design output as cultural, content, audio, or release
approval.
