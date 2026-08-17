# Bugs

| ID | Severity | Area | Summary | Status | Evidence |
|---|---|---|---|---|---|
| AURA-B01 | release_blocking | Privacy | Privacy manifest was not found in the audited app tree. | resolved | Manifest is bundled in the 2026-07-29 Release build. |
| AURA-B02 | release_blocking | Privacy | The manifest omitted the file-timestamp required-reason API used by orphan reconciliation. | resolved | `NSPrivacyAccessedAPICategoryFileTimestamp` / `C617.1` is declared and regression-tested. |
| AURA-B03 | high | Claims | Privacy and onboarding copy described a learned image model that is not shipped. | resolved | Product copy and both privacy-policy copies now describe deterministic local analysis. |
| AURA-B04 | release_blocking | Scoring | Unusable photos could inherit generous neutral metric floors and receive implausibly high scores. | code_complete | Deterministic pose/framing/exposure/sharpness/contrast rejection plus borderline score ceilings and regression tests; physical-device bad-photo matrix remains verification pending. |

AURA-B04 requires physical-device verification with the dark, bright, blurry, cropped,
no-person, too-far, and too-close fixtures before it can be marked resolved. The other
unexecuted device, signing, StoreKit, accessibility, and App Store Connect checks remain
release risks and verification gaps, not confirmed bugs.

Record observed behavior, reproduction steps, expected behavior, environment, and evidence. Do not convert assumptions into confirmed bugs.
