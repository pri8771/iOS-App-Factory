# multi-app-exp2 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where round two actually landed.

The room converged on the thing that was unresolved after round one: which app to build. Gemini looked hard at its own Scribe/CBT-journal pitch, agreed with Codex and Claude's critique — no real off-the-shelf on-device sentiment model to point at, and a therapeutic-framing liability that would balloon scope — and dropped it. Everyone is now behind Codex's idea: a local-first professional relationship-intelligence app (working name "Nurture") that helps someone remember people, spot relationships going cold, and prep context before reaching out. It's deterministic date/decay/scoring logic, which matters a lot for this group's stated bar, since it means the "real tests on core business logic" requirement is straightforward to actually satisfy rather than aspirational.

On top of the idea, everyone explicitly signed onto the same guardrails: persistence sits behind a protocol with exactly one local concrete implementation for v1 (no speculative sync code), default to zero third-party dependencies unless something clearly earns its keep, the paywall is a real StoreKit 2 implementation exercised via a local StoreKit configuration file (not just a strategy doc), and whatever phase declares this "done" has to state plainly which parts were verified by building/running/testing versus which are documented intent. Claude also added, and Codex and Gemini both took, a rule that the app owns its own local person records and never requires system Contacts access to function — Contacts import is an optional accelerator, so a permission-denied state is a real, testable product state instead of decoration.

One thing does not get to stand as-is: Gemini suggested relocating the actual output directory to a sandbox scratch path instead of the user's explicitly stated `/Users/pchordia/Documents/GitHub`. That's not a matter of group taste to negotiate — the user gave that path twice in the original prompt as a hard requirement, and quietly swapping it is exactly the kind of scope drift this phase exists to prevent. That suggestion is rejected; the contract keeps the original location.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (Build a complete, production-ready iOS app... through "Then build it fully.").

**App selected:** A local-first, native SwiftUI professional relationship-intelligence app (working name "Nurture") — helps a user maintain a durable network by tracking last-contact recency, surfacing relationships going cold, prepping context before outreach, and running a lightweight weekly maintenance ritual. Chosen over a CBT/mood-journal alternative because it's lower-risk to build and verify (deterministic scoring logic, no ML feasibility gap, no therapeutic-claims liability) while satisfying monetization, retention, and differentiation better.

**Hard requirements:**
- Output at `/Users/pchordia/Documents/GitHub/<clean-product-repo-name>` — non-negotiable, per the user's explicit instruction.
- A real, opens-and-builds Xcode project targeting iOS 17+/Swift 5.9+, SwiftUI, native frameworks only.
- Local-first persistence (SwiftData or Core Data) behind a repository/protocol boundary, with exactly one concrete implementation (local) in v1 — no premature sync/conflict-resolution code.
- Default to zero third-party dependencies; add one only if it materially reduces real risk.
- A working local paywall: StoreKit 2 + a local StoreKit configuration file, gating real entitlement logic in code — not a strategy doc.
- Real automated tests (XCTest/Swift Testing) covering actual business logic: persistence round-trips, recency/decay/scoring calculations, and subscription entitlement gating — with an explicit statement later of what's covered and what isn't.
- The app owns its own local contact/person records; system Contacts access is an optional import accelerator, never required to use the app — including a real permission-denied empty state.
- Every core-journey screen has intentional empty, loading, error, and success states.
- All ten requested deliverables exist as separate files in the repo (not folded into one README): Xcode project, source, README, product brief, monetization strategy, architecture notes, QA checklist, App Store readiness notes, setup/run instructions, and a Claude Design prompt for future visual refinement.

**Non-goals:** no multi-app suite, no Android/cross-platform, no real backend/cloud server, no live App Store submission or real StoreKit sandbox transactions, no paid third-party services (analytics/crash/push SaaS), no speculative multi-device sync code, no AI/ML bolted on without a real reason (this app's core mechanics are deterministic and don't require it).

**Production-readiness means:** opens and builds in Xcode against a current SDK without manual fixup; runs in simulator; demonstrates every core workflow end-to-end with real state coverage, not just happy path; data persists across relaunch; paywall is testable locally via StoreKit config; no TODO/placeholder screens on the primary journey. It explicitly does not mean App Store approval, real revenue, a signed distribution build, or live third-party integrations.

