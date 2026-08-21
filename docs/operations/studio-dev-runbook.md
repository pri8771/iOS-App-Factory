# Studio dev runbook

How to run the app-factory daemon for local Studio (`apps/studio-mac`) development, with the
rooms subsystem live and the macOS app connected to a real socket instead of running honestly
offline. This is a dev-only path: it uses `scripts/dev-attest` for the owner containment
attestation the rooms/coding-agent real-identity surfaces require, not a reviewed production
decision. For the general (non-Studio) daemon/CLI walkthrough, deterministic Swift-walking-slice
profile, and the full containment security boundary, see
[`docs/OPERATOR_RUNBOOK.md`](../OPERATOR_RUNBOOK.md) and
[`docs/operations/verified-local-execution.md`](verified-local-execution.md).

## 0. Build

```sh
cd /Users/pchordia/code/factory/app-factory
pnpm install --frozen-lockfile
pnpm toolchain:check
pnpm build
```

`pnpm build` compiles every workspace package, including `apps/daemon/dist/main.js` this runbook
runs directly. Use `pnpm verify` as the full repository gate before relying on a build.

## 1. Create a private local runtime + auth token

Once, in a directory separate from any `OPERATOR_RUNBOOK.md` runtime so the two don't share a
control-plane SQLite file or socket:

```sh
install -d -m 700 "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime"
install -d -m 700 "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth"
umask 077
openssl rand -hex 32 > "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth/authorization"
chmod 600 "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth/authorization"
```

Do not commit, print, or paste the authorization value into a task, prompt, issue, log, or
screenshot.

## 2. Create a dev containment attestation

Real-identity execution paths — the enrolled coding-agent profile, and (below) rooms' live model
participants — refuse to load without `APP_FACTORY_CONTAINMENT_ATTESTATION` pointing at a file in
the exact shape `apps/daemon/src/local-execution-profile.ts`'s `readOwnerContainmentAttestation()`
accepts: a mode-`0600`, current-user-owned JSON file with exactly `schemaVersion`, `decision`,
`acceptedGaps`, `date`, and `owner`. `scripts/dev-attest` writes that file for you:

```sh
export APP_FACTORY_RUNTIME_DIR="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime"
scripts/dev-attest
# dev-attest: wrote .../studio-dev/runtime/attestation.json (mode 600, owner "...", date ...)
# dev-attest: export APP_FACTORY_CONTAINMENT_ATTESTATION=".../studio-dev/runtime/attestation.json"
export APP_FACTORY_CONTAINMENT_ATTESTATION="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/attestation.json"
```

Pass an explicit path (`scripts/dev-attest /absolute/path/to/attestation.json`) to write somewhere
other than `$APP_FACTORY_RUNTIME_DIR/attestation.json`, and `--owner "Full Name"` to override the
owner name it otherwise reads from `git config user.name`. Re-running it overwrites the file with
a fresh `date`; it is a dev convenience, not a security review — see the file's own `decision`
text, and [ADR 0002](../architecture/0002-untrusted-agent-containment.md) for what a real
containment decision covers.

## 3. Configure room participants

