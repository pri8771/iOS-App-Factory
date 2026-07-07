# afterglow — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Since Codex and Gemini couldn't weigh in this round (both CLIs unavailable), this is really just Claude's analysis standing alone — but it's thorough, directly addresses every acceptance check for this phase, and there's no dissenting view to reconcile. Nothing in it is controversial or needs another round of back-and-forth: it preserves the prompt verbatim, translates it into concrete requirements, and flags the two spots (LLM narrative generation, location-sparse clustering) where the spec itself is ambiguous — with clear rules for how later phases should resolve that ambiguity rather than quietly picking the easy path. That's exactly what this phase is for, so I'm calling it done rather than waiting on CLIs that aren't coming back online.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (initial_prompt.md content, portfolio wrapper + full Afterglow spec). All later phases should treat that block as the source of truth, not this summary.

**Hard requirements for the Afterglow build:**
- A working, local-first SwiftUI MVP with zero network dependency in its core loop.
- Core workflow, all present and functional: select a trip's photos/date range → on-device clustering into day groups (Photos framework metadata + Vision) → user reviews/adjusts clusters → adds text captions and/or voice notes → picks a layout theme (one theme is sufficient for v1 — "premium themes" plural is a paid-tier promise, not a v1 requirement) → exports/shares the finished journal (PDF or shareable images via system share sheet).
- The "last trip's cover photo" widget is explicitly listed under iOS-native features — it's in scope for v1, not an optional stretch a later phase can drop unilaterally.
- A subscription/entitlement scaffold must exist and be demonstrably wired in code (1 free trip vs. unlimited+premium paid tier) — doesn't need a live App Store Connect product, but can't be a TODO comment.
- Photos permission must be handled as a real three-state machine: full access, limited access (with Apple's picker to add more), and denied (with a real recovery path — deep link to Settings), not just a happy-path alert.
- Voice notes require their own microphone-permission handling, separate from Photos permission.
- Day-clustering must work off timestamp alone at minimum; location data is enrichment (for same-day/different-place splitting and highlight selection), never a hard dependency. The zero-location-data case is an explicitly designed and tested state, not an edge case.

**Non-goals for v1:**
- No cloud sync, no server, no accounts, no collaborative/shared journals — that's future roadmap, not now.
- No AR.
- On-device LLM "narrative generation" is a paid-tier nice-to-have, not a required v1 feature. Decision rule: it only ships if it can be constrained to template/assembly from the user's actual words — no generative paraphrase that could invent sensory detail or facts the user didn't note. If that can't be guaranteed, the safe default is plain caption concatenation with no generative step, and that cut gets named explicitly in the final review rather than hidden behind a technically-satisfied "export" checkbox.
- Print export (physical photo-book fulfillment) can be deferred beyond share-sheet PDF export if it requires a separate pipeline — but only if named as a limitation, not silently dropped.

**Production-readiness bar:** compiling and demoing once isn't enough. The build must handle: zero-photo library, no date range selected, single-day trip (one cluster — does the UI still make sense?), thousands of photos (memory/perf — thumbnails must be downsampled, not full-res), export failure (disk full, share sheet cancelled), and all three Photos-permission states plus microphone-permission denial. Every screen needs empty/loading/success/error states per the global app-build rules. The app doesn't get marked done until build verification and final review agree on what works and what's limited.

**Decision rules for later phases:**
1. When the spec is internally inconsistent (e.g. "one layout theme" for v1 vs. "premium layout themes" as the monetization pitch), state the assumption explicitly rather than silently resolving it toward whichever is easier to build.
2. Any corner cut for MVP scope must be named as a limitation in the final review — not obscured by technically meeting a lower bar than the spec implied.
3. Watch for scope drift toward Waylay's territory (location-based recall) — Afterglow's differentiator is the finished, exportable day-by-day journal artifact, not a place-memory browsing tool. If a feature starts looking like "browse your past locations" instead of "produce a keepsake," flag it.
4. This app's folder is self-contained inside `/Users/pchordia/Documents/iOS-App-Factory/afterglow` — no dependency on sibling app folders. Portfolio-level constraints (uniqueness vs. the other 8 apps, Jira/Notion backfill, combined transcripts) are carried forward as background contract, not re-litigated per phase.

## Product Research

Looking at this round, only Claude actually spoke — Codex and Gemini are both still down. But the single analysis that came through is solid and hits everything this phase needs: it names the real competitor (Apple's free built-in Photos Memories), sketches a realistic use pattern (post-trip couch session, one-and-done, interruption-prone), lists concrete comparable apps with assumptions flagged, calls out the exact platform APIs to lean on, and flags three-plus real risks (Vision-feature scope creep eating the build budget, thin free tier undermining the invalidation-criteria signal, no-GPS trips degrading into an undifferentiated dump). It closes with a clear, prioritized recommendation for what the first build should actually contain. Nothing here contradicts the prompt-contract phase's decision rules — if anything it reinforces them (e.g., speech-to-text transcription is fine under the "never invent details" rule since it's literal, not generative). There's no second voice to reconcile against, but there's also nothing contentious in what's here — it's a straight, well-supported synthesis with no dangling questions for the next round.

CONSENSUS: YES

## Final Output

**Audience and use context**
Post-trip, one-or-two-sitting usage — not a daily-use app. Someone downloads this within a week of getting home, while the memory's fresh, and works through the flow on a couch, often distracted (kids, TV, partial attention). Design implication: the flow must survive interruption (backgrounding mid-caption, phone call during voice-note recording, force-quit before export) with real persisted state, not silent data loss. Because there's no daily-use hook, the last-trip cover-photo widget isn't decorative — it's the one mechanism pulling a lapsed user back in, so it must ship at full quality in v1, not be softened into an afterthought.

**Comparable apps or patterns to learn from** *(assumption: based on general knowledge of these products, not fresh research this session)*
- **Apple Photos Memories / Google Photos highlights** — the real competitor: free, ambient, zero setup, already on the phone. Afterglow's whole value proposition rests on being better than a screen-recording of a Memories slideshow — an exportable, captioned, intentional keepsake vs. a passive one-time watch.
- **Chatbooks / Mixbook / Artifact Uprising** — validate that people already pay real money for "my photos, professionally assembled." Also sets a print-quality bar that v1's share-sheet PDF export explicitly isn't trying to hit (named limitation, not a gap to hide).
- **Day One** — good model for the caption/voice-note editor's tone: personal and low-friction, not form-like.
- **1 Second Everyday** — proof that "small trip captures assembled into one finished artifact" has a paying audience; reinforces that the paid tier should mean more polish/output, not more AI cleverness.

**Platform-specific opportunities**
- `PHPickerViewController` + `PHAsset.creationDate`/location for clustering input.
- `PHCachingImageManager` with downsampled `targetSize` thumbnails — non-negotiable once libraries hit hundreds/thousands of photos.
- Vision for saliency/highlight-photo selection, scoped tightly — see risk below.
- `AVAudioRecorder` + on-device `Speech` framework for voice notes; transcription is literal, not generative, so it's safe under the "never invent details" rule from the prompt contract.
- `PDFKit` for the export artifact, `WidgetKit` for the cover-photo widget, `ShareLink`/`UIActivityViewController` for the share sheet.

**Major assumptions and risks**
1. **Vision-based highlight selection is a scope trap.** True saliency scoring can burn significant build time for a result indistinguishable from a cheap sharpness/exposure heuristic. Recommendation: ship the cheap heuristic in v1, treat true Vision saliency as post-MVP polish, not a launch blocker.
2. **The free tier (1 trip journal) is a thin signal for the caption-abandonment invalidation criteria** the spec itself worries about. The first build should at least locally log whether users bail at the caption step, so a later phase can act on real signal instead of guessing.
3. **Real camera rolls often have sparse or zero location data** (flights, museums, screenshots). This isn't an edge case — it needs a synthetic no-GPS trip as an explicit design/test case from day one, producing a journal that still reads as intentional day-by-day, not a dump.
4. Engineering time is finite and the paid-tier pattern across every comparable app is "more polish/output," not "more AI" — this argues for under-investing in on-device LLM narrative generation relative to making the one export theme genuinely beautiful.

**Implications for the first build**
Prioritize, in order: robust timestamp-based day clustering (location as pure enrichment, never a dependency) → a fast, low-friction caption/voice-note editor → one truly well-designed export theme over a half-built theme picker → the cover-photo widget (non-droppable, it's the only retention lever) → deliberate restraint on Vision/LLM sophistication until the core "select photos → get a keepsake" loop is proven to hold up next to a free Memories slideshow. This carries forward cleanly into product/design without needing to re-derive competitive positioning or platform choices.

## Portfolio Selection

CONSENSUS: YES

## Final Output

The quality gate's one objection got fixed cleanly — the required selected-app list now actually exists as a structured block instead of being buried in prose — and nothing else changed. Here's where this phase lands:

**Single-app vs. portfolio-parent decision:** Afterglow is a single, self-contained app. The 9-app portfolio selection happened upstream of this child project, and this phase's job was only to confirm Afterglow doesn't hide a second app inside it — it doesn't. It's one linear post-trip flow (photos in → day-clustered journal out), and splitting it would be organizational theater that actively undermines the interruption-resilience requirement already locked in during prompt_contract.

**Selected app:**
- **Slug:** afterglow
- **Category:** Travel
- **Promise:** Turns your trip's photos and notes into a beautiful, automatically organized travel journal you'll actually finish.
- **Target user:** People who take many trip photos but never organize them into anything meaningful afterward — the person who gets home with hundreds of unsorted photos, means to do something with them, and never does.
- **Build:** true
- **Folder:** `/Users/pchordia/Documents/iOS-App-Factory/afterglow`

**portfolio-json:** Not emitted at this level, deliberately. That manifest declares sibling child projects for a parent to hand off to — there are no siblings to declare from inside Afterglow's own folder, and emitting one here would either duplicate the parent's manifest (risking drift) or falsely imply this child project has authority over portfolio structure it doesn't have.

**Known, honestly-flagged gap:** This phase has no visibility into the other two Travel-category slots, so it can't verify Afterglow is differentiated from its Travel siblings — only that it doesn't collide with the named exclusion list (Waylay, etc.). That cross-sibling check belongs to the parent orchestration, not this child.

Carrying forward: Afterglow is a single, non-splittable app — proceed straight into product/design phases for it.

## Initial Discussion

CONSENSUS: YES

## Final Output

Only one voice made it into this round (Codex and Gemini are still down), but it's a complete, well-reasoned pass that hits every required piece for this phase and doesn't contradict anything locked in earlier — so there's nothing to reconcile, just a decision to record.

**Product promise:** Afterglow turns the photos already sitting in your camera roll from one trip into a finished, day-by-day journal you export and keep — entirely on your phone, no cloud, no waiting.

**Primary user and scenario:** Someone who just got home from a trip with 400-1200 unsorted photos, opening the app within about a week while the trip still feels recent. This is a single-session, couch-context, half-attention task done once or twice — not a habitual daily-use app. That reality drives the whole IA: this needs to feel like a short, forgiving wizard with a visible finish line, not a tab-bar dashboard built for repeat visits.

**Core loop (five screens):** Trips home (list of past journals, or an empty state that doubles as the call-to-action) → select photos/date range (auto-detected trip suggestion, or manual) → review & adjust day clusters (this step must let you actually fix wrong clusters — reassign a photo to another day, merge days, split a day — not just pilot-approve them, since day boundaries get genuinely ambiguous around midnight, timezones, and overnight flights) → add captions/voice notes per day (optional, skippable) → pick the one theme and export/share, with a real preview before committing.

**Hard scope boundaries:**
- One layout theme in v1 (matches the earlier prompt-contract decision).
- The free tier gates on *number of trips*, not on a crippled editing experience — the one free trip needs to feel fully premium, or it confounds the caption-abandonment signal the spec already worries about.
- No accounts, no login, ever.
- No in-app camera — this only ever reads existing Photos library content, never captures new photos.
- A journal-in-progress is a first-class "draft" object distinct from a "done/exported" one, with its own visible row on the Trips home screen — not just an in-memory flow that either finishes or evaporates.

**Measurable success criteria:**
1. From opening the app to a finished PDF in the share sheet, under 5 minutes of active interaction (excluding caption-writing time), even with a messy real-world library (mixed timezones, screenshots, no GPS).
2. Closing the app at any point in the five-screen flow and reopening it returns you to that exact state with zero data loss.
3. A trip with zero location data still produces a journal that reads as an intentional day-by-day story, not a flat photo dump — this is treated as a required, testable case, not an edge case to discover later.

No open disagreement here since there was only one contributor — the main thing worth flagging for the record is that Codex/Gemini haven't come back online for two phases running, so this whole line of decisions has been Claude-only. Nothing in the content itself is contentious or needs another round.

## Per App Product Brief

CONSENSUS: YES

Only Claude weighed in this round again (Codex and Gemini are still both down, consistent with every phase so far), but the brief is complete, concrete, and doesn't contradict anything locked in earlier — it actually sharpens several things prior phases left soft. There's no second voice to reconcile against, and nothing here is contentious enough to need another round.

## Final Output

**Target user & use case:** Someone who just got home from a 4–14 day trip with 400–1500 unsorted photos, opening Afterglow within about a week while the trip still feels alive, working through it in one or two couch sessions. The real problem isn't "no way to organize photos" — it's the guilt of half-started iMovie projects and uncaptioned albums that never become anything. Afterglow's whole reason to exist is being the tool that actually reaches a finished artifact where everything else gets abandoned at 20%.

**Paid value & subscription:** Free tier is one full-quality trip journal — one theme, watermark-free PDF export, no crippled editing — because a degraded free experience would corrupt the very signal (does the caption step get finished) the spec cares about. Paid (~$19.99/year or $3.99/month, framed as illustrative not final) unlocks: unlimited trip journals (the real value, for anyone with more than one trip a year), additional themes beyond the v1 one, Vision-based highlight/cover-photo selection (upgraded from the cheap v1 heuristic), and on-device narrative assembly — explicitly locked down as literal template-stitching from the user's own captions/transcripts and metadata counts, zero generative LLM prose in v1. True LLM drafting is deferred as a v1.1 decision made after watching real usage, not blessed now.

**Core loop:** pick trip → adjustable day clusters (merge/split/reassign, not just approve) → per-day caption/voice note (skippable, with a first-class "skip all captions" button from day one so bail-out signal is separable from app-abandonment signal) → pick theme (one in v1, shown as a real full-bleed preview) → export to PDF via share sheet. Autosave has to be fine-grained — per cluster edit, per debounced keystroke — not per screen transition, since losing a caption to an interruption is exactly the failure this app exists to prevent.

**Competitive wedge:** not "better clustering" than Apple Memories/Google Photos — it's producing something you can actually hand to another person. A real PDF you AirDrop to a travel companion or email to family, versus a slideshow nobody screen-records and sends to their mom. This makes export typography/layout quality a go/no-go bar for design, not a nice-to-have: if the v1 theme reads as "an app screen" instead of "a page from a real photo book," the wedge disappears.

**Growth angle:** honestly niche-viral, not broad-viral — the exported PDF circulating among travel companions/family is the acquisition mechanism, and the last-trip cover-photo widget is a retention lever (brings the same user back for their next trip), not an acquisition one. Real success metric: does a user finish a *second* journal, unprompted, for a different trip.

**Local-first & cloud-ready plan:** zero network calls anywhere in the core loop — on-device Photos framework, Vision, Speech transcription, PDF render, full functionality in airplane mode. Data model instruction for the architecture phase: journals live in a local SQLite/SwiftData store keyed by stable trip IDs, with a serializable export bundle (PDF + structured JSON of clusters/captions/theme) that a future CloudKit sync layer could adopt without a data-model rewrite. The shared/collaborative-journal roadmap item stays explicitly out of scope and shouldn't quietly shape v1 data model decisions.

This brief is specific and complete enough to hand straight to design/architecture with no further ideation needed.

## Next Steps Small

CONSENSUS: YES

## Final Output

Only Claude weighed in again this round (Codex and Gemini are still both down, same as every phase so far), but the pass is thorough, concrete, and consistent with everything locked in earlier — there's nothing to reconcile against a second voice, and nothing here contradicts the product brief or prior scope decisions.

**MVP slice:** A single, complete walking-skeleton workflow: pick a photo library/date range → cluster into day groups by timestamp alone (no location dependency yet) → each day shown as a horizontally scrollable strip with an auto-picked cover photo (cheap sharpness/exposure heuristic, not Vision saliency) → user can reassign one photo to an adjacent day → one skippable text caption per day (no voice notes yet) → one fully art-directed theme (real full-bleed layout, serif captions — not a placeholder grid) → export to a real PDF via the system share sheet. Six pieces, one finished artifact you could actually hand to someone.

**Must-have interactions (non-negotiable in this slice):**
- Cluster reassignment must actually work (move a photo to a different day) — this is what tests the riskiest assumption (timezone/midnight boundary errors), not just a "looks right, approve" button.
- The export screen must show a real pre-commit PDF preview, not a spinner-then-done, since watching completion-anxiety is the whole point of this validation pass.
- The one theme must be finished-quality — no lorem-ipsum spacing or default list rows standing in for "premium," because a mediocre-looking output would validate a different (wrong) hypothesis.

**Cut list (explicitly deferred, not silently dropped):** voice notes/Speech transcription, the cover-photo widget (retention lever, not a concept-validation lever), the subscription/paywall UI and entitlement gating (needed for full v1, not for this slice), Vision-based highlight selection and on-device narrative assembly (both paid-tier polish), merge/split cluster operations (reassign alone is enough to test adjustability), the full three-state permission machine and limited-library picker polish (slice runs against full-library access; permission edge cases are the very next increment), print export and multiple themes.

**Validation criteria:** a tester with a real messy camera roll (mixed timezones, some screenshots, patchy GPS) can go start-to-PDF without hitting an obviously-wrong, unfixable cluster; at least one real multi-day trip actually needs the reassign action (a signal about whether review needs to stay lightweight); and — the sharpest, most subjective but most honest test — someone who didn't build the app looks at the exported PDF and reacts with "you made this?" rather than "oh, a screenshot of an app."

This satisfies both acceptance checks: it's a single complete workflow (photos → adjustable clusters → captions → themed export), and it's concrete enough that the build phase can implement it directly without reopening product debate.

## Detailed Discussion

CONSENSUS: YES

Only one voice came through this round again (Codex and Gemini still down), but it's a genuinely useful pass — the Skeptic role did what this phase needs: it stress-tested claims that earlier phases had glossed over rather than just restating them. Nothing here contradicts prior decisions; it sharpens them by naming gaps (the "fully offline" claim, screenshot pollution, burst duplicates, uninstall data loss) that would otherwise have surfaced mid-build as surprises. All four required outputs are covered concretely, and every risk raised comes with either a mitigation or an explicit "named limitation" — satisfying this phase's acceptance bar. Calling it here rather than waiting on CLIs that haven't come back for six phases running.

## Final Output

**Resolved requirements (refinements to carry into design/architecture):**
- Date-range/trip selection is **manual-first with auto-suggestion as an assist** — not a blocking auto-detect step. A wrong auto-suggestion with no fast manual override would sour the first screen before the user's done anything.
- Day clusters **exclude screenshots and non-camera-source assets by default** (via `PHAsset.mediaSubtypes`/source type), with a manual "add more photos to this day" affordance. Silent inclusion of boarding-pass screenshots and memes undermines the "designed keepsake" promise this app is betting on.
- Videos and Live Photos get a **poster-frame/still treatment in export** — named explicitly as a limitation on motion content, not silently dropped and not a crash risk.
- Export images get their **own downsampling resolution ceiling**, distinct from the review-grid thumbnail downsampling already decided — needed independently to bound both PDF file size (Mail/AirDrop limits) and memory pressure during PDF generation.
- "Local-first" is scoped precisely: **no calls to any Afterglow-controlled or third-party backend**, but the app *is* allowed to request iCloud-original downloads via `PHImageManager` (`isNetworkAccessAllowed`) since "Optimize Storage" libraries often don't have full-res originals on-device. This needs a real, visible "downloading originals" state with a graceful best-available-local-resolution fallback — not an unstated assumption that breaks the "works in airplane mode" claim, and not a silent hang either.

**Edge cases identified (each needs an explicit, testable answer, not a vague deferral):**
- Burst-shot near-duplicates within a day — needs at least naive similarity/burst-ID collapse so cover-photo selection isn't unstable and the day strip doesn't look repetitive.
- DST changes / international date-line crossings (arrive-before-you-left flights) — needs a concrete test fixture, not just faith in the manual reassign button.
- Photos permission revoked mid-session (user backgrounds app, flips access off in Settings, returns) — must be detected via re-checked authorization status or `PHPhotoLibraryChangeObserver` and degrade gracefully against already-cached state, not crash on a now-invalid `PHAsset` fetch.
- Voice-note recording interrupted by a phone call or Siri — `AVAudioSession` interruption handling needs a defined save/discard behavior; this falls squarely under the interruption-resilience principle already locked for this app, not optional polish.
- Zero-photo library, or a date range with exactly one photo — needs to be an explicit test fixture so the single-cluster/single-photo case is a legitimate minimal page, not a broken layout assumption.

**Data and privacy implications:**
- GPS EXIF embedded in source photos must be verified — not assumed — to be stripped when rasterized into the exported PDF (PDFKit draws bitmaps into page content, which generally strips original metadata, but this needs confirmation against the actual rendering pipeline during build). This matters concretely because the growth mechanism is family/travel-companions receiving this PDF — a leaked home GPS location would be a real, testable failure, not a theoretical one.
- Uninstall/reinstall wipes all local SQLite/SwiftData state (drafts and past journals' editable state) with no backup/export/import path for the app's own data in v1 — accepted as a **named v1 limitation**, not something to fix now, but it must be stated somewhere visible (in-app or in review docs), not left invisible.

**Risk register (risk → mitigation or named limitation):**
1. iCloud-dependent originals vs. the "fully offline" claim → mitigated by scoping the local-first claim precisely and building a visible download-state UI.
2. Screenshot/non-photo content polluting clusters → mitigated with a default source-type filter plus manual override.
3. Burst duplicates breaking cover-photo selection/cluster strips → mitigated with basic similarity collapse, ahead of any future Vision saliency work.
4. Uninstall data loss → named limitation, not fixed in v1, but must be surfaced rather than hidden.
5. Export file size/memory pressure on large trips → mitigated with an explicit export-resolution downsampling ceiling, separate from review thumbnails.

**Final assumptions locked for design/architecture to build from without re-deriving:**
- Manual-first date-range selection with auto-suggestion as an assist.
- Screenshots/non-camera-roll assets excluded from clusters by default, with manual add-back.
- Videos/Live Photos get poster-frame export treatment, named as a limitation.
- Export images have their own defined downsampling ceiling, independent of review thumbnails.
- iCloud-original network fetches are permitted and visibly surfaced; "local-first" means no third-party/Afterglow-backend calls, not literal zero-network-ever.
- App uninstall/reinstall data loss (drafts + past journals) is an accepted, explicitly named v1 limitation.

No open disagreement to flag — there was only one contributor this round, and nothing in the content conflicts with anything locked in prompt_contract, product_research, initial_discussion, per_app_product_brief, or next_steps_small. Ready to move forward with no major ambiguity left for design or architecture.

## App Features

CONSENSUS: YES

## Final Output

Same pattern as every phase before this one — only Claude showed up (Codex and Gemini are still both down) — but the pass is thorough and does exactly what this phase needs: turns the six-piece walking skeleton from earlier phases into a real must/should/could/won't list with user stories and acceptance criteria, including the failure-state cases the app-build rules require. Nothing here contradicts anything locked upstream; it operationalizes it.

**Must-have features (each with story + acceptance criteria):**

1. **Trip/date-range selection** — manual-first, auto-suggestion as an assist, never blocking. AC: a zero-photo date range shows an explicit empty state (not blank/crash); suggested photos can be freely added/removed before proceeding.
2. **Day clustering by timestamp** (location as enrichment only) — AC: a synthetic zero-GPS trip fixture clusters cleanly by timestamp alone; a timezone/date-line-crossing trip never silently misfiles a photo without a way to fix it.
3. **Cluster reassignment** (move one photo to an adjacent day) — AC: reassignment updates both day strips immediately and persists across app restart.
4. **Screenshot/non-camera-source exclusion by default**, with manual add-back — AC: a mixed library shows only camera photos per day by default, with a discoverable "add more" affordance.
5. **Per-day caption, skippable, plus "skip all captions"** — AC: force-quitting mid-caption and reopening restores the exact draft text (the single behavior the app's whole reason-to-exist depends on).
6. **One finished-quality theme with a true pre-commit export preview** — AC: the preview is pixel-equivalent to the actual generated PDF, not an approximation.
7. **Export to PDF via system share sheet** — AC: succeeds at a stress-case library size, file size stays within Mail/AirDrop limits, and a cancelled/failed share leaves the draft/exported state uncorrupted so the user can just retry.
8. **Three-state Photos permission machine** (full / limited-with-picker / denied-with-Settings-deep-link) — AC: all three states covered, plus the transition case (permission revoked while backgrounded, detected on foreground, no crash on a stale PHAsset fetch).
9. **Voice notes** (own mic-permission flow, AVAudioSession interruption handling) — AC: a phone call mid-recording either saves what was captured or cleanly discards it — never a corrupted file or hung state.
10. **Subscription/entitlement scaffold** (1 free trip, unlimited paid) — AC: creating a second trip on free tier surfaces a real paywall, not a silent failure; the one free trip is full-quality, no watermark, no crippled editing.

**Should-have:** merge/split cluster operations beyond single reassign; the last-trip cover-photo widget (contractually non-droppable before App Store submission, but doesn't block the first successful export so it's sequenced after must-haves rather than blocking build-verification); burst-duplicate collapse for cover-photo stability; Vision-based highlight selection (paid-tier upgrade).

**Could-have:** additional themes; on-device narrative assembly (template-stitched only — cut entirely, not softened, if it can't be built without inventing details); print export; richer cover-photo/theme animations.

**Won't-build:** accounts/login of any kind, in-app camera/photo capture, cloud sync or backup, shared/collaborative journals, generative LLM prose in captions.

**One explicit fallback ordering, called out rather than left as a flat list:** if build time runs short, the permission-state machine is the one must-have that cannot be cut (a permission dead-end or crash can hit every single user on day one), while voice notes is the must-have most defensible to downgrade to should-have under real time pressure — but only if that cut is named explicitly in the final review, not shipped silently under a "captions/voice notes" label when only captions exist.

**Standing requirement carried into acceptance criteria generally:** every must-have's AC set includes the negative/failure paths already identified in detailed_discussion — zero-photo library, single-photo trip, permission-revoked-mid-session, voice-note-interrupted-by-call, export-cancelled-or-failed — not just the happy path, per the global rule that every screen needs empty/loading/success/error states.

Both acceptance checks for this phase are satisfied: every must-have traces directly to the product promise (finish a real journal, survive interruption, respect permissions), and the must-have list is scoped to something the build phase can actually complete without reopening product debate.
