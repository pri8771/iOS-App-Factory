# proof — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things actually stand: Codex and Gemini couldn't weigh in this round (both CLIs unavailable), so this is really just Claude thinking out loud and checking its own work — there's no cross-agent disagreement to report because no one else was in the room. Given that, and given that the analysis is internally consistent and directly answers what the phase playbook asked for, I don't see a reason to spin another round waiting on tools that aren't coming back online. Calling this converged.

The core call: this phase is scoping *one child app* (Proof), not re-running the parent portfolio's "generate 10 ideas, pick 7" process — that already happened upstream. The child spec is treated as a locked decision, and this phase's job is just to turn it into a build contract.

A few things got flagged as "must decide explicitly, don't let it slide": what happens when labor time is zero/unset (should visually flag it, not silently present a materials-only number as "true cost"), whether unit conversion between purchase-unit and recipe-unit is supported or explicitly punted with disclosure, what happens at the free/paid boundary when a user has 2+ products and downgrades, and whether batch costs are snapshotted at creation time vs recomputed live (recommendation: snapshot, so profit trends stay meaningful). These aren't resolved with final mechanisms here — that's for design/architecture — but the contract requires whoever builds them to make a written decision instead of accident.

CONSENSUS: YES

## Final Output

**Scope of this phase:** This is a single child-app build (Proof), not the 7-app parent portfolio process. The app idea, name, category, and pricing are already locked by the upstream spec — this phase does not re-open ideation or selection.

**Original prompt:** preserved verbatim above in this phase's transcript (the full `initial_prompt.md` content, including both the Proof spec and the parent portfolio prompt it was drawn from).

**Hard requirements:**
- Local-first SwiftUI app, iOS-native persistence via SwiftData.
- Data layer built behind a repository protocol seam now (not deferred), even though only a local implementation exists in v1.
- All five core workflows fully implemented, not stubbed: define product/recipe with materials & quantities; log labor time per batch; calculate true per-unit cost; get a suggested minimum price for a target margin; track profit trend across batches.
- StoreKit 2 paywall in v1, gating unlimited products vs. the 1-product free tier — including the paywall's own loading/pending/failed-purchase/restore states.
- iOS-native features are in-scope, not optional polish: WidgetKit widget showing last batch's margin, share-sheet export of a priced product card, Dynamic Type/VoiceOver-accessible data-entry forms.
- Full state coverage (empty, loading, success, error) on every reachable screen, explicitly including the two spec-named states: no product yet, and labor rate not yet set.
- Suggested price must be a transparent, inspectable formula (e.g. cost ÷ (1 − target margin)) — auditable, not a black box.

**Non-goals (explicitly out of scope):**
- No AR, no on-device ML, no LLM feature of any kind, including "smart" pricing suggestions — the spec is deliberate about this being disciplined accounting software, not novelty tech.
- No cloud sync, no account system, no server, no real remote repository implementation.
- No multi-user / team / collaborator features.
- No marketplace sales importer — only the interface seam for one, per the spec's "future" language.
- No third-party dependencies unless something materially reduces risk (none identified — SwiftData, StoreKit 2, WidgetKit, Charts cover it).
- No Jira/Notion backfill artifacts or multi-app transcript bundling as part of this child project unless a later phase explicitly pulls that in — treated as parent-portfolio-level deliverables, not part of this build.

**Production-readiness definition:**
- Builds and runs on a real simulator/device target with no crashes across all five core workflows plus the paywall flow.
- Every reachable screen has defined empty/loading/success/error states, including the two named ones.
- SwiftData model survives relaunch and a realistic dataset (dozens of products, dozens of batches each) without degrading.
- VoiceOver can complete every core workflow end-to-end, not just have labels present.
- StoreKit 2 entitlement gating is actually enforced, not just visually implied.
- Explicit, written decisions exist (even if the decision is "not supported in v1, disclosed as a limitation") for: unit-conversion handling and cost-snapshot-vs-recompute. Silence on these is not acceptable.
- Does NOT require cloud sync, AR/ML/LLM, or Jira/Notion artifacts to count as "done."

**Decision rules for later phases:**
1. Where the child spec and the parent portfolio prompt conflict on scope, the child spec wins — it's a narrowed instance of the portfolio work.
2. Where the child spec is silent but a global build rule applies (local-first-but-cloud-ready architecture, no third-party deps without justification, real production quality, full state coverage), the global rule still governs.
3. Where scope creep tempts toward AI-assisted/"smart" pricing, "no bonus tech" wins outright — the pricing logic must stay a transparent formula.
4. Design/architecture phases must make explicit, written calls on: labor-zero/unset handling (default: visually flag as excluded from cost), unit conversion (support it or explicitly disclose the single-unit limitation), free-tier boundary behavior on downgrade (data retained read-only vs. lost — must be decided, not defaulted by accident), and cost snapshot vs. live recompute (default recommendation: snapshot at batch creation time).

## Initial Discussion

Here's the state of play: same as last phase, Codex and Gemini were both unreachable, so this round is really just Claude stress-testing its own read of the spec rather than a real multi-agent debate. There's no disagreement to referee because no one else showed up — but the single perspective offered is thorough, internally consistent, and directly answers what this phase's playbook asks for (promise, user, core loop, scope boundaries, success criteria). I don't see value in spinning another round hoping the other CLIs come back online, so I'm calling this converged on the strength of the one analysis given.

The key shift from the discussion: the core loop has to be sequenced so a brand-new, math-phobic user reaches "see a suggested price" in under ~5 inputs on their very first product — the reusable material library is a second-product discovery, not a first-product prerequisite. And "success" for this app can't just mean "workflow completes" — it has to mean the calculation is provably stable (same inputs always produce the same output, no rounding drift as data flows library → recipe → batch → price), because the entire product is a trust claim about a number.

