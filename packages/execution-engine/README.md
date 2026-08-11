# Verified execution engine

This package owns the local boundary between an untrusted coding run and a
Factory-authored Git commit. The coding agent may only leave dirty,
uncommitted files in its isolated attempt worktree. The coordinator then:

1. synthesizes and policy-checks the candidate tree without trusting the
   agent's Git index;
2. runs trusted checks in a separate detached, clean, read-only checkout;
3. obtains a digest-bound review from a distinct, read-only reviewer run;
4. asks the fence callback before each external phase, immediately before the
   broker mutates Git, again between commit-object creation and marker-ref
   publication, and before every durable checkpoint;
5. creates one deterministic broker-owned commit under an attempt marker ref;
6. publishes and re-verifies a content-addressed evidence index.

`ExecutionCheckpointPort` is deliberately injected. Its compare-and-set
contract must be durable. `FileExecutionCheckpointStore` is the local default:
it stores an immutable, contiguous revision history and atomically publishes
each revision with a hard link. Same-fence revisions advance exactly one phase;
a first revision cannot claim later-phase evidence. A restart replays the phase machine. The
semantic input digest deliberately excludes the renewable lease fence. A
reclaimer with the same semantic input and a higher fence must first publish a
same-phase checkpoint revision that adopts its fence; lower-fence writers and
stale checkpoint revisions then fail closed. A completed checkpoint is the
exception: a later owner verifies and returns its immutable historical evidence
without relabeling it with the newer fence. If a process stops after Git
created the commit but before the checkpoint, the attempt marker, base, tree,
digest, message, and broker identity reconcile to the same commit object; a
conflicting marker fails closed.

The evidence index binds the exact TaskSpec, normalized candidate policy,
repository identity, base commit, candidate tree and canonical patch, trusted
verification-plan bundle, check IDs, argument vectors, tool versions, test
output, reviewer descriptor, review input/report, broker commit object, and
the implementing run's canonical agent-event log. That log is an immutable,
identity-bound run artifact—not the kernel attempt event stream that continues
to grow when a lease is reclaimed. Its sequence must start once, remain
contiguous under one run/attempt/step/fence, and end once with a successful
terminal event. `verifyExecutionEvidenceIndex` reads every content-addressed
object again, recomputes the semantic input digest, reconstructs the Git
candidate and broker commit, requires the reviewer's raw-evidence list to be
exact and complete, and rejects missing, malformed, conflicting, or tampered
evidence.

The agent invocation itself remains outside this package and is expected to
use `@app-factory/agent-runner` under `@app-factory/process-supervisor`; its
successful result does not bypass any coordinator gate.
