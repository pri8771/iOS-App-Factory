# Detailed backlog: Weeks 5–16

Status: proposed Jira-ready implementation backlog  
Dates: September 7–November 27, 2026  
Parent roadmap: `WEEKS_5_TO_16.md`

> **2026-08-14 re-baseline note:** This document is preserved as the original
> historical planning baseline. Its `AF-Wxx-yy` task breakdown remains
> accurate engineering content, but the calendar dates above are no longer
> tracked as a live schedule — see the re-baseline notes in `BUILD_STAGES.md`
> and `WEEKS_5_TO_16.md` for why. [`BUILD_STAGES.md`](BUILD_STAGES.md) is the
> current authoritative capability-stage sequencing, and
> [`docs/progress/IMPLEMENTATION_STATUS.md`](../progress/IMPLEMENTATION_STATUS.md)
> is the current authoritative status ledger.

## How to use this backlog

- An `AF-Wxx-yy` item is normally one Jira Task/Story and one reviewable PR.
  Decision, operational, integration-gate, and conditional items may produce no
  code PR.
- Lettered subtasks are executable completion steps. They become separate Jira
  subtasks only when they can be independently assigned or verified; otherwise
  they remain the parent ticket's checklist.
- There is no task-count or subtask-count quota. Integration-heavy work stays
  together; independently reversible components split.
- A calendar week ends only when its exit gate passes. Unfinished required work
  moves the downstream date; it is not relabeled complete.
- Week 12 contains evidence-generated `AF-W12-Rxx` Bugs. Their number is
  deliberately unknown until Week 11 finds the actual defects.
- Product decisions, baseline approvals, remote writes, merges, and releases
  retain the named human gates. Routine local implementation and verification do
  not require repeated approval.

## Week 5 — Operational clients and enrollment primitives

### `AF-W5-01` — Clear Week-4 reliability carryover

Type: conditional umbrella  
Depends on: Week-4 exit gate

Subtasks:

- Reproduce every open P0/P1 finding with an automated test or failpoint.
- Create a separate fix ticket/PR for each independent root cause.
- Rerun affected recovery scenarios and the complete walking slice.
- Rebuild the evidence index from the corrected run.

Done when: no P0/P1 remains, every repaired defect has a regression, and the
walking slice still creates exactly one verified commit. If this consumes the
week, later Week-5 tasks slide.

Evidence: failing-before/passing-after tests, recovery trace, and evidence
verification output.

### `AF-W5-02` — Implement the new Factory LaunchAgent lifecycle

Type: engineering/operations  
Depends on: `AF-W5-01`

Subtasks:

- Define a unique service label, executable, runtime directory, and log paths.
- Generate the plist from validated absolute-path configuration.
- Add idempotent `service plan`, `install`, `uninstall`, `status`, and `logs`
  commands.
- Validate ownership and permissions for the plist, socket, runtime, and logs.
- Refuse to overwrite an unknown service or collide with legacy labels/paths.
- Verify uninstall stops and removes only the new Factory service.

Done when: repeated install is a no-op, service state is reported accurately,
and before/after checks prove the legacy orchestrator was neither loaded nor
modified.

Evidence: plist digest, command transcript, `launchctl` state, permission report,
and legacy-service comparison.

Human gate: approve the first real installation after reviewing `service plan`.

### `AF-W5-03` — Prove restart, login, and wake reconciliation

Type: reliability  
Depends on: `AF-W5-02`

Subtasks:

- Terminate the daemon and verify supervised restart.
- Start a login session with an incomplete attempt.
- Exercise sleep/wake reconciliation and stale-child cleanup.
- Verify singleton ownership of the database and socket.
- Recheck supervisor PID/start-time/boot-ID/process-group fencing.
- Document the awake/logged-in execution limitation.

Done when: each lifecycle event produces one authoritative daemon, one attempt
timeline, and no duplicate process or terminal event.

Evidence: process inventories, boot/session identifiers, timelines, and recovery
report.

Human gate: the operator may need to initiate logout/login and sleep/wake tests.

### `AF-W5-04` — Add the local MCP command surface

Type: engineering  
Depends on: Week-4 typed command client

Subtasks:

- Expose project, attempt, blocker, timeline, and evidence reads.
- Expose pause, resume, retry, and cancel through existing typed commands.
- Keep stdout protocol-only and send operational logs to stderr.
- Return stable errors with actionable blocker metadata.
- Add transport, schema, cancellation, and idempotent-retry conformance tests.

Done when: MCP imports only contracts/command-client, and MCP and CLI return the
same command, attempt, event, blocker, and evidence IDs.

Evidence: conformance results and matched CLI/MCP transcripts.

### `AF-W5-05` — Complete the minimal dashboard

Type: engineering; conditional if completed during Week 4  
Depends on: typed command client

Subtasks:

- Show daemon health and current/recent attempts.
- Render sequenced timelines, blockers, and evidence-verification state.
- Add pause, resume, retry, and cancel with appropriate confirmation.
- Handle loading, empty, disconnected, stale, and command-failure states.
- Use an authenticated loopback/session boundary; never read SQLite directly.
- Add import-boundary and cross-client parity tests.

Done when: refreshing/reconnecting cannot duplicate a command and a stopped
attempt is diagnosable without raw logs.

Evidence: UI tests, required-state screenshots, and cross-client transcript.

### `AF-W5-06` — Define repository-enrollment contracts

Type: contracts  
Depends on: Week-4 schemas

Subtasks:

- Define `ProjectManifest`, repository identity, platform/build capabilities,
  protected paths, and policy locks.
- Define enrollment findings, unsupported/ambiguous reasons, and plan results.
- Generate JSON Schema with valid and invalid fixtures.
- Add forward-version rejection and canonical-serialization tests.

Done when: scan results validate before persistence, conflicts cannot silently
fall back, and canonical serialization yields a stable plan digest.

Evidence: schemas, fixtures, and deterministic-digest tests.

### `AF-W5-07` — Build the read-only repository scanner

Type: engineering  
Depends on: `AF-W5-06`

Subtasks:

- Detect Git identity, HEAD/branch/worktree state, dirty paths, and remotes.
- Detect Swift Package and Xcode projects/workspaces, schemes, and likely commands.
- Discover rule/instruction files and report conflicts without deciding them.
- Classify dirty, unsupported, ambiguous, and incomplete projects.
- Add Swift Package, Xcode, dirty, conflicting-rules, and unsupported fixtures.
- Run potentially generative probes only in a Factory-owned copy.
- Reject every scan path that requests a source-repository write.

Done when: fixtures return stable expected classifications, repeated scans have
the same digest, and ambiguity produces findings rather than cleanup or guesses.

Evidence: fixture matrix and before/after Git/content digests.

### `AF-W5-08` — Run the Week-5 operational gate

Type: integration gate  
Depends on: `AF-W5-02` through `AF-W5-07`

Subtasks:

- Submit and inspect one command through CLI, MCP, and dashboard.
- Compare authoritative identifiers and ordered events.
- Restart the installed daemon during an incomplete deterministic attempt.
- Scan every enrollment fixture under before/after monitoring.
- Publish the `G5` evidence bundle and known limitations.

Done when: all clients agree, restart recovery remains green, scanners produce no
repository/ref/status change, and the legacy daemon remains untouched.

## Week 6 — Safe Hindsight enrollment and authority freeze

### `AF-W6-01` — Capture the Hindsight preservation snapshot

Type: safety/operations  
Depends on: `G5`, `AF-W5-07`

Subtasks:

- Record location, remotes, branches, HEAD, worktrees, submodules, and status.
- Inventory modified, deleted, ignored, and untracked paths without changing them.
- Compute relevant content and metadata digests.
- Record historical build/TestFlight evidence as non-authoritative context.
- Repeat the snapshot after discovery and compare it.

Done when: before/after refs, status, and content digests match and no stash,
commit, clean, relocation, or checkout mutation occurred.

Evidence: hashed preservation manifest and comparison report.

### `AF-W6-02` — Produce the read-only Hindsight discovery report

Type: analysis  
Depends on: `AF-W6-01`

Subtasks:

- Inventory Xcode projects, targets, schemes, configurations, dependencies, and
  build scripts.
- Inventory routes, screens, sheets, dialogs, states, and apparent design
  generations.
- Inventory tests, fixtures, persistence, notifications/deep links, integrations,
  icons/assets, and release material.
- Inventory applicable rule files and report contradictions.
- Record mixed-generation exposure and other observable quality gaps.
- Execute build-generating discovery only in a Factory-owned copy.

Done when: every claim links to source or captured evidence, conflicts remain
explicit, and the original checkout is unchanged.

Evidence: discovery report, source index, and post-scan preservation comparison.

### `AF-W6-03` — Prepare the preservation and authority decision packet

Type: decision preparation  
Depends on: `AF-W6-01`, `AF-W6-02`

Subtasks:

- Explain the consequences of checkpointing the dirty redesign, excluding it as
  WIP, or selecting another clean source state.
- Show what each option preserves, excludes, and makes authoritative.
- Reconcile competing product specifications, navigation models, and UI
  generations without choosing silently.
- Propose a bounded Internal TestFlight scope and explicit non-goals.
- Separate subjective product decisions from mechanical defects.

Done when: each option has a base/source consequence and no hidden default can
modify or discard current work.

Evidence: versioned decision packet tied to preservation/discovery digests.

Human gate: select the WIP treatment, product authority, design authority, and
TestFlight scope.

### `AF-W6-04` — Ratify the canonical Hindsight authority record

Type: decision record  
Depends on: approval of `AF-W6-03`

Subtasks:

- Record the canonical product contract and feature boundary.
- Record the information architecture and active design-system generation.
- List authoritative references and superseded/conflicting material.
- Record the Internal TestFlight target and deferred features.
- Require versioned approval for future authority changes.

Done when: agents can determine unambiguously whether a proposed change is in
scope and which design/product source controls.

Evidence: approved authority record and digest.

### `AF-W6-05` — Establish the approved clean base SHA

Type: Git operations  
Depends on: `AF-W6-04`

Subtasks:

- Materialize the approved source state in a Factory-owned mirror/worktree.
- If checkpointing is selected, use only the explicitly approved path outside the
  user's current checkout.
- Verify the resulting tree against the authority decision.
- Record source refs, base SHA, tree digest, and provenance.
- Pin the base according to repository policy.

Done when: the base is clean and reproducible, no moving branch substitutes for
its SHA, and the original checkout is unchanged.

Evidence: clean-checkout transcript, SHA/tree digest, and checkout comparison.

Human gate: required for any checkpoint commit or remote ref.

### `AF-W6-06` — Generate the Hindsight project manifest

Type: configuration  
Depends on: `AF-W6-04`, `AF-W6-05`

Subtasks:

- Set repository identity and approved-base policy.
- Define targets, schemes, build/test commands, simulator policy, and DerivedData
  isolation.
- Protect tests, rules, baselines, quality gates, signing/release files, and
  sensitive assets.
- Declare capabilities and immutable policy references.
- Add the initial release contract and enrollment-gap findings.
- Test symlink and path-normalization bypasses.

Done when: the manifest validates, commands run only in Factory-owned checkouts,
and protected paths cannot be bypassed.

Evidence: manifest digest, schema output, and negative tests.

### `AF-W6-07` — Establish the clean Hindsight baseline

Type: build/test  
Depends on: `AF-W6-05`, `AF-W6-06`

Subtasks:

- Resolve dependencies in the clean Factory checkout.
- Build the approved target with pinned toolchain/destination metadata.
- Run all currently trusted tests.
- Record warnings, flakes, gaps, and environmental dependencies.
- Create stable baseline findings for failures instead of relabeling them green.

Done when: the baseline is reproducibly green or honestly blocked and every
result is bound to the base SHA and toolchain.

Evidence: build/test logs, result bundles, versions, and baseline report.

### `AF-W6-08` — Define the Hindsight pilot backlog

Type: planning  
Depends on: `AF-W6-02`, `AF-W6-04`, `AF-W6-07`

Subtasks:

- Select three required pilot issues and at most two optional issues.
- Give each a bounded outcome, non-goals, protected paths, checks, and evidence.
- Make each independently reviewable and appropriate for one PR.
- Add only real dependencies; separate baseline repairs from features.
- Identify the safest first issue and the gate for attempting the second.

Done when: no issue is an open-ended “finish Hindsight”/“clean up UI” ticket, the
required set exercises meaningful paths, and optional work is explicitly cuttable.

Evidence: accepted issue specs and dependency graph.

Human gate: approve required and optional pilot scope. Passing this completes
`G6`.

## Week 7 — Durable Jira and GitHub effect boundary

### `AF-W7-01` — Add remote-effect contracts and persistence

Type: contracts/persistence  
Depends on: `G6`

Subtasks:

- Define `Approval`, `ExternalEffect`, `OperationMarker`, `ExternalResource`, and
  outbox schemas.
- Define guarded states including planned, approval-required, ready, dispatching,
  unknown, reconciled, succeeded, failed, and manual intervention.
- Add migrations and atomic repositories.
- Add illegal-transition, rollback, and close/reopen tests.

Done when: intent and outbox commit atomically and success requires observed
provider evidence.

Evidence: schemas, migrations, and transition tests.

### `AF-W7-02` — Implement Keychain-backed provider credentials

Type: security/integration  
Depends on: `AF-W7-01`

Subtasks:

- Store only credential references in Factory state.
- Add Jira/GitHub authentication, permission, and capability preflight.
- Inject credentials only into the trusted provider adapter at dispatch.
- Redact tokens, cookies, and authorization headers from all retained outputs.
- Run secret-canary tests across agent environment, prompt, logs, spool, and
  evidence.
