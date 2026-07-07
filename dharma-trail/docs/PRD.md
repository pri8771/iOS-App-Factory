# dharma-trail — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where this landed: only one voice actually spoke this round — Codex and Gemini both came back unavailable (CLI/auth issues), so there was no cross-examination, just Claude's own skeptical pass. Nobody contradicted it, but that's because nobody else weighed in, not because of hard-won agreement. Given the playbook's instruction to recover cleanly from stalls rather than block on unavailable tools, and that the analysis directly satisfies every required output for this phase (hard requirements, non-goals, production-readiness bar, decision rules), I'm treating this as sufficient to close the phase rather than waiting on CLIs that may not come back.

The core things Claude nailed down: this conversation builds dharma-trail only, it does not re-run the "14 candidates → best 7" portfolio-level selection; MVP-build and production-ready are reconciled as small-scope-but-fully-finished rather than large-and-half-built; Hindu/Jain inclusivity defaults to shared/neutral vocabulary and mechanics with sect-specific content opt-in; any generated scripture/mantra content is a factual-accuracy risk to guard against; gamification (streaks/XP) needs non-punitive framing so it doesn't clash with reverence; and there's a real, unresolved risk that this app and its digital-temple sibling could collide since neither conversation can see the other — that gets logged as an assumption/risk rather than solved here. Portfolio-level artifacts (Jira/Notion, cross-app transcript, sibling coordination) are explicitly out of scope for this conversation.

CONSENSUS: YES

## Final Output

**Original prompt reference:** Preserved verbatim above — build dharma-trail, a local-first SwiftUI MVP digital-temple app (Hindu/Jain-interpretable, meditation + prayer + daily practice, Headspace-crossed-with-Duolingo mechanics), as one child project under the batch-specials portfolio. Full text logged in the discussion transcript above; not restated here.

**Hard requirements:**
- Deliver a working local-first SwiftUI MVP for exactly one app: dharma-trail. Do not re-run or second-guess the portfolio's "generate 14, pick 7" selection — that's already resolved one level up.
- Core loop must work end-to-end with real local persistence across relaunch: pick a practice → complete a guided/timed session → streak and history persist.
- Content and mechanics must be interpretable by both Hindu and Jain users by default — favor shared/neutral concepts (dharma, ahimsa, japa/mantra counting, meditation timers, daily structure) over deity- or sect-specific iconography/liturgy; sect-specific content, if included, must be opt-in, not baked into the default path.
- Must not resemble the user's existing digital-temple app or the sibling digital-temple app in this batch (uniqueness is unverifiable from here — see decision rules below).
- Gamification (streaks, XP, structured paths) must use non-punitive framing (e.g., grace periods) so loss of a streak doesn't read as failing at religious practice.
- Every screen needs real empty/loading/success/error states, including genuine first-run (zero history) state.
- A real, non-cosmetic subscription-worthy value tier must exist as a plausible monetization path.
- Accessibility: VoiceOver-correct handling of transliterated Sanskrit/Prakrit terms, Dynamic Type support for any non-Latin script/diacritics.
- Local-first: no guided-session feature may silently require network access; if "guided session" implies voice-over audio, commit explicitly to text-guided/timer-based sessions or on-device TTS rather than assuming studio-recorded audio.
- Handle timezone/DST/midnight-rollover correctly in streak logic; handle backgrounding/interruption during a timed session without losing state; handle notification-permission denial gracefully.

**Non-goals for this conversation:**
- Re-selecting which 7 apps the portfolio builds.
- Producing Jira/Notion backfill structures, the combined multi-app transcript, or any coordination/verification of the other 6 apps in the batch.
- Guaranteeing uniqueness against the user's existing digital-temple app (no access to it) or against the sibling digital-temple app in real time (no shared visibility) — these are logged as unverifiable assumptions, not resolved facts.

**Production-readiness definition:** The app builds and runs without crashing on a real iOS 17+ target; the core loop (choose practice → guided/timed session → completion → persisted streak/history) works end-to-end with genuine local persistence, not mocked; every reachable screen has real empty/loading/success/error states; a real subscription tier exists; accessibility and privacy are treated as shipped requirements, not polish. Anything short of this must be reported as a stated limitation in the final review, not rounded up to "done" — build verification and final review must agree on what works.

