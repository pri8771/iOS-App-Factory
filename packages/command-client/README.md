# Command client

Typed daemon client used by the CLI and future MCP/dashboard clients. It speaks
only the V1 command protocol and never imports or opens the kernel database.

Call `createIdentity()` before an operation when it may need retry. Reusing both
IDs retries the same delivery against a live daemon. Reusing `commandId` with a
new `requestId` is the recovery path across daemon restart or an ambiguous
timeout. The injected daemon handler is responsible for durable command
idempotency.

Closing a client terminates all active sockets and makes future calls fail
closed.
