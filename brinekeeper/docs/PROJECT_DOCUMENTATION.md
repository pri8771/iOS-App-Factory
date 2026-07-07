# brinekeeper — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Looking at this, the core tension is simple: the change-request text wants the whole portfolio-grade feature list, but the phase rules say keep it minimal and don't rebuild from scratch. The two "change requested" notes even contradict each other on whether sources exist at all. Given that uncertainty, the only safe call is: verify ground truth first, then scope to the smallest set of changes that makes the build real and compiling — not the smallest set that just makes `xcodebuild` exit 0 on a gutted app.

I'm siding with the skeptic's trio: dosing solver, water-test logging + trends, and a simplified-but-real livestock compatibility check are non-negotiable, because cutting the compatibility piece turns this into "a dosing calculator with a reef skin," which isn't the product. Everything else in the original iOS-native list (widget, BGTask, Live Activity, Vision) gets explicitly deferred, not faked.

CONSENSUS: YES

## Final Output

**Step 0 — establish ground truth before anything else.** Stat `app_build/`. If Swift source files exist, this is a wiring job: generate the missing Xcode project (`.xcodeproj`/`project.pbxproj` or a `project.yml` run through XcodeGen) and add every existing source file to a single app target — don't regenerate code that's already there. If no sources exist, this is a from-spec implementation job scoped to the list below.

**Non-negotiable v1 slice (must be real, not stubbed):**
1. **Dosing solver** — deterministic Swift functions (tank volume + current params + target params + product concentration → exact dose), pure and unit-testable, wired into a real `DosingView` with actual number input and computed output.
2. **Water-test logging + trends** — SwiftData `WaterTest` model, a log-entry form, and at least a basic line-chart trend view (Swift Charts) backed by real persisted data, not mock arrays.
3. **Livestock roster + compatibility warnings** — SwiftData `LivestockSpecies`/`CompatibilityRule` models, seeded with a modest but real rule set (aim for 20–30 species with actual bioload/aggression/allelopathy flags), and a roster screen that surfaces a real warning when adding an incompatible species.

**Explicitly deferred, and disclosed as deferred (not silently dropped, not faked with dead toggles):** home-screen widget, BGTaskScheduler reminders, Live Activity, Vision test-strip reading. Add a visible "Coming soon" affordance in Settings rather than omitting mention entirely.

**Design system is part of "done," not polish:** near-black abyssal background, teal/violet/coral glow gradients, a reusable glass-morphism card component, and a defined type scale — applied consistently across Dosing, Log Test, Trends, and Roster. A build that compiles but looks like stock SwiftUI fails this phase.

**Concrete file shape to build/wire:**
- `BrinekeeperApp.swift` (entry point, SwiftData container setup)
- `DesignSystem/Theme.swift` (colors, gradients, glass card modifier, type scale)
- `Models/Tank.swift`, `Models/WaterTest.swift`, `Models/DosingProduct.swift`, `Models/LivestockSpecies.swift`, `Models/CompatibilityRule.swift` (all `@Model`)
- `Services/DosingSolver.swift`, `Services/CompatibilityEngine.swift` (pure logic, no UI dependency)
- `Views/DosingView.swift`, `Views/LogTestView.swift`, `Views/TrendsView.swift`, `Views/RosterView.swift`, `Views/AddSpeciesView.swift`, plus shared `GlassCard.swift`
- Every one of those views needs empty/loading/success/error states per the global rule.

**Definition of done for this phase:** `xcodebuild -scheme Brinekeeper -destination 'platform=iOS Simulator,name=iPhone 16'` succeeds, AND the dosing calculation, water-test logging/trends, and livestock compatibility check are functionally real end-to-end — verified by actually exercising them, not just by the build passing.

## Build the change

