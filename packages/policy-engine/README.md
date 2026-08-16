# Policy engine

The policy engine compiles one versioned policy source into the repository's
canonical `AGENTS.md`, minimal Claude/Cursor/Antigravity adapters, and a
digest-bound `PolicyLockV1`.

Generated files are delivery hints, not the trust boundary. Before an agent
runs, the broker verifies every file byte-for-byte without following symlinks
and records the exact resolved instruction files and policy digest. Protected
paths, trusted checks, independent review, and approval rules enforce the same
policy even if a client ignores prose.

The package only plans and verifies files. Enrollment applies a reviewed bundle
in a Factory-owned workspace and must revalidate the bundle digest immediately
before any broker-owned commit.

## Machine-checkable declarations

The generated `AGENTS.md` ends with a `## Machine-checkable declarations`
section of `factory-rule: <key>=<value>` lines — `authority.version`,
`policy.id`, `policy.version`, `policy.digest` (the canonical source digest),
and one `<ruleId>.enforcement` / `<ruleId>.check` pair per rule. Every
generated adapter (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/app-factory.mdc`)
ends with `authority.import=AGENTS.md` and `authority.digest=<sha256 of the
generated AGENTS.md>`.

These are the exact declarations `@app-factory/project-sdk`'s scanner requires
before it reports a root `AGENTS.md` as `canonical` and an adapter as
`conforming`; without them a compiled bundle applied to a repository would
reintroduce the `rules.canonical-unverifiable` and `rules.adapter-nonconforming`
enrollment blockers. Because they are part of the compiled bytes, they are
covered by the same digest lock and drift check as the prose.

The compiled corpus source lives at
`docs/policy/ios-app-factory-policy-source.v1.json`; `@app-factory/policy-corpus`
compiles, materializes, and proves it against the scanner.
