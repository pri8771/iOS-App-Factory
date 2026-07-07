# batch-specials — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `app_build`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Prompt Contract
- Product Research
- Portfolio Selection
- Initial Discussion
- Per App Product Brief
- Next Steps Small
- Detailed Discussion
- App Features
- Design Discussion
- Design Handoff
- Ios Architecture Review
- Tech Specs
- Project Plan
- Task Assignments
- Implementation Readiness Gate
- Build Coordination
- Build Verification
- Human Qa Checklist
- App Store Readiness
- Final Review
- Portfolio Audit

## Prompt Contract

All the feedback this round is additive, not contested — the quality gate caught a real gap (output-shape requirement missing) and the skeptic caught three more before anyone had to argue about them: the "generate 14, pick 7" instruction needs to be read as three separate category pools or the fixed 3/2/2 split breaks by accident, "liked" for Jira/Notion prep needs to be an explicit per-app question to the user rather than an inferred judgment call, and the three PO apps need the same one-sentence divergence test the temple/health pairs already got. Nobody's pushing back on any of this — it's all tightening the same contract, so folding it in now rather than spinning another empty round with Codex/Gemini still down.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim in this phase's record (initial_prompt.md) and restated in full in round 1 — source of truth if any later conflict arises.

**Hard requirements**
1. Exactly 7 apps, in 3 fixed categories: 3 PO-automation web apps, 2 Hindu/Jain "digital temple" iOS apps, 2 Health/HealthKit iOS apps. Not "up to 7" — exactly 7, exactly that split.
2. Candidate generation must produce at least 14 ideas total, but **as three separate category pools**, each with real surplus over its slot count (more than 3 PO concepts, more than 2 temple concepts, more than 2 health concepts). Selection down to 7 happens as **three independent within-category selections**, never one global ranking across all 14 — a global rank-and-cut is explicitly the wrong reading and would violate requirement 1.
3. Every one of the 7 must independently satisfy: production-ready (not prototype), unique, useful, commercially viable, premium design, real end-user value, genuine (non-cosmetic) monetization path, viral potential without sacrificing usefulness, meaningfully better than named competitors, local-first with a clear non-rewrite path to cloud.
4. Batch-internal uniqueness: no two of the 7 may be similar to each other. Temple app #1 vs #2, health app #1 vs #2, and **PO app #1 vs #2 vs #3** must each pass a one-sentence test: whoever builds the later app(s) in each group must be able to state concretely what's different in mechanic/architecture/UX/business model — not just branding, content pack, or "same shape, different wireframe skin." For the PO apps specifically, since all three share an identical functional spec, this means actively forcing divergence in extraction-pipeline design, review-UI paradigm, or data flow — the default FastAPI+React+SQLite+Docker shape does not itself satisfy this.
5. Cross-batch/workspace uniqueness: every candidate idea checked in writing against the named exclusion list (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the existing digital temple app, the existing PO tool) and against sibling batch folders in the workspace, before acceptance into the 7. Written step, not assumed.
6. The 3 PO apps must each independently meet the full functional spec (upload → OCR → LLM extraction with strict validated JSON incl. retry-once repair → header/line-item fields → confidence scoring → side-by-side review UI → Ship To fuzzy-match catalog → prompt config (global + per-customer) → dashboard → export JSON/CSV → the listed DB tables → Docker/compose → tests → README → sample PDFs → graceful error handling), while differing per requirement 4 and from ABBYY Vantage's design and the user's existing PO tool.
7. Every app: SwiftUI-first for iOS per the playbook, all four UI states (empty/loading/success/error) wherever reachable, accessibility/privacy/persistence/testing treated as product requirements.
8. **Output shape**: all 7 apps live under `/Users/pchordia/Documents/iOS-App-Factory` as exactly 7 separate top-level folders, one per app — never a shared folder, monorepo, or category-grouped parent structure.
9. Process artifacts are deliverables, equal in weight to code: per-app phase transcripts saved and combined into one .txt per app at the end; Jira board + Notion project structure prepared **only for apps the user explicitly says they like**, asked per app at an end-of-build checkpoint — never inferred by an agent's own judgment of quality.
10. Any stall, resourcing shortfall, or scope cut on any one of the 7 must be reported explicitly and loudly (when it happens or at the end) — never silently absorbed into a "batch complete" summary.

