# App Factory MCP server

This local stdio server is a thin client of the authenticated Factory daemon.
It gives ChatGPT, Claude, Cursor, Codex, and other MCP hosts the same typed
commands as the CLI without direct access to SQLite, project repositories, or
provider credentials.

The MCP process receives only the daemon socket path and authorization value.
It writes protocol frames exclusively to stdout and diagnostics exclusively to
stderr. Read tools are available immediately; mutations still pass through the
daemon's durable command, policy, approval, lease, and reconciliation layers.
