# 0004 — Studio Phase 4: Phase Presets, the Phase Runner, and the Planner

Status: accepted (studio/phase4-ui). Scope: `apps/studio-mac` — `StudioKit/{Models,Client,Phases,
Planner,Chat,Shell}`.

## Context

`integration/studio-wave1` (tip 08adc9e) already carries the daemon side of Studio Phase 4 in full:
`preset.list`/`preset.upsert`/`phase.upsert` (durable, revisioned phase definitions and the presets
that bundle them — `phase.ts`), `phase.run`/`phase.status`/`phase.list`/`phase.approve`/
`phase.reject` (the Phase Runner — `phase-run.ts`), `plan.propose`/`plan.edit`/`plan.approve`/
`plan.execute`/`plan.approve-gate`/`plan.status`/`plan.tick` (the Planner — `project-plan.ts`), and
`project.seed`. Unlike `studio.snapshot`/`studio.assistant.*` in ADR 0003, none of these sixteen
operations is feature-detected — they are baked into this worktree's `packages/contracts` and
unconditionally registered, the same as `room.*`.

## Decisions

### 1. Sixteen new wire operations, no feature detection

`CommandOperation` grows from 32 to 48 cases. Every new Swift model mirrors its zod schema exactly,
including the same "nullable fields always emit `null`, never omitted" discipline as every prior
phase (hand-written `encode(to:)` wherever a type carries an `Optional` that is `.nullable()` on the
wire, not `.optional()`).

### 2. A `kind` discriminator lives on the wrapping enum, not the payload struct

`ProjectPlanItemDraft`/`ProjectPlanItem` (task vs. gate) and their draft counterparts follow
`RoomMessage`'s pattern over `RoomChatMessage`/`RoomSystemMessage` exactly: the child struct's own
`CodingKeys` never mentions `kind`, and the wrapping enum writes `kind` into the _same_ encoder/
decoder its case's payload reads and writes its own fields from. A struct's own `CodingKeys`
mentioning a key with no matching stored property breaks Swift's synthesized `Decodable` outright —
this is the concrete failure this pattern avoids.

### 3. `PhaseRunStatusStrip` is its own public view, not a private method on `PhaseEditorView`

Originally the run strip (queued/running/awaiting-human with gold Approve/Reject/succeeded with a
grader verdict) was a private method inside the editor. It was pulled out to a standalone
`public struct PhaseRunStatusStrip: View` so it is independently snapshottable — the editor's own
body lives inside a `ScrollView` a fixed-size offscreen host renders only the first viewport of, so a
snapshot proving the awaiting-human strip needs the component on its own, not scrolled off the bottom
of a whole-editor capture. `PhasesScreen`'s recent-runs panel and the editor's strip now also share
one `phaseRunStatusPill(for:)` helper instead of two copies.

### 4. The Planner's brief renders read-only — `plan.edit`'s union has no brief-editing kind

`ProjectPlanEditV1` is exactly seven kinds: `reorder`, `defer`, `retitle`, `edit-task-spec-draft`,
`add-item`, `remove-item`, `set-repository`. None edits `brief`. `PlannerScreen` renders the brief
with a `staticValue` provenance badge explaining this rather than drawing an edit affordance that
would call an operation the wire does not have — the same "never claim a capability the daemon
doesn't back" discipline as every ADR before this one, applied to a case where the _daemon itself_
(not just Studio) has the gap.

### 5. `project.seed`'s result names no `RepositoryID`/`ProjectID` — the seed sheet proposes with both `nil`

`ProjectSeedCommandResultV1` carries `repositoryRoot` (a path), a scaffold commit, and enrollment
digests — no `RepositoryID`, no `ProjectID`. `SeedProjectSheet` therefore calls `plan.propose` with
`repositoryId: nil`, honestly, and says so in the sheet itself: "the seeded repository's ID isn't
returned by `project.seed` yet, so the proposed plan starts with no target repository set —
`plan.execute` will hold on the first task until that's wired." This mirrors `project-plan.ts`'s own
doc comment that `plan.execute` refuses to submit a task item while `repositoryId` is still `null` —
a real, documented gap in this wire family (like ADR 0003's slug gap or the rooms persona-picker gap
in Room.swift), not something Studio papers over with an invented ID.

### 6. The Planner is not a fourth tab; it overlays whichever tab is active

`StudioTab` stays `{dashboard, chat, phases}`. `StudioRootView` holds `showingPlanner: Bool`
separately and renders `PlannerScreen` in place of the tab body when true — reachable from a "New
project" affordance on the Dashboard (`DashboardScreen.onNewProject`, only shown when a daemon is
configured) and from the corner chat: `ChatModel.confirmIntent` now returns the
`AssistantIntentExecutionOutcome` it recorded, and `ConversationView.onPlanReady` fires when that
outcome carries a `ProjectPlan` (`propose-plan`/`execute-plan` — see decision 7), so confirming either
intent's card opens the same Planner view any other route lands on.

### 7. `AssistantIntentPayload` gains `propose-plan`/`execute-plan`; both dispatch verbatim

Mirrors the five existing intent kinds exactly: each variant's fields equal the payload of the one
daemon command `studio.assistant.intent.execute` forwards to (`plan.propose`/`plan.execute`), and
`AssistantIntentExecutionOutcome` gains matching `planPropose`/`planExecute` cases embedding
`ProjectPlanResult` verbatim. `IntentRecognizer.recognize(_:)` — the client-side free-text matcher —
deliberately does **not** grow cases for these two: like `queue-task`/`run-phase`, their payloads
need structured fields (a `PhasePresetId`, a plan brief, a `planId` + `expectedRevision`) no chat
utterance alone carries, so the propose/execute-plan confirmation card is always constructed from a
form (the seed sheet, or a future in-planner "propose" action), never guessed from typed text.

## Consequences

- Every value on the PHASES tab and the Planner carries a provenance badge exactly like every earlier
  screen: `LIVE` off `preset.list`/`phase.status`/`phase.list`/`plan.status`, `STATIC` for the brief's
  honest "not editable yet" note, never a fabricated verdict.
- When the daemon eventually returns a `RepositoryID`/`ProjectID` from `project.seed` (decision 5) or
  gains a brief-editing `plan.edit` kind (decision 4), those are the exact two seams to close — no
  other client-side state assumes otherwise.
