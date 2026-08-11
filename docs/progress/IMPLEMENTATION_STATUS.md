# Implementation status

Updated: 2026-08-11

This ledger maps the promised Weeks 1–16 capabilities to what is actually in
the repository. A package with unit tests is not treated as an operational
workflow unless the daemon or an operator entrypoint invokes it.

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
and immutable evidence. A durable host process supervisor now records exact
intent, process identity, bounded output, cancellation, and terminal receipts;
the daemon withholds command readiness until composed executor/agent startup
recovery completes. A dormant Codex conformance adapter can drive that
supervisor and must publish a V2 protocol closure when enrolled, including trusted
executable/model/CLI identity. It has passed a no-network fake-executable path,
not a paid or real-model run, and is intentionally unreachable from the
operator daemon entrypoint until ADR 0002 production containment closes. A separate
dormant [`oci-runner`](../../packages/oci-runner) implements exact no-network
container intents, isolation attestation, and durable lifecycle reconciliation.
Its fake/injected-engine suite passes 93/93. A separate live Colima `OciRunner`
smoke completed a natural lifecycle and recovered from a persisted launch
marker after a strict-inspection process failure. It pinned Docker CLI `29.6.1`,
server `29.5.2`, and
`node@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`;
the successful run left durable terminal/removal/receipt evidence and no
residual container. No live model, daemon composition, or OCI evidence-journal
V3 has passed. The autonomous watchdog/output bound, controlled egress/auth,
autonomous stale-lock recovery, failure quarantine/reaping, effective
seccomp/AppArmor digest, host-bind quota/disk bound, and remaining real-engine
failure paths are also open. Cross-process reconcile/cancel calls are serialized
by a private exact-identity operation lock; ambiguous dispatched creates fail
closed rather than becoming a false pre-start cancellation. The CLI, MCP server,
and packaged loopback dashboard use the same typed command client. The daemon publishes a
transactionally maintained local portfolio snapshot; unavailable provider
values remain null. The remaining generic modules exist with the limitations
below.

It cannot honestly produce a Hindsight TestFlight build yet. The only Hindsight
write was the user-authorized local checkpoint branch and commit that preserved
already-present worktree contents; it was not pushed. The subsequent Factory
scan and trusted Xcode verification were read-only and found a deterministic
release-blocking crash. No enrollment plan or repair has been applied. No Jira
project, GitHub remote, Apple resource, signing identity, TestFlight build, or
website repository has been mutated. See the
[bound Hindsight status](HINDSIGHT_ENROLLMENT_STATUS.md).

## Weeks 1–16 traceability

