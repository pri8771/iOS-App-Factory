# availability-concierge — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Since Codex and Gemini both came back empty this round, we've only got one real voice in the room — but it's a strong, well-argued one, and nothing contradicts it. I'm treating this as consensus by default: a single unopposed analysis with no dissenting view to reconcile.

Here's where things landed: the room agrees this phase's job is much narrower than the full parent-portfolio prompt suggests — we're writing the contract for *one* child app (availability-concierge), not re-litigating the 6-app selection, Jira/Notion backfill, or cross-app orchestration; those are inherited or upstream, not ours to redo. The big flag raised is that "Availability Concierge" itself is under-specified — no design handoff prompt exists yet — so this phase needs to lock one concrete interpretation in writing so design/architecture don't diverge later. There's also a real tension between "production-ready" (portfolio-level) and "MVP build" (this app's own spec) that needs to be resolved explicitly rather than picked silently, and a call to define "local-first" concretely for a coordination-flavored app (EventKit-backed, on-device logic, with a seam for future multi-user sync) rather than leaving it vague. Monetization/virality get downgraded from "must-ship" to "must-be-named-as-a-real-mechanic, not necessarily wired up in MVP." No one has pushed back on any of this yet.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (portfolio prompt + child spec for `availability-concierge`, Business category, MVP build mode, no design handoff prompt supplied yet).

**Scope of this phase:** This contract governs only the `availability-concierge` child project. It inherits, and does not re-decide, the portfolio-level constraints (uniqueness across the batch and workspace, premium design, real end-user value, monetization path, local-first-with-cloud-seam, viral potential). Re-opening app selection, the 12-idea/6-app process, or Jira/Notion backfill is out of scope here — those belong to the parent portfolio orchestrator.

**Hard requirements:**
1. Whoever runs the next (concept/product-direction) phase must commit to one explicit, written interpretation of "Availability Concierge" (e.g., mutual free-time finder for meetings vs. client-facing booking/availability display vs. personal multi-calendar aggregator vs. reservation/waitlist tool) and state it as a single, quotable sentence that every later phase inherits without re-deriving.
2. The app must check itself against the full forbidden list (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the digital temple app, the PO-automation tool) and flag rather than assume clearance, since this project's context doesn't have visibility into the other 5 sibling apps in this batch or other batches.
3. "Local-first" must be defined concretely: on-device EventKit (Calendar) integration and on-device matching/suggestion logic, no server dependency required for MVP, with an explicit protocol/service-boundary seam where future multi-user real-time sync could plug in later.
4. Every reachable screen needs real empty/loading/success/error states — including EventKit permission-denied and empty-calendar states as first-class, not afterthoughts.
5. Monetization and virality: product-direction and architecture phases must name a concrete, specific subscription mechanic (not a generic "premium tier" placeholder) — but the MVP build phase is not required to integrate StoreKit/paywall unless later phases decide it fits within scope.

**Non-goals for the MVP:**
- Not a feature-complete Calendly/Fantastical competitor — one core workflow, done fully, beats broad partial coverage.
- No multi-user real-time sync, no backend/account system, no live payment processing wired to App Store Connect in the MVP itself.
- Not re-deciding portfolio-level app selection, batch composition, or cross-app process (Jira/Notion, combined transcripts, etc.).

**Production-readiness definition (resolving the MVP-vs-production tension):** Scope is intentionally narrow (one core workflow), but everything inside that scope must be fully real: actual EventKit integration or actual local persistence (no mock/fake data), persistence that survives relaunch, all four UI states per reachable screen, accessibility (Dynamic Type, VoiceOver, contrast) as a requirement not polish, and no crashes or force-unwraps on permission-denied/empty-data paths. It explicitly does not mean a shipped payment system or multi-user sync.

**Decision rules for later phases:**
- If a later phase finds "Availability Concierge" still ambiguous, it must pick and document the interpretation rather than proceeding on an implicit guess — this is a blocking step before product-direction work continues.
- If StoreKit/paywall work is skipped in the MVP build, that must be recorded as a known limitation at final review, not silently dropped.
- Any mechanic, screen, or naming choice that resembles a forbidden app (batch or workspace-wide) must be flagged explicitly for portfolio-level review rather than assumed safe.
- A later phase is violating this contract if it re-opens portfolio-level decisions (app count, category assignment, cross-app orchestration) instead of building within this one app's contract.

## Product Research

CONSENSUS: YES

## Final Output

