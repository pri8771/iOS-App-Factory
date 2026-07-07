# brinekeeper — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both Codex and Claude landed in the same place on substance, even though Claude raised one thing worth calling out explicitly rather than quietly assuming.

Where they agree: this is a build contract for Brinekeeper specifically (not a fresh "generate 8 ideas, pick 3" exercise) — the routing metadata already selected this slug, so the parent portfolio prompt is inherited as a quality bar (design-first, complexity required, local-first, uniqueness vs. the rest of the workspace) rather than as a second ideation task. Both agree the dosing solver must be deterministic, explainable stoichiometry with conservative safety caps — no external chemistry APIs, no LLM anywhere near chemistry/compatibility logic (the spec bans this outright). Both agree the compatibility engine has to actually reason over bioload/aggression/allelopathy rather than being a small static list dressed up as a "graph" — and both point to the same fallback: if the seed data can't support real graph reasoning, cut it back to a single-tank calculator per the spec's own invalidation criteria, rather than fake sophistication. Both agree on the same non-goals (no CloudKit sync yet, no Vision/photo test-strip reading in v1, no server backend) and the same design mandate (bioluminescent glass-morphism, actually implemented, not just described).

Claude added sharper, testable teeth to "production-ready": actual unit tests on the solver math with known input/output pairs, compatibility test cases proving different bioload/aggression combos yield different warnings (not one canned message), explicit checks that the glowing-gradient-on-near-black aesthetic doesn't silently fail contrast requirements, and graceful degradation if the user denies notification/background-task permissions. Nothing here contradicts Codex's contract — it just makes it more falsifiable, which is exactly what this phase is supposed to produce.

The one thing Claude flagged as needing to be said out loud rather than assumed — that this run scopes to Brinekeeper alone, inheriting portfolio rules rather than re-running the 3-app selection — isn't actually in tension with Codex's draft; Codex's whole contract already only talks about Brinekeeper. So this reads as naming an assumption both were already operating under, not an open disagreement.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim above (routing metadata + full Brinekeeper app spec + full parent 3-app portfolio prompt). This document is canonical; nothing below overrides it.

**Scope of this run:** This execution builds Brinekeeper only (PORTFOLIO_CHILD_PROJECT: true, slug already selected). The parent portfolio prompt is inherited as *quality bar and process context* — design-first priority, complexity/depth requirement, local-first architecture, uniqueness vs. every other app in the workspace — not as an instruction to re-run "generate 8 ideas, pick 3" in this contract.

**Hard requirements:**
- SwiftData models with real relationships for tank, water test, dosing product, livestock, compatibility rule, and reminder/schedule entities.
- Deterministic, explainable dosing solver: tank volume + current parameters + targets + product concentration → exact dose, with conservative safety caps (e.g., refuse/warn rather than auto-escalate past safe daily deltas) and a visible calculation trace.
- Deterministic livestock compatibility engine producing a risk tier + warning payload driven by bioload/aggression/allelopathy rule data — not a static lookup table.
- All six v1 workflows fully functional end-to-end: log a test, get a dosing recommendation, view trend charts, build a roster, get compatibility warnings, get maintenance/test reminders.
- iOS-native pieces as specified: home screen widget (days since last test/next dose), BGTaskScheduler-driven reminders, Live Activity for an in-progress dosing session — all background-safe and permission-aware.
- Bioluminescent glass-morphism design system (near-black backgrounds, teal/violet/coral glow, glass cards, animated luminous trend graphs) actually implemented and documented, not just described.
- Accessibility, empty/loading/error states, privacy, and persistence treated as shipping requirements, verified against the glow-on-dark aesthetic (contrast, Dynamic Type, VoiceOver, 44pt targets).
- No third-party dependencies unless materially necessary; system frameworks by default.

**Non-goals:** No external chemistry API or cloud calculation; no LLM involvement in chemistry or compatibility logic (explicitly banned by the spec); no Vision/photo test-strip reading in v1; no CloudKit sync in v1 (roadmap only); no real payment processing — StoreKit paywall/entitlement structure is enough, not live App Store Connect products; no re-running the 3-app ideation in this contract.

**Production-readiness definition:** Builds and runs with no placeholder screens on any of the six core workflows; every reachable state (empty, loading, success, error/validation) implemented; dosing solver has unit tests with known input/output cases; compatibility engine has test cases proving distinct outputs for distinct bioload/aggression/allelopathy combinations; accessibility checked (not assumed) against the visual style; notification/BGTask permission denial degrades gracefully; data model is relational with stable identifiers.

**Decision rules for later phases:**
1. If a feature can't stay deterministic, explainable, and on-device, reduce or cut it before release.
2. If the compatibility seed data can't support real graph-style reasoning, fall back to a single-tank calculator without compatibility warnings, per the spec's own invalidation clause — don't fake depth.
3. When "make it look more sophisticated" conflicts with "keep it honest about what the math/data actually supports," honest and simpler wins — this overrides the parent portfolio's general complexity pressure, because the child app's own invalidation criteria is more specific.
4. If a design choice threatens accessibility or the app's visual distinctiveness, reject and iterate even if the logic underneath is otherwise complete.
5. Prefer a smaller, fully finished app over a broader, half-built one at every milestone.

## Product Research

Both Codex and Claude ended up painting the same picture, with Claude adding sharper technical and competitive specifics that reinforce rather than contradict Codex's read.

