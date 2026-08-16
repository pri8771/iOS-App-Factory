# Implementation status

Updated: 2026-08-16 (adds the "Studio (Mac app)" section below; the
docs/truth-sweep re-verification pass against `integration/t3-t7` tip
`34917e5` described next remains the last full-repository verification run,
dated 2026-08-14 — this update did not repeat it)

This ledger maps the originally planned Weeks 1–16 capabilities (see the
2026-08-14 re-baseline note in
[`docs/roadmap/BUILD_STAGES.md`](../roadmap/BUILD_STAGES.md)) to what is
actually in the repository. The row numbers below are kept only as stable
identifiers matching the original backlog documents; they are no longer a
calendar claim, and several rows below are marked Implemented while their
original calendar dates are still in the future. A package with unit tests is
not treated as an operational workflow unless the daemon or an operator
entrypoint invokes it.

For local operation, see the
[local operator runbook](../OPERATOR_RUNBOOK.md).

## Status vocabulary

- **Implemented**: the capability is connected to the current local runtime or
  has a supported operator entrypoint and deterministic tests.
- **Dormant / not wired**: contracts and tested components exist, but the
  current daemon or operator flow does not invoke them end to end.
- **Blocked — protected approval**: completing the connection changes a
  protected surface named in [`AGENTS.md`](../../AGENTS.md), so it requires a
  separately classified approval.
- **Blocked — external/user gate**: completion needs an account, provider
  mutation, project decision, device, or exact human approval.

## Current usable boundary

Today the repository can run a local, authenticated daemon with a durable
SQLite command path and deterministic fake `prepare → execute → verify` worker.
An explicit opt-in Swift Greeter profile also connects the scheduler to a
Factory mirror/worktree, a bounded deterministic source edit, trusted Swift
checks in a separate read-only checkout, independent review, one broker commit,
and immutable evidence. A durable host process supervisor records exact intent,
process identity, bounded output, cancellation, and terminal receipts. A Codex
conformance adapter can drive that supervisor and must publish a V2 protocol
closure when enrolled, including trusted executable/model/CLI identity. It has
passed a no-network fake-executable path, not a paid or real-model run. As of
2026-08-14 the operator daemon entrypoint can select the Codex profile: the
owner closed the ADR 0002 operator-enablement gate by recorded decision, and
every real-identity profile mode structurally refuses to load unless
`APP_FACTORY_CONTAINMENT_ATTESTATION` names a valid owner containment
attestation
([`containment-attestation-2026-08-14.json`](../operations/containment-attestation-2026-08-14.json)).
The accepted gaps — Codex CLI per-path deny rules are not OS-enforced, and the
Factory-owned Seatbelt sandbox layer is deferred — are recorded there, with the
compensating controls (materializer write-scope-violation failure,
trusted-verifier authoritative diffs, secret-free enrollment) standing. No
paid or real-model run has occurred.

The no-network [`oci-runner`](../../packages/oci-runner) implements exact
container intents, isolation attestation, durable lifecycle reconciliation,
post-launch quarantine/reaping, engine identity binding, and canonical evidence
export. Its fake/injected-engine suite passes 184/184. A dependency-injected
`OciLocalAgent` now composes that runner with the verified executor, scheduler,
an OCI-specific V3 journal, and the final evidence manifest. The daemon
independently reopens the enrolled OCI root, re-exports and byte-compares the
complete lifecycle closure, rejects V1/V2 downgrade, and replays V3 only from
content-addressed evidence with no Docker call. Execution and cleanup effects
are separately lease-guarded: create/start require active execution authority;
termination/reap markers and stop/kill/remove require the same unexpired owner
and fence while allowing cancellation and controlled-shutdown cleanup.

Before readiness, zero-engine OCI inventory is cross-checked against the exact
durable attempt, TaskSpec, project, execute step, worktree, policy, commit, and
tree. Scheduler discovery is temporarily narrowed to matching unfinished runs,
so a fresh lease can adopt an older durable fence without duplicate create or
start. Validated pre-start cancellation is terminal inventory; orphaned,
future-fence, tampered, or quarantined state denies readiness. This composition
is still dependency-injected and absent from `daemon-entrypoint`; its current
proof uses deterministic no-network fakes, not a live Codex image or current-tree
real engine.

