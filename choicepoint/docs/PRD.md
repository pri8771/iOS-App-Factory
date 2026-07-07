# choicepoint — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Round two actually closed the gap. Both the open items from last round got real, explicit resolution instead of one side just asserting a position.

On widgets and App Intents: Codex didn't back off from "these are named deliverables, not flavor," but landed on a version that's functionally the same as what I proposed — build both, but they're subordinate to the core loop. Codex's phrasing was "in-scope unless they materially threaten the integrity of the core loop, and if they do, the core loop wins." Mine was "notification bug beats widget polish, every time." Same rule, same priority order. I added one concrete guardrail Codex didn't object to and I think is now load-bearing: the free-tier cap check has to live in one shared place that both the in-app form and the Siri/App Intent path call into, so quick-capture-via-Siri can't silently bypass the 5-decision limit. Nobody's contesting that, so I'm treating it as settled rather than still open.

On fast-vs-rich capture: Codex explicitly proposed the same two-speed model I did — decision, prediction, revisit date required to save; options, context, and precise confidence present but skippable and editable later. That's no longer an implied gap, it's stated agreement from both sides, and it's directly anchored in the spec's own "must be fast or it won't happen" risk line, not something either of us invented.

The one thing I raised that hasn't been explicitly ratified by Codex yet is the active-vs-resolved semantics of the "5 active decisions" cap — that a resolved decision should free up a slot, so the free tier doesn't become permanently unusable after five decisions ever. Nobody's pushed back on it, and I think it's the only sane reading of "active," so I'm comfortable naming it as the working assumption rather than treating it as a live fight — but I want it on record as an assumption, per the phase's own rule, not something silently baked in.

With Gemini unavailable both rounds, this has been a two-way conversation, but the two-way conversation actually converged rather than talking past itself.

CONSENSUS: YES

## Final Output

**Scope of this thread.** This is a single-app execution contract for `choicepoint` only. The 18-idea/select-9/parallel-portfolio-build instructions belong to the upstream parent-portfolio process, not this thread — this thread inherits the portfolio's quality bar (production-ready, unique, premium, commercially viable, local-first-with-cloud-optionality) as constraints, not as tasks to redo.

