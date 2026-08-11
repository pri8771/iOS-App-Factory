# CLI

Thin client for the typed App Factory command service. Business logic does not
belong in this package.

Set `APP_FACTORY_SOCKET` and `APP_FACTORY_AUTH_TOKEN`, then use `doctor`,
`submit --task`, `run --task`, `status`, `events`, `pause`, `resume`, `cancel`,
or `reconcile`. Add `--json` for a stable machine-readable envelope. Task files
are parsed as strict TaskSpec V1 documents before transmission.

LaunchAgent bootstrap inspection is intentionally separate: use
`pnpm service plan --config /absolute/path/to/service.json` or
`pnpm service status --config /absolute/path/to/service.json`. The `factory`
client never imports service-management or bypasses the daemon command boundary.
