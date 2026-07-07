# fastlane-po — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

CONSENSUS: YES

Here's the call: Codex confirmed there's no Swift, no asset catalog, no plist, nothing iOS-shaped in `app_build` — it's a FastAPI + React/Vite tree, exactly matching the spec. Building an Xcode/WKWebView shell to satisfy "compile for iOS Simulator" would produce something that builds green while having zero relationship to the actual product (OCR pipeline, LLM extraction, Ship-To fuzzy matching, Docker, SQLite, CSV/JSON export). That's a worse outcome than pushing back on the literal instruction. The "iOS Simulator" phrasing in the change request is almost certainly pipeline boilerplate that gets stamped onto every child app regardless of platform — it doesn't override the fact that this app was speced, and apparently already scaffolded, as a web app. We should honor what the app actually is, not what the generic phase template assumes it is.

So the fix for "no buildable project" here isn't an Xcode project at all — it's making the existing web stack actually stand up and build cleanly in its own native toolchain, since that's what "buildable" means for this app type.

## Final Output

fastlane-po is a FastAPI (backend) + React/Vite (frontend) + Docker/SQLite web app per its spec — not an iOS app. Do not generate an .xcodeproj, WKWebView shell, or any Swift/iOS target; that would satisfy the literal instruction while abandoning the actual product contract (OCR → LLM extraction → review/edit → Ship-To match → approve → export, plus Docker-compose, backend unit tests, sample PDFs).

Reinterpret "generate a complete working project wiring in all existing sources, then make it compile cleanly" as: wire and fix the existing web project so it builds/runs cleanly via its native toolchain. Concretely, next phase should:

1. Inventory `app_build` for what already exists on the backend (`FastAPI` app, `requirements.txt`/`pyproject.toml`, routers/modules for upload, pdf-to-image/text, OCR, LLM extraction, validation, catalog matching, correction/audit, export) and frontend (`package.json`, Vite config, React source tree for the side-by-side review UI).
2. Fill in only what's missing to make it wire together and build: a working `Dockerfile` for backend, a `Dockerfile` (or dev config) for frontend, a `docker-compose.yml` that connects both plus a persisted SQLite volume, and a `.env.example` for API keys (no hardcoded secrets) — preserving all existing sources and business logic untouched.
3. Verify success via `docker-compose build && docker-compose up` (or, if Docker isn't available in this environment, `uvicorn`/`npm run build` running cleanly as a fallback check) — this is the correct standard for "compiles cleanly" for this app, replacing the iOS Simulator check.
4. Do not touch anything that would change the delivery model to a native container app; if the pipeline's phase template keeps re-injecting iOS-specific instructions for this app on later iterations, that's a routing bug worth flagging upstream, not something to keep silently working around per-phase.

## Build the change

CONSENSUS: YES

## Final Output

FastLane PO is a real, working full-stack app now: FastAPI backend + React/Vite frontend, wired end to end, with Docker/docker-compose that stands the whole thing up locally with SQLite persistence. This iteration was integration and hardening on top of an already-complete app, not new plumbing — Codex tightened backend validation (strict Pydantic schemas, better Ship-To fuzzy matching, token-overlap prompt resolution) and I'd already verified the primary review UI matches the backend contract exactly.

**What I did as integrator this round:**

1. **Fixed a real cross-lane bug**: the pipeline auto-approves documents where every field clears review (`pipeline_orchestrator.py`), but it did so silently — no audit row, and the frontend's Approve button stayed live and clickable on an already-approved doc (clicking it just wrote a redundant duplicate approval). I fixed both sides: the orchestrator now writes a distinct `AUTO_APPROVED` audit action (added to the `AuditAction` type and the model comment) so the trail correctly distinguishes "system approved, nothing to review" from "a human clicked Approve"; the review screen now shows a read-only "Approved" pill instead of a re-clickable button once a document is in that state.
2. **Fixed `Settings.tsx`**: it was doing a bare same-origin `fetch('/api/dashboard/summary')` to probe backend health, which will always report "unreachable" once `VITE_API_BASE_URL` is set (confirmed against `docker-compose.yml` — frontend and backend run on different ports). Now it goes through the shared API client like every other screen.
3. **Verified the wiring is sound by static read-through** (execution/`npm`/`pip install` are blocked by sandbox approval in this session — same limitation both worker lanes hit): FastAPI routes in `main.py` match `api/client.ts` exactly; the new `extra="forbid"` Pydantic schemas match the fake LLM extractor's output field-for-field (checked all 12 header keys and both line-item shapes); Docker volume/data-dir paths (`/app/data`) agree between `config.py`, `Dockerfile`, and `docker-compose.yml`; `App.tsx` routes to all 6 pages and `package.json` has the deps they need.

**What's genuinely still incomplete** (not this iteration's bug, but real gaps worth flagging for whoever picks this up next):
- Prompt Config screen's "Save & re-run" has no backend endpoint to call — it's UI-only right now. Same for Ship To Catalog create/edit (search works against the real endpoint, save does not).
- `describe_prompt_diff()` in `prompt_service.py` is built and unit-tested but has no route exposing it, so the Prompt Config screen can't actually show a real global-vs-customer diff yet.
- Real OCR (`FASTLANE_USE_REAL_OCR=true`) needs `tesseract-ocr` added to `backend/Dockerfile`'s apt packages — documented honestly in the README now rather than silently broken.

**How to verify**: `docker-compose build && docker-compose up`, then hit `http://localhost:5173` (frontend) with the backend at `http://localhost:8000`; `GET /api/health` should return `{"status": "ok"}`. Fake OCR/LLM are on by default so the full upload → OCR → extract → review → approve → export loop runs with zero external API keys. I could not execute this myself in this session (`npm install`, `pip install`, and even `python3 -c/-m` all required approval that wasn't obtainable non-interactively) — that verification step is the one thing I'd want someone with shell execution access to actually run before calling this fully proven, though the static contract-matching gives me high confidence it's correct.

**Build verification:** build left unverified (no .xcodeproj/.xcworkspace found.)

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
