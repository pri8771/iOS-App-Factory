# Local command dashboard

The dashboard is a loopback-only view over the typed command client. It never
opens SQLite and never calls Jira, GitHub, Apple, or another provider directly.

The server keeps the daemon authorization outside browser JavaScript. An
operator opens a one-time tokenized URL, receives a strict HttpOnly session
cookie, and all mutations also require a per-process CSRF token. The service
binds only `127.0.0.1`, validates Host and Origin, caps request bodies, and ships
a restrictive content-security policy.

The Run monitor opens with an authoritative, refreshable work queue. It defaults
to active attempts, can switch to all attempts, can filter by an exact project
UUID, and uses a paired `(updatedAt, attemptId)` cursor for deterministic bounded
pagination. Selecting a queue row performs a fresh status and event read; the
navigation row is never treated as authoritative attempt detail. Manual attempt
UUID lookup remains available.

The same surface provides daemon health, exact attempt status and timeline,
pause/resume/cancel, and attempt reconciliation. Additional panels must consume
an authoritative typed port; they do not create another workflow database.

If an action's response is lost after dispatch, the browser retains the
returned durable identity and tells the operator to click that same action
again for an idempotent replay. A successful mutation or authoritative attempt
reload abandons every older retry identity for that attempt, so a later action
cannot accidentally replay a stale pause/resume/cancel result.

## Supported launcher

After `pnpm build`, start the packaged launcher with a private configuration
file:

```sh
node apps/dashboard/dist/main.js --config /absolute/path/to/dashboard.json
```

The strict V1 file contains paths, never the daemon credential itself:

```json
{
  "schemaVersion": 1,
  "socketPath": "/Users/example/Library/Application Support/AppFactory/runtime/daemon.sock",
  "authorizationFile": "/Users/example/Library/Application Support/AppFactory/auth/authorization",
  "port": 4317
}
```

Both the configuration and authorization files must be owned by the current
user, regular non-symlink files with no group/other permissions. The launcher
also accepts the same values directly from `APP_FACTORY_SOCKET`,
`APP_FACTORY_AUTH_FILE`, and optional `APP_FACTORY_DASHBOARD_PORT`. It does not
accept an inline authorization token.

The printed URL contains a random one-use browser token. Its successful
exchange creates a separate random HttpOnly session; neither value is the
daemon authorization. Treat the URL as private and stop the server with
Ctrl-C. `SIGINT` and `SIGTERM` both close the HTTP server and command client.

The packaged launcher reads `portfolio.snapshot` through the same authenticated
daemon command boundary. The browser never opens SQLite or provider APIs. The
snapshot is bounded to 1,000 projects, schema-validated, and its canonical
source digest is recomputed before rendering. Jira, GitHub, quality, release,
and analytics values remain visibly `unavailable` until an authoritative source
provides them; the dashboard never turns missing data into numeric zero. Library
consumers can still inject a compatible `DashboardPortfolioPort` for tests or a
separately composed authoritative source.

This command center intentionally remains local. Hosting it would expose a
control-plane bridge and is outside the V1 security model.
