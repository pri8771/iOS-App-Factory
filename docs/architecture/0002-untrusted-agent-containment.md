# ADR 0002: Separate the coding plane from the trusted macOS build plane

- Status: accepted boundary; containment implementation pending
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

## Required coding-plane contract

Before production enablement, a container implementation must prove all of the
following:

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

- The live Codex adapter and its deterministic fake-executable conformance
  tests may exist in the repository, but real-model autonomous execution stays
  dormant until the containment contract passes.
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