An earlier live Colima `OciRunner` smoke completed a natural lifecycle and
recovered from a persisted launch marker after strict-inspection process
failure. It pinned Docker CLI `29.6.1`, server `29.5.2`, and
`node@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`;
the successful run left durable terminal/removal/receipt evidence and no
residual container. That smoke predates the current engine-binding,
quarantine/reaper, effect-guard, and V3 tree and is not current-tree validation.
The autonomous PID 1 watchdog/output bound, in-container Codex input transport,
controlled egress/auth, autonomous stale-lock recovery, daemon-owned
quarantine-reaper scheduling, effective seccomp/AppArmor digest, host-bind
quota/disk bound, production profile, and remaining real-engine failure paths
are open. The CLI, MCP server, and packaged loopback dashboard use the same typed
command client. The daemon publishes a transactionally maintained local
portfolio snapshot; unavailable provider values remain null. The remaining
generic modules exist with the limitations below.

It cannot honestly produce a Hindsight TestFlight build yet. The only Hindsight
write was the user-authorized local checkpoint branch and commit that preserved
already-present worktree contents; it was not pushed. The subsequent Factory
scan and trusted Xcode verification were read-only and found a deterministic
release-blocking crash. No enrollment plan or repair has been applied. No Jira
project, GitHub remote, Apple resource, signing identity, TestFlight build, or
website repository has been mutated. See the
[bound Hindsight status](HINDSIGHT_ENROLLMENT_STATUS.md).

## Capability traceability (originally planned as Weeks 1–16)

