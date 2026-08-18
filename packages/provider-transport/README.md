# Provider transport

Fetch-based implementation of the `BoundedProviderHttpTransport` contract from
`@app-factory/provider-http-adapters`. It dispatches an already-validated
`ProviderHttpRequestV1`, resolves the request's Keychain credential reference
just-in-time through `@app-factory/credential-broker`, attaches it only when
the request URL origin equals the bound `credentialOrigin`, enforces the
deadline and byte cap, refuses redirects, projects the response onto the
bounded envelope (only allowlisted response headers survive), and zeroizes
every buffer it owns.

## Credential value contract

By default the Keychain item's value is treated as the **complete, verbatim
`Authorization` header value** -- the transport itself has no provider or
auth-scheme knowledge. A provider whose Keychain item is not already a
header value supplies an opt-in `authorization: ProviderAuthorizationDerivation`
(`(secret, { method, url }) => string`), invoked once per dispatched request
inside the broker's credential window; it must not retain, log, or persist
the secret, and the transport applies the same header-safety check to the
derived value. Current provisioning contracts:

| Provider          | Keychain item holds                 | Derivation                                                                       |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| GitHub            | the bare token, as GitHub issues it | `deriveGitHubBearerAuthorization` (`provider-http-adapters`) -> `Bearer <token>` |
| App Store Connect | the `.p8` signing key               | `createAscJwtAuthorization` (`asc-adapter`) -> ES256 JWT `Bearer <jwt>`          |
| (default)         | the complete header value           | none (verbatim), e.g. `Basic <base64>` for Jira Cloud                            |

See `docs/operations/github-live-read.md` and `docs/operations/asc-live-read.md`.
