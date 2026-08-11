# Process supervisor

Per-attempt child-process entrypoint. It records process identity and fencing,
normalizes replayable events, controls process groups, and supports orphan
reconciliation without becoming a second scheduler.

Identity V1 remains readable for compatibility but cannot authorize signaling a
leaderless group. V2 may bind one primary-child PID/start-time/process-group
witness. A live group with a missing leader is signaled only when that witness
still matches; absent, reused, or unprovable identity fails closed and retains
state. Termination polls the whole group rather than equating leader exit with
group exit.

State replacement and removal require the exact expected record and hold a
private `O_EXCL` mutation lock across comparison and publication/removal. An
interrupted mutation deliberately leaves that lock behind, so later writers
fail closed until a future identity-aware lock-recovery layer handles it.
State paths must be absolute and normalized; every directory component is
checked before and after directory creation, and symbolic-link ancestors are
rejected rather than followed.

## Durable supervised runs

`prepareSupervisedRun` writes one immutable, private intent before any process
is launched. `launchPreparedSupervisedRun` then writes a one-shot launch claim
and returns a local registration token while a detached controller continues.
The controller first fsyncs its own V2 identity, then launches a detached target
gate in a different process group, fsyncs the gate's V2 identity and execution
authorization, sends `EXEC`, and fsyncs a gate-release marker only after the
bound stdin is accepted. The gate independently revalidates the controller,
target, and authorization before exec. It exits on control-channel EOF and uses
the pinned Node 24 `process.execve` only after the exact permission frame, so
the target retains the registered PID, start identity, and process-group ID.

The target receives only the intent's explicitly allowed nonsecret environment
and a complete argv vector whose first element is the executable. Credential-
like environment names and credential-shaped arguments are rejected. The
controller and gate inherit no ambient environment. Stdout and stderr go to
bounded `0600` spools; their hashes, captured/observed lengths, truncation,
process result, and termination origin are bound into a canonical receipt.
Spools and receipt are fsynced before exact-record state removal.

On restart, use `openPreparedSupervisedRun` followed by
`inspectSupervisedRun`/`reconcileSupervisedRun`. A terminal receipt is replayed,
controller and target identities that match the current probe are adopted, and an incomplete
launch phase, missing controller/receipt, reused identity, unprovable group, or
stale state mutation lock blocks without relaunch. A live target whose
controller died is eligible only for probe-authorized termination, never adoption.
A stale mutation lock is intentionally not auto-deleted; the
reported blocker requires an operator to prove both writer and target identity
before recovery.

## Unresolved containment and identity blockers

This package's process-group protocol is not an operating-system containment
boundary. A target can create a new session/process group (for example with
`setsid` or a detached child), close its inherited streams, and then exit. The
original group can consequently be proven empty and receive a successful
receipt while the escaped process remains live. Do not use this protocol as the
sole boundary for an agent or command that can detach descendants. Autonomous
use remains blocked until a stronger platform boundary can enumerate and stop
all descendants across group/session changes (or detachment is prevented by a
trusted sandbox). A PGID-only partial fix must not be described as containment.

The current system probe also derives process start identity from `ps lstart`,
which has second-level resolution. Boot identity prevents cross-boot reuse, but
rapid same-boot PID/PGID reuse within one second cannot be distinguished. The
persisted witness therefore fails closed for ordinary mismatches but is not a
cryptographically or kernel-generation-exact process identity. Production
signaling that requires that stronger guarantee remains blocked on a native
platform witness (for example Linux start ticks and the corresponding Darwin
process start timeval).
