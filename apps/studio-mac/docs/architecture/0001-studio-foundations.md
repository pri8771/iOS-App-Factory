# 0001 — Studio foundations: design system, daemon client, canonical digest

Status: accepted (studio/phase1). Scope: `apps/studio-mac`.

## Context

Studio is the native macOS front end for the App Factory daemon. Phase 1 lays two foundations that
everything later builds on: the HUD design system and a daemon client that speaks the v1 command
protocol with the same guarantees as `packages/command-client`. Both live in `StudioKit` (a plain
SwiftPM library, fully testable without a window) so the `Studio` executable stays a thin shell.

## Decisions

### 1. Roles, not colours, are the design-system API

The HUD palette encodes one rule: cyan is the machine's voice, gold is only things waiting on the
human. Rather than trust every call site to remember that, components take a `HUDRole`
(`.machine / .human / .ok / .alert / .neutral`) and resolve it to colour themselves. `RadialGauge`,
`PhaseRing`, `StatusPill`, `HUDPanel` and `HUDButton` therefore cannot render a machine claim in gold
or a human decision in cyan without a deliberate role change at the call site. `DiamondGate` is the
one gold marker and takes a gate state, not a colour.

Colours are `NSColor(name:dynamicProvider:)` light/dark pairs (the pattern harvested from the
orchestrator GUI's ThemeTokens): dark values are the approved HUD hex values verbatim; light values are
contrast-checked (>= 4.5:1 for text roles on `hull`). Nothing outside `HUDTheme.swift` constructs a
colour from raw components.

### 2. Type ramp: display and body scale by base size, mono scales by text style

Display (Avenir Next) and body (SF Pro) use `Font.custom(_:size:relativeTo:)` so the exact base size
renders at the default text size and follows Dynamic Type. Mono labels use
`Font.system(_:design:.monospaced)` on a text style (`caption2` = 10, `subheadline` = 11, `body` = 13
on macOS): the `.AppleSystemUIFontMonospaced` custom-font route cannot take a weight, and mono weight
is load-bearing for HUD labels. Gauge numerals inside a fixed ring pin `.dynamicTypeSize(.large)` and
carry full VoiceOver labels instead.

### 3. Snapshot tests render an offscreen `NSHostingView` at 1x

`swift-snapshot-testing` has no SwiftUI-on-macOS strategy, so tests wrap the view in an
`NSHostingView` inside a borderless, never-shown `NSWindow` (SwiftUI text needs a window to lay out)
and snapshot the view as an image in both appearances. Reference PNGs are committed under
`Tests/StudioKitTests/__Snapshots__`. First run after a visual change records; second run compares.

### 4. The client is an actor over Network.framework, one connection per frame

`DaemonClient` mirrors `packages/command-client/src/index.ts` operation for operation:

* one JSONL frame per Unix-socket `NWConnection`, read to EOF (the server half-closes after one line);
* `requestId` per delivery; `commandId` + `issuedAt` are the durable identity;
* every ambiguous outcome (timeout, transport failure after connect, malformed / invalid / mismatched
  response, cancel-after-dispatch, close-after-dispatch, retryable remote error) throws a retryable
  `DaemonClientError` carrying `retryIdentity`, and `createRetryIdentity` mints a new `requestId`
  around the same durable identity so the daemon replays instead of re-executing;
* the response `requestId` and `operation` are checked against what was dispatched;
* error codes and copy are the Node client's, verbatim, so operator docs apply to both.

Request payload types with zod `.nullable()` fields implement `encode(to:)` by hand: Swift's
synthesized encoder omits `nil`, but zod `strictObject` requires the key to be present as `null`.

Wire primitives (`AttemptID`, `Sha256Digest`, `IsoInstant`, …) are validated wrappers. Their regexes
use `\A … \z`: ICU's `$` (NSRegularExpression) also matches before a final newline, JavaScript's does
not, and the token file reader depends on that difference being closed.

Studio speaks as `origin: "dashboard"`. There is no `studio` origin in `CommandOriginV1Schema`
(`packages/contracts/src/v1/command.ts` line 12); adding one is a contracts change, not a client one.

### 5. Portfolio digest is re-verified from the raw wire bytes

`canonicalPortfolioReadModelDigestInputV1` is `JSON.stringify(normalize(input))` where `normalize`
sorts keys with `localeCompare`. `CanonicalJSON` reproduces that byte for byte:

* the digest input is exactly `{schemaVersion, generatedAt, projects, totals}` taken from the raw
  `result.snapshot` JSON tree (not re-encoded from the typed model), so nothing is lost or reordered;
* numbers follow ECMAScript `Number::toString` (`JSONValue` holds `Double`, as `JSON.parse` does);
* strings follow `JSON.stringify` escaping (`/` and non-ASCII pass through);
* keys sort by JavaScript `localeCompare`. `localeCompare` is ICU root/en collation, not code-point
  order (`"a" < "A" < "b"`, digits before letters, `"item" < "Item" < "ITEM"`). For the
  pure-alphanumeric keys the contracts use we implement that collation directly; anything else falls
  back to Foundation's ICU-backed localized comparison in `en_US`.

The recorded fixture (`Tests/StudioKitTests/Fixtures/portfolio-snapshot.*`) was produced by
`scripts/record-fixtures.mjs` through the real `@app-factory/contracts` build, and the Swift test
asserts the canonical text and digest are identical. Every other `*.response.json` fixture went
through `CommandResponseV1Schema.parse` the same way, so model tests pin the wire contract rather than
a hand-typed guess. Re-record with `pnpm --filter @app-factory/contracts build && node
apps/studio-mac/scripts/record-fixtures.mjs`.

## Consequences

* Contracts changes show up as failing model/digest tests, not as runtime surprises.
* The design system can be reviewed and snapshot-diffed without running the app.
* A daemon-side collation locale other than root/en (e.g. `LANG=da_DK`) could in theory order keys
  differently; the digest test would catch it against a fixture recorded there. Documented, not
  guarded.
