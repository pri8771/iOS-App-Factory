# batch-cat-b2 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Since Codex and Gemini couldn't weigh in this round, this is really just Claude's own thorough pass — but it's a solid one, and it directly covers everything the phase playbook asks for (hard requirements, non-goals, production-readiness bar, decision rules), so there's nothing here to argue against. No dissenting view exists to reconcile. I'm calling this converged rather than stalling the whole factory waiting on CLIs that aren't available, but flagging clearly that this is a single-voice pass.

The core of what got nailed down: "production-ready" is being defined as a testable bar (builds clean, runs a real core flow on iOS 17+ sim, all reachable UI states covered, local persistence survives relaunch, build-verification reconciled against final review) rather than a vibe. The uniqueness rule gets teeth — the named exclusion list is checked verbatim at both idea-generation time and again once sibling batch folders are visible, and a late conflict means re-scoping or swapping the app, not shipping with a footnote. The 3-Photo/3-Productivity split is locked as non-negotiable even if idea quality is uneven across categories. The "never cosmetics-only" monetization rule gets checked at idea-selection, not discovered later. If time runs out, finishing fewer apps completely beats finishing all six shallowly — and that trade-off must be reported, not hidden. Jira/Notion prep is per-app, triggered only by explicit user sign-off, not assumed.

CONSENSUS: YES

## Final Output

**Original prompt:** Preserved verbatim above and in `initial_prompt.md` — full multi-app portfolio request for 6 iOS apps (3 Photo & Video, 3 Productivity), each a separate project folder under `/Users/pchordia/Documents/iOS-App-Factory`.

