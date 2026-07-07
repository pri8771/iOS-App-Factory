# cleanline — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

All three points actually landed this round. Codex accepted the scope fence and the Vision-isn't-magic framing as settled, and I explicitly confirmed the scope fence too, so that one's closed. Codex made the case that full in-app Bezier/anchor editing would blow the MVP scope and drift toward the "desktop-class editor" non-goal, arguing the honest reading of "editable" is real vector paths that are editable downstream, with in-app cleanup limited to crop/perspective/threshold/simplify/delete-fragment tools. I pushed back some but ended up narrowing my own ask instead of holding the line on full node editing — landing on select/delete-path, simplify-strength slider, merge-paths, and undo/redo as the MVP in-app editing bar, with full anchor-point dragging explicitly deferred to a later pro tier (which doubles as an honest monetization hook). Codex hasn't confirmed that exact list yet, but it's a direct answer to what they raised, not a new fight — it looks like a landing point rather than an open dispute.

I also supplied the concrete "clean trace" quality bar Codex didn't answer directly last round: no orphan fragments under ~3pt, continuous strokes stay continuous, bounded node counts (so paths are actually drag-editable), opens cleanly in Illustrator/Affinity, and passes a human side-by-side resemblance check. And I put a testability condition on Codex's "capture rescue" pitch — it only counts as a real differentiator if it's proven against named conditions (e.g. degrees of skew, shadow coverage), with anything outside that producing an honest retake-photo error rather than a silent garbage trace, rather than just being marketing language.

Nothing here is a live disagreement anymore — it's Codex's direction plus my specifics, and my one revision (narrowing the editing ask) moved toward Codex's position rather than away from it. Gemini still unavailable.

CONSENSUS: YES

## Final Output

**cleanline execution contract, locked for this phase:**

- **Scope fence:** This phase sequence builds one app — cleanline — end to end. The parent portfolio's 12-ideas/pick-6, cross-app uniqueness enforcement, Jira/Notion backfill, and combined-transcript instructions are inherited upstream constraints (respect uniqueness, keep it a separate project folder), not tasks this app's phases re-run. No later phase should regenerate concepts for cleanline or build portfolio-level artifacts as part of this app's output.

- **Hard requirements:** A real SwiftUI, local-first iOS MVP: capture or import a paper sketch photo, run it through a deterministic on-device processing pipeline (perspective correction, contrast/threshold isolation, noise reduction, contour extraction via Vision, path simplification/curve fitting — Vision alone is explicitly not sufficient and is named as an architectural assumption, not a late discovery), preview the traced result, do meaningful in-app cleanup, and export valid SVG/PDF. Empty/loading/success/error states everywhere the flow can reach them. Accessibility, privacy, local persistence, and testing are in scope, not stretch goals. Architecture isolates capture / preprocessing / vectorization / editing / export / persistence so cloud sync or iPad support can be added later without a rewrite.

- **"Editable" is defined concretely for MVP:** users get real in-app editing — select and delete a stray path, adjust simplify/smooth strength (global or per-path, re-runs curve fitting), merge selected paths, and undo/redo across those actions. Full anchor-point/Bezier-handle dragging is an explicit MVP non-goal, reserved as a credible future paid "pro editing" tier. Exported paths must be genuinely modifiable in downstream tools (Illustrator/Affinity), not a flattened image.

- **Clean-trace quality bar (the acceptance test later phases build and QA against):** no orphan fragments under ~3pt at export scale, continuous source strokes stay continuous, bounded node counts per curve (so paths are actually drag-editable downstream), the exported SVG opens without errors in a mainstream vector tool, and it passes a human side-by-side resemblance check against the source sketch. Tested against a small fixture set: a simple icon sketch, a lettering sketch, a closed-shape illustration, and a messy-but-recoverable notebook photo.

- **Capture-rescue is the differentiator, but only if provably bounded:** perspective correction, shadow/background cleanup, and contrast isolation are the "better than a scan app + desktop cleanup" pitch, but the contract requires this be validated against named conditions (e.g., degrees of skew, percent of frame in shadow) — outside those bounds the app must give an honest "retake photo" error, never a silently garbage trace.

- **Non-goals:** desktop-class Illustrator replacement, full node-by-node vector editing in MVP, generic AI art/style-transfer, server-side tracing, solving color-illustration vectorization in v1, and any portfolio-management/storefront features.

- **Monetization:** the core promise (photograph → usable vector export) must work free. Premium lives in higher-fidelity tracing, batch processing, cloud sync/backup, and advanced pro editing (including future full node editing) — never gating basic SVG/PDF export.