<!-- prettier-ignore -->
| Week | Honest status | Implemented modules and tests | Missing connection or gate |
| --- | --- | --- | --- |
| 1 — executable foundation | **Implemented** | Versioned contracts and schemas in [`packages/contracts`](../../packages/contracts), durable SQLite kernel in [`packages/kernel`](../../packages/kernel), Codex boundary in [`packages/agent-runner`](../../packages/agent-runner), and Swift fixture/test utilities in [`packages/testkit`](../../packages/testkit/test). Tests: [`contracts`](../../packages/contracts/test), [`kernel`](../../packages/kernel/test), [`agent-runner`](../../packages/agent-runner/test), [`testkit`](../../packages/testkit/test). | The authoritative post-OCI/scanner root gate is green; operational gaps are recorded in the later rows. |
| 2 — restart-safe fake execution | **Implemented for fake execution and trusted, non-detaching process supervision** | The daemon, authenticated Unix socket, command journal, scheduler, CLI, cancellation, leases, fencing, bounded response replay, and restart tests live in [`apps/daemon`](../../apps/daemon), [`apps/cli`](../../apps/cli), [`packages/command-client`](../../packages/command-client), [`packages/scheduler`](../../packages/scheduler), and [`packages/process-supervisor`](../../packages/process-supervisor). Durable supervision binds immutable intent, launch claim, execution permission, V2 process identity, exact cwd/environment/argv/stdin, bounded output spools, cancellation, receipts, and reconciliation. | Process groups are not containment: a detached descendant can escape. Darwin `ps lstart` identity is only second-resolution, and stale locks or unprovable identity deliberately require operator intervention. |
| 3 — real coding path | **Deterministic Swift slice implemented; Codex/OCI coding plane dormant and partial** | The supported Swift Greeter profile connects [`git-workspace`](../../packages/git-workspace), [`execution-engine`](../../packages/execution-engine), [`trusted-verifier`](../../packages/trusted-verifier), [`independent-review`](../../packages/independent-review), and [`evidence-store`](../../packages/evidence-store). The Codex adapter additionally pins executable digest, CLI version, model, strict invocation/output schema/environment, and supervisor-bound V2 evidence. A no-network fake executable has passed the actual supervisor → adapter → trusted Swift verification → review → broker commit path. [`oci-runner`](../../packages/oci-runner) adds pinned no-network container controls and a 93/93 fake/injected-engine suite. A current hardened-tree live Colima runner smoke completed natural success, and a separate persisted-launch-marker attempt reconciled without relaunch after strict inspection failed. | Neither the Codex profile nor OCI runner is exposed by `daemon-entrypoint`. No paid/real-model or autonomous application-development run has passed. The live smoke is not production containment. Missing OCI gates include the autonomous PID 1 watchdog/total-output proof, controlled model egress/auth, autonomous stale-lock recovery, post-launch quarantine/reaping, daemon/journal V3 composition, effective seccomp/AppArmor digest, host-bind quota/disk-exhaustion bound, and remaining real-engine failure paths. Trusted-verifier hard-kill recovery also remains open. |
| 4 — reconciliation, review, and proof | **Walking-slice reconciliation and startup recovery barrier implemented; containment/restore gates remain** | Mirror/worktree publication intents reconcile creation crashes; marker refs reconcile commit publication; V2 agent-result journals replay without relaunch; CLI and MCP expose bounded evidence list/inspect/verify; manifests and every referenced blob are digest-checked. Commands return retryable `daemon.starting` until executor/agent recovery completes, and ambiguous recovery releases daemon ownership. The dormant OCI library separately reconciles private `planned → created → running → terminal → removed` artifacts under failure injection, serializes cross-process reconcile/cancel calls, and blocks ambiguous create dispatch. Its live smoke persisted terminal/removal/receipt evidence, proved exact cleanup, and recovered from a persisted launch marker without duplication. Backup/restore primitives are tested in [`recovery-manager/test`](../../packages/recovery-manager/test). | Restored-runtime quarantine consumption remains **blocked by protected approval**. The OCI lifecycle is not daemon- or scheduler-wired and has no journal V3. Post-launch failure quarantine/reaping and real-engine timeout/overflow/stop/kill cases remain unproved. Trusted-verifier hard-kill adoption, autonomous stale-lock recovery, and the complete hard-kill/sleep/provider-failure soak matrix have not passed. |
| 5 — operational clients and enrollment primitives | **Partly implemented; partly dormant/blocked** | CLI, MCP, and the packaged loopback dashboard share the typed daemon client. Evidence and portfolio reads are available through CLI/MCP, and the launcher renders a digest-verified, migration-backed local portfolio projection. The launcher validates private path configuration, uses a one-use browser token plus separate HttpOnly session, and shuts down gracefully. Read-only LaunchAgent plan/status is in [`packages/service-manager`](../../packages/service-manager); enrollment discovery and realistic Xcode/PBX regression fixtures are in [`packages/project-sdk`](../../packages/project-sdk). The corrected fixture received real `xcodebuild -list` and `xcodebuild build-for-testing` validation, and the preservation-bound post-fix Hindsight scan completed without changing its checkout after the authorized checkpoint. | Project/enrollment commands and LaunchAgent install/uninstall/logs remain unavailable pending their gates. The post-fix production scan verified one Xcode container and one shared scheme with no Xcode gaps; its only blockers are the legacy Factory layout, canonical rule declarations, and Cursor authority binding. |
| 6 — safe Hindsight enrollment | **Preservation and read-only discovery completed; enrollment blocked** | The user-authorized local branch `checkpoint/factory-enrollment-2026-08-11` and commit `c66c690c21c0d662fa623ea104bd8d5dc0a700c0` preserved the pre-enrollment tree without a remote push. The post-fix scan bound source `e96dff…`, inventory `21c1b7…`, and plan `b70311…`; all four preservation checks remained true, and no Xcode gap was reported. Trusted Xcode verification built the existing shared scheme and reported 126/127 tests; the isolated failing UI test reproduced a `TodayView.upcomingForecastsSection` array-subscript crash. A separate serial unit run passed 121/121. | No enrollment plan has been applied. The scan has exactly three rule/legacy blockers: legacy `.factory` migration, canonical rule declarations, and Cursor authority binding. Product/design authority, manifest, pilot scope, the deterministic production crash, and separate SwiftData concurrency/lifetime diagnostics also remain unresolved delivery inputs. The temporary `.xcresult` paths are observations, not a Factory evidence manifest or release certification. See [`HINDSIGHT_ENROLLMENT_STATUS.md`](HINDSIGHT_ENROLLMENT_STATUS.md). |
| 7 — durable Jira/GitHub boundary | **Implemented as deterministic code; provider runtime dormant** | Provider-neutral planning, revision/base drift, and work packages are in [`packages/work-tracking-integrations`](../../packages/work-tracking-integrations). Generic validation, Keychain references, durable effects, and dispatch are in [`packages/adapter-sdk`](../../packages/adapter-sdk), [`packages/credential-broker`](../../packages/credential-broker), [`packages/kernel`](../../packages/kernel), and [`packages/effect-worker`](../../packages/effect-worker). Strict injected-transport Jira Cloud/GitHub adapters, marker reconciliation, pagination, ETag/version handling, and read-only repository/PR/comment/check observations are in [`packages/provider-http-adapters`](../../packages/provider-http-adapters). | No trusted live HTTP transport is composed into the daemon, no live credential reference is configured, and no provision/apply operation is approved. Activation additionally requires immutable Jira tenant/URL/credential-origin binding, authenticated GitHub owner-node binding, payload-bound provider-neutral observations, and a contract-consistent Jira project marker. Jira issue-link and project-level remote-link intents also fail closed because v1 cannot express safe provider correlation/issue targeting; all gaps are documented in the adapter README. |
| 8 — remote sandbox and failure injection | **Blocked — external accounts and exact mutation approvals** | Generic effect-worker tests cover timeout, late completion, fencing, evidence sanitization, and manual intervention. Provider adapter fixtures additionally cover lost responses, read-only not-found reconciliation, marker collisions, malformed envelopes, host/path confinement, pagination, redaction/zeroization, and zero-call rejection of unsupported Jira intents. | No disposable Jira/GitHub sandbox has been created or mutated. The new provider suite used only injected in-memory transports; live conformance, provider resource counts, and external failure injection cannot be claimed from fakes. |
| 9 — first Hindsight delivery slice | **Blocked — Weeks 6 and 8 gates plus merge approval** | The local execution, work-tracking, effect, and evidence components needed by this slice exist. | The preservation checkpoint is not a delivery slice. No Hindsight Jira issue, Factory delivery branch, PR, check, merge, or post-merge verification has run. |
| 10 — Quality Kit foundation | **Implemented generically; dormant for Hindsight** | Release/experience/finding/certification models, route-state coverage, deterministic presentation matrices, pixel comparisons, operator findings, and mixed-generation rejection live in [`packages/quality`](../../packages/quality). Lease-bound visible simulator sessions live in [`packages/simulator-runner`](../../packages/simulator-runner). Tests: [`quality/test`](../../packages/quality/test) and [`simulator-runner/test`](../../packages/simulator-runner/test). | The Hindsight route/state inventory, deterministic app fixtures, simulator evidence, filmstrips, and approved visual baseline do not exist. The known-bad test is a deterministic synthetic Hindsight-shaped fixture, not evidence from the current checkout. |
| 11 — common-sense quality and UI coherence | **Dormant for Hindsight; blocked — protected quality approval** | Generic checks reject mixed generations, legacy references, raw tokens, missing public-state observations, expired exceptions, clipped content, missing accessibility semantics, stale evidence, and unresolved blocking findings. | The checks are not connected to a Hindsight build or its complete journeys. Baseline, gate-threshold, test-harness, and visual-authority changes are protected and need separate approval. |
| 12 — Hindsight remediation and candidate | **Blocked — Hindsight scope and quality gates** | Finding closure requires root cause and regression evidence; candidate certification is SHA-, tree-, policy-, manifest-, and evidence-bound in [`packages/quality`](../../packages/quality). | No Hindsight scope freeze, remediation PRs, complete quality matrix, accepted candidate SHA, or verified Jira completion exists. |
| 13 — Apple adapter and signed archive | **Contracts only; blocked — protected release/signing approval and Apple setup** | Release manifests and sequential certification stages are defined in [`packages/contracts/src/v1/release.ts`](../../packages/contracts/src/v1/release.ts) and [`packages/quality/src/certification.ts`](../../packages/quality/src/certification.ts). The generic adapter/effect boundary can host a future Apple adapter. | There is no Apple adapter, signing/archive/export implementation, build-number allocator, metadata preflight, signed archive, or release-specific upload approval. Release and signing logic is protected. Apple Developer/App Store Connect access and agreements are external gates. |
| 14 — Internal TestFlight | **Blocked — Week 13 and external Apple account** | Contracts can represent uploaded, processing, and internal-TestFlight-available stages and lifecycle events. | No upload, processing poll, compliance answer, tester-group assignment, App Store build reconciliation, or signed availability event has run. |
| 15 — device proof and command center v1 | **Partly implemented; dormant/blocked** | The packaged loopback dashboard has daemon health, attempt actions, one-use browser authentication, graceful shutdown, and a canonical-digest-verified local portfolio view. The daemon maintains bounded project execution summaries without rescanning all history. [`packages/portfolio`](../../packages/portfolio) separately derives planning health, analytics freshness, and conflict-free scheduling proposals. The simulator runner supports visible, commentable sessions. | Jira/PR/quality/approval/release panels and live analytics sources are not composed. Scheduling is proposal-only. There is no TestFlight build or physical-device attestation. |
| 16 — learning, recovery, and second-project proof | **Implemented as dormant modules; blocked at policy-adoption and restore gates** | Reviewed lesson proposals/replay/adoption plans are in [`packages/learning-engine`](../../packages/learning-engine); recovery bundles/quarantine are in [`packages/recovery-manager`](../../packages/recovery-manager); an approval-required private-beta website PR plan is in [`packages/website-lifecycle`](../../packages/website-lifecycle). Supervised-run startup recovery is connected for composed agents. | Kernel registration and atomic approval consumption for `lesson.policy-adopt` are **blocked by protected approval**. Daemon consumption of restored-runtime quarantine is also **blocked by protected approval**. No second project has passed enrollment, and the website module has no enrolled repository/configuration or deployment approval. |

