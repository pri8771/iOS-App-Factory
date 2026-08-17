# Features

## Product outcome

Help a user build a respectful, brief Hindu spiritual-wellness practice without
an account, ads, social pressure, or a network connection.

## MVP boundary

### Included

- Onboarding and local profile
- Daily practices and bundled mantra audio
- Aaroh lesson path and progress
- Festival moments and activities
- Stories, symbols, and private local reflections
- Gentle local progress, explained Svara Points, achievement milestones, and reminders
- All bundled content available without payment in the owner testing build

### Excluded

- Backend accounts or sync
- Analytics, ads, and public social features
- Virtual rituals, marketplace, or doctrinal authority
- WidgetKit and remote content delivery

## Feature inventory

| ID | Feature | Status | Contract |
|---|---|---|---|
| FEAT-001 | TestFlight release candidate | verification_pending | `quality/feature-contracts/FEAT-001.json` |
| FEAT-002 | Daily practice and audio | human_review_required | covered by FEAT-001 |
| FEAT-003 | Aaroh learning path | human_review_required | covered by FEAT-001 |
| FEAT-004 | Festivals and stories | human_review_required | covered by FEAT-001 |
| FEAT-005 | Local progress, Svara Points, achievements, and reminders | verification_pending | covered by FEAT-001; `DEC-008` |
| FEAT-006 | Svara Plus | deferred; hidden in current build | covered by FEAT-001 |
| FEAT-007 | Nonverbal breathing-practice audio cues | planned | `DEC-007`; plan below |

Release readiness for these features is executed through
`docs/TESTFLIGHT_TASKS.md`. In particular, content/audio are gated by `TF-007`,
device accessibility by `TF-010`. End-to-end Svara Plus behavior remains
deferred to `TF-005` and `TF-012` before any future monetized build.

### Svara Points behavior

Every bundled practice, lesson, festival, story, and feature remains free;
points never control access. Completing eligible activities awards points once.
The Profile screen explains their purpose, shows progress toward the next
100/250/500-point milestone, and displays each badge's unlock requirement.
Milestones are private encouragement only: no spending, purchase, public
ranking, competitive comparison, or devotional status.

## FEAT-007 implementation plan — breathing-practice audio cues

**Summary and outcome:** Add sparse, nonverbal timing cues to breathing
practices so a user can keep their eyes closed and know when to inhale, hold,
and exhale. Audio is on when the practice begins, while a visible play/pause or
mute control always leaves the user in control. This improves hands-free use
without continuous narration, medical claims, or reuse of devotional mantra
audio. The expected change is a breathing timer whose cue, visual phase,
accessibility value, pause/resume state, and completion remain synchronized on
speaker and headphones. This is planned separately from build 3 because the
cue sound and rights/review record do not yet exist.

### Subtasks

1. **Specify the cue timeline.** Model explicit `inhale`, `hold`, and `exhale`
   phases from each practice's authored counts instead of inferring them from
   prose. Define cue-at-transition behavior, loop count, timer completion,
   background/interruption handling, and the rule that pausing audio does not
   pause the practice timer. Add unit-testable phase/timestamp fixtures.
2. **Create and review the cue set.** Supply short, calm, distinguishable
   nonverbal sounds with safe loudness and no temple-coded bell or interactive
   ritual sound. Store lossless masters outside the app if available, ship an
   Apple-decodable AAC-in-M4A export, record exact hashes/source/license in
   `AUDIO_PROVENANCE.md`, and obtain product/accessibility review before use.
3. **Implement playback.** Add a narrow cue scheduler beside
   `AudioPlaybackService`; do not overload mantra looping with timing logic.
   Start cues when the user taps Begin, default them on, expose one clearly
   labelled mute/play control during the active practice, cancel scheduled
   cues on finish/dismiss, and resynchronize after interruption or route loss.
   Surface missing/decode errors without blocking timer completion.
4. **Make phases accessible.** Announce phase changes concisely through
   VoiceOver, provide haptic transitions when enabled and available, keep
   meaning independent of sound/color, and respect Reduce Motion. Do not emit
   repeated announcements every second.
5. **Verify before release.** Add unit tests for phase sequencing, scheduler
   cancellation, interruption recovery, and missing assets; add UI tests for
   default-on and mute/resume; then run the TF-010 physical speaker,
   headphones, Bluetooth, lock, background, VoiceOver, and interruption matrix.
   Keep the feature `planned` until its cue asset, provenance, tests, and
   physical-device evidence all exist.