Same story as last phase — Codex and Gemini both came back empty, so this is one thorough, unopposed voice rather than a real multi-party debate. But nothing contradicts it, it directly answers the blocking question the prompt contract left open ("commit to one interpretation of Availability Concierge"), and it hits every required output for this phase, so I'm calling it converged rather than waiting on CLIs that aren't responding.

Here's where it landed: the room ruled out two of the four candidate interpretations from the prior phase almost immediately, because they contradict decisions already locked in (no backend, no accounts, no multi-user real-time sync). A live client-booking page needs a server; a true "read someone else's calendar" mutual-availability finder needs their calendar reachable somehow — neither survives local-first-only. What's left, and what got picked as the concrete interpretation everyone downstream should build against: **an app that reads the user's own on-device calendars, computes their real free slots against configurable rules (working hours, buffer time, duration presets, minimum notice), and hands them a clean, title-free, shareable time-range message instead of the "does Tuesday work?" back-and-forth** — the "concierge" is doing the scheduling arithmetic and formatting, not brokering a live two-sided booking. That's explicitly named as a scope limitation (composing the offer, not recipient-side live booking), not glossed over.

**Audience and use context:** People who coordinate meeting/call times with others informally — over text/email/Slack rather than a booking link — where sending a web link feels too formal or the other side won't click through. Skews toward small business owners, freelancers, consultants, and anyone doing 1:1 scheduling without an assistant, plus informal/personal use ("when am I actually free this week").

**Comparable apps/patterns:** Calendly/Cal.com for the duration-plus-rules → candidate-slots mental model (but they require a live link/backend, which this deliberately avoids); the old Clara/x.ai concept for the "concierge does the scheduling admin" tone without a backend; Apple's own Calendar "Find a Time" (Exchange/CalDAV free-busy) as the platform-native version — a signal that raw free-slot computation is table stakes and differentiation has to be in the rules/personas/output polish; Doodle/When2meet as the "poll people instead of reading calendars" alternative — not a real competitor, but worth having an answer ready for "why not just poll."

**Platform-specific opportunities:** Native multi-account EventKit read (work/personal/subscribed calendars) with explicit per-calendar selection so noise calendars (holidays, birthdays, subscribed sports schedules) don't silently count as "busy"; a pre-permission priming screen before the system Calendar-access dialog fires; native share sheet as the output mechanism; Shortcuts/Siri, a home-screen widget, and saved "personas" (different rule sets for different contexts) flagged as natural expansion/paid-tier features rather than MVP requirements.

**Major assumptions and risks:**
1. Trust risk — the entire value proposition is "the times I say I'm free are actually correct," so all-day events, recurring-event exceptions, time zone shifts, and noise calendars all have to be handled correctly or the app is worse than the manual process it replaces.
2. Privacy risk — computing free/busy requires reading full calendar contents including sensitive titles; the shared output must structurally never leak event details, only time ranges, and that has to be enforced in the data model, not left as a UI convention.
3. First-launch risk — permission-denied or empty-calendar is a highly likely first experience (including for reviewers), and the contract already flags this as first-class, worth underlining as the thing most likely to get cut under time pressure.
4. Virality is structurally weak for a no-backend MVP — there's no clickable branded link, just a pasted text blob, so the growth story should be named honestly as capped-in-v1, with a future web/link version flagged as the natural cloud seam.

**Implications for the first build:** One core flow — pick duration/meeting type → app shows computed free slots from selected calendars/rules → user optionally trims the list → share sheet with a formatted, title-free time-range message. Needs real (not mock) persistence for rule "personas" (working hours, buffer, duration presets) that survives relaunch, a genuine calendar-source-selection settings screen (not a buried checkbox), and a correctly handled "you're fully booked in this window" empty state rather than a blank list. Everything else named (Shortcuts/Siri, widget, ICS attachments, multiple saved personas as a paid tier) is real and worth naming as the monetization/expansion path, but explicitly out of the MVP critical path.

## Portfolio Selection

CONSENSUS: YES

## Final Output

Same pattern as the last two phases — Codex and Gemini couldn't join (rate limit / auth issue), so this is one unopposed but thorough analysis rather than a multi-party debate. But it directly answers this phase's required question and nothing in the prior transcript contradicts it.

The call: **this is a single-app run, not a portfolio-parent.** The "generate 12 ideas, pick 6" instruction in the original prompt belongs to the parent portfolio orchestrator, which already ran that process and selected availability-concierge as one of the 6 apps before this child project ever started. Re-running idea generation or app selection here would just re-litigate a decision that's already locked in by the prompt contract and product research phases — both of which explicitly scoped themselves to this one app. No portfolio-json manifest is needed because there's nothing to split into sibling projects; this project *is* one of the siblings.

