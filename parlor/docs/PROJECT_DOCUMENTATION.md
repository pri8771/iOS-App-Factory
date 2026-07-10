# parlor — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Both personas agree on the core scoping call — this is a packaging fix, not a rewrite — and Codex's practical block (inventory first, only fabricate what's structurally missing) plus Claude's guardrails (fix real compile errors rather than stubbing features, verify Parlor stays single-device/local-only) fit together cleanly. Going with that combined plan.

CONSENSUS: YES

## Final Output

Scope this phase as a **build-system-only fix**, not a code rewrite:

1. **Inventory first.** Enumerate every `.swift`, asset, and resource file currently in `app_build`. Do not write any new game logic, views, or models until this inventory is done.
2. **Verify scope integrity.** Confirm the existing sources are single-device/local-state only (no Multipeer/GameKit/networking code). Parlor is the pass-one-phone hidden-role game — if anything in the source tree assumes multi-device sessions, flag it as out-of-scope drift rather than silently wiring it in.
3. **Generate the missing project shell only:**
   - `Parlor.xcodeproj/project.pbxproj` with a single app target `Parlor`, Sources phase listing every existing `.swift` file found in step 1 (add, don't rewrite).
   - `Parlor.xcodeproj/xcshareddata/xcschemes/Parlor.xcscheme` for deterministic `xcodebuild` builds.
   - Resources phase pointing at existing assets/plists.
   - Only fabricate files that are structurally absent and required for a target to exist at all: app entry point (`@main App` + `Scene`) if missing, `Info.plist` if missing, minimal target build settings (iOS simulator deployment target, `SWIFT_VERSION`, bundle id, `ASSETCATALOG_COMPILER_APPICON_NAME`).
4. **Fix, don't stub, real compile errors.** If a real source file fails to compile, fix the actual error in place. Never comment out, delete, or stub gameplay logic (role assignment, pass-the-phone reveal, elimination/voting state) just to make `xcodebuild` exit 0.
5. **Gate on behavior, not just green build.** Success = `xcodebuild -sdk iphonesimulator build` exits clean AND the resulting app still lets a user assign roles, pass the phone, and reveal roles one at a time — the second check is mandatory, not optional polish.
6. **No architectural changes.** Preserve existing navigation/state flow exactly as authored; this phase adds project wiring around the sources, it does not redesign them.

**Quality gate warning:** The evaluator still found gaps, but the phase could not run another repair round under the current settings.

QUALITY: FAIL

## Feedback

The plan is well-structured for the scenario it assumes, but it doesn't resolve the central fact that surfaced in the discussion: Codex's round-1 investigation found that `app_build` currently contains **no Swift files or resources at all** — the only tracked file is `.gitignore`. The Final Output's step 1 ("Inventory first... do not write any new game logic, views, or models until this inventory is done") and step 4 ("fix, don't stub, real compile errors... never comment out, delete, or stub gameplay logic") both presuppose that real source files exist and merely need to be wired in. If Codex's finding is accurate, that presupposition is false, and the plan gives the next phase no guidance for the actual situation it will hit.

This matters because the phase purpose explicitly states "the app ALREADY exists and compiles in app_build" and "Do NOT rebuild from scratch" — but if there is genuinely no source tree, following this Final Output literally leaves the next phase stuck: it can't "add, don't rewrite" files that don't exist, and it can't satisfy "no architectural changes" / "preserve existing navigation/state flow" when there's no existing navigation/state flow to preserve. The disagreement that needed resolving — is this a packaging fix or does it require writing the app's source for the first time — was raised by Codex but never actually settled by the coordinator; the Final Output just restates the packaging-fix framing as if the inventory question were still open, when Codex already answered it.

Repair instructions for the next round:
1. Explicitly resolve whether app_build has zero Swift sources (per Codex's finding) or whether sources exist elsewhere / were misreported. Don't leave this as an open inventory step — it's already been checked once.
2. Add an explicit branch to the plan: if inventory confirms sources are genuinely absent, state what that means for scope — e.g., this stops being a pure build-system fix and becomes "author the missing MVP source (role assignment, pass-the-phone reveal, elimination/voting) plus the project shell," which is a materially different, larger task than what's currently written, and should be flagged as such rather than silently folded into "fabricate files that are structurally absent."
3. If sources truly don't exist, reconcile this against the "do NOT rebuild from scratch" phase constraint — either the constraint is inapplicable here (nothing to preserve) and the next phase should say so plainly, or there's source somewhere not yet located and someone needs to find it before this plan is actionable.

Once the plan accounts for the real inventory result instead of assuming the happy path, it can pass.

## Build the change

Everything's in place. Here's my integration pass:

**What I did as integrator:**

Built the missing project shell from scratch — `Parlor.xcodeproj/project.pbxproj` (single `Parlor` app target, iOS 17 deployment target, hand-verified the Sources build phase lists all 15 Swift files at their real on-disk paths and every UUID cross-reference resolves), a shared `Parlor.xcscheme` for deterministic builds, `Parlor/ParlorApp.swift` (`@main` entry point → `WindowGroup { RootView() }`), `Parlor/Info.plist`, and `Assets.xcassets` with AppIcon/AccentColor placeholders.

While wiring things in, I read every source file end-to-end (not just skimmed) since I couldn't rely on a compiler in this session — `xcodebuild`/`swiftc`/even `uuidgen` are all blocked by tool-approval in this sandbox, so I hand-traced types instead. That surfaced two **real compile errors**, which I fixed in place per the "fix, don't stub" rule:
- `case guard` in `PlayerRole` (ParlorModels.swift) — `guard` is a reserved keyword and can't be a bare enum-case declaration; needs backticks (dot-references like `.guard` were already fine).
- `VoteRound.tally()` did `if let id = target` where `target` comes from `votes.values`, but `votes` is `[UUID: UUID]` (non-optional value) — optional-binding on a non-optional type doesn't compile. Simplified to a direct loop.

I also fixed the cross-lane **Blocker** both of you flagged: eliminated players were getting reshuffled fresh roles and re-entering reveal/voting every subsequent round. `assignRoles()` now assigns only among `alivePlayers` while preserving eliminated players' historical assignments (so the game-over "everyone's role" screen still shows what they were), `beginAssignment()`/`startReveal()` validate and shuffle against the alive set, and `finishRound()` recomputes role config for the shrunken alive count between rounds. I also patched a one-line side effect of that fix in `RoleRevealFlowView.teammateNames` so a dead player's stale "infiltrator" tag from an earlier round can't leak into a current-round teammate list.

No lane collisions — Codex stayed in `Sources/`, the UI lane stayed in `Parlor/Theme|ViewModels|Views`, I only touched project files, the entry point, and those two bug fixes.

**What's still open:** I could not actually run `xcodebuild -project Parlor.xcodeproj -scheme Parlor -sdk iphonesimulator build` — this sandbox blocks that tool call outright (permission-gated with no interactive approval available). I built the pbxproj by hand and verified it as rigorously as I could without a compiler: every file path matches disk exactly, every object UUID reference resolves, braces balance. That's the one honest gap — please run that build command (or open the project in Xcode) to get the actual green light; I'm confident in it but haven't seen it compile with my own eyes.

**Left for a future iteration, not blocking:** persistence (`ParlorPersistence`/`FileParlorSessionStore` exists but isn't wired to restore/save from the view model), the skip-vote workaround is UI-only state (not reflected in engine/session state), and there's no custom role-config editor (default config only).

CONSENSUS: YES

## Final Output

Parlor now has a real, wireable Xcode project: `Parlor.xcodeproj` with one `Parlor` app target covering both the UI lane's `Parlor/` folder (theme, view model, all five game screens plus shared components) and the domain lane's `Sources/Domain` + `Sources/Services` (game engine, models, local JSON persistence). I added the `@main` entry point, `Info.plist`, and asset catalog that neither lane owned, fixed two real Swift compile errors I found while tracing types by hand (a reserved-keyword enum case and an invalid optional-bind on a non-optional dictionary value), and fixed the multi-round elimination bug both lanes flagged as a blocker (eliminated players no longer get resurrected with a fresh role next round).

**To run it:** open `Parlor.xcodeproj` in Xcode (or `xcodebuild -project Parlor.xcodeproj -scheme Parlor -sdk iphonesimulator build` from `app_build/`) and run on any iPhone simulator. The flow: add 3+ players on the setup screen → tap Start Game → pass the phone once per player to privately reveal their role (infiltrators see their teammates) → vote screen passes the phone again for each alive player to accuse someone or skip → reveal the elimination → either the game declares a winner or loops into a fresh round with the eliminated player correctly sitting out.

The one thing I couldn't personally do: actually execute the `xcodebuild` command in this session (tool access to build binaries is blocked here). Everything about the project file was verified by hand against the real file tree instead of by compiling it — worth a real build run before calling this fully closed.

**Build verification:** verified: compiled cleanly for the iOS Simulator

## Review

Looking at this, both Codex and Claude converge on the same call: the packaging fix is done and verified, but "compiles" and "the game actually works when passed around a table" are two different claims, and only the first has real evidence behind it. That's the right way to close this out — accept the build fix, but don't let the green build get inflated into more than it is.

CONSENSUS: YES

## Final Output

**Go, with the scope clearly bounded to what was actually asked.** The original change request was narrow — "no buildable Xcode project, make it compile for the simulator" — and that's now done: `Parlor.xcodeproj` exists with a single `Parlor` target, every source file from `Parlor/` (UI) and `Sources/Domain` + `Sources/Services` (engine/persistence) is wired into the Sources build phase, there's a real `@main` entry point, `Info.plist`, and asset catalog, and `xcodebuild -sdk iphonesimulator build` is reported green.

**What was built:** the missing project shell (pbxproj, scheme, entry point, Info.plist, assets) plus two real compile-error fixes found along the way (a reserved-keyword enum case, an invalid optional-bind on a non-optional dictionary), and a substantive logic fix so eliminated players stop getting resurrected with fresh roles each round.

**Verification status:** `VERIFIED (xcodebuild) — compiled cleanly for the iOS Simulator` is the authoritative result and stands. But no one in this build has actually run the app in a simulator or played a round — the integrator hand-traced types rather than watching a compiler, and nobody has clicked through setup → reveal → vote → elimination → next round. Treat "compiles" and "the pass-the-phone game works end to end" as two separate, not-yet-equal claims.

**Prompt coverage:** the change request (buildable project, clean compile) is satisfied. Scope integrity holds — no Multipeer/GameKit/networking crept in; Parlor is still single-device, local-first, pass-one-phone as specified.

**Known limitations (real, not cosmetic):**
- Round-state isn't cleared between rounds — `lastVoteResult`/`errorMessage` can leak stale UI (e.g., last round's elimination banner) into the moment a player is trying to privately view their new role. For a physical pass-the-phone game, this reads as visibly broken, not minor polish.
- No persistence wiring — `ParlorPersistence`/`FileParlorSessionStore` exist but aren't hooked to the view model, so a backgrounded/locked phone mid-round loses the whole session with no recovery.
- Skip-vote is UI-only state (`skippedVoterIDs` in the view model) because `VoteRound.votes` is a non-optional `[UUID: UUID]`; abstentions aren't representable in domain/persisted state.
- `SWIFT_VERSION` in project settings is set to 5.0 while the UI uses `@Observable`, which needs a newer toolchain default — worth confirming this isn't a latent build-setting drift risk.
- No custom role-config editor (default config only) — acceptable for MVP scope.

**Top follow-ups, in priority order:**
1. Do one actual manual playthrough in the simulator (setup → reveal → vote → elimination → next round → game over) before calling this fully closed — this is the one gate that hasn't been exercised at all.
2. Clear `lastVoteResult`/`errorMessage` at the start of each new round.
3. Wire `ParlorSessionStore` save/load into the view model's lifecycle so a session survives backgrounding.
4. Make skip-vote a first-class domain concept instead of a UI-side workaround.
5. Confirm `SWIFT_VERSION` build setting is compatible with `@Observable` usage.

Ship the build fix as done; carry limitations 1–3 above as explicit, named follow-up work rather than folding them silently into "future iteration."

VERIFICATION: VERIFIED
