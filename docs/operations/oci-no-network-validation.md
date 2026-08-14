# Local no-network OCI validation

This procedure validates the dormant `@app-factory/oci-runner` contracts in two
separate layers: a deterministic fake/injected-engine suite and an explicitly
invoked live `OciRunner` smoke. The live smoke may contact the local Colima
Docker daemon and execute a complete deterministic `network=none` lifecycle.
Neither layer enables autonomous coding, pulls or builds an image, invokes
Codex, or uses credentials. Passing either layer is not production containment
conformance.

## Deterministic contract suite

From the repository root, with the pinned Node and pnpm toolchain already
installed:

```sh
cd /Users/pchordia/code/factory/app-factory
pnpm toolchain:check
pnpm build
pnpm --filter @app-factory/oci-runner test
```

The corrected package-local test script is authoritative for this focused
suite. Its latest run passed 154 of 154 tests.

The suite uses fake lifecycle engines and an injected Docker command transport
to validate:

- exact intent, image, Docker endpoint, label, mount, environment, resource,
  privilege, network, and inspection bindings;
- durable engine identity binding plus fresh daemon observations before every
  mutation and after exact absence, with ordinary daemon-drift rejection;
- the locked `network=none`, read-only-root, non-root execution profile;
- rejection of credentials and unsafe worktree filesystem entries;
- private immutable lifecycle artifacts and digest-bound receipts; and
- cross-process operation serialization, create-dispatch ambiguity, deterministic
  cancellation, and lost-response recovery across create, start, inspect, logs,
  stop, kill, and removal boundaries; and
- durable post-launch quarantine, no-relaunch behavior, exact-identity reaping,
  ambiguous reaper responses, and exact-ID plus exact-label absence proof.

This suite does not contact a Docker daemon or start a real container.

## Explicit live `OciRunner` smoke

The live smoke is a separate, deliberate operation; it is not part of
`pnpm verify` and must not be inferred from a green deterministic suite. It uses
an already-present image pinned by repository digest and local image ID, keeps
`network=none`, starts no coding agent, and exercises the runner lifecycle and
reconciliation protocol.

The completed 2026-08-11 smoke pinned:

- Docker executable `/opt/homebrew/Cellar/docker/29.6.1/bin/docker` at
  `sha256:e8a1e5351c4d12337a4ee2b54523bc0107b4d13f795c9d6e791b9e4cf835f385`;
- Docker client `29.6.1`, server `29.5.2`, and server platform `linux/arm64`;
  and
- image reference
  `node@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`
  and local image ID
  `sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`.

The natural run produced a succeeded, exit-zero receipt with UID/GID `10001`.
Its private tmpfs write had mode `0600` and UID/GID `10001`; the workload saw
no non-loopback interface and received `ENETUNREACH`. It made exactly one
expected worktree write, persisted terminal inspection, removal evidence, and
the final receipt, and left no container discoverable by ID, exact labels, or
exact name. The campaign also recovered from the persisted launch marker after
a strict-inspection process failure instead of creating a duplicate. No Codex
binary, credentials, home directory, or Docker socket was mounted into the
container.

The recorded evidence summary is
`/Users/pchordia/Documents/oci-runner-smoke-hardening-Vhj2LP/smoke-summary.json`
with digest
`sha256:3ba392b0012dd11e89d0647b434a33ce94eae414733bec5b1ceb942058b8cc96`.
It predates the current engine-binding and quarantine/reaper changes, so it is
not current-tree validation. It is local observational evidence for the earlier
tree, not current-tree daemon/V3 or production certification. The local Unix
socket is trusted; the identity observations do not attest a malicious proxy
that controls that endpoint.

## Prohibited interpretation and actions

Stop after the deterministic suite unless the live smoke was explicitly
invoked. The live smoke may start or use local Colima and issue its exact
runner-controlled lifecycle; it does not authorize arbitrary Docker commands.
Do not run `docker pull`, `docker build`, or `docker run`. Do not use Hindsight
or any other application checkout as the worktree. Do not supply or mount a
Codex home, `auth.json`, model/API credential, Git credential, Docker socket,
Factory runtime, source checkout, or host home. Do not change `network=none` or
point the fixture command at a real agent.

A green deterministic suite proves the current library controls only. The
earlier completed live smoke additionally proved one natural full lifecycle and
one persisted launch-marker recovery case for its recorded tree. It has not yet
been rerun against the current tree. Neither proves an autonomous PID 1 wall/output
watchdog or a retained-log total-output bound; controlled live-model
egress/auth; autonomous stale-operation-lock recovery; a post-launch
quarantine reaper scheduled independently by the daemon and a corresponding
real-engine failure campaign; an operator-enabled OCI/Codex profile and pinned
in-container request/result transport;
digest-attested default seccomp/AppArmor profiles; quota-bound host writes and
disk-exhaustion behavior; or real-engine timeout, overflow, stop, and kill
paths. Trusted macOS Xcode integration also remains separate. Those gates are
listed in
[ADR 0002](../architecture/0002-untrusted-agent-containment.md).
