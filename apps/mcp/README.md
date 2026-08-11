# MCP

Thin stdio protocol bridge for supported local Codex and Claude clients. It
connects to the daemon through a mode-0600 Unix socket, writes protocol frames
only to stdout, and routes logs to stderr. It contains no workflow logic and
cannot bypass typed approvals.
