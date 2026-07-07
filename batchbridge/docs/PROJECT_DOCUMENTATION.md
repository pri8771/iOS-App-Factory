# batchbridge — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

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

## Build the change

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

## Review

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
