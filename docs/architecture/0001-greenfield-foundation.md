# ADR 0001: Greenfield App Factory foundation

Status: accepted for initial implementation  
Date: 2026-08-10

## Context

The legacy orchestrator proves useful concepts—local agent runners, process
cleanup, resume, evidence, UI crawling, and a dashboard—but also combines
planning, debate, execution, generated workspace state, and release decisions
inside one large Python application. Several release checks are fail-open, its
task model is not linked to PR/merge evidence, and its default workspace has
contradictory historical completion records.

The new product must be faster to change, easier to operate, modular, locally
resumable, safe around existing repositories, and usable from CLI, chat, and a
dashboard without implementing the workflow three times.

## Decision

Build a new TypeScript monorepo named `app-factory`.

- Node 24 LTS is the runtime baseline.
- pnpm manages one workspace and shared types.
- `better-sqlite3` 12.x supplies a pinned SQLite newer than the WAL-reset fix.
  WAL mode, foreign keys, busy timeout, `synchronous=FULL`, startup integrity
  checks, and the backup API protect control-plane state. The host SQLite and
  Node's still-release-candidate built-in SQLite are not runtime dependencies.
- Thin typed repositories own SQL. A query builder may be introduced only if it
  preserves explicit migrations and transaction boundaries.
- A singleton daemon is the only runtime writer.
- The CLI, stdio MCP server, and local dashboard are clients of one typed
  command service.
- The dashboard is React/Vite served locally; a desktop shell is optional later.
- Provider and product integrations implement narrow ports. Jira, GitHub,
  App Store Connect, Codex, Claude, and Xcode do not leak into kernel modules.
- Zod 4 strict schemas are the runtime contract authority. Checked-in/generated
  JSON Schema 2020-12 represents portable boundaries; TypeScript types alone
  are not accepted at trust boundaries. Exported schemas use branded string IDs
  and ISO strings rather than TS-only `Date`, `Map`, or transforming types.
- SQL migrations are explicit files and must be restart/rollback tested.
- Large evidence stays outside source Git; repositories store content digests
  and evidence indexes.
- Runtime data lives under `~/Library/Application Support/AppFactory/` with
  separate database, artifacts, mirrors, worktrees, derived data, logs, and a
  mode-0600 Unix socket. A live WAL database is backed up through SQLite's
  backup API rather than copied as ordinary files.

The core keeps current-state tables plus an append-only audit trail; it is not a
full event-sourced system. Initial tables cover projects, task snapshots,
attempts, attempt steps, leases, resource leases, approvals, events, effects,
artifacts, findings, releases, external resources, and module offsets.

## State authorities

| Concern                                  | Authority                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| Source and product contracts             | Git                                                     |
| Human backlog status                     | Jira once connected                                     |
| Execution attempts and pending effects   | local SQLite kernel                                     |
| PR/check/merge state                     | GitHub                                                  |
| build processing and tester availability | App Store Connect                                       |
| credentials                              | macOS Keychain or approved secret store                 |
| rules                                    | separately versioned policy repository pinned by digest |

## Process and security boundary

Coding agents receive a credential-minimized environment, an isolated worktree,
explicit command/filesystem allowances, bounded time/turn/cost limits, and no
external service credentials. Those controls are not a hostile-process
security boundary. The required coding-plane containment and the separate
trusted macOS build plane are defined by
[`ADR 0002`](0002-untrusted-agent-containment.md), which supersedes any inference
that same-user process or process-group supervision is sufficient. Only the
daemon's command broker can push, comment, transition, sign, upload, or consume
approvals. Trusted verification executes outside the agent-writable worktree.

The Codex runner must not use the CLI's legacy `--sandbox` presets: local
conformance testing showed that a model-invoked command could still read the
interactive user's Codex authentication file. The runner instead supplies a
Factory-owned permission profile that denies the filesystem root, permits only
the minimal runtime surface plus the attempt worktree and temporary paths, and
disables network access. A dedicated Factory `CODEX_HOME` separates runner state
from interactive history; its authentication material remains denied to
model-invoked commands. This profile is a mandatory conformance test, not an
assumed property of the provider CLI.

Provider-process exit status is not task success. In particular, Codex may exit
zero after explaining that a requested mutation was blocked. Only a complete
versioned protocol result followed by trusted diff, protected-path, test,
independent-review, and evidence gates can advance a coding attempt to verified.

Trusted, non-detaching helper attempts may run through the host supervisor. It
persists process identity, boot identity, process group, fencing token, bounded
spools, and a terminal receipt. Recovery blocks on unprovable or still-live
state before a newer launch. This protocol is not the coding-plane containment
boundary described by ADR 0002.

Package dependencies are directional and mechanically checked: clients import
contracts/generated clients only; the daemon is the composition root; the
kernel cannot import provider, runner, UI, or module implementations; adapters
cannot import kernel internals. V1 modules are compile-time trusted and cannot
write kernel tables directly. Dynamic plugin loading is deferred.

Repository files, Jira text, review comments, and fetched content are untrusted
data. Provider-session history is optional; durable contracts, Git, SQLite, and
evidence are sufficient to resume.

## Legacy boundary

The legacy orchestrator remains available for:

- behavior inventory and lessons;
- runner/process-control test cases worth reimplementing;
- known-bad release and mixed-UI fixtures;
- offline, one-way fixture/import tooling where a legacy artifact is valuable.

No legacy module is imported into the new kernel. A behavior is ported only
after it has a current contract, a focused test, and a reason to exist.

## Consequences

- We accept a short period with two systems while the first vertical slice is
  proved.
- We avoid spending months untangling a monolith before learning whether the
  new operator model works.
- The first milestone has no Jira, GitHub, or Apple dependency. A minimal
  status/start/pause/event-stream dashboard and MCP client arrive with the
  kernel so usability is tested early; the full portfolio UI remains later.