**Decision rules for later phases:**
- When effort is constrained, cut breadth before cutting polish on the core ritual — a smaller fully-real app beats a larger stubbed one.
- A feature that doesn't strengthen recurring utility, retention, or subscription credibility is expendable.
- Claims about monetization ("users would pay") and virality must be framed as stated product hypotheses with reasoning, never as verified outcomes or flat assertions.
- Differentiation must show up as user-visible product behavior, not clever copywriting.
- At completion, the final phase must explicitly enumerate, deliverable by deliverable, what is a real working artifact verified by building/running/testing versus what is written intent — this cannot be papered over by confident prose.

## Product Research

Consensus reading, then moving on.

CONSENSUS: YES

## Final Output

**Audience and use context:** Not "anyone with contacts" — specifically busy professionals whose income or opportunities depend on network maintenance: founders, consultants, recruiters, investors, salespeople, business developers, community builders. Usage is bursty and moment-driven, not daily habitual: right after meeting someone (capture while memory is fresh), right before reaching out (need context fast), and a weekly maintenance ritual (the retention engine). Everyone agrees a bursty-then-quiet usage pattern is itself a risk — the app has to have something useful to say in the quiet stretches or it gets forgotten between bursts.

**Comparable apps/patterns:** Dex, Clay, Covve, Cloze, UpHabit, Folk, Monica, and Notion personal-CRM templates already occupy this space — this is a real, funded category (Clay especially), so "personal CRM" alone isn't differentiation. The pattern to borrow: timeline + next-step clarity, calm scanability, fast add, strong empty states — the good parts of Contacts/Reminders/Notes. The pattern to avoid: dense grids, pipeline jargon, deep field entry — becoming a miniature Salesforce for personal life. The group's agreed differentiator is treating relationship warmth as a visibly decaying signal driving the entire core loop (dashboard, notifications, weekly ritual), not a buried sort option — if that mechanic isn't the spine of the product, it's just Dex with nicer fonts.

**Platform-specific opportunities:** Home-screen widget surfacing a small "going cold" queue, local notifications for the weekly review, App Intents/Siri Shortcuts and/or a share-sheet extension for frictionless capture ("logged a note about X") without opening the app, Face ID/passcode gate on launch (justified because the app stores sensitive personal opinions about named real people, not generic notes), fast one-tap logging, haptics on triage actions. Explicitly out: anything scraping calls/messages/email automatically — too fragile and privacy-invasive for v1.

**Major assumptions/risks (at least three, clearly labeled as assumptions):**
1. Assumption: manual logging is the only capture path in a local-first v1 (no email/calendar scraping) — risk that if logging friction is too high, retention collapses; mitigation is one-tap logging plus a share-extension/App-Intent path, not just an in-app form.
2. Assumption: the "intelligence" here is deterministic decay/scoring math, not ML — risk of overpromising smartness the data model can't back up; framing must be "private relationship operating system," not "AI knows your network."
3. Risk: guilt-trip tone. A dashboard that only ever shows who you're neglecting will drive uninstalls, not subscriptions — needs capped queues, humane snooze, a genuine "all caught up" success state, and supportive copy.
4. Risk: cold-start emptiness — a CRM with zero people is worthless, so optional Contacts import is a real onboarding lever, not a checkbox feature, precisely because manual entry alone is too slow to reach a first "aha."
5. Risk: arbitrary paywalls (e.g. gating by contact count) read as cheap and undercut the monetization thesis the contract already commits to — premium should gate ongoing intelligence (weekly digest, batch resurfacing, richer pre-outreach context), not basic tracking.
6. Assumption: virality here is indirect/niche (reputation spillover from being visibly thoughtful) — not literal invite-a-friend sharing; forcing a broad-viral hook would be manufactured and against the group's own anti-novelty rule.

**Implications for the first build:** Home screen is an opinionated action queue (needs attention / new / maintain momentum), not an alphabetical contact list. Person creation under a minute. Detail view leads with context/next-step before raw facts. Weekly ritual is a short, satisfying, completable queue — the core retention mechanic. Decay/scoring logic must be deterministic, transparent to the user (show *why* someone reads as cooling), and built with an injectable clock from day one so the business-logic tests the contract already requires are actually honest. The app's local person store stays fully independent of system Contacts — permission-denied is a normal, well-designed empty state, not a dead end. Every core screen needs its real empty/loading/error/success states worked out now, including the "good" state (nobody's going cold) so the product doesn't read as pure anxiety machinery.

## Portfolio Selection

All three agents converged fully — this is a single-app run, no portfolio split needed.

CONSENSUS: YES

## Final Output

This is a single-app run, not a portfolio. The original prompt asked for exactly one iOS app, and that decision was already locked in two phases ago (the relationship-intelligence app, working name "Nurture"). No `portfolio-json` manifest is required — this phase explicitly records that no split is needed.

