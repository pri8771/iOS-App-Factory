# ADR 0005: One project lifecycle, typed gates, and the release sub-lifecycle

Status: accepted
Date: 2026-08-16

## Context

Four vocabularies described "where a project is" and disagreed with each
other. [ADR 0004](0004-studio-mac-app.md) recorded the disagreement as a
prerequisite for Studio phase 4 (the planner must not bind Phase Presets to a
vocabulary that changes under it) and left the reconciliation to a later
decision. This is that decision.

The four sources, as found on 2026-08-16:

- **(a) Rules corpus product lifecycle** — the separately versioned iOS App
  Factory rules corpus, `governance/PROJECT_LIFECYCLE.md`, outside this
  repository. Fourteen product stages
  (`idea → research → validated → planned → prototype → mvp_development →
code_complete → verification_pending → verified → beta →
release_candidate → released → maintained → paused_or_retired`) plus a
  separate eight-state work-item lifecycle. It is prose: no gate is bound to
  a commit, nothing states which actor may move a project between stages,
  and the fourteen names mix product decisions (`validated`, `planned`),
  engineering facts (`code_complete`, `verified`), and release facts
  (`beta`, `release_candidate`).
- **(b) Mission-control `gates.md`** (T3, agreed 2026-07-21), outside this
  repository, with `registry.json` as its canonical machine representation.
  Six stages (`idea → building → qa → launch-prep → live → frozen`), seven
  typed gates (`build`, `tests`, `visual`, `device`, `legal`, `store`,
  `market`) each with its own enumerated states, every gate observation
  bound to a commit SHA, three explicit stage-advance rules, automatic
  demotion on regression, and an ownership rule: AI agents may set every
  state except `legal=cleared`, `device=physical_pass`, `store=ready`, and
  anything requiring credentials — those are Priyansh-only. Its stated
  purpose is the portfolio's core defect: "prose advances past machine
  truth", and its two invariants — `unknown` never collapses into pass;
  evidence at a stale SHA is not evidence — are the same invariants this
  repository's `AGENTS.md` demands ("bind results to exact input digests and
  Git SHAs").
- **(c) This repository's `ProjectManifestV1.lifecycleStage`** —
  `packages/contracts/src/v1/project.ts`, eight values
  (`exploring | planned | building | qa | internal-testflight | released |
paused | archived`), a bare enum with no gates, no transition function,
  and no ownership. It is live: it is required on every project manifest,
  is projected into `PortfolioProjectReadModelV1.lifecycleStage` (and from
  there into the `portfolio.snapshot` command response and the dashboard),
  and is used by `packages/portfolio`'s planning input.
- **(d) `ReleaseManifestV1` / `RELEASE_STAGE_ORDER_V1`** — the eight-stage
  release state machine [ADR 0003](0003-release-state-reconciliation.md)
  made the single source of truth for a release
  (`candidate → certified → archived → upload-approved → uploaded →
processing → internal-testflight-available → device-smoke-passed`),
  advanced only through `assertReleaseAdvancement`, one approval per stage,
  digest-bound to one candidate commit. It never regresses; a new candidate
  is a new release.

They disagree in three ways, not one:

1. **Granularity.** (a) has 14 stages, (b) 6, (c) 8, (d) 8 — and (d)'s eight
   are all _inside_ one of (b)'s stages. Any Studio surface (Gantt phase
   rings, planner presets, mirrors) that picks one of these at random will
   render a project at four incompatible positions.
2. **What a stage means.** (a) and (c) are declarations; nothing in either
   says what must be true for a project to be at a stage. (b) and (d) are
   gate-defined: a stage is a claim that specific, evidence-bound facts
   hold. Only the second kind can be reconciled with `AGENTS.md`'s
   "a task is not complete because an agent says so".
