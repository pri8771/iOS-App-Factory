# cuekeeper — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

This one wrapped up clean. Codex's round 3 already moved to "before design lock" language ("the contract should explicitly require a documented comparison step before design lock... I do not think that's scope creep"), which is exactly the gate — not an after-the-fact courtesy check — that Claude was holding out for. Claude then wrote the precise sentence for the decision rules, including the honest-failure fallback (if the other apps' specs aren't reachable from this thread, say so explicitly rather than guessing), and said that's the whole gap. Since Codex's position and Claude's proposed wording line up, there's nothing left open. Everything else from round 2 — the tap-count enumeration, creation-time-only paywall gating, time-sensitive notification interruption level with the Critical Alert caveat, and the App Intent confirmation screen — went uncontested through two rounds and is locked in as-is.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim (see rounds 1–3 above). This thread owns "take CueKeeper from spec to production-ready." Portfolio-level mechanics — candidate generation, selecting the 7, Jira/Notion setup, cross-app transcript assembly — belong one level up, not in this transcript. The uniqueness requirements (parent-prompt items 9–11) are the one exception: they bind on CueKeeper's actual concept and are part of this contract, not portfolio orchestration.

**Hard requirements**
- Local-first SwiftUI iPhone MVP. Category: event-operations. Build priority: 7 of 7. Single operator only — no team sync, no multi-device coordination.
- Core workflows: build a run-of-show (timeline, cue list, role assignments); run cues in a dedicated live mode with timing support; adjust and recover when the plan shifts mid-event.
- v1 surface: timeline builder, cue execution mode, timers, contingency notes, templates, onboarding, paywall, accessibility, offline verification.
- Timing is computed from absolute stored `Date` values, recomputed on foreground/appear — never an accumulating counter — verified by actually backgrounding the app mid-cue and confirming correct recovery, not just watched in the simulator.
- Contingency scope for v1: free-text notes per cue plus the ability to jump to a designated backup cue. Full branching run-of-show logic is a non-goal unless explicitly justified in writing.
- The "two taps beats Notes/PDF" standard is not a slogan — the design phase must literally enumerate the tap path from the default running live-console state for advance, hold, skip, and contingency-reveal/jump-to-backup. Any of those exceeding two taps is a finding against the invalidation criterion.
- Paywall entitlement checks fire only at creation-time boundaries — starting a new event, applying a template, adding a contingency plan — and must never interrupt an already-started or resumable live run. StoreKit 2 gating must be real and testable via a local StoreKit configuration file; live App Store billing is out of scope and must be named as a limitation, not implied as done.
- Cue alerts (notifications, Live Activity updates) use `.timeSensitive` interruption level so Focus/Do Not Disturb doesn't silently swallow them at the worst possible moment; true Critical Alerts require an Apple entitlement this build won't have, and that must be stated as a known limitation, not glossed over.
- The App Intent for quick event start must land on a confirmation screen before starting a live run — never silently kick off a run headlessly from a Shortcuts/Siri invocation.
- Notifications and Haptics stay in scope throughout. Live Activities, Widgets, and App Intents are secondary to the core run loop and are the first things cut or stubbed under time/reliability pressure — any such cut must be explicitly stated in the final report, never silently dropped.
- Persistence is real and relaunch-safe. Offline is a testable claim: no networking APIs in the runtime path, plus a manual airplane-mode pass over all three core workflows.
- Accessibility (Dynamic Type, VoiceOver labeling on big-touch controls, contrast matching the "high-contrast operational" design bar) must be verified under real conditions, not assumed.
- Every screen in the three core workflows needs real empty/loading/success/error states.
- **Uniqueness gate:** before the design phase finalizes CueKeeper's core mechanic, it must attempt to read the Waylay and TrueScale specs from the parent portfolio workspace and write a one-paragraph comparison explaining why CueKeeper's live-execution mechanic is materially distinct — as a precondition to locking the design, not an after-the-fact check. If those materials are genuinely inaccessible from this thread, the design phase must say so explicitly ("attempted comparison, source material unavailable, proceeding on concept description alone") rather than asserting distinctness it never actually checked. If real overlap is found, it must be named and either justified in writing or the overlapping piece cut.

**Non-goals**
- No team sync, multi-device coordination, shared/live editing, client portal, remote cue pushing.
- No backend dependency for core value, no cloud requirement for v1.
- No LLM, AR, or ML — the product wins on execution reliability, not novelty.
- No generic task-manager framing, no broad event-project-management suite, no attempt to replace enterprise show-control systems.
- No static document/export-first experience masquerading as "live."
- No portfolio-level orchestration work (candidate generation, 7-app selection, Jira/Notion prep, cross-app transcript combination) inside this thread.