Where they agree: the real audience is experienced reef keepers running weekly test/dose routines who already own kits and dosing pumps — they'll tolerate a more technical, instrument-like UI in exchange for transparency, not a dumbed-down tracker. Both see the same competitive gap: existing tools (Apex Fusion, ProfiLux, BRS's one-shot web calculators, simple logging apps like Reef Companion) each cover only one piece — live sensor data, a single formula, or plain journaling — but none combine persisted trend history with a real solver and a real compatibility engine natively. Both agree the widget (days since last test / next dose) is the strongest native hook because it matches the actual weekly-forgetting failure mode, and both flag the same three risk categories: compatibility seed-data depth (real risk of becoming a "static list in a graph costume"), permission/adoption risk if users deny notifications or BGTask, and accessibility/contrast risk baked into the glow-on-near-black aesthetic.

Claude sharpened two things worth carrying forward as build-relevant findings rather than disagreements: first, a technical correction that BGTaskScheduler and UNUserNotificationCenter serve different jobs (background recompute vs. guaranteed-time user reminders) and the architecture phase needs to split them, not conflate them as the spec's wording implies. Second, a real open question about the Live Activity feature — a two-minute dose-and-log action may be too thin to justify a Live Activity, unless "dosing session" actually means a longer multi-step maintenance routine (water change + multiple doses + retest). Claude proposes this be pressure-tested in design/architecture and treated as the first thing to flex or cut if time is tight, while the six core workflows (test logging, dosing solver, trend charts, roster, compatibility warnings, reminders) stay the non-negotiable spine.

Nobody's contradicting anybody here — this reads as convergence with useful added precision, not an open fight.

CONSENSUS: YES

## Final Output

**Audience and use context:** Serious, weekly-testing saltwater reef hobbyists who already own test kits (Hanna checkers, Red Sea/Salifert) and often a dosing pump (Kamoer/GHL/Neptune Apex). They're comfortable with units, charts, and chemistry math, and will accept a more technical, precision-instrument UI in exchange for transparency and trust — this is not a casual lifestyle-tracker audience.

**Comparable apps/patterns:** Neptune Apex Fusion (controller-tied live data, no real dosing solver), GHL ProfiLux app, Bulk Reef Supply's static one-shot web dosing calculators (no persistence/trend history), and simple logging apps (Reef Companion, "My Reef") that record but don't compute. The gap Brinekeeper fills: nobody combines persisted trend history + a real deterministic solver + a real compatibility engine in one native, design-forward app.

**Platform-specific opportunities:** The home screen widget (days since last test / next dose due) is the highest-value native surface — it directly targets the "I test Sundays and forget mid-week" failure mode. BGTaskScheduler and local notifications are distinct tools with distinct jobs (background recompute of overdue status vs. guaranteed scheduled user reminders) and must be architected separately rather than treated as interchangeable. Live Activity's value is unproven for a ~2-minute single dose-and-log action — it earns its place only if "dosing session" means a longer multi-step maintenance routine (water change + multiple product doses + retest); this needs to be resolved explicitly in design/architecture rather than assumed.

**Major assumptions and risks:**
1. Users will tolerate (and want) extra taps for full calculation transparency rather than a one-tap black-box answer — assumed, not verified.
2. Compatibility seed data is the biggest credibility risk: real sourced bioload/aggression/allelopathy relationships for even 30–50 species is a genuine research task, and shortcutting it produces exactly the "static list in a graph costume" the invalidation criteria warns against — better to ship fewer, well-sourced relationships with visible "why this warning" reasoning than a padded shallow set.
3. Permission denial (notifications, BGTask) is a common, testable path, not an edge case — the core loop (log test → get dose → see warning) must work completely with every permission denied.
4. The bioluminescent glow/glass aesthetic is a real accessibility risk (contrast, Dynamic Type) that must be validated as a design-system constraint from day one, not patched in later.
5. Dosing chemistry itself is lower-risk than it sounds — published reef chemistry (Randy Holmes-Farley-style raise-per-dose formulas) is implementable as cited, testable stoichiometry against known input/output reference vectors, not something we're inventing from scratch.

**Implications for the first build:** Treat water-test logging + dosing solver + trend charts as the must-nail spine (valuable even single-tank/free-tier); treat the compatibility engine as the second pillar, scoped deliberately small-and-real rather than large-and-thin; keep the widget and permission-aware notification/BGTask split as core native investments; treat Live Activity as the one native feature to pressure-test for real justification first and flex/cut first if the build gets tight. Onboarding should be minimal (tank setup → one test → one dose → one livestock check) with explicit empty states guiding users into the loop rather than abstract dashboards.

## Portfolio Selection

Both Codex and Claude agree completely here, and honestly it's a quick one since two prior phases already settled the scope question.

The call: this is a single-app run, not a portfolio-parent execution. The routing metadata pre-selected `brinekeeper` as the slug, and the prior two phases (prompt contract, product research) already locked in "build Brinekeeper only, inherit the parent 3-app prompt as a quality bar, not a re-run of ideation." Both agents explicitly reject re-litigating the "generate 8 ideas, pick 3" instruction — that belongs to a different orchestrator run that already did the portfolio-level split; this execution's job is just to confirm single-app status and move to design/architecture for Brinekeeper.