## Repository verification

The authoritative `pnpm verify` passed on 2026-08-11 against the final
pre-commit candidate based on `0870cbb`. Local commit identifiers are reported
separately at handoff rather than used as a self-referential verification
identity. Any later executable, test, policy, or configuration change invalidates
these results and requires the gate to run again; a documentation-only result
record still requires formatting and diff validation.

- Toolchain: Node `24.18.0`, pnpm `10.33.2`.
- Formatting and ESLint: passed.
- Dependency boundaries: 195 modules and 459 dependencies cruised with no
  violation; five invalid fixture graphs were rejected.
- TypeScript project build and generated-schema check: passed.
- Vitest: 68/68 files and 801/801 tests passed with `--maxWorkers=4`.
- Vitest duration: 67.61 seconds.
- Full `pnpm verify`: 76.41 seconds real, 76.28 seconds user, 50.05 seconds
  system.
- Focused checks: Xcode scanner 20/20; OCI runner 93/93.
- Independent final OCI review: no P0/P1 finding.
- Current live no-network smoke:
  `/Users/pchordia/Documents/oci-runner-smoke-hardening-Vhj2LP/smoke-summary.json`,
  digest
  `sha256:3ba392b0012dd11e89d0647b434a33ce94eae414733bec5b1ceb942058b8cc96`.

