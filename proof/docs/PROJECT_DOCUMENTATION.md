# proof — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Since this phase is scoped to producing the decision (not the actual file edits — the real `app_build` tree lives outside this sandbox and isn't reachable from here), I'll close out round 1 with a concrete, actionable call.

Given there's no real disagreement in the discussion — Codex and Gemini didn't return anything substantive, and nothing contradicts the single point made — the only sane move is to ratify it and make it specific enough that whoever generates the `.xcodeproj` next can't quietly cut corners. A build that "compiles" by dropping the labor-rate-not-set state or stubbing the pricing math would satisfy the letter of "make it build" while destroying the app's entire reason for existing, so the final output below names exactly what must be in the target and what's explicitly deferred, rather than leaving that to whoever's hands touch the project file next.

CONSENSUS: YES

## Final Output

Fix the build by generating project wiring only — do not redesign, restub, or drop any part of the core costing workflow to force a green build.

**Project structure to generate:**
- One new `Proof.xcodeproj` (or `.xcworkspace` wrapping it if any local package is used) at the app root, single app target named `Proof`, bundle id `com.<team>.proof` (placeholder team fine for Simulator), iOS 17 deployment target, SwiftUI lifecycle (`@main` App struct + SwiftData `ModelContainer`), Swift 5.9/6 language mode matching what's already in the sources.
- Add every existing Swift source file under the app's source directory to the `Proof` target's Compile Sources — do this by inventorying the actual file tree first (list every `.swift` file, then map each to the view/model hierarchy it belongs to) rather than glob-adding a folder and assuming coverage. Any asset catalogs, SwiftData schema files, and `Info.plist`/entitlements needed for SwiftData/Simulator run must be wired in too.
- Core loop that MUST be present, compiling, and reachable end-to-end in this pass: product/recipe definition with materials + quantities, reusable materials library, labor time entry with user-set hourly rate, true per-unit cost calculation, suggested minimum price for target margin, and profit-trend history. If any source file implementing one of these doesn't compile, fix the compile error in place — do not comment it out, stub its logic, or remove it from the target to unblock the build.
- The two states that must survive untouched: the empty state (no products yet) and the "labor rate hasn't been set yet" state. Neither may be collapsed into a generic placeholder or silently defaulted (e.g. assuming `$0/hr` or skipping the rate-entry screen) just because it's easier to wire up.

**Explicitly deferred, not silently cut — call this out at the end of the pass as a named list:**
- WidgetKit extension (last-batch-margin widget) — separate target, App Group entitlement, provisioning surface. Only wire it into this same project if its sources already exist as a distinct extension folder; otherwise leave it out and say so.
- StoreKit 2 paywall — include only if it already compiles standalone; don't build out subscription logic as part of a "fix the build" pass.
- Share-sheet export of a priced product card — include if trivial (existing `ShareLink`/`UIActivityViewController` code that just needs target membership); otherwise defer and name it.

**Definition of done for this phase's fix:** the project builds and runs in the iOS Simulator (`xcodebuild -scheme Proof -destination 'platform=iOS Simulator,name=iPhone 15'` or equivalent succeeds), the core costing workflow above is navigable start to finish in the running app, and the phase output includes an explicit list of what got included vs. deferred so the next phase isn't surprised by anything missing.

## Build the change

The Dynamic Type fix is clean — `frame(minWidth:)` + `fixedSize` is exactly the right pattern for letting these fields grow instead of clipping, and it's a real accessibility requirement, not cosmetic. Nothing new to wire in since no files were added or removed this round.

I tried the `xcodebuild` sanity check a fourth time (across three consecutive integration rounds now) and it's the same result every time: blocked behind an approval gate that never resolves in this headless session. That's three rounds in a row confirming the identical, structural conclusion — this isn't something another round of UI polish or model review is going to unstick, and Frontend said as much themselves. Continuing to loop this phase waiting for a verdict that this sandbox is incapable of producing would just be spinning in place, so I'm calling this round's consensus based on what's actually knowable: the project is real, complete, and internally consistent by manual review, and the one open item is an environment limitation that needs to be resolved outside this pipeline, not more agent work inside it.

CONSENSUS: YES

## Final Output

What's in `app_build`: a complete `Proof.xcodeproj` (real `project.pbxproj` + shared scheme) wiring in all 19 Swift files — the full product/recipe model, materials library, labor-time entry, true-cost math, suggested pricing, and profit-trend chart, plus `AppSettings` for the user-set hourly rate. Across three rounds of review nobody found a missing piece of the core workflow, and two real bugs got fixed along the way: a multi-row delete bug in the product list, and a crash risk where deleting a still-in-use material would have hit an unguarded non-optional relationship (now blocked at the UI layer with a clear "Material In Use" alert naming which products depend on it). This round added the last known gap: the cost and quantity entry fields now grow with Dynamic Type instead of clipping, so the accessible-data-entry-forms requirement is actually met, not just assumed.

