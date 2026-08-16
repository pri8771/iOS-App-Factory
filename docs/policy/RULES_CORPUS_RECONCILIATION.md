# Rules corpus reconciliation

- Date: 2026-08-16
- Branch: `studio/rules-corpus-compile`
- Compiled source:
  [`ios-app-factory-policy-source.v1.json`](ios-app-factory-policy-source.v1.json)
  (`CanonicalPolicySourceV1`, validated by the current
  `packages/policy-engine` schema)
- Sidecar:
  [`ios-app-factory-policy-source.v1.sidecar.json`](ios-app-factory-policy-source.v1.sidecar.json)
  (provenance, check registry, and fields the engine schema does not have yet)
- Compiler/prover: [`packages/policy-corpus`](../../packages/policy-corpus)

This document records where the compiled policy came from, how each source
statement was mapped onto the engine's `principles` / `rules` /
`protectedSurfaces` shape, what drifted between the corpus versions in
circulation, and what applying the compiled bundle to Hindsight actually did.

## 1. Inputs

Everything was read locally. The upstream `pri8771/iOS_app_factory_rules`
repository was **not** fetched (task constraint); see §2.

| Source                                                                             | Location                                                                                   | Commit    | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS App Factory rules corpus, `VERSION` = `0.2.0`                                  | `~/Documents/other/studio_ops/iOS_app_factory_rules`                                       | `89ce224` | `governance/STUDIO_PRINCIPLES.md` (12), `DEFINITION_OF_DONE.md`, `DOCUMENTATION_POLICY.md`, `PROJECT_LIFECYCLE.md`, `standards/quality/VIBE_CODING_QUALITY_RULEBOOK.md`, `standards/ai/AI_CODING_AGENT_STANDARD.md`, `standards/platforms/APPLE_STANDARD.md`, `standards/engineering/ARCHITECTURE_STANDARD.md`, `AGENTS.md`, `playbooks/REGISTER_EXISTING_PROJECT.md` |
| Mission-control gate taxonomy                                                      | `~/Documents/other/studio_ops/mission-control/gates.md`                                    | `bbbdf9d` | Human-only gates, SHA-bound evidence, stage-advance rules                                                                                                                                                                                                                                                                                                             |
| Studio decision "GitHub is the source of truth; Notion/Jira are read-only mirrors" | `~/Documents/other/studio_ops/Codex/collab/discussions/consolidation-plan.md` (2026-07-21) | —         | Source of the docs-are-truth principle and `rule.docs.repo-is-truth`                                                                                                                                                                                                                                                                                                  |
| This repository's `AGENTS.md`                                                      | `/AGENTS.md`                                                                               | —         | Scope, protected surfaces, credentials, digest binding, definition of done                                                                                                                                                                                                                                                                                            |

SHA-256 digests of every corpus file that was read are recorded in the sidecar
(`corpus.files`, `corpus.additionalSources`), so the compiled policy is bound
to exact input bytes.

## 2. Version drift: 0.2.0 / 0.4.0 / 0.5.0