<!-- prettier-ignore -->
| # | Honest status | Implemented modules and tests | Missing connection or gate |
| --- | --- | --- | --- |
| 1 — executable foundation | **Implemented** | Versioned contracts and schemas in [`packages/contracts`](../../packages/contracts), durable SQLite kernel in [`packages/kernel`](../../packages/kernel), Codex boundary in [`packages/agent-runner`](../../packages/agent-runner), and Swift fixture/test utilities in [`packages/testkit`](../../packages/testkit/test). Tests: [`contracts`](../../packages/contracts/test), [`kernel`](../../packages/kernel/test), [`agent-runner`](../../packages/agent-runner/test), [`testkit`](../../packages/testkit/test). | The authoritative post-OCI/scanner root gate is green; operational gaps are recorded in the later rows. |
| 2 — restart-safe fake execution | **Implemented for fake execution and trusted, non-detaching process supervision** | The daemon, authenticated Unix socket, command journal, scheduler, CLI, cancellation, leases, fencing, bounded response replay, and restart tests live in [`apps/daemon`](../../apps/daemon), [`apps/cli`](../../apps/cli), [`packages/command-client`](../../packages/command-client), [`packages/scheduler`](../../packages/scheduler), and [`packages/process-supervisor`](../../packages/process-supervisor). Durable supervision binds immutable intent, launch claim, execution permission, V2 process identity, exact cwd/environment/argv/stdin, bounded output spools, cancellation, receipts, and reconciliation. Migration [`0006`](../../packages/kernel/src/migrations/0006-retry-and-unblock-commands.ts) added durable `task.retry`/`attempt.unblock` commands, the CLI/MCP `blocker` surface (`attempt.blocker`), and structured scheduler-error logging. `apps/daemon/test/factory-daemon-service.test.ts` exercises restart adoption (no duplicate launch of an in-flight run) and targeted cancellation reconciliation against the real `startFactoryDaemonService`, not only a mocked daemon. | Process groups are not containment: a detached descendant can escape. Darwin `ps lstart` identity is only second-resolution, and stale locks or unprovable identity deliberately require operator intervention. |
| 3 — real coding path | **Deterministic Swift slice implemented; OCI/V3 fake path composed but not operator-enabled** | The supported Swift Greeter profile connects [`git-workspace`](../../packages/git-workspace), [`execution-engine`](../../packages/execution-engine), [`trusted-verifier`](../../packages/trusted-verifier), [`independent-review`](../../packages/independent-review), and [`evidence-store`](../../packages/evidence-store). The Codex adapter pins executable digest, CLI version, model, strict invocation/output schema/environment, and supervisor-bound V2 evidence. A no-network fake executable has passed the supervisor → adapter → trusted Swift verification → review → broker commit path. [`oci-runner`](../../packages/oci-runner) adds pinned no-network controls, exact engine binding, quarantine/reaping, zero-engine lifecycle inventory, guarded effects, strict evidence export, and a 184/184 fake/injected-engine suite. `OciLocalAgent` and the verified executor consume complete removed closures into a V3 journal and manifest. Since 2026-08-14, `daemon-entrypoint` routes `APP_FACTORY_LOCAL_EXECUTION_CONFIG` through the profile loader, so an operator can select the Codex profile; real-identity modes (`swift-greeter-codex-v1`, and the config-driven `enrolled-codex-v1` for an enrolled project) load only with a valid owner containment attestation (`APP_FACTORY_CONTAINMENT_ATTESTATION`). `VERIFIED_CODEX_CLI_VERSIONS` now also accepts `0.148.0-alpha.9`, added after live `--version`/`sandbox -P`/structured-output conformance probes against the installed binary (digest recorded in the pinning commit). Verified local execution now supports multi-turn agent runs and the `factory task new` CLI subcommand. [`git-workspace`](../../packages/git-workspace)'s `classifyProtectedPath` is now externalized through a reviewed `ProtectedPathPolicyExtensionV1` (adds `xcode-project-membership` and `test-file-addition` allowances) and gained `advanceImmutableMirrorBase`, which re-enrolls a sealed mirror onto a new base as the next link in a linear, digest-chained ledger instead of rewriting the original binding. [`packages/independent-review`](../../packages/independent-review) has its first non-fixture adapter, `apps/daemon/src/codex-independent-reviewer.ts` (documented in [`docs/operations/llm-independent-review.md`](../operations/llm-independent-review.md)): a strictly read-only Codex CLI reviewer tested end-to-end only against a fake, never-executed Codex placeholder — no paid or real-model call was used to build or certify it. | A real Codex run is still pending: the wiring is enabled, but no paid/real-model or autonomous application-development run has passed. OCI remains unexposed by `daemon-entrypoint`. OCI still lacks the pinned in-container input/PID 1 protocol, controlled model egress/auth, autonomous stale-lock recovery, daemon-owned reaper scheduling, effective seccomp/AppArmor digest, host-bind quota/disk bound, and remaining current-tree real-engine campaigns. Trusted-verifier hard-kill recovery also remains open. The independent reviewer has likewise never made a live model call. |
| 4 — reconciliation, review, and proof | **Walking-slice plus injected OCI restart adoption implemented; production containment/restore gates remain** | Mirror/worktree publication intents reconcile creation crashes; marker refs reconcile commit publication; V2 and V3 agent-result journals replay without relaunch; CLI and MCP expose bounded evidence list/inspect/verify; manifests and every referenced blob are digest-checked. OCI V3 independently reopens and byte-compares a complete canonical closure, rejects protocol downgrade, and replays with no engine call. Read-only startup inventory binds each OCI run to its exact durable owner; scheduler discovery is scoped to matching unfinished attempts so a fresh lease adopts prior-fence work without duplicate create/start. Execution and cleanup effects are separately lease-guarded, and validated pre-start cancellation is terminal inventory. Backup/restore primitives are tested in [`recovery-manager/test`](../../packages/recovery-manager/test). | Restored-runtime quarantine consumption remains **blocked by protected approval**. Quarantined OCI runs still require operator review and independently scheduled reaping; real-engine quarantine/timeout/overflow/stop/kill paths remain unproved. Autonomous stale-lock recovery, trusted-verifier hard-kill adoption, and the complete hard-kill/sleep/provider-failure soak matrix have not passed. |
| 5 — operational clients and enrollment primitives | **Partly implemented; partly dormant/blocked** | CLI, MCP, and the packaged loopback dashboard share the typed daemon client. Evidence and portfolio reads are available through CLI/MCP, and the launcher renders a digest-verified, migration-backed local portfolio projection. The launcher validates private path configuration, uses a one-use browser token plus separate HttpOnly session, and shuts down gracefully. Read-only LaunchAgent plan/status is in [`packages/service-manager`](../../packages/service-manager); enrollment discovery and realistic Xcode/PBX regression fixtures are in [`packages/project-sdk`](../../packages/project-sdk). The corrected fixture received real `xcodebuild -list` and `xcodebuild build-for-testing` validation, and the preservation-bound post-fix Hindsight scan completed without changing its checkout after the authorized checkpoint. `project.scan`/`project.enroll-plan`/`project.apply` are now wired end to end (CLI verbs `project scan`/`project plan`/`project apply`, matching `command-client` methods, and a daemon-side `project-command-runtime.ts` bridge to `project-sdk`); `project-sdk` gained a plan-apply executor (`applyEnrollmentPlan`) and secret-shaped-file detection in its scanner. | LaunchAgent `install`/`uninstall`/`logs` remain unavailable pending the explicit human installation gate (`packages/service-manager/src/cli.ts` rejects those verbs by name; only `plan`/`status` work). The project commands are wired, but using them to actually enroll Hindsight remains blocked by the row-6 findings below. The post-fix production scan verified one Xcode container and one shared scheme with no Xcode gaps; its only blockers are the legacy Factory layout, canonical rule declarations, and Cursor authority binding. |
| 6 — safe Hindsight enrollment | **Preservation and read-only discovery completed; enrollment blocked** | The user-authorized local branch `checkpoint/factory-enrollment-2026-08-11` and commit `c66c690c21c0d662fa623ea104bd8d5dc0a700c0` preserved the pre-enrollment tree without a remote push. The post-fix scan bound source `e96dff…`, inventory `21c1b7…`, and plan `b70311…`; all four preservation checks remained true, and no Xcode gap was reported. Trusted Xcode verification built the existing shared scheme and reported 126/127 tests; the isolated failing UI test reproduced a `TodayView.upcomingForecastsSection` array-subscript crash. A separate serial unit run passed 121/121. | No enrollment plan has been applied. The scan has exactly three rule/legacy blockers: legacy `.factory` migration, canonical rule declarations, and Cursor authority binding. Product/design authority, manifest, pilot scope, the deterministic production crash, and separate SwiftData concurrency/lifetime diagnostics also remain unresolved delivery inputs. The temporary `.xcresult` paths are observations, not a Factory evidence manifest or release certification. See [`HINDSIGHT_ENROLLMENT_STATUS.md`](HINDSIGHT_ENROLLMENT_STATUS.md). |
| 7 — durable Jira/GitHub boundary | **Implemented as deterministic code; provider runtime dormant** | Provider-neutral planning, revision/base drift, and work packages are in [`packages/work-tracking-integrations`](../../packages/work-tracking-integrations). Generic validation, Keychain references, durable effects, and dispatch are in [`packages/adapter-sdk`](../../packages/adapter-sdk), [`packages/credential-broker`](../../packages/credential-broker), [`packages/kernel`](../../packages/kernel), and [`packages/effect-worker`](../../packages/effect-worker). Strict injected-transport Jira Cloud/GitHub adapters, marker reconciliation, pagination, ETag/version handling, and read-only repository/PR/comment/check observations are in [`packages/provider-http-adapters`](../../packages/provider-http-adapters). [`packages/provider-transport`](../../packages/provider-transport) now adds a fetch-based `BoundedProviderHttpTransport` that resolves a Keychain credential just-in-time per request, enforces the credential-origin/deadline/byte-cap contract, and zeroizes buffers it owns. `apps/daemon/src/effect-pump.ts` wires a real `EffectWorker` to the kernel `EffectRepository` and the production ports behind an optional, **default-off** `APP_FACTORY_EFFECTS_PUMP_ENABLED` flag; its `AdapterRegistry` starts empty by contract, and `effects.status`/`effects.list` give read-only operator visibility (kernel state counts, pending outbox, pump activity). | The transport and pump composition seam exists, but no adapter is registered in it and no live credential reference is configured anywhere, so no trusted live HTTP call is made even when the pump is enabled. No provision/apply operation is approved. Activation additionally requires immutable Jira tenant/URL/credential-origin binding, authenticated GitHub owner-node binding, payload-bound provider-neutral observations, and a contract-consistent Jira project marker. Jira issue-link and project-level remote-link intents also fail closed because v1 cannot express safe provider correlation/issue targeting; all gaps are documented in the adapter README. |
| 8 — remote sandbox and failure injection | **Blocked — external accounts and exact mutation approvals** | Generic effect-worker tests cover timeout, late completion, fencing, evidence sanitization, and manual intervention. Provider adapter fixtures additionally cover lost responses, read-only not-found reconciliation, marker collisions, malformed envelopes, host/path confinement, pagination, redaction/zeroization, and zero-call rejection of unsupported Jira intents. | No disposable Jira/GitHub sandbox has been created or mutated. The new provider suite used only injected in-memory transports; live conformance, provider resource counts, and external failure injection cannot be claimed from fakes. |
| 9 — first Hindsight delivery slice | **Blocked — rows 6 and 8 gates plus merge approval** | The local execution, work-tracking, effect, and evidence components needed by this slice exist. | The preservation checkpoint is not a delivery slice. No Hindsight Jira issue, Factory delivery branch, PR, check, merge, or post-merge verification has run. |
| 10 — Quality Kit foundation | **Implemented generically; dormant for Hindsight** | Release/experience/finding/certification models, route-state coverage, deterministic presentation matrices, pixel comparisons, operator findings, and mixed-generation rejection live in [`packages/quality`](../../packages/quality). Lease-bound visible simulator sessions live in [`packages/simulator-runner`](../../packages/simulator-runner). Tests: [`quality/test`](../../packages/quality/test) and [`simulator-runner/test`](../../packages/simulator-runner/test). | The Hindsight route/state inventory, deterministic app fixtures, simulator evidence, filmstrips, and approved visual baseline do not exist. The known-bad test is a deterministic synthetic Hindsight-shaped fixture, not evidence from the current checkout. |
| 11 — common-sense quality and UI coherence | **Dormant for Hindsight; blocked — protected quality approval** | Generic checks reject mixed generations, legacy references, raw tokens, missing public-state observations, expired exceptions, clipped content, missing accessibility semantics, stale evidence, and unresolved blocking findings. | The checks are not connected to a Hindsight build or its complete journeys. Baseline, gate-threshold, test-harness, and visual-authority changes are protected and need separate approval. |
| 12 — Hindsight remediation and candidate | **Blocked — Hindsight scope and quality gates** | Finding closure requires root cause and regression evidence; candidate certification is SHA-, tree-, policy-, manifest-, and evidence-bound in [`packages/quality`](../../packages/quality). | No Hindsight scope freeze, remediation PRs, complete quality matrix, accepted candidate SHA, or verified Jira completion exists. |
| 13 — Apple adapter and signed archive | **Contracts only; blocked — protected release/signing approval and Apple setup** | As of [ADR 0003](../architecture/0003-release-state-reconciliation.md), release state is one reconciled 8-stage machine instead of two competing schemas: [`packages/contracts/src/v1/release.ts`](../../packages/contracts/src/v1/release.ts)'s `ReleaseManifestV1`/`RELEASE_STAGE_ORDER_V1`/`assertReleaseAdvancement` is the single source of truth (exactly-one-stage advancement, immutable release identity, strictly-growing per-stage approvals, and per-stage evidence gates for all 8 stages), and [`packages/quality/src/certification.ts`](../../packages/quality/src/certification.ts)'s `verifyCertification`/`projectCertificationV1` is now a lossless projection/validator over it rather than a second, independently advancing machine. The generic adapter/effect boundary can host a future Apple adapter. | Neither schema has a consumer yet — no kernel table, command handler, or app imports either type outside its own tests. There is no Apple adapter, signing/archive/export implementation, build-number allocator, metadata preflight, signed archive, or release-specific upload approval. Release and signing logic is protected. Apple Developer/App Store Connect access and agreements are external gates. |
| 14 — Internal TestFlight | **Blocked — row 13 and external Apple account** | Contracts can represent uploaded, processing, and internal-TestFlight-available stages and lifecycle events. | No upload, processing poll, compliance answer, tester-group assignment, App Store build reconciliation, or signed availability event has run. |
| 15 — device proof and command center v1 | **Partly implemented; dormant/blocked** | The packaged loopback dashboard has daemon health, attempt actions, one-use browser authentication, graceful shutdown, and a canonical-digest-verified local portfolio view. The daemon maintains bounded project execution summaries without rescanning all history. [`packages/portfolio`](../../packages/portfolio) separately derives planning health, analytics freshness, and conflict-free scheduling proposals. The simulator runner supports visible, commentable sessions. | Jira/PR/quality/approval/release panels and live analytics sources are not composed. Scheduling is proposal-only. There is no TestFlight build or physical-device attestation. |
| 16 — learning, recovery, and second-project proof | **Recovery paths partly connected; learning/second-project gates remain** | Reviewed lesson proposals/replay/adoption plans are in [`packages/learning-engine`](../../packages/learning-engine); recovery bundles/quarantine are in [`packages/recovery-manager`](../../packages/recovery-manager); an approval-required private-beta website PR plan is in [`packages/website-lifecycle`](../../packages/website-lifecycle). Host-supervisor recovery remains connected, and injected OCI V3 startup now inventories immutable state, scopes recovery scheduling, and adopts an exact prior-fence run without duplicate launch. | Kernel registration and atomic approval consumption for `lesson.policy-adopt` are **blocked by protected approval**. Restored-runtime quarantine consumption remains **blocked by protected approval**; OCI quarantine and stale-lock recovery still require operator handling. No second project has passed enrollment, and the website module has no enrolled repository/configuration or deployment approval. |

