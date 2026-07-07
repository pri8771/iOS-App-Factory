# fastlane-po — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Review

CONSENSUS: YES

Both Codex and Claude converge on the same shape of answer even though they came at it from different angles (QA/build-risk vs. product/trust), so I'm calling it: this is a legitimate, substantially-complete web app that has never actually been executed in this environment, and the final review needs to say both of those things clearly rather than pick one.

## Final Output

**What was built:** A full FastAPI + React/Vite + SQLite PO-automation web app matching the spec: upload → PDF-to-image/text → OCR → LLM extraction (value/confidence/source_text/page_number/needs_review per field, retry-with-repair on invalid JSON) → side-by-side review UI with editable fields, raw OCR/JSON tabs → Ship-To fuzzy matching against a catalog → approve → JSON/CSV export. Backend has upload, OCR, extraction, validation, matching, correction/audit, export modules with the full table set (documents, pages, ocr_results, extraction_results, corrected_results, line_items, ship_to_catalog, prompt_configs, audit_log). Docker + docker-compose wire backend and frontend together with a persisted SQLite volume and `.env.example` for keys. This round's integration work fixed a real cross-lane bug: auto-approved documents (all fields clear) now write a distinct `AUTO_APPROVED` audit entry instead of silently skipping the trail, and the review UI shows a read-only "Approved" pill instead of a re-clickable button once that happens. `Settings.tsx` was also fixed to go through the shared API client instead of a same-origin fetch that would always misreport backend health once `VITE_API_BASE_URL` differs from the frontend origin.

**Verification status:** UNVERIFIED, and that label needs to be read correctly — `xcodebuild` failed to find a `.xcodeproj` because this app was correctly, deliberately built as a web app (decided twice now, in iterate_scope and build_coordination). That is a tooling-target mismatch, not a build defect; do not let it trigger another attempt to bolt on an Xcode/WKWebView shell. The real gap is different and more important: nobody in this entire pipeline has executed `docker-compose build`, `npm install`, `pip install`, or even bare `python3` in this environment — every "this is wired correctly" claim (routes matching the API client, Pydantic schemas matching the fake extractor output field-for-field, volume paths agreeing across `config.py`/`Dockerfile`/`docker-compose.yml`) is a static read-through, not a runtime-verified fact. That's good evidence, not proof. The concrete next action for whoever picks this up: run `docker-compose build && docker-compose up`, hit `GET /api/health`, and walk one full happy path (upload → OCR → extract → review → approve → export) plus one failure path (bad PDF / OCR failure) before calling this launch-ready.

**Prompt coverage:** The MVP success criterion — upload → see OCR → extract → review/edit low-confidence → match or pick Ship To → approve → export JSON/CSV — appears fully wired end to end, including the audit-trail fix. Dashboard, confidence highlighting, and the 3-state field visuals are built. Two admin-facing pieces of the spec are visually complete but not functionally real: Prompt Config's "Save & re-run" has no backend endpoint (UI-only, currently just alerts), and Ship-To Catalog create/edit doesn't persist (search works against the real endpoint, save writes to local component state only and silently no-ops).

**Known limitations:**
- Prompt Config save/re-run and Ship-To Catalog create/edit are cosmetically finished but functionally hollow — a user who uses either will believe they saved something when nothing persisted. Treat both as launch blockers for those specific screens, not the core app.
- `describe_prompt_diff()` exists and is unit-tested in `prompt_service.py` but has no route exposing it and isn't in `interfaces.json`, so the promised global-vs-per-customer diff view isn't actually visible anywhere yet.
- Real OCR mode (`FASTLANE_USE_REAL_OCR=true`) is documented as togglable but will break in the container because `tesseract-ocr` was never added to the backend Dockerfile's apt packages. The README should say "not implemented yet," not imply it's a working switch.
- Zero runtime execution has happened anywhere in this pipeline (sandbox blocked it every time) — all correctness claims are static-analysis-level confidence, not tested confidence.

**Top follow-ups (in priority order):**
1. Someone with real shell/Docker access runs `docker-compose build && docker-compose up` and exercises the golden path + one failure path — this is the single highest-value action, since it's the one thing that's never actually happened.
2. Either wire real Prompt Config save/re-run and Ship-To Catalog create/edit endpoints, or visibly disable/label those actions as not-yet-functional so the UI stops implying persistence that doesn't exist.
3. Add `tesseract-ocr` to `backend/Dockerfile` if real OCR is meant to ship, or clearly mark that env var as unsupported in the README.
4. Expose `describe_prompt_diff()` via a route and contract entry if the diff view is meant to ship in this MVP; otherwise drop the "diff pending" placeholder from `PromptConfig.tsx` so it doesn't over-promise.

VERIFICATION: UNVERIFIED
## Build Verification

UNVERIFIED (no .xcodeproj/.xcworkspace found.)
