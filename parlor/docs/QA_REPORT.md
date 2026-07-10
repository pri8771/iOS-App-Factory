# parlor — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

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
## Build Verification

VERIFIED (compiled cleanly for the iOS Simulator)