No retries, extended deadlines, disabled isolation, reduced assertions, or
quality-threshold changes were used. The explicitly approved worker cap is four.

Eight package-local `test` scripts currently use repository-relative paths even
though pnpm launches them from the package directory: credential broker,
execution engine, Git workspace, portfolio, process supervisor, project SDK,
service manager, and simulator runner. Root `pnpm test` still discovers their
tests. The corrected OCI package-local script passed 93/93. The eight unrelated
package-local script defects were not modified in this slice; use the root-level
commands in the operator runbook rather than treating another package-local "no
test files found" result as success.

## Gate register

The following work cannot be silently inferred from the broad roadmap request:

- protected enrollment/test-harness changes and any further Hindsight mutation
  or apply operation beyond the recorded local checkpoint;
- further live-container execution beyond the recorded no-network runner smoke,
  live-model execution, OCI daemon composition, credential/egress enablement,
  or treating the dormant OCI slice as production containment;
- quality policy, baseline, threshold, CI, signing, or release-control changes;
- daemon startup consumption of a restored-runtime recovery quarantine;
- kernel approval registration and atomic consumption for lesson adoption;
- Jira/GitHub sandbox writes and each exact merge approval;
- Apple account, agreement/2FA, signing, upload, tester, and device actions; and
- website repository enrollment, status wording, merge, and deployment.

These gates prevent “component exists” from becoming an unauthorized external
mutation or a false TestFlight success.