CONSENSUS: YES

## Final Output

**One-sentence product promise:** Proof tells a small-batch maker, in one sitting, the true cost per unit of what they just made — materials plus their own labor — and the minimum price that keeps them from losing money on it.

**Primary user and scenario:** A side-hustle maker (candles, soap, baked goods, jewelry, etc.) who has been pricing by gut feel, just finished a batch, and wants a real answer to "did I actually make money on this" — not a spreadsheet project, a two-minute check.

**Core loop:**
1. Define a product with its materials and quantities (first time through, this should be as few as 5 inputs — no forced pre-built material library, no unit-conversion setup required to get a first number).
2. Log labor time for a batch at a user-set hourly rate.
3. See the true per-unit cost (materials + labor) and a suggested minimum price for a target margin, computed via a transparent, inspectable formula.
4. Repeat for future batches; watch a simple cost/margin trend line build up over time.
5. On a second product, discover the reusable material library as a time-saver — not a gate the first product had to pass through.

**Hard scope boundaries (explicit exclusions for this phase):**
- No categories/tags on materials or products.
- No editing a batch's cost inputs after the fact — a batch snapshot is immutable once created; don't let "fix a typo" become a live-recompute debate.
- Profit-trend reporting is a single cost/margin-per-unit-over-time line, not a multi-metric dashboard.
- No AI-assisted or "smart" pricing — the suggested price stays a plain, auditable formula (cost ÷ (1 − target margin)).
- No cloud sync, accounts, multi-user, or marketplace importer (carried forward from the prompt-contract phase).

**Measurable success criteria:**
1. A new user can create one product, log one batch (≥1 material + labor entry), and see a suggested price in under 2 minutes of realistic use.
2. Identical batch inputs always produce an identical true-cost output, no matter how many times or in how many places it's displayed (no silent rounding drift across library → recipe → batch → price).
3. The app never shows a "true cost" or "suggested price" without visually indicating whether labor was actually included.
4. The free tier's single product gets the full pricing/trend feature set — the paywall gates product *count*, never calculation quality.

## Per App Product Brief

Both Codex and Gemini were unavailable again this round — Codex in cooldown, Gemini's CLI still broken — so this is once more just Claude's single pass, not a real multi-agent debate. But that pass is thorough and hits every element the phase playbook asks for: a specific target user (Maren, the soap maker), a concrete core loop sequenced for a first-time user, real (non-cosmetic) paid value tied to a natural second-product wall, a competitive wedge that's specific to this app (labor as a mandatory, visually-flagged first-class number, not a spreadsheet afterthought), a growth angle that's honest about being niche rather than forcing virality, and an explicit local-first/cloud-later stance tied to the trust story, not just architecture. Nothing here contradicts the locked decisions from prompt_contract or initial_discussion — it builds directly on them (snapshot batches, labor-zero visual flagging, five-input first product). I don't see anything left to hash out that requires another round of the same single voice talking to itself, so I'm calling this converged.

CONSENSUS: YES

## Final Output

**Target user and use case:** Side-hustle makers (soap, candles, baked goods, jewelry) who price by gut feel and have never actually run the math on their own labor time. The trigger moment: they just finished a batch and want a real answer to "did I make money on this," not a bookkeeping project.

**Core loop:** Name a product → add materials as you think of them (what you paid, how much that bought, how much this batch used) → log labor hours against an hourly rate (quick-pick chips: 30 min/1hr/2hr/custom, never silently defaulted to zero) → get true cost per unit and a suggested minimum price via a transparent formula → repeat for future batches and watch a cost/margin trend build. First product should take under 5 minutes and require no pre-built library or unit-conversion setup — the reusable material library reveals itself as a time-saver starting on product/batch two, never as a gate in front of product one.

**Paid value / subscription value:** Free tier gets exactly one product, but that product is fully featured — full cost calc, full suggested pricing, full trend history — because the free tier's job is to earn trust, not to be a crippled trial. The wall is hit only when a maker wants to track a second product line. Paid (~$5.99/mo or $44/yr) unlocks unlimited products, a shared reusable material cost library across products, and profit-trend history across the whole business (e.g. seeing every product touched by an ingredient price change) — real business intelligence a spreadsheet user would otherwise build by hand.

**Competitive wedge:** Every generic costing tool treats labor as optional or an afterthought line item. Proof makes labor a mandatory, always-visible part of the number and visually and unmissably flags "labor not included" whenever it's zero or unset — refusing to let an incomplete materials-only number pass as "true cost." That's both the differentiation and the built-in safeguard against the app's own named failure mode (users quietly stopping labor entry).

**Viral/niche growth angle:** No forced referral or invite mechanic — this user base competes for customers, not for app adoption, so a viral loop would feel exploitative to an already money-anxious user. The one genuine growth surface is the share-sheet export of a clean, ledger-styled priced product card ("Lavender Soap Bar — true cost $4.12, priced at $7") — an artifact makers already want for themselves that happens to be postable in Etsy-seller Facebook groups or craft-fair Discords when someone asks how they price things.

**Local-first / cloud-ready plan:** V1 is fully on-device — this is part of the trust pitch itself ("your margins live on your phone, nobody else sees them"), not just a technical default. The data layer sits behind a repository protocol boundary now so that multi-device sync (log a batch at the market, review trends at home) can be added later without a rewrite, but v1 never makes the user wait on or depend on a server.

**Why it deserves to exist:** It ends one specific, common, quietly damaging self-deception — sub-cost pricing — for a user group that has no realistic path to figuring this out via a spreadsheet, a bookkeeper, or a general-purpose costing app that treats their own time as free.

## Detailed Discussion

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## App Features

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
