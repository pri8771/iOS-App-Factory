# truescale — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where the discussion landed: Codex laid out a full execution contract — working local-first SwiftUI app, capture speed + report credibility as the core bar, manual measurement as the real baseline with AR strictly optional and device-gated, the full MVP workflow list, and a clear non-goals list (no backend, no LLM, no compliance bloat, no fake production-ready claims). I came in and didn't contradict any of that — I just flagged two things that were left as soft, undefined edges: the "professional tolerance" kill-criterion for AR has no actual number attached anywhere in the spec, and "2 active projects/month" is ambiguous between a concurrent cap and a rolling monthly counter, which changes the data model. I also flagged that this child conversation shouldn't silently absorb the parent portfolio's orchestration asks (Jira, Notion, transcript-combining, parallel-app management) — that's a level above what "build truescale" means here. Gemini didn't weigh in (CLI unavailable).

Nobody pushed back on Codex's contract, and my additions are refinements/named assumptions rather than disagreements — they slot into the same contract rather than fighting it. This reads as real convergence, not just Codex talking and me nodding past the actual sticking points, since the two things I raised are exactly the kind of ambiguity this phase exists to pin down before it hardens into schema and code.

CONSENSUS: YES

## Final Output

**Original prompt**: preserved verbatim above in initial_prompt.md — Truescale, MVP build, priority 2, full spec as written. That's the source of truth for every later phase.

**Hard requirements**
- A working, local-first SwiftUI iPhone app — not a concept, not a demo path.
- Core loop: create project → define areas/rooms → capture issue (photo + severity + status + note + measurement) in seconds → browse/filter/history → generate branded PDF → share/export. All of it must work fully offline.
- Manual measurement entry is the default, always-available input. AR/LiDAR measurement is an additive, device-gated (iPhone 12 Pro+) precision layer — present when supported, never a blocker when it isn't.
- Subscription paywall: free tier capped at **2 simultaneously-active projects** (named assumption — concurrent-status cap, not a rolling monthly counter, chosen because it's the simpler, more deterministic model to build, test, and enforce against restore-purchase logic); Pro ($14.99/mo or $119/yr) unlocks unlimited projects, custom report branding, advanced export, AR capture.
- Design must deliver: bright-light legibility, large touch targets, one-handed capture, strong hierarchy — an "instrument panel" feel, not generic CRUD chrome.
- Local data model must be structured so cloud sync could be bolted on later without redesigning the project/observation schema — a architectural discipline now, not a feature now.

**Non-goals for v1**
- No backend, accounts, team collaboration, client portals, signed approvals, or cloud sync.
- No LLM feature.
- No broad inspection/compliance tagging ontology — keep severity/status narrow and fast.
- No attempt to out-platform Fieldwire/CompanyCam as multi-user tools.
- No portfolio-level orchestration artifacts (Jira board, Notion project, cross-app transcript combining, parallel-app management) inside this conversation — those belong one level up, at the parent-portfolio orchestrator, not in the truescale build itself.

**Production-readiness definition**
- Every core workflow (project → area → issue capture → filter/browse → PDF export → paywall hit/clear → restore purchases) works against real persisted data across a full app relaunch, not a single in-memory session.
- Every screen has real empty, loading, success, and error states — camera-permission-denied and location-permission-denied are critical-path states, not edge cases, since photo capture is the product.
- AR gets a named, explicit accuracy target as its working tolerance bar — **±2% or ±1cm on typical room-scale dimensions, whichever is larger** (named assumption since the source spec gives no number) — but the team acknowledges this can only be *implemented correctly and gated properly* in this environment, not empirically field-validated, since there's no physical LiDAR-equipped device available in this build loop. "Production-ready" for AR means correct capability-gating and clean fallback, not verified real-world precision — that gap must be stated, not hidden.
- Non-AR (manual measurement) path is treated as the primary, fully-tested path, since most target users won't have Pro hardware.
- StoreKit/paywall verified via local StoreKit configuration file and testable transaction flows — that counts as "done" here; real App Store Connect submission and live signing are out of scope.
- Accessibility, privacy behavior (camera/location permission handling), and real persistence are product requirements, not polish to defer.

**Decision rules for later phases**
- Cut anything that doesn't improve speed, clarity, or report credibility.
- If AR accuracy can't be demonstrated within the ±2%/±1cm tolerance (or can't be demonstrated at all in this environment), descope or conservatively label it — never sell it as verified.
- Reject any design choice that looks premium but hurts outdoor readability or one-handed operation.
- If schema/workflow starts drifting toward enterprise inspection software, simplify back down.
- If monetization friction threatens the core proof of value, push the paywall later in the flow rather than gate the demo of value.
- Between more features and a fully finished capture→export loop, always finish the loop first.
- AR slipping, breaking, or being unverifiable is grounds to descope AR only — never grounds to delay or water down the rest of the app.
- Any ambiguity in the source spec (like the two flagged above) gets resolved by naming the assumption explicitly in that phase's output, not by quietly picking one and moving on.