**Non-goals**
- Not a design-only or spec-only exercise — mockups/architecture docs without working, runnable code do not satisfy the prompt.
- Not free to substitute "7 thinner apps" or partial builds without explicit, loud disclosure.
- Not free to treat monetization as satisfied by a subscription screen with no gated value difference.
- Not required to force AR/ML/LLM novelty into every app — bonus only, skip where not genuine.
- Not permitted to skip the uniqueness cross-check "because the idea seems obviously different" — must happen in writing regardless of confidence.
- Not permitted to rank all 14+ candidates in one global pool and cut to 7 — category pools are locked and selected independently.
- Not permitted for any agent to unilaterally decide an app is "liked" on the user's behalf.

**Production-readiness definition (per category)** — unchanged from round 1: PO apps need defined failure states for OCR failure, double-invalid LLM JSON, corrupt/zero-page PDFs, no-confidence Ship To matches, and non-PO documents, plus Docker/tests/docs/no hardcoded secrets. Temple apps need offline-first operation, non-shaming streak logic, and real day-30 content depth. Health apps need graceful handling of no-data/sparse-data/partial-permission states and honest, non-clinical framing of risk scores. All apps follow the playbook's four-state/accessibility/privacy/testing bar.

**Decision rules for later phases**
- Any temptation to reduce app count, thin a spec item, or skip the uniqueness check must be named explicitly and flagged to the user, never silently absorbed.
- Uniqueness verification (batch-internal one-sentence test + exclusion-list/sibling-folder check) is a required written gate before any idea graduates to the selected-7 — for all three categories, not just temple/health.
- Candidate ideation and selection must run as three separate category pools with surplus, never a single global 14-idea ranking.
- Monetization is satisfied only when someone can state, in one sentence, the concrete functional/content advantage a paying user gets over a free user.
- "Liked" status for Jira/Notion prep is decided only by the user, asked explicitly per app at an end-of-build checkpoint — never inferred.
- Before declaring the batch complete, run a literal directory listing of `/Users/pchordia/Documents/iOS-App-Factory` and confirm exactly 7 top-level folders exist, none nested under a category or parent grouping — a mechanically checkable gate, not a stated intention.
- Any conflict between this contract and a later phase's convenience is resolved in favor of this contract, with the tradeoff surfaced to the user.
- End-of-batch reporting must state per-app status plainly (fully built / partially built / stalled) — omitting a thin or stalled app from a clean-looking summary is itself a contract violation.

## Product Research

CONSENSUS: YES

## Final Output

With Codex and Gemini both down again this round, the only substantive voice was Claude's pragmatist/skeptic pass — but it's thorough enough to stand as the phase output, and there's no second voice left to disagree with it. Folding it into a structured research summary now rather than spinning further empty rounds.

**Audience and use context**
- *PO-automation web apps*: SMB/mid-market AP or supply-chain ops teams (roughly 5-50 person finance/ops shops) currently retyping PO PDFs into ERPs, plus BPO/shared-services outfits processing POs across multiple clients. Not enterprise (SAP/Oracle already bundle this) and not solo freelancers (too niche). The end user doing the actual work is a data-entry/AP clerk correcting dozens of POs a day — the review UI's usability for that person is the product, not a nice-to-have.
- *Temple iOS apps*: diaspora and home-country Hindus and Jains who grew up with daily religious practice at home but have fallen out of habit (often living alone or abroad now), plus a smaller group of newer/curious practitioners wanting structure. Wants a daily practice, not just a reference app.
- *Health iOS apps*: "data-rich, insight-poor" Apple Watch/iPhone users who've accumulated a year-plus of HealthKit data and feel the stock Health app just charts numbers without telling them anything actionable.