- **Decision rule for conflicts:** when scope tensions come up, protect trace/export quality and the honesty of the promise over feature breadth; when the parent portfolio and child spec seem to disagree, default to the portfolio's local-first/cloud-ready floor requirement and name it as an assumption rather than silently dropping it.

## Initial Discussion

Both sides converged into a single, well-specified product definition rather than staying at the "capture rescue is cool" abstraction level. Codex tightened the promise down to "photograph a paper sketch, walk away with a usable black-line vector file in a few minutes," and made explicit that the target user is a working/semi-pro illustrator or POD seller who already thinks in SVG/cut-file terms — not a hobbyist doodler. I largely echoed that but pushed the promise sentence to describe the outcome rather than the mechanism (deliberately not saying "via Vision" in the marketing copy, since we already agreed Vision alone can't do it), and stressed that the app has to work even for POD sellers who don't know what a Bezier path is.

On the core loop, we're aligned almost word for word: capture/import → auto quality gate → correction (crop/perspective/threshold) → auto-vectorize → before/after review → light cleanup (delete stray path, adjust simplify strength, merge broken segments, undo) → export SVG/PDF. Codex framed the "quality gate before tracing + confidence signal after tracing" as the key anti-false-confidence device; I framed the same idea as "fail honestly on bad input" and tied it to a concrete test (deliberately bad photos, not just good ones, must reliably hit the retake-photo error state).

On scope boundaries we both landed hard on the same fence, from two angles: Codex ruled out anything that turns this into a general vector editor or illustration app (no freehand canvas, no layers, no node editing, no style transfer, no cloud, no marketplace) and restricted MVP source art to high-contrast monochrome linework on plain paper. I added the specific thing most likely to sneak back in during build — project/library management — ruling out any searchable/organizable gallery, batch import queues, or multi-sketch workflows; only a flat, bounded "recent traces" list for persistence is in scope.

One genuinely new thing I added that Codex hasn't reacted to yet: a concrete autosave/interruption-handling requirement (persist the source photo on capture, persist trace results once computed, autosave edits) since the pipeline spans camera → multi-second processing → editing, any of which can get backgrounded or killed. That's not a disagreement, just an unconfirmed addition.

No open disagreements — this reads like real convergence, just missing Gemini's input and Codex's explicit nod to the autosave point.

CONSENSUS: YES

## Final Output

**Product promise:** cleanline lets an illustrator or print-on-demand seller photograph a paper sketch and walk away, in a few minutes, with a genuinely usable black-line vector file (SVG/PDF) — not a raw contour dump, but the output of a correction-and-tracing pipeline they can trust enough to bring straight into Illustrator, Affinity, or a cut-file workflow.

**Primary user & scenario:** A single working or semi-pro illustrator, lettering artist, or POD seller — not necessarily vector-savvy — who just finished one hand-drawn sketch on paper and wants a vector version today, for one listing/cut-file/asset. Not a studio, not a team handoff, not a batch job.

**Core loop:** Start a trace → capture or import sketch photo → app runs an automatic quality check (retake-photo error if the shot is outside supported bounds, rather than a silent garbage trace) → auto-correct (perspective, threshold/contrast) → auto-vectorize → show a before/after comparison → user does light, failure-mode-specific cleanup (delete a stray path, adjust simplify/smoothing strength, merge broken stroke segments, undo/redo) → export SVG/PDF → file persists locally in a flat recent-traces list.

**Hard scope boundaries:** No freehand drawing canvas, layers, brushes, text tool, color-fill workflow, node/Bezier-handle editing, AI style transfer, cloud dependency, or marketplace/storefront angle. No searchable/organizable project library — only a bounded "recent traces" list (open/delete). No batch import queue (batch is an explicit future paid feature). MVP source art is limited to high-contrast monochrome linework on plain paper; pencil shading, watercolor, color illustration, dense crosshatching, and multi-object page extraction are out of scope or explicitly degraded with an honest error rather than pretending to handle them.

**Measurable success criteria:** (1) A first-time user goes from opening the app to a completed SVG export in under 3–5 minutes on a decent source photo. (2) All four fixture-set images (icon sketch, lettering, closed-shape illustration, messy-but-recoverable notebook photo) pass the contract's "clean trace" bar using only the MVP editing tools — needing anchor-dragging to salvage a fixture means the tracing pipeline is under-baked, not that editing scope should grow. (3) Deliberately bad test photos (excess skew, shadow, low contrast) reliably produce the honest retake-photo error rather than a garbage export. (4) State is autosaved at every pipeline stage (capture, trace, edits) so backgrounding or interruption never loses work.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Codex and Claude ended up telling almost the same story from two different angles — Codex from "what's the honest product mechanics" and Claude from "what does this feel like for the actual seller at her kitchen table" — and they reinforce rather than contradict each other.

**Target user & use case:** A solo illustrator, hand-letterer, or print-on-demand seller who draws on paper first and needs one clean vector file today — for a listing, a cut file, a product drop — without a scanner, without Illustrator's manual retrace/deskew/cleanup dance, and often without deep vector-tool knowledge.

**Paid value:** Free tier does the whole core promise, unlimited times — capture, correct, trace, light cleanup, export SVG/PDF, no watermark, no format bait-and-switch, because that's the app's right to exist. Subscription lives in things a real production workflow needs once someone has more than one sketch: batch processing (photograph/import a stack, walk away, come back to finished exports), higher-fidelity tracing presets (fine-detail mode for denser linework/serif lettering), the future pro editing tier (real anchor/Bezier dragging, already reserved in the contract), and cloud backup/sync of recent-traces history. All four are functional upgrades tied to real recurring pain, not cosmetic gates.

**Core loop:** Unchanged from earlier phases and both agents want it held there exactly: new trace → capture/import → quality gate with specific retake guidance → auto-correct (perspective/shadow/threshold) → auto-vectorize → before/after review → light, failure-mode-specific cleanup → export → save to recent traces. Claude added that every step of that pipeline needs a progress state that names what it's doing (correcting perspective, isolating linework, tracing) rather than a generic spinner, since the processing genuinely takes seconds and silence during those seconds reads as broken.

**Competitive wedge:** Not "better tracing algorithm" in the abstract — better than a scanner app because you get real paths, better than Illustrator's Image Trace because she never leaves her phone or does a desktop round-trip. The wedge is bounded capture-rescue plus honest rejection: fix what's fixable, clearly refuse what isn't. Both agents flag the same risk as the single biggest thing that could sink the product: if shadow/perspective correction doesn't actually hold up on real kitchen-table photos, the wedge disappears and it's just an over-promising scanner app.

**Growth angle:** Niche, not broad — POD sellers, Etsy seller groups, Cricut communities, and illustrator TikTok/YouTube already share before/after transformation content. The product needs to generate that shareable moment itself (the before/after screen should look good enough to want to post), rather than relying on any built-in social feature.

**Local-first/cloud-ready:** Fully local and offline-capable in v1 — source photos, previews, vector outputs, recent-trace metadata, edit history, no account required, sketches never leave the device unless the user opts into backup. That's framed as a genuine trust point for this user (she's often working pre-release designs), not just an architecture choice. Cloud shows up later, cleanly separated, as opt-in sync of recent-traces history and possibly cross-device batch pickup — never a v1 dependency.

