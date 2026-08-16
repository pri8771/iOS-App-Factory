# 0003 — Studio Phase 2: studio.snapshot, the daemon assistant, and real milestones

Status: accepted (studio/phase2-app). Scope: `apps/studio-mac` — `StudioKit/{Models,Canonical,Client,
Dashboard,Chat,Shell}`.

## Context

Phase 1 shipped against a daemon that only had the pre-existing 21 operations. Studio Phase 2's daemon
service (`docs/roadmap/STUDIO_PHASES.md` Phase 2/3) lands on three separate, still-unmerged worktrees as
of this writing:

* `studio/service-skeleton` (tip cdfe558) — `studio.snapshot`, `studio.assistant.query`,
  `studio.assistant.intent.{propose,execute}`. Composes today from attempts/events/the local portfolio
  projection; `milestones`, project `gates`, and portfolio `rooms` are placeholders this file's daemon
  always reports empty with an explicit `unavailableReason` (`STUDIO_NOT_YET_WIRED_REASON_V1` /
  `studioNotYetWiredReason`), because the branches that will populate them are the two below.
* `studio/milestones-and-phase` (tip 3cff9a7) — the real, revisioned milestone concept:
  `project.milestones.list` / `project.milestone.upsert`, `ProjectMilestoneV1`.
  `studio/lifecycle-reconciliation`'s new 6-stage `ProjectLifecycleStageV1` / `TypedGateV1` are not
  referenced by any of the six ops this phase builds against — `StudioProjectV1.lifecycleStage` still
  uses the pre-existing 8-value `ProjectLifecycleStage` (`project.ts`), and `StudioProjectGatesV1` is a
  plain `{typed: string|null, owner: string|null, state, unavailableReason}` summary, not a
  `TypedGateV1[]` array. Studio's Swift models mirror the wire exactly, not the eventual reconciled
  shape.

None of these three branches is merged to `main`, and they were not merged to each other either, so
Studio built against each branch's own build of `@app-factory/contracts` (see "Fixtures" below) rather
than against `main`.

## Decisions

### 1. `studio.snapshot` is additive: `DashboardInputs.studioSnapshot` gates a parallel derivation

`DashboardDerivation.{gauges,reticle,awaiting,projects}` each check `input.studioSnapshot` first and
fall through to the unchanged phase-1 logic when it is `nil`. Every phase-1 test therefore needed no
changes; every Phase 2 behaviour is proven by new tests that set `studioSnapshot`. `StudioStore.refresh`
tries `client.studioSnapshot()` first each call and falls back to `portfolio.snapshot` +
`attempt.list` on an unsupported-operation-style failure — see decision 2. `evidence.list` is fetched
either way: project detail's latest-run checks (`attempt.events` + `evidence.verify`) are unaffected by
which snapshot sourced the dashboard.

### 2. Feature detection has no dedicated wire code yet, so the client accepts two

`DaemonClientError.isUnsupportedOperation` treats both `protocol.unknown-operation` and
`protocol.invalid-request` as "this daemon doesn't know this operation": the former is what a daemon
that recognises the frame shape but not a specific newer operation could reasonably answer (and is what
`FakeDaemonServer`-backed tests already modelled for an unknown op before this phase); the latter is
what today's actual `main`-branch daemon answers, because `studio.snapshot` isn't in
`CommandRequestFrameV1Schema`'s discriminated union at all yet, so the whole frame fails to parse. This
is the one place the contract left a real gap — there is no `protocol.unknown-operation` code reserved
in `command-protocol.ts` today. Any other remote failure (timeout, degraded daemon, …) is treated as a
genuine error: `refresh()` still falls back to the phase-1 path so the dashboard has something, but
keeps the real message under `errors["studio.snapshot"]` instead of silently swallowing it.

### 3. `StudioSnapshotDigest` mirrors `PortfolioDigest` field-for-field, different key set

