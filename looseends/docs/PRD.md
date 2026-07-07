# looseends — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both of us landed in the same place, and nothing here is actually in conflict — Codex's contract and my skeptic pass are additive, not competing. Here's the plain-English recap:

We both agree the portfolio-level stuff (12 ideas, pick 6, other 5 apps, cross-batch uniqueness checks, Jira/Notion prep) is not this conversation's job — that already happened upstream when "looseends" got selected. This thread's contract is narrow: take the already-chosen Loose Ends concept from spec to a real, working, local-first SwiftUI MVP, in its own folder.

We both agree "MVP" and "production-ready" are in tension in the source prompt, and the resolution is the same on both sides: build small but build it *whole*. One correct, fully-wired weekly loop (surface one dormant project → act, snooze, or release) beats a padded app with five half-finished features. Production-ready means real persistence that survives relaunch, empty/loading/success/error states on every reachable screen, accessibility, no unexpected network calls (this is personal/sensitive data), and test coverage on the decision engine and persistence — not App Store submission, not a working paywall, not Jira/Notion boards.

We both agree on the non-goals: not a task manager, not kanban, not a habit/goal tracker, not journaling, not a social accountability app, and it shouldn't drift into adjacent workspace concepts (CueKeeper's reminders, Practice-Loop's repetition, a digital-temple-style reflective ritual). "Release" should be a legitimate, first-class success outcome, not a failure state.

Where I (skeptic) added something Codex hadn't nailed down: since "act, snooze, or release" and "how a project enters the system in the first place" aren't specified anywhere in the prompt, those need to be explicit named assumptions carried into design/architecture rather than quietly decided differently by different phases. Nobody's pushed back on that — it's a gap-filler, not a disagreement.

The one thing genuinely still open isn't a disagreement between us, it's a shared acknowledgment: the "Claude Design Handoff Prompt" field is empty, so visual direction is a blank slate that the design phase has to own explicitly rather than assume.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (portfolio child spec for "Loose Ends," a Productivity MVP under batch-cat-b2).

**Hard requirements:**
- Standalone Loose Ends project, own folder, local-first SwiftUI, working MVP (not a mockup or spec).
- Core loop is fixed and non-negotiable: once a week, surface exactly one dormant *personal project* (not generic tasks/habits/notes), and let the user act on it, snooze it, or release it.
- Persistence must survive relaunch; architecture must be able to accept cloud sync later without a rewrite.
- Every reachable screen needs empty, loading, success, and error states as applicable.
- Accessibility and privacy are real requirements: no unexpected network calls, no data leakage — this app holds personal, potentially sensitive unfinished commitments.
- Test coverage required around the decision/resurfacing engine and the persistence model.
- Must feel premium and differentiated, with a believable (not necessarily built) monetization lane.

**Non-goals (MVP):**
- Not a team/collaboration tool, kanban board, general to-do manager, broad goal tracker, journaling app, idea inbox, or social accountability network.
- Not full multi-project execution management.
- No cloud accounts, AI dependency, or external integrations required for day-one value.
- No App Store submission artifacts, working subscription/paywall, marketing site, or Jira/Notion boards in this build — those are explicitly out of scope unless the user re-scopes later.
- No re-litigating app selection, no generating alternate app ideas, no cross-batch uniqueness audit — that's upstream, already settled.

**Production-readiness definition:** more than "it runs." Coherent onboarding into the ritual, reliable local persistence with stable identity for projects and past decisions, graceful first-run/no-data states, recovery from invalid/deleted data, accessible typography/controls, predictable behavior across relaunches, and real test coverage on the core engine — all in service of one small, fully-wired loop rather than many shallow ones.