| Version | Where it is reported                                                                                                                                                                                                                                 | What was verified here                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.2.0` | Local corpus `VERSION`; Hindsight's archived `.app-factory/legacy/standard-lock.json` (`standardVersion: 0.2.0`, installed 2026-07-23)                                                                                                               | Read in full; this is the compiled source. Its layout is `.factory/project-context.json`, `.factory/standard-lock.json`, `.factory/AGENTS.factory.md`, plus five tool entry files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/app-factory.mdc`, `.github/copilot-instructions.md`).                                                                                                                                                       |
| `0.4.0` | `studio-ios/registry/standards.yaml`, `studio-ios/standards/domains/IOS_APP_FACTORY.md`, `studio/conduit/.factory/standard-lock.json` and `quality/quality-manifest.json` (`qualityStandardVersion: 0.4.0`), three `studio-ios/products/*` manifests | **Not fetched.** Only derived artifacts were observed. They show 0.4.0 added at least `.factory/repository-map.json` (`repositoryMapVersion: 1.0.0`), `.factory/library-catalog.json` (`libraryCatalogVersion: 0.1.0`), an `LLM_START_HERE.md` entrypoint, and a read path `AGENTS.md → repository-map → project-context → standard-lock → docs/README.md`. Whether any principle or rule text changed between 0.2.0 and 0.4.0 is unknown from here. |
| `0.5.0` | Reported by [ADR 0004](../architecture/0004-studio-mac-app.md) and `IMPLEMENTATION_STATUS.md` as "the CLI-pinned version"                                                                                                                            | **Not located.** Bounded searches of `~/Documents/other/studio_ops`, `~/Documents/app_factory`, and `~/Documents/iOS-App-Factory` (empty) found no artifact carrying `0.5.0`. It remains a reported, unverified pin.                                                                                                                                                                                                                                 |

Consequences for the compiled policy:

- The engine's `policyVersion` is an integer (`1`) unrelated to the corpus
  semver. The corpus version, commit, and file digests live only in the
  sidecar (`corpus`), flagged as a TODO for `studio/policy-engine-scoping`.
- Nothing 0.4.0-specific (repository map, library catalog) is compiled. If
  the upstream text changed, the compiled principles must be re-derived from
  the fetched files and `policyVersion` bumped; the sidecar digests make the
  gap detectable.

### Lifecycle vocabulary drift (recorded, not reconciled)

Four vocabularies still disagree, as ADR 0004 records. Listed here so the
scoping work can bind `appliesTo` to one of them deliberately:

| Vocabulary                                                      | Values                                                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus product lifecycle (`PROJECT_LIFECYCLE.md`, 14 stages)    | `idea → research → validated → planned → prototype → mvp_development → code_complete → verification_pending → verified → beta → release_candidate → released → maintained → paused_or_retired` |
| Corpus work-item lifecycle (8 states)                           | `planned → ready → in_progress → code_complete → verification_pending → verified → human_review_required → done` (+ `blocked`)                                                                 |
| `gates.md` lifecycle (6 stages)                                 | `idea → building → qa → launch-prep → live → frozen`                                                                                                                                           |
| `ProjectManifestV1.lifecycleStage` (this repository)            | `exploring, planned, building, qa, internal-testflight, released, paused, archived`                                                                                                            |
| `EnrollmentPlanV1.actions[].phase` (this repository, unrelated) | `safety, compatibility, authority, project, quality, automation`                                                                                                                               |

The sidecar's `ruleSources[].appliesTo` uses the `gates.md` stage names
because the human-only gate rules come from that document; this is a
placeholder, not a decision.

### Layout drift

- 0.2.0 authority lives under `.factory/`; this repository's scanner treats
  `.factory/project-context.json`, `.factory/standard-lock*.json`, and
  `.factory/AGENTS.factory.md` as a legacy contract
  (`compatibility.legacy-factory-layout`) and expects `.app-factory/`
  manifests plus a root `AGENTS.md` with `factory-rule:` declarations.
- Hindsight `factory/pilot-1.1` already migrated (2026-08-14 per its
  `.app-factory/project.json`); the archive lives at `.app-factory/legacy/`.
- The compiled policy therefore protects both `.factory/**` (so a parallel
  legacy layout cannot be reintroduced silently) and `.app-factory/**`.

### Adapter-set drift

