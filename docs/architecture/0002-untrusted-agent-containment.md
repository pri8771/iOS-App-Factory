# ADR 0002: Separate the coding plane from the trusted macOS build plane

- Status: accepted boundary; dormant partial implementation; production conformance pending
- Date: 2026-08-11

## Context

The Factory needs a coding agent to survive daemon and terminal exits, but the
agent must lose authority when its lease or run ends. A detached process group
is durable, yet it is not containment. A target can start a new session or
process group, close inherited streams, and exit. The host supervisor can then
produce a complete receipt while that descendant remains alive.

The repository has a bounded real-process reproduction of the underlying
process-group limitation. The current platform identity probe also uses
second-resolution `ps lstart`, which cannot distinguish rapid same-boot PID
reuse with kernel-generation precision. These facts prohibit describing the
host supervisor as an unattended-safe boundary for untrusted model-generated
commands.

The same machine must ultimately run Xcode, iOS simulators, signing, and Apple
release tooling. Those operations cannot move into a Linux container.

## Decision

Use two execution planes:

1. The **coding plane** runs each untrusted coding attempt inside a disposable,
   resource-bounded OCI container (or a future macOS VM with equivalent
   lifecycle proof). The container is the unit of cancellation and recovery.
2. The **trusted build plane** runs fixed, reviewed verification commands on the
   Mac against an immutable candidate Git tree. It never executes repository
   scripts merely because the coding agent requested them.

The existing host process supervisor remains valid for trusted, non-detaching
helpers and for protocol development. It is not sufficient by itself to enable
the live Codex adapter.

## Current partial implementation

[`packages/oci-runner`](../../packages/oci-runner) implements a dormant,
no-network slice of the coding-plane contract. It is a library and test surface;
the daemon, scheduler, Codex adapter, CLI, and operator entrypoint do not compose
it. Its deterministic suite uses fake engines and an injected Docker command
transport. Separately, an explicitly invoked live Colima `OciRunner` smoke
completed the natural `planned -> created -> running -> terminal -> removed`
lifecycle and recovered from a persisted launch marker after a process failure
during strict inspection. It pinned Docker CLI `29.6.1`, server `29.5.2`, and
`node@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`.
The smoke started no agent and made no model call.

The implemented runner controls are:

- exact Docker executable, private Unix-socket, client/server version, server
  platform, image repository digest, and local image-ID checks;
- a locked create profile with `network=none`, a read-only root filesystem,
  fixed non-root user, all capabilities dropped, no-new-privileges, bounded
  CPU/memory/swap/PIDs/log retention/wall time, and a private
  `nosuid,nodev,noexec` tmpfs;
- one writable bind for the exact isolated worktree, with symlink, hard-link,
  socket, FIFO, device, and other special-file rejection;
- labels binding attempt, run, fence, TaskSpec, policy, base commit, base tree,
  and immutable intent digest;
- a durable engine binding over the pinned Docker configuration, executable and
  socket filesystem identities, client version, and one atomic server
  ID/version/OS/architecture observation. The identity is freshly observed
  before every mutation and after absence proof; ordinary daemon drift fails
  closed;
- a private per-run cross-process operation lock plus a durable create-dispatch
  marker, so reconcile and cancel cannot race into a false pre-start final state
  while a Docker create may still become visible;
- exact normalized inspection of process, filesystem, mount, network, image,
  label, environment, privilege, resource, and logging state; and
- private fsynced lifecycle artifacts with failure-injection tests across
  `planned -> created -> running -> terminal -> removed`, cancellation, output
  capture, removal proof, and lost-response reconciliation; and
- a post-launch quarantine state plus an explicit exact-identity reaper. Actual
  start, inspection, or isolation-attestation failures permanently block the
  run, and reaping closes only after exact-ID and exact-label absence are both
  observed. It never emits a normal execution receipt.

The earlier live natural receipt succeeded as UID/GID `10001`, proved the private tmpfs
owner and mode, observed `ENETUNREACH` with no non-loopback interface, made the
one expected isolated-worktree write, persisted terminal/removal/receipt
artifacts, and left no container by ID, exact labels, or exact name. No Codex
binary, credential, home directory, or Docker socket was mounted into the
container. That recorded campaign predates the current engine-binding and
quarantine/reaper tree and is not current-tree validation. The local private
Unix socket remains a trusted endpoint; repeated observations are not remote
attestation against a malicious proxy controlling it.

