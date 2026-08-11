# First four weeks: committed execution backlog

Status: proposed implementation baseline  
Dates: August 10–September 4, 2026 (20 focused working days)  
Primary commitment: one restart-safe local Codex coding slice against a protected Swift fixture

## What four weeks will prove

At the end of this period, the Factory must be able to do this:

```text
typed TaskSpec submitted through the CLI
→ daemon durably records the command and returns control to the operator
→ scheduler claims one attempt with a monotonically increasing fence
→ supervisor creates an isolated worktree at an explicit base SHA
→ Codex performs one bounded source change
→ trusted tests run in a separate clean verification checkout
→ an independent read-only review evaluates the task, diff, and raw evidence
→ the Factory creates exactly one local commit
→ evidence is content-addressed and independently verifiable
→ a forced daemon or supervisor restart reconciles without duplicate work
```

This is the committed milestone. It proves the hardest part of the architecture:
durable autonomous local execution. It is not yet Hindsight enrollment, Jira or
GitHub automation, a portfolio dashboard, or TestFlight delivery.

## Planning rules

- The plan assumes 20 focused build days. Fewer available days extend the dates;
  they do not justify deleting recovery or verification work.
- Codex is the only real implementation runner in this milestone. Claude is added
  later against the same runner contract.
- Only one coding attempt runs at a time. Multi-project scheduling comes after the
  single-attempt path is reliable.
- The new repository is the only implementation target. The legacy orchestrator
  and Hindsight are read-only references during the committed scope.
- The Swift fixture's tests and quality configuration are protected from the
  implementation agent.
- Pause means “finish the active step and start no new step.” Cancel owns process
  termination.
- The daemon can continue after the initiating CLI or terminal closes while the
  Mac remains awake and logged in. Launch-at-login and operation through sleep or
  logout are not promised yet.
- Every completed task has an automated acceptance assertion. Documentation or a
  green-looking status is not evidence by itself.

## Week 1 — Make the architecture executable

Dates: August 10–14  
Goal: a committed, buildable repository with the minimum contracts and durable
storage needed for the walking slice.

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| `W1-01` | Review and commit the greenfield scaffold as the first local baseline | — | `main` has a real base SHA and the worktree is clean |
| `W1-02` | Pin Node 24.18 and pnpm 10; add manifests only for contracts, kernel, supervisor, runner, command client, daemon, CLI, and testkit | W1-01 | Frozen install uses the supported runtime with no engine warning |
| `W1-03` | Add strict TypeScript references, export maps, formatter, lint, test, build, and one root `verify` command | W1-02 | A clean clone can install, verify, and build with one documented command |
| `W1-04` | Enforce package dependency direction | W1-02 | Negative fixtures prove clients cannot import kernel, runner, or daemon internals |
| `W1-05` | Run the early SQLite spike with `better-sqlite3`: install, migrate, close, reopen, and integrity-check | W1-02 | Node 24 compatibility and required pragmas are proven before more kernel work |
| `W1-06` | Run the early headless Codex spike: structured invocation, auth, timeout, cancellation, and exit mapping | W1-02 | One non-destructive fixture command finishes without a TTY; prompts become `blocked`, not hangs |
| `W1-07` | Create a tiny Git-backed Swift Package fixture with one bounded implementation task | W1-01 | `swift test` passes at the base SHA and protected files have recorded digests |
| `W1-08` | Implement schema primitives plus `TaskSpec`, `Command`, `Attempt`, `Step`, and `Event` | W1-03 | Valid examples round-trip; unknown fields and malformed values fail before persistence |
| `W1-09` | Implement `AgentRunSpec`, `AgentEvent`, `AgentRunResult`, `Evidence`, and structured review findings | W1-08 | Runs must have bounded time/output, exact working directory, environment allowlist, and schema version |
| `W1-10` | Generate deterministic JSON Schema and checked-in valid/invalid fixtures | W1-08–09 | Regeneration has no diff and every fixture has the expected result |
| `W1-11` | Add initial SQLite migrations for commands, task snapshots, attempts, steps, leases, events, and artifacts | W1-05, W1-08 | Fresh and upgraded temporary databases reach the same schema |
| `W1-12` | Implement atomic attempt/state/event repositories and close/reopen tests | W1-11 | A state transition and its event both commit or neither commits |

### Week 1 exit gate

- The repository is committed, clean, and reproducibly buildable.
- Both high-risk spikes—SQLite and headless Codex—have executable tests or
  recorded fixtures.
- Invalid commands cannot reach SQLite.
- A valid attempt survives database close and reopen.
- The Swift fixture and protected test digests are stable.

No daemon scheduling starts until this gate is green.

## Week 2 — Prove durability without an LLM

