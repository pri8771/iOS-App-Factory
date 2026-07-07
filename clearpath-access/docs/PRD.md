# clearpath-access — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Looking at this, both voices actually landed in the same place — Claude's round wasn't pushback against Codex, it was sharpening three specific soft spots Codex's contract had left open. There's no real fight here, just refinement. Let me write the wrap-up.

Here's where things stand: Codex laid out a solid contract — narrow MVP scope but full production bar, accessibility-aware routing plus community obstacle reporting, local-first now with a path to sync later, and a clear differentiator (route quality scored on accessibility friction, not just distance/time). My round didn't disagree with any of that — it just nailed down three things Codex's version left fuzzy: (1) "community-sourced" has to mean on-device seeded data in v1, explicitly not real crowd data, so nobody builds fake-multiplayer or quietly wires a backend mid-build; (2) "accessibility-aware routing" means MapKit's walking route plus obstacle overlay/reroute-around-flagged-obstacles, not a from-scratch routing engine that natively understands curb cuts and grade — that's an important scope clarification, not a contradiction; (3) since this targets people with mobility constraints, unverified user data is a real safety issue, so a persistent "user-submitted, unverified, not a guarantee" disclaimer is a hard requirement, same spirit as the medical apps' wellness-not-diagnosis framing. I also pinned down concrete pass/fail success metrics and forced monetization to be a specific mechanism, not a vague "subscription."

Gemini was unavailable this round, so there's no third perspective to reconcile, but the two views present agree in substance — nothing here is contested.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim above. This child project is bound by the parent portfolio prompt (9 separate production-ready iOS apps, uniqueness rules, local-first-with-cloud-path, monetization, premium design) plus its own spec: Clearpath Access, Navigation category, "Accessibility-aware pedestrian routing with community-sourced obstacle reporting," MVP build mode.

**Hard requirements:**
- Standalone SwiftUI iOS project, its own folder, local-first with real persistence (SwiftData/CoreData) — no backend required to function.
- Data model must be shaped so a CloudKit/server sync layer can be added later without a schema rewrite.
- Real user-visible workflow, not static screens: request a walking route between two points, see it rendered, submit an obstacle report (type/severity/note), have reports persist across launches, and see a route visibly flagged/rerouted when it crosses a known obstacle.
- "Accessibility-aware routing" = Apple's walking directions (MKDirections) overlaid with community obstacle data, with warning/reroute-around behavior — not a from-scratch grade/curb-cut routing engine.
- "Community-sourced" in v1 = on-device reports only, seeded with a small bundled sample dataset so it doesn't look empty; UI must never represent this as live crowd data.
- Persistent, visible disclaimer that obstacle data is user-submitted and unverified — the app is not a guarantee of accessibility.
- Full accessibility support (VoiceOver, Dynamic Type) — non-negotiable given the target audience.
- Empty/loading/error/success states for: no location permission, no route found, no nearby obstacles, geocoding/network failure.
- Privacy-respectful location handling, graceful permission-denial flow, onboarding.
- Domain logic (route scoring, obstacle impact) must have real tests.
- Concrete, single monetization mechanism (e.g., caregiver/family route sharing, offline area data, saved accessible-route profiles, curated/verified obstacle layer) — not a vague "subscription" gesture.
- Explicit differentiator preserved through all later phases: route quality is scored by accessibility friction (obstacles, severity, recency/confidence), not just distance/time, and the app explains why a route is recommended in plain language.

**Non-goals:**
- Nationwide/city-scale map coverage — a bounded local dataset/corridor is fine and should be designed-in honestly, not hidden.
- Turn-by-turn GPS-grade voice navigation or dynamic live rerouting parity with Apple/Google Maps.
- Live multi-user sync, real backend, or cloud moderation in this MVP.
- Camera/ML auto-obstacle-detection — optional bonus only, never a dependency for core functionality.
- Transit integration, general local discovery, place journaling, or generic social/reporting feed features.
- Medical/diagnostic claims of any kind.

