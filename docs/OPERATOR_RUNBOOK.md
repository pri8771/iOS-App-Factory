# Local operator runbook

This is the supported local-development path for the capabilities that are
currently wired. It starts the daemon in the foreground, exercises the typed
CLI, shows the MCP entrypoint, opens the dashboard library surface, and inspects
the LaunchAgent plan without installing it.

The current daemon uses a deterministic fake executor. Running a task proves
durable command/scheduler behavior; it does **not** edit an app, open a PR, or
upload to TestFlight.

## 1. Build and verify the toolchain

```sh
cd /Users/pchordia/code/factory/app-factory
pnpm install --frozen-lockfile
pnpm toolchain:check
pnpm build
```

The pinned versions are Node `24.18.0` and pnpm `10.33.2`. Use
`pnpm verify` for the final repository gate. The current enrollment-suite
exception is recorded in
[`docs/progress/IMPLEMENTATION_STATUS.md`](progress/IMPLEMENTATION_STATUS.md#current-verification-exception).

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
events ATTEMPT_UUID [--after N] [--limit N]
pause ATTEMPT_UUID [--reason TEXT]
resume ATTEMPT_UUID [--reason TEXT]
cancel ATTEMPT_UUID [--reason TEXT]
reconcile [ATTEMPT_UUID]
```

Add `--json` anywhere in the invocation for a stable machine-readable envelope.

For a safe synthetic smoke task, save this as
`/private/tmp/app-factory-task.json`:

```json
{
  "schemaVersion": 1,
  "taskId": "00000000-0000-4000-8000-000000000003",
  "projectId": "00000000-0000-4000-8000-000000000001",
  "createdAt": "2026-08-11T12:00:00.000Z",
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
factory_attempt_events
factory_attempt_pause
factory_attempt_resume
factory_attempt_cancel
factory_reconcile
```

All tools call the daemon through [`packages/command-client`](../packages/command-client);
the MCP process has no direct SQLite or provider access.

## 6. Open the local dashboard

There is not yet a packaged dashboard executable. After `pnpm build`, this
development command starts the tested loopback server on port `4317` and prints
its one-use launch URL:

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { createCommandClient } from "./packages/command-client/dist/index.js"; import { createDashboardCommandPort, startDashboardServer } from "./apps/dashboard/dist/index.js"; const client=createCommandClient({socketPath:process.env.APP_FACTORY_SOCKET,authorization:process.env.APP_FACTORY_AUTH_TOKEN,origin:"dashboard"}); const server=await startDashboardServer({commandPort:createDashboardCommandPort(client),browserToken:randomBytes(32).toString("hex"),port:4317}); console.log(server.launchUrl); const stop=()=>void server.close().finally(()=>process.exit()); process.once("SIGINT",stop); process.once("SIGTERM",stop);'
```

Open the printed URL once. The server exchanges it for an HttpOnly local
session cookie; browser JavaScript never receives the daemon authorization.
The current UI supports daemon health, attempt status/events,
pause/resume/cancel/reconcile, and a portfolio panel only when a portfolio port
is injected. Quality and release panels are not implemented.

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

`pnpm verify` is authoritative. To diagnose one package without relying on a
package-local script path, run `pnpm build` first so workspace package exports
cannot resolve to stale `dist` output, then run its repository-relative test
directory from the root, for example:

```sh
pnpm build
pnpm exec vitest run apps/daemon/test
pnpm exec vitest run apps/cli/test apps/mcp/test apps/dashboard/test
pnpm exec vitest run packages/effect-worker/test packages/execution-engine/test
```

Do not point the enrollment scanner or any write-capable workflow at Hindsight
until its explicit preservation and enrollment gates are satisfied.
