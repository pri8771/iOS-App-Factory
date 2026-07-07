# irregular-income-planner — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

Both Codex and Claude took the quality gate's feedback seriously and closed both gaps without reopening anything settled. They landed on essentially identical specs for the app lock gate — a modal scrim in front of all four surfaces (not a fifth destination) triggered on cold launch and foreground-from-background, with states for locked-gate, authenticating, success (returns to last-active screen), failure-with-retry, and passcode-fallback. Claude added one sharp, concrete detail Codex didn't have — the locked screen must never composite or blur real data underneath it, since blur-based reconstruction is a real leak vector — and Codex didn't get a chance to react to that specific point, but it's a strict tightening of something he already agreed to in principle (a "calm, branded" gate, not a system dialog dropped over live content), not a new direction, so there's nothing here to actually contest.

On the onboarding gap, they agree exactly: income entry gets the same visibly-weighted skip affordance reserve already had, landing the skipper on the Dashboard's insufficient-data state — which isn't new behavior, just making sure the front door doesn't accidentally block a state the group already spent two phases designing.

Everything from round 2 (the ribbon/texture confidence system, reserve as a single-value panel, two-place premium gate, negative-safe-to-spend and reserve-missing as honest non-error states, the texture-not-color governing rule) carries forward untouched. Gemini still hasn't weighed in across three rounds, but between the two active participants there's nothing left open.

CONSENSUS: YES

## Final Output

**Information architecture:** four shallow surfaces — Dashboard, Money Inputs, Explanation/History, Settings/Data/Privacy — plus one pre-surface **App Lock** gate (a modal scrim, not a fifth navigational destination) that sits in front of all four whenever biometric/passcode lock is enabled. No other fifth destination. Share and export/import are actions launched from existing surfaces.

**Screen inventory:**
1. **App Lock (gate, conditional on lock being enabled)** — a calm, branded scrim shown on cold launch and on foreground-from-background: app identity, privacy reassurance copy, single "Unlock" action. Never composites or blurs real data underneath it (no dashboard silhouette, no blurred hero number — blur-based leakage is a real vulnerability class and is excluded outright).
2. **Onboarding** — one-sentence promise screen → privacy screen ("your numbers never leave your phone" gets its own beat) → income entry with an equally-weighted, visibly legitimate skip affordance alongside "add entry" (not a buried link) → reserve entry with the same symmetric skip treatment → Dashboard.
3. **Dashboard** — hero safe-to-spend figure with the evidence-texture treatment, runway/cushion card, risk-window flag (icon + text), one-tap quick actions (log income, open explanation, share).
4. **Money Inputs** — one surface, three sections: income (row-based list/add/edit, same-day duplicates distinct, negative corrections visually marked), obligations (grouped by upcoming due date, cadence + due date + manual fixed amount), reserve (single-value stat panel with inline edit and "last updated" caption — never a list).
5. **Explanation/History** — plain-language receipt (baseline, minus obligations, plus/minus reserve effect), traceable line items, chronological history, past confidence-tier transitions. Deliberately plain/literal, no ribbon styling. Hosts one premium-gate entry point as a locked row at the bottom.
6. **Settings/Data/Privacy** — biometric lock toggle, export/import (success + recoverable-failure), the primary premium-gate row wired to a flippable local entitlement boolean.