**Selected app:**
- **Slug:** availability-concierge
- **Category:** Business
- **Promise:** Reads your own on-device calendars, computes real free time slots against your rules (working hours, buffer, duration presets, minimum notice), and hands you a clean, title-free, shareable time-range message — no booking link, no account, no back-and-forth.
- **Target user:** Freelancers, consultants, small business owners, and anyone coordinating 1:1 meeting times informally over text/email/Slack, who wants a fast, honest answer without sending a Calendly-style link.
- **Build:** true

**Rationale:** Locked in across two prior phases with no dissent — local-first-only constraints already rule out booking-page and mutual-calendar interpretations, leaving "compose a title-free shareable offer" as the only interpretation that survives the no-backend/no-accounts contract. This round added one product refinement worth carrying forward: the default rule-persona must feel opinionated out of the box (grant access → see a sensible computed result immediately), not a blank config form — first-run friction was flagged as the most likely way this app fails despite correct calendar math.

**Rejected alternatives (already eliminated upstream, restated for completeness):** client-facing live booking/availability display (needs a server), true mutual free-time finder across other people's calendars (needs their calendars reachable), reservation/waitlist tool (different domain entirely, doesn't fit "concierge" interpretation chosen).

No portfolio split needed — proceed directly to product direction / design for this single app.

## Initial Discussion

CONSENSUS: YES

## Final Output

Only one voice showed up this round (Codex and Gemini both stayed offline), but it's a thorough, self-consistent take that directly answers everything this phase needs to produce, and it doesn't contradict anything locked in during the prompt-contract, product-research, or portfolio-selection phases — so I'm calling this converged rather than stalling on CLIs that aren't responding.

Here's where it landed:

**Product promise (one sentence):** Availability Concierge turns "when are you free?" into a fifteen-second task — it reads your own calendars, runs them through rules you set once, and hands you a title-free block of real open times ready to paste into a text.

**Primary user and scenario:** Someone gets a casual "can we grab 30 min this week?" message mid-task and wants to answer fast — freelancers, consultants, small business owners doing informal 1:1 scheduling without a booking link.

**Core loop:** Open app → already-computed free slots are showing (using last-used or default rules, no setup wizard) → optionally adjust duration (15/30/60) or day range → optionally deselect a slot you don't want to offer → tap share → native share sheet with formatted, title-free text → done. Everything else (persona editing, calendar source picking, buffer/notice tuning) lives one layer down, never blocking that loop.