**Decision rules for later phases:**
1. Preserve the weekly, one-project-at-a-time resurfacing ritual over any feature breadth.
2. Reject anything that makes the app look like a general project/task manager.
3. A feature is in scope only if it sharpens clarity of "act, snooze, or release" for the one surfaced project.
4. Fewer, sharper screens over elaborate navigation.
5. Deterministic local rules by default; any "smart"/ML-style ranking is optional and must never replace the simple baseline logic.
6. Monetization must add substantive value if built at all — never cosmetic-only — but isn't required to be functional in this MVP.
7. "Release" is a valid success outcome, not a failure path; design should reduce guilt, not manufacture productivity theater.
8. Since no design handoff prompt was supplied, visual direction is genuinely open — the design phase must state its assumptions explicitly rather than invent a brief that doesn't exist.
9. Semantics left undefined by the source prompt — how a project enters the system, and exactly what "snooze" and "release" do functionally — must be pinned down as explicit, stated assumptions in the design/architecture phase, not decided silently or inconsistently later.

## Initial Discussion

Round two actually closed every gap. Both sides moved off their round-1 positions and landed on the same rules.

**Snooze:** Codex's tiny fixed menu wins over Claude's single hardcoded cooldown — 2 weeks / 1 month / 3 months, no custom dates. Claude conceded this because three named constants are barely harder to test than one, and a single forced cooldown fought the "reduce guilt, don't manufacture productivity theater" mandate. In exchange, Codex explicitly accepted Claude's ask to always show the snooze count — not to shame anyone or auto-force a release, just so the pattern is visible to the human instead of quietly invisible to the system.

**Tags:** Both agree — cut entirely from MVP. Codex conceded this one outright; the "what it is" field stays free text, no structured tag storage, no filter UI, nothing to migrate later. If tags matter, real usage data earns them post-MVP.

**Dormancy threshold:** Codex proposed 14 days since last-touched as the eligibility floor, and nobody pushed back — that's locked.

**What resets the clock:** They converged on this explicitly — only "create" and "act" reset a project's last-touched timestamp. Snoozing does not count as touching (it's staying dormant, just deferred). Releasing takes it out of the pool, so the question doesn't apply.

**Rolling week / pacing:** This is the sharpest new agreement. Claude closed a real hole Codex hadn't addressed: what stops someone from resolving today's project and immediately demanding the next one? Answer, now settled — resolving a project ends that week's ritual; the next resurfacing can't happen until 7 days after that resolution, full stop, even if the user wants to binge through the backlog. The one carve-out: cold start. Before any decision has ever been made, the first eligible dormant project surfaces immediately, so a new user isn't staring at dead air. Codex didn't object to any of this in round 2, and it directly answers the coordinator's round-1 ask for an explicit sign-off rather than silence.

No open disagreements remain — every item flagged after round 1 got a concrete resolution with both sides visibly moving, not just talking past each other.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Loose Ends is a weekly ritual that surfaces exactly one dormant personal project at a time and won't move on until you act on it, snooze it, or release it.

**Primary user & scenario:** Someone sitting on a pile of half-started personal projects (a zine, a half-built site, a broken language-learning streak, a woodworking plan) who isn't looking for a task manager — they want periodic, low-effort permission to recommit, defer with intent, or actually let something go. They open the app roughly weekly, not daily.

**Core loop:**
1. **Entry (manual only):** title, short "what it is" (free text, no tags), why it mattered, why it stalled, optional "smallest next step," last-touched date.
2. **Eligibility:** a project qualifies for surfacing once it's been ≥14 days since last touched. "Touched" is reset only by creating the project or choosing "act" on it — snoozing does not reset it.
3. **Surfacing:** exactly one project is ever "in focus." It stays pinned until resolved, no matter how long the user goes without opening the app.
4. **Resolution — three choices only:**
   - **Act:** captures one concrete next step, marks the project active again, resets its last-touched clock.
   - **Snooze:** returns it to the dormant pool for a fixed, user-picked interval — 2 weeks / 1 month / 3 months, no custom dates — and the project's snooze count is always visible (informational, never enforced or punished).
   - **Release:** archives the project with an optional closure note into a calm history view. Not deletion, not framed as failure.
