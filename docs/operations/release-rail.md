# Release rail — `release.observe` / `release.projection` (Phase 6, step B)

Studio's release rail is the first App Store Connect surface inside the daemon
and the Mac app: the read-only observer that
[`asc-live-read.md`](asc-live-read.md) proved by hand on 2026-08-17 is now
composed by the daemon itself, behind an opt-in configuration file, and its
observations are persisted and served to Studio. It is still strictly
observation: no upload rail, no quality gate, no `ReleaseManifestV1` consumer,
and no write of any kind to Apple. Release and signing surfaces protected under
[`AGENTS.md`](../../AGENTS.md) are untouched.

## What was built

- **Contracts** (`packages/contracts/src/v1/release-observation.ts`):
  `AscReleaseObservationV1` (one observation: `observedAt` from the daemon's
  clock, the observer's `source` by name only — key ID, issuer ID, Keychain
  service/account — the `GET /v1/apps` outcome, one
  `AscAppReleaseObservationV1` per app sorted by name then `appId` with each
  per-app read's `AscReadOutcomeSummaryV1` and, only when both reads were
  observed, the existing `AscReleaseProjectionV1` from
  `projectAscReleaseStageV1`; `requestCount`, `statuses`, and a canonical
  `observationDigest`) and `ReleaseProjectionV1` (`observer` status —
  `configured` iff a source is composed, else `unavailableReason` — the
  `latest` observation or `null`, `observationCount`, `generatedAt`,
  `sourceDigest`). Two wire ops: `release.observe` (`{ buildsLimit: 1..200 }`)
  and `release.projection` (empty payload). JSON schemas regenerated
  (`asc-release-observation.v1.schema.json`, `release-projection.v1.schema.json`).
- **Kernel** migration `0014-asc-release-observations`: append-only, retained
  (UPDATE/DELETE rejected by trigger), one row per observation keyed by an
  `observation_id` derived from the `release.observe` command ID (a replayed
  command is a no-op), projected columns (`observed_at`, `key_id`,
  `issuer_id`, `keychain_*` names, `apps_outcome`, `app_count`,
  `request_count`, `observation_digest`) plus the full JSON.
  `AscReleaseObservationRepository` (`record`/`get`/`latest`/`count`).
- **Daemon** (`apps/daemon/src/release-command-runtime.ts`): the composed port
  — credential broker → `provider-transport` fetch transport with the ASC ES256
  JWT derivation → `createAscReadObserver` — built from
  `APP_FACTORY_ASC_OBSERVER_CONFIG` (JSON: `schemaVersion`, `keyId`,
  `issuerId`, `credentialReference {service, account}`, optional
  `requestTimeoutMs`/`jwtTtlSeconds`; read through the same private-file
  discipline as every other daemon config; a `privateKey` key is refused). The
  observation is taken **outside** the command runtime's serial executor —
  Apple's answer takes seconds and must not stall every other command — and
  persisted + journaled inside it, so `release.observe` is a durable,
  idempotent command like every other mutating op. Unconfigured daemons refuse
  `release.observe` with `release.observer-not-configured` (not retryable) and
  still serve persisted observations through `release.projection`.
- **Command client + CLI**: `observeRelease` / `releaseProjection` (client
  re-verifies `sourceDigest`); `factory release observe [--builds-limit N]`,
  `factory release projection`.
- **Studio** (`apps/studio-mac`): `Models/Release.swift` (`ReleaseStage` in
  `RELEASE_STAGE_ORDER_V1` order, `AscReleaseProjection`,
  `AscReleaseObservation`, `ReleaseProjection`),
  `ReleaseProjectionDigest` (client-side re-verification),
  `DaemonClient.releaseProjection()` / `.observeRelease(buildsLimit:)`,
  `StudioStore.refresh()` reads the projection (unsupported-operation fallback
  → no rail, no error, like `studio.snapshot`), `observeRelease()` dispatches
  the read and re-reads, and `Dashboard/ReleaseRailView.swift` renders one row
  per app (name + bundle ID, latest build with Apple's processing/internal
  state and `uploadedDate`, store version + state, projected stage chip with
  its basis) under a header badged `live · release.projection` with the
  observation's own `observedAt` and request count — or `not yet sourced` with
  the daemon's reason. A per-app read Apple refused renders `denied · <code>`
  and the stage cell prints dashed-red **won't guess**; "no build" is printed
  as the honest fact it is. The "Observe App Store Connect" control is
  machine-cyan (the human initiates a machine read; nothing here awaits the
  human, so nothing is gold) and disabled — not hidden — when the daemon has no
  observer configured, so the reason stays visible.
