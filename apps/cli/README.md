# CLI

Thin client for the typed App Factory command service. Business logic does not
belong in this package.

Set `APP_FACTORY_SOCKET` and `APP_FACTORY_AUTH_TOKEN`, then use `doctor`,
`submit --task`, `run --task`, `attempts`, `status`, `events`, `pause`, `resume`, `cancel`,
`reconcile`, or the read-only `portfolio` snapshot. Portfolio output preserves
unknown Jira, GitHub, quality, release, and analytics values as `unavailable`;
it never substitutes numeric zero. Immutable run proof is daemon-owned and
available through `evidence list`, `evidence inspect <attempt-id>`, and
`evidence verify <attempt-id>`. The list command accepts bounded `--after` and
`--limit` pagination. Add `--json` for a stable machine-readable envelope.
Task files are parsed as strict TaskSpec V1 documents before transmission.

`attempts` is the read-only work queue. It defaults to active attempts and 50
rows. Add `--all`, `--project UUID`, or `--limit 1..100` to filter it. Continue
a page by passing both values printed by the prior response as
`--after-updated-at ISO_INSTANT --after-attempt UUID`; a partial cursor is
rejected.

Existing-repository enrollment is `project scan <absolute-path>`, which
scans the repository, persists the scan as evidence, and prints a summary
(fingerprint, inventory digest, plan digest, and any blockers) without
mutating anything. `project plan <digest>` prints the full stored plan as
JSON. `project apply <digest> [--branch <name>]` is durable: it re-reads
the persisted plan, applies its automatable actions on a new branch, and
fails closed if the digest is unknown or the repository has drifted since
the scan.

Studio milestones live under `project` too. `project milestones <project-id>`
prints the project's timeline: its milestone plan (dated milestones first in
calendar order, then undated ones) next to the per-phase actuals derived from
its attempts. `project milestone upsert --project-id UUID --phase KEY --kind
stage|gate|release --label TEXT --owner human|machine --status
planned|active|done|abandoned [--milestone-id UUID] [--target-date YYYY-MM-DD]
[--depends-on UUID]... [--evidence-digest sha256:...] [--expected-revision N]`
creates a milestone (no `--expected-revision`) or compare-and-set updates one
(`--expected-revision` must equal the stored revision). `--target-date` is
optional and its absence is stored as `null` and rendered as `won't guess`; the
CLI never fills in a date. `--milestone-id` may be omitted on a first create
(one is generated and printed) but must be given on a retry so the replayed
payload is identical. `task new` accepts `--phase KEY` to tag the task with the
Studio phase it belongs to; omitting it leaves the spec without a `phase` key,
so its digest is unchanged.

The release rail (Studio Phase 6 step B) is `release projection` — the latest
persisted App Store Connect observation, if any, plus whether the daemon can
take a fresh one — and `release observe [--builds-limit N]`, which asks the
daemon for ONE strictly read-only observation through its composed observer
(refused with `release.observer-not-configured` when
`APP_FACTORY_ASC_OBSERVER_CONFIG` is unset). Both print Apple's own instants
and states verbatim; see `docs/operations/release-rail.md`.

The Planner turns a brief into a skimmable, editable task list and executes
it. `plan propose --preset ID --title TEXT --one-liner TEXT
[--constraint TEXT]... [--project UUID] [--repository UUID]` builds the item
list deterministically from a Phase Preset's phases. `plan show <plan-id>`
(alias `plan status`) prints the current head. `plan edit <plan-id>
--expected-revision N --edits <path>` applies a JSON array of edits (reorder,
defer, retitle, edit-task-spec-draft, add-item, remove-item, set-repository)
read from a file. `plan approve <plan-id> --expected-revision N` and `plan
execute <plan-id> --expected-revision N` move a plan from draft to approved to
executing, submitting its first ready task item. `plan approve-gate <plan-id>
<item-id> --expected-revision N` clears a pending human checkpoint. `plan tick
<plan-id>` advances the chain by one step (settle the running item, advance
the repository's base, submit the next item, or complete). `project seed
<absolute-path> --name TEXT` is the from-scratch entry point: it creates a new
Git repository with an XcodeGen scaffold, a GitHub Actions workflow, and one
passing test, commits it, and runs enrollment scan-and-apply on it.

Every invocation creates an explicit durable command identity. If delivery is
ambiguous after dispatch, human output prints a recovery command and JSON
output includes `error.retryIdentity`. Retry the same operation and payload
with both `--command-id UUID` and `--issued-at ISO_INSTANT`; providing only one
is rejected. The client creates a new request ID while preserving that exact
logical command identity, so the daemon can return the journaled result instead
of applying the mutation twice.

LaunchAgent bootstrap inspection is intentionally separate: use
`pnpm service plan --config /absolute/path/to/service.json` or
`pnpm service status --config /absolute/path/to/service.json`. The `factory`
client never imports service-management or bypasses the daemon command boundary.