**Single-app vs portfolio-parent decision:** Single app. No sibling projects, no portfolio manifest.

**Selected app:**
- **Name/slug:** Nurture (working name) / `nurture-ios`
- **Category:** Professional relationship intelligence (personal CRM / productivity)
- **Promise:** A private, local-first iPhone app that helps busy network-dependent professionals remember people, see which relationships are cooling via deterministic recency-decay scoring, capture context fast after meetings, and run a short, satisfying weekly follow-up ritual.
- **Target user:** Founders, consultants, recruiters, investors, salespeople, and other professionals whose income or opportunities depend on maintaining a warm network.
- **Build flag:** true

**Selection rationale:** Directly inherited from the prompt_contract and product_research phases — Nurture beat the alternative (a CBT/mood-journal app called "Scribe") because it uses deterministic date/decay/scoring logic that's honestly testable, carries no ML-feasibility gap or therapeutic-claims liability, and better satisfies the monetization/retention/differentiation bar. No new alternatives were introduced this phase; nothing else was up for selection.

**Rejected alternatives:** Scribe (CBT mood journal) — already killed in prompt_contract on feasibility and liability grounds. No portfolio split, no second/companion app — the prompt asked for one app, and inventing siblings would violate the "smaller fully-real app beats a larger stubbed one" rule the group already committed to.

**Additional guardrails the group agreed to carry into build:** All supporting capabilities (widget, App Intents, share extension) live as targets inside the single `nurture-ios` Xcode project, not spun out separately. The three core jobs — person/relationship store, decay/scoring engine, weekly ritual UI — must each be built as first-class, fully realized flows rather than one being an afterthought (the weekly ritual specifically needs its own onboarding, empty, and completion states, not just a filtered dashboard view). The domain logic (models, scoring, repository protocol) should live in a separately testable module/framework target so the core-business-logic testing requirement isn't fighting project structure later.

**portfolio-json:** Not applicable — explicitly recording that this is a single-app run and no manifest is required.

## Initial Discussion

All three converge cleanly on the product shape this round — no real fight left, just three complementary layers of detail stacked on the same idea.

Codex nailed down the promise and the emotional bar: Nurture has to feel lighter than the problem it solves — fast capture, transparent scoring, a real "caught up" state — or it degenerates into guilt software nobody reopens. Claude took that and made it mechanically concrete: per-person cadence tiers (Close/Regular/Occasional) instead of one global clock, day-zero anchored at creation so a brand-new contact never reads as already cooling, a capped/ranked weekly ritual queue with an honest "more waiting next week" message instead of dumping everything on the user, and an App Group container decision made now (not discovered later) because the widget/share-extension/App Intents targets need to share the local store with the main app. Claude also flagged that the widget has to show initials/counts by default rather than full names, since a lock-screen widget blasting real names would quietly defeat the Face ID gate everyone already agreed to. Gemini came at it from QA and locked in the testability and durability requirements: injectable date provider for the decay engine (non-negotiable, or the test suite is fake), Face ID with passcode fallback so nobody gets locked out of their own notes, a flat versioned SwiftData schema from day one to avoid migration brittleness, and a StoreKit paywall that's actually gating real feature code against a local config file, not a cosmetic screen.

Nobody's arguing against anybody else here — each round added detail the others hadn't specified rather than contradicting it. The four required outputs (promise, primary user/scenario, core loop, boundaries, success criteria) are all answered, and answered the same way by all three.

CONSENSUS: YES

## Final Output

**Product promise:** Nurture is a private, local-first iPhone app that helps busy, network-dependent professionals capture context on people they meet, see who's genuinely at risk of going cold through transparent, personalized decay scoring (not one global clock), and clear a short, capped weekly ritual that turns that signal into real outreach — without ever requiring system Contacts access.

**Primary user and scenario:** A solo consultant, founder, recruiter, or investor who meets a lot of people and can't reliably hold context across weeks. The two moments that matter most: (1) right after meeting someone — add them and jot a note in under a minute, before the conversation's even fully over; (2) a short Sunday-evening ritual where the app hands over a small, ranked, capped queue of people worth reconnecting with and explains, in plain terms, why each one is there.

**Core loop:** Add or import a person fast (default cadence tier: Regular, changeable later, so capture never gets blocked by a decision) → log a quick note/interaction → each person's "clock" is anchored at creation (never at zero, so a brand-new contact never shows up already cold) and scored as elapsed-time-since-last-touch relative to their personal expected cadence → the weekly ritual surfaces a capped, ranked, explainable queue → user acts per person (log outreach, snooze to a real future date, or archive) → ritual ends in a genuine completion/celebration state, not just an empty list.

