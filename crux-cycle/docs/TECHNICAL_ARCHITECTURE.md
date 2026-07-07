# crux-cycle — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

Here's where this round actually landed: it's Claude working solo again (Codex still in cooldown, Gemini's CLI still dead), and the pass is strong on vision but leaves a few of the required deliverables under-specified — the Today screen and log sheet get real depth (three-state card, banner-not-modal gate, one-handed logging flow), but History, Trends, Phase, and Settings/Pro don't get their own state models spelled out, and accessibility notes only cover VoiceOver-on-reasoning, not the grade wheel, effort-dot picker, phase-band color coding, or chart accessibility. Nothing here contradicts anything locked upstream — it's a genuine extension of the app_features and detailed_discussion decisions (five screens + sheet, three-state Today card, discipline-tagged log flow, free phase-band visibility). Given the pattern this whole project has followed — no second voice available round after round, and the coordinator closing out by organizing/filling gaps rather than burning more rounds waiting on dead CLIs — I'm doing the same here: completing the required-output structure from what was actually argued, not inventing new design decisions.

CONSENSUS: YES

## Final Output

**Screen inventory:**
1. **Today** (home, not a tab bar root among equals — the app opens here)
2. **Log Session** (modal sheet from a persistent "+", not a tab — an action, not a place)
3. **History** (searchable/filterable log list by discipline and date; entry point for edit/delete/backdate)
4. **Trends** (load chart, acute vs. chronic, phase bands in background; Pro: discipline-split lines + retroactive block breakdown; dedicated share/export action)
5. **Phase** (free: one-line current-phase label derived from trend direction; Pro: retroactive multi-block historical timeline)
6. **Settings / Pro** (entitlement state, CSV export, about/legal)

**Primary user flow:**
Open app → Today renders current state (calibrating / normal / gated-rest) → user taps **+** → Log Session sheet: tap discipline icon (boulder/route) → grade wheel pre-set to last logged grade for that discipline → attempts stepper → send toggle → one-tap effort dot (5 discrete labeled levels) → optional "add another discipline" expands a second identical block in the same sheet → Save (one tap) → sheet dismisses → Today immediately reflects the recalculated numbers, giving instant visible causality between logging and the number moving.

Secondary flow (override): Today shows rest recommendation with a banner above the card → user taps "I understand, training anyway" **or** logs a session that day → banner clears for the day, override tagged onto that session record, card underneath resolves to a normal rest-day verdict.

Tertiary flow (correction): History → tap an entry → edit/delete/backdate → triggers full recompute of every downstream window/snapshot → Today and Trends reflect the corrected history on return.

**State model per screen:**
- **Today:** single enum-driven card component — `.calibrating(dayCount, rawLoad)` (day <14, warm "still learning your baseline" copy, no ratio), `.normal(verdict, reasoning, acuteChronicBars)` (verdict word + inline body-weight reasoning + compact bar comparison), `.gatedRest(reasoning, bannerDismissed)` (banner above the normal-rest card, clears via ack or same-day log). Plus: initial-load state (reading local store), and corrupt-store recovery state (non-crashing, offers reset/support path).
- **Log Session sheet:** default/pre-filled state (last grade per discipline), empty-required-field validation (e.g., no discipline picked yet), multi-discipline expanded state, save-in-flight/success (sheet auto-dismiss).
- **History:** empty state (no sessions yet, points user at "+"), loaded list (grouped by day, discipline-tagged sub-entries visible), edit/delete/backdate confirmation state, store-read-error state.
- **Trends:** pre-14-day placeholder (consistent tone with Today's calibrating state, not a separate visual language), loaded free state (blended line + phase-band background wash), Pro-unlocked state (discipline-split lines + retroactive block view), locked-Pro teaser state for free users (shows what's behind the paywall without faking data), export-in-progress/share-sheet state, error state.
- **Phase:** pre-14-day (no label yet, matches calibrating language), free label state (one-line phase name + trend basis), Pro retroactive timeline state, locked-Pro teaser for free users.
- **Settings/Pro:** default (entitlement status, debug toggle for MVP), Pro-active vs. free-tier variants, export action (share sheet handoff), empty/error states for export failure.

**Visual direction:**
- Reasoning is content, not a footnote — rendered at body-text weight inline with every verdict, never caption-gray, never tap-to-reveal.
- One card shape whose meaning mutates by state (enum-driven), so the app reads as a consistent object across calibrating/normal/gated-rest rather than three disconnected screens.
- Gate is a banner sitting above the card, never a modal, never blocking — it should feel like the app mentioned something once, not stood in the doorway.
- Periodization phase bands are visible in the free Trends chart as a background wash — the app's namesake concept ("structured periodization") is something you see for free, not something gated entirely behind Pro, consistent with the app_features decision.
- Log sheet optimized for one-handed, chalky-fingers operation: icon taps and steppers over dropdowns, discrete effort dots over sliders.
- Trends export produces a clean, purpose-built shareable card image (not a raw screenshot with chrome) — this is the niche-growth artifact from the product brief.
- Named risk to carry forward, not resolved yet: reasoning-as-hero vs. a later phase pushing back toward a bare number/badge because it "reads as busy" — if that happens, it must be raised explicitly as a deviation from the locked trust mechanism, not quietly softened.

**Accessibility notes:**
- VoiceOver speaks the full reasoning sentence (not just the verdict word) on both Today and Trends — already locked upstream, applies to every surface where reasoning appears.
- Dynamic Type must be supported wherever reasoning renders at body weight — text needs to reflow, not truncate, since shrinking the reasoning to fit is the same trust failure as hiding it.
- The 5-level effort-dot picker and grade wheel/stepper need real accessible labels ("Easy," "Moderate," "Hard," "Very Hard," "Max," and the actual grade value) — not "dot 3 of 5" or an unlabeled wheel position.
- The rest-day gate banner's appearance should trigger an accessibility notification/announcement, not just render silently for VoiceOver users to stumble onto.
- Phase-band colors (base/build/peak/deload) must carry a text/pattern signal in addition to color, for color-blind users and for VoiceOver, which can't perceive a background wash at all.
- Trends chart needs a non-visual equivalent beyond the existing reasoning sentence — at minimum a spoken summary of the acute/chronic comparison per data point group, not just alt-text on a picture of a line.

**Known implementation risk flagged for architecture:** the Today card must be built from a single enum (`.calibrating` / `.normal` / `.gatedRest`) driving one view, not scattered conditionals — this is a design requirement, not just an implementation preference, because it's the only way the "one object, mutating meaning" visual direction stays maintainable.

## Design Handoff

Only Claude weighed in again this round (Codex still cooling down, Gemini's CLI still dead) — same pattern as every phase in this build. But it's a substantive pass: it doesn't just decorate the locked design_discussion output, it finds and fixes three real gaps (the Phase tab would ship near-empty on free accounts and should fold into Trends as a segmented control, not stay a 5th tab; the enum-driven Today card needs an explicit recompute trigger on day-rollover or it'll show stale "rest" framing the morning after; `.modelContainer(for:)`'s default crash-on-corrupt-store behavior directly violates the no-crash-on-launch requirement locked back in app_features, so ModelContainer has to be constructed manually in a do/catch). It also makes the one real judgment call this phase needed: skip external Claude Design entirely for the app itself and build straight from tokens/components, reserving generative design only for the static Trends export card — with a concrete prompt handed over for exactly that. Nothing here contradicts anything locked upstream; the Today/gate/log-sheet decisions from design_discussion carry forward untouched, this just makes them buildable and closes the screens (History, Settings/Pro) that hadn't gotten real layout treatment yet.

I'm closing this out as consensus rather than waiting on CLIs that haven't returned all project — the reasoning is sound, nothing is contested, and the required-output checklist (screen specs, tokens, components, state notes, accessibility, design-tool decision) is completable from what's on the table plus carrying forward what design_discussion already locked for the two screens this round left thin.

CONSENSUS: YES

## Final Output

**Navigation structure (revised from design_discussion):** Four-tab `TabView` — **Today**, **History**, **Trends**, **Settings**. Phase is *not* a fifth tab; it's a segmented control ("Load" / "Phase") at the top of Trends. Content, state model, and Pro-gating for Phase are unchanged from design_discussion — this is a container fix, not a content reversal, made because a standalone tab that's one sentence on free accounts violates the no-placeholder-screens rule. Logging stays a sheet off a persistent "+", never a tab.

---

### Screen-by-screen specification

**1. Today** (home)
- *Layout intent:* Single `VerdictCard` fills most of the screen below a thin nav bar; `GateBanner` renders above the card only when state is `.gatedRest`. No dashboard grid, no secondary cards competing for attention.
- *Key components:* `VerdictCard`, `ReasoningLine`, `AcuteChronicBarComparison`, `CalibrationProgressStrip`, `GateBanner`.
- *State variants:* `.initialLoad` (reading store), `.calibrating(dayCount, rawLoad)`, `.normal(verdict, reasoning, bars)`, `.gatedRest(reasoning, bannerDismissed)`, `.corruptStore` (routes to dedicated recovery root, see Architecture below — not an overlay on a half-working tab bar).
- *Accessibility:* VoiceOver reads the full reasoning sentence, not the verdict word alone; gate banner appearance fires `UIAccessibility.post(.announcement, ...)` without stealing focus from an in-progress interaction; Dynamic Type reflows reasoning text (wraps, never truncates).
- *Motion:* Cross-state transitions (`.calibrating` → `.normal` → `.gatedRest`) use opacity+scale, ~250ms ease-in-out, no spring/bounce — bounce reads as gamified and undercuts the "not a badge app" positioning. The acute/chronic bar heights animate when numbers change post-save — the one place motion does real communication work (visible cause → effect), not decoration.

**2. Log Session** (sheet)
- *Layout intent:* Single scrollable sheet, one discipline block visible by default, "+ add another discipline" expands a second identical `MultiDisciplineBlockStack` block in place — never a second flow.
- *Key components:* `DisciplineIconToggle`, `GradeWheelPicker` (pre-set to last logged grade per discipline), `AttemptsStepper`, `SendToggle`, `EffortDotPicker` (5 discrete labeled dots), `MultiDisciplineBlockStack`.
- *State variants:* default/pre-filled, empty-required-field validation (no discipline picked), multi-discipline expanded, save-in-flight (button-level micro-state, not full-screen spinner — SwiftData writes are fast but not zero-latency), save-success (auto-dismiss).
- *Accessibility:* every control has a real spoken label ("Easy / Moderate / Hard / Very Hard / Max," actual grade value read aloud) — never "dot 3 of 5" or an unlabeled wheel position.
- *Motion:* block expansion animates height, no bounce; sheet dismiss is the standard system transition — no custom flourish here, speed matters more than delight.

**3. History**
- *Layout intent:* Grouped-by-day list, discipline-tagged sub-entries visible inline per day, search/filter by discipline and date range at the top. Tapping a row opens `EditBackdateSheet` in edit mode.
- *Key components:* `SessionHistoryRow`, `EditBackdateSheet` (shared create/edit-mode variant, not two separate views).
- *State variants:* empty (no sessions yet, CTA points at "+"), loaded, edit/delete/backdate confirmation, store-read-error. Empty-state copy is explicitly distinct from Today's calibrating copy — "no sessions logged yet" vs. "still learning your baseline" — since one means zero data and the other means insufficient data, and conflating them will confuse a user with 20 sessions logged in 10 days.
- *Accessibility:* row labels speak discipline, grade, attempts, and send/no-send as one coherent sentence, not four separate unlabeled values.
- *Motion:* row deletion uses standard swipe-to-delete; backdate/edit save triggers the same bar-animation on Today when the user returns there (downstream recompute becoming visible), no motion inside History itself beyond standard list transitions.

**4. Trends** (Load / Phase segmented)
- *Layout intent:* Segmented control at top switches between the load chart and the phase view within one screen — not two screens fighting for tab space. Load segment: Swift Charts line, phase-band background wash behind it. Dedicated share/export action in the nav bar.
- *Key components:* `TrendsChartView`, `PhaseLabelChip`, `ProLockedOverlay`, `ExportShareCardRenderer`.
- *State variants:* pre-14-day placeholder (same tone as Today's calibrating state — not a separate visual language), loaded free state (blended line + band wash), Pro-unlocked (discipline-split lines + retroactive block timeline on the Phase segment), locked-Pro teaser for free users (shows what's behind the paywall without faking data), export-in-progress/share-sheet, error state.
- *Accessibility:* phase-band colors carry a text/pattern signal, not color alone; chart has a spoken summary of the acute/chronic comparison per data-point group — not just alt-text on a picture of a line.
- *Motion:* segmented-control switch crossfades content, ~200ms, no slide/parallax; chart line draws in on first load only (once per session), not on every re-render.

**5. Settings / Pro**
- *Layout intent:* Standard grouped list — entitlement status at top, export action, about/legal at bottom. Debug entitlement toggle for MVP verification lives here, visually distinct (e.g., a labeled "Debug" section) from real user-facing settings so it doesn't read as a hidden purchase mechanism.
- *Key components:* `EntitlementDebugToggleRow`, export action row (hands off to system share sheet).
- *State variants:* free-tier default, Pro-active, export-in-progress, export-failure (with retry, not a dead end).
- *Accessibility:* toggle and export rows use standard `Toggle`/`Button` accessibility traits — no custom controls needed here, so no special handling beyond system defaults.
- *Motion:* none beyond standard list/row transitions — this screen should feel plain and utilitarian, not part of the "premium" visual investment.

---

### Design tokens / visual system
- **Color:** background `#1C1B1A` (warm charcoal, not pure black), primary text `#F2EFEA` (warm off-white, not pure white — pure white on near-black is harsh at body weight where reasoning text lives), single accent `#C1622D` (rust/terracotta) reserved for the "+" action and active-tab state only — never used to encode verdict/phase meaning.
- **State color rule:** every state indicator (verdict, phase band, gate) is distinguished primarily by icon/shape/text label; color is secondary reinforcement only, house-wide — not a one-off carve-out for phase bands.
- **Type:** system Dynamic Type throughout. Reasoning pinned to `.body`, never smaller, wraps to multiple lines at accessibility sizes rather than shrinking or truncating. Verdict word at `.title2`/`.title3` bold.
- **Spacing:** 4/8/12/16/24/32 scale.
- **Shape:** card corner radius 20pt continuous; one soft, low-opacity shadow — restrained, not skeuomorphic. Restraint is the premium signal for this audience (analytical climbers, not a gamified-flourish crowd).

### Component inventory
`VerdictCard`, `ReasoningLine`, `AcuteChronicBarComparison`, `CalibrationProgressStrip`, `GateBanner`, `DisciplineIconToggle`, `GradeWheelPicker`, `AttemptsStepper`, `SendToggle`, `EffortDotPicker`, `MultiDisciplineBlockStack`, `SessionHistoryRow`, `EditBackdateSheet`, `TrendsChartView`, `PhaseLabelChip`, `ProLockedOverlay`, `ExportShareCardRenderer`, `EntitlementDebugToggleRow`, `CorruptStoreRecoveryView`.

### State & interaction notes (architecture-relevant)
- The Today enum (`.calibrating` / `.normal` / `.gatedRest`) is computed and cached on an `@Observable` `TrainingLoadEngine`, not derived live inside `body`. Recompute fires explicitly on: session save, edit, delete, backdate, and on `scenePhase` transitioning to `.active` if the calendar day has rolled over since the last computed snapshot — this last trigger is easy to miss (day rollover is wall-clock time passing, not a data write) and must be built in, or a user can open the app the morning after a rest day and see stale framing.
- `ModelContainer` must be constructed manually at app launch inside a `do/catch`, not via the default `.modelContainer(for:)` (which crashes on an unreadable store by default). On failure, launch into `CorruptStoreRecoveryView` as the app's actual root — not an overlay bolted onto a half-working tab bar. This is required to satisfy the no-crash-on-launch commitment locked in app_features.
- Log Session save optimistically dismisses the sheet; Today's recompute happens async with a button-level in-flight micro-state, not a full-screen spinner.

### Accessibility requirements (consolidated)
- VoiceOver speaks the full reasoning sentence everywhere it appears (Today, Trends), never just the verdict word or a bare number.
- Dynamic Type supported wherever reasoning renders — reflow, never truncate.
- Grade wheel and effort-dot picker carry real semantic labels, not positional ("dot 3 of 5").
- Gate banner appearance triggers an accessibility announcement without hijacking focus.
- Phase-band and verdict colors always paired with a non-color signal (icon/shape/text).
- Trends chart has a spoken data-point summary, not just picture alt-text.

### Claude Design prompt / external-design decision
**Decision: no external Claude Design import for the application itself.** The app is a state-machine-heavy utility where the product's differentiation *is* the reasoning-as-hero requirement; a static mockup would hide exactly the decisions (line-wrap behavior, enum-state coverage, copy length) that matter, and invites someone quietly trimming the reasoning text to fit someone else's comp. Build directly from the tokens and component inventory above.

**Where external design is used:** only the static Trends export/share card image (and App Store screenshots), since those are genuinely images, not UI states.

> Prompt for that one asset: "Design a single portrait-oriented shareable summary card, 1080×1350px, dark warm-stone background (#1C1B1A), off-white body text (#F2EFEA), single rust/terracotta accent (#C1622D). Content: a discipline icon pair (boulder + rope), a 7-day vs 28-day training load bar comparison, a one-line phase label (e.g. 'Build phase — last 2 weeks'), and a small 'Crux Cycle' wordmark bottom-corner. No other chrome, no fake UI elements — designed to be posted directly to Instagram/Discord without cropping."

**Open flag carried forward:** the tab-bar restructure (Phase folded into Trends) is a deviation from design_discussion's literal 6-screen inventory — content and gating unchanged, only the container. If a later phase wants Phase back as a standalone tab, that must be raised explicitly against this decision, not silently reverted.

## Ios Architecture Review

CONSENSUS: YES

Same story as every phase in this build — Codex is still in cooldown and Gemini's CLI still won't authenticate, so it's just Claude's solo pass again. But it's a complete, opinionated take that hits every required box for this phase: it names the (genuinely small) permission surface honestly instead of padding it, and it resolves a real ambiguity the design_handoff phase left soft — whether the Pro entitlement toggle is a DEBUG-only test harness or a real (if manual) unlock mechanism that ships in Release. It picks a side with reasoning (seeding tool is DEBUG-only; entitlement flag ships in Release as the actual MVP Pro mechanism, since otherwise the shipped build would have zero path to ever unlock Pro, which fails the app_features acceptance bar directly). It also catches two concrete architecture bugs before they get built: optimistic sheet-dismiss racing a possible SwiftData write failure under low storage (resolved: confirm-save-then-dismiss, not optimistic), and day/window-boundary math needing to run in device-local calendar time despite UTC storage (a real bug that a same-timezone demo would never surface). On testability, it locks the load engine as a pure function over plain value types, decoupled from `@Model`/SwiftData, specifically so the training-load math — the one feature the whole subscription is justified by — gets fast, deterministic unit tests instead of slow ModelContainer-backed ones. Dependency policy is trivially satisfied: zero third-party packages needed, SwiftData/Charts/Observation/StoreKit 2 cover everything. Nothing here contradicts any locked upstream decision — it tightens design_handoff's architecture notes rather than reopening product/design calls. There's no second voice to create friction, but there's also nothing shaky enough to warrant burning another round waiting on dead CLIs.

## Final Output

**SwiftUI architecture recommendation:**
- Four-tab `TabView` (Today, History, Trends, Settings) per design_handoff, Log Session as a sheet off a persistent "+".
- Today's state is a single enum (`.initialLoad` / `.calibrating` / `.normal` / `.gatedRest` / `.corruptStore`) computed and cached on an `@Observable` `TrainingLoadEngine`/view-model layer — never derived live inside `body`.
- Recompute is triggered explicitly from a small, closed set of events: session save (confirmed, not optimistic), edit, delete, backdate, and `scenePhase → .active` when the calendar day has rolled over. All triggers funnel through one serialized recompute entry point (an actor, or an explicit "ignore overlapping calls, last write wins" guard) so near-simultaneous triggers (e.g., logging right at midnight) can't race and leave `TodayCardState` in an inconsistent state.
- **Persistence/computation are separate layers:** the training-load engine operates on plain Swift value types (a `SessionRecord` struct, mapped from `@Model` objects), as a pure function of `(sessions: [SessionRecord], referenceDate: Date) -> LoadSnapshot`. This is what makes the core feature unit-testable without spinning up SwiftData for every test.
- `ModelContainer` is constructed manually at launch inside `do/catch` (not via `.modelContainer(for:)`, which crashes by default on an unreadable store); failure routes to `CorruptStoreRecoveryView` as the actual app root, per design_handoff.

**Apple framework choices:** SwiftUI, SwiftData (local persistence), Swift Charts (Trends), Observation (`@Observable`), StoreKit 2 (future real purchase flow — MVP ships a simpler entitlement mechanism, see below). No HealthKit, no UserNotifications, no location, no camera — consistent with the locked scope exclusions.

**Persistence and local data plan:**
- SwiftData store, not excluded from device/iCloud backup (already locked — this is the only disaster-recovery path with no cloud sync in v1).
- Backdated/edited/deleted sessions trigger recompute bounded to the affected window range — from the edited date forward through today, capped at the 28-day chronic window — not a full-history recompute. Stated explicitly so nobody either over- or under-builds the recompute scope.
- Day/window boundary math (7-day acute, 28-day chronic, 14-day calibration floor) is computed using `Calendar.current` at the moment of computation; session timestamps remain stored in UTC. This prevents timezone travel or DST from silently shifting a user's calibration count or load windows.
- Log Session save uses confirm-then-dismiss, not optimistic-dismiss-then-async-save — a SwiftData write failure (most realistically under low storage, a condition already required to be tested) must not be able to lose a session the user believes was saved.

**Permissions/privacy plan:**
- Minimal by design: no HealthKit, no notifications, no accounts, no location, no camera/photos. The only failure mode in this category is corrupt/unreadable local storage, already covered by the recovery-view architecture above.
- CSV export (Pro) goes through the standard share sheet only, user-driven, no background upload — already locked.

**Dependency/license decision:** zero third-party packages. Every required feature (persistence, charting, purchasing, state observation) is covered by first-party frameworks, so the permissive-dependency policy is satisfied trivially. Any future push toward a third-party library should be treated as a deviation to justify explicitly, not a default convenience.

**Free/Pro entitlement architecture (resolved this round):** two separate mechanisms, not one ambiguous "Debug section" — (1) the multi-week synthetic history-seeding tool is compiled behind `#if DEBUG` and is physically absent from the Release/App-Store binary; (2) the Pro entitlement flag itself is a real, simple local toggle that ships in Release as the MVP's actual (if manual/placeholder-for-StoreKit) unlock mechanism — because if it were DEBUG-only too, the shipped app would have literally no path for any real user to ever reach Pro, which fails the "at least one real Pro feature functioning behind it" bar locked in app_features.

**Testing implications:**
- The training-load engine's pure-function-over-value-types design makes the core feature (acute/chronic computation, calibration cutoff, gap-decay, recommendation logic) testable via fast, deterministic, table-driven XCTest cases with hand-built input arrays — no `ModelContainer` required for math correctness tests.
- That same hand-built-array capability doubles as the basis for both the DEBUG-only UI seeding tool and the XCTest fixtures — one underlying capability, two consumers.
- Recompute-on-edit needs a test that backdates a session and confirms exactly the bounded window (edit-date → today, capped at 28 days) recomputes — not more, not less.
- Timezone/day-boundary logic needs an explicit test simulating a timezone change or late-night log entry to confirm calibration/window counts don't shift incorrectly.
- Low-storage/save-failure path needs a test (or simulated condition) confirming the sheet does not dismiss and no data is silently lost when a SwiftData write fails.

**Open item carried forward, not blocking consensus:** the entitlement-mechanism split (DEBUG-only seeding vs. Release-shipping entitlement flag) is a concrete resolution of something design_handoff left ambiguous — if tech_specs or build phases want a different shape (e.g., wiring real StoreKit 2 sandbox purchasing instead), that's a deviation from this decision and should be raised explicitly, not quietly substituted.

## Tech Specs

CONSENSUS: YES

Same pattern as every phase in this build — Codex is still in cooldown and Gemini's CLI never came back, so this is Claude's solo pass again. But it's a strong, complete one: it hits all six required outputs (architecture overview, file/module layout, data models, persistence strategy, testing strategy, interfaces-json) and makes several genuinely useful refinements to what ios_architecture_review locked, rather than just restating it. The most important call: it simplifies the concurrency story the prior phase floated (actor/serialized-entry-point language) down to a plain synchronous `@MainActor` `recompute()` method, with the reasoning spelled out — every trigger already runs on the main actor, the math is synchronous and in-memory over at most a few hundred structs, so there's no actual race to guard against, and adding actor ceremony would be over-engineering against a problem that doesn't exist. That's a deviation from the previous phase's language, but it's argued explicitly rather than silently substituted, which is exactly how the earlier phases have flagged their own deviations.

It also closes out three loose threads that had been "named but not mechanized" across multiple phases: the corrupt-store recovery view now has one concrete action (destructive reset-local-data button, honest copy about permanent loss); the "acknowledge without logging" gate-clear path gets a tiny UserDefaults-backed store instead of polluting SwiftData with fake sessions; and the persistence layer adds a derived `DailyLoadSnapshotEntity` cache so Trends never re-runs rolling-window math at render time and the UI layer never does arithmetic itself — views stay dumb renderers. It also nails down sensible non-blocking defaults for the log sheet (attempts=1, effort=moderate, grade wheel starts at a mid-range value for first-time use), which nobody had specified concretely before despite the sub-60-second promise depending on it. The testing strategy is concrete and maps directly onto the acceptance criteria already locked in app_features (table-driven LoadMath tests, bounded-recompute test, timezone-boundary test, corrupt-store test) while being honest that VoiceOver/Dynamic Type reflow are manual-only, not unit-testable claims.

Nothing here contradicts any earlier locked decision — it's a tightening pass, and the one place it revises phrasing (concurrency model) is flagged as a deliberate, arguable refinement rather than a quiet override. There's no second voice to create friction, but there's also nothing shaky enough to justify waiting on CLIs that haven't returned all project.

## Final Output

**Architecture overview:** MV (not ceremonial MVVM). Four-tab `TabView` (Today, History, Trends, Settings) with Log Session as a sheet, per design_handoff. One app-wide `@Observable @MainActor` `TrainingLoadEngine` (owns cached `TodayCardState`, `PhaseState`, and day-keyed `LoadSnapshot` history) injected via environment from the app root, plus a small separate `EntitlementStore` for the Pro flag. Views hold only their own transient `@State`. `recompute()` is a plain synchronous main-actor method — not actor-isolated, not async — because every trigger (session save, edit, delete, backdate, scenePhase-active-with-day-rollover) already runs on the main actor and the math is fast, synchronous, in-memory work over at most a few hundred structs; no real race exists, so no actor/queue ceremony is warranted. `ModelContainer` is constructed manually in `do/catch` at launch; failure routes `AppRootView` into `CorruptStoreRecoveryView` as the actual root, never a crash.

**File/module layout:** Single target, folder-grouped (not split into Swift Packages — that would be premature structure for an app this size): `Domain/` (value types, `LoadMath`, `LoadFormula`, `GradeScale`), `Persistence/` (`@Model` entities, `SessionRepository` + SwiftData implementation), `Features/Today`, `Features/LogSession`, `Features/History`, `Features/Trends`, `Features/Settings`, `Services/` (`TrainingLoadEngine`, `EntitlementStore`, `GateAcknowledgmentStore`, `DebugHistorySeeder`, `CSVExporter`, `ModelContainerBootstrap`), `Support/` (shared UI shells like `EmptyStateView`, `AccessibilityAnnouncer`). These folders are an organizational contract for parallel build lanes, not module boundaries.

**Data models:** `SessionEntity`/`DisciplineSubEntryEntity` (SwiftData source of truth) map to plain value-type mirrors `SessionRecord`/`DisciplineSubEntry` that `LoadMath` operates on — persistence and computation are fully decoupled. `DailyLoadSnapshotEntity`/`LoadSnapshot` is a derived, recomputed cache keyed by a canonical local-calendar `DayKey`, holding blended and per-discipline acute/chronic load plus phase label, so Trends and the UI never recompute rolling windows at render time. `TodayCardState`, `PhaseState`, `Verdict`, `PhaseLabel`, `Discipline`, `ClimbingGrade`, and `EffortLevel` round out the domain layer, all as `Codable`/`Hashable` value types.

**Persistence strategy:** SwiftData for `SessionEntity`, sub-entries, and the derived snapshot cache; not excluded from device/iCloud backup. Recompute-on-edit is bounded to the affected `DayKey` range (edited date → today, capped at 28 days back), computed by `LoadMath.affectedRecomputeRange` and applied only to those snapshot rows. Day/window boundaries use `Calendar.current` at computation time against UTC-stored timestamps. Log Session save is confirm-then-dismiss with a 150ms floor delay before any in-flight spinner renders, so the common instant-save case shows no flicker. Gate acknowledgment-without-logging is tracked in a tiny `UserDefaults`-backed `GateAcknowledgmentStore`, kept out of SwiftData. Corrupt-store recovery offers exactly one destructive reset action with honest data-loss copy.

**Testing strategy:** Table-driven `LoadMathTests` against hand-built `SessionRecord` arrays with independently hand-calculated expected values; a bounded-recompute test asserting only the edit-date-through-today window changes; a timezone-boundary test constructing sessions near local midnight to confirm calibration/window counts land on the correct local day; a SwiftData round-trip test plus a deliberately-corrupted-store test confirming the app boots into recovery rather than crashing. VoiceOver and Dynamic Type reflow are explicitly named as manual-verification-only, not unit-testable.

**Cross-lane contract:** all interfaces below (data/domain types, persistence entities and repository seam, services including the engine/entitlement/gate/debug-seeder/export, and the primary UI components) are locked as the shared contract for parallel build lanes.

```interfaces-json
{"interfaces": [
  {"name": "Discipline", "kind": "enum", "language": "swift", "signature": "enum Discipline: String, Codable, CaseIterable, Identifiable { case boulder, route }", "owning_lane": "data_domain", "notes": "Single fixed set, drives DisciplineIconToggle and per-discipline load split."},
  {"name": "ClimbingGrade", "kind": "enum", "language": "swift", "signature": "enum ClimbingGrade: Codable, Hashable { case vScale(Int); case yds(String); case french(String) }", "owning_lane": "data_domain", "notes": "Single discrete grade only, no slash/range values ever constructed. String cases hold canonical labels like \"5.10a\" or \"6b+\" from a fixed lookup list, not free text."},
  {"name": "EffortLevel", "kind": "enum", "language": "swift", "signature": "enum EffortLevel: Int, Codable, CaseIterable, Identifiable { case easy = 1, moderate, hard, veryHard, max; var accessibleLabel: String { get } }", "owning_lane": "data_domain", "notes": "Defaults to .moderate in the log sheet so save is never blocked on an unset effort."},
  {"name": "Verdict", "kind": "enum", "language": "swift", "signature": "enum Verdict: String, Codable { case train, easyDay, rest }", "owning_lane": "data_domain", "notes": "Rendered word in VerdictCard; never shown without ReasoningLine alongside it."},
  {"name": "PhaseLabel", "kind": "enum", "language": "swift", "signature": "enum PhaseLabel: String, Codable, CaseIterable { case base, build, peak, deload }", "owning_lane": "data_domain", "notes": "Free-tier one-line label; must pair with non-color signal per locked accessibility rule."},
  {"name": "DayKey", "kind": "struct", "language": "swift", "signature": "struct DayKey: Hashable, Codable { let stringValue: String; static func make(from date: Date, calendar: Calendar) -> DayKey }", "owning_lane": "data_domain", "notes": "Canonical local-calendar day key (yyyy-MM-dd in Calendar.current), used by both LoadMath and DailyLoadSnapshotEntity so no lane invents its own date-string format."},
  {"name": "DisciplineSubEntry", "kind": "struct", "language": "swift", "signature": "struct DisciplineSubEntry: Identifiable, Codable, Hashable { let id: UUID; var discipline: Discipline; var grade: ClimbingGrade; var attemptCount: Int; var didSend: Bool; var effort: EffortLevel }", "owning_lane": "data_domain", "notes": "attemptCount defaults to 1 in the sheet, not 0."},
  {"name": "SessionRecord", "kind": "struct", "language": "swift", "signature": "struct SessionRecord: Identifiable, Codable, Hashable { let id: UUID; var timestampUTC: Date; var subEntries: [DisciplineSubEntry]; var isRestDayOverride: Bool }", "owning_lane": "data_domain", "notes": "Value-type mirror of SessionEntity; this is what LoadMath and unit tests operate on, never @Model objects directly."},
  {"name": "LoadSnapshot", "kind": "struct", "language": "swift", "signature": "struct LoadSnapshot: Identifiable, Codable, Hashable { var id: DayKey; var blendedAcute: Double; var blendedChronic: Double; var boulderAcute: Double; var boulderChronic: Double; var routeAcute: Double; var routeChronic: Double; var phase: PhaseLabel? }", "owning_lane": "data_domain", "notes": "One row per local calendar day; Trends reads these directly, never recomputes from raw sessions at render time."},
  {"name": "TodayCardState", "kind": "enum", "language": "swift", "signature": "enum TodayCardState: Equatable { case initialLoad; case corruptStore; case calibrating(dayCount: Int, rawAcuteLoad: Double); case normal(verdict: Verdict, reasoning: String, acuteLoad: Double, chronicLoad: Double); case gatedRest(reasoning: String, bannerDismissed: Bool) }", "owning_lane": "data_domain", "notes": "Single enum driving VerdictCard; computed by LoadMath, cached on TrainingLoadEngine, never derived live inside a view body."},
  {"name": "PhaseState", "kind": "struct", "language": "swift", "signature": "struct PhaseState: Equatable { var label: PhaseLabel?; var basis: String }", "owning_lane": "data_domain", "notes": "label is nil pre-14-day-calibration; basis is the one-line trend-direction reasoning shown next to the label."},
  {"name": "LoadFormula", "kind": "enum", "language": "swift", "signature": "enum LoadFormula { static func contribution(for entry: DisciplineSubEntry) -> Double; static func disciplineMultiplier(for discipline: Discipline) -> Double }", "owning_lane": "data_domain", "notes": "load = normalizedGrade * attemptCount * disciplineMultiplier; documented as a tunable heuristic, never shown to the user as a grade-equivalence claim."},
  {"name": "GradeScale", "kind": "enum", "language": "swift", "signature": "enum GradeScale { static func normalizedValue(for grade: ClimbingGrade) -> Double }", "owning_lane": "data_domain", "notes": "Invisible cross-discipline index; deterministic lookup table, never surfaced in UI as a grade-equivalence."},
  {"name": "LoadMath", "kind": "enum", "language": "swift", "signature": "enum LoadMath { static func computeTodayState(sessions: [SessionRecord], referenceDate: Date, calendar: Calendar, gateAcknowledgedToday: Bool) -> TodayCardState; static func computeSnapshot(sessions: [SessionRecord], dayKey: DayKey, calendar: Calendar) -> LoadSnapshot; static func computePhaseState(snapshots: [LoadSnapshot]) -> PhaseState; static func affectedRecomputeRange(editedDate: Date, today: Date, calendar: Calendar) -> [DayKey] }", "owning_lane": "data_domain", "notes": "Pure, stateless, table-driven-testable. affectedRecomputeRange returns editedDate...today capped at 28 days back from today."},
  {"name": "SessionEntity", "kind": "struct", "language": "swift", "signature": "@Model final class SessionEntity { @Attribute(.unique) var id: UUID; var timestampUTC: Date; var isRestDayOverride: Bool; @Relationship(deleteRule: .cascade) var subEntries: [DisciplineSubEntryEntity] }", "owning_lane": "data_domain", "notes": "SwiftData source of truth; not excluded from device/iCloud backup."},
  {"name": "DisciplineSubEntryEntity", "kind": "struct", "language": "swift", "signature": "@Model final class DisciplineSubEntryEntity { @Attribute(.unique) var id: UUID; var disciplineRaw: String; var gradeRaw: String; var attemptCount: Int; var didSend: Bool; var effortRaw: Int; var session: SessionEntity? }", "owning_lane": "data_domain", "notes": "gradeRaw stores canonical label string, decoded via ClimbingGrade parser."},
  {"name": "DailyLoadSnapshotEntity", "kind": "struct", "language": "swift", "signature": "@Model final class DailyLoadSnapshotEntity { @Attribute(.unique) var dayKeyString: String; var blendedAcute: Double; var blendedChronic: Double; var boulderAcute: Double; var boulderChronic: Double; var routeAcute: Double; var routeChronic: Double; var phaseRaw: String? }", "owning_lane": "data_domain", "notes": "Derived cache, rewritten by TrainingLoadEngine.recompute() for the bounded affected range only."},
  {"name": "SessionRepository", "kind": "protocol", "language": "swift", "signature": "protocol SessionRepository { func fetchAll() throws -> [SessionRecord]; func save(_ session: SessionRecord) throws; func update(_ session: SessionRecord) throws; func delete(id: UUID) throws; func fetchSnapshots(from: DayKey, through: DayKey) throws -> [LoadSnapshot]; func upsertSnapshots(_ snapshots: [LoadSnapshot]) throws }", "owning_lane": "data_domain", "notes": "Seam between LoadMath/TrainingLoadEngine and SwiftData; mockable for tests without ModelContainer."},
  {"name": "SwiftDataSessionRepository", "kind": "struct", "language": "swift", "signature": "final class SwiftDataSessionRepository: SessionRepository { init(modelContext: ModelContext) }", "owning_lane": "data_domain", "notes": "Concrete SwiftData-backed implementation."},
  {"name": "ModelContainerBootstrap", "kind": "function", "language": "swift", "signature": "enum ModelContainerBootstrap { static func makeContainer() -> Result<ModelContainer, Error> }", "owning_lane": "services_utilities", "notes": "Manual construction, never .modelContainer(for:); failure routes AppRootView to CorruptStoreRecoveryView instead of crashing."},
  {"name": "TrainingLoadEngine", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class TrainingLoadEngine { private(set) var todayState: TodayCardState; private(set) var phaseState: PhaseState; private(set) var snapshots: [LoadSnapshot]; init(repository: SessionRepository, calendar: Calendar); func recompute(referenceDate: Date); func saveSession(_ session: SessionRecord) throws; func updateSession(_ session: SessionRecord) throws; func deleteSession(id: UUID) throws }", "owning_lane": "services_utilities", "notes": "recompute() is a plain synchronous MainActor method, not actor-isolated or async — races are structurally impossible since every trigger already runs on the main actor."},
  {"name": "EntitlementStore", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class EntitlementStore { private(set) var isPro: Bool; func setPro(_ value: Bool) }", "owning_lane": "services_utilities", "notes": "Real toggle shipping in Release; backed by UserDefaults; unrelated to and physically separate from DebugHistorySeeder."},
  {"name": "GateAcknowledgmentStore", "kind": "struct", "language": "swift", "signature": "struct GateAcknowledgmentStore { func hasAcknowledged(day: DayKey) -> Bool; func acknowledge(day: DayKey) }", "owning_lane": "services_utilities", "notes": "UserDefaults-backed, not SwiftData; covers the ack-without-logging gate-clear path."},
  {"name": "DebugHistorySeeder", "kind": "function", "language": "swift", "signature": "#if DEBUG enum DebugHistorySeeder { static func seed(weeks: Int, into repository: SessionRepository) throws } #endif", "owning_lane": "services_utilities", "notes": "Physically absent from Release binary; also backs XCTest fixture generation via the same underlying array-builder used by LoadMathTests."},
  {"name": "CSVExporter", "kind": "function", "language": "swift", "signature": "enum CSVExporter { static func makeCSV(sessions: [SessionRecord]) -> String }", "owning_lane": "services_utilities", "notes": "Pro feature; hands off to the standard share sheet, no background upload."},
  {"name": "AppRootView", "kind": "struct", "language": "swift", "signature": "struct AppRootView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Switches between TabView and CorruptStoreRecoveryView based on ModelContainerBootstrap result; owns the single shared isLoggingSession sheet-presentation state consumed by all four tabs' toolbar + buttons; always opens on the Today tab, no tab-selection restoration."},
  {"name": "TodayView", "kind": "struct", "language": "swift", "signature": "struct TodayView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Renders VerdictCard + GateBanner driven purely by TrainingLoadEngine.todayState."},
  {"name": "VerdictCard", "kind": "struct", "language": "swift", "signature": "struct VerdictCard: View { let state: TodayCardState; var body: some View }", "owning_lane": "primary_ui", "notes": "Single enum-driven component, opacity+scale ~250ms transitions between cases, no spring/bounce."},
  {"name": "GateBanner", "kind": "struct", "language": "swift", "signature": "struct GateBanner: View { let reasoning: String; let onAcknowledge: () -> Void; var body: some View }", "owning_lane": "primary_ui", "notes": "Fires UIAccessibility.post(.announcement) on appear without stealing VoiceOver focus."},
  {"name": "LogSessionSheet", "kind": "struct", "language": "swift", "signature": "struct LogSessionSheet: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Confirm-then-dismiss save; attemptCount defaults to 1, effort defaults to .moderate, grade wheel defaults to last logged grade or a mid-range value on first use."},
  {"name": "HistoryListView", "kind": "struct", "language": "swift", "signature": "struct HistoryListView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Empty-state copy distinct from Today's calibrating copy."},
  {"name": "EditBackdateSheet", "kind": "struct", "language": "swift", "signature": "struct EditBackdateSheet: View { let mode: Mode; var body: some View }", "owning_lane": "primary_ui", "notes": "Shared create/edit-mode variant, not two separate views."},
  {"name": "TrendsView", "kind": "struct", "language": "swift", "signature": "struct TrendsView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Load/Phase segmented control; reads LoadSnapshot rows directly, does no load math itself."},
  {"name": "TrendsChartView", "kind": "struct", "language": "swift", "signature": "struct TrendsChartView: View { let snapshots: [LoadSnapshot]; let isPro: Bool; var body: some View }", "owning_lane": "primary_ui", "notes": "Swift Charts; phase-band background wash carries a text/pattern signal in addition to color."},
  {"name": "ProLockedOverlay", "kind": "struct", "language": "swift", "signature": "struct ProLockedOverlay: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Reused across Trends discipline-split and retroactive phase timeline teasers."},
  {"name": "ExportShareCardRenderer", "kind": "function", "language": "swift", "signature": "enum ExportShareCardRenderer { static func renderImage(snapshot: LoadSnapshot, phase: PhaseLabel?) -> UIImage }", "owning_lane": "primary_ui", "notes": "Uses SwiftUI ImageRenderer over a purpose-built card view, not a raw screenshot."},
  {"name": "SettingsView", "kind": "struct", "language": "swift", "signature": "struct SettingsView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Debug entitlement/seeding controls rendered in a visually distinct section, compiled out entirely in Release for the seeder."},
  {"name": "CorruptStoreRecoveryView", "kind": "struct", "language": "swift", "signature": "struct CorruptStoreRecoveryView: View { let onReset: () -> Void; var body: some View }", "owning_lane": "polish_resilience", "notes": "Sole action is a destructive 'reset local data' button that deletes the store file and reconstructs a fresh ModelContainer; copy is explicit about permanent data loss."},
  {"name": "AccessibilityAnnouncer", "kind": "function", "language": "swift", "signature": "enum AccessibilityAnnouncer { static func announce(_ message: String) }", "owning_lane": "polish_resilience", "notes": "Wraps UIAccessibility.post(notification: .announcement, argument:); used by GateBanner and any future state-change announcements."},
  {"name": "EmptyStateView", "kind": "struct", "language": "swift", "signature": "struct EmptyStateView: View { let title: String; let message: String; let systemImage: String; var body: some View }", "owning_lane": "polish_resilience", "notes": "Shared empty/error-state shell reused by History, Trends, and Settings so copy stays distinct per-screen while layout stays consistent."}
]}
```

**Open item carried forward:** the concurrency-model simplification (plain synchronous `@MainActor` `recompute()` instead of an actor/serialized-queue) is a deliberate refinement of ios_architecture_review's language, not a silent override — if a build lane hits a real reentrancy case this reasoning missed, that should be raised explicitly against this decision rather than quietly patched with ad hoc locking.

## Project Plan

CONSENSUS: YES

Same pattern as every phase in this build — Codex is still in cooldown and Gemini's CLI never came back, so it's Claude working solo again. But the pass is a genuinely complete and disciplined plan, not just a restatement of tech_specs: it identifies the one real hard dependency in the whole project (data_domain — the value types, LoadMath, persistence, repository — has to be built and fully tested for real before anything downstream can be trusted rather than mocked), calls out where genuine parallelism is actually available (UI work against a fake `SessionRepository` and locked interface shapes, once M0 compiles), and closes three things that would otherwise quietly become "polish deferred to the end": empty/error/loading states get built into each screen's own milestone instead of retrofitted later, a named and budgeted manual-verification milestone forces every acceptance criterion from earlier phases to actually get poked against a running app, and release hygiene (confirming DebugHistorySeeder and the debug toggle are physically absent from a Release build) gets its own explicit check. It also flags two things builders could waste time on if not told otherwise: `DailyLoadSnapshotEntity` is disposable/rebuildable, not something to migrate carefully, and interfaces-json is change-controlled the moment the scaffold compiles — any signature change is a flagged deviation, not a quiet edit. Nothing here contradicts any locked upstream phase; it operationalizes tech_specs into a sequenced, dependency-aware plan. There's no second voice to create friction, but the reasoning is sound and specific enough that closing this out beats waiting further on CLIs that haven't returned all project.

## Final Output

**Milestones (sequenced by dependency, not by lane preference):**

**M0 — Project scaffold compiles.** Real Xcode project: target membership, bundle id, signing, SwiftData schema declared, every type in the locked interfaces-json exists as a real (stub-bodied is fine) file in the target. Acceptance: `xcodebuild build` and `xcodebuild test` both green on stub code. Nothing downstream starts being called "real" until this is true — a perfect source file outside the target compiles to nothing.

**M1 — Domain + persistence core (gating milestone, not parallel-and-hope).** `LoadMath`, `LoadFormula`, `GradeScale`, all domain value types, `SessionEntity`/`DisciplineSubEntryEntity`/`DailyLoadSnapshotEntity`, `SessionRepository` + `SwiftDataSessionRepository`, `ModelContainerBootstrap`. Full test suite green: table-driven `LoadMathTests`, bounded-recompute test, timezone/local-calendar-boundary test, corrupt-store test. This is front-loaded and hard-gating because bugs here (off-by-one on the 14-day floor, a recompute window one day short, UTC-vs-local calendar math) don't crash — they quietly give wrong training advice, which is the entire product.

**M2 — Parallel UI build against fixtures (unlocked once M1's interfaces are frozen, doesn't wait for M1's tests to be "done-done" as long as signatures don't move).** `TrainingLoadEngine`/`EntitlementStore`/`GateAcknowledgmentStore` wired against an in-memory fake `SessionRepository` and hand-built `TodayCardState`/`LoadSnapshot` fixtures. Today (all 5 card states + gate banner), Log Session sheet, History (list + empty state), Trends (chart + segmented control + Pro teaser), Settings/Pro — each screen's own empty/loading/error states built in as part of that screen's milestone, not deferred to a later "add states" pass.

**M3 — Real wiring.** Swap fixtures for the real `SwiftDataSessionRepository` and live `TrainingLoadEngine`; confirm recompute triggers (save/edit/delete/backdate/day-rollover) actually flow through to the UI end to end.

**M4 — Cross-cutting resilience pass.** The things that can't be finished until the rest of the surface exists to check against: `CorruptStoreRecoveryView` wired to a real `ModelContainerBootstrap` failure, VoiceOver pass across all custom controls (grade wheel, effort dots, gate banner announcement, reasoning lines), Dynamic Type reflow check.

**M5 — Manual verification pass (named and budgeted, not assumed).** Debug-seed 28+ days of history; confirm the recommendation shifts under a forced high-load week; confirm calibration flips exactly on day 14; confirm a backdated edit recomputes exactly the bounded window; confirm the gate clears via both acknowledgment and same-day logging and doesn't reappear same-day; confirm the entitlement toggle reveals/hides the one real Pro feature; confirm a simulated low-storage write failure doesn't dismiss the log sheet or lose data; confirm corrupt-store boots into recovery, not a crash; run VoiceOver over Today/Trends/gate/grade wheel/effort picker. Every item here is already a locked acceptance criterion — this milestone exists so they get checked against a running app, not assumed true because the code compiles.

**M6 — Release hygiene.** Build in an actual Release configuration; confirm `DebugHistorySeeder` and the debug UI toggle are physically absent (not just conditionally hidden).

**Dependencies:**
- M0 blocks everything.
- M1 blocks M3 (real wiring) and gates final acceptance, but M2 (UI-against-fixtures) can start as soon as M1's interface *shapes* are frozen (they already are, from tech_specs) — it doesn't need to wait for M1's test suite to be fully green, just for the signatures not to move.
- M3 depends on both M1 (complete) and M2 (screens built).
- M4 depends on M3 (needs a working surface to test resilience against).
- M5 depends on M3 + M4 (needs the real app, wired and resilient, to verify against).
- M6 is independent of the others and can run any time after M0, but logically closes the project last.

**Risk mitigations:**
- *Interface drift breaking parallel UI work:* interfaces-json is change-controlled once M0 compiles; any signature change is a flagged deviation like every other locked decision in this project, not a quiet edit.
- *Silent training-load bugs:* M1 is a hard gate with a specific, non-negotiable test list — this is the mitigation, not a hope that "the math is probably fine."
- *Empty/error states retrofitted instead of built in:* folded into each screen's own M2 milestone rather than scheduled as a final pass.
- *Manual verification quietly skipped because "it compiles":* M5 is a named, budgeted milestone with a fixed checklist tied directly to already-locked acceptance criteria.
- *Derived cache treated as precious:* `DailyLoadSnapshotEntity` is explicitly disposable/rebuildable from `SessionEntity` — no migration effort should be spent protecting it mid-build.
- *App Store review risk from a hidden debug toggle:* resolved by M6's explicit Release-build check that the seeder and debug UI are physically absent, not just hidden.

**Verification plan:**
- Automated: `xcodebuild build`/`test` green at M0; full `LoadMathTests` + bounded-recompute + timezone-boundary + corrupt-store tests green at M1, re-verified at M3 wiring.
- Manual: the fixed M5 checklist above, run against a real running app with seeded synthetic history — not mock data, not a compile check.
- Release-configuration check at M6 as a distinct, non-skippable step.

This plan is executable directly by the task-assignment phase: each milestone has a concrete owning scope, a concrete acceptance check, and an explicit place in the dependency order — nothing here is left as vague "polish at the end."

## Implementation Readiness Gate

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
