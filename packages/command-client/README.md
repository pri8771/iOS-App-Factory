# Command client

Typed daemon client used by the CLI and future MCP/dashboard clients. It speaks
only the V1 command protocol and never imports or opens the kernel database.

Call `createIdentity()` before an operation when it may need retry. The identity
retains `commandId`, `requestId`, and the canonical original `issuedAt`.
Reusing that identity retries the exact delivery against a live daemon. Use
`createRetryIdentity(original)` to preserve `commandId` and `issuedAt` while
creating a new `requestId` after daemon restart, replay eviction, or an
ambiguous timeout. The injected daemon handler is responsible for durable
command idempotency.

Closing a client terminates all active sockets and makes future calls fail
closed.
