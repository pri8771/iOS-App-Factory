# Service manager

Builds a deterministic, secret-free macOS user LaunchAgent plan for the
Factory daemon. Planning and inspection are read-only. Applying a plan is an
explicit external effect and must be bound to the returned plan digest.

The plist contains an authorization **file path**, never the authorization
token. The daemon independently rejects symlinked, non-private, wrong-owner,
or malformed authorization files.

Use the boundary-safe bootstrap executable separately from the normal `factory`
client:

```sh
pnpm service plan --config /absolute/path/to/service.json
pnpm service status --config /absolute/path/to/service.json
```

Installed package distributions also expose the equivalent `factory-service`
binary.

Add `--json` for a stable envelope. `install`, `uninstall`, and `logs` remain
unavailable until the explicit human installation gate. A serialized receipt is
informational only and is never accepted as authority to replace a plist.