**The one design principle getting the most weight:** the moment right after calendar permission is granted is the highest-risk point in the app. It must show a *good* default computation immediately — opinionated defaults (auto-exclude birthday/holiday/subscription calendars, 9–5 working hours, 15-min buffer, few hours' minimum notice, current week) — not a config form. Settings is where you go to fix defaults, not where you start.

**Hard scope boundaries:** read-only against EventKit (no writing events, not a calendar app), one rule set/persona in MVP (but structured as a named record, not flat settings, so multiple personas can be added later without a rewrite), no recipient-facing features (no links, no tracking, no read receipts), no notifications/reminders, no widget/Shortcuts integration in this pass.

**Measurable success criteria:** cold-open to share-ready message under 15 seconds with existing calendar data and default rules; zero crashes across permission-denied, zero-calendar, and fully-booked-week paths; settings/persona changes persist and apply on the very next computation without relaunch; and — treated as a testable invariant, not just intent — no code path can let an event title, location, or notes field reach the shareable output string.

**Open items nobody's pushed back on, but worth flagging as still one-sided:** the screen inventory (home with 5 states, rules/persona editor, calendar-source screen, slot-review/trim screen) and the recurring-event/all-day-event/timezone edge-case handling are detailed and sound reasonable, but they've only been vetted by one participant. Nothing in the transcript disagrees with them — there's just no second opinion yet to call it fully stress-tested.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Same pattern as every phase before this one — Codex and Gemini couldn't join, so it's a single well-argued voice rather than a debate, but nothing in the prior transcript contradicts it and it hits every required output for this phase cleanly. Calling it converged.

Here's where the brief landed:

**Target user & use case:** A solo operator — freelancer, consultant, coach, or small-business owner — who does their own scheduling and gets casual "can we grab 30 min this week?" asks over text/email/Slack a few times a week. They have a real, populated calendar and won't send a Calendly link for an informal ask because it reads as too formal. Scope stays narrow on purpose: this is not for teams, assistants scheduling for someone else, or empty-calendar users — trying to serve those would dilute the one thing the app has to nail.

**Paid value / subscription:** Free tier ships exactly one persona (one rule set: duration, working hours, buffer, min notice, calendar sources) — hard-capped, not a nag. The subscription unlocks multiple named personas ("Client calls" vs. "Quick chats" vs. "Consulting," each with its own hours/buffer/calendar-source rules), unlimited saved duration/day-range presets, and per-persona calendar filtering. This is a functional wall, not cosmetic — a user hits it the moment they need a second rule set for a different kind of ask, which for this user happens within the first week of real use. Raw free/busy math alone isn't sellable (Apple could ship that natively); the personas are.

**Core loop:** Open app → slots for the active persona are already computed and on screen (zero required taps to see something useful) → optionally switch persona (paid) or duration chip → optionally deselect a slot → share sheet → done. The non-negotiable invariant underneath the loop: never surface a false-free slot, even against adversarial calendar states (cancelled/moved recurring instances, overlapping all-day events, timezone changes) — this matters more than any UI polish, because one wrong slot makes the app worse than doing it by hand.

**Competitive wedge:** Not the free-slot computation (commoditized) — it's trust plus speed for *answering a person* rather than running a booking page. Concretely: calendar sources labeled by account so the user can verify at a glance, an honest "fully booked" state instead of a blank list, and output text clean enough that the recipient never suspects it's automated. Calendly's wedge is the two-sided booking flow; this app's wedge is that there's no second side at all — it's a faster, more honest version of "let me check my calendar."

**Growth angle:** Explicitly niche and slow, not viral — the brief is honest that a no-backend MVP has no clickable artifact to spread. The mechanism is a small, optional, togglable signature line in the shared text ("via Availability Concierge") that gives word-of-mouth a name to attach to when a recipient asks "how'd you make this?" A web landing page or Shortcuts/Siri integration are named as real v2 growth levers, explicitly not v1 requirements.

**Local-first & cloud-ready plan:** EventKit is the only data source, strictly read-only — no calendar writes, ever. Personas are structured local records (not flat UserDefaults) with a stable UUID and schema-version field from day one, so the free/paid gate is "how many persona records you're allowed to create" — a clean, checkable boundary. The free-slot/share-formatter types carry only start/end/duration, never an EKEvent reference or title/location/notes — a testable invariant against title leakage, not just a UI convention. The cloud seam: no persona-related type may need reshaping (only additive fields) to support future multi-device sync or a web-share companion.

**The real reason this app deserves to exist:** it replaces a small, constant, annoying manual task (mentally checking your calendar and typing out times) with something that's both faster and more trustworthy than doing it yourself — and the retention hook isn't the first successful share, it's the first time the default persona was wrong and switching personas fixed it in two taps instead of manual retyping. That reframes the paid tier as the actual retention mechanic, not bolt-on monetization.

Nothing here is in tension with the locked product-direction phase (single persona in MVP, read-only EventKit, no recipient-facing features) — this phase adds the monetization/growth/wedge layer on top without reopening any of that. Ready to move to design direction.

## Next Steps Small

CONSENSUS: YES

## Final Output

Everyone (well, the one voice that showed up — Codex and Gemini are still offline) agrees on something that hasn't been said explicitly until now: all the prior phases scoped the *full* MVP (personas, calendar-source screen, rules editor, trim screen, five-state home), but nobody had yet asked "what's the smallest slice of that we build first?" This phase answers that, and it doesn't walk back anything already locked in — it just sequences it.

**The call:** build one hardcoded persona first, no settings UI at all. Grant calendar access → the instant it's granted, show a single opinionated computation (today + next ~week, 9–5 hours, 15-min buffer, 3-hour minimum notice, 30-minute default duration, calendars auto-included except EventKit-flagged birthday/holiday/subscription types) → a day-grouped list of real free slots → tap any slot to deselect it → Share button opens the native share sheet with clean, title-free text. That's the entire first build. No persona editor, no calendar-source picker, no duration/day-range chips, no paywall — because there's only one persona, there's nothing yet to gate.

**Why this cut, specifically:** it's still the emotionally real pitch of the whole app — permission granted → a genuinely good answer appears with zero configuration — just without the infrastructure around it. The named risk of cutting the calendar-source picker is that automatic type-based filtering might not be smart enough for someone's real, messy calendar (a work calendar or shared family calendar that should've been excluded but wasn't) — that's called out as a deliberate bet worth taking, because finding out the default is wrong on slice one is cheaper than finding out after building the whole settings layer around it.

**Must-have interactions:** pre-permission priming screen, automatic computation with zero required input, per-slot deselect, native share sheet, and all four real states on the one home screen (priming, permission-denied with a Settings deep-link — not just an error label, computed/success, and the honest "fully booked" empty state). Loading needs a placeholder, not a blank flash.

**Cut list (deferred, not deleted):** persona editor/multiple personas, calendar-source selection screen, duration/day-range customization, buffer/notice/working-hours tuning UI, the "via Availability Concierge" signature toggle, Shortcuts/widget/Siri, and any paywall/monetization UI.

**Validation criteria:** a real user with a messy real calendar (recurring meetings, an all-day event, a cancelled instance) goes from cold open to a correct, shareable message in under 15 seconds without touching any settings; no slot is ever shown free when it's actually booked; permission-denied and fully-booked are both real, non-crashing, actionable screens; and the sharpest bar — someone who didn't know it was app-generated would accept the output text as a normal, professional reply.

**Still open, worth flagging honestly:** this is one participant's proposal with no second opinion yet (Codex/Gemini both stayed dark again this round). Nothing in the transcript disagrees with it, and it satisfies both required acceptance checks — it's buildable without further product debate, and it's one complete workflow end-to-end — but it hasn't been stress-tested by a dissenting voice.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Only one voice showed up this round again (Codex and Gemini stayed offline), but this time the voice's whole job was to try to break the six-phase streak of harmony — and it did find real gaps, though every gap comes with a concrete resolution attached rather than just a flagged worry. Nothing contradicts it, so I'm calling it converged with those resolutions locked in as decisions, not left open.

**Resolved requirements:**
- Auto-filtering by EventKit calendar `type` (birthday/subscription) is officially named as a **limited heuristic**, not a solved trust problem. It's written down explicitly: this solves the demo case, it does not solve the general noise-calendar problem (a legitimate-looking work or shared-family calendar with the same `type` as a real calendar can't be caught this way). Downstream phases must not describe this as "we filtered out noise calendars" — only as "we filtered the two obvious noise types; general noise-calendar filtering is deferred to the calendar-source picker."
- All-day events: the hard rule is **all-day events on included calendars block the entire day, no exceptions, in this slice** — even though this will sometimes wrongly swallow a day because of a habit-created all-day personal reminder. This is named as a known, accepted limitation of the slice, not a silent gap.
- Recurring events must be resolved using **EventKit's own occurrence enumeration** (`enumerateEvents(matching:using:)` over the full date range), never a hand-rolled RRULE expansion — this is now a hard architecture requirement, because hand-rolling is exactly where a cancelled or moved instance would silently compute wrong.
- "No free slots" is now three distinct states, not two: **fully booked this week**, **too late today given minimum notice** (should read "next available: tomorrow," not blend into the fully-booked message), and **no calendars found on device at all** (different from permission-denied and different from an empty-but-authorized calendar).
- Authorization must be **re-checked on `scenePhase` becoming active**, not just at launch — covers the case of a user revoking Calendar access from Settings while the app is backgrounded.
- Computation is confirmed **always live, always using the device's current timezone/calendar at the moment of computation** — there is no caching of computed slots across sessions in this slice, so DST/travel edge cases are a non-issue as long as that assumption holds; if any caching gets added later, this needs to be revisited.
- Share sheet cancellation must **preserve the user's per-slot deselections** in view state rather than regenerating the slot list from scratch — a small thing, but explicitly named so it doesn't regress silently.
- The privacy invariant (no title/location/notes in the shareable string) is extended to **no event content in any log statement or debug print**, not just the user-facing share text — closing a gap where a `print()` during development could leak sensitive calendar content into a TestFlight console log.

