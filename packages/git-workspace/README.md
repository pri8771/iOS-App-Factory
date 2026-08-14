# `@app-factory/git-workspace`

Factory-owned Git isolation and candidate diff verification.

The package never executes an agent in a user's checkout. It mirrors committed
Git objects into a private runtime root and creates a deterministic detached
worktree pinned to an explicit 40- or 64-character commit SHA. A dirty source
checkout is therefore harmless: uncommitted source files never enter the agent
workspace.

Coding agents do not commit. Candidate verification requires attempt `HEAD` to
remain exactly at the recorded base and treats its tracked and untracked dirty
files as the proposal. It inventories paths using Git's NUL-safe output,
prevalidates each filesystem entry without following symlinks, hashes file bytes
without Git filters, and builds a candidate tree in a private temporary index.
It then rechecks `HEAD`, status, modes, sizes, and byte digests to fail closed on
mutation. Protected or out-of-scope paths, test harnesses and fixtures, build or
dependency policy files, `.factory` metadata, submodules, escaping symlinks,
symlinks that resolve into `.git`, multi-linked files, binary/oversized diffs,
and case collisions are rejected. The result binds the base SHA, candidate tree
ID, canonical patch, and stable SHA-256 digests without moving agent `HEAD`.

Broker commit creation is idempotent under an attempt-owned marker ref. The
caller must supply an active-lease guard; it is checked before commit-object
creation and again immediately before the marker ref is published. A fence
loss at either boundary leaves the marker ref unpublished, while a retry
reconciles an existing marker only when all expected commit bindings match.

`createTrustedVerificationCheckout` creates a detached, ownership-isolated
checkout from the verified candidate tree and removes write bits recursively.
Concurrent or reclaimed workers never adopt the same verifier checkout, so a
stale worker can clean only the workspace named by its own nonce-bearing
ownership record. It uses a deterministic verifier-only commit with fixed
identity and metadata; this is not the broker's eventual reviewed commit. The
candidate tree ID remains a separate field in its ownership record. Only the
trusted daemon/verifier should receive that path; agent permission profiles must
expose the attempt worktree and must omit the verification tree.

Cleanup is deliberately fail-closed. It validates the private ownership marker,
deterministic path, Git administrative directory, common mirror, and nonce
before asking Git to remove the exact worktree. It never recursively deletes an
unresolved caller-provided path.

`prepareImmutableMirror` seals a mirror's enrollment onto one immutable
`allowedBaseCommit`/`allowedBaseTree`; by itself an enrolled project can
therefore deliver exactly one verified change. `advanceImmutableMirrorBase`
re-enrolls that mirror onto a NEW base taken from a broker commit produced by
a completed, fully verified attempt, without ever rewriting the original
sealed binding: it proves the supplied broker commit is the exact commit
recorded at its attempt ref (re-deriving it from the mirror's own Git objects
rather than trusting the caller's copy), proves that commit's parent equals
the caller's supplied current base so the enrolled history stays linear, and
appends the result as the next link in an on-disk, gap-checked, digest-chained
ledger rather than merging it into or overwriting any earlier link. Retrying
an already-completed advance with the exact same (binding, broker commit)
pair is always safe and idempotent; attempting a different advance from a
binding that a different link has already superseded is rejected as a
conflict.
