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
mutation. Protected or out-of-scope paths, submodules, escaping symlinks,
binary/oversized diffs, and case collisions are rejected. The result binds the
base SHA, candidate tree ID, canonical patch, and stable SHA-256 digests without
moving agent `HEAD`.

`createTrustedVerificationCheckout` creates a second detached checkout from the
verified candidate tree and removes write bits recursively. It uses a
deterministic verifier-only commit with fixed identity and metadata; this is not
the broker's eventual reviewed commit. The candidate tree ID remains a separate
field in its ownership record. Only the trusted daemon/verifier should receive
that path; agent permission profiles must expose the attempt worktree and must
omit the verification tree.

Cleanup is deliberately fail-closed. It validates the private ownership marker,
deterministic path, Git administrative directory, common mirror, and nonce
before asking Git to remove the exact worktree. It never recursively deletes an
unresolved caller-provided path.