## Product Research

Both Codex and Claude are pointing at the same app from two angles — Codex from UX/design, Claude from field-conditions/risk — and neither contradicts the other. This reads as genuine convergence already, not a stalled discussion.

CONSENSUS: YES

## Final Output

**Audience and use context**
The real buyer is a solo or near-solo field professional (renovation contractor, home inspector, property manager, insurance adjuster) who already documents issues on an iPhone and currently rebuilds a report later at a desk. They're standing, often one-handed, sometimes gloved, frequently in bright sun or dim utility spaces, moving room to room, with unreliable connectivity, and get interrupted mid-task constantly (calls, clients walking up). This isn't a desk app used occasionally — it's a field instrument used in short intense bursts.

**Comparable apps or patterns to learn from**
- **CompanyCam** — closest analog for photo-first, project/tag capture at volume; lesson is the photo+tag loop must be near-zero-friction since users take dozens of photos per visit.
- **Fieldwire** — cautionary tale for scope creep into full project-management/enterprise territory, exactly the bloat risk the spec already warns against.
- **HomeGauge/Spectora** — inspection-report tools that rely on heavy templates and desk-based finishing; negative example, since if Truescale needs desk cleanup before sending, its core promise is dead.
- **Magicplan/Canvas** — nearest AR-measurement precedent, but built around scan-to-floorplan, not "one measurement attached to one photo" — there's no ready-made UX pattern to copy here; this interaction has to be designed from scratch and kept simple.
- General pattern to copy: fast capture, room/area grouping, credible photo-first reports. Pattern to avoid: enterprise setup friction, big form schemas, hidden exports, anything that turns capture into filling out a database.

**Platform-specific opportunities**
- Camera capture must be the center of gravity of the app, not buried in navigation.
- App Intents/Shortcuts for "start project" / "new issue in last-used project" matter more here than typical, since "faster than camera-plus-notes" is a literal tap-count/navigation-depth claim that needs a real answer, not a vibe.
- PDFKit + share sheet are straightforward, strong wins for finishing the job on-device.
- Location stamping via CoreLocation should be quiet, invisible metadata that degrades gracefully — many job sites (basements, windowless commercial spaces) will have poor/no GPS fix, and that can never block capture.
- AR measurement should be layered into the same capture flow as manual entry, not a separate mode/screen that fractures the product's mental model.

**Major assumptions and risks**
1. Free-tier cap enforced on concurrently-active projects, not a calendar counter (carried from prior phase).
2. AR-capable devices are a minority path in v1 — the app must feel fully premium without them, and manual + AR must converge into the same observation model and report layout, or the app feels bolted together.
3. AR/LiDAR tracking degrades in exactly the conditions this app will be used in (dim rooms, textureless walls, crawlspaces) — a device-capability check alone is not enough; a real "tracking lost, fall back" state is required, not just a capability gate.
4. No physical LiDAR device and no camera/AR support in Simulator in this build environment — camera and AR paths can only be verified via code-path/logic review and injectable-service testing, not real on-device behavior. This also means real bright-sunlight legibility and one-handed reachability can be designed for but not observed/verified here.
5. Zero-backup local-first storage means a lost/damaged phone or a data-loss bug destroys a full day's billable documentation with no recovery path — worse than any SaaS competitor. This makes autosave-on-every-step and robust local persistence a day-one requirement, not hardening for later.
6. Draft loss during interrupted capture (call, client interruption) is a realistic everyday failure mode, not an edge case — losing an in-progress photo+note would make the app worse than plain camera-plus-notes.
7. Free-tier report output must still look credible enough to send to a client, or the paywall undercuts the exact "prove it's better" moment that has to happen before anyone upgrades.
8. Over-structuring a single issue (too many required fields) loses to just snapping a photo and typing later — severity/status/area assignment need to stay narrow, fast, and forgiving.

**Implications for the first build**
- Design around five core screens: project library (active vs. archived), project workspace grouped by area, a fast capture screen (photo first, minimal required tags), an issue detail/edit screen for later cleanup, and an export/report preview that proves the PDF is client-ready.
- Treat the AR measurement module as a genuinely separable capability behind a measurement-input abstraction — not a duplicated parallel code path — so that descoping AR later (per the invalidation criteria) is a deletion, not a rewrite.
- Build autosave/draft persistence into issue capture from the very first screen, using on-device persistence as the source of truth immediately rather than deferring real storage to a later pass.
- Handle photo storage sizing (compression/downsampling) from day one — there's no cloud offload valve in v1, so unbounded growth is a real problem, not a future one.
- Make area assignment inline/frictionless during capture (no backing out to "manage areas" as a separate detour).
- Include at least a minimal App Intent ("new issue," "start project") in MVP scope itself, since the speed claim is measured, not assumed.
- Label measurement source/confidence explicitly in the UI (manual vs. AR) — never present them as equivalent — so professional users can trust what they're sending to a client.
- Be explicit in later phases and final reporting that camera/AR behavior is verified by code review and simulated inputs in this environment, not by physically observing bright-light legibility or on-device AR accuracy.