**Production-readiness definition**
More than "compiles and has screens." A first-time operator can install, onboard, start from a template or blank event, build a credible cue sequence, enter the live console, and perform advance/hold/skip/contingency-jump essentially at reflex speed (≤2 taps, enumerated and checked). State survives relaunch and backgrounding with correct timing recovery. Offline behavior is actually verified, not assumed. Accessibility is verified under real conditions. Paywall logic is real and locally testable, with live billing named as a limitation. Every reachable screen state (empty/loading/success/error) exists. Any scope cut (native features, contingency branching, etc.) is explicitly documented. The uniqueness comparison against Waylay/TrueScale exists in the transcript, either as a real diff or an honest "couldn't check."

**Decision rules for later phases**
1. Every feature must answer: does this make the operator faster or safer during a live, stressful event than Notes/a printed schedule? If not, defer it.
2. Anything assuming network connectivity or a second person/device is out of scope, no exceptions.
3. Glanceability beats elegance when they conflict; big-touch clarity beats premium polish when they conflict.
4. Keep data-architecture choices that enable future sync while keeping current state simple/deterministic; cut backend-shaped abstraction with no present user value.
5. Between more surface area and a tighter, more trustworthy run loop, choose the tighter run loop.
6. Live Activities, Widgets, and App Intents are cut/stubbed first under pressure; core cue execution, timing correctness, and persistence are hardened first and non-negotiable.
7. Any "this works" claim for timing or offline behavior must be backed by an actual backgrounding test or airplane-mode pass, not a simulator glance.
8. The final review must explicitly answer the invalidation criterion with the enumerated tap counts for the core recovery actions — a concrete answer, not a feature list.
9. If a feature makes CueKeeper feel more like another portfolio app or a generic productivity tool, it loses unless there's a written reason it uniquely strengthens live-event execution.
10. Before design lock, perform the Waylay/TrueScale comparison gate described above; log the outcome (real diff, or honest inaccessibility) in the transcript.
11. Paywall gates only at creation-time boundaries, never mid-run; cue alerts use time-sensitive interruption level; the quick-start App Intent always confirms before launching a live run.
12. All artifacts (transcript, decisions, architecture, Swift project) live self-contained under a dedicated `cuekeeper` folder in `/Users/pchordia/Documents/iOS-App-Factory`.

## Product Research

Both sides converged on the same picture — no real disagreement left, just Claude adding operational detail on top of Codex's framing. Both frame this as "interruption recovery under pressure," not event planning, and both name the same true competitor: paper/PDF/Notes, which wins today purely because it never crashes and needs no navigation. Both agree the pattern to copy isn't project-management software, it's glanceable live-tracking UX (turn-by-turn nav, workout trackers, mission-control style dashboards) — big dominant current state, unmistakable next, drift visibility, blunt controls, no subtlety or hidden menus. Both agree Live Activity/Lock Screen is the single highest-leverage native feature since it beats paper on something paper structurally can't do (glance without unlocking), followed by time-sensitive notifications and haptics, with widgets/App Intents as secondary nice-to-haves. And both land on the same implication for the first build: pour effort into a dead-simple live console (current cue, next cue, on/off-time state, advance/hold/skip/reveal-backup) and keep the builder merely competent — the console is the product, not the editor.

Claude's round added concrete risk items Codex didn't cover, but nothing that contradicts Codex — it's additive: Live Activity staleness/eviction as a named technical risk (with the rule that the in-app console must always self-correct from absolute timestamps regardless of what the Live Activity showed), the free/premium boundary needing to be disclosed honestly before someone invests time building a run sheet, "role" needing to stay a label rather than accidentally reintroducing multi-device permissioning, real event scale (20-40 cues) breaking any design that only supports linear advance, and a hard requirement that verification happen on real hardware (lock/unlock mid-cue, airplane mode, forced-quit) rather than a simulator glance.

CONSENSUS: YES

## Final Output

**Audience and use context:** Solo operators physically executing a live event — wedding planners, stage managers, DJs, MCs, small production leads. They're standing, often one-handed, in bad lighting, interrupted, under adrenaline. The product isn't "event planning," it's interruption recovery: glance down for 2 seconds, instantly know now/next/on-or-off-time/backup.

**Comparable patterns:** The real competitor is paper/PDF/Notes/spreadsheets, which win today because they need zero navigation and never crash. The pattern to emulate is glanceable live-tracking UX (turn-by-turn nav, workout trackers, simple timer apps) — one dominant number/state, one or two unmistakable actions — not project-management or checklist software. If the build starts looking like rows in a database, it's already lost to paper.