**Decision rules for later phases:**
1. If a later phase feels pulled toward re-litigating "which app to build" or expanding scope to satisfy the full portfolio ambition, it should stay narrow to dharma-trail and prefer small-and-finished over large-and-half-built.
2. Where Hindu vs. Jain practice diverges, default to neutral/shared framing; treat sect-specific content as user-selectable, not default.
3. Any generated scripture/mantra/transliteration content must be flagged for accuracy risk; when uncertain, omit rather than guess.
4. Whatever differentiator is chosen for this app's concept (mechanic, framing, structure) must be written down explicitly and durably in this app's own artifacts, since that's the only lever available to keep it distinct from its sibling app — there's no live cross-conversation check.
5. Streaks/gamification must be designed with non-punitive mechanics from the start, not bolted on later as a plain counter.
6. Local-first means no feature silently assumes network or studio audio; commit to text/timer-guided sessions or on-device TTS explicitly during design.
7. Uniqueness claims against the user's existing app are assumptions, not verified facts — state them as such rather than asserting compliance.

## Initial Discussion

Since Codex and Gemini both came back unavailable again this round, it's just Claude's solo pass — but that pass is thorough and directly hits every required output for this phase, and nothing in the conversation contradicts it.

CONSENSUS: YES

## Final Output

**Product promise:** Dharma Trail turns daily Hindu/Jain spiritual practice into a short, structured trail of guided sessions — you pick a waypoint, complete a 5-10 minute timed practice (breath meditation, japa/mantra counting, or a short reflection), and watch a simple linear path advance, with a streak that forgives missed days rather than punishing them.

**Primary user & scenario:** A Hindu or Jain adult, roughly 20s-40s, who wants a daily spiritual practice habit but doesn't have a consistent one yet, and doesn't want to be second-guessed on liturgy — they want gentle structure, not a seminary. They open the app once a day, get pointed to the next waypoint on the trail, complete a timed session, and see the trail and streak move forward.

**Core loop:** Select waypoint → guided/timed session runs (audio/haptic cues, no network dependency) → session completes and logs → streak and trail position update and persist locally → user sees progress. Four steps, deliberately small enough to build and verify in one pass.

**Hard scope boundaries (the differentiator, written down so it's durable):**
- This is a path/waypoint structure — a *trail* — not a virtual-temple/idol/puja/aarti simulation. No deity or idol interactions of any kind; that's the bright line meant to avoid colliding with the user's existing digital-temple app and its unseen sibling in this batch.
- The trail is linear and fixed-length for MVP (e.g., a 14- or 21-day starter path), rendered with plain SwiftUI shapes/SF Symbols — no branching skill-tree, no commissioned art, no multiple simultaneous trails.
- No network dependency for any session content.
- No recorded voice-over audio — sessions use either silent timer + haptics/chimes or on-device AVSpeechSynthesizer (a later phase must pick one explicitly).
- No social/sharing/leaderboard features at MVP, despite the portfolio's viral-potential ask — flagged as a post-MVP idea, not a build item, since it drags in multi-user/sync/moderation complexity this pass can't absorb.

**Measurable success criteria:**
- Cold launch to a completed, persisted session in a small, defined number of taps.
- Force-quitting mid-session doesn't lose that day's completed-session credit.
- Streak math is verifiably correct across a DST transition and a midnight rollover (real test cases, not eyeballing).
- All three waypoint types (timer meditation, mantra counter, reflection prompt) have distinct real content and work standalone.
- The mantra counter is fully VoiceOver-operable — each tap announces the running count, not just a silent visual increment.
- If build verification can't demonstrate any of the above, it gets reported as a limitation, not rounded up to "done."

## Per App Product Brief

Since Codex and Gemini are both still unavailable this round, this is Claude's solo pass again — but it directly answers every required output for this phase (target user, paid value, core loop, competitive wedge, growth angle, local-first/cloud plan) and nothing in the room contradicts it. The one place Claude pushed back on itself — the temptation to launch with a library of four or five trails — got resolved into a concrete guardrail (ship one free trail plus exactly one paid trail at launch), not left dangling. That's a real decision, not just an assertion, so I'm calling this converged rather than waiting on CLIs that may not come back this session.

CONSENSUS: YES

## Final Output

**Target user & use case:** A Hindu or Jain adult (roughly 20s–40s), often diaspora or relocated, who grew up around family religious practice but never built their own adult daily habit — and feels a quiet guilt about that gap. They don't want theology, don't want a virtual shrine, and don't want to be made to feel ignorant of "correct" ritual. They want structure to rebuild something they already believe in.

**Core loop:** Pick the next waypoint on a linear trail → run a 5–10 minute timed session (breath meditation, japa/mantra counting, or reflection prompt) → session logs → trail advances and streak updates with built-in grace days (no punitive reset) → user sees progress.

**Paid value / subscription value (functional, not cosmetic):**
- Free tier: one complete, fully unlocked 14-day "Foundations" trail — all three session types represented, no teaser-ware.
- Subscription unlocks: additional life-moment trails (grief/loss, new-parent, exam/career stress) and calendar-driven festival trails (Navratri, Paryushan); the ability to run more than one trail concurrently without losing progress on others (a structural feature, not a content unlock); and a practice-insights screen that surfaces real patterns from the user's own local session history (e.g., "you're 3x more consistent before 9am").
- MVP build discipline: ship Foundations free + exactly one second trail as the paid proof-of-value — not a library — to avoid blowing the small-and-finished mandate.

**Competitive wedge:** Secular apps (Headspace/Calm) don't know what japa or ahimsa mean beyond surface decoration; existing digital-temple apps (including the user's own, per prior assumption) center on virtual worship/idol darshan — a simulation, not a habit-building tool. Nobody has pointed Duolingo-style trail-and-streak mechanics at rebuilding inherited spiritual practice respectfully, without requiring existing expertise.