## Portfolio Selection

Both Codex and I looked at this from different angles — Codex from a pure process/structure standpoint, me from a "don't lose sight of the actual user" standpoint — and we landed in exactly the same place with nothing to argue about. This is a single-app child project, not a portfolio parent. The two-app split ("build 2 completely separate iOS apps") already happened one level up in the parent orchestrator; what arrived here is one fully-specified app (`truescale`) with a slug already chosen. So there's no menu of ideas to debate, no sibling category to weigh, and no `portfolio-json` manifest to produce — producing one would be inventing a decision that was never this conversation's to make.

Codex's contribution was mostly a clean process guardrail: don't let this phase manufacture a fake multi-app selection just because the phase name says "portfolio_selection." My contribution was making sure that conclusion doesn't turn into an excuse to build for "portfolio bookkeeping" instead of the actual target user — the solo field professional — and pinning down that AR must never be treated or presented as the primary/first-class path, with manual entry as some lesser fallback.

No open disagreement. Gemini didn't weigh in (CLI unavailable), but nothing it would add contradicts this — the structural fact (one app, already selected upstream) isn't really debatable.

CONSENSUS: YES

## Final Output

**Single-app vs portfolio-parent decision:** Single app. This conversation is a child build for one already-selected app, not a portfolio parent making a selection among candidates.

**Selected app list:**
- `truescale` — category: professional field tool / AR-assisted documentation; promise: capture site issues faster than camera-plus-notes and turn them into structured, client-ready reports, with true-to-scale AR measurement attached to every photo on supported devices; target user: solo/near-solo field professionals (contractors, home inspectors, property managers, insurance adjusters) documenting issues from an iPhone; build: `true`

**Selection rationale and rejected alternatives:** No alternatives were considered or rejected in this conversation — the app-idea generation and the "choose the best two" comparison the parent prompt asked for already happened at the parent-portfolio level (`multi-app-exp3`), outside this child project's scope. This phase's job here is simply to record that fact and avoid re-deriving or second-guessing a decision this conversation doesn't have visibility into (it can't see the sibling app, so it has no basis to compare against it).

**portfolio-json manifest:** Not applicable — no manifest is emitted, because this is not a portfolio-parent phase. The explicit record for this phase is: *no portfolio split is needed here; the split already happened upstream, and this project owns exactly one app, `truescale`.*

**Carried-forward scope discipline for later phases:** Manual measurement stays the first-class, always-complete path; AR is a device-gated bonus layer that must never be presented as the "real" version of the app with manual entry as a degraded fallback. The free/Pro split should read as "more of a good thing" unlocked, never as a deliberately hobbled free experience. Everything from here forward is judged against one bar: does it make a solo field professional's capture-to-report workflow faster and more credible than his current camera-plus-notes habit.

## Initial Discussion

CONSENSUS: YES

## Final Output

Codex and Claude came at this from different angles — Codex focused on the product promise and strategic wedge, Claude focused on the actual screen-by-screen mechanics and state handling — and they landed on the same app with no real friction. Codex's worry was "don't let AR become the thing the whole product leans on when the real differentiator is structured speed." Claude's worry was "don't let extra decision points during the 8-10 second capture window kill the speed promise, and don't let the manual/AR question become a branching UI choice." These aren't competing views, they're the same conclusion seen from two levels of altitude. Gemini didn't weigh in (CLI unavailable), but nothing here is contentious enough to need a third voice to break a tie.

**One-sentence product promise:** Truescale turns an on-site walk-through into a client-ready report before the professional leaves the property — snap a photo, tag it, and it's structured and exportable, with true-to-scale measurement attached manually or, on supported hardware, via AR.

**Primary user and scenario:** A solo or near-solo field professional (contractor, home inspector, property manager, insurance adjuster) walking a site alone, room by room, often one-handed, sometimes interrupted mid-task, in bright or dim conditions. The design-driving scenario is not "sit down and log an issue later" — it's "phone half-raised, defect right in front of you, maybe 8-10 seconds before you move on or get pulled away." Every screen decision gets judged against that window, not against a leisurely desk-use case.

