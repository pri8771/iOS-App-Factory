# crux-cycle — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

CONSENSUS: YES

Only one voice actually weighed in this round — Codex and Gemini both bounced due to CLI/auth issues — but Claude's pass is thorough and hits every required element of the phase (preserved prompt, hard requirements, non-goals, production-readiness bar, decision rules), and there's no disagreement to resolve since nobody else was able to push back. The core call — that "which app to build" is already locked by the parent portfolio process and this phase should not re-litigate it — is clearly correct given the input structure, so there's nothing substantive left to hash out. Calling this settled rather than burning rounds waiting on CLIs that aren't coming back.

## Final Output

**Original prompt** is preserved verbatim above (the full initial_prompt.md content, including the parent portfolio prompt). Nothing here overrides it — this is just the read on what it locks in and what it leaves open.

**What's already decided (not open for debate in later phases):** This project builds exactly one app — Crux Cycle, Health & Fitness, "structured periodization and rest-day enforcement for boulderers and route climbers." The upstream 18-candidates-then-pick-9 ideation step belongs to the portfolio level and is already resolved; nobody downstream should re-open "should this be a different app."

**Hard requirements:**
- Working local-first SwiftUI MVP, real domain logic — not a static calendar skin. Must include: session logging (boulder/route grades, attempts, sends), a rolling training-load computation, spike/overload detection, and a rest-vs-train recommendation that's actually computed from logged data and changes when load changes.
- "Rest-day enforcement" = soft-gating with override (surface risk, adjust recommended intensity, require an acknowledgment tap to bypass) — never a literal lock-out. The app cannot honestly claim to be unbypassable, so don't market it that way.
- Local persistence must survive relaunch, backgrounding, and permission-denied states (e.g., no HealthKit) without crashing or losing data. No cloud sync required for MVP, but nothing should be architected in a way that blocks adding it later.
- Monetization must be architected around recurring computed value (adaptive load recalculation, multi-discipline periodization, coaching/export reports) — not a cosmetic or one-time unlock. The MVP needs the free/paid boundary wired up architecturally even if full StoreKit isn't built out.
- Standard portfolio bar applies: premium design feel, real end-user value, better than existing recovery/training-load competitors in some concrete way, empty/loading/success/error states everywhere reachable, own project folder (one folder per app, not commingled with siblings).

**Non-goals:**
- No medical/diagnostic framing or language — no "you have tendinopathy," no clinical injury diagnosis. Everything reads as training-load guidance / wellness insight, same discipline the parent prompt demands of the actual Medical apps, applied here defensively even though Crux Cycle is Health & Fitness.
- No hard-blocking of workouts or logging — the app can never literally prevent a user from recording a climb.
- No re-deciding the app concept, category, or target user in later phases.

**Production-readiness definition:** No crashes across empty/loading/error/permission-denied states; data persists correctly across app restart and low-storage conditions; the rest/train decision logic is real and testable, not hardcoded; and before anyone calls it done, a manual pass has actually happened — log sessions, force a high-load week, confirm the rest recommendation changes in response. Compiling and showing mock data does not count as done.

**Decision rules for later phases:** Check every downstream output (design, architecture, implementation, build) against: (a) enforcement stays soft-gated with override, (b) no medical/diagnostic language, (c) real training-load computation drives the UI rather than a static skin, (d) local-first persistence is reliable with an explicit deferred path to cloud sync, (e) any paywall ties to recurring computed value. If a later phase wants to add real medical injury scoring or a hard lockout, that's a deviation from this contract and must be flagged explicitly, not quietly folded in.

## Initial Discussion

CONSENSUS: YES

Same story as last phase — Codex and Gemini both bounced (CLI/auth issues), so it's really just Claude thinking this through solo. But the pass is solid and hits every box the playbook asks for: a tight one-sentence promise, a specific primary user, a concrete core loop with the override-writes-back detail called out as the thing QA needs to be able to test, a clear list of what's explicitly out of scope, and success criteria that are actually checkable by poking at a running app rather than vibes. There's no disagreement to resolve since no one else weighed in to push back, and the reasoning is internally consistent with the locked prompt contract from the prior phase. Worth carrying forward as a flag rather than a fight: the "single normalized difficulty scale across bouldering and route grades" call is a real design decision that architecture/design phases need to respect, not just a throwaway detail.

## Final Output