**Viral / niche growth angle:** No social feed or leaderboard (out of scope per earlier phase). Growth is niche/organic: long-tail App Store search terms ("japa counter," "mantra counter," "Jain daily practice") the big meditation apps don't target, plus diaspora word-of-mouth (temple WhatsApp groups, community subreddits/Facebook groups). One optional, user-initiated shareable moment — a "completed my 14-day trail" card — provides a passive growth hook without building a social graph.

**Local-first / cloud-ready plan:** All trail progress, session history, and streak state live in SwiftData on-device; the app is fully usable with no account. A thin repository protocol sits between views and persistence now, so a later CloudKit-backed store (for cross-device streak continuity for paying users) can be swapped in without touching business logic or view code.

**The real reason this app deserves to exist:** it treats reconnecting with dharma as a learnable, buildable skill rather than a religious performance you either already know or don't — closing the specific gap between "I feel like I should practice more" and actually doing it.

## Detailed Discussion

CONSENSUS: YES

## Final Output

The quality gate caught a real gap last round — the phase had named "notification-permission denial" as a hard requirement all the way back in the prompt-contract phase, but round 1 only ever addressed notification *content*, not what happens when permission is denied. Round 2 closes that cleanly, and nothing else got reopened in the process, so this phase is done.

Here's the full picture now:

**Notification permission handling (the piece that closes the gap):**
- Permission is requested contextually, right after the user finishes their *first* session — not during cold-launch onboarding — since that's the moment they have the most reason to trust the app and want a nudge to continue.
- If denied, that's final for the system dialog: iOS allows exactly one native prompt, no automatic re-ask. Any later attempt to re-engage the user has to be an in-app banner that deep-links to Settings (`openSettingsURLString`), not a second system prompt.
- That in-app nudge appears at most once, is permanently dismissible, and shows up after a few missed days rather than nagging on every launch — consistent with the calm, non-punitive tone the rest of the phase has been protecting.
- Hard guarantee: the core loop (pick waypoint → session → streak) is completely unaffected by permission state. No blocking permission screens, no gating the "start session" button, no dependency between `UNUserNotificationCenter` authorization status and anything except "should we schedule a reminder." Concrete test case named: fresh install, deny notifications forever, complete a full 14-day trail — nothing about that path should differ from the granted case.
- Authorization status isn't cached from the original prompt — it can change any time via Settings, so the reminder-scheduling code re-checks current status each time it schedules (e.g., on backgrounding or daily) rather than trusting a stale "granted" flag from weeks ago.

Combined with round 1's resolutions (unified daily streak across trails, silent-timer-default audio with opt-in TTS only for mantra counting, wall-clock-based session timing, UTC-anchored calendar-day crediting for timezone travel, freeze-not-delete on subscription lapse, and the privacy defaults around notification copy and log content), every required output for this phase — resolved requirements, edge cases, data/privacy implications, risk register, final assumptions — is now actually answered rather than partially gestured at. No open disagreement remains; this closes the detailed-discussion phase for dharma-trail.

## App Features

CONSENSUS: YES

## Final Output