- Document rotation and repair.

Done when: agents cannot read provider credentials, insufficient scope blocks
before dispatch, and canaries never appear in evidence.

Human gate: authenticate or repair Jira/GitHub access and approve scopes.

### `AF-W7-03` — Bind approvals to immutable effect intent

Type: security/contracts  
Depends on: `AF-W7-01`

Subtasks:

- Digest provider, action, target, payload, preconditions, issue revision,
  base/head SHA, and policy version.
- Add expiry, rejection, revocation, supersession, and consumption behavior.
- Recompute intent immediately before dispatch.
- Reject wildcard or target-free approvals for writes and merges.

Done when: any bound-input change invalidates approval and replay cannot authorize
a second distinct effect.

Evidence: mutation and stale-approval tests.

### `AF-W7-04` — Implement the transactional outbox dispatcher

Type: reliability  
Depends on: `AF-W7-01`, `AF-W7-03`

Subtasks:

- Enqueue effect intent atomically with the originating transition.
- Claim dispatch with leases and fences.
- Attach deterministic Factory operation markers.
- Reconcile uncertain provider state before retry.
- Add fake-provider crashes before send, after mutation, before response, and
  before local completion.

Done when: stale dispatchers cannot finish effects and replay produces one
logical resource or explicit manual intervention.

Evidence: outbox traces and crash matrix.

### `AF-W7-05` — Add read-only Jira ingestion and reconciliation

Type: provider adapter  
Depends on: `AF-W7-02`

Subtasks:

- Read projects, issue types, workflows/statuses, epics, issues, links, and
  revision data.
- Normalize provider identifiers/timestamps while retaining raw evidence.
- Handle pagination, rate limits, missing permissions, and partial responses.
- Persist revisioned observations with freshness timestamps.
- Produce deterministic desired-versus-observed changes.

Done when: unchanged Jira yields the same canonical digest, stale/partial reads
cannot appear current, and read paths have no mutation capability.

Evidence: provider fixtures, sanitized snapshot, and reconciliation tests.

### `AF-W7-06` — Add read-only GitHub ingestion and reconciliation

Type: provider adapter  
Depends on: `AF-W7-02`

Subtasks:

- Read repository identity, default branch, protections, refs, PRs, checks,
  reviews, and merge state.
- Record exact head/base SHAs rather than relying on names.
- Distinguish missing, inaccessible, deleted, closed, merged, and unknown.
- Handle pagination and rate limits.
- Produce deterministic desired-versus-observed changes.

Done when: advanced bases, changed heads, and unavailable checks are blockers;
identical state has an identical digest; reads cannot mutate.

Evidence: fixtures, live read-only preflight, and reconciliation results.

### `AF-W7-07` — Implement revision-pinned work claiming

Type: kernel/integration  
Depends on: `AF-W7-05`, `AF-W7-06`

Subtasks:

- Snapshot issue revision, TaskSpec, policy, base SHA, and target branch.
- Recheck before agent start, push, PR update, approval, merge, and Jira transition.
- Block/replan changed work instead of silently refreshing the snapshot.
- Mark superseded evidence and explain the changed input.

Done when: any changed requirement, policy, or base blocks downstream effects and
the operator can request replan without editing SQLite.

Evidence: stale-input matrix and blocker events.

### `AF-W7-08` — Generate deterministic project-provision plans

Type: planning/integration  
Depends on: `AF-W7-05` through `AF-W7-07`

Subtasks:

- Model Jira project, epics, issues, workflows/fields, and dependencies.
- Model repo attachment, naming, branch policy, and checks.
- Diff desired and observed resources into create/update/no-op/conflict actions.
- Sort deterministically and attach operation markers.
- Render canonical JSON plus a human review view.
- List scopes, approvals, irreversible effects, and cleanup notes.

Done when: identical inputs yield the same plan digest/order, matching resources
are no-ops, and ambiguity is never guessed away.

Evidence: golden fixtures and a live read-only sandbox plan.

Human gate: approve the exact sandbox plan digest before Week-8 writes.

### `AF-W7-09` — Model a cross-project work package

Type: domain modeling  
Depends on: `AF-W7-01`, `AF-W7-05`

Subtasks:

- Define one canonical work package with per-project issue projections.
- Model dependencies, contributions, blockers, and evidence links.
- Allow project statuses to differ without duplicating shared completion truth.
- Add an app-plus-website SEO fixture.
- Produce project-scoped and all-project reconciliation plans as read-only output.

Done when: shared completion/evidence exists once and one projection cannot
incorrectly complete every linked project.

Evidence: schemas, fixtures, and transition tests.

### `AF-W7-10` — Run the pre-write safety gate

Type: integration gate  
Depends on: `AF-W7-01` through `AF-W7-09`

Subtasks:

- Simulate changed issues, advanced bases, changed PR heads, expired approvals,
  insufficient scopes, and stale fences.
- Prove provision planning remains read-only.
- Inspect agent/evidence boundaries for credentials.
- Publish the approved sandbox plan and gate evidence.

Done when: every stale/uncertain condition blocks before mutation and the plan is
bound to exact observed provider revisions.

## Week 8 — Remote sandbox and failure-injection proof

### `AF-W8-01` — Provision the approved disposable sandbox

Type: external operations  
Depends on: `AF-W7-10`, approved plan

Subtasks:

- Reconcile provider state immediately before apply.
- Require renewed approval if the plan digest changes.
- Create only approved Jira/GitHub resources through the outbox.
- Persist provider IDs, markers, observations, and evidence.
- Rerun provisioning and confirm every action is a no-op.

Done when: exactly the approved resources exist, replay creates no duplicate, and
unknown responses stop for reconciliation.

Human gate: authorize the first sandbox writes.

### `AF-W8-02` — Implement and prove Jira mutations

Type: provider adapter  
Depends on: `AF-W8-01`

Subtasks:

- Create issues with stable operation markers.
- Add deduplicated comments.
- Transition only against observed workflow and issue revision.
- Reconcile before retrying uncertain calls.
- Retain sanitized provider-response evidence.
- Test duplicate delivery and timeout-before/after-mutation.

Done when: replay creates one logical issue/comment/transition and Jira Done is
impossible without verified completion.

Evidence: issue history, marker lookup, and fault tests.

### `AF-W8-03` — Implement and prove GitHub branch/PR mutations

Type: provider adapter  
Depends on: `AF-W8-01`

Subtasks:

- Push a short-lived branch at the recorded commit SHA.
- Create/reconcile one draft PR with Factory markers.
- Reconcile head/base, checks, reviews, and protections.
- Update only Factory-owned PR fields/comments.
- Test duplicate and ambiguous create/update responses.

Done when: replay yields one branch and PR, a same-name/wrong-SHA branch conflicts,
and PR evidence always names exact SHAs.

Evidence: sandbox refs/PR snapshot and replay traces.

