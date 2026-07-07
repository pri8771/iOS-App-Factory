# dayframe — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

**CONSENSUS: YES**

Only one participant actually spoke this round — Codex and Gemini were both unavailable (CLI/auth issues) — but Claude's analysis is thorough, directly answers every required output item for this phase, and nothing in it is contested. Given the other two seats are structurally empty rather than in disagreement, there's no reason to spin another round hoping they come online; the contract stands on its own merits.

The key call Claude made, and that I'm accepting as the frame for everything downstream: this document is the parent portfolio brief pasted into one child folder, but this thread's actual job is narrow — build exactly **Dayframe**, the one app already named and scoped above the parent-prompt paste. The "generate 12 ideas, pick 6, build 6" instructions are inherited context explaining why Dayframe exists, not new work for this thread to redo. If that's wrong, it needs to be said now, because reversing it after design work starts means discarding the build.

## Final Output

**What we're building:** Dayframe, a Photo & Video iOS app. On-device Vision analyzes daily video footage, auto-picks the best moment per day, and assembles those picks into a monthly reel. Local-first MVP, working end-to-end, no lorem-ipsum screens.

**Hard requirements:**
- Local-first: the "best moment" selection runs on-device via Vision, no server round-trip in the core inference path.
- Produces an actual monthly reel from auto-picked daily moments — real assembly, not a mockup.
- Data model must not hardcode local-file-only assumptions — leave room for a remote asset reference later so cloud sync can be added without a rewrite.
- Needs a genuine subscription-shaped monetization path with real value behind the paywall (not cosmetic-only).
- Must be differentiated from the other two Photo & Video siblings in this batch — but this thread has no visibility into what those are, so it can only flag that risk, not resolve it.
- Ships as a working MVP with real user-visible behavior across the full flow.

**Non-goals for this phase and this thread:**
- Not re-running ideation/selection across 12 candidate apps — that's the parent's job, done or happening elsewhere.
- Not building Jira/Notion structures — explicitly gated on "if an app is liked," which hasn't happened.
- Not resolving cross-app overlap with the other five siblings — no visibility into their specs.
- Not doing engineering/architecture yet — this phase is the contract only.

**Production-readiness bar (this is the one the build will be judged against):** the MVP has to survive real conditions, not just the happy path — no video that day, multiple videos with ambiguous or near-identical "best" scores, corrupted/unsupported codec/HDR/Live-Photo/screen-recorded footage, Vision returning low-confidence or no usable signal (common on dark/blurry/static shots), denied or limited Photos permission, a month with too few qualifying days, storage pressure during render, AVFoundation export failures mid-assembly, backgrounding during analysis or export, and paywall edge cases (expired trial, restore purchase, offline receipt check). A build that only handles the tidy case is a demo, not done.

**Decision rule for later phases:** the spec is one sentence and leaves a lot open (what counts as "the daily video moment" when there are multiple clips a day, what happens to a day retroactively edited after the reel already rendered, etc.). When a later phase hits one of these gaps, it must name the assumption explicitly in its output rather than picking silently. Five named assumptions beats one confidently-wrong build.

## Initial Discussion

Same pattern as last phase — Codex and Gemini both couldn't join (CLI/auth issues again), so it's really just Claude thinking this through solo. But the thinking is solid and it hits every box the phase rules ask for, so there's no real "disagreement" to report, just one clear, well-reasoned take that nobody's around to push back on.

The core landing point: Dayframe's promise only works if the user never has to open an editor. The moment we ask them to trim clips or pick music before a reel renders, we've quietly turned this into a video editor with a Vision gimmick bolted on — not the app that got specced. So the whole MVP is being scoped around "zero required interaction between shooting video and getting a finished reel."

