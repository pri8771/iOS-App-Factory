# Policy engine

The policy engine compiles one versioned policy source into the repository's
canonical `AGENTS.md`, minimal Claude/Cursor/Antigravity adapters, and a
digest-bound `PolicyLockV1`.

Generated files are delivery hints, not the trust boundary. Before an agent
runs, the broker verifies every file byte-for-byte without following symlinks
and records the exact resolved instruction files and policy digest. Protected
paths, trusted checks, independent review, and approval rules enforce the same
policy even if a client ignores prose.

The package only plans and verifies files. Enrollment applies a reviewed bundle
in a Factory-owned workspace and must revalidate the bundle digest immediately
before any broker-owned commit.
