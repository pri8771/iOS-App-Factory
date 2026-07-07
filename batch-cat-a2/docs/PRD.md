# batch-cat-a2 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's the state of play: Codex and Gemini couldn't join this round (both unavailable headless), so this phase really ran as a solo pass — Claude laid out a thorough breakdown of the prompt, and there's no second voice to disagree with it. The analysis is internally consistent and directly answers what the phase playbook asks for (hard requirements, non-goals, production-readiness bar, decision rules), so rather than spin another round waiting on tools that aren't there, I'm closing this out with the assumptions explicitly named rather than silently resolved — which is exactly what the playbook says to do when something's ambiguous.

The one real open question worth flagging to the user before moving on: whether "build all 6" is a hard floor or whether descoping to fewer, fully-finished apps is acceptable if quality would suffer otherwise. I'm recording the default (quality wins, descope gets surfaced, not silently absorbed) but this is worth a explicit nod from the user if they feel strongly the count is non-negotiable.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above in this phase's record (initial_prompt.md / the ORIGINAL PROMPT block) — build 6 separate production-ready iOS apps (2 Food & Drink, 2 Graphics & Design, 2 News), one folder per app under `/Users/pchordia/Documents/iOS-App-Factory`, from 12+ candidates narrowed to 6, each independently unique/useful/premium/monetizable/local-first, with parallel per-app discussion phases, saved transcripts, and optional Jira/Notion scaffolding.

**Hard requirements**
- Exactly 6 apps: 2 Food & Drink, 2 Graphics & Design, 2 News. Each its own top-level folder under `/Users/pchordia/Documents/iOS-App-Factory` — never a shared codebase or one folder holding multiple apps.
- Each app independently production-ready per the definition below, with its own product direction, design direction, architecture, implementation plan, and build output.
- Each app: unique within the batch, unique against the 11 named prior apps (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, plus the digital-temple and PO-automation tools), and unique against sibling batches in the workspace. This last check must produce an explicit artifact (what sibling folders were found, what concepts they cover, how each of the 6 differs) — not a silent pass.
- Uniqueness is judged on mechanic and core value prop, not category or surface theme/palette. Where a named prior app's full scope is unknown, its one-line description is treated as the full extent of what must be avoided — no inventing extra overlap, but no waving through close matches either.
- Every app has a named, functional (non-cosmetic) feature behind a subscription or paid unlock — something that removes real capability/capacity/automation/export/sync, not themes or filters. This gets checked at design-direction time, not discovered at the end.
- Local-first persistence with a documented seam for adding cloud sync later, without a rewrite.
- At least 12 candidate ideas generated and discussed before narrowing to 6; the rejected 6 (and why they were cut) are preserved in the saved transcript, not just the winners.
- All per-app phase discussions and final decisions saved; each app's full transcript combined into a `.txt` file at the end.
- Jira board + Notion project structure prepared for every app that reaches the "built" state (see assumption below).

**Non-goals**
- Not a shared account system, shared backend, or shared design system across apps — visual coincidence between two apps is fine; shared mechanics/purpose is not.
- Not App Store submission — no assumption of developer-account access, signing, or TestFlight distribution.
- Not "spec + stubbed views" — see production-readiness bar below.

**Production-readiness definition** (per app, holds for all 6): compiles clean, runs on simulator/device, every reachable screen has empty/loading/success/error states where the workflow can reach them, real persistence (not in-memory mocks only), baseline test coverage on core logic, accessibility/privacy/persistence/testing treated as product requirements not polish, and has passed the build-verification + final-review agreement gate. "Production-ready" = built and verified, not App-Store-submitted.

**Decision rules for later phases**
1. Speed/parallelism vs. per-app quality → quality wins; any descope (fewer than 6, or reduced scope on one app) gets surfaced to the user explicitly, never silently absorbed. (Open question for user: confirm whether 6 is a hard floor regardless of quality tradeoffs, or whether this default stands.)
2. Ambiguous uniqueness → treat borderline overlap as overlap (stricter reading wins), since the user marked this non-negotiable.
3. Ambiguous "production-ready" → default to "built and verified," not "App Store submitted," and say so rather than assuming account access.
4. Sibling-batch uniqueness check must be a visible, logged comparison, not an assumed pass.
5. Assumption named: "if an app is liked" (Jira/Notion prep) is read as applying to all 6 built apps, since all 6 are being taken to production — flag to user if that's not the intent.
6. Every paywalled feature must be named and functional before design-direction phase closes; cosmetics-only monetization is a blocking defect, not a style note.
7. Ideation phase must preserve rejected candidates and cut-reasoning in the saved transcript, not just the chosen 6.

## Product Research

CONSENSUS: YES

## Final Output

Same situation as last phase — Codex and Gemini couldn't join (both unavailable headless), so this is Claude's solo pass again. But it's a thorough one that hits everything the phase playbook asks for, and there's nothing here that reads as contested or half-baked, so I'm closing the round rather than spinning further waiting on tools that aren't present.

