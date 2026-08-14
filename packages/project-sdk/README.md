# Project SDK

Read-only discovery and enrollment planning for existing Git, Swift, and iOS
projects. The scanner never invokes a build tool and never writes to the source
repository. It proves preservation by comparing Git HEAD, exact porcelain
status, Git administrative state, and a content-addressed scan-surface snapshot
before and after inspection.

## Safety model

- The repository root must be a normalized, real (non-symlink) directory and
  must equal Git's top-level path.
- Git status is evaluated against a private temporary copy of the index. Git is
  invoked without optional locks, filesystem-monitor integrations, global
  configuration, submodule traversal, or source-repository lock files.
- The source index, HEAD, active loose ref, packed refs, local/effective config,
  excludes, attributes, sparse-checkout state, shared index, and reftable files
  are content- and metadata-digested before and after inspection.
- Symbolic links are inventoried but never traversed for discovery. Their full
  chains and ancestors are checked without following content. Escapes, cycles,
  broken chains, and chains through excluded directories are blockers.
- `.git`, dependency caches, and derived build-output directories are excluded
  explicitly and reported. Excluded dependency/build trees receive a bounded
  safety walk for symbolic links; their ordinary file content is not part of
  the scan-surface preservation claim.
- Entry, total-byte, per-file, rule-file, and artifact-parse limits are applied
  before expensive work. Sparse and oversized source files fail closed.
- Xcode containers and shared schemes are discovered by inspecting files. The
  scanner does not invoke `xcodebuild`, a package manager, scripts, or hooks.
- Every plan is proposal-only. The scanner itself never writes; see
  [Applying a plan](#applying-a-plan) for the separate module that does.
- A bounded, fail-closed secret-shaped-file detector flags `.env*` files,
  private-key/keystore/provisioning-profile extensions (`.pem`, `.p12`, `.pfx`,
  `.key`, `.mobileprovision`, `.jks`, `.keystore`), common credential
  filenames, and small text files containing high-entropy or
  sensitive-key-named assignments. Content sniffing is capped at 32 KiB per
  file, skips binary content, and never reads a file large enough to risk an
  unbounded scan; a verified-read failure on an in-bounds candidate fails the
  whole scan rather than being silently skipped. Findings never carry matched
  keys, values, or excerpts — only a path and which detector(s) matched.

## Explicit rule declarations

Rule files can expose machine-checkable constraints with either form:

```text
factory-rule: release.branch=main
factory-rule testflight.branch=testflight
```

Keys and values are normalized, attributed to their file and line, and checked
using scope-aware nearest-authority precedence. A tool-specific rule file is
conforming only when it has parsed declarations that bind both:

```text
factory-rule: authority.import=AGENTS.md
factory-rule: authority.digest=sha256:<digest-of-AGENTS.md>
```

Zero-declaration prose files are never reported as conforming. Nested
`AGENTS.md` files may intentionally override parent rules in their own scope;
different values at the same effective scope are blockers.

## Existing factory layouts

The scanner recognizes the deployed `.factory` contract, including
`project-context.json`, standard locks, `AGENTS.factory.md`, quality contracts,
manifests, and evidence. It emits an adopt-or-migrate compatibility blocker and
does not propose parallel `.app-factory` manifests. Migration must be a separate
approved operation.

## API

`scanExistingProject({ repositoryRoot })` returns a Zod-validated
`EnrollmentScanV1` containing:

- immutable before/after preservation snapshots;
- deterministic Xcode, Swift, rules, manifest, test, and CI inventory;
- structural verification results distinct from filename discovery;
- stable issues for safety blockers, rule conflicts, and enrollment gaps;
- a versioned, proposal-only `EnrollmentPlanV1` and SHA-256 digest.

The result contains no timestamps, machine-specific plan paths, or random IDs,
so repeated scans of the same repository state produce the same plan digest.
The plan is bound to the final quiescent source fingerprint, including Git
administrative state. Any future apply operation must re-scan and require the
exact `sourceFingerprint`; a stale plan must never be applied.

## Applying a plan

`applyEnrollmentPlan({ plan, repositoryRoot })` (in `apply.ts`, exported
alongside the scanner but implemented independently of it) is the only part of
this package that writes to a target repository. The scanner's own scan path
stays untouched and read-only.

- It re-scans the target repository first and aborts with
  `EnrollmentApplyFingerprintDriftError` if the fresh `sourceFingerprint` (or
  the plan a fresh scan would produce) no longer matches — a stale plan is
  never applied — and refuses a dirty working tree.
- It applies only the small, deterministic subset of actions this executor
  can generate safely: `declare-project`, `repair-project-manifest`,
  `declare-experience`, `repair-experience-manifest`,
  `establish-rule-authority`, and `repair-rule-adapter` (project manifest,
  experience-manifest skeleton, canonical rule declarations, and adapter
  digest bindings). Adapter bindings are resolved against the scanner's own
  scope-aware authority resolution, re-run after any canonical-authority
  write so bindings reference the digest actually committed.
- Every other action kind — Xcode/Swift/CI scaffolding, symlink safety,
  secret material, legacy-layout migration, rule conflicts — requires human
  judgment and is always skipped and reported with a reason, never guessed at.
- All writes land in a single commit on a brand-new branch (named from the
  plan's `sourceFingerprint` unless a name is supplied). Hooks are bypassed.
  It never force-pushes, never pushes at all, and never moves, deletes, or
  commits onto any branch other than the one it creates.
- It re-runs `scanExistingProject` after committing and asserts every issue an
  applied action targeted is actually gone; if any resolved issue somehow
  reappears the whole apply fails closed with
  `EnrollmentApplyConvergenceError` rather than reporting false success.