One thing flagged but not yet a disagreement: Claude named the trust curve (trace #2 and #3 needing to feel faster/more trusted than trace #1) as the thing to protect above all in design — this is a design-phase concern, not a brief-level dispute, and nothing in Codex's position pushes against it.

No live disagreement between the two active participants. Gemini remains unavailable.

## Detailed Discussion

Good news — the two things I flagged as genuinely open both got resolved with real give-and-take, not just one side caving.

On monetization, Codex came around independently to exactly the position Claude was arguing: no live StoreKit in this MVP. Building a purchase flow for batch/fine-detail/pro-editing/cloud-sync when none of those exist yet would be the same overclaiming sin the app is designed to avoid in its own tracing pipeline. Landing spot: free loop ships complete and unlocked, settings has an honest non-purchasing "Pro — coming soon" note, zero StoreKit code, zero disabled toggles in the main workflow.

On storage, this wasn't "pick a side" — it was a genuine synthesis. Claude proposed keeping the raw capture only transiently (through the correction/review step, so the "inspectable, reversible" requirement is real), then discarding it and keeping the corrected working image + vector data forever until manual delete. Codex arrived at essentially the same shape from the other direction — "persist a normalized working original, not the raw camera file" — with the added detail that orientation-correction, downsampling, and metadata-stripping should all happen at that same normalization step. Both agree: no silent eviction, manual delete only, and EXIF/location/timestamp get stripped at ingest rather than lingering in a retained asset (which matters once cloud sync shows up later).

Codex also explicitly signed off on the rest of Claude's round-1 batch — PHPicker over full library access, EXIF-orientation handling as product correctness not just plumbing, the VoiceOver list-fallback for path cleanup — and drew one useful new boundary: dark pencil is in-scope only when the quality gate judges contrast sufficient, blue ballpoint is explicitly excluded rather than left to silently underperform.

Claude added a few things this round Codex hasn't directly reacted to, but they're extensions of the same honesty principle both sides already hold, not new fights: splitting "contrast too low" into a separate "sketch too faint to trace — darken your lines or go over it in pen" reason (since that's a drawing problem, not a photo problem, and no retake fixes it); making the quality-gate rejection reasons a fixed named vocabulary rather than free-form strings, so repeat failures feel recognizable instead of random; and naming live in-camera framing guidance (à la VisionKit's document scanner) as a requirement direction for architecture to weigh, rather than defaulting by accident to post-capture-only rejection.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
- MVP supports one artifact class: high-contrast monochrome linework (black ink, dark marker, dark pencil when contrast is sufficient) on plain paper, one sketch per job. Blue ballpoint, shaded graphite, watercolor, multicolor illustration, and multi-object pages are explicitly out of scope, not silently degraded.
- Capture/import via live camera or PHPickerViewController (not full photo-library access) — reduces permission friction and strengthens the local-first privacy claim.
- Every pipeline stage is inspectable: user can view original, corrected/normalized preview, and traced vector preview, with undo/redo across edits.
- Quality-gate rejections use a fixed, named vocabulary (e.g., skew-too-high, shadow-coverage-too-high, blur-too-high, contrast-too-low, sketch-too-faint, no-sketch-region-detected, ruled-paper-interference), each with specific, consistent copy — not free-formed per attempt — so repeat failures are recognizable rather than random.
- "Sketch too faint to trace" is a distinct rejection reason from generic low-contrast/lighting problems, since faint pencil pressure is a drawing problem no retake fixes.
- Architecture should treat live, in-camera framing guidance (real-time edge/skew feedback before the shot is taken, in the spirit of VisionKit's document scanner) as a requirement direction to evaluate, not default to post-capture-only rejection — the implementation choice (custom vs. VisionKit-based) is deferred to the architecture phase.
- No live StoreKit subscription in this MVP. The complete free loop (capture, correct, trace, cleanup, export) ships fully unlocked. A non-purchasing, honestly-worded "Pro — coming soon" entry in settings describes planned batch/fine-detail/pro-editing/cloud-sync features. No paywall code, no disabled premium toggles in the main workflow.
- Storage/retention: the raw full-resolution capture is transient, kept only through the correction/review step. Once the user proceeds past review, the app discards the raw capture and persists a normalized working image (orientation-corrected, downsampled, EXIF/location/timestamp stripped at this point) plus the vector result — retained indefinitely in the recent-traces list until manual delete. No silent LRU eviction.

**Edge cases:**
- Camera permission denied → import path (PHPicker) must remain fully usable; app must not degrade to a dead end.
- App backgrounded/killed mid-processing → resume from the last saved checkpoint (source or normalized image), not from a partially-run Vision request; never silently lose the source.
- Export destination/share-sheet failure → traced file remains available in recent traces so the user isn't forced to rerun the pipeline.
- HEIC/EXIF orientation must be respected at ingest, before any correction — a silently rotated/mirrored result destroys trust instantly.
- Ruled/grid notebook paper must be distinguished from foreground sketch lines in preprocessing, since this is one of the four committed acceptance fixtures.
- Lettering vs. closed-shape illustrations fail differently (stroke continuity/corner fidelity vs. closed loops not being accidentally filled) — both need to be covered by the acceptance bar, not just one.
- Faint/light pencil source material is a distinct failure mode from bad photo conditions and needs its own honest rejection message.
- VoiceOver users can't precision-tap a small stray vector fragment on a canvas — cleanup needs an accessible list-based fallback (select/delete/merge by name, not just by touch).
- Simplify-strength slider dragging must be debounced and operate on a downsampled preview (full-res only on commit) to avoid visible lag/thermal throttling on older supported devices.

**Data and privacy implications:**
- Sketches never leave the device by default; no account required in MVP.
- No analytics SDK, no phone-home crash reporter, no network entitlement usage in this build — the local-first claim must be auditable, not just asserted in copy.
- EXIF metadata (location, timestamp, device model) is stripped at ingest, not just at export, so nothing sensitive is sitting in retained assets waiting to leak once cloud sync is added later.
- Camera/photo-library usage-description strings must be specific and true, not boilerplate.
- Recent-traces list is unbounded in count with manual delete only — no background/automatic deletion of a user's work.

**Risk register:**
- Capture-rescue overclaim: app markets itself as forgiving but only performs on near-ideal photos. Mitigation: named, testable support envelope plus fixture-based QA using deliberately imperfect photos.
- Vector quality overclaim: technically valid SVG that's still unusable (too many fragments/nodes). Mitigation: the existing clean-trace bar plus real downstream-open tests in a mainstream vector tool.
- Editing-scope mismatch: cleanup tools too weak for real failure modes while the app doesn't fail early enough to stop bad traces. Mitigation: keep cleanup tools mapped to actual failure classes; reject inputs that would need desktop-class editing.
- Trust decay across repeat use: same sketch succeeding once and failing later without explanation, or vague/inconsistent error messages. Mitigation: fixed rejection-reason vocabulary with consistent copy, faster/more predictable repeat use, remembered settings.
- Silent quality miss within "supported" bounds (e.g., a pencil sketch that's technically accepted but underperforms): mitigation is explicit contrast-sufficiency judgment at the gate rather than a blanket "pencil is fine" assumption.
- Half-built monetization risk avoided by decision above (no live paywall for non-existent features).
- Storage bloat / silent data loss risk avoided by the normalized-working-copy retention policy (bounded storage, no silent eviction).

**Final assumptions:**
- iPhone-first (not iPad-first) for MVP.
- Fully offline-capable after install; no server-side processing.
- One-sketch-at-a-time jobs; only a flat, bounded (by delete-only, not count) recent-traces list — no project/library management.
- Black-line output only; color-aware tracing is out of scope.
- Free tier ships the complete, unwatermarked core loop; no StoreKit/subscription code in MVP, only an informational "Pro — coming soon" settings entry.
- Autosave checkpoints at capture, post-normalization/review, post-trace, and post-edit.
- Raw capture is transient (through review only); normalized working image + vector result are the durable, recoverable assets.
- Quality-gate rejection reasons form a fixed, named set with dedicated copy, including a distinct "sketch too faint" reason separate from photo-condition reasons.
- Live in-capture framing guidance is a direction for the architecture phase to design against, not a locked implementation choice.
- Device floor and precise perf/thermal targets are deferred to the architecture phase, but debounced/downsampled interactive previews are a locked requirement for any slider-driven re-processing.

## App Features

Looking at this round, Codex and Claude landed on essentially the same feature map — they just carved it up differently (five capabilities vs. a flat list) and Claude used its turn to force two decisions that earlier phases had left hanging rather than to disagree with anything Codex said.

Both agree on the must-have spine: camera + PHPicker intake with permission-denied still leaving import usable; a quality gate that rejects with the fixed named reasons already locked in the requirements phase; an inspectable correction/normalization preview; vectorization with named progress states (not a spinner); a before/after review; the exact contract-defined cleanup set (select/delete path, debounced simplify slider on a downsampled preview, merge paths, undo/redo) with a VoiceOver list-based fallback; SVG+PDF export that survives share-sheet failure; a flat recent-traces list with manual delete only; checkpointed autosave at capture/normalization/trace/edit; and full empty/loading/success/error coverage. Claude additionally named a settings screen (privacy statement + honest "Pro — coming soon" note) as must-have rather than could-have, which Codex's could-have list already gestured at but didn't formalize — a sharpening, not a fight.

The two things earlier phases explicitly punted — live in-camera framing guidance, and exactly what "resume after interruption" means — both got resolved, and resolved the same way by both agents rather than argued over: framing guidance is should-have (post-capture gate alone satisfies the honesty requirement; live guidance is a genuinely harder CV problem that risks ballooning scope), and resume must land the user at the last *committed* checkpoint, never mid-gesture, with concrete test criteria (a real VoiceOver session, a scripted kill at each checkpoint) rather than just "autosave exists." Codex's own acceptance criteria for persistence already implied this same behavior, so it's convergence, not a late override.

No live disagreement between the two active participants. Gemini remains unavailable.

CONSENSUS: YES

## Final Output

**Must-have features** (each ties directly to the locked product promise — fast, trustworthy paper-sketch-to-vector export):

1. **Sketch intake — camera or import.** *Story:* as a user with a finished paper sketch, I can start a trace from my camera or an existing photo, and declining camera access doesn't block me. *Acceptance:* both entry points work; camera-denied still allows full PHPicker import; unreadable/unsupported images produce a specific error state, not a crash or blank screen.

2. **Capture quality gate with named rejection reasons.** *Story:* as a user, if my photo can't be traced reliably I get a specific, consistent reason and a next step. *Acceptance:* gate runs before correction; uses the fixed vocabulary (skew-too-high, shadow-coverage-too-high, blur-too-high, contrast-too-low, sketch-too-faint, no-sketch-region-detected, ruled-paper-interference); each has stable, specific copy; out-of-envelope images never silently proceed to trace.

3. **Ingest normalization + correction review.** *Story:* as a user, I can see what the app did to my photo (orientation, perspective, threshold) before committing further. *Acceptance:* HEIC/EXIF orientation corrected immediately; EXIF metadata stripped at ingest; original and corrected preview both viewable; user can back out without losing the source at this stage.

4. **Deterministic on-device vectorization with named progress states.** *Story:* as a user, I know what's happening during processing instead of staring at a generic spinner. *Acceptance:* stages are labeled (e.g. "correcting perspective," "isolating linework," "tracing paths"); output has bounded node counts; trace failure has its own explicit error/recovery state; everything runs offline.

5. **Before/after review.** *Story:* as a user, I can compare my sketch to the vector result before touching cleanup or export. *Acceptance:* corrected image and traced output are both visible together; a poor-enough trace can route back to retry rather than forcing export.

6. **Bounded cleanup tools.** *Story:* as a user, I can fix the predictable auto-trace mistakes without needing a full vector editor. *Acceptance:* select+delete a path, simplify/smooth-strength slider (debounced, downsampled-preview during drag, full-res on commit), merge selected paths, undo/redo; a VoiceOver-accessible list (not canvas-only) supports select/delete/merge, verified with an actual VoiceOver session, not just labels.

7. **Export to SVG and PDF.** *Story:* as a user, I leave with a file I can actually use downstream. *Acceptance:* both formats export as real vector paths (not flattened images); export/share-sheet failure never destroys the trace, which stays available in recents.

8. **Local persistence + interruption recovery.** *Story:* as a user, I never lose work from backgrounding, a phone call, or a crash. *Acceptance:* autosave checkpoints at capture, post-normalization, post-trace, post-edit; on relaunch after a kill, the app resumes from the last **committed** checkpoint (never a half-applied slider drag or partial Vision request), verified by a scripted kill-and-relaunch test at each checkpoint; recent traces are reopenable and manually deletable, unbounded in count, no silent eviction.

9. **Empty/loading/success/error states across the whole flow.** *Story:* as a user, every screen tells me clearly what state I'm in. *Acceptance:* recents list, intake, gate, correction, processing, review, cleanup, export, and every named failure path all have an intentional designed state.

10. **Settings screen: privacy statement + honest "Pro — coming soon."** *Story:* as a user, I can verify my sketches stay on-device and see what's planned without being sold something that doesn't exist yet. *Acceptance:* plain-language local-first statement; non-purchasing "Pro" entry describing planned batch/fine-detail/pro-editing/cloud-sync; zero StoreKit code, zero gated toggles anywhere in the main workflow.

**Should-have:**
- Live in-camera framing guidance (real-time skew/edge feedback pre-shutter) — deferred because the post-capture gate alone already satisfies the honesty requirement, and this is a materially harder CV feature.
- Remembered simplify/threshold/export preferences across traces, to serve the repeat-use trust curve.
- A borderline-confidence indicator on trace results that pass the gate but are marginal.
- Lightweight recents metadata (date, thumbnail, export status).
- An internal fixture/demo set for QA sanity checks during development.

**Could-have (only if essentially free):**
- Shareable before/after snapshot from the review screen.
- Duplicate-trace-to-try-alternate-settings.
- Rename a saved trace.
- A short static (non-interactive) first-run walkthrough.
- A "retake tips" overlay visualizing the rejection vocabulary.

**Won't-build:**
- Full anchor-point/Bezier-handle editing.
- Freehand drawing canvas, layers, brushes, text tools, fills — any general illustration surface.
- Batch import/processing, fine-detail tracing presets, cloud sync/backup.
- Any live StoreKit purchase flow or disabled premium toggle.
- Color-aware/multi-color tracing, automatic multi-object page splitting.
- Support claims for blue ballpoint, shaded graphite, watercolor.
- Searchable/organizable project library (folders, tags, cross-trace search) beyond the flat recents list.
- AI restyling/style-transfer or generic image-editing features.
- Dedicated iPad layout (iPhone-first; SwiftUI default scaling is fine, no bespoke iPad work).
