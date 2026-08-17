# Rules corpus reconciliation

- Date: 2026-08-16 (initial compile, `studio/rules-corpus-compile`);
  2026-08-17 (upstream reconciliation to corpus 0.4.0, `studio/rules-corpus-0.4`)
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

The 2026-08-16 compile read everything locally at corpus `0.2.0` / `89ce224`;
upstream was not fetched then. On 2026-08-17 `git fetch origin` was run in the
same local clone (remote-tracking refs only; the clone's working tree and local
`main` still sit at `89ce224`) and the compiled policy was re-derived from
`origin/main` = `4b8b12ea87d78d392485ea8a73440a17ee50bba9` (`VERSION` =
`0.4.0`, committed 2026-07-19), read with `git show origin/main:<path>`. The
table below records the current source set; the sidecar
(`corpus.files`, `corpus.upstream`) carries the SHA-256 of every upstream
file that was read.

| Source                                                                                    | Location                                                                                                        | Commit    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS App Factory rules corpus, `VERSION` = `0.4.0` (was `0.2.0` / `89ce224` on 2026-08-16) | `~/Documents/other/studio_ops/iOS_app_factory_rules` → `origin/main` (github.com/pri8771/iOS_app_factory_rules) | `4b8b12e` | 0.2.0 set: `governance/STUDIO_PRINCIPLES.md` (now 16), `DEFINITION_OF_DONE.md`, `DOCUMENTATION_POLICY.md`, `PROJECT_LIFECYCLE.md`, `standards/quality/VIBE_CODING_QUALITY_RULEBOOK.md`, `standards/ai/AI_CODING_AGENT_STANDARD.md`, `standards/platforms/APPLE_STANDARD.md`, `standards/engineering/ARCHITECTURE_STANDARD.md`, `AGENTS.md`, `playbooks/REGISTER_EXISTING_PROJECT.md`. Added at 0.4.0: `governance/REPOSITORY_MODEL.md`, `CROSS_IDE_OPERATING_MODEL.md`, `STUDIO_OS_INTEGRATION.md`, `standards/engineering/MODULAR_LIBRARY_STANDARD.md`, `REUSE_FIRST_WORKFLOW.md`, `standards/documentation/LLM_DOCUMENTATION_STANDARD.md`, `standards/testing/AUTOMATED_UI_TESTING_STANDARD.md`, `playbooks/START_NEW_PROJECT.md`, `PROMOTE_CODE_TO_SHARED_LIBRARY.md`, `CREATE_NEW_PRODUCT_REPOSITORY.md`, `ENROLL_AND_HANDOFF_EXISTING_PROJECT.md`, `LLM_START_HERE.md`, `CHANGELOG.md`, the `templates/project/.factory/*` and `schemas/*` layout artifacts, `factory_cli/cli.py`, `pyproject.toml` (digest-recorded for the layout/version findings, not compiled as rule text) |
| Mission-control gate taxonomy                                                             | `~/Documents/other/studio_ops/mission-control/gates.md`                                                         | `bbbdf9d` | Human-only gates, SHA-bound evidence, stage-advance rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Studio decision "GitHub is the source of truth; Notion/Jira are read-only mirrors"        | `~/Documents/other/studio_ops/Codex/collab/discussions/consolidation-plan.md` (2026-07-21)                      | —         | Source of the docs-are-truth principle and `rule.docs.repo-is-truth`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| This repository's `AGENTS.md`                                                             | `/AGENTS.md`                                                                                                    | —         | Scope, protected surfaces, credentials, digest binding, definition of done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

SHA-256 digests of every corpus file that was read are recorded in the sidecar
(`corpus.files`, `corpus.additionalSources`), so the compiled policy is bound
to exact input bytes.

## 2. Version drift: 0.2.0 / 0.4.0 / 0.5.0

### 2.1 State on 2026-08-16 (before the fetch)

