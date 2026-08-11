# Effect worker

The effect worker is the only orchestration layer that calls registered
external-provider adapters. It claims the durable outbox, marks a send before
invocation, fences every adapter call, and converts timeouts or uncertain
results into reconciliation work instead of retrying a mutation blindly.

One absolute deadline covers payload loading, the provider call, evidence
sanitization, and observation attestation. Every port receives that deadline
and an abort signal. The worker performs a fresh synchronous claim check
immediately before each durable outcome mutation and zeroizes provider detail
buffers on success, validation failure, cancellation, timeout, and late
fulfillment.

Provider details cross a trusted sanitizing evidence port before persistence.
The worker receives only Keychain references, never credential values. A
provider observation must also be issued by a separate attestation port; the
kernel independently verifies that attestation before accepting it. The
attestation is bound to the exact invoked adapter ID and version. A missing or
ambiguous confirmation cannot erase an already attested resource: the kernel
records a state-preserving deferred reconciliation instead.