**One-sentence product promise:** Crux Cycle turns your logged climbing sessions into a rolling training-load picture and gives you a rest-vs-train recommendation you can see the reasoning behind — not a black-box badge, not an auto-generated long-term training plan.

**Primary user & scenario:** A boulderer or route climber who trains 2–5x/week, already knows their grades, and is worried about overtraining or plateauing (not a total beginner, not a coached competitive athlete needing a dashboard). The moment that matters: they log a session in under a minute right after climbing, and before their next session they check whether today should be a hard day, an easy day, or a rest day.

**Core loop:** Log session (discipline, grades attempted, sends, subjective effort) → rolling training load recalculates (acute vs. chronic load) → rest/train recommendation updates with visible reasoning ("7-day load is 40% above your 28-day average") → user follows it or taps through an acknowledgment to override → the override itself gets written back into the model (not a dead-end tap) → next session feeds the same loop again.

**Hard scope boundaries (v1):**
- No HealthKit-driven load blending (HR/sleep/strain) — manual logging only; HealthKit read is optional future enhancement, never a dependency.
- No route photos/video/beta notes — that's a journal app, not this one.
- No social features, leaderboards, or sharing.
- No coach/multi-user accounts, no cloud sync (already settled upstream).
- No auto-generated future macrocycle/periodization plan — periodization blocks are a labeling/visualization layer over real logged load history, not a predictive planner, in the MVP.
- Single internal normalized difficulty scale across bouldering (V-scale) and route grades (YDS/French) so mixed-discipline training still produces one coherent load line — this is a load-bearing architecture decision, not a detail to relitigate later.

**Measurable success criteria:**
- Logging a session takes under 60 seconds.
- Simulating a high-volume/intensity week visibly shifts the recommendation toward rest within the same test pass.
- Load numbers and the recommendation are shown together — reasoning is visible, never a bare badge.
- No logged session is ever lost across force-quit, backgrounding, low storage, or denied permissions.
- Overriding a rest recommendation doesn't crash anything and the override is recorded, not silently dropped.

## Per App Product Brief

CONSENSUS: YES

Same pattern as the last two phases — Codex is in cooldown and Gemini's CLI is still broken, so it's just Claude's take this round. But it's a complete, specific pass that hits every box the playbook asks for: a named target user (not "climbers" but a specific mid-grade boulderer persona), a free/paid split where the paid tier is genuinely more valuable the longer you use it (multi-discipline load separation, retroactive periodization labeling, pattern-language digests, coach export) rather than a cosmetic unlock, the core loop reconfirmed from the locked initial_discussion, a clear competitive wedge (climbing-specific load math + visible reasoning vs. black-box wearable-strain scores), a niche-appropriate growth angle (shareable load/periodization charts in climbing gym communities and forums, not broad virality), and a local-first plan with a concrete cloud-readiness hook (UUID identity, UTC timestamps) that costs nothing now but avoids a rewrite later. Nothing here contradicts the locked prompt contract or initial discussion — it builds on both. There's no second voice to disagree with, but there's also nothing shaky in the reasoning that needs a challenge; it's internally consistent and specific enough to hand to design.

## Final Output

**Target user & use case:** A self-aware intermediate/advanced boulderer or route climber (e.g., V4–V6, training 3–4x/week, has had a minor overuse injury before) who already informally tracks sessions and wants to know, with visible reasoning, whether today should be a hard day, easy day, or rest day. Not a beginner who doesn't know grades, not a sponsored athlete with a coach.

**Paid value / subscription value ("Crux Cycle Pro," ~$6.99/mo or $39.99/yr):**
- Free: log sessions, see current 7-/28-day load and the basic train/rest recommendation with its one-line reasoning.
- Paid: separate load lines per discipline (bouldering vs. route, not blended into one number), retroactive periodization-block labeling over your real history, a weekly pattern-language digest (e.g., "you peak 48hrs after rest, not 24hrs"), and CSV/PDF export for a coach.
- The value compounds with accumulated history — a user with a year of data gets meaningfully more out of Pro than a user with a week — which is what makes this a real subscription, not a skin.

**Core loop:** unchanged from initial_discussion (log → recompute load → recommendation with visible reasoning → follow or override → override writes back into the model). New commitment added this round: the first ~2 weeks need an honest, clearly-labeled "still calibrating" state with provisional guidance — never a blank screen or a fake-confident number — because losing the user before the model has enough history to say anything interesting kills the product before Pro features are ever seen.

