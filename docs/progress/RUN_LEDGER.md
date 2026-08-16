# Run ledger

Updated: 2026-08-15

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
the sealed mirror; `--json` includes `recordDigest`. New rows should cite that digest
alongside the runtime path and mirror ref. The rows below predate the verb and were
verified by hand with the commands above; the record is not yet signed. Do not add a
row you have not verified.

## Runs

### 2026-08-14 — first real-model run (fixture)

| Field         | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| Attempt       | `2b4d6cde-d020-5f9e-baa4-8636f66edbf8`                     |
| Profile       | `swift-greeter-codex-v1` (pinned fixture)                  |
| Runtime       | `~/.app-factory-a3-r2`                                     |
| Broker commit | `3add1e34e0a02b7b1ecb33aeb43b9ffd84fdee34`                 |
| Agent         | Codex CLI `0.148.0-alpha.9`, factory-owned snapshot binary |
| Duration      | 55 s end to end                                            |
| Verification  | `swift test`, plus two grep acceptance checks — all passed |
| Review        | pass                                                       |
| Evidence      | manifest verified: 7 records, 30 artifacts                 |
| Tokens        | 71,953 input (53,248 cached) / 923 output                  |

The first time the Factory drove a real model through prepare → contained agent run →
trusted verification → independent review → broker commit → evidence manifest.

Four fail-closed stops preceded it on the same day, each caught by the Factory's own
gates rather than by a human noticing: an unrunnable pinned CLI version, an output
schema the provider rejected, a mid-day Sparkle update that replaced the pinned
binary, and a model-capacity error. None produced a false success.

### 2026-08-15 — first real-application pilot (Hindsight)

Enrolled project `hindsight`, pilot branch `factory/pilot-1.1`, base commit
`10cc1b13b568e6cce8fdea8907d56d3a80402c71`. Runtime `~/.app-factory-hindsight`.
Every attempt ran the same three-plan verification: a change-specific `grep`
acceptance check, `xcodebuild build`, and `xcodebuild test -only-testing:HindsightTests`
(121 unit tests). All three passed on every attempt; independent review returned
`pass` with zero findings each time.

| Attempt                                | Change                                                                  | Broker commit                              | Duration | Tokens (in / cached / out) |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | -------- | -------------------------- |
| `1930791b-75be-533c-9471-f814e4000516` | `DecisionDetailView` — refresh after due-prediction resolution          | `1b65f20628ea6360b24bc2e9543bae0b1a06f447` | 86 s     | 74,204 / 56,320 / 755      |
| `a603f41d-2e25-52f3-8e93-4c2586cfd789` | `HindsightArchiveView` — snapshot live queries once per body evaluation | `55ddc8f51f4f3edfe9576a007d97f00b89c70c20` | 93.5 s   | 84,057 / 62,464 / 1,144    |
| `8b0a9333-2240-5c7c-ad6e-77743afa67f3` | `SplashView` — replace raw hex with semantic tokens                     | `5d732c250287a2b7afd652de89851fc63f691542` | 101.7 s  | 91,263 / 67,584 / 1,576    |

Each broker commit touches only the files its task authorized. None has been merged
or pushed; they exist solely at their attempt refs in the Factory-owned mirror.

Build and test time is ~53 s of fixed Xcode and simulator overhead on every attempt,
independent of diff size — agent time was 30–46 s.

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

## What these runs do not establish

- No provider HTTP call has ever been made; the effect pump ships default-off with an
  empty adapter registry.
- The independent reviewer used here is the project's configured reviewer. The
  read-only Codex reviewer adapter has passed only fake-executable tests and has never
  run against a live model.
- No quality gate, certification, archive, upload, or TestFlight build has run.
- UI-test verification is not part of any passing plan yet.
- No second application has been enrolled.