The corpus lists five tool entry files plus `.factory/AGENTS.factory.md`. The
engine's `PolicyClient` is `codex | claude | cursor | antigravity`, so the
compiler owns `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and
`.cursor/rules/app-factory.mdc` only. `.github/copilot-instructions.md` and
`AGENTS.factory.md` are outside the bundle. The Hindsight proof in §5 shows
exactly what that costs.

## 3. Mapping decisions

### 3.1 Principles (28)

The 12 studio principles were kept nearly verbatim (indexes 0–11) and
augmented with deduplicated statements from the Rulebook's non-negotiables,
the DoD, the Documentation Policy, the AI standard, `gates.md`, and this
repository's `AGENTS.md`. Duplicates were merged, e.g. "never show success
before success" (SP2 + DoD + Rulebook 2) is one principle; "fake data never a
production fallback" (SP3 + Rulebook 3 + AI standard + Apple standard) is one.
Per-principle provenance is `principleSources` in the sidecar; the test suite
fails if a principle has no source or a source points at no principle.

Notable additions beyond the corpus text:

- Index 21: repository docs are truth; Jira/Notion/dashboards/labels are
  read-only mirrors (from the 2026-07-21 studio decision).
- Index 22–24: untrusted-input, never-weaken-gates, and SHA-bound evidence
  (from this repository's `AGENTS.md` and `gates.md`).
- Index 25: human-only gates and "market stays hypothesis" (`gates.md`).
- Index 27: Apple verification runs on the trusted macOS plane
  (`APPLE_STANDARD.md#verification`).

### 3.2 Rules (32) and enforcement