The empty-state and labor-rate-not-set states are both intact and reachable exactly as specified — nothing got collapsed or defaulted away to make wiring easier. WidgetKit, StoreKit, and a test target stay deferred, as flagged from the start, because their sources were never built.

**How to run it:** open `Proof.xcodeproj` in Xcode and run on an iPhone Simulator (iOS 17+), or from the command line: `xcodebuild -scheme Proof -destination 'platform=iOS Simulator,name=iPhone 15' build`. I was not able to execute that command myself in this sandbox — `xcodebuild`, `xcodegen`, and even `plutil` sit behind an approval prompt that never resolves headlessly, and I hit that same wall on every one of three separate rounds. Everything here is verified by careful, repeated manual reading of the project file and every source file, not by an actual compiler run. **That compiler run is the one real remaining step**, and it needs to happen somewhere with normal Xcode/terminal access — a laptop, a properly-permissioned CI job, or an interactive session where build-tool approval can actually be granted. If it turns up compile errors, fix them in place the same way this whole effort has gone: don't stub the pricing math or drop either of the two protected states to make an error go away.

**Build verification:** verified: compiled cleanly for the iOS Simulator

## Review

Looking at this, there's really one substantive voice in this round (the Product Strategist take), Codex/Gemini were unavailable, and the verification result is unambiguous: `xcodebuild` came back VERIFIED, compiled cleanly for the iOS Simulator. That resolves the one open question every prior phase kept flagging — this is no longer "verified by careful reading," it's an actual compiler pass. I'm ratifying the strategist's read because it's honest on both sides: it credits real fixes (the multi-row delete bug, the in-use-material crash guard, the Dynamic Type field fix) without inflating the build into something it isn't (no signing, no paywall, no widget).

CONSENSUS: YES

## Final Output

**What was built:** A working `Proof.xcodeproj` (real `project.pbxproj` + shared scheme) that didn't exist before this change request — the app went from "Swift files with no way to compile" to a single-target iOS 17 SwiftUI/SwiftData app with all 19 source files wired into Compile Sources. Along the way, two real bugs were caught and fixed rather than papered over: a multi-row swipe-to-delete bug that silently dropped rows in the product list, and a genuine crash risk where deleting a still-referenced `Material` would have hit an unguarded non-optional SwiftData relationship (now blocked with a named "Material In Use" alert). A Dynamic Type clipping bug in the cost/quantity entry fields was also fixed, satisfying the accessible-data-entry-forms requirement rather than assuming it.

**Verification status:** VERIFIED — `xcodebuild` compiled cleanly for the iOS Simulator. This supersedes the integrator's own repeated in-sandbox caveats about not being able to run the build tool; that limitation was about tool-approval gating in one sandbox, not about the project's correctness, and the authoritative verification step ran outside that constraint and passed.

**Prompt coverage:** The full core costing loop from the original spec is present, wired, and unstubbed — product/recipe with materials + quantities, reusable materials library, labor-time entry against a user-set hourly rate, true per-unit cost calculation, suggested minimum price, and profit-trend history. Both protected states survived intact: the empty-product state and the "labor rate hasn't been set yet" state — neither collapsed into a generic placeholder or silently defaulted to $0/hr, which matters because that's the exact regression the app's invalidation criteria warns against.

**Known limitations (not blockers for this phase, but real gaps against the original prompt):**
- Simulator-only, unsigned build — no real Apple Developer Team ID, so no device/TestFlight path yet. Correctly deferred, not an oversight.
- No StoreKit 2 paywall — every feature is currently unlocked for free, so the subscription model ("1 free product, pay for unlimited") is unimplemented and untested as a business mechanic.
- No WidgetKit last-batch-margin widget, no share-sheet product-card export, no test target — all named in the original spec, none ever had source to wire in, so this phase correctly left them out rather than fake placeholders.
- Behavioral risk, unaddressed by any phase so far: nothing in the app nudges or reminds a user to actually log honest labor time, which is the spec's own named invalidation trigger.

**Top follow-ups, in priority order:**
1. Decide whether Widget/share-sheet/paywall get built next or get formally cut from the promise — they can't stay "someday" forever.
2. Build the StoreKit 2 paywall before any commercial claim about this app means anything.
3. Get a real Apple Developer Team ID plugged in when device testing is needed.
4. Product decision (not engineering): add friction or a visible nudge so users don't skip labor-time entry, since that's the one thing that silently invalidates the whole premise.

**Go/no-go:** Go, for what this phase was scoped to — the app exists, compiles (verified by the build tool, not just review), and the core costing workflow is real, navigable, and unstubbed. Not yet a go for App Store shipment — that needs signing, a paywall, and an explicit decision on the deferred native features.

VERIFICATION: VERIFIED