**Platform-specific opportunities:** Live Activity/Dynamic Island is the top native opportunity — glanceable from a locked phone, something paper genuinely can't match — but it must never be the source of truth; the in-app console has to self-correct from absolute timestamps the instant it's opened, since Live Activities can go stale, hit update-frequency limits, or get evicted. Time-sensitive notifications and distinct haptic patterns (e.g., "running long," "cue in 30s") are the next tier of value, usable without even looking at the screen. Widgets and App Intents are real but secondary — pre-event countdown visibility and quick-launch, not core to the live promise, and App Intents must always confirm before launching a run.

**Major assumptions and risks (labeled as assumptions/risks, not verified facts):**
1. Assumption: solo operators will accept authoring a run-of-show on iPhone if the builder is "good enough fast," not exhaustive — full authoring may eventually want iPad/Mac, but that's out of scope for v1.
2. Risk: Live Activity staleness/eviction misleading the operator is worse than no Live Activity at all — must be tested and mitigated with in-app self-correction.
3. Risk: real events run 20-40+ cues; a console that only supports linear "advance" fails the moment cues get skipped or a section runs over — arbitrary jump/backup-target support is required, not optional polish.
4. Risk: paywall encountered mid-build or mid-event destroys trust — free/premium boundaries must be disclosed upfront, and gating already contracted to creation-time-only, never mid-run.
5. Risk: "role assignment" scope-creeping into permissions/per-role views would reintroduce multi-device coordination through the back door — role must stay a plain accountability label.
6. Risk: verifying timing/offline/backgrounding claims in the simulator instead of on real hardware would produce false confidence — final review must include an actual device pass (lock/unlock mid-cue, airplane mode, forced-quit of Live Activity).

**Implications for the first build:** Concentrate the build effort on a minimal, almost stupidly simple live console — current cue (dominant), next cue, elapsed/drift state with unmistakable over/under-time signaling, and 3-4 big-touch actions (advance, hold, skip/jump-to-arbitrary-cue, reveal contingency/backup) — before investing in template richness or cue-editor polish. The builder/editor should be competent, not beautiful, in v1. Live Activity + time-sensitive notifications + haptics are the native features worth building well; widgets/App Intents are real but secondary and are the first things to trim under pressure per the existing contract. This all lines up cleanly with the locked prompt contract — nothing here contradicts it, it's giving the design phase concrete texture to build against.

## Portfolio Selection

CONSENSUS: YES

## Final Output