- **Tests**: contracts (schema invariants, digests, protocol tables), kernel
  (repository idempotency/conflict/retention), daemon (`release.*` boundary
  through an in-memory ASC: GET-only, no credential header ever reaches the
  transport, canonical order, denied-by-role cell, replay without a second
  read, restart survives with the observer inert, failure → retryable
  `release.observe-failed`, config parser drift), command-client, and Studio
  (fixture decoding recorded through the real contracts by
  `apps/studio-mac/scripts/record-release-fixtures.mjs`, digest verification,
  client round-trips, store refresh/observe/refusal, and rail snapshots in
  both appearances).

## Live run — 2026-08-18T17:11:38Z (through the daemon)

Branch `p6/studio-release-projection` off `integration/studio-wave1`
(`a4f6ff3`), daemon `0.1.0-release-rail-smoke` on a throwaway runtime
`/private/tmp/af-p6b-live/runtime`, `APP_FACTORY_ASC_OBSERVER_CONFIG`
naming Keychain `{ service: "app-factory-asc-key", account: "HGUBSYYP6G" }`
(presence confirmed by name only; the `.p8` was resolved inside the broker
window and never read outside it).

| Step                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `factory release projection` (before)      | `observer: configured (key HGUBSYYP6G, keychain app-factory-asc-key/HGUBSYYP6G)`, `observations persisted: 0`, latest none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `factory release observe --builds-limit 5` | 9.2 s wall. Observation `975c3c73-6ef8-5c68-8fe0-9cfce09cee5b` at `2026-08-18T17:11:38.456Z`: **25 GETs, 25 × 200**, apps `observed`, **12 apps** (all six portfolio apps included). Digest `sha256:7356cbf8e781926e7941eff…`. Projected stages as Apple reported them at that instant: Anjali `1.0 (4)` IN_BETA_TESTING → `internal-testflight-available`; Mala `1.0 (2)` IN_BETA_TESTING → `internal-testflight-available`; Hindsight `1.0 (4)`, Roam `1.0 (4)`, Svara `1.0 (5)`, AuraFit `1.0 (2)` READY_FOR_BETA_TESTING → `processing` (basis `build-processed-not-in-internal-testing`); store versions Anjali/Mala/Svara `WAITING_FOR_REVIEW`, the rest `PREPARE_FOR_SUBMISSION`. |
| `factory release projection` (after)       | `observations persisted: 1`, latest = the observation above; the CLI's `sourceDigest` re-verification passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Durable row                                | `asc_release_observations`: `975c3c73-…` \| `2026-08-18T17:11:38.456Z` \| `HGUBSYYP6G` \| `observed` \| `12` \| `25`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Secret scan                                | `BEGIN PRIVATE` / `Bearer ` / `eyJ` over the wire JSON: 0 hits; `authorization`/`Bearer` in the daemon log: 0 hits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

The same 25 × 200 / 12 apps the hand-run smoke reported on 2026-08-17 — now
taken by the daemon on request, persisted, and served back digest-bound.

## What this proves / does not prove

Proven: the daemon can take a live, strictly read-only App Store Connect
observation through its own credential boundary on an operator's command,
persist it durably, and serve it to a client that re-verifies the digest; the
Studio rail renders it (fixture-recorded snapshots plus the store's live
`refresh`/`observeRelease` path against a fake daemon).

Not proven / not built: the Studio app was not run against this live daemon
in this session (the rail's live path is exercised by store tests against
recorded wire fixtures, not by a screenshot of the real app); no automatic
refresh cadence (the rail refreshes with the dashboard, and observes only when
asked); no mapping from Apple's app IDs to Studio's registered projects (the
registry has no bundle-ID field, so the rail lists apps as Apple names them and
claims no project link); no upload rail, quality gate, or `ReleaseManifestV1`
consumer; nothing about App Store Connect writes.
