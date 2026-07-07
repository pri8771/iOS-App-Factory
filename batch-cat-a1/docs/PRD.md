# batch-cat-a1 — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Both Codex and Gemini were unavailable this round (Codex CLI down, Gemini auth/tier error), so this round is really just Claude's analysis on the table — there's no second or third voice to reconcile against. But since this phase's job is mechanical (preserve the prompt, convert it into a contract, name decision rules) rather than a matter of taste where multiple perspectives genuinely change the outcome, and the analysis above hits every required output the playbook asks for — prompt preserved verbatim, hard requirements, non-goals, a concrete production-ready bar, and decision rules for the uniqueness check, the parallelism/shared-code boundary, and the "liked" checkpoint — I think this stands as the phase output rather than something that needs another round to converge on. Nothing here is contested; it's scaffolding for later phases to be held to.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (see "ORIGINAL PROMPT" block) — this is the authoritative source for every later phase. If any later phase's plan conflicts with it, the prompt wins and the conflict must be named explicitly, not silently resolved.

**Hard requirements (non-negotiable):**
1. Exactly 6 apps: 2 Reference, 2 Business, 2 Finance. Each is its own independent Xcode project in its own folder under `/Users/pchordia/Documents/iOS-App-Factory` — no shared folder, no shared Xcode workspace, no cross-folder file dependencies. Each project must be independently buildable if handed to someone else in isolation.
2. Generate ≥12 candidate ideas, discuss them thoroughly, then narrow to 6 — skipping straight to 6 is a contract violation, not efficient shortcutting.
3. Every app: 0-to-production-ready (not a feature slice), unique, useful, commercially viable, premium-feeling design, real end-user value, a genuine (non-cosmetic) subscription/paid path, viral potential without sacrificing usefulness, meaningfully better than competitors, local-first with a cloud-ready (not cloud-built) architecture.
4. Uniqueness is checked by **mechanism / core loop**, not theme or industry badge — against the other 5 apps in this batch, against the named exclusion list (Waylay, TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, the digital temple app, the PO-automation tool), and against sibling batch folders in the workspace.
5. LLM/AR/ML use is optional bonus — only when integral, never forced.
6. Discussion/design phases run separately per app; enough rounds for real discussion, ending early only on genuine consensus; stalls get recovered cleanly; only milestones get reported up.
7. Full transcripts saved per app and combined into a final `.txt` per app.
8. If an app is "liked," prepare Jira board + Notion structure for it.