Where they add color rather than disagree: Codex frames the risk as a build-discipline guardrail (compatibility engine must earn its "graph" label or fall back per the invalidation clause; dosing safety and glow-on-dark contrast can't be faked). Claude frames the same point through a concrete user persona (Dana, weekly tester, has actually killed livestock from a bad compatibility guess) and sharpens it into a build priority: the two core computations — "log a test → get a dose" and "check a species → get a warning" — matter more than the other four workflows, and Live Activity specifically shouldn't get build time before those two and the widget are solid, unless "dosing session" gets redefined in design as a longer multi-step routine.

No open disagreement — both land on the same selection and the same warning to carry forward.

CONSENSUS: YES

## Final Output

**Single-app vs. portfolio-parent decision:** Single-app. This execution is NOT a portfolio parent — no portfolio-json manifest and no sibling child projects are produced here. `PORTFOLIO_CHILD_PROJECT: true` with `Selected app slug: brinekeeper` in the routing metadata is a hard preselection already made upstream; the parent 3-app prompt is inherited only as quality bar/process context (design-first, complexity-required, local-first, uniqueness-vs-workspace), not as an instruction to select or build additional apps in this run.

**Selected app:**
- **Slug:** brinekeeper
- **Category:** Reef aquarium chemistry & livestock management
- **Promise:** Turns a water test into an exact dosing plan and warns you before a new fish or coral wrecks your tank.
- **Target user:** Serious saltwater reef aquarium hobbyists who test water parameters weekly and actively manage coral/fish stocking.
- **Build flag:** true (MVP build, priority 1)

**Selection rationale / rejected alternatives:** No alternative apps were considered or rejected in this phase — the app was pre-selected by upstream routing before this orchestrator run began, and re-running "generate 8 ideas, choose 3" here would contradict the explicit slug preselection and would duplicate work already completed in a separate parent-portfolio execution. Both agents independently confirmed this reading rather than treating it as ambiguous.

**portfolio-json manifest:** Not applicable — this is a single child-app execution, not a portfolio parent.

**Carried into next phase:** Treat the six v1 workflows as unequal in weight — the dosing solver ("log a test → get an exact dose") and the compatibility engine ("check a species → get a warning with a named mechanism") are the non-negotiable spine; trend charts, the widget, and reminders are retention layers on top of that spine. Live Activity remains the first feature to flex or cut if design/architecture can't justify it against a genuine multi-step maintenance-session use case (not a 2-minute single dose-and-log action).

## Initial Discussion

CONSENSUS: YES

Codex and Claude both walked in with basically the same shape and left having sharpened each other rather than argued. Codex nailed down the product contract in strategist terms — one promise, one user (Dana), a loop, and hard boundaries that lean hard on "deterministic or cut it." Claude took that same loop and pressure-tested it as actual screens, and in doing so surfaced two things Codex's version didn't have: a real correctness bug waiting to happen (if you log a second test the same day after already dosing, the solver needs to know a dose already went in, or it'll recommend stacking a second one and cause the exact overshoot the app exists to prevent), and a hard boundary on the livestock feature (it answers "what happens if I add this now," it does not become a stocking-plan simulator). Neither of these contradicts Codex — they're the kind of detail a design-level pass is supposed to catch before architecture locks in. Both also independently landed on the same free-tier principle: the free single-tank experience must be the real, complete loop, not a demo — paywall gates quantity (more tanks, more history) not quality of the core experience.

No open disagreement to hash out. Gemini didn't weigh in (CLI unavailable), so this is a two-way convergence, but it's a clean one.

## Final Output

**One-sentence product promise:** Log your water test, get the exact dose to fix it, and know before you buy whether a new animal will hurt what you already have.

**Primary user and scenario:** Dana — a serious reef keeper (e.g., 120-gallon mixed reef) who tests Ca/Mg/Alk/NO3/PO4 weekly, doses manually, and is willing to take a few extra taps in exchange for seeing exactly *why* the app recommends what it does, because a wrong answer costs her real money and living animals. She's done the hand-calculation and the "will these two animals fight" guesswork before, badly, and wants an instrument she can trust, not a wellness journal for fish.

**Core loop:** Open app → dashboard shows nominal status or a flagged parameter → log/update a water test (prefilled against last test as a diff baseline) → save routes directly into a dosing recommendation for whatever drifted (never a dead-end "saved" toast) → recommendation shows a collapsed answer that expands into a full trace (current → target → delta → product/concentration → computed volume → any safety cap applied and why) → recommendation is aware of doses already logged today against the same target, so it never stacks a second full dose on top of one already administered → separately: add/edit livestock roster → checking a candidate species returns a risk tier plus the *named mechanism* (bioload stacking, territorial aggression, chemical/allelopathic sting) not a generic severity label → trend charts and reminders sit on top of this loop as retention/habit layers, not separate destinations that compete with it.

**Hard scope boundaries:**
- Deterministic, on-device chemistry and compatibility logic only — no remote chemistry APIs, no LLM anywhere near dosing or compatibility, no photo/Vision strip capture in v1, no cloud sync, no backend-dependent paywall.
- If the compatibility seed data can't support real graph-style reasoning, the product scales back to a single-tank deterministic calculator and says so explicitly — it does not fake depth.
- The livestock feature answers one question only ("if I add this now, what happens against what's currently in the tank") — it is not a stocking-plan simulator or a future-roster recommender.
- Free tier must be the fully complete core loop (test → dose → compatibility check) on one tank — the paywall gates quantity (more tanks, longer history, larger compatibility graph, export), never a crippled version of the core mechanics.
- Live Activity and other native flourishes stay secondary to the spine (dosing solver + compatibility engine) and can be cut if they don't earn their place.

**Measurable success criteria:**
1. A complete test → dose-recommendation cycle works end-to-end, handling missing data, out-of-range values, and duplicate/same-day tests without crashing or silently double-dosing.
2. The dosing trace is fully inspectable from input values to final volume, with conservative caps that block dangerous single-step changes and a visible reason when a cap is applied.
3. Compatibility checks produce genuinely different risk tiers and named mechanisms for different bioload/aggression/allelopathy combinations — never a templated, interchangeable message.
4. From a cold dashboard, a user reaches an exact dose number in three taps or fewer; from the roster, a user gets a compatibility answer for a candidate species in two taps or fewer.
5. All four main destinations (Dashboard, Tests, Dosing, Livestock) have real, specific empty states naming the one next action that unlocks them, and remain fully usable with notifications/BGTask permissions denied.
6. No placeholder screens across any of the six v1 workflows.

## Per App Product Brief

CONSENSUS: YES

Codex and Claude landed in the same place here, with Claude's QA lens adding concrete, buildable specifics rather than any real pushback. Both describe the same Dana: a weekly-testing reef keeper on a mid-size mixed reef who already does this math badly in a spreadsheet, and both agree the bar isn't "better than nothing," it's "better than my spreadsheet" — which is a low UX bar and a brutal correctness bar. Both agree the core loop is one continuous routine (test → dose → apply → log-as-applied → roster/compatibility check), not disconnected screens, and both agree the wedge is the same one prior phases already locked: nobody else combines a persisted, auditable dose trace with a real compatibility-mechanism engine natively.

Where Claude sharpened rather than contradicted Codex: a concrete free/paid split (free = one tank, full loop, a ~15-20 species starter compatibility library, 90-day rolling trend view; paid = more tanks, full species library, unlimited history, export) with an explicit rule that the paywall caps *quantity/lookback*, never hides a user's own logged data — that's the line between a fair paywall and a dark pattern this audience would call out publicly. Claude also added three concrete edge cases that weren't in Codex's version but don't conflict with it: reject implausible sensor-typo values before they hit the solver, give first-time users a "no trend yet, dose against target only" state instead of a blank diff, and require an explicit confirm step before a tank delete cascades away dosing/compatibility history. And Claude added one real data-modeling requirement that needs to be locked before SwiftData models get written: a dose recommendation's trace must be stored as a permanent snapshot of the inputs it was computed from (not recomputed live from today's edited product/tank values when viewed later), plus UUID-based stable identifiers from day one for a clean future CloudKit path.

On growth, both agree this is niche/word-of-mouth via Reef2Reef/r/ReefTank/club Discords rather than viral mechanics — Claude explicitly argues against building share/referral features since a trust-sensitive livestock-safety tool would be damaged by growth-hacking gimmicks, and Codex's "safe check" idea is better read as an organic sharing behavior (screenshotting the trace/mechanism card) than a built-in feature to construct. That's a minor framing difference, not a disagreement to resolve — nobody is proposing to build referral mechanics either way.

## Final Output

**Target user and use case:** Dana — a serious saltwater reef keeper on a 60-180+ gallon mixed reef, testing Ca/Mg/Alk/NO3/PO4 weekly with a Hanna checker or Red Sea/Salifert kit, dosing two-part manually. She already tracks this in a spreadsheet or notes app and has been burned at least once by a bad livestock compatibility call. The bar to beat is "better than my spreadsheet" — low on UX friction tolerance (she'll take extra taps for transparency) but unforgiving on correctness (one visibly wrong number and she leaves, publicly, on Reef2Reef).

**Paid value and subscription value (functional, not cosmetic):**
- Free tier: one tank, the complete test-log → dose-recommendation → apply/log-as-applied loop, and compatibility checks against a starter library of ~15-20 commonly kept, high-conflict species (enough to prove the mechanism is real, not enough to cover a full stocking ambition). Trend charts show a rolling 90-day window.
- Paid tier: additional tanks, the full compatibility species library, unlimited trend history/lookback, and CSV export.
- Hard rule: the paywall caps *quantity and lookback window*, never hides or deletes a user's own logged data — data retention stays intact for free users; only the chart's visible range and the species library size are gated. Hiding someone's own water chemistry to force upgrade is treated as a dark pattern this audience would actively punish.

**Core loop:** Open app → dashboard shows nominal status or a flagged parameter → log a test (first-time users get an explicit "no trend yet, dosing against target only" state, not a blank diff) → implausible/typo values are caught and flagged before ever reaching the solver → save routes directly into a dosing recommendation with a full inspectable trace (current → target → delta → product/concentration → computed volume → any safety cap and why) → user applies the dose and explicitly logs it as applied (this state is required, not inferred, to prevent double-dosing against the same target) → separately: add a candidate species to the roster → compatibility engine returns a risk tier plus a named mechanism (bioload stacking, aggression, allelopathy) evaluated against current occupants only → trend charts, widget, and reminders sit on top of this loop as retention/habit layers.

**Competitive wedge:** No existing reef tool (Apex Fusion, ProfiLux, BRS's one-shot web calculators, plain logging apps) combines persisted, auditable dosing math with a real compatibility-mechanism engine in one native app. The wedge only holds if every dose recommendation stores a permanent snapshot of the exact inputs (parameter values, targets, concentration, tank volume, cap applied) it was computed from — never recomputed live against today's edited product/tank state when reviewed later. This is a data-modeling requirement to lock before SwiftData models are written, not a UI detail.

**Viral or niche growth angle:** Niche, word-of-mouth growth through Reef2Reef, r/ReefTank, and reef club Discords, driven by people organically sharing screenshots of the dosing trace card and the compatibility mechanism explanation because those look genuinely different from a spreadsheet or a BRS calculator screenshot. Deliberately no built-in referral/share-to-unlock mechanics — this audience is trust-sensitive about a tool managing livestock safety, and growth-hacking gimmicks would cost more trust than they'd gain. The message that spreads is "this app caught something my spreadsheet couldn't," told in a forum post, not engineered virality.

**Local-first and cloud-ready plan:** Everything (tanks, tests, products, roster, compatibility rules, dose logs, reminders) lives in SwiftData on-device; solver and compatibility engine run fully offline with zero network calls in the critical path — testable and demoable in airplane mode as a literal verification case. Entities use stable, sync-friendly identifiers (UUIDs) from day one specifically so CloudKit sync can be layered on later (per the spec's roadmap) without a data model rewrite or ID migration. Cloud is additive only — no v1 feature depends on it.

## Next Steps Small

Both agents converged on essentially the same slice, and it's a narrower, sharper cut than what portfolio_selection's language ("dosing solver + compatibility engine spine") might have implied — they're both saying build one parameter (Alk), one tank, and one small-but-real compatibility check, not five parameters and a broad roster. Codex framed it from the QA/safety angle (correctness at the edges: typos, same-day double-dose reconciliation, destructive-action confirmation), while Claude framed it from the "what actually proves the concept" angle (Alk alone generalizes the solver pattern; compatibility must ship in this very first slice, not deferred, because deferring it is exactly how it ends up shallow). These aren't in tension — Claude's cut list (no Mg/Ca/NO3/PO4, no multi-tank, no trend charts, no widget, no reminders, no Live Activity, no paywall) is a strict subset of what Codex also wants cut, and Codex's must-have interactions (validation before calc, applied-dose reconciliation, distinct compatibility outputs, confirm-before-delete) all still apply cleanly to Claude's narrower single-parameter version. The one difference — Codex scoped the test log to all five parameters (Ca/Mg/Alk/NO3/PO4) while Claude proposed narrowing to Alk-only for this slice — reads like a real, resolvable convergence point rather than a standoff, since both already agree "narrow breadth, not narrow pillars" is the right axis to cut on.

CONSENSUS: YES

## Final Output

**MVP slice:** One tank (volume + unit set at creation), one water-test parameter — **Alkalinity only** — logged and run through a real, cited stoichiometry formula (raise-per-dose for a named two-part alk buffer product with stated concentration) to produce a full, always-visible dosing trace (current → target → delta → product concentration math → volume-corrected dose → any safety cap and why). Paired with one compatibility check: a small fixed seed roster (8–10 real species, 2–3 already "in tank") where checking one candidate species returns a risk tier plus a named mechanism (bioload / aggression / allelopathy) — and swapping the candidate must change the answer in an explainable way. This is the whole slice: no other test parameters, no multi-tank, no trend charts, no widget, no reminders, no Live Activity, no paywall.

**Must-have interactions:**
- First-run flow: create the one tank (volume/unit) → log the first Alk test → get the dosing recommendation, in as few taps as possible.
- Input validation rejects implausible values (typo-range Alk readings) before they ever reach the solver, with explicit guidance, not a silent block.
- The trace is visible by default on first encounter (not collapsed) — the trace *is* the pitch the first time someone sees this app.
- "Apply dose" creates an explicit applied-dose log (amount/time/product), and any further recommendation for that tank/day/target accounts for doses already applied — no silent stacking/double-dosing.
- If a safety cap triggers, the UI shows the capped result and states plainly why escalation was blocked, rather than either refusing silently or auto-escalating.
- Compatibility check against the seeded roster returns a real tier + mechanism string per pairing, not a templated message — different candidates must produce genuinely different output.
- Destructive actions (delete test, delete tank) require explicit confirmation with a summary of what's being lost.
- Every included screen has real empty, loading, success, and error states — no placeholders.
- App is fully usable with zero network connectivity (no reminders/notifications/BGTask in this slice, so nothing to degrade).

**Cut list:** Ca, Mg, NO3, PO4 test parameters; multi-tank; trend charts; home screen widget; BGTaskScheduler/local notifications/reminders; Live Activity; StoreKit/paywall wiring; CSV export/import; CloudKit sync; onboarding beyond the minimum taps to reach the two workflows; any settings screen beyond editing the one tank's volume. All of these remain real v1 scope for later milestones — none are being dropped from the product, only deferred past this slice.

**Validation criteria:**
1. From fresh install, a user reaches a full Alk dose recommendation with trace in three taps or fewer after entering one test value.
2. The Alk dose recommendation matches what a reef keeper would hand-calculate for the same inputs (verified against known reference vectors) — same units, same output, every time (deterministic engine test).
3. Logging an applied dose and then re-running the solver against the same target on the same day reflects the already-applied dose rather than recommending a second full dose.
4. Swapping the compatibility candidate species between two different seeded animals produces two genuinely different risk tiers/mechanisms — not interchangeable text.
5. All included screens (tank setup, test log, dose recommendation/trace, applied-dose log, compatibility check) have working empty, loading, success, and error states.
6. Deleting the tank or a test entry always requires explicit confirmation naming what will be lost, and never happens silently via cascade.
7. The full loop works completely offline with no network calls in the critical path.

## Detailed Discussion

Good news — despite Claude's round 2 framing suggesting Codex "brushed past" the hard questions, when I actually line up the two texts side by side, Codex answered all eight points concretely, and on the substance the two agents landed in the same place on seven of them. The one genuinely unresolved thread is what "reactor mode" actually means architecturally.

Here's the real state of play:

- **Cross-parameter interactions**: agreed — solver stays per-parameter in v1, but the UI must explicitly surface that same-day multi-parameter stacking isn't modeled, with a stagger recommendation. No silent gap.
- **Units/volume**: agreed — `netSystemVolume` as its own labeled field (not generic "tank size") with explicit unit picker for dKH/meq-L/ppm-CaCO3 and inline guidance not to use display-tank size.
- **Cascade delete**: agreed — no silent cascade ever; deletion confirmations must name exactly how many applied-dose logs and recommendation snapshots are being destroyed.
- **Pairwise vs. aggregate compatibility**: this is actually resolved, not open — both landed independently on the same hybrid model: aggression/allelopathy are pairwise rule-table edges with named mechanisms, bioload is additive (sum of roster + candidate load vs. a volume-derived capacity threshold). Claude's round-2 message reads as still pushing on this, but it's asking for the same architecture Codex already proposed — this should be locked as the answer, not left open.
- **Live vs. snapshot for compatibility**: agreed — compatibility checks stay live against current roster state (never frozen like the dose trace), with a small separate `CompatibilityDecision` audit event (timestamp + input snapshot + tier/mechanism) recorded at the moment a species is added, so there's still a "you were warned" record without freezing the live answer.
- **Species-deletion snapshotting**: agreed — historical compatibility logs store name strings at event time, not live foreign keys.
- **Telemetry**: agreed in substance, just needs the stronger phrasing locked — this becomes a hard "not permitted" constraint (zero telemetry, zero crash reporters, zero third-party SDKs, zero network calls anywhere in v1), not merely "not required."
- **Uninstall data loss**: agreed — Codex explicitly committed to a free, paywall-exempt local JSON export/import via the share sheet as a safety net, which directly answers Claude's either/or ask.

The one loose thread: Codex's "reactor mode" language never got pinned down as either (a) just better UI framing for the existing stateless applied-dose-log check, or (b) a new stateful session entity. Nobody explicitly confirmed which one it is, and Claude flagged this as something not to let slide into scope creep by default. Given prior-phase discipline (Live Activity and anything session-like was already flagged as first-to-cut, and the global rule favors smaller finished apps over speculative architecture), the consistent call is: reactor mode is descriptive language only, implemented entirely by the existing stateless check ("has an applied dose been logged for this tank/parameter/target today") — no new session lifecycle object. I'm resolving it that way since it's the only reading consistent with everything already decided, and naming it explicitly so it doesn't quietly reappear as a bigger feature later.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
1. Dosing solver remains per-parameter (no modeled cross-parameter chemistry interaction in v1), but this is a disclosed limitation, not a hidden one — the dose card surfaces an explicit notice when multiple parameters are due for correction the same day, recommending staggered dosing rather than same-day stacking.
2. Tank volume is captured as a dedicated `netSystemVolume` field (never a generic "tank size"), with an explicit unit picker and inline guidance instructing users to enter actual water volume, not display-tank size printed on the glass.
3. Alkalinity supports all three hobbyist units in active use — dKH, meq/L, ppm as CaCO3 — with explicit, non-silent unit selection; no inferred/defaulted unit without user confirmation.
4. Deletion of a test or tank that has associated applied-dose logs or recommendation snapshots is always blocked from silent cascade — the confirmation dialog explicitly names the count of applied-dose entries and snapshots that will be destroyed.
5. The compatibility engine uses two distinct evaluation paths combined into one result, not a single generic score: a **pairwise rule table** (keyed by species pairs, each edge carrying a named mechanism — aggression or allelopathy) for interpersonal risk, and an **additive bioload model** (per-species bioload point values summed across current roster + candidate, checked against a capacity threshold derived from net system volume) for ecological load. This is the concrete architecture to hand to the next phase — it directly prevents the "five individually-fine fish collectively overload the tank" blind spot a pure pairwise model would miss.
6. Compatibility check results are always computed live against current roster state — never frozen/snapshotted as the "current answer." A separate, small `CompatibilityDecision` audit record (timestamp, input snapshot, resulting tier(s), mechanism string(s)) is persisted at the moment a candidate is added to the roster, preserving "what you were warned about at that moment" without freezing the live decision logic itself.
7. Dose recommendation traces remain permanently frozen snapshots of their exact inputs at computation time (already-settled prior-phase decision, reaffirmed here) — this is the deliberate asymmetry against point 6: dose math is evidence and must never silently recompute against edited state; compatibility is policy and must always reflect current roster truth.
8. Historical compatibility logs store species **name strings** at event time, not live foreign keys, so a later species deletion doesn't produce dangling references in old warnings.
9. "Reactor mode" / same-day dose awareness is implemented entirely as a stateless check against existing applied-dose logs ("has a dose already been applied for this tank/parameter/target today") — explicitly not a new stateful session entity with its own lifecycle. This keeps it consistent with the prior-phase decision to treat Live Activity and session-like constructs as the first things to cut if unjustified.
10. Free tier includes a manual, local-only JSON export/import (share sheet, no cloud) as a paywall-exempt trust safety net against uninstall/reinstall data loss. Paid tier can layer richer export formats later, but this baseline is not gated.

**Edge cases:**
- Same-day, same-target test logged twice after a dose was already applied — solver must read the applied-dose log and avoid recommending a second full dose.
- Implausible/typo-range Alk value entered — rejected before reaching the solver, with actionable guidance (not a silent block).
- First-ever test for a tank — explicit "no trend yet, dosing against target only" state, not a blank diff.
- Test entry deleted or edited after an applied-dose log references it — deletion blocked/confirmed explicitly, never silently cascaded.
- Tank deleted while it has dosing history and compatibility decisions — confirmation must summarize everything being lost, not just the tank record itself.
- A tank's roster collectively overloads bioload capacity even though every individual pairwise check is clean — must be caught by the additive bioload path.
- A species referenced in a historical compatibility decision is later deleted from the seed/roster data — old logs must still render coherently via the stored name snapshot.
- User edits tank volume or a product's concentration after a dose was already logged — past dose traces must not silently recompute using the new values.
- Multiple parameters simultaneously out of range on the same day — UI discloses that cross-parameter interaction isn't modeled and recommends staggering.

**Data and privacy implications:**
- Zero telemetry, zero crash-reporting SDKs, zero third-party analytics, and zero network calls anywhere in v1 — this is now a hard "not permitted" constraint, not merely "not required," precisely so nothing gets added later under the banner of "just diagnostics."
- All tank, test, dose, roster, and compatibility-decision data lives entirely in local SwiftData with no transmission off-device.
- The one explicit user-initiated exception to "everything stays local silently" is the manual JSON export/import feature — user-triggered only, via the system share sheet, never automatic or cloud-backed.
- Species and compatibility data, while low-sensitivity in the abstract, still constitute a full local behavioral/financial log of the user's hobby and should be treated with the same care as any personal data store even without third-party exposure.

**Risk register:**
- *Bioload blind spot if compatibility engine is built pairwise-only* — mitigated by the locked hybrid architecture (pairwise for behavior, additive for bioload) from requirement 5.
- *Compatibility engine reading as a "static list in a graph costume"* — mitigated by requiring every result to carry a named mechanism per dimension (aggression/allelopathy/bioload), not a generic tier, consistent with the invalidation criteria already agreed in earlier phases.
- *Dose math corrupted by wrong volume or mismatched units* — mitigated by the dedicated `netSystemVolume` field with explicit guidance and non-inferred unit selection.
- *Silent data loss on cascade delete* — mitigated by blocking, dependency-naming confirmations on any delete touching applied-dose logs or recommendation snapshots.
- *Trust erosion from apparent overconfidence on unmodeled cross-parameter chemistry* — mitigated by explicit same-day multi-parameter disclosure and stagger guidance rather than staying silent.
- *Free-tier data loss on uninstall/reinstall damaging trust with exactly the precision-focused audience this app targets* — mitigated by shipping a free, local JSON export/import safety net rather than leaving this as an unaddressed gap or a paywalled feature.
- *"Reactor mode" language drifting into unplanned stateful session architecture* — mitigated by explicitly scoping it as UI framing over the existing stateless applied-dose-log check, named here so it doesn't reappear as scope creep during implementation.
- *Niche audience ceiling* — named limitation, not mitigated (accepted, per portfolio-level context); not a build risk, a market-size risk out of scope for this phase.

**Final assumptions:**
- The Alk-only, single-tank MVP slice from `next_steps_small` remains the near-term build target; the resolved requirements above apply to it now and to the full five-parameter, multi-tank v1 later without requiring architectural rework.
- Compatibility seed data will be built to support the two-path (pairwise + additive) model from the start, even at small scale (8–10 species), rather than seeding a flat list and retrofitting the split later.
- CloudKit sync remains explicitly out of scope for v1; today's local-only, export-capable design is deliberately compatible with adding sync later without a data model rewrite.
- No settings/feature in v1 depends on network connectivity, notification permission grants, or BGTask permission grants for its core function — the two-pillar loop (dose recommendation, compatibility check) must be fully usable with every optional permission denied.

## App Features

CONSENSUS: YES

They actually landed the plane this round. Codex came in and explicitly conceded the framing fight — agreed that "must" for this phase means "non-negotiable to ship in v1," not "coded in the first milestone" — and then rebuilt the must-have list around that lens: multi-tank capability boundaries (data model + gated add-tank flow) back in as must, all five parameters loggable with NO3/PO4 explicitly kept as log/trend-only with a visible "not modeled yet" state rather than disappearing, local notifications back in as must (deliberately split apart from BGTask, which stays should), and entitlement gate-check logic (boolean capability checks for tank count/species library/history window) back in as must. Claude's round-3 message reads as a direct response confirming each of those four placements matches what it was asking for, with one small but real sharpening: multi-tank-as-must should be understood narrowly (data model support + a gate check, not a cross-tank dashboard), and entitlement-as-must means the if-statements and their wiring, not StoreKit purchase UI or live products. Neither of those caveats contradicts anything in Codex's list — they're clarifying scope inside an already-agreed bucket, not reopening the argument. Accessibility-as-cross-cutting-must and reactor-mode's stateless definition were already settled in round 2 and both sides restated them unchanged here. The should/could/won't lists were never actually in dispute and stayed stable across all three rounds.

## Final Output

**Shared definition used for this MoSCoW:** "Must" = must exist in some real, non-placeholder form in shipped v1 (per the production-readiness bar already locked in `prompt_contract` — no placeholder screens on any of the six core workflows). This is distinct from build sequencing: the Alk-only, single-tank slice from `next_steps_small` remains the first thing built, but that's an implementation-order decision, not a scope decision — everything below is genuinely must-have for the *product*, whenever it lands in the build sequence.

---

### Must-have features

1. **Tank setup with multi-tank capability boundary**
   *Story:* As a reef keeper, I set up my tank(s) with an explicit net system volume so every downstream calculation uses accurate values, and the app knows whether I'm allowed to add another tank.
   *Acceptance criteria:* `netSystemVolume` is its own labeled field (never "tank size") with an explicit unit picker and inline guidance against using display-tank gallons; blocks empty/non-positive volume. Data model supports N tanks from day one. Free tier is gated to 1 tank via a `canAddTank` entitlement check; attempting tank #2 on free is blocked with an upgrade prompt — never silently allowed, never silently hidden.

2. **Water-test logging for all five parameters (Ca, Mg, Alk, NO3, PO4)**
   *Story:* As a reef keeper, I log any of my five weekly test results so I have one complete chemistry record instead of a spreadsheet.
   *Acceptance criteria:* all five parameters are loggable; implausible/typo-range values (e.g., Ca as 4200, Alk as 82 dKH) are rejected before reaching the solver with specific, actionable guidance — not a generic "invalid input"; Alk supports dKH/meq-L/ppm-CaCO3 with explicit, non-inferred unit selection; a tank's first-ever test shows an explicit "no trend yet, dosing against target only" state.

3. **Ca/Mg/Alk deterministic dosing solver with full trace and safety caps**
   *Story:* As a reef keeper, I get an exact, explainable dose for Ca/Mg/Alk so I never guess or overshoot.
   *Acceptance criteria:* each recommendation persists an immutable snapshot of its exact inputs and output; trace shows current → target → delta → product concentration math → volume-corrected dose → cap rationale when a cap applies; editing tank volume or product concentration later never changes a past recommendation's displayed trace; same input vector always returns the same output.

4. **NO3/PO4 logging and trend, with explicit "no dosing model" state**
   *Story:* As a reef keeper, I log and trend NO3/PO4 and know clearly whether the app can recommend a dose for them yet.
   *Acceptance criteria:* NO3/PO4 log and chart identically to the other three parameters; the dose-recommendation surface for these two explicitly states a reduction-dosing formula isn't modeled yet, rather than omitting the parameters or fabricating a raise-formula number for them.

5. **Applied-dose logging and same-day reconciliation ("reactor mode")**
   *Story:* As a reef keeper, I mark a dose as applied so the app never recommends a second dose against the same target the same day.
   *Acceptance criteria:* saving a test alone never creates an applied-dose record — it's an explicit, separate "log as applied" action capturing amount/time/product; any later recommendation for the same tank/parameter/target that day reads the applied-dose log and adjusts or withholds accordingly; implemented purely as a stateless query against existing logs — no new session/lifecycle entity.

6. **Compatibility engine — pairwise + additive bioload, evaluated live**
   *Story:* As a reef keeper, I check a candidate species against my current roster and get a real risk tier with a named mechanism, not a canned message.
   *Acceptance criteria:* pairwise rule table (8–10 seeded species) covers aggression/allelopathy with a named mechanism per edge; a separate additive bioload model sums roster + candidate load against a volume-derived capacity threshold; swapping the candidate species changes the result in an explainable way; a roster that's pairwise-clean can still trigger a bioload warning; results are always computed live against current roster state (never frozen); a `CompatibilityDecision` audit record (timestamp, input snapshot, tier, mechanism, species **name strings** not live foreign keys) is persisted at the moment a species is added.

7. **Destructive-action transparency**
   *Story:* As a reef keeper, I never lose dosing or compatibility history by accident.
   *Acceptance criteria:* deleting a tank or test with dependent applied-dose logs, recommendation snapshots, or compatibility decisions is blocked from silent cascade; the confirmation dialog names exact counts of everything that will be destroyed.

8. **Free local JSON export/import safety net**
   *Acceptance criteria:* export captures all entities with stable UUIDs; import validates schema with recoverable error messages; a full uninstall → reinstall → import cycle preserves all data and identifiers; paywall-exempt.

9. **Local notification reminders (UNUserNotificationCenter only)**
   *Story:* As a reef keeper, I get reminded when my next test is due.
   *Acceptance criteria:* a local notification is scheduled off the next-test-due date; the core test→dose→compatibility loop is fully usable with notification permission denied — this is a literal, run test, not an assumed degradation path; no BGTaskScheduler dependency required for this must-have.

10. **Entitlement gate-check logic (boolean checks, not live purchases)**
    *Acceptance criteria:* testable gate functions exist for tank count, compatibility species-library size, and trend-history window; each gated surface is verified with the entitlement flag flipped both on and off, confirming no feature leaks free↔paid in either direction. No live App Store Connect products or purchase UI required for this must-have.

11. **Zero-network, zero-telemetry, zero third-party SDK enforcement**
    *Acceptance criteria:* the full app is demonstrably usable in airplane mode; no analytics, crash-reporting, or network calls exist anywhere in v1, in the critical path or as a side channel.

12. **Cross-cutting accessibility and complete state coverage**
    *Acceptance criteria:* WCAG AA contrast verified on glow-on-dark glass cards, Dynamic Type support, VoiceOver labels, and 44pt tap targets across every reachable screen; every included screen (tank setup, test log, dose trace, applied-dose log, compatibility check, delete confirmations) implements real empty, loading, success, and error states — no placeholders.

### Should-have

- Home screen widget (days since last test / next dose due) with BGTaskScheduler-driven overdue-status recompute — only meaningful once reminders are enabled; the widget can fall back to recomputing on next app launch if this slips.
- Richer trend analytics beyond the baseline chart (drift-rate signals, multi-week comparison).
- CSV export for paid tier, as a superset of the free JSON safety net.
- Full compatibility species library for paid tier (vs. the free ~15–20 starter set).
- NO3/PO4 dosing-recommendation model, once a validated reduction-dosing formula exists — until then, item 4's fallback state stands.
- Support for multiple named products per parameter, rather than one seeded default.
- Premium onboarding polish (a tightened, delightful first-test-to-first-dose micro-journey).

### Could-have

- Live Activity for a dosing session — only if "session" is formally redefined as a multi-step maintenance routine (water change + multiple doses + retest), per the still-open question from earlier phases; otherwise stays cut indefinitely.
- Custom user-defined target ranges per species/coral type beyond seeded defaults.
- Additional export formats/destinations beyond CSV.
- Expanded compatibility-library onboarding UX and extra species metadata.
- Motion/microinteraction polish beyond what's needed for safety-critical states.

### Won't-build

- Any LLM or external chemistry/compatibility API involvement — chemistry and compatibility logic must stay deterministic and fully on-device.
- Vision/photo test-strip colorimetric reading in v1.
- CloudKit sync or any backend/cloud path; shared/club tank profiles.
- Any telemetry, crash-reporting, or third-party analytics SDK.
- A modeled cross-parameter chemistry interaction engine (e.g., Ca+Alk precipitation risk) — disclosed as a named limitation with stagger guidance instead of computed.
- A livestock stocking-plan simulator or future-roster recommender — the compatibility feature only ever answers "what happens if I add this now."
- Referral or share-to-unlock growth mechanics.
- Live, payable App Store Connect products or purchase UI in this build cycle.
- Expanding the free-tier compatibility species library "as a bonus" — this is the paywall's primary lever and stays gated.
