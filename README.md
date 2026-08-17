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

This is a full listing of `apps/` (5) and `packages/` (35), one line each,
regenerated from the current tree — see
[`docs/progress/IMPLEMENTATION_STATUS.md`](docs/progress/IMPLEMENTATION_STATUS.md)
for which of these are wired into a runnable path versus dormant/contracts-only,
and [`docs/architecture/0004-studio-mac-app.md`](docs/architecture/0004-studio-mac-app.md)
for the Studio Mac app product decision.

```text
apps/
  cli/         thin client for the typed daemon command service
  daemon/      singleton local scheduler, command broker, and SQLite owner
  dashboard/   local web debug surface over the command client (not the
               product — see docs/architecture/0004-studio-mac-app.md)
  mcp/         stdio MCP bridge for Claude, Codex, Cursor, and other hosts
  studio-mac/  native macOS app, the Gen 5 product target — Phases 1-4
               merged (shell/daemon client, studio.snapshot/assistant,
               rooms, phase presets/runner/planner/project registry); see
               docs/roadmap/STUDIO_PHASES.md
packages/
  adapter-sdk/                 provider-neutral effect-adapter boundary and capability preflight
  agent-runner/                credential-isolated headless Codex/Claude process adapters
  command-client/              typed daemon client shared by the CLI, MCP, and dashboard
  contracts/                   versioned command/event schemas and generated TypeScript types
  credential-broker/           just-in-time macOS Keychain reads, never exposed to agents
  effect-worker/               claims the durable outbox and calls external-provider adapters
  evidence-store/              immutable, content-addressed evidence blobs and manifests
  execution-engine/            verifies and commits agent-produced trees to Git
  git-workspace/               Git isolation, deterministic worktrees, and protected-path policy
  independent-review/          digest-bound, read-only review request/report validation
  kernel/                      SQLite execution state, leases, approvals, and outbox
  learning-engine/             turns closed findings into reviewable lesson proposals
  module-sdk/                  lifecycle/event modules and optional UI contributions
  oci-runner/                  Factory-owned coding-plane containment primitive (no-network slice)
  ollama-scorer/               loopback-Ollama urgency scorer + rolling summarizer for Studio rooms
  policy-corpus/               compiles the iOS App Factory rules corpus and proves it against the scanner
  policy-engine/               compiles versioned policy into AGENTS.md and a digest-bound lock; also
                                the rule-scoping/waiver/check-registry schema the daemon's task-intake
                                policy gate enforces
  portfolio/                   provider-neutral multi-project read model and work scheduler
  process-supervisor/          per-attempt process fencing, events, and orphan recovery
  project-docs/                reads a project's own repo docs as the truth; refuses to write back
                                (Jira/Notion are one-way mirrors, never the reverse)
  project-sdk/                 read-only discovery and enrollment planning for existing projects
  provider-http-adapters/      strict Jira Cloud REST / GitHub GraphQL adapters
  provider-transport/          fetch-based HTTP transport enforcing credential scope and deadlines
  quality/                     deterministic verification, evidence indexes, release certification
  recovery-manager/            integrity-bound control-plane recovery bundle create/restore
  retention-manager/           GC and OS-metadata tolerance for checkpoint/evidence scans
  scheduler/                   restart-safe prepare/execute/verify attempt scheduler
  service-manager/             deterministic macOS LaunchAgent plan for the Factory daemon
  simulator-runner/            plans and executes lease-bound iOS Simulator test sessions
  studio-room-adapters/        live Codex/Claude/Ollama participant adapters for Studio rooms
  studio-rooms/                Studio room engine: deterministic moderator over a single-writer transcript
  testkit/                     shared fixtures/harnesses for crash, fake-effect, and conformance tests
  trusted-verifier/            runs a pre-approved deterministic check in a separate clean checkout
  website-lifecycle/           plans an approval-required website PR on TestFlight availability
  work-tracking-integrations/  provider-neutral Jira/GitHub planning and read-only observation
docs/
  architecture/    decisions and system boundaries
  policy/          compiled rules-corpus policy source, sidecar, and reconciliation
  operations/      dated operator procedures and verification evidence
  progress/        current implementation and enrollment status ledgers
  roadmap/         capability-staged delivery plan and historical planning baseline
```

## Run Studio (the Mac app) + daemon locally

```sh
# terminal A — the daemon, on a private local runtime
RT="$TMPDIR/afrt"; mkdir -p "$RT/runtime" "$RT/etc"; chmod 700 "$RT" "$RT/runtime" "$RT/etc"
(umask 077; head -c 32 /dev/urandom | xxd -p -c 64 | tr -d '\n' > "$RT/etc/auth.token")
APP_FACTORY_RUNTIME_DIR="$RT/runtime" APP_FACTORY_AUTH_FILE="$RT/etc/auth.token" \
APP_FACTORY_DAEMON_VERSION=0.1.0-local node apps/daemon/dist/main.js

# terminal B — the app, pointed at the same runtime
cd apps/studio-mac && swift build
APP_FACTORY_SOCKET="$RT/runtime/daemon.sock" APP_FACTORY_AUTH_FILE="$RT/etc/auth.token" \
swift run Studio
```

See [`apps/studio-mac/README.md`](apps/studio-mac/README.md) for the full
recipe (including seeding fake attempts to see a populated dashboard, the
release-binary variant, and how live-daemon Swift tests find a socket) and
[`docs/OPERATOR_RUNBOOK.md`](docs/OPERATOR_RUNBOOK.md) for the CLI/MCP path.

## Runtime principles

- Chat sessions are clients; the daemon owns background work.
- Jira will own human issue status; SQLite owns execution-attempt state.
- Agents never receive Jira, GitHub, App Store Connect, or signing credentials.
- Missing evidence fails a gate.
- Every mutation and certificate is bound to explicit input digests and Git SHAs.
- Existing apps are enrolled through adapters and manifests, not rewritten into a template.

See [docs/roadmap/BUILD_STAGES.md](docs/roadmap/BUILD_STAGES.md) for the build
order, [docs/progress/IMPLEMENTATION_STATUS.md](docs/progress/IMPLEMENTATION_STATUS.md)
for the honest capability implementation ledger, and
[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md) for the supported local
operator flow. The daemon is fake-by-default; its only current real-toolchain
profile is the exact deterministic Swift Greeter conformance slice documented
in
[docs/operations/verified-local-execution.md](docs/operations/verified-local-execution.md).
