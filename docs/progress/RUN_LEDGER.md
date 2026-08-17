# Run ledger

Updated: 2026-08-17 (run-export pass)

Every real-model Factory run, with the evidence needed to verify it independently.

## Why this file exists

A Factory run leaves its evidence in two places, **both outside this repository**: a
private runtime directory (kernel database, agent journals, supervised-run receipts,
evidence blobs) and a Factory-owned bare mirror holding the broker commit at
`refs/app-factory/attempts/<attemptId>`. Neither is version-controlled, by design —
the mirror is sealed and the runtime is disposable.

The consequence is that a reader of this repository alone cannot confirm any run
happened. A documentation pass on 2026-08-15 correctly refused to record the runs
below for exactly that reason. This ledger closes the gap the only honest way
available today: by recording each claim next to the exact command that checks it.

To verify any row:

```
git -C <mirror path> for-each-ref refs/app-factory/attempts/<attemptId>
git -C <mirror path> show <brokerCommit> --stat
```

The mirror path is `<runtime>/local-execution/git/mirrors/<repositoryId>.git`.

`factory run export <attemptId>` (added 2026-08-16) emits the canonical, digest-bound
run record for a succeeded attempt, re-derived from the runtime's evidence store and
the sealed mirror; `--json` includes `recordDigest`. Every succeeded run below now has
its exported record committed under [`runs/`](runs/) (`<attemptId>.json`: the record
plus its `recordDigest`), produced on 2026-08-17 by running the daemon against each
original runtime directory — the mirror's ownership marker is path-bound, so a copied
runtime is refused by design — and the digests are repeated in the rows. To re-check a
row: start the daemon on the named runtime, run
`factory run export <attemptId> --json`, and diff `.result.record` against the file
in `runs/`. The record is not yet signed. Do not add a row you have not verified.

Rows exist only for attempts the export verb will emit — terminal, succeeded, evidence
verified, closure re-verified against the mirror. Failed and blocked attempts are
narrated where they taught something, with the exact durable-state query that shows
them; `run export` refuses them (`run.export-not-verified`), which is correct.

Rooms rounds and phase-runner runs have no mirror or broker commit, so this ledger's
verification recipe does not apply to them. Where their private runtime still exists
the entry says which file was queried and what it holds; where it does not, the entry
stays owner-reported and says so.

## Runs

### 2026-08-14 — first real-model run (fixture)

| Field         | Value                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attempt       | `2b4d6cde-d020-5f9e-baa4-8636f66edbf8`                                                                                                                                                                                                                                                                                                                                                        |
| Profile       | `swift-greeter-codex-v1` (pinned fixture)                                                                                                                                                                                                                                                                                                                                                     |
| Runtime       | `~/.app-factory-a3-r2`                                                                                                                                                                                                                                                                                                                                                                        |
| Broker commit | `3add1e34e0a02b7b1ecb33aeb43b9ffd84fdee34`                                                                                                                                                                                                                                                                                                                                                    |
| Agent         | Codex CLI `0.148.0-alpha.9`, factory-owned snapshot binary                                                                                                                                                                                                                                                                                                                                    |
| Duration      | 55 s end to end                                                                                                                                                                                                                                                                                                                                                                               |
| Verification  | `swift test`, plus two grep acceptance checks — all passed                                                                                                                                                                                                                                                                                                                                    |
| Review        | pass                                                                                                                                                                                                                                                                                                                                                                                          |
| Evidence      | manifest verified: 7 records, 30 artifacts                                                                                                                                                                                                                                                                                                                                                    |
| Tokens        | 71,953 input (53,248 cached) / 923 output                                                                                                                                                                                                                                                                                                                                                     |
| Export record | [`runs/2b4d6cde-….json`](runs/2b4d6cde-d020-5f9e-baa4-8636f66edbf8.json) — `recordDigest` `sha256:1cf9f112b6d24db86f668e747fd159899878fe35366c3b2bc36340772fab70aa`; base `d0cbc6183f3657090ab5840035fc9e79bcd2927e`, mirror `62000000-0000-4000-8000-000000000002.git`, plans `tests.swift` · `acceptance.signature` · `acceptance.behavior`, reviewer `fixture.swift-greeter-reviewer` pass |

The first time the Factory drove a real model through prepare → contained agent run →
trusted verification → independent review → broker commit → evidence manifest.

