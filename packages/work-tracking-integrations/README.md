# Work-tracking integrations

This package is the deterministic, provider-neutral planning and read-only
observation boundary for Jira and GitHub. It deliberately contains no HTTP
client and no mutation method. A separate authorized effect adapter may consume
its provision plan; this package can only validate snapshots, pin Jira work,
observe GitHub delivery state, and reconcile stable operation markers.

Safety properties:

- provider data is parsed as untrusted input with exact keys and bounded fields;
- credentials are accepted only as macOS Keychain references, never values;
- plan operations and correlation markers are stable across input ordering;
- Jira ingestion is bound to an exact provider revision and content digest;
- base-branch movement requires replanning and re-verification;
- an ambiguous send is never retried merely because a read returned nothing;
- duplicate marker matches require manual intervention; and
- cross-project work is explicit instead of being copied into unrelated plans.

The read port is intentionally tiny, so production adapters, recordings, and
fakes all pass through the same validation and reconciliation logic.