**Core loop:** Open app → land on last-used project/area (not a picker) → capture photo (camera-first, not buried) → tap severity/status as single-tap chips → measurement is one tappable field that's either typed or AR-captured (never an upfront "manual or AR?" branch) → optional short note → done, ready for the next issue. Separately, at a slower tempo: browse/filter by area, severity, or status, then generate and export a branded PDF straight from the phone.

**Hard scope boundaries:** v1 is a solo documentation tool, not inspection software and not team software. In scope: project creation, area/room grouping, photo + severity + status + note + measurement per issue, filtering/browsing, branded PDF export, free/Pro paywall. Out of scope: backend, accounts, collaboration, client portals, signatures, compliance-template taxonomies, photo annotation/markup tooling, task management, multi-project batch export, report customization beyond a Pro logo/business-info header. If a proposed feature doesn't feed capture, organize, or export, it doesn't belong in v1.

**Measurable success criteria:**
- Cold-open to a saved, photographed, tagged issue takes roughly 4 taps or fewer on the manual path (project/area defaulted, photo, severity chip, done).
- A project with several areas and a dozen-plus issues produces a PDF a user could attach to a client email with zero further editing.
- Killing the app mid-capture and reopening it recovers the in-progress draft rather than losing it.
- Project library, area list, capture screen, and issue list all have real empty states with a clear next action — first launch goes straight to creating a first project and lands on its capture screen, no blank intermediate screens.
- Devices without AR support never hit a dead end — manual measurement is complete and full-featured on its own.
- Manual and AR measurement always terminate in the same data shape and the same UI slot, never two parallel paths the user has to choose between.

## Per App Product Brief

CONSENSUS: YES

Codex and Claude approached this from the same altitude and landed on the same brief — Codex laid out the strategic shape (capture engine, not AR gadget; paid bundle must justify itself even without AR; wedge is speed+structure vs. camera-notes and vs. team-SaaS bloat; growth is reports-as-marketing, not virality), and Claude took every one of those points and made it concrete and buildable: exactly how the 2-active-project cap gets enforced offline, what "active" means as a user-visible toggle, what happens on downgrade (archive/lock, never delete), why free-tier reports must be full-quality with no punitive watermarking, and a sharper, more falsifiable version of the wedge ("zero setup, no account/company profile" instead of the vaguer "faster than camera-plus-notes"). Nothing here contradicts — Claude is operationalizing Codex's strategy, not arguing with it. Both explicitly reject forcing virality and both agree AR is never the load-bearing feature. This is real convergence, not two people talking past each other.

## Final Output

**Target user and use case:** A solo or near-solo field professional — renovation contractor, home inspector, property manager, insurance adjuster — standing on-site, phone in one hand, whose current workflow is camera roll + Notes app + tape measure + a desk session later rebuilding a report. The use case Truescale is built for is finishing most of the report *while walking the site*, not writing a better one afterward.

**Paid value and subscription value:** Free tier: 2 simultaneously-active projects (archiving is the deterministic, user-visible toggle that defines "active"), manual measurement, full-quality unbranded PDF export — free output must be genuinely client-sendable, never stripped-down or watermarked as a nag, because the free tier's job is to prove the workflow before anyone pays. Pro ($14.99/mo or $119/yr) removes the project cap, adds custom report branding (logo/business header), richer export formats (advanced PDF/CSV), and AR-measured capture on supported hardware. Enforcement is local/offline-capable via cached StoreKit entitlement, checked at project creation; if a user ends up over the cap (e.g., lapsed subscription), the app never deletes data — oldest-by-last-modified active projects go read-only (viewable, not editable/exportable) until archived down or re-upgraded. The subscription has to earn its price through operational value — more concurrent jobs, cleaner client-facing output, AR precision — not through cosmetic restriction of the free tier.

**Core loop:** Open app → land on last-used project/area → tap capture → camera fires immediately → single-tap severity chip + status chip → one measurement field (manual by default, AR-tappable when the device supports it and tracking is stable — never an upfront "manual or AR?" branch) → optional short note → saved, ready for the next issue. Separately, at a slower tempo: browse/filter by area, severity, or status, then generate and export a branded PDF via the share sheet.

**Competitive wedge:** Not AR, and not even "speed" in the abstract — it's zero setup. CompanyCam and Fieldwire assume a company account, a workspace, maybe an invite flow; Truescale's wedge is download → tap once → you're documenting, no login screen, no team model, because the SaaS incumbents structurally can't offer that at any price (their business model requires seats). Manual-measurement structured capture alone already beats camera-plus-notes by collapsing camera/notes/organization into one step; AR adds precision without adding hesitation, but the product must stand fully on its own without it.

