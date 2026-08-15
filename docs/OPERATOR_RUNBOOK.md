# Local operator runbook

This is the supported local-development path for the capabilities that are
currently wired. It starts the daemon in the foreground, exercises the typed
CLI, shows the MCP entrypoint, opens the dashboard library surface, and inspects
the LaunchAgent plan without installing it.

The daemon remains deterministic-fake by default. It also has one supported
opt-in walking-slice profile that makes an exact reviewed edit to a Factory-owned
Swift Greeter worktree, runs the real Swift toolchain in a separate read-only
checkout, performs independent review, creates one local broker commit, and
publishes immutable evidence. That profile is deliberately not a general Codex
runner. Neither mode edits an enrolled app, opens a PR, or uploads to TestFlight.

Codex conformance components exist for no-network fake-executable development.
As of 2026-08-14 the operator entrypoint _can_ select a real-identity Codex
profile (`swift-greeter-codex-v1` or the config-driven `enrolled-codex-v1`),
gated behind a required owner containment attestation
(`APP_FACTORY_CONTAINMENT_ATTESTATION`; see
[`docs/progress/IMPLEMENTATION_STATUS.md`](progress/IMPLEMENTATION_STATUS.md)
and the recorded
[containment attestation](operations/containment-attestation-2026-08-14.json)).
No paid or real-model run has occurred yet. Do not point either mode at a
real model or add a new launch path until the containment contract in
[`ADR 0002`](architecture/0002-untrusted-agent-containment.md) passes.
The dormant OCI slice has a separate
[no-network contract-validation procedure](operations/oci-no-network-validation.md);
its explicitly invoked safe smoke may run and recover a complete deterministic
`network=none` container lifecycle. It does not authorize credentials, a live
model, or autonomous coding.

## 1. Build and verify the toolchain

```sh
cd /Users/pchordia/code/factory/app-factory
pnpm install --frozen-lockfile
pnpm toolchain:check
pnpm build
```

