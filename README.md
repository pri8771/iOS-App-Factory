# App Factory

App Factory is a local-first control plane for planning, implementing, verifying,
and releasing software projects through durable workflows.

This repository is a ground-up implementation. The legacy Python orchestrator is
reference material only; it is not a runtime dependency and its state model is
not being migrated wholesale.

## Initial operator flow

```text
chat / CLI / dashboard
        -> typed command
        -> durable SQLite execution attempt
        -> isolated repository worktree
        -> headless coding agent
        -> trusted checks and read-only review
        -> evidence bundle
        -> later: Jira / GitHub / TestFlight reconciliation
```

## Repository layout

```text
apps/
  cli/             command-line client
  daemon/          singleton local scheduler and command broker
  mcp/             stdio bridge for supported local AI clients
  dashboard/       local web control surface
packages/
  contracts/       versioned commands, events, manifests, and schemas
  kernel/          SQLite execution state, leases, approvals, and outbox
  command-client/  generated client used by CLI, MCP, and dashboard
  process-supervisor/ per-attempt process and recovery boundary
  agent-runner/     credential-minimized Codex/Claude process adapters
  adapter-sdk/      Jira, GitHub, Apple, and provider integration ports
  module-sdk/       lifecycle/event modules and optional UI contributions
  quality/          deterministic verification and evidence contracts
  project-sdk/      enrollment and project capability contracts
  testkit/          crash, adapter, fixture, and conformance utilities
docs/
  architecture/    decisions and system boundaries
  roadmap/         dependency-ordered delivery stages
```

## Runtime principles

- Chat sessions are clients; the daemon owns background work.
- Jira will own human issue status; SQLite owns execution-attempt state.
- Agents never receive Jira, GitHub, App Store Connect, or signing credentials.
- Missing evidence fails a gate.
- Every mutation and certificate is bound to explicit input digests and Git SHAs.
- Existing apps are enrolled through adapters and manifests, not rewritten into a template.

See [docs/roadmap/BUILD_STAGES.md](docs/roadmap/BUILD_STAGES.md) for the build order.
