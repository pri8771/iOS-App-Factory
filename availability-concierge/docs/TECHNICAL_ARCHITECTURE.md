# availability-concierge — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

CONSENSUS: YES

## Final Output

Same pattern as every phase before this one in this project — Codex and Gemini both stayed dark, so it's one voice working through the design on its own rather than a real back-and-forth. But it directly hits everything this phase is supposed to produce, and it doesn't contradict anything locked upstream (single hardcoded persona, four states already named in detailed_discussion, the title-free/privacy invariants, the "smallest slice" scope from next_steps_small) — it builds on those decisions rather than reopening them. Calling it converged.

**Screen inventory:** Four reachable screens, not five — the settings/calendar-source screens are correctly deferred to a later slice. (1) Priming screen, shown exactly once ever, before the system permission dialog. (2) Home — one screen, but with six distinct render states layered on the same container. (3) Permission-denied — a full sibling screen to Home, not an alert, since this is an expected branch, not an error. (4) The native share sheet, fed by the app but not designed by it, triggered from a persistent bottom bar (not a nav-bar icon) for easy one-handed reach.

**Primary user flow:** Launch → (first run only) priming screen with one illustration, two sentences, one button → system permission dialog → skeleton placeholder for at most ~200ms → day-grouped slot list already scrolled to today → tap any slot to toggle it off with a cheap, reversible checkmark animation (no confirmation dialog) → tap the bottom Share bar → native share sheet pre-populated with formatted text → done. On every later launch, priming is skipped entirely — straight to skeleton-then-content, no "welcome back" screen, nothing inserted between tap and value.

**State model for Home (six states, not four):** checking-authorization (skeleton rows, never a bare spinner), permission-denied (routes to screen three), no-calendars-found-on-device (its own copy — the problem is the phone, not a permission choice), success-with-slots (the day-grouped list), fully-booked-this-week (framed as a positive/neutral card, not a dead end), and too-late-today-but-open-tomorrow (leads with "Next available: tomorrow at 9:00am" as the headline; today's row is simply absent, not shown-and-crossed-out). The explicit warning attached to this: don't let build pressure collapse fully-booked and too-late-today into one generic empty state with conditional text — that would quietly undo a decision detailed_discussion already fought to lock in.

**Visual direction:** Aim for "well-made native Notes/Calendar sibling," not a branded consumer app — mostly system background space, one sparingly-used confident accent color (something like deep teal or amber, not generic default-blue), large legible time ranges as the actual hero content, relative day labels ("Today," "Tomorrow," then weekday names) with the real date as secondary. Slot rows need real visual weight (rounded rect, subtle shadow/fill, trailing checkmark) — a plain default-styled `List` would make the whole app read as a script rather than a premium product.

**Accessibility notes (treated as requirements):** each slot row's VoiceOver label must speak the full time range plus included/excluded state as one phrase; Dynamic Type must be verified at largest accessibility sizes specifically against the day-grouped list layout; accent-color contrast needs an actual contrast-ratio check in both light and dark mode before the hex is locked; denied and no-calendars screens must put their primary action button first in VoiceOver focus order.

**Open risk flagged by the design itself:** six real states is more design surface than a single loading-spinner treatment, and the person building this may be tempted to cut corners under time pressure — that's named explicitly as a risk to watch, not a decision to revisit.

**Still open honestly:** one participant again, no second opinion from Codex/Gemini. Nothing disagrees with any of this, and it satisfies both acceptance checks (a SwiftUI developer could build the view hierarchy directly from this, and every reachable workflow — priming, denied, no-calendars, success, fully-booked, too-late-today, share — has a named screen/state path) — but as with every phase before it, it hasn't been stress-tested by a dissenting voice.

## Design Handoff

CONSENSUS: YES

## Final Output

Same pattern as every phase in this project — Codex and Gemini stayed dark again, so it's one voice (this time wearing a frontend-engineer/systems hat) doing the work solo. But its job this round was to take the screens and states `design_discussion` already locked and turn them into an actual buildable handoff — routing logic, component inventory, tokens, motion, and the external-design call — and it did that without reopening anything settled upstream. Nothing contradicts it. Calling it converged and packaging it as the phase's deliverable.

### Screen-by-screen specification

**1. Priming** — static, single-purpose screen shown exactly once per install (persisted via a `hasSeenPriming` flag, never reset). One illustration, two sentences of value copy, one full-width "Find My Free Time" button. Tapping it calls `requestFullAccessToEvents` (not the deprecated `requestAccess(to:completion:)`), flips `hasSeenPriming` to true regardless of outcome, and lets root routing decide what's next.

**2. Home** — one container, six mutually-exclusive render states, each its own small view composed inside the container (not one mega-view with inline conditionals):
- *Checking-authorization*: skeleton of 3–4 gray rounded slot-row placeholders, never a bare spinner.
- *No-calendars-found-on-device*: distinct copy/icon from denied — "we didn't find any calendars on this device," own illustration.
- *Success-with-slots*: day-grouped list, scrolled to today, persistent bottom Share bar.
- *Fully-booked-this-week*: positive-framed card ("You're fully booked through [date]"), not a dead-end/sad-face state.
- *Too-late-today-but-open-tomorrow*: headline leads with "Next available: tomorrow at 9:00am"; today's row is simply absent, never shown-crossed-out.
- (Denied routes out to screen 3 rather than rendering inline.)

**3. Permission-denied** — full sibling screen matching Home's chrome (same background, same type scale), not an alert. Explains the value prop, deep-links to Settings via `UIApplication.openSettingsURLString`, re-checks status on return. Restricted and write-only auth states fold into this same screen — no separate copy for those, since the user-facing distinction (can't read) is identical.

