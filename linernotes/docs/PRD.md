# linernotes — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

## Wrap-up

Codex and I are actually landing in the same place, not arguing. Codex wrote the core execution contract — build Linernotes as a real standalone SwiftUI app, local-first, with the full create → add tracks → record liner notes → collaborate via share sheet → play loop, judged as a commercial product not a demo. I didn't push back on any of that; I mostly stress-tested it and turned soft spots into explicit decision rules: how exports handle copyrighted audio (metadata/art/voice-notes only, never baked-in licensed audio — same conclusion Codex reached independently), how "collaboration" behaves when there's no real merge logic (fork/linear-handoff only, concurrent edits explicitly unsupported), that Widgets/Live Activities are ceiling features not required for "done" since the spec's own Core Workflows section doesn't list them, that the free-tier limit needs a real enforced gate rather than a decorative paywall screen, and a concrete definition of what "production-ready" excludes (no live StoreKit, no CloudKit, no App Store submission artifacts). Gemini didn't weigh in (CLI unavailable). There's no open disagreement to resolve — my contribution sharpens Codex's contract rather than conflicting with it, so I'm folding it in as one merged output.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above in both Codex's and Claude's round-1 messages (the full `linernotes` spec plus the parent portfolio prompt with its 9-app uniqueness/production/output-directory rules). Treat that text as the source of truth; everything below is its execution contract.

**Hard requirements**
- Standalone SwiftUI iOS project, its own folder under `/Users/pchordia/Documents/iOS-App-Factory`, judged as a shippable product, not a screen demo.
- Local-first, deterministic state, real persistence that survives relaunch — no server dependency for the core loop.
- Full core loop must actually work end-to-end: create occasion/mixtape → add tracks from library (MusicKit) → record per-track text/voice liner note → play the assembled mixtape experience → hand off/export via share sheet.
- MusicKit integration, Share Sheet, Widgets, and Live Activities are named product requirements — must land in at least a minimal, real (not stubbed) form, but per the spec's own "v1 Build Scope"/"Core Workflows" they are not required to be feature-complete to call the MVP done (see decision rules).
- Free-tier limits (1 active project, 5 tracks, no collaborators) must be a real, testable, enforced entitlement gate — not a decorative paywall screen.
- Every reachable workflow needs empty/loading/success/error states; permission handling for microphone and music-library access with graceful denied/interrupted states.
- Accessibility (VoiceOver labels on custom cassette/waveform visuals), privacy usage strings, persistence, and automated tests around state/serialization logic are mandatory deliverables, not polish.
- Must stay legally honest about music rights: never claim to export a file containing actual copyrighted/licensed audio.

**Non-goals**
- Not a streaming service, social feed, open-ended cloud collaboration tool, AI-first journaling app, or generic playlist/scrapbook app.
- No CloudKit real-time sync in this build (explicitly future roadmap only).
- No production StoreKit wiring or App Store submission artifacts required.
- No real conflict/merge resolution for collaborators — share-sheet exchange is fork-or-linear-handoff only; concurrent divergent edits are explicitly unsupported in v1, not silently mishandled.
- Speech-to-text is optional/accessibility-only, never a core pitch element.
- Do not let the emotional/design ambition outrun platform reality — no faked export capability.

**Production-readiness definition**
Compiles and runs without crashing across all four UI states on every core screen; MusicKit and microphone permission-denied paths handled explicitly; recording survives interruption (call, Siri) without data loss; projects/tracks/notes persist reliably across relaunch; entitlement gate actually blocks the 2nd project, 6th track, and collaborator invite when unpaid; accessibility labels present on custom-drawn UI; privacy strings accurate; core state and serialization logic covered by tests; visual polish consistent with the "premium cassette keepsake" design direction. Explicitly excluded from the bar: live CloudKit sync, production StoreKit/App Store submission config, and full Widget/Live Activity feature depth (minimal working versions suffice, with any gaps stated plainly in the final review rather than hidden).