5. **Pacing:** once a project is resolved, the ritual is over for the week — the next resurfacing can't happen until 7 days after that resolution, even if the user wants more right now. Exception: cold start — before any decision has ever been made, the first eligible project surfaces immediately so onboarding isn't dead air.

**Hard scope boundaries (MVP):** No tags/categories/filters. No imports from Reminders/Notes/Photos — manual entry only. No kanban, task breakdown, collaboration, habit streaks, AI coach, or guilt-driving analytics. No custom/free-form snooze dates. No more than one surfaced project at a time, ever. The backlog/library is storage, not the main event.

**Measurable success criteria:** Eligibility is a pure, unit-testable function of (last-touched date, last-resolved-decision date, dormancy threshold, 7-day pacing rule, cold-start exception). A new user can add a first project in under two minutes. A returning user can resolve the week's surfaced project in under thirty seconds given the context shown. Persistence survives force-quit and relaunch with zero data loss. The app never shows zero projects while an eligible one exists, and never shows more than one. Distinct empty states exist for "no projects at all," "projects exist but none eligible yet," and "exactly one project, always the same one until resolved." No network calls fire anywhere in the core loop.

## Per App Product Brief

CONSENSUS: YES

This round actually closed every open thread, and both sides did real work to get there rather than just letting things drop. Codex explicitly disavowed the "custom review modes" and "seasonal revisit queue" phrasing from earlier ("paid insight should be read-only reflection, not a management surface... A sortable, queryable list... is not real value") — that's the explicit yes Claude asked for, not silence standing in for agreement. On history, Codex made the case that hard-capping it guts the app's actual emotional purpose, and Claude fully came around: free tier now gets full, uncapped, forever-scrollable history, because gating memory of things that already happened is erasure, not a fair paywall, while gating future capacity (project count) is fine. And that resolved the export tug-of-war cleanly too — once visible history is guaranteed free, there's no trust problem left to solve by also making the JSON export free, so structured export plus iCloud sync both land as paid, continuity/portability features rather than anything that looks like withholding someone's own data.

Both sides are now saying the same brief in the same words, including converging on the same organizing principle for every monetization decision: raw truth about what happened stays free forever, and only the app's synthesized judgment about what it means costs money.

## Final Output

**Target user & use case:** Someone carrying a real backlog — roughly 8 to 40 — of half-started personal projects (creative, practical, hobby-driven) who has already rejected task managers and reminder apps because those tools assume active management. They want a low-frequency, low-shame ritual: once a week, one dormant project surfaces with enough context to make an honest call, and then the app is done until next week.

**Core loop (already locked from prior phase, unchanged here):** Manual entry only. 14-day dormancy floor before eligibility. Exactly one project pinned in focus at a time. Three resolutions — act (concrete next step, resets dormancy), snooze (2 weeks/1 month/3 months, visible snooze count, never enforced or shamed), release (archived with optional closure note, framed as success, not failure). After any resolution, a 7-day pacing lock before the next resurfacing, except on cold start, where the first eligible project surfaces immediately.

**Free tier (must be a genuinely complete product, not teaser-ware):** The entire weekly ritual, forever, with no functional gate on the core loop. Manual entry, act/snooze/release, visible snooze counts, pacing rules — all free. Up to 7 concurrent non-released projects in the pool. Full, uncapped, chronological on-screen history of every act/snooze/release, forever — this stays free because it's the user's own truth about their own past, and cutting it off would read as the app quietly deleting someone's history rather than a fair paywall.

**Paid tier (real judgment-support utility, never cosmetic):** Unlimited concurrent projects. A reflection screen that surfaces aggregate patterns and stats computed from the user's history — e.g. "you've snoozed more than you've acted on over the last 90 days," "3 projects have been snoozed 4+ times," "your average time-to-release is 52 days." This is strictly read-only stat cards and sentences — no tappable list, no sortable table, no way to browse or select among multiple dormant projects. That's a hard invariant: the paid tier is not allowed to reopen the "browse your whole backlog" surface the free ritual deliberately forecloses. Also paid: structured JSON export and encrypted iCloud multi-device sync — real continuity and portability value, not decoration. The anchoring principle for every future feature decision: "a subscriber is paying for better judgment support over time, not colors or icons," and raw history/truth is always free while synthesized insight is what's for sale.