| Source statement                                                                  | Rule id                                                                                                                            | Enforcement → `requiredCheck`                             | Why                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DoD "Required automated suites pass"; Apple verification on macOS                 | `rule.dod.verification`                                                                                                            | `trusted-check` → `xcodebuild.test`                       | Machine-decidable; the trusted verifier is the only actor allowed to assert a pass.                                                                                                 |
| DoD state/interface + Rulebook screen states, layout, edge-case set               | `rule.dod.experience-coverage`                                                                                                     | `trusted-check` → `quality.experience-matrix`             | Maps onto `packages/quality` matrix findings (required-case-missing, clipped-critical-content, missing-accessibility-semantics); a check id binding them is still to be registered. |
| DoD "at least one non-happy path"; AGENTS.md "tests for every behavior change"    | `rule.dod.non-happy-path-tested`                                                                                                   | `review` → `review.test-coverage`                         | Relevance of a non-happy path is a judgment; `review.missing-test` finding code already exists.                                                                                     |
| AI standard completion reporting; DoD verification disclosures                    | `rule.dod.completion-report`                                                                                                       | `review` → `review.completion-report`                     | Honesty of a report is reviewed, its evidence is brokered (next row).                                                                                                               |
| `code_complete ≠ done`; work-item lifecycle; AGENTS.md definition of done         | `rule.completion.evidence-manifest`                                                                                                | `broker` → `broker.evidence-manifest`                     | Task mapping. The broker owns state transitions; prose never advances state.                                                                                                        |
| `gates.md` states, SHA binding, stage-advance rules, auto-demotion                | `rule.gates.sha-bound`                                                                                                             | `broker` → `broker.gate-sha-binding`                      | Mechanical rule over recorded state.                                                                                                                                                |
| AGENTS.md scope/worktree                                                          | `rule.scope.declared-paths`                                                                                                        | `broker` → `policy.changed-paths`                         | Existing name in the engine tests.                                                                                                                                                  |
| AGENTS.md protected surfaces; "do not silently weaken acceptance criteria"        | `rule.scope.protected-surfaces`                                                                                                    | `broker` → `policy.protected-surfaces`                    | Enforced against `PolicyLockV1.protectedSurfaces`.                                                                                                                                  |
| AGENTS.md credentials; Rulebook "never ship secrets"                              | `rule.security.no-credentials-in-artifacts`                                                                                        | `broker` → `broker.secret-scan`                           | Scanner heuristics already exist in `project-sdk`.                                                                                                                                  |
| Docs are truth; Jira/Notion mirrors                                               | `rule.docs.repo-is-truth`                                                                                                          | `broker` → `broker.mirror-effects`                        | Task mapping: principle (index 21) **plus** a broker rule; tracker writes are outbound effects only.                                                                                |
| Documentation Policy maintenance; AI standard "update docs and contracts"         | `rule.docs.same-change`                                                                                                            | `review` → `review.docs-same-change`                      | Task mapping.                                                                                                                                                                       |
| Fake-data / fake-feature prohibition                                              | `rule.data.no-fake-fallback`, `rule.ui.no-decorative-controls`                                                                     | `review` → `review.fake-feature`                          | Task mapping.                                                                                                                                                                       |
| Success-after-confirmation, explicit states, no duplicates/stale, error ownership | `rule.ui.success-after-confirmation`, `rule.ui.explicit-states`, `rule.async.no-duplicates-no-stale`, `rule.errors.owned-and-safe` | `review` → `review.state-modeling`                        | Grouped under one review rubric to keep the check surface small.                                                                                                                    |
| Persistence verified; recoverable work preserved                                  | `rule.data.persistence-verified`, `rule.data.recoverable-work-preserved`                                                           | `review` → `review.data-integrity`                        |                                                                                                                                                                                     |
| Permissions and privacy                                                           | `rule.privacy.minimal-collection`                                                                                                  | `review` → `review.privacy-and-logging`                   |                                                                                                                                                                                     |
| AI features                                                                       | `rule.ai.validated-output`                                                                                                         | `review` → `review.ai-output-handling`                    |                                                                                                                                                                                     |
| Existing-project inventory; new-project scope-before-breadth                      | `rule.existing.inventory-before-restructure`, `rule.new.scope-before-breadth`                                                      | `review` → `review.project-baseline`                      |                                                                                                                                                                                     |
| "Do not replace working code with a new scaffold without an approved decision"    | `rule.existing.no-rescaffold-without-decision`                                                                                     | `approval` → `approval.architecture-decision`             | The corpus itself requires an approved decision record.                                                                                                                             |
| Dependencies documented                                                           | `rule.dependencies.justified`                                                                                                      | `review` → `review.dependency-justification`              |                                                                                                                                                                                     |
| Accessibility                                                                     | `rule.accessibility.primary-workflow`                                                                                              | `review` → `review.accessibility`                         |                                                                                                                                                                                     |
| Release hygiene; production configuration                                         | `rule.release.hygiene`                                                                                                             | `review` → `review.release-hygiene`                       |                                                                                                                                                                                     |
| `gate:legal` cleared / `gate:device` physical_pass / `gate:store` ready           | `rule.gate.legal`, `rule.gate.device`, `rule.gate.store`                                                                           | `approval` → `approval.gate-legal` / `-device` / `-store` | Task mapping: human-only.                                                                                                                                                           |
| `gate:market` evidence                                                            | `rule.gate.market`                                                                                                                 | `approval` → `approval.gate-market`                       | Task mapping: never automated; statement says so.                                                                                                                                   |
| "anything requiring credentials — Priyansh-only"                                  | `rule.release.credentialed-actions`                                                                                                | `approval` → `approval.credentialed-action`               |                                                                                                                                                                                     |

Kept as principles only (no rule): untrusted-input handling (index 22) and
local-first / platform-native preferences (indexes 3–4), because there is no
decidable check to bind them to yet.

Not compiled (out of the source set or not policy): the corpus's bootstrap
scripts and schemas, product/design/business/legal index READMEs, and the
14-stage product lifecycle.

### 3.3 Protected surfaces (9)

`.factory/**` (policy), `.app-factory/**` (policy), `quality/**`
(quality-threshold), `.github/workflows/**` (ci), `*UITests/**`
(test-harness), `**/*.entitlements` and `**/ExportOptions.plist` (signing),
`fastlane/metadata/**` and `docs/RELEASE_CHECKLIST.md` (release). Each has its
own `changeApprovalAction`. The engine stores these strings verbatim and does
not yet define glob or case semantics; Hindsight keeps its checklist at
`Docs/RELEASE_CHECKLIST.md`, which the current lock would not match. Both are
sidecar TODOs.

