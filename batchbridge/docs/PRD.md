# batchbridge — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things actually stand: Codex laid out a full prompt contract for BatchBridge, and nobody pushed back on it — not because everyone agreed, but because neither I nor Gemini got a chance to weigh in this round (I hit a spend-limit error, Gemini's CLI isn't available headlessly). So what you're getting is one strong, well-reasoned voice rather than a genuine multi-party convergence. That said, I've read through Codex's contract and I don't see anything in it that contradicts the original prompt or the phase playbook, and it hits every required output bullet, so I'm comfortable treating it as the working contract rather than burning a round waiting on unavailable participants.

The core of it: BatchBridge is one child app in a 7-app portfolio, and despite the "SwiftUI MVP" line at the top, the category-specific spec overrides that — this is a FastAPI + React/Vite + SQLite + Docker local-first web app, not iOS. Hard requirements are the full PO-intake pipeline (upload → PDF→image/text → OCR → LLM extraction with strict validated JSON and one repair retry → review/correct → Ship To fuzzy match → approve → export JSON/CSV), every field carrying value/confidence/source_text/page_number/needs_review, the side-by-side review UI with raw OCR/JSON tabs, global+per-customer prompt config, the dashboard stats, the named backend modules and DB tables, and Docker/README/tests/error-handling for the standard failure modes. Non-goals are explicitly the enterprise stuff — no ERP integration, SSO, multi-user auth, queues, mobile, cloud sync, or document-type sprawl beyond POs.

