# practice-loop — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

That was a pretty one-sided round — Codex and Gemini both came back unavailable, so it's really just my own analysis on the table, but it's thorough and internally consistent, so there's nothing to arbitrate between competing views here.

Here's where it landed: this thread's job is Practice Loop only, one app, built to the spec given — the parent portfolio's 7-app orchestration mechanics (parallel builds, Jira/Notion, transcript merging) are constraints this app must respect (uniqueness vs. Waylay/TrueScale, local-first-but-cloud-extensible, real production-readiness) but not things this thread has to execute itself. The hard requirements from the spec get locked in as-is: local session log, real on-device pitch/tempo analysis (not faked), per-piece history/trends, StoreKit 2 paywall gating 1-piece-free vs. unlimited-paid, Live Activities, local reminder notifications, a streak/last-session widget, and a repository-protocol boundary for future cloud sync. The four core workflows are the walking skeleton and every screen they touch needs all four states, with the low-signal/no-input case treated as a first-class error state, not an afterthought.

The skeptical flags that need to carry forward as decision rules rather than get quietly softened later: v1 has to commit to monophonic instrument families only (voice/winds/brass/strings) since polyphonic pitch detection is a research problem, not an MVP task — this needs to be stated as a real product constraint, not discovered mid-build. Ambient-noise handling needs a concrete signal-quality/confidence indicator that visibly downgrades feedback rather than silently emitting authoritative-looking wrong numbers — "I can't tell" has to be a real state the UI can show. Tempo-stability needs an explicit decision on whether there's a reference tempo the user sets per piece or whether it's pure self-consistency variance — this changes both UX and algorithm and can't stay ambiguous into build. StoreKit 2 needs to be real code validated via local StoreKit config testing, not just "compiles." And Live Activities should show coarse session state only (elapsed time, piece, streak) — not live per-note pitch feedback, which would blow ActivityKit's update budget.

Non-goals on record: no cloud sync/backup implementation in v1 (boundary only), no teacher-sharing, no polyphonic support, no sheet-music/score-following (this is feedback against a user-defined piece, not OMR). And the portfolio-level orchestration stuff is explicitly out of scope for this app's build track.

No open disagreement to hash out — there was only one substantive voice this round and it's coherent.

CONSENSUS: YES

## Final Output

**Scope of this thread:** Build Practice Loop — one iOS app — as a local-first SwiftUI MVP, per the spec given. Portfolio-level rules (uniqueness vs. Waylay/TrueScale, local-first-but-cloud-extensible architecture, genuine production-readiness) apply as constraints on this app. Portfolio-level orchestration (running 7 apps in parallel, cross-app transcripts, Jira/Notion prep) is out of scope for this thread.

