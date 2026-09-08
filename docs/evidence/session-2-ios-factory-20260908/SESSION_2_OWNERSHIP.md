# SESSION_2 ownership

Date: 2026-09-08T14:12:23-04:00

## Integration owner

Cursor Auto (this Multitask session) owns shared schemas, migrations, lockfiles, package scripts, evidence indexes, generated fixtures, branch integration, CI follow-up, and final return.

## Worktree / branch

- Worktree: `/Users/pchordia/code/factory/worktrees/CURSOR-IOS-72H-20260908`
- Branch: `codex/or-27-or-42-release-engine-20260908`
- Stacked base tip: `e490a14473d614f3b9ab013e1319584a0345d5b5` (PR #1)
- Do not edit: PR #1 worktree `CURSOR-S3-20260908`, `integration/studio-wave1`, AuraFit product source except fixture metadata defects

## Lane ownership (serial under single integration owner in this run)

| Lane | Jira keys | Files (intended) |
| --- | --- | --- |
| A | OR-27 | contracts release/command/approval/effect; docs evidence state machine + threat model |
| B | OR-26, OR-28 | kernel reservations/approvals; migrations as needed |
| C | OR-29, OR-30 | adapter-sdk / fake transport; daemon upload/observe runtimes |
| D | OR-31, OR-37, OR-38 | conformance/recovery tests; disposable DB drills |
| E | OR-39, OR-42, OR-63 | Studio release detail; operator docs |

## Excluded ownership

Other iOS products (Hindsight, Roam, Letters, Anjali, Svara, Mala/Japa, Digital Temple) and Sessions 1/3 scopes are out of bounds.