Both Codex and Claude read this the same way: this is a single-app child-project thread, not a portfolio-parent selection pass. The incoming prompt already arrives pre-decided — `PORTFOLIO_CHILD_PROJECT: true`, parent portfolio `multi-app-exp4`, one selected app slug (`cuekeeper`) — so there's no candidate generation, no "pick the best 7," and no sibling-project creation to do here. That machinery belongs one level up in the parent portfolio orchestration, not in this transcript, and both agents independently landed on the same conclusion: re-running selection logic here would be scope creep that duplicates a decision that already happened elsewhere and that this thread can't even see the full inputs for (no visibility into the other six apps' actual specs, just their names).

Concretely: no portfolio split is needed, no sibling child projects get created, and no portfolio-json manifest is required since this thread isn't the portfolio parent. The one app in scope is CueKeeper — category event-operations, build priority 7 of 7, promise "run a live event from your iPhone without losing the sequence, timing, or backup plan," target user solo live-event operators (wedding planners, stage managers, DJs, MCs) — with `build: true`, mapping to exactly one output folder (`cuekeeper`). Codex captured this as a structured record (portfolio_parent: false, needs_portfolio_split: false, one selected app, rejected alternatives listed); Claude's round added the product-level case for why that one app deserves the build effort, centered on the invalidation criterion — does the live console beat a printed sheet or Notes in the exact moment a stressed, one-handed operator needs to recover from drift — and flagged as a self-check (not a dispute) that "single operator, no team sync" must hold firm for v1 even though real events involve multiple people, because trying to be both a lightweight team tool and a reflexive single-operator instrument at once would make it worse at both.

No open disagreement remains — this was convergent from round 1, with Claude's contribution reinforcing rather than contesting Codex's framing.

## Initial Discussion

This one actually landed. Codex took a clear position on the hold question — hold is a deliberate schedule shift, not a cosmetic pause, so resuming pushes every downstream cue's time forward by the held duration, because a wedding coordinator pausing on purpose isn't "drift," it's a choice, and the app shouldn't punish her for it. Claude then took that one step further rather than contesting it: not only does the schedule shift, the drift/on-time baseline should reset to zero the moment the operator resumes, so lateness only gets flagged again from new information going forward — otherwise the drift indicator would guilt-trip people for a pause they explicitly chose, and they'd learn to ignore it, which defeats the whole point. Claude also surfaced one honest limitation that needs to be on the record rather than discovered later: v1 treats every cue time as a relative offset chained forward from event start, not a hard clock anchor — so something genuinely fixed to the outside world ("band contracted 8–11 sharp") would still slide if a hold happens earlier in the night. That's named explicitly as a known v1 limitation, not solved now, consistent with how everything else in this build (offline, timing, paywall) gets treated — real gaps get written down, not glossed over.

Nothing here contradicts anything Codex said — it's the same "one sequence, one honest live pointer, no hidden state" philosophy Codex was already arguing for, just carried one notch further. That closes the one loose thread from last round, and everything from rounds 1–2 (pointer-relocation for backup jump, real event-complete terminal state, no mid-run restructuring with the contingency note as the release valve, and the timed builder floor) was already mutually confirmed.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** CueKeeper is a local-first iPhone app that lets a solo live-event operator build a cue sequence once, then run it under real pressure with a console that always shows the correct, self-correcting elapsed/remaining state — even after the phone was locked, backgrounded, or offline — and lets them recover from drift or a broken cue in two taps or fewer.

**Primary user and scenario:** One person physically running the room — a wedding coordinator, stage manager, DJ, or MC — standing, often one-handed, interrupted, under time pressure. The defining scenario: the event is live, timing has slipped or something just broke, and the operator has about two seconds to glance down and know what's happening now, what's next, whether they're on time, and what to do about it. If the app can't beat a printed run sheet or Notes in that exact moment, it fails its own invalidation test.

**Core loop:** Build (calmly, beforehand: add/reorder cues, apply a template, attach role labels, notes, contingency notes, and an optional backup target) → Run (enter live mode; the sequence locks and all state derives from absolute timestamps, never an accumulating counter) → Recover (advance, hold, skip, or jump-to-backup when reality diverges from plan). The whole loop rests on one sequence and one live pointer — never a branching alternate show, never hidden state the operator has to reconstruct in their head.

**Hard scope boundaries:**
- Single device, single operator, single sequence per event — no parallel tracks, no team sync, no multi-device coordination.
- "Role" is a plain accountability label, never permissions or per-role views.
- Contingency handling in v1 = free-text notes per cue + jump-to-designated-backup. No true branching show logic.
- "Jump to backup" is a pointer relocation, not a branch and not a destructive replace — the full original sequence stays visible and walkable afterward (e.g., jump from cue 14 to cue 22, cues 15–21 remain visible/reachable, nothing silently disappears).
- No restructuring the cue list from inside live mode. Recovery actions are limited to advance/hold/skip/reveal-contingency/jump-to-backup/edit-note. If something unplanned happens (caterer shows up early), the contingency note is the explicit release valve — that's the intended in-app move, not a dead end.
- The event has a real, explicit completion state once the last cue finishes or is skipped: final elapsed time, last completed cue, calm wrap-up actions — not an undefined fall-through or an out-of-bounds console.
- Hold is a deliberate, honest schedule shift: resuming pushes all downstream cue times forward by the held duration, and the on-time/drift baseline resets to zero at the moment of resume — hold means "we chose this," and only new lateness after that gets flagged.
- Named v1 limitation: all cue times are relative offsets chained forward through the sequence, not hard clock anchors — a cue genuinely fixed to an external commitment (e.g., a band contracted 8–11) will still shift if an earlier hold pushes the chain. This is disclosed as a known limitation, not solved in v1.
- The builder is intentionally narrow (no elaborate metadata, no dependency graphs, no multi-track views) but must be fast, not tedious.

**Measurable success criteria:**
- Advance, hold, skip, and contingency-reveal/jump-to-backup are each ≤2 taps from the default running live-console state — enumerated as an actual tap path, not asserted.
- Applying a template and reaching a "ready to run" event takes under two minutes for a first-time user, timed.
- Timing state survives an actual lock-screen/background/relaunch cycle mid-cue, correct to the second, verified on real hardware.
- The live console answers, without scrolling: what's happening now, what's next, are we on time, what's the immediate recovery action.
- The app remains fully usable in airplane mode across build, run, and recovery workflows.

## Per App Product Brief

Good news — the one real disagreement from last round actually resolved itself, and in an interesting way: Codex's objection to "undo" wasn't to the idea, it was to a *specific bad version* of it (a generalized undo/command-stack system competing for space on the console). But then Codex's own proposed fix — "a transient 'last action' strip with immediate reversal only for the most recent pointer move" — turns out to be exactly the same mechanism Claude then spelled out in detail (a Mail-style "Skipped to Cue 14 · Undo" banner, transient, single most-recent-action only, zero footprint on the steady-state console). They arrived at the same design from opposite directions, so this isn't a live fight anymore — Codex proposed the shape, Claude filled in the detail, neither contradicts the other.

Template export/import is fully agreed on as real v1 scope and the actual growth mechanism (not deferred, not cloud sync — just AirDrop/Messages-style file sharing of a template). Claude added two specifics this round that Codex hasn't explicitly weighed in on yet — import free / export premium, and defaulting exports to strip contingency notes before sharing (so a coordinator doesn't accidentally AirDrop "keep the bride's father off the mic" to a vendor) — but both are just natural extensions of things already agreed (premium = recurring-professional-friction relief; free tier must be real and unrestricted for new users), not a new fork in direction.