**Decision rules for later phases**
1. Prefer a smaller, fully-working gifting loop over a larger half-built one.
2. Exports are always metadata/art/text/voice-note artifacts (plus deep links back into Apple Music); never a rendered file containing licensed audio. In-app "watch/keepsake" playback may play audio live via MusicKit, but nothing licensed gets baked into a shareable file.
3. Collaboration conflicts are avoided by design (fork or linear handoff), not resolved by merge UI — document this as a stated limitation, not a silent gap.
4. Core Workflows/v1 Build Scope (create, add tracks, record note, invite, play) is the authoritative floor for "done"; MusicKit/Widgets/Live Activities/Share Sheet are required to exist in real minimal form but their depth is ceiling, not floor — any shortfall must be named explicitly at review, not dropped quietly.
5. The free/paid entitlement gate must be real and enforced locally even without live payment processing wired up.
6. When any later phase proposes adding cloud collaboration, dropping MusicKit, flattening the design into a generic list, or hand-waving the export/rights constraint, that's a contract violation and should be flagged, not adopted.
7. Cross-batch uniqueness against the other 8 apps in this portfolio must be treated as an explicit checklist item at the design-review checkpoint, since this phase can't verify it alone.
8. The throughline to protect above all: the "why this song matters" layer must feel inseparable from the music itself, not bolted on — every later design/architecture choice should be checked against whether it strengthens or dilutes that fusion.

## Initial Discussion

## Wrap-up

Codex and I are basically saying the same thing from two different angles — Codex framed the product vision (occasion-first, ceremonial, not "make a playlist"), and I stress-tested it from a build-quality/QA angle. No real disagreement surfaced. Where I added something Codex didn't explicitly say: retention/DAU is the wrong yardstick for this app (bursty, one-and-done usage is expected, not a failure signal), speech-to-text should be cut entirely from v1 rather than half-built, and the single hardest test to hold this MVP to is "force-quit mid-recording, does the project survive relaunch." Codex's framing that the first screen must start with occasion/recipient rather than a search box, and that "share" must never imply the recipient gets a file with actual songs baked in, both fold cleanly into what I already had as non-negotiable (no baked audio export, no merge resolution). Gemini still unavailable. This reads as genuine convergence, not forced.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Linernotes lets someone build a mixtape for one specific person and occasion — picking songs from their own library and recording a short voice or text note on why each song matters — then hand it off as a playable, story-rich keepsake, entirely on-device with no server.

**Primary user and scenario:** A person with an existing Apple Music library who has one specific recipient and moment in mind (birthday, breakup, anniversary, new baby, long-distance goodbye), sitting down once for maybe 20–40 minutes to build something deliberate and ceremonial — not a daily-use social or playlist app. Usage is expected to be bursty and occasion-triggered, not habitual; DAU/retention framing is the wrong lens for judging this product's health.

**Core loop:** Create an occasion-bound mixtape project → add tracks from the library via MusicKit → record a voice or text liner note per track explaining why it matters → arrange/sequence and preview playback locally → optionally hand off to one collaborator via share sheet, or share the finished project as a keepsake to the recipient.

**Hard scope boundaries (non-goals):** No server, no accounts, no real-time/cloud collaboration, no social feed, no group chat, no generic daily playlist tool, no merge resolution for concurrent collaborator edits (fork or linear handoff only), and — non-negotiable — never export or bundle actual copyrighted/licensed audio into a shareable file; shared artifacts are metadata/art/text/voice-notes plus links back to the music. Speech-to-text stays out of v1 entirely rather than shipped half-working. Widgets/Live Activities exist only in minimal form and must never threaten the core loop.

**Measurable success criteria:** A first-time user can go from no project to a playable finished mixtape (with at least one recorded voice note) with zero crashes, zero silent data loss, and no unhandled permission-denied dead ends (mic, music library). The free tier ceiling (1 project, 5 tracks, no collaborators) visibly and actually blocks the user rather than just displaying a paywall. A project survives force-quit at any point (mid-recording, mid-arranging, right after adding a track) and reopens intact. A recipient opening a shared project can understand the occasion, track order, and the meaning behind each song in under a minute.

## Per App Product Brief