Dates: August 17–21  
Goal: complete and repeatedly recover a deterministic fake task through the same
daemon path the real agent will later use.

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| `W2-01` | Implement the single-writer daemon composition root and mode-0600 Unix-socket command service | Week 1 | A second daemon refuses ownership and clients have no direct database access |
| `W2-02` | Add idempotent command handling keyed by command ID | W2-01 | Retrying after a lost CLI response returns the original attempt, not a duplicate |
| `W2-03` | Implement CLI `doctor`, `run`, `status`, `events`, `pause`, `resume`, and `cancel` | W2-01–02 | Human and JSON output come through the typed command client only |
| `W2-04` | Implement the guarded attempt/step transition table and desired-state semantics | W1-12, W2-01 | Every illegal transition has a table-driven failing test |
| `W2-05` | Add a deterministic three-step fake worker with durable checkpoints | W2-04 | The same attempt reaches one terminal state and completed steps are not repeated |
| `W2-06` | Add leases, heartbeats, bounded retries, and monotonically increasing fencing tokens | W2-04–05 | A stale worker cannot advance an attempt after reclaim |
| `W2-07` | Persist supervisor identity: PID, process start time, boot ID, process group, and fence | W2-05–06 | A reused PID never causes an unrelated process to be signaled |
| `W2-08` | Implement startup reconciliation and orphan adopt-or-terminate behavior | W2-07 | Restart produces exactly one eligible supervisor and one attempt timeline |
| `W2-09` | Add parameterized failpoints at every fake-worker durable boundary | W2-05–08 | Kill/restart resumes or blocks safely with no stale-fence mutation or duplicate terminal event |
| `W2-10` | Add SQLite busy/full/write-error and copied-database corruption tests | W1-12, W2-09 | Scheduling fails closed; no partial state/event commit can be represented as success |

### Week 2 exit gate

The initiating CLI returns after persisting desired state. The fake task completes
after the terminal closes and passes the recovery matrix without duplicate work,
orphaned processes, lost evidence, or stale writes.

## Week 3 — Add the real Codex coding path

Dates: August 24–28  
Goal: replace the fake steps with an isolated, bounded Codex edit and a trusted
verification path.

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| `W3-01` | Implement Factory-owned Git mirror/worktree creation at an explicit base SHA | Week 2, W1-07 | A dirty user checkout is never scheduler input and failure never falls back to shared writes |
| `W3-02` | Add symlink-safe changed-path validation and protected-path policy | W3-01 | The agent cannot change tests, CI, policy, quality thresholds, baselines, signing, or files outside the worktree |
| `W3-03` | Implement the per-attempt supervisor entrypoint and versioned protocol | W2-07–09 | Daemon and supervisor reconnect using attempt ID, fence, and schema version |
| `W3-04` | Add process-group timeout/cancel, output caps, and replayable JSONL spool | W3-03 | Child and grandchild processes terminate; duplicate/truncated spool records replay safely |
| `W3-05` | Implement the Codex adapter against the narrow `AgentRunSpec` contract | W1-06, W3-03–04 | Structured events replay deterministically and prose is never treated as state |
| `W3-06` | Build a credential-minimized environment and secret-canary tests | W3-05 | Daemon-only secrets never appear in the agent environment, prompt, log, spool, or evidence |
| `W3-07` | Validate the candidate diff before verification | W3-02, W3-05 | Out-of-scope, binary, oversized, protected, or path-escaping changes block the attempt |
| `W3-08` | Run trusted `swift test` in a separate clean verification checkout | W3-01, W3-07 | Passing evidence is bound to the exact base SHA, diff/tree digest, command, and tool versions |
| `W3-09` | Implement content-addressed evidence blobs plus an atomic evidence manifest | W1-09, W3-08 | Missing or modified blobs invalidate the manifest; partial writes cannot be referenced |
| `W3-10` | Complete the first end-to-end Codex walking slice | W3-01–09 | Codex changes only allowed source, protected tests remain byte-identical, and trusted tests pass |

### Week 3 exit gate

One real Codex task reaches verified-candidate state through the daemon. Killing
the daemon or supervisor during agent execution or verification never changes a
protected file, skips a required check, or creates a false success.

## Week 4 — Reconciliation, independent review, and proof

Dates: August 31–September 4  
Goal: turn the working slice into a credible autonomous-system demonstration and
reserve time for integration failures.