**Hard scope boundaries:** No automatic ingestion of calls/messages/email/calendar. No team, multi-user, or social/sharing features. No CRM pipeline jargon, tags-as-taxonomy, or custom field builders. No real backend or push infrastructure — local notifications only. Contacts import stays a strictly optional onboarding accelerator; the app owns its own records and works fully with zero contacts or a denied Contacts permission. No indefinite/permanent snooze that quietly does nothing — a person eventually resurfaces or gets archived, no fake third option. Premium value comes from ongoing intelligence/ritual depth, never from crippling basic tracking or gating by contact count.

**Measurable success criteria (build-time, checkable facts, not business outcomes):**
- Every core screen (onboarding incl. Contacts-denied path, dashboard, person detail/add/log, weekly ritual) demonstrably reaches its empty, loading, error, and success states in the simulator.
- The decay/scoring engine runs on an injectable date provider (no direct `Date()` calls in scoring logic) and has unit tests with fixed clocks proving specific inputs produce specific cadence-tier transitions, including the day-zero-at-creation rule.
- Adding a person and logging a first note takes five taps or fewer / under a minute.
- The weekly ritual is fully completable end-to-end, is capped rather than showing every cooling relationship at once, and ends in a distinct, real completion state.
- Face ID gates the app with a working passcode fallback (LocalAuthentication), so nobody can get locked out of their own data.
- The paywall gates a named recurring-value feature via a real local StoreKit 2 configuration file, not just a described strategy.
- Widget/App Intents/share-extension share the local store via an App Group and default to low-detail display (initials/counts, not full names) to preserve the privacy promise of the Face ID gate.
- Persisted data (SwiftData, flat versioned schema) survives app relaunch in the simulator.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Round two closed out the one real fight from round one. Gemini looked hard at gating Face ID and contact counts behind the paywall, heard Codex and Claude's case that both would break trust exactly when it matters most (right when a user is deciding whether to trust the app with sensitive opinions about real people, and right when they're dumping a dozen new contacts in after a conference), and dropped both gates without reservation — updating the actual product_brief.md file to match, not just the spoken position. Everyone's now aligned on one clean monetization line, and Claude specifically flagged pre-outreach context briefs as the feature that has to earn its keep by doing real synthesis work, not just reformatting notes the free tier already shows — Gemini took that further with a concrete idea (a structured "briefing card" pulling relational anchors like names/facts/open threads out of notes) that stays deterministic, no ML bolted on, consistent with the group's earlier decision to avoid forcing AI in. No open disagreements remain.

**Target user and use case:** Solo consultants, founders, recruiters, investors, and salespeople whose income depends on maintaining a warm professional network but who don't want to live inside a CRM. The two moments that matter: capturing context within a minute of meeting someone, and a short weekly ritual that turns decayed relationships into an actionable, capped follow-up queue.

**Paid value and subscription value — final split:**
- **Free (baseline, not a stripped demo):** unlimited people, unlimited notes, full cadence-tiered decay scoring with a visible per-person "why" explanation, Face ID/passcode gate, and a preview of the weekly ritual (top 3 cooling relationships, with an honest "X more waiting — upgrade to see your full queue" message).
- **Paid (the ongoing intelligence layer):** the complete capped ritual queue, pre-outreach context briefs (the flagship feature — a synthesized "briefing card" extracting relational anchors like names, key facts, and the last open thread from note history, not just a reformatted note scroll), batch resurfacing after a dry spell, custom per-person cadence tuning beyond the three defaults, and relationship-health trend history.
- Face ID and contact volume are explicitly baseline trust/utility, never premium levers — gating either would read as "we don't protect your privacy until you pay" or interrupt the highest-value onboarding moment (dumping in contacts right after an event).

**Core loop:** Add a person in under a minute (default cadence: Regular, no setup tax) → log a quick note → day-zero anchored at creation so new people never read as already cold → home screen shows a ranked, explainable attention queue, not an alphabetical list → weekly ritual surfaces a capped queue → user logs outreach, snoozes to a real date, or archives → ritual ends in a genuine completion state.

**Competitive wedge:** Relationship warmth is the organizing principle of the entire UI, not a buried filter — every important screen answers "who needs me, why, and what's the smallest useful action," with a transparent, visible per-person explanation (e.g., "6 weeks since contact, expected cadence 2 weeks — cooling"). This is what separates Nurture from database-shaped competitors (Dex, Clay, Cloze, Monica) that you have to open and search.