**Comparable apps or patterns to learn from** (all labeled as assumptions from general knowledge — no external search was run this phase, so none of this is verified against current reality)
- *PO apps*: ABBYY Vantage (excluded from copying, but its confidence-driven human-in-the-loop queue pattern is worth learning from), Rossum, Docsumo, Nanonets — competitors doing LLM-assisted invoice/PO extraction with review UIs. Common gap: none optimize hard enough for keyboard-only, high-speed correction (tab order, type-ahead, click-to-jump between PDF region and field) — that's a legitimate "better than competitors" hook.
- *Temple apps*: Headspace (short guided-audio session format) and Duolingo (loss-averse streak/skill-tree progression) are the named blueprint to combine, not copy. Adjacent competitors: generic devotional/calendar apps and general meditation apps like Calm — none combine structured progression with devotional depth, which is the actual gap.
- *Health apps*: Ultrahuman, Athlytic, Bevel, Welltory — direct competitors doing HealthKit aggregation plus insights. The gap they mostly leave open: longitudinal correlation ("your resting heart rate creeps up on weeks you sleep under 6 hours") and honestly-framed validated risk scoring.

**Platform-specific opportunities**
- PO apps run as Dockerized web apps, so the "native" lever is a keyboard-first, high-throughput review UX rather than any iOS-specific opportunity.
- Temple apps: on-device audio-led sessions, widgets/Live Activities for daily practice reminders, fully offline-first operation as a real differentiator against cloud-dependent devotional apps.
- Health apps: deep HealthKit read integration, on-device computation of trend/correlation/risk-score logic (privacy-friendly, local-first), visible confidence/completeness labeling tied to actual HealthKit data present.

**Major assumptions and risks**
1. **Convergence risk across all three category pairs/triples**: three PO apps sharing an identical functional spec will default to the same FastAPI+React+SQLite+Docker review screen unless architecture is actively forced apart (e.g., synchronous single-doc review vs. async batch-triage queue vs. chat-assisted correction sidebar). Same convergence risk applies to the two temple apps and two health apps if divergence is left to "vibes" rather than a real mechanic split.
2. **Failure-path plumbing is the part most likely to get stubbed**: retry-once JSON repair, needs_review flagging, zero-page/corrupt PDFs, no-confident Ship To match — these don't demo well and are exactly what gets silently skipped under time pressure. Concrete smoke test needed per PO app: force an OCR failure and confirm it lands in a defined state, not a silent drop. The sample PDF corpus also needs deliberately messy cases (rotated scans, multi-currency, missing fields) or the validation logic never actually gets exercised.
3. **Religious content correctness is a trust-destroying failure mode for the temple apps**: wrong transliteration, conflated Hindu/Jain practice, or generically "spiritual" tone reads as appropriative. Since this pipeline can't do actual theological review, content should draw from a small, clearly-cited set of public-domain/traditional sources per tradition, and "content accuracy not theologically reviewed" should be flagged as an explicit open risk rather than assumed solved.
4. **QRISK3/FINDRISC-style scoring is the single largest legal/credibility risk in the batch**: both instruments require inputs HealthKit typically doesn't have (cholesterol ratio, BP, smoking status, family history, ethnicity for QRISK3; waist circumference, BP medication, prior high glucose for FINDRISC). Computing a "QRISK3-style" score off HealthKit proxies alone is not the validated instrument — it's a look-alike — and the app must visibly degrade its confidence/completeness label based on what data is actually present, never present it with false clinical authority.
5. **Nothing in this phase involved actual web research** — competitor UI specifics, real QRISK3/FINDRISC input specs, and current app-store landscape are all unverified general knowledge and should be labeled as assumptions. Given the legal exposure on point 4, a real lookup of the clinical risk-score input variables is worth doing before the health apps' extraction logic gets built, not after.

**Implications for the first build**
- Each PO app's differentiation must be locked in as an architecture/data-flow decision before coding starts (e.g., one synchronous-review, one async-batch-triage, one chat-assisted) — not left to be "discovered" during implementation.
- Each PO app needs a deliberately messy sample-PDF set and a mandatory failure-path smoke test as part of its definition of done.
- Temple apps must pick genuinely different mechanic centers of gravity (e.g., one audio/streak-forward, one curriculum/skill-tree-forward) and treat content sourcing/citation as a first-class task, with the theological-review gap stated openly.
- Health apps must pick genuinely different mechanic centers of gravity (correlation/trend-discovery tool vs. periodic structured risk-scoring tool with action plan) and build visible data-completeness/confidence labeling into any risk score from day one, not bolt it on later.

