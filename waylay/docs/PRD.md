# waylay — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both Codex and Claude ended up in the same place — they're not arguing with each other, just sharpening different corners of the same contract. Gemini never weighed in (CLI unavailable), so this is a two-voice convergence, but a clean one.

Where they agree: this phase's job is narrow — take the already-selected Waylay spec from written idea to a production-ready **local-first SwiftUI MVP**, not to re-run app ideation or spin up a second app. The one thing the whole product stands or falls on is the loop itself: sub-3-second capture → trustworthy, well-timed proactive resurfacing when physically near a place. Everything else (library browsing, snooze/dismiss/visited, widgets, paywall, restore, App Intents) supports that loop or it doesn't belong. Region rotation across the 20-region iOS cap is treated as core architecture, not a footnote, and notification quality/timing needs actual decision rules (suppression windows, rate limits, no re-notifying dismissed/snoozed places) rather than being left as a vibe. Non-goals are explicit and shared: no CloudKit sync, no collaborative lists, no OCR unless it's frictionless, no backend, no scope creep into "the two-app portfolio" machinery (idea generation, second app, Jira/Notion, combined transcripts) — that's parent-portfolio-level work, not this conversation's job unless told otherwise. Production-ready means it runs on a real device, has real persistence, real StoreKit paywall/restore, graceful permission-denied states, and all four UI states where relevant — not just a demo of each screen.

Claude's round added two things Codex hadn't spelled out but didn't contradict: (1) an explicit resolution of the "MVP" vs "production-ready" tension in the spec — the *scope* stays exactly what's listed in the app spec, while the *quality bar* is full production polish on that narrow scope; and (2) concrete, testable success criteria for the two riskiest claims (rotation logic needs an inspectable decision log; sub-3-second capture needs a hard operational definition, not a feeling). Nobody's pushing back on those additions — they read as refinements, not disagreement.