**Production-readiness definition:** A user can install and use the app end-to-end with no pretended systems — stable state management, persistence across launches, working onboarding and permission flows, all the empty/loading/error states above, VoiceOver/Dynamic Type working throughout, tests on route/obstacle-scoring logic, and an honest presentation of coverage limits and data-trust boundaries. It must feel premium and intentional, not like a civic-tech prototype.

**Decision rules for later phases:**
- Fewer route features with credible accessibility intelligence beats a sprawling navigation surface.
- Explainable scoring beats black-box recommendations.
- Reliability wins in core routing; novelty (if wanted) lives in reporting UX, trust signals, or personalization — not in the routing core.
- Any feature that doesn't directly improve route trust for mobility-constrained pedestrians is a cut candidate.
- If a later phase is tempted to fake live community data or build a real backend to "complete" the promise, that's a violation — the correct move is to keep it on-device and let the sync-ready architecture speak for the roadmap instead.
- If bonus LLM/AR/ML is used, it must be additive (e.g., plain-language route explanations) and never a load-bearing dependency for shipping.

## Initial Discussion

CONSENSUS: YES

Codex and Claude aren't actually disagreeing here — they arrived at nearly the same product independently and just emphasized different angles. Codex framed it top-down (what the app *is* and why the UX has to be inspectable/explainable); Claude framed it bottom-up (what a QA pass can actually verify, and where the taxonomy has to stay narrow). The obstacle-type list, the single-trip-only boundary, the "no fake crowd data" boundary, and the explanation-first scoring all show up in both rounds without contradiction. Nothing here is contested — this reads like a clean first-round convergence rather than a stall.

## Final Output

**One-sentence product promise:** Clearpath Access helps a pedestrian with mobility constraints choose the least-risky walking route by combining Apple's walking directions with locally stored, self-reported obstacle data and a plain-language explanation of why one route beats another — not a live crowd network, a personal-plus-seeded trust layer.

**Primary user and scenario:** Wheelchair users first, then cane users, rollator users, and stroller-pushers — people for whom the shortest route and the *usable* route are often different things. The core scenario is mundane and everyday: getting from a transit stop to a clinic, or home to a pharmacy, where the thing that ruins the trip isn't distance but discovering stairs, a blocked path, or a missing curb cut mid-route with no advance warning. A caregiver/family member planning on someone else's behalf is a named secondary user — not built for yet, but the design shouldn't foreclose it, since it's the likely future monetization hook.

**Core loop:** Pick a destination → get a walking route scored on obstacle friction, not just time/distance → see a plain-English reason for the recommendation ("2 fewer high-severity obstacles, no reported stairs") → inspect flagged segments → optionally submit a fast report (type, severity, note) on something encountered → that report immediately changes route scoring for that same user, in the same session, without needing a restart. This full loop — request route → see flag → see scored alternative → submit report → re-request → see it reflected — must work end to end on a fresh install for the MVP to be real rather than a demo.

**Hard scope boundaries:**
- Route-confidence tool, not a real-time navigation platform — no live GPS tracking during the walk, no turn-by-turn voice guidance.
- No fake "community activity" — this is one user's own reports plus bundled seed data, never presented as live crowd input.
- No social layer, no broad place discovery, no custom pedestrian graph, no claim of authoritative/complete accessibility coverage anywhere.
- Obstacle vocabulary is fixed and small (stairs/no ramp, steep grade, broken/uneven surface, construction/blockage, no curb cut, temporary hazard) with a severity — the scoring engine understands nothing outside this list.
- Single trip, single route request at a time — no saved trip history dashboards, no multi-stop itineraries.
- The app must always be visibly honest about what it doesn't know — empty map areas, unreported obstacles, and stale reports are core UX, not edge cases to hide behind confident-looking design.

**Measurable success criteria (pass/fail, testable without needing real-world ground truth):**
- A destination search returns at least one rendered walking route on the map.
- A route crossing a stored obstacle is visibly flagged with a plain-language explanation of the impact.
- A user can submit an obstacle report in under 30 seconds (type, severity, optional note).
- A report submitted in-session changes the score/explanation of a route re-requested immediately after, with no restart required.
- Reported data survives a force-quit and relaunch.
- No-permission, no-route-found, no-nearby-obstacles, and geocoding/offline failures each degrade gracefully (no crash, no silent blank state, no false confidence).
- VoiceOver can reach and identify the route summary, warnings, and reporting actions without dead ends.