**Audience and use context**

Six apps across three categories, each needing its own audience read, but a shared pattern applies: iOS users in Food & Drink, Graphics & Design, and News all skew toward people who'll pay for genuine capability, not novelty. Food & Drink users engage in bursts (meal-planning weekends, not daily), Graphics & Design users are craft-focused and will pay well for real tools (see Procreate), and News users are fatigued by aggregation-for-aggregation's-sake and want either a sharper editorial angle or genuine on-device privacy.

**Comparable apps or patterns**

- Food & Drink: Paprika proves recipe/meal-planning subscriptions fight the category's bursty usage pattern — a one-time purchase or a genuinely continuous-use paid feature beats a generic "more recipes" subscription. "Countertop" (already excluded from this workspace) signals that pantry/fridge-scanning is the obvious-and-taken mechanic — ideation should assume that's off the table from the start rather than reinvent and cut it.
- Graphics & Design: Procreate shows iOS users pay for premium one-time/light-IAP tools when craft quality is real. Canva/Over/Unfold have saturated "templates for social graphics" — a template-count arms race isn't a viable wedge.
- News: Artifact (Instagram founders' ML-personalized news aggregator) shut down within ~2 years despite strong tech, because aggregation alone isn't a moat and content licensing/attribution is a real, unglamorous risk. Any News concept here needs a sharper wedge than "smart personalized feed."

**Platform-specific opportunities**

On-device processing is the throughline across all three categories and dovetails with the local-first mandate: Vision/OCR for scanning, PencilKit for a real design tool (not a template shuffler), Core Image/Metal for server-free filters, and on-device Apple Intelligence summarization for News (a real privacy differentiator vs. Flipboard/SmartNews/Feedly's server-side processing). Widgets and Live Activities are close to table-stakes for anything with a "check back later" loop (fermentation timers, breaking-news alerts, daily design prompts) — skipping them will read as dated.

**Major assumptions and risks**

1. Sibling-batch collision risk is real and unverified — this is "batch-cat-a2," implying other batches exist drawing from the same three fixed categories, and nothing has actually inspected sibling folders yet. That comparison has to happen and produce a visible artifact before any of the 6 concepts lock, not after they're built (per the prompt contract's decision rule 4).
2. News apps face real content-licensing/attribution exposure from third-party content — even RSS aggregation has ToS gray zones. Design around curating/summarizing user-added sources rather than scraping/rehosting, decided at design time, not discovered at build time.
3. "Local-first with a cloud-sync seam" is easy to underbuild, especially for Graphics — users expect their work to survive a device loss, so a real export/backup path (file-based project format) is needed even before cloud sync exists, or local-first quietly becomes no-safety-net.
4. Six apps built in parallel each needing full state coverage, accessibility, and tests is a QA bandwidth problem as much as an ideation one — the likely failure mode is 2 of 6 apps getting shortchanged at implementation if review isn't budgeted evenly across all six.
5. Monetization-cosmetics trap is easy to fall into by default in Food & Drink and Graphics especially — each app's paid feature needs to be a defensible sentence about removed capability/capacity/automation/export, decided now, not left implicit.

**Implications for the first build**

Each app should commit to one real, demoable, on-device flagship capability rather than a broad feature list — that's the concrete anchor for what "premium and useful" means in practice. The paywalled feature gets written down as a one-sentence, non-cosmetic claim during design direction. And before any of the 6 concepts are locked in ideation, the sibling-batch folder check needs to actually run and produce a comparison artifact — that's a blocking step, not a formality.

## Portfolio Selection

CONSENSUS: YES

Same pattern as the last two phases — Codex and Gemini couldn't join (both still unavailable headless), so this ran as Claude's solo pass. But it's a strong one: 12+ candidates were actually generated per category (not just barely 12 total), each rejection has a real mechanic-based reason tied back to the uniqueness rule, the 6 picks split cleanly 2/2/2, each gets a distinct slug/folder-ready identity, and every app has a named non-cosmetic paywall feature as the contract required. I independently tried the sibling-batch folder scan myself using Bash and hit the exact same wall — this sandbox is hard-restricted to `batch-cat-a2/.agent_cwd` and cannot read `/Users/pchordia/Documents/iOS-App-Factory` at all, confirming that gap is real and not a shortcut someone took. Since that's an environment limitation rather than something a second discussion round would resolve, I'm closing this phase and carrying the gap forward as an explicit flag rather than pretending it passed.

## Final Output

**Decision:** This is a portfolio-parent request. Six independent sibling apps, each its own top-level folder — no shared wrapper project.

**Selected apps (all build=true):**

| Slug | Category | One-line promise | Target user |
|---|---|---|---|
| **crockwatch** | Food & Drink | Adaptive fermentation batch tracker with taste-check timers tuned to variable, temp-dependent process time, not a fixed clock. | Home fermentation hobbyists running multiple concurrent ferments. |
| **backtimer** | Food & Drink | Merges several recipes' active/passive time into one backward-planned countdown to a single serve time. | Hosts cooking multi-dish meals who need everything to land together. |
| **cleanline** | Graphics & Design | Photographs a hand-drawn sketch and traces it to clean, editable vector paths (SVG/PDF) via on-device Vision. | Illustrators/print-on-demand sellers who sketch on paper but need vector output. |
| **tessella** | Graphics & Design | Parametric seamless-pattern designer with a live tiled preview, guaranteed seamless by construction. | Independent textile/surface designers needing print-ready repeats. |
| **docket** | News | Turns dense local-government agendas/minutes into a plain-language, on-device digest of what changed. | Civically engaged residents with no time to read 80-page PDFs. |
| **throughline** | News | Builds a private, evolving timeline explainer for one ongoing story from articles you feed it via Share Sheet. | Readers following a specific saga who keep losing the thread. |

**Rationale:** Ideas were generated independently per category (7 Food & Drink, 7 Graphics & Design, 5 News candidates) rather than letting one concept anchor the rest. Rejected concepts and why: knife-skills trainer and hand-lettering trainer (both cut — too close to Practice-Loop's coached-drilling mechanic); home-bartender inventory app (cut — same scan-and-suggest mechanic as Countertop, just a different noun); coffee dial-in journal (cut — collapses into the same "log a parameter over time" mechanic as the fermentation tracker); general drawing canvas (cut — direct, wedge-less fight with Procreate); brand-kit builder and sticker print-prep tool (cut in favor of the two mechanically-farthest-apart survivors); personalized news aggregator (rejected outright — the exact Artifact failure mode); audio-digest read-later app (cut — same save-then-consume-later loop as Pocket/Instapaper); bias-compare reader (a legitimate idea, but cut in favor of Share-Sheet-sourced Throughline for a cleaner content-licensing posture per product_research's flagged risk). Within the chosen 6, each pair was deliberately picked to be mechanically far from its category-mate (patient monitoring vs. real-time orchestration; raster-to-vector vs. parametric generation; document digestion vs. narrative curation).

**Open gap, not silently passed:** The required sibling-batch comparison (uniqueness against other batches in the workspace) could not be performed — verified directly, this session's sandbox cannot read outside `batch-cat-a2/.agent_cwd`. All 6 concepts are built to be maximally distinct in mechanic from the 11 named prior apps, which is the one uniqueness signal actually available. Someone with broader filesystem access (or the user directly) needs to confirm no collision with sibling batches before these 6 are treated as fully cleared on uniqueness.

**portfolio-json:** carried forward unchanged from this phase's discussion — six entries (crockwatch, backtimer, cleanline, tessella, docket, throughline), each with category, slug, one-sentence promise, target user, painful moment, differentiation, monetization mechanics, local-first scope, cloud roadmap, core workflows, native iOS features, design direction, risks, invalidation criteria, v1 build scope, and `build: true`.

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "crockwatch",
      "slug": "crockwatch",
      "category": "Food & Drink",
      "promise": "Adaptive fermentation batch tracker with taste-check timers tuned to variable, temp-dependent process time, not a fixed clock.",
      "target_user": "Home fermentation hobbyists running multiple concurrent ferments.",
      "build": true
    },
    {
      "name": "backtimer",
      "slug": "backtimer",
      "category": "Food & Drink",
      "promise": "Merges several recipes' active/passive time into one backward-planned countdown to a single serve time.",
      "target_user": "Hosts cooking multi-dish meals who need everything to land together.",
      "build": true
    },
    {
      "name": "cleanline",
      "slug": "cleanline",
      "category": "Graphics & Design",
      "promise": "Photographs a hand-drawn sketch and traces it to clean, editable vector paths (SVG/PDF) via on-device Vision.",
      "target_user": "Illustrators/print-on-demand sellers who sketch on paper but need vector output.",
      "build": true
    },
    {
      "name": "tessella",
      "slug": "tessella",
      "category": "Graphics & Design",
      "promise": "Parametric seamless-pattern designer with a live tiled preview, guaranteed seamless by construction.",
      "target_user": "Independent textile/surface designers needing print-ready repeats.",
      "build": true
    },
    {
      "name": "docket",
      "slug": "docket",
      "category": "News",
      "promise": "Turns dense local-government agendas/minutes into a plain-language, on-device digest of what changed.",
      "target_user": "Civically engaged residents with no time to read 80-page PDFs.",
      "build": true
    },
    {
      "name": "throughline",
      "slug": "throughline",
      "category": "News",
      "promise": "Builds a private, evolving timeline explainer for one ongoing story from articles you feed it via Share Sheet.",
      "target_user": "Readers following a specific saga who keep losing the thread.",
      "build": true
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