The one genuinely load-bearing decision made this round: "best moment" is defined as clip-level selection first (score sampled frames across each day's candidate clips, pick the best whole clip), then a duration cap applied by finding the best contiguous window inside that winning clip if it's too long. That's a deliberate choice to avoid building full temporal-saliency scoring across every second of every clip in v1 — cheaper to build, still delivers the "moment" feeling.

Scope boundaries that got drawn firmly: video-only (no swapping in photos on video-less days — those days just show up honestly empty), no cloud sync in this build (data model just leaves room for it later), no manual timeline editing, no arbitrary music import (bundled royalty-free tracks or silent/clip-audio only), no cross-device, no shared/multi-person reels, and a hard cap on how much footage per day actually gets analyzed so one heavy-shooting day doesn't stall the app.

One addition to the "definition of done" that wasn't in the original contract but got argued for convincingly: a minimal manual override — letting the user swap today's auto-pick for the next-best candidate — because Vision is going to produce real near-ties and outright bad picks on ordinary handheld footage, and shipping with zero recourse for that will read as broken even when it's working as designed. This override doubles as an actual monetization lever (limited swaps free, unlimited swaps + full history + clean export behind the subscription) rather than a cosmetic paywall.

Nothing here contradicts the earlier prompt-contract phase, and every required output item (one-sentence promise, primary user, core loop, scope boundaries, success criteria) got a concrete answer rather than being left vague. Given both other seats are empty rather than dissenting, there's no reason to spin another round waiting for pushback that isn't coming.

CONSENSUS: YES

## Final Output

**Product promise:** Dayframe watches the video you already shoot day to day, uses on-device Vision to silently pick the single best moment from each day, and once a month hands you a finished reel — with no manual editing required to get there.

**Primary user & scenario:** Someone who shoots a lot of casual video (kids, pets, trips, everyday life) and has hundreds of clips sitting unwatched in Photos. Not a creator optimizing individual clips for social — someone who wants a reason to look back on the month without doing the work of curating it themselves.

**Core loop:** Grant Photos access → each day with qualifying video gets scored by Vision (sharpness, face presence, stability, saliency) and the best clip is picked → if that clip runs long, the highest-scoring contiguous window within it is used as the "moment" → at month's end (or on demand) the daily picks are stitched into one reel with simple consistent transitions → user watches, can swap a pick for the next-best candidate, and can export/share.

**Hard scope boundaries (out for this MVP):**
- Video only — no falling back to photos on days with no video; those days are visibly absent from the reel, not papered over.
- No cloud upload/sync (data model leaves room for it, doesn't implement it).
- No manual timeline editing, reordering, or trimming beyond the single swap-to-next-best override.
- No arbitrary music import — bundled royalty-free tracks or clip-audio-only.
- No cross-device, no multi-person/shared reels.
- A processing cap on footage analyzed per day, so heavy-shooting days don't stall the app.

**Measurable success criteria:** Given a realistic test month (some days with one clip, some with several, some with none, at least one corrupted/unsupported file), the app must: produce a playable, exportable reel without crashing or hanging; correctly and visibly represent no-video days as absent rather than silently dropped; degrade gracefully when a single clip is bad (exclude it, don't fail the whole day/month); and have a paywall whose free vs. subscribed behavior is concretely different and testable (limited vs. unlimited re-picks, watermark vs. clean export).

**Decided ambiguity:** "Best moment" = best whole clip first, then best contiguous sub-window if that clip exceeds the duration cap — not full temporal scoring across all footage.

**Added to definition of done:** a minimal manual override (swap today's pick for the next-best candidate) is required in the MVP, not optional polish — both because auto-pick will be visibly wrong often enough to need it, and because it becomes the real subscription value driver.

## Per App Product Brief

CONSENSUS: YES

Same story as the last two phases — Codex and Gemini both stayed offline, so this is Claude working through the brief solo. But it directly answers every required item (target user, paid value, core loop, wedge, growth angle, local-first/cloud path), builds logically on the two locked-in decisions from earlier phases (zero-editing promise, clip-then-window "best moment" definition), and doesn't contradict anything already decided. There's no live disagreement to resolve, just one coherent, well-argued brief that nobody's here to push back on.

The load-bearing calls made this round: the target user got sharpened from "casual video shooter" to a concrete persona (parent with a backlog of unwatched clips, opens Photos maybe three times a year), which forces the design requirement that limited-library Photos permission must work, not just full access. The paywall got reframed away from "watermark on export" toward something with real teeth — unlimited swap-to-next-best, full multi-month reel history retained, clean export — with the free tier's older months actually aging out, which manufactures genuine loss-aversion rather than a cosmetic nag. And the core loop picked up one new piece not in the earlier phases: a day's pick should be watchable immediately, not gated behind waiting for the whole month, because a 30-day wait for first payoff is a bad activation curve.

The growth mechanic is deliberately scoped as niche/word-of-mouth rather than broad-viral — the monthly reel itself, shared to a partner or grandparent with a small tasteful "made with Dayframe" mark on the free tier, is the distribution engine, not an app-driven referral loop. And on local-first/cloud-readiness: everything (scoring, picking, rendering) stays on-device with no account needed in v1, but each day-pick record needs a stable identifier beyond a raw file path — PHAsset identifier plus enough metadata to detect "source video was deleted" gracefully — so a future remote-URL/sync-state field can be added without touching the picking or rendering logic.

The one thing flagged as a real risk rather than a decided fact: Vision's frame-level signals (sharpness, faces, exposure) are a weak proxy for "moment worth remembering," and that's exactly why the swap-override isn't a paywall gimmick bolted onto a good model — it's compensating for a model that will visibly miss the right moment often, and design needs to treat swapping as normal light editing, not as the AI admitting failure.

## Final Output

**Target user & use case:** A parent (or similarly video-heavy casual shooter) with a large backlog of unwatched daily video clips in Photos — someone who rarely browses Photos except to retrieve one clip on demand. She won't trim clips or pick music; if the app asks her to do either before showing value, she churns within a week. The entire value must land with zero setup beyond a one-time Photos permission grant, and limited-library ("selected photos") access must work, not silently produce an empty app.

**Core loop:** Grant Photos access → background scan tags each day with qualifying video → app opens to a calendar/timeline where days with a pick show a thumbnail and empty days are just blank (not apologized for) → tapping any day plays that day's pick immediately, standalone, without waiting for month-end → once a month has enough picks, a "your [Month] reel is ready" moment surfaces → she watches it in one sitting and can export/share. Daily picks being watchable immediately (not gated on month completion) is now a required part of the loop, not an implementation detail — it's the activation hook.

**Paid value / subscription value (functional, not cosmetic):** Free tier gets one swap-to-next-best per day and access to only the current month's reel — older reels age out and become inaccessible, creating real, felt loss. Subscription unlocks unlimited swaps per day, full multi-month reel history retained and re-watchable forever, and clean (unwatermarked) export. The pitch in plain terms: "your good months don't get taken away, and you can fix the AI when it picks wrong."

**Competitive wedge:** Against Apple Memories and Google Photos highlight reels (cross-media, opaque, uncorrectable, bundled-utility feel) and against manual "AI video editor" apps (require the user to select clips themselves), Dayframe's edge is narrowness plus correctability — one pick a day, one file a month, and a visible swap mechanism means the user can form a mental model of what the app does and fix it when it's wrong. A system you can correct feels intentional even when it errs; a black box just feels wrong.

**Growth angle (niche, not broad-viral):** The monthly reel itself is the distribution vehicle — a 60–90 second "this is our July" video gets forwarded to a partner, grandparent, or group chat. Free-tier shared reels carry a small tasteful "made with Dayframe" end-card/watermark specifically to seed distribution outside the App Store funnel; subscribing removes it. This is word-of-mouth through family circles, not a mechanical referral loop, and that's treated as honest fit for the category rather than an underperforming viral feature.

**Local-first & cloud-ready plan:** All scoring, picking, and rendering happens on-device (Vision + AVFoundation), no account required in v1. Each day-pick record is keyed by more than a raw file path — a PHAsset identifier plus enough metadata to detect and gracefully handle "source video deleted after the reel was made" — so history doesn't corrupt when users clean up their camera roll. The record schema includes an unused remote-URL field and sync-state enum today, so cloud sync can be added later without touching the picking/rendering path or migrating data.

**Named risk carried into build phases:** Vision's frame-level quality signals (sharpness, face presence, exposure) are a weak proxy for "moment worth remembering" — the swap override exists to compensate for a model that will visibly misfire often, and it must be designed to feel like normal light editing, not an admission that the AI failed.

## Detailed Discussion

CONSENSUS: YES

Same shape as every phase so far — Codex stayed in cooldown and Gemini couldn't authenticate, so this is Claude working solo again. But the round-1 pass is thorough and does exactly what a detailed-discussion phase is supposed to do: it surfaces the messy real-world cases (timezones, iCloud-optimized storage, pet-only days, deletion after render, paywall data retention) that the last two phases glossed over, and resolves each one with a concrete decision rather than leaving it open. Nothing contradicts the locked decisions from prompt_contract, initial_discussion, or per_app_product_brief — if anything, this phase is filling in gaps those phases explicitly flagged as "someone needs to decide this later." Since there's no second voice to disagree, and every required output item (resolved requirements, edge cases, data/privacy, risk register, final assumptions) got a real answer, there's nothing left to gain by spinning another round.

## Final Output

**Resolved requirements**

- **Day boundary:** a video's "day" is determined by that asset's own capture-time timezone metadata, not the device's current timezone. A clip shot at 11:40pm local on the 3rd stays on the 3rd even after the phone's clock has since changed timezones (travel, DST).
- **Scoring must not require a human face to score well.** Face presence is a bonus signal, not a gate — saliency, motion, and subject-in-frame signals must be able to carry a high score on their own, so pet-only or landscape-only days aren't systematically undervalued by a proxy that's blind to what makes them good.
- **iCloud-optimized-storage handling:** analysis explicitly requests iCloud download for assets that aren't fully on-device, shows a visible "waiting for iCloud" per-day state (never a silent hang), times out to a "deferred" (not "failed") status, retries when back online, and deletes any temporary full-resolution download immediately after scoring — no shadow copy of the user's library accumulates on disk.
- **Rendered monthly reels are self-contained exports** (baked video, not a live reference to source assets) so they survive the user later deleting the source footage. The day-detail view and swap affordance, by contrast, must handle a since-deleted PHAsset gracefully: show "no longer available," disable swap if the candidate pool is now empty.
- **No rescore-on-edit in MVP:** if a user edits a video in Photos after its day was already scored, Dayframe does not detect or react to that — scored-once is a named limitation, not a silent gap.
- **Render caching is idempotent:** the monthly reel is cached and keyed to a hash of that month's ordered (day, chosen asset id, trim window) list; it's only re-rendered when that key changes (i.e., after a swap), so opening the month view repeatedly doesn't re-run AVFoundation export or risk non-deterministic output drift.
- **Paywall data retention is access-gating, not deletion:** when a subscription lapses, older rendered reels are never deleted — the files stay on disk and access is gated in the UI, so resubscribing restores everything instantly with no re-render. Actually destroying a user's rendered memory over a billing lapse is off the table.
- **Privacy is a checkable, not aspirational, requirement:** no analytics/telemetry event may carry frame data, thumbnails, or content-derived scores; crash reports must be scrubbed of anything image-derived, since the core pitch is "this never leaves your phone."

**Edge cases (now named, with a handling decision each)**

- Travel/DST shifting which local day a clip belongs to → resolved via per-asset timezone metadata, not device clock.
- Pet-only or human-absent-but-good days → resolved via scoring weights that don't gate on face presence.
- Asset not fully downloaded from iCloud when analysis runs → resolved via explicit fetch + visible waiting state + timeout-to-deferred + cleanup.
- Source video deleted after a pick was shown or a reel was rendered → resolved differently per surface: rendered reel is unaffected (baked export); live day view/swap degrades gracefully instead of crashing.
- Video edited in Photos after being scored → explicitly out of scope; no rescore listening.
- Reopening a month view repeatedly → resolved via cached, hash-keyed render, not a re-export each time.
- App backgrounded mid-scan or mid-export → per-day analysis and the final export must be individually resumable/idempotent, not restarted from zero.
- Interrupted export or scoring leaves orphaned temp files → cleaned up on next launch so storage doesn't quietly grow.
- Subscription lapses → files preserved, only UI access gated.
- Fresh install with a large historical backfill → chunked, resumable scan with visible progress; current/upcoming months are prioritized so activation isn't blocked on finishing the full history.
- Very short accidental clips (pocket recordings) → excluded via a minimum duration floor (~1–2s) before something qualifies as a scoring candidate.
- Screen recordings / saved-not-captured videos → excluded from candidacy entirely via PHAsset source type, since scoring non-personal footage as if it were a "moment" produces nonsense picks.

**Data and privacy implications**

- All Vision scoring, picking, and rendering stays fully on-device — this was already a hard requirement, and this phase adds the concrete telemetry constraint: no image-derived data (frames, thumbnails, scores tied to identifiable content) may leave the device via analytics or crash reporting.
- Day-pick records need durable identifiers (per the product brief's PHAsset-id-plus-metadata approach) specifically so that source-deletion after scoring degrades gracefully instead of corrupting history — this phase makes that requirement concrete by tying it to the render-is-baked / live-view-degrades split above.
- Temporary full-resolution downloads used only for iCloud-backed scoring must not become a permanent shadow library — explicit deletion after use is a privacy and storage requirement, not just a storage one.

**Risk register**

- **Vision face-presence bias undervaluing pet/landscape days** — mitigation: scoring weights explicitly designed not to gate on face presence (resolved above, not just flagged).
- **iCloud fetch latency/failure stalling analysis** — mitigation: visible per-day waiting state, timeout-to-deferred, retry, no silent hang (resolved above).
- **Non-deterministic or repeated re-renders wasting battery/time and producing drift** — mitigation: hash-keyed idempotent render cache (resolved above).
- **Accidental permanent data loss on subscription lapse** — mitigation: gate access, never delete files (resolved above); named as a reputational/support risk if gotten wrong.
- **Storage bloat from orphaned temp files or interrupted exports** — mitigation: cleanup pass on next launch (resolved above); named as a slow-burn complaint vector for an app whose pitch is "hands-off."
- **Backfill on first install blocking activation** — mitigation: chunked/resumable scan prioritizing current and upcoming months, explicit acceptance that not every historical month gets a reel on day one.
- **Family Sharing / shared iCloud Photo Library merge behavior** — not mitigated, explicitly excluded as a named limitation (single local library assumption only) rather than silently mishandled.

**Final assumptions (named exclusions, not silent gaps)**

- Single local Photos library only — no Family Sharing or shared-library merge handling in v1.
- No rescoring in response to post-hoc edits to a video in Photos; an asset is scored once.
- Minimum clip duration floor (~1–2 seconds) to filter out accidental recordings from candidacy.
- Screen recordings and saved/downloaded (non-camera-captured) videos are excluded from candidacy via PHAsset source type.
- A large historical library on fresh install gets a chunked, resumable backfill with visible progress — not a guarantee every past month gets a reel immediately, only that current/upcoming months are prioritized.

## App Features

Same pattern as every phase in this thread — Codex is in cooldown, Gemini can't authenticate, so it's Claude alone again. But the round-1 pass does exactly what this phase needs: it takes every decision locked in across prompt_contract, initial_discussion, per_app_product_brief, and detailed_discussion and converts them into a strict MoSCoW list with a user story and testable acceptance criteria per must-have, rather than just re-describing the product. Nothing here contradicts earlier phases — it's explicitly framed as "carrying forward" the prior exclusions (no cloud sync, no manual editing, no music import, etc.) rather than reopening them, and the must-have list traces cleanly back to requirements already agreed (Photos permission handling, chunked resumable scan, clip-then-window scoring, honest empty days, immediate day playback, swap override, idempotent render cache, export/share, real paywall gating, iCloud handling, deleted-asset handling, temp-file cleanup). Since there's no second voice to push back and every required output item (must/should/could/won't + acceptance criteria) got a concrete answer, there's nothing to gain from another round.

CONSENSUS: YES

## Final Output

**Must-have features** (each ships with a user story and a binary acceptance test):

1. **Photos permission & onboarding** — Grant access once, app immediately reflects what it can see. Acceptance: full access, limited/selected-photos access, and denied access each render a *distinct* UI (limited-library must never look identical to "no video this month"); denied access shows a real explainer with a path to Settings.

2. **Chunked, resumable backfill scan** tagging which days have qualifying video. Acceptance: kill mid-backfill, relaunch — no duplicate rework, no permanently stuck "scanning" state, no day silently skipped; current/recent days populate first.

3. **Per-day best-moment selection** (clip-level scoring → contiguous sub-window trim if over the duration cap). Acceptance: handles a single-candidate day, a day with a corrupted/unsupported clip mixed in (excluded, not fatal), a pet-only/no-face day (still produces a real pick, not a bias-driven bad one), and an all-low-signal day (produces something rather than nothing).

4. **Calendar/timeline view** with per-day thumbnails and permanently blank (not pending/error-looking) empty days.

5. **Day-detail playback**, watchable immediately, no dependency on month-end rendering.

6. **Swap-to-next-best override** — disabled (not error-prone) when only one candidate exists; invalidates only that day's slot in the render cache; free-vs-paid swap limits enforced as a real functional difference.

7. **Monthly reel assembly** with an idempotent, hash-keyed render cache — re-opening a month never re-exports; a swap forces exactly one re-render; a failed export leaves the prior cached reel intact and offers retry, never overwrites it with a broken file.

8. **Export/share** — plays correctly outside the app; free tier watermark/end-card vs. paid clean export must be a verified pixel-level difference in the exported file, not just a flag.

9. **Paywall with functionally real gating** — free tier: one swap/day, current-month-only reel access; lapsed subscription gates access without ever deleting the underlying file; resubscribing restores instantly with zero re-render. Acceptance test explicitly checks the file survives a lapse.

10. **iCloud-not-downloaded handling** — visible "waiting for iCloud" state, timeout-to-deferred (not silent hang/fail), retry when back online; airplane-mode-mid-analysis tested as a first-class case.

11. **Deleted-source-asset graceful handling** — day view shows "no longer available," swap disables if candidate pool is empty, previously rendered reels are unaffected (baked export) even after source deletion.

12. **Orphaned temp-file cleanup on launch** — force-kill mid-export and mid-iCloud-fetch, relaunch, verify temp files are gone within one cycle.

**Should-have** (valuable, not blocking v1): local-only "your reel is ready" notification; a handful of bundled royalty-free music tracks as an optional per-reel toggle; a settings view exposing the per-day processing cap/skip reasons; a lightweight "why this pick" indicator (face/motion/sharpness) supporting the correctability wedge without being required for swap to satisfy its acceptance criteria.

**Could-have** (deferrable, no one misses it in v1): alternate reel transition/style themes; manual re-ranking of candidates beyond simple next-best; reel-length customization; any onboarding beyond a single permission-explainer screen.

**Won't-build** (carried forward as hard exclusions, not open for silent scope creep): cloud sync/accounts; manual timeline editing/trimming beyond the single swap; arbitrary user music library import; cross-device or Family Sharing/shared-library support; photo fallback on video-less days; rescoring on post-hoc Photos edits; multi-person/shared reels.

**Named residual risk:** "picked the right moment" has no true pass/fail test — the acceptance criteria above verify the scorer doesn't crash, doesn't gate on face presence, and doesn't silently produce nothing, but can't prove the pick is *good*. That's exactly why swap-to-next-best stays must-have rather than should-have: it's what turns an unfalsifiable quality claim into a user-correctable one. Any future attempt to cut it for scope reasons should be blocked, not deferred.