3. **Who may move a project.** Only (b) says. (a) and (c) let anyone write
   any value; (d) requires an approval per step but leaves the actor policy
   to the caller. Studio's HUD rule — nothing the machine claims renders
   gold, nothing the human decides renders cyan (ADR 0004 item 7) — cannot
   be implemented over a vocabulary that does not know which states are the
   human's.

## Decision

1. **`gates.md`'s six stages and seven typed gates become this repository's
   project lifecycle contract**, owned here from now on:
   `ProjectLifecycleStageV1` (`idea | building | qa | launch-prep | live |
frozen`), `TypedGateV1`, `ProjectLifecycleStateV1`, and the pure
   transition functions in `packages/contracts/src/v1/lifecycle.ts`. Gate
   state spellings keep `gates.md` / `registry.json`'s snake_case
   (`simulator_only`, `physical_pass`, `not_run`) verbatim so registry
   records import without translation; the stage names were already
   kebab-case there and match the repository's enum style.
2. **ADR 0003's eight release stages are the release sub-lifecycle beneath
   `launch-prep → live`.** `ReleaseManifestV1` is unchanged and remains the
   only release state machine. A project at `launch-prep` may have zero or
   more releases at any release stage; entering `live` is a project-stage
   fact gated by the human-only `device=physical_pass ∧ legal=cleared ∧
store=ready`, not by any release-stage value (see "Boundary between the
   two machines" below for why the coupling stays informational).
3. **The corpus's fourteen stages become a mapping table, not a live enum.**
   Nothing in this repository is typed with them; the matrix below is the
   only place they appear. The corpus's work-item lifecycle is out of scope
   (it describes tasks/attempts, not projects).
4. **The legacy `ProjectManifestV1.lifecycleStage` enum stays accepted,
   deprecated.** It is renamed in TypeScript to
   `LegacyProjectLifecycleStageV1Schema` (the canonical name
   `ProjectLifecycleStageV1` now means the six-stage vocabulary), carries a
   `@deprecated` JSDoc, and its generated JSON Schema carries
   `deprecated: true` plus a description pointing here.
   `LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1` /
   `projectLifecycleStageFromLegacyV1` fold each legacy value onto the six
   stages. No manifest field was added, removed, or retyped; every existing
   manifest still parses.
5. **Human-only gate states are unrepresentable for a machine, twice.** A
   `TypedGateV1` with `owner: "machine"` and one of `legal=cleared`,
   `device=physical_pass`, `store=ready` fails to parse; and
   `applyProjectLifecycleGate` independently rejects a `machine` actor
   recording any of those states before it parses anything else, and
   rejects any record whose `owner` claim differs from the authenticated
   actor. Both are tested.

### Mapping matrix

| Canonical project stage (b) | Corpus product lifecycle (a)                                            | Legacy manifest enum (c) | Release sub-lifecycle (d)                                                                                             | Gates that must hold to stand here (cumulative)                                                           | Human-only among them                                  |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `idea`                      | `idea`, `research`, `validated`, `planned`                              | `exploring`, `planned`   | —                                                                                                                     | none                                                                                                      | —                                                      |
| `building`                  | `prototype`, `mvp_development`, `code_complete`, `verification_pending` | `building`               | —                                                                                                                     | none (entered by decision, machine or human)                                                              | —                                                      |
| `qa`                        | `verified`                                                              | `qa`                     | —                                                                                                                     | `build=verified ∧ tests=passed`                                                                           | —                                                      |
| `launch-prep`               | `beta`, `release_candidate`                                             | `internal-testflight`    | all eight: `candidate … device-smoke-passed` (a release is cut, certified, archived, uploaded, and smoke-tested here) | + `visual=passed ∧ device ∈ {simulator_only, physical_pass}`                                              | —                                                      |
| `live`                      | `released`, `maintained`                                                | `released`               | (App Store publication is not modelled by ADR 0003's `ios-internal-testflight` target; see Non-goals)                 | + `device=physical_pass ∧ legal=cleared ∧ store=ready`; `market` stays `hypothesis` until real usage data | `device=physical_pass`, `legal=cleared`, `store=ready` |
| `frozen`                    | `paused_or_retired`                                                     | `paused`, `archived`     | an in-flight release is left at its stage; nothing advances it                                                        | none (human decision; thaw is also human-only)                                                            | freeze / thaw                                          |

Notes on the non-obvious cells:

- Corpus `verification_pending` ("required whenever a mandatory check could
  not run") is `building`, not `qa`: it is exactly `tests ∈ {not_run,
invalid_run}`, and under the advance rules a project cannot enter `qa`
  until `tests=passed`. Corpus `verified` ("requires the automated checks
  declared by the quality manifest") is the entry condition of `qa`
  (`build=verified ∧ tests=passed`), so it maps to `qa`.
- Legacy `planned` is `idea`, not `building`: nothing is built and no gate
  can hold; `building` is entered by an explicit `idea → building`
  decision.
- Legacy `internal-testflight` is `launch-prep`, not `live`: an internal
  TestFlight build is release stage `internal-testflight-available`, which
  lives inside `launch-prep`. It was the only legacy value that named a
  release-machine fact as if it were a project stage — the same conflation
  ADR 0003 removed from quality's `CertificationV1`.
- Legacy `paused` and `archived` both fold to `frozen`. The distinction
  (might resume vs. will not) is a portfolio annotation, not a lifecycle
  stage; `frozen` + a thaw that requires re-proving the gates covers both.

### Typed gate

`TypedGateV1` = `{ gate, state, owner, sha, evidenceDigest, at }`, a
discriminated union on `gate` so each gate admits only its own states — in
the portable JSON Schema (`typed-gate.v1.schema.json`) as well as at runtime:

| gate     | states (satisfying in **bold**)                                        | human-only states |
| -------- | ---------------------------------------------------------------------- | ----------------- |
| `build`  | `unknown`, `failed`, **`verified`**                                    | —                 |
| `tests`  | `not_run`, `invalid_run`, `failed`, **`passed`**                       | —                 |
| `visual` | `not_run`, `failed`, **`passed`**, `human_review_required`             | —                 |
| `device` | `not_run`, **`simulator_only`**, **`physical_pass`**, `human_required` | `physical_pass`   |
| `legal`  | `not_run`, `blocked`, **`cleared`**                                    | `cleared`         |
| `store`  | `not_run`, `in_progress`, **`ready`**                                  | `ready`           |
| `market` | `hypothesis`, **`evidence`**                                           | —                 |

- `owner: human | machine` is who recorded the observation. It is a claim;
  `applyProjectLifecycleGate` takes the authenticated actor separately and
  rejects any mismatch, so a machine cannot launder a record by writing
  `owner: "human"`.
- `sha: GitObjectId` is required on every record, including initial states:
  "at commit X, `tests` is `not_run`" is a real fact and is how a stale
  earlier pass is superseded.
- `evidenceDigest: Sha256Digest | null` (nullable rather than optional,
  matching every other contracts field) is **required non-null for every
  satisfying state** and permitted null otherwise. A pass without evidence
  is unrepresentable; `market=evidence` in particular cannot be recorded
  from model confidence because there is nothing to digest.
- Human-only states are exactly `gates.md`'s list. `visual=human_review_required`
  and `device=human_required` are _requests_ for a human and may be set by a
  machine. `market=evidence` is not human-only in `gates.md` and is not made
  so here; its guard is the evidence-digest requirement.

### Project lifecycle state and the pure rules

`ProjectLifecycleStateV1` = `{ schemaVersion, projectId, stage, gates[],
updatedAt }` (`project-lifecycle-state.v1.schema.json`), at most one record
per gate (the latest observation). The schema's own refinement rejects a
`stage` the recorded gates do not hold, so an inconsistent state cannot be
persisted or parsed; the functions below maintain that invariant rather than
being the only thing that checks it. No kernel table or daemon command is
added by this ADR (see Non-goals), so no migration is needed.

Two definitions the rules use:

- A stage is **held** when every cumulative requirement for it is met by the
  latest observation of each gate, at any SHA. `idea` and `building` are
  always held. Cumulative means the `gates.md` rules for every stage up to
  and including this one, with a later rule on the same gate replacing an
  earlier, weaker one (`device` tightens from `≥ simulator_only` at
  `launch-prep` to `physical_pass` at `live`).
- A stage is **proven** when it is held **at one common commit SHA** across
  all its cumulative requirements. `provingShaForProjectStageV1` returns that
  SHA or `null`.

`advanceProjectLifecycleStage(state, to, actor, at)` — the only way a stage
moves forward, freezes, or thaws:

| from → to                                    | requirement                                                                                     | actor                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `idea → building`                            | none                                                                                            | any                                                                                            |
| `building → qa`                              | `qa` proven: `build=verified ∧ tests=passed` at one SHA                                         | any                                                                                            |
| `qa → launch-prep`                           | `launch-prep` proven: the above ∧ `visual=passed ∧ device ≥ simulator_only`, all at one SHA     | any                                                                                            |
| `launch-prep → live`                         | `live` proven: the above ∧ `device=physical_pass ∧ legal=cleared ∧ store=ready`, all at one SHA | any — the human-only decisions are the three gate states, which only a human can have recorded |
| any non-frozen → `frozen`                    | —                                                                                               | human only                                                                                     |
| `frozen → idea`                              | —                                                                                               | human only                                                                                     |
| `frozen → S`                                 | `S` proven                                                                                      | human only                                                                                     |
| skip a stage, stand still, or move backwards | never — demotion happens only through gate observations                                         | —                                                                                              |

`applyProjectLifecycleGate(state, gate, actor)` — records one observation:

1. Reject a `machine` actor recording any human-only state
   (`human-only-gate-state`, checked before the full parse so the reason is
   explicit; the schema would reject it anyway).
2. Reject `gate.owner ≠ actor` (`owner-mismatch`).
3. Reject an observation older (`at`) than the one already recorded for the
   same gate (`stale-observation`) — replayed or out-of-order evidence
   cannot overwrite a newer fact.
4. Replace that gate's record. Then **stage := lower of (current stage,
   highest held stage)** — `gates.md`'s "any gate regression at a newer SHA
   demotes the stage automatically. No exceptions by prose." A regression
   cascades to the highest stage still held (`live → building` if `tests`
   fail; `live → launch-prep` if `device` drops to `simulator_only`), and
   `building` is the floor: a started project never returns to `idea` by
   regression. `frozen` and `idea` are never changed by an observation.
5. A gate observation **never promotes**. Advancing is an explicit,
   recorded decision (item above); the observation only makes it legal.

`evaluateProjectLifecycleV1(state)` is the read view Studio and the T9
hand-off list are meant to consume: `stage`, `highestHeldStage`, and for the
next stage `ready`, `provingSha`, and `blockers[]` — each blocker naming the
gate, the acceptable states, the observed state/SHA, why it blocks
(`missing | not-satisfied | stale-sha`), and `humanOnly` when only a human
can clear it. `humanOnly` blockers are precisely the ones that render gold ◆
in the HUD; everything else is the machine's to do.

#### "Newer SHA", staleness, and why holding and proving differ

Git SHAs are unordered and the functions are pure, so "newer" is the
observation instant `at`; a satisfying observation at a different SHA is
partial progress at a new head, not a regression. Concretely:

- `qa` proven at `sha1`; `build=verified` observed at `sha2`. The stage stays
  `qa` (nothing regressed), but `launch-prep` cannot be entered until
  `tests`, `visual`, and `device` are re-established at `sha2` —
  `evaluateProjectLifecycleV1` lists them as `stale-sha` blockers (relative
  to the SHA of the most recently observed satisfying gate; ties resolve in
  requirement order). Evidence at a stale SHA is not evidence _for
  advancing_.
- `qa` proven at `sha1`; `tests=failed` observed at `sha2`. The stage demotes
  to `building` immediately.

Holding at any SHA while proving at one SHA is the asymmetry that keeps
`live` meaning "the head of this project is release-quality and shipped"
without a routine commit un-shipping a product on the dashboard, while still
making it impossible to advance past machine truth. The release itself —
what happened to candidate `sha1` — is `ReleaseManifestV1`'s job, which is
exactly why it is a separate machine.

### Boundary between the two machines

The project machine and the release machine are deliberately not coupled in
code by this ADR: the pure functions above never read a
`ReleaseManifestV1`, and `assertReleaseAdvancement` never reads a
`ProjectLifecycleStateV1`. The intended relationship, recorded here as the
contract future wiring must satisfy:

| Release fact (d)                                                               | Typed gate observation it justifies                                            | Owner                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `certified` for candidate `c`                                                  | `build=verified`, `tests=passed` at `sha=c` (from the bound `QualityReportV1`) | machine                                                  |
| `internal-testflight-available`                                                | (none — a release fact, not a project gate)                                    | —                                                        |
| `device-smoke-passed` (human `device-smoke` gate, `deviceSmokeEvidenceDigest`) | `device=physical_pass` at `sha=c`, `evidenceDigest=deviceSmokeEvidenceDigest`  | **human** (the same human who approved the release step) |
| App Store metadata/assets/signing preflight                                    | `store=in_progress` (machine) → `store=ready` (**human**)                      | mixed, as `gates.md` says ("partly human-only")          |

A future kernel/command layer that derives gate records from release
evidence must do so through `applyProjectLifecycleGate` with the real actor,
so a machine-derived record can never claim a human-only state.

## Additive contracts changes

`schemas:check` passes. Checked-in JSON Schema changes:

- **New** `typed-gate.v1.schema.json` (`urn:app-factory:contracts:v1:typed-gate`)
  and `project-lifecycle-state.v1.schema.json`
  (`urn:app-factory:contracts:v1:project-lifecycle-state`), with valid and
  invalid fixtures in `packages/contracts/fixtures/v1`.
- `project-manifest.v1.schema.json` and `command-response.v1.schema.json`
  (via `PortfolioProjectReadModelV1.lifecycleStage`): the legacy enum's
  `$defs` entry gains `deprecated: true` and a `description`. No property,
  type, enum value, or `required` entry changed anywhere.

TypeScript surface: `ProjectLifecycleStageV1Schema` /
`ProjectLifecycleStageV1` now name the six-stage vocabulary; the former
export of that name is `LegacyProjectLifecycleStageV1Schema` /
`LegacyProjectLifecycleStageV1`, `@deprecated`, still the type of
`ProjectManifestV1.lifecycleStage`, `PortfolioProjectReadModelV1.lifecycleStage`,
and `packages/portfolio`'s `PortfolioPlanningProjectInputV1.lifecycleStage`.
Those two consumers were updated to the new name; nothing else in the
repository referenced the symbol.

## Rejected alternatives

- **Adopt the corpus's fourteen stages as the live enum.** Rejected: it is
  the vocabulary with the least machine truth in it (no gates, no SHAs, no
  owners), and its resolution mixes product, engineering, and release facts
  that (b) and (d) already separate cleanly. Fourteen values also cannot be
  displayed as phase rings without a legend nobody will read.
- **Keep the legacy manifest enum as the canonical name and give the six-stage
  vocabulary a new one.** Rejected: the canonical thing should have the
  canonical name; every future consumer (Studio, planner, mirrors) is going
  to import `ProjectLifecycleStageV1`, and it must get the vocabulary this
  ADR chose, not the deprecated one, by default. The rename is compile-time
  visible (`tsc` fails on a stale import) rather than silently wrong.
- **Fold ADR 0003's eight release stages into the project lifecycle** (i.e.
  add `certified`, `uploaded`, … as project stages). Rejected: a project can
  have several releases, and a release never regresses while a project stage
  can. Two objects with different cardinality and different monotonicity
  cannot be one enum without one of them lying.
- **Add `lifecycle: { stage, gates }` to `ProjectManifestV1` now.** Rejected
  for this ADR: it would make an evidence-bearing, frequently-changing state
  part of an object that is otherwise configuration (`rules`, `commands`,
  `protectedPaths`) and is digest-bound in enrollment. `ProjectLifecycleStateV1`
  is its own document; where it is persisted (a kernel table, a daemon
  command, a repository doc under ADR 0004's "docs are the source of truth")
  is the wiring decision this ADR precedes.
- **Make `evidenceDigest` optional (absent key) instead of nullable.**
  Rejected: every nullable field in contracts is `null`-valued with a
  required key; an absent key would be the only exception and would let a
  producer forget the field rather than decide it.
- **Let a machine actor advance `launch-prep → live` be forbidden.**
  Rejected: the three human-only decisions are already the gate states, and
  requiring a fourth human action to record what three human actions already
  proved adds ceremony without a new fact. If a later policy wants a
  human-recorded approval on the transition itself, that is one line in the
  actor check and one test — it does not change the vocabulary.
- **Demote on any SHA drift** (treat a satisfying observation at a new SHA as
  regressing every gate still at the old SHA). Rejected: every routine
  commit would flap `live → building` and back, the dashboard would show a
  shipped app as `building`, and nothing would be gained — advancing already
  requires re-proving at one SHA.

## Non-goals

- Persisting `ProjectLifecycleStateV1` (kernel table, daemon command,
  repository doc) or emitting `LifecycleEventV1` on transitions. No
  consumer is wired; the pure functions and their transition result
  (`{ state, transition: { from, to, cause } | null }`) are shaped so the
  wiring can emit events without re-deriving anything.
- Rewriting `ProjectManifestV1.lifecycleStage` to the new enum, or removing
  it. Deprecated-and-accepted is the whole point of the additive change;
  removal is a later, separately classified change once no manifest carries
  a legacy value.
- Modelling App Store submission/review/publication. ADR 0003's release
  target is `ios-internal-testflight` only; when a public-release target
  exists, `live` may additionally require a release at that target's terminal
  stage — a rule change, not a vocabulary change.
- Reading, editing, or importing mission-control's `gates.md` /
  `registry.json` or the rules corpus. Both remain outside this repository.
  `gates.md` should be updated by its owner to point here as the executable
  definition (open follow-up); registry records already use the same gate
  names, states, and shape (`state`, `sha`, `evidence`, `at`).
- The rules corpus's work-item lifecycle, `packages/website-lifecycle`'s
  own `lifecycleStage: "private-beta"` (a website deployment state, not a
  project stage), and the in-progress `studio-ios` Phase Preset (ADR 0004's
  fourth reported vocabulary — it is a consumer that must bind to this one,
  not a fifth source).

## Consequences

- There is one project lifecycle vocabulary and one function that advances
  it, one that records gates against it, and one that explains what blocks
  it. Studio phase 4's planner, phase 2's milestones, and the T9 hand-off
  list bind to `ProjectLifecycleStageV1`, `TypedGateV1`, and
  `evaluateProjectLifecycleV1`; the release rail (phase 6) binds to
  `ReleaseManifestV1` beneath `launch-prep`.
- "Machine may never set a human-only gate state" is now a schema fact and
  a function fact with tests, not a policy note; a future rules/policy engine
  human-only owner field (ADR 0004 gap) has a concrete shape to reference:
  `HUMAN_ONLY_GATE_STATES_V1`.
- Every legacy manifest keeps parsing, and every consumer that displays a
  legacy value can fold it through `projectLifecycleStageFromLegacyV1` today
  without waiting for a manifest migration.
- The matrix and rules above are encoded as tests
  (`packages/contracts/test/lifecycle.test.ts`); a change to any rule fails
  deterministically.