`StudioSnapshotV1`'s digest input is `{schemaVersion, generatedAt, projects, rooms,
roomsUnavailableReason, portfolio}` (excludes `sourceSnapshotDigest`), canonicalised and hashed exactly
like `PortfolioReadModelV1`'s four-field input (ADR 0001, decision 5). `DaemonClient.studioSnapshot()`
re-verifies it from the raw wire bytes the same way `portfolioSnapshot()` does.

### 4. Two milestone concepts, deliberately not unified

`StudioMilestone` (StudioSnapshot.swift) is `studio-snapshot.ts`'s own placeholder shape nested in
`StudioProjectTimeline` — `targetDate: IsoInstant?`, `status: planned|at-risk|met|missed` — and is what
the dashboard Gantt reads (`projects[].timeline.milestones`, per the phase-2 task's own wording).
`ProjectMilestone` (Milestone.swift) is the real, revisioned concept `project.milestones.list` /
`.upsert` read and write — `targetDate: CalendarDate?`, `status: planned|active|done|abandoned` — and is
what the project-detail milestones panel and the milestone editor sheet use. These are not the same
schema: the status vocabularies actually differ (confirmed while hand-authoring the
`project-milestone-upsert.response.json` fixture — `"at-risk"` is rejected by
`ProjectMilestoneStatusV1Schema`), and `studio-command-runtime.ts`'s own doc comment says the placeholder
"is exercised only by round-trip/type tests until \[milestones-and-phase\] merges and this type is
reconciled with the real one." Naming them `StudioMilestone` vs `ProjectMilestone` (and
`ProjectMilestoneTimeline` vs the pre-existing Gantt-row `ProjectTimeline`) keeps that seam visible in
code instead of papering over it.

### 5. `StudioProjectV1` has no slug — timeline rows merge by a best-effort slugified name

`PortfolioProject.slug` (a `StableKey`) is what phase 1's fixture/live merge keys on.
`StudioProjectV1` carries no slug at all. `DashboardDerivation.slugify(_:)` (lowercase, non-alphanumeric
runs collapsed to one `-`, edge hyphens trimmed) is the studio-mode merge key instead: single-word
display names like "Hindsight" collide with their fixture slug exactly; multi-word ones like "Anjali —
Journal" slugify to "anjali-journal", not the curated fixture slug "anjali", and draw as a live-only row
instead of merging. This is a real, documented gap between the two contracts, not a bug — `testSlugify…`
in DashboardDerivationTests pins both cases.

### 6. Gates draw a ◆ only when real and human-owned

`StudioProjectGatesV1.owner`/`typed` are plain strings (the eventual `GateOwnerV1`/`TypedGateNameV1`
enums belong to `studio/lifecycle-reconciliation`, unmerged). `DashboardDerivation.studioGateBar` and
`ProjectDetailView`'s gates panel draw a ◆ (`DiamondGate`) only when `state != .unavailable` and
`owner == "human"` — diamonds are this design system's human-gate vocabulary specifically (ADR 0001
decision 1), so a machine-owned or not-yet-wired gate draws nothing rather than a claim the app can't
back up. A human-owned gate whose state is `.satisfied`/`.waived` draws hollow-cleared; `.pending`/
`.blocked` draws gold-waiting.

### 7. The corner chat: `DaemonAssistant` first, `ScriptedAssistant` as the honest fallback

`ChatModel.send(_:context:backend:)` takes an optional `AssistantBackend` (closures StudioStore builds
over `DaemonClient`, so `ChatModel` still never imports the client type — mirroring how views never
touch the wire, ADR 0001). With no backend, or when the backend reports `.unsupported`/`.failed`, the
reply is `ScriptedAssistant`, now tagged `ChatMessage.isStub = true` and rendered with the STUB label —
that label no longer means "phase 1," it means "this reply did not come from the daemon." An
`.answered` reply renders its citations as small `kind · id` chips; a `.cannot-answer` reply renders as
plain honest text naming the reason, because the daemon's refusal is itself a real, live answer.

`IntentRecognizer` mirrors the daemon's own `INTENT_PHRASE_PREFIX_V1` / `identifiersOf` table
(`studio-command-runtime.ts`) for the three intent kinds constructible from a chat sentence alone —
`scan <absolute path>`, `enroll <digest> [on <branch>]`, `approve <attempt-uuid> <answer>` — and
constructs the matching `AssistantIntentPayload` client-side. `queue-task` / `run-phase` are not
recognized from free text: their payload is a full `TaskSpecV1` (acceptance criteria, a base commit, a
policy digest, …), nothing a chat message carries, and the daemon does not infer one either — see the
module doc comment on `AssistantIntentPayloadV1Schema`. Confirming a proposed intent
(`IntentConfirmationCard`, gold because it's the human's decision) calls `studio.assistant.intent.execute`
and shows the resulting attempt id when the outcome has one (`task.submit`/`task.run`/`attempt.unblock`
do; `project.scan`/`project.apply` don't).

### 8. Fixtures: recorded against each branch's own build, not `main`'s

`scripts/record-fixtures.mjs` imports `packages/contracts/dist/index.js` from the *current* worktree,
which is `main`-based and has none of these six operations. The nine new fixtures
(`studio-snapshot.*`, `assistant-*.response.json`, `project-milestone*.response.json`) were instead
produced by two small scripts run against `/private/tmp/af-studiosvc` (studio/service-skeleton's own
built `dist/`) and `/private/tmp/af-milestones` (studio/milestones-and-phase's), validating every value
through that branch's real zod schemas — same "record through the real contracts" discipline as ADR
0001 decision 5, just pointed at a branch build instead of `main`'s. None of the nine fixtures are
hand-authored guesses.

## Consequences

* A studio-mode dashboard and a phase-1 dashboard are the same `DashboardSnapshot` shape; every view
  that already knew how to render one keeps working unmodified for the other.
* When the three branches above merge and get reconciled with each other, the seams this ADR documents
  (decision 4, decision 5, decision 6) are exactly the diffs to expect: `StudioMilestone` collapsing
  into `ProjectMilestone`, a real slug appearing on `StudioProjectV1`, and `StudioProjectGatesV1`
  becoming (or gaining) a `TypedGateV1[]`.
* `DaemonClientError.isUnsupportedOperation`'s two-code guess (decision 2) should be revisited once the
  daemon actually ships a dedicated code for "operation not recognised" — grep for
  `isUnsupportedOperation` to find every call site that assumes it.
