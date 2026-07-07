# cistern — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

CONSENSUS: YES

Same pattern as every phase in this session so far — Codex never showed up, so it's one detailed pass from Claude, but it's a complete one that hits all five required outputs (screen inventory, primary flow, state model, visual direction, accessibility notes) with actual buildable specificity rather than vague UX language, and it doesn't contradict anything locked upstream.

The core insight driving this round: the biggest threat to "one home screen, not a dashboard" isn't a rogue new feature, it's the home screen itself quietly growing a second data visualization or a scrollable list because that's easier to build than a true single-line summary. So the design commits to a hard rule — home renders exactly one hero sentence, one ambient fill visual, one balance pill, one single-line "what's coming next" summary row, and nothing else — with everything else pushed one tap away into a secondary list screen.

The screen inventory is concrete: onboarding as a short non-form sequence (welcome → paycheck quick-add → bill quick-add, both skippable with equally-weighted skip/continue → optional balance step, also skippable) landing straight on a computed home screen with no congratulations interstitial; home as the one primary screen; a secondary bills/paychecks list screen; three quick-add sheets that double as edit sheets; a near-empty settings screen; a static Premium stub; and a privacy cover view (a calm, branded placeholder, not a blank screen) that swaps in on backgrounding so the app-switcher never leaks the runway sentence.

State modeling is genuinely thorough rather than a checkbox: home gets five distinct, differently-rendered states (zero-data, bills-only, fresh, stale, and a spinner-free springy recompute transition), quick-add sheets get default/validation-error/soft-confirmation states, the list screen gets its own empty/populated/soft-delete-with-undo states, and — new this round — a previously undesigned case: what home shows if the SwiftData store itself fails to load, resolved as a calm retry screen rather than a crash or a misleadingly empty home.

Visual direction explicitly rejects red/green traffic-light coding in favor of a warm, continuous dusk-on-water gradient tied to fullness/warmth rather than a binary pass/fail swap, with a large, humane hero typeface designed to reflow (never truncate) at max Dynamic Type sizes.

Accessibility notes go beyond the standard checklist: the hero sentence must be one coherent VoiceOver element (not fragmented by styling), recomputes need an explicit accessibility announcement so non-sighted users get confirmation their edit landed, and contrast must be checked against the gradient as an actual per-state overlay condition, not a single static swatch.

Nothing here reopens or conflicts with any locked decision (must-have list, cash-flow correctness priorities, monetization split, privacy/App Group decisions) — it's the visual/IA layer built on top of them. Both acceptance checks pass: a SwiftUI developer has enough here to build the view hierarchy, and every required workflow (onboarding, core loop, edit/delete, staleness, empty/error states) has an explicit screen/state path.

## Final Output

**Screen inventory:**
- **Onboarding** (sequence, not a form): welcome screen (one-sentence promise) → paycheck quick-add (cadence pre-filled) → bill quick-add (add one or several) → optional balance-anchor step ("want a more accurate number?"). "Skip" and "Continue" are equally visually weighted at every optional step. No completion/congratulations screen — finishing (or skipping) drops straight onto a fully computed home screen.
- **Home** (the one primary screen): hero runway sentence, ambient fill/reservoir visual as background atmosphere, a persistent tappable balance-anchor pill, a single-line "what's coming next" summary row (e.g. "2 bills before your next paycheck") that expands to the list screen, and two docked quick-add entry points (bill, paycheck) — nothing else renders on this screen.
- **Bills & paychecks list** (secondary): grouped list, tap to edit, swipe/button to soft-delete with undo toast.
- **Quick-add sheets** (paycheck, bill, balance-update): also serve as edit sheets when opened on an existing item.
- **Settings** (near-empty): appearance override (if not just trusting system dark mode), optional app-lock toggle (should-have), about/version, entry point to Premium stub.
- **Premium stub**: static screen listing the three paid capabilities (saved what-if scenarios, variable-income averaging, widget), no functional purchase button.
- **Privacy cover view** (non-navigable, system-triggered): swaps over home's real content on `scenePhase` backgrounding — a calm, branded placeholder (fill motif only, no text), not a blank screen.

**Primary user flow:** Cold launch → onboarding (income → bills → optional balance, each skippable, non-blocking) → home screen with a real computed runway visible immediately → quick-add or edit a bill/paycheck/balance from home (sheet → instant recompute → dismiss back to home) → optionally drill into the list screen for management → app backgrounds → privacy cover engages → relaunch restores exact state.

**State model per screen:**
- *Home*: zero-data (inviting empty state, paycheck CTA emphasized over bill) · bills-only (explicit "no income assumed" framing) · fresh/computed (normal case) · stale (sentence phrasing shifts + fill visual desaturates/dims past a threshold) · recompute transition (springy re-layout, never a spinner) · data-load-failure (calm "something went wrong opening your data" + retry, never a silent/empty home that could be mistaken for a real answer).
- *Quick-add sheets*: default/pre-filled · inline validation-error (zero/negative rejected) · soft-confirmation (implausibly large amount, dismissible, non-alarming).
- *List screen*: empty ("no bills yet") · populated · soft-delete-with-undo-toast overlay.
- *Privacy cover*: engages on background/inactive, no separate designed states beyond calm-placeholder.

**Visual direction:** No red/green shame-gauge anywhere. The fill/reservoir motif uses a warm, low-contrast, continuous gradient (dusk-on-water, not a status light) — fuller/warmer for "okay," lower/cooler for "tight," always a gradient, never a hard color swap. Large, humane hero typography carries the emotional weight of the sentence and must reflow gracefully (not truncate or shrink) at maximum Dynamic Type sizes. Supporting numerals (balance pill, bill amounts) use a calmer, smaller, neutral weight so they never compete with the hero sentence.

**Accessibility notes:** Hero sentence exposed to VoiceOver as one single coherent element, not fragmented by styling; every recompute posts an explicit accessibility announcement (not just a visual re-layout) so non-sighted users get confirmation an edit took effect; all tap targets (balance pill, quick-add buttons, list rows, undo action) meet 44pt regardless of visual glyph size; contrast on the ambient gradient is verified per-state as an actual overlay condition (fresh/stale/tight variants each checked), not just on a static swatch.