**4. Native share sheet** — fed via `UIActivityViewController` wrapped in `UIViewControllerRepresentable`, populated only from the stripped start/end/duration formatter type (no `EKEvent` reference reachable). Triggered from the persistent bottom Share bar, present only in the two states with content to share (`.slots`, `.tooLateToday`) — hidden, not disabled, elsewhere.

### Routing / state architecture
Root is a single state-machine switch (`.priming`, `.checkingAuth`, `.denied`, `.noCalendars`, `.slots`, `.fullyBooked`, `.tooLateToday`) — not a `NavigationStack`, since these are sibling states, not a drill-down hierarchy. Driven by two truths: persisted `hasSeenPriming`, and live (never long-cached) `EKEventStore.authorizationStatus(for: .event)`. No-calendars must be checked before slot computation runs, not inferred from an empty computation result. A single `@MainActor @Observable` view model owns one long-lived `EKEventStore` and an `async computeSlots()` that hops enumeration work off-main and returns onto main — needed because `enumerateEvents(matching:using:)` is synchronous/blocking and the state model promises a ~200ms skeleton ceiling. `scenePhase == .active` re-checks both authorization *and* `calendars(for:)` through the same hook, covering both revoke-while-backgrounded and add-account-while-backgrounded. No offline/online state exists to design for — EventKit is on-device regardless of connectivity.

### Design tokens
- **Color:** one accent color as an asset-catalog `Color` (not a hardcoded hex), with distinct light/dark values so contrast can be locked once per mode — candidates: deep teal `#0E6E66` (light) / lifted `#3FBDAE` (dark), or amber `#B45309` / `#F2A93B`. Either works; whichever is chosen needs an actual computed contrast ratio against system background and slot-row fill before the hex is final.
- **Typography:** system Dynamic Type styles only — `.title2`/`.headline` for hero time ranges, `.subheadline` for day labels, `.footnote` for secondary dates. No fixed point sizes; layout must reflow at largest accessibility sizes, not just scale.
- **Spacing:** 8/12/16/24 working scale.
- **Shape:** 14pt corner radius on slot rows and cards — enough to read as designed, not so much it looks playful for a business tool.
- **Materials:** `.regularMaterial` or tinted fill plus hairline shadow on slot rows; trailing checkmark in accent color when included, neutral outline circle when deselected.

### Component inventory
`RootRouterView`, `PrimingView`, `PermissionDeniedView`, `HomeContainerView`, `SkeletonSlotRow`, `SlotRow` (time range + checkmark + combined VoiceOver label), `DaySectionHeader` (relative label + secondary date), `NoCalendarsView`, `FullyBookedCard`, `NextAvailableBanner`, `ShareBar`, `ShareSheetPresenter`.

### Motion
Skeleton-to-content and all root-state transitions (priming→home, home→denied) are plain crossfades (~150–200ms) — never a slide, since these are state refreshes / sibling swaps, not navigation pushes. Slot deselect is a quick spring (response ~0.25s, low damping) on checkmark scale/opacity plus a subtle row background fade, paired with at most a light haptic impact — deliberately under-designed relative to a "confirm/success" moment, because deselecting is reversible and low-stakes, not destructive.