## Portfolio Selection

Confirmed — I hit the same sandbox restriction Claude did, so the cross-batch uniqueness check genuinely can't be completed from here with real folder access. That stays flagged as an open item rather than assumed away.

CONSENSUS: YES

## Final Output

With Codex and Gemini both down again this round (consistent with every prior phase), Claude's solo pass is thorough enough to stand — it hit every required output for this phase and there's no second voice to weigh in against it. This is a **portfolio-parent** decision: 7 independent sibling apps, one folder each, no shared wrapper project, per the contract's output-shape requirement.

**Selected 7, by category:**

*PO-automation (web, 3 apps)* — split by interaction paradigm so they don't converge on the same upload-review screen:
1. **FastLane PO** — single-document keyboard-driven speed-correction for a full-time AP clerk.
2. **BatchBridge** — confidence/SLA-sorted triage queue for a BPO/shared-services team managing multiple clients at once.
3. **TalkThrough** — chat-driven natural-language correction for occasional/non-power users, with the LLM explaining its own reasoning on request.

*Digital temple (iOS, 2 apps)* — split by mechanic, not branding:
4. **Aarti Path** — Headspace-forward, five-minute guided daily session with non-shaming streaks.
5. **Dharma Trail** — Duolingo-forward structured curriculum/skill-tree with real knowledge checks on mantras, festivals, and philosophy.

*Health/HealthKit (iOS, 2 apps)* — split by mode:
6. **Pattern Pulse** — continuous, exploratory correlation-discovery across the user's own HealthKit data.
7. **Risk Compass** — periodic, honestly-caveated QRISK3/FINDRISC-style risk check-in with an action plan and visible data-completeness labeling.

Each app got a stated rejected-alternatives list (e.g., a rules-workbench and BPO-dashboard idea folded into BatchBridge's scope rather than standing alone; a family-sync temple app and festival-anchored temple app rejected for fighting local-first/daily-engagement respectively; a recovery/training-load health app and multi-year "healthspan ledger" rejected for being too close to existing competitors or to Pattern Pulse's own mechanic). All 7 satisfy the contract's per-app bar (production-ready, unique, premium, monetized with a real free/paid feature gap, local-first-first) and each pair/triple has a stated one-sentence divergence test.