## Studio (Mac app)

Not part of the originally planned Weeks 1–16 backlog table above; recorded
here because the 2026-08-16 owner decision
([ADR 0004](../architecture/0004-studio-mac-app.md),
[`docs/roadmap/STUDIO_PHASES.md`](../roadmap/STUDIO_PHASES.md)) makes it the
Gen 5 product target and demotes `apps/dashboard` to a debug surface.

**Honest status: Phase 1 (shell) is in progress on branch `studio/phase1`,
built in a separate worktree. Nothing is merged into this branch and nothing
is verified.** No Studio capability described in ADR 0004 or
`STUDIO_PHASES.md` exists in this repository yet. `apps/` here is still
exactly the four listed in [`README.md`](../../README.md): `cli`, `daemon`,
`dashboard`, `mcp`.

Open gaps this decision carries, none scheduled by this entry:

- No `milestones[]` schema exists anywhere under `packages/` (verified
  2026-08-16: zero matches for "milestone").
- `packages/contracts/src/v1/task-spec.ts` has no `phase` field. The word
  "phase" is already used for two unrelated concepts elsewhere in contracts —
  `AgentProgressEventV1Schema.data.phase` (a free-form label for a step
  inside one running agent) and `EnrollmentPlanActionV1Schema.phase` (a
  six-value enrollment-action category) — neither of which is a Studio Phase
  Preset stage.
