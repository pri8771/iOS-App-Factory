# Adapter SDK

This package is the only provider-neutral boundary used by effect workers. A
validated adapter can preflight capabilities, send one already-authorized
effect, and reconcile ambiguous provider state. It cannot approve, persist,
confirm, or transition an effect.

Important properties:

- credentials are represented only by macOS Keychain references;
- dispatch requires a durably `sent` effect, verifies the exact persisted
  payload digest and provider, and rechecks its fenced outbox claim immediately
  before provider I/O;
- adapter input and output are validated and byte buffers are copied;
- timeouts become ambiguous reconciliation work, never implicit retries; and
- one deterministic registry entry exists per provider.

Provider implementations may depend on this package and contracts, but may not
import the kernel or receive its database handle.