No open fight to resolve. The main "conflict" (parent prompt's 2-app/Jira/Notion apparatus vs. this single-app child scope) was named and resolved the same way by both: app-spec scope wins for what gets built, parent prompt sets the quality bar and stays out of feature scope.

CONSENSUS: YES

## Final Output

**Original prompt**: preserved verbatim above (Waylay app spec + parent portfolio prompt), unchanged.

**Hard requirements**: Working local-first SwiftUI MVP on real iPhone hardware. Core loop must exist end-to-end: sub-3-second capture (share sheet, camera, manual pin — no required typing/category/geocoding wait), CoreLocation region monitoring with priority-based rotation across the real 20-region cap (with an inspectable/loggable "why is this place monitored right now" answer), local persistent store surviving relaunch/restart, place library browser, proactive resurfacing notifications, snooze/dismiss/mark-visited. Free tier enforces a real cap (~8 monitored places); Pro tier ($3.99/mo or $24.99/yr) unlocks unlimited places + smart rotation + photo/voice notes + widgets, with real StoreKit paywall and working restore-purchases. Widgets, share sheet extension, and App Intents/Siri shortcuts are in v1 unless a later phase explicitly records a justified cut. Permissions (location, notifications) must degrade gracefully, never dead-end. Empty/loading/success/error states required wherever reachable. Accessibility, privacy strings, persistence, and tests (persistence, rotation/prioritization, subscription gating) are product requirements, not polish.

**Non-goals**: No CloudKit/multi-device sync, no collaborative/shared lists, no backend service, no on-device OCR/Vision unless it stays frictionless (cut instantly if it adds friction), no forced LLM/AR/ML bonus features, no re-running app ideation, no building a second app, no Jira/Notion/combined-transcript portfolio bookkeeping in this conversation — that belongs to the parent portfolio orchestrator. No feature that competes with capture speed or resurfacing trust survives.

**Production-readiness definition**: Installs and runs on a real iPhone (not simulator-only). Core workflows work end-to-end with persistent data across relaunch/restart. Permission grant/deny flows are intelligible and recoverable. All reachable UI states exist. Notification content is timely, actionable, and rate-limited/de-duped by explicit rules (no re-nagging snoozed/dismissed places, no spam). Region rotation behaves predictably and is verifiable/loggable under the cap. Free-tier cap and paywall/restore are functionally real, not UI mockups. Tests cover persistence, rotation logic, and subscription gating. Known limitations may remain but must be named and verified, not accidental.

**Decision rules for later phases**: Priority order when tradeoffs arise — (1) capture speed, (2) resurfacing trustworthiness/non-spamminess, (3) warmth/premium feel. Anything that slows capture, makes resurfacing noisier/less trustworthy, or makes the app feel like a list/task manager gets rejected. Scope for *what gets built* is governed by the app spec's own "Local-First MVP Scope" / "v1 Build Scope" sections; the parent portfolio prompt governs *quality bar* (premium, production-grade execution) but does not expand feature scope. Any deviation from this (scope expansion, cut features, added dependencies) must be named explicitly as a deviation, not folded in silently.

## Product Research

CONSENSUS: YES

Both Codex and Claude read this the same way even though they emphasized different pieces — Codex focused on the emotional/design shape (ambient, save-first-explain-later), Claude focused on the failure-mode/QA shape (why existing tools already fail, what breaks in practice). Nothing either of them said contradicts the other; it reads as one converged picture, still just missing Gemini's voice.

## Final Output

**Audience and use context (assumption, no external research done):** Not power users looking for a system — people mid-walk, mid-conversation, or mid-scroll with a few seconds of attention before a recommendation evaporates. Likely skews toward people with active social/exploratory lives in a place they move through repeatedly (locals with routines, foodies, new-city transplants, people whose friends talk about places a lot) rather than one-off destination tourists, since recurring proximity is what makes resurfacing valuable at all.

**Comparable apps/patterns:** Apple Reminders' location triggers, Apple Maps/Google Maps saved lists, Google Keep location reminders, retail/beacon geofencing apps. The instructive part isn't their feature sets — it's that they already technically do this and are barely used for it. The failure isn't "no such feature exists," it's friction on capture and total silence on resurfacing (nobody reopens the saved list). That reframes the competitive opening: the app doesn't need to out-feature these, it needs to be the first one that's actually trusted to resurface things unprompted. Engineering effort should follow that — spend it on capture latency and resurfacing correctness, not on library/browse polish, since a browsable list that never proactively resurfaces is just a worse Google Maps saved list.

**Platform-specific opportunities:** Share sheet capture is probably the single highest-leverage surface, since real "someone recommended a place" moments usually arrive as a text, an Instagram post, or a shared Maps link — capturing straight from the share sheet without opening the app is what makes "sub-3-second" real rather than theoretical. Widgets matter less for capture and more for ambient trust (a glanceable "3 places nearby" turns the app into something you don't have to remember exists). Notifications should be treated as a first-class product surface — copy, timing, and actions are the feature, not plumbing. App Intents/Siri is real but secondary; treat it as negotiable scope, not a checkbox, if it starts eating time that should go to rotation/notification reliability. Monitoring status should be visibly legible to the user (a plain-English "why is this being watched right now" per place) — that transparency is UX, not debug tooling.

**Major assumptions and risks:**
1. (Assumption) Early audience is repeat-movement urban/suburban users, not travelers — drives why proximity resurfacing has recurring value.
2. (Risk) CoreLocation region monitoring is materially less reliable in practice than a first build tends to assume — delayed entry/exit events, throttling under low-power/motion state, and monitoring silently stopping if the user force-quits the app. Without an inspectable decision log / debug view distinguishing "correctly rotated out" vs. "iOS just didn't deliver the event" vs. "user force-quit," every bug report looks identical and the core promise can't be validated.
3. (Risk) The free (~8 places) cap and the real 20-region system cap create a three-way relationship (saved vs. monitored vs. system limit) that needs one simple, user-statable mental model before UI gets built, or users will be baffled about why a saved place isn't notifying them.
4. (Risk) This can't be meaningfully validated in the Simulator — needs real-device walking tests or deliberate GPX/location simulation as part of build verification, not just unit tests on the sort/priority logic in isolation.
5. (Risk) Capture speed dies by a thousand reasonable-sounding cuts — naming before save, waiting on reverse geocoding, forced categorization, photo cropping. Any of these turns the loop into ceremony.
6. (Risk) "Nearby" is emotionally sensitive — a notification that fires across the street can feel magical, one that fires 35mph past the place or after the user already left feels broken; timing/geofence radius tuning is a trust mechanism, not a technical afterthought.

**Implications for the first build:** Keep v1 narrow and deep on one loop rather than broad. Home surface should foreground capture + current watch status over a traditional list-home. Manual pin + share sheet are the must-have capture paths; camera/photo capture is the first thing to slip if time is tight (extra permission + UI step). Every place needs a compact, visible state model (active / queued / snoozed / visited / dismissed) with a plain-English reason. Rotation needs a debuggable "why is this monitored right now" log as a v1 requirement, not a stretch goal — there's no way to tell a real product bug from an iOS platform limitation without it. Notifications need explicit suppression rules (no re-notify within a cooldown after dismiss/snooze, some daily cap) decided now so design and QA have something concrete to build and test against. Widgets and App Intents are real v1 scope per the prompt contract, but if time runs short, they're the pieces to trim before touching capture speed or notification reliability — those two are non-negotiable per the phase priority order already set.

## Portfolio Selection

CONSENSUS: YES

Both Codex and Claude landed in exactly the same place, no daylight between them. This is a child-project run, not a portfolio-parent decision point — the "build 2 apps" instruction was already executed one level up in `multi-app-exp3`, and this conversation was handed exactly one already-selected app (`waylay`) to carry to production. Neither participant sees any work for this phase to do in terms of generating alternatives, splitting into siblings, or emitting a portfolio manifest — that would just be redoing (or second-guessing) a decision the parent orchestrator already made. Codex framed it from the "don't create fake work" angle, Claude framed it from the "don't let this room feel obligated to invent a missing second app" angle — same conclusion, no tension between them.

Where Claude went further, and Codex didn't push back on it, was stress-testing whether waylay is a coherent single product decision rather than rubber-stamping it: reaffirming that manual-pin + share-sheet capture is the actual product and everything else (library, widgets, Siri) serves it, and flagging a tension for later design phases to respect — "warm and tactile" cannot cost capture-path milliseconds, and "kept it simple" cannot become an excuse to soft-pedal the free-tier cap or restore flow, both of which are named v1 requirements, not optional garnish.

No open disagreement to carry into a round 2. Gemini didn't weigh in again (CLI unavailable), same as prior phases, but the two-voice convergence is clean and consistent with how earlier phases were also resolved.

## Final Output

**Single-app vs portfolio-parent decision:** Single-app child project. This is not a portfolio-parent phase — the two-app split described in the parent prompt was already resolved upstream in `multi-app-exp3` before this conversation began. No portfolio-json manifest is produced here, and none is needed.

**Selected app list:**
- **waylay** — category: personal utility / location-based recall — promise: tap once when something catches your eye out in the world, and get reminded the next time you're actually near it — target user: everyday iPhone users who get real-world recommendations and lose track of them because saving something doesn't equal remembering it at the moment it matters — **build: true**

**Selection rationale and rejected alternatives:** No alternatives were generated or rejected in this phase — there was nothing to select between. The app arrived pre-selected via `Selected app slug: waylay` with a fully-formed spec attached; this phase's job was solely to confirm scope (one app, standalone child project) and sanity-check that the spec represents one coherent product rather than something needing a split. It does: one loop (capture → resurface), one target user held constant throughout prior phases, no internal category collision to resolve.

**Rejected-alternatives note:** None applicable — this child branch was never a multi-idea generation step.

**No portfolio-json emitted** — not a portfolio-parent prompt.

Waylay proceeds as the sole child project for this branch, to be built out as its own independent folder, with `build: true`, per the prompt_contract and product_research decisions already locked in from earlier phases.

## Initial Discussion

CONSENSUS: YES

Codex and Claude aren't arguing here — Codex laid out the product framing (promise, user, loop, scope boundaries, success metrics) and Claude's design-lead pass took that same framing and pushed it one level deeper into the actual state-machine mechanics, without contradicting anything. Where Codex said "the state model has to be legible or the app feels random," Claude answered the "so what does that actually mean" question: dismissed is terminal, snoozed is temporary and time-boxed, and manually-marking-visited counts as a win even with no notification ever fired. Nobody pushed back on any of that — it reads as the natural next layer of the same idea, not a fork. Both also independently landed on the same guardrail: the library screen is a secondary management surface, never a discovery/social/map-replacement feature, and both flagged the same self-risk — that "keep it simple" could quietly become an excuse to skip required boring stuff (widgets, restore flow, paywall enforcement). Gemini still hasn't been able to weigh in (CLI unavailable), so this is again a clean two-voice convergence rather than a three-way one.

## Final Output

**One-sentence product promise:** Save a real-world place in under three seconds from wherever you are, and get told, once, when you're actually near it again — nothing more.

**Primary user and scenario:** An everyday iPhone user out moving through their life — mid-conversation, mid-walk, mid-scroll — who has about three seconds of intent before a recommendation evaporates ("you have to try this place," a shop with a line out front, a Maps link in a text). This is not someone sitting down to organize a system; the app has to beat "doing nothing," not out-feature productivity tools. Managing/browsing saved places is a real but secondary scenario — low-stakes and reachable, never the default home surface.

**Core loop:** Notice something → capture it instantly (no required typing, category, or wait) → the app silently decides whether it's worth actively watching right now → it resurfaces with one timely notification when proximity and timing make it worth it → the user snoozes, dismisses, or marks it visited, and the system adapts. Every place moves through a small, explicit lifecycle: new → active-monitored → resurfaced → snoozed / dismissed / visited. Dismissed is terminal (place is effectively archived unless manually reactivated from the library). Snoozed is temporary and time-boxed — it re-enters rotation eligibility only after the snooze window elapses, not immediately. Marking a place visited manually (the user beat the app to it, no notification ever fired) still counts as a completed loop, not a dropped one. Anything that doesn't move a place through this loop, or doesn't make that movement legible to the user, is secondary at best.

**Hard scope boundaries:** v1 is a place-memory engine, not a discovery product, not a general reminder system, and the library is a management surface, not a discovery surface. Explicitly out: reviews, social features, collaborative/shared lists, trip planning, user-maintained folders/tags, cloud dependency, any map view with search/filter/sort/"places near you," any enrichment step that slows or blocks capture. Widgets, share-sheet capture, restore flow, and free-tier cap enforcement are named v1 requirements, not optional garnish — "simpler product scope" must not be used as cover to under-build or skip any of them.

**Measurable success criteria:**
1. Capture: a new place can be saved (app or share-sheet) with no required typing and no required post-save setup, persisted locally in under 3 seconds on a real device, with at most one confirmation tap.
2. Legibility: for any saved place at any time, the app can state in one short user-visible phrase why it is or isn't currently being monitored — this is a UI requirement, not a debug feature.
3. Trust: a dismissed or snoozed place is never re-notified about within its cooldown/snooze window — zero tolerance, not best-effort.
4. Comprehensibility: a first-time user can explain the app, the free-vs-Pro boundary, and which places are currently being watched, each in one sentence, after seeing the UI once — no help text required.

**Acceptance check:** A developer can explain this app in one sentence (capture instantly, resurface once when nearby). The scope is buildable in one pass — it's deliberately narrow (one loop, one state machine, a library that's intentionally boring). Out-of-scope items are named explicitly above, not left implicit.

## Per App Product Brief

Both Codex and Claude are telling the same story from different angles here — Codex framed it as design/systems philosophy, Claude turned the same ideas into hard numbers and test criteria. Nowhere do they actually disagree; Claude's pass reads like the operational spec for what Codex described.

Here's where they've landed: Waylay is for someone who has about three seconds of attention when a place recommendation flies by (a friend's comment, a shared link, a storefront in passing) and currently has nowhere to put that intent that will ever come back to them. The whole product is judged on whether it protects that one moment — capture in under three seconds with zero required typing, then exactly one well-timed notification later when they're actually near the place again.

Paid value isn't "more storage" — it's rotation intelligence. Free gives you ~8 actively monitored places; Pro ($3.99/mo or $24.99/yr) removes that ceiling up to the real 20-region iOS cap and adds the smart engine that decides which of your 60 saved places deserve one of those precious 20 system slots, plus photo/voice capture and widgets as secondary sweeteners. Both agree the free tier has to be tuned so people genuinely feel the ceiling within their first month, not day one and not never.

Core loop, now with actual mechanics attached: capture → local persist (no network blocking) → rotation engine assigns active/queued state with a plain-English reason attached to every place, no exceptions → one notification per place per "episode" → snooze (time-boxed), dismiss (permanent, no auto-return), or visited (a win whether or not a notification fired). Claude pushed this further than Codex did explicitly: a debug/diagnostic view showing "is place X monitored right now, and why not if not" is a hard requirement, not polish — because CoreLocation's own unreliability means without it, every "it didn't notify me" bug report is unfalsifiable. Codex didn't push back on that; it's consistent with what product_research already flagged.

Competitive wedge: existing tools (Reminders, Maps saved lists) already technically do this and nobody uses them for it — so the wedge isn't a missing feature, it's refusing to be a browsable list at all. No map view, no search, no filters as the home surface. Growth is niche and organic — the share sheet doubles as the acquisition path (someone shares a Maps link instead of just bookmarking it), and the real marketing moment is the notification itself firing at the right place and time, prompting an "whoa, this app just reminded me" reaction. No referral mechanic, deliberately.

Local-first: everything (capture, state machine, rotation, notification scheduling) works fully offline with local persistence as the source of truth. Cloud path is CloudKit added later purely as a sync layer — the one thing this phase locks in now is that place records need stable IDs and conflict-resolvable fields from day one, so a future sync layer doesn't require a schema rewrite.

Closing risk-framing, which both are aligned on: trust is the entire retention mechanism, there's no other engagement loop, and a false-positive or badly-timed notification in week one is nearly unrecoverable — so rotation/cooldown tuning should default conservative (fewer, higher-confidence nudges) rather than generous.

Gemini still hasn't been able to weigh in (CLI unavailable, consistent with every prior phase), so this is again a two-voice convergence — but a clean one with no open disagreement to carry into a second round.

CONSENSUS: YES

## Final Output

**Target user and use case:** Everyday iPhone users who are physically in motion when they receive real-world place recommendations (friends, storefronts, social media, shared links) and have no way to act on that intent except "save it somewhere I'll never check again." The moment: someone says "you have to try this place," or a Maps link lands in a text, and the user has about three seconds before that intent evaporates. Waylay's only job is to catch that moment and hand it back at the one point it's useful — when the user is physically near the place again.

**Paid value and subscription value:** Free tier: ~8 actively monitored places, fast capture, real resurfacing — a genuinely useful product, not a demo. Pro ($3.99/mo or $24.99/yr): unlimited saved places with an intelligent rotation engine that decides which places earn one of the real 20 iOS-system region slots as your saved library grows past what can be watched at once, plus photo/voice capture and home screen widgets. The subscription sells *rotation intelligence*, not storage — "free gets you a handful of the places you'll walk by soon; Pro gets you all of them, correctly prioritized." The free-tier cap needs tuning so a normal user notices the ceiling within their first month of real use, not their first day (feels crippled) or never (no reason to upgrade).

**Core loop:** Notice → capture in under 3 seconds (manual pin, share sheet, or camera; no required typing, no blocking network call) → local persist → rotation engine assigns active-monitored or queued-dormant state, with a plain-English reason visible per place, always → proximity triggers exactly one notification per place per "episode" (re-entry after a cooldown, e.g. 4+ hours, resets eligibility) → user snoozes (time-boxed, re-enters rotation after the window), dismisses (permanent — never returns to rotation without manual reactivation from the library), or marks visited (a win state regardless of whether a notification ever fired). A debug/diagnostic view answering "is place X monitored right now, and why" is a v1 requirement, not optional polish — without it, the first "it didn't notify me" bug report is unfalsifiable given how unreliable CoreLocation region delivery is in practice.

**Competitive wedge:** Location-based reminders already exist (Apple Reminders, Maps saved lists) and are barely used for this, which proves the disease is capture friction and resurfacing silence, not a missing feature. Waylay's wedge is refusing to be a list product at all — no map browser, no search, no filters, no folders as a home surface. The defensible claim: this is the only app in the category where the primary interaction is *receiving*, not *searching*. Any future design that adds a searchable/filterable map as the home surface is the wedge quietly dying.

**Viral or niche growth angle:** No explicit referral/invite mechanic — that would fight the single-player promise. Growth is organic and niche: the share sheet doubles as free acquisition (someone shares a Maps link or Instagram post into Waylay instead of bookmarking it, prompting "what's this app" in a group chat), and the real marketing moment is the notification firing correctly — a person standing in front of a recommended place getting reminded at exactly the right second is the kind of thing people mention out loud. Target niche: repeat-movement urban/suburban users with routines and active social recommendation flow, not destination tourists.

**Local-first and cloud-ready plan:** Capture, state machine, rotation decisions, and notification scheduling all work fully offline against a local persistent store (Core Data/SwiftData) as the sole source of truth — no account gate, no server round-trip to save or resurface. Future cloud path is CloudKit added strictly as a sync layer, not product logic: this phase locks in that place records need stable identifiers and conflict-resolvable fields (last-updated state, user actions) from day one, so a later sync phase doesn't require a data-model rewrite. V1 ships with zero cloud dependency.

**Non-negotiable risk framing carried forward:** There is no engagement loop, streak, or habit mechanic in this product — trust from correctly-timed notifications is the entire retention mechanism, and it doesn't recover gracefully from a bad first impression. Rotation/cooldown/notification-frequency tuning should default conservative (fewer, higher-confidence nudges) over generous, since under-notifying costs a slow "this app doesn't do much" while over-notifying costs an immediate uninstall.

## Next Steps Small

CONSENSUS: YES

Codex and Claude ended up describing the same slice, just with slightly different emphasis. Codex framed it purely as risk-reduction: build the one thing that could kill the app (does a saved place move through active → resurfaced → resolved in a way that's trustworthy and debuggable) and cut everything else. Claude agreed on literally every cut and every must-have, but added two things Codex didn't contradict: first, that this is a sequencing decision, not a scope decision — share sheet, camera, widgets, App Intents, paywall UI, and voice notes are still real v1 requirements, just not part of what needs to be proven first; and second, that the slice has to already carry the finished product's warm voice, not read like a system utility, because "does it feel trustworthy and delightful" is itself part of what's being tested, not something to bolt on after. Both also independently insisted the "why is this monitored" plain-English legibility and a force-quit/diagnostic check are non-negotiable parts of the smallest slice, not stretch goals. No open disagreement — this converged cleanly in round 1.

## Final Output

**MVP slice:** One capture path (manual pin from inside the app, current location, no required typing beyond an editable auto-generated name) → immediate local persistence with zero blocking network calls → a real rotation engine that assigns every saved place an active-monitored or queued-dormant state against an enforced free-tier cap (~8 slots), with a plain-English reason attached to every place, always → real CoreLocation region monitoring registered for active places → exactly one notification per place per proximity "episode" → snooze (time-boxed), dismiss (permanent, no auto-return), or mark-visited (a win whether or not a notification fired) → state persists correctly across relaunch and force-quit. This is one complete, real workflow end to end on an actual device, not a demo of isolated screens.

**Must-have interactions:**
- Save a place from inside the app with at most one confirmation tap and no forced fields; get an immediate persisted confirmation.
- Open the library and see, for any place, a one-line plain-English answer to "why is this being watched (or not) right now" — not a hidden debug feature, part of the real UI.
- Walk (or simulate walking) a real device into a registered region and receive exactly one notification, with snooze/dismiss/mark-visited actions attached directly to it.
- Take each of those three actions and confirm the resulting state sticks — dismissed never returns without manual reactivation, snoozed goes silent for its window and cleanly re-enters after, visited is recorded as done.
- Force-quit the app and reopen it; the diagnostics view must be able to say monitoring was paused rather than silently pretend nothing happened.
- Seed the test with more than 8 saved places so the rotation/cap logic is actually exercised under contention, not just tested with a handful of places where nothing ever gets bumped.

**Cut list (deferred, not abandoned — all still real v1 scope for the finished build):** share sheet extension, camera/photo capture, voice notes, home screen widgets, App Intents/Siri shortcuts, the StoreKit paywall UI and restore-purchases flow (though the free-tier cap logic itself must be live and enforced even without commerce UI around it — rotation without a real cap to rotate against isn't a real test).

**Validation criteria:**
1. Capture-to-persisted is under 3 seconds on a real device with at most one confirmation tap, no typing required.
2. With more than 8 places saved, the rotation engine visibly and correctly enforces the cap, and every place — active or queued — has a plain-English reason a first-time user could read and understand.
3. Exactly one notification fires per real region entry, correctly timed (not so late the user already left, not so early it feels premature).
4. A dismissed place never re-notifies under any circumstance without explicit manual reactivation from the library.
5. A snoozed place goes silent for its full window and re-enters rotation eligibility cleanly afterward, no earlier.
6. Force-quitting the app is visibly reflected in the diagnostics view (monitoring paused/stopped), rather than the app silently claiming everything is fine.
7. All of the above state survives an app relaunch intact.
8. The notification copy and the "why is this monitored" reason strings already read in the app's intended warm, low-friction voice — not placeholder or system-alert tone — since emotional trust is part of what this slice needs to prove, not a later polish pass.

If all eight hold up on a real device, the core loop is de-risked enough to build outward to the full v1 spec already locked in prior phases. If any of them fail, that's the signal to fix before investing further build time in the deferred surfaces above.

## Detailed Discussion

CONSENSUS: YES

Round 2 is where this actually locked into place. Codex came back and explicitly reversed course on the two things that were left hanging — the permission sequencing and the cooldown number — instead of defending the earlier phase's numbers, which is exactly what needed to happen. Both of them are now saying the same thing in the same words: When-In-Use at first capture, ask for the Always upgrade right after the first successful save (framed as "let me watch for this even when you're not in the app"), and an honest degraded-state UI — not an error, not a nag — for anyone who stops at When-In-Use. Both agree the App Group container is a day-one architectural decision, not something you bolt on when you get around to building the share extension, because retrofitting shared storage later is a real migration. Both agree the 4-hour cooldown from the earlier phase was wrong and are replacing it with "one notification per unresolved episode, then silence by default until the user acts or a long day-scale reset" — the commuter-spam case killed the old number outright. Both agree "paused" needs sub-reasons (permission revoked vs. notifications off vs. force-quit-waiting-for-reopen vs. rebooted-and-reregistering) rather than one vague badge, since a vague "paused" just moves the unfalsifiable-bug-report problem up one level.

The one place they're still slightly different, not fighting, just not identical: Codex wants duplicate/near-duplicate places resolved via a lightweight post-save suggestion ("keep both or combine?"), while Claude pushed for silent auto-merge with an easy after-the-fact undo, arguing that even a lightweight suggestion is a decision tax on the exact three-second window we've spent four phases protecting. Nobody explicitly overruled the other, but Claude's version is the one that's actually consistent with the "no forced decisions at capture" rule already locked twice before, so that's the version going into the final output, with the disagreement named honestly rather than pretending it wasn't there. Claude's other round-2 additions — decay to soft-pause after a fired notification gets no response, giving newly-captured places a provisional contest for a monitored slot instead of queuing behind older saves indefinitely, and a concrete 100m default geofence radius — went unchallenged and build directly on principles both of them already agreed to, so they're carried forward as resolved rather than left open.

## Final Output

**Resolved requirements**

- *Place state model:* every place is always in exactly one of: **active** (currently monitored, consuming a region slot), **queued** (saved, eligible, not currently prioritized — free-tier cap or rotation lost out), **paused** (monitoring is system-blocked, with a mandatory sub-reason: permission-revoked, notifications-disabled, force-quit-awaiting-reopen, or device-rebooted-reregistering), **snoozed-until** (temporary, time-boxed, re-enters eligibility only after the window), **dismissed** (terminal, hidden from default browsing, recoverable only via explicit manual reactivation from the library/archive), **visited** (a completed loop, whether or not a notification ever fired, and it suppresses future notification eligibility by default but the user can re-arm it). Every state renders a short, plain-English reason in the UI — this is a UI requirement, not a debug feature, and "paused" specifically must never render without its sub-reason.

- *Capture contract:* a save commits synchronously to local persistent storage with only coordinates, timestamp, source, and a fallback title before any enrichment, monitoring registration, or subscription-gating logic runs. No required typing, no blocking geocode, no network dependency, at most one confirmation tap. "Saved" means "this exists now," never "we started trying."

- *Permission sequencing (locked):* request When-In-Use at first capture only — never Always on cold launch. Immediately after the first successful save, prompt for the Always upgrade with plain-language framing ("let Waylay watch for this even when you're not in the app"). If the user stays at When-In-Use, the app remains fully usable for save/browse/edit/state-visibility, but every place that would otherwise be active instead shows paused/permission-revoked with a Settings deep link — never a silent, unexplained failure to notify.

- *Notification/cooldown model (locked, replacing the earlier "4+ hour" rule):* one notification per place per unresolved episode. After it fires, the place goes silent by default — no repeat nudging on subsequent region re-entries — until the user takes an explicit action (snooze, dismiss, visited) or a long, day-scale reset condition is met. If a fired notification gets no user response for roughly a day, the place auto-transitions to a soft-paused "we noticed this one didn't seem useful, tap to bring it back" state rather than mechanically re-arming on a timer forever. This directly targets the daily-commute spam case named as a real failure mode.

- *Rotation/priority recipe:* deterministic and visible, not a black box — inputs include proximity likelihood, recency of capture, recent resurfacing history, snooze status, manual promotion, and demonstrated pattern near the area. A place captured within the last 24–48 hours provisionally contests for an active slot rather than queuing behind older saves indefinitely, so "just captured" and "actually being watched" don't quietly become different claims. Free tier caps monitored places (~8), never total saved places — nothing the user saves is ever at risk of being lost or downgraded in status, only in monitoring priority.

- *Architecture requirement (day one, not deferred):* the local persistent store lives in an App Group container from the start, even though the share extension itself ships later in sequence, because retrofitting shared storage after the schema/location are baked in is a real migration. A share-captured place must receive an immediate state decision (active/queued/paused + reason) at save time against the shared store — no "unevaluated limbo" state waiting for next app open, except as a rare, plainly-labeled exception if the OS genuinely prevents it.

- *Duplicate/near-duplicate handling:* silent auto-merge by default when a new capture lands within a small radius of an existing unresolved/active place (with loose name-similarity if a name exists), surfaced after the fact as a soft, dismissible note ("we think this is the same as [place] — tap to separate them if we're wrong"). No merge decision is forced into the capture moment itself — consistent with the standing "no forced decisions at capture" rule from earlier phases.

- *Geofencing defaults:* 100m default region radius, chosen as Apple's practical floor for reliable detection. In dense downtown blocks, two saved places may effectively share a detection zone — named explicitly as a physics limitation, not a bug to be "fixed" later.

- *Location accuracy:* precise-location detection is a named requirement. If the user granted reduced/approximate location, the app says so plainly ("proximity reminders may be fuzzy") and offers the precise-location upgrade path, rather than silently degrading.

**Edge cases (explicitly decided, not left to "the logic will handle it")**

- Saving a place while already standing inside its geofence → no immediate notification; that would be nonsense.
- Driving quickly through a monitored region → resurfacing should account for dwell/speed context rather than firing indiscriminately, to avoid becoming car spam.
- Two monitored regions in close proximity → cluster/serialize rather than firing back-to-back notifications in one block.
- Free-tier cap reached → save still succeeds; only monitoring priority is affected, never the save itself.
- Force-quit → monitoring silently stops until manual reopen; must be visibly reflected on relaunch as its own distinct paused sub-reason.
- Device reboot → iOS re-registers automatically once authorization is intact; distinct paused sub-reason from force-quit, since the recovery story and user-facing copy differ.
- User denies Always or notifications → app remains fully functional for save/browse/understand; resurfacing is explained as unavailable with a recovery path, never a dead end.

**Data and privacy implications**

- This is a sensitive behavioral trail (where the user noticed things, when they passed them) even though it's fully local — treated with that seriousness, not waved off as "no backend, so it's fine."
- Precise location stored only for user-saved places, no passive/background motion trail beyond region monitoring itself.
- Notification history and diagnostic data (region IDs, coordinates, last-fired timestamps) stay local and are deletable; no analytics/telemetry pipeline in v1.
- Always-usage-description and notification permission copy must explain behavior in human terms ("Waylay only keeps the places you chose to save, and only on this device"), both for user trust and because App Store review rejects vague background-usage strings.
- Accepted, named limitation: v1 has no content moderation for sensitive saved locations (someone's home, a clinic) — same trust model as Notes/Photos, a single-user local store, and adding moderation would be scope creep in the wrong direction.

**Risk register**

1. *Notification trust risk* (existential): false positives, mistimed alerts, duplicate alerts, or unexplained silence. Mitigation: one-shot-per-episode notification model, auto soft-pause after no engagement, visible per-place state+reason always, clustering rules for adjacent regions.
2. *Permission risk*: users who never upgrade to Always get a dead core loop while believing the app "works." Mitigation: staged permission ask tied to the first successful save, mandatory paused/permission-revoked UI state with recovery path — never silent.
3. *System-limit risk*: the 20-region iOS ceiling and the ~8-slot free-tier ceiling can produce baffling behavior unless active/queued/paused is explicit everywhere, always. Mitigation: state+reason is a UI requirement, not a debug feature.
4. *Data-loss risk*: async enrichment or pending region registration could make a user think a save succeeded when it didn't. Mitigation: synchronous local commit before any enrichment or side effects.
5. *Force-quit/platform-behavior risk*: CoreLocation delivery is unreliable; without disambiguating paused sub-reasons, every "it didn't notify me" report is unfalsifiable. Mitigation: four distinct paused sub-reasons, diagnostic view, force-quit vs. reboot distinguished.
6. *Privacy-perception risk*: even fully local data can feel invasive. Mitigation: explicit, human-language privacy copy; no telemetry; deletable history.
7. *Architecture-sequencing risk*: building single-process storage first and retrofitting shared storage later would force a second migration project when the share extension/widgets are built. Mitigation: App Group container from day one, locked now.
8. *Recency-starvation risk*: a newly captured place could sit queued behind older saves indefinitely at cap, undermining the "capture matters immediately" promise. Mitigation: recency-weighted provisional slot contest for places captured in the last 24–48 hours.

**Final assumptions / explicit exclusions**

- No continuous location history — only region monitoring tied to user-saved places.
- No notifications for places marked visited unless manually reactivated.
- No auto-notification when a place is captured from inside its own geofence.
- No semantic category inference in MVP.
- Library remains a management surface, not a map-first/discovery surface.
- Subscription logic never blocks core save behavior.
- Offline-first local persistence is the source of truth; CloudKit-compatible IDs exist but no cloud dependency ships in v1.
- Duplicate handling favors silent auto-merge + reversible after-the-fact correction over any mid-capture decision prompt.
- Default geofence radius is 100m; shared detection zones in dense urban blocks are an accepted physics limitation, not a bug.
- Fewer, higher-confidence resurfacing moments beat broader coverage — restraint is the product's core differentiator, not intelligence for its own sake.

## App Features

CONSENSUS: YES

Round 2 closed the gap cleanly. Codex looked at Claude's prompt_contract citation and actually changed position rather than defending the earlier split — agreeing that a broken or fake paywall/restore flow isn't "commerce polish," it's the same kind of trust failure as a bad rotation decision, just wearing a different hat, and that prompt_contract already locked "real StoreKit paywall/restore, not mockups" as a production-readiness requirement this phase doesn't get to quietly override. So paywall + restore moves into must-have, with a narrow definition: honest free/Pro boundary, purchase actually lifts the cap, restore actually restores entitlement on a fresh install — not upsell choreography or A/B'd paywall screens. Claude added a clean way to think about why this doesn't contradict the "don't front-load commerce chrome" instinct: there are two different flavors of must-have in this list — one because the core promise literally doesn't exist without it (capture, rotation, monitoring, notifications, resolution actions, state legibility, diagnostics), and one because it's a locked contractual requirement even though it doesn't test the loop itself (paywall/restore, accessibility, privacy strings). Both are non-negotiable for calling this done, they just fail for different reasons if skipped — and both agree paywall/restore is still built *last*, once the underlying cap/entitlement state is already solid, since it's bounded StoreKit 2 work rather than open-ended risk.

The procedural question also got locked: "should-have" isn't a soft parking lot for things that'll probably quietly not happen. Share sheet, widgets, and App Intents get actively attempted once every must-have (including paywall/restore) passes its acceptance criteria, and if any of them don't make it into the build, that's written down explicitly as a named deviation from the "v1 unless justified cut" language already locked in prompt_contract — not something discovered by reading the final repo.

No open disagreement left to carry into round 3.

## Final Output

**Must-have features** (the bar for calling this build done — each must pass its acceptance criteria)

1. **In-app manual-pin capture** — *As a user, I want to save my current location in one tap so a moment of interest isn't lost.* Acceptance: tap-to-persisted commits coordinates, timestamp, source, and an editable auto-generated title synchronously to local storage before any enrichment/state-assignment runs; under 3 seconds end-to-end on a real device; zero required typing; works offline.

2. **App Group–backed local persistence** — *As the system, all place data must survive relaunch/reboot and be ready for future shared surfaces.* Acceptance: store lives in an App Group container from day one, verified by a stub extension target reading the same store during this build (not deferred); data survives relaunch, force-quit, and reboot without corruption.

3. **Rotation/priority engine with free-tier cap (~8 monitored)** — *As a user with more saved places than can be watched, I want a fair, visible decision about which are active.* Acceptance: seeding >8 places produces correct visible queued states; a place captured in the last 24–48 hours provisionally contests for a slot rather than queuing indefinitely behind older saves; cap limits monitored places only, never blocks a save from succeeding.

4. **Per-place state + plain-English reason legibility** — *As a user, I want to see why any place is or isn't being watched right now.* Acceptance: every place always renders exactly one of active/queued/paused(+mandatory sub-reason)/snoozed-until/dismissed/visited, visible in normal library UI, not hidden behind a debug menu; "paused" never renders without its sub-reason.

5. **Real CoreLocation region monitoring with staged permission ladder** — *As a user, I get notified near a saved place without being ambushed by scary permission asks.* Acceptance: When-In-Use requested only at first capture; Always upgrade prompted right after first successful save with the locked framing; a When-In-Use-only user sees affected places marked paused/permission-revoked with a Settings deep link, never silent failure; 100m default region radius; reduced-accuracy location is explicitly surfaced with an upgrade path.

6. **One-shot-per-episode notifications with attached actions** — *As a user, I get exactly one well-timed nudge per place, not a stream of pings.* Acceptance: real region entry fires exactly one notification with snooze/dismiss/mark-visited actions attached; no second notification for that place until user action or the day-scale auto soft-pause; same-day re-entry doesn't re-notify.

7. **Snooze/dismiss/visited with enforced semantics** — *As a user, once I act on a place, that decision sticks.* Acceptance: dismissed never returns without explicit manual reactivation from the library; snoozed goes fully silent for its window and re-enters cleanly, no earlier; visited is recorded as a completed loop regardless of whether a notification fired, with future notifications suppressed until manually re-armed.

8. **Library browser as a management surface** — *As a user, I want to browse and manage all my saved places by state.* Acceptance: users can view and act on places in every state (active/queued/paused/snoozed/dismissed/visited) and manually reactivate a dismissed or paused place.

9. **Diagnostics/debug view** — *As the person debugging "why didn't it notify me," I need an inspectable log.* Acceptance: shows last monitoring decision, current state, whether the place currently consumes one of the 20 system region slots, last notification timestamp; force-quit vs. reboot are visibly and distinctly represented after relaunch.

10. **Duplicate/near-duplicate silent auto-merge** — *As a user, I don't want to be asked mid-capture whether this is a place I already saved.* Acceptance: a second capture within a small radius of an existing unresolved/active place auto-merges silently, surfaced only afterward as a dismissible note; no mid-capture prompt ever.

11. **Real StoreKit paywall + working restore purchases** — *As a paying (or free) user, I need the app's business model to be real, not a mockup.* Acceptance: free-tier cap enforcement is live and independently testable; Pro purchase actually removes the monitored-place ceiling up to the real 20-region cap; restore-purchases actually restores entitlement on a fresh install/reinstall, tested rather than assumed. Built last in the build sequence, once cap/entitlement state is already solid — not because it matters less, but because it's bounded, well-understood work once the state model underneath it is correct.

**Should-have** (real v1 scope, actively attempted after every must-have above passes — if any don't ship, that's recorded explicitly as a named deviation, not silently dropped): share sheet extension, home screen widgets, App Intents/Siri shortcuts.

**Could-have** (opportunistic only, first to slip under time pressure): camera/photo capture, voice notes, any richer library organization or premium visual polish beyond what the must-haves require.

**Won't-build** (explicitly excluded from this build): on-device Vision OCR, CloudKit/multi-device sync, collaborative or shared lists, any searchable/filterable map-first home surface, semantic category inference, continuous or passive location history, analytics/telemetry pipelines, mid-capture decision prompts of any kind (merge confirmations, category pickers, forced naming), a generalized reminder system, and multiple/clever notification styles beyond the one locked model.

**Governing principle carried into the build phase:** prioritization here is based on trust density, not feature visibility or screenshot appeal — a smaller app where every place has a legible state, every notification is restrained, and the business model is honestly enforced beats a broader app with more entry points and soft spots.