The pinned versions are Node `24.18.0` and pnpm `10.33.2`. Use
`pnpm verify` for the final repository gate. The current root verification
finalization state is recorded in
[`docs/progress/IMPLEMENTATION_STATUS.md`](progress/IMPLEMENTATION_STATUS.md#repository-verification).

### Repository branches

The owner-directed coordination branches are `dev`, `qa`, and protected
`main`. Push implementation checkpoints to `dev`. Promote an exact reviewed SHA
to `qa` only for candidate validation, and promote to `main` only after the
applicable evidence and explicit merge/release gates pass. Do not treat a moving
branch name as build, QA, TestFlight, or release identity; those records bind
the exact commit SHA. Prefer short-lived issue branches when work needs isolated
review before integration.

## 2. Create a private local runtime

Run once:

```sh
install -d -m 700 "/Users/pchordia/Library/Application Support/AppFactory/runtime"
install -d -m 700 "/Users/pchordia/Library/Application Support/AppFactory/auth"
umask 077
openssl rand -hex 32 > "/Users/pchordia/Library/Application Support/AppFactory/auth/authorization"
chmod 600 "/Users/pchordia/Library/Application Support/AppFactory/auth/authorization"
```

Do not commit, print, or paste the authorization value into a task, prompt,
issue, log, or screenshot.

## 3. Start and stop the daemon

In terminal A:

```sh
cd /Users/pchordia/code/factory/app-factory
export APP_FACTORY_RUNTIME_DIR="/Users/pchordia/Library/Application Support/AppFactory/runtime"
export APP_FACTORY_AUTH_FILE="/Users/pchordia/Library/Application Support/AppFactory/auth/authorization"
export APP_FACTORY_DAEMON_VERSION="0.1.0-local"
export APP_FACTORY_POLL_INTERVAL_MS="100"
node apps/daemon/dist/main.js
```

The daemon owns
`/Users/pchordia/Library/Application Support/AppFactory/runtime/daemon.sock`
and the local SQLite control plane. Stop it with `Control-C`; shutdown stops
intake, joins the scheduler, and closes SQLite.

The socket can exist while executor/agent startup reconciliation is still in
progress. During that interval `doctor` returns retryable `daemon.starting`.
An ambiguous supervised process identity or an adopted live coding run prevents
readiness; a failed startup releases socket and runtime ownership. Never delete
an intent, receipt, process-state file, cancellation record, or stale mutation
lock by hand. Preserve the runtime and resolve identity through a reviewed
recovery procedure.

If startup rejects the runtime, verify that the directories are owned by the
current user, are not symbolic links, and have mode `0700`; the authorization
file must be a single-link regular file with mode `0600`.

## 4. Use the CLI

In terminal B:

```sh
cd /Users/pchordia/code/factory/app-factory
export APP_FACTORY_SOCKET="/Users/pchordia/Library/Application Support/AppFactory/runtime/daemon.sock"
export APP_FACTORY_AUTH_TOKEN="$(tr -d '\r\n' < "/Users/pchordia/Library/Application Support/AppFactory/auth/authorization")"
node apps/cli/dist/index.js doctor
```

The supported commands are:

```text
doctor
submit --task /absolute/path/to/task.json
run --task /absolute/path/to/task.json
status ATTEMPT_UUID
attempts [--all] [--project PROJECT_UUID] [--limit N]
         [--after-updated-at ISO_INSTANT --after-attempt ATTEMPT_UUID]
events ATTEMPT_UUID [--after N] [--limit N]
pause ATTEMPT_UUID [--reason TEXT]
resume ATTEMPT_UUID [--reason TEXT]
cancel ATTEMPT_UUID [--reason TEXT]
reconcile [ATTEMPT_UUID]
evidence list [--after ATTEMPT_UUID] [--limit N]
evidence inspect ATTEMPT_UUID
evidence verify ATTEMPT_UUID
portfolio
```

Add `--json` anywhere in the invocation for a stable machine-readable envelope.
`reconcile` durably acknowledges a scheduler wake request; it does not execute
an attempt on the command stack. The daemon publishes that acknowledgement
before waking its background scheduler, and the v1 `reconciledAttemptIds` field
is empty because progress is observed later through `status` and `events`.

Every command is sent with an explicit durable identity. If a mutation was
dispatched but its response is unknown, the CLI prints a retry identity (or
returns it at `error.retryIdentity` in JSON). Repeat the exact same command and
payload with both fields:

```sh
node apps/cli/dist/index.js pause ATTEMPT_UUID --reason "Review" \
  --command-id COMMAND_UUID \
  --issued-at 2026-08-11T12:00:00.000Z
```

The retry gets a new request ID but preserves the original logical command.
Never reuse the pair for a different operation, attempt, reason, or task file;
the daemon rejects that as an identity conflict. A known terminal failure or a
cancellation before dispatch has no retry identity.

For a safe synthetic smoke task, save this as
`/private/tmp/app-factory-task.json`:

```json
{
  "schemaVersion": 1,
  "taskId": "00000000-0000-4000-8000-000000000003",
  "projectId": "00000000-0000-4000-8000-000000000001",
  "createdAt": "2026-08-10T00:00:00.000Z",
  "title": "Exercise the deterministic local workflow",
  "objective": "Complete the fake prepare, execute, and verify steps without an external effect.",
  "acceptanceCriteria": [
    {
      "id": "fake-workflow-completes",
      "statement": "The durable fake attempt reaches a terminal successful state.",
      "verification": "automated"
    }
  ],
  "base": {
    "repositoryId": "00000000-0000-4000-8000-000000000002",
    "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "requestedScope": {
    "paths": ["Sources/FactoryFixture/Greeting.swift"]
  },
  "policyDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Then run:

```sh
node apps/cli/dist/index.js run --task /private/tmp/app-factory-task.json --json
node apps/cli/dist/index.js status ATTEMPT_UUID --json
node apps/cli/dist/index.js events ATTEMPT_UUID --after 0 --limit 100 --json
```

Use the returned canonical attempt UUID in the last two commands.

### Opt into the verified Swift walking slice

The default above is intentionally fast and synthetic. For the real local
Git/Swift/evidence path, materialize a standalone clean Git repository whose
files exactly match [`fixtures/swift-greeter`](../fixtures/swift-greeter), add
and commit those files, and create a private reviewed-policy text file. Then
create a mode-`0600` configuration file:

```json
{
  "schemaVersion": 1,
  "mode": "swift-greeter-fixture-v1",
  "repositoryId": "62000000-0000-4000-8000-000000000002",
  "sourceRepositoryPath": "/absolute/path/to/the/standalone/swift-greeter",
  "policyFile": "/absolute/path/to/reviewed-policy.txt"
}
```

Set `APP_FACTORY_LOCAL_EXECUTION_CONFIG` to that absolute path before starting
the daemon. The submitted TaskSpec must bind the repository's exact `HEAD`, the
same repository ID, only
`Sources/Greeter/GreetingFormatter.swift`, and the SHA-256 digest of the exact
policy-file bytes. Enrollment fails closed on any extra checkout path, unsafe
Git configuration, unexpected tree, content drift, or policy mismatch. See
[`docs/operations/verified-local-execution.md`](operations/verified-local-execution.md)
for the complete security boundary and residual recovery limitation.

This conformance profile is also bound to one exact task meaning; it is not a
general code generator. Use the title `Add a farewell to GreetingFormatter`,
the objective
``Add a public farewell(for:) method that returns `Goodbye, <name>!` without changing greeting behavior.``,
and these ordered criteria:

```json
[
  {
    "id": "returns-farewell",
    "statement": "farewell(for: \"Factory\") returns \"Goodbye, Factory!\".",
    "verification": "automated"
  },
  {
    "id": "preserves-greeting",
    "statement": "Existing greeting tests continue to pass.",
    "verification": "automated"
  }
]
```

The daemon hashes those fields and rejects any altered objective or acceptance
criterion before the deterministic agent runs.

A durable V2 blocked or failed result is terminal for its exact attempt.
Resolving the blocker requires a new TaskSpec/attempt with new immutable input
bindings; pause/resume does not silently relaunch it.
Projects enrolled with trusted agent identity require V2 evidence for every
live result and replay. A missing envelope or legacy V1 journal fails closed;
do not edit or delete the journal to force a retry—submit a new attempt after
correcting enrollment or runtime state.
Likewise, an older-fence terminal supervisor receipt without a published V2
journal is never followed by an automatic relaunch. Inspect the receipt and
worktree, then submit a replacement attempt; do not manually remove the
supervisor artifacts.

## 5. Connect an MCP host

The MCP process is a stdio child, not a standalone web server. Configure the
host to launch:

```text
command: /opt/homebrew/bin/node
args: /Users/pchordia/code/factory/app-factory/apps/mcp/dist/main.js
environment:
  APP_FACTORY_SOCKET=/Users/pchordia/Library/Application Support/AppFactory/runtime/daemon.sock
  APP_FACTORY_AUTH_TOKEN=<load from the private authorization file at launch>
```

Use the host's secret/environment facility for the token; do not commit it in a
shared MCP configuration. The registered tools are:

```text
factory_doctor
factory_task_submit
factory_task_run
factory_attempt_status
factory_attempt_list
factory_attempt_events
factory_attempt_pause
factory_attempt_resume
factory_attempt_cancel
factory_reconcile
factory_evidence_list
factory_evidence_inspect
factory_evidence_verify
factory_portfolio_snapshot
```

All tools call the daemon through [`packages/command-client`](../packages/command-client);
the MCP process has no direct SQLite, evidence-directory, or provider access.
Mutation tools accept `commandId` and `issuedAt` only as a complete pair. When
an error returns `retryIdentity`, call the same tool with unchanged semantic
arguments plus those returned fields. Do not invent a new command ID to resolve
an unknown outcome.

## 6. Open the local dashboard

Create `/private/tmp/app-factory-dashboard.json` with this machine's paths:

```json
{
  "schemaVersion": 1,
  "socketPath": "/Users/pchordia/Library/Application Support/AppFactory/runtime/daemon.sock",
  "authorizationFile": "/Users/pchordia/Library/Application Support/AppFactory/auth/authorization",
  "port": 4317
}
```

Protect the file, build, and run the packaged launcher:

```sh
chmod 600 /private/tmp/app-factory-dashboard.json
pnpm build
node apps/dashboard/dist/main.js --config /private/tmp/app-factory-dashboard.json
```

The configuration file and referenced authorization file must be regular,
single-link, current-user-owned files with no group/other permissions; symlinks
are rejected. As a configuration-file-free alternative, set `APP_FACTORY_SOCKET`,
`APP_FACTORY_AUTH_FILE`, and optional `APP_FACTORY_DASHBOARD_PORT`, then run
`pnpm dashboard`. The launcher deliberately does not accept the daemon token
inline or from an environment variable.

Open the printed URL once and do not share or persist it. Its random browser
token is exchanged for a separate random HttpOnly local session cookie;
browser JavaScript never receives the daemon authorization. The server binds
only `127.0.0.1`. Ctrl-C or `SIGTERM` gracefully closes both the HTTP server and
command client.

The current UI opens on a bounded, newest-first work queue. It supports active
or all attempts, exact project filtering, cursor pagination, and click-through
to an authoritative status/event re-read; manual attempt-ID lookup remains
available. It also supports daemon health, pause/resume/cancel/reconcile, and
the daemon's authoritative local portfolio projection. The portfolio is
maintained transactionally and deliberately shows
Jira, GitHub, quality, release, and analytics values as unavailable until live
sources are composed. Quality and release panels are not implemented.

After an ambiguous dashboard mutation, click the same action again to replay
its returned durable identity. Choosing another successful action or reloading
authoritative attempt state clears older retry identities for that attempt, so
a future click starts a fresh command.

## 7. Inspect the LaunchAgent plan

Create a private JSON file such as
`/private/tmp/app-factory-service.json` with this machine's current values:

```json
{
  "schemaVersion": 1,
  "userId": 501,
  "launchAgentsDirectory": "/Users/pchordia/Library/LaunchAgents",
  "nodeExecutable": "/opt/homebrew/Cellar/node@24/24.18.0/bin/node",
  "daemonEntrypoint": "/Users/pchordia/code/factory/app-factory/apps/daemon/dist/main.js",
  "runtimeDirectory": "/Users/pchordia/Library/Application Support/AppFactory/runtime",
  "authorizationFile": "/Users/pchordia/Library/Application Support/AppFactory/auth/authorization",
  "logDirectory": "/Users/pchordia/Library/Logs/AppFactory",
  "daemonVersion": "0.1.0-local",
  "pollIntervalMs": 100
}
```

The node path must resolve to the regular executable itself, not a symbolic
link. Plan and inspect without changing LaunchAgent state:

```sh
pnpm service plan --config /private/tmp/app-factory-service.json
pnpm service status --config /private/tmp/app-factory-service.json
```

`install`, `uninstall`, and `logs` intentionally fail until the explicit human
installation gate is approved. Do not manually execute the plan's `launchctl`
commands as a workaround.

## 8. Verification commands

From the repository root:

```sh
pnpm toolchain:check
pnpm format:check
pnpm lint
pnpm boundaries
pnpm boundaries:test
pnpm typecheck
pnpm schemas:check
pnpm test
pnpm verify
```

`pnpm verify` is authoritative. For packages whose local scripts still use
repository-relative paths, run `pnpm build` first so workspace exports cannot
resolve to stale `dist` output, then run the test directory from the repository
root. The corrected OCI runner script can be invoked through its workspace
filter:

```sh
pnpm build
pnpm exec vitest run apps/daemon/test
pnpm exec vitest run apps/cli/test apps/mcp/test apps/dashboard/test
pnpm exec vitest run packages/effect-worker/test packages/execution-engine/test
pnpm --filter @app-factory/oci-runner test
```

The user-authorized local Hindsight checkpoint, read-only scan, and trusted
Xcode observations are recorded in
[`HINDSIGHT_ENROLLMENT_STATUS.md`](progress/HINDSIGHT_ENROLLMENT_STATUS.md).
Do not apply its proposal-only enrollment plan or point another write-capable
workflow at Hindsight until the remaining enrollment and protected gates are
satisfied.