**Viral or niche growth angle:** Reputation spillover, explicitly framed as a stated hypothesis, not a verified acquisition channel — a user who shows up unusually well-prepared and follows through consistently gets asked what tool they use. No invite mechanic, no social graph; those would be manufactured for a private single-player tool.

**Local-first and cloud-ready plan:** One local SwiftData implementation behind a `RelationshipRepository` protocol boundary — zero sync/conflict-resolution code this pass. App Group shares the local store across the main app, widget, App Intents, and share extension; passive surfaces (widget) default to counts/initials, never full names, to preserve the Face ID privacy promise. The protocol seam is the entire cloud-readiness story; nothing further gets built now.

**The real reason this app deserves to exist:** Notes and Reminders don't score anything, Contacts doesn't know what "cold" means, and existing personal-CRM competitors are database-shaped tools you have to go open and search. Nurture is the only one putting "who needs me this week and why" on the home screen as a computed, transparent, per-person signal — and it monetizes by doing that computation and weekly synthesis well, not by gating storage or safety.

## Next Steps Small

CONSENSUS: YES

## Final Output

Everyone landed in the same place by the end of round two. The one real fight — whether the flagship "briefing card" (the synthesized pre-outreach summary) belongs in the very first proving slice — got resolved with Claude conceding the point after Codex reframed the question: this slice exists to answer "does the core warm→cooling→ritual→relief loop feel meaningfully better than Contacts+Notes," not "can we build a premium feature." Cramming in the briefing card would have muddied that experiment (if it flopped, nobody would know whether to blame the loop or the card). So the card is out of slice one entirely — not stubbed, not faked — but its data shape gets seeded now: the note-logging flow gets two optional fields ("key fact" and "open loop") behind a disclosure chip, so slice two has real structured data to build the card from later, without adding friction to the five-taps-or-fewer capture flow.

In exchange, the group agreed to pour the effort that would've gone to the card into making the plain mechanics unusually sharp: the per-person "why now" explanation should read like the app understands the relationship (referencing the actual last note, not just a raw day-count), and the ritual completion screen should name what actually happened in that session, not generic "you're all caught up" copy. Gemini's idea of a hidden debug time-travel panel (built on a swappable `DateProvider` protocol) was adopted by all three as load-bearing, not a nicety — it's the only realistic way to QA decay transitions and paywall gating without waiting for real time to pass. Gemini also flagged a practical build detail everyone accepted: Face ID needs to be toggleable/gracefully handled in the simulator so it doesn't block day-to-day development.

**MVP slice:** Main app target only (no widget, share extension, or App Intents UI this pass — architecture stays extension-ready via App Group container, but nothing beyond that gets built now). It includes: onboarding with a real Contacts-denied branch and Face ID/passcode setup; manual add-person under a minute with a default "Regular" cadence; a note-logging flow with a required freeform note plus an optional "+ add a detail" disclosure revealing "key fact" and "open loop" fields; a home dashboard as a ranked, explainable attention queue (not an alphabetical list); a weekly ritual screen with a capped queue and exactly three actions per person (log outreach / snooze to a date / archive), ending in a crafted, specific completion state; SwiftData persistence behind the `RelationshipRepository` protocol; an injectable `DateProvider` powering the scoring engine, paired with a DEBUG-only panel to jump the clock forward by day/week/month; and a local StoreKit 2 paywall gating exactly one thing — the full ritual queue beyond a free top-3 preview.

**Must-have interactions:** Add a person and log a first note in under a minute / five taps or fewer. Tap into a person and see a plain-language "why now" explanation tied to their actual last note, not a bare day-count. Open the ritual, take at least one action, and reach a completion screen that reflects the specific actions taken that session. Use the debug panel to jump time forward and watch warmth scores and the ritual queue update correctly. Hit the paywall specifically when trying to see past the top-3 free ritual preview. Relaunch the app and confirm all data (people, notes, ritual state) persisted.

**Cut list:** Contacts import/CNContactStore picker, home-screen widget, share extension, App Intents, custom per-person cadence editing beyond the three default tiers, relationship-health trend history, batch resurfacing, and — the one item that took real debate to settle — the user-facing pre-outreach briefing card. Its underlying optional data fields are seeded now; the synthesized card UI itself is explicitly slice two.