### 3.4 Check registry

The 26 distinct `requiredCheck` codes are all `status: planned` in the sidecar
`checkRegistry`: none is registered anywhere in this repository today (ADR
0004 records that the engine has no check registry). Declaring them anyway is
deliberate — the broker must fail closed on an unknown check rather than
treat it as satisfied. The test suite fails if a rule uses an unregistered
check or a registered check is unused, and if a `humanOnly` rule is not
`approval`-enforced.

## 4. Compiler change required to make the bundle enrollable

The stock `compilePolicyBundle` rendered prose only. The project scanner
(`packages/project-sdk`) reports a root `AGENTS.md` as `canonical` only when it
has at least one `factory-rule: key=value` declaration, and an adapter as
`conforming` only when it declares `authority.import=<canonical path>` and
`authority.digest=<sha256 of the canonical file>`. Applying the stock output
to Hindsight therefore **reintroduced** `rules.canonical-unverifiable` and
`rules.adapter-nonconforming` (§5, stage A).

`packages/policy-engine/src/declarations.ts` (new) now emits, and the
compiler includes in the digest-locked bytes:

- in `AGENTS.md`, a final `## Machine-checkable declarations` section:
  `authority.version=1`, `policy.id`, `policy.version`, `policy.digest`
  (= `sourceDigest`), and `<ruleId>.enforcement` / `<ruleId>.check` per rule
  (68 lines for this source);
- in every adapter, `authority.import=AGENTS.md` and
  `authority.digest=<digest of the generated AGENTS.md>`.

Keys are unique per file by construction (rule ids are unique; the authority
never declares `authority.import`/`authority.digest`), so no
`rules.conflicting-declaration` can arise from the bundle itself. The change
alters bundle digests for every source; the engine had no consumers other than
its own tests. `verifyPolicyBundle` / `resolvePolicyContext` are unchanged.

## 5. Proof against Hindsight (scratch clone only)

Clone: `git clone ~/Documents/wip_apps/ios_apps/hindsight -b factory/pilot-1.1
/tmp/af-corpus-hindsight`. The real checkout was never opened for writing and
stayed on its own branch throughout. All scans used
`packages/policy-corpus` → `@app-factory/project-sdk` `scanExistingProject`
(read-only, preservation-checked).