**Hard requirements**
- Working local-first SwiftUI iPhone MVP with real on-device persistence that survives relaunch — no in-memory-only state, no mock data standing in for the real thing.
- Four v1 workflows, all real: (1) log a decision — minimum required fields are decision text, prediction, and revisit date, savable in seconds; context, multiple options, and granular confidence are present in the form but optional and editable after the fact; (2) schedule a real local notification (`UNUserNotificationCenter`, survives app termination) tied to the revisit date; (3) tapping the reminder deep-links into that specific decision's outcome-logging flow, not a generic list or home screen; record actual outcome and whether the prediction held; (4) calibration stats view computed from real stored historical records, not placeholders.
- Widgets (upcoming revisits) and an App Intent/Siri quick-capture path are both in-scope required deliverables — not stretch goals — but they are subordinate to the core loop. Both read/write through the same persistence and validation layer as the main app (including the free-tier cap check, so quick-capture can't bypass it). If a later phase must choose between polishing widget/intent behavior and fixing a bug in capture, notification delivery, revisit deep-linking, or outcome logging, the core loop wins.
- Free tier: cap at 5 *active* (unresolved/awaiting-revisit) decisions. Resolved decisions do not count against the cap — this is the working assumption on an otherwise ambiguous spec term, named explicitly rather than silently assumed. Paid tier: unlimited active decisions, calibration analytics, custom revisit schedules, export — product structure must cleanly separate these even if commerce wiring isn't fully live in the MVP.
- Design must be calm, restrained, ledger-like, premium — no gamification, streaks, points, or badges anywhere in the experience, including in how reminders and revisits are framed.

**Non-goals**
- No cloud sync, accounts, or server component in v1 (architecture shouldn't preclude adding it later, but nothing depends on it now).
- No shared/multi-user decision journals in v1.
- No habit-tracker mechanics, streaks, badges, or engagement gamification of any kind.
- Not a general journal, note-taking app, or task manager — scope creep in that direction is a spec violation, not thoroughness.
- No dependency on an on-device LLM for the core experience — the voice-note-to-structured-record idea is optional/future and must never block delivery of the core loop.
- No hardcoded or fake calibration stats — if there's no real data, show a real empty state, not a demo number.

**Production-readiness definition**
Not "it compiles" or "the screens exist." It means: a user can create a decision, get reminded on schedule even if the app was killed, land directly on that decision's outcome flow from the notification, log the outcome, and see calibration stats derived from their own accumulated history — and all of that still works after a relaunch or device restart. It also means the notification-permission-denied path is handled intentionally (not silently swallowed), overdue revisits remain visible rather than disappearing, every reachable screen has real empty/loading/error/success states, accessibility (Dynamic Type, VoiceOver labels on the ledger-style typography) actually works rather than being assumed, and the cap-enforcement and active/resolved logic is verified as working behavior, not just described.

**Decision rules for later phases**
1. If a feature doesn't strengthen capture → revisit → honest outcome logging → calibration, cut it.
2. If a design choice makes the app feel playful, social, gamified, or habit-tracker-like, reject it.
3. If a capture-flow change adds required fields before the first save is possible, reject it — speed-of-capture is a spec-stated constraint, not a style preference.
4. Between widget/App-Intent polish and core-loop reliability, core-loop reliability always wins.
5. Between feature breadth and a smaller, fully-working, trustworthy app, choose the smaller finished app.
6. Any place the spec is ambiguous (e.g., "active" decisions), name the assumption explicitly in that phase's output rather than resolving it silently.

## Initial Discussion

Looking at this round, Codex and Claude actually landed in nearly the same place despite writing independently — same product framing, same core loop, same boundaries, same failure modes to guard against. The only difference is stylistic/numeric, not substantive.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Choicepoint is a private decision ledger — you capture a real decision and your prediction the moment you make it, and it forces a scheduled, honest confrontation with what actually happened, so you build real evidence of whether your judgment is improving.

**Primary user and scenario:** Someone making recurring, consequential personal or professional calls (hiring, product bets, job/relocation decisions, etc.) who wants to get better at judgment, not "reflect more" in the abstract. The scenario that has to work is the unglamorous one: mid-decision, phone in hand, ~20-30 seconds of attention, typing three things before getting back to whatever they were doing — then weeks later, an interruption that puts their own past reasoning in front of them before they've had a chance to rationalize the outcome after the fact.

**Core loop (four beats, all of which must be real, not simulated):**
1. **Capture** — decision, prediction, revisit date (context/options/confidence available but never required for first save).
2. **Wait** — a real scheduled local notification that survives force-quit and device lock, not a soft in-app-only reminder.
3. **Confront** — tapping the notification deep-links straight into that exact decision, showing the original reasoning alongside a form to record what actually happened. A generic list or home screen instead of the specific decision is a broken loop, not a lesser version of one.
4. **Calibrate** — a stats view aggregating prediction-vs-outcome across resolved decisions only, from real stored data.

**Hard scope boundaries:**
- No cloud sync, accounts, multi-user/shared journals, streaks/badges/points/social feed, general note-taking or task-list functionality.
- No dependency on an on-device LLM for the core loop to function — voice-note parsing is someday-future, never a blocker.
- Widgets and Siri capture are real deliverables but are satellites: if either threatens notification reliability or fast-capture speed, they get simplified or cut before the core loop is touched.
- Three surfaces only in v1: the revisit-organized decision list, the fast capture/edit flow, and the revisit/stats view — no dashboards, tags, folders, or "insights" copy that drifts into self-help language.
- Overdue revisits stay visibly surfaced rather than silently expiring; re-engaging a missed one is one tap.

**Measurable success criteria:**
- A user can go from empty state to a saved decision in well under 20 seconds touching only three fields.
- A scheduled notification actually fires after a full force-quit and device lock — verified on a real device, not assumed from simulator behavior.
- Tapping that notification opens the specific decision's outcome form with zero extra navigation.
- The free tier blocks a 6th active decision, and a resolved decision measurably frees a slot.
- The calibration screen shows a genuine empty state with zero resolved decisions, and only ever computes a percentage from at least one real resolved outcome — never a hardcoded sample number.

The one detail everyone wants carried forward without dilution: this is a before-vs-after calibration product, not a general decision journal. Any later choice that softens that contrast — even in the name of polish — is the wrong choice.

## Per App Product Brief

Both Codex and Claude wrote independent briefs this round, and they landed on essentially the same product — no real fight to referee here.

They agree on: the target user is someone with recurring, consequential professional/personal calls (hiring, product bets, career moves), not a daily journaler. The core loop is identical to what came out of earlier phases — three-field fast capture, real scheduled notification, deep-link revisit showing original reasoning, calibration stats from resolved decisions only. The free/paid split is the same shape on both sides: free caps at 5 active decisions (enough to prove the loop works), paid unlocks unlimited active decisions, deeper calibration analytics, custom revisit schedules, and export. Both frame export as a genuine paid hook — a professional-use artifact (sharing your actual track record with a board or a coach), not a checkbox feature. Both explicitly reject viral/social growth mechanics as incompatible with the product's honesty and calm-ledger positioning, converging instead on niche, credibility-driven word of mouth in professional communities that already value calibration (founders, managers, forecasting-adjacent circles). Local-first is treated as non-negotiable trust posture, not just an MVP constraint, with cloud sync/backup as the natural (but inert-for-now) next step via stable IDs and event-timestamped records. Both flag the same top risk: if revisit completion is low, the calibration promise is fraudulent, so reliability of the loop matters more than feature breadth.

Claude flagged one thing as her own judgment call rather than settled fact — that professional export is the stronger paid hook versus a more personal-growth-analytics framing — but nobody actually contests it, and Codex independently proposed export as a paid feature too, so this reads as a shared bet rather than an open disagreement.

CONSENSUS: YES

## Final Output

**Target user and use case:** Someone who makes recurring, consequential decisions professionally or personally — hiring calls, product/ship-or-kill bets, vendor picks, career or relocation choices — and currently has zero real evidence of whether their judgment is any good, just a vague feeling. Not a daily journaler, not someone tracking trivial choices. The moment that has to work is the unglamorous one: mid-decision, ~20 seconds of attention, typing three things before moving on, then weeks later confronting what they actually predicted before hindsight got to rewrite the story.

**Core loop:** Capture (decision + prediction + revisit date required, ~20 seconds; context/options/confidence present but optional) → real scheduled local notification → tapping it deep-links into that exact decision, showing the original reasoning before asking what actually happened → outcome logging feeds a calibration view built only from resolved decisions. Every beat must be real, not simulated — a fake notification, a generic-list deep link, or a hardcoded stats number breaks the promise, not just weakens it.

**Paid value and subscription value:** Free tier (5 active decisions) exists to prove the loop works, not to be a crippled preview. Paid unlocks (a) unlimited active decisions, (b) calibration analytics that only get meaningful with volume and time — confidence-bucketed accuracy, patterns across categories — which is precisely why it can't be free at n=5, (c) custom revisit schedules (a hiring call might want 90 days, a vendor pick 30), and (d) export, which doubles as the professional-use artifact (a real track record to bring into a coaching conversation or leadership review). The subscription has to earn its price through data volume and elapsed time, not by unlocking a screen that could just as easily have been free — that's the test any later design has to pass.

**Competitive wedge:** Everything else in this space is either generic reflection (journaling apps that never force a structural revisit against a stated prediction) or heavyweight forecasting tools (too numerical/spreadsheet-like for someone's actual hiring decision). Choicepoint's wedge is making "did you turn out to be right" the entire structure of the product, not a bolted-on feature.

**Growth angle:** Niche and credibility-driven, not broadly viral — deliberately so, since public sharing of predictions would poison the honesty of the input and drag the product toward the social/gamified territory the spec forbids. Growth happens through word of mouth in professional communities that already prize calibration (founders, managers, operators, forecasting-adjacent crowds), with exported calibration records acting as organic marketing artifacts when shared in coaching or leadership contexts.

**Local-first and cloud-ready plan:** V1 is fully on-device — no account, no server dependency, deterministic local persistence, local notifications, local calibration math. This isn't just an MVP shortcut; it's the right trust posture given how sensitive these decisions often are (real hiring calls about real people, real business bets). The data model should use stable UUIDs and event timestamps from day one, with decision records, revisit records, and computed analytics kept separable, so that cloud backup/sync (the natural first cloud feature — not shared/collaborative journals, which stay further out) can be added later without a data-model rewrite. Nothing in v1 should behave differently because cloud might exist someday.

## Detailed Discussion

Good news — round two actually finished the job. Codex's three-state outcome taxonomy (held / missed / mixed) plus a separate non-resolving "not yet" state turned out to already be exactly the split Claude was pushing for; Claude just added the reasoning for why those two things can't collapse into one button (mixed is a real, cap-freeing resolution; not-yet is a snooze that changes nothing about calibration data), and Codex's own wording already had them separate. The notification-ceiling problem is resolved too — Codex explicitly agreed "unlimited decisions" can't mean "unlimited pending OS notifications" and signed off on a rolling-queue approach with in-app overdue visibility as the backstop, which is the same shape as Claude's more detailed one-notification-per-decision, nearest-N-window mechanism. Privacy is settled: generic count/due-ness-only copy on lock screen and widget by default, real decision text only inside an authenticated app session, no user-facing toggle to weaken that in v1. And Codex directly named the remaining smaller items — downgrade behavior, permission-revocation checking, raw-fraction display alongside any percentage, and calendar-day/local-time semantics for scheduling — as things that should explicitly be in the final artifact, not edge cases to wave off. Nothing raised across both rounds got contradicted; everything either converged directly or got explicitly folded in without objection.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- Saving a decision requires exactly three fields: decision text, prediction, revisit date. Context, options considered, confidence, and "what would change my mind" are present in the form but always optional and editable later.
- The revisit flow always shows the original prediction and reasoning before asking for an outcome — never a blank form.
- Outcome logging produces two things together: a free-text narrative of what actually happened, and one structured result — **held**, **missed**, or **mixed/unclear**. This is a real resolution: it closes the decision, frees a free-tier active slot, and counts as its own bucket in calibration stats (never force-fit into a binary hit rate).
- "Not yet" is a distinct, separately-labeled action from the three outcome states above — it does not resolve the decision, does not touch calibration stats, simply pushes the revisit date forward, and the decision remains active (still occupying its cap slot). Design must not merge this with "mixed/unclear" into a single button.
- Overdue decisions never disappear — they stay visibly surfaced until resolved (held/missed/mixed) or explicitly dismissed.
- The free-tier cap (5) counts only unresolved/active decisions; resolving one frees a slot immediately.
- All capture surfaces — in-app form, widget, Siri/App Intent — share one validation layer and one cap-enforcement path. None of them can bypass it.
- Paid tier is "unlimited active decisions," not "unlimited scheduled OS notifications" — those are different promises and must be treated as such in the architecture that follows this phase. Notification scheduling is managed as a rolling window (effectively one pending notification per active decision, only the nearest-upcoming decisions kept scheduled at any time, with in-app overdue visibility as the reliable backstop regardless of notification state).
- Downgrade from paid to free never destroys or hides data: decisions already active above the cap stay fully visible, editable, and resolvable (including their notifications); only creating a *new* decision is blocked until the active count is back at or under 5.
- Notifications and widgets display count/due-ness only ("2 revisits due this week") — never decision content — with no v1 setting to change that. Full decision text is visible only inside the authenticated app.
- Calibration display pairs any percentage with its raw fraction (e.g. "3 of 3") and should avoid presenting a headline percentage as meaningful at very small sample sizes.
- Revisit scheduling uses calendar-day-plus-fixed-local-time semantics (not an absolute instant), so it behaves the way a person actually thinks about "check back in 90 days" across timezones/DST.

**Edge cases**
- Notification permission denied at first launch or later revoked in system Settings without ever reopening the app — requires an explicit in-app fallback state, and an active `authorizationStatus` check on every foreground (not just a one-time request) so silent revocation is surfaced, not invisible.
- A revisit date set in the past by mistake — should be prevented at entry or treated intentionally as "due now," not silently accepted as a future date that never fires.
- Decision resolved via one surface (e.g., in-app) while a stale notification for it still exists — tapping that notification opens a read-only resolved view, never a broken/duplicate outcome form.
- User at exactly 5 active decisions attempting a 6th via Siri or widget — must be blocked by the same shared cap check as the main form.
- Power user approaching iOS's ~64 pending-local-notification ceiling — handled by the rolling-window scheduling policy above, not left as an assumption that iOS "just handles it."
- Ambiguous/ongoing decisions that aren't resolvable on schedule — handled by the "not yet" reschedule action, distinct from a forced, data-polluting fake resolution.
- Paid subscription lapsing while active-decision count is well above 5 — existing decisions remain fully functional; only new capture is blocked.

**Data and privacy implications**
- Decision content is treated as sensitive by default (hiring judgments, business bets, personal calls) — never rendered in lock-screen notification banners or widget glances, only inside the authenticated app.
- Export remains a deliberate, user-initiated action — never automatic or silent sharing.
- The local store is included in standard device backup by default — this is a data-loss protection, not a cloud-sync/account feature, and is named here explicitly as a choice rather than left ambiguous.
- No cloud dependency, no account, in v1 — consistent with earlier phases.

**Risk register**
- **Low revisit completion** (highest risk, previously named): mitigated by neutral/forensic (not accusatory) revisit framing, overdue items never disappearing, and one-tap re-engagement with a missed revisit.
- **Capture friction**: mitigated by the strict three-field minimum save and two-speed capture model.
- **False precision / data corruption from vague outcomes**: mitigated by the structured held/missed/mixed field existing alongside narrative text, and by the mixed-vs-not-yet distinction preventing "mixed" from becoming a disguised snooze button.
- **Notification ceiling silently breaking the "unlimited" paid promise**: mitigated by the rolling-window scheduling policy; named explicitly as a real platform constraint, not a hypothetical.
- **Silent notification-permission revocation**: mitigated by active foreground re-checks and an explicit in-app denied/revoked state, not a one-time permission prompt.
- **Surface inconsistency** (app/widget/Siri diverging on validation or cap logic): treated as a product-integrity bug; mitigated by one shared validation/cap layer.
- **Misleading calibration stats at small sample sizes**: mitigated by always showing the raw fraction alongside any percentage.
- **Destructive downgrade behavior**: mitigated by the explicit rule that downgrade only blocks new creation, never hides or force-resolves existing data.

**Final assumptions** (named per this phase's own rule, not silently baked in)
- This is a single-user, iPhone-first, fully offline-capable app; notifications are a required part of the loop but not the sole way to discover overdue revisits — the in-app list is the backstop.
- "Active" means unresolved/awaiting revisit; resolved (held/missed/mixed) decisions free a cap slot.
- Outcome taxonomy for MVP stays intentionally simple (held/missed/mixed plus a non-resolving not-yet/reschedule action) rather than a richer confidence-scored postmortem model — deliberately traded off against capture/revisit speed.
- The local data store is included in standard iOS device backup (data-loss protection), while still requiring no cloud account or server dependency.
- No v1 setting exists to make notification/widget copy show full decision content — that stays fully out of scope for this pass, not merely deprioritized.

## App Features

CONSENSUS: YES

## Final Output

Both Codex and Claude arrived at almost the same prioritized feature set independently, and where Claude's pass went further, it was tightening/making-testable what Codex proposed rather than contradicting it. This closes the phase.

**Must-have features** (each gates production-readiness — no ship without these):

1. **Fast decision capture** — save with only decision text, prediction, revisit date; other fields optional/editable later. Test: empty state → saved record in well under 20 seconds, save enabled the instant the three required fields are filled.
2. **Active decision ledger** — clear upcoming/due/overdue grouping; overdue never disappears; real empty states.
3. **Real local-notification revisit scheduling** — calendar-day-plus-local-time semantics, rolling-window policy so "unlimited" paid decisions never silently hit the ~64-pending-notification OS ceiling. Test: force-quit the app, lock the device, confirm the notification still fires — verified on a real device, not the simulator.
4. **Deep-linked revisit flow** — tapping a notification opens that exact decision's original reasoning before asking for an outcome; a stale notification for an already-resolved decision opens a read-only view, never a broken/duplicate form.
5. **Structured outcome logging** — narrative text plus one of held/missed/mixed (a real resolution that frees a cap slot and feeds its own calibration bucket), kept strictly separate from a non-resolving "not yet" reschedule action.
6. **Calibration stats from real resolved data only** — raw fraction shown alongside any percentage, honest empty state, mixed outcomes represented explicitly rather than forced into a binary.
7. **One shared validation/cap-enforcement layer** across in-app form, widget, and Siri/App Intent — adversarially tested by trying to create a 6th active decision through each surface independently.
8. **Privacy-first notifications/widgets** — count/due-ness only, never decision text, no v1 toggle to weaken that.
9. **Notification permission handling as a real state** — explicit denied fallback, plus an active foreground `authorizationStatus` recheck so silent revocation surfaces in-app.
10. **Downgrade-safe subscription behavior** — a lapsed subscription with decisions above the cap never hides/deletes/force-resolves anything; only new creation above 5 is blocked. Paid gating itself uses a real, sandbox-testable StoreKit 2 entitlement check.
11. **Accessibility as a must-have** — Dynamic Type and VoiceOver labels verified on the core ledger-typography screens, not assumed.

**Should-have:**
- Upcoming-revisits widget (counts/nearest due date only)
- App Intent/Siri quick capture (minimum three fields, same validation)
- Optional confidence field in capture/edit
- 30/60/90-day revisit presets plus custom date
- Permission-status explainer card/state
- A step-up (but not full-blown) paid analytics view beyond raw held/missed/mixed
- Onboarding copy that honestly explains why notification permission is being requested

**Could-have** (cut without regret if time is short):
- StandBy widget variant
- Richer confidence-input granularity (e.g. a slider)
- Export format polish beyond a basic clean output
- Reusable revisit templates for recurring decision types
- Optional short "what I'd do differently" post-resolution note
- On-device LLM voice-note structuring — ships only if trivial and untouching of persistence/notifications; otherwise it's a won't, not a stretch could

**Won't-build:**
- Cloud sync, accounts, shared/multi-user journals
- Tags, categories, folders, or domain-based filtering/dashboards — explicitly killed even though an earlier phase floated "filtering across domains" as a paid feature, because it directly conflicts with the already-locked three-surfaces-only scope rule
- Streaks, badges, points, or any gamification/engagement mechanic
- General note-taking or task-list functionality
- Public sharing, social comparison, or community prediction features
- User-facing toggle to reveal decision content in notifications/widgets
- Rich tagging/dashboard-heavy organization of any kind

The one real disagreement in this round wasn't between the two participants — it was Claude overruling her own earlier "domain filtering as a paid feature" idea from a prior phase, flagging it explicitly as a self-correction rather than quietly dropping it. Nobody contested that reversal, so it stands as settled. Otherwise, everything converged: same core-loop-first ordering, same insistence that every must-have carries an adversarial, testable acceptance criterion (especially the two hardest-to-fake ones — real-device force-quit notification delivery, and cross-surface cap enforcement) rather than a vibe description.