| Version | Where it is reported                                                                                                                                                                                                                                 | What was verified here                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.2.0` | Local corpus `VERSION`; Hindsight's archived `.app-factory/legacy/standard-lock.json` (`standardVersion: 0.2.0`, installed 2026-07-23)                                                                                                               | Read in full; this is the compiled source. Its layout is `.factory/project-context.json`, `.factory/standard-lock.json`, `.factory/AGENTS.factory.md`, plus five tool entry files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/app-factory.mdc`, `.github/copilot-instructions.md`).                                                                                                                                                       |
| `0.4.0` | `studio-ios/registry/standards.yaml`, `studio-ios/standards/domains/IOS_APP_FACTORY.md`, `studio/conduit/.factory/standard-lock.json` and `quality/quality-manifest.json` (`qualityStandardVersion: 0.4.0`), three `studio-ios/products/*` manifests | **Not fetched.** Only derived artifacts were observed. They show 0.4.0 added at least `.factory/repository-map.json` (`repositoryMapVersion: 1.0.0`), `.factory/library-catalog.json` (`libraryCatalogVersion: 0.1.0`), an `LLM_START_HERE.md` entrypoint, and a read path `AGENTS.md → repository-map → project-context → standard-lock → docs/README.md`. Whether any principle or rule text changed between 0.2.0 and 0.4.0 is unknown from here. |
| `0.5.0` | Reported by [ADR 0004](../architecture/0004-studio-mac-app.md) and `IMPLEMENTATION_STATUS.md` as "the CLI-pinned version"                                                                                                                            | **Not located.** Bounded searches of `~/Documents/other/studio_ops`, `~/Documents/app_factory`, and `~/Documents/iOS-App-Factory` (empty) found no artifact carrying `0.5.0`. It remains a reported, unverified pin.                                                                                                                                                                                                                                 |

### 2.2 Reconciled against upstream on 2026-08-17

`git fetch origin` in the local clone advanced `origin/main` from `89ce224` to
`4b8b12ea87d78d392485ea8a73440a17ee50bba9` (28 commits, 74 files, all dated
2026-07-17 → 2026-07-19) and added remote branches `agent/actions-foundation`,
`agent/factory-cross-ide-governance`, `agent/reusable-library-architecture`,
and `claude/app-factory-standard-maintenance-xuxxve`. Nothing in the clone's
working tree or local branches was changed; all upstream content was read via
`git show origin/main:<path>` / `git diff 89ce224 origin/main`.

**`origin/main` carries `VERSION` = `0.4.0`.** Its `CHANGELOG.md` records
`0.3.0` (2026-07-17: repository model, modular-library standard, reuse-first
workflow, library registry/catalog) and `0.4.0` (2026-07-17: LLM-first
documentation standard, `LLM_START_HERE.md`, repository-map schema,
`docs/README.md` index, repository-map version locking). Later 2026-07-19
commits on `main` (`7ad94da` cross-IDE governance + Python `factory` CLI;
`af8605e`, `8f2b36f`, `4b8b12e` Studio OS integration, generated UI-testing
standard, Maestro generator) landed **without** a `VERSION`/`CHANGELOG` bump.

**The 0.5.0 question, settled factually.** The repository has no tags at all
(`git tag` is empty). `git log --all -S"0.5.0" -- VERSION` finds exactly one
commit, `5d92a2f` "Bump App Factory standard to 0.5.0" (2026-07-17 16:53
UTC), which lives only on the unmerged branch
`origin/claude/app-factory-standard-maintenance-xuxxve` (tip `5eeceee`,
forked from `origin/main` at `809b5d2`, 6 commits ahead: upgrade script,
standard-lock schema, document metadata, the 0.5.0 bump). It is **not**
contained in `origin/main`. Separately, `origin/main` itself contains
`factory_cli/cli.py` `RULES_VERSION = "0.5.0"`, `factory_cli/__init__.py`
`__version__ = "0.5.0"`, and `pyproject.toml` `version = "0.5.0"` — the
Python `factory` CLI's own package version, which `factory enroll` writes into
`.factory/standard-lock.json` as `rulesVersion: 0.5.0` /
`compatibilityRange: ">=0.5.0 <1.0.0"` while the same commit's `VERSION` file
says `0.4.0`. That is the "CLI-pinned 0.5.0" ADR 0004 reports: an upstream
inconsistency between the CLI package version and the corpus `VERSION`, not a
released corpus version. Conclusion: **0.4.0 is the compiled corpus version;
0.5.0 is recorded in the sidecar as observed (fetched, unmerged branch + CLI
package version), not compiled from.** The other agent branches carry
`VERSION` 0.4.0 (`actions-foundation`, `factory-cross-ide-governance`) and
0.3.0 (`reusable-library-architecture`, 28 commits behind main).

#### Classified diff, `89ce224` → `4b8b12e`, for the compiled source set