### `AF-W8-04` — Add the hash-bound merge broker

Type: security/provider integration  
Depends on: `AF-W7-03`, `AF-W8-03`

Subtasks:

- Bind approval to repo, PR, head/base SHA, merge method, and checks.
- Reconcile preconditions immediately before merge.
- Reject draft, changed-head, stale-base, failed-check, or unapproved merges.
- Reconcile ambiguous merge responses from observed repo state.
- Record merge commit and target-branch state.

Done when: approval for one SHA cannot merge another and success requires observed
target-branch containment.

Human gate: approve the exact sandbox PR/head SHA.

### `AF-W8-05` — Add external-boundary fault injection

Type: reliability testing  
Depends on: `AF-W8-02` through `AF-W8-04`

Subtasks:

- Inject timeout before send and after provider mutation.
- Kill the daemon before/after outbox changes.
- Deliver stale-fence results.
- Change issue revision, PR head, or base mid-flow.
- Return partial, malformed, rate-limited, and ambiguous responses.
- Run selected lost-response cases against the real sandbox.

Done when: known state reconciles deterministically, unknown state never becomes
success/blind retry, and no scenario duplicates an effect.

Evidence: parameterized matrix and provider resource counts.

### `AF-W8-06` — Implement manual-intervention resolution

Type: operations/UI  
Depends on: `AF-W8-05`

Subtasks:

- Surface intended effect, marker, last observation, and uncertainty.
- Permit only adopt-observed, verify-not-performed, supersede-plan, or remain-
  blocked resolutions.
- Require actor/reason and preserve prior history.
- Resume from the next safe step without replay.
- Show the same record through CLI, MCP, and dashboard.

Done when: resolution cannot fabricate evidence and resumed work creates no
duplicate resource.

Evidence: resolution transcripts and replay tests.

### `AF-W8-07` — Run the complete sandbox rehearsal

Type: integration gate  
Depends on: `AF-W8-01` through `AF-W8-06`

Subtasks:

- Execute Jira creation/comment/transition and GitHub branch/PR/check/approval/
  merge/reconcile.
- Restart the daemon at selected boundaries.
- Replay originating commands and verify provider counts/identities.
- Generate—but do not execute—a cleanup plan.
- Publish the `G8` evidence index.

Done when: no resource/effect is duplicated, recovery needs no redispatch, and
any uncertainty is explicitly `manual_intervention`.

## Week 9 — First real Hindsight delivery slice

### `AF-W9-01` — Reconcile the approved Hindsight Jira/GitHub structure

Type: external operations  
Depends on: `G8`, approved pilot backlog

Subtasks:

- Compare accepted epics/issues/dependencies with Jira.
- Compare repository, protection, and checks with GitHub.
- Generate and approve any changed real-project plan.
- Apply missing resources idempotently and store provider IDs/revisions.
- Confirm issue 1 is unblocked at the approved clean SHA.

Done when: required issues are revision-pinned, matching resources are reused,
and conflicts block kickoff.

Human gate: approve the initial Hindsight remote-write plan if not already covered.

### `AF-W9-02` — Deliver required pilot issue 1

Type: product delivery; one app PR  
Depends on: `AF-W9-01`

Subtasks:

- Claim exact Jira revision and snapshot task/policy/base inputs.
- Create the isolated worktree and short-lived branch.
- Run Codex within scope and protected paths.
- Validate diff, run trusted checks, and complete independent review.
- Finalize evidence and one broker-owned commit.
- Push and reconcile a draft PR and required checks.
- Request exact-SHA approval, merge through the broker, verify `main`, then
  transition Jira.

Done when: one Jira issue maps to one attempt chain/PR, the approved change is
merged, and Jira Done occurs only after post-merge verification.

Evidence: issue revision, evidence manifest, PR/checks, approval, merge SHA, and
Jira transition.

Human gate: approve the exact commit for merge.

### `AF-W9-03` — Inject one recoverable failure in the real path

Type: reliability proof  
Depends on: `AF-W9-02` at a safe effect boundary

Subtasks:

- Select a non-destructive marked comment/PR update or daemon-restart boundary.
- Record expected reconciliation before injection.
- Inject the failure once and let normal reconciliation recover.
- Confirm unique provider resource counts and operation markers.

Done when: recovery needs no SQLite edit, redispatch, duplicate command, or direct
provider repair.

Evidence: before/after provider snapshots and recovery trace.

### `AF-W9-04` — Deliver required pilot issue 2

Type: conditional product delivery; one app PR  
Depends on: issue 1 and failure recovery without manual Factory repair

Subtasks:

- Claim the next independent issue at its current revision.
- Repeat isolated implementation, checks, review, evidence, and PR creation.
- Reconcile/replan any advanced base and rerun verification.
- Obtain exact-SHA approval, merge, verify, and transition Jira.

Done when: the second issue completes without bypassing a blocker or weakening
policy and has one complete evidence chain.

Human gate: approve the second exact commit for merge.

### `AF-W9-05` — Audit the first real delivery gate

Type: integration gate  
Depends on: issue 1; include issue 2 if completed

Subtasks:

- Trace IDs from Jira revision through attempt, commit, PR, merge, and final state.
- Verify credentials never entered agent artifacts.
- Confirm no manual redispatch or Factory-state repair occurred.
- Record friction, latency, false blockers, and policy gaps.
- Open bounded follow-up defects without changing Week-10 quality scope.

Done when: at least one real issue has an unbroken verifiable chain and no P0/P1
integration defect remains. Passing this completes `G9`.

## Week 10 — Whole-product Quality Kit foundation

### `AF-W10-01` — Define whole-product quality contracts

Type: contracts  
Depends on: `G9`, Hindsight authority

Subtasks:

- Define `ReleaseContract` and `ExperienceManifest`.
- Define stable `Finding` identity, severity, scope, evidence, root cause, and
  exception fields.
- Define generated `Certification` bound to source, policy, toolchain, checks, and
  evidence digests.
- Add versioning, canonical serialization, and valid/invalid fixtures.
- Prevent implementation agents from accepting findings or certification.

Done when: missing evidence prevents certification, recurring defects retain
identity, and policy/manifest changes invalidate old certificates.

### `AF-W10-02` — Build the Hindsight experience inventory

Type: product/quality  
Depends on: `AF-W10-01`, Week-6 authority

Subtasks:

- Assign stable IDs to public routes, screens, sheets, and dialogs.
- Enumerate meaningful loading, empty, error, content, permission, and recovery
  states.
- Map every row to active design generation, fixture, journeys, accessibility,
  and evidence.
- Mark internal/excluded surfaces explicitly.
- Compare source discovery with runtime navigation.

Done when: every known public surface/state has one stable row and unknown
ownership/generation is a blocking finding.

Evidence: experience manifest and coverage report.

### `AF-W10-03` — Add deterministic app-state and simulator controls

Type: test infrastructure  
Depends on: `AF-W10-02`