The one real editorial call Codex made (and it's a reasonable one, not a rubber-stamp): the product's differentiation angle should be "trusted correction workflow" — evidence-linked fields, fast low-confidence correction, strong Ship To match explanations — rather than competing on raw OCR/extraction novelty. That's a judgment call worth flagging to you explicitly since it'll steer design/architecture phases, but it doesn't conflict with anything in the prompt.

CONSENSUS: YES

## Final Output

**Scope**: BatchBridge is a standalone child project (one of seven in the batch-specials portfolio) — a local-first **web app** (FastAPI backend, React+Vite frontend, SQLite, Docker/docker-compose), not an iOS app. The earlier "SwiftUI MVP" line is superseded by the more specific category spec.

**Hard requirements**:
- End-to-end PO pipeline: upload PDF → convert to image/text → OCR per page → LLM extraction into strict validated JSON (one repair-prompt retry on invalid output) → review/edit → Ship To match → approve → export.
- Every extracted field carries `value`, `confidence`, `source_text`, `page_number`, `needs_review`.
- Required header fields (PO#, date, customer, buyer, payer, bill-to, ship-to+address, Ship To ID, currency, subtotal, tax, total) and line-item fields (line no, material code, description, qty, UoM, unit price, line total, requested delivery date) must all be captured, never silently dropped.
- Review UI: side-by-side PDF + extracted data, editable fields, line-item table, raw OCR tab, raw JSON tab, reprocess/approve/export actions; original and corrected versions both stored.
- Ship To Data Catalog with fuzzy matching returning best match, confidence, reason, and alternates.
- Prompt configuration: global + per-customer (customer overrides/supplements global), editable in UI, rerunnable.
- Dashboard: uploaded/processed/needing-review counts, average confidence, success rate.
- Named backend modules (upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export) and named DB tables (documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log).
- Docker + docker-compose, local file storage, env-var secrets (no hardcoding), README, sample/mocked PO PDFs, unit tests for parsing/validation/matching, graceful handling of OCR/LLM/bad-PDF/missing-field failures.

**Non-goals**: ERP integrations, SSO, multi-user auth/permissions, queue workers, vendor portals, human-assignment workflows, mobile apps, cloud sync, template-training pipelines, enterprise deployment hardening, and expansion into other document types (invoices, BoLs, email ingestion) beyond what serves the PO flow.

**Production-readiness definition**: A real operator can install locally, load sample PDFs, watch OCR/extraction happen, inspect evidence per field, correct low-confidence fields, resolve Ship To matches, approve, and export — without touching code. Every reachable workflow step has empty/loading/success/error states. Tests cover parsing, validation, matching. Persistence survives restart. Malformed PDFs and bad model output degrade gracefully, not fatally. This is "credible, reliable local MVP with a clear hardening path," not "enterprise-scale proven."

**Decision rules for later phases**:
1. Category-specific spec (web app) overrides the generic top-line instruction (SwiftUI) wherever they conflict.
2. Prefer reducing review/correction time and building correction trust over adding adjacent features.
3. Evidence visibility (why did the system produce this value) beats visual minimalism in UX tradeoffs.
4. Keep OCR/LLM provider modules replaceable without rewriting the review or persistence layers.
5. If something must be deferred, defer integrations/extras before deferring auditability, editability, or failure handling.
6. "Done" requires both the full success path and the main failure paths to be demonstrable locally — not just the happy path.
7. Differentiation angle: BatchBridge should win on trusted, fast correction workflow (evidence-linked fields, sharp low-confidence handling, explainable Ship To matches) — not on OCR novelty. Don't let later phases drift into a generic upload-and-export demo.

## Initial Discussion

Both Codex and I landed in the same place this round, even though we came at it from different angles — Codex from "what should the design center on," me from "what will actually break in practice." Nobody contradicted the other; the two takes are complementary, not competing. Gemini still couldn't join.

The shared picture: BatchBridge is a local review workbench for an ops/AP coordinator at a small-to-mid manufacturer or distributor who gets messy supplier PO PDFs (scans, fax-quality, inconsistent layouts, nickname "Ship To" fields) and currently retypes or fights a rigid legacy tool. The product doesn't win by claiming "AI extracts POs" — every competitor says that. It wins on the last 20%: how fast and confidently a human can find what's wrong, see why the system produced it, fix it, and approve. Core loop is upload → automatic OCR/extract → land directly on a review screen pre-flagged with low-confidence fields → correct or accept → resolve Ship To (accept suggested match or pick an alternate, with a real explanation, not just a score) → approve → export JSON/CSV.

Both agreed the review screen is the actual product — not the upload form, not the dashboard — and that it has to progressively disclose evidence (confidence, source text, page) rather than dumping every attribute on screen at once, or it becomes slower than manual entry. Both also agreed on hard scope: single-user/single-tenant local tool, no auth complexity, no batch-and-forget queue (review is synchronous and in-the-loop), PDF input only, PO document type only — nothing about invoices/BoLs sneaking in later.

The one thing Claude's round added that wasn't in Codex's: a concrete worry about "confidently wrong" LLM outputs (high stated confidence but actually wrong) being worse than flagged uncertainty, since it won't trigger review — and a defined terminal state for when the one repair retry also fails (not a hang, not a silent 500). Codex didn't address this directly, but it doesn't conflict with anything Codex said — it's an addition, not a dispute.

No open disagreement surfaced. This reads as genuine convergence on the required output.

CONSENSUS: YES

## Final Output

**Product promise:** BatchBridge lets an ops/AP coordinator turn a stack of messy, inconsistent supplier PO PDFs into corrected, evidence-backed, exportable structured data in minutes — by making the review and correction step (not the raw extraction) the fast, trustworthy core of the product.

**Primary user & scenario:** An ops coordinator, customer service rep, or order-entry specialist at a small-to-mid manufacturer or distributor who receives PO PDFs from dozens of recurring customers, each with their own quirks — scanned/fax-quality pages, multi-page line items, "Ship To" fields written as nicknames rather than catalog-exact addresses. The moment that matters isn't the pristine PDF; it's the messy one, and whether the operator can fix it fast without re-keying everything from scratch.

**Core loop:** Upload a PO PDF → pipeline runs automatically (convert → OCR → LLM extraction with validated JSON, one repair retry on failure) → operator lands directly on a review workspace with low-confidence fields already flagged and evidence visible → operator corrects or accepts flagged fields, resolves Ship To (accept the suggested match or choose an alternate, backed by a concrete reason, not just a confidence number) → approve → export JSON and CSV. A repeat user should be able to do this from muscle memory, not by re-reading labels.

**Hard scope boundaries:**
- Single-user, single-tenant, local-first — no auth complexity, no multi-user routing.
- Synchronous, in-the-loop review — no upload-and-forget batch queue.
- PDF input only; PO documents only. No invoices, BoLs, email ingestion, ERP push, supplier portals, or "AI copilot" side features.
- UI stays to three real surfaces: dashboard, document inbox/list, and the review workspace — prompt config and the Ship To catalog are settings screens, not separate products.
- Raw OCR and raw JSON tabs exist for trust/debugging but stay secondary to the main review flow, not co-equal with it.
- A defined terminal state must exist for double-failed LLM extraction (after the one repair retry) — never a silent hang or unhandled error.

**Measurable success criteria:**
1. A fresh operator can go from a raw sample PDF to an approved, exported JSON+CSV pair in under ~5 minutes on first use, with no docs beyond on-screen guidance.
2. Every exported field carries confidence/source_text/page_number provenance — zero fields silently missing that metadata.
3. At least one deliberately messy/garbage sample PDF in the repo demonstrably fails gracefully (needs_review flags, no crash, no silent data loss) rather than the repo only containing happy-path samples.
4. Ship To fuzzy matching produces a concrete, defensible "reason" string for its top pick on a fuzzy/nickname input — not just a bare similarity score.
5. A reviewer can identify every field needing attention at a glance and inspect its source evidence within one click, without the default view turning into a wall of metadata.

## Per App Product Brief

Both Codex and I (Claude) landed on essentially the same product this round, just with different emphasis — Codex focused more on the architecture/trust argument, I leaned into a concrete persona (Priya) and how the subscription tiers would actually work. Gemini still couldn't join. There's no real disagreement to resolve here, just two compatible takes that combine cleanly into one brief.

The shared picture: BatchBridge is for the ops/order-entry person at a small-to-mid distributor or manufacturer who processes dozens of messy supplier PO PDFs a day and is judged on speed and accuracy, not on liking AI. The wedge isn't extraction accuracy (everyone claims 95%+) — it's that BatchBridge makes "why did the system produce this and can I trust it" the primary interface: inline source-text evidence next to every flagged field, and Ship To suggestions with a plain-English reason instead of a bare confidence number. Paid value is real utility that compounds with usage — unlimited documents/customers, a Ship To catalog and per-customer prompts that get smarter with every correction, and retained audit/correction history — not cosmetic gating. Growth is niche/word-of-mouth among ops people (trade forums, "look, I fixed this messy scan in 90 seconds" demos), not built-in social mechanics. Local-first is both an architecture choice and a sales point (PO data with pricing/account info never leaves the machine except for the configured OCR/LLM call), with cloud-readiness kept as a clean architectural seam (adapters/interfaces) rather than a v1 feature.

CONSENSUS: YES

## Final Output

**Target user & use case:** An ops coordinator / order-entry specialist / AP coordinator at a small-to-mid manufacturer or distributor, handling 20-60+ PO PDFs a day from dozens of recurring customers, each with its own layout quirks — scanned/fax-quality pages, broken tables, "Ship To" written as a nickname instead of a catalog-exact address. She isn't evaluating AI; she's trying to clear her inbox by end of day without a data-entry mistake that causes a wrong shipment. The moment that defines the product is the messy PO, not the clean one.

**Core loop:** Batch-drop PDFs in → pipeline runs automatically (convert → OCR → LLM extraction with validated JSON, one repair retry) → document list shows per-file status → operator opens the next document needing attention, landing directly on a review workspace with low-confidence fields already flagged and source-text evidence shown inline (not buried in a separate tab) → correct or accept flagged fields → resolve Ship To (accept the suggested match or pick an alternate, each with a concrete plain-English reason, not just a score) → approve → move to the next document with minimal friction → export approved documents as JSON/CSV, individually or as an end-of-day batch.

**Paid value / subscription value (functional, not cosmetic):**
- Free/trial tier: full pipeline works end-to-end but capped — e.g. ~25 documents/month, a small number of per-customer prompt profiles, limited Ship To aliases, short audit-history retention. Enough to prove the product on a real messy PDF, not enough to run a full desk.
- Paid tier unlocks what a real desk needs: unlimited documents/month, unlimited per-customer prompt overrides (a distributor with 80 customers needs 80 profiles), a full Ship To catalog with unlimited aliases that improve from corrections over time (a genuine data moat, not a paywall gimmick), extended/permanent audit trail and original-vs-corrected diff history (compliance/dispute value), and batch/automated export.
- The retention hook: the Ship To catalog and per-customer prompts get measurably better every time the operator corrects something, so a customer she's processed a dozen times auto-resolves near-instantly while a brand-new customer still gets full scrutiny. If that visible speed-up doesn't happen by the sixth or so document from a repeat customer, the subscription has no legs — this is the one thing design/architecture must protect.

**Competitive wedge:** Not "AI extracts your PO" (table stakes, every vendor claims it) but "you can see and prove why the system produced this value, and fix the wrong 20% fast." Concretely: inline evidence (source text + page) at the point of the flagged field, not a debug tab; Ship To matches that explain themselves ("matched on postal code + partial name, 2 aliases on file"); a real audit trail from original extraction to corrected value that a manager could review without asking the operator to explain herself.

**Growth angle:** Niche, operator-to-operator, not viral-social. It spreads because one coordinator shows a peer (in person, in an ERP/ops trade forum or Slack) that she cleared a stack of ugly scanned POs in minutes — the demo artifact is the before/after of a messy PDF becoming clean structured data, which is inherently a 30-second show-and-tell. This only works if the free tier is genuinely useful standalone, so someone can demonstrate real value without a sales conversation.

**Local-first & cloud-ready plan:** v1 runs fully locally — PDFs, rendered pages, OCR output, extraction results, corrections, prompt configs, catalog data, audit log, and exports all live in local SQLite + local file storage. The only external calls are to whatever OCR/LLM provider is configured via API key; no required cloud account, no data leaving the machine otherwise (a real trust argument against cloud-SaaS competitors, since PO PDFs often carry customer pricing/account details). Cloud-readiness is architectural only in v1: provider adapters (OCR/LLM), a storage interface, and catalog/prompt services stay cleanly separated from the review UI and persistence model, so a future team tier (shared catalogs, synced prompt packs, hosted processing, cross-user metrics) can be added later without rewriting the core review experience.

**The one thing later phases must not dilute:** the review screen, field-level provenance, and recoverable failure states are the product. If the app ever exports a confidently-wrong value without surfacing the risk, or if the "gets faster with correction" loop isn't real and visible, BatchBridge collapses into a generic extraction demo and loses its reason to exist.

## Detailed Discussion

Both voices this round are pulling in the same direction — no contradictions, just Codex laying the frame (state model, risk categories, review-speed tension) and Claude filling in the mechanics Codex left open (exactly how `needs_review` gets computed, what the double-failure terminal state looks like, how reprocess interacts with manual corrections, what happens when Ship To has no match or an empty catalog). Gemini still couldn't join. Nothing here is in tension with the product brief or prompt contract from earlier phases — it's all tightening screws on decisions already made, not reopening them.

The real substance: `needs_review` can't just be the LLM's self-reported confidence passed through, because that's precisely the "confidently wrong" failure mode already flagged as the top risk — it has to be computed server-side from three independent signals (confidence threshold, missing/mismatched source_text forcing review regardless of stated confidence, and business-rule reconciliation checks like totals not adding up or dates being implausible). The double-extraction-failure terminal state gets a name (`extraction_failed`) and a real behavior (blank-but-visible review workspace with both failed raw attempts shown, manual entry possible, reprocess-with-edited-prompt available) rather than being left as "some error state." Reprocessing must never silently clobber existing manual corrections — new extraction runs are additive, corrections layer separately, and post-export edits require an explicit logged "reopen." Ship To matching needs an explicit no-match/empty-catalog state that lets the operator create a catalog entry inline rather than dead-ending the review flow.

Both agents agree on what to explicitly push out of scope rather than silently discover during build: multi-document PDFs concatenated into one file, disk retention/cleanup policy, and multi-language support are named limitations, not MVP features. The one live tension both flagged in themselves (not between each other) is the risk of over-engineering every edge case into a built feature — the resolution both landed on is the same: only the handful of things that protect the trust story (needs_review logic, the failure terminal state, reprocess/correction interaction, Ship To no-match handling) get built; everything else becomes a documented assumption or exclusion.

CONSENSUS: YES

## Final Output

**Resolved requirements:**
- Batch upload is supported; review stays strictly one-document-at-a-time, and the default landing point after any processing is "next document needing attention," not a generic list.
- Explicit document state machine shared by backend and UI: `uploaded → processing → extraction_failed | needs_review → approved → exported`, plus a `reopen`ed state after export that requires an explicit, audit-logged action.
- `needs_review` is computed server-side, not passed through from the model's self-reported confidence. It's driven by three independent layers: (1) confidence-threshold check, (2) a hard rule that any field with missing/empty/non-matching `source_text` is forced into review regardless of stated confidence, (3) cross-field business-rule checks (line items vs. subtotal, subtotal+tax vs. total, implausible dates, a Ship To ID referenced in the doc but absent from the catalog). Business-rule validation is a distinct layer from JSON-schema validation — schema validation only gates the repair retry; business-rule checks always run afterward and feed `needs_review` independently.
- Double-failure terminal state: if the repair retry also fails to produce valid JSON, the document becomes `extraction_failed` (visually distinct from `needs_review` in the document list), and the operator can still open it — landing on a review workspace with blank/unpopulated fields but full visibility into the PDF, OCR text, and both raw failed model outputs, so fields can be hand-entered. A "reprocess with edited prompt" action is exposed from this state.
- Reprocessing never silently overwrites manual corrections: each reprocess creates a new `extraction_results` row; existing `corrected_results` persist separately, and the UI must surface which corrections may now be stale relative to the fresh extraction.
- Once a document is approved and exported, its corrected snapshot is treated as immutable; any further edit or reprocess requires an explicit "reopen" action, logged in `audit_log`.
- Ship To resolution distinguishes "customer unrecognized" from "customer known, address doesn't resolve," and defines a real no-match/empty-catalog state: the operator can pick manually from the full catalog or create a new catalog entry inline from the extracted address, without leaving the review flow.
- Ingestion behavior is fixed as: always OCR every page regardless of an embedded text layer (no dual code path); password-protected/encrypted PDFs and non-PDF files renamed with a `.pdf` extension fail cleanly at the convert step with a specific, visible error rather than crashing the pipeline; a stuck `processing` document (e.g., after a backend crash) gets a timeout-based reset or a manual retry action rather than becoming a permanent zombie.
- Deletion cascades documents → pages, ocr_results, extraction_results, corrected_results, line_items, but `audit_log` entries survive document deletion for accountability.

**Edge cases (explicitly answered):**
- Multi-page line items spanning a page break; rotated/mixed-orientation pages; PDFs mixing embedded text and image-only pages — all handled by the always-OCR rule above.
- Duplicate uploads of the same PO (same content, different filename): not blocked, but the document list should make visual duplicates obvious so an operator doesn't double-approve/export the same PO.
- A prompt override that makes extraction worse than the global default: no automatic detection required for MVP; the per-customer prompt editor and rerun capability is the mitigation path, not an automated regression check.
- Non-English PO text: degrades to low-confidence/`needs_review`, not a silent failure; full multi-language support is out of scope.
- **Named exclusions (not handled in MVP, stated explicitly rather than discovered later):** a single PDF containing multiple distinct concatenated POs (auto-splitting is a different feature); any disk-retention/cleanup policy for accumulating PDFs/images/OCR text (named as a known limitation); multi-language extraction quality.

**Data and privacy implications:**
- All primary artifacts (original PDFs, rendered page images, OCR text, extraction results, corrections, prompt configs, Ship To catalog, audit log, exports) remain local on disk by default.
- The one honest exception: page images/OCR text are sent to whichever external OCR/LLM provider is configured via API key for that specific call — meaning PO content (pricing, account numbers, addresses) does leave the machine for that call. This must be stated plainly in the README and ideally surfaced in-product, not oversold as "nothing ever leaves your machine."
- No hidden telemetry; export is treated as a boundary event and recorded in `audit_log`.
- Local storage growth (PDFs + rendered images + OCR text with no retention policy) is named as a known MVP limitation, not solved with a cleanup feature.

**Risk register:**
1. *Confidently-wrong extraction slips past a naive confidence check* → mitigated by the three-layer `needs_review` computation (threshold + missing-evidence rule + business-rule reconciliation), not model self-report alone.
2. *Review screen becomes slower than manual entry from too much always-visible evidence* → mitigated by progressive disclosure with a flagged-fields-first flow (carried from prior phases, reaffirmed here).
3. *Ship To "reason" strings feel vague, eroding trust in matching* → mitigated by requiring deterministic explanation output citing matched alias/customer/postal/city and rank vs. alternates (already decided; reaffirmed).
4. *Reprocessing silently destroys manual corrections* → mitigated by immutable extraction runs plus a separate corrected layer, explicit stale-correction surfacing, and reopen-required-after-export.
5. *Local-first degrades into file clutter / broken references* → mitigated by treating each document as a managed asset bundle with a defined delete cascade; unbounded growth is named as a limitation, not solved.
6. *Sample PDFs are all clean, masking failure-mode gaps* → mitigated by requiring at least one ugly/scanned, one ambiguous, and one deliberate-failure sample PDF in-repo (reaffirms prior phase's success criterion #3).
7. *Backend crash mid-pipeline leaves zombie "processing" documents* → mitigated by timeout-based reset or manual retry, named explicitly rather than left implicit.
8. *Scope creep from building every edge case as a full feature* → mitigated by explicitly naming multi-document-PDF splitting, disk retention, and multi-language support as out-of-scope limitations rather than partially-built features.

**Final assumptions:**
- Single-user, single-tenant, desktop-browser usage; no auth, no cloud sync, no ERP push.
- Batch upload yes; batch review no; batch export yes.
- OCR/LLM providers are configurable adapters; the app must remain demoable via sample/mocked processing paths if no API keys are configured.
- Every extraction attempt and every correction version is stored (not mutated in place) — the audit trail is additive by construction.
- "Approve" signifies the operator has accepted responsibility for the corrected document state; only approved documents export through the normal flow.
- Multi-document-PDF splitting, storage-retention/cleanup automation, and multi-language extraction are explicitly out of scope for this MVP.

## App Features

Both Codex and I ended up building nearly identical must-have lists this round — same 8 core capabilities (batch intake with real state tracking, the OCR→extraction→one-repair-retry pipeline with a genuine failure state, server-computed `needs_review` instead of a model self-report passthrough, the review workspace as the actual product surface, Ship To matching with explanation and manual fallback, correction history/safe reprocessing, approval/export, and prompt+catalog settings). Nobody's must-have list contradicts the other's — mine just adds sharper, testable acceptance criteria on top (e.g., the subtotal+tax≠total-forces-review test, the forced-double-failure test) and elevates the stuck-`processing`-timeout item from should-have to must-have, which is a stricter reading but doesn't conflict with anything Codex said — it's consistent with the risk register we already locked in last phase (item 7: zombie processing documents).

The one thing worth reconciling rather than treating as real disagreement: Codex's phrasing put the dashboard in the "should-have" paragraph while admitting in the same sentence "it's required" — that's a wording slip, not a genuine vote to descope it, since the dashboard is an explicit hard requirement from the prompt contract two phases back. I'm resolving that by keeping it must-have, which is what both the spec and Claude's list already say.

Gemini still couldn't join. No open disagreement surfaced between the two participating voices — this reads as real convergence, not a rubber stamp.

CONSENSUS: YES

## Final Output

**Must-have features** (every one directly protects the core loop or the trust story; each has a user story + acceptance criteria):

1. **Batch PDF intake with durable per-document state.**
   Story: "I can drop in a stack of PO PDFs and see each one tracked independently, even across a restart."
   Acceptance: multiple PDFs upload in one action, each gets its own row/state; state persists in SQLite (not client-side guesswork) across a page refresh or server restart; a non-PDF renamed to `.pdf`, a password-protected PDF, or a corrupted file fails at conversion with a specific visible error within seconds — no hang, no silent 500.

2. **End-to-end pipeline with one repair retry and a real failure state.**
   Story: "OCR and extraction run automatically, and if extraction fails twice, I still have a usable path forward."
   Acceptance: every page is OCR'd regardless of embedded text layer; invalid JSON triggers exactly one repair-prompt retry; if both attempts fail, the document lands in a distinct `extraction_failed` state (not `needs_review`) with the PDF, OCR text, and both raw failed outputs visible, fields blank but hand-enterable, and a "reprocess with edited prompt" action available.

3. **Server-computed `needs_review`, not a model self-report passthrough.**
   Story: "The app tells me what's actually risky, not just what the model claims to be unsure about."
   Acceptance: every field carries `value/confidence/source_text/page_number/needs_review`; `needs_review` is driven by three independent layers — confidence threshold, missing/mismatched `source_text` forcing review regardless of stated confidence, and business-rule reconciliation. Concrete test: a sample PO where subtotal+tax deliberately ≠ total must flag `total` as `needs_review` even if the model reports high confidence on it.

4. **The side-by-side review workspace (the actual product).**
   Story: "I can review, correct, and approve a PO faster than retyping it, and I always see why a value was produced."
   Acceptance: PDF and extracted fields shown together; flagged fields identifiable at a glance; header fields and line-item table are editable; source evidence is inline or one click away, never buried; raw OCR and raw JSON exist as secondary tabs; a document with zero flagged fields doesn't force the operator through irrelevant evidence inspection to reach approve; approval is blocked until required issues are resolved or explicitly accepted.

5. **Ship To matching with explanation and manual/inline fallback.**
   Story: "I can trust or override the suggested Ship To without leaving the review flow."
   Acceptance: best match + alternates returned, each with confidence and a deterministic reason string naming the actual matched attributes (alias, postal, city, partial name) — not a bare score; a no-match/empty-catalog state lets the operator pick manually from the full catalog or create a new entry inline from the extracted address without leaving review; "customer unrecognized" and "customer known, address doesn't resolve" are visibly distinct states.

6. **Correction history and safe reprocessing.**
   Story: "I can re-run extraction without losing my work, and the audit trail can be trusted."
   Acceptance: each reprocess creates a new `extraction_results` row; `corrected_results` persist separately and are never silently overwritten; the UI surfaces when a correction may be stale relative to a fresh extraction; once a document is exported, its corrected snapshot is immutable — any PATCH attempt without an explicit, audit-logged "reopen" is rejected.

7. **Approval and export.**
   Story: "Once I trust the document, I lock it and get usable structured output."
   Acceptance: only `approved` documents can export; JSON and CSV are generated from corrected data; original and corrected versions both remain retrievable; export is recorded as a boundary event in `audit_log`.

8. **Prompt configuration and Ship To catalog management from the UI.**
   Story: "I can make extraction better for repeat customers without touching code."
   Acceptance: global prompt + per-customer override, both editable in-UI; editing and hitting rerun produces a new tied `extraction_results` row; Ship To catalog records and aliases are manageable from the UI, not just seeded via script.

9. **Dashboard (uploaded/processed/needing-review counts, average confidence, success rate).**
   Story: "I can see at a glance how the queue is doing."
   Acceptance: loading the dashboard against a seeded, mixed-state document set shows counts that match the database exactly — not a cached or estimated figure. Kept lightweight; this is a status view, not an analytics product.

10. **Stuck-`processing` recovery (elevated from should- to must-have).**
    Story: "A backend crash mid-pipeline doesn't leave a permanent zombie document."
    Acceptance: a document stuck in `processing` past a timeout is either auto-reset or exposes a manual retry action — never a permanently stuck row with no recovery path.

**Should-have:** keyboard-driven approve-and-advance-to-next-document; visual flagging of likely duplicate uploads; a tunable confidence threshold exposed in settings rather than hardcoded; batch end-of-day export of all approved documents in one action.

**Could-have:** inline highlighting of line-item math mismatches beyond just triggering `needs_review`; a simple original-vs-corrected diff view; saved filters on the document list; demo-mode messaging when no API keys are configured.

**Won't-build:** ERP integration, SSO, multi-user auth/permissions, queue-based async processing, vendor portals, human-assignment workflows, mobile clients, cloud sync, multi-document-PDF auto-splitting, disk-retention/cleanup automation, multi-language extraction quality, any document type beyond POs, and automated detection of "this prompt override made things worse" (the per-customer editor + rerun is the mitigation, not a regression-detection system).

**Bar for "done," not just a checklist:** the build must demonstrably pass two specific tests — a subtotal+tax≠total sample forcing `needs_review` on `total` despite high model confidence, and a forced double-failure (mocked bad-JSON twice) landing cleanly in a usable `extraction_failed` state rather than a hang or crash. Without both, the app has built a generic extraction demo, not the trusted-correction workbench this whole program has been converging on.