Everything else — free tier as a complete single-event experience, premium as templates/unlimited-events/richer-contingency, the "coordinator not DMX-operator" wedge, local-first with UUID/absolute-Date modeling deferring but not building cloud sync — was already settled and nobody's re-opened it.

CONSENSUS: YES

## Final Output

**Target user and use case:** The solo operator physically running a live event — wedding coordinator, stage manager, DJ, MC, small production lead — who builds a run-of-show calmly beforehand and then checks the app in short (under-10-second), high-stakes glances during the live event to know what's happening now, what's next, whether they're on time, and what to do if something breaks.

**Paid value and subscription value:** Free tier is a genuinely complete single-event experience — full live console, full recovery controls (advance/hold/skip/jump-to-backup), no cue-count cap, template import all included — because the product has to prove it beats a printed sheet before asking for money, and a crippled free tier would poison word-of-mouth in a small, tightly-networked professional community. Premium is about removing *recurring* professional friction, never about unlocking anything during a live moment: unlimited saved/concurrent events, a reusable custom-template library, richer contingency structure (multiple backup targets per cue), event history, and template export/sharing. The subscription pitch in one line: free proves the console is safer than Notes on one event; premium is what you buy once you're building the same shape of night over and over and want to stop rebuilding it from scratch.

**Core loop:** Build once (blank event or template, fast authoring, role labels, contingency notes, backup targets) → Run live (locked sequence, console driven off absolute timestamps, current cue dominant, next cue visible, on-time/drift state, four big recovery controls) → Recover (advance/hold/skip/jump-to-backup, contingency note as the release valve for anything unplanned) → a transient, contextual one-tap "Undo" affordance appears immediately after any recovery action (e.g. "Skipped to Cue 14 · Undo") and expires on its own — it costs zero space in the console's resting state and exists only in the moment right after a tap, but it's treated as a hard requirement, not a nice-to-have, because a mis-tap during a live, one-handed, adrenaline-heavy moment with no way back is a worse failure than anything paper can produce.

**Competitive wedge:** CueKeeper is built for the person coordinating people and timing, not the person running a lighting board — it doesn't try to out-feature real show-control/DMX tools, it wins against the actual incumbent (paper, PDF, Notes, spreadsheets) by doing the few things those can't: self-correcting live timing from absolute timestamps after any lock/background/relaunch, Live Activity glanceability, and fast, safe recovery controls. If a feature ever makes the app feel like a mixing console instead of a coordinator's instrument, it fails this test and gets cut.

**Viral/niche growth angle:** Template export/import as a local file artifact (AirDrop, Messages, email — no networking, no live sync) is the actual growth mechanism, not just word-of-mouth about the app in the abstract. A coordinator hands a peer a ready-built ceremony/reception, church-service, or keynote template and that peer experiences the console with real content in minutes instead of building from scratch. Importing a shared template is free-tier, unrestricted — that's the acquisition moment and gating it would kill the mechanism. Exporting/sharing a template is a premium behavior, consistent with premium already being about template-building value. Export defaults to stripping contingency notes and role-label free text (keeping only structural data — cue titles, timing offsets, role labels) unless the user explicitly opts in to include notes, because those notes can carry sensitive client information and an accidental leak would be exactly the kind of trust-destroying failure this product can't survive.

**Local-first and cloud-ready plan:** All events and templates are durable on-device documents from day one — stable UUIDs, absolute-time (`Date`) state, no singleton "the one event" assumption — specifically so a future cloud sync layer (team sync, remote cue sharing, client-facing run sheets, multi-device coordination) can be added later without a data-model rewrite. CloudKit/iCloud sync itself is explicitly not being built now and no v1 feature is justified on "we'll need it for sync eventually."

**The real reason this app deserves to exist:** paper and Notes win today by being simple and unbreakable; CueKeeper only earns a subscription if it's just as trustworthy while doing what paper structurally cannot — self-correcting live timing under real interruption, safe one-tap-reversible recovery actions, and a growing personal library of proven, shareable run structures that make every subsequent event faster to set up.

## Next Steps Small

This finally landed. Codex explicitly dropped his round-4 "two doors" position and adopted Claude's template-only stance, agreeing that deleting all seeded cues exercises the identical empty-state code path, and that the choice-paralysis point stands unrebutted. Claude confirmed the same, final, no hedging.