| Stage                                                                                    | Tree                                                                                                                                   | `rules.canonical-unverifiable` | `rules.adapter-nonconforming`                                                                                                                                                                                                          | `compatibility.legacy-factory-layout`             | Other                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline `factory/pilot-1.1` @ `10cc1b1`                                                 | AGENTS.md has 1 declaration (`authority.version=1`); 4 adapters bound to it; `.factory/` already archived under `.app-factory/legacy/` | absent                         | absent                                                                                                                                                                                                                                 | absent                                            | 9 × `safety.secret-material-detected` (`Backend/Spike/Postgres/*.sh`, `Scripts/social_v2_client_ci.sh`, `Config/SocialV2/environment-manifest.example.json`, `Contracts/PrivacyFixtures/*.json`, `.app-factory/legacy/standard-lock.json`) |
| A — stock compiler bundle applied (`sha256:3517…3f77`)                                   | AGENTS.md 0 declarations; CLAUDE/GEMINI/cursor 0 declarations                                                                          | **blocker (regressed)**        | **blocker (regressed)** on `.cursor/rules/app-factory.mdc`, `.github/copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`                                                                                                                | absent                                            | same 9                                                                                                                                                                                                                                     |
| B — declaring compiler bundle applied (`sha256:e76b…2666`, commit `1b419ce`)             | AGENTS.md `canonical`, 68 declarations; CLAUDE/GEMINI/cursor `conforming`                                                              | **cleared**                    | **cleared for the 3 bundle adapters; remains for `.github/copilot-instructions.md`** (still bound to the pre-bundle digest `5f66…4151`) plus a new `rules.conflicting-declaration` on `authority.digest` (stale vs fresh at scope `.`) | absent (already migrated; not the bundle's doing) | same 9                                                                                                                                                                                                                                     |
| C — B plus rebinding copilot's `authority.digest` line to `8c07…8f0e` (commit `a65b39e`) | all 5 rule files canonical/conforming                                                                                                  | cleared                        | cleared                                                                                                                                                                                                                                | absent                                            | same 9; `verify` still reports `drift: false` (copilot is outside the bundle)                                                                                                                                                              |

Summary: the compiled bundle clears `rules.canonical-unverifiable` and clears
`rules.adapter-nonconforming` for every adapter it owns; it does not touch
`compatibility.legacy-factory-layout` (already cleared on the pilot branch by
the 2026-08-14 migration, and it would remain a blocker on any tree that still
has `.factory/`). The single remaining rule blocker after applying the bundle
is the Copilot adapter the compiler does not own, and it surfaces as two
issues (nonconforming + conflicting-declaration). Note that
`applyEnrollmentPlan`'s `repair-rule-adapter` cannot fix that case either: it
appends a second `authority.digest` line, which is exactly the conflicting
pair — worth a follow-up in `project-sdk`.

Non-rule blockers (`safety.secret-material-detected`) are pre-existing
heuristic hits on shell scripts and privacy fixtures and were out of scope.

Reproduce (paths under `/private/tmp` because the scanner requires a real,
non-symlinked root):

```sh
cd /tmp/af-corpus && pnpm build
git clone ~/Documents/wip_apps/ios_apps/hindsight -b factory/pilot-1.1 /tmp/af-corpus-hindsight
node packages/policy-corpus/dist/cli.js scan --root /private/tmp/af-corpus-hindsight            # baseline
node packages/policy-corpus/dist/cli.js compile \
  --source docs/policy/ios-app-factory-policy-source.v1.json \
  --sidecar docs/policy/ios-app-factory-policy-source.v1.sidecar.json \
  --out /private/tmp/af-corpus-hindsight --generated-at 2026-08-16T00:00:00.000Z --overwrite
git -C /tmp/af-corpus-hindsight commit -aqm "scratch: apply compiled bundle"
node packages/policy-corpus/dist/cli.js verify --source docs/policy/ios-app-factory-policy-source.v1.json \
  --generated-at 2026-08-16T00:00:00.000Z --root /private/tmp/af-corpus-hindsight
node packages/policy-corpus/dist/cli.js scan --root /private/tmp/af-corpus-hindsight            # stage B
```

## 6. Open questions

1. **Copilot adapter ownership.** Add `copilot` to `PolicyClient` and to
   `ProjectManifestV1.rules.clientEntrypoints.client`, and have the compiler
   emit `.github/copilot-instructions.md`? Otherwise every corpus-bootstrapped
   repository needs a manual rebind or deletion before enrollment.
2. **Project-local preamble.** The compiled `AGENTS.md` replaces the whole
   file, so Hindsight's reading order (`.app-factory/project.json`,
   `quality/quality-manifest.json`, `Docs/*`) has no home. Candidate homes: the
   project manifest, or a nested-scope `AGENTS.md`.
3. **Check registry and executors.** All 26 checks are `planned`; which
   package registers each, and does the broker refuse unknown checks?
4. **Protected-surface glob and case semantics** (`*UITests/**`,
   `**/*.entitlements`, `docs/` vs `Docs/`).
5. **Which lifecycle vocabulary `appliesTo` binds to** (§2).
6. **0.4.0 text drift and the 0.5.0 pin** — fetch upstream and diff before
   bumping `policyVersion`.
7. **`project-sdk` `repair-rule-adapter` on an already-bound adapter** appends
   rather than replaces `authority.digest` and would create the conflict
   observed in stage B.

## 7. Not modified

The real Hindsight checkout, the local rules corpus, `mission-control`, and
every other worktree were read only. No push, no upstream fetch.
