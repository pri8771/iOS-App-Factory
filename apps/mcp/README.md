# App Factory MCP server

This local stdio server is a thin client of the authenticated Factory daemon.
It gives ChatGPT, Claude, Cursor, Codex, and other MCP hosts the same typed
commands as the CLI without direct access to SQLite, project repositories, or
provider credentials.

The MCP process receives only the daemon socket path and authorization value.
It writes protocol frames exclusively to stdout and diagnostics exclusively to
stderr. Read tools are available immediately; mutations still pass through the
daemon's durable command, policy, approval, lease, and reconciliation layers.

`factory_evidence_list`, `factory_evidence_inspect`, and
`factory_evidence_verify` are read-only daemon calls. They expose bounded
manifest metadata and recompute content-addressed evidence/artifact digests;
the MCP process never opens the evidence directory itself.

`factory_portfolio_snapshot` is also read-only. It returns the bounded local
portfolio read model and preserves unavailable Jira, GitHub, quality, release,
and analytics fields as null rather than fabricating zero values.

Mutation tools accept optional `commandId` and `issuedAt` fields as a pair. A
post-dispatch timeout, cancellation, connection loss, or invalid response
returns `error.retryIdentity` when the outcome is unknown. The host must retry
the same tool with the same semantic arguments plus those two returned fields;
changing the payload creates an identity conflict rather than a second effect.
Pre-dispatch cancellation and known terminal failures do not return a retry
identity.