CONSENSUS: YES

## Final Output

**MVP slice:** A single complete build→run→recover workflow, entered through one built-in sample event (a pre-filled reception timeline), not a blank canvas. Blank-canvas event creation is explicitly *deferred to the next increment*, not cut from the product — it's already locked v1 scope from earlier phases and will return once this slice proves the dangerous claim.

**Must-have interactions:**
- Create an event by tapping "Start from Sample Reception," landing on a known-good, pre-timed ~8-12 cue event.
- A real builder on top of it: add cue, edit title/duration, delete cue, duplicate cue, drag-reorder, optional role label, optional contingency note, assign one backup target — not a fixed-row form.
- Enter live mode; console shows current cue (dominant), next cue, and on-time/drift state computed from stored absolute timestamps.
- Four big recovery controls — advance, hold, skip, jump-to-backup — each within the locked ≤2-tap standard.
- A transient, contextual one-tap "Undo" banner after any recovery action.
- Hold rebases all downstream cue times forward by the held duration and resets the drift baseline to zero at resume.
- Jump-to-backup relocates the live pointer only — skipped cues remain visible and reachable, never destroyed.
- State survives phone lock, backgrounding, force-quit, and relaunch, recomputed correctly from absolute `Date` values.
- Fully offline — no networking anywhere in this workflow.
- Haptic feedback on core actions (advance/hold/skip).
- An explicit event-completion screen reporting the final on-time/drift verdict for the whole run, not just "done."

**Cut list (for this slice only):** blank-canvas event entry (deferred), template library beyond the one built-in sample, template export/import, paywall beyond a stub, notifications, Live Activities, widgets, App Intents, event history, multiple backup targets per cue, rich onboarding, analytics.

**Validation criteria (physical device, not simulator):**
- Start from sample, make a few real edits (change a duration, add a cue, reorder one), reach ready-to-run in under two minutes.
- Lock the phone mid-cue, wait several real minutes, unlock, and confirm elapsed/drift time is correct to the second with no manual action.
- Force-quit the app mid-cue, relaunch, and confirm the same correctness.
- Run the full workflow in airplane mode with no breakage.
- Deliberately trigger a wrong skip and confirm the undo banner actually reverses it.
- Trigger one hold, resume it, and confirm downstream cue times shift forward and drift resets to zero at that moment.
- Trigger one jump-to-backup and confirm the skipped-over cues remain visible and reachable.
- Run the last cue to completion and confirm the completion screen shows a real final drift/on-time number.
- Delete every cue from the sample event and confirm the empty builder state renders correctly (this is the agreed substitute for a dedicated blank-start entry point).

If every one of those passes, the slice has proven the one thing this product's entire existence depends on — that it's more trustworthy than a printed sheet in the exact moment reality diverges from plan — and the later build phase can execute this without reopening product debate.

## Detailed Discussion

This round actually closed it. Codex took a position on every one of Claude's nine open points instead of just gesturing at them, and Claude then tightened each of Codex's answers into something concrete and buildable rather than re-flagging anything as still-open. The only place where their exact wording differs — Codex initially framed the backup-reference-deletion fix as "delete, then clear the reference and warn," while Claude framed it as "show a confirmation dialog before the delete completes" — isn't a real disagreement, it's the same principle (never silently orphan a reference, never block deletion forever) expressed as two flavors of the same UX, and Claude's confirm-first version is the stricter, safer read of what Codex already called "the clean middle." Nothing else has any daylight between them.

CONSENSUS: YES

## Final Output

