# curio — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

CONSENSUS: YES

Same story as every phase before this one — Codex and Gemini still can't join headlessly, so it's one voice carrying the round again. But that voice delivered everything this phase actually asked for (screen inventory, a real primary flow, per-screen state models, visual direction, accessibility notes) and, notably, caught its own biggest risk and resolved it rather than leaving it hanging for a debate partner who isn't showing up.

The headline call: the home screen *is* the museum, not a dashboard with a row of buttons labeled "shop/upgrades/prestige." Opening the app shows your actual wings — donated ones gleaming in the gallery, your active wing mid-curation with visible gaps — and small badges (returned expeditions, uncatalogued specimens) sit on top of that scene rather than replacing it with a menu. Everything in a session happens by moving through that one continuous space; there's no tab bar, and "going back" just means leaving the room you're in.

Screen inventory landed on ten screens: Museum Overview (hub), Expedition Desk (dispatch + timers + Patron upsell shown as a visible-but-locked second slot), Intake Tray (queue + a fullness meter so the cap/overflow rule from earlier phases is visible, not silent), a Cataloging sheet (one specimen at a time, tap-to-guess with gentle correction), the Wing Interior (three visually distinct rooms for the three puzzle types, sharing one tap-select/tap-place mechanic but reading as genuinely different spaces, with the matching rule permanently on-screen as a plaque), a Donate Wing confirmation (before/after preview, since it's irreversible), the Gallery (read-only payoff screen), a chrome-free Showcase/Share view, the Patron Store (benefits shown as previews, not bullet points — the exclusive region rendered as a dim silhouette behind glass), and Settings. Onboarding isn't a separate walled-off flow — it's an overlay on top of the real Overview and a real Wing Interior, so a first-time action looks identical to a day-30 action.

The state model got worked out screen-by-screen rather than left generic: real empty/loading/success/error states for each, with a couple of deliberate reinterpretations — the Intake Tray's "error" state is actually the overflow-refund message (treated as this screen's edge case, not a toast), and a broken set on the Wing Interior is called out as its own designed state rather than folded into "success." The Museum Overview also gets an honest error state for a snapshot that fails to decode, instead of silently starting a fresh museum and pretending nothing happened.

