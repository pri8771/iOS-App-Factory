# Provider HTTP adapters

Strict Jira Cloud REST and GitHub GraphQL adapters for the durable external-
effect boundary. The package contains no network client, token configuration,
Keychain reader, approval logic, or direct persistence. It emits bounded HTTPS
requests through an injected transport and passes only a macOS Keychain
credential reference. A trusted transport must resolve that reference just in
time, enforce the declared `credentialOrigin`, respect the absolute deadline
and response-size limit, reject redirects, and zero its owned credential bytes.

Mutation-adapter construction also requires an injected local
`EffectPayloadReader`. The reader receives only the persisted payload digest,
absolute deadline, and abort signal and must return a disposable local byte
copy. The adapter bounds that copy to 256 KiB, verifies its SHA-256 digest,
parses it strictly, and zeroizes it on every outcome. A missing, malformed, or
tampered authoritative payload rejects send before provider mutation and forces
manual intervention during reconciliation.

The provider adapters are intended to be registered through `adapter-sdk` and
called only by `effect-worker` after the outbox has durably entered `sent`.
They recheck the fenced claim immediately before every mutation. A transport
failure, unknown status, GraphQL error, or malformed success response becomes
an ambiguous result with the stable operation marker; reconciliation performs
reads only and never redispatches because a read found nothing.

Implemented safe subset:

- Jira project creation with an atomic description marker;
- Jira epic/task creation with an atomic issue-property marker;
- Jira project/issue observations, strict revision snapshots, paginated marker
  search, and ETag/canonical revision provenance;
- GitHub repository creation with both `clientMutationId` and a repository
  description marker;
- GitHub repository reconciliation plus repository, branch, pull request,
  merge, paginated check-run, and paginated/redacted PR-comment observations;
- strict request/response envelopes, host-scoped credential references,
  bounded pages/bodies/headers, and sanitized evidence detail.

Each writable marker binds both the exact effect payload digest and a digest of
the provider fields created from that payload. Reconciliation recomputes the
expected fields from the authoritative local payload and compares that digest
with both remote metadata and current provider state. Coordinated rewrites of
provider metadata and fields therefore require manual intervention. Jira task
reconciliation also resolves the payload-declared Epic in the declared project
and validates its marker before deriving the expected parent key.

Read observers intentionally use narrower options and do not need payload-store
access. Their marker checks establish provider-side self-consistency for
inventory and drift reporting; only mutation-adapter reconciliation performs
authoritative intent adoption.

Fail-closed v1 contract gaps:

- `jira.issue-link.ensure` declares a Jira entity-property marker, but Jira
  issue links do not expose an atomically writable entity-property surface.
  The action is rejected as non-retryable before transport and reconciliation
  requires manual intervention. A protected contract revision must bind the
  approved inward/outward issue IDs and revision pins, add an endpoint-based
  correlation rule (or a separate marker effect), and define duplicate-link
  adoption before this mutation can be enabled.
- `jira.github.attach` identifies only a Jira project and GitHub repository,
  while Jira remote links require an issue target. A protected contract
  revision must add the exact Jira issue key/ID and revision pin and declare
  the remote-link `globalId` marker before this mutation can be enabled.
- GitHub PR/comment/check contracts are read-only today. This package does not
  invent mutation authorization for them.

All conformance and fault tests use injected in-memory transports. No Jira or
GitHub account, credential, network connection, repository, or project was
accessed or changed while implementing this package.

## Activation blockers

This package is intentionally **not registered in the daemon**. Live use must
remain disabled until all of the following are implemented and reviewed:

- an immutable Jira tenant enrollment that proves `siteId`, REST base URL, and
  the credential's allowed origin name the same authenticated Atlassian site;
- an authenticated GitHub viewer/organization proof that binds the enrolled
  owner to `ownerNodeId` before any repository mutation -- **implemented with
  a durable artifact** (`src/github-owner-binding.ts`: `createGitHubOwnerBinding`
  produces a digest-bound `GitHubOwnerBindingV1` from one read-only GraphQL
  call through an injected transport; `parseGitHubOwnerBinding` /
  `assertGitHubOwnerBindingMatches` are the consumer gate). Two live
  read-only attempts on 2026-08-17 (`docs/operations/github-live-read.md`)
  both stopped at HTTP 401 -- first `Requires authentication` (verbatim
  scheme-less value), then, with the transport's `Bearer` derivation
  (`deriveGitHubBearerAuthorization`), `Bad credentials` (GitHub rejected the
  stored token string) -- so no live binding artifact exists yet. This does
  not register the adapter in the daemon;
- provider-neutral reconciliation observations that preserve and compare the
  expected payload and field digests instead of adopting by logical marker
  alone; and
- a contract-consistent Jira project correlation surface. The current
  provider plan declares an entity-property marker, while Jira project
  creation currently places correlation metadata in the description.

Until those bindings exist, injected transports are test seams only; caller-
supplied tenant, owner, URL, or credential-origin values are not sufficient
authorization for a live request. The one manual, explicitly-invoked,
read-only live exercise of this package is `scripts/ops/github-live-read.mjs`
(never part of `pnpm test`/`pnpm verify`).
