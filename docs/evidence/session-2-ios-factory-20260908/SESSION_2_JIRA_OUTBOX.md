# SESSION_2 Jira outbox (READ-ONLY session — do not apply from this agent)

Sync later by a human / separate Jira writer. No live Jira mutations were performed in Session 2.

## Proposed comments

### OR-27 (IF-T012) — recommend In Review
Protected-release contracts finalized (`ReleaseIdentityV1`, `release.confirm`, release-scoped effects, state machine + threat model). Commits include `f32c039` on stacked tip `e490a14`. Offline only.

### OR-26 (IF-T013) — recommend In Review
Durable build-number reservation against deterministic provider observations with fail-closed stale/ambiguous paths (`53280ab`).

### OR-28 (IF-T014) — recommend In Review
`planProtectedReleaseUpload` atomically plans release-scoped effect + upload intent + one-time approval consume + CAS to `upload-approved` (`d070223`, migration `0021` in `eda167c`).

### OR-29 (IF-T015) — recommend In Review
Fake Apple upload transport/adapter; real transport disabled by default; daemon effects default registers fake adapter (`24e20df`, `eda167c`).

### OR-30 (IF-T016) — recommend In Review
Daemon `release.upload` / `release.confirm` observation-only stage advances (`7e2f278`). No provider send inside upload transaction.

### OR-31 (IF-T017) — recommend In Review (offline conformance)
Offline conformance for reservation fail-closed + fake transport success/reject/timeout/identity-mismatch (`09b8484`, `805f492`). Not Apple evidence.

### OR-37 (IF-T023) — recommend leave Open / partial
Semantic intent replay cannot mint a second effect; full restart/uncertain-upload reconcile drill remains thin. Do not mark Done.

### OR-38 (IF-T024) — recommend leave Open / partial
Disposable DB restore retains upload-approved stage; OR-3 still open; no live control-plane restore. Do not mark Done.

### OR-39 (IF-T025) — recommend In Review
Studio protected-release operator truth model + rail panel; real upload controls remain disabled (`fa2e283`).

### OR-42 (IF-T026) — recommend In Review
Stale reconnect / local-cancel honesty tests; cancel does not claim remote undone (`fa2e283`).

### OR-63 (IF-T049) — recommend In Review (offline docs only)
Operator quickstart/runbook for offline fake path (`7e2f278`, `805f492`). OR-36 device path excluded.

## Status guidance
- Never recommend Done while merge, live provider, Apple, signing, device, or owner acceptance remains.
- Preserve original estimates/planned dates.
- Stacked dependency: draft PR must cite iOS-App-Factory #1 tip `e490a14473d614f3b9ab013e1319584a0345d5b5`.

## Actuals observed
- Machine: Darwin 25.6.0 arm64 / macOS 26.6.2
- Requested route: Cursor Auto (Multitask)
- FINAL_CODE_SHA: `d189e2bb9b4f6acc0f2841e27736d4a090102741`
- Focused tests at that SHA: 10 files / 215 passed
- Distinct-model review: approve (after fixing replay/payload/confirm blockers)
- Jira writes this session: none
- Tokens/cost: null
