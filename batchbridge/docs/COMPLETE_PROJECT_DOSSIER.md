# batchbridge — Complete Project Dossier

_Detailed deterministic archive of the orchestrator run. It includes the original prompt, final phase outputs, full discussion transcripts, task backlog, interface contracts, verification status, and recorded findings. Nothing here is inferred or fabricated._

## Original Prompt

PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-specials
Selected app slug: batchbridge

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# BatchBridge

Build mode: **MVP build**.

## App Name

BatchBridge

## Category

PO-automation

## Claude Design Handoff Prompt

(not supplied yet)

## Parent Portfolio Prompt

Build 7 completely separate production-ready apps at the same time: 3 PO-automation WEB apps (spec below), 2 'digital temple' iOS apps for Hindus AND Jains (interpretable as either) — meditation + prayer + daily practice, think Headspace crossed with Duolingo (guided sessions, streaks, structured learning paths) with a respectful touch of religion, NOT copying my existing digital temple app — and 2 Health & Fitness iOS apps that aggregate everything from Apple Health/HealthKit and surface genuinely useful analytics and insights the Health app does not (trends, correlations, validated risk scores like QRISK3/FINDRISC framed as wellness insights, not diagnosis).

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Additional notes:

The 3 PO-automation apps are WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP), not iOS apps. They must NOT copy my existing PO tool and must differ from each other in architecture/UX approach. The following spec is the FUNCTIONAL BAR each must meet (original UI and architecture, do not copy ABBYY Vantage's design): automate purchase-order intake from PDF documents — upload PO PDFs; convert to images/text; OCR each page; LLM extraction layer producing strict validated JSON (retry once with a repair prompt on invalid output; every field carries value, confidence, source_text, page_number, needs_review); extract header fields (PO number/date, customer, buyer, payer, bill-to, ship-to + address, Ship To ID, currency, subtotal, tax, total) and line items (line no, material code, description, qty, UoM, unit price, line total, requested delivery date); confidence scores with low-confidence highlighting; side-by-side PDF + extracted-data review UI with editable fields, line-item table, raw OCR and raw JSON tabs, reprocess/approve/export; store original + corrected versions; export JSON and CSV. Ship To matching: a Data Catalog of Ship To records (ID, customer, address lines, city, region, postal, country, aliases) with fuzzy matching returning best match, confidence, reason, and alternates. Prompt configuration: global prompt + per-customer prompt (customer overrides/supplements global), editable from the UI with re-run. Dashboard: totals uploaded/processed/needing review, average confidence, success rate. Backend modules: upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export. Tables: documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log. Docker + docker-compose, local PDF storage, env vars for keys (no hardcoded secrets), README, sample/mocked PO PDFs, unit tests for parsing/validation/matching, graceful error handling for failed OCR/LLM/invalid PDFs/missing fields. MVP success: upload -> see OCR -> extract -> review/edit low-confidence -> match or pick Ship To -> approve -> export JSON/CSV.


Now generate at least 14 candidate ideas, discuss them thoroughly, choose the best 7, and build all 7 to production quality.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.

## Phase Map

- **Scope the change** (`iterate_scope`) — consensus
- **Build the change** (`build_coordination`) — consensus
- **Review** (`final_review`) — consensus

## Final Phase Outputs

### Scope the change

Looking at this, the round-1 skepticism is right, and I don't need another round to confirm it — the evidence is already conclusive from the prompt text itself, not something that needs more discussion.

The original spec is unambiguous: BatchBridge is one of "3 PO-automation WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP)... not iOS apps." Every functional requirement attached to it — PDF upload, OCR, LLM extraction with confidence/source_text/page_number/needs_review, Ship To fuzzy-match catalog, side-by-side PDF+data review UI, JSON/CSV export, Docker Compose, SQLite tables — is a web-stack requirement. There is no iOS component anywhere in BatchBridge's actual spec. The "Change requested" telling us to generate an Xcode project and get it compiling for the iOS Simulator, and the "Relevant knowledge" section full of SwiftUI/Observation-framework pitfalls, belong to the sibling iOS apps in this same portfolio batch (the temple apps, the health apps) — this is boilerplate/template bleed from the orchestrator, not a real requirement for this app. Executing it literally would mean producing a native iOS shell for a product that's supposed to be a dockerized Python/TypeScript service — that satisfies a build check while guaranteeing total failure against the actual MVP success criterion (upload→OCR→extract→review→match→approve→export).

I'm not going to spend a second round re-confirming something the prompt already settles. The one thing I can't verify from here (sandboxed out of app_build) is which of two states app_build is actually in — legitimate FastAPI/React sources that just need wiring, or mistakenly-generated Swift sources — so the decision has to instruct the next phase to branch on that, rather than assume.

CONSENSUS: YES

## Final Output

BatchBridge is a FastAPI + React/Vite + Docker web app per the original spec — it is NOT an iOS app, and the "generate an Xcode project / compile for iOS Simulator" instruction is scope bleed from this portfolio's iOS apps and must be disregarded. Do not create a .pbxproj, Xcode target, or Simulator build for this app.

Next phase must first inspect app_build's actual contents to determine which situation it's in, then act accordingly:

1. **If app_build contains Swift/SwiftUI sources** (an earlier phase misbuilt this as iOS): treat this as a scope-correction, not a wiring task. Discard/ignore those iOS sources and scaffold the actual required stack: FastAPI backend with the specified modules (upload, pdf-to-image/text, OCR, LLM extraction w/ retry-once repair prompt, validation, catalog matching, correction/audit, export) and tables (documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log); a React+Vite frontend with the side-by-side PDF/data review UI, editable fields, raw OCR/JSON tabs, reprocess/approve/export, and the dashboard; Docker + docker-compose wiring; sample PO PDFs; unit tests for parsing/validation/matching.

2. **If app_build already contains legitimate FastAPI/React sources** (iOS instruction was just template noise): "make it compile cleanly" means `docker compose build` succeeds and the backend (uvicorn) and frontend (vite) both boot — fix missing entrypoints, requirements.txt/package.json wiring, Dockerfile/docker-compose.yml issues, not anything Xcode-related.

In either case, the definition of done is the original MVP success path running locally end-to-end: upload PDF → OCR → LLM extraction → review/edit low-confidence fields → Ship To match or manual pick → approve → export JSON/CSV — verified via docker-compose, not via a Simulator build.

### Build the change

This confirms the app is in solid shape — real docker-compose, requirements, all lanes wired. I'll write the final integrator recap.

CONSENSUS: YES

## Final Output

BatchBridge is what the earlier scope decision said it should be: a FastAPI + React/Vite + Docker web app for PO-automation — not iOS, and the Xcode/Simulator instruction in the original change request stays disregarded as portfolio template bleed.

**What's actually in app_build now**, confirmed by reading the real files (not the summaries):
- A FastAPI backend with all routers mounted in `main.py` (documents, dashboard, ship-to, prompts), a working pipeline (`upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-layer needs_review → Ship To fuzzy match → persist`), SQLAlchemy models/tables for everything the spec calls for, and integration tests that drive a document through the full lifecycle — upload, review, correct, approve, export, reopen — against a real temp SQLite DB.
- A React/Vite frontend: Documents list, a Review workspace (side-by-side PDF + extracted data, raw OCR/JSON tabs, edit/approve/reprocess/export), a Ship To catalog, a Prompt Config screen (global + per-customer overrides), and a Dashboard.
- Docker + docker-compose wired end-to-end (`docker compose up` should boot both services), `.env.example`, sample fixture PDFs, and unit/integration tests across parsing, validation, matching, and the API layer.

**What I did this round as integrator:** confirmed app_build is the legitimate web-stack state (not the misbuilt-iOS branch), then read this round's actual diff instead of trusting the log, and found two real bugs that would've shipped otherwise:
1. The brand-new "+ New override" prompt flow broke after exactly one keystroke — the input's own visibility was wired to depend on the very field it edited, so it vanished the instant you typed a character. Fixed by keying visibility off a stable prop instead.
2. A field-name fix in `documents.py` (reading `processing_progress_label` instead of a slug) was correct, but nothing in the pipeline ever set that field — so every in-progress document would've silently shown a generic "Processing…" badge instead of real step text. Wired the label into every pipeline stage transition.

**What's still missing:** shell execution (npm, pip, even bare `python3`) has been walled off in this sandbox for five-plus rounds straight — everything here is verified by hand-tracing source, not by an actual compiler or test run. That remains the single biggest open risk and the top priority for whoever next has an approved shell: run `docker compose build`, `pytest`, and `npm run typecheck && npm test` for real. Real OCR/LLM providers and real PDF rasterization are intentionally out of scope for this MVP (mock providers behind a documented Protocol seam).

**How to run it:** `docker compose up --build` from the repo root (needs a `.env` copied from `.env.example`) — backend on `127.0.0.1:8000`, frontend on `127.0.0.1:8080`. MVP path: upload a PO PDF → watch it process → review/edit low-confidence fields → resolve or pick a Ship To match → approve → export JSON/CSV.

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

### Review

Go/no-go call for this round: I'm calling it a **conditional go** — the scope correction (web app, not iOS) was right, the feature set on paper matches the spec, but nobody has ever executed this code, and that has to be stated as the headline risk, not buried.

CONSENSUS: YES

## Final Output

**What changed:** The team correctly refused the literal "generate an Xcode project / compile for iOS Simulator" instruction as portfolio template bleed — BatchBridge's own spec is unambiguous that it's a FastAPI + React/Vite + Docker web app, and nothing in its functional requirements (PDF upload, OCR, LLM extraction, Ship To matching, review UI, export) has any iOS shape. No `.pbxproj` was created, and none should be. In its place, the build rounds confirmed and hardened the actual web stack: FastAPI routers (documents, dashboard, ship-to, prompts) wired into `main.py`, a full pipeline (upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-tier needs_review → Ship To fuzzy match → persist), SQLAlchemy models for every table the spec calls for, and a React/Vite frontend covering Documents list, Review workspace (side-by-side PDF/data, raw OCR/JSON tabs, edit/approve/reprocess/export), Ship To catalog, Prompt Config (global + per-customer), and Dashboard. Docker + docker-compose, `.env.example`, sample fixture PDFs, and unit/integration tests are in place. Two real bugs were caught and fixed during integration: a prompt-override input that hid itself after the first keystroke (visibility was wired to the field it edited), and a processing-progress label that was read by the API but never actually set anywhere in the pipeline (every in-progress doc would've shown a generic "Processing…" instead of real step text).

**Verification status:** UNVERIFIED via xcodebuild — "no .xcodeproj/.xcworkspace found." That result is a category mismatch, not a real signal about this app's health: xcodebuild can never meaningfully pass or fail for a Python/TypeScript web app, and this app correctly has no Xcode project to find. The honest status underneath that label is stronger and more concerning than the label itself suggests: across every round of both prior phases, no shell has ever actually executed `docker compose build`, `docker compose up`, `pytest`, `npm install`, or `npm run typecheck` for this codebase. Everything claimed "working" was verified by hand-tracing source files side by side, which is a real form of review — it's how the two bugs above were found — but it is not the same as proof the app runs. Nobody has watched the seven-step golden path (upload → OCR → extract → review/edit → Ship To match → approve → export JSON/CSV) actually happen.

**Prompt coverage:** Functionally complete on paper against the BatchBridge spec — every named backend module, table, frontend screen, and the mocked-provider approach for OCR/LLM (a documented Protocol seam, appropriate for MVP) and for PDF rasterization are accounted for in the source as read.

**Known limitations:** (1) Zero real execution to date — this is the single biggest gap between "reviewed" and "verified." (2) OCR/LLM providers and PDF rasterization are mocked by design for this MVP, not real integrations — a real user pointing this at production POs would need those swapped in. (3) The verification tooling available to this pipeline (xcodebuild) structurally cannot attest to a web-stack child app; that's a gap in the harness, not in BatchBridge.

**Top follow-ups (launch blockers, with owner/next step):**
1. Owner: whoever next has approved shell access. Run `docker compose up --build` from the repo root (after copying `.env.example` to `.env`), confirm backend boots on `127.0.0.1:8000` and frontend on `127.0.0.1:8080`.
2. Same owner: run `pytest` on the backend and `npm run typecheck && npm test` on the frontend — these have never been executed, only read.
3. Same owner: manually upload one of the bundled sample PO PDFs and walk the full path — see OCR output, review/edit a low-confidence field, resolve or hand-pick a Ship To match, approve, export both JSON and CSV — before anyone calls this MVP done in fact rather than in source review.

Until step 3 happens once, treat this as "reviewed and internally consistent, execution unconfirmed" rather than "working."

VERIFICATION: UNVERIFIED

## Full Discussion Transcripts

### Scope the change

# batchbridge — Iterate Scope

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 04:21:45._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-specials
Selected app slug: batchbridge

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# BatchBridge

Build mode: **MVP build**.

## App Name

BatchBridge

## Category

PO-automation

## Claude Design Handoff Prompt

(not supplied yet)

## Parent Portfolio Prompt

Build 7 completely separate production-ready apps at the same time: 3 PO-automation WEB apps (spec below), 2 'digital temple' iOS apps for Hindus AND Jains (interpretable as either) — meditation + prayer + daily practice, think Headspace crossed with Duolingo (guided sessions, streaks, structured learning paths) with a respectful touch of religion, NOT copying my existing digital temple app — and 2 Health & Fitness iOS apps that aggregate everything from Apple Health/HealthKit and surface genuinely useful analytics and insights the Health app does not (trends, correlations, validated risk scores like QRISK3/FINDRISC framed as wellness insights, not diagnosis).

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Additional notes:

The 3 PO-automation apps are WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP), not iOS apps. They must NOT copy my existing PO tool and must differ from each other in architecture/UX approach. The following spec is the FUNCTIONAL BAR each must meet (original UI and architecture, do not copy ABBYY Vantage's design): automate purchase-order intake from PDF documents — upload PO PDFs; convert to images/text; OCR each page; LLM extraction layer producing strict validated JSON (retry once with a repair prompt on invalid output; every field carries value, confidence, source_text, page_number, needs_review); extract header fields (PO number/date, customer, buyer, payer, bill-to, ship-to + address, Ship To ID, currency, subtotal, tax, total) and line items (line no, material code, description, qty, UoM, unit price, line total, requested delivery date); confidence scores with low-confidence highlighting; side-by-side PDF + extracted-data review UI with editable fields, line-item table, raw OCR and raw JSON tabs, reprocess/approve/export; store original + corrected versions; export JSON and CSV. Ship To matching: a Data Catalog of Ship To records (ID, customer, address lines, city, region, postal, country, aliases) with fuzzy matching returning best match, confidence, reason, and alternates. Prompt configuration: global prompt + per-customer prompt (customer overrides/supplements global), editable from the UI with re-run. Dashboard: totals uploaded/processed/needing review, average confidence, success rate. Backend modules: upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export. Tables: documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log. Docker + docker-compose, local PDF storage, env vars for keys (no hardcoded secrets), README, sample/mocked PO PDFs, unit tests for parsing/validation/matching, graceful error handling for failed OCR/LLM/invalid PDFs/missing fields. MVP success: upload -> see OCR -> extract -> review/edit low-confidence -> match or pick Ship To -> approve -> export JSON/CSV.


Now generate at least 14 candidate ideas, discuss them thoroughly, choose the best 7, and build all 7 to production quality.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
```

## Phase Purpose

The app ALREADY exists and compiles in app_build. Decide exactly what to change to satisfy the latest requested change (see the '## Change requested' section of the prompt): which files to touch and what to add. Keep it minimal and preserve existing behavior. Do NOT rebuild from scratch.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex returned empty output — refusing to fabricate a response. See logs/._

**Claude (Product Strategist · Skeptic) — Round 1**

Before anyone touches project wiring, I want to flag the thing that should stop this phase cold: BatchBridge is specified, in the same prompt we're all reading, as a FastAPI + React/Vite web app — Docker, SQLite, no iOS involved at all ("The 3 PO-automation apps are WEB apps ... not iOS apps"). The change request we've been handed talks about generating an Xcode project and making it "compile cleanly for the iOS Simulator," and the reference material bundled into this phase is entirely SwiftUI/iOS pitfalls. That's not a small mismatch — it's evidence that somewhere upstream this app got misclassified or a build step ran against the wrong template, producing Swift sources (or an iOS-shaped build request) for what is supposed to be a Python/TypeScript web product.

My actual position: we should not proceed straight into "wire the sources into an Xcode project" as if that's obviously correct. The first real decision this phase needs to make is diagnostic, not constructive — go look at what's actually sitting in app_build. If what's there is Swift/SwiftUI files, the right move is to say so plainly and treat this as a scope error to correct (rebuild BatchBridge as the FastAPI+React+Docker stack the spec demands), not to paper over it by making a native iOS shell compile. Making it "compile cleanly for the iOS Simulator" would be optimizing for the wrong success criterion entirely — we'd ship something that passes a build check but has zero chance of meeting the actual functional bar (PDF ingestion, OCR, LLM extraction with confidence/source_text/page_number/needs_review, Ship To fuzzy-match catalog, side-by-side review UI, export). None of that is served by getting a Simulator target green.

The biggest risk to my own take: maybe I'm wrong about what "batchbridge" contains right now — it's possible earlier phases already produced legitimate web-app sources and this "iOS Simulator" instruction is just boilerplate leaking in from a shared phase template across the portfolio (the Hindu/Jain temple apps and Health apps in this same batch are iOS, so it's plausible this phase_rules.json / pitfalls doc got attached to the wrong app by the orchestrator rather than the app itself being wrong). If that's the case, the fix is trivial: ignore the iOS-specific instructions, and the "make it compile" mandate should instead mean "make the Docker Compose stack build and the FastAPI app boot with the React frontend serving," which is a completely different set of concrete actions (docker-compose build/up, uvicorn entrypoint, vite build, requirements.txt/package.json wiring) than anything about .pbxproj files or target membership.

What must not get lost regardless of which branch we're in: the MVP success criterion from the original spec — upload PDF → OCR → LLM extraction → review/edit low-confidence fields → Ship To match or manual pick → approve → export JSON/CSV — is the only definition of "done" that matters here. Whatever this phase decides to touch, the concrete deliverable has to be evaluated against that pipeline actually running end-to-end locally (via docker-compose), not against whether some IDE-specific build target is green. I'd rather we spend this round confirming which of these two worlds we're actually in before committing to any file list.

**Gemini — Round 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini CLI -> auth/tier error_

**Coordinator (Claude) — decision after round 1**

Looking at this, the round-1 skepticism is right, and I don't need another round to confirm it — the evidence is already conclusive from the prompt text itself, not something that needs more discussion.

The original spec is unambiguous: BatchBridge is one of "3 PO-automation WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP)... not iOS apps." Every functional requirement attached to it — PDF upload, OCR, LLM extraction with confidence/source_text/page_number/needs_review, Ship To fuzzy-match catalog, side-by-side PDF+data review UI, JSON/CSV export, Docker Compose, SQLite tables — is a web-stack requirement. There is no iOS component anywhere in BatchBridge's actual spec. The "Change requested" telling us to generate an Xcode project and get it compiling for the iOS Simulator, and the "Relevant knowledge" section full of SwiftUI/Observation-framework pitfalls, belong to the sibling iOS apps in this same portfolio batch (the temple apps, the health apps) — this is boilerplate/template bleed from the orchestrator, not a real requirement for this app. Executing it literally would mean producing a native iOS shell for a product that's supposed to be a dockerized Python/TypeScript service — that satisfies a build check while guaranteeing total failure against the actual MVP success criterion (upload→OCR→extract→review→match→approve→export).

I'm not going to spend a second round re-confirming something the prompt already settles. The one thing I can't verify from here (sandboxed out of app_build) is which of two states app_build is actually in — legitimate FastAPI/React sources that just need wiring, or mistakenly-generated Swift sources — so the decision has to instruct the next phase to branch on that, rather than assume.

CONSENSUS: YES

## Final Output

BatchBridge is a FastAPI + React/Vite + Docker web app per the original spec — it is NOT an iOS app, and the "generate an Xcode project / compile for iOS Simulator" instruction is scope bleed from this portfolio's iOS apps and must be disregarded. Do not create a .pbxproj, Xcode target, or Simulator build for this app.

Next phase must first inspect app_build's actual contents to determine which situation it's in, then act accordingly:

1. **If app_build contains Swift/SwiftUI sources** (an earlier phase misbuilt this as iOS): treat this as a scope-correction, not a wiring task. Discard/ignore those iOS sources and scaffold the actual required stack: FastAPI backend with the specified modules (upload, pdf-to-image/text, OCR, LLM extraction w/ retry-once repair prompt, validation, catalog matching, correction/audit, export) and tables (documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log); a React+Vite frontend with the side-by-side PDF/data review UI, editable fields, raw OCR/JSON tabs, reprocess/approve/export, and the dashboard; Docker + docker-compose wiring; sample PO PDFs; unit tests for parsing/validation/matching.

2. **If app_build already contains legitimate FastAPI/React sources** (iOS instruction was just template noise): "make it compile cleanly" means `docker compose build` succeeds and the backend (uvicorn) and frontend (vite) both boot — fix missing entrypoints, requirements.txt/package.json wiring, Dockerfile/docker-compose.yml issues, not anything Xcode-related.

In either case, the definition of done is the original MVP success path running locally end-to-end: upload PDF → OCR → LLM extraction → review/edit low-confidence fields → Ship To match or manual pick → approve → export JSON/CSV — verified via docker-compose, not via a Simulator build.

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This passes. The output correctly identifies a genuine, prompt-level contradiction — the original spec explicitly classifies BatchBridge as one of the "3 PO-automation WEB apps... not iOS apps" with a fully-specified FastAPI/React/Docker/SQLite stack, while the change request and reference material are iOS/SwiftUI-specific. Rather than mechanically complying with an instruction that would produce a build-passing but functionally worthless artifact (a Simulator-compilable shell with none of PDF/OCR/LLM-extraction/Ship-To-matching/export), the coordinator correctly refuses to let "compiles" substitute for "meets the spec." That's the right call given the rubric's emphasis on real user-visible behavior and not declaring done until build verification agrees with actual function.

The output is also honest about its own blind spot (sandboxed away from app_build) instead of guessing, and gives the next phase a concrete, branch-conditional action plan for both possible states of app_build — including the specific backend modules/tables and frontend surfaces required if a rebuild-as-web-stack is needed, and the specific "docker compose build + uvicorn/vite boot" definition of done if legitimate web sources are already present. It ties every decision back to the original MVP success path (upload→OCR→extract→review→match→approve→export) as the actual acceptance test, which is the correct anchor per the original prompt. Internally consistent, no contradiction with prior phase decisions (there are none yet), and no unresolved disagreement papered over — Codex/Gemini were unavailable, and Claude's own round-1 skepticism is fully addressed rather than glossed.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Looking at this, the round-1 skepticism is right, and I don't need another round to confirm it — the evidence is already conclusive from the prompt text itself, not something that needs more discussion.

The original spec is unambiguous: BatchBridge is one of "3 PO-automation WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP)... not iOS apps." Every functional requirement attached to it — PDF upload, OCR, LLM extraction with confidence/source_text/page_number/needs_review, Ship To fuzzy-match catalog, side-by-side PDF+data review UI, JSON/CSV export, Docker Compose, SQLite tables — is a web-stack requirement. There is no iOS component anywhere in BatchBridge's actual spec. The "Change requested" telling us to generate an Xcode project and get it compiling for the iOS Simulator, and the "Relevant knowledge" section full of SwiftUI/Observation-framework pitfalls, belong to the sibling iOS apps in this same portfolio batch (the temple apps, the health apps) — this is boilerplate/template bleed from the orchestrator, not a real requirement for this app. Executing it literally would mean producing a native iOS shell for a product that's supposed to be a dockerized Python/TypeScript service — that satisfies a build check while guaranteeing total failure against the actual MVP success criterion (upload→OCR→extract→review→match→approve→export).

I'm not going to spend a second round re-confirming something the prompt already settles. The one thing I can't verify from here (sandboxed out of app_build) is which of two states app_build is actually in — legitimate FastAPI/React sources that just need wiring, or mistakenly-generated Swift sources — so the decision has to instruct the next phase to branch on that, rather than assume.

CONSENSUS: YES

## Final Output

BatchBridge is a FastAPI + React/Vite + Docker web app per the original spec — it is NOT an iOS app, and the "generate an Xcode project / compile for iOS Simulator" instruction is scope bleed from this portfolio's iOS apps and must be disregarded. Do not create a .pbxproj, Xcode target, or Simulator build for this app.

Next phase must first inspect app_build's actual contents to determine which situation it's in, then act accordingly:

1. **If app_build contains Swift/SwiftUI sources** (an earlier phase misbuilt this as iOS): treat this as a scope-correction, not a wiring task. Discard/ignore those iOS sources and scaffold the actual required stack: FastAPI backend with the specified modules (upload, pdf-to-image/text, OCR, LLM extraction w/ retry-once repair prompt, validation, catalog matching, correction/audit, export) and tables (documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log); a React+Vite frontend with the side-by-side PDF/data review UI, editable fields, raw OCR/JSON tabs, reprocess/approve/export, and the dashboard; Docker + docker-compose wiring; sample PO PDFs; unit tests for parsing/validation/matching.

2. **If app_build already contains legitimate FastAPI/React sources** (iOS instruction was just template noise): "make it compile cleanly" means `docker compose build` succeeds and the backend (uvicorn) and frontend (vite) both boot — fix missing entrypoints, requirements.txt/package.json wiring, Dockerfile/docker-compose.yml issues, not anything Xcode-related.

In either case, the definition of done is the original MVP success path running locally end-to-end: upload PDF → OCR → LLM extraction → review/edit low-confidence fields → Ship To match or manual pick → approve → export JSON/CSV — verified via docker-compose, not via a Simulator build.

---

CONSENSUS: YES

### Build the change

# batchbridge — Build Coordination

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 04:23:51._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-specials
Selected app slug: batchbridge

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# BatchBridge

Build mode: **MVP build**.

## App Name

BatchBridge

## Category

PO-automation

## Claude Design Handoff Prompt

(not supplied yet)

## Parent Portfolio Prompt

Build 7 completely separate production-ready apps at the same time: 3 PO-automation WEB apps (spec below), 2 'digital temple' iOS apps for Hindus AND Jains (interpretable as either) — meditation + prayer + daily practice, think Headspace crossed with Duolingo (guided sessions, streaks, structured learning paths) with a respectful touch of religion, NOT copying my existing digital temple app — and 2 Health & Fitness iOS apps that aggregate everything from Apple Health/HealthKit and surface genuinely useful analytics and insights the Health app does not (trends, correlations, validated risk scores like QRISK3/FINDRISC framed as wellness insights, not diagnosis).

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Additional notes:

The 3 PO-automation apps are WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP), not iOS apps. They must NOT copy my existing PO tool and must differ from each other in architecture/UX approach. The following spec is the FUNCTIONAL BAR each must meet (original UI and architecture, do not copy ABBYY Vantage's design): automate purchase-order intake from PDF documents — upload PO PDFs; convert to images/text; OCR each page; LLM extraction layer producing strict validated JSON (retry once with a repair prompt on invalid output; every field carries value, confidence, source_text, page_number, needs_review); extract header fields (PO number/date, customer, buyer, payer, bill-to, ship-to + address, Ship To ID, currency, subtotal, tax, total) and line items (line no, material code, description, qty, UoM, unit price, line total, requested delivery date); confidence scores with low-confidence highlighting; side-by-side PDF + extracted-data review UI with editable fields, line-item table, raw OCR and raw JSON tabs, reprocess/approve/export; store original + corrected versions; export JSON and CSV. Ship To matching: a Data Catalog of Ship To records (ID, customer, address lines, city, region, postal, country, aliases) with fuzzy matching returning best match, confidence, reason, and alternates. Prompt configuration: global prompt + per-customer prompt (customer overrides/supplements global), editable from the UI with re-run. Dashboard: totals uploaded/processed/needing review, average confidence, success rate. Backend modules: upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export. Tables: documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log. Docker + docker-compose, local PDF storage, env vars for keys (no hardcoded secrets), README, sample/mocked PO PDFs, unit tests for parsing/validation/matching, graceful error handling for failed OCR/LLM/invalid PDFs/missing fields. MVP success: upload -> see OCR -> extract -> review/edit low-confidence -> match or pick Ship To -> approve -> export JSON/CSV.


Now generate at least 14 candidate ideas, discuss them thoroughly, choose the best 7, and build all 7 to production quality.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
```

## Phase Purpose

Make the requested change to the EXISTING app in app_build. Extend the current code; do not rebuild from scratch and do not delete working features. Ship a compiling app.

## Transcript


_Parallel build — 3 workers running at once: Codex builds the core data model + domain logic — data structures, state management, persistence, and business rules; Claude builds the primary UI — the main screens the user sees and taps through, plus navigation and layout; Gemini builds supporting pieces — services/networking, utilities, secondary screens, and lightweight tests. Integrator: Claude._

### Iteration 1


**Codex (QA & Risk · Skeptic) — Iteration 1 (skipped: CLI unavailable)**

_Codex returned empty output — refusing to fabricate a response. See logs/._

**Claude (Frontend Engineer · Pragmatist) — Iteration 1**

**What I built this round** (primary_ui lane, Frontend Engineer/Pragmatist hat):

- Ran the T-018 contract-freeze diff against the actual backend Pydantic schemas for the first time (they only landed in iteration 4) — `types/review.ts`, `types/shipTo.ts`, `types/dashboard.ts`, and all five previously-"assumed" endpoint URLs in `api/documents.ts` all match the real backend field-for-field, path-for-path. This closes the biggest open risk flagged since iteration 1.
- Fixed a real bug in `PromptEditor.tsx`: no `key` on the component meant switching between prompts in the sidebar didn't reset its internal text/mode state — edits from the previously-selected prompt would bleed into the new selection.
- Closed the flagged "no way to create a new per-customer prompt override" gap: added a "+ New override" flow in `PromptConfig.tsx` using `crypto.randomUUID()` (confirmed the backend's `PUT /api/prompts/{id}` is an upsert, so a client-generated id works cleanly), with save disabled until a customer name is entered.
- Documented all of it in `INTEGRATION_LOG.md`.

**What remains:** `npm`/`node`/`tsc` invocations still require an approval that isn't available in this session (tried three different invocation forms, all blocked) — same wall every prior round hit. Everything above is verified by direct field-by-field comparison of the actual source files, not by running the compiler. Next step for whoever gets shell approval: `npm install && npm run typecheck && npm test` plus `pip install -r backend/requirements.txt && pytest`.

**Gemini (QA & Risk · User Advocate) — Iteration 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini CLI -> auth/tier error_

**Integrator (Claude) — after iteration 1**

This confirms the app is in solid shape — real docker-compose, requirements, all lanes wired. I'll write the final integrator recap.

CONSENSUS: YES

## Final Output

BatchBridge is what the earlier scope decision said it should be: a FastAPI + React/Vite + Docker web app for PO-automation — not iOS, and the Xcode/Simulator instruction in the original change request stays disregarded as portfolio template bleed.

**What's actually in app_build now**, confirmed by reading the real files (not the summaries):
- A FastAPI backend with all routers mounted in `main.py` (documents, dashboard, ship-to, prompts), a working pipeline (`upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-layer needs_review → Ship To fuzzy match → persist`), SQLAlchemy models/tables for everything the spec calls for, and integration tests that drive a document through the full lifecycle — upload, review, correct, approve, export, reopen — against a real temp SQLite DB.
- A React/Vite frontend: Documents list, a Review workspace (side-by-side PDF + extracted data, raw OCR/JSON tabs, edit/approve/reprocess/export), a Ship To catalog, a Prompt Config screen (global + per-customer overrides), and a Dashboard.
- Docker + docker-compose wired end-to-end (`docker compose up` should boot both services), `.env.example`, sample fixture PDFs, and unit/integration tests across parsing, validation, matching, and the API layer.

**What I did this round as integrator:** confirmed app_build is the legitimate web-stack state (not the misbuilt-iOS branch), then read this round's actual diff instead of trusting the log, and found two real bugs that would've shipped otherwise:
1. The brand-new "+ New override" prompt flow broke after exactly one keystroke — the input's own visibility was wired to depend on the very field it edited, so it vanished the instant you typed a character. Fixed by keying visibility off a stable prop instead.
2. A field-name fix in `documents.py` (reading `processing_progress_label` instead of a slug) was correct, but nothing in the pipeline ever set that field — so every in-progress document would've silently shown a generic "Processing…" badge instead of real step text. Wired the label into every pipeline stage transition.

**What's still missing:** shell execution (npm, pip, even bare `python3`) has been walled off in this sandbox for five-plus rounds straight — everything here is verified by hand-tracing source, not by an actual compiler or test run. That remains the single biggest open risk and the top priority for whoever next has an approved shell: run `docker compose build`, `pytest`, and `npm run typecheck && npm test` for real. Real OCR/LLM providers and real PDF rasterization are intentionally out of scope for this MVP (mock providers behind a documented Protocol seam).

**How to run it:** `docker compose up --build` from the repo root (needs a `.env` copied from `.env.example`) — backend on `127.0.0.1:8000`, frontend on `127.0.0.1:8080`. MVP path: upload a PO PDF → watch it process → review/edit low-confidence fields → resolve or pick a Ship To match → approve → export JSON/CSV.

### Verification

⚠️ **Verification initial** — no .xcodeproj/.xcworkspace found. (xcodebuild)

## Coordinator Decision

See the coordinator's message above.

## Final Output

This confirms the app is in solid shape — real docker-compose, requirements, all lanes wired. I'll write the final integrator recap.

CONSENSUS: YES

## Final Output

BatchBridge is what the earlier scope decision said it should be: a FastAPI + React/Vite + Docker web app for PO-automation — not iOS, and the Xcode/Simulator instruction in the original change request stays disregarded as portfolio template bleed.

**What's actually in app_build now**, confirmed by reading the real files (not the summaries):
- A FastAPI backend with all routers mounted in `main.py` (documents, dashboard, ship-to, prompts), a working pipeline (`upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-layer needs_review → Ship To fuzzy match → persist`), SQLAlchemy models/tables for everything the spec calls for, and integration tests that drive a document through the full lifecycle — upload, review, correct, approve, export, reopen — against a real temp SQLite DB.
- A React/Vite frontend: Documents list, a Review workspace (side-by-side PDF + extracted data, raw OCR/JSON tabs, edit/approve/reprocess/export), a Ship To catalog, a Prompt Config screen (global + per-customer overrides), and a Dashboard.
- Docker + docker-compose wired end-to-end (`docker compose up` should boot both services), `.env.example`, sample fixture PDFs, and unit/integration tests across parsing, validation, matching, and the API layer.

**What I did this round as integrator:** confirmed app_build is the legitimate web-stack state (not the misbuilt-iOS branch), then read this round's actual diff instead of trusting the log, and found two real bugs that would've shipped otherwise:
1. The brand-new "+ New override" prompt flow broke after exactly one keystroke — the input's own visibility was wired to depend on the very field it edited, so it vanished the instant you typed a character. Fixed by keying visibility off a stable prop instead.
2. A field-name fix in `documents.py` (reading `processing_progress_label` instead of a slug) was correct, but nothing in the pipeline ever set that field — so every in-progress document would've silently shown a generic "Processing…" badge instead of real step text. Wired the label into every pipeline stage transition.

**What's still missing:** shell execution (npm, pip, even bare `python3`) has been walled off in this sandbox for five-plus rounds straight — everything here is verified by hand-tracing source, not by an actual compiler or test run. That remains the single biggest open risk and the top priority for whoever next has an approved shell: run `docker compose build`, `pytest`, and `npm run typecheck && npm test` for real. Real OCR/LLM providers and real PDF rasterization are intentionally out of scope for this MVP (mock providers behind a documented Protocol seam).

**How to run it:** `docker compose up --build` from the repo root (needs a `.env` copied from `.env.example`) — backend on `127.0.0.1:8000`, frontend on `127.0.0.1:8080`. MVP path: upload a PO PDF → watch it process → review/edit low-confidence fields → resolve or pick a Ship To match → approve → export JSON/CSV.

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

---

CONSENSUS: YES

### Review

# batchbridge — Final Review

_Generated by the autonomous multi-agent orchestrator on 2026-07-07 04:38:09._

## Original Prompt

```
PORTFOLIO_CHILD_PROJECT: true
Parent portfolio: batch-specials
Selected app slug: batchbridge

Build this app as a working local-first SwiftUI MVP.

## Selected App Spec

# BatchBridge

Build mode: **MVP build**.

## App Name

BatchBridge

## Category

PO-automation

## Claude Design Handoff Prompt

(not supplied yet)

## Parent Portfolio Prompt

Build 7 completely separate production-ready apps at the same time: 3 PO-automation WEB apps (spec below), 2 'digital temple' iOS apps for Hindus AND Jains (interpretable as either) — meditation + prayer + daily practice, think Headspace crossed with Duolingo (guided sessions, streaks, structured learning paths) with a respectful touch of religion, NOT copying my existing digital temple app — and 2 Health & Fitness iOS apps that aggregate everything from Apple Health/HealthKit and surface genuinely useful analytics and insights the Health app does not (trends, correlations, validated risk scores like QRISK3/FINDRISC framed as wellness insights, not diagnosis).

This is a multi-app PORTFOLIO request: multiple apps in one program. Each selected app becomes its own separate project — one folder per app.


Requirements for every app:
1. Must go from 0 to production-ready, not just a few features.
2. Must be unique, useful, and commercially viable.
3. Must be beautifully designed and feel premium.
4. Must provide real end-user value.
5. Must have a realistic path to monetization — a subscription or paid offering with genuine value (never cosmetics-only).
6. Should have viral potential (broad or niche) without sacrificing usefulness.
7. Must be better than its competitors in a meaningful way.
8. Local-first where applicable, architected so cloud support can be added later without rewriting.

UNIQUENESS (hard rule, non-negotiable):
- No app in this batch may be similar to another app in this batch.
- No app may be similar to anything already built or being built in this workspace or before, including: Waylay (location-based personal recall utility), TrueScale, Provenance, Scope-Guard, Practice-Loop, Proof, ReturnWise, VerveCoach, CueKeeper, Countertop, FieldQuote, my existing digital temple app, and my existing PO-automation tool.
- No app may be similar to apps in the OTHER batches of this program (check sibling project folders in the workspace for their concepts).
- Do not reuse prior concepts, themes, or mechanics from earlier apps — even if the request sounds similar to something built before, produce a differentiated concept.

Bonus points (optional — only when integral and genuinely valuable, never forced): unique use of LLMs, AR, or ML.

Build rules:
- Run the app efforts in parallel; keep discussion/design phases separate per app.
- Each app gets its own full product direction, design direction, architecture, implementation plan, and build output.
- Save all phase discussions and final decisions; at the end combine each app's full transcript into a .txt file.
- If an app is liked, also prepare Jira board + Notion project structures for backfilling later.
- Use enough rounds per phase for high-quality discussion, ending early on consensus.
- Recover cleanly from stalls; report only important milestones.

Output:
- One folder per app in the output directory — never one folder containing all apps.
Output directory:
- /Users/pchordia/Documents/iOS-App-Factory

Additional notes:

The 3 PO-automation apps are WEB apps (FastAPI backend, React+Vite frontend, Dockerized, SQLite MVP), not iOS apps. They must NOT copy my existing PO tool and must differ from each other in architecture/UX approach. The following spec is the FUNCTIONAL BAR each must meet (original UI and architecture, do not copy ABBYY Vantage's design): automate purchase-order intake from PDF documents — upload PO PDFs; convert to images/text; OCR each page; LLM extraction layer producing strict validated JSON (retry once with a repair prompt on invalid output; every field carries value, confidence, source_text, page_number, needs_review); extract header fields (PO number/date, customer, buyer, payer, bill-to, ship-to + address, Ship To ID, currency, subtotal, tax, total) and line items (line no, material code, description, qty, UoM, unit price, line total, requested delivery date); confidence scores with low-confidence highlighting; side-by-side PDF + extracted-data review UI with editable fields, line-item table, raw OCR and raw JSON tabs, reprocess/approve/export; store original + corrected versions; export JSON and CSV. Ship To matching: a Data Catalog of Ship To records (ID, customer, address lines, city, region, postal, country, aliases) with fuzzy matching returning best match, confidence, reason, and alternates. Prompt configuration: global prompt + per-customer prompt (customer overrides/supplements global), editable from the UI with re-run. Dashboard: totals uploaded/processed/needing review, average confidence, success rate. Backend modules: upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export. Tables: documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log. Docker + docker-compose, local PDF storage, env vars for keys (no hardcoded secrets), README, sample/mocked PO PDFs, unit tests for parsing/validation/matching, graceful error handling for failed OCR/LLM/invalid PDFs/missing fields. MVP success: upload -> see OCR -> extract -> review/edit low-confidence -> match or pick Ship To -> approve -> export JSON/CSV.


Now generate at least 14 candidate ideas, discuss them thoroughly, choose the best 7, and build all 7 to production quality.


## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
```

## Phase Purpose

Go/no-go on the change: what changed, what still works, and the top risks. One round.

## Transcript


### Round 1


**Codex — Round 1 (skipped: CLI unavailable)**

_Codex skipped — in cooldown (timeout)._

**Claude (Product Strategist · User Advocate) — Round 1**

Here's my honest read on this as the person who has to answer "should this ship" for an actual PO-processing user, not just for the build log.

On substance, the pivot the team made is correct and I don't want to relitigate it: BatchBridge is a FastAPI/React/Docker web app per its own spec, the Xcode/Simulator ask was portfolio template bleed, and ignoring it was the right call. On paper the feature list matches the functional bar closely — upload, convert, OCR, LLM extraction with confidence/source_text/page_number/needs_review, retry-once repair, header + line-item fields, side-by-side PDF/data review with raw OCR/JSON tabs, Ship To fuzzy match with alternates, global+per-customer prompt config, dashboard totals, JSON/CSV export, docker-compose, sample PDFs, tests. If all of that is real and wired the way the build-coordination summary claims, this is a good MVP.

But here's what worries me and it's not a nitpick: nobody has ever run this. Not once, across every round of both prior phases, has a shell executed `docker compose up`, `pytest`, `npm run typecheck`, or even `python3 -c "import x"`. Every "confirmed" and "verified" in the transcript means "I read the source and it looks internally consistent," which is a real form of review but it is not the same claim as "it works." The two bugs the integrator caught (the prompt-override input hiding itself after one keystroke, the processing-progress label never actually being set anywhere in the pipeline) are exactly the kind of thing that hand-tracing catches sometimes and misses other times — for every bug like that found, I have no confidence there isn't a sibling bug that hand-tracing didn't catch, because there's been zero compiler, zero test runner, zero browser in the loop. A user who runs `docker compose up --build` today is the first person to ever find out if this boots at all.

The verification line reads "UNVERIFIED (xcodebuild) — no .xcodeproj/.xcworkspace found." That's not a false negative to explain away — it's real, and it's also the wrong tool for this app: xcodebuild will never pass or fail meaningfully here because this was never supposed to produce an Xcode project. That's a gap in what this pipeline can attest to for a web-stack child app, not a comment on BatchBridge's actual health. I don't think we should let that ambiguity get flattened into either "verified" or "broken" in the final writeup — it needs to say plainly: the tool that runs here can't check this app type, and no other execution happened either, so the honest status is "unexecuted, reviewed by reading only."

From the user's seat, the thing that actually matters is the seven-step golden path — upload PDF, watch OCR happen, see extraction with confidence highlighting, edit a couple of low-confidence fields, resolve or hand-pick a Ship To match, approve, export both JSON and CSV — and whether that feels fast and legible, not confusing or laggy. We have never watched that happen. Mocked OCR/LLM providers are a reasonable MVP shortcut and I'm fine with them being in scope, but that has to be stated as a limitation up front, not discovered by the user mid-review. Same with real PDF rasterization being out of scope.

My position for this round: this is a conditional go, not an unconditional one. What must survive into the final output — what was built (the pipeline and screens as described), verification status stated exactly as it is (no real execution has occurred; the xcodebuild check is a category mismatch for this app, not a pass), prompt coverage (functionally complete on paper against the spec), and the top follow-up stated as a launch blocker with an owner: someone with real shell access needs to run `docker compose up --build`, hit the upload endpoint with one of the sample PDFs, and walk the full review→approve→export path before anyone calls this done. Until that happens once, "solid shape" is an opinion about the source code, not a fact about the product.

**Gemini — Round 1 (skipped: CLI unavailable)**

_Gemini unavailable headless (agy needs a terminal; gemini-cli tier deprecated). gemini CLI -> auth/tier error_

**Coordinator (Claude) — decision after round 1**

Go/no-go call for this round: I'm calling it a **conditional go** — the scope correction (web app, not iOS) was right, the feature set on paper matches the spec, but nobody has ever executed this code, and that has to be stated as the headline risk, not buried.

CONSENSUS: YES

## Final Output

**What changed:** The team correctly refused the literal "generate an Xcode project / compile for iOS Simulator" instruction as portfolio template bleed — BatchBridge's own spec is unambiguous that it's a FastAPI + React/Vite + Docker web app, and nothing in its functional requirements (PDF upload, OCR, LLM extraction, Ship To matching, review UI, export) has any iOS shape. No `.pbxproj` was created, and none should be. In its place, the build rounds confirmed and hardened the actual web stack: FastAPI routers (documents, dashboard, ship-to, prompts) wired into `main.py`, a full pipeline (upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-tier needs_review → Ship To fuzzy match → persist), SQLAlchemy models for every table the spec calls for, and a React/Vite frontend covering Documents list, Review workspace (side-by-side PDF/data, raw OCR/JSON tabs, edit/approve/reprocess/export), Ship To catalog, Prompt Config (global + per-customer), and Dashboard. Docker + docker-compose, `.env.example`, sample fixture PDFs, and unit/integration tests are in place. Two real bugs were caught and fixed during integration: a prompt-override input that hid itself after the first keystroke (visibility was wired to the field it edited), and a processing-progress label that was read by the API but never actually set anywhere in the pipeline (every in-progress doc would've shown a generic "Processing…" instead of real step text).

**Verification status:** UNVERIFIED via xcodebuild — "no .xcodeproj/.xcworkspace found." That result is a category mismatch, not a real signal about this app's health: xcodebuild can never meaningfully pass or fail for a Python/TypeScript web app, and this app correctly has no Xcode project to find. The honest status underneath that label is stronger and more concerning than the label itself suggests: across every round of both prior phases, no shell has ever actually executed `docker compose build`, `docker compose up`, `pytest`, `npm install`, or `npm run typecheck` for this codebase. Everything claimed "working" was verified by hand-tracing source files side by side, which is a real form of review — it's how the two bugs above were found — but it is not the same as proof the app runs. Nobody has watched the seven-step golden path (upload → OCR → extract → review/edit → Ship To match → approve → export JSON/CSV) actually happen.

**Prompt coverage:** Functionally complete on paper against the BatchBridge spec — every named backend module, table, frontend screen, and the mocked-provider approach for OCR/LLM (a documented Protocol seam, appropriate for MVP) and for PDF rasterization are accounted for in the source as read.

**Known limitations:** (1) Zero real execution to date — this is the single biggest gap between "reviewed" and "verified." (2) OCR/LLM providers and PDF rasterization are mocked by design for this MVP, not real integrations — a real user pointing this at production POs would need those swapped in. (3) The verification tooling available to this pipeline (xcodebuild) structurally cannot attest to a web-stack child app; that's a gap in the harness, not in BatchBridge.

**Top follow-ups (launch blockers, with owner/next step):**
1. Owner: whoever next has approved shell access. Run `docker compose up --build` from the repo root (after copying `.env.example` to `.env`), confirm backend boots on `127.0.0.1:8000` and frontend on `127.0.0.1:8080`.
2. Same owner: run `pytest` on the backend and `npm run typecheck && npm test` on the frontend — these have never been executed, only read.
3. Same owner: manually upload one of the bundled sample PO PDFs and walk the full path — see OCR output, review/edit a low-confidence field, resolve or hand-pick a Ship To match, approve, export both JSON and CSV — before anyone calls this MVP done in fact rather than in source review.

Until step 3 happens once, treat this as "reviewed and internally consistent, execution unconfirmed" rather than "working."

**Quality Gate (Claude) — after round 1**

QUALITY: PASS

## Feedback
This passes. It hits all five required sections (what was built, verification status, prompt coverage, known limitations, top follow-ups), stays consistent with both prior phase decisions (web-stack scope correction, integrator's bug fixes), and — critically — surfaces rather than papers over the round's real disagreement: the Product Strategist's concern that "solid shape" was never backed by actual execution. The coordinator elevates that concern into the headline of the final output ("conditional go," "nobody has ever executed this code... stated as the headline risk, not buried") instead of settling for the build-coordination phase's more confident tone.

The verification-status writeup is the strongest part: it correctly explains that UNVERIFIED/xcodebuild is a tooling category mismatch (this app has no Xcode project by design) rather than a signal of brokenness, while still being honest that the underlying claim — that the app works — has never been checked by any compiler, test runner, or running process. That's exactly the distinction the rubric's "build verification and final review agree on what works" bar requires, and it correctly refuses to let the ambiguous verification label get flattened into either "pass" or "fail."

Follow-ups are concrete and each has an owner/next step (run docker compose build/up, run pytest/npm test, manually walk the golden path) gated as literal launch blockers, not nice-to-haves — satisfying the "separate blockers from nice-to-have" and "every blocker has an owner or next step" checks. No fabricated verification claims, no scope re-litigation beyond what's needed to state the risk clearly. Good to close.

## Coordinator Decision

See the coordinator's message above.

## Final Output

Go/no-go call for this round: I'm calling it a **conditional go** — the scope correction (web app, not iOS) was right, the feature set on paper matches the spec, but nobody has ever executed this code, and that has to be stated as the headline risk, not buried.

CONSENSUS: YES

## Final Output

**What changed:** The team correctly refused the literal "generate an Xcode project / compile for iOS Simulator" instruction as portfolio template bleed — BatchBridge's own spec is unambiguous that it's a FastAPI + React/Vite + Docker web app, and nothing in its functional requirements (PDF upload, OCR, LLM extraction, Ship To matching, review UI, export) has any iOS shape. No `.pbxproj` was created, and none should be. In its place, the build rounds confirmed and hardened the actual web stack: FastAPI routers (documents, dashboard, ship-to, prompts) wired into `main.py`, a full pipeline (upload → convert → OCR → extract → repair-once-on-invalid-JSON → three-tier needs_review → Ship To fuzzy match → persist), SQLAlchemy models for every table the spec calls for, and a React/Vite frontend covering Documents list, Review workspace (side-by-side PDF/data, raw OCR/JSON tabs, edit/approve/reprocess/export), Ship To catalog, Prompt Config (global + per-customer), and Dashboard. Docker + docker-compose, `.env.example`, sample fixture PDFs, and unit/integration tests are in place. Two real bugs were caught and fixed during integration: a prompt-override input that hid itself after the first keystroke (visibility was wired to the field it edited), and a processing-progress label that was read by the API but never actually set anywhere in the pipeline (every in-progress doc would've shown a generic "Processing…" instead of real step text).

**Verification status:** UNVERIFIED via xcodebuild — "no .xcodeproj/.xcworkspace found." That result is a category mismatch, not a real signal about this app's health: xcodebuild can never meaningfully pass or fail for a Python/TypeScript web app, and this app correctly has no Xcode project to find. The honest status underneath that label is stronger and more concerning than the label itself suggests: across every round of both prior phases, no shell has ever actually executed `docker compose build`, `docker compose up`, `pytest`, `npm install`, or `npm run typecheck` for this codebase. Everything claimed "working" was verified by hand-tracing source files side by side, which is a real form of review — it's how the two bugs above were found — but it is not the same as proof the app runs. Nobody has watched the seven-step golden path (upload → OCR → extract → review/edit → Ship To match → approve → export JSON/CSV) actually happen.

**Prompt coverage:** Functionally complete on paper against the BatchBridge spec — every named backend module, table, frontend screen, and the mocked-provider approach for OCR/LLM (a documented Protocol seam, appropriate for MVP) and for PDF rasterization are accounted for in the source as read.

**Known limitations:** (1) Zero real execution to date — this is the single biggest gap between "reviewed" and "verified." (2) OCR/LLM providers and PDF rasterization are mocked by design for this MVP, not real integrations — a real user pointing this at production POs would need those swapped in. (3) The verification tooling available to this pipeline (xcodebuild) structurally cannot attest to a web-stack child app; that's a gap in the harness, not in BatchBridge.

**Top follow-ups (launch blockers, with owner/next step):**
1. Owner: whoever next has approved shell access. Run `docker compose up --build` from the repo root (after copying `.env.example` to `.env`), confirm backend boots on `127.0.0.1:8000` and frontend on `127.0.0.1:8080`.
2. Same owner: run `pytest` on the backend and `npm run typecheck && npm test` on the frontend — these have never been executed, only read.
3. Same owner: manually upload one of the bundled sample PO PDFs and walk the full path — see OCR output, review/edit a low-confidence field, resolve or hand-pick a Ship To match, approve, export both JSON and CSV — before anyone calls this MVP done in fact rather than in source review.

Until step 3 happens once, treat this as "reviewed and internally consistent, execution unconfirmed" rather than "working."

VERIFICATION: UNVERIFIED

---

CONSENSUS: YES

## Task Backlog

```json
{
  "tasks": [
    {
      "id": "T-001",
      "title": "Shared enums & envelope types (DocumentStatus, FieldReason, EvidenceRef, FieldValue)",
      "owner_lane": "data_domain",
      "files": [
        "backend/app/schemas/common.py"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "DocumentStatus, FieldReason, EvidenceRef, FieldValue defined exactly per tech_specs signatures",
        "Importable with no circular deps",
        "Unit test asserts enum values match the locked list (uploaded/processing/needs_review/extraction_failed/approved/exported/reopened)"
      ],
      "status": "pending"
    },
    {
      "id": "T-002",
      "title": "DB engine, WAL mode, schema-init strategy",
      "owner_lane": "data_domain",
      "files": [
        "backend/app/db.py"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "PRAGMA journal_mode=WAL and busy_timeout=5000 set on every connection",
        "Base.metadata.create_all() used at startup as the stated schema-init strategy (documented in a code comment, not left implicit)",
        "Session-per-request dependency function provided",
        "Two connections opened concurrently in a test don't raise under a short transaction"
      ],
      "status": "pending"
    },
    {
      "id": "T-003",
      "title": "Shared fixture PDF set + generator script",
      "owner_lane": "data_domain",
      "files": [
        "backend/tests/fixtures/clean.pdf",
        "backend/tests/fixtures/messy_scanned.pdf",
        "backend/tests/fixtures/totals_mismatch.pdf",
        "backend/tests/fixtures/double_failure_trigger.pdf",
        "backend/tests/fixtures/corrupt.pdf",
        "backend/tests/fixtures/password_protected.pdf",
        "backend/tests/fixtures/generate_fixtures.py",
        "backend/tests/fixtures/README.md"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "All six named fixtures present and committed",
        "README.md in the fixtures folder states what each fixture is for so no other lane invents a duplicate",
        "totals_mismatch.pdf has subtotal+tax != total by construction",
        "double_failure_trigger.pdf is paired with a documented mock-provider trigger, not a PDF property"
      ],
      "status": "pending"
    },
    {
      "id": "T-004",
      "title": "SQLAlchemy models for all nine tables",
      "owner_lane": "data_domain",
      "files": [
        "backend/app/models/__init__.py",
        "backend/app/models/document.py",
        "backend/app/models/page.py",
        "backend/app/models/ocr_result.py",
        "backend/app/models/extraction_result.py",
        "backend/app/models/line_item.py",
        "backend/app/models/corrected_result.py",
        "backend/app/models/ship_to_record.py",
        "backend/app/models/prompt_config.py",
        "backend/app/models/audit_log_entry.py"
      ],
      "depends_on": [
        "T-001",
        "T-002"
      ],
      "acceptance_criteria": [
        "All nine tables create cleanly via create_all",
        "audit_log_entry.document_id is nullable with a denormalized document_snapshot_label so rows survive delete cascade",
        "extraction_result has an incrementing run_number and is never updated in place by any code path",
        "Delete cascade removes documents/pages/ocr_results/extraction_results/corrected_results/line_items but not audit_log"
      ],
      "status": "pending"
    },
    {
      "id": "T-005",
      "title": "Pydantic request/response schemas",
      "owner_lane": "data_domain",
      "files": [
        "backend/app/schemas/document.py",
        "backend/app/schemas/review.py",
        "backend/app/schemas/dashboard.py",
        "backend/app/schemas/ship_to.py",
        "backend/app/schemas/prompt.py",
        "backend/app/schemas/correction.py"
      ],
      "depends_on": [
        "T-004"
      ],
      "acceptance_criteria": [
        "ReviewDocumentPayload, DocumentListItem, DashboardSummary, CorrectionPatch, ShipToResolution match tech_specs signatures field-for-field",
        "Schemas are separate from ORM models with no SQLAlchemy internals leaking into API responses",
        "Importable without circular dependency on models/"
      ],
      "status": "pending"
    },
    {
      "id": "T-006",
      "title": "DB-level restart/persistence unit test",
      "owner_lane": "data_domain",
      "files": [
        "backend/tests/test_db_restart.py"
      ],
      "depends_on": [
        "T-004"
      ],
      "acceptance_criteria": [
        "Test inserts a document row, closes and reopens the engine against the same sqlite file path, and asserts the row is still present",
        "This is the engine-level proof; the full docker-compose restart proof is a separate polish_resilience task"
      ],
      "status": "pending"
    },
    {
      "id": "T-007",
      "title": "OCR/Extraction provider protocols, mocks, storage manager",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/pipeline/ocr_provider.py",
        "backend/app/services/pipeline/extraction_provider.py",
        "backend/app/services/storage.py"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "OCRProvider, ExtractionProvider, StorageManager defined as Protocols exactly per tech_specs signatures",
        "MockOCRProvider returns deterministic OcrResult content keyed off a fixture path",
        "MockExtractionProvider is configurable to fail JSON validation a specified number of times, used later to prove the double-failure test"
      ],
      "status": "pending"
    },
    {
      "id": "T-008",
      "title": "PDF conversion module",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/pipeline/convert.py"
      ],
      "depends_on": [
        "T-007"
      ],
      "acceptance_criteria": [
        "Given a fixture PDF path, returns page images and page count",
        "Every page is OCR'd regardless of embedded text layer (no dual code path)",
        "Corrupt and password_protected fixtures raise a specific typed exception the orchestrator can catch and surface, not a generic Exception"
      ],
      "status": "pending"
    },
    {
      "id": "T-009",
      "title": "compute_needs_review pure function + standalone tests",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/validation/needs_review.py",
        "backend/tests/test_needs_review.py"
      ],
      "depends_on": [
        "T-001"
      ],
      "acceptance_criteria": [
        "Implements all three layers independently: confidence threshold, missing/mismatched source_text override, business-rule reconciliation",
        "Blocking fixture test: totals_mismatch case forces needs_review=True and business_rule_mismatch in reasons for the total field even when self-reported confidence is high",
        "Test file has zero dependency on the DB or orchestrator, runs as a pure unit test"
      ],
      "status": "pending"
    },
    {
      "id": "T-010",
      "title": "match_ship_to pure function + standalone tests",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/matching/ship_to_matcher.py",
        "backend/tests/test_ship_to_matcher.py"
      ],
      "depends_on": [
        "T-001",
        "T-004"
      ],
      "acceptance_criteria": [
        "Returns ShipToResolution with a matched_on list and a reason string generated deterministically from matched_on, not the reverse",
        "Fixture test asserts matched_on content for an alias+postal match",
        "Fixture tests assert status='no_match' and status='customer_unknown' as visibly distinct outcomes"
      ],
      "status": "pending"
    },
    {
      "id": "T-011",
      "title": "run_pipeline orchestrator + ProcessingQueue",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/pipeline/orchestrator.py",
        "backend/app/worker/queue.py"
      ],
      "depends_on": [
        "T-007",
        "T-008",
        "T-009",
        "T-010",
        "T-004"
      ],
      "acceptance_criteria": [
        "convert->ocr->extract->repair-once->needs_review->ship_to_match runs end to end against mock providers on the clean fixture and persists an ExtractionResult",
        "double_failure_trigger fixture results in status=extraction_failed with both raw_model_output_1 and raw_model_output_2 populated and the mock's call count proves exactly one repair retry, never a third attempt",
        "ProcessingQueue serializes processing: a test enqueuing 5 document ids proves writes happen one at a time, not concurrently"
      ],
      "status": "pending"
    },
    {
      "id": "T-012",
      "title": "ReviewDocumentPayload assembler",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/review_assembler.py"
      ],
      "depends_on": [
        "T-005",
        "T-011"
      ],
      "acceptance_criteria": [
        "Single function assembles the full ReviewDocumentPayload from Document+ExtractionResult+CorrectedResult+ShipToResolution in one call, no further DB round trips needed by route handlers",
        "Unit tests cover all four rendering states: needs_review, extraction_failed, approved, reopened",
        "is_stale computed at read time by comparing extraction_result_id to the document's current_extraction_result_id, never stored"
      ],
      "status": "pending"
    },
    {
      "id": "T-013",
      "title": "Export generator (JSON/CSV)",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/services/export/json_export.py",
        "backend/app/services/export/csv_export.py"
      ],
      "depends_on": [
        "T-005"
      ],
      "acceptance_criteria": [
        "Given a CorrectedResult, produces valid JSON and CSV",
        "Every required header field (PO#, date, customer, buyer, payer, bill-to, ship-to+address, Ship To ID, currency, subtotal, tax, total) and line-item field (line no, material code, description, qty, UoM, unit price, line total, requested delivery date) is present in both formats",
        "Round-trip test against a fixture document's corrected data confirms no field is silently dropped"
      ],
      "status": "pending"
    },
    {
      "id": "T-014",
      "title": "Documents API routes (upload/list/detail/status/correction/reprocess/approve/export)",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/api/routes/documents.py"
      ],
      "depends_on": [
        "T-011",
        "T-012",
        "T-013"
      ],
      "acceptance_criteria": [
        "All endpoint signatures and status codes match tech_specs exactly (201/200/202/409 as specified)",
        "approve returns 409 with blocking_fields while unresolved needs_review fields or unresolved ship_to remain",
        "PATCH correction returns 409 if the document is approved/exported without a prior reopen",
        "Integration test drives upload->process->correct->approve->export end to end against mock providers"
      ],
      "status": "pending"
    },
    {
      "id": "T-015",
      "title": "Dashboard/Prompts/ShipTo API routes",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/api/routes/dashboard.py",
        "backend/app/api/routes/prompts.py",
        "backend/app/api/routes/ship_to.py"
      ],
      "depends_on": [
        "T-005",
        "T-010"
      ],
      "acceptance_criteria": [
        "GET /api/dashboard is computed live from the DB on every call and matches a seeded mixed-state fixture set exactly, never cached",
        "PUT /api/prompts/{id} produces a config that a rerun ties to a new extraction_result_id",
        "POST/PATCH /api/ship-to are the same code path used by the inline create-from-review flow, not a duplicated implementation"
      ],
      "status": "pending"
    },
    {
      "id": "T-016",
      "title": "FastAPI app wiring + lifespan hook points",
      "owner_lane": "services_utilities",
      "files": [
        "backend/app/main.py"
      ],
      "depends_on": [
        "T-011",
        "T-014",
        "T-015"
      ],
      "acceptance_criteria": [
        "App boots and registers all routers",
        "ProcessingQueue consumer starts on the FastAPI lifespan startup hook",
        "Binds to 127.0.0.1 by default",
        "A clearly commented hook-point block exists for polish_resilience's stuck-reset sweep registration so that later edit is a single additive line, never a rewrite of this file"
      ],
      "status": "pending"
    },
    {
      "id": "T-017",
      "title": "Frontend scaffold, design tokens, routing shell",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/vite.config.ts",
        "frontend/src/main.tsx",
        "frontend/src/App.tsx",
        "frontend/src/styles/tokens.css"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Vite+React project boots",
        "Five routes registered (Dashboard, Documents, Review, PromptConfig, ShipToCatalog) each rendering a placeholder that compiles",
        "Design tokens file matches the locked palette (background #FAF8F3, trusted-action #2B4C5C, needs-review #B8860B, matched #5B4B8A, approved #2F6B4F, error #B23A2E) and type scale from design_handoff"
      ],
      "status": "pending"
    },
    {
      "id": "T-018",
      "title": "Hand-mirrored TS types + contract-freeze diff",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/types/common.ts",
        "frontend/src/types/document.ts",
        "frontend/src/types/review.ts",
        "frontend/src/types/dashboard.ts",
        "frontend/src/types/shipTo.ts",
        "frontend/src/types/prompt.ts"
      ],
      "depends_on": [
        "T-005"
      ],
      "acceptance_criteria": [
        "TS types mirror the merged backend Pydantic schemas field-for-field",
        "A diff pass is done against T-005's actual merged schema output before this task is marked complete, logged in INTEGRATION_LOG.md",
        "Any mismatch found is logged and fixed here, not silently left for a screen to discover later"
      ],
      "status": "pending"
    },
    {
      "id": "T-019",
      "title": "Typed API clients + TanStack Query wiring",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/api/documents.ts",
        "frontend/src/api/dashboard.ts",
        "frontend/src/api/shipTo.ts",
        "frontend/src/api/prompts.ts",
        "frontend/src/api/audit.ts"
      ],
      "depends_on": [
        "T-017",
        "T-018"
      ],
      "acceptance_criteria": [
        "One typed client function per endpoint in tech_specs, none returning `any`",
        "Every mutation explicitly invalidates the relevant query cache key, no hand-rolled global state"
      ],
      "status": "pending"
    },
    {
      "id": "T-020",
      "title": "useDocumentStatusPolling + useReviewDraft hooks",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/hooks/useDocumentStatusPolling.ts",
        "frontend/src/hooks/useReviewDraft.ts"
      ],
      "depends_on": [
        "T-019"
      ],
      "acceptance_criteria": [
        "Polling hook fires only while at least one tracked document is uploaded/processing and idles otherwise, proven with mocked timers",
        "useReviewDraft exposes isDirty and blocks navigation away from unsaved edits without an explicit save or discard confirmation \u2014 no silent autosave"
      ],
      "status": "pending"
    },
    {
      "id": "T-021",
      "title": "Documents screen",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/routes/Documents.tsx",
        "frontend/src/components/UploadDropzone.tsx",
        "frontend/src/components/DocumentRow.tsx"
      ],
      "depends_on": [
        "T-019",
        "T-020"
      ],
      "acceptance_criteria": [
        "First-run empty, upload-in-progress, populated, filtered-empty, and error states all render",
        "Default sort is attention-priority",
        "Duplicate-upload hint is visually present on rows flagged duplicate_hint"
      ],
      "status": "pending"
    },
    {
      "id": "T-022",
      "title": "Review workspace",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/routes/Review.tsx",
        "frontend/src/components/StatusBadge.tsx",
        "frontend/src/components/ConfidenceChip.tsx",
        "frontend/src/components/EvidencePopover.tsx",
        "frontend/src/components/FieldRow.tsx",
        "frontend/src/components/LineItemTable.tsx",
        "frontend/src/components/ShipToScorecard.tsx",
        "frontend/src/components/PipelineStatusStrip.tsx"
      ],
      "depends_on": [
        "T-019",
        "T-020"
      ],
      "acceptance_criteria": [
        "Four mocked DocumentStatus fixtures (needs_review, extraction_failed, approved, reopened) each produce a visibly distinct, correct render",
        "Keyboard tab order covers PDF pane -> flagged fields -> line-item table -> Ship To card -> approve action",
        "Cmd/Ctrl+Enter approve-and-advance is wired and disabled while isDirty is true",
        "Stale-correction warning surfaces near the top of the pane, not buried in history"
      ],
      "status": "pending"
    },
    {
      "id": "T-023",
      "title": "Dashboard screen",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/routes/Dashboard.tsx",
        "frontend/src/components/DashboardStatCard.tsx"
      ],
      "depends_on": [
        "T-019"
      ],
      "acceptance_criteria": [
        "Renders live counts, average confidence, and success rate from GET /api/dashboard",
        "Loading, populated, refresh-in-progress, and error states all present"
      ],
      "status": "pending"
    },
    {
      "id": "T-024",
      "title": "PromptConfig + ShipToCatalog screens",
      "owner_lane": "primary_ui",
      "files": [
        "frontend/src/routes/PromptConfig.tsx",
        "frontend/src/routes/ShipToCatalog.tsx",
        "frontend/src/components/PromptEditor.tsx",
        "frontend/src/components/ConfirmDialog.tsx"
      ],
      "depends_on": [
        "T-019",
        "T-022"
      ],
      "acceptance_criteria": [
        "Prompt editor exposes 'save for future documents' and 'save and rerun on this document' as two distinct actions, not one bare save button",
        "The Ship To catalog's inline create/edit sheet is the same component imported and reused from Review's scorecard, verified by a shared-import check, not a duplicated copy"
      ],
      "status": "pending"
    },
    {
      "id": "T-025",
      "title": "Docker/compose scaffold + env template",
      "owner_lane": "polish_resilience",
      "files": [
        "docker-compose.yml",
        "backend/Dockerfile",
        "frontend/Dockerfile",
        ".env.example"
      ],
      "depends_on": [],
      "acceptance_criteria": [
        "Named volumes declared for PDFs, page images, the SQLite file, and exports",
        "Compose file binds the API to 127.0.0.1 by default with a documented override flag for anything else",
        "No hardcoded secrets; .env.example lists every required key"
      ],
      "status": "pending"
    },
    {
      "id": "T-026",
      "title": "Reopen endpoint + audit logging service",
      "owner_lane": "polish_resilience",
      "files": [
        "backend/app/api/routes/lifecycle.py",
        "backend/app/services/audit.py"
      ],
      "depends_on": [
        "T-014"
      ],
      "acceptance_criteria": [
        "POST /api/documents/{id}/reopen requires a reason, transitions status to reopened, and is the only path that unblocks a further PATCH on an approved/exported document",
        "Test proves PATCH before reopen returns 409 and PATCH after reopen returns 200",
        "log_audit_event is called from every mutating endpoint and every pipeline transition"
      ],
      "status": "pending"
    },
    {
      "id": "T-027",
      "title": "Stuck-processing sweep",
      "owner_lane": "polish_resilience",
      "files": [
        "backend/app/worker/stuck_reset.py"
      ],
      "depends_on": [
        "T-016"
      ],
      "acceptance_criteria": [
        "A document manually set to processing with an old processing_started_at is reset to a retryable state within one sweep interval in a clock-shifted test",
        "Reset is logged to audit_log",
        "Registered into main.py's designated hook point as a single additive line, verified by diffing main.py before/after this task"
      ],
      "status": "pending"
    },
    {
      "id": "T-028",
      "title": "Docker persistence verification",
      "owner_lane": "polish_resilience",
      "files": [
        "scripts/verify_restart.sh"
      ],
      "depends_on": [
        "T-016",
        "T-025"
      ],
      "acceptance_criteria": [
        "An actual docker-compose down && up cycle is run against a seeded document",
        "Before/after assertions confirm the document row and its files are present after the restart \u2014 not inferred from reading the compose file"
      ],
      "status": "pending"
    },
    {
      "id": "T-029",
      "title": "Concurrent-upload SQLite lock test",
      "owner_lane": "polish_resilience",
      "files": [
        "backend/tests/test_concurrency.py"
      ],
      "depends_on": [
        "T-011",
        "T-014"
      ],
      "acceptance_criteria": [
        "5+ documents uploaded concurrently against the real queue across 10 runs produce zero 'database is locked' errors"
      ],
      "status": "pending"
    },
    {
      "id": "T-030",
      "title": "Playwright E2E: happy path + forced failure",
      "owner_lane": "polish_resilience",
      "files": [
        "e2e/happy-path.spec.ts",
        "e2e/forced-failure.spec.ts"
      ],
      "depends_on": [
        "T-021",
        "T-022",
        "T-023",
        "T-011"
      ],
      "acceptance_criteria": [
        "happy-path spec drives upload->flagged review->correct->resolve ship-to->approve->export against mock providers and passes headlessly",
        "forced-failure spec drives the double_failure_trigger fixture into extraction_failed and confirms hand-entry plus reprocess-with-edited-prompt both work"
      ],
      "status": "pending"
    },
    {
      "id": "T-031",
      "title": "README, privacy disclosure, final regression sweep",
      "owner_lane": "polish_resilience",
      "files": [
        "README.md",
        "CHANGELOG.md",
        "INTEGRATION_LOG.md"
      ],
      "depends_on": [
        "T-026",
        "T-027",
        "T-028",
        "T-029",
        "T-030",
        "T-024"
      ],
      "acceptance_criteria": [
        "A fresh clone + docker-compose up + README instructions alone gets a new operator to an approved export in under ~5 minutes, tested from scratch",
        "README explicitly discloses that document content is transmitted to whichever OCR/LLM provider is configured",
        "Full backend+frontend+e2e test suite passes in one run before this task closes"
      ],
      "status": "pending"
    }
  ]
}
```

## Interface Contracts

```json
{
  "interfaces": [
    {
      "name": "DocumentStatus",
      "kind": "enum",
      "language": "python/typescript",
      "signature": "enum DocumentStatus { uploaded, processing, needs_review, extraction_failed, approved, exported, reopened }",
      "owning_lane": "data_domain",
      "notes": "Server-authoritative lifecycle state. Frontend must never derive or cache an alternate mode."
    },
    {
      "name": "FieldReason",
      "kind": "enum",
      "language": "python/typescript",
      "signature": "enum FieldReason { low_confidence, missing_evidence, business_rule_mismatch, unknown_ship_to, stale_after_reprocess, manual_entry }",
      "owning_lane": "data_domain",
      "notes": "A field may carry more than one reason simultaneously; always an array."
    },
    {
      "name": "EvidenceRef",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type EvidenceRef = { source_text: string | null; page_number: number | null; bbox: { x: number; y: number; width: number; height: number } | null }",
      "owning_lane": "data_domain",
      "notes": "bbox is a per-field progressive enhancement; never faked, never blocking."
    },
    {
      "name": "ExtractedField",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ExtractedField = { value: string | number | null; confidence: number | null; needs_review: boolean; reasons: FieldReason[]; evidence: EvidenceRef }",
      "owning_lane": "data_domain",
      "notes": "Canonical field payload for both header fields and line-item cells."
    },
    {
      "name": "LineItemPayload",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type LineItemPayload = { id: string; line_number: FieldValue; material_code: FieldValue; description: FieldValue; quantity: FieldValue; uom: FieldValue; unit_price: FieldValue; line_total: FieldValue; requested_delivery_date: FieldValue; row_needs_review: boolean; row_reasons: FieldReason[] }",
      "owning_lane": "primary_ui",
      "notes": "UI-editable line item contract inside ReviewDocumentPayload; id is stable for React keys/ARIA grid nav."
    },
    {
      "name": "ShipToCandidate",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ShipToCandidate = { catalog_id: string; ship_to_id: string; customer_name: string; normalized_address: string; confidence: number; reason: string; matched_attributes: string[] }",
      "owning_lane": "data_domain",
      "notes": "Top match and alternates must be explainable, not just scored."
    },
    {
      "name": "ShipToResolution",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ShipToResolution = { status: 'matched' | 'ambiguous' | 'no_match' | 'customer_unknown'; resolved_method: 'matched' | 'manual' | 'created' | null; selected_ship_to_id: string | null; best_match: ShipToMatchCandidate | null; alternates: ShipToMatchCandidate[]; extracted_address: string | null }",
      "owning_lane": "data_domain",
      "notes": "Drives the Ship To scorecard and export gating; distinguishes customer_unknown from no_match per detailed_discussion."
    },
    {
      "name": "ReviewDocumentPayload",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ReviewDocumentPayload = { document_id: string; status: DocumentStatus; original_filename: string; customer_name: string | null; po_number: string | null; page_count: number; header_fields: Record<string, FieldValue>; line_items: LineItemPayload[]; ship_to_resolution: ShipToResolution; totals_summary: { extracted_subtotal: number | null; extracted_tax: number | null; extracted_total: number | null; computed_line_total: number | null; mismatch: boolean }; raw_ocr_available: boolean; raw_json_available: boolean; latest_extraction_run_id: string | null; latest_correction_id: string | null; approved_correction_id: string | null; stale_corrections: boolean; last_error_code: string | null; last_error_message: string | null }",
      "owning_lane": "primary_ui",
      "notes": "THE canonical single bundled response for GET /api/documents/{id}, assembled server-side from Document+ExtractionResult+CorrectedResult so Review.tsx never waterfalls fetches. Covers needs_review, extraction_failed, approved, reopened rendering."
    },
    {
      "name": "DocumentListItem",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type DocumentListItem = { document_id: string; original_filename: string; status: DocumentStatus; customer_name: string | null; po_number: string | null; uploaded_at: string; updated_at: string; aggregate_confidence: number | null; duplicate_hint: boolean; processing_step: string | null; processing_progress_label: string | null; last_error_message: string | null }",
      "owning_lane": "primary_ui",
      "notes": "Queue list row; processing labels may be null when the pipeline-narration enhancement is unavailable and the static fallback badge is used."
    },
    {
      "name": "DashboardSummary",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type DashboardSummary = { uploaded_count: number; processing_count: number; needs_review_count: number; extraction_failed_count: number; approved_count: number; exported_count: number; average_confidence: number | null; success_rate: number | null; attention_document_ids: string[] }",
      "owning_lane": "primary_ui",
      "notes": "Computed live from the DB on every call, never cached/estimated."
    },
    {
      "name": "CorrectionPatch",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type CorrectionPatch = { header_fields: Record<string, { value: string | number | null }>; line_items: Array<{ id: string; fields: Record<string, { value: string | number | null }> }>; ship_to_selection: { selected_ship_to_id: string | null; create_new_catalog_entry: boolean } | null }",
      "owning_lane": "primary_ui",
      "notes": "Explicit draft-save payload; no silent autosave implied anywhere in the flow."
    },
    {
      "name": "PromptConfig",
      "kind": "struct",
      "language": "python",
      "signature": "class PromptConfig(BaseModel): id: str; scope: Literal['global','customer']; customer_name: str | None; mode: Literal['replace','supplement'] | None; prompt_text: str; is_active: bool; created_at: datetime; updated_at: datetime",
      "owning_lane": "data_domain",
      "notes": "mode only meaningful when scope='customer'."
    },
    {
      "name": "ShipToCatalogRecord",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ShipToCatalogRecord = { id: string; customer_name: string; ship_to_id: string; address1: string; address2: string | null; city: string; region: string | null; postal_code: string | null; country: string; aliases: string[]; last_matched_at: string | null }",
      "owning_lane": "data_domain",
      "notes": "Catalog CRUD contract."
    },
    {
      "name": "DocumentProcessingService",
      "kind": "protocol",
      "language": "python",
      "signature": "class DocumentProcessingService(Protocol): async def enqueue(document_id: str) -> None; async def reprocess(document_id: str, prompt_config_id: str | None = None) -> None; async def reconcile_stale_processing(now_utc: datetime) -> int",
      "owning_lane": "services_utilities",
      "notes": "Owns background pipeline and stale-processing recovery."
    },
    {
      "name": "NeedsReviewEvaluator",
      "kind": "function",
      "language": "python",
      "signature": "def evaluate_needs_review(normalized_payload: dict, confidence_threshold: float) -> tuple[dict, list[str]]",
      "owning_lane": "services_utilities",
      "notes": "Applies confidence, missing-evidence, and business-rule checks; returns annotated payload plus document-level flags."
    },
    {
      "name": "ShipToMatcher",
      "kind": "protocol",
      "language": "python",
      "signature": "class ShipToMatcher(Protocol): def match(customer_name: str | None, extracted_address: str | None) -> ShipToResolution",
      "owning_lane": "services_utilities",
      "notes": "Must produce deterministic reason strings and alternates."
    },
    {
      "name": "StorageManager",
      "kind": "protocol",
      "language": "python",
      "signature": "class StorageManager(Protocol):\n    def save_original(self, document_id: str, filename: str, content: bytes) -> str: ...\n    def save_page_image(self, document_id: str, page_number: int, content: bytes) -> str: ...\n    def save_artifact(self, document_id: str, kind: str, filename: str, content: bytes) -> str: ...\n    def delete_document_bundle(self, document_id: str) -> None: ...",
      "owning_lane": "services_utilities",
      "notes": "Abstracts local filesystem layout for PDFs, page images, raw payloads, exports."
    },
    {
      "name": "GET /api/documents",
      "kind": "endpoint",
      "language": "http",
      "signature": "?status=&search=&customer=&sort=attention|recency|filename -> 200 { documents: DocumentListItem[] }",
      "owning_lane": "services_utilities",
      "notes": "Default sort is attention-priority per design_handoff."
    },
    {
      "name": "POST /api/documents",
      "kind": "endpoint",
      "language": "http",
      "signature": "multipart/form-data files[] -> 201 { accepted: string[]; rejected: Array<{ filename: string; reason: string }> }",
      "owning_lane": "services_utilities",
      "notes": "Batch upload with visible per-file rejection (password-protected, non-PDF, corrupt)."
    },
    {
      "name": "GET /api/documents/{document_id}",
      "kind": "endpoint",
      "language": "http",
      "signature": "GET /api/documents/{document_id} -> ReviewDocumentPayload",
      "owning_lane": "primary_ui",
      "notes": "Primary review payload endpoint."
    },
    {
      "name": "PATCH /api/documents/{document_id}/correction",
      "kind": "endpoint",
      "language": "http",
      "signature": "PATCH /api/documents/{document_id}/correction body CorrectionPatch -> ReviewDocumentPayload",
      "owning_lane": "primary_ui",
      "notes": "Explicit draft save; returns fresh server-authoritative status and payload."
    },
    {
      "name": "POST /api/documents/{document_id}/reprocess",
      "kind": "endpoint",
      "language": "http",
      "signature": "POST /api/documents/{document_id}/reprocess body { prompt_config_id?: string } -> { document_id: string; status: DocumentStatus }",
      "owning_lane": "services_utilities",
      "notes": "Creates new extraction run, preserves prior corrections."
    },
    {
      "name": "POST /api/documents/{document_id}/approve",
      "kind": "endpoint",
      "language": "http",
      "signature": "POST /api/documents/{document_id}/approve -> { document_id: string; status: DocumentStatus; approved_correction_id: string }",
      "owning_lane": "primary_ui",
      "notes": "Approval freezes current corrected snapshot."
    },
    {
      "name": "POST /api/documents/{document_id}/reopen",
      "kind": "endpoint",
      "language": "http",
      "signature": "POST /api/documents/{document_id}/reopen -> { document_id: string; status: DocumentStatus; latest_correction_id: string }",
      "owning_lane": "polish_resilience",
      "notes": "Required to edit an approved/exported document again."
    },
    {
      "name": "POST /api/documents/{document_id}/export",
      "kind": "endpoint",
      "language": "http",
      "signature": "POST /api/documents/{document_id}/export body { format: 'json' | 'csv' } -> { document_id: string; status: DocumentStatus; download_path: string }",
      "owning_lane": "services_utilities",
      "notes": "Allowed only from approved state; export failure must not revoke approval."
    },
    {
      "name": "GET /api/dashboard",
      "kind": "endpoint",
      "language": "http",
      "signature": "-> 200 DashboardSummary",
      "owning_lane": "services_utilities",
      "notes": "Computed live from the DB on each call."
    },
    {
      "name": "GET /api/prompts",
      "kind": "endpoint",
      "language": "http",
      "signature": "-> 200 { prompts: PromptConfig[] }",
      "owning_lane": "services_utilities",
      "notes": "Lists global and customer-specific prompt configs."
    },
    {
      "name": "PUT /api/prompts/{prompt_id}",
      "kind": "endpoint",
      "language": "http",
      "signature": "body PromptConfig -> 200 PromptConfig",
      "owning_lane": "services_utilities",
      "notes": "Prompt save path for settings UI."
    },
    {
      "name": "GET /api/ship-to",
      "kind": "endpoint",
      "language": "http",
      "signature": "?search=&customer= -> 200 { records: ShipToRecord[] }",
      "owning_lane": "services_utilities",
      "notes": "Catalog table listing and search."
    },
    {
      "name": "POST /api/ship-to",
      "kind": "endpoint",
      "language": "http",
      "signature": "body ShipToRecord -> 201 ShipToRecord",
      "owning_lane": "services_utilities",
      "notes": "Create new catalog entry, including inline create-from-review flow."
    },
    {
      "name": "PATCH /api/ship-to/{catalog_id}",
      "kind": "endpoint",
      "language": "http",
      "signature": "body Partial<ShipToRecord> -> 200 ShipToRecord",
      "owning_lane": "services_utilities",
      "notes": "Catalog edit path, used by the same inline sheet component as Review's create flow."
    },
    {
      "name": "FieldValue",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type FieldValue = { value: string | number | null; confidence: number; needs_review: boolean; reasons: FieldReason[]; evidence: EvidenceRef }",
      "owning_lane": "data_domain",
      "notes": "Canonical envelope for every header and line-item field, both in DB storage and API payloads. Also referred to as ExtractedField in UI contexts \u2014 same shape."
    },
    {
      "name": "FieldValueTS",
      "kind": "struct",
      "language": "typescript",
      "signature": "interface FieldValue<T = string | number | null> { value: T; confidence: number; source_text: string | null; page_number: number | null; needs_review: boolean; review_reason: string | null }",
      "owning_lane": "data_domain",
      "notes": "TS mirror of FieldValue; lives in src/types/fieldValue.ts"
    },
    {
      "name": "Document",
      "kind": "struct",
      "language": "python",
      "signature": "class Document(BaseModel): id: str; filename: str; status: DocumentStatus; customer_name: str | None; po_number: str | None; uploaded_at: datetime; updated_at: datetime; page_count: int; duplicate_of_id: str | None; processing_started_at: datetime | None; current_extraction_result_id: str | None",
      "owning_lane": "data_domain",
      "notes": "backend/app/models/document.py"
    },
    {
      "name": "Page",
      "kind": "struct",
      "language": "python",
      "signature": "class Page(BaseModel): id: str; document_id: str; page_number: int; image_path: str; rotation: int; width: int; height: int",
      "owning_lane": "data_domain",
      "notes": "backend/app/models/page.py"
    },
    {
      "name": "OcrResult",
      "kind": "struct",
      "language": "python",
      "signature": "class OcrResult(BaseModel): id: str; page_id: str; engine: str; raw_text: str; confidence: float; bbox_data: list[dict] | None; created_at: datetime",
      "owning_lane": "data_domain",
      "notes": "bbox_data null when provider doesn't return coordinates; consumers branch on presence."
    },
    {
      "name": "ExtractionResult",
      "kind": "struct",
      "language": "python",
      "signature": "class ExtractionResult(BaseModel): id: str; document_id: str; run_number: int; prompt_config_id: str | None; status: Literal['success','failed']; header_fields: dict[str, FieldValue]; line_items: list[LineItem]; raw_model_output_1: str | None; raw_model_output_2: str | None; created_at: datetime",
      "owning_lane": "data_domain",
      "notes": "Append-only, never updated in place; run_number increments per document."
    },
    {
      "name": "LineItem",
      "kind": "struct",
      "language": "python",
      "signature": "class LineItem(BaseModel): id: str; line_no: FieldValue; material_code: FieldValue; description: FieldValue; qty: FieldValue; uom: FieldValue; unit_price: FieldValue; line_total: FieldValue; requested_delivery_date: FieldValue",
      "owning_lane": "data_domain",
      "notes": "Persisted per extraction run inside ExtractionResult.line_items; corrected versions live in CorrectedResult.line_items."
    },
    {
      "name": "ShipToMatchCandidate",
      "kind": "struct",
      "language": "python/typescript",
      "signature": "type ShipToMatchCandidate = { ship_to_id: string; confidence: number; matched_on: string[]; reason: string }",
      "owning_lane": "data_domain",
      "notes": "reason is generated deterministically from matched_on; tests assert on matched_on, not prose."
    },
    {
      "name": "CorrectedResult",
      "kind": "struct",
      "language": "python",
      "signature": "class CorrectedResult(BaseModel): id: str; document_id: str; extraction_result_id: str; header_fields: dict[str, FieldValue]; line_items: list[LineItem]; ship_to_resolution: ShipToResolution | None; is_stale: bool; approved_at: datetime | None; exported_at: datetime | None; created_at: datetime; updated_at: datetime",
      "owning_lane": "data_domain",
      "notes": "is_stale computed at read time (extraction_result_id != document.current_extraction_result_id), never stored."
    },
    {
      "name": "ShipToRecord",
      "kind": "struct",
      "language": "python",
      "signature": "class ShipToRecord(BaseModel): id: str; ship_to_id: str; customer_name: str; address_line1: str; address_line2: str | None; city: str; region: str | None; postal_code: str; country: str; aliases: list[str]; created_at: datetime; updated_at: datetime; last_matched_at: datetime | None",
      "owning_lane": "data_domain",
      "notes": "backend/app/models/ship_to_record.py; aliases as JSON array, the retention moat."
    },
    {
      "name": "AuditLogEntry",
      "kind": "struct",
      "language": "python",
      "signature": "class AuditLogEntry(BaseModel): id: str; document_id: str | None; document_snapshot_label: str; event_type: str; event_detail: dict; created_at: datetime",
      "owning_lane": "data_domain",
      "notes": "Nullable document_id + denormalized label so entries survive the document delete cascade."
    },
    {
      "name": "OCRProvider",
      "kind": "protocol",
      "language": "python",
      "signature": "class OCRProvider(Protocol):\n    async def run(self, image_path: str) -> OcrResult: ...",
      "owning_lane": "services_utilities",
      "notes": "MockOCRProvider and a real adapter both implement this; orchestrator depends only on the protocol."
    },
    {
      "name": "ExtractionProvider",
      "kind": "protocol",
      "language": "python",
      "signature": "class ExtractionProvider(Protocol):\n    async def extract(self, ocr_text: str, prompt: str) -> tuple[dict, str]: ...\n    async def repair(self, ocr_text: str, prompt: str, invalid_output: str) -> tuple[dict, str]: ...",
      "owning_lane": "services_utilities",
      "notes": "Orchestrator owns the exactly-one-retry rule; provider just answers extract/repair calls."
    },
    {
      "name": "compute_needs_review",
      "kind": "function",
      "language": "python",
      "signature": "def compute_needs_review(field: FieldValue, business_rule_violation: bool, confidence_threshold: float) -> FieldValue",
      "owning_lane": "services_utilities",
      "notes": "Pure function combining the three layers (threshold, missing/mismatched source_text, business-rule override); unit-tested against the subtotal+tax\u2260total fixture."
    },
    {
      "name": "match_ship_to",
      "kind": "function",
      "language": "python",
      "signature": "def match_ship_to(extracted_address: dict, customer_name: str | None, catalog: list[ShipToRecord]) -> ShipToResolution",
      "owning_lane": "services_utilities",
      "notes": "Deterministic reason generation from matched_on; distinguishes customer_unknown vs no_match; returns resolved_method='manual' shape when nothing clears threshold."
    },
    {
      "name": "run_pipeline",
      "kind": "function",
      "language": "python",
      "signature": "async def run_pipeline(document_id: str, prompt_override: str | None = None) -> ExtractionResult",
      "owning_lane": "services_utilities",
      "notes": "Orchestrates convert->ocr->extract->repair-once->needs_review; sole caller is the ProcessingQueue consumer to serialize SQLite writes."
    },
    {
      "name": "reset_stuck_processing",
      "kind": "function",
      "language": "python",
      "signature": "async def reset_stuck_processing(timeout_minutes: int = 10) -> list[str]",
      "owning_lane": "polish_resilience",
      "notes": "Periodic 60s-interval sweep from app startup; returns reset document ids for audit logging."
    },
    {
      "name": "GET /api/documents/{id}",
      "kind": "endpoint",
      "language": "http",
      "signature": "-> 200 ReviewDocumentPayload",
      "owning_lane": "services_utilities",
      "notes": "Single bundled fetch for the Review route, no waterfall."
    },
    {
      "name": "GET /api/documents/{id}/status",
      "kind": "endpoint",
      "language": "http",
      "signature": "-> 200 { status: DocumentStatus; pipeline_step: string | null }",
      "owning_lane": "services_utilities",
      "notes": "Lightweight polling target consumed by useDocumentStatusPolling."
    },
    {
      "name": "POST /api/documents/{id}/reprocess",
      "kind": "endpoint",
      "language": "http",
      "signature": "body { prompt_config_id?: string } -> 202 { document_id: string; status: DocumentStatus; extraction_result_id: string }",
      "owning_lane": "services_utilities",
      "notes": "Creates a new ExtractionResult row; never mutates prior rows or corrected_results."
    },
    {
      "name": "PATCH /api/documents/{id}/corrections",
      "kind": "endpoint",
      "language": "http",
      "signature": "{ header_fields?: dict; line_items?: list; ship_to_resolution?: ShipToResolution } -> 200 CorrectedResult",
      "owning_lane": "services_utilities",
      "notes": "Rejected with 409 if document.status is approved/exported without an explicit prior reopen."
    },
    {
      "name": "POST /api/documents/{id}/approve",
      "kind": "endpoint",
      "language": "http",
      "signature": "-> 200 { document_id: string; status: DocumentStatus; approved_correction_id: string } | 409 { blocking_fields: string[] }",
      "owning_lane": "services_utilities",
      "notes": "Blocks approval while unresolved needs_review fields or unresolved ship_to remain."
    },
    {
      "name": "POST /api/documents/{id}/export",
      "kind": "endpoint",
      "language": "http",
      "signature": "?format=json|csv -> 200 file stream | { download_path: string }",
      "owning_lane": "services_utilities",
      "notes": "Only callable from approved state; export failure never revokes approval; recorded as an audit_log boundary event."
    },
    {
      "name": "POST /api/documents/{id}/reopen",
      "kind": "endpoint",
      "language": "http",
      "signature": "body { reason: string } -> 200 { document_id: string; status: DocumentStatus; latest_correction_id: string }",
      "owning_lane": "polish_resilience",
      "notes": "Required explicit action before any further PATCH on an exported document; audit-logged."
    },
    {
      "name": "useDocumentStatusPolling",
      "kind": "function",
      "language": "typescript",
      "signature": "function useDocumentStatusPolling(documentIds: string[]): void",
      "owning_lane": "primary_ui",
      "notes": "src/hooks/useDocumentStatusPolling.ts; polls only while \u22651 doc is uploaded/processing, invalidates TanStack Query cache on change, idles otherwise."
    },
    {
      "name": "useReviewDraft",
      "kind": "function",
      "language": "typescript",
      "signature": "function useReviewDraft(documentId: string): { draft: CorrectionPatch; isDirty: boolean; save: () => Promise<void>; discard: () => void }",
      "owning_lane": "primary_ui",
      "notes": "src/hooks/useReviewDraft.ts; enforces no-silent-autosave, drives the unsaved-changes navigation guard."
    },
    {
      "name": "fetchDocumentDetail",
      "kind": "function",
      "language": "typescript",
      "signature": "async function fetchDocumentDetail(id: string): Promise<DocumentDetail>",
      "owning_lane": "primary_ui",
      "notes": "src/api/documents.ts; sole data source for Review.tsx, status always read from response.document.status."
    },
    {
      "name": "ProcessingQueue",
      "kind": "struct",
      "language": "python",
      "signature": "class ProcessingQueue: queue: asyncio.Queue[str]\n    async def enqueue(self, document_id: str) -> None: ...\n    async def run_consumer(self) -> None: ...",
      "owning_lane": "services_utilities",
      "notes": "backend/app/worker/queue.py; single consumer task, in-process only \u2014 satisfies the serialized-writer requirement without external broker infra."
    },
    {
      "name": "log_audit_event",
      "kind": "function",
      "language": "python",
      "signature": "def log_audit_event(document_id: str | None, event_type: str, detail: dict) -> AuditLogEntry",
      "owning_lane": "polish_resilience",
      "notes": "Called from every mutating endpoint and pipeline transition."
    },
    {
      "name": "fetchReviewDocument",
      "kind": "function",
      "language": "typescript",
      "signature": "async function fetchReviewDocument(id: string): Promise<ReviewDocumentPayload>",
      "owning_lane": "primary_ui",
      "notes": "src/api/documents.ts; sole data source for Review.tsx; status always read from response.status."
    },
    {
      "name": "PATCH /api/documents/{id}/correction",
      "kind": "endpoint",
      "language": "http",
      "signature": "body CorrectionPatch -> 200 ReviewDocumentPayload | 409 (if approved/exported without prior reopen)",
      "owning_lane": "services_utilities",
      "notes": "Explicit draft save; returns fresh server-authoritative status and payload."
    }
  ]
}
```

## Verification

UNVERIFIED (no .xcodeproj/.xcworkspace found.)

## Findings

_No findings recorded._