Consensus check: both Codex and I are describing the same product from complementary angles — Codex nailed down the monetization logic and data-model discipline, I focused on the specific user moment and the recording-flow UX risk. No contradictions surfaced. Both agree free tier is a "how many people do you care enough about" wall rather than a feature-gate, both agree the growth loop is the recipient-opens-keepsake moment (not broad virality), both agree the cloud path is "clean serializable data model now, CloudKit later" with zero networking in v1, and both independently landed on the same warning: if the record-a-note step has any friction, users skip notes and the whole ceremonial pitch collapses. Gemini still unavailable. This reads as real convergence, not forced — nothing here needs a second round.

CONSENSUS: YES

## Final Output

**Target user and use case:** Someone with an existing Apple Music library who has one specific person and one specific occasion in mind (birthday, breakup, anniversary, new baby, someone moving away) and is willing to spend 20–45 minutes making a deliberate, ceremonial gift — not a daily social or playlist user. They're not buying convenience; they're buying a better emotional delivery mechanism than "here's a playlist link."

**Paid value and subscription value:** Free tier (1 active project, 5 tracks, text + basic voice notes, solo only, local playback, shareable keepsake) is generous enough to fully experience the ceremony once and prove the concept works. The paywall isn't a feature-gate, it's an occasion-count gate — it hits the moment you have a second person or moment to make something for. Paid unlocks unlimited mixtape projects, collaborators, more than 5 tracks, higher-fidelity voice recording with retakes/trimming and real waveform art, premium cover-art themes, and a permanent archive of finished projects. The subscription has to mean "this becomes my ongoing tool for making music gifts," not "I bought some cassette skins" — waveform art and themes are polish that make paid feel like the real keepsake, but the actual reason to pay is unlimited recurring use across relationships and occasions.

**Core loop:** Name the occasion and recipient → pull tracks from your library via MusicKit → record or type why each track is there (instant-start recording, visible waveform while talking, one-tap re-record, preview before commit) → arrange sequence → preview it playing back as a finished experience, not a filled-out form → hand off via share sheet, either as a finished keepsake or an open invite to one collaborator who adds their own track-plus-note to the same occasion.

**Competitive wedge:** Everything adjacent is either a playlist (no room for "why"), a scrapbook/slideshow app (not built around sequence + audio), or a voice-memo app (no music, no occasion framing). Linernotes is the only tool that fuses song, sequence, and spoken reason into one artifact that plays back as a single ceremonial experience — it takes the ritual of "explaining your music to someone" seriously enough to design the whole flow around it instead of bolting a comment box onto a playlist.

**Viral/niche growth angle:** Occasion-chain growth, not broad virality: a recipient experiences a finished mixtape, understands it immediately, and is primed to become a future maker for someone else. The single highest-leverage growth surface is the moment a recipient with no app installed opens the shared keepsake — that preview must make the "made with Linernotes" origin obvious and "make your own" one tap away, or the only organic growth loop this app has gets thrown away. No streaks, no engagement-bait notifications — those would be dishonest to what this product is.

**Local-first and cloud-ready plan:** Everything (projects, sequencing, notes, artwork, recorded voice files) lives fully on-device with aggressive autosave so force-quit/interruption never destroys work. Collaboration in v1 is explicit share-sheet file handoff — linear turn-taking or forks only, no merge logic, no silent last-write-wins. Data model is shaped now for a cloud future without paying its cost yet: project, track entry, liner-note attachment, sequence, and contributor identity as distinct, serializable, stable-ID records — so CloudKit sharing/sync can be layered on later without a rewrite, but no actual networking exists in v1.

## Detailed Discussion

## Wrap-up