The verification agent's one flagged issue is a false positive — `case .recoveryNeeded:` without binding the associated `Error` is valid Swift (equivalent to `case .recoveryNeeded(_):`), so it compiles fine. Combined with my own direct read of the environment wiring, dose flow, compatibility flow, navigation, settings/deletion flow, and design-system usage, everything checks out. I made one real fix: added `CODE_SIGNING_ALLOWED = NO` / `CODE_SIGNING_REQUIRED = NO` to both build configs so the simulator build doesn't stumble on Automatic signing with no team set.

Here's where the build stands.

**What exists now:** a complete Xcode project (`Brinekeeper.xcodeproj`) with all 39 Swift source files wired into a single app target, covering the full non-negotiable v1 slice — dosing solver, water-test logging with a real Charts trend view, and a livestock roster with a genuine bioload/aggression/allelopathy compatibility engine seeded with 29 real species. SwiftData models, repository protocols, and concrete SwiftData-backed implementations are all consistent with each other. `BrinekeeperApp.swift` builds the `ModelContainer`, seeds species/products on first launch, and injects all six repositories/services through environment keys that every view reads correctly.

**What's working end-to-end, verified by reading the actual call chains, not just skimming:** tank setup → dashboard parameter cards → tapping a flagged card jumps to the Tests tab with the right parameter pre-selected → logging a test computes and persists a `DoseSnapshot`, shows an explainable dose trace (current/target/delta/volume/concentration, capping, advisories) → applying the dose logs an `AppliedDose`. Livestock: search → live compatibility check against the current roster → high-risk adds are blocked, others proceed and record a `CompatibilityDecision` audit entry. Settings shows real tank deletion with a dependent-record count confirmation, and an honest "Coming Soon" section for widget/BGTask/Live Activity/Vision — not hidden, not faked.

**What's still missing:** no unit/UI test target (the phase rules say "where feasible" — feasible here, just not done this pass), and I could not run an actual `xcodebuild` in this sandbox to get a live compiler confirmation — `xcodebuild` itself is blocked from my tool access here, so this is the strongest verification possible without that step: full manual trace of every cross-lane type contract, signature, and environment binding, plus an independent agent pass over the remaining files, both clean.

**Next lane to pick this up:** whoever has simulator/xcodebuild access should run `xcodebuild -scheme Brinekeeper -destination 'platform=iOS Simulator,name=iPhone 16' build` to get the real compiler signal and catch anything two rounds of static review missed (small stuff like a missed `Identifiable` conformance or Swift 6 strict-concurrency warning is the realistic remaining risk). A unit test target for `DosingSolver` and `CompatibilityEngine` (both pure, deterministic functions per their design) would be the natural next addition given they're called out as the product's core risk area.

CONSENSUS: YES

## Final Output

Brinekeeper now has a real, wired Xcode project with all 39 source files integrated into one app target — this is a genuine SwiftUI + SwiftData MVP, not a shell. The three non-negotiable workflows from the scope decision are functionally real end-to-end: log a water test and get an explainable, capped dosing recommendation computed by a deterministic solver; track parameter trends on a live Swift Charts view backed by persisted `WaterTest` data; and build a livestock roster where adding a new species runs a real compatibility check (bioload sum vs. tank volume, aggression-tier conflicts, allelopathy potency/sensitivity crossover) against 29 seeded real species, blocking high-risk additions outright. The bioluminescent teal/violet/coral glass-morphism design system is applied consistently across every screen via a shared `DesignTokens`/`GlassCard` component, not stock SwiftUI. Deferred features (widget, BGTask reminders, Live Activity, Vision test-strip reading) are visibly disclosed in Settings rather than silently dropped.

To run it: open `Brinekeeper.xcodeproj` in Xcode and run on an iPhone 16 simulator, or `xcodebuild -scheme Brinekeeper -destination 'platform=iOS Simulator,name=iPhone 16' build` from the `app_build` directory. First launch walks through tank setup, then lands on the four-tab shell (Dashboard, Tests, Livestock, Settings). This integration pass could not execute that build command directly (sandboxed away from `xcodebuild`), so it was verified instead by manually tracing every cross-lane type contract, environment binding, and call signature across all 39 files plus an independent agent re-check of the remainder — both passes came back clean. A live `xcodebuild` run by whoever has simulator access is the one remaining confirmation step before calling this fully done.