- Four lifecycle vocabularies disagreed: the separately versioned rules
  corpus's 14-stage lifecycle, a mission-control `gates.md`, this
  repository's own project-manifest lifecycle, and the 8-stage
  `ReleaseManifestV1` machine (ADR 0003). **Reconciled by
  [ADR 0005](../architecture/0005-lifecycle-reconciliation.md)** at the
  contracts level: `gates.md`'s six stages and seven typed gates are the
  project lifecycle (`ProjectLifecycleStageV1`, `TypedGateV1`,
  `ProjectLifecycleStateV1`, and the pure `advanceProjectLifecycleStage` /
  `applyProjectLifecycleGate` / `evaluateProjectLifecycleV1` in
  [`packages/contracts/src/v1/lifecycle.ts`](../../packages/contracts/src/v1/lifecycle.ts)),
  ADR 0003's eight stages are the release sub-lifecycle beneath
  `launch-prep -> live`, the corpus's fourteen are a mapping table, and the
  legacy manifest enum stays accepted as `LegacyProjectLifecycleStageV1`
  (deprecated). Not yet persisted or wired: no kernel table, daemon
  command, or lifecycle event consumes the new state; the in-progress
  studio-ios preset (not in this branch) must bind to it.
- The separately versioned rules corpus is reported pinned at three
  different versions depending on consumer (0.2.0 local, 0.4.0 upstream,
  0.5.0 CLI); this repository's own `packages/policy-engine` uses an
  unrelated integer `policyVersion`, not this semver string. As of
  2026-08-16 the local 0.2.0 corpus is compiled into
  [`docs/policy/ios-app-factory-policy-source.v1.json`](../policy/ios-app-factory-policy-source.v1.json)
  by [`packages/policy-corpus`](../../packages/policy-corpus); the 0.4.0 and
  0.5.0 pins remain unfetched/unlocated (see
  [`docs/policy/RULES_CORPUS_RECONCILIATION.md`](../policy/RULES_CORPUS_RECONCILIATION.md)).