**Primary user flow:** cold launch → (App Lock gate if enabled, must succeed before anything else renders) → promise → privacy → income entry (skippable, lands on Dashboard's insufficient-data state if skipped) → reserve entry (skippable, same symmetric treatment) → Dashboard. Recurring use: launch/foreground → (lock gate if enabled) → check Dashboard (~20 sec) → occasionally into Money Inputs (~90 sec to log a cycle) → occasionally Explanation/History or Settings.

**State model per screen:**
- *App Lock:* locked-gate, authenticating, auth-success (returns to last-active surface), auth-failure/retry (non-punitive "try again" copy), passcode-fallback (biometrics unavailable or repeatedly failed — hands off to system passcode entry).
- *Dashboard:* first-load/skeleton, insufficient-data (no ribbon, fallback figure in distinct type treatment), low-confidence-computed (sparse/dashed ribbon), fully-computed (solid ribbon), negative-safe-to-spend (honest main answer, caution-weighted, not an error), reserve-missing (independent empty card, doesn't block the hero), corrupted-storage error (rare, recoverable).
- *Money Inputs:* per-section empty/populated (independent per section), add/edit modal, inline validation error (never blocks a plausible save), destructive-delete confirm, import-applied refresh.
- *Explanation/History:* empty ("once you've logged a cycle, we'll show the math here"), populated breakdown + history, load error.
- *Settings/Data/Privacy:* normal, export success, import picker/success/failure (recoverable), lock enabled/unavailable, premium locked/unlocked.

**Visual direction:** calm instrument panel, not a ledger — warm neutral background, high-contrast text, one accent for action, one caution tone for risk. Governing principle across both confidence tiers and risk-window flags: **evidence and risk are communicated through structure and shape, never color alone.** The hero number sits over an abstract trailing-income "ribbon" — a single stroked `Path`, quantized to monthly points, three fixed weights (solid 2pt = fully-computed, dashed 1pt = low-confidence, absent = insufficient-data), static, no animation/scrubbing/tooltips — with a pre-agreed fallback (a shaped, non-color-only icon: dashed/half-filled/filled circle + text label) if build cost forces a cut. Ribbon treatment is confined to the Dashboard hero and the redacted share card only; Explanation/History stays plain and literal by design. The App Lock gate follows the same calm, composed visual language — never a bare system dialog, never real content visible or inferable underneath.

**Accessibility notes:** hero number uses a hard-floor minimum scale factor, never truncates; ribbon is decorative-only to VoiceOver with confidence tier and provenance spoken in one explicit label; risk-window and confidence signals are always icon-plus-text, never color-only; negative values read as a clear shortfall in VoiceOver, not just "minus"; insufficient-data and reserve-missing states have distinct spoken language; Money Inputs keeps large tap targets despite density; App Lock's unlock action and passcode fallback are fully VoiceOver- and Dynamic-Type-accessible, since a locked-out user has no other way in.

## Design Handoff

Good news — round 3 wasn't really a debate, it was confirmation that the quality gate's complaint was a formatting problem, not a substance problem. Codex and Claude both went back and checked: nearly everything the gate wanted was already fully written out in Codex's round 2 message (the "does not construct" language, the app-switcher redaction state, the full token table, ribbon spec, component inventory, accessibility list) — it just hadn't been pasted into the Final Output as a standalone document, it was cross-referenced instead. Both agreed the fix is mechanical: inline it all directly.

On top of that, Claude found three small real hedges still sitting in the text that needed to become flat decisions rather than "maybe" language:
1. The risk-window threshold said "default recommendation is 14 days" — needs to just say **14 days**, no hedge, since nobody's contested it across two rounds.
2. The typography section said "serif-adjacent... if build environment supports it cleanly" — needs to just say **New York (system serif) with `monospacedDigit()`**, since that was the whole point of proposing an Apple system font in the first place (zero licensing/bundling risk).
3. The "Log Income" sheet-over-Dashboard behavior (not a tab switch) — agreed twice in round 2 discussion — was never actually written into the Dashboard's interaction notes. That sentence needed to go in explicitly or a builder would default to a NavigationLink into Money Inputs and quietly blow the ~90-second logging target.

Both sides signed off that everything else — four-surface IA, enum-gated lock construction, ribbon algorithm, no-external-design call, tokens, components, accessibility, share-card guardrails — carries forward untouched. Nothing new is being argued; this is just about producing the complete standalone artifact.

CONSENSUS: YES

## Final Output

**External design decision:** No external Claude Design pass is required for core product screens. This handoff is builder-ready and self-sufficient — it already contains the structural, non-color-only, restraint-driven decisions (texture-not-color, the ribbon's fixed rules, the enum-gated lock) that would be at real risk of being smoothed away by a generic external design pass defaulting to gradients/glassmorphism/green-red fintech conventions. The Claude Design prompt below is retained only as optional reference material for a later marketing/App Store visuals pass — never as a precondition for building the four core surfaces.

**Information architecture:** One App Lock gate (an enum-driven root state, not a visual overlay) in front of exactly four surfaces — Dashboard, Money Inputs, Explanation/History, Settings/Data/Privacy. No fifth destination. Share and export/import are actions launched from existing surfaces.

---

### 1. App Lock Gate

Purpose: protect sensitive financial data before any data-bearing surface is constructed.

Layout intent: full-screen scrim, warm neutral background, app identity and short privacy reassurance near top-center, single primary "Unlock" action, secondary "Use Passcode" fallback only when needed, no blurred or partially visible app content behind it.

Architecture (must-build-this-way, not a visual suggestion): the app root holds an `AppRootState` enum — `.locked` / `.unlocked`. While `.locked`, the Dashboard, Money Inputs, and Explanation/History view models are **not instantiated at all** — this is a construction-level guarantee, not a rendering-level one. A `.blur()` modifier over live content does not satisfy this requirement, because the real data still exists in memory and view state underneath it.

Key components: app identity block, privacy copy, primary unlock action, passcode fallback action, error/retry message area.

States: locked gate → authenticating → auth success (returns to last-active surface) → auth failure with retry → passcode fallback → biometrics unavailable.

Additional required state: **app resigning active / backgrounding** — on `scenePhase` transition to `.inactive`, the app swaps in a redacted branded placeholder (blank branded background, not a blur of real content) before the system takes its app-switcher snapshot. This closes a real leak vector the multitasking switcher would otherwise expose, undercutting the "your numbers never leave your phone" pitch.

Interaction notes: triggers on cold launch and foreground-from-background when lock is enabled; dismisses with a simple fade, never a slide (a slide implies content was sitting right behind it).

Accessibility: unlock and passcode actions remain large tap targets at all Dynamic Type sizes; VoiceOver announces this as a privacy gate before actions; no hidden content semantics leak through.

Motion: fast fade in/out; no security theatrics.

---

### 2. Onboarding

Purpose: explain the promise, establish privacy, allow immediate start even with sparse or zero data.

Layout intent: short sequence, not a wizard — Promise screen → Privacy screen → Income Entry screen → Reserve Entry screen. Both income and reserve carry visibly legitimate, equal-weight skip paths (not buried links).

Key components: one-sentence value proposition, privacy reassurance copy, income entry form/quick-add rows, reserve value entry, equal-weight "Skip for now" actions.

States: fresh start; skipped income → lands on Dashboard's insufficient-data state; added one entry → still insufficient-data/low-confidence per the engine's tier rules; validation error on manual entry; save success.

Interaction notes: income comes first (highest-value input); skipping income is a first-class path landing directly on the Dashboard's honest insufficient-data state, never a dead end; skipping reserve preserves a fully working app — only the runway card goes into its own independent empty state; on completion, land directly on Dashboard.

Accessibility: clear form labels; skip actions read as valid options, not secondary/hidden affordances; numeric inputs announce currency context.

Motion: standard push transitions; no onboarding progress theater.

---

### 3. Dashboard

Purpose: deliver the one answer the product exists for.

Layout intent: top hero card dominates the screen; supporting cards directly underneath; quick actions anchored low enough to be fast, not noisy.

Content hierarchy: label "Safe this month" → hero amount → one-sentence interpretation → confidence treatment integrated into the hero's structure (not a separate badge) → Runway/Cushion card → Risk Window card (**risk-window threshold: 14 days** — a fixed product constant, not a placeholder) → quick actions: Log Income, See Why, Share (if shipped).

Key components: `HeroSafeToSpendCard`, `IncomeRibbonPath`, `ConfidenceTierIndicator` (shape-based fallback), `RunwayCard`, `RiskWindowCard`, quick action row.

States: first-load skeleton; insufficient data; low-confidence computed; fully computed; negative safe-to-spend; reserve missing (runway only); recoverable storage/computation error.

State details:
- Insufficient data: no ribbon, fallback/manual-estimate rendered in a distinct non-hero type treatment, explicit honesty copy.
- Low-confidence: sparse/dashed ribbon, visible low-confidence label.
- Fully computed: solid ribbon, most stable layout.
- Negative: still presented as the main answer, caution-weighted, never an error takeover.
- Reserve missing: runway card shows its own explicit empty state; hero remains computed if the income side supports it.

Interaction notes:
- **Log Income quick action presents a sheet directly over the Dashboard — not a tab switch into Money Inputs.** The sheet writes to the exact same income-entry store that Money Inputs reads from. On dismiss, the Dashboard's cached `PlanningResult` recomputes and the hero card runs the same cross-fade used for confidence-tier changes. This is required so the product's ~90-second cycle-logging target isn't quietly turned into a multi-screen detour.
- Share action, if present, opens a separate redacted share render — never the real dashboard view.
- No direct raw-chart interaction on the ribbon (no scrubbing, no tooltips).

Accessibility: hero number never truncates — it reflows to a wrapped two-line presentation before shrinking past a readable floor; ribbon is decorative-only to VoiceOver; VoiceOver announces confidence provenance before or alongside the amount; risk and confidence are always icon-plus-text, never color-only; negative values are announced as a shortfall, not just "minus."

Motion: subtle opacity cross-fade (~200ms) on recompute and on confidence-tier change; **no odometer-style/incrementing digit-counting animation, ever** — that reads as a growth-app flourish and undercuts the calm, honest tone. The ribbon may redraw gently on data change; it never morphs or animates on its own.

---

### 4. Money Inputs

Purpose: manage the three inputs feeding the engine without turning into three mini-apps.

Layout intent: **one vertically scrolling surface with three always-visible anchored sections** — Income, Obligations, Reserve. No segmented control or tab-style picker, because that would hide two of three sections at any given time, directly fighting the requirement that each section's empty/populated state stay independently visible (e.g., a missing reserve should be noticed immediately, not discovered weeks later behind a segment switch).

Key components: `IncomeSectionCard`, `IncomeRow`, `ObligationSectionCard`, `ObligationRow`, `ReserveStatPanel`, add/edit sheets, section empty states.

Income: chronological rows; same-day duplicate entries preserved distinctly (summed into the engine, never merged in the UI); negative/corrective entries visually marked (a distinguishing icon/weight, not just a minus sign, so the distinction survives non-visual accessibility too).

Obligations: grouped by upcoming due date (not category); shows amount, cadence, next due date; cadence chips for weekly/monthly/quarterly/annual/one-off.

Reserve: single current value, last-updated timestamp, inline edit action — never a ledger/list, never a "+" add-row affordance.

States: per-section empty (independent per section); per-section populated; add/edit sheet open; inline validation error (never blocks saving a plausible entry); destructive-delete confirmation; import-applied refresh.

Interaction notes: editing any input triggers an immediate recompute; reserve's empty state is visually and logically distinct from income/obligation empty states — never sharing generic "no data" copy; forms stay short — this is not bookkeeping software.

Accessibility: large row tap targets maintained despite density; distinct labels for correction/negative entries; section headings explicit for screen readers.

Motion: fast sheet presentation/dismissal; small confirmation pulse after save.

---

### 5. Explanation / History

Purpose: prove the number without turning the app into analytics theater.

Layout intent: plain, literal receipt first; raw history second; premium tease only in context, not as a detour. Deliberately no ribbon/texture styling here — that's reserved for the Dashboard hero and the optional share card only, keeping a clean "dashboard answers fast / explanation proves it" contrast.

Content hierarchy: recommendation breakdown (conservative baseline line → obligations effect line → reserve effect line → final safe-to-spend result) → chronological history (income entries, obligation instances) → confidence-tier progression over time → one locked premium row at the bottom (e.g., "See this broken down over 24 months").

Key components: `ReceiptBreakdownBlock`, `HistorySection`, `ConfidenceHistoryRow`, `LockedFeatureRow`.

States: empty ("once you've logged a cycle, we'll show the math here" — deliberately distinct in tone from the Dashboard's insufficient-data copy); populated; load error.

Interaction notes: keep prose clear and hand-reconstructible from raw entries; the premium teaser here can point to deeper history/scenarios.

Accessibility: breakdown read in logical order; monetary line items clearly labeled; empty state distinct from Dashboard's insufficient-data wording.

Motion: minimal — standard navigation transitions only.

---

### 6. Settings / Data / Privacy

Purpose: data controls, privacy controls, premium gate.

Layout intent: sparse grouped list — functional and calm, not promotional.

Content: biometric lock toggle, export data, import data, privacy copy, premium locked/unlocked row, app details if needed.

Key components: `SettingsRow`, `ImportExportRow`, `LockedFeatureRow`, privacy info block.

States: normal; export success; import picker; import success; import failure (recoverable, non-destructive); lock enabled; lock unavailable; premium locked/unlocked.

Interaction notes: export/import use the same versioned JSON schema as persistence (whatever persistence approach the next phase locks); the premium row is wired to a real, flippable local entitlement boolean — settings copy alone does not satisfy this.

Accessibility: clear descriptions for destructive/data-affecting actions; success/failure feedback announced to assistive tech.

Motion: none beyond standard system affordances.

---

### Share Card (should-have, not required for MVP identity)

If built, it must be a genuinely separate render path — never a reuse of the real Dashboard view. Rules: no raw obligation names; no exact sensitive figures if a redacted/rounded mode is chosen; may retain the ribbon's shape as an abstract motif; share flow states are generating → preview → share sheet → cancelled → failure. If not built this cycle, there is no substitute "screenshot the real dashboard" path — that would turn a cut feature into an active privacy hole.

---

### Visual System

Design direction: calm instrument panel — warm neutral background, high-contrast ink text, one restrained accent for action, one muted caution tone for risk/shortfall. Explicitly avoid glossy fintech gradients, green/red semantics, and gamified celebration.

Tokens:
- `bg.primary`: warm paper / mineral off-white
- `surface.card`: slightly lifted neutral
- `text.primary`: near-black ink
- `text.secondary`: warm gray
- `accent.action`: muted teal or deep amber
- `accent.caution`: muted clay/ochre
- `stroke.neutral`: soft gray
- `stroke.confidence.low`: dashed neutral
- `stroke.confidence.full`: solid ink-accent blend

Typography: **the hero amount uses the system serif design — New York — with `monospacedDigit()`, full stop, no conditional.** This gets the "authored, not default-label" feel with zero licensing/bundling risk and inherited Dynamic Type behavior, since it's an Apple system font. Supporting copy and controls use standard SF, kept compact and crisp.

Spacing and shape: 8pt spacing grid; low-elevation, stroked cards; minimal shadows; moderate corner radii.

---

### Ribbon Spec

The ribbon is the app's visual signature and must stay disciplined:
- Single stroked `Path`.
- Uses the **same monthly buckets as the planning engine's confidence calculation** — not a separate display-only window.
- Each month bucket is the summed income for that month.
- **Zero-income months render as real zero-height points, not gaps or interpolation** — an irregular earner's ribbon should visibly show its own dry months; that's the honesty the feature exists for.
- Three styles only: fully computed = solid 2pt; low confidence = dashed 1pt; insufficient data = absent entirely.
- Static only — no tooltips, scrubbing, charts, gradients, or animation flourishes.
- Appears only on the Dashboard hero and the optional Share Card — nowhere else (Explanation/History stays plain and literal by design).

Fallback if build cost forces a cut: a shape-based confidence marker with text label — dashed circle / half-filled circle / filled circle.

---

### Component Inventory

`HeroSafeToSpendCard`, `IncomeRibbonPath`, `ConfidenceTierIndicator`, `RunwayCard`, `RiskWindowCard`, `IncomeRow`, `ObligationRow`, `ReserveStatPanel`, `ReceiptBreakdownBlock`, `LockedFeatureRow`, `AppLockScrim`, `EmptyStateView` (parameterized by copy — no shared generic "No data" text across the five-plus distinct empty states), `ImportExportFeedbackView`.

---

### Accessibility Requirements

Hero number remains readable at accessibility-tier Dynamic Type sizes, reflowing to a wrapped two-line layout before shrinking past a readable floor — never truncating. Confidence and risk signals are always icon/shape-plus-text, never color-only. The ribbon is hidden from VoiceOver's semantic reading; spoken confidence provenance is provided explicitly in one accessibility label (e.g., "Safe to spend this month: $1,240, based on eighteen months of income history"), read before or alongside the raw number. Negative values are announced as a clear shortfall, not just "minus." Reserve-missing and insufficient-income states use distinct spoken descriptions so they're never confused as the same problem. All input rows and lock actions maintain generous tap targets regardless of density. Import/export and auth outcomes are announced to assistive technology.

---

### Claude Design Prompt (reference-only — not a build precondition)

```text
Design an iPhone app called Irregular Income Planner for freelancers, contractors, tipped workers, and seasonal earners. The app's job is to tell the user what is safe to pay themselves this cycle given irregular income history, upcoming fixed obligations, and optional reserve. This is not a generic budget tracker, not a bank-linked finance app, and not a spreadsheet in disguise.

Preserve this exact app structure: one App Lock gate plus four top-level surfaces only: Dashboard, Money Inputs, Explanation/History, Settings/Data/Privacy.

The design must feel premium, calm, private, and trustworthy. The signature visual idea is that confidence is structural, not just labeled. On the Dashboard, the hero safe-to-spend amount sits over a quiet abstract income ribbon derived from trailing monthly income history. This is not a chart to inspect. It is a restrained evidence texture. Fully computed = solid ribbon, low confidence = sparse/dashed ribbon, insufficient data = no ribbon and an honest fallback state. Do not turn this into a generic analytics chart.

Create polished mobile designs for:
- App Lock gate
- Onboarding
- Dashboard
- Money Inputs
- Explanation/History
- Settings/Data/Privacy

Dashboard needs: dominant safe-to-spend amount, one-sentence interpretation, runway/cushion card, risk-window card, quick actions.

Money Inputs needs three clearly distinct sections on one screen: income list, obligations grouped by due date, reserve as a single current value with last-updated timestamp, not a ledger.

Explanation/History should read like a receipt for the recommendation, followed by chronological history. Settings should include biometric lock, export/import, privacy copy, and a locked premium row.

Visual direction: warm neutral background, dark ink typography, one restrained action accent, one muted caution tone, flat stroked cards, minimal shadow, no flashy fintech gradients, no green/red dependence, no gamified motion.

Accessibility is mandatory: Dynamic Type-safe hero amount, icon-plus-text risk and confidence, VoiceOver-friendly confidence provenance, large tap targets, no color-only meaning.

Provide component specs, state variants, and motion notes. Do not redesign the product architecture.
```

---

**Forward note for the next phase (not resolved here, not blocking):** persistence architecture — SwiftData vs. hand-rolled Codable/JSON with atomic writes — still needs an explicit decision before implementation, given the "byte-identical after relaunch" acceptance bar locked earlier in the project.

## Ios Architecture Review

Round 3 closes this out cleanly. Codex went through Claude's three round-2 proposals one by one and locked all of them: the relaunch test has to be two separate assertions (raw record equality on reload, then a separate re-run of the engine against the reloaded records with the original `asOf` to prove there's no hidden wall-clock dependency), import is replace-only — never merge — because merge would require inventing a second silent-reconciliation engine that contradicts the app's own "no silent dedup" principle, and validation has to fully complete in memory before any write touches the real document. He also settled the Keychain question outright: "I floated it earlier out of instinct more than conviction... it doesn't survive scrutiny" — no Keychain anywhere, because there's no actual secret here, just a lock-enabled toggle and a premium boolean, and the one truly sensitive thing (the financial data) is already covered by file protection plus the architectural lock gate.

That produced a clean two-file persistence shape both of them landed on independently and then confirmed together: a portable `financial-document.json` (income, obligations, reserve, schema version — the thing export/import actually touches) and a separate `app-settings.json` (lock-enabled, entitlement, onboarding-completed — never touched by import/export), both Codable, both atomically written, both under standard file protection.

Claude's round 3 additions were just sharpening the test suite into concrete cases rather than proposing anything new to fight about: a test that hands the import path a file that fails schema validation and asserts the on-disk document is byte-identical afterward (proving validate-before-swap actually works, not just "didn't crash"), a mirror test that cancelling an import leaves zero disk writes, and an explicit, on-the-record decision to *not* build a large-import performance test at MVP scale (believed fine, revisit if a real user hits it) rather than silently skipping it. Codex didn't get a chance to react to these last two specifics, but they're mechanical extensions of things he already agreed to, not new territory, and Claude closed her message saying she has nothing left to contest.

CONSENSUS: YES

## Final Output

**SwiftUI architecture:** SwiftUI + Observation (iOS 17+). Business logic lives entirely outside view models in a pure, deterministic `PlanningEngine`: `(income: [IncomeEntry], obligations: [Obligation], reserve: ReserveSnapshot?, asOf: Date) -> PlanningResult` — zero side effects, zero SwiftUI/persistence dependencies, `asOf` always passed explicitly (never a default `Date()`) so tests are deterministic. Above that, thin `@MainActor @Observable` view models per surface hold raw record arrays and a cached `PlanningResult`, recomputed explicitly on mutation — never inside `body`. The app root is a small state machine, not a view: `AppRootState: .locked / .unlocked`. While `.locked`, the Dashboard/Money-Inputs/Explanation-History view models are not instantiated at all — verified by a unit test on the root coordinator asserting those view models are `nil` in the locked case, since a UI test can only prove what rendered, not what got constructed.

**Apple framework choices:** SwiftUI, Observation, Foundation (`Decimal` for all money math, explicit-locale `NumberFormatter`, `Codable`), `LocalAuthentication` (wrapped behind an `AuthenticatorProtocol` so the lock state machine — authenticating/success/retry/passcode-fallback/unavailable — is testable without real hardware), `UniformTypeIdentifiers` plus `.fileImporter`/`ShareLink` for JSON import/export. No Apple Charts (the ribbon stays a hand-drawn static `Path` on purpose — Charts would pull it toward analytics UI). No CloudKit, no Core ML/Vision/Speech, no ARKit, no background tasks, no notifications framework. "Cloud-ready later" means a repository boundary and a pure engine, not an early sync-framework dependency.

**Persistence and local data plan:** No SwiftData. Hand-rolled versioned `Codable` JSON with atomic writes (write-to-temp, then `FileManager.replaceItemAt`), because the "byte-identical after relaunch" bar needs to be provable by inspecting one file and rerunning one pure function — not trusted to a framework's opaque change-tracking. Two files in Application Support, both under standard file protection: `financial-document.json` (income entries, obligations, reserve snapshots, `schemaVersion` — the only thing export/import touches) and `app-settings.json` (lock-enabled, entitlement flag, onboarding-completed, `schemaVersion` — deliberately kept out of the portable document so premium/lock state never travels in an export). No Keychain anywhere — there's no actual secret in this app; the sensitive asset (financial data) is already covered by file protection plus the architectural lock gate. No persisted derived data ever — no cached monthly buckets, no stored "last safe-to-spend" figure; everything is recomputed from raw records every time. Import is replace-only, never merge, with a confirmation dialog before the swap; the imported document must be fully decoded and domain-validated in memory before the live document is touched, so a bad import can only fail cleanly, never half-write.

**Permissions/privacy plan:** No network dependency, no account, no analytics, no tracking. One permission string total (`NSFaceIDUsageDescription`) if biometric lock ships. File access only through explicit user-initiated import/export. No contacts, camera, photo library, location, calendar, or background-refresh permissions. On a device with no biometrics and no passcode enrolled, the app falls through to "lock unavailable" and stays functional but unlocked with a visible Settings notice — it never strands a user behind a gate that can't succeed. App-switcher-snapshot redaction (swap to a branded placeholder on `scenePhase == .inactive`, before the system snapshot) is required, shippable behavior, but it's tracked as a manual QA checklist item at build review, not an automated test — `scenePhase` background transitions are too flaky in CI to fake as a proven guarantee.

**Dependency/license decision:** Zero third-party packages. Nothing in this app's scope — JSON handling, persistence, charting, paywall — clears the bar of "removes substantial implementation risk without compromising auditability, privacy, or licensing clarity." StoreKit itself stays deferred per earlier phases; the premium flag sits behind a small `EntitlementService` abstraction so a real purchase flow can be wired in later without touching the engine or screens.

**Testing implications:** Heavily weighted toward engine determinism and persistence correctness over UI coverage. Engine unit tests against fixture JSON: windfall month doesn't inflate the baseline, lean-month handling, zero/one-entry fallback, two-to-five-entry low-confidence tier, negative safe-to-spend, cadence expansion for all five obligation types, 14-day risk-window flagging, reserve-missing as an independent empty state, same-day duplicate summation, negative corrections. The relaunch acceptance bar is explicitly two separate assertions, not one: raw record equality after reload, then a separate re-run of the engine against the reloaded records with the original `asOf`, asserting an identical `PlanningResult` — this is the only version of "byte-identical after relaunch" that actually proves the product's promise rather than just proving JSON round-trips. Import gets negative-path tests as first-class citizens: a schema-invalid import file must leave the on-disk document byte-identical to its pre-import state (proving validate-before-swap actually works, not just "didn't crash"), and cancelling the import confirmation must produce zero disk writes, not even a stray temp file. A small, deliberately non-exhaustive set of snapshot tests covers the hero card across its confidence states at default and accessibility-5 Dynamic Type sizes. Large-import performance testing (e.g., two years of daily entries) is explicitly triaged out at MVP scale as a documented decision ("not tested, believed fine, revisit if reported") rather than a silent gap.

## Tech Specs

The gate's catch was real and both Codex and Claude fixed it the same way, independently reasoning through the same conclusion: `manualFallbackEstimate` moves onto `FinancialDocument` (not `AppSettings`), `FinancialStore.init` hydrates it from there instead of defaulting to `nil` every launch, and `snapshotDocument()` round-trips it back out so export/import doesn't quietly drop it either. Claude added one more good catch while she was in there — a negative manual fallback estimate has no sensible meaning (unlike a negative income entry, which is a legitimate correction/refund), so `validateFinancialDocument` now rejects it. Codex's round-4 message doesn't explicitly react to that last addition, but it doesn't contradict anything he said and it's a narrow, well-reasoned extension of the same fix, not a new fight. Since this is the final round, I'm accepting it as part of the closed contract rather than holding the phase open for a rubber-stamp on an uncontested addition.

Everything else that was locked across rounds 1–3 — the shared concrete `FinancialStore`/`AppSettingsStore` model, the non-throwing `PlanningEngine`, the array-based `RiskWindowFlag`, the four-case `AppRootState` with a side-channel load-error property, the lean record shapes with no `updatedAt`, the naming pass, `ImportFlowState` as the sole surviving screen-state enum — carries forward unchanged. Gemini never came online across all four rounds, but the two active participants converged with no open substantive disagreement, and the one real defect the quality gate found has been fixed and independently confirmed.

CONSENSUS: YES

## Final Output

**Architecture overview:** SwiftUI + Observation (iOS 17+). All business logic lives in a pure, non-throwing `PlanningEngine.evaluate` — a static function taking `income`, `obligations`, `reserve`, `manualFallbackEstimate`, an always-explicit `asOf: Date`, and a `PlanningConfig` (defaulting to `.standard`) — with zero side effects and zero hidden constants. Above that sits exactly one shared source of truth: a concrete `@MainActor @Observable final class FinancialStore` (income/obligations/reserve/manual fallback plus a cached `planningResult`, recomputed synchronously on every mutator call, every mutator taking an explicit per-call `asOf: Date`) and a parallel `AppSettingsStore`, both owned by `AppRootCoordinator` and injected via `@Environment` once fully populated — never duplicated per screen. `FinancialStore` stays a concrete class rather than a protocol: there's only one real implementation, and routing `@Observable` access through a protocol existential risks breaking or degrading Observation's fine-grained view-update tracking, while `@Environment(Type.self)` injection is documented against concrete types. The one place a genuine hardware-wrapping protocol is warranted is `AuthenticatorProtocol`, since it wraps untestable `LAContext` behavior. The app root is a four-case `AppRootState` (`.launching/.onboarding/.locked/.unlocked`) — while `.locked`, the financial document is not even decoded into memory. On unlock, the document load begins the moment the user initiates authentication (running concurrently with the biometric prompt, never before it and never exposed before it succeeds), and is discarded if auth fails or is cancelled. Because a screen is never constructed before the store is fully populated, screens read `store.planningResult.confidenceTier` etc. directly rather than through a loading/ready wrapper enum; only Settings' import feature gets its own genuine async state (`ImportFlowState`). Storage corruption is a side-channel `financialStoreLoadError` on the coordinator, not a root-level takeover, so a corrupted file never blocks the user's path to Settings/import-backup.

**File/module layout:** `Domain/` (pure engine, record types, `PlanningConfig`, no SwiftUI/persistence imports), `Domain/Validation/DomainValidator.swift`; `Persistence/` (`FinancialDocumentStore`, `SettingsStore`, atomic-write implementations); `Auth/` (`AuthenticatorProtocol` + real/fake implementations); `Entitlement/` (`EntitlementService`); `Services/ImportExport/ImportExportService.swift`; `Services/Formatting/CurrencyFormatting.swift`; `App/` (root coordinator, `AppRootState`, scene lifecycle); `Features/{Dashboard,MoneyInputs,ExplanationHistory,Settings,Onboarding,AppLock}` (view + presentation-only view model per screen); `SharedUI/` (parameterized `EmptyStateView`, hero card, ribbon path, formatting helpers); `Tests/{DomainTests,PersistenceTests,ViewModelTests,SnapshotTests}`.

**Data models (final, canonical):**
- `IncomeEntry { id, amount: Decimal, receivedOn: Date, note: String?, createdAt: Date, isCorrection: Bool (computed from amount < 0) }` — no `updatedAt`; same-date duplicates always distinct records.
- `Obligation { id, name, amount: Decimal, cadence: ObligationCadence, dueDate: Date, createdAt: Date }` — no `endDate`/`isActive`/`updatedAt`.
- `ObligationCadence { weekly, monthly, quarterly, annual, oneOff }`.
- `ReserveSnapshot { amount: Decimal, lastUpdated: Date }` — single current value, never a ledger.
- `ConfidenceTier { insufficientData(manualFallback: Decimal?), lowConfidenceComputed, fullyComputed }`.
- `MonthlyBucket { monthStart: Date, totalIncome: Decimal }` — zero-income months always materialized.
- `RiskWindowFlag { obligationID, obligationName, amount, dueInDays }` as an array on `PlanningResult`.
- `RunwayResult { monthsOfRunway, basedOnReserveAmount, reserveLastUpdated }`, nil when reserve is missing.
- `ExplanationLineItem { id, label, amount, emphasis }`.
- `PlanningConfig { lookbackMonths, lowConfidenceEntryThreshold, fullyComputedEntryThreshold, riskWindowDays, baselinePercentile, currencyCode? }`, `.standard` = 12 months / 2 / 6 / 14 days / 10th percentile.
- `PlanningResult { asOf, safeToSpend (never floored at zero), confidenceTier, baseline, obligationsDueThisCycle, runway?, riskWindowFlags, monthlyIncomeBuckets, explanation }` — never persisted.
- **`FinancialDocument { schemaVersion, incomeEntries, obligations, reserve?, manualFallbackEstimate? }`** — the field added this round; this is the only thing export/import touches, and manual fallback now correctly survives relaunch and travels with a backup, since it's the user's own financial input, not app config.
- `AppSettings { schemaVersion, onboardingCompleted, lockEnabled, entitlementActive }` — deliberately excludes manual fallback; never touched by import/export.

**Persistence strategy:** No SwiftData, no Keychain. Two versioned `Codable` JSON files in Application Support under file protection, both atomically written: `financial-document.json` and `app-settings.json`. Import is replace-only, fully validated in memory (including a new check rejecting a negative `manualFallbackEstimate`, which has no sensible meaning unlike a negative income correction) before any write touches the live document, with a user confirmation step before the swap.

**Testing strategy:** Engine fixture tests (windfall/lean months, all confidence tiers, all cadences, 14-day risk window with multiple simultaneous flags, negative safe-to-spend, same-day duplicates, negative income corrections, rejected negative fallback estimate). Persistence: two-part relaunch assertion (raw record equality, then a fresh engine run against reloaded records with the original `asOf`) — now explicitly covering `manualFallbackEstimate` durability as part of that same test, plus export/import round-trip proving an insufficient-data user lands on the identical `ConfidenceTier.insufficientData(manualFallback:)` after restore. Schema-invalid import leaves the on-disk file byte-identical; cancelled import produces zero writes. Coordinator: `financialStore == nil` while `.locked`; failed/cancelled auth discards any in-flight document load. Selective hero-card snapshot tests across confidence states at default and accessibility-5 Dynamic Type. App-switcher-snapshot redaction stays a manual QA checklist item.

```interfaces-json
{"interfaces": [
  {"name": "IncomeEntry", "kind": "struct", "language": "swift", "signature": "struct IncomeEntry: Identifiable, Codable, Hashable, Sendable { let id: UUID; var amount: Decimal; var receivedOn: Date; var note: String?; let createdAt: Date; var isCorrection: Bool { amount < 0 } }", "owning_lane": "data_domain", "notes": "FINAL. No updatedAt. receivedOn chosen over bare date for legibility against createdAt. isCorrection computed from sign, never stored. Same-date duplicates always distinct records, never merged."},
  {"name": "ObligationCadence", "kind": "enum", "language": "swift", "signature": "enum ObligationCadence: String, Codable, CaseIterable, Sendable { case weekly, monthly, quarterly, annual, oneOff }", "owning_lane": "data_domain", "notes": "Agreed across all rounds."},
  {"name": "Obligation", "kind": "struct", "language": "swift", "signature": "struct Obligation: Identifiable, Codable, Hashable, Sendable { let id: UUID; var name: String; var amount: Decimal; var cadence: ObligationCadence; var dueDate: Date; let createdAt: Date }", "owning_lane": "data_domain", "notes": "FINAL. No updatedAt/endDate/isActive. A one-off obligation past its dueDate simply stops producing occurrences in cadence expansion; stays visible until deleted. Amount always manual, engine never estimates it."},
  {"name": "ReserveSnapshot", "kind": "struct", "language": "swift", "signature": "struct ReserveSnapshot: Codable, Hashable, Sendable { var amount: Decimal; var lastUpdated: Date }", "owning_lane": "data_domain", "notes": "Single current value, never a ledger."},
  {"name": "ConfidenceTier", "kind": "enum", "language": "swift", "signature": "enum ConfidenceTier: Codable, Hashable, Sendable { case insufficientData(manualFallback: Decimal?); case lowConfidenceComputed; case fullyComputed }", "owning_lane": "data_domain", "notes": "Screens switch on this directly. manualFallback now durably sourced from FinancialDocument.manualFallbackEstimate via PlanningEngine.evaluate's manualFallbackEstimate parameter."},
  {"name": "MonthlyBucket", "kind": "struct", "language": "swift", "signature": "struct MonthlyBucket: Codable, Hashable, Sendable { var monthStart: Date; var totalIncome: Decimal }", "owning_lane": "data_domain", "notes": "Zero-income months present with totalIncome == 0, never omitted."},
  {"name": "RiskWindowFlag", "kind": "struct", "language": "swift", "signature": "struct RiskWindowFlag: Identifiable, Codable, Hashable, Sendable { var id: UUID { obligationID }; var obligationID: UUID; var obligationName: String; var amount: Decimal; var dueInDays: Int }", "owning_lane": "data_domain", "notes": "FINAL. Array-of-flags — multiple simultaneous obligations stay distinguishable. Empty array = clear."},
  {"name": "RunwayResult", "kind": "struct", "language": "swift", "signature": "struct RunwayResult: Codable, Hashable, Sendable { var monthsOfRunway: Decimal; var basedOnReserveAmount: Decimal; var reserveLastUpdated: Date }", "owning_lane": "data_domain", "notes": "Nil on PlanningResult when reserve is missing."},
  {"name": "ExplanationLineItem", "kind": "struct", "language": "swift", "signature": "struct ExplanationLineItem: Identifiable, Codable, Hashable, Sendable { let id: UUID; var label: String; var amount: Decimal; var emphasis: ExplanationEmphasis }", "owning_lane": "data_domain", "notes": "Uncontested since round 1."},
  {"name": "ExplanationEmphasis", "kind": "enum", "language": "swift", "signature": "enum ExplanationEmphasis: String, Codable, Sendable { case normal, caution, result }", "owning_lane": "data_domain", "notes": "Uncontested."},
  {"name": "PlanningConfig", "kind": "struct", "language": "swift", "signature": "struct PlanningConfig: Codable, Hashable, Sendable { var lookbackMonths: Int; var lowConfidenceEntryThreshold: Int; var fullyComputedEntryThreshold: Int; var riskWindowDays: Int; var baselinePercentile: Int; var currencyCode: String?; static let standard = PlanningConfig(lookbackMonths: 12, lowConfidenceEntryThreshold: 2, fullyComputedEntryThreshold: 6, riskWindowDays: 14, baselinePercentile: 10, currencyCode: nil) }", "owning_lane": "data_domain", "notes": "FINAL. No BaselineStrategy enum. Compiled-in constants, never user-editable, never persisted."},
  {"name": "PlanningResult", "kind": "struct", "language": "swift", "signature": "struct PlanningResult: Codable, Hashable, Sendable { var asOf: Date; var safeToSpend: Decimal; var confidenceTier: ConfidenceTier; var baseline: Decimal; var obligationsDueThisCycle: Decimal; var runway: RunwayResult?; var riskWindowFlags: [RiskWindowFlag]; var monthlyIncomeBuckets: [MonthlyBucket]; var explanation: [ExplanationLineItem] }", "owning_lane": "data_domain", "notes": "Never floored at zero, never persisted."},
  {"name": "PlanningEngine", "kind": "function", "language": "swift", "signature": "enum PlanningEngine { static func evaluate(income: [IncomeEntry], obligations: [Obligation], reserve: ReserveSnapshot?, manualFallbackEstimate: Decimal?, asOf: Date, config: PlanningConfig = .standard) -> PlanningResult }", "owning_lane": "data_domain", "notes": "FINAL. Concrete namespace, non-throwing, asOf always caller-supplied. manualFallbackEstimate parameter unchanged by the round-4 fix — the fix gave it a durable upstream source, not a new consumption shape."},
  {"name": "FinancialDocument", "kind": "struct", "language": "swift", "signature": "struct FinancialDocument: Codable, Sendable { var schemaVersion: Int; var incomeEntries: [IncomeEntry]; var obligations: [Obligation]; var reserve: ReserveSnapshot?; var manualFallbackEstimate: Decimal? }", "owning_lane": "services_utilities", "notes": "FIXED per quality gate in round 4: manualFallbackEstimate now lives here (not AppSettings), since it's user-entered financial data that should survive relaunch and travel with export/import, same as reserve. The only thing export/import touches."},
  {"name": "AppSettings", "kind": "struct", "language": "swift", "signature": "struct AppSettings: Codable, Sendable { var schemaVersion: Int; var onboardingCompleted: Bool; var lockEnabled: Bool; var entitlementActive: Bool }", "owning_lane": "services_utilities", "notes": "Never touched by import/export; corruption resets silently to defaults. Deliberately excludes manualFallbackEstimate."},
  {"name": "FinancialStore", "kind": "class", "language": "swift", "signature": "@MainActor @Observable final class FinancialStore { private(set) var incomeEntries: [IncomeEntry]; private(set) var obligations: [Obligation]; private(set) var reserve: ReserveSnapshot?; private(set) var manualFallbackEstimate: Decimal?; private(set) var planningResult: PlanningResult; init(document: FinancialDocument, config: PlanningConfig = .standard, asOf: Date); func addIncome(_ entry: IncomeEntry, asOf: Date); func updateIncome(_ entry: IncomeEntry, asOf: Date); func deleteIncome(id: UUID, asOf: Date); func addObligation(_ o: Obligation, asOf: Date); func updateObligation(_ o: Obligation, asOf: Date); func deleteObligation(id: UUID, asOf: Date); func updateReserve(amount: Decimal, asOf: Date); func updateManualFallbackEstimate(_ value: Decimal?, asOf: Date); func replaceAll(with document: FinancialDocument, asOf: Date); func snapshotDocument() -> FinancialDocument }", "owning_lane": "data_domain", "notes": "FIXED: init hydrates manualFallbackEstimate from document.manualFallbackEstimate instead of defaulting to nil every launch; snapshotDocument() must include the current value in its returned FinancialDocument or export/import reintroduces the same data-loss bug through a different door. Concrete class, not protocol (only one real implementation; protocol existentials risk degrading @Observable's fine-grained tracking; @Environment(Type.self) is documented against concrete types). Explicit per-call asOf on every mutator. Single shared instance owned by AppRootCoordinator, injected via environment only once fully populated — no per-screen copies of these arrays."},
  {"name": "AppSettingsStore", "kind": "class", "language": "swift", "signature": "@MainActor @Observable final class AppSettingsStore { private(set) var settings: AppSettings; func setLockEnabled(_ v: Bool); func setEntitlementActive(_ v: Bool); func setOnboardingCompleted(_ v: Bool) }", "owning_lane": "data_domain", "notes": "Loaded before FinancialStore since root-phase determination depends on it."},
  {"name": "FinancialDocumentStore", "kind": "protocol", "language": "swift", "signature": "protocol FinancialDocumentStore { func load() async throws -> FinancialDocument; func save(_ document: FinancialDocument) async throws }", "owning_lane": "services_utilities", "notes": "Persistence-layer protocol, fakeable for tests. Atomic writes off the main actor."},
  {"name": "SettingsStore", "kind": "protocol", "language": "swift", "signature": "protocol SettingsStore { func load() async throws -> AppSettings; func save(_ settings: AppSettings) async throws }", "owning_lane": "services_utilities", "notes": "Decode failure treated by the caller as AppSettings defaults, never launch-blocking."},
  {"name": "ImportValidationError", "kind": "enum", "language": "swift", "signature": "enum ImportValidationError: Error, Sendable { case malformedJSON; case unsupportedSchemaVersion(found: Int); case invalidRecord(reason: String) }", "owning_lane": "services_utilities", "notes": "Any case must leave the on-disk document byte-identical to its pre-import state. invalidRecord now also covers a negative manualFallbackEstimate."},
  {"name": "ImportExportService", "kind": "protocol", "language": "swift", "signature": "protocol ImportExportService { func exportData(_ document: FinancialDocument) throws -> Data; func validateImport(_ data: Data) throws -> FinancialDocument }", "owning_lane": "services_utilities", "notes": "Data-based for in-memory-fixture testability. Zero disk writes or store mutation inside this call. manualFallbackEstimate now round-trips correctly since it's part of FinancialDocument."},
  {"name": "AuthAvailability", "kind": "enum", "language": "swift", "signature": "enum AuthAvailability: Sendable { case biometric; case passcodeOnly; case unavailable }", "owning_lane": "services_utilities", "notes": ".unavailable falls through to unlocked-with-notice, never a dead end."},
  {"name": "AuthResult", "kind": "enum", "language": "swift", "signature": "enum AuthResult: Sendable { case success; case failure(retryable: Bool); case userCancelled }", "owning_lane": "services_utilities", "notes": "Agreed."},
  {"name": "AuthenticatorProtocol", "kind": "protocol", "language": "swift", "signature": "protocol AuthenticatorProtocol { func availability() -> AuthAvailability; func authenticate(reason: String) async -> AuthResult }", "owning_lane": "services_utilities", "notes": "FINAL name, matching the ios_architecture_review lock. Wraps LAContext for testability without hardware."},
  {"name": "EntitlementService", "kind": "protocol", "language": "swift", "signature": "protocol EntitlementService { var isEntitled: Bool { get }; func setEntitled(_ value: Bool) }", "owning_lane": "services_utilities", "notes": "Reads/writes AppSettingsStore.settings.entitlementActive; LockedFeatureRow binds only to this."},
  {"name": "CurrencyFormatting", "kind": "protocol", "language": "swift", "signature": "protocol CurrencyFormatting { func string(from amount: Decimal, currencyCode: String?, locale: Locale) -> String }", "owning_lane": "services_utilities", "notes": "Single formatting path, currencyCode nil defers to locale's currency."},
  {"name": "AppRootState", "kind": "enum", "language": "swift", "signature": "enum AppRootState: Sendable { case launching; case onboarding; case locked; case unlocked }", "owning_lane": "primary_ui", "notes": "No root-level recoverable-error case — corrupted storage handled after unlock via financialStoreLoadError."},
  {"name": "AppRootCoordinator", "kind": "class", "language": "swift", "signature": "@MainActor @Observable final class AppRootCoordinator { private(set) var phase: AppRootState; private(set) var financialStore: FinancialStore?; private(set) var settingsStore: AppSettingsStore?; private(set) var financialStoreLoadError: Error?; func bootstrap() async; func beginUnlock() async; func handleScenePhaseChange(_ newPhase: ScenePhase) }", "owning_lane": "primary_ui", "notes": "financialStore stays nil/undecoded until authentication succeeds. Document load starts only once unlock is user-initiated, concurrently with authenticate(); discarded if auth fails/cancelled. Corrupted document sets financialStoreLoadError, phase still becomes .unlocked."},
  {"name": "DashboardViewModel", "kind": "protocol", "language": "swift", "signature": "@MainActor protocol DashboardViewModel: AnyObject { var isQuickAddPresented: Bool { get set }; func presentQuickAdd(); func dismissQuickAdd() }", "owning_lane": "primary_ui", "notes": "Presentation state only — reads live planning data from the shared FinancialStore."},
  {"name": "MoneyInputsViewModel", "kind": "protocol", "language": "swift", "signature": "@MainActor protocol MoneyInputsViewModel: AnyObject { var editingIncomeID: UUID? { get set }; var editingObligationID: UUID? { get set }; var isReserveEditorPresented: Bool { get set } }", "owning_lane": "primary_ui", "notes": "Presentation state only. The manual-fallback-estimate editor also writes through FinancialStore.updateManualFallbackEstimate, never a local copy."},
  {"name": "ExplanationHistoryViewModel", "kind": "protocol", "language": "swift", "signature": "@MainActor protocol ExplanationHistoryViewModel: AnyObject { var selectedHistoryFilter: String? { get set } }", "owning_lane": "primary_ui", "notes": "Presentation state only; data read from PlanningResult and FinancialStore directly."},
  {"name": "SettingsViewModel", "kind": "protocol", "language": "swift", "signature": "@MainActor protocol SettingsViewModel: AnyObject { var importErrorMessage: String? { get set }; var exportSucceeded: Bool { get set } }", "owning_lane": "primary_ui", "notes": "Presentation state only; persisted values remain in shared stores/services."},
  {"name": "ImportFlowState", "kind": "enum", "language": "swift", "signature": "enum ImportFlowState: Sendable { case idle; case validating; case confirmingReplace(FinancialDocument); case success; case failure(ImportValidationError) }", "owning_lane": "primary_ui", "notes": "Sole surviving screen-state enum, scoped to Settings' import feature."},
  {"name": "recomputePlanningResult", "kind": "function", "language": "swift", "signature": "func recomputePlanningResult(document: FinancialDocument, manualFallbackEstimate: Decimal?, asOf: Date, config: PlanningConfig) -> PlanningResult", "owning_lane": "polish_resilience", "notes": "Single helper path into PlanningEngine.evaluate. manualFallbackEstimate now consistently sourced from document.manualFallbackEstimate."},
  {"name": "validateFinancialDocument", "kind": "function", "language": "swift", "signature": "func validateFinancialDocument(_ document: FinancialDocument) throws", "owning_lane": "polish_resilience", "notes": "Shared domain validation for import and post-decode load checks. Now also rejects a negative manualFallbackEstimate as ImportValidationError.invalidRecord — unlike IncomeEntry.amount, a negative value here has no sensible meaning."},
  {"name": "SnapshotRedactionModifier", "kind": "function", "language": "swift", "signature": "extension View { func redactedOnInactive(_ isInactive: Bool) -> some View }", "owning_lane": "polish_resilience", "notes": "Swaps to a branded placeholder on scenePhase == .inactive before the system app-switcher snapshot; manual QA checklist item, not an automated test."}
]}
```

## Project Plan

Both Codex and Claude landed on exactly the same fix for the gate's catch, and Claude's extra reasoning (that the scrim and coordinator are load-bearing for each other — you can't really test "failed auth discards in-flight load" without the retry UI that triggers it) is a good extension nobody contradicts, just something Codex didn't get to see explicitly. This was a narrow placement bug, not a reopening of anything — the six-milestone shape, the parallel services lane, the fallback-durability and coordinator-ordering tests living inside Milestones 2 and 3, the shared-UI sub-step, the named import/export test, and the lock-cut trigger all still stand untouched.

CONSENSUS: YES

## Final Output

**Milestone 1 — Domain contract, frozen.** Build `Domain/` complete against the round-4 (final, post-quality-gate) shapes only: all record types, `PlanningConfig`, non-throwing `PlanningEngine.evaluate`, `validateFinancialDocument`. No SwiftUI or persistence dependencies. Exit criteria: fixture suite green covering windfall non-inflation, lean-month handling, all three confidence tiers at exact thresholds (0/1, 2–5, 6+), all five cadence expansions, 14-day risk-window flagging with multiple simultaneous obligations, negative safe-to-spend left unfloored, same-day duplicate summation, negative income corrections, and a rejected negative `manualFallbackEstimate`. Whoever writes the task breakdown must be pointed at this phase's final round-4 `FinancialDocument`/`PlanningEngine` shapes specifically, not an earlier round of tech_specs.

**Milestone 1b (parallel, starts immediately alongside Milestone 1) — Services/persistence plumbing.** Real + fake `FinancialDocumentStore`, `SettingsStore`, `ImportExportService`, `AuthenticatorProtocol` (wrapping `LAContext`), `EntitlementService`, `CurrencyFormatting`. Allowed to start now because it only depends on frozen struct shapes, not on Milestone 1's tests passing. Does not touch `FinancialStore` or the coordinator.

**Milestone 2 — `FinancialStore` integrity.** Concrete `@MainActor @Observable FinancialStore` wired to real persistence: mutators recompute synchronously with explicit per-call `asOf`. Exit criteria, explicitly named: a test that mutates `manualFallbackEstimate`, snapshots the document, reloads through a fake store, and asserts identical state — proving the exact class of bug the quality gate caught in tech_specs doesn't come back; plus the two-part relaunch assertion (raw record equality, then a fresh engine run against reloaded records with the original `asOf`).

**Milestone 3 — App lifecycle and lock boundary, including the real `AppLockScrim` view.** This milestone owns both the state machinery and the actual lock UI as one inseparable unit: `AppRootCoordinator`, `AppSettingsStore`-before-`FinancialStore` bootstrap ordering, unlock-triggered document decode, corrupted-storage recovery, snapshot redaction — *and* the `AppLockScrim` SwiftUI view itself, built here rather than deferred, with its five states (locked-gate, authenticating, success, failure-with-retry, passcode-fallback). The scrim and coordinator are designed together on purpose: the coordinator's "failed/cancelled auth discards in-flight load" behavior is actually driven by user action through this view, so testing one without the other existing is testing it dishonestly. Exit criteria: unit test proving `AppSettingsStore` resolves before any `FinancialStore` load attempt; `financialStore` provably nil while `.locked`; failed/cancelled auth discards any in-flight document load; a corrupted financial JSON still leaves Settings/import reachable; and a manual/visual check that the locked scrim never composites, blurs, or otherwise leaks anything from the financial document underneath it.

*Biometric lock contingency, decided now, not discovered later:* lock stays in the baseline plan through Milestone 3. If Milestone 3 meaningfully overruns its allotted time (roughly a third over), the pre-agreed cut is: drop the real `LAContext`-backed path and the `AppLockScrim` view together, shipping "lock unavailable, functionally unlocked with a visible Settings notice" as permanent behavior. That cut removes both the `.locked` runtime path and `AppLockScrim` from **Milestone 3's** scope, and removes "`financialStore` nil while locked" from the verification plan — all three changes happen together, at the milestone that actually owns them, not as a later surprise and not misattributed to Milestone 4.

**Milestone 4 — First real vertical slice (first user-value milestone).** Cold launch → (lock gate, if enabled, per Milestone 3) → onboarding with symmetric skip affordances → add income → add obligation → optional reserve or manual fallback estimate → Dashboard showing safe-to-spend with correct confidence tier and honest empty states → force-quit → relaunch → same result. The first sub-step of this milestone's UI work, before either screen is built, is the shared component layer: `EmptyStateView`, the hero card, the ribbon path, currency formatting — built once so Dashboard and Money Inputs don't each invent their own version of "insufficient data." Zero/one-entry users are a required part of this slice's definition of done, not a follow-up. The App Lock screen itself is not built here — it's inherited from Milestone 3 and simply sits in front of this flow when enabled. Exit criteria: a real, timed user path from empty app to a trustworthy safe-to-spend number, surviving relaunch, without the skip path ever feeling like a dead end.

**Milestone 5 — Lateral expansion.** Full Money Inputs CRUD (cadence-aware obligations, reserve editing, same-day duplicates, negative corrections, immediate recompute), Explanation/History as the audit surface, Settings/Data/Privacy with export/import replace flow, and a thin two-surface premium gate wired to the real `EntitlementService`. Exit criteria for export/import specifically: schema-invalid import leaves the on-disk document byte-identical; cancelled import produces zero writes; and — named explicitly — an insufficient-data user's `manualFallbackEstimate` survives an export/import round trip and lands on the identical `ConfidenceTier.insufficientData(manualFallback:)`, since that's a derived-state assertion a raw-document-equality test could pass while still hiding a wiring bug.

**Milestone 6 — Hardening and final acceptance.** Accessibility (AX5 hero layout, VoiceOver wording for confidence/shortfall/risk states), locale/currency formatting, large-number formatting, passcode-unavailable behavior, app-switcher redaction (manual QA, not automated), duplicate-date auditability, negative-fallback rejection re-verified end to end. Closing gate: the full acceptance bar carried since `prompt_contract` — multi-month data with a lean month and a windfall month, safe-to-spend that doesn't spike off the windfall, hand-checkable runway math, honest zero/one-entry states, all of it surviving a full relaunch — run once against the assembled app as its own scheduled pass/fail milestone, not assumed to be automatically satisfied by the sum of earlier unit tests.

**Dependencies:** 1 blocks 2 (needs frozen engine contract); 1b runs parallel to 1, both feed 2; 2 blocks 3 (coordinator needs a working store to gate); 3 blocks 4 (screens, including the lock gate they sit behind, can't exist before the lock/load lifecycle and scrim are real); 4 blocks 5 (lateral CRUD/screens build on the proven vertical slice and shared components); 5 blocks 6 (hardening needs full feature surface to harden); 6 is the terminal gate.

**Risk register:** engine-contract drift if task assignment pulls from a stale tech_specs round instead of the final one (mitigation: point explicitly at this round's shapes); coordinator bootstrap race if settings/document loads get parallelized for perceived launch speed (mitigation: the explicit ordering test in Milestone 3); the manualFallbackEstimate persistence bug reappearing through the store or the import path (mitigation: named tests in Milestones 2 and 5); five inconsistent empty states if screens fan out before shared components exist (mitigation: shared-UI sub-step at the start of Milestone 4); import/export or corrupted-storage recovery getting treated as low-priority admin work (mitigation: both are trust-critical exit criteria, not polish, per Milestones 3 and 5); biometric lock schedule risk (mitigation: pre-agreed cut trigger and consequence, both tied to Milestone 3, defined above, not decided mid-build); the lock scrim getting silently unscheduled or duplicated across milestones (mitigation: this round's fix — `AppLockScrim` explicitly owned by Milestone 3, built alongside the coordinator it depends on); UI lane outrunning the engine lane if parallelism gets overread (mitigation: the explicit boundary — only 1b-class plumbing starts early, `FinancialStore`/coordinator/UI wait for green tests).

**Verification plan:** automated — Milestone 1's fixture suite, Milestone 2's fallback-durability and two-part relaunch tests, Milestone 3's coordinator ordering/lock-boundary tests, Milestone 5's three named import/export tests, selective hero-card snapshot tests at default and AX5 Dynamic Type. Manual — app-lock foreground/backgrounding behavior and the scrim's no-leak check, app-switcher snapshot redaction, onboarding skip flows, import/export through the actual system share sheet, and hand-verifying one full scenario's math from raw entries through to the on-screen explanation. Final — the Milestone 6 acceptance-bar replay against the assembled app, with its own explicit pass/fail criteria, run after all five other milestones close.

## Implementation Readiness Gate

This round closed it. Codex fully committed to both proposals he'd floated — explicit `PlanningConfig` as a real engine parameter, and a concrete-blocker lock-cut trigger instead of an unmeasurable time estimate — and Claude came back with genuine engagement rather than a rubber stamp: she found supporting evidence neither had cited (T-001 already lists `PlanningConfig.swift` as its own Codable domain file, which only makes sense if the engine actually consumes it), and she added one useful refinement to each of Codex's fixes rather than just agreeing. On the engine signature, her addition is that locking the *shape* isn't enough — she went looking for the actual baseline percentile/worst-month number (p10? p20? minimum-of-trailing-6-months?) and couldn't find it pinned anywhere in nine phases of documents, so she wants that flagged explicitly as the one open number left, to be pulled from the full tech_specs record by whoever writes `PlanningEngine`, not invented in this room. On the lock-cut trigger, her addition is just tightening "jeopardizes Milestone 4" into something observable — specifically, lock work still blocking Onboarding/Dashboard from starting — rather than a vibe. Neither addition contradicts what Codex proposed; they complete it. Codex hasn't re-responded to these specific refinements, but they're additive clarifications in the direction he was already arguing, not counter-proposals, and Claude closed by saying she has nothing left to contest. Gemini never showed up across all three rounds.

CONSENSUS: YES

## Final Output

**Readiness verdict:** Not ready to build as originally assembled, but every gap found across three rounds has a concrete, locked fix. With the five repairs below folded into the record, the build can start without any lane inventing product, design, or architecture decisions.

**Cross-phase consistency check:** The core product story — one deterministic engine, monthly-facing UI over dated events, conservative (never-averaged) baseline, honest cold-start state, manual-only obligations and reserve, local-first persistence, import/export as the recovery path, no bank linking or hidden inference — is coherent end to end across prompt_contract through task_assignments. Two real contradictions and one unmeasurable decision rule were found between locked documents (not just phrasing preferences), all now resolved:

**Build blockers and fixes (all resolved):**
1. **Milestone 4 vs. onboarding vs. task graph.** `project_plan`'s Milestone 4 wording ("add income → add obligation → reserve → Dashboard") contradicted the locked onboarding screen inventory (no obligations step) and was literally impossible per the task graph (obligation CRUD's T-024 depends on T-023, which only builds onboarding+Dashboard). **Fix:** Milestone 4 is narrowed to proving first-run sparse-data viability only — income (add-or-skip), reserve-or-manual-fallback (add-or-skip), Dashboard, survives relaunch. Obligation-add is explicitly first proven in Milestone 5.
2. **No canonical home for the manual fallback estimate.** Scattered across feature list, project plan, and task assignments with no single owner. **Fix:** the insufficient-data Dashboard is the canonical place to create/edit `manualFallbackEstimate`, with a primary CTA and visible "user-provided, not computed" labeling. Onboarding never gates on it — if a user skips income entry, the skip confirmation carries one line of copy pointing at the Dashboard. No new screen, no new state; the four-surfaces-plus-lock-gate IA stays intact.
3. **"Past confidence-tier transitions" contradicted the no-persisted-derived-data rule.** This wording appeared in both `design_handoff` and, more importantly, verbatim in **T-025's own task title** in `task_assignments`. **Fix:** rewritten as historical periods with confidence tier reconstructed from raw records at view time — no transition-log storage. The correction must be applied to T-025's actual task text, not just the design doc, since that's what a build worker will read.
4. **`PlanningEngine.evaluate` signature conflict.** `ios_architecture_review` froze a 4-parameter signature (`income, obligations, reserve, asOf`); `tech_specs`' `recomputePlanningResult` implied a 4th+ parameter set including `PlanningConfig` and `manualFallbackEstimate`. Two documents both claiming "the locked signature" with different arities. **Fix, locked:** `PlanningEngine.evaluate` takes `income`, `obligations`, `reserve`, `manualFallbackEstimate`, `asOf`, and `config: PlanningConfig`, returning `PlanningResult` — this supersedes the 4-parameter version in `ios_architecture_review`. `recomputePlanningResult` is confirmed as a thin adapter only: it extracts records and the fallback estimate from `FinancialDocument` and passes them straight through with `asOf`/`config`. **One number remains genuinely unresolved and is named rather than invented here:** the exact baseline formula (which percentile, or which "worst realistic month" definition) has never been pinned to a specific value anywhere in this project's history — only described conceptually. Whoever implements `PlanningConfig`'s defaults (T-001/T-002) must pull that number from the full tech_specs record if it exists there, or make an explicit, documented, testable choice — not guess silently.
5. **Biometric-lock cut trigger was unmeasurable.** "If Milestone 3 overruns by roughly a third" had no baseline estimate anywhere to be a third over of. **Fix:** replaced with a concrete-blocker rule — lock stays in scope unless Milestone 3 hits an actual blocker in `LocalAuthentication` integration, root-phase gating that prevents reliable unlock-before-load behavior, or app-switcher privacy/redaction that can't ship truthfully, *and* that blocker is observably preventing Onboarding/Dashboard work (T-023) from starting. If triggered, the cut is a whole branch, confirmed already-locked language from `project_plan` Milestone 3: `AppLockScrim`, `.locked` root state, and the store-nil-while-locked tests are removed together — never a partial cut, never a toggle that does nothing. Snapshot redaction may remain standing only if honestly described as app-switcher privacy, never as a substitute for access control.

**Scope note (not a blocker, recorded for the record):** the redacted Share Card — repeatedly named across earlier phases as the app's actual growth mechanic — has zero tasks in the 29-task backlog. This build intentionally ships with no built-in growth mechanic. The guardrail against ever substituting a real-dashboard screenshot stands regardless.

**Final scope for build:** the 29-task backlog (T-000–T-036) from `task_assignments` stands as the build plan, with the five text corrections above applied to Milestone 4's description, the fallback-estimate CTA requirement, T-025's task text, T-001/T-002's engine signature, and Milestone 3's lock-cut trigger language before work starts.

**Acceptance criteria checklist for this gate:**
- [x] Build phase can start without inventing product/design/architecture decisions — five concrete repairs now written down, one open numeric item explicitly named rather than silently resolved.
- [x] Every major workflow has an acceptance criterion — carried forward unchanged from `task_assignments`, none weakened by these fixes.
- [x] Testing responsibilities are explicit — unchanged; `polish_resilience` still owns cross-cutting integrity tests including the Milestone 6 acceptance replay.