**Validation criteria:** A fresh install can go fully offline from zero to one archived-or-snoozed person through a completed ritual. Scoring engine unit tests use the injectable clock to prove specific fixed-date inputs produce specific cadence-tier transitions, including day-zero-anchored-at-creation. The debug time-travel panel correctly forces warmth-state and ritual-queue changes. The local StoreKit configuration actually gates and unlocks the full ritual queue (not just displaying a price). Face ID/passcode works with a simulator-friendly toggle so it doesn't block development. Data survives a simulator relaunch. Someone unfamiliar with the project can go from launch to a logged note on a new person in under sixty seconds unassisted.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Round two closed out everything that was still open. Claude gave up the 0.75 early-warning band once Codex pointed out the math — for an Occasional relationship that's flagging someone 45 days before anything's actually wrong, which is the guilt-machine failure mode the whole product exists to avoid. Everyone locked onto Codex's cleaner formula instead. Contacts permission got resolved the same way: Claude actually went back and found that the earlier phase's own output was self-contradictory (it demanded a "real Contacts-denied branch" while also cutting Contacts import from the same slice — you can't have a real denial screen for a permission you never had a reason to request), so Codex's call to drop the Contacts prompt entirely isn't a scope override, it's a bug fix in a prior decision. Face ID's DEBUG-only carve-out, the export/delete re-auth requirements, and the snooze-doesn't-reset-the-clock rule all landed the same way across all three without anyone pushing back.

