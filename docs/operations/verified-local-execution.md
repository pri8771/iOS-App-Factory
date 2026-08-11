# Verified local execution status

The daemon remains fake-by-default. Its supported opt-in operator profile is a
deterministic Swift Greeter walking slice. It proves the
scheduler-to-worktree-to-verifier-to-reviewer-to-broker-commit-to-evidence
path.

The repository also contains a Codex conformance adapter and profile loader.
They pin executable digest, CLI version, model, exact environment, structured
output schema, and supervised invocation identity. A no-network fake
executable passes the actual detached-supervisor and V2 evidence path. The
operator daemon entrypoint deliberately does not expose this profile, and no
paid or real-model call was used to certify it. It is not a general autonomous
development integration. See [ADR 0002](../architecture/0002-untrusted-agent-containment.md).

Set `APP_FACTORY_LOCAL_EXECUTION_CONFIG` to an absolute path naming a current-user-owned `0600` JSON file:

```json
{
  "schemaVersion": 1,
  "mode": "swift-greeter-fixture-v1",
  "repositoryId": "62000000-0000-4000-8000-000000000002",
  "sourceRepositoryPath": "/absolute/path/to/a/clean/swift-greeter-repository",
  "policyFile": "/absolute/path/to/reviewed-policy.txt"
}
```

The configuration shape is exact and contains no credentials. The configuration and policy files must be bounded, private regular files. Enrollment rejects non-core repository configuration before invoking Git, uses sanitized read-only plumbing commands, and inventories tracked, ignored, and untracked checkout paths with Node rather than `git status`; a repository-local fsmonitor, hook, alias, pager, or include therefore cannot run as an enrollment probe. Enrollment fails unless `HEAD` has the exact reviewed SHA-1 tree, manifest, modes, and SHA-256 file contents. The daemon pins that exact commit and tree. `/usr/bin/git`, `/usr/bin/swift`, and `/usr/bin/grep` are fixed, root-owned, non-writable executables; tool versions are probed for the evidence plan.

Before the command socket starts, enrollment copies the exact commit into a
Factory-owned mirror, proves the copied commit/tree, re-inspects the source,
and atomically publishes an immutable binding containing the repository,
source-identity, commit, tree, and mirror path. Attempts and restart recovery
open only that sealed mirror: they never fetch from the mutable source checkout,
and the normal refresh API rejects a sealed mirror. The local threat model
assumes another process running as the same macOS user is not deliberately
racing configuration loading before singleton daemon ownership is acquired;
general multi-user or hostile-same-user execution is outside this fixture's
boundary.

The in-process fixture agent can write only `Sources/Greeter/GreetingFormatter.swift`. Trusted checks run in a separate read-only checkout. Each check receives a private scratch identity bound to attempt, lease fence, check ID, and checkout nonce; Swift's explicit `--scratch-path`, `HOME`, `TMPDIR`, and `SWIFTPM_BUILD_DIR` all resolve beneath it. Graceful cancellation terminates the verifier process group, escalates to `SIGKILL` after the bounded grace period, and removes that exact scratch identity. Mirror and worktree creation use durable publication intents so restart can discard an incomplete Git mutation or adopt a fully marker-bound result. A separately identified read-only reviewer loads the candidate blob from the Factory mirror and returns a bound P1 finding if it differs from the reviewed result. Only then may the Git broker publish one marker-bound commit and its evidence index. The configured source checkout is never modified.

Enrollment also pins a digest of the fixture's exact title, objective, and
ordered acceptance criteria. A TaskSpec with otherwise valid repository,
policy, and scope bindings fails before agent execution if its semantics differ.
Agent-result and Git publication recovery remove only publisher-shaped private
temporary links whose device/inode exactly match the durable target; any
unknown hard link remains a fail-closed error. Verifier termination has an
independent deadline even when an escaped descendant retains stdout/stderr;
that case fails bounded and preserves scratch for operator investigation.

Completed executions publish one immutable manifest covering the agent event
log, every trusted test record and its stdout/stderr, independent review, broker
commit, and bound inputs. `evidence verify` recomputes storage and reference
integrity; it does not re-certify execution semantics. Only an explicitly
classified transient publication interruption replays from the completed
coordinator checkpoint. A collision, corrupt manifest, permission failure, or
other unclassified publication error fails the attempt terminally for operator
intervention instead of retrying forever.

A supervised adapter first publishes a V2 agent-result journal containing
content-addressed run spec, result, ordered events, raw stdout/stderr,
invocation descriptor, supervisor intent, and supervisor receipt. The daemon
checks the descriptor against the enrolled executable path/digest, CLI version,
model, and exact environment names, and recomputes every intent/receipt/output
binding before publication. Trusted identity enrollment requires the complete
V2 envelope on live execution and replay; an enrolled project rejects a V1
journal rather than silently downgrading. A successful verified execution may add an
`agent-run` evidence item; the required manifest kinds remain `event-log`,
`verification`, `review`, and `commit` for backward compatibility. `evidence
verify` checks immutable storage and reference integrity; it does not rerun or
semantically recertify the execution. A durable blocked or failed V2 result is
terminal for that attempt. Changed inputs require a new attempt.

Host supervised-run startup reconciliation now occurs before daemon readiness;
a live adopted run or ambiguous identity denies startup rather than allowing a
new launch. That does not make a process group a containment boundary. A target
can detach a descendant, and Darwin process-start identity is not
kernel-generation-exact. General live-agent execution therefore remains
blocked by [ADR 0002](../architecture/0002-untrusted-agent-containment.md). The
trusted verifier has a separate limitation: its process identity is not yet
restart-adoptable after an uncatchable daemon `SIGKILL`, so scratch is retained
for investigation rather than declared safe. See the
[process supervisor boundary](../../packages/process-supervisor/README.md).