### Accessibility (requirements, not polish)
Each slot row's VoiceOver label speaks time range + included/excluded state as one phrase. Dynamic Type verified at largest accessibility sizes specifically against the day-grouped list. Accent color needs a real computed contrast ratio in both light and dark mode before the hex is locked. Denied/no-calendars screens put their primary action button first in VoiceOver focus order. New this round: the root switch must not leave two states' views alive/focusable during a crossfade — a real, reproducible VoiceOver bug if `.transition(.opacity)` branches aren't cleanly removed from the hierarchy, not just a hypothetical.

### Claude Design decision
**No full external design pass.** This is a system-native, text-and-list-hero interface buildable entirely from SF Symbols, Dynamic Type, and one accent token — a SwiftUI builder can implement every screen directly from the spec above with no image assets beyond the app icon. The one scoped exception: the priming-screen illustration and the two empty-state icons (no-calendars, fully-booked) are the only spots with genuine art direction rather than layout. If external generation is wanted for those three, the prompt should specify: single-color line illustration matching the locked accent token, transparent background, sized for full-bleed top-third placement, one variant per state (calendar-access, empty-device, fully-booked). Everything else stays native-only.

**Still open honestly:** one voice again, no dissenting pass from Codex/Gemini. Nothing here contradicts any prior locked phase, and it satisfies both acceptance checks — a SwiftUI builder can implement directly from this (routing enum, six named states, component list, tokens), and no hidden design decisions remain (accent color has named candidates plus a contrast-check gate, illustrations have a scoped prompt or a native fallback). Ready to move to architecture/implementation.

## Ios Architecture Review

CONSENSUS: YES

## Final Output

Same shape as every phase before it in this project — Codex and Gemini both stayed dark again, so it's one voice (playing QA/Risk closer) doing the architecture review solo. But its job was narrow and it did it well: take the routing/state model already locked in design_handoff and push on the one layer nobody had pinned down yet — who actually owns EventKit access, how persistence should evolve, and what App Store/privacy landmines need to be locked before tech_specs. Nothing it says contradicts anything upstream; it tightens screws, it doesn't reopen decisions. Calling it converged.

**SwiftUI architecture recommendation:** Keep the state-machine root router from design_handoff, but insert one missing piece — a dedicated `actor CalendarGateway` as the *only* thing in the codebase allowed to touch `EKEventStore`. The view model calls into the actor; it never imports EventKit types directly. This exists specifically because `EKEventStore` isn't safe for concurrent access, and this app genuinely has three call sites that can race (initial compute, scenePhase re-check, background/foreground flapping mid-computation). An actor makes non-concurrent access structural, not a matter of remembering to dispatch correctly.

**Apple framework choices:** EventKit (behind the actor), SwiftData for the future persona layer (not Codable/JSON — chosen now specifically because `ModelConfiguration` gives a clean, additive path to CloudKit sync later, matching the "cloud seam" requirement locked back in the product brief), StoreKit 2 for the eventual paywall (no server, no RevenueCat-style third-party wrapper — a plain entitlement check gating persona creation).

**Persistence and local data plan:** For this slice, there's almost nothing to persist — just a `hasSeenPriming` Bool in UserDefaults. No slot caching (already an existing assumption). The SwiftData-for-personas decision is locked now as a forward architecture choice so it doesn't get re-litigated or picked hastily when the paid tier actually gets built.