Visual direction: brass/glass/old-wood under warm light, museum-label typography for specimen cards vs. clean system font for functional UI (so Dynamic Type doesn't fight the aesthetic), and — this is the one I'd flag as a genuinely good move — the non-color-matching requirement gets treated as a design asset rather than a compliance checkbox: every specimen carries a distinct glyph as its primary signal, with color as a wash behind it, so colorblind and sighted players are reading the same information.

The one real tension raised was raised and closed by the same voice: a freeform pannable-canvas museum map would be gorgeous but is a real risk against the hard VoiceOver requirement (custom spatial layouts are brutal to make screen-reader-navigable in a sane order). The resolution: build the Overview as a vertically scrolling list of illustrated wing cards (List-based, fully linear VoiceOver order) instead of a true free-pan map — keeping the "you're looking at your museum" feeling while keeping accessibility trivial rather than aspirational. That's accepted now, not left as an open question for architecture to stumble into.

No disagreement surfaced because there's only one participant, and nothing here contradicts any locked decision from the prior five phases (per-wing prestige, three wing types, non-destructive placement, Patron scope, no drag-and-drop). The cross-batch uniqueness caveat is unchanged and still just a carried-forward assumption, not something this phase touches.

## Final Output

**Screen inventory:**
1. **Museum Overview** (hub/home) — vertically scrolling list of illustrated wing cards (not a freeform pan map), showing active wing(s) mid-curation and a glimpse of the donated gallery; small overlay badges for returned expeditions / uncatalogued specimens.
2. **Expedition Desk** — destination cards with cost/duration, live countdown timers, second slot visible-but-locked for free users with a Patron upsell showing actual content behind it.
3. **Intake Tray** — queue of returned/uncatalogued specimens with a tray-fullness meter.
4. **Cataloging sheet** — one specimen at a time: image, tap-to-guess category with gentle correction, hands off into wing placement.
5. **Wing Interior** — three visually distinct room shells (adjacency grid, row-based, rarity-threshold), sharing one tap-select/tap-place mechanic, with the wing's matching rule permanently visible as an on-screen plaque.
6. **Donate Wing confirmation** — before/after preview of what locks and what bonus is granted (irreversible action, treated with weight).
7. **Gallery** — read-only, browsable donated wings.
8. **Showcase/Share view** — chrome-free single-wing render for screenshotting.
9. **Patron Store** — three benefits shown as real previews (exclusive region as a dim silhouette behind glass), not a bullet list.
10. **Settings** — restore purchases, accessibility toggles, export/import if retained.

Onboarding is an overlay sequence layered on the real Overview + a real Wing Interior, not a separate tutorial flow.

**Primary user flow:** Launch → Museum Overview (see what's glowing) → Expedition Desk (redispatch) → Intake Tray (catalog waiting specimens) → routed into the relevant Wing Interior for placement → multiplier plaque updates live on set completion → exit. No tab bar; navigating "back" is leaving the room.

**State model per screen:**
- *Museum Overview:* empty (first-launch bare room with one highlighted action), loading (snapshot decode), success (populated), error (save failed to decode — explicit message, never a silent fresh-start).
- *Expedition Desk:* empty (no destinations unlocked), loading (dispatch in flight), success (running timers / ready-to-collect), error (insufficient currency or full slots, each with a stated reason, never just a grayed-out button).
- *Intake Tray:* empty, loading, success (queue), and its overflow-refund message treated explicitly as this screen's error/edge state with a reassuring, persistent surface (not a toast).
- *Cataloging:* empty (queue cleared), loading, success; no invented failure state.
- *Wing Interior:* empty (freshly opened, rule plaque prominent), loading, success (partial/full), and a broken-set state (visible multiplier-drop) treated as its own designed state, not folded into success.
- *Gallery:* empty (no donations yet) and success only.
- *Patron Store:* loading (StoreKit fetch), success, error (StoreKit/network failure during purchase), plus the locked restore-mismatch message ("your Patron benefits are restored; your museum only lives on this device").

**Visual direction:** Brass, glass, old wood under warm directional light — a real cabinet of curiosities, not flat vector-icon mobile-game chrome. Museum-label serif/typewriter-adjacent display face for specimen labels; clean system font for functional UI so Dynamic Type doesn't fight the aesthetic. Every specimen carries a distinct pictographic glyph as its primary category/rarity signal, with color as an accent wash behind it — not a compliance afterthought but a real design element.

**Accessibility notes:**
- Museum Overview is built as a linear scrolling list of wing cards specifically because a freeform pannable map would be materially harder to make VoiceOver-navigable in a sane reading order — this trade is accepted now, not deferred.
- Reduced motion changes *how* the set-completion moment animates (a static highlight-and-settle instead of camera-push/flourish) but never removes the multiplier-plaque content change or its distinct sound — reduced motion ≠ reduced information.
- Color is never the sole signal anywhere in the UI; glyph/icon/label is the source of truth, color is decorative.
- All placement interaction uses the tap-select/tap-place primitive already locked as the only input method, so the Wing Interior is VoiceOver-operable by construction, not by a bolted-on alternate path.

## Design Handoff

CONSENSUS: YES

Same pattern as every phase in this thread — Codex and Gemini couldn't join headlessly, so it's one voice again — but that voice used the round to do the actual job of a design handoff: it took every visual adjective from the design-discussion phase ("brass, glass, old wood") and forced it into something a SwiftUI engineer could type without inventing anything, while also nailing down architecture-adjacent details (state ownership, navigation model, timer rendering pattern) that the design-discussion phase had left implicit.

The big calls: one `@Observable GameStore` owns all persisted state and every screen writes through explicit methods, so multiplier recompute lives in exactly one place. Navigation is a single `NavigationStack` with a typed path plus three sheet-presented screens (Cataloging, Patron Store, Settings); nav/path state is deliberately never persisted, so a force-quit mid-sheet just drops you back at Overview with the specimen still safely in the intake queue — one clean source of truth instead of a "was I mid-navigation" edge case. The Overview list of wing cards gets sharpened so it can't quietly become a menu: each card renders a live miniature of that wing's actual slot grid, not a generic illustration, so a donated wing visibly looks finished and an in-progress one visibly looks gap-toothed. Expedition countdowns are pinned to `TimelineView(.periodic)` scoped to just the timer text, both for performance and so the display math and the correctness math (elapsed time clamped to ≥0) are literally the same code path. The Wing Interior's tap-select/tap-place primitive is described concretely enough that VoiceOver support falls out of using plain `Button`s with descriptive labels rather than needing a bolted-on accessibility layer, and the rarity-threshold wing's scoring gets explicitly flagged for a real check against the reskin-demotion gate from the prior phase rather than assumed safe.

The one thing that genuinely needed resolving and got resolved head-on: "brass, glass, old wood under warm light" was never given an art pipeline anywhere in five phases of discussion, and handed over as-is it would silently demand either bespoke illustration or a photographic-texture pipeline nobody scoped. The fix locked in here is procedural — layered gradients and shadow stacking for material feel, SF Symbols as specimen glyphs (varied by weight/scale for rarity) with a category color wash behind them, light Canvas-drawn grain for texture — buildable by one engineer with zero external asset dependency. Design tokens, spacing/corner-radius scales, typography rules, and motion durations are all specified as concrete values, not adjectives.

On the Claude Design question specifically: the recommendation is an explicit no-external-design decision for the app's UI itself, on the grounds that every decision that would normally need a mockup pass is already pinned down enough to build from directly, and routing it through an external tool risks losing the accessibility/state-model constraints in translation. A narrower, separate Claude Design prompt is offered for App Store marketing screenshots only, explicitly out of the critical path.

Nothing here contradicts any locked decision from the prior six phases, and no disagreement exists because there's still only one participant — the same structural gap (no way to verify cross-batch uniqueness from within this thread) carries forward unchanged and untouched by this phase.

## Final Output

**Architecture skeleton governing the handoff:**
- One `@Observable` `GameStore` (environment-injected) owns all persisted state (currency, wings, specimens, expeditions, prestige history, Patron entitlement); screens read slices and write only through explicit methods (`dispatchExpedition`, `catalogSpecimen`, `placeSpecimen`, `donateWing`) so multiplier recomputation has a single implementation.
- Navigation: one `NavigationStack` with a typed path enum (`.wingInterior(id)`, `.donateConfirm(id)`, `.gallery`, `.showcase(id)`); Cataloging, Patron Store, and Settings are sheets, not pushed destinations, because they're interruptible tasks rather than "places in the museum."
- Navigation/path state is transient `@State`, never persisted — only the game model is saved, so a kill mid-sheet always resolves cleanly back to Overview on relaunch.

**Screen-by-screen specification (10 screens + onboarding overlay):**
1. **Museum Overview** — vertical list of `WingSummaryCard`s, each rendering a real live `WingMiniGrid` (actual filled/empty slots at small scale, not generic art) plus a badge cluster (returned-expedition count, uncatalogued count). First-launch empty state: one highlighted "dispatch your first expedition" wing, others shown locked with a one-line unlock condition. Error state (decode failure) replaces the whole scroll view with a centered message and exactly one action, never a silent fresh start.
2. **Expedition Desk** — destination cards with cost/duration; countdowns via `TimelineView(.periodic)` scoped to just the timer text (never a view-wide `Timer.publish`), computed from stored absolute dates clamped to ≥0. Second slot for free users is a real card under a `LockedContentOverlay`, tappable straight into the Patron Store. Disabled actions carry an explicit `disabledReason` string, never a bare greyed-out button.
3. **Intake Tray** — vertical list of `SpecimenChip`s with a fullness meter (capsule bar + numeric text, never color-only). Overflow-refund state is a persistent, explicitly-dismissed banner (`PersistentBanner`), not an auto-vanishing toast.
4. **Cataloging sheet** — one specimen at a time, full-bleed, 3-5 tap-to-guess category buttons, gentle no-penalty correction, hands off into the correct Wing Interior pre-selected. Deliberately not batched.
5. **Wing Interior** — shared tap-select/tap-place primitive (real `Button`s, so VoiceOver works structurally) across three visually distinct shells: adjacency grid (`LazyVGrid`), row-based shelves (independent per-row scoring), rarity-threshold tiered cases (scoring by weighted value in a tier — flagged for the reskin-demotion check against grid/adjacency logic). Rule plaque pinned non-dismissible at top; broken-set multiplier drop renders on that same plaque instantly, no recompute delay.
6. **Donate Wing confirmation** — full sheet (not `.alert`, to avoid accidental dismissal) with before/after preview and a destructive-toned confirm.
7. **Gallery** — read-only reuse of the Wing Interior render component with interaction disabled and a "donated" plaque state.
8. **Showcase/Share view** — same render component again, all chrome stripped, plus a share-sheet trigger.
9. **Patron Store** — three benefit cards; the exclusive region reuses the real `SpecimenCard` component under a frosted blur rather than marketing copy. Skeleton loading state, persistent banners (not transient alerts) for purchase errors and the restore-mismatch message.
10. **Settings** — plain grouped list: restore purchases, accessibility passthroughs, export/import if retained, about/version.
- **Onboarding**: overlay scrim + sequential pointer callouts on the real Overview and real first Wing Interior, gated by a persisted `hasCompletedOnboarding` flag so it can't re-trigger after a reload.

**Design tokens:** semantic color tokens only (`.curioBrass` ~`#B8860B`, `.curioWalnut` ~`#3E2B23`, `.curioParchment` ~`#F0E6D2`, `.curioGlass` translucent `#E8F0F5` + blur, `.curioInk` ~`#1C1810`) — never hardcoded hex at call sites. Spacing scale 4/8/12/16/24/32/48; corner radii 8/12/20. Typography: system serif (New York) via `relativeTo:` text styles for specimen labels/plaques, SF for all functional UI, no fixed point sizes anywhere. Motion: 150ms micro-interactions, 300ms standard transitions, ~600ms reserved for set-completion only, with `accessibilityReduceMotion` swapping the flourish for an instant highlight-and-settle while preserving the content change and sound.

**Component inventory:** `WingSummaryCard`, `WingMiniGrid` (shared, 3 layout variants), `ExpeditionDestinationCard`, `CountdownText`, `SpecimenChip`, `SpecimenCard`, `CatalogGuessButton`, `WingRulePlaque`, `MultiplierBadge`, `SlotButton`, `LockedContentOverlay`, `PersistentBanner`, `EmptyStateView`, `ErrorStateView`.

**Visual/material approach (resolves the missing-art-pipeline gap):** premium feel comes from procedural SwiftUI — layered gradients and shadow stacking for brass/wood card chrome, SF Symbols (varied weight/scale by rarity) as specimen glyphs with a category-tinted wash, optional light `Canvas`-drawn grain — zero bespoke illustration or external asset dependency required.

**Accessibility requirements:** all placement interaction is real `Button` activation (no custom gestures), giving VoiceOver support by construction; color is never a sole signal anywhere; reduced motion changes animation style only, never removes content or sound; Overview is a linear list specifically to keep VoiceOver reading order sane (accepted trade from the prior phase, carried through).

**Claude Design decision:** explicit **no-external-design** decision for the app's UI — the handoff is concrete enough to build directly from, and routing through an external design tool risks losing accessibility/state-model constraints in translation. A narrowly-scoped, separate Claude Design prompt is available if later needed for App Store marketing screenshots only (not UI), explicitly outside this build's critical path.

**Carried-forward note:** cross-batch/sibling-idle-game distinctness remains unverifiable from within this thread — unchanged, still a program-level responsibility.

## Ios Architecture Review

CONSENSUS: YES

Same shape as every phase before it — Codex and Gemini still can't get into this headless session, so it's one voice carrying the round again. But that voice used the space to turn every remaining "we said this was handled" phrase from prior phases into something an engineer could actually implement without guessing, which is exactly what this phase exists to force before tech_specs locks things in.

The core of it: persistence stops being "a versioned Codable snapshot" as a slogan and becomes a named mechanism — a `MuseumSnapshot: Codable` struct with `schemaVersion: Int`, stored in Application Support (not Documents, since it's not user-browsable), written via temp-file-then-`replaceItemAt` for real atomicity, saved on a debounced timer plus unconditionally on `scenePhase` backgrounding since that's the actual crash-risk window. One sharp, specific call: this file should stay included in the normal iCloud device backup (not excluded as disposable cache), because that's a zero-cost partial mitigation for the "no recovery path if you lose your phone" gap that's been sitting unresolved since detailed_discussion — and it's exactly the kind of thing an engineer would accidentally exclude without being told not to.

The numeric engine gets scoped as its own tested subsystem — a hand-rolled mantissa/exponent BigNumber, Foundation-only, no third-party big-num dependency needed (clean fit with the permissive-dependency requirement) — with the real risk named as normalization bugs at the edges (mantissa drifting to zero/NaN, exponent overflow), not the happy path. The vague "cross-checked against a last-known-good timestamp" clock-jump rule from three phases back finally gets an actual five-line algorithm instead of a description of a feeling. And the single highest-leverage architectural rule in the whole review: `GameStore` and everything it owns must be framework-agnostic Swift that never imports SwiftUI, specifically so the acceptance-critical tests (offline-progress epsilon matching, the two-valid-layout-per-wing gate, atomic-write crash recovery, clock-clamping) can run as fast plain XCTest rather than needing simulator-bound UI tests — if that boundary blurs even once, "verified" quietly becomes "looked right once."

Permissions/privacy came back appropriately minimal and with explicit guardrails against scope creep: only notification permission (contextual, only if the should-have return-ping survives triage) and the IAP capability are needed; no Background Modes, no widget/Live Activity, both flagged as things an engineer might reach for reflexively for an idle game but shouldn't here. A `PrivacyInfo.xcprivacy` manifest is called out as a concrete required line item even for a zero-network app, since Apple requires it regardless. StoreKit gets a specific implementation path (StoreKit 2, `Transaction.currentEntitlements` + `Transaction.updates`, no server-side validation, tested against a local `.storekit` config with the restore-on-fresh-install path actually exercised, not just skipped).

Testing implications go beyond restating the acceptance criteria — they turn each one into a concrete test shape: adversarial unit tests for BigNumber boundaries, a parametrized test literally encoding the two-non-identical-valid-layout wing requirement, a fault-injection test for atomic-write recovery (write a truncated temp file, assert graceful load), and an honest caveat that XCUITest can carry a smoke path but doesn't actually validate VoiceOver announcement behavior — that still needs a manual Accessibility Inspector pass, stated plainly rather than implied to be covered.

No disagreement exists because there's only one participant, and nothing here contradicts any locked decision from the prior seven phases — if anything it closes several previously-acknowledged gaps (recovery-path mitigation, clock-jump algorithm, testability boundary) that earlier phases named but didn't resolve. The named risk is self-directed, not a fork to argue over: this hand-rolled-everything approach (persistence, BigNumber, framework-agnostic core) is more upfront engineering than reaching for SwiftData/Decimal, and it's flagged as where the MVP's engineering budget should go first, ahead of visual polish, rather than something to shortcut under time pressure.

## Final Output

**SwiftUI architecture recommendation:** Extend the design_handoff's `@Observable GameStore` with a hard rule: the store and everything it owns (wing scoring engines, numeric type, persistence controller, offline-progress calculator) is framework-agnostic Swift that imports Foundation only, never SwiftUI. This is what makes the acceptance-critical logic (offline-progress epsilon matching, wing-layout validity gate, atomic-write recovery, clock-jump clamping) testable as fast XCTest unit tests rather than requiring simulator-bound UI tests. If any of that logic ends up computed inline in a view body, the acceptance gates become effectively unverifiable.

**Apple framework choices:** Foundation only for core logic (no SwiftData, no Core Data — both wrong-shaped for a single flat versioned snapshot on a solo-engineer MVP timeline); `FileManager` for atomic persistence; StoreKit 2 (`Transaction.currentEntitlements`, `Transaction.updates` listener task) for the Patron subscription; `TimelineView(.periodic)` for countdown rendering (carried from design_handoff); XCTest for unit/logic tests, XCUITest for one smoke path, Accessibility Inspector for manual VoiceOver verification (not substitutable by XCUITest).

**Persistence and local data plan:** `MuseumSnapshot: Codable` with `schemaVersion: Int`, stored in `FileManager.applicationSupportDirectory`. Writes go to a temp file then `replaceItemAt` for true atomicity. Save triggers: debounced (~1-2s) on every mutating action, plus unconditional on `scenePhase` transitioning to `.background`/`.inactive`. The snapshot file stays included in standard iCloud device backup (explicitly not excluded as cache) as a zero-cost partial mitigation for the no-cloud-recovery gap named in detailed_discussion.

**Permissions/privacy plan:** Notification permission requested contextually (only if local expedition-return notifications survive triage), never as a cold-launch blast. No Background Modes / BGTaskScheduler capability — expedition timers are recomputed from stored absolute dates on foreground, nothing needs to run in the background. No widget/Live Activity in this build (real added complexity via App Group + second target, stays a post-launch should-have at most). IAP capability required for Patron. A `PrivacyInfo.xcprivacy` manifest is required and named explicitly as a line item, declaring required-reason API usage (e.g. UserDefaults) even though the app has no network calls or accounts.

**Dependency/license decision:** Zero third-party dependencies. Numeric engine is a hand-rolled `BigNumber` (Double mantissa + Int exponent, normalized, Codable, Comparable) rather than a third-party big-number package — fully consistent with, and more conservative than, the permissive-dependency policy since nothing external is pulled in at all.

**Testing implications:** Unit tests for BigNumber adversarial boundaries (near-zero mantissa, NaN, exponent overflow, repeated tiny-multiplier chains); unit tests for offline-progress epsilon matching at 1-minute/6-hour/7-day gaps; a parametrized unit test encoding the two-non-identical-valid-layout-per-wing acceptance gate as an automated regression check, not a one-time design review; a fault-injection test for atomic-write crash recovery (corrupt/truncate a temp file, assert last-good-snapshot load); a five-line, directly testable clock-jump clamp function (`if Date() < lastKnownGoodDate`, treat elapsed as zero for that tick; always persist `lastKnownGoodDate = max(Date(), lastKnownGoodDate)`); one XCUITest smoke path for dispatch → catalog → place → multiplier-change; and an explicit note that VoiceOver announcement correctness requires a manual Accessibility Inspector pass, since XCUITest doesn't reliably validate it.

**Named engineering-priority risk:** This plan (hand-rolled persistence, hand-rolled BigNumber, framework-agnostic core) costs more upfront engineering time than defaulting to SwiftData/Decimal. That cost is accepted deliberately and should be front-loaded in the build — if schedule pressure hits later, this is where quality must not be quietly shortcut, consistent with the "production-ready wins over feature breadth" rule locked in the prompt contract.

**Carried-forward note:** Cross-batch/sibling-idle-game distinctness remains unverifiable from within this thread — unchanged, still a program-level responsibility.

## Tech Specs

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Project Plan

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Implementation Readiness Gate

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
