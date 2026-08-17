# Decisions

## DEC-001 — Project registration

- **Status:** accepted
- **Context:** This repository is governed by the App Factory standards.
- **Decision:** Use `.factory/project-context.json` as the authoritative project classification marker.
- **Consequences:** Agents must read the registration and quality files before coding.

## DEC-002 — Preserve the offline, dependency-free product boundary

- **Status:** accepted
- **Context:** The shipped implementation and privacy promise are local-only.
- **Decision:** Keep backend, networking, third-party dependencies, analytics,
  accounts, ads, and IAP out of v1.
- **Consequences:** App Privacy remains Data Not Collected; any future network or
  SDK work requires a documented decision and privacy reassessment.

## DEC-003 — Degraded persistence must be visible

- **Status:** accepted
- **Context:** Crashing when SwiftData cannot open is undesirable, but silent
  in-memory fallback implies durability that does not exist.
- **Decision:** Keep the fallback for availability and display a persistent
  warning; surface and roll back mutation failures.
- **Consequences:** The prayer flow remains usable while saved state is honest.

## DEC-004 — Human review remains a hard release gate

- **Status:** accepted
- **Context:** Sacred text and provisional recitations cannot be declared
  culturally approved by code inspection.
- **Decision:** Preserve the failing named-review gate and do not fabricate
  reviewer fields. Exclude synthetic and provisional audio from every normal
  Debug, device, Release, and TestFlight build. Listen may be enabled only for
  an exact-ID human recording with documented rights and named content,
  pronunciation, technical, and device approval.
- **Consequences:** Factory status remains `verification_pending` even when all
  automated tests pass.

## DEC-005 — Repository backlog is authoritative

- **Status:** accepted
- **Context:** Release tasks may be mirrored into Jira or Notion, but copies can
  drift and omit App Factory evidence requirements.
- **Decision:** `docs/TESTFLIGHT_READINESS_BACKLOG.md` owns task IDs, scope,
  dependencies, status, acceptance criteria, and evidence. Update it before any
  external copy.
- **Consequences:** A Jira/Notion status cannot prove completion; repository
  evidence and this backlog decide readiness.

## DEC-006 — Separate TestFlight from App Store submission

- **Status:** accepted
- **Context:** Previous checklists treated screenshots, full storefront
  metadata, categories, and age rating as blockers for the first TestFlight
  install and omitted beta-specific Test Information.
- **Decision:** Track TF-001–TF-012 for TestFlight and AS-001–AS-007 for
  storefront submission. Complete an AS task early if App Store Connect
  explicitly requires it, but do not report it as a universal first-internal-
  beta prerequisite.
- **Consequences:** Beta readiness focuses on identity, signed binary,
  processing/compliance, Test Information, device QA, and Beta App Review while
  keeping later storefront work visible.

## DEC-007 — Require exact prayer-to-audio identity

- **Status:** accepted
- **Context:** Debug preview substituted `vishnu-narayana` for
  `vishnu-shantakaram` and `hanuman-namah` for `hanuman-manojavam`, causing the
  displayed sacred text and audible prayer to disagree.
- **Decision:** Resolve audio only when the asset basename exactly equals the
  displayed prayer ID. Never use a related deity, theme, moment, or fuzzy title
  as a fallback. Missing or ambiguous audio fails closed by removing Listen;
  the exact prayer remains available through explicit self-led Chant/Silent.
- **Consequences:** Coverage may be temporarily lower, but it cannot be
  manufactured by playing the wrong prayer. Candidate recordings remain
  research inputs outside normal builds until transcript, pronunciation,
  context, rights, technical, and device review meet
  `docs/AUDIO_LYRIC_ALIGNMENT_PLAN.md` and
  `docs/DAILY_USE_PRODUCT_PLAN.md`.

## DEC-008 — Do not offer Listen without exact audio

- **Status:** accepted
- **Context:** The normal-build catalog contains no approved human recording,
  while the former UI advertised Listen for text-only prayers.
- **Decision:** Derive the player mode picker from the current bundle. Show
  Listen only when an exact approved catalog asset resolves under the
  normal-build policy. Keep Chant and Silent available as text-led experiences.
- **Consequences:** A missing recording no longer creates a false playback
  affordance. A genuine load/route failure after an asset resolves leaves the
  session unstarted, reports the failure, and offers Chant or Silent; it cannot
  run a silent timer or record a false Listen completion.

## DEC-009 — Distinguish the three practice modes

- **Status:** accepted
- **Context:** Listen, Chant, and Silent previously shared ambiguous controls
  and timer-driven completion that could imply the person had finished.
- **Decision:** Listen means hearing the exact selected prayer from an approved
  human recording. Chant means self-led recitation aloud with no recording.
  Silent means inward reading or repetition with no sound. Every mode shows the
  selected prayer text and meaning. Chant and Silent require explicit Begin
  and explicit Complete; their suggested duration is guidance only.
