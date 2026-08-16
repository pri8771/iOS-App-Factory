# Policy engine

The policy engine compiles one versioned policy source into the repository's
canonical `AGENTS.md`, minimal Claude/Cursor/Antigravity/Copilot adapters, and
a digest-bound `PolicyLockV1`.

Generated files are delivery hints, not the trust boundary. Before an agent
runs, the broker verifies every file byte-for-byte without following symlinks
and records the exact resolved instruction files and policy digest. Protected
paths, trusted checks, independent review, and approval rules enforce the same
policy even if a client ignores prose.

The package only plans and verifies files. Enrollment applies a reviewed bundle
in a Factory-owned workspace and must revalidate the bundle digest immediately
before any broker-owned commit.

## Source model (schema version 1, additive)

Every field below is optional; a source that uses none of them compiles to the
byte-identical bundle it produced before they existed (locked by
`test/fixtures/unscoped-bundle.v1.json`).

- `rules[].appliesTo` — `{ phases[], lifecycleStages[], taskKinds[], paths[] }`
  allow-lists; absent means global. `lifecycleStages` uses the contracts
  `ProjectLifecycleStageV1` vocabulary; `phases`/`taskKinds` are stable keys
  until the Studio vocabularies are reconciled.
- `rules[].enforcement` — one of `trusted-check`, `broker`, `approval`,
  `review`, `human-approval`. `review` is the independent read-only review
  agent; `human-approval` is a human gate. The corpus value
  `human_review_required` maps to `human-approval`
  (`CORPUS_ENFORCEMENT_ALIASES_V1`).
- `rules[].layer` — authority layer, highest first: `human`, `studio-os`,
  `domain-standard`, `repo`, `task`, `inference`; absent means `repo`.
- `rules[].owner` / `checks[].owner` — `human | machine`; absent derives
  `human` for `human-approval` and `machine` otherwise. A `human-approval`
  rule or check can never be machine-owned.
- `rules[].refines` — a rule in a strictly lower layer may tighten a rule
  above it. Compilation rejects any refinement that weakens enforcement (by
  the escalation ladder machine < review < approval < human-approval) or hands
  a human-owned rule to a machine. The refined rule always stays in force.
- `checks[]` — the check registry, `RequiredCheckV1` with `checkId`, `kind`,
  `description`, and optional `owner`. When present, every
  `rules[].requiredCheck` and every waiver replacement check must resolve to a
  registered check whose `kind` equals the rule's enforcement.
- `waivers[]` — `WaiverV1` with `waiverId`, `ruleId`, `scope`, `reason`,
  `replacementVerification`, `approver`, `expiresAt`, and optional
  `evidenceDigest`; human approved and time bounded. A waiver never removes a
  rule from the effective set; it marks it `waived` and carries the
  replacement verification.
- `clients[]` — adapter clients to generate; absent keeps the legacy
  `claude`, `cursor`, `antigravity` set. `copilot` adds
  `.github/copilot-instructions.md`; `codex` reads `AGENTS.md` directly.

## Resolution

`resolveEffectivePolicy(source, selector)` takes an optional `phase`,
`lifecycleStage`, `taskKind`, `paths`, and `now` and returns the effective
rule set ordered by authority. Unknown context fails closed in both directions:
a scoped rule still applies when the selector cannot rule it out, and a waiver
only takes effect when the selector positively satisfies its whole scope and
`now` is before `expiresAt`. Expired, absent, out-of-scope, or partially
covering waivers never suppress a rule.

`decideTaskPolicyBinding(lock, taskPolicyDigest)` is the daemon's task-intake
gate (`taskPolicyGate`, default off): no lock, an invalid lock, or any digest
disagreement rejects the TaskSpec before durable state exists.

## Machine-checkable declarations

The generated `AGENTS.md` ends with a `## Machine-checkable declarations`
section of `factory-rule: <key>=<value>` lines — `authority.version`,
`policy.id`, `policy.version`, `policy.digest` (the canonical source digest),
and one `<ruleId>.enforcement` / `<ruleId>.check` pair per rule. Every
generated adapter (`CLAUDE.md`, `GEMINI.md`, `.cursor/rules/app-factory.mdc`,
`.github/copilot-instructions.md`) ends with `authority.import=AGENTS.md` and
`authority.digest=<sha256 of the generated AGENTS.md>`.

These are the exact declarations `@app-factory/project-sdk`'s scanner requires
before it reports a root `AGENTS.md` as `canonical` and an adapter as
`conforming`; without them a compiled bundle applied to a repository would
reintroduce the `rules.canonical-unverifiable` and `rules.adapter-nonconforming`
enrollment blockers. Because they are part of the compiled bytes, they are
covered by the same digest lock and drift check as the prose.

The compiled corpus source lives at
`docs/policy/ios-app-factory-policy-source.v1.json`; `@app-factory/policy-corpus`
compiles, materializes, and proves it against the scanner.