| ID | Task | Depends on | Acceptance |
|---|---|---|---|
| `W4-01` | Add an independent read-only reviewer with structured findings | Week 3 | Reviewer receives TaskSpec, diff, and raw evidence; it cannot write the worktree or approve malformed evidence |
| `W4-02` | Add broker-owned scoped local commit with attempt marker | W3-09–10, W4-01 | Only a current fence and complete gates can create the commit |
| `W4-03` | Reconcile a crash after Git commit but before SQLite records the SHA | W4-02 | The exact marked commit is adopted when tree digest matches; a second commit is never created |
| `W4-04` | Implement `factory evidence verify` | W3-09, W4-02 | Commit, tree, task, tests, review, events, and every artifact verify by digest |
| `W4-05` | Harden `doctor`, timeline, blockers, failure messages, and recovery instructions | W4-01–04 | An operator can understand and recover a stopped attempt without reading SQLite or raw logs |
| `W4-06` | Run the full parameterized chaos/recovery matrix | W4-01–05 | All listed failpoints pass ten times each with no false success or duplicated effect |
| `W4-07` | Run three consecutive normal Codex attempts plus one deliberate crash/recovery attempt | W4-06 | All four produce exactly one verified commit and no remaining child process |
| `W4-08` | Add reproducible demo script and operator documentation | W4-07 | A fresh local runtime can reproduce the milestone from documented commands |
| `W4-09` | Fix integration defects discovered by the complete flow | W4-01–08 | No unresolved P0/P1 finding remains in the milestone scope |
| `W4-10` | Publish the final local evidence index and next-phase gap report | W4-09 | Every claim links to an executable result; deferred capabilities remain explicitly deferred |

### Week 4 exit gate

These assertions must all be true:

- `git rev-list --count BASE..RESULT` equals `1`.
- The result commit tree matches the recorded tree digest.
- Only allowed source files changed; protected tests are byte-identical.
- `swift test` passes in a separate clean verification checkout.
- Event IDs are unique, sequence numbers are monotonic, and one terminal state
  exists.
- Every evidence blob exists and verifies by digest.
- No supervisor, child, or grandchild process remains.
- Duplicate command delivery and forced restart do not create a second attempt,
  terminal event, or commit.
- A failed or malformed review cannot be represented as verified success.

## Mandatory recovery matrix

The milestone does not pass without deterministic coverage of at least these
failure classes:

1. Duplicate `run` delivery.
2. Kill after attempt commit but before CLI reply.
3. Kill after lease/fence claim but before supervisor launch.
4. Kill the daemon while a supervisor is alive.
5. Kill the supervisor during an agent child/grandchild process.
6. Deliver a late result carrying an old fence.
7. Replay duplicate spool records and a truncated final record.
8. Kill after trusted tests pass but before recording the result.
9. Kill after Git commit but before recording its SHA.
10. Kill during evidence-blob creation.
11. Inject SQLite busy, full, write-I/O, and copied-database corruption errors.
12. Start a second daemon.
13. Present a reused PID with mismatched boot/start identity.
14. Pause between steps and cancel during a process tree.
15. Close the initiating terminal.
16. Attempt secret leakage, protected-test modification, and outside-worktree
    writes.

## Conditional stretch after the Day-17 reliability gate

Stretch work starts only if `W4-01` through `W4-04` and the core recovery suite
are green by Day 17. It never consumes the final integration buffer.

| ID | Task | Acceptance |
|---|---|---|
| `S-01` | Tiny read-only dashboard for daemon health, attempt status, blocker, events, evidence, and pause | Dashboard uses the typed command client and shows the same event IDs as CLI |
| `S-02` | Read-only repository-enrollment scanner against synthetic fixtures | Scan has a deterministic digest and causes no repository write |
| `S-03` | Run the read-only scanner against Hindsight only after before/after status and content digests are in place | Hindsight is byte-for-byte and Git-status unchanged; output is explicitly non-authoritative |

MCP, Claude, Jira, GitHub, Apple, and TestFlight are not stretch tasks in this
period; each adds a new trust or external-effect boundary and begins after the
core milestone.

## User inputs needed during these four weeks

1. Open `/Users/pchordia/code/factory/app-factory` as the canonical Codex
   workspace.
2. Accept the default initial execution budget: one active attempt, one retry,
   and a 20-minute Codex timeout.
3. Treat `swift test` as the trusted fixture check and fixture tests/configuration
   as protected paths.
4. Review only material product decisions or a blocked safety boundary; routine
   implementation and local verification should not require repeated approval.

No Jira, GitHub, Apple, Claude, GCP, Supabase, CRM, website, marketing, or domain
account work is required for this milestone.

## Explicitly deferred until after Week 4

- Hindsight enrollment or modification, except the conditional read-only scan.
- Jira/GitHub project creation, PRs, updates, merging, or any other remote write.
- MCP and Claude runner conformance.
- Full dashboard, portfolio UI, and multi-project scheduling.
- LaunchAgent installation and unattended operation across logout, reboot, or
  sleep.
- General approval, external-effect, release, module, policy, and plugin systems.
- App Store Connect, signing, TestFlight, or release automation.
- Website, analytics, feedback, CRM, marketing, SEO/AEO, social, or learning
  modules.

Those capabilities will be built on top of the proven execution kernel instead
of being mocked into the first milestone.
