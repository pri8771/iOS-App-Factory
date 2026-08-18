# GitHub live read (Phase 5, step A)

The first live provider HTTP call this repository has ever made, made the
repository's own way: a macOS Keychain credential _reference_ resolved
just-in-time by `@app-factory/credential-broker` inside
`@app-factory/provider-transport`'s bounded fetch transport, dispatched to
`https://api.github.com` with `credentialOrigin` pinned to that origin, and
recorded through the strict `ProviderHttpRequestV1` / `ProviderHttpResponseV1`
envelopes. Strictly read-only: no mutation of any kind, no repository, PR,
comment, or branch created.

It is invoked by hand only, via `scripts/ops/github-live-read.mjs`
(`CONFIRM_LIVE=yes`, env-driven, never part of `pnpm test`/`pnpm verify`),
mirroring the pattern of the reviewer's
[first live smoke](llm-independent-review.md#first-live-smoke--2026-08-17).

## What was built

- **`packages/provider-http-adapters/src/github-owner-binding.ts`** -- the
  durable, digest-bound **GitHub owner binding** artifact and its pure
  producer/validator (`createGitHubOwnerBinding`, `parseGitHubOwnerBinding`,
  `assertGitHubOwnerBindingMatches`, `assertGitHubOwnerBindingCoversRepository`).
  The producer makes exactly one read-only GraphQL request
  (`viewer { id login }`, `repositoryOwner(login:) { __typename id login }`,
  one aliased `repository(owner:, name:) { id nameWithOwner isPrivate }` per
  enrolled repository) through an injected `BoundedProviderHttpTransport`; it
  never sees a credential. Tests use an in-memory transport only
  (`packages/provider-http-adapters/test/github-owner-binding.test.ts`).
- **`packages/provider-transport`** -- the fetch transport now projects a live
  response onto the bounded envelope by dropping every response header that
  is not on the `provider-http-adapters` allowlist
  (`isAllowedProviderResponseHeader`). Found by inspection before the run:
  a real GitHub answer carries `server`, `x-github-media-type`, `vary`,
  security headers, and so on, and the strict `validateProviderHttpResponse`
  rejects any non-allowlisted name, so without this projection every live
  call would have failed at the envelope validator before any status or body
  was visible. Deterministic test added; the validator itself is unchanged.
- **`scripts/ops/github-live-read.mjs`** -- the manual live smoke. It runs the
  broker's metadata-only preflight, the owner-binding proof, then (from the
  binding's `ownerNodeId`) the existing read observers in
  `packages/provider-http-adapters/src/github.ts` against each observed
  repository -- `observeRepository`, `observeChecks` on the default-branch
  head, and `observePullRequest` / `observeChecks` / `observePullRequestComments`
  for up to N open PRs -- plus one script-level, read-only discovery query per
  repository (default-branch head SHA and open PR numbers) because no
  existing observer lists them. `observeDelivery` and `findByCorrelation`
  are skipped (both start with the marker-gated repository observation), and
  the mutation adapter `createGitHubHttpAdapter` is not touched (it requires
  an `EffectPayloadReader` and is out of scope for a read-only proof). Every
  request/response envelope, timing, and allowlisted rate-limit header goes to
  `calls.jsonl` under a private results directory, redacted with
  `effect-worker`'s `redactProviderDetail`; the recording wrapper sits
  _outside_ the fetch transport, so it only ever sees the credential-free
  contract envelopes.

## Owner-binding artifact format (`GitHubOwnerBindingV1`)

```json
{
  "schemaVersion": 1,
  "provider": "github",
  "viewerLogin": "<login the credential authenticates as>",
  "viewerNodeId": "<its node ID>",
  "ownerLogin": "<enrolled owner>",
  "ownerNodeId": "<enrolled owner's node ID>",
  "ownerType": "User | Organization",
  "enrolledRepositories": ["owner/name", "..."],
  "observedRepositories": [
    { "fullName": "owner/name", "nodeId": "R_...", "visibility": "private" }
  ],
  "credentialReference": {
    "schemaVersion": 1,
    "kind": "macos-keychain",
    "service": "...",
    "account": "..."
  },
  "credentialOrigin": "https://api.github.com",
  "boundAt": "<ISO instant>",
  "bindingDigest": "sha256:<canonical JSON of every field above>"
}
```

Rules enforced by the producer and re-checked by the parser: for a `User`
owner the viewer must _be_ that user; every enrolled repository must belong to
`ownerLogin`; `observedRepositories` is the subset the credential could see
(GitHub's canonical `nameWithOwner`, matched case-insensitively) -- it is the
credential's observed scope, not a claim about the token's configured
permissions; only the Keychain service/account are recorded, never a value;
`bindingDigest` is recomputed on parse so an edited artifact fails closed.
`assertGitHubOwnerBindingMatches` is the consumer gate: an observer/adapter
may only be constructed with an `owner` / `ownerNodeId` / credential
reference / credential origin that a valid binding proved.

## First live run -- 2026-08-17 (local) / 2026-08-18T02:21:55Z

| Field             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch / base     | `p5/github-live-read` off `integration/studio-wave1` @ `f912403`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Credential        | Keychain reference `{ service: "app-factory-github-token", account: "app-factory" }` (narrow-scope fine-grained PAT, repos `pri8771/iOS-App-Factory` + `pri8771/hindsight`, Contents R/W, Pull requests R/W, Metadata R). Presence confirmed with `security find-generic-password -s ...` (no `-w`); the value was never read outside the broker.                                                                                                                                                                                                                         |
| Preflight         | broker `preflight` -> `available: true` (metadata-only probe)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Live runs         | **1** (a second run was not possible: the fix is owner-side, see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Live calls        | **1**: `POST https://api.github.com/graphql` (owner-binding query) -> **HTTP 401**, 148 ms, body `{"message":"Requires authentication","documentation_url":"https://docs.github.com/rest","status":"401"}`, `x-github-request-id F983:2FA5D2:3DE288C:C8E5D1A:6A83C1C3`; no rate-limit headers on the answer                                                                                                                                                                                                                                                               |
| Outcome           | **failed -- credential provisioning format**, not scope and not a transport contract rejection. `provider-transport` forwards the Keychain value verbatim as the Authorization header (by design: the transport has no auth-scheme knowledge). Anonymous diagnostic calls with no credential (`curl`, garbage values) reproduce the exact `Requires authentication` body for a scheme-less value and `Bad credentials` for `Bearer <garbage>`, so the stored item holds a bare token, GitHub never evaluated it, and the token itself was neither validated nor rejected. |
| Binding artifact  | **not produced** (the proof failed before a binding could be formed); no `github-owner-binding.json` exists yet                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Results directory | `/Users/pchordia/.app-factory-github-smoke/results/2026-08-18T02-21-55-642Z/` (`calls.jsonl`, `summary.json` digest `sha256:2044c25e6dcb8a276140cbf5d4a150de34a26f3fe36f7d12bef97679ab74b24a`, `observations.json`, `log.txt`); grep for `authorization` / `Bearer` / `github_pat` in every file: 0 hits                                                                                                                                                                                                                                                                  |
| What it did prove | The whole trust boundary works live end to end up to the provider's answer: Keychain resolution by the broker, just-in-time attachment by the transport, HTTPS-only + credential-origin binding, deadline, byte cap, response-header projection onto the strict envelope (GitHub's 401 carried 15 headers; 3 survived and the envelope validated), and credential-free recording. Nothing about the token's validity or scope was proven.                                                                                                                                 |

### Provisioning contract (the fix, owner-side)

The Keychain item must hold the **complete Authorization header value**, not
the bare token, because the transport attaches it verbatim
(`packages/provider-transport/src/index.ts`, `credentialHeaderValue`). For
GitHub that is `Bearer <token>`. Re-provision it yourself (never paste the
token into a task, prompt, log, or issue):

```sh
security add-generic-password -U -s app-factory-github-token -a app-factory -w "Bearer <token>"
```

then re-run the smoke:

```sh
cd <repo> && pnpm build
CONFIRM_LIVE=yes \
AF_GITHUB_SMOKE_OWNER=pri8771 \
AF_GITHUB_SMOKE_REPOSITORIES="pri8771/iOS-App-Factory,pri8771/hindsight" \
AF_GITHUB_SMOKE_KEYCHAIN_SERVICE=app-factory-github-token \
AF_GITHUB_SMOKE_KEYCHAIN_ACCOUNT=app-factory \
AF_GITHUB_SMOKE_RESULTS_ROOT=/Users/pchordia/.app-factory-github-smoke/results \
AF_GITHUB_SMOKE_ETC_DIR=/Users/pchordia/.app-factory-github-smoke/etc \
node scripts/ops/github-live-read.mjs
```

A completed run writes `github-owner-binding.json` into the results
directory and to `<etc>/github-owner-binding.json` (0600); the committed
record of a successful binding belongs next to this file, mirroring
[`containment-attestation-2026-08-14.json`](containment-attestation-2026-08-14.json).
The script prints a hint distinguishing `Requires authentication` (format)
from `Bad credentials` (token) on any 401. Expected on success: viewer login
`pri8771`, HTTP 200s, both repositories observed; `observeRepository` is then
expected to fail _after_ its 200 with "GitHub repository is missing App
Factory metadata" because neither enrolled repository carries the App Factory
description marker -- that is an honest observer outcome, not a transport
failure.

## What this does and does not prove

Proven: the repository can make a live, read-only, credential-scoped provider
call through its own trust boundary without any code path outside the broker
touching credential bytes, and the strict envelopes survive a real provider
answer once headers are projected.

Not proven (yet): the credential's validity, the viewer identity, the token's
repository scope, any read observer against real repositories, rate-limit
behavior, and everything about mutation. No adapter is registered in the
daemon; the effect pump remains default-off with an empty registry.

## Activation blockers (`packages/provider-http-adapters/README.md`)

- **#1 (GitHub viewer/organization proof binding the owner to `ownerNodeId`)**
  -- implemented as code with a durable artifact format and consumer gate;
  the live artifact is pending the re-provisioning above. Not registered in
  the daemon.
- #2 (immutable Jira tenant enrollment), #3 (payload-bound provider-neutral
  reconciliation observations), #4 (contract-consistent Jira project
  correlation) -- open, untouched by this step.
