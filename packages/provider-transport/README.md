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

The Keychain item's value is treated as the **complete, verbatim
`Authorization` header value** -- the transport has no provider or
auth-scheme knowledge. Provision GitHub tokens as `Bearer <token>`, Jira
Cloud basic auth as `Basic <base64>`; a bare token yields a provider 401
(`Requires authentication` on GitHub). See
`docs/operations/github-live-read.md`.