## Per App Product Brief

CONSENSUS: YES

Both rounds landed on the same product, just from different angles — Codex framed it as a business/trust proposition, Claude filled in the retention mechanics and the honesty-in-empty-states problem. Nothing here actually conflicts. Codex's "caregiver sharing + saved profiles" and Claude's "favorite named routes + caregiver notifications" are the same feature described at two levels of detail, and Claude's addition (save a route as a one-tap favorite) is a natural, non-contradictory extension of the core loop both already agreed on. The only things unique to one side — Codex's mention of downloadable coverage packs as a secondary paid extension, Claude's emphasis on the "empty map as vaporware" risk and how to defuse it — are additive, not competing. This reads like real convergence, not a forced one.

## Final Output

**Target user and use case:** A wheelchair, rollator, or cane user in a mid-size city with a short, recurring list of destinations that actually matter — clinic, pharmacy, transit stop, a family member's home. The job isn't exploring a new place, it's a pre-trip confidence check: standing at the door, they need to know in under ten seconds whether their usual route is still good or whether they should route around something new. Secondary named user: a caregiver, adult child, or aide planning or checking on someone else's mobility risk — this is where paid value actually lives.

**Core loop:** Pick a destination → get a walking route scored on obstacle friction with a plain-English reason ("fewer reported stairs, no severe barriers") → inspect the flagged segment → optionally report a new obstacle in under 30 seconds → see that report immediately change the score on a re-request, same session, no restart. Add one retention beat on top of the loop already locked in earlier phases: let the user save a scored route as a named one-tap favorite ("Route to Dr. Patel's"), because this user has the same 3-4 walks on repeat — a favorite is what turns a one-off utility into a daily-open habit, and it's also the natural object the caregiver-sharing feature hangs off later.

**Paid value / subscription:** Free tier is single-destination routing + obstacle overlay + reporting — genuinely useful, but a utility, not a subscription. The subscription unlocks function only a second stakeholder needs: saved accessibility-aware route profiles for recurring destinations that always reflect current obstacle data, and caregiver/family route sharing — a second person can see the same route, the same plain-language explanation, and get notified when a saved route's obstacle picture changes. That's the real hook: an adult child paying monthly for a window into a parent's day-to-day mobility risk is a fundamentally stronger willingness-to-pay than paying for nicer icons. Curated local coverage packs for specific districts/corridors are a viable secondary paid extension later, but not the anchor — it depends on content investment the sharing feature doesn't.

**Competitive wedge:** Not coverage, not "we have accessibility data" — it's explainable accessibility-friction scoring against a small, fixed, auditable obstacle vocabulary, plus a self-reinforcing personal data loop where a user's own reports on their own regular routes make the app visibly smarter for them specifically. No general maps app is built to let a user teach it their own path constraints; that's defensible in a way raw data coverage never would be.

**Growth angle:** Niche and trust-based, explicitly not a manufactured social feed (that would violate the no-fake-community-activity boundary already locked). Realistic mechanism is caregiver and support-network word of mouth — parent support groups, independent-living centers, physical therapists recommending it to patients, disability services offices. One credible source reaching fifty people who share the same handful of worry-trips is the right shape of growth here, not broad virality.

**Local-first / cloud-ready plan:** The entire free tier — routing, obstacle reports, favorites, report history — runs on SwiftData with zero account and zero network dependency beyond MapKit's own routing calls. First launch seeds a small, clearly-labeled sample obstacle set in one bounded demo corridor (explicitly framed as starter data, never dressed up as live activity), and empty areas elsewhere say plainly "no reports yet — be the first" rather than showing nothing. The cloud seam is scoped tightly to what's actually impossible locally: a lightweight CloudKit-backed identity used only for syncing a user's own data across their own devices and for the caregiver-sharing link itself, which is inherently two-party. Paid tier's account requirement is justified by a feature that structurally can't work offline — not a paywall bolted onto something that used to be free.