**Open item, not silently resolved:** the contract requires a *written* cross-batch uniqueness check against sibling project folders in the workspace, and neither Claude nor I have filesystem access beyond this batch's own working directory — both attempts to `ls` the parent `iOS-App-Factory` folder were sandbox-blocked. The check against the named exclusion list (Waylay, TrueScale, Provenance, etc.) was done at the description level only; the other ten names carry no functional description in the prompt itself, so that check is "nothing about these 7 concepts resembles a location-recall utility, a PO tool, or a digital temple app" rather than a real read of those folders' actual contents. This needs to be run with broader filesystem access (or you confirming there's no conflict) before the selection is fully locked in — flagging it loudly here rather than assuming it away.

The portfolio-json manifest for all 7 apps is captured in the transcript above and is ready to hand off to the next phase (per-app product direction/design/architecture, run in parallel).

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "FastLane PO",
      "slug": "fastlane-po",
      "category": "PO-automation",
      "platform": "web",
      "build": "Single-document keyboard-driven speed-correction tool for a full-time AP clerk."
    },
    {
      "name": "BatchBridge",
      "slug": "batchbridge",
      "category": "PO-automation",
      "platform": "web",
      "build": "Confidence/SLA-sorted triage queue for a BPO/shared-services team managing multiple clients at once."
    },
    {
      "name": "TalkThrough",
      "slug": "talkthrough",
      "category": "PO-automation",
      "platform": "web",
      "build": "Chat-driven natural-language correction tool for occasional/non-power users, with the LLM explaining its own reasoning on request."
    },
    {
      "name": "Aarti Path",
      "slug": "aarti-path",
      "category": "Digital temple",
      "platform": "iOS",
      "build": "Headspace-forward, five-minute guided daily session with non-shaming streaks."
    },
    {
      "name": "Dharma Trail",
      "slug": "dharma-trail",
      "category": "Digital temple",
      "platform": "iOS",
      "build": "Duolingo-forward structured curriculum/skill-tree with real knowledge checks on mantras, festivals, and philosophy."
    },
    {
      "name": "Pattern Pulse",
      "slug": "pattern-pulse",
      "category": "Health/HealthKit",
      "platform": "iOS",
      "build": "Continuous, exploratory correlation-discovery app across the user's own HealthKit data."
    },
    {
      "name": "Risk Compass",
      "slug": "risk-compass",
      "category": "Health/HealthKit",
      "platform": "iOS",
      "build": "Periodic, honestly-caveated QRISK3/FINDRISC-style risk check-in with an action plan and visible data-completeness labeling."
    }
  ]
}
```

## Initial Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Per App Product Brief

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Next Steps Small

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Detailed Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## App Features

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Design Discussion

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Design Handoff

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Ios Architecture Review

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Tech Specs

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Project Plan

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Task Assignments

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Implementation Readiness Gate

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Build Coordination

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Build Verification

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Human Qa Checklist

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## App Store Readiness

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Final Review

Delegated on portfolio parent: selected apps were materialized as sibling child projects from portfolio_manifest.json. Each child runs its own phase workflow separately: build=true children use app_build; build=false children use app_spec.

## Portfolio Audit

CONSENSUS: YES

## Final Output

Only one voice was actually available this round (Codex and Gemini both stayed down), but Claude's pass is thorough and lands on a clear, honest position rather than a false "all clear."

**Portfolio applicability:** Yes, applicable — this is a 7-app portfolio parent, not a single-app run.

**Expected vs. actual shape:** Expected is exactly 7 sibling folders (3 PO-automation web apps: FastLane PO, BatchBridge, TalkThrough; 2 temple iOS apps: Aarti Path, Dharma Trail; 2 health iOS apps: Pattern Pulse, Risk Compass), none nested under a category parent. On paper, `portfolio_manifest.json` shows all 7 with `build:true` and the right 3/2/2 category split — no category was silently collapsed in the manifest itself. But the actual mechanical check this phase exists to do — literally listing `/Users/pchordia/Documents/iOS-App-Factory` and counting 7 real folders — could not be run. The sandbox here is locked to an empty `.agent_cwd` and every attempt to read the parent output directory has been blocked, in this phase and every phase before it.

**The real concern, not just a technicality:** every one of the 15 prior phases in this transcript printed the identical line — "Delegated on portfolio parent... each child runs its own phase workflow separately" — with zero visible per-app output: no product briefs, no design specs, no code, no build-verification results. That's consistent both with "the 7 child builds ran fine and just aren't piped back into this parent transcript" and with "the manifest was written but the child builds never actually executed." Nothing in this phase can distinguish those two cases.

**Child-content risk flagged for the record:** even once folders exist, each child's own `initial_prompt.md` needs to carry forward the specific divergence framing (BatchBridge's SLA-triage-queue, TalkThrough's chat-correction, etc.) and the full PO functional spec — not a generic restatement — or the contract's anti-convergence requirement silently fails downstream where no one is positioned to catch it.

**Backfill/Jira-Notion readiness:** correctly not applicable yet — that's a per-app question asked to the user only at each app's own end-of-build checkpoint, and none of the 7 are there yet. Not a blocker for this phase.

**Bottom line:** the audit can't mechanically confirm success, so it's being reported exactly that way rather than assumed clean. Action item for the user: please look at `/Users/pchordia/Documents/iOS-App-Factory` directly and confirm whether you see exactly 7 top-level folders (FastLane PO, BatchBridge, TalkThrough, Aarti Path, Dharma Trail, Pattern Pulse, Risk Compass) each with real content — not just the manifest file — since this sandbox cannot check that for you.

VERIFICATION: UNVERIFIED
_(No structured verification result exists for this build.)_