**Competitive wedge:** climbing-specific, grade-and-attempt-weighted load math with zero wearable/HealthKit dependency, and the reasoning always shown in plain language next to the number — directly opposed to the Whoop/Oura-style black-box recovery score that doesn't know the difference between finger-intensive bouldering load and easy route mileage.

**Growth angle:** niche, not broad-viral — one well-designed, shareable screen (load trend chart / weekly summary card) built explicitly for export, aimed at climbing gym community boards, Instagram micro-influencers, and forums/Discords where posting your training data is already a normal thing to do.

**Local-first & cloud-ready plan:** no login, no signal required, first session logged within 30 seconds of first open; everything (sessions, computed load snapshots, override history) lives in on-device persistence (SwiftData) with the recommendation engine as a pure function over local history. Data model uses UUIDs and UTC timestamps from day one specifically so a future CloudKit or custom sync layer can be added additively later without a migration rewrite — a hard rule for architecture, not a suggestion.

**Open flag carried forward (not blocking consensus):** design and architecture phases must protect the "reasoning always visible" requirement as the core trust mechanism that justifies charging for Pro — if a later phase ships a bare score/badge without the visible why, that's a deviation from this brief and should be flagged, not quietly shipped.

## Detailed Discussion

CONSENSUS: YES

Same pattern as every phase so far — Codex is still in cooldown and Gemini's CLI still won't authenticate, so this is Claude's solo pass again. But it's a genuinely thorough stress-test that walks through the ambiguities most likely to bite in real usage (not cosmetic ones), resolves each with a concrete decision rather than punting, and covers every category the playbook asks for: resolved requirements, edge cases, data/privacy implications, and a risk register with named limitations. Nothing here contradicts the locked contract, initial discussion, or product brief — it tightens them. One item was left as "needs a rule" without picking the rule (ambiguous slash-grades like V4/5 or 5.10a/b) — I'm resolving that now rather than kicking it to another round, since it's a small, low-stakes call: log a single grade only, no slash/range entry, to protect the under-60-second logging promise and keep the data model simple.

## Final Output

**Resolved requirements:**
- **Gate mechanics:** the rest-day gate is a dismissible banner/card shown on app open when the computed recommendation is "rest" — never a blocking modal. It clears for the day when the user either taps an explicit "I understand, I'm training anyway" acknowledgment, or logs a session (which itself counts as the override and gets tagged on that session record). It does not re-interrupt mid-session or reappear later the same day.
- **Calibration floor:** fewer than 14 days of logging history → UI shows raw load numbers with an explicit "still calibrating" state and no ratio-based train/rest recommendation. Past 14 days, the real acute:chronic recommendation turns on. This is a hard, concrete cutoff — not left to whoever builds it.
- **Detraining/return-to-training spikes are intentional:** after a gap, the chronic baseline decays and a return session reads as proportionally higher relative load. This is correct, expected behavior, described in training-load terms only — never "injury risk" language.
- **Load formula:** `load = normalized_grade × attempt_count × discipline-specific multiplier`, explicitly documented as a tunable heuristic ("training-load estimate"), not a precise measurement. The internal normalized cross-discipline index is invisible plumbing — it is never shown to the user as a grade-equivalence claim (e.g., never "this route = V5"); raw logged grades are always what's displayed.
- **Session model:** one session entry per gym visit can contain multiple discipline-tagged sub-entries (e.g., boulder block + route block in one visit), preserving the under-60-second logging promise while still enabling accurate per-discipline load lines for Pro.
- **Edits/deletes vs. data loss:** intentional user edits/deletes are a supported feature, not the thing the "no session ever lost" criterion protects against. Any edit, delete, or backdated entry must trigger a full recompute of every downstream rolling window and recommendation snapshot that depended on it — not just an append-only forward patch.
- **Grade entry rule (resolved this round):** grade logging accepts a single discrete grade only — no slash/range entries (no "V4/5" or "5.10a/b" as one logged value). This keeps the picker simple and keeps logging fast; a climber unsure between two grades picks one at logging time.
- **Debug-only seeding path:** the build must include a non-user-facing way to seed multi-week synthetic history, since manually tapping 20+ sessions across 28 days to verify "does the recommendation shift under load" isn't sustainable as a real verification practice.