Subtasks:

- Control clock, locale, time zone, seeded data, and service responses.
- Add test-only launch routes for inventory states.
- Reset app/database/files/permissions/notifications between cases.
- Isolate simulator and DerivedData resources.
- Prove controls are unreachable in release builds.

Done when: cases are order-independent, repeatable within policy tolerances, and
release builds contain no reachable test control.

### `AF-W10-04` — Enforce inventory completeness

Type: static/runtime gate  
Depends on: `AF-W10-02`, `AF-W10-03`

Subtasks:

- Register discovered routes/surfaces at source and runtime.
- Compare registrations with the manifest.
- Track required states/journeys actually exercised.
- Add negative fixtures for missing route/state, duplicate ID, and stale row.

Done when: an unregistered public route or required state without setup fails.

### `AF-W10-05` — Implement the pinned screenshot matrix

Type: UI-test infrastructure  
Depends on: `AF-W10-03`, `AF-W10-04`

Subtasks:

- Pin Xcode/runtime/device/scale/locale/orientation.
- Define the initial device/theme/text-size matrix in policy.
- Capture each registered state with SHA/build/run/environment metadata.
- Detect missing, blank, crashed, or mislabeled captures.
- Store captures content-addressably without overwriting history.

Done when: each required matrix cell has a valid capture or named blocker.

Evidence: screenshot manifest, matrix report, and artifact digests.

### `AF-W10-06` — Add visual diffing and journey filmstrips

Type: quality tooling  
Depends on: `AF-W10-05`

Subtasks:

- Generate pixel/perceptual diffs with versioned thresholds.
- Require narrow approved masks for nondeterministic regions.
- Produce expected/current/diff views.
- Assemble critical-journey filmstrips.
- Link failures to stable findings.
- Prohibit implementation agents from replacing baselines in feature PRs.

Done when: diffs are inspectable, policy changes require separate review, and
filmstrips expose inconsistent transitions.

### `AF-W10-07` — Add visible simulator comments-to-findings

Type: operator experience  
Depends on: `AF-W10-01`, `AF-W10-05`

Subtasks:

- Run a named journey visibly with current step/state/build displayed.
- Capture a timestamped operator comment and contemporaneous screenshot.
- Create a proposed Finding without silently deciding severity.
- Fingerprint observations for deduplication.
- Generate—but do not automatically create—a Jira bug proposal.

Done when: feedback traces to exact run/step/state/screenshot/SHA and cannot
directly rewrite rules or baselines.

### `AF-W10-08` — Freeze the mixed-generation regression fixture

Type: protected regression fixture  
Depends on: `AF-W10-01`, `AF-W10-06`

Subtasks:

- Select and sanitize a reproducible known-bad state.
- Assign stable expected finding IDs.
- Run inventory, screenshots, and filmstrips against it repeatedly.
- Protect fixture and expected findings from implementation-agent edits.

Done when: the same findings fail repeatedly without relying on the mutable user
checkout.

### `AF-W10-09` — Establish a coherent control and approve the first baseline

Type: quality gate/decision  
Depends on: `AF-W10-02` through `AF-W10-08`

Subtasks:

- Build/select a deliberately coherent control fixture.
- Run the complete inventory and visual pipeline.
- Compare known-bad failure with coherent-control success.
- Present Hindsight journey filmstrips and proposed authority.
- Record baselines separately from implementation changes.
- Publish remaining Week-11 gaps.

Done when: known-bad fails with stable IDs, coherent control passes, unregistered
surfaces fail, and an independent human owns baseline approval.

Human gate: approve or reject the initial visual authority and baselines.

## Week 11 — Common-sense quality and UI coherence

### `AF-W11-01` — Enforce one design-system generation

Type: product-quality policy  
Depends on: Week-10 inventory and approved authority

Subtasks:

- Read the active generation and narrow exceptions from the experience manifest.
- Map every public route/state to its expected generation.
- Reject missing, unknown, or conflicting declarations.
- Require exception owner, rationale, exact scope, and expiration.
- Prove the rule against coherent and mixed-generation fixtures.

Done when: the known-bad fixture fails with stable route findings, the coherent
control passes, and expired exceptions fail.

Evidence: manifest digest, route-generation report, and fixture results.

### `AF-W11-02` — Add static UI conformance checks

Type: trusted quality tooling  
Depends on: `AF-W11-01`

Subtasks:

- Inventory banned legacy components, assets, modifiers, and token sources.
- Detect raw colors, typography, spacing, and other unapproved tokens.
- Detect public routes/states missing from the inventory.
- Protect baselines and policy files from unapproved edits.
- Add true-positive, exception, and false-positive fixtures.
- Run the analyzer outside implementation-agent authority.

Done when: deliberate violations fail trusted verification and valid exceptions
remain narrow, owned, and traceable.

Evidence: analyzer output, fixtures, exception ledger, and trusted-check result.

### `AF-W11-03` — Audit UI lineage at runtime

Type: test instrumentation  
Depends on: `AF-W11-01`

Subtasks:

- Add test-build-only generation markers to relevant components.
- Traverse each inventoried route and meaningful state.
- Emit route → rendered component → generation traces.
- Fail on conflicting generations or unclassified components.
- Prove instrumentation is absent or inert in release builds.

Done when: a shared legacy component hidden in a current screen fails even when
the static route declaration appears correct.

Evidence: lineage JSON, regression result, and release-build negative check.

### `AF-W11-04` — Automate complete critical journeys

Type: UI integration testing  
Depends on: Week-10 deterministic controls

Subtasks:

- Reset data, clock, permissions, notifications, and app state before each run.
- Cover first launch and setup.
- Cover capture, termination, relaunch, and retained data.
- Cover due-item resolution through History and Insights.
- Cover samples plus empty/loading/error/content states.
- Cover retained failure and retry.
- Cover export, deletion, and store recovery.
- Cover notification and deep-link entry.
- Generate ordered screenshots, filmstrips, and diagnostics.

Done when: journeys pass twice from clean state without order dependence and a
missing inventoried critical state fails coverage.

Evidence: `.xcresult` bundles, seed version, coverage map, and filmstrips.

### `AF-W11-05` — Run presentation and accessibility matrices

Type: quality verification  
Depends on: `AF-W11-04`

Subtasks:

- Run pinned small- and large-phone configurations.
- Run light and dark appearance.
- Run required Dynamic Type sizes.
- Exercise Increased Contrast and Reduce Motion.
- Validate labels, traits, focus order, hittability, and clipping.
- Keep baseline approval separate from implementation.

Done when: unapproved diffs, clipped critical content, or missing semantics block
the candidate.

Evidence: matrix manifest, visual diffs, accessibility results, and approvals.

### `AF-W11-06` — Add state-integrity, privacy, and migration gates

Type: quality verification  
Depends on: release contract and deterministic fixtures

Subtasks:

- Verify persistence across termination/relaunch.
- Test supported migrations from representative prior states.
- Verify export/delete behavior and store recovery.
- Scan source, logs, artifacts, and evidence for secrets/prohibited personal data.
- Validate notification/deep-link behavior against the contract.

Done when: data loss, unsupported migration, incomplete deletion, secret/PII
leakage, or broken recovery blocks release.

Evidence: migration matrix, persistence tests, privacy scan, and recovery results.

### `AF-W11-07` — Produce the release finding ledger

Type: integration/triage  
Depends on: `AF-W11-01` through `AF-W11-06`

Subtasks:

- Ingest static, runtime, journey, visual, accessibility, and operator findings.
- Deduplicate using screen/state/rule fingerprints.
- Assign severity, source, affected SHA, reproduction, and evidence.
- Require root cause and regression proof before closure.
- Generate candidate blocker and non-blocker views.

Done when: the candidate has a finite ranked list and unresolved P0/P1,
mixed-generation routes, missing required states, or unapproved baselines block
certification. Passing this completes `G11`.

Human gate: resolve subjective product/visual decisions and separately approve
legitimate baseline changes.

## Week 12 — Hindsight remediation and pilot completion

Week 12 is intentionally evidence-driven. The fixed coordination tasks below
surround a variable number of `AF-W12-Rxx` Bugs produced by the Week-11 ledger.

### `AF-W12-01` — Freeze the Internal TestFlight scope

Type: release decision  
Depends on: `G11`

Subtasks:

- Pin the proposed release manifest and candidate base SHA.
- List included journeys, screens, features, migrations, and requirements.
- Route new ideas/non-blocking enhancements to the later backlog.
- Record the blocker-exception process.

Done when: every finding is an in-scope blocker, explicitly deferred item, or
unrelated backlog work.

Evidence: frozen manifest, SHA, decision log, and backlog links.

Human gate: approve the feature freeze and exception policy.

### `AF-W12-02` — Convert findings into a dependency-ordered repair backlog

Type: planning/Jira triage  
Depends on: `AF-W12-01`

Subtasks:

- Confirm severity and reproducibility for every blocker.
- Create one Jira Bug per independent finding or inseparable root cause.
- Link duplicates and shared root causes without duplicating completion truth.
- Add dependencies, protected paths, expected checks, and definition of done.
- Require explicit release approval for proposed deferments.

Done when: every P0/P1 has exactly one owning Bug and no catch-all remediation
ticket contains unrelated changes.

Evidence: Jira graph, finding-to-issue map, and deferment decisions.

### `AF-W12-Rxx` — Repair one release-blocking root cause

Type: repeatable Bug; instantiated once per accepted blocker  
Depends on: the specific predecessor Bugs in the repair graph

Subtasks for each instance:

- Reproduce the finding at the pinned base SHA.
- Add or strengthen the failing regression.
- Implement the smallest root-cause fix.
- Run targeted trusted checks plus affected journeys/matrices.
- Complete independent review and attach evidence.
- Open, approve, merge, and reconcile one issue-scoped PR.
- Close the finding only after the merged SHA verifies.

Done when: the original defect no longer reproduces, its regression fails without
the fix, and no unrelated baseline/protected path changed.

Evidence: before/after reproduction, tests, diff, review, PR/merge SHA, and
finding closure.

### `AF-W12-03` — Complete the remaining required pilot delivery issue

Type: product delivery; one app PR  
Depends on: relevant `AF-W12-Rxx` blockers

Subtasks:

- Recheck issue revision and dependency readiness.
- Execute through isolated Codex work, trusted checks, and read-only review.
- Push the short-lived branch and evidence-linked PR.
- Obtain hash-bound merge approval.
- Verify merged `main` before Jira Done.

Done when: at least three required pilot issues have completed without manual
Factory-state repair.

Evidence: issue/attempt/evidence IDs, PR/checks, approval, and merge state.

### `AF-W12-04` — Decide whether pilot issues four and five run

Type: conditional capacity decision  
Depends on: early blocker-remediation progress

Subtasks:

- Estimate remaining blocker and certification load.
- Confirm optional issues remain independent and low risk.
- Activate through the normal pipeline or defer with rationale.

Done when: optional work cannot consume capacity needed for P0/P1 closure or
certification.

### `AF-W12-05` — Build and verify one clean candidate SHA

Type: release verification  
Depends on: required remediation and pilot merges

Subtasks:

- Create a clean Factory checkout of protected `main`.
- Verify dependencies/generated assets and clean state.
- Run complete inventory, journeys, visuals, accessibility, privacy, persistence,
  and migration suites.
- Compute source, policy, manifest, test, screenshot, and evidence digests.
- Rerun nondeterministic failures cleanly and classify them honestly.

Done when: one exact SHA passes all mandatory gates with no P0/P1 and no flaky or
missing evidence represented as success.

### `AF-W12-06` — Certify and freeze the candidate

Type: release gate  
Depends on: `AF-W12-05`

Subtasks:

- Reconcile finding and Jira state against the candidate SHA.
- Record accepted P2/P3 findings with owner and disposition.
- Generate the SHA-bound quality report.
- Create the immutable candidate tag/record.
- Require a new candidate for any subsequent source or policy change.

Done when: the report names one SHA and exact evidence/policy digests and all
P0/P1s are closed by verified merged work. Passing this completes `G12`.

Human gate: approve any deferment and the exact candidate boundary.

## Week 13 — Apple release adapter and signed archive

### `AF-W13-01` — Complete Apple release preflight

Type: account/product preflight  
Depends on: `G12`

Subtasks:

- Verify Apple Developer/App Store Connect access and roles.
- Check agreements, bundle ID, app record, version, and tester group.
- Verify signing identity, profiles/capabilities, and Keychain access.
- Verify physical device and TestFlight tester readiness.
- Verify support/privacy URLs and release metadata.
- Emit redacted, actionable blockers.

Done when: preflight is green or names precise operator blockers and no secret
enters task evidence or agent environments.

Human gate: supply/authorize Apple access, resolve agreements/2FA, and confirm
tester/device readiness.

### `AF-W13-02` — Add Apple resource leases and build-number allocation

Type: kernel/release integration  
Depends on: `AF-W13-01`

Subtasks:

- Define exclusive signing, archive/export, build-number, upload, and tester-
  mutation resources.
- Reconcile App Store build numbers before allocation.
- Bind allocation to candidate SHA and release attempt.
- Define crash/expiry behavior without reusing an uncertain number.
- Add concurrency and stale-fence tests.

Done when: competing/restarted attempts cannot reuse a build number or operate
under an expired fence.

### `AF-W13-03` — Implement Apple release identity and correlation

Type: contracts/provider integration  
Depends on: `AF-W13-02`

Subtasks:

- Model bundle ID, version, build, SHA, archive digest, and App Store build ID.
- Persist sanitized provider correlation.
- Define zero-, one-, and ambiguous-match outcomes.
- Expose the same identity tuple through CLI/MCP/dashboard read models.