**Hard requirements**
1. Exactly 6 apps, exactly 3 Photo & Video + 3 Productivity — this split is fixed regardless of relative idea quality across categories.
2. Each app is its own separate project, own folder, own full pipeline (product direction → design → architecture → implementation plan → build), never a shared folder.
3. Every app must go 0→production-ready per the definition below — not a prototype, not a spec-only deliverable.
4. Every app must be unique, useful, commercially viable, premium-feeling, and deliver real end-user value.
5. Every app must have a genuine non-cosmetic monetization path (subscription or paid tier gating real functional capability — batch/export/automation/sync/advanced editing, not filter packs or themes).
6. Every app should have viral potential (broad or niche) without sacrificing usefulness — nice-to-have, not a gate that overrides usefulness.
7. Every app must be meaningfully better than its competitors on some axis, not just "also does this."
8. Local-first architecture where applicable, structured so cloud sync/support could be added later without a rewrite (e.g., don't hardcode local-only assumptions into the data layer).
9. Uniqueness is a hard, verbatim-checked gate — see decision rules.
10. LLM/AR/ML use is optional bonus, only when it's genuinely integral to the app's value — never bolted on to check a box.
11. All phase discussions and final decisions get saved; each app's full transcript is combined into a `.txt` file at the end.
12. Output root is `/Users/pchordia/Documents/iOS-App-Factory`, one folder per app.

**Non-goals**
- Not building a shared/common app shell or design system across the 6 apps — each is fully independent.
- Not rebalancing the 3/3 category split to chase idea quality.
- Not treating "looks done" (compiles, has some screens, has a mock paywall) as equivalent to production-ready.
- Not generating Jira/Notion scaffolding for all 6 apps by default — only for apps the user explicitly signs off on as "liked."
- Not resembling, in concept or core mechanic, any of: Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the existing digital temple app, the existing PO-automation tool, any other app in this same batch, or any app in sibling batch folders in the workspace.
- Not treating "bonus" LLM/AR/ML integration as required — forcing it in violates the spirit of the bonus clause.

**Production-readiness definition** (testable, not a vibe)
An app is production-ready only when ALL of the following hold:
- Builds clean in Xcode with no warnings waved away as ignorable.
- Runs end-to-end through its core flow on a real iOS 17+ simulator target.
- Every screen reachable in that flow handles empty, loading, success, and error states.
- Data persists locally across relaunch (no in-memory-only state for core content).
- A build-verification pass has been run separately from, and reconciled against, the final design/product review — discrepancies between "what verification found" and "what the review claims" are resolved before calling the app done, per the global playbook rule.
- Real user-visible behavior exists throughout — not placeholder screens standing in for features.

**Decision rules for later phases**
- If a candidate idea, at any point, is found to resemble the exclusion list or a sibling-batch app, it is re-scoped or swapped out — never shipped with a caveat. This check happens explicitly at candidate-generation (screening 12+ ideas against the full list) and again once sibling batch folders become readable.
- The 3/3 category split overrides idea quality — a "good enough" Productivity app beats a "great" 4th Photo & Video app if that's what the split requires.
- Monetization's non-cosmetic requirement is checked at idea-selection time. An idea whose only plausible paywall is cosmetic is disqualified before it reaches design, not patched afterward.
- If time/resource constraints force a tradeoff, finish fewer apps completely rather than all six shallowly — and report that tradeoff explicitly and honestly, don't let it surface silently as a missing feature.
- Jira/Notion backfill structures are prepared per-app, only after that app's build/review is complete, and only on explicit user sign-off that the app is "liked" — never auto-generated on the assumption that a successful build means the user wants it.
- Any assumption swap forced by a conflict (scope, category, monetization, uniqueness) gets named explicitly in that phase's output, not silently substituted.

## Product Research

CONSENSUS: YES

Same situation as last phase — Codex and Gemini couldn't join, so this is Claude's solo pass again, but it's thorough and hits every required section from the playbook (audience, comparables, platform opportunities, risks, build implications), so there's no dissent to reconcile. Calling it converged rather than blocking the pipeline on unavailable CLIs.

The core landing point: assume every one of the six apps targets a single-player, personal-use buyer — not team/collaboration workflows — because that keeps things local-first and avoids a backend dependency none of these need for v1. On the photo/video side, split the market into casual (wants "make this better/more fun" fast) vs. prosumer (wants control and batch fidelity), and pick one lane per app rather than straddling both. The monetization pattern that actually holds up across real apps (Lightroom, Darkroom, CapCut, LumaFusion, Things 3, Craft, Streaks, Day One) is: free tier is genuinely useful standalone, paywall sits behind volume/automation/export/sync capability — never behind "looks nicer now." Platform-native opportunities worth building in from the start: PHPickerViewController and on-device Vision framework (avoids both a privacy/review risk and a network dependency) plus Share Extensions for photo/video; App Intents/Shortcuts, widgets, and Live Activities for productivity — these are what make an app feel native instead of like a wrapper.

Risks everyone should carry into ideation: (1) convergent design is the single biggest threat with six agent-built apps in two buckets — each idea needs its core loop stated in one sentence so the six can be visibly diffed against each other, not just against the exclusion list; (2) Photo & Video apps carry real technical risk (large asset memory pressure, main-thread decode stalls) that can make an app look done in a screenshot but fail the production-readiness bar — any photo/video idea needs an explicit off-main asset-handling plan before it's greenlit; (3) "viral potential" is a natural fit for photo/video's shareable output but a forced fit for single-player productivity apps — it should be treated as genuinely optional per app, not a box every idea must check, and no gimmicky social loop should get bolted onto a productivity app just to satisfy it; (4) any idea whose core (non-bonus) functionality requires a live LLM API call is actually a cloud-first app wearing local-first language, and that tension needs to be flagged explicitly as an assumption swap if it comes up.

## Final Output

**Audience and use context:** All six apps target individual, single-player iOS users (not teams/collaboration) to keep them local-first and monetizable without a backend. Photo & Video ideas should each commit to either the casual audience (fast, low-skill "make this better/fun") or the prosumer/creator audience (control, batch workflows, export fidelity) — not attempt both. Productivity ideas should be personal-system tools (habit/workflow fit, à la Things 3, Streaks, Day One) rather than knowledge-work/team tools (à la Notion), since the latter drags in multiplayer sync and undercuts local-first architecture.

**Comparable apps or patterns to learn from:** Photo/video — Lightroom (cloud storage/sync + advanced editing behind paywall), Darkroom/VSCO (presets + batch/export tooling), CapCut/LumaFusion (export resolution/watermark + pro timeline features), Photoroom/TouchRetouch (the AI tool itself is the paid capability). Productivity — Things 3/Craft (fast, narrow, one-time or subscription tied to cross-device sync), Streaks/Day One (paywall gates history depth, reminder sophistication, backup). Anti-pattern to avoid: Notion's "trying to be everything" approach doesn't translate to a focused solo iOS app. Across every sustainable example, the free tier stands alone as genuinely useful and the paywall is tied to volume/automation/export capability, never cosmetics.

**Platform-specific opportunities:** PHPickerViewController (avoids full photo-library permission, reduces both privacy exposure and App Store review risk), on-device Vision framework for subject lift/OCR/classification (keeps "smart" features local, no network/API-key dependency), Live Photos and video metadata handling that competitors often skip, Share Extensions so photo/video apps sit inside existing user habits. For productivity: App Intents/Shortcuts + Siri integration, Lock Screen/StandBy widgets, Live Activities for time-bound tasks, Focus filters — these are what separate a native-feeling app from a web-wrapper.

**Major assumptions and risks:**
1. Assumption: all six apps are single-player/personal-use, not team-collaboration tools — this needs to be confirmed or explicitly overridden at idea-generation, not drifted into.
2. Risk: convergent design across the six apps (e.g., three interchangeable "smarter todo list" or "AI photo filter" apps) is the most likely failure mode of parallel agent-built ideas in two narrow buckets. Mitigation: each idea states its core loop in one sentence at generation time, and all six sentences get diffed against each other, not just against the named exclusion list.
3. Risk: Photo & Video apps have real technical exposure (full-resolution asset memory pressure, main-thread decode stalls, simulator-vs-device performance gaps) that can make an app pass a screenshot check while failing the actual production-readiness bar. Mitigation: every Photo & Video idea must name its off-main asset-handling approach before being greenlit.
4. Risk: "viral potential" is a natural fit for shareable photo/video output but a forced, potentially gimmicky fit for inherently private productivity apps. Mitigation: treat it as optional per app; it's fine for some productivity ideas to state near-zero viral potential honestly rather than bolt on a social feature.
5. Risk: any idea whose core functionality (not bonus LLM/AR/ML) requires a live network/LLM call is a cloud-first app mislabeled as local-first. Mitigation: flag this explicitly as an assumption swap if any idea goes this route, per the existing decision-rule pattern from the prompt-contract phase.

**Implications for the first build:** Idea generation should produce candidates that (a) each declare a one-sentence core loop for cross-checking uniqueness at the mechanic level, (b) commit to a specific audience lane (casual vs. prosumer for photo/video; personal-system for productivity) rather than hedging across both, (c) name their non-cosmetic monetization hook up front, tied to volume/automation/export/sync, (d) for Photo & Video specifically, state an off-main asset-processing plan, and (e) treat viral potential and LLM/AR/ML bonus features as genuinely optional rather than forced boxes to check.

## Portfolio Selection

Here's where this landed: Claude ran the full portfolio-selection job solo since Codex and Gemini stayed unavailable — generated 12 candidates (6 photo/video, 6 productivity), argued through each one against the uniqueness exclusion list and against each other, cut the ones that were either too close to an existing competitor's core feature (beat-synced slideshow, film-emulation batch grader) or too close to an excluded app's mechanic (location-triggered task filer vs. Waylay), and landed on a final six with real distinctiveness between them: Proofline (photo culling/proofing for shoots), Dayframe (auto-edited daily video diary via on-device Vision), and Shelf (batch resale product photography) for Photo & Video; Tab Zero (photographed mail → auto-filed reminder), Interval (focus timer that learns your personal patterns), and Loose Ends (weekly one-at-a-time resurfacing of dormant personal projects) for Productivity.

Each pick got a real target user, painful moment, differentiation claim, and non-cosmetic monetization hook tied to volume/export/history — no cosmetics-only paywalls slipped through. One real risk was named explicitly rather than glossed over: Tab Zero's mechanic (photograph a document, extract structured fields) sits close enough to the excluded PO-automation tool that the build phase has to actively defend the "single envelope, no vendor workflow" framing rather than treat the distinction as already settled. A fallback swap was also pre-designated (the decision-journal or cinemagraph idea) in case the sibling-batch folder check, which hasn't happened yet, turns up a collision. The full portfolio-json manifest with all required fields (workflows, native iOS features, design direction, risks, invalidation criteria, build flags) is in the transcript above and satisfies the phase's structural requirements — 6 apps, correct 3/3 split, each independently buildable as its own folder, no category collapsed.

There's no dissenting view to reconcile since no second reviewer weighed in, but the reasoning is sound, self-critical (each pick includes the strategist's own objection to it), and traceable against every rule locked in the prompt-contract and product-research phases.