Codex and I aren't in tension here — Codex nailed down the concrete requirement shape (three real modes: authoring, handoff, keepsake playback; specific rules for what "export" means; specific edge-case UI answers for permission-denied, interrupted recording, unavailable tracks, unfinished-project sharing) while I went hunting for the failure modes that don't show up until a project has *lived* for a while: track decay over weeks, orphaned audio files from re-recording, storage/backup tradeoffs, what happens to a lapsed subscriber's existing content, untrusted/malformed imported project files, and accessibility gaps in the two riskiest custom controls (waveform scrubber, drag-reorder). Nothing I raised contradicts anything Codex said — it's additive depth on the same model. The one thing I flagged as genuinely open (what the recipient actually sees when most of their tracks won't play) has an answer implicit in Codex's "keepsake is still understandable as a story object" framing plus my "cache metadata/artwork at add-time" point — I'm resolving it explicitly below rather than punting it to another round. Gemini still unavailable. This converges cleanly.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- Three real, working modes: **Authoring** (create occasion/recipient, choose cover theme, add tracks via MusicKit, attach voice-or-text note per track, reorder, preview), **Handoff** (share a finished keepsake package or a single-collaborator invite package via share sheet), **Keepsake playback** (reopen a project into a sequenced, story-forward playback experience).
- Collaboration is exactly one contributor at a time, file-based, with explicit fork-or-linear-ownership-transfer — never merge, never shared live editing.
- "Export"/"share package" is defined precisely: project metadata, cover treatment, track identifiers + cached metadata/artwork, sequence, contributor info, text notes, and locally recorded voice notes. Never bundled licensed audio. Recipient playback of the actual songs happens live via MusicKit if they have access.
- Free-tier gate is enforced locally and visibly at the point of action (creating project 2, adding track 6, adding a collaborator), not just displayed as a paywall screen.
- "Permanent archive" for paid users means unlimited local finished projects — not cloud backup, not export powers beyond what's legally honest.
- Text notes are first-class, not a fallback-with-shame option when mic access is denied.
- Reorder and waveform-scrub controls require a non-gesture accessible path (e.g., VoiceOver "move up/move down" actions) as a hard requirement, not a nice-to-have.

**Edge cases (with resolved behavior)**
- Music permission denied → clear explanatory state with retry, not a dead end; app remains usable for starting/understanding the flow.
- Mic permission denied → text notes remain fully first-class.
- Recording interrupted (call, Siri, backgrounding) → recoverable draft state, never silent loss.
- Re-record → old audio file is deleted immediately, not left as a recoverable orphan (privacy + storage).
- Track deleted from a project → its voice file is deleted with it; single-owner file lifecycle plus an app-launch/background sweep garbage-collects any audio file no project currently references, as a safety net for crash-during-write cases.
- Track becomes unavailable later (catalog churn, subscription lapse, different region/Apple ID) → metadata/artwork is snapshotted locally at add-time so the track card always renders name/artist/art; playback state shows an explicit "unavailable to play here" with a deep link to open in Apple Music, never a stuck spinner.
- **Recipient-side unavailable tracks (resolved as the open item from this round):** design assumes most recipients will see "open in Apple Music" rather than inline playback as the *default* case, not a degraded edge case — the keepsake has to read as a complete, meaningful story (art, sequence, and the liner note text/voice, which is 100% local and always plays) even when zero referenced songs resolve for that recipient. The voice/text note is the part of the gift that never depends on catalog availability.
- Sharing an unfinished project → recipient experience must clearly distinguish "you're invited to contribute" from "here's your finished gift" up front.
- Force-quit mid-recording or mid-reorder → autosave makes this a non-event (carried forward from earlier phases, reaffirmed here).
- Lapsed subscription with content already over the free ceiling → existing projects/tracks remain viewable and playable (read-only above the limit); only *new* creation above the free ceiling is blocked. Never lock a user out of a keepsake they already made or already sent — that would break the core trust promise of a "permanent keepsake" app.
- Malformed, corrupted, schema-mismatched, or adversarially-crafted imported project files → project file format is explicitly versioned; unrecognized/corrupt imports fail closed with a clear "can't open this project" message; a bad import can never crash the app or corrupt the user's existing project library.

**Data and privacy implications**
- All project data — recipient/occasion info, track references, cover choices, typed notes, and recorded voice files — stays fully on-device unless the user explicitly shares/exports a package. No analytics assumed or required for core value.
- Microphone and music-library permission copy is emotionally plain and specific ("recording why this song matters" / "used to build and play the mixtape, never copied into exports"), not generic OS boilerplate.
- Voice notes are treated as intimate content: excluded from casual re-sharing, deleted immediately (not soft-deleted) on re-record or track removal.
- Deleting a project deletes its local voice-note assets, not just metadata — no silent orphaned audio.
- Voice notes are included in standard device backup by default (the "permanent keepsake" promise outweighs backup-size concerns) — written down as an explicit decision so it isn't guessed wrong later in either direction.

**Risk register**
1. **Expectation mismatch** ("mixtape gift" implies bundled audio) → mitigated by consistent product truth in share-flow copy: "shares your notes, artwork, and track list; songs play via Apple Music when available."
2. **Emotional collapse via recording friction** (clunky note capture → users skip notes → ceremonial pitch dies) → mitigated by ruthless simplification of the record flow and full parity for text notes; carried forward from earlier phases as the single highest-leverage UX risk.
3. **Recipient disappointment from playback mismatch** (region/subscription/catalog gaps) → mitigated by designing the keepsake to be meaningful as a story object independent of song playback (see resolved edge case above); named as a real, only-partially-engineerable product risk, not fully solved.
4. **False sense of real-time collaboration** → mitigated by making linear/fork handoff explicit in both data model and UI copy, never implying live shared editing.
5. **Untrusted import surface** (malformed/adversarial project files from a share-sheet source) → mitigated by explicit format versioning and fail-closed handling; named because it's easy to miss in a demo where you only ever import your own app's output.
6. **Storage growth for paid users with a large project archive** → no in-app storage visibility exists yet; named as a stated limitation for v1 rather than solved, since it doesn't block the core loop.
7. **Novelty/one-time-use churn** (already named in prior phases) → mitigation stays "make the finished artifact good enough that recipients become future makers," not engagement-bait features (explicitly excluded: streaks, nudge notifications).

**Final assumptions**
- iPhone-first, not iPad-first. Apple Music/MusicKit is the only music source in v1.
- Voice-note editing is light but real: re-record and trim at minimum for paid positioning; no multitrack polish.
- Widgets and Live Activities exist in minimal, honest form only (per prompt-contract decision rule 4).
- No push notifications, no accounts, no speech-to-text in v1, no cloud sync, no background/live collaboration.
- Track metadata/artwork is snapshotted locally at add-time and never depends on live catalog access to render a track card.
- Voice note files have single-owner lifecycle with active orphan cleanup as a safety net, not the primary correctness mechanism (primary mechanism is deleting on re-record/track-removal).
- Project files carry an explicit schema version; unrecognized/corrupt imports fail closed, never crash.
- Lapsed subscription degrades new-creation ability only; it never blocks read/playback of already-created content.
- Reorder and waveform-scrub controls require a non-gesture accessible path as a hard requirement.
- No major ambiguity remains for design or architecture to inherit from this phase — the one open question going in (recipient experience when tracks don't resolve) is now resolved as an explicit design assumption above, not left dangling.

## App Features

Both agents converged tightly here — Codex laid out the same seven must-haves as Claude did (create/occasion setup, MusicKit track selection with local snapshotting, voice+text liner notes with text as first-class not fallback, reorder+preview, share-sheet export/import, real entitlement gating, minimal widgets/Live Activities), and Claude's contribution was mostly sharpening those into hard, testable acceptance criteria rather than disagreeing with any of it. The one genuinely new decision Claude made that Codex hadn't specified: a concrete 2-minute cap on voice notes with a visible countdown (since "short voice notes" was in the original spec but never numerically bounded), and an unsurfaced soft technical ceiling (~50 tracks/project, a few hundred projects) purely for scroll/persistence stability on the "unlimited" paid tier — never shown to users as a limit, just an engineering guardrail. Both lists match on should-have (widgets, Live Activities, premium themes, trim/retake polish, orphan-sweep as safety net) and on won't-build (no CloudKit, no accounts, no speech-to-text, no merge UI, no non-Apple-Music sources, no engagement notifications, no bundled licensed audio ever). Nothing contradicts prior-phase decisions — if anything this phase just turned three phases of principles into gradeable acceptance tests. No open disagreement to send to another round.

CONSENSUS: YES

## Final Output

**Must-have features** (the five Core Workflows plus the infrastructure that makes them survivable — all directly on the gift-making promise path):

1. **Create occasion/mixtape.** *Story:* as a maker, I start with who this is for and why, so it feels like a gift, not a playlist draft. *Acceptance:* create with title, recipient, occasion, one visual theme; persists immediately; survives relaunch with no half-created state; free tier blocks a 2nd active project with a real upgrade moment at the point of action.

2. **Add tracks via MusicKit with persistent snapshots.** *Story:* as a maker, every note attaches to a real song. *Acceptance:* authorize/browse/search/add; title+artist+artwork snapshotted locally at add-time and still render after relaunch even with no network (airplane-mode test); denied-permission and zero-results are real handled states, not dead/blank screens; free tier blocks a 6th track.

3. **Per-track liner notes, voice or text, text fully first-class.** *Story:* as a maker, I explain why each song matters in whichever format I'm comfortable with, without friction pushing me to skip it. *Acceptance:* record starts in <300ms with live waveform feedback; voice notes capped at 2 minutes with visible countdown; one-tap re-record actually deletes the old file from disk immediately; call/Siri interruption yields a recoverable draft, never silent loss; text notes have equal prominence and no "fallback" framing.

4. **Reorder + sequenced preview playback.** *Story:* the sequence carries meaning, not just a stored order. *Acceptance:* drag-to-reorder plus a non-drag VoiceOver move-up/move-down path (testable with VoiceOver on, zero sighted assistance); reorder survives relaunch; preview shows the current track's note synced to playback position, not a static screen.

5. **Share-sheet export/import for keepsake + single-collaborator handoff.** *Story:* hand off a finished gift or an invite with no server. *Acceptance:* exported package contains metadata/art/sequence/notes and never bundled licensed audio (literally inspectable); one collaborator can add a track+note and pass it on; imports fail closed on malformed/corrupt/schema-mismatched files without crashing or corrupting the existing library; finished-gift vs. contribute-invite is unambiguous on receipt.

6. **Real local entitlement gate.** *Story:* free limits must actually constrain, or paid value is fictional. *Acceptance:* three independently-testable blocks — 2nd project, 6th track, any collaborator — enforced at the data layer, not just a UI checkbox; downgraded/lapsed accounts keep read/playback of existing over-limit content.

7. **Autosave/persistence across force-quit, plus asset cleanup on delete.** *Story:* the app must never silently lose or orphan a user's work. *Acceptance:* scripted force-quit mid-recording, pre-save after adding a track, and mid-reorder all reopen with zero data loss; deleting a track or project actually removes its audio file from disk, not just its reference.

8. **Minimal but real Widget + Live Activity.** *Story:* lightweight native presence for in-progress/playing mixtapes, per spec's named iOS-native features. *Acceptance:* one working widget surfacing an in-progress project that opens back into the app; one working Live Activity reflecting live playback state — both real, not mocked.

**Should-have** (real if time allows; if cut, must be named explicitly in final review, not silently dropped): voice-note trim beyond basic re-record; a small set of distinct cassette/booklet cover themes; a recipient-first intro screen on import explaining the occasion before showing tracks; read-only/curated treatment for finished projects; permission-education screens ahead of the OS prompt; auto-advance through sequence during playback; visible contributor attribution; background orphan-file sweep as a safety net on top of the primary delete-on-remove mechanism.

**Could-have** (explicitly next-version, not discussed further now): additional widget sizes; more premium themes beyond the minimum set; "mixtape complete" celebration transitions; project duplication for remixing; per-project storage-size indicators; waveform-scrub trim polish beyond simple replay/replace.

**Won't-build** (flat, non-negotiable so nobody reopens mid-build): CloudKit sync or any real-time/concurrent collaboration; accounts/login; speech-to-text in any form, even stubbed; merge-resolution UI; more than one collaborator at a time; non-Apple-Music audio sources; engagement notifications/streaks/reminders; iPad-optimized layout; any exported artifact containing actual licensed audio, under any circumstance.

**New decisions locked this phase (not previously specified):**
- Voice liner notes are hard-capped at 2 minutes with a visible countdown during recording — turns the spec's vague "short voice notes" into an enforceable, testable limit.
- An un-surfaced soft technical ceiling (~50 tracks/project, a few hundred projects total) protects list/scroll/persistence performance for "unlimited" paid users; it is never shown to the user as a limit, purely an engineering guardrail against pathological accounts breaking during testing or use.