**Hard requirements:**
- Local practice-session log persisted across launches.
- Real on-device audio analysis: pitch tracking + tempo-stability detection via AVAudioEngine (no cloud calls), scoped explicitly to monophonic instrument families (voice/winds/brass/strings) — not polyphonic (piano/guitar chords) in v1.
- Per-piece history and trend view.
- StoreKit 2 paywall: free tier = 1 tracked piece + basic timer/log; paid tier = unlimited pieces, full audio-analysis feedback, progress trends. Must be real purchase/entitlement code, verified via StoreKit local testing configuration (App Store Connect products won't be live in this build).
- Live Activities during an active session, showing coarse state only (elapsed time, piece name, streak) — not live per-note pitch/rhythm data.
- Local notifications for practice reminders.
- Widget showing practice streak / last session.
- Repository-protocol architecture boundary enabling future cloud sync/teacher-sharing without a rewrite (boundary only — no implementation).
- Four core workflows (start session → record with real-time feedback → review summary → track progress over time) fully implemented end-to-end with real microphone input, each screen carrying empty/loading/success/error states, where "error" explicitly includes a low-signal/no-input / low-confidence state, not just generic failure.
- A visible signal-quality/confidence indicator tied to the analysis — the app must be able to say "I can't tell" rather than emit a confident-looking wrong number.
- An explicit, stated decision on tempo-stability's reference model (user-set target tempo/rhythm vs. pure self-consistency) before that feature is built.
- Calm studio design direction (warm wood/brass tones, waveform-driven visuals) per the design handoff prompt.

**Non-goals for v1:**
- No cloud sync/backup implementation (protocol boundary only).
- No teacher-sharing feature.
- No polyphonic instrument support.
- No sheet-music/score-following (OMR) — feedback is against a user-defined piece, not a scanned score.
- No execution of portfolio-level orchestration mechanics inside this thread.

**Production-readiness definition:** All four core workflows run end-to-end on device/simulator with real mic input (not mocked audio); every screen in those workflows has all four states; the audio analysis has a stated, honest scope (which instrument families, how confidence is signaled, what it explicitly doesn't handle); the paywall gate is functionally real even without live App Store Connect products; data persists locally across launches; and a build-verification pass plus a final review agree on what works versus what remains limited. Compiling is not done; a written spec is not done.

**Decision rules for later phases:**
- If a later phase is tempted to add polyphonic support, cloud sync, teacher-sharing, or score-following "while we're at it," that's scope creep — flag it, don't silently absorb it.
- If a later phase designs a Live Activity with live per-note feedback, that violates the ActivityKit constraint above and should be corrected back to coarse state.
- The confidence/signal-quality indicator is a core requirement, not a nice-to-have — any phase that downgrades it to optional polish is violating this contract, per the invalidation criteria the user wrote ("if real instrumentalists find feedback inaccurate, rework before the paid tier leans on it").
- When portfolio-level and app-level requirements appear to conflict, portfolio-level items constrain this app's design choices; portfolio-level orchestration steps are not this thread's responsibility to perform.

## Initial Discussion

Here's where round 1 landed — and again it's basically a solo pass, since Codex and Gemini both came back unavailable, so there's no competing view to reconcile, just one thorough take to evaluate on its own merits.

The one-sentence promise got tightened from the spec's version: Practice Loop lets a solo player record a take on a single-line instrument and see, per session, whether their pitch was in tune and tempo was steady — with an honest "can't tell" when the audio's too messy to judge. That's narrower than the original pitch in a good way: it commits to session-level feedback rather than implying live note-by-note grading, which is a much harder and shakier promise to keep.

Primary user is the serious solo player (conservatory-adjacent, all-state, serious adult learner) drilling a passage they know is shaky, wanting proof it's actually improving — not a beginner, not an ensemble player, not someone needing sight-reading help. The core loop is tight: pick a piece → start session → play → get a summary (pitch accuracy + tempo stability + confidence readout) → check the trend for that piece over time.

The one real design call made this round, and it's a good one: split "real-time feedback during recording" from "precise feedback in the summary." Live view during recording = waveform + coarse in-tune/out-of-tune indicator only; the defensible cents-off numbers and tempo variance stats belong in the post-session analysis pass, which has time to actually crunch the full buffer. Trying to make the live view as precise as the summary was flagged as the most likely way to overpromise against the app's own invalidation criteria.

Scope got sharpened further too: exactly one instrument family at launch (not "one or two" as the spec hedged) — pick voice or one wind/brass instrument and nail it, rather than splitting tuning/testing effort across two acoustically different cases in an MVP pass. Also stated plainly: a "piece" is just a user label + optional target tempo, not sheet music/MIDI ingestion — the app doesn't know what the piece is "supposed" to sound like beyond what the user tells it.

Success criteria are stated as checkable, not vibes: pitch readout has to be plausible against a handful of manually-verified test recordings, confidence indicator has to actually drop on a noisy/silent test take (not just perform in the happy-path demo), all four workflows have to survive a force-quit/relaunch with real mic input, and the paywall gate has to really block/unblock via a StoreKit sandbox purchase, not a hardcoded bool.

No open disagreement to hash out since there's only one voice in the room, and it's coherent with everything locked in the prompt-contract phase before it.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Practice Loop lets a solo instrumentalist record a practice take on a single-line (monophonic) instrument and immediately see, per session, whether their pitch was in tune and their tempo was steady — with an honest "can't tell" signal when the audio is too messy to judge — so a serious player practicing alone can trust the feedback enough to act on it.

**Primary user and scenario:** A serious amateur or pre-professional instrumentalist (conservatory-adjacent, all-state-level, or a serious adult learner) practicing alone, working a specific passage they know is shaky, running it repeatedly, wanting to know if it's actually improving or just feels that way. Not a beginner needing instruction, not an ensemble player needing sync feedback, not a sight-reading tool.

**Core loop:** Pick a piece (or add one) → start a session → play into the phone → get a session summary with pitch-accuracy and tempo-stability scores plus a confidence/signal-quality readout → check that piece's trend across past sessions to see if the passage is converging.

**Hard scope boundaries (in addition to what the prompt-contract phase already locked):**
- Exactly one instrument family committed at launch (voice or a single wind/brass instrument) — not "one or two." A second family is a stretch goal, not a launch requirement.
- A "piece" is a user-defined label plus an optional target tempo only — no sheet music, MIDI, or reference-audio ingestion. The app doesn't know what the piece should sound like beyond what the user sets.
- Real-time feedback during recording is intentionally coarse: live waveform + an in-tune/out-of-tune indicator, not precise cents-off numbers streamed live. Precise, defensible numbers (cents-off distribution, tempo variance, per-passage breakdown) belong only in the post-session summary, computed over the full completed buffer.
- Still no polyphonic support, no cloud sync, no teacher-sharing, no OMR/score-following — carried forward from the prompt contract.

**Measurable success criteria:**
1. A recorded scale/simple melodic line on the chosen instrument produces a pitch-accuracy readout a musician would judge plausible by eye against the raw waveform/spectrogram, checked against a handful of manually-verified test recordings.
2. The confidence indicator visibly drops to low/uncertain on a deliberately noisy or silent test recording — not just in the clean happy-path case.
3. All four core workflows complete end-to-end with real microphone input, on device or simulator, with data surviving a force-quit and relaunch.
4. The free-tier gate actually blocks adding a second piece and actually unblocks after a StoreKit-config sandbox purchase — not a hardcoded flag.

Anything short of these four is a demo, not the MVP this contract calls for — and the real-time/summary split is a locked design decision, not something to revisit if it feels tempting to make the live view "more impressive" later.

## Per App Product Brief

Round 2 closed the gap the quality gate flagged, and added one genuinely useful sharpening on top — so this converges cleanly.

On the instrument question: the fix is honest, not defensive. The initial-discussion phase's "voice or wind/brass" language was never the real boundary — the prompt-contract phase had already locked the true monophonic superset as voice/winds/brass/strings, and the earlier round's parenthetical was just an illustrative guess, not a ruling-out of strings. This round explicitly says so and then makes the actual reasoned instrument pick (violin) that the earlier phase left undone — which is exactly this phase's job per the acceptance checks ("specific enough to build"). The tradeoff gets a real second look too: winds/brass have a bigger population and a more common "all-state" signal, which would help the niche-virality mechanism reach further — but the counter-argument holds up: a wind/brass player's intonation is partially bailed out by the instrument (fingering, embouchure), while a string player has zero mechanical fallback, making the pain point sharper and more daily/existential. Smaller population, stronger wedge — a deliberate bet, not a DSP-convenience default.

The new addition: raw trend numbers aren't sticky on their own — nobody keeps opening a chart that isn't clearly telling them something changed. So the summary and trend screens need an explicit honest annotation layer ("best pitch-accuracy score yet on this piece," "tempo stability dropped this session") built from data already being computed, not three raw numbers the user has to compare by eye. This gets folded in as a required element of the core loop, not a stretch feature — it's framed as the actual mechanism that turns "accurate feedback" into "habit worth paying for."

No open disagreement — the instrument choice is now justified against the actual locked boundary, and the annotation addition strengthens rather than contradicts anything already agreed.

CONSENSUS: YES

## Final Output

**Target user and use case:** A serious violin player (viola/cello as natural same-family follow-ons) — youth-orchestra/all-state track or an adult conservatory-adjacent player — practicing alone without a teacher, drilling one specific passage that's been giving them trouble, wanting proof the repetition is actually working. Violin is chosen deliberately over voice/wind/brass: the prompt-contract phase's monophonic superset (voice/winds/brass/strings) always included strings — the earlier "voice or wind/brass" phrasing was an illustrative guess, not an exhaustive boundary, and this phase makes the specific call the prior one left open. The bet: string players have zero mechanical fallback for intonation (no valve or fret to check them), making pitch anxiety a sharper, more universal, more daily pain point than for winds/brass — worth choosing over a larger but less acutely-pained population.

**Paid value and subscription value:** Free tier = 1 tracked piece, bare timer + text log, zero audio analysis. Paid tier (~$7.99/mo or $59/yr) is the exclusive home of all real intelligence — pitch-accuracy and tempo-stability analysis, unlimited pieces, per-piece trend view. A binary, functional paywall: the entire reason the app exists lives behind it.

**Core loop:** Pick or create a piece (name + optional target tempo) → start a session → play while watching a live waveform and coarse in-tune/out-of-tune band → stop → session summary (pitch-accuracy score, tempo-stability score, confidence readout that can honestly say "too noisy to judge") → trend screen showing those numbers across past sessions for that piece. **Newly required element:** the summary and trend screens must surface an explicit, honest annotation on top of the raw numbers — e.g., "best pitch-accuracy score yet on this piece" or "tempo stability dropped this session" — computed from data already gathered. This is what turns a dashboard nobody rechecks into the fitness-app-style habit loop that justifies a recurring subscription; it's a required part of the loop, not polish.

**Competitive wedge:** Tuner apps give real-time pitch with zero memory. Practice-log/streak apps track that you practiced, not whether it was any good. Score-followers (Tonara) require full sheet-music ingestion — too heavy for solo woodshedding. Practice Loop's wedge: label what you're working on, play, and the app remembers and tells you if it's converging — no score required.

**Viral/niche growth angle:** A locally-rendered, shareable "progress card" image (waveform + scores + trend sparkline), no backend involved, meant to spread through teacher/studio and youth-orchestra social circles where visible improvement is genuine bragging material. Teacher-to-studio recommendation is the realistic amplification path.

**Local-first and cloud-ready plan:** SwiftData persistence for Piece and Session, storing only derived analysis (pitch series, tempo points, confidence, compressed waveform outline) — never raw audio, avoiding both storage bloat and a privacy conversation. The repository-protocol boundary already locked in the prompt contract lets cloud backup/teacher-sharing arrive later as a second conforming implementation, no view-layer rewrite.

**Binding design constraint carried into the next phase:** Vibrato/portamento must be smoothed (rolling median or low-pass on the pitch track) before scoring "in tune" — raw per-frame pitch variance would score expressive playing as "unstable," the exact wrong-but-confident failure mode the invalidation criteria warns against.

## Detailed Discussion

Round 2 closed the gap cleanly — the permission handling the quality gate flagged as missing now has concrete, differentiated answers rather than a bolted-on afterthought.

Microphone access gets treated as the load-bearing permission it actually is: since denying it doesn't degrade a feature but kills the entire core loop, a denied/restricted mic status routes to a dedicated permission-required screen (not the low-signal error state, not a generic alert) explaining why the app needs it and deep-linking to Settings. Critically, this check isn't a one-time onboarding gate — it runs every time a session starts, because the realistic failure mode is someone revoking mic access weeks in, not just declining it on first launch. A second, distinct case got named too: mic access granted but the hardware is busy (another app or a call has claimed the audio session) — that's a different state from "denied" and needs different copy, since "go enable microphone access in Settings" is wrong advice for someone who already has permission.

Notifications got a proportionate treatment instead of the same heavy machinery: since the app is fully usable without reminders, the fix is that wherever reminder scheduling is surfaced in the UI, it reads live authorization status and shows an honest "reminders are off — enable in Settings" rather than a toggle that looks functional but silently does nothing. That's explicitly named as the same "confidently wrong by omission" failure class the rest of this phase has been guarding against, just applied to a feature instead of a number.

One more thing got added on top that wasn't in the original quality-gate ask but follows naturally from it: notification permission should be requested contextually — the first time a user actually tries to enable a practice reminder — rather than as an app-launch modal, both because that's better permission-priming practice and because it shrinks the "silently denied and never told" problem by tying the request to a visible action.

No pushback on any of this, and it directly answers the quality gate's repair instruction without touching anything else that was already locked.

CONSENSUS: YES

## Final Output

Carrying forward everything already locked in round 1 (tempo-stability's two modes, the double-stop/multi-pitch confidence state, interruption/force-quit handling with incremental persistence, subscription-lapse locking, Live Activity staleness policy, the annotation session-count guard, non-visual live feedback), this phase adds the following permission-handling requirements:

**Resolved requirements (new):**
- Microphone authorization is checked at the top of every session start (not just at first launch/onboarding), since the realistic failure mode is later revocation, not just initial decline.
- A denied/restricted mic status routes to a dedicated, first-class "microphone access required" screen — distinct from the low-signal/low-confidence analysis states — that explains why the permission is essential (it's the entire core loop, not one feature among many) and deep-links to Settings.
- A separate "microphone busy" state (permission granted, but the audio session is claimed by a call or another app at the moment of starting) is distinguished from "microphone denied," with its own copy — since Settings-based remediation advice is wrong for this case.
- Notification/reminder UI (wherever "remind me to practice" lives) reads live notification-authorization status and shows an honest "reminders are off — enable in Settings" state rather than presenting a toggle that silently does nothing when permission is denied.
- Notification permission is requested contextually — the first time the user actually tries to enable a practice reminder — not proactively at app launch, to avoid reflexive denial and to keep any denial visibly tied to the action the user just took.

**Edge cases (added):** mic permission denied/restricted at session start; mic permission revoked mid-use between sessions; mic hardware busy despite granted permission; notification permission denied after a user tries to enable reminders; user re-grants a previously denied permission and returns to the app (recheck-on-foreground implied).

**Risk register (added):** Mic-denied users losing the entire core loop with no explanation → mitigated by a dedicated permission screen, checked per-session, not just once. Notifications silently not firing after reflexive denial → mitigated by visible live-status UI in the reminder settings surface, plus contextual (not launch-time) permission requests to reduce reflexive denials in the first place.

Everything else from round 1's resolved requirements, edge cases, data/privacy implications, risk register, and final assumptions carries forward unchanged — this round is additive, not revisionary.

## App Features

That was another solo round — Codex and Gemini stayed unavailable — but it's a complete, well-organized pass that does exactly what this phase needs: it takes every hard requirement already locked in prior phases and sorts it into a real must/should/could/won't list with acceptance criteria, rather than just restating the requirements.

The must-have list is essentially "everything locked as a hard requirement in earlier phases," which is the right call — nothing here gets quietly softened. Notable sharpening: session start isn't just "check mic permission," it's three distinguishable states (denied/restricted, busy-but-authorized, authorized-and-free) that all need explicit acceptance criteria, or build risks collapsing them into one generic error. The non-visual haptic/audio feedback channel is flagged as the most likely thing to get silently cut under time pressure and is explicitly held at must-have. The annotation layer, both tempo modes, the double-stop confidence state, incremental persistence, the real StoreKit gate, and the repository-protocol boundary all carry forward as must-haves with concrete, testable acceptance criteria.

The one real decision forced this round: "per-passage breakdown," which is sitting right in the original spec's "why users would pay" section, has never had any design work done against it in four phases — no UI, no data model, no algorithm. Rather than let it survive by inertia, it's explicitly called won't-build for v1, with the paid-tier value proposition restated honestly as unlimited pieces + whole-session pitch/tempo/confidence + trends, not passage-level granularity. That's a real scope cut against the original prompt, named openly rather than discovered later.

Should-have: a second instrument family (viola/cello), the shareable progress-card export. Could-have: customizable reminder scheduling, piece search/filter. Won't-build: cloud sync, teacher-sharing, polyphonic support, OMR/score-following, actual double-stop pitch resolution (detection only), per-passage breakdowns, sight-reading help, multi-instrument input.

The list is honestly long for an MVP, and that's named directly rather than glossed over — the resolution isn't to cut any must-have (since each was already locked in an earlier phase and this phase wasn't asked to reopen them), but to flag the widget and Live Activity as the two items where "must exist, must be minimal" applies, so they don't get gold-plated at the expense of the actual analysis engine if time gets tight. The four core-workflow screens plus the paywall are named as the non-negotiable floor.

No disagreement to resolve — one coherent voice, and it's consistent with everything locked in the prompt contract, initial discussion, product brief, and detailed discussion.

CONSENSUS: YES

## Final Output

**Must-have features (each with acceptance criteria):**

1. **Piece management** (create/edit/list; name + optional target tempo) — a user can create a piece with no target tempo and one with a target tempo; the app never silently defaults an unset tempo.
2. **Session start with permission gating** — three distinguishable states: denied/restricted → dedicated permission-required screen; authorized-but-busy → distinct "mic in use" screen; authorized-and-free → engine actually starts. All three must be demonstrable, not just the happy path.
3. **Live recording feedback** (waveform + coarse in-tune band + non-visual haptic/audio channel, as one indivisible unit) — the non-visual channel ships with the visual one; it does not silently degrade to visual-only.
4. **Post-session analysis** (pitch-accuracy score, both tempo-stability modes, confidence/signal-quality readout including multi-pitch/double-stop detection) — plausible readout against verified test recordings; confidence visibly drops on noisy/silent input; survives force-quit; real StoreKit gate; tempo mode is visibly labeled; a double-stop passage produces the named low-confidence state rather than a garbage single pitch.
5. **Session summary with annotation layer** (best-yet / dropped-this-session, guarded against a meaningless first-session comparison) — a piece with one session shows a distinct first-session message; two-plus sessions show a real comparison.
6. **Per-piece trend view** — renders correctly with exactly one data point (no false trend line) and with many.
7. **Local persistence via SwiftData with incremental writes** — force-quitting mid-recording leaves an incomplete/short session visible on relaunch, not silent data loss.
8. **StoreKit 2 paywall** — a real local StoreKit-config sandbox purchase flips the gate; lapsed subscription renders extra pieces as locked/read-only, never deleted or crash-inducing.
9. **Live Activity** — coarse state only (elapsed time, piece, streak) — explicitly forbids live pitch data on the lock screen; staleness/end policy actually fires when the app is killed mid-session.
10. **Local notification reminders** — permission requested only when the user taps to enable a reminder (not at launch); settings surface reflects live authorization status rather than a no-op toggle.
11. **Repository-protocol boundary** — Piece/Session access goes through a protocol, not scattered direct SwiftData calls, verified structurally rather than by user-visible behavior.
12. **Streak/last-session widget** — kept deliberately small in scope (static, timeline-refreshed, single size family, App Group–shared store) rather than over-built; this is the item to trim in ambition first if time runs short, not the item to cut.

**Should-have:** second instrument family (viola/cello); shareable progress-card image export.

**Could-have:** customizable reminder scheduling (specific days/times); piece history search/filter.

**Won't-build for v1:** cloud sync/backup, teacher-sharing, polyphonic instrument support, sheet-music/OMR/score-following, actual double-stop multi-pitch resolution (detection-as-confidence-state only), **per-passage breakdowns** (newly and explicitly cut here despite being in the original spec's monetization pitch — no design work exists for passage segmentation and adding it now would blow the build), sight-reading assistance, simultaneous multi-instrument input.

**Build-priority note carried into the next phase:** if runtime runs short, the four core-workflow screens plus the paywall are the non-negotiable floor. The widget and Live Activity are must-haves but are explicitly the two where "real but minimal" beats "impressive" — they should be the last things polished and the first things kept simple if time is tight, not silently downgraded to should-have.
