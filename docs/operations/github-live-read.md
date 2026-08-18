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
  was visible. Deterministic test added; the validator itself is unchanged
  except that its allowlist now also names App Store Connect's retained
  headers (`x-rate-limit`, `x-apple-jingle-correlation-key`,
  `x-apple-request-uuid`), so the merged `asc-adapter` (which filters to its
  own narrower set on top) still sees them through the projected envelope.
- **`scripts/ops/github-live-read.mjs`** -- the manual live smoke. It builds
  the fetch transport with the GitHub Bearer derivation (see the provisioning
  contract below), runs the broker's metadata-only preflight, the owner-binding proof, then (from the
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

## Live runs -- 2026-08-17 (local) / 2026-08-18Z

Two live runs in total, both by hand, both strictly read-only, one live call
each. Common facts:

- Branch `p5/github-live-read` off `integration/studio-wave1` (`f912403` for
  run 1; merged `0a36d5b` before run 2).
- Credential: Keychain reference `{ service: "app-factory-github-token",
account: "app-factory" }` (narrow-scope fine-grained PAT, repos
  `pri8771/iOS-App-Factory` + `pri8771/hindsight`, Contents R/W, Pull
  requests R/W, Metadata R). Presence confirmed with
  `security find-generic-password -s ...` (no `-w`); the value was never read
  outside the broker; the item was not modified between the runs
  (`mdat 20260818020858Z` both times).
- Broker `preflight` -> `available: true` (metadata-only probe) both times.
- Results (0700/0600; grep for `authorization` / `Bearer` / `github_pat` in
  every file: 0 hits): `/Users/pchordia/.app-factory-github-smoke/results/`.
- **Binding artifact: not produced** by either run; no
  `github-owner-binding.json` exists yet.

| Run | When (UTC)           | Transport authorization                                                                                                   | Live call                                                           | Answer                                                                                                                                                                                            | Diagnosis                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Results dir / summary digest                                                                           |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | 2026-08-18T02:21:55Z | verbatim Keychain value (the transport default at the time)                                                               | `POST https://api.github.com/graphql` (owner-binding query), 148 ms | **HTTP 401** `{"message":"Requires authentication","documentation_url":"https://docs.github.com/rest","status":"401"}`, `x-github-request-id F983:2FA5D2:3DE288C:C8E5D1A:6A83C1C3`                | Provisioning format: the item holds a bare, scheme-less token, so GitHub saw no recognisable Authorization scheme and never evaluated it. Anonymous, credential-free `curl` diagnostics reproduce this exact body for a scheme-less value and `Bad credentials` for `Bearer <garbage>`.                                                                                                                                                                                         | `2026-08-18T02-21-55-642Z/`, `sha256:2044c25e6dcb8a276140cbf5d4a150de34a26f3fe36f7d12bef97679ab74b24a` |
| 2   | 2026-08-18T02:38:29Z | `deriveGitHubBearerAuthorization` (`Bearer <token>` derived inside the broker window via the merged `authorization` seam) | `POST https://api.github.com/graphql` (owner-binding query), 129 ms | **HTTP 401** `{"message":"Bad credentials","documentation_url":"https://docs.github.com/rest","status":"401"}`, `x-github-request-id FF8D:2B97DD:3E7A3EB:CB36270:6A83C5A5`; no rate-limit headers | The scheme is now recognised and **GitHub evaluated and rejected the token string itself**. Not scope (a scope problem returns 200 with nulls or 403), not a transport contract rejection. Indistinguishable from here between a revoked/expired/mistyped token and an item whose stored value is not exactly the token (stray whitespace, quotes, or a second copy of the scheme -- the broker only trims one trailing line ending). The run budget (2) is exhausted; stopped. | `2026-08-18T02-38-29-563Z/`, `sha256:21941223e1539ac846519483930fa08304a59b71419a1966e5dc04022d03b0d3` |

What the two runs did prove: the whole trust boundary works live end to end
up to the provider's answer -- Keychain resolution by the broker, just-in-time
attachment (verbatim in run 1, derived in run 2) by the transport,
HTTPS-only + credential-origin binding, deadline, byte cap, response-header
projection onto the strict envelope (GitHub's 401s carried 15 headers; 3
survived and the envelope validated), and credential-free recording. Nothing
about the token's validity, viewer identity, or repository scope was proven.

### Provisioning contract (GitHub) and the owner-side fix

The GitHub Keychain item holds the **bare token** exactly as GitHub issues it
(no `Bearer` prefix, no surrounding whitespace or quotes; the broker trims one
trailing line ending only). The trusted transport derives `Bearer <token>`
from it with `deriveGitHubBearerAuthorization`
(`packages/provider-http-adapters/src/github-owner-binding.ts`), passed as
`createFetchProviderHttpTransport({ authorization })`; the derivation runs
inside the broker's credential window and its result passes the transport's
header-safety check. The verbatim-header default remains for providers
provisioned as a complete header value, and App Store Connect uses its own
`.p8` -> ES256 JWT derivation (`packages/provider-transport/README.md`).

To clear run 2's `Bad credentials`: check on github.com that the fine-grained
PAT is active and not expired, then re-provision the item yourself with the
exact token (never paste the token into a task, prompt, log, or issue):

```sh
security add-generic-password -U -s app-factory-github-token -a app-factory -w "<token>"
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
The script prints a hint distinguishing `Requires authentication` (no
recognisable scheme) from `Bad credentials` (token rejected) on any 401. Expected on success: viewer login
`pri8771`, HTTP 200s, both repositories observed; `observeRepository` is then
expected to fail _after_ its 200 with "GitHub repository is missing App
Factory metadata" because neither enrolled repository carries the App Factory
description marker -- that is an honest observer outcome, not a transport
failure.

## What this does and does not prove

Proven: the repository can make a live, read-only, credential-scoped provider
call through its own trust boundary without any code path outside the broker
touching credential bytes (verbatim and derived authorization both exercised
live), and the strict envelopes survive a real provider answer once headers
are projected.

Not proven (yet): the credential's validity (GitHub rejected the stored token
string in run 2), the viewer identity, the token's repository scope, any read observer against real repositories, rate-limit
behavior, and everything about mutation. No adapter is registered in the
daemon; the effect pump remains default-off with an empty registry.

## Activation blockers (`packages/provider-http-adapters/README.md`)

- **#1 (GitHub viewer/organization proof binding the owner to `ownerNodeId`)**
  -- implemented as code with a durable artifact format and consumer gate;
  the live artifact is pending a valid token (see run 2 above). Not registered in
  the daemon.
- #2 (immutable Jira tenant enrollment), #3 (payload-bound provider-neutral
  reconciliation observations), #4 (contract-consistent Jira project
  correlation) -- open, untouched by this step.
