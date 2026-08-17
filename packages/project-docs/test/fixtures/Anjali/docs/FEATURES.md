# Features

## Product outcome

Give a Hindu practitioner one respectful, short, private prayer suited to the
moment, then let them return to their day without a feed, streak, or account.

## MVP boundary

Included: two-step onboarding, time-band Today prayer, Listen/Chant/Silent
player, completion, saved prayers, browse by moment/intention/deity, editable
local reminder times, deep links, local preferences/history, and an offline privacy
disclosure.

Player modes have distinct contracts:

- **Listen** plays only an exact-ID bundled recording for the displayed prayer.
  It is offered only when that exact recording has passed the approved catalog
  policy and is present in the current bundle. A load/play failure does not
  start a pretend session or record completion.
- **Chant** is self-led aloud using the complete canonical prayer text. It
  explicitly says no recording plays, shows suggested pacing, and completes
  only when the user chooses Complete.
- **Silent** is inward reading/repetition with no sound, explicit controls, and
  explicit completion.

Synthetic and generated assets are excluded from every normal Debug/device and
Release build. Their audit and human-recording replacement plan is
`docs/AUDIO_LYRIC_ALIGNMENT_PLAN.md`.

Excluded: accounts, sync, backend, analytics, ads, IAP, generated sacred text,
feeds, streaks, widgets, and unreviewed production content.

The detailed consumer-readiness contract and task sequence is
`docs/DAILY_USE_PRODUCT_PLAN.md`.

## Feature inventory

| ID | Feature | Status | Contract |
|---|---|---|---|
| FEAT-001 | Contextual prayer experience | verification_pending | `quality/feature-contracts/FEAT-001-prayer-experience.json` |
| FEAT-002 | Local preferences and saved-prayer persistence | verification_pending | `quality/feature-contracts/FEAT-002-local-persistence.json` |
| FEAT-003 | Opt-in local reminders | verification_pending | `quality/feature-contracts/FEAT-003-local-reminders.json` |

Detailed product acceptance criteria remain in `LAUNCH_READINESS.md`. Current
verification status belongs in `docs/STATUS.md`, not that long-form scope file.
