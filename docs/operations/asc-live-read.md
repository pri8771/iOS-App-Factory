# App Store Connect — first live read (2026-08-17)

> Step B (2026-08-18) composed this observer inside the daemon and surfaced it in Studio: see [`release-rail.md`](release-rail.md).

The first live App Store Connect call ever made from this repository's code:
one manual, **strictly read-only** invocation of
`scripts/ops/asc-live-read.mjs` driving
[`packages/asc-adapter`](../../packages/asc-adapter/README.md) through the
sanctioned `provider-transport` fetch transport and the credential broker.
Outside CI, outside any test run, on branch `p6/asc-read-observer`.

## What ran

| Field             | Value                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live invocations  | **1** (no retry, no config fix needed)                                                                                                                                                                                                                                                                                                        |
| Started / elapsed | 2026-08-18T02:26:30.734Z (2026-08-17 22:26 local) · 8.53 s wall                                                                                                                                                                                                                                                                               |
| Credential        | Team API key, role App Manager, key ID `HGUBSYYP6G`, issuer `69a6de8c-b017-47e3-e053-5b8c7c11a4d1`; the `.p8` lives only in the login Keychain as service `app-factory-asc-key` / account `HGUBSYYP6G` and was resolved just in time by `createCredentialBroker` inside each request's `withCredential` window (preflight without `-w` first) |
| Auth              | one ES256 JWT per request (`kid HGUBSYYP6G`, `iss` issuer, `iat`, `exp = iat + 600 s`, `aud appstoreconnect-v1`; no `scope` claim on this run), signed by `createAscJwtAuthorization`, sent only as the `authorization` header of that one `fetch`                                                                                            |
| Requests          | **25 GETs**, methods `["GET"]` only: `GET /v1/apps?limit=200` (1 page) then per app `GET /v1/builds?filter[app]=<id>&sort=-uploadedDate&limit=5&include=buildBetaDetail,preReleaseVersion` and `GET /v1/apps/<id>/appStoreVersions?limit=200`                                                                                                 |
| Statuses          | 25 × **200**. No 401, 403, 429, 3xx, or transport error                                                                                                                                                                                                                                                                                       |
| Latency           | 161–843 ms per request (first `/v1/apps` 444 ms)                                                                                                                                                                                                                                                                                              |
| Rate limit        | `x-rate-limit: user-hour-lim:3600;user-hour-rem:3599` on the first response, `…rem:3575` on the last — 25 counted, as expected                                                                                                                                                                                                                |
| Retained headers  | `content-type`, `date`, `x-apple-jingle-correlation-key`, `x-rate-limit`, `x-request-id` (Apple's other headers were dropped by the allowlist, not failed on)                                                                                                                                                                                 |
| Results directory | `~/.app-factory-asc-smoke/results/2026-08-18T02-26-30.734Z/` (`0700`; files `0600`): `summary.json`, `exchanges.json` + `exchanges/NNN.body.json` × 25, `apps.json`, `observations.json`, `projections.json`. A grep for `eyJ`, `Bearer`, and `PRIVATE KEY` across the directory finds nothing                                                |
| Apps observed     | **12** (the account holds more than the six portfolio apps); every app's builds and App Store versions observations were `observed`                                                                                                                                                                                                           |

## Projected release-stage table

Every instant below is Apple's `uploadedDate`, normalized to UTC; nothing was
guessed. `projectedStage` is the highest `RELEASE_STAGE_ORDER_V1` stage App
Store Connect can prove for the latest build (see the projection rules in the
package README).

| App                          | Bundle ID                              | Latest build (marketing (build) · processing · internal TF state · uploaded) | Store version · state              | Projected stage                 | Basis                                     |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------- | ----------------------------------------- |
| Mala: A Quiet Digital Mala   | `com.priyansh.mala`                    | 1.0 (2) · VALID · IN_BETA_TESTING · 2026-08-06T20:34:14Z                     | 1.0 · WAITING_FOR_REVIEW (IOS)     | `internal-testflight-available` | `build-in-internal-testing`               |
| Hindsight — Decision Journal | `com.pchordia.hindsight`               | 1.0 (4) · VALID · READY_FOR_BETA_TESTING · 2026-08-10T17:16:02Z              | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `processing`                    | `build-processed-not-in-internal-testing` |
| Svara                        | `com.primandir.svara`                  | 1.0 (5) · VALID · READY_FOR_BETA_TESTING · 2026-08-14T22:31:57Z              | 1.0 · WAITING_FOR_REVIEW (IOS)     | `processing`                    | `build-processed-not-in-internal-testing` |
| Anjali                       | `app.anjali.Anjali`                    | 1.0 (4) · VALID · IN_BETA_TESTING · 2026-08-14T22:31:05Z                     | 1.0 · WAITING_FOR_REVIEW (IOS)     | `internal-testflight-available` | `build-in-internal-testing`               |
| AuraFit: Scan Your Fit       | `com.pchordia.aurafit`                 | 1.0 (2) · VALID · READY_FOR_BETA_TESTING · 2026-08-14T00:42:24Z              | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `processing`                    | `build-processed-not-in-internal-testing` |
| Roam: Travel Map             | `com.localfirst.roam`                  | 1.0 (4) · VALID · READY_FOR_BETA_TESTING · 2026-08-16T21:27:49Z              | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `processing`                    | `build-processed-not-in-internal-testing` |
| digital_temple               | `com.priyanshchordia.digitaltemple`    | 1.0 (14) · VALID · READY_FOR_BETA_TESTING · 2026-06-22T15:32:07Z             | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `processing`                    | `build-processed-not-in-internal-testing` |
| Dollar Per Life              | `com.pc.dpl`                           | 1.01 (6) · VALID · EXPIRED · 2019-03-20T23:50:24Z · expired                  | 1.0 · REJECTED (IOS)               | `processing`                    | `build-expired`                           |
| YourGovt                     | `Priyansh-Chordia.CongressApp`         | 1.0.2 (3) · VALID · EXPIRED · 2016-09-01T21:21:43Z · expired                 | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `processing`                    | `build-expired`                           |
| MeetYourCongress             | `com.PC.govtApp`                       | none                                                                         | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `null`                          | `no-build-observed`                       |
| SeeYourRep                   | `com.PriyanshChordia.govtApp`          | none                                                                         | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `null`                          | `no-build-observed`                       |
| VGScoreKeeper                | `com.Priyansh-Chordia.GameScoreKeeper` | none                                                                         | 1.0 · PREPARE_FOR_SUBMISSION (IOS) | `null`                          | `no-build-observed`                       |

The six portfolio apps (Mala, Hindsight, Svara, Anjali, AuraFit, Roam) are all
present with the bundle IDs above; the other six are older App Store Connect
records on the same team.

## What this proves

- The Keychain-held ASC team key works end to end through the repository's
  own trust boundary: broker (just-in-time, zeroized) → fetch transport
  (origin-bound, deadline, byte cap, no redirects) → ES256 JWT derivation →
  App Store Connect accepted every token (25/25 `200`).
- The JSON:API parsing, bounded pagination, `include` handling
  (`buildBetaDetail`, `preReleaseVersion`), state-token transport, and the
  release-stage projection all hold against real Apple responses for 12 apps
  with 0–5 builds each and one App Store version each.
- No secret reached disk, stdout, or an error string; the results directory
  is `0700`/`0600` and contains no token- or PEM-shaped text.

## What this does not prove

- Nothing about writes. No upload, submission, metadata edit, tester-group
  change, or any non-GET request was attempted, and the adapter cannot build
  one.
- Nothing about the release pipeline. No `ReleaseManifestV1` exists or was
  advanced; the projection is an observation Studio may later surface.
- The optional per-request JWT `scope` claim was not exercised (off by
  default); its live matching rules remain unproven.
- Only single-page collections were seen live (12 apps, ≤ 5 builds, 1
  version each); multi-page `links.next` following is covered by tests only.
- Rate-limit behaviour beyond reading `x-rate-limit` (25 of 3600 per hour
  consumed) was not exercised; 429 handling is covered by tests only.
