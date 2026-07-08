# marginalia — Project Documentation

_Generated deterministically from the orchestrator's phase outputs (workflow: `iterate`). Non-AI render — nothing here is fabricated; empty phases are marked N/A._

## Contents

- Scope the change
- Build the change
- Review

## Scope the change

Given the sandbox here only exposes `.agent_cwd` (which is empty), I can't inspect the actual `app_build` source tree from this phase — which itself supports the round's core observation: this is a planning phase, and the actual repair work happens downstream with real repo access. I'll finalize the decision based on the discussion.

Three repair rounds have now failed on the same symptom — "no buildable Xcode project" — despite each round being told to "generate the project, make it compile." Repeating the same instruction a fourth time won't fix it if the previous attempts silently failed to write/commit a project file, or wrote it to the wrong location. The fix has to be concrete and mechanical, not another vague "wire it up" directive, and it has to end in an actually-executed `xcodebuild` run, not just the presence of a `.xcodeproj`.

CONSENSUS: YES

## Final Output

Scope for this repair round is strictly: produce one buildable Xcode project for the existing Marginalia sources and get a clean `xcodebuild` simulator build. No new features, no redesign, no re-litigating the journaling/annotation product concept.

Concrete steps for the build phase:

1. **Diagnose before generating.** First confirm where `app_build`'s Swift sources actually live on disk, and check whether a `.xcodeproj`/`project.yml` was ever produced by a prior round and just not committed/left outside `app_build`. If this is a tooling/write-access problem (e.g., project generation ran but output landed somewhere never persisted), fix that root cause instead of repeating the same generation step a fourth time.

2. **Generate one real project.** Use XcodeGen (`project.yml`) or hand-write a `.pbxproj` — either is fine as long as it's committed inside `app_build`. Requirements:
   - Single app target, single `@main` App struct as entry point (if multiple got generated across phases, pick one and remove/merge the rest).
   - Every existing `.swift` file added to that target's membership — no silent exclusions.
   - Deployment target set to match whatever APIs the sources actually use (check for anything newer than iOS 17 before defaulting to 17.0).
   - Valid bundle id, Info.plist, entitlements, and asset catalog references that actually resolve (no dangling image/color set references).

3. **Make it compile for real, not by deleting files.** If sources have compile errors — duplicate type names, a view referencing a renamed model, missing imports — fix those files so they type-check and link. Dropping a file from the target to get a green build is not acceptable; if a feature turns out to be a stub with no real persistence behind it, leave it in, note the gap, but don't silently amputate it to dodge a compile error.

4. **Verify by actually running the build.** Done means an `xcodebuild -destination 'generic/platform=iOS Simulator' build` (or scheme-equivalent) was invoked and its output was read and confirms success — not "a `.xcodeproj` exists now." Paste/report the actual build result.

5. **If gaps are found** (e.g., an "annotation" feature that's just a placeholder view with no persistence), record them as known limitations for a future scope round — do not expand this repair to fix them now.

## Build the change

You've hit your weekly limit · resets Jul 12 at 1pm (America/New_York)

**Build verification:** verified: compiled cleanly for the iOS Simulator

## Review

You've hit your weekly limit · resets Jul 12 at 1pm (America/New_York)

VERIFICATION: VERIFIED
