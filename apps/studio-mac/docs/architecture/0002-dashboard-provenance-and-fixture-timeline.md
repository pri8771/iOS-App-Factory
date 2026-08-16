# 0002 — Dashboard: provenance-typed values, fixture-fed timeline, scripted assistant

Status: accepted (studio/phase1). Scope: `apps/studio-mac` — `StudioKit/{Models,Dashboard,Chat,Shell}`.

## Context

Phase 1's dashboard has to run on real daemon data while the daemon still lacks two things the
prototype draws: planned dates (a milestones schema) and an assistant. The HUD rule "every instrument
shows a real value or an honest —" therefore has to survive three kinds of value living side by
side: what the daemon said, what a bundled fixture says, and what nobody can source yet.

## Decisions

### 1. Every displayed value carries a `Provenance`, and the UI prints it

`Provenance` is `.live(op)` · `.derived(note)` · `.fixture(name)` · `.staticValue(note)` ·
`.notYetSourced`. `Sourced<T>` pairs a value with it, and `GaugeReading`, `ReticleReading`,
`AwaitingItem`, `TimelineBar`, `ProjectTimeline`, `RunCheck`, and every assistant reply carry one.
`ProvenanceBadge` renders it as a mono tag next to the value (LIVE / DERIVED / FIXTURE / STATIC /
NOT YET SOURCED; FIXTURE + LIVE for fixture rows overlaid with daemon marks). Live and derived print in
the machine's dim cyan; fixture is neutral ink in a dashed capsule; static and not-yet-sourced are
muted. Provenance is never gold — it is never a thing waiting on the human.

Consequence: a "—" is not an empty string, it is a `nil` value whose provenance says why, and a
number on screen can always be traced to a wire operation or a fixture file by hovering it.

### 2. The dashboard is a pure function of `DashboardInputs`

`DashboardDerivation.snapshot(_:)` maps `{doctor, portfolio, attempts, evidence, timeline, now}` to
`DashboardSnapshot {gauges, reticle, awaiting, projects}`. Nothing in `Dashboard/` touches the wire;
`StudioStore` fetches (doctor → portfolio.snapshot → attempt.list(scope all, 100) → evidence.list),
keeps per-operation errors instead of swallowing them, and hands the results in. `nil` collections
mean "not loaded", distinct from "loaded and empty", so gauges can say "offline"/"loading" rather
than 0. Every derivation is unit-tested against the recorded zod-validated fixtures, and the views are
snapshot-tested with `now` pinned to 2026-08-16.

What each gauge is, and where its number comes from:

| gauge              | value                                                                    | provenance |
| ------------------ | ------------------------------------------------------------------------ | ---------- |
| projects           | `portfolio.totals.projects`; arc = projects with active attempts / total | live       |
| verified · 7d      | succeeded attempts terminal in the last 7 days **that have an evidence manifest** (attempt.list ∩ evidence.list); arc = verified / terminal runs in window | derived |
| awaiting you       | `portfolio.totals.blockers` (the only gold gauge); caption names fixture gates, never folds them in | live |
| min / release      | —                                                                         | not yet sourced (release rail, phase 6) |
| agent window       | —                                                                         | not yet sourced (provider telemetry) |

The reticle reads the daemon's `lifecycleStage`s (exploring 0 → released 1, paused/archived make no
claim) when at least one project has a stage; otherwise it falls back to the fixture's lifecycle
tracks and is badged FIXTURE; otherwise "—".

### 3. The timeline is fixture-fed by design, with live marks overlaid

`ProjectTimeline` (lifecycle track + dated bars in exactly the prototype's kinds: done · live · plan ·
review · unknown · gate ◆) is populated from `Sources/StudioKit/Resources/timeline-fixture.json`,
which mirrors the six real apps' evidence-backed status as of 2026-08-16. The fixture is loaded once,
validated (bars end after they start; gates carry a state; slugs are stable keys), and every bar and
row it produces carries `.fixture("timeline-fixture.json")`. The dashboard prints the fixture note
under the chart.

Live data is merged by slug (`PortfolioProject.slug` ↔ fixture `slug`):

* on a matched row, live attempts are drawn as marks — succeeded → done, in flight → live, blocked →
  ◆ waiting — with `.live("attempt.list")`; failed/cancelled attempts have no bar kind in the
  prototype vocabulary and are not drawn; the row is badged FIXTURE + LIVE;
* a daemon project the fixture does not know gets a live-only row: lifecycle from its stage (steps
  before = done, stage = active, after = planned, and the device-smoke gate always **unknown** because
  the daemon records no human gate), its attempt marks, and a dashed-alert "no milestones" span from
  today to the window edge — the machine refusing to guess, drawn as such.

TODO(studio-phase-2): when the studio service lands `milestones[]: {phase, stage|gate, targetDate,
dependsOn}` on projects (and `phase` on tasks), `TimelineFixture.loadBundled()` is replaced by a
`portfolio.milestones` read and the fixture provenance disappears. Nothing else in the timeline
changes: `TimelineView` only knows `ProjectTimeline`.

Drawing: `TimelineView` is `Canvas`-per-row (grid, today-line, bars, gates) under a `Canvas` header
(month ticks Jul 15 · Aug · Sep · Oct · Oct 15, "TODAY"). Canvas is opaque to VoiceOver, so each row
carries a full accessibility description of its bars, note, and source. Colours are the dynamic
`HUDTheme` tokens; the snapshot suite proves they resolve in both appearances inside Canvas.

### 4. Project detail reads the latest run from the events, not from a summary

`RunDetail.checks(events:verify:)` turns `attempt.events` (paged until exhausted) into rows: one per
step (`step.created` gives ordinal + operation, `step.state-changed` gives the final state, failure
code or output digest), one per recorded commit, the attempt's terminal/blocked transition, and one per
item of `evidence.verify` (kind · producer · artifact count). A step whose final state was never
reported shows "pending"; an evidence.verify failure is kept as an honest note under the list, not
hidden. Run details are cached per attempt in the store.

### 5. The corner chat is a stub and says so on every message

`ScriptedAssistant` answers a handful of question shapes from live daemon data — attempt counts and
states, what's blocked (daemon first, then fixture gates labelled "not the daemon"), a project by
name/slug (daemon record + fixture note), daemon status, verified-this-week — and answers the fixed
"Not yet connected…" sentence to everything else. Ship-date questions are matched first and always
answered "No date I can back up"; the fixture's pencilled plan is quoted only as "a fixture, not a
commitment". Every reply carries a provenance and every assistant bubble is captioned
"ASSISTANT · SCRIPTED STUB". `ChatModel` holds local, in-memory conversations (no persistence, no
rooms) so the switcher and the full-screen `ChatScreen` have the right shape for phase 2/3.

The corner chat starts minimised (the cyan FAB) so the dashboard's right column is visible on launch.

### 6. What is static, and labelled static

The title-bar budget gauge is a hard-coded 38% with a STATIC badge (`StudioRootView.staticBudget`).
The Phases tab is a dashed "planned" panel with the phase schema and no controls.

## Consequences

* A reviewer can tell live from fixture from stub without reading code: it is printed on screen.
* Replacing the fixture with `portfolio.milestones` is a one-function change behind `ProjectTimeline`.
* Against the demo daemon (task-derived projects, no lifecycle stages, no evidence manifests) the
  dashboard honestly reads: projects = the daemon's count, verified = 0 of N runs (no manifests),
  reticle = fixture, plus a live-only "no milestones" row — which is exactly what that daemon knows.