These controls are meaningful progress, not production conformance. In
particular, the current implementation does not yet provide:

1. A pinned in-container PID 1 wrapper that autonomously enforces wall time,
   total output, and descendant shutdown while the Factory daemon is stopped or
   unreachable. Host timestamp reconciliation and retained-log limits do not
   prove that total generated output is bounded.
2. A controlled live-model egress and authentication design. The implemented
   profile is intentionally `network=none`; no Codex home, token, API key, host
   credential, or unrestricted network path may be added to it.
3. Autonomous stale-operation-lock recovery. Current lock contention and a
   lock left by a killed owner fail closed for explicit operator intervention;
   safe automatic recovery still needs process-generation ownership proof.
4. Daemon-owned independent invocation of the package quarantine reaper and a
   real-engine failure campaign for its start, inspect, kill, remove, and
   absence-proof boundaries. The dormant library closure is fake-engine tested;
   no autonomous process currently schedules it after a daemon failure.
5. Daemon/scheduler composition or an OCI-specific agent-result journal V3 that
   binds the OCI intent, image and engine identities, inspections, raw output,
   terminal state, removal evidence, and lease/fence closure. The host-process
   V2 journal is not sufficient evidence for an OCI run.
6. Digest attestation of the effective default seccomp and AppArmor profiles.
   The configured privilege fields are strictly inspected, but the runtime's
   implicit profiles are not yet bound to the policy digest.
7. A quota for the writable host bind and bounded behavior under host-disk
   exhaustion. Container memory and log limits do not quota worktree growth.
8. Real-engine timeout, output-overflow, stop, and kill-path tests. The completed
   smoke proves natural success and one strict-inspection process-failure
   recovery, not the remaining failure matrix or engine/daemon restart cases.
9. Trusted host-build integration. Xcode, Simulator, signing, archive, and
   TestFlight remain fixed macOS adapters operating on an immutable candidate
   tree; none runs inside this Linux OCI slice.

For the only currently supported validation procedure, see
[Local no-network OCI validation](../operations/oci-no-network-validation.md).

## Required coding-plane contract

Before production enablement, the complete container implementation must prove
all of the following. Presence of a corresponding library control or fake test
does not close the production gate:

- a pinned image digest and pinned agent CLI/version;
- one container identity bound to attempt, run, fence, task, policy, and base
  SHA digests;
- only the isolated worktree mounted writable, with Factory runtime, source
  checkout, Git credentials, Docker socket, and host home unavailable;
- a dedicated private temporary volume and explicit CPU, memory, PID, output,
  and wall-time limits;
- no ambient environment or long-lived provider credentials;
- model traffic through a narrowly controlled egress path while agent-started
  tools remain unable to make arbitrary network requests;
- durable `planned → created → running → terminal → removed` reconciliation,
  including timeout-after-create and daemon-kill cases;
- cancellation of the container/cgroup, not just its initial PID or PGID;
- proof that no process remains in the container boundary before its terminal
  receipt is accepted;
- immutable stdout, stderr, result, container inspection, and removal evidence;
  and
- failure injection at every create/start/inspect/stop/remove response boundary.

The Mac then snapshots the candidate into an immutable Git tree, runs trusted
checks and independent review in separate read-only checkouts, and brokers the
single allowed commit. Later iOS simulator, signing, archive, and TestFlight
steps remain distinct trusted adapters with their own approvals and leases.

## Consequences

- The live Codex adapter, deterministic fake-executable conformance tests, and
  dormant OCI runner may exist in the repository, but real-model autonomous
  execution stays disabled until the complete containment contract passes.
- Closing a terminal or chat does not define execution lifetime; the daemon and
  container runtime do.
- A coding-plane outage blocks coding attempts without weakening host quality
  or release gates.
- Colima/Docker can be one local implementation, but neither a locally
  installed CLI nor a running daemon is treated as proof of the contract.
- iOS build and release automation remains local to macOS and consumes only
  immutable, already-contained coding output.

## Rejected alternatives

- **Bare PID supervision:** vulnerable to reuse and does not cover descendants.
- **One process group:** a descendant can call `setsid` or otherwise detach.
- **Polling the process tree:** a spawn-and-exit race can escape observation.
- **Relying only on prompt rules:** repository prompt injection and model error
  remain inside the threat model.
- **Running all iOS work in Linux containers:** Xcode, Simulator, signing, and
  Apple tooling require the macOS build plane.
