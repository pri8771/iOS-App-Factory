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
operator daemon entrypoint until ADR 0002 containment exists. The CLI, MCP
server, and packaged loopback dashboard use the same typed command client. The
daemon publishes a transactionally maintained local portfolio snapshot;
unavailable provider values remain null. The remaining generic modules exist
with the limitations below.

It cannot honestly produce a Hindsight TestFlight build yet. No Hindsight file,
Jira project, GitHub remote, Apple resource, signing identity, TestFlight build,
or website repository has been mutated by this implementation.

## Weeks 1–16 traceability

<!-- prettier-ignore -->
| Week | Honest status | Implemented modules and tests | Missing connection or gate |
| --- | --- | --- | --- |
| 1 — executable foundation | **Implemented** | Versioned contracts and schemas in [`packages/contracts`](../../packages/contracts), durable SQLite kernel in [`packages/kernel`](../../packages/kernel), Codex boundary in [`packages/agent-runner`](../../packages/agent-runner), and Swift fixture/test utilities in [`packages/testkit`](../../packages/testkit/test). Tests: [`contracts`](../../packages/contracts/test), [`kernel`](../../packages/kernel/test), [`agent-runner`](../../packages/agent-runner/test), [`testkit`](../../packages/testkit/test). | Static repository gates are green. The unrestricted test gate is 692/698; two protected scanner-fixture failures and four full-parallel load findings are recorded below. |
| 2 — restart-safe fake execution | **Implemented for fake execution and trusted, non-detaching process supervision** | The daemon, authenticated Unix socket, command journal, scheduler, CLI, cancellation, leases, fencing, bounded response replay, and restart tests live in [`apps/daemon`](../../apps/daemon), [`apps/cli`](../../apps/cli), [`packages/command-client`](../../packages/command-client), [`packages/scheduler`](../../packages/scheduler), and [`packages/process-supervisor`](../../packages/process-supervisor). Durable supervision binds immutable intent, launch claim, execution permission, V2 process identity, exact cwd/environment/argv/stdin, bounded output spools, cancellation, receipts, and reconciliation. | Process groups are not containment: a detached descendant can escape. Darwin `ps lstart` identity is only second-resolution, and stale locks or unprovable identity deliberately require operator intervention. |
| 3 — real coding path | **Deterministic Swift slice implemented; Codex conformance components dormant** | The supported Swift Greeter profile connects [`git-workspace`](../../packages/git-workspace), [`execution-engine`](../../packages/execution-engine), [`trusted-verifier`](../../packages/trusted-verifier), [`independent-review`](../../packages/independent-review), and [`evidence-store`](../../packages/evidence-store). The Codex adapter additionally pins executable digest, CLI version, model, strict invocation/output schema/environment, and supervisor-bound V2 evidence. A no-network fake executable has passed the actual supervisor → adapter → trusted Swift verification → review → broker commit path. | `daemon-entrypoint` does not expose the Codex profile. No paid/real-model or autonomous application-development run has passed. General coding remains blocked on ADR 0002 containment and trusted-verifier hard-kill recovery. |
| 4 — reconciliation, review, and proof | **Walking-slice reconciliation and startup recovery barrier implemented; containment/restore gates remain** | Mirror/worktree publication intents reconcile creation crashes; marker refs reconcile commit publication; V2 agent-result journals replay without relaunch; CLI and MCP expose bounded evidence list/inspect/verify; manifests and every referenced blob are digest-checked. Commands return retryable `daemon.starting` until executor/agent recovery completes, and ambiguous recovery releases daemon ownership. Backup/restore primitives are tested in [`recovery-manager/test`](../../packages/recovery-manager/test). | Restored-runtime quarantine consumption remains **blocked by protected approval**. Trusted-verifier hard-kill adoption, escaped-descendant containment, stale-lock recovery, and the complete hard-kill/sleep/provider-failure soak matrix have not passed. |
| 5 — operational clients and enrollment primitives | **Partly implemented; partly dormant/blocked** | CLI, MCP, and the packaged loopback dashboard share the typed daemon client. Evidence and portfolio reads are available through CLI/MCP, and the launcher renders a digest-verified, migration-backed local portfolio projection. The launcher validates private path configuration, uses a one-use browser token plus separate HttpOnly session, and shuts down gracefully. Read-only LaunchAgent plan/status is in [`packages/service-manager`](../../packages/service-manager); enrollment discovery is in [`packages/project-sdk`](../../packages/project-sdk). | Project/enrollment commands and LaunchAgent install/uninstall/logs remain unavailable pending their gates. Two scanner tests still use an invalid synthetic “complete” Xcode fixture; production correctly fails it closed, so protected fixture hardening is required before Hindsight scanning can be declared green. |
| 6 — safe Hindsight enrollment | **Blocked — explicit Hindsight/user approval** | The scanner models preservation snapshots, Git/Xcode/Swift discovery, rules, conflicts, capability/readiness, and proposal-only enrollment plans in [`project-sdk`](../../packages/project-sdk). | Hindsight remains read-only. Its dirty-worktree preservation choice, clean base SHA, product/design authority, manifest, pilot scope, and protected enrollment/test changes have not been approved or produced. |
| 7 — durable Jira/GitHub boundary | **Implemented as deterministic code; provider runtime dormant** | Provider-neutral planning, revision/base drift, and work packages are in [`packages/work-tracking-integrations`](../../packages/work-tracking-integrations). Generic validation, Keychain references, durable effects, and dispatch are in [`packages/adapter-sdk`](../../packages/adapter-sdk), [`packages/credential-broker`](../../packages/credential-broker), [`packages/kernel`](../../packages/kernel), and [`packages/effect-worker`](../../packages/effect-worker). Strict injected-transport Jira Cloud/GitHub adapters, marker reconciliation, pagination, ETag/version handling, and read-only repository/PR/comment/check observations are in [`packages/provider-http-adapters`](../../packages/provider-http-adapters). | No trusted live HTTP transport is composed into the daemon, no live credential reference is configured, and no provision/apply operation is approved. Activation additionally requires immutable Jira tenant/URL/credential-origin binding, authenticated GitHub owner-node binding, payload-bound provider-neutral observations, and a contract-consistent Jira project marker. Jira issue-link and project-level remote-link intents also fail closed because v1 cannot express safe provider correlation/issue targeting; all gaps are documented in the adapter README. |
| 8 — remote sandbox and failure injection | **Blocked — external accounts and exact mutation approvals** | Generic effect-worker tests cover timeout, late completion, fencing, evidence sanitization, and manual intervention. Provider adapter fixtures additionally cover lost responses, read-only not-found reconciliation, marker collisions, malformed envelopes, host/path confinement, pagination, redaction/zeroization, and zero-call rejection of unsupported Jira intents. | No disposable Jira/GitHub sandbox has been created or mutated. The new provider suite used only injected in-memory transports; live conformance, provider resource counts, and external failure injection cannot be claimed from fakes. |
| 9 — first Hindsight delivery slice | **Blocked — Weeks 6 and 8 gates plus merge approval** | The local execution, work-tracking, effect, and evidence components needed by this slice exist. | No Hindsight Jira issue, Factory branch, PR, check, merge, or post-merge verification has run. |
| 10 — Quality Kit foundation | **Implemented generically; dormant for Hindsight** | Release/experience/finding/certification models, route-state coverage, deterministic presentation matrices, pixel comparisons, operator findings, and mixed-generation rejection live in [`packages/quality`](../../packages/quality). Lease-bound visible simulator sessions live in [`packages/simulator-runner`](../../packages/simulator-runner). Tests: [`quality/test`](../../packages/quality/test) and [`simulator-runner/test`](../../packages/simulator-runner/test). | The Hindsight route/state inventory, deterministic app fixtures, simulator evidence, filmstrips, and approved visual baseline do not exist. The known-bad test is a deterministic synthetic Hindsight-shaped fixture, not evidence from the current checkout. |
| 11 — common-sense quality and UI coherence | **Dormant for Hindsight; blocked — protected quality approval** | Generic checks reject mixed generations, legacy references, raw tokens, missing public-state observations, expired exceptions, clipped content, missing accessibility semantics, stale evidence, and unresolved blocking findings. | The checks are not connected to a Hindsight build or its complete journeys. Baseline, gate-threshold, test-harness, and visual-authority changes are protected and need separate approval. |
| 12 — Hindsight remediation and candidate | **Blocked — Hindsight scope and quality gates** | Finding closure requires root cause and regression evidence; candidate certification is SHA-, tree-, policy-, manifest-, and evidence-bound in [`packages/quality`](../../packages/quality). | No Hindsight scope freeze, remediation PRs, complete quality matrix, accepted candidate SHA, or verified Jira completion exists. |
| 13 — Apple adapter and signed archive | **Contracts only; blocked — protected release/signing approval and Apple setup** | Release manifests and sequential certification stages are defined in [`packages/contracts/src/v1/release.ts`](../../packages/contracts/src/v1/release.ts) and [`packages/quality/src/certification.ts`](../../packages/quality/src/certification.ts). The generic adapter/effect boundary can host a future Apple adapter. | There is no Apple adapter, signing/archive/export implementation, build-number allocator, metadata preflight, signed archive, or release-specific upload approval. Release and signing logic is protected. Apple Developer/App Store Connect access and agreements are external gates. |
| 14 — Internal TestFlight | **Blocked — Week 13 and external Apple account** | Contracts can represent uploaded, processing, and internal-TestFlight-available stages and lifecycle events. | No upload, processing poll, compliance answer, tester-group assignment, App Store build reconciliation, or signed availability event has run. |
| 15 — device proof and command center v1 | **Partly implemented; dormant/blocked** | The packaged loopback dashboard has daemon health, attempt actions, one-use browser authentication, graceful shutdown, and a canonical-digest-verified local portfolio view. The daemon maintains bounded project execution summaries without rescanning all history. [`packages/portfolio`](../../packages/portfolio) separately derives planning health, analytics freshness, and conflict-free scheduling proposals. The simulator runner supports visible, commentable sessions. | Jira/PR/quality/approval/release panels and live analytics sources are not composed. Scheduling is proposal-only. There is no TestFlight build or physical-device attestation. |
| 16 — learning, recovery, and second-project proof | **Implemented as dormant modules; blocked at policy-adoption and restore gates** | Reviewed lesson proposals/replay/adoption plans are in [`packages/learning-engine`](../../packages/learning-engine); recovery bundles/quarantine are in [`packages/recovery-manager`](../../packages/recovery-manager); an approval-required private-beta website PR plan is in [`packages/website-lifecycle`](../../packages/website-lifecycle). Supervised-run startup recovery is connected for composed agents. | Kernel registration and atomic approval consumption for `lesson.policy-adopt` are **blocked by protected approval**. Daemon consumption of restored-runtime quarantine is also **blocked by protected approval**. No second project has passed enrollment, and the website module has no enrolled repository/configuration or deployment approval. |

