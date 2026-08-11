# Implementation status

Updated: 2026-08-10

This is the durable implementation ledger for the sixteen-week App Factory
roadmap. A capability is marked complete only after its stage gate passes; the
calendar labels express dependency order, not a claim that elapsed time alone
delivers the capability.

## Current position

| Roadmap slice | Status | Evidence |
| --- | --- | --- |
| Week 1 — executable foundation | Complete | commit `7820fa4`; `pnpm verify`; 7 test files and 62 tests passed |
| Week 2 — restart-safe fake execution | In progress | pending recovery-matrix gate |
| Weeks 3–16 | Not started | blocked on their preceding capability gates |

## Week 1 gate record

- Runtime is pinned to Node `24.18.0` and pnpm `10.33.2`.
- Strict TypeScript, formatting, lint, package-boundary checks, generated-schema
  drift checks, and tests run through one `pnpm verify` command.
- Five known-invalid dependency graphs prove the package boundary rules fail
  closed.
- Twelve versioned V1 contracts have deterministic JSON Schema 2020-12 output
  and valid/invalid parity fixtures.
- SQLite runs in WAL mode with foreign keys, a bounded busy timeout,
  `synchronous=FULL`, integrity checks, backup support, explicit checksum-bound
  migrations, atomic state/event writes, and close/reopen tests.
- The Codex adapter has a strict no-TTY invocation contract, version/auth
  preflight, bounded JSONL classification, explicit blocker handling, a
  credential-minimized environment, and a deny-root/no-network permission
  profile.
- The Swift Greeter fixture materializes reproducible standalone Git baselines,
  protects its test/configuration surfaces, and runs a real `swift test` through
  the testkit.

The headless Codex work in Week 1 establishes the adapter and security boundary;
it does not certify an autonomous code change. The first real model-authored,
trusted-check-verified change is the Week 3 gate.

## Current constraints

- The repository has no remote yet; commits are local and no external mutation
  has been attempted.
- Hindsight remains untouched until enrollment planning, dirty-worktree
  preservation, and the explicit apply gate.
- Jira, GitHub, Apple, TestFlight, and website integrations will be developed
  first against deterministic provider contracts. Live account mutations wait
  for scoped, digest-bound approval and credential preflight.
- A local Mac can continue work only while it is awake and the user session is
  available. Reboot/login automation is a later LaunchAgent gate, not a current
  promise.
