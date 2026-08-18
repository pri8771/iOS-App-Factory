# App Store Connect adapter (read-only observer)

`@app-factory/asc-adapter` is a strict, **read-only** App Store Connect API v1
observer. It answers three questions and nothing else: which apps does the
team have, what are an app's latest builds (with TestFlight beta detail), and
what are an app's App Store versions — and it projects the latest
build/version onto the single 8-stage `RELEASE_STAGE_ORDER_V1` vocabulary
([ADR 0003](../../docs/architecture/0003-release-state-reconciliation.md)) so
Studio's release rail can later _surface_ what Apple can prove, not duplicate
it.

## What it is not

- It is not an upload rail, a submission client, or a metadata editor. There is
  no code path that builds a `POST`, `PATCH`, or `DELETE`, no request body, and
  no write endpoint string anywhere in the package. The only method the HTTP
  layer knows is `GET`.
- It does not advance a `ReleaseManifestV1`. `AscReleaseProjectionV1` is an
  observation; the release state machine, signing logic, and every protected
  release surface in `AGENTS.md` are untouched.
- It does not invent dates. `uploadedAt` is Apple's `uploadedDate` or `null`;
  `internalTestFlightAvailableAt` is always `null` because App Store Connect
  does not report when a build became available to internal testers.
- It is not registered in the daemon and is not wired into any command,
  effect, or reconciliation loop. Its only current caller is the manual smoke
  script below.

## Trust boundary

The package sits on exactly the same boundary as
[`provider-http-adapters`](../provider-http-adapters/README.md):

- **No credential is ever seen here.** Observers receive a macOS Keychain
  `CredentialReferenceV1` (`service`/`account` of the `.p8` item) and pass it
  through `createProviderHttpRequest`, which binds every request to
  `credentialOrigin = https://api.appstoreconnect.apple.com`, HTTPS-only URLs,
  the request-header allowlist (`accept` only), a deadline, and a byte cap.
- **The sanctioned transport does the authentication.**
  [`provider-transport`](../provider-transport)'s
  `createFetchProviderHttpTransport` is the only way a live call is made. For
  App Store Connect it is composed with this package's
  `createAscJwtAuthorization`, a `ProviderAuthorizationDerivation` (a new,
  opt-in transport option; the default verbatim-header behaviour is unchanged
  for GitHub/Jira). Per request the transport asks the credential broker for
  the `.p8` **just in time**, the derivation signs one ES256 JWT (`alg: ES256`,
  `kid`, `typ: JWT`; `iss`, `iat`, `exp ≤ 20 min`, `aud: appstoreconnect-v1`)
  with `node:crypto`'s `sign` (no long-lived `KeyObject`), zeroizes its own
  decoded copy in a `finally`, and the broker zeroizes its buffer the moment
  the window closes. The transport then enforces the origin re-check, the
  deadline, the byte cap, `redirect: "manual"`, and zeroizes what it owns.
- **The token is short-lived and never leaves the transport.** It exists only
  as the outbound `authorization` header of one `fetch`. Exchange records
  (`AscExchangeRecordV1`) are built from the request _before_ the transport
  attaches the header; error text and evidence strings pass through
  `scrubSecrets`; a platform signing error is deliberately replaced by a fixed
  message so OpenSSL can never echo key fragments.