**Edge cases enumerated:** noise calendar not caught by type-based filtering; multi-day all-day events vs. single-day habit all-day reminders; recurring event with cancelled/moved instances; minimum-notice window entirely consumed by time-of-day; permission revoked mid-background-session; zero calendars configured on a fresh device; share sheet cancel-and-return.

**Data and privacy implications:** shareable output type stays start/end/duration-only (already locked); that same restriction now explicitly covers logging and debug output, not just the formatter output.

**Risk register (ranked by likelihood of surfacing in real first use):**
1. Type-based filtering insufficient for a real messy calendar — high likelihood; mitigation: accept as a named v1 limitation, prioritize the calendar-source picker as the very next slice if this surfaces in real use.
2. All-day-event-as-habit-reminder swallowing an otherwise-free day — medium-high likelihood; mitigation: the "always blocks" rule is decided and documented now, not left implicit.
3. Hand-rolled recurrence math producing a false-free or false-busy slot — correctness risk; mitigation: mandate EventKit's own enumeration API, forbid custom RRULE expansion.
4. Permission revoked while backgrounded going undetected — low likelihood, cheap fix; mitigation: re-check authorization on scenePhase change.
5. Fully-booked vs. too-late-today vs. no-calendars-found conflation confusing a real user — medium likelihood; mitigation: three distinct copy states, not two.