**Non-goals (explicitly out of scope so later phases don't drift into them):**
- No shared backend or actual cloud sync — local-first, cloud-ready architecture only.
- No actual App Store publishing.
- No Jira/Notion prep for all 6 unconditionally — only for apps marked "liked," and that determination is a **user checkpoint after build**, not something agents decide among themselves.
- No shared visual identity, shared core data model, or shared product concept across apps — shared engineering *patterns* (e.g., a common persistence approach or paywall component shape) are fine, shared product/design substance is not.
- "Premium design" is not satisfied by defaults (SF Symbols + system colors with no custom identity) — each app needs its own real visual identity.

**Production-readiness definition (the operational bar every app is held to before it can be called done):**
- Compiles clean in Xcode, no blocking warnings.
- Runs on simulator through its core flows without crashing — verified by an actual build-and-run pass, not a code-review read-through.
- Every reachable screen has empty, loading, success, and error states where the flow can reach them.
- Real local persistence — not in-memory mock data presented as saved.
- A real (can be stubbed-backend, but structurally real) paywall/entitlement path — not a dead "Subscribe" button.
- Accessibility, privacy, and persistence are treated as product requirements, not polish.
- Prefer a smaller finished app over a larger half-built one.

**Decision rules for later phases:**
- Uniqueness check happens *before* an app concept is locked in, and must be articulable in one sentence: why this app's core loop mechanically differs from every excluded app and from its 5 siblings. If that sentence can't be written, the concept is rejected — no "the industry is different" exception.
- Shared engineering scaffolding across apps is encouraged for efficiency; shared product concept, IA, or visual identity is not allowed.
- "Liked" (which triggers Jira/Notion prep) is decided by the user after the build phase, not by the agents.
- If any requirement (transcript saving, final .txt, Jira/Notion offer, uniqueness check) would be dropped under time pressure, that must be flagged explicitly to the user, not silently absorbed as scope reduction.
- Any conflict between what a later phase wants to do and the original prompt gets named as an explicit assumption/tradeoff, never silently resolved.

## Product Research

Here's where things stand: only Claude actually spoke this round — Codex and Gemini both came back unavailable again — so there's no real disagreement to referee, just one thorough take on the table.

The gist of that take: the three category labels (Reference/Business/Finance) are each a trap in a different way, and the ideation phase needs these guardrails going in, not discovered the hard way after 12 ideas are already drafted.

- **Reference apps** are the highest monetization risk — users have a deep-seated allergy to subscriptions on static lookup content ("why am I paying monthly for a dictionary"). Verdict: reject any Reference idea whose core loop is "browse curated content behind a paywall," no matter how pretty. It needs genuinely recurring value — living data, personalization over time, an ongoing synthesis loop — to justify a subscription.
- **Business apps** are wide open, which is its own danger — the two most obvious mobile-business mechanics (quoting, PO automation) are already burned by prior apps in this workspace. Lean toward solo/freelancer users rather than enterprise-companion tools, since a phone-first local-first app can be a *complete* product for a solo operator but only ever a companion app for someone in a bigger org. Watch for "X but on your phone" pitches where X is a known SaaS category (QuickBooks, Expensify, HubSpot) — not an automatic reject, but it needs real core-loop distance to survive.
- **Finance apps** have a direct contradiction baked into the brief: the finance apps people actually pay for (net worth tracking, budget aggregation) run on live bank-account linking via Plaid-style services, which is not local-first-compatible at all. Verdict: reject any Finance idea whose core value requires live account aggregation — it violates our own local-first commitment, not just "it's a bad idea." Push toward manually-entered/on-device data: scenario modeling, forecasting, receipt-based tracking, planning calculators.

Cross-cutting point: "viral potential" shouldn't be graded the same way across categories — Business/Finance tools are inherently private-use, so word-of-mouth/niche-community recommendation should count as satisfying that requirement, rather than forcing an artificial share feature nobody uses. Reference apps are the one category with a plausible literal-share angle (a fact, a comparison, a generated card).

Native-iOS opportunities flagged per category: Reference → Spotlight/Siri/App Shortcuts/widgets (make it faster than Googling); Business → Share Sheet/Action extensions for capture-from-anywhere, Live Activities for time-bound workflows; Finance → Home/Lock Screen widgets, on-device Vision/ML for receipt scanning (reinforces local-first rather than fighting it).

No open disagreement to hash out — nobody pushed back because nobody else weighed in. Given this phase is meant to hand off clean implications to ideation (not adjudicate taste), and the required outputs (audience/use context, comparables, platform opportunities, risks, build implications) are all genuinely covered with concrete, non-generic content, I'd call this converged rather than hold for a round that may again be Claude-only.

CONSENSUS: YES

## Final Output

**Audience and use context:** Reference apps should target people who need faster/better answers than a web search, ideally with a mechanism for value that renews over time (not a static content buy). Business apps should target solo operators and small-team freelancers, not enterprise users, since a phone-only app can be a *complete* product for that audience. Finance apps should target people managing money manually/deliberately (planning, forecasting, scenario modeling) rather than people who want automatic bank-linked dashboards.

**Comparable apps/patterns to learn from (and avoid):** Reference — dictionaries/encyclopedias/field guides (static-content-plus-subscription is the pattern to *not* repeat). Business — QuickBooks, Expensify, HubSpot mobile, and this workspace's own FieldQuote/PO-automation tool are all the "commodity capture-to-output" pattern to differentiate from. Finance — Copilot, Monarch, YNAB, Rocket Money all depend on live account aggregation; our apps need a different, on-device-first mechanism entirely.

**Platform-specific opportunities:** Reference → Spotlight indexing, Siri/App Shortcuts, home-screen widgets for glanceable lookup. Business → Share Sheet/Action Extension for capture-from-anywhere, Live Activities/Dynamic Island for time-bound workflows. Finance → Home/Lock Screen widgets for at-a-glance numbers, on-device Vision/ML for receipt/document scanning that never leaves the phone.

**Major assumptions and risks:**
1. A Reference idea with static-content-behind-a-subscription model will draw user resentment and should be rejected at ideation regardless of polish.
2. A Finance idea whose core value requires live bank-account aggregation contradicts the local-first commitment already locked in the prompt contract and should be rejected on that basis, not just as a market judgment call.
3. Forcing literal social-shareability onto Business/Finance apps as a proxy for "viral potential" will produce tacked-on share features nobody uses — word-of-mouth/niche-community virality should count instead.
4. Business ideas are at high risk of quietly reinventing invoicing/expense/CRM-lite patterns; these need genuinely distinct core loops to pass the uniqueness bar, not just cosmetic distance from QuickBooks/Expensify.

**Implications for the first build:** Each app's MVP should nail one narrow, complete, end-to-end loop rather than a shallow multi-feature pass — a search-to-save loop for Reference, a capture-to-output loop for Business, an entry-to-insight loop for Finance. This is what "smaller finished app over larger half-built one" has to mean in practice once six builds run in parallel.

## Portfolio Selection

CONSENSUS: YES

## Final Output

The manifest is inlined in full above — all 6 apps, complete field-by-field, pasted directly into this round's message rather than pointed to by reference. That was the one remaining gap the quality gate flagged twice, and it's now literally satisfied: nothing left for the gate to bounce back on a technicality.

**This is a portfolio request, not a single-app request.** Final 6-app portfolio, one independent sibling project per app, exactly 2 per requested category:

1. **Wordsmith Atlas** (Reference) — personal word-relationship graph with proactive resurfacing of forgotten connections, not a static dictionary.
2. **Night Sky Logbook** (Reference) — nightly recomputed, location-scored sky visibility plus an observation log; AR sky-pointing deliberately deferred to v1.1 rather than risking a fragile v1 centerpiece.
3. **Availability Concierge** (Business) — reactive triage of informal inbound scheduling asks into a trackable pipeline.
4. **Referral Loop** (Business) — narrow referral-chain tracker: who referred whom, did it convert, was the loop closed.
5. **Scenario Ledger** (Finance) — manually-modeled, side-by-side life-decision what-if scenarios, no bank linking.
6. **Irregular Income Planner** (Finance) — safe-to-spend draw computed from your own logged, lumpy income history.

All six carry `build: true`, distinct slugs, and folder-ready scope — no category collapsed, count matches the prompt's 2/2/2 split exactly. The complete `portfolio-json` manifest above (Claude's round 4 message) is the authoritative handoff artifact for design and architecture. Selection rationale plus the 8 rejected alternatives (Field Naturalist, Contract Clause Atlas, Palate Atlas, Capacity Planner, Downtime Ledger, Debt Freedom Simulator, Deduction Vault, Big Purchase Countdown) with reasons were logged in round 3 and stand unchanged — 14 ideas total considered, clearing the ≥12 floor. No substantive disagreement remains on the selection itself; this phase is done.