## Current verification exception

The scanner suite and unrestricted full repository gate were run on 2026-08-11:

```sh
pnpm exec vitest run packages/project-sdk/test/scanner.test.ts
```

Result: 10 of 12 tests passed. Both failures share the synthetic “complete
project” fixture: it contains an unlinked six-character Xcode root object,
empty schemes, test classes without executable tests, and a CI job with no
step. The fail-closed scanner correctly classifies it as invalid, which also
makes the linked-worktree case not ready. Until that protected fixture is made
realistic, do not scan Hindsight and do not describe enrollment as green.

The post-hardening unrestricted `pnpm verify` run completed every static gate
and passed 692 of 698 tests. It took 82.63 seconds wall time (Vitest duration
72.75 seconds).
Two failures were the scanner cases above. Four additional tests hit their
five-second test deadlines or a load-sensitive escaped-descendant branch under
unrestricted parallel load: two execution-engine cases, one process-supervisor
overflow case, and one trusted-verifier case. A bounded sequential rerun of
those three files passed 36 of 36 in 32.94 seconds wall time (Vitest duration
32.60 seconds), so they are recorded as
parallel-saturation/harness findings rather than silently called green.

Excluding only the protected scanner suite and bounding Vitest to four workers,
the post-hardening timed run passed 686 of 686 tests in 74.39 seconds (Vitest
duration 74.07 seconds). The daemon and process-supervisor slice separately
passed 168 of 168 tests in 67.27 seconds. The no-network fake Codex test
traversing the real supervisor, V2
evidence, trusted Swift verifier, reviewer, and broker commit passed in the same
suite. These timings are observations, not a new performance threshold. The
protected test harness must be separately approved before changing its worker
policy or five-second deadlines.

The final repository gate remains `pnpm verify`; historical test counts or a
green package subset do not replace it.

Eight package-local `test` scripts currently use repository-relative paths even
though pnpm launches them from the package directory: credential broker,
execution engine, Git workspace, portfolio, process supervisor, project SDK,
service manager, and simulator runner. Root `pnpm test` still discovers their
tests. Until the protected test-harness change is approved, use the root-level
commands in the operator runbook rather than treating a package-local "no test
files found" result as success.

## Gate register

The following work cannot be silently inferred from the broad roadmap request:

- protected enrollment/test-harness changes and any Hindsight apply operation;
- quality policy, baseline, threshold, CI, signing, or release-control changes;
- daemon startup consumption of a restored-runtime recovery quarantine;
- kernel approval registration and atomic consumption for lesson adoption;
- Jira/GitHub sandbox writes and each exact merge approval;
- Apple account, agreement/2FA, signing, upload, tester, and device actions; and
- website repository enrollment, status wording, merge, and deployment.

These gates prevent “component exists” from becoming an unauthorized external
mutation or a false TestFlight success.