**Final assumptions:** no computed-slot caching across sessions in this slice; EventKit's `type` field is the only calendar-noise signal used for MVP auto-filtering, and it's explicitly insufficient for the general case; scenePhase-triggered re-authorization check is in scope for the sliced build, not deferred.

**Still open honestly:** this is one participant stress-testing itself with no second opinion again (Codex/Gemini both dark). Nothing disagrees with the resolutions above, and every edge case raised got a concrete decision rather than staying a question — that satisfies this phase's acceptance bar (no major ambiguity left for design/architecture, risks have named mitigations or are accepted as limitations) — but it's still unverified by a dissenting voice.

## App Features

CONSENSUS: YES

## Final Output

Same pattern as every phase in this project so far — only the one Claude voice showed up (Codex and Gemini stayed dark), but its job this round was straightforward: take everything already locked in detailed_discussion and next_steps_small and turn it into an actual prioritized must/should/could/won't list with acceptance criteria, not just re-argue scope. It did that cleanly and didn't reopen anything already decided.

**Must-haves (each with acceptance criteria a QA pass can actually run):**
1. Pre-permission priming screen — shown once, skipped on all future launches once the user has already decided (granted or denied).
2. Authorization state handling with scenePhase re-check — revoking access while backgrounded must flip the UI to denied within one foreground event, no stale data, no crash.
3. Real "permission denied" screen — explains the value prop, deep-links to Settings, re-checks status on return without a relaunch.
4. Distinct "no calendars on device" state — different copy from both denied and fully-booked, explicitly tested against an empty `calendars(for:)` result.
5. EventKit-native recurrence computation — must be backed by an actual fixture test (recurring event with a cancelled instance + a moved instance) proving the cancelled slot reads free and the moved slot's old/new times resolve correctly. Stated as: not done until a test exists, not just "the code looks right."
6. All-day events block the whole day on included calendars, no exceptions — verified against both single-day and multi-day fixtures, explicitly not a "smarter" partial heuristic.
7. Type-based calendar filtering — birthday/subscription calendars never contribute busy time, and normal calendars are never accidentally caught by the filter.
8. Three-way empty state split (fully booked / too-late-today / no calendars) — each needs its own distinct, testable string/screen.
9. Day-grouped slot list, per-slot deselect, share sheet with a share-formatter input type that structurally has no title/location/notes field (compiler-enforced, not convention-enforced).
10. Share-sheet cancel-and-return preserves deselections (view state, not recomputed from source).
11. Loading skeleton instead of blank-then-populate.
12. No event content (title/location/notes) in any log or print statement — treated as a pre-ship grep check, not a "should."

**Should/could (explicitly not blocking ship):** calendar-source picker, persona editing, duration/day-range chips, buffer/notice/working-hours tuning UI, the shareable signature toggle, richer loading animation, VoiceOver polish beyond baseline (baseline accessibility itself stays a must per the global rules).

**Won't-build:** any calendar writes, multi-user/mutual availability, backend/accounts/live booking, notifications/reminders, widget/Shortcuts/Siri, any paywall/StoreKit code (nothing to gate yet with one hardcoded persona), ICS generation.

**The one thing this phase adds that's worth underlining going into build:** two of the carried-forward "acceptance criteria" (recurrence-with-exceptions correctness, and title-never-leaks) are being upgraded from "principle everyone agreed to" into "must have an actual fixture-based automated test," and ship-readiness should be blocked on those two specifically existing as tests — because they're exactly the failure modes that look fine in a demo and only break against someone's real, messy calendar.

**Still open honestly:** one participant again, no second opinion from Codex/Gemini this round either. Nothing here contradicts prior phases, and both acceptance checks for this phase are met (every must-have ties back to the product promise, and the build phase can complete this exact list without further product debate) — but as with every phase before it, it hasn't been stress-tested by a dissenting voice.