- `packages/policy-engine/src/index.ts` has no rule scoping (`appliesTo` a
  phase), waivers, a human-only owner field, or a check registry (verified
  2026-08-16: zero matches for `appliesTo`, `waiver`, or `scope` in that
  file). The compiled corpus carries those fields in a sidecar JSON until
  the engine schema gains them. Since 2026-08-16 the compiler does emit
  scanner-parsable `factory-rule:` declarations and adapter digest bindings
  (`packages/policy-engine/src/declarations.ts`); without them a compiled
  bundle reintroduced the `rules.canonical-unverifiable` and
  `rules.adapter-nonconforming` enrollment blockers on a Hindsight scratch
  clone.

See [ADR 0004](../architecture/0004-studio-mac-app.md) for the full decision
and [`docs/roadmap/STUDIO_PHASES.md`](../roadmap/STUDIO_PHASES.md) for the
six-phase capability plan.

## Repository verification

### 2026-08-14 docs/truth-sweep re-verification (current tip `34917e5`)

This truth-sweep re-ran the individual `pnpm verify` steps from a clean
worktree (branched from `integration/t3-t7` at `34917e5`, 27 commits ahead of
the A2-slice snapshot recorded further down this section) to refresh numbers
that had drifted. Per this sweep's own scope (docs only), nothing below was
acted on beyond recording it — no code or test was changed in response to
this run.