**Permissions/privacy plan:** Two concrete, easy-to-miss requirements get flagged before they become submission-day surprises — the Info.plist needs `NSCalendarsFullAccessUsageDescription` specifically (the legacy key alone doesn't cover `requestFullAccessToEvents` on current iOS and its absence fails silently until a real device tap crashes it), and the privacy manifest (`PrivacyInfo.xcprivacy`) needs a declared reason code even for the single UserDefaults flag, with an explicitly empty collected-data-types section since nothing leaves the device. The usage description string must describe read-only access accurately — no language implying scheduling or writing, which is both untrue and a real App Review rejection risk.

**Dependency/license decision:** No third-party dependencies at all — EventKit, SwiftData, StoreKit 2, all first-party. This trivially satisfies the permissive-license acceptance check by having nothing to check.

**Testing implications:** The actor gets a `CalendarProviding` protocol seam, letting the two ship-blocking fixture tests already mandated in app_features (recurrence-with-exceptions, title-never-leaks) run against hardcoded fake data instead of a real, permission-gated, simulator-flaky calendar store. The point made explicitly: without this seam, those tests either don't get written because standing up real EventKit fixtures in CI is painful, or they get written against live data and become flaky enough that people start ignoring red CI — precisely how a regression in the two highest-stakes correctness guarantees slips through.

**ML/LLM/AR:** None used, and that's stated as a justified-by-absence decision, not an oversight — nothing about this app's core loop benefits from any of them, and no capability is added just to check a bonus-points box.

Both acceptance checks are met: the app has no vague architecture gaps left (concurrency ownership, persistence path, and privacy manifest requirements are now all concrete decisions), and the no-ML/AR and no-dependency-violation checks pass by explicit, reasoned absence rather than silence.

**Still open honestly:** one participant again, no dissenting pass from Codex/Gemini. Nothing here disagrees with any prior locked phase — ready to move to tech_specs.

## Tech Specs

Looking at this round, only the one Claude voice participated again (Codex/Gemini still dark), but it delivered exactly what tech_specs needs: a concrete, buildable architecture that extends rather than reopens everything locked in `ios_architecture_review` and `design_handoff`.

The key moves: splitting calendar math into two layers (an EventKit-only `CalendarGateway` actor that only produces neutral `BusyInterval` data, plus a pure, synchronous `SlotComputationEngine` that does all the free-slot math with zero EventKit dependency) — this makes the ship-blocking recurrence test small and EventKit-specific while letting dozens of adversarial edge-case tests run as fast, non-flaky pure-function fixtures. `RulesPersona` is defined now as a real typed struct (with `schemaVersion`) even though it's unpersisted and single-instance this slice, so the future paid persona tier is a pure additive change. `SafeLog` makes the "no event content in logs" privacy rule a compile-time guarantee (message must be `StaticString`) rather than a review checklist item. A `TaskGroup` fan-out inside the actor keeps the ~200ms skeleton promise honest against a real messy multi-account calendar. File layout is organized by the four build lanes so nothing is ambiguous about ownership, and the interfaces-json below pins every cross-lane type precisely so parallel lanes can't silently diverge.

Nothing here contradicts any earlier phase — it's the same seven-case root route, the same actor boundary, the same title-free invariant, just turned into concrete types and files. Both acceptance checks are met: parallel build lanes have a precise shared contract to code against, and the spec explicitly names both how it'll be built (four-lane file layout) and how it'll be verified (real-EventKit recurrence test + large pure fixture suite + formatter/type-level privacy test + snapshot tests per state).

CONSENSUS: YES

## Final Output

**Architecture overview:** SwiftUI app with a single root state-machine router (seven cases, unchanged from `design_handoff`), backed by a two-layer calendar pipeline: an `actor CalendarGateway` (the only EventKit import in the app; converts EventKit data into neutral `BusyInterval`/`allDayBlockedDays` values, fanning enumeration out per calendar via `TaskGroup` to protect the skeleton-latency promise) feeding a pure, synchronous `SlotComputationEngine` that applies `RulesPersona` rules and returns a `SlotComputationResult`. A `CalendarProviding` protocol lets the view model and tests depend on an abstraction rather than the concrete actor.

**File/module layout:** Four lanes — `DataDomain` (all cross-lane value types), `ServicesUtilities` (`CalendarGateway`, `SlotComputationEngine`, `ShareTextFormatter`, `PrimingSeenStore`), `PrimaryUI` (view model, router, all screens/components), `PolishResilience` (`SafeLog`, `ShareSheetPresenter`, transition/accessibility helpers) — plus a `Tests` module split into EventKit-dependent recurrence tests and pure fixture tests.

**Data models:** `RootRoute`, `CalendarAuthorizationState`, `RulesPersona` (real `Codable`/`Identifiable` struct with `schemaVersion`, unpersisted this slice but shape-stable for future SwiftData), `CalendarSourceInfo`, `BusyInterval`, `SlotOffer`, `ShareableSlot` (structurally title/location/notes-free), `DaySlotGroup`, `SlotComputationResult`.

**Persistence strategy:** Only `PrimingSeenStore` (a single `UserDefaults` Bool) persists anything in this slice, exactly as `ios_architecture_review` decided. `RulesPersona.default` lives in memory only; its typed shape is what makes a future SwiftData migration additive-only.

**Testing strategy:** One EventKit-backed test (`CalendarGatewayRecurrenceTests`) proves EventKit's own enumeration resolves a cancelled + moved recurring instance correctly — this is the one test that can't be faked. Everything else (buffer math, all-day blocking, minimum notice, the three-way empty-state split, type-based filtering) is a large, fast, non-flaky pure `SlotComputationEngineTests` fixture suite. `ShareTextFormatterTests` enforces the title-never-leaks invariant both structurally (input type has no title field) and at runtime. A pre-ship grep enforces that no logging bypasses `SafeLog`.

```interfaces-json
{"interfaces": [
  {"name": "RootRoute", "kind": "enum", "language": "swift", "signature": "enum RootRoute: Equatable { case priming; case checkingAuth; case denied; case noCalendars; case slots([DaySlotGroup]); case fullyBooked(untilDate: Date); case tooLateToday(nextAvailableStart: Date) }", "owning_lane": "data_domain", "notes": "Single source of truth for root switch; UI lane renders on this, view model lane produces it. Do not add an 8th case without updating design_handoff's locked state model."},
  {"name": "CalendarAuthorizationState", "kind": "enum", "language": "swift", "signature": "enum CalendarAuthorizationState { case notDetermined; case authorized; case deniedOrRestricted }", "owning_lane": "data_domain", "notes": "Wraps EKAuthorizationStatus so UI/view-model lanes never need `import EventKit`; restricted and writeOnly both fold into deniedOrRestricted per design_handoff."},
  {"name": "RulesPersona", "kind": "struct", "language": "swift", "signature": "struct RulesPersona: Codable, Identifiable, Equatable { let id: UUID; let schemaVersion: Int; var name: String; var workingHoursStart: DateComponents; var workingHoursEnd: DateComponents; var bufferMinutes: Int; var minimumNoticeMinutes: Int; var defaultDurationMinutes: Int; var excludedCalendarIdentifiers: Set<String>; static let `default`: RulesPersona }", "owning_lane": "data_domain", "notes": "Real typed record from day one even though unpersisted this slice — additive-only shape so future SwiftData persona layer never requires a migration."},
  {"name": "CalendarSourceInfo", "kind": "struct", "language": "swift", "signature": "struct CalendarSourceInfo: Identifiable, Equatable { let id: String; let title: String; let sourceTitle: String; let isAutoExcludedByType: Bool }", "owning_lane": "data_domain", "notes": "Forward-compatible with the deferred calendar-source picker; isAutoExcludedByType reflects the birthday/subscription heuristic, named as a heuristic not a solved filter."},
  {"name": "BusyInterval", "kind": "struct", "language": "swift", "signature": "struct BusyInterval: Equatable { let start: Date; let end: Date }", "owning_lane": "data_domain", "notes": "Neutral type with zero EventKit dependency; CalendarGateway converts EKEvent occurrences into these before handing off to SlotComputationEngine."},
  {"name": "SlotOffer", "kind": "struct", "language": "swift", "signature": "struct SlotOffer: Identifiable, Equatable { let id: UUID; let start: Date; let end: Date; var isIncluded: Bool; var duration: TimeInterval { end.timeIntervalSince(start) } }", "owning_lane": "data_domain", "notes": "View-facing slot with the deselect toggle; distinct from ShareableSlot which strips isIncluded/id before formatting."},
  {"name": "ShareableSlot", "kind": "struct", "language": "swift", "signature": "struct ShareableSlot: Equatable { let start: Date; let end: Date }", "owning_lane": "data_domain", "notes": "The only type ShareTextFormatter accepts. Structurally cannot carry a title/location/notes field — this is the compiler-enforced half of the privacy invariant."},
  {"name": "DaySlotGroup", "kind": "struct", "language": "swift", "signature": "struct DaySlotGroup: Identifiable, Equatable { let id: Date; let day: Date; let relativeLabel: String; var slots: [SlotOffer] }", "owning_lane": "data_domain", "notes": "id is the normalized day start; relativeLabel is precomputed (\"Today\"/\"Tomorrow\"/weekday) so the UI lane does no date-math itself."},
  {"name": "SlotComputationResult", "kind": "enum", "language": "swift", "signature": "enum SlotComputationResult: Equatable { case success([DaySlotGroup]); case fullyBookedThisWeek(untilDate: Date); case tooLateToday(nextAvailableStart: Date) }", "owning_lane": "data_domain", "notes": "no-calendars case is intentionally absent here — that state is decided before computation runs, per design_handoff's ordering requirement."},
  {"name": "CalendarProviding", "kind": "protocol", "language": "swift", "signature": "protocol CalendarProviding: Sendable { func authorizationStatus() async -> CalendarAuthorizationState; func requestFullAccess() async -> CalendarAuthorizationState; func availableCalendars() async -> [CalendarSourceInfo]; func computeSlots(for persona: RulesPersona, referenceDate: Date) async -> SlotComputationResult }", "owning_lane": "services_utilities", "notes": "Fake-conformance seam for view-model-level tests; the real recurrence-correctness proof still requires the concrete CalendarGateway against a real EKEventStore."},
  {"name": "CalendarGateway", "kind": "struct", "language": "swift", "signature": "actor CalendarGateway: CalendarProviding { init(eventStore: EKEventStore = EKEventStore()) }", "owning_lane": "services_utilities", "notes": "Only file in the app allowed to `import EventKit`. Internally fans out per-calendar enumeration via TaskGroup, then converts to [BusyInterval] before calling SlotComputationEngine — all serialized through this actor's isolation, never a second store instance."},
  {"name": "SlotComputationEngine", "kind": "function", "language": "swift", "signature": "enum SlotComputationEngine { static func computeSlots(busyIntervals: [BusyInterval], allDayBlockedDays: Set<DateComponents>, persona: RulesPersona, referenceDate: Date, calendar: Calendar) -> SlotComputationResult }", "owning_lane": "services_utilities", "notes": "Pure, synchronous, zero EventKit dependency. This is where the bulk of fixture-based correctness tests live (buffer math, all-day blocking, minimum notice, the three-way empty-state split)."},
  {"name": "ShareTextFormatter", "kind": "function", "language": "swift", "signature": "enum ShareTextFormatter { static func format(_ slots: [ShareableSlot], calendar: Calendar) -> String }", "owning_lane": "services_utilities", "notes": "Only accepts ShareableSlot, never SlotOffer or EKEvent — title-free output is structural, not a formatter-internals promise."},
  {"name": "PrimingSeenStore", "kind": "struct", "language": "swift", "signature": "struct PrimingSeenStore { var hasSeenPriming: Bool { get nonmutating set } }", "owning_lane": "services_utilities", "notes": "Thin UserDefaults wrapper; the only persisted state in this slice."},
  {"name": "SafeLog", "kind": "function", "language": "swift", "signature": "enum SafeLog { static func info(_ message: StaticString, _ metadata: [String: any CustomStringConvertible] = [:]) }", "owning_lane": "polish_resilience", "notes": "Message must be StaticString so interpolating a live event field into the log text is a compile error, not a review catch; metadata values are for non-sensitive counters/durations only."},
  {"name": "AvailabilityViewModel", "kind": "struct", "language": "swift", "signature": "@MainActor @Observable final class AvailabilityViewModel { var route: RootRoute; init(gateway: any CalendarProviding, primingStore: PrimingSeenStore); func onAppear() async; func onScenePhaseActive() async; func requestAccessAndProceed() async; func toggleSlotInclusion(id: UUID); func shareText() -> String }", "owning_lane": "primary_ui", "notes": "Single owner of RootRoute transitions; toggleSlotInclusion mutates in place inside .slots/.tooLateToday without recomputing from CalendarGateway, preserving deselections across share-sheet cancel."},
  {"name": "RootRouterView", "kind": "struct", "language": "swift", "signature": "struct RootRouterView: View { var viewModel: AvailabilityViewModel }", "owning_lane": "primary_ui", "notes": "Switches on viewModel.route with plain crossfade transitions; must not keep two branches simultaneously focusable mid-crossfade per the VoiceOver requirement from design_handoff."},
  {"name": "ShareSheetPresenter", "kind": "struct", "language": "swift", "signature": "struct ShareSheetPresenter: UIViewControllerRepresentable { let activityItems: [String] }", "owning_lane": "polish_resilience", "notes": "Wraps UIActivityViewController; fed only by AvailabilityViewModel.shareText(), never given a reference back to any calendar type."}
]}
```

**Still open honestly:** one voice again this phase, no dissenting pass from Codex/Gemini — consistent with every phase in this project's history and not treated as disqualifying anywhere else. Ready to move to build.

## Project Plan

CONSENSUS: YES

## Final Output

Same shape as every phase in this project — only one voice showed up (Codex/Gemini still dark) — but this time its job was specifically to stress-test the tech_specs plan for sequencing risk, and it found real gaps worth locking in rather than just rubber-stamping. Nothing it says contradicts the tech_specs contract (same seven-case root route, same actor boundary, same types); it reorders and de-risks the build sequence around them.

**Milestones, in dependency order:**

1. **Project scaffold** — Xcode target, bundle id, both Info.plist keys (`NSCalendarsFullAccessUsageDescription` plus the legacy key), and the `PrivacyInfo.xcprivacy` stub. Gated *before* any feature code, not a checklist item at the end — a missing usage-description key doesn't fail to compile, it crashes on first real-device tap.
2. **Data-domain types** — all the dependency-free structs/enums (`RootRoute`, `RulesPersona`, `BusyInterval`, `SlotOffer`, `ShareableSlot`, `DaySlotGroup`, `SlotComputationResult`, `CalendarAuthorizationState`, `CalendarSourceInfo`). Mechanical, fast, everything downstream depends on it.
3. **Two forked, genuinely parallel tracks once (2) lands:**
   - **SlotComputationEngine + full fixture suite** — pure, EventKit-free, highest-value/lowest-risk work. This is where the bulk of ship-blocking correctness tests (buffer math, all-day blocking, minimum notice, and — explicitly named as easy to skip — the three-way empty-state split) get written and green.
   - **EventKit recurrence spike** — a dedicated, first-class milestone (not folded silently into "build CalendarGateway") that proves the cancelled/moved recurring-instance test can actually run repeatably in this build/verification environment. Named risk: `requestFullAccessToEvents` fires a real system permission prompt, which a headless pipeline can't tap through — so this needs to be validated early, with an explicit fallback (documented manual-run test) if it can't run unattended, rather than discovered as a surprise on the last day.
   - **UI/view-model work can start in this same window**, against a fake `CalendarProviding` conformance — it doesn't need to wait on CalendarGateway being real. This is the one place the plan finds genuine, previously-unexploited parallelism.
4. **CalendarGateway**, built against the now-de-risked spike, wired through `CalendarProviding`. The `TaskGroup` per-calendar fan-out is explicitly **deferred, not default** — build the simple serial enumeration first, measure it against a seeded large-history calendar, and only reach for concurrent fan-out if serial actually misses the ~200ms skeleton budget. Treated as unmeasured speculative complexity otherwise.
5. **Wire real gateway into the view model**, then accessibility pass, then the pre-ship privacy/logging grep (no bypass of `SafeLog`), then final device verification.

**Dependencies:** scaffold → data-domain types → (engine+fixtures ∥ recurrence spike ∥ UI-against-fake-provider) → real CalendarGateway → integration → accessibility/privacy grep → device verification. The earlier tech_specs framing of "four parallel lanes" is corrected here to "mostly a chain with one real fork plus one exploitable decoupling (UI vs. calendar integration)."

**Risk mitigations:**
- Recurrence-test fragility in a headless/CI context → validate as an early spike with a named manual-run fallback, not assumed to just work.
- TaskGroup fan-out being unjustified complexity → gate it behind an actual measurement, don't build it as day-one work.
- Three-way empty-state split (fully-booked / too-late-today / no-calendars) silently collapsing under time pressure, because two of the three are annoying to trigger manually (no-calendars needs a de-configured simulator; too-late-today needs clock control) → mandated as hardcoded-reference-date fixture tests in `SlotComputationEngineTests`, not left to manual QA that gets done once and drifts.
- Missing Info.plist/privacy-manifest keys surfacing only at submission time → moved into milestone 1, gated before feature work.

**Verification plan:** distributed across the plan, not a single end phase — pure engine fixture tests land with the engine; the EventKit recurrence spike is proven before CalendarGateway is trusted; the privacy/logging grep is a gate before any build is called done; and a manual pass through all seven root states (explicitly including the two hard-to-trigger ones) is named as a required checklist item, not an assumption that a passing compile implies correctness.

**Still open honestly:** one participant again, no dissenting pass from Codex/Gemini — consistent with every phase in this project. Nothing here reopens tech_specs' types or architecture; it only reorders and adds risk gates around them. This satisfies the phase's acceptance checks — the plan is executable by task assignment (concrete ordered milestones with clear entry conditions), and testing/integration are treated as first-class, distributed work rather than end-of-project polish.

## Implementation Readiness Gate

CONSENSUS: YES

## Final Output

Same pattern as all ten phases before this one — Codex and Gemini stayed dark, so it's one voice again, but this time that voice's whole job was to be the skeptic at the last gate before code, and it actually did find real, concrete gaps rather than rubber-stamping. Every gap it found came with a specific fix that stays inside already-locked scope, which is exactly what this phase is supposed to produce. Nothing here reopens architecture, the seven-case route, the actor boundary, or the milestone/task backlog — it tightens five loose bolts before build starts.

### Readiness verdict
**Ready to build, with five named fixes folded into the task backlog below — not a stall, not a re-plan.** All prior phases (prompt contract → task assignments) are internally consistent with each other; the gaps found here are execution-environment details that fell through the cracks, not product/architecture disagreements.

### Cross-phase consistency check
Checked prompt_contract → product_research → portfolio_selection → product brief → design_discussion → design_handoff → ios_architecture_review → tech_specs → project_plan → task_assignments against each other: all consistent. Same "compose a title-free shareable offer" interpretation throughout. Same seven-case `RootRoute`. Same actor-owns-EventKit boundary. Same title-never-leaks invariant (structural in `ShareableSlot`, now also enforced in logging via `SafeLog`). Same single-hardcoded-persona MVP scope with personas as the named paid-tier mechanic. Same 16-task backlog with acyclic dependencies. No contradictions found — only omissions, listed below.

### Build blockers and fixes
1. **T-005's "run unattended" claim was never grounded in a mechanism.** Fix: build scope now explicitly names `xcrun simctl privacy grant <device-id> calendar <bundle-id>` as the way to pre-grant Calendar TCC to a simulator for automated `xcodebuild test` runs. If that command isn't available in the actual build harness, this is a **required scope downgrade**, decided now, not discovered late: T-005 ships as documented manual-run steps in `CalendarGatewayRecurrenceTests`'s comments plus a recorded gap in `VERIFICATION.md`, and CalendarGateway proceeds on the documented-but-unautomated assumption.
2. **T-016 contained two human-judgment criteria with no named evaluator.** Fix: downgrade "under 15 seconds" to a structural check (zero required taps between permission-grant and a rendered shareable list, verified by reading the state machine/view hierarchy, not a stopwatch). Downgrade "reads like a normal reply" to a one-time inspection of `ShareTextFormatter` output against 2-3 fixture slot sets, recorded as a judgment call in `VERIFICATION.md`, not an automatable pass/fail gate.
3. **No deployment target was ever pinned**, but `requestFullAccessToEvents` and `@Observable` both require iOS 17. Fix: add "deployment target iOS 17.0+" to T-001's acceptance criteria.
4. **T-006 didn't say where the birthday/subscription auto-exclusion heuristic lives.** Since there's no calendar-source picker in this slice for a user to populate exclusions manually, `CalendarGateway` itself must call `availableCalendars()`, apply the type-based filter internally, and only enumerate surviving calendars. Fix: add this as an explicit T-006 acceptance criterion so it isn't silently skipped.
5. **`shareText()`'s filter-to-`isIncluded`-before-mapping-to-`ShareableSlot` behavior was never a written acceptance criterion**, only implied by the design. Fix: add it explicitly to T-011 (or wherever `shareText()` ships) as a testable requirement.

**Framing correction carried forward:** the four "lanes" are a file-ownership/discussion device, not four literal concurrent teams — the final build report should describe this as "sequenced by dependency with one exploited fork" (per project_plan), not "four teams shipped in parallel." Watch for narrative inflation at final review.

### Final scope for build
Unchanged from task_assignments' 16-task backlog (T-001–T-016), with the five fixes above folded into the relevant tasks' acceptance criteria (T-001, T-005, T-006, T-011, T-016). No new tasks, no removed tasks, no architecture changes. MVP remains: single hardcoded persona, read-only EventKit, seven-case root route, title-free share formatter, no paywall/StoreKit, no calendar-source picker, no widget/Shortcuts.

### Acceptance criteria checklist (this phase's own bar)
- ✅ Build phase can start without inventing product/design/architecture decisions — every decision needed to write code already exists across the ten prior phases; today's five fixes are gap-fills, not new decisions.
- ✅ Every major workflow has an acceptance criterion — all seven root states, the share flow, and the recurrence/title-leak invariants are covered in the task backlog, now with the two previously-unautomatable T-016 criteria downgraded to checkable form.
- ✅ Testing responsibilities are explicit — unchanged from task_assignments (services_utilities owns fixture suites and the recurrence spike; primary_ui owns manual all-seven-states verification; polish_resilience owns the pre-ship grep/contrast gate) — now with T-005's automation mechanism named and a documented fallback path if it's unavailable.

**Still open honestly:** one voice again, no dissenting pass from Codex/Gemini — the same standing caveat as every phase in this project, not a new blocker. Cleared to proceed to build.
