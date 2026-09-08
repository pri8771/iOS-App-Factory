# SESSION_2 release state machine (OR-27)

Architecture Version context: stacked on PR #1 tip `e490a14473d614f3b9ab013e1319584a0345d5b5`. This document finalizes the offline protected-release contracts without adding a second release state machine.

## Canonical stages (existing `RELEASE_STAGE_ORDER_V1`)

1. `candidate`
2. `certified`
3. `archived`
4. `upload-approved`
5. `uploaded`
6. `processing`
7. `internal-testflight-available`
8. `device-smoke-passed` (out of Session 2 scope)

Rules preserved from `assertReleaseRunAdvancement`:

- CAS revision increments by exactly one per write.
- Stage may hold or advance by exactly one; never skip or regress.
- Immutable identity fields never change.

## Protected upload command sequence

| Command | Input | Local transaction | External effect |
| --- | --- | --- | --- |
| `release.upload` | `{releaseRunId, expectedRevision, approvalId}` | Require `archived` at N; create release-scoped effect + upload intent; consume one-time artifact-bound approval; CAS N→N+1 to `upload-approved` | None inside the transaction |
| transport dispatch | retained effect + fenced claim | Persist `sent` / `unknown` / `rejected` | Fake transport only in this batch; real Apple transport disabled |
| `release.confirm` | `{releaseRunId, expectedRevision, effectId}` | Observe retained effect only; CAS at most one stage using exact-build evidence | No send; no new approval consumption |

## Release identity

`ReleaseIdentityV1` binds repository, commit, tree, policy, project/release/run, bundle, version, build, archive/export digests, destination, and transport protocol/version. Approval bindings and intents digest this identity; send never accepts caller-supplied competing identity fields.

## Effect subject scopes

- Attempt-scoped effects: non-null `attemptId` matching attempt/task/project subject (unchanged path).
- Release-scoped effects (`apple.upload-build`): null `attemptId` with release-scoped subject. No fabricated task/attempt rows.

## Approval consumption

Single-use `apple.upload-build` approvals are consumed atomically with the first eligible effect. Consumed approvals never authorize a second effect or a resend after uncertain delivery.

## Observation / uncertain completion

- Known success → sanitized receipt + stage advance when identity matches.
- Known rejection → actionable rejection; no blind retry.
- Timeout / ambiguous → `unknown` / uncertain; reconcile from observation only; never automatic resend.
- Identity mismatch / wrong build → fail closed; stage holds.

## Fake vs real transport

- `app-factory.fake-apple-upload.v1` is the only enabled transport in Session 2.
- `app-factory.apple-upload.v1` remains disabled by default and returns an actionable capability error.