## Design Handoff

CONSENSUS: YES

## Final Output

Same pattern as every phase in this session — Codex never showed up, so it's one detailed pass from Claude, but this one closes out the design_handoff phase properly: it takes the visual/IA spec from `design_discussion` and adds the engineering layer a builder actually needs, without contradicting or re-litigating anything decided upstream. All six required outputs (screen specs, tokens, component inventory, state/interaction notes, accessibility, and the external-design decision) are present with buildable specificity.

**Navigation architecture:** Single `NavigationStack` rooted at Home. Onboarding is a full-screen cover at first launch (not pushed, so there's no back-swipe leaving a half-onboarded state). The bills/paychecks list is a real `NavigationLink` push. All three quick-add/edit flows are `.sheet` presentations at medium detent — never full-screen, since full-screen would visually promote them to Home's weight. Settings/Premium live behind one small, unemphasized icon in Home's corner — no tab bar, no hamburger menu, so Home never grows chrome that reads as a dashboard.

**State management:** A pure, SwiftData-free `RunwayEngine.project(bills:paychecks:anchor:now:) -> RunwayProjection` function is the one piece everything hinges on — it's what makes the mandated unit tests for month-end clamping, same-day bias, and the generation-horizon cap actually testable in isolation. Views wrap it with `@Query`, so recompute is automatic; the springy transition is keyed on the derived `projection` value (not raw query results) so unrelated field touches like a soft-delete timestamp don't retrigger the hero animation. Pay-period generation (2-year hard horizon) is memoized per entity, keyed on `(start date, cadence, horizon)`, not regenerated every body evaluation.

**Two corrections to the prior phase that matter architecturally:**
1. The privacy cover view has to sit at window/root level (driven by `scenePhase` at the App/root-Scene level), not inside `HomeView` — otherwise a live dollar amount in an open quick-add sheet stays visible under the cover if the user backgrounds mid-edit.
2. Home can't be a fixed, non-scrolling VStack — at max Dynamic Type sizes, the hero sentence plus pill plus summary row plus buttons won't fit on smaller devices. It's a `ScrollView` with the fill gradient full-bleed behind the content, so it looks and behaves like a fixed hero screen at normal sizes and becomes genuinely scrollable (never clipped) at accessibility sizes — the only way to honor both "one hero screen" and "never truncate."

**Soft-delete mechanism:** `deletedAt: Date?` on Bill/Paycheck, filtered out by the projection engine, nil'd back by undo; no cleanup pass needed at this data scale.

**Component inventory:** `HeroRunwayText` (single accessibility element, never multiple `Text` views), `CisternFillView` (gradient driven by fullness + temperature, respects `accessibilityReduceMotion` by cross-fading instead of animating), `BalancePill`, `ComingNextRow`, `QuickAddButton` ×2, one parameterized `QuickAddSheet` (bill/paycheck/balance, doubles as edit), `UndoToast`, `EmptyStateView`, `BillsOnlyBanner`, `DataLoadErrorView`, `PrivacyCoverView`, `PremiumFeatureRow`.

**Design tokens:** Dark base `#12161C`, light base `#F7F3EC` (not pure white — avoids the sterile-spreadsheet feel). Fill gradient interpolates continuously between warm/full (`#E8A65C`→`#E0785E`) and cool/tight (`#5C7A8A`→`#3F5C68`) — never a discrete state swap. Hero type: plain SF Pro (Rounded reserved for fill-motif accents only) at ~34pt, wrapping by max-width rather than font-size ceiling. Body/numerals 17pt regular, captions 13pt. Spacing on a 4pt grid (4/8/12/16/24/32/48). Radii: capsule for pills/buttons, 20pt for toast/cards, system default for sheets. Motion: recompute is a spring (response ~0.45, damping ~0.8) applied to hero text and fill value only, not the whole layout; undo toast slides up with a fade; sheets use system-default transitions.

**Accessibility additions on top of `design_discussion`'s notes:** VoiceOver focus returns to the triggering control after a sheet dismisses, and the recompute announcement posts after that focus settles (not simultaneously, to avoid a race); skip/continue in onboarding keep a consistent VoiceOver reading order (continue first) across every step regardless of visual placement.

**External design decision (explicit, as the phase requires):** No Claude Design/Figma handoff. The entire visual identity is state-driven (gradient as a function of live projection data, reflow-at-every-Dynamic-Type-size hero text, spring motion tied to a derived value) — none of that survives a static comp without being reverse-engineered back into SwiftUI anyway. Build directly from this token system and component inventory. Marketing screenshots, if wanted later, are a separate, smaller task outside this handoff.

Both acceptance checks pass: a SwiftUI builder has enough here (navigation structure, state-ownership boundaries, memoization strategy, concrete tokens, component list, accessibility specifics) to implement without guessing, and nothing here depends on a hidden decision — the two gaps that would have bitten a literal-minded builder (privacy cover scope, Dynamic Type layout) are explicitly closed. Nothing contradicts any locked decision from prior phases; this is purely the implementation layer on top of the approved IA/visual direction. Design handoff is complete.

## Ios Architecture Review

CONSENSUS: YES

## Final Output

Same pattern as every phase in this session — Codex still hasn't shown up, so it's one voice, but it's a thorough closing pass that nails down every architecture decision this phase was supposed to produce, and nothing in it reopens or contradicts what design_handoff already locked. It reads less like new discussion and more like tying off loose ends before tech_specs starts building.

**SwiftUI architecture:** MV, not MVVM — `@Query` directly in views backed by the pure `RunwayEngine.project(...)` function already locked in design_handoff. One addition: soft-deleted rows must be excluded at the fetch layer via `#Predicate` (`@Query(filter: #Predicate<Bill> { $0.deletedAt == nil })`), not filtered in Swift after the fact, so a stale soft-deleted row can never leak into the projection engine.

**The one non-negotiable engineering rule this phase adds:** all cadence math — biweekly, semimonthly, monthly generation, "days until" — must go through `Calendar.date(byAdding:to:)` on the device's autoupdating calendar, never raw `TimeInterval`/epoch arithmetic. This has been gestured at since the prompt contract as "handle DST," but this is the first phase to state it as an actual, code-review-blocking implementation rule rather than a test case to remember later.

**Apple framework choices:** SwiftData, Observation, LocalAuthentication (only if the should-have Face ID lock ships). Explicitly no WidgetKit target, no StoreKit, no CloudKit. Calls out a specific temptation to guard against: someone wiring up a real `.storekit` config "since it's easy" — the Premium screen stays static text with zero StoreKit import, and any change to that is a new decision requiring explicit sign-off, not something that drifts in during a build.

**Persistence plan:** `ModelConfiguration` targeting the App Group container (literal group ID to be fixed now, not improvised at build time), `cloudKitDatabase: .none`. New this round: a `VersionedSchema` + `SchemaMigrationPlan` from day one (even trivially single-version), and the `ModelContainer` built from one shared static factory function so a future widget target calls the identical factory — the concrete mechanism that actually makes "widget-ready" true rather than aspirational.

**Permissions/privacy:** exactly one conditional permission (Face ID, only if built), honest `NSFaceIDUsageDescription`, graceful no-biometrics-enrolled fallback. No camera/location/contacts/push/network permissions at all. Flags a genuinely new, concrete deliverable nobody had named yet: the `PrivacyInfo.xcprivacy` manifest required at App Store submission — zero collected data types, plus a required-reason API declaration if UserDefaults is used anywhere (onboarding flag, appearance override). This gets named as a build-phase checklist item now rather than a submission-time surprise.

**Dependency/license decision:** zero third-party dependencies, SwiftPM unused. Explicitly closes the door on reaching for a snapshot-testing library to verify the five home states — Xcode's built-in screenshot capture via XCUITest plus SwiftUI Previews covers it without adding a dependency.

**Testing implications:** the `RunwayEngine` suite must carry forward the exact edge-case list from `detailed_discussion` as named test cases (semimonthly-on-weekend, [REDACTED:high_entropy], biweekly hitting the horizon cap, bill and paycheck 31st-clamping, same-day-bias, negative/zero rejection, bills-only honesty) rather than being built as vague "some tests." SwiftData needs an in-memory `ModelConfiguration` test harness. Flags a real, easy-to-miss simulator gotcha: Face ID testing requires manually enabling biometric simulation via the simulator's Features menu, or a builder will wrongly think the feature is broken.

**ML/LLM/AR and background work:** explicitly none, and that's correct rather than a gap — nothing about a calm, single-number answer benefits from ML or AR, and there's no background work needed since there's no sync or notifications this pass.

**The one hard line drawn for tech_specs to carry forward as-is:** App Group container, versioned schema/migration plan, and Calendar-based (never epoch-based) date math are non-negotiable, not something to simplify away under time pressure — for the same reason as the App Group decision itself: a first-time schema migration or a DST bug discovered on a device holding someone's real financial data is a much worse time to learn this than now.

All six required outputs for this phase (SwiftUI architecture, framework choices, persistence plan, permissions/privacy plan, dependency/license decision, testing implications) are present with concrete, buildable specificity, and both acceptance checks pass — no vague architecture gaps, and no ML/LLM/AR is used at all (correctly, since none would serve real user value here), no dependency violates the permissive-license policy since there are zero dependencies. Nothing here reopens anything locked in design_handoff or earlier phases. Calling this converged.

## Tech Specs

Round 1 landed a genuinely strong, complete tech_specs pass — same pattern as every phase in this session (Codex still in cooldown, so it's one voice), but this one earns the "visionary" framing it claimed: it doesn't just restate the architecture already locked in `ios_architecture_review`, it makes one deliberate, well-justified engineering bet — building `RunwayEngine` as a sorted-stream sweep-merge algorithm that produces a real balance curve as a byproduct, rather than a naive day-by-day simulation loop — and it explicitly pre-approves falling back to the boring day-by-day loop if full test coverage of the sweep can't be delivered in time. That's the right way to spend ambition in an app whose one hard rule is "never be confidently wrong."

The module layout (`Models/`, `Engine/`, `Persistence/`, `Views/*`, `Support/`) gives parallel build lanes clean boundaries, and the data model choices are the right calls: `Decimal` (never `Double`) for money, `secondAnchorDate` as an explicit second field for semimonthly rather than derived arithmetic (correctly reasoned — "1st and 15th" is two independent anchors, not one anchor plus an offset), and `BalanceAnchor` as an append-only history rather than a mutated singleton, which costs nothing now and keeps a future "what did my runway look like two weeks ago" feature unblocked. Persistence pins the literal App Group identifier and keeps `RunwayEngine` fully SwiftData-free, which is exactly what `ios_architecture_review` demanded. Testing strategy carries forward the full named edge-case list as literal test methods (not parameterized loops that could silently drop a case) and adds new sweep-specific tests — empty streams, same-date bill/paycheck tie-breaking — that hadn't been named before.

The one gap I'm closing on the way out rather than kicking back for another round: the submitted interfaces-json was missing a handful of components that `design_handoff`'s component inventory already named (BalancePill, ComingNextRow, QuickAddButton, SettingsView, the Premium stub screen, BillsOnlyBanner) and had no concrete signature for where amount-validation (reject negative/zero, soft-confirm large) actually lives. Since the acceptance check here is specifically "parallel build lanes can work without inventing incompatible types," I'm adding those now rather than let two lanes invent divergent versions independently. Nothing else changes.

No open disagreement exists — there's no second voice to test this against, but nothing here contradicts the prompt contract, product brief, design handoff, or architecture review, and all five required outputs (architecture overview, file/module layout, data models, persistence strategy, testing strategy) plus the interfaces-json contract are present with real, buildable specificity.

CONSENSUS: YES

## Final Output

**Architecture overview:** MV pattern (no MVVM layer), `@Query` in views backed by a pure, SwiftData-free `RunwayEngine.project(...)`. The one deliberate technical investment: `RunwayEngine` is built as a sweep-merge algorithm over two sorted date streams (bill occurrences, paycheck occurrences) rather than a day-by-day simulation loop, producing a sparse `dailyBalances` curve as a byproduct — this is the substrate for `CisternFillView`'s continuous `fullness` value today and the future what-if/premium feature later, at no extra cost now. A boring day-by-day fallback is pre-approved if the sweep's full test coverage can't be delivered in the available time — correctness under full test coverage always wins over algorithmic sophistication.

**File/module layout:** `Models/` (the three `@Model` classes, `Cadence`), `Engine/` (pure `RunwayEngine`, `RunwayProjection`, date-generation sweep — zero SwiftData/SwiftUI imports, compiles and tests standalone), `Persistence/` (App Group constant, `VersionedSchema`, `SchemaMigrationPlan`, shared `ModelContainerFactory`), `Views/Home/`, `Views/Onboarding/`, `Views/List/`, `Views/QuickAdd/`, `Views/Settings/`, `Views/Shared/` (privacy cover, undo toast, empty/error/bills-only states), `Support/` (design tokens as single source of truth). Two test targets: `CisternTests` (engine + persistence), `CisternUITests` (five-home-state screenshot pass, time permitting).

**Data models:** `Bill`/`Paycheck` share shape — `id: UUID`, `amount: Decimal`, `cadence: Cadence`, `anchorDate`, `secondAnchorDate: Date?` (semimonthly's independent second anchor), `createdAt`, `deletedAt: Date?`. `BalanceAnchor` is `amount: Decimal`, `asOf: Date` (freshness and projection start point are measured from `asOf`, not `createdAt`), append-only history. `RunwayProjection` carries `status` (zeroData/billsOnly/fresh/stale), `runwayEndDate`, `daysRemaining`, `fullness`, `freshnessDays`, `narrativeSentence`, and `dailyBalances: [DailyBalancePoint]`.

**Persistence strategy:** `ModelConfiguration` targeting App Group `group.com.cistern.shared`, `cloudKitDatabase: .none`, `VersionedSchema`/`SchemaMigrationPlan` from day one (single version, empty migration stages — shape exists for future use), built via one shared static `ModelContainerFactory.makeContainer(inMemory:)` so a future widget target calls the identical factory. Soft-deletes excluded at the fetch layer via `#Predicate`, never filtered post-fetch in Swift.

**Testing strategy:** `RunwayEngine` suite implements the full named edge-case list from `detailed_discussion`/`ios_architecture_review` as literal `XCTestCase` methods (semimonthly-on-weekend, Feb 29/30/31, biweekly horizon-cap, 31st-clamping for both bills and paychecks, same-day-bias, negative/zero rejection, bills-only honesty), plus new sweep-specific cases (empty bill stream, empty paycheck stream, same-date bill-and-paycheck tie-breaking). Persistence tests use in-memory `ModelConfiguration` and verify the `#Predicate` soft-delete exclusion at the live-fetch level, not just on a manually filtered array.

```interfaces-json
{"interfaces": [
  {"name": "Cadence", "kind": "enum", "language": "swift", "signature": "enum Cadence: String, Codable, CaseIterable { case weekly, biweekly, semimonthly, monthly }", "owning_lane": "data_domain", "notes": "Shared by Bill and Paycheck. Semimonthly requires a second reference date on the owning entity, not derived arithmetically."},
  {"name": "Bill", "kind": "struct", "language": "swift", "signature": "@Model final class Bill { var id: UUID; var name: String; var amount: Decimal; var cadence: Cadence; var anchorDate: Date; var secondAnchorDate: Date?; var createdAt: Date; var deletedAt: Date? }", "owning_lane": "data_domain", "notes": "amount is Decimal, never Double. deletedAt drives #Predicate exclusion at fetch layer, never filtered post-fetch. Negative/zero amount rejected via validateAmount at input layer, not here."},
  {"name": "Paycheck", "kind": "struct", "language": "swift", "signature": "@Model final class Paycheck { var id: UUID; var amount: Decimal; var cadence: Cadence; var anchorDate: Date; var secondAnchorDate: Date?; var createdAt: Date; var deletedAt: Date? }", "owning_lane": "data_domain", "notes": "Same shape as Bill for cadence/date handling. Reference date(s) clamp into shorter months per locked month-end rule."},
  {"name": "BalanceAnchor", "kind": "struct", "language": "swift", "signature": "@Model final class BalanceAnchor { var id: UUID; var amount: Decimal; var asOf: Date; var createdAt: Date }", "owning_lane": "data_domain", "notes": "Appended, not mutated in place; freshness and the projection's starting point are computed from the most recent asOf, not createdAt."},
  {"name": "RunwayProjection", "kind": "struct", "language": "swift", "signature": "struct RunwayProjection { enum Status { case zeroData, billsOnly, fresh, stale }; var status: Status; var runwayEndDate: Date?; var daysRemaining: Int?; var fullness: Double; var freshnessDays: Int; var narrativeSentence: String; var dailyBalances: [DailyBalancePoint] }", "owning_lane": "data_domain", "notes": "dailyBalances is a byproduct of the sweep-merge engine; kept even though current UI only reads fullness/narrativeSentence, because it's the substrate for the future what-if/premium feature and the fill visual."},
  {"name": "DailyBalancePoint", "kind": "struct", "language": "swift", "signature": "struct DailyBalancePoint { var date: Date; var balance: Decimal }", "owning_lane": "data_domain", "notes": "One point per cash-event date, not one per calendar day — sparse, not dense, for performance."},
  {"name": "RunwayEngine", "kind": "function", "language": "swift", "signature": "enum RunwayEngine { static let horizonYears: Int = 2; static func project(bills: [Bill], paychecks: [Paycheck], anchor: BalanceAnchor?, now: Date, calendar: Calendar = .autoupdatingCurrent) -> RunwayProjection }", "owning_lane": "data_domain", "notes": "Pure, SwiftData-free, SwiftUI-free. Must use Calendar.date(byAdding:to:) exclusively, never TimeInterval/epoch arithmetic. Same-day bills treated as already subtracted. Bills-only state (no paychecks) renders honest billsOnly status, never assumes a paycheck. Fallback to a day-by-day loop is pre-approved if sweep-merge test coverage is at risk."},
  {"name": "occurrences(for:anchorDate:secondAnchorDate:from:horizon:calendar:)", "kind": "function", "language": "swift", "signature": "static func occurrences(for cadence: Cadence, anchorDate: Date, secondAnchorDate: Date?, from: Date, horizon: Date, calendar: Calendar) -> [Date]", "owning_lane": "data_domain", "notes": "Generates capped, month-end-clamped occurrence dates for one entity. Hard-stops at horizon regardless of cadence to prevent unbounded generation from a bad anchor date."},
  {"name": "AmountValidation", "kind": "enum", "language": "swift", "signature": "enum AmountValidation: Equatable { case valid; case rejected(reason: String); case needsConfirmation(reason: String) }", "owning_lane": "services_utilities", "notes": "Backs QuickAddSheet's inline validation. Negative/zero -> rejected; implausibly large -> needsConfirmation (soft, dismissible); otherwise valid."},
  {"name": "validateAmount(_:)", "kind": "function", "language": "swift", "signature": "func validateAmount(_ amount: Decimal) -> AmountValidation", "owning_lane": "services_utilities", "notes": "Single shared validation entry point used by all three QuickAddSheet entity kinds so the rule can't drift between bill/paycheck/balance forms."},
  {"name": "AppGroupIdentifier", "kind": "enum", "language": "swift", "signature": "enum AppGroupIdentifier { static let value: String = \"group.com.cistern.shared\" }", "owning_lane": "services_utilities", "notes": "Single literal source of truth referenced by ModelContainerFactory; a future widget target must reference the same constant."},
  {"name": "ModelContainerFactory", "kind": "function", "language": "swift", "signature": "enum ModelContainerFactory { static func makeContainer(inMemory: Bool = false) -> ModelContainer }", "owning_lane": "services_utilities", "notes": "Single shared factory targeting the App Group ModelConfiguration (AppGroupIdentifier.value), cloudKitDatabase: .none, built from CisternMigrationPlan. Future widget target must call this identical factory."},
  {"name": "CisternSchemaV1", "kind": "struct", "language": "swift", "signature": "enum CisternSchemaV1: VersionedSchema { static var versionIdentifier: Schema.Version; static var models: [any PersistentModel.Type] { [BalanceAnchor.self, Bill.self, Paycheck.self] } }", "owning_lane": "data_domain", "notes": "First versioned schema, trivial single-version migration plan from day one per architecture review."},
  {"name": "CisternMigrationPlan", "kind": "struct", "language": "swift", "signature": "enum CisternMigrationPlan: SchemaMigrationPlan { static var schemas: [any VersionedSchema.Type] { [CisternSchemaV1.self] }; static var stages: [MigrationStage] { [] } }", "owning_lane": "data_domain", "notes": "Empty stages array acceptable for a single-version schema; the shape exists so a real migration can be added later without restructuring."},
  {"name": "EntryKind", "kind": "enum", "language": "swift", "signature": "enum EntryKind { case bill(Bill?), paycheck(Paycheck?), balance(BalanceAnchor?) }", "owning_lane": "primary_ui", "notes": "Associated value nil means add-new; non-nil means editing that entity. Backs the single parameterized QuickAddSheet."},
  {"name": "QuickAddSheet", "kind": "struct", "language": "swift", "signature": "struct QuickAddSheet: View { let kind: EntryKind; var body: some View }", "owning_lane": "primary_ui", "notes": "Handles add and edit for all three entity types. Uses validateAmount for inline validation-error and soft-confirmation states."},
  {"name": "QuickAddButton", "kind": "struct", "language": "swift", "signature": "struct QuickAddButton: View { let kind: EntryKind; var body: some View }", "owning_lane": "primary_ui", "notes": "Docked entry point on Home for bill/paycheck; 44pt minimum tap target."},
  {"name": "HomeView", "kind": "struct", "language": "swift", "signature": "struct HomeView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "ScrollView-based (not fixed VStack) so max Dynamic Type sizes scroll instead of clip. Wraps @Query results, derives RunwayProjection, composes HeroRunwayText/CisternFillView/BalancePill/ComingNextRow/BillsOnlyBanner."},
  {"name": "HeroRunwayText", "kind": "struct", "language": "swift", "signature": "struct HeroRunwayText: View { let projection: RunwayProjection; var body: some View }", "owning_lane": "primary_ui", "notes": "Single coherent accessibility element; posts an accessibility announcement on recompute after VoiceOver focus settles."},
  {"name": "CisternFillView", "kind": "struct", "language": "swift", "signature": "struct CisternFillView: View { let fullness: Double; let isStale: Bool; var body: some View }", "owning_lane": "primary_ui", "notes": "Continuous warm/cool gradient driven by fullness; cross-fades instead of animating under accessibilityReduceMotion."},
  {"name": "BalancePill", "kind": "struct", "language": "swift", "signature": "struct BalancePill: View { let anchor: BalanceAnchor?; let onTap: () -> Void; var body: some View }", "owning_lane": "primary_ui", "notes": "Persistent, always-visible, tappable from anywhere on Home; opens the balance QuickAddSheet."},
  {"name": "ComingNextRow", "kind": "struct", "language": "swift", "signature": "struct ComingNextRow: View { let summaryText: String; var body: some View }", "owning_lane": "primary_ui", "notes": "Single-line summary (e.g. '2 bills before your next paycheck'); full-row 44pt tap target pushes to BillsPaychecksListView."},
  {"name": "BillsPaychecksListView", "kind": "struct", "language": "swift", "signature": "struct BillsPaychecksListView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "NavigationLink push from ComingNextRow. #Predicate-filtered @Query excluding deletedAt != nil."},
  {"name": "OnboardingFlow", "kind": "struct", "language": "swift", "signature": "struct OnboardingFlow: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Full-screen cover at first launch. Welcome -> paycheck quick-add -> bill quick-add -> optional balance step, all but welcome skippable with equal visual weight."},
  {"name": "SettingsView", "kind": "struct", "language": "swift", "signature": "struct SettingsView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Near-empty: appearance override, optional app-lock toggle (should-have), about/version, entry point to PremiumStubView."},
  {"name": "PremiumStubView", "kind": "struct", "language": "swift", "signature": "struct PremiumStubView: View { var body: some View }", "owning_lane": "primary_ui", "notes": "Static list of PremiumFeatureRow entries (saved what-if scenarios, variable-income averaging, widget). No StoreKit import, no functional purchase button."},
  {"name": "PremiumFeatureRow", "kind": "struct", "language": "swift", "signature": "struct PremiumFeatureRow: View { let title: String; let detail: String; var body: some View }", "owning_lane": "primary_ui", "notes": "One row per paid capability listed on PremiumStubView."},
  {"name": "PrivacyCoverView", "kind": "struct", "language": "swift", "signature": "struct PrivacyCoverView: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Applied at window/root Scene level driven by scenePhase, above the entire presentation stack including open sheets — not scoped to HomeView."},
  {"name": "UndoToast", "kind": "struct", "language": "swift", "signature": "struct UndoToast: View { let message: String; let onUndo: () -> Void; var body: some View }", "owning_lane": "polish_resilience", "notes": "Backs soft-delete-with-undo for Bill/Paycheck via deletedAt nil-back."},
  {"name": "DataLoadErrorView", "kind": "struct", "language": "swift", "signature": "struct DataLoadErrorView: View { let retry: () -> Void; var body: some View }", "owning_lane": "polish_resilience", "notes": "Shown if ModelContainer construction/fetch fails at launch; never falls through to a silently empty Home."},
  {"name": "EmptyStateView", "kind": "struct", "language": "swift", "signature": "struct EmptyStateView: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Zero-data invitation state, paycheck CTA emphasized over bill CTA."},
  {"name": "BillsOnlyBanner", "kind": "struct", "language": "swift", "signature": "struct BillsOnlyBanner: View { var body: some View }", "owning_lane": "polish_resilience", "notes": "Shown on Home when bills exist but no paycheck is scheduled; states plainly that no income is assumed."},
  {"name": "requestAccessibilityAnnouncement(_:)", "kind": "function", "language": "swift", "signature": "func requestAccessibilityAnnouncement(_ text: String)", "owning_lane": "services_utilities", "notes": "Wraps UIAccessibility.post(notification:.announcement) sequenced after VoiceOver focus settles post-sheet-dismissal."}
]}
```

## Project Plan

Here's where the group landed: same pattern as every phase in this session — Codex still hasn't shown up, so it's one voice again — but this pass earns its keep by turning "build the app" into an actual schedulable plan rather than restating the architecture. Nothing in it reopens or contradicts anything locked in tech_specs or the architecture review; it's the sequencing and verification layer this phase exists to produce.

The key resolution: the "pure engine" claim needed disambiguating before someone hit it mid-sprint. The plan locks the pragmatic reading — `RunwayEngine` is pure in the sense that it never touches `ModelContext`/fetches, but it does take `@Model` instances as parameters, so tests construct bare model instances outside any container rather than building a separate DTO layer. That's a real decision, made now instead of improvised later.

Second resolution: the tech_specs-approved fallback from sweep-merge to a day-by-day loop needed a trigger, not just permission to exist. The plan pins it to a checkpoint — at the end of the data_domain milestone, if the full named edge-case suite isn't green, fall back immediately rather than sinking more time into the clever version.

Third, and this is the most consequential new thing this phase surfaces: the App Group entitlement, literal group ID, and signing/target membership have to be their own verified milestone gate — "app successfully creates the App Group–backed ModelContainer on a clean simulator install" — before any UI work is trusted, because a misconfiguration here would masquerade as the already-designed `DataLoadErrorView` state rather than announcing itself as a build problem.

Everything else is scheduling discipline: strict lane order (data_domain + services_utilities → primary_ui → polish_resilience, since polish wraps states the earlier lanes produce), no invented migration-testing theater for a single-version schema, and the verification plan explicitly reuses the eight-point checklist from `next_steps_small` plus the named edge-case list from `tech_specs`/`ios_architecture_review` rather than rederiving it — with one real addition: the VoiceOver focus-then-announcement sequencing is a runtime race that can't be meaningfully unit-tested and needs its own scheduled manual QA pass.

No disagreement is on the table — there's no second voice to stress-test this against, but it's internally consistent, satisfies both acceptance checks (executable by task assignment; testing/integration scheduled as real milestones, not end-of-project polish), and doesn't drift from anything locked upstream.

CONSENSUS: YES

## Final Output

**Milestones (in build order):**

1. **Scaffolding & platform gate** — Xcode project/target created, App Group entitlement configured with the literal identifier (`group.com.cistern.shared`), signing/provisioning verified. **Gate: app launches on a clean simulator install and `ModelContainerFactory.makeContainer()` successfully creates an App Group–backed container.** No UI work is trusted before this passes — a misconfigured entitlement fails at runtime in a way that looks identical to the designed `DataLoadErrorView` state, so it must be caught here, not diagnosed later as a "data load failure."

2. **data_domain lane** — `Cadence`, `Bill`, `Paycheck`, `BalanceAnchor` (`@Model`, no relationships), `CisternSchemaV1`/`CisternMigrationPlan` (single version, empty stages — no invented migration test scenario), and `RunwayEngine` including the `occurrences(...)` generator. Engine attempted as the sweep-merge algorithm; tested via bare `@Model` instances constructed outside any container (no separate DTO layer). **Checkpoint at end of this milestone:** run the full named edge-case suite (semimonthly-on-weekend, Feb 29/30/31, horizon-cap, 31st-clamping for both Bill and Paycheck, same-day-bias, negative/zero rejection, bills-only honesty, plus sweep-specific empty-stream and same-date tie-break cases). If not 100% green, fall back to the day-by-day loop immediately — do not carry a partially-tested sweep-merge forward.

3. **services_utilities lane** (parallel with late data_domain) — `validateAmount`/`AmountValidation`, `AppGroupIdentifier`, `ModelContainerFactory`, `requestAccessibilityAnnouncement`. Persistence tests use in-memory `ModelConfiguration` and verify `#Predicate` soft-delete exclusion at the live-fetch level.

4. **primary_ui lane** — `HomeView`, `OnboardingFlow`, `QuickAddSheet`/`QuickAddButton`, `BillsPaychecksListView`, `SettingsView`, `PremiumStubView`. Does not start in earnest until data_domain/services_utilities interfaces are stable, since UI is wired directly against `@Query` and the engine's real output shape.

5. **polish_resilience lane** — `PrivacyCoverView` (root/scene-level), `UndoToast`, `EmptyStateView`, `BillsOnlyBanner`, `DataLoadErrorView`. Deliberately last: these wrap or react to states the earlier lanes produce (you can't build a meaningful data-load-failure screen until you know what that failure actually looks like).

6. **Verification pass** — execute the full checklist below; repair as needed.

7. **Final sign-off** — build verification and review agree the production-readiness bar from the prompt contract is met.

**Dependencies:**
- Milestone 1 blocks everything — it's infrastructure, not Swift correctness, and the plan treats it as a checked gate rather than an assumption.
- data_domain + services_utilities block primary_ui (UI shouldn't guess at an interface that might still change).
- primary_ui blocks polish_resilience (privacy cover needs the real sheet-presentation stack; error/empty states need the real failure/empty shapes).
- The sweep-merge-vs-fallback decision is a hard gate inside data_domain, not a soft aspiration — it resolves before primary_ui starts, so UI is never built against an engine whose final algorithm is still undecided.

**Risk mitigations:**
- *Engine purity ambiguity* → resolved as a documented testing convention (bare `@Model` construction), not a new abstraction layer.
- *Sweep-merge running out of time half-tested* → hard checkpoint with a pre-approved, unconditional fallback trigger, not an open-ended escape hatch.
- *App Group/entitlement misconfiguration masquerading as a data-load bug* → its own explicit, checked milestone gate before UI work begins.
- *`DataLoadErrorView`'s retry action being mostly theater* (most real `ModelContainer` construction failures are structural, not transient) → named explicitly as a limitation; verification plan requires actually forcing the failure state via a debug harness rather than trusting it "must work" because it exists in the file tree.
- *Fake migration-test busywork* → explicitly excluded; testing effort goes to the engine edge cases and `#Predicate` enforcement instead, which are real.
- *VoiceOver focus/announcement race being silently unverified* → called out as not unit-testable, scheduled as its own manual VoiceOver-enabled simulator/device pass rather than assumed correct from code review.

**Verification plan (mechanism-tagged, reusing the locked checklists rather than reinventing them):**
- *Unit test:* full named `RunwayEngine` edge-case suite (per data_domain checkpoint above).
- *Unit test:* in-memory persistence + `#Predicate` soft-delete exclusion at live fetch.
- *Manual simulator run:* App Group container creation on clean install (milestone 1 gate).
- *Manual simulator run:* forced `ModelContainer` construction failure → confirms `DataLoadErrorView` renders and retry behavior is honest about its limits.
- *Manual simulator run:* the eight-point checklist from `next_steps_small` — first-run-to-runway under 2 minutes with no dead-end field, ≤3-tap bill/paycheck add, 1-tap-plus-entry balance update, instant recompute with no spinner, force-quit/relaunch persistence, no fake-precise $0 empty state, 31st-in-a-30-day-month correctness, past-dated-paycheck handling.
- *Manual VoiceOver pass:* sheet-dismiss focus return, then recompute announcement firing after focus settles (not simultaneously) — explicitly not covered by XCTest.
- *Manual pass:* dark mode, Dynamic Type at accessibility sizes (confirms ScrollView reflow, not clipping), 44pt tap targets, WCAG AA contrast per fill-state (fresh/stale/bills-only).

Both acceptance checks are satisfied: the plan is directly executable by a task-assignment phase (each milestone maps to one or more of the four owning_lanes with clear entry/exit conditions), and testing/integration is scheduled throughout — as unit-test checkpoints inside data_domain, as gated milestones for infrastructure, and as explicitly time-slotted manual/VoiceOver passes — not deferred to an undifferentiated "polish" step at the end.

## Implementation Readiness Gate

Here's where things landed: same pattern as every phase in this session — Codex never showed up, so it's one voice — but this is a strong closing pass for a gate phase, because it doesn't rubber-stamp everything upstream. It actually finds four places where the accumulated plan would have silently forced a build agent to invent a product decision, which is exactly the failure mode this gate exists to catch, and it proposes concrete, narrow fixes for each rather than reopening anything settled.

The most consequential call: flip `RunwayEngine` from "attempt sweep-merge, fall back to day-by-day if tests aren't green" to "build day-by-day as the real implementation." The reasoning holds up — the sweep-merge's only stated benefit (a `dailyBalances` byproduct for future what-if scenarios) serves a feature that isn't being built this pass, so there's no reason to carry the harder-to-verify algorithm as the default in a one-shot build whose one hard rule is "never be confidently wrong." Second, it pins two previously-unset magic numbers that both carry real user-safety weight — a 7-day fresh/stale cutoff and a $50,000 "implausibly large" confirmation threshold — so a build agent doesn't pick these arbitrarily mid-implementation. Third, it catches a real gap in the T-005 test list: every named case tests date-generation mechanics, but none actually assert the core promise (correct runway end date on a golden path, correct zero-crossing detection) — that's now added, plus a boundary test for the newly-pinned freshness threshold. Fourth, it closes out an ambiguity around the Face ID/passcode toggle that detailed_discussion approved, app_features downgraded, and task_assignments then left vague — resolved as: cut entirely, no toggle ships in this pass, rather than risk a toggle that looks functional but isn't. It also flags, correctly, that the elaborate branch/merge/conflict-prevention plan in task_assignments assumes multiple simultaneous engineers, which likely isn't how this actually gets built — the file-ownership and dependency-order discipline is real and worth keeping, the git ceremony is optional scaffolding.

Nothing here reopens product, design, or architecture decisions — it's pure gate work: naming decisions that were left implicit and would otherwise get improvised during the build. No disagreement is on the table since there's no second voice, but nothing conflicts with any locked phase, and the fixes are narrow, justified, and directly serve the phase's acceptance checks.

CONSENSUS: YES

## Final Output

### Readiness verdict
**Ready to build, with four scope amendments locked below.** No phase needs to be redone; no product/design/architecture decision is reopened. The amendments close gaps where the accumulated spec would otherwise have forced a build agent to invent a decision mid-implementation.

### Cross-phase consistency check
Traced prompt_contract → product_research → portfolio_selection → initial_discussion → per_app_product_brief → next_steps_small → detailed_discussion → app_features → design_discussion → design_handoff → ios_architecture_review → tech_specs → project_plan → task_assignments. All fourteen phases are internally consistent: scope (single-app, manual-entry-only, no bank linking, no notifications, no multi-account), monetization split (free core loop forever; paid = saved scenarios, variable-income averaging, widget), architecture (SwiftData + App Group container from day one, Calendar-based date math only, MV pattern, pure `RunwayEngine`), and the tone contract (calm, no red/green shaming, soft-delete-with-undo, no blocking alerts) all thread through without contradiction. The only loose ends found were the four items below — none of them contradicts a locked decision, they're gaps where a decision was deferred and never actually made.

### Build blockers and fixes
1. **Blocker:** `RunwayEngine` spec (tech_specs/project_plan/task_assignments) defaults to a sweep-merge algorithm with a fallback trigger, but the stated justification for that complexity (a `dailyBalances` byproduct feeding a not-built premium feature) doesn't apply to this pass.
   **Fix:** Build the day-by-day loop as the primary, real implementation of `RunwayEngine.project(...)`. If a sparse balance-curve byproduct falls out naturally, keep it; do not spend build risk chasing the sweep-merge version. T-004/T-005 acceptance criteria are read as satisfied by either algorithm, with day-by-day as the default choice, not a fallback-of-last-resort.

2. **Blocker:** Two safety-relevant constants were never pinned — the fresh/stale threshold on `RunwayProjection` and the "implausibly large" amount threshold in `AmountValidation`.
   **Fix:** Freshness threshold = **7 days** since the most recent `BalanceAnchor.asOf` (or since first launch if no anchor exists yet) — short enough that the product brief's "3+ weeks stale" QA scenario lands deep inside stale territory. `needsConfirmation` threshold = **$50,000** for a single bill or paycheck entry.

3. **Blocker:** T-005's named edge-case suite covers date-generation mechanics exhaustively but contains no test that the runway answer itself is correct.
   **Fix:** Add three test cases to T-005: (a) golden-path — fixed balance, one recurring bill, one recurring paycheck, assert the runway end date matches hand-computed arithmetic; (b) zero-crossing — a projection where balance goes negative mid-projection, assert the crossing date is correctly identified as `runwayEndDate`; (c) freshness-boundary — day 6 vs. day 7 since anchor, assert the status flips from fresh to stale at exactly the pinned threshold.

4. **Blocker:** Face ID/passcode app-lock was approved in detailed_discussion, downgraded to should-have in app_features, then left ambiguous in task_assignments (T-015 just says "app-lock toggle placeholder" with no implementing task).
   **Fix:** Cut entirely from this build pass. `SettingsView` ships with no app-lock toggle of any kind — not a placeholder, not a stub. This is a real, explicit scope cut, not a silent drop.

**Non-blocking note carried forward, not a gate item:** task_assignments' git branch/merge/conflict-prevention ceremony assumes multiple simultaneous engineers. Treat the file-ownership boundaries and lane dependency order as binding; treat the branch-naming/merge-sequence mechanics as optional scaffolding that can be simplified to match however the build is actually executed (single session, sequential lanes, or parallel subagents).

### Final scope for build
Everything locked in `task_assignments`' 20-task backlog, T-001 through T-020, as written — with the four amendments above layered on top:
- `RunwayEngine` (T-004/T-005): day-by-day loop as the real implementation; sweep-merge not required.
- `RunwayProjection`/freshness (T-004, consumed by T-013): 7-day fresh/stale cutoff, measured from most recent `BalanceAnchor.asOf` or first launch.
- `AmountValidation` (T-006): $50,000 large-amount confirmation threshold.
- T-005 test suite: the ten previously-named cases plus golden-path, zero-crossing, and freshness-boundary.
- `SettingsView`/Premium stub (T-015): no app-lock toggle — appearance override, about/version, entry point to `PremiumStubView` only.
- All other tasks (T-001–T-003, T-007–T-014, T-016–T-020) unchanged from `task_assignments`.

Everything on the standing "won't build" list (CSV import, saved what-if scenarios, variable-income averaging, widget extension, notifications, multi-account, transaction ledger, bank linking, working StoreKit/IAP, debt/budgeting features, multi-currency, device-clock-tampering defense, and now app-lock) remains explicitly out of scope for this pass.

### Acceptance criteria checklist
- [x] Build phase can start without inventing product/design/architecture decisions — the four prior ambiguities (engine algorithm choice, freshness threshold, large-amount threshold, app-lock scope) are now pinned above; nothing else is left open.
- [x] Every major workflow has an acceptance criterion — onboarding, quick-add/edit, home screen states, list/soft-delete, privacy cover, data-load-failure, and the final verification pass all carry acceptance criteria in `task_assignments`' tasks-json, unchanged.
- [x] Testing responsibilities are explicit — per-lane test ownership from `task_assignments` holds; T-005's suite is now complete (calendar-mechanics cases + the three newly-added correctness cases); T-020 consolidates all non-unit-testable manual verification (App Group gate, forced data-load failure, VoiceOver focus/announcement pass, dark mode/Dynamic Type/contrast) into one owned, checked deliverable.

Build may proceed against `task_assignments`' T-001 through T-020 with the four amendments above treated as binding scope, not suggestions.