**Resolved requirements (new this phase, on top of everything already locked):**
- **Cold relaunch routing:** the app persists an "active live event" pointer independent of any single view's state. On launch, before rendering anything else, if a live/non-completed run exists, the app routes directly to that event's live console — never to an event list requiring manual re-navigation.
- **One live run globally, not per-event:** only one event can be "live" across the whole app at any time. Attempting to start a second run (from the event list or the App Intent) surfaces a blocking choice naming the currently-live event and offering to resume it instead of silently starting a second one. The App Intent's already-mandatory confirmation screen is the natural surface for this — no new screen required, just a branch on the one already planned.
- **Clock-jump detection:** alongside stored absolute `Date` timestamps, the app also samples `ProcessInfo.processInfo.systemUptime` (a monotonic clock unaffected by wall-clock changes) at the same moments. If the wall-clock delta and monotonic delta disagree by more than a few seconds between two consecutive foreground checks, the console shows a small inline "device time changed, verify manually" note rather than either hiding the discrepancy or rendering a falsely confident drift number.
- **Backup-target integrity:** backup targets are stored as a stable cue identifier, never an index, so reordering can never silently break them. Deleting a cue that's currently assigned as another cue's backup target triggers an explicit confirmation ("Cue 14 is Cue 6's backup — deleting it removes that assignment. Delete anyway?") — never a silent orphan, never a permanent delete-block.
- **Terminal states, defined for all four controls:** any control (advance/skip/hold-resume/jump-to-backup) that moves the pointer past the last cue lands in the same completion state. The one asymmetric case: holding on the last cue and never resuming does not auto-complete the event — the event stays "on hold" until the operator explicitly resumes and advances. Completion is a deliberate moment the operator arrives at, not something a timer produces for them.
- **Accessibility, treated as testable requirements, not polish:** the undo banner does not auto-dismiss on a fixed timer when `UIAccessibility.isVoiceOverRunning` is true — it persists until the user acts or takes another recovery action, and its appearance is announced via `UIAccessibility.post(.announcement:)`. Drag-reorder in the builder gets explicit "Move up"/"Move down" accessibility custom actions, since SwiftUI's `onMove` doesn't expose itself to VoiceOver by default.
- **Data protection and privacy surfaces:** the persistence layer's data-protection class is explicitly verified to match the sensitivity of contingency-note content (a one-line config check, not new engineering), given earlier phases already established these notes can carry sensitive client/medical/family information. App-switcher snapshot leakage of a note-bearing live console is named as a real but minor privacy concern — worth a cheap blur-on-background mitigation if time allows, but explicitly not a blocker for the MVP slice if it's cut; it must appear in the final report either way, not silently vanish.
- **Entitlement fail-open:** if a creation-time premium check can't verify purchase state (offline, fresh install, unrefreshed receipt), the app fails open to the free tier's guaranteed capabilities — it must never block a first event from being built or run due to an unverifiable entitlement check.
- **Zero-duration cues are valid:** instant markers ("cut the cake," "rings exchanged") are legitimate cues with no meaningful elapsed/progress state, rendered in live mode as instant, immediately-advance-eligible cues. The builder still hard-blocks negative durations as a validation error, but doesn't force a fake minimum duration onto point-in-time moments.

**Risk register additions:** false confidence after an undetected clock anomaly (mitigated by the dual-clock comparison above); accessibility as a silent trust-net failure specifically for VoiceOver users on undo/reorder (mitigated by the two concrete fixes above); accidental multi-event "live" state corrupting the single-source-of-truth promise (mitigated by the global one-live-run rule); paywall fail-closed behavior undermining the offline-first claim (mitigated by explicit fail-open).

**Final assumptions:** the operator is solo and only one event is ever "live" app-wide; all pointer references (current cue, backup target) are stable-ID based, never index based; timing correctness depends on an absolute-time model that now includes a monotonic-clock sanity check, not blind trust in wall-clock `Date` alone; accessibility for undo and reorder is a hard, testable requirement carried into the build phase, not a later polish pass; any native-feature or hardening item that gets cut under time pressure (snapshot blur, in particular) must be named explicitly in the final report rather than dropped silently.

No open ambiguity remains for the design/architecture phase to inherit — every edge case raised this round has a concrete, stated resolution.

## App Features

CONSENSUS: YES

Round two actually closed all three open forks, and it closed clean — nobody just restated their side, they engaged with the actual contract text. Codex went through Claude's citations point by point and conceded on textual grounds: paywall moves to must because prompt_contract's language ("real and testable via a local StoreKit configuration file") is bounded and specific, not a "later if time" scaffolding ask; notifications move to must because decision rule 6 names only Live Activities/Widgets/App Intents as the cut-first bucket, and notifications were separately locked as a hard `.timeSensitive` requirement elsewhere in the contract; and blank-canvas creation moves to must because a production app that can only ever fork the one sample event isn't actually "building a run-of-show," it's editing a demo — with per_app_product_brief's literal "blank event or template" phrasing and next_steps_small's explicit "deferred, not cut" framing making this a correction of an accidental demotion, not a fresh priority call.

Where they landed together, and it matters: Codex's one condition on blank-canvas is that it stays the same narrow builder with zero starting cues — no new categories, sections, or metadata surface, just a second front door into the identical constrained CRUD set. Claude agrees and adds that this is basically free once add/edit/delete/duplicate/reorder are already must-have and real — starting from an empty array instead of a seeded one is a one-line difference, not new engineering. On paywall, Claude tightened her own ask to match what Codex was actually worried about: one `.storekit` config file, one entitlement check, three named creation-time gating points, fail-open — anything fancier (tiered pricing screens, trial logic, upsell copy) is should/could, not must. Codex's closing message already independently proposed the same bounded version, so there's no gap left between them. Notifications land the same way: must-have as a background shoulder-tap mechanism, explicitly never allowed to become part of correctness — if permission is denied or delivery is delayed, the in-app console still has to be the truth on its own.

## Final Output