- **Consequences:** The UI states the sound behavior before practice, exposes
  pause/continue state, and never invents completion from elapsed time.

## DEC-010 — Reminder identity is stable while time is editable

- **Status:** accepted
- **Context:** Fixed unexplained reminder times are not a trustworthy daily-use
  control, while changing notification identifiers would create duplicates.
- **Decision:** Keep one stable notification identifier per dawn, sunset, and
  sleep slot. Store the chosen local hour/minute in UserDefaults and reschedule
  the same identifier. Persist and display a changed time only after scheduling
  succeeds; restore the prior UI/value on failure.
- **Consequences:** Reminder times survive relaunch and successful edits replace
  rather than duplicate requests. Permission, actual delivery, timezone, DST,
  and rollback behavior still require named real-device verification.

## DEC-012 — Use Find as the tab label; keep Moment as a browse dimension

- **Status:** accepted
- **Context:** “Moments” required explanation before a first-time user knew
  that the tab was the place to choose a prayer, and the same screen also
  contains Intention and Deity.
- **Decision:** Label the second tab **Find** and title its screen “Find a
  prayer.” Inside it, retain Moment as an explicitly explained anytime
  situation alongside separate Intention and Deity dimensions. Keep the
  internal `AppTab.moments` identifier and existing moment deep links for
  compatibility.
- **Consequences:** The primary navigation describes the action instead of
  forcing product vocabulary, while Dawn and other Moment classifications stay
  available and are never clock-locked.

## DEC-013 — Keep first use optional and defer permission/configuration

- **Status:** accepted
- **Context:** The former second onboarding screen asked for mode, favorite
  situations, and two reminder schedules before the person had experienced a
  prayer.
- **Decision:** Keep a short optional orientation with Skip, live script
  preview, and optional deity preference. Default the text-only product to
  Chant. Explain practice modes in the player and offline guide. Configure
  reminders, including permission and exact times, only from Me.
- **Consequences:** A person reaches Today in two deliberate actions, and
  notification permission is requested only at the feature point where the
  user selects a specific reminder.

## DEC-011 — Consumer TestFlight requires the daily-use product gate

- **Status:** accepted
- **Context:** Passing build and distribution mechanics does not prove the app
  is understandable, culturally trustworthy, or useful enough for consumers.
- **Decision:** `docs/DAILY_USE_PRODUCT_PLAN.md` owns consumer-product readiness.
  Do not freeze or distribute a consumer TestFlight candidate until its P0
  requirements, named-human gates, and declared prerequisite tasks are
  satisfied. The TestFlight backlog continues to own distribution execution.
- **Consequences:** Engineering or account preparation may continue in
  parallel, but it cannot be presented as consumer-beta readiness.

Plan: [Daily-Use Consumer Product Plan](DAILY_USE_PRODUCT_PLAN.md).

## DEC-014 — Allow disclosed generated audio in the TestFlight pilot

- **Status:** accepted (2 August 2026; product-owner direction)
- **Context:** The owner needs real playback behavior in a TestFlight pilot
  before approved human recitations are available.
- **Decision:** Permit one selected, exact-ID Suno-generated asset per prayer
  in the bounded TestFlight pilot only. The Listen surface must visibly disclose
  that the audio is experimental and generated; canonical text, transliteration,
  and meaning remain authoritative. Record source title and hash for each asset.
- **Consequences:** This supersedes DEC-004's TestFlight-audio exclusion only
  for the explicitly disclosed pilot. It does not grant human-review,
  pronunciation, rights, lyric-identity, or public-release approval; App Store
  release remains blocked until the original human-recording gate is satisfied.

## DEC-015 — Expand TestFlight pilot scope to audio variants

- **Status:** accepted (7 August 2026; product-owner direction)
- **Context:** The Suno pilot produced multiple style variants for selected
  prayers, while the player previously supported one exact-ID audio asset per
  prayer.
- **Decision:** Add a compact variant picker to Listen mode with Traditional
  selected by default, plus EDM and Indian hip-hop alternates where verified
  assets exist. Package only hash-recorded, exact-ID pilot assets and retain
  the existing experimental-audio disclosure.
- **Scope change:**
  - **In scope:** 8 verified Suno variants for `ganesha-gam` (3),
    `ganesha-shri` (3), and `vishnu-shantakaram` (2); variant resolution; the
    Listen-mode picker; and the pilot asset manifest.
  - **Out of scope:** Public/App Store generated audio, replacing the
    human-recording approval gate, shipping all remaining Suno jobs, and final
    lyric/cultural approval.
- **Consequences:** Traditional is the initial/default experience; changing
  variants resets playback; the MP3 pilot assets must be replaced by approved
  AAC/M4A human recordings before public release; and device/TestFlight QA is
  required for the new picker and packaged assets.