**Competitive wedge:** Every adjacent app in this space assumes an unfinished project must either be organized back into active productivity or sentimentally dwelt on indefinitely. Loose Ends is built around the missing middle — a neglected project deserves a concrete re-entry, an intentional deferral, or a dignified release — and it enforces its own pacing so it can never become a bingeable guilt machine, even for paying users.

**Growth:** Niche, quiet word of mouth in creative, maker, ADHD-adjacent, and therapy-adjacent circles, driven by how legible the one-sentence pitch is. No built-in social or sharing layer in this build. The only future-facing note carried forward is a data-model consideration (not a feature): each resolved decision already captures title, dormancy duration, decision type, and closure note, which would be enough to generate a shareable "release card" later if ever wanted — this is a "don't foreclose the door" note only, not scope for this build.

**Local-first / cloud-ready:** Fully local, fully offline, zero network calls in the core loop, no account required for free tier. Persistence uses stable, sync-safe identity (proper UUIDs, merge-safe timestamps) from day one so CloudKit sync can be added later purely as a paid, optional layer without a data-model rewrite.

**Why this deserves to exist:** Almost no software treats "I am no longer carrying this" as a valid, well-designed success state. This app is built entirely around that missing, uncomfortable middle state between active commitment and deletion — and trusts the user with their own full history, always, whether or not they ever pay.

## Detailed Discussion

CONSENSUS: YES

Both of Codex's open items got explicit, direct yeses this round, not just non-objection: "Claude's widened edit rule is right, and I'd lock it exactly that broadly" on editing never resetting dormancy under any status, and "I also agree with Claude's backup point... it should become a real product requirement" on never excluding the local store from default OS backup. Claude, in the same round, gave the matching direct yes on Codex's surfaced-delete proposal after actually stress-testing it for an abuse case (could someone dodge the pacing lock by deleting and re-adding a project with a backdated timestamp — no, because snoozing is already strictly easier than that, so it's not a real gaming vector), and added one cheap, uncontested detail — the delete confirmation copy needs to explicitly warn when you're about to delete your current surfaced project, since delete now behaves identically regardless of status and that specific case deserves a heads-up. Claude also closed a small new gap — reject or clamp future-dated last-touched entries at intake, so a fat-fingered date doesn't quietly masquerade as a real bug instead of a caught input error. Nothing here drew any pushback. Every thread the coordinator flagged as open is now answered on the record by both sides.

## Final Output

**Resolved requirements**