- Toolchain: Node `24.18.0`, pnpm `10.33.2`.
- Formatting and ESLint: passed.
- Dependency boundaries: 225 modules and 577 dependencies cruised with no
  violation; `boundaries:test` — five invalid fixture graphs were rejected.
- TypeScript project build and generated-schema check: passed.
- Vitest: 83/84 files and 1345/1346 tests passed with `--maxWorkers=4`. One
  test failed on every attempt in this sandboxed run (3/3, including alone
  and repeated): `packages/trusted-verifier/test/trusted-verifier.test.ts` >
  "settles by the termination deadline when an escaped descendant retains
  verifier pipes" (a detached-descendant/SIGKILL-timing case with a 30 ms
  inner deadline) — the assertion expects `runTrustedVerification` to reject,
  but in this environment it resolved with a result object showing
  `timedOut: true` instead. This is unmodified pre-existing test code, out of
  scope for a docs-only sweep; whether it reproduces outside this sandboxed
  run is unverified and not claimed either way.
- Vitest duration: approximately 83 seconds across repeated runs.
- `pnpm --filter @app-factory/oci-runner test` (package-local script,
  authoritative for that focused suite): 184/184, matching
  [`oci-no-network-validation.md`](../operations/oci-no-network-validation.md).
- Net: every `pnpm verify` step passed except the one vitest failure named
  above.

