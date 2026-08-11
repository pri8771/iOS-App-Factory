# CLI

Thin client for the typed App Factory command service. Business logic does not
belong in this package.

Set `APP_FACTORY_SOCKET` and `APP_FACTORY_AUTH_TOKEN`, then use `doctor`,
`submit --task`, `run --task`, `status`, `events`, `pause`, `resume`, `cancel`,
or `reconcile`. Add `--json` for a stable machine-readable envelope. Task files
are parsed as strict TaskSpec V1 documents before transmission.