**Edge cases enumerated:**
- New-user zero-baseline (divide-by-zero) → handled by the 14-day calibration floor.
- Long training gaps → handled as an intentional chronic-baseline decay, not a bug.
- Mixed-discipline single visit → handled by sub-entries within one session.
- Backdated/edited/deleted sessions → must recompute all affected windows, not just go-forward state.
- Ambiguous/slash grades → resolved: single discrete grade only, no ranges.
- Gym-to-gym / region-to-region grade inconsistency → not solved, named as an accepted limitation (v1 takes logged grades at face value, no gym-specific calibration).

**Data & privacy implications:**
- No HealthKit, no accounts — small permission surface by design.
- Push notifications / rest-day reminders are explicitly **excluded from v1 scope** — an assumption, not a silent build decision — because a nagging notification scheme directly undermines the "honest, non-punitive enforcement" promise from the prompt contract.
- The on-device store must **not** be excluded from standard encrypted device/iCloud backup — since there's no cloud sync in v1, backup is the only disaster-recovery path for a user's training history, and marking it backup-excluded would silently reintroduce the "lose your phone, lose your history" risk already flagged upstream.
- CSV/PDF coach export (Pro) goes through the standard user-driven share sheet only — no silent background upload, user can see file contents before sending.
- Accessibility requirement: VoiceOver must speak the actual reasoning line (e.g., "your 7-day load is 40% above your 28-day average"), not just a bare number or picture alt-text — this is the same trust mechanism the product brief flagged as non-negotiable, applied to assistive tech specifically.

**Risk register:**
- *Gym/region grade inconsistency distorts load math* — accepted limitation for v1, stated plainly, not treated as a bug to chase.
- *Naive backdated-edit implementation silently corrupts downstream windows* — mitigated by the explicit recompute-on-edit requirement above.
- *Manual verification of load-shift behavior doesn't scale and quietly stops happening* — mitigated by requiring a debug-only history-seeding path.
- *A build phase invents its own notification/reminder scheme* — mitigated by naming notifications as excluded scope now, not left implicit.
- *Excluding the data store from backup "for cleanliness"* — mitigated by stating explicitly that it must remain backed up.

**Final assumptions carried into design/architecture:**
- Gate = banner, not modal; clears via acknowledgment or same-day logging.
- 14-day calibration floor is the fixed threshold for "enough history to recommend."
- Load formula includes a discipline-specific multiplier, not just normalized_grade × attempts, and is documented as a heuristic.
- Single-session, multi-discipline-sub-entry logging model.
- Single discrete grade entry, no slash/ranges.
- No notifications in v1; device backup stays enabled; export is user-driven only.
- A debug-only data-seeding mechanism is in scope for the build, even though it's not user-facing.

No major ambiguity remains that would block design or architecture from proceeding.

## App Features

CONSENSUS: YES

Same pattern as every prior phase — Codex is still in cooldown and Gemini's CLI still won't authenticate, so this is Claude working solo again. But the pass is complete and disciplined: it doesn't just list features, it forces the one real prioritization call this phase needed (does "structured periodization" have to show up for free, or can it hide entirely behind the Pro paywall) and resolves it with a stated tradeoff instead of burying it. Every must-have comes with a concrete, poke-the-running-app verification method rather than a vague "should work" — which is exactly what the phase rules ask for (user story + acceptance criteria per must-have). The must/should/could/won't split is a real cut, not padding, and nothing here contradicts the four already-locked upstream phases. There's no second voice to create friction, but there's also nothing shaky enough in the reasoning to need a challenge, so calling it settled rather than waiting on CLIs that haven't come back all phase is the right call.

## Final Output

**Must-have features (v1 build scope):**

1. **Session logging with discipline-tagged sub-entries** — log a visit (single discrete grade, no slash/range, attempt count, sends, subjective effort) with one or more discipline sub-entries in under 60 seconds.
   *Acceptance:* time a cold-open-to-saved-session flow on a fresh install; must complete under 60s; mixed boulder+route visit logs as one session with two sub-entries, not two separate flows.

2. **Rolling training-load computation (acute 7-day vs. chronic 28-day)** using `normalized_grade × attempt_count × discipline-specific multiplier`; the normalized cross-discipline index and multiplier stay invisible plumbing, never shown as a grade-equivalence claim.
   *Acceptance:* seed synthetic history via the debug path; acute/chronic numbers match an independently hand-calculated value for a known input set.