Same story as every phase so far — Codex and Gemini stayed unavailable, so it's Claude's solo pass again. But the pass is complete against the rubric (must/should/could/won't with acceptance criteria per must-have), consistent with every decision locked in earlier phases, and the one loose thread — whether downgrading the "insights" screen guts the subscription's value proposition — was explicitly flagged for another voice to weigh in on, but no other voice showed up. Since this has been the pattern all session and there's no indication the CLIs are coming back, I'm resolving that open question myself rather than leaving the phase hanging: concurrent multi-trail progress tracking plus a genuinely full second trail's worth of content is real, structural, non-cosmetic subscription value on its own — an insights screen built on two weeks of sparse data would be dishonest more often than useful, which actively undermines the trust-rebuilding premise this app is selling. Shipping it half-baked to "pad" the paywall is a worse trade than not shipping it. That settles it: insights stays a could-have, gated behind a minimum-sample-size rule if it's ever built. Closing the phase on that basis.

**Must-have features** (each with acceptance criteria, all required to call the app done):

1. **Foundations trail (14-day linear path).** Fixed sequence of waypoints (timer-meditation / mantra-counter / reflection-prompt), rendered in plain SwiftUI shapes/SF Symbols, with locked/current/completed states. *Acceptance:* fresh install shows day 1 current, days 2-14 locked; completing day 1 unlocks day 2 on next launch with no manual navigation; trail visual state matches persisted data exactly after a force-quit relaunch, not just a clean background/foreground cycle.

2. **Three distinct session runners**, each with real content, not a shared timer with a relabeled screen. *Acceptance:* the timer session computes remaining time from a stored wall-clock end timestamp (backgrounding 3 min into a 10-min session and returning shows correctly reduced time, not reset/frozen); the mantra counter increments correctly under rapid tapping with every tap firing a VoiceOver count announcement that coalesces rather than queues under fast input (scripted rapid-tap test, not a manual check); the reflection prompt is read-only text with a single "I've reflected" action and no free-text field.

3. **Streak and completion engine**, unified across trails. *Acceptance:* a session at 11:58pm and one at 12:02am the next day credit two different calendar days; a force-quit mid-session on relaunch offers resume or discards cleanly — never silently completes; a simulated device timezone jump mid-trail neither double-credits nor breaks the streak, because calendar-day credit is frozen at completion time (real unit tests for DST and midnight-rollover, not eyeballing — if these can't be demonstrated with passing tests, that's reported as a limitation, not rounded up to done).

4. **Local persistence (SwiftData) + history/calendar view** of past completions, survives relaunch and force-quit. Called out as its own must-have (not a footnote of streaks) because it's the only way a user — or verification — can visually confirm the streak math is trustworthy, which is the emotional core of the product.

5. **Notification flow exactly as resolved in detailed_discussion:** contextual request after first session, generic non-revealing copy, permanently-dismissible in-app Settings-deep-link banner (at most once, after a few missed days) if denied. *Acceptance:* deny notifications on fresh install, complete a full 14-day trail — nothing about the core loop differs from the granted-permission path.

6. **Subscription paywall + exactly one second trail**, StoreKit 2, with concurrent-trail progress as the real testable differentiator. *Acceptance:* a subscriber can be on day 5 of Foundations and day 2 of the second trail simultaneously without either position resetting or corrupting; on lapse, both trails freeze read-only with progress intact and resume exactly on re-subscription, not from zero.

7. **Accessibility + empty/loading/error states** across every screen (trail, session, history, paywall, settings), treated as shipped requirements. *Acceptance:* Dynamic Type checked at largest accessibility sizes specifically against diacritic-bearing transliterated text (a real rendering check); every screen has a defined empty state, not just a happy-path screenshot.

**Should-have:** none carried forward beyond the must list — everything that qualified as genuinely load-bearing got folded into must-haves above; there's no "should" tier populated this round, and that's fine, not a gap.

**Could-have:**
- Practice-insights screen surfacing real patterns from local session history — downgraded from the product brief's "core subscription value," gated behind an explicit minimum-sample-size threshold before displaying any claim, built only if the seven must-haves are done and verified with time to spare.
- Optional shareable "I completed my 14-day trail" card — fully optional, no dependency on anything else.

**Won't-build (bright lines, not to be quietly reintroduced mid-build):**
- Any third or fourth trail beyond Foundations-plus-one.
- Festival/life-moment trail content (Navratri, Paryushan, grief, new-parent) — real roadmap, zero build effort this pass.
- Free-text journaling in reflection waypoints.
- Any social feed, leaderboard, or friend system.
- Working CloudKit sync (the repository-protocol seam stays architecturally required so it isn't foreclosed, but actual sync is out).
- Apple Watch companion.
- Home-screen widget or Live Activity — flagged as a genuine addition this round: it's the same "outing a private practice to anyone glancing at the phone" risk already solved for notifications, and it's not getting solved twice in one MVP pass. If built later, it inherits the same generic-copy constraint.