Done when: Apple state cannot be attributed by build number alone and ambiguity
requires intervention.

### `AF-W13-04` — Validate metadata, assets, entitlements, and export settings

Type: trusted release check  
Depends on: `AF-W13-01`

Subtasks:

- Validate icons, launch assets, and required device assets.
- Validate privacy answers, support/privacy URLs, notes, and screenshots.
- Inspect bundle IDs, entitlements, capabilities, versions, and export config.
- Compare declared behavior with privacy metadata.
- Emit field-level blockers and warnings.

Done when: missing/inconsistent release material blocks packaging certification.

Evidence: metadata report, asset inventory, entitlement diff, and privacy check.

### `AF-W13-05` — Archive and export the certified candidate

Type: release build  
Depends on: `AF-W13-02` through `AF-W13-04`

Subtasks:

- Prepare a clean release worktree at the candidate SHA.
- Inject the leased build number without silently altering certified source.
- Archive with exclusive signing resources.
- Inspect bundle identity, signing, entitlements, and embedded provenance.
- Export with approved configuration.
- Hash archive/export artifacts and retain immutable logs.

Done when: a signed exportable archive matches candidate SHA, build identity,
signing, and entitlements; exit status alone is insufficient.

### `AF-W13-06` — Prove Apple failure and ambiguity handling

Type: reliability testing  
Depends on: `AF-W13-03`, `AF-W13-05`

Subtasks:

- Test timeout before upload and after provider acceptance.
- Test consumed build numbers and duplicate delivery.
- Test processing rejection, ambiguous match, restart, and stale approval.
- Verify reconciliation precedes every retry.

Done when: unknown state becomes manual intervention and no scenario duplicates
allocation/upload or creates false success.

Evidence: fault matrix, event traces, and provider fixtures.

### `AF-W13-07` — Generate and approve the pre-upload certificate

Type: release approval gate  
Depends on: `AF-W13-04` through `AF-W13-06`

Subtasks:

- Assemble quality, metadata, signing, archive, and reconciliation evidence.
- Generate the certificate naming SHA, archive/metadata digests, version, and build.
- Present blockers/warnings and exact proposed upload.
- Record expiring hash-bound approval.
- Invalidate it if any bound input changes.

Done when: a stale, generic, or differently bound approval cannot upload. Passing
this completes `G13`.

Human gate: approve the exact upload candidate.

## Week 14 — Internal TestFlight delivery

### `AF-W14-01` — Upload the approved archive

Type: approval-bound external operation  
Depends on: `G13`

Subtasks:

- Revalidate approval, lease, archive/metadata digests, and build identity.
- Record effect intent and operation marker transactionally.
- Submit through the trusted broker without exposing credentials to agents.
- Persist sanitized provider correlation/response.
- Stop and reconcile rather than retry after a timeout.

Done when: only the approved archive can be submitted and retry logic cannot
create a second upload.

Evidence: effect record, marker, redacted log, and archive digest.

### `AF-W14-02` — Reconcile processing and ambiguous responses

Type: provider reconciliation  
Depends on: `AF-W14-01`

Subtasks:

- Query by the full release identity tuple.
- Poll with bounded backoff and durable checkpoints.
- Surface validation, agreement, and processing blockers.
- Resolve one exact match; block zero/multiple/contradictory matches.
- Resume after daemon restart or sleep/wake.

Done when: status survives restart and cannot become success before exact Apple
confirmation.

### `AF-W14-03` — Apply compliance answers and internal tester mapping

Type: approval-bound external operation  
Depends on: processed build from `AF-W14-02`

Subtasks:

- Reconcile compliance questions with approved metadata.
- Block unanswered or contradictory information.
- Resolve the intended internal group by stable provider ID.
- Apply group mapping idempotently.
- Confirm no public/external testing state was enabled.

Done when: the exact build is assigned once to the approved internal audience.

Evidence: compliance digest, group ID, reconciliation, and idempotency test.

### `AF-W14-04` — Verify Apple build identity and finalize the certificate

Type: release verification  
Depends on: `AF-W14-02`, `AF-W14-03`

Subtasks:

- Compare bundle ID, version/build, App Store build ID, and archive correlation.
- Reconcile source SHA/archive provenance.
- Verify group and availability.
- Finalize the TestFlight-availability section of the certificate.

Done when: every identity field agrees and any mismatch blocks availability.

### `AF-W14-05` — Emit TestFlight availability exactly once

Type: lifecycle integration  
Depends on: `AF-W14-04`

Subtasks:

- Define immutable `release.testflight.available` payload.
- Bind project, SHA, version/build, App Store ID, certificate, and evidence.
- Emit through the outbox only after availability.
- Replay and prove downstream idempotency.

Done when: no event exists for upload/processing/blocked states and replay produces
no second lifecycle occurrence. Passing this completes `G14`.

Human gate: resolve any Apple agreement/2FA issue and confirm the internal group.

## Week 15 — Physical-device proof and command-center v1

### `AF-W15-01` — Install and attest the exact TestFlight build

Type: physical-device verification  
Depends on: `G14`

Subtasks:

- Confirm tester account and device authorization.
- Install from TestFlight, not Xcode.
- Record model, OS, install time, version/build, and App Store build ID.
- Match installed identity to the release certificate before testing.

Done when: testing cannot begin on a build different from the certified Apple
build.

Human gate: perform or observe installation.

### `AF-W15-02` — Execute the named device smoke journey

Type: physical-device verification  
Depends on: `AF-W15-01`

Subtasks:

- Reset or document initial device/app state.
- Execute release-contract smoke steps in order.
- Exercise termination/relaunch and required device-only permissions/notifications.
- Capture timestamped screenshots/observations.
- Record failures as build-bound findings.
- Finalize the physical-device certificate section on success.

Done when: every named step passes on the attested build and a release blocker
prevents certification.

Human gate: observe/confirm the journey and subjective device observations.

### `AF-W15-03` — Execute at most one bounded rebuild

Type: conditional exception flow  
Depends on: a diagnosed blocker from `AF-W15-02`

Subtasks:

- Triage and confirm release-blocker severity.
- Create a small Jira Bug with reproduction/regression requirements.
- Fix through the standard issue/PR/merge pipeline.
- Create a new candidate SHA and build number.
- Rerun mandatory certification, archive, approval, upload, install, and smoke.
- Supersede—not overwrite—the prior build record.

Done when: no archive is patched in place and any replacement is fully
recertified. A second rebuild moves the schedule.

### `AF-W15-04` — Build the authoritative portfolio read model

Type: command-center backend  
Depends on: stable project/Jira/GitHub/quality/release contracts

Subtasks:

- Aggregate project, issue/dependency, attempt, blocker, PR/check, quality,
  approval, evidence, and release state.
- Include stable IDs, provider links, freshness, and reconciliation status.
- Add project and portfolio queries.
- Prove deterministic projection rebuild.