Rooms need `APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG` set to an absolute path naming a mode-`0600`
JSON file (`apps/daemon/src/room-participants-config.ts`'s `parseRoomParticipantsConfigV1()`):
`schemaVersion: 1` plus any of `codex`, `claude`, `ollama`, `openrouter`, `roster`, all optional.
The smallest working config needs only a local Ollama instance (loopback-only, no credential
broker involved):

```json
{
  "schemaVersion": 1,
  "ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen2.5:3b"
  }
}
```

```sh
cat > "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/room-participants.json" <<'EOF'
{
  "schemaVersion": 1,
  "ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "model": "qwen2.5:3b"
  }
}
EOF
chmod 600 "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/room-participants.json"
export APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/room-participants.json"
```

`baseUrl`/`model` are themselves optional (they default to `http://127.0.0.1:11434` and
`qwen2.5:3b`); an empty `{}` under `ollama` works if a local Ollama daemon is already serving that
default. Add `codex`/`claude` blocks to exercise those CLI-subprocess participants, or
`openrouter` (an array of up to 5 named instances, each carrying a `credentialReference` — never a
bare key — resolved through the credential broker) for BYOK OpenRouter.

A reachable local Ollama server is effectively required regardless of which chat participants you
configure: the Tier-1 admission scorer and the per-room charter/summarizer are always built from
Ollama (`config.ollama`'s `baseUrl`/`model`, or the same defaults, even when `ollama` is omitted
entirely) — there is no "scorer" override yet to point that at a different instance (see the
architecture plan's decision 5, not yet built). Without any of `codex`/`claude`/`ollama`/
`openrouter` configured as a chat participant, rooms still start (a durable transcript with no
agent floor); a room whose participant provider isn't configured here doesn't fail to create, it
silently errors every turn a real reply is expected — check the room transcript's own error lines,
not just `doctor`, if a configured provider seems unresponsive.

## 4. Start the daemon

```sh
cd /Users/pchordia/code/factory/app-factory
export APP_FACTORY_RUNTIME_DIR="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime"
export APP_FACTORY_AUTH_FILE="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth/authorization"
export APP_FACTORY_DAEMON_VERSION="0.1.0-studio-dev"
export APP_FACTORY_POLL_INTERVAL_MS="100"
export APP_FACTORY_CONTAINMENT_ATTESTATION="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/attestation.json"
export APP_FACTORY_ROOMS_ENABLED="1"
export APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/room-participants.json"
node apps/daemon/dist/main.js
```

`APP_FACTORY_ROOMS_ENABLED` accepts `1`/`true` (case-insensitive) to enable, `0`/`false`/unset to
disable; any other value fails closed. With it enabled, `APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG` is
required — the daemon refuses to start without it, exactly as `APP_FACTORY_RUNTIME_DIR`/
`APP_FACTORY_AUTH_FILE` are always required. `phase.run`'s participant pool is built from this same
config and the same attestation gate, not a second one, so a working rooms config also lights up
phase-run participants.

Optional, real-identity coding-agent execution (separate from rooms) is
`APP_FACTORY_LOCAL_EXECUTION_CONFIG` — see
[`docs/operations/verified-local-execution.md`](verified-local-execution.md); it shares the same
`APP_FACTORY_CONTAINMENT_ATTESTATION` gate set above.

**Not yet wired:** `APP_FACTORY_SIGNAL_SCHEDULER_ENABLED` — unattended scheduled signal checks
(migration `0019-signal-schedule`, `signal-scheduler.ts`) are a later wave's work. Signals exist
today (`signal.create/list/pause/resume/run-now`, `insight.list`) but only run when explicitly
triggered with `run-now`; there is no scheduler loop to enable yet. This section will grow an
`export APP_FACTORY_SIGNAL_SCHEDULER_ENABLED=1` step once that wave lands.

The daemon owns `.../studio-dev/runtime/daemon.sock` and that directory's SQLite control plane.
Stop it with `Control-C`. If startup rejects the runtime, verify every directory is owned by the
current user, is not a symbolic link, and is mode `0700`; the auth, attestation, and participants
files must each be a single-link regular file, mode `0600`.

## 5. Connect the Studio Mac app

`apps/studio-mac`'s `StudioApp.swift` reads its daemon connection straight from the environment —
no config file, no in-app settings surface yet:

```sh
cd /Users/pchordia/code/factory/app-factory/apps/studio-mac
export APP_FACTORY_SOCKET="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/daemon.sock"
export APP_FACTORY_AUTH_FILE="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth/authorization"
swift run Studio
```

`APP_FACTORY_RUNTIME_DIR` (socket = `<dir>/daemon.sock`) and `APP_FACTORY_AUTH_TOKEN` (the token
value directly, instead of a file) are also honoured. With neither socket nor auth set, the app
runs honestly offline: fixture timeline, `—` everywhere a live value would go — that is the
expected, correct behavior for a plain `swift run Studio` with no environment, not a bug.

## 6. Sanity-check from the CLI

In a third terminal, before or instead of the Mac app:

```sh
cd /Users/pchordia/code/factory/app-factory
export APP_FACTORY_SOCKET="/Users/pchordia/Library/Application Support/AppFactory/studio-dev/runtime/daemon.sock"
export APP_FACTORY_AUTH_TOKEN="$(tr -d '\r\n' < "/Users/pchordia/Library/Application Support/AppFactory/studio-dev/auth/authorization")"
node apps/cli/dist/index.js doctor
```

A `doctor` readiness of `ready` (not `degraded`, and not a `daemon.starting` retry) confirms the
socket, auth, attestation, and participants config all loaded. See
[`docs/OPERATOR_RUNBOOK.md`](../OPERATOR_RUNBOOK.md#4-use-the-cli) for the rest of the CLI surface
(`submit`, `run`, `status`, `portfolio`, `evidence`, ...). `signal create/list/pause/resume/run-now`
and `insight list <signal-id>` are already CLI commands (e.g.
`node apps/cli/dist/index.js signal list`) — a quick way to smoke the config above without opening
the Mac app. `room.*` has none yet: today it is reached only through the Swift app or a raw socket
frame. A later wave's CLI work adds `provider list/health`, `usage summary`, `room update`,
`settings get/set`, and `signal reschedule` verbs; it does not by itself promise CLI verbs for the
rest of `room.*` (`create`/`list`/`post`/`events`/`typing`/`participants.list`).
