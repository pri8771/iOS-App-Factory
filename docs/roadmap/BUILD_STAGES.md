# Dependency-ordered build stages

These are capability stages, not calendar promises.

> **2026-08-14 re-baseline note:** `FIRST_4_WEEKS.md`, `WEEKS_5_TO_16.md`, and
> `DETAILED_BACKLOG_WEEKS_5_TO_16.md` were originally written as a committed
> calendar (Week 1 = August 10–14, Week 2 = August 17–21, and so on). Actual
> delivery order and pace diverged from that calendar almost immediately —
> [`docs/progress/IMPLEMENTATION_STATUS.md`](../progress/IMPLEMENTATION_STATUS.md)
> already marks several rows as Implemented while their original calendar
> dates are still in the future, for example original "Week 2" (dated August
> 17–21) and original "Week 7" (dated September 21–25). The three documents
> below are kept as the historical planning record — their
> task breakdowns, dependencies, and exit-gate intent are still accurate
> engineering content — but their dates and week numbers are no longer a
> schedule anyone is tracking against. This file's stage numbering (Stage
> 0–8) is the current authoritative sequencing; `IMPLEMENTATION_STATUS.md` is
> the current authoritative status. Narrower exit gates in the historical
> documents still describe real, still-relevant completion criteria for their
> corresponding stage above; they just do not carry committed dates anymore.

> **2026-08-16 product-roadmap note:** The stages below remain the current
> engineering sequencing for the Gen 4 kernel and daemon this document
> describes. For the Gen 5 product surface — the Studio Mac app — the current
> roadmap is [`docs/roadmap/STUDIO_PHASES.md`](STUDIO_PHASES.md), following
> the owner's 2026-08-16 decision recorded in
> [ADR 0004](../architecture/0004-studio-mac-app.md). Stage 7's plan to grow
> `apps/dashboard` into "the full supported local command center" below is
> superseded by that decision; the dashboard is demoted to a debug surface
> and Studio Phases 1–6 take its place as the client-experience plan.

## Stage 0 — Foundation and contracts

Output:

- Greenfield repository and canonical engineering rules.
- Architecture decisions and module boundaries.
- Node/toolchain preflight and a checked-in Node 24 LTS version pin.
- Versioned schemas for `Command`, `ProjectManifest`, `TaskSpec`,
  `ExecutionAttempt`, `AgentRunSpec`, `AgentEvent`, `AgentRunResult`,
  `ExternalEffect`, `Evidence`, `Finding`, `Approval`, `QualityReport`,
  `ReleaseManifest`, `PolicyLock`, and `ModuleManifest`.
- A fixture project and migration test harness.
- Mechanical dependency-direction enforcement between clients, daemon, kernel,
  runners, adapters, modules, quality, and project packages.

Exit: a clean clone can install, build, typecheck, and test; invalid contracts
fail before state is written.

## Stage 1 — Durable local execution kernel

Output:

- SQLite migrations, WAL/integrity/backup behavior, append-only events, and
  materialized attempt state.
- Guarded transitions, leases, heartbeats, monotonic fencing tokens, retries,
  cancellation, approvals, and transactional outbox.
- `factory run/status/pause/resume/reconcile` commands.
- Thin MCP and dashboard clients for status, start, pause, and event streaming.
- Kill/restart, stale-process, duplicate-delivery, and disk-failure tests.

Exit: a synthetic multi-step attempt survives forced termination and resumes
without lost evidence, stale-fence mutation, or duplicate logical effects.

## Stage 2 — Credential-minimized agent runner

Output:

- Factory-managed clean mirrors and explicit-base-SHA worktrees.
- Headless Codex and later Claude adapters using versioned run contracts.
- Sanitized environments, process-group control, time/turn/cost boundaries,
  structured events, cancellation, and clarification/login blocking.
- Per-attempt supervisor processes with replayable spools and orphan recovery.
- Trusted checks and independent read-only review outside the writable worktree.

Exit: one fixture-backed task reaches a verified local commit after the
initiating terminal closes; prompt injection and protected-path attacks fail.

## Stage 3 — Existing-project enrollment and Hindsight pilot contract

Output:

- `factory enroll plan/apply/verify` with native/adaptable/blocked results.
- Read-only discovery of build commands, routes, screens, existing rules,
  integrations, quality gaps, and dirty state.
- Hindsight `ProjectManifest`, one approved product/design authority, complete
  experience inventory, and five selected pilot issues.

Exit: Hindsight can be planned and verified through the new contracts without
the Factory writing to its current dirty checkout.

## Stage 4 — Jira and GitHub vertical slice

Output:

- Jira revision-pinned issue ingestion and status mapping.
- GitHub branch/PR/check/review/merge reconciliation.
- At-least-once outbox with provider-specific operation markers.
- Hash-bound merge approvals and post-merge verification.

Exit: five selected Hindsight issues complete through verified merge without
manual repair or redispatch, including failure injection at every remote call.

## Stage 5 — Whole-product Quality Kit

Output:

- Executable route/screen/state inventory.
- Deterministic fixtures and journey UI tests.
- Screenshot matrices, visual diffs, filmstrips, legacy-generation detection,
  accessibility, privacy, secrets, persistence, and migration gates.
- Visible simulator mode with timestamped operator findings.

Exit: the current candidate passes; the archived mixed-generation Hindsight
fixture fails for the expected finding IDs.

## Stage 6 — Internal TestFlight delivery

Output:

- Apple/signing/agreement preflight, exclusive release resources, clean archive,
  export, upload reconciliation, processing poll, tester assignment, and smoke
  evidence.
- Release certificate binding main SHA, rules, tests, visual evidence, archive,
  App Store build, and device attestation.

Exit: the certified Hindsight SHA is installable from Internal TestFlight and
passes the named smoke journey.

## Stage 7 — Full command center and project provisioning

Output:

- Expand the Stage 1 MCP/dashboard slice into the full supported local command
  center, approval, evidence, cost, health, and portfolio experience.
- Project `plan/apply`, enrollment, relocation, health, audit, and portfolio
  views.
- A second app completes one merged issue without kernel changes.

Exit: CLI, chat, and dashboard are interchangeable clients, and onboarding is
proved reusable.

## Stage 8 — Controlled learning and growth modules

Output:

- Finding -> root cause -> regression -> reviewed policy PR -> replay -> version
  adoption.
- Lifecycle events for website, analytics, feedback, SEO/AEO, CRM, email,
  marketing, and social adapters.
- Compile-time trusted modules register typed commands, event consumers,
  external effects, quality gates, and optional dashboard panels through the
  module SDK; they never write kernel tables directly.

Exit: one Hindsight escape becomes a tested cross-project rule; business
modules are added independently without changing the kernel.