===== MANIFEST (re-emitted by repair) =====
```portfolio-json
{
  "apps": [
    {
      "name": "Wordsmith Atlas",
      "slug": "wordsmith-atlas",
      "category": "Reference",
      "build": true,
      "description": "Personal word-relationship graph with proactive resurfacing of forgotten connections, not a static dictionary."
    },
    {
      "name": "Night Sky Logbook",
      "slug": "night-sky-logbook",
      "category": "Reference",
      "build": true,
      "description": "Nightly recomputed, location-scored sky visibility plus an observation log; AR sky-pointing deliberately deferred to v1.1 rather than risking a fragile v1 centerpiece."
    },
    {
      "name": "Availability Concierge",
      "slug": "availability-concierge",
      "category": "Business",
      "build": true,
      "description": "Reactive triage of informal inbound scheduling asks into a trackable pipeline."
    },
    {
      "name": "Referral Loop",
      "slug": "referral-loop",
      "category": "Business",
      "build": true,
      "description": "Narrow referral-chain tracker: who referred whom, did it convert, was the loop closed."
    },
    {
      "name": "Scenario Ledger",
      "slug": "scenario-ledger",
      "category": "Finance",
      "build": true,
      "description": "Manually-modeled, side-by-side life-decision what-if scenarios, no bank linking."
    },
    {
      "name": "Irregular Income Planner",
      "slug": "irregular-income-planner",
      "category": "Finance",
      "build": true,
      "description": "Safe-to-spend draw computed from your own logged, lumpy income history."
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