**Must-have (with acceptance criteria):**

1. **Sample-event entry** — "Start from Sample Reception" lands on a known-good, pre-timed ~8-12 cue event. *Accept: tap-to-ready in under two minutes with no hidden menus.*
2. **Blank-canvas event creation** — same constrained builder, starting from zero cues, no extra metadata surface. *Accept: create an empty event, add cues one at a time, reach a valid live-ready state; empty-builder state renders correctly.*
3. **Full builder CRUD** — add/edit-title/edit-duration (incl. zero-duration instant markers)/delete/duplicate/drag-reorder, optional role label, optional contingency note, one backup target stored by stable cue ID. *Accept: reordering never breaks a backup reference; deleting a cue referenced as a backup target triggers explicit confirmation; negative durations are hard-blocked.*
4. **Live console** — dominant current cue, visible next cue, on-time/drift/hold state, four controls (advance/hold/skip/jump-to-backup) within the locked ≤2-tap budget from the default running state. *Accept: enumerated tap paths for all four controls measured and confirmed ≤2 taps.*
5. **Transient undo** — one-tap reversal of the most recent recovery action; does not auto-dismiss on a fixed timer when VoiceOver is running. *Accept: deliberate wrong-skip reversed via undo; VoiceOver banner persists until user acts.*
6. **Hold rebase + drift reset** — resuming a hold shifts all downstream cue times forward and resets the drift baseline to zero at that moment. *Accept: trigger hold, resume, confirm downstream times shift and drift reads zero immediately after.*
7. **Jump-to-backup pointer relocation** — moves the live pointer only; skipped cues remain visible and reachable. *Accept: jump to backup, confirm skipped cues still appear in the sequence and are reachable.*
8. **Terminal states + completion screen** — all four controls define last-cue behavior (hold-on-last-cue-unresolved is the one exception, staying "on hold" rather than auto-completing); completion screen reports the real final on-time/drift verdict. *Accept: each control's last-cue path checked; completion screen shows a real number, not just "done."*
9. **Persistence, cold-relaunch routing, one-live-run rule, clock-jump detection** — an active-live-event pointer routes cold launches straight to the live console; only one event can be "live" app-wide; wall-clock vs. monotonic-clock disagreement surfaces an inline warning. *Accept: force-quit mid-cue and relaunch lands directly in the live console with correct state; attempting a second live run surfaces a blocking resume-or-end choice.*
10. **Full offline operation** — build, run, and recovery workflows all work with no networking dependency. *Accept: full airplane-mode pass across all three workflows on a physical device.*
11. **Accessibility** — VoiceOver custom "Move up"/"Move down" actions on reorder, Dynamic Type that doesn't break console layout, contrast matching the high-contrast bar. *Accept: reorder via VoiceOver custom actions; layout holds at largest Dynamic Type sizes; contrast checked, not eyeballed.*
12. **Haptics** — distinguishable feedback patterns on advance/hold/skip. *Accept: physical-device check confirms the three patterns feel distinct.*
13. **Notifications** — `.timeSensitive` cue alerts scheduled against cue timestamps, rescheduled on hold/skip/jump; permission denial never degrades correctness, only convenience. *Accept: alert fires under Focus/DND; with notifications denied, the full live workflow remains fully correct and usable.*
14. **Paywall (narrow)** — one local `.storekit` config, one entitlement check via `Transaction.currentEntitlements`, gated only at the three creation-time boundaries (new event, apply template, add contingency plan), fail-open when unverifiable. *Accept: gating fires only at those three points, never mid-run; simulated offline/unverifiable entitlement state falls open to free capabilities rather than blocking.*

**Should-have:** Live Activities (must self-correct from absolute timestamps if shipped, given staleness/eviction risk), App Intents quick-start (mandatory confirmation screen + one-live-run conflict surface if shipped), widgets for event countdown, template library beyond the one sample plus import/export (import free, export premium, notes stripped by default), event history, multiple backup targets per cue, snapshot-blur-on-background, richer onboarding beyond a single explanation screen.

**Could-have:** richer contingency structuring beyond free-text-note-plus-one-backup, template metadata/tagging, an interactive tutorial/walkthrough, contingency-note export opt-in controls.

**Won't-build:** team sync, multi-device coordination, shared/live editing, client-facing run sheets, remote cue sharing; true branching show logic beyond jump-to-backup pointer relocation; parallel tracks; role-as-permissions or per-role views (role stays a plain label); auto-advance; mid-run structural editing; mid-run paywall checks; hard-clock-anchored cues (named v1 limitation); live App Store billing (StoreKit config testing only, named limitation); true Critical Alerts (no entitlement — explicitly not to be conflated with time-sensitive notifications in any UI copy); any LLM/AR/ML feature; analytics/insight surfaces.