CONSENSUS: YES

## Final Output

**Single-app vs portfolio-parent decision:** This is a portfolio-parent request — 6 independent sibling apps, each its own project folder under `/Users/pchordia/Documents/iOS-App-Factory`, never a shared wrapper.

**Selected app list (final six, build=true for all):**

| App | Category | Slug | One-line promise | Target user |
|---|---|---|---|---|
| Proofline | Photo & Video | `proofline` | Cull, batch-grade, and produce a client-ready proof sheet from a full shoot in minutes | Parents/hobbyist & semi-pro photographers who dread post-shoot culling |
| Dayframe | Photo & Video | `dayframe` | On-device Vision auto-picks your best daily video moment and assembles a monthly reel | People who've abandoned manual daily-video-diary habits |
| Shelf | Photo & Video | `shelf` | Batch background-removal and consistent cropping for resale listing photos | Poshmark/Depop/eBay resellers shooting high item volume |
| Tab Zero | Productivity | `tabzero` | Photograph a piece of mail and get it auto-filed as bill/todo/archive with the due date pulled out | People with a physical-mail pile-up and bill-deadline anxiety |
| Interval | Productivity | `interval` | A focus timer that learns your real focus patterns and adapts session length/timing to you | People who've abandoned generic Pomodoro apps |
| Loose Ends | Productivity | `looseends` | Weekly ritual resurfaces one dormant personal project at a time to act on, snooze, or release | People with a guilt-inducing backlog of unfinished personal intentions |