Exporting this row on 2026-08-17 found a defect: commit `55c2115` (2026-08-14, migration 0006) changed the migration-ledger checksum formula, so every runtime recorded before it
— this one included — was refused by every later daemon with "Migration 1 does not
match its recorded name/checksum", making its evidence unexportable. The kernel now
recognises (never writes) the pre-0006 formula, and only where the flag it could not
encode is unset (`packages/kernel/src/migrations.ts`, with a rebuilt-ledger regression
test). Recording the failure mode here because "the evidence is on disk" and "the
evidence is reachable" turned out to be different claims.

Four fail-closed stops preceded it on the same day, each caught by the Factory's own
gates rather than by a human noticing: an unrunnable pinned CLI version, an output
schema the provider rejected, a mid-day Sparkle update that replaced the pinned
binary, and a model-capacity error. None produced a false success.

### 2026-08-15 — first real-application pilot (Hindsight)

Enrolled project `hindsight`, pilot branch `factory/pilot-1.1`, base commit
`10cc1b13b568e6cce8fdea8907d56d3a80402c71`. Runtime `~/.app-factory-hindsight`, mirror
`runtime/local-execution/git/mirrors/c9ddcfcc-609b-4f91-a5d7-46bc58eba90b.git`. Every
attempt ran `xcodebuild build` (`build.hindsight`) and
`xcodebuild test -only-testing:HindsightTests` (`test.hindsight-unit`, 121 unit tests)
plus change-specific `grep` acceptance checks; the fourth also ran the UI-test target.
Every plan passed on every succeeded attempt; independent review
(`hindsight.generic-review` v1) returned `pass` with zero findings each time.

| Attempt                                | Change                                                                                                           | Broker commit                              | Duration | Tokens (in / cached / out) | Export `recordDigest`                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `1930791b-75be-533c-9471-f814e4000516` | `DecisionDetailView` — refresh after due-prediction resolution                                                   | `1b65f20628ea6360b24bc2e9543bae0b1a06f447` | 86 s     | 74,204 / 56,320 / 755      | [`sha256:799214d222ab186a4f39add6e0a93a1ae72d31cab1d2de4d4592a324cbff5445`](runs/1930791b-75be-533c-9471-f814e4000516.json) |
| `a603f41d-2e25-52f3-8e93-4c2586cfd789` | `HindsightArchiveView` — snapshot live queries once per body evaluation                                          | `55ddc8f51f4f3edfe9576a007d97f00b89c70c20` | 93.5 s   | 84,057 / 62,464 / 1,144    | [`sha256:7fc38a988b99ae306f4b8538517b2064f9d85e77a8f727722cb533838588bdfe`](runs/a603f41d-2e25-52f3-8e93-4c2586cfd789.json) |
| `8b0a9333-2240-5c7c-ad6e-77743afa67f3` | `SplashView` — replace raw hex with semantic tokens                                                              | `5d732c250287a2b7afd652de89851fc63f691542` | 101.7 s  | 91,263 / 67,584 / 1,576    | [`sha256:425e948d6626249a6a4c8dd2767087237290387d254560be6cf250b155c64a39`](runs/8b0a9333-2240-5c7c-ad6e-77743afa67f3.json) |
| `40139cdb-48d6-50fc-a14e-773fd17e89c6` | `HindsightUITests/InsightsHistoryUITests.swift` — UI-test coverage for `InsightsView` and `HindsightArchiveView` | `cfa45c33c8a9fb3f532527d95415b8bda4680926` | 335 s    | 176,561 / 115,456 / 3,167  | [`sha256:1e4cd1a959baad5c2fe69899c6cf5078b6e7134d00e948f87a0454a40714bc8f`](runs/40139cdb-48d6-50fc-a14e-773fd17e89c6.json) |