- *Project record:* stable ID, title, short "what it is" (free text), why it mattered, why it stalled, optional smallest next step, `createdAt`, `lastTouchedAt`, current status (dormant / surfaced / snoozed / active / released), `snoozeUntil` + snooze count when applicable, and a release payload (date + optional closure note) when released.
- *Decision log:* append-only, one entry per resolution — project ID, decision type, timestamp, dormancy duration at decision time, optional note, and the chosen interval for snoozes. This is the source of truth for history and later paid reflection.
- *Last-touched semantics (the contradiction from round 1, now fixed):* at creation, the user may supply a last-touched date; if omitted it defaults to today. That value seeds the dormancy clock. After creation, the only thing that can ever move `lastTouchedAt` forward is an explicit **Act** decision. Editing a project's fields never resets dormancy, under any status — dormant, snoozed, or currently surfaced. Snoozing never resets it either. This is one rule, no status-conditional exceptions.
- *Eligibility & selection:* a project qualifies once ≥14 days have elapsed (real elapsed time, not calendar-day math) since `lastTouchedAt`, AND either no decision has ever been made (cold start) or ≥7 days have elapsed since the last resolution. When multiple projects are simultaneously eligible — the common case, not an edge case, given expected backlog sizes — the tiebreak chain is: oldest `lastTouchedAt` first, then oldest `createdAt`, then a stable UUID string comparison as the final deterministic fallback.
- *Surfaced-project invariant:* "currently surfaced" is durable, persisted state (exactly one project's status may be `.surfaced`), never something recomputed live from dates on launch. It only changes as a side effect of an explicit event: a resolution (Act/Snooze/Release), or a deletion of the surfaced project itself. On load, the persistence layer checks that zero-or-one project is flagged surfaced; more than one is a corruption signal with a defined recovery path (re-derive from the decision log, or fall back to the correct empty state).
- *Delete vs. Release:* Release is the sole ceremonial exit path and the only thing that writes to the closure history. Plain delete exists as a secondary action from the edit/detail screen, framed as fixing a mistake (typo, duplicate, "this was never really a project"), and never appears in history. Deleting the currently surfaced project clears the surfaced slot and immediately re-runs selection against the remaining pool if pacing allows — it does not consume the week's pacing lock, because deletion is data correction, not a ritual resolution. The delete confirmation copy must say so explicitly when the target is the surfaced project, so nobody loses their week's context with no warning that something else is about to take its place.
- *Paywall enforcement:* the free-tier cap (7 concurrent non-released projects) can only block creating a new project past the limit. It can never block resolving (Act/Snooze/Release), editing, deleting, or reading history on projects the user already has.
- *Clock robustness:* dormancy and pacing are computed from elapsed duration, not calendar-day subtraction, so timezone changes and DST don't cause off-by-one eligibility flips. Any negative elapsed duration (clock moved backward, device clock drift) resolves to "not yet eligible," never a crash or an unsigned-arithmetic wraparound.
- *Input validation:* a future-dated `lastTouchedAt` at creation is rejected or clamped at entry time, so a mistyped date reads as a caught validation error rather than a confusing "why isn't this eligible" bug later.
- *Backup architecture commitment (elevated from disclosure to requirement):* the local persistence store must not be excluded from the OS's default backup behavior (iCloud/device backup). This is a deliberate, written-down product decision so a future "exclude cache/temp files for cleanliness" change doesn't silently undo it. This is a distinct promise from paid CloudKit sync — free tier gets "restore your phone and your archive is still there," paid tier gets "your data follows you live across devices right now."
- *Self-explaining states:* every reachable state must be expressible in one plain sentence surfaced in the UI — why this project surfaced now, why nothing is surfacing yet and when it will, what a chosen snooze interval actually does, what act/release do, and what "touched" means. If a state can't be explained in one sentence, it's a sign the underlying rule is still fuzzy.

**Edge cases (enumerated and resolved)**

- One project already surfaced + new project becomes eligible → surfaced project stays pinned, nothing changes.
- Editing a project (any status, including surfaced) → never resets dormancy; only Act does.
- User manually changes a project's last-touched date → eligibility recomputes for that project, but it cannot dislodge whatever's already in the surfaced slot.
- The surfaced project is deleted → surfaced slot clears, next eligible project surfaces immediately if pacing allows (no pacing lock consumed), with explicit confirmation copy warning the user beforehand.
- All projects released → home screen shows a calm, complete-feeling state, not a barren one.
- Projects exist but none eligible (dormancy or pacing not yet satisfied) → explain in plain language which rule is blocking and when the next resurfacing becomes possible.
- Multiple projects simultaneously eligible → deterministic tiebreak chain (oldest last-touched → oldest created → UUID) guarantees a stable, explainable pick every time.
- Device clock anomalies (timezone crossing, DST, clock moved backward) → elapsed-time math, negative durations always resolve to "not eligible," never a crash.
- Future-dated last-touched entry at creation → rejected/clamped at input time.
- Corrupted or invalid "more than one surfaced project" state on load → defined recovery path (re-derive from decision log or fall back to empty state), not silent papering-over.

**Data and privacy implications**

- No account, no analytics SDK, no remote config, no surprise permission prompts on first launch, no notification-permission ask during onboarding (notifications, if ever added, are opt-in from settings only, after core ritual use).
- Zero network calls anywhere in the core loop; fully local, fully offline.
- Local store participates in default OS/device backup (not excluded) — this is the free tier's device-loss protection, distinct from and not competing with paid CloudKit sync.
- Free tier's honest promise is "private and offline by default," not "safe forever regardless of what you do" — users who disable device backup entirely are knowingly outside that protection, and paid export/sync remain the deliberate upgrade path for portability and continuity, consistent with the prior phase's monetization brief.
- Persisted identity (UUIDs, merge-safe timestamps) already required by the architecture-readiness brief; this phase adds that the decision log and status field are the durable source of truth in the corruption-recovery path.

**Risk register**

- *Ambiguous state → eroded trust:* mitigated by the one-sentence-explainability requirement on every screen and the hardened, unambiguous rules above (last-touched semantics, tiebreak chain, edit-never-touches).
- *Surfaced project silently swapping mid-week due to recomputation:* mitigated by making the surfaced slot durable, persisted state that only changes via explicit events.
- *Release used as a cleanup mechanism, polluting the closure ledger:* mitigated by giving plain delete a real, separate, non-ceremonial home on the edit screen.
- *Deletion accidentally burning a user's ritual week:* mitigated by defining deletion as non-resolution (no pacing consumption) plus distinct confirmation copy for the surfaced case.
- *Free-tier device loss = total data loss:* mitigated (not just disclosed) by the default-backup-inclusion architecture commitment; residual risk (user has backup disabled entirely) is accepted and named, not hidden.
- *Nondeterministic project selection across relaunches/versions:* mitigated by the fully specified tiebreak chain, eliminating "whatever the query happens to return first."
- *Clock/timezone edge cases producing bizarre eligibility flips:* mitigated by elapsed-time math and explicit negative-duration handling.
- *Color-only signaling implying Release is a "bad" outcome:* named as a hard constraint for the design phase to inherit — act/snooze/release must not be color-hierarchy-coded in a way that reads release as failure.

**Final assumptions carried into design/architecture**

1. User-provided last-touched date (defaulting to today) seeds the dormancy clock at creation; only Act ever moves it afterward.
2. Editing never resets dormancy, under any project status, with no exceptions.
3. Exactly one project may be flagged surfaced at a time, as persisted state, changed only by explicit events (resolution or deletion-of-surfaced).
4. Tiebreak for simultaneous eligibility: oldest last-touched → oldest created → UUID.
5. Delete is mistake-correction (edit screen, no history footprint, doesn't consume pacing); Release is the only ceremonial, history-writing exit.
6. Free tier's local store stays inside default OS backup by architectural commitment, not just disclosure.
7. Dormancy/pacing use elapsed time with explicit negative-duration handling; future-dated entries are validated at input.
8. Every UI-reachable state must be explainable to the user in one plain sentence.

## App Features

CONSENSUS: YES

Both loose threads got closed clean this round, with actual reasoning exchanged rather than one side just giving up. Codex ran his own four-test filter against the premium/reflection stub screen and explicitly killed it — "no dedicated premium screen, no fake reflection surface" — agreeing that a screen gesturing at features that don't exist is product theater, not trust-building, and that a single quiet settings line does the same signaling job with none of the QA surface area (no empty/loading/error states, no dead-end taps, no nav path to test). On notifications, Codex called for won't-build, and Claude did a genuine about-face from his own could-have position once Codex's implicit reasoning got spelled out: opt-in doesn't shrink the real problem, which is that a background notification scheduler would be a second, independent implementation of "when's the next resurfacing eligible" that could drift out of sync with the app's own foreground logic — and a notification firing on the wrong day is a worse trust break than no notification at all. Snooze-undo also fully merged into one mechanism: editing a snoozed project's snooze-until/status directly, no bespoke "undo" button, and Claude explicitly adopted Codex's framing as the cleaner one. Nothing is left unanswered.

## Final Output

**Must-have (the ritual spine — every item below has to trace directly back to the locked core loop and architecture invariants, and each is a real acceptance-tested requirement, not a nice-to-have):**

1. **Onboarding** — explains the ritual (one project a week, act/snooze/release, weekly pacing) in one screenful, asks for no permissions or account, and leads straight into adding a first project.
   *Acceptance:* a first-run user can restate the premise after onboarding; zero permission prompts fire; onboarding ends by opening project intake.

2. **Project intake** — title, what it is, why it mattered, why it stalled, optional smallest next step, last-touched date (defaults to today).
   *Acceptance:* required fields validate; future-dated last-touched is rejected/clamped at entry, not silently saved; save works fully offline; creation is never blocked by any project-count limit in this build.

3. **Single-state home ritual screen** — exactly one of: surfaced project, no projects yet, projects exist but none eligible, or everything released.
   *Acceptance:* never shows more than one surfaced project; each of the four states explains itself in one plain sentence (why it's showing, or when the next one comes); surfaced project stays pinned across force-quit/relaunch.

4. **Resolution flows — Act / Snooze / Release.**
   *Acceptance:* Act captures a concrete next step and moves last-touched forward; Snooze offers only the three fixed intervals (2 weeks/1 month/3 months) and always shows current snooze count plus next-eligible date; Release archives with an optional closure note and is never color-coded as a failure/negative outcome; any of the three closes the ritual for 7 days except on cold start.

5. **Edit / delete as correction, not resolution** — includes editing a snoozed project's snooze-until value or clearing its snooze status directly, as the one unified mechanism for "I snoozed by mistake" (no separate bespoke undo control).
   *Acceptance:* editing never resets dormancy under any status; delete never appears in history and never touches dormancy; deleting the surfaced project shows distinct warning copy, clears the slot, and immediately re-surfaces the next eligible project without consuming the week's pacing lock.

6. **Uncapped chronological history/closure ledger.**
   *Acceptance:* renders correctly at zero, one, and hundreds of entries with no pagination bugs; every act/snooze/release is visible forever, in order, with decision type, date, and relevant note/next step; never gated behind anything.

7. **Deterministic selection engine + crash-safe persistence.**
   *Acceptance:* pure, unit-tested function covering 14-day dormancy, 7-day pacing, cold-start exception, simultaneous-eligibility tiebreak (oldest last-touched → oldest created → UUID), and negative-duration clock weirdness always resolving to "not eligible"; force-quit/relaunch reproduces exact prior state including which project is surfaced; local store is never excluded from default OS backup.

8. **Corruption recovery as its own tested requirement.**
   *Acceptance:* a deliberately corrupted "more than one surfaced project" state on load re-derives the correct single surfaced project from the decision log or falls back to the correct empty state — never silently shows two "current" projects.

9. **Accessibility** — full must-have status, not polish.
   *Acceptance:* Dynamic Type scales cleanly on every screen including the surfaced card; every control (especially Act/Snooze/Release) is fully VoiceOver-labeled and distinguishable; no color-only signaling that implies Release is the "bad" choice.

**Should-have:** exactly one item — a single, non-blocking line of premium-intent copy somewhere in Settings/About (something like "deeper insight tools are planned for later"), with no dedicated screen, no tappable affordance, nothing that can dead-end.

**Could-have:** empty. Nothing survived the bar this round, and both sides are treating that as the phase holding the line rather than a gap.

**Won't-build:** tags/categories/filters/folders; any import from Reminders/Notes/Photos; kanban or task-breakdown views; collaboration or social features; streaks/gamification; custom or free-typed snooze intervals; any browsable/sortable/filterable multi-project surface anywhere, including inside any future paid feature; a working/enforced 7-project cap (the cap exists only as an unused constant and entitlement boundary in code, never a real wall a user hits); a dedicated premium/reflection/paywall screen of any kind; working export, sync, or reflection analytics; notifications of any kind, including opt-in/settings-gated ones; a home screen widget; AI features.