**Viral or niche growth angle:** No real viral loop — the output (a client-facing PDF) goes to one client, not to the professional's peer network, so forcing virality (e.g., "Made with Truescale" watermarks) is explicitly ruled out because it would violate the free-tier-credibility rule above. The real, honest growth mechanism is niche word-of-mouth: a sharp, professional PDF handed to a client (who is often themselves a small business owner or landlord) prompts "what app made this," and trade-community word of mouth (local trade groups, r/homeinspection, r/Construction) does the rest — slower and narrower than consumer virality, stated as such rather than dressed up.

**Local-first and cloud-ready plan:** Everything lives on-device (SwiftData), autosaved at every step of capture — not just on explicit save — because backgrounding mid-capture is a normal daily occurrence for this user and losing a draft would be worse than the camera-plus-notes baseline it replaces. No feature in v1 requires connectivity. The schema uses stable UUIDs and explicit createdAt/updatedAt on every entity now, specifically so future optional cloud backup/sync, team sharing, and client portals can layer on as an additive sync layer later without redesigning what a project/area/observation is. Photo storage sizing (compression/downsampling) is a day-one production requirement, not later hardening, since unbounded on-device growth is the most likely silent churn cause (a "storage almost full" moment) nobody will report as a bug.

**Why this app deserves to exist:** The default workflow for solo field documentation today is absurdly fragmented, and the SaaS alternatives are built for teams, not individuals. Truescale's reason to exist is narrow and real: it removes the desk-reconstruction step and produces a client-ready report before the professional leaves the property. If it can't do that, it's just a nicer notes app — and the team's shared discipline going forward is to protect the capture loop's speed against every future feature request that would tax it.

## Next Steps Small

CONSENSUS: YES

## Final Output

Codex and Claude both landed on the same shape for the smallest slice, even though they emphasized slightly different guardrails, so this reads as real convergence rather than two people talking past each other.

**MVP slice:** One complete, real, offline workflow — create a project → add area(s) inline → capture several issues (real photo + severity chip + status chip + optional short note + manual measurement) → browse/filter that list by area/severity/status → generate a genuinely credible PDF, grouped and readable → share it off the phone. No AR, no paywall, no CSV, no branding beyond a clean basic header — those are sequenced next, not abandoned, and both agents were explicit that this is a first checkpoint inside the full build, not a shrinking of what "done" ultimately means per the prompt contract.

**Must-have interactions:** Cold start goes straight into creating a first project and lands ready to capture — never an empty library. Camera is already live on the capture screen, not a button away. Severity/status are single-tap chips. Measurement is one tappable field, manual-only for now, and has to feel effortless enough that people don't skip it. Areas can be added inline mid-capture with no detour to a management screen, defaulting to last-used. Everything autosaves/draft-saves continuously, because interruption (calls, clients walking up) is normal here, not an edge case — and both agents want this specifically proven, not assumed: kill the app mid-capture, relaunch, confirm the draft survived. The issue list needs real filtering (area/severity/status), not just a flat dump, since "review by area or urgency" is a named core workflow.

**Cut list:** AR/LiDAR measurement entirely, the subscription paywall and project-cap enforcement, custom report branding beyond a basic header, CSV/advanced export, location stamping, App Intents, restore purchases, and any deeper project-library sophistication beyond active/last-modified ordering. All of these are explicitly "sequenced next," not killed — the data model should stay shaped so they can layer on without rework, but none of them get built in this slice.

**Validation criteria:** A user can create one project, add two areas, capture at least five issues fully offline, kill and relaunch the app mid-capture and recover everything intact, then export one PDF grouped by area with severity/status/note/photo/measurement-source-labeled-manual, credible enough to send to a client with zero further editing. Claude pushed a sharper version of the same bar — "would I actually forward this PDF to a client right now without embarrassment" — which Codex's "sent without desktop cleanup" bar already implies; these aren't in tension, just phrased differently. Every screen in this narrow slice (capture, area list, issue list, export) needs real empty and error states, not just a happy path, and the whole thing has to be buildable in the next phase without reopening any product questions.

No open disagreement to flag — Claude's only addition beyond Codex's list was naming the interruption-recovery test as something to prove within this same slice rather than defer, and explicitly flagging that "smallest validation slice" must not be confused with "reduced v1 scope." Codex's framing already assumed both of these; nobody pushed back.

## Detailed Discussion

