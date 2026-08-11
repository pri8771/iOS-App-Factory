# Local command dashboard

The dashboard is a loopback-only view over the typed command client. It never
opens SQLite and never calls Jira, GitHub, Apple, or another provider directly.

The server keeps the daemon authorization outside browser JavaScript. An
operator opens a one-time tokenized URL, receives a strict HttpOnly session
cookie, and all mutations also require a per-process CSRF token. The service
binds only `127.0.0.1`, validates Host and Origin, caps request bodies, and ships
a restrictive content-security policy.

The first functional surface provides daemon health, exact attempt status and
timeline, pause/resume/cancel, and project- or portfolio-wide reconciliation.
Additional panels consume the same command port; they do not create another
workflow database.

This command center intentionally remains local. Hosting it would expose a
control-plane bridge and is outside the V1 security model.