### 2026-08-14 A2 entrypoint-gate verification (historical, commit `26b57ee`)

Recorded at the time this slice landed; superseded by, but not contradicted
by, the re-verification above except where noted (module/dependency/test
counts have grown with the 27 later commits; the oci-runner count below was
itself later found stale and is corrected in the section above).

The authoritative `pnpm verify` passed on 2026-08-14 against the pre-commit
A2 entrypoint-gate candidate based on `26b57ee`. Local commit identifiers are
reported separately at handoff rather than used as a self-referential
verification identity. Any later executable, test, policy, or configuration
change invalidates these results and requires the gate to run again; a
documentation-only result record still requires formatting and diff
validation.

- Toolchain: Node `24.18.0`, pnpm `10.33.2`.
- Formatting and ESLint: passed.
- Dependency boundaries: 198 modules and 470 dependencies cruised with no
  violation; five invalid fixture graphs were rejected.
- TypeScript project build and generated-schema check: passed.
- Vitest: 70/70 files and 924/924 tests passed with `--maxWorkers=4`.
- Vitest duration: 83.21 seconds.
- Full `pnpm verify`: 92.43 seconds real, 89.00 seconds user, 59.72 seconds
  system.
- Focused checks: the two changed daemon suites (`daemon-entrypoint` and
  `local-execution-profile`) passed 16/16 in isolation before the full gate.
- Recorded pre-current-tree live no-network smoke:
  `/Users/pchordia/Documents/oci-runner-smoke-hardening-Vhj2LP/smoke-summary.json`,
  digest
  `sha256:3ba392b0012dd11e89d0647b434a33ce94eae414733bec5b1ceb942058b8cc96`.

This slice changed only the daemon entrypoint profile routing, the
attestation gate in the profile loader, their tests, the recorded attestation
file, and this ledger. One pre-existing entrypoint test assertion was updated
because the profile loader now reads the configuration file first and reports a
non-private file as `current-user-owned mode-0600` instead of the fixture
loader's wording; the fail-closed behavior is unchanged. No assertion was
weakened and no timeout, quality threshold, fixture, sandbox rule, or
worker-cap change was made; the approved worker cap remains four.

Eight package-local `test` scripts currently use repository-relative paths even
though pnpm launches them from the package directory: credential broker,
execution engine, Git workspace, portfolio, process supervisor, project SDK,
service manager, and simulator runner. Root `pnpm test` still discovers their
tests. The corrected OCI package-local script passed 184/184. The eight unrelated
package-local script defects were not modified in this slice; use the root-level
commands in the operator runbook rather than treating another package-local "no
test files found" result as success.

## Gate register

The following work cannot be silently inferred from the broad roadmap request:

- protected enrollment/test-harness changes and any further Hindsight mutation
  or apply operation beyond the recorded local checkpoint;
- **CLOSED by owner decision 2026-08-14** — operator enablement of the Codex
  path through `daemon-entrypoint`. The decision, accepted gaps, and standing
  compensating controls are recorded in
  [`containment-attestation-2026-08-14.json`](../operations/containment-attestation-2026-08-14.json),
  and the loader enforces that record structurally: real-identity profile modes
  refuse to load without a valid attestation file. This closure does not
  authorize any of the still-open gates below, and no live/paid run has
  occurred yet;
- further live-container execution beyond the recorded no-network runner smoke,
  live-model execution, operator/production enablement of the injected OCI V3
  path, credential/egress enablement, or treating deterministic composition as
  production containment;
- quality policy, baseline, threshold, CI, signing, or release-control changes;
- daemon startup consumption of a restored-runtime recovery quarantine;
- kernel approval registration and atomic consumption for lesson adoption;
- Jira/GitHub sandbox writes and each exact merge approval;
- Apple account, agreement/2FA, signing, upload, tester, and device actions; and
- website repository enrollment, status wording, merge, and deployment.

These gates prevent “component exists” from becoming an unauthorized external
mutation or a false TestFlight success.