The fourth row (2026-08-15 03:48–03:53Z) is the one this file previously did not
have. It is also the run that put UI-test verification into a passing plan for the
first time: its record lists eleven verification claims — `build.hindsight`,
`test.hindsight-unit`, eight `grep.insightshistory-*` acceptance checks, and
`test.hindsight-ui` (`xcodebuild test -only-testing:HindsightUITests`), all
`passed: true` — plus a 15-record / 54-artifact evidence manifest. It was preceded
minutes earlier by attempt `c0f5faf8-c8e2-5dba-9eb7-f0cbe04251c1` on the same task,
which failed at the protocol boundary (`agent.protocol-error`: "blocker.code must be a
namespaced code") — the agent emitted a blocker with a bare code, the daemon refused
it rather than guessing a namespace, and the retry succeeded.

Each broker commit touches only the files its task authorized. None has been merged
or pushed; they exist solely at their attempt refs in the Factory-owned mirror.

Build and test time is ~53 s of fixed Xcode and simulator overhead on every attempt,
independent of diff size — agent time was 30–46 s on the three unit-tested changes and
80 s on the UI-test change, whose verification (UI target included) took ~4.2 min.

The complete attempt list in this runtime, straight from the kernel
(`sqlite3 ~/.app-factory-hindsight/runtime/control-plane.sqlite "select attempt_id,
state, created_at from attempts order by created_at"`), is nine rows: the two
`blocked` sandbox attempts described below (`51a2dd3e…`, `97c4d337…`, 2026-08-15
00:53Z/00:57Z), the four `succeeded` rows above, `c0f5faf8…` (`failed`,
protocol error), and the two `failed` issue-#1 attempts of 2026-08-16 (next
section). Nothing else ran here.

#### The failure that taught the most

The first two attempts at the `DecisionDetailView` change produced the correct diff
and then honestly reported `blocked`. The reviewed policy told the agent to verify its
own work; the agent sandbox denies `dlopen` of `CoreSimulator.framework`, so
`xcodebuild` deterministically failed and the agent refused to claim success it could
not demonstrate.

The correct remedy was to change the policy, not the sandbox. The coding agent is
never the verification authority — the trusted plane is, and it had not yet been given
a turn. The policy now forbids the agent from running build, test, or simulator
commands at all. Weakening the sandbox to admit an untrusted process to simulator
internals would have traded the containment guarantee for a diagnostic convenience.

Two defects in the operator surface were found the same way and fixed: `factory
blocker` reused one request identity across three daemon calls and tripped the replay
guard, and `agentLimits.maxTurns` was hardcoded to 1, making multi-turn runs
unreachable through configuration.

### 2026-08-16 — Hindsight pilot issue #1 (SwiftData store lifetime): two failed attempts, no row

Same runtime, same base commit. Task "Fix SwiftData store-lifetime diagnostics in
SampleData" (`Hindsight/Managers/SampleData.swift` `insert(into:)` /
`persistDeletion(of:from:)` saving through a second `ModelContext`), reviewed policy
restricting edits to `SampleData.swift` and `Persisting.swift`, and — new for this
task — a third verification plan, `test.hindsight-sampledata-log-clean`, that reruns
`HindsightTests/SampleDataTests` in isolation and fails if the captured log contains
`unable to open database file` or `This model instance was invalidated`
(`~/.app-factory-hindsight/etc/enrolled-project.json`, `verificationPlans[2]`).

| Attempt                                               | Agent's diff                                       | Trusted verification result                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `582d67fb-3761-5043-9924-c79210aeda27` (21:43–21:46Z) | `SampleData.swift` only (+3,551 B diff)            | `test.hindsight-unit` **failed**: `DataLifecycleExportTests.testFailedSampleRemovalReportsFailureAndRetainsSamples()` and `SampleDataTests.testFailedSampleRemovalCanRetryWithoutTouchingMatchingPersonalRecord()` — `** TEST FAILED **`. The change altered observable behaviour, not just the lifetime hazard.    |
| `679d32e4-e7a7-5800-a1fe-2f63df64dbea` (21:50–21:53Z) | `Persisting.swift` + `SampleData.swift` (+2,155 B) | `build.hindsight` passed; `test.hindsight-unit` passed (`exitCode 0`, `passed: true`); `test.hindsight-sampledata-log-clean` **failed** — its stderr is the single line `FOUND diagnostic: unable to open database file`. Every test was green and the diagnostic the task exists to remove was still being logged. |

Both attempts ended `local-execution.verification-failed`; `run export` refuses both
(`run.export-not-verified`), so there is no record and no row. To see them:
`sqlite3 ~/.app-factory-hindsight/runtime/control-plane.sqlite "select ordinal,
operation, state, failure_json from steps where attempt_id='<id>' order by ordinal"`
(prepare and execute `succeeded`, verify `failed`); the changed-path lists are the
`candidateVerification` artifacts at
`runtime/evidence/blobs/sha256/1c/906bc1…` and `…/29/ed66bd…`; the failing
`xcodebuild` tail is blob `46/5beba0…` (571 B) and the log-clean plan's stderr is blob
`8b/f15519…` (47 B), the unit-suite record for the second attempt is `6e/f76c3f…`
(`"checkId":"test.hindsight-unit"… "passed":true`).