**Resolved requirements:**
- **Decay math, final:** cadences fixed at Close = 14 days, Regular = 42 days, Occasional = 180 days. Ratio = elapsed time since `max(createdAt, lastInteractionAt)` divided by cadence, recomputed live on every read from the injectable `DateProvider` — never cached or persisted as a stored field. States: **warm** (ratio < 1.0), **cooling** (1.0 ≤ ratio < 1.5), **cold** (ratio ≥ 1.5) — boundaries are inclusive on the lower state exactly as stated. Ritual queue includes everyone at ratio ≥ 1.0, sorted descending by ratio, hard-capped at 10; free tier sees the top 3 only when the full queue actually exceeds 3.
- **Contacts, corrected:** no `CNContactStore` usage, no permission prompt, and no Contacts entry in `Info.plist` anywhere in this slice. Onboarding states plainly that Nurture works fully without Contacts and routes straight to manual add. A real permission-denied branch becomes relevant only once import ships in a later slice — this is recorded as a correction to `next_steps_small`'s internally-inconsistent requirement, not a silent scope drop.
- **Face ID, final:** on by default in the shipped app, requested during onboarding, using `deviceOwnerAuthentication` (biometric with automatic passcode fallback). Relocks on cold launch and after a short background grace window (~2 minutes), not on every scene-phase transition. If a device has neither biometrics nor a passcode enrolled, the app runs unlocked with a persistent, dismissible warning rather than blocking access. The dev-convenience disable toggle and the debug time-travel panel are both wrapped in `#if DEBUG` at the view level (compiled out of Release entirely, not just defaulted off), with an explicit QA checklist line item to verify neither exists in a Release archive.
- **Person lifecycle, final:** three distinct actions — snooze (hides until a real, validated future date; does not reset the clock, so a person can resurface already cooling/cold, by design), archive (stops active tracking, keeps history, can be reversed), and a new fourth action, permanent delete (irreversible, requires a fresh biometric/passcode challenge immediately before executing, confirmed via a destructive-styled "Delete Permanently" action rather than a generic OK dialog).
- **Local export, newly in scope:** a minimal manual JSON export from Settings via `fileExporter`/`ShareLink`, gated by a fresh LocalAuthentication challenge immediately before export (not reliant on the current session's unlock state), with an explicit on-screen warning that the exported file is unencrypted and no longer protected by the app's Face ID gate once it leaves the sandbox.
- **Architecture, final:** SwiftData repository runs on the main actor (acceptable at this app's realistic scale); App Group container is the default persistence location with automatic fallback to the standard Application Support directory when the App Group entitlement can't be resolved, so the project builds without a paid developer account.
- **Restore Purchases / entitlements:** must check live via `Transaction.currentEntitlements`, not a cached boolean, with a real "Restore Purchases" affordance so reinstall-and-restore doesn't silently break the paywall.

**Edge cases enumerated:** zero-people empty state; single-person-never-logged-again state; queue overflow beyond the cap of 10 (never dump the full list, always show a "N more waiting" message); paywall never appears unless the free preview is genuinely truncated (no ambush for 1-2 due items); snoozed person reappearing already deep in cooling/cold once the date passes; archived person never silently resurfacing; app termination mid-ritual (progress must survive relaunch); DST/timezone shifts must recompute via `Calendar`-based day counting, not raw `TimeInterval`, to avoid off-by-one cadence bugs; duplicate-name warning (lightweight, not a full dedupe system) on new-person creation; snooze date validation (no past dates, no absurd far-future dates functioning as a fake permanent mute); notification permission denial falls back to in-app badges/banners rather than depending on push; devices with no enrolled passcode/biometrics get unlocked-with-warning rather than a hard lock.

**Data and privacy implications:** no network dependency, no analytics SDKs, no remote note processing anywhere in v1. No lock-screen/passive-surface display of full names (carried forward from earlier phases for future widget work). Local export is the one deliberate hole in the "sensitive data never leaves the sandbox unprotected" promise, and it's mitigated with re-auth-at-the-moment-of-export plus an explicit warning rather than silently allowed. Same fresh-re-auth requirement applies to permanent delete, for friction/intentionality reasons rather than privacy ones. No backup/sync beyond normal device-level iOS behavior — losing the phone without an export means losing the data, and that limitation is disclosed rather than hidden.

**Risk register:**
- Guilt-spiral dashboard → mitigated by hard queue cap, supportive copy, snooze/archive escape valves, and a real completion state (locked in prior phases, reaffirmed here with exact numbers).
- Trust collapse from inconsistent privacy posture → mitigated by baseline (not paywalled, not defaulted-off) Face ID with passcode fallback, no unnecessary permission requests, local-first-only data flow.
- Retention collapse from slow first value → mitigated by no Contacts-permission detour, manual add + first note under a minute as the only onboarding path.
- Arbitrary-feeling paywall → mitigated by gating only ritual-queue depth beyond a genuinely-exceeded top-3 preview, never storage or safety.
- State-transition bugs (snooze/archive/relaunch/DST) → mitigated by deterministic, derived-at-read-time scoring and explicit test coverage per transition, calendar-based date math.
- Data loss with no recovery path → mitigated (not eliminated) by adding minimal authenticated local JSON export; residual risk (no restore/import, no sync) is accepted and disclosed rather than solved this pass.
- Optimization temptation to cache warmth as a stored field → explicitly flagged and rejected in advance: warmth/ratio/state must remain derived at read time only, or the debug time-travel panel becomes dishonest.

**Final assumptions:** one device, no sync/cloud/backup beyond the new manual export; one local SwiftData implementation behind the repository protocol; zero Contacts permission requests or CNContactStore usage this slice; no automatic ingestion from email/messages/calendar; no cached/persisted warmth scores anywhere; accessibility (VoiceOver labels on warmth explanations, Dynamic Type support) treated as in-scope per the global rules even though no earlier phase named it explicitly; if effort runs tight, cut breadth before cutting capture speed, explanation quality, ritual flow, completion-state craft, or any of the trust mechanics (Face ID, export, permanent delete) locked in this phase.

## App Features

Looking at how this round played out: Codex and Claude both came down hard on Gemini's round-1 should/could list, arguing Contacts import, widget, custom cadences, and batch resurfacing aren't "maybe if there's time" items — they're invasive scope reopenings that the group already spent two prior phases explicitly closing off, each carrying hidden test/build surface (CNContactStore auth states, App Group lock-screen privacy review) that isn't budgeted for. Gemini's round-2 response accepted this and reported updating the actual `app_features.md` file to move contacts/widgets/App Intents/briefing-card explicitly to won't-build, matching Codex and Claude's position without pushback.

On accessibility, all three landed on the same resolution: not a standalone should-have bullet, but a named, testable bar folded into each must-have's acceptance criteria — Claude even nailed down four concrete checks (combined VoiceOver element for the "why now" sentence, "3 of 7"-style progress value on the ritual screen, one announced completion summary, and Dynamic Type legibility at accessibility-XXL for lock/warning states), and Codex signed onto exactly that shape rather than a separate feature line.

The must-have spine itself was never really in dispute — onboarding with no Contacts prompt, fast capture under 5 taps, the explainable warmth dashboard, the capped weekly ritual with its three exits, person lifecycle (archive/delete), local export, StoreKit gating, and the DateProvider/debug panel all showed up basically identically across all three agents from round one onward. Claude also pinned down two boundary details worth holding onto explicitly: the paywall teaser threshold (exactly 3 qualifying = no teaser, exactly 4 = "1 more waiting") and a capped, four-scenario acceptance test for export/delete (success and cancel-leaves-nothing-changed for each) so those trust features don't quietly balloon into an open-ended test matrix.

One loose thread: Gemini's round-2 message summarized the file update rather than pasting the actual won't-build list and acceptance-criteria text in full, so it's not 100% visually confirmed that custom cadences and batch resurfacing (as opposed to just contacts/widgets/App Intents/briefing card) are explicitly named in the written won't-build list — but nothing in Gemini's response defends keeping them, and they were already locked out in earlier phases, so I'm reading this as accepted rather than a live disagreement.

CONSENSUS: YES

## Final Output

**Must-have features (each carries a user story + acceptance criteria, restated below in checkable form):**

1. **Onboarding & trust setup** — no Contacts prompt anywhere; app states plainly it works fully without Contacts; Face ID/passcode offered on first run, defaults on when available; devices with neither get unlocked-with-persistent-warning, never a dead end.
2. **Fast manual person creation + first note** — person + first note in 5 taps or fewer; default cadence Regular; lightweight non-blocking duplicate-name warning; optional "key fact"/"open loop" fields behind a disclosure chip, skippable entirely.
3. **Deterministic warmth + "why now" explanation** — live-computed from the locked 14/42/180-day cadences and injected clock; warm/cooling/cold boundaries exactly match ratio rules (cooling at ratio ≥ 1.0, cold at ratio ≥ 1.5); explanation sentence references actual last-note content/timestamp, not a bare day count; exposed as one combined VoiceOver element per person.
4. **Dashboard as ranked action queue** — sorted by ratio descending; distinct zero-people, nobody-cooling ("in good shape"), and active-queue states; paywall teaser only appears once qualifying count exceeds 3 (exactly 3 = no teaser, exactly 4 = "1 more waiting").
5. **Weekly ritual as its own session flow** — capped at 10, "N more waiting" message beyond the cap; exactly three actions (log outreach / snooze to a validated future date / archive); snooze hides without resetting the clock; completion screen names the specific actions taken that session; progress and completion state survive app termination/relaunch; ritual progress exposed as an accessible "3 of 7"-style value, completion summary as one announced element.
6. **Person detail & lifecycle actions** — chronological notes plus live warmth explanation; archive (reversible, hidden from active queries, history retained); permanent delete (irreversible, fresh biometric/passcode challenge immediately before executing, destructive-styled confirmation) — tested via exactly two scenarios: successful re-auth deletes and is gone on relaunch; cancelled/failed re-auth leaves everything untouched on relaunch.
7. **Real StoreKit 2 paywall** — live entitlement check via `Transaction.currentEntitlements` (never cached); gates only the full ritual queue beyond the free top-3; working Restore Purchases; never gates privacy, storage, or basic scoring.
8. **Local persistence, export, and release-safe debug tooling** — SwiftData behind the repository protocol persists across relaunch (people, notes, snooze/archive state, entitlement UI); JSON export via Settings requires a fresh auth challenge regardless of session state, shows an unencrypted-file warning, produces no file on cancel — tested via exactly two scenarios mirroring delete; App Group storage falls back cleanly to Application Support; debug time-travel panel and Face-ID-disable toggle both wrapped in `#if DEBUG`, verified absent from a Release archive.
9. **Accessibility as a cross-cutting bar on every must-have above** — not a separate feature, but a named, testable acceptance condition per screen (combined accessibility elements, exposed progress values, single announced summaries, Dynamic Type legibility at XXL on trust/lock screens).

**Should-have:** local weekly reminder notification requesting permission only once there's real value to notify about, with in-app badge/banner fallback on denial; a settings surface clearly showing privacy posture, export risk, and subscription status.

**Could-have:** small ritual polish (haptics, progress phrasing, stronger empty/success illustration) — cut immediately if it competes with core-loop build time or quality.

**Won't-build this slice:** Contacts import / any `CNContactStore` usage or Info.plist Contacts entry; home-screen widget; share extension; App Intents UI; the synthesized pre-outreach briefing card UI (its data fields are already seeded, per earlier phases); custom per-person cadence editing beyond the three fixed tiers; relationship-health trend history; batch resurfacing; search/filtering on the people list (a search-first surface is a different app than one built on computed attention); any email/message/calendar/call scraping; cloud sync, accounts, or collaboration features; any analytics/crash-reporting/marketing SDK.

**Design discipline carried forward:** the dashboard (orientation: who needs me, why) and the weekly ritual (bounded action session with a real finish line) must stay two distinct screens with distinct roles — blurring them turns the product back into a generic list app, which is the single biggest risk to the whole concept surviving contact with build.
