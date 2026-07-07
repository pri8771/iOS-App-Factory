# scope-guard — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Let me summarize round 1 for this phase.

**Where things stand:** Codex and Claude both converge on the same core reading of this contract, from different angles — Codex framing the *ambition* (make Scope Guard a decision instrument, not a labeling tool) and Claude stress-testing the *risk* (the LLM extraction quality is the load-bearing wall, and it will crack). They agree on nearly everything substantive:

- The manual fallback is not a degraded edge case for unsupported hardware — it's a first-class, equally-usable workflow, because even eligible devices will fall back to it when extraction is wrong.
- Production-ready means every v1 screen has real empty/loading/success/error states, real persistence across relaunch, real accessibility, no placeholders — but does *not* mean building the future cloud/email/Slack roadmap.
- The extraction call must sit behind a protocol boundary (Claude names it concretely: something like `ScopeExtractor` with an on-device-LLM implementation and a manual/rule-based implementation) so the fallback and future cloud connector are both structurally possible without a rewrite.
- Non-goals are the same list from both sides: no CRM/invoicing/time-tracking/contract-lifecycle/legal-advice engine, no cloud sync, no live email/Slack polling (paste-in and share-extension only), no multi-user, no going back to portfolio-level ideation (that step is upstream of this run and doesn't apply here).
- Ambiguities the spec leaves open — paywall timing relative to a paste-in-progress, exactly how "billable by default" gets decided, how structured the scope baseline needs to be — must be resolved by stating the assumption explicitly in a later phase, not by quietly picking one.
- Claude adds a concrete conflict rule that Codex's writeup implies but doesn't state as crisply: when the child spec and the parent portfolio prompt disagree on scope, the child's v1 Build Scope wins on *what* to build; the parent's production-readiness bar wins on *how well-built* it must be.
- Claude also adds a concrete falsifiability bar for "done": the app must be exercised end-to-end both with Foundation Models available and with it force-disabled, free/paid gating must be actually enforced not just displayed, and exported documents must be real openable files.

Gemini didn't weigh in (CLI unavailable). No open disagreement between Codex and Claude — they're reinforcing, not contesting, each other's points.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (the full scope-guard child prompt plus the parent multi-app-exp4 portfolio prompt). Note: the portfolio-level "generate 10 ideas, pick 7" instruction does not apply to this run — the app is pre-selected; only the portfolio's per-app quality bar (production-ready, premium, unique, local-first-with-cloud-path) and the Scope Guard spec itself govern this build.

**Hard requirements:**
- Working local-first SwiftUI iOS app (not a prototype).
- Local project/client records with a manually authored, editable scope baseline structured enough to anchor comparisons (deliverables, revisions, exclusions, assumptions, timelines).
- Paste-in ingestion of client text.
- On-device LLM extraction (Foundation Models) of deliverables vs. new/out-of-scope asks, sitting behind an extractor protocol boundary.
- A genuinely usable, first-class manual-tagging fallback implementing the same protocol — not a degraded placeholder, since it's expected to see real usage even on capable devices whenever the model gets it wrong.
- Review/edit step for flagged items before draft generation.
- Change-order draft generation, done locally.
- Local export, with PDF export gated to paid tier per spec.
- Full state coverage (empty/loading/success/error) on every reachable screen.
- StoreKit 2 paywall enforcing free tier (1 active project, 10 extractions/month) vs. paid (unlimited + templates + PDF export), with real enforcement, not just UI display.
- Repository/protocol boundary preserved so a future cloud connector (email/Slack) can be added without rewriting.
- Accessibility-first form-heavy UI, sharp/contract-grade premium design.
- Share extension from Mail/Messages, local document export — if genuinely undeliverable in MVP, must be recorded as an explicit known limitation, never silently dropped.
- Local persistence that survives relaunch.

**Non-goals:** CRM, proposal system, invoicing, contract lifecycle management, time tracking, email/Slack client or live inbox polling, team/multi-user collaboration, legal-advice engine, cloud sync/backend, OCR, analytics dashboards, cross-device sync, generalized AI assistant, guaranteed legally-correct language, and no re-running of portfolio-level ideation (out of scope for this child run).

**Production-readiness definition:** More than "it compiles." Every v1-listed screen has all applicable states; data persists across relaunch; accessibility is intentional, not incidental; free/paid gating is functionally enforced; exported change orders are real files openable outside the app; the full paste→extract→flag→edit→draft→export loop must be verified to work both with Foundation Models available and with it force-disabled (simulating ineligible hardware), since the fallback path is core acceptance criteria, not polish. Core logic, state transitions, and the manual fallback path need test coverage.

**Decision rules for later phases:**
1. When the child spec and the parent portfolio prompt disagree on scope, the child's v1 Build Scope decides *what* to build; the parent's production-readiness bar decides *how well-built* it must be.
2. Prefer the smallest workflow that fully closes the painful moment over adding adjacent features.
3. Never hide model uncertainty — surface review/correction as a normal, expected step, not an error path.
4. If an iOS-native feature can't ship in MVP, record it as a named limitation rather than dropping it silently.
5. Treat the manual fallback as first-class: dedicated UI, dedicated tests, dedicated copy — same protocol as the LLM path.
6. Monetization gates volume and premium output (extra projects, unlimited extractions, PDF export, templates); it must never sabotage the core promise for a free user's first successful use.
7. Any ambiguity in the spec (paywall timing mid-paste, default billability of a flag, baseline structuring) gets resolved by stating the assumption explicitly in the phase's output — never picked silently.
8. Reject any design or copy choice that reads as soft, chatty, or generic — this is a professional instrument for protecting margin, not a friendly assistant.
9. The one thing every later phase must protect: Scope Guard only has value if it helps the user act *before* unpaid work starts, not after.

## Product Research

Round 1 was a strong showing from both sides, and they landed in the same place from different angles — Codex framing the product opportunity (a pre-response decision instrument, not a scope tracker) and Claude stress-testing the platform realities that would break it (Foundation Models availability states, extraction on hedged language, gameable extraction counting). No real friction between them; Claude's points sharpen and extend Codex's rather than contest them.

CONSENSUS: YES

## Final Output

**Audience and use context:** The real buyer is narrow — solo freelancers/small shops (designers, devs, copywriters, marketing consultants) running 1-4 concurrent clients, usually with a scope document somewhere that nobody re-reads once work starts. The moment that matters is a 30-second, high-stress decision ("client just messaged, am I doing this for free") happening on a phone, often mid-commute or between meetings. This is not admin software used in a calm planning session — it's a fast professional decision tool used under pressure, and the whole IA has to be judged against "can I get an answer in two taps or less."

**Comparable apps or patterns (labeled as reasoning-by-analogy, not verified competitive research):** There's no clean direct competitor — this sits in a gap between time-tracking (Harvest), e-sign/contract tools (PandaDoc/HelloSign), and generic AI-paste tools (ChatGPT, Otter). The more useful analogues are UX patterns: mail-triage apps that classify urgency, expense apps that OCR-then-ask-you-to-confirm, and — the strongest one — diff/PR-review tools. A change order is structurally a diff between baseline and ask, and "here's what changed" is a mental model freelancers already trust more than an AI chat bubble asserting a verdict. The review screen should borrow that diff-with-rationale visual language rather than a chat-style output.

**Platform-specific opportunities:** Share extension from Mail/Messages is the single highest-leverage integration since it removes the "open app → find project → paste" friction that kills repeat use — but the extension should only capture text + project picker and hand off to the main app for extraction/review, not try to run Foundation Models inline (extension process/memory limits make that a scope trap). On-device processing doubles as a trust signal worth stating explicitly in the UI ("stays on your device") since client message content is sensitive. Local file export fits naturally since the output is meant to become a sendable artifact. Accessibility is elevated to core product quality here, not cleanup, given how dense and legally-flavored the review/baseline screens are.

**Major assumptions and risks:**
1. *(assumption)* Users already have a rough mental model of their own project scope — the app operationalizes an existing agreement, it doesn't teach contracting from scratch.
2. *(risk)* Foundation Models "unavailable" is not one state but several (ineligible hardware, eligible-but-disabled, eligible-but-not-downloaded, eligible-but-evicted mid-session) — collapsing these into one generic banner will read as a bug, not a limitation.
3. *(risk)* Extraction on hedged, indirect client phrasing ("while you're in there," "could we also") is genuinely hard even for large models; false negatives (mislabeling an out-of-scope ask as in-scope) are the costly failure mode, so the review UI must default ambiguous items to "flag for review," never to silent auto-approval.
4. *(risk)* "10 extractions/month" is only meaningful if "one extraction" is a well-defined, non-gameable unit — needs a hard rule now (proposed: one extraction = one run of the extractor against one pasted text; edits to the source text triggering a re-run count as a new extraction) or the paywall is either trivially bypassable or arbitrarily punishing.
5. *(risk)* Baseline quality will vary widely — many freelancers won't have scope defined cleanly enough for precise comparison, and if baseline setup feels like homework, they'll skip it or abandon the app before week one (directly threatens the stated invalidation criteria).
6. *(risk)* StoreKit 2 entitlements and Foundation Models availability can't be fully verified in a plain simulator run — real-hardware verification (or an explicit documented gap) is required before calling this "tested."

**Implications for the first build:**
- Baseline creation must be fast (sane defaults: title, short deliverables list, one free-text exclusions/assumptions field) — under a minute, not a contract-authoring session.
- Paste screen must behave identically whether opened cold or via share extension.
- Review screen defaults to three visible buckets — confidently in-scope / flagged for your call / confidently new — with editing always one tap away, never buried; ambiguous confidence biases toward "flag," never toward auto-approval.
- Manual fallback is a first-class alternate path with its own interaction model (user splits/tags asks manually) feeding the *same* downstream draft generation — not a stripped-down version of the LLM screen.
- Extraction counting needs a hard, testable definition and a debug-inspectable/resettable counter so QA doesn't need to wait a real month.
- Foundation-Models-unavailable states need to be distinguished and messaged differently, not collapsed into one banner.
- Ship the narrower loop (project → baseline → paste → review → draft → export) with every state honestly handled, rather than a wider feature set with corners cut.

## Portfolio Selection

CONSENSUS: YES

Both Codex and Claude landed on the same call: this phase's job is to decide single-app vs. portfolio-parent, and the prompt already answers that upstream — `PORTFOLIO_CHILD_PROJECT: true` with `Selected app slug: scope-guard` means the seven-app split already happened one level up in `multi-app-exp4`. There's no category list to divide, no sibling apps to pick between, and manufacturing a fake portfolio-json or a set of rejected alternatives here would just be noise that could conflict with the real parent-level run. So: one app, one folder, no manifest.

Claude used the rest of the round to get ahead of the next phase rather than re-litigate the selection question, flagging that onboarding/time-to-first-verdict deserves the same weight as the review screen — proposing a "paste first, provisional one-line baseline, structure later" ordering instead of forcing full baseline setup before any payoff. That's a real product point but it's scoped as input for design/architecture, not something that changes this phase's decision.

No disagreement between Codex and Claude on the actual portfolio_selection question.

## Final Output

**Decision: single-app run.** This is not a portfolio-parent phase — `scope-guard` is a pre-selected child project of the `multi-app-exp4` portfolio, so no sibling selection, category balancing, or portfolio-json manifest applies here.

**Selected app:**
- slug: `scope-guard`
- name: `Scope Guard`
- category: `Freelance & Consulting Tools`
- promise: "Paste in client messages and get scope-creep flagged with a drafted change order before you do unpaid work."
- target user: Independent freelancers and small consultancies who lose money to informal scope creep buried in message threads.
- build: `true`

**Selection rationale:** Preselected upstream by the parent portfolio run; no alternatives were presented for selection within this child run, so none were rejected.

**Rejected alternatives:** None — not applicable to a pre-selected child project.

**portfolio-json:** Not emitted — this run is a child project, not the portfolio parent; emitting a sibling manifest here would duplicate/conflict with the real parent-level orchestration.

**Carried forward as a note for the next (design/architecture) phase, not a decision of this phase:** consider ordering onboarding so a first-time user can paste a client message against a lightweight provisional baseline and get one real verdict before being asked to flesh out the full structured baseline (deliverables/revisions/exclusions/assumptions/timeline) — first success, then rigor, not rigor as a toll booth.

## Initial Discussion

CONSENSUS: YES

Codex and Claude landed on the same product with Claude adding sharper edges rather than contesting anything. Codex framed the promise and the discipline needed to keep it from becoming generic admin software; Claude took that promise and pressure-tested it against actual screens, catching two real edge cases nobody had named yet — what happens when a pasted message has nothing worth flagging (needs its own confident "you're clean" state, not an error/empty look-alike), and what happens with multi-topic messages that mix small talk, confirmed work, and one buried ask (the IA has to tolerate zero/one/many flaggable items per paste, with irrelevant content silently dropped rather than forced into a bucket). Both agree the manual fallback and LLM path must converge on the same intermediate data shape before hitting review/draft/export, so the app doesn't end up as two parallel products. Both affirm the "provisional one-line baseline first, structured rigor after first win" ordering carried over from the last phase. No open disagreement — Gemini didn't weigh in (CLI unavailable), but that hasn't blocked consensus in any prior phase either.

## Final Output

**One-sentence product promise:** Scope Guard turns a client's casual ask into an immediate, evidence-backed verdict — clearly in scope, clearly new/billable, or flagged for a human call — plus a ready-to-send change-order draft, before the freelancer does any unpaid work.

**Primary user and scenario:** A solo freelancer or very small consultancy (designer, developer, copywriter, consultant) running fixed-fee or tightly scoped client work, mid-project, who gets a message from an existing client with a casual add-on ask buried in otherwise normal conversation. She's on her phone with a couple of minutes before she has to reply, and needs a defensible answer she can act on without rereading her SOW or improvising under pressure. The habit that keeps the app alive isn't the first use — it's the tenth: message lands, a few taps, verdict, move on.

**Core loop:** Create/select project (a provisional one-line baseline is enough to start) → paste or share-extend the client's message in → extraction runs (on-device LLM, or manual split/tag fallback — same downstream shape either way) → review screen shows the result in three buckets (confidently in-scope / flagged for your call / confidently new-and-billable), each item carrying a one-line rationale tied to a specific baseline point → user edits, reclassifies, or adds anything missed → generate the change-order draft → export or copy it and move on. Six screens total: project list, baseline editor, paste/intake, review, draft preview, settings/paywall. Nothing else earns a place in v1 IA.

**Hard scope boundaries:** Not a contract-authoring tool, CRM, invoicing system, time tracker, proposal manager, or team collaboration product. No message inbox/thread view — each paste is a discrete, self-contained analysis, not an ongoing monitoring feed. No history/analytics dashboard as its own section (past analyses live nested under a project, not a separate destination). No chat-style negotiation with the "AI." No client-facing accounts. No redlining the draft into a full contract. No notifications nudging the user to paste things — this is reactive-at-the-moment-of-ask, not surveillance. One active baseline per project, edited in place — no versioning/branching in v1. The manual fallback is a first-class equal path, not a degraded edge case for unsupported hardware.

**Measurable success criteria:**
- A first-time user reaches a real verdict on actual pasted text (not a tutorial) in under 90 seconds from cold launch, with no more than one required baseline field to get started.
- A returning user reaches paste-intake in two taps or a single share-extension action.
- Every flagged item shows a visible one-line rationale referencing the baseline — never a bare verdict.
- The "nothing to flag" outcome is its own confident, honest state — never rendered as an empty or failed result.
- A free-tier user can complete the entire loop successfully at least once before hitting any paywall.
- The full loop is demonstrably exercisable start to finish both with Foundation Models available and force-disabled, producing a real exported file either way.
- All six screens have honest empty/loading/success/error states — no placeholders.

## Per App Product Brief

CONSENSUS: YES

Codex and Claude are fully aligned here — this was a fast convergence, not a fight. Codex laid out the shape of the product (diff-engine not chat-engine, niche credibility-driven growth, provisional-baseline-first onboarding), and Claude tightened every one of those into something buildable: a harder-edged target-user definition (this is not for freelancers with no scope concept at all), concrete monetization numbers and a testable extraction-counting rule, a sharper articulation of why this beats "just ask ChatGPT" (baseline memory + visible work-shown + LLM/manual convergence + artifact output, not model quality alone), and a non-negotiable UX rule that reclassifying a wrong flag must take exactly one tap. Nothing between them is in tension — Claude's additions are refinements and hard rules, not different opinions. Gemini stayed unavailable, as in every prior phase of this run, which hasn't blocked consensus before and doesn't here.

## Final Output

**Target user and use case:** A solo freelancer or 2–4 person shop (designer, developer, copywriter, marketing consultant) running fixed-fee or tightly-scoped retainer work over email/Messages/Slack, with 1–3 active clients and some scope document she never reopens once work starts. She already understands the difference between agreed work and "one more thing" — this app is not for someone with no concept of a scope boundary yet; it holds an existing boundary firm under time pressure, it doesn't teach scoping from zero. The use case is a single, recurring moment: a client casually asks for something extra, and she has under a minute to decide, on her phone, whether it's covered or billable, without rereading a contract.

**Paid value and subscription value:** Free tier — 1 active project, 10 extractions/month — must let a user complete the entire loop (baseline → paste → verdict → draft → export as plain text/Markdown) at least once with zero friction, because what's being sold is proof the mechanic works before money is asked for. Paid, ~$9.99/mo, unlocks unlimited projects and extractions, reusable change-order templates matching the freelancer's own boilerplate, and PDF export (a real sendable, client-facing artifact vs. plain text). What's gated is volume (a working freelancer with 3 clients burns 10 extractions in under two weeks — the honest upgrade trigger) and output polish, never the core "does this work" proof. Hard rule locked now: one extraction = one run of the extractor (LLM or manual-fallback) against one pasted text, counted at run time; a debug/QA build must expose a resettable counter so this is testable pre-launch, not discovered broken a month post-launch. The free/paid gate must be enforced at the actual extractor-call/entitlement layer, not just in UI copy.

**Core loop:** Client message lands → open app or hit share extension from Mail/Messages → pick project → paste/confirm text → extraction runs (on-device LLM, or manual split-and-tag when unavailable or distrusted) → review screen shows four honest outcomes — confidently in-scope, flagged for your call, confidently new-and-billable, and "nothing here to flag" (its own confident state, not an empty/error look-alike) — each item carrying a one-line rationale citing the specific baseline clause it triggered against → user corrects/reclassifies anything wrong in exactly one tap (a defect, not a polish gap, if it takes more) → generate change-order draft → export or copy → done. The loop must survive the case where extraction is wrong on the first real try — that's the central design constraint, not an edge case.

**Competitive wedge:** Scope Guard is a diff engine, not a chat engine — the review screen shows "what changed relative to the agreement" against a remembered baseline, not a paragraph of AI prose to parse. The honest differentiator against "just paste it into ChatGPT" is structural, not model-quality: the app remembers the baseline so the user never re-explains the deal, it shows its work against that specific baseline, it converges LLM and manual paths into identical draft-ready output so it works the same on old hardware, and it outputs a change-order artifact instead of an opinion. Most adjacent tools (time trackers, contract tools, project managers) act after the ask lands or after work starts; this is the only one that intervenes at the decision moment, before unpaid work begins.

**Viral or niche growth angle:** This is a niche-growth product, not a viral one — no in-app referral gimmicks or forced sharing prompts, which would undercut trust in a tool handling client-money conversations. Growth happens through professional word of mouth in freelancer communities (r/freelance, indie-hacker-adjacent spaces, Slack/Discord) where "I stopped doing free work because of this" is a concrete, believable story, and passively through the exported change-order document itself landing in a client's inbox looking sharp and professional — a quiet credibility signal, not a growth loop.

**Local-first and cloud-ready plan:** v1 has zero network dependency — projects, baselines, extractions, and drafts all live on-device, worth stating explicitly in-product ("this stays on your device") since client message content is sensitive. The extractor sits behind a protocol boundary so email/Slack ingestion can be added later as an alternate implementation of the same interface, not a rewrite — but nothing about v1's value depends on that ever shipping.

**Why this app deserves to exist:** Retention lives or dies on whether the flagged rationale is trustworthy enough that the user stops re-verifying it herself against the baseline. The biggest risk to the whole brief is mediocre extraction on messy, hedged real client phrasing eroding that trust — the mitigation isn't "hope the model improves," it's biasing every uncertain case toward "flagged for your call" over silent auto-approval, making the manual fallback genuinely fast rather than a punishment screen, and keeping correction to one tap. Scope Guard is only valuable if it helps the user act *before* unpaid work starts — every later design and build decision gets filtered through that line.

## Next Steps Small

CONSENSUS: YES

Both Codex and Claude converge tightly here — no real disagreement, just Claude sharpening one design decision Codex left more open. They agree the slice is: one project, one provisional one-line baseline, one pasted message, extraction (or manual fallback), the four-outcome review screen (in-scope / flagged / new-billable / nothing-to-flag), one-tap reclassification, a generated change-order draft, and a real exported file — all on-device. Both explicitly reject "six shallow screens" in favor of this one loop built deep and demoable end to end.

The one place Claude pushes past Codex: rather than sequencing the LLM extractor first and bolting the manual fallback on later, Claude argues both paths need to exist from day one of this slice, specifically to force the data model to converge on one shared shape immediately — otherwise there's real risk the model gets built LLM-first and the fallback becomes an awkward retrofit later (the "two parallel products" failure mode this whole run has been guarding against). Codex's framing is compatible with this but doesn't say it as explicitly. This isn't a fight, just Claude naming a sharper build-order rule; nothing in Codex's round contradicts it.

Both agree on the same cut list for this immediate slice — deferred but not dropped from v1: share extension, PDF export/templates, multi-project beyond one, full StoreKit paywall/entitlement enforcement, settings screen, history/analytics. Claude adds one explicit exception to "cut what's not essential": accessibility (VoiceOver, dynamic type, contrast) is built in from the start, not deferred, since retrofitting it on a dense review screen later is exactly the kind of thing that gets skipped.

Both agree on the same validation bar: it's not "does it compile" or "does extraction run" — it's whether a real, messy, hedged client message produces a verdict a tester would actually act on without re-checking the original agreement, and whether the identical test with Foundation Models force-disabled produces an equally trustworthy result via the manual path.

## Final Output

**MVP slice:** One project with a provisional one-line baseline (title + short free-text "what I agreed to build" field, under a minute to create, no forced structure) → paste in one real client message → extraction runs, via on-device LLM if available or manual split-and-tag if not, both built from day one so they share one converged intermediate data shape from the start (not sequenced LLM-first-then-fallback) → land on the four-outcome review screen (confidently in-scope / flagged for your call / confidently new-and-billable / nothing to flag) with a one-line rationale citing the specific baseline phrase behind every flagged or billable item → reclassify anything wrong in exactly one tap → generate a real change-order draft from the actual flagged items (no lorem ipsum) → export/share it as a real openable file (plain text/Markdown). This is the one complete workflow to build deep and prove, before anything else gets touched.

**Must-have interactions:**
- Baseline creation blocks on no more than one required field.
- Paste screen accepts arbitrary text and shows a real loading state during extraction.
- Every flagged/billable item shows a one-line rationale tied to a specific baseline phrase — never a bare verdict.
- Reclassification is exactly one tap — anything more is a defect, not a polish gap.
- Manual fallback produces the identical review object and feeds the identical draft generator as the LLM path — same data shape, not a lesser experience.
- Draft export produces a real file handed to the system share sheet/Files, not a preview trapped in-app.
- Accessibility (VoiceOver labels, dynamic type, contrast) is built into this slice from the start, not retrofitted later.

**Cut list (deferred to next build increment, not deleted from v1 scope):**
- Mail/Messages share extension (real entry-point convenience, not required to prove the core loop).
- PDF export and reusable change-order templates (paid-tier polish layered on a working draft generator).
- Multi-project management beyond a single project (free tier is one project anyway — testing with one is representative).
- Full StoreKit 2 paywall and entitlement enforcement, including the extraction counter (a wrapper around a working extractor, built after the extractor itself works).
- Dedicated settings screen.
- History/analytics as any kind of distinct destination.

**Validation criteria:**
- Cold launch to a real verdict + draft in under 90 seconds using only the one-line baseline.
- A returning-user path (launch to review) takes only a couple of taps.
- The same real, messy, hedged client message produces a review output and real exported draft both with Foundation Models available and with them force-disabled — same trustworthiness bar either way.
- A message with nothing flaggable lands in a confident "nothing to flag" state — never blank or error-like.
- A mixed message with one buried new ask lets that ask survive while irrelevant chatter is silently dropped, not forced into a bucket.
- The real bar isn't "does it compile" — it's whether a tester handed a genuinely messy, hedged real client message trusts the verdict enough to act on it without re-reading the original agreement themselves.

## Detailed Discussion

CONSENSUS: YES

This round is where it actually clicked. The one real fight — whether the manual fallback should count against the free 10/month cap — got resolved cleanly: Codex flipped his own round-1 position and Claude independently agreed, both landing on the same reasoning, that capping manual tagging punishes exactly the users the fallback exists to protect and quietly breaks the "manual path is first-class, not second-class" rule this run has repeated three times already. So that's settled, not just agreed to disagree on.

Everything else either converged outright or got a clean, deliberate "not now, and here's why" instead of being left dangling. Draft generation blocking on unresolved items, drafts being immutable snapshots, the shared review-object schema (Claude's two added fields — resolved/unresolved flag, AI-vs-manual origin flag — went unopposed and just make the other rules mechanically checkable), the two-layer baseline, and the whole pile of edge-case rules from round 1 (quota-on-completion, fail-closed entitlement, no client text in logs, cascade-delete confirmation, empty/oversized paste handling, mid-run model eviction) all landed without pushback. The one place Claude pumped the brakes — cumulative cross-message creep detection — got a specific, reasoned resolution rather than a stalemate: it's a real and good idea, but it's new logic surface area that wasn't in the twice-locked MVP slice, so it's being named explicitly as a strong post-MVP direction instead of quietly expanding this build. Same treatment for automatic revision-round counting — the baseline gets a free-text revision-policy field (already implied by prompt_contract), but nobody's building a ledger that computes when revisions are "used up." And the small naming-drift catch (Codex's four-outcome phrasing vs. the already-locked four-bucket vocabulary) gets settled by just keeping one canonical set of names.

## Final Output

**Resolved requirements:**
- Canonical four-outcome verdict vocabulary stays as locked in earlier phases — confidently in-scope / flagged for your call / confidently new-and-billable / nothing to flag. No second taxonomy gets introduced into implementation or copy.
- Two-layer baseline: Layer 1 (required, fast) = project name + one-line "what I agreed to build." Layer 2 (optional) = deliverables, exclusions, revision policy (free text only, not a tracked counter), assumptions, timeline, client-dependency notes. The app is upfront that verdict confidence improves once Layer 2 exists.
- Shared review-object schema, identical for both paths: ask text, source quote, verdict, confidence, matched baseline clause (or none), rationale sentence, billability recommendation, resolved/unresolved status, and path-of-origin (AI or manual).
- **Amended monetization rule (supersedes the earlier "one extraction = either path" rule):** the free 10/month cap applies only to AI-assisted (Foundation Models) extraction runs. Manual-fallback runs are free and uncapped, bounded only by the 1-active-project limit. Quota increments only on a *completed* AI run (a real result or "nothing to flag" both count); cancelled, interrupted, or crashed runs never consume it. Reset is calendar-month by device-local time at local midnight on the 1st; clock-tampering to dodge this is an accepted risk, not something engineered against.
- Hitting the AI cap mid-month never locks a user out of the loop — she's routed to manual tagging with copy like "you've used your AI extractions this month — continue with manual tagging (free) or upgrade for unlimited AI," same review screen and output shape either way.
- Draft generation blocks while anything is unresolved/ambiguous — only explicitly confirmed-billable items populate the draft, confirmed in-scope items are excluded, and the user gets an explicit "N unresolved items" prompt rather than a silent drop or silent inclusion.
- A generated draft is an immutable text snapshot, not a live view — later baseline edits or reclassifications never retroactively change a draft already generated. The baseline shows a "last edited" timestamp so an old draft that looks out of date isn't confusing.
- Two distinct persistence rules on two different objects: raw pasted text and in-progress manual tagging autosave continuously (never re-paste, never lose manual labor to a crash/background); a generated draft, once created, freezes permanently. These are opposite behaviors and must not be conflated.
- Draft template includes an editable fee placeholder line, since the app never computes pricing but a "ready to send" artifact needs somewhere to put one.
- A model failure mid-run (eviction, backgrounding, OS reclaim) gets its own clean state — "couldn't complete, try again or switch to manual" — distinct from "unavailable at launch," and doesn't consume quota.
- Empty/whitespace pastes are blocked before reaching the extractor or the counter; oversized pastes beyond usable context fail loudly with trim guidance rather than silently truncating.
- StoreKit entitlement checks fail closed — any lookup failure, timeout, or offline state defaults to free-tier restrictions, never silently grants access.
- Project deletion cascades through its baseline, analyses, and drafts behind an explicit confirmation naming what will be lost.

**Edge cases:** nothing-to-flag messages, multi-topic pastes with buried asks, and multiple distinct Foundation-Models-unavailable states were already resolved in earlier phases and are reaffirmed here. Newly resolved this phase: quota-cancel-mid-run, clock-tampering, hitting-cap-mid-month, draft-generation-with-unresolved-items, baseline-edited-after-a-draft-was-sent, empty/oversized pastes, and mid-run model eviction. Explicitly deferred (not solved, not silently dropped): cumulative multi-message scope-creep detection and automatic revision-round counting — both named as specific post-MVP roadmap items, not part of this build.

**Data and privacy implications:** fully on-device, zero network dependency, stated in-product as a trust signal; no analytics on message content ever, including any future crash/diagnostic instrumentation; share extension (when built) passes only selected text, no shadow inbox; no in-app biometric lock in v1 (device-level lock screen only); no backup/restore in v1.

**Risk register:** extraction quality on messy/hedged phrasing remains the top risk (mitigated by bias-to-flag + one-tap correction + fast manual fallback, per earlier phases); the old "manual path also capped" fairness problem is resolved by decoupling it from quota entirely; draft-trust risk resolved via generation-blocking + immutability; manual-review data-loss risk resolved via continuous autosave; silent-truncation risk resolved via loud-failure handling; entitlement-check network flakiness resolved via fail-closed default; no-backup-path is an accepted, named limitation; no cumulative-creep detection or revision-ledger tracking is an accepted, named v1 exclusion with a defined future direction; verdict-vocabulary drift across phases is resolved by locking one canonical naming now.

**Final assumptions:** manual fallback is free and unlimited, only AI-assisted runs count against the monthly cap; device-level lock screen is the only v1 access control; no cloud backup/sync exists, so local device loss is an accepted data-loss risk; revision limits are a baseline text field only, not a computed counter; cross-message cumulative creep detection is a named future direction, not part of this build; the four-outcome verdict names locked in earlier phases are canonical everywhere.

## App Features

This one actually got adjudicated properly this round, not just re-asserted. Claude did the honest thing — went back, admitted the round-1/round-2 drift was real (Claude said must-have in round 1, then let it slide into should-have in the round-2 synthesis without flagging the contradiction), reread prompt_contract's actual language, and made a real argument for why "must-have with a named-limitation escape hatch if undeliverable" is the correct reading rather than "should-have." Codex came to the same place independently and for the same textual reason — the contract's phrasing ("if genuinely undeliverable in MVP, must be recorded as an explicit known limitation") only makes sense as an escape hatch attached to a requirement, not optional-feature language — while adding the scoping discipline that keeps it from ballooning: extension does exactly one job (capture text + optional project picker, hand off to main app), no inference, no review, no draft preview inside the extension process, same intake/autosave/review-object model as a cold paste. Both explicitly agree the fallback must be a real attempt followed by honest documentation of what broke, not silent deprioritization.

Nothing else moved this round — client-as-field-not-entity and PDF-must/templates-should both stand as locked in round 2, untouched and unchallenged here.

CONSENSUS: YES

## Final Output

**Must-have features (each with locked acceptance criteria):**

1. **Project management** — Free tier: 1 active project; paid: unlimited. `clientName` is an optional plain text field on Project (no separate Client entity, no CRUD, no cross-project rollup — should-have for later). Hitting the free-tier project cap shows a clear upgrade prompt, never a silent block or crash.

2. **Two-layer baseline** — Layer 1 (required): project name + one-line "what I agreed to build," under a minute. Layer 2 (optional): deliverables, exclusions, revision-policy text, assumptions, timeline, client-dependency notes. App is explicit in-copy that verdict confidence improves once Layer 2 exists. Persists across relaunch; empty/edit/saved/validation-error states present.

3. **Message intake** — Accepts arbitrary pasted text; whitespace-only blocked pre-analysis; oversized input fails loudly with trim guidance (never silent truncation); autosaves continuously; empty/loading/ready/error states; reachable in a couple of taps from the project screen.

4. **Dual-path analysis (AI + manual fallback)** — On-device Foundation Models when available/entitled; manual split-and-tag otherwise, without losing pasted text. Identical review-object schema from both paths. Four distinct "AI unavailable" states each get their own tested copy, never one generic banner. AI quota increments only on completed AI runs; manual fallback free and uncapped.

5. **Review screen** — Canonical four-outcome vocabulary only. Every item shows source quote, verdict, rationale, matched baseline clause or an explicit "no clause matched — flagged on general judgment" (never a fabricated-sounding citation), confidence, billability recommendation. One-tap reclassification, no exceptions. VoiceOver reads each item as one coherent unit; Dynamic Type tested at largest accessibility sizes against rationale text.

6. **Draft generation** — Only confirmed-billable items flow in; unresolved items block generation with an explicit prompt; confirmed in-scope items excluded; editable fee-placeholder line; immutable snapshot once generated; empty/generated/regenerate/export-error states.

7. **Export** — Plain text/Markdown export as a real openable file, works offline, hands to share sheet/Files, visible/recoverable failure state. PDF export of the single draft is must-have (native PDFKit, no third-party library) — named paid-tier commercial differentiator. One strong default format; user edits draft text directly. Multiple saved/reusable templates: should-have.

8. **Persistence** — Raw pasted input and in-progress manual tagging autosave continuously (survive crash/background/relaunch); generated drafts freeze permanently — opposite guarantees on two different objects, must not be conflated. Project deletion cascades through baseline/analyses/drafts behind explicit confirmation.

9. **Mail/Messages share extension** — **Must-have, narrowly scoped**, per prompt_contract's explicit requirement-with-escape-hatch language ("if genuinely undeliverable in MVP, must be recorded as an explicit known limitation, never silently dropped" — that phrasing only makes sense attached to a real requirement, not an optional feature). Scope: capture selected text plus an optional project picker, hand off to the main app — no inference, no review, no draft preview inside the extension process. Same autosaved-intake and review-object model as a cold paste. Acceptance criterion includes the fallback itself: the team must actually attempt the extension target (App Group container, extension target, clean handoff) as a real build task; if it can't reach production quality in the build window (crashes, memory-limit violations, broken handoff), the app ships without it plus an explicit user-facing known-limitation note and an internal record of what was attempted and why it didn't land — never a silent drop, never a quiet reclassification to should-have.

10. **StoreKit 2 paywall/entitlement enforcement** — Free: 1 project, 10 AI-assisted extractions/month; manual always free/unlimited; paid: unlimited projects + AI runs + PDF + (future) templates. Entitlement checks fail closed on any lookup failure/timeout/offline. Its own explicit must-have: a debug-resettable AI-extraction counter and a debug affordance to force entitlement-check failure/offline/timeout, so fail-closed behavior and quota-on-completion-only are actually verifiable pre-launch.

11. **Full state coverage + accessibility** across all six screens — required, not polish.

**Should-have:** reusable/saved change-order templates beyond the one default; clearer diagnostic copy distinguishing the four AI-unavailable states beyond minimum viable messaging; client-level cross-project rollup view; onboarding sample data / guided first-run demo message.

**Could-have:** richer PDF formatting (logo/letterhead); project search/filtering; tagging analyses by outcome; app-level biometric lock; richer export formats.

**Won't-build (this run):** CRM/first-class Client entity, invoicing, time tracking, contract authoring, cloud sync, live email/Slack inbox polling, team/multi-user accounts, legal-advice engine, automatic pricing, OCR, analytics dashboard as a distinct destination, cumulative cross-message creep detection, automatic revision-round ledger tracking, chat-style negotiation UI, in-app biometric lock, backup/restore.

**Prioritization principle:** a feature earns must-have status if it's either directly load-bearing for the decision-moment promise, or if prompt_contract already named it as a required v1 item (with its own stated fallback, in the share extension's case) — not because it sounds premium or adds adjacent convenience. Client-as-entity and template-library-as-CRUD were rejected as scope creep dressed as future-proofing; the share extension was correctly kept in must-have specifically because the contract's own language treats non-delivery as a named exception to document, not a feature to quietly downgrade.