- **Responses are validated, not trusted.** Structural shape, JSON:API
  resource types, bounded page sizes (≤ 200, Apple's maximum), bounded
  `included`, `links.next` confined to the same origin + path (and rebuilt
  through `providerUrl` rather than dispatched verbatim), a page bound
  (`maxPages`), and per-field type/length checks before the zod contract
  parses. Only an explicit allowlist of response headers is retained
  (`content-type`, `date`, `etag`, `retry-after`, `x-rate-limit`,
  `x-apple-jingle-correlation-key`, `x-apple-request-uuid`, `x-request-id`);
  everything else Apple sends is dropped, because a live provider always sends
  headers no fixture anticipated. Unknown _attributes_ are tolerated for the
  same reason; every field the observer reads is checked strictly.
- **Outcomes are explicit.** `observed`, `denied` (401 `asc.unauthorized`,
  403 `asc.forbidden` — the key or its role, with only Apple's bounded error
  code/title), or `ambiguous` (`asc.transport-failed`, `asc.redirect-refused`,
  `asc.rate-limited`, `asc.not-found`, `asc.unexpected-status`,
  `asc.malformed-response`, `asc.page-bound-exceeded`). Nothing is retried.

## Contracts

`packages/contracts/src/v1/app-store-connect-read-model.ts` declares
`AscAppV1`, `AscBuildV1`, `AscAppStoreVersionV1`, and
`AscReleaseProjectionV1` (checked-in JSON Schema
`asc-release-projection.v1.schema.json`), plus the pure
`projectAscReleaseStageV1`. Apple state enumerations travel as bounded
upper-case tokens rather than closed enums so an Apple-added state can never
turn a real observation into an ambiguous one; `processingState` (a stable
closed set) is an enum.

Projection rules (the contract's `superRefine` enforces them):

| Latest build                                    | Projected stage                 | Basis                                     |
| ----------------------------------------------- | ------------------------------- | ----------------------------------------- |
| none                                            | `null`                          | `no-build-observed`                       |
| `expired`                                       | `processing`                    | `build-expired`                           |
| `processingState = PROCESSING`                  | `processing`                    | `build-processing`                        |
| `processingState = FAILED / INVALID`            | `processing`                    | `build-processing-failed`                 |
| `VALID`, `internalBuildState = IN_BETA_TESTING` | `internal-testflight-available` | `build-in-internal-testing`               |
| `VALID`, any other internal state               | `processing`                    | `build-processed-not-in-internal-testing` |

Stages before `uploaded` are local facts and are never projected;
`device-smoke-passed` is a human gate and is never projected. App Store
version state is carried alongside (`latestAppStoreVersion`) but does not
feed the TestFlight-internal stage vocabulary.

## Tests

`test/auth.test.ts` and `test/observer.test.ts` use a throwaway P-256 key
generated in-process and an injected in-memory transport: JWT header/claims
(decoded from the unsigned parts and verified with the throwaway public key),
`scope` claim shape, TTL/identifier bounds, key-material decoding variants,
no-secret-in-error, GET-only + `accept`-only + credential-origin per request,
page-size and page-count bounds, `links.next` confinement, redirect refusal,
401/403 classification, 429/404/5xx/malformed/transport-failure → ambiguous,
projection rules, evidence redaction, and an end-to-end pass through the real
`createFetchProviderHttpTransport` + `createCredentialBroker` with a fake
`security` port and fake `fetch` (asserts the Bearer JWT shape on the wire and
that the secret buffer is zero afterwards). No live call is made by any test.

## Manual live smoke (read-only)

`scripts/ops/asc-live-read.mjs` is **not** wired into `pnpm test` or
`pnpm verify`. It refuses to run without `AF_ASC_SMOKE_CONFIRM_LIVE=yes` and
takes every identity from the environment:

```sh
pnpm build
AF_ASC_SMOKE_CONFIRM_LIVE=yes \
AF_ASC_SMOKE_KEY_ID=<10-char key id> \
AF_ASC_SMOKE_ISSUER_ID=<issuer uuid> \
AF_ASC_SMOKE_KEY_SERVICE=<keychain service of the .p8 item> \
AF_ASC_SMOKE_RESULTS_ROOT=$HOME/.app-factory-asc-smoke/results \
node scripts/ops/asc-live-read.mjs
```

It preflights the Keychain item (metadata only, no `-w`), lists apps, and for
each app reads the latest 5 builds and the App Store versions, then writes
`summary.json`, `exchanges.json` (+ one scrubbed body file per exchange),
`apps.json`, `observations.json`, and `projections.json` under a `0700`
`<timestamp>/` directory and prints a compact table. The first live run is
recorded in [`docs/operations/asc-live-read.md`](../../docs/operations/asc-live-read.md).

Optional hardening not yet proven live: `AF_ASC_SMOKE_JWT_SCOPE=yes` adds a
per-request `scope` claim (`GET /path?query`) to each token.
