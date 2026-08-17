# LLM independent review (Codex reviewer)

`apps/daemon/src/codex-independent-reviewer.ts` is the first non-fixture
implementation of `IndependentReviewAdapter`
([`packages/independent-review`](../../packages/independent-review)): a
strictly read-only Codex CLI reviewer. The only prior implementation was
`fixture.swift-greeter-reviewer` in
[`apps/daemon/src/swift-greeter-fixture-execution.ts`](../../apps/daemon/src/swift-greeter-fixture-execution.ts),
an exact-match check with no model call. This one actually asks a pinned
Codex CLI model to read the candidate and produce a structured verdict.

No paid or real-model call was used to _build_ or _certify_ it. Every test
drives a fake, never-executed Codex placeholder file through a mocked
process-supervisor `launch` step (the exact pattern
`apps/daemon/test/codex-local-agent.test.ts` already uses for the coding
agent), with hand-authored JSONL transcripts standing in for what a real
Codex CLI session emits. Everything _around_ the model call -- the read-only
checkout, the evidence manifest, the digest-based write-attempt check, the
supervised-run intent/receipt binding -- is exercised for real. Separately
from that permanent deterministic gate, the adapter has now been driven
against a real model exactly twice, by hand, on 2026-08-17: one attempt that
the pinned CLI refused before any model call, and -- after a one-flag fix --
one completed review. See
[First live smoke — 2026-08-17](#first-live-smoke--2026-08-17) below.

## What this adapter is bound by

It is invoked through `runIndependentReview`
(`packages/independent-review/src/index.ts`), which independently enforces,
regardless of what this adapter does:

- the capability gate (`readCandidate: true`, everything else `false`);
- self-review refusal (`implementingRunId !== reviewerRunId`);
- the report's `reviewInputDigest` binds it to the exact supplied
  `IndependentReviewInput`;
- every finding's `supportingArtifactDigests` is a subset of the supplied
  `rawEvidenceDigests`;
- verdict/severity consistency (`pass` forbids P0/P1; `changes-required`
  requires at least one).

This adapter re-checks all of those itself before returning (see
`#review`, `parseCodexReviewReportedResultV1` in
`apps/daemon/src/codex-independent-reviewer.ts`), so a bug in this adapter
fails the review closed rather than relying solely on the outer layer. In
particular, anything the model says that would violate one of the rules above
is a **thrown error**, not a returned report -- there is no code path that
lets a malformed or dishonest model response become a `ReviewReportV1`.

## How independence and read-only are enforced structurally

- **Capability gate**: `REVIEW_CAPABILITIES` is a literal, frozen constant
  (`readCandidate` true, `writeCandidate`/`mutatePolicy`/`approveRelease`
  false), asserted again by the protocol layer before `review()` is ever
  called.
- **No write surface, not an empty allowlist**: unlike the coding agent's
  `buildCodexInvocation` (`packages/agent-runner/src/codex.ts`), there is no
  `authorizedWritePaths` parameter anywhere in `buildCodexReviewInvocation`.
  The Codex permission profile marks `:workspace_roots` `"."` `"read"` and
  denies `:root`, `:slash_tmp`, and `:tmpdir` outright, with
  `network.enabled = false`. There is no code path that could accidentally
  grant a write scope, because none is ever constructed.
- **Its own checkout, not the attempt worktree**: `coordinateVerifiedLocalCommit`
  (`packages/execution-engine/src/coordinator.ts`) creates and destroys its
  own read-only verification checkout, via `GitWorkspaceManager`'s
  `createTrustedVerificationCheckout`, _before_ the review phase, for
  trusted tests only -- it is gone by the time `runIndependentReview` calls
  this adapter, and `IndependentReviewInput` is digest-bound, not
  path-bound, so the two mechanisms cannot be wired together. This adapter
  instead extracts the exact candidate tree straight from the project's
  sealed, immutable Factory mirror (`git archive` from the bare mirror,
  never the mutable attempt worktree) into its own ephemeral directory.
- **Filesystem-enforced read-only, not just policy-enforced**: after
  materializing the candidate checkout and the evidence directory, the whole
  workspace is `chmod`-locked read-only (mirroring
  `removeOwnerWriteRecursively` in
  `packages/git-workspace/src/workspace.ts`'s
  `createTrustedVerificationCheckout` path) before Codex ever runs.
- **Write-attempt detection is structural, not transcript-trust**:
  `digestDirectoryTree` hashes the whole workspace (path, permission bits,
  content) before and after the run. A mismatch fails the review closed
  _before_ the transcript is even classified, regardless of what the model's
  final message claims. This is independent of, and in addition to, the
  permission-profile/`chmod` containment -- it is the backstop if either has
  a gap.
- **Fabricated evidence / verdict-severity mismatch**: `evidence/MANIFEST.json`
  is the only source of citable digests the model is shown; every finding's
  `supportingArtifactDigests` is checked against the _actual_ supplied
  `rawEvidenceDigests` set (not the manifest text, which is untrusted
  model-adjacent context), via the real `FindingV1Schema`. A citation outside
  that set, or a verdict/severity combination the protocol forbids, throws
  immediately.
- **Same pinned-artifact discipline as the coding agent**: exact executable
  digest (re-verified immediately before every run, not just at
  construction), exact CLI version (`VERIFIED_CODEX_CLI_VERSIONS`), the same
  environment allowlist mechanism (`CODEX_SAFE_AGENT_ENVIRONMENT_NAMES`), and
  the same `process-supervisor` supervised-run primitives (ephemeral,
  ownership-checked runner root, ordinary user, ordinary process-group
  semantics) as `apps/daemon/src/codex-local-agent.ts`.

## What this does _not_ newly prove

Everything below is an existing, already-documented boundary this adapter
inherits rather than changes; see
[ADR 0002](../architecture/0002-untrusted-agent-containment.md) and
[verified-local-execution.md](verified-local-execution.md).

- The host `process-supervisor` detached process-group is durable, not a
  proven containment boundary: a target can start a new session/process
  group and outlive supervision. ADR 0002 is explicit that the host
  supervisor "is not sufficient by itself to enable the live Codex adapter"
  for the _coding_ agent, precisely because a coding agent has write
  authority a detached escapee could keep using. This reviewer's blast
  radius if that ever happened is structurally much smaller -- no write
  authority is ever granted anywhere, no network, and the `chmod`
  read-only + before/after content digest would still catch a file
  mutation -- but "smaller blast radius" is not "proven boundary," and nothing
  here should be read as superseding ADR 0002's OCI/coding-plane direction.
- The structured-output schema (`CODEX_REVIEW_REPORTED_RESULT_JSON_SCHEMA_V1`)
  has been sent to the real structured-output endpoint exactly once (the
  2026-08-17 smoke below): the pinned CLI accepted it as `--output-schema`,
  the turn completed with no schema rejection, and the model's final message
  parsed through `parseCodexReviewReportedResultV1` and the real
  `ReviewReportV1Schema` unchanged. Its shape deliberately avoids regex
  lookaround and `uniqueItems`, mirroring the exact constraints already
  proven necessary for `CODEX_REPORTED_RESULT_JSON_SCHEMA_V1` (see the
  comments in `packages/agent-runner/src/codex.ts`). One accepted call is
  evidence the schema is _valid_ for that endpoint, not that every branch of
  it (e.g. `blocked`, multi-finding, null line numbers) has been exercised
  live.
- No project currently wires `reviewerForRun` to this adapter (compare
  `apps/daemon/src/swift-greeter-fixture-execution.ts`'s
  `reviewerForRun: (reviewerRunId) => exactGreeterReviewer(...)`). Building
  that wiring for a specific project/config is a separate, explicit task.
- Prompt-injection resistance is not evaluated. The candidate content and
  evidence text are attacker-adjacent (they come from an untrusted coding
  attempt); nothing here tests whether adversarial candidate content can
  manipulate the model's verdict. The digest/schema/capability enforcement
  means a manipulated model can, at worst, produce a wrong-but-_validly
  shaped_ verdict (e.g. a false "pass") -- it cannot forge evidence, escape
  read-only, or impersonate another reviewer run. A false "pass" is a real
  residual risk this containment does not address; only human review of
  aggregate reviewer accuracy over time would.

## The seam for the first live smoke test

`createCodexIndependentReviewer(config, ports, dependencies)` in
`apps/daemon/src/codex-independent-reviewer.ts` takes no defaults that could
make it run live by accident: the executable path/digest, CLI version,
model, `codexHome`, and output-schema file are all caller-supplied and
verified byte-for-byte before use. The steps below are what the first live
smoke (2026-08-17, next section) actually followed; the manual-only script
`scripts/ops/reviewer-live-smoke.mjs` encodes them literally, takes every
path and identity from `AF_REVIEWER_SMOKE_*` environment variables (no
defaults), refuses to run without `AF_REVIEWER_SMOKE_CONFIRM_LIVE=yes`, and
is not referenced by any `package.json` script, test, or CI step. To do a
live smoke test:

1. Pick a real, already-authenticated Codex CLI installation matching one of
   `VERIFIED_CODEX_CLI_VERSIONS` (`packages/agent-runner/src/codex.ts`).
   **Do not reuse a Codex `CODEX_HOME` that another live run (agent or
   reviewer) is actively using** -- authentication and rate limits are
   shared per account, not per process. Point `codexHome` at a dedicated,
   private (`0700`) directory holding only that login.
2. Write `serializeCodexReviewReportedResultJsonSchemaV1()`'s exact output to
   a private file and set `outputSchemaPath` to it (the constructor verifies
   the bytes match exactly; this is deliberate, not incidental friction).
3. Build a tiny real Factory mirror (a bare `git clone --mirror` of a small
   throwaway repository is enough) and pass `{ mirrorPath }` as the `mirror`
   port. Supply a `readEvidence` port backed by a handful of real bytes (a
   task spec, a small diff) -- it does not need to be a full daemon
   `EvidenceStore`, just something that returns exact bytes for exact
   digests.
4. Construct a minimal but real `IndependentReviewInput` (see
   `packages/independent-review/test/independent-review.test.ts` for the
   shape) with `implementingRunId !== reviewerRunId`.
5. Call `reviewer.reviewerForRun(reviewerRunId)` and then call
   `runIndependentReview` with that adapter **once**, by hand, outside of CI
   and outside of any automated test run. Inspect the resulting
   `ReviewReportV1` and the process's token usage/cost before running it
   again.
6. Confirm afterward that the ephemeral checkout directory
   (`<checkoutRoot>/review-<reviewInputDigest prefix>`) no longer exists
   (the adapter always removes it, success or failure) and that nothing
   under `checkoutRoot` was left `chmod`-writable.

Do not add a code path that runs this automatically in `pnpm test` or
`pnpm verify` -- the deterministic fake-executable suite in
`apps/daemon/test/codex-independent-reviewer.test.ts` is the permanent gate;
a live call is a manual, explicitly-invoked operator action, the same
posture `verified-local-execution.md` already documents for the coding
agent's Codex conformance adapter and for the live Colima `OciRunner` smoke.

## First live smoke — 2026-08-17

Performed by hand via `scripts/ops/reviewer-live-smoke.mjs` on the branch
`ops/reviewer-live-smoke`, outside CI and outside any test run. Two live
`runIndependentReview` invocations were made in total; the first never
reached the model.

| Field                 | Value                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable            | `/Users/pchordia/.app-factory/verified-bin/codex-0.148.0-alpha.9` (factory-owned snapshot), digest `sha256:059bd8ccf7c9ff335cacd0c41f1847354f5eb5ee8fcdad9e17565ec82523ea00` (verified with `shasum -a 256` before the run and re-verified by the adapter's constructor and per-run check)                                                                                                                                  |
| CLI version           | `0.148.0-alpha.9` (preflight `codex --version` + `codex login status`)                                                                                                                                                                                                                                                                                                                                                      |
| Model                 | `gpt-5.6-sol` (the same the coding agent uses)                                                                                                                                                                                                                                                                                                                                                                              |
| `CODEX_HOME`          | dedicated `~/.app-factory-reviewer-smoke/codex-home` (`0700`), seeded with only `auth.json` (`0600`) copied from the Hindsight runtime's login; that runtime was otherwise untouched                                                                                                                                                                                                                                        |
| Mirror / repo         | throwaway two-commit repo (`Sources/Greeter/Greeter.swift` + `README.md`), bare `git clone --mirror` at `~/.app-factory-reviewer-smoke/throwaway/mirror.git`; base `38139791…`, candidate `973e9f12…`, candidate tree `693a2412f2fda42cc3c3262d3a418812ff2a7b24`                                                                                                                                                            |
| Diff under review     | `greeting(for:)` changed to trim the name and append `!` -- 453-byte `git diff` -- plus a canonical `TaskSpecV1` (918 bytes) as the two raw evidence items                                                                                                                                                                                                                                                                  |
| Invocation 1          | 2026-08-17T21:14:47Z, **failed before any model call**, 385 ms: `codex exec` exited 1 with stderr `Not inside a trusted directory and --skip-git-repo-check was not specified.` (stdout empty; the adapter reported it as `protocol-error: Codex reviewer emitted no events`). No tokens were consumed.                                                                                                                     |
| Fix                   | one flag: `buildCodexReviewInvocation` now passes `--skip-git-repo-check` after `exec` (the reviewer checkout is a `git archive` extraction with no `.git`, unlike the coding agent's worktree). Deterministic test added; the directory remains `trust_level = "untrusted"`.                                                                                                                                               |
| Invocation 2          | 2026-08-17T21:16:27Z, **completed**, 22.6 s wall (preflight 135 ms). Verdict `changes-required`, 1 finding (P1, `review.build-failure` / `quality.correctness`): "Foundation is not imported for whitespace trimming", location `Sources/Greeter/Greeter.swift:5`, citing the diff's digest verbatim. The finding is correct -- the throwaway change really does use `trimmingCharacters(in:)` without `import Foundation`. |
| Tokens (invocation 2) | 38,602 input (23,040 cached, 0 cache-write) / 809 output (244 reasoning), from the JSONL `turn.completed` event; the CLI reports no cost                                                                                                                                                                                                                                                                                    |
| Cleanup check         | `<checkoutRoot>/review-d44ccecfc1745ff05884dd9ce3f8e5e7` gone after the run, `checkoutRoot` empty, nothing writable left beneath it (both invocations)                                                                                                                                                                                                                                                                      |
| Results directories   | `~/.app-factory-reviewer-smoke/results/2026-08-17T21-14-46-926Z` (invocation 1) and `…/2026-08-17T21-16-26-443Z` (invocation 2): `summary.json`, `review-report.json`, `review-input.json`, both evidence blobs, the reviewer configuration, and copies of the supervised-run intent, receipt, stdout JSONL, and stderr                                                                                                     |

What surprised, or is worth knowing before the next run:

- The refusal in invocation 1 came from the CLI's own git-repository gate,
  which the coding agent never trips because its workspace _is_ a
  worktree. It fired after config parsing, so `--strict-config` acceptance
  of the reviewer's exact `-c` config was proven by that failed attempt.
- No schema rejection, no timeout, no sandbox denial. The model read
  `evidence/MANIFEST.json`, both evidence files, and the candidate tree via
  `/bin/zsh -lc` (`sed`, `nl`, `find`; a `sed candidate/Package.swift`
  failed harmlessly because the throwaway repo has none), then answered in
  one turn with exactly one JSON message and no prose. It made no write
  attempt; the before/after tree digests matched.
- `--ephemeral` does not stop the CLI writing to `CODEX_HOME` itself: the
  dedicated home gained `*.sqlite` state, `models_cache.json`,
  `installation_id`, `skills/`, `shell_snapshots/`, and `tmp/`. That is
  CLI bookkeeping, not candidate-tree mutation, but it means "holding only
  that login" in step 1 is true only before the first run.
- A non-model probe with `codex sandbox -P <profile>` using the reviewer's
  exact permission profile denied `:root` reads/writes, `$TMPDIR` writes,
  and network, but still allowed writes to the workspace root and `/tmp`
  from that subcommand. Whether `exec` applies the profile identically was
  not separately probed; the reviewer does not rely on it -- the checkout
  is `chmod` read-only and the tree digest is compared before and after --
  and the live transcript shows no write attempt. Recorded here so the
  next operator does not read the profile as sufficient on its own.
- The supervised-run directories under `runnerRoot` are durable by design
  and are left in place (`review-0730f8f2…`, `review-d44ccecf…`); only the
  checkout workspace is ephemeral.
