# OCI runner

This package is the Factory-owned coding-plane containment primitive. It is
deliberately separate from `process-supervisor`: a host process group is useful
for trusted helpers, but it is not the lifecycle or cancellation boundary for
untrusted coding work.

The current slice is no-network and remains disabled in the operator
entrypoint. It proves the engine contract and crash-reconciliation protocol and
is consumed by a dependency-injected daemon `OciLocalAgent`/V3 journal path,
without enabling a live model:

- the Docker executable, client, server, platform, image repository digest, and
  local image ID are exact pins. A canonical engine identity binds the pinned
  configuration, executable and socket filesystem identities, client version,
  and one atomic server ID/version/OS/architecture observation. The runner
  observes that identity again before each mutation and after absence proofs;
- the image is launched with a read-only root filesystem, `network=none`, a
  fixed non-root user, all capabilities dropped, no-new-privileges, explicit
  CPU/memory/swap/PID/log/wall-time limits, and a private `nosuid,nodev,noexec`
  tmpfs;
- the only writable host bind is the exact isolated worktree at `/workspace`;
  the launch inventory rejects symlink ancestors, contained symlinks, sockets,
  FIFOs, devices, and other special files;
- container labels bind the attempt, implementing run, fence, TaskSpec, policy,
  base commit, base tree, and immutable intent digest;
- normalized inspection attests the exact user, command, entrypoint, working
  directory, environment, labels, image, resource limits, log driver, tmpfs,
  mounts, privilege, capabilities, security options, and network mode; and
- private fsynced artifacts reconcile
  `planned -> created -> running -> terminal -> removed`. A lost create, start,
  log, inspect, stop, kill, or remove response fails closed and is replayed from
  labels plus exact container identity rather than launching a duplicate.

After a durable launch, an actual start transport failure or an inspection or
isolation-attestation failure now publishes immutable quarantine evidence. A
quarantined run cannot reconcile, cancel, restart, or produce a normal receipt.
The explicit package reaper records its request before acting, targets only the
bound container ID, and accepts completion only after both exact-ID inspection
and exact-label discovery prove absence. Ambiguous kill or remove responses
therefore remain retryable instead of being treated as cleanup evidence.

The async `readOciEvidenceClosure` export is a read-only prerequisite for a
strict OCI result journal. It reopens the exact `PreparedOciRun` identity from
disk, takes the same per-run operation lock as reconciliation, makes no engine
call, and does not mutate lifecycle evidence. It returns a canonical,
digest-and-byte-length-bound artifact envelope only for a fully validated
`removed`, `quarantined`, or `quarantine-removed` closure. A normal removal
requires the complete engine-binding, create-attempt, created-inspection,
launch-attempt, start-dispatch, post-start inspection and attestation, terminal,
output, removal, and receipt chain. Quarantine exports require the corresponding
phase-complete quarantine chain, with a durable reap request and exact-absence
record before `quarantine-removed` can be exported. A running or otherwise
incomplete lifecycle returns `null`; a claimed terminal closure with missing,
conflicting, or tampered evidence fails closed. This exporter is not daemon
execution by itself. The injected daemon adapter independently reopens this
evidence root, compares the canonical closure with the adapter claim, and
content-addresses the complete chain in an OCI-specific V3 journal and final
execution manifest. Journal replay uses those immutable blobs and makes no
engine call.

`readOciLifecycleDisposition` is the corresponding read-only startup inventory
primitive. Under the same exact operation lock and with zero engine calls, it
distinguishes a valid incomplete prefix, a fully validated pre-start
cancellation, and each complete closure. The daemon cross-checks that inventory
against durable kernel ownership before allowing a newly leased scheduler to
adopt a prior-fence run. Quarantine and orphan/tampered ownership remain
fail-closed.

Daemon callers also supply separate execution and cleanup effect guards.
Create/start require current execution authority. Termination and reap markers,
stop, kill, and remove require cleanup authority from the same unexpired lease
owner/fence, including after cancellation or controlled daemon shutdown. Direct
library callers may omit guards; that compatibility mode is not the daemon
containment path.

The Docker log driver bounds retained output and the adapter records captured
and observed byte counts. Wall time is reconciled from the engine's immutable
start time; a production Codex image must additionally contain a pinned PID 1
deadline/output wrapper so limits continue to fire while the Factory daemon is
offline.

## Live no-network smoke evidence

The package-local suite passes 184/184. An explicitly invoked live Colima
`OciRunner` smoke also completed on 2026-08-11 with Docker CLI `29.6.1`, server
`29.5.2` on `linux/arm64`, and pinned image
`node@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2`.

The natural run succeeded as UID/GID `10001`, proved the private tmpfs owner and
mode, observed `ENETUNREACH`, made one expected isolated-worktree write,
persisted terminal/removal/receipt artifacts, and left no container by ID,
exact labels, or exact name. The campaign also recovered from a persisted
launch marker after a process failure during strict inspection without creating
a duplicate. It mounted no Codex binary, credential, home directory, or Docker
socket.

The recorded summary is
`/Users/pchordia/Documents/oci-runner-smoke-hardening-Vhj2LP/smoke-summary.json`,
whose digest is
`sha256:3ba392b0012dd11e89d0647b434a33ce94eae414733bec5b1ceb942058b8cc96`.
It predates the current engine-binding and quarantine/reaper changes and is not
current-tree validation. It remains live no-network runner evidence for the
earlier tree, not production conformance or an OCI journal V3. The local Unix
socket is a trusted endpoint: repeated server observations detect ordinary
daemon replacement but are not remote attestation against a malicious proxy
that controls that endpoint.

## Not enabled yet

`network=none` means this package can run deterministic/fake images only. Do not
mount a host Codex home, `auth.json`, API key, Docker socket, Factory runtime,
source checkout, Git credentials, or host home into the coding container.
Live Codex requires a separately reviewed, immutable input/output transport and
quota-bound egress/auth broker. The injected V3 path remains unreachable from
the production/operator profile and has only deterministic fake-engine and
no-network adapter evidence. Production containment also still requires:

- an autonomous in-container PID 1 wall/output watchdog and proof that retained
  logs bound total generated output;
- daemon-owned independent scheduling of the quarantine reaper and a live-engine
  quarantine failure campaign;
- autonomous stale-operation-lock recovery with process-generation proof;
- digest attestation of the effective default seccomp/AppArmor profile;
- a quota on the writable host bind and bounded disk-exhaustion behavior; and
- real-engine timeout, output-overflow, stop, and kill-path tests.

Trusted Xcode, Simulator, signing, archive, and TestFlight work remains on the
macOS build plane against an immutable candidate tree.