Done when: clients retrieve the same state rather than inferring it independently.

Evidence: schema, parity tests, rebuild test, and sample snapshot.

### `AF-W15-05` — Finish command-center views and safe actions

Type: dashboard/MCP  
Depends on: `AF-W15-04`

Subtasks:

- Add portfolio/project summaries and dependency views.
- Add attempt/timeline/blocker, PR/check, quality/finding, approval, evidence, and
  release drilldowns.
- Expose only daemon-owned pause/resume/retry/cancel/approve/reconcile commands.
- Show stale/unknown/manual-intervention states explicitly.
- Add dashboard/MCP parity and authorization tests.

Done when: no client directly calls SQLite or Jira/GitHub/Apple and dangerous
actions remain digest-bound.

### `AF-W15-06` — Add project and portfolio reconciliation commands

Type: operator workflow  
Depends on: `AF-W15-04`

Subtasks:

- Implement project-scoped dry-run reconciliation.
- Implement bounded all-project dry run with per-provider summary.
- Require explicit execution of the reviewed plan.
- Check approvals/fences per effect.
- Prove idempotent replay and visible partial failure.

Done when: dry-run cannot mutate and execution cannot silently skip or duplicate
ambiguous work.

### `AF-W15-07` — Prove resource-safe two-project concurrency

Type: conditional reliability  
Depends on: single-project release reconciliation green

Subtasks:

- Add admission limits and per-project/resource leases.
- Run two independent local attempts concurrently.
- Inject contention and verify blocking/fencing.
- Prove one project's failure/cancel cannot corrupt the other.
- Retain a kill switch that returns to single-attempt mode.

Done when: shared exclusive resources never overlap and isolation tests pass.

Passing device smoke and client parity completes `G15`.

## Week 16 — Buffer, controlled learning, and second-project proof

### Schedule reserve — Resolve any earlier failed gate

This is deliberately not padded into predefined tickets. If a prior gate slipped,
create only evidence-backed blocker tickets, use Week 16 as release/recovery
buffer, and cancel conditional website work.

### `AF-W16-01` — Write the mixed-generation root-cause record

Type: learning/analysis  
Depends on: known-bad and release evidence

Subtasks:

- Link original evidence, affected routes, and escape point.
- Separate triggering defect, contributing conditions, missing controls, and
  detection gaps.
- Map each prevention to a proposed executable test/policy/template change.
- Record limitations and cases the controls will not catch.

Done when: the record explains both how the mixed UI happened and why prior
checks allowed it.

### `AF-W16-02` — Convert the lesson into a reviewed policy version

Type: controlled learning  
Depends on: `AF-W16-01`

Subtasks:

- Draft the smallest justified policy/template/test change.
- Obtain independent review for overfitting and unintended impact.
- Version it and retain rollback information.
- Replay known-bad and coherent-control fixtures.
- Run it against Hindsight and the second-project scan.
- Pin adoption only after approval and green replay.

Done when: historical failure is caught, coherent controls pass, and no silent
global prompt/rule mutation occurs.

Human gate: approve the policy version and adoption scope.

### `AF-W16-03` — Prove control-plane backup and restore

Type: disaster recovery  
Depends on: stable release state

Subtasks:

- Create a consistent SQLite backup and evidence/artifact index.
- Restore into a clean runtime directory.
- Run integrity, migration, and digest verification.
- Restart and reconcile incomplete/external state.
- Measure recovery point and recovery time.

Done when: restored clients show the same completed state, incomplete work
reconciles honestly, and missing evidence remains invalid.

### `AF-W16-04` — Run the lost-machine recovery drill

Type: disaster recovery  
Depends on: `AF-W16-03`

Subtasks:

- Start with a clean runtime and only documented recoverable inputs.
- Restore state and reconnect repositories.
- Rebind Keychain references without copying secrets into evidence.
- Reconcile Jira/GitHub/Apple.
- Identify unrecoverable local artifacts and required intervention.
- Update the recovery procedure from observed gaps.

Done when: a clean runtime reaches honest provider state without redispatching
completed effects.

### `AF-W16-05` — Produce the operator handoff and evidence index

Type: operations/documentation  
Depends on: `AF-W16-02` through `AF-W16-04`

Subtasks:

- Document service control, enrollment, execution, approval, blockers,
  reconciliation, release, backup, and recovery.
- Index evidence by gate, project, SHA, attempt, PR, and release.
- Report successes, failures, retries, manual interventions, and durations with
  small-sample caveats.
- List security boundaries, awake/session requirements, known limitations, and
  unsupported actions.
- Produce the prioritized next-quarter backlog.

Done when: a fresh operator can inspect state, run safe dry-runs, and recognize
when human intervention is required.

### `AF-W16-06` — Enroll a second project read-only

Type: modularity proof  
Depends on: enrollment scanner and stable kernel

Subtasks:

- Select a representative second repository.
- Record before-scan Git/content digests.
- Generate proposed manifest, policies, commands, and gaps.
- Record after-scan digests.
- Reject any request for project-specific branching in kernel code.
- Compare output with the Hindsight enrollment contract.

Done when: scanning writes nothing, produces useful output, and needs no
Hindsight-specific kernel change.

### `AF-W16-07` — Generate one website lifecycle PR

Type: conditional second-project integration  
Precondition: every release/recovery gate is green and the website is selected

Subtasks:

- Enroll the website read-only and locate its structured project/status source.
- Map `release.testflight.available` to accurate private-beta website data.
- Consume the exact lifecycle event idempotently.
- Generate one short-lived branch and structured-data change.
- Exclude internal TestFlight links and tester details.
- Run website checks, produce a preview, and open one evidence-linked PR.
- Replay the event and prove no duplicate PR.

Done when: one event creates exactly one accurate reviewable PR/preview and
production remains unchanged.

Human gate: approve private-beta wording.

### `AF-W16-08` — Review and deploy the website update

Type: conditional external release  
Depends on: `AF-W16-07`

Subtasks:

- Review wording, structured data, links, and preview.
- Record hash-bound merge approval.
- Merge through the website's protected process.
- Verify production maps to the approved commit.
- Record event → PR → deployment evidence.

Done when: deployment happens only after separate approval and exposes no
internal tester link.

Human gate: approve merge and deployment separately.

## Backlog-wide completion rules

- A code task is not done merely because its PR merged; required post-merge
  verification and provider reconciliation must pass.
- A decision task is not done until its exact artifact/digest is approved.
- An external operation is not done until provider state is observed and bound to
  the intended identifiers.
- A quality finding is not closed until the historical failure is reproducible,
  the regression fails without the fix, and the merged fix passes independently.
- No implementation agent may change protected tests, release gates, policies,
  visual baselines, signing scripts, or approval bindings as part of ordinary
  feature work.
- Optional and conditional tasks never consume capacity needed for the next
  required gate.
