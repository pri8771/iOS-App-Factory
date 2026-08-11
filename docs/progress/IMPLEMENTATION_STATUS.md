# Implementation status

Updated: 2026-08-10

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
The CLI and MCP server use the same typed command client. The dashboard server,
portfolio model, LaunchAgent planner, verified execution engine, external-effect
worker, Quality Kit, project scanner, Jira/GitHub planning, simulator runner,
learning engine, recovery manager, and website lifecycle module also exist as
tested components, with the limitations below.

It cannot honestly produce a Hindsight TestFlight build yet. No Hindsight file,
Jira project, GitHub remote, Apple resource, signing identity, TestFlight build,
or website repository has been mutated by this implementation.

## Weeks 1–16 traceability

<!-- prettier-ignore -->
| Week | Honest status | Implemented modules and tests | Missing connection or gate |
| --- | --- | --- | --- |
| 1 — executable foundation | **Implemented** | Versioned contracts and schemas in [`packages/contracts`](../../packages/contracts), durable SQLite kernel in [`packages/kernel`](../../packages/kernel), Codex boundary in [`packages/agent-runner`](../../packages/agent-runner), and Swift fixture/test utilities in [`packages/testkit`](../../packages/testkit). Tests: [`contracts`](../../packages/contracts/test), [`kernel`](../../packages/kernel/test), [`agent-runner`](../../packages/agent-runner/test), [`testkit`](../../packages/testkit/test). | A clean full-repository verification run is still required after the current integration work is finalized. |
| 2 — restart-safe fake execution | **Implemented for the local fake path** | The daemon, authenticated Unix socket, command journal, scheduler, CLI, cancellation, leases, fencing, and restart tests live in [`apps/daemon`](../../apps/daemon), [`apps/cli`](../../apps/cli), [`packages/command-client`](../../packages/command-client), [`packages/scheduler`](../../packages/scheduler), and [`packages/process-supervisor`](../../packages/process-supervisor). | The daemon intentionally uses `DeterministicFakeExecutor`; the process-supervisor package is not the daemon's production coding executor. |
| 3 — real Codex coding path | **Dormant / not wired** | Factory-owned worktrees and broker commits are in [`packages/git-workspace`](../../packages/git-workspace); verification orchestration is in [`packages/execution-engine`](../../packages/execution-engine), [`packages/trusted-verifier`](../../packages/trusted-verifier), [`packages/independent-review`](../../packages/independent-review), and [`packages/evidence-store`](../../packages/evidence-store). Their package tests cover protected paths, exact Git bindings, independent review, and evidence tampering. | The daemon scheduler does not invoke this chain, so `factory run` performs the fake workflow and does not author a real source change. |
| 4 — reconciliation, review, and proof | **Dormant / not fully wired** | Marker-ref commit reconciliation and evidence verification are tested in [`execution-engine/test`](../../packages/execution-engine/test) and [`git-workspace/test`](../../packages/git-workspace/test). Backup/restore primitives are tested in [`recovery-manager/test`](../../packages/recovery-manager/test). | There is no `factory evidence verify` CLI command. Restored-runtime quarantine is not enforced at daemon startup; that release/recovery connection is **blocked by protected approval**. The complete forced-crash walking-slice gate has not been accepted. |
| 5 — operational clients and enrollment primitives | **Partly implemented; partly dormant/blocked** | CLI, MCP, and loopback dashboard clients are in [`apps/cli`](../../apps/cli), [`apps/mcp`](../../apps/mcp), and [`apps/dashboard`](../../apps/dashboard). Read-only LaunchAgent plan/status is in [`packages/service-manager`](../../packages/service-manager). Enrollment discovery is in [`packages/project-sdk`](../../packages/project-sdk). | MCP exposes task/attempt/reconcile commands, not the full proposed project/evidence surface. The dashboard is a library without a packaged launcher. LaunchAgent install/uninstall/logs are deliberately unavailable pending an explicit human installation gate. The scanner suite currently has 2 failing cases, so enrollment is not ready for Hindsight. |
| 6 — safe Hindsight enrollment | **Blocked — explicit Hindsight/user approval** | The scanner models preservation snapshots, Git/Xcode/Swift discovery, rules, conflicts, capability/readiness, and proposal-only enrollment plans in [`project-sdk`](../../packages/project-sdk). | Hindsight remains read-only. Its dirty-worktree preservation choice, clean base SHA, product/design authority, manifest, pilot scope, and protected enrollment/test changes have not been approved or produced. |
| 7 — durable Jira/GitHub boundary | **Implemented for deterministic planning/read-only observation; mutations dormant** | Provider-neutral Jira/GitHub planning, revision/base drift, operation markers, and cross-project work packages are in [`packages/work-tracking-integrations`](../../packages/work-tracking-integrations). Generic adapter validation, Keychain reads, durable effects, and dispatch/reconciliation are in [`packages/adapter-sdk`](../../packages/adapter-sdk), [`packages/credential-broker`](../../packages/credential-broker), [`packages/kernel`](../../packages/kernel), and [`packages/effect-worker`](../../packages/effect-worker), with tests in each package. | There is no configured Jira or GitHub HTTP adapter, no live credential reference, and no approved provision/apply operation. |
| 8 — remote sandbox and failure injection | **Blocked — external accounts and exact mutation approvals** | The generic effect worker tests timeout, late completion, duplicate/reconciliation behavior, fencing, adapter provenance, evidence sanitization, and manual intervention in [`effect-worker/test`](../../packages/effect-worker/test); provider-neutral marker reconciliation is tested in [`work-tracking-integrations/test`](../../packages/work-tracking-integrations/test). | No disposable Jira/GitHub sandbox has been created or mutated. Live provider conformance and failure injection cannot be claimed from fakes alone. |
| 9 — first Hindsight delivery slice | **Blocked — Weeks 6 and 8 gates plus merge approval** | The local execution, work-tracking, effect, and evidence components needed by this slice exist. | No Hindsight Jira issue, Factory branch, PR, check, merge, or post-merge verification has run. |
| 10 — Quality Kit foundation | **Implemented generically; dormant for Hindsight** | Release/experience/finding/certification models, route-state coverage, deterministic presentation matrices, pixel comparisons, operator findings, and mixed-generation rejection live in [`packages/quality`](../../packages/quality). Lease-bound visible simulator sessions live in [`packages/simulator-runner`](../../packages/simulator-runner). Tests: [`quality/test`](../../packages/quality/test) and [`simulator-runner/test`](../../packages/simulator-runner/test). | The Hindsight route/state inventory, deterministic app fixtures, simulator evidence, filmstrips, and approved visual baseline do not exist. The known-bad test is a deterministic synthetic Hindsight-shaped fixture, not evidence from the current checkout. |
| 11 — common-sense quality and UI coherence | **Dormant for Hindsight; blocked — protected quality approval** | Generic checks reject mixed generations, legacy references, raw tokens, missing public-state observations, expired exceptions, clipped content, missing accessibility semantics, stale evidence, and unresolved blocking findings. | The checks are not connected to a Hindsight build or its complete journeys. Baseline, gate-threshold, test-harness, and visual-authority changes are protected and need separate approval. |
| 12 — Hindsight remediation and candidate | **Blocked — Hindsight scope and quality gates** | Finding closure requires root cause and regression evidence; candidate certification is SHA-, tree-, policy-, manifest-, and evidence-bound in [`packages/quality`](../../packages/quality). | No Hindsight scope freeze, remediation PRs, complete quality matrix, accepted candidate SHA, or verified Jira completion exists. |
| 13 — Apple adapter and signed archive | **Contracts only; blocked — protected release/signing approval and Apple setup** | Release manifests and sequential certification stages are defined in [`packages/contracts/src/v1/release.ts`](../../packages/contracts/src/v1/release.ts) and [`packages/quality/src/certification.ts`](../../packages/quality/src/certification.ts). The generic adapter/effect boundary can host a future Apple adapter. | There is no Apple adapter, signing/archive/export implementation, build-number allocator, metadata preflight, signed archive, or release-specific upload approval. Release and signing logic is protected. Apple Developer/App Store Connect access and agreements are external gates. |
| 14 — Internal TestFlight | **Blocked — Week 13 and external Apple account** | Contracts can represent uploaded, processing, and internal-TestFlight-available stages and lifecycle events. | No upload, processing poll, compliance answer, tester-group assignment, App Store build reconciliation, or signed availability event has run. |
| 15 — device proof and command center v1 | **Partly implemented; dormant/blocked** | The dashboard has attempt actions and an injected portfolio view; [`packages/portfolio`](../../packages/portfolio) derives multi-project health, analytics freshness, and conflict-free scheduling proposals. The simulator runner supports visible, commentable sessions. | The dashboard does not yet expose authoritative Jira/PR/quality/approval/release panels and has no packaged launcher. Portfolio analytics has no live provider. Scheduling is proposal-only. There is no TestFlight build or physical-device attestation. |
| 16 — learning, recovery, and second-project proof | **Implemented as dormant modules; blocked at adoption/startup gates** | Reviewed lesson proposals/replay/adoption plans are in [`packages/learning-engine`](../../packages/learning-engine); recovery bundles/quarantine are in [`packages/recovery-manager`](../../packages/recovery-manager); an approval-required private-beta website PR plan is in [`packages/website-lifecycle`](../../packages/website-lifecycle). | Kernel registration and atomic approval consumption for `lesson.policy-adopt` are **blocked by protected approval**. Daemon consumption of recovery quarantine is also **blocked by protected approval**. No second project has passed enrollment, and the website module has no enrolled repository/configuration or deployment approval. |

## Current verification exception

The focused scanner command and the unrestricted full repository gate were run
on 2026-08-10:

```sh
pnpm exec vitest run packages/project-sdk/test/scanner.test.ts
```

Result: 10 of 12 tests passed. The clean Xcode fixture is classified
`invalid` instead of `verified`, and the linked-worktree fixture is not ready.
Until those cases are repaired under the approved enrollment/testing scope, do
not scan Hindsight and do not describe the enrollment gate as green.

The final unrestricted `pnpm verify` run completed every static gate and passed
461 of 463 tests; only those same two scanner cases failed. It took 27.98
seconds wall time. Excluding only the blocked scanner suite, the timed test run
passed 451 of 451 tests in 21.37 seconds. These timings are observations, not a
new performance threshold.

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