| Upstream change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Class                                        | Effect on the compiled policy (`policyVersion` 1 → 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance/STUDIO_PRINCIPLES.md` +4 principles (13 one repository per product; 14 generic testable boundaries + search the catalog; 15 versioned reuse over copy-paste; 16 promote upstream with tests/releases/separate evidence, never contaminate shared code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | (a) text                                     | New principles 28–31.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `standards/engineering/ARCHITECTURE_STANDARD.md`: dependencies now document version + compatibility range; "simplicity must not mean … permanent copy-paste reuse"; new "Product and library boundaries" section; existing-project inventory adds reusable modules and dependencies; layer diagram adds "Shared Library"                                                                                                                                                                                                                                                                                                                                                                                                                                             | (a) text                                     | Principle 4 and `rule.dependencies.justified` gain "version, compatibility range"; principle 30 carries the copy-paste clause; `rule.existing.inventory-before-restructure` and `rule.existing.no-rescaffold-without-decision` extended.                                                                                                                                                                                                                                                                                                    |
| `standards/ai/AI_CODING_AGENT_STANDARD.md`: read `docs/REUSABLE_COMPONENTS.md` and `.factory/library-catalog.json`; existing projects inventory shared modules and identify reusable candidates without unsolicited extraction; new projects search the catalog before networking/persistence/StoreKit/export/logging/accessibility/permissions/notifications/test infrastructure; new "Reuse-first behavior" section (library exists / none exists / generic edge case); "Do not silently push changes to another repository merely because access is available"; completion report adds shared libraries considered + adoption decision, app-local reusable candidates, upstream library/registry changes required                                                 | (a) text                                     | New `rule.reuse.catalog-before-infrastructure` and `rule.reuse.upstream-generic-fixes` (`review` → `review.reuse-first`, planned); `rule.new.scope-before-breadth`, `rule.existing.inventory-before-restructure`, `rule.dod.completion-report`, `rule.scope.declared-paths` extended; principle 31.                                                                                                                                                                                                                                         |
| `governance/DOCUMENTATION_POLICY.md`: central / product / shared-library repository split; authority adds shared-library tests + released API docs and the central registry; `docs/REUSABLE_COMPONENTS.md` per product; product/library/central documentation changes stay separated by repository and scope                                                                                                                                                                                                                                                                                                                                                                                                                                                         | (a) text                                     | Principle 20 (authority list) and principle 28 (repository model); cross-repository clause in `rule.scope.declared-paths`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AGENTS.md` (corpus): repository is a control plane; change rules add "keep mature reusable code in library repositories", "do not register a library before a real repository and release exist", "cross-repository … changes must have separate scope and evidence"; product detection contract adds library-catalog read and reusable-library review; new "Reusable-library contributions" six-step list                                                                                                                                                                                                                                                                                                                                                          | (a) text                                     | Principles 28, 31; `rule.reuse.upstream-generic-fixes`; `rule.new.scope-before-breadth`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `playbooks/REGISTER_EXISTING_PROJECT.md`: inventory step for internal modules/copied helpers/local packages overlapping the catalog; review catalog and record in `docs/REUSABLE_COMPONENTS.md`; "Existing reusable code" (do not replace functioning infrastructure merely because a central package category exists; extract only through a separate approved change)                                                                                                                                                                                                                                                                                                                                                                                              | (a) text                                     | Principle 10; `rule.existing.inventory-before-restructure`; `rule.existing.no-rescaffold-without-decision` now also covers replacement/extraction of functioning infrastructure (still `approval`, human-only).                                                                                                                                                                                                                                                                                                                             |
| New `governance/REPOSITORY_MODEL.md`, `standards/engineering/MODULAR_LIBRARY_STANDARD.md`, `REUSE_FIRST_WORKFLOW.md`, `playbooks/PROMOTE_CODE_TO_SHARED_LIBRARY.md`, `START_NEW_PROJECT.md` reuse section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | (a) text (new source files)                  | Sources for principles 28–31 and the two `rule.reuse.*` rules; added to the sidecar source set with digests.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| New `standards/documentation/LLM_DOCUMENTATION_STANDARD.md`: one canonical owner per durable topic; facts/decisions/assumptions/proposals labeled; metadata must not contain invented verification dates or owners; controlled status vocabulary; change discipline (code → contract → one canonical doc → evidence)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | (a) text                                     | Principle 21 extended; `rule.docs.same-change` extended. The status vocabulary and document-metadata block are not compiled (no decidable check; recorded under lifecycle vocabulary below).                                                                                                                                                                                                                                                                                                                                                |
| New `governance/CROSS_IDE_OPERATING_MODEL.md` (`7ad94da`, 2026-07-19, unversioned): "agent sessions are disposable, repository state is durable"; ADVISORY/PROPOSAL/INSPECTION/EXECUTION routing, "a question is not authorization to modify the repository"; model/effort evidence levels — rules or frontmatter are never proof a model ran; enrollment states unmanaged/enrolling/managed                                                                                                                                                                                                                                                                                                                                                                         | (a) text for one principle; (b) for the rest | Principle 32 (question ≠ authorization; model/effort claims never verified by configuration alone). Enrollment states, `tasks/`, `.factory/current-state.yaml`, run receipts, and the `factory` CLI are a parallel task-state layer this repository does not adopt (the kernel/broker own task state here); recorded, not compiled.                                                                                                                                                                                                         |
| New `governance/STUDIO_OS_INTEGRATION.md`: Studio OS owns portfolio/approvals/external actions; App Factory owns Apple product engineering; "lower layers may be stricter but may not weaken higher-level … requirements"; standard-lock should pin both standards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | (c) for the compiled text                    | Already expressed by the engine's authority layers (`human > studio-os > domain-standard > repo > task > inference`, refinements may only tighten). No compiled principle changed; the compiled source still declares no `layer` per rule (defaults to `repo`) — see §6.                                                                                                                                                                                                                                                                    |
| New `standards/testing/AUTOMATED_UI_TESTING_STANDARD.md` + `templates/quality/ui/{screens,journeys}.yaml` + `scripts/generate-maestro-flows.rb`: manifest-generated Maestro flows, accessibility identifiers `<product>.<screen>.<element>.<role>`, generated exploration must not trigger purchases/destructive/external/permission actions                                                                                                                                                                                                                                                                                                                                                                                                                         | (b) new artifact / executor                  | Not compiled: this repository's `packages/quality` experience matrix is the executor behind `rule.dod.experience-coverage`; whether Maestro manifests become an input to it is a quality-package decision. Recorded in §6.                                                                                                                                                                                                                                                                                                                  |
| 0.4.0 layout: `.factory/repository-map.json` (schema 1.0.0), `.factory/library-catalog.json` (catalog 0.1.0), `docs/README.md`, `docs/REUSABLE_COMPONENTS.md`, `LLM_START_HERE.md`; `standard-lock.json` gains `repositoryMapVersion`/`repositoryMapPath`/`libraryCatalogVersion`/`libraryCatalogPath`; `project-context.json` gains `libraryDiscovery` and `requiredReading`; entry-file read path `AGENTS.md → repository-map → project-context → standard-lock → library-catalog → docs/README.md`; templates add `.antigravity/rules/factory.md`, `.cursor/rules/00-factory-router.mdc`, `AGENTS.cross-ide.md`, `.factory/{project-context,current-state,scope-lock,agent-policy,enrollment-policy}.yaml`, `tasks/`, `conversations/handoffs/`, `.factory/runs/` | (b) layout the compiler does not emit        | Not emitted. This repository enrolls through `.app-factory/` manifests and treats `.factory/project-context.json`/`standard-lock*.json`/`AGENTS.factory.md` as `compatibility.legacy-factory-layout`; `.factory/**` is a protected surface in the compiled lock. Emitting `.factory/repository-map.json` etc. from the compiler would reintroduce the layout the scanner migrates away from, so this is an `.app-factory/`-equivalent design decision (§6), not a compiler change. Digests of the templates and schemas are in the sidecar. |
| `AGENTS.md`/entry templates: "fast reading order", "do not recursively read the entire repository by default", `LLM_START_HERE.md` task routing, `<!-- APP-FACTORY:BEGIN/END -->` managed blocks, `remote-init.sh` curl bootstrap, `registry/libraries.json`, `registry/enrollment-policy.json`, `.github/workflows/*` self-tests, `factory_cli` (`enroll`/`manage`/`task-start`/`checkpoint`/`resume`/`compliance`)                                                                                                                                                                                                                                                                                                                                                 | (c) navigation / tooling                     | No policy effect on the compiled text. The project-local preamble question (§6 item 2) is where a reading order would live.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `governance/DEFINITION_OF_DONE.md`, `PROJECT_LIFECYCLE.md`, `standards/quality/VIBE_CODING_QUALITY_RULEBOOK.md`, `standards/platforms/APPLE_STANDARD.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | unchanged                                    | Byte-identical to 0.2.0 (same digests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Resulting compiled source: **33 principles (was 28), 34 rules (was 32), 9
protected surfaces (unchanged), 27 distinct `requiredCheck` codes (was 26;
`review.reuse-first` added, `planned`), `policyVersion` 2.** All principle
and rule text was re-read from the `origin/main` bytes whose digests the
sidecar records; the check registry stays entirely `planned` — no new check
has an executor, and no existing rule's enforcement was weakened or changed
(only statements were extended). The bundle set is unchanged
(`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/app-factory.mdc`); its
digests change because the source did.

Consequences for the compiled policy:

- The engine's `policyVersion` is an integer (now `2`) unrelated to the
  corpus semver. The corpus version (`0.4.0`), commit (`4b8b12e`), upstream
  ref, and file digests live only in the sidecar (`corpus`), still flagged
  as a TODO for `studio/policy-engine-scoping`.
- Nothing 0.4.0-layout-specific (repository map, library catalog,
  `docs/README.md`, cross-IDE task state) is compiled or emitted; see the
  table row and §6.
- A tree that applied the `policyVersion` 1 bundle now reports `drift`
  against `verify` with the new source until the bundle is re-applied; that
  is the intended detection, not a regression.

### Lifecycle vocabulary drift (recorded, not reconciled)

Four vocabularies still disagree, as ADR 0004 records. Listed here so the
scoping work can bind `appliesTo` to one of them deliberately:

| Vocabulary                                                                                       | Values                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corpus product lifecycle (`PROJECT_LIFECYCLE.md`, 14 stages)                                     | `idea → research → validated → planned → prototype → mvp_development → code_complete → verification_pending → verified → beta → release_candidate → released → maintained → paused_or_retired` |
| Corpus work-item lifecycle (8 states)                                                            | `planned → ready → in_progress → code_complete → verification_pending → verified → human_review_required → done` (+ `blocked`)                                                                 |
| `gates.md` lifecycle (6 stages)                                                                  | `idea → building → qa → launch-prep → live → frozen`                                                                                                                                           |
| `ProjectManifestV1.lifecycleStage` (this repository)                                             | `exploring, planned, building, qa, internal-testflight, released, paused, archived`                                                                                                            |
| `EnrollmentPlanV1.actions[].phase` (this repository, unrelated)                                  | `safety, compatibility, authority, project, quality, automation`                                                                                                                               |
| Corpus 0.4.0 document status vocabulary (`LLM_DOCUMENTATION_STANDARD.md`, added 2026-08-17)      | `planned, in_progress, implemented, partially_implemented, placeholder, mocked, broken, unverified, verification_pending, verified, deprecated, retired` (per-document status, not lifecycle)  |
| Corpus 0.4.0 enrollment states (`CROSS_IDE_OPERATING_MODEL.md`, `factory` CLI, added 2026-08-17) | `unmanaged → enrolling → managed` (governance state of a repository, orthogonal to lifecycle)                                                                                                  |

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
- Upstream 0.4.0 (2026-08-17) still bootstraps under `.factory/` and grew it:
  `repository-map.json`, `library-catalog.json`, and (via the 0.4.0 `factory`
  CLI) `project-context.yaml`, `current-state.yaml`, `scope-lock.yaml`,
  `agent-policy.yaml`, `enrollment-policy.yaml`, `runs/`, plus `tasks/` and
  `conversations/handoffs/` at the root. The scanner ignores the new files
  (they are not classified as legacy contract kinds) but they sit inside the
  protected `.factory/**` surface, so an enrolled tree that a 0.4.0 bootstrap
  touched will trip `policy.protected-surfaces` for review rather than pass
  silently. Note the CLI writes `project-context.yaml` while the bootstrap
  writes `project-context.json` — two coexisting formats on upstream `main`.
- `rule.reuse.catalog-before-infrastructure` names the catalog as "the
  project's registered reusable-library catalog snapshot
  (`.factory/library-catalog.json` in the corpus layout)" because this
  repository has no `.app-factory/` equivalent yet (§6).

### Adapter-set drift

The corpus lists five tool entry files plus `.factory/AGENTS.factory.md`. On
2026-08-16 the engine's `PolicyClient` was `codex | claude | cursor |
antigravity`, so the compiler owns `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and
`.cursor/rules/app-factory.mdc` only. `.github/copilot-instructions.md` and
`AGENTS.factory.md` are outside the bundle. The Hindsight proof in §5 shows
exactly what that costs.

2026-08-17: `PolicyClientV1` now includes `copilot` and
`CanonicalPolicySourceV1.clients` is optional (default `claude, cursor,
antigravity`); the compiled source still declares no `clients`, so the bundle
set is unchanged. Upstream 0.4.0 added two more adapters the engine has no
client for: `.antigravity/rules/factory.md` (a _second_ antigravity file
beside the engine's `GEMINI.md`) and `.cursor/rules/00-factory-router.mdc`
(beside `app-factory.mdc`), plus `AGENTS.cross-ide.md`. Whether to declare
`clients` (adding `copilot`) is §6 item 1; the extra 0.4.0 router files are
outside any current client mapping.

## 3. Mapping decisions

### 3.1 Principles (33)

The 12 original studio principles were kept nearly verbatim (indexes 0–11) and
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
- Index 28–31 (2026-08-17, corpus 0.4.0): studio principles 13–16 —
  repository model, generic testable boundaries + catalog search, versioned
  reuse over copy-paste, upstream promotion / never contaminate shared code /
  never push to another repository merely because access exists
  (`STUDIO_PRINCIPLES.md#13`–`#16`, `REPOSITORY_MODEL.md`,
  `MODULAR_LIBRARY_STANDARD.md`, `REUSE_FIRST_WORKFLOW.md`,
  `PROMOTE_CODE_TO_SHARED_LIBRARY.md`).
- Index 32 (2026-08-17): sessions disposable / repository durable, a question
  is not authorization, model-or-effort claims never verified by
  configuration alone (`CROSS_IDE_OPERATING_MODEL.md`).
- Text of indexes 4, 10, 20, 21 was extended for 0.4.0 (dependency version +
  compatibility range; shared-module inventory and no extraction without a
  decision; shared-library and registry authority; one canonical owner,
  labeled facts/decisions/assumptions/proposals, no invented metadata).

### 3.2 Rules (34) and enforcement

| Source statement                                                                                                                                                                                                                               | Rule id                                                                                                                            | Enforcement → `requiredCheck`                             | Why                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DoD "Required automated suites pass"; Apple verification on macOS                                                                                                                                                                              | `rule.dod.verification`                                                                                                            | `trusted-check` → `xcodebuild.test`                       | Machine-decidable; the trusted verifier is the only actor allowed to assert a pass.                                                                                                                                                                                  |
| DoD state/interface + Rulebook screen states, layout, edge-case set                                                                                                                                                                            | `rule.dod.experience-coverage`                                                                                                     | `trusted-check` → `quality.experience-matrix`             | Maps onto `packages/quality` matrix findings (required-case-missing, clipped-critical-content, missing-accessibility-semantics); a check id binding them is still to be registered.                                                                                  |
| DoD "at least one non-happy path"; AGENTS.md "tests for every behavior change"                                                                                                                                                                 | `rule.dod.non-happy-path-tested`                                                                                                   | `review` → `review.test-coverage`                         | Relevance of a non-happy path is a judgment; `review.missing-test` finding code already exists.                                                                                                                                                                      |
| AI standard completion reporting; DoD verification disclosures                                                                                                                                                                                 | `rule.dod.completion-report`                                                                                                       | `review` → `review.completion-report`                     | Honesty of a report is reviewed, its evidence is brokered (next row).                                                                                                                                                                                                |
| `code_complete ≠ done`; work-item lifecycle; AGENTS.md definition of done                                                                                                                                                                      | `rule.completion.evidence-manifest`                                                                                                | `broker` → `broker.evidence-manifest`                     | Task mapping. The broker owns state transitions; prose never advances state.                                                                                                                                                                                         |
| `gates.md` states, SHA binding, stage-advance rules, auto-demotion                                                                                                                                                                             | `rule.gates.sha-bound`                                                                                                             | `broker` → `broker.gate-sha-binding`                      | Mechanical rule over recorded state.                                                                                                                                                                                                                                 |
| AGENTS.md scope/worktree; 0.4.0 cross-repository separation, "do not silently push to another repository merely because access is available"                                                                                                   | `rule.scope.declared-paths`                                                                                                        | `broker` → `policy.changed-paths`                         | Existing name in the engine tests. The cross-repository clause was folded in (2026-08-17) rather than given its own check: another repository is by definition outside the declared scope; a dedicated cross-repository effect check remains a broker question (§6). |
| AGENTS.md protected surfaces; "do not silently weaken acceptance criteria"                                                                                                                                                                     | `rule.scope.protected-surfaces`                                                                                                    | `broker` → `policy.protected-surfaces`                    | Enforced against `PolicyLockV1.protectedSurfaces`.                                                                                                                                                                                                                   |
| AGENTS.md credentials; Rulebook "never ship secrets"                                                                                                                                                                                           | `rule.security.no-credentials-in-artifacts`                                                                                        | `broker` → `broker.secret-scan`                           | Scanner heuristics already exist in `project-sdk`.                                                                                                                                                                                                                   |
| Docs are truth; Jira/Notion mirrors                                                                                                                                                                                                            | `rule.docs.repo-is-truth`                                                                                                          | `broker` → `broker.mirror-effects`                        | Task mapping: principle (index 21) **plus** a broker rule; tracker writes are outbound effects only.                                                                                                                                                                 |
| Documentation Policy maintenance; AI standard "update docs and contracts"                                                                                                                                                                      | `rule.docs.same-change`                                                                                                            | `review` → `review.docs-same-change`                      | Task mapping.                                                                                                                                                                                                                                                        |
| Fake-data / fake-feature prohibition                                                                                                                                                                                                           | `rule.data.no-fake-fallback`, `rule.ui.no-decorative-controls`                                                                     | `review` → `review.fake-feature`                          | Task mapping.                                                                                                                                                                                                                                                        |
| Success-after-confirmation, explicit states, no duplicates/stale, error ownership                                                                                                                                                              | `rule.ui.success-after-confirmation`, `rule.ui.explicit-states`, `rule.async.no-duplicates-no-stale`, `rule.errors.owned-and-safe` | `review` → `review.state-modeling`                        | Grouped under one review rubric to keep the check surface small.                                                                                                                                                                                                     |
| Persistence verified; recoverable work preserved                                                                                                                                                                                               | `rule.data.persistence-verified`, `rule.data.recoverable-work-preserved`                                                           | `review` → `review.data-integrity`                        |                                                                                                                                                                                                                                                                      |
| Permissions and privacy                                                                                                                                                                                                                        | `rule.privacy.minimal-collection`                                                                                                  | `review` → `review.privacy-and-logging`                   |                                                                                                                                                                                                                                                                      |
| AI features                                                                                                                                                                                                                                    | `rule.ai.validated-output`                                                                                                         | `review` → `review.ai-output-handling`                    |                                                                                                                                                                                                                                                                      |
| Existing-project inventory; new-project scope-before-breadth                                                                                                                                                                                   | `rule.existing.inventory-before-restructure`, `rule.new.scope-before-breadth`                                                      | `review` → `review.project-baseline`                      |                                                                                                                                                                                                                                                                      |
| "Do not replace working code with a new scaffold without an approved decision"; 0.4.0 "extract only through a separate approved change", "do not replace functioning internal infrastructure merely because a central package category exists" | `rule.existing.no-rescaffold-without-decision`                                                                                     | `approval` → `approval.architecture-decision`             | The corpus itself requires an approved decision record; package extraction now rides the same approval.                                                                                                                                                              |
| Dependencies documented                                                                                                                                                                                                                        | `rule.dependencies.justified`                                                                                                      | `review` → `review.dependency-justification`              | 0.4.0 adds version and compatibility range.                                                                                                                                                                                                                          |
| Reuse-first: classify, consult catalog + `REUSABLE_COMPONENTS.md`, released library via thin adapter or narrow library-ready local module (0.4.0)                                                                                              | `rule.reuse.catalog-before-infrastructure`                                                                                         | `review` → `review.reuse-first`                           | Task mapping (2026-08-17). Whether a capability is generic and whether an adapter suffices is a judgment; no executor exists, so the check is `planned`.                                                                                                             |
| Generic edge case → regression test, separate upstream change, release, registry, product upgrade; no permanent fork; completion waits for the consumed release (0.4.0)                                                                        | `rule.reuse.upstream-generic-fixes`                                                                                                | `review` → `review.reuse-first`                           | Same rubric; the completion clause is reviewed, its evidence is brokered by `rule.completion.evidence-manifest`.                                                                                                                                                     |
| Accessibility                                                                                                                                                                                                                                  | `rule.accessibility.primary-workflow`                                                                                              | `review` → `review.accessibility`                         |                                                                                                                                                                                                                                                                      |
| Release hygiene; production configuration                                                                                                                                                                                                      | `rule.release.hygiene`                                                                                                             | `review` → `review.release-hygiene`                       |                                                                                                                                                                                                                                                                      |
| `gate:legal` cleared / `gate:device` physical_pass / `gate:store` ready                                                                                                                                                                        | `rule.gate.legal`, `rule.gate.device`, `rule.gate.store`                                                                           | `approval` → `approval.gate-legal` / `-device` / `-store` | Task mapping: human-only.                                                                                                                                                                                                                                            |
| `gate:market` evidence                                                                                                                                                                                                                         | `rule.gate.market`                                                                                                                 | `approval` → `approval.gate-market`                       | Task mapping: never automated; statement says so.                                                                                                                                                                                                                    |
| "anything requiring credentials — Priyansh-only"                                                                                                                                                                                               | `rule.release.credentialed-actions`                                                                                                | `approval` → `approval.credentialed-action`               |                                                                                                                                                                                                                                                                      |

Kept as principles only (no rule): untrusted-input handling (index 22),
local-first / platform-native preferences (indexes 3–4), the repository model
(index 28), and question-is-not-authorization / model-evidence (index 32),
because there is no decidable check to bind them to yet.

Not compiled (out of the source set or not policy): the corpus's bootstrap
scripts and schemas, product/design/business/legal index READMEs, the
14-stage product lifecycle, and (0.4.0) the `factory` CLI task-state layer,
`LLM_START_HERE.md` routing, the repository-map / library-catalog / docs index
artifacts, the document status vocabulary and metadata block, and the
Maestro-generated UI-testing standard (§2.2 table for why).

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

The 27 distinct `requiredCheck` codes (26 on 2026-08-16; `review.reuse-first`
added 2026-08-17) are all `status: planned` in the sidecar
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
6. ~~**0.4.0 text drift and the 0.5.0 pin** — fetch upstream and diff before
   bumping `policyVersion`.~~ **Resolved 2026-08-17** on
   `studio/rules-corpus-0.4`: upstream fetched (`origin/main` =
   `4b8b12ea87d78d392485ea8a73440a17ee50bba9`, `VERSION` 0.4.0), the diff
   classified in §2.2, the compiled source re-derived from the fetched bytes
   (33 principles, 34 rules, `policyVersion` 2, digests in the sidecar), and
   the 0.5.0 pin identified as the Python `factory` CLI package version on
   `main` plus an unmerged 0.5.0 branch (`5eeceee`) — recorded in the sidecar
   `otherObservedVersions`, not compiled. Follow-ups this opened (not done
   here; each is a design decision outside a corpus reconciliation):
   - **0.4.0 navigation/catalog artifacts.** Upstream requires
     `.factory/repository-map.json`, `.factory/library-catalog.json`,
     `docs/README.md`, `docs/REUSABLE_COMPONENTS.md` and locks
     `repositoryMapVersion` / `libraryCatalogVersion` in the standard lock.
     This repository's layout is `.app-factory/`; decide whether an
     `.app-factory/` repository map and library-catalog snapshot exist and
     who owns `docs/README.md`, then let the compiler emit them (with tests).
     Emitting `.factory/*` from the compiler is rejected: it would reintroduce
     the layout the scanner migrates away from and sits inside the protected
     `.factory/**` surface.
   - **`review.reuse-first` executor.** The two `rule.reuse.*` rules are
     `planned` until `packages/independent-review` has a rubric item for
     catalog-consulted / adapter-vs-copy / app-local boundary / upstream
     separation.
   - **Cross-repository effects.** `rule.scope.declared-paths` now states the
     rule; whether the broker needs a distinct check for pushes to _other_
     repositories (as opposed to changed paths outside scope) is a
     policy-engine question, described here rather than changed.
   - **Authority layers.** `STUDIO_OS_INTEGRATION.md` names the
     Studio OS > App Factory > product ordering that
     `POLICY_AUTHORITY_LAYERS_V1` already encodes; the compiled source still
     declares no per-rule `layer` (defaults to `repo`). Declaring
     `domain-standard` for corpus-derived rules and `studio-os` for the
     `gates.md`-derived human gates is a scoping change for
     `studio/policy-engine-scoping`, not this reconciliation.
   - **Maestro manifests.** `AUTOMATED_UI_TESTING_STANDARD.md` +
     `quality/ui/{screens,journeys}.yaml` are candidate inputs to
     `packages/quality`'s experience matrix (`rule.dod.experience-coverage`);
     the generated-exploration safety rule (no purchases/destructive/external/
     permission actions) belongs there if adopted.
   - **Upstream inconsistencies worth reporting upstream.** `factory_cli`
     pins 0.5.0 while `VERSION` is 0.4.0; the CLI writes
     `.factory/project-context.yaml` beside the bootstrap's
     `project-context.json`; the unmerged 0.5.0 branch fixes the
     `quality-manifest.json` template's stale `qualityStandardVersion: 0.2.0`.
7. ~~**`project-sdk` `repair-rule-adapter` on an already-bound adapter** appends
   rather than replaces `authority.digest` and would create the conflict
   observed in stage B.~~ **Resolved 2026-08-16** by
   `claude/eloquent-chebyshev-cb2b57` (merged into `integration/studio-wave1`):
   `bindAdapterContent` now rewrites `authority.import`/`authority.digest` in
   place, and the convergence check fails closed on any `rules.*` blocker the
   baseline scan lacked. Verified on a scratch `factory/pilot-1.1` clone:
   `applyEnrollmentPlan` repaired the copilot adapter (one line), the rescan
   reported zero `rules.*` issues, and all three rule blockers cleared — the
   manual stage C above is now automatic.

## 7. Not modified

The real Hindsight checkout, `mission-control`, and every other worktree were
read only. No push. 2026-08-16: no upstream fetch. 2026-08-17: `git fetch
origin` in the local rules-corpus clone updated remote-tracking refs only; its
working tree and local `main` remain at `89ce224` (`VERSION` 0.2.0) and were
not checked out, merged, pulled, or reset. `mission-control` `gates.md` was
re-digested and is unchanged (`bbbdf9d`, `sha256:51a8…e7a8`).