Codex and I ended up circling the same core idea from two different altitudes — Codex nailed the "what must always be true" product rules (unified issue shape regardless of measurement source, narrow severity/status vocab, trust-preserving rules around archiving/downgrade/permissions, AR's three-layer gate), and I went hunting for the specific edge cases that would trip up whoever builds this next (storage-full mid-capture, area deletion with issues attached, EXIF GPS leaking through exports, corrupted photo at export time, schema migration, performance at real job-site volume). Nothing either of us said contradicts the other — my additions are drill-downs into edge cases Codex's higher-level rules imply but don't spell out.

The one spot that looked like a possible tension on first read — Codex describing draft recovery as "the draft exists and survives relaunch unless explicitly discarded" versus me saying "there's no separate draft/save distinction, just incremental persistence" — isn't actually a disagreement once you unpack it. Both of us are describing the same mechanism: an issue record is created the moment the photo succeeds, every field commit writes through immediately, and the only way it goes away is the user explicitly deleting it. Codex's word "draft" and my "incremental persistence" are the same rule from different angles, not competing models.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- One unified issue-record shape regardless of measurement source: photo, area, severity, status, note, measurement value/unit/source, capture timestamp, optional location. Manual and AR must never fork into separate record types.
- Severity vocabulary locked at three levels: minor, moderate, urgent. Status locked at four: open, monitor, repair needed, resolved. Fixed enums, not user-extensible in v1 — extensibility is exactly the "inspection software" scope creep this product has repeatedly ruled out.
- One photo per issue in v1. Multi-photo is a real future request but out of scope now — it also opens a report-layout problem (laying out 1 vs. N photos credibly) nobody has asked us to solve.
- Project/area lifecycle is soft-state, never destructive: projects go active↔archived (user-visible toggle only); areas follow the same pattern — archiving is the primary path, and hard delete of an area is only permitted when it has zero issues attached. Deleting an area with issues in it must never cascade-delete those issues.
- Duplicate area names within a project are allowed (e.g., two "Bathroom" entries in a multi-unit property), disambiguated by creation order/timestamp in the UI — no artificial uniqueness constraint fighting real-world naming.
- Draft/save unification: an issue record is created the moment photo capture succeeds, and every subsequent field edit (severity, status, note, measurement) is an immediate incremental write to that same record — there is no separate draft file or draft/save state machine. The record persists across relaunch and is only removed if the user explicitly deletes it.
- Measurement units default to US customary (feet/inches or decimal inches) with a settings-level override, matching the described target market.
- Report export must degrade gracefully per-issue: a missing or corrupted photo at export time renders a "photo unavailable" placeholder for that one issue rather than failing the whole report. A project or area with zero issues renders an empty section (or is skipped, per design-phase judgment) rather than blocking export outright.

**Edge cases**
- Camera permission: denied/restricted must be a distinct, visible state with a path to Settings — and must be distinguishable from "temporarily unavailable" (another app holds the camera, or the OS prompt hasn't resolved yet). Neither state may block issue creation outright; a placeholder/no-photo path plus retry must exist.
- Photo library access is irrelevant in v1 as long as capture stays camera-only with no "import an existing photo" path; if that import path gets added later, limited-library access becomes a real state to design for.
- Low storage: treated as a first-class capture-screen error state, not just a compression policy — detect and warn proactively rather than letting a photo write fail silently mid-capture and potentially corrupt the draft.
- AR is a three-layer state, not a binary capability flag: unsupported device, supported-but-tracking-unstable, and supported-with-successful-measurement. All three need distinct UI and report labeling — "AR available" is not "AR trustworthy."
- Location: quietly omitted whenever denied or unavailable, never interrupts capture; if ever surfaced in an export, it must be visible and understood by the user, not silently embedded.

**Data and privacy implications**
- Fully on-device: photos, notes, measurements, timestamps, optional location — no account, no background upload, no hidden analytics or server-side processing. This is treated as part of the value proposition (private homes, occupied rentals, insurance-sensitive damage), not just an architecture choice.
- EXIF GPS data is stripped from photos/exports by default. Location stamping was already cut from the MVP slice, but raw camera EXIF can still carry GPS — silently leaking a client's address through export metadata is a real privacy failure, so stripping is the default until location stamping is deliberately built and consented to as its own feature.
- Free-tier exports remain full-quality and complete (this was already locked in `per_app_product_brief`) — reaffirmed here specifically in the privacy/export context: no degraded or watermarked free output.

**Risk register**
1. Over-structuring capture loses to the raw camera app on speed — mitigation: narrow fixed enums, one photo per issue, no required fields beyond photo+severity+status.
2. Generic/amateur-looking report output kills the "send before leaving site" promise — mitigation: premium report design work is a first-class deliverable, not a formatting afterthought.
3. False confidence in AR measurement, especially under poor tracking — mitigation: explicit three-layer AR state, source/confidence labeling in both UI and report, honest ±2%/±1cm tolerance framing (carried from `prompt_contract`), graceful manual fallback.
4. Data loss or storage bloat from image-heavy projects — mitigation: day-one photo compression/downsampling (named as an explicit spec line for the design/architecture phase to pin exact numbers on, e.g. a fixed max long-edge dimension and JPEG quality target), proactive low-storage detection.
5. Monetization friction introduced too early in the value loop — mitigation: paywall/project-cap enforcement is explicitly sequenced after the core loop is proven (per `next_steps_small`), never gating the demonstration of value itself.
6. Schema evolution risk — this is a local-first app with no server, so once real users have real on-device stores, adding fields later (AR measurement fields, paywall/entitlement fields, future cloud-sync fields) must migrate existing data without loss. Named as a limitation to design for from the very first schema (lightweight migration path planned day one), not something to retrofit when Pro or AR ships.
7. Performance/scale risk — nothing prior named a concrete bar; naming one now: the issue list, filtering, and PDF export need to stay responsive at real job-site volume (low hundreds of issues across a dozen-plus areas in a single project), even though this can't be load-tested on physical hardware in this environment — this is a design constraint to build against, not something to discover after the fact.

**Final assumptions**
- "2 active projects" = concurrent active state, defined solely by explicit archive toggle (carried forward, reaffirmed).
- One photo per issue in v1; multi-photo is a deferred future feature, not silently built now.
- Areas are soft-archived, never hard-deleted once they contain issues; hard delete only permitted on empty areas. Duplicate area names are allowed.
- Draft state and saved state are the same thing: incremental, per-field persistence starting at photo-capture success, with no separate draft mechanism — the record is removed only by explicit user deletion.
- Measurement units default to US customary with a settings override.
- EXIF GPS is stripped from stored/exported photos by default until location stamping is built as an explicit, consented feature.
- Camera permission denial/unavailability degrades the workflow (placeholder + retry path) but never blocks issue creation; permission-denied and temporarily-unavailable are distinct, separately handled states.
- AR support is modeled as three distinct states (unsupported / unstable tracking / successful measurement), never collapsed into a single capability flag, and never implies manual measurement is second-class.
- Photo compression/downsampling and a concrete scale target (low hundreds of issues per project) are named as day-one design constraints for the next phase to pin exact numbers against, not left open.
- Schema is built with lightweight migration in mind from the first version, anticipating paywall, AR, and eventual cloud-sync fields being added later without data loss.

No open disagreement carries into the next phase — Gemini didn't weigh in (CLI unavailable), but nothing above is contentious enough to need a tie-break.

## App Features

CONSENSUS: YES

Real movement this round. Codex conceded the big one: he agreed the paywall (cap + restore + non-destructive downgrade) belongs in must-have, not should-have — Claude's argument that it's spec-mandated, architecturally separate from the capture screen, and cheaper/more bounded to build than AR won him over. That resolves the main split from round one.

On AR, they didn't converge on the label but did converge on the actual behavior, which is what matters for the build team. Codex wants AR filed as should-have (first thing cut under time pressure, never blocking ship). Claude split AR into two pieces: the measurement-input abstraction (one field, manual-or-AR-sourced, with a source tag) is must-have because it's nearly free and is the whole reason AR can be cut later without a rewrite — and the actual working ARKit/LiDAR capture is "must-have, but carrying a standing, pre-approved license to be descoped" rather than an ordinary should. In practice these two framings produce the identical build instruction: build the abstraction properly from day one, attempt full AR capture, but it's the one and only feature allowed to be cut without that counting as a missed commitment, and its acceptance bar is "correctly gated across three states with clean fallback," never "verified accurate." That's not a real disagreement anymore, just two ways of labeling the same escape hatch — I'm writing it Claude's way below since it's more precise about *why* AR gets special treatment, but the practical outcome both agents want is identical.

Branding (should-have) and the could-have list (CSV, location stamping, App Intents) were never actually contested — round one just looked unresolved because of how it was summarized. The one new wrinkle is Claude moving "photo import from library" from could-have (where Codex had it) to won't-build, on the grounds that it silently reopens the limited-photo-library-access permission state that `detailed_discussion` explicitly said we get to skip as long as capture stays camera-only. Codex didn't get a chance to respond, but nobody has a live counter-argument to that logic and it's consistent with an already-locked decision, so I'm resolving it as won't-build rather than treating it as an open item.

Claude's mid-session entitlement rule (lock-state only evaluated at app-foreground/launch, never injected while a capture is in progress) landed with no objection and is a real, concrete addition worth keeping.

## Final Output

**Must-have** (every item below is required for Truescale to be a real, shippable product on day one — each is what makes the free/Pro boundary, the capture loop, and the export credible exactly as promised):

1. **Project library with active/archived lifecycle.** Story: a solo pro opens the app and can start or resume a job in one step, with nothing lost across relaunch. Acceptance: create project → relaunch → correct active/archived state persists; archive/unarchive is one tap and never deletes data; first launch skips the empty-library screen and goes straight into creating the first project.

2. **Area/room workspace with inline creation.** Story: user adds "Kitchen" without leaving the capture flow. Acceptance: area created and selected without navigating away from capture; duplicate names allowed; archived areas hidden from default pickers but preserved in history; default capture context is last-used area.

3. **Fast issue capture** — live camera, severity chip, status chip, optional note, and one measurement field (manual-entry default; AR-populated where supported, same field, same data shape — see #4). Story: user photographs a defect and is done in seconds. Acceptance: issue record exists the instant photo capture succeeds; every subsequent field edit is an immediate write; killing the app at any point after photo capture and relaunching restores the exact same state; camera-permission-denied and camera-temporarily-unavailable are distinct visible states, each with retry/Settings path, neither blocks record creation.

4. **Unified measurement-input abstraction.** Story: whether a user types a number or captures via AR, the report and the UI treat it identically, labeled by source. Acceptance: the Issue record's measurement field is source-tagged (manual/AR), never two parallel fields or record types; this ships regardless of whether live AR capture ships, per (5).

5. **AR measurement capability (device-gated, three-state), carrying a standing pre-approved descope license.** Story: on supported hardware with stable tracking, tapping the measurement field returns an AR-derived value instead of requiring typing. Acceptance: three distinct states (unsupported device / supported-but-tracking-unstable / supported-with-successful-measurement) with distinct UI and report labeling; invisible fallback to manual entry in the unstable/unsupported cases; acceptance bar is "correctly gated and cleanly falls back," explicitly never "verified field-accurate," since there's no physical LiDAR device in this build environment. This is the one and only must-have item allowed to be cut without that counting as a missed commitment, per the pre-agreed trigger in `prompt_contract` ("kill or descope AR if accuracy can't be validated").

6. **Issue review and filtering** by area, severity, status. Story: before export, scan for urgent/open items and catch anything missing. Acceptance: filters run against persisted data (not transient view state), stay responsive at low-hundreds-of-issues scale, empty filter results have a clear reset path, rows show measurement source visibly.

7. **Client-ready PDF export and share.** Story: finish a visit and send a report from the phone, no desktop cleanup. Acceptance: fully offline; grouped by area; each issue shows photo-or-placeholder, severity, status, note, measurement+source, timestamp; one missing/corrupted photo degrades to a placeholder rather than failing the whole export; zero-issue areas/projects don't crash export.

8. **Subscription paywall — 2-active-project cap, StoreKit entitlement, restore purchases, non-destructive downgrade.** Story: a free user hits the cap and gets a one-sentence explanation; a lapsed-then-restored subscriber gets their access back cleanly. Acceptance: cap enforced locally against cached StoreKit entitlement, checked at project-creation time only; over-cap projects go read-only (viewable/exportable-disabled, never deleted); restore-purchases verified against local StoreKit configuration (explicitly not live App Store — state that limitation plainly in the build report, don't imply it's fully proven); **entitlement/lock-state is evaluated only at app-foreground/launch, never injected mid-session** — an in-progress capture is always allowed to finish and save.

9. **Local-first persistence as a visible product behavior.** Story: interruption is normal, nothing should ever disappear. Acceptance: project/area/issue creation, edits, filtering, export all survive a full app relaunch; no separate hidden draft mechanism that behaves differently from saved records; deletion is always explicit and hard to trigger by accident.

**Should-have** (strengthens differentiation/subscription value, never allowed to destabilize the must-have loop): custom report branding (logo/business header) for Pro — the non-hardware-gated reason to subscribe; measurement-unit settings override (US customary default); basic onboarding copy that sells manual-first speed before ever mentioning AR; project-library polish (archived browsing, richer metadata/sorting).

**Could-have** (real but secondary; build only with room to spare): CSV/advanced export (note: this is named under "Subscription Model" in the source spec but absent from the spec's own "v1 Build Scope" sentence — that's a real internal tension in the source material, flagged rather than silently resolved); location stamping (opt-in, quiet-omit-if-denied, visible-if-ever-exported, consistent with the EXIF-stripping default already locked in `detailed_discussion`); App Intents/Shortcuts for "start project" / "new issue in last project."

**Won't-build:** multi-photo per issue; team accounts, client portals, collaboration, or signed/approved reports; cloud backup/sync (future-roadmap only — schema stays shaped for it, nothing built now); user-extensible severity/status taxonomies; compliance/inspection template libraries; photo markup/annotation tooling; task management, assignments, scheduling, or invoicing features; multi-project batch export; **photo import from an existing library** (explicitly moved here rather than could-have — it would silently reopen the limited-photo-library-access permission state that camera-only capture lets this app skip entirely); any AR-first flow that makes manual entry read as a fallback; any paywall design that degrades free-tier reports into embarrassing, watermarked marketing collateral.

No open disagreement carries forward. Gemini didn't weigh in either round (CLI unavailable), but nothing above needed a tie-break — the round-two exchange was genuine back-and-forth that closed the gap rather than two people repeating positions past each other.