What this establishes: a plan that greps the run's own log for the diagnostic
caught a change that a green unit suite would have waved through. What it does not
establish: that either diff was close to right — nobody has analysed them. Two
plausible-but-wrong attempts in ten minutes is the signal to stop retrying blind
and give the task an analysis phase; the factory blocked correctly, and the next
move is a human's or a research phase's, not attempt three.

An earlier summary of this episode ("a log-content plan caught xcodebuild's false
`TEST SUCCEEDED`") was close but imprecise, and this file's previous revision flagged
it as unverifiable: `xcodebuild` did not report a false success — the unit tests
genuinely passed on attempt two — the log-content plan caught that passing tests were
not the acceptance criterion. That earlier flag is resolved by the evidence above.

### 2026-08-16 — first live Studio rooms round (verified against the private runtime, which has been preserved)

Commit `513fb39` ("studio-rooms: real Codex/Claude/Ollama participants, live-model
wiring") and its merge `620b1fb` claimed a research room ran with real Codex, Claude,
and a local Ollama model (`qwen2.5-coder:14b`) participating live. On 2026-08-17 the
runtime that round ran in was still present at `/private/tmp/af-room-smoke` and was
copied, owner-only, to `~/.app-factory-room-smoke-2026-08-16` so it outlives the next
`/tmp` clean; the facts below were read from
`runtime/control-plane.sqlite` there.

- Room `c73ea169-444b-45d2-ad68-6ba47bbeb532`, "iOS translation app risk review",
  kind `research`, three `room_participants`: `codex-planner` (provider `codex`),
  `claude-critic` (`claude`), `local-scout` (`ollama`); attended mode
  (`unattended_enabled = 0`), budget `dailyCeilingTokens 200000`,
  `maxTokensPerReply 2000`, `unattendedDailyCeilingTokens 0`.
- `room_messages`, seven rows, 2026-08-17T00:04:33Z–00:05:38Z (2026-08-16 evening
  local): #1 human `priyansh` question → #2 agent `codex-planner` (round 1) → #3
  human `@claude-critic can you specifically weigh in on that?` (`mentions:
["claude-critic"]`) → #4 `claude-critic` (round 2) → #5 `claude-critic` (round 3)
  → #6 `codex-planner` (round 4) → #7 `system`, `system_code = chain-cap`: "Agents
  have posted 3 messages in a row; waiting for a human message before granting the
  floor again." `local-scout` never posted — value-gated out, not errored.
- `room_budgets`: `spent_tokens 517`, `reserved_tokens 0`.
- `participants.json` in the same directory names the real executables: Codex
  `0.148.0-alpha.9` (`/Applications/ChatGPT.app/Contents/Resources/codex`, digest
  `sha256:6170ff55…`, model `gpt-5.6-sol`), Claude CLI `sonnet`, Ollama
  `qwen2.5-coder:14b` at `127.0.0.1:11434`.

So the claim in the merge message — value-gated admission, an `@mention` forced
invite, and the moderator stopping at the three-consecutive-agent cap, on real CLIs —
matches the durable transcript. This still is not the mirror-plus-broker-commit
recipe: a room has no Git artefact, the SQLite file is private, and the copy is a
copy. It is now "checked against the runtime by a second session", not "owner-
reported from a commit message". The unit tests the same commit added
(`packages/studio-room-adapters/test/*`) still exercise `FakeProcess`/`fakeSupervisor`
fixtures, not real models.

### 2026-08-17 — unattended rooms live proof (verified against a preserved private runtime)

Until this date the unattended path (`room.unattendedEnabled`, the `dormant`
attendance branch in `packages/studio-rooms/src/moderator.ts`) was unreachable live:
a dormant room acts only on `factory-event` triggers, and nothing in the daemon ever
produced one (`RoomModeratorLoop.notifyFactoryEvent` had no callers). Commit `ccb5898`
on `studio/room-factory-event-bridge` added the daemon-composed bridge from kernel
attempt transitions to `factory-event` lines (migration `0013-room-factory-event-cursor`;
see `packages/studio-rooms/README.md`). The proof below ran against a daemon built from
that commit; the runtime it ran in was `/private/tmp/af-unattended` and was copied,
owner-only, to `~/.app-factory-unattended-proof-2026-08-17` (with `results/` holding the
`room.events` JSON, transcript, `sqlite3` dumps, attempt row, kernel event list, mirror
refs, and the empty daemon log). Facts below were read from
`runtime/control-plane.sqlite` there. Participants were Ollama only
(`qwen2.5-coder:14b`, `127.0.0.1:11434`) — no Codex, no Claude, no paid call — and the
factory event came from a real kernel attempt over the deterministic
`swift-greeter-fixture-v1` local execution profile (fixture agent, real trusted
verifier, real reviewer, real broker commit; no model call on the attempt side).

- Room `e49e190f-57d7-4dee-ba32-71544baa6faf`, "Swift Greeter fixture — unattended
  proof", `project_id = a3000000-0000-4000-8000-000000000002`,
  `unattended_enabled = 1`, `agent_cooldown_events 2`; two `room_participants`,
  `local-scout` and `local-critic`, both provider `ollama`; budget
  `dailyCeilingTokens 200000`, `unattendedDailyCeilingTokens 20000`,
  `maxTokensPerReply 2000`.
- `room_messages`, five rows: #1 human `priyansh` (`2026-08-17T21:41:07.804Z`) → #2
  `local-scout` (round 1, `21:41:19.191Z`) → #3 `local-critic` (round 2, `21:41:26.243Z`)
  — attended rounds; then a real ten-minute wait with no human post (no dormancy knob
  was added; `room.events` at `21:51:42Z` reported `attendance: "dormant"` and
  `unattendedSpentTokens 0`) → #4 `system`, `system_code = factory-event`
  (`21:52:00.924Z`): "Factory: attempt 9a557d45 for task "Add a farewell to
  GreetingFormatter" → succeeded (broker commit b258c769)" → #5 `local-scout`
  (round 3, `21:52:08.763Z`): "The Factory attempt succeeded, so no action is needed
  for this round." — a real Ollama reply granted **while dormant**.
- `room_grants`: rounds 1–3 all `committed`, `tokensUsed` 54 / 63 / 39;
  `room_budgets`: `spent_tokens 156`, `reserved_tokens 0`,
  `unattended_spent_tokens 39` (round 3 only — the unattended ceiling was applied).
- `room_factory_event_cursor`: `ledger_position 13`,
  `event_id f2b5e0bf-d857-5a35-ab47-89087a361948`,
  `event_occurred_at 2026-08-17T21:52:00.931Z`, `last_delivered_event_id` the same,
  `delivered_count 1`.
- Kernel side: task `c1f4b21a-47aa-4e3c-a9ec-75d5ee968708`, attempt
  `9a557d45-7152-52e6-87cd-a2714631155d`, submitted with `factory run` at
  `21:51:55.704Z` (`attempt.created`, events rowid 1), `state = succeeded`,
  `terminal_at 21:52:00.931Z` (`attempt.state-changed` running→succeeded, rowid 13 —
  the event the cursor names). Broker commit
  `b258c769a80c17b7dc2b14ec600fa854e7613567` at
  `refs/app-factory/attempts/9a557d45-7152-52e6-87cd-a2714631155d` in
  `runtime/local-execution/git/mirrors/62000000-0000-4000-8000-000000000002.git`
  (base `c338785817ba8d5ee6056f65c075aec47178c393`, one file changed:
  `Sources/Greeter/GreetingFormatter.swift`); this row therefore also passes this
  ledger's mirror recipe, but no `run export` was taken for it.

So the claim — a dormant, unattended-enabled room is triggered by a real factory
attempt transition, the bridge line names the real broker commit, and a live model reply
is granted under the unattended ceiling — matches the durable transcript and budget
rows. What it does not establish: more than one unattended round in one room; anything
about the scorer's judgment (a live model verdict, not reproducible); portfolio-wide
rooms (`project_id NULL`) are deliberately not delivered to and were not exercised; the
delivered line's instant (`21:52:00.924Z`) predates the kernel event it reports by 7 ms
because the scheduler's monotone clock ran ahead of the daemon clock — the bridge floors
that at the event's `occurredAt` as of the follow-up commit, which the preserved runtime
predates. The SQLite copy is a copy; the room has no Git artefact of its own.

### 2026-08-16 — Phase Runner live runs (partially owner-reported)

Two live-smoke claims accompany the Phase Runner and Project Registry merges:

- **Synthetic repo, commit `401bb45`, grader pass.** `git log --all -S"401bb45"`
  and a full-tree `grep` for that string return nothing anywhere in this repository
  — no commit message, no diff, no doc. **Could not be verified from this repository
  at all; recorded as owner-reported only**, and even that provenance is thin (it
  may reference a commit inside a scratch repository never linked from here).
- **Hindsight scratch clone via the Project Registry, `Docs/product/research.md`
  committed `9f1f4bb2`, grader pass.** This one has a citable anchor: the
  `studio/project-registry` merge commit in this repository's own history
  (`d757bea`) states: "registered a dedicated scratch clone of Hindsight
  (`factory/pilot-1.1`, never the real checkout) via `project.register`... then ran
  the research phase of `ios-app-standard-0.4.0` (cast swapped to the composed
  Ollama roster, `qwen2.5-coder:14b`) against it end to end: a real writer turn, a
  real grader verdict (pass), and the committed output landing at exactly
  `Docs/product/research.md`." That merge commit is real and its diff implements
  exactly the described mechanism (`project.register`'s case-aware `docsDir`
  resolution, the composed Ollama roster). **This is stronger than the synthetic-repo
  claim — it is textually anchored in this repository's own version-controlled
  history — but it is still not independently re-verified here**: the Hindsight
  scratch clone and its mirror are outside this repository, so `commit 9f1f4bb2`
  itself was not re-`git show`n. Treat it as recorded-in-commit-message, not as a
  row this ledger's own verification recipe (mirror path + `git show`) was run
  against.
- **`gemma3:4b` grader failed closed.** Not found anywhere in this repository —
  the only occurrence of `gemma3:4b` at all is as an example model name in a code
  comment in `packages/studio-room-adapters/src/contribution-schema.ts`, unrelated
  to any grading run. **Could not be verified; recorded as owner-reported only.**

### Portfolio events referenced but out of this ledger's scope

One claim accompanying the 2026-08-16 sweep is not a Factory run at all, and is noted
here only to explain why no row was added for it:

- **"Roam 1.0(4) upload, 2026-08-16."** A `grep -ri roam` across `docs/` finds only
  a synthetic test fixture (`packages/project-docs/test/fixtures/roam-ios/`) used to
  unit-test the docs-as-truth parser — fictional data, not a real event record. An
  App Store Connect build upload is an external, manual Xcode-archive action (see
  the operator's own iOS release conventions) with no trace in this repository's
  code, tests, or git history. **Not verifiable from this repository; not a Factory
  run in the first place, so it does not belong in this ledger as a row** — noted
  here only so the claim isn't silently dropped.

A second claim that sat here — "Hindsight issue #1 blocked after 2 attempts (a
log-content plan caught a false `TEST SUCCEEDED`)" — was flagged as conflicting with
[`HINDSIGHT_ENROLLMENT_STATUS.md`](HINDSIGHT_ENROLLMENT_STATUS.md). It did not
conflict; that file describes the 2026-08-11 enrollment scan and never covered pilot
task attempts at all, and the two 2026-08-16 attempts had simply not been read out of
the runtime. They now have their own section above, with the imprecision in the
original wording named.

## What these runs do not establish

- No provider HTTP call has ever been made; the effect pump ships default-off with an
  empty adapter registry.
- The independent reviewer used in every row above is the project's configured
  reviewer. The read-only Codex reviewer adapter made its first live model calls on
  2026-08-17 (two invocations, by hand, outside CI: the first refused pre-model by the
  CLI and fixed with `--skip-git-repo-check`, the second completed with a correct
  `changes-required` verdict; results under `~/.app-factory-reviewer-smoke/results/`,
  write-up in [`docs/operations/llm-independent-review.md`](../operations/llm-independent-review.md)).
  It has still never reviewed a real Factory attempt — no row above used it.
- No quality gate, certification, archive, upload, or TestFlight build has run.
- UI-test verification has been part of exactly one passing plan
  (`test.hindsight-ui`, attempt `40139cdb…`); it is not yet routine.
- A second application (Hindsight, via a scratch clone) has been registered and had
  one phase run against it (see above); it has not been through the full pilot loop
  a task attempt gets, and no application has had a Factory-produced change merged
  or shipped.
- Unattended rooms mode (`room.unattendedEnabled`) has passed only fake-participant
  tests; it has not been proven live.
- Both Phase Runner live-run claims above still rest on commit messages: the scratch
  runtimes and clones they ran in no longer exist (checked 2026-08-17 — no
  `phase_runs` row and neither `9f1f4bb2` nor `401bb45` in any repository under
  `/private/tmp`), so they cannot be upgraded the way the rooms round was. The next
  phase run should be exported or its runtime preserved before the claim is made.