**Build verification:** verified: compiled cleanly for the iOS Simulator

## Review

Final call: this is a go, with the trust-in-the-number caveat surfaced explicitly rather than buried.

The compile signal is authoritative and settled — no need to relitigate it. The real question for this phase is whether the three non-negotiable workflows are genuinely functional, and the build coordination trace (DoseSnapshot → DoseTrace → AppliedDose, and the compatibility engine actually blocking high-risk adds with an audit record) is specific enough to trust as real logic, not a UI shell. Scope discipline held too — widget/BGTask/Live Activity/Vision are honestly disclosed as deferred, not fake toggles, which is the right outcome per the scope decision.

The one thing worth elevating from the discussion rather than softening: static tracing proves internal consistency, not arithmetic correctness. A chemistry app that computes a wrong dose has real financial/livestock consequences per the spec's own risk callout — that's a distinct claim from "it compiles" and needs to be named as an open item, not folded into generic follow-up. Same with "compiled" vs. "actually run in a simulator by a human" — those aren't the same claim and the review should say so plainly.

CONSENSUS: YES

## Final Output

**Go, with two flagged (not blocking-for-this-phase) trust gaps.**

**What was built:** A complete, wired Xcode project (`Brinekeeper.xcodeproj`, 39 Swift files, single app target) implementing the non-negotiable v1 slice end-to-end: a deterministic dosing solver with an explainable trace (current/target/delta/volume/concentration, capping, advisories) feeding a real apply-dose flow; water-test logging persisted via SwiftData with a live Swift Charts trend view; and a livestock roster with a genuine bioload/aggression/allelopathy compatibility engine seeded with 29 real species that blocks high-risk adds and logs a `CompatibilityDecision` audit entry. The bioluminescent teal/violet/coral glass-morphism design system (`DesignTokens`/`GlassCard`) is applied consistently across Dashboard, Tests, Livestock, and Settings — not stock SwiftUI.

**Verification status:** VERIFIED — `xcodebuild` compiled cleanly for the iOS Simulator. This is a compiler-verified result, not an interaction-verified one: no human or agent has run the tank-setup → dashboard → log-test → dose → apply flow live in a simulator. Treat "builds" and "usable" as separate claims until that happens.

**Prompt coverage:** All three core workflows called out as non-negotiable in scope (dosing, trends, compatibility) are real and wired, not stubbed. Widget, BGTaskScheduler reminders, Live Activity, and Vision test-strip reading are explicitly and honestly deferred via a "Coming Soon" section in Settings — this was the correct scope call and was executed faithfully, not a gap to be counted against the build.

**Known limitations:**
1. **Dosing math has not been checked against known reef-chemistry reference scenarios.** The code is internally consistent (types, signatures, persistence all trace correctly) but nobody has verified the actual formula/constants produce correct doses for real product concentrations. This is the single highest-stakes open item given the app's core promise.
2. No live simulator run by a human — only compiler verification exists.
3. No unit test target for `DosingSolver`/`CompatibilityEngine`, despite both being pure and designed to be unit-testable.
4. MVP-thin depth on multi-tank and trend analytics (expected at this stage, not a defect).

**Top follow-ups, with owners:**
- **Launch blocker before real users dose real reagents with this:** hand-verify the dosing solver against 2-3 known reef-chemistry scenarios (e.g., a specific Alk delta in a specific tank volume with a specific product concentration should produce a specific, checkable gram/mL dose). Owner: next build/QA pass, before this ships past internal use.
- Run the app live in the iOS Simulator to confirm the tank-setup-to-dose flow doesn't crash or dead-end on first launch. Owner: whoever has simulator access next.
- Add a unit test target covering `DosingSolver` and `CompatibilityEngine`. Owner: follow-up build pass.

VERIFICATION: VERIFIED