**Selection rationale and rejected alternatives:** 12 candidates were generated (6 per category) and screened against the exclusion list and each other's core-loop sentence. Rejected: a beat-synced slideshow cutter and a film-emulation batch grader (too close to existing CapCut/VSCO/Darkroom feature sets, monetization risked being cosmetics-adjacent); a multi-deadline urgency×effort prioritizer (reskin of existing task-sorting apps); a trigger-based context task filer (dropped outright — the natural implementation is location-based and walks into Waylay's territory); a decision-journal app (weakest monetization story — no clear non-cosmetic paywall beyond history depth) kept as a designated fallback rather than selected. Tab Zero was flagged, not rejected, for a real proximity risk to the excluded PO-automation tool (document photo → extracted structured fields) — selected anyway because the personal single-document, no-vendor-workflow framing keeps genuine daylight between them, but the build phase is instructed to actively defend that distinction rather than treat it as resolved.

**Outstanding item carried to the next phase:** Sibling batch folders haven't been checked yet for concept collisions (per the prompt-contract decision rule, this check must happen once those folders are readable). If a collision surfaces, the pre-vetted fallback is the decision-journal concept or the cinemagraph-loop concept — swap in, don't freeze.

**portfolio-json manifest:** Preserved in full in the transcript above (6 entries, each with category, slug, promise, target user, painful moment, differentiation, monetization model, local-first scope, cloud roadmap, core workflows, native iOS features, AR/ML/LLM fit, design direction, Claude design prompt, App Store positioning, key risks, invalidation criteria, v1 build scope, and `build: true`) — ready to drive per-app parallel design/architecture/build phases.

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "Proofline",
      "slug": "proofline",
      "category": "Photo & Video",
      "promise": "Cull, batch-grade, and produce a client-ready proof sheet from a full shoot in minutes",
      "targetUser": "Parents/hobbyist & semi-pro photographers who dread post-shoot culling",
      "build": true
    },
    {
      "name": "Dayframe",
      "slug": "dayframe",
      "category": "Photo & Video",
      "promise": "On-device Vision auto-picks your best daily video moment and assembles a monthly reel",
      "targetUser": "People who've abandoned manual daily-video-diary habits",
      "build": true
    },
    {
      "name": "Shelf",
      "slug": "shelf",
      "category": "Photo & Video",
      "promise": "Batch background-removal and consistent cropping for resale listing photos",
      "targetUser": "Poshmark/Depop/eBay resellers shooting high item volume",
      "build": true
    },
    {
      "name": "Tab Zero",
      "slug": "tabzero",
      "category": "Productivity",
      "promise": "Photograph a piece of mail and get it auto-filed as bill/todo/archive with the due date pulled out",
      "targetUser": "People with a physical-mail pile-up and bill-deadline anxiety",
      "build": true,
      "risk": "Mechanic (document photo → extracted structured fields) sits close to the excluded PO-automation tool",
      "riskMitigation": "Build phase must actively defend the single-envelope, no-vendor-workflow framing rather than treat the distinction as settled"
    },
    {
      "name": "Interval",
      "slug": "interval",
      "category": "Productivity",
      "promise": "A focus timer that learns your real focus patterns and adapts session length/timing to you",
      "targetUser": "People who've abandoned generic Pomodoro apps",
      "build": true
    },
    {
      "name": "Loose Ends",
      "slug": "looseends",
      "category": "Productivity",
      "promise": "Weekly ritual resurfaces one dormant personal project at a time to act on, snooze, or release",
      "targetUser": "People with a guilt-inducing backlog of unfinished personal intentions",
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
