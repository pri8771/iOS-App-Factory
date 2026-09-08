# Operator quickstart — offline protected release path (OR-63 / IF-T049)

Status: offline / simulated only. Real Apple, signing, TestFlight, and device steps remain forbidden until a later live-authorization task.

## Normal simulated release

1. Stack on the reviewed factory tip that contains the protected-release engine.
2. Confirm transport capability: fake protocol `app-factory.fake-apple-upload.v1` available; real `app-factory.apple-upload.v1` disabled.
3. Produce or load an archived AuraFit-shaped release run fixture (bundle `com.pchordia.aurafit`).
4. Obtain a fresh deterministic provider build observation (`known-maximum` or `explicitly-empty`).
5. Reserve the next build with `allocateNextAgainstObservation` (stale/ambiguous observations fail closed).
6. Issue a single-use `apple.upload-build` approval bound to the exact `ReleaseIdentityV1` digests.
7. Run `release.upload` with an artifact-bound `apple.upload-build` approval; the daemon plans the release-scoped effect, persists the upload intent, consumes the approval once, and CAS-advances the run to `upload-approved` without contacting Apple (`receipt` remains null).
8. Dispatch only through the fake transport (`app-factory.fake-apple-upload.v1`); real transport stays disabled.
9. Run `release.confirm` with the retained `effectId` for observation-only stage advances.

## Safe restart

- Reload durable release run, approval, effect, intent, and observation rows.
- If effect state is `unknown`, reconcile from observation; never blind-resend.
- Expired leases release claims without creating a second effect.

## Uncertain effect

- Timeout or ambiguous fake outcomes stay `unknown` / uncertain.
- Operator action is observe/reconcile, not “upload again”.
- Consumed approvals never authorize a second effect.

## Stale observation

- Provider max-build observations past `freshnessDeadline` refuse allocation.
- Studio must show observation time and basis; old UI state must not authorize a new send.

## Restore / rebuild

- Restore only into a disposable empty runtime created for the drill.
- After restore, re-run reconciliation before any dispatch.
- Never point recovery drills at the operator live database or historical evidence store.

## Evidence retention

- Keep sanitized receipts, identity digests, command IDs, and test digests.
- Retention decision for this offline path: retain session evidence under `docs/evidence/session-2-ios-factory-20260908/` with the tested SHA recorded in the return packet; do not retain raw provider payloads or secrets (none should exist).

## Redaction

Never place credentials, Keychain material, absolute local artifact paths, or raw provider JSON in events, receipts, snapshots, logs, UI, fixtures, or Git.

## Rollback

- Local CAS conflicts leave the prior stage intact.
- Known rejection does not advance the run.
- To abandon an upload-approved run without external success, record cancellation locally without claiming the remote upload was undone.

## Escalation

Escalate when: secret exposure is suspected; schema migration/restore ambiguity appears; real Apple/account/2FA/payment is requested; or independent review is unavailable.

## Explicitly forbidden until later live authorization

- `xcodebuild archive` / export / codesign / notary for this batch’s transport proof
- `xcrun altool`, Transporter, App Store Connect write APIs, Fastlane upload
- Apple authentication, signing identity use, TestFlight distribution, device install, public submission
- Enabling `app-factory.apple-upload.v1`
- Merging this branch without review, or marking Jira Done while merge/live gates remain

## Incident runbook (offline)

| Symptom | Immediate action | Stop if |
| --- | --- | --- |
| Duplicate upload suspected | Inspect effect intent digest + consumed approval; do not resend | External Apple action would be required |
| Stale Studio send button | Refresh projection; verify observation timestamps | UI claims success without receipt |
| Migration failure | Leave runtime untouched; capture SQL error + version | Foreign key check fails after apply |
| Fake transport returns timeout | Enter uncertain reconciliation | Operator presses upload again |
| Real transport probe available unexpectedly | Halt; treat as configuration incident | Any send is attempted |