**Why this deserves to exist:** It's the only version of "accessibility-aware navigation" that's honest about what it can and can't know, and it turns that honesty into the product's actual value — a route-confidence tool for a recurring, painful decision that general-purpose maps apps have no reason to ever solve well.

## Detailed Discussion

Both voices spent round two doing exactly what needed to happen — turning "we agree this needs a number" into actual numbers — and by the end there's barely daylight between them. Codex signed off on nearly everything Claude proposed (favorites as endpoints-not-frozen-path, manual origin entry, the accessible list view, summed severity scoring with banded decay, offline-review-not-offline-routing), and where Codex pushed back, Claude either folded the pushback in cleanly (the proximity-vs-blocking distinction became a two-tier read on the same buffer number) or genuinely changed its own mind after hearing Codex's point (dropping a dedicated "mark resolved" button in favor of letting a fresh report in the same spot supersede the old one, which is actually a better answer to the "score only ratchets upward" problem than either of them had going in). The seed-corridor question also resolved for real: Claude talked itself out of a fully fictional place (too game-board, undercuts the premium bar) and landed on Codex's underlying worry from a different angle — invented street names inside a real, named city, so it reads as a real place without ever being able to falsely implicate one.

The only loose thread is a genuinely small one: Codex wants the obstacle-matching buffer capped at a flat 20 meters, Claude wants a two-tier version (inside ~10m reads "on this route," 10-25m reads "nearby"). That's not a real fight — Codex's objection was specifically that 25m felt "too eager" in dense grids, and Claude's inner tier doesn't touch that; you can keep Codex's 20m outer cap while keeping Claude's inner 10m sub-threshold for the "on path" vs. "nearby" language. That resolves it without another round.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
- Every route recommendation shows three things every time: what's recommended, why (in plain language), and what the app doesn't know (staleness/confidence) — e.g. "Recommended because it avoids reported stairs and has fewer severe hazards. Confidence: moderate. Nearest report: 6 days ago."
- **Obstacle-to-route matching:** a fixed 20-meter buffer around the route polyline determines whether an obstacle counts against that route at all. Within that, a report inside ~10m reads as "on this route"; 10–20m reads as "nearby, may not affect this exact path." One buffer, one inner sub-threshold, both numbers fixed so scoring tests can assert against them directly.
- **Friction score formula:** for each obstacle matched within the buffer, score = base type weight × severity multiplier × recency multiplier; matched obstacles sum per route (not worst-only). Recency decays in fixed bands, not a smooth curve: <7 days = full weight, 8–30 days = reduced, 31–90 days = low, >90 days = very low but never zero. The score shown to the user is categorical (low/moderate friction language), not a raw number.
- **Confidence** is a separate signal from the friction score, derived from report density and freshness along the route corridor, not from obstacle count: zero reports anywhere in the buffer = "low confidence — limited local data"; some reports but mostly old = "moderate"; several reports with at least one under 30 days = "high." This is what stops "no reported obstacles" from ever being misread as "safe" — a zero-data route and a five-clean-recent-report route both show the same headline but different confidence labels.
- **Tie-break rule:** when two routes score identically on friction, the shorter route wins — a deterministic, testable pick rather than incidental behavior.
- **Report lifecycle:** no separate "mark resolved" workflow. A new report submitted within the same matching buffer as an existing obstacle supersedes it in scoring, weighted toward the newer report, with the old one retained in history. The existing report flow gets one added lightweight option ("looks clear now") rather than a new UI surface. This is the mechanism that keeps the friction score from ratcheting upward forever.
- **Favorites** store origin/destination only and re-fetch the route live on open — never a frozen polyline. UI language is honest about this: "today's suggested route to Dr. Patel's office," and the reassurance copy is "no new reported issues affecting today's suggested route," not "same route still clear."
- **Manual origin entry** (typed address or dropped pin) is in MVP scope — required for permission-denied to degrade gracefully rather than dead-end, and it's the seed of later caregiver/multi-person planning.
- **Accessible list view:** a parallel, fully VoiceOver-navigable list of flagged segments/obstacles alongside the map, ordered by progression along the route (first thing you'd reach, then next), not by severity or alphabetically — sequence is the information this user actually needs.
- **Seed/demo data:** invented street and corridor names (that map to no real address) set inside a real, named city — e.g. "Sample data for the Elm Street corridor (demo)" where Elm Street doesn't exist there — so the demo feels like a real place without ever being able to falsely implicate an actual intersection.
- **Offline behavior named explicitly:** local-first covers reports, favorites, and history — not new routing, since MKDirections is a network call. Offline gives you your saved routes/reports plus a plain, distinct message ("can't fetch a new route right now — check your connection; your saved routes and reports are still here") that is never confused with "no obstacles nearby," which means something very different.

**Edge cases (named, with behavior defined):**
- Location permission denied → manual origin entry, not a dead end.
- Permission granted then revoked mid-session/backgrounded → re-check and fall back to manual entry gracefully, don't crash or silently stop updating.
- Offline on first-time destination search → hard, honestly-labeled failure state, distinct from "no nearby obstacles."
- Offline with a previously-fetched route still in session → obstacle scoring can still update against that cached route.
- Route with zero matched obstacles → labeled "no reported obstacles on this route," never "accessible" or "clear," and confidence is shown separately so an empty-data area doesn't read as a verified-safe one.
- Conflicting/updated reports on the same obstacle → newer supersedes older via the buffer-match rule above, old retained in history.
- Two routes scoring identically → shorter wins, deterministically.

**Data and privacy implications:**
- No photo capture in MVP (confirmed, unanimous, unchanged from prior phases).
- No passive travel-history/diary logging — only user-created reports, favorites, and saved destinations are persisted; route requests themselves aren't turned into a hidden history log.
- Obstacle note field is free text, on-device, but implicitly future-shareable (caregiver sharing is the named paid feature) and tied to health-adjacent locations — ships with standard complete-until-first-unlock file protection and a short inline hint discouraging personal/identifying info in notes, since it can't be retroactively scrubbed once sharing exists.

**Risk register:**
- *False confidence from incomplete/stale data* → mitigated by the mandatory what/why/confidence triad and the banded recency decay; named as the single biggest product risk.
- *Empty-map/vaporware feel* → mitigated by the bounded, clearly-labeled fictional-street demo corridor plus honest "no reports yet — be the first" copy elsewhere.
- *Friction score ratcheting upward forever* → mitigated by the supersession-on-new-report mechanism.
- *Favorites drifting from what MapKit would actually suggest* → mitigated by re-fetching live from stored endpoints rather than freezing a polyline.
- *VoiceOver map-pin dead ends* → mitigated by the sequence-ordered parallel list view.
- *Liability from real-world obstacle claims in seed data* → mitigated by fictional street names inside a real city, never a real intersection.
- *Scope creep into live navigation/turn-by-turn* → stays out per prior-phase non-goals; unchanged and reconfirmed here.

**Final assumptions carried into design/architecture:**
- Route matching buffer: 20m outer / 10m inner tier, fixed constants the scoring engine and its tests are built against.
- Scoring: multiplicative per-obstacle weight (type × severity × recency band), summed per route; confidence computed separately from density/freshness, not obstacle count.
- Favorites are live-re-fetching endpoint pairs, not frozen routes.
- Report "clearing" reuses the existing report-submission flow via buffer-based supersession, not a new UI mechanism.
- Manual origin entry and the accessible list view are both MVP-scope, non-negotiable, not stretch goals.
- Demo/seed data lives in a fictional corridor inside a real named city.
- Local-first is scoped to the data layer; live routing has a named, honest offline limitation with its own distinct UI state.

## App Features

CONSENSUS: YES

This round actually closed the loop. Codex came back and explicitly signed off on all three things the coordinator flagged: the ShareLink-not-push shape for caregiver value, the 2-favorite free cap (with the caveat that it only works if free still feels genuinely useful, not crippled), and treating the boundary-value tests (19m/21m, day 6/8/30/31/90/91) as real acceptance criteria for this phase rather than something to hand-wave as "build-phase testing." Claude then pushed on one more thing — that Codex's won't-build list still had "caregiver sharing itself... stays as the monetization path" sitting there unchanged, which contradicts what Codex had just agreed to two paragraphs earlier (a defined ShareLink export shipping as MVP scope). That's not really a new disagreement, it's Codex's own position catching up with its own wording — Codex's round 2 already describes the ShareLink feature as something "the MVP should share," which only makes sense if it's a must-have, not a deferred non-goal. Claude's other addition — a must-have for the single-route case, where MapKit only returns one walking route and the "why this route beats the alternative" framing has to honestly downgrade to "the only route found" instead of a comparison it can't support — is a small, logical gap-fill on top of Codex's own scoring/comparison requirement, not a contested new mechanism. Nothing here pulls in opposite directions; it's four loose ends getting tied off.

## Final Output

**Must-have features:**

1. **Route planning from current location or manual origin to a searched destination.**
   User story: as a user who may deny location permission or plan for someone else, I need to set both ends of a trip and still get a usable route recommendation.
   Acceptance criteria: current-location or manual/dropped-pin origin both work; destination search/selection works; permission-denied does not dead-end; at least one route renders on success; offline or routing failure produces a distinct, honest error state (never confused with "no obstacles nearby").

2. **Accessibility-friction route scoring across returned walking routes.**
   User story: as a mobility-constrained pedestrian, I need the app to tell me which available route is least risky based on known reported barriers, not just which is shortest.
   Acceptance criteria: scoring uses the locked 20m/10m buffer tiers, type × severity × recency-band formula summed per route, and the shorter-route tie-break; a route with zero matched obstacles is labeled "no reported obstacles," never "safe" or "accessible." Boundary-value tests are explicit and must-pass, not left to interpretation: an obstacle at 19m counts, at 21m does not; at 9m reads "on this route," at 11m reads "nearby"; recency bands are asserted at the exact edges — day 6 vs. 8, day 30 vs. 31, day 90 vs. 91 must land in different decay bands.

3. **Plain-language route explanation with explicit confidence.**
   User story: as someone making a real mobility decision, I need to understand why a route is recommended and how complete the evidence is.
   Acceptance criteria: every result shows what's recommended, why, and confidence/staleness; confidence is derived from report density/freshness, independent of obstacle count; low-data corridors are visibly labeled low-confidence even with zero flagged obstacles.

4. **Single-route-result honesty.**
   User story: as a user in an area where MapKit only returns one walking route, I still need an honest explanation, not a comparison the app can't back up.
   Acceptance criteria: when MapKit returns exactly one walking route, the app still shows the full what/why/confidence triad, but the "why" language is adapted to something like "the only walking route found" rather than implying a comparison against alternatives that don't exist; this case has its own test, not an assumption that multi-route responses are typical.

5. **Obstacle reporting with immediate local effect, including supersession.**
   User story: as a user who hits a barrier or sees one has cleared, I need to record it fast and see the app reflect it right away.
   Acceptance criteria: report creation (type, severity, optional note, "looks clear now" where relevant) completes in under 30 seconds; a report submitted in-session changes the score of a route re-requested immediately after, no restart; a newer report inside an existing obstacle's buffer supersedes the old one in scoring (weighted toward newer), with history retained, verified by an explicit before/after test on the same buffer.

6. **Local persistence for reports, favorites, and saved destinations.**
   User story: as a repeat user with a handful of recurring walks, I need my reports and one-tap routes to survive relaunching the app.
   Acceptance criteria: reports, favorites, and saved endpoints survive an actual force-quit and relaunch (not just trusted at the framework level); favorites store origin/destination only and re-fetch live on open, with UI copy honest that it's "today's suggested route," never a frozen path.

7. **Accessible route details list alongside the map.**
   User story: as a VoiceOver user, or anyone who wants fast clarity, I need a linear list of route issues in travel order instead of interpreting map pins.
   Acceptance criteria: flagged items appear in a list ordered by progression along the route (not severity, not alphabetical); a manual VoiceOver pass reaches route summary, every flagged item, and the report action with zero dead ends; Dynamic Type at the largest accessibility size shows no truncation on any core screen.

8. **Seeded demo corridor plus honest empty states.**
   User story: as a first-time user, I need to see how the product works without the app pretending it has broad real coverage.
   Acceptance criteria: first launch includes clearly labeled sample reports in a fictional corridor (invented street names) inside a real named city; areas without reports say so plainly ("no reports yet — be the first"); the UI never implies live community coverage.

9. **Persistent safety/trust disclosure.**
   User story: as someone relying on this for a physical trip, I need a constant reminder that data is user-submitted and unverified.
   Acceptance criteria: disclaimer shown in onboarding and reachable at any time from the route result screen (footer/info affordance); it can be dismissed as an onboarding step but never fully suppressed from the app.

10. **Caregiver share export (ShareLink, not live sync).**
    User story: as a user who wants a family member or aide to see my planned route, I need to share it without either of us needing an account.
    Acceptance criteria: native `ShareLink` action generates a timestamped, self-contained snapshot (destination, recommendation, confidence/staleness, unverified-data disclaimer) as text/file content; opening it requires no account, no network call, no push infrastructure; this is explicitly not live-updating — no "notify me when this changes" mechanism ships in this MVP.

11. **Two-favorite free cap with StoreKit purchase/restore.**
    User story: as a free user, I should get real value from a couple of saved routes; as a paying user, I should get the recurring-trip and sharing value that matches how I actually use the app.
    Acceptance criteria: free tier allows up to 2 saved favorites; attempting a 3rd triggers an upsell screen, not a silent failure or crash; purchase unlocks unlimited favorites plus the ShareLink export; a working StoreKit purchase and restore flow gates exactly those two things — routing, scoring, and reporting remain free and ungated.

12. **Domain-logic unit tests independent of UI.**
    User story: as the team shipping the app's one truly verifiable subsystem, I need the scoring/obstacle-impact logic tested without relying on a human eyeballing a map.
    Acceptance criteria: the boundary-value tests from item 2, the supersession test from item 5, and the single-route case from item 4 all exist as automated tests, not just "coverage" in the abstract.

**Should-have:**
- One-tap save of a route as a named favorite immediately after viewing results.
- Recent destinations for faster repeat planning.
- Inline guidance discouraging personal/identifying info in obstacle notes.

**Could-have:**
- Rider profile (wheelchair/cane/rollator) reweighting — explicitly not must-have, since the locked scoring model is universal, not profile-based, and reopening it now would unwind tested math for a feature that was never actually spec'd.
- Browsable history view of superseded reports (data model already retains them; a UI to browse is extra surface).
- Lightweight onboarding walkthrough using the seeded corridor to teach "recommended / why / confidence."
- Small trend cues in favorites ("last updated 6 days ago").
- Downloadable curated coverage packs (already flagged in the product brief as secondary, not anchor).
- Haptic/visual emphasis for severe on-route hazards.

**Won't-build (explicit, not implied):**
- Any live sync, push notification, or backend-dependent caregiver feature — caregiver value in this MVP is the ShareLink export only; live "your mom's route just changed" notifications are out.
- Turn-by-turn voice guidance or live GPS tracking during the walk.
- Real multi-user sync, moderation, or actual crowd/community data presence.
- Photo capture, camera-based detection, or ML features.
- Custom pedestrian graph, curb-cut intelligence, or grade modeling.
- Multi-stop itineraries, trip history dashboards, transit integration, or discovery/social feed features.
- Verified partner/curated data layer (secondary paid idea for later, not this build).

**Biggest risk carried forward:** the app has more trust states than feature states — permission-denied, low-confidence, zero-matched-obstacle, offline-new-route-failure, single-route-result, stale/superseded reports, seeded-vs-real data. If these collapse into generic empty/error screens, the product misleads even when the underlying math is correct. The core output of this app is a recommendation sentence with inspectable evidence and explicit uncertainty, not "a route on a map" — that has to survive into design and build untouched.
