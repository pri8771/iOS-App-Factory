# Planner execution — running an owner-approved plan from scratch

The from-scratch build path is: `project.seed` (a brand-new XcodeGen app, registered) →
`plan.propose` from a Phase Preset → `plan.approve` (the human anchor) → `plan.execute` →
each task item runs through the verified executor (agent → trusted verification → independent
review → broker commit) → `plan.tick` advances the project's mirror base to that broker commit
and submits the next item → … → human gates (`plan.approve-gate`) → complete. In Studio that is
"New project" → the Planner's punch list; on the CLI it is the verbs below.

Until 2026-08-18 nothing after `plan.execute` could actually run: the verified executor's set of
runnable projects was static (one repository, one pinned base, one pinned task, all from
`APP_FACTORY_LOCAL_EXECUTION_CONFIG`), so a seeded project blocked with `project.not-enrolled`,
the second item of any plan blocked with `project.base-not-enrolled`, and plan-submitted tasks
carried an all-zeros `policyDigest`. **Planner execution** closes that:
[`apps/daemon/src/planner-project-execution.ts`](../../apps/daemon/src/planner-project-execution.ts).

## What it is (trust anchors)

| Pinned by the enrolled profile (`enrolled-codex-v1`)     | Planner execution (`planner-*-v1`)                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| one `repositoryId` + source path from config             | any **Project Registry** entry (`project.register` / `project.seed`), whose Factory mirror the registry sealed                                                                                                                                                                                                                                                                                         |
| one `allowedBaseCommit` pinned at daemon start           | the mirror's **current binding tip** (`readImmutableMirrorBindingTip`: sealed root, or the last validated `advanceImmutableMirrorBase` link) — so `plan.tick`'s advance is honoured with no restart; the sealed root (`enrollmentBase`) still opens the mirror                                                                                                                                         |
| one reviewed task, pinned by `taskSemanticProfileDigest` | **`authorizeTask`**: the task must be a submitted task item of a plan for that repository in state `approved`/`executing`/`complete` — i.e. something the owner approved (`plan.approve`); anything else blocks with `plan.task-not-in-approved-plan`                                                                                                                                                  |
| a hand-written `policy.txt` per task                     | **one deterministic reviewed policy** rendered from the compiled iOS App Factory standard's rule statements plus the Factory invariants (never self-verify, edit only authorized paths, no network, no Git/CI edits); its digest is what `plan.execute` now stamps on every task (`planPolicyDigest`), so the executor's `policy.digest-mismatch` check binds plan tasks to exactly that text          |
| per-project verification plans in config                 | **`ios-xcodegen-v1`**: `xcodegen generate` (the seeded scaffold gitignores the `.xcodeproj`) then `xcodebuild build` (generic iOS Simulator, no signing) and `xcodebuild test` on the operator-stated simulator, on the scheme named by the project's own `project.yml`; executables, PATH, USER, tool versions and timeouts stated in the config — the Hindsight enrolled config's shape, generalized |
| the Codex agent                                          | `planner-codex-v1`: the same real Codex CLI through `buildCodexAgentForProject` (owner containment attestation required); or `planner-fixture-v1`: a scripted, network-free agent that writes one small artifact per task under its first authorized directory — for rehearsing the chain with the real toolchain and no model                                                                         |

Everything else is unchanged: the daemon owns scheduling and evidence, the agent never grades its
own work, missing evidence fails the attempt, `run export` still refuses anything not verified.

## Configuration

`APP_FACTORY_PLANNER_EXECUTION_CONFIG` = absolute path to a private (0600) JSON file:

```json
{
  "schemaVersion": 1,
  "mode": "planner-codex-v1",
  "codexHome": "/Users/<you>/.app-factory-planner/codex-home",
  "executable": "/Users/<you>/.app-factory/verified-bin/codex-0.148.0-alpha.9",
  "executableDigest": "sha256:<digest of that binary>",
  "expectedCliVersion": "0.148.0-alpha.9",
  "model": "gpt-5.6-sol",
  "reviewer": { "reviewerId": "planner.generic-review", "reviewerVersion": "v1" },
  "verification": {
    "profile": "ios-xcodegen-v1",
    "xcodegenExecutable": "/opt/homebrew/bin/xcodegen",
    "xcodebuildExecutable": "/usr/bin/xcodebuild",
    "simulatorDestination": "platform=iOS Simulator,name=iPhone 17 Pro,OS=latest",
    "toolVersions": [
      { "name": "xcodebuild", "version": "26.6" },
      { "name": "xcodegen", "version": "2.45.4" }
    ]
  }
}
```

- `mode: "planner-fixture-v1"` drops the five Codex fields (the rehearsal below used it).
- Optional: `agentLimits`, `siblingExecutables` (Codex mode; same meaning as `enrolled-codex-v1`),
  `candidatePolicyLimits`, `verification.path` (default `/usr/bin:/bin:/opt/homebrew/bin`),
  `verification.user` (default: the daemon's own `USER`), `verification.buildTimeoutMs` (600 000),
  `verification.testTimeoutMs` (900 000).
- `planner-codex-v1` refuses to load without `APP_FACTORY_CONTAINMENT_ATTESTATION` (a valid
  owner attestation, e.g. the one recorded 2026-08-14), exactly like `enrolled-codex-v1`. The
  Codex home, the Factory runtime, the executable and the seeded project's directory must be
  separate, non-nested paths.
- The `.p8`, tokens, or any secret have no slot in this file; a `privateKey` key is refused.
- It composes WITH or WITHOUT `APP_FACTORY_LOCAL_EXECUTION_CONFIG`: a pinned project stays
  pinned; every other registered project resolves through planner execution.

## Runbook — the from-scratch test run

Pre-flight (all read-only):

```sh
xcodegen --version                       # 2.45.4 here
xcodebuild -version                      # Xcode 26.6 here
xcrun simctl list devices available | grep "iPhone 17 Pro"
ls -l ~/.app-factory/verified-bin/       # the pinned Codex binary (Codex mode only)
```

Start the daemon (a fresh private runtime directory; `RUNTIME`, `ETC` are yours to choose):

```sh
cd <repo> && pnpm build
APP_FACTORY_RUNTIME_DIR=$RUNTIME \
APP_FACTORY_AUTH_FILE=$ETC/auth-token \
APP_FACTORY_DAEMON_VERSION=0.1.0-planner \
APP_FACTORY_PLANNER_EXECUTION_CONFIG=$ETC/planner-execution.json \
APP_FACTORY_CONTAINMENT_ATTESTATION=$ETC/containment-attestation.json \   # Codex mode
APP_FACTORY_ROOMS_ENABLED=true APP_FACTORY_ROOMS_PARTICIPANTS_CONFIG=$ETC/participants.json \  # optional
APP_FACTORY_ASC_OBSERVER_CONFIG=$ETC/asc-observer.json \                  # optional (release rail)
node apps/daemon/dist/main.js
```

Then either open Studio (`apps/studio-mac/README.md`, "Run the shell") and use **New project**
→ Planner, or on the CLI:

```sh
export APP_FACTORY_SOCKET=$RUNTIME/daemon.sock APP_FACTORY_AUTH_TOKEN="$(cat $ETC/auth-token)"
factory doctor
factory project seed /path/to/new-app --name "My App"      # → registered:true, projectId, repositoryId
factory plan propose --preset ios-app-standard-0.4.0 --title "My App" --one-liner "…" \
  --project <projectId> --repository <repositoryId>        # → planId, revision 0, 13 items
factory plan approve <planId> --expected-revision 0        # the human anchor
factory plan execute <planId> --expected-revision <rev>    # submits the first task item
factory status <attemptId>                                 # poll the running item
factory plan tick <planId>                                 # settle → advance base → submit next
factory plan approve-gate <planId> ready --expected-revision <rev>   # the ◆ gates, when reached
factory run export <attemptId>                             # the citable record of any succeeded item
```

Rules of the road: a **failed** item halts the chain (`plan.tick` reports `advanced:false`; there
is no auto-retry) — read `factory status <attemptId>` / `factory evidence inspect <attemptId>`,
fix the cause, propose a fresh plan. A **blocked** item names its blocker (`project.not-enrolled`,
`plan.task-not-in-approved-plan`, `policy.digest-mismatch`, `project.base-not-enrolled`, …).
`plan.tick` is idempotent and safe to call whenever nothing is running.

## Rehearsal — 2026-08-18 (fixture agent, REAL xcodegen + xcodebuild)

Branch `p4/planner-execution` (this document's commit), daemon `0.1.0-planner-rehearsal` on a
throwaway runtime `/private/tmp/af-reh/runtime`, `planner-fixture-v1`, `ios-xcodegen-v1` against
`/opt/homebrew/bin/xcodegen` 2.45.4 + `/usr/bin/xcodebuild` (Xcode 26.6), simulator
`iPhone 17 Pro,OS=latest`. Driven entirely through the CLI, exactly as above. **No real app was
touched**; the seeded project was `Rehearsal App` under `/private/tmp/af-reh/src/rehearsal-app`.

- `project seed` — 5.3 s: `registered: true` (`projectId = repositoryId =
91abf9b9-ae78-4dba-bf97-93bc0dd8f254`, slug `rehearsal-app`), `xcodegen generate` and
  `xcodebuild build` both succeeded inside the seed itself; scaffold commit `2ba474bf`, enrollment
  commit `cff8de92` (branch `app-factory/enroll-9d43e2a2de51`).
- Plan 1 (`bb988d23-…`) and plan 2 (`3409d3b8-…`): first item failed within ~1 s with the generic
  `local-execution.verification-failed`. Both were defects in this branch's first cut of the
  `ios-xcodegen-v1` templates, found by probing the exact plan through `runTrustedVerification`:
  (1) the scratch token appeared twice in one shell argument (`materializeVerificationArgs`
  allows it once — now bound to `$S` first, and `assertVerificationArgsTemplate` runs at
  composition time); (2) XcodeGen (Foundation) exits 1 with "Couldn't find current username" in
  the trusted verifier's minimal environment — `USER` is now an allowed verification environment
  name and the plans state it explicitly. Both plans stay in the runtime as the record; the chain
  halted exactly as designed (`plan.tick` → `advanced:false` after marking the item failed).
- Plan 3 (`fdfe7039-1ef5-5d3a-8289-9d288ccc79e1`): see the driver log summary below.

<!-- REHEARSAL_RESULT -->

Debuggability note recorded, not fixed here: the executor maps every unclassified error to
`local-execution.verification-failed` / "failed closed before completion" and drops the underlying
message (`verified-local-executor.ts`, the `#verifyAndCommit` catch). Surfacing that message as a
private evidence artifact (never on the wire) would have saved two rehearsal rounds.

## What this does and does not prove

Proven (in-process tests, every push): seed → propose → approve → execute → item 1 verified,
reviewed, broker-committed → tick advances the mirror base (the advance link names the first
attempt) → item 2 runs on the advanced base (its broker commit's parent is that base) → a task
outside any approved plan is refused with `plan.task-not-in-approved-plan`; a resolver-provided
project is validated by the same normalizer as a pinned one; unknown repositories stay
`project.not-enrolled`.

Not proven here: any real-model run (`planner-codex-v1` has only been type-checked and
config-parsed; its agent factory is the same `buildCodexAgentForProject` the Hindsight pilots
used); the Studio app driving this end to end (the Planner UI calls the same ops; store tests only);
a plan run through all its human gates to `complete`; the seed-repo item's semantics (the
scaffold already exists when the item runs — the fixture agent adds a test file; a real agent must
notice and make a minimal, honest change).