3. **Calibration state (<14 days history)** — raw load numbers only, explicit "still calibrating" copy, no ratio-based recommendation.
   *Acceptance:* fresh install shows raw-numbers-only state through day 13; the real recommendation appears exactly on day 14, not earlier or later.

4. **Train/rest recommendation with reasoning always rendered inline** next to the number — never a bare badge, never tap-to-reveal.
   *Acceptance:* every screen showing the recommendation also shows the one-line reasoning in the same view hierarchy, verified visually and via VoiceOver (see #9).

5. **Rest-day gate as a dismissible banner on app open** (never a modal) when the day's recommendation is "rest," clearing via explicit acknowledgment or via logging a session that day (which tags the override onto that session record).
   *Acceptance:* force a rest recommendation; confirm the banner appears once per day; dismiss via both paths separately; confirm the override flag persists on the session record after relaunch.

6. **Edit/delete/backdate with full downstream recompute** of every rolling window and stored recommendation snapshot affected by the change.
   *Acceptance:* backdate a session 3 days into existing history; confirm load numbers for every day between the backdate and today shift accordingly, not just going-forward state.

7. **Local persistence (SwiftData)** surviving force-quit, backgrounding, and low-storage conditions without data loss or crash; store is not excluded from device backup.
   *Acceptance:* force-quit mid-entry, relaunch, confirm no loss; simulate low storage; confirm graceful failure, not corruption or crash.

8. **Debug-only multi-week history seeding path** (non-App-Store-facing).
   *Acceptance:* a build-only affordance exists that populates 28+ days of synthetic sessions in one action, usable to re-verify load-shift behavior on demand.

9. **Empty/loading/error states on every reachable screen**, including a corrupt-or-unreadable-store recovery path that doesn't crash on launch; VoiceOver speaks the actual reasoning line, not just a bare number.
   *Acceptance:* walk every screen with no data, with a slow/first load, and with a simulated store-read failure — no crash, no dead-end blank screen; run VoiceOver over the recommendation view and confirm it speaks the full reasoning sentence.

10. **Free-tier "current phase" indicator** — a simple, one-line label (e.g., "your last 2 weeks read as Build") derived from acute/chronic trend direction against a small fixed threshold set (base/build/peak/deload), shipped free and explicitly distinct from Pro's retroactive multi-block historical labeling.
    *Acceptance:* a free-tier user with ≥14 days of history sees a phase label without any paywall interaction; the label updates when the underlying trend direction changes across a seeded multi-week dataset.
    *Flagged tradeoff:* this is new-ish scope relative to the product brief's description of periodization-as-Pro — added as a must because the app's core promise ("structured periodization") would otherwise be entirely invisible until payment, which is judged a worse failure than a slightly larger free tier. Stated explicitly so a later phase can challenge it rather than silently inherit it.

11. **Free/Pro entitlement boundary architecturally wired**, with at least one real Pro feature functioning behind it (not a stubbed "coming soon"): per-discipline load-line separation, since sub-entries are already discipline-tagged for free-tier load math and splitting that data is small marginal build, not new scope.
    *Acceptance:* toggling the entitlement flag (debug-only, no real StoreKit required for MVP) reveals/hides the per-discipline load lines; free tier shows one blended load line, Pro shows two.

**Should-have (post-must, build if time allows):**
- Retroactive periodization-block labeling across full history (Pro).
- CSV export via share sheet (Pro).
- A shareable/exportable load-trend or weekly-summary card styled for screenshots.

**Could-have:**
- Weekly pattern-language digest ("you peak 48hrs after rest, not 24").
- PDF export formatting beyond CSV.
- Real receipt-validated StoreKit purchase flow (a stubbed entitlement toggle satisfies the MVP contract; real purchasing is explicitly not required).

**Won't-build (restated, not reopened):**
HealthKit read/write of any kind; push notifications or rest-day reminders; social features, leaderboards, or sharing feeds; coach/multi-user accounts; cloud sync; an auto-generated forward-looking macrocycle/training plan; route photos/video/beta notes; slash-or-range grade entry; gym-specific grade calibration.

**Open item carried forward, not blocking consensus:** the free-tier "current phase" indicator (#10) is the one item in this list that's a genuine new call rather than a restatement of already-locked decisions — if a later phase wants to cut it for time, that must be raised as an explicit deviation against this list, not quietly dropped.
